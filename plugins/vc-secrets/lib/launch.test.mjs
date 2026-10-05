import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import * as m from "../vc-secrets.mjs";
import * as cache from "../vc-secrets-cache.mjs";
import * as oauth from "../vc-secrets-oauth.mjs";
import { stripComments, tmpDirs, stubChannelPath, channelTest } from "../test-support.mjs";
import {
    CAN_RUN_POSIX_STUB, projectPaths, scopedPaths, trustedStateFor, OAUTH_TENANT_ID, OAUTH_DECL, OAUTH_CLIENT_ID,
    onlyFiles, authorizedOauthPaths, KV_PAT, credHex, d1Config, d1LiveRun, waitFor, withStubOnPath, TRUST_BASE,
    trustCfg, withDeclaration, trustEnv, NO_TRUST, withProcessEnv, NS_SERVER, namespaceCfg, namespaceOauthCfg,
    PRELOAD_URL, TARGET_URL, CMD_LAUNCH_OAUTH_DECL, CMD_LAUNCH_CFG,
    stubBinary,
} from "../test-fixtures.mjs";

// A minimal stand-in for a spawned child, for cmdLaunch tests that inject spawnFn: never signalled
// in these tests. Deliberately pid-less: cmdLaunch kills the child's process GROUP when the launcher
// exits, and a pid borrowed from a real process -- this one's, once -- would name a group that may be
// the runner's own.
function fakeChild() {
    return new EventEmitter();
}

test("childNodeVersionIo: a probe that could not run reports why, not an empty version", () => {
    // Three different failures reported as the same blank: node missing from PATH, node killed by
    // the timeout, and node aborting because it rejected an inherited NODE_OPTIONS. The last is the
    // case this probe was ADDED to catch, and it was indistinguishable from the other two.
    //
    // The refusal is unchanged either way -- any non-version string fails the match below -- so what
    // this pins is the message, which was the only thing wrong.
    const missing = m.childNodeVersionIo({ run: () => ({ error: Object.assign(new Error("spawn node ENOENT"),
        { code: "ENOENT" }), status: null, stdout: "" }) });
    assert.match(missing, /ENOENT/);
    assert.equal(m.childNodeSupportsImport(missing), false, "and it must still refuse");

    // A node that RAN and exited non-zero: no `error`, so a check on that alone would miss it and
    // hand back the empty stdout as though it were a version.
    const rejected = m.childNodeVersionIo({ run: () => ({ error: undefined, status: 9, stdout: "" }) });
    assert.match(rejected, /exit 9/);
    assert.equal(m.childNodeSupportsImport(rejected), false);

    // A node killed by a signal: `status` is null, so an exit code names nothing. spawnSync routes
    // a TIMEOUT through `error` as ETIMEDOUT, so what arrives here is the kill that came from
    // outside -- the OOM killer being the one to expect on a machine loaded enough to matter.
    const killed = m.childNodeVersionIo({ run: () => ({ error: undefined, status: null,
        signal: "SIGKILL", stdout: "" }) });
    assert.match(killed, /SIGKILL/);
    assert.equal(m.childNodeSupportsImport(killed), false);

    // And a probe that worked still answers with the bare version, trimmed.
    assert.equal(m.childNodeVersionIo({ run: () => ({ status: 0, stdout: "v22.23.2\n" }) }), "v22.23.2");
});

test("childNodeVersionIo: probes the command it is given, and PATH node only by default", () => {
    // The defect this pins: the probe hardcoded "node", so a declaration naming another node was
    // measured by an unrelated binary -- refusing a server that would have started, or passing one
    // that then aborts on --import. Asserting the spawned path is the only way to see which node ran.
    // Both platforms, because the probe hands its command to resolveSpawnCommand and that function
    // is where they differ: on win32 a bare `node` carries no separator, so it is resolved to the
    // absolute file the PATH scan finds -- injected here, so the case does not depend on the machine's
    // filesystem -- while a declared path is spawned as written. Pinning one platform and calling it
    // covered is what leaves the other leg of the CI matrix unexercised.
    const existsSync = onlyFiles("c:/bin/node.exe");
    for (const [platform, declared, bare] of [["linux", "/usr/local/bin/node", "node"],
        ["win32", "C:\\Program Files\\nodejs\\node.exe", "C:\\bin\\node.exe"]]) {
        const spawned = [];
        const run = (cmd) => { spawned.push(cmd); return { status: 0, stdout: "v22.23.2\n" }; };
        const env = { Path: "C:\\bin", PATHEXT: ".exe" };

        m.childNodeVersionIo({ run, platform, env, existsSync });
        m.childNodeVersionIo({ command: declared, run, platform, env, existsSync });

        assert.deepEqual(spawned, [bare, declared], platform);
    }
});

test("isNodeCommand: only a binary named node, so a wrapper is never mistaken for one", () => {
    // `npx`, a .bin shim and `dnx` all reach a node the declaration cannot name -- npx resolves its
    // own, and dnx runs no node at all. Answering true for those would put the declared path into a
    // message claiming it was probed.
    // Real install layouts, not invented ones: a distro node, a locally installed one, an `n`-style
    // versioned tree ($N_PREFIX/n/versions/node/<version>/bin/node -- nvm spells it differently, under
    // $NVM_DIR with a `v` prefix), and the Windows installer's path. A fixture that looks like a
    // convention nobody uses teaches the next reader a layout that does not exist.
    const posix = { platform: "linux" };
    for (const yes of ["node", "/usr/bin/node", "/usr/local/bin/node", "./node",
        "/usr/local/n/versions/node/22.11.0/bin/node"]) {
        assert.equal(m.isNodeCommand(yes, posix), true, yes);
    }
    for (const no of ["npx", "dnx", "bash", "/usr/bin/npx", "nodemon", "node-red", "", null, undefined, 7]) {
        assert.equal(m.isNodeCommand(no, posix), false, String(no));
    }

    // Windows: the extension is accepted, both separators resolve, and a wrapper is still a wrapper.
    // `.exe` is stripped on win32 ONLY -- a POSIX file genuinely named `node.exe` is not a node.
    const win = { platform: "win32" };
    for (const yes of ["node", "node.exe", "C:\\Program Files\\nodejs\\node.exe",
        "C:/Program Files/nodejs/node.exe", "C:\\Program Files\\nodejs\\node"]) {
        assert.equal(m.isNodeCommand(yes, win), true, yes);
    }
    for (const no of ["npx.cmd", "C:\\Program Files\\nodejs\\npx.cmd", "dnx.exe", "node.bat"]) {
        assert.equal(m.isNodeCommand(no, win), false, no);
    }
    assert.equal(m.isNodeCommand("node.exe", posix), false, "no .exe stripping off win32");
});

test("childNodeVersionIo: a node the resolver cannot find is a probe that could not run, not an exception", () => {
    const version = m.childNodeVersionIo({ command: "node", platform: "win32",
        env: { Path: "C:\\vc-secrets-no-such-dir", PATHEXT: ".EXE" },
        run: () => assert.fail("nothing was found, so nothing may be spawned") });
    assert.equal(version, "no usable version (node: not found on PATH)");
    assert.equal(m.childNodeSupportsImport(version), false);
});

test("killProcessTree on win32 kills the whole tree, because a plain kill reaches only the top", () => {
    const spawned = [];
    const signalled = [];
    const asked = [];
    m.killProcessTree({ pid: 4242, kill: (s) => signalled.push(["child", s]) }, "SIGTERM", {
        platform: "win32",
        spawnSyncProcess: (cmd, args) => spawned.push([cmd, args]),
        killProcess: (pid, s) => signalled.push([pid, s]),
        resolveCommand: (name) => {
            asked.push(name);

            return { kind: "direct", cmd: `C:\\Windows\\System32\\${name}` };
        },
    });
    assert.deepEqual(asked, ["taskkill.exe"]);
    assert.deepEqual(spawned, [["C:\\Windows\\System32\\taskkill.exe", ["/PID", "4242", "/T", "/F"]]],
        "the RESOLVED absolute path is what is spawned, never the bare name");
    assert.deepEqual(signalled, [], "the win32 branch signals nothing itself");
});

test("killProcessTree on win32 kills only the child when taskkill cannot be resolved, and spawns nothing", () => {
    const spawned = [];
    const signalled = [];
    m.killProcessTree({ pid: 4242, kill: (s) => signalled.push(["child", s]) }, "SIGTERM", {
        platform: "win32",
        spawnSyncProcess: (cmd, args) => spawned.push([cmd, args]),
        resolveCommand: () => { throw new m.VcSecretsError("taskkill.exe: not found on PATH"); },
    });
    assert.deepEqual(spawned, []);
    assert.deepEqual(signalled, [["child", "SIGTERM"]]);
});

test("the win32 default is spawnSync, since a kill-then-exit caller loses the race against an async one", () => {
    // Asserted on the source text because the property — the taskkill has been reaped before we
    // return — is invisible to a seam: an injected spy is called synchronously either way. Match the
    // BINDING, not the parameter name: the name reads `spawnSyncProcess` whatever the default is, so
    // /spawnSyncProcess/ alone passes against `= spawn`, which is the defect this test is named for.
    assert.match(stripComments(m.killProcessTree.toString()), /spawnSyncProcess = spawnSync\b/);
});

test("killProcessTree on posix signals the process GROUP, not the child", () => {
    const signalled = [];
    m.killProcessTree({ pid: 4242, kill: (s) => signalled.push(["child", s]) }, "SIGTERM",
        { platform: "linux", killProcess: (pid, s) => signalled.push([pid, s]) });
    assert.deepEqual(signalled, [[-4242, "SIGTERM"]], "the whole call list, so an extra call fails");
});

test("killProcessTree falls back to the child when the group is already gone", () => {
    const signalled = [];
    m.killProcessTree({ pid: 4242, kill: (s) => signalled.push(["child", s]) }, "SIGTERM",
        { platform: "linux", killProcess: () => { throw new Error("ESRCH"); } });
    assert.deepEqual(signalled, [["child", "SIGTERM"]]);
});

test("killProcessTree's 5-second follow-up sends SIGKILL to whichever target the immediate kill actually reached", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const fallback = [];
    m.killProcessTree({ pid: 4242, kill: (s) => fallback.push(["child", s]) }, "SIGTERM",
        { platform: "linux", killProcess: () => { throw new Error("ESRCH"); } });
    t.mock.timers.tick(5000);
    assert.deepEqual(fallback, [["child", "SIGTERM"], ["child", "SIGKILL"]],
        "the group kill already threw, so the follow-up must reach the child directly, never killProcess(-4242, ...)");

    const group = [];
    m.killProcessTree({ pid: 4242, kill: (s) => group.push(["child", s]) }, "SIGTERM",
        { platform: "linux", killProcess: (pid, s) => group.push([pid, s]) });
    t.mock.timers.tick(5000);
    assert.deepEqual(group, [[-4242, "SIGTERM"], [-4242, "SIGKILL"]],
        "the group kill succeeded, so the follow-up escalates the same group");
});

