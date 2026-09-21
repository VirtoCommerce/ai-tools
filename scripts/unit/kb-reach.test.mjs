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
import { mkdtempSync, rmSync, writeFileSync, appendFileSync, utimesSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  REACH_IDLE_MS, advanceReach, countToolUses, dropReach, idleReaches, readReach, reachLine, reachPath,
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
  assert.deepEqual(idleReaches(dir, { session: 'mineeeee', idleMs: REACH_IDLE_MS }).map((r) => r.session), ['other001'],
    'idleness is the only end-of-session signal this system has');
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

test('dropping a reach state is what makes a session publish exactly once', () => withDir((dir) => {
  const t = join(dir, 'transcript.jsonl');
  writeFileSync(t, turn('Read'));
  advanceReach({ dir, session: 'sess0005', transcriptPath: t });
  dropReach(dir, 'sess0005');
  assert.equal(readReach(dir, 'sess0005'), null);
  dropReach(dir, 'sess0005');   // idempotent: a failed push retries, and must not throw here
}));

// ─── the panel ────────────────────────────────────────────────────────────────────────────────

const sessionLine = (session, tools, touchAt) => ({ kind: 'session', session, tools, turns: 1, touchAt, _session: 'pusher' });

test('the panel credits the session a line DESCRIBES, not the one that pushed it', () => {
  // A stopped session's line rides out in whatever session happens to flush next. Reading `_session`
  // would file every silent session's work under the one machine that was still running.
  const [row] = reach([sessionLine('quiet001', 300, [])]).rows;
  assert.equal(row.session, 'quiet001');
  assert.equal(row.tools, 300);
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
  // `CLAUDE_CODE_HOST_SESSION_ID` truncated to 8 (`local_0f…`). Measured on a live machine before
  // this shipped: keying reach on the payload files a session line under an id no ask ever used, so
  // the join matches nothing, every session reports as unaccounted, and the panel says "not
  // measured" forever — a silent failure of the measurement built to expose a silent failure.
  //
  // A source guard and not a behavioural one because the hook is a script: it runs on import and
  // exits the process, so there is nothing to call. What is pinned is the one line that decides it.
  const src = readFileSync(join(import.meta.dirname, '..', '..', '.claude', 'hooks', 'kb-flush.mjs'), 'utf8');
  assert.match(src, /sessionId\(process\.env\)/, 'the id comes from the same derivation the queue uses');
  assert.doesNotMatch(src, /payload[?.]*\.session_id/, 'the payload supplies the transcript path and nothing else');
});
