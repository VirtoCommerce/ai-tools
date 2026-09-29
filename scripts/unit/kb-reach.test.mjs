// REACH — the denominator (`core/reach.mjs`) and the panel that reads it.
//
// What is tested here is arithmetic over a file another process is writing: ordinals that must
// continue across chunk boundaries, a cursor that must not consume a half-written line, and a
// publish step that must not drop a session's only record. None of it is declaration — every value
// is computed from a transcript, which is exactly the kind of thing `when-to-write-a-test.md` says
// belongs in a unit test rather than in a guard.
//
// The transcripts here are HAND-BUILT and minimal. A fixture copied from a real session would carry
// prompts and tool arguments into the repo, which is the one thing `reach.mjs` exists not to touch.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, appendFileSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OWN_REACH_EVERY_MS, REACH_IDLE_MS, advanceReach, countToolUses, dropReach, idleReaches, lineTouches, lineWork, markSent,
  markTried, ownReachDue, promptsIn, readReach, reachLine, reachPath, sentMark, sentPath, sessionKeyOf, unsent, workIn,
} from '../kb/core/reach.mjs';
import { reach } from '../kb/core/report-analyse.mjs';
import { LOGGED } from '../kb/core/queue.mjs';

const turn = (...names) => `${JSON.stringify({
  type: 'assistant',
  message: { role: 'assistant', content: names.map((n, i) => (typeof n === 'string'
    ? { type: 'tool_use', id: `toolu_${i}`, name: n }
    : n)) },
})}\n`;

const bash = (command) => ({ type: 'tool_use', id: 'toolu_x', name: 'Bash', input: { command } });

function withDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'kb-reach-'));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}

// ─── counting ─────────────────────────────────────────────────────────────────────────────────

test('every tool call is counted, and only the base’s own doors are marked as touches', () => {
  const chunk = turn('Bash', 'mcp__kb__kb_ask', 'Read') + turn('Edit', 'mcp__kb__kb_capture');
  assert.deepEqual(countToolUses(chunk), { tools: 5, touchAt: [2, 5] });
});

test('the CLI door counts too — the base is reachable without the MCP server', () => {
  // `npm run kb -- ask` is the door that works on a fresh clone before any restart, so a session
  // using it is consulting the base and must not be scored as silent.
  const chunk = turn('Read', bash('npm run kb -- ask "what does Active mean"'), bash('ls -la'));
  assert.deepEqual(countToolUses(chunk), { tools: 3, touchAt: [2] });
});

test('ordinals continue across chunks — a touch at call 300 must read as 300, not as 2', () => {
  // THE FIELD'S WHOLE VALUE IS THIS ARITHMETIC. `firstTouch` distinguishes a session that oriented
  // itself and then worked blind from one that worked blind and then checked, and a per-chunk
  // ordinal would report both as "call 1 or 2" because a chunk is one turn.
  const { touchAt } = countToolUses(turn('Read', 'mcp__kb__kb_ask'), { from: 298 });
  assert.deepEqual(touchAt, [300]);
});

test('a malformed or half-written line is skipped and does not stop the count', () => {
  const chunk = `${turn('Read')}{"type":"assistant","message":{"content":[{"type":"tool_u`;
  assert.equal(countToolUses(chunk).tools, 1);
});

test('lines that are not assistant tool calls contribute nothing', () => {
  const chunk = `${JSON.stringify({ type: 'queue-operation', operation: 'enqueue', content: 'hello' })}\n`
    + `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'a string, not blocks' } })}\n`;
  assert.deepEqual(countToolUses(chunk), { tools: 0, touchAt: [] });
});

// ─── advancing ────────────────────────────────────────────────────────────────────────────────

test('a second turn reads only what was appended, and the totals accumulate', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, turn('Read', 'mcp__kb__kb_ask'));
  const first = advanceReach({ dir, session: 'sess0001', transcriptPath: t });
  assert.deepEqual([first.tools, first.turns, first.touchAt], [2, 1, [2]]);

  appendFileSync(t, turn('Bash', 'Bash', 'mcp__kb__kb_capture'));
  const second = advanceReach({ dir, session: 'sess0001', transcriptPath: t });
  assert.deepEqual([second.tools, second.turns, second.touchAt], [5, 2, [2, 5]],
    'the first turn’s two calls are not re-counted, and the new touch is ordinal 5');
  assert.equal(second.cursor, Buffer.byteLength(turn('Read', 'mcp__kb__kb_ask') + turn('Bash', 'Bash', 'mcp__kb__kb_capture')));
}));

test('a half-written last line is left for the next turn rather than lost', () => withDir((dir) => {
  // The hook fires while the harness is still writing. A cursor that jumped past the torn line
  // would drop its tool calls permanently — an undercount that only shows up in busy sessions,
  // which are the sessions this measurement exists for.
  const t = join(dir, 'transcript.jsonl');
  const whole = turn('Read');
  writeFileSync(t, `${whole}{"type":"assistant","message":{"content":[{"type":"tool_use","name":"mcp__kb__kb_a`);
  const first = advanceReach({ dir, session: 'sess0002', transcriptPath: t });
  assert.deepEqual([first.tools, first.touchAt], [1, []]);
  assert.equal(first.cursor, Buffer.byteLength(whole), 'the cursor stopped at the last newline');

  writeFileSync(t, whole + turn('mcp__kb__kb_ask'));
  const second = advanceReach({ dir, session: 'sess0002', transcriptPath: t });
  assert.deepEqual([second.tools, second.touchAt], [2, [2]], 'the torn line is read once, whole');
}));