test("cmdLaunch calls the extracted helper rather than keeping its own copy", () => {
    // The tests above exercise the helper in isolation, so reverting the call site would leave
    // every one of them green. This is the only test that observes the actual deliverable.
    // Comments stripped first, and the paren required: `/killProcessTree/` against the raw source is
    // satisfied by a comment naming the helper, so the assertion would survive the call site being
    // put back — the one thing this test exists to notice.
    const source = m.cmdLaunch.toString();
    const body = stripComments(source);
    assert.match(body, /killProcessTree\(/);
    assert.doesNotMatch(body, /function killProcessTree/, "a shadowing local definition is not delegation");
    // Absence is checked on the RAW source on purpose: over-stripping can only turn a match into a
    // loud miss, but it turns a doesNotMatch into a silent pass — a re-inlined kill hidden behind
    // text the stripper mistook for a comment.
    assert.doesNotMatch(source, /taskkill/);
});

test("childNodeProbes: one entry per launchable, however many oauth references it carries", () => {
    // oauthReferences yields an entry per ENV VAR, so a launchable naming two oauth entries is seen
    // twice. Undeduped that renders two byte-identical FAIL lines, and a reader counting findings
    // looks for a second problem there is no second one of. cmdLaunch refuses such a declaration,
    // but only at launch -- doctor is where it is seen at all.
    const cfg = { servers: { s: { command: "/usr/bin/node", env: {} } }, tasks: {} };
    const refs = [{ kind: "servers", launchableName: "s", envVar: "A", name: "ado" },
        { kind: "servers", launchableName: "s", envVar: "B", name: "gh" }];
    let spawns = 0;
    const out = m.childNodeProbes(cfg, refs, { refused: new Map(), probe: () => { spawns += 1; return "v18.17.1"; } });

    assert.equal(out.length, 1, "one launchable is one finding");
    assert.equal(spawns, 1, "and one probe");
    assert.deepEqual(out[0], { launchableName: "s", command: "/usr/bin/node", declared: true,
        version: "v18.17.1" });
});

test("childNodeProbes: each launchable is judged by its own command, on either platform", () => {
    // The defect at its second site: a single PATH probe standing for every launchable judges a
    // declaration naming its own node by a binary it never runs. `declared` is what lets the message
    // say which of the two it holds, and a wrapper falls back to PATH because which node it resolves
    // is not knowable from the declaration.
    //
    // `platform` is pinned rather than inherited, so the win32 branch of isNodeCommand is reached on
    // every runner. Inherited, the Windows row asserts exactly what the wrapper row already asserts
    // on a POSIX box, and the branch goes unexercised wherever the suite actually runs.
    const WIN_NODE = "C:\\Program Files\\nodejs\\node.exe";
    const cfg = { servers: {
        own: { command: "/usr/local/bin/node", env: {} },
        wrapped: { command: "npx", env: {} },
        windows: { command: WIN_NODE, env: {} },
    }, tasks: { own: { command: "/usr/local/bin/node", env: {} } } };
    // A task and a server may carry the same name -- validateLaunchables runs per map and enforces no
    // uniqueness across them -- so `kind` is load-bearing in the dedup key. Keyed on the name alone,
    // the task below is silently dropped from the report.
    const refs = [
        { kind: "servers", launchableName: "own" }, { kind: "servers", launchableName: "wrapped" },
        { kind: "servers", launchableName: "windows" }, { kind: "tasks", launchableName: "own" },
    ];

    for (const [platform, windowsIsNode] of [["linux", false], ["win32", true]]) {
        const probedCommands = [];
        const out = m.childNodeProbes(cfg, refs, { platform, refused: new Map(),
            probe: ({ command }) => { probedCommands.push(command); return "v18.17.1"; } });

        assert.deepEqual(out.map((x) => [x.launchableName, x.command, x.declared]), [
            ["own", "/usr/local/bin/node", true],
            ["wrapped", "npx", false],
            ["windows", WIN_NODE, windowsIsNode],
            ["own", "/usr/local/bin/node", true],
        ], platform);
        // The server and the task share a name and differ only in kind, so four references survive as
        // four entries: dropping `kind` from the key would lose the last one.
        assert.equal(out.length, 4, `${platform}: a task is not the server of the same name`);
        assert.equal(new Set(probedCommands).size, probedCommands.length, `${platform}: no command probed twice`);
        assert.ok(probedCommands.includes("/usr/local/bin/node") && probedCommands.includes("node"),
            `${platform}: ${probedCommands.join(", ")}`);
        assert.equal(probedCommands.includes(WIN_NODE), windowsIsNode,
            `${platform}: a Windows node is probed as itself only where it is one`);
    }
});

test("childNodeProbes: the probe is given the PATH the launch would see -- this process's, overridden by a declared literal", () => {
    // A declaration may set PATH, and the launch resolves its command against the child's environment. A
    // probe that resolved against this process's would judge a node the launch never runs. `secret:` and
    // `oauth:` values cannot be resolved here, and doctor must not spend a credential to ask a version.
    const cfg = { servers: {
        plain: { command: "node", env: {} },
        own: { command: "node", env: { PATH: "literal:/declared/bin", TOKEN: "oauth:ado", OTHER: "secret:pat" } },
        twin: { command: "node", env: { PATH: "literal:/declared/bin" } },
        elsewhere: { command: "node", env: { PATH: "literal:/other/bin" } },
    }, tasks: {} };
    const refs = ["plain", "own", "twin", "elsewhere"].map((launchableName) => ({ kind: "servers", launchableName }));
    const seen = [];
    m.childNodeProbes(cfg, refs, { platform: "linux", refused: new Map(), env: { PATH: "/inherited/bin", KEEP: "1" },
        probe: (options) => { seen.push(options); return "v22.0.0"; } });

    assert.deepEqual(seen.map((x) => x.env.PATH), ["/inherited/bin", "/declared/bin", "/other/bin"],
        "one probe per command and PATH: `twin` shares `own`'s, `elsewhere` does not");
    assert.equal(seen[1].env.KEEP, "1", "the rest of the environment is this process's");
    assert.ok(seen.every((x) => x.command === "node"));
    assert.ok(seen.every((x) => !("TOKEN" in x.env) && !("OTHER" in x.env)), "a reference is not resolved here");
});

test("childNodeProbes: the probe env is scrubbed as the launch's child env is -- a legacy secret var in the base is absent, in any letter case", () => {
    const cfg = { servers: { s: { command: "node", env: {} } }, tasks: {} };
    const seen = [];
    m.childNodeProbes(cfg, [{ kind: "servers", launchableName: "s" }], { platform: "linux", refused: new Map(),
        env: { PATH: "/bin", ADO_MCP_AUTH_TOKEN: "stale", Azure_Client_Secret: "stale", GITHUB_PERSONAL_ACCESS_TOKEN: "stale",
            AZURE_TENANT_ID: "an-identifier", NODE_OPTIONS: "--require=/x.js" },
        probe: (options) => { seen.push(options.env); return "v22.0.0"; } });
    assert.deepEqual(seen, [{ PATH: "/bin", AZURE_TENANT_ID: "an-identifier" }],
        "credentials and code-injection variables go; an identifier the launch also keeps stays");
});

test("childNodeProbes: on win32 the memo key includes PATHEXT, so two launchables that differ only in it are probed apart", () => {
    const cfg = { servers: {
        a: { command: "node", env: { PATHEXT: "literal:.EXE" } },
        b: { command: "node", env: { PATHEXT: "literal:.CMD" } },
        c: { command: "node", env: { PATHEXT: "literal:.EXE" } },
    }, tasks: {} };
    const refs = ["a", "b", "c"].map((launchableName) => ({ kind: "servers", launchableName }));
    let probes = 0;
    m.childNodeProbes(cfg, refs, { platform: "win32", refused: new Map(), env: { Path: "C:\\bin" },
        probe: () => { probes += 1; return "v22.0.0"; } });
    assert.equal(probes, 2, "a and c share a key; b does not");
    probes = 0;
    m.childNodeProbes(cfg, refs, { platform: "linux", refused: new Map(), env: { PATH: "/bin" },
        probe: () => { probes += 1; return "v22.0.0"; } });
    assert.equal(probes, 1, "off win32 PATHEXT means nothing to the lookup");
});

test("childNodeProbes: on win32 a declared PATH replaces the inherited one whatever its case, in the environment the probe gets", () => {
    const cfg = { servers: { s: { command: "node", env: { path: "literal:C:\\declared\\bin" } } }, tasks: {} };
    let seen;
    m.childNodeProbes(cfg, [{ kind: "servers", launchableName: "s" }], { platform: "win32", refused: new Map(),
        env: { Path: "C:\\inherited\\bin" }, probe: (options) => { seen = options; return "v22.0.0"; } });
    assert.deepEqual(seen.env, { path: "C:\\declared\\bin" }, "one spelling, and it is the declaration's");
});

// Every in-process launch below that is not ABOUT the Windows bind goes through this. With no bindPlatform
// cmdLaunch binds the launching process to a kill-on-close job on win32 -- and in these tests the launching
// process is the test runner, so an unset default would put the runner itself in a job. A test about the
// bind passes bindPlatform: "win32" and stubs credReadMany (launchWithBind, below).
function launch(kind, name, cfg, deps = {}) {
    return m.cmdLaunch(kind, name, cfg, { bindPlatform: "linux", ...deps });
}

test("cmdLaunch: a server with no oauth reference gets no NODE_OPTIONS and no channel", async () => {
    let seen = null;
    const cfg = m.loadConfig(projectPaths({ secrets: {},
        servers: { github: { command: process.execPath, args: ["-e", ""], env: { LIT: "literal:x" } } } }));
    const handle = await launch("servers", "github", cfg,
        { trustState: trustedStateFor(cfg), spawnFn: (cmd, args, opts) => { seen = opts.env; return fakeChild(); } });
    try {
        assert.equal(seen.LIT, "x");
        assert.equal(seen.NODE_OPTIONS, undefined);
        assert.equal(seen.VC_SECRETS_TOKEN_CHANNEL, undefined);
        assert.equal(handle.channel, null, "no channel is created for a server that cannot renew");
    } finally {
        await handle.dispose();
    }
});

test("cmdLaunch: a child node below the flag floor is refused before anything is spawned or bound", async (t) => {
    // "or bound" is the half a name can claim for free: the gate has to run BEFORE createChannel,
    // or a refused launch mkdtemps a directory the "exit" handler removes only when the process
    // leaves -- which a suite driving cmdLaunch in-process never does, so they accumulate.
    // The watch is a spy on the directories THIS launch creates, not a listing of /tmp: /tmp is
    // shared with every other process, and one making or removing a vc-secrets-ch- directory
    // between two listings would redden this test. The launcher reads fs.mkdtempSync off the
    // default fs object at call time, so the spy sees every channel it makes.
    const made = [];
    const real = fs.mkdtempSync;
    t.mock.method(fs, "mkdtempSync", (prefix, ...rest) => {
        const dir = real(prefix, ...rest);
        if (String(prefix).includes("vc-secrets-ch-")) {
            made.push(dir);
        }

        return dir;
    });
    const cfg = m.loadConfig(authorizedOauthPaths());
    let spawned = 0;
    await assert.rejects(() => launch("servers", "s", cfg, {
        trustState: trustedStateFor(cfg),
        childNodeVersion: () => "v18.17.1",
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: () => { spawned++; return fakeChild(); },
    }), /18\.18\.0/);
    assert.equal(spawned, 0);
    assert.deepEqual(made, [], "the version gate must precede createChannel");
});

test("cmdLaunch: the version gate probes the declared node, and says so when it could not", async () => {
    // Two halves of one defect. The probe ran `node --version` off PATH whatever the declaration
    // said, so a server commanding its own node was judged by an unrelated binary; and the refusal
    // read "the node that runs <name>", asserting it had resolved theirs. A reader acting on that
    // message would go and upgrade a node the launch never touches.
    const declared = "/usr/local/bin/node";
    const decl = { command: declared, args: ["server.js"], env: { ADO_TOKEN: "oauth:ado" } };
    const paths = scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: {
            servers: { s: { command: declared, args: ["server.js"], envKeys: ["ADO_TOKEN"] } } } } } },
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL }, servers: { s: decl } },
    });

    let probed = null;
    const cfg = m.loadConfig(paths);
    await assert.rejects(() => launch("servers", "s", cfg, {
        trustState: trustedStateFor(cfg),
        childNodeVersion: (opts) => { probed = opts?.command ?? null; return "v18.17.1"; },
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: () => { throw new Error("must not spawn"); },
    }), (e) => {
        assert.match(e.message, new RegExp(declared.replace(/[/.]/g, "\\$&")),
            `the refusal must name the binary it measured: ${e.message}`);
        // Naming the path is not enough on its own: the wrapper branch interpolates server.command
        // too, so a regressed discriminator would still satisfy the match above. This is the half
        // that tells the two branches apart.
        assert.doesNotMatch(e.message, /node on PATH/, e.message);

        return true;
    });
    assert.equal(probed, declared, "the declared node is what gets probed, not PATH");
});

