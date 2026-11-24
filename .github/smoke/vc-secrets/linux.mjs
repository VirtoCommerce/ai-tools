// linux.mjs -- Linux smoke test of the vc-secrets gpg backend against a real gpg and a real gpg-agent. CI runs it
// (.github/workflows/vc-secrets-os-smoke.yml):
//
//     node .github/smoke/vc-secrets/linux.mjs
//
// A developer can run it too with --local. Unlike the other two smokes it touches nothing of theirs: gpg runs in a
// throwaway GNUPGHOME with a key made for the run, and the store is a temp dir. It imports the plugin from this
// checkout and changes nothing under it.
// What it adds to the unit suite, which puts a stub `gpg` on PATH: that the write the lib builds (encrypt to a
// per-process `<name>.<pid>.tmp` sibling, chmod, rename) works with the real tool, that two processes writing one
// entry do not collide, and that the absent / unreadable distinctions hold on a real file system. Values are
// synthetic and never printed -- only lengths and booleans. Exit code = number of FAILs (2 = refused to run).

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Before anything is imported. Two conditions, kept the same as the other smokes': a machine that is thrown away
// (CI), or a caller who said so.
{
    const missing = [];
    if (process.platform !== "linux") {
        missing.push(`Linux (process.platform is "${process.platform}")`);
    }
    if (process.env.GITHUB_ACTIONS !== "true" && !process.argv.includes("--local")) {
        missing.push("a CI runner (GITHUB_ACTIONS=true) or the --local flag");
    }
    if (missing.length > 0) {
        console.error(`linux.mjs refuses to run: it needs ${missing.join(" and ")}`);
        process.exit(2);
    }
}

// The plugin of the checkout this script sits in: .github/smoke/vc-secrets/ is three levels below the repo root.
// A smoke that imported a copy would test the copy.
const libUrl = new URL("../../../plugins/vc-secrets/vc-secrets.mjs", import.meta.url).href;
const lib = await import(libUrl);
const { writeSecretValue, deleteEntryIo, makeSecretResolver, keyToPath, secretsDir } = lib;

// ---------------------------------------------------------------------------------------------------------------
// Run identity and isolation
// ---------------------------------------------------------------------------------------------------------------
const SCOPE = `vcs-smoke-${crypto.randomBytes(4).toString("hex")}`;   // [a-z0-9-], as a key's scope has to be
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-smoke-"));
const GNUPGHOME = path.join(TMP, "gnupg");
// gpg-agent binds unix sockets inside GNUPGHOME, and a socket path is limited to about 100 bytes. Under a long
// $TMPDIR the agent fails to start with an error that names neither the path nor the limit, so say it here.
if (path.join(GNUPGHOME, "S.gpg-agent.browser").length > 100) {
    fs.rmSync(TMP, { recursive: true, force: true });
    console.error(`linux.mjs refuses to run: ${GNUPGHOME} is too long for gpg-agent's unix sockets (limit about 100 bytes); point TMPDIR at a shorter directory`);
    process.exit(2);
}
const STORE = path.join(TMP, "store");   // XDG_CONFIG_HOME of the env the lib is handed
const key = (name) => `vc-secrets:${SCOPE}:${name}`;

// gpg and gpg-agent find their home through the process environment, and runTool spawns with process.env: the
// throwaway home has to be set here, not only in the `env` the lib is handed. Set once, before any gpg runs.
process.env.GNUPGHOME = GNUPGHOME;
fs.mkdirSync(GNUPGHOME, { mode: 0o700 });
fs.mkdirSync(STORE, { recursive: true });

