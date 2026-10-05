import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as m from "../vc-secrets.mjs";
import { tmpDirs } from "../test-support.mjs";
import {
    launcherEnv, denyFs, CAN_DENY_BY_MODE, scopedPaths, trustedStateFor, seedTrust, CROSSING_SHAPE, crossingReport,
    vaultPaths, OAUTH_TENANT_ID, OAUTH_DECL, REGISTRATION_BLOCK, OAUTH_CLIENT_ID, EMPTY_DECL, authorizedOauthPaths,
    KV_PAT, KV_PAT_SHAPE, userServerPaths, trustCfg, NO_TRUST, namespaceCfg, POSIX_STUB_ONLY, namespaceRepo,
    keychainRecorder, runVerb, corruptTrustFile,
} from "../test-fixtures.mjs";

function crossingPaths(authorized) {
    const secret = { backend: "local" };
    if (authorized !== undefined) {
        secret.authorized = authorized;
    }

    return scopedPaths({
        user: { secrets: { "personal-pat": secret } },
        project: { projectId: "proj-x", servers: { gh: { command: "npx", args: ["-y", "gh-mcp"], env: { T: "secret:personal-pat" } } } },
    });
}

test("a project declaration cannot take a user-scope secret by naming it — the owner authorizes the shape", async () => {
    // The gate above this one does not cover it: what the MCP client approves is `node $VC_SECRETS run gh`,
    // and the declaration deciding what `gh` runs sits below that. So naming the secret is not consent.
    const cfg = m.loadConfig(crossingPaths(undefined));
    let called = false;
    await assert.rejects(
        () => m.resolveEnvEntries("gh", cfg, async () => { called = true; return "tok"; }),
        /not authorized to receive "personal-pat"/);
    assert.equal(called, false, "the backend must not be contacted for a launch that is refused");

    // The config still LOADS: doctor's job is to report this, which it cannot do if the load throws.
    const lines = crossingReport(cfg);
    const fail = lines.find((l) => l.startsWith("FAIL") && l.includes('server "gh"'));
    assert.ok(fail, `expected a FAIL naming the server, got:\n${lines.join("\n")}`);
    assert.match(fail, /not authorized/);
    // The block to paste, not advice about it: a reader translating a description into JSON is a reader
    // given one more way to get it wrong.
    assert.match(fail, /"command": "npx"/);
    assert.match(fail, /"envKeys": \[\s*"T"\s*\]/);
    assert.match(fail, /authorized\.servers/);
});

test("an authorized shape passes, and its authorization is reported rather than silent", async () => {
    const cfg = m.loadConfig(crossingPaths({ servers: { gh: CROSSING_SHAPE } }));
    assert.deepEqual((await m.resolveEnvEntries("gh", cfg, async () => "tok")).env, { T: "tok" });

    const lines = crossingReport(cfg);
    assert.ok(lines.some((l) => l.startsWith("INFO") && l.includes('server "gh"') && l.includes("personal-pat")),
        `expected the authorized crossing to be reported, got:\n${lines.join("\n")}`);
});

test("changing the command behind an authorized name stops the launch — the attack the shape exists for", async () => {
    // An agent rewriting the project declaration keeps the approved NAME and swaps what runs under it.
    // Nothing in the client notices: `.mcp.json` still says `run gh`.
    const paths = scopedPaths({
        user: { secrets: { "personal-pat": { backend: "local", authorized: { servers: { gh: CROSSING_SHAPE } } } } },
        project: { projectId: "proj-x", servers: { gh: { command: "printenv", args: [], env: { T: "secret:personal-pat" } } } },
    });
    const cfg = m.loadConfig(paths);
    await assert.rejects(() => m.resolveEnvEntries("gh", cfg, async () => "tok"), /authorized for a different shape/);

    const fail = crossingReport(cfg).find((l) => l.startsWith("FAIL") && l.includes('server "gh"'));
    assert.ok(fail);
    assert.match(fail, /command is "printenv", authorized "npx"/);
});

test("doctor names the file and the path to paste into, and which of the two it is", () => {
    const lines = m.doctorReport(m.loadConfig(vaultPaths(undefined)), {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
    });
    const fail = lines.find((l) => l.startsWith("FAIL") && l.includes('task "build"'));
    assert.ok(fail, lines.join("\n"));
    assert.match(fail, /vaults\."victim-prod"\."db-password"/);
    assert.match(fail, /"command": "printenv"/);
});

test("a launchable named after an Object.prototype member is refused, and doctor still reports", async () => {
    // LAUNCHABLE_NAME_RE allows `toString`, `constructor`, `__proto__`. The authorization blocks come from
    // JSON.parse, so a plain bracket read returned the inherited builtin instead of undefined: it passed
    // the "is it authorized" test and then threw inside the shape comparison. One such name in a committed
    // declaration took the entire doctor report down — a diagnostic that dies on the config it exists to
    // diagnose is worse than the finding it was hiding.
    for (const hostile of ["toString", "constructor", "__proto__", "hasOwnProperty", "valueOf"]) {
        const cfg = m.loadConfig(scopedPaths({
            user: { secrets: { pat: { backend: "local", authorized: { servers: {} } } } },
            project: { projectId: "demo", servers: {
                [hostile]: { command: "x", args: [], env: { T: "secret:pat" } },
                healthy: { command: "y", args: [], env: { U: "literal:u" } },
            } },
        }));
        await assert.rejects(() => m.resolveEnvEntries(hostile, cfg, async () => "v"), /not authorized/, hostile);

        const lines = m.doctorReport(cfg, {
            env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
            resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
        });
        assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes(hostile)), `${hostile}: ${lines.join("\n")}`);
    }
});

test("doctor does not report a valid oauth reference as an undeclared secret", () => {
    // The undeclared-reference check looked only in cfg.secrets; an oauth ref must be looked up in
    // cfg.oauth or every correct config reports a FAIL.
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL },
        servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: "oauth:ado" } } } } }));
    const lines = crossingReport(cfg);
    assert.doesNotMatch(lines.join("\n"), /undeclared/);
    // And the positive control: an oauth ref to a name NOT declared is reported under its own kind.
    const bad = m.loadConfig(scopedPaths({ project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL },
        servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: "oauth:nope" } } } } }));
    assert.match(crossingReport(bad).join("\n"), /undeclared oauth "nope"/);
});

test("doctorReport: a clash is a finding, so the run cannot also say it has nothing to report", () => {
    // Hand-built with no `files`, the only shape in which the nothing-to-report gate can fire at all —
    // which makes this the one test that pins the clash loop's PLACEMENT before that gate.
    const cfg = { projectId: "p", servers: {}, oauth: { ado: { scope: "project" } },
        secrets: { "oauth-ado-refresh": { backend: "local", scope: "project" } } };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
    });
    assert.match(lines.join("\n"), /^WARN oauth "ado" /m);
    assert.doesNotMatch(lines.join("\n"), /nothing to report/);
});

test("doctorReport: an oversize access entry is a WARN beside the status, not instead of it", () => {
    // The two are independent facts and both have to be said. The status line reads "needs-refresh"
    // and is honestly an OK -- the next launch WILL renew. What it cannot say is that it will do so
    // EVERY time and pay a refresh-token rotation for it, which is the only thing the developer
    // could act on. So the WARN must accompany the OK rather than replace it.
    //
    // WARN and not FAIL: nothing is broken, nothing is lost, and a FAIL exits 1 -- it would redden
    // every run on an affected machine over a condition with no local remedy.
    const cfg = { projectId: "p", servers: {}, secrets: {},
        oauth: { "ado-dev": { scope: "user", home: "user" } } };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "win32", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
        oauthStatus: { "ado-dev": "needs-refresh" },
        oauthOversize: { "ado-dev": { backend: "wcm", bytes: 2588, limit: 2560 } },
    });
    const text = lines.join("\n");
    assert.match(text, /^OK oauth "ado-dev" \(user\) signed in -- the access token is stale/m,
        "the status line must survive");
    assert.match(text, /^WARN oauth "ado-dev": the access entry does not fit Credential Manager \(2588 bytes, limit 2560\)\./m);
    assert.match(text, /rotates the refresh token/, "and must say what it is costing");
    assert.doesNotMatch(text, /^FAIL/m, "an unactionable condition may not exit 1");
    // The store named in words. "wcm" is an internal id and this line is read by whoever decides
    // whether the DPAPI contingency is now worth building.
    assert.doesNotMatch(text, /\bwcm\b/);
});

test("doctorReport: no marker means no line, so a healthy machine reads exactly as before", () => {
    const cfg = { projectId: "p", servers: {}, secrets: {},
        oauth: { "ado-dev": { scope: "user", home: "user" } } };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "win32", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
        oauthStatus: { "ado-dev": "needs-refresh" },
    });
    assert.doesNotMatch(lines.join("\n"), /does not fit/);
});

test("doctorReport: a colliding oauth entry key is a WARN and does not fail the run", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-refresh": { backend: "local" } } } }));
    const lines = crossingReport(cfg);
    assert.match(lines.join("\n"), /^WARN oauth "ado" .*same keystore key/m);
    assert.doesNotMatch(lines.join("\n"), /^FAIL/m);
});

test("readWiredServers: a documented knob is not wiring, while the documented entry still is", () => {
    // Two grammars answered "is this server wired through us", and only one carried the `(?![A-Z_])`
    // its own comment calls load-bearing. Without it a server that merely passes VC_SECRETS_TIMING
    // reads as wired -- the false POSITIVE direction, which flips the legacy-token line from "still
    // required" to "remove it": advice to delete a credential that is still live.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-wired-"));
    tmpDirs.push(dir);
    const file = path.join(dir, ".mcp.json");
    fs.writeFileSync(file, JSON.stringify({ mcpServers: {
        knobOnly: { command: "env", args: ["VC_SECRETS_TIMING=1", "node", "server.js"] },
        documented: { command: "node", args: ["${VC_SECRETS}", "run", "ado"] },
    } }));
    const wired = m.readWiredServers(file);
    assert.equal(wired.has("documented"), true,
        "`${VC_SECRETS}` must still read as wired -- `}` is not [A-Z_], which is why the lookahead is safe here");
    assert.equal(wired.has("knobOnly"), false, "a documented knob is not a wiring");
});

test("doctor's readers report a file they could not read, and stay silent on one that is absent", (t) => {
    // They decide from the read's own error. The existsSync pre-check they used called an unstattable
    // file absent, which silenced exactly the unreadable case each of them exists to report.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-doctor-read-"));
    tmpDirs.push(dir);
    const denied = path.join(dir, "denied.json");
    const absent = path.join(dir, "absent.json");
    denyFs(t, "readFileSync", denied);
    const readers = {
        readEnableLists: (file, problems) => m.readEnableLists(file, problems),
        readWiredServers: (file, problems) => m.readWiredServers(file, null, null, problems),
        readWiredElsewhere: (file, problems) => m.readWiredElsewhere([file], [], problems),
    };
    for (const [name, read] of Object.entries(readers)) {
        const problems = [];
        read(denied, problems);
        assert.equal(problems.length, 1, `${name}: ${JSON.stringify(problems)}`);
        assert.match(problems[0], /cannot be read/, name);
        const quiet = [];
        read(absent, quiet);
        assert.deepEqual(quiet, [], name);
    }
});

test("readEnableLists: a settings.local.json that exists but cannot be read is reported", () => {
    // The empty lists this returns are indistinguishable from a file that genuinely enables
    // nothing, and they decide which servers count as consuming a secret and which env keys the
    // file contributes -- so swallowing the failure made doctor answer both questions wrong rather
    // than say it could not look. readWiredServers, reading the very next file, already reported
    // its own; this one is the sibling that did not.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-enable-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "settings.local.json");
    fs.writeFileSync(file, "{ not json");
    const problems = [];
    assert.deepEqual(m.readEnableLists(file, problems), { enabled: [], disabled: [], envKeys: [] });
    assert.equal(problems.length, 1, `expected one problem, got ${JSON.stringify(problems)}`);
    assert.match(problems[0], /cannot be read/);
});

