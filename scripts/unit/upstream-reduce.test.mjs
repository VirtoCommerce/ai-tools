// Tests for the DEFAULT-DENY, CLOSED-SCHEMA upstream reducer
// (plugins/vc-fix/skills/vc-self-check/upstream-reduce.mjs) — the trust-direction inversion
// that ends the client-data-leak class.
//
// The CORE PROOF is the property/fuzz block: adversarial client-shaped strings (secrets in
// every format, org names, camelCase/PascalCase/ALL-CAPS/all-lowercase identifiers, paths,
// URLs, emails, tickets, non-latin) are injected into the LOCAL record set, and the
// serialized reduced+validated struct is asserted to contain NONE of them AND every field is
// asserted ∈ its closed vocabulary. That proves the leak class impossible BY TYPE, not by
// enumerating denylist rules. Run: `npm test` (tsx --test scripts/unit/**/*.test.mjs).
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  reduce, validateUpstream, classifyError, fingerprintStruct, findingStructSig, findingKey,
  toolFamily, repoKindOfAgent, provenanceFields, boundaryDenial, normalizeVendorMessage,
  violatesFieldNamespace, severityRank, verdictRank,
  SKILLS, VERDICTS, SEVERITIES, OUTCOMES, SIGNAL_CLASSES, STRUGGLES,
  TOOL_FAMILIES, REPO_KINDS, ERROR_CODES, SCHEMA_VERSION, OS_VALUES, VENDOR_DOC_HOSTS,
} from "../../plugins/vc-fix/skills/vc-self-check/upstream-reduce.mjs";

// The EXACT key sets the struct must have — a strict-shape check so an UNFORESEEN extra field
// carrying client bytes fails, not just the known fields (adversarial review #5, GAP 1).
// v3 (PR #172) added the runtime env pair (nodeVersion/os) at top level and the provenance-gated
// string fields per finding.
const TOP_KEYS = ["schemaVersion", "pluginVersion", "nodeVersion", "os", "findings", "feedback", "sessionCount"];
// The closed-schema allowlist for UpstreamFinding: EXACTLY these keys, no others. `subject` and
// `blockedDeliverable` were added by schema v2 (item 10). v3 adds the provenance string fields —
// each is `null` unless it PROVES vendor provenance + passes the boundary validator, so the strict
// shape still holds (the KEY is always present; the VALUE is null when unproven).
const V3_STRING_KEYS = [
  "pluginFile", "pluginLine", "codeExcerpt", "offendingLiteral", "apiShape", "proposedFix",
  "vendorErrorTypeKey", "vendorErrorName", "vendorErrorCode", "vendorHttpStatus", "vendorDocUrl",
  "vendorErrorMessage",
];
const FINDING_KEYS = [
  ...V3_STRING_KEYS,
  "skill", "subject", "blockedDeliverable", "verdict", "severity", "outcome", "signalClass",
  "struggle", "errorCode", "toolFamily", "repoKind", "retries", "occurrences",
];
const FEEDBACK_KEYS = ["up", "down"];
const assertExactKeys = (obj, keys, where) =>
  assert.deepEqual(Object.keys(obj).sort(), [...keys].sort(), `unexpected keys in ${where}: ${Object.keys(obj)}`);

// Recursively assert `needle` appears in NO string value of `struct`. This walks the DECODED
// values — unlike `JSON.stringify(struct).includes(needle)`, which is defeated by escaping: a
// verbatim `C:\src\x.cs` serializes as `C:\\src\\x.cs` and a raw-substring scan would MISS it
// (adversarial review #5, GAP 1 — a demonstrated green-despite-leak). Comparing decoded values
// closes that whole escaping-blind class (backslash, quote, newline, tab, control chars).
function assertNoLeak(struct, needle) {
  const walk = (v) => {
    if (typeof v === "string") {
      assert.ok(!v.includes(needle), `client byte leaked into a string value: ${JSON.stringify(needle).slice(0, 30)}`);
    } else if (Array.isArray(v)) {
      v.forEach(walk);
    } else if (v && typeof v === "object") {
      for (const k of Object.keys(v)) { assert.ok(!String(k).includes(needle), `client byte leaked into a KEY: ${k}`); walk(v[k]); }
    }
  };
  walk(struct);
}

// ── vocabulary + strict-shape assertion for a whole struct (the type-level guarantee) ──
function assertAllFieldsInVocabulary(struct) {
  assertExactKeys(struct, TOP_KEYS, "struct"); // strict shape — no extra top-level field
  assert.equal(struct.schemaVersion, SCHEMA_VERSION);
  // pluginVersion is a bounded numeric triple or "unknown" — NEVER an echoed free string
  // (adversarial review A: the old `-\S+` prerelease tail was an unbounded leak channel).
  assert.match(struct.pluginVersion, /^(?:\d{1,4}\.\d{1,4}\.\d{1,4}|unknown)$/);
  assert.match(struct.nodeVersion, /^(?:v\d{1,3}\.\d{1,3}\.\d{1,4}|unknown)$/);
  assert.ok(OS_VALUES.includes(struct.os), `os ∈ vocab: ${struct.os}`);
  assert.ok(Number.isInteger(struct.sessionCount) && struct.sessionCount >= 1);
  assertExactKeys(struct.feedback, FEEDBACK_KEYS, "feedback");
  assert.ok(Number.isInteger(struct.feedback.up) && struct.feedback.up >= 0);
  assert.ok(Number.isInteger(struct.feedback.down) && struct.feedback.down >= 0);
  for (const f of struct.findings) {
    assertExactKeys(f, FINDING_KEYS, "finding"); // strict shape — no extra finding field
    assert.ok(SKILLS.includes(f.skill), `skill ∈ vocab: ${f.skill}`);
    assert.ok(VERDICTS.includes(f.verdict), `verdict ∈ vocab: ${f.verdict}`);
    assert.ok(SEVERITIES.includes(f.severity), `severity ∈ vocab: ${f.severity}`);
    assert.ok(OUTCOMES.includes(f.outcome), `outcome ∈ vocab: ${f.outcome}`);
    assert.ok(SIGNAL_CLASSES.includes(f.signalClass), `signalClass ∈ vocab: ${f.signalClass}`);
    assert.ok(Array.isArray(f.struggle) && f.struggle.every((x) => STRUGGLES.includes(x)), `struggle ⊆ vocab: ${f.struggle}`);
    assert.ok(ERROR_CODES.includes(f.errorCode), `errorCode ∈ vocab: ${f.errorCode}`);
    assert.ok(TOOL_FAMILIES.includes(f.toolFamily), `toolFamily ∈ vocab: ${f.toolFamily}`);
    assert.ok(REPO_KINDS.includes(f.repoKind), `repoKind ∈ vocab: ${f.repoKind}`);
    assert.ok(Number.isInteger(f.retries) && f.retries >= 0 && f.retries <= 99);
    assert.ok(Number.isInteger(f.occurrences) && f.occurrences >= 1);
    // v3 provenance fields: each is either null or its typed value. Absent a ctx (the default in
    // reduce/validateUpstream here) every one MUST be null — unproven is the fail-closed default.
    for (const k of V3_STRING_KEYS) {
      if (k === "pluginLine" || k === "vendorHttpStatus") assert.ok(f[k] === null || Number.isInteger(f[k]), `${k} null|int`);
      else assert.ok(f[k] === null || typeof f[k] === "string", `${k} null|string`);
    }
  }
}

