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
 *    mid-task. So finalize first checks `ev.background_tasks` (still-running bg
 *    tasks/sub-agents) — with a fallback to any still-open agent op in our own state
 *    — and if anything is pending it treats the Stop as a CHECKPOINT: it records a
 *    durable `{verdict:"deferred"}` decision to the jsonl and RETURNS without
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
 *   - GATED on capture: init/prompt/record/agentstop/finalize run ONLY when the
 *     output root carries a project-profile.json with `selfDiagnostics: true`.
 *     Absent profile / absent field / any non-true value ⇒ full no-op (nothing
 *     read, nothing written, no `.vc-fix/`). (Tier-3 DELIVERY consent is a separate
 *     `feedback.mode` gate read by deliver.mjs — never here.)
 *   - Writes ONLY under <outputRoot>/.vc-fix/diagnostics/ (outputRoot =
 *     VC_FIX_HOME || cwd, matching skills/project-init/lib/paths.mjs). NEVER under
 *     the plugin install dir. `.vc-fix/` is gitignored.
 *   - Never throws, never blocks a tool, never writes a secret (Authorization/
 *     token/password/PAN redacted from every snippet). Always exits 0.
 *   - The auto-diagnosis trigger AND the visible line can both be suppressed with
 *     VC_FIX_DIAG_CONSENT=off (kill switch) — capture still runs; nothing is surfaced.
 *     Independently, VC_FIX_DIAG_LINE=off silences ONLY the clean "no plugin issues
 *     detected" line (default ON on a terminal plugin turn) while leaving the findings
 *     trigger intact. The kill switch overrides both.
 *
 * NOTE: this collector is the canonical `plugins/vc-fix/` copy. The `.claude/`
 * mirror predates VCST-5509 and is intentionally NOT kept in lock-step here.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

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
const REDACTIONS = [
  [/\b(authorization|bearer)\b\s*[:=]?\s*\S+/gi, "$1 «redacted»"],
  [/\b(token|api[_-]?key|secret|password|passwd|pwd)\b\s*[:=]\s*\S+/gi, "$1=«redacted»"],
  [/\beyJ[A-Za-z0-9._-]{16,}/g, "«jwt»"], // JWTs
  [/\b\d(?:[ -]?\d){12,18}\b/g, "«pan»"], // card numbers
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "«gh-token»"], // GitHub tokens
];
function redact(s) {
  let out = String(s ?? "");
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}
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
const EXPECTED_OUTPUT = {
  "qa-bug": [/reports[\/\\]bugs[\/\\]/i, /createJiraIssue|create_issue|work item|filed\b/i, BAIL_OK_RE],
  "qa-fix": [/create_pull_request|gh pr create|pull\/\d+|PR #?\d+|opened a? PR/i, BAIL_OK_RE],
  "qa-verify-fix": [/transitionJiraIssue|update_issue|READY FOR TEST|testing|verified|reproduc/i, BAIL_OK_RE],
  "qa-monitoring": [/reports[\/\\]monitoring[\/\\]|signature|dedup|no (?:new )?(?:errors|signatures)/i, BAIL_OK_RE],
  "qa-env-check": [/readiness|env:check|✅|✓|PASS|FAIL|table/i],
  "project-init": [/project-profile\.json|\.mcp\.json|\.env\.|readiness|verify-access/i],
  "vc-docs": [/./], // any activity counts — a lookup skill
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
  LOW_YIELD_OPS: 20, // ≥20 tool ops in a span with zero decisive op
  SILENT_MIN_OPS: 2, // a skill/command must have done ≥2 ops before it can be silent_suspect
};
// Bound the per-span op history so a long-lived command span can't grow its
// state.json without limit (the struggle detectors only need a recent window;
// span.opCount / span.sawDecisive carry the whole-span aggregates they need).
const OPS_CAP = 120;

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
  const recovered = blockingErr && allErrorsRecovered(span);
  // A blocking error is a `failed` outcome UNLESS the specific failed invocation was
  // self-corrected (retried to success). permission_denied / hook_failure that were
  // recovered are S3 `recovered`, matching the oracle §1a / §2 rows — they only hard-
  // block when they never resolved. NOTE: this recovery check is keyed on `span.ops`
  // (tool+arg_hash pairs from tool_use/tool_result), so it can only ever apply to a
  // hook_failure surfaced via a tool_result tied to a tool_use_id. A hook_failure
  // detected from bare top-level string content (the untied PostToolUse echo path,
  // e.g. a `tsc` note after an Edit — see the scanTranscript comment above the
  // `attributeSignal("hook_failure", …)` call) has no paired op to resolve against, so
  // it can never classify as `recovered` — it always forces `failed` for the span it
  // occurred in. This is intentional fail-toward-escalation (no false "recovered" on a
  // signal we can't actually observe resolving), not a design oversight.
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
    state.flagged.push({ id: span.id, kind: span.kind, name: span.name, outcome: rec.outcome, struggle: rec.struggle, signature: sig });
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
  let lines;
  try {
    const content = readFileSync(transcriptPath, "utf8");
    const parts = content.split("\n");
    lines = parts.slice(0, Math.max(0, parts.length - 1)); // complete lines only
  } catch {
    return;
  }

  const innerParent = () => state.currentSkill || state.currentCommand || null;
  const attributeSignal = (cls, text, extra) => {
    const p = innerParent();
    if (p) pushDetail(p, cls, text, extra);
    state.totals[cls] = (state.totals[cls] ?? 0) + 1;
  };

  for (let i = state.processedLines; i < lines.length; i++) {
    state.processedLines = i + 1;
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
        const arg_hash = hash(redact(JSON.stringify(item.input ?? {})).slice(0, 4000));
        if (parent) markExpected(parent, `${name} ${redact(JSON.stringify(item.input ?? {})).slice(0, 500)}`);

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
          if (p && p.id === sp.parentId) {
            pushOp(p, { tool: sp.name, arg_hash: sp.arg_hash, status: cls ? "error" : "ok", ts, durationMs: Date.parse(ts) - Date.parse(sp.startTs) || 0 });
            if (cls) pushDetail(p, cls, body);
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

function freshState(ev, sid) {
  return {
    sid,
    spanSeq: 0,
    processedLines: 0,
    transcriptPath: ev.transcript_path ?? null,
    currentCommand: null,
    currentSkill: null,
    openOps: new Map(), // tool_use_id → open tool/agent span
    totals: zeroCounts(),
    spanCounts: {},
    flagged: [], // non-success/recovered spans this session
    seenSignatures: [], // fingerprints already surfaced to the diagnostician
    feedbackCount: 0,
    anySkillSeen: false,
    sawPluginSpan: false, // did any plugin skill/command span close this session (finalize `decision`)
    selfCheckSeen: false,
    promptedThisTurn: false,
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
      j.sid = j.sid || sid;
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
// Capture gate — telemetry runs ONLY with `selfDiagnostics === true` in the
// output-root profile. Absent/false ⇒ full no-op. (feedback.mode gates DELIVERY,
// not capture — read by deliver.mjs, never here.)
function selfDiagnosticsEnabled(root) {
  try {
    return readProfile(root)?.selfDiagnostics === true;
  } catch {
    return false;
  }
}

// ─── subcommands ─────────────────────────────────────────────────────────────
async function cmdInit(ev) {
  const { root, dir, sid, jsonl, state } = await paths(ev);
  if (!selfDiagnosticsEnabled(root)) return;
  ensureDir(dir);
  appendRecord(jsonl, {
    type: "session_start",
    sessionId: sid,
    ts: nowIso(),
    pluginVersion: readPluginVersion(),
    testEnv: process.env.TEST_ENV ?? null,
    projectType: readProjectType(root),
    cwd: process.cwd(),
    transcriptPath: ev.transcript_path ?? null,
    source: ev.source ?? null,
  });
  saveState(state, freshState(ev, sid));
}

// UserPromptSubmit — open a COMMAND span for a plugin slash-command, or record a
// `/vc-feedback` verdict. This is what makes a COMMAND session (not just a Skill
// invocation) fully traced.
async function cmdPrompt(ev) {
  const { root, dir, sid, jsonl, state: statePath } = await paths(ev);
  if (!selfDiagnosticsEnabled(root)) return;
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
  if (!selfDiagnosticsEnabled(root)) return;
  ensureDir(dir);
  const state = loadState(statePath, ev, sid);
  const transcriptPath = ev.transcript_path ?? state.transcriptPath;
  scanTranscript(jsonl, transcriptPath, state);
  state.transcriptPath = transcriptPath;
  saveState(statePath, state);
}

async function cmdFinalize(ev) {
  const { root, dir, sid, jsonl, state: statePath } = await paths(ev);
  if (!selfDiagnosticsEnabled(root)) return;
  ensureDir(dir);
  const state = loadState(statePath, ev, sid);
  const transcriptPath = ev.transcript_path ?? state.transcriptPath;
  scanTranscript(jsonl, transcriptPath, state);
  state.transcriptPath = transcriptPath;

  // ─── CHECKPOINT vs TERMINAL (subagent-timing fix) ───────────────────────────
  // `Stop` fires at the end of EVERY turn — including a turn that only handed work
  // to a background sub-agent and is now waiting. That sub-agent's work lives in a
  // sidechain the scanner skips, so finalizing here would judge an INCOMPLETE
  // session and (worse) print a "no plugin issues" verdict mid-task. So: if any
  // background task is still running (`ev.background_tasks`) OR any agent op is
  // still open in our own reconstructed state (fallback when the field is absent),
  // treat this Stop as a CHECKPOINT — record a durable `deferred` decision to the
  // jsonl (greppable), but DON'T drain openOps, DON'T close the trailing skill/
  // command, DON'T surface a line, DON'T run diagnostics. The open spans/ops carry
  // over so the TERMINAL Stop (once the sub-agent has returned) does the real work.
  const bgTasks = Array.isArray(ev.background_tasks) ? ev.background_tasks : [];
  let openAgents = 0;
  for (const [, sp] of state.openOps) if (sp && sp.kind === "agent") openAgents++;
  const pendingBg = bgTasks.length > 0 || openAgents > 0;
  const stopHookActive = ev.stop_hook_active === true;
  if (pendingBg) {
    const pendingSubagents = bgTasks.length || openAgents;
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
  //   • CLEAN    → resume ONCE to print a "no plugin issues detected" line by DEFAULT (on a
  //     TERMINAL Stop that had real plugin activity), a deliberate one-extra-turn cost. Silence
  //     it with VC_FIX_DIAG_LINE=off. The `decision` record below stays the free durable audit
  //     regardless of whether a line was printed.
  const consentOff = /^(off|0|false|no)$/i.test(process.env.VC_FIX_DIAG_CONSENT || "");
  const lineOff = /^(off|never|0|false|no)$/i.test(process.env.VC_FIX_DIAG_LINE || "");
  // `!stopHookActive` is a belt-and-suspenders guard alongside `promptedThisTurn`: the Stop that
  // fires from OUR OWN resume-turn carries stop_hook_active:true, so neither the findings block
  // nor the clean line re-fires and no resume loop can form.
  const shouldPrompt = !consentOff && !stopHookActive && !state.promptedThisTurn && !state.selfCheckSeen && uniqueFresh.length > 0;
  const pluginActivity = Boolean(state.sawPluginSpan) || Boolean(state.anySkillSeen);
  // Clean line (default ON): only on a clean TERMINAL turn that had real plugin activity, once
  // per turn, never when the kill switch or VC_FIX_DIAG_LINE=off is set. `promptedThisTurn`
  // (reset ONLY by a new UserPromptSubmit) is what stops the resumed print-turn's own Stop from
  // re-blocking → no infinite loop.
  const cleanBlock = !lineOff && !consentOff && !stopHookActive && !state.promptedThisTurn && !state.selfCheckSeen && uniqueFresh.length === 0 && pluginActivity;
  const surfaced = shouldPrompt || cleanBlock;
  // A durable, deterministic audit of every decision moment — greppable with
  // `"type":"finalize"` / `decision` in the session jsonl. This is how "when did the hook
  // run and what did it decide" stays observable WITHOUT printing a line on every turn.
  const decision = {
    verdict: uniqueFresh.length ? "flagged" : "clean",
    pluginActivity,
    freshCount: uniqueFresh.length,
    flaggedTotal: state.flagged.length,
    surfaced, // did we resume + print a visible line this turn
    suppressReason: surfaced
      ? null
      : uniqueFresh.length === 0
        ? (pluginActivity ? "clean" : "no-plugin-activity")
        : consentOff
          ? "consent-off"
          : state.selfCheckSeen
            ? "self-check-session"
            : "already-surfaced",
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
    decision,
  });

  // Set the one-shot guard for ANY block we emit this turn (findings OR clean-line), so a
  // repeat finalize in the same turn (incl. the resumed print-turn's own Stop) never re-blocks.
  if (surfaced) state.promptedThisTurn = true;
  if (shouldPrompt) for (const f of uniqueFresh) state.seenSignatures.push(f.signature);
  saveState(statePath, state);

  if (shouldPrompt) {
    const summary = uniqueFresh.map((f) => `${f.outcome} in /${f.name}${f.struggle?.length ? ` (${f.struggle.join(",")})` : ""}`).join("; ");
    const reason = [
      "The vc-fix self-diagnostics collector flagged this session's plugin activity as ",
      `not-clean: ${summary}.\n\n`,
      "Silently run the `vc-self-check` skill NOW (invoke it via the Skill tool with the ",
      "argument `latest`) to diagnose these spans against the oracle and write a local ",
      "DIAG-*.md. Do NOT ask the user a Yes/No question first — just run it. When it ",
      "finishes, print ONE short info line: the finding count + the DIAG path (e.g. ",
      '"vc-fix self-check: 1 BROKEN, 1 DEGRADED → .vc-fix/diagnostics/DIAG-….md"). ',
      "Then continue. Nothing leaves the machine — the local report is not sent anywhere.",
    ].join("");
    process.stdout.write(JSON.stringify({ decision: "block", reason }));
  } else if (cleanBlock) {
    // Default clean line — resume the agent ONCE to print the clean-status line, then stop.
    const reason = [
      "The vc-fix self-diagnostics collector evaluated this session's plugin activity and found ",
      "NO PLUGIN issues (all skill/command spans ran clean/recovered). This judges ONLY whether ",
      "the plugin's own skills executed correctly — it does NOT endorse your environment health ",
      "or the task's own verdict (a skill that correctly reports NOT READY / BAIL / 'bug found' ",
      "is itself healthy). Print EXACTLY one short line to the user — ",
      "`vc-fix self-check: no plugin issues detected` — and then stop. Do NOT run any skill, do ",
      "NOT take any other action; this is an informational status line only.",
    ].join("");
    process.stdout.write(JSON.stringify({ decision: "block", reason }));
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
    if (sub === "init") await cmdInit(ev);
    else if (sub === "prompt") await cmdPrompt(ev);
    else if (sub === "record" || sub === "agentstop") await cmdScan(ev);
    else if (sub === "finalize") await cmdFinalize(ev);
    // Unknown subcommand: no-op.
  } catch (err) {
    process.stderr.write(`session-telemetry hook error: ${err?.message ?? err}\n`);
  }
  process.exit(0);
})();
