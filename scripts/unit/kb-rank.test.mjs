// Ranking (PLAN §3.2) and the coordinate rules it rests on (PLAN §12 rule 3).
//
// The anchor bonus is the strong signal, and it is only safe because a coordinate must be
// STRUCTURED to be eligible. Both halves are tested here, and the false positives named in the
// rule -- `organization`, `/api` -- are tested as the negatives they were measured to be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ANCHOR_BONUS, anchorHit, rank, scoreRows, tokenize } from '../kb/core/rank.mjs';
import { anchorProblems, coordinateIndex, isStructuredCoordinate, neighbours } from '../kb/core/coordinates.mjs';
import { normalizeRow } from '../kb/core/index-load.mjs';
import { normalizeAnchor } from '../kb/core/anchors.mjs';

const row = (o) => normalizeRow({ id: 'KB-TEST0001', path: 'entries/KB-TEST0001.md', subject: '', ...o });

// ─── tokenizing ───────────────────────────────────────────────────────────────────────────────

test('a path in the question contributes its segments as words', () => {
  // This is what makes PLAN §3.2's worked example score 4 rather than 2.
  assert.deepEqual(tokenize('what does the Active column on /company/members reflect'),
    ['active', 'column', 'company', 'members', 'reflect']);
});

test('stop words are dropped and single characters never count', () => {
  assert.deepEqual(tokenize('why is it a b c cart'), ['cart']);
});

// ─── the structured-coordinate rule ───────────────────────────────────────────────────────────

test('a coordinate needs two path segments — a namespace is not a place', () => {
  assert.equal(isStructuredCoordinate('/company/members'), true);
  assert.equal(isStructuredCoordinate('/api/carts'), true);
  // MEASURED: /api is a prefix of 675 of 700 route coordinates, so it fired on every REST call any
  // agent ever made.
  assert.equal(isStructuredCoordinate('/api'), false);
  assert.equal(isStructuredCoordinate('/cart'), false);
});

test('a bare type name is not a coordinate; a dotted one is', () => {
  // MEASURED: `organization` is a real GraphQL type and fired on 19 of one run's 319 calls, all false.
  assert.equal(isStructuredCoordinate('organization'), false);
  assert.equal(isStructuredCoordinate('Query.organizationContacts'), true);
  assert.equal(isStructuredCoordinate('Query.'), false);
});

test('a verb-prefixed route is judged on its path', () => {
  assert.equal(isStructuredCoordinate('post /api/carts'), true);
  assert.equal(isStructuredCoordinate('post /api'), false);
});

test('a UI label is structured by a space but is still not a lookup key', () => {
  assert.equal(isStructuredCoordinate('Add to cart'), false);
});

// ─── the anchor bonus ─────────────────────────────────────────────────────────────────────────

test('the anchor bonus fires only on a structured coordinate the question names', () => {
  assert.equal(anchorHit('why does /company/members show active', '/company/members'), true);
  assert.equal(anchorHit('what does the api return', '/api'), false, '/api must never fire');
  assert.equal(anchorHit('who owns the organization', 'organization'), false);
});

test('a verb-prefixed anchor also matches on its path alone', () => {
  // A question says "why does /api/carts return …", not "why does POST /api/carts return …".
  //
  // THE KEY IS FED THROUGH `normalizeAnchor`, not hand-written. The earlier version of this test
  // passed the literal `'post /api/carts'` -- lowercase, a shape normalizeAnchor cannot emit,
  // because it UPPERCASES the verb. So the test passed against its own fiction while every real
  // verb-prefixed anchor in the base (73 of 221) could not fire at all. Building the key the way
  // the index builds it is the whole guard; asserting the literal is what hid the defect.
  assert.equal(anchorHit('why does /api/carts return a stale total', normalizeAnchor('POST /api/carts')), true);
  assert.equal(anchorHit('what does the active column on /company/members reflect', normalizeAnchor('GET /company/members')), true);
  // And the full form still matches, whatever case the question happens to use.
  assert.equal(anchorHit('why does post /api/carts return a stale total', normalizeAnchor('POST /api/carts')), true);
});

