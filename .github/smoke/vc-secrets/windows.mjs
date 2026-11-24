// windows.mjs -- Windows smoke test of the vc-secrets DPAPI OAuth store against real DPAPI, real Credential
// Manager and a real third party that locks files. CI runs it (.github/workflows/vc-secrets-os-smoke.yml):
//
//     node .github/smoke/vc-secrets/windows.mjs
//
// A developer on native Windows can run it too, knowingly, with --local: it writes to the real Credential Manager
// under a throwaway prefix. It imports the plugin from this checkout and changes nothing under it.
// Isolation: every dpapi file lives under a fresh temp dir (LOCALAPPDATA of the `env` the lib is handed), and every
// Credential Manager entry carries one random per-run scope, `vc-secrets:vcs-smoke-<hex>:<name>`. Values are
// synthetic and are never printed -- only lengths and booleans. Exit code = number of FAILs (2 = refused to run).

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire, syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Before anything is imported or spawned. Two conditions, because the script does two things a unit test never
// does: it needs the real Windows stores, and it writes into the caller's Credential Manager. CI is a machine
// that is thrown away; anywhere else the caller has to say so.
{
    const missing = [];
    if (process.platform !== "win32") {
        missing.push(`native Windows (process.platform is "${process.platform}")`);
    }
    if (process.env.GITHUB_ACTIONS !== "true" && !process.argv.includes("--local")) {
        missing.push("a CI runner (GITHUB_ACTIONS=true) or the --local flag, because it writes to the real Credential Manager under a throwaway vc-secrets:vcs-smoke-<hex> prefix");
    }
    if (missing.length > 0) {
        console.error(`windows.mjs refuses to run: it needs ${missing.join(" and ")}`);
        process.exit(2);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Spawn instrumentation. S7 has to count PowerShell PROCESSES, and the lib offers no seam for that: credReadManyIo
// calls runTool, which calls node:child_process.spawn. A builtin's named exports are live bindings, so replacing the
// property and calling syncBuiltinESMExports() makes spawn.mjs's `spawn` the wrapper. This script's own children use
// `realSpawn`, which is never counted. Installed before the lib is imported.
// ---------------------------------------------------------------------------------------------------------------
const cp = createRequire(import.meta.url)("node:child_process");
const realSpawn = cp.spawn;
let spawnLog = null;
cp.spawn = function countedSpawn(...args) {
    spawnLog?.push(String(args[0]));

    return realSpawn.apply(this, args);
};
syncBuiltinESMExports();

// The plugin of the checkout this script sits in: .github/smoke/vc-secrets/ is three levels below the repo root.
// A smoke that imported a copy would test the copy.
const libUrl = (rel) => new URL(`../../../plugins/vc-secrets/${rel}`, import.meta.url).href;
const lib = await import(libUrl("vc-secrets.mjs"));
const cache = await import(libUrl("vc-secrets-cache.mjs"));
const { writeSecretValue, unprotectManyIo, deleteEntryIo, makeSecretResolver,
    credReadManyIo, buildDpapiProtect, buildCredReadMany, oauthLaunchDeps, oauthEntryKeys,
    oauthBackend, detectLocalBackend, runTool, psCommand, psEncode, resolveSpawnCommand, commandOnPath,
    CS_DPAPI, RENAME_ATTEMPTS } = lib;

// ---------------------------------------------------------------------------------------------------------------
// Run identity and isolation
// ---------------------------------------------------------------------------------------------------------------
const SCOPE = `vcs-smoke-${crypto.randomBytes(4).toString("hex")}`;   // the "test prefix with a random suffix"; [a-z0-9-]
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-smoke-"));
const key = (name) => `vc-secrets:${SCOPE}:${name}`;

// The commit under test: what the workflow checked out, or, on a developer's machine, the checkout's own HEAD.
function commitUnderTest() {
    if (process.env.GITHUB_SHA) {
        return process.env.GITHUB_SHA.slice(0, 12);
    }
    try {
        const r = spawnSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8", windowsHide: true, cwd: path.dirname(fileURLToPath(import.meta.url)) });
        const sha = r.status === 0 ? r.stdout.trim() : "";

        return sha === "" ? "unknown" : sha;
    } catch {
        return "unknown";
    }
}

// What the lib is handed as `env`: the real environment minus every variable that would redirect the store or the
// shell, with LOCALAPPDATA pointing at the temp dir. dpapiKeyToPath(), psCommand() and detectLocalBackend() read
// only this object; runTool spawns with process.env, which is what the PowerShell child needs (PATH, TEMP, ...).
function makeEnv(extra = {}) {
    const drop = new Set(["XDG_CONFIG_HOME", "LOCALAPPDATA", "VC_SECRETS_POWERSHELL", "VC_SECRETS_LOCAL_BACKEND"]);
    const env = {};
    for (const [k, v] of Object.entries(process.env)) {
        if (!drop.has(k.toUpperCase())) {
            env[k] = v;
        }
    }
    env.LOCALAPPDATA = TMP;

    return Object.assign(env, extra);
}
const ENV = makeEnv();                                          // powershell.exe (Windows PowerShell 5.1)
const ENV_PWSH = makeEnv({ VC_SECRETS_POWERSHELL: "pwsh" });    // the selector psCommand() reads

// The two lib functions whose default `env` is process.env -- the operator's REAL LOCALAPPDATA -- are only ever
// reached through these, so a call that forgets the env still lands in the temp dir.
const dpapiKeyToPath = (k, env = ENV) => lib.dpapiKeyToPath(k, env);
const readDpapiFile = (k, env = ENV) => lib.readDpapiFile(k, env);

const wcmKeys = new Set();   // every Credential Manager entry this run may have created, for cleanup

// Deterministic ASCII of exactly n bytes. The tag leads the value and the rest varies with position, so two values
// made with different tags always differ (an equality that cannot tell the old value from the new one proves
// nothing), and truncation or reordering still shows up.
function synthetic(n, tag) {
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    let out = `${tag}:`;
    for (let i = out.length; i < n; i += 1) {
        out += alphabet[(i * 7 + i % 5) % alphabet.length];
    }

    return out.slice(0, n);
}

// ---------------------------------------------------------------------------------------------------------------
// Tiny process helpers (all use realSpawn, so the S7 counter never sees them)
// ---------------------------------------------------------------------------------------------------------------
const psArgs = (script) => ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", psEncode(script)];

function resolveDirect(cmd) {
    const r = resolveSpawnCommand(cmd);
    if (r.kind !== "direct") {
        throw new Error(`${cmd} resolves to a .cmd/.bat shim, which this script does not run`);
    }

    return r.cmd;
}

// Same shape as the lib's `run`, but it answers the exit code and BOTH streams instead of throwing.
function capture(spec, { stdinValue, timeoutMs = 120_000 } = {}) {
    return new Promise((resolve, reject) => {
        let child;
        try {
            child = realSpawn(resolveDirect(spec.cmd), spec.args, {
                env: { ...process.env, ...(spec.extraEnv ?? {}) }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
        } catch (e) {
            reject(e);

            return;
        }
        let stdout = "";
        let stderr = "";
        const timer = setTimeout(() => { child.kill(); reject(new Error(`${spec.cmd} timed out after ${timeoutMs} ms`)); }, timeoutMs);
        child.stdout.setEncoding("utf8").on("data", (d) => { stdout += d; });
        child.stderr.setEncoding("utf8").on("data", (d) => { stderr += d; });
        child.on("error", (e) => { clearTimeout(timer); reject(e); });
        child.stdin.on("error", () => {});
        if (stdinValue !== undefined) {
            child.stdin.write(stdinValue);
        }
        child.stdin.end();
        child.on("close", (code) => { clearTimeout(timer); resolve({ code, stdout, stderr }); });
    });
}

// A `run` for the lib that keeps what capture() saw and throws on a non-zero exit like runTool does.
function capturingRun(sink) {
    return async (spec, opts) => {
        const r = await capture(spec, opts);
        sink.push(r);
        if (r.code !== 0) {
            throw new Error(`${spec.cmd} exited ${r.code}: ${r.stderr.trim().slice(0, 300)}`);
        }

        return r.stdout.replace(/\r?\n$/, "");
    };
}

async function psVersion(cmd) {
    const r = await capture({ cmd, args: psArgs("[Console]::Out.Write($PSVersionTable.PSVersion.ToString())") });
    if (r.code !== 0) {
        throw new Error(`${cmd} exited ${r.code}: ${r.stderr.trim().slice(0, 200)}`);
    }

    return r.stdout.trim();
}

// A node child the batched read binds to a job (S3, S7), so the harness itself is never put in a kill-on-close job.
const sacrificials = [];
function sacrificialPid() {
    // A fresh one per bind: a process already in a bound job would have the next job nested under it.
    const child = realSpawn(process.execPath, ["-e", "setTimeout(() => {}, 1800000)"], { stdio: "ignore", windowsHide: true });
    child.on("error", () => {});
    sacrificials.push(child);

    return child.pid;
}

// The third party: a separate PowerShell that opens `file` for reading WITHOUT share-delete -- what an antivirus scan
// or the indexer does -- prints a line once it holds the handle, keeps it for holdMs and lets go.
const PS_HOLD = `
$ErrorActionPreference='Stop'
$f=[IO.File]::Open($env:SMOKE_TARGET,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
[Console]::Out.WriteLine('LOCKED')
Start-Sleep -Milliseconds ([int]$env:SMOKE_HOLD_MS)
$f.Close()
`;

function startHolder(file, holdMs) {
    const child = realSpawn(resolveDirect("powershell.exe"), psArgs(PS_HOLD), {
        env: { ...process.env, SMOKE_TARGET: file, SMOKE_HOLD_MS: String(holdMs) }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let settled = false;
    let onReady;
    let onFail;
    const ready = new Promise((resolve, reject) => { onReady = resolve; onFail = reject; });
    ready.catch(() => {});   // always awaited by the caller; this only keeps a late rejection from being "unhandled"
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill(); onFail(new Error("holder did not report the lock within 30 s")); } }, 30_000);
    child.stdout.setEncoding("utf8").on("data", (d) => {
        stdout += d;
        if (!settled && stdout.includes("LOCKED")) {
            settled = true;
            clearTimeout(timer);
            onReady();
        }
    });
    child.stderr.setEncoding("utf8").on("data", (d) => { stderr += d; });
    const done = new Promise((resolve) => {
        child.on("error", (e) => { clearTimeout(timer); if (!settled) { settled = true; onFail(e); } resolve({ code: -1, stderr: e.message }); });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                onFail(new Error(`holder exited ${code} before locking: ${stderr.trim().slice(0, 300)}`));
            }
            resolve({ code, stderr });
        });
    });

    return { ready, done };
}

