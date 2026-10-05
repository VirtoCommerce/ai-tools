import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as m from "../vc-secrets.mjs";
import * as clients from "../clients.mjs";
import { stripComments, tmpDirs } from "../test-support.mjs";
import {
    launcherEnv, denyFs, scopedPaths, trustedStateFor, crossingReport, OAUTH_DECL, KV_PAT, withStubOnPath, NO_TRUST,
    withProcessEnv, withOwnRoot, namespaceCfg, namespaceOauthCfg, corruptTrustFile, namespaceStoreSeams,
} from "../test-fixtures.mjs";

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
