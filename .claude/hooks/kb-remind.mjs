#!/usr/bin/env node
/**
 * kb-remind — at the end of a turn, ask once about knowledge-base misses that were never written back.
 *
 * WHY A HOOK (VCST-6156). The loop the base exists for is "ask -> nothing -> find out -> capture", and
 * measured 2026-09-30 .. 10-06 it closed in about three sessions of four: of 30 sessions with a miss,
 * 8 wrote nothing back. The prompts already carry the write step; what they cannot do is notice, at
 * the end, that a particular question was left open. `Stop` is the one moment that is observable --
 * and the only one that works: in those 8 sessions the agent never called the base again after the
 * miss, so a reminder riding on a later kb response would have reached nobody.
 *
 * WHAT IT DOES. Reads this session's loop journal (`<session>.loop.ndjson`, append-only, see
 * `core/queue.mjs` `loopPath`) and, when `core/loop.mjs` `openLoops` finds a miss or an unclosed
 * `ambiguous` list with nothing written after it, returns `{"decision":"block","reason":…}`: the agent
 * takes ONE more step to capture what it found, or to say in a line that it did not find it out.
 *
 * EACH AGENT IS ASKED ABOUT ITS OWN MISSES. Registered on `Stop` (the main thread) AND `SubagentStop`.
 * Claude Code writes the main thread to `transcript_path` and every subagent to its own
 * `agent_transcript_path` under `<session>/subagents/` (`core/caller.mjs` measured 12 of 12 ids that
 * way). An ask belongs to the transcript that HOLDS it: an MCP ask by its tool-use id (`call`), a CLI
 * ask by the shell call that ran it -- found with `caller.mjs` `kbShellCalls` / `carries`, the same
 * join the push uses to attribute CLI lines. So a subagent is reminded of its own misses at its own
 * SubagentStop, and the main thread's Stop does not raise -- and mark -- a still-working subagent's.
 *
 * NOTHING IS ORPHANED. The main thread also takes an open ask that NO transcript holds (a plain
 * terminal, an unreadable path) and one held only by subagents that look FINISHED: not busy, and either
 * its last turn ENDED (its final message calls no tool) or its transcript idle for `SUBAGENT_IDLE_MS` --
 * a subagent that finished, crashed, was stopped, or whose own SubagentStop raised nothing
 * (`stop_hook_active`, no transcript path). An ended turn is not made to wait out the idle window. One still inside a long tool call is busy, however
 * quiet its transcript, and keeps its ask -- until that call's own timeout (30 min when it set none)
 * has passed, so a subagent killed mid-call is not deferred for long. Before, those were raised by nobody. A subagent's stop raises only what
 * its own transcript holds, and nothing when it cannot read it.
 *
 * IT WRITES ONLY ITS OWN FILE, append-only: the asks it raised go to `<session>.reminded.ndjson`, one
 * per line (`remindedPath`), so stops finishing together never erase each other's markers. Retention is
 * the journal WRITER's (`queue.mjs` `pruneLoops`), so it runs wherever journals are written, hook or not.
 * Transcripts are read only when there is something open to attribute; a subagent found to hold an
 * ask is remembered in `<session>.owners.ndjson`, and later stops read only the tail of that one file.
 *
 * GUARDS, because a stop hook that blocks is a hook that can trap a session:
 *   1. `stop_hook_active` (set by the harness while a stop hook already made Claude continue) -> silent.
 *   2. Every question is raised ONCE: its ask `at` is appended BEFORE the reason is printed, so a crash
 *      after the write costs a reminder, never a loop.
 *   3. Off switches: `KB_ENABLED=0` (the base is off on this machine), `KB_REMIND=0` (this hook only),
 *      and `KB_SYNTHETIC=1`: a calibration or bench run must not take an extra step it did not ask for.
 *
 * WHAT THE OPERATOR SEES: Claude Code labels any blocking stop hook "Stop hook error occurred" in its
 * UI -- the reminder, not a fault (verified live 2026-10-06; the model receives it as "Stop hook
 * feedback"). The reason opens with "kb reminder (not a failure)" for whoever expands it.
 *
 * Exits 0 whatever happens and prints NOTHING unless it is blocking.
 */
import { appendFileSync, closeSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasSessionId, hookEnv, isSynthetic, kbDisabled, ownersPath, pruneLoops, queueDir, readLoop, remindDisabled, remindedPath,
} from '../../scripts/kb/core/queue.mjs';
import { openLoops, reminderText } from '../../scripts/kb/core/loop.mjs';
import { BACKGROUND_DEFAULT_MS, carries, cliKey, kbShellCalls } from '../../scripts/kb/core/caller.mjs';

const SUBAGENT_IDLE_MS = 10 * 60 * 1000;
const TAIL_BYTES = 512 * 1024;

const ageOf = (path, now) => { try { return now - statSync(path).mtimeMs; } catch { return Infinity; } };
const readText = (path) => { try { return path ? readFileSync(path, 'utf8') : null; } catch { return null; } };

