// Building an index row (scripts/kb/core/index-build.mjs).
//
// NOT ONE NETWORK CALL IN THIS FILE. Pure functions over frontmatter.
//
// Why this is worth testing at all, when three lines of it are field copies: the MIGRATION and
// `reindex` both build rows through here, and they run months apart on the same corpus. If the two
// ever computed a row differently the repair verb would "fix" the index into a different file than
// the writer produces, and the drift it exists to remove would become permanent. What is under test
// is therefore the DERIVATION -- trust, disputed, scope flattening, sort order -- and not the
// declarations beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildIndex, buildManifest, buildRow, countEvidence, entryPath } from '../kb/core/index-build.mjs';

const entry = (over = {}) => ({
  id: 'KB-000000AA',
  subject: 'a subject',
  question: 'a question?',
  plane: 'experiential',
  status: 'active',
  appliesTo: [{ axis: 'surface', value: 'storefront-ui' }],
  anchors: [{ coordinate: 'GET /company/members' }],
  evidence: [{ method: 'observation', deployment: 'vcptcore_stable', at: '2026-09-11T00:00:00Z' }],
  ...over,
});

// ─── the two counts ───────────────────────────────────────────────────────────────────────────

test('trust counts the supporting evidence and disputed counts the contradicting', () => {
  const { trust, disputed } = countEvidence([
    { method: 'observation' },
    { method: 'observation' },
    { method: 'observation', contradicts: true },
  ]);
  assert.equal(trust, 2);
  assert.equal(disputed, 1);
});

test('a contradicting item is NOT counted as a confirmation', () => {
  // The direction matters: over-counting trust makes a disputed entry look attested, which is the
  // one way a trust label can mislead an agent into asserting something the base doubts.
  assert.deepEqual(countEvidence([{ contradicts: true }]), { trust: 0, disputed: 1 });
});

test('no evidence is zero and not a crash', () => {
  assert.deepEqual(countEvidence(), { trust: 0, disputed: 0 });
  assert.deepEqual(countEvidence(null), { trust: 0, disputed: 0 });
});

// ─── the row ──────────────────────────────────────────────────────────────────────────────────

test('a row carries what ranks an entry, and trust computed from evidence[]', () => {
  const row = buildRow(entry({
    evidence: [{ method: 'observation' }, { method: 'observation' }, { method: 'observation', contradicts: true }],
  }), 'entries/KB-000000AA.md');
  assert.equal(row.trust, 2);
  assert.equal(row.disputed, 1);
  assert.deepEqual(row.anchors, ['GET /company/members']);
  assert.deepEqual(row.scope, ['surface=storefront-ui']);
  assert.equal(row.path, 'entries/KB-000000AA.md');
});

test('a declared trust in the source is IGNORED — the count comes from the evidence', () => {
  // PLAN §12 rule 5. A declared count is a second copy of something that already has a home, and
  // the second copy is the one that goes stale. Feeding a lie in must not get it out.
  const row = buildRow({ ...entry(), trust: 99, disputed: 99 }, 'entries/KB-000000AA.md');
  assert.equal(row.trust, 1);
  assert.equal(row.disputed, 0);
});

test('appliesTo is flattened to axis=value, lowercased, deduplicated and sorted', () => {
  const row = buildRow(entry({
    appliesTo: [
      { axis: 'surface', value: 'Storefront-XAPI' },
      { axis: 'surface', value: 'storefront-ui' },
      { axis: 'surface', value: 'storefront-ui' },
    ],
  }), 'p');
  assert.deepEqual(row.scope, ['surface=storefront-ui', 'surface=storefront-xapi']);
});

test('a duplicated anchor is carried once', () => {
  const row = buildRow(entry({ anchors: [{ coordinate: '/a' }, { coordinate: '/a' }, '/b'] }), 'p');
  assert.deepEqual(row.anchors, ['/a', '/b']);
});

test('the row key order is fixed', () => {
  // The index is rewritten on every push that touches anything. Keys that move produce a diff
  // nobody can read, and a diff nobody can read is a diff nobody reviews.
  assert.deepEqual(Object.keys(buildRow(entry(), 'p')),
    ['id', 'path', 'subject', 'question', 'anchors', 'scope', 'plane', 'status', 'trust', 'disputed']);
});

// ─── the file ─────────────────────────────────────────────────────────────────────────────────

test('the index is sorted by id, so two machines rebuilding one corpus get the same bytes', () => {
  const rows = ['KB-0000000C', 'KB-0000000A', 'KB-0000000B'].map((id) => buildRow(entry({ id }), entryPath(id)));
  const built = buildIndex(rows, { generated: 'T' });
  assert.deepEqual(built.entries.map((r) => r.id), ['KB-0000000A', 'KB-0000000B', 'KB-0000000C']);
  assert.equal(built.count, 3);
  assert.equal(JSON.stringify(built), JSON.stringify(buildIndex([...rows].reverse(), { generated: 'T' })));
});

test('count is the number of rows — it is what `stat` compares against the tree to find drift', () => {
  assert.equal(buildIndex([]).count, 0);
  assert.equal(buildIndex([buildRow(entry(), 'p')]).count, 1);
});

test('entryPath is the one rule for where an entry lives', () => {
  assert.equal(entryPath('KB-27B4CD10'), 'entries/KB-27B4CD10.md');
});

test('the manifest declares a plane -> index map, which is the extension point', () => {
  const m = buildManifest();
  assert.equal(m.schema, 1);
  assert.deepEqual(m.indexes, { experiential: 'index.json' });
  // PLAN §2b: a new plane gets one manifest line and entries/ does not move.
  assert.deepEqual(buildManifest({ indexes: { experiential: 'index.json', rules: 'index-rules.json' } }).indexes,
    { experiential: 'index.json', rules: 'index-rules.json' });
});
