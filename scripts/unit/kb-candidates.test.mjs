// Stage 1 of the two-stage design (STEP 6b, VCST-6087) and the harness's verdict handling.
//
// DERIVATION ONLY: BM25's ordering properties, the plural fold, how the coordinate channel is read
// from rank.mjs, and how the harness turns replies into verdicts. No test restates K1, B or
// ANCHOR_BONUS -- the anchor expectation is computed by calling `anchorWeight` itself. The judge is
// not tested here; the labelled set is its test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { candidates, corpus, foldPlural, terms } from '../kb/bench/candidates.mjs';
import { anchorWeight } from '../kb/core/rank.mjs';
import { normalizeRow } from '../kb/core/index-load.mjs';
import { majority, parseVerdict } from '../kb/bench-two-stage.mjs';

let seq = 0;
const row = (o) => {
  seq += 1;
  const id = `KB-TEST${String(seq).padStart(4, '0')}`;
  return normalizeRow({ id, path: `entries/${id}.md`, subject: '', question: '', status: 'active', ...o });
};
const ids = (list) => list.map((h) => h.row.id);

// ─── BM25 ─────────────────────────────────────────────────────────────────────────────────────

test('a rarer shared term outranks a commoner one', () => {
  // `common` is made first so the id tie-break favours it: only idf can put `rare` on top.
  const common = row({ subject: 'widget beta' });
  const rare = row({ subject: 'widget alpha' });
  const filler = [row({ subject: 'beta one' }), row({ subject: 'beta two' }), row({ subject: 'beta three' })];
  // `alpha` occurs in one entry, `beta` in four; the question names both once.
  const got = candidates('alpha beta', [rare, common, ...filler], { k: 10 });
  assert.equal(got[0].row.id, rare.id);
});

test('the same match in a shorter entry scores higher (length normalisation)', () => {
  const long = row({ subject: 'coupon field placement next to the order summary totals panel list' });
  const short = row({ subject: 'coupon field' });
  const got = candidates('coupon field', [long, short, row({ subject: 'unrelated words here' })], { k: 10 });
  assert.deepEqual(ids(got).slice(0, 2), [short.id, long.id]);
});

test('no floor: one shared word is enough to be a candidate', () => {
  const one = row({ subject: 'gift promotion' });
  const got = candidates('why is my gift missing from the order', [one, row({ subject: 'nothing shared' })], { k: 10 });
  assert.deepEqual(ids(got), [one.id]);
});

test('ties break on trust, then id -- the list is deterministic', () => {
  const a = row({ subject: 'cart line', trust: 1 });
  const b = row({ subject: 'cart line', trust: 3 });
  const c = row({ subject: 'cart line', trust: 3 });
  assert.deepEqual(ids(candidates('cart line', [a, c, b], { k: 10 })), [b.id, c.id, a.id]);
});

// ─── plural folding ───────────────────────────────────────────────────────────────────────────

test('plural folding: -ies -> -y, -s dropped, s/u/i-final stems untouched', () => {
  assert.deepEqual(['entries', 'coupons', 'items', 'status', 'address', 'analysis', 'cart'].map(foldPlural),
    ['entry', 'coupon', 'item', 'status', 'address', 'analysis', 'cart']);
});

test('a plural in the question reaches a singular in the entry', () => {
  const e = row({ subject: 'coupon input placement' });
  assert.deepEqual(terms('coupons'), ['coupon']);
  assert.deepEqual(ids(candidates('where are coupons', [e], { k: 10 })), [e.id]);
});

// ─── the coordinate channel ───────────────────────────────────────────────────────────────────

test('the anchor term is rank.mjs anchorWeight, shared by the entries that carry the anchor', () => {
  const a = row({ subject: 'x', anchors: ['GET /company/members'] });
  const b = row({ subject: 'y', anchors: ['GET /company/members'] });
  const c = row({ subject: 'z', anchors: ['/api/order/customerorders'] });
  const got = candidates('what does /company/members show', [a, b, c], { k: 10 });
  const hit = got.find((h) => h.row.id === a.id);
  assert.equal(hit.anchor, anchorWeight('GET /company/members', 2));
  assert.equal(got.some((h) => h.row.id === c.id), false);
});

test('a page anchor weighs nothing but still makes its entry a candidate', () => {
  const page = row({ subject: 'unrelated', anchors: ['/cart'] });
  const deep = row({ subject: 'unrelated too', anchors: ['/cart/items'] });
  const got = candidates('on /cart', [page, deep], { k: 10 });
  const hit = got.find((h) => h.row.id === page.id);
  assert.ok(hit, 'the page-anchored entry is a candidate');
  assert.equal(hit.anchor, anchorWeight('/cart', 1));
});

test('rrf fuses by position: first in both channels beats first in one', () => {
  const both = row({ subject: 'members active column', anchors: ['GET /company/members'] });
  const lexOnly = row({ subject: 'members active column reflect' });
  const got = candidates('members active column reflect /company/members', [lexOnly, both], { k: 10, fuse: 'rrf' });
  assert.equal(got[0].row.id, both.id);
});

test('corpus statistics are per base: passing them in changes nothing', () => {
  const rows = [row({ subject: 'gift line' }), row({ subject: 'gift order line' })];
  assert.deepEqual(ids(candidates('gift line', rows, { stats: corpus(rows) })), ids(candidates('gift line', rows)));
});

// ─── verdict handling ─────────────────────────────────────────────────────────────────────────

test('a verdict off the contract is invalid, never coerced into a pick', () => {
  const list = ['KB-AAAA0001', 'KB-AAAA0002'];
  assert.equal(parseVerdict('```json\n{"pick": "KB-AAAA0001", "why": "x"}\n```', list).pick, 'invalid');
  assert.equal(parseVerdict('{"pick": "KB-ZZZZ9999", "why": "x"}', list).pick, 'invalid');
  assert.equal(parseVerdict('{"why": "x"}', list).pick, 'invalid');
  assert.equal(parseVerdict('{"pick": null, "why": "x"}', list).pick, null);
  assert.equal(parseVerdict('{"pick": "KB-AAAA0002", "why": "x"}', list).pick, 'KB-AAAA0002');
});

test('majority needs more than half the runs; otherwise split', () => {
  assert.equal(majority(['KB-A', 'KB-A', null]), 'KB-A');
  assert.equal(majority([null, null, 'KB-A']), null);
  assert.equal(majority(['KB-A', 'KB-B', null]), 'split');
});