test("readEnableLists: a malformed settings.local.json is reported without its contents", () => {
    // This is the file whose env block the success path reads KEY NAMES from and never values, and
    // doctor renders every problem as a WARN line -- the output a developer pastes into an issue.
    // A JSON.parse message is built from a window of the source around the error position, so a
    // token that lost a quote is adjacent to the error by construction.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-enable-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "settings.local.json");
    fs.writeFileSync(file, '{"env":{"ADO_PAT":ghp_SUPERSECRETVALUE}}');
    const problems = [];
    m.readEnableLists(file, problems);
    assert.equal(problems.length, 1, `expected one problem, got ${JSON.stringify(problems)}`);
    assert.doesNotMatch(problems[0], /ghp_|SUPERSECRET/,
        `the parse failure carried file content out: ${problems[0]}`);
});

test("readEnableLists: an absent settings.local.json says nothing, because most projects have none", () => {
    // The distinction that keeps the report above worth reading. Reporting an optional file that
    // simply is not there would put a line in every healthy doctor run, and a warning everyone
    // learns to skip is worse than no warning.
    const problems = [];
    m.readEnableLists(path.join(os.tmpdir(), "vc-secrets-no-such-dir", "settings.local.json"), problems);
    assert.deepEqual(problems, []);
});

// ── the keystore write probe ────────────────────────────────────────────────────────────────────
//
// Ported from mcpw.js/mcpw.test.js (probeKeystoreWrite, writeProbeValue, WRITE_PROBE_NAME,
// WRITE_PROBED_BACKENDS, and the two doctorReport/cmdDoctor wiring points).
//
// One behavioural addition, small and deliberate: writeProbeKey has no counterpart in the source,
// which writes a bare WRITE_PROBE_NAME -- one probe entry per machine. Here the entry is scoped, so
// there is one per declared project. The key grammar does not force this (vc-secrets:user:<name>
// satisfies KEY_RE unconditionally); it is chosen so two projects' diagnostics cannot write over
// each other's slot, and it is pinned by "the probe writes AND deletes under the scope the config
// declares, in both directions".
//
// The other adaptation is mechanical: this package's keys are three segments
// (vc-secrets:<scope>:<name>) against the source's two, and it has no composeStdin, so the overhead
// is measured through buildLocalWrite(...).stdinCommand("") for the key the probe writes under. That
// overhead moves byte for byte with the length of USER, of cfg.projectId and of the name segment, so
// there is no correct constant and it is computed per call.
//
// Why the padding is sized from the key the probe writes under, rather than from the longest real
// oauth key, is argued where it is pinned: "the probe's value composes to exactly the limit under
// the key it writes under, for any cfg".

test("probeKeystoreWrite: gpg is not rehearsed, and that is a decision rather than an omission", async () => {
    let wrote = false;
    assert.equal(await m.probeKeystoreWrite({ backend: "gpg",
        write: async () => { wrote = true; } }), null);
    assert.equal(wrote, false);
    assert.deepEqual(m.WRITE_PROBED_BACKENDS, ["keychain", "wcm"], "the scope is pinned, not incidental");
});

test("probeKeystoreWrite: the value it actually writes is the boundary-sized one", async () => {
    // writeProbeValue being correct is not the same as the probe using it. Swapping the call back
    // for a short literal would leave the suite green -- and a short probe reports ok on precisely
    // the machine where a real refresh token overflows security(1)'s line buffer.
    // A MULTI-BYTE, deliberately synthetic login (not a real name -- this repo is public) for the
    // length of this test, so the assertion below distinguishes bytes from code units instead of
    // agreeing by accident the way an ASCII login would.
    const savedUser = process.env.USER;
    process.env.USER = "tëst-üser";
    let wrote = null;
    let line = null;
    try {
        await m.probeKeystoreWrite({ backend: "keychain",
            write: async (key, value) => { wrote = value; }, remove: async () => {} });
        const key = `${m.KEY_PREFIX}:user:${m.WRITE_PROBE_NAME}`;
        line = m.buildLocalWrite("keychain", key, process.env, { value: wrote }).stdinCommand(wrote);
    } finally {
        if (savedUser === undefined) { delete process.env.USER; } else { process.env.USER = savedUser; }
    }
    assert.notEqual(Buffer.byteLength(line), line.length,
        "the fixture must make the two units disagree, or this test cannot see the difference");
    // BYTES, because that is the unit security(1) counts and the unit production measures in
    // (Buffer.byteLength at both stdinCommand's own guard and writeProbeValue).
    assert.equal(Buffer.byteLength(line), m.SECURITY_LINE_LIMIT,
        `the probe wrote ${Buffer.byteLength(wrote ?? "")} bytes, composing to ${Buffer.byteLength(line)}; `
        + "the rehearsal must sit at the limit");
});

test("probeKeystoreWrite: Credential Manager is probed too, at the blob limit", async () => {
    // The platform whose store REFUSES an oversize value was the one `doctor` said nothing about, and
    // the refusal arrives after the authorization code is spent, which cannot be retried.
    let wrote = null;
    const status = await m.probeKeystoreWrite({ backend: "wcm",
        write: async (key, value) => { wrote = value; }, remove: async () => {} });
    assert.equal(status, "ok");
    // The literal, not the constant: asserting against WCM_BLOB_LIMIT passes for any value of it,
    // including a wrong one, and the number is a documented platform fact (CRED_MAX_CREDENTIAL_BLOB_SIZE).
    assert.equal(Buffer.byteLength(wrote), 2560,
        "a probe smaller than the limit passes on precisely the machine where a real entry would not fit");
    assert.equal(m.WCM_BLOB_LIMIT, 2560, "and the constant must still be the documented ceiling");
});

test("probeKeystoreWrite: a Credential Manager refusal is reported, not swallowed, and says whether it was the ceiling", async () => {
    const overLimit = await m.probeKeystoreWrite({ backend: "wcm", remove: async () => {},
        write: async () => { throw Object.assign(new m.VcSecretsError("win32err=1783"), { toolExitCode: 4 }); } });
    assert.match(overLimit.message, /1783/);
    assert.equal(overLimit.oversize, true, "exit 4 is the store refusing the size, which is what this probe measures");
    // Everything else reaches the same catch and used to be reported as the size limit too -- a locked
    // keychain, a sandbox, a timeout. The remedy for those has nothing to do with how big the value is.
    const locked = await m.probeKeystoreWrite({ backend: "wcm", remove: async () => {},
        write: async () => { throw Object.assign(new m.VcSecretsError("user interaction is not allowed"), { toolExitCode: 36 }); } });
    assert.equal(locked.oversize, false);
    assert.match(locked.message, /user interaction/);
});

test("doctorReport: the write-probe lines name the backend they probed", () => {
    const base = { env: {}, enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false };
    const okLine = m.doctorReport({ secrets: {}, servers: {}, oauth: {} },
        { ...base, platform: "win32", writeProbe: "ok" }).find((l) => l.includes("accepts a write"));
    assert.match(okLine, /wcm/, `must name the backend, got: ${okLine}`);
    const failLine = m.doctorReport({ secrets: {}, servers: {}, oauth: {} },
        { ...base, platform: "win32", writeProbe: { oversize: true, message: "win32err=1783" } })
        .find((l) => l.includes("rejected a write"));
    assert.match(failLine, /^FAIL wcm .*1783/, `must name the backend and the cause, got: ${failLine}`);
    // The size wording is reserved for the size refusal. Any other cause reaches the same branch, and
    // claiming the ceiling there sends the reader after a number that was never the problem.
    const lockedLine = m.doctorReport({ secrets: {}, servers: {}, oauth: {} },
        { ...base, platform: "win32", writeProbe: { oversize: false, message: "user interaction is not allowed" } })
        .find((l) => l.startsWith("FAIL wcm"));
    assert.doesNotMatch(lockedLine, /size limit/, `got: ${lockedLine}`);
    assert.match(lockedLine, /user interaction/, `must still carry the cause, got: ${lockedLine}`);
});

test("the probe writes AND deletes under the scope the config declares, in both directions", async () => {
    // Both branches in one test because the subject is the rule, not either site. And both SEAMS,
    // because the write key is the one that can do damage and the delete key is the one every other
    // probe test happens to observe: pointing `write` at some other key while leaving `removeEntry`
    // correct leaves the whole suite green, and models a doctor run that either strands a permanent
    // stray entry or overwrites a real secret with 4008 bytes of padding. The collision guard does
    // not cover that -- it keys on the probe NAME, so nothing else ties the name to the key written.
    const keysFor = async (cfg) => {
        const wrote = [];
        const removed = [];
        await m.probeKeystoreWrite({ backend: "keychain", cfg,
            write: async (key) => { wrote.push(key); }, remove: async (key) => { removed.push(key); } });

        return { wrote, removed };
    };
    for (const [cfg, scope, why] of [
        [{ projectId: "proj1", secrets: {}, oauth: {} }, "proj1", "a declared project scopes the probe to it"],
        [{ secrets: {}, oauth: {} }, "user", "and no project falls back to user scope"],
    ]) {
        const expected = [`${m.KEY_PREFIX}:${scope}:${m.WRITE_PROBE_NAME}`];
        const { wrote, removed } = await keysFor(cfg);
        assert.deepEqual(wrote, expected, `${why} -- on the WRITE`);
        assert.deepEqual(removed, expected, `${why} -- and the delete must match it exactly`);
    }
});

test("probeKeystoreWrite: a refused write is reported, and cleanup still runs", async () => {
    // The point of the rehearsal: this must surface at setup, not during a token rotation in
    // the middle of a session, where nothing is watching and the session simply dies.
    const removed = [];
    const status = await m.probeKeystoreWrite({ backend: "keychain",
        write: async () => { throw new m.VcSecretsError("security exited 1: interaction required"); },
        remove: async (key) => { removed.push(key); } });
    assert.match(status.message, /interaction required/);
    assert.equal(status.oversize, false, "an interaction prompt is not the ceiling, and must not be reported as one");
    assert.deepEqual(removed, [`${m.KEY_PREFIX}:user:${m.WRITE_PROBE_NAME}`]);
    // 4 is the Credential Manager helper's own code for an oversize blob and means nothing to
    // `security`. Classifying on the number alone would report an unrelated keychain failure as the
    // ceiling -- and the keychain cannot hit a size ceiling here anyway, since the probe value is
    // built to land exactly on the command-line limit while the guard refuses only what exceeds it.
    const sameCodeElsewhere = await m.probeKeystoreWrite({ backend: "keychain", remove: async () => {},
        write: async () => { throw Object.assign(new m.VcSecretsError("security exited 4: unrelated"), { toolExitCode: 4 }); } });
    assert.equal(sameCodeElsewhere.oversize, false);
});

test("probeKeystoreWrite: a failing cleanup does not turn a good write into a bad verdict", async () => {
    const status = await m.probeKeystoreWrite({ backend: "keychain",
        write: async () => {}, remove: async () => { throw new m.VcSecretsError("delete failed"); } });
    assert.equal(status, "ok", "the probe's verdict is about the write, not the cleanup");
});

// cmdDoctor driven in-process through its `deps` seam. The repository is found the way a run finds it, the
// environment's HOME and XDG_CONFIG_HOME are fixtures (the developer's own ~/.claude.json and trust file are
// never read), the report is captured instead of written to stderr, and `exit` records instead of ending the
// run. Every collaborator that reaches the keystore, the network or a child process is stubbed by default;
// a test overrides the ones its case is about.
function doctorEnv() {
    return launcherEnv({ VC_SECRETS_LOCAL_BACKEND: "keychain" });
}

function doctorRepo(project) {
    const env = doctorEnv();
    const root = namespaceRepo(project);

    return { env, root, cfg: m.loadConfig(m.configPaths(env, root)) };
}

async function runDoctor({ cfg, env }, deps = {}) {
    let text = "";
    let exitCode = null;
    await m.cmdDoctor(cfg, [], {
        env,
        backend: "keychain",
        commandOnPath: () => true,
        resolver: Object.assign(async () => "value", { resolvedValues: [] }),
        readLegacyLocalValue: async () => null,
        probeKeystoreWrite: async () => null,
        oauthLaunchDeps: () => ({ readCache: async () => ({ state: "absent" }) }),
        oauthTenantChecks: async () => [],
        childNodeProbes: () => [],
        write: (chunk) => { text += chunk; },
        exit: (code) => { exitCode = code; },
        ...deps,
    });

    return { text, exitCode };
}

