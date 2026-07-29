// Tests for the DIAG → upstream-struct EXTRACTION path —
// plugins/vc-fix/skills/vc-self-check/{deliver,upstream-reduce}.mjs.
//
// The incident: a real /qa-bug run on a client deployment produced a DIAG with 1 BROKEN (S1) +
// 1 DEGRADED (S2) finding, the operator approved contributing it, and the report that came out
// carried NO identifying information at all — every column reduced to `other` / `none` /
// `UNKNOWN` / `unknown`, including a plugin version that was sitting in the telemetry. Three
// independent defects stacked:
//
//   1. the DIAG header renders values as inline CODE (`- Session: `<sid>` · Plugin: `0.8.2``) and
//      both header regexes captured the BACKTICKS — so the sid never matched a `<sid>.jsonl`
//      (reduce got zero spans AND zero observations) and the version was discarded as invalid;
//   2. the filename fallback only accepted a COMPACT `\d{8}T\d{6}Z` stamp while the skill writes
//      a hyphenated ISO one, so it could never rescue defect 1;
//   3. reduce() iterated `local.spans` only and required `outcome ∈ FLAGGED_OUTCOMES`, so the
//      `type:"obs"` stream — the other half of the VCST-5582 H analysis set — was read by nobody,
//      and a session whose command span ended `recovered` yielded ZERO findings.
//
// Nothing caught it: the containment tests assert what must NOT be present, and an empty report
// is perfectly contained. Hence `--dry --assert-nonempty` (item 11) and the end-to-end
// reproduction at the bottom of this file.
// Run: `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { withTempHome } from "./_test-helpers.mjs";
import {
  main,
  parseDiag,
  sessionIdFromDiag,
  stripInlineMd,
  readSessionRecords,
  assertNonEmpty,
  buildDraft,
  readSidecar,
  sidecarPathFor,
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

/**
 * Drive deliver.main() with a STUBBED fetch, capture its JSON, restore everything.
 * The stub is essential: the dry path probes GitHub and looks for a duplicate issue, and a real
 * network call makes the test slow, flaky, and dependent on ambient credentials.
 * Returns `{ plan, out, exitCode }`.
 */
async function runJson(argv) {
  const prev = { fetch: globalThis.fetch, tok: process.env.GITHUB_FIX_BUGS_TOKEN, write: process.stdout.write, exit: process.exitCode };
  let out = "";
  process.env.GITHUB_FIX_BUGS_TOKEN = "ghp_classic_test_token";
  process.stdout.write = (s) => { out += s; return true; };
  globalThis.fetch = async (url, opts = {}) => {
    const u = String(url);
    if ((opts.method || "GET").toUpperCase() === "POST") return { ok: true, json: async () => ({ number: 42, html_url: "http://issue/42" }) };
    if (u.endsWith("/user")) return { ok: true, status: 200, headers: { get: (k) => (k.toLowerCase() === "x-oauth-scopes" ? "repo, gist" : null) }, json: async () => ({ login: "qa-bot" }) };
    if (u.includes("/search/issues")) return { ok: true, json: async () => ({ items: [] }) };
    if (u.includes("/issues")) return { ok: true, json: async () => [] };
    return { ok: true, headers: { get: () => null }, json: async () => ({ permissions: {} }) };
  };
  let exitCode;
  try {
    await main(argv);
    exitCode = process.exitCode ?? 0;
  } finally {
    globalThis.fetch = prev.fetch;
    process.stdout.write = prev.write;
    process.exitCode = prev.exit;
    if (prev.tok === undefined) delete process.env.GITHUB_FIX_BUGS_TOKEN;
    else process.env.GITHUB_FIX_BUGS_TOKEN = prev.tok;
  }
  let plan = null;
  try { plan = JSON.parse(out.trim().split("\n").pop()); } catch { /* non-JSON output */ }
  return { plan, out, exitCode };
}

/** The DIAG header + findings table exactly as the skill's own template renders them —
 *  inline code and all. This markdown IS the reproduction. */
function diagMarkdown(sid = SID) {
  return [
    `# DIAG — ${sid}`,
    ``,
    `- Session: \`${sid}\` · Plugin: \`0.8.2\` · Env: \`leo_qa\` · Project: client`,
    `- Telemetry: \`.vc-fix/diagnostics/${sid}.jsonl\` · Verdict: \`attention\` · Flagged: 0 · Observations: 9 distinct / 13 total · Feedback: none`,
    ``,
    `## Findings`,
    ``,
    `| Span (kind) | Verdict | Sev | Outcome | Signal / struggle | Root-cause hypothesis | Proposed fix (file) |`,
    `|---|---|---|---|---|---|---|`,
    `| /qa-bug · \`ado\` create-workitem required-field gate | BROKEN | S1 | success (obs) | \`script_exit_nonzero\` ×2 | server-derived refs marked required | \`skills/qa-fix-routing/ado.mjs\` |`,
    `| /qa-bug · admin credential handoff | DEGRADED | S2 | recovered (obs) | \`permission_denied\` ×2 (\`bash\`) | no sanctioned login helper | \`knowledge/agents/qa/shared-instructions.md\` |`,
  ].join("\n");
}

/** The observation stream from the real session, trimmed to the records that matter here. */
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
  return [
    {
      type: "span", id: `${sid}-0`, kind: "command", name: "qa-bug", outcome: "recovered", status: "error",
      signals: { tool_error: 4, permission_denied: 2, hook_failure: 0, stop_bail: 0, policy_block: 1 },
      struggle: [], retries: 0,
    },
  ];
}

