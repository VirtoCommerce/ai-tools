// Tests for the STRUCT-building path — plugins/vc-fix/skills/vc-self-check/{deliver,upstream-reduce}.mjs.
//
// After the PR #172 rework there is no DIAG markdown to parse and no sidecar to read: the
// diagnostician subagent produces the finding struct and `deliver` receives it on stdin. What
// remains testable here is (a) `reduce()`'s observation folding — the VCST-5582 H analysis half
// that a `recovered` command span left invisible — and (b) `assertNonEmpty(struct)`, the
// information-free-payload guard, now over the struct alone. The end-to-end reproduction runs the
// real CLI with a struct on stdin.
// Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { withTempHome } from "./_test-helpers.mjs";
import {
  main,
  assertNonEmpty,
  hasLocatableEvidence,
  withheldLine,
  buildFindingIssue,
  clusterFindingsByKey,
} from "../../plugins/vc-fix/skills/vc-self-check/deliver.mjs";
import {
  reduce,
  validateUpstream,
  toolFamilyOfSubject,
  subjectEnum,
  findingStructSig,
  SUBJECTS,
  SCHEMA_VERSION,
} from "../../plugins/vc-fix/skills/vc-self-check/upstream-reduce.mjs";

const SID = "1cedb591-52ed-44c7-82b0-a5ec72463ecb";

function stdinOf(obj) {
  const text = obj == null ? "" : JSON.stringify(obj);
  return { isTTY: false, async *[Symbol.asyncIterator]() { if (text) yield text; } };
}

/** Drive deliver.main() with a struct on stdin + a stubbed fetch; returns { plan, exitCode }. */
async function runJson(argv, { struct = null } = {}) {
  const prev = { tok: process.env.GITHUB_FIX_BUGS_TOKEN, write: process.stdout.write, exit: process.exitCode, fetch: globalThis.fetch };
  let out = "";
  process.env.GITHUB_FIX_BUGS_TOKEN = "ghp_classic_test_token";
  process.stdout.write = (s) => { out += s; return true; };
  const okJson = (d) => ({ ok: true, json: async () => d });
  const fetchImpl = async (url, opts = {}) => {
    const u = String(url);
    if ((opts.method || "GET").toUpperCase() === "POST") return okJson({ number: 42, html_url: "http://issue/42" });
    if (u.endsWith("/user")) return { ok: true, status: 200, headers: { get: (k) => (k.toLowerCase() === "x-oauth-scopes" ? "repo, gist" : null) }, json: async () => ({ login: "qa-bot" }) };
    if (u.includes("/search/issues")) return okJson({ items: [] });
    if (u.includes("/issues")) return okJson([]);
    return { ok: true, headers: { get: () => null }, json: async () => ({ permissions: {} }) };
  };
  globalThis.fetch = fetchImpl;
  let exitCode;
  try { await main(argv, { stdin: stdinOf(struct), fetchImpl }); exitCode = process.exitCode ?? 0; }
  finally {
    globalThis.fetch = prev.fetch; process.stdout.write = prev.write; process.exitCode = prev.exit;
    if (prev.tok === undefined) delete process.env.GITHUB_FIX_BUGS_TOKEN; else process.env.GITHUB_FIX_BUGS_TOKEN = prev.tok;
  }
  let plan = null;
  try { plan = JSON.parse(out.trim().split("\n").pop()); } catch { /* non-JSON */ }
  return { plan, out, exitCode };
}

