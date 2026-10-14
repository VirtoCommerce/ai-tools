import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as m from "./vc-secrets.mjs";
import * as clients from "./clients.mjs";
import * as t from "./hooks/targets.mjs";
import { CANONICAL_DATA_ID } from "./scripts/shim-path.mjs";
import { stripComments, codeOnly, callArguments, launcherSource, tmpDirs } from "./test-support.mjs";
import {
    LAUNCHER_PATH, launcherEnv, probe, LINK_TYPE, CAN_SYMLINK, CAN_DENY_BY_MODE, CAN_RUN_POSIX_STUB, tmpConfigDir,
    scopedPaths, trustedStateFor, seedTrust, trustedLauncherEnv, OAUTH_TENANT_ID, OAUTH_DECL, OAUTH_CLIENT_ID,
    EMPTY_DECL, KV_PAT, waitFor, stubBinary, NO_TRUST, NS_SERVER, NS_OAUTH_SERVER, namespaceCfg, namespaceOauthCfg,
    SECRET_PAT, POSIX_STUB_ONLY, namespaceRepo, keychainRecorder, runVerb, corruptTrustFile, NS_PAT_PROJECT,
    trustRepo,
} from "./test-fixtures.mjs";

// One test reproduces a SHELL expansion, so it drives this node THROUGH a bash -- and the probe has to
// ask that whole question, not half of it. Two weaker forms were measured and both are wrong. `node -e 0`
// is false wherever node is merely off PATH, which costs the test on a POSIX machine for a reason the
// test does not depend on. `exit 0` is false nowhere useful: it accepts a bash that cannot reach this
// node at all, and on Windows the bash on PATH is WSL's -- a different filesystem namespace, where
// `C:\...\node.exe` is not an executable path and the run dies at 127 having proved nothing. Naming
// process.execPath here, exactly as the call site does, is the question that matches the usage.
const CAN_RUN_BASH = probe(() =>
    spawnSync("bash", ["-c", `${JSON.stringify(process.execPath)} -e 0`]).status === 0);

// The group-kill tests drive a real launcher over a real POSIX process group and a `sh` script. Named
// for the pair, because a machine can have either half alone: win32 has no process groups to kill, and a
// stripped container may have no sh.
const CAN_ORPHAN_A_GROUP = process.platform !== "win32"
    && probe(() => spawnSync("sh", ["-c", "exit 0"]).status === 0);

// The probes' own control, and the reason it exists: `probe()` answers false for ANY exception, so a
// broken probe -- a renamed local, a moved probeDir, a dropped import -- turns every test gated on it
// into a skip while the run stays green. Nothing else in the suite would notice; the totals move and
// no assertion fires. That is this file's own subject pointed at the instrument it just gained, since
// a false from an unvalidated probe is indistinguishable from a capability the machine truly lacks.
//
// Only the two a POSIX machine cannot legitimately lack are asserted. CAN_RUN_POSIX_STUB is not: off
// win32 it is true by short-circuit, so asserting it would pin nothing. CAN_RUN_BASH is not: a minimal
// container has no bash, and that is a real answer rather than a broken instrument.
test("capability probes: the ones a POSIX machine cannot lack answer true", {
    skip: process.platform === "win32" && "these ask about the machine, and win32 may honestly lack both",
}, () => {
    assert.ok(CAN_SYMLINK,
        "a POSIX machine creates a symlink in its own tmpdir -- a false here is a broken probe, not a platform");
    assert.ok(CAN_DENY_BY_MODE || process.getuid?.() === 0,
        "mode bits deny a read for everyone but root -- a false here as non-root is a broken probe");
});

test("cmdRun: child gets literal env, legacy + dangerous vars stripped, exit code forwarded, stdout silent", () => {
    const dir = tmpConfigDir({
        secrets: {},
        servers: { probe: { command: process.execPath,
            args: ["-e", "if(process.env.PROBE!=='v'||process.env.ADO_MCP_AUTH_TOKEN||process.env.NODE_OPTIONS){process.exit(9)};process.exit(7)"],
            env: { PROBE: "literal:v" } } },
    });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "run", "probe"],
        { env: trustedLauncherEnv(dir, { ADO_MCP_AUTH_TOKEN: "stale", NODE_OPTIONS: "--max-old-space-size=4096" }), encoding: "utf8" });
    assert.equal(r.status, 7);
    assert.equal(r.stdout, "");
});

test("cmdRun: unknown server → exit 1, single-line stderr without stack", () => {
    const dir = tmpConfigDir({ secrets: {}, servers: {} });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "run", "ghost"],
        { env: launcherEnv({ VC_SECRETS_CONFIG_DIR: dir }), encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /unknown server/);
    assert.ok(!r.stderr.includes("    at "), "no stack frames");
    assert.equal(r.stdout, "");
});

// Source-text assertions below read a function body, and a body carries comments. Matching the raw
// text lets a comment stand in for the code it describes: `// was: spawnSyncProcess = spawnSync` and
// `// killProcessTree(child, signal)` each satisfied the guard for the thing they replaced.
// `stripComments` (test-support.mjs) is the one stripper: string-, template- and regex-literal-aware.
// Its parity with a parser is a procedure, not a standing check: after changing it, compare its
// output with a JavaScript parser's own comment ranges.

// The launcher with its comments removed, and a body sliced out of THAT. Order is the point: a body is
// cut at the first "\n}\n" after its name, so slicing the raw text first lets a comment that mentions the
// name -- or a block comment holding a column-0 brace -- move the cut, and stripping afterwards only
// tidies what was already mis-cut. Every source-inspecting test below slices through these two.
function strippedLauncherSource() {
    return stripComments(launcherSource());
}

function strippedBodyOf(name, source = strippedLauncherSource()) {
    const start = source.indexOf(name);
    assert.notEqual(start, -1, `${name} moved`);
    const end = source.indexOf("\n}\n", start);
    assert.notEqual(end, -1, `the end of ${name} moved`);

    return source.slice(start, end);
}

test("stripComments: removes comments and only comments", () => {
    // The source-text tests in this package match on stripped text, so a stripper that cuts too little
    // lets a comment satisfy a match, and one that cuts too much hides code behind a "comment" that was
    // really a literal. Every case here is a construct that has to survive or die on its own.
    // The regex cases are the ones a string-only stripper gets wrong: a quote or a `//` inside a regex
    // literal opens a string or a comment that swallows the rest of the file.
    const cases = [
        ["a URL in a string survives", 'const u = "http://x"; // c', 'const u = "http://x"; '],
        ["a regex of slashes survives whole", "const r = /\\/\\//g; // c", "const r = /\\/\\//g; "],
        ["a regex holding both quotes survives", "const q = /[\"']/; // c", "const q = /[\"']/; "],
        ["a slash after `return` opens a regex", "return /\\/\\//.test(x); // c", "return /\\/\\//.test(x); "],
        ["a slash between operands divides", "a / b // c", "a / b "],
        ["a template keeps a // inside it", "const t = `a // b`; // c", "const t = `a // b`; "],
        ["a template nested in an expression of a template", "const t = `x ${`y // ${z}`} // w`; // c", "const t = `x ${`y // ${z}`} // w`; "],
        ["a comment inside an expression of a template is a comment", "const t = `${a /* c */ + b}`;", "const t = `${a  + b}`;"],
        ["a block comment leaves its newlines", "a /* x\ny\nz */ b", "a \n\n b"],
    ];
    for (const [name, source, expected] of cases) {
        assert.equal(stripComments(source), expected, name);
    }
    // codeOnly is the same scan with every literal blanked, so a word inside a literal is not a token.
    assert.ok(!/\bimport\b/.test(codeOnly("const a = `--import \"${x}\"`;")), "a template's text is not code");
    assert.ok(!/\bimport\b/.test(codeOnly('const a = "import";')), "a string's text is not code");
    assert.ok(!/\bimport\b/.test(codeOnly("const a = /import/;")), "a regex's text is not code");
    assert.equal(codeOnly('import x from "./a.mjs"; // c'), 'import x from "./a.mjs"; ', "a module specifier is kept");
    assert.equal(codeOnly('import "./a.mjs"; // c'), 'import "./a.mjs"; ', "a side-effect import's specifier is kept");
    assert.equal(codeOnly("const a = `l1\nl2`;"), "const a = `  \n  `;", "blanking keeps newlines");
});

const LIB_LAYERS = ["util", "spawn", "config", "keystore", "trust", "oauth-token", "oauth-login", "oauth-checks", "launch", "doctor", "cli"];

// The package modules lib/ may depend on: exactly the ones the launcher depended on before the split.
// Listed, not walked: a walk would admit vc-secrets-probe.mjs, which imports the entry, and so a cycle
// lib -> probe -> entry -> lib. A new dependency is an edit to this list, made on purpose.
const LIB_SIBLINGS = new Set(["vc-secrets-error.mjs", "clients.mjs", "scripts/shim-path.mjs", "vc-secrets-cache.mjs",
    "vc-secrets-oauth.mjs", "vc-secrets-target.mjs", "vc-secrets-teardown.mjs"]);

test("lib: every layer exists, is listed, and depends only on layers below it", () => {
    // Bottom-up. Checked on every module specifier the code names -- static, re-export, side-effect
    // or dynamic, either quote -- because a dependency spelled differently is still a dependency.
    // Read through codeOnly, so `--import "${x}"` inside a template is text, not a dependency.
    const libDir = fileURLToPath(new URL("./lib/", import.meta.url));
    const files = fs.readdirSync(libDir).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs")).map((f) => f.slice(0, -4)).sort();
    assert.deepEqual(files, [...LIB_LAYERS].sort(), "a lib/ module is missing from LIB_LAYERS, or a listed one is gone");
    for (const layer of LIB_LAYERS) {
        const source = codeOnly(fs.readFileSync(path.join(libDir, `${layer}.mjs`), "utf8"));
        assert.doesNotMatch(source, /\bimport\s*\(/, `lib/${layer}.mjs: no dynamic import`);
        for (const [, , spec] of source.matchAll(/\b(?:from|import)\s*(["'])([^"']+)\1/g)) {
            const below = /^\.\/([^/]+)\.mjs$/.exec(spec);
            const ok = spec.startsWith("node:")
                || (spec.startsWith("../") && LIB_SIBLINGS.has(spec.slice(3)))
                || (below !== null && LIB_LAYERS.indexOf(below[1]) >= 0 && LIB_LAYERS.indexOf(below[1]) < LIB_LAYERS.indexOf(layer));
            assert.ok(ok, `lib/${layer}.mjs depends on "${spec}", which is not node:, a package sibling, or a layer below it`);
        }
    }
});

test("the shim in this package declares the contract the launcher requires", () => {
    // A freshly installed shim must not make `doctor` warn that it is stale, so the two constants move
    // together; only an installed copy left behind by an older plugin version should ever trail.
    const shimSource = fs.readFileSync(new URL("./vc-secrets-shim.mjs", import.meta.url), "utf8");
    const declared = /^const SHIM_CONTRACT = (\d+);$/m.exec(shimSource);
    assert.ok(declared, "the shim declares SHIM_CONTRACT");
    assert.equal(Number(declared[1]), m.REQUIRED_SHIM_CONTRACT);
});

test("runCli: the contract the shim passes reaches doctor through main", () => {
    // Through the real entry, because the wiring under test is runCli -> main -> cmdDoctor, and a direct
    // cmdDoctor call would skip what runCli adds: its process-wide handlers and hardenSpawnEnv. Pinned to
    // gpg, the one backend doctor does not write-probe, and the declaration is empty, so nothing reads or
    // writes a credential store; HOME is a fixture.
    const env = launcherEnv({ VC_SECRETS_LOCAL_BACKEND: "gpg" });
    const root = namespaceRepo(EMPTY_DECL);
    const script = `import(${JSON.stringify(pathToFileURL(LAUNCHER_PATH).href)})`
        + `.then((m) => m.runCli(["doctor"], { shimContract: 1 }));`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script],
        { cwd: root, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(run.signal, null, `doctor did not finish: ${run.stderr}`);
    assert.match(run.stderr, /installed shim speaks contract 1, this launcher expects 2/, run.stderr);
});

test("cmdDoctor: nothing on the doctor path can exchange a token", () => {
    // Pinned as a property of the code rather than of one run: proving a token is refreshable would
    // rotate the refresh token as a side effect of a diagnostic, and the rotation is irreversible.
    // Stays a source test deliberately: it is a negative property of every path, and a spy sees only
    // the calls made through it -- a direct oauth.exchange(...) added to cmdDoctor or readCache would
    // bypass any injected double and leave a behaviour test green.
    // The negative guards read RAW source: a stripper that misreads a literal cuts at the `//` inside it
    // (a URL, say) and would hide a real call after it, and a comment mentioning `exchange(` costs a
    // false failure at worst. Only the positive `readCache()` match reads stripped source, because a
    // comment could satisfy it.
    const raw = launcherSource();
    const stripped = strippedLauncherSource();
    // Both halves of the path, because the risk lives in the half cmdDoctor CALLS: making readCache
    // exchange on needs-refresh -- which is what ensureFreshToken does -- would leave a test that only
    // reads cmdDoctor green. A call shape rather than the bare word, so a comment mentioning the
    // exchange cannot fail it.
    assert.ok(!/\bexchange\(/.test(strippedBodyOf("async function cmdDoctor", raw)), "cmdDoctor must not reach the exchange");
    const readCacheStart = raw.indexOf("readCache: async () => {");
    assert.notEqual(readCacheStart, -1, "readCache moved");
    const readCacheBody = raw.slice(readCacheStart, raw.indexOf("writeCache:", readCacheStart));
    assert.ok(!/\bexchange\(/.test(readCacheBody),
        "readCache is the half cmdDoctor CALLS -- an exchange added there would leave a cmdDoctor-only test green");
    assert.ok(/readCache\(\)/.test(strippedBodyOf("async function cmdDoctor", stripped)), "it reads the cache");
});

test("oauthTenantChecks: driven by the declaration, preferring the reference once one exists", () => {
    // The reference appears only with the switch, and a tenant-binding mistake is worth catching at
    // SETUP -- otherwise the one check that turns it into a named finding stays dormant through
    // exactly the phase where someone would fix it cheaply. Source-inspected for the shape of the loop
    // itself; that cmdDoctor calls THIS function, not a lookalike, is a test in lib/doctor.test.mjs.
    // Comments stripped before the slice.
    const body = strippedBodyOf("async function oauthTenantChecks");
    assert.notEqual(body, "", "oauthTenantChecks moved");
    assert.match(body, /Object\.entries\(cfg\.oauth/, "the tenant loop must be driven by the declaration");
    assert.match(body, /references\.find/, "and still prefer the reference once one exists");
});

// ---------------------------------------------------------------------------------------------
// cmdLaunch — the real launch path: resolve, refuse a second oauth reference, acquire
// and deliver a token through the channel for the ones that carry one, spawn, and forward signals.
// Ported from mcpw.js's cmdRun and mcpw.test.js's own cmdRun test block, with the naming map
// applied: cmdRun(server, cfg, deps) -> cmdLaunch(kind, name, cfg, deps), McpwError ->
// VcSecretsError, MCPW_* -> VC_SECRETS_*.
// The cmdLaunch tests that need a real bound channel run under channelTest, in lib/launch.test.mjs and
// vc-secrets-oauth.test.mjs -- these do not reach createChannel at all, so a plain `test` is enough.
// ---------------------------------------------------------------------------------------------

test("every in-process launch call (cmdLaunch, or the cmdRun/cmdTask wrappers around it) in the test sources states its bind platform", () => {
    // Left unset, cmdLaunch binds the launching process to a kill-on-close job on win32 through a real
    // PowerShell -- and here that process is the test runner. Nothing fails on a Linux run, so the
    // omission only shows on the Windows leg, as a runner that dies with the job. cmdRun and cmdTask
    // forward their deps to cmdLaunch and default to none, so they bind the runner exactly as it does.
    // The platform must be a literal INSIDE the call's own arguments: a comment, `bindPlatform:
    // undefined`, or a literal belonging to the next statement leaves the bind on its win32 default.
    // Every test source is scanned -- the *.test.mjs files, test-support.mjs and test-fixtures.mjs,
    // walked, so a file split off later is covered on arrival. Residuals, stated rather than left to
    // be found: a helper that spreads caller deps AFTER its literal (`launch`) can still be overridden by
    // its caller, a literal nested deeper in the arguments (`{ deps: { bindPlatform: "linux" } }`)
    // satisfies the match without reaching cmdLaunch, a string argument containing the literal
    // satisfies it too, and a call through another alias or a destructured binding is not seen at all
    // -- the floor below reds when an existing call becomes unseen that way, but a new call written so
    // passes beside the ones it still sees.
    const callSite = /m\.(?:cmdLaunch|cmdTask|cmdRun)\(/g;
    const root = fileURLToPath(new URL("./", import.meta.url));
    const walk = (dir, prefix = "") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        (e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
    const files = walk(root).filter((f) => f.endsWith(".test.mjs") || f === "test-support.mjs" || f === "test-fixtures.mjs");
    assert.ok(files.includes("vc-secrets.test.mjs") && files.includes("vc-secrets-oauth.test.mjs"), files.join(","));
    let inspected = 0;
    for (const file of files) {
        const source = stripComments(fs.readFileSync(path.join(root, file), "utf8"));
        const blanked = codeOnly(source);
        for (const hit of source.matchAll(callSite)) {
            const where = `${file}:${source.slice(0, hit.index).split("\n").length}`;
            let args;
            try {
                args = callArguments(source, hit.index + hit[0].length, blanked);
            } catch (error) {
                throw new Error(`${where}: ${error.message}`, { cause: error });
            }
            assert.match(args, /bindPlatform:\s*"[^"]+"/, `${where} launches in-process without a literal bind platform`);
            inspected += 1;
        }
    }
    // 8 in lib/launch.test.mjs and 2 in vc-secrets-oauth.test.mjs when this was written. An existing
    // call renamed or destructured would match nothing and pass; the floor makes that a red.
    assert.ok(inspected >= 10, `only ${inspected} in-process launch calls found, below the floor of 10: either calls were removed (lower the floor on purpose) or the call-site pattern no longer reaches them`);
});

// Signal 0 says a process exists, and a killed one whose parent never reaps it -- PID 1 of a container
// with no init -- keeps answering it as a zombie. Those are dead for this purpose.
function processIsAlive(pid) {
    try {
        process.kill(pid, 0);
    } catch {
        return false;
    }
    try {
        return !/^\d+ \(.*\) Z/.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
    } catch {
        return true;   // no /proc: signal 0 answering is all there is to go on
    }
}

// A server whose direct child (sh) starts a grandchild that ignores TERM, HUP and QUIT -- the shape of an npx
// wrapper over a server that traps them -- and then waits on it. The grandchild records its OWN pid
// (`$$` of a fresh sh, not of the subshell that would inherit the parent's).
async function assertGroupDiesWith(signal) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-orphan-"));
    tmpDirs.push(dir);
    const pidFile = path.join(dir, "grandchild.pid");
    // No double quote anywhere: a declaration refuses one, for Windows' sake.
    const script = "sh -c 'trap : TERM HUP QUIT; echo $$ > $PIDFILE; while :; do sleep 1; done' &\nwait\n";
    const configDir = tmpConfigDir({ secrets: {}, servers: {
        orphan: { command: "sh", args: ["-c", script], env: { PIDFILE: `literal:${pidFile}` } } } });
    const launcher = spawn(process.execPath, [LAUNCHER_PATH, "run", "orphan"],
        { env: trustedLauncherEnv(configDir), stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    launcher.stderr.on("data", (d) => { stderr += d; });
    const exited = new Promise((resolve) => launcher.once("exit", resolve));
    let grandchild = null;
    try {
        // Written by `echo`, so an empty read is the file caught between its creation and its content.
        grandchild = Number(await waitFor(() => {
            try {
                return fs.readFileSync(pidFile, "utf8").trim();
            } catch {
                return "";
            }
        }, { timeoutMs: 10_000 }));
        assert.ok(grandchild > 0, `the grandchild never started: ${stderr}`);
        assert.ok(processIsAlive(grandchild), "the fixture must be running before the signal, or the test proves nothing");

        launcher.kill(signal);
        await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 10_000))]);
        assert.ok(launcher.exitCode !== null || launcher.signalCode !== null, `the launcher must exit on ${signal}: ${stderr}`);

        const gone = await waitFor(() => !processIsAlive(grandchild), { timeoutMs: 2000 });
        assert.ok(gone, `a group member that ignores ${signal} must not outlive the launcher: ${stderr}`);
    } finally {
        launcher.kill("SIGKILL");
        if (grandchild) {
            try {
                process.kill(grandchild, "SIGKILL");
            } catch { /* already gone */ }
        }
    }
}

test("cmdLaunch: a group member that ignores SIGTERM does not outlive the launcher",
    { skip: !CAN_ORPHAN_A_GROUP && "needs POSIX process groups and an sh to build the fixture with", timeout: 60_000 },
    () => assertGroupDiesWith("SIGTERM"));

// What a closing terminal delivers. Unhandled, it kills the launcher outright and leaves the detached
// group standing.
test("cmdLaunch: a group member that ignores SIGHUP does not outlive the launcher",
    { skip: !CAN_ORPHAN_A_GROUP && "needs POSIX process groups and an sh to build the fixture with", timeout: 60_000 },
    () => assertGroupDiesWith("SIGHUP"));

// Ctrl-\ in a task's terminal: the child is in a session of its own, so only the launcher receives it, and
// the default action kills the launcher without running the "exit" handler that takes the group down.
test("cmdLaunch: a group member that ignores SIGQUIT does not outlive the launcher",
    { skip: !CAN_ORPHAN_A_GROUP && "needs POSIX process groups and an sh to build the fixture with", timeout: 60_000 },
    () => assertGroupDiesWith("SIGQUIT"));

// The other half of the orphan problem: it is the DIRECT child that traps TERM, so the launcher has
// nothing to exit on and its own "exit" handler never gets to run. The MCP client SIGKILLs a launcher
// that outlasts its shutdown window, and SIGKILL runs no handler -- so the group has to be gone before
// that, by the launcher's own escalation. `trap ''` is inherited across exec, so the sleeps ignore TERM too.
test("cmdLaunch: a direct child that traps SIGTERM is escalated to SIGKILL, and the launcher and group go",
    { skip: !CAN_ORPHAN_A_GROUP && "needs POSIX process groups and an sh to build the fixture with", timeout: 60_000 },
    async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-trap-"));
        tmpDirs.push(dir);
        const directFile = path.join(dir, "direct.pid");
        const grandchildFile = path.join(dir, "grandchild.pid");
        // No double quote anywhere: a declaration refuses one, for Windows' sake.
        const script = "trap '' TERM\necho $$ > $DIRECT_PIDFILE\n"
            + "sh -c 'trap : TERM HUP; echo $$ > $GRANDCHILD_PIDFILE; while :; do sleep 1; done' &\n"
            + "while :; do sleep 1; done\n";
        const configDir = tmpConfigDir({ secrets: {}, servers: {
            stubborn: { command: "sh", args: ["-c", script],
                env: { DIRECT_PIDFILE: `literal:${directFile}`, GRANDCHILD_PIDFILE: `literal:${grandchildFile}` } } } });
        const launcher = spawn(process.execPath, [LAUNCHER_PATH, "run", "stubborn"],
            { env: trustedLauncherEnv(configDir), stdio: ["ignore", "ignore", "pipe"] });
        let stderr = "";
        launcher.stderr.on("data", (d) => { stderr += d; });
        const exited = new Promise((resolve) => launcher.once("exit", resolve));
        const readPid = (file) => Number(fs.readFileSync(file, "utf8").trim());
        const pidWritten = (file) => () => {
            try {
                return readPid(file) > 0;
            } catch {
                return false;
            }
        };
        let direct = null;
        let grandchild = null;
        try {
            const started = await waitFor(() => pidWritten(directFile)() && pidWritten(grandchildFile)(), { timeoutMs: 10_000 });
            assert.ok(started, `the fixture never wrote both pid files: ${stderr}`);
            direct = readPid(directFile);
            grandchild = readPid(grandchildFile);
            assert.ok(processIsAlive(direct) && processIsAlive(grandchild),
                `the fixture must be running before the signal, or the test proves nothing: ${stderr}`);

            launcher.kill("SIGTERM");
            // Three seconds leaves room for a loaded machine without approaching the 5 s a forgotten
            // escalation would take from the unref'd default. It cannot tell the server delay from twice
            // that -- a wall-clock bound that tight would flake on a loaded machine -- so the delay is held
            // under mock timers, by "several forwarded signals arm one escalation", and its magnitude by
            // "a server's escalation finishes inside the shortest window found in the MCP SDK".
            await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 3000))]);
            assert.ok(launcher.exitCode !== null || launcher.signalCode !== null,
                `the launcher must leave once its child ignores SIGTERM: ${stderr}`);
            assert.equal(launcher.signalCode, null, "the launcher must leave by its own exit, not be killed from outside");

            const gone = await waitFor(() => !processIsAlive(direct) && !processIsAlive(grandchild), { timeoutMs: 1000 });
            assert.ok(gone, `neither the SIGTERM-ignoring child nor its group may outlive the launcher: ${stderr}`);
        } finally {
            launcher.kill("SIGKILL");
            // Read again rather than trusting the variables: a failure before they were assigned would
            // otherwise leave SIGTERM-ignoring loops running on the machine for good.
            direct ??= pidWritten(directFile)() ? readPid(directFile) : null;
            grandchild ??= pidWritten(grandchildFile)() ? readPid(grandchildFile) : null;
            if (direct) {
                try {
                    process.kill(-direct, "SIGKILL");
                } catch { /* already gone */ }
            }
            if (grandchild) {
                try {
                    process.kill(grandchild, "SIGKILL");
                } catch { /* already gone */ }
            }
        }
    });

// stdin relay (POSIX servers). Real processes first: they are the only thing that observes the EOF
// reaching the launcher rather than the server.

// A server that echoes its stdin to its stdout. The launcher's own stdout is the client's, so what comes
// back is what the child wrote there directly, and what went in went through the launcher's pipe.
test("cmdLaunch: a server's stdin and stdout pass through the launcher byte for byte",
    { skip: !CAN_ORPHAN_A_GROUP && "needs POSIX process groups", timeout: 60_000 },
    async () => {
        const configDir = tmpConfigDir({ secrets: {}, servers: {
            echo: { command: process.execPath, args: ["-e", "process.stdin.pipe(process.stdout)"], env: {} } } });
        const launcher = spawn(process.execPath, [LAUNCHER_PATH, "run", "echo"],
            { env: trustedLauncherEnv(configDir), stdio: ["pipe", "pipe", "pipe"] });
        let stderr = "";
        launcher.stderr.on("data", (d) => { stderr += d; });
        const chunks = [];
        launcher.stdout.on("data", (d) => chunks.push(d));
        const exited = new Promise((resolve) => launcher.once("exit", (code, signal) => resolve({ code, signal })));
        try {
            // Every byte value, more than once and larger than a pipe buffer (64 KiB): it is not valid
            // UTF-8, and it cannot be written in one go without backpressure being honoured.
            const payload = Buffer.alloc(300_000);
            for (let i = 0; i < payload.length; i++) {
                payload[i] = i % 256;
            }
            launcher.stdin.end(payload);
            const result = await Promise.race([exited, new Promise((resolve) => setTimeout(resolve, 20_000, "timeout"))]);
            assert.notEqual(result, "timeout", `the launcher never left after its stdin closed: ${stderr}`);
            assert.deepEqual(result, { code: 0, signal: null }, stderr);
            assert.ok(Buffer.concat(chunks).equals(payload), "what the server echoed is what the client sent");
        } finally {
            launcher.kill("SIGKILL");
        }
    });

// The SDK's server transport has no end handler, so a server like this one never leaves on EOF; the
// grandchild is the npx-over-node shape, where the thing holding the secrets is not the direct child.
// The 2 s client window is owned by the arithmetic test on LAUNCH_STDIN_CLOSE_GRACE_MS; the bound here is loose on purpose, to stay off the CI flake edge.
test("cmdLaunch: a server that ignores stdin EOF, and its grandchild, are torn down by the launcher after EOF",
    { skip: !CAN_ORPHAN_A_GROUP && "needs POSIX process groups", timeout: 60_000 },
    async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-eof-"));
        tmpDirs.push(dir);
        const pidFile = path.join(dir, "pids");
        // No double quote anywhere: a declaration refuses one, for Windows' sake. Written whole in one
        // call, so a reader never sees the first pid without the second.
        const script = "const g = require('child_process').spawn(process.execPath, "
            + "['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });\n"
            + "require('fs').writeFileSync(process.env.PIDFILE, process.pid + ' ' + g.pid);\n"
            + "setInterval(() => {}, 1000);\n";
        const configDir = tmpConfigDir({ secrets: {}, servers: {
            stubborn: { command: process.execPath, args: ["-e", script], env: { PIDFILE: `literal:${pidFile}` } } } });
        const launcher = spawn(process.execPath, [LAUNCHER_PATH, "run", "stubborn"],
            { env: trustedLauncherEnv(configDir), stdio: ["pipe", "ignore", "pipe"] });
        let stderr = "";
        launcher.stderr.on("data", (d) => { stderr += d; });
        const pids = () => {
            try {
                const parts = fs.readFileSync(pidFile, "utf8").trim().split(" ").map(Number);

                return parts.length === 2 && parts.every((n) => n > 0) ? parts : null;
            } catch {
                return null;
            }
        };
        let started = null;
        try {
            started = await waitFor(pids, { timeoutMs: 10_000 });
            assert.ok(started, `the fixture never wrote its pids: ${stderr}`);
            const [direct, grandchild] = started;
            assert.ok(processIsAlive(direct) && processIsAlive(grandchild),
                `the fixture must be running before stdin closes, or the test proves nothing: ${stderr}`);

            // The client's first step. Its second, a SIGTERM, comes 2 s later -- if the client is alive at all.
            launcher.stdin.end();
            const closedAt = Date.now();
            const gone = await waitFor(() => launcher.exitCode !== null
                && !processIsAlive(direct) && !processIsAlive(grandchild), { timeoutMs: 6000 });
            assert.ok(gone, `after ${Date.now() - closedAt} ms the launcher, the server or its grandchild was still running: ${stderr}`);
            assert.equal(launcher.signalCode, null, "the launcher must leave by its own exit, not be killed from outside");
        } finally {
            launcher.kill("SIGKILL");
            for (const pid of started ?? pids() ?? []) {
                try {
                    process.kill(pid, "SIGKILL");
                } catch { /* already gone */ }
            }
        }
    });