// ---------------------------------------------------------------------------------------------------------------
// Credential Manager helpers (cmdkey /list is the ground truth the scenarios compare against)
// ---------------------------------------------------------------------------------------------------------------
function cmList() {
    const r = spawnSync("cmdkey", ["/list"], { encoding: "latin1", windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
    if (r.error || r.status !== 0) {
        throw new Error(`cmdkey /list failed: ${r.error?.message ?? `exit ${r.status}`}`);
    }

    return r.stdout.split(/\r?\n/);
}
const cmHas = (k) => cmList().some((l) => l.includes(k));

async function wcmWrite(k, value) {
    wcmKeys.add(k);   // registered first: a write that half-succeeds is still cleaned up
    await writeSecretValue(k, value, { backend: "wcm", env: ENV });
}

// ---------------------------------------------------------------------------------------------------------------
// dpapi helpers
// ---------------------------------------------------------------------------------------------------------------
async function dpapiWrite(k, value, env = ENV) {
    await writeSecretValue(k, value, { backend: "dpapi", env });
}

// The stored entry, decrypted through the lib's batched unprotect. Throws on a DPAPI refusal, with the code.
async function dpapiRead(k, env = ENV) {
    const blob = readDpapiFile(k, env);
    expect(blob !== undefined, `no file for ${k}`);
    const out = (await unprotectManyIo({ blobs: new Map([[k, blob]]), env })).get(k);
    expect(typeof out?.ok === "string", `DPAPI refused the entry (win32 error ${out?.err})`);

    return Buffer.from(out.ok, "hex").toString("utf8");
}

const tmpFilesIn = (k, env = ENV) => fs.readdirSync(path.dirname(dpapiKeyToPath(k, env))).filter((f) => f.endsWith(".tmp"));

function expect(cond, message) {
    if (!cond) {
        throw new Error(message);
    }
}

// ---------------------------------------------------------------------------------------------------------------
// Windows PowerShell 5.1 reports its progress stream on stderr as CLIXML when it is not attached to a console. The
// "Preparing modules for first use." record is printed the first time a profile-less 5.1 loads its modules, so on a
// fresh CI image EVERY invocation has it. That is the host talking, not the C# compiler: a warning from Add-Type
// arrives as a different record, or as plain text. So stderr made only of progress records is clean, and anything
// else non-empty is still a finding, reported with its text.
// ---------------------------------------------------------------------------------------------------------------
const CLIXML_MARK = "#< CLIXML";

// One `<Objs ...>...</Objs>` body holding nothing but top-level `<Obj S="progress" ...>` elements. A progress
// element may contain other tags, including nested <Obj>, so its end is found by counting the open and close tags.
function isProgressOnlyObjs(segment) {
    const envelope = /^<Objs\b[^>]*>([\s\S]*)<\/Objs>$/.exec(segment.trim());
    if (envelope === null) {
        return false;
    }
    let rest = envelope[1];
    for (;;) {
        rest = rest.trimStart();
        if (rest === "") {
            return true;
        }
        const open = /^<Obj\b[^>]*\bS="progress"[^>]*>/.exec(rest);
        if (open === null) {
            return false;
        }
        if (open[0].endsWith("/>")) {
            rest = rest.slice(open[0].length);

            continue;
        }
        const tags = /<(\/?)Obj\b([^>]*)>/g;
        tags.lastIndex = open[0].length;
        let depth = 1;
        let end = -1;
        for (let m = tags.exec(rest); m !== null && end < 0; m = tags.exec(rest)) {
            if (m[1] === "/") {
                depth -= 1;
            } else if (!m[2].endsWith("/")) {
                depth += 1;
            }
            if (depth === 0) {
                end = tags.lastIndex;
            }
        }
        if (end < 0) {
            return false;
        }
        rest = rest.slice(end);
    }
}

function isProgressOnlyClixml(text) {
    const t = text.trim();
    if (!t.startsWith(CLIXML_MARK)) {
        return false;
    }

    return t.split(CLIXML_MARK).slice(1).every(isProgressOnlyObjs);
}

// The envelope PS 5.1.26100 wrote on 2026-11-23 for each of the five invocations the S3 check makes.
const CLIXML_PROGRESS_2026_11_23 = `#< CLIXML
<Objs Version="1.1.0.1" xmlns="http://schemas.microsoft.com/powershell/2004/04"><Obj S="progress" RefId="0"><TN RefId="0"><T>System.Management.Automation.PSCustomObject</T><T>System.Object</T></TN><MS><I64 N="SourceId">1</I64><PR N="Record"><AV>Preparing modules for first use.</AV><AI>0</AI><Nil /><PI>-1</PI><PC>-1</PC><T>Completed</T><SR>-1</SR><SD> </SD></PR></MS></Obj></Objs>`;

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

// ---------------------------------------------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------------------------------------------
const VALUE_BYTES = 2907;   // the size observed in the field, over the 2560-byte Credential Manager ceiling

async function roundTrip(env, name) {
    const k = key(name);
    const value = synthetic(VALUE_BYTES, name);
    expect(Buffer.byteLength(value) === VALUE_BYTES, "synthetic value is not the intended size");
    await writeSecretValue(k, value, { backend: "dpapi", env });
    const blob = readDpapiFile(k, env);
    expect(blob !== undefined && blob.length > 0, "the entry file is missing or empty after the write");
    expect(!blob.includes(Buffer.from(value)), "the plaintext is sitting in the entry file");
    const outcome = (await unprotectManyIo({ blobs: new Map([[k, blob]]), env })).get(k);
    expect(typeof outcome?.ok === "string", `unprotect answered an error (win32 error ${outcome?.err})`);
    const back = Buffer.from(outcome.ok, "hex").toString("utf8");
    expect(back === value, `decrypted value differs (${Buffer.byteLength(back)} bytes back, ${VALUE_BYTES} written)`);
    expect(tmpFilesIn(k, env).length === 0, `a tmp file was left behind: ${tmpFilesIn(k, env).join(", ")}`);

    return `${VALUE_BYTES}-byte value, ${blob.length}-byte file, decrypted equal (${psCommand(env)})`;
}

let progressOnlyStderrs = 0;   // S3: invocations whose whole stderr was CLIXML progress

async function s3FindingsFor(label, env) {
    const problems = [];
    const note = (what, r) => {
        const err = r.stderr.trim();
        if (err === "") {
            return;
        }
        if (isProgressOnlyClixml(err)) {
            progressOnlyStderrs += 1;

            return;
        }
        problems.push(`${label} ${what}: stderr is not empty: ${err.slice(0, 600)}`);
    };
    const k = key(`s3-${label.replace(/\W/g, "")}`);
    const value = synthetic(64, "s3");

    // The real protect script: stdin value, base64 ciphertext on stdout.
    const protect = await capture(buildDpapiProtect(k, env), { stdinValue: value });
    note("protect", protect);
    if (protect.code !== 0) {
        problems.push(`${label} protect exited ${protect.code}`);

        return problems;
    }
    const printed = protect.stdout.trim();
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(printed)) {
        problems.push(`${label} protect: stdout is not exactly base64 (a warning may have been printed ahead of it)`);

        return problems;
    }
    const blob = Buffer.from(printed, "base64");

    // The real batched unprotect script, through the lib's own wrapper.
    const seen = [];
    const out = await unprotectManyIo({ blobs: new Map([[k, blob]]), env, run: capturingRun(seen) });
    for (const r of seen) {
        note("unprotect", r);
    }
    if (typeof out.get(k)?.ok !== "string") {
        problems.push(`${label} unprotect: did not decrypt the blob protect just made (${JSON.stringify(out.get(k))})`);
    }

    // The launch's batched read compiles the same C# a third time, inside its own Add-Type.
    const batchSpec = buildCredReadMany([], sacrificialPid(), env, new Map([[k, blob]]));
    const batch = await capture(batchSpec, { stdinValue: JSON.stringify({ [k]: blob.toString("base64") }) });
    note("batched read", batch);
    let parsed = null;
    try {
        parsed = JSON.parse(batch.stdout);
    } catch { /* reported below */ }
    if (parsed === null || typeof parsed.dpapi?.[k]?.ok !== "string") {
        problems.push(`${label} batched read: stdout is not the expected JSON with the decrypted entry (exit ${batch.code})`);
    }

    // The compiler's own diagnostics, asked for directly: warnings are a PowerShell stream, which a host may print
    // on stdout rather than stderr, so a stderr-only look can miss them.
    const compile = await capture({ cmd: psCommand(env), extraEnv: { SMOKE_CS: CS_DPAPI }, args: psArgs(`
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition $env:SMOKE_CS -WarningVariable w -WarningAction SilentlyContinue
[Console]::Out.Write((@($w) | ForEach-Object { "$_" }) -join ' | ')
`) });
    note("compile", compile);
    if (compile.code !== 0) {
        problems.push(`${label} compile of CS_DPAPI exited ${compile.code}`);
    } else if (compile.stdout.trim() !== "") {
        problems.push(`${label} compile of CS_DPAPI reported warnings: ${compile.stdout.trim().slice(0, 600)}`);
    }

    return problems;
}

// What S5 and S6 share: the lock must be held at the moment the lib RENAMES or REMOVES, not while PowerShell is still
// protecting the value (1-3 s), which would let a 150 ms lock expire before the file operation starts. So the lock is
// taken inside the injected `run`, after the real PowerShell call has finished, and `ready` waits for the holder's
// "LOCKED" line: the hold window opens at the same moment the lib's retry loop starts.
async function writeOverHeldFile(k, value, holdMs, env = ENV) {
    const file = dpapiKeyToPath(k, env);
    const renames = [];
    let holder = null;
    let infra = null;
    let lockedAt = 0;
    const run = async (spec, opts) => {
        const out = await runTool(spec, opts);
        holder = startHolder(file, holdMs);
        try {
            await holder.ready;
        } catch (e) {
            infra = e;
            throw e;
        }
        lockedAt = Date.now();

        return out;
    };
    const rename = (from, to) => {
        try {
            fs.renameSync(from, to);
            renames.push("ok");
        } catch (e) {
            renames.push(e.code ?? "?");
            throw e;
        }
    };
    let error = null;
    try {
        await writeSecretValue(k, value, { backend: "dpapi", env, run, rename });
    } catch (e) {
        error = e;
    }
    const elapsedMs = lockedAt === 0 ? 0 : Date.now() - lockedAt;
    if (holder !== null) {
        await holder.done;   // never leave the handle to the next check
    }
    if (infra !== null) {
        throw new Error(`could not set up the lock: ${infra.message}`);
    }

    return { error, renames, elapsedMs };
}

async function removeOverHeldFile(k, holdMs, env = ENV) {
    const file = dpapiKeyToPath(k, env);
    const removals = [];
    let holder = null;
    let infra = null;
    let lockedAt = 0;
    // deleteEntryIo("dpapi") deletes the legacy Credential Manager entry through this `run` first (a PowerShell call),
    // and removes the file afterwards: the lock goes on once that call has returned.
    const run = async (spec, opts) => {
        let out;
        let failure = null;
        try {
            out = await runTool(spec, opts);
        } catch (e) {
            failure = e;   // an absent legacy entry is exit 3, which deleteEntryIo reads as "already absent"
        }
        if (holder === null) {
            holder = startHolder(file, holdMs);
            try {
                await holder.ready;
            } catch (e) {
                infra = e;
                throw e;
            }
            lockedAt = Date.now();
        }
        if (failure !== null) {
            throw failure;
        }

        return out;
    };
    const rm = (f) => {
        try {
            fs.rmSync(f);
            removals.push("ok");
        } catch (e) {
            removals.push(e.code ?? "?");
            throw e;
        }
    };
    let error = null;
    try {
        await deleteEntryIo("dpapi", env, { run, rm })(k);
    } catch (e) {
        error = e;
    }
    const elapsedMs = lockedAt === 0 ? 0 : Date.now() - lockedAt;
    if (holder !== null) {
        await holder.done;
    }
    if (infra !== null) {
        throw new Error(`could not set up the lock: ${infra.message}`);
    }

    return { error, removals, elapsedMs };
}

const HOLD_SHORT_MS = 150;
const HOLD_LONG_MS = 3000;
const TRANSIENT = ["EPERM", "EBUSY", "EACCES"];   // keystore.mjs RENAME_RETRY_CODES (not exported)
const CONCURRENT_WRITES = 20;

// The reader of S5d, in a node process of its own so that its handles are a different process's: it calls the lib's
// readDpapiFile -- one readFileSync, open-read-close -- on the entry back-to-back until its stdin closes, and
// reports what it saw. It prints READY once a read has succeeded, so the writes start against a running reader.
const READER_SOURCE = `
import { readDpapiFile } from ${JSON.stringify(libUrl("vc-secrets.mjs"))};
const env = { LOCALAPPDATA: process.env.SMOKE_LOCALAPPDATA };
const key = process.env.SMOKE_KEY;
let stop = false;
process.stdin.on("end", () => { stop = true; });
process.stdin.resume();
let reads = 0;
let absent = 0;
const errors = {};
let announced = false;
while (!stop) {
    for (let i = 0; i < 50; i += 1) {
        try {
            if (readDpapiFile(key, env) === undefined) {
                absent += 1;
            } else {
                reads += 1;
            }
        } catch (e) {
            const code = /: (\\w+)$/.exec(e.message)?.[1] ?? "?";
            errors[code] = (errors[code] ?? 0) + 1;
        }
    }
    if (!announced && reads > 0) {
        announced = true;
        console.log("READY");
    }
    await new Promise((resolve) => setImmediate(resolve));
}
console.log(JSON.stringify({ reads, absent, errors }));
`;

function startReader(k) {
    const file = path.join(TMP, "s5d-reader.mjs");
    fs.writeFileSync(file, READER_SOURCE);
    const child = realSpawn(process.execPath, [file], {
        env: { ...process.env, SMOKE_LOCALAPPDATA: TMP, SMOKE_KEY: k }, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    sacrificials.push(child);   // killed in cleanup if the check dies before stopping it
    let stdout = "";
    let stderr = "";
    let settled = false;
    let onReady;
    let onFail;
    const ready = new Promise((resolve, reject) => { onReady = resolve; onFail = reject; });
    ready.catch(() => {});
    const timer = setTimeout(() => { if (!settled) { settled = true; child.kill(); onFail(new Error("the reader did not report a first read within 30 s")); } }, 30_000);
    child.stdin.on("error", () => {});
    child.stdout.setEncoding("utf8").on("data", (d) => {
        stdout += d;
        if (!settled && stdout.includes("READY")) {
            settled = true;
            clearTimeout(timer);
            onReady();
        }
    });
    child.stderr.setEncoding("utf8").on("data", (d) => { stderr += d; });
    const done = new Promise((resolve) => {
        child.on("error", (e) => { clearTimeout(timer); if (!settled) { settled = true; onFail(e); } resolve({ code: -1, report: null, stderr: e.message }); });
        child.on("close", (code) => {
            clearTimeout(timer);
            if (!settled) {
                settled = true;
                onFail(new Error(`the reader exited ${code} before its first read: ${stderr.trim().slice(0, 300)}`));
            }
            let report = null;
            try {
                report = JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
            } catch { /* judged by the caller */ }
            resolve({ code, report, stderr });
        });
    });

    return { ready, done, stop: () => child.stdin.end() };
}

async function main() {
    // ---- header ---------------------------------------------------------------------------------------------
    const header = [];
    const say = (line) => { header.push(line); console.log(line); };
    say(`node ${process.version} on ${os.type()} ${os.release()}`);
    say(`commit under test: ${commitUnderTest()}`);
    say(`run scope: ${SCOPE}   temp dir (LOCALAPPDATA for the lib): ${TMP}`);
    say(`lib backends here: detectLocalBackend=${detectLocalBackend(process.platform, ENV)} oauthBackend=${oauthBackend(process.platform, ENV)}`);
    const defaultPs = psCommand(ENV);
    let psVersionDefault = "?";
    try {
        psVersionDefault = await psVersion(defaultPs);
    } catch (e) {
        psVersionDefault = `unavailable (${e.message})`;
    }
    say(`PowerShell used by default (${defaultPs}): PSVersion ${psVersionDefault}`);
    const havePwsh = commandOnPath("pwsh");
    let psVersionPwsh = null;
    if (havePwsh) {
        try {
            psVersionPwsh = await psVersion("pwsh");
        } catch (e) {
            psVersionPwsh = `unavailable (${e.message})`;
        }
    }
    say(`PowerShell 7 (pwsh): ${havePwsh ? `PSVersion ${psVersionPwsh}` : "not on PATH"}`);
    console.log("");
    summaryHeader = header;

    // ---- S3pin ----------------------------------------------------------------------------------------------
    await check("S3pin", "CLIXML progress classifier (pure, no PowerShell)", () => {
        const crlf = CLIXML_PROGRESS_2026_11_23.replace(/\n/g, "\r\n");
        const doubled = `${CLIXML_PROGRESS_2026_11_23}\r\n${CLIXML_PROGRESS_2026_11_23}`;
        const withError = CLIXML_PROGRESS_2026_11_23.replace("</Objs>", `<S S="Error">boom</S></Objs>`);
        const withWarning = CLIXML_PROGRESS_2026_11_23.replace('S="progress"', 'S="warning"');
        const oneOfTwo = CLIXML_PROGRESS_2026_11_23.replace("</Objs>", `<Obj S="warning" RefId="1"><MS><S N="Message">w</S></MS></Obj></Objs>`);
        const cases = [
            ["the 2026-11-23 envelope", CLIXML_PROGRESS_2026_11_23, true],
            ["the same with CRLF line ends", crlf, true],
            ["two such envelopes", doubled, true],
            ["a progress record plus an error stream record", withError, false],
            ["a record whose stream is warning, not progress", withWarning, false],
            ["a progress record followed by a warning record", oneOfTwo, false],
            ["plain text", "WARNING: something was compiled with warnings", false],
            ["the mark followed by plain text", `${CLIXML_MARK}\nsomething else`, false],
            ["a truncated envelope", CLIXML_PROGRESS_2026_11_23.replace("</Objs>", ""), false],
            ["text ahead of the mark", `warning text\n${CLIXML_PROGRESS_2026_11_23}`, false],
        ];
        const wrong = cases.filter(([, text, expected]) => isProgressOnlyClixml(text) !== expected).map(([what]) => what);
        expect(wrong.length === 0, `misclassified: ${wrong.join("; ")}`);

        return `${cases.length} envelopes classified as expected (the exact 2026-11-23 text is clean; an error, a warning, plain or truncated text is not)`;
    });

    // ---- S1 / S2 --------------------------------------------------------------------------------------------
    await check("S1", "Round trip, default PowerShell", () => roundTrip(ENV, "s1-a"));

    await check("S2", "Round trip, PowerShell 7 (VC_SECRETS_POWERSHELL=pwsh)", async () => {
        if (!havePwsh) {
            throw new Skip("pwsh is not on PATH (commandOnPath('pwsh'), the lookup runTool itself uses)");
        }

        return `${await roundTrip(ENV_PWSH, "s2-a")}; pwsh ${psVersionPwsh}`;
    });

    await check("S2b", "Cross-edition decrypt (5.1 <-> 7)", async () => {
        if (!havePwsh) {
            throw new Skip("pwsh is not on PATH");
        }
        const pairs = [["powershell.exe writes, pwsh reads", ENV, ENV_PWSH, "s2b-a"], ["pwsh writes, powershell.exe reads", ENV_PWSH, ENV, "s2b-b"]];
        for (const [label, writer, reader, name] of pairs) {
            const k = key(name);
            const value = synthetic(300, name);
            await dpapiWrite(k, value, writer);
            expect(await dpapiRead(k, reader) === value, `${label}: decrypted value differs`);
        }

        return "both directions decrypt equal";
    });

    // ---- S3 -------------------------------------------------------------------------------------------------
    await check("S3", "Add-Type cleanliness (stderr of real invocations)", async () => {
        const problems = await s3FindingsFor("powershell.exe", ENV);
        if (havePwsh) {
            problems.push(...await s3FindingsFor("pwsh", ENV_PWSH));
        }
        expect(problems.length === 0, problems.join(" ;; "));

        return `protect, batched unprotect, batched read and a direct compile of CS_DPAPI: expected stdout shape, no compiler warnings, stderr empty or CLIXML progress only (${progressOnlyStderrs} of the invocations; ${havePwsh ? "powershell.exe and pwsh" : "powershell.exe only"})`;
    });

    // ---- S4 -------------------------------------------------------------------------------------------------
    await check("S4", "Entropy binding (file copied across keys)", async () => {
        const a = key("s4-a");
        const b = key("s4-b");
        await dpapiWrite(a, synthetic(200, "s4a"));
        await dpapiWrite(b, synthetic(200, "s4b"));
        fs.copyFileSync(dpapiKeyToPath(a), dpapiKeyToPath(b));
        const copied = readDpapiFile(b, ENV);
        const asB = (await unprotectManyIo({ blobs: new Map([[b, copied]]), env: ENV })).get(b);
        expect(typeof asB?.ok !== "string", "A's ciphertext DECRYPTED under B's key -- the entropy does not bind it");
        expect(Number.isInteger(asB?.err), `neither an error code nor a value came back: ${JSON.stringify(asB)}`);
        // Measured on Windows 11 (PS 5.1.26100) on 2026-11-23. A different code is a different failure, not a pass.
        expect(asB.err === 13, `decrypt as B failed with win32 error ${asB.err}, expected 13 (ERROR_INVALID_DATA)`);
        const control = (await unprotectManyIo({ blobs: new Map([[a, readDpapiFile(a, ENV)]]), env: ENV })).get(a);
        expect(typeof control?.ok === "string", `control failed: A's own file no longer decrypts as A (win32 error ${control?.err})`);

        return "decrypt as B -> err outcome, win32 error 13 (ERROR_INVALID_DATA); the same bytes still decrypt as A";
    });

    // ---- S5 -------------------------------------------------------------------------------------------------
    const lockedWriteSeed = async (name) => {
        const k = key(name);
        const v0 = synthetic(400, `${name}-v0`);
        await dpapiWrite(k, v0);

        return { k, v0 };
    };

    await check("S5a", `Write over a file locked ${HOLD_SHORT_MS} ms (no share-delete)`, async () => {
        const { k, v0 } = await lockedWriteSeed("s5a");
        const v1 = synthetic(400, "s5a-v1");
        expect(v1 !== v0, "the old and the new value are equal, so the check could not tell them apart");
        const r = await writeOverHeldFile(k, v1, HOLD_SHORT_MS);
        expect(r.error === null, `the write failed (${r.error?.code ?? r.error?.message}); rename attempts: [${r.renames.join(", ")}]`);
        expect(r.renames.length >= 2, `the rename was not contended (attempts: [${r.renames.join(", ")}]) -- the lock never bit, so this proves nothing`);
        expect(await dpapiRead(k) === v1, "the entry does not hold the new value");
        expect(tmpFilesIn(k).length === 0, "a tmp file was left behind");

        return `retry rode it out; rename attempts [${r.renames.join(", ")}], ${r.elapsedMs} ms after the lock`;
    });

    await check("S5b", `Write over a file locked ${HOLD_LONG_MS} ms`, async () => {
        const { k, v0 } = await lockedWriteSeed("s5b");
        const v1 = synthetic(400, "s5b-v1");
        expect(v1 !== v0, "the old and the new value are equal, so 'previous entry intact' could not be told from 'overwritten'");
        const r = await writeOverHeldFile(k, v1, HOLD_LONG_MS);
        expect(r.error !== null, `the write SUCCEEDED despite a ${HOLD_LONG_MS} ms lock; rename attempts: [${r.renames.join(", ")}]`);
        expect(r.renames.length === RENAME_ATTEMPTS && TRANSIENT.includes(r.error.code),
            `failed with ${r.error.code ?? r.error.message} after ${r.renames.length} attempt(s) [${r.renames.join(", ")}], expected ${RENAME_ATTEMPTS} transient refusals`);
        expect(await dpapiRead(k) === v0, "the previous entry was not left intact");
        expect(tmpFilesIn(k).length === 0, "a tmp file was left behind");

        return `write failed with ${r.error.code} after ${r.renames.length} attempts [${r.renames.join(", ")}], ${r.elapsedMs} ms after the lock; previous entry intact, no tmp left`;
    });

    // Pins what the design record used to get wrong: a handle node itself holds open blocks the rename, share-delete
    // notwithstanding. Measured on 2026-11-23 (EPERM on every attempt). If this ever starts to PASS the other way, the
    // retry the lib does for a reader is no longer the only thing between a reader and a failed write.
    await check("S5c", "A handle THIS process holds open (fs.openSync) blocks the rename", async () => {
        const { k, v0 } = await lockedWriteSeed("s5c");
        const v1 = synthetic(400, "s5c-v1");
        expect(v1 !== v0, "the old and the new value are equal, so 'previous entry intact' could not be told from 'overwritten'");
        const renames = [];
        let error = null;
        const fd = fs.openSync(dpapiKeyToPath(k), "r");
        try {
            await writeSecretValue(k, v1, { backend: "dpapi", env: ENV, rename: (from, to) => {
                try { fs.renameSync(from, to); renames.push("ok"); } catch (e) { renames.push(e.code ?? "?"); throw e; }
            } });
        } catch (e) {
            error = e;
        } finally {
            fs.closeSync(fd);
        }
        expect(error !== null, `the write SUCCEEDED with a node read handle open; rename attempts: [${renames.join(", ")}]`);
        expect(renames.length === RENAME_ATTEMPTS && TRANSIENT.includes(error.code),
            `failed with ${error.code ?? error.message} after ${renames.length} attempt(s) [${renames.join(", ")}], expected ${RENAME_ATTEMPTS} transient refusals`);
        expect(await dpapiRead(k) === v0, "the previous entry was not left intact");
        expect(tmpFilesIn(k).length === 0, "a tmp file was left behind");

        return `a held fs.openSync handle blocks the rename even with share-delete: ${error.code} on all ${renames.length} attempts [${renames.join(", ")}]; previous entry intact, no tmp left`;
    });

    // The inference the design record rests on: a reader's one readFileSync is a refusal of a moment, which the retry
    // covers. The reader runs flat out for the whole check, so some write meets a reader's handle with near certainty.
    await check("S5d", `${CONCURRENT_WRITES} sequential writes while another process reads the entry back-to-back`, async () => {
        const { k } = await lockedWriteSeed("s5d");
        const reader = startReader(k);
        const values = Array.from({ length: CONCURRENT_WRITES }, (_, i) => `${String(i).padStart(2, "0")}-${synthetic(380, "s5d")}`);
        expect(new Set(values).size === CONCURRENT_WRITES, "the values are not distinct");
        const attempts = [];
        let failure = null;
        let report = null;
        try {
            await reader.ready;
            for (const [i, value] of values.entries()) {
                const renames = [];
                try {
                    await writeSecretValue(k, value, { backend: "dpapi", env: ENV, rename: (from, to) => {
                        try { fs.renameSync(from, to); renames.push("ok"); } catch (e) { renames.push(e.code ?? "?"); throw e; }
                    } });
                } catch (e) {
                    failure = `write ${i + 1} of ${CONCURRENT_WRITES} failed: ${e.code ?? e.message}; rename attempts [${renames.join(", ")}]`;
                    break;
                }
                attempts.push(renames);
            }
        } finally {
            reader.stop();
            report = (await reader.done).report;
        }
        expect(failure === null, failure);
        const refusals = attempts.flat().filter((a) => a !== "ok").length;
        const contended = attempts.filter((a) => a.length > 1).length;
        expect(report !== null && report.reads > 0, `the reader reported nothing usable: ${JSON.stringify(report)}`);
        expect(await dpapiRead(k) === values.at(-1), "the final file does not decrypt to the last value written");
        expect(tmpFilesIn(k).length === 0, "a tmp file was left behind");

        return `all ${CONCURRENT_WRITES} writes succeeded; ${refusals} retried rename refusals over ${contended} contended writes; reader: ${report.reads} reads, ${report.absent} absent, read errors ${JSON.stringify(report.errors)}; the final file decrypts to the last value`;
    });

    // ---- S6 -------------------------------------------------------------------------------------------------
    const legacyStillAbsent = (k) => expect(!cmHas(k), "a Credential Manager entry for the key exists, which this scenario did not create");

    await check("S6a", `Remove over a file locked ${HOLD_SHORT_MS} ms`, async () => {
        const { k } = await lockedWriteSeed("s6a");
        legacyStillAbsent(k);
        const r = await removeOverHeldFile(k, HOLD_SHORT_MS);
        expect(r.error === null, `deleteEntryIo failed: ${r.error?.message}; removal attempts: [${r.removals.join(", ")}]`);
        expect(r.removals.length >= 2, `the removal was not contended (attempts: [${r.removals.join(", ")}]) -- the lock never bit`);
        expect(!fs.existsSync(dpapiKeyToPath(k)), "the file is still there");

        return `retry rode it out; removal attempts [${r.removals.join(", ")}], ${r.elapsedMs} ms after the lock`;
    });

    await check("S6b", `Remove over a file locked ${HOLD_LONG_MS} ms`, async () => {
        const { k } = await lockedWriteSeed("s6b");
        legacyStillAbsent(k);
        const r = await removeOverHeldFile(k, HOLD_LONG_MS);
        expect(r.error !== null, `deleteEntryIo SUCCEEDED despite a ${HOLD_LONG_MS} ms lock; removal attempts: [${r.removals.join(", ")}]`);
        expect(/could not remove/.test(r.error.message), `unexpected error text: ${r.error.message}`);
        expect(r.removals.length === RENAME_ATTEMPTS && TRANSIENT.includes(r.removals.at(-1)),
            `after ${r.removals.length} attempt(s) [${r.removals.join(", ")}], expected ${RENAME_ATTEMPTS} transient refusals`);
        expect(fs.existsSync(dpapiKeyToPath(k)), "the file is gone although the removal reported failure");

        return `rejected "${r.error.message}" after ${r.removals.length} attempts [${r.removals.join(", ")}], ${r.elapsedMs} ms after the lock; code ${r.removals.at(-1)}`;
    });

    // ---- S7 -------------------------------------------------------------------------------------------------
    await check("S7", "One PowerShell process for a mixed Credential Manager + dpapi batch", async () => {
        const secretKey = key("s7-secret");
        const blobKey = key("s7-blob");
        const secretValue = synthetic(120, "s7s");
        const blobValue = synthetic(2907, "s7b");
        await wcmWrite(secretKey, secretValue);
        await dpapiWrite(blobKey, blobValue);

        // Calibrate the counter on a spawn that certainly happens, so a counter that sees nothing cannot pass.
        spawnLog = [];
        await runTool({ cmd: process.execPath, args: ["-e", "0"], timeoutMs: 30_000, captureStdout: true });
        const calibrated = spawnLog.length === 1;
        spawnLog = null;
        expect(calibrated, "the spawn-counting instrument saw no spawn on a known spawn; cannot verify the count");

        const cfg = { projectId: SCOPE };
        const refs = [{ name: "s7-secret", decl: { backend: "local", scope: "project" } }];
        const resolver = makeSecretResolver(cfg, ENV);
        const batchCalls = [];
        const run = (args) => {
            batchCalls.push({ keys: args.keys.length, blobs: args.blobs.size });

            return credReadManyIo(args);
        };
        spawnLog = [];
        let batch;
        let spawned;
        try {
            batch = await resolver.readWcmBatch(refs, { pid: sacrificialPid(), run, dpapiKeys: [blobKey] });
        } finally {
            spawned = spawnLog.filter((c) => /(^|[\\/])(powershell|pwsh)(\.exe)?$/i.test(c));
            spawnLog = null;
        }
        expect(batchCalls.length === 1, `the injected run was called ${batchCalls.length} times`);
        expect(spawned.length === 1, `${spawned.length} PowerShell process(es) were spawned for the batch (${spawned.join(", ")})`);
        const got = batch.seeded.get("s7-secret");
        expect(typeof got === "string" && got === secretValue, `the Credential Manager secret did not come back equal (${typeof got === "string" ? "string" : got?.message})`);
        const outcome = batch.dpapiOutcomes.get(blobKey);
        expect(typeof outcome?.ok === "string", `the dpapi blob has no ok outcome: ${JSON.stringify(outcome)}`);
        expect(Buffer.from(outcome.ok, "hex").toString("utf8") === blobValue, "the dpapi blob did not decrypt equal");
        expect(batch.files.get(blobKey) === true, "files did not report the blob as present");
        expect(batch.job === "ok", `job outcome is ${JSON.stringify(batch.job)}, not "ok"`);

        return `1 injected run, 1 PowerShell process; secret ${secretValue.length} B equal, dpapi blob ${blobValue.length} B equal, job "ok" (bound a sacrificial node child, not this process; the lib's run seam counts batch calls, so processes were counted by wrapping child_process.spawn)`;
    });

    // ---- S8 -------------------------------------------------------------------------------------------------
    await check("S8", "Migration: legacy Credential Manager pair + orphan access file", async () => {
        const decl = { tenantId: "t", clientId: "c", scopes: ["scope-a", "scope-b"], scope: "project" };
        const cfg = { projectId: SCOPE };
        const keys = oauthEntryKeys("s8", decl, cfg);
        const identity = { tenantId: decl.tenantId, clientId: decl.clientId, scopes: decl.scopes };
        const legacyRefresh = `legacy-refresh-${synthetic(80, "s8lr")}`;
        const newRefresh = `new-refresh-${synthetic(80, "s8nr")}`;
        const newAccess = synthetic(2907, "s8na");   // above the Credential Manager ceiling, which is the point of the store
        const orphanAccess = `orphan-access-${synthetic(80, "s8oa")}`;
        const longLived = { expiresAt: 9e15, obtainedAt: Date.now(), lifetimeMs: 3_600_000, uptimeAtIssue: os.uptime() };

        // The orphan: a real, decryptable access file with no refresh file beside it.
        await dpapiWrite(keys.access, cache.serializeAccess({ accessToken: orphanAccess, ...longLived }));
        // The legacy pair, as an earlier version left it: the access entry already expired, so a read yields needs-refresh.
        await wcmWrite(keys.refresh, cache.serializeRefresh({ refreshToken: legacyRefresh, ...identity }));
        await wcmWrite(keys.access, cache.serializeAccess({ accessToken: `legacy-access-${synthetic(60, "s8la")}`, expiresAt: 1, obtainedAt: 1, lifetimeMs: 1000, uptimeAtIssue: 1 }));
        expect(cmHas(keys.refresh) && cmHas(keys.access), "precondition: the legacy entries are not visible in cmdkey /list, so their removal could not be observed");
        expect(readDpapiFile(keys.refresh, ENV) === undefined && readDpapiFile(keys.access, ENV) !== undefined, "precondition: the file layout is not 'orphan access file only'");

        const deps = oauthLaunchDeps("s8", decl, cfg, { backend: "dpapi", env: ENV });
        const first = await deps.readCache();
        expect(first.state === "needs-refresh", `readCache answered state "${first.state}", not needs-refresh (the orphan must not be served beside the legacy refresh token)`);
        expect(first.refreshToken === legacyRefresh, `readCache did not return the legacy refresh token (${first.refreshToken?.length ?? "none"} chars)`);

        await deps.writeCache({ accessToken: newAccess, refreshToken: newRefresh, ...longLived });

        const refreshEntry = cache.parseEntry(await dpapiRead(keys.refresh));
        expect(refreshEntry?.refreshToken === newRefresh, "the refresh file does not hold the NEW refresh token");
        // D6 + oauth-token.mjs: removeOrphanAccessFile runs before the refresh file is published, then the access write
        // puts the new access entry in the same file -- so the end state is a NEW access file, not an absent one.
        const accessEntry = cache.parseEntry(await dpapiRead(keys.access));
        expect(accessEntry?.accessToken !== orphanAccess, "the orphan access file is still the access entry");
        expect(accessEntry?.accessToken === newAccess, "the access file does not hold the new access token");
        expect(!cmHas(keys.refresh) && !cmHas(keys.access), "a legacy Credential Manager entry is still listed by cmdkey /list");

        const after = await deps.readCache();
        expect(after.state === "valid" && after.accessToken === newAccess, `a read after the migration answered "${after.state}", not valid with the new access token`);

        return `needs-refresh with the legacy refresh token (${legacyRefresh.length} chars, equal); after writeCache the refresh file holds the new token, the orphan access file was replaced by the new ${newAccess.length}-char access token (end state per code: replaced, not removed), both legacy entries are gone from cmdkey /list, a follow-up read is valid`;
    });

    // ---- S9 -------------------------------------------------------------------------------------------------
    await check("S9", "Logout removes the file and the legacy entry; again -> toolExitCode 3", async () => {
        const k = key("oauth-s9-refresh");
        await dpapiWrite(k, synthetic(300, "s9"));
        await wcmWrite(k, synthetic(300, "s9legacy"));
        expect(cmHas(k) && fs.existsSync(dpapiKeyToPath(k)), "precondition: the file and the legacy entry were not both present");

        const logout = deleteEntryIo("dpapi", ENV);
        await logout(k);
        expect(!fs.existsSync(dpapiKeyToPath(k)), "the file is still there after logout");
        expect(!cmHas(k), "the legacy Credential Manager entry is still listed after logout");

        let second = null;
        try {
            await logout(k);
        } catch (e) {
            second = e;
        }
        expect(second !== null, "a second logout resolved instead of rejecting");
        expect(second.toolExitCode === 3, `a second logout rejected with toolExitCode ${second.toolExitCode}: ${second.message}`);

        return "first logout removed the file and the legacy entry (cmdkey /list agrees); the second rejected with toolExitCode 3";
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
    for (const child of sacrificials) {
        try {
            child.kill();
        } catch { /* already gone */ }
    }
    // cmdkey first: fast, and absent is not an error here.
    for (const k of wcmKeys) {
        spawnSync("cmdkey", [`/delete:${k}`], { windowsHide: true, stdio: "ignore" });
    }
    let left = [];
    try {
        left = cmList().filter((l) => l.includes(SCOPE));
        if (left.length > 0) {
            for (const k of wcmKeys) {
                if (left.some((l) => l.includes(k))) {
                    try {
                        await deleteEntryIo("wcm", ENV)(k);
                    } catch { /* reported by the re-list below */ }
                }
            }
            left = cmList().filter((l) => l.includes(SCOPE));
        }
    } catch (e) {
        left = [`(could not list: ${e.message})`];
    }
    let tmpRemoved = true;
    try {
        fs.rmSync(TMP, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (e) {
        tmpRemoved = false;
        console.log(`could not remove the temp dir ${TMP}: ${e.code ?? e.message}`);
    }
    const ok = left.length === 0 && tmpRemoved;
    const detail = `cmdkey /list lines still containing "${SCOPE}": ${left.length}${left.length > 0 ? ` -> ${left.join(" | ").trim()}` : ""}; temp dir ${tmpRemoved ? "removed" : "NOT removed"}`;
    results.push({ id: "CLEAN", title: "Cleanup", status: ok ? "PASS" : "FAIL", detail });
    console.log(`${ok ? "PASS" : "FAIL"} CLEAN Cleanup -- ${detail}`);
}

// The same table, as markdown, on the run's summary page. Details are HTML-escaped: a CLIXML finding would
// otherwise be read as tags and vanish from the page.
let summaryHeader = [];
function writeStepSummary(fails, passes, skips) {
    const file = process.env.GITHUB_STEP_SUMMARY;
    if (!file) {
        return;
    }
    const cell = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
    const lines = [
        "### vc-secrets smoke on Windows",
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
setTimeout(() => process.exit(fails), 3000).unref();   // a stray handle must not hang a terminal or hold a CI step