/** The observation stream from the real client session, trimmed to what matters. */
function obsRecords(sid = SID) {
  const base = { type: "obs", sessionId: sid, ts: "2026-07-29T11:52:49.279Z", count: 1, source: "collector" };
  return [
    { ...base, skill: "qa-bug", class: "permission_denied", subject: "bash", code: "UNKNOWN" },
    { ...base, skill: "qa-bug", class: "self_reported_fallback", subject: "bash", code: "NONE" },
    { ...base, skill: "qa-bug", class: "harness_noise", subject: "bash", code: "NONE" },
    { ...base, skill: "qa-bug", class: "script_exit_nonzero", subject: "ado", code: "UNKNOWN" },
    { ...base, skill: "qa-bug", class: "tool_error", subject: "ado", code: "UNKNOWN" },
    { ...base, skill: "qa-bug", class: "tool_error", subject: "mcp_github_search_issues", code: "UNKNOWN" },
    { ...base, skill: "qa-bug", class: "policy_block", subject: "mcp_playwright_edge_browser_run_code_uns", code: "UNKNOWN" },
    // vc-self-check's own observation — must be dropped by the loop guard.
    { ...base, skill: "vc-self-check", class: "script_exit_nonzero", subject: "deliver", code: "UNKNOWN" },
  ];
}

/** The session's spans: the /qa-bug command span ends `recovered` — the deliverable landed. */
function spanRecords(sid = SID) {
  return [{
    type: "span", id: `${sid}-0`, kind: "command", name: "qa-bug", outcome: "recovered", status: "error",
    signals: { tool_error: 4, permission_denied: 2, hook_failure: 0, stop_bail: 0, policy_block: 1 },
    struggle: [], retries: 0,
  }];
}

// ─── item 3 — reduce() must consume the observation stream (VCST-5582 H) ───────────
test("item 3: a session whose ONLY signals are obs records still produces findings", () => {
  const spanOnly = reduce({ spans: spanRecords(), feedback: [], pluginVersion: "0.8.2" });
  assert.equal(spanOnly.findings.length, 0, "the span path alone is empty — this is the incident");
  const withObs = reduce({ spans: spanRecords(), obs: obsRecords(), feedback: [], pluginVersion: "0.8.2" });
  assert.ok(withObs.findings.length > 0, "the observation stream must produce findings");
});

test("item 3: observations merge by subject and name the owning skill", () => {
  const s = validateUpstream(reduce({ spans: [], obs: obsRecords(), feedback: [], pluginVersion: "0.8.2" }));
  const ado = s.findings.find((f) => f.toolFamily === "tracker");
  assert.ok(ado, "the `ado` subject group survives");
  assert.equal(ado.skill, "qa-bug", "the owning skill is named, not coerced to `other`");
  assert.equal(ado.verdict, "DEGRADED");
  assert.equal(ado.severity, "S2", "script_exit_nonzero ⇒ S2 candidate (§1f)");
  assert.equal(ado.signalClass, "tool_error");
  const bash = s.findings.filter((f) => f.toolFamily === "bash" && f.skill === "qa-bug");
  assert.equal(bash.length, 1, "same-subject observations collapse to one finding (§1f rule 1)");
  assert.equal(bash[0].signalClass, "permission_denied");
});

test("item 3: vc-self-check's own observations are dropped (loop guard)", () => {
  const s = reduce({ spans: [], obs: obsRecords(), feedback: [], pluginVersion: "0.8.2" });
  assert.equal(s.findings.some((f) => f.skill === "vc-self-check"), false);
});

test("item 3: a NOISE-only subject never becomes a finding on its own", () => {
  const only = [{ type: "obs", skill: "qa-bug", class: "policy_block", subject: "browser_x", code: "UNKNOWN", count: 1 }];
  assert.equal(reduce({ spans: [], obs: only, pluginVersion: "0.8.2" }).findings.length, 0);
});

test("item 3: an S3-only subject is not contributed upstream", () => {
  const only = [{ type: "obs", skill: "qa-bug", class: "tool_error", subject: "mcp_github_search_issues", code: "UNKNOWN", count: 1 }];
  assert.equal(reduce({ spans: [], obs: only, pluginVersion: "0.8.2" }).findings.length, 0, "S3 friction stays local");
});

test("item 3: §1f rule 5 — count ≥ 3 promotes an S3 candidate to S2", () => {
  const many = [{ type: "obs", skill: "qa-bug", class: "tool_error", subject: "flaky_tool", code: "UNKNOWN", count: 3 }];
  const s = reduce({ spans: [], obs: many, pluginVersion: "0.8.2" });
  assert.equal(s.findings.length, 1);
  assert.equal(s.findings[0].severity, "S2");
});