// A server that closes its stdin and keeps running. The launcher learns of it only by writing, and what
// the client wrote after that sits unread in the launcher's own stdin with the EOF behind it. Without the
// launcher draining it, the EOF is never seen: the grace timer never starts and the tree outlives the client.
test("cmdLaunch: a server that closed its stdin and kept running is still torn down after the client's EOF behind unread input",
    { skip: !CAN_ORPHAN_A_GROUP && "needs POSIX process groups", timeout: 60_000 },
    async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-epipe-"));
        tmpDirs.push(dir);
        const marker = path.join(dir, "closed");
        // No double quote anywhere: a declaration refuses one, for Windows' sake.
        const script = "require('fs').closeSync(0);\n"
            + "require('fs').writeFileSync(process.env.MARKER, String(process.pid));\n"
            + "setInterval(() => {}, 1000);\n";
        const configDir = tmpConfigDir({ secrets: {}, servers: {
            deaf: { command: process.execPath, args: ["-e", script], env: { MARKER: `literal:${marker}` } } } });
        const launcher = spawn(process.execPath, [LAUNCHER_PATH, "run", "deaf"],
            { env: trustedLauncherEnv(configDir), stdio: ["pipe", "ignore", "pipe"] });
        let stderr = "";
        launcher.stderr.on("data", (d) => { stderr += d; });
        const readPid = () => {
            try {
                const pid = Number(fs.readFileSync(marker, "utf8"));

                return pid > 0 ? pid : null;
            } catch {
                return null;
            }
        };
        let serverPid = null;
        try {
            serverPid = await waitFor(readPid, { timeoutMs: 10_000 });
            assert.ok(serverPid, `the fixture never closed its stdin: ${stderr}`);
            // The first write is what raises EPIPE in the launcher. The pause lets it be handled before the
            // rest arrives: written together, the bytes and the EOF would all be read before the error.
            launcher.stdin.write(Buffer.alloc(1024, 1));
            await new Promise((resolve) => setTimeout(resolve, 500));
            // Behind the EOF, and unread by a launcher that stopped draining.
            launcher.stdin.write(Buffer.alloc(1024, 2));
            launcher.stdin.end();
            const closedAt = Date.now();
            const gone = await waitFor(() => launcher.exitCode !== null && !processIsAlive(serverPid), { timeoutMs: 8000 });
            assert.ok(gone, `after ${Date.now() - closedAt} ms the launcher or the server was still running: ${stderr}`);
            assert.equal(launcher.signalCode, null, "the launcher must leave by its own exit, not be killed from outside");
        } finally {
            launcher.kill("SIGKILL");
            const pid = serverPid ?? readPid();
            if (pid) {
                try {
                    process.kill(pid, "SIGKILL");
                } catch { /* already gone */ }
            }
        }
    });

test("PRELOAD_PATH is anchored beside the launcher module, never against argv[1]", () => {
    // The launcher is normally entered through vc-secrets-shim.mjs, so argv[1] is the shim in the
    // plugin DATA dir while the preload sits beside vc-secrets.mjs in the versioned plugin CACHE.
    // Anchoring on argv[1] yields a path that exists, is wrong, and produces a child that starts
    // fine and never renews.
    //
    // A same-directory equality check cannot tell the two mechanisms apart: this test file lives
    // beside vc-secrets.mjs, so under `node --test` argv[1] (this file's own path) already
    // resolves to the same directory an import.meta.url anchor would. So the fixture is a launcher
    // entered from somewhere ELSE: an entry script written to a fresh tmp dir that imports
    // vc-secrets.mjs and reports its PRELOAD_PATH, exactly as vc-secrets-shim.mjs does in production.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-argv-"));
    tmpDirs.push(dir);
    const entry = path.join(dir, "elsewhere.mjs");
    // A file URL, not the path: an ESM specifier is a URL, so on Windows the drive letter reads as a
    // protocol. The separators survive only because JSON.stringify escapes them -- say so, or the next
    // reader concludes the escaping is the bug. On POSIX path and URL coincide.
    fs.writeFileSync(entry, `
        import * as m from ${JSON.stringify(pathToFileURL(LAUNCHER_PATH).href)};
        process.stdout.write(m.PRELOAD_PATH);
    `);
    const { stdout, stderr } = spawnSync(process.execPath, [entry], { encoding: "utf8" });
    assert.equal(stdout, path.join(path.dirname(LAUNCHER_PATH), "vc-secrets-preload.mjs"), stderr);
});

// ── regressions: keystore absence and declaration loading ──────────────────────────────────────────

test("stubBinary: on win32 writes a .sh body plus a .cmd launcher naming it", () => {
    const dir = stubBinary("gpg", "#!/bin/sh\nexit 0\n", "win32");
    assert.ok(fs.existsSync(path.join(dir, "gpg.sh")));
    assert.match(fs.readFileSync(path.join(dir, "gpg.cmd"), "utf8"), /gpg\.sh/);
});

const GUARD_HOOK_PATH = fileURLToPath(new URL("./hooks/guard-declarations.mjs", import.meta.url));

function runGuardHook(stdinText) {
    return spawnSync(process.execPath, [GUARD_HOOK_PATH], { input: stdinText, encoding: "utf8" });
}

function guardInput(filePath) {
    return JSON.stringify({ tool_input: { file_path: filePath } });
}

// ── hooks/guard-declarations.mjs ───────────────────────────────────────────────────────────────────

test("guard-declarations: blocks the project declaration <repo>/.claude/vc-secrets.json", () => {
    const r = runGuardHook(guardInput("/repo/.claude/vc-secrets.json"));
    assert.equal(r.status, 2);
    assert.match(r.stderr, /BLOCK/);
});

test("guard-declarations: blocks its .local.json sibling", () => {
    const r = runGuardHook(guardInput("/repo/.claude/vc-secrets.local.json"));
    assert.equal(r.status, 2);
});

test("guard-declarations: allows an ordinary source file", () => {
    const r = runGuardHook(guardInput("/repo/src/index.js"));
    assert.equal(r.status, 0);
});

test("guard-declarations: allows .claude/settings.json", () => {
    const r = runGuardHook(guardInput("/repo/.claude/settings.json"));
    assert.equal(r.status, 0);
});

test("guard-declarations: unparseable stdin is reported and does not block", () => {
    // Exit 0 is the decided answer and this pins it: a guard that cannot read its own input must not
    // block work over a fault that is ours. The report is the other half. What reaches this branch is
    // stdin that does not parse, or an fd 0 that cannot be read at all -- nobody in this repository
    // causes either and nothing else announces them, so without the line the guard stops inspecting
    // and reads exactly like one that inspected and allowed. "guard: an unreadable payload is
    // reported and does not block" draws the same pair for the sibling fail-open, which IS the
    // shape-the-guard-no-longer-understands branch: that payload parsed, and targetsFrom refused it.
    const r = runGuardHook("not json");
    assert.equal(r.status, 0);
    assert.match(r.stderr, /not inspected/);
});

test("guard-declarations: an unparseable payload is reported without any of its bytes", () => {
    // fd 0 here carries the client's tool payload -- the file content about to be written -- so V8's
    // parse message is built out of a credential. It has three shapes and the one that leaks most is
    // the whole input, which is what a short payload produces. The launcher answers this by rebuilding
    // the reason from digits; the guard cannot import that helper and answers by carrying no part of
    // the message at all.
    // Deliberately not shaped like a real credential: this repository is public, and a fixture that
    // merely LOOKS like a token is enough to trip a host's secret scanner and block the push. What
    // the assertion needs is a string V8 will carry, not a realistic one -- and only its first ten
    // or so characters survive, because the window is clipped on both sides.
    const canary = "LEAKCANARY0123456789";
    // An UNQUOTED value on purpose. A payload that merely ends early fails at its last position and
    // V8 answers with the positional shape, which carries nothing -- so the assertion below would
    // pass without the fix and the test would be green for the wrong reason. The control after it
    // is what holds that shut.
    const payload = `{"tool_input":{"content":${canary}}}`;
    const r = runGuardHook(payload);

    assert.equal(r.status, 0);
    assert.match(r.stderr, /not valid JSON/);
    assert.doesNotMatch(r.stderr, /LEAKCANARY|content|tool_input/,
        "no window of the payload may travel with the reason");

    let raw = "";
    try {
        JSON.parse(payload);
    } catch (e) {
        raw = e.message;
    }
    assert.match(raw, /LEAKCANARY/,
        "the control: this exact payload must make V8 build a message out of its bytes");
});

const SHIM_PATH = fileURLToPath(new URL("./vc-secrets-shim.mjs", import.meta.url));

// Every spawn of the shim overrides the home the same way, and it has to override it TWICE. The shim
// is the one module that resolves its roots through a bare `os.homedir()` -- everywhere else reads
// `env.HOME || os.homedir()`, so HOME alone is enough -- and os.homedir() reads USERPROFILE on Windows.
// Setting only one of the two is a SILENT no-op on the other platform: the shim then walks the
// developer's real profile, finds no install, and the test fails on a message that is perfectly true,
// which reads as a shim defect and is not one. Measured on Windows: nine tests at once.
// A helper rather than a spread at each call site, because the first fix of this was applied to the
// runShim wrapper alone, and the tests that spawn the shim directly kept failing.
function shimEnv(home) {
    return { ...process.env, HOME: home, USERPROFILE: home };
}

// Points installPath at a temp dir holding a stub launcher that just proves which install ran — real
// launcher behaviour is already covered by the vc-secrets.mjs tests in lib/ and above; the shim's own
// job is picking the RIGHT install and handing it argv, which is what these tests exercise.
function writeStubInstall(label) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-install-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, "vc-secrets.mjs"),
        `export async function runCli() { process.stderr.write("STUB-RAN:${label}\\n"); }\n`);

    return dir;
}

// The registry key the client files this plugin's installs under, DERIVED from the two manifests this
// repo ships rather than restated: the shim bakes the same string in as a literal (it is installed as a
// standalone file and cannot read a manifest), so a test that also restated the literal would agree with
// a stale shim by construction. Deriving it here is what makes a rename of either manifest fail a test.
const PLUGIN_KEY = (() => {
    const readJson = (relative) => JSON.parse(fs.readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));
    const pluginName = readJson("./.claude-plugin/plugin.json").name;
    const marketplaceName = readJson("../../.claude-plugin/marketplace.json").name;

    return `${pluginName}@${marketplaceName}`;
})();

// An installed_plugins.json holding `records` for this plugin, under the derived key. One helper for every
// fixture, so none of them can drift from the key the shim reads. `version` is the registry's schema
// version, a parameter because the schema-mismatch and wrong-type tests need it to be other than 2.
function shimRegistry(records, version = 2) {
    return { version, plugins: { [PLUGIN_KEY]: records } };
}

// A fresh HOME per call so ~/.claude/plugins/installed_plugins.json is exactly what the test wrote —
// never the real machine's registry.
// Each `caches` entry materialises one <root>/<marketplace>/<plugin>/<version>/ directory the way a
// real client lays it out, optionally without the launcher so a partial install can be exercised.
function runShim(args, { registry, cwd, caches = [] } = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-home-"));
    tmpDirs.push(home);
    if (registry !== undefined) {
        fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
        fs.writeFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify(registry));
    }
    for (const { client = "claude", marketplace = PLUGIN_KEY.split("@")[1], version, label, launcher = true } of caches) {
        const dir = path.join(home, `.${client}`, "plugins", "cache", marketplace, "vc-secrets", version);
        fs.mkdirSync(dir, { recursive: true });
        if (launcher) {
            fs.writeFileSync(path.join(dir, "vc-secrets.mjs"),
                `export async function runCli() { process.stderr.write("STUB-RAN:${label}\\n"); }\n`);
        }
    }

    return spawnSync(process.execPath, [SHIM_PATH, ...args],
        { env: shimEnv(home), cwd: cwd ?? home, encoding: "utf8" });
}

// ── vc-secrets-shim.mjs ─────────────────────────────────────────────────────────────────────────────

