// macos.mjs -- macOS smoke test of the vc-secrets Keychain backend against the real `security` tool and a real
// keychain. CI runs it (.github/workflows/vc-secrets-os-smoke.yml):
//
//     node .github/smoke/vc-secrets/macos.mjs
//
// A developer on a Mac can run it too, knowingly, with --local: it writes to the real default keychain under a
// throwaway prefix. It imports the plugin from this checkout and changes nothing under it.
// What it adds to the unit suite, which fakes `security`: that the write the lib composes for `security -i` is
// accepted by the real tool at the size limit the lib claims, that an oversize value is refused BEFORE anything is
// stored, and that the real "not found" exit code is the one the lib maps. Every key carries one random per-run
// scope, `vc-secrets:vcs-smoke-<hex>:<name>`. Values are synthetic and never printed -- only lengths and a
// hash prefix. Exit code = number of FAILs (2 = refused to run).

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Before anything is imported. Two conditions, because the script writes into the caller's keychain: CI is a
// machine that is thrown away; anywhere else the caller has to say so.
{
    const missing = [];
    if (process.platform !== "darwin") {
        missing.push(`macOS (process.platform is "${process.platform}")`);
    }
    if (process.env.GITHUB_ACTIONS !== "true" && !process.argv.includes("--local")) {
        missing.push("a CI runner (GITHUB_ACTIONS=true) or the --local flag, because it writes to the real keychain under a throwaway vc-secrets:vcs-smoke-<hex> prefix");
    }
    if (missing.length > 0) {
        console.error(`macos.mjs refuses to run: it needs ${missing.join(" and ")}`);
        process.exit(2);
    }
}

// The plugin of the checkout this script sits in: .github/smoke/vc-secrets/ is three levels below the repo root.
// A smoke that imported a copy would test the copy.
const lib = await import(new URL("../../../plugins/vc-secrets/vc-secrets.mjs", import.meta.url).href);
const { writeSecretValue, deleteEntryIo, buildLocalRead, buildLocalWrite, SECURITY_LINE_LIMIT, VcSecretsError } = lib;

// ---------------------------------------------------------------------------------------------------------------
// Run identity and isolation
// ---------------------------------------------------------------------------------------------------------------
const SCOPE = `vcs-smoke-${crypto.randomBytes(4).toString("hex")}`;   // [a-z0-9-], as a key's scope has to be
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-smoke-"));
const key = (name) => `vc-secrets:${SCOPE}:${name}`;
const createdKeys = new Set();   // registered before the write, so a write that half-succeeds is still cleaned up

// What the lib is handed as `env`: the real environment minus the selector that would redirect the backend. The
// calls below name the backend, but a stray VC_SECRETS_* variable has no business in a smoke.
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.toUpperCase().startsWith("VC_SECRETS_")));

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
// with different tags differ, and truncation or reordering shows up in an equality. No quote and no backslash, so
// the bytes `security -i` receives are the bytes of the value.
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

const sha12 = (text) => crypto.createHash("sha256").update(text).digest("hex").slice(0, 12);

// ---------------------------------------------------------------------------------------------------------------
// `security`, driven directly: the ground truth the scenarios compare the lib's behaviour against
// ---------------------------------------------------------------------------------------------------------------
const sec = (args) => spawnSync("security", args, { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });

function must(r, what) {
    if (r.error || r.status !== 0) {
        throw new Error(`security ${what} failed: ${r.error?.message ?? `exit ${r.status}: ${String(r.stderr).trim().slice(0, 200)}`}`);
    }

    return r;
}

// The account the lib addresses `security` with. keychainAccount() is not exported, so it is read off the read
// command the lib builds: read, write and delete have to agree on it, or an entry is written where it cannot be read.
const ACCOUNT = (() => {
    const { args } = buildLocalRead("keychain", key("account-probe"), ENV);
    const account = args[args.indexOf("-a") + 1];
    if (typeof account !== "string" || account === "" || account.startsWith("-")) {
        throw new Error(`could not read the account off the lib's read command: ${JSON.stringify(args)}`);
    }

    return account;
})();

