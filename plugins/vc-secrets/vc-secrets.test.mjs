import { test, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { PassThrough, Writable } from "node:stream";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as m from "./vc-secrets.mjs";
import * as target from "./vc-secrets-target.mjs";
import * as cache from "./vc-secrets-cache.mjs";
import * as clients from "./clients.mjs";
import * as t from "./hooks/targets.mjs";
import { CANONICAL_DATA_ID } from "./scripts/shim-path.mjs";
import { stripComments, codeOnly, callArguments, launcherSource } from "./test-support.mjs";

const LAUNCHER_PATH = fileURLToPath(new URL("./vc-secrets.mjs", import.meta.url));

const tmpDirs = [];
after(() => {
    for (const dir of tmpDirs) {
        fs.rmSync(dir, { recursive: true, force: true });
    }
});

// The environment for a spawned launcher or probe. The developer's own, minus every VC_SECRETS_* knob:
// a VC_SECRETS_CONFIG_DIR in their shell would point `doctor` at their real declarations, with real
// secret reads and `az`, and VC_SECRETS_LOCAL_BACKEND would pick a store the test did not choose. HOME,
// USERPROFILE and XDG_CONFIG_HOME go to a fresh directory so that no FILE-based state a run reaches --
// the gpg files and the trust file under XDG_CONFIG_HOME -- is the developer's. That does not reach the
// wcm and keychain entries: they live in the operating system's store, not under any of those
// variables, so a test that can touch them pins the backend (as the doctor tests do) or stubs the tool
// on PATH. Both HOME and USERPROFILE for the reason shimEnv gives; a test that means to use a fixture
// home passes it in `extra`, which lands last.
function launcherEnv(extra = {}) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-launcher-home-"));
    tmpDirs.push(home);
    const env = {};
    for (const [key, value] of Object.entries(process.env)) {
        if (!/^VC_SECRETS_/i.test(key)) {
            env[key] = value;
        }
    }

    return { ...env, HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: home, ...extra };
}

// One path fails the named fs call with EACCES, the way it does under an ancestor that lost its search
// bit; every other path reaches the real call. Mode bits cannot produce this portably: a run as root
// ignores them, and Windows has none to take away. Restored when the test `t` ends.
function denyFs(t, method, denied) {
    const real = fs[method];
    t.mock.method(fs, method, (p, ...rest) => {
        if (String(p) === denied) {
            throw Object.assign(new Error(`EACCES: permission denied, ${method} '${p}'`), { code: "EACCES" });
        }

        return real(p, ...rest);
    });
}

// Capability probes, run once at load. Each asks a question about the MACHINE, not about the code, and
// a test whose subject this machine cannot host carries `{ skip: !CAN_X && "<what is missing>" }` --
// the same shape the socket, lock and channel wrappers use in vc-secrets-oauth.test.mjs. An absent
// capability is not a failure; an absent capability that reports as one is, because it buries the real
// regressions it is mixed in with. Each reason names the missing THING rather than the platform, so a
// machine that later grows the capability starts running the test without anyone editing a condition.
function probe(fn) {
    try {
        return fn();
    } catch {
        return false;
    }
}

const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-probe-"));
tmpDirs.push(probeDir);

// A directory link. Windows creates a true symlink only in Developer Mode or elevated (otherwise
// fs.symlinkSync raises EPERM), but a junction needs no privilege, so it is what the tests use there. A
// junction takes an absolute target -- every one passed below is -- and behaves as a link for what these
// tests read: realpath resolves it, and libuv reports any reparse point as a link to readdir, so
// Dirent.isSymbolicLink() is true for one. The probe stays, so a machine that truly cannot link skips.
const LINK_TYPE = process.platform === "win32" ? "junction" : "dir";
const CAN_SYMLINK = probe(() => {
    const dest = path.join(probeDir, "sym-dest");
    fs.mkdirSync(dest, { recursive: true });
    fs.symlinkSync(dest, path.join(probeDir, "sym-link"), LINK_TYPE);

    return true;
});

// NTFS ignores POSIX mode bits, so `chmod 000` denies nothing there. The probe checks that the denial
// actually HAPPENS rather than that chmod returned -- a test built on the call alone asserts the
// opposite of what it reads as, and passes by reading a file it claims is unreadable.
const CAN_DENY_BY_MODE = probe(() => {
    const f = path.join(probeDir, "denied");
    fs.writeFileSync(f, "x");
    fs.chmodSync(f, 0o000);
    try {
        fs.readFileSync(f);

        return false;
    } catch {
        return true;
    } finally {
        fs.chmodSync(f, 0o600);
    }
});

// Several tests stand a stub binary on PATH in place of gpg, security or powershell.exe. On win32
// stubBinary writes a .sh body behind a .cmd launcher, so the stub runs only where a POSIX shell
// exists. Note this one is true on POSIX by CONSTRUCTION -- the short-circuit -- while the three
// around it are live measurements, which is what "capability probes: the ones a POSIX machine
// cannot lack answer true" is for.
const CAN_RUN_POSIX_STUB = process.platform !== "win32"
    || probe(() => spawnSync("sh", ["-c", "exit 0"]).status === 0);

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

// Writes a single project-scope declaration file and returns its containing directory — for tests
// that only care about VC_SECRETS_CONFIG_DIR-style single-home config (most structural checks).
function tmpConfigDir(cfg) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, m.CONFIG_NAME), JSON.stringify(cfg));
    return dir;
}

// Same, but returns the {user, project, local} paths object loadConfig now takes directly.
function projectPaths(cfg) {
    return { user: null, project: path.join(tmpConfigDir(cfg), m.CONFIG_NAME), local: null };
}

// Writes up to three homes into one tmp directory under distinct filenames and returns the paths
// object — for precedence/collision/projectId tests that need more than one scope populated.
function scopedPaths({ user, project, local } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-scopes-"));
    tmpDirs.push(dir);
    const write = (name, cfg) => {
        const file = path.join(dir, name);
        fs.writeFileSync(file, JSON.stringify(cfg));
        return file;
    };

    return {
        user: user ? write("user.json", user) : null,
        project: project ? write("project.json", project) : null,
        local: local ? write("local.json", local) : null,
    };
}

// What `trust` records for a config: every launchable a repository declared, as launchShape sees it.
// Derived from the config under test rather than written out, so a test that changes a declaration
// changes what was trusted with it and keeps meaning "trusted as declared". Passed as `deps.trustState`
// to the in-process launch path, and to trustProblem directly.
function trustedStateFor(cfg) {
    const record = { trustedAt: "2000-01-01T00:00:00.000Z", projectId: cfg.projectId, servers: {}, tasks: {} };
    for (const kind of ["servers", "tasks"]) {
        for (const [name, launchable] of Object.entries(cfg[kind])) {
            if (launchable.home !== "user") {
                record[kind][name] = m.launchShape(launchable);
            }
        }
    }

    return { schemaVersion: 1, repositories: { [cfg.projectRoot]: record } };
}

// The same, as a real trust file under the environment a spawned launcher will read it from -- for the
// tests that run `vc-secrets run` as a process. `cwd` is where the launcher will discover its
// declarations, unless the env carries VC_SECRETS_CONFIG_DIR, which configPaths honours first.
function seedTrust(env, cwd) {
    m.writeTrustState(env, trustedStateFor(m.loadConfig(m.configPaths(env, cwd))));

    return env;
}

function trustedLauncherEnv(dir, extra = {}) {
    return seedTrust(launcherEnv({ VC_SECRETS_CONFIG_DIR: dir, ...extra }), dir);
}

// A minimal stand-in for a spawned child, for cmdLaunch tests that inject spawnFn: never signalled
// in these tests. Deliberately pid-less: cmdLaunch kills the child's process GROUP when the launcher
// exits, and a pid borrowed from a real process -- this one's, once -- would name a group that may be
// the runner's own.
function fakeChild() {
    return new EventEmitter();
}

test("parseReference: plain name", () => {
    assert.deepEqual(m.parseReference("secret:ado-pat"), { kind: "secret", name: "ado-pat", field: null });
});

test("parseReference: name with field", () => {
    assert.deepEqual(m.parseReference("secret:azure-monitor-sp.tenantId"), { kind: "secret", name: "azure-monitor-sp", field: "tenantId" });
});

test("parseReference: non-reference is null (literal passthrough)", () => {
    assert.equal(m.parseReference("plain-value"), null);
});

test("parseReference: invalid chars in name → VcSecretsError", () => {
    assert.throws(() => m.parseReference("secret:Bad_Name"), m.VcSecretsError);
});

test("parseLiteral: only an explicit prefix is a literal, and the prefix is stripped once", () => {
    assert.equal(m.parseLiteral("literal:as-is"), "as-is");
    assert.equal(m.parseLiteral("literal:"), "");
    // A value that really begins with the prefix: strip once, keep the rest verbatim.
    assert.equal(m.parseLiteral("literal:literal:x"), "literal:x");
    assert.equal(m.parseLiteral("plain"), null);
    assert.equal(m.parseLiteral("secrets:ado-pat"), null);
});

test("loadConfig: reads and validates, entries carry their scope", () => {
    const cfg = { projectId: "proj-x", secrets: { "ado-pat": { backend: "local" } }, servers: { github: { command: "x", args: [], env: {} } } };
    const loaded = m.loadConfig(projectPaths(cfg));
    assert.equal(loaded.secrets["ado-pat"].backend, "local");
    assert.equal(loaded.secrets["ado-pat"].scope, "project");
    assert.equal(loaded.servers.github.scope, "project");
});

test("loadConfig: missing file → VcSecretsError", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-empty-"));
    tmpDirs.push(dir);
    assert.throws(() => m.loadConfig({ user: null, project: path.join(dir, m.CONFIG_NAME), local: null }), m.VcSecretsError);
});

test("loadConfig: unknown backend → VcSecretsError", () => {
    const cfg = { secrets: { x: { backend: "nope" } }, servers: {} };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), m.VcSecretsError);
});

test("loadConfig: bad format / non-string args / non-string env → VcSecretsError", () => {
    assert.throws(() => m.loadConfig(projectPaths({
        secrets: { x: { backend: "local", format: "xml" } }, servers: {} })), /format/);
    assert.throws(() => m.loadConfig(projectPaths({
        secrets: {}, servers: { s: { command: "x", args: [1], env: {} } } })), /args/);
    assert.throws(() => m.loadConfig(projectPaths({
        secrets: {}, servers: { s: { command: "x", args: [], env: { A: null } } } })), /env/);
});

test("loadConfig: null secret entry → VcSecretsError", () => {
    assert.throws(() => m.loadConfig(projectPaths({ secrets: { x: null }, servers: {} })), m.VcSecretsError);
});

test("loadConfig: null server entry → VcSecretsError", () => {
    assert.throws(() => m.loadConfig(projectPaths({ secrets: {}, servers: { s: null } })), m.VcSecretsError);
});

test("loadConfig: array-shaped secrets/servers → VcSecretsError", () => {
    assert.throws(() => m.loadConfig(projectPaths({ secrets: [], servers: [] })), m.VcSecretsError);
});

test("loadConfig: unknown top-level key → warning, not a throw", () => {
    const cfg = { secrets: {}, servers: {}, extra: 1 };
    const loaded = m.loadConfig(projectPaths(cfg));
    assert.ok(loaded.warnings.some((w) => w.includes('unknown key "extra"')));
});

test("loadConfig: unknown key inside a secret declaration still throws", () => {
    const cfg = { secrets: { x: { backend: "local", bogus: 1 } }, servers: {} };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /secret "x".*unknown key "bogus"/);
});

test("loadConfig: unknown key inside a server declaration still throws", () => {
    const cfg = { secrets: {}, servers: { s: { command: "x", args: [], env: {}, bogus: 1 } } };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /server "s".*unknown key "bogus"/);
});

test("loadConfig: empty or whitespace-only command → VcSecretsError", () => {
    assert.throws(
        () => m.loadConfig(projectPaths({ secrets: {}, servers: { s: { command: "", args: [], env: {} } } })),
        /server "s".*"command" must not be empty/);
    assert.throws(
        () => m.loadConfig(projectPaths({ secrets: {}, servers: { s: { command: "   ", args: [], env: {} } } })),
        /server "s".*"command" must not be empty/);
});

test("loadConfig: dangerous env key in server declaration → VcSecretsError", () => {
    const cfg = { secrets: {}, servers: { s: { command: "x", args: [], env: { LD_PRELOAD: "p" } } } };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /LD_PRELOAD/);
});

test("loadConfig: precedence local > project within a project, per kind, and the winner keeps its scope", () => {
    const home = (tag) => ({
        projectId: "proj-x",
        secrets: { shared: { backend: "keyvault", vault: `vault-${tag}`, secret: "s" } },
        servers: { shared: { command: `cmd-${tag}`, args: [], env: {} } },
        tasks: { shared: { command: `cmd-${tag}`, args: [], env: {} } },
    });
    const paths = scopedPaths({ project: home("project"), local: home("local") });
    const cfg = m.loadConfig(paths);
    assert.equal(cfg.secrets.shared.vault, "vault-local");
    assert.equal(cfg.secrets.shared.scope, "project", "a local-scope secret keys the same namespace as project");
    assert.equal(cfg.servers.shared.command, "cmd-local");
    assert.equal(cfg.servers.shared.scope, "local");
    assert.equal(cfg.tasks.shared.command, "cmd-local");
    assert.equal(cfg.tasks.shared.scope, "local");
});

test("loadConfig: a project shadowing a user-scope name wins, as in the client, and the collision is reported", () => {
    // The client's documented order for a server defined in several scopes is local, then project, then
    // user, whole entry from the winner. Diverging from it would be an exception every reader has to
    // remember; the ambiguity is answered by reporting the collision, not by refusing to load.
    const paths = scopedPaths({
        user: { servers: { shared: { command: "cmd-user", args: [], env: {} } } },
        project: { projectId: "proj-x", servers: { shared: { command: "cmd-project", args: [], env: {} } } },
    });
    const cfg = m.loadConfig(paths);
    assert.equal(cfg.servers.shared.command, "cmd-project");
    assert.equal(cfg.servers.shared.home, "project");
    assert.deepEqual(cfg.collisions, [{ kind: "server", name: "shared", from: "user", to: "project" }]);
});

test("loadConfig: a project secret shadowing a user-scope name keys the PROJECT namespace", () => {
    // The point of the two fields: the winner's `home` is project, so its key is the project's — the
    // personal value under vc-secrets:user:<name> is not what the project's server will read.
    const paths = scopedPaths({
        user: { secrets: { shared: { backend: "local" } } },
        project: { projectId: "proj-x", secrets: { shared: { backend: "local" } } },
    });
    const cfg = m.loadConfig(paths);
    assert.equal(m.keyFor("shared", cfg.secrets.shared, cfg), `${m.KEY_PREFIX}:proj-x:shared`);
});

const CROSSING_SHAPE = { command: "npx", args: ["-y", "gh-mcp"], envKeys: ["T"] };

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

function crossingReport(cfg) {
    return m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
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

test("an added env key changes the shape, because it changes what the process holding the secret gets", async () => {
    const paths = scopedPaths({
        user: { secrets: { "personal-pat": { backend: "local", authorized: { servers: { gh: CROSSING_SHAPE } } } } },
        project: { projectId: "proj-x", servers: { gh: { command: "npx", args: ["-y", "gh-mcp"],
            env: { T: "secret:personal-pat", EXTRA: "literal:x" } } } },
    });
    await assert.rejects(() => m.resolveEnvEntries("gh", m.loadConfig(paths), async () => "tok"),
        /env keys are \["EXTRA","T"\], authorized \["T"\]/);
});

const VAULT_SHAPE = { command: "printenv", args: ["V"], envKeys: ["V"] };

function vaultPaths(vaults) {
    const user = { secrets: {} };
    if (vaults !== undefined) {
        user.vaults = vaults;
    }

    return scopedPaths({
        user,
        project: { projectId: "demo",
            secrets: { x: { backend: "keyvault", vault: "victim-prod", secret: "db-password" } },
            tasks: { build: { command: "printenv", args: ["V"], env: { V: "secret:x" } } } },
    });
}

test("a project-declared keyvault secret needs the owner's authorization too — the repo picks the vault, your login pays", async () => {
    // The namespace that makes a project-declared `local` secret inert does not exist here: keyFor is not
    // consulted for keyvault, so the vault and secret name in the repository are read as written, with
    // whatever identity `az` holds. Demonstrated before this rule existed: a committed declaration plus a
    // printenv task returned the value of any secret the developer's login could read.
    const cfg = m.loadConfig(vaultPaths(undefined));
    let called = false;
    await assert.rejects(
        () => m.resolveEnvEntries("build", cfg, async () => { called = true; return "v"; }, "tasks"),
        /not authorized to receive "x"/);
    assert.equal(called, false, "the vault must not be contacted for a refused launch");
});

test("the vaults block authorizes by vault and secret name, and pins the consumer's shape", async () => {
    const authorized = { "victim-prod": { "db-password": { tasks: { build: VAULT_SHAPE } } } };
    const cfg = m.loadConfig(vaultPaths(authorized));
    assert.deepEqual((await m.resolveEnvEntries("build", cfg, async () => "v", "tasks")).env, { V: "v" });

    // Same shape, different vault: the authorization does not transfer.
    const elsewhere = m.loadConfig(vaultPaths({ "other-vault": { "db-password": { tasks: { build: VAULT_SHAPE } } } }));
    await assert.rejects(() => m.resolveEnvEntries("build", elsewhere, async () => "v", "tasks"), /not authorized/);

    // Authorized vault and secret, but the command behind the task changed.
    const swapped = m.loadConfig(scopedPaths({
        user: { secrets: {}, vaults: authorized },
        project: { projectId: "demo",
            secrets: { x: { backend: "keyvault", vault: "victim-prod", secret: "db-password" } },
            tasks: { build: { command: "curl", args: ["V"], env: { V: "secret:x" } } } },
    }));
    await assert.rejects(() => m.resolveEnvEntries("build", swapped, async () => "v", "tasks"),
        /command is "curl", authorized "printenv"/);
});

test("a project-declared LOCAL secret still needs no authorization — the set you ran is the authorization", async () => {
    // The rule must not spread to the case the namespace already covers: this reads
    // vc-secrets:demo:x, which holds only what was set for this project.
    const cfg = m.loadConfig(scopedPaths({
        user: { secrets: {} },
        project: { projectId: "demo", secrets: { x: { backend: "local" } },
            tasks: { build: { command: "printenv", args: ["V"], env: { V: "secret:x" } } } },
    }));
    assert.deepEqual((await m.resolveEnvEntries("build", cfg, async () => "v", "tasks")).env, { V: "v" });
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

test("a vaults block in a repository file authorizes nothing, and says so", () => {
    const cfg = m.loadConfig(scopedPaths({
        user: { secrets: {} },
        project: { projectId: "demo",
            vaults: { "victim-prod": { "db-password": { tasks: { build: VAULT_SHAPE } } } },
            secrets: { x: { backend: "keyvault", vault: "victim-prod", secret: "db-password" } },
            tasks: { build: { command: "printenv", args: ["V"], env: { V: "secret:x" } } } },
    }));
    assert.ok(cfg.warnings.some((w) => w.includes('"vaults" only authorizes at user scope')), cfg.warnings.join("\n"));
    await_refusal: {
        assert.equal(m.crossingProblem(cfg, "tasks", "build", "x")?.reason, "not authorized");
    }
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

test("an authorized block outside the user file is reported as carrying no authority", () => {
    // Otherwise the party asking for the grant would be writing it.
    const paths = scopedPaths({
        user: { secrets: { "personal-pat": { backend: "local" } } },
        project: { projectId: "proj-x",
            secrets: { "own-pat": { backend: "local", authorized: { servers: { gh: CROSSING_SHAPE } } } },
            servers: { gh: { command: "npx", args: ["-y", "gh-mcp"], env: { T: "secret:personal-pat" } } } },
    });
    const cfg = m.loadConfig(paths);
    assert.ok(cfg.warnings.some((w) => w.includes("only authorizes at user scope")), cfg.warnings.join("\n"));
});

test("loadConfig: a name declared in two homes appears in collisions with the right from/to", () => {
    const decl = { projectId: "proj-x", secrets: { dup: { backend: "local" } }, servers: {}, tasks: {} };
    const paths = scopedPaths({ project: decl, local: decl });
    const cfg = m.loadConfig(paths);
    assert.deepEqual(cfg.collisions, [{ kind: "secret", name: "dup", from: "project", to: "local" }]);
});

test("loadConfig: two scopes resolving to the same file load once, no self-collision", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-samefile-"));
    tmpDirs.push(dir);
    const file = path.join(dir, "shared.json");
    fs.writeFileSync(file, JSON.stringify({ projectId: "proj-x", secrets: { x: { backend: "local" } }, servers: {}, tasks: {} }));
    const cfg = m.loadConfig({ user: null, project: file, local: file });
    assert.equal(Object.keys(cfg.secrets).length, 1);
    assert.deepEqual(cfg.collisions, []);
    assert.equal(cfg.secrets.x.scope, "project");
});

test("loadConfig: projectId absent while a project-scope secret exists → VcSecretsError", () => {
    const paths = scopedPaths({ project: { secrets: { x: { backend: "local" } }, servers: {}, tasks: {} } });
    assert.throws(() => m.loadConfig(paths), /projectId is not/);
});

test("loadConfig: projectId disagrees between project and local → VcSecretsError", () => {
    const paths = scopedPaths({
        project: { projectId: "proj-a", secrets: {}, servers: {}, tasks: {} },
        local: { projectId: "proj-b", secrets: {}, servers: {}, tasks: {} },
    });
    assert.throws(() => m.loadConfig(paths), /projectId disagrees/);
});

test("loadConfig: projectId matching in project and local → fine", () => {
    const paths = scopedPaths({
        project: { projectId: "proj-a", secrets: {}, servers: {}, tasks: {} },
        local: { projectId: "proj-a", secrets: {}, servers: {}, tasks: {} },
    });
    assert.equal(m.loadConfig(paths).projectId, "proj-a");
});

test("loadConfig: projectId at user scope → warning, ignored", () => {
    const paths = scopedPaths({ user: { projectId: "proj-a", secrets: {}, servers: {}, tasks: {} } });
    const cfg = m.loadConfig(paths);
    assert.equal(cfg.projectId, null);
    assert.ok(cfg.warnings.some((w) => w.includes("projectId is meaningless at user scope")));
});

const OAUTH_TENANT_ID = "12345678-1234-1234-1234-123456789012";
// Distinct from OAUTH_TENANT_ID: that one is all-digit, so upper- and lower-casing it produce the
// same string and it cannot expose a case-folding defect. This one carries letters.
const CASE_TENANT_ID_UPPER = "ABCDEF12-3456-7890-ABCD-EF1234567890";
const CASE_TENANT_ID_LOWER = CASE_TENANT_ID_UPPER.toLowerCase();
const OAUTH_DECL = {
    tenantId: OAUTH_TENANT_ID,
    clientId: "my-client-id",
    scopes: ["https://example.com/.default", "offline_access"],
    targetPackage: "some-oauth-package",
};

test("an oauth declaration is stamped with the scope, the home and its kind", () => {
    // kind is what authorizationFor discriminates on; without it that function falls
    // through to "needs no authorization".
    const cfg = m.loadConfig(projectPaths({ projectId: "proj-x", oauth: { ado: OAUTH_DECL } }));
    assert.equal(cfg.oauth.ado.home, "project");
    assert.equal(cfg.oauth.ado.scope, "project");
    assert.equal(cfg.oauth.ado.kind, "oauth");
    // Stamped here rather than added by a call site, unlike a secret's. Dropping it makes
    // authorizationFor's pointer read `oauth."undefined"`.
    assert.equal(cfg.oauth.ado.declaredName, "ado");
});

test("a LOCAL-scope oauth declaration takes the project namespace, and still demands projectId", () => {
    // `scope === "local" ? "project" : scope` is what puts a local declaration in the project's
    // keystore namespace, and the projectId demand keys off `scope === "project"`. Drop the
    // normalisation and a local declaration keeps scope "local": the demand stops firing, keyFor
    // falls through to the project branch anyway, and the tokens land under the literal segment
    // "null" — the shared namespace this whole check exists to prevent, with the suite green.
    const withId = m.loadConfig(scopedPaths({ project: { projectId: "proj-x" }, local: { oauth: { ado: OAUTH_DECL } } }));
    assert.equal(withId.oauth.ado.scope, "project", "the keystore namespace");
    assert.equal(withId.oauth.ado.home, "local", "the file that declared it");

    assert.throws(() => m.loadConfig(scopedPaths({ local: { oauth: { ado: OAUTH_DECL } } })), /projectId/);
});

test("an unknown key inside an oauth declaration is refused, not ignored", () => {
    // Closed schema: a typo fails loudly. Note the asymmetry with the TOP level, where unknown keys are
    // only a warning because schemaVersion is what reports genuine skew.
    const cfg = { projectId: "proj-x", oauth: { ado: { ...OAUTH_DECL, tenantid: OAUTH_TENANT_ID } } };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /unknown key "tenantid"/);
});

test("a tenantId that is not a GUID is refused at parse time", () => {
    const cfg = { projectId: "proj-x", oauth: { ado: { ...OAUTH_DECL, tenantId: "contoso" } } };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /tenantId/);
});

test("an empty scope list is refused, because /.default alone still needs offline_access", () => {
    const cfg = { projectId: "proj-x", oauth: { ado: { ...OAUTH_DECL, scopes: [] } } };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /scopes/);
});

test("an authorized block on a project-scope oauth declaration is reported, not silently dropped", () => {
    // authorizationFor honours the block only at user scope, so a project one is inert. The secret
    // merge warns about exactly this; accepting it in silence here would leave a grant that reads as
    // effective in the file and is not.
    const cfg = m.loadConfig(projectPaths({ projectId: "proj-x",
        oauth: { ado: { ...OAUTH_DECL, authorized: { servers: {} } } } }));
    assert.ok(cfg.warnings.some((w) => /oauth "ado".*only authorizes at user scope/.test(w)),
        `expected a scope warning, got: ${cfg.warnings.join(" | ")}`);
});

test("a whitespace-only clientId or scope is empty, and is refused as one", () => {
    // `!== ""` and `.trim() !== ""` differ on exactly this input, and the difference is invisible
    // until sign-in: a blank clientId reaches Entra as a request for an app registration that does
    // not exist, and the error names the tenant rather than the field that was blank.
    assert.throws(() => m.loadConfig(projectPaths({ projectId: "proj-x",
        oauth: { ado: { ...OAUTH_DECL, clientId: "   " } } })), /clientId/);
    assert.throws(() => m.loadConfig(projectPaths({ projectId: "proj-x",
        oauth: { ado: { ...OAUTH_DECL, scopes: ["  "] } } })), /scopes/);
});

test("an oauth name is constrained to the secret charset, not the launchable one", () => {
    // The name becomes part of a keystore key, and SECRET_NAME_RE admits [a-z0-9-] only. A launchable
    // name like claude_ai_Microsoft_365 is legal as a SERVER and would produce an unusable key.
    const cfg = { projectId: "proj-x", oauth: { Ado_Mcp: OAUTH_DECL } };
    // The charset itself, not just the word "name": any later check that fires earlier and happens to
    // say "name" would otherwise satisfy this and the charset choice would go unguarded.
    assert.throws(() => m.loadConfig(projectPaths(cfg)),
        (e) => /name must match/.test(e.message) && e.message.includes(m.SECRET_NAME_RE.source));
});

test("a project-scope oauth declaration without projectId is refused", () => {
    // Measured: "vc-secrets:" + null + ":oauth-ado-refresh" PASSES the keystore-key charset, because
    // null stringifies to four characters that are all [a-z0-9-]. Without this refusal the refresh
    // token lands in a null namespace shared by every project on the machine that omits projectId — and
    // no guard, no test and no log line notices.
    const cfg = { oauth: { ado: OAUTH_DECL } };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /projectId/);
});

test("a declaration with no targetPackage is refused", () => {
    // Optional here means a later preload that requires all its inputs takes no action, and the session
    // dies at the one-hour boundary with nothing red anywhere.
    const cfg = { projectId: "proj-x", oauth: { ado: { ...OAUTH_DECL, targetPackage: undefined } } };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /targetPackage/);
});

test("config validation accepts exactly the target names the runtime matcher can build a pattern from", () => {
    // A name the loader accepts but the matcher cannot build from is a session that never renews;
    // the reverse refuses a declaration that would have worked.
    // Identity covers what the launcher exports. What loadConfig itself tests is pinned only on the
    // samples below: a second expression that agrees with the matcher on all of them would pass.
    assert.equal(m.PACKAGE_NAME_RE, target.PACKAGE_NAME_RE, "the launcher exports the matcher's regex, not a copy");
    assert.equal(m.BIN_NAME_RE, target.BIN_NAME_RE, "the launcher exports the matcher's regex, not a copy");

    const load = (fields) => m.loadConfig(projectPaths({ projectId: "proj-x",
        oauth: { ado: { ...OAUTH_DECL, ...fields } } }));

    for (const targetPackage of ["some-oauth-package", "@vendor/server", "a.b_c-d"]) {
        assert.doesNotThrow(() => load({ targetPackage }));
        assert.doesNotThrow(() => target.targetEntryPattern(targetPackage));
    }
    for (const targetPackage of [".*", "@vendor/server|.*", "../../etc", "a b", "UPPER", "@vendor/"]) {
        assert.throws(() => load({ targetPackage }), /targetPackage/);
        assert.throws(() => target.targetEntryPattern(targetPackage), /package name/);
    }

    for (const binName of ["srv", "mcp-server-x"]) {
        assert.doesNotThrow(() => load({ binName }));
        assert.doesNotThrow(() => target.targetEntryPattern("@vendor/server", binName));
    }
    // Not "" or null: a declaration refuses those while the preload treats an empty value as
    // absent -- deliberate, and covered by the runtime matcher's own suite.
    for (const binName of [".*", "a/b", "a b", "SRV"]) {
        assert.throws(() => load({ binName }), /binName/);
        assert.throws(() => target.targetEntryPattern("@vendor/server", binName), /bin name/);
    }
});

test("the same oauth name in two scopes is reported as a collision, not silently overwritten", () => {
    // Secrets, servers and tasks all push one. For a credential declaration a silent overwrite means
    // signing in against coordinates nobody can see in the file they are reading.
    const decl = { projectId: "proj-x", oauth: { ado: OAUTH_DECL } };
    const paths = scopedPaths({ project: decl, local: decl });
    const cfg = m.loadConfig(paths);
    assert.ok(cfg.collisions.some((c) => c.kind === "oauth" && c.name === "ado"));
});

test("an oauth reference parses to its own kind", () => {
    assert.deepEqual(m.parseReference("oauth:ado"), { kind: "oauth", name: "ado", field: null });
});

test("a field accessor on an oauth reference is refused", () => {
    // A token is not a JSON document; .field on it would silently resolve to undefined.
    assert.throws(() => m.parseReference("oauth:ado.token"), /no fields to select/);
});

const REGISTRATION_BLOCK = { servers: { s: { command: "npx", args: ["-y", "some-oauth-package"], envKeys: ["ADO_TOKEN"] } } };
const OAUTH_CLIENT_ID = OAUTH_DECL.clientId;

test("a project-scope oauth declaration is unauthorized until the user file says otherwise", () => {
    const cfg = m.loadConfig(scopedPaths({
        user: {},
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL } },
    }));
    const source = m.authorizationFor(cfg, cfg.oauth.ado);
    assert.notEqual(source, null, "a merged project-scope oauth decl must reach the registrations branch");
    assert.equal(source.where, `registrations."${OAUTH_TENANT_ID}"."${OAUTH_CLIENT_ID}"`);
    assert.equal(source.block, undefined);
});

test("the authorization is keyed by the registration, not by the declaration name", () => {
    // Two projects naming the same registration are one decision, and renaming a declaration must
    // not silently revoke it.
    const cfg = m.loadConfig(scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK } } },
        project: { projectId: "proj-x", oauth: { anything: OAUTH_DECL } },
    }));
    const source = m.authorizationFor(cfg, cfg.oauth.anything);
    // Stated rather than presupposed: without it this test crashes on `.block` of null when the
    // branch is absent, which is test 53's invariant reported as a stack trace under test 54's name.
    assert.notEqual(source, null, "the registrations branch must exist for this test to say anything");
    assert.deepEqual(source.block, REGISTRATION_BLOCK);
});

test("a registrations block in a project file is not honoured", () => {
    // Otherwise the repository authorizes itself, which is the whole hole.
    const cfg = m.loadConfig(scopedPaths({
        user: {},
        project: {
            projectId: "proj-x",
            oauth: { ado: OAUTH_DECL },
            registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK } },
        },
    }));
    const source = m.authorizationFor(cfg, cfg.oauth.ado);
    // Stated rather than presupposed: without it this test crashes on `.block` of null when the
    // branch is absent, which is test 53's invariant reported as a stack trace under test 55's name.
    assert.notEqual(source, null, "the registrations branch must exist for this test to say anything");
    assert.equal(source.block, undefined);
    assert.ok(cfg.warnings.some((w) => /"registrations" only authorizes at user scope/.test(w)),
        `expected a scope warning, got: ${cfg.warnings.join(" | ")}`);
});

test("a user-scope oauth declaration is authorized on the declaration, as a secret is", () => {
    // It is your own file, so the grant sits on the declaration. The `where` must name where it
    // actually lives — under oauth, not under secrets.
    const cfg = m.loadConfig(scopedPaths({ user: { oauth: { ado: { ...OAUTH_DECL, authorized: REGISTRATION_BLOCK } } } }));
    const a = m.authorizationFor(cfg, cfg.oauth.ado);
    assert.deepEqual(a.block, REGISTRATION_BLOCK);
    assert.equal(a.where, `oauth."ado".authorized`);
});

test("a mixed-case tenantId declaration is authorized against a lower-case grant", () => {
    const cfg = m.loadConfig(scopedPaths({
        user: { registrations: { [CASE_TENANT_ID_LOWER]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK } } },
        project: { projectId: "proj-x", oauth: { ado: { ...OAUTH_DECL, tenantId: CASE_TENANT_ID_UPPER } } },
    }));
    const source = m.authorizationFor(cfg, cfg.oauth.ado);
    assert.notEqual(source, null, "the registrations branch must exist for this test to say anything");
    assert.deepEqual(source.block, REGISTRATION_BLOCK);
    // The pointer's job is to name the exact key to write — printed canonical, not as declared.
    assert.equal(source.where, `registrations."${CASE_TENANT_ID_LOWER}"."${OAUTH_CLIENT_ID}"`);
});

test("a lower-case tenantId declaration is authorized against a mixed-case grant", () => {
    const cfg = m.loadConfig(scopedPaths({
        user: { registrations: { [CASE_TENANT_ID_UPPER]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK } } },
        project: { projectId: "proj-x", oauth: { ado: { ...OAUTH_DECL, tenantId: CASE_TENANT_ID_LOWER } } },
    }));
    const source = m.authorizationFor(cfg, cfg.oauth.ado);
    assert.notEqual(source, null, "the registrations branch must exist for this test to say anything");
    assert.deepEqual(source.block, REGISTRATION_BLOCK);
    assert.equal(source.where, `registrations."${CASE_TENANT_ID_LOWER}"."${OAUTH_CLIENT_ID}"`);
});

test("two registrations tenant keys differing only by case are refused, naming both spellings", () => {
    // Canonicalising would otherwise collapse these into one key and silently drop whichever grant
    // loses the collision.
    assert.throws(() => m.loadConfig(scopedPaths({
        user: {
            registrations: {
                [CASE_TENANT_ID_UPPER]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK },
                [CASE_TENANT_ID_LOWER]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK },
            },
        },
    })), (e) => e.message.includes(CASE_TENANT_ID_UPPER) && e.message.includes(CASE_TENANT_ID_LOWER));
});

test("loadConfig refuses malformed registrations blocks", () => {
    // A bare `true` leaf: the shape an earlier draft of this feature used, and the operator explicitly
    // voided it — nothing else in the suite feeds this shape in.
    assert.throws(() => m.loadConfig(scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { c: true } } },
    })), /"authorized" must be an object/);
    // A leaf missing envKeys.
    assert.throws(() => m.loadConfig(scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { c: { servers: { s: { command: "x", args: [] } } } } } },
    })), /needs "envKeys" as an array of strings/);
    // A leaf whose kind is neither servers nor tasks.
    assert.throws(() => m.loadConfig(scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { c: { oauth: {} } } } },
    })), /is not a kind \(expected servers\/tasks\)/);
    // registrations as a string rather than an object.
    assert.throws(() => m.loadConfig(scopedPaths({
        user: { registrations: "not-an-object" },
    })), /"registrations" must be an object keyed by tenant id/);
    // A tenant key mapping to a number.
    assert.throws(() => m.loadConfig(scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: 5 } },
    })), /must be an object keyed by client id/);
});

test("a config carrying an oauth env reference LOADS", () => {
    // The gate that decides this is validateLaunchables, not parseReference. Constructing cfg by
    // hand would pass while every real config still failed at load.
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL },
        servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: "oauth:ado" } } } } }));
    assert.equal(cfg.servers.s.env.ADO_TOKEN, "oauth:ado");
});

test("an unprefixed env value is still refused, and so are the near-misses", () => {
    // parseReference RETURNS NULL for these — it does not throw. The refusal lives in
    // validateLaunchables, which is where this must be asserted.
    for (const v of ["oauths:ado", "OAuth:ado", "oauth ado", "plain-value"]) {
        assert.equal(m.parseReference(v), null, `${v} parses to null`);
        assert.throws(() => m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
            servers: { s: { command: "x", args: [], env: { E: v } } } } })), /must be "secret:<name>"/, v);
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

test("an oauth entry key is a full three-segment key the read builder accepts", () => {
    const keys = m.oauthEntryKeys("ado", { scope: "project" }, { projectId: "p1" });
    assert.equal(keys.refresh, `${m.KEY_PREFIX}:p1:oauth-ado-refresh`);
    assert.equal(keys.access, `${m.KEY_PREFIX}:p1:oauth-ado-access`);
    assert.doesNotThrow(() => m.buildLocalRead("gpg", keys.refresh));
});

test("a user-scope oauth declaration lands in the user namespace, not the project's", () => {
    const keys = m.oauthEntryKeys("ado", { scope: "user" }, { projectId: "p1" });
    assert.equal(keys.refresh, `${m.KEY_PREFIX}:user:oauth-ado-refresh`);
    assert.equal(keys.access, `${m.KEY_PREFIX}:user:oauth-ado-access`);
});

test("an oauth entry key colliding with a same-spelled secret is reported, naming both sides", () => {
    // SECRET_NAME_RE admits `oauth-ado-refresh`, which is what lets the two derive one key.
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-refresh": { backend: "local" } } } }));
    const clashes = m.oauthKeyClashes(cfg);
    assert.equal(clashes.length, 1);
    assert.match(clashes[0], /oauth "ado"/);
    assert.match(clashes[0], /secret "oauth-ado-refresh"/);
    assert.ok(clashes[0].includes(`${m.KEY_PREFIX}:proj-x:oauth-ado-refresh`));
});

test("no clash is reported when an oauth entry and a secret merely look similar", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado": { backend: "local" } } } }));
    assert.deepEqual(m.oauthKeyClashes(cfg), []);
});

test("a clash on the access entry is reported, and names that entry rather than the refresh one", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-access": { backend: "local" } } } }));
    const clashes = m.oauthKeyClashes(cfg);
    assert.equal(clashes.length, 1);
    assert.match(clashes[0], /access entry/);
    // The role is interpolated, not spelled: a hardcoded "refresh" is invisible to every fixture
    // that happens to collide on the refresh entry, which is all the others.
    assert.doesNotMatch(clashes[0], /refresh entry/);
});