// What the lib is handed as `env`: the real environment minus every selector that would redirect the backend or
// the recipient, with the store pointed at the temp dir (keyToPath reads XDG_CONFIG_HOME, else HOME) and the
// backend forced to gpg. The recipient is left unset, so the lib's own `--default-recipient-self` picks the run's key.
const ENV = {
    ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith("VC_SECRETS_"))),
    XDG_CONFIG_HOME: STORE,
    VC_SECRETS_LOCAL_BACKEND: "gpg",
};
const resolver = makeSecretResolver({ projectId: SCOPE }, ENV);
const read = (name) => resolver(name, { backend: "local", scope: "project" });   // the launch's own read path
const write = (name, value) => writeSecretValue(key(name), value, { backend: "gpg", env: ENV });
const entryFile = (name) => keyToPath(key(name), ENV);
const tmpSiblings = (name) => fs.readdirSync(path.dirname(entryFile(name))).filter((f) => f.endsWith(".tmp"));

// The commit under test: what the workflow checked out, or, on a developer's machine, the checkout's own HEAD.
function commitUnderTest() {
    if (process.env.GITHUB_SHA) {
        return process.env.GITHUB_SHA.slice(0, 12);
    }
    try {
        const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", cwd: path.dirname(fileURLToPath(import.meta.url)) });
        const sha = r.status === 0 ? r.stdout.trim() : "";

        return sha === "" ? "unknown" : sha;
    } catch {
        return "unknown";
    }
}

// Deterministic ASCII of exactly n bytes. The tag leads the value and the rest varies with position, so values made
// with different tags differ, and truncation or reordering shows up in an equality. Its source is also handed to
// the writer processes of L2, which must generate the same values the parent expects.
function synthetic(n, tag) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = `${tag}:`;
    for (let i = out.length; i < n; i += 1) {
        out += alphabet[(i * 7 + i % 5) % alphabet.length];
    }

    return out.slice(0, n);
}

function expect(cond, message) {
    if (!cond) {
        throw new Error(message);
    }
}

const run = (cmd, args) => spawnSync(cmd, args, { encoding: "utf8", env: process.env });

// ---------------------------------------------------------------------------------------------------------------
// Check runner
// ---------------------------------------------------------------------------------------------------------------
class Skip extends Error {}
const results = [];
async function check(id, title, fn) {
    let status = "PASS";
    let detail;
    try {
        detail = await fn();
    } catch (e) {
        if (e instanceof Skip) {
            status = "SKIP";
            detail = e.message;
        } else {
            status = "FAIL";
            detail = e?.message ?? String(e);
        }
    }
    results.push({ id, title, status, detail });
    console.log(`${status} ${id} ${title} -- ${detail}`);
}

let setUp = false;
const needSetUp = () => {
    if (!setUp) {
        throw new Skip("no throwaway gpg key (see SETUP)");
    }
};

// L2's writers: separate node processes, each importing the lib and writing distinct values to one entry
// back-to-back. They print READY once the lib is loaded and start on a line from the parent, so the two overlap
// from their first write rather than one finishing before the other has started.
const WRITERS = 2;
const WRITES_EACH = 25;
const WRITER_SOURCE = `
import fs from "node:fs";
import { writeSecretValue } from ${JSON.stringify(libUrl)};
${synthetic.toString()}
const id = process.env.SMOKE_ID;
const count = Number(process.env.SMOKE_COUNT);
const key = process.env.SMOKE_KEY;
const env = { XDG_CONFIG_HOME: process.env.SMOKE_STORE, VC_SECRETS_LOCAL_BACKEND: "gpg" };
process.stdin.setEncoding("utf8");
fs.writeSync(1, "READY\\n");
await new Promise((resolve) => process.stdin.once("data", resolve));
let ok = 0;
const failures = [];
const spans = [];
const now = () => performance.timeOrigin + performance.now();
for (let i = 0; i < count; i += 1) {
    const began = now();
    try {
        await writeSecretValue(key, id + "-" + String(i).padStart(2, "0") + "-" + synthetic(300, "l2"), { backend: "gpg", env });
        ok += 1;
    } catch (e) {
        failures.push(String(e.message).slice(0, 200));
    }
    spans.push([began, now()]);
}
fs.writeSync(1, JSON.stringify({ ok, failures, spans }) + "\\n");
process.exit(0);
`;
const writerValue = (id, i) => `${id}-${String(i).padStart(2, "0")}-${synthetic(300, "l2")}`;