/** A DIAG whose findings rows name nothing in SKILLS — nothing structured can be recovered. */
function unattributableMarkdown(sid) {
  return [
    `- Session: \`${sid}\` · Plugin: \`0.8.2\``,
    "## Findings",
    "| Span (kind) | Verdict | Sev | Signal | Root | Fix |",
    "| something nobody recognizes | BROKEN | S1 | ? | ? | ? |",
  ].join("\n");
}

function seedSession(home, { sid = SID, stamp = "2026-07-29T11-55-12Z", withJsonl = true, unattributable = false } = {}) {
  writeFileSync(join(home, "project-profile.json"), JSON.stringify({ feedback: { mode: "ask" } }));
  const dir = join(home, ".vc-fix", "diagnostics");
  mkdirSync(dir, { recursive: true });
  const diagPath = join(dir, `DIAG-${sid}-${stamp}.md`);
  writeFileSync(diagPath, unattributable ? unattributableMarkdown(sid) : diagMarkdown(sid));
  if (withJsonl) {
    const lines = [
      { type: "session_start", sessionId: sid, pluginVersion: "0.8.2", projectType: "client" },
      ...spanRecords(sid),
      ...obsRecords(sid),
    ].map((r) => JSON.stringify(r));
    writeFileSync(join(dir, `${sid}.jsonl`), lines.join("\n") + "\n");
  }
  return { dir, diagPath };
}

// ─── item 1 — inline markdown must not reach either capture ───────────────────

test("item 1: stripInlineMd removes backticks/asterisks/underscores", () => {
  assert.equal(stripInlineMd("`0.8.2`"), "0.8.2");
  assert.equal(stripInlineMd("**BROKEN**"), "BROKEN");
  assert.equal(stripInlineMd("  `abc-def`  "), "abc-def");
  assert.equal(stripInlineMd(undefined), "");
});

test("item 1: parseDiag reads the plugin version through inline code (was `0.8.2` → unknown)", () => {
  const parsed = parseDiag(diagMarkdown());
  assert.equal(parsed.pluginVersion, "0.8.2");
  // and it survives the boundary validator, which is where the backticked form died
  assert.equal(validateUpstream({ pluginVersion: parsed.pluginVersion }).pluginVersion, "0.8.2");
});

test("item 1: sessionIdFromDiag reads the sid through inline code", () => {
  assert.equal(sessionIdFromDiag(diagMarkdown(), "whatever.md"), SID);
});