test("the secret side's own scope decides the clash, in both directions", () => {
    const across = m.loadConfig(scopedPaths({
        user: { secrets: { "oauth-ado-refresh": { backend: "local" } } },
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL } },
    }));
    assert.deepEqual(m.oauthKeyClashes(across), [],
        "a user secret and a project sign-in are different namespaces — neither can overwrite the other");

    const together = m.loadConfig(scopedPaths({
        user: { secrets: { "oauth-ado-refresh": { backend: "local" } }, oauth: { ado: OAUTH_DECL } },
        project: { projectId: "proj-x" },
    }));
    const clashes = m.oauthKeyClashes(together);
    assert.equal(clashes.length, 1);
    assert.ok(clashes[0].includes(`${m.KEY_PREFIX}:user:oauth-ado-refresh`));
});

test("a keyvault secret holds no keystore slot, so its spelling is not a clash", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-refresh": { backend: "keyvault", vault: "demo-vault", secret: "s" } } } }));
    assert.deepEqual(m.oauthKeyClashes(cfg), []);
});

test("both entries of one sign-in clashing are both reported", () => {
    const cfg = m.loadConfig(scopedPaths({ project: { projectId: "proj-x",
        oauth: { ado: OAUTH_DECL },
        secrets: { "oauth-ado-refresh": { backend: "local" }, "oauth-ado-access": { backend: "local" } } } }));
    const clashes = m.oauthKeyClashes(cfg);
    // Every other fixture collides on exactly one entry, so their "length === 1" pins
    // "no more than one" and never "all of them".
    assert.equal(clashes.length, 2);
    assert.ok(clashes.some((c) => /refresh entry/.test(c)));
    assert.ok(clashes.some((c) => /access entry/.test(c)));
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

test("loadConfig: schemaVersion above what the launcher supports → VcSecretsError names the version", () => {
    const paths = scopedPaths({ project: { schemaVersion: 999, secrets: {}, servers: {}, tasks: {} } });
    assert.throws(() => m.loadConfig(paths), /schemaVersion 999/);
});

test("loadConfig: tasks validated identically to servers — bad shape and dangerous env key both throw", () => {
    assert.throws(() => m.loadConfig(projectPaths({ secrets: {}, servers: {}, tasks: { t: null } })), /task "t"/);
    assert.throws(() => m.loadConfig(projectPaths({ secrets: {}, servers: {}, tasks: { t: { command: "x", args: [1], env: {} } } })), /task "t".*args/);
    assert.throws(() => m.loadConfig(projectPaths({ secrets: {}, servers: {}, tasks: { t: { command: "x", args: [], env: { NODE_OPTIONS: "x" } } } })), /task "t".*NODE_OPTIONS/);
});

test("configPaths: walks up from a nested cwd to find <repo>/.claude/vc-secrets.json", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-repo-"));
    tmpDirs.push(root);
    const claudeDir = path.join(root, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, m.CONFIG_NAME), JSON.stringify({ secrets: {}, servers: {} }));
    const nested = path.join(root, "nested", "deeper");
    fs.mkdirSync(nested, { recursive: true });
    const paths = m.configPaths({ HOME: "/nonexistent-home" }, nested);
    assert.equal(paths.project, path.join(claudeDir, m.CONFIG_NAME));
    assert.equal(paths.local, path.join(claudeDir, m.LOCAL_CONFIG_NAME));
});

const CFG = {
    secrets: {
        "ado-pat": { backend: "local" },
        "azure-monitor-sp": { backend: "keyvault", vault: "demo-vault", secret: "monitor-sp-nonprod", format: "json" },
    },
    servers: {
        "azure-mcp": { command: "npx", args: ["-y"], env: { ADO_MCP_AUTH_TOKEN: "secret:ado-pat", LITERAL: "literal:as-is" } },
        "azure-monitor": {
            command: "dnx", args: [],
            env: { AZURE_TENANT_ID: "secret:azure-monitor-sp.tenantId", AZURE_CLIENT_SECRET: "secret:azure-monitor-sp.clientSecret" },
        },
        "bad-ref": { command: "x", args: [], env: { X: "secret:nope" } },
        "bad-field": { command: "x", args: [], env: { X: "secret:ado-pat.field" } },
    },
    tasks: {},
    // A keyvault read is paid for by whatever identity `az` holds, so it needs the owner's authorization
    // even though the vault and secret name come from the project — hence this block rather than a
    // `authorized` block on a declaration the project owns.
    vaults: { "demo-vault": { "monitor-sp-nonprod": { servers: {
        "azure-monitor": { command: "dnx", args: [], envKeys: ["AZURE_TENANT_ID", "AZURE_CLIENT_SECRET"] },
    } } } },
};

test("resolveEnvEntries: literal passthrough + secret resolution", async () => {
    const { env } = await m.resolveEnvEntries("azure-mcp", CFG, async () => "tok");
    assert.deepEqual(env, { ADO_MCP_AUTH_TOKEN: "tok", LITERAL: "as-is" });
});

test("resolveEnvEntries: json fields, one fetch per secret", async () => {
    let calls = 0;
    const { env } = await m.resolveEnvEntries("azure-monitor", CFG, async () => {
        calls += 1;
        return JSON.stringify({ tenantId: "t", clientId: "c", clientSecret: "s" });
    });
    assert.deepEqual(env, { AZURE_TENANT_ID: "t", AZURE_CLIENT_SECRET: "s" });
    assert.equal(calls, 1);
});

// Two Key Vault secrets, each authorized for the one server, so the reads these tests count are ones the
// launch is entitled to make.
function keyvaultPairCfg({ grantB = true } = {}) {
    // The shape check compares the server's whole env key list, so both grants name both variables.
    const grant = () => ({ servers: { s: { command: "dnx", args: [], envKeys: ["A", "B"] } } });

    return {
        secrets: {
            a: { backend: "keyvault", vault: "demo-vault", secret: "sa" },
            b: { backend: "keyvault", vault: "demo-vault", secret: "sb" },
        },
        servers: { s: { command: "dnx", args: [], env: { A: "secret:a", B: "secret:b" } } },
        tasks: {},
        vaults: { "demo-vault": { sa: grant(), ...(grantB ? { sb: grant() } : {}) } },
    };
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test("resolveEnvEntries: Key Vault reads run in parallel, so two that wait for each other both finish",
    { timeout: 15_000 },
    async () => {
        const started = [];
        let bothStarted = null;
        const gate = new Promise((resolve) => { bothStarted = resolve; });
        // Sequential reading never starts the second call, so the first waits on it forever; the deadline
        // turns that into a failure instead of a hung suite.
        const outcome = await m.withDeadline(m.resolveEnvEntries("s", keyvaultPairCfg(), async (name) => {
            started.push(name);
            if (started.length === 2) {
                bothStarted();
            }
            await gate;

            return `value-${name}`;
        }), 3000, () => "deadlock");
        assert.notEqual(outcome, "deadlock", `only ${started.join(", ")} was ever asked for: the reads are sequential`);
        assert.deepEqual(outcome.env, { A: "value-a", B: "value-b" });
    });

test("resolveEnvEntries: with several Key Vault reads failing, the first entry's error is the one reported, and none is left unhandled",
    async () => {
        const unhandled = [];
        const onUnhandled = (reason) => { unhandled.push(reason); };
        process.on("unhandledRejection", onUnhandled);
        try {
            const asked = [];
            await assert.rejects(m.resolveEnvEntries("s", keyvaultPairCfg(), async (name) => {
                asked.push(name);
                if (name === "a") {
                    await delay(50);
                    throw new m.VcSecretsError("secret \"a\": late failure");
                }
                throw new m.VcSecretsError("secret \"b\": early failure");
            }), /secret "a": late failure/);
            assert.deepEqual(asked, ["a", "b"], "both reads were started before either was awaited");
            // Past the point where an unobserved rejection would have been reported.
            await delay(50);
            await new Promise((resolve) => setImmediate(resolve));
            assert.deepEqual(unhandled, [], "the second entry's rejection must have been observed");
        } finally {
            process.off("unhandledRejection", onUnhandled);
        }
    });

test("resolveEnvEntries: a Key Vault read that rejects with something that is not an Error is thrown, never used as a value",
    async () => {
        const unhandled = [];
        const onUnhandled = (reason) => { unhandled.push(reason); };
        process.on("unhandledRejection", onUnhandled);
        try {
            let outcome = null;
            await assert.rejects(m.resolveEnvEntries("s", keyvaultPairCfg(), async (name) => {
                if (name === "b") {
                    throw "not-an-error";   // eslint-disable-line no-throw-literal
                }

                return "value-a";
            }).then((r) => { outcome = r; }), (e) => e === "not-an-error");
            assert.equal(outcome, null, "no env was produced from the rejection");
            await delay(20);
            assert.deepEqual(unhandled, []);
        } finally {
            process.off("unhandledRejection", onUnhandled);
        }
    });

test("resolveEnvEntries: Key Vault reads start only after prefetch has resolved, so on win32 they start inside the bound job",
    async () => {
        const order = [];
        const { env } = await m.resolveEnvEntries("s", keyvaultPairCfg(), async (name) => {
            order.push(`read ${name}`);

            return `value-${name}`;
        }, "servers", { prefetch: async () => {
            order.push("bind started");
            await delay(30);
            order.push("bind done");

            return new Map();
        } });
        assert.deepEqual(order, ["bind started", "bind done", "read a", "read b"]);
        assert.deepEqual(env, { A: "value-a", B: "value-b" });
    });

test("resolveEnvEntries: a refused entry makes no Key Vault read at all, not even for an entry before it", async () => {
    const asked = [];
    await assert.rejects(m.resolveEnvEntries("s", keyvaultPairCfg({ grantB: false }), async (name) => {
        asked.push(name);

        return "value";
    }), /env B: /);
    assert.deepEqual(asked, [], "authorization is decided for every entry before the first read starts");
});

test("resolveEnvEntries: unknown server → VcSecretsError, resolver never called", async () => {
    let called = false;
    await assert.rejects(
        m.resolveEnvEntries("ghost", CFG, async () => { called = true; return ""; }),
        m.VcSecretsError);
    assert.equal(called, false);
});

test("resolveEnvEntries: unknown task name names it a task, not a server", async () => {
    let called = false;
    await assert.rejects(
        m.resolveEnvEntries("ghost", CFG, async () => { called = true; return ""; }, "tasks"),
        /unknown task "ghost"/);
    assert.equal(called, false);
});

test("resolveEnvEntries: undeclared secret → VcSecretsError before resolving", async () => {
    // "before resolving" is the title's second half. Without the counter, an implementation that
    // resolved first and validated afterwards satisfies the rejection just as well -- and would have
    // spawned a keystore tool for a name nobody declared.
    let asked = 0;
    await assert.rejects(m.resolveEnvEntries("bad-ref", CFG, async () => { asked += 1; return ""; }),
        /undeclared secret/);
    assert.equal(asked, 0, "the resolver must not be reached");
});

test("resolveEnvEntries: field on non-json secret → VcSecretsError", async () => {
    await assert.rejects(m.resolveEnvEntries("bad-field", CFG, async () => "x"), /format: "json"/);
});

test("resolveEnvEntries: valid JSON that is not an object names the shape, and never throws TypeError", async () => {
    // `null` is the one that used to escape as a raw TypeError: JSON.parse accepts it, and indexing
    // it throws before the missing-field diagnostic below could run -- so a wrong-shaped secret
    // surfaced as an internal launcher failure. The scalars did not throw; they reached "missing
    // string field", which is true and names the wrong problem when there is no object to select from.
    for (const body of ["null", "5", '"a string"', "true"]) {
        await assert.rejects(
            m.resolveEnvEntries("azure-monitor", CFG, async () => body),
            (e) => {
                assert.ok(e instanceof m.VcSecretsError, `${body}: must stay a VcSecretsError, got ${e?.constructor?.name}`);
                assert.match(e.message, /valid JSON but not an object/, body);

                return true;
            },
            body);
    }

    // An array indexes harmlessly, so it keeps the field diagnostic rather than gaining a second one.
    await assert.rejects(m.resolveEnvEntries("azure-monitor", CFG, async () => "[]"), /missing string field/);
});

test("resolveEnvEntries: json parse failure names reference, not value", async () => {
    await assert.rejects(
        m.resolveEnvEntries("azure-monitor", CFG, async () => "SECRET-NOT-JSON"),
        (e) => e instanceof m.VcSecretsError && !e.message.includes("SECRET-NOT-JSON") && e.message.includes("azure-monitor-sp"));
});

test("resolveEnvEntries: missing json field named, value absent", async () => {
    await assert.rejects(
        m.resolveEnvEntries("azure-monitor", CFG, async () => JSON.stringify({ clientSecret: "hush" })),
        (e) => e instanceof m.VcSecretsError && e.message.includes("tenantId") && !e.message.includes("hush"));
});

test("resolveEnvEntries: prototype-chain server name → VcSecretsError /unknown server/", async () => {
    await assert.rejects(m.resolveEnvEntries("constructor", CFG, async () => ""), /unknown server/);
});

test("resolveEnvEntries: prototype-chain secret name → VcSecretsError /undeclared secret/, resolver never called", async () => {
    let called = false;
    const cfg = { secrets: {}, servers: { s: { command: "x", args: [], env: { X: "secret:constructor" } } } };
    await assert.rejects(
        m.resolveEnvEntries("s", cfg, async () => { called = true; return ""; }),
        /undeclared secret/);
    assert.equal(called, false);
});

test("detectLocalBackend: platform rule (WSL is linux → gpg)", () => {
    assert.equal(m.detectLocalBackend("win32", {}), "wcm");
    assert.equal(m.detectLocalBackend("darwin", {}), "keychain");
    assert.equal(m.detectLocalBackend("linux", {}), "gpg");
});

test("detectLocalBackend: VC_SECRETS_LOCAL_BACKEND override, invalid rejected", () => {
    assert.equal(m.detectLocalBackend("linux", { VC_SECRETS_LOCAL_BACKEND: "keychain" }), "keychain");
    assert.throws(() => m.detectLocalBackend("linux", { VC_SECRETS_LOCAL_BACKEND: "vault9000" }), m.VcSecretsError);
});

test("redactSecrets: all occurrences, longest value first", () => {
    assert.equal(m.redactSecrets("err tok1 and tok1/tok2", ["tok1", "tok2"]), "err *** and ***/***");
    assert.equal(m.redactSecrets("abc", ["ab", "abc"]), "***");
    assert.equal(m.redactSecrets("clean", []), "clean");
});

test("keyFor: project scope uses the project's namespace, user scope uses \"user\"", () => {
    assert.equal(m.keyFor("ado-pat", { scope: "project" }, { projectId: "myproj" }), "vc-secrets:myproj:ado-pat");
    assert.equal(m.keyFor("ado-pat", { scope: "user" }, {}), "vc-secrets:user:ado-pat");
});

test("keyToPath: puts the file under a per-scope directory", () => {
    const projectPath = m.keyToPath("vc-secrets:myproj:ado-pat", { HOME: "/h" });
    assert.ok(projectPath.endsWith(path.join("myproj", "ado-pat.gpg")));
    const userPath = m.keyToPath("vc-secrets:user:ado-pat", { HOME: "/h" });
    assert.ok(userPath.endsWith(path.join("user", "ado-pat.gpg")));
});

test("builders: no secret and no raw script in argv, timeouts per spec", () => {
    const gpgRead = m.buildLocalRead("gpg", "vc-secrets:user:ado-pat", { HOME: "/h" });
    assert.equal(gpgRead.cmd, "gpg");
    assert.equal(gpgRead.timeoutMs, 10_000);
    assert.ok(gpgRead.args.some((a) => a.endsWith("ado-pat.gpg")));
    const pinentryIdx = gpgRead.args.indexOf("--pinentry-mode");
    assert.ok(pinentryIdx !== -1, "non-interactive gpg read must set --pinentry-mode (no pinentry under the kill timer)");
    assert.equal(gpgRead.args[pinentryIdx + 1], "cancel");

    const wcmRead = m.buildLocalRead("wcm", "vc-secrets:user:ado-pat", {});
    assert.equal(wcmRead.cmd, "powershell.exe");
    assert.ok(wcmRead.args.includes("-EncodedCommand"), "must use EncodedCommand, not -Command");
    assert.ok(!wcmRead.args.some((a) => a.includes("CredRead")), "raw script must not be in argv");
    const encoded = wcmRead.args[wcmRead.args.indexOf("-EncodedCommand") + 1];
    assert.ok(Buffer.from(encoded, "base64").toString("utf16le").includes("CredRead"));
    assert.deepEqual(wcmRead.extraEnv, { VC_SECRETS_NAME: "vc-secrets:user:ado-pat" });

    const wcmViaPwsh = m.buildLocalRead("wcm", "vc-secrets:user:ado-pat", { VC_SECRETS_POWERSHELL: "pwsh" });
    assert.equal(wcmViaPwsh.cmd, "pwsh");

    const wcmWrite = m.buildLocalWrite("wcm", "vc-secrets:user:ado-pat", {});
    assert.equal(wcmWrite.stdinData, m.VALUE_ON_STDIN);
    const writeEncoded = wcmWrite.args[wcmWrite.args.indexOf("-EncodedCommand") + 1];
    assert.ok(Buffer.from(writeEncoded, "base64").toString("utf16le").includes("InputEncoding"),
        "write script must set Console.InputEncoding to UTF-8 (non-ASCII secrets)");

    const kcWrite = m.buildLocalWrite("keychain", "vc-secrets:user:ado-pat", { USER: "u" });
    assert.equal(kcWrite.interactive, true);
    assert.equal(kcWrite.timeoutMs, null, "interactive specs must not carry a kill timer");

    const gpgWrite = m.buildLocalWrite("gpg", "vc-secrets:user:ado-pat", { HOME: "/h", VC_SECRETS_GPG_RECIPIENT: "dev@x" });
    assert.ok(gpgWrite.args.includes("--trust-model"), "explicit recipient needs trust-model always");

    const kv = m.buildKeyvaultRead({ vault: "demo-vault", secret: "monitor-sp-nonprod" });
    assert.equal(kv.cmd, "az");
    assert.deepEqual(kv.args, ["keyvault", "secret", "show", "--vault-name", "demo-vault", "--name", "monitor-sp-nonprod", "--query", "value", "-o", "tsv"]);
    assert.equal(kv.timeoutMs, 20_000);
});

test("the write script sizes the blob in BYTES, which is what doubles the usable length", () => {
    // 1280 chars at UTF-16 against 2560 at UTF-8, against a 2560-byte ceiling. The measured
    // refresh entry is 2010 bytes; as UTF-16 that is 4020 and does not fit at all.
    assert.match(m.PS_CRED_WRITE, /UTF8\.GetBytes/);
    assert.doesNotMatch(m.PS_CRED_WRITE, /StringToCoTaskMemUni/);

    // The size field is the half that must agree with the buffer. Keeping UTF8.GetBytes while
    // restoring `$value.Length*2` satisfies both lines above and is WORSE than the original
    // defect: CredWrite is then handed a length twice the allocation and marshals past it.
    assert.match(m.PS_CRED_WRITE, /CredentialBlobSize=\$bytes\.Length/);
});

test("the read script prints hex, because the encoding has to be decided from the bytes", () => {
    // Reverting this to PtrToStringUni would read a UTF-8 blob as UTF-16 and yield mojibake with
    // no error anywhere.
    assert.match(m.PS_CRED_READ, /ToString\("x2"\)/);
    assert.doesNotMatch(m.PS_CRED_READ, /PtrToStringUni/);
});

function markerHome() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-marker-"));
    tmpDirs.push(dir);

    return { XDG_CONFIG_HOME: dir };
}

test("the oversize marker lives beside the keystore, not inside it, and keeps the key's scope", () => {
    // A sibling of `secrets/` rather than a child: something that walks the keystore directory must
    // not meet a diagnostic file there and try to read it as an entry. And per-scope like the keys
    // themselves -- two projects on one machine declare the same entry NAME routinely, and a flat
    // layout would have each overwrite the other's marker and report the wrong project's overflow.
    const env = markerHome();
    const user = m.oversizeMarkerPath("vc-secrets:user:oauth-ado-dev-access", env);
    const project = m.oversizeMarkerPath("vc-secrets:p1:oauth-ado-dev-access", env);
    assert.equal(path.dirname(path.dirname(user)), path.join(env.XDG_CONFIG_HOME, "vc-secrets", "state"));
    assert.equal(path.dirname(m.secretsDir(env)), path.dirname(path.dirname(path.dirname(user))),
        "the state directory must sit beside the secrets directory, not under it");
    assert.notEqual(user, project, "two scopes may not share one marker");
});

test("the oversize marker records the measurement and no byte of the value", () => {
    // The value is the access TOKEN. Nothing about it may reach a file that exists to be read by a
    // diagnostic and pasted into a report -- so the marker is handed a byte count and never the
    // bytes, and the assertion below is on the whole object rather than on the fields of interest:
    // a field added later carrying part of the value would pass a field-by-field check.
    const env = markerHome();
    const key = "vc-secrets:user:oauth-ado-dev-access";
    m.recordOversizeMarker(key, { backend: "wcm", bytes: 2588, limit: 2560, env, at: 1_700_000_000 });
    assert.deepEqual(JSON.parse(fs.readFileSync(m.oversizeMarkerPath(key, env), "utf8")),
        { key, backend: "wcm", bytes: 2588, limit: 2560, at: 1_700_000_000 });
});

test("the oversize marker reads back, clears, and reports nothing once cleared", () => {
    // Clearing is the half that makes this a CURRENT STATE rather than a log of something once
    // true. Without it doctor keeps naming an overflow that a later, smaller entry already fixed --
    // wrong in the reassuring direction, which is the expensive direction for a diagnostic.
    const env = markerHome();
    const key = "vc-secrets:user:oauth-ado-dev-access";
    m.recordOversizeMarker(key, { backend: "wcm", bytes: 2588, limit: 2560, env });
    assert.equal(m.readOversizeMarker(key, env).bytes, 2588);
    m.clearOversizeMarker(key, env);
    assert.equal(m.readOversizeMarker(key, env), null);
});

test("clearing a marker that was never written is silent, since that is every ordinary success", () => {
    // Clear runs on the SUCCESS path of every login and every renewal, and almost none of them ever
    // overflowed. Throwing here would fail a working sign-in over a file that correctly does not
    // exist.
    const env = markerHome();
    m.clearOversizeMarker("vc-secrets:user:oauth-ado-dev-access", env);
});