// The value `security` stores for the entry, or the exit code. Compared by the caller; never printed.
function findValue(k) {
    const r = sec(["find-generic-password", "-a", ACCOUNT, "-s", k, "-w"]);

    return { status: r.status, value: r.status === 0 ? r.stdout.replace(/\n$/, "") : null };
}

// The largest value that fits on the one command line `security -i` is handed for THIS key and account, found from
// the line the lib itself composes (not from a copy of its format) and then confirmed at both edges.
function limitFor(k) {
    const spec = buildLocalWrite("keychain", k, ENV, { value: "x" });
    const overhead = Buffer.byteLength(spec.stdinCommand("x")) - 1;
    const max = SECURITY_LINE_LIMIT - overhead;
    expect(Buffer.byteLength(spec.stdinCommand("x".repeat(max))) === SECURITY_LINE_LIMIT, "the computed maximum does not fill the line limit exactly");
    let overLimitRefused = false;
    try {
        spec.stdinCommand("x".repeat(max + 1));
    } catch {
        overLimitRefused = true;
    }
    expect(overLimitRefused, "the lib composed a line over its own limit for a value one byte past the computed maximum");

    return { max, line: SECURITY_LINE_LIMIT };
}

async function keychainWrite(k, value) {
    createdKeys.add(k);
    await writeSecretValue(k, value, { backend: "keychain", env: ENV });
}