test('a transcript that shrank is re-read from the start rather than from a stale cursor', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, turn('Read', 'Bash', 'Edit'));
  advanceReach({ dir, session: 'sess0003', transcriptPath: t });
  writeFileSync(t, turn('mcp__kb__kb_ask'));          // replaced, not appended
  const after = advanceReach({ dir, session: 'sess0003', transcriptPath: t });
  assert.deepEqual(after.touchAt, [1], 'arithmetic over two different documents is worse than a restart');
}));

test('a missing transcript costs nothing and writes nothing', () => withDir((dir) => {
  assert.equal(advanceReach({ dir, session: 'sess0004', transcriptPath: join(dir, 'nope.jsonl') }), null);
  assert.equal(readReach(dir, 'sess0004'), null);
}));

// ─── publishing ───────────────────────────────────────────────────────────────────────────────

test('a live session’s counters are never taken — only a stopped one’s', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, turn('Read'));
  advanceReach({ dir, session: 'mineeeee', transcriptPath: t });
  advanceReach({ dir, session: 'other001', transcriptPath: t });

  assert.deepEqual(idleReaches(dir, { session: 'mineeeee', idleMs: REACH_IDLE_MS }).map((r) => r.session), [],
    'both were just written, so neither has stopped');

  const old = new Date(Date.now() - REACH_IDLE_MS - 60_000);
  utimesSync(reachPath(dir, 'other001'), old, old);
  utimesSync(t, old, old);
  assert.deepEqual(idleReaches(dir, { session: 'mineeeee', idleMs: REACH_IDLE_MS }).map((r) => r.session), ['other001'],
    'idleness is the only end-of-session signal this system has');
}));

// ─── subagents (PLAN §23.11) ──────────────────────────────────────────────────────────────────

/** A parent transcript and its `<id>/subagents/` directory, laid out as the harness writes them. */
function withSession(dir) {
  const t = join(dir, 'parent01.jsonl');
  const sub = join(dir, 'parent01', 'subagents');
  mkdirSync(sub, { recursive: true });
  return { t, agent: (name) => join(sub, `agent-${name}.jsonl`) };
}

test('a subagent’s calls and touches are counted — its work never reaches the parent’s transcript', () => withDir((dir) => {
  // Run `cdb27d99`: parent 22 calls, its subagent 456 with 10 of the run's 12 base calls, and the
  // published line said 22 tools, 2 touches. Counted apart, so the parent's ordinals keep meaning.
  const { t, agent } = withSession(dir);
  writeFileSync(t, turn('Read', 'mcp__kb__kb_ask', 'Agent'));
  writeFileSync(agent('a1'), turn('Bash', 'mcp__kb__kb_capture', 'Read'));
  writeFileSync(agent('b2'), turn(bash('npm run kb -- ask "x"')));
  const first = advanceReach({ dir, session: 'sess0010', transcriptPath: t });
  assert.deepEqual([first.tools, first.touchAt], [3, [2]], 'the parent’s own ordinals are untouched');
  assert.deepEqual(reachLine(first), {
    ...reachLine({ ...first, subagents: {} }), agents: 2, agentTools: 4, agentTouches: 2,
  });

  appendFileSync(agent('a1'), turn('mcp__kb__kb_confirm'));
  const second = advanceReach({ dir, session: 'sess0010', transcriptPath: t });
  assert.equal(reachLine(second).agentTools, 5, 'incremental per file: the first four are not re-counted');
  assert.equal(reachLine(second).agentTouches, 3);
}));

test('a session with no subagents publishes zeros, which says it had none', () => withDir((dir) => {
  const t = join(dir, 'solo0001.jsonl');
  writeFileSync(t, turn('Read'));
  const line = reachLine(advanceReach({ dir, session: 'sess0011', transcriptPath: t }));
  assert.deepEqual([line.agents, line.agentTools, line.agentTouches], [0, 0, 0]);
}));

test('a parent WAITING on a working subagent is not harvested as finished', () => withDir((dir) => {
  // Run `cdb27d99` sat 45 minutes behind one subagent, fired no Stop hook, and was published at 22
  // calls as if it had ended — then resumed into a `restart` line. The transcripts are the activity.
  const { t, agent } = withSession(dir);
  writeFileSync(t, turn('Agent'));
  writeFileSync(agent('a1'), turn('Read'));
  advanceReach({ dir, session: 'waiting1', transcriptPath: t });
  const old = new Date(Date.now() - REACH_IDLE_MS - 60_000);
  utimesSync(reachPath(dir, 'waiting1'), old, old);
  utimesSync(t, old, old);
  assert.deepEqual(idleReaches(dir, { idleMs: REACH_IDLE_MS }), [], 'the subagent wrote a moment ago');

  utimesSync(agent('a1'), old, old);
  assert.deepEqual(idleReaches(dir, { idleMs: REACH_IDLE_MS }).map((r) => r.session), ['waiting1'],
    'and once everything has stopped, it is finished');
}));

test('firstAt is the transcript’s own first timestamp, not the moment the hook first ran', () => withDir((dir) => {
  // Run `cdb27d99` began 09:20:49; its line said 09:26:55 — the end of the first turn.
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, `${JSON.stringify({ type: 'user', timestamp: '2026-09-23T09:20:49.421Z', message: { content: 'go' } })}\n${turn('Read')}`);
  const s = advanceReach({ dir, session: 'sess0012', transcriptPath: t, at: new Date('2026-09-23T09:26:55.819Z') });
  assert.equal(s.firstAt, '2026-09-23T09:20:49.421Z');
  // A transcript that carries no stamp still gets one — the hook's clock is a worse start, not none.
  const bare = join(dir, 'bare.jsonl');
  writeFileSync(bare, turn('Read'));
  assert.equal(advanceReach({ dir, session: 'sess0013', transcriptPath: bare, at: new Date('2026-09-23T10:00:00.000Z') }).firstAt,
    '2026-09-23T10:00:00.000Z');
}));

