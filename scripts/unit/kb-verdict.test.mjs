// The M4 pipeline's derivations (VCST-6122): how a question is parsed onto the vocabulary, how the
// channels rank, and how the thresholds are chosen. Fixtures are tiny and built here; the measured
// behaviour on the real base is the bench's business, not this file's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRow } from '../kb/core/index-load.mjs';
import { parseQuestion, prepareVocabulary, stem } from '../kb/core/query.mjs';
import { prepareRetrieval, retrieve } from '../kb/core/retrieve.mjs';
import { answerThreshold, decide, fitLogistic, lowerThresholds, probability } from '../kb/core/verdict.mjs';

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

test('the lower thresholds keep controls in none at the target rate before buying ambiguous targets', () => {
  const scored = [
    { p: 0.6, kind: 'target', rightInTop: true, unmappedShare: 0 },
    { p: 0.5, kind: 'control', rightInTop: false, unmappedShare: 0 },
    { p: 0.4, kind: 'target', rightInTop: true, unmappedShare: 0 },
  ];
  const t = lowerThresholds(scored, { controlsNone: 1, unmappedGrid: [1] });
  assert.ok(t.none > 0.5 && t.none <= 0.6);
});

test('a high unmapped share pushes to ambiguous, never to none', () => {
  const prep = prepareRetrieval(rows, vocab);
  const ranker = { model: { features: [], mean: [], std: [], weights: [], bias: -10 }, thresholds: { answer: 0.99, none: 0.5, unmapped: 0.5 } };
  assert.equal(decide(prep, ranker, 'xylophone quantum basket').verdict, 'ambiguous');
  assert.equal(decide(prep, { ...ranker, thresholds: { ...ranker.thresholds, unmapped: 1.01 } }, 'xylophone quantum basket').verdict, 'none');
});

test('the logistic fit separates a separable feature', () => {
  const samples = [0, 0.1, 0.2, 0.8, 0.9, 1].map((x) => ({ f: { x }, y: x > 0.5 ? 1 : 0 }));
  const m = fitLogistic(samples, { features: ['x'], l2: 0.01 });
  assert.ok(probability(m, { x: 1 }) > 0.9 && probability(m, { x: 0 }) < 0.1);
});
