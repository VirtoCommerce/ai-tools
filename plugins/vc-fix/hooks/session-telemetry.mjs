#!/usr/bin/env node
/**
 * Passive session-telemetry collector — Tier A of the vc-fix self-diagnostics
 * subsystem (VCST-5475). Wired via hooks/hooks.json:
 *
 *   SessionStart              → `init`     (write a session header record)
 *   PostToolUse matcher=Skill → `record`   (close the previous skill's span,
 *                                            roll up its signals, open a new one)
 *   Stop                      → `finalize` (roll up the trailing span, emit a
 *                                            heuristic anomaly snapshot)
 *
 * DESIGN — why this is cheap: the hook fires ONLY at skill boundaries and at
 * Stop, never per tool-call. Each firing reads the session `transcript_path`
 * JSONL and deterministically extracts problem SIGNALS (tool errors, denied
 * permissions, hook failures such as the `tsc` PostToolUse, STOP/BAIL markers)
 * from the delta since the last firing, attributing them to the span that just
 * ended. The heavy interpretation (were the STEPS correct? is this a real
 * anomaly or a clean BAIL?) is Tier B's job — the on-demand `/vc-self-check`
 * diagnostician (VCST-5477) reading this jsonl + the oracle (VCST-5476).
 *
 * INVARIANTS (all enforced here):
 *   - Writes ONLY under the project output root — `<outputRoot>/.vc-fix/
 *     diagnostics/<session_id>.jsonl` — where outputRoot = VC_FIX_HOME ||
 *     process.cwd(), matching skills/project-init/lib/paths.mjs `outputRoot()`.
 *     NEVER writes under the plugin install dir (`pluginRoot`). The `.vc-fix/`
 *     path is gitignored.
 *   - Never throws, never blocks a tool, never prints a decision to stdout,
 *     never writes a secret (Authorization/token/password/PAN are redacted from
 *     every captured snippet). Always exits 0.
 *   - Per-Skill overhead: the transcript file is read in full each firing, but only
 *     the NEW lines (from the persisted cursor) are scanned — the scan is bounded to
 *     the delta, the read is not. Full read of ~100k lines is a few hundred ms; fine
 *     at skill boundaries. (A seek-from-byte-offset read would make it incremental.)
 *
 * This file is shipped identically in `plugins/vc-fix/hooks/` and `.claude/hooks/`.
 */
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, resolve, join, basename } from "node:path";
import { fileURLToPath } from "node:url";

// ─── output root resolution ────────────────────────────────────────────────
// Canonical definition lives in skills/project-init/lib/paths.mjs `outputRoot()`
// (VC_FIX_HOME || process.cwd()). We prefer importing it so the two stay in
// lock-step; when that module isn't resolvable (the `.claude/` tree's
// project-init has a flatter layout with no lib/paths.mjs), we fall back to the
// byte-identical inline logic. Either way the result is the project dir — NEVER
// the plugin install dir.
async function resolveOutputRoot() {
  try {
    const url = new URL("../skills/project-init/lib/paths.mjs", import.meta.url);
    const mod = await import(url.href);
    if (typeof mod.outputRoot === "function") return mod.outputRoot();
  } catch {
    /* fall through to the inline equivalent */
  }
  return process.env.VC_FIX_HOME ? resolve(process.env.VC_FIX_HOME) : process.cwd();
}

// Plugin install dir — read-only. Only used to read the plugin version for the
// session header; NEVER a write target. CLAUDE_PLUGIN_ROOT when set, else this
// file's own dir climbed one level (<pluginRoot>/hooks/session-telemetry.mjs).
function pluginRoot() {
  if (process.env.CLAUDE_PLUGIN_ROOT) return resolve(process.env.CLAUDE_PLUGIN_ROOT);
  return resolve(dirname(fileURLToPath(import.meta.url)), "..");
}

// ─── secret redaction ──────────────────────────────────────────────────────
const REDACTIONS = [
  [/\b(authorization|bearer)\b\s*[:=]?\s*\S+/gi, "$1 «redacted»"],
  [/\b(token|api[_-]?key|secret|password|passwd|pwd)\b\s*[:=]\s*\S+/gi, "$1=«redacted»"],
  [/\beyJ[A-Za-z0-9._-]{16,}/g, "«jwt»"], // JWTs
  [/\b\d(?:[ -]?\d){12,18}\b/g, "«pan»"], // card numbers (anchored on digits both ends — no trailing-sep eat)
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, "«gh-token»"], // GitHub tokens
];
function redact(s) {
  let out = String(s ?? "");
  for (const [re, rep] of REDACTIONS) out = out.replace(re, rep);
  return out;
}

