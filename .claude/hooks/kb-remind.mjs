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
 * An ask made through MCP carries its tool-use id (`call`); Claude Code writes the main thread to
 * `transcript_path` and every subagent to its own `agent_transcript_path` (`core/caller.mjs` measured
 * 12 of 12 ids resolving that way). So an ask is raised only at the stop whose transcript holds its
 * call id. Before this, the main thread's Stop raised -- and marked as raised -- the misses of
 * background subagents still at work, which then were never raised to the agent that owned them
 * (PR #400 review). An ask with no call id (the CLI door) cannot be attributed and is raised at the
 * main thread's Stop only. A transcript is read only when there is something open to attribute.
 *
 * IT WRITES ONLY ITS OWN FILE. The journal is the kb processes'; what this hook remembers -- the
 * asks it already raised -- goes to `<session>.reminded.json`, temp file + rename (`remindedPath`).
 * Once a day it deletes journals idle for `KEEP_DAYS`, and a reminded file only together with its
 * journal: a long session whose record outlived its last reminder must not be reminded again.
 *
 * GUARDS, because a stop hook that blocks is a hook that can trap a session:
 *   1. `stop_hook_active` (set by the harness while a stop hook already made Claude continue) -> silent.
 *   2. Every question is raised ONCE: its ask `at` is recorded BEFORE the reason is printed, so a crash
 *      after the write costs a reminder, never a loop.
 *   3. Off switches: `KB_ENABLED=0` (the base is off on this machine), `KB_REMIND=0` (this hook only),
 *      and `KB_SYNTHETIC=1`: a calibration or bench run must not take an extra step it did not ask for.
 *
 * WHAT THE OPERATOR SEES: Claude Code labels any blocking Stop hook "Stop hook error occurred" in its
 * UI -- the reminder, not a fault (verified live 2026-10-06; the model receives it as "Stop hook
 * feedback"). The reason opens with "kb reminder (not a failure)" for whoever expands it.
 *
 * Exits 0 whatever happens and prints NOTHING unless it is blocking.
 */
import { readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasSessionId, hookEnv, isSynthetic, kbDisabled, queueDir, readLoop, remindDisabled, remindedPath,
} from '../../scripts/kb/core/queue.mjs';
import { LOOP_ASKS, openLoops, reminderText } from '../../scripts/kb/core/loop.mjs';

// Must exceed LOOP_ASKS: an ask still inside the judged window must still be in the record.
const REMEMBERED = LOOP_ASKS * 2;
const KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

const ageOf = (path, now) => { try { return now - statSync(path).mtimeMs; } catch { return Infinity; } };

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
    } else if (name.endsWith('.reminded.json')) {
      const journal = join(dir, `${name.slice(0, -'.reminded.json'.length)}.loop.ndjson`);
      if (idle(path) && idle(journal)) { try { unlinkSync(path); } catch { /* raced or gone */ } }
    }
  }
}

function readJson(path) {
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; }
}

/**
 * The open asks THIS stop owns. `transcript` is the stopping agent's own transcript; `main` says
 * whether it is the main thread. With no readable transcript the main thread keeps every open ask
 * and a subagent raises nothing -- a missed reminder rather than one sent to the wrong agent.
 */
function owned(loops, { transcript, main }) {
  if (!loops.some((l) => l.call)) return main ? loops : [];
  let text = null;
  try { text = transcript ? readFileSync(transcript, 'utf8') : null; } catch { text = null; }
  if (text === null) return main ? loops : [];
  return loops.filter((l) => (l.call ? text.includes(l.call) : main));
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
  const before = readJson(path);
  const raised = Array.isArray(before) ? before.map(String) : [];
  const sub = payload?.hook_event_name === 'SubagentStop';
  const loops = owned(openLoops(journal, { reminded: raised }), {
    transcript: sub ? payload?.agent_transcript_path : payload?.transcript_path,
    main: !sub,
  });
  if (!loops.length) return;

  const tmp = `${path}.${process.pid}.tmp`;
  try {
    writeFileSync(tmp, JSON.stringify([...raised, ...loops.map((l) => l.at)].slice(-REMEMBERED)), 'utf8');
    renameSync(tmp, path);
  } catch { return; }

  process.stdout.write(JSON.stringify({ decision: 'block', reason: reminderText(loops) }));
}

try { main(); } catch { /* a reminder must never fail a session */ }
process.exit(0);
