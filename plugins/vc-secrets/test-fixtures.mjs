// Fixtures shared by more than one test file, or tied to this file's location at the package root:
// declarations and configs, temp paths, PATH stubs, capability probes, and the module URLs a spawned
// child loads. It must not import node:test: the CI sentinel ("ci: the workflow runs every test file in
// this package, through the quoted glob") treats any other file that imports node:test as a test file
// the glob must reach, and this one is not a *.test.mjs. What needs node:test -- the socketTest, lockTest
// and channelTest wrappers, their bind probes, and the tmpDirs cleanup -- lives in test-support.mjs.

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as m from "./vc-secrets.mjs";
import * as cache from "./vc-secrets-cache.mjs";
import { tmpDirs } from "./test-support.mjs";

export const LAUNCHER_PATH = fileURLToPath(new URL("./vc-secrets.mjs", import.meta.url));

// The environment for a spawned launcher or probe. The developer's own, minus every VC_SECRETS_* knob:
// a VC_SECRETS_CONFIG_DIR in their shell would point `doctor` at their real declarations, with real
// secret reads and `az`, and VC_SECRETS_LOCAL_BACKEND would pick a store the test did not choose. HOME,
// USERPROFILE and XDG_CONFIG_HOME go to a fresh directory so that no FILE-based state a run reaches --
// the gpg files and the trust file under XDG_CONFIG_HOME -- is the developer's. That does not reach the
// wcm and keychain entries: they live in the operating system's store, not under any of those
// variables, so a test that can touch them pins the backend (as the doctor tests do) or stubs the tool
// on PATH. Both HOME and USERPROFILE for the reason shimEnv gives; a test that means to use a fixture
// home passes it in `extra`, which lands last.
export function launcherEnv(extra = {}) {
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
export function denyFs(t, method, denied) {
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
// the same shape the socket, lock and channel wrappers use in test-support.mjs. An absent
// capability is not a failure; an absent capability that reports as one is, because it buries the real
// regressions it is mixed in with. Each reason names the missing THING rather than the platform, so a
// machine that later grows the capability starts running the test without anyone editing a condition.
export function probe(fn) {
    try {
        return fn();
    } catch {
        return false;
    }
}

export const probeDir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-probe-"));

tmpDirs.push(probeDir);

// A directory link. Windows creates a true symlink only in Developer Mode or elevated (otherwise
// fs.symlinkSync raises EPERM), but a junction needs no privilege, so it is what the tests use there. A
// junction takes an absolute target -- every one the tests pass is -- and behaves as a link for what these
// tests read: realpath resolves it, and libuv reports any reparse point as a link to readdir, so
// Dirent.isSymbolicLink() is true for one. The probe stays, so a machine that truly cannot link skips.
export const LINK_TYPE = process.platform === "win32" ? "junction" : "dir";

export const CAN_SYMLINK = probe(() => {
    const dest = path.join(probeDir, "sym-dest");
    fs.mkdirSync(dest, { recursive: true });
    fs.symlinkSync(dest, path.join(probeDir, "sym-link"), LINK_TYPE);

    return true;
});

// NTFS ignores POSIX mode bits, so `chmod 000` denies nothing there. The probe checks that the denial
// actually HAPPENS rather than that chmod returned -- a test built on the call alone asserts the
// opposite of what it reads as, and passes by reading a file it claims is unreadable.
export const CAN_DENY_BY_MODE = probe(() => {
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
export const CAN_RUN_POSIX_STUB = process.platform !== "win32"
    || probe(() => spawnSync("sh", ["-c", "exit 0"]).status === 0);

// Writes a single project-scope declaration file and returns its containing directory — for tests
// that only care about VC_SECRETS_CONFIG_DIR-style single-home config (most structural checks).
export function tmpConfigDir(cfg) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-"));
    tmpDirs.push(dir);
    fs.writeFileSync(path.join(dir, m.CONFIG_NAME), JSON.stringify(cfg));
    return dir;
}

// Same, but returns the {user, project, local} paths object loadConfig now takes directly.
export function projectPaths(cfg) {
    return { user: null, project: path.join(tmpConfigDir(cfg), m.CONFIG_NAME), local: null };
}

// Writes up to three homes into one tmp directory under distinct filenames and returns the paths
// object — for precedence/collision/projectId tests that need more than one scope populated.
export function scopedPaths({ user, project, local } = {}) {
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
export function trustedStateFor(cfg) {
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
export function seedTrust(env, cwd) {
    m.writeTrustState(env, trustedStateFor(m.loadConfig(m.configPaths(env, cwd))));

    return env;
}

export function trustedLauncherEnv(dir, extra = {}) {
    return seedTrust(launcherEnv({ VC_SECRETS_CONFIG_DIR: dir, ...extra }), dir);
}

export const CROSSING_SHAPE = { command: "npx", args: ["-y", "gh-mcp"], envKeys: ["T"] };

export function crossingReport(cfg) {
    return m.doctorReport(cfg, {
        env: {}, platform: "linux", enableLists: { enabled: [], disabled: [], envKeys: [] },
        resolvable: {}, skipped: [], toolsMissing: [], wired: new Set(),
    });
}

export function vaultPaths(vaults) {
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

export const OAUTH_TENANT_ID = "12345678-1234-1234-1234-123456789012";

export const OAUTH_DECL = {
    tenantId: OAUTH_TENANT_ID,
    clientId: "my-client-id",
    scopes: ["https://example.com/.default", "offline_access"],
    targetPackage: "some-oauth-package",
};

export const REGISTRATION_BLOCK = { servers: { s: { command: "npx", args: ["-y", "some-oauth-package"], envKeys: ["ADO_TOKEN"] } } };

export const OAUTH_CLIENT_ID = OAUTH_DECL.clientId;

// Two Key Vault secrets, each authorized for the one server, so the reads these tests count are ones the
// launch is entitled to make.
export function keyvaultPairCfg({ grantB = true } = {}) {
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

// Answers true only for the named files, compared the way NTFS does: case-insensitively, either slash.
export function onlyFiles(...files) {
    const wanted = files.map((f) => f.toLowerCase());

    return (p) => wanted.includes(p.toLowerCase().replace(/\\/g, "/"));
}

export const EMPTY_DECL = { secrets: {}, servers: {} };

// A project-scope sign-in WITH its registration grant in the user file, and a server whose shape
// matches what the grant authorizes — the only fixture in which an oauth reference gets past
// authorization at all.
export function authorizedOauthPaths() {
    return scopedPaths({
        user: { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: REGISTRATION_BLOCK } } },
        project: {
            projectId: "proj-x",
            oauth: { ado: OAUTH_DECL },
            servers: { s: { command: "npx", args: ["-y", "some-oauth-package"], env: { ADO_TOKEN: "oauth:ado" } } },
        },
    });
}

// A user-scope server `s` that consumes `secret:pat`, whose declaration comes from the file(s) given.
export const KV_PAT = { backend: "keyvault", vault: "demo-vault", secret: "pat-secret" };

export const KV_PAT_SHAPE = { command: "printenv", args: ["PAT"], envKeys: ["PAT"] };

export function userServerPaths({ user = {}, project }) {
    return scopedPaths({
        user: { servers: { s: { command: "printenv", args: ["PAT"], env: { PAT: "secret:pat" } } }, ...user },
        project,
    });
}

// Hex as PS_CRED_READ and PS_CRED_READ_MANY print a Credential Manager blob: UTF-8 bytes, two digits each.
export const credHex = (value) => Buffer.from(value, "utf8").toString("hex");

// A user-scope launchable, so no trust or registration is involved: the secret (when there is one) and
// the oauth entry "ado" share one scope, "user".
export function d1Config({ secretName = "pat" } = {}) {
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
export function d1LiveRun(store, reads) {
    return async (spec) => {
        const key = spec.extraEnv.VC_SECRETS_NAME;
        reads.push(key);
        if (!Object.hasOwn(store, key)) {
            throw Object.assign(new m.VcSecretsError("not found"), { toolExitCode: 3 });
        }

        return credHex(store[key]);
    };
}

export async function waitFor(condition, { timeoutMs, stepMs = 25 }) {
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

// Puts an executable stub earlier on PATH than the real binary, so a backend read can be made to fail
// in a chosen way without touching any real credential store.
// On win32 a `#!/bin/sh` body is not executable by a shell-less spawn, and resolveSpawnCommand only
// recognizes a `.cmd`/`.bat` shim there — so the body is kept as `<name>.sh` and paired with a `.cmd`
// launcher that hands it to `sh` (Git Bash, present on GitHub's windows-latest runners), forwarding
// arguments and the child's exit code. `platform` defaults to process.platform but takes an explicit
// value so the win32 branch is unit-testable without faking a global.
export function stubBinary(name, script, platform = process.platform) {
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

// runTool spawns with process.env, not with the env handed to the builders, so a stub is only reachable
// by moving the real PATH aside for the duration of the call.
export async function withStubOnPath(name, script, fn) {
    const binDir = stubBinary(name, script);
    const saved = process.env.PATH;
    process.env.PATH = `${binDir}${path.delimiter}${saved}`;
    try {
        return await fn();
    } finally {
        process.env.PATH = saved;
    }
}

export const TRUST_BASE = { command: "npx", args: ["-y", "gh-mcp"], env: { T: "secret:pat", L: "literal:kept" } };

// A repository whose project file declares `servers`/`tasks` (and, optionally, a user file that does).
export function trustCfg({ servers = { gh: TRUST_BASE }, tasks = {}, user } = {}) {
    return m.loadConfig(scopedPaths({ user, project: { projectId: "proj-x", servers, tasks } }));
}

// The same config with one launchable's declaration overridden, keeping everything else -- so the trust
// record made from the ORIGINAL is compared against a changed declaration under the same root.
export function withDeclaration(cfg, kind, name, override) {
    return { ...cfg, [kind]: { ...cfg[kind], [name]: { ...cfg[kind][name], ...override } } };
}

// Fresh environment for the verbs that write the trust file: an XDG_CONFIG_HOME of its own, so the
// developer's real file is never the one read or written.
export function trustEnv() {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-trust-home-"));
    tmpDirs.push(home);

    return { HOME: home, XDG_CONFIG_HOME: home };
}

export const NO_TRUST = { schemaVersion: 1, repositories: {} };

// The launch gate reads the trust file through process.env, which has no seam of its own on the
// cmdRun/cmdTask path. Restored on the way out, as the PATH-moving helpers above do.
export async function withProcessEnv(env, fn) {
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

export const NS_SERVER = { command: process.execPath, args: ["-e", ""], env: { PAT: "secret:pat" } };

export const NS_OAUTH_SERVER = { command: process.execPath, args: ["-e", ""], env: { ADO_TOKEN: "oauth:ado" } };

const NS_GRANT = { servers: { s: { command: process.execPath, args: ["-e", ""], envKeys: ["ADO_TOKEN"] } } };

// scopedPaths gives every config the same root (the parent of its temp directory), so two "repositories"
// built with it would be one. A root of its own is what makes the trust record's key mean something.
export function withOwnRoot(paths) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-ns-root-"));
    tmpDirs.push(root);

    return { ...paths, root };
}

// A user-scope server `s` that reads `secret:pat`, with the repository declaring `pat` as a local secret
// in the file named by `declaredIn`. The repository declares no launchable of its own.
export function namespaceCfg({ projectId = "proj-x", declaredIn = "project", user = {}, secrets = { pat: { backend: "local" } } } = {}) {
    return m.loadConfig(withOwnRoot(scopedPaths({
        user: { servers: { s: NS_SERVER }, ...user },
        project: { projectId, ...(declaredIn === "project" ? { secrets } : {}) },
        ...(declaredIn === "local" ? { local: { secrets } } : {}),
    })));
}

// The same for a sign-in: the repository declares `oauth.ado`, and the user file grants it to `s`.
export function namespaceOauthCfg({ projectId = "proj-x", grant = true } = {}) {
    return m.loadConfig(withOwnRoot(scopedPaths({
        user: { servers: { s: NS_OAUTH_SERVER },
            ...(grant ? { registrations: { [OAUTH_TENANT_ID]: { [OAUTH_CLIENT_ID]: NS_GRANT } } } : {}) },
        project: { projectId, oauth: { ado: OAUTH_DECL } },
    })));
}

export const SECRET_PAT = [{ kind: "secret", name: "pat" }];

export const POSIX_STUB_ONLY = { skip: !CAN_RUN_POSIX_STUB && "needs a POSIX shell, which the stub binary on PATH is written behind" };

// A repository on disk, found the way a real run finds it: by walking up from its working directory.
export function namespaceRepo(project, local) {
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
export function keychainRecorder() {
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

export const runVerb = (env, cwd, ...args) => spawnSync(process.execPath, [LAUNCHER_PATH, ...args], { cwd, env, encoding: "utf8", timeout: 30_000 });

export function corruptTrustFile(env) {
    const file = m.trustFilePath(env);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ corrupt");

    return file;
}

export const NS_PAT_PROJECT = { projectId: "proj-x", secrets: { pat: { backend: "local" } } };

// The seams cmdLogin and cmdLogout take, recording every call that reaches outside the process. An empty
// record is "nothing was started": no listener, no browser, no lock, no write, no deletion.
export function namespaceStoreSeams() {
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

// A repository on disk, found the way a real run finds it: by walking up from its working directory.
export function trustRepo(servers) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "vc-secrets-trust-repo-"));
    tmpDirs.push(root);
    fs.mkdirSync(path.join(root, ".claude"));
    fs.writeFileSync(path.join(root, ".claude", m.CONFIG_NAME), JSON.stringify({ secrets: {}, servers }));

    return root;
}

// The identity a cache entry must carry to match the OAuth declaration these tests exercise.
export const DECL_IDENTITY = { tenantId: "t", clientId: "c", scopes: ["scope-a", "scope-b"] };

// `kind: "oauth"` is what the merge stamps on every entry in the oauth section -- it is the
// discriminator authorizationFor branches on -- and `declaredName` names the key it was found
// under. A hand-built declaration omitting either is not one this package can ever see, and the
// two consumers of authorizationFor disagree about what its `null` means: cmdLogin reads `.block`
// off it and dies with a TypeError, while resolveEnvEntries tests
// `source !== null` and takes it as "needs no authorization". Fail-closed at one site and
// permissive at the other is the reason to match the merge rather than to guard the null.
export const LOGIN_DECL = { ...DECL_IDENTITY, kind: "oauth", scope: "project", home: "project", declaredName: "azure-mcp" };

export const LOGIN_CFG = { oauth: { "azure-mcp": LOGIN_DECL }, projectId: "login-p1", projectRoot: "/repo/login",
    registrations: { [DECL_IDENTITY.tenantId]: { [DECL_IDENTITY.clientId]: {} } } };

// A repository's entries are stored under a projectId the repository chose, so login and logout for one
// are held to a trust record for the checkout (requireNamespaceTrust). The fixtures below are about
// something else, and the repository they declare is recorded under its own root and id, as `trust`
// would; the verbs' trust behaviour is tested in lib/oauth-login.test.mjs and lib/cli.test.mjs.
export function trustedFor(cfg) {
    return { schemaVersion: 1, repositories: { [cfg.projectRoot]: {
        trustedAt: "2000-01-01T00:00:00.000Z", projectId: cfg.projectId, servers: {}, tasks: {} } } };
}

// cmdLogin's network, browser and listener are injected, which leaves its actual decisions —
// the order of the two writes above all — as ordinary assertions. This verb is ultimately proved
// by a live sign-in, and that run was blocked on an app registration for a while; the
// irreversible step inside it should not have to wait for an administrator to be covered.
export function loginDeps(overrides = {}) {
    const written = [];
    const opened = [];
    const logged = [];
    const lock = [];
    const removed = [];
    const marked = [];
    const cleared = [];
    const deps = {
        listen: async () => ({ port: 51234, next: async () => ({ code: "the-code" }), close: async () => {} }),
        open: (cmd) => { opened.push(cmd); },
        // All four timing fields differ, and expiresAt is obtainedAt + lifetimeMs rather than a
        // repeat of one of them. The source's stub leaves obtainedAt at 0, which makes expiresAt and
        // lifetimeMs the same number -- and a whole-object assertion then cannot see those two
        // transposed, which is the one transposition among the four a degenerate fixture hides.
        exchange: async () => ({ refreshToken: "new-rt", accessToken: "at", expiresAt: 1_703_600_000,
            obtainedAt: 1_700_000_000, lifetimeMs: 3600_000, uptimeAtIssue: 1000 }),
        writeEntry: async (name, value) => { written.push([name, value]); },
        randomState: () => "STATE",
        log: (line) => { logged.push(line); },
        backend: "gpg",
        // Injected like every other seam here, and not left to the default: that one binds a REAL
        // machine-global socket, so every login test would serialise against every other and
        // against any other invocation of this tool running on this machine.
        acquireLock: async () => { lock.push("acquire"); return { release: async () => { lock.push("release"); } }; },
        // Same reason as acquireLock, and it was missed here once at a real cost: the default is
        // the REAL deleteEntryIo, so a test whose refresh write fails cleared a developer's live
        // sign-in out of the actual keystore. From a GREEN run -- a delete that succeeds looks
        // like nothing at all. Both oauth entries for the affected server were present before the
        // run and gone after, with every other test still passing.
        removeEntry: async (name) => { removed.push(name); },
        // Injected for exactly the reason removeEntry is: the default WRITES and DELETES a file
        // under the developer's own config directory, and both halves run on ordinary paths --
        // `clear` on every successful login. Left to default, every login test would litter a real
        // machine from a green run.
        oversize: { record: (key, info) => { marked.push([key, info]); }, clear: (key) => { cleared.push(key); } },
        // Injected for the reason the others are: the default reads the developer's own trust file.
        trustState: trustedFor(LOGIN_CFG),
        ...overrides,
    };

    return { deps, written, opened, logged, lock, removed, marked, cleared };
}

// Depth-aware rather than line-anchored: the first version of this matched only a seam standing
// alone at an indent of exactly four, so a new seam sharing a line with another was dropped
// silently, and the guard passed covering nothing for the very case it exists for.
export function seamsOf(source) {
    const raw = source.slice(source.indexOf("{", source.indexOf("cfg,")) + 1, source.indexOf("} = {}) {"));
    // Line comments go BEFORE the split, not after it. Prose contains commas, and the comma is what
    // the split acts on: one part would end mid-sentence and the next would begin with an ordinary
    // word that reads as a seam name -- losing the real seam and inventing a phantom in its place.
    const block = raw.replace(/\/\/.*$/gm, "");
    const parts = [];
    let depth = 0;
    let current = "";
    for (const ch of block) {
        if ("([{".includes(ch)) { depth += 1; }
        if (")]}".includes(ch)) { depth -= 1; }
        if (ch === "," && depth === 0) { parts.push(current); current = ""; continue; }
        current += ch;
    }
    parts.push(current);

    // The name, whether or not a default follows it. Requiring the `=` was the same hole in a
    // second costume: a seam added WITHOUT a default vanished from the list, so the seam-list deepEqual
    // (lib/oauth-login.test.mjs) passed and the one production call site -- main, which calls
    // cmdLogin(arg, cfg) with no deps object at all -- would hand it `undefined`.
    return parts.map((part) => (/^\s*(\w+)/.exec(part) ?? [])[1]).filter(Boolean);
}

// Presence of the KEY is not injection: `Object.keys({a: undefined})` is `["a"]`, and a
// destructuring default fires on undefined, so `loginDeps({ removeEntry: undefined })` would hand
// back the real deleter with the guard green. The source's own instance of that idiom rides a test
// this package has not ported, so nothing below demonstrates it -- which is exactly why the guard
// has to state the rule rather than lean on an example.
export function definedSeams(deps) {
    // `null` counts as absent alongside `undefined`: both acquireLock and removeEntry default to
    // null in the parameter list and resolve their real implementation with `??` in the body, so a
    // seam handed in as null falls through to the machine-global socket or the real deleter exactly
    // as an omitted one does. Filtering on undefined alone would bless that shape.
    return Object.entries(deps).filter(([, value]) => value !== undefined && value !== null).map(([key]) => key);
}

// The module URLs the preload tests load, computed once from this file's own URL so they
// resolve regardless of the spawned process's working directory.
export const PRELOAD_URL = new URL("./vc-secrets-preload.mjs", import.meta.url).href;

export const TARGET_URL = new URL("./vc-secrets-target.mjs", import.meta.url).href;

// A launchable declared entirely at USER scope, so neither the oauth entry nor the server it is
// referenced from needs a registration grant (resolveEnvEntries exempts a user-scope launchable
// outright) or a projectId (keyFor and cmdLaunch's scopeKey both short-circuit on
// decl.scope === "user"). That keeps the tests using it about the launch mechanics cmdLaunch adds, not
// about the authorization machinery the resolveEnvEntries tests (lib/config.test.mjs) already cover.
export const CMD_LAUNCH_OAUTH_DECL = { ...DECL_IDENTITY, scope: "user", home: "user", kind: "oauth",
    declaredName: "ado", targetPackage: "some-oauth-package" };

export const CMD_LAUNCH_CFG = {
    projectId: null,
    oauth: { ado: CMD_LAUNCH_OAUTH_DECL },
    servers: { s: { command: "npx", args: ["-y", "some-oauth-package"], scope: "user", home: "user",
        env: { ADO_TOKEN: "oauth:ado" } } },
};