test("cmdLaunch: the version probe searches the PATH the spawn searches, and is not handed a resolved secret",
    { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" },
    async () => {
        // Otherwise a declaration that sets PATH is gated on the node this process's PATH finds, while the
        // spawn runs another -- and a probe given the child's whole environment holds every credential the
        // launch resolved, in a process that only has to print a version.
        const sentinel = "SECRET-SENTINEL-VALUE";
        const cfg = m.loadConfig(scopedPaths({ user: { oauth: { ado: OAUTH_DECL }, secrets: { pat: { backend: "local" } },
            servers: { s: { command: "node", args: ["server.js"],
                env: { ADO_TOKEN: "oauth:ado", PAT: "secret:pat", PATH: "literal:/declared/bin" } } } } }));
        let probeEnv;
        let spawnEnv;
        await withProcessEnv({ VC_SECRETS_LOCAL_BACKEND: "keychain", GITHUB_PERSONAL_ACCESS_TOKEN: "ambient-stale-token" }, () => withStubOnPath("security", `#!/bin/sh\necho ${sentinel}\n`, async () => {
            const handle = await launch("servers", "s", cfg, {
                childNodeVersion: (options) => { probeEnv = options.env; return "v22.0.0"; },
                readCache: async () => ({ state: "valid", accessToken: "cached" }),
                createChannel: () => ({ path: "/tmp/not-a-real.sock", push: () => 1, peers: () => 1,
                    close: async () => {}, removeSync: () => {} }),
                resolveCommand: (command, options) => { spawnEnv = options.env; return { kind: "direct", cmd: command }; },
                spawnFn: () => fakeChild(),
            });
            await handle.dispose();
        }));
        assert.equal(spawnEnv.PAT, sentinel, "the control: the launch did resolve the secret into the child's environment");
        assert.equal(probeEnv.PATH, "/declared/bin", "the declaration's PATH, not this process's");
        assert.equal(probeEnv.PATH, spawnEnv.PATH, "the very PATH the spawn searches");
        assert.ok(!Object.values(probeEnv).includes(sentinel), "no resolved secret reaches the probe");
        assert.ok(!Object.hasOwn(probeEnv, "ADO_TOKEN") && !Object.hasOwn(probeEnv, "PAT"), "nor the names that carry one");
        assert.ok(!Object.hasOwn(spawnEnv, "GITHUB_PERSONAL_ACCESS_TOKEN") && !Object.hasOwn(probeEnv, "GITHUB_PERSONAL_ACCESS_TOKEN"),
            "an ambient legacy credential is scrubbed from the probe exactly as from the child");
    });

test("cmdLaunch: a wrapper command is probed via PATH, and the refusal does not claim otherwise", async () => {
    // The fixture commands `npx`, which resolves a node the declaration cannot name. PATH is then a
    // proxy rather than an answer, so the message must not repeat the claim removed above — it says
    // which node it holds and that the launch goes through the wrapper.
    let probed = "unset";
    const cfg = m.loadConfig(authorizedOauthPaths());
    await assert.rejects(() => launch("servers", "s", cfg, {
        trustState: trustedStateFor(cfg),
        childNodeVersion: (opts) => { probed = opts?.command ?? null; return "v18.17.1"; },
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: () => { throw new Error("must not spawn"); },
    }), (e) => {
        assert.match(e.message, /node on PATH/, e.message);
        assert.match(e.message, /npx/, "and it names the wrapper the launch actually goes through");
        assert.doesNotMatch(e.message, /the node that runs "s"/, "the withdrawn claim must not return");

        return true;
    });
    assert.equal(probed, "node", "a wrapper falls back to the PATH node");
});

test("cmdLaunch: no usable token fails naming login, and never spawns", async () => {
    const cfg = m.loadConfig(authorizedOauthPaths());
    let spawned = 0;
    await assert.rejects(() => launch("servers", "s", cfg, {
        trustState: trustedStateFor(cfg),
        readCache: async () => ({ state: "absent" }),
        spawnFn: () => { spawned++; return fakeChild(); },
    }), /vc-secrets login ado/);
    assert.equal(spawned, 0);
});

test("cmdLaunch: dispose detaches the handlers that would exit the process", async () => {
    // The handle exists for callers that end a launch without ending the process. child.on("close")
    // calls process.exit, so leaving it attached means the whole CLI exits when a child the caller
    // no longer owns happens to close.
    const cfg = m.loadConfig(projectPaths({ secrets: {},
        servers: { github: { command: process.execPath, args: ["-e", ""], env: {} } } }));
    // A pid above any the kernel hands out (Linux caps at 2^22): the group-kill handler below is only
    // registered for a child that has one, and were this test to fail before dispose it would signal
    // -pid at exit, where that can only be ESRCH.
    const child = Object.assign(fakeChild(), { pid: 2 ** 22 + 1 });
    // Counted as a DELTA: the runner holds signal listeners of its own, so an absolute count would
    // pin the harness rather than the launch. The signals are registered unconditionally. The "exit"
    // listener here is the POSIX group kill; the oauth path's own "exit" handler is pinned by "cmdLaunch:
    // dispose detaches the exit handler that removes the channel directory" below, where a launch reaches it.
    const signals = ["SIGINT", "SIGTERM", "SIGHUP", ...(process.platform === "win32" ? [] : ["SIGQUIT"])];
    const before = signals.map((s) => process.listenerCount(s));
    const exitBefore = process.listenerCount("exit");
    const handle = await launch("servers", "github", cfg, { trustState: trustedStateFor(cfg), spawnFn: () => child });
    assert.equal(child.listenerCount("close"), 1);
    assert.deepEqual(signals.map((s) => process.listenerCount(s)), before.map((n) => n + 1));
    assert.equal(process.listenerCount("exit"), exitBefore + (process.platform === "win32" ? 0 : 1),
        "a POSIX launch kills the child's group on the way out; win32 has taskkill for that");
    await handle.dispose();
    assert.equal(child.listenerCount("close"), 0);
    assert.equal(child.listenerCount("error"), 0);
    // A surviving onSignal closure still holds the disposed child, so the next Ctrl-C signals
    // -child.pid for a process this handle no longer owns -- and a surviving exit handler would
    // SIGKILL that group when the process ends.
    assert.deepEqual(signals.map((s) => process.listenerCount(s)), before);
    assert.equal(process.listenerCount("exit"), exitBefore);
});

// The win32 launch path, driven on any OS: `bindPlatform` says what the bind decision sees, and the
// batched call is stubbed. The per-name reader is pointed at a PowerShell that does not exist, so a
// launch that fell back to reading names one by one would fail rather than pass quietly.
async function launchWithBind(kind, cfg, deps) {
    return withProcessEnv({ VC_SECRETS_LOCAL_BACKEND: "wcm", VC_SECRETS_POWERSHELL: "vc-no-such-powershell" },
        () => m.cmdLaunch(kind, "s", cfg, { bindPlatform: "win32", ...deps }));
}

function bindLaunchCfg(kind) {
    return m.loadConfig(scopedPaths({ user: {
        secrets: { one: { backend: "local" }, two: { backend: "local" } },
        servers: {}, tasks: {},
        [kind]: { s: { command: process.execPath, args: ["-e", ""],
            env: { A: "secret:one", B: "secret:two", C: "secret:one", LIT: "literal:x" } } } } }));
}

for (const kind of ["servers", "tasks"]) {
    test(`cmdLaunch on win32 (${kind}): one call reads every wcm secret and binds the tree, before the spawn`, async () => {
        const cfg = bindLaunchCfg(kind);
        const key = (name) => m.keyFor(name, cfg.secrets[name], cfg);
        const order = [];
        const calls = [];
        let childEnv = null;
        const handle = await launchWithBind(kind, cfg, {
            credReadMany: async ({ keys, pid }) => {
                calls.push({ keys, pid });
                order.push("bind");

                return { creds: { [key("one")]: { ok: credHex("value-one") }, [key("two")]: { ok: credHex("value-two") } },
                    job: "ok" };
            },
            spawnFn: (cmd, args, opts) => { order.push("spawn"); childEnv = opts.env; return fakeChild(); },
        });
        try {
            assert.deepEqual(calls, [{ keys: [key("one"), key("two")], pid: process.pid }],
                "one PowerShell call per launch, each name once, binding this process");
            assert.deepEqual(order, ["bind", "spawn"], "only a process created after the assignment is in the job");
            assert.equal(childEnv.A, "value-one");
            assert.equal(childEnv.B, "value-two");
            assert.equal(childEnv.C, "value-one");
            assert.equal(childEnv.LIT, "x");
        } finally {
            await handle.dispose();
        }
    });
}

test("cmdLaunch on win32: a failed bind says so in one line, and the launch goes ahead", async (t) => {
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    const cfg = m.loadConfig(scopedPaths({ user: { secrets: {},
        servers: { s: { command: process.execPath, args: ["-e", ""], env: { LIT: "literal:x" } } } } }));
    let spawned = 0;
    const handle = await launchWithBind("servers", cfg, {
        credReadMany: async () => ({ creds: {}, job: 5 }),
        spawnFn: () => { spawned++; return fakeChild(); },
    });
    await handle.dispose();
    assert.equal(spawned, 1, "fail-open: the launch is not refused over the bind");
    assert.deepEqual(stderr, ["vc-secrets: could not bind the launch's process tree to this launcher (win32 error 5)"
        + " -- a client stop may leave it running\n"]);

    // A call that failed as a whole bound nothing either, and says why on the same one line; the names it
    // would have read go through the single read, which meets its own failure -- here, no PowerShell at all.
    stderr.length = 0;
    const withSecret = m.loadConfig(scopedPaths({ user: { secrets: { one: { backend: "local" } },
        servers: { s: { command: process.execPath, args: ["-e", ""], env: { A: "secret:one" } } } } }));
    await assert.rejects(() => launchWithBind("servers", withSecret, {
        credReadMany: async () => { throw new m.VcSecretsError("powershell.exe exited 1: first line\r\nsecond line"); },
        spawnFn: () => { throw new Error("must not spawn"); },
    }), /vc-no-such-powershell: not found on PATH/);
    assert.deepEqual(stderr, ["vc-secrets: could not bind the launch's process tree to this launcher"
        + " (powershell.exe exited 1: first line second line) -- a client stop may leave it running\n"]);
});

test("cmdLaunch on win32: a bad VC_SECRETS_LOCAL_BACKEND refuses only a launch that has a local secret, at that entry, in the single read's words", async () => {
    const bogus = { VC_SECRETS_LOCAL_BACKEND: "bogus", VC_SECRETS_POWERSHELL: "vc-no-such-powershell" };
    const launchBogus = (cfg, deps) => withProcessEnv(bogus,
        () => m.cmdLaunch("servers", "s", cfg, { bindPlatform: "win32", ...deps }));

    // Literals and Key Vault entries never ask which local backend there is -- before the batched read
    // existed such a launch ran -- but the tree is still bound, with nothing to read.
    const literalOnly = m.loadConfig(scopedPaths({ user: { secrets: { vaulted: { backend: "keyvault", vault: "my-vault", secret: "my-secret" } },
        servers: { s: { command: process.execPath, args: ["-e", ""], env: { LIT: "literal:x" } } } } }));
    const calls = [];
    const stubs = { credReadMany: async ({ keys, pid }) => { calls.push({ keys, pid }); return { creds: {}, job: "ok" }; } };
    const handle = await launchBogus(literalOnly, { ...stubs, spawnFn: () => fakeChild() });
    await handle.dispose();
    assert.deepEqual(calls, [{ keys: [], pid: process.pid }], "the bind runs with an empty key list");

    // The same for a Key Vault reference, asked of the batch directly: it is az's to read, not the local store's.
    calls.length = 0;
    const { seeded } = await m.makeSecretResolver(literalOnly, bogus).readWcmBatch(
        [{ name: "vaulted", decl: literalOnly.secrets.vaulted }], { pid: 7, run: stubs.credReadMany });
    assert.deepEqual(calls, [{ keys: [], pid: 7 }]);
    assert.equal(seeded.size, 0);

    // A local secret does need it: the launch fails at that entry with what the single read says there, and
    // the batch has seeded nothing for the resolver to contradict.
    const local = m.loadConfig(scopedPaths({ user: { secrets: { one: { backend: "local" } },
        servers: { s: { command: process.execPath, args: ["-e", ""], env: { A: "secret:one" } } } } }));
    let single = null;
    await assert.rejects(() => m.makeSecretResolver(local, bogus)("one", local.secrets.one),
        (e) => { single = e.message; return e instanceof m.VcSecretsError; });
    assert.match(single, /VC_SECRETS_LOCAL_BACKEND="bogus"/, "the control: the single read refuses it");
    calls.length = 0;
    await assert.rejects(() => launchBogus(local, { ...stubs, spawnFn: () => { throw new Error("must not spawn"); } }),
        (e) => e instanceof m.VcSecretsError && e.message === single);
    assert.deepEqual(calls, [{ keys: [], pid: process.pid }], "the bind still ran, with nothing to read");
});

test("cmdLaunch off win32 never makes the bind call", async () => {
    const cfg = m.loadConfig(scopedPaths({ user: { secrets: {},
        servers: { s: { command: process.execPath, args: ["-e", ""], env: { LIT: "literal:x" } } } } }));
    const handle = await m.cmdLaunch("servers", "s", cfg, { bindPlatform: "linux",
        credReadMany: async () => { throw new Error("must not bind off win32"); }, spawnFn: () => fakeChild() });
    await handle.dispose();
});

const D1_ENV = { VC_SECRETS_LOCAL_BACKEND: "wcm", VC_SECRETS_POWERSHELL: "vc-no-such-powershell" };

// Everything the launch is given besides the configuration, and what it did with it.
async function launchD1(cfg, { credReadMany, run, deps = {}, env = D1_ENV } = {}) {
    const seen = { childEnv: null, pushed: [], exchanged: [], locks: 0, bound: [] };
    const handle = await withProcessEnv(env, () => m.cmdLaunch("servers", "s", cfg, {
        bindPlatform: "win32",
        credReadMany: async (request) => { seen.bound.push(request); return credReadMany(request); },
        run: run ?? (async () => { throw new Error("a live read this test did not expect"); }),
        exchange: async (refreshToken) => {
            seen.exchanged.push(refreshToken);

            return { accessToken: "a-fresh", refreshToken: "r-fresh", expiresAt: Date.now() + 3_600_000,
                obtainedAt: Date.now(), lifetimeMs: 3_600_000, uptimeAtIssue: os.uptime() };
        },
        writeCache: async () => {},
        acquireLock: async () => { seen.locks += 1; return { release: async () => {} }; },
        childNodeVersion: () => "v22.0.0",
        createChannel: () => ({ path: "/tmp/not-a-real.sock", push: (token) => { seen.pushed.push(token); return 1; },
            peers: () => 1, close: async () => {}, removeSync: () => {} }),
        resolveCommand: (command) => ({ kind: "direct", cmd: command }),
        spawnFn: (cmd, args, opts) => { seen.childEnv = opts.env; return fakeChild(); },
        ...deps,
    }));

    return { handle, seen };
}

// What reaches fd 2 through fs.writeSync. Any other fd goes on to the real call: a real tool run in the same
// test pipes its input through it.
function captureStderr(t, onWrite = () => {}) {
    const lines = [];
    const real = fs.writeSync;
    t.mock.method(fs, "writeSync", (fd, str, ...rest) => {
        if (fd !== 2) {
            return real(fd, str, ...rest);
        }
        lines.push(str);
        onWrite(str);

        return Buffer.byteLength(str);
    });

    return lines;
}

const NO_SPAWN = { spawnFn: () => { throw new Error("must not spawn"); } };

// ---------------------------------------------------------------------------------------------
// The oauth entry's two keystore keys ride in the launch's one PowerShell call on win32. What that is
// allowed to change is only where the FIRST readCache of a launch gets its bytes: the exchange spends the
// refresh token read under the lock, so these tests drive the real oauthLaunchDeps through cmdLaunch, with
// the batched call stubbed (credReadMany) and the live keystore reads stubbed apart from it (run).
// ---------------------------------------------------------------------------------------------

test("cmdLaunch on win32: one call carries the secret keys and the oauth entry's two, with no per-name read, and the child gets the batched token", async () => {
    const fx = d1Config();
    const reads = [];
    const { handle, seen } = await launchD1(fx.cfg, {
        run: d1LiveRun({}, reads),
        credReadMany: async () => ({ job: "ok", creds: {
            [fx.secretKey("pat")]: { ok: credHex("the-pat") },
            [fx.keys.refresh]: { ok: credHex(fx.refreshBlob("r1")) },
            [fx.keys.access]: { ok: credHex(fx.accessBlob("a-batch")) } } }),
    });
    try {
        assert.equal(seen.bound.length, 1, "one PowerShell call for the whole launch");
        assert.deepEqual(seen.bound[0].keys, [fx.secretKey("pat"), fx.keys.refresh, fx.keys.access]);
        assert.deepEqual(reads, [], "no per-name read afterwards");
        assert.equal(seen.childEnv.ADO_TOKEN, "a-batch");
        assert.equal(seen.childEnv.PAT, "the-pat");
        assert.deepEqual(seen.exchanged, [], "a valid batched access token is not exchanged");
    } finally {
        await handle.dispose();
    }
});

test("cmdLaunch on win32: a renewal tick reads the keystore, not the batch the launch started from", async () => {
    const fx = d1Config({ secretName: null });
    const reads = [];
    const { handle, seen } = await launchD1(fx.cfg, {
        run: d1LiveRun({ [fx.keys.refresh]: fx.refreshBlob("r-live"), [fx.keys.access]: fx.accessBlob("a-live") }, reads),
        credReadMany: async () => ({ job: "ok", creds: {
            [fx.keys.refresh]: { ok: credHex(fx.refreshBlob("r-batch")) },
            [fx.keys.access]: { ok: credHex(fx.accessBlob("a-batch")) } } }),
        deps: { renewalTickMs: 20 },
    });
    try {
        assert.equal(seen.childEnv.ADO_TOKEN, "a-batch");
        assert.ok(await waitFor(() => seen.pushed.length > 0, { timeoutMs: 5000 }), "a tick ran");
        assert.equal(seen.pushed[0], "a-live", "the tick's token came from the keystore");
        assert.ok(reads.includes(fx.keys.refresh) && reads.includes(fx.keys.access));
    } finally {
        await handle.dispose();
    }
});

test("cmdLaunch on win32: the refresh token exchanged is the one read under the lock, not the one batched before it", async () => {
    // Entra rotates the refresh token on use: a neighbour that finished between the batch and the lock has
    // left the batched one dead, and spending it signs the developer out. The batch holds r1 and no access
    // entry, so the launch must exchange; the store, read again under the lock, holds r2.
    const fx = d1Config({ secretName: null });
    const reads = [];
    const { handle, seen } = await launchD1(fx.cfg, {
        run: d1LiveRun({ [fx.keys.refresh]: fx.refreshBlob("r2") }, reads),
        credReadMany: async () => ({ job: "ok", creds: {
            [fx.keys.refresh]: { ok: credHex(fx.refreshBlob("r1")) },
            [fx.keys.access]: { err: 1168 } } }),
    });
    try {
        assert.deepEqual(seen.exchanged, ["r2"]);
        assert.equal(seen.locks, 1);
        assert.deepEqual(reads, [fx.keys.refresh, fx.keys.access], "the re-read under the lock went to the keystore");
        assert.equal(seen.childEnv.ADO_TOKEN, "a-fresh");
    } finally {
        await handle.dispose();
    }
});

test("cmdLaunch on win32: refresh absent in the batch is absent whatever the access outcome, with no notice and no other error", async (t) => {
    const stderr = captureStderr(t);
    const fx = d1Config({ secretName: null });
    await assert.rejects(() => launchD1(fx.cfg, {
        credReadMany: async () => ({ job: "ok", creds: { [fx.keys.refresh]: { err: 1168 }, [fx.keys.access]: { err: 5 } } }),
        deps: NO_SPAWN,
    }), (e) => e instanceof m.VcSecretsError && e.message === 'no usable token for "ado" -- run "vc-secrets login ado"');
    assert.deepEqual(stderr, []);
});

test("cmdLaunch on win32: a refresh read that failed in the batch says what the single read says", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async (t) => {
    const stderr = captureStderr(t);
    const fx = d1Config({ secretName: null });
    const env = { VC_SECRETS_LOCAL_BACKEND: "wcm", VC_SECRETS_POWERSHELL: "vc-ps-d1-stub" };
    const stub = "#!/bin/sh\nprintf 'CredRead failed win32err=5' >&2\nexit 1\n";
    let single = null;
    await withStubOnPath("vc-ps-d1-stub", stub, () => withProcessEnv(env, async () => {
        await assert.rejects(() => m.oauthLaunchDeps("ado", fx.cfg.oauth.ado, fx.cfg).readCache(),
            (e) => { single = e.message; return true; });
    }));
    assert.match(single, /win32err=5/, "the control: the single read fails and says why");

    await assert.rejects(() => launchD1(fx.cfg, { env,
        credReadMany: async () => ({ job: "ok", creds: { [fx.keys.refresh]: { err: 5 } } }),
        deps: NO_SPAWN,
    }), (e) => e instanceof m.VcSecretsError && e.message === single);
    assert.deepEqual(stderr, []);
});

test("cmdLaunch on win32: a corrupt refresh blob is named once, after the batch, and the access entry is not looked at", async (t) => {
    const order = [];
    const stderr = captureStderr(t, () => order.push("notice"));
    const fx = d1Config();
    await assert.rejects(() => launchD1(fx.cfg, {
        credReadMany: async () => {
            order.push("batch");

            return { job: "ok", creds: {
                [fx.secretKey("pat")]: { ok: credHex("the-pat") },
                [fx.keys.refresh]: { ok: credHex("{not json") },
                [fx.keys.access]: { ok: credHex("{also not json") } } };
        },
        deps: NO_SPAWN,
    }), /vc-secrets login ado/);
    assert.deepEqual(order, ["batch", "notice"], "the notice is the consumer's, not the batch's");
    assert.equal(stderr.length, 1);
    assert.match(stderr[0], /"oauth-ado-refresh" is not readable JSON/);
    assert.ok(!stderr.join("").includes("oauth-ado-access"));
});

test("cmdLaunch on win32: a whole-call failure sends the oauth entry through per-name reads, a bind-only failure keeps the batch", async (t) => {
    const stderr = captureStderr(t);
    const fx = d1Config({ secretName: null });
    const live = { [fx.keys.refresh]: fx.refreshBlob("r-live"), [fx.keys.access]: fx.accessBlob("a-live") };

    const reads = [];
    const whole = await launchD1(fx.cfg, { run: d1LiveRun(live, reads),
        credReadMany: async () => { throw new m.VcSecretsError("powershell.exe exited 1: nope"); } });
    try {
        assert.deepEqual(reads, [fx.keys.refresh, fx.keys.access], "the batch seeded nothing, so each key was read");
        assert.equal(whole.seen.childEnv.ADO_TOKEN, "a-live");
        assert.equal(stderr.length, 1);
        assert.match(stderr[0], /could not bind the launch's process tree .*\(powershell\.exe exited 1: nope\)/);
    } finally {
        await whole.handle.dispose();
    }

    stderr.length = 0;
    reads.length = 0;
    const bindOnly = await launchD1(fx.cfg, { run: d1LiveRun(live, reads),
        credReadMany: async () => ({ job: 5, creds: {
            [fx.keys.refresh]: { ok: credHex(fx.refreshBlob("r-batch")) },
            [fx.keys.access]: { ok: credHex(fx.accessBlob("a-batch")) } } }) });
    try {
        assert.deepEqual(reads, [], "a refused job object does not make the read results unusable");
        assert.equal(bindOnly.seen.childEnv.ADO_TOKEN, "a-batch");
        assert.match(stderr.join(""), /win32 error 5/);
    } finally {
        await bindOnly.handle.dispose();
    }
});

test("cmdLaunch on win32: a failing secret is reported alone -- no oauth notice, no oauth error", async (t) => {
    const stderr = captureStderr(t);
    const fx = d1Config();
    await assert.rejects(() => launchD1(fx.cfg, {
        credReadMany: async () => ({ job: "ok", creds: {
            [fx.secretKey("pat")]: { err: 5 },
            [fx.keys.refresh]: { ok: credHex("{not json") },
            [fx.keys.access]: { err: 5 } } }),
        deps: NO_SPAWN,
    }), (e) => {
        const expected = m.mapResolveError("wcm", "pat", Object.assign(
            new m.VcSecretsError("vc-no-such-powershell exited 1: CredRead failed win32err=5"), { toolExitCode: 1 }));
        assert.equal(e.message, expected.message);

        return true;
    });
    assert.deepEqual(stderr, []);
});

test("cmdLaunch on win32: an invalid VC_SECRETS_LOCAL_BACKEND asks the batch for no oauth keys, and fails where it does without one", async () => {
    const fx = d1Config({ secretName: null });
    const bogus = { VC_SECRETS_LOCAL_BACKEND: "bogus", VC_SECRETS_POWERSHELL: "vc-no-such-powershell" };
    let today = null;
    await withProcessEnv(bogus, async () => {
        assert.throws(() => m.oauthLaunchDeps("ado", fx.cfg.oauth.ado, fx.cfg),
            (e) => { today = e.message; return e instanceof m.VcSecretsError; });
    });
    assert.match(today, /VC_SECRETS_LOCAL_BACKEND="bogus"/, "the control: this is where the bad value is refused");

    const calls = [];
    await assert.rejects(() => launchD1(fx.cfg, { env: bogus,
        credReadMany: async (request) => { calls.push(request.keys); return { job: "ok", creds: {} }; },
        deps: NO_SPAWN,
    }), (e) => e instanceof m.VcSecretsError && e.message === today);
    assert.deepEqual(calls, [[]], "the bind still ran, with no key to read");
});

test("cmdLaunch on win32: oauth keys are batched only when the oauth entry will be read from Credential Manager", async () => {
    // The environment says wcm; the backend handed to oauthLaunchDeps says keychain, and that one wins.
    const fx = d1Config({ secretName: null });
    const calls = [];
    const { handle } = await launchD1(fx.cfg, {
        credReadMany: async (request) => { calls.push(request.keys); return { job: "ok", creds: {} }; },
        deps: { backend: "keychain", readCache: async () => ({ state: "valid", accessToken: "cached" }) },
    });
    await handle.dispose();
    assert.deepEqual(calls, [[]]);
});

test("cmdLaunch on win32: an oauth entry's outcome never becomes a secret's value, even when the two share a name", async () => {
    const fx = d1Config({ secretName: "ado" });
    const { handle, seen } = await launchD1(fx.cfg, {
        credReadMany: async () => ({ job: "ok", creds: {
            [fx.secretKey("ado")]: { ok: credHex("the-secret") },
            [fx.keys.refresh]: { ok: credHex(fx.refreshBlob("r1")) },
            [fx.keys.access]: { ok: credHex(fx.accessBlob("a-batch")) } } }),
    });
    try {
        assert.equal(seen.childEnv.PAT, "the-secret");
        assert.equal(seen.childEnv.ADO_TOKEN, "a-batch");
        assert.deepEqual(seen.bound[0].keys, [fx.secretKey("ado"), fx.keys.refresh, fx.keys.access]);
    } finally {
        await handle.dispose();
    }
});

test("forwardedSignalsFor: every platform gets the interrupt, terminate and hangup signals, and win32 gets no SIGQUIT", () => {
    for (const platform of ["linux", "darwin", "freebsd"]) {
        assert.deepEqual([...m.forwardedSignalsFor(platform)].sort(), ["SIGHUP", "SIGINT", "SIGQUIT", "SIGTERM"], platform);
    }
    assert.deepEqual([...m.forwardedSignalsFor("win32")].sort(), ["SIGHUP", "SIGINT", "SIGTERM"]);
});

test("cmdLaunch: on win32 no SIGQUIT listener is registered, and the other three still are, and dispose removes them", async () => {
    // Driven through the seam rather than on win32, where the listener count would be the platform's own.
    const cfg = m.loadConfig(projectPaths({ secrets: {},
        servers: { github: { command: process.execPath, args: ["-e", ""], env: {} } } }));
    const child = Object.assign(fakeChild(), { pid: 2 ** 22 + 1 });
    const count = (signal) => process.listenerCount(signal);
    const before = Object.fromEntries(["SIGINT", "SIGTERM", "SIGHUP", "SIGQUIT"].map((signal) => [signal, count(signal)]));
    const handle = await launch("servers", "github", cfg,
        { trustState: trustedStateFor(cfg), spawnFn: () => child, signalPlatform: "win32" });
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        assert.equal(count(signal), before[signal] + 1, `${signal} is registered`);
    }
    assert.equal(count("SIGQUIT"), before.SIGQUIT, "SIGQUIT is not");
    await handle.dispose();
    for (const [signal, n] of Object.entries(before)) {
        assert.equal(count(signal), n, `${signal} is back where it was`);
    }
});

test("killProcessTree: a null escalation signals once and arms no follow-up", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const signalled = [];
    const timer = m.killProcessTree({ pid: 4242, kill: (s) => signalled.push(["child", s]) }, "SIGTERM",
        { platform: "linux", killProcess: (pid, s) => signalled.push([pid, s]), escalation: null });
    t.mock.timers.tick(60_000);
    assert.equal(timer, null);
    assert.deepEqual(signalled, [[-4242, "SIGTERM"]]);
});

