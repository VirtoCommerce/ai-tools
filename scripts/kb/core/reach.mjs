// REACH — how much work a session did, and where in it the base was consulted.
//
// THE HOLE THIS FILLS. Every panel in `kb:report` is built from lines the base received, so the
// base can only see sessions that spoke to it. `report-analyse.mjs` counts `sessions` as the number
// of DISTINCT SESSIONS THAT APPEAR IN THE LOG — a session that ran for an hour, made three hundred
// tool calls and never once asked contributes nothing at all: not a row, not a zero, not a line
// saying it existed. So the one number that says whether the base is actually reaching the work —
// asks per unit of work — has no denominator, and the failure mode everybody cares about is exactly
// the one that is invisible.
//
// WHY THE ORDINALS AND NOT JUST A COUNT. "Touched once in three hundred calls" and "touched at call 3
// and never again" are different diagnoses with different remedies, and a bare count cannot tell
// them apart. `touchAt` records WHICH call each consultation was, so a session that front-loads its
// reading and then works blind for two hundred calls is legible as such.
//
// WHAT IS READ AND WHAT IS NOT. The transcript is the only place that knows how many tool calls a
// session made, and it is also the most sensitive file on the machine. So this reads NAMES and
// POSITIONS and nothing else: a tool call contributes an ordinal and, for the CLI door, a boolean
// from a regex over its command. No argument, no result, no prompt and no file content is stored,
// copied, or carried into the record — and the record's whole vocabulary is integers plus a session
// id, which is what makes it publishable at all under §7 (ids and counts, never prose).
//
// INCREMENTAL BY CURSOR, because the caller is a `Stop` hook that fires at the end of EVERY
// assistant turn. Re-reading a growing transcript on each turn is O(file) per turn and O(file²) per
// session; reading only the bytes appended since the last run is what makes this affordable enough
// to be on by default.
import { existsSync, readFileSync, writeFileSync, readdirSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** The MCP door. Every kb tool is namespaced, so one prefix covers ask/show/capture/confirm/dispute. */
const MCP_DOOR = /^mcp__kb__/;

/**
 * The CLI door — `npm run kb -- ask …`, or the module invoked directly, arriving as a shell call.
 *
 * Matched on the command and then DISCARDED: the boolean is kept, the string never is. It is a
 * separate pattern rather than a broader one because `kb` is two letters and appears inside
 * ordinary words; the three anchored forms here are the ways this repo actually invokes the base.
 */
const CLI_DOOR = /\bkb\.mjs\b|\bnpm run kb\b|\bkb:(ask|report|install)\b/;

/**
 * How long a session's counters must sit untouched before they are treated as final.
 *
 * DEFINED HERE AND NOT IMPORTED FROM `push.mjs`, although that file's `SWEEP_AFTER_MS` carries the
 * same number. Two reasons, and the second is the operational one. They are different questions: a
 * queue file is idle because nobody is appending to it and taking it risks a torn line; a reach
 * state is idle because the SESSION ENDED, which is the only end-of-session signal this system has.
 * And the `Stop` hook reads this on every assistant turn — importing it from `push.mjs` would pull
 * the pusher, the GitHub client and the secret gate into a hook whose entire budget is tens of
 * milliseconds. This module imports `node:fs` and `node:path` and nothing else, on purpose.
 */
export const REACH_IDLE_MS = 30 * 60 * 1000;

/** The reach state for one session. Lives beside the queue, never in the working tree. */
export const reachPath = (dir, session) => join(dir, `${session}.reach.json`);

export function readReach(dir, session) {
  const path = reachPath(dir, session);
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8'));
    return { session, cursor: 0, tools: 0, turns: 0, touchAt: [], firstAt: null, lastAt: null, ...raw };
  } catch {
    // A torn or hand-mangled state file is not worth failing a turn over, and starting the count
    // again is a survivable loss: reach is a ratio over a session, not an audit trail.
    return null;
  }
}

/**
 * Count tool calls in a slab of transcript, numbering them from `from`.
 *
 * Pure, and separated from the file handling because this is the part with a wrong answer: the
 * ordinal arithmetic across chunk boundaries is what `touchAt` means, and a test can only pin it
 * here. Malformed lines are skipped rather than thrown on — a transcript is written by another
 * process and may be read mid-write.
 *
 * @returns {{tools: number, touchAt: number[]}} ordinals are 1-based and continue from `from`
 */