test('the local transcript path never reaches the published line', () => withDir((dir) => {
  const { t, agent } = withSession(dir);
  writeFileSync(t, turn('Read'));
  writeFileSync(agent('a1'), turn('Read'));
  const state = advanceReach({ dir, session: 'sess0014', transcriptPath: t });
  assert.equal(state.transcriptPath, t, 'the state keeps it, for the idleness check');
  assert.ok(!JSON.stringify(reachLine(state)).includes('parent01'), 'no path and no file name leaves the machine');
}));

test('the published line is integers and one id — no prose can reach it', () => {
  const line = reachLine({ session: 'abc12345', tools: 300, turns: 40, touchAt: [287], firstAt: 'a', lastAt: 'b' });
  assert.ok(LOGGED.includes(line.kind), '`session` is a declared kind, or the pusher would not carry it');
  // The transcript is the most sensitive file on the machine. What leaves it is a shape, checked
  // here rather than trusted: every value is a number, an ISO stamp, or the session id itself.
  for (const [k, v] of Object.entries(line)) {
    if (k === 'kind' || k === 'session' || k === 'firstAt' || k === 'lastAt') continue;
    const flat = Array.isArray(v) ? v : [v];
    assert.ok(flat.every((n) => typeof n === 'number'), `${k} carries only numbers`);
  }
});

test('the state records WHO RAN THE SESSION, and keeps the last handle it learned', () => withDir((dir) => {
  // A reach line is the ONE line whose subject is a DIFFERENT session from the one publishing it:
  // the state is swept and pushed by whoever comes next, possibly a different person on a
  // different machine. So the handle is stamped here, by the session's own hook, while that
  // session is still running — the same rule the whole field is built on.
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, turn('Read'));
  const first = advanceReach({ dir, session: 'sess0006', transcriptPath: t, who: 'octo-tester' });
  assert.equal(first.who, 'octo-tester');
  assert.equal(readReach(dir, 'sess0006').who, 'octo-tester');

  // A later turn whose cache read came back empty must not ERASE what an earlier turn knew: the
  // handle comes from a cache that can be cold, and forgetting is strictly worse than keeping.
  appendFileSync(t, turn('Bash'));
  assert.equal(advanceReach({ dir, session: 'sess0006', transcriptPath: t }).who, 'octo-tester');

  // And a session that never learned one carries no key at all — never a null, never 'unknown'.
  writeFileSync(t, turn('Read'));
  assert.ok(!('who' in advanceReach({ dir, session: 'sess0007', transcriptPath: t })));
}));

test('the state records WHAT RUN the session ran under, by the same argument as the handle', () => withDir((dir) => {
  // One field along from `who` and for the identical reason: the state is swept and published by
  // whoever comes next, who may be running under a different `KB_RUN` or none at all. Stamping the
  // publisher's would name the wrong run with complete confidence — the failure that put `who` here.
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, turn('Read'));
  const first = advanceReach({ dir, session: 'sess0008', transcriptPath: t, run: 'VCST-5776' });
  assert.equal(first.run, 'VCST-5776');
  assert.equal(readReach(dir, 'sess0008').run, 'VCST-5776');

  // An env var unset for one turn is not a reason to forget what the session was running as.
  appendFileSync(t, turn('Bash'));
  assert.equal(advanceReach({ dir, session: 'sess0008', transcriptPath: t }).run, 'VCST-5776');

  // And a session that never saw one carries no key at all.
  writeFileSync(t, turn('Read'));
  assert.ok(!('run' in advanceReach({ dir, session: 'sess0009', transcriptPath: t })));
}));

test('dropping a reach state is what makes a session publish exactly once', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, turn('Read'));
  advanceReach({ dir, session: 'sess0005', transcriptPath: t });
  dropReach(dir, 'sess0005');
  assert.equal(readReach(dir, 'sess0005'), null);
  dropReach(dir, 'sess0005');   // idempotent: a failed push retries, and must not throw here
}));

// ─── the three discontinuities, recorded (PLAN §23.6) ─────────────────────────────────────────

const prompt = (text) => `${JSON.stringify({ type: 'user', message: { role: 'user', content: text } })}\n`;
const queued = (dir, session) => {
  try {
    return readFileSync(join(dir, `${session}.jsonl`), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch { return []; }
};
const restarts = (dir, session) => queued(dir, session).filter((l) => l.kind === 'restart');

test('an ordinary first turn and every ordinary later turn record NO restart', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, prompt('first') + turn('Read'));
  advanceReach({ dir, session: 'calm0001', transcriptPath: t });
  appendFileSync(t, prompt('second') + turn('Bash'));
  advanceReach({ dir, session: 'calm0001', transcriptPath: t });
  assert.deepEqual(restarts(dir, 'calm0001'), []);
}));