test("killProcessTree: an escalation is delivered at its own delay, and a caller can clear it", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const signalled = [];
    const seams = { platform: "linux", killProcess: (pid, s) => signalled.push([pid, s]),
        escalation: { afterMs: 1000, ref: true } };
    m.killProcessTree({ pid: 4242, kill: () => {} }, "SIGTERM", seams);
    t.mock.timers.tick(999);
    assert.deepEqual(signalled, [[-4242, "SIGTERM"]], "not before its delay");
    t.mock.timers.tick(1);
    assert.deepEqual(signalled, [[-4242, "SIGTERM"], [-4242, "SIGKILL"]]);

    signalled.length = 0;
    clearTimeout(m.killProcessTree({ pid: 4242, kill: () => {} }, "SIGTERM", seams));
    t.mock.timers.tick(5000);
    assert.deepEqual(signalled, [[-4242, "SIGTERM"]], "a cleared escalation never fires");
});

test("killProcessTree: the follow-up timer keeps the event loop alive exactly when the escalation says ref", () => {
    for (const ref of [true, false]) {
        const timer = m.killProcessTree({ pid: 4242, kill: () => {} }, "SIGTERM",
            { platform: "linux", killProcess: () => {}, escalation: { afterMs: 60_000, ref } });
        try {
            assert.equal(timer.hasRef(), ref);
        } finally {
            clearTimeout(timer);
        }
    }
});

test("killProcessTree: win32 arms no follow-up and returns none", (t) => {
    t.mock.timers.enable({ apis: ["setTimeout"] });

    const timer = m.killProcessTree({ pid: 4242, kill: () => {} }, "SIGTERM", {
        platform: "win32", spawnSyncProcess: () => {}, resolveCommand: () => ({ kind: "direct", cmd: "taskkill.exe" }),
    });
    assert.equal(timer, null);
});

// A group that does not exist: the pid is above any the kernel hands out, so killing -pid fails and
// killProcessTree falls back to child.kill -- which the fake records. SIGHUP because it is the forwarded
// signal a test process is least likely to hold a listener for.
async function launchWithRecordingChild(kind = "servers") {
    const cfg = m.loadConfig(projectPaths({ secrets: {},
        [kind]: { github: { command: process.execPath, args: ["-e", ""], env: {} } } }));
    const killed = [];
    const child = Object.assign(fakeChild(), { pid: 2 ** 22 + 1, kill: (s) => killed.push(s) });
    const handle = await launch(kind, "github", cfg, { trustState: trustedStateFor(cfg), spawnFn: () => child });

    return { handle, killed };
}

test("cmdLaunch: a task keeps the default grace before its escalation, since no MCP client is waiting to SIGKILL it",
    { skip: process.platform === "win32" && "win32 has taskkill /T /F and no follow-up to arm" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const { handle, killed } = await launchWithRecordingChild("tasks");
        try {
            process.emit("SIGHUP", "SIGHUP");
            t.mock.timers.tick(4999);
            assert.deepEqual(killed, ["SIGHUP"], "a task that is signalled gets the time to write its summary or roll back");
            t.mock.timers.tick(1);
            assert.deepEqual(killed, ["SIGHUP", "SIGKILL"], "and is still escalated, not left running");
        } finally {
            await handle.dispose();
        }
    });

test("LAUNCH_KILL_ESCALATION: both kinds keep the launcher alive until their escalation fires", () => {
    // Pinned because nothing else observes it: the child's own handle keeps the loop alive today, so a
    // timer flipped to unref'd passes every behavioural test while the guarantee quietly moves onto it.
    assert.deepEqual(Object.keys(m.LAUNCH_KILL_ESCALATION).sort(), ["servers", "tasks"]);
    for (const kind of ["servers", "tasks"]) {
        assert.equal(m.LAUNCH_KILL_ESCALATION[kind].ref, true, `${kind} escalation must be ref'd`);
    }
});

test("LAUNCH_KILL_ESCALATION: a server's escalation finishes inside the shortest window found in the MCP SDK", () => {
    // The TypeScript SDK's version-negotiation probe sibling sends SIGTERM and then SIGKILL after 1000 ms
    // on its main branch (see the comment on LAUNCH_KILL_ESCALATION; released clients were not checked).
    // The bound is that window, not the figure chosen under it, so the test fails when the escalation
    // grows past it and not when it is retuned.
    const SHORTEST_CLIENT_WINDOW_MS = 1000;
    assert.ok(m.LAUNCH_KILL_ESCALATION.servers.afterMs < SHORTEST_CLIENT_WINDOW_MS,
        `${m.LAUNCH_KILL_ESCALATION.servers.afterMs} ms would let the client SIGKILL the launcher first`);
    assert.ok(m.LAUNCH_KILL_ESCALATION.servers.afterMs > 0);
});

test("cmdLaunch: several forwarded signals arm one escalation, at the launcher's own short delay",
    { skip: process.platform === "win32" && "win32 has taskkill /T /F and no follow-up to arm" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        // The configured delay, not a number written here: what this pins is that a server's launch waits
        // exactly that long and arms the follow-up once. That the delay is short enough is the bound test's.
        const delay = m.LAUNCH_KILL_ESCALATION.servers.afterMs;
        const { handle, killed } = await launchWithRecordingChild();
        try {
            process.emit("SIGHUP", "SIGHUP");
            process.emit("SIGHUP", "SIGHUP");
            assert.deepEqual(killed, ["SIGHUP", "SIGHUP"], "each signal is forwarded");
            t.mock.timers.tick(delay - 1);
            assert.deepEqual(killed, ["SIGHUP", "SIGHUP"], "no SIGKILL before its delay");
            t.mock.timers.tick(1);
            assert.deepEqual(killed, ["SIGHUP", "SIGHUP", "SIGKILL"], "and it fires at the delay, armed once and not once per signal");
        } finally {
            await handle.dispose();
        }
    });

test("cmdLaunch: SIGQUIT is forwarded to the child like the other signals, and arms the same escalation",
    { skip: process.platform === "win32" && "win32 has taskkill /T /F and no follow-up to arm" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const { handle, killed } = await launchWithRecordingChild();
        try {
            process.emit("SIGQUIT", "SIGQUIT");
            assert.deepEqual(killed, ["SIGQUIT"], "forwarded as itself, not as a different signal");
            t.mock.timers.tick(m.LAUNCH_KILL_ESCALATION.servers.afterMs);
            assert.deepEqual(killed, ["SIGQUIT", "SIGKILL"]);
        } finally {
            await handle.dispose();
        }
    });

test("cmdLaunch: dispose clears a pending escalation",
    { skip: process.platform === "win32" && "win32 has taskkill /T /F and no follow-up to arm" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const { handle, killed } = await launchWithRecordingChild();
        process.emit("SIGHUP", "SIGHUP");
        await handle.dispose();
        t.mock.timers.tick(60_000);
        assert.deepEqual(killed, ["SIGHUP"], "a disposed launch must not SIGKILL a child it no longer owns");
    });

test("cmdLaunch: a second forwarded signal does not lose the first one's escalation, so dispose still clears it",
    { skip: process.platform === "win32" && "win32 has taskkill /T /F and no follow-up to arm" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const { handle, killed } = await launchWithRecordingChild();
        process.emit("SIGHUP", "SIGHUP");
        process.emit("SIGHUP", "SIGHUP");
        await handle.dispose();
        t.mock.timers.tick(60_000);
        assert.deepEqual(killed, ["SIGHUP", "SIGHUP"], "the escalation the first signal armed must not outlive the handle");
    });

// A server child that has a stdin to relay to. Pid above any the kernel hands out, so the group kill fails
// and killProcessTree falls back to child.kill, which this records (see launchWithRecordingChild).
function relayFixture() {
    const sink = { ended: false, chunks: [] };
    const childStdin = new Writable({ write(chunk, _enc, done) { sink.chunks.push(chunk); done(); } });
    childStdin.on("finish", () => { sink.ended = true; });
    const killed = [];
    const child = Object.assign(fakeChild(), { pid: 2 ** 22 + 1, kill: (s) => killed.push(s), stdin: childStdin });
    const stdin = new PassThrough();

    return { child, stdin, killed, sink };
}

async function launchWithRelay(kind, fixture, stdinOverride = fixture.stdin) {
    const cfg = m.loadConfig(projectPaths({ secrets: {},
        [kind]: { github: { command: process.execPath, args: ["-e", ""], env: {} } } }));
    const spawned = [];

    const handle = await launch(kind, "github", cfg, { trustState: trustedStateFor(cfg), stdin: stdinOverride,
        spawnFn: (cmd, args, opts) => { spawned.push(opts); return fixture.child; } });

    return { handle, spawned };
}

const nextTurn = () => new Promise((resolve) => setImmediate(resolve));

test("cmdLaunch: a server is spawned with a piped stdin, and a task keeps inherit",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async () => {
        const server = relayFixture();
        const { handle: serverHandle, spawned: serverSpawn } = await launchWithRelay("servers", server);
        await serverHandle.dispose();
        assert.deepEqual(serverSpawn[0].stdio, ["pipe", "inherit", "inherit"]);

        const task = relayFixture();
        const { handle: taskHandle, spawned: taskSpawn } = await launchWithRelay("tasks", task);
        try {
            assert.equal(taskSpawn[0].stdio, "inherit", "a task keeps the terminal: Ctrl-C and prompts");
            task.stdin.end();
            await nextTurn();
            assert.equal(task.sink.ended, false, "and nothing is relayed to it");
            assert.equal(task.stdin.listenerCount("end"), 0, "or listened for on the launcher's stdin");
        } finally {
            await taskHandle.dispose();
        }
    });

// The only injection point for this is deps.stdin: a real TTY on the launcher's stdin needs a pty, which
// the suite does not build. The real process.stdin.isTTY read is the same expression on a different object.
test("cmdLaunch: a server whose launcher stdin is a TTY keeps inherit",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async () => {
        const fixture = relayFixture();
        const tty = Object.assign(new PassThrough(), { isTTY: true });
        const { handle, spawned } = await launchWithRelay("servers", fixture, tty);
        try {
            assert.equal(spawned[0].stdio, "inherit");
            assert.equal(tty.listenerCount("end"), 0);
        } finally {
            await handle.dispose();
        }
    });

test("cmdLaunch: bytes written to a server's launcher stdin reach the child, and EOF ends the child's stdin",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const fixture = relayFixture();
        const { handle } = await launchWithRelay("servers", fixture);
        try {
            fixture.stdin.write(Buffer.from([0, 255, 10, 13]));
            await nextTurn();
            assert.deepEqual(Buffer.concat(fixture.sink.chunks), Buffer.from([0, 255, 10, 13]));
            assert.equal(fixture.sink.ended, false);
            fixture.stdin.end();
            await nextTurn();
            assert.equal(fixture.sink.ended, true);
        } finally {
            await handle.dispose();
        }
    });

test("cmdLaunch: a server still running one grace after its stdin closed is torn down, with the server escalation",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const fixture = relayFixture();
        const { handle } = await launchWithRelay("servers", fixture);
        try {
            fixture.stdin.end();
            await nextTurn();
            t.mock.timers.tick(m.LAUNCH_STDIN_CLOSE_GRACE_MS - 1);
            assert.deepEqual(fixture.killed, [], "a server that exits on EOF is given the grace");
            t.mock.timers.tick(1);
            assert.deepEqual(fixture.killed, ["SIGTERM"]);
            t.mock.timers.tick(m.LAUNCH_KILL_ESCALATION.servers.afterMs);
            assert.deepEqual(fixture.killed, ["SIGTERM", "SIGKILL"]);
        } finally {
            await handle.dispose();
        }
    });

test("LAUNCH_STDIN_CLOSE_GRACE_MS: the grace and the escalation after it finish inside the client's 2 s stdin-close window", () => {
    // The window is the MCP SDK's (end stdin, wait 2 s, SIGTERM); the bound is that, not the figure chosen under it.
    const CLIENT_STDIN_CLOSE_WINDOW_MS = 2000;
    assert.ok(m.LAUNCH_STDIN_CLOSE_GRACE_MS > 0);
    assert.ok(m.LAUNCH_STDIN_CLOSE_GRACE_MS + m.LAUNCH_KILL_ESCALATION.servers.afterMs < CLIENT_STDIN_CLOSE_WINDOW_MS);
});

test("cmdLaunch: a child that closes during the grace ends the launcher and nothing fires afterwards",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const exits = [];
        t.mock.method(process, "exit", (code) => { exits.push(code); });
        const fixture = relayFixture();
        const { handle } = await launchWithRelay("servers", fixture);
        try {
            fixture.stdin.end();
            await nextTurn();
            fixture.child.emit("close", 0, null);
            assert.deepEqual(exits, [0]);
            t.mock.timers.tick(60_000);
            assert.deepEqual(fixture.killed, [], "the grace timer is cleared by the close, not left to signal a dead group");
        } finally {
            await handle.dispose();
        }
    });

test("cmdLaunch: a signal during the grace tears down once, and its escalation clock is not restarted",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const fixture = relayFixture();
        const { handle } = await launchWithRelay("servers", fixture);
        try {
            fixture.stdin.end();
            await nextTurn();
            t.mock.timers.tick(m.LAUNCH_STDIN_CLOSE_GRACE_MS / 2);
            process.emit("SIGHUP", "SIGHUP");
            t.mock.timers.tick(m.LAUNCH_KILL_ESCALATION.servers.afterMs - 1);
            assert.deepEqual(fixture.killed, ["SIGHUP"], "the grace timer was stood down by the signal");
            t.mock.timers.tick(1);
            assert.deepEqual(fixture.killed, ["SIGHUP", "SIGKILL"], "SIGKILL falls one escalation after the signal, not after the grace");
            t.mock.timers.tick(60_000);
            assert.deepEqual(fixture.killed, ["SIGHUP", "SIGKILL"], "and nothing signals the group a third time");
        } finally {
            await handle.dispose();
        }
    });

test("cmdLaunch: a signal before the stdin EOF leaves no grace timer behind it",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const fixture = relayFixture();
        const { handle } = await launchWithRelay("servers", fixture);
        try {
            process.emit("SIGHUP", "SIGHUP");
            fixture.stdin.end();
            await nextTurn();
            t.mock.timers.tick(60_000);
            assert.deepEqual(fixture.killed, ["SIGHUP", "SIGKILL"], "one teardown: the signal's, with its own escalation");
        } finally {
            await handle.dispose();
        }
    });

test("cmdLaunch: dispose detaches the relay and its grace timer",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const fixture = relayFixture();
        const endBefore = fixture.stdin.listenerCount("end");
        const errorBefore = fixture.child.stdin.listenerCount("error");
        const { handle } = await launchWithRelay("servers", fixture);
        assert.equal(fixture.stdin.listenerCount("end"), endBefore + 2, "the pipe's own, and the relay's");
        fixture.stdin.end();
        await nextTurn();
        await handle.dispose();
        t.mock.timers.tick(60_000);
        assert.deepEqual(fixture.killed, [], "a disposed launch must not signal a child it no longer owns");
        assert.equal(fixture.stdin.listenerCount("end"), endBefore);
        assert.equal(fixture.child.stdin.listenerCount("error"), errorBefore);
    });

