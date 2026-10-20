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
 * `ambiguous` list (whatever was written after it -- a list is closed by a choice, VCST-6191), returns
 * `{"decision":"block","reason":…}`: the agent takes ONE more step -- closes the list with `kb_show` /
 * `kb_none`, captures what it found out, or says in a line that it did not find it out.
 *
 * THE MAIN THREAD IS ASKED, ALSO ABOUT ITS SUBAGENTS' LISTS (VCST-6341). Registered on `Stop` only.
 * It used to block at `SubagentStop` too, so each subagent was asked about its own asks -- and a live
 * test on Claude Code 2.1.295 showed that block never reaches the subagent: it hands its report back
 * (`SubagentHandback`) and ends, the reason lands in its transcript unread, and the asks it named were
 * already marked raised, so nobody was ever asked about them again. A `SubagentStop` therefore does
 * nothing here. Any agent of the session can close a list by its handle, so the main thread -- the one
 * agent a stop block demonstrably keeps working -- closes them.
 *
 * WHOSE ASK IT IS still decides WHEN. Claude Code writes the main thread to `transcript_path` and every
 * subagent to its own transcript under `<session>/subagents/` (`core/caller.mjs` measured 12 of 12 ids
 * that way). An ask belongs to the transcript that HOLDS it: an MCP ask by its tool-use id (`call`), a
 * CLI ask by the shell call that ran it -- found with `caller.mjs` `kbShellCalls` / `carries`, the same
 * join the push uses to attribute CLI lines. The main thread takes its own asks, any ask NO transcript
 * holds (a plain terminal, an unreadable path), and asks held only by subagents that are FINISHED:
 * their last tool call was `SubagentHandback` (the report is delivered), or their transcript has been
 * idle for `SUBAGENT_IDLE_MS` with no tool call still open. NO GRACE PERIOD after a handback: the main
 * thread often stops seconds after one, and if that is the session's last stop a waited-out list is
 * never named (VCST-6341 review). Naming one early is harmless, because such a list reaches the main
 * thread as INHERITED and is closed only by a pick the subagent's report supports, never by `kb_none`
 * -- an interim report that is followed by more work costs, at worst, a reminder the main thread
 * leaves alone. With no `transcript_path` at all nothing can be attributed, so every list is treated
 * as inherited (owner unknown): offering `kb_none` on a list the main thread may never have seen is
 * the blind closing this hook must not invite. One still
 * inside a long tool call is busy, however quiet its transcript, and keeps its ask -- until that call's
 * own timeout (30 min when it set none) has passed, so a subagent killed mid-call is not deferred for
 * long.
 *
 * IT WRITES ONLY ITS OWN FILE, append-only: the asks it raised go to `<session>.reminded.ndjson`, one
 * per line (`remindedPath`), so stops finishing together never erase each other's markers. Once a day
 * it deletes journals idle for `KEEP_DAYS`, and a reminded file only together with its journal.
 * Transcripts are read only when there is something open to attribute; a subagent found to hold an
 * ask is remembered in `<session>.owners.ndjson`, and later stops read only the tail of that one file.
 *
 * GUARDS, because a stop hook that blocks is a hook that can trap a session:
 *   1. Every question is raised ONCE: its ask `at` is appended BEFORE the reason is printed, so a crash
 *      after the write costs a reminder, never a loop. That is what bounds the session: each block marks
 *      up to `LISTED` new asks, so a stop can block at most once per `LISTED` open asks, and an append
 *      that fails prints nothing.
 *   2. `stop_hook_active` (set by the harness while a stop hook already made Claude continue) -> silent.
 *      VCST-6341 lifted this for a while so the rest of a list could be raised in the continuation --
 *      needed only while subagents were reminded at their own stop, which has no "next" one. Their lists
 *      now reach the main thread, whose next ordinary stop always comes, so the guard is back: a session
 *      that left 40 lists open is asked about five per turn, never blocked eight times in a row.
 *   3. Off switches: `KB_ENABLED=0` (the base is off on this machine), `KB_REMIND=0` (this hook only),
 *      and `KB_SYNTHETIC=1`: a calibration or bench run must not take an extra step it did not ask for.
 *
 * WHAT THE OPERATOR SEES: Claude Code labels any blocking stop hook "Stop hook error occurred" in its
 * UI -- the reminder, not a fault (verified live 2026-10-06; the model receives it as "Stop hook
 * feedback"). The reason opens with "kb reminder (not a failure)" for whoever expands it.
 *
 * Exits 0 whatever happens and prints NOTHING unless it is blocking.
 */
import { appendFileSync, closeSync, fstatSync, openSync, readFileSync, readSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  hasSessionId, hookEnv, isSynthetic, kbDisabled, ownersPath, queueDir, readLoop, remindDisabled, remindedPath,
} from '../../scripts/kb/core/queue.mjs';
import { LISTED, openLoops, reminderText } from '../../scripts/kb/core/loop.mjs';
import { BACKGROUND_DEFAULT_MS, carries, cliKey, kbShellCalls } from '../../scripts/kb/core/caller.mjs';

const KEEP_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;
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
 * One pass over a transcript's tool calls: is its agent still at work, and did it hand its report back?
 *
 * BUSY: a `tool_use` with no `tool_result` yet -- a subagent inside one long tool call writes nothing,
 * so age alone cannot say it finished. BUSY EXPIRES: a subagent killed mid-call keeps its dangling
 * `tool_use` forever, so a call counts as open only for its own `timeout`, or `BACKGROUND_DEFAULT_MS`
 * (30 min) when it set none (PR #400 review).
 *
 * HANDED BACK: its LAST tool call is `SubagentHandback`, which is how a subagent ends (VCST-6341). A
 * later tool call -- the parent resumed it -- makes it live again.
 */
function toolState(text, age) {
  if (text === null) return { busy: false, handedBack: false };
  const used = new Map();
  const answered = new Set();
  let last = null;
  for (const raw of text.split('\n')) {
    if (!raw.includes('"tool_use"') && !raw.includes('"tool_result"')) continue;
    let rec;
    try { rec = JSON.parse(raw); } catch { continue; }
    for (const c of Array.isArray(rec?.message?.content) ? rec.message.content : []) {
      if (c?.type === 'tool_use' && c.id) { used.set(c.id, Number(c.input?.timeout)); last = c.name ?? null; }
      if (c?.type === 'tool_result' && c.tool_use_id) answered.add(c.tool_use_id);
    }
  }
  const open = [...used].filter(([id]) => !answered.has(id))
    .map(([, timeout]) => (Number.isFinite(timeout) && timeout > 0 ? timeout : BACKGROUND_DEFAULT_MS));
  return { busy: open.length > 0 && age < Math.max(...open), handedBack: last === 'SubagentHandback' };
}

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
    } else if (name.endsWith('.reminded.ndjson') || name.endsWith('.owners.ndjson')) {
      const journal = join(dir, `${name.replace(/\.(reminded|owners)\.ndjson$/, '')}.loop.ndjson`);
      if (idle(path) && idle(journal)) { try { unlinkSync(path); } catch { /* raced or gone */ } }
    }
  }
}