test('one anchor hit outranks any plausible token-only score', () => {
  const anchored = row({ id: 'KB-AAAA0001', subject: 'unrelated wording entirely', anchors: ['/company/members'] });
  const wordy = row({ id: 'KB-BBBB0002', subject: 'active column company members reflect status account state locked' });
  const [first, second] = scoreRows('what does the Active column on /company/members reflect', [anchored, wordy]);
  assert.equal(first.row.id, 'KB-AAAA0001');
  assert.ok(first.score >= ANCHOR_BONUS);
  assert.ok(first.score > second.score, 'a near-certain match must beat a coincidental one');
});

test('a row with no overlap at all is not returned', () => {
  const hits = scoreRows('kubernetes ingress annotations', [row({ subject: 'cart totals lag a quantity change' })]);
  assert.deepEqual(hits, []);
});

test('ranking is deterministic — ties break on trust, then id', () => {
  const rows = [
    row({ id: 'KB-CCCC0003', subject: 'cart totals', trust: 1 }),
    row({ id: 'KB-AAAA0001', subject: 'cart totals', trust: 1 }),
    row({ id: 'KB-BBBB0002', subject: 'cart totals', trust: 5 }),
  ];
  assert.deepEqual(rank('cart totals', rows).map((h) => h.row.id), ['KB-BBBB0002', 'KB-AAAA0001', 'KB-CCCC0003']);
});

test('rank returns at most the top 3 (PLAN §3.1 step 3)', () => {
  const rows = Array.from({ length: 9 }, (_, i) => row({ id: `KB-0000000${i}`, subject: 'cart totals lag', trust: i }));
  assert.equal(rank('cart totals lag', rows).length, 3);
});

// ─── the coordinate index, built from index rows rather than a directory walk ─────────────────

test('coordinateIndex maps normalised coordinates to rows, and skips retired ones', () => {
  const rows = [
    row({ id: 'KB-AAAA0001', anchors: ['{BACK_URL}/api/carts'] }),
    row({ id: 'KB-BBBB0002', anchors: ['https://host/api/carts?x=1'] }),
    row({ id: 'KB-CCCC0003', anchors: ['/api/carts'], status: 'retired' }),
  ];
  const index = coordinateIndex(rows);
  // Four ways of writing one endpoint normalise to one coordinate.
  assert.deepEqual(index.get('/api/carts').map((r) => r.id), ['KB-AAAA0001', 'KB-BBBB0002']);
});

test('neighbours reports what else is anchored here, excluding the writer’s own entry', () => {
  const rows = [row({ id: 'KB-AAAA0001', subject: 'one', anchors: ['/company/members'] }),
    row({ id: 'KB-BBBB0002', subject: 'two', anchors: ['/company/members'] })];
  assert.deepEqual(neighbours(rows, ['/company/members'], { exclude: 'KB-AAAA0001' }).map((n) => n.id), ['KB-BBBB0002']);
});

// ─── what the writer is told while the page is still open ─────────────────────────────────────

test('anchorProblems catches the MSYS-rewritten local path', () => {
  // Under Git Bash a leading "/" becomes a Windows path before the tool starts. One run wrote an
  // entry that way and the CORRECTION was mangled identically, by someone who knew the cause.
  const [p] = anchorProblems(['C:/Program Files/Git/checkout/shipping']);
  assert.equal(p.kind, 'local-path');
  assert.match(p.why, /MSYS_NO_PATHCONV=1/);
});

test('anchorProblems catches a menu path and a namespace', () => {
  assert.equal(anchorProblems(['Admin SPA: Contacts > Member detail'])[0].kind, 'menu-path');
  assert.equal(anchorProblems(['/api'])[0].kind, 'unstructured');
  assert.deepEqual(anchorProblems(['/company/members', 'Query.organizationContacts']), []);
});