export function countToolUses(chunk, { from = 0 } = {}) {
  let tools = from;
  const touchAt = [];
  for (const line of String(chunk).split('\n')) {
    if (!line.trim()) continue;
    let rec;
    try { rec = JSON.parse(line); } catch { continue; }
    const content = rec?.message?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (block?.type !== 'tool_use') continue;
      tools += 1;
      const name = String(block.name ?? '');
      const viaMcp = MCP_DOOR.test(name);
      const viaCli = !viaMcp && CLI_DOOR.test(String(block.input?.command ?? ''));
      if (viaMcp || viaCli) touchAt.push(tools);
    }
  }
  return { tools, touchAt };
}

/**
 * Advance one session's reach from its transcript. Returns the new state, or null if there is
 * nothing to read.
 *
 * ONLY WHOLE LINES ARE CONSUMED. The transcript's last line may be half-written at the moment a
 * hook fires; the cursor stops at the final newline so the remainder is read once, whole, next turn.
 * Without that rule a torn line is skipped as malformed and its tool calls are lost from the count
 * permanently — an undercount that only ever appears in busy sessions, which are the ones this
 * measurement exists for.
 */
export function advanceReach({ dir, session, transcriptPath, at = new Date() } = {}) {
  if (!dir || !session || !transcriptPath || !existsSync(transcriptPath)) return null;
  const prior = readReach(dir, session) ?? {
    session, cursor: 0, tools: 0, turns: 0, touchAt: [], firstAt: at.toISOString(), lastAt: null,
  };

  let size;
  try { size = statSync(transcriptPath).size; } catch { return null; }
  // A transcript that SHRANK was replaced, not appended to; trusting the old cursor would read from
  // the middle of a different file. Start again rather than report arithmetic over two documents —
  // AND THAT MEANS THE COUNTERS TOO. Resetting the cursor alone leaves the ordinals continuing from
  // a document that no longer exists, so the first call of the new transcript is reported as call
  // 4 of a file that has three: `firstTouch`, the one field worth having, becomes fiction.
  const restarted = size < prior.cursor;
  const from = restarted ? 0 : prior.cursor;
  const base = restarted ? { ...prior, tools: 0, touchAt: [] } : prior;

  let chunk = '';
  if (size > from) {
    try {
      const fd = readFileSync(transcriptPath);
      chunk = fd.subarray(from, size).toString('utf8');
    } catch { return null; }
  }
  const lastNewline = chunk.lastIndexOf('\n');
  const consumed = lastNewline === -1 ? 0 : lastNewline + 1;
  const { tools, touchAt } = countToolUses(chunk.slice(0, consumed), { from: base.tools });

  const next = {
    session,
    cursor: from + Buffer.byteLength(chunk.slice(0, consumed), 'utf8'),
    tools,
    turns: prior.turns + 1,
    touchAt: [...base.touchAt, ...touchAt],
    firstAt: prior.firstAt ?? at.toISOString(),
    lastAt: at.toISOString(),
  };
  try { writeFileSync(reachPath(dir, session), JSON.stringify(next), 'utf8'); } catch { return null; }
  return next;
}

/**
 * Reach states belonging to sessions that have stopped — the ones ready to publish.
 *
 * NEVER THE CALLER'S OWN, and never a state still being written. A live session's counters are not
 * a fact yet: publishing them mid-session would put several lines in the log for one session, each
 * a prefix of the next, and the report would have to guess which is the session. Idleness is the
 * only end-of-session signal this system has — the same one `push` already uses to decide that
 * another session's queue file is safe to take.
 */
export function idleReaches(dir, { session = null, now = Date.now(), idleMs = 0 } = {}) {
  const out = [];
  let names;
  try { names = readdirSync(dir); } catch { return out; }
  for (const name of names) {
    if (!name.endsWith('.reach.json')) continue;
    const owner = name.slice(0, -'.reach.json'.length);
    if (owner === session) continue;
    try {
      if (now - statSync(join(dir, name)).mtimeMs < idleMs) continue;
    } catch { continue; }
    const state = readReach(dir, owner);
    if (state) out.push(state);
  }
  return out.sort((a, b) => a.session.localeCompare(b.session));
}

/** The publishable line for one reach state. Integers and one id — no prose, by construction. */
export const reachLine = (state) => ({
  kind: 'session',
  session: state.session,
  tools: state.tools,
  turns: state.turns,
  touchAt: state.touchAt,
  firstAt: state.firstAt,
  lastAt: state.lastAt,
});

export function dropReach(dir, session) {
  try { rmSync(reachPath(dir, session), { force: true }); } catch { /* already gone */ }
}