// ─── signal extraction from the transcript delta ─────────────────────────────
const SIGNAL_CLASSES = ["tool_error", "permission_denied", "hook_failure", "stop_bail"];
// anomalyScore at/above which the Stop finalize offers the yes/no consent prompt
// (VCST-5477). Conservative on purpose: a single recovered blip (one tool_error=3
// or one permission_denied=2) stays below it; it takes e.g. 2 tool_errors, a
// tool_error+hook_failure, or 3 denials to cross. stop_bail is weighted 0.
const CONSENT_THRESHOLD = 6;
const zeroCounts = () => ({ tool_error: 0, permission_denied: 0, hook_failure: 0, stop_bail: 0, tool_calls: 0, agent_calls: 0 });

const PERMISSION_DENIED_RE = /\b(permission denied|denied permission|requested permissions|user (?:denied|declined|rejected)|operation not permitted|not allowed to)\b/i;
const HOOK_FAILURE_RE = /(error TS\d{3,}|\btsc\b[^\n]*error|PostToolUse hook[^\n]*fail|hook[^\n]*error|npm error|command failed with exit code)/i;
const BAIL_RE = /(FIX_STATUS:\s*FAILED|\bBAIL(?:_CLASS)?\b|out-of-auto-fix-scope|hand(?:ed)?[ -]off|STOP\s*[—-]\s*hand)/;

function snippet(text) {
  const t = redact(String(text ?? "").replace(/\s+/g, " ").trim());
  return t.length > 120 ? t.slice(0, 117) + "…" : t;
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

/**
 * Read the transcript file (in full) and scan only lines [fromLine, end) for signals,
 * reporting how many lines were consumed so the caller can advance its cursor. The
 * READ is whole-file; the SCAN is bounded to the delta. Defensive against any line
 * shape — a malformed line is skipped, never thrown on.
 */
function scanTranscript(transcriptPath, fromLine) {
  const span = { counts: zeroCounts(), details: [] };
  let processed = fromLine;
  if (!transcriptPath || !existsSync(transcriptPath)) return { span, processed };

  let lines;
  try {
    const content = readFileSync(transcriptPath, "utf8");
    // Consume only COMPLETE (newline-terminated) lines. `split("\n")` yields a
    // trailing element that is either "" (file ended with \n → all lines done)
    // or a partial line still being flushed — in both cases the last element is
    // not a complete record, so we drop it and leave it for the next firing.
    // Without this, the cursor overshoots by one and the next appended line is
    // silently skipped.
    const parts = content.split("\n");
    lines = parts.slice(0, Math.max(0, parts.length - 1));
  } catch {
    return { span, processed };
  }

  const pushDetail = (cls, text, extra) => {
    span.counts[cls]++;
    if (span.details.length < 25) span.details.push({ cls, snippet: snippet(text), ...extra });
  };

  for (let i = fromLine; i < lines.length; i++) {
    processed = i + 1;
    const raw = lines[i];
    if (!raw || !raw.trim()) continue;
    let ev;
    try {
      ev = JSON.parse(raw);
    } catch {
      continue;
    }
    const msg = ev.message ?? ev;
    const content = msg?.content ?? ev?.content;
    const items = Array.isArray(content) ? content : content != null ? [content] : [];

    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const type = item.type;
      if (type === "tool_use") {
        span.counts.tool_calls++;
        // Capture agents delegated BY a skill (the Task/Agent tool). The sub-agent runs in
        // its own transcript, so its INTERNAL signals aren't visible here — but recording the
        // delegation lets Tier B (a) attribute a failed/denied Task result (already counted as
        // tool_error/permission_denied on its own tool_result) to the spawning skill, and
        // (b) see which agents a skill invoked. `agent_calls` is a COUNT, not an anomaly class
        // (absent from SIGNAL_CLASSES), so it never inflates the anomaly score on its own.
        if (item.name === "Task" || item.name === "Agent") {
          span.counts.agent_calls = (span.counts.agent_calls ?? 0) + 1;
          const agent = item.input?.subagent_type || item.input?.agentType || "unknown";
          if (span.details.length < 25) span.details.push({ cls: "agent_call", agent, snippet: snippet(item.input?.description || "") });
        }
      } else if (type === "tool_result") {
        const body = textOf(item.content);
        if (item.is_error === true) {
          pushDetail("tool_error", body, { toolUseId: item.tool_use_id });
        } else if (PERMISSION_DENIED_RE.test(body)) {
          pushDetail("permission_denied", body, { toolUseId: item.tool_use_id });
        } else if (HOOK_FAILURE_RE.test(body)) {
          pushDetail("hook_failure", body);
        }
      } else if (type === "text") {
        const body = item.text ?? "";
        if (PERMISSION_DENIED_RE.test(body)) pushDetail("permission_denied", body);
        if (BAIL_RE.test(body)) pushDetail("stop_bail", body);
      }
    }

    // Top-level string content (system / hook echoes) that isn't in an items array.
    if (typeof content === "string") {
      if (HOOK_FAILURE_RE.test(content)) pushDetail("hook_failure", content);
      if (PERMISSION_DENIED_RE.test(content)) pushDetail("permission_denied", content);
    }
  }
  return { span, processed };
}