function startWriter(id, k, script) {
    const child = spawn(process.execPath, [script], {
        env: { ...process.env, SMOKE_ID: id, SMOKE_COUNT: String(WRITES_EACH), SMOKE_KEY: k, SMOKE_STORE: STORE },
        stdio: ["pipe", "pipe", "pipe"] });
    writers.push(child);
    let stdout = "";
    let stderr = "";
    let onReady;
    let onFail;
    let announced = false;
    const ready = new Promise((resolve, reject) => { onReady = resolve; onFail = reject; });
    ready.catch(() => {});
    child.stdin.on("error", () => {});
    child.stdout.setEncoding("utf8").on("data", (d) => {
        stdout += d;
        if (!announced && stdout.includes("READY")) {
            announced = true;
            onReady();
        }
    });
    child.stderr.setEncoding("utf8").on("data", (d) => { stderr += d; });
    const done = new Promise((resolve) => {
        child.on("error", (e) => { onFail(e); resolve({ code: -1, report: null, stderr: e.message }); });
        child.on("close", (code) => {
            if (!announced) {
                onFail(new Error(`writer ${id} exited ${code} before it was ready: ${stderr.trim().slice(0, 300)}`));
            }
            let report = null;
            try {
                report = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
            } catch { /* judged by the caller */ }
            resolve({ code, report, stderr });
        });
    });

    return { ready, done, go: () => child.stdin.write("go\n") };
}
const writers = [];

