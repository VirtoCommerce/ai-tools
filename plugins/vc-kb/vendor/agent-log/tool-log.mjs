#!/usr/bin/env node
/**
 * tool-log.mjs — a PostToolUse hook that records what an agent session ACTUALLY did.
 *
 * One JSONL line per tool call, appended to <VC_MEASURE_OUT>/tool-log-<session>.jsonl:
 *   { ts, session, tool, target, ok }            a plain call
 *   { ts, session, tool, target, ok, part, of }  one action inside a batch tool
 *
 * It is the independent half of a two-log design. An agent asked to keep its own record of what
 * it looked up either forgets or writes a plausible reconstruction at the end; this hook knows
 * what the harness knows, and the two are reconciled afterwards. A divergence is the point: a
 * lookup that happened but was never written down, or a row claiming a probe at a call count
 * that never moved.
 *
 * Four properties are deliberate.
 *
 *   1. IT RECORDS WHAT WAS ADDRESSED, NEVER THE PAYLOAD. `target` is a single identifying
 *      argument, truncated. No file contents, no request or response bodies, no typed text. For
 *      a tool it does not recognise it logs the input's KEY NAMES, so an unknown tool cannot
 *      leak anything and the log still shows that something happened and what shape it had.
 *   2. BATCH TOOLS ARE UNPACKED. A batch carries its real work in `actions[]`, so logging it as
 *      one line hides most of a session's activity. Each inner action gets its own line, tagged
 *      `part`/`of`. THE BUDGET STILL COUNTS TOOL CALLS, NOT LINES — `countCalls()` skips
 *      continuation parts, so a batch of ten costs one. Unpacking must enrich the log without
 *      quietly redefining what the cap means.
 *   3. SECRETS ARE REDACTED BY VALUE, read once from the env files at startup. A rule keyed on
 *      the word `password` misses `PW='...'`; keying on the value does not. Named token shapes
 *      (GitHub PAT, JWT, `Bearer`, long hashes) are caught too, and a high-entropy fallback
 *      requires mixed case AND a digit so it cannot swallow a kebab-case filename, a hyphenated
 *      GUID or a 32-hex id — which is what says WHICH entity a call addressed.
 *      A PATH-SHAPED VALUE NEVER JOINS THE REDACTION LIST: `pwd` matches the shell's own `PWD`,
 *      whose value is the working directory, and without that guard the project path is cut out
 *      of every `file_path` in the log.
 *   4. FAIL-OPEN, ALWAYS. It never throws, never writes to stdout/stderr on the happy path, and
 *      always exits 0. A logging hook that can block a tool call would corrupt the very session
 *      it is measuring.
 *
 * Environment:
 *   VC_MEASURE_OUT      the directory both logs are written to (default: <project>/MEASUREMENT)
 *   VC_MEASURE_CAP      tool-call budget; crossings at 50/75/90/100% are announced (default 150)
 *   CLAUDE_CODE_HOST_SESSION_ID  set by the harness, not by us; recorded as `host` so a child
 *                       process can recognise its own log. Optional.
 *   VC_MEASURE_SECRETS  ';'-separated env files whose secret VALUES are redacted
 *                       (default: .env.local and .env.playwright.local under the project root)
 *
 * Zero dependencies, and it imports nothing from any repository.
 */
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const MAX = 200;
const LF = String.fromCharCode(10);
const DQ = String.fromCharCode(34);
const SQ = String.fromCharCode(39);

/* Read the identifying argument per tool family. `text` is deliberately absent from every
 * branch: browser_type carries the password. */
const TARGET_KEYS = [
  "file_path", // Read / Write / Edit / NotebookEdit
  "url", // WebFetch, navigate, browser_navigate
  "command", // Bash / PowerShell
  "pattern", // Grep / Glob
  "skill", // Skill
  "query", // ToolSearch and search-shaped MCP tools
  "issueIdOrKey", // tracker reads
  "element", // browser interaction target (accessible name, not typed content)
  "ref", // browser element ref
  "selector",
  "notebook_path",
  "description", // Agent / Task
  /* `part` LAST, so it is the fallback for a tool that carries no other identifying key --
   * browser_network_request being the one that matters. That tool is deliberately outside the
   * permission allow-list because run 02 asked it for `request-body` on a sign-in POST and got the
   * password back in plaintext; every use since is approved by hand. Run 06 used it fifteen times
   * and reported that it read response bodies only -- and the log could not corroborate that, because
   * it recorded `keys:index,part` and not which part. The one tool the project singled out as
   * dangerous was the one whose dangerous argument was invisible in the ground-truth record.
   *
   * `part` is a MODE, not a payload, so logging it does not cross the rule in (1) above: it says
   * what was addressed -- the response, or the request that may carry a credential. */
  "part",
];