test("cmdLaunch: a write to a child that has gone is swallowed, and any other stream error is not",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async () => {
        const fixture = relayFixture();
        const { handle } = await launchWithRelay("servers", fixture);
        try {
            for (const code of ["EPIPE", "ERR_STREAM_DESTROYED"]) {
                assert.doesNotThrow(() => fixture.child.stdin.emit("error", Object.assign(new Error(code), { code })), code);
            }
            assert.throws(() => fixture.child.stdin.emit("error", Object.assign(new Error("disk on fire"), { code: "EIO" })),
                /disk on fire/);
        } finally {
            await handle.dispose();
        }
    });

// The same defect without a process or a timer to race: the error is EMITTED on the child's stdin, and the
// bytes and the EOF the client sends afterwards are what the launcher must still read. The real-process test
// in vc-secrets.test.mjs ("cmdLaunch: a server that closed its stdin and kept running is still torn down
// after the client's EOF behind unread input") waits for the error to be handled by sleeping, which a
// delayed error would defeat; the order here is fixed by construction.
test("cmdLaunch: after the child's stdin fails with EPIPE the launcher keeps draining its own, and the client's EOF arms the teardown",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        for (const code of ["EPIPE", "ERR_STREAM_DESTROYED"]) {
            const fixture = relayFixture();
            const { handle } = await launchWithRelay("servers", fixture);
            try {
                fixture.child.stdin.emit("error", Object.assign(new Error(code), { code }));
                // Behind the error, with the EOF still to come: nobody reads it unless the launcher drains.
                fixture.stdin.write(Buffer.alloc(1024, 2));
                await nextTurn();
                assert.equal(fixture.stdin.readableFlowing, true, `${code}: the launcher's stdin is still being read`);
                assert.equal(fixture.stdin.readableLength, 0, `${code}: and what the client wrote after the error was consumed`);
                fixture.stdin.end();
                await nextTurn();
                t.mock.timers.tick(m.LAUNCH_STDIN_CLOSE_GRACE_MS - 1);
                assert.deepEqual(fixture.killed, [], `${code}: the server is given the grace first`);
                t.mock.timers.tick(1);
                assert.deepEqual(fixture.killed, ["SIGTERM"], `${code}: the EOF was seen, so the teardown armed`);
            } finally {
                await handle.dispose();
            }
        }
    });

test("cmdLaunch: a launcher stdin that ended before the relay attached still arms the teardown",
    { skip: process.platform === "win32" && "win32 keeps inherit for both" },
    async (t) => {
        t.mock.timers.enable({ apis: ["setTimeout"] });
        const fixture = relayFixture();
        fixture.stdin.end();
        fixture.stdin.resume();
        await new Promise((resolve) => fixture.stdin.once("end", resolve));
        assert.equal(fixture.stdin.readableEnded, true, "the fixture must be consumed before the launch, or the test proves nothing");
        const { handle } = await launchWithRelay("servers", fixture);
        try {
            await nextTurn();
            assert.equal(fixture.sink.ended, true, "the child's stdin is ended at once");
            t.mock.timers.tick(m.LAUNCH_STDIN_CLOSE_GRACE_MS);
            assert.deepEqual(fixture.killed, ["SIGTERM"]);
        } finally {
            await handle.dispose();
        }
    });

test("cmdLaunch: the spawn command is looked up against the child's env, so a declared PATH is what is searched", async () => {
    // resolveSpawnCommand only searches on win32, so on any other platform the lookup is a
    // pass-through and its env cannot be observed from the result -- hence the seam. What is asserted is
    // the env handed over: the declaration's PATH, not this process's.
    const cfg = m.loadConfig(projectPaths({ secrets: {},
        servers: { github: { command: "tool", args: [], env: { PATH: "literal:/declared/bin" } } } }));
    const seen = [];
    const child = Object.assign(fakeChild(), { pid: 2 ** 22 + 1 });
    const handle = await launch("servers", "github", cfg, {
        trustState: trustedStateFor(cfg),
        resolveCommand: (command, options) => { seen.push([command, options.env.PATH]); return { kind: "direct", cmd: command }; },
        spawnFn: () => child,
    });
    await handle.dispose();
    assert.deepEqual(seen, [["tool", "/declared/bin"]]);
});

test("cmdLaunch: hands createChannel the same namespace keyFor keys the entry under, at both scopes", async () => {
    // createChannel reads scopeKey only on its win32 branch, so on POSIX a wrong namespace reaches
    // no observable: the channel still binds and the launch still works, while it and the lock
    // guarding the same renewal land in different namespaces. What is handed over is the only thing
    // to assert, hence deps.createChannel -- and it is asserted against keyFor rather than against
    // a literal, because agreeing with keyFor is the whole requirement.
    const passedScopeKey = async (cfg) => {
        let passed;
        const handle = await launch("servers", "s", cfg, {
            trustState: trustedStateFor(cfg),
            childNodeVersion: () => "v20.11.0",
            readCache: async () => ({ state: "valid", accessToken: "cached" }),
            createChannel: ({ scopeKey }) => {
                passed = scopeKey;

                return { path: "/tmp/not-a-real.sock", push: () => 1, peers: () => 1,
                    close: async () => {}, removeSync: () => {} };
            },
            spawnFn: () => fakeChild(),
        });
        await handle.dispose();

        return passed;
    };
    const project = m.loadConfig(authorizedOauthPaths());
    assert.equal(`${m.KEY_PREFIX}:${await passedScopeKey(project)}:probe`,
        m.keyFor("probe", project.oauth.ado, project));

    const user = m.loadConfig(scopedPaths({ user: {
        oauth: { ado: OAUTH_DECL },
        servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: "oauth:ado" } } },
    } }));
    assert.equal(`${m.KEY_PREFIX}:${await passedScopeKey(user)}:probe`,
        m.keyFor("probe", user.oauth.ado, user));
});

test("cmdLaunch: a launch can renew only one", async () => {
    // New coverage (source gap): mcpw.js's cmdRun has this too-many-oauth-entries refusal, but the
    // source's own test suite has no test for it. Both oauth entries are declared and referenced at
    // USER scope so this never needs a registration grant -- the point of this test is the count,
    // not authorization.
    const cfg = m.loadConfig(scopedPaths({
        user: {
            oauth: { ado: OAUTH_DECL, ado2: OAUTH_DECL },
            servers: { s: { command: "npx", args: [], env: { A: "oauth:ado", B: "oauth:ado2" } } },
        },
    }));
    await assert.rejects(() => launch("servers", "s", cfg),
        /server "s" references 2 oauth entries \(A, B\) -- a launch can renew only one/);
});

test("buildChildEnv: the inherited injection vectors are dropped, not extended", () => {
    // Asserting only that NODE_OPTIONS ends up composed is a TAUTOLOGY: this function assigns
    // that variable last, so the assertion holds even if the inherited environment is copied
    // wholesale. The claim worth making is about the SIBLING vectors, which nothing downstream
    // overwrites: an inherited LD_PRELOAD reaching the child is the same arbitrary-code execution
    // inside the credential holder that the carve-out promises to keep closed.
    // A rooted POSIX path resolves against the current DRIVE on Windows, so the path and the URL
    // it must become are both stated per platform rather than computed -- computing the
    // expectation with pathToFileURL would assert nothing about the transformation.
    const onWindows = process.platform === "win32";
    const preloadPath = onWindows ? "C:\\abs\\p.mjs" : "/abs/p.mjs";
    const expected = onWindows ? '--import "file:///C:/abs/p.mjs"' : '--import "file:///abs/p.mjs"';
    const env = m.buildChildEnv({ NODE_OPTIONS: "--require /evil.js", LD_PRELOAD: "/evil.so",
        DYLD_INSERT_LIBRARIES: "/evil.dylib", PATH: "/bin" },
        { token: "tok", envVar: "ADO_MCP_AUTH_TOKEN", channelPath: "/tmp/c.sock", nonce: "n", preloadPath });
    assert.equal(env.NODE_OPTIONS, expected);
    assert.equal(env.LD_PRELOAD, undefined);
    assert.equal(env.DYLD_INSERT_LIBRARIES, undefined);
    assert.equal(env.PATH, "/bin", "the rest of the environment is untouched");
});

// "none in argv" is not assertable here: buildChildEnv returns an env object and there is no argv
// in the call. The argv half is pinned by "a pinned argv reaches the
// child exactly as declared, even through the win32 .cmd rewrite", which drives resolveSpawnCommand
// and buildSpawnInvocation directly -- no cmdLaunch test observes argv, only the env it was handed.
test("buildChildEnv: the token, channel, nonce and target variables all travel in env", () => {
    const env = m.buildChildEnv({}, { token: "tok", envVar: "ADO_MCP_AUTH_TOKEN",
        channelPath: "/tmp/c.sock", nonce: "n", preloadPath: "/abs/p.mjs",
        targetPackage: "some-oauth-package", binName: "mcp-server-x" });
    assert.equal(env.ADO_MCP_AUTH_TOKEN, "tok");
    assert.equal(env.VC_SECRETS_TOKEN_CHANNEL, "/tmp/c.sock");
    assert.equal(env.VC_SECRETS_CHANNEL_NONCE, "n");
    assert.equal(env.VC_SECRETS_TOKEN_ENV, "ADO_MCP_AUTH_TOKEN",
        "the preload learns the variable from its own environment, never from the wire");
    assert.equal(env.VC_SECRETS_TARGET_PACKAGE, "some-oauth-package");
    assert.equal(env.VC_SECRETS_TARGET_BIN, "mcp-server-x");
});

test("childNodeSupportsImport: 18.18.0 is the boundary, not the major version", () => {
    // Verified against upstream: --import landed in 19.0.0 and was backported to 18.18.0;
    // src/node_options.cc has it at v18.18.0 and not at v18.17.1, and it is registered
    // kAllowedInEnvironment, so NODE_OPTIONS accepts it there.
    assert.equal(m.childNodeSupportsImport("v18.17.1"), false);
    assert.equal(m.childNodeSupportsImport("v18.18.0"), true);
    assert.equal(m.childNodeSupportsImport("v20.5.1"), true, "a major-version floor would wrongly refuse this");
    assert.equal(m.childNodeSupportsImport("v22.22.0"), true);
    assert.equal(m.childNodeSupportsImport("v18.9.0"), false, "9 < 18 by number, not by string order");
});

test("childNodeSupportsImport: a version it cannot read is refused, not assumed new enough", () => {
    // `node --version` returning nothing is what a missing or broken node looks like, and
    // assuming "new enough" there trades a named error for a server that aborts at startup
    // behind a message about a flag.
    assert.equal(m.childNodeSupportsImport(""), false);
    assert.equal(m.childNodeSupportsImport("not a version"), false);
    assert.equal(m.childNodeSupportsImport(undefined), false);
});

test("childNodeVersionIo: an inherited NODE_OPTIONS does not break the probe", () => {
    // The poison goes in process.env, not in the injected argument, and that is the whole point:
    // without the fix the spawn inherits the real environment, so a bogus value passed as an
    // ARGUMENT would be ignored and the probe would succeed either way.
    //
    // With an inherited NODE_OPTIONS node rejects, the probe reads empty and the launcher refuses a
    // server that would have started. Measured: --version exits before any preload runs, so an
    // inherited --require does not execute in this child. That is why the poison below is a
    // rejected flag and not a loader, and why the title claims only that the probe does not break.
    const saved = process.env.NODE_OPTIONS;
    process.env.NODE_OPTIONS = "--not-a-real-flag";
    try {
        const version = m.childNodeVersionIo();
        assert.match(version, /^v\d+\.\d+\.\d+/, `the probe must not inherit NODE_OPTIONS: "${version}"`);
    } finally {
        if (saved === undefined) {
            delete process.env.NODE_OPTIONS;
        } else {
            process.env.NODE_OPTIONS = saved;
        }
    }
});

test("cmdLaunch: an untrusted repository server is refused before any token, cache or channel is touched", async () => {
    const cfg = m.loadConfig(authorizedOauthPaths());
    const touched = [];
    const deps = {
        readCache: async () => { touched.push("readCache"); return { state: "valid", accessToken: "cached" }; },
        childNodeVersion: () => { touched.push("childNodeVersion"); return "v20.11.0"; },
        createChannel: () => { touched.push("createChannel"); return { path: "/tmp/not-a-real.sock", push: () => 1, peers: () => 1, close: async () => {}, removeSync: () => {} }; },
        spawnFn: () => { touched.push("spawn"); return fakeChild(); },
    };
    await assert.rejects(() => launch("servers", "s", cfg, { ...deps, trustState: NO_TRUST }),
        new RegExp(`server "s" is declared by .* and is not trusted -- review it, then run "vc-secrets trust" in `));
    assert.deepEqual(touched, [], "a repository nobody trusted must not cost a keystore read");

    // The control: with the record the same launch reaches the cache, which is what proves the seam above
    // is on the path the refusal cut short.
    const handle = await launch("servers", "s", cfg, { ...deps, trustState: trustedStateFor(cfg) });
    await handle.dispose();
    assert.ok(touched.includes("readCache"), `the trusted launch never reached the cache: ${touched}`);
});

test("cmdLaunch: a changed repository server is refused with the differences, and never spawned", async () => {
    const cfg = trustCfg();
    const state = trustedStateFor(cfg);
    const changed = withDeclaration(cfg, "servers", "gh", { args: ["-y", "another-package"] });
    let spawned = 0;
    await assert.rejects(() => launch("servers", "gh", changed, { trustState: state, spawnFn: () => { spawned++; return fakeChild(); } }),
        /server "gh" changed since you trusted it: args changed -- review it, then run "vc-secrets trust" again in /);
    assert.equal(spawned, 0);
});

test("cmdLaunch: an unknown name is reported as unknown, before the trust file is consulted", async () => {
    const cfg = trustCfg();
    await assert.rejects(() => m.cmdLaunch("servers", "ghost", cfg, {
        bindPlatform: "linux",
        get trustState() { throw new Error("the trust state must not be read for a name nothing declares"); } }),
        /unknown server "ghost"/);
});

test("cmdLaunch: the trust file is read only for a gated launch, and an unreadable one refuses that launch alone", async () => {
    const env = trustEnv();
    const file = m.trustFilePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ corrupt");
    const user = m.loadConfig(scopedPaths({ user: { servers: { mine: { command: process.execPath, args: ["-e", ""], env: {} } } } }));
    await withProcessEnv(env, async () => {
        const handle = await launch("servers", "mine", user, { spawnFn: () => fakeChild() });
        await handle.dispose();

        await assert.rejects(() => launch("servers", "gh", trustCfg(), { spawnFn: () => fakeChild() }),
            (e) => e instanceof m.VcSecretsError && e.message.includes(file));

        // The one user-scope launch that does depend on it: the person's own server reading a repository's
        // local secret. Refused by the unreadable file, not waved through as if nothing were gated.
        await assert.rejects(() => launch("servers", "s", namespaceCfg(), { spawnFn: () => fakeChild() }),
            (e) => e instanceof m.VcSecretsError && e.message.includes(file));
    });
});

test("cmdTask: an untrusted repository task is refused like a server, through the same gate", async () => {
    const cfg = trustCfg({ servers: {}, tasks: { job: TRUST_BASE } });
    await withProcessEnv(trustEnv(), () => assert.rejects(() => m.cmdTask("job", cfg, { bindPlatform: "linux" }),
        /task "job" is declared by .* and is not trusted -- review it, then run "vc-secrets trust" in /));
});

test("childNodeProbes: a launchable in the refused set is not probed, because the probe would run its command", () => {
    const cfg = { servers: { trusted: { command: "npx", env: {} }, refused: { command: "npx", env: {} } }, tasks: {} };
    const refs = [{ kind: "servers", launchableName: "trusted" }, { kind: "servers", launchableName: "refused" }];
    const probed = [];
    const out = m.childNodeProbes(cfg, refs, {
        probe: ({ command }) => { probed.push(command); return "v20.11.0"; },
        refused: new Map([["servers/refused", { reason: "untrusted" }]]),
    });
    assert.deepEqual(out.map((x) => x.launchableName), ["trusted"]);
    assert.equal(probed.length, 1, "one probe, for the launchable that may run");

    const none = m.childNodeProbes(cfg, [refs[1]], { probe: () => { throw new Error("probed a refused launchable"); },
        refused: new Map([["servers/refused", null]]) });
    assert.deepEqual(none, [], "an unreadable trust file (a null problem) refuses too");
});

test("cmdLaunch on win32: a user-scope server reading a repository's local secret is refused without a record, before any keystore read", async () => {
    for (const kind of ["servers", "tasks"]) {
        const cfg = m.loadConfig(scopedPaths({ user: { [kind]: { s: NS_SERVER } }, project: { projectId: "proj-x", secrets: { pat: { backend: "local" } } } }));
        const key = m.keyFor("pat", cfg.secrets.pat, cfg);
        const calls = [];
        let childEnv = null;
        const deps = {
            credReadMany: async (request) => { calls.push(request); return { creds: { [key]: { ok: credHex("the-pat") } }, job: "ok" }; },
            spawnFn: (cmd, args, opts) => { childEnv = opts.env; return fakeChild(); },
        };
        await assert.rejects(() => launchWithBind(kind, cfg, { ...deps, trustState: NO_TRUST }),
            /\(user\) reads secret "pat" from namespace "proj-x", which this repository declares, and this checkout is not trusted/, kind);
        assert.deepEqual(calls, [], `${kind}: a refused launch must not cost a keystore read`);
        assert.equal(childEnv, null);

        const moved = trustedStateFor(cfg);
        moved.repositories[cfg.projectRoot].projectId = "proj-other";
        await assert.rejects(() => launchWithBind(kind, cfg, { ...deps, trustState: moved }),
            /the projectId changed since you trusted this checkout: projectId is "proj-x", trusted "proj-other"/, kind);
        assert.deepEqual(calls, []);

        const handle = await launchWithBind(kind, cfg, { ...deps, trustState: trustedStateFor(cfg) });
        try {
            assert.equal(childEnv.PAT, "the-pat", `${kind}: the control -- with the record the same launch reads the secret`);
        } finally {
            await handle.dispose();
        }
    }
});