test("shim: no registry file at all → names the plugin as not installed, exit 1", () => {
    const r = runShim(["doctor"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /install the vc-secrets plugin|is not installed/);
});

test("shim: a corrupt registry is named as corrupt, without any of its bytes", () => {
    // registryProblem lands on the launched server's stderr, and a SyntaxError has no `.code` -- so
    // the fallback used to be V8's message, which it builds out of a window of the file it was given.
    // Same class the guard hook and the launcher's three readers already refuse. Not a credential
    // store, but it is the client's file and this shim has no business quoting it.
    //
    // Unquoted value on purpose: a registry that merely ends early fails at its last position, and
    // V8 then answers with the positional shape, which carries nothing -- the assertion would hold
    // with the fix reverted. The control below is what keeps that shut.
    const canary = "LEAKCANARY0123456789";
    const corrupt = `{"plugins":{"ai-tools":${canary}}}`;
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-corrupt-"));
    tmpDirs.push(home);
    fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"), corrupt);

    const r = spawnSync(process.execPath, [SHIM_PATH, "doctor"],
        { env: shimEnv(home), cwd: home, encoding: "utf8" });

    assert.equal(r.status, 1);
    assert.match(r.stderr, /not valid JSON/, `the corruption must be named: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /LEAKCANARY|plugins":/,
        "no window of the registry may travel with the reason");

    let raw = "";
    try {
        JSON.parse(corrupt);
    } catch (e) {
        raw = e.message;
    }
    assert.match(raw, /LEAKCANARY/,
        "the control: this exact file must make V8 build a message out of its bytes");
});

test("shim: a cache root that exists but cannot be read is named, not counted as absent",
    { skip: !CAN_DENY_BY_MODE && "needs POSIX mode bits that actually deny" }, () => {
    // With no registry the resolution falls through to installsInCaches, and its answer decides
    // between "not installed" and a version to run. An unreadable root took the same branch as an
    // absent one, so "plugin ... is not installed -- looked in <roots>" was printed about a root
    // nothing had looked in. The registry half of that same sentence is already drawn where
    // registryProblem is reported: not installed is a claim this shim cannot support when the thing
    // that would have said otherwise is the thing it could not read.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-denied-"));
    tmpDirs.push(home);
    const root = path.join(home, ".claude", "plugins", "cache");
    fs.mkdirSync(root, { recursive: true });
    fs.chmodSync(root, 0o000);
    try {
        const r = spawnSync(process.execPath, [SHIM_PATH, "doctor"],
            { env: shimEnv(home), cwd: home, encoding: "utf8" });
        assert.match(r.stderr, /could not be read/, `the unreadable root must be named: ${r.stderr}`);
    } finally {
        fs.chmodSync(root, 0o700);   // or the tmpDirs teardown cannot remove it
    }
});

test("shim: registry present but the plugin has no records → not installed, exit 1", () => {
    const r = runShim(["doctor"], { registry: { version: 2, plugins: {} } });
    assert.equal(r.status, 1);
    assert.ok(r.stderr.includes(PLUGIN_KEY), `the message must name the derived key ${PLUGIN_KEY}: ${r.stderr}`);
    assert.match(r.stderr, /is not installed/);
});

test("shim: a registry filed under the key derived from the manifests resolves (the shim's baked PLUGIN_KEY agrees)", () => {
    // The shim restates `<plugin>@<marketplace>` as a literal; PLUGIN_KEY here is DERIVED from the two
    // manifests. A registry filed under the derived key resolving to the stub is what proves the two
    // agree -- a shim reading a stale key reports the plugin as not installed instead.
    const stub = writeStubInstall("derived-key");
    const r = runShim(["doctor"], { registry: shimRegistry([
        { version: "1.0.0", lastUpdated: "2024-01-01", installPath: stub },
    ]) });

    assert.match(r.stderr, /STUB-RAN:derived-key/, r.stderr);
});

test("CANONICAL_DATA_ID is the derived plugin key with every non-alphanumeric dashed", () => {
    // The rule is documented where install-shim.mjs falls back to this id: `<plugin>@<marketplace>` with
    // non-alphanumerics dashed. Asserted against the manifests, not against a restated "vc-secrets-ai-tools",
    // so renaming either manifest without the constant fails here rather than after a release, when an
    // installed shim's data directory no longer matches the one Claude Code computes.
    assert.equal(CANONICAL_DATA_ID, PLUGIN_KEY.replace(/[^A-Za-z0-9]/g, "-"));
});

test("shim: a registry schema version mismatch warns but still runs the resolved install", () => {
    const projectDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-proj-"));
    tmpDirs.push(projectDir);
    const stub = writeStubInstall("proceed");
    const registry = shimRegistry([
        { projectPath: projectDir, version: "1.0.0", lastUpdated: "2024-01-01", installPath: stub },
    ], 999);
    const r = runShim(["doctor"], { registry, cwd: projectDir });
    assert.match(r.stderr, /schema version 999, this shim was written for 2/);
    assert.match(r.stderr, /STUB-RAN:proceed/);
});

test("shim: a registry field of the wrong type is described, never printed", () => {
    // The file parses, so registryProblem never sees it -- the SHAPE is what is hostile. A template literal
    // joins an array's elements, so each of these three fields used to put its contents on the
    // launched server's stderr: the schema version in the mismatch warning, and the chosen record's
    // version and projectPath in the none-of-the-installs line. Both records are hostile, so whichever
    // one the ranking picks, its fields are the ones printed.
    const stubA = writeStubInstall("hostile-a");
    const stubB = writeStubInstall("hostile-b");
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-hostile-"));
    tmpDirs.push(outsideDir);
    const hostile = (installPath, lastUpdated) => ({ projectPath: ["LEAKCANARY-PATH"],
        version: ["LEAKCANARY-VERSION"], lastUpdated, installPath });
    const registry = shimRegistry([
        hostile(stubA, "2030-01-01"), hostile(stubB, "2010-01-01"),
    ], ["LEAKCANARY-SCHEMA", "second"]);
    const r = runShim(["doctor"], { registry, cwd: outsideDir });

    assert.doesNotMatch(r.stderr, /LEAKCANARY/, `no field of the registry may be printed as-is: ${r.stderr}`);
    assert.match(r.stderr, /schema version \(not a number\)/);
    assert.match(r.stderr, /using version \(not a string\) from \(not a string\)/);
    // Described, not refused: the launch still proceeds, which is the point of warning and continuing.
    assert.match(r.stderr, /STUB-RAN:hostile-/);
});

test("shim: a ranking field whose toString is not a function ranks as absent instead of crashing", () => {
    // Valid JSON, so neither registryProblem nor the records filter refuses it: an object is an object.
    // The ranking then called String() on it, and String() calls the value's own toString -- here a
    // number -- which threw a raw TypeError before anything launched. Two records in each case, with
    // equal versions in the lastUpdated case, so the tie-break provably reaches lastUpdated rather
    // than relying on how pick treats a single record.
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-tostring-"));
    tmpDirs.push(outsideDir);
    const cases = {
        version: (stub, n) => ({ version: n === 1 ? { toString: 1 } : "1.0.0", lastUpdated: "2020-01-01", installPath: stub }),
        lastUpdated: (stub, n) => ({ version: "1.0.0", lastUpdated: n === 1 ? { toString: 1 } : "2020-01-01", installPath: stub }),
    };
    for (const [field, make] of Object.entries(cases)) {
        const registry = shimRegistry([
            make(writeStubInstall(`${field}-1`), 1), make(writeStubInstall(`${field}-2`), 2),
        ]);
        const r = runShim(["doctor"], { registry, cwd: outsideDir });

        assert.doesNotMatch(r.stderr, /TypeError|at .*vc-secrets-shim\.mjs/, `${field}: no raw stack: ${r.stderr}`);
        // The healthy record wins: a field of the wrong type ranks as absent, and absent loses.
        assert.match(r.stderr, new RegExp(`STUB-RAN:${field}-2`), `${field}: ${r.stderr}`);
    }
});

test("shim: cwd matching none of the installs picks the higher VERSION, not the later lastUpdated", () => {
    const stubA = writeStubInstall("a");
    const stubB = writeStubInstall("b");
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-outside-"));
    tmpDirs.push(outsideDir);
    const registry = shimRegistry([
        { projectPath: "/some/other/path/a", version: "1.2.0", lastUpdated: "2030-01-01", installPath: stubA },
        { projectPath: "/some/other/path/b", version: "1.10.0", lastUpdated: "2010-01-01", installPath: stubB },
    ]);
    const r = runShim(["doctor"], { registry, cwd: outsideDir });

    // "a" has the later lastUpdated but the lower version — picking it would be exactly the staleness
    // this shim exists to prevent.
    assert.match(r.stderr, /belongs to none of the 2 installs; using version 1\.10\.0 from \/some\/other\/path\/b/);
    assert.match(r.stderr, /STUB-RAN:b/);
    assert.ok(!r.stderr.includes("STUB-RAN:a"));
});

// `migrate` moves user-scope declarations only, so its fixtures declare in the USER file under a fixture
// HOME. `verb` is `migrate` unless a test needs another verb's view of the same fixture. It runs from a repository of its own whose declaration file stops configPaths' walk: with none,
// the walk climbs out of the fixture, and on Windows os.tmpdir() sits inside the developer's real profile,
// whose own ~/.claude/vc-secrets.json would then be read as a project's. `project` and `local` are that
// repository's files, and default to a declaration of nothing.
// `trusted`: record the repository in the trust file before the verb runs, for a test about something other
// than the namespace gate that reads or writes the repository's own secrets.
function runMigrate({ user, project = { secrets: {}, servers: {} }, local, env: extra, verb = "migrate", trusted = false }) {
    const env = launcherEnv(extra);
    fs.mkdirSync(path.join(env.HOME, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(env.HOME, ".claude", m.CONFIG_NAME), JSON.stringify(user));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-migrate-repo-"));
    tmpDirs.push(repo);
    fs.mkdirSync(path.join(repo, ".claude"));
    fs.writeFileSync(path.join(repo, ".claude", m.CONFIG_NAME), JSON.stringify(project));
    if (local !== undefined) {
        fs.writeFileSync(path.join(repo, ".claude", m.LOCAL_CONFIG_NAME), JSON.stringify(local));
    }
    if (trusted) {
        seedTrust(env, repo);
    }

    return spawnSync(process.execPath, [LAUNCHER_PATH, verb], { env, cwd: repo, encoding: "utf8" });
}

test("cmdMigrate: a repository-declared secret is skipped with the reason -- once when project and local both declare it -- and nothing is read or written", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-migrate-skip-"));
    tmpDirs.push(dir);
    const logPath = path.join(dir, "security-calls.log");
    // Every call is recorded, and a read of the legacy entry would succeed: a migrate that copied the value
    // would be visible as a call and as a "migrated" line. Project and local declaring one name share one
    // keystore namespace, so the collision is one entry and must be one line.
    const binDir = stubBinary("security", '#!/bin/sh\necho "$@" >> "$SECURITY_CALL_LOG"\necho LEGACY-SENTINEL\nexit 0\n');
    const declaration = { projectId: "demo", secrets: { dup: { backend: "local" } }, servers: {}, tasks: {} };

    const r = runMigrate({ user: { secrets: {}, servers: {} }, project: declaration, local: declaration,
        env: { VC_SECRETS_LOCAL_BACKEND: "keychain", PATH: `${binDir}${path.delimiter}${process.env.PATH}`, SECURITY_CALL_LOG: logPath } });

    assert.equal(r.status, 0, r.stderr);
    const skipped = r.stderr.split("\n").filter((l) => l.startsWith("dup: declared by this repository"));
    assert.equal(skipped.length, 1, r.stderr);
    assert.ok(skipped[0].includes('run "vc-secrets set dup"'), "and it says what to do instead");
    assert.match(r.stderr, /0 migrated, 0 failed/);
    assert.ok(!fs.existsSync(logPath), `the keystore must not be touched for a repository's secret: ${fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : ""}`);
});

test("cmdMigrate: refuses to touch a secret whose current state it cannot read", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-migrate-unreadable-"));
    tmpDirs.push(dir);
    const logPath = path.join(dir, "security-calls.log");
    // Behaviour depends on the service name (`-s ...`): the NEW key's read fails with an exit code that
    // does not mean absence (44 does; 1 does not); the LEGACY key's read would succeed, so a
    // catch-as-absent bug would sail through to a destructive overwrite.
    const binDir = stubBinary("security", `#!/bin/sh
echo "$@" >> "$SECURITY_CALL_LOG"
case "$*" in
  *"vc-secrets:user:dup"*) exit 1 ;;
  *) echo LEGACY-SENTINEL; exit 0 ;;
esac
`);

    const r = runMigrate({ user: { secrets: { dup: { backend: "local" } }, servers: {}, tasks: {} },
        env: { VC_SECRETS_LOCAL_BACKEND: "keychain", PATH: `${binDir}${path.delimiter}${process.env.PATH}`, SECURITY_CALL_LOG: logPath } });

    // Pre-fix: "is the new key already populated?" swallowed any read failure as "no", so migrate then
    // read the legacy value and WROTE it over the current (unreadable — not absent) one, reporting a
    // successful migration. The fix refuses to touch the secret at all when it cannot tell.
    assert.equal(r.status, 1, "an unreadable new-key state must fail the run, not exit 0");
    assert.match(r.stderr, /dup: cannot tell whether it is already migrated, refusing to touch it/);
    assert.match(r.stderr, /0 migrated, 1 failed/);
    const calls = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
    assert.equal(calls.length, 1, `expected only the new-key probe, no legacy read or write: ${JSON.stringify(calls)}`);
    assert.ok(!calls.some((c) => c.includes("add-generic-password")),
        "must never write — the value already in the keystore has to survive an unreadable read");
});

// A `security` stub with a real (file-backed) new entry, which the read-only stubs above cannot give:
// the first write stores something other than what was handed over (a store that accepted a different
// value), every later one stores the legacy value faithfully. `deleteExit` is what delete-generic-password
// answers; 0 removes the entry. Reads of the namespaced key answer 44 (absent) when no entry is stored.
function tamperingKeychainStub(deleteExit) {
    return stubBinary("security", `#!/bin/sh
echo "$@" >> "$SECURITY_CALL_LOG"
case "$1" in
  -i)
    cat > /dev/null
    if [ -e "$SECURITY_STATE/wrote-once" ]; then printf 'LEGACY-SENTINEL' > "$SECURITY_STATE/entry"; else touch "$SECURITY_STATE/wrote-once"; printf 'TAMPERED' > "$SECURITY_STATE/entry"; fi
    exit 0 ;;
  delete-generic-password)
    if [ ${deleteExit} -eq 0 ]; then rm -f "$SECURITY_STATE/entry"; fi
    exit ${deleteExit} ;;
esac
case "$*" in
  *"vc-secrets:user:dup"*) if [ -e "$SECURITY_STATE/entry" ]; then cat "$SECURITY_STATE/entry"; exit 0; fi; exit 44 ;;
  *) echo LEGACY-SENTINEL; exit 0 ;;
esac
`);
}

test("cmdMigrate: a read-back mismatch removes the new entry, so the next run migrates again instead of reporting it present", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-migrate-mismatch-"));
    tmpDirs.push(dir);
    const logPath = path.join(dir, "security-calls.log");
    const state = path.join(dir, "state");
    fs.mkdirSync(state);
    const binDir = tamperingKeychainStub(0);
    const user = { secrets: { dup: { backend: "local" } }, servers: {}, tasks: {} };
    const env = { VC_SECRETS_LOCAL_BACKEND: "keychain", USER: "migrator", SECURITY_CALL_LOG: logPath, SECURITY_STATE: state,
        PATH: `${binDir}${path.delimiter}${process.env.PATH}` };

    const first = runMigrate({ user, env });

    // Pre-fix the wrong value stayed under the new key: newKeyPresent asks only whether the key exists, so
    // the second run below said "already present", doctor said OK and a launch ran on a value nobody wrote.
    assert.equal(first.status, 1, first.stderr);
    assert.match(first.stderr, /dup: migration failed -- the store returned a different value than was written; the new entry was removed -- the legacy entry is untouched, migrate it by hand/);
    const calls = fs.readFileSync(logPath, "utf8").trim().split("\n").filter(Boolean);
    assert.ok(calls.includes("delete-generic-password -a migrator -s vc-secrets:user:dup"), `expected the delete to be issued: ${JSON.stringify(calls)}`);
    assert.ok(!fs.existsSync(path.join(state, "entry")), "the tampered entry must be gone");

    const second = runMigrate({ user, env });

    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stderr, /dup: migrated/);
    assert.doesNotMatch(second.stderr, /already present/);
});

test("cmdMigrate: a read-back mismatch whose cleanup fails names the entry that holds a wrong value and the command that removes it", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-migrate-mismatch-nodelete-"));
    tmpDirs.push(dir);
    const logPath = path.join(dir, "security-calls.log");
    const state = path.join(dir, "state");
    fs.mkdirSync(state);
    const binDir = tamperingKeychainStub(1);

    const r = runMigrate({ user: { secrets: { dup: { backend: "local" } }, servers: {}, tasks: {} },
        env: { VC_SECRETS_LOCAL_BACKEND: "keychain", USER: "migrator", SECURITY_CALL_LOG: logPath, SECURITY_STATE: state,
            PATH: `${binDir}${path.delimiter}${process.env.PATH}` } });

    assert.equal(r.status, 1, r.stderr);
    assert.match(r.stderr, /the new entry could not be removed -- it now holds a wrong value; remove it with `security delete-generic-password -a migrator -s vc-secrets:user:dup`\. The legacy entry is untouched/);
    assert.doesNotMatch(r.stderr, /the new entry was removed/);
    assert.doesNotMatch(r.stderr, /TAMPERED/, "a value read back from the store is never echoed");
});

test("doctor: a secret found only under the legacy key is advised to migrate at user scope, and not at a repository's", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    // migrate skips a repository's secret, so a doctor that told the reader to run it there would loop them
    // through a verb that does nothing for that name. The stub answers the namespaced keys as absent (44)
    // and the legacy `mcpw:` entry as present, for both declarations.
    const binDir = stubBinary("security", `#!/bin/sh
case "$*" in
  *"vc-secrets:"*) exit 44 ;;
  *"mcpw:"*) echo LEGACY-SENTINEL; exit 0 ;;
  *) exit 0 ;;
esac
`);
    const r = runMigrate({ verb: "doctor",
        user: { secrets: { mine: { backend: "local" } }, servers: {}, tasks: {} },
        project: { projectId: "demo", secrets: { theirs: { backend: "local" } }, servers: {}, tasks: {} },
        env: { VC_SECRETS_LOCAL_BACKEND: "keychain", PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
        trusted: true });

    assert.match(r.stderr, /^WARN secret "mine" is only under the legacy key -- run "vc-secrets migrate"$/m, r.stderr);
    assert.doesNotMatch(r.stderr, /WARN secret "theirs"/, r.stderr);
    assert.match(r.stderr, /^FAIL secret "theirs" not resolvable/m, "it is an ordinary unresolvable secret there, with the ordinary advice");
});

// A PowerShell stub for the wcm backend. runTool closes stdin with nothing written for a read and with the
// value for a write (see runTool's spec.stdinData branch), so "$(cat)" tells the two apart without needing
// to decode the real -EncodedCommand payload. A read of a `vc-secrets:...` key reports "not found" (exit 3)
// so migrate proceeds to the legacy entry, whose value is `legacyHex`; every write is logged.
//
// Named without an extension and selected through VC_SECRETS_POWERSHELL, never as `powershell.exe`:
// on win32 stubBinary writes `<name>.cmd`, which a lookup of the literal `powershell.exe` never
// reaches -- the real PowerShell then ran against the developer's real Credential Manager. The
// override is the bare NAME, which the lookup resolves through PATH to the stub's `.cmd` shim.
function wcmMigrateStub(legacyHex) {
    return stubBinary("vc-ps-stub", `#!/bin/sh
value=$(cat)
if [ -n "$value" ]; then
  printf '%s=%s\\n' "$VC_SECRETS_NAME" "$value" >> "$WCM_WRITE_LOG"
  exit 0
fi
case "$VC_SECRETS_NAME" in
  vc-secrets:*) exit 3 ;;
  *) printf '%s' '${legacyHex}'; exit 0 ;;
esac
`);
}

test("migrating a legacy wcm entry stores the plaintext, not the hex it was read as", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    // readLegacyLocalValue is the second consumer of PS_CRED_READ. Missing it makes cmdMigrate
    // write the hex string as the value — and the read-back compare is keychain-only, so on
    // Windows nothing catches it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-migrate-wcm-"));
    tmpDirs.push(dir);

    const plaintext = "sekret-value";
    // The pre-UTF-8 launcher wrote UTF-16LE, so this is what a legacy wcm entry's PS_CRED_READ
    // hex-dump looks like — decodeCredBlobHex must turn it back into the plaintext below.
    const legacyHex = Buffer.from(plaintext, "utf16le").toString("hex");
    const writeLogPath = path.join(dir, "wcm-write.log");

    const r = runMigrate({ user: { secrets: { tok: { backend: "local" } }, servers: {}, tasks: {} },
        env: { VC_SECRETS_LOCAL_BACKEND: "wcm", VC_SECRETS_POWERSHELL: "vc-ps-stub",
            PATH: `${wcmMigrateStub(legacyHex)}${path.delimiter}${process.env.PATH}`, WCM_WRITE_LOG: writeLogPath } });

    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /tok: migrated/);
    const writes = fs.existsSync(writeLogPath) ? fs.readFileSync(writeLogPath, "utf8").trim().split("\n").filter(Boolean) : [];
    assert.equal(writes.length, 1, `expected exactly one write: ${JSON.stringify(writes)}`);
    assert.equal(writes[0], `vc-secrets:user:tok=${plaintext}`,
        "the stored value must be the decoded plaintext, not the hex readLegacyLocalValue got back");
});

test("cmdMigrate: beside a repository's secret, a user-scope one is still migrated -- into the user namespace only", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    // The same legacy entry name is what both declarations would read: it carries no scope, so it is the
    // person's own. Only the declaration that is the person's own gets it.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-migrate-mixed-"));
    tmpDirs.push(dir);
    const writeLogPath = path.join(dir, "wcm-write.log");
    const legacyHex = Buffer.from("personal-value", "utf16le").toString("hex");

    const r = runMigrate({
        user: { secrets: { mine: { backend: "local" } }, servers: {}, tasks: {} },
        project: { projectId: "demo", secrets: { theirs: { backend: "local" } }, servers: {}, tasks: {} },
        env: { VC_SECRETS_LOCAL_BACKEND: "wcm", VC_SECRETS_POWERSHELL: "vc-ps-stub",
            PATH: `${wcmMigrateStub(legacyHex)}${path.delimiter}${process.env.PATH}`, WCM_WRITE_LOG: writeLogPath } });

    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /mine: migrated/);
    assert.match(r.stderr, /theirs: declared by this repository/);
    assert.match(r.stderr, /1 migrated, 0 failed/);
    const writes = fs.readFileSync(writeLogPath, "utf8").trim().split("\n").filter(Boolean);
    assert.deepEqual(writes, ["vc-secrets:user:mine=personal-value"],
        "the repository's namespace (vc-secrets:demo:...) received nothing");
});