test("cmdDoctor: a resolver that threw is never recorded as a secret that was never set", async () => {
    // doctorReport's fallback branch prints "run vc-secrets set <name> (local) or check az login
    // (keyvault)" -- the advice for a secret nobody configured. A throw is a different event, and an
    // error carrying no message arrived at that branch through `false`, sending the developer to
    // repair a configuration that may be correct. Both kinds of throw are driven: a fix for the
    // message-less one must not send an error that has a message down the same branch.
    const repo = doctorRepo({ projectId: "proj-x", secrets: { tok: { backend: "local" }, pat: { backend: "local" } } });
    seedTrust(repo.env, repo.root);
    const resolver = Object.assign(async (name) => {
        throw name === "tok" ? new Error() : new Error("resolver-sentinel-reason");
    }, { resolvedValues: [] });

    const { text } = await runDoctor(repo, { resolver });

    assert.match(text, /FAIL secret "tok" not resolvable -- the resolver threw without naming a reason/, text);
    assert.match(text, /FAIL secret "pat" not resolvable -- resolver-sentinel-reason/, text);
    assert.doesNotMatch(text, /vc-secrets set (tok|pat)/, `a throw must not be reported as the absent-secret case:\n${text}`);
});

test("cmdDoctor: the write probe is actually wired to the report, not merely available", async () => {
    // Both halves were tested and the seam between them was not: replacing the probe call in
    // cmdDoctor with a literal null would leave the suite green. The probe also has to be handed the
    // config, or its own guard against a declared secret of the probe's name checks nothing.
    const repo = doctorRepo({ projectId: "proj-x", secrets: {} });
    const seen = [];
    const probeKeystoreWrite = async (options) => {
        seen.push(options);

        return { oversize: false, message: "probe-sentinel-message" };
    };

    const { text } = await runDoctor(repo, { probeKeystoreWrite });

    assert.equal(seen.length, 1, "the probe runs once");
    assert.equal(seen[0].cfg, repo.cfg, "and is handed the config itself");
    assert.match(text, /FAIL keychain refused a write -- .*probe-sentinel-message/, text);
});

test("probeKeystoreWrite: a declared secret of the probe's name is not overwritten", () => {
    // The probe writes then deletes. If someone declares a secret called vc-secrets-writeprobe, a
    // diagnostic would destroy the very thing it was asked to check on.
    const cfg = { secrets: { "vc-secrets-writeprobe": { backend: "local" } }, servers: {} };

    return m.probeKeystoreWrite({ backend: "keychain", cfg,
        write: async () => { throw new Error("must not be called"); } })
        .then((status) => assert.equal(status, null));
});

test("doctorReport: the write probe is reported in both directions, naming the backend", () => {
    // The platform is part of the fixture: the line names the backend it probed, and a report that
    // says "keychain" on Windows sends the reader to the wrong store.
    const cfg = { secrets: {}, servers: {}, oauth: {} };
    const base = { env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false };
    const ok = m.doctorReport(cfg, { ...base, platform: "darwin", oauthStatus: {}, writeProbe: "ok" });
    assert.ok(ok.some((l) => l.startsWith("OK keychain accepts")), ok.join("\n"));
    const bad = m.doctorReport(cfg, { ...base, platform: "darwin",
        writeProbe: { oversize: false, message: "interaction required" } });
    const fail = bad.find((l) => l.startsWith("FAIL"));
    assert.match(fail, /login/, "the line must say what the developer loses, not just that a write failed");
    // A platform where the probe does not run must stay SILENT rather than report a passing check it
    // never made -- the difference between "verified" and "not applicable". base is linux, so gpg.
    assert.equal(m.doctorReport(cfg, base)
        .some((l) => /accepts a write|rejected a write|refused a write/.test(l)), false);
});

test("writeProbeValue: the probe writes the largest value the path will ever carry", () => {
    // A short probe passes on exactly the machine where a real refresh token overflows, so it
    // would certify the one write it exists to catch. No oauth entry declared, so this exercises
    // the probe's-own-key fallback at user scope.
    const cfg = { secrets: {}, oauth: {} };
    const env = { USER: "dev" };
    const key = `${m.KEY_PREFIX}:user:${m.WRITE_PROBE_NAME}`;
    const value = m.writeProbeValue(cfg, env);
    const line = m.buildLocalWrite("keychain", key, env, { value }).stdinCommand(value);
    assert.equal(Buffer.byteLength(line), m.SECURITY_LINE_LIMIT,
        "the rehearsal must sit exactly at the boundary it is rehearsing");
});

test("the probe's value composes to exactly the limit under the key it writes under, for any cfg", () => {
    // Named after the RULE, not a call site, because the rule is what a later change will be tempted
    // to undo. A round of this port sized the padding from the longest REAL oauth key instead, on the
    // reasoning that the probe should rehearse the largest real entry. That reasoning is wrong twice
    // over: the limit is a property of the composed LINE, not of the key, so same-key sizing already
    // puts every key at the same rehearsal; and when the real key is the SHORTER one the value
    // overflows the probe's own budget, writeSecretValue's guard refuses it, and doctor reports FAIL
    // on a machine with nothing wrong. "ado" is the first fixture below because it is the only oauth
    // name in README.md, so that FAIL was the documented configuration's default outcome.
    const env = { USER: "abcde" };
    for (const oauth of [{ ado: { scope: "project" } },                      // shorter than the probe's key
                         { "a-very-long-mcp-server-name": { scope: "project" } },   // longer
                         {}]) {                                             // none declared at all
        const cfg = { projectId: "proj1", secrets: {}, oauth };
        const key = `${m.KEY_PREFIX}:${cfg.projectId}:${m.WRITE_PROBE_NAME}`;
        const value = m.writeProbeValue(cfg, env);
        // stdinCommand THROWS when the line is over the limit, so this call is itself half the
        // assertion: a regression cannot reach the equality below.
        const line = m.buildLocalWrite("keychain", key, env, { value }).stdinCommand(value);
        assert.equal(Buffer.byteLength(line), m.SECURITY_LINE_LIMIT,
            `oauth=${JSON.stringify(oauth)}: the rehearsal must sit exactly at the limit under the `
            + `key the probe writes under, got ${Buffer.byteLength(line)} for a ${Buffer.byteLength(value)}-byte value`);
    }
});

test("doctorReport: legacy env var phase-aware, names only", () => {
    // clientConfigsSeen names the phase this test is about. "Nothing wired" alone no longer implies a
    // pending switch — it also covers "nothing was inspected", where no claim about a switch is
    // available, so the input has to state which of the two it is.
    const base = { platform: "linux", enableLists: { enabled: [], disabled: [] }, resolvable: {}, skipped: [], toolsMissing: [], configDirOverride: false, clientConfigsSeen: ["/repo/.mcp.json"] };
    const pre = m.doctorReport({ secrets: {}, servers: {} },
        { ...base, env: { ADO_MCP_AUTH_TOKEN: "SENTINEL-DO-NOT-PRINT" }, wired: new Set() });
    assert.ok(pre.some((l) => l.startsWith("INFO") && l.includes("ADO_MCP_AUTH_TOKEN") && l.includes("until the vc-secrets switch")));
    const post = m.doctorReport({ secrets: {}, servers: {} },
        { ...base, env: { ADO_MCP_AUTH_TOKEN: "SENTINEL-DO-NOT-PRINT" }, wired: new Set(["azure-mcp"]) });
    assert.ok(post.some((l) => l.startsWith("WARN") && l.includes("remove it")));
    assert.ok(![...pre, ...post].some((l) => l.includes("SENTINEL-DO-NOT-PRINT")), "values must never appear");
});

test("doctorReport: skipped keyvault, missing tools, config override, dangling refs", () => {
    const cfg = { secrets: { "ado-pat": { backend: "local" } },
        servers: { s: { command: "x", args: [], env: { A: "secret:ghost", B: "literal:fine" } } } };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux",
        enableLists: { enabled: [], disabled: [] },
        resolvable: { "ado-pat": false }, skipped: ["azure-monitor-sp"],
        toolsMissing: ["gpg"], wired: new Set(), configDirOverride: true,
    });
    assert.ok(lines.some((l) => l.startsWith("SKIP") && l.includes("azure-monitor-sp")));
    assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes("ado-pat")));
    assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes("gpg") && l.includes("PATH")));
    assert.ok(lines.some((l) => l.includes("VC_SECRETS_CONFIG_DIR")));
    assert.ok(lines.some((l) => l.includes('undeclared secret "ghost"')));
});

test("doctorReport: prototype-chain secret name → still flagged as undeclared", () => {
    const cfg = { secrets: {}, servers: { s: { command: "x", args: [], env: { A: "secret:constructor" } } } };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false,
    });
    assert.ok(lines.some((l) => l.includes('undeclared secret "constructor"')),
        "a prototype-reachable name must not be mistaken for a declared secret");
});

test("doctorReport: invalid VC_SECRETS_LOCAL_BACKEND reported, not thrown", () => {
    const lines = m.doctorReport({ secrets: {}, servers: {} }, {
        env: { VC_SECRETS_LOCAL_BACKEND: "vault9000" }, platform: "linux",
        enableLists: { enabled: [], disabled: [] }, resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false,
    });
    assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes("VC_SECRETS_LOCAL_BACKEND")));
});

test("doctorReport: green output lists each secret", () => {
    const lines = m.doctorReport({ secrets: { "ado-pat": { backend: "local" } }, servers: {} }, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [] },
        resolvable: { "ado-pat": true }, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false,
    });
    assert.ok(lines.some((l) => l.startsWith("OK") && l.includes("ado-pat")));
});

test("doctorReport: resolvable carries per-secret failure reason (string) vs generic fallback (false)", () => {
    const base = { platform: "linux", enableLists: { enabled: [], disabled: [] }, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false };
    const withReason = m.doctorReport({ secrets: { "ado-pat": { backend: "local" } }, servers: {} }, {
        ...base, env: {}, resolvable: { "ado-pat": 'gpg exited 2 — if the gpg agent is locked, run "vc-secrets unlock" in a terminal' },
    });
    assert.ok(withReason.some((l) => l.startsWith("FAIL")
        && l.includes("ado-pat")
        && l.includes('run "vc-secrets unlock" in a terminal')));

    const withoutReason = m.doctorReport({ secrets: { "ado-pat": { backend: "local" } }, servers: {} }, {
        ...base, env: {}, resolvable: { "ado-pat": false },
    });
    assert.ok(withoutReason.some((l) => l.startsWith("FAIL")
        && l.includes("ado-pat")
        && l.includes("run \"vc-secrets set ado-pat\" (local) or check az login (keyvault)")));
});

test("doctorReport: undeclared secret referenced from a task is a FAIL naming the task", () => {
    const cfg = { secrets: {}, servers: {}, tasks: { loadtest: { command: "x", args: [], env: { X: "secret:ghost" } } } };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false,
    });
    assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes('task "loadtest"') && l.includes('undeclared secret "ghost"')));
});

test("doctorReport: a collision is a WARN naming both homes", () => {
    const cfg = { secrets: { "ado-pat": { backend: "local" } }, servers: {}, collisions: [{ kind: "secret", name: "ado-pat", from: "project", to: "local" }] };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [] },
        resolvable: { "ado-pat": true }, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false,
    });
    assert.ok(lines.some((l) => l.startsWith("WARN") && l.includes('"ado-pat"') && l.includes("project") && l.includes("local")));
});

test("doctorReport: a legacy-only secret is a WARN naming migrate, and not also a FAIL", () => {
    const cfg = { secrets: { "ado-pat": { backend: "local" } }, servers: {} };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [] },
        resolvable: { "ado-pat": false }, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false,
        legacyOnly: ["ado-pat"],
    });
    assert.ok(lines.some((l) => l.startsWith("WARN") && l.includes("ado-pat") && l.includes("migrate")));
    assert.ok(!lines.some((l) => l.startsWith("FAIL") && l.includes("ado-pat")));
});

