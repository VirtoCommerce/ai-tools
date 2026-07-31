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

// v2 (item 10) added `subject` + `blockedDeliverable` to UpstreamFinding, so a finding can name
// WHICH operation misbehaved and whether it stopped the run. v1 read `other | BROKEN | S1 | …` —
// enough to prove something broke, never enough to know what. Both new fields are closed
// vocabularies (an enum and a boolean), so distinguishability grew without widening the leak
// surface by one byte.
//
// v3 opens a NARROW string channel under a PROVENANCE rule (see §"vendor-provenance" below):
// `pluginFile`/`pluginLine`/`codeExcerpt`/`offendingLiteral`/`apiShape`/`proposedFix` plus the
// vendor's own error identity. The guarantee is no longer "no strings at all" but "a string may
// travel only if it originates from the vendor's own shipped plugin source (or the vendor's own
// error enums), and only after a boundary validator has failed to find any client value in it".
// Returning the vendor their own code cannot leak the client. Dedup is unaffected —
// `findingStructSig` deliberately does NOT fold any v3 string, so a refactor that shifts a line
// number cannot fork an already-filed issue.
export const SCHEMA_VERSION = 3;

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

// ─── SUBJECTS — WHICH operation misbehaved (item 10, schema v2) ───────────────
// A v1 finding read `other | BROKEN | S1 | failed | none | UNKNOWN | none | unknown`: enough to
// prove something broke, never enough to act. The reproduction's S1 was an Azure Boards
// `create-workitem` required-field gate and its S2 was an admin-credential handoff gap — and the
// payload could not tell them apart, or from noise.
//
// This is a CLOSED vocabulary, exactly like every other field: a plugin-authored list of the
// operations the plugin itself performs. It is NOT the collector's `subject` string echoed
// through — that is a slugified client-influenced value (a tool name, a script name) and echoing
// it would reopen by the back door precisely the free-text channel the closed schema exists to
// shut. `subjectEnum()` MAPS onto this list and anything unrecognized becomes `other`.
export const SUBJECTS = [
  "none",
  // tracker — filing / updating / discovering the bug tracker's contract
  "ado_create_workitem", "ado_cli", "ado_transition", "jira_create_issue", "jira_transition",
  "tracker_field_contract", "tracker_discovery",
  // VCS / upstream
  "github_search_issues", "github_issue_create", "github_pr_create", "git_push", "vcs_auth",
  // browser / credentials
  "browser_login", "browser_navigate", "browser_snapshot", "browser_evaluate", "admin_credential_handoff",
  // onboarding / generated project state
  "env_scaffold", "profile_shape", "repo_discovery", "access_verification", "mcp_config", "dependency_install",
  // fix pipeline
  "repo_checkout", "unit_test_harness", "build", "typecheck", "lint",
  // the plugin's own diagnostics
  "collector_verdict_integrity", "collector_scan", "collector_capture", "self_check_delivery",
  "other",
];

const SUBJECTS_SET = new Set(SUBJECTS);

// Slug → SUBJECTS. Ordered: the specific operation before the surface it ran on, so an `ado`
// subject carrying a `create-workitem` code is not flattened to the generic CLI entry. First match
// wins; no match ⇒ "other". The input is NEVER echoed.
//
// EVERY pattern is `_`-boundary-delimited on the slug, never a bare substring. An unanchored
// `/checkout|clone/` matched a *client repo name* containing the word — a fixture called
// `leocorpCheckout` mapped to `repo_checkout`, which is not a leak (only the enum travels) but IS
// wrong information, and wrong information in a vendor-facing report is worse than none. Boundaries
// keep a client-controlled string from steering the bucket while still matching the plugin's own
// operation names, which are `_`-separated by construction.
const B = (...alts) => new RegExp(`(?:^|_)(?:${alts.join("|")})(?:_|$)`);
const SUBJECT_MARKERS = [
  ["ado_create_workitem", B("ado_create_workitem", "create_workitem", "createworkitem")],
  ["ado_transition", B("ado_transition", "ado_state")],
  ["ado_cli", B("ado")],
  ["jira_create_issue", B("createjiraissue", "jira_create_issue", "jira_create")],
  ["jira_transition", B("transitionjiraissue", "jira_transition")],
  ["tracker_field_contract", B("field_contract", "bug_contract", "fielddefaults")],
  ["tracker_discovery", B("discover_tracker")],
  ["github_search_issues", B("github_search_issues", "search_issues")],
  ["github_issue_create", B("github_create_issue", "create_issue")],
  ["github_pr_create", B("create_pull_request", "pr_create")],
  ["git_push", B("git_push", "push")],
  ["vcs_auth", B("gh_auth", "token_probe", "probe_github")],
  ["admin_credential_handoff", B("credential", "credentials", "password", "admin_login")],
  ["browser_login", B("login", "signin", "sign_in")],
  ["browser_evaluate", B("run_code_unsafe", "run_code_uns", "browser_evaluate", "evaluate_script")],
  ["browser_snapshot", B("browser_snapshot", "take_snapshot", "read_page")],
  ["browser_navigate", B("browser_navigate", "navigate_page")],
  ["access_verification", B("verify_access")],
  ["repo_discovery", B("discover_repos")],
  ["profile_shape", B("gen_profile", "assert_profile", "project_profile")],
  ["env_scaffold", B("scaffold_env", "scaffold_secrets", "write_env")],
  ["mcp_config", B("gen_mcp")],
  ["dependency_install", B("npm_install", "install")],
  ["repo_checkout", B("checkout", "clone", "git_clone")],
  ["unit_test_harness", B("test", "tests", "vitest", "xunit", "dotnet_test")],
  ["typecheck", B("tsc", "vue_tsc", "typecheck")],
  ["lint", B("eslint", "lint")],
  ["build", B("build", "msbuild", "vite")],
  ["self_check_delivery", B("deliver", "vc_self_check", "upstream_reduce")],
  ["collector_scan", B("session_telemetry", "collector_scan")],
  ["collector_verdict_integrity", B("verdict_integrity")],
  ["collector_capture", B("obs", "capture")],
];