test("cmdLaunch: repository Y claiming X's projectId, with a matching registrations grant, is refused without a record for Y's root", async () => {
    const x = namespaceOauthCfg();
    const y = namespaceOauthCfg();
    assert.equal(m.crossingProblem(y, "servers", "s", "ado", "oauth"), null, "the grant is keyed by tenant and client, so it passes whatever the id");
    const touched = [];
    const deps = {
        readCache: async () => { touched.push("readCache"); return { state: "valid", accessToken: "cached" }; },
        childNodeVersion: () => "v20.11.0",
        createChannel: () => ({ path: "/tmp/not-a-real.sock", push: () => 1, peers: () => 1, close: async () => {}, removeSync: () => {} }),
        spawnFn: () => fakeChild(),
    };
    // X is trusted; that says nothing about Y's root.
    await assert.rejects(() => launch("servers", "s", y, { ...deps, trustState: trustedStateFor(x) }),
        /server "s" \(user\) reads oauth "ado" from namespace "proj-x", which this repository declares, and this checkout is not trusted/);
    assert.deepEqual(touched, [], "a refused launch must not read, let alone exchange, the other project's refresh token");

    const handle = await launch("servers", "s", y, { ...deps, trustState: trustedStateFor(y) });
    await handle.dispose();
    assert.deepEqual(touched, ["readCache"], "the control: with a record for Y's own root the same launch reaches the cache");
});

test("cmdLaunch: untrust revokes what trust granted to a user-scope reader, through the real trust file", async () => {
    const cfg = namespaceOauthCfg();
    const env = trustEnv();
    m.writeTrustState(env, trustedStateFor(cfg));
    const deps = {
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        childNodeVersion: () => "v20.11.0",
        createChannel: () => ({ path: "/tmp/not-a-real.sock", push: () => 1, peers: () => 1, close: async () => {}, removeSync: () => {} }),
        spawnFn: () => fakeChild(),
    };
    await withProcessEnv(env, async () => {
        const handle = await launch("servers", "s", cfg, deps);
        await handle.dispose();
        await m.cmdUntrust(cfg.projectRoot, { env, log: () => {} });
        await assert.rejects(() => launch("servers", "s", cfg, deps), /\(user\) reads oauth "ado" from namespace "proj-x"/);
    });
});

test("cmdLaunch: a user-scope launch that reads nothing the repository declares never touches the trust file", async () => {
    // A repository is present and declares secrets, including a Key Vault one the launch reads -- but none
    // is a `local` secret or an oauth entry the launch reads, so the file is not consulted.
    const cfg = m.loadConfig(scopedPaths({
        user: { secrets: { pat: { backend: "local" } },
            servers: { mine: { ...NS_SERVER, env: { PAT: "secret:pat", KV: "secret:kv" } } } },
        project: { projectId: "proj-x", secrets: { other: { backend: "local" }, kv: KV_PAT } } }));
    assert.equal(m.trustAssessment(cfg, () => { throw new Error("the trust file was read"); }).problems.size, 0);
    await assert.rejects(() => m.cmdLaunch("servers", "mine", cfg, { bindPlatform: "linux",
        get trustState() { throw new Error("the trust state must not be read"); } }),
        (e) => e instanceof m.VcSecretsError && /not authorized to receive "kv"/.test(e.message));
});

test("childNodeProbes: `refused` is required, so a caller cannot forget it", () => {
    const cfg = { servers: { s: { command: "npx" } }, tasks: {} };
    const refs = [{ kind: "servers", launchableName: "s" }];
    const probe = () => { throw new Error("probed without being told what is refused"); };
    assert.throws(() => m.childNodeProbes(cfg, refs, { probe }), /needs `refused`/);
    assert.throws(() => m.childNodeProbes(cfg, refs), /needs `refused`/);
    assert.throws(() => m.childNodeProbes(cfg, refs, { probe, refused: [] }), /needs `refused`/, "a Map, not just something iterable");
});

test("the margin covers the tick, the exchange, the skew allowance and both keystore writes", () => {
    // Four terms live in three modules and nothing else connects them: RENEWAL_TICK_MS (this
    // launcher) is how late entering the margin can be noticed; TIMEOUT_OAUTH_MS (the protocol) is
    // the exchange the margin must still have time for; SKEW_TOLERANCE_MS (the cache) is the
    // ordinary clock-correction allowance cacheStatus absorbs before calling it a rollback;
    // TIMEOUT_LOCAL_MS (this launcher) is one keystore call, counted twice because the renewal
    // writes the refresh entry and then the access entry after the exchange -- the same pair
    // LOCK_WAIT_MS's own relation (lib/keystore.test.mjs) has to cover.
    assert.ok(cache.MARGIN_MS >= m.RENEWAL_TICK_MS + oauth.TIMEOUT_OAUTH_MS + cache.SKEW_TOLERANCE_MS
            + 2 * m.TIMEOUT_LOCAL_MS,
        `MARGIN_MS=${cache.MARGIN_MS} must be at least RENEWAL_TICK_MS(${m.RENEWAL_TICK_MS}) + `
        + `TIMEOUT_OAUTH_MS(${oauth.TIMEOUT_OAUTH_MS}) + SKEW_TOLERANCE_MS(${cache.SKEW_TOLERANCE_MS}) + `
        + `2 * TIMEOUT_LOCAL_MS(${m.TIMEOUT_LOCAL_MS})`);
});

// A raw client for the real channel's wire protocol: one JSON greeting line out, then whatever
// comes back. Used only by the tests below that drive createChannel directly.
function connectAndGreet(channelPath, { nonce }) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(channelPath);
        let received = "";
        // The one caller expects a REFUSAL, i.e. the server closing the connection. Without a
        // bound, a broken refusal (the defect that test exists to catch) hangs the whole suite
        // instead of failing it -- this timer turns that into an ordinary failed assertion.
        const timer = setTimeout(() => {
            sock.destroy();
            // What was actually received, not just that a timeout fired: a leaked token frame
            // and a merely-slow server both time out identically otherwise, and only one of them
            // is the defect this helper's callers exist to catch.
            reject(new Error(`connectAndGreet: the server never closed the connection; received ${JSON.stringify(received)}`));
        }, 2000);
        sock.once("connect", () => sock.write(JSON.stringify({ nonce }) + "\n"));
        sock.on("data", (chunk) => { received += chunk.toString("utf8"); });
        sock.once("close", () => { clearTimeout(timer); resolve(received); });
        sock.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

// Writes raw bytes with no framing at all -- for the oversize-greeting case, which must never
// see a newline.
function connectAndSend(channelPath, raw) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(channelPath);
        const timer = setTimeout(() => {
            sock.destroy();
            reject(new Error("connectAndSend: the server never closed the connection"));
        }, 2000);
        sock.once("connect", () => sock.write(raw));
        sock.once("close", () => { clearTimeout(timer); resolve(); });
        sock.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

// Greets and resolves with the token from the first frame the channel sends back.
function connectAndReadToken(channelPath, { nonce }) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(channelPath);
        let buf = "";
        // A dropped delivery (the defect these tests exist to catch) otherwise hangs the whole
        // suite instead of failing it.
        const timer = setTimeout(() => {
            sock.destroy();
            reject(new Error("connectAndReadToken: no token frame arrived"));
        }, 2000);
        sock.once("connect", () => sock.write(JSON.stringify({ nonce }) + "\n"));
        sock.on("data", (chunk) => {
            buf += chunk.toString("utf8");
            const nl = buf.indexOf("\n");
            if (nl >= 0) {
                clearTimeout(timer);
                sock.destroy();
                try {
                    resolve(JSON.parse(buf.slice(0, nl)).token);
                } catch (e) {
                    reject(e);
                }
            }
        });
        sock.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

// Greets and resolves once the FIRST frame arrives, leaving the socket open -- unlike
// connectAndReadToken, which destroys it. A first frame is proof of authentication (the server
// serves `latest` to it the instant it authenticates), so this makes "is this client
// authenticated yet" observable instead of assumed after a fixed delay. Returns { sock, first,
// next } -- `next()` awaits the frame after that one, bounded by the same 2s as the other
// helpers here; the caller owns destroying `sock`.
//
// A frame that arrives before `next()` is called is queued rather than dropped: a caller driving
// two clients (push, then await client A's next(), then client B's) has B's frame land during the
// await on A -- with no queue that frame is lost and B's later next() hangs forever.
function connectAndAwaitAuth(channelPath, { nonce }) {
    return new Promise((resolve, reject) => {
        const sock = net.connect(channelPath);
        let buf = "";
        let authenticated = false;
        const queue = [];
        let pending = null;
        const timer = setTimeout(() => {
            sock.destroy();
            reject(new Error("connectAndAwaitAuth: no token frame arrived"));
        }, 2000);
        const deliver = (token) => {
            if (pending !== null) {
                pending.resolve(token);
                pending = null;
            } else {
                queue.push(token);
            }
        };
        sock.once("connect", () => sock.write(JSON.stringify({ nonce }) + "\n"));
        sock.on("data", (chunk) => {
            buf += chunk.toString("utf8");
            let nl;
            while ((nl = buf.indexOf("\n")) >= 0) {
                const line = buf.slice(0, nl);
                buf = buf.slice(nl + 1);
                let token;
                try {
                    token = JSON.parse(line).token;
                } catch (e) {
                    if (pending !== null) {
                        pending.reject(e);
                        pending = null;
                    }
                    continue;
                }
                if (!authenticated) {
                    authenticated = true;
                    clearTimeout(timer);
                    // Same 2s bound as connectAndReadToken's: a push that returns a delivered
                    // count but writes nothing (or a server that stops serving a client it
                    // already authenticated) must not hang the run with no failure text.
                    const next = () => {
                        if (queue.length > 0) {
                            return Promise.resolve(queue.shift());
                        }

                        return new Promise((res, rej) => {
                            const nextTimer = setTimeout(() => {
                                pending = null;
                                rej(new Error("connectAndAwaitAuth: next() timed out waiting for a frame"));
                            }, 2000);
                            pending = {
                                resolve: (v) => { clearTimeout(nextTimer); res(v); },
                                reject: (e) => { clearTimeout(nextTimer); rej(e); },
                            };
                        });
                    };
                    resolve({ sock, first: token, next });
                } else {
                    deliver(token);
                }
            }
        });
        sock.once("error", (e) => { clearTimeout(timer); reject(e); });
    });
}

// -----
// The preload, run as a real process against the real channel or a raw-socket fixture

// ---- The token channel itself: createChannel, channelPipeName, CHANNEL_GREETING_MAX ----
//
// These drive the real channel directly, at the wire protocol -- no spawned process, no
// preload -- because that is the layer this block owns. The preload-level tests below (against
// startRawSocketFixture, and the five re-pointed at the real channel) are the integration half.

channelTest("a client presenting no nonce or a wrong one is refused and gets no token", async () => {
    // The channel is reachable by any same-user process; the nonce is mandatory rather
    // than defence in depth. Covers BOTH halves of the title -- a greeting with no `nonce` field
    // at all, and one with a wrong value -- because the source reads `JSON.parse(...).nonce`, so
    // a missing field and a wrong value reach the same comparison but are not the same input, and
    // a matcher that special-cases "absent" (accepting it) would pass a title that only ever
    // tested "wrong". Each half pushes BEFORE connecting: without that, "received nothing" has
    // two causes (refused, or simply never served). A leak is then observable either way --
    // `received` carries it if the connection still closes, and connectAndGreet's own timeout
    // names it if a wrongly-accepted client is instead left open. The wrong-nonce half is also
    // ported, faithfully, at the process level: mcpw.test.js below.
    const refusals = [];
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right",
        onRefusal: (w) => refusals.push(w) });
    try {
        ch.push("t1");
        const missing = await connectAndGreet(ch.path, {});
        assert.deepEqual(refusals, ["nonce"]);
        assert.equal(missing, "", "a client with no nonce field must receive no token frame");

        ch.push("t2");
        const wrong = await connectAndGreet(ch.path, { nonce: "wrong" });
        assert.deepEqual(refusals, ["nonce", "nonce"]);
        assert.equal(wrong, "", "a client with a wrong nonce must receive no token frame");
    } finally {
        await ch.close();
    }
});

test("a wrong-LENGTH nonce is not distinguishable from a wrong-value one", () => {
    // timingSafeEqual throws on unequal lengths, so both sides are hashed to equal length first.
    // No behavioural seam can observe this -- the catch turns either kind of mismatch into the
    // same "nonce" refusal -- so this asserts on source text, with comments stripped first.
    // Matching the two identifiers separately proves nothing: nonceDigest's OWN construction
    // also calls createHash("sha256"), so a mutant comparing raw presented/nonce values still
    // satisfies two lone matches. The binding under test is the timingSafeEqual CALL itself --
    // its first argument hashing `presented`, its second the digest built from `nonce`.
    const src = stripComments(m.createChannel.toString());
    assert.match(src, /crypto\.timingSafeEqual\(crypto\.createHash\("sha256"\)\.update\(String\(presented\)\)\.digest\(\), nonceDigest\)/);
    assert.match(src, /const nonceDigest = crypto\.createHash\("sha256"\)\.update\(String\(nonce\)\)\.digest\(\);/);
});

channelTest("an oversize greeting is refused rather than buffered without bound", async () => {
    const refusals = [];
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n",
        onRefusal: (w) => refusals.push(w) });
    try {
        await connectAndSend(ch.path, "x".repeat(m.CHANNEL_GREETING_MAX + 1));
        assert.deepEqual(refusals, ["oversize"]);
    } finally {
        await ch.close();
    }
});

channelTest("a client that authenticates AFTER a push still receives the latest token", async () => {
    // A push reaching only the sockets connected AT THAT INSTANT is lost with no error anywhere
    // when the server has not finished starting -- and the session then runs to the expiry of
    // its env token, which is the failure the channel exists to prevent. Ported from
    // mcpw.test.js, at the channel's own level rather than through a spawned preload.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    try {
        assert.equal(ch.push("t1"), 0);
        assert.equal(await connectAndReadToken(ch.path, { nonce: "n" }), "t1");
    } finally {
        await ch.close();
    }
});

channelTest("the socket is private to this uid, and its directory goes on close", async () => {
    // Ported from mcpw.test.js.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    const dir = path.dirname(ch.path);
    if (process.platform !== "win32") {
        assert.equal(fs.statSync(ch.path).mode & 0o777, 0o600);
        assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    }
    await ch.close();
    if (process.platform !== "win32") {
        assert.equal(fs.existsSync(dir), false, "one leftover directory per launch, otherwise");
    }
    // Asserted on BOTH platforms, because on Windows the two above are not: a named pipe has no
    // directory and no mode bits, so without this the whole test degrades to "create a channel,
    // close it, assert nothing" there -- and a close() that never released the endpoint is green.
    await assert.rejects(() => new Promise((resolve, reject) => {
        const probe = net.connect(ch.path);
        probe.once("connect", () => { probe.destroy(); resolve(); });
        probe.once("error", reject);
    }), "a closed channel must not still accept clients");
});

channelTest("close() releases the endpoint, not merely the directory", async (t) => {
    // Ported from mcpw.test.js. The connect assertion in "the socket is private to this uid, and its
    // directory goes on close" cannot fail on POSIX: close() removes the whole directory, so a
    // connect answers ENOENT whether or not the listener was ever released. Suppressing only the
    // directory teardown makes the guarantee falsifiable: node unlinks a unix socket exactly when
    // the server closes and not before, so with the directory still present, the FILE's absence is
    // the release, and its presence is a listener that outlived its channel.
    if (process.platform === "win32") {
        t.skip("no directory to suppress -- the connect assertion in the uid-privacy case is load-bearing there");

        return;
    }
    let dir = null;
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n",
        rm: (d) => { dir = d; } });
    try {
        await ch.close();
        assert.ok(dir !== null && fs.existsSync(dir),
            "the directory must survive, or the socket's absence would prove nothing");
        assert.equal(fs.existsSync(ch.path), false,
            "the socket file outliving close() means the listener did too");
    } finally {
        fs.rmSync(dir ?? "/nonexistent", { recursive: true, force: true });
    }
});

