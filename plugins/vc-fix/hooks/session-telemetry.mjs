#!/usr/bin/env node
/**
 * Passive session-telemetry collector — Tier 0 (Instrumentation) + Tier 1
 * (Outcome classification) of the vc-fix self-diagnostics subsystem
 * (VCST-5475, rebuilt for the client→vendor feedback loop VCST-5509).
 *
 * Wired via hooks/hooks.json:
 *
 *   SessionStart              → `init`      (write a session header, reset state)
 *   UserPromptSubmit          → `prompt`    (open a COMMAND span for a plugin
 *                                            slash-command; record `/vc-feedback`)
 *   PostToolUse matcher=Skill → `record`    (scan the delta — the scanner opens/
 *                                            closes skill spans as it meets them)
 *   SubagentStop              → `agentstop` (scan the delta so a finished sub-agent's
 *                                            Task result is captured promptly)
 *   Stop                      → `finalize`  (close trailing spans, classify every
 *                                            span, tail-trigger the diagnostician)
 *
 * ─── DESIGN (VCST-5509) ─────────────────────────────────────────────────────
 * CAPTURE is decoupled from ESCALATION.
 *
 *  • CAPTURE (Tier 0) — total + silent. Every operation becomes a SPAN aligned to
 *    the OpenTelemetry GenAI semantic conventions:
 *      { id, parentId, kind: command|skill|agent|tool, name, status: ok|error,
 *        outcome, startTs, endTs, durationMs, retries, tool_name, arg_hash,
 *        signals, struggle[] }
 *    Spans are RECONSTRUCTED from the session transcript (not a per-tool hook):
 *    the hook fires only at boundaries (prompt / skill / subagent-stop / stop),
 *    reads the transcript delta since a persisted cursor, and pairs each tool_use
 *    with its tool_result to build tool/agent spans with real durations. Skill
 *    spans are the interval between Skill invocations; command spans are the
 *    interval from a plugin slash-command prompt to Stop. Raw payloads are NEVER
 *    stored — tool inputs are hashed (arg_hash) and a bounded details ring keeps
 *    only redacted snippets.
 *
 *  • CLASSIFY (Tier 1) — cheap heuristics, NO LLM. On close, each skill/command/
 *    agent span is tagged: success | recovered (self-corrected OR adapted around →
 *    NOT escalated) | degraded (a struggle sub-signal fired) | failed (a blocking,
 *    unrecovered error) | silent_suspect (closed clean but the oracle's expected
 *    output is absent). error ≠ failure; the numeric `>= 6` gate is GONE.
 *    VCST-5582 hardened the classifier against FALSE `failed` verdicts on healthy
 *    runs: recovery now also counts ADAPTATION (a one-off failure the span worked
 *    around while still producing its expected artifact — allErrorsRecovered), bail
 *    detection ignores the plugin's own definition echo (looksLikeBail), the current
 *    auto-mode denial wording is recognised (PERMISSION_DENIED_RE), and an obeyed
 *    guardrail is the non-blocking `policy_block` class rather than a `tool_error`.
 *
 *  • ESCALATE (Tier 2) — tail-based. At Stop, if any span's outcome is
 *    failed/degraded/silent_suspect AND its signature is NEW (deduped across the
 *    session), a `Stop`{decision:"block"} resumes the agent with an instruction to
 *    run `/vc-self-check` SILENTLY (no Yes/No modal) and print ONE info line. Loop
 *    guards: `vc-self-check`'s own spans are dropped, `selfCheckSeen` suppresses
 *    re-trigger, per-signature dedup + `stop_hook_active` prevent re-nag.
 *
 *  • CHECKPOINT vs TERMINAL — `Stop` fires at the END OF EVERY TURN, including a
 *    turn that only handed work to a BACKGROUND SUB-AGENT and is now waiting. That
 *    sub-agent's work lives in a sidechain the scanner skips, so finalizing there
 *    would judge an INCOMPLETE session and (worse) print a "no issues" verdict
 *    mid-task. So finalize checks `ev.background_tasks` (the platform's still-running
 *    bg-tasks/sub-agents signal, supplied on every Stop) — trusted EXCLUSIVELY when
 *    present, with a FRESH-open-agent-op count (≤ STALL_MS on the session clock) as the
 *    fallback ONLY when the field is absent. In that fallback, a crashed/orphaned op
 *    defers until the next main-transcript event advances the session clock past
 *    STALL_MS (then it drains); since current CC always sends `background_tasks`, this
 *    fallback is edge-only. If anything is pending it treats the
 *    Stop as a CHECKPOINT: it records a durable `{verdict:"deferred"}` decision and RETURNS without
 *    draining/closing spans or surfacing anything. The real verdict is deferred to
 *    the TERMINAL Stop, once the sub-agent has returned (its Task result now in the
 *    MAIN transcript). `SubagentStop`→`agentstop` keeps the scan current in between.
 *    An unanswered OPERATOR QUESTION (an `AskUserQuestion` tool_use with no paired
 *    tool_result) defers the same way — `suppressReason:"question-pending"` — so a
 *    `{decision:"block"}` can never resume the agent over the operator's question and
 *    push it out of view (VCST-5582 D).
 *
 *  • DECISION MOMENT — every finalize records a `decision` object on its `finalize`
 *    jsonl record: TERMINAL → { verdict:"clean|flagged", pluginActivity, freshCount,
 *    flaggedTotal, surfaced, suppressReason }; CHECKPOINT → { verdict:"deferred",
 *    pendingSubagents, surfaced:false, suppressReason:"subagent-running" } or
 *    { verdict:"deferred", pendingQuestions, surfaced:false,
 *    suppressReason:"question-pending" }. This is
 *    the DURABLE, deterministic audit of "when did the collector decide, and what did
 *    it decide" — greppable (`"type":"finalize"` / `"decision"`) without printing.
 *    A VISIBLE line costs one extra model turn: a Stop hook on this platform cannot
 *    surface a user-visible line WITHOUT resuming the agent (`systemMessage` is not
 *    rendered — CC issue #50542; plain stdout goes to the debug log only). On a
 *    TERMINAL Stop the model is resumed to print a line whenever there was real plugin
 *    activity: a finding → run `/vc-self-check` + report it; a clean turn → print
 *    "vc-fix self-check: no plugin issues detected" (default ON; silence with
 *    VC_FIX_DIAG_LINE=off). A CHECKPOINT never prints. (The line is scoped to the
 *    PLUGIN's own skills — it never endorses the env or the task verdict; a skill that
 *    correctly reports NOT READY / BAIL is itself healthy.)
 *
 * INVARIANTS (all enforced here):
 *   - CAPTURE IS OPT-IN: init/prompt/record/agentstop/finalize run ONLY when the
 *     output-root project-profile.json EXPLICITLY sets `selfDiagnostics: true` (and
 *     the env kill-switch VC_FIX_DIAG_CAPTURE is not off/0/false/no). Absent profile /
 *     absent field / any non-`true` value ⇒ FULL NO-OP — nothing is read, nothing is
 *     written, `.vc-fix/` is never created. `/project-init` closes the old blind spot
 *     (it writes the profile only at the END of onboarding) by asking the consent
 *     question as its FIRST step and writing `selfDiagnostics: true` IMMEDIATELY on
 *     Yes — so its own remaining run is captured. (The session_start record still
 *     misses that run: SessionStart fired before the flag existed. Accepted — spans +
 *     finalize are captured from the flag write onward.) Tier-3 DELIVERY consent is a
 *     separate `feedback.mode` gate read by deliver.mjs — never here.
 *   - Writes ONLY under <outputRoot>/.vc-fix/diagnostics/ (outputRoot =
 *     VC_FIX_HOME || cwd, matching skills/project-init/lib/paths.mjs). NEVER under
 *     the plugin install dir. `.vc-fix/` is gitignored.
 *   - Age-cap backstop: at SessionStart the collector deletes its OWN diagnostics
 *     artifacts older than VC_FIX_DIAG_MAX_AGE_H hours (default 24; `0` disables),
 *     never the current session's. This complements deliver.mjs's delete-after-
 *     delivery (which only reclaims DELIVERED sessions) so undelivered artifacts
 *     (feedback.mode=off, un-`--purge`d hand-offs, clean runs) can't accumulate.
 *   - Cleanup OFFER (complements the silent age-cap): at SessionStart the collector
 *     counts leftover artifacts from OTHER, now-inactive sessions (mtime older than
 *     INACTIVE_MS, so a live parallel session is never offered up) and, on the next
 *     TERMINAL Stop, surfaces a ONE-shot AskUserQuestion offer to delete them now via
 *     the `purge-inactive` subcommand. Suppressed by VC_FIX_DIAG_CONSENT=off; asked at
 *     most once per session (the `cleanupOffered` guard).
 *   - Never throws, never blocks a tool, never writes a secret (Authorization/
 *     token/password/PAN redacted from every snippet). Always exits 0.
 *   - The auto-diagnosis trigger AND the visible line can both be suppressed with
 *     VC_FIX_DIAG_CONSENT=off (kill switch) — capture still runs; nothing is surfaced.
 *     Independently, VC_FIX_DIAG_LINE=off silences ONLY the clean "no plugin issues
 *     detected" line (default ON on a terminal plugin turn) while leaving the findings
 *     trigger intact. The kill switch overrides both.
 *
 * NOTE: this collector is the canonical `plugins/vc-fix/` copy, and is kept in sync
 * with the `.claude/` mirror for the self-diagnostics subsystem (the hardened secret
 * redaction from `./redact.mjs` ships on BOTH surfaces so neither can leak — PR #143 R2).
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync, readdirSync, statSync, unlinkSync, openSync, readSync, closeSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { redact } from "./redact.mjs";
import { loadExpected, findExpected } from "./expected.mjs";

// ─── output root resolution ────────────────────────────────────────────────
// Canonical definition lives in skills/project-init/lib/paths.mjs `outputRoot()`
// (VC_FIX_HOME || process.cwd()). Prefer importing it; fall back to the inline
// equivalent. Either way the result is the project dir — NEVER the plugin dir.
async function resolveOutputRoot() {
  try {
    const url = new URL("../skills/project-init/lib/paths.mjs", import.meta.url);
    const mod = await import(url.href);
    if (typeof mod.outputRoot === "function") return mod.outputRoot();
  } catch {
    /* fall through */
  }
  return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd();
}

// Plugin install dir — read-only. Only used to read the plugin version for the
// session header; NEVER a write target.
function pluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) return resolve(process.env.CLAUDE_PLUGIN_ROOT);
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

// ─── secret redaction ──────────────────────────────────────────────────────
// The redaction rules are the SINGLE shared source in hooks/redact.mjs (imported as
// `redact` above), used by BOTH this collector and skills/vc-self-check/deliver.mjs so
// the persist path and the public-upstream scrubber can never drift.
function snippet(text, max = 120) {
  const t = redact(String(text ?? "").replace(/\s+/g, " ").trim());
  return t.length > max ? t.slice(0, max - 3) + "…" : t;
}