/** Map an observation/DIAG subject onto the closed SUBJECTS vocabulary. Never echoes the input. */
export function subjectEnum(subject) {
  const s = String(subject ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!s || s === "unknown") return "none";
  if (SUBJECTS_SET.has(s)) return s; // already a vocabulary member (a sidecar supplying it directly)
  for (const [val, re] of SUBJECT_MARKERS) if (re.test(s)) return val;
  return "other";
}

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
// Same never-echo discipline for the Node version (v3): extract the numeric core, discard any
// suffix, emit a structurally constrained value or "unknown".
const validNodeVersion = (v) => {
  const m = /^v?(\d{1,3})(?:\.(\d{1,3}))?(?:\.(\d{1,4}))?/.exec(String(v ?? ""));
  return m ? `v${m[1]}.${m[2] ?? 0}.${m[3] ?? 0}` : "unknown";
};

const isSpan = (r) => r && r.type === "span";
const isObs = (r) => r && r.type === "obs";
// Loop guard (item 1/9): the diagnostician now runs in a SUBAGENT (`self-check-diagnostician`), so
// its span/observation must be dropped from the upstream reduction exactly like the `vc-self-check`
// skill's own — else a client's self-check would contribute a finding ABOUT self-check.
const SELF_CHECK_NAME_RE = /vc-self-check|self-check-diagnostician/i;
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
    if (SELF_CHECK_NAME_RE.test(skill)) continue; // loop guard — same rule the span path applies
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
      // The observation's own subject, mapped onto the closed vocabulary — this is what turns
      // `other | BROKEN | S1` into `S1 · qa-bug · ado_create_workitem · blocked`.
      subject: subjectEnum(g.subject),
      // An S1 observation group means a required step could not be trusted to have run.
      blockedDeliverable: severity === "S1",
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
    if (SELF_CHECK_NAME_RE.test(String(span.name ?? ""))) continue; // loop guard
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
      // WHICH operation misbehaved (v2). A span's own `subject` is the failing child tool/script
      // when the collector could attribute one, else the span's name.
      subject: subjectEnum(failingTool?.subject || failingTool?.name || span.subject || ""),
      // Did it stop the run? `failed`/`silent_suspect` mean the span did not achieve its purpose;
      // `degraded` completed with a violated rule. Derived, never judged here.
      blockedDeliverable: span.outcome === "failed" || span.outcome === "silent_suspect",
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
  //
  // NOTE (PR #172 item 2): the former `local.fallbackFindings` DIAG-table last-resort path is GONE.
  // With no DIAG-*.md written or read, there is nothing to fall back FROM — `deliver` receives the
  // diagnostician's struct on stdin, and `reduce()` is used only for the enum fields from the
  // structured jsonl (spans ∪ observations ∪ feedback). No prose ever enters this function.
  findings.push(...foldObservations(Array.isArray(local.obs) ? local.obs.filter(isObs) : []));

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
    nodeVersion: validNodeVersion(local.nodeVersion),
    os: inSet(OS_SET, local.os, "other"),
    findings: dedupedFindings,
    feedback,
    sessionCount: clampInt(local.sessionCount ?? 1, 1, 1_000_000),
  };
}

