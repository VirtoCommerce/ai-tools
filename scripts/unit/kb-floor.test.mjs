// THE SCORE FLOOR — what "the base holds nothing on this" means, and the measurement behind it.
//
// Until 2026-09-19 `ask` had no floor: `score > 0`, so one shared common word was an answer. The
// first 12 log files measured the consequence -- 39 asks, 39 answers, ZERO misses (PLAN §14.1) --
// which reads as perfect coverage and is the opposite: exit 1 was unreachable, so the base could
// never say "nobody wrote this down, go find out", and panel 1, the work queue the whole report
// exists for, was empty by construction.
//
// WHAT THIS FILE IS FOR. The floor's two constants were DERIVED by replaying all 39 logged
// questions against the live 91-entry index and cutting against the labelled set PLAN §8 panel 6
// had already established. A derivation that lives only in a commit message is a derivation that
// gets re-opened by whoever next thinks a round number looks tidier. So the labelled rows are here,
// with their real subjects, questions and anchors as `index.json` carries them, and the verdicts
// are asserted. This tests the DERIVATION -- what the floor decides -- not the declaration of two
// constants one file away.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MIN_COVERAGE, MIN_WORDS, scoreRows } from '../kb/core/rank.mjs';
import { normalizeRow } from '../kb/core/index-load.mjs';

const row = (o) => normalizeRow({ path: `entries/${o.id}.md`, ...o });

// ── The labelled set, verbatim from the live base ─────────────────────────────────────────────
//
// GOOD: the two entries the Active-column asks are supposed to return. KB-27B4CD10 carries four
// independent confirmations and is the single most attested fact in the corpus.
const KB_27B4CD10 = row({
  id: 'KB-27B4CD10',
  subject: 'storefront members Active column reads contact status not account state',
  question: 'Why does the storefront company members list show a member as Active when their platform account is locked or never registered?',
  anchors: ['GET /company/members', 'Organization.contacts', 'ContactType.status'],
  trust: 4,
});
const KB_4B889114 = row({
  id: 'KB-4B889114',
  subject: 'company members Active column vs account locked state',
  question: 'The storefront lists an organization member as Active but the member cannot sign in - can I trust that column?',
  anchors: ['/company/members', 'Mutations.lockOrganizationContact', 'Mutations.unlockOrganizationContact'],
  trust: 4,
});

// BAD: what the two price-sorting asks returned. The agent read all of it, learned nothing, went
// and probed the deployment, and captured KB-D9B90536 on `Query.products` -- anchor overlap with
// everything returned: zero. KB-FA724D31 is the emblem of the defect: "storefront Delete member
// detaches the contact", returned for a question about price sorting.
const KB_6D5E2CD1 = row({
  id: 'KB-6D5E2CD1',
  subject: 'what makes a price list apply to a store, and what the storefront reads it through',
  question: "Which price list's price does a B2B storefront shopper actually get, and what decides it?",
  anchors: ['GET /api/pricing/assignments', 'PricelistAssignment.storeId'],
});
const KB_1834ABE5 = row({
  id: 'KB-1834ABE5',
  subject: 'no Admin surface shows the price a given shopper would actually be charged',
  question: "The shopper and I disagree about a product's price -- where in Admin do I see what THEY see?",
  anchors: ['GET /api/products/{productId}/{catalogId}/pricesWidget'],
});
const KB_FA724D31 = row({
  id: 'KB-FA724D31',
  subject: 'storefront Delete member detaches the contact and orphans the account',
  question: 'What does deleting a member from the storefront company members list actually delete?',
  anchors: ['Mutations.removeMemberFromOrganization'],
});

const CORPUS = [KB_27B4CD10, KB_4B889114, KB_6D5E2CD1, KB_1834ABE5, KB_FA724D31];

// The four questions the labelled set was drawn from, verbatim from the log.
const Q_ACTIVE_PLAIN = 'what does the storefront members Active column reflect?';
const Q_ACTIVE_ROUTE = 'What does the Active column on the storefront /company/members page reflect — the user account status or the organization membership/contact status?';
const Q_PRICE_SHORT = 'Does product price sorting use the indexed price field rather than the displayed price?';
const Q_PRICE_LONG = 'When sorting a product list by price ascending, does the storefront order by the indexed price or by the price actually displayed to the shopper?';

const hit = (q, id) => scoreRows(q, CORPUS).find((h) => h.row.id === id);
const admitted = (q) => scoreRows(q, CORPUS).filter((h) => h.admissible).map((h) => h.row.id);

// ── The finding that decided the SHAPE ────────────────────────────────────────────────────────

