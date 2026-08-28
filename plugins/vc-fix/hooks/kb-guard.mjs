#!/usr/bin/env node
/**
 * hooks/kb-guard.mjs — PreToolUse. Makes the resolver the only door into the corpus.
 *
 * A knowledge base agents MAY use is not used. Ours is grepped today: an agent opens a
 * 1700-line oracle to read one invariant, misses the client override that changes it,
 * and answers from the wrong layer. The resolver exists to prevent exactly that, and it
 * only helps if going around it costs something.
 *
 * So a search that walks a knowledge root instead of asking `kb:resolve` is COUNTED,
 * and the count escalates:
 *
 *   1st  nudge              the call proceeds, with a one-line reminder that the door exists
 *   3rd  mandatory context  the call proceeds, carrying the resolver invocation to use instead
 *   5th  deny               "ask the brain first" — the call is blocked
 *
 * Two exemption classes, both learned the hard way (Cortex):
 *
 *   CONTRACT BY-NAME READS. Opening a specific file by name from a configured directory
 *   is legitimate — the index, the goldens, `brain.json`, and whatever else a project
 *   declares. Counting those turns the guard into noise, and a noisy guard gets
 *   switched off.
 *
 *   BASH-LESS SUBAGENTS. An agent without Bash cannot run the resolver, so denying it a
 *   read leaves it with no way forward at all — it cannot unblock itself. Those are
 *   never denied; the escalation stops at "context" for them. Detection is best-effort
 *   and deliberately errs toward NOT denying: a wrongly-denied agent is stuck, while a
 *   wrongly-exempted one merely gets a reminder.
 *
 * FAIL-OPEN IS ABSOLUTE. Every path is wrapped; a malformed event, an unreadable state
 * file, a missing config or an outright bug all end in "allow" and exit 0. A hook that
 * can break a session is worse than no hook, and this one guards a convenience, not a
 * security boundary. Opt out entirely with VC_FIX_KB_GUARD=off.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { join, resolve as resolvePath } from "node:path";
import { outputRoot } from "../skills/kb/kb-paths.mjs";

/** Bumping this resets nothing — it only documents which escalation policy shipped. */
export const GUARD_VERSION = 1;

export const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  /** Path fragments that mark a knowledge corpus. Matched against a normalized path. */
  roots: [".knowledge/", ".claude/knowledge/", "plugins/vc-fix/knowledge/", "knowledge/oracles/"],
  /**
   * Contract by-name reads: a Read of a file under one of these is never counted.
   * Project-configurable via project-profile.json -> knowledge.guard.exemptDirs.
   */
  exemptDirs: ["exam/", "digest/"],
  /** Files that are read by name as a matter of contract, wherever they live. */
  exemptFiles: ["brain.json", "knowledge-index.json", "goldens.json", "README.md"],
  escalation: { nudge: 1, context: 3, deny: 5 },
  /** A subagent we cannot prove has Bash is treated as Bash-less: never denied. */
  assumeSubagentsBashless: true,
  bashlessAgents: [],
  /** Sessions kept in the state file; oldest are dropped past this. */
  maxSessions: 20,
});

/** Search-shaped tools: they sweep a corpus rather than open one named file. */
const SEARCH_TOOLS = new Set(["Grep", "Glob"]);
/** Shell commands that are a corpus sweep in disguise. */
const SHELL_SEARCH_RE = /\b(grep|rg|ripgrep|ag|ack|find|fgrep|egrep|sed|awk|cat|head|tail|ls|dir)\b/;
/** A shell command that IS the door — never counted against the caller. */
const RESOLVER_RE = /\b(kb:resolve|kb:index|kb:exam|kb:drift|kb:consolidate|resolve\.mjs|gen-index\.mjs|exam\.mjs|drift-check\.mjs|consolidate\.mjs|capture\.mjs)\b/;

const norm = (s) => String(s === undefined || s === null ? "" : s).replace(/\\/g, "/");

/** Project overrides for the guard, if the profile carries any. Never throws. */
export function loadConfig(root) {
  const base = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
  try {
    const file = join(root || outputRoot(), "project-profile.json");
    if (!existsSync(file)) return base;
    const profile = JSON.parse(readFileSync(file, "utf8"));
    const guard = (profile && profile.knowledge && profile.knowledge.guard) || {};
    for (const key of Object.keys(guard)) {
      if (key === "escalation" && guard.escalation && typeof guard.escalation === "object") {
        base.escalation = Object.assign({}, base.escalation, guard.escalation);
      } else base[key] = guard[key];
    }
  } catch { /* a malformed profile must not disable a session */ }
  return base;
}