test("a corrupt marker reads as no marker, because a hint that cannot be read is not a finding", () => {
    // Deliberately the opposite call from the keystore reads, where collapsing absent with
    // unreadable is a defect -- see PS_CRED_READ's ERROR_NOT_FOUND check and newKeyPresent, which
    // both insist the two stay apart. What hangs on this one is whether doctor
    // prints one advisory line -- not whether a token exists -- so inventing a finding out of an
    // unparseable diagnostic would send a developer to diagnose the diagnostic.
    const env = markerHome();
    const key = "vc-secrets:user:oauth-ado-dev-access";
    const file = m.oversizeMarkerPath(key, env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");
    assert.equal(m.readOversizeMarker(key, env), null);
});

test("recordOversizeMarker: a state path that cannot be created warns instead of failing the sign-in", () => {
    // Both call sites stand inside a catch that has already decided this failure will not fail the
    // operation -- cmdLogin says so in as many words, because a login rejected there costs an
    // interactive sign-in while the refresh token it just stored is rotated away by the next one.
    // clearOversizeMarker was guarded from the start; this is the sibling that was not, and the
    // asymmetry is reachable: a read-only profile, a full disk, or the case staged here.
    const env = markerHome();
    const key = "vc-secrets:user:oauth-ado-dev-access";
    fs.mkdirSync(path.join(env.XDG_CONFIG_HOME, "vc-secrets"), { recursive: true });
    fs.writeFileSync(path.join(env.XDG_CONFIG_HOME, "vc-secrets", "state"), "");
    assert.doesNotThrow(() => m.recordOversizeMarker(key,
        { backend: "wcm", bytes: 2588, limit: 2560, env }));
    assert.equal(m.readOversizeMarker(key, env), null,
        "a marker that could not be written must not read back as one that was");
});

test("a message improved for a human keeps the exit code the code reads", () => {
    // mapResolveError returns a NEW error in every branch, so it silently dropped toolExitCode --
    // and the caller still received an error, just one that no longer answered WHICH failure this
    // was. The oversize marker is the consumer that made it visible: it must record only exit 4,
    // and by the time the write failure reached it the 4 was gone.
    const raw = Object.assign(new Error("value too large for Credential Manager (2588 bytes; limit 2560)"),
        { toolExitCode: 4 });
    const mapped = m.mapResolveError("wcm", "oauth-ado-dev-access", raw);
    assert.equal(mapped.toolExitCode, 4, "the classification must survive the rewording");
    assert.match(mapped.message, /too large for Credential Manager/);
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

test("newKeyPresent on gpg: an entry that cannot be examined is not reported absent", async (t) => {
    // existsSync said false for both "no such file" and "I could not look", and every caller read
    // that as "nothing is stored". For migrate that is the difference between skipping and writing
    // the pre-rotation value over the current one -- which is exactly what this function's own
    // comment refuses to allow, on a backend where it did not hold.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-stat-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir };
    const key = "vc-secrets:user:ado-pat";
    denyFs(t, "statSync", m.keyToPath(key, env));
    await assert.rejects(() => m.newKeyPresent("gpg", key, env), /could not be examined/);
});

test("newKeyPresent on gpg: a genuinely missing entry is still simply absent", async () => {
    // The half that keeps the distinction useful rather than merely loud: ENOENT is the one answer
    // that means "no entry", and it must stay a quiet false.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-stat-absent-"));
    tmpDirs.push(dir);
    assert.equal(await m.newKeyPresent("gpg", "vc-secrets:user:ado-pat", { XDG_CONFIG_HOME: dir }), false);
});

test("readLegacyLocalValue on gpg: a legacy entry that cannot be examined is not 'no legacy entry'", async (t) => {
    // Answered null, migrate told the developer to run `set` and retype a secret that never left the
    // disk. A throw lands in migrate's own "migration failed" line, which names the path.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-legacy-stat-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir };
    denyFs(t, "statSync", m.legacyKeyToPath("ado-pat", env));
    await assert.rejects(() => m.readLegacyLocalValue("gpg", "ado-pat", env), /could not be examined/);
});

test("configPaths: a .claude that is a regular file is walked past, not refused", () => {
    // Nothing can live under a file, so the stat's ENOTDIR is an answer, not a failure. Refused, it
    // would stop every launch below such a directory, including ones whose project is further up.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-claude-file-"));
    tmpDirs.push(root);
    const claudeDir = path.join(root, ".claude");
    fs.mkdirSync(claudeDir);
    fs.writeFileSync(path.join(claudeDir, m.CONFIG_NAME), JSON.stringify({ secrets: {}, servers: {} }));
    const nested = path.join(root, "vendored");
    fs.mkdirSync(nested);
    fs.writeFileSync(path.join(nested, ".claude"), "a file, not a directory");

    const paths = m.configPaths({ HOME: "/nonexistent-home" }, nested);
    assert.equal(paths.project, path.join(claudeDir, m.CONFIG_NAME));
});

test("configPaths: a .claude or a declaration that cannot be examined is an error, not a directory without one", (t) => {
    // Read as absent, the walk went on past the project and the launch started with none of its
    // servers -- a failure that names a missing server instead of the path nobody could look at.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-decl-stat-"));
    tmpDirs.push(root);
    const claudeDir = path.join(root, ".claude");
    fs.mkdirSync(claudeDir);
    const file = path.join(claudeDir, m.CONFIG_NAME);
    fs.writeFileSync(file, JSON.stringify({ secrets: {}, servers: {} }));
    for (const denied of [claudeDir, file]) {
        denyFs(t, "statSync", denied);
        assert.throws(() => m.configPaths({ HOME: "/nonexistent-home" }, root), /could not be examined/, denied);
        t.mock.restoreAll();
    }
});

test("loadConfig: a declaration that cannot be examined is an error, not a scope without one", (t) => {
    const paths = projectPaths({ secrets: {}, servers: { s: { command: "npx", args: [], env: {} } } });
    denyFs(t, "statSync", paths.project);
    assert.throws(() => m.loadConfig(paths), /could not be examined/);
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

test("readFailureReason: no shape of a JSON.parse message carries file content out", () => {
    // The three shapes V8 produces for a content window -- elided on both sides, anchored at the
    // start, and, for an input short enough, the whole text -- plus the two positional shapes that
    // carry none. The whole-text shape is why the reason is rebuilt from the positional triple
    // rather than filtered out of the message: a filter written against the other two lets an
    // entire short file through, and a short file is exactly what a one-secret .mcp.json is.
    const secret = "ghp_SUPERSECRETVALUE";
    for (const text of [`{"a":1,"b":2,"c":3,"d":4,"env":{"PAT":${secret},"x":1}}`, `{"P":${secret}}`,
        secret, `{"P":"${secret}",}`, `{"P":"${secret}"`]) {
        let reason = null;
        try {
            JSON.parse(text);
        } catch (e) {
            reason = m.readFailureReason(e);
        }
        assert.ok(reason !== null, `expected ${JSON.stringify(text)} to be malformed`);
        assert.doesNotMatch(reason, /ghp_|SUPERSECRET/,
            `content travelled for ${JSON.stringify(text)}: ${reason}`);
    }
});

test("readFailureReason: an fs failure passes through, because its code IS the diagnosis", () => {
    // The readers that wrap the read and the parse in one try hand both kinds of failure here.
    // ENOENT, EACCES and EISDIR describe the file rather than its contents, and collapsing them
    // into "not valid JSON" would send a developer to fix the syntax of a file that is either
    // perfectly valid or not a file at all.
    assert.equal(m.readFailureReason(Object.assign(new Error("permission denied"), { code: "EACCES" })),
        "EACCES");
});

test("readEnableLists: an absent settings.local.json says nothing, because most projects have none", () => {
    // The distinction that keeps the report above worth reading. Reporting an optional file that
    // simply is not there would put a line in every healthy doctor run, and a warning everyone
    // learns to skip is worse than no warning.
    const problems = [];
    m.readEnableLists(path.join(os.tmpdir(), "vc-secrets-no-such-dir", "settings.local.json"), problems);
    assert.deepEqual(problems, []);
});

test("the write script stores the caller's bytes, trailing newline included", () => {
    // The read path strips one line ending because `security -w` and the PowerShell reader APPEND
    // one -- it removes the tool's artifact. Nothing appends on the way in: runTool does
    // `child.stdin.write(stdinValue)` and ReadToEnd returns exactly those bytes, so a TrimEnd here
    // deleted the caller's, and every trailing CR/LF rather than a single line ending.
    //
    // cmdMigrate is what makes it reachable: the other two writers hand over a token's JSON or a
    // secret typed at a prompt, where Enter is the terminator. Migrate moves a value the user
    // cannot retype, and its gpg read opts out of the same strip with keepTrailingNewline for
    // precisely this reason -- Windows was doing what that opt-out exists to prevent.
    assert.doesNotMatch(m.PS_CRED_WRITE, /TrimEnd/);
    assert.match(m.PS_CRED_WRITE, /^\$value=\[Console\]::In\.ReadToEnd\(\)$/m);
});

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

test("the read script exits absent only for ERROR_NOT_FOUND, never for an unreadable store", () => {
    // The same rule PS_CRED_DELETE carries, and the read path is where breaking it costs most.
    // Its readers take exit 3 as authoritative absence -- newKeyPresent's own comment insists
    // absent and unreadable must not collapse, and on wcm they did. A Credential Manager that
    // cannot be read (a logon session left locked after an RDP reconnect, a policy-restricted
    // context) then reads as "not signed in", and the developer is sent through an interactive
    // sign-in nothing had invalidated: it spends a single-use authorization code and rotates a live
    // refresh token away. Losing the token is the failure; the wasted minute is not.
    assert.match(m.PS_CRED_READ, /\$e -eq 1168/);
    assert.match(m.PS_CRED_READ, /GetLastWin32Error/);

    // Presence is not exclusivity, for the reason the delete script's twin of this assertion gives:
    // adding `if($e -eq 5){ exit 3 }` -- ACCESS_DENIED -- satisfies both matches above while
    // restoring exactly the collapse this test exists to prevent.
    assert.equal(m.PS_CRED_READ.match(/exit 3/g).length, 1, "exactly one condition may exit 3");
});

test("PS_CRED_READ_MANY reads each name exactly as PS_CRED_READ does", () => {
    // Derived from the single read rather than restated: the batched read replaces it on the launch path,
    // so the CredRead declaration, the CREDENTIAL layout, the output encoding and the hex the decoder expects
    // have to be the single read's own, and a later change to one that misses the other must show here.
    const single = m.PS_CRED_READ;
    const credRead = /\[DllImport\("advapi32"[^\n]*\n\s*public static extern bool CredRead\([^\n]*/.exec(single)[0];
    const struct = /public struct CREDENTIAL \{[\s\S]*?\}/.exec(single)[0];
    const hex = /\(\(\$b \| ForEach-Object \{ \$_\.ToString\("x2"\) \}\) -join ''\)/.exec(single)[0];
    const encoding = /\[Console\]::OutputEncoding=[^\n]*/.exec(single)[0];
    for (const [what, text] of Object.entries({ credRead, struct, hex, encoding })) {
        assert.ok(m.PS_CRED_READ_MANY.includes(text), `the batched read carries the single read's ${what}: ${text}`);
    }
});

test("PS_CRED_READ_MANY's job kills its tree on close and grants no breakaway", () => {
    // A job that let its members' children break away is libuv's own, and it is the job the server's
    // grandchildren already escape. KILL_ON_JOB_CLOSE alone is the whole point; any breakaway flag -- by
    // name or by value -- undoes it for the processes that hold the secrets.
    const script = m.PS_CRED_READ_MANY;
    assert.doesNotMatch(script, /BREAKAWAY/i);
    assert.match(script, /const int JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;/);
    const assignments = script.match(/LimitFlags\s*=[^;]*;/g);
    assert.deepEqual(assignments, ["LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;"],
        "the one flag, and nothing OR-ed into it");
});

test("PS_CRED_READ_MANY duplicates the job into the launcher before assigning the launcher to it", () => {
    // Assigned first, a failed duplicate leaves PowerShell the job's only holder, and its exit closes the
    // job and kills the launcher under KILL_ON_JOB_CLOSE. The duplicate must also not be inheritable: a
    // child holding the job open would outlive the launcher with it.
    //
    // The order check reads the first occurrence of each call, so each must occur exactly once: a second
    // copy, a comment included, would let it compare the wrong one. Counting rather than stripping comments,
    // because the script is C# inside PowerShell inside a JS string and no comment stripper covers all three.
    const script = m.PS_CRED_READ_MANY;
    const duplicateCall = "DuplicateHandle(GetCurrentProcess(), job, launcher, out held, 0, false, DUPLICATE_SAME_ACCESS)";
    const assignCall = "AssignProcessToJobObject(job, launcher)";
    for (const call of [duplicateCall, assignCall]) {
        assert.equal(script.split(call).length - 1, 1,
            `${call} occurs exactly once, so a second copy -- a comment included -- cannot make the order check read the wrong one`);
    }

    const duplicate = script.indexOf(duplicateCall);
    const assign = script.indexOf(assignCall);
    assert.ok(duplicate >= 0, "the job handle is duplicated into the launcher, non-inheritable");
    assert.ok(assign >= 0, "the launcher is assigned to the job");
    assert.ok(duplicate < assign, "duplicate first, then assign");
});

// The job object, run for real. The source-text tests above pin what the script says; only a Windows
// machine can show that terminating the bound process ends the tree it started. Both tests below build
// the same tree and differ only in the bind, so the second says whether the first could have failed.
//
// Skipped where the bind cannot run, with the missing thing named. A machine where Add-Type is blocked
// is NOT skipped: there the script is the feature not working, and the bind test must say so.
const CAN_BIND_JOB = process.platform === "win32" && probe(() => {
    m.resolveSpawnCommand(m.psCommand({}));

    return true;
});
const JOB_BIND_SKIP = !CAN_BIND_JOB && (process.platform === "win32"
    ? `needs ${m.psCommand({})} on PATH to run the bind`
    : `needs Windows: the bind is a Windows job object and this platform is ${process.platform}`);
const TIMED_OUT = Symbol("timed out");

// One file plays all three roles. Each member connects to the pipe the test owns and says who it is; that
// connection is its liveness, because a pid can be reused and a connection cannot outlive its process.
// The grandchild goes through cmd.exe /d /v:off /s /c with a verbatim line, as `npx.cmd` does for a real server.
// A fixture ends itself after 180 s, and when the test closes its end of the pipe.
const JOB_TREE_FIXTURE = String.raw`"use strict";
const net = require("node:net");
const { spawn } = require("node:child_process");
const [role, pipe] = process.argv.slice(2);

setTimeout(() => process.exit(0), 180000);

function join(label) {
    const socket = net.connect(pipe);
    socket.on("connect", () => socket.write(label + " " + process.pid + "\n"));
    socket.on("error", () => process.exit(3));
    socket.on("close", () => process.exit(0));
}

if (role === "parent") {
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", () => {
        spawn(process.execPath, [__filename, "child", pipe], { stdio: "ignore", windowsHide: true });
    });
    process.stdin.on("end", () => process.exit(0));
} else if (role === "child") {
    join("child");
    const line = '"' + process.execPath + '" "' + __filename + '" grandchild "' + pipe + '"';
    spawn(process.env.ComSpec || "cmd.exe", ['/d /v:off /s /c "' + line + '"'],
        { stdio: "ignore", windowsHide: true, windowsVerbatimArguments: true });
} else {
    join("grandchild");
}
`;

// Starts the parent fixture, which does nothing until `go()`, and listens for its descendants. The
// returned `cleanup` is for a `finally`: it kills only a pid whose connection is still open, then closes
// the sockets and the server.
async function startJobTree() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-jobtree-"));
    tmpDirs.push(dir);
    const script = path.join(dir, "tree.cjs");
    fs.writeFileSync(script, JOB_TREE_FIXTURE);
    const pipe = `\\\\.\\pipe\\vc-secrets-job-${process.pid}-${randomUUID()}`;

    const members = new Map();
    const sockets = [];
    let reportUp = () => {};
    const bothUp = new Promise((resolve) => { reportUp = resolve; });
    const server = net.createServer((socket) => {
        sockets.push(socket);
        const entry = { pid: null, open: true };
        entry.closed = new Promise((resolve) => socket.once("close", () => {
            entry.open = false;
            resolve();
        }));
        socket.on("error", () => {});
        socket.setEncoding("utf8");
        let heard = "";
        socket.on("data", (chunk) => {
            if (entry.pid !== null) {
                return;
            }
            heard += chunk;
            const end = heard.indexOf("\n");
            if (end === -1) {
                return;
            }
            const [role, pid] = heard.slice(0, end).trim().split(" ");
            entry.pid = Number(pid);
            members.set(role, entry);
            if (members.has("child") && members.has("grandchild")) {
                reportUp();
            }
        });
    });
    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(pipe, resolve);
    });

    // Not the temp directory: a process whose cwd is a directory keeps it from being removed.
    const parent = spawn(process.execPath, [script, "parent", pipe],
        { stdio: ["pipe", "ignore", "ignore"], windowsHide: true, cwd: path.dirname(LAUNCHER_PATH) });
    parent.on("error", () => {});
    parent.stdin.on("error", () => {});
    const parentExit = new Promise((resolve) => parent.once("exit", resolve));

    return {
        parent,
        parentExit,
        bothUp,
        members,
        go: () => parent.stdin.write("go\n"),
        allGone: () => Promise.all([...members.values()].map((x) => x.closed)),
        cleanup: async () => {
            try {
                parent.kill();
            } catch { /* already gone */ }
            for (const entry of members.values()) {
                if (entry.open) {
                    try {
                        process.kill(entry.pid);
                    } catch { /* ended between the check and the kill */ }
                }
            }
            for (const socket of sockets) {
                socket.destroy();
            }
            await m.withDeadline(new Promise((resolve) => server.close(resolve)), 5_000, () => TIMED_OUT);
        },
    };
}

// Deadlines add up to 60 + 30 + 15 + 15 s, under the test's own 150 s with room for the cleanup.
test("PS_CRED_READ_MANY's bind, run for real: terminating the bound process ends what it started through cmd.exe",
    { skip: JOB_BIND_SKIP, timeout: 150_000 }, async () => {
        const tree = await startJobTree();
        try {
            assert.ok(Number.isInteger(tree.parent.pid), "the parent fixture started");

            // The pid bound is the fixture's, never this process's: the job kills whatever holds it, and this
            // process is the test runner.
            const out = await m.withDeadline(
                m.runTool({ ...m.buildCredReadMany([], tree.parent.pid, {}), timeoutMs: 60_000 }),
                60_000, () => TIMED_OUT);
            assert.notEqual(out, TIMED_OUT, "the bind answered within 60 s");
            assert.deepEqual(JSON.parse(out), { creds: {}, job: "ok" });

            // Started only now, so that both members are created after the assignment.
            tree.go();
            assert.notEqual(await m.withDeadline(tree.bothUp, 30_000, () => TIMED_OUT), TIMED_OUT,
                "the child and the grandchild both connected within 30 s");
            for (const [role, entry] of tree.members) {
                assert.equal(entry.open, true, `${role} is connected before the kill`);
            }

            tree.parent.kill();
            assert.notEqual(await m.withDeadline(tree.parentExit, 15_000, () => TIMED_OUT), TIMED_OUT,
                "the parent ended within 15 s of being terminated");
            assert.notEqual(await m.withDeadline(tree.allGone(), 15_000, () => TIMED_OUT), TIMED_OUT,
                "the child and the grandchild ended within 15 s of the parent");
        } finally {
            await tree.cleanup();
        }
    });

// Pins how this Node starts a tree, not the launcher: if a Node ever ended every descendant of a killed
// parent by itself, the bind test above would pass without the bind, and this one says so as a skip.
test("without the bind, terminating the parent leaves part of the same tree running (what the bind test is told apart from)",
    { skip: JOB_BIND_SKIP, timeout: 150_000 }, async (t) => {
        const tree = await startJobTree();
        try {
            assert.ok(Number.isInteger(tree.parent.pid), "the parent fixture started");

            tree.go();
            assert.notEqual(await m.withDeadline(tree.bothUp, 30_000, () => TIMED_OUT), TIMED_OUT,
                "the child and the grandchild both connected within 30 s");

            tree.parent.kill();
            if (await m.withDeadline(tree.parentExit, 15_000, () => TIMED_OUT) === TIMED_OUT) {
                t.skip("the parent fixture did not end when terminated, so what outlives it cannot be measured");

                return;
            }
            if (await m.withDeadline(tree.allGone(), 15_000, () => TIMED_OUT) !== TIMED_OUT) {
                t.skip("this Node ends the tree without the bind, so the bind test above cannot discriminate here");

                return;
            }
            assert.ok([...tree.members.values()].some((x) => x.open), "a member outlived the parent that started it");
        } finally {
            await tree.cleanup();
        }
    });

test("a blob written by the pre-UTF-8 launcher still reads, since it cannot be re-entered", () => {
    // `set` needs the plaintext and the keystore does not give it back, so asking a teammate to
    // retype would mean minting a new credential.
    assert.deepEqual(m.decodeCredBlobHex("650079006400"), { encoding: "utf16le", value: "eyd" });
    assert.equal(m.decodeCredBlobHex("65794a64").encoding, "utf8");
});

test("the UTF-16 test requires non-zero even bytes and an even length", () => {
    // A zero in an EVEN position is not UTF-16 ASCII; treating it as such would decode a
    // legitimate UTF-8 blob containing a NUL into garbage.
    assert.equal(m.decodeCredBlobHex("0000").encoding, "utf8");
    // Three bytes, not one: `65` is turned away by the length >= 2 floor, so it never reaches the
    // even-length test it is named for. `650079` passes the floor and the every() predicate, so
    // dropping `% 2 === 0` decodes it as UTF-16 and silently loses the third byte.
    assert.equal(m.decodeCredBlobHex("650079").encoding, "utf8", "an odd length is never UTF-16");
});

test("the UTF-16 detector reaches ASCII and no further, which is what the ASCII premise buys", () => {
    // "€" as UTF-16LE is `ac 20`: the odd byte is not zero, so the detector calls it UTF-8 and the
    // value comes back mojibake with nothing raised. No detector can do better — UTF-16 text and
    // UTF-8 bytes are not separable in general — so the guarantee has to come from the data, and it
    // does: the stored credentials were checked to be ASCII. This test is that check's teeth.
    assert.equal(m.decodeCredBlobHex("ac20").encoding, "utf8");
    assert.notEqual(m.decodeCredBlobHex("ac20").value, "\u20ac");
});

test("buildLocalRead/buildLocalWrite: reject keys outside vc-secrets:<scope>:<name> (path traversal guard)", () => {
    assert.throws(() => m.buildLocalRead("gpg", "../evil", { HOME: "/h" }), m.VcSecretsError);
    assert.throws(() => m.buildLocalWrite("gpg", "../evil", { HOME: "/h" }), m.VcSecretsError);
    assert.throws(() => m.buildLocalRead("gpg", "vc-secrets:user:../evil", { HOME: "/h" }), m.VcSecretsError);
    assert.throws(() => m.buildLocalWrite("gpg", "vc-secrets:user:../evil", { HOME: "/h" }), m.VcSecretsError);
});

test("buildLocalWrite: gpg tmp target for atomic write", () => {
    const spec = m.buildLocalWrite("gpg", "vc-secrets:user:ado-pat", { HOME: "/h" }, { tmp: true });
    const target = spec.args[spec.args.indexOf("-o") + 1];
    assert.ok(target.endsWith(path.join("ado-pat.gpg.tmp")), `expected .gpg.tmp target, got "${target}"`);

    const finalSpec = m.buildLocalWrite("gpg", "vc-secrets:user:ado-pat", { HOME: "/h" });
    const finalTarget = finalSpec.args[finalSpec.args.indexOf("-o") + 1];
    assert.ok(finalTarget.endsWith("ado-pat.gpg") && !finalTarget.endsWith(".tmp"), "default (no tmp option) targets the final path");
});

test("buildLocalDelete refuses a key that is not three segments", () => {
    assert.throws(() => m.buildLocalDelete("wcm", "oauth-x-refresh"), /invalid secret key/);
});

test("buildLocalDelete names the same key the read builder would read", () => {
    const key = "vc-secrets:user:oauth-ado-refresh";
    const env = { SystemRoot: "C:\\Windows" };
    const del = m.buildLocalDelete("wcm", key, env);
    assert.equal(del.extraEnv.VC_SECRETS_NAME, m.buildLocalRead("wcm", key, env).extraEnv.VC_SECRETS_NAME);
    assert.equal(del.extraEnv.VC_SECRETS_NAME, key);
    assert.equal(del.captureStdout, false);

    // The env var is only half the address: the script decides what it hands CredDelete.
    // Reinstating the source's `mcpw:` prefix there targets a credential that does not exist,
    // and on a missing name CredDelete sets 1168 — the code this script exits 3 for, which
    // deleteEntryIo passes on as "already absent". Logout would report a removal it never made.
    assert.match(m.PS_CRED_DELETE, /CredDelete\("\$env:VC_SECRETS_NAME",1,0\)/);
    assert.doesNotMatch(m.PS_CRED_DELETE, /mcpw:/);
});

test("buildLocalDelete on keychain passes the key as the service, not as the account", () => {
    const del = m.buildLocalDelete("keychain", "vc-secrets:user:oauth-ado-refresh", { USER: "u" });
    assert.deepEqual(del.args.slice(0, 2), ["delete-generic-password", "-a"]);
    assert.equal(del.args[del.args.indexOf("-s") + 1], "vc-secrets:user:oauth-ado-refresh");
});

test("only ERROR_NOT_FOUND may read as already-absent", () => {
    // Exiting "already gone" for EVERY win32 error would let logout report success while the
    // refresh token is still in the store — the single outcome logout exists to prevent.
    assert.match(m.PS_CRED_DELETE, /\$e -eq 1168/);
    assert.match(m.PS_CRED_DELETE, /GetLastWin32Error/);

    // Presence is not exclusivity. Adding `if($e -eq 5){ exit 3 }` — ACCESS_DENIED — beside the
    // 1168 branch satisfies both matches above, and a locked store then reads as an empty one.
    assert.equal(m.PS_CRED_DELETE.match(/exit 3/g).length, 1, "exactly one condition may exit 3");
});

test("an already-absent keychain entry is normalised to one exit code, not swallowed", async () => {
    // Each backend signals absence differently; deleteEntryIo gives logout ONE meaning to check.
    // It rethrows — a resolved call would hide the difference from the only caller that needs it.
    const del = m.deleteEntryIo("keychain", {}, {
        run: async () => { throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 44 }); },
    });
    await assert.rejects(() => del("vc-secrets:user:oauth-ado-refresh"),
        (e) => e.toolExitCode === 3);
});

test("an already-absent gpg entry is normalised to the same exit code", async () => {
    const del = m.deleteEntryIo("gpg", { HOME: "/nonexistent-for-this-test" });
    await assert.rejects(() => del("vc-secrets:user:oauth-ado-refresh"),
        (e) => e.toolExitCode === 3);
});

test("a gpg entry under a path that runs through a file is absent to logout", async () => {
    // Nothing can live under a regular file. The presence check answers "absent" there, so a logout
    // that threw instead would call one keystore state empty and broken at once.
    const del = m.deleteEntryIo("gpg", {}, { rm: () => { throw Object.assign(new Error("x"), { code: "ENOTDIR" }); } });
    await assert.rejects(() => del("vc-secrets:user:oauth-ado-refresh"),
        (e) => e.toolExitCode === 3);
});

test("a gpg removal that fails for any other reason is not reported as absent", async () => {
    // EACCES is a broken machine, not an empty one. Collapsing the two is how logout reports
    // success over a credential it could not remove.
    const del = m.deleteEntryIo("gpg", {}, { rm: () => { throw Object.assign(new Error("x"), { code: "EACCES" }); } });
    await assert.rejects(() => del("vc-secrets:user:oauth-ado-refresh"),
        (e) => e.toolExitCode !== 3);
});

test("deleteEntryIo: a malformed gpg key is refused, not read as already-absent", async () => {
    // Without this guard a malformed key still splits into a scope and a name (":" is present),
    // so keyToPath builds a real -- just wrong -- path, fs.rmSync misses on it, and the failure
    // comes back as ENOENT -> toolExitCode 3, the exact shape cmdLogout reads as "already absent".
    // A logout would then report a credential removed that was never even looked for. Path
    // traversal is not the live hazard here: oauth entry names and projectId are both validated
    // against SECRET_NAME_RE at config load, so a key built from a
    // loaded config cannot carry a traversal segment. The hazard is this exit-code collision, so
    // the assertion is on the MESSAGE and on the absence of the already-absent shape, not on path
    // traversal -- mirroring the source's analog (mcpw.test.js), which asserts
    // /invalid secret name/ and specifically NOT /no stored entry/ for the same reason.
    const del = m.deleteEntryIo("gpg", { HOME: "/nonexistent-for-this-test" });
    await assert.rejects(() => del("vc-secrets:user:Not_Valid"), (e) => {
        assert.match(e.message, /invalid secret key/);
        assert.doesNotMatch(e.message, /no stored entry/);
        assert.notEqual(e.toolExitCode, 3, "a malformed key must not be read as an already-absent entry");

        return true;
    });
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

test("cmdUnlock: must keep showing pinentry interactively — no --pinentry-mode reaches the gpg it runs", { skip: m.detectLocalBackend(process.platform, process.env) !== "gpg" && "needs gpg to be the backend this machine selects -- the stub on PATH stands in for it" }, async () => {
    const secretsHome = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-unlock-"));
    tmpDirs.push(secretsHome);
    const savedXdg = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = secretsHome;
    const cfg = { secrets: { "ado-pat": { backend: "local", scope: "user", home: "user" } } };
    const keyPath = m.keyToPath(m.keyFor("ado-pat", cfg.secrets["ado-pat"], cfg));
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, "ciphertext");
    const argsLog = path.join(secretsHome, "gpg-args.log");
    process.env.VC_SECRETS_UNLOCK_ARGS_LOG = argsLog;   // read only by the stub below, not by production code
    try {
        await withStubOnPath("gpg", "#!/bin/sh\nprintf '%s\\n' \"$@\" > \"$VC_SECRETS_UNLOCK_ARGS_LOG\"\nexit 0\n",
            () => m.cmdUnlock(cfg));
    } finally {
        process.env.XDG_CONFIG_HOME = savedXdg;
        delete process.env.VC_SECRETS_UNLOCK_ARGS_LOG;
    }
    const loggedArgs = fs.readFileSync(argsLog, "utf8").trim().split("\n");
    assert.ok(!loggedArgs.includes("--pinentry-mode"),
        "cmdUnlock is the ONLY place pinentry may appear; it must not cancel it");
    assert.deepEqual(loggedArgs, ["--quiet", "--decrypt", "-o", "/dev/null", keyPath]);
});

test("unlock finds the entries of a machine whose only stored material is a sign-in", async () => {
    // The failure this replaces: "no stored local secrets to unlock" on a machine that HAS
    // decryptable entries, leaving the cache unreadable and naming no way forward.
    const cfg = { secrets: {}, oauth: { ado: { scope: "user" } }, projectId: "p", files: {} };
    const targets = m.unlockTargets(cfg, () => true);
    assert.equal(targets.length, 2, "a sign-in is two entries: refresh and access");
    assert.deepEqual(targets.map((t) => t.name).sort(), ["oauth-ado-access", "oauth-ado-refresh"]);
});

test("unlock still finds ordinary local secrets, and prefers the current key over the legacy one", () => {
    const cfg = { secrets: { a: { backend: "local", scope: "user" } }, oauth: {}, projectId: "p", files: {} };
    assert.equal(m.unlockTargets(cfg, (f) => !/mcpw/.test(f)).length, 1);

    // With only one of the two paths present, either branch yields one target — so the line above
    // cannot see the preference its name claims. Present both; the assertion is WHICH one wins.
    const both = m.unlockTargets(cfg, () => true);
    assert.equal(both.length, 1);
    assert.equal(both[0].file, m.keyToPath(m.keyFor("a", cfg.secrets.a, cfg)));
    assert.equal(both[0].name, "a");
});

test("a keyvault secret is not an unlock target, since there is no local file to decrypt", () => {
    const cfg = { secrets: { a: { backend: "keyvault", scope: "user" } }, oauth: {}, projectId: "p", files: {} };
    assert.deepEqual(m.unlockTargets(cfg, () => true), []);
});

test("unlock reports a count, since naming one entry reads as only that one being affected", { skip: m.detectLocalBackend(process.platform, process.env) !== "gpg" && "needs gpg to be the backend this machine selects -- cmdUnlock returns early on any other, and this test injects its own run rather than reaching a stub" }, async () => {
    const cfg = { secrets: { a: { backend: "local", scope: "user", home: "user" }, b: { backend: "local", scope: "user", home: "user" } },
        oauth: {}, projectId: "p", files: {} };
    const err = [];
    await m.cmdUnlock(cfg, { exists: () => true, run: async () => {}, write: (s) => err.push(s) });
    assert.match(err.join(""), /2 entries/);
});

test("cmdUnlock: with no exists injected, a keystore file that cannot be examined is an error", async (t) => {
    // No other unlock test reaches the default the verb runs with on a file it cannot stat. A default
    // of existsSync dropped that entry, so an unlock whose only entry it was reported nothing stored:
    // the wrong diagnosis for an entry that is there and could not be examined.
    // The backend is forced so the test runs on every platform: cmdUnlock returns early on any other.
    const cfg = { secrets: { a: { backend: "local", scope: "user", home: "user" } }, oauth: {}, projectId: "p", files: {} };
    denyFs(t, "statSync", m.keyToPath(m.keyFor("a", cfg.secrets.a, cfg)));
    const saved = process.env.VC_SECRETS_LOCAL_BACKEND;
    process.env.VC_SECRETS_LOCAL_BACKEND = "gpg";
    try {
        await assert.rejects(() => m.cmdUnlock(cfg, { run: async () => {}, write: () => {} }), /could not be examined/);
    } finally {
        if (saved === undefined) {
            delete process.env.VC_SECRETS_LOCAL_BACKEND;
        } else {
            process.env.VC_SECRETS_LOCAL_BACKEND = saved;
        }
    }
});

test("runTool: stdout capture, stdin pass, timeout, redacted stderr, toolExitCode", async () => {
    const echo = { cmd: process.execPath, args: ["-e", "process.stdin.pipe(process.stdout)"],
        stdinData: m.VALUE_ON_STDIN, timeoutMs: 10_000, captureStdout: true };
    assert.equal(await m.runTool(echo, { stdinValue: "tok-123" }), "tok-123");

    const fail = { cmd: process.execPath, args: ["-e", "console.error('boom tok-123'); process.exit(3)"],
        timeoutMs: 10_000, captureStdout: true };
    await assert.rejects(m.runTool(fail, { redactValues: ["tok-123"] }),
        (e) => e instanceof m.VcSecretsError && e.toolExitCode === 3 && e.message.includes("boom ***") && !e.message.includes("tok-123"));

    const hang = { cmd: process.execPath, args: ["-e", "setTimeout(()=>{}, 60000)"], timeoutMs: 200, captureStdout: true };
    await assert.rejects(m.runTool(hang), /timed out after 200/);
});

test("runTool: child exits without reading stdin → VcSecretsError, no crash", async () => {
    const spec = { cmd: process.execPath, args: ["-e", "process.exit(5)"],
        stdinData: m.VALUE_ON_STDIN, timeoutMs: 10_000, captureStdout: true };
    await assert.rejects(
        m.runTool(spec, { stdinValue: "x".repeat(1024 * 1024) }),
        (e) => e instanceof m.VcSecretsError && e.toolExitCode === 5);
});

test("runTool: missing binary → actionable VcSecretsError", async () => {
    await assert.rejects(
        m.runTool({ cmd: "vc-secrets-no-such-tool", args: [], timeoutMs: 1000, captureStdout: true }),
        /not found on PATH/);
});

test("runTool: interactive spec never arms the timer (outlives timeoutMs, no SIGKILL)", async () => {
    const spec = { cmd: process.execPath, args: ["-e", "setTimeout(()=>process.exit(0), 300)"],
        interactive: true, timeoutMs: 50, captureStdout: false };
    await m.runTool(spec);
});

test("runTool: timeoutMs: null disarms the timer (outlives the would-be deadline)", async () => {
    const spec = { cmd: process.execPath, args: ["-e", "setTimeout(()=>process.exit(0), 300)"],
        interactive: false, timeoutMs: null, captureStdout: true };
    await m.runTool(spec);
});

test("runTool: executes a .cmd shim instead of reporting it missing", { skip: process.platform !== "win32" && "win32-only: .cmd shims" }, async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-shim-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, "vc-secrets-fake-az.cmd"), "@echo off\r\necho shim-ok\r\n");
    const prevPath = process.env.Path;
    process.env.Path = `${dir};${prevPath}`;
    try {
        const spec = { cmd: "vc-secrets-fake-az", args: [], timeoutMs: 10_000, captureStdout: true };
        assert.equal(await m.runTool(spec), "shim-ok");
    } finally {
        process.env.Path = prevPath;
    }
});

test("runTool: a dangerous variable in the launcher's own environment never reaches a backend tool", async () => {
    // The other end of the NODE_OPTIONS carve-out. buildChildEnv reverses this package's env policy
    // for ONE child -- the MCP server that holds the credential -- and the comment there asserts
    // backend tools are unaffected because runTool sanitizes unconditionally. That sentence was the
    // only thing holding the bound: deleting the sanitizeEnv call at runTool's spawn left the whole
    // suite green, so a later edit could drop it and ship. LD_PRELOAD rather than NODE_OPTIONS
    // because a missing preload object is ignored by the loader -- it warns on stderr and the
    // child runs on -- so the test observes the variable itself rather than an effect of it.
    process.env.LD_PRELOAD = "/evil.so";
    try {
        const spec = { cmd: process.execPath, args: ["-e", "process.stdout.write(String(process.env.LD_PRELOAD))"],
            timeoutMs: 10_000, captureStdout: true };
        assert.equal(await m.runTool(spec), "undefined");
    } finally {
        delete process.env.LD_PRELOAD;
    }
});

// Answers true only for the named files, compared the way NTFS does: case-insensitively, either slash.
function onlyFiles(...files) {
    const wanted = files.map((f) => f.toLowerCase());

    return (p) => wanted.includes(p.toLowerCase().replace(/\\/g, "/"));
}

const WIN_ENV = { Path: "C:\\bin;C:\\Windows\\System32", PATHEXT: ".COM;.EXE;.BAT;.CMD" };

test("resolveSpawnCommand: win32 .cmd shim found case-insensitively", () => {
    const existsSync = onlyFiles("c:/program files/nodejs/npx.cmd", "c:/windows/system32/cmd.exe");
    const r = m.resolveSpawnCommand("npx", {
        platform: "win32",
        env: { Path: "C:\\Program Files\\nodejs;C:\\Windows\\System32", PATHEXT: ".COM;.EXE;.BAT;.CMD" },
        existsSync,
    });
    assert.equal(r.kind, "cmd-shim");
    assert.ok(r.cmd.toLowerCase().endsWith("npx.cmd"));
});

test("resolveSpawnCommand: win32 .exe is direct", () => {
    const existsSync = onlyFiles("c:/bin/github-mcp-server.exe");
    const r = m.resolveSpawnCommand("github-mcp-server", {
        platform: "win32", env: WIN_ENV, existsSync,
    });
    assert.equal(r.kind, "direct");
    assert.ok(r.cmd.toLowerCase().endsWith(".exe"));
});

test("resolveSpawnCommand: non-win32 commands are passed through as named, and on win32 so are pathful ones that are not batch files", () => {
    // A populated env and an existsSync that says yes are load-bearing: were the pass-through guard
    // deleted, the scan below would find a PATH candidate and answer with ITS path instead of the name.
    assert.deepEqual(m.resolveSpawnCommand("npx", { platform: "linux", env: WIN_ENV, existsSync: () => true }),
        { kind: "direct", cmd: "npx" });
    assert.deepEqual(m.resolveSpawnCommand("/x/y.cmd", { platform: "linux", env: WIN_ENV, existsSync: () => true }),
        { kind: "direct", cmd: "/x/y.cmd" }, "a .cmd path off win32 is just a file");
    for (const pathful of ["C:\\x\\y.exe", "C:\\x\\y", ".\\tools\\y.EXE", "C:/x/y.com"]) {
        assert.deepEqual(m.resolveSpawnCommand(pathful, { platform: "win32", env: WIN_ENV, existsSync: () => true }),
            { kind: "direct", cmd: pathful }, pathful);
    }
});

test("resolveSpawnCommand: win32 a pathful .cmd or .bat, in any case, is run through cmd.exe like a bare-name shim", () => {
    // Node refuses to spawn a batch file without a shell (EINVAL), and a path does not change what it is.
    const existsSync = onlyFiles("c:/windows/system32/cmd.exe");
    for (const pathful of ["C:\\x\\y.cmd", "C:\\x\\y.CMD", "C:\\x\\y.Bat", "C:/x/y.bat", ".\\tools\\y.cmd"]) {
        const r = m.resolveSpawnCommand(pathful, { platform: "win32", env: WIN_ENV, existsSync });
        assert.deepEqual(r, { kind: "cmd-shim", cmd: pathful, shell: "C:\\Windows\\System32\\cmd.exe" }, pathful);
        const invocation = m.buildSpawnInvocation(r, ["-y"]);
        assert.equal(invocation.cmd, r.shell);
        assert.equal(invocation.args[0], `/d /v:off /s /c ""${pathful}" "-y""`, "the same verbatim line the bare-name shim gets");
    }
    // cmd.exe is looked up as it is for a bare name, so its absence is the same refusal.
    assert.throws(() => m.resolveSpawnCommand("C:\\x\\y.cmd", { platform: "win32", env: WIN_ENV, existsSync: () => false }),
        (e) => e instanceof m.VcSecretsError && e.message === "cmd.exe: not found on PATH");
});

test("resolveSpawnCommand: win32 a name that carries an extension resolves to the absolute PATH hit", () => {
    // Such a name used to go out untouched, and libuv looks a bare name up in the cwd before PATH.
    const r = m.resolveSpawnCommand("powershell.exe", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/windows/system32/powershell.exe"),
    });
    assert.deepEqual(r, { kind: "direct", cmd: "C:\\Windows\\System32\\powershell.exe" });
});

test("resolveSpawnCommand: win32 never looks in the cwd, or in a PATH entry that is not absolute", () => {
    // Every candidate is recorded rather than only the outcome: an existsSync that says yes to the
    // relative and bare spellings would otherwise be answered by an implementation that never asked.
    const asked = [];
    const existsSync = (p) => {
        asked.push(p);

        return !path.win32.isAbsolute(p);
    };
    for (const name of ["powershell.exe", "npx"]) {
        assert.throws(() => m.resolveSpawnCommand(name, {
            platform: "win32", env: { Path: ".;tools;C:\\bin", PATHEXT: ".COM;.EXE;.BAT;.CMD" }, existsSync,
        }), (e) => e instanceof m.VcSecretsError && e.message === `${name}: not found on PATH`);
    }
    assert.ok(asked.length > 0 && asked.every((p) => path.win32.isAbsolute(p)),
        `only absolute candidates may be probed: ${JSON.stringify(asked)}`);
});

test("resolveSpawnCommand: win32 a quoted PATH entry is still searched", () => {
    const r = m.resolveSpawnCommand("gpg", {
        platform: "win32", env: { Path: '"C:\\Program Files\\GnuPG\\bin"', PATHEXT: ".exe" },
        existsSync: onlyFiles("c:/program files/gnupg/bin/gpg.exe"),
    });
    assert.equal(r.cmd, "C:\\Program Files\\GnuPG\\bin\\gpg.exe");
});

test("resolveSpawnCommand: win32 searches the PATH of the env it is given, not this process's", () => {
    const seen = [];
    const r = m.resolveSpawnCommand("tool", {
        platform: "win32", env: { PATH: "C:\\declared\\bin" }, existsSync: (candidate) => { seen.push(candidate); return true; },
    });
    assert.equal(r.cmd, "C:\\declared\\bin\\tool.COM", "the first hit in the given PATH");
    assert.ok(seen.every((x) => x.startsWith("C:\\declared\\bin\\")), `only the declared PATH was searched: ${seen}`);
});

test("mergeDeclaredEnv: on win32 a declared key replaces every inherited spelling, so the resolver searches the declared PATH", () => {
    const inherited = { Path: "C:\\inherited\\bin", Other: "kept" };
    const merged = m.mergeDeclaredEnv(inherited, { PATH: "C:\\declared\\bin" }, "win32");
    assert.deepEqual(Object.keys(merged).filter((key) => key.toUpperCase() === "PATH"), ["PATH"], "one spelling reaches the child");
    assert.equal(merged.Other, "kept");
    const r = m.resolveSpawnCommand("tool", { platform: "win32", env: merged, existsSync: () => true });
    assert.ok(r.cmd.startsWith("C:\\declared\\bin\\"), `the declaration decides the lookup: ${r.cmd}`);
    // POSIX keys are case-sensitive, so both spellings are distinct variables and both stay.
    assert.deepEqual(Object.keys(m.mergeDeclaredEnv(inherited, { PATH: "/declared" }, "linux")).sort(), ["Other", "PATH", "Path"]);
});

test("mergeDeclaredEnv: on win32 a declared key is matched to inherited ones in any letter case, whatever case it is declared in", () => {
    const merged = m.mergeDeclaredEnv({ Path: "C:\\inherited\\bin" }, { path: "C:\\declared\\bin" }, "win32");
    assert.deepEqual(merged, { path: "C:\\declared\\bin" }, "exactly one spelling reaches the child, and it is the declaration's");
    const r = m.resolveSpawnCommand("tool", { platform: "win32", env: merged, existsSync: () => true });
    assert.ok(r.cmd.startsWith("C:\\declared\\bin\\"), `and the lookup reads it whatever its case: ${r.cmd}`);
});

test("resolveSpawnCommand: win32 a shim carries the absolute cmd.exe it will be run by", () => {
    const r = m.resolveSpawnCommand("npx", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/bin/npx.cmd", "c:/windows/system32/cmd.exe"),
    });
    assert.equal(r.kind, "cmd-shim");
    assert.equal(r.shell, "C:\\Windows\\System32\\cmd.exe");
    assert.equal(m.buildSpawnInvocation(r, ["-y"]).cmd, r.shell, "the invocation spawns it, not a bare cmd.exe");
});

test("resolveSpawnCommand: win32 a .bat is run through cmd.exe like a .cmd", () => {
    const r = m.resolveSpawnCommand("tool", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/bin/tool.bat", "c:/windows/system32/cmd.exe"),
    });
    assert.equal(r.kind, "cmd-shim");
    assert.equal(r.cmd.toLowerCase(), "c:\\bin\\tool.bat");
    assert.equal(r.shell, "C:\\Windows\\System32\\cmd.exe");
});

test("resolveSpawnCommand: win32 a name that carries an extension is not also expanded by PATHEXT", () => {
    // `git.exe.cmd` is what PATHEXT expansion of `git.exe` would find; the name says which file it means.
    assert.throws(() => m.resolveSpawnCommand("git.exe", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/bin/git.exe.cmd", "c:/windows/system32/cmd.exe"),
    }), (e) => e instanceof m.VcSecretsError && e.message === "git.exe: not found on PATH");
});

test("resolveSpawnCommand: win32 a name that carries an extension tries the exact file, then com and exe appended -- as libuv does, and not PATHEXT", () => {
    // `python3.12` is `python3.12.exe`: its ".12" is not an extension in the executable sense, and a
    // resolver that stops at the literal name reports an installed tool missing.
    const env = { Path: "C:\\Py", PATHEXT: ".XYZ" };
    const resolve = (name, ...files) => m.resolveSpawnCommand(name, { platform: "win32", env, existsSync: onlyFiles(...files) }).cmd;
    assert.equal(resolve("python3.12", "c:/py/python3.12.exe"), "C:\\Py\\python3.12.exe");
    assert.equal(resolve("python3.12", "c:/py/python3.12.com"), "C:\\Py\\python3.12.com");
    assert.equal(resolve("python3.12", "c:/py/python3.12.exe", "c:/py/python3.12.com"), "C:\\Py\\python3.12.com",
        "com is tried before exe, in libuv's order");
    assert.equal(resolve("python3.12", "c:/py/python3.12", "c:/py/python3.12.exe"), "C:\\Py\\python3.12",
        "the literal name comes before either appended one");
    assert.equal(resolve("gh.exe", "c:/py/gh.exe"), "C:\\Py\\gh.exe", "an exact name still resolves literally");
    assert.throws(() => resolve("python3.12", "c:/py/python3.12.xyz"), /python3\.12: not found on PATH/,
        "PATHEXT is not consulted for a name that has an extension");
    // The other half of the rule: a name without one is what PATHEXT is for.
    assert.equal(resolve("tool", "c:/py/tool.xyz"), "C:\\Py\\tool.XYZ");
});

test("resolveSpawnCommand: win32 whether a name has an extension is libuv's test -- the first dot, not the last character", () => {
    const env = { Path: "C:\\Py", PATHEXT: ".XYZ" };
    const resolve = (name, ...files) => m.resolveSpawnCommand(name, { platform: "win32", env, existsSync: onlyFiles(...files) }).cmd;
    // `tool.` ends in its dot, so it has none: it is looked up through PATHEXT, with no second dot joined on.
    assert.equal(resolve("tool.", "c:/py/tool.xyz"), "C:\\Py\\tool.XYZ");
    assert.throws(() => resolve("tool.", "c:/py/tool."), /tool\.: not found on PATH/, "and is not tried as a literal");
    // `.hidden` has one, so the literal comes first.
    assert.equal(resolve(".hidden", "c:/py/.hidden"), "C:\\Py\\.hidden");
    // `tool.v2.` ends in a dot but its FIRST dot is not the last character, so it has one too -- the only
    // shape on which the first-dot and last-dot readings disagree.
    assert.equal(resolve("tool.v2.", "c:/py/tool.v2."), "C:\\Py\\tool.v2.");
});

test("resolveSpawnCommand: win32 PATH is split the way libuv's search_path does it", () => {
    // libuv: a slice opening with `"` or `'` runs to the matching quote, so a `;` inside is part of the
    // directory; the quote at each end is then stripped independently of the other.
    const resolveIn = (pathValue, name, ...files) => m.resolveSpawnCommand(name, {
        platform: "win32", env: { Path: pathValue, PATHEXT: ".EXE" }, existsSync: onlyFiles(...files) }).cmd.toLowerCase();
    const existing = ["c:/a;b/gh.exe", "c:/other/git.exe"];
    assert.equal(resolveIn('"C:\\a;b";C:\\other', "gh", ...existing), "c:\\a;b\\gh.exe", "double quotes hold a semicolon");
    assert.equal(resolveIn("'C:\\a;b';C:\\other", "gh", ...existing), "c:\\a;b\\gh.exe", "and so do single quotes");
    assert.equal(resolveIn('"C:\\a;b";C:\\other', "git", ...existing), "c:\\other\\git.exe", "the entry after a quoted one is still read");
    // Independent stripping: an unterminated opening quote, a trailing quote alone, and a mismatched pair.
    assert.equal(resolveIn('"C:\\a;b', "gh", ...existing), "c:\\a;b\\gh.exe", "an unterminated quote runs to the end and loses its opening one");
    assert.equal(resolveIn('C:\\other"', "git", ...existing), "c:\\other\\git.exe", "a trailing quote is stripped without an opening one");
    assert.equal(resolveIn("\"C:\\other'", "git", ...existing), "c:\\other\\git.exe", "and a mismatched pair loses both");
    // A lone quote strips to an empty slice, which is skipped rather than searched.
    assert.throws(() => m.resolveSpawnCommand("gh", { platform: "win32", env: { Path: '"C:\\x";"', PATHEXT: ".EXE" },
        existsSync: onlyFiles("c:/a;b/gh.exe") }), /gh: not found on PATH/);
});

test("resolveSpawnCommand: win32 a shim with no cmd.exe to run it is not found, not run through a bare name", () => {
    assert.throws(() => m.resolveSpawnCommand("npx", {
        platform: "win32", env: WIN_ENV, existsSync: onlyFiles("c:/bin/npx.cmd"),
    }), (e) => e instanceof m.VcSecretsError && e.message === "cmd.exe: not found on PATH");
});

test("commandOnPath: win32 answers from the resolver, so a cwd-only or missing tool is absent", () => {
    const existsSync = onlyFiles("c:/bin/gpg.exe");
    assert.equal(m.commandOnPath("gpg", { platform: "win32", env: WIN_ENV, existsSync }), true);
    assert.equal(m.commandOnPath("az", { platform: "win32", env: WIN_ENV, existsSync }), false);
    assert.equal(m.commandOnPath("gpg", { platform: "win32", env: { Path: ".;tools", PATHEXT: ".EXE" },
        existsSync: (p) => !path.win32.isAbsolute(p) }), false);
});

test("commandOnPath: win32 a name that carries a path is present only when that file exists", () => {
    const existsSync = onlyFiles("c:/tools/x.exe");
    assert.equal(m.commandOnPath("C:\\tools\\x.exe", { platform: "win32", env: WIN_ENV, existsSync }), true);
    assert.equal(m.commandOnPath("C:\\nope\\x.exe", { platform: "win32", env: WIN_ENV, existsSync }), false);
});

test("childNodeVersionIo: a node the resolver cannot find is a probe that could not run, not an exception", () => {
    const version = m.childNodeVersionIo({ command: "node", platform: "win32",
        env: { Path: "C:\\vc-secrets-no-such-dir", PATHEXT: ".EXE" },
        run: () => assert.fail("nothing was found, so nothing may be spawned") });
    assert.equal(version, "no usable version (node: not found on PATH)");
    assert.equal(m.childNodeSupportsImport(version), false);
});

test("hardenSpawnEnv: win32 turns off the cwd lookup, and the sanitizer lets it through to children", () => {
    const env = {};
    assert.equal(m.hardenSpawnEnv(env, "win32"), env);
    assert.equal(env.NoDefaultCurrentDirectoryInExePath, "1");
    assert.equal(m.sanitizeEnv(env).NoDefaultCurrentDirectoryInExePath, "1");
});

test("hardenSpawnEnv: other platforms are left exactly as they were", () => {
    for (const platform of ["linux", "darwin"]) {
        assert.deepEqual(m.hardenSpawnEnv({ A: "b" }, platform), { A: "b" });
    }
});

test("buildSpawnInvocation: verbatim cmd line quotes every token", () => {
    const shell = "C:\\Windows\\System32\\cmd.exe";
    const inv = m.buildSpawnInvocation({ kind: "cmd-shim", cmd: "C:\\Program Files\\nodejs\\npx.cmd", shell }, ["-y", "@azure-devops/mcp@2.8.1"]);
    assert.equal(inv.cmd, shell);
    assert.deepEqual(inv.args, ['/d /v:off /s /c ""C:\\Program Files\\nodejs\\npx.cmd" "-y" "@azure-devops/mcp@2.8.1""']);
    assert.equal(inv.opts.windowsVerbatimArguments, true);

    const direct = m.buildSpawnInvocation({ kind: "direct", cmd: "npx" }, ["-y"]);
    assert.deepEqual(direct, { cmd: "npx", args: ["-y"], opts: {} });
});

test("buildSpawnInvocation: a cmd-shim argument ending in a backslash is refused by position, never by value; a direct spawn takes it", () => {
    const shell = "C:\\Windows\\System32\\cmd.exe";
    const shim = { kind: "cmd-shim", cmd: "C:\\nodejs\\npx.cmd", shell };
    const line = (args) => m.buildSpawnInvocation(shim, args).args[0];

    // Doubling the run is right for a wrapper that forwards to an MSVCRT-parsed program and wrong for a
    // batch file that reads %~1 itself, and the builder cannot tell which it is feeding: so none is
    // rewritten, and the line cmd.exe runs is always the argv the trust review showed.
    for (const bad of ["C:\\dir\\", "C:\\a b\\\\", "\\"]) {
        assert.throws(() => line(["ok", bad]),
            (e) => e instanceof m.VcSecretsError
                && e.message === "argument 2 ends with a backslash, which a .cmd/.bat shim cannot pass on unchanged -- drop the trailing backslash"
                && !e.message.includes(bad.trim()),
            `${JSON.stringify(bad)} must be refused without echoing it`);
    }
    // Interior backslashes, and a backslash that is not last, pass through untouched.
    assert.equal(line(["a\\b", "C:\\x", "C:\\dir\\file"]),
        '/d /v:off /s /c ""C:\\nodejs\\npx.cmd" "a\\b" "C:\\x" "C:\\dir\\file""');
    // A direct spawn hands the argument to the program as it is, so there is nothing to refuse.
    assert.deepEqual(m.buildSpawnInvocation({ kind: "direct", cmd: "npx" }, ["C:\\dir\\"]), { cmd: "npx", args: ["C:\\dir\\"], opts: {} });
});