/* (3) Secret VALUES, collected once per invocation, redacted literally. Keyed on the
 * variable NAME, so a password reaches the list whatever the code around it looks like.
 * Short values are skipped: redacting a 4-character value would blank out ordinary words
 * and make the log useless. */
const SECRET_NAME = /password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key|client[_-]?secret/i;

/* A PATH-VALUED variable must never join the redaction list. `pwd` is in SECRET_NAME as the
 * abbreviation of "password", and it therefore matches the shell's own `PWD` / `OLDPWD` —
 * whose value is the project directory. Left unguarded, the project path was cut out of every
 * `file_path` target in the log: the same blindness fix (2) exists to remove, arriving from the
 * opposite direction. Rejecting a path-shaped value costs little, because a token that happens
 * to contain slashes is still caught by the named-shape and high-entropy rules below, while a
 * password with a single slash in the middle is NOT path-shaped and survives this test. */
const looksLikePath = (v) =>
  /^[A-Za-z]:[\\/]/.test(v) || // C:\ or C:/
  /^[\\/]/.test(v) || // absolute posix / UNC
  /^\w+:\/\//.test(v) || // scheme://
  /^\.{1,2}[\\/]/.test(v) || // ./ or ../
  (v.match(/[\\/]/g) || []).length >= 2;

const usableSecret = (name, value) =>
  SECRET_NAME.test(name) && typeof value === "string" && value.length >= 6 && !looksLikePath(value);

function secretValues(root) {
  const files = process.env.VC_MEASURE_SECRETS
    ? process.env.VC_MEASURE_SECRETS.split(";")
    : [join(root, ".env.local"), join(root, ".env.playwright.local")];
  const found = new Set();
  for (const [name, value] of Object.entries(process.env)) {
    if (usableSecret(name, value)) found.add(value);
  }
  for (const f of files) {
    let text = "";
    try {
      text = readFileSync(f, "utf8");
    } catch {
      continue;
    }
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq < 1) continue;
      const name = line.slice(0, eq).replace(/^export\s+/, "").trim();
      let value = line.slice(eq + 1).trim();
      const q = value.charAt(0);
      if ((q === DQ || q === SQ) && value.endsWith(q) && value.length > 1) value = value.slice(1, -1);
      if (usableSecret(name, value)) found.add(value);
    }
  }
  /* Longest first, so a value that contains another cannot be half-replaced. */
  return [...found].sort((a, b) => b.length - a.length);
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, (c) => "\\" + c);

/* (2) A GUID says WHICH entity was addressed and must survive — both the hyphenated form and
 * the 32-hex "N" form the platform emits. */
const GUID = /^(?:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}|[0-9a-fA-F]{32})$/;
const HIGH_ENTROPY = /\b[A-Za-z0-9_+~-]{32,}={0,2}\b/g;

function redactWith(secrets) {
  return (s) => {
    let t = String(s);
    for (const v of secrets) t = t.replace(new RegExp(escapeRe(v), "g"), "<redacted>");
    return t
      /* querystring and flag-shaped secrets */
      .replace(/((?:password|passwd|pwd|token|secret|api[_-]?key|access[_-]?key)\s*[=:]\s*)\S+/gi, "$1<redacted>")
      /* bearer tokens */
      .replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/-]{8,}=*/gi, "$1 <redacted>")
      /* named token shapes: GitHub PATs and JWTs */
      .replace(/\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{20,}\b/g, "<redacted>")
      .replace(/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g, "<redacted>")
      /* long hashes: sha1 and up. 32-hex is deliberately EXCLUDED — that is a platform id. */
      .replace(/\b[0-9a-fA-F]{40,}\b/g, "<redacted>")
      /* fallback for an unknown key shape: opaque only if it mixes case AND carries a digit.
       * A kebab-case filename or a hyphenated GUID fails that test and survives. */
      .replace(HIGH_ENTROPY, (m) => {
        if (GUID.test(m)) return m;
        const mixed = /[a-z]/.test(m) && /[A-Z]/.test(m) && /[0-9]/.test(m);
        return mixed ? "<redacted>" : m;
      });
  };
}

function makeClip(redact) {
  return (s) => {
    const t = redact(s).replace(/\s+/g, " ").trim();
    return t.length > MAX ? t.slice(0, MAX) + "…" : t;
  };
}

function targetOf(input, clip) {
  if (!input || typeof input !== "object") return typeof input === "string" ? clip(input) : "";
  for (const k of TARGET_KEYS) {
    const v = input[k];
    if (typeof v === "string" && v.trim()) return clip(v);
    if (typeof v === "number") return String(v);
  }
  /* Unrecognised tool: report the SHAPE, never a value. */
  const keys = Object.keys(input);
  return keys.length ? "keys:" + keys.slice(0, 8).join(",") : "";
}