test('a transcript that SHRANK is recorded as replaced — the observed event, not a guessed cause', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, prompt('p') + turn('Read', 'Bash', 'Edit'));
  advanceReach({ dir, session: 'shrk0001', transcriptPath: t, run: 'VCST-1', who: 'octo' });
  writeFileSync(t, turn('Read'));
  advanceReach({ dir, session: 'shrk0001', transcriptPath: t });
  const [line] = restarts(dir, 'shrk0001');
  assert.deepEqual({ why: line.why, priorTools: line.priorTools, run: line.run, who: line.who },
    { why: 'transcript-replaced', priorTools: 3, run: 'VCST-1', who: 'octo' });
  assert.ok(LOGGED.includes(line.kind), '`restart` is a declared kind');
}));

test('a state DROPPED after publication, then resumed, is recorded as dropped — and only once', () => withDir((dir) => {
  // The measured case: a live session harvested after 30 idle minutes, which then resumed and
  // reported `turns: 1` against ~1860 tools.
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, prompt('p1') + turn('Read'));
  advanceReach({ dir, session: 'drop0001', transcriptPath: t });
  appendFileSync(t, prompt('p2') + turn('Bash'));
  advanceReach({ dir, session: 'drop0001', transcriptPath: t });
  dropReach(dir, 'drop0001');                     // what push.mjs does once the `session` line is out
  appendFileSync(t, prompt('p3') + turn('Edit'));
  advanceReach({ dir, session: 'drop0001', transcriptPath: t });
  advanceReach({ dir, session: 'drop0001', transcriptPath: t });
  assert.deepEqual(restarts(dir, 'drop0001').map((l) => l.why), ['state-dropped'],
    'dropped, not absent — the drop left word of itself');

  // And the word is CONSUMED: a later loss that no drop explains is absent, not "dropped" again.
  rmSync(reachPath(dir, 'drop0001'), { force: true });   // a wiped scratchpad, not a publication
  appendFileSync(t, prompt('p4') + turn('Read'));
  advanceReach({ dir, session: 'drop0001', transcriptPath: t });
  assert.deepEqual(restarts(dir, 'drop0001').map((l) => l.why), ['state-dropped', 'state-absent']);
}));

test('a state ABSENT with a transcript already several prompts long is recorded as absent', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, prompt('p1') + turn('Read') + prompt('p2') + turn('Bash'));
  advanceReach({ dir, session: 'gone0001', transcriptPath: t, synthetic: true });
  const [line] = restarts(dir, 'gone0001');
  assert.equal(line.why, 'state-absent');
  assert.equal(line.synthetic, true, 'and it carries the benchmark mark like every other line');
  assert.ok(!('priorTools' in line), 'there was no prior state to count');
}));

test('the restart line carries labels and counts, never transcript text', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  const secretish = 'a prompt that must never reach the log';
  writeFileSync(t, prompt(secretish) + turn('Read') + prompt(secretish) + turn('Bash'));
  advanceReach({ dir, session: 'prose001', transcriptPath: t });
  const text = readFileSync(join(dir, 'prose001.jsonl'), 'utf8');
  assert.ok(!text.includes(secretish));
  assert.deepEqual(Object.keys(restarts(dir, 'prose001')[0]).sort(), ['at', 'kind', 'why']);
}));

test('a compaction summary, a tool result and a meta record are not prompts', () => {
  const chunk = prompt('real')
    + `${JSON.stringify({ type: 'user', isCompactSummary: true, message: { content: 'This session is being continued…' } })}\n`
    + `${JSON.stringify({ type: 'user', isMeta: true, message: { content: 'caveat' } })}\n`
    + `${JSON.stringify({ type: 'user', message: { content: [{ type: 'tool_result', content: 'x' }] } })}\n`
    + `${JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: 'also real' }] } })}\n`;
  assert.equal(promptsIn(chunk), 2);
});

// ─── the panel ────────────────────────────────────────────────────────────────────────────────

const sessionLine = (session, tools, touchAt) => ({ kind: 'session', session, tools, turns: 1, touchAt, _session: 'pusher' });

test('the WINDOW is the session own start, not the date of the file it rode out in', () => {
  // THE DEFECT THIS CLOSES (PLAN 22.11). Every other panel is windowed for free: `--days N` selects
  // day folders and an `ask` is written into its own session file on the day it happened. A
  // `session` line is not - it describes a session that has ENDED and is published by whichever
  // LATER session sweeps it, so a line about an old session rides out in a file dated today.
  // Measured on the real base: `2ca7d89e-0001.jsonl` carries the `session` lines for `35b6f0e1` and
  // `798dcffa`, neither of which is `2ca7d89e`.
  //
  // So filtering by file date did not filter these rows at all, and the symptom was a reach figure
  // that did not move when the window narrowed. That is how an audit session found it: identical
  // numbers over two windows are not stability, they are an unapplied filter.
  const lines = [
    { ...sessionLine('older001', 300, []), firstAt: '2026-09-18T10:00:00.000Z' },
    { ...sessionLine('inside01', 40, [3]), firstAt: '2026-09-22T09:00:00.000Z' },
  ];
  const wide = reach(lines);
  assert.deepEqual(wide.rows.map((r) => r.session).sort(), ['inside01', 'older001'], 'no window, both rows');

  const narrow = reach(lines, { since: '2026-09-21T00:00:00.000Z' });
  assert.deepEqual(narrow.rows.map((r) => r.session), ['inside01'], 'the old session is outside the window');
  assert.equal(narrow.silent, 0, 'and it does not go on counting against the silent tally either');
  // The figure MOVES, which is the whole point: 340 calls / 1 touch against 40 / 1.
  assert.notEqual(wide.perHundred, narrow.perHundred);
});