async function main() {
    // ---- header ---------------------------------------------------------------------------------------------
    const header = [];
    const say = (line) => { header.push(line); console.log(line); };
    const gpgVersion = run("gpg", ["--version"]);
    say(`node ${process.version} on ${os.type()} ${os.release()}, uid ${process.getuid?.() ?? "?"}`);
    say(`gpg: ${gpgVersion.status === 0 ? gpgVersion.stdout.split("\n")[0] : "not available"}`);
    say(`commit under test: ${commitUnderTest()}`);
    say(`run scope: ${SCOPE}   GNUPGHOME: ${GNUPGHOME}   store: ${STORE}`);
    console.log("");
    summaryHeader = header;

    // ---- SETUP ----------------------------------------------------------------------------------------------
    // The only gpg call the script makes for itself: the lib's own calls are left exactly as it builds them.
    await check("SETUP", "A throwaway gpg key in a throwaway GNUPGHOME", () => {
        const uid = `${SCOPE}@example.invalid`;
        const gen = run("gpg", ["--batch", "--passphrase", "", "--pinentry-mode", "loopback", "--quick-gen-key", uid, "default", "default", "never"]);
        expect(gen.status === 0, `gpg --quick-gen-key exited ${gen.status}: ${String(gen.stderr).trim().slice(0, 300)}`);
        const list = run("gpg", ["--batch", "--list-secret-keys", "--with-colons"]);
        const secretKeys = String(list.stdout).split("\n").filter((l) => l.startsWith("sec:")).length;
        expect(list.status === 0 && secretKeys === 1, `expected exactly one secret key in the throwaway home, found ${secretKeys}`);
        setUp = true;

        return `one passphrase-less secret key (${uid}) in ${GNUPGHOME}; the lib's default-recipient-self resolves to it`;
    });

    // ---- L1 -------------------------------------------------------------------------------------------------
    await check("L1", "Round trip through the lib's gpg write and read, trailing newline kept", async () => {
        needSetUp();
        const big = synthetic(8000, "l1-big");
        const newline = `${synthetic(500, "l1-nl")}\n`;
        const doubleNewline = `${synthetic(100, "l1-nl2")}\n\n`;
        for (const [name, value] of [["l1-big", big], ["l1-nl", newline], ["l1-nl2", doubleNewline]]) {
            await write(name, value);
            const file = entryFile(name);
            const blob = fs.readFileSync(file);
            expect(blob.length > 0 && !blob.includes(Buffer.from(value.slice(0, 64))), `${name}: the entry file is empty or holds the plaintext`);
            const mode = fs.statSync(file).mode & 0o777;
            expect(mode === 0o600, `${name}: the entry file mode is ${mode.toString(8)}, expected 600`);
            const back = await read(name);
            expect(back === value, `${name}: ${Buffer.byteLength(value)} bytes written, a different value of ${Buffer.byteLength(back)} bytes read back`);
            expect(tmpSiblings(name).length === 0, `${name}: a tmp file was left behind`);
        }
        const dirMode = fs.statSync(path.dirname(entryFile("l1-big"))).mode & 0o777;
        expect(dirMode === 0o700, `the scope directory mode is ${dirMode.toString(8)}, expected 700`);

        return `${Buffer.byteLength(big)}-byte, ${Buffer.byteLength(newline)}-byte (one trailing newline) and ${Buffer.byteLength(doubleNewline)}-byte (two) values read back equal; entry files mode 600, scope directory 700, no plaintext in the file, no tmp left`;
    });

    // ---- L2 -------------------------------------------------------------------------------------------------
    await check("L2", `${WRITERS} processes write one entry concurrently, ${WRITES_EACH} writes each`, async () => {
        needSetUp();
        const name = "l2-shared";
        const k = key(name);
        await write(name, synthetic(100, "l2-seed"));
        const script = path.join(TMP, "l2-writer.mjs");
        fs.writeFileSync(script, WRITER_SOURCE);
        const ids = Array.from({ length: WRITERS }, (_, i) => `w${i + 1}`);
        const procs = ids.map((id) => startWriter(id, k, script));
        await Promise.all(procs.map((p) => p.ready));
        const started = Date.now();
        procs.forEach((p) => p.go());
        const reports = await Promise.all(procs.map((p) => p.done));
        const elapsedMs = Date.now() - started;
        reports.forEach((r, i) => {
            expect(r.report !== null, `writer ${ids[i]} reported nothing (exit ${r.code}): ${r.stderr.trim().slice(0, 300)}`);
            expect(r.report.failures.length === 0 && r.report.ok === WRITES_EACH,
                `writer ${ids[i]}: ${r.report.ok} of ${WRITES_EACH} writes succeeded; failures: ${r.report.failures.slice(0, 3).join(" | ")}`);
        });
        const written = new Set(ids.flatMap((id) => Array.from({ length: WRITES_EACH }, (_, i) => writerValue(id, i))));
        const final = await read(name);
        expect(written.has(final), `the final file decrypts to a value no writer wrote (${Buffer.byteLength(final)} bytes)`);
        expect(tmpSiblings(name).length === 0, `tmp files remain: ${tmpSiblings(name).join(", ")}`);
        // Two writers that ran one after the other prove nothing about a shared tmp path, so a green result needs
        // evidence that writes of different processes were in flight at the same moment: the number of pairs of
        // writes, one from each process, whose time spans intersect. None is a SKIP, never a PASS.
        const [first, second] = reports.map((r) => r.report.spans);
        const overlapping = first.reduce((sum, a) => sum + second.filter((b) => a[0] < b[1] && b[0] < a[1]).length, 0);
        if (overlapping === 0) {
            throw new Skip(`no overlap observed: no write of one process was in flight during a write of the other (${WRITERS * WRITES_EACH} writes, none failed), so a collision on the tmp path could not have shown`);
        }

        return `${WRITERS * WRITES_EACH} writes from ${WRITERS} processes in ${elapsedMs} ms, none failed; ${overlapping} pairs of writes, one from each process, were in flight at the same time; the final file decrypts to one of the ${written.size} written values; no *.tmp sibling remains`;
    });

    // ---- L3 -------------------------------------------------------------------------------------------------
    await check("L3", "Delete through deleteEntryIo; a second delete -> toolExitCode 3", async () => {
        needSetUp();
        await write("l3-delete", synthetic(120, "l3"));
        expect(fs.existsSync(entryFile("l3-delete")), "precondition: the entry file is not there");
        const remove = deleteEntryIo("gpg", ENV);
        await remove(key("l3-delete"));
        expect(!fs.existsSync(entryFile("l3-delete")), "the file is still there after the delete");
        let second = null;
        try {
            await remove(key("l3-delete"));
        } catch (e) {
            second = e;
        }
        expect(second !== null, "a second delete resolved instead of rejecting");
        expect(second.toolExitCode === 3, `a second delete rejected with toolExitCode ${second.toolExitCode}: ${second.message}`);

        return "the first delete removed the file; the second rejected with toolExitCode 3";
    });

    await check("L3b", "A path through a regular file (ENOTDIR) is absent, not an error", async () => {
        needSetUp();
        // The scope's directory is a regular file, so the entry's path runs through a file. No lib edit is needed to
        // produce it: the layout is secretsDir/<scope>/<name>.gpg and the script owns the temp store.
        const scope = `${SCOPE}-file`;
        const k = `vc-secrets:${scope}:l3-enotdir`;
        fs.mkdirSync(secretsDir(ENV), { recursive: true });
        fs.writeFileSync(path.join(secretsDir(ENV), scope), "not a directory");
        expect(keyToPath(k, ENV).startsWith(path.join(secretsDir(ENV), scope) + path.sep), "the entry's path does not run through the regular file");
        let probeCode = null;
        try {
            fs.statSync(keyToPath(k, ENV));
        } catch (e) {
            probeCode = e.code;
        }
        expect(probeCode === "ENOTDIR", `the file system answered ${probeCode} for the path, not ENOTDIR, so this does not exercise that case`);
        let readError = null;
        try {
            await makeSecretResolver({ projectId: scope }, ENV)("l3-enotdir", { backend: "local", scope: "project" });
        } catch (e) {
            readError = e;
        }
        expect(readError !== null && /not set/.test(readError.message) && !/could not be examined/.test(readError.message),
            `the read was not reported as a plain absent entry: ${readError?.message.slice(0, 200) ?? "it resolved"}`);
        let error = null;
        try {
            await deleteEntryIo("gpg", ENV)(k);
        } catch (e) {
            error = e;
        }
        expect(error !== null, "the delete resolved instead of rejecting");
        expect(error.toolExitCode === 3, `the delete rejected with toolExitCode ${error.toolExitCode}: ${error.message}`);

        return "stat answers ENOTDIR; a read says 'not set' rather than 'could not be examined'; the delete rejects with toolExitCode 3 (absent), not a could-not-remove error";
    });

    // ---- L4 -------------------------------------------------------------------------------------------------
    await check("L4", "An unreadable entry is an error that names it, never 'absent'", async () => {
        needSetUp();
        if (process.getuid?.() === 0) {
            throw new Skip("running as root, which reads a mode 000 file anyway");
        }
        const name = "l4-unreadable";
        const value = synthetic(80, "l4");
        await write(name, value);
        const file = entryFile(name);
        const dir = path.dirname(file);
        const outcomes = [];
        const rejection = async () => {
            try {
                await read(name);
            } catch (e) {
                return e;
            }

            return null;
        };
        try {
            // The file itself: stat still works, so the lib proceeds to gpg, which cannot open it.
            fs.chmodSync(file, 0o000);
            const onFile = await rejection();
            expect(onFile !== null, "the read of a mode 000 file resolved");
            expect(!/not set/.test(onFile.message), `the read of a mode 000 file was reported as absent: ${onFile.message.slice(0, 200)}`);
            expect(onFile.message.includes(name), `the error does not name the entry: ${onFile.message.slice(0, 200)}`);
            outcomes.push("file mode 000 -> error naming the entry, not 'not set'");
            fs.chmodSync(file, 0o600);

            // The directory above it: the lib cannot even stat the entry, which is the case it must not read as absent.
            fs.chmodSync(dir, 0o000);
            const onDir = await rejection();
            expect(onDir !== null, "the read through a mode 000 directory resolved");
            expect(!/not set/.test(onDir.message), `the read through a mode 000 directory was reported as absent: ${onDir.message.slice(0, 200)}`);
            expect(onDir.message.includes(key(name)), `the error does not name the entry: ${onDir.message.slice(0, 200)}`);
            outcomes.push("directory mode 000 -> 'could not be examined' naming the key, not 'not set'");
        } finally {
            fs.chmodSync(dir, 0o700);
            fs.chmodSync(file, 0o600);
        }
        expect(await read(name) === value, "the entry did not read back as the value written once the modes were restored");

        return `${outcomes.join("; ")}; both read back normally once restored`;
    });
}