// A synthetic flagged skill span + its blocking child tool + a delegated agent, with the
// adversarial string dropped into EVERY free-text slot the collector could carry.
function spansWithInjectedText(bad, opts = {}) {
  const skillId = "s-1";
  return [
    {
      type: "span", id: skillId, parentId: null, kind: "skill", name: opts.skillName ?? bad,
      // inject the adversarial byte into the struggle slot too (Gap A) — it must be Set-filtered out
      status: "error", outcome: opts.outcome ?? "failed", struggle: opts.struggle ?? [bad, "retry_storm"],
      retries: opts.retries ?? 2,
      signals: { tool_error: 1, permission_denied: 0, hook_failure: 0, stop_bail: 0 },
      details: [{ cls: "tool_error", snippet: bad }],
    },
    {
      type: "span", id: "t-1", parentId: skillId, kind: "tool", name: bad,
      status: "error", outcome: "failed", struggle: [], retries: 0,
      signals: { tool_error: 1 }, details: [{ cls: "tool_error", snippet: bad }],
    },
    {
      type: "span", id: "a-1", parentId: skillId, kind: "agent", name: bad,
      status: "error", outcome: "failed", struggle: [], retries: 0,
      signals: { tool_error: 1 }, details: [{ cls: "tool_error", snippet: bad }],
    },
  ];
}

// ─── PROPERTY / FUZZ: no injected client byte survives; all fields ∈ vocabulary ──────
const ADVERSARIAL = [
  // secrets (every redact format + a random high-entropy blob). NOTE: these secret-shaped
  // fixtures are ASSEMBLED at runtime (concatenation) so the SOURCE FILE contains no contiguous
  // real-provider token pattern — otherwise GitHub push-protection / secret scanners flag the
  // fixture itself as a live credential (a fake `sk_live_…` tripped the Stripe rule). The
  // assembled VALUES are unchanged; they exercise the "no secret-shaped byte leaks" property.
  "github_pat_" + "11ABxz0aai0abcdefghijklmnopqrstuvwxyz012345",
  "gh" + "p_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789",
  "AKIA" + "IOSFODNN7EXAMPLE",
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
  "xox" + "b-1234567890-abcdefghijklmnop",
  "glpat" + "-abcdefghij0123456789",
  "sk" + "_live_" + "51HrandomStripeSecretKey00",
  "AIza" + "SyD-random-google-api-key-000000000",
  "Zm9vYmFyYmF6cXV4c2VjcmV0aGlnaGVudHJvcHlibG9i9999",
  // client org / identifiers, all cases
  "AcmeCorp", "acmecorp", "ACMECORP", "acmeCorp",
  "orderSyncService", "CartController", "customerTaxProfile", "useLeocorpCart",
  "CUSTOMERX_API", "leocorp-theme-fork",
  // paths (Win / UNC / POSIX / extensionless)
  "C:\\src\\Acme\\Cart.cs", "\\\\server\\share\\secret.cs",
  "/home/user/acme/checkout.ts", "src/handlers/acmeCheckout",
  // URLs / emails / tickets
  "https://acme.example.com/internal/portal?tok=abc",
  "dev@acme-client.com", "ACME-1234",
  // non-latin org/identifiers
  "ОООРомашка", "株式会社アクメ", "клиентскийМодуль",
  // JSON-escaping class (adversarial review #5, GAP 1) — a raw JSON.stringify().includes() scan
  // is BLIND to these because stringify escapes them; assertNoLeak walks decoded values instead.
  "Acme\\Corp", 'Acme"Corp', "Acme\nCorp", "Acme\tCorp", "AcmeCorp", "\\\\Acme\\share",
];

test("PROPERTY: no adversarial client byte reaches the reduced+validated struct (any slot)", () => {
  for (const bad of ADVERSARIAL) {
    const struct = validateUpstream(reduce({
      spans: spansWithInjectedText(bad),
      feedback: [{ verdict: "down", text: bad }, { verdict: "up", text: bad }],
      pluginVersion: bad, // even a poisoned version must not survive
      sessionCount: 1,
    }));
    assertNoLeak(struct, bad); // recursive decoded-value scan (escaping-proof)
    assertAllFieldsInVocabulary(struct);
    // the plugin fact still travels: a flagged skill produced a finding
    assert.equal(struct.findings.length, 1);
    assert.equal(struct.findings[0].verdict, "BROKEN");
    // feedback carried as COUNTS only, no text
    assert.deepEqual(struct.feedback, { up: 1, down: 1 });
  }
});

