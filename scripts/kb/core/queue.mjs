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
  // `session` is the DENOMINATOR, and it is the one kind written about a session that may never
  // have touched the base at all. Every other line here is evidence that the base was used, so a
  // log made only of them can count uses and can never count opportunities: a session that ran for
  // an hour and asked nothing looked exactly like no session (`report-analyse.mjs` counted
  // `sessions` as the distinct sessions APPEARING IN THE LOG). One line per session, carrying
  // integers and an id — see `reach.mjs` for what is read to produce it, and what is not.
  'session',
]);

/** Lines the pusher must apply to the base, as opposed to lines that only describe what happened. */
export const MUTATIONS = Object.freeze(['capture', 'confirm', 'dispute']);

/**
 * Is this run a BENCHMARK, a demo or an acceptance test rather than an agent doing work?
 *
 * PLAN §14.2, measured on this base's first 12 log files: six questions appear five times each --
 * 30 of the 39 asks are one latency benchmark, pushed through the same path as real traffic. So
 * the demand log's top six rows were a stopwatch, and §14.1's own denominator was 39 where real
 * demand was 9.
 *
 * MARKED, NOT DROPPED, and the distinction is the whole design. A benchmark must still exercise
 * the real queue, the real push and the real flush -- that is what makes it representative, and a
 * benchmark that writes nowhere measures a path nobody uses. What it must not do is enter the
 * DEMAND panels. So the line is written exactly as any other and carries one extra field; the
 * report filters on it and SAYS how many it filtered, so the number is auditable rather than
 * invisible. A dropped line cannot be checked by anybody; a marked one can.
 *
 * It is an env var and not a flag because it has to reach the MCP server, which nobody passes
 * arguments to: `KB_SYNTHETIC=1` on the harness that spawns the run covers both doors at once.
 */
export const isSynthetic = (env = process.env) => /^(1|true|yes|on)$/i.test(String(env.KB_SYNTHETIC ?? '').trim());

/**
 * How many characters of the host id the short key keeps.
 *
 * Eight, unchanged -- what changed is WHICH eight. Exported because the test asserts the width and
 * a transcribed `8` there would be a constant with a source of truth one file away.
 */
export const KEY_LEN = 8;

/**
 * A leading `<word>_` on a host session id is a MARKER, not identity.
 *
 * THE DEFECT THIS EXISTS TO CLOSE, measured on the published base. `sessionId()` used to slice the
 * host id to `KEY_LEN` characters flat:
 *
 *     CLAUDE_CODE_HOST_SESSION_ID = local_f3d05dd3-25c1-434b-a7ca-4a3d55032484
 *     sessionId()                 = local_f3
 *
 * Six of those eight are the constant `local_`, so a session was identified by TWO HEX CHARACTERS
 * -- 256 values, for every person, every day, forever. Counted 2026-09-21 over
 * `VirtoCommerce/vc-knowledge`: 53 log files, 18 distinct ids, 16 of them of the `local_XX` shape,
 * which by the birthday bound puts the chance that two different sessions already share one at
 * 0.38. AND A COLLISION IS UNDETECTABLE AFTER THE FACT, because only the truncated id is ever
 * stored -- "has this already happened?" is not a question the base can answer. It had bitten once
 * already: `cas-probe.mjs` gave four concurrent processes `cas113496<i>` and all four collapsed to
 * `cas11349` (PLAN 20.6).
 *
 * Matched generically and never as the literal `local_` (`.claude/rules/test-data.md` GOLDEN RULE):
 * the marker is whatever the host puts in front of the underscore, and hard-coding today's value
 * would go stale silently the day it changes -- manufacturing a confident wrong key rather than an
 * error.
 */
const MARKER = /^[A-Za-z]+_/;

/**
 * The key becomes a PUBLIC FILE NAME (`log/<day>/<stamp>-<key>.jsonl`), so it has to be one.
 *
 * The same lesson `publicLocator()` cost us (PLAN 7.1a): ask what a field can CARRY, not only what
 * the scanner can find. A host id is machine-generated and safe today; a key with a separator in it
 * would silently nest the queue file one directory down and write a log path nobody can parse back.
 * An unsafe key is not repaired into something plausible -- it falls through to the honest
 * per-process id.
 */
const FILENAME_SAFE = /^[A-Za-z0-9_-]+$/;

/**
 * Host session id -> the short key everything is partitioned by. Pure, so the derivation is what
 * the test pins.
 *
 * STILL A GENUINE PREFIX OF THE REAL ID, never a hash: the key stays recognisable next to the id it
 * came from and greppable against it. Same width, 4 billion values instead of 256.
 *
 * The marker is stripped only when what remains still carries a full key's worth of characters.
 * `local_ab` strips to `ab`, and answering with two characters is the defect again with extra
 * steps -- the raw id is no less distinguishing and is stable, so it wins.
 */
export function shortSession(hostId) {
  const id = String(hostId ?? '').trim();
  const stripped = id.replace(MARKER, '');
  const key = (stripped.length >= KEY_LEN ? stripped : id).slice(0, KEY_LEN);
  return FILENAME_SAFE.test(key) ? key : '';
}

/**
 * Session identity is free: `CLAUDE_CODE_HOST_SESSION_ID` is inherited by child processes, so the
 * tool knows its own session without being told. The prior art's measured pain -- one missed
 * prefix drops a question row silently, 25 times out of 25 -- simply does not arise.
 *
 * The fallback is a per-process id, which is honest: it says "this run", which is the most a
 * process outside a Claude session can truthfully claim. It also catches the two ways the env var
 * can be present and useless -- blank, or unusable as a file name -- because a key that cannot be
 * a path is worth less than an admission that there was no session.
 */
export function sessionId(env = process.env) {
  const raw = env.CLAUDE_CODE_HOST_SESSION_ID || env.CLAUDE_SESSION_ID;
  return shortSession(raw) || `p${process.pid}`;
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
  // `synthetic` is stamped LAST and by the single writer, so no verb can forget it and no verb can
  // fake it: one env var marks every line a benchmark run produces, including its flush.
  const line = { at: new Date().toISOString(), ...record, ...(isSynthetic(env) ? { synthetic: true } : {}) };
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
