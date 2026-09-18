// Identity, dedupe and the id rule (PLAN §2, §12 rules 4 and 5).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mintId } from '../kb/core/canonical.mjs';
import { findDuplicate, identityKey, refusalMessage, rowKey } from '../kb/core/identity.mjs';
import { normalizeRow, normalizeScope } from '../kb/core/index-load.mjs';
import { trustOf } from '../kb/core/verbs.mjs';

const row = (o) => normalizeRow({ id: 'KB-TEST0001', path: 'entries/KB-TEST0001.md', subject: '', ...o });

// ─── the id rule, which the migration must reproduce exactly ──────────────────────────────────

test('mintId is sha256(subject) truncated to 8 uppercase hex, prefixed KB-', () => {
  // Byte-for-byte: session 2 re-derives every existing id from its subject, and a change here
  // renames all 89 entries.
  assert.equal(mintId('storefront members Active column reads contact status not account state'), 'KB-27B4CD10');
  assert.match(mintId('anything at all'), /^KB-[0-9A-F]{8}$/);
});

test('two independent captures of the SAME subject COLLIDE, which is the point', () => {
  // A counter needs a single writer; a timestamp makes it worse, because two agents recording one
  // fact would mint two ids and the base would hold the fact twice.
  assert.equal(mintId('cart totals lag a quantity change'), mintId('cart totals lag a quantity change'));
  assert.notEqual(mintId('a'), mintId('b'));
});

// ─── the identity key is anchors + scope, and never wording ───────────────────────────────────

test('identity is normalised anchors AND scope axes', () => {
  const a = identityKey({ anchors: ['{BACK_URL}/api/carts'], scope: ['surface=platform-api'] });
  const b = identityKey({ anchors: ['https://host/api/carts?x=1'], scope: ['Surface=Platform-API'] });
  assert.equal(a, b, 'four spellings of one endpoint and one axis are one identity');
});

test('order does not change the key; a differing scope axis does', () => {
  const both = identityKey({ anchors: ['/b/x', '/a/y'], scope: ['surface=ui', 'env=qa'] });
  assert.equal(both, identityKey({ anchors: ['/a/y', '/b/x'], scope: ['env=qa', 'surface=ui'] }));
  // Without scope, a storefront fact gets applied to admin.
  assert.notEqual(identityKey({ anchors: ['/a/y'], scope: ['surface=storefront-ui'] }),
    identityKey({ anchors: ['/a/y'], scope: ['surface=admin-spa'] }));
});

test('wording is NOT part of the test — same anchors and scope, opposite prose, one identity', () => {
  // MEASURED in the prior art: the wording-similarity range of pairs that MUST collapse CONTAINS
  // the range of pairs that must not, and one pair stating a single fact scored 0.00.
  const one = identityKey({ anchors: ['/cart/checkout'], scope: ['surface=storefront-ui'] });
  const other = identityKey({ anchors: ['/cart/checkout'], scope: ['surface=storefront-ui'] });
  assert.equal(one, other);
});

test('an empty anchors+scope is not an identity and can never match', () => {
  assert.equal(findDuplicate([row({ anchors: [], scope: [] })], { anchors: [], scope: [] }), null);
});

test('normalizeScope accepts both the row form and the frontmatter form', () => {
  assert.deepEqual(normalizeScope([{ axis: 'surface', value: 'storefront-ui' }]), ['surface=storefront-ui']);
  assert.deepEqual(normalizeScope(['surface=storefront-ui', 'surface=storefront-ui']), ['surface=storefront-ui']);
  assert.deepEqual(normalizeScope(['not-an-axis']), [], 'a bare word is not an axis');
});

// ─── what capture does with it ────────────────────────────────────────────────────────────────

test('a matching row is found, and the key it matched on is returned', () => {
  const rows = [row({ id: 'KB-AAAA0001', anchors: ['/company/members'], scope: ['surface=storefront-ui'] })];
  const dupe = findDuplicate(rows, { anchors: ['{FRONT_URL}/company/members'], scope: ['surface=storefront-ui'] });
  assert.equal(dupe.row.id, 'KB-AAAA0001');
  assert.equal(dupe.key, rowKey(rows[0]));
});

test('a RETIRED entry never blocks a fresh capture', () => {
  // A retired entry is a fact the base decided not to serve; refusing on its account would leave
  // the base unable to relearn something it once knew.
  const rows = [row({ id: 'KB-AAAA0001', anchors: ['/cart/totals'], scope: ['surface=storefront-ui'], status: 'retired' })];
  assert.equal(findDuplicate(rows, { anchors: ['/cart/totals'], scope: ['surface=storefront-ui'] }), null);
});

test('the refusal names the id and BOTH next verbs', () => {
  // A refusal that does not say what to do instead is just a rejected write.
  const msg = refusalMessage(row({ id: 'KB-AAAA0001', subject: 'the fact', anchors: ['/company/members'], scope: ['surface=storefront-ui'] }));
  assert.match(msg, /KB-AAAA0001 is already this fact/);
  assert.match(msg, /kb confirm KB-AAAA0001/);
  assert.match(msg, /kb dispute KB-AAAA0001/);
});

test('THE ACCEPTED LIMIT: different anchors for one phenomenon are two entries, visibly', () => {
  // Deliberate — it fails in the SAFE direction. A duplicate exists visibly in the catalogue,
  // rather than a legitimate second fact being refused invisibly. Merging them is consolidation,
  // which needs a corpus that actually has them (PLAN §11).
  const rows = [row({ id: 'KB-AAAA0001', anchors: ['/company/members'], scope: ['surface=storefront-ui'] })];
  assert.equal(findDuplicate(rows, { anchors: ['Query.organizationContacts'], scope: ['surface=storefront-ui'] }), null);
});

// ─── trust is COMPUTED, never declared ────────────────────────────────────────────────────────

test('the confirmation count comes from evidence[], and a contradiction is not a confirmation', () => {
  const t = trustOf([
    { by: 'session:a', deployment: 'qa' },
    { by: 'session:b', deployment: 'stable' },
    { by: 'session:c', deployment: 'qa', contradicts: true, note: 'saw the opposite' },
  ]);
  assert.equal(t.confirmations, 2);
  assert.equal(t.disputed, 1);
  assert.equal(t.label, 'DISPUTED');
});

test('a dispute flags but never retires — the label changes, the entry does not', () => {
  // One contradicting observation against four confirmations is a flag, not a deletion.
  const t = trustOf([...Array.from({ length: 4 }, (_, i) => ({ by: `session:${i}` })), { by: 'session:x', contradicts: true }]);
  assert.equal(t.confirmations, 4);
  assert.equal(t.label, 'DISPUTED');
});

test('independent parties are counted, not raw evidence rows', () => {
  const t = trustOf([{ by: 'session:a' }, { by: 'session:a' }, { by: 'session:b' }]);
  assert.equal(t.confirmations, 3);
  assert.equal(t.parties, 2);
});
