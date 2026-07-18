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
 *    run `/vc-self-check` SILENTLY (no Yes/No modal) and print ONE info line. The
 *    happy path emits nothing. Loop guards: `vc-self-check`'s own spans are dropped,
 *    `selfCheckSeen` suppresses re-trigger, per-signature dedup prevents re-nag.
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
 *   - The auto-diagnosis trigger can be suppressed with VC_FIX_DIAG_CONSENT=off
 *     (kill switch) — capture still runs; nothing is surfaced.
 *
 * NOTE: this collector is the canonical `plugins/vc-fix/` copy. The `.claude/`
 * mirror predates VCST-5509 and is intentionally NOT kept in lock-step here.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
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
};

// ─── signal counts ───────────────────────────────────────────────────────────
const SIGNAL_CLASSES = ["tool_error", "permission_denied", "hook_failure", "stop_bail"];
const zeroCounts = () => ({ tool_error: 0, permission_denied: 0, hook_failure: 0, stop_bail: 0, tool_calls: 0, agent_calls: 0 });

const PERMISSION_DENIED_RE = /\b(permission denied|denied permission|requested permissions|user (?:denied|declined|rejected)|operation not permitted|not allowed to)\b/i;
const HOOK_FAILURE_RE = /(error TS\d{3,}|\btsc\b[^\n]*error|PostToolUse hook[^\n]*fail|hook[^\n]*error|npm error|command failed with exit code)/i;
const BAIL_RE = /(FIX_STATUS:\s*FAILED|\bBAIL(?:_CLASS)?\b|out-of-auto-fix-scope|hand(?:ed)?[ -]off|STOP\s*[—-]\s*hand)/;

