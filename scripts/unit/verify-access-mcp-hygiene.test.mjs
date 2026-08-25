// Unit tests for the generated-file secret-hygiene readiness checks (VCST-5774 B4) —
// plugins/vc-fix/skills/project-init/verify-access.mjs `findLiteralSecrets`,
// `findSettingsSecrets` and the pure `gradeSecretHygiene` decision table.
//
// gen-mcp.mjs now emits `${VAR}` indirections instead of literal credentials, but that fix lives in
// the PRODUCER. These checks audit the ARTIFACT, because the file on disk may predate the fix, have
// been hand-edited, or have been produced with `--inline-secrets` — and a literal token is
// silent-shaped: it works perfectly right up until the day someone commits it. Every non-PASS row
// of the readiness table becomes a `type:"obs"` record automatically (classForStatus), so these
// rows are also what make a regression visible to /vc-self-check.
//
// The central invariant under test is the CERTAIN/SUSPECTED split: `hits` (a known token shape) may
// block readiness; `weak` (a credential-shaped key with an opaque value) may only ever WARN.
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLiteralSecrets, findSettingsSecrets, gradeSecretHygiene } from "../../plugins/vc-fix/skills/project-init/verify-access.mjs";

const cfg = (servers) => JSON.stringify({ mcpServers: servers });
/** "certain" | "suspected" | "clean" — the only distinction the grading actually consumes. */
const verdict = (servers) => {
  const r = findLiteralSecrets(cfg(servers));
  return r.hits.length ? "certain" : r.weak.length ? "suspected" : "clean";
};

test("findLiteralSecrets: a ${VAR} indirection and an unresolved <PLACEHOLDER> are both clean", () => {
  const clean = cfg({
    github: { type: "http", headers: { Authorization: "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" } },
    postman: { type: "http", headers: { Authorization: "Bearer <POSTMAN_API_KEY>" } },
    context7: { type: "http", headers: { CONTEXT7_API_KEY: "${CONTEXT7_API_KEY}" } },
    "server-github": { type: "stdio", env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}" } },
  });
  assert.deepEqual(findLiteralSecrets(clean), { hits: [], weak: [], unparsable: false });
});

test("findLiteralSecrets: a known token shape is CERTAIN — http Bearer header and stdio env var", () => {
  // The two shapes actually found on disk: _OPUS (http) and _LEO_TEST/_DEMO (stdio).
  const http = findLiteralSecrets(cfg({ github: { type: "http", headers: { Authorization: "Bearer ghp_abcdefghij1234567890" } } }));
  assert.deepEqual(http.hits, ["github.headers.Authorization"]);
  const stdio = findLiteralSecrets(cfg({ github: { type: "stdio", env: { GITHUB_PERSONAL_ACCESS_TOKEN: "gho_abcdefghij1234567890" } } }));
  assert.deepEqual(stdio.hits, ["github.env.GITHUB_PERSONAL_ACCESS_TOKEN"]);
});