// Stable, Date-free djb2 → base36 hash. Used for arg_hash and span signatures so
// the same input/finding collides across sessions and clients (vendor dedup).
function hash(str) {
  let h = 5381;
  const s = String(str ?? "");
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// ─── op taxonomy (used by Tier-1 struggle detection) ─────────────────────────
// A "search/read" op gathers information; a "decisive" op changes the world. A
// long run of the former with none of the latter is search_thrash / low_yield.
const SEARCH_RE = /(^|__)(Read|Grep|Glob|LS|NotebookRead|WebFetch|WebSearch|get_file_contents|get_pull_request|get_issue|search_code|search_issues|search_repositories|list_|read_page|get_page_text|snapshot)/i;
// A Bash command whose OUTPUT is a file's CONTENT (a read/dump) rather than fresh script output —
// the Bash analogue of SEARCH_RE for the Read/Grep TOOLS. Such a result may quote plugin SOURCE that
// contains a self-report marker in a COMMENT, so the `self_reported_fallback` scan must skip it. Its
// absence was a real false-positive (VCST-5582): a `cat` / `grep` / `sed -n` / `node -e readFileSync`
// / `Get-Content` of `bug-contract.mjs` (whose JSDoc literally contains "unverified defaults") minted
// a phantom degradation signal, because the guard covered only the read TOOL NAMES, never a Bash span
// that echoes the same source. Anchored to a STATEMENT boundary (start / `;` / `&&` / newline), NOT a
// pipe, so `node <plugin-script> … | grep` (execution whose OUTPUT is filtered) is still scanned.
const READ_CMD_RE = /(?:^|;|&&|&|\n)\s*(?:cat|bat|tac|nl|head|tail|less|more|type|Get-Content|gc|grep|egrep|fgrep|rg|Select-String|sls)\b|\bsed\b[^;&|]*\s-n\b|\b(?:node|deno|bun)\b[^;&|]*(?:-e|--eval)[^;&|]*readFile|\bpython3?\b[^;&|]*-c\b[^;&|]*(?:open\s*\(|\.read\s*\()/i;
const DECISIVE_RE = /(^|__)(Edit|MultiEdit|Write|NotebookEdit|create_pull_request|create_issue|create_or_update_file|push_files|create_branch|add_issue_comment|update_issue|createJiraIssue|editJiraIssue|transitionJiraIssue|addCommentToJiraIssue)/i;
function browserVariant(name) {
  const m = /mcp__playwright-(chrome|firefox|edge|webkit)__/i.exec(String(name || ""));
  if (m) return m[1].toLowerCase();
  if (/mcp__Chrome_DevTools__/i.test(String(name || ""))) return "devtools";
  return null;
}

// ─── expected-output oracle (Tier-1 silent_suspect) ──────────────────────────
// Per plugin skill/command: regexes that, if ANY appears in the span's activity
// (tool names + redacted inputs + assistant text), prove the skill produced its
// expected artifact. A span that closed with no error and no struggle but matched
// NONE of its markers is `silent_suspect` (task likely done wrong, no error). A
// clean BAIL/STOP is an accepted output (never silent_suspect). Keep this table
// in lock-step with knowledge/diagnostics/skill-expectations.md §expected-output.
const BAIL_OK_RE = /(FIX_STATUS:\s*FAILED|\bBAIL(?:_CLASS)?\b|out-of-auto-fix-scope|hand(?:ed)?[ -]off|STOP\s*[—-]\s*hand|no (?:issues|anomal|bug|error)|all clear|nothing to (?:fix|report))/i;
// Developer skills (`/qa-fix`'s reproduce→fix sub-steps). Their expected output is a
// red→green unit test proven and/or a minimal code diff (or a justified BAIL). NOTE: in
// normal operation these run INSIDE the fullstack-backend/fullstack-frontend sub-agents,
// whose transcripts are SIDECHAINS the scanner skips — so the collector never opens a skill
// span for them and this entry is a DEFENSIVE fallback for a standalone main-session
// invocation (e.g. developing/testing the skill directly). Their real outcome rolls up to
// the enclosing `/qa-fix` command span (PR marker) via the sub-agent's Task result.
const DEV_SKILL_OUTPUT = [/\b(?:vitest|tsx --test|dotnet test|xunit|vue-tsc|npm (?:run )?test|red→green|reproduc)/i, /\b(?:Edit|MultiEdit|Write)\b/, /\b(?:pass(?:ed|ing)?|green|failing|red)\b/i, BAIL_OK_RE];
const EXPECTED_OUTPUT = {
  "qa-bug": [/reports[\/\\]bugs[\/\\]/i, /createJiraIssue|create_issue|work item|filed\b/i, BAIL_OK_RE],
  "qa-fix": [/create_pull_request|gh pr create|pull\/\d+|PR #?\d+|opened a? PR/i, BAIL_OK_RE],
  "qa-verify-fix": [/transitionJiraIssue|update_issue|READY FOR TEST|testing|verified|reproduc/i, BAIL_OK_RE],
  "qa-monitoring": [/reports[\/\\]monitoring[\/\\]|signature|dedup|no (?:new )?(?:errors|signatures)/i, BAIL_OK_RE],
  "qa-env-check": [/readiness|env:check|✅|✓|PASS|FAIL|table/i],
  "project-init": [/project-profile\.json|\.mcp\.json|\.env\.|readiness|verify-access/i],
  "vc-docs": [/./], // any activity counts — a lookup skill
  // developer skills — see DEV_SKILL_OUTPUT above (defensive; normally sidechain-invisible)
  "dotnet-unit-test": DEV_SKILL_OUTPUT,
  "dotnet-fix": DEV_SKILL_OUTPUT,
  "angular-admin": DEV_SKILL_OUTPUT,
  "vue-unit-test": DEV_SKILL_OUTPUT,
  "vue-fix": DEV_SKILL_OUTPUT,
  "vc-shell-fix": DEV_SKILL_OUTPUT,
};

// ─── struggle thresholds (documented consts) ─────────────────────────────────
// Conservative on purpose — normal thorough work must NOT trip these. Mirror in
// knowledge/diagnostics/skill-expectations.md §struggle sub-signals.
const T = {
  RETRY_STORM_REPEATS: 3, // same tool+arg_hash appears ≥3×
  RETRY_STORM_ERRORS: 2, //   …with ≥2 errors among them
  REREAD_LOOP: 5, // same read arg_hash ≥5×
  SEARCH_THRASH_RUN: 8, // ≥8 consecutive search/read ops, no decisive op between
  FALLBACK_DISTINCT: 3, // ≥3 distinct browser variants used in one span
  RECURRING_ERROR: 3, // same error signature ≥3×
  STALL_MS: 8 * 60 * 1000, // a single op wall-clock >8min
  // Orphan backstop for the id-MISMATCH deferral branch (a harness that keys an agent bg-task by a
  // distinct agent_id, so `ownedPendingAgents` can't match). MUCH larger than STALL_MS because a real
  // /qa-fix sub-agent (clone → reproduce → build → test) routinely runs 8–30+ min — STALL_MS (8min)
  // would judge a still-running fix agent an orphan and surface a terminal verdict mid-task (code
  // review #4). Only bounds THIS fallback; the id-match path and the field-absent path are unchanged.
  ORPHAN_MS: 45 * 60 * 1000, // an id-mismatched open agent op older than this is treated as a crash
  LOW_YIELD_OPS: 20, // ≥20 tool ops in a span with zero decisive op
  SILENT_MIN_OPS: 2, // a skill/command must have done ≥2 ops before it can be silent_suspect
  // Backstop for the unanswered-question deferral (VCST-5582 D). An AskUserQuestion op still open
  // after this much SESSION-clock time is treated as a lost/missed tool_result rather than a human
  // still deciding, so a scanner miss can never make a session go dark forever. Note the session
  // clock only advances on transcript events, so a genuinely idle "waiting for the operator" pause
  // never ages out — which is exactly the desired behaviour.
  QUESTION_PENDING_MS: 45 * 60 * 1000,
};
// Bound the per-span op history so a long-lived command span can't grow its
// state.json without limit (the struggle detectors only need a recent window;
// span.opCount / span.sawDecisive carry the whole-span aggregates they need).
// Memory stays bounded at OPS_CAP entries; eviction happens from the MIDDLE, not the
// head — the first OPS_HEAD_KEEP ops (a run's setup + FIRST error, where the root cause
// usually is) are never dropped, and the most recent (OPS_CAP - OPS_HEAD_KEEP) tail is
// retained too. A single-command run of 161 tool_calls used to lose its earliest ops to
// a head-drop ring, blinding the struggle detectors to where trouble began (VCST-5702 ITEM 5).
const OPS_CAP = 120;
const OPS_HEAD_KEEP = 40;
const FLAGGED_CAP = 200; // hard backstop on distinct flagged signatures (M2 — see emitSpan)

// ─── signal counts ───────────────────────────────────────────────────────────
// `policy_block` is the one NON-BLOCKING class: a by-design guardrail that fired and the agent
// obeyed (VCST-5582 F4). It is recorded + reported (topSignal) but deliberately excluded from
// `blockingErr` in classify(), so an enforced rule working as intended can never make a healthy
// run look `failed`. Keep it LAST so topSignal still prefers a genuine blocking class.
const SIGNAL_CLASSES = ["tool_error", "permission_denied", "hook_failure", "stop_bail", "policy_block"];
const zeroCounts = () => ({ tool_error: 0, permission_denied: 0, hook_failure: 0, stop_bail: 0, policy_block: 0, tool_calls: 0, agent_calls: 0 });

// ─── OBSERVATION LAYER — capture is FORBIDDEN from judging ────────────────────
// THE ARCHITECTURAL RULE (VCST-5582 H). The capture layer records THAT something happened
// and may NOT decide whether it matters. Before this existed, `emitSpan`'s non-success test
// was simultaneously the RETENTION decision, the ANALYSIS-SCOPE decision and the SURFACING
// decision — `state.flagged[]` is the only thing /vc-self-check reads (its SKILL.md Step 2
// stops on an empty one) — so a signal the deterministic classifier did not recognise at
// span-close time was not downgraded, it CEASED TO EXIST. Demonstrated: a real /project-init
// run printed a WARN in its OWN readiness table (the Azure Bug field contract was never
// scanned — HTTP 400) and self-diagnosed `no plugin issues detected` with
// spanCounts:{success:31}, flagged:[]. Worse, the readiness table that CARRIED the warning is
// what satisfied EXPECTED_OUTPUT["project-init"] and certified the run healthy.
//
// So every anomaly signal — however minor, however likely-benign — becomes a durable
// `type:"obs"` record here, and SEVERITY is assigned LATER by /vc-self-check against
// knowledge/diagnostics/skill-expectations.md §1f. An `obs` deliberately carries NO
// `severity` and NO `verdict` field: there is structurally no way for the collector to
// express importance.
//
// jsonl COMPATIBILITY: every existing reader filters on its own `type` (upstream-reduce's
// `isSpan`, deliver's span/feedback/finalize, /vc-self-check's finalize.flagged), so this is
// purely additive and invisible until a reader opts in.
const OBS_CLASSES = [
  // signals that already existed as span `signals` — now ALSO durable observations, so a
  // signal on a span that ends up `success`/`recovered` is no longer thrown away.
  "tool_error", "permission_denied", "hook_failure", "policy_block", "stop_bail",
  // process-level facts the collector used to be structurally blind to.
  "script_stderr", "script_exit_nonzero", "http_non2xx", "tool_interrupted",
  // a surface of OURS said so, in its own words (readiness rows, self-labelled fallbacks,
  // a generated artifact that came out degraded/empty).
  "self_reported_warn", "self_reported_fail", "self_reported_skip", "self_reported_fallback",
  "degraded_artifact",
  // outcomes the classifier deliberately does NOT escalate — recorded anyway so the vendor
  // still learns that the happy path fails routinely.
  "recovered_error", "struggle",
  // the collector's own health — a broken measurement must never read as a clean run.
  "capture_truncated", "collector_scan_error", "collector_contention", "oracle_marker_miss",
  // deferrals, operator-side signals, and expected background noise.
  "question_unanswered", "harness_noise",
  // fail-safe bucket: an emitter (e.g. the `obs` subcommand) passed a class this build does
  // not know. RECORDED under this name rather than dropped — losing it would be the very
  // bug this layer exists to fix.
  "unclassified",
];
const OBS_CLASSES_SET = new Set(OBS_CLASSES);

// NOISE classes are still RECORDED in full — they are only excluded from the COUNT in the
// visible status line, because they are expected background: the harness's own stderr, a
// guardrail that fired and was obeyed (policy_block, VCST-5582 F4), an expected SKIP row.
// Deciding they are benign is the JUDGE's job — skill-expectations §1f suppresses them AS A
// VERDICT, which is written into the DIAG ("Suppressed as noise: N"). This set only keeps the
// status line honest without making it shout.
const OBS_NOISE_CLASSES = new Set(["harness_noise", "policy_block", "self_reported_skip"]);

// ROUTING set — the ONLY thing that justifies spending a model turn RIGHT NOW. This is DATA
// (kept in lock-step with skill-expectations.md §1e), NOT a severity judgement: membership
// decides TIMING, never retention. Everything outside it is still recorded, still FORBIDS the
// word "clean", still counted in the visible line, and still analysed by any /vc-self-check.
//
// NARROWED TO A HARD SET (item 7). The previous set also carried `self_reported_warn`,
// `http_non2xx` and `collector_contention`, which made routing fire on essentially ANY new
// signal — a run whose command span ended `recovered`, whose deliverable landed, and whose
// findings were all S2/S3 friction still cost the operator a whole extra turn. The bar is now
// "the run could not be trusted to have done its job":
//   • self_reported_fail  — one of OUR surfaces said a required step FAILED
//   • degraded_artifact   — we generated something empty/partial (the VCST-5582 H reference
//                           incident still routes on this, which is the point)
//   • script_exit_nonzero — a PLUGIN-OWNED script exited non-zero (see pluginOwned below)
// Demoted, deliberately: `self_reported_warn` and `http_non2xx` (a WARN or a failed probe still
// forbids the word "clean" via computeVerdict's invariant 2 and is still diagnosed on the next
// /vc-self-check — it just does not interrupt), and `collector_contention` (it already surfaces
// as the `degraded-collector` verdict). Still absent for the original reason: raw
// `tool_error`/`permission_denied`/`hook_failure` — a BLOCKING one routes via the span classifier
// (`failed` → flagged) and a RECOVERED one must not route, or every adaptive run nags again
// (the regression VCST-5582 F1 fixed). Never routed: `recovered_error`, `harness_noise`.
const OBS_ROUTING_CLASSES = new Set([
  "self_reported_fail", "degraded_artifact", "script_exit_nonzero",
]);

// `script_exit_nonzero` routes ONLY for a script the PLUGIN owns. The class fires off an
// `Exit code N` line in any tool result, so a client's own failing `npm run build` — a fact worth
// RECORDING, and recorded either way — would otherwise arm the plugin's diagnostician about code
// that is none of its business. `opSubject` already prefers the plugin script name over the tool
// name when PLUGIN_SCRIPT_RE matches the command; that same match is now persisted on the
// observation as `pluginOwned` so this decision needs no re-derivation at finalize time.
function obsRoutes(o) {
  if (!OBS_ROUTING_CLASSES.has(o?.class)) return false;
  if (o.class === "script_exit_nonzero") return o.pluginOwned === true;
  return true;
}

const OBS_SIGNATURE_CAP = 200; // distinct signatures per session
const OBS_PER_CLASS_CAP = 25; // distinct signatures per class
const OBS_SNIPPET = 160; // evidence snippet chars (redacted)

// Error-taxonomy classifier, LAZILY imported from the PURE, side-effect-free upstream reducer
// so the taxonomy has exactly ONE definition (upstream-reduce.mjs ERROR_CODES/classifyError)
// instead of a second copy here. Dynamic + swallowed: a partial install must degrade to
// "UNKNOWN", never crash the hook. Resolved once in the entry point, before dispatch.
let _classifyError = () => "UNKNOWN";
async function loadErrorClassifier() {
  try {
    const mod = await import(new URL("../skills/vc-self-check/upstream-reduce.mjs", import.meta.url).href);
    if (typeof mod.classifyError === "function") _classifyError = mod.classifyError;
  } catch {
    /* keep the UNKNOWN fallback — a missing reducer must not break capture */
  }
}

// A `subject` is what the observation is ABOUT (`tracker_field_contract`, `github_auth`,
// `storefront_url`). Slugified to [a-z0-9_] and length-capped so a raw path, URL, or free-text
// error can never ride in on this field. Local-only today; when the upstream reducer starts
// consuming observations it must validate against a CLOSED list on its side (§2a).
function obsSubject(s) {
  const t = String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return t || "unknown";
}
function clampNum(n) {
  const v = Number(n);
  return Number.isFinite(v) ? Math.trunc(v) : null;
}
// Derive a stable `subject` for an op. A Bash op's tool NAME ("Bash") says nothing, so prefer
// the PLUGIN SCRIPT it is running — `…/skills/project-init/discover-tracker.mjs` →
// `discover_tracker`. That is what makes an observation attributable to the failing STEP rather
// than to "some Bash call", which is the difference between a usable finding and a shrug.
const PLUGIN_SCRIPT_RE = /[/\\](?:hooks|skills|scripts)[/\\][\w./\\-]*?([\w-]+)\.mjs\b/;
function opSubject(toolName, inputStr) {
  const m = PLUGIN_SCRIPT_RE.exec(String(inputStr || ""));
  return obsSubject(m ? m[1] : toolName);
}
/** Did this op run a script the PLUGIN owns? ROUTING needs this (item 7): a client's own failing
 *  build is recorded like everything else, but it must NOT arm the plugin's diagnostician. A bare
 *  dir-name match is NOT ownership — a client project has its own `scripts/`//`skills/`//`hooks/`
 *  dirs, so `node ./scripts/build.mjs` would wrongly flag as ours. Ownership = the referenced .mjs
 *  resolves UNDER the installed plugin root (the same anchor deliver.mjs uses for its proof files).
 *  The plugin invokes its own scripts by an absolute path (the model expands `$pluginRoot`) or,
 *  occasionally, the literal `$CLAUDE_PLUGIN_ROOT/…` — expand that marker to the real root first.
 *  Derived once, while the input is still in hand. */
function opIsPluginScript(inputStr) {
  const s = String(inputStr || "");
  if (!PLUGIN_SCRIPT_RE.test(s)) return false; // not even a hooks//skills//scripts .mjs reference
  // Unambiguous convention: the plugin invokes its own scripts via `$CLAUDE_PLUGIN_ROOT/{hooks,
  // skills,scripts}/…` (the model may keep the literal marker); a client build never references
  // our root variable.
  if (/\$\{?CLAUDE_PLUGIN_ROOT\}?[/\\](?:hooks|skills|scripts)[/\\]/.test(s)) return true;
  // Otherwise the model expanded `$pluginRoot` to an ABSOLUTE path — owned iff it lies under the
  // installed plugin root. inputStr is JSON.stringify(input), so quotes are `\"` and Windows
  // separators are `\\`; flatten ALL backslashes to `/` and case-fold, then substring-test against
  // the normalized root (a client's relative `./scripts/build.mjs` or its own absolute path never
  // contains the install dir).
  let root;
  try { root = pluginRoot(); } catch { return false; }
  const flat = s.replace(/\\+/g, "/").toLowerCase();
  const rootN = resolve(root).replace(/\\+/g, "/").replace(/\/+$/, "").toLowerCase();
  return flat.includes(rootN + "/");
}
function opSubjectOf(sp) {
  return sp ? (sp.subject || obsSubject(sp.name)) : "unknown";
}
function opPluginOwnedOf(sp) {
  return Boolean(sp && sp.pluginScript);
}

/**
 * Record ONE observation. Aggregated by signature: the FIRST sighting APPENDS a line
 * (durability — a crash mid-session keeps it), later sightings only bump the in-memory count,
 * and cmdFinalize re-reads the appended lines and emits an `obs_rollup` with final counts.
 *
 * The jsonl is the SOURCE OF TRUTH and every write is an APPEND, so two collector processes
 * sharing one outputRoot can duplicate a line but can never LOSE an observation (a
 * read-modify-write on .state.json could). Never throws.
 *
 * @returns {string|null} the signature, or null when the cap dropped it.
 */
function recordObs(jsonlPath, state, o) {
  try {
    if (!state.observations || typeof state.observations !== "object") state.observations = {};
    if (!state.obsClassCounts || typeof state.obsClassCounts !== "object") state.obsClassCounts = {};
    const cls = OBS_CLASSES_SET.has(o?.class) ? o.class : "unclassified";
    const subject = obsSubject(o?.subject);
    const code = typeof o?.code === "string" && o.code ? o.code.slice(0, 32) : "NONE";
    const skill = typeof o?.skill === "string" && o.skill ? normalizeName(o.skill) : null;
    const ts = typeof o?.ts === "string" && o.ts ? o.ts : nowIso();
    const sig = hash(`${cls}|${subject}|${code}|${skill ?? ""}`);
    const seen = state.observations[sig];
    if (seen) {
      seen.count = (seen.count ?? 1) + 1;
      seen.lastTs = ts;
      return sig;
    }
    // Caps. A cap HIT is itself recorded (once, at finalize) as `capture_truncated`, so a
    // truncated capture can never read as a quiet run — silent truncation is the failure mode
    // this whole layer exists to remove.
    if ((state.obsClassCounts[cls] ?? 0) >= OBS_PER_CLASS_CAP || Object.keys(state.observations).length >= OBS_SIGNATURE_CAP) {
      state.obsDropped = (state.obsDropped ?? 0) + 1;
      return null;
    }
    const evidence = {
      snippet: o?.evidence?.snippet != null ? snippet(o.evidence.snippet, OBS_SNIPPET) : null,
      exitCode: clampNum(o?.evidence?.exitCode),
      httpStatus: clampNum(o?.evidence?.httpStatus),
      path: o?.evidence?.path != null ? snippet(o.evidence.path, OBS_SNIPPET) : null,
    };
    const rec = {
      type: "obs",
      sessionId: state.sid,
      ts,
      lastTs: ts,
      spanId: o?.spanId ?? null,
      skill,
      class: cls,
      subject,
      code,
      // Whether the observed script belongs to the PLUGIN. Routing-only (item 7); still NOT a
      // severity or a verdict — the collector remains unable to express importance.
      pluginOwned: o?.pluginOwned === true,
      count: 1,
      source: /^(collector|script|profile-assert)$/.test(String(o?.source || "")) ? o.source : "collector",
      signature: sig,
      evidence,
    };
    // The in-state copy deliberately OMITS `evidence`: the snippet is already durable in the
    // appended jsonl line and nothing reads it back from state, while `.state.json` is rewritten on
    // EVERY hook firing — carrying 200 snippets there would add a ~60 KB write per tool boundary
    // for no benefit. State keeps only what the rollup / routing / dedup actually need.
    state.observations[sig] = { class: cls, subject, code, skill, pluginOwned: rec.pluginOwned, count: 1, ts, lastTs: ts, source: rec.source, spanId: rec.spanId };
    state.obsClassCounts[cls] = (state.obsClassCounts[cls] ?? 0) + 1;
    appendRecord(jsonlPath, rec);
    return sig;
  } catch {
    return null; // capture must NEVER break a hook
  }
}

// Convenience wrapper for the scan loop: attribute an observation to the innermost open span
// (skill/command) so the judge can group by skill without re-deriving the nesting.
function obsFromSpan(jsonlPath, state, span, o) {
  return recordObs(jsonlPath, state, {
    ...o,
    spanId: span?.id ?? null,
    skill: span && (span.kind === "skill" || span.kind === "command") ? span.name : o.skill ?? null,
  });
}

/**
 * Fold `obs` lines appended to OUR OWN jsonl into state.observations. This is what makes a
 * CROSS-PROCESS observation (the `obs` subcommand, invoked by verify-access.mjs /
 * discover-tracker.mjs via Bash, which has its own short-lived state) visible to finalize.
 * Byte-cursored (`state.obsCursor`) exactly like scanTranscript's `scannedBytes`, so a long
 * session does not re-read its whole jsonl on every Stop (that would be O(n²)).
 *
 * Merge rule: an UNKNOWN signature is adopted with the record's own count; a KNOWN one takes
 * max(known, record) so a duplicate append from a racing process cannot inflate the tally.
 * Never throws.
 */
function foldObsFromJsonl(jsonlPath, state) {
  try {
    if (!existsSync(jsonlPath)) return;
    if (!state.observations || typeof state.observations !== "object") state.observations = {};
    if (!state.obsClassCounts || typeof state.obsClassCounts !== "object") state.obsClassCounts = {};
    const size = statSync(jsonlPath).size;
    let cursor = typeof state.obsCursor === "number" && state.obsCursor >= 0 ? state.obsCursor : 0;
    if (size < cursor) cursor = 0; // rotated/replaced → re-read
    if (size === cursor) return;
    let text;
    const fd = openSync(jsonlPath, "r");
    try {
      const len = size - cursor;
      const buf = Buffer.allocUnsafe(len);
      const n = readSync(fd, buf, 0, len, cursor);
      text = buf.toString("utf8", 0, n);
    } finally {
      closeSync(fd);
    }
    const lastNl = text.lastIndexOf("\n");
    if (lastNl < 0) return; // no complete line yet — do not advance
    for (const line of text.slice(0, lastNl).split("\n")) {
      if (!line || !line.includes('"obs"')) continue; // cheap prefilter
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (!r || r.type !== "obs" || typeof r.signature !== "string") continue;
      const cur = state.observations[r.signature];
      if (cur) {
        cur.count = Math.max(cur.count ?? 1, clampNum(r.count) ?? 1);
        if (r.lastTs) cur.lastTs = r.lastTs;
        continue;
      }
      const cls = OBS_CLASSES_SET.has(r.class) ? r.class : "unclassified";
      state.observations[r.signature] = {
        class: cls, subject: r.subject, code: r.code, skill: r.skill ?? null,
        count: clampNum(r.count) ?? 1, ts: r.ts, lastTs: r.lastTs ?? r.ts,
        source: r.source ?? "script", spanId: r.spanId ?? null,
      };
      state.obsClassCounts[cls] = (state.obsClassCounts[cls] ?? 0) + 1;
    }
    state.obsCursor = cursor + Buffer.byteLength(text.slice(0, lastNl + 1), "utf8");
  } catch {
    /* never throw */
  }
}

/**
 * Roll the session's observations up into the shape `finalize` reports and the surfacing
 * policy consumes. `visible` excludes the NOISE classes (still fully recorded); `routing` is
 * the count that justifies spending a turn; `selfReported` drives the hard invariant that a
 * run containing a WARN/FAIL from one of our own surfaces can never be recorded `clean`.
 */
function obsRollup(state) {
  const byClass = {};
  let total = 0;
  let visible = 0;
  let routing = 0;
  let selfReported = 0;
  const obs = state.observations && typeof state.observations === "object" ? state.observations : {};
  for (const o of Object.values(obs)) {
    const n = o.count ?? 1;
    byClass[o.class] = (byClass[o.class] ?? 0) + n;
    total += n;
    if (!OBS_NOISE_CLASSES.has(o.class)) visible += n;
    if (obsRoutes(o)) routing += n;
    if (o.class === "self_reported_warn" || o.class === "self_reported_fail") selfReported += n;
  }
  return { distinct: Object.keys(obs).length, total, visible, routing, selfReported, dropped: state.obsDropped ?? 0, byClass };
}

// A transcript-scan read failure. `state.scanErrors` stays as it was — a resettable flag that
// gates the positive clean line for THIS turn (a broken collector must not assert health it
// never measured) — but it is cleared again on the next successful read, which used to mean the
// blip was forgotten entirely. So also bump the MONOTONE counter and record an observation, so
// "measurement was interrupted at some point" survives to the judge.
function noteScanError(jsonlPath, state, stage) {
  state.scanErrors = (state.scanErrors || 0) + 1;
  state.scanErrorsTotal = (state.scanErrorsTotal || 0) + 1;
  recordObs(jsonlPath, state, { class: "collector_scan_error", subject: stage, code: "NONE" });
}

// Claude Code's CURRENT auto-mode wording is the second half of this alternation — the original
// adjacency patterns ("permission denied", "user denied") miss "Permission for this action was
// denied by the Claude Code auto mode classifier. Reason: Blocked by classifier", so a genuine
// denial was mis-classed `tool_error` and `permission_denied` stayed 0 (VCST-5582 F3).
const PERMISSION_DENIED_RE = /\b(permission denied|denied permission|requested permissions|user (?:denied|declined|rejected)|operation not permitted|not allowed to)\b|permission for this action was denied|blocked by (?:the )?classifier|denied by the [^.\n]{0,60}classifier/i;
const HOOK_FAILURE_RE = /(error TS\d{3,}|\btsc\b[^\n]*error|PostToolUse hook[^\n]*fail|hook[^\n]*error|npm error|command failed with exit code)/i;
// The tool that puts a blocking question to the operator. An open one (tool_use with no paired
// tool_result) means a decision is being asked RIGHT NOW — see the question-pending deferral in
// cmdFinalize (VCST-5582 D). Namespace-tolerant, like the rest of the tool matching here.
const QUESTION_TOOL_RE = /(^|__)AskUserQuestion\b/i;
// A by-design guardrail refusal — hooks/enforce-real-user.mjs blocking a browser evaluate/run-code
// tool so the agent uses real-user MCP tools instead. The agent obeying and adapting is CORRECT
// behaviour, not a plugin defect, so this is classed non-blocking (see SIGNAL_CLASSES above).
const POLICY_BLOCK_RE = /BLOCKED by real-user interaction rule|real-user interaction rule/i;

// ─── self-reported degradation (VCST-5582 H / P1-7) ──────────────────────────
// The plugin's own scripts announce their own degradation IN PROSE and then exit 0:
// `discover-tracker.mjs` prints "…will fall back to the legacy field set, labelled 'unverified
// defaults'", `verify-access.mjs` prints a WARN row saying the same. That text reaches the
// collector inside the tool_result body — where, before this, the ONLY thing that looked at it
// was markExpected(), which matched `/readiness|verify-access/` and read the very table
// carrying the warning as PROOF OF SUCCESS. So scan explicitly for degradation language.
const FALLBACK_MARKER_RE = /unverified defaults?|falling back to|falls back to|fall back to the legacy|best[- ]effort|could not be derived|not scanned|unverified\b|degrade[sd]? to/i;
// Benign stderr the HARNESS writes (not the plugin): a shell-wrapper note, a cwd reset, npm
// chatter. Classified into its OWN class (`harness_noise`) rather than filtered away — deciding
// something is noise is the JUDGE's job (skill-expectations §1f suppresses it as a VERDICT,
// which is still written into the DIAG). Only stderr whose EVERY non-empty line is noise is
// classed benign; one unrecognised line makes the whole thing a `script_stderr`.
const HARNESS_NOISE_LINE_RE = /^(?:shell cwd was reset|npm warn|npm notice|debugger attached|waiting for the debugger|\(node:\d+\))/i;
function classifyStderr(text) {
  const lines = String(text ?? "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  return lines.every((l) => HARNESS_NOISE_LINE_RE.test(l)) ? "harness_noise" : "script_stderr";
}
// A Bash result the harness marked `is_error` opens with `Exit code N` (confirmed in real
// transcripts). That number is the ONLY place a non-zero exit is visible, so parse it out
// instead of leaving it inside a 120-char snippet. NOTE the residual gap this cannot close: a
// piped invocation (`node script.mjs | head -20`) reports the PIPE's exit 0, so the script's own
// non-zero exit never reaches the transcript at all — that is why plugin scripts must not be
// piped (skill-expectations §1e note), and why the `obs` subcommand exists.
const EXIT_CODE_RE = /^\s*Exit code (\d{1,3})\b/;
// A SELF-REPORTED non-zero exit the AGENT echoed into stdout — `echo exit=$?` → `exit=1`,
// `echo "exit code: $?"`, `rc=$?; echo exit_code=$rc`. This is the blind spot EXIT_CODE_RE cannot
// reach: `cmd > file 2>&1; echo exit=$?` makes the PIPELINE exit 0 (echo succeeds), so the harness
// marks is_error false, adds NO `Exit code N` line, and stderr went to a file (not tur.stderr) — a
// real script failure recorded as success (the MSYS get-file finding produced ZERO telemetry this
// exact way). Requires `=`/`:` (so the harness "Exit code N" line, space-separated, never matches it
// → no double-record) and a non-zero code (`[1-9]…` — `exit=0` is success and never fires).
const SELF_EXIT_RE = /\bexit(?:[ _-]?(?:code|status))?\s*[=:]\s*([1-9]\d{0,2})\b/i;

// ─── bail detection (VCST-5582 F2) ───────────────────────────────────────────
// A bail is something the AGENT DECLARED ("STOP — handing off", "FIX_STATUS: FAILED"). The old
// single regex was matched against EVERY text block, including the slash-command / skill DEFINITION
// echoed into the transcript on load — and `commands/qa-bug.md` contains the literal "hand off", so
// the plugin tripped its own bail detector and scored `stop_bail: 1` on a fully successful run.
// Three guards now apply, in order: (1) assistant provenance, (2) not a definition echo,
// (3) the weak "hand off" marker needs an explicit bail context.
const BAIL_STRONG_RE = /(FIX_STATUS:\s*FAILED|\bBAIL(?:_CLASS)?\b|out-of-auto-fix-scope|STOP\s*[—-]\s*hand)/;
const BAIL_WEAK_RE = /hand(?:ed)?[ -]off/i;
const BAIL_CONTEXT_RE = /\b(STOP|BAIL|cannot|can't|unable|out[- ]of[- ]scope|escalat\w*|abort\w*|human review|not auto-fixable)\b/i;
// Wrappers the harness puts around injected (non-agent) content, and the head of a command/skill
// definition body: a slash-command title heading (`# /qa-bug — …`) or YAML frontmatter carrying
// command/skill frontmatter keys.
const DEFINITION_WRAPPER_RE = /<\/?(?:command-(?:name|message|args)|system-reminder)>/i;
const DEFINITION_HEAD_RE = /^\s*(?:#{1,4}\s*\/[\w:.-]+|---\s*\r?\n(?:[^\n]*\r?\n){0,12}?\s*(?:description|argument-hint|allowed-tools|disable-model-invocation)\s*:)/i;
function isDefinitionEcho(text) {
  const t = String(text ?? "");
  return DEFINITION_WRAPPER_RE.test(t) || DEFINITION_HEAD_RE.test(t);
}
// `assistantProse` = the text came from the agent (or a harness/test shape that carries no
// provenance at all — kept scannable so a bail is never missed on an unknown transcript shape).
function looksLikeBail(text, assistantProse) {
  if (!assistantProse) return false;
  const t = String(text ?? "");
  if (!t) return false;
  if (isDefinitionEcho(t)) return false;
  if (BAIL_STRONG_RE.test(t)) return true;
  return BAIL_WEAK_RE.test(t) && BAIL_CONTEXT_RE.test(t);
}

// Plugin slash-commands we open a COMMAND span for (acceptance criterion: a
// command session is fully traced, not just skill-attributed). `/vc-feedback` is
// deliberately ABSENT — cmdPrompt records a feedback record and returns before
// COMMAND_RE, so it never opens a command span.
const PLUGIN_COMMANDS = ["project-init", "qa-bug", "qa-fix", "qa-verify-fix", "qa-monitoring", "qa-env-check", "vc-self-check", "vc-docs"];
// The self-diagnostics LOOP GUARD name-match. The diagnostician now runs in a SUBAGENT
// (`self-check-diagnostician`, PR #172 item 1), so its agent span + any observation attributed to
// it must be dropped from analysis exactly like the `vc-self-check` skill span — otherwise the next
// run diagnoses its own prior invocation. Every loop-guard test uses THIS regex, not a bare literal.
const SELF_CHECK_NAME_RE = /vc-self-check|self-check-diagnostician/i;
function isSelfCheckName(s) {
  return SELF_CHECK_NAME_RE.test(String(s ?? ""));
}
// Accept an optional `<plugin>:` namespace prefix — a slash command invoked from an
// installed plugin arrives as `/vc-fix:qa-env-check`, not the bare `/qa-env-check`. Without
// the `(?:[\w.-]+:)?` group the namespaced form never matched, so a whole plugin-command
// session was recorded as `no-plugin-activity` (the command span never opened → no clean
// line AND no findings escalation). Capture group 1 stays the bare command name. Mirrors
// normalizeName()'s namespace strip.
const COMMAND_RE = new RegExp(`^\\s*/(?:[\\w.-]+:)?(${PLUGIN_COMMANDS.join("|")})\\b`, "i");

// Normalize a skill/command name for the oracle lookup: strip a leading "/" and a
// leading "<plugin>:" namespace (a Skill invoked as `vc-fix:qa-bug` must still map
// to the `qa-bug` EXPECTED_OUTPUT entry, else it silently escapes silent_suspect).
function normalizeName(n) {
  return String(n ?? "unknown").replace(/^\//, "").replace(/^[\w.-]+:/, "");
}

function textOf(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (typeof c === "string" ? c : c && typeof c === "object" ? c.text ?? c.content ?? "" : ""))
      .map((c) => (typeof c === "string" ? c : textOf(c)))
      .join(" ");
  }
  if (content && typeof content === "object") return content.text ?? "";
  return "";
}

// ─── span helpers ──────────────────────────────────────────────────────────
function newSpan(state, kind, name, startTs, parentId) {
  return {
    id: `${state.sid}-${state.spanSeq++}`,
    parentId: parentId ?? null,
    kind,
    name,
    startTs: startTs || nowIso(),
    signals: zeroCounts(),
    details: [], // bounded ring of redacted snippets (evidence)
    ops: [], // bounded ring of recent ops for struggle detection (see OPS_CAP)
    opCount: 0, // whole-span op total (survives the ops-ring cap; used by low_yield)
    sawDecisive: false, // did any decisive op run in this span (whole-span; low_yield)
    sawExpected: false,
    // The STRICT twin of sawExpected: the expected-output marker is backed by an operation that
    // SUCCEEDED (see markExpected). Only this may unlock the adaptation clause in
    // allErrorsRecovered() — an attempt that failed must never read as "the artifact was produced".
    sawProduced: false,
    // A blocking failure recorded with NO paired op (an untied hook_failure — the top-level
    // PostToolUse `tsc` echo — or an untied tool error). It can't be resolved by allErrorsRecovered
    // (which only sees op-keyed errors), so it must force `failed` even when a DIFFERENT, op-keyed
    // error in the same span did self-correct. Without this, a span with both a recovered retry and
    // an untied hook_failure was wrongly tagged `recovered` (VCST review finding).
    sawUntiedFailure: false,
    retries: 0,
    lastTs: startTs || nowIso(),
  };
}
function pushDetail(span, cls, text, extra) {
  span.signals[cls] = (span.signals[cls] ?? 0) + 1;
  if (span.details.length < 25) span.details.push({ cls, snippet: snippet(text), ...extra });
  // TRUNCATION IS NEVER SILENT (VCST-5582 H). Past the 25th detail the snippet is dropped while
  // `signals[cls]` keeps counting — and `recurring_error` reads `span.details`, so an error that
  // keeps returning past this cap is countable but UNDETECTABLE. Count the drops here (no state in
  // scope) and let emitSpan turn them into a `capture_truncated` observation.
  else span.detailsDropped = (span.detailsDropped ?? 0) + 1;
}
// Record a child op on its parent span for struggle detection. Keeps a bounded
// RING (last OPS_CAP) plus whole-span aggregates (opCount, sawDecisive) so a
// long-lived command span's state.json stays small and low_yield stays correct.
function pushOp(span, op) {
  if (!span) return;
  span.opCount = (span.opCount ?? 0) + 1;
  if (DECISIVE_RE.test(op.tool)) span.sawDecisive = true;
  span.ops.push(op);
  // Head-preserving ring (VCST-5702 ITEM 5): keep the first OPS_HEAD_KEEP ops AND the most recent
  // tail, evicting from the MIDDLE. The old shift() dropped the earliest ops, so on a long span (a
  // 161-op single command, a /project-init run) every detector that walks `ops[]` — retry_storm,
  // reread_loop, recurring_error — saw only the tail and missed where trouble started. Memory is
  // still bounded at OPS_CAP. (Trade-off: a middle gap can separate two otherwise-adjacent ops;
  // the detectors count occurrences within a window, not strict whole-array adjacency, so this is
  // safe.) Count the evictions so emitSpan can say so out loud.
  if (span.ops.length > OPS_CAP) { span.ops.splice(OPS_HEAD_KEEP, 1); span.opsDropped = (span.opsDropped ?? 0) + 1; }
}
// Session-level buffers for ops/details that had NO parent span (parentId:null) — see freshState.
// A synthesized command span (Fix 2) adopts these so classify()/allErrorsRecovered treat the
// blind-spot run exactly like a real span (code review #1).
function recordOrphanOp(state, op) {
  if (!state.orphanOps) state.orphanOps = [];
  state.orphanOps.push(op);
  // Head-preserving ring, same rationale as pushOp (VCST-5702 ITEM 5): evict from the middle so the
  // earliest orphan ops of a long parentId:null run survive into the synthesized command span.
  if (state.orphanOps.length > OPS_CAP) state.orphanOps.splice(OPS_HEAD_KEEP, 1);
}
function recordOrphanDetail(state, cls, text) {
  if (!state.orphanDetails) state.orphanDetails = [];
  if (state.orphanDetails.length < 25) state.orphanDetails.push({ cls, snippet: snippet(text) });
}
function expectedMarkerHit(spanName, blob) {
  const markers = EXPECTED_OUTPUT[spanName];
  if (!markers) return true; // no oracle entry ⇒ any activity counts (never silent_suspect)
  return markers.some((re) => re.test(blob));
}
// TWO strengths of the same oracle, deliberately (VCST-5582 F1):
//   • `sawExpected` — LENIENT. A marker appeared ANYWHERE in the span's activity, including in the
//     INPUT of an op that then failed (`Bash{gh pr create}` matches /qa-fix's PR marker even when
//     the command is denied). This is the silent_suspect / search_thrash / low_yield gate and its
//     behaviour is unchanged: over-crediting there only avoids a false flag.
//   • `sawProduced` — STRICT. The marker is backed by an operation that actually SUCCEEDED. This is
//     the ONLY flag the adaptation clause of allErrorsRecovered() may trust: crediting an attempt
//     would turn "tried to open a PR and was denied" into `recovered`, i.e. hide a real failure.
// `produced` is true only for a marker seen in a SUCCESSFUL tool_result; a marker carried by an op's
// INPUT is promoted separately, once that op's result comes back non-error (see the tool_result
// branch — a `Write reports/bugs/…` whose own result body is just "File written").
function markExpected(span, blob, produced = false) {
  if (!span) return;
  if (span.sawExpected && (span.sawProduced || !produced)) return; // nothing further to learn
  if (!expectedMarkerHit(span.name, blob)) return;
  span.sawExpected = true;
  if (produced) span.sawProduced = true;
}

// ─── Tier 1: struggle detection + outcome classification ─────────────────────
function detectStruggle(span) {
  const struggle = [];
  const ops = span.ops || [];
  if (!ops.length) return struggle;

  // retry_storm — same tool+arg repeated with recurring errors.
  const byKey = new Map();
  for (const o of ops) {
    const k = `${o.tool}|${o.arg_hash}`;
    const e = byKey.get(k) || { n: 0, err: 0 };
    e.n++;
    if (o.status === "error") e.err++;
    byKey.set(k, e);
  }
  let maxRepeat = 0;
  for (const e of byKey.values()) {
    maxRepeat = Math.max(maxRepeat, e.n);
    if (e.n >= T.RETRY_STORM_REPEATS && e.err >= T.RETRY_STORM_ERRORS) struggle.push("retry_storm");
  }
  span.retries = Math.max(span.retries || 0, Math.max(0, maxRepeat - 1));

  // reread_loop — same READ arg repeated a lot (even without errors).
  const readCounts = new Map();
  for (const o of ops) {
    if (SEARCH_RE.test(o.tool)) readCounts.set(o.arg_hash, (readCounts.get(o.arg_hash) || 0) + 1);
  }
  for (const n of readCounts.values()) if (n >= T.REREAD_LOOP) { struggle.push("reread_loop"); break; }

  // search_thrash — persistence WITHOUT progress: a long run of search/read ops AND
  // the span produced NO progress at all. "Progress" is a decisive op (Write/Edit/PR/
  // create → sawDecisive) OR the skill's own expected output (sawExpected) — a read-only
  // skill like /qa-env-check legitimately does many reads and produces a readiness table
  // (its expected output) without any decisive op, so gating on sawDecisive alone falsely
  // degraded it. Progress-based, not volume-based (research §5).
  if (!span.sawDecisive && !span.sawExpected) {
    let run = 0;
    for (const o of ops) {
      if (DECISIVE_RE.test(o.tool)) run = 0;
      else if (SEARCH_RE.test(o.tool)) { run++; if (run >= T.SEARCH_THRASH_RUN) { struggle.push("search_thrash"); break; } }
    }
  }

  // fallback_loop — bouncing across browser variants within one span.
  const variants = new Set();
  for (const o of ops) { const v = browserVariant(o.tool); if (v) variants.add(v); }
  if (variants.size >= T.FALLBACK_DISTINCT) struggle.push("fallback_loop");

  // recurring_error — same error signature keeps returning.
  const errSig = new Map();
  for (const d of span.details) {
    if (d.cls === "tool_error" || d.cls === "hook_failure") {
      const k = (d.snippet || "").slice(0, 40);
      errSig.set(k, (errSig.get(k) || 0) + 1);
    }
  }
  for (const n of errSig.values()) if (n >= T.RECURRING_ERROR) { struggle.push("recurring_error"); break; }

  // stall — a single op ran abnormally long. EXCLUDE operator-facing question tools
  // (AskUserQuestion): their "duration" is human think-time waiting for an answer, not a hang —
  // a ~20-min consent answer once ran 1,240,749 ms and minted a false stall (VCST-5582).
  // QUESTION_TOOL_RE is the same matcher the consent/dedup path uses (see its definition above).
  if (ops.some((o) => !QUESTION_TOOL_RE.test(String(o.tool || "")) && (o.durationMs || 0) > T.STALL_MS)) struggle.push("stall");

  // low_yield — many tool ops (whole-span count) with NO progress: neither a decisive op
  // nor the skill's expected output (sawExpected). A read-only skill that produced its
  // readiness/report output is not low-yield even with zero decisive op (research §5).
  if ((span.opCount ?? ops.length) >= T.LOW_YIELD_OPS && !span.sawDecisive && !span.sawExpected) struggle.push("low_yield");

  return [...new Set(struggle)];
}

// Self-correction test — keyed on the SPECIFIC invocation (tool + arg_hash), not
// the tool NAME: `Read(A)` failing then `Read(B)` succeeding is NOT a recovery of
// A (different target). An errored key resolves EITHER of two ways:
//
//   (a) LITERAL RETRY — the LAST op of that exact key is a success (the same thing
//       was retried and eventually worked).
//   (b) ADAPTATION (VCST-5582 F1) — the failed invocation was NEVER repeated AND the
//       span PROVABLY produced its own expected artifact (`sawProduced` — the strict
//       flag: a marker backed by a SUCCEEDED operation, never by a failed attempt). Keying
//       recovery on (a) ALONE was the defect: correct agent behaviour after an error
//       is to ADAPT (fix the quoting, pick another selector, use another tool), which
//       mints a NEW arg_hash — so the old key's last status stays `error` forever and
//       EVERY adaptive run was classified `failed`. Requiring `sawExpected` keeps this
//       honest: the skill must have produced its real artifact, not merely moved on.
//       Requiring `attempts === 1` keeps it conservative: a key hammered repeatedly and
//       then abandoned is still unresolved (and trips retry_storm/recurring_error).
//
// `policy_block` ops are skipped entirely — a by-design guardrail refusal the agent
// obeyed is not an error awaiting recovery (F4).
function allErrorsRecovered(span) {
  const lastStatus = new Map();
  const attempts = new Map();
  const everErrored = new Set();
  for (const o of span.ops || []) {
    if (o.cls === "policy_block") continue;
    const k = `${o.tool}|${o.arg_hash}`;
    lastStatus.set(k, o.status);
    attempts.set(k, (attempts.get(k) ?? 0) + 1);
    if (o.status === "error") everErrored.add(k);
  }
  if (!everErrored.size) return false;
  for (const k of everErrored) {
    if (lastStatus.get(k) === "ok") continue; // (a) retried to success
    if (span.sawProduced && attempts.get(k) === 1) continue; // (b) adapted around, artifact PROVEN produced
    return false;
  }
  return true;
}

function classify(span) {
  const s = span.signals;
  // `policy_block` is deliberately NOT here (VCST-5582 F4): a guardrail that fired and was obeyed
  // is correct behaviour, so it is recorded but never blocks. Only genuine failures block.
  const blockingErr = s.tool_error > 0 || s.permission_denied > 0 || s.hook_failure > 0;
  const struggle = detectStruggle(span);
  const recovered = blockingErr && allErrorsRecovered(span) && !span.sawUntiedFailure;
  // A blocking error is a `failed` outcome UNLESS the specific failed invocation was
  // self-corrected (retried to success). permission_denied / hook_failure that were
  // recovered are S3 `recovered`, matching the oracle §1a / §2 rows — they only hard-
  // block when they never resolved. NOTE: allErrorsRecovered is keyed on `span.ops`
  // (tool+arg_hash pairs from tool_use/tool_result), so it can only observe an error
  // resolving when that error was TIED to a tool_use_id. A blocking failure recorded
  // with NO paired op — an untied hook_failure (the top-level PostToolUse `tsc` echo,
  // see the `attributeSignal("hook_failure", …)` call) or an untied tool error — sets
  // `span.sawUntiedFailure`, which vetoes `recovered` here. This closes the co-occurrence
  // gap: a span with BOTH an untied hook_failure AND a self-corrected op-keyed error must
  // still be `failed` (the untied failure was never observed resolving), not `recovered`.
  // Intentional fail-toward-escalation.
  let outcome;
  if (recovered) {
    outcome = "recovered"; // error occurred but self-corrected → do NOT escalate
  } else if (blockingErr) {
    outcome = "failed";
  } else if (struggle.length) {
    outcome = "degraded";
  } else if ((span.kind === "skill" || span.kind === "command") && !span.sawExpected && (span.opCount ?? 0) >= T.SILENT_MIN_OPS) {
    // closed clean but produced no expected artifact — a likely silent failure. Requires a
    // MINIMUM of real work (≥ SILENT_MIN_OPS): a command span that opened and closed with
    // ~0 ops (e.g. `/qa-fix` → the agent asks a clarifying question → stop) is a trivial /
    // deferred turn, not a "task done wrong", so it must not be flagged (research §5:
    // require substance; conservative thresholds beat over-flagging).
    outcome = "silent_suspect";
  } else {
    outcome = "success";
  }
  return { outcome, struggle };
}

function topSignal(span) {
  if (span.struggle && span.struggle.length) return span.struggle[0];
  for (const c of SIGNAL_CLASSES) if (span.signals[c] > 0) return c;
  return span.sawExpected ? "ok" : "no_output";
}

function spanRecord(state, span, endTs) {
  const { outcome, struggle } = span.outcome ? { outcome: span.outcome, struggle: span.struggle } : classify(span);
  span.outcome = outcome;
  span.struggle = struggle;
  return {
    type: "span",
    sessionId: state.sid,
    id: span.id,
    parentId: span.parentId,
    kind: span.kind,
    name: span.name,
    status: span.signals.tool_error || span.signals.permission_denied || span.signals.hook_failure ? "error" : "ok",
    outcome,
    struggle,
    startTs: span.startTs,
    endTs,
    durationMs: Date.parse(endTs) - Date.parse(span.startTs) || null,
    retries: span.retries || 0,
    tool_name: span.kind === "tool" || span.kind === "agent" ? span.name : null,
    arg_hash: span.arg_hash ?? null,
    signals: span.signals,
    details: span.details.slice(0, 25),
  };
}

// Append the span record + roll its outcome into the session counters / flags.
// Only SKILL and COMMAND spans are escalation units: a tool/agent failure rolls
// up to its parent skill (the Task/tool_result signals attribute to the parent),
// which is where the oracle diagnosis and dedup happen. So a recovered parent is
// never dragged back to `failed` by one of its own transient child errors.
function emitSpan(jsonlPath, state, span, endTs) {
  const rec = spanRecord(state, span, endTs || span.lastTs || nowIso());
  appendRecord(jsonlPath, rec);
  state.spanCounts[rec.outcome] = (state.spanCounts[rec.outcome] ?? 0) + 1;
  const escalationUnit = span.kind === "skill" || span.kind === "command";
  // A skill/command span closing (other than vc-self-check's own) means this session had
  // real plugin activity — the finalize `decision` record uses this to distinguish
  // "the hook judged a plugin run" from "a plain dev turn with no plugin skill".
  if (escalationUnit && !isSelfCheckName(span.name)) state.sawPluginSpan = true;
  const ownSpan = isSelfCheckName(span.name);
  // ─── observations: what the outcome test above THROWS AWAY (VCST-5582 H) ────────────
  // `flagged[]` only ever sees non-success/non-recovered escalation units, so two real signals
  // used to vanish here:
  //   • a STRUGGLE on a span that classify() resolved to `recovered` — the recovery branch is
  //     tested FIRST, so e.g. a retry_storm that eventually succeeded left no trace anywhere.
  //   • the fact that the happy path failed at all on a `recovered` span (the oracle calls this
  //     S3 "note only", which the old pipeline implemented as "delete").
  // Both are now durable observations. They are deliberately OUTSIDE OBS_ROUTING_CLASSES, so
  // recording them costs no extra surfacing — the judge decides if they matter.
  if (escalationUnit && !ownSpan) {
    // Ring/cap evictions on this span (see pushOp / pushDetail). A truncated capture must not read
    // as a quiet one — the detectors that walk `ops[]`/`details[]` were partially blind here.
    if (span.opsDropped > 0 || span.detailsDropped > 0) {
      obsFromSpan(jsonlPath, state, span, {
        class: "capture_truncated", subject: "span_ring", code: "NONE",
        evidence: { snippet: `${span.opsDropped ?? 0} op(s) evicted from the middle past OPS_CAP=${OPS_CAP} (first ${OPS_HEAD_KEEP} + recent tail kept), ${span.detailsDropped ?? 0} detail(s) past the 25-detail cap — struggle detection saw the head + tail, not the middle` },
      });
    }
    for (const s of rec.struggle || []) {
      obsFromSpan(jsonlPath, state, span, { class: "struggle", subject: s, code: "NONE", evidence: { snippet: `${rec.outcome} span, retries=${rec.retries || 0}` } });
    }
    if (rec.outcome === "recovered") {
      const errSnippet = (span.details || []).find((d) => d.cls === "tool_error" || d.cls === "permission_denied" || d.cls === "hook_failure")?.snippet || "";
      obsFromSpan(jsonlPath, state, span, { class: "recovered_error", subject: topSignal(span), code: _classifyError(errSnippet), evidence: { snippet: errSnippet } });
    }
  }
  if (escalationUnit && rec.outcome !== "success" && rec.outcome !== "recovered" && !ownSpan) {
    const sig = hash(`${span.kind}|${span.name}|${rec.outcome}|${topSignal(span)}`);
    // Dedup by signature (+ hard cap): `flagged` is re-serialized WHOLE into every terminal `finalize`
    // record, and Stop fires each turn, so an uncapped per-occurrence push grew `<sid>.jsonl` ~O(F×T)
    // over a long session (PR #143 R2 M2). The tail-trigger + diagnostician already dedup by signature,
    // so only DISTINCT signatures carry information — keep the first occurrence of each.
    //
    // But a RECURRENCE is not a duplicate (VCST-5582 H, P1-9): keeping only the first occurrence made
    // 20 identical failures indistinguishable from 1, and `seenSignatures` then silenced the signature
    // for the rest of the session however often (or however much worse) it came back. So the entry now
    // carries an `occurrences` COUNT — a number, not a severity — which the surfacing policy uses to
    // re-surface a growing signature and the judge uses for §1f occurrence weighting.
    const prior = state.flagged.find((f) => f.signature === sig);
    if (prior) {
      prior.occurrences = (prior.occurrences ?? 1) + 1;
      prior.lastId = span.id;
    } else if (state.flagged.length < FLAGGED_CAP) {
      state.flagged.push({ id: span.id, kind: span.kind, name: span.name, outcome: rec.outcome, struggle: rec.struggle, signature: sig, occurrences: 1 });
    } else {
      // The cap refused a DISTINCT finding — record that fact rather than dropping it silently.
      recordObs(jsonlPath, state, { class: "capture_truncated", subject: "flagged_cap", code: "NONE", evidence: { snippet: `FLAGGED_CAP=${FLAGGED_CAP} reached` } });
    }
  }
}

// Close the open skill span and roll its expected-output result UP to the enclosing
// command span: a command that delegates its work to a same-named skill (or whose
// skill produced the expected artifact) must NOT itself be judged silent_suspect.
function closeSkill(jsonlPath, state, endTs) {
  const sk = state.currentSkill;
  if (!sk) return;
  if (sk.sawExpected && state.currentCommand) state.currentCommand.sawExpected = true;
  if (sk.sawProduced && state.currentCommand) state.currentCommand.sawProduced = true;
  emitSpan(jsonlPath, state, sk, endTs);
  state.currentSkill = null;
}

// ─── transcript scan — the single reconstruction engine ──────────────────────
/**
 * Scan the transcript delta [processedLines, end) in chronological order, opening
 * and closing spans as it meets tool_use / tool_result / Skill / Task events, and
 * append a `span` record for each span that CLOSES. Advances state.processedLines.
 * Never throws; a malformed line is skipped.
 */
function scanTranscript(jsonlPath, transcriptPath, state) {
  if (!transcriptPath || !existsSync(transcriptPath)) return;
  let size;
  // A read error here is NOT "clean" — record it so cmdFinalize withholds the positive
  // "no plugin issues detected" line (a broken collector must not assert health it never
  // measured — PR #143 R2 OBS1). Best-effort; still never throws.
  try { size = statSync(transcriptPath).size; } catch { noteScanError(jsonlPath, state, "stat"); return; }

  // Incremental read (S3, PR #143 R2): read ONLY the bytes appended since the last scan, so a
  // long session no longer re-reads + re-splits the WHOLE transcript on every skill-boundary /
  // Stop (that was ~O(n²) over the session). `state.scannedBytes` is kept at a LINE BOUNDARY
  // (right after the last processed '\n'), so a partial trailing line — and any torn multibyte
  // char at EOF — is never consumed; it is re-read on the next scan.
  let lines;
  if (typeof state.scannedBytes !== "number" || size < state.scannedBytes) {
    // Full read ONCE: a fresh session (processedLines 0), a pre-S3 `.state.json` picked up
    // mid-upgrade (honor its processedLines cursor), or a shorter-than-offset file (rotated /
    // truncated / replaced → re-scan from scratch). Then switch to the byte offset.
    let content;
    try { content = readFileSync(transcriptPath, "utf8"); } catch { noteScanError(jsonlPath, state, "full-read"); return; }
    const parts = content.split("\n");
    const allComplete = parts.slice(0, Math.max(0, parts.length - 1)); // complete lines only
    if (size < state.scannedBytes) state.processedLines = 0; // rotated → old cursor is meaningless
    lines = allComplete.slice(Math.min(state.processedLines || 0, allComplete.length));
    state.processedLines = allComplete.length;
    const lastNl = content.lastIndexOf("\n");
    state.scannedBytes = lastNl >= 0 ? Buffer.byteLength(content.slice(0, lastNl + 1), "utf8") : 0;
    state.scanErrors = 0; // this pass READ successfully → the collector is healthy (clear any prior transient blip)
  } else if (size === state.scannedBytes) {
    return; // nothing new appended — leave scanErrors as-is (an unrecovered error stays flagged)
  } else {
    // Fast path: read ONLY the delta [scannedBytes, size) via a positioned read.
    let text;
    try {
      const fd = openSync(transcriptPath, "r");
      try {
        const len = size - state.scannedBytes;
        const buf = Buffer.allocUnsafe(len);
        const n = readSync(fd, buf, 0, len, state.scannedBytes);
        text = buf.toString("utf8", 0, n);
      } finally { closeSync(fd); }
    } catch { noteScanError(jsonlPath, state, "delta-read"); return; }
    // A transient read error does NOT advance scannedBytes, so the very next scan re-reads those bytes;
    // reaching here means that re-read SUCCEEDED. Clear the flag so a single recovered blip no longer
    // degrades the whole session's clean line (code review #4). A read that fails at finalize time stays
    // flagged (the catch above); a still-consumed "nothing new" pass above deliberately leaves it as-is.
    state.scanErrors = 0;
    const lastNl = text.lastIndexOf("\n");
    if (lastNl < 0) return; // bytes appended but no complete line yet — do not advance
    lines = text.slice(0, lastNl).split("\n"); // all NEW complete lines
    state.scannedBytes += Buffer.byteLength(text.slice(0, lastNl + 1), "utf8"); // past the '\n'
    state.processedLines += lines.length;
  }

  const innerParent = () => state.currentSkill || state.currentCommand || null;
  const attributeSignal = (cls, text, extra) => {
    const p = innerParent();
    // EVERY signal becomes an observation, whatever happens to it below. This is the fix for the
    // no-span case in particular: with no command/skill open, an untied blocking failure used to
    // land only in `untiedSignals`/`orphanDetails` and was dropped outright unless the Fix-2
    // synthesis adopted it (which needs a `complete` marker). A real session on disk shows
    // `totals:{hook_failure:4}` with `flagged:[]` and verdict `clean` — captured, then discarded.
    recordObs(jsonlPath, state, {
      class: cls, subject: cls === "hook_failure" ? "posttooluse_hook" : "untied_signal",
      code: _classifyError(String(text ?? "")), spanId: p?.id ?? null,
      skill: p && (p.kind === "skill" || p.kind === "command") ? p.name : null,
      evidence: { snippet: text },
    });
    if (p) {
      pushDetail(p, cls, text, extra);
      // An UNTIED blocking failure (no paired op) — mark the span so classify() can't call it
      // `recovered` on the strength of some OTHER op-keyed error that self-corrected.
      if (cls === "tool_error" || cls === "permission_denied" || cls === "hook_failure") p.sawUntiedFailure = true;
    } else if (cls === "tool_error" || cls === "permission_denied" || cls === "hook_failure") {
      // No open span to attach to — remember at session level so a synthesized command span (Fix 2)
      // inherits the untied-failure veto (the same accepted asymmetry a real span gets), and keep
      // the redacted snippet for errorCode fidelity. Count it per-class too: an untied failure has no
      // orphan OP for the synth to derive a signal from, so without this the pure-untied case (e.g. a
      // tsc PostToolUse echo in a blind-spot run) would under-flag — `sawUntiedFailure` only vetoes
      // `recovered`, it can't raise blockingErr (Q&S NA-1).
      state.untiedFailure = true;
      state.untiedSignals ??= zeroCounts();
      state.untiedSignals[cls] = (state.untiedSignals[cls] || 0) + 1;
      recordOrphanDetail(state, cls, text);
    }
    state.totals[cls] = (state.totals[cls] ?? 0) + 1;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue;
    }
    // ─── sub-agent (sidechain) work: AGGREGATE-only capture (VCST-5582 H / P1-11) ─────────
    // A sidechain line is a sub-agent's own transcript. It must NOT become spans/ops here: those
    // belong to a different unit of work, and rolling them into the parent skill would corrupt
    // every struggle threshold and every recovery test. But dropping them outright meant that ALL
    // /qa-fix developer-skill behaviour was invisible — only the Task RETURN rolled up — which the
    // oracle already admits (`DEV_SKILL_OUTPUT` is documented as a defensive fallback because these
    // "run inside sub-agents whose transcripts are SIDECHAINS the scanner skips").
    //
    // So: record ERROR results only, as OBSERVATIONS, aggregated by (class, code) under the
    // `sidechain` subject. Bounded by construction — a handful of signatures however long the
    // sub-agent ran — and outside the routing set, so a sub-agent's transient error costs no
    // surfacing. The judge finally gets to see that a delegated fix run was fighting something.
    if (ev.isSidechain === true) {
      state.sidechainOps = (state.sidechainOps ?? 0) + 1;
      // Local extraction — the shared `items` below is deliberately out of scope here, so a
      // sidechain line can never fall through into the span/op machinery by accident.
      const sideContent = (ev.message ?? ev)?.content ?? ev?.content;
      const sideItems = Array.isArray(sideContent) ? sideContent : sideContent != null ? [sideContent] : [];
      for (const item of sideItems) {
        if (!item || typeof item !== "object" || item.type !== "tool_result" || item.is_error !== true) continue;
        const raw = textOf(item.content);
        const b = raw.length > 4000 ? raw.slice(0, 4000) : raw;
        const c = POLICY_BLOCK_RE.test(b) ? "policy_block" : PERMISSION_DENIED_RE.test(b) ? "permission_denied" : HOOK_FAILURE_RE.test(b) ? "hook_failure" : "tool_error";
        recordObs(jsonlPath, state, { class: c, subject: "sidechain", code: _classifyError(b), evidence: { snippet: b } });
      }
      continue;
    }
    const ts = typeof ev.timestamp === "string" ? ev.timestamp : nowIso();
    state.lastScanTs = ts; // newest event ts seen — the session's own clock (chronological scan)
    const msg = ev.message ?? ev;
    const content = msg?.content ?? ev?.content;
    const items = Array.isArray(content) ? content : content != null ? [content] : [];
    const parent = innerParent();
    if (parent) parent.lastTs = ts;
    // Provenance of any narrative `text` block in this event — only the AGENT can declare a bail
    // (VCST-5582 F2). A user paste, a `<command-name>` expansion, or an injected definition echo is
    // NOT the agent bailing. A shape carrying NEITHER `type` nor `role` has unknown provenance and
    // stays scannable, so a bail is never missed on an unfamiliar transcript shape.
    const provenance = String(ev.type ?? msg?.role ?? "").toLowerCase();
    const assistantProse = provenance === "" || provenance === "assistant";

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const type = item.type;

      if (type === "tool_use") {
        const name = String(item.name || "unknown");
        // Cap BEFORE redacting: a Write/Edit tool_use carries the full file body (tens–hundreds of KB),
        // and running the ~20 redaction regexes over all of it on every op is pure waste on the Stop
        // hot path — only slice(0,4000) is hashed and slice(0,500) feeds markExpected, and TEST_ENV=
        // appears early. 8000 comfortably covers all three windows (perf review, PR #143).
        const rawInput = JSON.stringify(item.input ?? {});
        const inputStr = redact(rawInput.length > 8000 ? rawInput.slice(0, 8000) : rawInput);
        const arg_hash = hash(inputStr.slice(0, 4000));
        // An op's INPUT can carry the expected-output marker (`Write reports/bugs/…`) — that is a
        // lenient sawExpected hit now, and is promoted to the strict sawProduced only once this op's
        // result comes back non-error (see the tool_result branch). `markerInput` carries that link.
        const inputBlob = `${name} ${inputStr.slice(0, 500)}`;
        const markerInput = parent ? expectedMarkerHit(parent.name, inputBlob) : false;
        if (parent) markExpected(parent, inputBlob);
        // Enrich testEnv (S3): TEST_ENV is often passed INLINE per command (`TEST_ENV=… node …`)
        // and never exported to the hook's own env, so session_start.testEnv is null. Recover it
        // from the FIRST tool arg that carries it. Cheap, best-effort — first match wins.
        if (!state.testEnv) {
          const em = /\bTEST_ENV=([A-Za-z0-9_.-]+)/.exec(inputStr);
          if (em) state.testEnv = em[1];
        }

        if (name === "Skill") {
          if (state.currentSkill) closeSkill(jsonlPath, state, ts);
          const skillName = normalizeName(item.input?.skill ?? item.input?.command ?? item.input?.name);
          state.currentSkill = newSpan(state, "skill", skillName, ts, state.currentCommand?.id ?? null);
          state.anySkillSeen = true;
          if (isSelfCheckName(skillName)) state.selfCheckSeen = true;
        } else if (name === "Task" || name === "Agent") {
          const agentType = String(item.input?.subagent_type ?? item.input?.agentType ?? "unknown");
          // Spawning the self-check diagnostician IS running self-check (item 1: diagnosis moved into
          // a subagent). Mark the session seen so the tail-trigger never re-fires on it.
          if (isSelfCheckName(agentType)) state.selfCheckSeen = true;
          if (parent) parent.signals.agent_calls++; // the op is pushed once, when the agent span CLOSES
          state.totals.agent_calls++;
          const sp = newSpan(state, "agent", agentType, ts, innerParent()?.id ?? null);
          sp.arg_hash = arg_hash;
          sp.markerInput = markerInput;
          // Observation subject, derived ONCE here while the input is still in hand (the closed
          // span keeps only its name/arg_hash) — see opSubject.
          sp.subject = opSubject(sp.name, inputStr);
          sp.pluginScript = opIsPluginScript(inputStr);
          state.openOps.set(item.id, sp);
        } else {
          if (parent) parent.signals.tool_calls++;
          state.totals.tool_calls++;
          const sp = newSpan(state, "tool", name, ts, innerParent()?.id ?? null);
          sp.arg_hash = arg_hash;
          sp.markerInput = markerInput;
          // Observation subject, derived ONCE here while the input is still in hand (the closed
          // span keeps only its name/arg_hash) — see opSubject.
          sp.subject = opSubject(sp.name, inputStr);
          sp.pluginScript = opIsPluginScript(inputStr);
          // Is this a Bash read/dump of a file? If so its RESULT is file content the agent looked at,
          // not fresh script output — so the self_reported_fallback scan must skip it (a boolean only;
          // the raw command is never stored). Checked against the actual command string, not the
          // redacted JSON, so the statement-boundary anchors in READ_CMD_RE are meaningful.
          sp.echoesFile = name === "Bash" && typeof item.input?.command === "string" ? READ_CMD_RE.test(item.input.command) : false;
          state.openOps.set(item.id, sp);
        }
      } else if (type === "tool_result") {
        const id = item.tool_use_id;
        // Cap BEFORE redact: a Read/grep/build-log tool_result can carry a multi-KB/MB body, and
        // running the ~20 redaction regexes over all of it on every op is pure waste on the Stop hot
        // path (error text is classified from the 120-char snippet anyway). Mirrors the 8000-char cap
        // on the tool_use side (code review #4). `body` feeds the EXPENSIVE redact/snippet/classify path.
        const bodyRaw = textOf(item.content);
        const body = bodyRaw.length > 8000 ? bodyRaw.slice(0, 8000) : bodyRaw;
        // BUT the expected-output scan (markExpected) must NOT use the perf cap: for delivery via a
        // sub-agent, the Task RETURN body is the ONLY expected-output signal, and its "opened PR
        // pull/42" confirmation can sit at the END of a long report — capping to the head would miss
        // it → false `silent_suspect` → auto-file a SUCCESS in feedback.mode=auto (code review round 5).
        // markExpected is cheap (a few regex .test()s), so scan a head+tail window instead.
        const expectedScan = bodyRaw.length > 10000 ? bodyRaw.slice(0, 8000) + "\n" + bodyRaw.slice(-2000) : bodyRaw;
        // A signal is recorded ONLY from a genuine FAILURE result (`is_error === true`).
        // A SUCCESSFUL tool whose body merely CONTAINS error-like text — grepping a
        // build log, reading source that says "npm error"/"permission denied" — is NOT a
        // failure (A-F1/D1: no false `failed` from tool output or narration). An actual
        // error is sub-typed policy_block / permission_denied / hook_failure / tool_error.
        // policy_block is tested FIRST (most specific) and is the only NON-BLOCKING class — a
        // by-design guardrail the agent obeyed and adapted around (VCST-5582 F4).
        const cls = item.is_error === true
          ? (POLICY_BLOCK_RE.test(body) ? "policy_block" : PERMISSION_DENIED_RE.test(body) ? "permission_denied" : HOOK_FAILURE_RE.test(body) ? "hook_failure" : "tool_error")
          : null;
        const sp = id ? state.openOps.get(id) : null;
        const p = innerParent();
        // ─── the structured result sidecar the collector used to ignore (P1-6) ─────────────
        // A transcript `user` event carries `toolUseResult` alongside message.content:
        // `{ stdout, stderr, interrupted, isImage, noOutputExpected }` for Bash. The scan only
        // ever read message.content[] and the top-level string content, so THE ENTIRE stderr
        // channel was invisible — which is exactly how `discover-tracker.mjs`'s HTTP-400 warning
        // (stderr + exit 0) produced a "clean" self-diagnosis. Also the only place an INTERRUPT
        // is visible. Cap before redact, like every other body here.
        const tur = ev.toolUseResult;
        // C2 — bind each observation to the EVENT's own transcript timestamp, not `nowIso()`. Before
        // this, every transcript-derived obs was stamped at scan time, so a post-purge REBUILD
        // recorded them all within ~40 ms of the rebuild instant instead of at their real times.
        // (`skill` is still the currently-open span's name; on a rebuild the command span lived only
        // in the purged state, so it can be null — the C1 tombstone dedups skill-independently and the
        // diagnostician re-reads the transcript, so this residual mis-attribution does not re-nag or
        // mislead. A full transcript-position skill rebind is a scoped follow-up.)
        const attrib = { spanId: (p || sp)?.id ?? null, skill: p && (p.kind === "skill" || p.kind === "command") ? p.name : null, ts };
        // Hoisted: the degradation-marker scan below must cover stderr TOO. `discover-tracker.mjs`
        // prints "…will fall back to the legacy field set, labelled 'unverified defaults'" to
        // STDERR, so scanning only the stdout body would miss the single most important instance.
        const seRaw = tur && typeof tur === "object" && typeof tur.stderr === "string" ? tur.stderr : "";
        if (tur && typeof tur === "object") {
          const seCls = classifyStderr(seRaw);
          if (seCls) {
            recordObs(jsonlPath, state, {
              ...attrib, class: seCls, subject: opSubjectOf(sp),
              code: seCls === "harness_noise" ? "NONE" : _classifyError(seRaw.slice(0, 2000)),
              evidence: { snippet: seRaw.slice(0, 2000) },
            });
          }
          if (tur.interrupted === true) {
            recordObs(jsonlPath, state, { ...attrib, class: "tool_interrupted", subject: opSubjectOf(sp), code: "NONE" });
          }
        }
        // Exit code, when the harness surfaced one. Recorded as its OWN class so a script that
        // exits non-zero is a first-class fact and not merely "some tool errored".
        const exitMatch = EXIT_CODE_RE.exec(body);
        const exitCode = exitMatch ? Number(exitMatch[1]) : null;
        if (exitCode) {
          recordObs(jsonlPath, state, {
            ...attrib, class: "script_exit_nonzero", subject: opSubjectOf(sp),
            // ROUTING needs to know whose script this was (item 7) — recorded either way.
            pluginOwned: opPluginOwnedOf(sp),
            code: _classifyError(body), evidence: { exitCode, snippet: body },
          });
        }
        // Self-reported non-zero exit the AGENT echoed to stdout (SELF_EXIT_RE) — the blind spot the
        // harness Exit-code line cannot reach (`cmd > file 2>&1; echo exit=$?` → pipeline exit 0,
        // is_error false, no harness line). Independent of is_error, like the degradation scan below.
        // Only when the harness did NOT already surface an Exit code line (no double-record), and
        // scoped to skip a Read/dump op whose body is FILE CONTENT the agent merely read (an echoed
        // number in a source file must not manufacture a failure) — same scope as `degradedText`.
        if (exitCode === null && !(SEARCH_RE.test(sp?.name || "") || sp?.echoesFile)) {
          const selfExitText = seRaw ? `${body}\n${seRaw.slice(0, 4000)}` : body;
          const selfExit = SELF_EXIT_RE.exec(selfExitText);
          if (selfExit) {
            recordObs(jsonlPath, state, {
              ...attrib, class: "script_exit_nonzero", subject: opSubjectOf(sp),
              pluginOwned: opPluginOwnedOf(sp),
              code: _classifyError(body), evidence: { exitCode: Number(selfExit[1]), snippet: body },
            });
          }
        }
        // Self-labelled degradation anywhere in the output (P1-7) — a WARN table, an
        // "unverified defaults" note. Independent of is_error: the whole point is that these
        // scripts SUCCEED while telling us they degraded.
        // SCOPE: skip a search/read op. Its result body is FILE CONTENT the agent looked at, not
        // output OUR code emitted — and this repo's own sources contain the literal marker text
        // ("unverified defaults" lives in discover-tracker.mjs, verify-access.mjs and the oracle),
        // so scanning a Read result would manufacture a `self_reported_fallback` every time someone
        // opens those files. Capture stays total for signals we can attribute; it does not invent
        // signals out of data the agent merely read.
        const degradedText = (SEARCH_RE.test(sp?.name || "") || sp?.echoesFile) ? "" : seRaw ? `${body}\n${seRaw.slice(0, 4000)}` : body;
        if (degradedText && FALLBACK_MARKER_RE.test(degradedText)) {
          const at = degradedText.search(FALLBACK_MARKER_RE);
          recordObs(jsonlPath, state, {
            ...attrib, class: "self_reported_fallback", subject: opSubjectOf(sp),
            code: "NONE", evidence: { snippet: degradedText.slice(at > 40 ? at - 40 : 0) },
          });
        }
        // Every genuine error signal becomes an observation too — INCLUDING one on a span that
        // later classifies `success`/`recovered`, which `flagged[]` structurally cannot carry.
        if (cls) {
          recordObs(jsonlPath, state, {
            ...attrib, class: cls, subject: opSubjectOf(sp),
            code: _classifyError(body), evidence: { snippet: body, exitCode },
          });
        }
        // Any result (success OR failure) can carry an expected-output marker — a
        // create_pull_request response or a sub-agent Task return "opened PR pull/42".
        // This is what keeps a command/skill that delivers via a sub-agent (whose
        // internal ops are in a skipped sidechain) from being false `silent_suspect`.
        // `produced` = this result SUCCEEDED, so a marker inside it is proof of a real artifact
        // (a sub-agent Task return "opened PR pull/42"), not of a mere attempt.
        if (p) markExpected(p, expectedScan, cls === null);
        if (sp) {
          state.openOps.delete(id);
          // Promote an INPUT-carried marker now that its op completed successfully — the Write
          // case, whose own result body ("File written") carries no marker of its own.
          if (sp.markerInput && !cls && p && p.id === sp.parentId) { p.sawExpected = true; p.sawProduced = true; }
          if (cls) pushDetail(sp, cls, body, { toolUseId: id });
          emitSpan(jsonlPath, state, sp, ts);
          // Roll the op onto the parent ONLY if it is still the span that opened it
          // (A-F7: a late result must not be misattributed to a different skill that
          // has opened since). The tool span itself always carries its own signal.
          const durationMs = Date.parse(ts) - Date.parse(sp.startTs) || 0;
          if (p && p.id === sp.parentId) {
            // `cls` rides along so allErrorsRecovered() can tell a NON-BLOCKING policy_block apart
            // from a real error (VCST-5582 F4) — mirrors the orphan-op record below.
            pushOp(p, { tool: sp.name, arg_hash: sp.arg_hash, status: cls ? "error" : "ok", cls: cls || null, ts, durationMs });
            if (cls) pushDetail(p, cls, body);
          } else if (sp.parentId == null) {
            // Parentless op (no command/skill span open — the Fix 2 blind spot). Buffer it so a
            // synthesized command span at Stop can adopt it and apply the SAME self-correction test
            // (allErrorsRecovered) a real span's children get — so a probe that errored then retried
            // to success is `recovered`, not a spurious `failed` from the cumulative totals (#1).
            recordOrphanOp(state, { tool: sp.name, arg_hash: sp.arg_hash, status: cls ? "error" : "ok", cls: cls || null, ts, durationMs });
            if (cls) recordOrphanDetail(state, cls, body);
          }
          if (cls) state.totals[cls] = (state.totals[cls] ?? 0) + 1; // ?? — a pre-policy_block state file has no such key
        } else if (cls) {
          attributeSignal(cls, body, { toolUseId: id });
        }
      } else if (type === "text") {
        // Narrative text (assistant/user) is scanned ONLY for expected-output markers
        // and BAIL. Do NOT derive permission_denied/hook_failure from prose — a user
        // who writes "login returns permission denied" is describing a bug, not failing
        // (A-F1). Real failures come through tool_result above.
        const b = item.text ?? "";
        if (parent) markExpected(parent, b);
        // looksLikeBail applies all three F2 guards (assistant provenance, not a definition echo,
        // weak marker needs a bail context) — see its definition.
        if (looksLikeBail(b, assistantProse)) { if (parent) pushDetail(parent, "stop_bail", b); state.totals.stop_bail = (state.totals.stop_bail ?? 0) + 1; }
      }
    }

    // Top-level string content = a system / hook echo (e.g. the `tsc` PostToolUse
    // output), not user prose — keep hook_failure detection here (the tsc-on-every-Edit
    // cross-cutting pattern), but not permission_denied (denials arrive as tool_results).
    // NOT tied to a tool_use_id, so attributeSignal() below has no op to attach this to —
    // classify()'s recovery check can therefore never mark it `recovered` (see the NOTE
    // there). A transient hook note that's clean on the very next Edit still forces
    // `failed` for this span; that's a known, accepted asymmetry vs the tool_result path.
    //
    // GUARD (code review #4): a GENUINE user message also arrives as top-level string content
    // (`ev.type === "user"`, no `isMeta`). A user pasting a build log into a /qa-fix question
    // ("command failed with exit code 1") is DESCRIBING a problem, not failing (A-F1) — treating
    // it as an untied hook_failure would force the span `failed`, trip the tail-trigger, and in
    // feedback.mode=auto auto-file an upstream issue for a non-failure. So only INJECTED/meta
    // content (an actual hook echo — no `type`, or `type:"user"`+`isMeta:true`) may raise it here.
    const isGenuineUserProse = ev.type === "user" && ev.isMeta !== true;
    if (typeof content === "string" && !isGenuineUserProse) {
      if (HOOK_FAILURE_RE.test(content)) attributeSignal("hook_failure", content);
    }
  }
}

// ─── file / state helpers ────────────────────────────────────────────────────
function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}
function sessionId(ev) {
  return String(ev.session_id || (ev.transcript_path ? basename(ev.transcript_path).replace(/\.jsonl$/i, "") : "") || "unknown-session");
}
function nowIso() {
  return new Date().toISOString();
}
async function paths(ev) {
  const root = await resolveOutputRoot();
  const dir = join(root, ".vc-fix", "diagnostics");
  const sid = sessionId(ev);
  return { root, dir, sid, jsonl: join(dir, `${sid}.jsonl`), state: join(dir, `${sid}.state.json`) };
}
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

// ─── C1 — the surfaced-signature TOMBSTONE (survives delivery purge) ─────────────────────
// On a SUCCESSFUL delivery, deliver.mjs purges `<sid>.jsonl` + `<sid>.state.json` — and
// `seenSignatures`/`obsSurfaced` lived in that state. The next Stop then REBUILDS the session from
// the transcript (which still holds every tool call) with `seenSignatures: []`, re-derives the SAME
// signatures, and RE-SURFACES an already-delivered defect (VCST-5582 C1 — the `script_exit_nonzero:
// ado` re-nag). So the surfaced signatures are persisted OUTSIDE the per-session file, in
// `<sid>.surfaced.json`, which purge deliberately does NOT delete (only the 24h age-cap reclaims it).
// finalize seeds its dedup sets from it, so a rebuilt session still suppresses what it already
// surfaced. This is a `Set`-union tombstone, so it is safe to re-write and to seed unconditionally.
function surfacedPath(dir, sid) { return join(dir, `${sid}.surfaced.json`); }
// The SKILL-INDEPENDENT identity of an observation: class|subject|code. The full obs signature also
// folds in the SKILL, but a post-purge rebuild re-attributes the same observation to a DIFFERENT (or
// null) skill — because the open command span that owned it lived only in the purged state, not the
// transcript (VCST-5582 C2). So the full signature is unstable across a rebuild, and the tombstone
// must dedup on this stable projection instead. Never carries client text (the subject is already
// slugified by obsSubject, the code is a closed taxonomy).
function obsStableKey(o) { return `${o?.class ?? ""}|${o?.subject ?? ""}|${o?.code ?? "NONE"}`; }
function loadSurfaced(dir, sid) {
  try {
    const p = surfacedPath(dir, sid);
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8"));
    return {
      signatures: Array.isArray(j.signatures) ? j.signatures : [],
      // { stableKey -> the occurrence count it was surfaced/delivered AT }, so a GROWN recurrence
      // still re-qualifies (mirrors `obsSurfacedCount` / a flagged span's `surfacedAt`).
      deliveredObs: (j.deliveredObs && typeof j.deliveredObs === "object" && !Array.isArray(j.deliveredObs)) ? j.deliveredObs : {},
    };
  } catch { return null; }
}
function writeSurfaced(dir, sid, { signatures = [], deliveredObs = {} } = {}) {
  try {
    // Union with whatever the tombstone already holds — a session can surface across several turns.
    // For a stable key seen more than once, keep the LATEST (highest) count it was surfaced at.
    const prev = loadSurfaced(dir, sid) || { signatures: [], deliveredObs: {} };
    const mergedObs = { ...prev.deliveredObs };
    for (const [k, c] of Object.entries(deliveredObs)) mergedObs[k] = Math.max(mergedObs[k] ?? 0, c);
    writeFileSync(
      surfacedPath(dir, sid),
      JSON.stringify({
        sid, ts: nowIso(),
        signatures: [...new Set([...prev.signatures, ...signatures])],
        deliveredObs: mergedObs,
      }),
      "utf8",
    );
  } catch { /* best-effort — the tombstone is an optimization, never a correctness dependency */ }
}
// Seed the SPAN dedup set from the tombstone (so a re-derivable flagged span is not re-surfaced), and
// RETURN the tombstone so the caller can consult `deliveredObs` for the skill-independent obs check.
function seedSurfacedFromTombstone(dir, sid, state) {
  const tomb = loadSurfaced(dir, sid);
  if (!tomb) return null;
  if (!Array.isArray(state.seenSignatures)) state.seenSignatures = [];
  for (const s of tomb.signatures) if (!state.seenSignatures.includes(s)) state.seenSignatures.push(s);
  return tomb;
}
function appendRecord(jsonlPath, record) {
  appendFileSync(jsonlPath, JSON.stringify(record) + "\n", "utf8");
}

// Age-cap floor (VC_FIX_DIAG_MAX_AGE_H, default 24h; 0/invalid-negative ⇒ default,
// exactly 0 ⇒ disabled). The ephemeral lifecycle (deliver.mjs delete-after-delivery)
// only reclaims DELIVERED sessions; artifacts that are never delivered (feedback.mode
// =off, a PR/fork-PR hand-off the operator never `--purge`s, a clean no-finding run)
// would otherwise accumulate forever. This is the backstop, NOT a replacement: it runs
// once per session at SessionStart and deletes only OUR OWN artifact shapes that are
// older than the cutoff — never the current session's files, never a still-fresh
// (in-flight) session's. Best-effort; never throws.
function diagMaxAgeHours() {
  const raw = (process.env.VC_FIX_DIAG_MAX_AGE_H ?? "").trim();
  if (raw === "") return 24; // unset / whitespace-only ⇒ default
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 24; // garbage ⇒ safe default
  return n; // 0 ⇒ disabled
}
// ─── evidence protection: never delete an UNJUDGED finding (VCST-5582 H / P1-10) ─────────────
// The ephemeral lifecycle is log → analyze → contribute → delete, and both deletion paths used to
// skip the "analyze" precondition entirely: the 24h age-cap reclaims silently (observed firing:
// `prunedOldArtifacts:3` in a real session_start), and the cleanup offer's option 1
// (`purge-inactive --all`) removes even the CURRENT session's jsonl. So a session that recorded a
// real finding and was never diagnosed could be destroyed before anyone looked at it — losing the
// only copy, since nothing was contributed upstream either.
//
// The missing precondition: a session is "judged" once a `DIAG-<sid>-*.md` exists for it (or it had
// nothing worth judging). This reads the session's OWN jsonl and answers: does it hold a REAL,
// un-diagnosed finding? Retained until diagnosed; `--force` overrides.
//
// SCOPE MATTERS. "Holds ≥1 observation" would be the wrong bar: with capture-everything, an
// ordinary session routinely records `harness_noise` or a `recovered_error`, so protecting on any
// observation would pin every artifact forever and quietly disable the 24h age-cap — trading one
// failure mode for another. So the bar is the same one that justifies spending a turn: a flagged
// span, an `attention` verdict, or an observation in OBS_ROUTING_CLASSES. A noise-only `observed`
// session is NOT protected. Cheap (our own file) and only consulted on a deletion path. Never
// throws; on ANY doubt it answers "protected" — keeping a stale file is trivially recoverable,
// deleting the only copy of a finding is not.
function isUnjudgedFinding(dir, sid) {
  try {
    if (!sid) return false;
    const jsonl = join(dir, `${sid}.jsonl`);
    if (!existsSync(jsonl)) return false; // no telemetry (a bare state leftover) — nothing to protect
    // Already diagnosed? DIAG-*.md files are gone (PR #172 item 2), so the "analyze happened" signal
    // is now in the session's own state.json: the diagnostician ran (`selfCheckSeen`) or `deliver`
    // recorded per-finding decisions (`selfCheckFindings`). Either means a human/agent looked.
    const statePath = join(dir, `${sid}.state.json`);
    if (existsSync(statePath)) {
      try {
        const st = JSON.parse(readFileSync(statePath, "utf8"));
        if (st && (st.selfCheckSeen === true || (Array.isArray(st.selfCheckFindings) && st.selfCheckFindings.length))) return false;
      } catch {
        /* unreadable state ⇒ fall through to the jsonl scan (fail toward protecting) */
      }
    }
    const text = readFileSync(jsonl, "utf8");
    // Cheap prefilter before any JSON parsing — the overwhelmingly common case is a clean session.
    if (!text.includes('"verdict":"attention"') && !text.includes('"verdict":"flagged"') && !text.includes('"flagged":[{') && !text.includes('"type":"obs"')) return false;
    for (const line of text.split("\n")) {
      if (!line) continue;
      let r;
      try { r = JSON.parse(line); } catch { continue; }
      if (r?.type === "obs") { if (obsRoutes(r)) return true; continue; }
      if (r?.type !== "finalize") continue;
      if (Array.isArray(r.flagged) && r.flagged.length) return true;
      // "flagged" is the pre-VCST-5582-H spelling of what is now "attention" — an old artifact
      // mid-upgrade must still be protected.
      const v = r.decision?.verdict;
      if (v === "attention" || v === "flagged") return true;
    }
    return false;
  } catch {
    return true; // unreadable ⇒ treat as protected (fail toward keeping evidence)
  }
}

function pruneOldDiagnostics(dir, sid, nowMs) {
  const maxAgeH = diagMaxAgeHours();
  if (!(maxAgeH > 0)) return 0; // disabled
  const cutoff = nowMs - maxAgeH * 3_600_000;
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return 0;
  }
  let removed = 0;
  // Memoized per sweep: isUnjudgedFinding re-reads a session's jsonl, and a session contributes
  // several filenames (jsonl + state + any DIAG), so without this it would read each one twice+.
  const verdictCache = new Map();
  const isProtected = (owner) => {
    if (!owner) return false;
    if (!verdictCache.has(owner)) verdictCache.set(owner, isUnjudgedFinding(dir, owner));
    return verdictCache.get(owner);
  };
  for (const f of entries) {
    // Never the CURRENT session's own artifacts (it's just starting). Includes DELIVERY-<sid>-*
    // for symmetry with collectInactiveArtifacts — else a resume >24h after start could reap this
    // session's own delivery draft.
    if (sid && (f === `${sid}.jsonl` || f === `${sid}.state.json` || f === `${sid}.surfaced.json` || f.startsWith(`DIAG-${sid}-`) || f.startsWith(`DELIVERY-${sid}-`))) continue;
    // Only OUR OWN artifact shapes — a stray file a user dropped here is left alone. The C1 surfaced
    // tombstone (`<sid>.surfaced.json`) is reaped by the SAME 24h age-cap (a delivery purge keeps it;
    // the age-cap is its lifecycle bound), never by the more aggressive 1h cleanup offer.
    const isOurs = f.endsWith(".surfaced.json") || f.endsWith(".jsonl") || f.endsWith(".state.json") || (f.startsWith("DIAG-") && f.endsWith(".md")) || (f.startsWith("DELIVERY-") && f.endsWith(".md"));
    if (!isOurs) continue;
    // EVIDENCE PROTECTION (P1-10): retain a session that recorded a finding nobody has diagnosed
    // yet. Silent 24h reclamation of an un-analysed finding destroys the only copy of it.
    if (isProtected(ownerSidOf(f))) continue;
    const p = join(dir, f);
    try {
      if (statSync(p).mtimeMs < cutoff) {
        unlinkSync(p);
        removed++;
      }
    } catch {
      /* file vanished / locked — skip */
    }
  }
  return removed;
}

// Which session an artifact filename belongs to: `<sid>.jsonl`, `<sid>.state.json`,
// `DIAG-<sid>-<ts>.md`, `DELIVERY-<fp>-<ts>.md` (a DELIVERY is keyed by finding fingerprint, not a
// session, so it has no owner). Pure; "" when unknown.
function ownerSidOf(f) {
  if (f.endsWith(".surfaced.json")) return f.slice(0, -".surfaced.json".length);
  if (f.endsWith(".state.json")) return f.slice(0, -".state.json".length);
  if (f.endsWith(".jsonl")) return f.slice(0, -".jsonl".length);
  const m = /^DIAG-(.+)-\d{4}-?\d{2}-?\d{2}T/.exec(f);
  return m ? m[1] : "";
}

// Inactivity floor for the cleanup OFFER: an artifact belongs to an "old inactive
// session" only if it is NOT the current session's AND its mtime is older than this —
// so a still-LIVE parallel session (which writes its jsonl/state frequently) is never
// offered up for deletion. Distinct from the age-cap (24h): the offer surfaces even for
// <24h leftovers, the age-cap only silently reclaims >24h ones.
const INACTIVE_MS = 60 * 60 * 1000; // 1h

// Collect our-own artifacts that belong to OTHER, now-inactive sessions. Returns
// { files:[abs path], sessions:Set<sid>, protectedSessions:Set<sid> }. `nowMs` drives the mtime
// cutoff (nowMs - INACTIVE_MS); pass a far-future nowMs to ignore the floor (purge --all).
//
// EVIDENCE PROTECTION (P1-10): a session holding a finding nobody has diagnosed yet is EXCLUDED
// and reported separately in `protectedSessions`, so neither the cleanup offer nor
// `purge-inactive` can destroy un-analysed evidence — including via the offer's "delete all
// (incl. this one)" option, which reaches the CURRENT session's jsonl. `force` overrides, for an
// operator who really does want the directory empty. Never throws.
function collectInactiveArtifacts(dir, sid, nowMs, { force = false } = {}) {
  const out = { files: [], sessions: new Set(), protectedSessions: new Set() };
  const verdictCache = new Map();
  const isProtected = (owner) => {
    if (force || !owner) return false;
    if (!verdictCache.has(owner)) verdictCache.set(owner, isUnjudgedFinding(dir, owner));
    return verdictCache.get(owner);
  };
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  const cutoff = nowMs - INACTIVE_MS;
  for (const f of entries) {
    // Never the CURRENT session's own artifacts.
    if (sid && (f === `${sid}.jsonl` || f === `${sid}.state.json` || f.startsWith(`DIAG-${sid}-`) || f.startsWith(`DELIVERY-${sid}-`))) continue;
    // Only OUR OWN artifact shapes — a stray file a user dropped here is left alone.
    const isOurs = f.endsWith(".jsonl") || f.endsWith(".state.json") || (f.startsWith("DIAG-") && f.endsWith(".md")) || (f.startsWith("DELIVERY-") && f.endsWith(".md"));
    if (!isOurs) continue;
    const owner = ownerSidOf(f);
    if (isProtected(owner)) { out.protectedSessions.add(owner); continue; }
    const p = join(dir, f);
    try {
      if (statSync(p).mtimeMs >= cutoff) continue; // still-fresh → maybe a live parallel session
    } catch {
      continue; // vanished / locked
    }
    out.files.push(p);
    if (f.endsWith(".jsonl")) out.sessions.add(f.replace(/\.jsonl$/, "")); // one jsonl per session
  }
  return out;
}

// Total vc-fix artifact files currently in the dir + distinct sessions (one .jsonl each), across
// ALL sessions INCLUDING the current one. Used only for the end-of-session cleanup dialog wording
// (the "delete all" option spans everything). Never throws.
function countArtifacts(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return { sessions: 0, files: 0 }; }
  let files = 0;
  let sessions = 0;
  for (const f of entries) {
    const isOurs = f.endsWith(".jsonl") || f.endsWith(".state.json") || (f.startsWith("DIAG-") && f.endsWith(".md")) || (f.startsWith("DELIVERY-") && f.endsWith(".md"));
    if (!isOurs) continue;
    files++;
    if (f.endsWith(".jsonl")) sessions++;
  }
  return { sessions, files };
}

function freshState(ev, sid) {
  return {
    sid,
    spanSeq: 0,
    processedLines: 0,
    scannedBytes: 0, // byte offset into the transcript, kept at a line boundary (S3 incremental read)
    scanErrors: 0, // count of transcript-scan read errors this session (OBS1 — gates the clean line)
    // Monotone twin of scanErrors. `scanErrors` is deliberately RESET on the next successful
    // read (a recovered blip must not degrade the whole session's clean line), which also means
    // a transient collector failure was FORGOTTEN entirely. This counter never resets, so the
    // judge can still see that measurement was interrupted at some point.
    scanErrorsTotal: 0,
    startTs: nowIso(), // session-start anchor (init time) — the synthesized-command-span start (Fix 2)
    transcriptPath: ev.transcript_path ?? null,
    currentCommand: null,
    currentSkill: null,
    openOps: new Map(), // tool_use_id → open tool/agent span
    lastScanTs: null, // newest transcript event ts seen (the session clock; orphan-agent backstop)
    totals: zeroCounts(),
    // Ops/details that ran with NO open command/skill span (parentId:null) — the capture-enabled-
    // mid-session blind spot (Fix 2). Buffered so a synthesized command span at Stop can ADOPT them
    // and get the same self-correction (allErrorsRecovered) treatment a real span's children get,
    // instead of rolling up the raw cumulative error totals (which count retried-then-recovered
    // errors and spuriously tag the run `failed` — code review #1).
    orphanOps: [], // { tool, arg_hash, status, cls, ts, durationMs }, bounded ring (OPS_CAP)
    orphanDetails: [], // { cls, snippet } for orphaned blocking errors, bounded (25) — errorCode fidelity
    untiedFailure: false, // an untied blocking failure (no paired op) occurred with no span open
    // Per-class counts of UNTIED blocking failures seen with no span open. An untied failure never
    // becomes an orphan OP (it has no tool_use_id), so the synth span can't derive a signal from it;
    // these are folded into the synth's signals so it still classifies `failed`, matching how a real
    // span treats an untied failure (`untiedFailure`/`sawUntiedFailure` only VETO `recovered`; they
    // cannot raise blockingErr on their own — Q&S NA-1).
    untiedSignals: zeroCounts(),
    spanCounts: {},
    // ─── the observation record (capture ≠ judgement) ──────────────────────────────
    // Signature-keyed aggregate of EVERY anomaly signal, however minor. A plain object (not a
    // Map) so it round-trips through .state.json with no serialization dance. See recordObs.
    observations: {}, // signature → { class, subject, code, skill, count, ts, lastTs, source, spanId, evidence }
    obsClassCounts: {}, // class → distinct-signature count (O(1) cap check)
    obsDropped: 0, // signatures the caps refused — surfaced as `capture_truncated`, never silent
    obsCursor: 0, // byte offset into OUR OWN jsonl, for folding cross-process `obs` lines
    obsSurfaced: [], // routing-class observation signatures already routed (one-shot, like seenSignatures)
    obsSurfacedCount: {}, // signature -> the count it was routed AT, so a RECURRENCE re-qualifies (item 7)
    sidechainOps: 0, // sub-agent transcript lines seen (aggregate only — never spans/ops)
    flagged: [], // non-success/recovered spans this session
    seenSignatures: [], // fingerprints already surfaced to the diagnostician
    feedbackCount: 0,
    // A /vc-feedback 👎 was recorded this session. This is the documented PRIMARY detector of SILENT
    // failures (a task done wrong with NO error → zero flagged spans), so it must trigger the tail
    // auto-run of /vc-self-check on its own — not only alongside a flagged span (code review #1). One-
    // shot: cleared when the trigger surfaces so it can't re-nag on a later turn.
    negativeFeedback: false,
    anySkillSeen: false,
    sawPluginSpan: false, // did any plugin skill/command span close this session (finalize `decision`)
    selfCheckSeen: false,
    promptedThisTurn: false,
    // Explicit "a skill/command finished its terminal step" marker, set by the `complete`
    // subcommand (invoked by a skill as its LAST action). The NEXT terminal Stop consumes it
    // to surface the clean line at most ONCE per skill run — so intermediate pauses of a
    // multi-turn skill (interview, "fill the files then done") never surface it. { skill, ts }.
    skillCompletePending: null,
    cleanLineOffered: false, // opt-in legacy fallback: the once-per-SESSION clean line already surfaced
    testEnv: process.env.TEST_ENV ?? null, // enriched from `TEST_ENV=` in tool args during scan (see below)
    cleanupPending: false, // leftover artifacts from OTHER inactive sessions detected at init
    cleanupOffered: false, // the one-shot cleanup offer already surfaced this session
    staleInactiveSessions: 0,
    staleInactiveFiles: 0,
  };
}
// openOps is a Map → serialize as entries; revive on load.
function loadState(statePath, ev, sid) {
  if (existsSync(statePath)) {
    try {
      const j = JSON.parse(readFileSync(statePath, "utf8"));
      j.openOps = new Map(Array.isArray(j.openOps) ? j.openOps : []);
      j.totals = j.totals || zeroCounts();
      j.spanCounts = j.spanCounts || {};
      j.flagged = j.flagged || [];
      j.seenSignatures = j.seenSignatures || [];
      j.spanSeq = j.spanSeq || 0;
      j.startTs = j.startTs || nowIso(); // forward-compat for pre-Fix-2 state files
      j.sid = j.sid || sid;
      j.cleanupPending = j.cleanupPending || false;
      j.cleanupOffered = j.cleanupOffered || false;
      j.skillCompletePending = j.skillCompletePending || null; // forward-compat for pre-marker state files
      j.cleanLineOffered = j.cleanLineOffered || false;
      j.staleInactiveSessions = j.staleInactiveSessions || 0;
      j.staleInactiveFiles = j.staleInactiveFiles || 0;
      j.scanErrors = j.scanErrors || 0; // OBS1: transcript-scan read-error tally, persisted across turns
      j.negativeFeedback = j.negativeFeedback || false; // forward-compat for pre-#143-followup state files
      j.orphanOps = Array.isArray(j.orphanOps) ? j.orphanOps : []; // forward-compat for pre-fix state files
      j.orphanDetails = Array.isArray(j.orphanDetails) ? j.orphanDetails : [];
      j.untiedFailure = j.untiedFailure || false;
      j.untiedSignals = (j.untiedSignals && typeof j.untiedSignals === "object") ? j.untiedSignals : zeroCounts();
      // Observation layer — forward-compat for a pre-VCST-5582-H state file (mid-upgrade
      // resume): an absent field must start EMPTY, never undefined, so recordObs/obsRollup
      // can assume the shape without re-checking on every call.
      j.observations = (j.observations && typeof j.observations === "object") ? j.observations : {};
      j.obsClassCounts = (j.obsClassCounts && typeof j.obsClassCounts === "object") ? j.obsClassCounts : {};
      j.obsDropped = j.obsDropped || 0;
      j.obsCursor = typeof j.obsCursor === "number" ? j.obsCursor : 0;
      j.obsSurfaced = Array.isArray(j.obsSurfaced) ? j.obsSurfaced : [];
      j.obsSurfacedCount = (j.obsSurfacedCount && typeof j.obsSurfacedCount === "object") ? j.obsSurfacedCount : {};
      j.sidechainOps = j.sidechainOps || 0;
      j.scanErrorsTotal = j.scanErrorsTotal || 0; // monotone twin of the resettable scanErrors
      j.testEnv = j.testEnv ?? (process.env.TEST_ENV ?? null);
      return j;
    } catch {
      /* corrupt — rebuild */
    }
  }
  return freshState(ev, sid);
}
// Atomic write (temp + rename): a crash mid-write can never leave a truncated
// state.json that would parse-fail → freshState → cursor reset to 0 → the whole
// transcript re-scanned and every span re-emitted (A-F5). rename() is atomic on
// the same filesystem; a stray temp file is harmless (never read).
function saveState(statePath, state) {
  const out = { ...state, openOps: [...state.openOps.entries()] };
  const tmp = `${statePath}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify(out), "utf8");
    renameSync(tmp, statePath);
  } catch {
    // Fall back to a direct write rather than losing the cursor entirely.
    try { writeFileSync(statePath, JSON.stringify(out), "utf8"); } catch { /* give up silently */ }
  }
}

function readPluginVersion() {
  for (const rel of [".claude-plugin/plugin.json", "plugin.json", "package.json"]) {
    try {
      const p = join(pluginRoot(), rel);
      if (existsSync(p)) {
        const j = JSON.parse(readFileSync(p, "utf8"));
        if (j && typeof j.version === "string") return j.version;
      }
    } catch {
      /* next */
    }
  }
  return null;
}

let _profileRoot;
let _profile;
function readProfile(root) {
  if (_profileRoot === root) return _profile;
  _profileRoot = root;
  _profile = null;
  try {
    const p = join(root, "project-profile.json");
    if (existsSync(p)) _profile = JSON.parse(readFileSync(p, "utf8"));
  } catch {
    /* null */
  }
  return _profile;
}
function readProjectType(root) {
  const j = readProfile(root);
  return typeof j?.projectType === "string" ? j.projectType : null;
}
// Capture gate — OPT-IN. Telemetry runs ONLY when the output-root profile EXPLICITLY
// sets `selfDiagnostics: true` (AND the env kill-switch VC_FIX_DIAG_CAPTURE is not
// off/0/false/no). Absent profile / absent field / any non-`true` value ⇒ NO capture —
// a full no-op, `.vc-fix/` is never created. The opt-in is owned by `/project-init`,
// which asks the consent question as its FIRST step and — on Yes — writes the flag
// IMMEDIATELY (before the interview) so its OWN remaining run is captured from that
// point on. No profile ⇒ no capture: every other skill just reads the flag; consent is
// never asked outside `/project-init`. (feedback.mode gates DELIVERY, not capture —
// read by deliver.mjs, never here.)
function captureEnabled(root) {
  if (/^(off|0|false|no)$/i.test(process.env.VC_FIX_DIAG_CAPTURE || "")) return false;
  try {
    return readProfile(root)?.selfDiagnostics === true;
  } catch {
    return false; // absent / unreadable profile ⇒ opt-in default = OFF
  }
}

// ─── subcommands ─────────────────────────────────────────────────────────────
async function cmdInit(ev) {
  const { root, dir, sid, jsonl, state } = await paths(ev);
  if (!captureEnabled(root)) return;
  ensureDir(dir);
  // Age-cap the diagnostics dir BEFORE writing this session's first record — reclaims
  // artifacts that the ephemeral (delete-after-delivery) path never gets to (undelivered
  // sessions). Never touches the current sid; best-effort, never throws.
  const pruned = pruneOldDiagnostics(dir, sid, Date.now());
  // After the silent age-cap sweep, count what's LEFT from other inactive sessions — the
  // cleanup offer (surfaced at the next terminal Stop) proposes clearing these now.
  const inactive = collectInactiveArtifacts(dir, sid, Date.now());
  // C4 — a startup WARNING while any non-expired .vc-fix/expected.json suppression is active, so a
  // forgotten entry cannot silently hide a real regression for the whole session. Durable in the
  // session_start record; also a one-line stderr note (best-effort, never blocks).
  const expected = loadExpected(root);
  if (expected.entries.length) {
    try { process.stderr.write(`vc-fix: ${expected.entries.length} active .vc-fix/expected.json suppression(s) — matching diagnostics will be withheld this session.\n`); } catch { /* ignore */ }
  }
  appendRecord(jsonl, {
    type: "session_start",
    sessionId: sid,
    ts: nowIso(),
    pluginVersion: readPluginVersion(),
    testEnv: process.env.TEST_ENV ?? null,
    projectType: readProjectType(root),
    // cwd stays LOCAL (reduce() reads only pluginVersion from session_start; .vc-fix/ is gitignored)
    // but run it through redact() anyway — defense-in-depth so a secret-shaped path segment can't
    // sit unscrubbed at rest; a normal path passes through unchanged (security review, Low).
    cwd: redact(process.cwd()),
    transcriptPath: ev.transcript_path ?? null,
    source: ev.source ?? null,
    ...(pruned > 0 ? { prunedOldArtifacts: pruned } : {}),
    ...(inactive.files.length > 0 ? { staleInactiveSessions: inactive.sessions.size, staleInactiveFiles: inactive.files.length } : {}),
    ...(expected.entries.length > 0 ? { expectedSuppressions: expected.entries.length } : {}),
  });
  // ─── resume / compact — carry the persisted state over, DON'T reset ──────────────
  // A `resume`/`compact` SessionStart fires MID-command when the context is summarized
  // (e.g. a long `/project-init` gets compacted halfway). A blind freshState() here WIPES
  // the open command span (state.currentCommand — it only lands in the jsonl when it CLOSES
  // at finalize), the scan cursor (processedLines), and the sawPluginSpan / anySkillSeen
  // aggregates — so a vc-fix command that crossed the boundary orphans all its tool spans
  // (parentId:null) and finalize sees pluginActivity:false ("the plugin never ran"). It then
  // escapes BOTH the clean line AND the findings escalation — the whole session goes dark.
  // So on resume/compact we reload the persisted state instead of resetting; loadState()
  // itself falls back to freshState() when no state file exists, so a brand-new session is
  // unaffected, and a plain `startup`/`clear` still gets the full reset. (Self-diagnosed via
  // /vc-self-check on a resumed /project-init session, 2026-07-21.)
  const carryOver = ev.source === "resume" || ev.source === "compact";
  const st = carryOver ? loadState(state, ev, sid) : freshState(ev, sid);
  st.cleanupPending = inactive.files.length > 0;
  st.staleInactiveSessions = inactive.sessions.size;
  st.staleInactiveFiles = inactive.files.length;
  saveState(state, st);
}

// UserPromptSubmit — open a COMMAND span for a plugin slash-command, or record a
// `/vc-feedback` verdict. This is what makes a COMMAND session (not just a Skill
// invocation) fully traced.
async function cmdPrompt(ev) {
  const { root, dir, sid, jsonl, state: statePath } = await paths(ev);
  if (!captureEnabled(root)) return;
  ensureDir(dir);
  const state = loadState(statePath, ev, sid);
  const transcriptPath = ev.transcript_path ?? state.transcriptPath;
  scanTranscript(jsonl, transcriptPath, state);
  state.transcriptPath = transcriptPath;
  state.promptedThisTurn = false; // new turn

  const prompt = String(ev.prompt ?? "").trim();
  // Unwrap the `<command-name>/…</command-name>` form the harness records for a slash
  // command, so COMMAND_RE (and /vc-feedback) match whether ev.prompt is the literal
  // `/vc-fix:qa-env-check` or the wrapped transcript form.
  const cmdTag = /<command-name>\s*(\/\S+)\s*<\/command-name>/i.exec(prompt);
  const cmdLine = cmdTag ? cmdTag[1] : prompt;

  // /vc-feedback "<text>" [👍|👎] — attach an explicit operator verdict to the trace.
  // Namespace-aware (`/vc-fix:vc-feedback` too), like COMMAND_RE.
  if (/^\/(?:[\w.-]+:)?vc-feedback\b/i.test(cmdLine)) {
    // Verdict from an EXPLICIT marker only — emoji / :±1: / :thumbs*: / a trailing
    // ±1 / a whole-word up|down|good|bad as the LAST token. Substring sentiment on
    // prose ("not bad", "the dropdown", "up to date") is too unreliable and would
    // spuriously force a `down` (→ upstream delivery via hasNegFeedback) — so it is
    // NOT used (B-F2/D7).
    const tail = cmdLine.replace(/^\/(?:[\w.-]+:)?vc-feedback\b/i, "").trim();
    const neg = /(👎|:-1:|:thumbsdown:)/.test(tail) || /(^|\s)(-1|down|bad)\s*$/i.test(tail);
    const pos = /(👍|:\+1:|:thumbsup:)/.test(tail) || /(^|\s)(\+1|up|good)\s*$/i.test(tail);
    const verdict = neg ? "down" : pos ? "up" : "neutral";
    const text = tail.replace(/👍|👎|:[-+\w]+:/g, "").replace(/(^|\s)([-+]1|up|down|good|bad)\s*$/i, "").trim();
    appendRecord(jsonl, { type: "feedback", sessionId: sid, ts: nowIso(), verdict, text: snippet(text, 500), skill: state.currentSkill?.name ?? state.currentCommand?.name ?? null });
    state.feedbackCount = (state.feedbackCount ?? 0) + 1;
    // A 👎 is the primary SILENT-failure signal — arm the tail-trigger so the terminal Stop auto-runs
    // /vc-self-check even when no span was flagged (code review #1). deliver's hasNegFeedback already
    // reads the jsonl record above; this flag only drives the collector's own trigger decision.
    if (verdict === "down") state.negativeFeedback = true;
    saveState(statePath, state);
    return; // feedback does NOT open a command span
  }

  const m = COMMAND_RE.exec(cmdLine);
  if (m) {
    // A new command turn — the previous command's trailing skill (if any) stays
    // open until the scanner meets the next Skill or finalize closes it.
    state.currentCommand = newSpan(state, "command", m[1].toLowerCase(), nowIso(), null);
    if (isSelfCheckName(m[1])) state.selfCheckSeen = true;
  }
  saveState(statePath, state);
}

// PostToolUse[Skill] / SubagentStop — just advance the scan (the scanner opens/
// closes skill + agent spans as it meets them).
async function cmdScan(ev) {
  const { root, dir, sid, jsonl, state: statePath } = await paths(ev);
  if (!captureEnabled(root)) return;
  ensureDir(dir);
  const state = loadState(statePath, ev, sid);
  const transcriptPath = ev.transcript_path ?? state.transcriptPath;
  scanTranscript(jsonl, transcriptPath, state);
  state.transcriptPath = transcriptPath;
  saveState(statePath, state);
}

// Why nothing surfaced this turn — AUDIT ONLY, never affects behavior (extracted from cmdFinalize's
// decision record for readability). Two branches:
//   • CLEAN (freshCount === 0): the clean line was withheld. The "already handled / our own resume"
//     guards (stop-hook-active, already-surfaced, self-check-session) are ordered BEFORE
//     "awaiting-completion" so OUR OWN resume-turn's Stop (which fires after we surfaced + consumed
//     the marker) is logged accurately, not mislabelled as a genuine mid-flight pause.
//   • FLAGGED (freshCount > 0): a finding existed but its block was withheld by a guard.
// `surfaced` ⇒ null (we DID surface). Pure; unit-covered via the finalize decision assertions.
// Recorded on the `decision` object as `surfaceReason` (it explains a ROUTING choice, never the
// run's health — the two were conflated in one `verdict` field, which is how a `failed` span ended
// up inside a record that called itself `clean`).
function computeSuppressReason({ surfaced, freshCount, pluginActivity, stopHookActive, promptedThisTurn, selfCheckSeen, consentOff, lineOff }) {
  if (surfaced) return null;
  if (freshCount === 0) {
    if (!pluginActivity) return "no-plugin-activity";
    if (stopHookActive) return "stop-hook-active";
    if (promptedThisTurn) return "already-surfaced";
    if (selfCheckSeen) return "self-check-session";
    if (consentOff) return "consent-off";
    if (lineOff) return "line-off";
    return "awaiting-completion";
  }
  if (consentOff) return "consent-off";
  if (stopHookActive) return "stop-hook-active";
  if (selfCheckSeen) return "self-check-session";
  return "already-surfaced";
}

/**
 * THE RUN'S VERDICT — derived from COUNTS ONLY, never from the routing set (VCST-5582 H).
 *
 * The old derivation was `flaggedRun ? "flagged" : "clean"` where `flaggedRun` came from
 * `uniqueFresh` — the set of NEW, not-yet-surfaced signatures. That is a ROUTING set, so the
 * durable audit record lied whenever routing said "nothing new to show": two sessions on disk in
 * this repo carry a `failed` span in `flagged[]` next to `"verdict":"clean"` (suppressReason
 * `stop-hook-active` / `self-check-session`). A verdict must describe the RUN, not the UI.
 *
 * Ladder (most severe wins):
 *   • `degraded-collector` — measurement itself broke; health was never established.
 *   • `attention`  — something worth a look: a flagged span, a 👎, a routing-class observation,
 *                    or ANY self-reported WARN/FAIL from one of our own surfaces.
 *   • `observed`   — observations exist but none of them route. NOT clean: the word "clean" is
 *                    reserved for a genuinely empty record.
 *   • `clean`      — zero observations, zero flagged spans, zero scan errors.
 *
 * INVARIANT 1: `clean` requires observations.total === 0 && flaggedTotal === 0 && !scanErrors.
 * INVARIANT 2: any self_reported_warn / self_reported_fail forces at least `attention`.
 * Together these make the reference failure UNREPRESENTABLE — a run containing a WARN cannot
 * record itself clean, whatever the classifier thought of it. Pure; unit-covered.
 */
function computeVerdict({ obs, flaggedTotal, negFeedback, scanErrors }) {
  if (scanErrors) return "degraded-collector";
  if (flaggedTotal > 0 || negFeedback || obs.routing > 0 || obs.selfReported > 0) return "attention";
  if (obs.total > 0) return "observed";
  return "clean";
}

async function cmdFinalize(ev) {
  const { root, dir, sid, jsonl, state: statePath } = await paths(ev);
  if (!captureEnabled(root)) return;
  ensureDir(dir);
  const state = loadState(statePath, ev, sid);
  // Snapshot the state file's mtime so we can tell, just before saving, whether ANOTHER collector
  // process wrote it while we were scanning (detection only — no lock). That happens when the
  // collector is registered twice for the same outputRoot (a project registering the `.claude/`
  // mirror while the plugin is enabled, or two parallel sessions in one project dir): both load,
  // both scan, both save, and the loser's cursor/counter updates are silently lost. Observed on
  // this repo before the mirror registration was removed: two finalize records 12 ms apart
  // reporting 292 vs 290 spans. It invalidates measurement, so it is a routing-class observation.
  let stateMtime = null;
  try { stateMtime = statSync(statePath).mtimeMs; } catch { /* first finalize of the session */ }
  const transcriptPath = ev.transcript_path ?? state.transcriptPath;
  scanTranscript(jsonl, transcriptPath, state);
  state.transcriptPath = transcriptPath;
  // C1 — recover the surfaced-signature dedup set from the purge-surviving tombstone, so a session
  // that was REBUILT from the transcript after a successful delivery does not re-surface a defect it
  // already delivered. Idempotent on a non-rebuilt session. `deliveredTombstone.deliveredObs` holds
  // the SKILL-INDEPENDENT obs keys, consulted in the freshObs filter below (a rebuild re-attributes
  // the obs's skill, so the full signature is unstable — C2).
  const deliveredTombstone = seedSurfacedFromTombstone(dir, sid, state);

  // ─── CHECKPOINT vs TERMINAL (subagent-timing fix) ───────────────────────────
  // `Stop` fires at the end of EVERY turn — including a turn that only handed work
  // to a background sub-agent and is now waiting. That sub-agent's work lives in a
  // sidechain the scanner skips, so finalizing here would judge an INCOMPLETE
  // session and (worse) print a "no plugin issues" verdict mid-task. So if work is
  // still pending we treat this Stop as a CHECKPOINT — record a durable `deferred`
  // decision to the jsonl (greppable), but DON'T drain openOps, DON'T close the
  // trailing skill/command, DON'T surface a line, DON'T run diagnostics. The open
  // spans/ops carry over so the TERMINAL Stop (sub-agent returned) does the real work.
  //
  // `background_tasks` is the AUTHORITATIVE signal: the platform supplies it on every
  // Stop/SubagentStop (possibly empty). When it's present we trust it EXCLUSIVELY — an
  // empty array on a terminal Stop means nothing is pending, so we must NOT also defer on
  // a lingering `openAgents`. Otherwise an ORPHANED agent op — a sub-agent that was
  // interrupted/crashed, or whose result landed in a skipped sidechain, so its op never
  // gets a matching tool_result and never closes — would keep deferring (until the session
  // clock advances, see the `freshOpenAgents` note below), and the drain safety-net below
  // (A-F8: record the orphan as `incomplete`, close the trailing spans, emit the terminal
  // verdict) would be delayed. The `openAgents` count is the fallback ONLY when the field is
  // entirely absent (an older/edge harness that doesn't send it — current CC always sends it).
  // `background_tasks` is present on every current-CC Stop/SubagentStop but is NOT scoped to this
  // session: it also lists `run_in_background` SHELL tasks and background work owned by OTHER
  // sessions. Trusting its length EXCLUSIVELY made a foreign shell task force perpetual deferral —
  // the LEO /project-init run (2026-07-22) recorded 3× `deferred` with agent_calls:0 and an empty
  // openOps because a different session's background shell task showed up here. So we defer ONLY
  // when a pending background item corresponds to one of THIS session's OWN open AGENT ops.
  const bgTasks = Array.isArray(ev.background_tasks) ? ev.background_tasks : [];
  // Session-relative "now" for the orphan backstop below: the newest transcript event ts (the session's
  // own clock), NOT wall-clock — the hook can fire long after the events, and the transcript timestamps
  // are what every other duration here is measured against. Falls back to wall-clock only if no scan ts.
  const refNowMs = Date.parse(state.lastScanTs || "") || Date.now();
  // This session's own open AGENT ops, indexed by every id the platform might key a bg task on: the
  // openOps Map key IS the tool_use_id, and sp.id is the span id. `freshOpenAgents` is the field-absent
  // fallback's "plausibly still running" subset (the STALL_MS orphan backstop, unchanged).
  let openAgents = 0;
  let freshOpenAgents = 0;
  let orphanFreshAgents = 0; // open agents younger than the (much larger) ORPHAN_MS crash cap
  const ownAgentIds = new Set();
  for (const [key, sp] of state.openOps) if (sp && sp.kind === "agent") {
    openAgents++;
    if (key != null) ownAgentIds.add(String(key));
    if (sp.id) ownAgentIds.add(String(sp.id));
    // An agent op is a fallback deferral signal ONLY while it is plausibly still running. An op open
    // longer than STALL_MS (measured on the SESSION clock — the newest transcript ts) with no matching
    // tool_result is an ORPHAN (crashed/interrupted sub-agent, or a result that landed in a skipped
    // sidechain). NOTE the session-clock dependency: if the sub-agent crashed with NO further main
    // events, `lastScanTs` is frozen at the op's open time, so `refNowMs - started` stays ~0 and the
    // op keeps deferring until the next main-transcript event advances the clock past STALL_MS — then
    // it drains. So the fallback counts only FRESH (≤ STALL_MS) open agents; stale ones fall through to
    // the drain. This only affects the fallback branch — when the harness sends `background_tasks`
    // (current CC, always) that array is authoritative and this is unused.
    const started = Date.parse(sp.startTs || sp.lastTs || "") || refNowMs;
    if (refNowMs - started <= T.STALL_MS) freshOpenAgents++;
    // The id-mismatch deferral branch (below) uses this much larger cap: a legitimately-slow /qa-fix
    // sub-agent (8–30+ min) must keep deferring, not be judged an 8-min-STALL orphan (code review #4).
    if (refNowMs - started <= T.ORPHAN_MS) orphanFreshAgents++;
  }
  // Classify the `background_tasks` entries. `ownedPendingAgents` = entries that match one of OUR
  // agent ops by id/tool_use_id. `sawAgentKindBg` = at least one entry is an AGENT/subagent (not a
  // shell/bash task), regardless of id. The kind split is the LEO fix's core: a `run_in_background`
  // SHELL task (foreign or ours) must NEVER cause a defer; only a genuine agent can.
  let ownedPendingAgents = 0;
  let sawAgentKindBg = false;
  for (const bt of bgTasks) {
    if (!bt || typeof bt !== "object") continue;
    const kind = String(bt.kind ?? bt.type ?? (bt.agent_type || bt.subagent_type ? "agent" : "")).toLowerCase();
    const isShell = kind === "bash" || kind === "shell" || kind === "command" || kind === "local_shell";
    const isAgent = !isShell && (kind === "agent" || kind === "subagent" || kind === "task" || Boolean(bt.agent_type || bt.subagent_type));
    if (isAgent) sawAgentKindBg = true;
    const ids = [bt.tool_use_id, bt.id, bt.agent_id].filter((x) => x != null).map(String);
    if (ids.some((x) => ownAgentIds.has(x))) ownedPendingAgents++;
  }
  // Hard guard (belt-and-suspenders): with ZERO open agent ops of ours, nothing of ours can be in a
  // sidechain — NEVER defer, whatever `background_tasks` says (this is the LEO agent_calls:0 case).
  // Otherwise, when the field is present, defer if either (a) a bg entry matches one of our agent ops
  // by id, OR (b) a bg entry is agent-KIND and we have an open agent op younger than ORPHAN_MS — this
  // covers a platform that keys an agent bg task by a distinct `agent_id` (≠ our tool_use_id), so a
  // genuinely-running subagent is not finalized early; the `orphanFreshAgents` gate (ORPHAN_MS on the
  // session clock, 45min — comfortably longer than a real /qa-fix run) bounds it so an ORPHANED own-op
  // + a persistent foreign agent-kind entry can't defer forever, WITHOUT judging a legitimately-slow
  // fix agent an orphan at STALL_MS (8min, code review #4). When the field is absent, fall back to
  // freshOpenAgents (unchanged).
  const pendingBg = openAgents === 0 ? false
    : ("background_tasks" in ev) ? (ownedPendingAgents > 0 || (sawAgentKindBg && orphanFreshAgents > 0)) : freshOpenAgents > 0;
  const stopHookActive = ev.stop_hook_active === true;
  if (pendingBg) {
    // Reflect OUR pending agents, not global background noise (was `bgTasks.length`).
    const pendingSubagents = ("background_tasks" in ev) ? (ownedPendingAgents || freshOpenAgents || openAgents) : (freshOpenAgents || openAgents);
    appendRecord(jsonl, {
      type: "finalize",
      sessionId: sid,
      ts: nowIso(),
      reason: ev.reason ?? null,
      decision: { verdict: "deferred", pendingSubagents, surfaced: false, suppressReason: "subagent-running" },
    });
    saveState(statePath, state);
    return;
  }

  // ─── an unanswered OPERATOR QUESTION also defers (VCST-5582 D) ───────────────
  // An `AskUserQuestion` tool_use with no matching tool_result means the operator is being asked
  // something right now. A `{decision:"block"}` here would RESUME the agent and push that question
  // out of view — the OPUS failure: `/qa-bug`'s Step-5 "create a bug-tracker ticket?" was buried by
  // the self-diagnostics tail-trigger, so the ticket phase ran unattended and undiagnosed. So this
  // Stop is a CHECKPOINT, exactly like a pending sub-agent: record a durable `deferred` decision and
  // return WITHOUT draining/closing spans or surfacing anything. The real verdict lands on the
  // terminal Stop once the answer is in the transcript (which also keeps the post-answer work INSIDE
  // the span). Bounded by QUESTION_PENDING_MS on the session clock so a missed tool_result can't
  // defer forever; a truly idle wait never ages (the clock only moves on transcript events).
  let pendingQuestions = 0;
  for (const [, sp] of state.openOps) {
    if (!sp || !QUESTION_TOOL_RE.test(String(sp.name || ""))) continue;
    const asked = Date.parse(sp.startTs || sp.lastTs || "") || refNowMs;
    if (refNowMs - asked <= T.QUESTION_PENDING_MS) pendingQuestions++;
  }
  if (pendingQuestions > 0) {
    // Record the deferral as an observation too. The `deferred` finalize record already says it
    // happened, but only for THIS turn; an observation makes "the operator was left with an
    // unanswered question" a durable, countable fact — and if the answer never lands (a lost
    // tool_result), the judge sees the deferral chain instead of a silent gap.
    recordObs(jsonl, state, { class: "question_unanswered", subject: "askuserquestion", code: "NONE", evidence: { snippet: `${pendingQuestions} open question(s) at Stop` } });
    appendRecord(jsonl, {
      type: "finalize",
      sessionId: sid,
      ts: nowIso(),
      reason: ev.reason ?? null,
      decision: { verdict: "deferred", pendingQuestions, surfaced: false, suppressReason: "question-pending" },
    });
    saveState(statePath, state);
    return;
  }

  // ─── synthesize a command span for a capture-enabled-mid-session run (Fix 2) ──
  // A skill that turns capture ON during its OWN run (e.g. /project-init's §0b consent writes
  // selfDiagnostics:true) fired its UserPromptSubmit BEFORE the flag existed, so cmdPrompt was a
  // no-op and NO command span opened. Its `complete --skill "<name>"` marker is then the ONLY proof
  // it ran. Without a span the run is a mere boolean (pluginActivity), and ITS tool-level failures
  // can never be flagged. So represent it with a REAL command span (start = session start, end =
  // now): the still-open ops drain into it below, and its orphaned blocking-error counts roll up so
  // classify() can flag it. Guarded to the exact blind spot — a THIS-session complete marker with NO
  // command/skill span of any kind. The sid-scoped marker guard blocks a stray cross-session marker,
  // and a plain-dev turn emits no `complete` at all, so this never over-fires. The marker is consumed
  // (`state.skillCompletePending = null`) later on this same terminal Stop, where it is surfaced.
  const marker = state.skillCompletePending;
  const completeForThisSession = Boolean(marker) && (!marker.sid || marker.sid === state.sid);
  if (completeForThisSession && !state.currentCommand && !state.currentSkill && !state.sawPluginSpan) {
    const synth = newSpan(state, "command", marker.skill || "unknown", state.startTs || state.lastScanTs || nowIso(), null);
    // ADOPT the session's orphaned (parentless) ops rather than rolling up the raw cumulative error
    // TOTALS. `state.totals.<cls>` counts EVERY errored tool_result — including one a later retry
    // self-corrected — so rolling it up tagged an otherwise-healthy, probe-heavy run (/project-init
    // runs many live probes; a flaky probe or a NOT-READY exit-1 that was re-run) `failed` → a
    // spurious BROKEN self-diagnosis that in feedback.mode=auto files a bogus upstream issue
    // (code review #1). With the ops adopted, classify()/allErrorsRecovered apply the SAME
    // self-correction test a real span gets: a retried-then-recovered probe is `recovered` (S3, not
    // flagged), a genuinely-unresolved failure stays `failed`. Signals are derived from the adopted
    // ops' own error classes (so signalClass/topSignal stay faithful), and the untied-failure veto
    // is inherited from the session flag. sawExpected:true (the completion marker IS the expected
    // output proof) prevents a false silent_suspect from the orphaned op volume.
    synth.ops = (state.orphanOps || []).slice(-OPS_CAP);
    synth.opCount = (state.orphanOps || []).length;
    synth.details = (state.orphanDetails || []).slice(0, 25);
    synth.sawUntiedFailure = Boolean(state.untiedFailure);
    for (const o of synth.ops) {
      if (o.status === "error" && o.cls) synth.signals[o.cls] = (synth.signals[o.cls] || 0) + 1;
      if (DECISIVE_RE.test(o.tool)) synth.sawDecisive = true;
    }
    // Fold in UNTIED blocking failures (no paired op → not in orphanOps) so the synth still sees
    // blockingErr and classifies `failed`, exactly as a real span does for an untied failure — the
    // established fail-toward-escalation asymmetry (Q&S NA-1). Recovered TIED probes are unaffected:
    // their errors are orphan OPS subject to allErrorsRecovered, never counted here.
    const us = state.untiedSignals || {};
    for (const c of ["tool_error", "permission_denied", "hook_failure"]) {
      if (us[c]) synth.signals[c] = (synth.signals[c] || 0) + us[c];
    }
    synth.sawExpected = true;
    state.currentCommand = synth;
  }

  // Drain any tool/agent op still open at Stop (interrupted session — no tool_result
  // seen) so its span is recorded and its op reaches the parent (A-F8), instead of
  // being silently dropped. Status "incomplete" (not an error → doesn't force failed).
  for (const [, sp] of state.openOps) {
    const p = state.currentSkill && state.currentSkill.id === sp.parentId ? state.currentSkill
      : state.currentCommand && state.currentCommand.id === sp.parentId ? state.currentCommand
      : null;
    emitSpan(jsonl, state, sp, sp.lastTs);
    if (p) pushOp(p, { tool: sp.name, arg_hash: sp.arg_hash, status: "incomplete", ts: sp.lastTs, durationMs: 0 });
  }
  state.openOps.clear();

  // Close trailing spans (skill first — rolling its expected-output up to the command
  // — then the command).
  if (state.currentSkill) closeSkill(jsonl, state, state.currentSkill.lastTs);
  if (state.currentCommand) { emitSpan(jsonl, state, state.currentCommand, state.currentCommand.lastTs); state.currentCommand = null; }

  // Fold in `obs` lines appended by ANOTHER process (the `obs` subcommand, invoked by
  // verify-access.mjs / discover-tracker.mjs over Bash) before anything is judged or reported.
  // Did another collector process write our state file while we were scanning? (See the mtime
  // snapshot at the top of cmdFinalize.) Recorded BEFORE the rollup so it counts this turn.
  if (stateMtime !== null) {
    try {
      if (statSync(statePath).mtimeMs !== stateMtime) {
        recordObs(jsonl, state, { class: "collector_contention", subject: "state_file", code: "NONE", evidence: { snippet: "another collector process wrote <sid>.state.json during this scan — counters/cursor may have been lost; is the collector registered twice for this outputRoot?" } });
      }
    } catch { /* vanished — nothing to compare */ }
  }
  foldObsFromJsonl(jsonl, state);
  // A cap that refused observations is itself recorded — a truncated capture must never read as
  // a quiet one. Emitted once per finalize while the drop counter is non-zero, then cleared.
  if (state.obsDropped > 0) {
    const dropped = state.obsDropped;
    state.obsDropped = 0;
    recordObs(jsonl, state, { class: "capture_truncated", subject: "obs_cap", code: "NONE", evidence: { snippet: `${dropped} observation signature(s) dropped by OBS_SIGNATURE_CAP/OBS_PER_CLASS_CAP` } });
  }
  const obs = obsRollup(state);

  // Tail-based escalation: keep only NEW non-success signatures we haven't already
  // surfaced. (vc-self-check's own spans were never flagged — emitSpan drops them.)
  // A RECURRENCE re-qualifies: a signature already surfaced comes back when its occurrence count
  // has GROWN since we surfaced it (`surfacedAt`), because 20 occurrences of a failure are not the
  // same event as 1 — before this, one surfacing silenced a signature for the whole session however
  // often it recurred. This is a COUNT test, not a severity test: routing stays severity-free.
  const uniqueFresh = [];
  const seen = new Set();
  for (const f of state.flagged) {
    if (seen.has(f.signature)) continue;
    const already = state.seenSignatures.includes(f.signature);
    const grew = already && (f.occurrences ?? 1) >= (f.surfacedAt ?? 0) * 2 && (f.occurrences ?? 1) > (f.surfacedAt ?? 0);
    if (already && !grew) continue;
    seen.add(f.signature);
    uniqueFresh.push(f);
  }

  // ─── the decision moment (Task 2.1 — always recorded) ───────────────────────
  // The ONLY user-visible surface a Stop hook has on this platform is a
  // `{decision:"block", reason}` that RESUMES the agent so the model prints the line
  // (plain stdout → debug log only; `systemMessage` is not rendered — CC issue #50542).
  // So a visible line always costs one extra model turn.
  //   • FINDINGS → block+run /vc-self-check (the resume is justified — we want the diag).
  //   • CLEAN    → resume ONCE to print a "no plugin issues detected" line by DEFAULT, but only
  //     once a skill/command has signalled its terminal step (`complete`) — a deliberate
  //     one-extra-turn cost, at most once per run. Silence it with VC_FIX_DIAG_LINE=off. The
  //     `decision` record below stays the free durable audit regardless of whether a line printed.
  const consentOff = /^(off|0|false|no)$/i.test(process.env.VC_FIX_DIAG_CONSENT || "");
  const lineOff = /^(off|never|0|false|no)$/i.test(process.env.VC_FIX_DIAG_LINE || "");
  // `!stopHookActive` is a belt-and-suspenders guard alongside `promptedThisTurn`: the Stop that
  // fires from OUR OWN resume-turn carries stop_hook_active:true, so neither the findings block
  // nor the clean line re-fires and no resume loop can form.
  // A run is "flagged" if EITHER a span was flagged OR a /vc-feedback 👎 was recorded — the 👎 is the
  // documented primary detector of SILENT failures (zero flagged spans), so it must trigger the tail
  // auto-run of /vc-self-check on its own (code review #1). Both share the same one-shot guards below.
  const negFeedback = Boolean(state.negativeFeedback);
  // ─── ROUTING, not severity (VCST-5582 H) ─────────────────────────────────────────────
  // Routing-class observations not yet routed. Membership in OBS_ROUTING_CLASSES is DATA (kept in
  // lock-step with skill-expectations §1e) and decides only WHETHER TO SPEND A TURN NOW —
  // everything outside it is still recorded, still forbids the word "clean", still counted in the
  // visible line, and still analysed by any /vc-self-check. Deduped by signature exactly like the
  // flagged signatures, so a recorded WARN triggers the diagnostician ONCE, not on every Stop.
  //
  // LOOP GUARD: an observation attributed to /vc-self-check's own run is RECORDED (capture is
  // total) but never routes — the same rule emitSpan applies to its spans. Without this, one
  // errored Read inside the diagnostician would mint a fresh routing signature and re-trigger it.
  // OCCURRENCE GROWTH re-qualifies a signature (item 7 / §1f rule 5). The one-shot `obsSurfaced`
  // list silenced a signature for the rest of the session, so a defect that kept RECURRING after
  // being reported once was indistinguishable from one that happened once — "a recurrence is not a
  // duplicate". `obsSurfacedCount` records the count we surfaced AT, exactly as the flagged-span
  // path records `surfacedAt`, and growth beyond it routes again. Scoped to the hard set, so a
  // growing `harness_noise` tally can never re-nag.
  const freshObs = [];
  for (const [sig, o] of Object.entries(state.observations || {})) {
    if (!obsRoutes(o)) continue;
    if (o.skill && isSelfCheckName(o.skill)) continue;
    const surfacedAt = (state.obsSurfacedCount || {})[sig];
    const seen = (state.obsSurfaced || []).includes(sig);
    if (seen && !(surfacedAt != null && (o.count ?? 1) > surfacedAt)) continue;
    // C1 — an already-DELIVERED observation (skill-independent key in the tombstone) must not
    // re-surface on a post-purge rebuild, even though its full signature changed (the rebuild
    // re-attributed its skill — C2). A GROWN count still re-qualifies, exactly like the `seen` path.
    if (deliveredTombstone) {
      const deliveredAt = deliveredTombstone.deliveredObs[obsStableKey(o)];
      if (deliveredAt != null && !((o.count ?? 1) > deliveredAt)) continue;
    }
    freshObs.push({ signature: sig, class: o.class, subject: o.subject, count: o.count ?? 1, grew: seen });
  }
  // ─── C4 — .vc-fix/expected.json suppression ──────────────────────────────────────────
  // An operator-declared EXPECTED observation (a planted fixture, a known benign friction) must not
  // arm the diagnostician. It stays RECORDED and COUNTED (capture is total) — it just does not
  // ROUTE. A non-empty file is reported (`expectedActive`) so a forgotten entry cannot quietly mask
  // a real regression. Matched on (class, subject); a pluginFile-only entry can't match a pluginFile-
  // less observation, so it is a no-op here (it applies on the deliver/finding side).
  const expected = loadExpected(root);
  let suppressedByExpected = 0;
  if (expected.entries.length) {
    for (let i = freshObs.length - 1; i >= 0; i--) {
      const fo = freshObs[i];
      if (findExpected(expected.entries, { cls: fo.class, subject: fo.subject })) {
        freshObs.splice(i, 1);
        suppressedByExpected++;
      }
    }
  }
  const flaggedRun = uniqueFresh.length > 0 || negFeedback || freshObs.length > 0;
  // `state.selfCheckSeen` is NO LONGER a gate here (P0-5). It used to latch for the WHOLE session,
  // so one early /vc-self-check silenced every later finding — a genuinely lost finding, not just a
  // missing line. Recursion is already prevented by four independent guards: `stopHookActive` (our
  // own resume-turn's Stop), `promptedThisTurn` (reset only by a new UserPromptSubmit), the
  // per-signature dedup above, and emitSpan dropping vc-self-check's own spans. The field is kept
  // for the audit trail (`suppressReason: "self-check-session"` can still describe a clean turn).
  const shouldPrompt = !consentOff && !stopHookActive && !state.promptedThisTurn && flaggedRun;
  // A completion marker counts for THIS session ONLY. cmdComplete is Bash-invoked (no hook stdin),
  // so it targets a session by the newest `.state.json` (mtime heuristic) or an explicit `--session`,
  // and stamps the RESOLVED sid INTO the marker. If a marker with a DIFFERENT sid is read here (a
  // stale/mis-targeted write, or a future --session flow), `marker.sid !== state.sid` makes this
  // session ignore it — so a stray marker landed by the mtime race can't become the SOLE "plugin
  // activity" of an unrelated plain-dev session (PR #143 review, Finding 4). A pre-#143 marker with
  // no `sid` field is honoured (back-compat). NOTE: `marker` / `completeForThisSession` are computed
  // once above (the Fix-2 synthesis needs them before the drain) and reused here.
  // pluginActivity = a plugin skill/command was active this session. Normally proven by a closed
  // skill/command span (sawPluginSpan) or a seen Skill (anySkillSeen). A THIRD proof: an explicit
  // `complete --skill "<name>"` completion signal — only a plugin skill/command emits it (as its
  // terminal action), so its presence is authoritative. This matters for the OPT-IN capture case:
  // `/project-init`'s OWN run turns capture on mid-session (its §0b consent step writes the flag), so
  // its `/project-init` UserPromptSubmit — which fired BEFORE the flag existed — was a no-op and NO
  // command span opened. Its `complete` signal is then the only proof the plugin ran; without this OR
  // the healthy run would be misjudged "no-plugin-activity" and its clean line withheld (residual
  // opt-in blind spot, LEO deployment 2026-07-22). It never over-fires on a plain dev turn (no
  // `complete` is emitted there — and a stray cross-session marker is filtered by the sid guard above).
  const pluginActivity = Boolean(state.sawPluginSpan) || Boolean(state.anySkillSeen) || completeForThisSession;
  // Clean line (default ON): gated on an EXPLICIT completion signal, NOT on per-turn plugin
  // activity. `Stop` fires at the end of EVERY turn (including every interview/"fill the files"
  // pause of a multi-turn skill) and cannot know whether another user turn is coming, so a
  // per-turn `pluginActivity` guard structurally can't express "once, at the end" — it re-printed
  // the line after every pause. Instead a skill signals `complete` as the LAST action of its
  // terminal step (sets state.skillCompletePending); the line then fires at most ONCE per run,
  // only after that final step, and the marker is consumed on surfacing so it never repeats.
  // `promptedThisTurn` (reset ONLY by a new UserPromptSubmit) + `!stopHookActive` still stop the
  // resumed print-turn's own Stop from re-blocking → no infinite loop.
  const completePending = completeForThisSession;
  // Opt-in backward-compat (OFF by default): for a skill that never signals `complete`, fall back
  // to a once-per-SESSION clean line (persisted `cleanLineOffered` guard, mirroring
  // `cleanupOffered`) instead of per-turn. This rescues an un-migrated skill without regressing to
  // the per-pause repeat. A migrated skill signals completion explicitly and never needs it.
  const lineFallback = /^(on|1|true|yes)$/i.test(process.env.VC_FIX_DIAG_LINE_FALLBACK || "");
  const fallbackClean = lineFallback && !completePending && !state.cleanLineOffered;
  const cleanEligible = pluginActivity && (completePending || fallbackClean);
  // `!state.scanErrors`: a session whose transcript scan hit a read error measured NOTHING, so a
  // "no plugin issues detected" line would assert health that was never checked (PR #143 R2 OBS1).
  // Withhold the clean line in that case — the finalize record still carries scanErrors for audit.
  // ─── the run's verdict, and the THREE-STATE status line (VCST-5582 H) ────────────────
  // The verdict describes the RUN (counts only — see computeVerdict). The status line's WORDING is
  // then chosen from it, under exactly the same gates the old single clean line had:
  //   • clean     → "no plugin issues detected"        (zero observations — the only honest use of the word)
  //   • observed  → "no blocking issues — N observations recorded (run /vc-self-check for detail)"
  //   • attention → no line here; the findings block (shouldPrompt) owns that path
  // `visible` excludes the NOISE classes from the COUNT only — they stay in the jsonl, and the
  // judge, not the hook, decides they were benign.
  const verdict = computeVerdict({ obs, flaggedTotal: state.flagged.length, negFeedback, scanErrors: state.scanErrors || 0 });
  // `!state.scanErrors`: a session whose transcript scan hit a read error measured NOTHING, so a
  // positive status line would assert health that was never checked (PR #143 R2 OBS1). Withhold it —
  // the finalize record still carries scanErrors/scanErrorsTotal for audit.
  const statusEligible = !lineOff && !consentOff && !stopHookActive && !state.promptedThisTurn && !state.selfCheckSeen && !flaggedRun && cleanEligible && !state.scanErrors;
  const cleanBlock = statusEligible && verdict === "clean";
  const observedBlock = statusEligible && verdict === "observed";
  // Cleanup NOTE (once per session; item 8 demoted it from a three-option question to a clause on
  // the single info line): leftover artifacts from OTHER inactive sessions were detected at init.
  // It ALWAYS rides a DIAGNOSTIC surface — it fires ONLY when a findings block (`shouldPrompt`) or
  // the status line (`cleanBlock`/`observedBlock`) is ALSO firing this turn, and is APPENDED to it.
  // It NEVER surfaces standalone:
  //   • not on a plain dev turn with no plugin activity (would pop a cleanup dialog out of nowhere,
  //     with no verdict to justify it — the age-cap silently reclaims >24h leftovers, and the next
  //     real plugin session offers cleanup after its verdict). [was `|| !pluginActivity` — removed
  //     per operator feedback 2026-07-22: "deletion should come AFTER the no-problems check; if
  //     problems are found, self-analysis + feedback first, THEN the cleanup offer".]
  //   • not during an intermediate pause of a still-running skill (`awaiting-completion`: neither
  //     surfaces, so cleanup doesn't either — no MID-onboarding interruption).
  // Suppressed by the kill switch; once per session via `cleanupOffered` (persisted) + `promptedThisTurn`.
  const cleanupPending = Boolean(state.cleanupPending) && !state.cleanupOffered;
  const cleanupBlock = cleanupPending && !consentOff && !stopHookActive && !state.promptedThisTurn && (shouldPrompt || cleanBlock || observedBlock);
  const surfaced = shouldPrompt || cleanBlock || observedBlock || cleanupBlock;
  // A durable, deterministic audit of every decision moment — greppable with
  // `"type":"finalize"` / `decision` in the session jsonl. This is how "when did the hook
  // run and what did it decide" stays observable WITHOUT printing a line on every turn.
  //
  // TWO SEPARATE STATEMENTS, deliberately (VCST-5582 H): `verdict` describes the RUN and is derived
  // from counts alone; `surfaceDecision`/`suppressReason` describe the UI choice. Conflating them in
  // one field is precisely how a `failed` span ended up inside a record that called itself `clean`.
  const decision = {
    verdict,
    surfaceDecision: shouldPrompt ? "tail-trigger" : cleanBlock ? "clean-line" : observedBlock ? "observed-line" : cleanupBlock ? "cleanup-offer" : "none",
    pluginActivity,
    freshCount: uniqueFresh.length,
    freshObsCount: freshObs.length, // routing-class observations not previously routed
    // C4 — how many routing observations were suppressed by .vc-fix/expected.json this turn, and how
    // many active suppressions exist (always reported so a forgotten entry can't hide a regression).
    ...(suppressedByExpected > 0 ? { suppressedByExpected } : {}),
    ...(expected.entries.length > 0 ? { expectedActive: expected.entries.length } : {}),
    observations: obs, // { distinct, total, visible, routing, selfReported, dropped, byClass }
    negativeFeedback: negFeedback, // did a /vc-feedback 👎 flag this run (may be true with freshCount:0)
    flaggedTotal: state.flagged.length,
    scanErrors: state.scanErrors || 0, // >0 ⇒ transcript scan hit a read error; status line withheld (OBS1)
    scanErrorsTotal: state.scanErrorsTotal || 0, // monotone — a blip that scanErrors already forgot
    surfaced, // did we resume + print a visible line this turn
    cleanupOffered: cleanupBlock, // did the stale-artifact NOTE ride along this turn (item 8: a note, no longer a question)
    completeSignalled: completePending, // did a skill signal its terminal step this run
    completedSkill: completePending ? (state.skillCompletePending?.skill ?? null) : null,
    // Why nothing surfaced this turn (audit only — never affects behavior). See computeSuppressReason.
    suppressReason: computeSuppressReason({
      surfaced,
      freshCount: uniqueFresh.length,
      pluginActivity,
      stopHookActive,
      promptedThisTurn: state.promptedThisTurn,
      selfCheckSeen: state.selfCheckSeen,
      consentOff,
      lineOff,
    }),
  };

  appendRecord(jsonl, {
    type: "finalize",
    sessionId: sid,
    ts: nowIso(),
    reason: ev.reason ?? null,
    totals: state.totals,
    spanCounts: state.spanCounts,
    flagged: state.flagged.map((f) => ({ name: f.name, kind: f.kind, outcome: f.outcome, struggle: f.struggle, signature: f.signature, occurrences: f.occurrences ?? 1 })),
    anySkillSeen: Boolean(state.anySkillSeen),
    sidechainOps: state.sidechainOps ?? 0, // sub-agent transcript volume (aggregate-only capture)
    feedbackCount: state.feedbackCount ?? 0,
    testEnv: state.testEnv ?? process.env.TEST_ENV ?? null, // enriched from tool args when not exported to the hook env
    decision,
  });

  // Set the one-shot guard for ANY block we emit this turn (findings / clean-line / cleanup),
  // so a repeat finalize in the same turn (incl. the resumed print-turn's own Stop) never
  // re-blocks. `cleanupOffered` is persisted (NOT reset per turn) → the offer is once per session.
  if (surfaced) state.promptedThisTurn = true;
  if (cleanupBlock) state.cleanupOffered = true;
  if ((cleanBlock || observedBlock) && fallbackClean) state.cleanLineOffered = true; // legacy fallback: once per session
  if (shouldPrompt) {
    // Record WHAT occurrence count we surfaced at, so a later recurrence can re-qualify (see the
    // `grew` test above) instead of the signature being silenced for the rest of the session.
    for (const f of uniqueFresh) {
      state.seenSignatures.push(f.signature);
      const live = state.flagged.find((x) => x.signature === f.signature);
      if (live) live.surfacedAt = live.occurrences ?? 1;
    }
    // Same one-shot dedup for routing-class OBSERVATIONS — a recorded WARN arms the diagnostician
    // once, not on every subsequent Stop.
    if (!Array.isArray(state.obsSurfaced)) state.obsSurfaced = [];
    if (!state.obsSurfacedCount || typeof state.obsSurfacedCount !== "object") state.obsSurfacedCount = {};
    for (const o of freshObs) {
      if (!state.obsSurfaced.includes(o.signature)) state.obsSurfaced.push(o.signature);
      // Record WHAT count we surfaced at, so a later recurrence re-qualifies instead of the
      // signature being silenced for the rest of the session (mirrors flagged `surfacedAt`).
      state.obsSurfacedCount[o.signature] = o.count ?? 1;
    }
    state.negativeFeedback = false; // one-shot: the 👎 trigger is spent once vc-self-check is armed
    // C1 — persist the surfaced signals to the purge-surviving tombstone, so a post-delivery rebuild
    // does not re-nag on an already-surfaced/delivered defect. Spans by full signature; observations
    // by their SKILL-INDEPENDENT key (the rebuild re-attributes the skill — C2).
    const deliveredObs = {};
    for (const o of freshObs) {
      const full = state.observations?.[o.signature];
      if (full) deliveredObs[obsStableKey(full)] = o.count ?? 1;
    }
    writeSurfaced(dir, sid, { signatures: state.seenSignatures, deliveredObs });
  }
  // Consume the completion signal on ANY terminal Stop that evaluated it — not only when it
  // surfaced. A completion signal is for THIS terminal Stop; if the clean line can't surface now
  // (line/consent off, already surfaced this turn, or the run produced only sidechain spans so
  // pluginActivity is false), the signal is SPENT and must not carry to a LATER unrelated clean
  // turn (which would mis-attribute a clean line to it). The deferred/checkpoint path returns
  // before here, so a marker still survives a background-sub-agent checkpoint to the terminal Stop.
  if (completePending) state.skillCompletePending = null;
  saveState(statePath, state);

  // Build the ONE decision:block reason. At most one of findings/clean fires (findings wins);
  // the cleanup offer is APPENDED to whichever is firing, or stands alone if neither is.
  // The block `reason` is DISPLAYED to the user verbatim (Claude Code renders it as
  // "Stop hook error: …"), so keep it to ONE short instruction — the operator should see
  // essentially just the status line, not a paragraph. The rich rationale lives in this comment
  // + the oracle, not in the surfaced text.
  //
  // The findings branch is an INSTRUCTION (run the skill, then follow it); the clean/observed
  // branches are print-verbatim-and-stop. Do NOT put "and stop" in the findings branch: the
  // skill's delivery step (the per-finding offer — the whole point of the default
  // `feedback.mode: "ask"`) runs AFTER the roll-up line, and an "and stop" here terminated the turn
  // before it, which is exactly how the dead `/vc-self-check deliver` hint regressed into the hook
  // layer (VCST-5582 G). Same reason the reassurance must stay CONDITIONAL ("nothing leaves without
  // your yes") and not absolute ("nothing is sent anywhere") — the absolute form reads to the agent
  // as a prohibition on even the dry plan the offer needs.
  let reason = null;
  if (shouldPrompt) {
    // THREE trigger sources: flagged spans, routing-class observations, and/or a 👎. Describe
    // whichever applies (each can be empty on its own) — the instruction to run vc-self-check is
    // identical, and the diagnostician reads the full record anyway.
    const summary = uniqueFresh.map((f) => `${f.outcome} in /${f.name}${f.struggle?.length ? ` (${f.struggle.join(",")})` : ""}${(f.occurrences ?? 1) > 1 ? ` ×${f.occurrences}` : ""}`).join("; ");
    const obsSummary = freshObs.map((o) => `${o.class}:${o.subject}`).join("; ");
    const parts = [];
    if (summary) parts.push(`flagged this run (${summary})`);
    if (obsSummary) parts.push(`recorded ${freshObs.length} observation(s) worth a look (${obsSummary})`);
    if (!parts.length && negFeedback) parts.push("received your negative feedback (👎) this session");
    reason = `vc-fix self-diagnostics ${parts.join(" and ")}. Run the vc-self-check skill (Skill tool, argument "latest"): it spawns the self-check-diagnostician subagent, reports the finding roll-up in ONE line, and — if a finding is worth contributing — asks you once before anything is sent. Nothing leaves this machine without an explicit yes.`;
  } else if (cleanBlock) {
    reason = "Print this one line to the user verbatim, then stop — no other action: vc-fix self-check: no plugin issues detected";
  } else if (observedBlock) {
    // The middle state. It must NOT say "clean" (observations exist) and must NOT alarm (none of
    // them routes). It names the count so the operator knows something accumulated and how to look.
    reason = `Print this one line to the user verbatim, then stop — no other action: vc-fix self-check: no blocking issues — ${obs.visible} observation(s) recorded (run /vc-self-check for detail)`;
  }
  // ─── ONE question per turn, and cleanup is not one of them (item 8) ──────────────────
  // The reproduction turn asked the operator THREE things at once: the diagnostic verdict, the
  // delivery offer, and "clean up vc-fix diagnostic files?" (an AskUserQuestion with three
  // options). Every question after the first competed with the one that mattered — the operator
  // answered the cleanup prompt and the delivery offer had to be re-asked on a later turn.
  //
  // Cleanup is now SILENT: it never asks, because it never needed to. The 24h age-cap in
  // `pruneOldDiagnostics` already reclaims leftovers unprompted at every session start (and
  // already refuses to delete a session holding an un-diagnosed finding), so the question only
  // ever offered to do sooner what happens anyway. Deleting without asking is not on the table
  // either — that would trade a nag for an unsanctioned destructive action. So the operator just
  // gets ONE line, and the artifact count rides along with it as information rather than a
  // decision. `--purge` / `purge-inactive` remain for an operator who wants to clear now.
  if (cleanupBlock) {
    const { sessions: totalSessions, files: totalFiles } = countArtifacts(dir);
    const note = `(${totalFiles} local diagnostic file(s) from ${totalSessions} session(s); auto-cleaned after 24h)`;
    reason = reason ? `${reason} ${note}` : null;
  }
  if (reason) process.stdout.write(JSON.stringify({ decision: "block", reason }));
}

// complete — an explicit "this skill/command finished its terminal step" signal, invoked
// by a skill as the LAST action of its final step (incl. an early BAIL / NOT-READY exit —
// a correct early exit is a completed run):
//   node "$CLAUDE_PLUGIN_ROOT/hooks/session-telemetry.mjs" complete --skill "<name>"
// It sets a persisted, one-shot marker (state.skillCompletePending) that the NEXT terminal
// Stop's cmdFinalize consumes to surface the clean line AT MOST ONCE per run — so a
// multi-turn skill's intermediate pauses (interview, "fill the files then done") never
// surface it. Because a Bash-invoked command receives NO hook stdin (no session_id), it
// targets the session whose .state.json was most recently modified — the active session —
// unless an explicit `--session <id>` is given. Never throws, never blocks; a no-op when
// capture is disabled (VC_FIX_DIAG_CAPTURE=off / selfDiagnostics:false) or when there is no
// session state yet; idempotent (re-running just refreshes the marker timestamp). NOTE: gated on
// captureEnabled ONLY — NOT on VC_FIX_DIAG_CONSENT, which gates SURFACING at finalize, not capture;
// the marker is still written under consent-off (the withheld clean line just never prints there).
function parseCompleteArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--skill") a.skill = argv[++i];
    else if (t === "--session") a.session = argv[++i];
  }
  return a;
}
// The most-recently-modified `<sid>.state.json` in the diagnostics dir → its sid. During an
// active skill run that session's state was just written by the last hook firing, so it is
// the active session. "" when the dir is absent/empty. Never throws.
//
// CAVEAT (bounded, cosmetic): with TWO concurrent sessions sharing one outputRoot, if the other
// session's hooks wrote AFTER this session's last hook but before this `complete` runs, the marker
// lands on the other session's state file. The marker now carries the RESOLVED sid, and finalize
// ignores a marker whose `sid` doesn't match the finalizing session (Finding 4), so a mis-landed
// marker cannot become the SOLE plugin-activity signal of an unrelated plain-dev session. Blast
// radius is now just: this session's own clean line may be skipped (its marker went to the other
// file) — a missing status line, never a false one, never any data loss, and findings/consent are
// independent of the marker. Pass `--session <id>` to target precisely when the id is known. (No
// session_id is available to a Bash-invoked command, hence the mtime heuristic.)
function newestSessionId(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return ""; }
  let best = "";
  let bestT = -Infinity;
  for (const f of entries) {
    if (!f.endsWith(".state.json")) continue;
    try {
      const t = statSync(join(dir, f)).mtimeMs;
      if (t > bestT) { bestT = t; best = f; }
    } catch { /* vanished / locked — skip */ }
  }
  return best ? best.replace(/\.state\.json$/, "") : "";
}
async function cmdComplete() {
  try {
    const a = parseCompleteArgs(process.argv.slice(3));
    const root = await resolveOutputRoot();
    if (!captureEnabled(root)) return; // no-op when capture is off
    const dir = join(root, ".vc-fix", "diagnostics");
    const sid = a.session || newestSessionId(dir);
    if (!sid) return; // no session state yet — nothing to mark
    const statePath = join(dir, `${sid}.state.json`);
    if (!existsSync(statePath)) return;
    const state = loadState(statePath, {}, sid);
    // Stamp the RESOLVED target sid into the marker so finalize can reject it if it is ever read by
    // a DIFFERENT session (the mtime-race guard — PR #143 review, Finding 4).
    state.skillCompletePending = { skill: a.skill || null, ts: nowIso(), sid };
    saveState(statePath, state);
  } catch {
    /* never throw / never block a tool */
  }
}

// obs — the plugin's OWN scripts report their OWN structured verdicts (VCST-5582 H).
//
// WHY THIS EXISTS. `verify-access.mjs` computes a full PASS/FAIL/WARN/SKIP table (`results[]`),
// renders it, and then THROWS IT AWAY — exiting 0 unless there is a hard FAIL. `discover-tracker.mjs`
// catches an HTTP 400 on the Bug field-contract scan, warns to stderr, writes `fields: {}` and exits
// 0. So the plugin literally computed "the Bug field contract was never scanned, /qa-bug will send
// unverified defaults" and no part of the self-diagnostics subsystem could ever learn it. The
// transcript-side capture (P1-6: toolUseResult.stderr) catches the same class from the outside; this
// is the inside channel, and it carries STRUCTURE (class/subject/code) instead of prose.
//
// Invoked exactly like `complete` — Bash, no hook stdin, so the session is resolved by the newest
// `.state.json` (or `--session <id>`) — but the payload is a JSON ARRAY on stdin, so one spawn covers
// a whole readiness table and no argv quoting is involved (Windows-safe):
//
//   echo '[{"class":"self_reported_warn","subject":"tracker_field_contract","code":"HTTP_4XX"}]' \
//     | node "$CLAUDE_PLUGIN_ROOT/hooks/session-telemetry.mjs" obs --skill project-init
//
// Gated on captureEnabled ONLY (like `complete`): consent gates SURFACING, never capture. Never
// throws, never blocks, no-op when capture is off or no session state exists yet. Each record goes
// through recordObs, so the closed class vocabulary, the slugified subject, secret redaction and the
// caps all apply to a script-supplied record exactly as to an in-process one.
function parseObsArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--session") a.session = argv[++i];
    else if (t === "--skill") a.skill = argv[++i];
    else if (t === "--source") a.source = argv[++i];
  }
  return a;
}
async function cmdObs(raw) {
  try {
    const a = parseObsArgs(process.argv.slice(3));
    const root = await resolveOutputRoot();
    if (!captureEnabled(root)) return;
    const dir = join(root, ".vc-fix", "diagnostics");
    const sid = a.session || newestSessionId(dir);
    if (!sid) return; // no session state yet — nothing to attach to
    const statePath = join(dir, `${sid}.state.json`);
    if (!existsSync(statePath)) return;
    let payload;
    try { payload = JSON.parse(raw); } catch { return; }
    const list = Array.isArray(payload) ? payload : [payload];
    if (!list.length) return;
    const state = loadState(statePath, {}, sid);
    const jsonl = join(dir, `${sid}.jsonl`);
    let n = 0;
    for (const o of list) {
      if (!o || typeof o !== "object") continue;
      if (recordObs(jsonl, state, { ...o, skill: o.skill ?? a.skill ?? null, source: o.source ?? a.source ?? "script" })) n++;
    }
    // Persist the dedup/cap bookkeeping. A racing hook process may clobber this file, which is why
    // the jsonl APPEND above is the source of truth: cmdFinalize re-reads the appended lines via
    // foldObsFromJsonl, so a lost state write costs nothing.
    saveState(statePath, state);
    if (n) process.stdout.write(`recorded ${n} observation(s)\n`);
  } catch {
    /* never throw / never block a tool */
  }
}

// purge-inactive — MANUAL cleanup, run by the model (via Bash) after the user confirms
// the cleanup offer. NOT gated by captureEnabled: it's an explicit, consented action.
// Flags: --keep <sid> (never delete this session's files), --dir <abs> (diagnostics dir;
// defaults to <outputRoot>/.vc-fix/diagnostics), --all (ignore the 1h inactivity floor —
// delete every non-kept artifact regardless of mtime). Prints a human-readable count.
function parsePurgeArgs(argv) {
  const a = {};
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--keep") a.keep = argv[++i];
    else if (t === "--dir") a.dir = argv[++i];
    else if (t === "--all") a.all = true;
    // --force: also delete a session whose recorded finding was never diagnosed. Without it, such
    // a session is RETAINED (P1-10) — deleting un-analysed evidence destroys the only copy.
    else if (t === "--force") a.force = true;
  }
  return a;
}
async function cmdPurgeInactive() {
  const a = parsePurgeArgs(process.argv.slice(3));
  let dir = a.dir;
  if (!dir) {
    const root = await resolveOutputRoot();
    dir = join(root, ".vc-fix", "diagnostics");
  }
  // --all ⇒ pass a far-future nowMs so the mtime floor never keeps anything.
  const set = collectInactiveArtifacts(dir, a.keep || "", a.all ? Number.MAX_SAFE_INTEGER : Date.now(), { force: Boolean(a.force) });
  let removed = 0;
  for (const p of set.files) {
    try {
      unlinkSync(p);
      removed++;
    } catch {
      /* vanished / locked — skip */
    }
  }
  process.stdout.write(`Removed ${removed} inactive vc-fix diagnostic file(s) from ${dir}\n`);
  // Say what was KEPT and why. A silent retention would read as a failed purge; naming it tells the
  // operator there is un-analysed evidence and how to look at it (or force it away).
  if (set.protectedSessions.size) {
    process.stdout.write(
      `Kept ${set.protectedSessions.size} session(s) holding an un-diagnosed finding: ${[...set.protectedSessions].join(", ")}\n` +
        `  Diagnose with /vc-self-check <session-id>, or re-run with --force to delete anyway.\n`,
    );
  }
}

// ─── entry point ─────────────────────────────────────────────────────────────
(async () => {
  try {
    const sub = process.argv[2];
    const raw = readStdin();
    let ev = {};
    if (raw && raw.trim()) {
      try {
        ev = JSON.parse(raw);
      } catch {
        ev = {};
      }
    }
    // Resolve the shared error taxonomy before dispatch (pure module, swallowed on failure — a
    // partial install degrades every observation's `code` to UNKNOWN, never breaks the hook).
    await loadErrorClassifier();
    if (sub === "init") await cmdInit(ev);
    else if (sub === "prompt") await cmdPrompt(ev);
    else if (sub === "record" || sub === "agentstop") await cmdScan(ev);
    else if (sub === "finalize") await cmdFinalize(ev);
    else if (sub === "complete") await cmdComplete();
    else if (sub === "obs") await cmdObs(raw);
    else if (sub === "purge-inactive") await cmdPurgeInactive();
    // Unknown subcommand: no-op.
  } catch (err) {
    process.stderr.write(`session-telemetry hook error: ${err?.message ?? err}\n`);
  }
  process.exit(0);
})();
