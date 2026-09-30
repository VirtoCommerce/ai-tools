// The verdict bench's scoring (VCST-6122 M4): how one labelled row and one decision become the
// numbers the gate reads. The deciders are measured BY the bench, so only the arithmetic is tested.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { labelledRows, metrics, outcome } from '../kb/bench/verdict-bench.mjs';

const target = (o = {}) => ({ id: 'T1', kind: 'target', split: 'dev', source: 'existing', expect: ['KB-A'], ...o });
const control = (o = {}) => ({ id: 'C1', kind: 'control', split: 'dev', source: 'control', ...o });
const d = (verdict, entries = [], o = {}) => ({ verdict, entries, candidates: entries, tokens: 100, ...o });

test('an answer on a control is a wrong answer and counts against precision', () => {
  const m = metrics([outcome(target(), d('answer', ['KB-A'])), outcome(control(), d('answer', ['KB-B']))]);
  assert.deepEqual([m.answerPrecision.n, m.answerPrecision.d], [1, 2]);
  assert.deepEqual(m.wrongAnswers, ['C1']);
  assert.equal(m.controlsNone.n, 0);
});

test('a right entry inside an ambiguous verdict is not an answer, and is reported beside it', () => {
  const m = metrics([outcome(target(), d('ambiguous', ['KB-B', 'KB-A']))]);
  assert.equal(m.targetsAnswered.n, 0);
  assert.equal(m.answerPrecision.d, 0);
  assert.deepEqual([m.ambiguousShare.n, m.ambiguousRight.n], [1, 1]);
});

test('recall@10 reads the candidate list, not the verdict: a none can still have recalled the entry', () => {
  const cands = Array.from({ length: 12 }, (_, i) => `KB-X${i}`);
  const at10 = outcome(target({ source: 'paraphrase' }), d('none', [], { candidates: [...cands.slice(0, 9), 'KB-A'] }));
  const at11 = outcome(target({ id: 'T2', source: 'paraphrase' }), d('none', [], { candidates: [...cands.slice(0, 10), 'KB-A'] }));
  const m = metrics([at10, at11]);
  assert.deepEqual([m.paraphraseRecall10.n, m.paraphraseRecall10.d], [1, 2]);
});

test('an answer is judged on the handed-over entry; the rest of a returned list is only top3', () => {
  const o = outcome(target(), d('answer', ['KB-B'], { listed: ['KB-B', 'KB-A'] }));
  assert.equal(o.correct, false);
  assert.equal(o.wrongAnswer, true);
  assert.equal(o.top3, true);
});

test('contested rows never reach a metric', () => {
  const rows = labelledRows({ targets: [target()], controls: [control()], contested: [target({ id: 'X' })] });
  assert.deepEqual(rows.map((r) => r.id), ['T1', 'C1']);
});