// REGRESSION (adversarial review A): a client blob smuggled through the pluginVersion SHAPE
// gate as a `X.Y.Z-<suffix>` prerelease tail. The old validator echoed the whole matching
// string; the fuzz block above never prepended a valid `d.d.d-` prefix, so it missed this.
// Cover BOTH the reduce source and the DIAG-fallback source, and every case shape.
test("PROPERTY (regression): a X.Y.Z-<client blob> pluginVersion is reduced to the numeric triple, never echoed", () => {
  for (const blob of ["AcmeCorp", "github_pat_11ABxz0aai0abcdefghijklmnop", "C:\\src\\x.cs", "leocorpCheckout", "ОООРомашка"]) {
    for (const ver of [`1.0.0-${blob}`, `12.34.56-${blob}.build.99`, `0.0.0-${blob}`]) {
      // via reduce's own pluginVersion arg
      const a = validateUpstream(reduce({ spans: [], feedback: [], pluginVersion: ver }));
      assertNoLeak(a, blob);
      assert.match(a.pluginVersion, /^\d{1,4}\.\d{1,4}\.\d{1,4}$/);
      // via the validateUpstream boundary directly (a poisoned struct)
      const b = validateUpstream({ schemaVersion: 1, pluginVersion: ver, findings: [], feedback: { up: 0, down: 0 }, sessionCount: 1 });
      assertNoLeak(b, blob);
    }
  }
  // a non-numeric-prefixed value → "unknown"
  assert.equal(validateUpstream(reduce({ spans: [], pluginVersion: "AcmeCorp" })).pluginVersion, "unknown");
});

test("PROPERTY: fuzz random client-shaped byte soup never leaks and always validates", () => {
  // deterministic pseudo-random (no Math.random — reproducible)
  let seed = 1337;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  // alphabet includes the JSON-escaping class (\ " newline tab) + non-latin (GAP 1 coverage).
  const alphabet = 'ABCDEFGHIJKLMNOPqrstuvwxyz0123456789_-./\\:@ОООあ株"\n\t';
  for (let i = 0; i < 300; i++) {
    let bad = "";
    const len = 8 + Math.floor(rnd() * 40);
    for (let j = 0; j < len; j++) bad += alphabet[Math.floor(rnd() * alphabet.length)];
    const struct = validateUpstream(reduce({
      spans: spansWithInjectedText(bad, { outcome: i % 2 ? "degraded" : "silent_suspect" }),
      feedback: [{ verdict: "down", text: bad }],
      pluginVersion: bad,
    }));
    assertNoLeak(struct, bad); // escaping-proof recursive scan
    assertAllFieldsInVocabulary(struct);
  }
});

// ─── classifyError ───────────────────────────────────────────────────────────────
test("classifyError: maps representative snippets to the right code; unknown → UNKNOWN", () => {
  const cases = [
    ["fatal: ! [rejected] main -> main (non-fast-forward)", "GIT_PUSH_REJECTED"],
    ["CONFLICT (content): Merge conflict in file", "GIT_CONFLICT"],
    ["error TS2322: Type 'x' is not assignable", "HOOK_TSC_ERROR"],
    ["3 failing\n  1) expect(x).toBe(y)", "TEST_FAILED"],
    ["Cannot find module 'foo'", "MODULE_NOT_FOUND"],
    ["gh: command not found", "DEP_MISSING"],
    ["HTTP 403: Resource not accessible by integration (missing scope)", "AUTH_MISSING_SCOPE"],
    ["401 Unauthorized: Bad credentials", "AUTH_EXPIRED"],
    ["API rate limit exceeded (429)", "RATE_LIMITED"],
    ["permission denied: user declined", "PERMISSION_DENIED"],
    ["getaddrinfo ENOTFOUND api.github.com", "NETWORK_DNS"],
    ["request failed: ETIMEDOUT", "NETWORK_TIMEOUT"],
    ["ENOENT: no such file or directory", "FILE_NOT_FOUND"],
    ["EACCES: permission denied, open", "PATH_DENIED"],
    ["500 Internal Server Error", "HTTP_5XX"],
    ["FIX_STATUS: FAILED — cannot reproduce", "BAIL_LEGIT"],
    ["some totally benign narration", "UNKNOWN"],
    ["", "UNKNOWN"],
  ];
  for (const [snip, code] of cases) {
    const got = classifyError(snip);
    assert.equal(got, code, `classifyError("${snip.slice(0, 30)}") → ${got}, expected ${code}`);
    assert.ok(ERROR_CODES.includes(got));
  }
});

test("classifyError (review #4 B1): specific-before-generic ordering fixes", () => {
  const cases = [
    ["504 Gateway Timeout", "HTTP_5XX"],                       // not NETWORK_TIMEOUT (bare 'timeout' removed)
    ["HTTP 503 Service Unavailable", "HTTP_5XX"],
    ["Error: Timeout of 2000ms exceeded", "TEST_FAILED"],      // mocha test timeout, not NETWORK_TIMEOUT
    ["Test timed out after 5000ms", "TEST_FAILED"],
    ["✗ Build failed: webpack error", "BUILD_FAILED"],          // not TEST_FAILED (build before test)
    ["✗ renders the cart correctly", "TEST_FAILED"],            // a real failing test still TEST_FAILED
    ["Compilation failed. Found 431 errors.", "BUILD_FAILED"],  // not HTTP_4XX via a bare '431'
    ["request failed: ECONNREFUSED 127.0.0.1:5432", "NETWORK_TIMEOUT"],
    ["connection timed out after 30s", "NETWORK_TIMEOUT"],
    ["request failed with status 500", "HTTP_5XX"],             // http-context number
    ["processed 500 items successfully", "UNKNOWN"],            // bare count, NO http context → not HTTP_5XX
  ];
  for (const [snip, code] of cases) {
    assert.equal(classifyError(snip), code, `classifyError("${snip}") expected ${code}`);
    assert.ok(ERROR_CODES.includes(classifyError(snip)));
  }
});