test("doctorReport: a shim contract below REQUIRED_SHIM_CONTRACT is a WARN", () => {
    const cfg = { secrets: {}, servers: {} };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false,
        shimContract: m.REQUIRED_SHIM_CONTRACT - 1,
    });
    assert.ok(lines.some((l) => l.startsWith("WARN") && l.includes("install skill")));
});

test("doctorReport: a shim at contract 1 is told to reinstall, and the line names contract 2", () => {
    // The equality test above passes while both constants sit at 1, and the relative test above it passes
    // whatever they are. Contract 2 is what added the marketplace-restricted cache fallback to the shim, so
    // an install that kept its copied contract-1 shim must be told -- pinned by value, not by comparison.
    const cfg = { secrets: {}, servers: {} };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), configDirOverride: false,
        shimContract: 1,
    });
    assert.ok(lines.includes("WARN the installed shim speaks contract 1, this launcher expects 2 -- re-run the vc-secrets install skill"),
        lines.join("\n"));
    assert.equal(m.REQUIRED_SHIM_CONTRACT, 2);
});

test("cmdDoctor: a shim contract it is handed reaches the report", async () => {
    // The contract arrives as a value through deps, so the report is a function of its inputs; a
    // module-level slot written by runCli would carry one caller's contract into the next.
    const { text } = await runDoctor(doctorRepo(EMPTY_DECL), { shimContract: 1 });
    assert.match(text, /WARN the installed shim speaks contract 1, this launcher expects 2/);
});

test("cmdDoctor: with no shim contract it says nothing about the shim", async () => {
    const { text } = await runDoctor(doctorRepo(EMPTY_DECL));
    assert.doesNotMatch(text, /installed shim speaks contract/);
});

// The doctorReport shape the tests below share -- a single project-scope oauth entry, merged the way
// loadConfig actually produces one (home included), matching how the other doctorReport tests in this
// file build their cfg by hand rather than through loadConfig's file IO.
const OAUTH_DOCTOR_DECL = { ...OAUTH_DECL, scope: "project", home: "project", kind: "oauth", declaredName: "azure-mcp" };

// Authorized (a registrations block matching the server's shape): the crossing loop now reports an
// oauth reference exactly as it reports a secret's, and an unauthorized one here would add its own
// FAIL/INFO line that the status/tenant assertions below are not about and do not expect. The server
// also carries `home: "project"`, mirroring the `home: scope` that loadConfig's server merge stamps
// on every server -- without it the crossing INFO line below prints "(undefined)" instead of
// "(project)".
const OAUTH_DOCTOR_CFG = {
    secrets: {}, tasks: {},
    oauth: { "azure-mcp": OAUTH_DOCTOR_DECL },
    registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: {
        servers: { "azure-mcp": { command: "npx", args: ["-y"], envKeys: ["ADO_MCP_AUTH_TOKEN"] } } } } },
    servers: { "azure-mcp": { command: "npx", args: ["-y"], home: "project", env: { ADO_MCP_AUTH_TOKEN: "oauth:azure-mcp" } } },
};

// One probe entry in the shape doctorReport now consumes: doctor measures per launchable, because
// each declares its own command. `declared: false` is the wrapper case (the PATH node was probed),
// which is what the OAUTH_DOCTOR_CFG fixture's `npx` server produces.
function childNodeProbe(version, overrides = {}) {
    return { launchableName: "s", command: "npx", declared: false, version, ...overrides };
}

function oauthDoctorLines(overrides = {}) {
    return m.doctorReport(OAUTH_DOCTOR_CFG, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
        ...overrides,
    });
}

// ── oauth verdicts, the tenant check, and the child node floor ──────────────────────────────────
//

test("doctorReport: a signed-in entry reports OK", () => {
    const lines = oauthDoctorLines({ oauthStatus: { "azure-mcp": "ok" } });
    assert.ok(lines.some((l) => l.startsWith("OK") && l.includes("azure-mcp")), lines.join("\n"));
    assert.ok(!lines.some((l) => l.startsWith("FAIL")), lines.join("\n"));
});

test("doctorReport: sign-in-required is a normal state, not a FAIL", () => {
    // The state every developer is in before their first login. Reporting it as a failure makes a
    // working setup look broken, and the one thing doctor must not do is cry wolf on day one.
    const lines = oauthDoctorLines({ oauthStatus: { "azure-mcp": "signin-required" } });
    assert.ok(lines.some((l) => l.includes("vc-secrets login azure-mcp")), lines.join("\n"));
    assert.ok(!lines.some((l) => l.startsWith("FAIL")), lines.join("\n"));
});

test("doctorReport: an identity change is named, not reported as a first sign-in", () => {
    // Same remedy, different cause: a developer who signed in yesterday and is asked again needs to
    // know the DECLARATION moved under them, or the tool looks like it lost their token.
    const lines = oauthDoctorLines({ oauthStatus: { "azure-mcp": "identity-changed" } });
    const line = lines.find((l) => l.includes("azure-mcp"));
    assert.match(line, /declaration|tenant|client|scope/i);
    assert.ok(line.includes("vc-secrets login azure-mcp"));
    assert.ok(!lines.some((l) => l.startsWith("FAIL")), lines.join("\n"));
});

test("doctorReport: a needs-refresh verdict is reported as routine, not as a finding", () => {
    // doctor must not exchange, so "the next launch will renew this" is the honest report. Calling it
    // a problem would push the developer to log in again for a state that needs nothing.
    const lines = oauthDoctorLines({ oauthStatus: { "azure-mcp": "needs-refresh" } });
    assert.ok(!lines.some((l) => l.startsWith("FAIL") || l.includes("vc-secrets login")), lines.join("\n"));
    assert.ok(lines.some((l) => l.startsWith("OK") && /renew/i.test(l)), lines.join("\n"));
});

test("doctorReport: an oauth entry with a consumer says renewal reaches only a server that re-reads its variable", () => {
    // Renewal replaces the variable in the supervised launch's environment; a server that copied it at
    // startup never sees the new value. The report states that itself, with names only.
    const lines = oauthDoctorLines({ oauthStatus: { "azure-mcp": "ok" } });
    const info = lines.filter((l) => l.startsWith("INFO oauth \"azure-mcp\": a renewed token"));
    assert.equal(info.length, 1, lines.join("\n"));
    assert.match(info[0], /reaches server "azure-mcp" only if it reads ADO_MCP_AUTH_TOKEN from its environment at each use/);
    assert.match(info[0], /keeps its startup copy runs on it until it expires/);
});

test("doctorReport: the renewal caveat names a task as a task and is absent when nothing consumes the entry", () => {
    const taskCfg = {
        ...OAUTH_DOCTOR_CFG,
        servers: {},
        tasks: { sync: { command: "node", args: [], home: "project", env: { TOK: "oauth:azure-mcp" } } },
    };
    const base = { env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), oauthStatus: { "azure-mcp": "ok" } };
    const forTask = m.doctorReport(taskCfg, base).filter((l) => l.includes("a renewed token"));
    assert.equal(forTask.length, 1);
    assert.match(forTask[0], /reaches task "sync" only if it reads TOK from/);

    const unconsumed = m.doctorReport({ ...OAUTH_DOCTOR_CFG, servers: {} }, base);
    assert.ok(!unconsumed.some((l) => l.includes("a renewed token")), unconsumed.join("\n"));
});

test("doctorReport: a cache that cannot be read at all is a FAIL naming the entry", () => {
    const lines = oauthDoctorLines({ oauthStatus: { "azure-mcp": "keychain refused: -25308" } });
    assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes("azure-mcp") && l.includes("-25308")),
        lines.join("\n"));
});

test("doctorReport: a raw cache verdict handed in by mistake still prints no token", () => {
    // Passing oauthStatusFrom's OUTPUT here proves nothing -- it is the string "ok", so the assertion
    // holds for every possible implementation. The shape that could actually leak is the verdict
    // object itself, which is what a future caller would reach for.
    const lines = oauthDoctorLines({
        oauthStatus: { "azure-mcp": { state: "valid", accessToken: "SENTINEL-DO-NOT-PRINT" } } });
    assert.ok(!lines.some((l) => l.includes("SENTINEL-DO-NOT-PRINT")), lines.join("\n"));
});

test("doctorReport: a tenant mismatch is a FAIL naming the entry, the organisation and both tenants", () => {
    const lines = oauthDoctorLines({ oauthStatus: { "azure-mcp": "ok" },
        tenantChecks: [{ name: "azure-mcp", org: "org-a", declared: "aaa", bound: "bbb" }] });
    const line = lines.find((l) => /tenant/i.test(l));
    assert.ok(line.startsWith("FAIL"), line);
    for (const part of ["azure-mcp", "org-a", "aaa", "bbb"]) {
        assert.ok(line.includes(part), `${part} missing from: ${line}`);
    }
});

test("doctorReport: an unresolved org tenant is unknown, and names the organisation it asked about", () => {
    // Silence would read as a pass. And the organisation has to appear, because a MISTYPED one answers
    // with no binding header at all -- measured -- which is otherwise indistinguishable from a network
    // outage, so the config defect would never be noticed.
    const lines = oauthDoctorLines({
        tenantChecks: [{ name: "azure-mcp", org: "typo-org", declared: "aaa", bound: null }] });
    const line = lines.find((l) => /could not determine/i.test(l));
    assert.ok(line.startsWith("WARN"), line);
    assert.ok(line.includes("typo-org"), line);
    assert.ok(!lines.some((l) => l.startsWith("OK") && /tenant/i.test(l)),
        "an OK line about the tenant would claim a check that never completed");
});

test("doctorReport: two oauth entries both get their own tenant finding", () => {
    // A single overwritten verdict reports only the last, and says nothing about which entry it
    // belonged to.
    const lines = oauthDoctorLines({ tenantChecks: [
        { name: "one", org: "o1", declared: "aaa", bound: "zzz" },
        { name: "two", org: "o2", declared: "bbb", bound: null },
    ] });
    assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes("one")), lines.join("\n"));
    assert.ok(lines.some((l) => l.startsWith("WARN") && l.includes("two")), lines.join("\n"));
});

test("doctorReport: a tenant check with no consumer at all is not applicable, not a WARN that can never pass", () => {
    // org===null has more than one cause, and only this one is "nothing to check" -- a consumer that
    // exists but whose argv could not be read is a real misconfiguration, pinned by "doctorReport: a
    // consumer whose argv could not be read still warns, and is not folded into not applicable", and
    // folding both into one WARN would either silence that or turn this one into a WARN that can
    // never clear,
    // since nothing bound to an organisation exists to satisfy it.
    const lines = oauthDoctorLines({
        tenantChecks: [{ name: "azure-mcp", org: null, declared: "aaa", bound: null, applicable: false, reason: "no-consumer" }] });
    assert.match(lines.join("\n"), /INFO oauth "azure-mcp": nothing launches it -- the tenant check is not applicable/);
    assert.doesNotMatch(lines.join("\n"), /WARN oauth "azure-mcp"/);
});

test("doctorReport: a consumer whose argv could not be read still warns, and is not folded into not applicable", () => {
    // The other half of the org===null distinction: a consumer exists (applicable), organisationFromArgs
    // simply could not read it. Silence here -- or reporting it the same as "nothing launches it" --
    // would hide the one case doctor exists to catch: a tenant binding nobody can verify.
    const lines = oauthDoctorLines({
        tenantChecks: [{ name: "azure-mcp", org: null, declared: "aaa", bound: null, applicable: true }] });
    assert.match(lines.join("\n"), /WARN oauth "azure-mcp": could not determine/);
    assert.doesNotMatch(lines.join("\n"), /not applicable/);
});

test("doctorReport: a declaration outside Azure DevOps scope is not applicable, with its own line", () => {
    // Its own line, not the same one "no consumer at all" prints: the two are different facts (a
    // consumer exists here), and folding them together is the same defect as folding the WARN below
    // into either of them.
    const lines = oauthDoctorLines({
        tenantChecks: [{ name: "azure-mcp", org: null, declared: "aaa", bound: null, applicable: false, reason: "not-ado-scope" }] });
    assert.match(lines.join("\n"), /INFO oauth "azure-mcp": its scopes are not for Azure DevOps -- the tenant check is not applicable/);
    assert.doesNotMatch(lines.join("\n"), /nothing launches it/);
});