function addCounts(target, src) {
  for (const k of Object.keys(src)) target[k] = (target[k] ?? 0) + src[k];
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

function loadState(statePath, ev) {
  if (existsSync(statePath)) {
    try {
      return JSON.parse(readFileSync(statePath, "utf8"));
    } catch {
      /* corrupt — rebuild below */
    }
  }
  return { processedLines: 0, transcriptPath: ev.transcript_path ?? null, current: null, totals: zeroCounts(), skillTotals: zeroCounts(), anySkillSeen: false };
}

function saveState(statePath, state) {
  writeFileSync(statePath, JSON.stringify(state), "utf8");
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
      /* try next candidate */
    }
  }
  return null;
}

function readProjectType(root) {
  try {
    const p = join(root, "project-profile.json");
    if (existsSync(p)) {
      const j = JSON.parse(readFileSync(p, "utf8"));
      return typeof j.projectType === "string" ? j.projectType : null;
    }
  } catch {
    /* ignore */
  }
  return null; // absent profile ⇒ native-platform default
}

// ─── subcommands ─────────────────────────────────────────────────────────────
async function cmdInit(ev) {
  const { root, dir, sid, jsonl, state } = await paths(ev);
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
  saveState(state, { processedLines: 0, transcriptPath: ev.transcript_path ?? null, current: null, totals: zeroCounts(), skillTotals: zeroCounts(), anySkillSeen: false });
}

async function cmdRecord(ev) {
  const { dir, jsonl, state: statePath } = await paths(ev);
  ensureDir(dir);
  const state = loadState(statePath, ev);
  const transcriptPath = ev.transcript_path ?? state.transcriptPath;

  // Roll up the delta since the last firing — it belongs to the PREVIOUS skill.
  const { span, processed } = scanTranscript(transcriptPath, state.processedLines);
  state.processedLines = processed;
  addCounts(state.totals, span.counts);
  // Attribute the delta to a SKILL only when one was open (state.current). skillTotals
  // therefore excludes the session-prefix noise (git/Bash/Edit before any skill ran) —
  // it is what the end-of-session consent prompt is scored against, so plain development
  // sessions never trigger it (VCST-5477 refinement).
  if (state.current) {
    addCounts(state.current.signals, span.counts);
    addCounts((state.skillTotals ??= zeroCounts()), span.counts);
  }

  // Close the previous skill's span.
  if (state.current) {
    const endTs = nowIso();
    appendRecord(jsonl, {
      type: "skill_end",
      sessionId: sessionId(ev),
      skill: state.current.skill,
      args: state.current.args,
      startTs: state.current.startTs,
      endTs,
      durationMs: Date.parse(endTs) - Date.parse(state.current.startTs) || null,
      signals: state.current.signals,
      details: state.current.details.concat(span.details).slice(0, 25),
    });
  }

  // Open the new skill.
  const input = ev.tool_input ?? {};
  const skill = String(input.skill ?? input.name ?? "unknown");
  const args = input.args != null ? snippet(input.args) : null;
  const startTs = nowIso();
  state.current = { skill, args, startTs, signals: zeroCounts(), details: [] };
  state.transcriptPath = transcriptPath;
  // A skill actually ran this session — the consent prompt is gated on this so a
  // session with zero skill invocations is never offered self-diagnosis.
  state.anySkillSeen = true;
  // Dedup guard (VCST-5477): a session that ran the diagnostician itself must
  // never be offered the end-of-session consent prompt — the diagnostician
  // never diagnoses its own invocation.
  if (/vc-self-check/i.test(skill)) state.selfCheckSeen = true;
  saveState(statePath, state);

  appendRecord(jsonl, { type: "skill_start", sessionId: sessionId(ev), skill, args, ts: startTs });
}