test("findLiteralSecrets: the prefix net is the SHARED one — glpat-/xoxb-/sk_live_/AKIA/JWT too", () => {
  // It used to be a local `(gh[pousr]_|github_pat_|PMAK-)` copy, so every token type below —
  // all of which hooks/redact.mjs already knew how to redact — passed the audit clean.
  for (const [label, value] of [
    ["gitlab", "glpat-abcdefghij1234567890"],
    ["slack", "xoxb-1234567890-abcdefghij"],
    ["stripe", "sk_live_abcdefghij1234"],
    ["aws", "AKIAIOSFODNN7EXAMPLE"],
    // A WHOLE JWT — header.payload.signature. The fixture used to be the header segment alone,
    // which passed only because the pattern was `eyJ…` with no dots required, i.e. it matched any
    // base64 of a JSON object. That over-match FAILed readiness on an ordinary APP_CONFIG_B64
    // (review #5), so the pattern now requires the two dots and the fixture must be a real token.
    ["jwt", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk"],
    ["fine-grained", "github_pat_abcdefghij1234567890"],
  ]) {
    const r = findLiteralSecrets(cfg({ [label]: { type: "stdio", env: { HARMLESS_NAME: value } } }));
    assert.deepEqual(r.hits, [`${label}.env.HARMLESS_NAME`], `${label} literal was not detected`);
  }
});

test("findLiteralSecrets: an unknown credential type under a credential key is SUSPECTED, not certain", () => {
  // A prefix list cannot know about a credential nobody has invented yet; keying on the KEY does.
  // But that net is value-blind, so it may only ever WARN — which is what lets the key vocabulary
  // stay wide (see the next test) instead of being narrowed until real names fall out of it.
  const r = findLiteralSecrets(cfg({ weird: { type: "http", headers: { "X-Api-Key": "zzq-2026-something-entirely-new" } } }));
  assert.deepEqual(r.hits, [], "an opaque value is never CERTAIN");
  assert.deepEqual(r.weak, ["weird.headers.X-Api-Key"]);
});

test("findLiteralSecrets: the credential-key vocabulary stays WIDE — every name redact.mjs knows", () => {
  // Narrowing this to kill false positives silently dropped ~16 real credential names that the
  // redactor already treated as secrets — trading false alarms for false silence, which is the
  // wrong direction for a detector. The value filter + the WARN ceiling are the noise controls.
  for (const k of ["AccountKey", "SharedAccessSignature", "OCP_APIM_SUBSCRIPTION_KEY", "X-Functions-Key",
    "subscriptionKey", "licenseKey", "signingKey", "encryptionKey", "hmacKey", "sessionKey",
    "myApiKey", "clientKey", "consumerKey", "deployKey", "webhookKey", "GPG_KEY"]) {
    assert.equal(verdict({ s: { env: { [k]: "zzq-opaque-credential-value" } } }), "suspected", `${k} is not recognised as a credential key`);
  }
});

test("findLiteralSecrets: a known prefix is CERTAIN even under an innocuous key name", () => {
  const r = findLiteralSecrets(cfg({ sneaky: { type: "stdio", env: { SOME_SETTING: "ghp_parkedhere1234567890" } } }));
  assert.deepEqual(r.hits, ["sneaky.env.SOME_SETTING"]);
});

test("findLiteralSecrets: the walk reaches args[], url and nested objects — not just headers/env", () => {
  // The producer's own leaf-walk fix exists so a placeholder inside `args[]` resolves
  // (`--api-key <X>`). An auditor that reads only `headers`/`env` is blind to exactly the shape
  // the producer just learned to write, so all of these used to grade clean.
  assert.deepEqual(findLiteralSecrets(cfg({ srv: { command: "npx", args: ["m", "--api-key", "zzq-unknown-credential-type"] } })).weak, ["srv.args[2]"]);
  assert.deepEqual(findLiteralSecrets(cfg({ srv: { command: "npx", args: ["m", "--opt", "ghp_inargs1234567890"] } })).hits, ["srv.args[2]"]);
  assert.deepEqual(findLiteralSecrets(cfg({ srv: { type: "http", url: "https://m/mcp?access_token=zzq-opaque-value" } })).weak, ["srv.url"]);
  assert.deepEqual(findLiteralSecrets(cfg({ srv: { type: "http", url: "https://user:s3cr3tpassword@m/mcp" } })).weak, ["srv.url"]);
  assert.deepEqual(findLiteralSecrets(cfg({ srv: { type: "stdio", env: { CREDS: { TOKEN: "zzq-nested-secret" } } } })).weak, ["srv.env.CREDS.TOKEN"]);
});

test("findLiteralSecrets: a credential-shaped key TAINTS what is nested under it", () => {
  // `credKey` used to be recomputed from the inner key only, so wrapping the value in one object
  // or array hid it from the structural net entirely.
  assert.equal(verdict({ s: { env: { AUTH_TOKEN: { value: "plainsecret123" } } } }), "suspected");
  assert.equal(verdict({ s: { headers: { "X-Api-Key": ["s3cr3tvalue"] } } }), "suspected");
});

test("findLiteralSecrets: a fused `--api-key=VALUE` argv token is seen", () => {
  // CRED_FLAG only ever inspects the PRECEDING array element, so the single-token form — the
  // commoner CLI spelling — passed clean while the separated form was caught.
  assert.equal(verdict({ s: { args: ["run", "--api-key=s3cr3tvalue"] } }), "suspected");
  assert.equal(verdict({ s: { args: ["--token=s3cr3tvalue"] } }), "suspected");
});

test("findLiteralSecrets: an unresolved placeholder in args[] or a template url stays clean", () => {
  assert.equal(verdict({ s: { args: ["m", "--api-key", "<POSTMAN_API_KEY>"] } }), "clean", "an unresolved <PLACEHOLDER> trips the separate unresolved WARN, not this one");
  assert.equal(verdict({ s: { args: ["m", "--api-key", "${POSTMAN_API_KEY}"] } }), "clean", "a ${VAR} reference is the TARGET state");
  assert.equal(verdict({ s: { url: "https://m/mcp?api_key=${CONTEXT7_API_KEY}" } }), "clean");
});

test("findLiteralSecrets: ordinary non-credential config is NOT flagged (no false positives)", () => {
  // Every stdio server carries the first two (#220). The rest are the corpus a security review
  // found the first version flagging — most damningly `--secrets .env.playwright.local`, this
  // repo's OWN documented Playwright setup, which graded as a readiness-blocking FAIL on three
  // servers. A row that cries wolf on a filename is how a real finding gets scrolled past.
  for (const [k, v] of [
    ["NODE_OPTIONS", "--dns-result-order=ipv4first"], ["npm_config_prefer_offline", "true"],
    ["TOKENIZER_MODE", "fast"], ["SECRETARIAT", "hq"], ["TOKEN_BUDGET", "100"], ["MAX_TOKENS", "4096"],
    ["AUTH_KEY_FILE", "/etc/x"], ["API_KEY_FILE", "/etc/x"], ["PASSWORD_MIN_LENGTH", "8"],
    ["TOKEN_SOURCE", "env"], ["PASSWD_FILE", "/etc/passwd"], ["SSH_KEY_PATH", "/home/u/.ssh/id_ed25519"],
    ["KEYBOARD_LAYOUT", "us"], ["MONKEY_MODE", "on"], ["PATH", "/usr/bin:/bin"],
  ]) {
    assert.equal(verdict({ s: { env: { [k]: v } } }), "clean", `${k}=${v} must not be flagged`);
  }
  assert.equal(verdict({ s: { args: ["--secrets", ".env.playwright.local"] } }), "clean", "a filename is not a credential");
  assert.equal(verdict({ s: { args: ["--auth-type", "oauth"] } }), "clean");
  assert.equal(verdict({ s: { args: ["--key-file", "/etc/k.pem"] } }), "clean");
});

test("findLiteralSecrets: reports every offending server, deduped, and never the VALUE", () => {
  const raw = cfg({
    github: { type: "http", headers: { Authorization: "Bearer ghp_leakone1234567890" } },
    postman: { type: "http", headers: { Authorization: "Bearer PMAK-leaktwo-1234567890" } },
  });
  const r = findLiteralSecrets(raw);
  assert.deepEqual(r.hits.sort(), ["github.headers.Authorization", "postman.headers.Authorization"]);
  const blob = JSON.stringify(r);
  assert.ok(!blob.includes("ghp_leakone1234567890") && !blob.includes("PMAK-leaktwo-1234567890"),
    "a credential value must never reach the result (it becomes observation evidence)");
});

test("findLiteralSecrets: a CERTAIN path is never also reported as weak", () => {
  const r = findLiteralSecrets(cfg({ s: { env: { API_KEY: "ghp_bothnets1234567890" } } }));
  assert.deepEqual(r.hits, ["s.env.API_KEY"]);
  assert.deepEqual(r.weak, [], "the same path must not appear in both buckets");
});

test("findLiteralSecrets: unparsable or empty input degrades safely, never throws", () => {
  assert.deepEqual(findLiteralSecrets("{ not json"), { hits: [], weak: [], unparsable: true });
  assert.deepEqual(findLiteralSecrets("{}"), { hits: [], weak: [], unparsable: false });
  assert.deepEqual(findLiteralSecrets(cfg({ bare: { type: "http", url: "https://x" } })), { hits: [], weak: [], unparsable: false });
  // A dropped Authorization header (the no-PAT OAuth path) leaves an empty headers bag.
  assert.deepEqual(findLiteralSecrets(cfg({ github: { type: "http", headers: {} } })), { hits: [], weak: [], unparsable: false });
});

// ─── settings.local.json — where the credential VALUE now lives ───────────────────────────────
test("findSettingsSecrets: finds the bridged credential, ignores non-secret settings keys", () => {
  const s = JSON.stringify({
    enabledMcpjsonServers: ["github", "atlassian"],
    permissions: { deny: ["Bash(gh pr merge:*)"] },
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_bridged1234567890", NODE_OPTIONS: "--dns-result-order=ipv4first" },
  });
  assert.deepEqual(findSettingsSecrets(s).hits, ["env.GITHUB_PERSONAL_ACCESS_TOKEN"]);
  assert.deepEqual(findSettingsSecrets("{ not json"), { hits: [], weak: [], unparsable: true });
});

test("findSettingsSecrets: a token pasted OUTSIDE `env` is still caught by the certain net", () => {
  // The structural net is scoped to `env` (scanning `permissions` would flag ordinary rule
  // strings), but "the file may have been hand-edited" is the whole reason this audit exists —
  // and a hook command is exactly where a hand-edit puts a Bearer token.
  const r = findSettingsSecrets(JSON.stringify({
    env: { NODE_OPTIONS: "--dns-result-order=ipv4first" },
    hooks: { PreToolUse: [{ command: 'curl -H "Authorization: Bearer ghp_inahook1234567890"' }] },
  }));
  assert.deepEqual(r.hits, ["hooks.PreToolUse[0].command"]);
});

test("findSettingsSecrets: ordinary permissions/config strings are NOT hits", () => {
  assert.deepEqual(findSettingsSecrets(JSON.stringify({
    permissions: { deny: ["Bash(gh pr merge:*)"], allow: ["WebFetch(domain:api.github.com)"] },
    enabledMcpjsonServers: ["github"],
    env: { NODE_OPTIONS: "--dns-result-order=ipv4first" },
  })).hits, []);
});

// ─── the grading decision table ───────────────────────────────────────────────────────────────
// This is the part that decides whether onboarding is BLOCKED, and it used to live inside main()
// where nothing could reach it — which is why its "outside a git repo" branch shipped wrong. Kept
// table-driven because the input space is kind × hits × weak × inRepo × ignored × tracked, and the
// cells nobody thought to write a test for are exactly where mutation testing found survivors.
const BASE = { kind: "mcp", file: ".mcp.json", hits: [], weak: [], unparsable: false, inRepo: true, ignored: true, tracked: false };
const CERTAIN = ["github.headers.Authorization"];
const SUSPECT = ["srv.args[2]"];

const CASES = [
  { name: "certain literal in a repo that would commit it — the one FAIL",
    over: { hits: CERTAIN, ignored: false }, status: "FAIL", match: [/not gitignored/, /rotate the credential/] },
  { name: "certain literal in an ALREADY-TRACKED file — .gitignore cannot fix it",
    // `git check-ignore` reports a tracked path as NOT ignored, so `ignored` alone cannot see this;
    // and the usual "re-run /project-init" advice is a no-op because the rule is already there.
    over: { hits: CERTAIN, ignored: true, tracked: true }, status: "FAIL",
    match: [/tracked by git/, /git rm --cached \.mcp\.json/], notMatch: [/re-run \/project-init \(writes the ignore entry\)/] },
  { name: "certain literal OUTSIDE a git repo — WARN, never FAIL",
    // The regression this row exists for: `ignored` is false outside a repo too, so the old
    // `hits && !ignored` FAIL fired with "one `git add -A` publishes it" on a project with no git
    // at all — and 4 of the 5 leaking projects VCST-5774 found on disk were exactly that shape.
    over: { hits: CERTAIN, inRepo: false, ignored: false }, status: "WARN", notMatch: [/git add -A/] },
  { name: "certain literal in a properly-ignored .mcp.json — WARN naming the escape hatch",
    over: { hits: CERTAIN }, status: "WARN", match: [/--inline-secrets/] },
  { name: "SUSPECTED value in an exposed file caps at WARN — it may be a filename, not a secret",
    over: { weak: SUSPECT, ignored: false }, status: "WARN", match: [/may hold a credential/, /srv\.args\[2\]/] },
  { name: "SUSPECTED value in an ignored file — WARN, still not a blocker",
    over: { weak: SUSPECT }, status: "WARN" },
  { name: "clean but committable — WARN with the add-to-gitignore remedy",
    over: { ignored: false }, status: "WARN", match: [/not gitignored/, /add it to \.gitignore/] },
  { name: "clean but TRACKED — WARN with the untrack remedy, not the ignore one",
    over: { tracked: true }, status: "WARN", match: [/tracked by git/, /git rm --cached \.mcp\.json/], notMatch: [/add it to \.gitignore/] },
  { name: "clean and ignored — PASS",
    over: {}, status: "PASS" },
  { name: "clean, no repo — PASS saying so",
    over: { inRepo: false, ignored: false }, status: "PASS", match: [/not a git repo/] },
  { name: "unparsable, contained — WARN without an exposure claim",
    over: { unparsable: true }, status: "WARN", notMatch: [/not gitignored/] },
  { name: "unparsable AND exposed — the exposure is still reported",
    // A broken JSON must not also hide the ignore-state finding.
    over: { unparsable: true, ignored: false }, status: "WARN", match: [/not gitignored/] },
  { name: "settings: a contained credential is the TARGET state, not a defect",
    over: { kind: "settings", file: ".claude/settings.local.json", hits: ["env.GITHUB_PERSONAL_ACCESS_TOKEN"] },
    status: "PASS", match: [/by design/] },
  { name: "settings: the same credential in a committable file is a FAIL",
    // The fix's own new secret location must be guarded too — auditing only .mcp.json would have
    // left it unchecked.
    over: { kind: "settings", file: ".claude/settings.local.json", hits: ["env.GITHUB_PERSONAL_ACCESS_TOKEN"], ignored: false },
    status: "FAIL" },
];

for (const { name, over, status, match = [], notMatch = [] } of CASES) {
  test(`gradeSecretHygiene: ${name}`, () => {
    const r = gradeSecretHygiene({ ...BASE, ...over });
    assert.equal(r.status, status, `expected ${status}, got ${r.status}: ${r.detail}`);
    for (const re of match) assert.match(r.detail, re);
    for (const re of notMatch) assert.doesNotMatch(r.detail, re);
  });
}

test("gradeSecretHygiene: no branch ever interpolates a credential VALUE", () => {
  // Whatever the grading says lands in the readiness table AND in a type:"obs" record.
  for (const { over } of CASES) {
    const { detail } = gradeSecretHygiene({ ...BASE, ...over });
    assert.ok(!/gh[pousr]_|PMAK-|Bearer\s+\S/.test(detail), `a value-shaped string reached the detail: ${detail}`);
  }
});