// ---------------------------------------------------------------------------------------------------------------
// Keychain availability. A hosted runner's login keychain is normally there and unlocked. When it is not, a CI run
// gets a keychain of its own: created, unlocked, searched first and made the default, then taken out again.
// ---------------------------------------------------------------------------------------------------------------
const parseKeychains = (text) => [...String(text).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
let tempKeychain = null;   // { path, prevDefault, prevList }, set before the first step so cleanup sees a half-made one
let keychainUsed = "the default keychain";

function setUpTempKeychain() {
    // The password is random, lives for this run only and guards a keychain that is deleted at the end; passing it
    // in argv is `security`'s only form for it.
    const password = crypto.randomBytes(16).toString("hex");
    const file = path.join(TMP, `${SCOPE}.keychain-db`);
    tempKeychain = {
        path: file,
        prevDefault: parseKeychains(sec(["default-keychain", "-d", "user"]).stdout)[0] ?? null,
        prevList: parseKeychains(sec(["list-keychains", "-d", "user"]).stdout),
    };
    must(sec(["create-keychain", "-p", password, file]), "create-keychain");
    must(sec(["set-keychain-settings", "-t", "21600", file]), "set-keychain-settings");   // no lock for the length of the run
    must(sec(["unlock-keychain", "-p", password, file]), "unlock-keychain");
    must(sec(["list-keychains", "-d", "user", "-s", file, ...tempKeychain.prevList]), "list-keychains -s");
    must(sec(["default-keychain", "-d", "user", "-s", file]), "default-keychain -s");
}

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

let keychainUsable = false;
const needKeychain = () => {
    if (!keychainUsable) {
        throw new Skip("no usable keychain (see KC)");
    }
};

const SMALL_BYTES = 190;

async function main() {
    // ---- header ---------------------------------------------------------------------------------------------
    const header = [];
    const say = (line) => { header.push(line); console.log(line); };
    const swVers = spawnSync("sw_vers", ["-productVersion"], { encoding: "utf8" });
    say(`node ${process.version} on macOS ${swVers.status === 0 ? swVers.stdout.trim() : "?"} (${os.release()}, ${os.arch()})`);
    say(`commit under test: ${commitUnderTest()}`);
    say(`run scope: ${SCOPE}   account the lib uses: ${ACCOUNT}   temp dir: ${TMP}`);
    say(`default keychain before the run: ${parseKeychains(sec(["default-keychain", "-d", "user"]).stdout)[0] ?? "none"}`);
    console.log("");
    summaryHeader = header;

    // ---- KC -------------------------------------------------------------------------------------------------
    await check("KC", "A keychain the lib can write to and read back", async () => {
        const probe = key("kc-probe");
        const value = synthetic(40, "kc");
        const attempt = async () => {
            await keychainWrite(probe, value);
            const found = findValue(probe);
            expect(found.status === 0 && found.value === value, `the probe entry did not read back equal (find exit ${found.status})`);
        };
        let first = null;
        try {
            await attempt();
        } catch (e) {
            first = e;
        }
        if (first !== null) {
            // The login keychain is locked or absent, or refuses this process: give the run one of its own, once.
            // Only on a runner. Changing the default keychain and the search list is a change to a developer's
            // session that a crashed run could leave behind, so a --local run reports the failure and stops.
            if (process.env.GITHUB_ACTIONS !== "true") {
                throw new Error(`the first write failed (${first.message}); no temporary keychain is made on --local, so the default keychain and the search list were left alone`);
            }
            try {
                setUpTempKeychain();
                await attempt();
            } catch (e) {
                throw new Error(`the first write failed (${first.message}) and so did the retry on a temporary keychain (${e.message})`);
            }
            keychainUsed = `a temporary keychain (${path.basename(tempKeychain.path)}), because the first write failed: ${first.message.slice(0, 200)}`;
        } else {
            keychainUsed = `the default keychain (${parseKeychains(sec(["default-keychain", "-d", "user"]).stdout)[0] ?? "path unknown"})`;
        }
        keychainUsable = true;
        summaryHeader.push(`keychain used: ${keychainUsed}`);

        return `keychain used: ${keychainUsed}`;
    });

    // ---- M1 -------------------------------------------------------------------------------------------------
    await check("M1", "security -i write, read back through security find-generic-password -w", async () => {
        needKeychain();
        const parts = [];
        const largeKey = key("m1-large");
        const { max, line } = limitFor(largeKey);
        for (const [name, bytes] of [["m1-small", SMALL_BYTES], ["m1-large", max]]) {
            const k = key(name);
            const value = synthetic(bytes, name);
            expect(Buffer.byteLength(value) === bytes, `the synthetic value is ${Buffer.byteLength(value)} bytes, not ${bytes}`);
            await keychainWrite(k, value);
            const found = findValue(k);
            expect(found.status === 0, `security find-generic-password exited ${found.status} for the entry just written`);
            expect(Buffer.byteLength(found.value) === bytes, `${bytes} bytes written, ${Buffer.byteLength(found.value)} bytes read back`);
            expect(sha12(found.value) === sha12(value), `${bytes} bytes written, a different value read back (sha256 ${sha12(found.value)} against ${sha12(value)})`);
            expect(found.value === value, `${bytes}-byte value differs from what was written`);
            parts.push(`${bytes} bytes stored and read back equal (sha256 ${sha12(value)}...)`);
        }

        return `${parts.join("; ")}; the larger is the most that fits the ${line}-byte line for this account and key`;
    });

    // ---- M2 -------------------------------------------------------------------------------------------------
    await check("M2", "A value one byte past the limit is refused, and nothing is stored", async () => {
        needKeychain();
        const k = key("m2-over");
        const { max } = limitFor(k);
        const value = synthetic(max + 1, "m2");
        createdKeys.add(k);
        let error = null;
        try {
            await writeSecretValue(k, value, { backend: "keychain", env: ENV });
        } catch (e) {
            error = e;
        }
        expect(error !== null, `a ${max + 1}-byte value was accepted`);
        expect(error instanceof VcSecretsError && /value too large for the keychain/.test(error.message), `refused with something other than the line-limit error: ${error.message}`);
        const found = findValue(k);
        expect(found.status === 44, `security find-generic-password exited ${found.status} for the refused entry, expected 44 (not found)`);

        return `${max + 1}-byte value refused with the lib's line-limit error; find-generic-password for the key exits 44, so nothing was stored`;
    });

    // ---- M3 -------------------------------------------------------------------------------------------------
    await check("M3", "Delete through deleteEntryIo; a second delete -> toolExitCode 3", async () => {
        needKeychain();
        const k = key("m3-delete");
        await keychainWrite(k, synthetic(60, "m3"));
        expect(findValue(k).status === 0, "precondition: the entry is not there to delete");
        const remove = deleteEntryIo("keychain", ENV);
        await remove(k);
        const afterFirst = findValue(k);
        expect(afterFirst.status === 44, `the entry is still there after the delete (find exit ${afterFirst.status})`);
        let second = null;
        try {
            await remove(k);
        } catch (e) {
            second = e;
        }
        expect(second !== null, "a second delete resolved instead of rejecting");
        expect(second.toolExitCode === 3, `a second delete rejected with toolExitCode ${second.toolExitCode}: ${second.message}`);

        return "the first delete removed the entry (find exits 44); the second rejected with toolExitCode 3 (the real security answered 44, which the lib maps)";
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
    // Searched without the account: an entry the lib wrote under another account would still be a leftover. Only
    // exit 44 is "not there"; any other answer means the check could not tell. Each delete removes the first match
    // in the search list, so a copy of the key in a second keychain survives one pass: delete through the lib, as a
    // user's logout would, and look again, a few times. An entry already absent is not an error here.
    const leftovers = [];
    for (const k of createdKeys) {
        const find = () => sec(["find-generic-password", "-s", k]).status;
        let status = find();
        for (let tries = 0; status !== 44 && tries < 3; tries += 1) {
            try {
                await deleteEntryIo("keychain", ENV)(k);
            } catch { /* absent, or reported by the look below */ }
            status = find();
        }
        if (status !== 44) {
            leftovers.push(`${path.basename(k)} (find exit ${status})`);
        }
    }
    let keychainNote = "no temporary keychain was needed";
    let keychainOk = true;
    if (tempKeychain !== null) {
        const notes = [];
        if (tempKeychain.prevDefault !== null) {
            const r = sec(["default-keychain", "-d", "user", "-s", tempKeychain.prevDefault]);
            notes.push(r.status === 0 ? "default keychain restored" : `default keychain NOT restored (exit ${r.status})`);
            keychainOk &&= r.status === 0;
        }
        // Restored as it was even when it was empty: `-s` with no keychain sets an empty list, which is the state
        // before the run, where leaving the temporary keychain in it would not be.
        const list = sec(["list-keychains", "-d", "user", "-s", ...tempKeychain.prevList]);
        notes.push(list.status === 0 ? `search list restored (${tempKeychain.prevList.length} entries)` : `search list NOT restored (exit ${list.status})`);
        keychainOk &&= list.status === 0;
        sec(["delete-keychain", tempKeychain.path]);
        const gone = !fs.existsSync(tempKeychain.path);
        notes.push(gone ? "temporary keychain deleted" : "temporary keychain NOT deleted");
        keychainOk &&= gone;
        // security has no way to unset the default keychain, so when there was none the state to restore is "not the
        // temporary one": say what it reads now rather than claim a restore.
        const nowDefault = parseKeychains(sec(["default-keychain", "-d", "user"]).stdout)[0] ?? null;
        const nowList = parseKeychains(sec(["list-keychains", "-d", "user"]).stdout);
        const stillTemp = nowDefault === tempKeychain.path || nowList.includes(tempKeychain.path);
        if (tempKeychain.prevDefault === null) {
            notes.push(`there was no default keychain before the run; it reads ${nowDefault ?? "none"} now`);
        }
        notes.push(stillTemp ? "the temporary keychain is STILL the default or in the search list" : "the temporary keychain is in neither the default nor the search list");
        keychainOk &&= !stillTemp;
        keychainNote = notes.join(", ");
    }
    let tmpRemoved = true;
    try {
        fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (e) {
        tmpRemoved = false;
        console.log(`could not remove the temp dir ${TMP}: ${e.code ?? e.message}`);
    }
    const ok = leftovers.length === 0 && keychainOk && tmpRemoved;
    const detail = `${createdKeys.size} keys created; leftovers by security find-generic-password: ${leftovers.length}${leftovers.length > 0 ? ` -> ${leftovers.join(", ")}` : ""}; ${keychainNote}; temp dir ${tmpRemoved ? "removed" : "NOT removed"}`;
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
        "### vc-secrets smoke on macOS",
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

// A cancelled CI job sends SIGTERM and a closed terminal SIGHUP: both must put the keychain configuration back.
for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]]) {
    process.once(signal, async () => {
        console.error(`\n${signal} -- cleaning up`);
        await cleanup();
        process.exit(code);
    });
}

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
