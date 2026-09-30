// The schema-2 migration's derivation (VCST-6122 M2): what a plan turns into. The plans themselves
// are data written by a model and are not tested here; the rules the OUTPUT must keep are.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { mintId } from '../kb/core/canonical.mjs';
import { parseEntry, stringifyFrontmatter } from '../kb/core/frontmatter.mjs';
import { buildIndex, buildRow } from '../kb/core/index-build.mjs';
import { entryHash, migrate } from '../kb/core/migrate-schema2.mjs';

const VOCAB = { concepts: [{ id: 'coupon' }, { id: 'cart' }, { id: 'account-coupons' }] };
const EVIDENCE = [
  { method: 'observation', deployment: 'somewhere', at: '2026-09-25T11:16:59.019Z' },
  { method: 'observation', deployment: 'elsewhere', at: '2026-09-26T10:00:00.000Z', note: 'held again' },
];
const PARENT = `${stringifyFrontmatter({
  id: 'KB-00000001', subject: 'coupon codes validate case-insensitively while the account page shows them uppercased',
  plane: 'experiential', question: 'Is a coupon code case-sensitive?', status: 'active',
  appliesTo: [{ axis: 'surface', value: 'storefront-ui' }, { axis: 'store', value: 'b2b' }],
  anchors: [{ coordinate: 'Mutation.addCoupon' }, { coordinate: '/account/coupons' }],
  evidence: EVIDENCE,
})}\nTwo facts in one body.\n`;
const files = () => new Map([['entries/KB-00000001.md', PARENT]]);
const BASED = entryHash(PARENT);
const Q = ['one?', 'two?', 'three?'];
const child = (subject, anchors, concepts) => ({ subject, question: 'q?', anchors, surface: ['xapi'], body: `${subject}.`, questions: Q, concepts });
const SPLIT = {
  id: 'KB-00000001', action: 'split', why: 'two facts', basedOn: BASED,
  children: [
    child('coupon codes apply case-insensitively', ['Mutation.addCoupon'], ['coupon']),
    child('the account coupons page shows codes uppercased', ['/account/coupons'], ['account-coupons']),
  ],
};

test('a kept entry gains its card and canonical surfaces, and keeps its body byte for byte', () => {
  const r = migrate(files(), [{ id: 'KB-00000001', action: 'keep', basedOn: BASED, surface: ['xapi', 'storefront-ui'], questions: Q, concepts: ['coupon'] }], VOCAB);
  assert.deepEqual(r.problems, []);
  const { data, body } = parseEntry(r.writes.get('entries/KB-00000001.md'));
  assert.deepEqual(data.questions.map((q) => q.text), Q);
  assert.deepEqual(data.appliesTo, [{ axis: 'store', value: 'b2b' }, { axis: 'surface', value: 'xapi' }, { axis: 'surface', value: 'storefront-ui' }]);
  assert.equal(body, 'Two facts in one body.\n');
  assert.deepEqual(data.evidence, EVIDENCE, 'a kept entry keeps its evidence untouched');
});

test('a split retires the parent, still resolvable, and points at children minted from their subjects', () => {
  const r = migrate(files(), [SPLIT], VOCAB);
  assert.deepEqual(r.problems, []);
  const ids = SPLIT.children.map((c) => mintId(c.subject));
  assert.deepEqual(r.created, ids);
  const parent = parseEntry(r.writes.get('entries/KB-00000001.md'));
  assert.equal(parent.data.status, 'superseded');
  assert.deepEqual(parent.data.supersededBy, ids.map((id) => ({ id })));
  assert.equal(parent.body, 'Two facts in one body.\n', 'the retired body is not rewritten');
});

test('a child inherits every evidence item verbatim, marked with the parent it came from', () => {
  const r = migrate(files(), [SPLIT], VOCAB);
  const kid = parseEntry(r.writes.get(`entries/${r.created[1]}.md`)).data;
  assert.deepEqual(kid.evidence, EVIDENCE.map((e) => ({ ...e, splitFrom: 'KB-00000001' })));
  assert.deepEqual(kid.anchors, [{ coordinate: '/account/coupons' }]);
  assert.deepEqual(kid.appliesTo, [{ axis: 'store', value: 'b2b' }, { axis: 'surface', value: 'xapi' }]);
});

test('the whole run is refused on any problem, and nothing is returned to write', () => {
  const bad = { ...SPLIT, children: [
    { ...SPLIT.children[0], concepts: ['voucher'] },
    { ...SPLIT.children[1], anchors: ['/elsewhere'], questions: ['only one?'], surface: ['api'] },
  ] };
  const r = migrate(files(), [bad], VOCAB);
  assert.equal(r.writes.size, 0);
  assert.ok(r.problems.some((p) => /concept "voucher" is not in the vocabulary/.test(p)));
  assert.ok(r.problems.some((p) => /anchor "\/elsewhere" is not one of the parent's/.test(p)));
  assert.ok(r.problems.some((p) => /1 question\(s\)/.test(p)));
  assert.ok(r.problems.some((p) => /surface "api"/.test(p)));
});

test('a child whose subject mints an id already in the base is refused rather than overwriting it', () => {
  const taken = new Map([...files(), [`entries/${mintId(SPLIT.children[0].subject)}.md`,
    `${stringifyFrontmatter({ id: mintId(SPLIT.children[0].subject), subject: 'x', status: 'active' })}\nx\n`]]);
  assert.ok(migrate(taken, [SPLIT], VOCAB).problems.some((p) => /already taken/.test(p)));
});

test('the index is schema 2 exactly when a row carries a schema-2 field', () => {
  const plain = buildRow(parseEntry(PARENT).data, 'entries/KB-00000001.md');
  assert.equal(buildIndex([plain], { generated: 'T' }).schema, 1);
  const r = migrate(files(), [SPLIT], VOCAB);
  const rows = [...r.writes].map(([path, text]) => buildRow(parseEntry(text).data, path));
  assert.equal(buildIndex(rows, { generated: 'T' }).schema, 2);
});

test('a plan written from an older version of the entry is refused, so a stale body is never published', () => {
  const moved = new Map([['entries/KB-00000001.md', PARENT.replace('Two facts', 'Two facts, confirmed again,')]]);
  assert.ok(migrate(moved, [SPLIT], VOCAB).problems.some((p) => /changed since its plan was written/.test(p)));
  const crlf = new Map([['entries/KB-00000001.md', PARENT.replace(/\n/g, '\r\n')]]);
  assert.deepEqual(migrate(crlf, [SPLIT], VOCAB).problems, [], 'a CRLF checkout is the same version');
});
