// The M4 pipeline's derivations (VCST-6122): how a question is parsed onto the vocabulary, how the
// channels rank, and how the thresholds are chosen. Fixtures are tiny and built here; the measured
// behaviour on the real base is the bench's business, not this file's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow } from '../kb/core/index-load.mjs';
import { parseQuestion, prepareVocabulary, stem } from '../kb/core/query.mjs';
import { prepareRetrieval, retrieve } from '../kb/core/retrieve.mjs';
import { answerThreshold, decide, fitLogistic, probability, rerankByBodies } from '../kb/core/verdict.mjs';

const vocab = prepareVocabulary({
  concepts: [
    { id: 'cart', parent: null, aliases: ['cart', 'basket'] },
    { id: 'coupon', parent: 'cart', aliases: ['coupon', 'promo code'] },
    { id: 'sort', parent: null, aliases: ['sort', 'order by'] },
    { id: 'customer-order', parent: null, aliases: ['customer order'] },
  ],
});

test('stem folds plurals only, and leaves -ss/-us/-is words alone', () => {
  assert.equal(stem('codes'), 'code');
  assert.equal(stem('baskets'), 'basket');
  assert.equal(stem('categories'), 'category');
  assert.equal(stem('address'), 'address');
  assert.equal(stem('status'), 'status');
});

test('an alias phrase is matched with its stop words: "order by" does not fire on every "order"', () => {
  assert.deepEqual(parseQuestion('why is my order total wrong', vocab).concepts, []);
  assert.deepEqual(parseQuestion('can I order by date', vocab).concepts, ['sort']);
});

test('aliases map plurals onto concepts, and the parent is added to the expansion', () => {
  const p = parseQuestion('two promo codes on one basket', vocab);
  assert.deepEqual(p.concepts, ['cart', 'coupon']);
  assert.deepEqual(new Set(p.expanded), new Set(['cart', 'coupon']));
  assert.deepEqual(parseQuestion('promo codes', vocab).expanded.sort(), ['cart', 'coupon']);
});

test('unmapped share counts content words only, and a named coordinate is mapped', () => {
  const p = parseQuestion('does Query.validateCoupon accept a promo code in lowercase', vocab);
  assert.deepEqual(p.coords.map((c) => [c.raw, c.kind]), [['Query.validateCoupon', 'graphql-op']]);
  assert.ok(p.surfaces.includes('xapi'));
  assert.deepEqual(p.unmapped.sort(), ['accept', 'lowercase']);
});

const row = (id, o) => normalizeRow({ id, path: `entries/${id}.md`, subject: '', ...o });
const rows = [
  row('KB-00000001', { subject: 'coupon codes are matched case-insensitively', questions: ['Does a lowercase promo code still apply?'], concepts: ['coupon'] }),
  row('KB-00000002', { subject: 'the cart page lists line items', questions: ['What does the basket page show?'], concepts: ['cart'], anchors: ['/cart'] }),
  row('KB-00000003', { subject: 'order history sorts by date', questions: ['How are my past orders ordered?'], concepts: ['sort'] }),
];

test('the vocabulary bridges words the entry never uses: "promo code" finds the coupon entry first', () => {
  const { candidates } = retrieve(prepareRetrieval(rows, vocab), 'will my promo code work in lower case?');
  assert.equal(candidates[0].row.id, 'KB-00000001');
});

test('an entry without a card still ranks on its subject', () => {
  const bare = [...rows, row('KB-00000004', { subject: 'gift wrapping is not offered at checkout' })];
  const { candidates } = retrieve(prepareRetrieval(bare, vocab), 'is gift wrapping offered');
  assert.equal(candidates[0].row.id, 'KB-00000004');
});

test('a card question left out no longer finds its own entry through itself', () => {
  const prep = prepareRetrieval(rows, vocab);
  const self = retrieve(prep, 'How are my past orders ordered?').candidates.find((c) => c.row.id === 'KB-00000003');
  const out = retrieve(prep, 'How are my past orders ordered?', { leaveOut: { index: 2, question: 0 } }).candidates.find((c) => c.row.id === 'KB-00000003');
  assert.ok((out?.sentence.score ?? 0) < self.sentence.score);
});

test('the answer threshold is the lowest probability whose answers reach the precision', () => {
  const scored = [{ p: 0.9, correct: true }, { p: 0.8, correct: true }, { p: 0.7, correct: false }, { p: 0.6, correct: true }];
  assert.equal(answerThreshold(scored, { precision: 0.95 }), 0.8);
  assert.equal(answerThreshold([{ p: 0.9, correct: false }], { precision: 0.95 }), Infinity);
});

test('below the answer threshold the verdict is ambiguous; none only when nothing was found (Decision 1a)', () => {
  const prep = prepareRetrieval(rows, vocab);
  const sure = { model: { features: [], mean: [], std: [], weights: [], bias: 10 }, thresholds: { answer: 0.9 } };
  const unsure = { ...sure, model: { ...sure.model, bias: -10 } };
  assert.equal(decide(prep, sure, 'will my promo code work in lower case?').verdict, 'answer');
  assert.equal(decide(prep, unsure, 'will my promo code work in lower case?').verdict, 'ambiguous');
  assert.equal(decide(prep, sure, 'xylophone quantum').verdict, 'none');
  assert.equal(decide(prep, { ...sure, thresholds: { answer: null } }, 'will my promo code work in lower case?').verdict, 'ambiguous');
});

test('the logistic fit separates a separable feature', () => {
  const samples = [0, 0.1, 0.2, 0.8, 0.9, 1].map((x) => ({ f: { x }, y: x > 0.5 ? 1 : 0 }));
  const m = fitLogistic(samples, { features: ['x'], l2: 0.01 });
  assert.ok(probability(m, { x: 1 }) > 0.9 && probability(m, { x: 0 }) < 0.1);
});

test('the head re-rank lifts the candidate whose body states the asked words, and only within the head', () => {
  const prep = prepareRetrieval(rows, vocab);
  const found = retrieve(prep, 'is a promo code on the basket page shown monochrome');
  const ids = found.candidates.map((c) => c.row.id);
  assert.ok(ids.length >= 2);
  const bodies = new Map(ids.map((id) => [id, id === ids[ids.length - 1] ? 'the code is shown monochrome' : '']));
  const re = rerankByBodies(prep, found, bodies, { k: ids.length, lambda: 5 });
  assert.equal(re.candidates[0].row.id, ids[ids.length - 1]);
  const kept = rerankByBodies(prep, found, bodies, { k: 1, lambda: 5 });
  assert.deepEqual(kept.candidates.map((c) => c.row.id), ids);
});