// ---------------------------------------------------------------------------------------------------------------
// Cleanup and exit
// ---------------------------------------------------------------------------------------------------------------
let cleaned = false;
async function cleanup() {
    if (cleaned) {
        return;
    }
    cleaned = true;
    for (const child of writers) {
        try {
            child.kill();
        } catch { /* already gone */ }
    }
    // The agent first: it holds sockets and the key material in the throwaway home.
    const kill = run("gpgconf", ["--kill", "gpg-agent"]);
    const agentStopped = kill.status === 0;
    // A test that died with a mode 000 directory would make the removal below fail on a permission, not a defect.
    try {
        spawnSync("chmod", ["-R", "u+rwx", TMP]);
    } catch { /* the removal reports what is left */ }
    let tmpRemoved = true;
    try {
        fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (e) {
        tmpRemoved = false;
        console.log(`could not remove the temp dir ${TMP}: ${e.code ?? e.message}`);
    }
    const left = fs.existsSync(TMP);
    const ok = agentStopped && tmpRemoved && !left;
    const detail = `gpgconf --kill gpg-agent ${agentStopped ? "ok" : `exited ${kill.status}`}; GNUPGHOME and the store dir ${tmpRemoved && !left ? "removed" : "NOT removed"}`;
    results.push({ id: "CLEAN", title: "Cleanup", status: ok ? "PASS" : "FAIL", detail });
    console.log(`${ok ? "PASS" : "FAIL"} CLEAN Cleanup -- ${detail}`);
}

// The same table, as markdown, on the run's summary page. Details are HTML-escaped so that nothing in a message is
// read as a tag.
let summaryHeader = [];
function writeStepSummary(fails, passes, skips) {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (!file) {
        return;
    }
    const cell = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const lines = [
        "### vc-secrets smoke on Linux",
        "",
        ...summaryHeader.map((l) => `- ${cell(l)}`),
        "",
        "| Status | Check | Result |",
        "|---|---|---|",
        ...results.map((r) => `| ${r.status} | ${r.id} ${cell(r.title)} | ${cell(String(r.detail).slice(0, 700))} |`),
        "",
        `**${passes} PASS, ${fails} FAIL, ${skips} SKIP**`,
        "",
    ];
    try {
        fs.appendFileSync(file, lines.join("\n"));
    } catch (e) {
        console.log(`could not write the step summary: ${e.code ?? e.message}`);
    }
}

process.once("SIGINT", async () => {
    console.error("\ninterrupted -- cleaning up");
    await cleanup();
    process.exit(130);
});

try {
    await main();
} catch (e) {
    results.push({ id: "HARNESS", title: "Harness", status: "FAIL", detail: e?.stack ?? String(e) });
    console.log(`FAIL HARNESS Harness -- ${e?.message ?? e}`);
} finally {
    await cleanup();
}

console.log("\nSummary");
console.log("-------");
for (const r of results) {
    console.log(`${r.status.padEnd(4)}  ${r.id.padEnd(7)} ${r.title}`);
}
const fails = results.filter((r) => r.status === "FAIL").length;
const passes = results.filter((r) => r.status === "PASS").length;
const skips = results.filter((r) => r.status === "SKIP").length;
console.log(`\n${passes} PASS, ${fails} FAIL, ${skips} SKIP   (exit code = ${fails})`);
writeStepSummary(fails, passes, skips);
process.exitCode = fails;
setTimeout(() => process.exit(fails), 3000).unref();   // a stray handle must not hold a CI step