test('no threshold on score can separate the labelled set — they are inverted on magnitude', () => {
  // THIS IS THE MEASUREMENT THAT RULES OUT AN ABSOLUTE FLOOR, and it is asserted rather than
  // narrated because "just use score >= N" is the obvious next idea anybody will have.
  const worstGood = hit(Q_ACTIVE_PLAIN, 'KB-27B4CD10');
  const worstBad = hit(Q_PRICE_LONG, 'KB-6D5E2CD1');

  assert.equal(worstGood.score, 4, 'the four-times-confirmed answer scores 4 on its own question');
  assert.equal(worstBad.score, 5, 'and the worst useless hit scores 5');
  assert.ok(worstBad.score > worstGood.score,
    'A floor high enough to kill the bad hit would kill a four-times-confirmed good one. '
    + 'Magnitude is the wrong axis; do not replace this with `score >= N`.');
});

test('coverage separates them cleanly — 0.45 against 0.80', () => {
  // What distinguishes the two is not HOW MANY words matched but what fraction of the question
  // they account for. The gap is wide and the cut sits inside it.
  assert.equal(hit(Q_PRICE_LONG, 'KB-6D5E2CD1').coverage.toFixed(2), '0.45');
  assert.equal(hit(Q_ACTIVE_PLAIN, 'KB-27B4CD10').coverage.toFixed(2), '0.80');
  assert.ok(MIN_COVERAGE > 0.45 && MIN_COVERAGE <= 0.80,
    'the cut must sit inside the measured band, or it is a number somebody liked the look of');
});

// ── The verdicts ──────────────────────────────────────────────────────────────────────────────

test('every known-BAD hit is refused — both price-sorting asks become misses', () => {
  assert.deepEqual(admitted(Q_PRICE_SHORT), [], 'the short price-sorting ask returns nothing');
  assert.deepEqual(admitted(Q_PRICE_LONG), [], 'nor does the long one');
  // Including the one that made the defect legible: a members-deletion entry answering a question
  // about price sorting.
  assert.equal(hit(Q_PRICE_LONG, 'KB-FA724D31').admissible, false);
});

test('every known-GOOD hit survives — with a coordinate in the question and without one', () => {
  assert.deepEqual(admitted(Q_ACTIVE_PLAIN).sort(), ['KB-27B4CD10', 'KB-4B889114']);
  const withRoute = admitted(Q_ACTIVE_ROUTE);
  assert.ok(withRoute.includes('KB-27B4CD10') && withRoute.includes('KB-4B889114'));
});

test('the most-confirmed entry in the base is found by its own coordinate', () => {
  // Its anchor is `GET /company/members` -- verb-prefixed, which until this session could not fire
  // at all, so the entry ranked fourth on the question it was written to answer.
  const h = hit(Q_ACTIVE_ROUTE, 'KB-27B4CD10');
  assert.deepEqual(h.anchors, ['GET /company/members'], 'the key keeps normalizeAnchor’s uppercase verb — the MATCH is what is case-folded');
  assert.equal(h.row.id, scoreRows(Q_ACTIVE_ROUTE, CORPUS)[0].row.id, 'and it now ranks first');
});

// ── The two properties the floor has to keep at every question length ─────────────────────────

test('one shared common word is no longer an answer — at any question length', () => {
  // PLAN §14.1's complaint, stated as a test. A single overlapping word cannot clear MIN_WORDS...
  const r = row({ id: 'KB-AAAA0001', subject: 'the cart survives checkout emptied' });
  assert.deepEqual(scoreRows('what does the order status reflect after checkout', [r]).filter((h) => h.admissible), []);
  // ...and a ONE-WORD question cannot get round it by trivially reaching coverage 1.00, which is
  // how a coverage-only floor would reintroduce exactly the defect it was built to remove.
  const only = scoreRows('checkout', [r]);
  assert.equal(only[0].coverage, 1);
  assert.equal(only[0].admissible, false, `coverage 1.00 on ${MIN_WORDS - 1} word is still a coincidence`);
});

test('an anchor passes unconditionally — it is a different kind of evidence, not more of the same', () => {
  // A structured coordinate cannot appear in a sentence by accident (PLAN §3.2), so a question that
  // names one is about that entry however few of its words happen to match. Measured: every
  // anchored hit in the labelled set is good and no bad hit carries one.
  const r = row({ id: 'KB-AAAA0001', subject: 'wording that shares nothing at all', anchors: ['/company/members'] });
  const [h] = scoreRows('is the roster on /company/members paginated', [r]);
  assert.equal(h.overlap.length, 0);
  assert.ok(h.coverage < MIN_COVERAGE);
  assert.equal(h.admissible, true);
});

test('the rejected candidates are still returned to the caller, so a miss can name its near-miss', () => {
  // `scoreRows` returns everything above zero and marks it; only `rank` cuts. Without that the
  // near-miss -- the one thing that says whether the floor is set too high -- could not be logged.
  const all = scoreRows(Q_PRICE_LONG, CORPUS);
  assert.ok(all.length >= 3, 'the candidates exist');
  assert.equal(all.filter((h) => h.admissible).length, 0, 'and none of them clears the floor');
});