test("item 1: a backticked sid used to resolve to no telemetry at all", async () => {
  await withTempHome(async (home) => {
    seedSession(home);
    // the pre-fix capture, verbatim
    const backticked = /Session:\s*([^\s·|]+)/i.exec(diagMarkdown())[1];
    assert.equal(backticked, `\`${SID}\``, "the raw capture really does include the backticks");
    assert.equal(readSessionRecords(backticked).spans.length, 0, "pre-fix: no spans found");
    // the fixed capture
    assert.equal(readSessionRecords(SID).spans.length, 1);
  });
});

// ─── item 2 — the filename fallback must accept both stamp spellings ──────────

test("item 2: the filename fallback accepts the hyphenated ISO stamp the skill writes", () => {
  assert.equal(sessionIdFromDiag("", `DIAG-${SID}-2026-07-29T11-55-12Z.md`), SID);
});

test("item 2: it accepts the hyphenated stamp WITH milliseconds (both forms exist on disk)", () => {
  assert.equal(sessionIdFromDiag("", `DIAG-${SID}-2026-07-27T07-32-47-649Z.md`), SID);
});

test("item 2: the compact stamp keeps working (no regression)", () => {
  assert.equal(sessionIdFromDiag("", `DIAG-${SID}-20260727T065857Z.md`), SID);
});

test("item 2: a filename with no recognizable stamp still yields \"\"", () => {
  assert.equal(sessionIdFromDiag("", "DIAG-nope.md"), "");
});

// ─── item 3 — reduce() must consume the observation stream ────────────────────

test("item 3: readSessionRecords surfaces obs records alongside spans", async () => {
  await withTempHome(async (home) => {
    seedSession(home);
    const r = readSessionRecords(SID);
    assert.equal(r.spans.length, 1);
    assert.equal(r.obs.length, obsRecords().length);
    assert.equal(r.pluginVersion, "0.8.2");
  });
});