async function cmdFinalize(ev) {
  const { dir, jsonl, state: statePath } = await paths(ev);
  ensureDir(dir);
  const state = loadState(statePath, ev);
  const transcriptPath = ev.transcript_path ?? state.transcriptPath;

  const { span, processed } = scanTranscript(transcriptPath, state.processedLines);
  state.processedLines = processed;
  addCounts(state.totals, span.counts);
  if (state.current) {
    addCounts(state.current.signals, span.counts);
    addCounts((state.skillTotals ??= zeroCounts()), span.counts);
    state.current.details = state.current.details.concat(span.details).slice(0, 25);
  }

  // Heuristic anomaly score. A clean STOP/BAIL is a SUCCESS (quality-gates §3),
  // so stop_bail is INFORMATIONAL and carries zero weight here — Tier B decides
  // whether a bail was clean against the Step-2 oracle. Only the unambiguous
  // "something went wrong" signals inflate the score.
  const t = state.totals;
  const anomalyScore = t.tool_error * 3 + t.permission_denied * 2 + t.hook_failure * 3;
  const anomalies = SIGNAL_CLASSES.filter((c) => c !== "stop_bail" && t[c] > 0).map((c) => ({ class: c, count: t[c] }));
  // Skill-attributed score — signals that occurred WHILE a vc-fix skill was running
  // (excludes the session-prefix development noise). This is what gates the consent
  // prompt, so a session that only edited code / ran git never triggers self-diagnosis.
  const st = state.skillTotals ?? zeroCounts();
  const skillAnomalyScore = st.tool_error * 3 + st.permission_denied * 2 + st.hook_failure * 3;
  const skillAnomalies = SIGNAL_CLASSES.filter((c) => c !== "stop_bail" && st[c] > 0).map((c) => ({ class: c, count: st[c] }));

  appendRecord(jsonl, {
    type: "finalize",
    sessionId: sessionId(ev),
    ts: nowIso(),
    reason: ev.reason ?? null,
    totals: t,
    anomalyScore,
    anomalies,
    // Skill-scoped view (the consent driver) alongside the session-wide totals.
    anySkillSeen: Boolean(state.anySkillSeen),
    skillTotals: st,
    skillAnomalyScore,
    skillAnomalies,
    stopBailCount: t.stop_bail,
    openSkill: state.current
      ? { skill: state.current.skill, args: state.current.args, startTs: state.current.startTs, signals: state.current.signals }
      : null,
  });

  // End-of-session consent prompt (VCST-5477 — Tier B trigger). When a SKILL-scoped
  // anomaly crosses the threshold, surface a SINGLE consent question asking whether to
  // run the on-demand diagnostician. NEVER auto-run without the user's answer. Guards:
  //   - a skill actually ran this session (`anySkillSeen`) — a plain development
  //     session (git/Bash/Edit, no skill) is NEVER offered self-diagnosis;
  //   - the score is the SKILL-attributed one (`skillAnomalyScore`), so session-prefix
  //     noise (a failing tsc PostToolUse on an Edit, a non-zero Bash exit) doesn't trip it;
  //   - one-shot per session (`promptedConsent`), so a Stop firing every turn can't nag;
  //   - never in a session that ran the diagnostician itself (`selfCheckSeen`);
  //   - opt-out via VC_FIX_DIAG_CONSENT=off.
  // Mechanism: a `Stop` hook returning {decision:"block", reason} resumes the agent with
  // `reason` as guidance — here, an instruction to ASK via the AskUserQuestion tool and,
  // only on an explicit Yes, run the `/vc-self-check` skill. If the harness ignores the
  // block we simply don't prompt (fail-safe toward not nagging); `promptedConsent` is set
  // regardless so we never re-block.
  const consentOff = /^(off|0|false|no)$/i.test(process.env.VC_FIX_DIAG_CONSENT || "");
  const shouldPrompt =
    !consentOff && !state.promptedConsent && !state.selfCheckSeen && state.anySkillSeen && skillAnomalyScore >= CONSENT_THRESHOLD;
  if (shouldPrompt) state.promptedConsent = true;
  saveState(statePath, state);

  if (shouldPrompt) {
    const parts = skillAnomalies.map((a) => `${a.count}× ${a.class}`).join(", ");
    const reason = [
      "During this session a vc-fix plugin skill behaved unexpectedly",
      parts ? ` (${parts})` : "",
      ".\n\nAsk the user, using the AskUserQuestion tool (a single question, header ",
      '"Self-diagnose", options exactly "Yes" and "No"):\n\n',
      '  "During this session some plugin skills behaved unexpectedly. Run self-diagnosis ',
      "to identify the problems and prepare a quality report for VirtoCommerce ",
      '(to improve the skills)?"\n\n',
      "WAIT for the answer. If the user picks Yes, run the `vc-self-check` skill (invoke it ",
      "via the Skill tool) and follow it. If No (or anything else), do nothing further. ",
      "Do NOT run any diagnosis yourself before the user answers.",
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
    else if (sub === "record") await cmdRecord(ev);
    else if (sub === "finalize") await cmdFinalize(ev);
    // Unknown subcommand: no-op.
  } catch (err) {
    // A telemetry hook must NEVER fail the agent — log to stderr and exit 0.
    process.stderr.write(`session-telemetry hook error: ${err?.message ?? err}\n`);
  }
  process.exit(0);
})();