channelTest("close() destroys still-open client sockets rather than waiting for them to drain", async () => {
    // Neither "the socket is private to this uid, and its directory goes on close" nor "close()
    // releases the endpoint, not merely the directory" ever leaves a connection open when close()
    // runs, so neither can catch this comment's own claim going missing: server.close() alone waits
    // for every open connection to end, and a client that never destroys its own end would turn
    // teardown into a hang. Authentication is made OBSERVABLE -- the client waits for the pushed
    // frame `latest` serves on a successful greet -- rather than assumed after a fixed delay, which
    // under load can fail this test for the wrong reason (the socket not yet in `clients` when
    // close() runs).
    // Racing close() against a timer is the only way to see "did not hang" without actually
    // hanging this suite if it regresses.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    let sock = null;
    try {
        ch.push("t1");
        const auth = await connectAndAwaitAuth(ch.path, { nonce: "n" });
        sock = auth.sock;
        assert.equal(auth.first, "t1", "the client must be authenticated before close() races it");
        const closed = ch.close().then(() => "closed");
        const timedOut = new Promise((resolve) => { setTimeout(() => resolve("timed-out"), 2000); });
        assert.equal(await Promise.race([closed, timedOut]), "closed",
            "a live, un-destroyed client must not turn close() into a hang");
        await closed;
    } finally {
        // Guarded: connectAndAwaitAuth rejecting (its own 2s bound) would otherwise skip both the
        // socket destroy and ch.close(), leaking a listener into the rest of the run.
        if (sock !== null) {
            sock.destroy();
        }
        await ch.close().catch(() => {});
    }
});

channelTest("the channel path is a filesystem socket, never the lock's abstract namespace", async () => {
    // NOT the lock's namespace, on purpose (see the comment above createChannel): an abstract
    // name has no mode bits, and a token needs the 0600 the "socket is private to this uid" test
    // above checks -- the lock never carries a secret, which is why it can afford one.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    try {
        assert.ok(!ch.path.startsWith("\0"), "an abstract name has no mode bits to set");
    } finally {
        await ch.close();
    }
});

test("channelPipeName: two users, two scopes, two servers and two launches never share a pipe", () => {
    // Ported from mcpw.test.js, extended with two scopes -- the property scopeKey adds and
    // the source could not have had. The Windows channel has no mode bits, so the NAME is the
    // whole of what separates one developer's, one project's, or one launch's token stream from
    // another's.
    const at = (user, scopeKey, name, pid) => m.channelPipeName(name, scopeKey, { env: { USERNAME: user }, pid });
    assert.match(at("usera", "p1", "azure-mcp", 1234), /^\\\\\.\\pipe\\vc-secrets-ch-usera-p1-azure-mcp-1234$/);
    assert.notEqual(at("usera", "p1", "azure-mcp", 1234), at("userb", "p1", "azure-mcp", 1234), "two users");
    assert.notEqual(at("usera", "p1", "azure-mcp", 1234), at("usera", "p2", "azure-mcp", 1234), "two scopes");
    assert.notEqual(at("usera", "p1", "azure-mcp", 1234), at("usera", "p1", "github", 1234), "two servers");
    assert.notEqual(at("usera", "p1", "azure-mcp", 1234), at("usera", "p1", "azure-mcp", 5678), "two launches");
    assert.equal(at("dom\\user", "p1", "a/b", 1), "\\\\.\\pipe\\vc-secrets-ch-dom_user-p1-a_b-1",
        "a separator in either name cannot reshape the pipe path");
});

test("a channel that cannot accept a client degrades to no renewal, never to a dead session", async () => {
    // A net.Server with NO listener for "error" throws -- into uncaughtException and out through
    // fail(). Driven behaviourally rather than by matching source text: net.createServer is
    // wrapped for this one call so the real server createChannel builds is captured, then a real
    // "error" is emitted at it and the actual outcome (reported, not thrown) is observed. This
    // catches a deletion, a REORDER of removeAllListeners/on (measured: the text match alone
    // stays green across a reorder, because it does not care about order, while the reordered
    // code ends up with zero listeners and throws), and a relocation of the reporter -- not only
    // its presence in the text.
    let captured = null;
    const realCreateServer = net.createServer;
    net.createServer = (...args) => {
        captured = realCreateServer(...args);

        return captured;
    };
    let ch;
    try {
        ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    } finally {
        net.createServer = realCreateServer;
    }
    try {
        assert.ok(captured !== null, "createChannel must have created a server to capture");
        const written = [];
        const realWriteSync = fs.writeSync;
        fs.writeSync = (fd, data) => { written.push([fd, data]); };
        try {
            assert.doesNotThrow(() => {
                captured.emit("error", Object.assign(new Error("synthetic"), { code: "EMFILE" }));
            }, "an error after listen must be reported, never thrown");
        } finally {
            fs.writeSync = realWriteSync;
        }
        assert.ok(written.some(([fd, data]) => fd === 2 && String(data).includes("EMFILE")),
            "the error must be reported on fd 2, naming its code");
    } finally {
        // ch is undefined if createChannel itself threw above -- ch.close() there would raise a
        // TypeError that masks the real failure.
        await ch?.close();
    }
});

channelTest("a failure after the directory exists takes the directory with it", async (t) => {
    // Ported from mcpw.test.js. mkdtemp runs before the bind, and the launcher's own exit
    // handler is not registered yet -- so a throw here leaves the directory (and a live
    // listener) behind with nothing to remove it.
    if (process.platform === "win32") {
        t.skip("a named pipe has no directory, so chmod is never reached");

        return;
    }
    let dir = null;
    await assert.rejects(() => m.createChannel({ name: "s", scopeKey: "p1", nonce: "n",
        chmod: (p) => { dir = path.dirname(p); throw new Error("chmod refused"); } }), /chmod refused/);
    assert.ok(dir !== null, "the failure must happen after the directory exists, or this proves nothing");
    assert.equal(fs.existsSync(dir), false);
});

channelTest("the channel serves every authenticated client, so an earlier matching process cannot starve the server of renewals", async () => {
    // Both clients must be authenticated before the SECOND push, or the count below proves
    // nothing about a second client -- a late one is already covered by the "authenticates AFTER
    // a push" test above via `latest`, which is a different mechanism from this one. Authentication
    // is made observable (each client waits for the first pushed frame) rather than assumed after
    // a fixed delay, which under load can fail this test for the wrong reason.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "n" });
    let a = null;
    let b = null;
    try {
        ch.push("first");
        a = await connectAndAwaitAuth(ch.path, { nonce: "n" });
        b = await connectAndAwaitAuth(ch.path, { nonce: "n" });
        assert.equal(a.first, "first");
        assert.equal(b.first, "first");
        assert.equal(ch.push("shared-token"), 2, "an earlier matching process must not have taken the only slot");
        assert.equal(await a.next(), "shared-token");
        assert.equal(await b.next(), "shared-token");
    } finally {
        // Guarded: either connectAndAwaitAuth call rejecting (its own 2s bound) would otherwise
        // skip the sockets' destroy and ch.close(), leaking a listener into the rest of the run.
        if (a !== null) {
            a.sock.destroy();
        }
        if (b !== null) {
            b.sock.destroy();
        }
        await ch.close().catch(() => {});
    }
});

// A raw-socket fixture, not a stand-in for the channel's own checks: it exists because it can
// write bytes DETERMINISTICALLY -- a split frame, an unparsable frame, a null frame, or two
// frames coalesced into one write. Real pushes DO arrive at a reader as one chunk (measured), but
// this fixture writes both frames in a single write() call, so the coalesced-frame test does not
// depend on how the OS happens to chunk two separate ones. It can also observe a connection that
// never authenticates (`connections`) -- not a REFUSED one: a wrong nonce, an unparsable
// greeting, and an oversize greeting are all refused and reported via `onRefusal` on the real
// channel. The unexposed case is a connection that never sends a COMPLETE greeting line at all,
// which is what stub.connections pins for "a process that is not the target takes no action on
// either fd" below.
function startRawSocketFixture(onGreeting) {
    const channelPath = stubChannelPath();
    const greetings = [];
    const sockets = new Set();
    const server = net.createServer((sock) => {
        sockets.add(sock);
        sock.on("error", () => {});
        let buf = "";
        const onData = (chunk) => {
            buf += chunk.toString("utf8");
            const nl = buf.indexOf("\n");
            if (nl < 0) {
                return;
            }
            sock.off("data", onData);
            let greeting;
            try {
                greeting = JSON.parse(buf.slice(0, nl));
            } catch {
                greeting = { unparsable: true };
            }
            greetings.push(greeting);
            onGreeting(sock);
        };
        sock.on("data", onData);
    });

    return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(channelPath, () => {
            resolve({
                path: channelPath,
                greetings,
                get connections() {
                    return sockets.size;
                },
                close: async () => {
                    for (const sock of sockets) {
                        sock.destroy();
                    }
                    await new Promise((res) => server.close(res));
                },
            });
        });
    });
}

// A throwaway entry-script file under its own tmp dir, at the relative path a fixture wants the
// preload to see as process.argv[1].
function writeEntry(relPath, body) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-t16-entry-"));
    tmpDirs.push(dir);
    const full = path.join(dir, relPath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, body);

    return full;
}

// The child polls rather than sleeping a fixed time: a fixed wait either flakes under load or pays
// its full cost on every run, and the negative cases need a SHORT deadline they must survive.
function pollingBody(varName, waitMs) {
    return `
        // Report on fd 2 only: fd 1 in the real server is the client's JSON-RPC stream.
        let waited = 0;
        const tick = setInterval(() => {
            const v = process.env.${varName};
            waited += 25;
            if (v || waited >= ${waitMs}) {
                clearInterval(tick);
                process.stderr.write("VAR=" + (v ?? "<unset>") + "\\n");
                process.exit(0);
            }
        }, 25);
    `;
}

// Runs one entry script as a real child process. The preload path is routed through
// buildChildEnv, exactly as mcpw.test.js's runWithPreload routes its own: the quoted
// file: URL node has to parse back out of NODE_OPTIONS is the delivery path's last mile, and
// composing it here by hand would never exercise the function a real launch actually uses.
function runEntry(entry, env, { preload = true, timeoutMs = 10000 } = {}) {
    let childEnv = { ...process.env };
    delete childEnv.NODE_OPTIONS;
    // buildChildEnv's own sanitizeEnv only drops DANGEROUS_ENV_VARS, never these -- so this scrub
    // stays even routed through it, or a stray VC_SECRETS_* left over in this test process would
    // leak into every child and these tests would start depending on the ambient environment.
    for (const key of Object.keys(childEnv)) {
        if (/^VC_SECRETS_/i.test(key)) {
            delete childEnv[key];
        }
    }
    if (preload) {
        // Seeded and deleted below, so that "the preload assigned it" stays observable: with the
        // launch's own initial token already in place the fixture would report that instead of
        // the delivery (mcpw.test.js's runWithPreload does the same).
        const composed = m.buildChildEnv(childEnv, {
            token: "seed-token-that-must-not-be-visible",
            envVar: env.VC_SECRETS_TOKEN_ENV,
            channelPath: env.VC_SECRETS_TOKEN_CHANNEL,
            nonce: env.VC_SECRETS_CHANNEL_NONCE,
            preloadPath: m.PRELOAD_PATH,
            targetPackage: env.VC_SECRETS_TARGET_PACKAGE,
            binName: env.VC_SECRETS_TARGET_BIN,
        });
        // Unguarded, as the source is. Were the name ever absent, buildChildEnv would have written
        // the seed under a key literally spelled "undefined", and that is exactly the key this
        // line then removes -- a `!== undefined` guard would skip it and hand the seed to the child.
        delete composed[env.VC_SECRETS_TOKEN_ENV];
        childEnv = composed;
    }
    // The caller's overrides land last, so a fixture can still steer what the child sees after
    // buildChildEnv has composed it. The `undefined` branch below is defence, not the mechanism:
    // node's spawn already omits an env key whose value is undefined (measured on v22.23.2 --
    // the child reports the key as absent, not as the string "undefined"), so the "malformed
    // target package" fixture would get an absent key with or without it.
    for (const [key, value] of Object.entries(env)) {
        if (value === undefined) {
            delete childEnv[key];
        } else {
            childEnv[key] = value;
        }
    }

    return new Promise((resolve) => {
        const child = spawn(process.execPath, [entry], { env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
        let out = "";
        let err = "";
        let timedOut = false;
        const timer = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);
        child.stdout.on("data", (d) => { out += d; });
        child.stderr.on("data", (d) => { err += d; });
        child.once("exit", (code) => {
            clearTimeout(timer);
            resolve({ out, err, code, timedOut });
        });
    });
}

function preloadEnv(stub, overrides = {}) {
    return {
        VC_SECRETS_TOKEN_CHANNEL: stub.path,
        VC_SECRETS_CHANNEL_NONCE: "right-nonce",
        VC_SECRETS_TOKEN_ENV: "SERVER_TOKEN",
        VC_SECRETS_TARGET_PACKAGE: "@vendor/server",
        VC_SECRETS_TARGET_BIN: "",
        ...overrides,
    };
}

const TARGET_ENTRY = "node_modules/@vendor/server/dist/index.js";

channelTest("a target process receives the token into the variable its own environment names, and writes nothing on fd 1", async () => {
    // Moved from a stub to the real createChannel: pushed before the child starts,
    // so `latest` serves it once the preload authenticates -- the delivery itself is now the
    // proof of the handshake that `stub.greetings` used to stand for.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce" });
    try {
        ch.push("delivered-token");
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { out, err } = await runEntry(entry, preloadEnv(ch));
        assert.match(err, /VAR=delivered-token/);
        assert.equal(out, "", "the preload must never write on fd 1");
    } finally {
        await ch.close();
    }
});

channelTest("preload: a wrong nonce is refused and nothing is assigned", async () => {
    // Faithful port of mcpw.test.js, against the real createChannel: a push BEFORE the
    // wrong-nonce child runs is what makes "nothing is assigned" a claim about the refusal rather
    // than about a token that was simply never sent. "a client presenting no nonce or a wrong one
    // is refused and gets no token" pins the same refusal at the channel's own API; this one pins
    // it at the process boundary the preload actually crosses.
    const refusals = [];
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce",
        onRefusal: (w) => refusals.push(w) });
    try {
        ch.push("delivered-token");
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 800));
        const { out, err } = await runEntry(entry, preloadEnv(ch, { VC_SECRETS_CHANNEL_NONCE: "wrong-nonce" }));
        assert.match(err, /VAR=<unset>/);
        assert.equal(out, "");
        assert.deepEqual(refusals, ["nonce"], "the refusal must be observable, or this test cannot fail");
    } finally {
        await ch.close();
    }
});

channelTest("a process that is not the target takes no action on either fd", async () => {
    const stub = await startRawSocketFixture((sock) => {
        sock.write(JSON.stringify({ token: "delivered-token" }) + "\n");
    });
    try {
        const entry = writeEntry("node_modules/some-other-pkg/dist/index.js", pollingBody("SERVER_TOKEN", 800));
        const { out, err } = await runEntry(entry, preloadEnv(stub));
        assert.match(err, /VAR=<unset>/);
        assert.equal(out, "");
        assert.ok(!/vc-secrets preload/.test(err));
        assert.equal(stub.connections, 0, "no connection at all, not merely no assignment");
    } finally {
        await stub.close();
    }
});

channelTest("a frame split across two writes is reassembled, not dropped", async () => {
    // A stream socket may split writes; "one chunk is one frame" works on every machine it is
    // tried on and fails as a silently ignored renewal.
    const stub = await startRawSocketFixture((sock) => {
        sock.write('{"tok');
        setTimeout(() => sock.write('en":"split-token"}\n'), 100);
    });
    try {
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { err } = await runEntry(entry, preloadEnv(stub));
        assert.match(err, /VAR=split-token/);
        assert.ok(!/unreadable/.test(err));
    } finally {
        await stub.close();
    }
});

channelTest("of frames coalesced into one write, the last one wins", async () => {
    const stub = await startRawSocketFixture((sock) => {
        sock.write('{"token":"first"}\n{"token":"second"}\n');
    });
    try {
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { err } = await runEntry(entry, preloadEnv(stub));
        assert.match(err, /VAR=second/);
    } finally {
        await stub.close();
    }
});

channelTest("an unreadable frame is reported on fd 2 without echoing any of it, and reading continues", async () => {
    const stub = await startRawSocketFixture((sock) => {
        sock.write('NOT-JSON-secret-prefix\n{"token":"after"}\n');
    });
    try {
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { out, err } = await runEntry(entry, preloadEnv(stub));
        assert.ok(err.includes("vc-secrets preload: unreadable channel frame, ignored"));
        // Node embeds the first ten characters of the input in a JSON SyntaxError, and on this
        // channel the input is a token.
        assert.ok(!err.includes("NOT-JSON"));
        assert.match(err, /VAR=after/);
        assert.equal(out, "");
    } finally {
        await stub.close();
    }
});

channelTest("a null frame is ignored, and reading continues", async () => {
    const stub = await startRawSocketFixture((sock) => {
        sock.write('null\n{"token":"after"}\n');
    });
    try {
        const entry = writeEntry(TARGET_ENTRY, pollingBody("SERVER_TOKEN", 5000));
        const { err, code } = await runEntry(entry, preloadEnv(stub));
        assert.match(err, /VAR=after/);
        assert.equal(code, 0);
    } finally {
        await stub.close();
    }
});