test("item 3: §1f rule 2 — ≥3 different classes on one subject escalates a step", () => {
  const tri = ["script_exit_nonzero", "self_reported_fallback", "tool_error"].map((c) => ({
    type: "obs", skill: "qa-bug", class: c, subject: "ado", code: "UNKNOWN", count: 1,
  }));
  const s = reduce({ spans: [], obs: tri, pluginVersion: "0.8.2" });
  assert.equal(s.findings.length, 1);
  assert.equal(s.findings[0].severity, "S1", "S2 + triangulation ⇒ S1");
  assert.equal(s.findings[0].verdict, "BROKEN");
});

test("item 3: obs findings are additive to span findings, not a substitute", () => {
  const failed = [{
    type: "span", id: "x-1", kind: "command", name: "qa-fix", outcome: "failed", status: "error",
    signals: { tool_error: 1 }, struggle: [], retries: 0,
  }];
  const s = reduce({ spans: failed, obs: obsRecords(), pluginVersion: "0.8.2" });
  assert.ok(s.findings.some((f) => f.skill === "qa-fix"), "the flagged span is kept");
  assert.ok(s.findings.some((f) => f.skill === "qa-bug"), "the observations are kept too");
});

test("item 3: toolFamilyOfSubject maps the collector's SLUGIFIED subjects", () => {
  assert.equal(toolFamilyOfSubject("mcp_playwright_edge_browser_snapshot"), "browser");
  assert.equal(toolFamilyOfSubject("mcp_github_search_issues"), "github");
  assert.equal(toolFamilyOfSubject("ado"), "tracker");
  assert.equal(toolFamilyOfSubject("bash"), "bash");
  assert.equal(toolFamilyOfSubject("unknown"), "none");
  assert.equal(toolFamilyOfSubject("Acme::Internal::Thing"), "none");
});

// ─── item 11 — the information-free-payload guard, now over the struct ────────────
test("item 11: assertNonEmpty FAILS when the struct has NO findings", () => {
  const v = assertNonEmpty({ findings: [] });
  assert.equal(v.ok, false);
  assert.match(v.reason, /NO findings/);
});