/** The last TAIL_BYTES of a file -- where an agent's still-open tool call is. */
function readTail(path) {
  let fd;
  try {
    fd = openSync(path, 'r');
    const size = fstatSync(fd).size;
    const len = Math.min(size, TAIL_BYTES);
    const buf = Buffer.alloc(len);
    readSync(fd, buf, 0, len, size - len);
    return buf.toString('utf8');
  } catch { return null; } finally { if (fd !== undefined) try { closeSync(fd); } catch { /* closed */ } }
}

/**
 * Is the agent of this transcript still at work? A `tool_use` with no `tool_result` yet -- a subagent
 * inside one long tool call writes nothing, so age alone cannot say it finished. BUSY EXPIRES: a
 * subagent killed mid-call keeps its dangling `tool_use` forever, so a call counts as open only for its
 * own `timeout`, or `BACKGROUND_DEFAULT_MS` (30 min) when it set none (PR #400 review).
 */
function busyIn(text, age) {
  if (text === null) return false;
  const used = new Map();
  const answered = new Set();
  for (const raw of text.split('\n')) {
    if (!raw.includes('"tool_use"') && !raw.includes('"tool_result"')) continue;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
    for (const c of Array.isArray(rec?.message?.content) ? rec.message.content : []) {
      if (c?.type === 'tool_use' && c.id) used.set(c.id, Number(c.input?.timeout));
      if (c?.type === 'tool_result' && c.tool_use_id) answered.add(c.tool_use_id);
    }
  }
  const open = [...used].filter(([id]) => !answered.has(id))
    .map(([, timeout]) => (Number.isFinite(timeout) && timeout > 0 ? timeout : BACKGROUND_DEFAULT_MS));
  return open.length > 0 && age < Math.max(...open);
}

/**
 * Did the agent of this transcript END its turn? Its last assistant/user record is an assistant
 * message that calls no tool. Such a subagent is finished at once rather than after SUBAGENT_IDLE_MS:
 * when its own SubagentStop raised nothing (`stop_hook_active`), the main thread's next Stop is the
 * only one left, and the session may end before the idle window does (PR #400 review).
 */
function endedIn(text) {
  if (text === null) return false;
  const rows = text.split('\n');
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    if (!rows[i].includes('"type":"assistant"') && !rows[i].includes('"type":"user"')) continue;
    let rec;
    try { rec = JSON.parse(rows[i]); } catch { continue; }
    if (rec?.type !== 'assistant' && rec?.type !== 'user') continue;
    const content = Array.isArray(rec.message?.content) ? rec.message.content : [];
    return rec.type === 'assistant' && !content.some((c) => c?.type === 'tool_use');
  }
  return false;
}

/** A subagent holder's state: age, busy, ended -- never computed for the stopping agent's own transcript. */
const statusIn = (text, age) => ({ age, busy: busyIn(text, age), ended: endedIn(text) });

