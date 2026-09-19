// Ranking (PLAN §3.2) and the coordinate rules it rests on (PLAN §12 rule 3).
//
// The anchor bonus is the strong signal, and it is only safe because a coordinate must be
// STRUCTURED to be eligible. Both halves are tested here, and the false positives named in the
// rule -- `organization`, `/api` -- are tested as the negatives they were measured to be.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  ANCHOR_BONUS, MIN_COVERAGE, admissible, anchorHit, rank, relatedEnough, relatedTo, scoreRows, tokenize,
} from '../kb/core/rank.mjs';
import { anchorProblems, coordinateIndex, isStructuredCoordinate, neighbours } from '../kb/core/coordinates.mjs';
import { normalizeRow } from '../kb/core/index-load.mjs';
import { normalizeAnchor } from '../kb/core/anchors.mjs';
import { join } from 'node:path';

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
  assert.deepEqual(rank('cart totals', rows).hits.map((h) => h.row.id), ['KB-BBBB0002', 'KB-AAAA0001', 'KB-CCCC0003']);
});

test('rank returns at most the top 3 (PLAN §3.1 step 3)', () => {
  const rows = Array.from({ length: 9 }, (_, i) => row({ id: `KB-0000000${i}`, subject: 'cart totals lag', trust: i }));
  assert.equal(rank('cart totals lag', rows).hits.length, 3);
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

// ─── the RELATED hint (PLAN §17.4(6), re-keyed on words) ──────────────────────────────────────
//
// These are the measurements, not the constants. `MIN_RELATED_WORDS = 3` is a declaration one file
// away and a test of it could only fail when somebody changed it on purpose; what is worth pinning
// is the behaviour it was derived FROM — which field the hint is keyed on, and that its floor is
// its own rather than §11's.

// The pair that killed the first design, verbatim. KB-F78ED1CC's body says in terms that it
// CONTRADICTS KB-0C163966, and their normalised anchor sets do not intersect at all — so the
// anchor trigger originally specified could not reach it, and word scoring must.
const CAPTURE = {
  subject: "On vcst-qa a configurable product's PDP has a real Add to cart button, "
    + 'while simple and variation PDPs add via the quantity stepper.',
  question: 'what is the add-to-cart control on a storefront product page, and does it differ by product type',
};
const CONTRADICTED = row({
  id: 'KB-0C163966',
  subject: 'the storefront product page of a configurable product',
  question: 'what changes on the storefront product page once a product has a configuration',
  anchors: ['/product/{id}', 'Query.productConfiguration'],
});
// Three entries from the same base that scored on the same capture and are about other mechanisms
// — the ones an overlap floor of 3 was derived to kill.
const NOISE = [
  row({ id: 'KB-35A09C64', subject: 'promotion re-evaluation on cart read', question: 'after changing a promotion in the admin, do I have to touch the cart before the storefront shows the new discount?' }),
  row({ id: 'KB-0B6067F8', subject: 'UserType.lockedState is the storefront-reachable sign-in state', question: 'which field tells the storefront a sign-in is blocked' }),
  row({ id: 'KB-0C102D97', subject: 'cancelling an order cascades to the payment and never to the shipment', question: 'what does cancelling an order leave behind' }),
];

test('the hint is keyed on subject AND question — neither half reaches the contradicted entry alone', () => {
  const rows = [CONTRADICTED, ...NOISE];
  // MEASURED against the live 91-entry base: scoring the SUBJECT alone puts KB-0C163966 at rank 4
  // of 28, which the cap of 3 discards; scoring both together puts it first of 46, one clear point
  // above the field rather than tied with it.
  assert.equal(relatedTo(CAPTURE.subject, rows).hits.length, 0,
    'the subject alone does not even clear the floor against this entry');
  const both = relatedTo(`${CAPTURE.subject} ${CAPTURE.question}`, rows);
  assert.equal(both.hits[0].row.id, 'KB-0C163966');
  assert.deepEqual(both.hits.map((h) => h.row.id), ['KB-0C163966'], 'and the other three are noise');
});

test('the related floor is its own — §11’s answer floor would reject this pair outright', () => {
  const [hit] = relatedTo(`${CAPTURE.subject} ${CAPTURE.question}`, [CONTRADICTED]).hits;
  // The whole reason a second threshold exists: a related hint is a different question with a
  // different cost of error, and this hit is nowhere near the answer floor.
  assert.ok(hit.coverage < MIN_COVERAGE, `coverage ${hit.coverage} is below the ANSWER floor ${MIN_COVERAGE}`);
  assert.equal(admissible(hit), false, 'it would never be returned as an answer');
  assert.equal(relatedEnough(hit), true, 'and it is exactly what a writer needs to see');
});

test('two shared words is where the noise sits, so three is the floor', () => {
  // Not a test of the constant: a test that the cut lands between the labelled sets. Every entry
  // in the measured BAD set shared one or two words with its capture; every GOOD one but a single
  // boundary case shared three or more.
  const two = row({ id: 'KB-TWO00001', subject: 'storefront product listing', question: 'what a listing shows' });
  const three = row({ id: 'KB-THREE001', subject: 'storefront product page control', question: 'what control a product page shows' });
  const ids = relatedTo('storefront product page control differs by product type', [two, three]).hits.map((h) => h.row.id);
  assert.deepEqual(ids, ['KB-THREE001']);
});

test('an anchor the text names passes unconditionally, as it does for an answer', () => {
  const anchored = row({ id: 'KB-ANCH0001', subject: 'unrelated wording entirely', anchors: ['/company/members'] });
  const { hits } = relatedTo('a fact about /company/members', [anchored]);
  assert.deepEqual(hits.map((h) => h.row.id), ['KB-ANCH0001']);
});

test('at most three are surfaced, and the rest are counted rather than dropped silently', () => {
  // A capped list cannot distinguish "three related" from "three shown, ten hidden", and those ask
  // different things of whoever is deciding whether to go and read them.
  const rows = Array.from({ length: 7 }, (_, i) => row({
    id: `KB-MANY000${i}`, subject: 'storefront product page control', trust: i,
  }));
  const { hits, more } = relatedTo('storefront product page control', rows);
  assert.equal(hits.length, 3);
  assert.equal(more, 4);
});

test('entries already reported by their anchor are not reported a second time', () => {
  const rows = [row({ id: 'KB-DUPE0001', subject: 'storefront product page control' }),
    row({ id: 'KB-KEEP0001', subject: 'storefront product page control' })];
  const { hits, more } = relatedTo('storefront product page control', rows, { exclude: ['KB-DUPE0001'] });
  assert.deepEqual(hits.map((h) => h.row.id), ['KB-KEEP0001']);
  assert.equal(more, 0, 'an excluded entry is not counted as hidden either — it was shown, elsewhere');
});

test('a retired entry is never surfaced as related', async () => {
  // `capture` passes `retrievable(rows)`, not `rows`. A retired entry is one the base decided to
  // stop answering from; telling a writer they may be contradicting it would resurrect it through
  // the one door that has no way to say "this was withdrawn".
  const { loadIndex, retrievable } = await import('../kb/core/index-load.mjs');
  const { localReader } = await import('../kb/core/reader.mjs');
  const cat = await loadIndex(localReader(join(import.meta.dirname, 'fixtures', 'kb-base')));
  const retired = cat.rows.filter((r) => r.status !== 'active');
  assert.ok(retired.length, 'the fixture has one, and this test is worthless without it');
  const text = `${retired[0].subject} ${retired[0].question}`;
  assert.ok(relatedTo(text, cat.rows).hits.some((h) => h.row.id === retired[0].id),
    'it scores highly against its own words — so the filter is what keeps it out, not the floor');
  assert.equal(relatedTo(text, retrievable(cat.rows)).hits.some((h) => h.row.id === retired[0].id), false);
});
