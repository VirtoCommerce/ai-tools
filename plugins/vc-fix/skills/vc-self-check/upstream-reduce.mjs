/**
 * skills/vc-self-check/upstream-reduce.mjs — the DEFAULT-DENY, CLOSED-SCHEMA reducer for
 * the vc-fix self-diagnostics upstream contribution path (the trust-direction inversion
 * that ends the client-data-leak class; see
 * knowledge/diagnostics/adr-upstream-default-deny.md + upstream-schema.md).
 *
 * ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * The old upstream path composed the outbound report from FREE-FORM text derived from
 * the client session (LLM-authored DIAG cells signal/rootcause/fix + /vc-feedback prose)
 * and defended the send boundary with a DENYLIST (redact.mjs + deliver's
 * containsClientShape/scrubText). A denylist over an unbounded input space always trails
 * reality — three review rounds each found a new leak shape. This module inverts the
 * trust direction: the upstream artifact is built ONLY from a fixed, plugin-authored
 * vocabulary of enum/number/bool primitives. The RETURN TYPE of `reduce()` IS the schema,
 * so there is structurally NO channel for arbitrary client bytes.
 *
 * ─── CONTRACT ────────────────────────────────────────────────────────────────
 *  - PURE + deterministic + NO I/O. `deliver` reads the files and hands us plain objects.
 *  - `reduce(local)` reads ONLY the collector's STRUCTURED jsonl records
 *    (span records + feedback verdicts + pluginVersion). It NEVER reads the LLM-authored
 *    DIAG free-text cells. Every string it emits is a member of a closed vocabulary.
 *  - `validateUpstream(struct)` is the runtime boundary barrier: any value not in its
 *    allowed vocabulary is coerced to a safe default (UNKNOWN / other / none) and numbers
 *    are clamped — so even a buggy `reduce`/`classifyError` cannot emit a novel string.
 *  - `fingerprintStruct(struct)` hashes the STRUCTURAL tuple (enums+counts) only — never
 *    raw text — so dedup can't smuggle client bytes into the hash.
 *  - Fail-safe direction is loss-of-detail (UNKNOWN), NEVER a leak.
 *
 * Keep the vocabularies here in lock-step with knowledge/diagnostics/upstream-schema.md
 * and with the collector's own consts (hooks/session-telemetry.mjs SIGNAL_CLASSES /
 * struggle names / outcome names / EXPECTED_OUTPUT skill keys).
 */

export const SCHEMA_VERSION = 1;

// ─── closed vocabularies ─────────────────────────────────────────────────────
// Plugin skills/commands the collector attributes spans to (lock-step with the collector's
// PLUGIN_COMMANDS + EXPECTED_OUTPUT + the developer skills). Anything else → "other".
export const SKILLS = [
  "project-init", "qa-bug", "qa-fix", "qa-verify-fix", "qa-monitoring", "qa-env-check",
  "vc-docs", "vc-self-check",
  "dotnet-unit-test", "dotnet-fix", "angular-admin", "vue-unit-test", "vue-fix", "vc-shell-fix",
  "other",
];
export const VERDICTS = ["OK", "DEGRADED", "BROKEN"];
export const SEVERITIES = ["S0", "S1", "S2", "S3"];
export const OUTCOMES = ["success", "recovered", "degraded", "failed", "silent_suspect"];
// `policy_block` (a by-design guardrail the agent obeyed — VCST-5582 F4) is LAST before "none" so
// the derivation below still prefers a genuine blocking class when both are present.
export const SIGNAL_CLASSES = ["tool_error", "permission_denied", "hook_failure", "stop_bail", "policy_block", "none"];
export const STRUGGLES = ["retry_storm", "reread_loop", "search_thrash", "fallback_loop", "recurring_error", "stall", "low_yield"];
export const TOOL_FAMILIES = ["read", "edit", "bash", "browser", "git", "github", "tracker", "mcp_other", "none"];
export const REPO_KINDS = ["module", "platform", "frontend", "backend", "unknown"];