test("item 3: a session whose ONLY signals are obs records still produces findings", () => {
  // The span ends `recovered` — the deliverable landed — so the span path yields nothing.
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
  assert.equal(ado.signalClass, "tool_error", "a signal-class observation supplies signalClass");
  // `permission_denied` + `self_reported_fallback` on subject `bash` merge into ONE finding
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

test("item 3: the DIAG-table fallback is used only when NEITHER structured source yields anything", () => {
  const fallback = [{ skill: "qa-bug", verdict: "BROKEN", sev: "S1" }];
  // obs present ⇒ the real signal wins, the low-fidelity fallback is not appended
  const withObs = reduce({ spans: [], obs: obsRecords(), fallbackFindings: fallback, pluginVersion: "0.8.2" });
  assert.equal(withObs.findings.every((f) => f.severity === "S2"), true, "no S1 fallback row leaked in");
  // nothing structured ⇒ the fallback still rescues the report
  const bare = reduce({ spans: [], obs: [], fallbackFindings: fallback, pluginVersion: "0.8.2" });
  assert.equal(bare.findings.length, 1);
  assert.equal(bare.findings[0].severity, "S1");
});

test("item 3: toolFamilyOfSubject maps the collector's SLUGIFIED subjects", () => {
  assert.equal(toolFamilyOfSubject("mcp_playwright_edge_browser_snapshot"), "browser");
  assert.equal(toolFamilyOfSubject("mcp_github_search_issues"), "github");
  assert.equal(toolFamilyOfSubject("ado"), "tracker");
  assert.equal(toolFamilyOfSubject("bash"), "bash");
  assert.equal(toolFamilyOfSubject("unknown"), "none");
  // fail-safe: never echo the input
  assert.equal(toolFamilyOfSubject("Acme::Internal::Thing"), "none");
});

// ─── item 11 — the information-free-payload guard ─────────────────────────────

test("item 11: assertNonEmpty FAILS when every finding is degenerate", () => {
  // A DIAG whose skill cell names nothing in SKILLS — the shape the pre-fix path always produced,
  // and still the shape a genuinely unattributable report produces.
  const md = [
    `- Session: \`s-x\` · Plugin: \`0.8.2\``,
    "## Findings",
    "| Span (kind) | Verdict | Sev | Signal | Root | Fix |",
    "| something nobody recognizes | BROKEN | S1 | ? | ? | ? |",
  ].join("\n");
  const parsed = parseDiag(md);
  const struct = validateUpstream(reduce({ spans: [], obs: [], feedback: [], pluginVersion: "0.8.2", fallbackFindings: parsed.findings }));
  assert.equal(struct.findings.every((f) => f.skill === "other" && f.signalClass === "none" && f.errorCode === "UNKNOWN"), true);
  const verdict = assertNonEmpty({ struct, parsed });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /skill:other/);
});

test("item 9/10: the markdown fallback now recovers the skill AND subject from the real DIAG cell", () => {
  // The reproduction's own first cell was ``/qa-bug · `ado` create-workitem required-field gate``,
  // which is not a SKILLS member — so the row used to collapse to `skill: other`. Markdown is now a
  // last resort (the sidecar is primary), but when it IS used it must not throw the skill away.
  const parsed = parseDiag(diagMarkdown());
  assert.equal(parsed.findings[0].skill, "qa-bug", "the ` · ` decoration no longer poisons the enum");
  const struct = validateUpstream(reduce({ spans: [], obs: [], feedback: [], pluginVersion: "0.8.2", fallbackFindings: parsed.findings }));
  assert.ok(struct.findings.some((f) => f.skill === "qa-bug"));
  assert.equal(assertNonEmpty({ struct, parsed }).ok, true);
});

test("item 11: assertNonEmpty FAILS when the DIAG has rows but the struct has none", () => {
  const parsed = parseDiag(diagMarkdown());
  const verdict = assertNonEmpty({ struct: { findings: [] }, parsed });
  assert.equal(verdict.ok, false);
  assert.match(verdict.reason, /NO findings/);
});

test("item 11: assertNonEmpty PASSES once the observation stream is folded in", () => {
  const parsed = parseDiag(diagMarkdown());
  const struct = validateUpstream(reduce({
    spans: spanRecords(), obs: obsRecords(), feedback: [], pluginVersion: "0.8.2",
    fallbackFindings: parsed.findings,
  }));
  assert.equal(assertNonEmpty({ struct, parsed }).ok, true);
});

test("item 11: assertNonEmpty is a no-op when the DIAG claims nothing", () => {
  const parsed = { findings: [{ skill: "qa-bug", verdict: "OK", sev: "S3" }] };
  assert.equal(assertNonEmpty({ struct: { findings: [] }, parsed }).ok, true);
});

// ─── item 10 — the vocabulary can name the culprit ────────────────────────────

test("item 10: subjectEnum maps onto the closed vocabulary and never echoes its input", () => {
  assert.equal(subjectEnum("ado_create_workitem"), "ado_create_workitem");
  assert.equal(subjectEnum("mcp_github_search_issues"), "github_search_issues");
  assert.equal(subjectEnum("mcp_playwright_edge_browser_run_code_uns"), "browser_evaluate");
  assert.equal(subjectEnum("verify_access"), "access_verification");
  assert.equal(subjectEnum(""), "none");
  assert.equal(subjectEnum("unknown"), "none");
  // the fail-safe direction: an unrecognized subject is `other`, never the string
  const evil = "AcmeCorp/secret-repo/token=ghp_x";
  assert.equal(subjectEnum(evil), "other");
  for (const v of [evil, "AcmeCorp", "leocorpCheckout"]) assert.ok(SUBJECTS.includes(subjectEnum(v)), v);
});

test("item 10: a client name containing a keyword does NOT steer the subject bucket", () => {
  // An unanchored /checkout|clone/ mapped a client repo called `leocorpCheckout` to
  // `repo_checkout` — not a leak (only the enum travels) but WRONG information, which in a
  // vendor-facing report is worse than none. Every marker is `_`-boundary delimited.
  assert.equal(subjectEnum("leocorpCheckout"), "other");
  assert.equal(subjectEnum("AcmeBuildService"), "other");
  assert.equal(subjectEnum("mytestingcorp"), "other");
  // …while the plugin's own `_`-separated operation names still match
  assert.equal(subjectEnum("git_checkout"), "repo_checkout");
  assert.equal(subjectEnum("dotnet_build"), "build");
});

test("item 10: an observation finding names its subject and whether it blocked the run", () => {
  const s = validateUpstream(reduce({ spans: [], obs: obsRecords(), feedback: [], pluginVersion: "0.8.2" }));
  const ado = s.findings.find((f) => f.subject === "ado_cli");
  assert.ok(ado, `expected an ado subject, got ${s.findings.map((f) => f.subject).join(",")}`);
  assert.equal(ado.skill, "qa-bug");
  assert.equal(ado.blockedDeliverable, false, "an S2 group completed — it did not block");
  // …and an S1 group is marked blocked
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
  assert.equal(s.findings[0].subject, "other", "a rogue subject never survives the boundary");
  assert.equal(s.findings[0].blockedDeliverable, false, "only a real `true` counts");
  assert.equal(JSON.stringify(s).includes("AcmeCorp"), false);
});

test("item 10: the rendered row reads `S1 · skill · subject · blocked`, still enums only", () => {
  const struct = validateUpstream(reduce({ spans: [], obs: [
    { type: "obs", skill: "qa-bug", class: "self_reported_fail", subject: "ado_create_workitem", code: "HTTP_4XX", count: 1 },
  ], pluginVersion: "0.8.2" }));
  const d = buildDraft({ struct, route: "issue" });
  assert.match(d.body, /\| S1 \| qa-bug \| ado_create_workitem \| blocked \| BROKEN \|/);
  assert.match(d.title, /qa-bug\/ado_create_workitem BROKEN/);
});

test("item 10: subject + blockedDeliverable are part of the finding identity", () => {
  const base = { skill: "qa-bug", verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "none", struggle: [], errorCode: "UNKNOWN", toolFamily: "none", repoKind: "unknown", retries: 0, occurrences: 1 };
  const a = findingStructSig({ ...base, subject: "ado_create_workitem", blockedDeliverable: true });
  const b = findingStructSig({ ...base, subject: "browser_login", blockedDeliverable: true });
  const c = findingStructSig({ ...base, subject: "ado_create_workitem", blockedDeliverable: false });
  assert.notEqual(a, b, "two different culprits are two different findings");
  assert.notEqual(a, c, "blocking vs not is a different finding");
  assert.equal(a, findingStructSig({ ...base, subject: "ado_create_workitem", blockedDeliverable: true }), "and identity is stable");
});

test("item 10: schemaVersion is 2 on every emitted struct", () => {
  assert.equal(SCHEMA_VERSION, 2);
  assert.equal(reduce({ spans: [] }).schemaVersion, 2);
  assert.equal(validateUpstream({}).schemaVersion, 2);
});

// ─── item 9 — the machine-readable sidecar ────────────────────────────────────

const SIDECAR = {
  schemaVersion: 2, pluginVersion: "0.8.2", sessionCount: 1, feedback: { up: 0, down: 0 },
  findings: [{
    skill: "qa-bug", subject: "ado_create_workitem", blockedDeliverable: true,
    verdict: "BROKEN", severity: "S1", outcome: "failed", signalClass: "tool_error",
    struggle: [], errorCode: "HTTP_4XX", toolFamily: "tracker", repoKind: "unknown",
    retries: 0, occurrences: 1,
  }],
};

test("item 9: sidecarPathFor swaps the extension, keeping the basename", () => {
  assert.equal(sidecarPathFor(`/d/DIAG-${SID}-2026-07-29T11-55-12Z.md`), `/d/DIAG-${SID}-2026-07-29T11-55-12Z.json`);
});

test("item 9: deliver PREFERS the sidecar over the markdown table", async () => {
  await withTempHome(async (home) => {
    const { diagPath } = seedSession(home);
    writeFileSync(sidecarPathFor(diagPath), JSON.stringify(SIDECAR));
    const { plan } = await runJson(["--diag", diagPath, "--dry", "--json"]);
    assert.equal(plan.findings, 1, "the sidecar's single finding wins over the reducer's several");
    assert.match(plan.title, /ado_create_workitem/, "and it names the culprit");
  });
});

test("item 9: a sidecar carrying rogue values is re-validated, not trusted", async () => {
  await withTempHome(async (home) => {
    const { diagPath } = seedSession(home);
    writeFileSync(sidecarPathFor(diagPath), JSON.stringify({
      ...SIDECAR,
      pluginVersion: "9.9.9-AcmeCorp-github_pat_secret",
      findings: [{ ...SIDECAR.findings[0], skill: "AcmeCorp-custom-skill", subject: "/c/clients/acme/src/Checkout.cs", errorCode: "LEAKED_ACME" }],
    }));
    const { plan } = await runJson(["--diag", diagPath, "--dry", "--json"]);
    const draft = readFileSync(plan.deliveryDraft, "utf8");
    for (const s of ["AcmeCorp", "github_pat_secret", "Checkout.cs", "LEAKED_ACME", "clients"]) {
      assert.equal(draft.includes(s), false, `"${s}" must not reach the draft`);
    }
    assert.match(draft, /Plugin version: 9\.9\.9\b/, "the version suffix is discarded, not echoed");
  });
});

test("item 9: a malformed or empty sidecar falls back to the reducer instead of breaking", async () => {
  for (const body of ["{ not json", "{}", '{"findings":[]}']) {
    await withTempHome(async (home) => {
      const { diagPath } = seedSession(home);
      writeFileSync(sidecarPathFor(diagPath), body);
      assert.equal(readSidecar(diagPath), null, `readSidecar(${body}) must be null`);
      const { plan } = await runJson(["--diag", diagPath, "--dry", "--json"]);
      assert.ok(plan.findings > 0, "the reducer still produces the findings");
    });
  }
});

test("item 9: the sidecar is purged with its session", async () => {
  await withTempHome(async (home) => {
    const { dir, diagPath } = seedSession(home);
    const sc = sidecarPathFor(diagPath);
    writeFileSync(sc, JSON.stringify(SIDECAR));
    await runJson(["--diag", diagPath, "--purge", "--json"]);
    assert.equal(existsSync(sc), false, "the sidecar is removed like every other DIAG-<sid>-* artifact");
    assert.equal(existsSync(diagPath), false);
  });
});

// ─── the end-to-end reproduction, through the real CLI ────────────────────────

test("END TO END: --dry --assert-nonempty exits 0 on the reproduction, and it names the skill", async () => {
  await withTempHome(async (home) => {
    const { diagPath } = seedSession(home);
    const { plan, exitCode } = await runJson(["--diag", diagPath, "--dry", "--assert-nonempty", "--json"]);
    assert.equal(exitCode, 0, "the fixed pipeline passes the guard");
    assert.equal(plan.ok, true);
    assert.equal(plan.pluginVersion, "0.8.2", "the version from the telemetry, not `unknown`");
    assert.equal(plan.session, SID, "the sid was recovered through the inline code");
  });
});

test("END TO END: a DIAG with no telemetry and an unattributable row fails the guard loudly", async () => {
  await withTempHome(async (home) => {
    const { diagPath } = seedSession(home, { withJsonl: false, unattributable: true });
    const { plan, exitCode } = await runJson(["--diag", diagPath, "--dry", "--assert-nonempty", "--json"]);
    assert.equal(plan.ok, false, "an information-free payload must not pass silently");
    assert.equal(exitCode, 3, "and it must exit non-zero");
  });
});