const stateFile = (root) => join(root || outputRoot(), ".vc-fix", "kb-guard-state.json");

export function readState(root) {
  try {
    const file = stateFile(root);
    if (!existsSync(file)) return { version: GUARD_VERSION, sessions: {} };
    const raw = JSON.parse(readFileSync(file, "utf8"));
    return { version: raw.version || GUARD_VERSION, sessions: raw.sessions || {} };
  } catch {
    return { version: GUARD_VERSION, sessions: {} };
  }
}

export function writeState(root, state, config) {
  try {
    const max = (config && config.maxSessions) || DEFAULT_CONFIG.maxSessions;
    const ids = Object.keys(state.sessions);
    if (ids.length > max) {
      const keep = ids
        .sort((a, b) => String(state.sessions[b].at || "").localeCompare(String(state.sessions[a].at || "")))
        .slice(0, max);
      const trimmed = {};
      for (const id of keep) trimmed[id] = state.sessions[id];
      state.sessions = trimmed;
    }
    mkdirSync(join(root || outputRoot(), ".vc-fix"), { recursive: true });
    writeFileSync(stateFile(root), JSON.stringify(state, null, 2) + "\n", "utf8");
    return true;
  } catch {
    return false;
  }
}

/* ---------------------------------------------------------------- detection */

const underKnowledgeRoot = (path, config) => {
  const p = norm(path);
  if (!p) return false;
  return config.roots.some((r) => p.includes(norm(r)) || p.endsWith(norm(r).replace(/\/$/, "")));
};

const isExemptPath = (path, config) => {
  const p = norm(path);
  if (config.exemptFiles.some((f) => p.endsWith("/" + f) || p === f)) return true;
  return config.exemptDirs.some((d) => p.includes(norm(d)));
};

/**
 * Does this tool call sweep a knowledge root instead of asking the resolver?
 * @returns {{hit: boolean, why: string, byName: boolean, target: string}}
 */