/**
 * The DEFECT IDENTITY, and the ONLY thing per-finding dedup may key on: `(skill, subject)`.
 *
 * Severity, verdict, outcome, errorCode and occurrence counts are per-SESSION judgements about the
 * same underlying bug, so folding any of them into the key splits one defect into many issues. That
 * is not hypothetical: two sessions 26 minutes apart filed #173 and #174 for the same
 * `project-init/tracker_field_contract` defect, graded `S2 / UNKNOWN` in one and `S1 / HTTP_4XX` in
 * the other. A key over the whole report missed it; a key folding severity would have missed it too.
 */
/** Severity as a comparable rank (higher = worse). S0 = "no finding" → 0. */
export function severityRank(sev) {
  return { S0: 0, S3: 1, S2: 2, S1: 3 }[String(sev ?? "")] ?? 0;
}
/** Verdict as a comparable rank, so an issue's title can be upgraded DEGRADED → BROKEN. */
export function verdictRank(v) {
  return { OK: 0, DEGRADED: 1, BROKEN: 2 }[String(v ?? "")] ?? 0;
}

export function findingKey(f) {
  const o = f && typeof f === "object" ? f : {};
  const skill = inSet(SKILLS_SET, o.skill, "other");
  // B2: MAP the subject onto the closed vocabulary (never an exact-membership test) — the same
  // `subjectEnum` the telemetry path already uses. The old `inSet` collapsed EVERY free-text
  // diagnostician subject to `other`, which is how #181/#182/#183 (three distinct ado.mjs defects)
  // shared one `qa-bug/other` identity and dedup-matched each other arbitrarily.
  const subject = subjectEnum(o.subject);
  // A subject that genuinely maps to the catch-all `other` cannot, on its own, tell two different
  // defects apart. When (and only when) it does, append a short hash of the plugin SITE the finding
  // points at, so two distinct defects never share an identity while the SAME defect from two
  // sessions still converges (both cite the same file:line). The hash covers plugin-owned values
  // only — never client text.
  if (subject === "other") {
    const site = `${o.pluginFile ?? ""}:${o.pluginLine ?? ""}`;
    if (site !== ":") return `${skill}/${subject}#${hash36(site)}`;
  }
  return `${skill}/${subject}`;
}

// ─── v3: the vendor-provenance string channel ────────────────────────────────
/**
 * v1/v2 guaranteed "no strings at all". That was sound containment and useless reporting: the
 * reference payload rendered `Signal: none · Struggle: — · Repo: unknown · Outcome: success`, so a
 * maintainer learned only that *something* 4xx'd — while the diagnosing session knew the FILE, the
 * LINE, the offending literal and the one-line fix, and none of it travelled.
 *
 * v3 replaces the guarantee with a sharper one: **a string may travel only if it originates from
 * the vendor's OWN shipped plugin source** (or is the vendor API's own stable error enum).
 * Returning the vendor their own code cannot leak the client. Everything else is denied — and
 * DENIED, never coerced: a coerced string is a string that travelled.
 *
 * Two independent gates, both required:
 *   1. **Provenance** — `codeExcerpt` / `offendingLiteral` must be a literal substring of the cited
 *      plugin file's ACTUAL content, read at diagnose time. No proof ⇒ no field.
 *   2. **Boundary** — no URL host, no absolute filesystem path, no email, no token-shaped run, no
 *      value read from `.env.*` / `project-profile.json`, and no work-item field reference name
 *      outside the `System.*` / `Microsoft.VSTS.*` namespaces.
 *
 * Still forbidden outright, with no field to carry them: work-item STATE names, custom work-item
 * TYPE names, repo/org/project names, any path outside the plugin. Counts travel instead.
 *
 * PURITY IS PRESERVED. This module still does no I/O: the caller (`deliver.mjs`) loads the plugin
 * files and the deny-values and passes them in as a `ctx`. **Without a `ctx` every v3 string is
 * dropped** — "unproven" is the default, so a code path that forgets to thread the context fails
 * closed instead of leaking.
 *
 * ctx = { files: Map<pluginRelPath, fileContent>, denyValues: string[], states: string[] }
 */
export const OS_VALUES = ["win32", "darwin", "linux", "other"];
const OS_SET = new Set(OS_VALUES);

/** Vendor documentation hosts — the ONLY hosts a `vendorDocUrl` may point at. */
export const VENDOR_DOC_HOSTS = ["learn.microsoft.com", "docs.github.com"];