test("cmdRun: identifiers (AZURE_TENANT_ID, AZURE_CLIENT_ID) survive into the child — only credentials are stripped", () => {
    const dir = tmpConfigDir({
        secrets: {},
        servers: { probe: { command: process.execPath,
            args: ["-e", "process.exit(process.env.AZURE_TENANT_ID==='tid' && process.env.AZURE_CLIENT_ID==='cid' ? 7 : 9)"],
            env: {} } },
    });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "run", "probe"], {
        env: trustedLauncherEnv(dir, { AZURE_TENANT_ID: "tid", AZURE_CLIENT_ID: "cid" }),
        encoding: "utf8",
    });

    // Pre-fix: cmdLaunch stripped the wide LEGACY_ENV_VARS list (which includes these two identifiers)
    // instead of the narrower LEGACY_SECRET_ENV_VARS, so a server legitimately inheriting an ambient
    // tenant/client ID would fail with an unrelated auth error.
    assert.equal(r.status, 7, `expected AZURE_TENANT_ID/AZURE_CLIENT_ID to survive into the child; stderr: ${r.stderr}`);
});

test("cmdRun: a legacy credential inherited under another case is stripped too", () => {
    const dir = tmpConfigDir({
        secrets: {},
        servers: { probe: { command: process.execPath,
            args: ["-e", "process.exit(Object.keys(process.env).some((k) => /^azure_client_secret$/i.test(k)) ? 9 : 7)"],
            env: {} } },
    });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "run", "probe"], {
        env: trustedLauncherEnv(dir, { Azure_Client_Secret: "stale" }),
        encoding: "utf8",
    });

    // The strip named the canonical spellings and deleted those. On Windows a name differing only by
    // case is the same variable, so the plaintext this exists to drop reached the child under whichever
    // spelling the operator's shell happened to export -- the reason isDangerousEnvKey folds case too.
    assert.equal(r.status, 7, `expected no case-variant of AZURE_CLIENT_SECRET in the child; stderr: ${r.stderr}`);
});

test("cmdRun: a legacy name the launchable declares itself survives the strip", () => {
    // The strip is unconditional, so this is what keeps it from eating a declared value: the
    // declaration is assigned after the delete. Without this the two could be reordered and only a
    // Windows operator would find out.
    const dir = tmpConfigDir({
        secrets: {},
        servers: { probe: { command: process.execPath,
            args: ["-e", "process.exit(process.env.AZURE_CLIENT_SECRET === 'declared' ? 7 : 9)"],
            env: { AZURE_CLIENT_SECRET: "literal:declared" } } },
    });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "run", "probe"], {
        env: trustedLauncherEnv(dir, { AZURE_CLIENT_SECRET: "stale" }),
        encoding: "utf8",
    });

    assert.equal(r.status, 7, `expected the declared value to reach the child; stderr: ${r.stderr}`);
});

// `doctor` as a process, with a stub `az` that records every call. `trusted` seeds the trust file for the
// repository as written, the way a person who ran `vc-secrets trust` would have it; `user` is the personal
// file, where the `vaults` grant lives. Pinned to gpg, the one backend doctor does not write-probe.
function runDoctorWithAz({ user = { secrets: {}, servers: {} }, project, trusted, flags = [] }) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-doctor-az-"));
    tmpDirs.push(dir);
    const logPath = path.join(dir, "az-calls.log");
    const binDir = stubBinary("az", '#!/bin/sh\necho "$@" >> "$AZ_CALL_LOG"\necho tok\n');
    const env = launcherEnv({
        VC_SECRETS_LOCAL_BACKEND: "gpg", AZ_CALL_LOG: logPath, PATH: `${binDir}${path.delimiter}${process.env.PATH}`,
    });
    fs.mkdirSync(path.join(env.HOME, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(env.HOME, ".claude", m.CONFIG_NAME), JSON.stringify(user));
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-doctor-az-repo-"));
    tmpDirs.push(repo);
    fs.mkdirSync(path.join(repo, ".claude"));
    fs.writeFileSync(path.join(repo, ".claude", m.CONFIG_NAME), JSON.stringify(project));
    if (trusted) {
        seedTrust(env, repo);
    }
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "doctor", ...flags], { env, cwd: repo, encoding: "utf8" });

    return { ...r, azCalls: fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8") : "" };
}

const REPO_KV_TASK_PROJECT = {
    projectId: "demo",
    secrets: { kv: { backend: "keyvault", vault: "demo-vault", secret: "pat-secret" } },
    tasks: { build: { command: "printenv", args: ["V"], env: { V: "secret:kv" } } },
};

const KV_TASK_GRANT = { vaults: { "demo-vault": { "pat-secret": { tasks: { build: { command: "printenv", args: ["V"], envKeys: ["V"] } } } } } };

const NOT_READ = /^SKIP secret "kv" not read -- declared by the repository, and no trusted, authorized consumer uses it$/m;

test("doctor: a repository's Key Vault secret is not read for a task nobody trusted -- az is never invoked", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    // Every task counts as consuming what it references, so before this rule an untrusted repository's task
    // was enough to make `doctor` run `az` with the vault and secret name the repository chose. --all widens
    // which of the reader's own secrets are checked and must not widen this.
    for (const flags of [[], ["--all"]]) {
        const r = runDoctorWithAz({ project: REPO_KV_TASK_PROJECT, trusted: false, flags });
        assert.equal(r.azCalls, "", `az must not run: ${r.azCalls}`);
        assert.match(r.stderr, NOT_READ, r.stderr);
        assert.doesNotMatch(r.stderr, /secret "kv" resolvable/, r.stderr);
    }
});

test("doctor: a trusted task without a vaults grant is not enough either, and the missing block is still reported", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    const r = runDoctorWithAz({ project: REPO_KV_TASK_PROJECT, trusted: true });
    assert.equal(r.azCalls, "", `az must not run: ${r.azCalls}`);
    assert.match(r.stderr, NOT_READ, r.stderr);
    assert.match(r.stderr, /^FAIL task "build" \(project\) wants secret "kv" and is not authorized/m, r.stderr);
});

test("doctor: a trusted and authorized consumer does get the repository's Key Vault secret read", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    // The positive control: without it a doctor that never read a repository's secret would pass the
    // two tests above.
    const r = runDoctorWithAz({ user: { secrets: {}, servers: {}, ...KV_TASK_GRANT }, project: REPO_KV_TASK_PROJECT, trusted: true });
    assert.match(r.azCalls, /--vault-name demo-vault --name pat-secret/, `az calls: ${r.azCalls}`);
    assert.match(r.stderr, /^OK secret "kv" resolvable$/m, r.stderr);
    assert.doesNotMatch(r.stderr, NOT_READ, r.stderr);
});

test("doctor: a Key Vault secret the user declared is read as before -- the rule is about the repository's declarations", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, () => {
    const r = runDoctorWithAz({
        user: { secrets: { kv: { backend: "keyvault", vault: "demo-vault", secret: "pat-secret" } },
            servers: {}, tasks: { build: { command: "printenv", args: ["V"], env: { V: "secret:kv" } } } },
        project: { projectId: "demo", secrets: {}, servers: {} },
        trusted: false,
    });
    assert.match(r.azCalls, /--vault-name demo-vault --name pat-secret/, `az calls: ${r.azCalls}`);
    assert.doesNotMatch(r.stderr, NOT_READ, r.stderr);
});

test("the probe runs at all — its own imports resolve", () => {
    // `node --check` proves a file parses; an undefined identifier is not a syntax error. A mechanical
    // edit replaced process.stderr.write with fs.writeSync here and left `fs` unimported, so every
    // invocation threw ReferenceError while the file still checked clean. Spawning it is the only
    // assertion that would have caught that.
    const probePath = fileURLToPath(new URL("./vc-secrets-probe.mjs", import.meta.url));
    const r = spawnSync(process.execPath, [probePath], { encoding: "utf8" });
    assert.ok(!/ReferenceError|is not defined/.test(r.stderr), `probe failed to run:\n${r.stderr}`);
    assert.match(r.stderr + r.stdout, /usage: node vc-secrets-probe\.mjs/);
});

test("both direct-run gates fire when the plugin is reached through a symlinked directory", { skip: !CAN_SYMLINK && "this machine cannot create a directory link" }, () => {
    // process.argv[1] stays as typed while import.meta.url is the resolved path. The gates compared the
    // two after path.resolve alone, so through a linked directory (a marketplace cache entry, a linked
    // checkout) both were false: the CLI imported, ran nothing and exited 0 with no usage line.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-linked-run-"));
    tmpDirs.push(root);
    const link = path.join(root, "linked-plugin");
    fs.symlinkSync(path.dirname(fileURLToPath(import.meta.url)), link, LINK_TYPE);

    const probeRun = spawnSync(process.execPath, [path.join(link, "vc-secrets-probe.mjs")], { encoding: "utf8" });
    assert.match(probeRun.stderr, /usage: node vc-secrets-probe\.mjs/, `probe stderr: ${probeRun.stderr}`);
    assert.equal(probeRun.status, 2, "a gate that never fires exits 0 having done nothing");

    const launcher = spawnSync(process.execPath, [path.join(link, "vc-secrets.mjs")], { encoding: "utf8" });
    assert.match(launcher.stderr, /usage: vc-secrets </, `launcher stderr: ${launcher.stderr}`);
    assert.notEqual(launcher.status, 0, "a gate that never fires exits 0 having done nothing");
});

test("both direct-run gates fire under --preserve-symlinks-main through a symlinked directory", { skip: !CAN_SYMLINK && "this machine cannot create a directory link" }, () => {
    // With that flag import.meta.url of the entry file keeps the link path, so canonicalising only
    // argv[1] leaves the two sides apart again and the CLI exits 0 having done nothing.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-linked-main-"));
    tmpDirs.push(root);
    const link = path.join(root, "linked-plugin");
    fs.symlinkSync(path.dirname(fileURLToPath(import.meta.url)), link, LINK_TYPE);

    const probeRun = spawnSync(process.execPath, ["--preserve-symlinks-main", path.join(link, "vc-secrets-probe.mjs")], { encoding: "utf8" });
    assert.match(probeRun.stderr, /usage: node vc-secrets-probe\.mjs/, `probe stderr: ${probeRun.stderr}`);
    assert.equal(probeRun.status, 2, "a gate that never fires exits 0 having done nothing");

    const launcher = spawnSync(process.execPath, ["--preserve-symlinks-main", path.join(link, "vc-secrets.mjs")], { encoding: "utf8" });
    assert.match(launcher.stderr, /usage: vc-secrets </, `launcher stderr: ${launcher.stderr}`);
    assert.notEqual(launcher.status, 0, "a gate that never fires exits 0 having done nothing");
});

test("install-shim: copies the shim, is idempotent, and prints the settings entry plus literal commands", () => {
    const script = fileURLToPath(new URL("./scripts/install-shim.mjs", import.meta.url));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-inst-"));
    tmpDirs.push(home);
    // A foreign CLAUDE_PLUGIN_DATA in the environment, and it changes nothing: with no --data-dir the
    // directory is computed. Measured provenance of such a value: a session where another plugin's
    // context had set it, which put the shim in `…/data/codex-openai-codex` before the variable was
    // dropped as an input.
    const env = { ...process.env, HOME: home, CLAUDE_PLUGIN_DATA: path.join(home, "data", "some-other-plugin") };

    const first = spawnSync(process.execPath, [script], { encoding: "utf8", env });
    assert.equal(first.status, 0, first.stderr);
    const shim = path.join(home, ".claude", "plugins", "data", "vc-secrets-ai-tools", "vc-secrets-shim.mjs");
    assert.ok(fs.existsSync(shim), `expected the shim at ${shim}\n${first.stdout}${first.stderr}`);
    assert.match(first.stdout, /installed/);
    assert.match(first.stdout, /"VC_SECRETS"/);
    // No shell export: the shim's path is already stable and literal, so a human running set/login/
    // unlock/migrate/doctor by hand needs no per-shell setup, and none is printed or suggested.
    assert.doesNotMatch(first.stdout, /export/i);
    assert.doesNotMatch(first.stdout, /shell rc/i);
    const quoted = JSON.stringify(shim);
    for (const verb of ["set <name>", "login <name>", "unlock", "migrate", "doctor"]) {
        assert.ok(first.stdout.includes(`node ${quoted} ${verb}`), `expected the literal ${verb} command\n${first.stdout}`);
    }

    const second = spawnSync(process.execPath, [script], { encoding: "utf8", env });
    assert.equal(second.status, 0, second.stderr);
    assert.match(second.stdout, /already up to date/);
    assert.equal(fs.existsSync(path.join(env.CLAUDE_PLUGIN_DATA, "vc-secrets-shim.mjs")), false,
        "must not write into another plugin's directory");
});

test("install-shim: the shim it copies comes from its own location, not from CLAUDE_PLUGIN_ROOT", () => {
    // Same provenance as the foreign CLAUDE_PLUGIN_DATA above: the value belongs to whichever plugin's
    // context reached this process. Preferring it copied whatever file of this name that root held --
    // exit 0, a line saying installed, and the wrong shim on disk. Asserting the BYTES, because the
    // path is identical either way and only the content tells the two sources apart.
    const script = fileURLToPath(new URL("./scripts/install-shim.mjs", import.meta.url));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-inst-root-"));
    tmpDirs.push(home);
    const foreign = path.join(home, "foreign");
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, "vc-secrets-shim.mjs"), "// a decoy, not this package's shim\n");

    const r = spawnSync(process.execPath, [script], { encoding: "utf8",
        env: { ...process.env, HOME: home, CLAUDE_PLUGIN_ROOT: foreign } });

    assert.equal(r.status, 0, r.stderr);
    const installed = path.join(home, ".claude", "plugins", "data", "vc-secrets-ai-tools", "vc-secrets-shim.mjs");
    const own = fileURLToPath(new URL("./vc-secrets-shim.mjs", import.meta.url));
    assert.equal(fs.readFileSync(installed, "utf8"), fs.readFileSync(own, "utf8"),
        "the installed bytes must be this package's own shim");
});

test("install-shim: a destination whose bytes differ is called different, not older", () => {
    // The comparison settles THAT the two differ and nothing about which way, so a downgrade was
    // announced as an upgrade. The word is the whole of what this pins.
    const script = fileURLToPath(new URL("./scripts/install-shim.mjs", import.meta.url));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-inst-diff-"));
    tmpDirs.push(home);
    const dest = path.join(home, ".claude", "plugins", "data", "vc-secrets-ai-tools", "vc-secrets-shim.mjs");
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, "// not the shim\n");
    const r = spawnSync(process.execPath, [script], { encoding: "utf8", env: { ...process.env, HOME: home } });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /replaced a different copy/);
    assert.doesNotMatch(r.stdout, /older/);
});

test("install-shim: --data-dir decides the location, in both spellings", () => {
    // The client hands over the directory it assigned; re-deriving a path the client already knows is
    // what this flag replaces. The value is honoured wherever it points, as long as it names this plugin.
    const script = fileURLToPath(new URL("./scripts/install-shim.mjs", import.meta.url));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-inst2-"));
    tmpDirs.push(home);
    const assigned = path.join(home, "elsewhere", "vc-secrets-ai-tools");
    const computed = path.join(home, ".claude", "plugins", "data", "vc-secrets-ai-tools");

    for (const argv of [["--data-dir", assigned], [`--data-dir=${assigned}`]]) {
        fs.rmSync(assigned, { recursive: true, force: true });
        const r = spawnSync(process.execPath, [script, ...argv], { encoding: "utf8", env: { ...process.env, HOME: home } });
        assert.equal(r.status, 0, r.stderr);
        assert.ok(fs.existsSync(path.join(assigned, "vc-secrets-shim.mjs")), `${argv[0]}\n${r.stdout}${r.stderr}`);
        assert.equal(fs.existsSync(computed), false, "the computed default must not be created when a directory was passed");
        assert.match(r.stdout, /--data-dir/);
    }

    // A dropped argument would install into the computed default and report that as the choice, so an
    // argument that is neither spelling has to stop the run rather than be skipped.
    const typo = spawnSync(process.execPath, [script, "--data-dirs", assigned], { encoding: "utf8", env: { ...process.env, HOME: home } });
    assert.equal(typo.status, 1);
    assert.match(typo.stderr, /unrecognised argument/);
});

test("install-shim: a --data-dir naming another plugin is ignored, with a warning", { skip: !CAN_RUN_BASH && "needs a bash that can run this node, since the case is a SHELL expansion" }, () => {
    // The regression this exists for: the documented line is a SHELL line, so where Claude Code does not
    // substitute `${CLAUDE_PLUGIN_DATA}` the shell expands it from the inherited environment — measured as
    // `…/data/codex-openai-codex`. That is an absolute path, so nothing syntactic rejects it, and a later
    // uninstall of that plugin would delete this plugin's shim with its data directory. Reproduced through
    // a real shell, because through argv alone the case cannot occur.
    const script = fileURLToPath(new URL("./scripts/install-shim.mjs", import.meta.url));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-inst3-"));
    tmpDirs.push(home);
    const foreign = path.join(home, ".claude", "plugins", "data", "some-other-plugin");
    fs.mkdirSync(foreign, { recursive: true });

    const r = spawnSync("bash", ["-c", `${JSON.stringify(process.execPath)} ${JSON.stringify(script)} --data-dir "\${CLAUDE_PLUGIN_DATA}"`], {
        encoding: "utf8", env: { ...process.env, HOME: home, CLAUDE_PLUGIN_DATA: foreign },
    });
    // Without this the missing-bash case fails on `r.stderr` being undefined, which names nothing.
    assert.equal(r.error, undefined, `a shell is required to reproduce this: ${r.error?.code}`);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /ignoring --data-dir/);
    assert.equal(fs.existsSync(path.join(foreign, "vc-secrets-shim.mjs")), false, "must not write into another plugin's directory");
    assert.ok(fs.existsSync(path.join(home, ".claude", "plugins", "data", "vc-secrets-ai-tools", "vc-secrets-shim.mjs")));
    assert.match(r.stdout, /some-other-plugin/);
});

