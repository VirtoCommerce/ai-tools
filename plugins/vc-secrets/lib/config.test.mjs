import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as m from "../vc-secrets.mjs";
import * as target from "../vc-secrets-target.mjs";
import { tmpDirs } from "../test-support.mjs";
import {
    denyFs, probeDir, LINK_TYPE, CAN_SYMLINK, projectPaths, scopedPaths, CROSSING_SHAPE, vaultPaths,
    OAUTH_TENANT_ID, OAUTH_DECL, REGISTRATION_BLOCK, OAUTH_CLIENT_ID, keyvaultPairCfg, onlyFiles,
    authorizedOauthPaths, KV_PAT, KV_PAT_SHAPE, userServerPaths,
} from "../test-fixtures.mjs";

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

// Distinct from OAUTH_TENANT_ID: that one is all-digit, so upper- and lower-casing it produce the
// same string and it cannot expose a case-folding defect. This one carries letters.
const CASE_TENANT_ID_UPPER = "ABCDEF12-3456-7890-ABCD-EF1234567890";

const CASE_TENANT_ID_LOWER = CASE_TENANT_ID_UPPER.toLowerCase();

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

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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

test("a launchable name with a path separator, a space, or a control character is refused at parse", () => {
    for (const bad of ["../evil", "with/slash", "with\\backslash", "has space", "ctrl\nchar"]) {
        assert.throws(
            () => m.loadConfig(projectPaths({ secrets: {}, servers: { [bad]: { command: "x", args: [], env: {} } } })),
            /name must match/,
            `expected server name "${bad}" to be refused`);
    }
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