/** Work-item field reference namespaces that are the VENDOR's, not the client's process. */
const WIT_ALLOWED_NAMESPACES = [/^System\./, /^Microsoft\.VSTS\./];
// Dotted `Capitalized.something` tokens that are ordinary JS/plugin code, not WIT field names.
const CODE_NAMESPACES = new Set([
  "JSON", "Object", "Array", "Math", "Number", "String", "Boolean", "Promise", "Date", "RegExp",
  "Map", "Set", "WeakMap", "Error", "TypeError", "URL", "URLSearchParams", "Buffer", "Intl",
  "Reflect", "Proxy", "Symbol", "BigInt", "Function", "AbortController", "TextEncoder",
]);

const FIELD_CAPS = {
  pluginFile: 200,
  codeExcerpt: 400,
  offendingLiteral: 120,
  apiShape: 200,
  proposedFix: 800, // B3: a root cause + a concrete fix does not fit in 300 chars (the old cap
                    // nulled three real 445-char fixes for being ONE char over). Human-readable, so
                    // over-cap now TRUNCATES with a marker (see `truncField`), never hard-drops.
  vendorErrorTypeKey: 80,
  vendorErrorName: 120,
  vendorErrorCode: 40,
  vendorDocUrl: 300,
  vendorErrorMessage: 300, // §6b — the one field whose safety rests on normalize + deny + disclose
};

// A plugin-relative path: forward slashes, no drive letter, no `..`, no leading `/`.
const PLUGIN_REL_PATH = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/;