test("buildSpawnInvocation: a cmd-shim argument cmd.exe would interpret is refused by position, never by value; a direct spawn takes it", () => {
    const shim = { kind: "cmd-shim", cmd: "C:\\nodejs\\npx.cmd", shell: "C:\\Windows\\System32\\cmd.exe" };

    // The child's environment holds the resolved secrets, and cmd.exe expands %VAR% inside quotes from it.
    for (const bad of ["%ADO_MCP_AUTH_TOKEN%", "100%", "a\nb", "a\rb"]) {
        assert.throws(() => m.buildSpawnInvocation(shim, ["ok", bad]),
            (e) => e instanceof m.VcSecretsError && /argument 2 contains/.test(e.message) && !e.message.includes(bad.trim()),
            `${JSON.stringify(bad)} must be refused without echoing it`);
    }
    // Legitimate on every direct path: a URL-encoded argument.
    assert.deepEqual(m.buildSpawnInvocation({ kind: "direct", cmd: "npx" }, ["a%20b", "x\ny"]), { cmd: "npx", args: ["a%20b", "x\ny"], opts: {} });
});

test("buildSpawnInvocation: a .cmd shim runs with delayed expansion off, so !NAME! in an argument stays literal", () => {
    // A machine with HKCU\Software\Microsoft\Command Processor\DelayedExpansion=1 expands !NAME! even inside
    // quotes, from the child's environment where the resolved secrets live. The argument is legitimate on
    // every direct path, so it is passed on unchanged and /v:off on the command line is what keeps it inert.
    const shim = { kind: "cmd-shim", cmd: "C:\\nodejs\\npx.cmd", shell: "C:\\Windows\\System32\\cmd.exe" };
    const inv = m.buildSpawnInvocation(shim, ["ok", "!GITHUB_TOKEN!"]);

    assert.ok(inv.args[0].startsWith("/d /v:off /s /c "), "delayed expansion is switched off on the command line");
    assert.ok(inv.args[0].includes(' "!GITHUB_TOKEN!"'), "the argument is passed through verbatim, quoted");
});

test("buildSpawnInvocation: a pathful .cmd command holding % is refused without echoing it; a direct spawn takes the same path", () => {
    // The quoted command sits on the same /c line as the arguments, so cmd.exe expands %VAR% in it from the
    // child's environment too.
    const existsSync = onlyFiles("c:/windows/system32/cmd.exe");
    for (const command of ["C:\\tools\\%X%\\x.cmd", "C:\\tools\\100%\\x.bat"]) {
        const resolved = m.resolveSpawnCommand(command, { platform: "win32", env: WIN_ENV, existsSync });
        assert.equal(resolved.kind, "cmd-shim", "the control: it is run through cmd.exe");
        assert.throws(() => m.buildSpawnInvocation(resolved, ["ok"]),
            (e) => e instanceof m.VcSecretsError && /^the command contains %/.test(e.message)
                && !e.message.includes("tools") && !e.message.includes("%X%"),
            `${command} must be refused without echoing it`);
    }
    // A direct spawn hands the path to the loader untouched, so a % there is only a character.
    const direct = m.resolveSpawnCommand("C:\\tools\\%X%\\x.exe", { platform: "win32", env: WIN_ENV, existsSync });
    assert.deepEqual(m.buildSpawnInvocation(direct, ["ok"]), { cmd: "C:\\tools\\%X%\\x.exe", args: ["ok"], opts: {} });
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
// `stripComments` (test-support.mjs) is the one stripper: string-, template- and regex-literal-aware,
// and checked against a JavaScript parser's own comment ranges.

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
    // The source-text tests above and below match on stripped text, so a stripper that cuts too little
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
    const siblings = LIB_SIBLINGS;
    for (const layer of LIB_LAYERS) {
        const source = codeOnly(fs.readFileSync(path.join(libDir, `${layer}.mjs`), "utf8"));
        assert.doesNotMatch(source, /\bimport\s*\(/, `lib/${layer}.mjs: no dynamic import`);
        for (const [, , spec] of source.matchAll(/\b(?:from|import)\s*(["'])([^"']+)\1/g)) {
            const below = /^\.\/([^/]+)\.mjs$/.exec(spec);
            const ok = spec.startsWith("node:")
                || (spec.startsWith("../") && siblings.has(spec.slice(3)))
                || (below !== null && LIB_LAYERS.indexOf(below[1]) >= 0 && LIB_LAYERS.indexOf(below[1]) < LIB_LAYERS.indexOf(layer));
            assert.ok(ok, `lib/${layer}.mjs depends on "${spec}", which is not node:, a package sibling, or a layer below it`);
        }
    }
});

test("runCli hardens the spawn environment of this very process before it dispatches anything", () => {
    // The two halves are tested alone -- hardenSpawnEnv's result above, the resolver's cwd rule in its
    // own tests -- and nothing else exercises the call between them: it runs once, from the entry point,
    // against the real process.env, which a test cannot reach without launching a CLI. So the wiring is
    // pinned on the source, comments stripped and the call required in full, because a comment naming it
    // or a call on a copy of the env would each leave the win32 cwd lookup open. The order matters too:
    // hardened after dispatch, the first spawn has already happened.
    const body = stripComments(m.runCli.toString());
    const hardened = body.indexOf("hardenSpawnEnv(process.env, process.platform)");
    const dispatched = body.search(/\bmain\(argv\b/);
    assert.ok(hardened >= 0, "runCli must call hardenSpawnEnv(process.env, process.platform)");
    assert.ok(dispatched > hardened, "and before main(argv) dispatches");
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

test("mapResolveError: wcm exit 3 → Credential Manager advice", () => {
    const e = Object.assign(new Error("CredRead failed"), { toolExitCode: 3 });
    const mapped = m.mapResolveError("wcm", "ado-pat", e);
    assert.ok(mapped instanceof m.VcSecretsError);
    assert.match(mapped.message, /not found in Credential Manager -- run "vc-secrets set ado-pat"/);
});

test("an oversize value is named as a size problem, with the entry that overflowed", () => {
    // The write path is the ONLY producer of exit 4, so without a consumer the mapping for it is
    // unreachable and a raw win32err=1783 reaches the developer instead.
    const bare = m.mapResolveError("wcm", "ado", Object.assign(new Error("x"), { toolExitCode: 4 }));
    assert.match(bare.message, /too large for Credential Manager/);
    assert.match(bare.message, /"ado"/);

    // The measured size is the number a developer can act on, and it survives only if the regex
    // still matches what the PowerShell branch writes. Asserting the bare case alone leaves the
    // extraction unexercised, so a reworded script drops the figure with the suite green.
    const measured = m.mapResolveError("wcm", "ado",
        Object.assign(new Error("value too large for Credential Manager (4020 bytes; limit 2560)"), { toolExitCode: 4 }));
    assert.match(measured.message, /\(4020 bytes\)/);
});

test("mapResolveError: keychain exit 44 → Keychain advice", () => {
    const e = Object.assign(new Error("security: item not found"), { toolExitCode: 44 });
    const mapped = m.mapResolveError("keychain", "ado-pat", e);
    assert.ok(mapped instanceof m.VcSecretsError);
    assert.match(mapped.message, /not found in Keychain -- run "vc-secrets set ado-pat"/);
});

test("mapResolveError: gpg failure → unlock hint", () => {
    const e = new Error("gpg exited 2: decryption failed: No secret key");
    const mapped = m.mapResolveError("gpg", "ado-pat", e);
    assert.ok(mapped instanceof m.VcSecretsError);
    assert.match(mapped.message, /decryption failed: No secret key -- if the gpg agent is locked, run "vc-secrets unlock" in a terminal/);
});

test("mapResolveError: other backend/exit-code combinations pass through unchanged", () => {
    const e = new Error("az: not logged in");
    assert.equal(m.mapResolveError("keyvault", "x", e), e);
    const wcmOther = Object.assign(new Error("boom"), { toolExitCode: 1 });
    assert.equal(m.mapResolveError("wcm", "x", wcmOther), wcmOther);
});

test("makeSecretResolver: gpg backend, file absent → not-set advice (pre-check before spawning)", async () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-gpg-"));
    tmpDirs.push(tmp);
    const env = { VC_SECRETS_LOCAL_BACKEND: "gpg", XDG_CONFIG_HOME: tmp };
    const resolver = m.makeSecretResolver({}, env);
    await assert.rejects(
        resolver("ado-pat", { backend: "local", scope: "user" }),
        (e) => e instanceof m.VcSecretsError && /not set -- run "vc-secrets set ado-pat"/.test(e.message));
});

test("applyKeystrokes: typing, backspace, control chars, paste with terminator", () => {
    let s = { value: "" };
    s = m.applyKeystrokes(s, "ab");
    s = m.applyKeystrokes(s, "\u007f");           // backspace
    assert.deepEqual(s, { value: "a", done: false, cancelled: false });
    s = m.applyKeystrokes(s, "bc-PASTED\r");      // paste arrives as ONE chunk incl. CR
    assert.deepEqual(s, { value: "abc-PASTED", done: true, cancelled: false });
    assert.equal(m.applyKeystrokes({ value: "x" }, "\u0003").cancelled, true);   // Ctrl-C
    assert.equal(m.applyKeystrokes({ value: "" }, "\u0007").value, "", "control chars ignored");
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

test("the shim in this package declares the contract the launcher requires", () => {
    // A freshly installed shim must not make `doctor` warn that it is stale, so the two constants move
    // together; only an installed copy left behind by an older plugin version should ever trail.
    const shimSource = fs.readFileSync(new URL("./vc-secrets-shim.mjs", import.meta.url), "utf8");
    const declared = /^const SHIM_CONTRACT = (\d+);$/m.exec(shimSource);
    assert.ok(declared, "the shim declares SHIM_CONTRACT");
    assert.equal(Number(declared[1]), m.REQUIRED_SHIM_CONTRACT);
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

const EMPTY_DECL = { secrets: {}, servers: {} };

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

test("runCli: the contract the shim passes reaches doctor through main", () => {
    // Through the real entry, because the wiring under test is runCli -> main -> cmdDoctor and
    // cmdDoctor ends its process. Pinned to gpg, the one backend doctor does not write-probe, and the
    // declaration is empty, so nothing reads or writes a credential store; HOME is a fixture.
    const env = launcherEnv({ VC_SECRETS_LOCAL_BACKEND: "gpg" });
    const root = namespaceRepo(EMPTY_DECL);
    const script = `import(${JSON.stringify(pathToFileURL(LAUNCHER_PATH).href)})`
        + `.then((m) => m.runCli(["doctor"], { shimContract: 1 }));`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script],
        { cwd: root, env, encoding: "utf8", timeout: 30_000 });
    assert.equal(run.signal, null, `doctor did not finish: ${run.stderr}`);
    assert.match(run.stderr, /installed shim speaks contract 1, this launcher expects 2/, run.stderr);
});

// ── oauth verdicts, the tenant check, and the child node floor ──────────────────────────────────
//
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

test("oauthStatusFrom: a cache verdict becomes a bare status, never the object holding the token", () => {
    // The one place a token could reach the report: cacheStatus returns the access token beside its
    // verdict, so passing the verdict through would print it. The exclusion is enforced by the
    // mapping having no way to carry it, not by remembering to redact.
    assert.equal(m.oauthStatusFrom({ state: "valid", accessToken: "SENTINEL-DO-NOT-PRINT" }), "ok");
    assert.equal(m.oauthStatusFrom({ state: "needs-refresh", refreshToken: "SENTINEL" }), "needs-refresh");
    assert.equal(m.oauthStatusFrom({ state: "absent" }), "signin-required");
    assert.equal(m.oauthStatusFrom({ state: "identity-mismatch" }), "identity-changed");
});

test("oauthStatusFrom: a cache state it does not know is loud, not the quietest verdict", () => {
    // The old catch-all returned "signin-required", which doctor reports as INFO. A state added to
    // cacheStatus later would then arrive as the most reassuring line the report can print.
    assert.throws(() => m.oauthStatusFrom({ state: "something-new" }), m.VcSecretsError);
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

test("oauthReferences: a reference inside a task is found, not only inside servers", () => {
    // This package validates tasks alongside servers everywhere else doctor looks (the "declared"
    // loop, consumedSecrets), so a task-only reference is exactly the site a servers-only scan would
    // have missed.
    const cfg = { servers: {}, tasks: {
        loadtest: { command: "npx", args: ["-y"], env: { T: "oauth:azure-mcp" } },
    } };
    assert.deepEqual(m.oauthReferences(cfg),
        [{ kind: "tasks", launchableName: "loadtest", envVar: "T", name: "azure-mcp" }]);
});

// ── oauthTenantChecks: which consumer answers for an entry, and whether it is even worth asking ────
//
// A real Azure DevOps MCP scope: the App ID GUID (a public Microsoft resource identifier, not a
// client identifier -- see the constant's own comment in lib/oauth-checks.mjs) plus offline_access,
// which a REAL declaration needs to get a refresh token at all (README.md) -- loadConfig itself does
// not check for it, so its absence here would not make this fixture invalid, only unrealistic.
const ADO_SCOPES = ["499b84ac-1321-427f-aa17-267ca6975798/.default", "offline_access"];

test("oauthTenantChecks: a task-only consumer's organisation is read from its own args", async () => {
    const cfg = { secrets: {}, servers: {}, tasks: {
        loadtest: { command: "npx", args: ["-y", "@azure-devops/mcp@2.9.0", "org-a"], env: { T: "oauth:azure-mcp" } },
    }, oauth: { "azure-mcp": { tenantId: "aaa", scopes: ADO_SCOPES } } };
    const checks = await m.oauthTenantChecks(cfg, m.oauthReferences(cfg), { resolveOrgTenant: async () => "aaa" });
    assert.deepEqual(checks, [{ name: "azure-mcp", org: "org-a", declared: "aaa", applicable: true, bound: "aaa" }]);
});

test("oauthTenantChecks: a server matched by name whose argv cannot be read is applicable, with no organisation", async () => {
    const cfg = { secrets: {}, tasks: {},
        servers: { "azure-mcp": { command: "npx", args: ["-y"], env: {} } },
        oauth: { "azure-mcp": { tenantId: "aaa", scopes: ADO_SCOPES } } };
    let called = false;
    const checks = await m.oauthTenantChecks(cfg, m.oauthReferences(cfg),
        { resolveOrgTenant: async () => { called = true; return "zzz"; } });
    assert.deepEqual(checks, [{ name: "azure-mcp", org: null, declared: "aaa", applicable: true, bound: null }]);
    assert.equal(called, false, "resolveOrgTenant must not be called when there is no organisation to ask about");
});

test("oauthTenantChecks: no consumer at all is not applicable, and says so as its own reason", async () => {
    const cfg = { secrets: {}, servers: {}, tasks: {}, oauth: { "azure-mcp": { tenantId: "aaa", scopes: ADO_SCOPES } } };
    const checks = await m.oauthTenantChecks(cfg, m.oauthReferences(cfg),
        { resolveOrgTenant: async () => { throw new Error("must not be called"); } });
    assert.deepEqual(checks, [{ name: "azure-mcp", org: null, declared: "aaa", applicable: false, reason: "no-consumer", bound: null }]);
});

test("oauthTenantChecks: a reference to the entry wins over a same-named server", async () => {
    // The by-name fallback exists for the pre-switch phase, when nothing references the entry yet.
    // Once a reference exists it is authoritative -- an unrelated server that merely shares the
    // entry's name must not out-vote it.
    const cfg = { secrets: {}, tasks: {},
        servers: {
            "azure-mcp": { command: "npx", args: ["-y", "wrong-org"], env: {} },
            other: { command: "npx", args: ["-y", "right-org"], env: { T: "oauth:azure-mcp" } },
        },
        oauth: { "azure-mcp": { tenantId: "aaa", scopes: ADO_SCOPES } } };
    const checks = await m.oauthTenantChecks(cfg, m.oauthReferences(cfg),
        { resolveOrgTenant: async (org) => (org === "right-org" ? "aaa" : "zzz") });
    assert.equal(checks[0].org, "right-org", "the reference's own launchable must win over the same-named server");
});

test("oauthTenantChecks: a consumer exists but its scopes are not for Azure DevOps -- not applicable, its own reason", async () => {
    const cfg = { secrets: {}, tasks: {},
        servers: { "azure-mcp": { command: "npx", args: ["-y", "org-a"], env: {} } },
        oauth: { "azure-mcp": { tenantId: "aaa", scopes: ["https://graph.microsoft.com/.default"] } } };
    const checks = await m.oauthTenantChecks(cfg, m.oauthReferences(cfg),
        { resolveOrgTenant: async () => { throw new Error("must not be called"); } });
    assert.deepEqual(checks, [{ name: "azure-mcp", org: null, declared: "aaa", applicable: false, reason: "not-ado-scope", bound: null }]);
});

test("oauthTenantChecks: the Azure DevOps resource match is case-insensitive and tolerates a /.default or /user_impersonation suffix", async () => {
    const consumer = { command: "npx", args: ["-y", "org-a"], env: {} };
    for (const scope of [
        "499B84AC-1321-427F-AA17-267CA6975798/.default",
        "https://app.vssps.visualstudio.com/user_impersonation",
        "APP.VSSPS.VISUALSTUDIO.COM/.default",
    ]) {
        const cfg = { secrets: {}, tasks: {}, servers: { "azure-mcp": consumer },
            oauth: { "azure-mcp": { tenantId: "aaa", scopes: [scope] } } };
        const checks = await m.oauthTenantChecks(cfg, m.oauthReferences(cfg), { resolveOrgTenant: async () => "aaa" });
        assert.equal(checks[0].applicable, true, `${scope} should be recognised as Azure DevOps`);
    }
});

test("organisationFromArgs: the organisation is the first positional the server takes", () => {
    // Derived rather than declared a second time: the argv is where the organisation already lives,
    // and a copy in the oauth block could disagree with it silently.
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "org-a", "-a", "envvar"]), "org-a");
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "org-a", "-t", "a-tenant"]), "org-a");
    // FIRST is the title's claim, and neither argv above can express it: the package spec is skipped
    // by the `@` rule and the trailing token is eaten by its flag, so exactly one candidate survives
    // and an implementation returning the LAST positional would pass both lines.
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "org-a", "org-b"]), "org-a");
});

test("organisationFromArgs: an argv it cannot read yields null rather than a guess", () => {
    // null routes to "could not determine", which is a reported state. A guess would let doctor
    // compare the declared tenant against the wrong organisation and report agreement.
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0"]), null);
    assert.equal(m.organisationFromArgs([]), null);
    assert.equal(m.organisationFromArgs(["-a", "envvar"]), null);
});

test("organisationFromArgs: a valueless flag before the organisation does not swallow it", () => {
    // The generic "every flag takes a value" rule ate the organisation whenever an unknown valueless
    // flag preceded it, and the result was the same WARN a network outage produces.
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "--silent", "org-a"]), "org-a");
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "-a", "envvar", "org-a"]), "org-a",
        "a flag that does take a value still consumes it");
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "--authentication", "envvar", "org-a"]), "org-a",
        "the long form takes a value too -- with only the short one listed, `envvar` becomes the organisation");
});

test("organisationFromArgs: domains named before the organisation reads as null, because that argv cannot launch", () => {
    // --domains is an ARRAY option, so the server's own parser swallows every following token up to
    // the next flag -- the organisation with them -- and the launch dies at "Not enough non-option
    // arguments". Measured against its option definitions, both forms below. Returning the first
    // domain instead would hand doctor an organisation nobody launched, and a tenant WARN to match.
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "--domains", "all", "org-a"]), null);
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "--domains", "repositories", "builds", "org-a"]), null);
    // The two shapes that DO launch, and both must still read: the organisation ahead of the list,
    // and a following flag ending the list before the organisation.
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "org-a", "--domains", "repositories", "builds"]), "org-a");
    assert.equal(m.organisationFromArgs(["-y", "@azure-devops/mcp@2.9.0", "-d", "all", "-a", "envvar", "org-a"]), "org-a");
});

test("resolveOrgTenant: reads the binding header, and answers null when it cannot", async () => {
    const withHeader = await m.resolveOrgTenant("org-a", { request: async () => ({ headers: new Map([["x-vss-resourcetenant", "t-1"]]) }) });
    assert.equal(withHeader, "t-1");
    const noHeader = await m.resolveOrgTenant("org-a", { request: async () => ({ headers: new Map() }) });
    assert.equal(noHeader, null);
    const offline = await m.resolveOrgTenant("org-a", { request: async () => { throw new Error("ENOTFOUND"); } });
    assert.equal(offline, null, "an unreachable endpoint is unknown, never a match");
});

test("resolveOrgTenant: the organisation is encoded into the URL, not concatenated", async () => {
    let seen = null;
    await m.resolveOrgTenant("a org/../x", { request: async (url) => { seen = url; return { headers: new Map() }; } });
    assert.ok(!seen.includes("../"), `path traversal reached the URL: ${seen}`);
    assert.ok(seen.startsWith("https://vssps.dev.azure.com/"), seen);
});

test("resolveOrgTenant: the request is bounded, because doctor prints nothing until it returns", async () => {
    // Measured: a host that completes the handshake and then says nothing left the promise pending
    // past 73s -- undici waits out a 300s headers timeout, and cmdDoctor emits its whole report in one
    // write after this await. A developer diagnosing a broken setup reads that as doctor hanging.
    let opts = null;
    await m.resolveOrgTenant("org-a", { request: async (url, o) => { opts = o; return { headers: new Map() }; } });
    assert.equal(opts.method, "HEAD");
    assert.ok(opts.signal instanceof AbortSignal, "an unbounded fetch is what makes doctor look hung");
});

test("resolveOrgTenant: an empty binding header is unknown, not a tenant of the empty string", async () => {
    const empty = await m.resolveOrgTenant("org-a", { request: async () => ({ headers: new Map([["x-vss-resourcetenant", ""]]) }) });
    assert.equal(empty, null, '"" would be compared against the declared tenantId and reported as a mismatch');
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
    // itself; that cmdDoctor calls THIS function, not a lookalike, is the test below.
    // Comments stripped before the slice.
    const body = strippedBodyOf("async function oauthTenantChecks");
    assert.notEqual(body, "", "oauthTenantChecks moved");
    assert.match(body, /Object\.entries\(cfg\.oauth/, "the tenant loop must be driven by the declaration");
    assert.match(body, /references\.find/, "and still prefer the reference once one exists");
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

// A name held by BOTH kinds, declared in ONE file. The scope is load-bearing and the two fixtures are
// not interchangeable: a project-declared `local` secret needs no authorization, so resolution is
// reached and a kind-blind lookup gets as far as handing its value over. Put the same secret at user
// scope and `crossingProblem` throws first — which masks the injection behind an authorization error.
function collidingProjectPaths(envValue, extraEnv = {}) {
    return scopedPaths({
        project: {
            projectId: "proj-x",
            secrets: { ado: { backend: "local" } },
            oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: envValue, ...extraEnv } } },
        },
    });
}

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

test("resolveEnvEntries: an oauth reference never resolves a same-named secret", async () => {
    let asked = 0;
    // A SECOND env var that is a real secret ref: without one, `asked === 0` holds because the
    // fixture offers no backend contact to make, not because validation refused before making it.
    const cfg = m.loadConfig(scopedPaths({ project: {
        projectId: "proj-x",
        secrets: { ado: { backend: "local" }, other: { backend: "local" } },
        oauth: { ado: OAUTH_DECL },
        servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: "oauth:ado", OTHER: "secret:other" } } },
    } }));
    // Asserted, not described: move this fixture's secret to user scope and the authorization gate
    // throws before resolution, leaving `asked` at 0 for a reason that has nothing to do with the
    // kind branch — the test would keep passing while proving nothing about the injection.
    // Both halves: crossingProblem is also null for a secret that is not declared at all, so on its
    // own it is satisfied by a fixture with no collision left in it.
    assert.ok(Object.hasOwn(cfg.secrets, "ado"));
    assert.equal(m.crossingProblem(cfg, "servers", "s", "ado"), null);
    // Matched, not bare: a bare `rejects` is satisfied by any throw, so the refusal could move to an
    // unrelated cause and `asked === 0` would still hold for the wrong reason. The message's own
    // content is pinned by "an authorization refusal names the doctor command, and doctor's own
    // report names the same where", not here.
    await assert.rejects(() => m.resolveEnvEntries("s", cfg, async () => { asked += 1; return "PLAINTEXT"; }),
        /not authorized/);
    assert.equal(asked, 0, "the secret resolver is never reached");
});

test("resolveEnvEntries: an undeclared oauth reference is named as an oauth entry, not as a secret", async () => {
    // `nope` is in neither section, so what this pins is which section the message sends the reader to:
    // a kind-blind lookup reports a missing SECRET, and the reader adds the wrong declaration.
    const cfg = m.loadConfig(collidingProjectPaths("oauth:nope"));
    await assert.rejects(() => m.resolveEnvEntries("s", cfg, async () => "PLAINTEXT"),
        /undeclared oauth entry "nope"/);
});

test("resolveEnvEntries: the oauth branch looks the name up among oauth entries, not among secrets", async () => {
    // Neither fixture above can tell the two maps apart — one declares the name in both sections and
    // the other uses a name in neither. Here it is a secret and there is no oauth section at all, so
    // consulting the wrong map turns "you have not declared this" into "this build cannot do it yet".
    const cfg = m.loadConfig(scopedPaths({
        project: {
            projectId: "proj-x",
            secrets: { ado: { backend: "local" } },
            servers: { s: { command: "npx", args: [], env: { ADO_TOKEN: "oauth:ado" } } },
        },
    }));
    await assert.rejects(() => m.resolveEnvEntries("s", cfg, async () => "PLAINTEXT"),
        /undeclared oauth entry "ado"/);
});

// A project-scope sign-in WITH its registration grant in the user file, and a server whose shape
// matches what the grant authorizes — the only fixture in which an oauth reference gets past
// authorization at all.
function authorizedOauthPaths() {
    return scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK } } },
        project: {
            projectId: "proj-x",
            oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "npx", args: ["-y", "some-oauth-package"], env: { ADO_TOKEN: "oauth:ado" } } },
        },
    });
}

test("resolveEnvEntries: an oauth reference is reported apart from the resolved environment", async () => {
    const cfg = m.loadConfig(authorizedOauthPaths());
    const out = await m.resolveEnvEntries("s", cfg, async () => "PLAINTEXT");
    assert.deepEqual(Object.keys(out).sort(), ["env", "oauth"]);
    assert.deepEqual(out.env, {}, "an oauth ref contributes no value here — the launcher supplies it");
    assert.equal(out.oauth.length, 1);
    assert.equal(out.oauth[0].envVar, "ADO_TOKEN");
    assert.equal(out.oauth[0].name, "ado");
    // The declaration itself travels, not just its name: the launcher needs tenantId/clientId to
    // acquire the token, and re-looking it up by name is what the collision tests above forbid.
    assert.equal(out.oauth[0].decl.clientId, OAUTH_CLIENT_ID);
});

test("resolveEnvEntries: a user-scope launchable needs no grant for a sign-in, exactly as for a secret", async () => {
    // crossingProblem exempts a user-scope launchable consuming a user-scope declaration — it is not
    // crossing a scope boundary, so there is nothing for a grant to police. Without the same exemption
    // the two kinds disagree on the plainest config there is: everything in one personal file.
    const paths = (env, extra) => scopedPaths({ user: { ...extra,
        servers: { s: { command: "npx", args: [], env } } } });
    const viaOauth = m.loadConfig(paths({ TOK: "oauth:ado" }, { oauth: { ado: OAUTH_DECL } }));
    const out = await m.resolveEnvEntries("s", viaOauth, async () => "PLAINTEXT");
    assert.equal(out.oauth.length, 1);
    // The positive control, in the same test: the secret path has always allowed this shape.
    const viaSecret = m.loadConfig(paths({ TOK: "secret:ado" }, { secrets: { ado: { backend: "local" } } }));
    assert.deepEqual((await m.resolveEnvEntries("s", viaSecret, async () => "PLAINTEXT")).env, { TOK: "PLAINTEXT" });
});

test("resolveEnvEntries: a user-scope launchable is exempt only while the declaration it consumes is the user's too", async () => {
    // The merge lets a repository's declaration replace a user-scope one of the same name, and a server
    // you wrote follows the name. The exemption therefore needs BOTH sides to be user-home: a fixture
    // with both at user scope is satisfied by either rule, which is why "resolveEnvEntries: a user-scope
    // launchable needs no grant for a sign-in, exactly as for a secret" cannot stand in for this one.
    const grant = { servers: { s: { command: "npx", args: [], envKeys: ["TOK"] } } };
    const paths = (extraUser) => scopedPaths({
        user: { servers: { s: { command: "npx", args: [], env: { TOK: "oauth:ado" } } }, ...extraUser },
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL } },
    });
    const refused = m.loadConfig(paths({}));
    await assert.rejects(() => m.resolveEnvEntries("s", refused, async () => "PLAINTEXT"), /not authorized to receive "ado"/);

    const granted = m.loadConfig(paths({ registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: grant } } }));
    const out = await m.resolveEnvEntries("s", granted, async () => "PLAINTEXT");
    assert.equal(out.oauth.length, 1, "with the registration block the user-scope server may receive the repository's sign-in");
});

// A user-scope server `s` that consumes `secret:pat`, whose declaration comes from the file(s) given.
const KV_PAT = { backend: "keyvault", vault: "demo-vault", secret: "pat-secret" };
const KV_PAT_SHAPE = { command: "printenv", args: ["PAT"], envKeys: ["PAT"] };

function userServerPaths({ user = {}, project }) {
    return scopedPaths({
        user: { servers: { s: { command: "printenv", args: ["PAT"], env: { PAT: "secret:pat" } } }, ...user },
        project,
    });
}

test("resolveEnvEntries: a user-scope server is refused a Key Vault secret the repository declared, until the vaults block names it", async () => {
    // The repository picks the vault and the secret name; the developer's `az` login pays. Whether the
    // consuming server sits in the user file is beside the point -- the read is the repository's choice.
    const repoDeclares = { projectId: "proj-x", secrets: { pat: KV_PAT } };
    let called = false;
    const resolver = async () => { called = true; return "tok"; };
    const refused = m.loadConfig(userServerPaths({ project: repoDeclares }));
    await assert.rejects(() => m.resolveEnvEntries("s", refused, resolver), /not authorized to receive "pat"/);
    assert.equal(called, false, "the vault must not be contacted for a refused launch");

    // The same block format a project launchable uses, keyed by the consumer's kind and name.
    const vaults = { "demo-vault": { "pat-secret": { servers: { s: KV_PAT_SHAPE } } } };
    const granted = m.loadConfig(userServerPaths({ user: { vaults }, project: repoDeclares }));
    assert.deepEqual((await m.resolveEnvEntries("s", granted, resolver)).env, { PAT: "tok" });

    // A grant for the wrong vault does not transfer, as for a project launchable.
    const elsewhere = m.loadConfig(userServerPaths({
        user: { vaults: { "other-vault": { "pat-secret": { servers: { s: KV_PAT_SHAPE } } } } }, project: repoDeclares }));
    await assert.rejects(() => m.resolveEnvEntries("s", elsewhere, resolver), /not authorized/);
});

test("resolveEnvEntries: a repository overriding a user-declared secret by name does not slip past a user-scope server", async () => {
    // The shape the merge makes possible: the user file declares `pat` itself, the repository declares
    // the same name as a Key Vault read, and the repository's entry wins.
    const cfg = m.loadConfig(userServerPaths({
        user: { secrets: { pat: { backend: "local" } } },
        project: { projectId: "proj-x", secrets: { pat: KV_PAT } },
    }));
    assert.equal(cfg.secrets.pat.home, "project");
    await assert.rejects(() => m.resolveEnvEntries("s", cfg, async () => "tok"), /not authorized to receive "pat"/);
});

test("resolveEnvEntries: a user-scope server consuming a user-declared secret is unaffected, Key Vault included", async () => {
    // Both sides are the user's, so there is nothing to authorize -- the positive control for the two
    // tests above, without which a rule that refused every user-scope launchable would pass them.
    for (const decl of [{ backend: "local" }, KV_PAT]) {
        const cfg = m.loadConfig(userServerPaths({ user: { secrets: { pat: decl } }, project: { projectId: "proj-x" } }));
        assert.equal(m.crossingProblem(cfg, "servers", "s", "pat"), null, decl.backend);
        assert.deepEqual((await m.resolveEnvEntries("s", cfg, async () => "tok")).env, { PAT: "tok" }, decl.backend);
    }
});

test("resolveEnvEntries: a project-local override of a user-declared secret stays allowed for a user-scope server", async () => {
    // authorizationFor returns null for a project-declared `local` secret: its key is namespaced to the
    // project, so what is read is what was `set` for it, not something the repository can aim elsewhere.
    const cfg = m.loadConfig(userServerPaths({
        user: { secrets: { pat: KV_PAT } },
        project: { projectId: "proj-x", secrets: { pat: { backend: "local" } } },
    }));
    assert.equal(cfg.secrets.pat.home, "project");
    assert.equal(m.crossingProblem(cfg, "servers", "s", "pat"), null);
    assert.deepEqual((await m.resolveEnvEntries("s", cfg, async () => "tok")).env, { PAT: "tok" });
    // No AUTHORIZATION is needed, but the launch is not free: the namespace is the repository's projectId
    // claim, and only a trust record for this root pins it.
    assert.equal(m.trustProblem(cfg, "servers", "s", NO_TRUST)?.reason, "untrusted",
        "the launch is gated by this checkout's trust");
    assert.equal(m.trustProblem(cfg, "servers", "s", trustedStateFor(cfg)), null);
});

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

test("resolveEnvEntries: a grant naming the task list does not authorize a server of the same name", async () => {
    // The grant is read at cfg.registrations[t][c][kind][name]; ignoring `kind` would let a task's
    // authorization launch a server, which is a different command with different arguments.
    const cfg = m.loadConfig(scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: { tasks: REGISTRATION_BLOCK.servers } } } },
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "npx", args: ["-y", "some-oauth-package"], env: { ADO_TOKEN: "oauth:ado" } } } },
    }));
    await assert.rejects(() => m.resolveEnvEntries("s", cfg, async () => "x"), /not authorized/);
});

test("resolveEnvEntries: an env entry declared after an oauth reference still reaches the child", async () => {
    // The oauth branch ends in `continue`; a `break` would silently drop everything after it.
    const cfg = m.loadConfig(scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: {
            servers: { s: { command: "npx", args: ["-y", "some-oauth-package"], envKeys: ["ADO_TOKEN", "TRAILING"] } } } } } },
        project: { projectId: "proj-x", oauth: { ado: OAUTH_DECL }, secrets: { later: { backend: "local" } },
            servers: { s: { command: "npx", args: ["-y", "some-oauth-package"],
                env: { ADO_TOKEN: "oauth:ado", TRAILING: "secret:later" } } } },
    }));
    const out = await m.resolveEnvEntries("s", cfg, async () => "PLAINTEXT");
    assert.deepEqual(out.env, { TRAILING: "PLAINTEXT" });
    assert.equal(out.oauth.length, 1);
});

// ---------------------------------------------------------------------------------------------
// cmdLaunch — the real launch path: resolve, refuse a second oauth reference, acquire
// and deliver a token through the channel for the ones that carry one, spawn, and forward signals.
// Ported from mcpw.js's cmdRun and mcpw.test.js's own cmdRun test block, with the naming map
// applied: cmdRun(server, cfg, deps) -> cmdLaunch(kind, name, cfg, deps), McpwError ->
// VcSecretsError, MCPW_* -> VC_SECRETS_*.
// The tests below that need a real bound channel live in vc-secrets-oauth.test.mjs (channelTest) —
// these do not reach createChannel at all, so a plain `test` is enough.
// ---------------------------------------------------------------------------------------------

// Every in-process launch below that is not ABOUT the Windows bind goes through this. With no bindPlatform
// cmdLaunch binds the launching process to a kill-on-close job on win32 -- and in these tests the launching
// process is the test runner, so an unset default would put the runner itself in a job. A test about the
// bind passes bindPlatform: "win32" and stubs credReadMany (launchWithBind, above).
function launch(kind, name, cfg, deps = {}) {
    return m.cmdLaunch(kind, name, cfg, { bindPlatform: "linux", ...deps });
}

test("every in-process launch call (cmdLaunch, or the cmdRun/cmdTask wrappers around it) in the test sources states its bind platform", () => {
    // Left unset, cmdLaunch binds the launching process to a kill-on-close job on win32 through a real
    // PowerShell -- and here that process is the test runner. Nothing fails on a Linux run, so the
    // omission only shows on the Windows leg, as a runner that dies with the job. cmdRun and cmdTask
    // forward their deps to cmdLaunch and default to none, so they bind the runner exactly as it does.
    // The platform must be a literal INSIDE the call's own arguments: a comment, `bindPlatform:
    // undefined`, or a literal belonging to the next statement leaves the bind on its win32 default.
    // Every test source is scanned -- the *.test.mjs files and test-support.mjs, walked, so a file
    // split off later is covered on arrival. Two residuals, stated rather than left to be found: a
    // helper that spreads caller deps AFTER its literal (`launch`) can still be overridden by its
    // caller, and a literal nested deeper in the arguments (`{ deps: { bindPlatform: "linux" } }`)
    // satisfies the match without reaching cmdLaunch.
    const callSite = /m\.(?:cmdLaunch|cmdTask|cmdRun)\(/g;
    const root = fileURLToPath(new URL("./", import.meta.url));
    const walk = (dir, prefix = "") => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        (e.isDirectory() ? walk(path.join(dir, e.name), `${prefix}${e.name}/`) : [`${prefix}${e.name}`]));
    const files = walk(root).filter((f) => f.endsWith(".test.mjs") || f === "test-support.mjs");
    assert.ok(files.includes("vc-secrets.test.mjs") && files.includes("vc-secrets-oauth.test.mjs"), files.join(","));
    for (const file of files) {
        const source = stripComments(fs.readFileSync(path.join(root, file), "utf8"));
        const blanked = codeOnly(source);
        for (const hit of source.matchAll(callSite)) {
            const where = `${file}:${source.slice(0, hit.index).split("\n").length}`;
            const args = callArguments(source, hit.index + hit[0].length, blanked);
            assert.match(args, /bindPlatform:\s*"[^"]+"/, `${where} launches in-process without a literal bind platform`);
        }
    }
});

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
    // listener here is the POSIX group kill; the oauth path's own "exit" handler is pinned in
    // vc-secrets-oauth.test.mjs, where a launch reaches it.
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

// Hex as PS_CRED_READ and PS_CRED_READ_MANY print a Credential Manager blob: UTF-8 bytes, two digits each.
const credHex = (value) => Buffer.from(value, "utf8").toString("hex");