test("doctorReport: a not-applicable entry with no reason, or an unknown one, is a FAIL naming the check itself", () => {
    // The branch is over the two reasons oauthTenantChecks actually produces, not defaulted -- a third
    // reason added later, or a producer that forgets to set one, must not silently fall into whichever
    // wording a default happened to pick. That silent fallback is exactly the collapse this whole
    // not-applicable/reason split exists to prevent, re-entered through a default instead of a branch.
    for (const reason of [undefined, "some-future-reason"]) {
        const lines = oauthDoctorLines({
            tenantChecks: [{ name: "azure-mcp", org: null, declared: "aaa", bound: null, applicable: false, reason }] });
        assert.match(lines.join("\n"), /FAIL oauth "azure-mcp": not applicable for an unrecognised reason/,
            `reason=${reason}: ${lines.join("\n")}`);
    }
});

test("doctorReport: an oauth verdict names its declaration's winning home", () => {
    // loadConfig's merge overwrites whole oauth entries rather than accumulating them, so
    // cfg.oauth["azure-mcp"] is a single object -- with the scope that won the merge -- by the time
    // doctor sees it, and the verdict line names that scope.
    const cfg = m.loadConfig(scopedPaths({
        project: { projectId: "proj-x", oauth: { "azure-mcp": OAUTH_DECL } },
        local: { oauth: { "azure-mcp": OAUTH_DECL } },
    }));
    assert.equal(cfg.oauth["azure-mcp"].home, "local", "local is later in SCOPE_ORDER and wins the merge");
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
        oauthStatus: { "azure-mcp": "ok" },
    });
    const verdict = lines.find((l) => l.startsWith("OK") && l.includes("azure-mcp"));
    assert.ok(verdict, `expected a verdict line, got:\n${lines.join("\n")}`);
    assert.match(verdict, /\(local\)/);
});

test("doctorReport: a child node below the flag floor is a FAIL naming the floor", () => {
    const lines = oauthDoctorLines({ childNodes: [childNodeProbe("v18.17.1")] });
    assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes("18.18.0") && l.includes("v18.17.1")),
        lines.join("\n"));
});

test("doctorReport: a child node AT the floor is not a finding", () => {
    for (const version of ["v18.18.0", "v20.5.1", "v22.22.0"]) {
        const lines = oauthDoctorLines({ childNodes: [childNodeProbe(version)] });
        assert.ok(!lines.some((l) => l.startsWith("FAIL")), `${version}: ${lines.join("\n")}`);
    }
});

test("doctorReport: a child node that could not be run at all still names what it saw", () => {
    // "" reaches here from a node that exits 0 and prints nothing -- a spawn that fails outright now
    // returns its own reason instead. "" is not null, so the guard still fires, but "" IS the bug:
    // rendered bare it produces "reports , which predates", a blank slot where a version belongs.
    // `version || "no version"` in childNodeRefusal is what turns that blank into a word.
    const lines = oauthDoctorLines({ childNodes: [childNodeProbe("")] });
    const line = lines.find((l) => l.startsWith("FAIL"));
    assert.match(line, /no version/);
    assert.ok(!/reports , which/.test(line), line);
});

test("doctorReport: \"predates\" is said only where a version was actually read", () => {
    // The probe returns its own reason when it could not run, and that reason took the same sentence
    // as a real version -- "reports no usable version (ENOENT), which predates --import (18.18.0)"
    // asserts a comparison nothing performed, and sends the reader to upgrade a node that answered
    // fine. The failure is a wrong instruction, not a crash, so only the wording carries it.
    const old = oauthDoctorLines({ childNodes: [childNodeProbe("v18.17.1")] }).find((l) => l.startsWith("FAIL"));
    assert.match(old, /predates/, old);

    for (const unreadable of ["no usable version (ENOENT)", "no usable version (killed by SIGKILL)", ""]) {
        const line = oauthDoctorLines({ childNodes: [childNodeProbe(unreadable)] }).find((l) => l.startsWith("FAIL"));
        assert.ok(line, `a FAIL is still expected for ${JSON.stringify(unreadable)}`);
        assert.doesNotMatch(line, /predates/, line);
        assert.match(line, /not a version to compare/, line);
    }
});

test("doctorReport: each oauth launchable is judged by its own declared node, not one shared probe", () => {
    // The defect the launch path was fixed for, at its second site. doctor probed PATH once for the
    // whole config, so a server declaring its own node was judged by a binary it never runs -- and
    // doctor exits 1 on any FAIL, which makes the README's `doctor # expect no FAIL` setup gate
    // refuse a machine whose launch works. One entry per launchable is what makes the two agree.
    const lines = oauthDoctorLines({ childNodes: [
        childNodeProbe("v22.11.0", { launchableName: "modern", command: "/usr/local/bin/node", declared: true }),
        childNodeProbe("v18.17.1", { launchableName: "ancient", command: "/usr/bin/node", declared: true }),
        childNodeProbe("v18.17.1", { launchableName: "windows", command: "C:\\Program Files\\nodejs\\node.exe", declared: true }),
    ] });
    const fails = lines.filter((l) => l.startsWith("FAIL"));

    // One finding per failing launchable, and the passing one produces none: a single shared verdict
    // would either condemn `modern` or clear `ancient`, and both are the same bug seen from one side.
    assert.equal(fails.length, 2, `one per failing launchable: ${lines.join("\n")}`);
    assert.ok(fails.some((l) => l.includes('"ancient" (/usr/bin/node)')), fails.join("\n"));
    // A Windows command survives into the message verbatim -- backslashes are not a path this code
    // parses, only a string it reports, and the declaration travels between platforms.
    assert.ok(fails.some((l) => l.includes('"windows" (C:\\Program Files\\nodejs\\node.exe)')), fails.join("\n"));
    for (const line of fails) {
        assert.doesNotMatch(line, /modern/, "a passing launchable must not appear in another's finding");
        assert.doesNotMatch(line, /node on PATH/, "a declared node is named, not PATH");
    }
});

// A repository declaring a project-scope sign-in `ado` that the server `ado` reads, trusted for this
// checkout: the namespace gate would otherwise keep doctor from reading the sign-in at all.
function doctorOauthRepo() {
    const repo = doctorRepo({
        projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        servers: { ado: { command: process.execPath, args: ["-e", ""], env: { ADO_TOKEN: "oauth:ado" } } },
    });
    seedTrust(repo.env, repo.root);

    return repo;
}

test("cmdDoctor: the oauth checks are wired to the report, not merely available", async () => {
    // Both halves tested and the seam between them not: computing oauthStatus and forgetting to pass
    // it leaves every test above green while doctor reports nothing. Each of the three results is a
    // distinct line, so a dropped one is a missing line.
    const repo = doctorOauthRepo();
    const deps = {
        oauthLaunchDeps: () => ({ readCache: async () => ({ state: "valid" }) }),
        oauthTenantChecks: async () => [{ name: "ado", org: "tenant-check-org", declared: OAUTH_TENANT_ID,
            applicable: true, bound: null }],
        childNodeProbes: () => [{ launchableName: "child-probe-sentinel", command: "node", declared: true, version: "v1.0.0" }],
    };

    const { text } = await runDoctor(repo, deps);

    assert.match(text, /OK oauth "ado" \(project\) signed in/, `oauthStatus is computed but never passed:\n${text}`);
    assert.match(text, /could not determine the tenant of organisation "tenant-check-org"/,
        `tenantChecks is computed but never passed:\n${text}`);
    assert.match(text, /FAIL the node that runs "child-probe-sentinel"/, `childNodes is computed but never passed:\n${text}`);
});

test("cmdDoctor: the tenant checks it reports come from oauthTenantChecks, not a private copy of its loop", async () => {
    // A private copy of the loop in cmdDoctor would still print tenant lines, and would drift from the
    // function the tests above pin. So the printed tenant line must be the one this function returned.
    const repo = doctorOauthRepo();
    const calls = [];
    const oauthTenantChecks = async (...args) => {
        calls.push(args);

        return [{ name: "ado", org: "tenant-split-sentinel", declared: OAUTH_TENANT_ID, applicable: true, bound: null }];
    };

    const { text } = await runDoctor(repo, { oauthTenantChecks });

    assert.match(text, /could not determine the tenant of organisation "tenant-split-sentinel"/,
        `the reported tenant line is not the one oauthTenantChecks returned:\n${text}`);
    assert.equal(calls.length, 1, "called once");
    assert.equal(calls[0][0], repo.cfg, "with the config itself");
    assert.deepEqual(calls[0][1], m.oauthReferences(repo.cfg), "and the oauth references");
    assert.ok(calls[0][1].length > 0, "the fixture must carry a reference, or the argument proves nothing");
});

test("cmdDoctor: the oauth status read passes cfg through to oauthLaunchDeps, not a two-argument call", async () => {
    // A two-argument call is legal here too (cfg is a plain positional with no runtime
    // default), so a copy of the source's single-project call would compile and run for a user-scope
    // entry and throw for a project-scope one -- caught by cmdDoctor's own try/catch, but reported as
    // an opaque "Cannot read properties of undefined" instead of the sign-in state a developer could
    // act on.
    const repo = doctorOauthRepo();
    const calls = [];
    const oauthLaunchDeps = (...args) => {
        calls.push(args);

        return { readCache: async () => ({ state: "valid" }) };
    };

    await runDoctor(repo, { oauthLaunchDeps });

    assert.equal(calls.length, 1, "one entry, one read");
    assert.equal(calls[0][0], "ado");
    assert.equal(calls[0][2], repo.cfg,
        "the oauth status loop must pass cfg -- oauthEntryKeys needs it to build the namespaced key");
});

test("readEnableLists: the two arrays plus env key NAMES; missing file tolerated", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-lists-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, "settings.local.json"),
        JSON.stringify({ enabledMcpjsonServers: ["a"], disabledMcpjsonServers: ["b"], env: { SECRET: "never-read" } }));
    const parsed = m.readEnableLists(path.join(dir, "settings.local.json"));
    assert.deepEqual(parsed, { enabled: ["a"], disabled: ["b"], envKeys: ["SECRET"] });
    assert.ok(!JSON.stringify(parsed).includes("never-read"), "values must never leave the reader");
    assert.deepEqual(m.readEnableLists(path.join(dir, "nope.json")), { enabled: [], disabled: [], envKeys: [] });
});

test("readEnableLists: non-object env (null / array) yields no key names", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-lists-env-"));
    tmpDirs.push(dir);
    for (const env of [null, ["A"], "A"]) {
        fs.writeFileSync(path.join(dir, "settings.local.json"), JSON.stringify({ env }));
        assert.deepEqual(m.readEnableLists(path.join(dir, "settings.local.json")).envKeys, []);
    }
});

// The user-scope half of the same collision, for the report that is about authorization.
function collidingUserPaths(envValue) {
    return scopedPaths({
        user: { secrets: { ado: { backend: "local" } } },
        project: {
            projectId: "proj-x",
            oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: envValue } } },
        },
    });
}

test("doctorReport: a user-scope server refused a repository's Key Vault secret gets the block to paste, and a granted one does not", () => {
    // The refusal says "run vc-secrets doctor for the block to add"; doctor's crossing loop must apply the
    // predicate the launch applies, or that promise is empty for exactly this case.
    const report = (cfg) => m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
    });
    const repoDeclares = { projectId: "proj-x", secrets: { pat: KV_PAT } };
    const fail = report(m.loadConfig(userServerPaths({ project: repoDeclares })))
        .find((l) => l.startsWith("FAIL") && l.includes('server "s"'));
    assert.ok(fail, "doctor must report the refused crossing");
    assert.match(fail, /wants secret "pat" and is not authorized/);
    assert.match(fail, /vaults\."demo-vault"\."pat-secret"\.servers/);
    assert.match(fail, /"command": "printenv"/);

    const vaults = { "demo-vault": { "pat-secret": { servers: { s: KV_PAT_SHAPE } } } };
    const granted = report(m.loadConfig(userServerPaths({ user: { vaults }, project: repoDeclares })));
    assert.ok(!granted.some((l) => l.startsWith("FAIL")), granted.join("\n"));
    assert.ok(granted.some((l) => l.includes('server "s" (user) is authorized to receive "pat"')), granted.join("\n"));

    // Nothing to report when both sides are the user's.
    const own = report(m.loadConfig(userServerPaths({ user: { secrets: { pat: KV_PAT } }, project: { projectId: "proj-x" } })));
    assert.ok(!own.some((l) => l.includes('"pat"')), own.join("\n"));
});