test('a session line with NO firstAt is KEPT, never dropped by the window', () => {
  // Dropping it would under-count silently in the one panel whose entire job is counting what did
  // NOT happen - the same direction of error `unreachable` and `NOT ENOUGH DATA` exist to refuse.
  const r = reach([sessionLine('noStamp1', 120, [])], { since: '2026-09-21T00:00:00.000Z' });
  assert.deepEqual(r.rows.map((x) => x.session), ['noStamp1']);
});

test('the panel credits the session a line DESCRIBES, not the one that pushed it', () => {
  // A stopped session's line rides out in whatever session happens to flush next. Reading `_session`
  // would file every silent session's work under the one machine that was still running.
  const [row] = reach([sessionLine('quiet001', 300, [])]).rows;
  assert.equal(row.session, 'quiet001');
  assert.equal(row.tools, 300);
});

test('a session published TWICE — idle, then resumed — is one row, and it is the fuller line', () => {
  // PLAN §23.7. A session quiet for 30 minutes is harvested as finished, resumes, and is published
  // again with more work. First-wins kept the stale counters. Measured shape: `turns` fell 63 → 1
  // when the dropped state was rebuilt, while `tools` kept rising — so `tools` decides, not order.
  const stale = { ...sessionLine('resumed1', 1860, [5]), turns: 63, firstAt: '2026-09-22T08:00:00.000Z', lastAt: '2026-09-22T10:00:00.000Z' };
  const fuller = { ...sessionLine('resumed1', 1930, [5, 1900]), turns: 1, firstAt: '2026-09-22T12:30:00.000Z', lastAt: '2026-09-22T12:40:00.000Z' };
  for (const order of [[stale, fuller], [fuller, stale]]) {
    const r = reach(order);
    assert.equal(r.accounted, 1, 'one session, one row');
    assert.equal(r.rows[0].tools, 1930, 'whichever order the files were read in');
    assert.equal(r.rows[0].touches, 2);
    // And its START is the earliest one seen: the rebuilt state's `firstAt` is when the state was
    // rebuilt, not when the session began.
    assert.equal(r.rows[0].at, '2026-09-22T08:00:00.000Z');
  }
  // Windowed on that earliest start, so a window opening between the two starts drops the session
  // it did not contain the beginning of — consistently with every other session.
  assert.equal(reach([stale, fuller], { since: '2026-09-22T09:00:00.000Z' }).accounted, 0);
});

test('the panel adds the subagents’ work to the session, and says how much of it was theirs', () => {
  const line = { ...sessionLine('cdb27d99', 22, [12, 13]), agents: 1, agentTools: 456, agentTouches: 10 };
  const r = reach([line]);
  assert.deepEqual([r.tools, r.touches, r.agentTools, r.agentTouches], [478, 12, 456, 10]);
  assert.deepEqual([r.rows[0].firstTouch, r.rows[0].lastTouch], [12, 13], 'ordinals stay the parent’s');
  // "Fuller" compares the WHOLE session: a resumed parent with fewer own calls but its subagents'
  // work counted must beat a stale line that saw less.
  const stale = { ...sessionLine('cdb27d99', 22, [12, 13]), agents: 0, agentTools: 0, agentTouches: 0 };
  assert.equal(reach([line, stale]).rows[0].tools, 478);
  assert.equal(reach([stale, line]).rows[0].tools, 478);
});

test('two session lines with equal tools resolve to the LATER one', () => {
  const a = { ...sessionLine('tie00001', 50, [1]), lastAt: '2026-09-22T10:00:00.000Z' };
  const b = { ...sessionLine('tie00001', 50, [1, 2]), lastAt: '2026-09-22T11:00:00.000Z' };
  assert.equal(reach([a, b]).rows[0].touches, 2);
  assert.equal(reach([b, a]).rows[0].touches, 2);
});

test('the session that did the most work WITHOUT consulting the base sorts first', () => {
  const r = reach([
    sessionLine('busy0001', 300, []),
    sessionLine('small001', 4, []),
    sessionLine('good0001', 100, [2, 9, 40]),
    sessionLine('oncee001', 300, [287]),
  ]);
  // "Silent first" is the obvious rule and the wrong one: it would put `small001` — four calls, and
  // nothing to conclude from them — above a three-hundred-call session that asked once at call 287.
  assert.deepEqual(r.rows.map((x) => x.session), ['busy0001', 'oncee001', 'good0001', 'small001']);
  assert.equal(r.silent, 2, 'busy0001 and small001 never touched the base');
  // 4 touches across 704 calls. The rate is the headline; the ordering above is what makes it
  // actionable, because one number over four sessions cannot say which session to go and look at.
  assert.equal(r.perHundred.toFixed(2), '0.57');
});

test('first and last touch are carried, because the ratio cannot tell the two failures apart', () => {
  const early = reach([sessionLine('early001', 300, [3])]).rows[0];
  const late = reach([sessionLine('late0001', 300, [290])]).rows[0];
  assert.deepEqual([early.firstTouch, early.tools], [3, 300], 'oriented itself, then worked blind');
  assert.deepEqual([late.firstTouch, late.tools], [290, 300], 'worked blind, then checked');
});

test('a session that asked but published no session line is counted APART, never as a zero', () => {
  // Its machine has no `Stop` hook registered, so its tool calls are UNMEASURED. Folding it in as
  // "0 tool calls" would invent a ratio out of a missing measurement — the discipline `unreachable`
  // already gets in the miss panel.
  const r = reach([
    { kind: 'ask', _session: 'nohook01' },
    sessionLine('hooked01', 50, [1]),
  ]);
  assert.equal(r.unaccounted, 1);
  assert.equal(r.accounted, 1);
  assert.equal(r.tools, 50, 'the unmeasured session contributes nothing to the denominator');
});

