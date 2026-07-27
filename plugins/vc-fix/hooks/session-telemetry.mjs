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
 *    agent span is tagged: success | recovered (self-corrected → NOT escalated) |
 *    degraded (a struggle sub-signal fired) | failed (a blocking, unrecovered
 *    error) | silent_suspect (closed clean but the oracle's expected output is
 *    absent). error ≠ failure; the numeric `>= 6` gate is GONE.
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
 *
 *  • DECISION MOMENT — every finalize records a `decision` object on its `finalize`
 *    jsonl record: TERMINAL → { verdict:"clean|flagged", pluginActivity, freshCount,
 *    flaggedTotal, surfaced, suppressReason }; CHECKPOINT → { verdict:"deferred",
 *    pendingSubagents, surfaced:false, suppressReason:"subagent-running" }. This is
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
};
// Bound the per-span op history so a long-lived command span can't grow its
// state.json without limit (the struggle detectors only need a recent window;
// span.opCount / span.sawDecisive carry the whole-span aggregates they need).
const OPS_CAP = 120;
const FLAGGED_CAP = 200; // hard backstop on distinct flagged signatures (M2 — see emitSpan)

// ─── signal counts ───────────────────────────────────────────────────────────
const SIGNAL_CLASSES = ["tool_error", "permission_denied", "hook_failure", "stop_bail"];
const zeroCounts = () => ({ tool_error: 0, permission_denied: 0, hook_failure: 0, stop_bail: 0, tool_calls: 0, agent_calls: 0 });

const PERMISSION_DENIED_RE = /\b(permission denied|denied permission|requested permissions|user (?:denied|declined|rejected)|operation not permitted|not allowed to)\b/i;
const HOOK_FAILURE_RE = /(error TS\d{3,}|\btsc\b[^\n]*error|PostToolUse hook[^\n]*fail|hook[^\n]*error|npm error|command failed with exit code)/i;
const BAIL_RE = /(FIX_STATUS:\s*FAILED|\bBAIL(?:_CLASS)?\b|out-of-auto-fix-scope|hand(?:ed)?[ -]off|STOP\s*[—-]\s*hand)/;

// Plugin slash-commands we open a COMMAND span for (acceptance criterion: a
// command session is fully traced, not just skill-attributed). `/vc-feedback` is
// deliberately ABSENT — cmdPrompt records a feedback record and returns before
// COMMAND_RE, so it never opens a command span.
const PLUGIN_COMMANDS = ["project-init", "qa-bug", "qa-fix", "qa-verify-fix", "qa-monitoring", "qa-env-check", "vc-self-check", "vc-docs"];
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
}
// Record a child op on its parent span for struggle detection. Keeps a bounded
// RING (last OPS_CAP) plus whole-span aggregates (opCount, sawDecisive) so a
// long-lived command span's state.json stays small and low_yield stays correct.
function pushOp(span, op) {
  if (!span) return;
  span.opCount = (span.opCount ?? 0) + 1;
  if (DECISIVE_RE.test(op.tool)) span.sawDecisive = true;
  span.ops.push(op);
  if (span.ops.length > OPS_CAP) span.ops.shift();
}
// Session-level buffers for ops/details that had NO parent span (parentId:null) — see freshState.
// A synthesized command span (Fix 2) adopts these so classify()/allErrorsRecovered treat the
// blind-spot run exactly like a real span (code review #1).
function recordOrphanOp(state, op) {
  if (!state.orphanOps) state.orphanOps = [];
  state.orphanOps.push(op);
  if (state.orphanOps.length > OPS_CAP) state.orphanOps.shift();
}
function recordOrphanDetail(state, cls, text) {
  if (!state.orphanDetails) state.orphanDetails = [];
  if (state.orphanDetails.length < 25) state.orphanDetails.push({ cls, snippet: snippet(text) });
}
function markExpected(span, blob) {
  if (!span || span.sawExpected) return;
  const markers = EXPECTED_OUTPUT[span.name];
  if (!markers) {
    span.sawExpected = true; // no oracle entry ⇒ never silent_suspect
    return;
  }
  if (markers.some((re) => re.test(blob))) span.sawExpected = true;
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

  // stall — a single op ran abnormally long.
  if (ops.some((o) => (o.durationMs || 0) > T.STALL_MS)) struggle.push("stall");

  // low_yield — many tool ops (whole-span count) with NO progress: neither a decisive op
  // nor the skill's expected output (sawExpected). A read-only skill that produced its
  // readiness/report output is not low-yield even with zero decisive op (research §5).
  if ((span.opCount ?? ops.length) >= T.LOW_YIELD_OPS && !span.sawDecisive && !span.sawExpected) struggle.push("low_yield");

  return [...new Set(struggle)];
}

