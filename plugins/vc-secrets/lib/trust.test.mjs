import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import * as m from "../vc-secrets.mjs";
import { tmpDirs } from "../test-support.mjs";
import {
    LAUNCHER_PATH, launcherEnv, probeDir, LINK_TYPE, CAN_SYMLINK, tmpConfigDir, scopedPaths, trustedStateFor,
    seedTrust, OAUTH_DECL, KV_PAT, userServerPaths, TRUST_BASE, trustCfg, withDeclaration, trustEnv, NO_TRUST,
    NS_SERVER, NS_OAUTH_SERVER, withOwnRoot, namespaceCfg, namespaceOauthCfg, SECRET_PAT, POSIX_STUB_ONLY,
    namespaceRepo, keychainRecorder, runVerb, NS_PAT_PROJECT, trustRepo,
} from "../test-fixtures.mjs";

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

// ── repository trust ────────────────────────────────────────────────────────────────────────────────
//
// A launchable whose winning entry a repository declared is refused until the person has read it and run
// `trust`. The gate is one predicate (trustProblem) behind three callers, so the predicate is tested as
// a table and each caller is tested for what it does with the answer.

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

test("trust: the real verb refuses without a terminal and records nothing", () => {
    const dir = tmpConfigDir({ servers: { gh: TRUST_BASE } });
    const env = launcherEnv({ VC_SECRETS_CONFIG_DIR: dir });
    const r = spawnSync(process.execPath, [LAUNCHER_PATH, "trust"], { env, encoding: "utf8", input: "y\n" });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /vc-secrets trust requires an interactive terminal/);
    assert.ok(!fs.existsSync(m.trustFilePath(env)), "an answer piped in must not be taken");
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
