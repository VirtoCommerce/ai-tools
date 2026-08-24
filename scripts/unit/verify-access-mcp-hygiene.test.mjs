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
// Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLiteralSecrets, findSettingsSecrets, gradeSecretHygiene } from "../../plugins/vc-fix/skills/project-init/verify-access.mjs";

const cfg = (servers) => JSON.stringify({ mcpServers: servers });

test("findLiteralSecrets: a ${VAR} indirection and an unresolved <PLACEHOLDER> are both clean", () => {
  const clean = cfg({
    github: { type: "http", headers: { Authorization: "Bearer ${GITHUB_PERSONAL_ACCESS_TOKEN}" } },
    postman: { type: "http", headers: { Authorization: "Bearer <POSTMAN_API_KEY>" } },
    context7: { type: "http", headers: { CONTEXT7_API_KEY: "${CONTEXT7_API_KEY}" } },
    "server-github": { type: "stdio", env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_PERSONAL_ACCESS_TOKEN}" } },
  });
  assert.deepEqual(findLiteralSecrets(clean), { hits: [], unparsable: false });
});

test("findLiteralSecrets: catches a literal in an http Bearer header AND in a stdio env var", () => {
  // The two shapes actually found on disk: _OPUS (http) and _LEO_TEST/_DEMO (stdio).
  const http = findLiteralSecrets(cfg({ github: { type: "http", headers: { Authorization: "Bearer ghp_abcdefghij1234567890" } } }));
  assert.deepEqual(http.hits, ["github.headers.Authorization"]);
  const stdio = findLiteralSecrets(cfg({ github: { type: "stdio", env: { GITHUB_PERSONAL_ACCESS_TOKEN: "gho_abcdefghij1234567890" } } }));
  assert.deepEqual(stdio.hits, ["github.env.GITHUB_PERSONAL_ACCESS_TOKEN"]);
});

test("findLiteralSecrets: the check is STRUCTURAL — an unknown credential type is still caught", () => {
  // A prefix list (ghp_/PMAK-/…) cannot know about a credential nobody has invented yet. Keying on
  // "credential-shaped key + not an indirection" does. This is the case a regex-only guard misses.
  const r = findLiteralSecrets(cfg({ weird: { type: "http", headers: { "X-Api-Key": "zzq-2026-something-entirely-new" } } }));
  assert.deepEqual(r.hits, ["weird.headers.X-Api-Key"]);
});

test("findLiteralSecrets: a known prefix is caught even under an innocuous key name", () => {
  const r = findLiteralSecrets(cfg({ sneaky: { type: "stdio", env: { SOME_SETTING: "ghp_parkedhere1234567890" } } }));
  assert.deepEqual(r.hits, ["sneaky.env.SOME_SETTING"]);
});