channelTest("an unreachable channel is reported on fd 2 and costs the renewal, never the process", async () => {
    // Nothing listens at this path.
    const entry = writeEntry(TARGET_ENTRY, 'setTimeout(() => process.stderr.write("MAIN RAN\\n"), 300);');
    const { out, err, code } = await runEntry(entry, preloadEnv({ path: stubChannelPath() }));
    assert.equal(code, 0, "an unhandled socket 'error' event ends the server process");
    assert.match(err, /MAIN RAN/);
    assert.match(err, /vc-secrets preload: channel error: \S/);
    assert.equal(out, "", "fd 1 is the client's JSON-RPC stream");
});

channelTest("the token receiver does not keep the server process alive", async () => {
    // Moved from a stub to the real createChannel: pushed before the child starts.
    // The old positive control (`stub.greetings.length === 1`) is replaced by the delivery
    // itself -- the entry now also polls and reports the variable, without exiting on it, so the
    // "MAIN DONE" / timedOut assertions this test is actually named for still run on their own
    // timing and are not raced by the poll's own exit(0).
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce" });
    try {
        ch.push("delivered-token");
        const entry = writeEntry(TARGET_ENTRY, `
            let waited = 0;
            const tick = setInterval(() => {
                const v = process.env.SERVER_TOKEN;
                waited += 25;
                if (v || waited >= 800) {
                    clearInterval(tick);
                    process.stderr.write("VAR=" + (v ?? "<unset>") + "\\n");
                }
            }, 25);
            setTimeout(() => process.stderr.write("MAIN DONE\\n"), 300);
        `);
        const { err, code, timedOut } = await runEntry(entry, preloadEnv(ch), { timeoutMs: 4000 });
        assert.equal(timedOut, false, "an un-unref'd socket keeps the server alive until the launcher goes away");
        assert.equal(code, 0);
        assert.match(err, /MAIN DONE/);
        assert.match(err, /VAR=delivered-token/, "positive control: the receiver WAS connected and assigned the token");
    } finally {
        await ch.close();
    }
});

channelTest("a missing or malformed target package costs the renewal, never the process", async () => {
    // A throw in a module loaded through --import exits 1 before the entry script runs (measured on
    // node 22), so a throwing matcher would end this process before "MAIN RAN" is ever written.
    // Moved from a stub to the real createChannel: `stub.connections === 0` is
    // replaced by the delivery itself -- the entry polls too. VAR=<unset> shows no token reached
    // the process; it does NOT distinguish "no connection was attempted" from "a connection
    // attempted but never authenticated", which the real channel exposes to no caller.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce" });
    try {
        ch.push("delivered-token");
        const entry = writeEntry(TARGET_ENTRY,
            'process.stderr.write("MAIN RAN\\n");' + pollingBody("SERVER_TOKEN", 300));
        for (const targetPackage of [undefined, ".*"]) {
            const { err, code } = await runEntry(entry, preloadEnv(ch, { VC_SECRETS_TARGET_PACKAGE: targetPackage }));
            assert.equal(code, 0);
            assert.match(err, /MAIN RAN/);
            assert.match(err, /VAR=<unset>/, "a malformed target package must never let the token through");
        }
    } finally {
        await ch.close();
    }
});

channelTest("importing the target module wakes no receiver; importing the preload does", async () => {
    // Both halves, because "wakes nothing" alone passes for a fixture that cannot observe a
    // receiver at all. Moved from a stub to the real createChannel: both
    // `stub.connections` assertions are dropped -- the VAR=<unset> / VAR=delivered-token
    // assertions already below them are the delivery itself, and the real channel exposes no
    // connection count to replace them with.
    const ch = await m.createChannel({ name: "s", scopeKey: "p1", nonce: "right-nonce" });
    try {
        ch.push("delivered-token");
        const entryA = writeEntry(TARGET_ENTRY,
            `import(${JSON.stringify(TARGET_URL)}).then(() => { ${pollingBody("SERVER_TOKEN", 800)} });`);
        const runA = await runEntry(entryA, preloadEnv(ch), { preload: false });
        assert.match(runA.err, /VAR=<unset>/);

        const entryB = writeEntry(TARGET_ENTRY,
            `import(${JSON.stringify(PRELOAD_URL)}).then(() => { ${pollingBody("SERVER_TOKEN", 5000)} });`);
        const runB = await runEntry(entryB, preloadEnv(ch), { preload: false });
        assert.match(runB.err, /VAR=delivered-token/);
    } finally {
        await ch.close();
    }
});

// ---------------------------------------------------------------------------------------------
// cmdLaunch — the oauth-branch tests that need a REAL bound channel, so they run under
// channelTest rather than plain `test` (see the bind-probe comments for channelTest and lockTest in
// test-support.mjs: a unix-domain-socket / filesystem-socket bind is refused here, and skipping is
// the expected outcome, not a signal). The tests that never reach createChannel at all are plain
// `test` calls: in this file, and the process-level ones in vc-secrets.test.mjs.
//
// Ported from mcpw.js's cmdRun and mcpw.test.js's own cmdRun test block: cmdRun(server, cfg, deps)
// becomes cmdLaunch(kind, name, cfg, deps), McpwError becomes VcSecretsError, MCPW_* becomes
// VC_SECRETS_*.
// ---------------------------------------------------------------------------------------------

channelTest("cmdLaunch: the oauth server is launched with the token, the channel and the preload", async () => {
    let seen = null;
    const handle = await launch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: (cmd, args, opts) => { seen = opts.env; return fakeChild(); },
    });
    try {
        assert.equal(seen.ADO_TOKEN, "cached");
        assert.equal(seen.VC_SECRETS_TOKEN_ENV, "ADO_TOKEN");
        assert.equal(seen.VC_SECRETS_TOKEN_CHANNEL, handle.channel.path);
        assert.match(seen.NODE_OPTIONS, /^--import "file:\/\/.*vc-secrets-preload\.mjs"$/);
        assert.ok(seen.VC_SECRETS_CHANNEL_NONCE?.length >= 20, "a guessable nonce is the only gate on Windows");
    } finally {
        await handle.dispose();
    }
});

channelTest("cmdLaunch: the channel directory is gone once the launch is disposed", async () => {
    const handle = await launch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: () => fakeChild(),
    });
    const dir = path.dirname(handle.channel.path);
    await handle.dispose();
    if (process.platform !== "win32") {
        assert.equal(fs.existsSync(dir), false);
    }
});

channelTest("cmdLaunch: dispose detaches the exit handler that removes the channel directory", async () => {
    // A delta, not a count: the runner has "exit" listeners of its own. Only the oauth path
    // installs this one, so it cannot be pinned from the plain cmdLaunch tests.
    const before = process.listenerCount("exit");
    const handle = await launch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        readCache: async () => ({ state: "valid", accessToken: "cached" }),
        spawnFn: () => fakeChild(),
    });
    assert.equal(process.listenerCount("exit"), before + 1);
    await handle.dispose();
    // Left attached, the closure holds a channel that is already closed, and each later launch in
    // this process adds another.
    assert.equal(process.listenerCount("exit"), before);
});

// Nothing here observes channel.push and no client ever connects, so delivery is NOT what this
// pins -- that is pinned at the channel's own level. What it pins is the re-entrancy guard.
channelTest("cmdLaunch: a slow renewal tick does not stack on the one still running", async () => {
    // Without the re-entrancy guard a tick that outlasts its interval -- the contended wait alone
    // runs to 45 s -- starts another one on top of it.
    let inFlight = 0, maxInFlight = 0, calls = 0;
    const handle = await launch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        spawnFn: () => fakeChild(),
        renewalTickMs: 5,
        readCache: async () => {
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            calls += 1;
            await new Promise((r) => setTimeout(r, 40));   // a tick far slower than its interval
            inFlight -= 1;

            return { state: "valid", accessToken: `t${calls}` };
        },
    });
    try {
        await new Promise((r) => setTimeout(r, 200));
        assert.ok(calls >= 2, `the renewal must actually run, ran ${calls}`);
        assert.equal(maxInFlight, 1, "overlapping ticks multiply the load on the backend least able to absorb it");
    } finally {
        await handle.dispose();
    }
});

channelTest("cmdLaunch: a tick with nothing attached is reported twice and then not again", async (t) => {
    // New coverage (source gap): mcpw.js's cmdRun and the flag it sets have no test in the source's
    // own suite. No client ever connects here, so the channel has no peers on any tick.
    //
    // readCache returns the SAME token every time, which is what a valid cache entry does -- cacheStatus
    // hands back the stored accessToken unchanged. The fixture used to return a new one per call, a
    // state no real entry can be in, and that is what made this test pass while the counter advanced
    // only on rotations: with a constant token the warnings never arrived at all, and the first one
    // would really have waited for the first mid-life refresh, about 48 minutes in.
    //
    // TWICE, and the difference between the two lines is the point. The first one's promise -- "it
    // will be handed over when the server connects" -- is true of a server that is merely still
    // starting. By the second tick it is the likeliest false statement in the session, because the
    // ordinary reason nothing connects is that no process ever matched the declared target; so the
    // second line says THAT rather than repeating the promise. From the third on it is silent: the
    // condition cannot change without a restart. Latching at one is what let the false promise
    // stand as the session's last word on the subject.
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    let calls = 0;
    const handle = await launch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        spawnFn: () => fakeChild(),
        renewalTickMs: 5,
        readCache: async () => { calls += 1; return { state: "valid", accessToken: "t" }; },
    });
    try {
        await new Promise((r) => setTimeout(r, 60));
        const first = stderr.filter((s) => s.includes("nothing is connected to the token channel"));
        const escalation = stderr.filter((s) => s.includes("no process has matched the declared target"));
        assert.ok(calls >= 3, `the renewal must run past the second tick for silence to mean anything, ran ${calls}`);
        assert.equal(first.length, 1, `expected exactly one first-tick warning, got ${first.length}`);
        assert.equal(escalation.length, 1, `expected exactly one escalation, got ${escalation.length}`);
        assert.match(escalation[0], /some-oauth-package/,
            "the escalation must name the target nothing matched, or it is not actionable");
    } finally {
        await handle.dispose();
    }
});

test("cmdLaunch: once something has attached, a later drop reports the silence but never the target diagnosis", async (t) => {
    // The escalation says no process ever matched the declared target. Once something has attached,
    // that sentence is false for the rest of the session -- and a client CAN drop while the launcher
    // lives, since the channel deletes it from the push set on close or error. Restarting the count
    // alone would only postpone the false line by two ticks, so what this pins is that the claim is
    // withdrawn: after a drop the first line returns, and the escalation never does. A scripted
    // peers() drives it: nothing attached, then attached, then gone again.
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    let peers = 0;
    const count = (needle) => stderr.filter((s) => s.includes(needle)).length;
    const waitFor = async (done, ms = 1000) => {
        const started = Date.now();
        while (Date.now() - started < ms && !done()) {
            await new Promise((r) => setTimeout(r, 5));
        }

        return done();
    };
    const handle = await launch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        spawnFn: () => fakeChild(),
        renewalTickMs: 5,
        readCache: async () => ({ state: "valid", accessToken: "t" }),
        createChannel: () => ({ path: "/tmp/not-a-real.sock", push: () => peers, peers: () => peers,
            close: async () => {}, removeSync: () => {} }),
    });
    try {
        assert.ok(await waitFor(() => count("nothing is connected to the token channel") === 1),
            `expected the first warning while nothing is attached: ${stderr.join("")}`);
        peers = 1;
        await new Promise((r) => setTimeout(r, 40));   // eight ticks with a client attached
        assert.equal(count("no process has matched the declared target"), 0,
            "a tick with something attached must not escalate");
        peers = 0;
        assert.ok(await waitFor(() => count("nothing is connected to the token channel") === 2),
            `the count must start over, so the first line is what a fresh drop reports: ${stderr.join("")}`);
        // Far past the second unattached tick, which is where the escalation would fire if the claim
        // were only being postponed rather than withdrawn.
        await new Promise((r) => setTimeout(r, 60));   // twelve further ticks with nothing attached
        assert.equal(count("no process has matched the declared target"), 0,
            `something did match, so that diagnosis must never be printed in this session: ${stderr.join("")}`);
    } finally {
        await handle.dispose();
    }
});

channelTest("cmdLaunch: a failed renewal is loud on fd 2, and does not disturb the session", async (t) => {
    // New coverage (source gap): mcpw.js's cmdRun renewal-failure branch has no test in the
    // source's own suite. The first readCache is the launch-time acquisition and must succeed, or
    // the session never starts; only the RENEWAL call fails, and the child must survive it untouched.
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd !== 2) {
            throw new Error(`unexpected fs.writeSync(${fd}, ...) in this test`);
        }
        stderr.push(str);

        return Buffer.byteLength(str);
    });
    const child = fakeChild();
    let killed = false;
    child.kill = () => { killed = true; };
    let calls = 0;
    const handle = await launch("servers", "s", CMD_LAUNCH_CFG, {
        childNodeVersion: () => "v20.11.0",
        spawnFn: () => child,
        renewalTickMs: 5,
        readCache: async () => {
            calls += 1;
            if (calls === 1) {
                return { state: "valid", accessToken: "initial" };
            }
            throw new Error("network down");
        },
    });
    try {
        await new Promise((r) => setTimeout(r, 30));
        assert.ok(stderr.some((s) => /renewal failed: network down/.test(s)));
        assert.equal(killed, false, "a failed renewal must not touch the child");
        assert.equal(child.listenerCount("close"), 1, "the session must still be intact");
    } finally {
        await handle.dispose();
    }
});

channelTest("cmdLaunch: an oauth reference and an ordinary secret both reach the child, and neither leaks on fd 1 or fd 2", async (t) => {
    // Replaces vc-secrets.test.mjs's deleted "cmdLaunch: an authorized oauth reference is refused,
    // and the secret beside it is still not leaked" -- that test's body asserted only the interim
    // rejection, never the leak its own title promised. This one drives the real path: a "secret:"
    // reference needs a real backend, so a stub "gpg" on PATH stands in for the actual tool
    // (gpg --decrypt just prints the plaintext), while the ciphertext file only has to EXIST for
    // makeSecretResolver's pre-check to proceed to it.
    // The stub stands in for gpg, so it stands in for nothing where gpg is not the backend this machine
    // selects: on win32 detectLocalBackend answers wcm, the stub on PATH is never consulted, and the
    // resolver reaches the real Credential Manager for a secret nobody stored there.
    if (m.detectLocalBackend(process.platform, process.env) !== "gpg") {
        t.skip("needs gpg to be the backend this machine selects -- the stub on PATH stands in for it");

        return;
    }
    const secretsHome = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-both-"));
    tmpDirs.push(secretsHome);
    const secretPath = path.join(secretsHome, "vc-secrets", "secrets", "user", "plain.gpg");
    fs.mkdirSync(path.dirname(secretPath), { recursive: true });
    fs.writeFileSync(secretPath, "ciphertext-placeholder");
    const binDir = stubBinary("gpg", '#!/bin/sh\nprintf %s "PLAIN-SECRET-VALUE"\n');

    const savedPath = process.env.PATH;
    const savedXdg = process.env.XDG_CONFIG_HOME;
    process.env.PATH = `${binDir}${path.delimiter}${savedPath}`;
    process.env.XDG_CONFIG_HOME = secretsHome;

    const stdout = [];
    const stderr = [];
    t.mock.method(fs, "writeSync", (fd, str) => {
        if (fd === 1) {
            stdout.push(str);
        } else if (fd === 2) {
            stderr.push(str);
        }

        return Buffer.byteLength(str);
    });
    const realErr = process.stderr.write.bind(process.stderr);
    // fd 2 has two routes and fs.writeSync is only one: cmdLaunch's timing line goes out through
    // process.stderr.write, which an fs.writeSync mock cannot see.
    // No matching process.stdout.write mock, deliberately: under `node --test` a test file is a
    // child process that reports its results to the parent over fd 1, so a mock there that does
    // not forward deletes neighbouring tests' results while the run still reports green.
    t.mock.method(process.stderr, "write", (...a) => { stderr.push(String(a[0])); return realErr(...a); });

    const cfg = {
        projectId: null,
        oauth: { ado: CMD_LAUNCH_OAUTH_DECL },
        secrets: { plain: { backend: "local", scope: "user", home: "user" } },
        servers: { both: { command: "npx", args: ["-y", "some-oauth-package"], scope: "user", home: "user",
            env: { ADO_TOKEN: "oauth:ado", OTHER: "secret:plain" } } },
    };

    let seen = null;
    let handle;
    try {
        handle = await launch("servers", "both", cfg, {
            childNodeVersion: () => "v20.11.0",
            readCache: async () => ({ state: "valid", accessToken: "TOKEN-VALUE" }),
            spawnFn: (cmd, args, opts) => { seen = opts.env; return fakeChild(); },
        });
        assert.equal(seen.OTHER, "PLAIN-SECRET-VALUE", "the secret must still reach the child beside the oauth token");
        assert.equal(seen.ADO_TOKEN, "TOKEN-VALUE", "the oauth token must reach the child too");
        const allOutput = [...stdout, ...stderr].join("");
        assert.doesNotMatch(allOutput, /PLAIN-SECRET-VALUE/);
        assert.doesNotMatch(allOutput, /TOKEN-VALUE/);
    } finally {
        await handle?.dispose();
        process.env.PATH = savedPath;
        if (savedXdg === undefined) {
            delete process.env.XDG_CONFIG_HOME;
        } else {
            process.env.XDG_CONFIG_HOME = savedXdg;
        }
    }
});