/** The asks already raised: every line of the append-only record. */
function raisedAts(path) {
  const text = readText(path);
  return text === null ? [] : text.split('\n').map((l) => l.trim()).filter(Boolean);
}

/** A transcript read in full ONCE per stop: its text, its kb shell calls, its age and whether it is busy. */
function transcriptOf(path, now) {
  const text = readText(path);
  if (text === null) return null;
  const age = ageOf(path, now);
  return { path, text, calls: kbShellCalls(text), ...toolState(text, age), age };
}

/** A known owner's state from its file's tail only -- no full read (PR #400 review). */
function statusOf(path, now) {
  const age = ageOf(path, now);
  return { age, ...toolState(readTail(path), age) };
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

/** ask `at` -> the subagent transcripts already found to hold it (`ownersPath`). */
function readOwners(path) {
  const owners = new Map();
  for (const raw of (readText(path) ?? '').split('\n')) {
    try { const o = JSON.parse(raw); if (o?.at && o?.path) owners.set(o.at, [...(owners.get(o.at) ?? []), o.path]); } catch { /* blank or torn */ }
  }
  return owners;
}

/**
 * The open asks the main thread's stop owns (see the header): what its transcript holds, plus every ask
 * no LIVE subagent holds. The main transcript being unreadable does not hand it the asks of subagents
 * still at work (PR #400 review); with no transcript path at all there is nothing to attribute by: it
 * takes all, each marked inherited with an unknown owner, so none is offered to `kb_none`.
 * A subagent holder found once is cached in `ownersPath`; later stops read only that file's tail.
 */
function owned(loops, { transcript, ownersFile, now = Date.now() }) {
  if (!transcript) return loops.map((l) => ({ ...l, inherited: 'unknown' }));
  const own = transcriptOf(transcript, now);
  const mine = [];
  const rest = [];
  for (const l of loops) (holds(own, l) ? mine : rest).push(l);
  if (!rest.length) return mine;
  // FINISHED = handed its report back, or idle for SUBAGENT_IDLE_MS -- and no tool call still open.
  // A holder that is busy keeps it.
  const finished = (s) => !s.busy && (s.handedBack || s.age > SUBAGENT_IDLE_MS);
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
    // A list a subagent held is INHERITED: the main thread did not judge it (`reminderText`). One no
    // transcript holds is the main thread's own only when its own transcript was READ: unreadable is the
    // same as absent -- owner unknown, never offered to kb_none (VCST-6341 review).
    if (!holders.length) mine.push(own === null ? { ...l, inherited: 'unknown' } : l);
    else if (holders.every((p) => finished(stateOf(p)))) mine.push({ ...l, inherited: true });
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
  // A subagent's stop block is never acted on (see the header): its lists go to the main thread.
  // Checked here as well as unregistered, so an older settings copy cannot mark asks nobody will see.
  if (payload?.hook_event_name === 'SubagentStop') return;

  // The journal is keyed like the queue (`hookEnv` -> `sessionId`): every agent of the session -- the
  // main thread and its subagents -- appends to one journal, which this stop reads whole.
  const env = hookEnv(process.env, payload);
  if (!hasSessionId(env)) return;
  const journal = readLoop(env);
  if (!journal.length) return;

  const path = remindedPath(env);
  // Nothing open -> no transcript is read: on a session with a long journal and a multi-MB
  // transcript this is every turn end (PR #400 review).
  const open = openLoops(journal, { reminded: raisedAts(path) });
  if (!open.length) return;
  const owners = owned(open, {
    transcript: payload?.transcript_path, ownersFile: ownersPath(env),
  });
  // Own lists first: they are the ones this thread can close by judgement; inherited ones follow.
  const loops = [...owners.filter((l) => !l.inherited), ...owners.filter((l) => l.inherited)];
  if (!loops.length) return;

  // Only the questions the reminder NAMES are marked raised: the rest come back at the next stop, each
  // with its handle, rather than being marked raised without one (PR #407 review).
  try { appendFileSync(path, `${loops.slice(0, LISTED).map((l) => l.at).join('\n')}\n`, 'utf8'); } catch { return; }
  process.stdout.write(JSON.stringify({ decision: 'block', reason: reminderText(loops) }));
}

try { main(); } catch { /* a reminder must never fail a session */ }
process.exit(0);
