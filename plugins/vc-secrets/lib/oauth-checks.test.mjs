import { test } from "node:test";
import assert from "node:assert/strict";
import * as m from "../vc-secrets.mjs";

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

// A real Azure DevOps MCP scope: the App ID GUID (a public Microsoft resource identifier, not a
// client identifier -- see the constant's own comment in lib/oauth-checks.mjs) plus offline_access,
// which a REAL declaration needs to get a refresh token at all (README.md) -- loadConfig itself does
// not check for it, so its absence here would not make this fixture invalid, only unrealistic.
const ADO_SCOPES = ["499b84ac-1321-427f-aa17-267ca6975798/.default", "offline_access"];

// ── oauthTenantChecks: which consumer answers for an entry, and whether it is even worth asking ────

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
