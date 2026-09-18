// The queue and the log -- one file, because in this design they are the same file (PLAN §7).
//
// Every verb appends exactly ONE JSONL line, and THE LINE RECORDS THE OUTCOME, INCLUDING THE
// FAILURES. Logging only successes would systematically under-report exactly the events the report
// exists to surface: a miss is the highest-value line in the file, and a capture refused as a
// duplicate is a ranking miss that did NOT become a duplicate -- neither is a success and both are
// the point.
//
// The queued MUTATIONS (capture / confirm / dispute) live in the same file as the log lines,
// because a session's changes and its account of them are one record and splitting them lets one
// ship without the other. The pusher reads the file, takes the mutation lines, and writes the
// whole file into the base as that session's log.
//
// WHAT A LINE NEVER CARRIES: entry bodies. Ids and subjects only. That keeps volume at the
// measured ~164 B/line and keeps claim prose out of a second place where it could drift.
//
// AND THE BASE IS PUBLIC, so everything here is public. The `question` field is stored VERBATIM --
// a hashed or redacted question makes the miss panel worthless, and the miss panel is the point of
// the whole exercise. What makes that acceptable is the pre-push secret gate (vendor/agent-log/),
// run over this file BEFORE the push, plus the fact that these questions are about a public
// product. Extending the base to client deployments must re-decide it first (PLAN §7, §11).

import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** Operations that are logged. `stat` is deliberately absent: an operator looking at the tool is
 *  not an agent using the base, and logging it would put noise in the panel that matters. */
export const LOGGED = Object.freeze([
  'ask', 'show', 'capture', 'capture-refused', 'confirm', 'dispute', 'flush', 'reindex', 'redacted',
]);

/** Lines the pusher must apply to the base, as opposed to lines that only describe what happened. */
export const MUTATIONS = Object.freeze(['capture', 'confirm', 'dispute']);

/**
 * Session identity is free: `CLAUDE_CODE_HOST_SESSION_ID` is inherited by child processes, so the
 * tool knows its own session without being told. The prior art's measured pain -- one missed
 * prefix drops a question row silently, 25 times out of 25 -- simply does not arise.
 *
 * The fallback is a per-process id, which is honest: it says "this run", which is the most a
 * process outside a Claude session can truthfully claim.
 */
export function sessionId(env = process.env) {
  const id = env.CLAUDE_CODE_HOST_SESSION_ID || env.CLAUDE_SESSION_ID;
  return id ? String(id).slice(0, 8) : `p${process.pid}`;
}

/**
 * Where the queue lives. A scratchpad, never the repo: these files are transient, they are swept
 * by the push, and a queue in the working tree would show up in `git status` and be committed by
 * somebody tidying up.
 */
export function queueDir(env = process.env) {
  return env.KB_QUEUE_DIR || join(tmpdir(), 'claude-kb-queue');
}

export function queuePath(env = process.env) {
  return join(queueDir(env), `${sessionId(env)}.jsonl`);
}

/**
 * Append one line. Never throws: a tool that fails an ASK because it could not write its own log
 * has traded the thing the user wanted for bookkeeping. A failed write is reported on the result
 * instead, so it is visible without being fatal.
 */
export async function log(record, { env = process.env } = {}) {
  const line = { at: new Date().toISOString(), ...record };
  const path = queuePath(env);
  try {
    await mkdir(queueDir(env), { recursive: true });
    await appendFile(path, `${JSON.stringify(line)}\n`, 'utf8');
    return { ok: true, path, line };
  } catch (err) {
    return { ok: false, path, line, why: `${err.code ?? 'EUNKNOWN'}: ${err.message}` };
  }
}

/** Read this session's queue back -- used by `stat` for the depth, and by the pusher later. */
export async function readQueue({ env = process.env, path = null } = {}) {
  const file = path ?? queuePath(env);
  if (!existsSync(file)) return { path: file, lines: [], malformed: 0 };
  const text = await readFile(file, 'utf8');
  const lines = [];
  let malformed = 0;
  for (const raw of text.split('\n')) {
    if (!raw.trim()) continue;
    try {
      lines.push(JSON.parse(raw));
    } catch {
      // A truncated last line from an interrupted write. Counted, not thrown: one unreadable line
      // must not cost the session its whole log.
      malformed += 1;
    }
  }
  return { path: file, lines, malformed };
}

/** How many queued changes are waiting to be pushed -- the number `stat` prints. */
export const pendingMutations = (lines) => lines.filter((l) => MUTATIONS.includes(l.kind)).length;