test("classifyError: NEVER echoes its input — output is always a fixed code", () => {
  const bad = "AcmeCorp.CartController at C:\\src\\secret.cs github_pat_leak000000000000000000";
  const code = classifyError(bad);
  assert.ok(ERROR_CODES.includes(code));
  assert.ok(!code.includes("Acme") && !code.includes("secret") && !code.includes("github_pat"));
});

// ─── validateUpstream — the boundary barrier coerces a poisoned struct ───────────
test("validateUpstream: a rogue string in an enum slot is coerced to the safe default", () => {
  const poisoned = {
    schemaVersion: 999,
    pluginVersion: "AcmeCorp-1.2",
    findings: [{
      skill: "AcmeCheckoutSkill", verdict: "PWNED", severity: "S9", outcome: "exfiltrated",
      signalClass: "leak", struggle: ["retry_storm", "evil_signal"], errorCode: "STEAL_DATA",
      toolFamily: "client_mcp", repoKind: "acme-repo", retries: 9999, occurrences: -3,
    }],
    feedback: { up: -1, down: "lots" },
    sessionCount: 0,
  };
  const s = validateUpstream(poisoned);
  for (const n of ["Acme", "PWNED", "exfiltrated", "STEAL_DATA", "evil_signal", "client_mcp", "acme-repo"]) assertNoLeak(s, n);
  assertAllFieldsInVocabulary(s); // strict shape: no rogue extra field survived either
  const f = s.findings[0];
  assert.deepEqual(
    { skill: f.skill, verdict: f.verdict, severity: f.severity, outcome: f.outcome, signalClass: f.signalClass, errorCode: f.errorCode, toolFamily: f.toolFamily, repoKind: f.repoKind },
    { skill: "other", verdict: "OK", severity: "S0", outcome: "failed", signalClass: "none", errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown" }
  );
  assert.deepEqual(f.struggle, ["retry_storm"]); // evil_signal dropped
  assert.equal(f.retries, 99); // clamped
  assert.equal(f.occurrences, 1); // clamped up
  assert.equal(s.pluginVersion, "unknown");
  assert.equal(s.feedback.up, 0);
  assert.equal(s.feedback.down, 0);
  assert.equal(s.sessionCount, 1);
});

// ─── reduce mapping ───────────────────────────────────────────────────────────────
test("reduce: a clean session (no flagged spans) → zero findings", () => {
  const s = reduce({ spans: [{ type: "span", id: "1", parentId: null, kind: "skill", name: "qa-fix", status: "ok", outcome: "success", signals: {}, details: [] }], pluginVersion: "0.8.1" });
  assert.equal(s.findings.length, 0);
  assert.equal(s.pluginVersion, "0.8.1");
});

test("reduce: outcome → verdict/severity is deterministic", () => {
  const mk = (outcome) => reduce({ spans: [{ type: "span", id: "1", parentId: null, kind: "skill", name: "qa-bug", status: "error", outcome, signals: { tool_error: 1 }, details: [] }] }).findings[0];
  assert.deepEqual([mk("failed").verdict, mk("failed").severity], ["BROKEN", "S1"]);
  assert.deepEqual([mk("silent_suspect").verdict, mk("silent_suspect").severity], ["BROKEN", "S1"]);
  assert.deepEqual([mk("degraded").verdict, mk("degraded").severity], ["DEGRADED", "S2"]);
});

test("reduce: signalClass, toolFamily, repoKind, errorCode derived from spans", () => {
  const spans = [
    { type: "span", id: "s", parentId: null, kind: "command", name: "qa-fix", status: "error", outcome: "failed", struggle: [], retries: 1, signals: { tool_error: 0, permission_denied: 1, hook_failure: 0, stop_bail: 0 }, details: [{ cls: "permission_denied", snippet: "HTTP 403 forbidden: missing scope" }] },
    { type: "span", id: "t", parentId: "s", kind: "tool", name: "mcp__github__create_pull_request", status: "error", outcome: "failed", signals: { permission_denied: 1 }, details: [] },
    { type: "span", id: "a", parentId: "s", kind: "agent", name: "fullstack-frontend", status: "error", outcome: "failed", signals: {}, details: [] },
  ];
  const f = reduce({ spans }).findings[0];
  assert.equal(f.skill, "qa-fix");
  assert.equal(f.signalClass, "permission_denied");
  assert.equal(f.toolFamily, "github");
  assert.equal(f.repoKind, "frontend");
  assert.equal(f.errorCode, "AUTH_MISSING_SCOPE");
});

test("reduce: vc-self-check's own flagged span is dropped (loop guard)", () => {
  const s = reduce({ spans: [{ type: "span", id: "1", parentId: null, kind: "command", name: "vc-self-check", status: "error", outcome: "failed", signals: { tool_error: 1 }, details: [] }] });
  assert.equal(s.findings.length, 0);
});

test("reduce: the removed DIAG-fallback path is gone — fallbackFindings is IGNORED (item 2)", () => {
  // DIAG-*.md no longer exists, so reduce reads ONLY the structured jsonl. A leftover
  // `fallbackFindings` field (there is no producer for it any more) must not resurrect a finding.
  const s = reduce({ spans: [], pluginVersion: "0.8.1", fallbackFindings: [
    { skill: "qa-fix", verdict: "BROKEN", sev: "S1", signal: "AcmeCorp leaked here", fix: "C:\\src\\x.cs" },
  ] });
  assert.equal(s.findings.length, 0, "fallbackFindings is dead input — no finding, no prose channel");
  assertAllFieldsInVocabulary(s);
});

test("Gap D: degenerate inputs yield the empty safe struct and never throw", () => {
  for (const bad of [undefined, null, [], "str", 42, { junk: 1 }]) {
    const s = validateUpstream(bad);
    assertAllFieldsInVocabulary(s);
    assert.equal(s.findings.length, 0);
    assert.deepEqual(s.feedback, { up: 0, down: 0 });
  }
  assertAllFieldsInVocabulary(reduce());
  assertAllFieldsInVocabulary(reduce({}));
});

test("Gap E: numeric clamps hold at the UPPER end + truncation + Infinity + numeric strings", () => {
  const mk = (over) => validateUpstream({ schemaVersion: 1, pluginVersion: "0.8.1", feedback: { up: 1e12, down: Infinity }, sessionCount: "1e999", findings: [{ skill: "qa-fix", verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "none", struggle: [], errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown", ...over }] });
  const big = mk({ retries: 1e12, occurrences: 9.7 });
  assert.equal(big.findings[0].retries, 99); // clamped to hi
  assert.equal(big.findings[0].occurrences, 9); // truncated (Math.trunc)
  assert.equal(big.feedback.up, 1_000_000); // clamped to hi
  assert.equal(big.feedback.down, 0); // Infinity → lo (not finite)
  assert.equal(big.sessionCount, 1); // "1e999" → NaN via trunc → lo
  const frac = mk({ retries: 9.7, occurrences: 1e20 });
  assert.equal(frac.findings[0].retries, 9);
  assert.equal(frac.findings[0].occurrences, 1_000_000);
});

test("toolFamily / repoKindOfAgent: closed-vocabulary mapping", () => {
  assert.equal(toolFamily("Edit"), "edit");
  assert.equal(toolFamily("Read"), "read");
  assert.equal(toolFamily("Bash"), "bash");
  assert.equal(toolFamily("mcp__playwright-chrome__browser_click"), "browser");
  assert.equal(toolFamily("mcp__atlassian__transitionJiraIssue"), "tracker");
  assert.equal(toolFamily("mcp__someClientServer__doThing"), "mcp_other");
  assert.equal(toolFamily(""), "none");
  assert.equal(repoKindOfAgent("fullstack-frontend"), "frontend");
  assert.equal(repoKindOfAgent("fullstack-backend"), "backend");
  assert.equal(repoKindOfAgent("some-client-agent"), "unknown");
});

// ─── fingerprintStruct ─────────────────────────────────────────────────────────────
const structOf = (over = {}) => validateUpstream({ schemaVersion: 1, pluginVersion: "0.8.1", findings: [{ skill: "qa-fix", verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "permission_denied", struggle: [], errorCode: "AUTH_MISSING_SCOPE", toolFamily: "github", repoKind: "backend", retries: 1, occurrences: 1, ...over }], feedback: { up: 0, down: 0 }, sessionCount: 1 });

test("fingerprintStruct: stable for identical structs", () => {
  assert.equal(fingerprintStruct(structOf()), fingerprintStruct(structOf()));
});

test("fingerprintStruct: distinct for a distinct structural tuple", () => {
  assert.notEqual(fingerprintStruct(structOf()), fingerprintStruct(structOf({ errorCode: "NETWORK_TIMEOUT" })));
});

test("fingerprintStruct: independent of pluginVersion (a bump must not fork the issue)", () => {
  const a = validateUpstream({ ...structOf(), pluginVersion: "0.8.1" });
  const b = validateUpstream({ ...structOf(), pluginVersion: "0.9.0" });
  assert.equal(fingerprintStruct(a), fingerprintStruct(b));
});

test("fingerprintStruct: a feedback-only struct does NOT collapse to a constant (D2)", () => {
  const down = validateUpstream({ schemaVersion: 1, pluginVersion: "0.8.1", findings: [], feedback: { up: 0, down: 1 }, sessionCount: 1 });
  const up = validateUpstream({ schemaVersion: 1, pluginVersion: "0.8.1", findings: [], feedback: { up: 1, down: 0 }, sessionCount: 1 });
  assert.notEqual(fingerprintStruct(down), fingerprintStruct(up));
});

test("findingStructSig: over enum fields only (ignores occurrences/retries)", () => {
  const a = structOf({ occurrences: 1, retries: 1 }).findings[0];
  const b = structOf({ occurrences: 9, retries: 7 }).findings[0];
  assert.equal(findingStructSig(a), findingStructSig(b));
});

// ─── fingerprint dedup semantics (review #2, break 2a) ──────────────────────────────
test("fingerprintStruct (2a): the SAME finding dedups across clients regardless of feedback", () => {
  const F = { skill: "qa-fix", verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "permission_denied", struggle: [], errorCode: "AUTH_MISSING_SCOPE", toolFamily: "github", repoKind: "backend", retries: 1, occurrences: 1 };
  const clientA = validateUpstream({ schemaVersion: 1, pluginVersion: "0.8.1", findings: [F], feedback: { up: 0, down: 0 }, sessionCount: 1 });
  const clientB = validateUpstream({ schemaVersion: 1, pluginVersion: "0.8.1", findings: [F], feedback: { up: 0, down: 1 }, sessionCount: 1 });
  assert.equal(fingerprintStruct(clientA), fingerprintStruct(clientB), "same finding must converge to one upstream issue even if one client also left feedback");
});
test("fingerprintStruct (D2): a feedback-ONLY report still distinguishes 👍 vs 👎", () => {
  const up = validateUpstream({ schemaVersion: 1, pluginVersion: "0.8.1", findings: [], feedback: { up: 1, down: 0 }, sessionCount: 1 });
  const down = validateUpstream({ schemaVersion: 1, pluginVersion: "0.8.1", findings: [], feedback: { up: 0, down: 1 }, sessionCount: 1 });
  assert.notEqual(fingerprintStruct(up), fingerprintStruct(down));
});

// ─── v3: findingKey — the PER-FINDING dedup identity (item 3) ────────────────────────
test("findingKey: identity is (skill, subject) ONLY — severity/verdict/errorCode do NOT enter it", () => {
  // The #173/#174 reproduction: two sessions graded the SAME defect differently (S2/UNKNOWN vs
  // S1/HTTP_4XX). If the dedup key folded severity/verdict/errorCode they would NOT converge.
  const a = { skill: "project-init", subject: "tracker_field_contract", severity: "S2", verdict: "DEGRADED", errorCode: "UNKNOWN", outcome: "degraded" };
  const b = { skill: "project-init", subject: "tracker_field_contract", severity: "S1", verdict: "BROKEN", errorCode: "HTTP_4XX", outcome: "failed" };
  assert.equal(findingKey(a), findingKey(b), "same (skill,subject) → same key regardless of severity/verdict/errorCode");
  assert.equal(findingKey(a), "project-init/tracker_field_contract");
});
test("findingKey: a different subject or skill IS a different defect", () => {
  assert.notEqual(findingKey({ skill: "qa-bug", subject: "ado_create_workitem" }), findingKey({ skill: "qa-bug", subject: "admin_credential_handoff" }));
  assert.notEqual(findingKey({ skill: "qa-bug", subject: "ado_create_workitem" }), findingKey({ skill: "qa-fix", subject: "ado_create_workitem" }));
  // out-of-vocab halves coerce, never echo
  assert.equal(findingKey({ skill: "AcmeSkill", subject: "/c/acme/Checkout.cs" }), "other/other");
});
test("severityRank / verdictRank: comparable so an issue title can be upgraded S2→S1", () => {
  assert.ok(severityRank("S1") > severityRank("S2") && severityRank("S2") > severityRank("S3"));
  assert.ok(verdictRank("BROKEN") > verdictRank("DEGRADED") && verdictRank("DEGRADED") > verdictRank("OK"));
});

// ─── code review #2: silent_suspect vs failed must fingerprint the SAME ──────────────
// The primary jsonl path emits the Tier-1 outcome verbatim (a silent span → `silent_suspect`),
// while the DIAG-fallback derives outcome from the verdict (BROKEN → `failed`). The SAME defect
// seen by a jsonl-present client and a DIAG-only client must converge on ONE upstream issue, not
// fork on that outcome difference — else "+1 occurrence" dedup silently breaks on exactly the
// silent-failure class (the highest-value signal).
test("code review #2: a silent_suspect finding and its failed twin share a fingerprint", () => {
  const silent = structOf({ outcome: "silent_suspect", verdict: "BROKEN", severity: "S1", signalClass: "none", errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown", struggle: [], retries: 0 });
  const failed = structOf({ outcome: "failed", verdict: "BROKEN", severity: "S1", signalClass: "none", errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown", struggle: [], retries: 0 });
  assert.equal(findingStructSig(silent.findings[0]), findingStructSig(failed.findings[0]), "sig collapses silent_suspect↔failed");
  assert.equal(fingerprintStruct(silent), fingerprintStruct(failed), "same fingerprint → converges to one upstream issue");
  // but the emitted struct still carries the TRUE outcome in each body
  assert.equal(silent.findings[0].outcome, "silent_suspect");
  assert.equal(failed.findings[0].outcome, "failed");
});
test("code review #2: canonicalization does NOT collapse a genuinely different verdict", () => {
  const broken = structOf({ outcome: "failed", verdict: "BROKEN", severity: "S1" });
  const degraded = structOf({ outcome: "degraded", verdict: "DEGRADED", severity: "S2" });
  assert.notEqual(fingerprintStruct(broken), fingerprintStruct(degraded));
});

// ─── code review #3: re-emitted / repeated spans collapse to one finding ─────────────
// A transcript rotation/compaction (scanTranscript's `size < scannedBytes` branch) re-scans from
// scratch and re-emits a span with a FRESH id, which reduce()'s id-dedup can't catch. Left as-is
// the duplicate inflates the body AND forks the fingerprint (its sig is the sorted finding list).
test("code review #3: two spans with the SAME signature but different ids collapse to one finding", () => {
  const mkSpan = (id) => ({
    type: "span", id, parentId: null, kind: "skill", name: "qa-fix", status: "error",
    outcome: "failed", struggle: [], retries: 0,
    signals: { tool_error: 1, permission_denied: 0, hook_failure: 0, stop_bail: 0 }, details: [],
  });
  // same defect re-emitted under two ids (id-dedup sees them as distinct)
  const struct = validateUpstream(reduce({ spans: [mkSpan("s-0"), mkSpan("s-9")], pluginVersion: "0.8.1" }));
  assert.equal(struct.findings.length, 1, "same-signature spans collapse to ONE finding");
  // and the fingerprint matches the single-span case (no fork)
  const single = validateUpstream(reduce({ spans: [mkSpan("s-0")], pluginVersion: "0.8.1" }));
  assert.equal(fingerprintStruct(struct), fingerprintStruct(single), "duplicate re-emission does not fork the fingerprint");
});
test("code review #3: two DIFFERENT-signature spans are BOTH kept", () => {
  const a = { type: "span", id: "a", parentId: null, kind: "skill", name: "qa-fix", status: "error", outcome: "failed", struggle: [], retries: 0, signals: { tool_error: 1, permission_denied: 0, hook_failure: 0, stop_bail: 0 }, details: [] };
  const b = { type: "span", id: "b", parentId: null, kind: "skill", name: "qa-bug", status: "error", outcome: "failed", struggle: [], retries: 0, signals: { tool_error: 1, permission_denied: 0, hook_failure: 0, stop_bail: 0 }, details: [] };
  const struct = validateUpstream(reduce({ spans: [a, b], pluginVersion: "0.8.1" }));
  assert.equal(struct.findings.length, 2);
});

// ─── v3: the vendor-provenance string channel (item 5) ───────────────────────────────
// The plugin file the finding cites — a real vendor source line.
const PLUGIN_FILE = "skills/project-init/discover-tracker.mjs";
const PLUGIN_SRC = 'const url = `${base}/${project}/_apis/wit/workitemtypes/${type}/fields?$expand=Properties`;\nreturn fetchJson(url);\n';
const ctxOf = (over = {}) => ({
  files: new Map([[PLUGIN_FILE, PLUGIN_SRC]]),
  denyValues: over.denyValues ?? [],
  states: over.states ?? [],
});

test("v3 provenance: a proven code excerpt + offending literal from the cited plugin file TRAVELS", () => {
  const f = {
    skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
    signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown",
    retries: 0, occurrences: 1,
    pluginFile: PLUGIN_FILE, pluginLine: 232,
    codeExcerpt: "?$expand=Properties`;",
    offendingLiteral: "$expand=Properties",
    apiShape: "GET {base}/{project}/_apis/wit/workitemtypes/{type}/fields?$expand=…",
    proposedFix: "drop $expand=Properties and request ?api-version=7.1",
  };
  const s = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", findings: [f], feedback: { up: 0, down: 0 }, sessionCount: 1 }, ctxOf());
  const g = s.findings[0];
  assert.equal(g.pluginFile, PLUGIN_FILE);
  assert.equal(g.pluginLine, 232);
  assert.equal(g.offendingLiteral, "$expand=Properties");
  assert.ok(g.codeExcerpt.includes("$expand=Properties"));
  assert.equal(g.apiShape, "GET {base}/{project}/_apis/wit/workitemtypes/{type}/fields?$expand=…");
  assert.equal(g.proposedFix, "drop $expand=Properties and request ?api-version=7.1");
});

test("v3 provenance (item 7): a codeExcerpt NOT present in the cited plugin file is REJECTED (dropped, finding survives)", () => {
  const f = {
    skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
    signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
    pluginFile: PLUGIN_FILE, pluginLine: 5,
    codeExcerpt: "const secret = process.env.CLIENT_ACME_KEY; // never in the real file",
    offendingLiteral: "CLIENT_ACME_KEY",
  };
  const s = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", findings: [f], feedback: { up: 0, down: 0 }, sessionCount: 1 }, ctxOf());
  const g = s.findings[0];
  assert.equal(g.codeExcerpt, null, "unproven excerpt is dropped");
  assert.equal(g.offendingLiteral, null, "unproven literal is dropped");
  assert.equal(g.pluginFile, PLUGIN_FILE, "the file citation itself is fine");
  assert.equal(g.verdict, "BROKEN", "the finding SURVIVES — never dropped for a bad optional string");
  assertNoLeak(s, "CLIENT_ACME_KEY");
});

test("v3 provenance: NO ctx ⇒ every v3 string is dropped (fail closed)", () => {
  const f = {
    skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
    signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
    pluginFile: PLUGIN_FILE, pluginLine: 232, codeExcerpt: "?$expand=Properties`;", offendingLiteral: "$expand=Properties",
  };
  const s = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", findings: [f], feedback: { up: 0, down: 0 }, sessionCount: 1 }); // no ctx
  for (const k of V3_STRING_KEYS) assert.equal(s.findings[0][k], null, `${k} dropped without a ctx`);
});

test("v3 boundaryDenial (item 7): rejects URL host / absolute path / email / token / GUID / IP", () => {
  assert.ok(boundaryDenial("see https://acme.example.com/x"));
  assert.ok(boundaryDenial("acme.example.com is the org"));
  assert.ok(boundaryDenial("C:\\src\\Acme\\Cart.cs"));
  assert.ok(boundaryDenial("/home/user/acme/checkout.ts"));
  assert.ok(boundaryDenial("ping dev@acme-client.com"));
  assert.ok(boundaryDenial("token github_pat_11ABxz0aai0abcdefghijklmnopqrstuv"));
  assert.ok(boundaryDenial("projectId 6f1c2b3a-1111-2222-3333-444455556666"));
  assert.ok(boundaryDenial("host at 10.0.12.34"));
  assert.equal(boundaryDenial("drop $expand=Properties and request ?api-version=7.1"), null, "clean plugin prose passes");
});

test("v3 boundaryDenial (item 7): rejects a client value from .env / profile, and a work-item state name", () => {
  assert.ok(boundaryDenial("the org is LeoCorpWebStore", { denyValues: ["LeoCorpWebStore"] }));
  assert.ok(boundaryDenial("blocked in On Review state", { states: ["On Review"] }));
  assert.equal(boundaryDenial("the field contract request was rejected", { denyValues: ["LeoCorpWebStore"], states: ["On Review"] }), null);
});

test("v3 violatesFieldNamespace: System.* / Microsoft.VSTS.* allowed; a custom namespace denied; JS code allowed", () => {
  assert.equal(violatesFieldNamespace("System.AreaId and System.IterationId are required"), false);
  assert.equal(violatesFieldNamespace("Microsoft.VSTS.Common.Priority missing"), false);
  assert.ok(violatesFieldNamespace("Leo.Bug.Severity is a custom field")); // client process
  assert.ok(violatesFieldNamespace("Custom.ReviewState blocks the POST"));
  assert.equal(violatesFieldNamespace("call JSON.stringify(x) then Object.keys(y)"), false); // ordinary code
});

test("v3 §6b normalizeVendorMessage: GUIDs/emails/URLs/paths/IPs/tokens → placeholders, single line, capped", () => {
  const raw = "Project 6f1c2b3a-1111-2222-3333-444455556666 at https://leo.example.com failed for a@b.com\non C:\\src\\x.cs from 10.0.0.1 token github_pat_11ABxz0aai0abcdefghijklmnop";
  const n = normalizeVendorMessage(raw);
  assert.ok(!/\r|\n/.test(n), "single line");
  assert.ok(n.length <= 300);
  for (const leak of ["6f1c2b3a", "leo.example.com", "a@b.com", "C:\\src", "10.0.0.1", "github_pat_"]) assert.ok(!n.includes(leak), `normalized away: ${leak}`);
  assert.ok(n.includes("<guid>") && n.includes("<url>") && n.includes("<email>"));
});

test("v3 §6b (item 10): a vendor message with a surviving client org is DROPPED while the finding survives", () => {
  const f = {
    skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
    signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
    vendorErrorTypeKey: "RuleValidationException",
    vendorHttpStatus: 400,
    vendorErrorMessage: "TF401347: field is required for project LeoCorpWebStore process",
  };
  const s = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", findings: [f], feedback: { up: 0, down: 0 }, sessionCount: 1 }, ctxOf({ denyValues: ["LeoCorpWebStore"] }));
  const g = s.findings[0];
  assert.equal(g.vendorErrorMessage, null, "message carrying the client org is dropped");
  assert.equal(g.vendorErrorTypeKey, "RuleValidationException", "the vendor's OWN enum still travels (§6a)");
  assert.equal(g.vendorHttpStatus, 400);
  assert.equal(g.verdict, "BROKEN", "finding survives");
  assertNoLeak(s, "LeoCorpWebStore");
});

test("v3 §6a: vendorErrorTypeKey/code/status travel for an ADO 4xx; a doc URL only on the allowlist", () => {
  const base = {
    skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
    signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
    vendorErrorTypeKey: "RuleValidationException", vendorErrorCode: "TF401347", vendorHttpStatus: 400,
  };
  const good = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", findings: [{ ...base, vendorDocUrl: `https://${VENDOR_DOC_HOSTS[0]}/azure/devops/x` }], feedback: { up: 0, down: 0 }, sessionCount: 1 }, ctxOf());
  assert.equal(good.findings[0].vendorErrorTypeKey, "RuleValidationException");
  assert.equal(good.findings[0].vendorErrorCode, "TF401347");
  assert.equal(good.findings[0].vendorHttpStatus, 400);
  assert.ok(good.findings[0].vendorDocUrl.includes(VENDOR_DOC_HOSTS[0]));
  // an off-allowlist doc host is dropped
  const bad = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", findings: [{ ...base, vendorDocUrl: "https://acme.example.com/doc" }], feedback: { up: 0, down: 0 }, sessionCount: 1 }, ctxOf());
  assert.equal(bad.findings[0].vendorDocUrl, null);
  assertNoLeak(bad, "acme.example.com");
});

test("v3 PROPERTY: adversarial bytes injected into every v3 string slot never leak", () => {
  // v3 lets a string travel IF it is either vendor-provenance (a substring of the cited plugin file)
  // or boundary-clean. The realistic threat model is that the client's OWN identifiers are known
  // from `.env.*` / `project-profile.json` — `buildProvenanceCtx` collects exactly those into
  // `denyValues`. So we pass every adversarial fixture as a denyValue and assert none survives.
  // (The provenance fields drop regardless: `bad` is never a substring of the plugin file, and a
  // `bad` pluginFile fails the relative-path shape.)
  const denyValues = [...ADVERSARIAL];
  for (const bad of ADVERSARIAL) {
    const f = {
      skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
      signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
      pluginFile: bad, pluginLine: 1, codeExcerpt: bad, offendingLiteral: bad, apiShape: bad, proposedFix: bad,
      vendorErrorTypeKey: bad, vendorErrorName: bad, vendorErrorCode: bad, vendorHttpStatus: bad, vendorDocUrl: bad, vendorErrorMessage: bad,
    };
    const s = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", findings: [f], feedback: { up: 0, down: 0 }, sessionCount: 1 }, ctxOf({ denyValues }));
    assertNoLeak(s, bad);
    assertAllFieldsInVocabulary(s);
  }
});

test("v3 PROPERTY: a model-authored string with NO namable client value + NO provenance is still dropped for the provenance fields but MAY pass for apiShape/proposedFix", () => {
  // The deliberate v3 relaxation: apiShape/proposedFix are model-authored and travel when
  // boundary-clean. This documents that a benign, client-free string DOES travel (that is the whole
  // point of v3 — a useful payload), while codeExcerpt/offendingLiteral STILL require provenance.
  const f = {
    skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
    signalClass: "tool_error", struggle: [], errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown", retries: 0, occurrences: 1,
    pluginFile: PLUGIN_FILE, pluginLine: 232,
    codeExcerpt: "this text is not in the file", offendingLiteral: "alsoNotInFile",
    apiShape: "GET {base}/{project}/_apis/wit/…", proposedFix: "request api-version 7.1 instead",
  };
  const s = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", findings: [f], feedback: { up: 0, down: 0 }, sessionCount: 1 }, ctxOf());
  const g = s.findings[0];
  assert.equal(g.codeExcerpt, null, "no provenance → dropped");
  assert.equal(g.offendingLiteral, null, "no provenance → dropped");
  assert.equal(g.apiShape, "GET {base}/{project}/_apis/wit/…", "boundary-clean model string travels (v3 intent)");
  assert.equal(g.proposedFix, "request api-version 7.1 instead");
});

test("v3: nodeVersion + os are the RUNTIME, coerced to a bounded shape", () => {
  const s = validateUpstream({ schemaVersion: 3, pluginVersion: "0.8.2", nodeVersion: "v22.22.2-AcmeBuild", os: "win32", findings: [], feedback: { up: 0, down: 0 }, sessionCount: 1 });
  assert.equal(s.nodeVersion, "v22.22.2"); // suffix discarded
  assert.equal(s.os, "win32");
  assert.equal(validateUpstream({ os: "AcmeOS" }).os, "other"); // out-of-vocab → other
  assertNoLeak(s, "AcmeBuild");
});
