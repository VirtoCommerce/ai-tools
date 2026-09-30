// Schema 2 in the client (VCST-6122 M1): the retrieval card and the retirement pointer are read,
// carried and written, anchor kinds and canonical surfaces are DERIVED, and nothing about ranking
// moves. Every test here is over a derivation -- a parse, a rewrite, a classification -- never over
// a declared constant (`.claude/knowledge/execution/when-to-write-a-test.md`).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { parseEntry, stringifyFrontmatter } from '../kb/core/frontmatter.mjs';
import { appendEvidence } from '../kb/core/push.mjs';
import { buildRow } from '../kb/core/index-build.mjs';
import { normalizeRow, retrievable, surfacesOf } from '../kb/core/index-load.mjs';
import { anchorKind } from '../kb/core/coordinates.mjs';
import { showLines } from '../kb/core/render.mjs';

const CARDED = [
  '---',
  'id: KB-00000002',
  'subject: coupon codes apply case-insensitively',
  'plane: experiential',
  'question: Is a coupon code case-sensitive when applied?',
  'questions:',
  '  - text: Do SAVE10 and save10 both work as promo codes?',
  '  - text: Does the voucher box care about capital letters?',
  'concepts:',
  '  - id: coupon',
  '  - id: coupon.validation',
  'status: active',
  'anchors:',
  '  - coordinate: Mutation.addCoupon',
  'evidence:',
  '  - method: observation',
  '    deployment: somewhere',
  '    at: 2026-09-16T12:00:00.000Z',
  '---',
  '',
  'The body.',
  '',
].join('\n');

test('an entry carrying a card is read and written back byte for byte', () => {
  const { data, body } = parseEntry(CARDED);
  assert.deepEqual(data.questions.map((q) => q.text),
    ['Do SAVE10 and save10 both work as promo codes?', 'Does the voucher box care about capital letters?']);
  assert.equal(`${stringifyFrontmatter(data)}\n${body}`, CARDED);
});

test('a confirm on a carded entry keeps the card -- the rewrite a pre-M1 client could not do', () => {
  const item = { method: 'observation', deployment: 'elsewhere', at: '2026-09-30T10:00:00.000Z' };
  const { text, data } = appendEvidence(CARDED, item, 'KB-00000002.md');
  assert.equal(data.evidence.length, 2);
  assert.deepEqual(parseEntry(text).data.concepts, [{ id: 'coupon' }, { id: 'coupon.validation' }]);
  assert.ok(text.endsWith('\nThe body.\n'), 'the prose is sliced back, never re-serialised');
});

test('a split entry names its children as a list, a retired one may name one bare id', () => {
  const split = stringifyFrontmatter({ id: 'KB-1', subject: 's', status: 'superseded',
    supersededBy: [{ id: 'KB-A' }, { id: 'KB-B' }] });
  assert.deepEqual(buildRow(parseEntry(`${split}\n`).data, 'p').supersededBy, ['KB-A', 'KB-B']);
  const retired = stringifyFrontmatter({ id: 'KB-1', subject: 's', status: 'superseded', supersededBy: 'KB-A' });
  assert.deepEqual(buildRow(parseEntry(`${retired}\n`).data, 'p').supersededBy, ['KB-A']);
});

test('a row gains card keys only when the entry has a card, so pre-M1 rows are rewritten unchanged', () => {
  const plain = buildRow({ id: 'KB-1', subject: 's', anchors: [], evidence: [] }, 'p');
  assert.deepEqual(Object.keys(plain),
    ['id', 'path', 'subject', 'question', 'anchors', 'scope', 'plane', 'status', 'trust', 'disputed']);
  const carded = buildRow(parseEntry(CARDED).data, 'p');
  assert.deepEqual(Object.keys(carded),
    ['id', 'path', 'subject', 'question', 'questions', 'concepts', 'anchors', 'scope', 'plane', 'status', 'trust', 'disputed']);
  assert.deepEqual(carded.concepts, ['coupon', 'coupon.validation']);
});

test('a schema-1 row loads with an empty card; a schema-2 row loads with its card', () => {
  const one = normalizeRow({ id: 'KB-1', path: 'p', subject: 's', anchors: ['/cart'] });
  assert.deepEqual([one.questions, one.concepts, one.supersededBy], [[], [], []]);
  const two = normalizeRow(buildRow(parseEntry(CARDED).data, 'p'));
  assert.equal(two.questions.length, 2);
  assert.deepEqual(two.concepts, ['coupon', 'coupon.validation']);
});

test('a superseded row is not retrievable, and show says where its fact went', () => {
  const row = normalizeRow({ id: 'KB-1', path: 'p', subject: 's', status: 'superseded', supersededBy: ['KB-A', 'KB-B'] });
  assert.deepEqual(retrievable([row]), []);
  const lines = showLines({ state: 'answer', row, body: 'b',
    trust: { label: 'single observation', confirmations: 1, disputed: 0 },
    entry: { id: 'KB-1', subject: 's', status: 'superseded', anchors: [], supersededBy: [{ id: 'KB-A' }, { id: 'KB-B' }] } });
  assert.ok(lines.includes('superseded by: KB-A, KB-B'));
});

test('anchor kinds are derived from the coordinate as written', () => {
  const cases = {
    'POST /api/carts/search': 'rest',
    'GET /api/order/customerOrders/{id}': 'rest',
    '/connect/token': 'rest',
    '/cart': 'page',
    '/company/members': 'page',
    '#!/workspace/catalog?productId=': 'blade',
    'Admin SPA: Orders > Order': 'blade',
    'Query.validateCoupon': 'graphql-op',
    'Mutations.removeCoupon': 'graphql-op',
    'Query.cart.availablePaymentMethods': 'graphql-field',
    'CouponType.isAppliedSuccessfully': 'graphql-field',
    'Marketing.Promotion.CombinePolicy': 'setting',
    'client-app/modules/google-analytics/events.ts': null,
    RewardCartGetOfRelSubtotal: null,
  };
  for (const [coordinate, kind] of Object.entries(cases)) assert.equal(anchorKind({ coordinate }), kind, coordinate);
});

test('surface spellings collapse to the closed set; an ambiguous one maps to nothing', () => {
  assert.deepEqual(surfacesOf(['surface=graphql-xapi', 'surface=storefront-xapi', 'surface=admin-spa', 'user=x']),
    ['xapi', 'admin-ui']);
  assert.deepEqual(surfacesOf(['surface=rest-api', 'surface=storefront-ui']), ['storefront-ui', 'rest']);
  assert.deepEqual(surfacesOf(['surface=ucp-mcp', 'surface=vendor-portal-ui', 'surface=background-jobs']),
    ['rest', 'ucp', 'vendor-ui']);
  assert.deepEqual(surfacesOf(['surface=api']), [],
    '`api` names UCP on some entries and REST on others -- the migration reads the entry');
  assert.deepEqual(normalizeRow({ id: 'KB-1', path: 'p', subject: 's', scope: ['surface=xapi'] }).surfaces, ['xapi']);
});