// ─── observation classes (lock-step with the collector's OBS_CLASSES) ─────────
// These never reach the upstream struct as-is: an observation's `class` is used only to
// DERIVE a candidate severity (skill-expectations.md §1f) and, when it happens to be one of
// the SIGNAL_CLASSES, the finding's `signalClass`. Unknown classes still get a candidate, so
// a class this build does not know is downgraded — never dropped.
const OBS_NOISE_CLASSES = new Set(["policy_block", "self_reported_skip", "harness_noise"]);
// Candidate severity per class — the §1f table, verbatim. A class absent from this map falls
// through to the table's last row ("a class this table does not cover ⇒ S3 + LOW confidence"),
// which is also where the raw signal classes (tool_error / permission_denied / hook_failure /
// stop_bail) land: they are deliberately NOT escalated on their own, because a BLOCKING one
// already arrives via the span path and a RECOVERED one must not be treated as a defect.
const OBS_SEVERITY = {
  self_reported_fail: "S1",
  forbidden_tool: "S1",
  write_outside_output_root: "S1",
  self_reported_warn: "S2",
  degraded_artifact: "S2",
  http_non2xx: "S2",
  script_exit_nonzero: "S2",
  self_reported_fallback: "S2",
  report_oversize: "S2",
  struggle: "S2",
  question_unanswered: "S2",
  collector_contention: "S2",
  script_stderr: "S3",
  recovered_error: "S3",
  tool_interrupted: "S3",
  capture_truncated: "S3",
  collector_scan_error: "S3",
};
const SEV_ORDER = ["S3", "S2", "S1"]; // ascending severity; S0 is "no finding", never derived here
const maxSev = (a, b) => (SEV_ORDER.indexOf(b) > SEV_ORDER.indexOf(a) ? b : a);
const promoteSev = (s) => SEV_ORDER[Math.min(SEV_ORDER.indexOf(s) + 1, SEV_ORDER.length - 1)] ?? s;

// Error taxonomy — a closed set + the UNKNOWN fail-safe. classifyError runs LOCALLY over
// an ALREADY-redacted snippet and returns ONLY a member of this set — never the input.
export const ERROR_CODES = [
  "AUTH_MISSING_SCOPE", "AUTH_EXPIRED", "PERMISSION_DENIED",
  "NETWORK_TIMEOUT", "NETWORK_DNS", "RATE_LIMITED", "HTTP_5XX", "HTTP_4XX",
  "FILE_NOT_FOUND", "PATH_DENIED", "MODULE_NOT_FOUND", "DEP_MISSING",
  "HOOK_TSC_ERROR", "BUILD_FAILED", "TEST_FAILED", "LINT_FAILED",
  "GIT_CONFLICT", "GIT_PUSH_REJECTED", "MERGE_BLOCKED",
  "BAIL_LEGIT", "UNKNOWN",
];

const SKILLS_SET = new Set(SKILLS);
const VERDICTS_SET = new Set(VERDICTS);
const SEVERITIES_SET = new Set(SEVERITIES);
const OUTCOMES_SET = new Set(OUTCOMES);
const SIGNAL_CLASSES_SET = new Set(SIGNAL_CLASSES);
const STRUGGLES_SET = new Set(STRUGGLES);
const TOOL_FAMILIES_SET = new Set(TOOL_FAMILIES);
const REPO_KINDS_SET = new Set(REPO_KINDS);
const ERROR_CODES_SET = new Set(ERROR_CODES);