test("install-shim: a --data-dir that never expanded is refused, not turned into a directory", () => {
    // Reachable on Windows, where cmd.exe leaves `${...}` alone: the placeholder arrives as text and
    // `mkdir` on it would succeed quietly, creating a directory named after the variable.
    const script = fileURLToPath(new URL("./scripts/install-shim.mjs", import.meta.url));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-inst4-"));
    tmpDirs.push(home);

    const r = spawnSync(process.execPath, [script, "--data-dir", "${CLAUDE_PLUGIN_DATA}"], {
        encoding: "utf8", env: { ...process.env, HOME: home },
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /must be an absolute path/);
    assert.equal(fs.existsSync(path.join(home, ".claude")), false, "nothing may be created on that path");
});

test("install-shim: an empty --data-dir falls back to the computed default and says which was used", () => {
    // A shell expanding an unset variable produces this, and it is what a human copy-pasting the
    // documented line into a terminal gets. The default is right for every install whose marketplace
    // carries the shipped name, so it proceeds — but the output has to name the choice.
    const script = fileURLToPath(new URL("./scripts/install-shim.mjs", import.meta.url));
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-inst5-"));
    tmpDirs.push(home);

    const r = spawnSync(process.execPath, [script, "--data-dir", ""], {
        encoding: "utf8", env: { ...process.env, HOME: home },
    });
    assert.equal(r.status, 0, r.stderr);
    assert.ok(fs.existsSync(path.join(home, ".claude", "plugins", "data", "vc-secrets-ai-tools", "vc-secrets-shim.mjs")));
    assert.match(r.stdout, /arrived empty/);
});

// ── clients.mjs ─────────────────────────────────────────────────────────────────────────────────

test("clientNames: returns the three clients, sorted", () => {
    assert.deepEqual(clients.clientNames(), ["claude-code", "codex", "cursor"]);
});

test("clientDescriptor: every client carries the whole contract", () => {
    for (const name of clients.clientNames()) {
        const d = clients.clientDescriptor(name);
        assert.equal(typeof d.displayName, "string", `${name}: displayName`);
        assert.ok(["json", "toml"].includes(d.format), `${name}: format is json or toml`);
        assert.equal(typeof d.serversKey, "string", `${name}: serversKey`);
        assert.ok(d.launcherRef === null || typeof d.launcherRef === "string", `${name}: launcherRef`);
        assert.ok(
            d.minVersion === null || d.minVersion === clients.MIN_VERSION_UNKNOWN || typeof d.minVersion === "string",
            `${name}: minVersion is a version, null for "no floor", or the unknown sentinel`);
        assert.equal(typeof d.configFiles, "object", `${name}: configFiles`);
        assert.ok(Object.keys(d.configFiles).length > 0, `${name}: configFiles is not empty`);
    }
});

test("clientDescriptor: an unknown client names the ones that exist", () => {
    assert.throws(() => clients.clientDescriptor("windsurf"), /windsurf.*claude-code, codex, cursor/s);
});

test("clients.json: claude-code carries all three MCP scopes", () => {
    assert.deepEqual(
        Object.keys(clients.clientDescriptor("claude-code").configFiles).sort(),
        ["local", "project", "user"]);
});

test("clients.json: only Cursor's floor is unknown", () => {
    assert.equal(clients.clientDescriptor("claude-code").minVersion, null);
    assert.equal(clients.clientDescriptor("codex").minVersion, null);
    assert.equal(clients.clientDescriptor("cursor").minVersion, clients.MIN_VERSION_UNKNOWN);
});

// ── hooks/targets.mjs ───────────────────────────────────────────────────────────────────────────

test("targetsFrom: the edit tools' path field is read", () => {
    assert.deepEqual(t.targetsFrom({ tool_name: "Edit", tool_input: { file_path: "/repo/.claude/vc-secrets.json" } }),
        { paths: ["/repo/.claude/vc-secrets.json"], readable: true });
});

test("targetsFrom: a notebook path is read too, so a notebook edit is not an unreadable payload", () => {
    // The matcher is Edit|Write|NotebookEdit (hooks/hooks.json:5) and NotebookEdit carries
    // notebook_path. Without this the guard prints an unrecognised-payload notice on every notebook
    // edit in any project — turning a silent no-op into a per-edit warning, which erodes the signal
    // the notice exists to create.
    assert.deepEqual(t.targetsFrom({ tool_name: "NotebookEdit", tool_input: { notebook_path: "/repo/nb.ipynb" } }),
        { paths: ["/repo/nb.ipynb"], readable: true });
});

test("targetsFrom: a tool that does not write a file is read, not unreadable", () => {
    // Cursor's hook schema documents no matcher, so its hook sees every tool call. This case must be
    // silent or the notice fires constantly and stops meaning anything.
    assert.deepEqual(t.targetsFrom({ tool_name: "Read", tool_input: { pattern: "x" } }),
        { paths: [], readable: true });
});

test("targetsFrom: a WRITE tool that yields no path is UNREADABLE, not 'writes nothing'", () => {
    // The residual Cursor risk, made loud. If Cursor spells its path key differently from its
    // documentation, this is the payload we get — and `readable: true` would exit 0 with no notice,
    // which failClosed cannot catch because the hook succeeded.
    assert.deepEqual(t.targetsFrom({ tool_name: "Write", tool_input: { destination: "/repo/x" } }),
        { paths: [], readable: false });
});

test("targetsFrom: a payload with no tool_input at all is unreadable", () => {
    assert.deepEqual(t.targetsFrom({ tool_name: "Write", hook_event_name: "PreToolUse" }),
        { paths: [], readable: false });
});

test("targetsFrom: apply_patch carries its patch under `command`, and every path-bearing header is read", () => {
    // The key is `command`, NOT `input`: `input` is the internal Rust field name, re-keyed for the hook
    // at codex-rs/core/src/tools/handlers/apply_patch.rs
    //   tool_input: serde_json::json!({ "command": command })
    // and corroborated where a block reason is composed, hook_runtime.rs. Reading the wrong key
    // returns readable:false, the guard exits 0, and EVERY apply_patch write to a declaration is
    // allowed — behind a notice that reads as harmless.
    //
    // *** Move to: is a fourth path-bearing header (parser.rs). A rename ONTO a declaration path
    // writes it while a three-header regex reports success — the exact failure the list contract exists
    // to prevent, reached through a different header.
    const patch = [
        "*** Begin Patch",
        "*** Update File: /repo/notes.md",
        "*** Move to: /repo/.claude/vc-secrets.json",
        "*** End Patch",
    ].join("\n");
    const got = t.targetsFrom({ tool_name: "apply_patch", tool_input: { command: patch } });
    assert.deepEqual(got.paths, ["/repo/notes.md", "/repo/.claude/vc-secrets.json"]);
    assert.equal(got.readable, true);
});

test("targetsFrom: a context line is not mistaken for a header", () => {
    // A context line is space-prefixed (grammar, parser.rs), and the upstream parser preserves that
    // leading space inside a hunk while trimming only at top-level dispatch. A guard that trims both
    // ends refuses edits to files that merely DOCUMENT the patch format — and a guard that fires on
    // unrelated edits is the guard people disable.
    const patch = [
        "*** Begin Patch",
        "*** Update File: /repo/doc.md",
        "@@",
        " *** Update File: /repo/.claude/vc-secrets.json",
        "*** End Patch",
    ].join("\n");
    assert.deepEqual(t.targetsFrom({ tool_name: "apply_patch", tool_input: { command: patch } }).paths,
        ["/repo/doc.md"]);
});

test("targetsFrom: a patch with CRLF line endings is read", () => {
    const patch = "*** Begin Patch\r\n*** Add File: /repo/.claude/vc-secrets.json\r\n*** End Patch\r\n";
    assert.deepEqual(t.targetsFrom({ tool_name: "apply_patch", tool_input: { command: patch } }).paths,
        ["/repo/.claude/vc-secrets.json"]);
});

test("targetsFrom: an Environment ID header is not a path", () => {
    // It has a filename production in the grammar and names an environment. The upstream constant is
    // `*** Environment ID:` with NO trailing space (streaming_parser.rs), so a regex demanding one
    // is stricter than the parser it models.
    const patch = "*** Begin Patch\n*** Environment ID:remote\n*** Add File: /repo/x\n*** End Patch";
    assert.deepEqual(t.targetsFrom({ tool_name: "apply_patch", tool_input: { command: patch } }).paths,
        ["/repo/x"]);
});

test("guard: exits 2 with a reason on a declaration path, in every payload shape", () => {
    // One invocation, no --client: the shared hook file has one command string, so the payload has to
    // be the authority on its own shape.
    for (const [label, payload] of [
        ["edit-tool", { tool_name: "Write", tool_input: { file_path: "/repo/.claude/vc-secrets.json" } }],
        ["notebook", { tool_name: "NotebookEdit", tool_input: { notebook_path: "/repo/.claude/vc-secrets.json" } }],
        ["apply_patch", { tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Update File: /repo/.claude/vc-secrets.json\n*** End Patch" } }],
    ]) {
        const r = spawnSync(process.execPath, [GUARD_HOOK_PATH], {
            input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env },
        });
        assert.equal(r.status, 2, `${label}: exit 2`);
        // A non-empty reason is part of the contract, not decoration: exit 2 with empty stderr is
        // treated as a failure on Codex and the call proceeds.
        assert.ok(r.stderr.trim().length > 0, `${label}: a non-empty reason`);
    }
});

test("guard: an unreadable payload is reported and does not block", () => {
    const r = spawnSync(process.execPath, [GUARD_HOOK_PATH], {
        input: JSON.stringify({ tool_name: "Write", hook_event_name: "PreToolUse" }), encoding: "utf8",
        env: { ...process.env },
    });
    assert.equal(r.status, 0, "not inspected is not grounds to block");
    assert.match(r.stderr, /not inspected/);
});

const SKILLS_DIR = fileURLToPath(new URL("./skills", import.meta.url));

const VERBS = ["doctor", "install", "migrate"];

// ── skills/ ─────────────────────────────────────────────────────────────────────────────────────

test("skills: the three verbs each ship a SKILL.md", () => {
    assert.deepEqual(fs.readdirSync(SKILLS_DIR).sort(), VERBS);
    for (const verb of VERBS) {
        assert.ok(fs.existsSync(path.join(SKILLS_DIR, verb, "SKILL.md")), `${verb}/SKILL.md`);
    }
});

test("skills: the destructive verbs keep the model-invocation barrier on both clients that have one", () => {
    for (const verb of ["install", "migrate"]) {
        const body = fs.readFileSync(path.join(SKILLS_DIR, verb, "SKILL.md"), "utf8");
        // Anchored at the start of the string and tolerant of CRLF. A pattern shaped like
        // /^---\n[\s\S]*?\nname: / cannot match `---\nname:` — it demands a newline that is not there.
        assert.match(body, /^---\r?\n(?:.*\r?\n)*?disable-model-invocation: true\r?\n/,
            `${verb}: disable-model-invocation in frontmatter`);
        const policy = fs.readFileSync(path.join(SKILLS_DIR, verb, "agents", "openai.yaml"), "utf8");
        // Codex's default is TRUE when the file or the key is absent, so this file is the only thing
        // standing between the model and a destructive verb there.
        assert.match(policy, /allow_implicit_invocation:\s*false/, `${verb}: Codex policy`);
    }
});

test("skills: doctor is not gated — it is the diagnostic and writes nothing", () => {
    const body = fs.readFileSync(path.join(SKILLS_DIR, "doctor", "SKILL.md"), "utf8");
    assert.ok(!body.includes("disable-model-invocation"), "doctor stays model-invocable");
    assert.ok(!fs.existsSync(path.join(SKILLS_DIR, "doctor", "agents")), "and needs no Codex policy file");
});

test("skills: every body names the launcher in a form that resolves on each client", () => {
    // The placeholder is Claude Code's mechanism; the skill-relative path is Codex's, resolved by the
    // model rather than by a shell. Both are present so neither client silently gets the other's form.
    for (const verb of VERBS) {
        const body = fs.readFileSync(path.join(SKILLS_DIR, verb, "SKILL.md"), "utf8");
        assert.match(body, /\$\{CLAUDE_PLUGIN_ROOT\}/, `${verb}: the substituted form`);
        assert.match(body, /\.\.\/\.\.\//, `${verb}: the skill-relative fallback`);
        assert.ok(!body.includes('"$VC_SECRETS"'),
            `${verb}: $VC_SECRETS comes from a Claude-Code settings env block and is unset on the other two`);
    }
});

test("skills: no positional-argument token can be rewritten inside a body", () => {
    // A skill body is argument-substituted before the model reads it, and a substituted token that
    // happens to be legal in the target language produces a command that succeeds and lies.
    for (const verb of VERBS) {
        const body = fs.readFileSync(path.join(SKILLS_DIR, verb, "SKILL.md"), "utf8");
        assert.doesNotMatch(body, /\$ARGUMENTS|\$\d|\$@/, `${verb}: no positional token`);
    }
});

test("no orphaned command references survive the deletion, with or without the leading slash", () => {
    // /vc-secrets:install still resolves on Claude Code — a plugin skill keeps the namespaced
    // invocation. What breaks is its truth on Cursor and Codex, so the strings become client-neutral.
    //
    // Matched WITHOUT requiring the slash. A slash-anchored sweep misses an assertion that pins the
    // bare substring, and misses the references inside the command bodies being carried across. It is
    // also why the pattern names the three verbs rather than the bare prefix: `vc-secrets:` on its own
    // is the KEYSTORE namespace (`vc-secrets:<projectId>:<name>`) and appears legitimately ~20 times.
    const VERB_REF_RE = /vc-secrets:(install|migrate|doctor)\b/;
    const root = fileURLToPath(new URL(".", import.meta.url));
    const offenders = [];
    const walk = (dir) => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) {
                if (entry.name !== "node_modules") { walk(full); }
            } else if (/\.(mjs|js|md|json)$/.test(entry.name) && !full.endsWith("vc-secrets.test.mjs")) {
                if (VERB_REF_RE.test(fs.readFileSync(full, "utf8"))) { offenders.push(full); }
            }
        }
    };
    walk(root);
    assert.deepEqual(offenders, [], "every command reference was rewritten client-neutrally");
});

const CURSOR_HOOKS = fileURLToPath(new URL("./hooks/hooks-cursor.json", import.meta.url));

const CLAUDE_HOOKS = fileURLToPath(new URL("./hooks/hooks.json", import.meta.url));

const CLAUDE_MANIFEST = fileURLToPath(new URL("./.claude-plugin/plugin.json", import.meta.url));

const CURSOR_MANIFEST = fileURLToPath(new URL("./.cursor-plugin/plugin.json", import.meta.url));

const CODEX_MANIFEST = fileURLToPath(new URL("./.codex-plugin/plugin.json", import.meta.url));

// The fourth copy of the description, and the only one outside this package.
const MARKETPLACE = fileURLToPath(new URL("../../.claude-plugin/marketplace.json", import.meta.url));

// ── manifests and hook files ────────────────────────────────────────────────────────────────────

test("manifests: three per-client, and no root one", () => {
    for (const p of [CLAUDE_MANIFEST, CURSOR_MANIFEST, CODEX_MANIFEST]) {
        assert.ok(fs.existsSync(p), p);
    }
    // A root manifest in the portable format would need a $schema value nobody established, and would
    // re-impose a version floor that the native per-client manifests remove.
    assert.ok(!fs.existsSync(fileURLToPath(new URL("./plugin.json", import.meta.url))),
        "no root manifest — the per-client ones are the shipped shape");
});

test("manifests: the shared identity fields cannot drift", () => {
    const claude = JSON.parse(fs.readFileSync(CLAUDE_MANIFEST, "utf8"));
    for (const p of [CURSOR_MANIFEST, CODEX_MANIFEST]) {
        const other = JSON.parse(fs.readFileSync(p, "utf8"));
        // `description` used to be free per manifest, and the long copies -- the Claude manifest and
        // the marketplace card -- drifted into a closed enumeration of the env-value kinds, "secret: or
        // literal:", which stayed behind when `oauth:` became a third. The Cursor and Codex copies were
        // the ones that stayed correct, precisely because they enumerate nothing. Comparing the files
        // to each other pins no literal: the expected value is read from a sibling, so this cannot
        // become a transcribed constant.
        for (const key of ["name", "version", "homepage", "repository", "license", "description"]) {
            assert.equal(other[key], claude[key], `${p}: ${key}`);
        }
    }
});

test("manifests: the marketplace card repeats the manifest description exactly", () => {
    // The fourth copy, and the one a customer reads BEFORE installing -- so a wrong claim here is the
    // most expensive of the four. It has already gone wrong once: the card asserted an isolation
    // property the code does not have. It lives outside this package, which is why the three
    // manifests agreeing with each other is not enough to catch it.
    const claude = JSON.parse(fs.readFileSync(CLAUDE_MANIFEST, "utf8"));
    const card = JSON.parse(fs.readFileSync(MARKETPLACE, "utf8"));
    const entry = card.plugins.find((x) => x.name === claude.name);

    assert.ok(entry, `no ${claude.name} entry in the marketplace catalog`);
    assert.equal(entry.description, claude.description);
});

test("manifests: only Cursor names a hooks file; Codex relies on the default path", () => {
    const cursor = JSON.parse(fs.readFileSync(CURSOR_MANIFEST, "utf8"));
    assert.equal(cursor.hooks, "./hooks/hooks-cursor.json");
    assert.equal(cursor.skills, "./skills/");

    const codex = JSON.parse(fs.readFileSync(CODEX_MANIFEST, "utf8"));
    // The default when the field is absent is <plugin_root>/hooks/hooks.json — the same file Claude
    // Code finds by convention. Naming it would be equivalent; omitting it makes the sharing explicit
    // and removes a second place to keep in sync.
    assert.ok(!("hooks" in codex), "no hooks field — the default already resolves to hooks/hooks.json");
    assert.equal(codex.skills, "./skills/");
});

test("hooks: the shared file names no client, and keeps the substituted placeholder", () => {
    const h = JSON.parse(fs.readFileSync(CLAUDE_HOOKS, "utf8"));
    const handler = h.hooks.PreToolUse[0].hooks[0];
    assert.equal(handler.type, "command");
    assert.match(handler.command, /\$\{CLAUDE_PLUGIN_ROOT\}/,
        "both clients that read this file expand it — the second by a deliberate compatibility alias");
    // The point of the whole arrangement: one file, one command string, and therefore no client
    // selector in it. A flag here would be right for whichever client was named and silently wrong
    // for the other.
    assert.doesNotMatch(handler.command, /--client/);
    assert.equal(h.hooks.PreToolUse[0].matcher, "Edit|Write|NotebookEdit");
    // Only `description` and `hooks` are permitted at the top level by the stricter of the two
    // parsers. A stray key here makes the file unparseable for one client while the other is fine.
    assert.deepEqual(Object.keys(h).sort(), ["hooks"]);
});

test("hooks: Cursor's file uses Cursor's schema, names no client, and fails CLOSED", () => {
    const h = JSON.parse(fs.readFileSync(CURSOR_HOOKS, "utf8"));
    assert.equal(h.version, 1);
    const entry = h.hooks.preToolUse[0];          // lowerCamel, and no matcher field exists
    assert.doesNotMatch(entry.command, /--client/);
    // The path resolution for a plugin-provided hook is undocumented, and a nonzero exit is fail-open
    // by default — so without this, a wrong path leaves no guard and no signal.
    assert.equal(entry.failClosed, true);
});

// ── the shim resolves on any client, not only the one with a registry ───────────────────────────

test("shim: with no client registry, it resolves through a plugin cache instead", () => {
    // The whole point of generalising: a machine with no Claude Code has no installed_plugins.json,
    // and before this the shim failed there — which made every generated config entry that names it
    // useless on the two clients this plugin was widened for.
    const r = runShim(["doctor"], { caches: [{ client: "codex", version: "1.0.0", label: "codex-cache" }] });
    assert.match(r.stderr, /STUB-RAN:codex-cache/);
});

test("shim: the cache walk compares versions, so 0.10.0 beats 0.9.0", () => {
    // Measured upstream on a sibling plugin: picking by modification time returned the OLDER of two
    // directories 33 ms apart, and a lexicographic name sort puts 0.10.0 before 0.9.0. Only a numeric
    // comparison survives both, and getting it wrong runs a stale launcher in silence.
    const r = runShim(["doctor"], { caches: [
        { client: "codex", version: "0.9.0", label: "old" },
        { client: "codex", version: "0.10.0", label: "new" },
    ] });
    assert.match(r.stderr, /STUB-RAN:new/);
    assert.doesNotMatch(r.stderr, /STUB-RAN:old/);
});

test("shim: a cache directory holding no launcher is not a candidate", () => {
    // A partial or abandoned install leaves the version directory behind. Treating it as the newest
    // install would fail every launch with a missing-file error naming a path nobody chose.
    const r = runShim(["doctor"], { caches: [
        { client: "codex", version: "2.0.0", label: "empty", launcher: false },
        { client: "codex", version: "1.0.0", label: "real" },
    ] });
    assert.match(r.stderr, /STUB-RAN:real/);
});

test("shim: a same-named plugin from another marketplace is never ranked, however high its version", () => {
    // The plugin name is not its identity. A `vc-secrets` under another marketplace is another
    // publisher's code, and ranking it with ours handed it the launch -- and every secret the launcher then
    // resolves -- the moment its version number was higher.
    const r = runShim(["doctor"], { caches: [
        { client: "claude", marketplace: "ai-tools", version: "1.0.0", label: "ours" },
        { client: "claude", marketplace: "somebody-else", version: "9.9.9", label: "foreign" },
    ] });
    assert.match(r.stderr, /STUB-RAN:ours/);
    assert.doesNotMatch(r.stderr, /STUB-RAN:foreign/);
});

test("shim: when only another marketplace holds a vc-secrets, the failure names its paths and imports none of them", () => {
    const r = runShim(["doctor"], { caches: [
        { client: "claude", marketplace: "somebody-else", version: "9.9.9", label: "foreign-a" },
        { client: "codex", marketplace: "lookalike", version: "1.0.0", label: "foreign-b" },
    ] });
    assert.equal(r.status, 1, r.stderr);
    assert.doesNotMatch(r.stderr, /STUB-RAN/, "a candidate from another marketplace must never be loaded");
    assert.ok(r.stderr.includes(`no install of ${PLUGIN_KEY} was found in the plugin cache`), r.stderr);
    assert.match(r.stderr, /somebody-else[/\\]vc-secrets[/\\]9\.9\.9/, r.stderr);
    assert.match(r.stderr, /lookalike[/\\]vc-secrets[/\\]1\.0\.0/, r.stderr);
});

test("shim: caches are searched across clients, and the newest version wins wherever it lives", () => {
    const r = runShim(["doctor"], { caches: [
        { client: "claude", version: "1.0.0", label: "claude-cache" },
        { client: "codex", version: "1.1.0", label: "codex-cache" },
    ] });
    assert.match(r.stderr, /STUB-RAN:codex-cache/);
});

test("shim: the registry still wins over the caches, because only it knows per-project installs", () => {
    const stub = writeStubInstall("registry");
    const registry = shimRegistry([
        { projectPath: "/nowhere", version: "0.0.1", lastUpdated: "2024-01-01", installPath: stub },
    ]);
    const r = runShim(["doctor"], { registry, caches: [{ client: "codex", version: "9.9.9", label: "cache" }] });
    assert.match(r.stderr, /STUB-RAN:registry/);
    assert.doesNotMatch(r.stderr, /STUB-RAN:cache/);
});

test("shim: when nothing resolves anywhere, the failure names every root it looked in", () => {
    const r = runShim(["doctor"]);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /installed_plugins\.json/, "the registry it tried");
    assert.match(r.stderr, /\.codex[/\\]plugins[/\\]cache/, "and the caches it walked");
});

// ── emit-config ─────────────────────────────────────────────────────────────────────────────────

test("shim-path: the three levels are three exports, so no caller does dirname arithmetic", () => {
    const env = { HOME: "/home/x" };
    assert.equal(m.defaultDataHome(env), path.join("/home/x", ".claude", "plugins", "data"));
    assert.equal(m.defaultShimDir(env), path.join(m.defaultDataHome(env), "vc-secrets-ai-tools"));
    assert.equal(m.defaultShimPath(env), path.join(m.defaultShimDir(env), "vc-secrets-shim.mjs"));
});

// ── README ──────────────────────────────────────────────────────────────────────────────────────

test("README: documents every client the descriptors know, with its floor", () => {
    const readme = fs.readFileSync(fileURLToPath(new URL("./README.md", import.meta.url)), "utf8");
    for (const name of clients.clientNames()) {
        const d = clients.clientDescriptor(name);
        assert.ok(readme.includes(d.displayName), `README names ${d.displayName}`);
        for (const template of Object.values(d.configFiles)) {
            // The first token of a template is the path; the parenthetical is guidance.
            assert.ok(readme.includes(template.split(" ")[0]), `README names ${template.split(" ")[0]}`);
        }
    }
    assert.match(readme, /UNKNOWN/, "the unmeasured floor is marked, not silently omitted");
});