test("item 11: assertNonEmpty FAILS when every actionable finding is degenerate", () => {
  const struct = validateUpstream({ findings: [
    { skill: "other", subject: "other", verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "none", errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown" },
  ] });
  const v = assertNonEmpty(struct);
  assert.equal(v.ok, false);
  assert.match(v.reason, /skill:other/);
});

test("item 11: a finding carrying provenance is NOT degenerate even with coarse enums", () => {
  const struct = validateUpstream({ findings: [
    { skill: "other", subject: "other", verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "none", errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown",
      vendorErrorTypeKey: "RuleValidationException", vendorHttpStatus: 400 },
  ] }, { files: new Map(), denyValues: [], states: [] });
  const v = assertNonEmpty(struct);
  assert.equal(v.ok, true, "the vendor error identity is an identifying dimension (v3)");
});

test("item 11: assertNonEmpty PASSES once the observation stream is folded in", () => {
  const struct = validateUpstream(reduce({ spans: spanRecords(), obs: obsRecords(), feedback: [], pluginVersion: "0.8.2" }));
  assert.equal(assertNonEmpty(struct).ok, true);
});

test("item 11: assertNonEmpty is a no-op (ok) when there is no BROKEN/DEGRADED row", () => {
  const struct = validateUpstream({ findings: [
    { skill: "qa-bug", subject: "ado_cli", verdict: "OK", severity: "S3", outcome: "recovered", signalClass: "none", errorCode: "UNKNOWN", toolFamily: "tracker", repoKind: "unknown" },
  ] });
  // OK rows never reach the struct via reduce, but a hand-built struct with only OK is vacuously fine.
  assert.equal(assertNonEmpty(struct).ok, true);
});

// ─── item 10 — the vocabulary can name the culprit ────────────────────────────
test("item 10: subjectEnum maps onto the closed vocabulary and never echoes its input", () => {
  assert.equal(subjectEnum("ado_create_workitem"), "ado_create_workitem");
  assert.equal(subjectEnum("mcp_github_search_issues"), "github_search_issues");
  assert.equal(subjectEnum("mcp_playwright_edge_browser_run_code_uns"), "browser_evaluate");
  assert.equal(subjectEnum("verify_access"), "access_verification");
  assert.equal(subjectEnum(""), "none");
  assert.equal(subjectEnum("unknown"), "none");
  const evil = "AcmeCorp/secret-repo/token=ghp_x";
  assert.equal(subjectEnum(evil), "other");
  for (const v of [evil, "AcmeCorp", "leocorpCheckout"]) assert.ok(SUBJECTS.includes(subjectEnum(v)), v);
});

test("item 10: a client name containing a keyword does NOT steer the subject bucket", () => {
  assert.equal(subjectEnum("leocorpCheckout"), "other");
  assert.equal(subjectEnum("AcmeBuildService"), "other");
  assert.equal(subjectEnum("git_checkout"), "repo_checkout");
  assert.equal(subjectEnum("dotnet_build"), "build");
});

test("item 10: an observation finding names its subject and whether it blocked the run", () => {
  const s = validateUpstream(reduce({ spans: [], obs: obsRecords(), feedback: [], pluginVersion: "0.8.2" }));
  const ado = s.findings.find((f) => f.subject === "ado_cli");
  assert.ok(ado, `expected an ado subject, got ${s.findings.map((f) => f.subject).join(",")}`);
  assert.equal(ado.blockedDeliverable, false, "an S2 group completed — it did not block");
  const tri = ["script_exit_nonzero", "self_reported_fallback", "tool_error"].map((c) => ({
    type: "obs", skill: "qa-bug", class: c, subject: "ado_create_workitem", code: "UNKNOWN", count: 1,
  }));
  const blocked = validateUpstream(reduce({ spans: [], obs: tri, pluginVersion: "0.8.2" })).findings[0];
  assert.equal(blocked.severity, "S1");
  assert.equal(blocked.subject, "ado_create_workitem");
  assert.equal(blocked.blockedDeliverable, true);
});

test("item 10: validateUpstream coerces an out-of-vocabulary subject and a non-boolean flag", () => {
  const s = validateUpstream({ findings: [{ skill: "qa-bug", subject: "AcmeCorp/private", blockedDeliverable: "yes-please", verdict: "BROKEN" }] });
  assert.equal(s.findings[0].subject, "other");
  assert.equal(s.findings[0].blockedDeliverable, false);
  assert.equal(JSON.stringify(s).includes("AcmeCorp"), false);
});

test("item 10: subject + blockedDeliverable are part of the finding identity", () => {
  const base = { skill: "qa-bug", verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "none", struggle: [], errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown", retries: 0, occurrences: 1 };
  const a = findingStructSig({ ...base, subject: "ado_create_workitem", blockedDeliverable: true });
  const b = findingStructSig({ ...base, subject: "browser_login", blockedDeliverable: true });
  const c = findingStructSig({ ...base, subject: "ado_create_workitem", blockedDeliverable: false });
  assert.notEqual(a, b, "two different culprits are two different findings");
  assert.notEqual(a, c, "blocking vs not is a different finding");
});

test("schema: SCHEMA_VERSION is 3 on every emitted struct (PR #172)", () => {
  assert.equal(SCHEMA_VERSION, 3);
  assert.equal(reduce({ spans: [] }).schemaVersion, 3);
  assert.equal(validateUpstream({}).schemaVersion, 3);
});

// ─── the end-to-end reproduction, through the real CLI (struct on stdin) ──────────
test("END TO END: --assert-nonempty exits 0 on the reproduction struct, and names the skill", async () => {
  const struct = validateUpstream(reduce({ spans: spanRecords(), obs: obsRecords(), feedback: [], pluginVersion: "0.8.2" }));
  const { plan, exitCode } = await runJson(["--session", SID, "--assert-nonempty", "--json"], { struct });
  assert.equal(exitCode, 0, "the observation-folded payload passes the guard");
  assert.equal(plan.ok, true);
  assert.equal(plan.pluginVersion, "0.8.2");
  assert.ok(plan.findings > 0);
});

test("END TO END: an information-free struct (S1 but all-degenerate) fails the guard loudly", async () => {
  const struct = { schemaVersion: 3, pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32", feedback: { up: 0, down: 0 }, sessionCount: 1,
    findings: [{ skill: "other", subject: "other", verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "none", errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown", struggle: [], retries: 0, occurrences: 1 }] };
  const { plan, exitCode } = await runJson(["--session", SID, "--assert-nonempty", "--json"], { struct });
  assert.equal(plan.ok, false, "an information-free payload must not pass silently");
  assert.equal(exitCode, 3);
});

test("END TO END: no struct on stdin exits 2 with a clear message", async () => {
  const { plan, exitCode } = await runJson(["--session", SID, "--json"], { struct: null });
  assert.equal(exitCode, 2);
  assert.match(plan.error, /No finding struct on stdin/);
});

// ─── B5 — a finding with no locatable evidence is WITHHELD from filing (VCST-5582) ──────
test("B5 hasLocatableEvidence: true iff a plugin file/excerpt/literal or a vendor error identity", () => {
  assert.equal(hasLocatableEvidence({ pluginFile: "skills/qa-fix-routing/ado.mjs" }), true);
  assert.equal(hasLocatableEvidence({ codeExcerpt: "const x = 1;" }), true);
  assert.equal(hasLocatableEvidence({ vendorErrorCode: "TF401347" }), true);
  assert.equal(hasLocatableEvidence({ vendorHttpStatus: 400 }), true);
  assert.equal(hasLocatableEvidence({ skill: "qa-bug", subject: "ado_create_workitem" }), false);
  assert.equal(hasLocatableEvidence({}), false);
});

test("B5 END TO END: a contentless finding is NOT filed; it is reported as withheld", async () => {
  // A real subject but zero locatable evidence — exactly #183 (a severity table + boilerplate).
  const struct = {
    schemaVersion: 3, pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32",
    feedback: { up: 0, down: 0 }, sessionCount: 1,
    findings: [{
      skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
      signalClass: "tool_error", errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown",
      struggle: [], retries: 0, occurrences: 1,
    }],
  };
  const { plan } = await runJson(["--session", SID, "--confirm", "--json"], { struct });
  assert.ok(plan, "got a plan");
  assert.equal(plan.findings.length, 1);
  assert.equal(plan.findings[0].plan, "withhold", "no locatable evidence ⇒ withhold, not file");
  assert.equal(plan.findings[0].action, "withheld");
  assert.equal(plan.sent, 0, "nothing was filed");
  assert.match(plan.summary, /withheld: no locatable evidence/);
});

test("B5 END TO END: a finding WITH locatable evidence (vendor error identity) IS filed", async () => {
  const struct = {
    schemaVersion: 3, pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32",
    feedback: { up: 0, down: 0 }, sessionCount: 1,
    findings: [{
      skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
      signalClass: "tool_error", errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown",
      struggle: [], retries: 0, occurrences: 1,
      vendorErrorCode: "TF401347", vendorHttpStatus: 400,
    }],
  };
  const { plan } = await runJson(["--session", SID, "--confirm", "--json"], { struct });
  assert.equal(plan.findings[0].plan, "file");
  assert.equal(plan.findings[0].action, "filed");
  assert.equal(plan.sent, 1);
});

// ─── B6 — a withheld field is rendered in the issue body + the deliverer's result line ──
test("B6 withheldLine: renders {field, reason} pairs; empty ⇒ ''", () => {
  assert.equal(withheldLine({ withheld: [] }), "");
  assert.equal(withheldLine({}), "");
  assert.equal(
    withheldLine({ withheld: [{ field: "proposedFix", reason: "over-cap" }, { field: "codeExcerpt", reason: "proof-failed" }] }),
    "Withheld by boundary validator: proposedFix (over-cap), codeExcerpt (proof-failed)",
  );
});

test("B6: buildFindingIssue body carries the withheld line", () => {
  const finding = {
    skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
    signalClass: "tool_error", errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown",
    struggle: [], retries: 0, occurrences: 1, blockedDeliverable: true,
    vendorErrorCode: "TF401347", vendorHttpStatus: 400,
    withheld: [{ field: "proposedFix", reason: "boundary-denied" }],
  };
  const struct = { pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32", sessionCount: 1, feedback: { up: 0, down: 0 } };
  const { body } = buildFindingIssue({ finding, struct });
  assert.match(body, /Withheld by boundary validator: proposedFix \(boundary-denied\)/);
});

// ─── VCST-5582 D2 — cluster same-identity findings into ONE issue (no double-file) ──────────
const clFinding = (over = {}) => ({
  skill: "qa-bug", subject: "ado_create_workitem", verdict: "BROKEN", severity: "S1", outcome: "failed",
  signalClass: "tool_error", errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown",
  struggle: [], retries: 0, occurrences: 1, withheld: [], ...over,
});

test("D2 clusterFindingsByKey: two findings with the SAME key collapse to one (occurrences summed, max severity)", () => {
  // The span path + the obs path can each emit a finding for the same (skill, subject).
  const a = clFinding({ severity: "S2", verdict: "DEGRADED", occurrences: 1 });
  const b = clFinding({ severity: "S1", verdict: "BROKEN", occurrences: 2 });
  const out = clusterFindingsByKey([a, b]);
  assert.equal(out.length, 1, "one identity ⇒ one issue");
  assert.equal(out[0].severity, "S1", "representative is the highest severity");
  assert.equal(out[0].verdict, "BROKEN");
  assert.equal(out[0].occurrences, 3, "occurrences are summed");
});

test("D2 clusterFindingsByKey: a different subject or plugin site stays SEPARATE", () => {
  const a = clFinding({ subject: "ado_create_workitem" });
  const b = clFinding({ subject: "browser_login" });
  assert.equal(clusterFindingsByKey([a, b]).length, 2, "different subject → different issue");
  // two `other`-subject findings at DIFFERENT plugin sites keep distinct keys (B2 hash)
  const c = clFinding({ subject: "novel free text", pluginFile: "skills/qa-fix-routing/ado.mjs", pluginLine: 40 });
  const d = clFinding({ subject: "other novel text", pluginFile: "skills/qa-fix-routing/ado.mjs", pluginLine: 88 });
  assert.equal(clusterFindingsByKey([c, d]).length, 2, "different plugin site → different issue");
});

test("D2 clusterFindingsByKey: withheld fields are unioned + deduped across the cluster", () => {
  const a = clFinding({ withheld: [{ field: "proposedFix", reason: "over-cap" }] });
  const b = clFinding({ withheld: [{ field: "proposedFix", reason: "over-cap" }, { field: "codeExcerpt", reason: "proof-failed" }] });
  const out = clusterFindingsByKey([a, b]);
  assert.equal(out.length, 1);
  assert.deepEqual(
    out[0].withheld.map((w) => `${w.field}|${w.reason}`).sort(),
    ["codeExcerpt|proof-failed", "proposedFix|over-cap"],
  );
});

test("D2 END TO END: a struct with two same-key findings files exactly ONE issue", async () => {
  const struct = {
    schemaVersion: 3, pluginVersion: "0.8.2", nodeVersion: "v22.0.0", os: "win32",
    feedback: { up: 0, down: 0 }, sessionCount: 1,
    findings: [
      clFinding({ severity: "S2", verdict: "DEGRADED", vendorHttpStatus: 400 }),
      clFinding({ severity: "S1", verdict: "BROKEN", vendorHttpStatus: 400 }),
    ],
  };
  const { plan } = await runJson(["--session", SID, "--confirm", "--json"], { struct });
  assert.equal(plan.findings.length, 1, "the two same-key findings became ONE filing");
  assert.equal(plan.findings[0].severity, "S1");
  assert.equal(plan.sent, 1, "exactly one issue filed, never two");
});