test("an authorization refusal names the doctor command, and doctor's own report names the same where", async () => {
    // The rule this replaces two site-scoped tests for: doctor's crossing loop used to report secret
    // references only, so an oauth refusal naming "vc-secrets doctor" sent a reader to a command that
    // printed nothing about their case. crossingProblem is now the one predicate
    // behind both the refusal and the report, so the refusal's promise is checkable: pull the `where` it
    // names out of the message and confirm doctor's own output names that same string, for every shape
    // of refusal this package has -- both kinds, both reasons, and the one that is not resolveEnvEntries
    // at all.
    const whereFromMessage = (message) => {
        const found = / at (.+?) in ~\//.exec(message);
        assert.ok(found, `no "at <where> in ~/" found in: ${message}`);

        return found[1];
    };
    // `launchable` is the name each refusal's report line must ALSO carry, quoted, beside `where` --
    // without it "an oauth entry is not authorized" is satisfied by the unrelated point-3 INFO line
    // (which names the same `where` for a different reason: no registration block at all), so a
    // mutation that drops the crossing loop's oauth handling entirely reddens a different case than
    // the one it actually breaks, because that case's `where` is shared with the point-3 INFO line.
    // "login refuses ..." names no launchable -- nothing references that declaration -- so it is
    // left undefined and only `where` is required there.
    const cases = [
        {
            name: "a secret is not authorized",
            cfg: m.loadConfig(crossingPaths(undefined)),
            run: (cfg) => m.resolveEnvEntries("gh", cfg, async () => "x"),
            launchable: "gh",
        },
        {
            name: "a secret is authorized for a different shape",
            cfg: m.loadConfig(scopedPaths({
                user: { secrets: { "personal-pat": { backend: "local", authorized: { servers: { gh: CROSSING_SHAPE } } } } },
                project: { projectId: "proj-x",
                    servers: { gh: { command: "printenv", args: [], env: { T: "secret:personal-pat" } } } },
            })),
            run: (cfg) => m.resolveEnvEntries("gh", cfg, async () => "x"),
            launchable: "gh",
        },
        {
            name: "an oauth entry is not authorized",
            cfg: m.loadConfig(scopedPaths({
                project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL },
                    servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: "oauth:ado" } } } },
            })),
            run: (cfg) => m.resolveEnvEntries("s", cfg, async () => "x"),
            launchable: "s",
        },
        {
            name: "an oauth entry is authorized for a different shape",
            cfg: m.loadConfig(scopedPaths({
                user: { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK } } },
                project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL },
                    servers: { s: { command: "npx", args: ["-y", "a-different-package"], env: { ADO_TOKEN: "oauth:ado" } } } },
            })),
            run: (cfg) => m.resolveEnvEntries("s", cfg, async () => "x"),
            launchable: "s",
        },
        {
            name: "login refuses a project-scope declaration with no authorization block",
            cfg: m.loadConfig(scopedPaths({ project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL } } })),
            run: (cfg) => m.cmdLogin("ado", cfg),
        },
    ];

    for (const { name, cfg, run, launchable } of cases) {
        let message = null;
        await assert.rejects(() => run(cfg), (e) => {
            assert.ok(e instanceof m.VcSecretsError, `${name}: not a VcSecretsError: ${e}`);
            message = e.message;

            return true;
        }, name);
        assert.match(message, /vc-secrets doctor/, `${name}: refusal does not name the doctor command: ${message}`);
        const where = whereFromMessage(message);
        const reportLines = crossingReport(cfg);
        const hasLine = launchable === undefined
            ? reportLines.some((l) => l.includes(where))
            : reportLines.some((l) => l.includes(where) && l.includes(`"${launchable}"`));
        assert.ok(hasLine, `${name}: doctor's own report has no line for ${where}`
            + `${launchable ? ` naming "${launchable}"` : ""}:\n${reportLines.join("\n")}`);
    }
});

test("doctorReport: an oauth crossing is reported, and a launchable naming both kinds gets a line for each", () => {
    // Named after the rule, not the crossingProblem call site: "an authorization refusal names the
    // doctor command, and doctor's own report names the same where" reaches the oauth crossing
    // only through its FAIL lines, whose `where` point 3 also produces -- so it leaves the
    // authorized `INFO` line and the kind-keyed dedup unpinned. Both are honest value-mutants,
    // injected as a value, never a throw, so the surrounding catch cannot absorb it -- each with its
    // own positive control.

    // 1a: an authorized oauth crossing gets its own INFO line, exactly as a secret's does. A guard of
    // `if (ref.kind !== "oauth")` around the INFO push leaves the whole suite green without this.
    const okLines = crossingReport(m.loadConfig(authorizedOauthPaths()));
    assert.ok(okLines.some((l) => l.startsWith("INFO") && l.includes('server "s"') && l.includes('is authorized to receive "ado"')),
        `expected the authorized oauth crossing to be reported, got:\n${okLines.join("\n")}`);

    // An unauthorized oauth crossing gets the FAIL and the pasteable block, under the registrations
    // path -- the other half of the same behaviour, so the positive control above has a counterpart.
    const failCfg = m.loadConfig(scopedPaths({
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: "oauth:ado" } } } },
    }));
    const failLines = crossingReport(failCfg);
    const fail = failLines.find((l) => l.startsWith("FAIL") && l.includes('server "s"'));
    assert.ok(fail, `expected a FAIL naming the server, got:\n${failLines.join("\n")}`);
    assert.match(fail, /not authorized/);
    assert.match(fail, new RegExp(`registrations\\."${OAUTH_TENANT_ID}"\\."${OAUTH_CLIENT_ID}"\\.servers`));

    // 1b: a launchable naming both an oauth entry and a same-named secret gets a line for EACH -- the
    // dedup set is keyed by kind AND name, not name alone. Reverting the key to name-only leaves this
    // green too: whichever kind is iterated first suppresses the second, silently dropping one FAIL.
    const bothCfg = m.loadConfig(scopedPaths({
        user: { secrets: { ado: { backend: "local" } } },
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "npx", args: [],
                env: { ADO_TOKEN: "oauth:ado", ADO_PAT: "secret:ado" } } } },
    }));
    const bothLines = crossingReport(bothCfg);
    const crossingFails = bothLines.filter((l) => l.startsWith("FAIL") && l.includes('server "s"') && l.includes('"ado"'));
    assert.equal(crossingFails.length, 2,
        `expected one crossing line for each kind, got:\n${bothLines.join("\n")}`);
    assert.ok(crossingFails.some((l) => /registrations\./.test(l)),
        `expected an oauth crossing line, got:\n${bothLines.join("\n")}`);
    assert.ok(crossingFails.some((l) => /secrets\."ado"\.authorized/.test(l)),
        `expected a secret crossing line, got:\n${bothLines.join("\n")}`);
});

test("a DEL or C1 byte in a declared argument reaches neither the shape-difference refusal nor doctor's paste block raw", async () => {
    // JSON.stringify escapes C0 and leaves DEL and C1 raw; C1 includes the 8-bit CSI. Both surfaces print
    // the repository's declared text for a person to read -- doctor's is a block they are asked to paste.
    const cfg = m.loadConfig(scopedPaths({
        user: { secrets: { "personal-pat": { backend: "local", authorized: { servers: { gh: CROSSING_SHAPE } } } } },
        project: { projectId: "proj-x",
            servers: { gh: { command: "npx", args: ["-y", "gh\u009b31m\u007f"], env: { T: "secret:personal-pat" } } } },
    }));
    await assert.rejects(() => m.resolveEnvEntries("gh", cfg, async () => "x"), (e) => {
        assert.doesNotMatch(e.message, /[\u007f-\u009f]/, "no raw DEL or C1 in the refusal");
        assert.ok(e.message.includes('args are ["-y","gh\\u009b31m\\u007f"], authorized ["-y","gh-mcp"]'), e.message);

        return true;
    });
    const report = crossingReport(cfg).join("\n");
    assert.doesNotMatch(report, /[\u007f-\u009f]/, "no raw DEL or C1 in doctor's block");
    // Escaped, not flattened: the block still parses to the declared bytes, so pasting it authorizes the
    // declaration it was printed from.
    const start = report.search(/\{\s*\n\s*"gh": \{/);
    assert.ok(start !== -1, report);
    let pasted = null;
    for (let end = report.indexOf("}", start); end !== -1 && pasted === null; end = report.indexOf("}", end + 1)) {
        try {
            pasted = JSON.parse(report.slice(start, end + 1));
        } catch { /* not yet balanced */ }
    }
    assert.deepEqual(pasted?.gh?.args, ["-y", "gh\u009b31m\u007f"]);
});

test("doctorReport: an oauth reference sharing a user-scope secret's name reports no SECRET grant", () => {
    // The crossing loop looked the name up in cfg.secrets, found the user-scope secret, and printed
    // the authorization FAIL for it — advising a grant for a reference that needs none, and exiting 1
    // on a legal config. The oauth reference itself is now reported too (its own crossing, keyed by
    // kind AND name), so the assertion narrows to the SECRET's own `where` rather than to the whole
    // "not authorized" text — a bare match on that text would also catch the oauth FAIL this fixture
    // now legitimately produces.
    const lines = crossingReport(m.loadConfig(collidingUserPaths("oauth:ado"))).join("\n");
    assert.doesNotMatch(lines, /secrets\."ado"\.authorized/);
    // The positive control: the same fixture with a secret reference DOES report the crossing under
    // that exact where, so a loop that reported nothing at all would not satisfy this pair.
    assert.match(crossingReport(m.loadConfig(collidingUserPaths("secret:ado"))).join("\n"), /secrets\."ado"\.authorized/);
});

const CONSUMED_LISTS = { enabled: ["srv"], disabled: [], envKeys: [] };

function consumedFixture(envValue) {
    return {
        secrets: { ado: { backend: "keyvault", vault: "demo-vault", secret: "s" } },
        oauth: { ado: {} },
        servers: { srv: { env: { T: envValue } } },
        tasks: { chore: { env: { T: envValue } } },
    };
}

test("consumedSecrets: an oauth reference does not consume a same-named secret, on either route", () => {
    // The two grammars share one name space, so an oauth reference reached this set the moment
    // parseReference learned the kind — un-skipping a same-named Key Vault entry and reddening the
    // doctor of a teammate who cannot reach that vault. The task route is asserted with it because
    // it passes enabled=true unconditionally, so the server route's enable list cannot cover it.
    assert.deepEqual([...m.consumedSecrets(consumedFixture("oauth:ado"), CONSUMED_LISTS, new Set())], []);
});

test("consumedSecrets: a secret reference on an enabled server is still consumed", () => {
    // The positive control: without it an empty body satisfies "consumedSecrets: an oauth
    // reference does not consume a same-named secret, on either route".
    assert.deepEqual([...m.consumedSecrets(consumedFixture("secret:ado"), CONSUMED_LISTS, new Set())], ["ado"]);
});

test("consumedSecrets: a wired server counts as enabled without appearing in the enable list", () => {
    // The two routes into `enabled` are independent: a server wired through this launcher is not
    // necessarily in settings.local.json, and dropping that half returns its Key Vault secret to SKIP.
    // The fixture carries no task, because the task route passes enabled unconditionally and would
    // supply the name on its own — leaving nothing for `wired` to decide.
    const cfg = { ...consumedFixture("secret:ado"), tasks: {} };
    // The shared fixture's backend is load-bearing here and asserted rather than described: the
    // `local` clause inside consumedSecrets admits a local secret whatever the enable list and
    // `wired` hold, so on a `local` fixture this test passes with the wired route deleted.
    assert.equal(cfg.secrets.ado.backend, "keyvault");
    const lists = { enabled: [], disabled: [], envKeys: [] };
    assert.deepEqual([...m.consumedSecrets(cfg, lists, new Set(["srv"]))], ["ado"]);
});

test("doctorReport: a legacy token in settings.local.json is reported even when absent from the session env", () => {
    const base = { env: {}, platform: "linux", resolvable: {}, skipped: [], toolsMissing: [], configDirOverride: false };
    // The terminal-run case: doctor's own process never inherits settings.local.json's env block,
    // so the file is the only place the stale token is visible.
    const post = m.doctorReport({ secrets: {}, servers: {} }, {
        ...base,
        enableLists: { enabled: [], disabled: [], envKeys: ["ADO_MCP_AUTH_TOKEN"] },
        wired: new Set(["azure-mcp"]),
    });
    assert.ok(post.some((l) => l.startsWith("WARN") && l.includes("ADO_MCP_AUTH_TOKEN")
        && l.includes("settings.local.json env") && l.includes("remove it")));
    const silent = m.doctorReport({ secrets: {}, servers: {} }, {
        ...base, enableLists: { enabled: [], disabled: [], envKeys: ["PERF_ADMIN_USER"] }, wired: new Set(["azure-mcp"]),
    });
    assert.ok(!silent.some((l) => l.includes("PERF_ADMIN_USER")), "unrelated env keys must not be reported");
});

test("cmdDoctor: an unknown argument is rejected, not ignored (a typo must not read as a clean run)", async () => {
    const cfg = { secrets: {}, servers: {} };
    await assert.rejects(() => m.cmdDoctor(cfg, ["--al"]), /unknown argument "--al"/);
    await assert.rejects(() => m.cmdDoctor(cfg, ["--all", "--bogus"]), /unknown argument "--bogus"/);
});

test("readWiredServers: detects vc-secrets-wired entries", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-wired-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, ".mcp.json"), JSON.stringify({ mcpServers: {
        "azure-mcp": { command: "node", args: ["/home/dev/.claude/plugins/data/vc-secrets/vc-secrets-shim.mjs", "run", "azure-mcp"] },
        github: { command: "github-mcp-server", args: ["stdio"] },
    } }));
    assert.deepEqual([...m.readWiredServers(path.join(dir, ".mcp.json"))], ["azure-mcp"]);
    assert.deepEqual([...m.readWiredServers(path.join(dir, "absent.json"))], []);
});

