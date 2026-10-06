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
 * terminal, an unreadable path) and one held only by subagents that look FINISHED: transcript idle for
 * `SUBAGENT_IDLE_MS` and not busy -- a subagent that finished, crashed, was stopped, or whose
 * SubagentStop arrived without a transcript path. One still inside a long tool call is busy, however
 * quiet its transcript, and keeps its ask -- until that call's own timeout (at least the push's
 * background window) has passed, so a subagent killed mid-call is not deferred forever. Before, those were raised by nobody. A subagent's stop raises only what
 * its own transcript holds, and nothing when it cannot read it.
 *
 * IT WRITES ONLY ITS OWN FILE, append-only: the asks it raised go to `<session>.reminded.ndjson`, one
 * per line (`remindedPath`), so stops finishing together never erase each other's markers. Once a day
 * it deletes journals idle for `KEEP_DAYS`, and a reminded file only together with its journal.
 * Transcripts are read only when there is something open to attribute.
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
import { appendFileSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasSessionId, hookEnv, isSynthetic, kbDisabled, queueDir, readLoop, remindDisabled, remindedPath,
} from '../../scripts/kb/core/queue.mjs';
import { openLoops, reminderText } from '../../scripts/kb/core/loop.mjs';
import { BACKGROUND_WINDOW_MS, carries, cliKey, kbShellCalls } from '../../scripts/kb/core/caller.mjs';

const KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
const SUBAGENT_IDLE_MS = 10 * 60 * 1000;

const ageOf = (path, now) => { try { return now - statSync(path).mtimeMs; } catch { return Infinity; } };
const readText = (path) => { try { return path ? readFileSync(path, 'utf8') : null; } catch { return null; } };

/** Delete journals idle for KEEP_DAYS, and a reminded file only once its journal is gone or idle too. */
function prune(dir, now = Date.now()) {
  const marker = join(dir, 'loop.pruned');
  if (ageOf(marker, now) < DAY_MS) return;
  try { writeFileSync(marker, ''); } catch { return; }
  let names = [];
  try { names = readdirSync(dir); } catch { return; }
  const idle = (path) => ageOf(path, now) > KEEP_DAYS * DAY_MS;
  for (const name of names) {
    const path = join(dir, name);
    if (name.endsWith('.loop.ndjson')) {
      if (idle(path)) { try { unlinkSync(path); } catch { /* raced or gone */ } }
    } else if (name.endsWith('.reminded.ndjson')) {
      const journal = join(dir, `${name.slice(0, -'.reminded.ndjson'.length)}.loop.ndjson`);
      if (idle(path) && idle(journal)) { try { unlinkSync(path); } catch { /* raced or gone */ } }
    }
  }
}

/** The asks already raised: every line of the append-only record. */
function raisedAts(path) {
  const text = readText(path);
  return text === null ? [] : text.split('\n').map((l) => l.trim()).filter(Boolean);
}

/**
 * A transcript read ONCE per stop: its text, its kb shell calls (parsed once, not per ask), and
 * whether its agent is still at work -- a `tool_use` with no `tool_result` yet. A subagent inside one
 * long tool call (a 10-minute seed, a regression run, a Monitor wait) writes nothing to its transcript,
 * so its age alone cannot say it finished (PR #400 review).
 */
function transcriptOf(path, now) {
  const text = readText(path);
  if (text === null) return null;
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
  // BUSY EXPIRES. A subagent that crashed or was killed mid-call keeps a dangling tool_use forever, so
  // "open call" alone would defer its asks at every later Stop and nobody would raise them (PR #400
  // review). It counts as busy only while its transcript is younger than the longest open call's own
  // timeout, and never less than BACKGROUND_WINDOW_MS -- the window the push join already trusts.
  const open = [...used].filter(([id]) => !answered.has(id)).map(([, timeout]) => (Number.isFinite(timeout) ? timeout : 0));
  const age = ageOf(path, now);
  const busy = open.length > 0 && age < Math.max(BACKGROUND_WINDOW_MS, ...open);
  return { text, calls: kbShellCalls(text), busy, age };
}

/**
 * Does this transcript hold this ask? MCP: its call id. CLI: a kb shell call that carries its question
 * AND was running when the ask was logged -- the window `caller.mjs` gives the push join. Without the
 * window, a subagent re-asking the question its brief named would hold the main thread's ask too.
 */
function holds(t, loop) {
  if (!t) return false;
  if (loop.call) return t.text.includes(loop.call);
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
  return names.filter((n) => n.endsWith('.jsonl')).map((n) => transcriptOf(join(dir, n), now)).filter(Boolean);
}

/** The open asks THIS stop owns (see the header). */
function owned(loops, { sub, transcript, now = Date.now() }) {
  const own = transcriptOf(transcript, now);
  if (sub) return own === null ? [] : loops.filter((l) => holds(own, l));
  if (own === null) return loops;
  const mine = [];
  const rest = [];
  for (const l of loops) (holds(own, l) ? mine : rest).push(l);
  if (!rest.length) return mine;
  const subs = subagentTranscripts(transcript, now);
  // FINISHED = idle for SUBAGENT_IDLE_MS AND no tool call still open. A holder that is busy keeps it.
  const finished = (s) => !s.busy && s.age > SUBAGENT_IDLE_MS;
  for (const l of rest) {
    const holders = subs.filter((s) => holds(s, l));
    if (!holders.length || holders.every(finished)) mine.push(l);
  }
  return mine;
}

function main() {
  let payload = null;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { /* no stdin, or not JSON */ }
  if (payload?.stop_hook_active) return;
  if (kbDisabled(process.env)) return;
  // Pruned BEFORE the reminder's own off switches: the journal is written whenever the base is on,
  // so a machine with KB_REMIND=0 or a synthetic run must still have its files cleaned.
  prune(queueDir(process.env));
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
  const loops = owned(open, { sub, transcript: sub ? payload?.agent_transcript_path : payload?.transcript_path });
  if (!loops.length) return;

  try { appendFileSync(path, `${loops.map((l) => l.at).join('\n')}\n`, 'utf8'); } catch { return; }
  process.stdout.write(JSON.stringify({ decision: 'block', reason: reminderText(loops) }));
}

try { main(); } catch { /* a reminder must never fail a session */ }
process.exit(0);