/** The asks already raised: every line of the append-only record. */
function raisedAts(path) {
  const text = readText(path);
  return text === null ? [] : text.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * A transcript read in full ONCE per stop: its text and its kb shell calls. `status` (age / busy /
 * ended) only for a SUBAGENT holder: the stopping agent's own state is never read, so its multi-MB
 * transcript is not JSON-parsed a second time on every stop (PR #400 review).
 */
function transcriptOf(path, now, { status = false } = {}) {
  const text = readText(path);
  if (text === null) return null;
  return { path, text, calls: kbShellCalls(text), ...(status ? statusIn(text, ageOf(path, now)) : {}) };
}

/** A known owner's state from its file's tail only -- no full read (PR #400 review). */
function statusOf(path, now) {
  return statusIn(readTail(path), ageOf(path, now));
}

/**
 * Does this transcript OWN this tool-use id? Only a top-level record whose own `message.content`
 * carries `tool_use` with that id: the main transcript also quotes a subagent's ids (nested progress
 * records, Agent results, pasted output), and a substring match claimed those asks (PR #400 review).
 */
function usesCall(text, call) {
  for (let i = text.indexOf(call); i !== -1; i = text.indexOf(call, i + 1)) {
    const start = text.lastIndexOf('\n', i) + 1;
    const end = text.indexOf('\n', i) === -1 ? text.length : text.indexOf('\n', i);
    const raw = text.slice(start, end);
    i = end;
    if (!raw.includes('"tool_use"')) continue;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
    if ((Array.isArray(rec?.message?.content) ? rec.message.content : []).some((c) => c?.type === 'tool_use' && c.id === call)) return true;
  }
  return false;
}

/**
 * Does this transcript hold this ask? MCP: its call id. CLI: a kb shell call that carries its question
 * AND was running when the ask was logged -- the window `caller.mjs` gives the push join. Without the
 * window, a subagent re-asking the question its brief named would hold the main thread's ask too.
 */
function holds(t, loop) {
  if (!t) return false;
  if (loop.call) return usesCall(t.text, loop.call);
  // The needle exactly as the push builds it (`cliKey`: quotes and escapes flattened).
  const key = cliKey({ via: 'cli', kind: 'ask', q: loop.q });
  const at = Date.parse(loop.at);
  return Boolean(key) && Number.isFinite(at) && t.calls.some((c) => c.verbs.has('ask')
    && c.atMs <= at && at <= c.endMs && carries(c.text, key.needle));
}

/** The subagent transcripts of the session whose main transcript is `main`. */
function subagentTranscripts(main, now) {
  if (!main) return [];
  const dir = join(main.replace(/\.jsonl$/, ''), 'subagents');
  let names = [];
  try { names = readdirSync(dir); } catch { return []; }
  return names.filter((n) => n.endsWith('.jsonl')).map((n) => transcriptOf(join(dir, n), now, { status: true })).filter(Boolean);
}

/** ask `at` -> the subagent transcripts already found to hold it (`ownersPath`). */
function readOwners(path) {
  const owners = new Map();
  for (const raw of (readText(path) ?? '').split('\n')) {
    try { const o = JSON.parse(raw); if (o?.at && o?.path) owners.set(o.at, [...(owners.get(o.at) ?? []), o.path]); } catch { /* blank or torn */ }
  }
  return owners;
}

/**
 * The open asks THIS stop owns (see the header). A subagent: what its own transcript holds. The main
 * thread: what its transcript holds, plus every ask no LIVE subagent holds. The main transcript being
 * unreadable no longer hands it the asks of subagents still at work -- the subagent rule still applies
 * (PR #400 review); with no transcript path at all there is nothing to attribute by, and it takes all.
 * A subagent holder found once is cached in `ownersPath`; later stops read only that file's tail.
 */
function owned(loops, { sub, transcript, ownersFile, now = Date.now() }) {
  const own = transcriptOf(transcript, now);
  if (sub) return own === null ? [] : loops.filter((l) => holds(own, l));
  if (!transcript) return loops;
  const mine = [];
  const rest = [];
  for (const l of loops) (holds(own, l) ? mine : rest).push(l);
  if (!rest.length) return mine;
  // FINISHED = no tool call still open AND (its turn ended OR idle for SUBAGENT_IDLE_MS). Busy keeps it.
  const finished = (s) => !s.busy && (s.ended || s.age > SUBAGENT_IDLE_MS);
  const owners = readOwners(ownersFile);
  const unknown = rest.filter((l) => !owners.has(l.at));
  const scanned = unknown.length ? subagentTranscripts(transcript, now) : [];
  const found = [];
  for (const l of unknown) {
    const holders = scanned.filter((s) => holds(s, l)).map((s) => s.path);
    if (holders.length) { owners.set(l.at, holders); for (const p of holders) found.push({ at: l.at, path: p }); }
  }
  if (found.length) { try { appendFileSync(ownersFile, `${found.map((o) => JSON.stringify(o)).join('\n')}\n`, 'utf8'); } catch { /* re-scanned next time */ } }
  const state = new Map();
  for (const s of scanned) state.set(s.path, s);
  const stateOf = (p) => { if (!state.has(p)) state.set(p, statusOf(p, now)); return state.get(p); };
  for (const l of rest) {
    const holders = owners.get(l.at) ?? [];
    if (!holders.length || holders.every((p) => finished(stateOf(p)))) mine.push(l);
  }
  return mine;
}

function main() {
  let payload = null;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { /* no stdin, or not JSON */ }
  if (payload?.stop_hook_active) return;
  if (kbDisabled(process.env)) return;
  // The journal's writer prunes it (`noteLoop`); this is only a backstop for a session that wrote
  // nothing since the last day's pass, and it runs before the reminder's own off switches.
  pruneLoops(queueDir(process.env));
  if (remindDisabled(process.env) || isSynthetic(process.env)) return;

  // The journal is keyed like the queue (`hookEnv` -> `sessionId`); SubagentStop carries the PARENT's
  // session id, so a subagent reads the same journal as its main thread.
  const env = hookEnv(process.env, payload);
  if (!hasSessionId(env)) return;
  const journal = readLoop(env);
  if (!journal.length) return;

  const path = remindedPath(env);
  const sub = payload?.hook_event_name === 'SubagentStop';
  // Nothing open -> no transcript is read: on a session with a long journal and a multi-MB
  // transcript this is every turn end (PR #400 review).
  const open = openLoops(journal, { reminded: raisedAts(path) });
  if (!open.length) return;
  const loops = owned(open, {
    sub, transcript: sub ? payload?.agent_transcript_path : payload?.transcript_path, ownersFile: ownersPath(env),
  });
  if (!loops.length) return;

  try { appendFileSync(path, `${loops.map((l) => l.at).join('\n')}\n`, 'utf8'); } catch { return; }
  process.stdout.write(JSON.stringify({ decision: 'block', reason: reminderText(loops) }));
}

try { main(); } catch { /* a reminder must never fail a session */ }
process.exit(0);