// Plugin slash-commands we open a COMMAND span for (acceptance criterion: a
// command session is fully traced, not just skill-attributed).
const PLUGIN_COMMANDS = ["project-init", "qa-bug", "qa-fix", "qa-verify-fix", "qa-monitoring", "qa-env-check", "vc-self-check", "vc-feedback", "vc-docs"];
const COMMAND_RE = new RegExp(`^\\s*/(${PLUGIN_COMMANDS.join("|")})\\b`, "i");

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
    ops: [], // bounded op history for struggle detection
    sawExpected: false,
    retries: 0,
    lastTs: startTs || nowIso(),
  };
}
function pushDetail(span, cls, text, extra) {
  span.signals[cls] = (span.signals[cls] ?? 0) + 1;
  if (span.details.length < 25) span.details.push({ cls, snippet: snippet(text), ...extra });
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

  // search_thrash — a long run of search/read ops with no decisive op between.
  let run = 0;
  for (const o of ops) {
    if (DECISIVE_RE.test(o.tool)) run = 0;
    else if (SEARCH_RE.test(o.tool)) { run++; if (run >= T.SEARCH_THRASH_RUN) { struggle.push("search_thrash"); break; } }
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

  // low_yield — many tool ops, nothing decisive produced.
  const decisive = ops.some((o) => DECISIVE_RE.test(o.tool));
  if (ops.length >= T.LOW_YIELD_OPS && !decisive) struggle.push("low_yield");

  return [...new Set(struggle)];
}

// Was every errored tool later re-run successfully within the span? (self-correction)
function allErrorsRecovered(span) {
  const errored = new Set();
  const succeededAfterError = new Set();
  for (const o of span.ops || []) {
    if (o.status === "error") errored.add(o.tool);
    else if (errored.has(o.tool)) succeededAfterError.add(o.tool);
  }
  if (!errored.size) return false;
  for (const t of errored) if (!succeededAfterError.has(t)) return false;
  return true;
}

function classify(span) {
  const s = span.signals;
  const blockingErr = s.tool_error > 0 || s.permission_denied > 0 || s.hook_failure > 0;
  const struggle = detectStruggle(span);
  // permission_denied / hook_failure that never resolved are hard blockers.
  const hardBlock = s.permission_denied > 0 || s.hook_failure > 0;

  let outcome;
  if (blockingErr && allErrorsRecovered(span) && !hardBlock) {
    outcome = "recovered"; // error occurred but self-corrected → do NOT escalate
  } else if (hardBlock || (s.tool_error > 0 && !allErrorsRecovered(span))) {
    outcome = "failed";
  } else if (struggle.length) {
    outcome = "degraded";
  } else if ((span.kind === "skill" || span.kind === "command") && !span.sawExpected) {
    outcome = "silent_suspect"; // closed clean but produced no expected artifact
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
  if (escalationUnit && rec.outcome !== "success" && rec.outcome !== "recovered" && !/vc-self-check/i.test(span.name)) {
    const sig = hash(`${span.kind}|${span.name}|${rec.outcome}|${topSignal(span)}`);
    state.flagged.push({ id: span.id, kind: span.kind, name: span.name, outcome: rec.outcome, struggle: rec.struggle, signature: sig });
  }
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
          if (state.currentSkill) emitSpan(jsonlPath, state, state.currentSkill, ts), (state.currentSkill = null);
          const skillName = String(item.input?.skill ?? item.input?.command ?? item.input?.name ?? "unknown").replace(/^\//, "");
          state.currentSkill = newSpan(state, "skill", skillName, ts, state.currentCommand?.id ?? null);
          state.anySkillSeen = true;
          if (/vc-self-check/i.test(skillName)) state.selfCheckSeen = true;
        } else if (name === "Task" || name === "Agent") {
          const agentType = String(item.input?.subagent_type ?? item.input?.agentType ?? "unknown");
          if (parent) { parent.signals.agent_calls++; parent.ops.push({ tool: `agent:${agentType}`, arg_hash, status: "ok", ts }); }
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
        const isErr = item.is_error === true;
        const isDenied = !isErr && PERMISSION_DENIED_RE.test(body);
        const isHook = !isErr && !isDenied && HOOK_FAILURE_RE.test(body);
        const sp = id ? state.openOps.get(id) : null;
        const p = innerParent();
        if (sp) {
          state.openOps.delete(id);
          if (isErr) pushDetail(sp, "tool_error", body, { toolUseId: id });
          else if (isDenied) pushDetail(sp, "permission_denied", body, { toolUseId: id });
          else if (isHook) pushDetail(sp, "hook_failure", body);
          emitSpan(jsonlPath, state, sp, ts);
          if (p) {
            p.ops.push({ tool: sp.name, arg_hash: sp.arg_hash, status: isErr || isDenied || isHook ? "error" : "ok", ts, durationMs: Date.parse(ts) - Date.parse(sp.startTs) || 0 });
            if (isErr) pushDetail(p, "tool_error", body);
            else if (isDenied) pushDetail(p, "permission_denied", body);
            else if (isHook) pushDetail(p, "hook_failure", body);
          }
          if (isErr) state.totals.tool_error++;
          else if (isDenied) state.totals.permission_denied++;
          else if (isHook) state.totals.hook_failure++;
        } else {
          if (isErr) attributeSignal("tool_error", body, { toolUseId: id });
          else if (isDenied) attributeSignal("permission_denied", body, { toolUseId: id });
          else if (isHook) attributeSignal("hook_failure", body);
        }
      } else if (type === "text") {
        const b = item.text ?? "";
        if (parent) markExpected(parent, b);
        if (PERMISSION_DENIED_RE.test(b)) attributeSignal("permission_denied", b);
        if (BAIL_RE.test(b)) { if (parent) pushDetail(parent, "stop_bail", b); state.totals.stop_bail++; }
      }
    }

    if (typeof content === "string") {
      if (HOOK_FAILURE_RE.test(content)) attributeSignal("hook_failure", content);
      if (PERMISSION_DENIED_RE.test(content)) attributeSignal("permission_denied", content);
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
function saveState(statePath, state) {
  const out = { ...state, openOps: [...state.openOps.entries()] };
  writeFileSync(statePath, JSON.stringify(out), "utf8");
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

  // /vc-feedback "<text>" [👍|👎] — attach an explicit operator verdict to the trace.
  if (/^\/vc-feedback\b/i.test(prompt)) {
    const verdict = /👎|:-1:|:thumbsdown:|\bdown\b|\bbad\b/i.test(prompt) ? "down" : /👍|:\+1:|:thumbsup:|\bup\b|\bgood\b/i.test(prompt) ? "up" : "neutral";
    const text = prompt.replace(/^\/vc-feedback\b/i, "").replace(/👍|👎|:[-+\w]+:/g, "").trim();
    appendRecord(jsonl, { type: "feedback", sessionId: sid, ts: nowIso(), verdict, text: snippet(text, 500), skill: state.currentSkill?.name ?? state.currentCommand?.name ?? null });
    state.feedbackCount = (state.feedbackCount ?? 0) + 1;
    saveState(statePath, state);
    return; // feedback does NOT open a command span
  }

  const m = COMMAND_RE.exec(prompt);
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

  // Close trailing spans (skill first, then command).
  if (state.currentSkill) { emitSpan(jsonl, state, state.currentSkill, state.currentSkill.lastTs); state.currentSkill = null; }
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
  });

  const consentOff = /^(off|0|false|no)$/i.test(process.env.VC_FIX_DIAG_CONSENT || "");
  const shouldPrompt = !consentOff && !state.promptedThisTurn && !state.selfCheckSeen && uniqueFresh.length > 0;
  if (shouldPrompt) {
    state.promptedThisTurn = true;
    for (const f of uniqueFresh) state.seenSignatures.push(f.signature);
  }
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