/* An error is reported in several shapes depending on the tool; treat any of them as not-ok,
 * and treat "no response field at all" as ok rather than guessing. */
function okOf(res) {
  if (res == null) return true;
  if (typeof res === "object") {
    if (res.is_error === true || res.error) return false;
    if (typeof res.success === "boolean") return res.success;
  }
  if (typeof res === "string" && /^(error|exception)\b/i.test(res.trim())) return false;
  return true;
}

/* (1) The cap counts TOOL CALLS. A continuation part of a batch is a line, not a call. */
function countCalls(text) {
  let n = 0;
  for (const l of text.split(LF)) {
    if (!l) continue;
    try {
      if (!JSON.parse(l).part) n += 1;
    } catch {
      n += 1;
    }
  }
  return n;
}

try {
  let raw = "";
  try {
    raw = readFileSync(0, "utf8");
  } catch {
    process.exit(0);
  }
  if (!raw.trim()) process.exit(0);

  const ev = JSON.parse(raw);
  const tool = String(ev.tool_name || "");
  if (!tool) process.exit(0);

  const root = process.env.CLAUDE_PROJECT_DIR || ev.cwd || process.cwd();
  const clip = makeClip(redactWith(secretValues(root)));
  const sid = String(ev.session_id || "unknown").slice(0, 8);
  /* ONE FILE PER SESSION. Writing every session into one jsonl means the analysis has to
   * hand-exclude the lines belonging to other sessions before it can count anything. A
   * per-session file makes each session its own artifact. */
  const outDir = process.env.VC_MEASURE_OUT || join(root, "MEASUREMENT"); // (4)
  const out = join(outDir, "tool-log-" + sid + ".jsonl");

  /* THE HARNESS'S OWN SESSION ID, carried so the door can find its own log without being told.
   *
   * `session` above is the transcript id, which the hook gets in its payload and a child process
   * cannot see. So when two sessions share a measurement directory, `kb` -- a child of a shell --
   * had no way to know which log was its own, and the run had to put VC_MEASURE_SESSION on every
   * single call. Run 05 did it 25 times out of 25 and run 06 did it too, but one missed prefix
   * drops a question row silently, and that is a mechanism asking an agent to remember.
   *
   * CLAUDE_CODE_HOST_SESSION_ID is set by the harness, is per-session, and IS inherited by tool
   * children. It is a different identifier from the transcript id, so it cannot name the file --
   * it goes in the record instead, and resolveSession matches on it.
   *
   * Absent when the harness does not set it (a plain terminal, another client). Then the field is
   * simply not written and everything falls back to the behaviour that existed before. */
  const host = process.env.CLAUDE_CODE_HOST_SESSION_ID || null;
  const base = { ts: new Date().toISOString(), session: sid, ...(host ? { host } : {}) };
  const ok = okOf(ev.tool_response);

  /* (1) A batch carries its real work in actions[]; log one line per inner action. */
  const actions = ev.tool_input && Array.isArray(ev.tool_input.actions) ? ev.tool_input.actions : null;
  const records = [];
  if (actions && actions.length) {
    actions.forEach((a, i) => {
      const inner = a && typeof a === "object" ? a : {};
      records.push({
        ...base,
        tool: tool + "/" + String(inner.name || "?"),
        target: targetOf(inner.input, clip),
        ok,
        part: i,
        of: actions.length,
      });
    });
  } else {
    records.push({ ...base, tool, target: targetOf(ev.tool_input, clip), ok });
  }

  mkdirSync(dirname(out), { recursive: true });
  appendFileSync(out, records.map((r) => JSON.stringify(r)).join(LF) + LF, "utf8");

  /* THE BUDGET IS COUNTED HERE, NOT BY THE AGENT. A number an agent maintains about itself
   * is not a budget: an agent will exceed a cap believing it is one call short, or stop early
   * believing it has hit a limit it has not — and abandon work on that false belief. So the
   * hook counts what it has written and speaks up crossing each threshold. PostToolUse stdout
   * reaches the agent as additional context, which is exactly the channel needed; it stays
   * silent on every other call. */
  const cap = Number(process.env.VC_MEASURE_CAP || 150);
  const used = countCalls(readFileSync(out, "utf8"));
  const marks = [Math.floor(cap * 0.5), Math.floor(cap * 0.75), Math.floor(cap * 0.9), cap];
  if (marks.includes(used)) {
    /* console.log appends the newline itself, so this block carries no escape sequences at all. */
    console.log(
      used >= cap
        ? "BUDGET: " + used + "/" + cap + " tool calls - the cap is reached. Stop the task and write the handover."
        : "BUDGET: " + used + "/" + cap + " tool calls used.",
    );
  }
} catch {
  /* Deliberately silent. See the header: this must never block or annotate a tool call. */
}
process.exit(0);