test("README: the trust step is documented, because a hook that is not trusted never runs", () => {
    const readme = fs.readFileSync(fileURLToPath(new URL("./README.md", import.meta.url)), "utf8");
    assert.match(readme, /trusted_hash|trust the hook/i);
});

// ── the guard against RELATIVE paths ────────────────────────────────────────────────────────────

test("guard: a relative declaration path is blocked, in every payload shape", () => {
    // Every earlier guard test wrote an absolute path, so none of them could discover that the
    // matcher required one. The client whose patch headers are workspace-relative by construction is
    // the one this guard was widened for, which made it inert there — silently, at exit 0.
    for (const [label, payload] of [
        ["edit-tool", { tool_name: "Write", tool_input: { file_path: ".claude/vc-secrets.json" } }],
        ["dot-slash", { tool_name: "Edit", tool_input: { file_path: "./.claude/vc-secrets.local.json" } }],
        ["windows", { tool_name: "Write", tool_input: { file_path: ".claude\\vc-secrets.json" } }],
        ["apply_patch", { tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Update File: .claude/vc-secrets.json\n*** End Patch" } }],
    ]) {
        const r = spawnSync(process.execPath, [GUARD_HOOK_PATH], {
            input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env },
        });
        assert.equal(r.status, 2, `${label}: exit 2`);
        assert.ok(r.stderr.trim().length > 0, `${label}: a non-empty reason`);
    }
});

test("guard: the relative match is anchored at a path boundary, not anywhere in the string", () => {
    // Loosening the anchor is the obvious fix and it over-matches: a directory merely ENDING in
    // ".claude" is somebody else's, and a guard that refuses unrelated edits is the guard people turn
    // off.
    const r = spawnSync(process.execPath, [GUARD_HOOK_PATH], {
        input: JSON.stringify({ tool_name: "Write", tool_input: { file_path: "vendor.claude/vc-secrets.json" } }),
        encoding: "utf8", env: { ...process.env },
    });
    assert.equal(r.status, 0, "not our declaration");
});

// Every file an edit could use to reach a token, by the criterion the hook states, which has three
// prongs and needs only one: loaded into a process that holds a token, relaxing what an agent may do
// without a human (switching this guard off is the extreme of that; a skill's invocation policy is the
// ordinary case), or deciding the content of a file that does either. Not "does this file touch a
// token", and not "is it code" or "is it prose": each of those readings certified files harmless on
// their appearance, and each was wrong. The question is what an edit to the file can DO.
//
// `vc-secrets-error.mjs` is the sharpest case of the first prong: an ESM import runs its target at
// module-evaluation time, so it executes both in the process that reads the keystore and, by way of
// `vc-secrets-target.mjs`, inside the MCP server process that holds the token in its environment.
// `install-shim.mjs` is here on the third prong, not the first -- nothing on the token path imports it,
// and it writes the shim -- and `vc-secrets-shim.mjs` joins it there, being what gets written. These
// names are distinctive enough to match anywhere.
const GUARDED_ANYWHERE = [
    "vc-secrets.mjs",
    "vc-secrets-oauth.mjs",
    "vc-secrets-cache.mjs",
    "vc-secrets-preload.mjs",
    "vc-secrets-target.mjs",
    "vc-secrets-shim.mjs",
    "vc-secrets-error.mjs",
    // Imported by the launcher AND by the cache module, so it is loaded wherever either is --
    // which is every token-holding process this package starts.
    "vc-secrets-teardown.mjs",
    // Here, not in the unguarded list, and the move is the point: its exclusion used to rest on "nothing
    // on the run path imports it", which is true and answers who IMPORTS the probe. What decides its risk
    // is who RUNS it -- `skills/doctor/SKILL.md`, guarded, names the command -- and what it may import:
    // it already imports the launcher, so every export the launcher has is one line away.
    "vc-secrets-probe.mjs",
    "hooks/guard-declarations.mjs",
    "scripts/install-shim.mjs",
    "scripts/shim-path.mjs",
];

// The same criterion, with a shorter reach. These names belong to half the repositories on this machine
// and the hook runs in all of them, so the guard scopes them to the package directory instead of
// claiming the names. What that gives up is pinned by "guard: a name this package does not own is
// guarded inside the package and nowhere else" rather than by a footnote here.
//
// A hook registration switches this guard off with one key, where editing `guard-declarations.mjs` does
// it the hard way -- and a client manifest is cheaper still, since one of them is the only thing
// pointing a client at a registration file. `clients.json` is read by the guarded `clients.mjs` at
// module-evaluation time, so it reaches the launcher's process as data that module acts on. The skill
// files are invocation policy wearing documentation's clothes: `disable-model-invocation: true` is what
// keeps `install` and `migrate` -- a verb that copies a file and a verb that rewrites keystore entries
// -- human-invoked, and `doctor` carries neither key, being here for the opposite reason: it is the one
// skill a model may invoke unprompted, and its body is the command that then runs.
const GUARDED_IN_PACKAGE = [
    "clients.mjs",
    "clients.json",
    "hooks/targets.mjs",
    "hooks/hooks.json",
    "hooks/hooks-cursor.json",
    // The manifests are the cheapest entry on prong 2, not an afterthought on it: the cursor one carries
    // `"hooks": "./hooks/hooks-cursor.json"` and is the only thing pointing a client at that file, so
    // repointing one key makes a guarded registration inert without editing it. Each manifest is also
    // what makes this plugin exist for its client, so deleting one takes the hook with it.
    ".claude-plugin/plugin.json",
    ".codex-plugin/plugin.json",
    ".cursor-plugin/plugin.json",
    "skills/doctor/SKILL.md",
    "skills/install/SKILL.md",
    "skills/migrate/SKILL.md",
    "skills/install/agents/openai.yaml",
    "skills/migrate/agents/openai.yaml",
    // The launcher, split by layer; matched by directory -- LIB_RE.
    "lib/util.mjs",
    "lib/spawn.mjs",
    "lib/config.mjs",
    "lib/keystore.mjs",
    "lib/trust.mjs",
    "lib/oauth-token.mjs",
    "lib/oauth-login.mjs",
    "lib/oauth-checks.mjs",
    "lib/launch.mjs",
    "lib/doctor.mjs",
    "lib/cli.mjs",
];

// Outside the set, and down to one. `README.md` is prose for people: no frontmatter, no permission
// grant, no key any client reads, and nothing executes it. That is what separates it from the skill
// files, and from `vc-secrets-probe.mjs`, which qualifies once the question is "what can an edit to
// this file do" rather than "who imports it".
// `LICENSE` is the repository-root licence copied in so the plugin is licensed where it is distributed
// from; like the README it is prose that loads nowhere and grants nothing.
const UNGUARDED_FILES = ["README.md", "LICENSE"];

// Neither guarded nor unguarded-by-decision: they are the subject's own instrument, and the two helper
// modules they share. Listed so the classification below accounts for every tracked file rather than
// filtering some out of view.
const TEST_FILES = ["vc-secrets.test.mjs", "vc-secrets-oauth.test.mjs", "test-support.mjs", "test-fixtures.mjs",
    "lib/util.test.mjs", "lib/spawn.test.mjs", "lib/config.test.mjs", "lib/keystore.test.mjs", "lib/trust.test.mjs",
    "lib/oauth-token.test.mjs", "lib/oauth-login.test.mjs", "lib/oauth-checks.test.mjs", "lib/launch.test.mjs",
    "lib/doctor.test.mjs", "lib/cli.test.mjs"];

// The guard does not use its own process's working directory as a root, and these two helpers still name
// one explicitly, so no result depends on where the suite is run from.
const NEUTRAL_GUARD_CWD = os.tmpdir();

function runGuardOn(filePath, toolName = "Write") {
    return spawnSync(process.execPath, [GUARD_HOOK_PATH], {
        input: JSON.stringify({ tool_name: toolName, tool_input: { file_path: filePath } }),
        encoding: "utf8", env: { ...process.env }, cwd: NEUTRAL_GUARD_CWD,
    });
}

function runGuardWith(payload, spawnCwd = NEUTRAL_GUARD_CWD) {
    return spawnSync(process.execPath, [GUARD_HOOK_PATH], {
        input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env }, cwd: spawnCwd,
    });
}

// ── the guard over this package's OWN modules ───────────────────────────────────────────────────

test("guard: every vc-secrets module that can reach a token is blocked, in every payload shape", () => {
    // Named for the rule and not for a module: a title naming one file reads as a pin on the rule and
    // is not one, so the module added next year arrives outside every test's subject.
    for (const module of GUARDED_ANYWHERE) {
        for (const [label, payload] of [
            ["absolute", { tool_name: "Write", tool_input: { file_path: `/home/dev/ai-tools/plugins/vc-secrets/${module}` } }],
            ["relative", { tool_name: "Edit", tool_input: { file_path: `plugins/vc-secrets/${module}` } }],
            ["dot-slash", { tool_name: "Write", tool_input: { file_path: `./${module}` } }],
            // The module's own separators are converted too, or the three entries carrying a directory
            // send a mixed path that matches WITHOUT the hook's backslash normalisation -- so the
            // fixture would go on passing for them if that normalisation ever became conditional.
            ["windows", { tool_name: "Write", tool_input: { file_path: `plugins\\vc-secrets\\${module.replace(/\//g, "\\")}` } }],
            // The version segment is not decoration here either, even though `MODULE_RE` matches by file
            // and would pass without it: a fixture labelled "plugin-cache" that does not carry the
            // installed layout documents a path that does not exist, and would keep passing if this
            // pattern were ever scoped the way the other one is.
            ["plugin-cache", { tool_name: "Edit", tool_input: { file_path: `/home/dev/.claude/plugins/cache/ai-tools/vc-secrets/0.1.0/${module}` } }],
            ["apply_patch", { tool_name: "apply_patch", tool_input: { command: `*** Begin Patch\n*** Update File: plugins/vc-secrets/${module}\n*** End Patch` } }],
            // The two shapes a workspace rooted AT the package produces, which is the ordinary way to
            // work on it. They are also the only ones that exercise the `^` half of the anchor:
            // `./x` matches through the slash in `./`, never through `^`. Without these two, removing `^`
            // alone would leave the whole suite green, so the half of the anchor whose absence is this
            // file's recorded historical bug would be pinned by nothing.
            ["bare", { tool_name: "Write", tool_input: { file_path: module } }],
            ["bare-in-patch", { tool_name: "apply_patch", tool_input: { command: `*** Begin Patch\n*** Update File: ${module}\n*** End Patch` } }],
        ]) {
            const r = spawnSync(process.execPath, [GUARD_HOOK_PATH], {
                input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env },
            });
            assert.equal(r.status, 2, `${module} via ${label}: exit 2`);
            assert.ok(r.stderr.trim().length > 0, `${module} via ${label}: a non-empty reason`);
        }
    }
});

test("guard: a module match is anchored at a path boundary and at the .mjs extension", () => {
    // Four fixtures, and the mutations that reach them are not one mutation. Drop the boundary and
    // `my-vc-secrets.mjs` -- somebody else's file -- is refused, and a guard that refuses unrelated
    // edits is the guard people switch off; fixtures 1 and 2 pin that. Drop the `$` and a backup file
    // beside the module becomes unwritable; fixtures 3 and 4 pin that, and it is the smaller and more
    // likely edit of the two. Deleting `\.mjs$` outright is a THIRD mutation and reaches further than
    // either: it reddens fixtures 3 and 4 here AND takes the package's own test files read-only,
    // which "guard: the package's own test files stay writable" holds. `$` alone does not reach
    // that second effect, because `.test.mjs` cannot
    // match `(-…)?\.mjs` however the tail is anchored -- which is why the two mutations are not
    // interchangeable even though both touch the same four characters.
    for (const notOurs of [
        "my-vc-secrets.mjs",
        "vendor/notvc-secrets-oauth.mjs",
        "plugins/vc-secrets/vc-secrets.mjs.bak",
        "plugins/vc-secrets/vc-secrets-oauth.mjs.orig",
    ]) {
        assert.equal(runGuardOn(notOurs).status, 0, `${notOurs}: not one of ours`);
    }
});

test("guard: the package's own test files stay writable", () => {
    // Checked against the three prongs rather than on sight, because "a test file holds no token" is
    // the discredited reading and this is the last code exclusion anyone will reuse as a precedent: a
    // test file is loaded into no process that holds a token, is read as policy by no client, and
    // decides the content of no file that does either. And freezing it stops all work on the package,
    // which is the fastest route to the guard being switched off wholesale.
    for (const testFile of [
        "plugins/vc-secrets/vc-secrets.test.mjs",
        "plugins/vc-secrets/vc-secrets-oauth.test.mjs",
        "plugins/vc-secrets/test-support.mjs",
        "plugins/vc-secrets/test-fixtures.mjs",
        "/home/dev/ai-tools/plugins/vc-secrets/vc-secrets.test.mjs",
    ]) {
        assert.equal(runGuardOn(testFile, "Edit").status, 0, `${testFile}: tests are how this package is worked on`);
    }
});

test("guard: a name this package does not own is guarded inside the package and nowhere else", () => {
    // `clients.mjs`, `clients.json`, `targets.mjs`, `hooks.json` -- ordinary filenames, every one. This
    // hook is registered by an enabled plugin, so it runs in every repository on the machine, and
    // claiming those names would refuse edits in repositories that have never heard of us, which is how
    // a guard gets switched off. Both halves are asserted, because only the pair expresses "scoped":
    // blocked under the package directory, allowed without it. The cost is real and it does not land on
    // the harmless half: a workspace rooted AT this package sends these bare, and the bare form is
    // uncovered only when no usable root completes it -- no payload `cwd` and no
    // `workspace_roots` (the next tests pin the completion). It then covers none of the scoped list, nor the `lib/` modules, which are
    // directory-scoped the same way and have their own test. The launcher and the hook itself stay
    // covered there, being file-matched, so the gap is every directory-scoped name. Stated as the list
    // rather than as a count, because a count written in prose goes stale the next time the list grows
    // and reads exactly as right as it did before.
    for (const scoped of GUARDED_IN_PACKAGE) {
        assert.equal(runGuardOn(`plugins/vc-secrets/${scoped}`).status, 2, `${scoped}: inside the package`);
        // The installed copy, in the layout `vc-secrets-shim.mjs` measured and encodes --
        // `<root>/<marketplace>/<plugin>/<VERSION>/` -- and not a hand-written path that merely looks
        // like one. This fixture used to omit the version segment, so it asserted coverage of a shape
        // that never occurs while every real installed copy went unguarded, and no mutation could find
        // it: mutations perturb the pattern, never the fixture.
        assert.equal(runGuardOn(`/home/dev/.claude/plugins/cache/ai-tools/vc-secrets/0.1.0/${scoped}`).status, 2,
            `${scoped}: the installed copy, under its version directory`);
        assert.equal(runGuardOn(`/home/dev/.claude/plugins/cache/ai-tools/vc-secrets/34040c9c5685/${scoped}`).status, 2,
            `${scoped}: the installed copy, where the version directory is a hash`);
        assert.equal(runGuardOn(scoped).status, 0, `${scoped}: bare -- the stated gap, not an oversight`);
        assert.equal(runGuardOn(`some-other-project/${scoped}`).status, 0, `${scoped}: somebody else's`);
    }
});

test("guard: lib/ modules are guarded inside the package, by directory, and nowhere else", () => {
    // Short names are the price of the split's readability, and a short name is not this package's to
    // claim machine-wide -- so lib/ is matched by directory, like the scoped list above.
    for (const p of [
        "plugins/vc-secrets/lib/keystore.mjs",
        "/home/dev/ai-tools/plugins/vc-secrets/lib/keystore.mjs",
        "plugins\\vc-secrets\\lib\\keystore.mjs",
        "/home/u/.claude/plugins/cache/ai-tools/vc-secrets/0.3.0/lib/keystore.mjs",
    ]) {
        assert.equal(runGuardOn(p).status, 2, p);
    }
    assert.equal(runGuardOn("lib/keystore.mjs").status, 0, "a bare lib/ path with no cwd is somebody else's");
    assert.equal(runGuardOn("other-repo/lib/keystore.mjs").status, 0, "a lib/ outside the package");
    // The trade LIB_RE makes, pinned rather than discovered: a lib/ under any directory named
    // vc-secrets (with one optional segment) is refused, in a repository that is not this one too.
    assert.equal(runGuardOn("/home/dev/vc-secrets/src/lib/util.mjs").status, 2, "accepted false positive");
    // Tests split along lib/ live beside it and must stay writable, or work on the package stops.
    assert.equal(runGuardOn("plugins/vc-secrets/lib/keystore.test.mjs", "Edit").status, 0);
});

test("guard: a relative path is resolved against the payload's cwd before it is matched", () => {
    const pkg = "/home/dev/ai-tools/plugins/vc-secrets";
    for (const rel of ["lib/keystore.mjs", "clients.mjs", "hooks/targets.mjs", "hooks/hooks.json"]) {
        assert.equal(runGuardWith({ tool_name: "Write", cwd: pkg, tool_input: { file_path: rel } }).status, 2, rel);
    }
    assert.equal(runGuardWith({ tool_name: "apply_patch", cwd: pkg,
        tool_input: { command: "*** Begin Patch\n*** Update File: lib/keystore.mjs\n*** End Patch" } }).status, 2, "patch header");
    assert.equal(runGuardWith({ tool_name: "apply_patch", cwd: "/home/dev/ai-tools/plugins/other",
        tool_input: { command: "*** Begin Patch\n*** Update File: ../vc-secrets/lib/keystore.mjs\n*** End Patch" } }).status, 2,
    "climbing into the package from a sibling");
    assert.equal(runGuardWith({ tool_name: "Write", cwd: "C:\\Users\\dev\\ai-tools\\plugins\\vc-secrets",
        tool_input: { file_path: "lib\\keystore.mjs" } }).status, 2, "windows cwd");
    assert.equal(runGuardWith({ tool_name: "Write", cwd: "/home/dev/other-repo",
        tool_input: { file_path: "clients.mjs" } }).status, 0, "same name, another repository");
    assert.equal(runGuardWith({ tool_name: "Write", cwd: pkg,
        tool_input: { file_path: "lib/keystore.test.mjs" } }).status, 0, "tests stay writable");
    for (const cwd of [undefined, "", 42]) {
        assert.equal(runGuardWith({ tool_name: "Write", cwd, tool_input: { file_path: "clients.mjs" } }).status, 0,
            `cwd ${JSON.stringify(cwd)}: nothing to resolve against, matched as sent`);
    }
    // An absolute path is never re-rooted: cwd only completes a path that is relative.
    for (const abs of ["/tmp/clients.mjs", "/clients.mjs"]) {
        assert.equal(runGuardWith({ tool_name: "Write", cwd: pkg, tool_input: { file_path: abs } }).status, 0, abs);
    }
});

test("guard: with no payload cwd, workspace_roots complete a relative path, and the hook's own directory does not", () => {
    const pkg = "/home/dev/ai-tools/plugins/vc-secrets";
    const write = (extra, file_path = "lib/keystore.mjs", spawnCwd) =>
        runGuardWith({ tool_name: "Write", ...extra, tool_input: { file_path } }, spawnCwd);
    assert.equal(write({ workspace_roots: [pkg] }).status, 2, "workspace_roots");
    assert.equal(write({ workspace_roots: ["/home/dev/other-repo", pkg] }).status, 2, "multiroot: any root can be the package");
    assert.equal(write({ workspace_roots: ["/home/dev/other-repo"] }).status, 0, "no root is the package");
    assert.equal(write({ workspace_roots: [pkg] }, "lib/keystore.test.mjs").status, 0, "tests stay writable");
    assert.equal(write({ workspace_roots: pkg }).status, 0, "not an array: ignored");
    // A payload that is JSON `null` has no fields to read roots from; it must still exit 0 like any
    // payload with nothing to inspect, not die on the property access.
    const nullPayload = runGuardWith(null);
    assert.equal(nullPayload.status, 0, "a JSON null payload");
    assert.equal(nullPayload.stderr, "", "and nothing thrown");
    const odd = write({ workspace_roots: [42, null, {}, "", [pkg]] });
    assert.equal(odd.status, 0, "non-string entries: ignored");
    assert.equal(odd.stderr, "", "and nothing thrown");
    // The hook's own working directory is NOT a root. The Cursor registration's command is relative
    // (`./hooks/...`), so it works only when run from the plugin directory, which is package-shaped,
    // while the workspace is any other repository; treating that directory as a root refused ordinary
    // files there. Claude Code's registration uses `${CLAUDE_PLUGIN_ROOT}` instead.
    const base = fs.mkdtempSync(path.join(os.tmpdir(), "guard-own-cwd-"));
    try {
        const inside = path.join(base, "plugins", "vc-secrets");
        fs.mkdirSync(inside, { recursive: true });
        const elsewhere = { workspace_roots: ["/home/u/some-js-app"] };
        for (const file of ["src/lib/util.mjs", "lib/index.mjs", "clients.json", ".claude/skills/review/SKILL.md"]) {
            assert.equal(write(elsewhere, file, inside).status, 0, `${file}: another repository, hook spawned from the package`);
        }
        assert.equal(write({ workspace_roots: [pkg] }, "lib/keystore.mjs", inside).status, 2,
            "still covered through the payload's own roots");
    } finally {
        fs.rmSync(base, { recursive: true, force: true });
    }
});