export function classifyAccess(event, config) {
  const tool = String((event && event.tool_name) || "");
  const input = (event && event.tool_input) || {};

  if (tool === "Bash") {
    const cmd = String(input.command || "");
    if (RESOLVER_RE.test(cmd)) return { hit: false, why: "invokes the resolver itself", byName: false, target: "" };
    if (!SHELL_SEARCH_RE.test(cmd)) return { hit: false, why: "not a search command", byName: false, target: "" };
    const target = (norm(cmd).match(/[^\s"']*(?:\.knowledge|knowledge)\/[^\s"']*/) || [""])[0];
    if (!underKnowledgeRoot(cmd, config)) return { hit: false, why: "does not reference a knowledge root", byName: false, target: "" };
    return { hit: true, why: "a shell search over a knowledge root", byName: false, target };
  }

  if (SEARCH_TOOLS.has(tool)) {
    const target = norm(input.path || input.glob || input.pattern || "");
    const referenced = underKnowledgeRoot(input.path, config) || underKnowledgeRoot(input.glob, config) || underKnowledgeRoot(input.pattern, config);
    if (!referenced) return { hit: false, why: "does not reference a knowledge root", byName: false, target: "" };
    return { hit: true, why: tool + " over a knowledge root", byName: false, target };
  }

  if (tool === "Read") {
    const target = norm(input.file_path || input.path || "");
    if (!underKnowledgeRoot(target, config)) return { hit: false, why: "does not reference a knowledge root", byName: false, target: "" };
    if (isExemptPath(target, config)) return { hit: false, why: "contract by-name read of an exempt path", byName: true, target };
    return { hit: true, why: "a by-name read of a knowledge file that bypasses the resolver", byName: true, target };
  }

  return { hit: false, why: "not a knowledge access", byName: false, target: "" };
}

/**
 * Best-effort: is this call coming from a subagent that cannot run Bash, and therefore
 * cannot unblock itself? Errs toward YES — a wrongly-denied agent is stuck, a wrongly
 * exempted one only misses a nudge.
 */
export function isBashlessSubagent(event, config) {
  const name = String((event && (event.agent_type || event.subagent_type || event.agent)) || "");
  if (name && (config.bashlessAgents || []).includes(name)) return true;
  const looksLikeSubagent = Boolean(
    (event && (event.is_sidechain === true || event.isSidechain === true)) ||
    (event && event.parent_tool_use_id) ||
    name,
  );
  return Boolean(looksLikeSubagent && config.assumeSubagentsBashless);
}

/* -------------------------------------------------------------- the decision */

const NUDGE = "vc-fix kb: that read went around the resolver. `npm run kb:resolve -- \"@kb(<id>)\"` (or `--topic \"<question>\"`) answers with the CLIENT layer applied — a raw grep silently misses every client override and suppress.";
const CONTEXT = "vc-fix kb: repeated searches over the knowledge corpus this session. Use the resolver: `npm run kb:resolve -- --topic \"<your question>\" --json`. It returns the entry id, its scope, and an explicit MISS when the corpus genuinely has no answer — a grep cannot tell you the difference between 'no rule' and 'the rule is one layer up'.";
const DENY = [
  "BLOCKED by the knowledge guard — ask the brain first.",
  "",
  "This session has repeatedly searched the knowledge corpus directly instead of resolving.",
  "Run one of these instead, then proceed with what it returns:",
  "",
  '  npm run kb:resolve -- "@kb(<entry-id>)" --json',
  '  npm run kb:resolve -- --topic "<your question>" --json',
  "",
  "Why this is enforced: the resolver applies client precedence (suppress > override >",
  "extend > new > platform) and answers an unknown id with an explicit MISS object. A",
  "grep over the platform layer returns a rule this deployment may have overridden or",
  "switched off, and a grep that finds nothing looks identical to knowledge that does",
  "not exist — which is how invented rules get written.",
  "",
  "Exempt by contract: reads of brain.json / knowledge-index.json / goldens.json and of",
  "any directory listed in project-profile.json -> knowledge.guard.exemptDirs.",
  "Opt out for this machine: VC_FIX_KB_GUARD=off",
].join("\n");

/**
 * Decide what to do with one tool call.
 * @returns {{action: "allow"|"nudge"|"context"|"deny", count: number, reason: string, exemption: string}}
 */
export function classify(event, config, state, env) {
  const e = env || process.env;
  if (String(e.VC_FIX_KB_GUARD || "").toLowerCase() === "off") {
    return { action: "allow", counted: false, count: 0, reason: "VC_FIX_KB_GUARD=off", exemption: "env-opt-out" };
  }
  if (!config.enabled) {
    return { action: "allow", counted: false, count: 0, reason: "guard disabled in project-profile.json", exemption: "config-opt-out" };
  }

  const access = classifyAccess(event, config);
  if (!access.hit) {
    return { action: "allow", counted: false, count: currentCount(event, state), reason: access.why, exemption: access.byName ? "by-name-read" : "" };
  }

  const sid = String((event && event.session_id) || "unknown");
  const prev = (state.sessions && state.sessions[sid]) || { count: 0 };
  const count = Number(prev.count || 0) + 1;
  const esc = config.escalation;
  const bashless = isBashlessSubagent(event, config);

  let action = "allow";
  if (count >= esc.deny) action = "deny";
  else if (count >= esc.context) action = "context";
  else if (count >= esc.nudge) action = "nudge";

  if (action === "deny" && bashless) {
    // It cannot run the resolver, so denying leaves it no path at all.
    return { action: "context", counted: true, count, reason: access.why, exemption: "bashless-subagent" };
  }
  return { action, counted: true, count, reason: access.why, exemption: bashless ? "bashless-subagent" : "" };
}

function currentCount(event, state) {
  const sid = String((event && event.session_id) || "unknown");
  const s = (state.sessions && state.sessions[sid]) || {};
  return Number(s.count || 0);
}

/** The stdout payload for a decision, in Claude Code's PreToolUse shape. */
export function renderDecision(decision) {
  if (decision.action === "deny") return JSON.stringify({ decision: "block", reason: DENY });
  if (decision.action === "context" || decision.action === "nudge") {
    return JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        additionalContext: decision.action === "context" ? CONTEXT : NUDGE,
      },
    });
  }
  return "";
}

/* ----------------------------------------------------------------------- CLI */

function readStdin() {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function main() {
  let event = null;
  try {
    const raw = readStdin();
    if (!raw.trim()) return 0;
    event = JSON.parse(raw);
  } catch {
    return 0; // an unreadable event is never a reason to block work
  }
  try {
    const root = String(event.cwd || "") ? resolvePath(String(event.cwd)) : outputRoot();
    const config = loadConfig(root);
    const state = readState(root);
    const decision = classify(event, config, state);
    if (decision.counted) {
      const sid = String(event.session_id || "unknown");
      state.sessions[sid] = { count: decision.count, lastAction: decision.action, at: new Date().toISOString() };
      writeState(root, state, config);
    }
    const payload = renderDecision(decision);
    if (payload) process.stdout.write(payload);
    return 0;
  } catch (err) {
    process.stderr.write("kb-guard hook error (failing open): " + ((err && err.message) || err) + "\n");
    return 0;
  }
}

const invokedDirectly = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (invokedDirectly) process.exit(main());

export { main, NUDGE, CONTEXT, DENY };