test('with nothing accounted the rate is null, which is not the same as zero reach', () => {
  const r = reach([{ kind: 'ask', _session: 'nohook01' }]);
  assert.equal(r.perHundred, null);
});

test('asks are counted from the ask lines, not from touches — touches are an upper bound', () => {
  // A touch is any call through either door, so `show`/`capture`/`confirm`/`dispute` are in it.
  // Printing touches as asks would flatter a session that only ever re-read ids it already had.
  const r = reach([
    { kind: 'ask', _session: 'sess0006' },
    sessionLine('sess0006', 20, [1, 2, 3, 4]),
  ]);
  assert.deepEqual([r.rows[0].asks, r.rows[0].touches], [1, 4]);
});

// ─── the wiring that cannot be seen from either side ──────────────────────────────────────────

test('the Stop hook keys reach on the QUEUE’s session id, never on the payload’s', () => {
  // TWO DIFFERENT IDENTIFIERS, and nothing fails loudly when they are confused. A Stop hook payload
  // carries the TRANSCRIPT's id (`52b778cc-…`); every queue file, log line and ask is keyed on
  // the short key `sessionId()` derives from `CLAUDE_CODE_HOST_SESSION_ID` (`f3d05dd3…`). Measured
  // on a live machine before this shipped: keying reach on the payload files a session line under
  // an id no ask ever used, so
  // the join matches nothing, every session reports as unaccounted, and the panel says "not
  // measured" forever — a silent failure of the measurement built to expose a silent failure.
  //
  // A source guard and not a behavioural one because the hook is a script: it runs on import and
  // exits the process, so there is nothing to call. What is pinned is the one line that decides it.
  //
  // SINCE VCST-6091 the payload's id MAY reach the derivation, but only through `hookEnv`, which
  // hands it in under `CLAUDE_CODE_SESSION_ID` and only when no session variable is usable -- the
  // CLI and IDE case, where that IS the id the session's own processes carry. `hookEnv`'s behaviour
  // is pinned in kb-queue.test.mjs; this pins that the hook goes through it and nowhere else.
  const src = readFileSync(join(import.meta.dirname, '..', '..', '.claude', 'hooks', 'kb-flush.mjs'), 'utf8');
  assert.match(src, /const env = hookEnv\(process\.env, payload\)/, 'the payload reaches the key only through hookEnv');
  assert.match(src, /sessionId\(env\)/, 'the id comes from the same derivation the queue uses');
  assert.doesNotMatch(src, /payload[?.]*\.session_id/, 'the hook never reads the payload id itself');
  // With no session id at all, nothing is counted under a per-turn process key (review 4).
  assert.match(src, /const keyed = hasSessionId\(env\)/);
  assert.match(src, /if \(keyed && payload\?\.transcript_path\)/);
  // Its own cadence is paced by the ATTEMPT, marked before the token is looked for (reviews 3, 4)…
  assert.match(src, /const due = keyed && ownReachDue\(dir, session, \{ state: advanced \}\);\s*if \(due\) markTried\(dir, session\);/);
  // …and never spawns a push that has no token to push with (review 2).
  assert.match(src, /const mine = due && Boolean\(writeToken\(env\)\.token\)/);
});