test("readWcmBatch: a value, ERROR_NOT_FOUND and any other code seed exactly what a single read returns or throws", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    // The expected outcomes are not written out: they are what the single-read resolver produces against a
    // PowerShell stub exiting the way PS_CRED_READ does -- the value as hex, exit 3 for 1168, exit 1 naming
    // any other code. So "absent" stays 1168 alone, the way the single read has it: an unreadable store
    // read as absent sends a developer through a sign-in that rotates a live refresh token away.
    const cfg = m.loadConfig(scopedPaths({ user: {
        secrets: { pat: { backend: "local" }, gone: { backend: "local" }, locked: { backend: "local" },
            vaulted: { backend: "keyvault", vault: "kv-one", secret: "s1" } },
        servers: {} } }));
    const env = { VC_SECRETS_LOCAL_BACKEND: "wcm", VC_SECRETS_POWERSHELL: "vc-ps-batch-stub" };
    const stub = `#!/bin/sh
case "$VC_SECRETS_NAME" in
  *:pat) printf '%s\\n' '${credHex("the-pat-value")}'; exit 0 ;;
  *:gone) exit 3 ;;
  *) printf 'CredRead failed win32err=5' >&2; exit 1 ;;
esac
`;
    const names = ["pat", "gone", "locked"];
    const single = {};
    await withStubOnPath("vc-ps-batch-stub", stub, async () => {
        const resolver = m.makeSecretResolver(cfg, env);
        for (const name of names) {
            try {
                single[name] = { value: await resolver(name, cfg.secrets[name]) };
            } catch (e) {
                single[name] = { message: e.message, toolExitCode: e.toolExitCode };
            }
        }
    });
    assert.equal(single.pat.value, "the-pat-value", "the control: the stub answers the single read");
    assert.notEqual(single.gone.message, single.locked.message, "the control: absent and unreadable differ");

    const key = (name) => m.keyFor(name, cfg.secrets[name], cfg);
    const resolver = m.makeSecretResolver(cfg, env);
    let asked = null;
    const { seeded, job } = await resolver.readWcmBatch(
        [...names, "vaulted"].map((name) => ({ name, decl: cfg.secrets[name] })),
        { pid: 4242, run: async ({ keys, pid }) => {
            asked = { keys, pid };

            return { creds: { [key("pat")]: { ok: credHex("the-pat-value") }, [key("gone")]: { err: 1168 },
                [key("locked")]: { err: 5 } }, job: "ok" };
        } });
    assert.deepEqual(asked, { keys: names.map(key), pid: 4242 }, "one call, the wcm keys only, and the pid to bind");
    assert.equal(job, "ok");
    for (const name of names) {
        const outcome = seeded.get(name);
        if (single[name].value !== undefined) {
            assert.equal(outcome, single[name].value, name);
        } else {
            assert.ok(outcome instanceof m.VcSecretsError, name);
            assert.deepEqual({ message: outcome.message, toolExitCode: outcome.toolExitCode }, single[name], name);
        }
    }
    assert.equal(seeded.has("vaulted"), false, "a Key Vault secret is not Credential Manager's to read");
    assert.deepEqual(resolver.resolvedValues, ["the-pat-value"], "a seeded value is already in the redaction list");
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

// ---------------------------------------------------------------------------------------------
// The oauth entry's two keystore keys ride in the launch's one PowerShell call on win32. What that is
// allowed to change is only where the FIRST readCache of a launch gets its bytes: the exchange spends the
// refresh token read under the lock, so these tests drive the real oauthLaunchDeps through cmdLaunch, with
// the batched call stubbed (credReadMany) and the live keystore reads stubbed apart from it (run).
// ---------------------------------------------------------------------------------------------

const D1_ENV = { VC_SECRETS_LOCAL_BACKEND: "wcm", VC_SECRETS_POWERSHELL: "vc-no-such-powershell" };

// A user-scope launchable, so no trust or registration is involved: the secret (when there is one) and
// the oauth entry "ado" share one scope, "user".
function d1Config({ secretName = "pat" } = {}) {
    const env = { ADO_TOKEN: "oauth:ado" };
    const secrets = {};
    if (secretName !== null) {
        secrets[secretName] = { backend: "local" };
        env.PAT = `secret:${secretName}`;
    }
    const cfg = m.loadConfig(scopedPaths({ user: { oauth: { ado: OAUTH_DECL }, secrets,
        servers: { s: { command: "node", args: ["server.js"], env } } } }));
    const identity = { tenantId: cfg.oauth.ado.tenantId, clientId: cfg.oauth.ado.clientId, scopes: cfg.oauth.ado.scopes };

    return {
        cfg,
        keys: m.oauthEntryKeys("ado", cfg.oauth.ado, cfg),
        secretKey: (name) => m.keyFor(name, cfg.secrets[name], cfg),
        refreshBlob: (refreshToken) => cache.serializeRefresh({ refreshToken, ...identity }),
        accessBlob: (accessToken) => cache.serializeAccess({ accessToken, expiresAt: Date.now() + 3_600_000,
            obtainedAt: Date.now(), lifetimeMs: 3_600_000, uptimeAtIssue: os.uptime() }),
    };
}

// Live keystore reads: `store` maps a full key to the stored text; a key it does not hold is the
// entry-not-found exit. Every key asked for is appended to `reads`.
function d1LiveRun(store, reads) {
    return async (spec) => {
        const key = spec.extraEnv.VC_SECRETS_NAME;
        reads.push(key);
        if (!Object.hasOwn(store, key)) {
            throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 3 });
        }

        return credHex(store[key]);
    };
}

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

test("oauthLaunchDeps: the seed answers the first readCache only, and a later one reads the keystore", async () => {
    const fx = d1Config();
    const reads = [];
    const seed = new Map([[fx.keys.refresh, { ok: credHex(fx.refreshBlob("r-batch")) }],
        [fx.keys.access, { ok: credHex(fx.accessBlob("a-batch")) }]]);
    const deps = m.oauthLaunchDeps("ado", fx.cfg.oauth.ado, fx.cfg, { backend: "wcm", seed,
        run: d1LiveRun({ [fx.keys.refresh]: fx.refreshBlob("r-live"), [fx.keys.access]: fx.accessBlob("a-live") }, reads) });

    assert.deepEqual(await deps.readCache(), { state: "valid", accessToken: "a-batch" });
    assert.deepEqual(reads, [], "the first call was answered from the batch");
    assert.deepEqual(await deps.readCache(), { state: "valid", accessToken: "a-live" });
    assert.deepEqual(reads, [fx.keys.refresh, fx.keys.access], "the second call read the keystore");
    assert.deepEqual(await deps.readCache(), { state: "valid", accessToken: "a-live" });
    assert.equal(reads.length, 4);
});

test("oauthLaunchDeps: a seed whose first use throws is gone for the next readCache", async () => {
    const fx = d1Config();
    const reads = [];
    const seed = new Map([[fx.keys.refresh, { err: 5 }]]);
    const deps = m.oauthLaunchDeps("ado", fx.cfg.oauth.ado, fx.cfg, { backend: "wcm", seed,
        run: d1LiveRun({ [fx.keys.refresh]: fx.refreshBlob("r-live"), [fx.keys.access]: fx.accessBlob("a-live") }, reads) });

    await assert.rejects(() => deps.readCache(), /win32err=5/);
    assert.deepEqual(reads, []);
    assert.deepEqual(await deps.readCache(), { state: "valid", accessToken: "a-live" });
    assert.deepEqual(reads, [fx.keys.refresh, fx.keys.access], "the failure did not leave the batch behind for the retry");
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

async function waitFor(condition, { timeoutMs, stepMs = 25 }) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const value = condition();
        if (value) {
            return value;
        }
        await new Promise((resolve) => setTimeout(resolve, stepMs));
    }

    return condition();
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
// below waits for the error to be handled by sleeping, which a delayed error would defeat; the order here is
// fixed by construction.
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

test("resolveEnvEntries: an oauth reference with no registration grant is refused before any backend is contacted", async () => {
    // The second env entry is what lets `asked` fail at all: with only the oauth reference declared
    // there is nothing for resolveSecret to be called about, so the counter reads 0 whatever the code
    // does. With a resolvable secret sitting behind the refused reference, a check that fired late --
    // or a loop that carried on to the next entry -- resolves it and the count goes to 1.
    let asked = 0;
    const cfg = m.loadConfig(collidingProjectPaths("oauth:ado", { OTHER_TOKEN: "secret:ado" }));
    await assert.rejects(() => m.resolveEnvEntries("s", cfg, async () => { asked += 1; return "PLAINTEXT"; }),
        /not authorized to receive "ado".*registrations\./s);
    assert.equal(asked, 0, "no backend is contacted for any entry once the reference is refused");
});

test("resolveEnvEntries: a grant authorizing a different launch shape is refused, naming the difference", async () => {
    // A grant is a launch shape, not a yes: the registration authorizes THIS command with THESE args,
    // so a server that keeps the name and changes what it runs is not covered by it.
    const cfg = m.loadConfig(scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK } } },
        project: {
            projectId: "proj-x",
            oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "npx", args: ["-y", "a-different-package"], env: { ADO_TOKEN: "oauth:ado" } } },
        },
    }));
    // Both halves: that a difference is NAMED, and which side is which — shapeDifferences renders
    // "args are <actual>, authorized <granted>", so swapping its arguments inverts the advice and
    // sends the reader to change the half that was already right.
    await assert.rejects(() => m.resolveEnvEntries("s", cfg, async () => "PLAINTEXT"),
        /authorized for a different shape: args are \["-y","a-different-package"\], authorized \["-y","some-oauth-package"\]/);
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

test("sanitizeEnv: strips DANGEROUS_ENV_VARS, keeps everything else", () => {
    assert.deepEqual(
        m.sanitizeEnv({ NODE_OPTIONS: "x", LD_PRELOAD: "y", PATH: "p" }),
        { PATH: "p" });
    assert.deepEqual(
        m.sanitizeEnv({ LD_AUDIT: "a", LD_LIBRARY_PATH: "b", DYLD_INSERT_LIBRARIES: "c", DYLD_LIBRARY_PATH: "d" }),
        {});
    assert.deepEqual(m.sanitizeEnv({ FOO: "bar" }), { FOO: "bar" });
});

test("a dangerous env key is refused and stripped whatever its case — Windows reads them case-insensitively", () => {
    // `node_options` inherited from the operator's shell, or declared in a server's env, reaches a child
    // on Windows as NODE_OPTIONS: the platform folds the case, so a case-sensitive list would pass
    // through the exact injection it names. The declaration is written on one platform and run on another,
    // so the refusal cannot be conditional on this one.
    for (const key of ["node_options", "Node_Options", "ld_preload", "DyLd_Insert_Libraries"]) {
        assert.deepEqual(m.sanitizeEnv({ [key]: "x", PATH: "p" }), { PATH: "p" }, key);
        assert.throws(() => m.loadConfig(projectPaths({
            secrets: {}, servers: { s: { command: "node", args: [], env: { [key]: "--require=/tmp/x.js" } } } })),
        /code-injection vector/, key);
    }
});

test("a launcher's own injection hook is refused and stripped like the loader's", () => {
    // An approved server shape is its env-key NAMES, so a key the list misses lets the repo change only
    // the literal behind it. `npm exec` writes npm_config_node_options back into NODE_OPTIONS for the
    // node it starts, which undoes sanitizeEnv; script_shell picks what a bare `npx` runs; the .NET pair
    // loads code before the tool's own runs. npm reads either spelling of its keys; the lowercase one
    // also exercises the case folding.
    for (const key of ["npm_config_node_options", "npm_config_script_shell", "DOTNET_STARTUP_HOOKS", "CORECLR_ENABLE_PROFILING"]) {
        assert.deepEqual(m.sanitizeEnv({ [key]: "x", PATH: "p" }), { PATH: "p" }, key);
        assert.throws(() => m.loadConfig(projectPaths({
            secrets: {}, servers: { s: { command: "npx", args: [], env: { [key]: "literal:x" } } } })),
        /code-injection vector/, key);
    }
});

test("an npm rc-file pointer is refused when declared, and kept when inherited", () => {
    // Declared, it lets the repository pick an rc file whose node-options line restores NODE_OPTIONS --
    // measured. Inherited, it is the user's own file, and often the only place a scope's registry
    // mapping lives: stripping it sends `npx <private-pkg>` to the public registry, which then runs
    // whatever is published under that name.
    for (const key of ["npm_config_userconfig", "NPM_CONFIG_GLOBALCONFIG"]) {
        assert.deepEqual(m.sanitizeEnv({ [key]: "x", PATH: "p" }), { [key]: "x", PATH: "p" }, key);
        assert.throws(() => m.loadConfig(projectPaths({
            secrets: {}, servers: { s: { command: "npx", args: [], env: { [key]: "literal:x" } } } })),
        /code-injection vector/, key);
    }
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

// The pre-rename suite pinned two properties against the ONE repo's committed declaration. This plugin
// ships no servers, so there is no such file — and re-stating a fixture as its own assertion would be a
// test that cannot fail. What survives the move is the launcher property each check was really about.

test("a pinned argv reaches the child exactly as declared, even through the win32 .cmd rewrite", () => {
    const args = ["-y", "@vendor/mcp@1.2.3", "--flag", "value with spaces"];
    const cfg = { servers: { pinned: { command: "npx", args, env: {} } } };
    const loaded = m.loadConfig(projectPaths(cfg));

    // platform: "linux" would make buildSpawnInvocation the identity function — this only pins a JSON
    // round-trip. win32 with an extension-less command is what actually exercises the rewrite.
    const existsSync = onlyFiles("c:/bin/npx.cmd", "c:/bin/cmd.exe");
    const resolved = m.resolveSpawnCommand(loaded.servers.pinned.command, {
        platform: "win32", env: { Path: "C:\\bin", PATHEXT: ".COM;.EXE;.BAT;.CMD" }, existsSync,
    });
    assert.equal(resolved.kind, "cmd-shim", "must exercise the .cmd-shim rewrite this test claims to guard");
    const invocation = m.buildSpawnInvocation(resolved, loaded.servers.pinned.args);

    // A version pin is only worth writing down if it survives to argv — verify each declared token
    // appears intact and in order inside the verbatim cmd.exe line.
    assert.equal(invocation.cmd, "C:\\bin\\cmd.exe");
    assert.deepEqual(invocation.args, [`/d /v:off /s /c ""${resolved.cmd}" ${args.map((a) => `"${a}"`).join(" ")}"`]);
    assert.equal(invocation.opts.windowsVerbatimArguments, true);
});

test("two servers naming different secrets get different values", async () => {
    const cfg = {
        projectId: "demo",
        secrets: { "sp-a": { backend: "local" }, "sp-b": { backend: "local" } },
        servers: {
            a: { command: "x", args: [], env: { CLIENT_SECRET: "secret:sp-a" } },
            b: { command: "x", args: [], env: { CLIENT_SECRET: "secret:sp-b" } },
        },
    };
    const loaded = m.loadConfig(projectPaths(cfg));
    const asked = [];
    const fake = async (name) => {
        asked.push(name);

        return `value-of-${name}`;
    };
    const { env: envA } = await m.resolveEnvEntries("a", loaded, fake);
    const { env: envB } = await m.resolveEnvEntries("b", loaded, fake);

    // The failure this guards is a per-name cache degenerating into a per-run one, which would hand
    // the second server the first one's credential — with both servers looking correctly configured.
    assert.equal(envA.CLIENT_SECRET, "value-of-sp-a");
    assert.equal(envB.CLIENT_SECRET, "value-of-sp-b");
    assert.deepEqual(asked, ["sp-a", "sp-b"]);
});

// ── regressions: keystore absence and declaration loading ──────────────────────────────────────────

// Puts an executable stub earlier on PATH than the real binary, so a backend read can be made to fail
// in a chosen way without touching any real credential store.
// On win32 a `#!/bin/sh` body is not executable by a shell-less spawn, and resolveSpawnCommand only
// recognizes a `.cmd`/`.bat` shim there — so the body is kept as `<name>.sh` and paired with a `.cmd`
// launcher that hands it to `sh` (Git Bash, present on GitHub's windows-latest runners), forwarding
// arguments and the child's exit code. `platform` defaults to process.platform but takes an explicit
// value so the win32 branch is unit-testable without faking a global.
function stubBinary(name, script, platform = process.platform) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-bin-"));
    tmpDirs.push(dir);
    if (platform === "win32") {
        fs.writeFileSync(path.join(dir, `${name}.sh`), script, { mode: 0o755 });
        fs.writeFileSync(path.join(dir, `${name}.cmd`), `@echo off\r\nsh "%~dp0${name}.sh" %*\r\nexit /b %ERRORLEVEL%\r\n`);
    } else {
        fs.writeFileSync(path.join(dir, name), script, { mode: 0o755 });
    }

    return dir;
}

test("stubBinary: on win32 writes a .sh body plus a .cmd launcher naming it", () => {
    const dir = stubBinary("gpg", "#!/bin/sh\nexit 0\n", "win32");
    assert.ok(fs.existsSync(path.join(dir, "gpg.sh")));
    assert.match(fs.readFileSync(path.join(dir, "gpg.cmd"), "utf8"), /gpg\.sh/);
});

// runTool spawns with process.env, not with the env handed to the builders, so a stub is only reachable
// by moving the real PATH aside for the duration of the call.
async function withStubOnPath(name, script, fn) {
    const binDir = stubBinary(name, script);
    const saved = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${saved}`;
    try {
        return await fn();
    } finally {
        process.env.PATH = saved;
    }
}

test("newKeyPresent: gpg — absence is the file not existing, not a failed read", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-gpg-"));
    tmpDirs.push(dir);
    const env = { XDG_CONFIG_HOME: dir };
    const key = `${m.KEY_PREFIX}:demo:tok`;
    assert.equal(await m.newKeyPresent("gpg", key, env), false);
    fs.mkdirSync(path.dirname(m.keyToPath(key, env)), { recursive: true });
    fs.writeFileSync(m.keyToPath(key, env), "ciphertext");
    assert.equal(await m.newKeyPresent("gpg", key, env), true);
});

test("newKeyPresent: a read that fails for any reason OTHER than absence throws instead of reporting absent", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    // The bug this pins destroyed credentials: migrate answered "already present?" through a bare catch,
    // so a cold agent or a timeout looked like absence and the stale legacy value was written over a
    // freshly rotated one — reported as "1 migrated, 0 failed".
    await withStubOnPath("security", "#!/bin/sh\nexit 1\n", () =>   // 44 means absent; 1 does not
        assert.rejects(() => m.newKeyPresent("keychain", `${m.KEY_PREFIX}:demo:tok`), /exited 1/));
});

test("newKeyPresent: keychain exit 44 IS absence", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    await withStubOnPath("security", "#!/bin/sh\nexit 44\n", async () => {
        assert.equal(await m.newKeyPresent("keychain", `${m.KEY_PREFIX}:demo:tok`), false);
    });
});

test('projectId "user" is refused — it is the user scope\'s own namespace', () => {
    const cfg = { projectId: "user", secrets: { tok: { backend: "local" } }, servers: {} };
    assert.throws(() => m.loadConfig(projectPaths(cfg)), /reserved for the user scope/);
});

test("a secret name that is not referenceable is refused at parse time", () => {
    for (const bad of ["../../../../etc/shadow", "A b\nc", "Upper", "with_underscore"]) {
        assert.throws(
            () => m.loadConfig(projectPaths({ secrets: { [bad]: { backend: "local" } }, servers: {} })),
            /name must match/,
            `expected "${bad}" to be refused`);
    }
});

test("a launchable named __proto__ does not vanish from the merged map", () => {
    // A computed key, because `{ __proto__: … }` in a literal sets the prototype instead of a property
    // — and JSON.stringify would then drop it, leaving the fixture empty and the test green for the
    // wrong reason. This is the same hazard the null-prototype merged map exists for.
    const cfg = { secrets: {}, servers: { ["__proto__"]: { command: "x", args: [], env: {} } } };
    const loaded = m.loadConfig(projectPaths(cfg));
    assert.deepEqual(Object.keys(loaded.servers), ["__proto__"]);
    assert.equal(loaded.servers["__proto__"].command, "x");
});

test("configPaths: the user's own ~/.claude/vc-secrets.json is never taken for the project file", () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-home-"));
    tmpDirs.push(home);
    fs.mkdirSync(path.join(home, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(home, ".claude", m.CONFIG_NAME), JSON.stringify({ secrets: {}, servers: {} }));
    const nested = path.join(home, "work", "repo", "src");
    fs.mkdirSync(nested, { recursive: true });

    const paths = m.configPaths({ HOME: home }, nested);

    // Both scopes resolving to one file would make loadConfig drop it as a duplicate, leaving doctor
    // with no anchor for settings.local.json / .mcp.json — and its legacy-token advice inverted.
    assert.equal(paths.user, path.join(home, ".claude", m.CONFIG_NAME));
    assert.equal(paths.project, null);
    assert.equal(paths.local, null);
});

// ── hooks/guard-declarations.mjs ───────────────────────────────────────────────────────────────────

const GUARD_HOOK_PATH = fileURLToPath(new URL("./hooks/guard-declarations.mjs", import.meta.url));

function runGuardHook(stdinText) {
    return spawnSync(process.execPath, [GUARD_HOOK_PATH], { input: stdinText, encoding: "utf8" });
}

function guardInput(filePath) {
    return JSON.stringify({ tool_input: { file_path: filePath } });
}

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

// ── vc-secrets-shim.mjs ─────────────────────────────────────────────────────────────────────────────

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
// launcher behaviour is already covered by the vc-secrets.mjs tests above; the shim's own job is
// picking the RIGHT install and handing it argv, which is what these tests exercise.
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

// ── regressions: fixes shipped without a pinning test ─────────────────────────────────────────────

test("loadConfig: an aliased .claude (symlink) is loaded once, not read as two owners", { skip: !CAN_SYMLINK && "needs an environment that permits creating a symlink" }, () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-alias-home-"));
    tmpDirs.push(homeDir);
    fs.mkdirSync(path.join(homeDir, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(homeDir, ".claude", m.CONFIG_NAME),
        JSON.stringify({ secrets: { tok: { backend: "local" } }, servers: {}, tasks: {} }));

    // A second home whose .claude is a SYMLINK to the first — the alias a bind-mounted or
    // symlinked $HOME produces in the wild.
    const aliasDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-alias-link-"));
    tmpDirs.push(aliasDir);
    fs.symlinkSync(path.join(homeDir, ".claude"), path.join(aliasDir, ".claude"), LINK_TYPE);

    const paths = {
        user: path.join(homeDir, ".claude", m.CONFIG_NAME),
        project: path.join(aliasDir, ".claude", m.CONFIG_NAME),
        local: null,
    };

    // Pre-fix: same-file detection compared raw strings, so the aliased "project" path looked like a
    // genuinely different file. It re-parsed the one declaration under "project" scope and then
    // its entries were attributed to two homes at once — the secret keyed to the wrong namespace, and
    // every name in the file colliding with itself.
    const cfg = m.loadConfig(paths);
    assert.equal(Object.keys(cfg.secrets).length, 1);   // one name either way; the two lines below are the pin
    assert.equal(cfg.secrets.tok.scope, "user");
    assert.deepEqual(cfg.collisions, []);
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

test("a launchable name with a path separator, a space, or a control character is refused at parse", () => {
    for (const bad of ["../evil", "with/slash", "with\\backslash", "has space", "ctrl\nchar"]) {
        assert.throws(
            () => m.loadConfig(projectPaths({ secrets: {}, servers: { [bad]: { command: "x", args: [], env: {} } } })),
            /name must match/,
            `expected server name "${bad}" to be refused`);
    }
});

test("cmdDoctor: with the backend's tool missing, the write probe does not run at all", () => {
    // It ran regardless, and the run cost two lines: a second FAIL for the one cause already named
    // above it, and a warning about failing to clean up an entry that was never written. Measured on
    // a machine without `security`: FAIL required tool, then FAIL ... rejected a write at the size
    // limit, then the cleanup warning -- one missing tool told three different ways.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-doctor-notool-"));
    tmpDirs.push(root);
    const claudeDir = path.join(root, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, m.CONFIG_NAME), JSON.stringify({
        projectId: "demo",
        secrets: { plain: { backend: "local" } },
        servers: { s: { command: "true", args: [], env: { OTHER: "secret:plain" } } },
    }));
    const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-doctor-notool-home-"));
    tmpDirs.push(isolatedHome);
    // An empty PATH is what makes the case reproducible anywhere: `security` exists on macOS and
    // nowhere else, so leaving the real PATH would make this test assert one thing on the maintainer's
    // machine and another on the one the store actually ships to.
    const emptyBin = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-nobin-"));
    tmpDirs.push(emptyBin);

    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "doctor"], { cwd: root, encoding: "utf8",
        env: seedTrust(launcherEnv({ HOME: isolatedHome, PATH: emptyBin, VC_SECRETS_LOCAL_BACKEND: "keychain" }), root) });

    assert.match(r.stderr, /FAIL required tool "security"/, `the one real cause must be named: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /a write at the size limit/, `the probe must not have run: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /refused a write/, `the probe must not have run: ${r.stderr}`);
    assert.doesNotMatch(r.stderr, /could not remove the write probe/, `nothing was written to clean up: ${r.stderr}`);
});

test("cmdDoctor: a task's name does not mark a same-named server as enabled", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-doctor-taskname-"));
    tmpDirs.push(root);
    const claudeDir = path.join(root, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(path.join(claudeDir, m.CONFIG_NAME), JSON.stringify({
        projectId: "demo",
        secrets: { "kv-secret": { backend: "keyvault", vault: "demo-vault", secret: "s" } },
        servers: { shared: { command: "true", args: [], env: { KV: "secret:kv-secret" } } },
        tasks: { shared: { command: "true", args: [], env: {} } },
    }));
    const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-doctor-home-"));
    tmpDirs.push(isolatedHome);

    // gpg because it is the one backend `doctor` does not write-probe: the others put and remove an
    // entry in the real Credential Manager or login keychain, and this test is about SKIP lines.
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "doctor"],
        { cwd: root, env: seedTrust(launcherEnv({ HOME: isolatedHome, VC_SECRETS_LOCAL_BACKEND: "gpg" }), root), encoding: "utf8" });

    // Pre-fix concern named in the code's own comment: servers and tasks must be iterated SEPARATELY so
    // a task cannot mark a same-named server enabled merely by existing — that would drop the SKIP and
    // make an opt-in Key Vault secret get checked (and FAIL) for a teammate who never opted in.
    assert.match(r.stderr, /SKIP secret "kv-secret" \(keyvault\)/,
        `expected kv-secret to stay SKIPped; got:\n${r.stderr}`);
    assert.ok(!r.stderr.includes('OK secret "kv-secret"'),
        "the same-named task must not make the opt-in server look enabled/consumed");
    assert.ok(!/FAIL secret "kv-secret"/.test(r.stderr));
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

test("an env value that is neither prefix is refused, so a pasted credential cannot look like a constant", () => {
    // What this replaces: "anything that is not a secret: reference is a literal" made `secrets:ado-pat`
    // and a real token equally valid, and each was reported as a harmless constant.
    for (const value of ["ghp_realtokenshapedthing", "secrets:ado-pat", "Secret:ado-pat", ""]) {
        assert.throws(() => m.loadConfig(projectPaths({
            secrets: { "ado-pat": { backend: "local" } },
            servers: { s: { command: "x", args: [], env: { TOKEN: value } } } })),
        /must be "secret:<name>", "oauth:<name>" or "literal:<value>"/, JSON.stringify(value));
    }
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

// ── regressions: keystore writes, declaration validation and install-shim ─────────────────────────

test("keychain write: migrate gets a non-interactive shape, set keeps the prompt", () => {
    // With no value the prompt is right: `set` has a human at the TTY and the plaintext never passes
    // through this process. With a value it must NOT prompt — migrate holds a value the user cannot
    // retype, and the interactive shape asked for one anyway and stored whatever was typed as a
    // successful migration.
    const key = `${m.KEY_PREFIX}:demo:tok`;
    const prompting = m.buildLocalWrite("keychain", key, { USER: "u" });
    assert.equal(prompting.interactive, true);
    assert.ok(!prompting.args.includes("secret-value"));

    const copying = m.buildLocalWrite("keychain", key, { USER: "u" }, { value: "secret-value" });
    assert.ok(!copying.interactive, "a copy must not wait for a human");
    // And the value must not be in argv, where this machine's process list can read it while the write
    // runs. It rides the command that `security -i` reads from stdin instead.
    assert.deepEqual(copying.args, ["-i"]);
    assert.ok(!JSON.stringify(copying.args).includes("secret-value"));
    assert.equal(copying.stdinData, m.COMMAND_ON_STDIN);
    assert.match(copying.stdinCommand("secret-value"), /^add-generic-password -U -a "u" -s "vc-secrets:demo:tok" -w "secret-value"\n$/);
    assert.ok(!copying.argvExposesValue);
});

test("a value with a line ending falls back to argv, and says so instead of hiding it", () => {
    // `security -i` reads one command per line, so a newline in the value ends the command whatever the
    // quoting does. Refusing would strand a secret migrate exists to move, so the exposure is reported.
    const key = `${m.KEY_PREFIX}:demo:tok`;
    const spec = m.buildLocalWrite("keychain", key, { USER: "u" }, { value: "line1\nline2" });
    assert.equal(spec.argvExposesValue, true);
    assert.equal(spec.args.at(-1), "line1\nline2");
    assert.equal(spec.stdinData, undefined);
});

test("quoting for security -i escapes what would end or reshape the command", () => {
    const q = m.quoteForSecurityInteractive;
    assert.equal(q("plain"), '"plain"');
    assert.equal(q('a"b'), '"a\\"b"');
    assert.equal(q("a\\b"), '"a\\\\b"');
    // A quote followed by a second command is the shape that would matter if it were not escaped.
    assert.equal(q('x" \ndelete-generic-password -s y'), '"x\\" \ndelete-generic-password -s y"');
});

test("a gpg read preserves a trailing newline the stored value really contains", { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" }, async () => {
    // gpg --decrypt emits the stored bytes. Stripping there rewrote the value during migrate, which
    // reads and then writes: "token\n" would be migrated as "token".
    const binDir = stubBinary("gpg", '#!/bin/sh\nprintf "token\\n"\n');
    const saved = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${saved}`;
    try {
        const spec = m.buildLocalRead("gpg", `${m.KEY_PREFIX}:demo:tok`, { XDG_CONFIG_HOME: "/tmp" });
        assert.equal(spec.keepTrailingNewline, true);
        assert.equal(await m.runTool(spec), "token\n");
    } finally {
        process.env.PATH = saved;
    }
});

test("a double quote in command/args is refused — it would break argv quoting on Windows", () => {
    const q = 'x" & whoami & rem "';
    assert.throws(() => m.loadConfig(projectPaths({
        secrets: {}, servers: { s: { command: "x", args: [q], env: {} } } })), /double quote/);
    assert.throws(() => m.loadConfig(projectPaths({
        secrets: {}, servers: { s: { command: q, args: [], env: {} } } })), /double quote/);
});

const keyvaultDecl = (overrides) => ({ backend: "keyvault", vault: "demo-vault", secret: "demo-secret", ...overrides });
// loadConfig prefixes the (random) tmp path of the file, which can contain any short value by chance, so
// "the message does not echo it" is checked against the text after that prefix only.
const echoes = (e, value) => typeof value === "string" && e.message.slice(e.message.indexOf("vc-secrets.json: ")).includes(value);
const loadKeyvault = (overrides) => m.loadConfig(projectPaths({ projectId: "proj-x", secrets: { kv: keyvaultDecl(overrides) }, servers: {} }));

test("keyvault vault/secret: names Azure accepts load", () => {
    for (const vault of ["abc", "demo-vault", "A1b", "a".repeat(24), "a-b-c"]) {
        assert.equal(loadKeyvault({ vault }).secrets.kv.vault, vault, vault);
    }
    for (const secret of ["s", "Demo-Secret-01", "0", "9secret", "a".repeat(127)]) {
        assert.equal(loadKeyvault({ secret }).secrets.kv.secret, secret, secret);
    }
});

test("keyvault vault: a character or shape outside Azure's vault-name rule is refused, without echoing the value", () => {
    // Each of these would reach `az` as an argument: `/` redirects az's request host, `%` is expanded by
    // cmd.exe inside the quotes of a .cmd shim, `"` closes those quotes, and the rest are not Azure names.
    const bad = {
        percent: "a%PATH%b", slash: "evil.example/x", question: "abc?x", dot: "abc.def", colon: "abc:80", quote: 'abc"def',
        space: "abc def", leadingDigit: "1demo", leadingHyphen: "-demo", trailingHyphen: "demo-", doubleHyphen: "de--mo",
        tooShort: "ab", tooLong: "a".repeat(25), notAString: 12345,
    };
    for (const [label, vault] of Object.entries(bad)) {
        assert.throws(() => loadKeyvault({ vault }), (e) => e instanceof m.VcSecretsError
            && /is not a valid Azure Key Vault vault name/.test(e.message)
            && !echoes(e, vault), label);
    }
});

test("keyvault secret: a character outside Azure's secret-name rule is refused, without echoing the value", () => {
    const bad = {
        percent: "a%PATH%b", slash: "a/b", question: "a?b", dot: "a.b", colon: "a:b", quote: 'a"b', space: "a b",
        underscore: "a_b", tooLong: "a".repeat(128), notAString: 12345,
    };
    for (const [label, secret] of Object.entries(bad)) {
        assert.throws(() => loadKeyvault({ secret }), (e) => e instanceof m.VcSecretsError
            && /is not a valid Azure Key Vault secret name/.test(e.message)
            && !echoes(e, secret), label);
    }
});