const HOSTISH = /\bhttps?:\/\//i;
const BARE_HOST = /\b(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+(?:com|net|org|io|dev|ru|co|ai|app|cloud|sh|me|info|biz|local|internal|onmicrosoft|visualstudio)\b/i;
const ABS_PATH = /(?:^|[\s"'`(=,[])(?:[A-Za-z]:[\\/]|\\\\[A-Za-z0-9._-]+\\|\/(?:home|Users|users|var|etc|opt|usr|mnt|srv|tmp|root|proc)\/)/;
const EMAILISH = /[\w.+-]+@[\w-]+\.[\w.-]{2,}/;
const TOKENISH = new RegExp(
  [
    String.raw`gh[pousr]_[A-Za-z0-9]{16,}`,
    String.raw`github_pat_[A-Za-z0-9_]{20,}`,
    String.raw`glpat-[A-Za-z0-9_-]{16,}`,       // GitLab PAT
    String.raw`xox[baprs]-[A-Za-z0-9-]{10,}`,
    String.raw`sk_(?:live|test)_[A-Za-z0-9]{10,}`, // Stripe
    String.raw`AIza[A-Za-z0-9_-]{16,}`,          // Google API key
    String.raw`AKIA[0-9A-Z]{12,}`,
    String.raw`eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}`,
    String.raw`[A-Za-z0-9+/]{40,}={0,2}`,
    String.raw`[0-9a-f]{40,}`,
  ].join("|"),
);
// An Azure DevOps `projectId` IS a GUID and IS a client identifier — a GUID never travels.
const GUIDISH = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const IPISH = /\b(?:\d{1,3}\.){3}\d{1,3}\b/;

/**
 * Does this string contain a WIT field reference name outside the vendor namespaces? A custom
 * namespace (`Leo.Bug.Severity`, `Custom.ReviewState`) is the CLIENT's process definition, which is
 * exactly the class of value we must never echo back to the vendor.
 */
export function violatesFieldNamespace(text) {
  const t = String(text ?? "");
  const re = /\b([A-Z][A-Za-z0-9]*)((?:\.[A-Za-z0-9]+)+)\b/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const token = m[0];
    if (CODE_NAMESPACES.has(m[1])) continue; // ordinary code, e.g. `JSON.stringify`
    if (WIT_ALLOWED_NAMESPACES.some((re2) => re2.test(token))) continue;
    return true;
  }
  return false;
}

/**
 * The boundary gate. Returns a REASON string when the value must be denied, else null.
 * `kind` relaxes exactly two checks for the two fields whose whole purpose is the shape being
 * checked: `path` (a plugin-relative path is not an absolute path) and `url` (a vendor doc URL is
 * a URL, and gets a host allowlist instead).
 */
export function boundaryDenial(value, { kind = "text", denyValues = [], states = [] } = {}) {
  const v = String(value ?? "");
  if (!v) return "empty";
  if (/[\r\n]/.test(v) && kind !== "code") return "multiline";
  if (kind !== "url" && (HOSTISH.test(v) || BARE_HOST.test(v))) return "contains a URL host";
  if (kind !== "path" && ABS_PATH.test(v)) return "contains an absolute filesystem path";
  if (EMAILISH.test(v)) return "contains an email address";
  if (TOKENISH.test(v)) return "contains a token-shaped run";
  if (GUIDISH.test(v)) return "contains a GUID";
  if (kind !== "url" && IPISH.test(v)) return "contains an IP address";
  if (violatesFieldNamespace(v)) return "names a work-item field outside System.* / Microsoft.VSTS.*";
  const low = v.toLowerCase();
  for (const d of denyValues) {
    if (d && low.includes(String(d).toLowerCase())) return "contains a value read from .env.* / project-profile.json";
  }
  for (const s of states) {
    if (s && low.includes(String(s).toLowerCase())) return "contains a work-item state name";
  }
  return null;
}

// A `.mjs`/`.ts`/… suffix marks a plugin FILENAME, not a client work-item field ref — used to relax
// the dotted-identifier allowlist below for a proposedFix that names a plugin file.
const PLUGIN_FILE_EXT = /\.(?:mjs|cjs|ts|tsx|js|jsx|json|md)$/i;

/**
 * The proposedFix boundary (VCST-5582 B2). `proposedFix` is the single most actionable field, so it
 * must be able to TRAVEL — but it is model-authored prose, and the generic `boundaryDenial` denies
 * ANY `Capitalized.dotted` token via `violatesFieldNamespace`, which eats legitimate vendor-enum
 * references (`WorkItemTypeFieldsExpandLevel.All`) and plugin symbol paths. So proposedFix gets its
 * own gate: KEEP default-deny on the real leak shapes, ADD an allowlist on the identifier shapes.
 *
 *   - DENY outright (a genuine leak vector, never scrubbed — the field is dropped): a URL host, an
 *     absolute filesystem path, an email, a token-shaped run, a GUID, or any value read from the
 *     client's `.env.*` / `project-profile.json` (the `denyValues`).
 *   - ALLOWLIST every `Capitalized.dotted` identifier: it must be a JS built-in namespace
 *     (`JSON.stringify`), a `System.*` / `Microsoft.VSTS.*` WIT field ref, a plugin filename
 *     (`README.md`), or a literal that appears VERBATIM in a cited plugin source file. A FOREIGN
 *     dotted identifier (`Custom.ReviewState`, `Web.config`) is denied — it could be the client's
 *     own custom field or file.
 *
 * Plugin-relative paths, `*.mjs`/`*.ts` filenames, file:line pairs and lower-case plugin symbols are
 * all permitted implicitly (they are not `Capitalized.dotted`, so the loop never inspects them, and
 * none of the leak-shape checks match them). Returns a REASON to deny, or null to allow. Pure.
 */
export function proposedFixDenial(value, { denyValues = [], files = null } = {}) {
  const v = String(value ?? "");
  if (!v.trim()) return "empty";
  if (HOSTISH.test(v) || BARE_HOST.test(v)) return "contains a URL host";
  if (ABS_PATH.test(v)) return "contains an absolute filesystem path";
  if (EMAILISH.test(v)) return "contains an email address";
  if (TOKENISH.test(v)) return "contains a token-shaped run";
  if (GUIDISH.test(v)) return "contains a GUID";
  const low = v.toLowerCase();
  for (const d of denyValues) {
    if (d && low.includes(String(d).toLowerCase())) return "contains a value read from .env.* / project-profile.json";
  }
  const fileMap = files instanceof Map ? files : null;
  const re = /\b([A-Z][A-Za-z0-9]*)((?:\.[A-Za-z0-9]+)+)\b/g;
  for (let m = re.exec(v); m; m = re.exec(v)) {
    const token = m[0];
    if (CODE_NAMESPACES.has(m[1])) continue;                            // JSON.stringify, Object.keys, …
    if (WIT_ALLOWED_NAMESPACES.some((rx) => rx.test(token))) continue;  // System.* / Microsoft.VSTS.*
    if (PLUGIN_FILE_EXT.test(token)) continue;                          // a Capitalized plugin filename
    if (fileMap) {
      let inSource = false;
      for (const content of fileMap.values()) if (lf(content).includes(token)) { inSource = true; break; }
      if (inSource) continue;                                           // quoted from the plugin's OWN source
    }
    return `names a foreign dotted identifier "${token}" (not System.*/Microsoft.VSTS.*, not a plugin file, not in cited plugin source)`;
  }
  return null;
}

/**
 * §6b — normalize a vendor error MESSAGE before it is even considered. The message is the one place
 * where a vendor can interpolate client identifiers (project name, org, GUIDs), so it is normalized
 * FIRST, then denied (never coerced) if a client value survives, and then DISCLOSED verbatim in the
 * orchestrator's chat summary before the operator's yes/no. If the summary cannot show it, it must
 * not be sent.
 */
export function normalizeVendorMessage(text) {
  const norm = String(text ?? "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(GUIDISH, "<guid>")
    .replace(EMAILISH, "<email>")
    .replace(/https?:\/\/\S+/gi, "<url>")
    .replace(/(?:[A-Za-z]:[\\/]|\/(?:home|Users|users|var|etc|opt|usr|mnt|srv|tmp)\/)[^\s"'`,;)]*/g, "<path>")
    .replace(IPISH, "<ip>")
    .replace(TOKENISH, "<token>")
    .replace(/\s{2,}/g, " ")
    .trim();
  return truncField(norm, FIELD_CAPS.vendorErrorMessage) ?? ""; // B3: truncate-with-marker, not a hard slice
}

const capped = (v, n) => (typeof v === "string" && v.length <= n ? v : null);

// B3 — truncate-with-marker for the HUMAN-READABLE fields (proposedFix, apiShape, codeExcerpt,
// vendorErrorMessage). Cutting an already-boundary-CLEAN string short cannot leak the client (the
// bytes that survive are a prefix of a value that already passed the deny gate), and a truncated
// root-cause note is strictly better than the `null` a one-char-over string used to become. This is
// deliberately NOT used for the pattern-validated IDENTITY fields (vendorErrorCode / vendorErrorName
// / vendorErrorTypeKey / vendorDocUrl) — a truncated identity is WRONG, not merely short, so those
// keep the hard-drop `capped`.
export const TRUNC_MARK = " […]";
export function truncField(v, n) {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  if (s.length <= n) return s;
  const budget = Math.max(1, n - TRUNC_MARK.length);
  let cut = s.slice(0, budget);
  const sp = cut.lastIndexOf(" ");
  if (sp >= budget * 0.6) cut = cut.slice(0, sp); // prefer a word boundary, but not one too early
  return cut.replace(/\s+$/, "") + TRUNC_MARK;
}

/** Normalize line endings so a substring proof is not defeated by CRLF vs LF. */
const lf = (s) => String(s ?? "").replace(/\r\n/g, "\n");

// B4 — whitespace-normalize a string for excerpt matching WHILE keeping a map from each
// normalized-string index back to the ORIGINAL index, so a match found tolerantly can be read back
// VERBATIM from the source. Rules: LF-normalize, drop per-line leading indentation, collapse runs of
// horizontal whitespace to a single space. This is what lets a diagnostician that RE-INDENTED an
// excerpt still prove it against the shipped file (the old `content.includes(excerpt)` failed the
// moment indentation differed — #180 lost its excerpt that way).
function normalizeWithMap(s) {
  const src = lf(s);
  let out = "";
  const map = []; // map[i] = index in `src` of out[i]
  let atLineStart = true;
  let prevWasSpace = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\n") { out += "\n"; map.push(i); atLineStart = true; prevWasSpace = false; continue; }
    if (c === " " || c === "\t") {
      if (atLineStart || prevWasSpace) continue; // drop leading indent + collapse runs
      out += " "; map.push(i); prevWasSpace = true; continue;
    }
    out += c; map.push(i); atLineStart = false; prevWasSpace = false;
  }
  return { norm: out, map };
}

/**
 * Locate `excerpt` inside `content` tolerant of indentation / whitespace reflow, and return the
 * VERBATIM substring of `content` at the matched span (never the model's re-typed copy — default
 * deny: the bytes that travel are the plugin's OWN shipped source). Returns null when the normalized
 * excerpt is not a substring of the normalized content.
 */
export function locateExcerpt(content, excerpt) {
  const c = normalizeWithMap(content);
  const needle = normalizeWithMap(excerpt).norm.trim();
  if (!needle) return null;
  const idx = c.norm.indexOf(needle);
  if (idx < 0) return null;
  const rawStart = c.map[idx];
  const rawEnd = c.map[idx + needle.length - 1];
  if (rawStart == null || rawEnd == null) return null;
  return lf(content).slice(rawStart, rawEnd + 1);
}

// B2 — a stable, Date-free djb2→base36 hash. Used ONLY to disambiguate a finding whose subject maps
// to the catch-all `other`, over its (pluginFile, pluginLine) — both plugin-owned values, never
// client text.
function hash36(str) {
  const s = String(str ?? "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Build the v3 field set for ONE finding. Returns only the fields that PROVED themselves; a denied
 * field is simply absent (`null`), and the finding always survives — dropping a finding because one
 * of its optional strings failed would trade an information gap for an information loss.
 */
export function provenanceFields(o, ctx) {
  const out = {
    pluginFile: null, pluginLine: null, codeExcerpt: null, offendingLiteral: null,
    apiShape: null, proposedFix: null,
    vendorErrorTypeKey: null, vendorErrorName: null, vendorErrorCode: null,
    vendorHttpStatus: null, vendorDocUrl: null, vendorErrorMessage: null,
    // B6 — why a PROVIDED string did not survive, so a maintainer can tell "no fix was proposed"
    // from "a fix was proposed and did not survive the boundary". Entries are {field, reason} with
    // `field` a fixed field name and `reason` ∈ WITHHELD_REASONS — closed constants, never a value,
    // so this can never carry a client byte. A field the diagnostician simply did not supply gets
    // NO entry (its absence is self-evident from the missing line); only provided-but-dropped fields
    // are recorded.
    withheld: [],
  };
  if (!ctx || typeof ctx !== "object") return out; // no proof available ⇒ nothing travels
  const files = ctx.files instanceof Map ? ctx.files : new Map();
  const opts = { denyValues: Array.isArray(ctx.denyValues) ? ctx.denyValues : [], states: Array.isArray(ctx.states) ? ctx.states : [] };
  const provided = (v) => typeof v === "string" && v.trim();
  const withhold = (field, reason) => out.withheld.push({ field, reason });

  // ── the cited plugin location ──
  const file = capped(o.pluginFile, FIELD_CAPS.pluginFile);
  const fileOk = file && PLUGIN_REL_PATH.test(file) && !file.includes("..") && files.has(file)
    && !boundaryDenial(file, { ...opts, kind: "path" });
  if (fileOk) {
    out.pluginFile = file;
    const line = Math.trunc(Number(o.pluginLine));
    if (Number.isFinite(line) && line >= 1 && line <= 1_000_000) out.pluginLine = line;
    const content = lf(files.get(file));
    // B4 provenance: match the excerpt against a WHITESPACE-NORMALIZED projection of the shipped
    // file (so a re-indented / reflowed excerpt still proves), then store the text read back VERBATIM
    // from the file at the matched span — never the model's copy.
    if (provided(o.codeExcerpt)) {
      const verbatim = locateExcerpt(content, o.codeExcerpt);
      if (verbatim && !boundaryDenial(verbatim, { ...opts, kind: "code" })) out.codeExcerpt = truncField(verbatim, FIELD_CAPS.codeExcerpt);
      else withhold("codeExcerpt", verbatim ? "boundary-denied" : "proof-failed");
    }
    if (provided(o.offendingLiteral)) {
      const lit = capped(o.offendingLiteral, FIELD_CAPS.offendingLiteral);
      if (lit && content.includes(lit.trim()) && !boundaryDenial(lit, opts)) out.offendingLiteral = lit.trim();
      else withhold("offendingLiteral", lit && content.includes(lit.trim()) ? "boundary-denied" : lit ? "proof-failed" : "over-cap");
    }
  } else if (provided(o.pluginFile)) {
    withhold("pluginFile", "proof-failed");
    // The excerpt/literal cannot be proven without a proven file — report them as such if supplied.
    if (provided(o.codeExcerpt)) withhold("codeExcerpt", "proof-failed");
    if (provided(o.offendingLiteral)) withhold("offendingLiteral", "proof-failed");
  }

  // ── model-authored, boundary-validated ── (B3: deny on the FULL raw string, THEN truncate)
  if (provided(o.apiShape)) {
    const raw = o.apiShape.trim();
    if (!boundaryDenial(raw, opts)) out.apiShape = truncField(raw, FIELD_CAPS.apiShape);
    else withhold("apiShape", "boundary-denied");
  }
  // proposedFix uses its OWN allowlist gate (B2 gate), NOT boundaryDenial: it must be able to
  // reference plugin paths / file:line / vendor-enum members without `violatesFieldNamespace`
  // denying it wholesale. The deny decision runs on the FULL string (never the truncated one), so a
  // leak shape past the cap is still caught; only then does a clean fix get truncated with a marker.
  if (provided(o.proposedFix)) {
    const raw = o.proposedFix.trim();
    if (!proposedFixDenial(raw, { denyValues: opts.denyValues, files })) out.proposedFix = truncField(raw, FIELD_CAPS.proposedFix);
    else withhold("proposedFix", "boundary-denied");
  }

  // ── §6a vendor error IDENTITY: the vendor's own stable enums, no client interpolation ──
  // These stay HARD-DROP (`capped`): a truncated identity is wrong, not merely short.
  const tk = capped(o.vendorErrorTypeKey, FIELD_CAPS.vendorErrorTypeKey);
  if (tk && /^[A-Za-z][A-Za-z0-9._-]*$/.test(tk) && !boundaryDenial(tk, opts)) out.vendorErrorTypeKey = tk;
  else if (provided(o.vendorErrorTypeKey)) withhold("vendorErrorTypeKey", tk ? "boundary-denied" : "over-cap");
  const tn = capped(o.vendorErrorName, FIELD_CAPS.vendorErrorName);
  if (tn && /^[A-Za-z][A-Za-z0-9._,\- ]*$/.test(tn) && !boundaryDenial(tn, opts)) out.vendorErrorName = tn;
  else if (provided(o.vendorErrorName)) withhold("vendorErrorName", tn ? "boundary-denied" : "over-cap");
  const code = capped(o.vendorErrorCode, FIELD_CAPS.vendorErrorCode);
  if (code && /^[A-Za-z0-9._-]+$/.test(code) && !boundaryDenial(code, opts)) out.vendorErrorCode = code;
  else if (provided(o.vendorErrorCode)) withhold("vendorErrorCode", code ? "boundary-denied" : "over-cap");
  const st = Math.trunc(Number(o.vendorHttpStatus));
  if (Number.isFinite(st) && st >= 100 && st <= 599) out.vendorHttpStatus = st;
  const doc = capped(o.vendorDocUrl, FIELD_CAPS.vendorDocUrl);
  if (doc) {
    let host = "";
    try { host = new URL(doc).host.toLowerCase(); } catch { host = ""; }
    const httpsOk = /^https:\/\//i.test(doc);
    if (httpsOk && VENDOR_DOC_HOSTS.includes(host) && !boundaryDenial(doc, { ...opts, kind: "url" })) out.vendorDocUrl = doc;
    else withhold("vendorDocUrl", "boundary-denied");
  } else if (provided(o.vendorDocUrl)) withhold("vendorDocUrl", "over-cap");

  // ── §6b vendor error MESSAGE: normalize, then deny on any surviving client value (B3: truncate) ──
  if (provided(o.vendorErrorMessage)) {
    const norm = normalizeVendorMessage(o.vendorErrorMessage);
    // The normalizer already replaced URLs/paths/GUIDs/IPs/tokens with placeholders, so what remains
    // must be denied only for a value we can actually name — a client org/project/repo/state.
    if (norm && !boundaryDenial(norm, opts)) out.vendorErrorMessage = norm;
    else withhold("vendorErrorMessage", "boundary-denied");
  }
  return out;
}

// B6 — the closed set of reasons a provided string was withheld from the outbound artifact.
export const WITHHELD_REASONS = ["over-cap", "proof-failed", "boundary-denied", "absent"];
const WITHHELD_REASONS_SET = new Set(WITHHELD_REASONS);

// ─── validateUpstream — the runtime boundary barrier ─────────────────────────
/**
 * Re-check EVERY field against its closed vocabulary; coerce anything out-of-vocabulary to
 * a safe default and clamp numbers. This is what makes a leak impossible even if `reduce`
 * (or a future edit) has a bug: a rogue string in an enum slot is dropped, not forwarded.
 * Pure; returns a fresh struct.
 *
 * `ctx` (v3) supplies the PROOF for the provenance-gated string fields. Omit it and every such
 * field is dropped — unproven is the default (fail closed).
 */
export function validateUpstream(struct, ctx = null) {
  const s = struct && typeof struct === "object" ? struct : {};
  const findingsIn = Array.isArray(s.findings) ? s.findings : [];
  const findings = findingsIn.map((f) => {
    const o = f && typeof f === "object" ? f : {};
    return {
      ...provenanceFields(o, ctx),
      skill: inSet(SKILLS_SET, o.skill, "other"),
      // B1: MAP the subject onto the closed vocabulary. The diagnostician authors `subject` as free
      // text (its contract does not constrain it to the enum), so the old `inSet` membership test
      // collapsed EVERY diagnostician finding to `other` while the telemetry path at line ~433
      // correctly used `subjectEnum`. `subjectEnum` never echoes its input — an unrecognized subject
      // still becomes `other` — so this is containment-neutral.
      subject: subjectEnum(o.subject),
      blockedDeliverable: o.blockedDeliverable === true,
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
    // v3 environment — the RUNTIME, never the client. A maintainer reproducing a defect needs to
    // know which Node and which OS produced it; neither can identify a deployment.
    nodeVersion: validNodeVersion(s.nodeVersion),
    os: inSet(OS_SET, s.os, "other"),
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
    f.skill, f.subject ?? "none", f.blockedDeliverable ? "blocked" : "ok",
    f.verdict, f.severity, outcomeSig(f.outcome), f.signalClass,
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