test('a session sends its own counters at once, then only when they grew and the interval passed (VCST-6091)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-reach-own-'));
  try {
    const now = Date.now();
    writeFileSync(reachPath(dir, 'own00001'), JSON.stringify({ session: 'own00001', cursor: 10, tools: 19, turns: 6, touchAt: [] }), 'utf8');
    // A session with work and no kb call at all: exactly the one that used to wait for a stranger.
    assert.equal(ownReachDue(dir, 'own00001', { now }), true, 'never sent: at once');

    markSent(dir, 'own00001', readReach(dir, 'own00001'));
    assert.equal(sentMark(dir, 'own00001').work, 19);
    assert.equal(ownReachDue(dir, 'own00001', { now }), false, 'nothing new since the send');

    writeFileSync(reachPath(dir, 'own00001'), JSON.stringify({ session: 'own00001', cursor: 20, tools: 25, turns: 7, touchAt: [] }), 'utf8');
    assert.equal(ownReachDue(dir, 'own00001', { now }), false, 'grew, but the last send is recent');
    assert.equal(ownReachDue(dir, 'own00001', { now: now + OWN_REACH_EVERY_MS + 1_000 }), true, 'grew, and the interval passed');

    // TURNS COUNT TOO: a session's last turns can make no tool call, and their `turns`/`lastAt` are
    // news its last send did not carry (VCST-6091 review).
    markSent(dir, 'own00001', readReach(dir, 'own00001'));
    writeFileSync(reachPath(dir, 'own00001'), JSON.stringify({ session: 'own00001', cursor: 30, tools: 25, turns: 9, touchAt: [] }), 'utf8');
    assert.equal(unsent(dir, readReach(dir, 'own00001')), true, 'same work, more turns: still unsent');

    // Dropping a finished state forgets what was sent, so a resumed session starts over cleanly.
    dropReach(dir, 'own00001');
    assert.equal(sentMark(dir, 'own00001').work, 0);
    assert.equal(ownReachDue(dir, 'own00001', { now }), false, 'no state, nothing to send');
    assert.equal(readReach(dir, 'own00001'), null);
    assert.throws(() => readFileSync(sentPath(dir, 'own00001')), /ENOENT/, 'the sent note went with the state');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('legacy pid-keyed session lines are counted as the sessions they were, not one per turn (VCST-6091)', () => {
  // Before the fix every Stop hook minted a new `p<pid>` and recounted its transcript from zero, so
  // one real session became one line per turn. The transcript's own start and the operator group them.
  const turnLine = (session, tools, lastAt, who = 'octo-a', firstAt = '2026-09-28T08:00:00Z') =>
    ({ kind: 'session', session, tools, turns: 1, touchAt: [], firstAt, lastAt, who });
  const r = reach([
    turnLine('p1001', 10, '2026-09-28T08:05:00Z'),
    turnLine('p1002', 25, '2026-09-28T08:10:00Z'),
    turnLine('p1003', 40, '2026-09-28T08:20:00Z'),
    // The same pid on ANOTHER operator's machine is another session.
    turnLine('p1003', 7, '2026-09-28T09:00:00Z', 'octo-b', '2026-09-28T08:55:00Z'),
    // A real key is left exactly as it is.
    { kind: 'session', session: 'f3d05dd3', tools: 5, turns: 2, touchAt: [1], firstAt: '2026-09-28T07:00:00Z', lastAt: '2026-09-28T07:30:00Z' },
  ]);
  assert.equal(r.accounted, 3, 'three sessions, not five');
  assert.equal(r.tools, 40 + 7 + 5, 'each counted once, at its fullest — not 10 + 25 + 40');
  // Two groups sharing a pid are two labels, each with its start (review 3), never one label twice.
  assert.deepEqual(r.rows.map((x) => x.session).sort(), ['f3d05dd3', 'p1003@2026-09-28T08:00', 'p1003@2026-09-28T08:55']);
});

test('a replaced transcript RESETS the counters and says so — no carry, by decision (VCST-6091)', () => {
  // A carry across replacements was built and reviewed four times, each round finding a new edge, for
  // a case measured once. So a replacement resets as it always did, and the `restart` line is the
  // record. The session's fuller earlier line is what the report shows for it.
  const dir = mkdtempSync(join(tmpdir(), 'kb-reach-replaced-'));
  try {
    const t = join(dir, 'transcript.jsonl');
    writeFileSync(t, `${turn('Read', 'Read', 'mcp__kb__kb_ask')}${turn('Edit')}`, 'utf8');
    advanceReach({ dir, session: 'repl0001', transcriptPath: t });
    markSent(dir, 'repl0001', readReach(dir, 'repl0001'));

    writeFileSync(t, `${turn('Read')}`, 'utf8');                      // replaced: shorter than the cursor
    const after = advanceReach({ dir, session: 'repl0001', transcriptPath: t });
    assert.deepEqual([after.tools, after.touchAt], [1, []], 'counted from the new document only');
    assert.equal(lineWork(reachLine(after)), 1);
    const restarts = readFileSync(join(dir, 'repl0001.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(restarts.map((l) => [l.kind, l.why, l.priorTools]), [['restart', 'transcript-replaced', 4]]);
    assert.equal(unsent(dir, after), true, 'its turns still grew, so it is still news');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review 2.3: one legacy pid in two groups gives each ask to ONE group, by operator and time', () => {
  const s = (session, tools, who, firstAt) => ({ kind: 'session', session, tools, turns: 1, touchAt: [], firstAt, who });
  const r = reach([
    s('p2001', 30, 'octo-a', '2026-09-25T08:00:00Z'),
    s('p2001', 12, 'octo-b', '2026-09-28T06:00:00Z'),
    { kind: 'ask', _session: 'p2001', who: 'octo-a', at: '2026-09-25T08:30:00Z' },
    { kind: 'ask', _session: 'p2001', who: 'octo-b', at: '2026-09-28T06:10:00Z' },
    { kind: 'ask', _session: 'p2001', who: 'octo-b', at: '2026-09-28T06:20:00Z' },
  ]);
  const byTools = Object.fromEntries(r.rows.map((x) => [x.tools, x.asks]));
  assert.deepEqual(byTools, { 30: 1, 12: 2 }, 'three asks, three counted — not six');
});

test('review 2.5: a legacy row whose key lives only in `_session` is still named, and sorts', () => {
  const r = reach([
    { kind: 'session', _session: 'p3001', tools: 5, turns: 1, touchAt: [], firstAt: '2026-09-20T08:00:00Z', who: 'octo-a' },
    { kind: 'session', session: 'f3d05dd3', tools: 5, turns: 1, touchAt: [], firstAt: '2026-09-20T09:00:00Z' },
  ]);
  assert.deepEqual(r.rows.map((x) => x.session).sort(), ['f3d05dd3', 'p3001@2026-09-20T08:00']);
});

test('one definition of work and of session identity, shared by writer and report', () => {
  assert.equal(lineWork({ tools: 3, agentTools: 4 }), 7);
  assert.equal(lineTouches({ touchAt: [1, 2], agentTouches: 1 }), 3);
  assert.equal(sessionKeyOf({ session: 'f3d05dd3', firstAt: 'x' }), 'f3d05dd3');
  assert.equal(sessionKeyOf({ session: 'p24300-ab12', firstAt: 'x' }), 'p24300-ab12', 'a new process key is unique already');
  assert.notEqual(sessionKeyOf({ session: 'p24300', who: 'a', firstAt: '1' }), sessionKeyOf({ session: 'p24300', who: 'b', firstAt: '2' }));
});

test('review 1: a collapsed legacy group still joins its asks and counts them as accounted', () => {
  const r = reach([
    { kind: 'session', session: 'p1001', tools: 10, turns: 1, touchAt: [], firstAt: '2026-09-28T08:00:00Z', who: 'octo-a' },
    { kind: 'session', session: 'p1002', tools: 20, turns: 1, touchAt: [], firstAt: '2026-09-28T08:00:00Z', who: 'octo-a' },
    { kind: 'ask', _session: 'p1001' },
    { kind: 'ask', _session: 'p1002' },
  ]);
  assert.equal(r.accounted, 1);
  assert.equal(r.rows[0].asks, 2, 'asks under every member key');
  assert.equal(r.unaccounted, 0);
});

test('review 3.1: a replaced transcript recounts its subagents ONCE', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-reach-sub-'));
  try {
    const t = join(dir, 'sess.jsonl');
    const subDir = join(dir, 'sess', 'subagents');
    mkdirSync(subDir, { recursive: true });
    writeFileSync(join(subDir, 'agent-1.jsonl'), `${turn('Read', 'Read', 'Read')}`, 'utf8');
    writeFileSync(t, `${turn('Read', 'Edit')}${turn('Bash')}`, 'utf8');
    advanceReach({ dir, session: 'sub00001', transcriptPath: t });
    assert.equal(workIn(readReach(dir, 'sub00001')), 3 + 3, 'three parent calls, three subagent calls');
    writeFileSync(t, `${turn('Read')}`, 'utf8');                      // the parent's transcript is replaced
    const after = advanceReach({ dir, session: 'sub00001', transcriptPath: t });
    assert.equal(workIn(after), 1 + 3, 'the new document’s 1, and the subagent’s 3 counted once');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review 3.2: the hook’s own attempt paces it, and does not stop the push it started', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-reach-tried-'));
  try {
    const now = Date.now();
    writeFileSync(reachPath(dir, 'try00001'), JSON.stringify({ session: 'try00001', cursor: 1, tools: 9, turns: 2, touchAt: [] }), 'utf8');
    assert.equal(ownReachDue(dir, 'try00001', { now }), true);
    markTried(dir, 'try00001');                                       // the push then stops early, marking nothing
    assert.equal(ownReachDue(dir, 'try00001', { now }), false, 'the next turn does not start another');
    assert.equal(ownReachDue(dir, 'try00001', { now, attempts: false }), true, 'but the push that was started still sends');
    assert.equal(ownReachDue(dir, 'try00001', { now: now + OWN_REACH_EVERY_MS + 1_000 }), true, 'and the cadence resumes');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review 3.5: one legacy session is ONE group even when some of its lines are unsigned', () => {
  const s = (session, tools, who) => ({ kind: 'session', session, tools, turns: 1, touchAt: [], firstAt: '2026-09-28T08:00:00.123Z', ...(who ? { who } : {}) });
  const r = reach([s('p4001', 10), s('p4002', 20, 'octo-a'), s('p4003', 30)]);
  assert.equal(r.accounted, 1);
  assert.equal(r.tools, 30);
});

test('review 3.7: a legacy ask credited to a group outside the window is unaccounted, not lost', () => {
  const r = reach([
    { kind: 'session', session: 'p5001', tools: 5, turns: 1, touchAt: [], firstAt: '2026-09-01T08:00:00Z', who: 'octo-a' },
    { kind: 'session', session: 'p5001', tools: 7, turns: 1, touchAt: [], firstAt: '2026-09-28T08:00:00Z', who: 'octo-b' },
    { kind: 'ask', _session: 'p5001', who: 'octo-a', at: '2026-09-01T08:30:00Z' },
  ], { since: '2026-09-20T00:00:00Z' });
  assert.equal(r.accounted, 1);
  assert.equal(r.rows[0].asks, 0);
  assert.equal(r.unaccounted, 1, 'counted somewhere, as the same case with a real key would be');
});

test('review 4.3: a different transcript file under the same key is a replacement, even when larger', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kb-reach-moved-'));
  try {
    const a = join(dir, 'a.jsonl');
    const b = join(dir, 'b.jsonl');
    writeFileSync(a, `${turn('Read')}`, 'utf8');
    advanceReach({ dir, session: 'move0001', transcriptPath: a });
    writeFileSync(b, `${turn('Read', 'Read')}${turn('Edit', 'Bash')}${turn('Grep')}`, 'utf8');
    const after = advanceReach({ dir, session: 'move0001', transcriptPath: b });
    assert.equal(after.tools, 5, 'the new file is read from its start, not from the old cursor');
    const logged = readFileSync(join(dir, 'move0001.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.deepEqual(logged.map((l) => l.why), ['transcript-moved'], 'and the log says what happened');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('review 4.9: a legacy line with no firstAt is a group of its own, so its asks are counted once', () => {
  // The double count needs the key in BOTH shapes: a line without `firstAt` (plain lookup) and one with
  // it (a legacy group). Both then claimed the same two asks.
  const r = reach([
    { kind: 'session', session: 'p6001', tools: 4, turns: 1, touchAt: [] },
    { kind: 'session', session: 'p6001', tools: 6, turns: 1, touchAt: [], firstAt: '2026-09-28T08:00:00Z' },
    { kind: 'ask', _session: 'p6001', at: '2026-09-28T09:00:00Z' },
    { kind: 'ask', _session: 'p6001', at: '2026-09-28T09:10:00Z' },
  ]);
  assert.equal(r.accounted, 2);
  assert.equal(r.rows.reduce((n, x) => n + x.asks, 0), 2, 'two asks, two counted — not four');
  assert.equal(r.unaccounted, 0);
});