test("guard: a drive-relative Windows path is read as relative to the client's cwd", () => {
    // `C:lib\x` is lib\x under drive C's current directory. Read as a stream suffix it became the
    // segment `C`, which no pattern matches -- an allow for a path naming a guarded file.
    const pkg = "C:\\repo\\plugins\\vc-secrets";
    // The case that tells the cwd form built from the sent path from one built from the raw path:
    // joined raw, `C:..` stays inside a segment and the climb out of lib\ is lost.
    assert.equal(runGuardWith({ tool_name: "Write", cwd: "C:\\repo\\plugins\\vc-secrets\\lib",
        tool_input: { file_path: "C:..\\clients.mjs" } }).status, 2, "climbing out of lib to a scoped name");
    for (const p of ["C:lib\\keystore.mjs", "C:clients.mjs", "C:hooks\\targets.mjs", "d:lib\\keystore.mjs"]) {
        assert.equal(runGuardWith({ tool_name: "Write", cwd: pkg, tool_input: { file_path: p } }).status, 2, p);
    }
    assert.equal(runGuardWith({ tool_name: "Write", cwd: "C:\\repo\\plugins\\other",
        tool_input: { file_path: "C:..\\vc-secrets\\lib\\x.mjs" } }).status, 2, "climbing into the package");
    assert.equal(runGuardOn("C:vc-secrets.mjs").status, 2, "file-matched, no cwd needed");
    assert.equal(runGuardWith({ tool_name: "Write", cwd: pkg, tool_input: { file_path: "C:lib\\x.test.mjs" } }).status, 0,
        "tests stay writable");
});

test("guard: the pattern is machine-wide, and a same-named file in an unrelated repo is refused", () => {
    // Accepted behaviour, pinned so it stops being nobody's decision. Matching by file rather than by
    // directory is what reaches every home this module has -- a checkout, the plugin cache, another
    // marketplace's directory -- and no prefix reaches all three. The cost arrives with it: this hook
    // is registered by an enabled plugin, so it runs in every repository on the machine, and somebody
    // else's `vc-secrets.mjs` gets a refusal whose remedy does not apply to them.
    assert.equal(runGuardOn("some-other-project/src/vc-secrets.mjs").status, 2,
        "a cost of file-matching, not an oversight -- change this test deliberately or not at all");
});

test("guard: every file deliberately outside the set stays writable", () => {
    // What this pins is one decision: `README.md` grants nothing, so it stays writable. The isolating
    // mutation is a pattern that reaches it -- adding `README\.md` to the scoped alternation reddens
    // this test and no other.
    //
    // One obvious mutation does NOT pin it, and the green it produces means nothing: widening the module
    // alternation to `vc-secrets(-[a-z]+)?\.mjs$` swallows no file, because no `vc-secrets-*` file is
    // outside the guarded set -- a prefix sweep and the explicit list are behaviourally identical here.
    // Written down because that green looks like coverage and is the absence of a subject.
    for (const outside of UNGUARDED_FILES) {
        assert.equal(runGuardOn(`plugins/vc-secrets/${outside}`).status, 0, `${outside}: outside the set on purpose`);
    }
});

test("guard: the installed shim keeps its reinstall remedy, and the source copy gets the PR one", () => {
    // Order-dependent, and nothing else notices if the order is undone: the module pattern also matches
    // the installed path, so checking it first would answer an installed-copy edit with "open a PR",
    // where the fix is a reinstall. Both remedies are correct and each is useless in the other place.
    const installed = runGuardOn("plugins/data/vc-secrets-ai-tools/vc-secrets-shim.mjs");
    assert.equal(installed.status, 2);
    assert.match(installed.stderr, /reinstall it with the vc-secrets install skill/);

    const source = runGuardOn("plugins/vc-secrets/vc-secrets-shim.mjs");
    assert.equal(source.status, 2);
    assert.doesNotMatch(source.stderr, /reinstall it with the vc-secrets install skill/);
    assert.match(source.stderr, /human PR/);
});

// There is deliberately no test asserting that nothing on the run path imports `vc-secrets-probe.mjs`.
// The claim is true and checkable, and it decides nothing: membership does not turn on the import graph
// at all, so no edge appearing or disappearing can move a file in or out of the guarded set. A test for
// it would pin a fact and read as pinning a policy.

test("guard: every file this package ships is classified -- guarded or deliberately not", () => {
    // The enumeration is every file in the package directory, walked from disk, and the absence of any
    // filter on it is not a preference: three different filters have each hidden a file that belonged
    // here, and each is named below. A hand-kept list cannot report the file somebody adds beside it.
    // A filtered walk is worse: it reports a confident, complete-looking answer about the part it can
    // see. This test has twice been that walk -- first filtering to `.mjs`, which hid
    // `hooks/hooks.json`, an off switch one key wide; then skipping dot-directories as "manifests
    // rather than package code", which hid `.cursor-plugin/plugin.json`, the file that POINTS at a
    // guarded registration and is cheaper to repoint than the registration is to edit. Then the same
    // question in its "is it prose?" form put five skill files under "the documentation", and every
    // one of those clauses was false for them. Each filter answered "what KIND of file is this?" where
    // the criterion asks what an edit to it can DO -- and the next filter of that shape would hide the
    // next one.
    //
    // If this ever fails on a file nobody added, read it as the package having grown untracked scratch
    // beside its own code, and say so -- do not answer it by filtering the file out, which is how both
    // of the misses above were introduced.
    //
    // So this walk has no filter of any kind: every directory is descended and every FILE is reported,
    // dot-directories included. The test files are a list of their own rather than an exclusion,
    // because an exclusion is a filter and this test is about not having one.
    //
    // `git ls-files` would be a better subject still -- it names what the package ships -- and it is
    // deliberately not used: the mutation control runs the suite from a copied directory that is not a
    // git repository, so the check would fail there for a reason having nothing to do with the mutation
    // under test, and every mutation would redden two tests instead of one.
    const root = fileURLToPath(new URL("./", import.meta.url));
    const walk = (dir, prefix = "") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        (e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
    const shipped = walk(root).sort();
    assert.ok(shipped.length > 20, `expected the package's files, got ${shipped.length}`);

    assert.deepEqual(shipped,
        [...GUARDED_ANYWHERE, ...GUARDED_IN_PACKAGE, ...UNGUARDED_FILES, ...TEST_FILES].sort(),
        "a shipped file is in none of the four lists -- decide whether it is loaded into a token-holding "
        + "process, relaxes what an agent may do without a human, or decides the content of a file "
        + "that does either, "
        + "then add it to one");
});

test("ci: the workflow runs every test file in this package, through the quoted glob", () => {
    // The step runs `node --test "$pattern"`. A test file the pattern does not reach -- a different
    // suffix, or a dot-directory, which Node's glob skips -- never runs in CI while every local run of
    // it passes. test-support.mjs imports node:test for the shared test wrappers and is not a test
    // file; it is the one exemption, by name.
    //
    // Residual: a file that registers tests only through `import "node:test"` or through a
    // test-support.mjs re-export is not detected here. By convention only `*.test.mjs` files declare
    // tests.
    const repo = fileURLToPath(new URL("../../", import.meta.url));
    const workflow = fs.readFileSync(path.join(repo, ".github/workflows/unit-tests.yml"), "utf8");
    const pattern = /^\s*pattern="([^"]+)"$/m.exec(workflow)?.[1];
    assert.equal(pattern, "plugins/vc-secrets/**/*.test.mjs", "the glob changed");
    assert.match(workflow, /^\s*node --test "\$pattern"$/m, "the glob must reach node quoted");
    const globbed = new Set(fs.globSync(pattern, { cwd: repo }).map((p) => p.split(path.sep).join("/")));
    const root = path.join(repo, "plugins/vc-secrets");
    const walk = (dir, prefix = "") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        (e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
    const all = walk(root);
    const registers = all.filter((f) => /\.m?js$/.test(f) && f !== "test-support.mjs"
        && /\bfrom\s*["']node:test["']/.test(fs.readFileSync(path.join(root, f), "utf8")));
    assert.ok(registers.length >= 2, registers.join(","));
    for (const f of [...registers, ...all.filter((x) => x.endsWith(".test.mjs"))]) {
        assert.ok(globbed.has(`plugins/vc-secrets/${f}`), `${f} declares tests but the CI glob will not run it`);
    }
});

test("targetsFrom: a patch that names no file is unreadable, like any other write that yields no path", () => {
    // fromPathFields already calls this case unreadable; fromPatch returned readable:true
    // unconditionally, so an upstream header-spelling change would degrade to silence rather than to
    // the notice this reader exists to produce.
    assert.deepEqual(t.targetsFrom({ tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** End Patch" } }),
        { paths: [], readable: false });
});

test("shim: a prerelease does not outrank its own release", () => {
    // parseInt("0-rc") is 0, so 1.0.0-rc.1 keyed as [1,0,0,1] and beat 1.0.0 keyed as [1,0,0] on the
    // fourth segment. Silently running a release candidate against production declarations.
    const r = runShim(["doctor"], { caches: [
        { client: "codex", version: "1.0.0", label: "release" },
        { client: "codex", version: "1.0.0-rc.1", label: "prerelease" },
    ] });
    assert.match(r.stderr, /STUB-RAN:release/);
    assert.doesNotMatch(r.stderr, /STUB-RAN:prerelease/);
});

test("shim: a bare commit hash does not outrank a real release", () => {
    // A registry records a commit hash as the version of a plugin that declares none. parseInt reads a
    // numeric prefix, so "34040c9c5685" would key as 34040 and outrank 0.1.0.
    const r = runShim(["doctor"], { caches: [
        { client: "codex", version: "0.1.0", label: "release" },
        { client: "codex", version: "34040c9c5685", label: "hash" },
    ] });
    assert.match(r.stderr, /STUB-RAN:release/);
    assert.doesNotMatch(r.stderr, /STUB-RAN:hash/);
});

test("shim: a symlinked version directory is a candidate, because a linked install is a real one", { skip: !CAN_SYMLINK && "needs an environment that permits creating a symlink" }, () => {
    // readdirSync does not follow links, so Dirent.isDirectory() is false for a symlink-to-directory —
    // measured. Skipping those silently picks an older real directory, or reports a plugin that IS
    // installed as missing. Loading a plugin from a local directory is a documented route. On win32 the link is
    // a junction, and libuv reports every reparse point as a link to readdir (src/win/fs.c, scandir), which
    // is what Dirent.isSymbolicLink() reads -- so the shim treats it as it does a symlink.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-link-home-"));
    tmpDirs.push(home);
    const real = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-link-real-"));
    tmpDirs.push(real);
    fs.writeFileSync(path.join(real, "vc-secrets.mjs"),
        'export async function runCli() { process.stderr.write("STUB-RAN:linked\\n"); }\n');
    const pluginDir = path.join(home, ".codex", "plugins", "cache", "ai-tools", "vc-secrets");
    fs.mkdirSync(pluginDir, { recursive: true });
    fs.symlinkSync(real, path.join(pluginDir, "2.0.0"), LINK_TYPE);

    const r = spawnSync(process.execPath, [SHIM_PATH, "doctor"],
        { env: shimEnv(home), cwd: home, encoding: "utf8" });
    assert.match(r.stderr, /STUB-RAN:linked/);
});

test("shim: a registry record pointing at a vanished install falls back to a healthy cache", () => {
    // The caches were consulted only when the registry yielded ZERO records, so a stale record — the
    // ordinary result of a manual removal or a half-finished update — was a hard failure telling the
    // developer to reinstall something that is sitting on disk.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-stale-home-"));
    tmpDirs.push(home);
    fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"),
        JSON.stringify(shimRegistry([{ version: "1.0.0", installPath: path.join(home, "gone") }])));
    const cacheDir = path.join(home, ".codex", "plugins", "cache", "ai-tools", "vc-secrets", "1.0.0");
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, "vc-secrets.mjs"),
        'export async function runCli() { process.stderr.write("STUB-RAN:cache-fallback\\n"); }\n');

    const r = spawnSync(process.execPath, [SHIM_PATH, "doctor"],
        { env: shimEnv(home), cwd: home, encoding: "utf8" });
    assert.match(r.stderr, /STUB-RAN:cache-fallback/);
});

// A branch ends at the NEXT heading of any level, not at the next `###`. Splitting on `###` alone
// leaves the last client's branch running to the end of the file, so it absorbs the troubleshooting
// section and an assertion about that branch passes on text from somewhere else entirely.
function setupBranch(readme, client) {
    const from = readme.indexOf(`### ${client}`);
    if (from === -1) {
        return null;
    }
    const rest = readme.slice(from + 4);
    const next = rest.search(/^#{2,4} /m);

    return next === -1 ? rest : rest.slice(0, next);
}

test("README: each per-client setup branch names the diagnostic, not just the document", () => {
    // Counting the word across the whole file is satisfied by the knobs table alone, so the previous
    // assertion could stay green with a branch that never mentions it.
    const readme = fs.readFileSync(fileURLToPath(new URL("./README.md", import.meta.url)), "utf8");
    for (const client of ["Claude Code", "Cursor", "Codex"]) {
        const branch = setupBranch(readme, client);
        assert.ok(branch, `a setup branch for ${client}`);
        assert.match(branch, /doctor/, `${client}: the branch ends by running the diagnostic`);
    }
});

test("README: the Codex branch tells the reader to create the shim its emitted entry names", () => {
    // emit-config bakes an absolute shim path into every entry for that client. A machine following
    // the branch verbatim and never running install pastes entries naming a file nothing created, and
    // every wrapped server then fails at launch with a module-not-found naming a path the reader never
    // chose.
    const readme = fs.readFileSync(fileURLToPath(new URL("./README.md", import.meta.url)), "utf8");
    assert.match(setupBranch(readme, "Codex"), /install` skill|install skill/, "the branch names the install skill");
});

test("shim: a version with fewer segments still loses to a genuinely higher one", () => {
    // Missing segments count as zero rather than as "lower than anything", so 1.0 and 1.0.0 are the
    // same version and neither outranks the other by shape alone.
    const r = runShim(["doctor"], { caches: [
        { client: "codex", version: "1.0", label: "two-segment" },
        { client: "codex", version: "1.0.1", label: "higher" },
    ] });
    assert.match(r.stderr, /STUB-RAN:higher/);
});

test("shim: a stale registry record falls back to a HEALTHY REGISTRY record before the caches", () => {
    // The fallthrough went straight to the caches, so with one broken and one healthy record and no
    // cache install it exited 1 saying the registry "points nowhere" while a healthy record sat in it.
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-sibling-home-"));
    tmpDirs.push(home);
    const good = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-sibling-good-"));
    tmpDirs.push(good);
    fs.writeFileSync(path.join(good, "vc-secrets.mjs"),
        'export async function runCli() { process.stderr.write("STUB-RAN:sibling\\n"); }\n');
    fs.mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", "plugins", "installed_plugins.json"), JSON.stringify(shimRegistry([
        { version: "1.0.0", lastUpdated: "2024-01-01", installPath: good },
        { version: "2.0.0", lastUpdated: "2024-02-01", installPath: path.join(home, "gone") },
    ])));
    const r = spawnSync(process.execPath, [SHIM_PATH, "doctor"],
        { env: shimEnv(home), cwd: home, encoding: "utf8" });
    assert.match(r.stderr, /STUB-RAN:sibling/);
});

test("README: the Cursor branch also names the install skill and the variable that has to reach it", () => {
    // Only the Codex branch had this assertion, so the Cursor branch could lose the same instruction
    // silently — and it is the branch whose entry uses a variable, so a missing instruction there
    // leaves the entry expanding to nothing.
    const cursor = setupBranch(fs.readFileSync(fileURLToPath(new URL("./README.md", import.meta.url)), "utf8"), "Cursor");
    assert.match(cursor, /install` skill|install skill/, "names the install skill");
    assert.match(cursor, /VC_SECRETS/, "names the variable its entry expands");
});

test("README: the trust probe names both causes, since it cannot distinguish them", () => {
    // targets.mjs records the matcher assumption and points at this probe as its only detector. A
    // probe documented as meaning one thing hands back the wrong diagnosis for the other.
    const readme = fs.readFileSync(fileURLToPath(new URL("./README.md", import.meta.url)), "utf8");
    const lines = readme.split("\n");
    const at = lines.findIndex((l) => /two causes/i.test(l));
    assert.ok(at >= 0, "the probe is documented as ambiguous");
    // Scoped to the blockquote paragraph rather than the whole file: `matcher` occurs elsewhere in
    // this README, so a whole-file match stays green with the sentence naming the second cause gone.
    let end = at;
    while (end + 1 < lines.length && /^>\s*\S/.test(lines[end + 1])) { end += 1; }
    assert.match(lines.slice(at, end + 1).join("\n"), /matcher/i,
        "the second cause is named in the same blockquote, not merely somewhere in the document");
});

// Reads the module sources and returns every non-ASCII character sitting inside a string literal.
// Quote-state, not a pattern: a `//` comment may keep its typography, and a trailing comment on a code
// line must not be mistaken for the code. The narrower guard beside it pins three mapResolveError
// messages and forTerminal's truncation marker by value; this one is the rule those three are
// instances of, and it reaches every message in the listed modules -- `fail()` writes each of them
// with the same raw `fs.writeSync(2, ...)` that cmdDoctor's report uses.
//
// Ported from the source's own guard. It exists here because a hand-rolled sweep of the same class
// missed a live message: a scanner carrying quote state ACROSS lines desynchronised on a quote inside
// a regex literal and reported the region as code, so the sweep and its verification -- the same
// function -- agreed on a wrong answer. Per-line state cannot drift that way; it costs false
// positives on an apostrophe in a comment, which is the safe direction.
//
// Two blind spots, both measured to have no instance today. The comment skip fires on any two
// adjacent slashes at closed quote state, so a regex literal spelling one -- `/^https?:\/\//` --
// ends the scan of that line early; the package's escaped-slash regexes never form the pair. And
// per-line state cannot see a continuation line of a multi-line template, inherited from the source
// and harmless here because the three such templates hold PowerShell, whose every message sits in
// an inner quote pair this does open. A help text spanning lines would be unguarded.
function nonAsciiInEmittedLiterals(source) {
    const found = [];
    for (const [lineNo, line] of source.split("\n").entries()) {
        let quote = null;
        for (let i = 0; i < line.length; i += 1) {
            const ch = line[i];
            // Stop at a line comment, which the source's version does not do although its own header
            // says a comment "may keep its typography". Its corpus never exposes the gap; this one
            // does, at twelve sites -- eleven of them comments whose own apostrophe or quotation mark
            // opens quote state, and the twelfth the real defect. Only when quote state is CLOSED: a
            // `//` inside a string (a URL in a message) is text, not the start of a comment.
            if (quote === null && ch === "/" && line[i + 1] === "/") { break; }
            if (quote === null && "\"'`".includes(ch)) { quote = ch; continue; }
            if (quote !== null && ch === "\\") {
                // An ESCAPE can smuggle a non-ASCII character past a scanner that only looks at the
                // bytes of the source: `\\u2014` is six ASCII characters here and an em dash at runtime.
                const escaped = /^\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2}))/
                    .exec(line.slice(i));
                if (escaped) {
                    const point = parseInt(escaped[1] ?? escaped[2] ?? escaped[3], 16);
                    if (point > 127) {
                        found.push(`line ${lineNo + 1}: escape ${escaped[0]} in ${line.trim().slice(0, 60)}`);
                    }
                    i += escaped[0].length - 1;
                    continue;
                }
                i += 1;
                continue;
            }
            if (quote !== null && ch === quote) { quote = null; continue; }
            if (quote !== null && ch.charCodeAt(0) > 127) {
                found.push(`line ${lineNo + 1}: ${JSON.stringify(ch)} in ${line.trim().slice(0, 70)}`);
            }
        }
    }

    return found;
}

test("every string literal these modules can print is ASCII", () => {
    // `fail()` writes every VcSecretsError message with the same raw call cmdDoctor's report uses, so
    // a new em dash in any thrown message reaches a console that may not be UTF-8. The source measured
    // one arriving as mojibake; the narrow guard that replaced it only looked at one function's output.
    //
    // Every module of this package is covered, the ones that can reach a terminal and the ones that
    // carry no printable literal today: the first message added to a quiet module is then already
    // checked. The *.test.mjs files, test-support.mjs and test-fixtures.mjs are excluded: they print to
    // no user's terminal.
    //
    // It is WIDER than the source's, deliberately. The source lists only what its launcher loads, and
    // that costs it nothing because it has no counterpart to the shim or the install and hook scripts.
    // Here those three print through the same raw fs.writeSync(2, ...) the rule is argued from, and
    // the shim prints on an MCP server's stderr when a launch fails -- the moment a developer is least
    // able to read mojibake.
    const root = fileURLToPath(new URL("./", import.meta.url));
    const walk = (dir, prefix = "") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        (e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
    // Walked, not listed: a list covers the modules somebody remembered, and the next module -- a
    // lib/ file above all -- would print mojibake with this test green.
    const modules = walk(root).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs") && f !== "test-support.mjs"
        && f !== "test-fixtures.mjs");
    assert.ok(modules.includes("vc-secrets.mjs") && modules.length >= 12, `walk found ${modules.length}`);
    for (const name of modules) {
        const source = fs.readFileSync(path.join(root, name), "utf8");
        assert.deepEqual(nonAsciiInEmittedLiterals(source), [], `non-ASCII in a printable literal of ${name}`);
    }
});

// The tests below pin nonAsciiInEmittedLiterals itself. They exist because the first version of
// this guard was landed with its controls run by hand and thrown away: both of its decision points --
// the escape branch and the quote-state clause on the comment skip -- could then be deleted with the
// whole suite green, which is the defect class the guard was written to stop, one level up.

test("nonAsciiInEmittedLiterals: a non-ASCII character in a string literal is reported", () => {
    const found = nonAsciiInEmittedLiterals('fail("the gpg agent is locked \u2014 run unlock");');
    assert.equal(found.length, 1, `expected one finding, got ${JSON.stringify(found)}`);
    assert.match(found[0], /line 1/);
});