// ─── error taxonomy classifier ───────────────────────────────────────────────
// ORDERED: specific before generic (FILE_NOT_FOUND/ENOENT before the HTTP_4XX 404 rule,
// AUTH_* before the generic PERMISSION_DENIED, etc.). First match wins. The output is
// ALWAYS a fixed ERROR_CODES member — the input text is never echoed. No match → UNKNOWN.
// ORDER MATTERS — specific before generic (adversarial review #4). Key orderings:
//   • BUILD_FAILED before TEST_FAILED so "✗ Build failed …" is a build error, not a test.
//   • TEST_FAILED carries test-runner TIMEOUTS ("Timeout of 2000ms", "test timed out") so a
//     hung test is not mislabelled NETWORK_TIMEOUT.
//   • NETWORK_TIMEOUT is errno/connection-scoped only (NO bare "timeout"/"timed out"), so
//     "504 Gateway Timeout" falls through to HTTP_5XX and a test timeout to TEST_FAILED.
//   • HTTP_5XX/HTTP_4XX require an HTTP CONTEXT (a status word near the number, or a named
//     status phrase) — a bare "431 errors" / "500 items" must NOT read as an HTTP status.
//   • filesystem errno (ENOENT/EACCES) before the generic "permission denied" phrase.
const ERROR_MARKERS = [
  ["BAIL_LEGIT", /FIX_STATUS:\s*FAILED|\bBAIL(?:_CLASS)?\b|out-of-auto-fix-scope|hand(?:ed)?[ -]off|STOP\s*[—-]\s*hand/i],
  ["MERGE_BLOCKED", /not mergeable|merge[^.\n]*blocked|required status check|branch protection/i],
  ["GIT_PUSH_REJECTED", /!\s*\[rejected\]|push[^.\n]*rejected|non-fast-forward|fetch first/i],
  ["GIT_CONFLICT", /merge conflict|CONFLICT \(|automatic merge failed/i],
  ["LINT_FAILED", /\beslint\b|lint (?:error|failed)|prettier[^\n]*error/i],
  ["BUILD_FAILED", /build failed|compilation (?:error|failed)|found \d+ error|msbuild[^\n]*error|dotnet build[^\n]*error|webpack[^\n]*error|vite build[^\n]*error/i],
  // A bare `error TS####` is treated as the plugin's own PostToolUse tsc-hook failure — AFTER
  // BUILD_FAILED, so a target-repo build that surfaces a TS diagnostic reads as BUILD_FAILED.
  ["HOOK_TSC_ERROR", /error TS\d{3,}|\btsc\b[^\n]*error/i],
  // Test failures, INCLUDING test-runner timeouts (mocha/jest/vitest) — before NETWORK_TIMEOUT.
  ["TEST_FAILED", /\btest(?:s)? failed\b|\d+ failing\b|assertion(?:error)? failed|\bFAIL\b\s|✗|expect\(|timeout of \d+\s*ms|test(?:s)? timed out/i],
  ["MODULE_NOT_FOUND", /cannot find module|MODULE_NOT_FOUND|module [^\n]*not found|cannot resolve/i],
  ["DEP_MISSING", /command not found|is not recognized|not installed|no such command/i],
  ["FILE_NOT_FOUND", /\bENOENT\b|no such file|file not found/i],
  ["PATH_DENIED", /\bEACCES\b|\bEPERM\b|access is denied/i],
  ["NETWORK_DNS", /ENOTFOUND|EAI_AGAIN|getaddrinfo/i],
  // errno / explicit connection-timeout only — NEVER a bare "timeout" (that mislabels HTTP 504s
  // and test timeouts, both handled above/below).
  ["NETWORK_TIMEOUT", /ETIMEDOUT|ESOCKETTIMEDOUT|ECONNRESET|ECONNREFUSED|ECONNABORTED|connection timed out|request timed out|socket hang ?up/i],
  ["AUTH_MISSING_SCOPE", /missing[^\n]*scope|insufficient[^\n]*scope|requires[^\n]*scope|SAML enforcement|not authorized to|resource not accessible by/i],
  ["AUTH_EXPIRED", /token[^\n]*expired|expired[^\n]*token|bad credentials|\b401\b|\bunauthorized\b/i],
  ["RATE_LIMITED", /rate limit|\b429\b|too many requests|abuse detection|retry after/i],
  ["PERMISSION_DENIED", /permission denied|denied permission|user (?:denied|declined|rejected)|operation not permitted|not allowed to|requested permissions|\b403\b|\bforbidden\b/i],
  // HTTP status: a named 5xx/4xx phrase, OR a 3-digit code with an HTTP context word nearby —
  // NOT a bare 3-digit number (which is often a count / exit code / port).
  ["HTTP_5XX", /internal server error|bad gateway|service unavailable|gateway timeout|(?:\bhttp\b|\bstatus\b|\bcode\b|→|responded?)[^\n]{0,10}\b5\d\d\b|\b5\d\d\b[^\n]{0,12}(?:internal server error|gateway|unavailable)/i],
  ["HTTP_4XX", /bad request|unprocessable entity|(?:\bhttp\b|\bstatus\b|\bcode\b|→|responded?)[^\n]{0,10}\b4\d\d\b|\b4\d\d\b[^\n]{0,12}(?:bad request|not found|forbidden|unauthorized|conflict|unprocessable)/i],
];

/** Map an already-redacted snippet to a closed taxonomy code. Never echoes the input. */
export function classifyError(snippet) {
  const t = String(snippet ?? "");
  if (!t.trim()) return "UNKNOWN";
  for (const [code, re] of ERROR_MARKERS) if (re.test(t)) return code;
  return "UNKNOWN";
}

// ─── tool → family + agent → repo-kind (closed maps) ─────────────────────────
/** Reduce ANY tool name (incl. an arbitrary client MCP tool) to a closed family enum. */
export function toolFamily(name) {
  const n = String(name ?? "");
  if (!n) return "none";
  // github: the MCP github server, an exact GitHub op name, or a `gh …` CLI command — NOT a
  // loose `.*substring` (which mislabelled any tool merely CONTAINING create_issue as github).
  if (/^mcp__github__/i.test(n)
      || /^(?:create_pull_request|create_issue|create_branch|push_files|create_or_update_file|merge_pull_request|add_issue_comment|update_issue|get_pull_request|fork_repository)$/i.test(n)
      || /(?:^|\s)gh\s/.test(n)) return "github";
  if (/(?:atlassian__|createJiraIssue|editJiraIssue|transitionJiraIssue|addCommentToJiraIssue|getJiraIssue|searchJiraIssues)/i.test(n)) return "tracker";
  if (/^(?:mcp__playwright-|mcp__Chrome_DevTools__|mcp__claude-in-chrome__)|^browser_|^computer$|^navigate$|^read_page$/i.test(n)) return "browser";
  if (/^(?:Edit|MultiEdit|Write|NotebookEdit)$/.test(n)) return "edit";
  if (/^(?:Read|Grep|Glob|LS|NotebookRead|WebFetch|WebSearch)$/.test(n)) return "read";
  if (/^Bash$/.test(n)) return "bash";
  if (/\bgit\b/i.test(n)) return "git";
  if (/^mcp__/.test(n)) return "mcp_other";
  return "none";
}

/**
 * Reduce an OBSERVATION's `subject` to a closed tool-family enum. An observation's subject is
 * the collector's SLUGIFIED form (`obsSubject`: lowercase, non-alphanumerics → `_`, capped at 40
 * chars), so `mcp__playwright-edge__browser_snapshot` arrives as
 * `mcp_playwright_edge_browser_snapshot` and `toolFamily()`'s exact-name patterns never match it.
 * Matching on the slug shape keeps the family usable on the observation path. Output is always a
 * TOOL_FAMILIES member; anything unrecognized is `none`, never the input.
 */
export function toolFamilyOfSubject(subject) {
  const s = String(subject ?? "").toLowerCase();
  if (!s || s === "unknown") return "none";
  if (/^mcp_github_|^gh$|^github/.test(s)) return "github";
  if (/^mcp_atlassian_|jira|^ado$|^ado_|azure_boards|^tracker/.test(s)) return "tracker";
  if (/^mcp_playwright|^mcp_chrome_devtools|^mcp_claude_in_chrome|^browser_|^computer$|^navigate$|^read_page$/.test(s)) return "browser";
  if (/^(edit|multiedit|write|notebookedit)$/.test(s)) return "edit";
  if (/^(read|grep|glob|ls|notebookread|webfetch|websearch)$/.test(s)) return "read";
  if (/^bash$/.test(s)) return "bash";
  if (/(^|_)git(_|$)/.test(s)) return "git";
  if (/^mcp_/.test(s)) return "mcp_other";
  return "none";
}

/** Reduce a delegated agent name to a coarse repo-kind. Never emits module/platform from an
 *  agent alone (fullstack-backend is ambiguous → `backend`); the fail-safe direction. */
export function repoKindOfAgent(name) {
  const n = String(name ?? "");
  if (/frontend/i.test(n)) return "frontend";
  if (/backend/i.test(n)) return "backend";
  return "unknown";
}

// ─── outcome → verdict / severity (deterministic; no LLM judgment) ───────────
// The jsonl carries the Tier-1 `outcome`, not the LLM's DIAG verdict/severity — so we
// DERIVE them deterministically from outcome, consistent with the oracle §1a table.
function outcomeToVerdict(o) {
  if (o === "failed" || o === "silent_suspect") return "BROKEN";
  if (o === "degraded") return "DEGRADED";
  return "OK"; // success / recovered
}
function outcomeToSeverity(o) {
  if (o === "failed" || o === "silent_suspect") return "S1";
  if (o === "degraded") return "S2";
  if (o === "recovered") return "S3";
  return "S0";
}

// ─── small helpers ───────────────────────────────────────────────────────────
const clampInt = (n, lo, hi) => {
  const v = Math.trunc(Number(n));
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
};
const inSet = (set, v, dflt) => (typeof v === "string" && set.has(v) ? v : dflt);
// pluginVersion is the ONE field that used to echo its input behind a SHAPE gate rather than
// a closed vocabulary — the old `/^\d+\.\d+\.\d+(?:-\S+)?$/ ? v : "unknown"` returned `v`
// VERBATIM on a match, and the `-\S+` prerelease tail is an UNBOUNDED wildcard, so a
// client-controlled `"1.0.0-AcmeCorp"` / `"1.0.0-github_pat_…"` (a whitespace-free blob after
// a `X.Y.Z-` prefix, reachable via the DIAG "Plugin:" fallback line) survived to the public
// upstream (adversarial review A). Fix: NEVER echo input — extract ONLY the numeric MAJOR.MINOR
// .PATCH core (bounded digits) and DISCARD any suffix, so the emitted value is structurally
// constrained to `\d{1,4}\.\d{1,4}\.\d{1,4}` or "unknown". Losing a prerelease tag is the
// fail-safe direction (loss of detail, never a leak).
const validPluginVersion = (v) => {
  const m = /^(\d{1,4})\.(\d{1,4})\.(\d{1,4})/.exec(String(v ?? ""));
  return m ? `${m[1]}.${m[2]}.${m[3]}` : "unknown";
};

const isSpan = (r) => r && r.type === "span";
const isObs = (r) => r && r.type === "obs";
const isEscalationUnit = (s) => s.kind === "skill" || s.kind === "command";
const FLAGGED_OUTCOMES = new Set(["degraded", "failed", "silent_suspect"]);

// ─── observations → findings (VCST-5582 H, the half that was never wired) ─────
// VCST-5582 H redefined the analysis set as **observations ∪ flagged spans ∪ feedback**, but
// that only ever landed in the ORACLE and in `/vc-self-check` — the reducer kept iterating
// `local.spans` alone and requiring `outcome ∈ FLAGGED_OUTCOMES`, so `type:"obs"` records were
// read by nobody on the upstream path. Consequence: a session whose command span ends
// `recovered` (deliverable achieved, errors recovered along the way) reduced to ZERO findings —
// precisely the class the redesign existed for. Reproduced on a real client run: 10 obs records
// on disk, `reduce()` → 0 findings, and the contribution fell back to the DIAG table's
// enum-only shell (`skill: other`, `signalClass: none`, `errorCode: UNKNOWN`).
//
// Judgement stays where the oracle puts it — severity is assigned HERE (Tier 2), never at
// capture time — and this function implements the §1f rubric deterministically:
//   • candidate severity per class (OBS_SEVERITY; unknown class ⇒ S3, the table's last row)
//   • same-subject merge (rule 1): observations sharing an owning skill + subject collapse into
//     ONE finding at max(severity)
//   • triangulation (rule 2): ≥3 DIFFERENT non-noise classes on one subject ⇒ +1 severity step
//   • occurrence weighting (rule 5): a class with count ≥ 3 promotes its own S3 candidate to S2
//   • NOISE classes (policy_block / self_reported_skip / harness_noise) never drive a finding on
//     their own — they are kept as supporting evidence only, so they cannot inflate a group
// Only ACTIONABLE groups (S1/S2 ⇒ BROKEN/DEGRADED) become upstream findings, matching the span
// path's "every finding in the struct is actionable" contract; an S3-only group is recorded
// locally and analysed by /vc-self-check, but is not worth a public ticket.
//
// Grouping is by (skill, subject), a refinement of §1f rule 1: `subject` alone would fuse the
// same tool failing under two different skills into one finding and lose the `skill` dimension
// that makes the report actionable (rule 4 handles genuine cross-skill clustering separately).
function foldObservations(obsRecords) {
  const groups = new Map();
  for (const o of obsRecords) {
    const skill = typeof o.skill === "string" && o.skill ? o.skill : "";
    if (/vc-self-check/i.test(skill)) continue; // loop guard — same rule the span path applies
    const subject = typeof o.subject === "string" && o.subject ? o.subject : "unknown";
    const cls = typeof o.class === "string" && o.class ? o.class : "unclassified";
    const count = clampInt(o.count ?? 1, 1, 1_000_000);
    const key = `${skill}|${subject}`;
    let g = groups.get(key);
    if (!g) {
      g = { skill, subject, classes: new Set(), noiseOnly: true, severity: null, code: "UNKNOWN", signalClass: "none" };
      groups.set(key, g);
    }
    // A NOISE observation joins the group as evidence but contributes no severity and does not
    // count toward triangulation — "never on its own" (§1f).
    if (OBS_NOISE_CLASSES.has(cls)) continue;
    g.noiseOnly = false;
    g.classes.add(cls);
    let cand = OBS_SEVERITY[cls] ?? "S3";
    if (cand === "S3" && count >= 3) cand = "S2"; // §1f rule 5 — occurrence weighting
    g.severity = g.severity ? maxSev(g.severity, cand) : cand;
    // signalClass: only meaningful when the observation class IS one of the span signal classes.
    // Ordered by SIGNAL_CLASSES so a genuine blocking class beats the non-blocking policy_block.
    if (SIGNAL_CLASSES_SET.has(cls) && cls !== "none") {
      const better = SIGNAL_CLASSES.indexOf(cls) < SIGNAL_CLASSES.indexOf(g.signalClass);
      if (g.signalClass === "none" || better) g.signalClass = cls;
    }
    // The collector already classified the error TEXT to a taxonomy code locally; only the code
    // travels. "NONE" (a class with no error text, e.g. harness noise) is not a taxonomy member.
    if (g.code === "UNKNOWN" && ERROR_CODES_SET.has(o.code)) g.code = o.code;
  }

  const findings = [];
  for (const g of groups.values()) {
    if (g.noiseOnly || !g.severity) continue;
    let severity = g.severity;
    if (g.classes.size >= 3) severity = promoteSev(severity); // §1f rule 2 — triangulation
    if (severity === "S3") continue; // not actionable upstream (still local + still analysed)
    const verdict = severity === "S1" ? "BROKEN" : "DEGRADED";
    findings.push({
      skill: inSet(SKILLS_SET, g.skill, "other"),
      verdict,
      severity,
      // Mirror the span path's outcome↔verdict pairing so the SAME defect fingerprints
      // identically whichever source observed it.
      outcome: verdict === "BROKEN" ? "failed" : "degraded",
      signalClass: g.signalClass,
      struggle: [],
      errorCode: g.code,
      toolFamily: toolFamilyOfSubject(g.subject),
      repoKind: "unknown", // an observation carries no delegated-agent dimension
      retries: 0,
      // Within a session this is always 1 — `obs.count` is folded into SEVERITY above, and
      // `occurrences` means "how many SESSIONS hit this finding" (mergeStructs' job).
      occurrences: 1,
    });
  }
  return findings;
}

/** Snippets from a span's own details ring (redacted at capture time). */
function snippetsOf(span) {
  if (!span || !Array.isArray(span.details)) return [];
  return span.details.map((d) => (d && typeof d.snippet === "string" ? d.snippet : "")).filter(Boolean);
}

// ─── reduce ──────────────────────────────────────────────────────────────────
/**
 * reduce(local) -> UpstreamSignal. `local`:
 *   { spans: <span records>, obs: <obs records>, feedback: <feedback records>, pluginVersion,
 *     fallbackFindings?: [{skill,verdict,sev}] }  // enum-only fallback when jsonl absent
 * Findings come from the FULL VCST-5582 H analysis set — the skill/command spans whose outcome
 * ∈ {degraded,failed,silent_suspect} PLUS the observation stream folded per §1f
 * (`foldObservations`). vc-self-check's own records are dropped from both (loop guard). Every
 * emitted string is a closed-vocabulary member; validateUpstream re-checks at the boundary.
 */
export function reduce(local = {}) {
  const spans = Array.isArray(local.spans) ? local.spans.filter(isSpan) : [];
  const byParent = new Map();
  for (const s of spans) {
    if (s.parentId == null) continue;
    const arr = byParent.get(s.parentId) || [];
    arr.push(s);
    byParent.set(s.parentId, arr);
  }

  const findings = [];
  const seenIds = new Set();
  for (const span of spans) {
    if (!isEscalationUnit(span)) continue;
    if (!FLAGGED_OUTCOMES.has(span.outcome)) continue;
    if (/vc-self-check/i.test(String(span.name ?? ""))) continue; // loop guard
    if (span.id != null) { if (seenIds.has(span.id)) continue; seenIds.add(span.id); }

    const children = (span.id != null && byParent.get(span.id)) || [];
    const errChildren = children.filter((c) => c.status === "error");
    const failingTool = errChildren.find((c) => c.kind === "tool") || null;
    const agentChild = children.find((c) => c.kind === "agent") || null;

    // classifyError over the blocking snippets: the span's own details first (the rolled-up
    // blocking error lands here), then the error children's. First non-UNKNOWN wins.
    let errorCode = "UNKNOWN";
    for (const snip of [...snippetsOf(span), ...errChildren.flatMap(snippetsOf)]) {
      const code = classifyError(snip);
      if (code !== "UNKNOWN") { errorCode = code; break; }
    }

    const sig = span.signals || {};
    const signalClass = SIGNAL_CLASSES.find((c) => c !== "none" && (sig[c] || 0) > 0) || "none";
    const struggle = [...new Set((Array.isArray(span.struggle) ? span.struggle : []).filter((x) => STRUGGLES_SET.has(x)))].sort();

    findings.push({
      skill: inSet(SKILLS_SET, span.name, "other"),
      verdict: outcomeToVerdict(span.outcome),
      severity: outcomeToSeverity(span.outcome),
      outcome: inSet(OUTCOMES_SET, span.outcome, "failed"),
      signalClass,
      struggle,
      errorCode,
      toolFamily: failingTool ? toolFamily(failingTool.name) : "none",
      repoKind: agentChild ? repoKindOfAgent(agentChild.name) : "unknown",
      retries: clampInt(span.retries, 0, 99),
      occurrences: 1,
    });
  }

  // The observation stream — the other half of the §1e analysis set. Additive to the span
  // findings (never a substitute): a run can legitimately have a flagged span AND a degradation
  // its spans classified `success`/`recovered`, and dropping either loses signal.
  findings.push(...foldObservations(Array.isArray(local.obs) ? local.obs.filter(isObs) : []));

  // Enum-only fallback (jsonl purged but a DIAG remained): map its already-validated
  // verdict/sev, drop every free-text cell. Reached only when NEITHER structured source
  // produced anything — a real obs/span finding always outranks a DIAG-table guess.
  if (!findings.length && Array.isArray(local.fallbackFindings)) {
    for (const f of local.fallbackFindings) {
      const verdict = inSet(VERDICTS_SET, f?.verdict, null);
      if (!verdict || verdict === "OK") continue; // mirror the primary path: only flagged (BROKEN/DEGRADED)
      findings.push({
        skill: inSet(SKILLS_SET, f?.skill, "other"),
        verdict,
        // DERIVE severity from verdict (do NOT trust the DIAG's parsed `sev`): the primary path
        // derives S1/S2 from the outcome, so a fallback finding must match or the SAME defect
        // fingerprints differently across the jsonl vs DIAG-fallback paths (adversarial review #4 B2).
        severity: verdict === "BROKEN" ? "S1" : "S2", // OK is filtered out above
        outcome: verdict === "BROKEN" ? "failed" : "degraded",
        signalClass: "none",
        struggle: [],
        errorCode: "UNKNOWN",
        toolFamily: "none",
        repoKind: "unknown",
        retries: 0,
        occurrences: 1,
      });
    }
  }

  // Collapse findings that share a structural signature into ONE. Two cases need this and the
  // id-dedup above catches neither: (a) the same skill legitimately failed the same way twice in
  // one session, and (b) a transcript rotation/compaction (scanTranscript's `size < scannedBytes`
  // branch) re-scans from scratch and re-emits a span with a FRESH id — so `seenIds` can't dedup
  // it (code review #3). Left as-is, the duplicates inflate the body AND fork the fingerprint
  // (fingerprintStruct hashes the sorted finding-sig list), so the SAME defect fails to converge
  // across clients. Keep the first occurrence; within a session occurrences stays 1 (cross-SESSION
  // counting is mergeStructs' job, keyed on this same signature).
  const dedupedFindings = [];
  const seenSigs = new Set();
  for (const f of findings) {
    const k = findingStructSig(f);
    if (seenSigs.has(k)) continue;
    seenSigs.add(k);
    dedupedFindings.push(f);
  }

  const fb = Array.isArray(local.feedback) ? local.feedback : [];
  const feedback = {
    up: fb.filter((f) => f && f.verdict === "up").length,
    down: fb.filter((f) => f && f.verdict === "down").length,
  };

  return {
    schemaVersion: SCHEMA_VERSION,
    pluginVersion: validPluginVersion(local.pluginVersion),
    findings: dedupedFindings,
    feedback,
    sessionCount: clampInt(local.sessionCount ?? 1, 1, 1_000_000),
  };
}

// ─── validateUpstream — the runtime boundary barrier ─────────────────────────
/**
 * Re-check EVERY field against its closed vocabulary; coerce anything out-of-vocabulary to
 * a safe default and clamp numbers. This is what makes a leak impossible even if `reduce`
 * (or a future edit) has a bug: a rogue string in an enum slot is dropped, not forwarded.
 * Pure; returns a fresh struct.
 */
export function validateUpstream(struct) {
  const s = struct && typeof struct === "object" ? struct : {};
  const findingsIn = Array.isArray(s.findings) ? s.findings : [];
  const findings = findingsIn.map((f) => {
    const o = f && typeof f === "object" ? f : {};
    return {
      skill: inSet(SKILLS_SET, o.skill, "other"),
      verdict: inSet(VERDICTS_SET, o.verdict, "OK"),
      severity: inSet(SEVERITIES_SET, o.severity, "S0"),
      outcome: inSet(OUTCOMES_SET, o.outcome, "failed"),
      signalClass: inSet(SIGNAL_CLASSES_SET, o.signalClass, "none"),
      struggle: [...new Set((Array.isArray(o.struggle) ? o.struggle : []).filter((x) => STRUGGLES_SET.has(x)))].sort(),
      errorCode: inSet(ERROR_CODES_SET, o.errorCode, "UNKNOWN"),
      toolFamily: inSet(TOOL_FAMILIES_SET, o.toolFamily, "none"),
      repoKind: inSet(REPO_KINDS_SET, o.repoKind, "unknown"),
      retries: clampInt(o.retries, 0, 99),
      occurrences: clampInt(o.occurrences ?? 1, 1, 1_000_000),
    };
  });
  const fb = s.feedback && typeof s.feedback === "object" ? s.feedback : {};
  return {
    schemaVersion: SCHEMA_VERSION,
    pluginVersion: validPluginVersion(s.pluginVersion),
    findings,
    feedback: { up: clampInt(fb.up ?? 0, 0, 1_000_000), down: clampInt(fb.down ?? 0, 0, 1_000_000) },
    sessionCount: clampInt(s.sessionCount ?? 1, 1, 1_000_000),
  };
}

// ─── structural signature + fingerprint ──────────────────────────────────────
// A BROKEN finding's `outcome` is either `failed` or `silent_suspect`, but the two upstream
// entry paths DISAGREE on which they emit for the SAME defect: the primary jsonl path emits
// the Tier-1 outcome verbatim (a silent span → `silent_suspect`), while the DIAG-fallback
// derives outcome from the verdict alone (BROKEN → `failed`). Both already carry verdict=BROKEN
// / severity=S1, so folding them to one signature token keeps the true outcome in the emitted
// struct/body while making a jsonl-present client and a DIAG-only client converge on ONE
// upstream issue instead of forking (code review #2). Fail-safe: same verdict ⇒ same identity.
function outcomeSig(o) {
  return o === "silent_suspect" || o === "failed" ? "broken" : o;
}
/** Identity of a single finding, over its ENUM fields only (no text, no occurrences). */
export function findingStructSig(f) {
  return [
    f.skill, f.verdict, f.severity, outcomeSig(f.outcome), f.signalClass,
    (Array.isArray(f.struggle) ? [...f.struggle].sort().join("+") : ""),
    f.errorCode, f.toolFamily, f.repoKind,
  ].join("|");
}

/**
 * Stable, Date-free djb2 → base36 hash over the STRUCTURAL tuple (enum finding sigs) — NEVER
 * over raw/LLM text, so dedup cannot smuggle client bytes into the hash. pluginVersion is
 * deliberately excluded (a version bump must not fork the issue).
 *
 * Feedback counts fold into the hash ONLY when there are NO findings (a feedback-only report) —
 * so distinct feedback-only verdicts (👍 vs 👎) stay distinct issues (the D2 concern) WITHOUT
 * fragmenting dedup of a real finding: two clients hitting the SAME finding, one of whom also
 * left feedback, must converge to ONE upstream issue (deliver adds "+1 occurrence"), not fork
 * because their feedback counts differed (adversarial review #2, break 2a).
 */
export function fingerprintStruct(struct) {
  const s = validateUpstream(struct);
  const parts = s.findings.map(findingStructSig);
  if (!parts.length) parts.push(`fb|${s.feedback.up}|${s.feedback.down}`);
  const sig = parts.sort().join("\n");
  let h = 5381;
  for (let i = 0; i < sig.length; i++) h = ((h * 33) ^ sig.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
