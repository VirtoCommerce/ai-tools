#!/usr/bin/env node
/**
 * kb-remind — at the end of a turn, ask once about knowledge-base misses that were never written back.
 *
 * WHY A HOOK (VCST-6156). The loop the base exists for is "ask -> nothing -> find out -> capture", and
 * measured 2026-09-30 .. 10-06 it closed in about three sessions of four: of 30 sessions with a miss,
 * 8 wrote nothing back. The prompts already carry the write step; what they cannot do is notice, at
 * the end, that a particular question was left open. `Stop` is the one moment that is observable.
 *
 * WHAT IT DOES. Reads this session's local sidecar (`<session>.meta.json`, see `core/queue.mjs`
 * `metaOutcomes`) and, when `core/loop.mjs` `openLoops` finds a miss or an unclosed `ambiguous` list
 * with nothing written after it, returns `{"decision":"block","reason":…}`: the agent takes ONE more
 * step to capture what it found, or to say in a line that it did not find it out. Nothing is decided
 * for the agent -- only it knows whether it established the answer.
 *
 * THREE GUARDS, because a Stop hook that blocks is a hook that can trap a session:
 *   1. `stop_hook_active` (set by the harness while a Stop hook already made Claude continue) -> silent.
 *   2. Every question is raised ONCE: its ask `at` goes into `meta.reminded` BEFORE the reason is
 *      printed, so a crash after the write costs a reminder, never a loop.
 *   3. Off switches: `KB_ENABLED=0` (the base is off on this machine) or `KB_REMIND=0` (this hook only).
 *
 * WHAT THE OPERATOR SEES: Claude Code labels any blocking Stop hook "Stop hook error occurred" in its
 * UI -- the reminder, not a fault (verified live 2026-10-06; the model receives it as "Stop hook
 * feedback"). The reason opens with "kb reminder (not a failure)" for whoever expands it.
 *
 * Exits 0 whatever happens and prints NOTHING unless it is blocking; the sidecar read is a few KB.
 * `kb-flush.mjs` is the other Stop hook and stays silent by design -- the two never share stdout.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { hasSessionId, hookEnv, kbDisabled, metaPath } from '../../scripts/kb/core/queue.mjs';
import { openLoops, reminderText } from '../../scripts/kb/core/loop.mjs';

const remindOff = (env) => /^(0|false|no|off)$/i.test(String(env.KB_REMIND ?? '').trim());

function main() {
  let payload = null;
  try { payload = JSON.parse(readFileSync(0, 'utf8')); } catch { /* no stdin, or not JSON */ }
  if (payload?.stop_hook_active) return;
  if (kbDisabled(process.env) || remindOff(process.env)) return;

  // The sidecar is keyed like the queue (`hookEnv` -> `sessionId`); with no session id anywhere the
  // key is a fresh process key and names no sidecar this session wrote.
  const env = hookEnv(process.env, payload);
  if (!hasSessionId(env)) return;
  const path = metaPath(env);
  let meta;
  try { meta = JSON.parse(readFileSync(path, 'utf8')); } catch { return; }
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return;

  const loops = openLoops(meta);
  if (!loops.length) return;

  const reminded = [...(Array.isArray(meta.reminded) ? meta.reminded : []), ...loops.map((l) => l.at)].slice(-200);
  try { writeFileSync(path, JSON.stringify({ ...meta, reminded }), 'utf8'); } catch { return; }

  process.stdout.write(JSON.stringify({ decision: 'block', reason: reminderText(loops) }));
}

try { main(); } catch { /* a reminder must never fail a session */ }
process.exit(0);