test("nonAsciiInEmittedLiterals: an escape is decoded, because it is ASCII here and not at runtime", () => {
    // Six ASCII characters in the source, an em dash in the message. A scanner that reads the bytes
    // of the file cannot see this at all, which is the hole this branch exists to close.
    const found = nonAsciiInEmittedLiterals('fail("the gpg agent is locked \\u2014 run unlock");');
    assert.equal(found.length, 1, `expected one finding, got ${JSON.stringify(found)}`);
    assert.match(found[0], /escape \\u2014/);
});

test("nonAsciiInEmittedLiterals: a // inside a string does not end the scan", () => {
    // The comment skip fires only at closed quote state. A URL inside a message is text, and a
    // defect after it is still a defect -- without that clause the scan stops at the "//" of the
    // scheme and the rest of the line, this em dash included, is never examined.
    const found = nonAsciiInEmittedLiterals('fail("see https://example.invalid \u2014 then retry");');
    assert.equal(found.length, 1, `expected one finding, got ${JSON.stringify(found)}`);
});

test("run: a repository server nobody trusted is refused by the real launcher, and the server never starts", () => {
    const marker = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-ran-")), "ran");
    tmpDirs.push(path.dirname(marker));
    // The path travels in the environment: a double quote in `args` is refused, and a Windows path would
    // need escaping inside a script.
    const dir = tmpConfigDir({ servers: { probe: { command: process.execPath,
        args: ["-e", "require('node:fs').writeFileSync(process.env.MARKER, 'x')"], env: { MARKER: `literal:${marker}` } } } });
    const env = launcherEnv({ VC_SECRETS_CONFIG_DIR: dir });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "run", "probe"], { env, encoding: "utf8" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /vc-secrets: server "probe" is declared by .* and is not trusted -- review it, then run "vc-secrets trust" in /);
    assert.ok(!fs.existsSync(marker), "the declared command ran");

    seedTrust(env, dir);
    const trusted = spawnSync(process.execPath, [LAUNCHER_PATH, "run", "probe"], { env, encoding: "utf8" });
    assert.equal(trusted.status, 0, trusted.stderr);
    assert.ok(fs.existsSync(marker), "the control: once trusted, the same declaration runs");
});

test("untrust: the real verb needs no declaration and no terminal, and says when there is nothing to remove", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-undeclared-"));
    tmpDirs.push(empty);
    const env = launcherEnv();
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "untrust", empty], { env, cwd: empty, encoding: "utf8", input: "" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /has no trust record -- nothing to remove/);
});

// The default opener, against a real process with no controlling terminal: detached puts the child in a
// session of its own, which is exactly what an agent's tool process without a pty looks like. A test
// that opened /dev/tty here would prove nothing on a developer machine, where one exists.
test("openControllingTerminal: a process in a session without a terminal cannot open one",
    { skip: process.platform === "win32" && "win32 has no /dev/tty and never calls it" },
    () => {
        const script = `import(${JSON.stringify(pathToFileURL(LAUNCHER_PATH).href)}).then((mod) => {`
            + "try { mod.openControllingTerminal(); process.exit(0); } catch { process.exit(42); } });";
        const r = spawnSync(process.execPath, ["-e", script],
            { detached: true, stdio: "ignore", timeout: 20_000 });
        assert.equal(r.status, 42, "opening /dev/tty must fail without a controlling terminal");
    });

test("trustRefusal: a reader of both kinds lists both, and the probe reads the refusal as the launcher's, not as a token problem", async () => {
    const cfg = m.loadConfig(scopedPaths({
        user: { servers: { s: { ...NS_SERVER, env: { ...NS_SERVER.env, ...NS_OAUTH_SERVER.env } } },
            registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: { servers: { s: { command: process.execPath, args: ["-e", ""], envKeys: ["ADO_TOKEN", "PAT"] } } } } } },
        project: { projectId: "proj-x", secrets: { pat: { backend: "local" } }, oauth: { ado: OAUTH_DECL } } }));
    const line = m.trustRefusal("servers", "s", m.trustProblem(cfg, "servers", "s", NO_TRUST), cfg);
    assert.match(line, /reads secret "pat", oauth "ado" from namespace "proj-x"/);
    const probe = await import("./vc-secrets-probe.mjs");
    // The refusals of set, login and logout are never a launcher's last line, but they share the remedy
    // and the wording, and a sign-in word creeping into one would be read as a token problem here.
    const oauthCfg = namespaceOauthCfg();
    const oauthRead = [{ kind: "oauth", name: "ado" }];
    const storeRefusals = [
        m.namespaceStoreRefusal(m.namespaceTrustProblem(oauthCfg, NO_TRUST, oauthRead), oauthCfg),
        m.namespaceStoreRefusal(m.namespaceTrustProblem(namespaceCfg(), NO_TRUST, SECRET_PAT), namespaceCfg()),
    ];
    for (const text of [line, m.trustRefusal("servers", "s", m.trustProblem(oauthCfg, "servers", "s", NO_TRUST), oauthCfg), ...storeRefusals]) {
        assert.equal(probe.classifyProbeFailure(`vc-secrets: ${text}\n`, 1), "launcher",
            "TOKEN_REFUSAL must not match: the remedy is trust, not a sign-in");
    }
});

// The user's own declaration file, under the fixture HOME the launcher will read it from.
function writeUserDeclarations(env, declarations) {
    fs.mkdirSync(path.join(env.HOME, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(env.HOME, ".claude", m.CONFIG_NAME), JSON.stringify(declarations));
}

test("namespaceStoreRefusal: names the entry, the namespace and the trust remedy on one line, and the probe reads it as the launcher's",
    async () => {
        const probe = await import("./vc-secrets-probe.mjs");
        const secret = namespaceCfg();
        const oauth = namespaceOauthCfg();
        const moved = trustedStateFor(oauth);
        moved.repositories[oauth.projectRoot].projectId = "proj-other";
        const lines = [
            m.namespaceStoreRefusal(m.namespaceTrustProblem(secret, NO_TRUST, SECRET_PAT), secret),
            m.namespaceStoreRefusal(m.namespaceTrustProblem(oauth, NO_TRUST, [{ kind: "oauth", name: "ado" }]), oauth),
            m.namespaceStoreRefusal(m.namespaceTrustProblem(oauth, moved, [{ kind: "oauth", name: "ado" }]), oauth),
        ];
        assert.equal(lines[0], `secret "pat" is stored in namespace "proj-x", which this repository declares, and this checkout is not trusted`
            + ` -- review it, then run "vc-secrets trust" in ${secret.projectRoot}`);
        assert.equal(lines[2], `oauth "ado" is stored in namespace "proj-x", and the projectId changed since you trusted this checkout:`
            + ` projectId is "proj-x", trusted "proj-other" -- review it, then run "vc-secrets trust" again in ${oauth.projectRoot}`);
        for (const line of lines) {
            assert.doesNotMatch(line, /\n/);
            assert.equal(probe.classifyProbeFailure(`vc-secrets: ${line}\n`, 1), "launcher",
                "TOKEN_REFUSAL must not match: the remedy is trust, not a sign-in");
        }
    });

test("set: a secret declared in the LOCAL file is gated like a project one", POSIX_STUB_ONLY, () => {
    const recorder = keychainRecorder();
    const env = launcherEnv(recorder.env);
    const root = namespaceRepo({ projectId: "proj-x" }, { secrets: { pat: { backend: "local" } } });
    const refused = runVerb(env, root, "set", "pat");
    assert.equal(refused.status, 1, refused.stderr);
    assert.match(refused.stderr, /secret "pat" is stored in namespace "proj-x", which this repository declares, and this checkout is not trusted/);
    assert.deepEqual(recorder.calls(), []);
});

// Counts the reads of one file made by the verbs that run under `env`, by a preload that wraps
// fs.readFileSync in each node process. The verbs run as child processes, so no in-process spy can see
// them, and the trust file is read behind swallowed errors (doctor's write probe), so output cannot show
// a read either: a count is the only observation that tells "not read" from "read and ignored".
function fileReadCounter(env, file) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-reads-"));
    tmpDirs.push(dir);
    const log = path.join(dir, "reads.log");
    const preload = path.join(dir, "spy.cjs");
    fs.writeFileSync(preload, [
        'const fs = require("node:fs");',
        "const real = fs.readFileSync;",
        "const append = fs.appendFileSync;",
        "fs.readFileSync = function (p, ...rest) {",
        "    if (typeof p === \"string\" && p === process.env.SPY_READ_FILE) {",
        "        append(process.env.SPY_READ_LOG, \"read\\n\");",
        "    }",
        "    return real.call(this, p, ...rest);",
        "};",
    ].join("\n"));

    return {
        env: { ...env, NODE_OPTIONS: `--require ${preload}`, SPY_READ_FILE: file, SPY_READ_LOG: log },
        reads: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean).length : 0),
    };
}

test("set, doctor: a user-scope declaration is never gated, a corrupt trust file stops neither, and only doctor's write probe opens it",
    POSIX_STUB_ONLY, () => {
        const recorder = keychainRecorder();
        const baseEnv = launcherEnv(recorder.env);
        writeUserDeclarations(baseEnv, { secrets: { mine: { backend: "local" } } });
        const trustFile = corruptTrustFile(baseEnv);
        const noRepository = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-no-repo-"));
        tmpDirs.push(noRepository);
        // A repository that declares a projectId but nothing in its namespace to store: doctor's write probe
        // is keyed under that projectId, so it consults the file once -- its supported read -- and falls back
        // to the user key silently when the file is unusable. Nothing else here has a reason to open it.
        const quiet = namespaceRepo({ projectId: "proj-x", secrets: { kv: KV_PAT } });
        for (const [what, cwd, doctorReads] of [
            ["no repository", noRepository, 0],
            ["a repository with no entry of its own to store", quiet, 1],
        ]) {
            const setCounter = fileReadCounter(baseEnv, trustFile);
            const set = runVerb(setCounter.env, cwd, "set", "mine");
            assert.equal(set.status, 0, `${what}: ${set.stderr}`);
            assert.doesNotMatch(set.stderr, /trust/i, what);
            assert.equal(setCounter.reads(), 0, `${what}: set never reads the trust file`);
            const doctorCounter = fileReadCounter(baseEnv, trustFile);
            const doctor = runVerb(doctorCounter.env, cwd, "doctor");
            assert.match(doctor.stderr, /^OK secret "mine" resolvable$/m, `${what}: ${doctor.stderr}`);
            assert.doesNotMatch(doctor.stderr, /trust file|SKIP secret "mine"/, what);
            assert.equal(doctorCounter.reads(), doctorReads, `${what}: reads of the trust file by doctor`);
        }
        assert.ok(recorder.calls().some((call) => call.includes("-s vc-secrets:user:mine")));
    });

test("doctor: a repository's local secret and oauth cache are not read in a checkout that is not trusted for the namespace, and are once it is",
    POSIX_STUB_ONLY, () => {
        const recorder = keychainRecorder();
        const env = launcherEnv(recorder.env);
        writeUserDeclarations(env, { secrets: { mine: { backend: "local" } } });
        const root = namespaceRepo({ ...NS_PAT_PROJECT, oauth: { ado: OAUTH_DECL } });
        const touchedNamespace = () => recorder.calls().filter((call) => call.includes("vc-secrets:proj-x:"));
        const skipPat = 'SKIP secret "pat" not read -- this checkout is not trusted for namespace "proj-x"';
        const skipAdo = 'SKIP oauth "ado" not read -- this checkout is not trusted for namespace "proj-x"';

        const untrusted = runVerb(env, root, "doctor").stderr;
        assert.ok(untrusted.split("\n").includes(skipPat), untrusted);
        assert.ok(untrusted.split("\n").includes(skipAdo), untrusted);
        assert.doesNotMatch(untrusted, /secret "pat" (resolvable|not resolvable)|oauth "ado" \(project\) (signed in|not signed in|cache could not)/);
        assert.deepEqual(touchedNamespace().filter((call) => /:(pat|oauth-ado-)/.test(call)), [], "neither the secret nor the cache was read");
        assert.match(untrusted, /^OK secret "mine" resolvable$/m, "the person's own secret is read as before");

        seedTrust(env, root);
        const trusted = runVerb(env, root, "doctor").stderr;
        assert.doesNotMatch(trusted, /SKIP (secret|oauth)/);
        assert.match(trusted, /^OK secret "pat" resolvable$/m, trusted);
        const reads = touchedNamespace();
        assert.ok(reads.some((call) => call.includes("-s vc-secrets:proj-x:pat ")), `the secret was read: ${reads.join("\n")}`);
        assert.ok(reads.some((call) => call.includes("vc-secrets:proj-x:oauth-ado-refresh")), `and the cache: ${reads.join("\n")}`);
    });

test("doctor: a corrupt trust file is named once, and it is read as not trusted for a repository's entries",
    POSIX_STUB_ONLY, () => {
        const recorder = keychainRecorder();
        const env = launcherEnv(recorder.env);
        const root = namespaceRepo({ ...NS_PAT_PROJECT, oauth: { ado: OAUTH_DECL } });
        const file = corruptTrustFile(env);
        const result = runVerb(env, root, "doctor");
        assert.equal(result.status, 1);
        const naming = result.stderr.split("\n").filter((line) => line.startsWith("FAIL") && line.includes(file));
        assert.equal(naming.length, 1, `one FAIL naming the file:\n${result.stderr}`);
        assert.match(result.stderr, /^SKIP secret "pat" not read -- this checkout is not trusted for namespace "proj-x"$/m);
        assert.match(result.stderr, /^SKIP oauth "ado" not read -- this checkout is not trusted for namespace "proj-x"$/m);
        assert.deepEqual(recorder.calls().filter((call) => /vc-secrets:proj-x:/.test(call) && !/writeprobe/.test(call)), []);
    });

test("doctor: with a launchable that is also gated, an unreadable trust file is still one finding", POSIX_STUB_ONLY, () => {
    const recorder = keychainRecorder();
    const env = launcherEnv(recorder.env);
    writeUserDeclarations(env, { servers: { s: NS_SERVER } });
    const root = namespaceRepo(NS_PAT_PROJECT);
    const file = corruptTrustFile(env);
    const result = runVerb(env, root, "doctor");
    const naming = result.stderr.split("\n").filter((line) => line.startsWith("FAIL") && line.includes(file));
    assert.equal(naming.length, 1, result.stderr);
    assert.match(result.stderr, /^SKIP secret "pat" not read/m);
});

test("untrust revokes what trust granted to set, login and logout", POSIX_STUB_ONLY, () => {
    const recorder = keychainRecorder();
    const env = launcherEnv(recorder.env);
    const root = namespaceRepo(NS_PAT_PROJECT);
    seedTrust(env, root);
    assert.equal(runVerb(env, root, "set", "pat").status, 0);
    assert.equal(runVerb(env, root, "untrust").status, 0);
    const refused = runVerb(env, root, "set", "pat");
    assert.equal(refused.status, 1);
    assert.match(refused.stderr, /is stored in namespace "proj-x", which this repository declares, and this checkout is not trusted/);
});

test("guard-declarations: blocks the trust file, in every payload shape and as an absolute, relative or Windows path", () => {
    for (const [label, payload] of [
        ["absolute", { tool_name: "Write", tool_input: { file_path: "/home/dev/.config/vc-secrets/trust.json" } }],
        ["relative", { tool_name: "Edit", tool_input: { file_path: ".config/vc-secrets/trust.json" } }],
        ["windows", { tool_name: "Write", tool_input: { file_path: "C:\\Users\\dev\\.config\\vc-secrets\\trust.json" } }],
        ["notebook", { tool_name: "NotebookEdit", tool_input: { notebook_path: "/home/dev/.config/vc-secrets/trust.json" } }],
        ["apply_patch", { tool_name: "apply_patch", tool_input: { command: "*** Begin Patch\n*** Update File: /home/dev/.config/vc-secrets/trust.json\n*** End Patch" } }],
    ]) {
        const r = spawnSync(process.execPath, [GUARD_HOOK_PATH], { input: JSON.stringify(payload), encoding: "utf8", env: { ...process.env } });
        assert.equal(r.status, 2, `${label}: exit 2`);
        assert.match(r.stderr, /vc-secrets trust/, `${label}: the reason names the way to change it`);
    }
});

test("guard-declarations: the trust file is blocked in any letter case, as a case-insensitive file system spells it", () => {
    for (const filePath of ["/home/dev/.config/VC-SECRETS/TRUST.JSON", "C:\\Users\\dev\\.config\\Vc-Secrets\\Trust.Json"]) {
        const r = runGuardHook(JSON.stringify({ tool_name: "Write", tool_input: { file_path: filePath } }));
        assert.equal(r.status, 2, filePath);
        assert.match(r.stderr, /trust file/, `${filePath}: blocked as the trust file, not by another pattern`);
    }
});

test("guard-declarations: a trust.json that is not under a vc-secrets directory, or is not the file itself, is not ours", () => {
    for (const notOurs of ["/repo/trust.json", "/repo/not-vc-secrets/trust.json", "/repo/vc-secrets/trust.json.bak",
        "/repo/vc-secrets/trust.json.123.tmp", "/repo/vc-secrets/other/trust.json"]) {
        assert.equal(runGuardHook(guardInput(notOurs)).status, 0, notOurs);
    }
});

test("guard-declarations: a guarded file is blocked under the dot, separator, trailing-dot/space and stream spellings", () => {
    // Each of these names a guarded file to the OS and matches none of the patterns as written: a `.`
    // segment, a doubled separator, and -- on Windows -- a trailing dot or space and an alternate data
    // stream, on the file or on a directory above it. Other aliases (8.3 short names) are not covered.
    const spellings = [
        ["/home/dev/.config/vc-secrets/./trust.json", /trust file/],
        ["/home/dev/.config/vc-secrets//trust.json", /trust file/],
        ["C:\\Users\\dev\\.config\\vc-secrets\\trust.json.", /trust file/],
        ["C:\\Users\\dev\\.config\\vc-secrets\\trust.json ", /trust file/],
        ["C:\\Users\\dev\\.config\\vc-secrets\\trust.json::$DATA", /trust file/],
        ["C:\\Users\\dev\\.config\\vc-secrets\\trust.json:other", /trust file/],
        ["/home/dev/.config/vc-secrets./trust.json", /trust file/],
        ["/home/dev/.config/vc-secrets/x/../trust.json", /trust file/],
        // A stream cut must not turn a directory named `..:x` into a parent reference.
        ["/home/dev/.config/vc-secrets/..:x/../trust.json", /trust file/],
        ["/r/.claude/..:x/../vc-secrets.json", /declaration/],
        // All dots: stripping them leaves an empty segment, a doubled separator only a second pass removes.
        ["C:\\Users\\dev\\.config\\vc-secrets\\...\\trust.json", /trust file/],
        ["/h/u/.claude/./vc-secrets.json", /declaration/],
        ["/repo/.claude/vc-secrets.local.json.", /declaration/],
        ["/repo/src/../.claude/vc-secrets.json", /declaration/],
        ["C:\\repo\\.claude\\vc-secrets.json::$DATA", /declaration/],
        // A stream on a directory in the path: `dir::$INDEX_ALLOCATION` still resolves through the directory.
        ["C:\\Users\\dev\\.config\\vc-secrets::$INDEX_ALLOCATION\\trust.json", /trust file/],
        ["C:\\repo\\.claude::$INDEX_ALLOCATION\\vc-secrets.json", /declaration/],
        ["plugins/vc-secrets/./vc-secrets.mjs", /own code/],
        ["plugins/vc-secrets/vc-secrets-oauth.mjs::$DATA", /own code/],
        ["plugins/vc-secrets/skills/doctor/./SKILL.md", /own code/],
        ["/home/dev/.claude/plugins/data/vc-secrets-ai-tools/./vc-secrets-shim.mjs", /shim/],
    ];
    for (const [spelling, reason] of spellings) {
        const r = runGuardOn(spelling);
        assert.equal(r.status, 2, `${spelling} must be blocked: ${r.stderr}`);
        assert.match(r.stderr, reason, `${spelling} reached the wrong block: ${r.stderr}`);
    }
});

test("guard-declarations: reducing a path to its plain form does not widen the block onto ordinary files", () => {
    for (const ordinary of ["/repo/src/./index.js", "/repo/.claude/./settings.json", "C:\\repo\\src\\a.js", "C:/", "C:\\",
        "/repo/notes:draft.txt", "/repo/vc-secrets/trust.json.bak", "/repo/vc-secrets/x/../other.json",
        "/repo/.claude/vc-secrets.json.bak", "/repo/vc-secrets.json"]) {
        const r = runGuardOn(ordinary);
        assert.equal(r.status, 0, `${ordinary} must pass: ${r.stderr}`);
    }
});

test("emit-config: still emits every server, and says on stderr which the launcher will refuse until trusted", () => {
    // Two, because one server cannot tell "every server" from "the first one".
    const root = trustRepo({ fresh: { command: "true", args: [], env: {} }, second: { command: "true", args: [], env: {} } });
    const env = launcherEnv();
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "emit-config", "claude-code"], { cwd: root, env, encoding: "utf8" });
    assert.equal(r.status, 0, r.stderr);
    const emitted = JSON.parse(r.stdout).mcpServers;
    for (const name of ["fresh", "second"]) {
        assert.ok(Object.hasOwn(emitted, name), `${name}: the entry is emitted regardless`);
        assert.match(r.stderr, new RegExp(`${name}: declared by this repository and not trusted yet -- run "vc-secrets trust" before starting it`));
    }

    seedTrust(env, root);
    const trusted = spawnSync(process.execPath, [LAUNCHER_PATH, "emit-config", "claude-code"], { cwd: root, env, encoding: "utf8" });
    assert.doesNotMatch(trusted.stderr, /not trusted yet/);
});