test("a control character in command or in an env key is refused, and the refusal does not echo it", () => {
    // Nothing legitimate needs a control character in a command or an env key, and the trust review, the
    // refusal lines and doctor all print them, so a byte that a terminal acts on (ESC starts a sequence,
    // CR rewrites the line, C1 U+009B is an 8-bit CSI) must not survive loading. `args` is not in the set:
    // it is printed as escaped JSON (jsonForTerminal), which already neutralises it.
    for (const character of ["\u001b", "\r", "\n", "\u007f", "\u009b"]) {
        const label = JSON.stringify(character);
        for (const [where, launchable] of [
            ["command", { command: `x${character}y`, args: [], env: {} }],
            ["an env key", { command: "x", args: [], env: { [`K${character}`]: "literal:v" } }],
        ]) {
            for (const kind of ["servers", "tasks"]) {
                assert.throws(() => m.loadConfig(projectPaths({ secrets: {}, [kind]: { s: launchable } })), (e) => {
                    assert.match(e.message, /control character/, `${kind} ${where} ${label}`);
                    assert.ok(!e.message.includes(character), `${kind} ${where} ${label}: the refusal must not carry the byte it refuses`);

                    return true;
                }, `${kind} ${where} ${label}`);
            }
        }
    }
    // Still accepted: an env VALUE may hold a newline (a PEM block), and so may an args element -- a
    // multi-line `sh -c` script is an ordinary task.
    assert.doesNotThrow(() => m.loadConfig(projectPaths({ secrets: {}, servers: { s: {
        command: "x", args: [], env: { K: "literal:line one\nline two" } } } })));
    const loaded = m.loadConfig(projectPaths({ secrets: {}, tasks: { t: {
        command: "sh", args: ["-c", "echo one\necho two\n"], env: {} } } }));
    assert.equal(loaded.tasks.t.args[1], "echo one\necho two\n");
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

// ── skills/ ─────────────────────────────────────────────────────────────────────────────────────

const SKILLS_DIR = fileURLToPath(new URL("./skills", import.meta.url));
const VERBS = ["doctor", "install", "migrate"];

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

// ── manifests and hook files ────────────────────────────────────────────────────────────────────

const CURSOR_HOOKS = fileURLToPath(new URL("./hooks/hooks-cursor.json", import.meta.url));
const CLAUDE_HOOKS = fileURLToPath(new URL("./hooks/hooks.json", import.meta.url));
const CLAUDE_MANIFEST = fileURLToPath(new URL("./.claude-plugin/plugin.json", import.meta.url));
const CURSOR_MANIFEST = fileURLToPath(new URL("./.cursor-plugin/plugin.json", import.meta.url));
const CODEX_MANIFEST = fileURLToPath(new URL("./.codex-plugin/plugin.json", import.meta.url));
// The fourth copy of the description, and the only one outside this package.
const MARKETPLACE = fileURLToPath(new URL("../../.claude-plugin/marketplace.json", import.meta.url));

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

test("emitConfig: the JSON client's body is pasteable AS IS — no comment stripping", () => {
    // .mcp.json and ~/.claude.json are strict JSON. If the body needs a filter before it parses, then
    // pasting the thing this verb printed corrupts the file it was printed for.
    const cfg = { secrets: {}, servers: { github: { env: { GITHUB_TOKEN: "secret:gh" } } } };
    const { body } = m.emitConfig(cfg, "claude-code");
    const parsed = JSON.parse(body);
    assert.equal(parsed.mcpServers.github.command, "node");
    assert.equal(parsed.mcpServers.github.args[0], "${VC_SECRETS}");
    assert.deepEqual(parsed.mcpServers.github.args.slice(1), ["run", "github"]);
});

test("emitConfig: no secret name and no secret value can reach either channel", () => {
    const cfg = { secrets: { gh: { backend: "local" } }, servers: { github: { env: { GITHUB_TOKEN: "secret:gh" } } } };
    const { body, notes } = m.emitConfig(cfg, "claude-code");
    const all = body + notes.join("\n");
    assert.ok(!all.includes("GITHUB_TOKEN"), "no env var name");
    assert.ok(!all.includes("secret:gh"), "no reference");
});

test("emitConfig: the TOML client gets a table per server", () => {
    const { body } = m.emitConfig({ secrets: {}, servers: { github: {} } }, "codex");
    assert.match(body, /^\[mcp_servers\.github\]$/m);
    assert.match(body, /^command = "node"$/m);
    // JSON.stringify emits no space after the comma.
    assert.match(body, /^args = \["[^"]+","run","github"\]$/m);
});

test("emitConfig: a dotted server name is quoted in the TOML table header", () => {
    // LAUNCHABLE_NAME_RE allows dots on purpose. Unquoted, `azure.mcp` becomes the nested table
    // mcp_servers -> azure -> mcp and the client never sees the server, with no error anywhere.
    const { body } = m.emitConfig({ secrets: {}, servers: { "azure.mcp": {} } }, "codex");
    assert.match(body, /^\[mcp_servers\."azure\.mcp"\]$/m);
});

test("emitConfig: a client whose floor is unknown says so rather than saying nothing", () => {
    const { notes } = m.emitConfig({ secrets: {}, servers: { github: {} } }, "cursor");
    assert.ok(notes.some((n) => n.includes("version floor not established")));
});

test("emitConfig: no entry claims to depend on one client being installed, because the shim no longer does", () => {
    // The fork's honest fallback carried a note saying the emitted path "requires Claude Code on this
    // machine". Generalising the shim's resolution made that false, and a false caveat is worse than
    // no caveat: it tells the developer this widening exists for that the entry cannot work for them,
    // and they would believe it — the sentence reads like a limitation somebody measured.
    for (const name of clients.clientNames()) {
        const { notes } = m.emitConfig({ secrets: {}, servers: { github: {} } }, name);
        assert.ok(!notes.some((n) => /requires Claude Code/.test(n)), `${name}: no false dependency claim`);
    }
});

test("emitConfig: the verify line names a real path, never a client-config placeholder", () => {
    // launcherRef is a token the CLIENT expands inside its own config file. Spliced into a shell line
    // it is not a path: measured, `bash -c 'echo node "${env:VC_SECRETS}" doctor'` prints `node  doctor`
    // — bash reads it as substring expansion of an unset $env and yields the empty string. So the
    // instruction becomes `node "" doctor`, silently, on the client whose floor is also unknown.
    for (const name of clients.clientNames()) {
        const verify = m.emitConfig({ secrets: {}, servers: { github: {} } }, name)
            .notes.find((n) => n.startsWith("then verify with:"));
        assert.ok(verify, `${name}: a verify line exists`);
        assert.doesNotMatch(verify, /\$\{/, `${name}: no unexpanded placeholder in a shell instruction`);
        assert.match(verify, /vc-secrets-shim\.mjs|vc-secrets\.mjs/, `${name}: it names the launcher`);
    }
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

// ── the guard over this package's OWN modules ───────────────────────────────────────────────────

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

// Neither guarded nor unguarded-by-decision: they are the subject's own instrument, and the helper
// module they share. Listed so the classification below accounts for every tracked file rather than
// filtering some out of view.
const TEST_FILES = ["vc-secrets.test.mjs", "vc-secrets-oauth.test.mjs", "test-support.mjs"];

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
    // The hook's own working directory is NOT a root. The plugin's hook command resolves relative to the
    // plugin directory, so a hook can be running from a package-shaped path while the workspace is any
    // other repository; treating that directory as a root refused ordinary files there.
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
    // dot-directories included. The two test files are a list of their own rather than an exclusion,
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
    // checked.
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
    const modules = walk(root).filter((f) => f.endsWith(".mjs") && !f.endsWith(".test.mjs") && f !== "test-support.mjs");
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

// ── repository trust ────────────────────────────────────────────────────────────────────────────────
//
// A launchable whose winning entry a repository declared is refused until the person has read it and run
// `trust`. The gate is one predicate (trustProblem) behind three callers, so the predicate is tested as
// a table and each caller is tested for what it does with the answer.

const TRUST_BASE = { command: "npx", args: ["-y", "gh-mcp"], env: { T: "secret:pat", L: "literal:kept" } };

// A repository whose project file declares `servers`/`tasks` (and, optionally, a user file that does).
function trustCfg({ servers = { gh: TRUST_BASE }, tasks = {}, user } = {}) {
    return m.loadConfig(scopedPaths({ user, project: { projectId: "proj-x", servers, tasks } }));
}

// The same config with one launchable's declaration overridden, keeping everything else -- so the trust
// record made from the ORIGINAL is compared against a changed declaration under the same root.
function withDeclaration(cfg, kind, name, override) {
    return { ...cfg, [kind]: { ...cfg[kind], [name]: { ...cfg[kind][name], ...override } } };
}

// Fresh environment for the verbs that write the trust file: an XDG_CONFIG_HOME of its own, so the
// developer's real file is never the one read or written.
function trustEnv() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-trust-home-"));
    tmpDirs.push(home);

    return { HOME: home, XDG_CONFIG_HOME: home };
}

const NO_TRUST = { schemaVersion: 1, repositories: {} };

// The launch gate reads the trust file through process.env, which has no seam of its own on the
// cmdRun/cmdTask path. Restored on the way out, as the PATH-moving helpers above do.
async function withProcessEnv(env, fn) {
    const saved = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
    Object.assign(process.env, env);
    try {
        return await fn();
    } finally {
        for (const [key, value] of Object.entries(saved)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
    }
}

test("trustProblem: a user-scope launchable that reads nothing a repository declares needs no trust, whatever the state holds", () => {
    const cfg = m.loadConfig(scopedPaths({ user: {
        servers: { gh: TRUST_BASE }, tasks: { job: { command: "true", args: [], env: {} } } } }));
    assert.equal(m.trustProblem(cfg, "servers", "gh", NO_TRUST), null);
    assert.equal(m.trustProblem(cfg, "tasks", "job", NO_TRUST), null);
});

test("trustProblem: a repository launchable with no record for its repository is untrusted, at either home", () => {
    const project = trustCfg();
    assert.deepEqual(m.trustProblem(project, "servers", "gh", NO_TRUST),
        { reason: "untrusted", home: "project", shadowsUser: false });

    const local = m.loadConfig(scopedPaths({ project: { projectId: "proj-x" }, local: { servers: { gh: TRUST_BASE } } }));
    assert.deepEqual(m.trustProblem(local, "servers", "gh", NO_TRUST),
        { reason: "untrusted", home: "local", shadowsUser: false },
        "local is gated like project: the launcher cannot tell a tracked file from an untracked one without running git in the repository");
});

test("trustProblem: a record for the repository that lacks the name is untrusted, for servers and tasks alike", () => {
    const cfg = trustCfg({ servers: { gh: TRUST_BASE, other: TRUST_BASE }, tasks: { job: TRUST_BASE } });
    const state = trustedStateFor(cfg);
    const record = state.repositories[cfg.projectRoot];
    delete record.servers.other;
    delete record.tasks.job;
    assert.equal(m.trustProblem(cfg, "servers", "gh", state), null);
    assert.equal(m.trustProblem(cfg, "servers", "other", state).reason, "untrusted");
    assert.equal(m.trustProblem(cfg, "tasks", "job", state).reason, "untrusted");
});

test("trustProblem: a record for a different repository trusts nothing here", () => {
    const cfg = trustCfg();
    const state = { schemaVersion: 1, repositories: { "/somewhere/else": trustedStateFor(cfg).repositories[cfg.projectRoot] } };
    assert.equal(m.trustProblem(cfg, "servers", "gh", state).reason, "untrusted");
});

test("trustProblem: the shape as declared is trusted, and each single change is reported as only that difference", () => {
    const cfg = trustCfg({ tasks: { gh: TRUST_BASE } });
    const state = trustedStateFor(cfg);
    for (const kind of ["servers", "tasks"]) {
        assert.equal(m.trustProblem(cfg, kind, "gh", state), null, `${kind}: unchanged`);
    }
    const { L, ...withoutL } = TRUST_BASE.env;
    const cases = [
        [{ command: "sh" }, [`command is ${JSON.stringify("sh")}, trusted ${JSON.stringify(TRUST_BASE.command)}`]],
        [{ args: [...TRUST_BASE.args, "--extra"] }, ["args changed"]],
        [{ env: { ...TRUST_BASE.env, T: "secret:other" } }, ["env T changed"]],
        [{ env: { ...TRUST_BASE.env, ADDED: "literal:x" } }, ["env ADDED added"]],
        [{ env: withoutL }, ["env L removed"]],
    ];
    for (const [override, differences] of cases) {
        const problem = m.trustProblem(withDeclaration(cfg, "servers", "gh", override), "servers", "gh", state);
        assert.deepEqual(problem, { reason: "changed", differences, home: "project", shadowsUser: false }, JSON.stringify(override));
    }
});

test("trustProblem: a launchable that shadows a user-scope entry says so, however the chain of homes runs", () => {
    const user = { servers: { gh: { command: "user-gh", args: [], env: {} } } };
    const shadowing = trustCfg({ user });
    assert.equal(m.trustProblem(shadowing, "servers", "gh", NO_TRUST).shadowsUser, true);
    assert.equal(m.trustProblem(trustCfg(), "servers", "gh", NO_TRUST).shadowsUser, false);

    const chain = m.loadConfig(scopedPaths({ user,
        project: { projectId: "proj-x", servers: { gh: TRUST_BASE } },
        local: { servers: { gh: { ...TRUST_BASE, command: "local-gh" } } } }));
    const problem = m.trustProblem(chain, "servers", "gh", NO_TRUST);
    assert.equal(problem.home, "local");
    assert.equal(problem.shadowsUser, true, "user -> project -> local still replaced the user's entry");

    const sameKindOnly = trustCfg({ user: { tasks: { gh: { command: "user-gh", args: [], env: {} } } } });
    assert.equal(m.trustProblem(sameKindOnly, "servers", "gh", NO_TRUST).shadowsUser, false,
        "a user TASK of that name is not a server that was shadowed");
});

test("trustProblem: a launchable named like an Object.prototype member is looked up as a name, not as a property", () => {
    const cfg = trustCfg({ servers: { gh: TRUST_BASE, toString: TRUST_BASE } });
    const state = trustedStateFor(cfg);
    delete state.repositories[cfg.projectRoot].servers.toString;
    assert.equal(m.trustProblem(cfg, "servers", "toString", state).reason, "untrusted",
        "an inherited toString is not a recorded entry");
    assert.equal(m.trustProblem(cfg, "servers", "toString", NO_TRUST).reason, "untrusted");
    assert.equal(m.trustProblem(cfg, "servers", "gh", state), null);
});

test("trustProblem: the VC_SECRETS_CONFIG_DIR override is a project root and is gated like one", () => {
    const dir = tmpConfigDir({ servers: { gh: TRUST_BASE } });
    const env = { ...trustEnv(), VC_SECRETS_CONFIG_DIR: dir };
    const paths = m.configPaths(env, dir);
    assert.equal(paths.root, dir);
    const cfg = m.loadConfig(paths);
    assert.equal(cfg.projectRoot, m.trustRootKey(dir));
    assert.equal(m.trustProblem(cfg, "servers", "gh", NO_TRUST).reason, "untrusted");
    assert.equal(m.trustProblem(cfg, "servers", "gh", trustedStateFor(cfg)), null);
});

test("configPaths: the root is the parent of the .claude directory the walk stopped at, and null with no project", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-root-"));
    tmpDirs.push(repo);
    fs.mkdirSync(path.join(repo, ".claude"));
    fs.writeFileSync(path.join(repo, ".claude", m.CONFIG_NAME), JSON.stringify({ servers: {} }));
    const nested = path.join(repo, "src", "deep");
    fs.mkdirSync(nested, { recursive: true });
    assert.equal(m.configPaths({ HOME: "/nonexistent-home" }, nested).root, repo);

    const bare = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-noroot-"));
    tmpDirs.push(bare);
    // The real home, not a fake one: this is the one assertion whose walk finds no project and so climbs
    // out of the fixture. On Windows os.tmpdir() sits inside the profile, so the climb reaches the
    // developer's own ~/.claude/vc-secrets.json, and only a HOME that names it makes the walk recognise it
    // as the user scope rather than take it for a repository's. The rest of these tests stop at a project
    // they built before any climb reaches the profile.
    assert.equal(m.configPaths({ HOME: os.homedir() }, bare).root, null);
});

test("loadConfig: hand-built paths land on the same root configPaths would have computed for those files", () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-fallback-"));
    tmpDirs.push(repo);
    fs.mkdirSync(path.join(repo, ".claude"));
    const file = path.join(repo, ".claude", m.CONFIG_NAME);
    fs.writeFileSync(file, JSON.stringify({ servers: {} }));
    const discovered = m.loadConfig(m.configPaths({ HOME: "/nonexistent-home" }, repo));
    const handBuilt = m.loadConfig({ user: null, project: file, local: null });
    assert.equal(handBuilt.projectRoot, discovered.projectRoot);

    assert.equal(m.loadConfig({ user: file, project: null, local: null }).projectRoot, null,
        "a config with only a user file has no repository");
});

test("loadConfig: a checkout reached through a symlink has the same projectRoot as its target",
    { skip: !CAN_SYMLINK && "this machine cannot create a symlink" },
    () => {
        const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-root-real-"));
        tmpDirs.push(repo);
        fs.mkdirSync(path.join(repo, ".claude"));
        fs.writeFileSync(path.join(repo, ".claude", m.CONFIG_NAME), JSON.stringify({ servers: {} }));
        const link = path.join(probeDir, `checkout-alias-${path.basename(repo)}`);
        fs.symlinkSync(repo, link, LINK_TYPE);
        const load = (dir) => m.loadConfig({ user: null, project: path.join(dir, ".claude", m.CONFIG_NAME), local: null });
        assert.equal(load(link).projectRoot, load(repo).projectRoot, "one repository, one trust record");
        assert.equal(load(link).projectRoot, m.trustRootKey(repo));
    });

test("trustRootKey: lower-cased on win32 only, and the injected realpath decides what exists", () => {
    const passThrough = (p) => p;
    const win = (p) => m.trustRootKey(p, { platform: "win32", realpath: passThrough });
    assert.equal(win("C:\\Work\\Repo"), win("c:\\work\\repo"), "one directory, two spellings, one record");
    const posix = (p) => m.trustRootKey(p, { platform: "linux", realpath: passThrough });
    assert.notEqual(posix("/Work/Repo"), posix("/work/repo"), "a case-sensitive file system keeps the two apart");

    const absent = () => { throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); };
    assert.equal(m.trustRootKey("C:\\Gone\\Repo", { platform: "win32", realpath: absent }), win("c:\\gone\\repo"),
        "when no ancestor resolves either, the plain resolve is the key");
});

test("trustRootKey: a deleted checkout keys as it did while it existed, through the nearest ancestor that still resolves", () => {
    // A record is made through /link/repo and keyed by the target, /real/repo. Once the leaf is gone realpath
    // throws for it, and resolving the plain string would key /link/repo -- a record `untrust` cannot find.
    const existing = new Set(["/link", "/link/repo", "/link/repo/sub"]);
    const realpath = (p) => {
        if (!existing.has(p)) {
            throw Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
        }

        return p.replace(/^\/link/, "/real");
    };
    const key = (p, platform = "linux") => m.trustRootKey(p, { platform, realpath });
    const live = key("/link/repo");
    assert.equal(live, "/real/repo");
    existing.delete("/link/repo/sub");
    existing.delete("/link/repo");
    assert.equal(key("/link/repo"), live, "the deleted leaf keys where the live one did");
    assert.equal(key("/link/repo/sub/deeper"), "/real/repo/sub/deeper", "more than one missing level joins the whole tail");
    assert.equal(key("/link/other/place"), "/real/other/place", "a sibling that never existed is keyed under the same resolved parent");
    assert.equal(key("/nowhere/repo"), "/nowhere/repo", "and where no ancestor resolves the plain resolve stands");

    // The lower-casing of win32 applies to the joined result, and the win32 path rules to the walk.
    const winExisting = new Set(["C:\\Link"]);
    const winRealpath = (p) => {
        if (!winExisting.has(p)) {
            throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        }

        return "D:\\Real";
    };
    assert.equal(m.trustRootKey("C:\\Link\\Gone\\Repo", { platform: "win32", realpath: winRealpath }), "d:\\real\\gone\\repo");
});

test("trustRootKey: the key is what the injected realpath resolves, not what this machine's file system says", () => {
    assert.equal(m.trustRootKey("/checkout/alias", { platform: "linux", realpath: () => "/checkout/real" }), "/checkout/real");
    assert.equal(m.trustRootKey("C:\\Alias", { platform: "win32", realpath: () => "C:\\Real" }), "c:\\real");
});

test("trustRootKey: a symlinked checkout and its target are one repository", { skip: !CAN_SYMLINK && "this machine cannot create a symlink" }, () => {
    const target = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-real-"));
    tmpDirs.push(target);
    const link = path.join(probeDir, `alias-${path.basename(target)}`);
    fs.symlinkSync(target, link, LINK_TYPE);
    assert.equal(m.trustRootKey(link), m.trustRootKey(target));
});

test("launchShape: an entry holding only the schema keys is reproduced key for key", () => {
    const entry = Object.fromEntries(m.SERVER_DECL_KEYS.map((key) => [key, TRUST_BASE[key]]));
    assert.deepEqual(m.launchShape(entry), entry);
    assert.deepEqual(Object.keys(m.launchShape(entry)), [...m.SERVER_DECL_KEYS]);
});

test("launchShape: what the loader adds to an entry (scope, home) is not part of the shape", () => {
    const loaded = trustCfg().servers.gh;
    assert.ok("home" in loaded && "scope" in loaded, "the fixture must carry the loader's own fields");
    assert.deepEqual(Object.keys(m.launchShape(loaded)), [...m.SERVER_DECL_KEYS]);
});

test("launchShape: equal declarations give equal shapes, and a change to any single schema key gives a different one", () => {
    const changes = {
        command: { command: "sh" },
        args: { args: [...TRUST_BASE.args, "--extra"] },
        env: { env: { ...TRUST_BASE.env, ADDED: "literal:x" } },
    };
    assert.deepEqual(Object.keys(changes).sort(), [...m.SERVER_DECL_KEYS].sort(),
        "a key added to the schema must be given a case here, or it is trusted without being compared");
    const base = m.launchShape(TRUST_BASE);
    assert.deepEqual(m.launchShape({ ...TRUST_BASE }), base);
    for (const key of m.SERVER_DECL_KEYS) {
        const changed = m.launchShape({ ...TRUST_BASE, ...changes[key] });
        assert.notDeepEqual(changed, base, `${key}: a changed shape`);
        assert.ok(m.trustDifferences(base, changed).length > 0, `${key}: reported as a difference`);
    }
    assert.deepEqual(m.trustDifferences(base, m.launchShape({ ...TRUST_BASE })), []);
});

test("launchShape: a copy, so editing the declaration afterwards cannot edit what was recorded", () => {
    const entry = { command: "npx", args: ["a"], env: { K: "literal:v" } };
    const shape = m.launchShape(entry);
    entry.args.push("b");
    entry.env.K = "literal:w";
    assert.deepEqual(shape, { command: "npx", args: ["a"], env: { K: "literal:v" } });
});

test("trustDifferences: never prints a literal value, a changed one or an added one", () => {
    const before = { command: "npx", args: [], env: { L: "literal:old-marker-value", R: "secret:pat" } };
    const after = { command: "npx", args: [], env: { L: "literal:new-marker-value", R: "secret:pat", ADDED: "literal:added-marker-value" } };
    const diffs = m.trustDifferences(before, after);
    assert.deepEqual(diffs, ["env ADDED added", "env L changed"]);
    assert.doesNotMatch(diffs.join("\n"), /marker-value/);
});

test("trustDifferences: env keys are compared by own property, so an inherited name is not a key", () => {
    const diffs = m.trustDifferences({ command: "x", args: [], env: {} }, { command: "x", args: [], env: { toString: "literal:y" } });
    assert.deepEqual(diffs, ["env toString added"]);
});

test("trustRefusal: an untrusted launchable names its declaring file, what it shadows, and where to trust it", () => {
    const cfg = trustCfg({ user: { servers: { gh: { command: "user-gh", args: [], env: {} } } }, tasks: { job: TRUST_BASE } });
    const server = m.trustProblem(cfg, "servers", "gh", NO_TRUST);
    assert.equal(m.trustRefusal("servers", "gh", server, cfg),
        `server "gh" is declared by ${cfg.files.project} (it shadows your user-scope "gh") and is not trusted -- `
        + `review it, then run "vc-secrets trust" in ${cfg.projectRoot}`);
    const task = m.trustProblem(cfg, "tasks", "job", NO_TRUST);
    assert.equal(m.trustRefusal("tasks", "job", task, cfg),
        `task "job" is declared by ${cfg.files.project} and is not trusted -- review it, then run "vc-secrets trust" in ${cfg.projectRoot}`);
});

test("trustRefusal: a changed launchable lists every difference and asks for the trust again", () => {
    const cfg = trustCfg();
    const state = trustedStateFor(cfg);
    const changed = withDeclaration(cfg, "servers", "gh", { command: "sh", args: ["-c", "x"] });
    const problem = m.trustProblem(changed, "servers", "gh", state);
    const text = m.trustRefusal("servers", "gh", problem, changed);
    assert.equal(text, `server "gh" changed since you trusted it: ${problem.differences.join("; ")} -- `
        + `review it, then run "vc-secrets trust" again in ${cfg.projectRoot}`);
    assert.equal(problem.differences.length, 2, "both differences, not the first");
    assert.ok(!text.includes("\n"), "one physical line, for the probe's last-line classification");
});

test("readTrustState: a missing file is an empty state, not an error", () => {
    assert.deepEqual(m.readTrustState(trustEnv()), NO_TRUST);
});

test("readTrustState: a file that is not a trust state throws, naming the file, instead of reading as trusted or empty", () => {
    const env = trustEnv();
    const file = m.trustFilePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const valid = { trustedAt: "2000-01-01T00:00:00.000Z", servers: {}, tasks: {} };
    const documents = {
        "not JSON": "{ nope",
        "not an object": "[]",
        "a schemaVersion this launcher does not speak": JSON.stringify({ schemaVersion: 2, repositories: {} }),
        "no schemaVersion": JSON.stringify({ repositories: {} }),
        "repositories that is not an object": JSON.stringify({ schemaVersion: 1, repositories: [] }),
        "a record without trustedAt": JSON.stringify({ schemaVersion: 1, repositories: { "/r": { servers: {}, tasks: {} } } }),
        "a record whose servers is not an object": JSON.stringify({ schemaVersion: 1, repositories: { "/r": { ...valid, servers: [] } } }),
        "a record whose task entry is not an object": JSON.stringify({ schemaVersion: 1, repositories: { "/r": { ...valid, tasks: { job: "x" } } } }),
    };
    for (const [what, text] of Object.entries(documents)) {
        fs.writeFileSync(file, text);
        assert.throws(() => m.readTrustState(env), (e) => {
            assert.ok(e instanceof m.VcSecretsError, what);
            assert.ok(e.message.includes(file), `${what}: names the file -- ${e.message}`);

            return true;
        }, what);
    }
    fs.writeFileSync(file, JSON.stringify({ schemaVersion: 1, repositories: { "/r": valid } }));
    assert.deepEqual(m.readTrustState(env).repositories["/r"], valid, "the control: a valid file reads");
});

test("readTrustState: a JSON syntax error reports the position where V8 gives one, and none of the file's content", () => {
    const env = trustEnv();
    const file = m.trustFilePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const reasonFor = (text) => {
        fs.writeFileSync(file, text);
        let message;
        assert.throws(() => m.readTrustState(env), (e) => {
            message = e.message;

            return true;
        });

        return message;
    };

    // The shape that carries a window of the file: V8 quotes the text around a bad token. It reports no
    // position there, so the reason says so instead of passing the window on.
    const leaking = reasonFor('{"schemaVersion": LEAK-MARKER-VALUE}');
    assert.doesNotMatch(leaking, /LEAK-MARKER-VALUE/);
    assert.match(leaking, /could not be read \(not valid JSON, (?:at position \d+ \(line 1 column \d+\)|position not reported)\)/);

    // A shape that reports a position: it is kept, as the triple of digits, and nothing else of the message.
    // Taken from what THIS runtime's own message says, so an older V8 that words it differently is judged
    // by the fallback rather than failing on a shape it never produced.
    const text = '{"schemaVersion": 1,}';
    const native = (() => {
        try {
            JSON.parse(text);
        } catch (e) {
            return e.message;
        }

        return "";
    })();
    const expected = native.includes("at position 20 (line 1 column 21)") ? "at position 20 (line 1 column 21)" : "position not reported";
    assert.ok(reasonFor(text).includes(`(not valid JSON, ${expected})`), reasonFor(text));
});

test("writeTrustState: round-trips, leaves no temporary file, and keeps the file private", () => {
    const env = trustEnv();
    const state = { schemaVersion: 1, repositories: { "/repo": { trustedAt: "2000-01-01T00:00:00.000Z",
        servers: { gh: m.launchShape(TRUST_BASE) }, tasks: {} } } };
    m.writeTrustState(env, state);
    assert.deepEqual(m.readTrustState(env), state);
    const dir = path.dirname(m.trustFilePath(env));
    assert.deepEqual(fs.readdirSync(dir), [path.basename(m.trustFilePath(env))], "the .tmp file was renamed away");
    if (process.platform !== "win32") {
        assert.equal(fs.statSync(m.trustFilePath(env)).mode & 0o777, 0o600);
        assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
    }

    m.writeTrustState(env, NO_TRUST);
    assert.deepEqual(m.readTrustState(env), NO_TRUST, "a second write replaces the first");
});

test("writeTrustState: a failed write is a VcSecretsError naming the file, and leaves no temporary file behind", () => {
    const env = trustEnv();
    // A directory where the file must go: the rename onto it fails after the temporary file was written.
    fs.mkdirSync(m.trustFilePath(env), { recursive: true });
    assert.throws(() => m.writeTrustState(env, NO_TRUST), (e) => e instanceof m.VcSecretsError && e.message.includes(m.trustFilePath(env)));
    assert.deepEqual(fs.readdirSync(path.dirname(m.trustFilePath(env))), [path.basename(m.trustFilePath(env))]);
});

test("trustFilePath: sits beside the keystore's secrets directory, under the config base", () => {
    const env = trustEnv();
    assert.equal(path.dirname(m.trustFilePath(env)), path.dirname(m.secretsDir(env)));
    assert.equal(path.basename(m.trustFilePath(env)), "trust.json");
    assert.ok(m.trustFilePath(env).startsWith(env.XDG_CONFIG_HOME));
    const noXdg = { HOME: env.HOME };
    assert.equal(path.dirname(m.trustFilePath(noXdg)), path.dirname(m.secretsDir(noXdg)));
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

test("trust: the real verb refuses without a terminal and records nothing", () => {
    const dir = tmpConfigDir({ servers: { gh: TRUST_BASE } });
    const env = launcherEnv({ VC_SECRETS_CONFIG_DIR: dir });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "trust"], { env, encoding: "utf8", input: "y\n" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /vc-secrets trust requires an interactive terminal/);
    assert.ok(!fs.existsSync(m.trustFilePath(env)), "an answer piped in must not be taken");
});

test("untrust: the real verb needs no declaration and no terminal, and says when there is nothing to remove", () => {
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-undeclared-"));
    tmpDirs.push(empty);
    const env = launcherEnv();
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "untrust", empty], { env, cwd: empty, encoding: "utf8", input: "" });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, /has no trust record -- nothing to remove/);
});

test("untrust: the real verb removes the record of the path it is given, not the working directory's", () => {
    const [given, working] = ["given", "working"].map((tag) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vc-secrets-untrust-cli-${tag}-`));
        tmpDirs.push(dir);

        return dir;
    });
    const env = launcherEnv();
    const record = { trustedAt: "1999-01-01T00:00:00.000Z", servers: {}, tasks: {} };
    m.writeTrustState(env, { schemaVersion: 1,
        repositories: { [m.trustRootKey(given)]: record, [m.trustRootKey(working)]: record } });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "untrust", given], { env, cwd: working, encoding: "utf8", input: "" });
    assert.equal(r.status, 0, r.stderr);
    assert.deepEqual(Object.keys(m.readTrustState(env).repositories), [m.trustRootKey(working)]);
});

// cmdTrust and cmdUntrust take their terminal, their answer, their clock and their output as seams, so
// the tests never need a pty and never write to the developer's terminal. The platform is pinned to
// linux so the default does not change what a run on Windows exercises; `openTerminal` hands out a fake
// and keeps it, so a test can see what `ask` was given and that it was closed. `beforeAnswer` runs
// while the person is "deciding", for what changes on disk in that time.
function trustSeams(env, { isTTY = true, isErrTTY = true, platform = "linux", openTerminal, answer = "y",
    log = [], beforeAnswer } = {}) {
    const asked = [];
    const askedOn = [];
    const opened = [];
    const fakeTerminal = () => {
        const terminal = { input: {}, output: {}, closed: 0, close() { this.closed += 1; } };
        opened.push(terminal);

        return terminal;
    };

    return { seams: { isTTY, isErrTTY, platform, openTerminal: openTerminal ?? fakeTerminal, env,
        now: () => new Date("2001-02-03T04:05:06.000Z"),
        ask: async (question, terminal) => {
            asked.push(question);
            askedOn.push(terminal);
            await beforeAnswer?.();

            return answer;
        }, log: (text) => log.push(text) },
    asked, askedOn, opened, log };
}

test("cmdTrust: without a terminal it refuses, asks nothing and writes nothing", async () => {
    const env = trustEnv();
    const { seams, asked, opened } = trustSeams(env, { isTTY: false });
    await assert.rejects(() => m.cmdTrust(trustCfg(), seams), /vc-secrets trust requires an interactive terminal/);
    assert.deepEqual(asked, []);
    assert.deepEqual(opened, [], "no terminal is opened for a refusal");
    assert.ok(!fs.existsSync(m.trustFilePath(env)));
});

test("cmdTrust: a caller that cannot answer is shown no review, so no literal value reaches it", async () => {
    // The review is where a literal's value is printed; an agent's shell or a pipe must not get it.
    const cfg = trustCfg({ servers: { gh: { ...TRUST_BASE, env: { L: "literal:refused-marker-value" } } } });
    for (const seamsOverride of [{ isTTY: false }, { isErrTTY: false }, { isTTY: false, isErrTTY: false }]) {
        const { seams, log } = trustSeams(trustEnv(), seamsOverride);
        await assert.rejects(() => m.cmdTrust(cfg, seams), /requires an interactive terminal/);
        assert.deepEqual(log, [], `${JSON.stringify(seamsOverride)}: nothing is printed before the refusal`);
    }
});

test("cmdTrust: a terminal on stdin but not on stderr refuses too, because the review is shown on stderr", async () => {
    const env = trustEnv();
    const { seams, asked, opened } = trustSeams(env, { isErrTTY: false });
    await assert.rejects(() => m.cmdTrust(trustCfg(), seams), /vc-secrets trust requires an interactive terminal/);
    assert.deepEqual(asked, []);
    assert.deepEqual(opened, []);
    assert.ok(!fs.existsSync(m.trustFilePath(env)));
});

test("cmdTrust: on POSIX a controlling terminal that cannot be opened refuses before the review, and stdin is not a fallback", async () => {
    const env = trustEnv();
    const { seams, asked, log } = trustSeams(env, {
        openTerminal: () => { throw Object.assign(new Error("ENXIO: no such device or address, open '/dev/tty'"), { code: "ENXIO" }); },
    });
    await assert.rejects(() => m.cmdTrust(trustCfg(), seams), /vc-secrets trust requires an interactive terminal/);
    assert.deepEqual(asked, []);
    // A pty with no controlling terminal passes the isTTY checks, so this is the refusal that decides
    // whether a caller who cannot answer still sees the review.
    assert.equal(log.join(""), "", "nothing of the review reaches a caller the terminal could not be opened for");
    assert.ok(!fs.existsSync(m.trustFilePath(env)));
});

test("cmdTrust: a trust file that cannot be read refuses before the person is asked", async () => {
    const env = trustEnv();
    const file = m.trustFilePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");
    const { seams, asked, opened } = trustSeams(env);
    await assert.rejects(() => m.cmdTrust(trustCfg(), seams), /the trust file .* could not be read/);
    assert.deepEqual(asked, [], "an answer given for a record that cannot be written back is a wasted one");
    assert.deepEqual(opened, [], "refused before the terminal is opened, so there is nothing left to close");
    assert.equal(fs.readFileSync(file, "utf8"), "{ not json");
});

test("cmdTrust: on POSIX the question goes to the opened controlling terminal, which is closed afterwards", async () => {
    const env = trustEnv();
    const { seams, askedOn, opened } = trustSeams(env);
    await m.cmdTrust(trustCfg(), seams);
    assert.equal(opened.length, 1);
    assert.deepEqual(askedOn, [opened[0]], "the answer is read from the terminal that was opened, not from stdin");
    assert.equal(opened[0].closed, 1);

    const failing = trustSeams(env);
    failing.seams.ask = async () => { throw new Error("read failed"); };
    await assert.rejects(() => m.cmdTrust(trustCfg(), failing.seams), /read failed/);
    assert.equal(failing.opened[0].closed, 1, "closed on the way out of a failed read as well");
});

test("cmdTrust: on win32 there is no /dev/tty to try, so the answer is read from stdin and stderr", async () => {
    const env = trustEnv();
    const { seams, askedOn } = trustSeams(env, {
        platform: "win32",
        openTerminal: () => { throw new Error("win32 must never try to open a controlling terminal"); },
    });
    await m.cmdTrust(trustCfg(), seams);
    assert.equal(askedOn.length, 1);
    assert.equal(askedOn[0].input, process.stdin);
    assert.equal(askedOn[0].output, process.stderr);

    const noStderr = trustSeams(env, { platform: "win32", isErrTTY: false });
    await assert.rejects(() => m.cmdTrust(trustCfg(), noStderr.seams), /requires an interactive terminal/,
        "both terminals are still required on win32");
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

// askLine is not exported and cmdTrust is its only caller, so its contract is observed through cmdTrust's
// default `ask`, on a stream pair the test controls. The terminal's own close() is a no-op here: whatever
// happens to the input stream afterwards is askLine's doing.
function streamTerminal() {
    const input = new PassThrough();
    const output = new PassThrough();
    const shown = [];
    output.on("data", (chunk) => shown.push(String(chunk)));

    return { terminal: { input, output, close() {} }, shown };
}

// "hung" when the prompt is still open after `ms`: a prompt that never settles must fail a test, not stall it.
async function settlesWithin(promise, ms = 5_000) {
    let timer;
    const hung = new Promise((resolve) => { timer = setTimeout(() => resolve("hung"), ms); });
    try {
        return await Promise.race([promise.then(() => "settled"), hung]);
    } finally {
        clearTimeout(timer);
    }
}

test("cmdTrust: the default prompt settles at end of input instead of waiting for an answer that cannot come", async () => {
    const { terminal } = streamTerminal();
    terminal.input.end();
    const { seams } = trustSeams(trustEnv(), { openTerminal: () => terminal });
    assert.equal(await settlesWithin(m.cmdTrust(trustCfg(), { ...seams, ask: undefined })), "settled");
});

test("cmdTrust: end of input at the default prompt is no, and records nothing", async () => {
    const env = trustEnv();
    const { terminal } = streamTerminal();
    terminal.input.end();
    const { seams, log } = trustSeams(env, { openTerminal: () => terminal });
    await settlesWithin(m.cmdTrust(trustCfg(), { ...seams, ask: undefined }));
    assert.match(log.join(""), /not trusted -- nothing recorded/);
    assert.ok(!fs.existsSync(m.trustFilePath(env)), "no answer is not consent");
});

test("cmdTrust: the default prompt shows the question, takes the line it is given, and stops reading the input", async () => {
    const env = trustEnv();
    const cfg = trustCfg();
    const { terminal, shown } = streamTerminal();
    const { seams } = trustSeams(env, { openTerminal: () => terminal });
    const pending = m.cmdTrust(cfg, { ...seams, ask: undefined });
    terminal.input.write("y\n");
    assert.equal(await settlesWithin(pending), "settled");
    assert.ok(shown.join("").includes(`Trust these for ${cfg.projectRoot}? [y/N] `));
    assert.ok(m.readTrustState(env).repositories[cfg.projectRoot], "the line that was typed is the answer");
    assert.equal(terminal.input.isPaused(), true, "the reader was closed, so the terminal is not left being consumed");
});

test("cmdTrust: anything but y or yes writes nothing", async () => {
    const env = trustEnv();
    for (const answer of ["n", "", "no", "yep", "  "]) {
        const { seams } = trustSeams(env, { answer });
        await m.cmdTrust(trustCfg(), seams);
        assert.ok(!fs.existsSync(m.trustFilePath(env)), `"${answer}" recorded something`);
    }
});

test("cmdTrust: y records the full declared shape of everything gated, and yes in any case does too", async () => {
    const cfg = trustCfg({ tasks: { job: { command: "true", args: [], env: {} } } });
    for (const answer of ["y", "YES", " Yes "]) {
        const env = trustEnv();
        const { seams, asked } = trustSeams(env, { answer });
        await m.cmdTrust(cfg, seams);
        assert.match(asked[0], /^Trust these for .*\? \[y\/N\] $/);
        assert.ok(asked[0].includes(cfg.projectRoot));
        assert.deepEqual(m.readTrustState(env).repositories[cfg.projectRoot], {
            trustedAt: "2001-02-03T04:05:06.000Z",
            projectId: "proj-x",
            servers: { gh: m.launchShape(cfg.servers.gh) },
            tasks: { job: m.launchShape(cfg.tasks.job) },
        }, answer);
        assert.equal(m.trustProblem(cfg, "servers", "gh", m.readTrustState(env)), null, "what it recorded is what the gate accepts");
    }
});

test("cmdTrust: a second trust replaces the record, so an entry removed from the declarations is pruned", async () => {
    const env = trustEnv();
    // One repository directory whose declaration is rewritten between the two loads. trustCfg gives every
    // call a directory of its own under os.tmpdir(), and hand-built paths key a record by the parent of
    // the file's directory -- so two configs from it share a root only by both collapsing to os.tmpdir().
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-trust-repo-"));
    tmpDirs.push(repo);
    fs.mkdirSync(path.join(repo, ".claude"));
    const declarationFile = path.join(repo, ".claude", m.CONFIG_NAME);
    const loadDeclaring = (servers) => {
        fs.writeFileSync(declarationFile, JSON.stringify({ projectId: "proj-x", servers }));

        return m.loadConfig({ user: null, project: declarationFile, local: null });
    };
    const before = loadDeclaring({ gh: TRUST_BASE, gone: TRUST_BASE });
    assert.equal(before.projectRoot, m.trustRootKey(repo), "keyed by the repository, not by the directory every fixture shares");
    await m.cmdTrust(before, trustSeams(env).seams);
    assert.deepEqual(Object.keys(m.readTrustState(env).repositories[before.projectRoot].servers).sort(), ["gh", "gone"]);

    const after = loadDeclaring({ gh: TRUST_BASE });
    assert.equal(after.projectRoot, before.projectRoot, "the fixture must be the same repository");
    await m.cmdTrust(after, trustSeams(env).seams);
    assert.deepEqual(Object.keys(m.readTrustState(env).repositories[after.projectRoot].servers), ["gh"]);
    assert.equal(m.trustProblem(before, "servers", "gone", m.readTrustState(env)).reason, "untrusted",
        "a re-declared name is not covered by the earlier approval");
});

test("cmdTrust: another repository's record is left as it was", async () => {
    const env = trustEnv();
    const other = { trustedAt: "1999-01-01T00:00:00.000Z", servers: { x: m.launchShape(TRUST_BASE) }, tasks: {} };
    m.writeTrustState(env, { schemaVersion: 1, repositories: { "/somewhere/else": other } });
    await m.cmdTrust(trustCfg(), trustSeams(env).seams);
    assert.deepEqual(m.readTrustState(env).repositories["/somewhere/else"], other);
});

test("cmdTrust: an untrust that lands while the person is deciding is kept, not written back over", async () => {
    const env = trustEnv();
    const other = { trustedAt: "1999-01-01T00:00:00.000Z", servers: { x: m.launchShape(TRUST_BASE) }, tasks: {} };
    m.writeTrustState(env, { schemaVersion: 1, repositories: { "/removed/meanwhile": other } });
    const cfg = trustCfg();
    const { seams } = trustSeams(env, { beforeAnswer: () => {
        // What `vc-secrets untrust` and a trust of another repository, in another terminal, leave behind.
        m.writeTrustState(env, { schemaVersion: 1, repositories: { "/added/meanwhile": other } });
    } });
    await m.cmdTrust(cfg, seams);
    const after = m.readTrustState(env).repositories;
    assert.deepEqual(Object.keys(after).sort(), ["/added/meanwhile", cfg.projectRoot].sort(),
        "the concurrent removal and addition both survive next to the new record");
});

test("cmdTrust: the review shows what will run, names references, and shows a literal's value", async () => {
    const cfg = trustCfg({ user: { servers: { gh: { command: "user-gh", args: [], env: {} } } },
        servers: { gh: { command: "npx", args: ["-y", "gh-mcp"], env: { T: "secret:pat", L: "literal:review-marker-value" } } } });
    const env = trustEnv();
    const { seams, log } = trustSeams(env, { answer: "n" });
    await m.cmdTrust(cfg, seams);
    const text = log.join("");
    assert.ok(text.includes(cfg.files.project), "the declaring file");
    assert.ok(text.includes('shadows your user-scope "gh"'));
    assert.ok(text.includes('    command: "npx"\n'));
    assert.ok(text.includes(`    args: ${JSON.stringify(["-y", "gh-mcp"])}\n`));
    // A reference is a name, and the reader needs it; a literal is what the person approves -- a PATH
    // literal decides which binary runs.
    assert.ok(text.includes(`    env: ${JSON.stringify({ T: "secret:pat", L: "literal:review-marker-value" })}\n`), text);
});

test("cmdTrust: a refusal line for a changed literal names the key and never the value", () => {
    // The review shows a literal; every line that travels into a log does not.
    const cfg = trustCfg({ servers: { gh: { ...TRUST_BASE, env: { L: "literal:trusted-marker-value" } } } });
    const state = trustedStateFor(cfg);
    const changed = withDeclaration(cfg, "servers", "gh", { env: { L: "literal:current-marker-value" } });
    const problem = m.trustProblem(changed, "servers", "gh", state);
    assert.deepEqual(problem.differences, ["env L changed"]);
    const refusal = m.trustRefusal("servers", "gh", problem, changed);
    assert.ok(refusal.includes("env L changed"), refusal);
    assert.doesNotMatch(refusal, /marker-value/);
});

// One line of the review, by its label: `    command: `, `    args: `, `    env: `.
function reviewLine(text, label) {
    const line = text.split("\n").find((x) => x.startsWith(label));
    assert.ok(line, `no review line starts with ${JSON.stringify(label)}:\n${text}`);

    return line.slice(label.length);
}

test("cmdTrust: the review prints command, args and env as JSON, so control bytes are escapes that parse back to the declaration", async () => {
    // loadConfig refuses some of these bytes, so the rendering is driven on a config built past it: the
    // review must hold on its own, not by leaning on a check made elsewhere. Escaped rather than flattened
    // to "?", the text is inert on the screen and still says what the record holds.
    const declared = {
        command: "npx\u001b[2J\r",
        args: ["-y\u001b]0;title\u0007", "c1\u009b31m", "del\u007f"],
        // C1 in a value too: env goes through the same renderer as args, and only DEL/C1 tell it apart
        // from a plain JSON.stringify, which escapes C0 on its own.
        env: { "K\u001b[31m": "literal:v\r\u001b[2Jx", NL: "literal:line one\nline two", C1: "literal:c\u009b2J", T: "secret:pat" },
    };
    const { seams, log } = trustSeams(trustEnv(), { answer: "n" });
    await m.cmdTrust(withDeclaration(trustCfg(), "servers", "gh", declared), seams);
    const text = log.join("");
    assert.doesNotMatch(text, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/, "no control byte but the newlines that end the review's own lines");
    assert.ok(text.includes('    command: "npx\\u001b[2J\\r"\n'), "written as escapes, not flattened to a question mark");
    assert.ok(text.includes("c1\\u009b31m") && text.includes("del\\u007f") && text.includes("c\\u009b2J"),
        "DEL and C1, which JSON.stringify leaves raw, are escaped too -- in args and in env values");
    assert.ok(text.includes("line one\\nline two"), "a newline in a literal is the two characters, not a second review line");
    assert.equal(JSON.parse(reviewLine(text, "    command: ")), declared.command);
    assert.deepEqual(JSON.parse(reviewLine(text, "    args: ")), declared.args, "what is printed parses back to what was declared");
    assert.deepEqual(JSON.parse(reviewLine(text, "    env: ")), declared.env);
});

test("cmdTrust: a literal that imitates another declaration stays inside its own JSON string", async () => {
    // Joined with ", ", `A=literal:1, X=literal:y` read as two declarations. As JSON it is one string.
    const declared = { A: "literal:1, X=literal:y", B: 'literal:", "X":"literal:y' };
    const { seams, log } = trustSeams(trustEnv(), { answer: "n" });
    await m.cmdTrust(withDeclaration(trustCfg(), "servers", "gh", { env: declared }), seams);
    const env = JSON.parse(reviewLine(log.join(""), "    env: "));
    assert.deepEqual(Object.keys(env), ["A", "B"], "two declarations, not three or four");
    assert.deepEqual(env, declared);
});

test("cmdTrust: invisible and bidirectional format characters in an argument or a literal are written as escapes that parse back", async () => {
    // A right-to-left override or a zero-width space prints as nothing, or reorders what follows, so a review
    // showing them raw reads as something the record is not. Escaped rather than dropped, the text is inert
    // AND still parses to the declared value.
    const invisible = ["\u202e", "\u200b", "\ufeff", "\u2066", "\u00ad", "\u2028", "\u061c", "\u180e", "\u2060"];
    const declared = {
        args: ["--name=gpj.exe\u202etxt", `zero\u200bwidth`, `bom\ufeff`, "isolate\u2066x\u2069"],
        env: { LITERAL: "literal:a\u202eb\u200bc", ALL: `literal:${invisible.join("|")}` },
    };
    const { seams, log } = trustSeams(trustEnv(), { answer: "n" });
    await m.cmdTrust(withDeclaration(trustCfg(), "servers", "gh", declared), seams);
    const text = log.join("");
    for (const character of invisible) {
        assert.ok(!text.includes(character), `U+${character.codePointAt(0).toString(16)} must not reach the screen raw`);
    }
    assert.ok(text.includes("gpj.exe\\u202etxt") && text.includes("zero\\u200bwidth"), "written as the escape, in an argument");
    assert.ok(text.includes("a\\u202eb\\u200bc"), "and in a literal");
    assert.deepEqual(JSON.parse(reviewLine(text, "    args: ")), declared.args, "what is printed parses back to the declared arguments");
    assert.deepEqual(JSON.parse(reviewLine(text, "    env: ")), declared.env, "and to the declared literals");
});

test("cmdTrust: a repository root and a declaration path carrying ESC or CR reach neither the review, the prompt nor the log raw", async () => {
    // A directory name is chosen by whoever made the checkout, and ESC[2K with CR would overwrite the
    // `command:` line printed above the prompt. The paths are context, so they stay readable, escaped.
    const spoofRoot = "/tmp/repo\u001b[2K\rcommand: \"true\"";
    const spoofFile = `${spoofRoot}/.claude/vc-secrets.json`;
    const base = trustCfg();
    const cfg = { ...base, projectRoot: spoofRoot, files: { ...base.files, project: spoofFile } };
    const env = trustEnv();
    const { seams, log, asked } = trustSeams(env, { answer: "y" });
    await m.cmdTrust(cfg, seams);
    const shown = `${log.join("")}${asked.join("")}`;
    assert.doesNotMatch(shown, /[\u0000-\u0009\u000b-\u001f\u007f-\u009f]/, "not one raw control byte on any surface");
    assert.ok(asked[0].startsWith("Trust these for /tmp/repo?[2K?command: \"true\"?"), asked[0]);
    assert.ok(log.join("").includes(`(project, ${spoofFile.replace(/[\u0000-\u001f]/g, "?")})`), log.join(""));
    assert.ok(Object.hasOwn(m.readTrustState(env).repositories, spoofRoot), "the record is keyed by the real root, not the printed one");

    const refusal = m.trustRefusal("servers", "gh", m.trustProblem(cfg, "servers", "gh", NO_TRUST), cfg);
    assert.doesNotMatch(refusal, /[\u0000-\u001f\u007f-\u009f]/, "nor the refusal that names the root and the file");
    const changed = m.trustProblem(withDeclaration(cfg, "servers", "gh", { command: "sh" }), "servers", "gh", trustedStateFor(cfg));
    assert.doesNotMatch(m.trustRefusal("servers", "gh", changed, cfg), /[\u0000-\u001f\u007f-\u009f]/);
});

test("cmdTrust: the review shows a command, an argument and a literal whole, however long they are", async () => {
    // Past forTerminal's default of 200 and past any limit the refusal lines carry: what the person
    // approves must not end where the screen's patience did.
    const long = { command: `npx${"x".repeat(10_000)}`, arg: `--flag=${"y".repeat(10_000)}`, literal: `${"z".repeat(10_000)}END` };
    const cfg = withDeclaration(trustCfg(), "servers", "gh", {
        command: long.command, args: [long.arg], env: { L: `literal:${long.literal}` } });
    const { seams, log } = trustSeams(trustEnv(), { answer: "n" });
    await m.cmdTrust(cfg, seams);
    const text = log.join("");
    assert.equal(JSON.parse(reviewLine(text, "    command: ")), long.command);
    assert.deepEqual(JSON.parse(reviewLine(text, "    args: ")), [long.arg], "the argv is shown to its last element");
    assert.deepEqual(JSON.parse(reviewLine(text, "    env: ")), { L: `literal:${long.literal}` }, "and a literal to its last character");
    assert.doesNotMatch(text, /\.\.\.\n/, "nothing in the review ends in a cut");
});

test("trustDifferences: an env key and a command in a refusal line are neutralised for the terminal", () => {
    // JSON.stringify escapes C0 itself and leaves DEL and C1 raw -- and C1 holds the 8-bit CSI -- so the
    // command is pinned with the bytes stringify does not catch, and the key, which is printed bare, with ESC.
    const trusted = { command: "npx", args: [], env: {} };
    const actual = { command: "npx\u009b\u007f", args: [], env: { "K\u001b[31m": "literal:x" } };
    assert.deepEqual(m.trustDifferences(trusted, actual),
        ['command is "npx??", trusted "npx"', "env K?[31m added"]);
    assert.deepEqual(m.trustDifferences({ ...trusted, env: { "K\u001b": "literal:x" } }, trusted), ["env K? removed"]);
});

test("trustProblem: a change of projectId alone refuses, and says which id replaced which", () => {
    const cfg = trustCfg();
    const state = trustedStateFor(cfg);
    assert.equal(m.trustProblem(cfg, "servers", "gh", state), null, "the same projectId is trusted");
    const moved = { ...cfg, projectId: "proj-other" };
    assert.deepEqual(m.trustProblem(moved, "servers", "gh", state), {
        reason: "changed", differences: ['projectId is "proj-other", trusted "proj-x"'], home: "project", shadowsUser: false });
    assert.match(m.trustRefusal("servers", "gh", m.trustProblem(moved, "servers", "gh", state), moved),
        /changed since you trusted it: projectId is "proj-other", trusted "proj-x" -- /);
    // Alongside a change of shape, both are listed.
    const both = m.trustProblem(withDeclaration(moved, "servers", "gh", { command: "sh" }), "servers", "gh", state);
    assert.equal(both.differences.length, 2);
    assert.ok(both.differences.some((x) => x.startsWith("projectId is")));
    assert.ok(both.differences.some((x) => x.startsWith("command is")));
});

test("trustProblem: a record without a projectId differs from every config, and null only matches null", () => {
    const cfg = trustCfg();
    const state = trustedStateFor(cfg);
    delete state.repositories[cfg.projectRoot].projectId;
    assert.deepEqual(m.trustProblem(cfg, "servers", "gh", state).differences, ['projectId is "proj-x", trusted (not recorded)'],
        "a record that predates the field is said to be missing it, not to have recorded null");

    // A repository that declares no projectId: recorded as null and matched as null, and never as absent.
    const bare = { ...cfg, projectId: null };
    const bareState = trustedStateFor(bare);
    assert.equal(bareState.repositories[cfg.projectRoot].projectId, null);
    assert.equal(m.trustProblem(bare, "servers", "gh", bareState), null);
    delete bareState.repositories[cfg.projectRoot].projectId;
    assert.deepEqual(m.trustProblem(bare, "servers", "gh", bareState).differences, ["projectId is null, trusted (not recorded)"],
        "an absent field is not the null a record would have carried");
    assert.deepEqual(m.trustProblem(bare, "servers", "gh", trustedStateFor(cfg)).differences, ['projectId is null, trusted "proj-x"'],
        "and a recorded id is not a missing one");
});

test("cmdTrust: the record carries the projectId (null when the repository has none), and the review prints it once", async () => {
    const env = trustEnv();
    const cfg = trustCfg({ servers: { gh: TRUST_BASE, other: TRUST_BASE } });
    const { seams, log } = trustSeams(env);
    await m.cmdTrust(cfg, seams);
    assert.equal(m.readTrustState(env).repositories[cfg.projectRoot].projectId, "proj-x");
    assert.equal(log.join("").split("\n").filter((x) => x === "projectId: proj-x").length, 1,
        "once for the repository, not once per launchable");

    const bareEnv = trustEnv();
    const bare = m.loadConfig(scopedPaths({ project: { servers: { gh: TRUST_BASE } } }));
    assert.equal(bare.projectId, null, "the fixture must declare no projectId");
    const second = trustSeams(bareEnv);
    await m.cmdTrust(bare, second.seams);
    assert.equal(m.readTrustState(bareEnv).repositories[bare.projectRoot].projectId, null);
    assert.equal(m.trustProblem(bare, "servers", "gh", m.readTrustState(bareEnv)), null);
    assert.ok(second.log.join("").includes("projectId: (none)\n"));
});

test("readTrustState: a record's projectId may be a string, null or absent, and nothing else", () => {
    const record = (extra) => ({ trustedAt: "2000-01-01T00:00:00.000Z", servers: {}, tasks: {}, ...extra });
    const read = (extra) => {
        const env = trustEnv();
        m.writeTrustState(env, { schemaVersion: 1, repositories: { "/r": record(extra) } });

        return m.readTrustState(env);
    };
    for (const extra of [{ projectId: "proj-x" }, { projectId: null }, {}]) {
        assert.doesNotThrow(() => read(extra), JSON.stringify(extra));
    }
    for (const projectId of [7, true, {}, ["proj-x"]]) {
        assert.throws(() => read({ projectId }), /the trust file .* is unusable \(the record for \/r has a malformed "projectId"\)/,
            JSON.stringify(projectId));
    }
});

// A repository whose project file declares `gh` and whose local file declares `mine` and a task, so the
// winning entry of two of the three is in the local home.
function localDeclaredCfg() {
    const cfg = m.loadConfig(scopedPaths({
        project: { projectId: "proj-x", servers: { gh: TRUST_BASE } },
        local: { servers: { mine: TRUST_BASE }, tasks: { job: TRUST_BASE } },
    }));
    assert.equal(cfg.servers.mine.home, "local", "the fixture must have the local file win");
    assert.equal(cfg.tasks.job.home, "local");

    return cfg;
}

// One name per way a collision can fail to be a shadow of the user's own: `a` and task `dup`/`job` are
// declared at the user scope and re-declared by the project (shadows); `b` has no collision at all;
// server `dup` collides with nothing of ITS kind though the user's task of that name does; `p` collides
// project -> local, which starts at the project, not the user.
function shadowCfg() {
    return m.loadConfig(scopedPaths({
        user: { servers: { a: TRUST_BASE }, tasks: { dup: TRUST_BASE, job: TRUST_BASE } },
        project: { projectId: "proj-x", servers: { a: TRUST_BASE, b: TRUST_BASE, dup: TRUST_BASE, p: TRUST_BASE },
            tasks: { dup: TRUST_BASE, job: TRUST_BASE } },
        local: { servers: { p: TRUST_BASE } },
    }));
}

test("cmdTrust: a launchable whose winning entry is in the local file is reviewed and recorded like a project one", async () => {
    const cfg = localDeclaredCfg();
    const env = trustEnv();
    const { seams, log } = trustSeams(env);
    await m.cmdTrust(cfg, seams);
    const text = log.join("");
    assert.ok(text.includes(`server "mine" (local, ${cfg.files.local})`), text);
    assert.ok(text.includes(`task "job" (local, ${cfg.files.local})`), text);
    const record = m.readTrustState(env).repositories[cfg.projectRoot];
    assert.deepEqual(Object.keys(record.servers).sort(), ["gh", "mine"]);
    assert.deepEqual(Object.keys(record.tasks), ["job"]);
    assert.deepEqual(m.trustAssessment(cfg, () => m.readTrustState(env)).findings, [],
        "what was recorded is what the gate accepts, so a local launchable can be trusted and not only refused");
});

test("cmdTrust: the review says which kind of launchable shadows the user's own, and only when one does", async () => {
    const { seams, log } = trustSeams(trustEnv(), { answer: "n" });
    await m.cmdTrust(shadowCfg(), seams);
    const lines = log.join("").split("\n");
    const lineFor = (label) => {
        const line = lines.find((x) => x.startsWith(label));
        assert.ok(line, `no review line starts with ${label}`);

        return line;
    };
    assert.match(lineFor('task "dup" (project, '), / -- shadows your user-scope "dup"$/);
    assert.match(lineFor('server "a" (project, '), / -- shadows your user-scope "a"$/);
    assert.doesNotMatch(lineFor('server "b" (project, '), /shadows/);
    assert.doesNotMatch(lineFor('server "p" (local, '), /shadows/, "a project entry replaced by a local one is not the user's");
});

test("cmdTrust: with nothing gated it says so without asking, and drops a stale record without a terminal", async () => {
    const env = trustEnv();
    const cfg = m.loadConfig(scopedPaths({ user: { servers: { mine: TRUST_BASE } }, project: { projectId: "proj-x" } }));
    const stale = { trustedAt: "1999-01-01T00:00:00.000Z", servers: { gone: m.launchShape(TRUST_BASE) }, tasks: {} };
    m.writeTrustState(env, { schemaVersion: 1, repositories: { [cfg.projectRoot]: stale, "/somewhere/else": stale } });
    const { seams, asked, log } = trustSeams(env, { isTTY: false });
    await m.cmdTrust(cfg, seams);
    assert.deepEqual(asked, []);
    assert.match(log.join(""), /needs trust -- removed its trust record/);
    assert.deepEqual(Object.keys(m.readTrustState(env).repositories), ["/somewhere/else"]);

    const second = trustSeams(env, { isTTY: false });
    await m.cmdTrust(cfg, second.seams);
    assert.match(second.log.join(""), /nothing in .* needs trust\n$/);
});

test("cmdUntrust: removes the record for the path given and only that one", async () => {
    const env = trustEnv();
    const [a, b] = ["a", "b"].map((tag) => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), `vc-secrets-untrust-${tag}-`));
        tmpDirs.push(dir);

        return dir;
    });
    const record = { trustedAt: "1999-01-01T00:00:00.000Z", servers: {}, tasks: {} };
    m.writeTrustState(env, { schemaVersion: 1, repositories: { [m.trustRootKey(a)]: record, [m.trustRootKey(b)]: record } });
    const log = [];
    await m.cmdUntrust(a, { env, log: (text) => log.push(text) });
    assert.deepEqual(Object.keys(m.readTrustState(env).repositories), [m.trustRootKey(b)]);
    assert.match(log.join(""), /removed the trust record/);

    await m.cmdUntrust(a, { env, log: (text) => log.push(text) });
    assert.match(log.at(-1), /has no trust record -- nothing to remove/);
});

test("cmdUntrust: with no path it takes the repository configPaths finds from the working directory", async () => {
    const env = trustEnv();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-untrust-cwd-"));
    tmpDirs.push(repo);
    fs.mkdirSync(path.join(repo, ".claude"));
    fs.writeFileSync(path.join(repo, ".claude", m.CONFIG_NAME), JSON.stringify({ servers: {} }));
    const nested = path.join(repo, "src");
    fs.mkdirSync(nested);
    const record = { trustedAt: "1999-01-01T00:00:00.000Z", servers: {}, tasks: {} };
    m.writeTrustState(env, { schemaVersion: 1, repositories: { [m.trustRootKey(repo)]: record } });
    await m.cmdUntrust(undefined, { env, cwd: nested, log: () => {} });
    assert.deepEqual(m.readTrustState(env).repositories, {});
});

test("cmdUntrust: a checkout deleted after it was trusted through a link still has its record found by that link's path",
    { skip: !CAN_SYMLINK && "this machine cannot create a symlink" },
    async () => {
        // The transition, not the aftermath: the record is made while the repository exists and reached
        // through the link, so it is keyed by the target; only then is the repository deleted and untrusted
        // by the same link path.
        const env = trustEnv();
        const real = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-untrust-gone-real-"));
        tmpDirs.push(real);
        const repo = path.join(real, "repo");
        fs.mkdirSync(path.join(repo, ".claude"), { recursive: true });
        fs.writeFileSync(path.join(repo, ".claude", m.CONFIG_NAME),
            JSON.stringify({ projectId: "proj-x", servers: { gh: TRUST_BASE } }));
        const link = path.join(probeDir, `untrust-gone-${path.basename(real)}`);
        fs.symlinkSync(real, link, LINK_TYPE);
        const viaLink = path.join(link, "repo");

        const cfg = m.loadConfig({ user: null, project: path.join(viaLink, ".claude", m.CONFIG_NAME), local: null });
        await m.cmdTrust(cfg, trustSeams(env).seams);
        assert.deepEqual(Object.keys(m.readTrustState(env).repositories), [m.trustRootKey(repo)], "keyed by the target");

        fs.rmSync(repo, { recursive: true, force: true });
        assert.ok(!fs.existsSync(viaLink), "the fixture must have deleted the checkout");
        const log = [];
        await m.cmdUntrust(viaLink, { env, log: (text) => log.push(text) });
        assert.deepEqual(m.readTrustState(env).repositories, {}, `the record was not found: ${log.join("")}`);
        assert.match(log.join(""), /removed the trust record/);
    });

// A file system as a model, for trustRootKey's seams: `real` maps a path that exists to what realpath gives
// for it, `links` maps a symlink (dangling or not) to what readlink gives. Absent from both, a path does not
// exist -- realpath and lstat throw for it, as they do for a deleted one.
function fakeFileSystem({ real = {}, links = {} } = {}) {
    const missing = (p) => Object.assign(new Error(`ENOENT: ${p}`), { code: "ENOENT" });
    const calls = { realpath: 0 };

    return {
        real, links, calls,
        seams: {
            platform: "linux",
            realpath: (p) => {
                calls.realpath += 1;
                if (!Object.hasOwn(real, p)) {
                    throw missing(p);
                }

                return real[p];
            },
            lstat: (p) => {
                if (Object.hasOwn(links, p)) {
                    return { isSymbolicLink: () => true };
                }
                if (Object.hasOwn(real, p)) {
                    return { isSymbolicLink: () => false };
                }
                throw missing(p);
            },
            readlink: (p) => {
                if (!Object.hasOwn(links, p)) {
                    throw missing(p);
                }

                return links[p];
            },
        },
    };
}

test("trustRootKey: a checkout that IS a link, whose target is then deleted, keys as it did while the target existed", () => {
    // `~/work/repo -> /data/repo`: trusting through the link keys the target. Delete the target and the link
    // dangles; realpath fails for it, and climbing to its parent `~/work` would key the link's own path --
    // the wrong place to stop, since the link itself says where the key was.
    const fs2 = fakeFileSystem({
        real: { "/home": "/home", "/home/work": "/home/work", "/data": "/data", "/data/repo": "/data/repo", "/home/work/repo": "/data/repo" },
        links: { "/home/work/repo": "/data/repo" },
    });
    const key = (p) => m.trustRootKey(p, fs2.seams);
    const live = key("/home/work/repo");
    assert.equal(live, "/data/repo");
    delete fs2.real["/data/repo"];
    delete fs2.real["/home/work/repo"];
    assert.equal(key("/home/work/repo"), live, "the dangling leaf link is followed, not climbed past");
    assert.equal(key("/home/work/repo/sub/deeper"), "/data/repo/sub/deeper", "and so is one with a tail beyond it");

    fs2.links["/home/work/repo"] = "../../data/repo";
    assert.equal(key("/home/work/repo"), live, "a relative target is resolved against the link's own directory");
});

test("trustRootKey: a dangling link is followed through a chain, and to a target that sits below a deleted directory", () => {
    const chain = fakeFileSystem({
        real: { "/a": "/a", "/b": "/b", "/c": "/c" },
        links: { "/a/x": "/b/y", "/b/y": "/c/z" },
    });
    assert.equal(m.trustRootKey("/a/x", chain.seams), "/c/z", "each dangling link is followed to the next");

    const below = fakeFileSystem({
        real: { "/home": "/home", "/home/work": "/home/work", "/data": "/data" },
        links: { "/home/work/repo": "/data/gone/repo" },
    });
    assert.equal(m.trustRootKey("/home/work/repo", below.seams), "/data/gone/repo",
        "the target's own missing directories are joined onto its nearest existing ancestor");
});

test("trustRootKey: a loop of dangling links ends, at the plain resolve, after a bounded number of hops", () => {
    const loop = fakeFileSystem({
        real: { "/l": "/l" },
        links: { "/l/a": "/l/b", "/l/b": "/l/a" },
    });
    assert.equal(m.trustRootKey("/l/a", loop.seams), "/l/a", "no key can be found, so the plain resolve stands");
    assert.ok(loop.calls.realpath < 1000, `it terminated after ${loop.calls.realpath} lookups, not by running out of patience`);

    const self = fakeFileSystem({ real: { "/l": "/l" }, links: { "/l/self": "/l/self" } });
    assert.equal(m.trustRootKey("/l/self", self.seams), "/l/self");
});

test("cmdUntrust: a checkout that is itself a link, trusted through it and then deleted at its target, is still untrusted through that link",
    { skip: !CAN_SYMLINK && "this machine cannot create a symlink" },
    async () => {
        // `~/work/repo -> /data/repo`, with /data/repo deleted: the link dangles, and a climb to its parent
        // would key the link's own path where the record is under the target's.
        const env = trustEnv();
        const data = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-untrust-leaf-data-"));
        tmpDirs.push(data);
        const repo = path.join(data, "repo");
        fs.mkdirSync(path.join(repo, ".claude"), { recursive: true });
        fs.writeFileSync(path.join(repo, ".claude", m.CONFIG_NAME),
            JSON.stringify({ projectId: "proj-x", servers: { gh: TRUST_BASE } }));
        const leafLink = path.join(probeDir, `untrust-leaf-${path.basename(data)}`);
        fs.symlinkSync(repo, leafLink, LINK_TYPE);

        const cfg = m.loadConfig({ user: null, project: path.join(leafLink, ".claude", m.CONFIG_NAME), local: null });
        await m.cmdTrust(cfg, trustSeams(env).seams);
        assert.deepEqual(Object.keys(m.readTrustState(env).repositories), [m.trustRootKey(repo)], "keyed by the target");

        fs.rmSync(repo, { recursive: true, force: true });
        assert.ok(fs.lstatSync(leafLink).isSymbolicLink() && !fs.existsSync(leafLink), "the fixture must leave the link dangling");
        const log = [];
        await m.cmdUntrust(leafLink, { env, log: (text) => log.push(text) });
        assert.deepEqual(m.readTrustState(env).repositories, {}, `the record was not found: ${log.join("")}`);
    });

test("trustRootKey: a relative link target whose `..` crosses a linked parent keys as the kernel resolves it, after deletion too",
    { skip: (!CAN_SYMLINK && "this machine cannot create a symlink")
        || (process.platform === "win32" && "a junction cannot hold a relative target") },
    () => {
        // x/link -> y/z/real, and y/z/real/repo -> ../../data/repo. The kernel applies the `..` in the
        // physical y/z/real, so the checkout is y/data/repo; resolved against the lexical x/link it would be
        // a different directory, and untrust of the deleted checkout would miss its record.
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-relative-link-"));
        tmpDirs.push(root);
        const real = path.join(root, "y", "z", "real");
        const target = path.join(root, "y", "data", "repo");
        fs.mkdirSync(real, { recursive: true });
        fs.mkdirSync(target, { recursive: true });
        fs.mkdirSync(path.join(root, "x"));
        fs.symlinkSync(real, path.join(root, "x", "link"), LINK_TYPE);
        fs.symlinkSync(path.join("..", "..", "data", "repo"), path.join(real, "repo"), "dir");
        const viaLinks = path.join(root, "x", "link", "repo");

        const live = m.trustRootKey(viaLinks);
        assert.equal(live, fs.realpathSync.native(target), "the fixture must resolve the way the kernel does");
        fs.rmSync(target, { recursive: true });
        assert.ok(fs.lstatSync(path.join(real, "repo")).isSymbolicLink() && !fs.existsSync(viaLinks),
            "the fixture must leave the inner link dangling");
        assert.equal(m.trustRootKey(viaLinks), live, "the deleted checkout keys as it did while it existed");
    });

test("a declaration path carrying ESC reaches neither doctor's WARN lines nor the failure line raw", () => {
    // Loading warnings and errors embed the declaration file's path, a directory name somebody chose; an
    // ESC in it is a terminal command wherever it is printed.
    const spoofed = "/tmp/repo\u001b[2K\rcommand: true/.claude/vc-secrets.json";
    const cfg = { ...m.loadConfig(scopedPaths({ user: { servers: {} } })), warnings: [`${spoofed}: unknown key "x" ignored`] };
    const report = crossingReport(cfg);
    const warn = report.find((l) => l.startsWith("WARN"));
    assert.ok(warn, report.join("\n"));
    assert.doesNotMatch(warn, /[\u0000-\u001f\u007f-\u009f]/, "no control byte in the WARN line");
    assert.ok(warn.includes("/tmp/repo?[2K?command: true/.claude/vc-secrets.json: unknown key"), warn);

    // The failure line stays ONE physical line -- the probe classifies a refusal by the last stderr line --
    // with a real line ending folded to a space, and every other control byte flattened.
    const line = m.failureLine(new m.VcSecretsError(`${spoofed}: not valid JSON\nsecond line\r\n   third`));
    assert.equal(line, "vc-secrets: /tmp/repo?[2K?command: true/.claude/vc-secrets.json: not valid JSON second line third\n");
    assert.equal(line.split("\n").length, 2, "one line and its terminator");
    assert.equal(m.failureLine("plain string"), "vc-secrets: plain string\n", "a thrown non-error is still one line");
    // U+2028 and U+2029 are line ends to the probe's line match, and forTerminal does not flatten them.
    const lineSep = String.fromCodePoint(0x2028);
    const paraSep = String.fromCodePoint(0x2029);
    assert.equal(m.failureLine(new Error(`/repo${lineSep}x: not valid JSON${paraSep}tail`)),
        "vc-secrets: /repo x: not valid JSON tail\n", "folded like a newline, so the probe still reads one launcher line");
});

test("cmdUntrust: a path that never existed says there is no record, and removes nothing", async () => {
    const env = trustEnv();
    const other = { trustedAt: "1999-01-01T00:00:00.000Z", servers: {}, tasks: {} };
    m.writeTrustState(env, { schemaVersion: 1, repositories: { "/somewhere/else": other } });
    const log = [];
    await m.cmdUntrust(path.join(os.tmpdir(), "vc-secrets-never-existed", "repo"), { env, log: (text) => log.push(text) });
    assert.match(log.join(""), /has no trust record -- nothing to remove/);
    assert.deepEqual(Object.keys(m.readTrustState(env).repositories), ["/somewhere/else"]);
});

test("cmdUntrust: a symlink to a trusted checkout removes that checkout's record",
    { skip: !CAN_SYMLINK && "this machine cannot create a symlink" },
    async () => {
        const env = trustEnv();
        const real = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-untrust-real-"));
        tmpDirs.push(real);
        const link = path.join(probeDir, `untrust-alias-${path.basename(real)}`);
        fs.symlinkSync(real, link, LINK_TYPE);
        const record = { trustedAt: "1999-01-01T00:00:00.000Z", servers: {}, tasks: {} };
        m.writeTrustState(env, { schemaVersion: 1, repositories: { [m.trustRootKey(real)]: record } });
        await m.cmdUntrust(link, { env, log: () => {} });
        assert.deepEqual(m.readTrustState(env).repositories, {});
    });

test("trustProblem: only a collision that started in the user file, for this kind and this name, is a shadow", () => {
    const cfg = shadowCfg();
    const { problems } = m.trustAssessment(cfg, () => NO_TRUST);
    const shadows = Object.fromEntries([...problems].map(([key, problem]) => [key, problem.shadowsUser]));
    assert.deepEqual(shadows, {
        "servers/a": true,
        "servers/b": false,
        "servers/dup": false,
        "servers/p": false,
        "tasks/dup": true,
        "tasks/job": true,
    });
    const refusal = (kind, name) => m.trustRefusal(kind, name, problems.get(`${kind}/${name}`), cfg);
    assert.ok(refusal("tasks", "dup").startsWith('task "dup" is declared by '), refusal("tasks", "dup"));
    assert.ok(refusal("tasks", "dup").includes('(it shadows your user-scope "dup")'));
    assert.ok(refusal("servers", "a").startsWith('server "a" is declared by '));
    assert.ok(!refusal("servers", "b").includes("shadows"));
});

test("trustAssessment: reads no file when nothing is gated, so a user-scope config never depends on it", () => {
    const cfg = m.loadConfig(scopedPaths({ user: { servers: { mine: TRUST_BASE } } }));
    const result = m.trustAssessment(cfg, () => { throw new Error("the trust file was read"); });
    assert.equal(result.problems.size, 0);
    assert.deepEqual(result.findings, []);
    assert.equal(result.unreadable, null);

    // A repository that declares a local secret, with a user-scope server that does not read it: still no file.
    const withRepository = m.loadConfig(scopedPaths({
        user: { servers: { mine: TRUST_BASE } },
        project: { projectId: "proj-x", secrets: { unrelated: { backend: "local" } } } }));
    assert.equal(m.trustAssessment(withRepository, () => { throw new Error("the trust file was read"); }).problems.size, 0);
    assert.deepEqual(m.trustNotes(withRepository, m.trustAssessment(withRepository, () => { throw new Error("read"); })), []);
});

test("trustAssessment: untrusted and changed launchables are findings, trusted ones say nothing", () => {
    const cfg = trustCfg({ servers: { ok: TRUST_BASE, drifted: TRUST_BASE, fresh: TRUST_BASE }, tasks: { job: TRUST_BASE } });
    const state = trustedStateFor(cfg);
    delete state.repositories[cfg.projectRoot].servers.fresh;
    delete state.repositories[cfg.projectRoot].tasks.job;
    const actual = withDeclaration(cfg, "servers", "drifted", { command: "sh" });
    const result = m.trustAssessment(actual, () => state);
    assert.deepEqual([...result.problems.keys()].sort(), ["servers/drifted", "servers/fresh", "tasks/job"]);
    assert.equal(result.findings.length, 3);
    assert.ok(result.findings.every((f) => f.includes("vc-secrets trust")));
    assert.ok(!result.findings.some((f) => f.includes('"ok"')));
});

test("trustAssessment: an unreadable trust file is one finding, and every gated launchable counts as refused", () => {
    const cfg = trustCfg({ tasks: { job: TRUST_BASE } });
    const failure = new m.VcSecretsError("the trust file /x/trust.json is unusable (not an object)");
    const result = m.trustAssessment(cfg, () => { throw failure; });
    assert.deepEqual(result.findings, [failure.message]);
    assert.equal(result.unreadable, failure.message);
    assert.deepEqual([...result.problems.keys()].sort(), ["servers/gh", "tasks/job"]);
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

test("trustNotes: emit-config names each untrusted or changed repository server, and only those", () => {
    const cfg = trustCfg({ servers: { ok: TRUST_BASE, drifted: TRUST_BASE, fresh: TRUST_BASE }, tasks: { job: TRUST_BASE } });
    const state = trustedStateFor(cfg);
    delete state.repositories[cfg.projectRoot].servers.fresh;
    delete state.repositories[cfg.projectRoot].tasks.job;
    const actual = withDeclaration(cfg, "servers", "drifted", { command: "sh" });
    const notes = m.trustNotes(actual, m.trustAssessment(actual, () => state));
    assert.deepEqual(notes.sort(), [
        'drifted: changed since you trusted it -- run "vc-secrets trust" again before starting it',
        'fresh: declared by this repository and not trusted yet -- run "vc-secrets trust" before starting it',
    ]);

    const userOnly = m.loadConfig(scopedPaths({ user: { servers: { mine: TRUST_BASE } } }));
    assert.deepEqual(m.trustNotes(userOnly, m.trustAssessment(userOnly, () => { throw new Error("read"); })), []);
});

test("trustAssessment: an untrusted launchable from the local file is a problem, and trustNotes names the server", () => {
    const cfg = localDeclaredCfg();
    const result = m.trustAssessment(cfg, () => NO_TRUST);
    assert.deepEqual([...result.problems.keys()].sort(), ["servers/gh", "servers/mine", "tasks/job"]);
    assert.equal(result.problems.get("servers/mine").home, "local");
    assert.ok(result.findings.some((f) => f.startsWith('server "mine" is declared by ')), result.findings.join("\n"));
    assert.ok(m.trustNotes(cfg, result).includes(
        'mine: declared by this repository and not trusted yet -- run "vc-secrets trust" before starting it'));
});

test("trustNotes: an unreadable trust file is reported once, as itself", () => {
    const cfg = trustCfg({ servers: { a: TRUST_BASE, b: TRUST_BASE } });
    const failure = new m.VcSecretsError("the trust file /x/trust.json is unusable (not an object)");
    assert.deepEqual(m.trustNotes(cfg, m.trustAssessment(cfg, () => { throw failure; })), [failure.message]);
});

// ── a user-scope launchable that reads the repository's keystore namespace ─────────────────────────
//
// The person's own server or task needs no trust of its own, but a `local`-backend secret or an `oauth`
// entry a repository declares is stored under the repository's projectId -- which the repository chooses,
// another project's included. The launch is therefore held to a trust record for THIS root whose
// projectId is the one in play (trustGateOf). The repository's own launchables are unchanged.

const NS_SERVER = { command: process.execPath, args: ["-e", ""], env: { PAT: "secret:pat" } };
const NS_OAUTH_SERVER = { command: process.execPath, args: ["-e", ""], env: { ADO_TOKEN: "oauth:ado" } };
const NS_GRANT = { servers: { s: { command: process.execPath, args: ["-e", ""], envKeys: ["ADO_TOKEN"] } } };

// scopedPaths gives every config the same root (the parent of its temp directory), so two "repositories"
// built with it would be one. A root of its own is what makes the trust record's key mean something.
function withOwnRoot(paths) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-ns-root-"));
    tmpDirs.push(root);

    return { ...paths, root };
}

// A user-scope server `s` that reads `secret:pat`, with the repository declaring `pat` as a local secret
// in the file named by `declaredIn`. The repository declares no launchable of its own.
function namespaceCfg({ projectId = "proj-x", declaredIn = "project", user = {}, secrets = { pat: { backend: "local" } } } = {}) {
    return m.loadConfig(withOwnRoot(scopedPaths({
        user: { servers: { s: NS_SERVER }, ...user },
        project: { projectId, ...(declaredIn === "project" ? { secrets } : {}) },
        ...(declaredIn === "local" ? { local: { secrets } } : {}),
    })));
}

// The same for a sign-in: the repository declares `oauth.ado`, and the user file grants it to `s`.
function namespaceOauthCfg({ projectId = "proj-x", grant = true } = {}) {
    return m.loadConfig(withOwnRoot(scopedPaths({
        user: { servers: { s: NS_OAUTH_SERVER },
            ...(grant ? { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: NS_GRANT } } } : {}) },
        project: { projectId, oauth: { ado: OAUTH_DECL } },
    })));
}

const SECRET_PAT = [{ kind: "secret", name: "pat" }];

test("trustProblem: a user-scope launchable reading a repository's local secret needs a record for this root with this projectId", () => {
    const cfg = namespaceCfg();
    assert.deepEqual(m.trustProblem(cfg, "servers", "s", NO_TRUST),
        { reason: "untrusted", home: "user", shadowsUser: false, reads: SECRET_PAT });
    assert.equal(m.trustProblem(cfg, "servers", "s", trustedStateFor(cfg)), null);

    // The record is keyed by the root: another repository's record trusts nothing here.
    const elsewhere = { schemaVersion: 1, repositories: { "/somewhere/else": trustedStateFor(cfg).repositories[cfg.projectRoot] } };
    assert.equal(m.trustProblem(cfg, "servers", "s", elsewhere).reason, "untrusted");

    // The projectId is what the record pins: a different one reports as changed, naming both.
    const moved = trustedStateFor(cfg);
    moved.repositories[cfg.projectRoot].projectId = "proj-other";
    assert.deepEqual(m.trustProblem(cfg, "servers", "s", moved),
        { reason: "changed", differences: ['projectId is "proj-x", trusted "proj-other"'], home: "user", shadowsUser: false, reads: SECRET_PAT });
    delete moved.repositories[cfg.projectRoot].projectId;
    assert.deepEqual(m.trustProblem(cfg, "servers", "s", moved).differences, ['projectId is "proj-x", trusted (not recorded)']);
});

test("trustProblem: a secret declared in the LOCAL file gates a user-scope reader like a project one, and a task like a server", () => {
    const cfg = namespaceCfg({ declaredIn: "local", user: { tasks: { job: NS_SERVER } } });
    assert.equal(cfg.secrets.pat.home, "local");
    for (const kind of ["servers", "tasks"]) {
        const name = kind === "servers" ? "s" : "job";
        assert.deepEqual(m.trustProblem(cfg, kind, name, NO_TRUST),
            { reason: "untrusted", home: "user", shadowsUser: false, reads: SECRET_PAT }, kind);
        assert.equal(m.trustProblem(cfg, kind, name, trustedStateFor(cfg)), null, kind);
    }
});

test("trustProblem: only what a repository's namespace holds puts a user-scope launchable under the gate", () => {
    const gated = (cfg) => m.trustProblem(cfg, "servers", "s", NO_TRUST);
    // The user's own secret, even while the repository declares others.
    assert.equal(gated(namespaceCfg({ user: { secrets: { pat: { backend: "local" } } }, secrets: { other: { backend: "local" } } })), null);
    // A Key Vault secret: it never touches the keystore, and the `vaults` grant already decides it.
    assert.equal(gated(namespaceCfg({ secrets: { pat: KV_PAT } })), null);
    // A literal, and a reference whose winner is the user's own after the repository declared nothing of the name.
    const literal = m.loadConfig(scopedPaths({
        user: { servers: { s: { ...NS_SERVER, env: { PAT: "literal:x" } } } }, project: { projectId: "proj-x", secrets: { pat: { backend: "local" } } } }));
    assert.equal(gated(literal), null);
    // The positive control for all of the above: the same shape with the repository's local secret.
    assert.notEqual(gated(namespaceCfg()), null);
    // An oauth entry the user declared is the user's.
    const own = m.loadConfig(scopedPaths({ user: { oauth: { ado: OAUTH_DECL }, servers: { s: NS_OAUTH_SERVER } } }));
    assert.equal(gated(own), null);
    assert.deepEqual(gated(namespaceOauthCfg())?.reads, [{ kind: "oauth", name: "ado" }]);
});

test("trustProblem: a second repository claiming another project's id is untrusted while the first one is trusted", () => {
    const x = namespaceCfg();
    const y = namespaceCfg();
    assert.notEqual(x.projectRoot, y.projectRoot, "the fixture must be two repositories");
    assert.equal(x.projectId, y.projectId);
    const state = trustedStateFor(x);
    assert.equal(m.trustProblem(x, "servers", "s", state), null);
    assert.equal(m.trustProblem(y, "servers", "s", state).reason, "untrusted",
        "the id Y claims is X's, and X's record is keyed by X's root");

    const both = { schemaVersion: 1, repositories: { ...state.repositories, ...trustedStateFor(y).repositories } };
    assert.equal(m.trustProblem(y, "servers", "s", both), null, "a record for Y's own root, made by the person, lifts it");
});

test("trustRefusal: a user-scope reader's refusal names the reference, the namespace and the remedy, on one line", () => {
    const cfg = namespaceCfg();
    const root = cfg.projectRoot;
    const untrusted = m.trustRefusal("servers", "s", m.trustProblem(cfg, "servers", "s", NO_TRUST), cfg);
    assert.equal(untrusted, `server "s" (user) reads secret "pat" from namespace "proj-x", which this repository declares, and this checkout is not trusted`
        + ` -- review it, then run "vc-secrets trust" in ${root}`);

    const moved = trustedStateFor(cfg);
    moved.repositories[root].projectId = "proj-other";
    assert.equal(m.trustRefusal("servers", "s", m.trustProblem(cfg, "servers", "s", moved), cfg),
        `server "s" (user) reads secret "pat" from namespace "proj-x", and the projectId changed since you trusted this checkout:`
        + ` projectId is "proj-x", trusted "proj-other" -- review it, then run "vc-secrets trust" again in ${root}`);

    for (const text of [untrusted, m.trustRefusal("servers", "s", m.trustProblem(cfg, "servers", "s", moved), cfg)]) {
        assert.doesNotMatch(text, /\n/);
        assert.doesNotMatch(text, /declared by/, "the entry is the person's own, so no file is blamed");
    }
    const oauth = namespaceOauthCfg();
    assert.match(m.trustRefusal("servers", "s", m.trustProblem(oauth, "servers", "s", NO_TRUST), oauth),
        /^server "s" \(user\) reads oauth "ado" from namespace "proj-x", which this repository declares/);
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

test("trustAssessment: a user-scope reader is a finding like a repository launchable, and an unreadable trust file refuses it too", () => {
    const cfg = namespaceCfg();
    const result = m.trustAssessment(cfg, () => NO_TRUST);
    assert.deepEqual([...result.problems.keys()], ["servers/s"]);
    assert.deepEqual(result.findings, [`server "s" (user) reads secret "pat" from namespace "proj-x", which this repository declares, `
        + `and this checkout is not trusted -- review it, then run "vc-secrets trust" in ${cfg.projectRoot}`]);
    assert.deepEqual(m.trustAssessment(cfg, () => trustedStateFor(cfg)).findings, []);

    const failure = new m.VcSecretsError("the trust file /x/trust.json is unusable (not an object)");
    const unreadable = m.trustAssessment(cfg, () => { throw failure; });
    assert.deepEqual([...unreadable.problems.keys()], ["servers/s"]);
    assert.deepEqual(unreadable.findings, [failure.message]);
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

test("a user-scope server reading a repository's namespace: the real run, doctor and emit-config say so, and trust lifts it",
    { skip: process.platform === "win32" && "writes a user file under a fixture HOME" }, () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-ns-repo-"));
        tmpDirs.push(root);
        fs.mkdirSync(path.join(root, ".claude"));
        fs.writeFileSync(path.join(root, ".claude", m.CONFIG_NAME), JSON.stringify({ projectId: "proj-x", secrets: { pat: { backend: "local" } } }));
        const env = launcherEnv({ VC_SECRETS_LOCAL_BACKEND: "gpg" });
        fs.mkdirSync(path.join(env.HOME, ".claude"));
        fs.writeFileSync(path.join(env.HOME, ".claude", m.CONFIG_NAME), JSON.stringify({ servers: { s: NS_SERVER } }));
        const verb = (...args) => spawnSync(process.execPath, [LAUNCHER_PATH, ...args], { cwd: root, env, encoding: "utf8" });

        const refused = verb("run", "s");
        assert.equal(refused.status, 1);
        assert.match(refused.stderr, /vc-secrets: server "s" \(user\) reads secret "pat" from namespace "proj-x", which this repository declares, and this checkout is not trusted -- review it, then run "vc-secrets trust" in /);
        assert.match(verb("doctor").stderr, /^FAIL server "s" \(user\) reads secret "pat" from namespace "proj-x"/m);
        assert.match(verb("emit-config", "claude-code").stderr,
            /emit-config: s: reads secret "pat" from namespace "proj-x", which this repository declares and is not trusted yet -- run "vc-secrets trust" before starting it/);

        seedTrust(env, root);
        const trusted = verb("run", "s");
        assert.doesNotMatch(trusted.stderr, /not trusted/, "the gate is lifted");
        assert.match(trusted.stderr, /secret "pat" not set/, "and the launch went on to the keystore, where the control fails for want of a value");
        assert.doesNotMatch(verb("doctor").stderr, /reads secret "pat" from namespace/);
    });

// cmdTrust: what the person is shown and what is recorded for a user-scope reader. `reader` is the user
// server `s` of namespaceCfg; `gh` is a launchable the repository declares itself.
function mixedNamespaceCfg() {
    return m.loadConfig(withOwnRoot(scopedPaths({
        user: { servers: { s: NS_SERVER } },
        project: { projectId: "proj-x", secrets: { pat: { backend: "local" } }, servers: { gh: TRUST_BASE } } })));
}

test("cmdTrust: a repository whose only gated consumers are user-scope readers is recorded with its projectId, and says what it recorded", async () => {
    const cfg = namespaceCfg();
    const env = trustEnv();
    let shown = null;
    const { seams, log } = trustSeams(env, { beforeAnswer: () => { shown = log.join(""); } });
    await m.cmdTrust(cfg, seams);

    assert.deepEqual(m.readTrustState(env).repositories[cfg.projectRoot],
        { trustedAt: "2001-02-03T04:05:06.000Z", projectId: "proj-x", servers: {}, tasks: {} },
        "no launchShape for a launchable that is the person's own");
    assert.ok(shown.includes('server "s" (user) will read secret "pat" from namespace "proj-x"'), `shown before the prompt:\n${shown}`);
    assert.ok(shown.includes("projectId: proj-x"));
    const after = log.join("");
    assert.match(after, /recorded .* as the source of namespace "proj-x" -- it declares no server or task of its own to run/);
    assert.match(after, /1 user-scope launchable\(s\) may now read namespace "proj-x"/);
    assert.doesNotMatch(after, /trusted 0 server/);
    assert.equal(m.trustProblem(cfg, "servers", "s", m.readTrustState(env)), null);
});

test("cmdTrust: a repository with launchables of its own AND a user-scope reader shows both, and records the shape of its own only", async () => {
    const cfg = mixedNamespaceCfg();
    const env = trustEnv();
    let shown = null;
    const { seams, log } = trustSeams(env, { beforeAnswer: () => { shown = log.join(""); } });
    await m.cmdTrust(cfg, seams);

    assert.match(shown, /server "gh" \(project, .*\)\n {4}command: "npx"/);
    assert.ok(shown.includes('server "s" (user) will read secret "pat" from namespace "proj-x"'), shown);
    const record = m.readTrustState(env).repositories[cfg.projectRoot];
    assert.deepEqual(Object.keys(record.servers), ["gh"], "the reader is not a repository launchable");
    assert.match(log.join(""), /trusted 1 server\(s\) and 0 task\(s\) for /);
});

test("cmdTrust: an oauth reader is shown by its own reference", async () => {
    const cfg = namespaceOauthCfg();
    const env = trustEnv();
    let shown = null;
    const { seams, log } = trustSeams(env, { beforeAnswer: () => { shown = log.join(""); } });
    await m.cmdTrust(cfg, seams);
    assert.ok(shown.includes('server "s" (user) will read oauth "ado" from namespace "proj-x"'), shown);
});

test("cmdTrust: another root already recorded under this projectId is called out before the prompt, in every review that has a reader", async () => {
    const worktree = { trustedAt: "2000-01-01T00:00:00.000Z", projectId: "proj-x", servers: {}, tasks: {} };
    const info = 'INFO namespace "proj-x" is already recorded for /work/other-checkout -- expected for a worktree of this repository, not for another repository';
    for (const [what, cfg] of [["a secrets-only repository", namespaceCfg()], ["one with launchables of its own", mixedNamespaceCfg()]]) {
        const env = trustEnv();
        m.writeTrustState(env, { schemaVersion: 1, repositories: { "/work/other-checkout": worktree } });
        let shown = null;
        const { seams, log } = trustSeams(env, { beforeAnswer: () => { shown = log.join(""); } });
        await m.cmdTrust(cfg, seams);
        assert.ok(shown.includes(info), `${what}:\n${shown}`);
        assert.ok(shown.indexOf(info) > shown.indexOf('(user) will read secret "pat"'), "after the reader lines, before the prompt");

        // Not for another projectId, and not for this root's own earlier record.
        const quiet = trustEnv();
        m.writeTrustState(quiet, { schemaVersion: 1, repositories: {
            "/work/other-checkout": { ...worktree, projectId: "proj-else" }, [cfg.projectRoot]: worktree } });
        let quietShown = null;
        const q = trustSeams(quiet, { beforeAnswer: () => { quietShown = q.log.join(""); } });
        await m.cmdTrust(cfg, q.seams);
        assert.doesNotMatch(quietShown, /^INFO namespace/m, what);
    }
});

test("cmdTrust: no INFO about a shared namespace when the repository has no user-scope reader", async () => {
    const cfg = trustCfg();
    const env = trustEnv();
    m.writeTrustState(env, { schemaVersion: 1, repositories: {
        "/work/other-checkout": { trustedAt: "2000-01-01T00:00:00.000Z", projectId: "proj-x", servers: {}, tasks: {} } } });
    let shown = null;
    const { seams, log } = trustSeams(env, { beforeAnswer: () => { shown = log.join(""); } });
    await m.cmdTrust(cfg, seams);
    assert.doesNotMatch(shown, /INFO namespace|will read/);
});

test("cmdTrust and untrust: a repository that no longer has a reader loses the record it had for one, and untrust removes it outright", async () => {
    const cfg = namespaceCfg();
    const env = trustEnv();
    await m.cmdTrust(cfg, trustSeams(env).seams);
    assert.ok(Object.hasOwn(m.readTrustState(env).repositories, cfg.projectRoot));

    const gone = namespaceCfg({ secrets: {} });
    gone.projectRoot = cfg.projectRoot;
    const log = [];
    await m.cmdTrust(gone, { ...trustSeams(env).seams, log: (text) => log.push(text) });
    assert.ok(!Object.hasOwn(m.readTrustState(env).repositories, cfg.projectRoot), "nothing is gated any more, so the record goes");
    assert.match(log.join(""), /removed its trust record/);

    await m.cmdTrust(cfg, trustSeams(env).seams);
    await m.cmdUntrust(cfg.projectRoot, { env, log: () => {} });
    assert.deepEqual(m.readTrustState(env).repositories, {});
    assert.notEqual(m.trustProblem(cfg, "servers", "s", m.readTrustState(env)), null);
});

// ── a repository's namespace under set, login, logout and doctor ────────────────────────────────────
//
// What `set`, `login` and `logout` write or delete, and `doctor` reads, is `vc-secrets:<projectId>:<name>` for
// anything a repository declares -- and the projectId is the repository's own claim, another project's
// included. The launch is held to a trust record for the root (trustGateOf); these verbs are held to the same
// one, by the same predicate (namespaceTrustProblem). A person's own declaration lives under `user` and is
// never held to it.

const POSIX_STUB_ONLY = { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" };

// A repository on disk, found the way a real run finds it: by walking up from its working directory.
function namespaceRepo(project, local) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-ns-store-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".claude"));
    fs.writeFileSync(path.join(root, ".claude", m.CONFIG_NAME), JSON.stringify(project));
    if (local !== undefined) {
        fs.writeFileSync(path.join(root, ".claude", m.LOCAL_CONFIG_NAME), JSON.stringify(local));
    }

    return root;
}

// Every call made to a `security` stub on PATH, so that "the keystore was not touched" is observed and not
// inferred. A read answers with a value, so a secret the verb read reports as resolvable.
function keychainRecorder() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-recorder-"));
    tmpDirs.push(dir);
    const log = path.join(dir, "calls.log");
    const binDir = stubBinary("security", '#!/bin/sh\necho "$@" >> "$SECURITY_CALL_LOG"\n'
        + 'case "$*" in *find-generic-password*) echo a-value;; esac\nexit 0\n');

    return {
        env: { VC_SECRETS_LOCAL_BACKEND: "keychain", USER: "recorder", SECURITY_CALL_LOG: log,
            PATH: `${binDir}${path.delimiter}${process.env.PATH}` },
        calls: () => (fs.existsSync(log) ? fs.readFileSync(log, "utf8").split("\n").filter(Boolean) : []),
    };
}

const runVerb = (env, cwd, ...args) => spawnSync(process.execPath, [LAUNCHER_PATH, ...args], { cwd, env, encoding: "utf8", timeout: 30_000 });

// The user's own declaration file, under the fixture HOME the launcher will read it from.
function writeUserDeclarations(env, declarations) {
    fs.mkdirSync(path.join(env.HOME, ".claude"), { recursive: true });
    fs.writeFileSync(path.join(env.HOME, ".claude", m.CONFIG_NAME), JSON.stringify(declarations));
}

function corruptTrustFile(env) {
    const file = m.trustFilePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ corrupt");

    return file;
}

const NS_PAT_PROJECT = { projectId: "proj-x", secrets: { pat: { backend: "local" } } };

test("namespaceDeclarations: only what a repository stores in its own namespace -- a local secret or an oauth entry, from either of its files",
    () => {
        const cfg = m.loadConfig(withOwnRoot(scopedPaths({
            user: { secrets: { mine: { backend: "local" } }, oauth: { own: OAUTH_DECL } },
            project: { projectId: "proj-x", secrets: { pat: { backend: "local" }, kv: KV_PAT } },
            local: { oauth: { ado: OAUTH_DECL } },
        })));
        assert.deepEqual(m.namespaceDeclarations(cfg), [{ kind: "secret", name: "pat" }, { kind: "oauth", name: "ado" }],
            "not the person's own, not a Key Vault secret");
        assert.deepEqual(m.namespaceDeclarations(m.loadConfig(scopedPaths({ user: { secrets: { mine: { backend: "local" } } } }))), []);
    });

test("namespaceTrustProblem: the one rule behind the launch gate, whichever references put the namespace in play", () => {
    const cfg = namespaceCfg();
    const state = trustedStateFor(cfg);
    assert.equal(m.namespaceTrustProblem(cfg, state, SECRET_PAT), null);
    assert.deepEqual(m.namespaceTrustProblem(cfg, NO_TRUST, SECRET_PAT), { reason: "untrusted", reads: SECRET_PAT });
    state.repositories[cfg.projectRoot].projectId = "proj-other";
    assert.deepEqual(m.namespaceTrustProblem(cfg, state, SECRET_PAT),
        { reason: "changed", differences: ['projectId is "proj-x", trusted "proj-other"'], reads: SECRET_PAT });
    // The launch gate adds only who the reader is -- the rule itself is not restated there.
    assert.deepEqual(m.trustProblem(cfg, "servers", "s", state),
        { ...m.namespaceTrustProblem(cfg, state, SECRET_PAT), home: "user", shadowsUser: false });
});

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

test("set: a repository's local secret is stored only once this checkout is trusted for its namespace, and the refusal comes before the keystore",
    POSIX_STUB_ONLY, () => {
        const recorder = keychainRecorder();
        const env = launcherEnv(recorder.env);
        const root = namespaceRepo(NS_PAT_PROJECT);

        const untrusted = runVerb(env, root, "set", "pat");
        assert.equal(untrusted.status, 1, untrusted.stderr);
        assert.equal(untrusted.stderr, `vc-secrets: secret "pat" is stored in namespace "proj-x", which this repository declares, `
            + `and this checkout is not trusted -- review it, then run "vc-secrets trust" in ${m.trustRootKey(root)}\n`);
        assert.deepEqual(recorder.calls(), [], "refused before the keystore, and before a value was asked for");

        seedTrust(env, root);
        const trusted = runVerb(env, root, "set", "pat");
        assert.equal(trusted.status, 0, trusted.stderr);
        assert.ok(recorder.calls().some((call) => call.includes("-s vc-secrets:proj-x:pat")),
            "the control: with the record the same verb reaches the keystore");

        // The id the record pins is the id in play: the same root, declaring another namespace now.
        const before = recorder.calls().length;
        fs.writeFileSync(path.join(root, ".claude", m.CONFIG_NAME),
            JSON.stringify({ projectId: "proj-y", secrets: { pat: { backend: "local" } } }));
        const moved = runVerb(env, root, "set", "pat");
        assert.equal(moved.status, 1, moved.stderr);
        assert.equal(moved.stderr, `vc-secrets: secret "pat" is stored in namespace "proj-y", and the projectId changed since you trusted `
            + `this checkout: projectId is "proj-y", trusted "proj-x" -- review it, then run "vc-secrets trust" again in ${m.trustRootKey(root)}\n`);
        assert.equal(recorder.calls().length, before);
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

test("set: repository Y claiming X's projectId is refused while X is trusted, and a record for Y's own root lifts it", POSIX_STUB_ONLY, () => {
    const recorder = keychainRecorder();
    const env = launcherEnv(recorder.env);
    const x = namespaceRepo(NS_PAT_PROJECT);
    const y = namespaceRepo(NS_PAT_PROJECT);
    assert.notEqual(m.trustRootKey(x), m.trustRootKey(y));
    seedTrust(env, x);
    assert.equal(runVerb(env, x, "set", "pat").status, 0, "X is trusted, and stores its own secret");
    const stored = recorder.calls().length;

    const refused = runVerb(env, y, "set", "pat");
    assert.equal(refused.status, 1, refused.stderr);
    assert.match(refused.stderr, /secret "pat" is stored in namespace "proj-x", which this repository declares, and this checkout is not trusted/,
        "the record is keyed by X's root, and Y cannot claim that");
    assert.equal(recorder.calls().length, stored, "Y's set did not overwrite X's secret");

    seedTrust(env, y);
    assert.equal(runVerb(env, y, "set", "pat").status, 0, "the person's own record for Y lifts it");
});

test("set, login and logout: the in-process refusal is the same rule, for X's namespace claimed by Y", async () => {
    const x = namespaceOauthCfg();
    const y = namespaceOauthCfg();
    assert.equal(x.projectId, y.projectId);
    assert.notEqual(x.projectRoot, y.projectRoot);
    const seams = namespaceStoreSeams();
    const refused = (e) => {
        assert.ok(e instanceof m.VcSecretsError);
        assert.match(e.message, /is stored in namespace "proj-x", which this repository declares, and this checkout is not trusted/);

        return true;
    };
    const state = trustedStateFor(x);
    await assert.rejects(() => m.cmdSet("pat", namespaceCfg({ projectId: "proj-x" }), { trustState: state }), refused);
    await assert.rejects(() => m.cmdLogin("ado", y, { ...seams.login, trustState: state }), refused);
    await assert.rejects(() => m.cmdLogout("ado", y, { ...seams.logout, trustState: state }), refused);
    assert.deepEqual(seams.calls, [], "X's sign-in was neither replaced nor removed");
    // The control, so the refusals above are not the fixture failing for another reason.
    await m.cmdLogout("ado", x, { ...seams.logout, trustState: state });
    assert.equal(seams.calls.filter((call) => call.startsWith("remove ")).length, 2);
});

// The seams cmdLogin and cmdLogout take, recording every call that reaches outside the process. An empty
// record is "nothing was started": no listener, no browser, no lock, no write, no deletion.
function namespaceStoreSeams() {
    const calls = [];
    const lock = async () => {
        calls.push("acquireLock");

        return { release: async () => { calls.push("release"); } };
    };

    return {
        calls,
        login: {
            listen: async () => {
                calls.push("listen");

                return { port: 51234, next: async () => ({ code: "the-code" }), close: async () => {} };
            },
            open: () => { calls.push("open"); },
            exchange: async () => {
                calls.push("exchange");

                return { refreshToken: "new-rt", accessToken: "at", expiresAt: 1_703_600_000,
                    obtainedAt: 1_700_000_000, lifetimeMs: 3600_000, uptimeAtIssue: 1000 };
            },
            writeEntry: async (name) => { calls.push(`write ${name}`); },
            removeEntry: async (name) => { calls.push(`remove ${name}`); },
            oversize: { record: () => {}, clear: () => {} },
            randomState: () => "STATE",
            log: () => {},
            backend: "gpg",
            acquireLock: lock,
        },
        logout: {
            deleteEntry: async (name) => { calls.push(`remove ${name}`); },
            backend: "gpg",
            acquireLock: lock,
            log: () => {},
        },
    };
}

test("login and logout: a repository's oauth entry is refused without this checkout's trust, before any listener, sign-in, lock or deletion", async () => {
    const cfg = namespaceOauthCfg();
    const moved = trustedStateFor(cfg);
    moved.repositories[cfg.projectRoot].projectId = "proj-other";
    const cases = [
        ["no record", NO_TRUST, /oauth "ado" is stored in namespace "proj-x", which this repository declares, and this checkout is not trusted -- review it, then run "vc-secrets trust" in /],
        ["a changed projectId", moved, /oauth "ado" is stored in namespace "proj-x", and the projectId changed since you trusted this checkout: projectId is "proj-x", trusted "proj-other" -- review it, then run "vc-secrets trust" again in /],
    ];
    for (const [what, trustState, pattern] of cases) {
        const seams = namespaceStoreSeams();
        const matches = (e) => {
            assert.match(e.message, pattern);

            return true;
        };
        await assert.rejects(() => m.cmdLogin("ado", cfg, { ...seams.login, trustState }), matches, `login, ${what}`);
        await assert.rejects(() => m.cmdLogout("ado", cfg, { ...seams.logout, trustState }), matches, `logout, ${what}`);
        assert.deepEqual(seams.calls, [], `${what}: nothing was started`);
    }

    // The controls: with the record, the same calls run.
    const trustState = trustedStateFor(cfg);
    const login = namespaceStoreSeams();
    await m.cmdLogin("ado", cfg, { ...login.login, trustState });
    assert.ok(login.calls.includes("listen"));
    assert.equal(login.calls.filter((call) => call.startsWith("write ")).length, 2, "both entries were stored");
    const logout = namespaceStoreSeams();
    await m.cmdLogout("ado", cfg, { ...logout.logout, trustState });
    assert.equal(logout.calls.filter((call) => call.startsWith("remove ")).length, 2);
});

test("login: the acknowledgement of the app registration is checked as before, ahead of the trust the namespace needs", async () => {
    // Both are refusals with no side effect, and the acknowledgement is the one a repository's declaration
    // has always met first: its remedy (a block in the person's own file) is unchanged by this one.
    const cfg = namespaceOauthCfg({ grant: false });
    const seams = namespaceStoreSeams();
    await assert.rejects(() => m.cmdLogin("ado", cfg, { ...seams.login, trustState: NO_TRUST }), /not authorized/);
    assert.deepEqual(seams.calls, []);
});

test("login and logout: with no seam the trust file is read -- a corrupt one stops a repository's entry and never the person's own", async () => {
    const env = trustEnv();
    const file = corruptTrustFile(env);
    const repository = namespaceOauthCfg();
    const own = m.loadConfig(scopedPaths({ user: { oauth: { ado: OAUTH_DECL } } }));
    await withProcessEnv(env, async () => {
        const seams = namespaceStoreSeams();
        const unreadable = (e) => {
            assert.ok(e.message.includes(file), e.message);

            return true;
        };
        await assert.rejects(() => m.cmdLogin("ado", repository, seams.login), unreadable);
        await assert.rejects(() => m.cmdLogout("ado", repository, seams.logout), unreadable);
        assert.deepEqual(seams.calls, [], "an unreadable file counts as not trusted");

        const mine = namespaceStoreSeams();
        await m.cmdLogin("ado", own, mine.login);
        await m.cmdLogout("ado", own, mine.logout);
        assert.ok(mine.calls.includes("listen") && mine.calls.includes("acquireLock"),
            "the person's own entry never consults the file, so a corrupt one cannot stop them managing it");
    });
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

test("trustNotes: an oauth reader's note names the entry and the namespace too", () => {
    const cfg = namespaceOauthCfg();
    assert.deepEqual(m.trustNotes(cfg, m.trustAssessment(cfg, () => NO_TRUST)),
        ['s: reads oauth "ado" from namespace "proj-x", which this repository declares and is not trusted yet -- run "vc-secrets trust" before starting it']);
});

test("cmdTrust: a repository that only declares a local secret or an oauth entry is recorded with its projectId, and the review names them", async () => {
    const cfg = m.loadConfig(withOwnRoot(scopedPaths({
        project: { projectId: "proj-x", secrets: { pat: { backend: "local" } }, oauth: { ado: OAUTH_DECL } } })));
    const env = trustEnv();
    m.writeTrustState(env, { schemaVersion: 1, repositories: { "/work/other-checkout": {
        trustedAt: "2000-01-01T00:00:00.000Z", projectId: "proj-x", servers: {}, tasks: {} } } });
    let shown = null;
    const { seams, log } = trustSeams(env, { beforeAnswer: () => { shown = log.join(""); } });
    assert.equal(m.namespaceTrustProblem(cfg, m.readTrustState(env), m.namespaceDeclarations(cfg))?.reason, "untrusted");
    await m.cmdTrust(cfg, seams);

    assert.ok(shown.includes('secret "pat", oauth "ado" are stored in namespace "proj-x"'), shown);
    assert.ok(shown.includes('INFO namespace "proj-x" is already recorded for /work/other-checkout'), "with no reader, the same fact is shown");
    assert.deepEqual(m.readTrustState(env).repositories[cfg.projectRoot],
        { trustedAt: "2001-02-03T04:05:06.000Z", projectId: "proj-x", servers: {}, tasks: {} });
    assert.match(log.join(""), /secret "pat", oauth "ado" may now be stored and removed in namespace "proj-x"/);
    assert.equal(m.namespaceTrustProblem(cfg, m.readTrustState(env), m.namespaceDeclarations(cfg)), null, "which is what lifts set, login and logout");

    // Declining records nothing.
    const declined = trustEnv();
    await m.cmdTrust(cfg, trustSeams(declined, { answer: "n" }).seams);
    assert.deepEqual(m.readTrustState(declined).repositories, {});
});

test("cmdTrust: a person's own declarations need no record, and the record goes with the last entry the repository stores", async () => {
    const own = m.loadConfig(withOwnRoot(scopedPaths({ user: { secrets: { mine: { backend: "local" } }, oauth: { ado: OAUTH_DECL } } })));
    const env = trustEnv();
    const log = [];
    await m.cmdTrust(own, { ...trustSeams(env).seams, log: (text) => log.push(text) });
    assert.match(log.join(""), /nothing in .* needs trust/);
    assert.deepEqual(m.readTrustState(env).repositories ?? {}, {});

    const declaring = m.loadConfig(withOwnRoot(scopedPaths({ project: { projectId: "proj-x", secrets: { pat: { backend: "local" } } } })));
    await m.cmdTrust(declaring, trustSeams(env).seams);
    assert.ok(Object.hasOwn(m.readTrustState(env).repositories, declaring.projectRoot));
    const gone = m.loadConfig(withOwnRoot(scopedPaths({ project: { projectId: "proj-x", secrets: { pat: KV_PAT } } })));
    gone.projectRoot = declaring.projectRoot;
    const removal = [];
    await m.cmdTrust(gone, { ...trustSeams(env).seams, log: (text) => removal.push(text) });
    assert.ok(!Object.hasOwn(m.readTrustState(env).repositories, declaring.projectRoot), "nothing is stored in the namespace any more");
    assert.match(removal.join(""), /removed its trust record/);
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

// ── the two namespace touches that are not a read of an entry: doctor's write probe and unlock ───────
//
// The probe writes and then deletes a key of its own; `unlock` existence-checks and test-decrypts the entries
// a repository declares. Both build keys from the repository's projectId, so both stand behind the same
// predicate as the verbs above (namespaceTrustProblem).

const PROBE_CLAIMED = `${m.KEY_PREFIX}:proj-x:${m.WRITE_PROBE_NAME}`;
const PROBE_USER = `${m.KEY_PREFIX}:user:${m.WRITE_PROBE_NAME}`;

async function probeKeys(cfg, extra = {}) {
    const keys = { written: [], removed: [], values: [] };
    await m.probeKeystoreWrite({ backend: "keychain", cfg, ...extra,
        write: async (key, value) => { keys.written.push(key); keys.values.push(value); },
        remove: async (key) => { keys.removed.push(key); } });

    return keys;
}

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

async function unlockRun(cfg, { trustState = null, extraEnv = {} } = {}) {
    const checked = [];
    const decrypted = [];
    const out = [];
    await withProcessEnv({ VC_SECRETS_LOCAL_BACKEND: "gpg", GPG_TTY: "/dev/null", ...extraEnv }, () => m.cmdUnlock(cfg, {
        exists: (file) => { checked.push(file); return true; },
        run: async (spec) => { decrypted.push(spec.args.at(-1)); },
        write: (text) => out.push(text),
        ...(trustState === null ? {} : { trustState }),
    }));

    return { checked, decrypted, out: out.join("") };
}

function unlockCfg() {
    return m.loadConfig(withOwnRoot(scopedPaths({
        user: { secrets: { mine: { backend: "local" } } },
        project: { projectId: "proj-x", secrets: { pat: { backend: "local" } }, oauth: { ado: OAUTH_DECL } },
    })));
}

const keyFilesIn = (cfg, files) => files.filter((file) => file.includes(`${m.KEY_PREFIX}-proj-x-`) || file.includes("proj-x"));

test("unlock: a repository's namespace is neither checked nor decrypted in a checkout that is not trusted for it, and says so",
    async () => {
        const cfg = unlockCfg();
        const result = await unlockRun(cfg, { trustState: NO_TRUST });
        assert.deepEqual(keyFilesIn(cfg, result.checked), [], `no existence check in the claimed namespace:\n${result.checked.join("\n")}`);
        assert.deepEqual(keyFilesIn(cfg, result.decrypted), []);
        assert.ok(result.checked.some((file) => file.includes("mine")), "the person's own entry is still checked");
        assert.equal(result.decrypted.length, 1);
        assert.ok(result.out.includes('SKIP secret "pat" not checked -- this checkout is not trusted for namespace "proj-x"\n'), result.out);
        assert.ok(result.out.includes('SKIP oauth "ado" not checked -- this checkout is not trusted for namespace "proj-x"\n'), result.out);
        assert.match(result.out, /gpg agent warmed \(1 entry\)/);
    });

test("unlock: once the checkout is trusted for the namespace, the repository's entries are checked and decrypted as before", async () => {
    const cfg = unlockCfg();
    const result = await unlockRun(cfg, { trustState: trustedStateFor(cfg) });
    assert.doesNotMatch(result.out, /SKIP/);
    assert.equal(keyFilesIn(cfg, result.checked).length > 0, true);
    assert.equal(result.decrypted.length, 4, "mine, pat, and the sign-in's refresh and access");
    assert.match(result.out, /gpg agent warmed \(4 entries\)/);

    // A recorded root with another project's id is not trusted for THIS one.
    const claimed = trustedStateFor(cfg);
    claimed.repositories[cfg.projectRoot].projectId = "proj-y";
    const changed = await unlockRun(cfg, { trustState: claimed });
    assert.deepEqual(keyFilesIn(cfg, changed.checked), []);
    assert.match(changed.out, /SKIP secret "pat" not checked/);
});

test("unlock: an unreadable trust file counts as not trusted, is named once, and the repository's entries are not touched", async () => {
    const cfg = unlockCfg();
    const env = launcherEnv();
    const file = corruptTrustFile(env);
    const result = await unlockRun(cfg, { extraEnv: { HOME: env.HOME, USERPROFILE: env.USERPROFILE, XDG_CONFIG_HOME: env.XDG_CONFIG_HOME } });
    assert.equal(result.out.split(file).length - 1, 1, `the file is named once:\n${result.out}`);
    assert.deepEqual(keyFilesIn(cfg, result.checked), []);
    assert.match(result.out, /SKIP secret "pat" not checked/);
});

test("unlock: a config with nothing in a repository's namespace never reads the trust file, whatever it holds", async () => {
    const env = launcherEnv();
    corruptTrustFile(env);
    const seam = { HOME: env.HOME, USERPROFILE: env.USERPROFILE, XDG_CONFIG_HOME: env.XDG_CONFIG_HOME };
    const userOnly = m.loadConfig(scopedPaths({ user: { secrets: { mine: { backend: "local" } }, oauth: { ado: OAUTH_DECL } } }));
    const quiet = m.loadConfig(withOwnRoot(scopedPaths({
        user: { secrets: { mine: { backend: "local" } } }, project: { projectId: "proj-x", secrets: { kv: KV_PAT } } })));
    for (const [what, cfg] of [["a user-only config", userOnly], ["a repository that declares nothing in its namespace", quiet]]) {
        const result = await unlockRun(cfg, { extraEnv: seam });
        assert.doesNotMatch(result.out, /trust|SKIP/i, `${what}: ${result.out}`);
        assert.ok(result.decrypted.length >= 1, what);
    }
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

// A repository on disk, found the way a real run finds it: by walking up from its working directory.
function trustRepo(servers) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-trust-repo-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".claude"));
    fs.writeFileSync(path.join(root, ".claude", m.CONFIG_NAME), JSON.stringify({ secrets: {}, servers }));

    return root;
}

test("doctor: an untrusted repository server is a FAIL with the remedy, a trusted one is not mentioned, and a corrupt trust file is one FAIL", () => {
    const root = trustRepo({ s: { command: "true", args: [], env: {} } });
    // gpg because it is the one backend `doctor` does not write-probe, as the tests above choose it.
    const env = launcherEnv({ VC_SECRETS_LOCAL_BACKEND: "gpg" });
    const doctor = () => spawnSync(process.execPath, [LAUNCHER_PATH, "doctor"], { cwd: root, env, encoding: "utf8" });

    const untrusted = doctor();
    assert.equal(untrusted.status, 1);
    assert.match(untrusted.stderr, /^FAIL server "s" is declared by .* and is not trusted -- review it, then run "vc-secrets trust" in /m);

    seedTrust(env, root);
    assert.doesNotMatch(doctor().stderr, /is not trusted|changed since you trusted/, "a trusted launchable adds no line");

    const file = m.trustFilePath(env);
    fs.writeFileSync(file, "{ corrupt");
    const corrupt = doctor();
    const failures = corrupt.stderr.split("\n").filter((l) => l.startsWith("FAIL") && l.includes(file));
    assert.equal(failures.length, 1, `one FAIL naming the file:\n${corrupt.stderr}`);
    assert.match(corrupt.stderr, /INFO config files loaded/, "and doctor carried on");
});

test("childNodeProbes: `refused` is required, so a caller cannot forget it", () => {
    const cfg = { servers: { s: { command: "npx" } }, tasks: {} };
    const refs = [{ kind: "servers", launchableName: "s" }];
    const probe = () => { throw new Error("probed without being told what is refused"); };
    assert.throws(() => m.childNodeProbes(cfg, refs, { probe }), /needs `refused`/);
    assert.throws(() => m.childNodeProbes(cfg, refs), /needs `refused`/);
    assert.throws(() => m.childNodeProbes(cfg, refs, { probe, refused: [] }), /needs `refused`/, "a Map, not just something iterable");
});

// The real verb, because the two halves are each tested alone above and nothing else notices the wire
// between them: doctor hands childNodeProbes the trust gate's problems, and a doctor that stopped doing so
// would EXECUTE the declared command of a repository nobody trusted, to ask it for a version. The command
// is a script that leaves a marker, standing in for whatever a hostile declaration would do.
test("doctor: an untrusted repository's declared node is not run to ask its version, a trusted one is",
    { skip: process.platform === "win32" && "a #!/bin/sh script is not executable by a shell-less win32 spawn" },
    () => {
        const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-doctor-probe-"));
        tmpDirs.push(root);
        fs.mkdirSync(path.join(root, ".claude"));
        fs.mkdirSync(path.join(root, "bin"));
        const marker = path.join(root, "probe-ran");
        const script = path.join(root, "bin", "node");
        fs.writeFileSync(script, `#!/bin/sh\necho ran > '${marker}'\necho v22.0.0\n`);
        fs.chmodSync(script, 0o755);
        fs.writeFileSync(path.join(root, ".claude", m.CONFIG_NAME), JSON.stringify({
            projectId: "proj-x", secrets: {}, oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "./bin/node", args: [], env: { TOKEN: "oauth:ado" } } },
        }));
        // gpg because it is the one backend `doctor` does not write-probe, as the tests above choose it.
        const env = launcherEnv({ VC_SECRETS_LOCAL_BACKEND: "gpg" });
        const doctor = () => spawnSync(process.execPath, [LAUNCHER_PATH, "doctor"], { cwd: root, env, encoding: "utf8" });

        const untrusted = doctor();
        assert.match(untrusted.stderr, /server "s" is declared by .* and is not trusted/, "the fixture must be refused");
        assert.ok(!fs.existsSync(marker), `doctor ran the command of a repository nobody trusted:\n${untrusted.stderr}`);

        seedTrust(env, root);
        doctor();
        assert.ok(fs.existsSync(marker), "the control: once trusted, the same declaration IS probed, so the marker can appear");
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