test("findLiteralSecrets: the prefix net is the SHARED one — glpat-/xoxb-/sk_live_/AKIA/JWT too", () => {
  // It used to be a local `(gh[pousr]_|github_pat_|PMAK-)` copy, so every token type below —
  // all of which hooks/redact.mjs already knew how to redact — passed the audit clean.
  for (const [label, value] of [
    ["gitlab", "glpat-abcdefghij1234567890"],
    ["slack", "xoxb-1234567890-abcdefghij"],
    ["stripe", "sk_live_abcdefghij1234"],
    ["aws", "AKIAIOSFODNN7EXAMPLE"],
    ["jwt", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"],
    ["fine-grained", "github_pat_abcdefghij1234567890"],
  ]) {
    const r = findLiteralSecrets(cfg({ [label]: { type: "stdio", env: { HARMLESS_NAME: value } } }));
    assert.deepEqual(r.hits, [`${label}.env.HARMLESS_NAME`], `${label} literal was not detected`);
  }
});

test("findLiteralSecrets: the walk reaches args[], url and nested objects — not just headers/env", () => {
  // The producer's own leaf-walk fix exists so a placeholder inside `args[]` resolves
  // (`--api-key <X>`). An auditor that reads only `headers`/`env` is blind to exactly the shape
  // the producer just learned to write, so all four of these used to grade PASS.
  const flagArg = findLiteralSecrets(cfg({ srv: { command: "npx", args: ["some-mcp", "--api-key", "zzq-unknown-credential-type"] } }));
  assert.deepEqual(flagArg.hits, ["srv.args[2]"], "a CLI-flag credential in args[] must be caught");

  const prefixArg = findLiteralSecrets(cfg({ srv: { command: "npx", args: ["some-mcp", "--opt", "ghp_inargs1234567890"] } }));
  assert.deepEqual(prefixArg.hits, ["srv.args[2]"], "a known prefix anywhere in args[] must be caught");

  const url = findLiteralSecrets(cfg({ srv: { type: "http", url: "https://mcp.example.com/mcp?access_token=zzq-opaque-value" } }));
  assert.deepEqual(url.hits, ["srv.url"], "a credential query param must be caught");

  const userinfo = findLiteralSecrets(cfg({ srv: { type: "http", url: "https://user:s3cr3tpassword@mcp.example.com/mcp" } }));
  assert.deepEqual(userinfo.hits, ["srv.url"], "URL userinfo must be caught");

  const nested = findLiteralSecrets(cfg({ srv: { type: "stdio", env: { CREDS: { TOKEN: "zzq-nested-secret" } } } }));
  assert.deepEqual(nested.hits, ["srv.env.CREDS.TOKEN"], "a nested credential bag must be walked");
});

test("findLiteralSecrets: an unresolved placeholder in args[] or a template url stays clean", () => {
  const args = findLiteralSecrets(cfg({ srv: { command: "npx", args: ["some-mcp", "--api-key", "<POSTMAN_API_KEY>"] } }));
  assert.deepEqual(args.hits, [], "an unresolved <PLACEHOLDER> is not a leak — it trips the separate unresolved WARN");
  const ref = findLiteralSecrets(cfg({ srv: { command: "npx", args: ["some-mcp", "--api-key", "${POSTMAN_API_KEY}"] } }));
  assert.deepEqual(ref.hits, [], "a ${VAR} reference is the TARGET state, not a finding");
  const url = findLiteralSecrets(cfg({ srv: { type: "http", url: "https://mcp.example.com/mcp?api_key=${CONTEXT7_API_KEY}" } }));
  assert.deepEqual(url.hits, [], "a ${VAR} in a url query is an indirection too");
});

test("findLiteralSecrets: ordinary non-credential env is NOT flagged (no false positives)", () => {
  // Every stdio server carries these two (#220). Flagging them would make the row cry wolf on
  // every single project, which is how a real finding gets ignored.
  const r = findLiteralSecrets(cfg({
    "playwright-chrome": { type: "stdio", command: "cmd", args: ["/c", "npx", "@playwright/mcp@0.0.77"], env: { NODE_OPTIONS: "--dns-result-order=ipv4first", npm_config_prefer_offline: "true" } },
    atlassian: { type: "http", url: "https://mcp.atlassian.com/v1/mcp" },
    "figma-remote-mcp": { type: "http", url: "https://mcp.figma.com/mcp" },
  }));
  assert.deepEqual(r.hits, [], "the shipped clean template must produce zero hits");
});

test("findLiteralSecrets: a key that merely CONTAINS 'key'/'pat' is not a credential key", () => {
  // A bare /KEY/i matched CACHE_KEY, SSH_KEY_PATH and MONKEY_MODE. This row can FAIL readiness,
  // and a check that cries wolf on ordinary config is how a real FAIL gets scrolled past.
  const r = findLiteralSecrets(cfg({
    ordinary: { type: "stdio", env: { CACHE_KEY: "build-42", SSH_KEY_PATH: "/home/u/.ssh/id_ed25519", KEYBOARD_LAYOUT: "us", PATH: "/usr/bin:/bin", MONKEY_MODE: "on" } },
  }));
  assert.deepEqual(r.hits, []);
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

test("findLiteralSecrets: unparsable or empty input degrades safely, never throws", () => {
  assert.deepEqual(findLiteralSecrets("{ not json"), { hits: [], unparsable: true });
  assert.deepEqual(findLiteralSecrets("{}"), { hits: [], unparsable: false });
  assert.deepEqual(findLiteralSecrets(cfg({ bare: { type: "http", url: "https://x" } })), { hits: [], unparsable: false });
  // A dropped Authorization header (the no-PAT OAuth path) leaves an empty headers bag.
  assert.deepEqual(findLiteralSecrets(cfg({ github: { type: "http", headers: {} } })), { hits: [], unparsable: false });
});

// ─── settings.local.json — where the credential VALUE now lives ───────────────────────────────
test("findSettingsSecrets: finds the bridged credential, ignores non-secret settings keys", () => {
  const s = JSON.stringify({
    enabledMcpjsonServers: ["github", "atlassian"],
    permissions: { deny: ["Bash(gh pr merge:*)"] },
    env: { GITHUB_PERSONAL_ACCESS_TOKEN: "ghp_bridged1234567890", NODE_OPTIONS: "--dns-result-order=ipv4first" },
  });
  assert.deepEqual(findSettingsSecrets(s).hits, ["env.GITHUB_PERSONAL_ACCESS_TOKEN"]);
  assert.deepEqual(findSettingsSecrets(JSON.stringify({ enabledMcpjsonServers: ["github"] })).hits, []);
  assert.deepEqual(findSettingsSecrets("{ not json"), { hits: [], unparsable: true });
});

// ─── the grading decision table ───────────────────────────────────────────────────────────────
// This is the part that decides whether onboarding is BLOCKED, and it used to live inside main()
// where nothing could reach it. Its "outside a git repo" branch was wrong for exactly that reason.
const grade = (over) => gradeSecretHygiene({
  kind: "mcp", file: ".mcp.json", hits: [], unparsable: false,
  inRepo: true, ignored: true, tracked: false, ...over,
});

test("gradeSecretHygiene: a literal in a repo that would commit it is the one FAIL", () => {
  const r = grade({ hits: ["github.headers.Authorization"], ignored: false });
  assert.equal(r.status, "FAIL");
  assert.match(r.detail, /not gitignored/);
  assert.match(r.detail, /rotate the credential/);
});

test("gradeSecretHygiene: OUTSIDE a git repo a literal is a WARN, not a FAIL", () => {
  // The regression this test exists for: `ignored` is false outside a repo too, so the old
  // `hits && !ignored` FAIL fired with "one `git add -A` publishes it" on a project that has no
  // git at all — and 4 of the 5 leaking projects VCST-5774 found on disk were exactly that shape.
  const r = grade({ hits: ["github.headers.Authorization"], inRepo: false, ignored: false });
  assert.equal(r.status, "WARN", "nothing to commit to ⇒ not an onboarding blocker");
  assert.doesNotMatch(r.detail, /git add -A/, "the FAIL wording must not leak into the non-repo case");
});

test("gradeSecretHygiene: a TRACKED file is exposed even when .gitignore matches it", () => {
  // `git check-ignore` returns 1 for a tracked path, so `ignored` alone cannot see this; and the
  // usual "re-run /project-init" advice is a no-op here — the rule is already there.
  const r = grade({ hits: ["github.headers.Authorization"], ignored: true, tracked: true });
  assert.equal(r.status, "FAIL");
  assert.match(r.detail, /git rm --cached \.mcp\.json/, "the only remediation that actually untracks it");
  assert.doesNotMatch(r.detail, /re-run \/project-init \(writes the ignore entry\)/);
});

test("gradeSecretHygiene: a literal in a properly-ignored .mcp.json is a WARN", () => {
  const r = grade({ hits: ["github.headers.Authorization"] });
  assert.equal(r.status, "WARN");
  assert.match(r.detail, /--inline-secrets/, "the deliberate-literal escape hatch is named");
});

test("gradeSecretHygiene: a clean-but-committable file warns; a clean ignored file passes", () => {
  assert.equal(grade({ ignored: false }).status, "WARN");
  assert.equal(grade({}).status, "PASS");
  assert.match(grade({ inRepo: false, ignored: false }).detail, /not a git repo/);
});

test("gradeSecretHygiene: for settings.local.json a contained secret is the TARGET state (PASS)", () => {
  // kind:"settings" — the value living here is the whole point of the ${VAR} redesign, so only
  // EXPOSURE is a finding. Grading it like .mcp.json would FAIL every correctly-onboarded project.
  const ok = gradeSecretHygiene({ kind: "settings", file: ".claude/settings.local.json", hits: ["env.GITHUB_PERSONAL_ACCESS_TOKEN"], unparsable: false, inRepo: true, ignored: true, tracked: false });
  assert.equal(ok.status, "PASS");
  assert.match(ok.detail, /by design/);

  const bad = gradeSecretHygiene({ kind: "settings", file: ".claude/settings.local.json", hits: ["env.GITHUB_PERSONAL_ACCESS_TOKEN"], unparsable: false, inRepo: true, ignored: false, tracked: false });
  assert.equal(bad.status, "FAIL", "the fix's own new secret location must be guarded too");
});

test("gradeSecretHygiene: unparsable still reports exposure instead of dropping the whole audit", () => {
  const safe = grade({ unparsable: true });
  assert.equal(safe.status, "WARN");
  assert.doesNotMatch(safe.detail, /not gitignored/);
  const exposed = grade({ unparsable: true, ignored: false });
  assert.equal(exposed.status, "WARN");
  assert.match(exposed.detail, /not gitignored/, "a broken JSON must not also hide the ignore-state finding");
});

test("gradeSecretHygiene: no branch ever interpolates a credential VALUE", () => {
  // Whatever the grading says lands in the readiness table AND in a type:"obs" record.
  for (const over of [
    { hits: ["github.headers.Authorization"], ignored: false },
    { hits: ["github.headers.Authorization"], tracked: true },
    { hits: ["github.headers.Authorization"] },
    { hits: ["github.headers.Authorization"], inRepo: false, ignored: false },
    { unparsable: true, ignored: false },
    { ignored: false },
    {},
  ]) {
    const { detail } = grade(over);
    assert.ok(!/gh[pousr]_|PMAK-|Bearer\s+\S/.test(detail), `a value-shaped string reached the detail: ${detail}`);
  }
});