// Self-correction test — keyed on the SPECIFIC invocation (tool + arg_hash), not
// the tool NAME: `Read(A)` failing then `Read(B)` succeeding is NOT a recovery of
// A (different target). An errored key is "recovered" only if the LAST op of that
// exact key is a success (the same thing was retried and eventually worked).
function allErrorsRecovered(span) {
  const lastStatus = new Map();
  const everErrored = new Set();
  for (const o of span.ops || []) {
    const k = `${o.tool}|${o.arg_hash}`;
    lastStatus.set(k, o.status);
    if (o.status === "error") everErrored.add(k);
  }
  if (!everErrored.size) return false;
  for (const k of everErrored) if (lastStatus.get(k) !== "ok") return false;
  return true;
}

function classify(span) {
  const s = span.signals;
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
  if (escalationUnit && !/vc-self-check/i.test(span.name)) state.sawPluginSpan = true;
  if (escalationUnit && rec.outcome !== "success" && rec.outcome !== "recovered" && !/vc-self-check/i.test(span.name)) {
    const sig = hash(`${span.kind}|${span.name}|${rec.outcome}|${topSignal(span)}`);
    // Dedup by signature (+ hard cap): `flagged` is re-serialized WHOLE into every terminal `finalize`
    // record, and Stop fires each turn, so an uncapped per-occurrence push grew `<sid>.jsonl` ~O(F×T)
    // over a long session (PR #143 R2 M2). The tail-trigger + diagnostician already dedup by signature,
    // so only DISTINCT signatures carry information — keep the first occurrence of each.
    if (!state.flagged.some((f) => f.signature === sig) && state.flagged.length < FLAGGED_CAP) {
      state.flagged.push({ id: span.id, kind: span.kind, name: span.name, outcome: rec.outcome, struggle: rec.struggle, signature: sig });
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
  try { size = statSync(transcriptPath).size; } catch { state.scanErrors = (state.scanErrors || 0) + 1; return; }

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
    try { content = readFileSync(transcriptPath, "utf8"); } catch { state.scanErrors = (state.scanErrors || 0) + 1; return; }
    const parts = content.split("\n");
    const allComplete = parts.slice(0, Math.max(0, parts.length - 1)); // complete lines only
    if (size < state.scannedBytes) state.processedLines = 0; // rotated → old cursor is meaningless
    lines = allComplete.slice(Math.min(state.processedLines || 0, allComplete.length));
    state.processedLines = allComplete.length;
    const lastNl = content.lastIndexOf("\n");
    state.scannedBytes = lastNl >= 0 ? Buffer.byteLength(content.slice(0, lastNl + 1), "utf8") : 0;
  } else if (size === state.scannedBytes) {
    return; // nothing new appended
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
    } catch { state.scanErrors = (state.scanErrors || 0) + 1; return; }
    const lastNl = text.lastIndexOf("\n");
    if (lastNl < 0) return; // bytes appended but no complete line yet — do not advance
    lines = text.slice(0, lastNl).split("\n"); // all NEW complete lines
    state.scannedBytes += Buffer.byteLength(text.slice(0, lastNl + 1), "utf8"); // past the '\n'
    state.processedLines += lines.length;
  }

  const innerParent = () => state.currentSkill || state.currentCommand || null;
  const attributeSignal = (cls, text, extra) => {
    const p = innerParent();
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
    if (ev.isSidechain === true) continue; // sub-agent's own transcript — not our ops
    const ts = typeof ev.timestamp === "string" ? ev.timestamp : nowIso();
    state.lastScanTs = ts; // newest event ts seen — the session's own clock (chronological scan)
    const msg = ev.message ?? ev;
    const content = msg?.content ?? ev?.content;
    const items = Array.isArray(content) ? content : content != null ? [content] : [];
    const parent = innerParent();
    if (parent) parent.lastTs = ts;

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
        if (parent) markExpected(parent, `${name} ${inputStr.slice(0, 500)}`);
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
          if (/vc-self-check/i.test(skillName)) state.selfCheckSeen = true;
        } else if (name === "Task" || name === "Agent") {
          const agentType = String(item.input?.subagent_type ?? item.input?.agentType ?? "unknown");
          if (parent) parent.signals.agent_calls++; // the op is pushed once, when the agent span CLOSES
          state.totals.agent_calls++;
          const sp = newSpan(state, "agent", agentType, ts, innerParent()?.id ?? null);
          sp.arg_hash = arg_hash;
          state.openOps.set(item.id, sp);
        } else {
          if (parent) parent.signals.tool_calls++;
          state.totals.tool_calls++;
          const sp = newSpan(state, "tool", name, ts, innerParent()?.id ?? null);
          sp.arg_hash = arg_hash;
          state.openOps.set(item.id, sp);
        }
      } else if (type === "tool_result") {
        const id = item.tool_use_id;
        const body = textOf(item.content);
        // A signal is recorded ONLY from a genuine FAILURE result (`is_error === true`).
        // A SUCCESSFUL tool whose body merely CONTAINS error-like text — grepping a
        // build log, reading source that says "npm error"/"permission denied" — is NOT a
        // failure (A-F1/D1: no false `failed` from tool output or narration). An actual
        // error is sub-typed permission_denied / hook_failure / tool_error.
        const cls = item.is_error === true
          ? (PERMISSION_DENIED_RE.test(body) ? "permission_denied" : HOOK_FAILURE_RE.test(body) ? "hook_failure" : "tool_error")
          : null;
        const sp = id ? state.openOps.get(id) : null;
        const p = innerParent();
        // Any result (success OR failure) can carry an expected-output marker — a
        // create_pull_request response or a sub-agent Task return "opened PR pull/42".
        // This is what keeps a command/skill that delivers via a sub-agent (whose
        // internal ops are in a skipped sidechain) from being false `silent_suspect`.
        if (p) markExpected(p, body);
        if (sp) {
          state.openOps.delete(id);
          if (cls) pushDetail(sp, cls, body, { toolUseId: id });
          emitSpan(jsonlPath, state, sp, ts);
          // Roll the op onto the parent ONLY if it is still the span that opened it
          // (A-F7: a late result must not be misattributed to a different skill that
          // has opened since). The tool span itself always carries its own signal.
          const durationMs = Date.parse(ts) - Date.parse(sp.startTs) || 0;
          if (p && p.id === sp.parentId) {
            pushOp(p, { tool: sp.name, arg_hash: sp.arg_hash, status: cls ? "error" : "ok", ts, durationMs });
            if (cls) pushDetail(p, cls, body);
          } else if (sp.parentId == null) {
            // Parentless op (no command/skill span open — the Fix 2 blind spot). Buffer it so a
            // synthesized command span at Stop can adopt it and apply the SAME self-correction test
            // (allErrorsRecovered) a real span's children get — so a probe that errored then retried
            // to success is `recovered`, not a spurious `failed` from the cumulative totals (#1).
            recordOrphanOp(state, { tool: sp.name, arg_hash: sp.arg_hash, status: cls ? "error" : "ok", cls: cls || null, ts, durationMs });
            if (cls) recordOrphanDetail(state, cls, body);
          }
          if (cls) state.totals[cls]++;
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
        if (BAIL_RE.test(b)) { if (parent) pushDetail(parent, "stop_bail", b); state.totals.stop_bail++; }
      }
    }

    // Top-level string content = a system / hook echo (e.g. the `tsc` PostToolUse
    // output), not user prose — keep hook_failure detection here (the tsc-on-every-Edit
    // cross-cutting pattern), but not permission_denied (denials arrive as tool_results).
    // NOT tied to a tool_use_id, so attributeSignal() below has no op to attach this to —
    // classify()'s recovery check can therefore never mark it `recovered` (see the NOTE
    // there). A transient hook note that's clean on the very next Edit still forces
    // `failed` for this span; that's a known, accepted asymmetry vs the tool_result path.
    if (typeof content === "string") {
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
  for (const f of entries) {
    // Never the CURRENT session's own artifacts (it's just starting). Includes DELIVERY-<sid>-*
    // for symmetry with collectInactiveArtifacts — else a resume >24h after start could reap this
    // session's own delivery draft.
    if (sid && (f === `${sid}.jsonl` || f === `${sid}.state.json` || f.startsWith(`DIAG-${sid}-`) || f.startsWith(`DELIVERY-${sid}-`))) continue;
    // Only OUR OWN artifact shapes — a stray file a user dropped here is left alone.
    const isOurs = f.endsWith(".jsonl") || f.endsWith(".state.json") || (f.startsWith("DIAG-") && f.endsWith(".md")) || (f.startsWith("DELIVERY-") && f.endsWith(".md"));
    if (!isOurs) continue;
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

// Inactivity floor for the cleanup OFFER: an artifact belongs to an "old inactive
// session" only if it is NOT the current session's AND its mtime is older than this —
// so a still-LIVE parallel session (which writes its jsonl/state frequently) is never
// offered up for deletion. Distinct from the age-cap (24h): the offer surfaces even for
// <24h leftovers, the age-cap only silently reclaims >24h ones.
const INACTIVE_MS = 60 * 60 * 1000; // 1h

// Collect our-own artifacts that belong to OTHER, now-inactive sessions. Returns
// { files:[abs path], sessions:Set<sid> }. `nowMs` drives the mtime cutoff
// (nowMs - INACTIVE_MS); pass a far-future nowMs to ignore the floor (purge --all).
// Never throws.
function collectInactiveArtifacts(dir, sid, nowMs) {
  const out = { files: [], sessions: new Set() };
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
    if (/vc-self-check/i.test(m[1])) state.selfCheckSeen = true;
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

async function cmdFinalize(ev) {
  const { root, dir, sid, jsonl, state: statePath } = await paths(ev);
  if (!captureEnabled(root)) return;
  ensureDir(dir);
  const state = loadState(statePath, ev, sid);
  const transcriptPath = ev.transcript_path ?? state.transcriptPath;
  scanTranscript(jsonl, transcriptPath, state);
  state.transcriptPath = transcriptPath;

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
  // (state.skillCompletePending = null) later, at line ~1243, on this same terminal Stop.
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

  // Tail-based escalation: keep only NEW non-success signatures we haven't already
  // surfaced. (vc-self-check's own spans were never flagged — emitSpan drops them.)
  const uniqueFresh = [];
  const seen = new Set();
  for (const f of state.flagged) {
    if (state.seenSignatures.includes(f.signature) || seen.has(f.signature)) continue;
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
  const flaggedRun = uniqueFresh.length > 0 || negFeedback;
  const shouldPrompt = !consentOff && !stopHookActive && !state.promptedThisTurn && !state.selfCheckSeen && flaggedRun;
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
  const cleanBlock = !lineOff && !consentOff && !stopHookActive && !state.promptedThisTurn && !state.selfCheckSeen && !flaggedRun && cleanEligible && !state.scanErrors;
  // Cleanup offer (once per session): leftover artifacts from OTHER inactive sessions were detected
  // at init. It ALWAYS rides a DIAGNOSTIC surface — it fires ONLY when a findings block
  // (`shouldPrompt`) or the clean line (`cleanBlock`) is ALSO firing this turn, and is APPENDED
  // after it. So the ordering the operator sees is: diagnostic verdict FIRST (clean → "no issues";
  // findings → run /vc-self-check + report), THEN the cleanup offer. It NEVER surfaces standalone:
  //   • not on a plain dev turn with no plugin activity (would pop a cleanup dialog out of nowhere,
  //     with no verdict to justify it — the age-cap silently reclaims >24h leftovers, and the next
  //     real plugin session offers cleanup after its verdict). [was `|| !pluginActivity` — removed
  //     per operator feedback 2026-07-22: "deletion should come AFTER the no-problems check; if
  //     problems are found, self-analysis + feedback first, THEN the cleanup offer".]
  //   • not during an intermediate pause of a still-running skill (`awaiting-completion`: neither
  //     surfaces, so cleanup doesn't either — no MID-onboarding interruption).
  // Suppressed by the kill switch; once per session via `cleanupOffered` (persisted) + `promptedThisTurn`.
  const cleanupPending = Boolean(state.cleanupPending) && !state.cleanupOffered;
  const cleanupBlock = cleanupPending && !consentOff && !stopHookActive && !state.promptedThisTurn && (shouldPrompt || cleanBlock);
  const surfaced = shouldPrompt || cleanBlock || cleanupBlock;
  // A durable, deterministic audit of every decision moment — greppable with
  // `"type":"finalize"` / `decision` in the session jsonl. This is how "when did the hook
  // run and what did it decide" stays observable WITHOUT printing a line on every turn.
  const decision = {
    verdict: flaggedRun ? "flagged" : (state.scanErrors ? "degraded-collector" : "clean"),
    pluginActivity,
    freshCount: uniqueFresh.length,
    negativeFeedback: negFeedback, // did a /vc-feedback 👎 flag this run (may be true with freshCount:0)
    flaggedTotal: state.flagged.length,
    scanErrors: state.scanErrors || 0, // >0 ⇒ transcript scan hit a read error; clean line withheld (OBS1)
    surfaced, // did we resume + print a visible line this turn
    cleanupOffered: cleanupBlock, // did we surface the stale-artifact cleanup offer this turn
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
    flagged: state.flagged.map((f) => ({ name: f.name, kind: f.kind, outcome: f.outcome, struggle: f.struggle, signature: f.signature })),
    anySkillSeen: Boolean(state.anySkillSeen),
    feedbackCount: state.feedbackCount ?? 0,
    testEnv: state.testEnv ?? process.env.TEST_ENV ?? null, // enriched from tool args when not exported to the hook env
    decision,
  });

  // Set the one-shot guard for ANY block we emit this turn (findings / clean-line / cleanup),
  // so a repeat finalize in the same turn (incl. the resumed print-turn's own Stop) never
  // re-blocks. `cleanupOffered` is persisted (NOT reset per turn) → the offer is once per session.
  if (surfaced) state.promptedThisTurn = true;
  if (cleanupBlock) state.cleanupOffered = true;
  if (cleanBlock && fallbackClean) state.cleanLineOffered = true; // legacy fallback: once per session
  if (shouldPrompt) {
    for (const f of uniqueFresh) state.seenSignatures.push(f.signature);
    state.negativeFeedback = false; // one-shot: the 👎 trigger is spent once vc-self-check is armed
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
  let reason = null;
  if (shouldPrompt) {
    // Two trigger sources: flagged spans and/or a 👎. Describe whichever applies (a 👎-only run has an
    // empty uniqueFresh, so guard the summary) — the instruction to run vc-self-check is identical.
    const summary = uniqueFresh.map((f) => `${f.outcome} in /${f.name}${f.struggle?.length ? ` (${f.struggle.join(",")})` : ""}`).join("; ");
    const trigger = uniqueFresh.length
      ? `vc-fix self-diagnostics flagged this run (${summary})`
      : "you gave vc-fix negative feedback (👎) this session";
    reason = `${trigger}. Silently run the vc-self-check skill (Skill tool, argument "latest"), then print ONE line — the finding count + DIAG path — and stop. Nothing is sent anywhere.`;
  } else if (cleanBlock) {
    reason = "Print this one line to the user verbatim, then stop — no other action: vc-fix self-check: no plugin issues detected";
  }
  if (cleanupBlock) {
    const script = join(pluginRoot(), "hooks", "session-telemetry.mjs");
    // Option 1 (all incl. this) uses `--all` (ignores the 1h floor, omits --keep) → truly everything.
    // Option 2 (all except this) OMITS `--all` so the 1h inactivity floor still applies — it deletes
    // only INACTIVE others and spares this session AND any still-live PARALLEL session (<1h fresh).
    const purgeAll = `node "${script}" purge-inactive --all --dir "${dir}"`;
    const purgeOthers = `node "${script}" purge-inactive --keep "${sid}" --dir "${dir}"`;
    const { sessions: totalSessions, files: totalFiles } = countArtifacts(dir);
    const cleanup =
      `vc-fix's local .vc-fix/diagnostics/ folder holds ${totalFiles} diagnostic file(s) from ${totalSessions} session(s). ` +
      `Ask the user via AskUserQuestion — "Clean up vc-fix diagnostic files?" — with THREE options, then run the matching Bash command and report the count:\n` +
      `• "Delete all sessions (incl. this one)" → ${purgeAll}\n` +
      `• "Delete all except this session (spares a live parallel session)" → ${purgeOthers}\n` +
      `• "Keep them (auto-deleted after 24h)" → do nothing.\n` +
      `This only removes vc-fix's OWN diagnostic artifacts — never your code.`;
    reason = reason ? `${reason}\n\nAlso — ${cleanup}` : cleanup;
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
  const set = collectInactiveArtifacts(dir, a.keep || "", a.all ? Number.MAX_SAFE_INTEGER : Date.now());
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
    if (sub === "init") await cmdInit(ev);
    else if (sub === "prompt") await cmdPrompt(ev);
    else if (sub === "record" || sub === "agentstop") await cmdScan(ev);
    else if (sub === "finalize") await cmdFinalize(ev);
    else if (sub === "complete") await cmdComplete();
    else if (sub === "purge-inactive") await cmdPurgeInactive();
    // Unknown subcommand: no-op.
  } catch (err) {
    process.stderr.write(`session-telemetry hook error: ${err?.message ?? err}\n`);
  }
  process.exit(0);
})();
