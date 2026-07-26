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
  reduce, validateUpstream, classifyError, fingerprintStruct, findingStructSig,
  toolFamily, repoKindOfAgent,
  SKILLS, VERDICTS, SEVERITIES, OUTCOMES, SIGNAL_CLASSES, STRUGGLES,
  TOOL_FAMILIES, REPO_KINDS, ERROR_CODES, SCHEMA_VERSION,
} from "../../plugins/vc-fix/skills/vc-self-check/upstream-reduce.mjs";
import { mergeStructs, parseDiag } from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";

// The EXACT key sets the struct must have — a strict-shape check so an UNFORESEEN extra field
// carrying client bytes fails, not just the known fields (adversarial review #5, GAP 1).
const TOP_KEYS = ["schemaVersion", "pluginVersion", "findings", "feedback", "sessionCount"];
const FINDING_KEYS = ["skill", "verdict", "severity", "outcome", "signalClass", "struggle", "errorCode", "toolFamily", "repoKind", "retries", "occurrences"];
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

test("reduce: enum-only fallback when jsonl is absent (only DIAG survived)", () => {
  const s = reduce({ spans: [], pluginVersion: "0.8.1", fallbackFindings: [
    { skill: "qa-fix", verdict: "BROKEN", sev: "S1", signal: "AcmeCorp leaked here", fix: "C:\\src\\x.cs" },
    { skill: "AcmeSkill", verdict: "DEGRADED", sev: "S2", signal: "x", fix: "y" },
  ] });
  assert.equal(s.findings.length, 2);
  assertNoLeak(s, "AcmeCorp leaked here");
  assertNoLeak(s, "C:\\src\\x.cs");
  assertNoLeak(s, "AcmeSkill");
  assertAllFieldsInVocabulary(s);
  assert.equal(s.findings[0].skill, "qa-fix");
  assert.equal(s.findings[0].severity, "S1"); // derived from verdict, not the DIAG cell (B2)
  assert.equal(s.findings[1].skill, "other"); // AcmeSkill → other
});

test("PROPERTY (Gap B): the fallbackFindings path never leaks a poisoned cell, any field", () => {
  for (const bad of ADVERSARIAL) {
    const struct = validateUpstream(reduce({
      spans: [],
      pluginVersion: "0.8.1",
      fallbackFindings: [{ skill: bad, verdict: bad, sev: bad, signal: bad, rootcause: bad, fix: bad }],
    }));
    assertNoLeak(struct, bad);
    assertAllFieldsInVocabulary(struct);
  }
  // a fallback row with a VALID flagged verdict but a poisoned skill still maps skill→other
  const s = validateUpstream(reduce({ spans: [], fallbackFindings: [{ skill: "AcmeSkill", verdict: "BROKEN", sev: "S1" }] }));
  assert.equal(s.findings.length, 1);
  assert.equal(s.findings[0].skill, "other");
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

// ─── GAP 2 (review #5): mergeStructs + parseDiag are exercised with real assertions ──
test("mergeStructs (Gap 2): dedups findings by structural sig, occurrence-counts, sums feedback, no leak", () => {
  const s1 = validateUpstream(reduce({ spans: spansWithInjectedText("AcmeCorp"), feedback: [{ verdict: "down", text: "AcmeCorp broke it" }], pluginVersion: "0.8.1" }));
  const s2 = validateUpstream(reduce({ spans: spansWithInjectedText("leocorpCheckout"), feedback: [{ verdict: "up", text: "leocorpCheckout ok" }], pluginVersion: "0.8.1" }));
  // both sessions reduce to the SAME structural finding (skill "other", failed, none/UNKNOWN/none/unknown)
  const merged = mergeStructs([s1, s2], "0.8.1");
  assertAllFieldsInVocabulary(merged);
  assertNoLeak(merged, "AcmeCorp");
  assertNoLeak(merged, "leocorpCheckout");
  assert.equal(merged.findings.length, 1, "identical structural findings merge to one");
  assert.equal(merged.findings[0].occurrences, 2, "occurrences summed across sessions");
  assert.deepEqual(merged.feedback, { up: 1, down: 1 }, "feedback counts summed");
});
test("mergeStructs: two DIFFERENT structural findings stay separate", () => {
  const a = structOf({ errorCode: "AUTH_MISSING_SCOPE" });
  const b = structOf({ errorCode: "NETWORK_TIMEOUT" });
  const merged = mergeStructs([a, b], "0.8.1");
  assert.equal(merged.findings.length, 2);
});

test("parseDiag + reduce (Gap 2): a poisoned DIAG (Plugin: line + free-text rows) yields no client bytes", () => {
  const md = [
    "# DIAG — s1",
    "- Session: s1 · Plugin: 1.0.0-github_pat_AcmeSecretBlob0000",   // poisoned version-shaped blob
    "## Findings",
    "| Skill | Verdict | Sev | Signal | Root | Fix |",
    "| /qa-fix | BROKEN | S1 | AcmeCorp.CartController at C:\\src\\x.cs | leocorp root cause | github_pat_LEAK000 |",
    "| AcmeCheckoutSkill | DEGRADED | S3 | orderSyncService null | x | y |",
  ].join("\n");
  const parsed = parseDiag(md);
  // parseDiag captures free text (that's fine — LOCAL); the guarantee is the REDUCED struct is clean.
  const struct = validateUpstream(reduce({ spans: [], pluginVersion: parsed.pluginVersion, fallbackFindings: parsed.findings }));
  assertAllFieldsInVocabulary(struct);
  for (const n of ["AcmeCorp", "github_pat_", "C:\\src", "leocorp", "orderSyncService", "AcmeCheckoutSkill", "AcmeSecretBlob"]) assertNoLeak(struct, n);
  assert.equal(struct.pluginVersion, "1.0.0"); // suffix discarded
  // both rows are flagged verdicts → 2 findings; skills coerced (qa-fix kept, AcmeCheckoutSkill→other)
  assert.equal(struct.findings.length, 2);
  assert.deepEqual(struct.findings.map((f) => f.severity).sort(), ["S1", "S2"]); // derived, DIAG's S3 ignored (B2)
});

test("parseDiag (PR#143 R2 F3): the DIAG Skill cell `/qa-fix (command)` normalizes to the bare enum, not `other`", () => {
  // The real DIAG table renders the Skill column as `/qa-fix (command)` / `/qa-bug (skill)`
  // (see skills/vc-self-check/SKILL.md). Before the fix parseDiag kept the cell verbatim and the
  // jsonl-purged fallback coerced every such row to "other" — per-skill fidelity silently lost.
  const md = [
    "## Findings",
    "| Skill | Verdict | Sev | Signal | Root | Fix |",
    "| /qa-fix (command) | BROKEN | S1 | perm denied | auth | check token |",
    "| /qa-bug (skill) | DEGRADED | S2 | search_thrash | lost | tighten step 1 |",
    "| /made-up-thing (command) | BROKEN | S1 | x | y | z |", // unknown → still "other" (fail-safe preserved)
  ].join("\n");
  const parsed = parseDiag(md);
  assert.deepEqual(parsed.findings.map((f) => f.skill), ["qa-fix", "qa-bug", "made-up-thing"]);
  const struct = validateUpstream(reduce({ spans: [], fallbackFindings: parsed.findings }));
  assert.deepEqual(struct.findings.map((f) => f.skill), ["qa-fix", "qa-bug", "other"]);
});
