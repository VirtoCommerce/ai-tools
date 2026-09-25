// The one-time log-layout migration (`scripts/kb/migrate-log-layout.mjs`) — its PLANNER, which is
// pure and is where every promise the migration makes actually lives: no line rewritten, none
// dropped, none de-duplicated, every session still present, and each line routed exactly as the
// writer would route it today. The network half is a thin shell around this and is proved on a
// throwaway branch, not here.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { oldShape, planMigration, rawLines, sameLines } from '../kb/migrate-log-layout.mjs';

const L = (o) => JSON.stringify(o);

test('both older shapes, flat and nested, are recognised — and a current file is not', () => {
  assert.deepEqual(oldShape('log/2026-09-18/20260918T171217Z-local_26.jsonl'), { day: '2026-09-18', session: 'local_26' });
  assert.deepEqual(oldShape('log/2026-09-21/f3d05dd3-0003.jsonl'), { day: '2026-09-21', session: 'f3d05dd3' });
  assert.deepEqual(oldShape('log/2026-09-21/f3d05dd3/f3d05dd3-0003.jsonl'), { day: '2026-09-21', session: 'f3d05dd3' });
  // STEP 3b's case: an all-digit key satisfies both patterns, and only the stamp is anchored.
  assert.deepEqual(oldShape('log/2026-09-21/20260921T090000Z-12345678.jsonl'), { day: '2026-09-21', session: '12345678' });
  assert.deepEqual(oldShape('log/2026-09-21/12345678/12345678-0002.jsonl'), { day: '2026-09-21', session: '12345678' });
  assert.equal(oldShape('log/20260921-f3d05dd3.jsonl'), null, 'already migrated — never touched');
  assert.equal(oldShape('log/README.md'), null);
});

test('lines move BYTE FOR BYTE, by their own date, and every old file is deleted', () => {
  // Deliberately odd spacing and key order: a planner that re-serialised would normalise them.
  const a = '{"kind":"ask",  "at":"2026-09-18T23:59:00Z","q":"late"}';
  const b = '{"at":"2026-09-19T00:01:00Z","kind":"ask","q":"early"}';
  const plan = planMigration([{ path: 'log/2026-09-19/f3d05dd3/f3d05dd3-0001.jsonl', text: `${a}\n${b}\n` }]);
  assert.deepEqual([...plan.writes.keys()].sort(), ['log/20260918-f3d05dd3.jsonl', 'log/20260919-f3d05dd3.jsonl']);
  assert.deepEqual(plan.writes.get('log/20260918-f3d05dd3.jsonl'), [a], 'the exact bytes, not a re-serialisation');
  assert.deepEqual(plan.writes.get('log/20260919-f3d05dd3.jsonl'), [b]);
  assert.deepEqual(plan.deletions, ['log/2026-09-19/f3d05dd3/f3d05dd3-0001.jsonl']);
});

test('a swept `session` line moves to the session it DESCRIBES', () => {
  const plan = planMigration([{
    path: 'log/2026-09-22/2ca7d89e/2ca7d89e-0001.jsonl',
    text: `${L({ at: '2026-09-22T10:00:00Z', kind: 'ask', q: 'x' })}\n${L({ at: '2026-09-22T10:01:00Z', kind: 'session', session: '35b6f0e1', tools: 9 })}\n`,
  }]);
  assert.equal(plan.writes.get('log/20260922-35b6f0e1.jsonl').length, 1);
  assert.equal(plan.writes.get('log/20260922-2ca7d89e.jsonl').length, 1);
  assert.ok(plan.after.sessions.has('35b6f0e1') && plan.after.sessions.has('2ca7d89e'));
});

test('byte-identical repeats are KEPT — moving evidence is not judging it', () => {
  // The 2026-09-21 double push left 13 identical lines in two files. De-duplicating them here would
  // be a correct-looking rewrite of the record, and the count check after would no longer be exact.
  const same = L({ at: '2026-09-21T08:14:00Z', kind: 'ask', q: 'dup' });
  const plan = planMigration([
    { path: 'log/2026-09-21/20260921T081451Z-local_e8.jsonl', text: `${same}\n` },
    { path: 'log/2026-09-21/20260921T081459Z-local_e8.jsonl', text: `${same}\n` },
  ]);
  assert.deepEqual(plan.writes.get('log/20260921-local_e8.jsonl'), [same, same]);
  assert.equal(plan.before.lines, plan.after.lines);
});

test('an existing current-shape file keeps its lines FIRST; migrated ones follow in time order', () => {
  const kept = L({ at: '2026-09-23T09:00:00Z', kind: 'ask', q: 'written by the new writer' });
  const late = L({ at: '2026-09-23T08:00:00Z', kind: 'ask', q: 'later old file' });
  const early = L({ at: '2026-09-23T07:00:00Z', kind: 'ask', q: 'earlier old file' });
  const plan = planMigration([
    { path: 'log/20260923-c34caad0.jsonl', text: `${kept}\n` },
    // PATH order puts the LATER line first, so only the sort on `at` puts them right.
    { path: 'log/2026-09-23/c34caad0/c34caad0-0001.jsonl', text: `${late}\n` },
    { path: 'log/2026-09-23/c34caad0/c34caad0-0003.jsonl', text: `${early}\n` },
  ]);
  assert.deepEqual(plan.writes.get('log/20260923-c34caad0.jsonl'), [kept, early, late]);
  assert.ok(!plan.deletions.includes('log/20260923-c34caad0.jsonl'));
  assert.deepEqual([plan.before.files, plan.after.files, plan.before.lines, plan.after.lines], [3, 1, 3, 3]);
});

test('an unparseable or undated line keeps its bytes and lands under its OLD day and session', () => {
  const torn = '{"kind":"ask","q":"torn';
  const undated = L({ kind: 'flush', ok: true });
  const plan = planMigration([{ path: 'log/2026-09-20/20260920T100000Z-abcd1234.jsonl', text: `${torn}\n${undated}\n` }]);
  assert.deepEqual(plan.writes.get('log/20260920-abcd1234.jsonl'), [torn, undated]);
});

test('sameLines is the exact check: a dropped, a doubled or a reformatted line is a difference', () => {
  const a = L({ at: '2026-09-21T00:00:00Z', kind: 'ask' });
  const b = L({ at: '2026-09-21T00:01:00Z', kind: 'ask' });
  assert.equal(sameLines([`${a}\n${b}\n`], [`${b}\n`, `${a}\n`]), null, 'regrouped and reordered is the same');
  assert.ok(sameLines([`${a}\n${b}\n`], [`${a}\n`]), 'dropped');
  assert.ok(sameLines([`${a}\n`], [`${a}\n${a}\n`]), 'doubled');
  assert.ok(sameLines([`${a}\n`], [`${JSON.stringify(JSON.parse(a), null, 1).split('\n').join('')}\n`]), 'reformatted');
  assert.deepEqual(rawLines('x\n\n y \n'), ['x', ' y '], 'blank lines are not content; others are untouched');
});