test("readWiredServers: sees a server wired at user scope (top-level and per-project), ignores non-vc-secrets args, null project path is safe", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-userwired-"));
    tmpDirs.push(dir);
    const userJsonPath = path.join(dir, ".claude.json");
    fs.writeFileSync(userJsonPath, JSON.stringify({
        mcpServers: {
            "top-level-wired": { command: "node", args: ["/x/vc-secrets-shim.mjs", "run", "top-level-wired"] },
            other: { command: "other-mcp", args: ["stdio"] },
        },
        projects: {
            "/some/project": {
                mcpServers: { "project-wired": { command: "node", args: ["/x/vc-secrets-shim.mjs", "run", "project-wired"] } },
            },
        },
    }));

    // Pre-fix: readWiredServers only read the project .mcp.json; a user-scope-only wiring (via `claude
    // mcp add-json --scope user`, which lives solely in ~/.claude.json) never showed up as wired.
    const wired = m.readWiredServers(null, userJsonPath, "/some/project");
    assert.deepEqual([...wired].sort(), ["project-wired", "top-level-wired"]);
    assert.ok(!wired.has("other"), "a server whose args don't mention vc-secrets must not be reported wired");
});

test("readWiredServers: another project's wiring is not counted as this project's", () => {
    // `wired` decides whether doctor says "remove that plaintext token" or "it is still required".
    // Collecting every project's block made it machine-global, so a repo wired here would make doctor
    // advise deleting a token an unmigrated repo still needs — and a PAT does not come back.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-otherproj-"));
    tmpDirs.push(dir);
    const userJsonPath = path.join(dir, ".claude.json");
    fs.writeFileSync(userJsonPath, JSON.stringify({
        projects: {
            "/repo-a": { mcpServers: { github: { command: "node", args: ["/x/vc-secrets-shim.mjs", "run", "github"] } } },
        },
    }));

    assert.equal(m.readWiredServers(null, userJsonPath, "/repo-b").size, 0, "a different project's block must not count");
    assert.ok(m.readWiredServers(null, userJsonPath, "/repo-a").has("github"), "its own block must count");
    assert.equal(m.readWiredServers(null, userJsonPath, null).size, 0, "with no project root, no per-project block applies");
});

test("readWiredServers: an unreadable user config is reported, not silently read as 'nothing wired'", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-badjson-"));
    tmpDirs.push(dir);
    const userJsonPath = path.join(dir, ".claude.json");
    fs.writeFileSync(userJsonPath, "{ this is not json");
    const problems = [];

    assert.equal(m.readWiredServers(null, userJsonPath, "/repo-a", problems).size, 0);
    assert.equal(problems.length, 1, `expected the unreadable file to be reported, got ${JSON.stringify(problems)}`);
    assert.ok(problems[0].includes(userJsonPath));
});

test("doctorReport: duplicate-tool suppression matches gpg's real message shape (trailing unlock advice)", () => {
    // Build the status string exactly as makeSecretResolver would produce it: an ENOENT from runTool
    // ("gpg: not found on PATH"), then mapResolveError's unconditional gpg suffix.
    const mapped = m.mapResolveError("gpg", "ado-pat", new Error("gpg: not found on PATH"));
    const cfg = { secrets: { "ado-pat": { backend: "local" } }, servers: {} };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [] },
        resolvable: { "ado-pat": mapped.message }, skipped: [], toolsMissing: ["gpg"], wired: new Set(), configDirOverride: false,
    });

    // Pre-fix: the suppression regex was anchored at the end of the string (`$`), so it matched wcm/
    // keychain's bare "not found on PATH" but never gpg's, whose message always has the unlock advice
    // trailing after it — gpg is Linux/WSL's only backend, so this meant duplicate FAILs on every gpg box.
    const gpgLines = lines.filter((l) => l.includes("gpg"));
    assert.deepEqual(gpgLines, [`FAIL required tool "gpg" not found on PATH`],
        "exactly one gpg line — the missing-tool FAIL, not a second per-secret FAIL");
});

// ── regressions: reference parsing, wiring detection and direct-run gates ──────────────────────────

test("doctorReport: a malformed secret: reference is a FAIL, not a 'treated as a literal' warning", () => {
    // `secret:ado_pat` (underscore) does not match REF_RE, so parseReference THROWS and the launch dies.
    // Reporting it as a mistyped literal told the operator a launch-breaking value was harmless.
    const cfg = {
        secrets: {}, tasks: {},
        servers: { s: { command: "x", args: [], env: { T: "secret:ado_pat" }, home: "project" } },
    };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
    });
    assert.ok(lines.some((l) => l.startsWith("FAIL") && l.includes("secret:ado_pat")), `expected a FAIL, got:\n${lines.join("\n")}`);
    assert.ok(!lines.some((l) => l.includes("treated as a literal")), "must not be reported as a harmless literal");
});

test("readWiredServers: the DOCUMENTED wiring form is detected", () => {
    // The README's entry is {command: "node", args: ["${VC_SECRETS}", "run", "x"]}. A case-sensitive
    // search for "vc-secrets" never matches "${VC_SECRETS}", so the one configuration this plugin tells
    // people to write looked unwired — and the earlier test passed only because its fixture used a
    // lowercase literal path nobody is told to write.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-documented-"));
    tmpDirs.push(dir);
    const mcpJsonPath = path.join(dir, ".mcp.json");
    fs.writeFileSync(mcpJsonPath, JSON.stringify({
        mcpServers: {
            "via-variable": { command: "node", args: ["${VC_SECRETS}", "run", "via-variable"] },
            "via-command": { command: "/home/dev/.claude/plugins/data/x/vc-secrets-shim.mjs", args: ["run", "via-command"] },
            unrelated: { command: "other-mcp", args: ["stdio"] },
        },
    }));

    const wired = m.readWiredServers(mcpJsonPath);
    assert.deepEqual([...wired].sort(), ["via-command", "via-variable"]);
    assert.ok(!wired.has("unrelated"));
});

// ── doctor: what was actually inspected ─────────────────────────────────────────────────────────

test("readWiredServers: records which files it actually looked at", () => {
    const seen = [];
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-"));
    tmpDirs.push(dir);
    const mcp = path.join(dir, ".mcp.json");
    fs.writeFileSync(mcp, JSON.stringify({ mcpServers: {} }));
    m.readWiredServers(mcp, null, null, [], seen);
    assert.deepEqual(seen, [mcp], "the file it read, and only that");
});

test("readWiredServers: a path that does not exist is not 'seen'", () => {
    const seen = [];
    m.readWiredServers(path.join(os.tmpdir(), "vcs-absent", ".mcp.json"), null, null, [], seen);
    assert.deepEqual(seen, []);
});

test("readWiredServers: still returns a Set, because eight assertions and one call site depend on it", () => {
    assert.ok(m.readWiredServers(null, null, null, [], []) instanceof Set);
});

test("readWiredElsewhere: another client's config counts as both seen and wired", () => {
    // The half that makes the fact meaningful. Without it, "did we see a client config" is a property
    // of whether Claude Code is installed, not of how this developer works.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-cursor-"));
    tmpDirs.push(dir);
    const cursorCfg = path.join(dir, "mcp.json");
    fs.writeFileSync(cursorCfg, JSON.stringify({
        mcpServers: { github: { command: "node", args: ["${env:VC_SECRETS}", "run", "github"] } },
    }));
    const bare = path.join(dir, "bare.json");
    fs.writeFileSync(bare, JSON.stringify({ mcpServers: { other: { command: "npx", args: ["x"] } } }));

    const seen = [];
    // This returns SERVER NAMES, because the set it feeds is also read as has(serverName).
    const wired = m.readWiredElsewhere([cursorCfg, bare, path.join(dir, "absent.toml")], seen);
    assert.deepEqual([...wired], ["github"], "only the server in the file that routes through the launcher");
    assert.deepEqual(seen, [cursorCfg, bare], "both existing files were inspected; the absent one was not");
});

test("doctorReport: with nothing wired and no client config seen, the legacy note claims nothing about a switch", () => {
    const lines = m.doctorReport({ secrets: {}, servers: {} }, {
        env: { ADO_MCP_AUTH_TOKEN: "x" }, platform: "linux",
        enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
        configDirOverride: null, clientConfigsSeen: [],
    });
    const note = lines.find((l) => l.includes("ADO_MCP_AUTH_TOKEN"));
    assert.ok(note, "the variable is still reported");
    assert.ok(!note.includes("still required until the vc-secrets switch lands"),
        "no claim about a switch, because no client config was inspected");
});

test("doctorReport: with a client config seen and nothing wired, the switch really is pending", () => {
    const lines = m.doctorReport({ secrets: {}, servers: {} }, {
        env: { ADO_MCP_AUTH_TOKEN: "x" }, platform: "linux",
        enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
        configDirOverride: null, clientConfigsSeen: ["/repo/.mcp.json"],
    });
    assert.match(lines.find((l) => l.includes("ADO_MCP_AUTH_TOKEN")),
        /still required until the vc-secrets switch lands/);
});

// ── wired stays a set of SERVER NAMES, and the version comparator ───────────────────────────────

test("readWiredElsewhere: a knob name is not a wiring marker", () => {
    // VC_SECRETS_TIMING and friends are documented knobs. Matching them marks an unrelated config as
    // wired, which flips doctor's legacy-token line from "still required" to "remove it" — advice to
    // delete a credential that is still live. The false positive is the damaging direction.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-knob-"));
    tmpDirs.push(dir);
    // The knob has to sit in `command` or `args` to reach WIRED_MARKER_RE at all: wiredNamesInJson
    // builds its fields from those two and never looks at `env`. An earlier fixture put it in `env`,
    // so the test passed whatever the pattern did.
    const cfgPath = path.join(dir, "mcp.json");
    fs.writeFileSync(cfgPath, JSON.stringify({
        mcpServers: { github: { command: "npx", args: ["-y", "srv", "--trace=VC_SECRETS_TIMING"] } },
    }));
    assert.equal(m.readWiredElsewhere([cfgPath], []).size, 0);

    // The zero above is a decision only if the same reader finds a real wiring in the same shape.
    const wiredPath = path.join(dir, "wired.json");
    fs.writeFileSync(wiredPath, JSON.stringify({
        mcpServers: { github: { command: "node", args: ["/x/vc-secrets-shim.mjs", "run", "github"] } },
    }));
    assert.deepEqual([...m.readWiredElsewhere([wiredPath], [])], ["github"], "positive control");
});

// ── wiring attribution reads server KEYS, not substrings ────────────────────────────────────────

test("readWiredElsewhere: a declared name that merely appears in the file is not wired", () => {
    // The baked shim path alone contains "data", "plugins", "tools", "claude", "run" and "node". A
    // substring test over the whole file marked every declared server with such a name as wired,
    // which drops the SKIP that keeps a teammate's doctor from FAILing on a Key Vault secret they
    // cannot reach — the failure the surrounding design exists to prevent.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-attrib-"));
    tmpDirs.push(dir);
    const toml = path.join(dir, "config.toml");
    fs.writeFileSync(toml, [
        '[mcp_servers.github]',
        'command = "node"',
        'args = ["/home/u/.claude/plugins/data/vc-secrets-ai-tools/vc-secrets-shim.mjs","run","github"]',
        '',
        '[mcp_servers.jira]',
        'command = "npx"',
        'args = ["-y","jira-mcp"]',
    ].join("\n"));
    assert.deepEqual([...m.readWiredElsewhere([toml], [])].sort(), ["github"]);
});

test("readWiredElsewhere: a JSON client's unwired server is not wired by a neighbour that is", () => {
    // One Cursor file holds ALL of a user's servers and only some route through the launcher. That is
    // the ordinary shape, not a corner.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-attrib-json-"));
    tmpDirs.push(dir);
    const cfg = path.join(dir, "mcp.json");
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: {
        github: { command: "node", args: ["${env:VC_SECRETS}", "run", "github"] },
        jira: { command: "npx", args: ["-y", "jira-mcp"], env: { JIRA_TOKEN: "plaintext" } },
    } }));
    assert.deepEqual([...m.readWiredElsewhere([cfg], [])].sort(), ["github"]);
});

test("readWiredElsewhere: a quoted TOML table name is read, since dots are legal in a server name", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-attrib-dotted-"));
    tmpDirs.push(dir);
    const toml = path.join(dir, "config.toml");
    fs.writeFileSync(toml, '[mcp_servers."azure.mcp"]\ncommand = "node"\nargs = ["${x}/vc-secrets-shim.mjs","run","azure.mcp"]\n');
    assert.deepEqual([...m.readWiredElsewhere([toml], [])], ["azure.mcp"]);
});

test("readWiredElsewhere: an unreadable client config is reported, not counted as inspected-and-clean", { skip: !CAN_DENY_BY_MODE && "needs a filesystem whose mode bits actually deny a read" }, () => {
    // The sibling reader pushes a problem for the identical condition. Swallowing it converts a crash
    // into a confident wrong claim: the file is recorded as inspected, contributes no wiring, and the
    // legacy-token advice then rests on a file nobody could read.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vcs-unreadable-"));
    tmpDirs.push(dir);
    const cfg = path.join(dir, "mcp.json");
    fs.writeFileSync(cfg, JSON.stringify({ mcpServers: {} }));
    fs.chmodSync(cfg, 0o000);
    const seen = [];
    const problems = [];
    m.readWiredElsewhere([cfg], seen, problems);
    fs.chmodSync(cfg, 0o600);
    assert.equal(problems.length, 1, "the unreadable file is reported");
    assert.match(problems[0], /cannot be read/);
});

test("doctorReport: each trust finding is a FAIL line, and none adds nothing", () => {
    const cfg = trustCfg();
    const report = (trustFindings) => m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), ...(trustFindings ? { trustFindings } : {}) });
    const finding = m.trustRefusal("servers", "gh", m.trustProblem(cfg, "servers", "gh", NO_TRUST), cfg);
    assert.ok(report([finding]).includes(`FAIL ${finding}`));
    assert.deepEqual(report(undefined), report([]), "the parameter is optional and defaults to no findings");
    assert.ok(!report([]).some((l) => l.includes("vc-secrets trust")));
});

test("doctorReport and trustNotes: a user-scope reader is a FAIL and an emit-config note, in its own words", () => {
    const cfg = namespaceCfg();
    const untrusted = m.trustAssessment(cfg, () => NO_TRUST);
    const report = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(), trustFindings: untrusted.findings });
    assert.ok(report.includes(`FAIL ${untrusted.findings[0]}`), report.join("\n"));
    assert.deepEqual(m.trustNotes(cfg, untrusted),
        ['s: reads secret "pat" from namespace "proj-x", which this repository declares and is not trusted yet -- run "vc-secrets trust" before starting it']);

    // After an id change the note still names the references and the namespace, and both ids: it is read on
    // its own, away from the refusal, by someone deciding whether to run `trust` again.
    const moved = trustedStateFor(cfg);
    moved.repositories[cfg.projectRoot].projectId = "proj-other";
    assert.deepEqual(m.trustNotes(cfg, m.trustAssessment(cfg, () => moved)),
        ['s: reads secret "pat" from namespace "proj-x", and the projectId changed since you trusted this checkout:'
            + ' projectId is "proj-x", trusted "proj-other" -- run "vc-secrets trust" again before starting it']);
    assert.deepEqual(m.trustNotes(cfg, m.trustAssessment(cfg, () => trustedStateFor(cfg))), []);
});

test("doctorReport: a namespace the checkout is not trusted for is a SKIP per entry, in the Key Vault SKIP's form", () => {
    const cfg = { secrets: {}, servers: {}, projectId: "proj-x" };
    const lines = m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
        namespaceNotRead: [{ kind: "secret", name: "pat" }, { kind: "oauth", name: "ado" }] });
    assert.deepEqual(lines.filter((line) => line.startsWith("SKIP")), [
        'SKIP secret "pat" not read -- this checkout is not trusted for namespace "proj-x"',
        'SKIP oauth "ado" not read -- this checkout is not trusted for namespace "proj-x"',
    ]);
});

const PROBE_CLAIMED = `${m.KEY_PREFIX}:proj-x:${m.WRITE_PROBE_NAME}`;

const PROBE_USER = `${m.KEY_PREFIX}:user:${m.WRITE_PROBE_NAME}`;

async function probeKeys(cfg, extra = {}) {
    const keys = { written: [], removed: [], values: [] };
    await m.probeKeystoreWrite({ backend: "keychain", cfg, ...extra,
        write: async (key, value) => { keys.written.push(key); keys.values.push(value); },
        remove: async (key) => { keys.removed.push(key); } });

    return keys;
}

// ── the two namespace touches that are not a read of an entry: doctor's write probe and unlock ───────
//
// The probe writes and then deletes a key of its own; `unlock` existence-checks and test-decrypts the entries
// a repository declares. Both build keys from the repository's projectId, so both stand behind the same
// predicate as the verbs above (namespaceTrustProblem).

test("probeKeystoreWrite: in a checkout not trusted for its namespace the probe writes and removes under the user key, never the claimed namespace", async () => {
    const cfg = { projectId: "proj-x", secrets: {}, oauth: {} };
    const keys = await probeKeys(cfg, { namespaceTrusted: false });
    assert.deepEqual(keys.written, [PROBE_USER]);
    assert.deepEqual(keys.removed, [PROBE_USER]);
    assert.ok([...keys.written, ...keys.removed].every((key) => !key.includes(":proj-x:")), "nothing under the claimed id");
});

test("probeKeystoreWrite: a trusted checkout, and a call that says nothing about trust, keep the project key", async () => {
    const cfg = { projectId: "proj-x", secrets: {}, oauth: {} };
    for (const extra of [{ namespaceTrusted: true }, {}]) {
        const keys = await probeKeys(cfg, extra);
        assert.deepEqual(keys.written, [PROBE_CLAIMED], JSON.stringify(extra));
        assert.deepEqual(keys.removed, [PROBE_CLAIMED], JSON.stringify(extra));
    }
    // No repository: no projectId, so the user key whatever is said about trust.
    const keys = await probeKeys({ secrets: {}, oauth: {} }, { namespaceTrusted: true });
    assert.deepEqual(keys.written, [PROBE_USER]);
});

test("probeKeystoreWrite: the keychain value is sized for the key the probe wrote under, trusted or not", async () => {
    // The two keys differ in length, and the composed line must still sit exactly on the limit under the
    // one that was used: sized for the other, an untrusted probe would overflow its own budget (a FAIL on a
    // healthy machine) or rehearse a smaller write than a real entry makes.
    const env = { USER: "abcde" };
    const cfg = { projectId: "a-much-longer-project-id-than-user", secrets: {}, oauth: {} };
    const saved = process.env.USER;
    process.env.USER = env.USER;
    try {
        for (const namespaceTrusted of [false, true]) {
            const keys = await probeKeys(cfg, { namespaceTrusted });
            const line = m.buildLocalWrite("keychain", keys.written[0], env, { value: keys.values[0] }).stdinCommand(keys.values[0]);
            assert.equal(Buffer.byteLength(line), m.SECURITY_LINE_LIMIT, `namespaceTrusted=${namespaceTrusted}, key ${keys.written[0]}`);
        }
    } finally {
        if (saved === undefined) { delete process.env.USER; } else { process.env.USER = saved; }
    }
    assert.notEqual(m.writeProbeValue(cfg, env, "keychain", false), m.writeProbeValue(cfg, env, "keychain", true),
        "the fixture must make the two keys differ, or this test cannot see the sizing");
});

test("cmdDoctor: the write probe is told whether this checkout is trusted for the namespace it would write in", async () => {
    // The probe writes and deletes its key, and the repository's projectId may name another project's
    // namespace: an untrusted checkout must be probed under the user key, a trusted one under its own.
    const repo = doctorRepo({ projectId: "proj-x" });
    const trustedFlags = [];
    const probeKeystoreWrite = async ({ namespaceTrusted }) => {
        trustedFlags.push(namespaceTrusted);

        return null;
    };

    await runDoctor(repo, { probeKeystoreWrite });
    seedTrust(repo.env, repo.root);
    await runDoctor(repo, { probeKeystoreWrite });

    assert.deepEqual(trustedFlags, [false, true], "untrusted checkout first, then the same one once trusted");
});

test("doctor: the write probe goes under the user key in a checkout not trusted for its namespace, and under the project key once trusted",
    POSIX_STUB_ONLY, () => {
        const recorder = keychainRecorder();
        const env = launcherEnv(recorder.env);
        const root = namespaceRepo({ projectId: "proj-x", secrets: { kv: KV_PAT } });
        const probeCalls = () => recorder.calls().filter((call) => call.includes(m.WRITE_PROBE_NAME));

        runVerb(env, root, "doctor");
        assert.ok(probeCalls().some((call) => call.includes(PROBE_USER)), probeCalls().join("\n"));
        assert.ok(probeCalls().every((call) => !call.includes(":proj-x:")), `no claimed namespace:\n${probeCalls().join("\n")}`);

        seedTrust(env, root);
        runVerb(env, root, "doctor");
        assert.ok(probeCalls().some((call) => call.includes(PROBE_CLAIMED)), probeCalls().join("\n"));
    });

test("doctor: an unreadable trust file puts the probe under the user key without a finding of its own", POSIX_STUB_ONLY, () => {
    const recorder = keychainRecorder();
    const env = launcherEnv(recorder.env);
    const root = namespaceRepo({ projectId: "proj-x", secrets: { kv: KV_PAT } });
    corruptTrustFile(env);
    const result = runVerb(env, root, "doctor");
    const probeCalls = recorder.calls().filter((call) => call.includes(m.WRITE_PROBE_NAME));
    assert.ok(probeCalls.length > 0 && probeCalls.every((call) => !call.includes(":proj-x:")), probeCalls.join("\n"));
    assert.doesNotMatch(result.stderr, /trust file/, "nothing here is held to the file, so nothing names it");
});
