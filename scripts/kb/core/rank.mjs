// Ranking (PLAN §3.2). Arithmetic, not AI.
//
// The problem: N entries, one question, and returning all of them is noise. Ranking picks the two
// or three worth opening.
//
//   1. split and de-stop the question
//   2. count token overlaps against `subject` + `question`
//   3. add the ANCHOR BONUS -- the strong signal
//   4. sort, take the top 3, fetch those bodies
//
// DELIBERATELY THIS DUMB. We do not yet know how agents phrase questions; the log will say.
// Building BM25 now is optimising against imaginary queries, and PLAN §11 names the log evidence
// that would justify it: `ask` returning a match the agent then does not open, or re-asking inside
// one session, above ~15%. Not a hunch -- a measurement, when there is one.
//
// A dumb ranker sometimes misses an entry that is there, and a miss is exit 1, which tells the
// agent to go find out and write it down -- i.e. a ranking miss turns straight into a duplicate.
// That is not handled here. It is handled by the identity check in `identity.mjs`, which converts
// the duplicate into a confirmation. The two files are one design: this one is allowed to be dumb
// precisely because that one exists.

import { isStructuredCoordinate } from './coordinates.mjs';

/**
 * Words that carry no retrieval signal. Kept short on purpose: every word removed here is a word
 * that can never contribute, and a long list starts deleting real terms ("state", "order",
 * "show" are all domain nouns in this product).
 */
const STOP = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'do', 'does', 'did', 'doing', 'done', 'have', 'has', 'had',
  'i', 'we', 'you', 'it', 'its', 'this', 'that', 'these', 'those', 'their', 'there',
  'of', 'in', 'on', 'at', 'to', 'for', 'from', 'by', 'with', 'as', 'into', 'about',
  'and', 'or', 'but', 'not', 'no', 'if', 'then', 'than', 'so',
  'what', 'why', 'how', 'when', 'where', 'which', 'who', 'whom',
  'can', 'could', 'should', 'would', 'will', 'shall', 'may', 'might', 'must',
]);

/**
 * Split on anything that is not a letter or a digit -- so `/company/members` contributes `company`
 * and `members`, which is what makes the worked example in PLAN §3.2 score 4 rather than 2.
 */
export function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOP.has(t));
}

/**
 * The anchor bonus, and why it is this large.
 *
 * Anchors are structured strings -- `/company/members`, `POST /api/carts`,
 * `Mutations.lockOrganizationContact` -- that CANNOT appear in a sentence by accident. A match is
 * therefore near-certain relevance rather than a guess, which is a different KIND of evidence from
 * "four words happened to overlap", not more of the same kind. The weight says so: one anchor hit
 * outranks any plausible token-only score, because a question that literally names an entry's
 * coordinate is about that entry.
 */
export const ANCHOR_BONUS = 10;

/**
 * Does the question name this anchor?
 *
 * Only STRUCTURED coordinates are eligible (see coordinates.mjs). That guard is the reason the
 * bonus is safe to make this strong: without it, `organization` -- a real GraphQL type -- fired on
 * 19 of one run's 319 calls, all false, and `/api` matched every REST call any agent ever made.
 *
 * A verb-prefixed anchor also matches on its path alone, because a question says "why does
 * /api/carts return …" and not "why does POST /api/carts return …".
 *
 * THE COMPARISON IS CASE-FOLDED ON BOTH SIDES, and that is not tidiness -- it was a dead signal.
 * `normalizeAnchor` lowercases the path and UPPERCASES the verb, so the index stores
 * `GET /company/members`; the question arrives lowercased; and the fallback below used to read
 * `/^[a-z]+ (\/.+)$/` against that uppercase verb. So BOTH branches failed and a verb-prefixed
 * anchor could not fire at all -- 73 of this base's 221 anchors (33%), including `KB-27B4CD10`'s
 * `GET /company/members`, the most-confirmed entry in the corpus, invisible to its own coordinate
 * and ranking fourth on the question it was written to answer. The comment above described the
 * intended behaviour the whole time.
 *
 * It survived because the test asserted it against `'post /api/carts'` -- LOWERCASE, a string
 * `normalizeAnchor` cannot emit. A test that feeds a function a shape the system never produces
 * verifies the test's own fiction, which is worse than no test: it reports the signal as covered.
 */
export function anchorHit(questionLower, anchorKey) {
  if (!isStructuredCoordinate(anchorKey)) return false;
  const key = String(anchorKey).toLowerCase();
  if (questionLower.includes(key)) return true;
  const path = /^[a-z]+ (\/.+)$/.exec(key)?.[1] ?? (key.startsWith('/') ? key : null);
  if (!path) return false;
  if (isStructuredCoordinate(path) && questionLower.includes(path)) return true;
  // A `{param}` makes the STORED anchor more specific than the question that needs it, so the
  // stem is tried too: `GET /api/members/{id}` also fires on `/api/members`.
  //
  // Measured 2026-09-19 (PLAN §17.5). 788 distinct coordinates were harvested from 113 open bug
  // reports, two sprint plans and 147 suite files and matched against this base's 141 anchors:
  // exact matching covered 3.6%, path matching 27.8% — an 8x gap that is RETRIEVAL loss, not a
  // content gap. `/api/members` is the second-most-demanded coordinate in the repo at 127
  // mentions and could not reach the entry anchored `GET /api/members/{id}`, which is about that
  // very endpoint.
  //
  // ONLY the `{param}` tail is dropped — this is not prefix matching. A general prefix would let
  // `/api` reach everything, which is the failure `isStructuredCoordinate` exists to prevent, and
  // the stem is re-checked against that guard before it is used.
  //
  // NOT done here, and deliberately: splitting a dotted anchor (`LineItemType.listPrice`) on the
  // dot to match the bare field. The field name is shared vocabulary, not a coordinate —
  // measured, `storeId` occurs in 88 of these files, `description` in 73, and the anchors whose
  // tail is a plain word (`cart`, `items`, `total`, `me`) would have fired 1,730 times. The
  // dotted form exists BECAUSE the field alone is ambiguous.
  const stem = path.replace(/\/\{[^}]*\}.*$/, '');
  return Boolean(stem !== path && isStructuredCoordinate(stem) && questionLower.includes(stem));
}

// ── THE FLOOR — what "no coverage" means, derived rather than chosen ──────────────────────────
//
// Until 2026-09-19 there was no floor: `score > 0`, so ONE SHARED COMMON WORD WAS AN ANSWER. The
// log measured the consequence -- 39 asks, 39 answers, ZERO misses (PLAN §14.1). That reads as
// perfect coverage and is the opposite: exit 1 was unreachable, so the base could never say "nobody
// wrote this down -- go find out", and panel 1, the work queue the whole report was built around,
// was empty BY CONSTRUCTION. The tool built to stop agents asserting ungrounded behaviour had
// become a thing that answers confidently about subjects it holds nothing on.
//
// HOW THESE TWO NUMBERS WERE DERIVED, because a floor that was merely picked is a hunch with a
// constant's authority. All 39 logged questions were replayed against the live 91-entry index and
// cut against the labelled set PLAN §8 panel 6 had already established:
//
//   known BAD  the two price-sorting asks -- five entries returned between them, one of them
//              "storefront Delete member detaches the contact" for a question about price sorting;
//              the agent then went and captured KB-D9B90536. Anchor overlap with what was
//              returned: zero.
//   known GOOD the Active-column asks -> KB-27B4CD10 (four independent confirmations), KB-4B889114.
//
// THE RESULT THAT DECIDED THE SHAPE: no threshold on `score` can separate them, at any value. The
// worst GOOD hit that must survive scores 4 (KB-27B4CD10 on "what does the storefront members
// Active column reflect?"); the worst BAD hit that must die scores 5 (KB-6D5E2CD1 on "When sorting
// a product list by price ascending…"). They are INVERTED on magnitude, so an absolute floor buys
// nothing -- `score >= 5` already loses a four-times-confirmed answer, and only `>= 6` kills all
// six bad hits, by which point it has lost two good ones.
//
// What separates them is not how many words matched but WHAT FRACTION OF THE QUESTION they
// account for:
//
//   the six BAD hits    coverage 0.13 · 0.25 · 0.25 · 0.27 · 0.36 · 0.45
//   the GOOD word-only  coverage 0.80 · 0.80   (the rest carry an anchor and never reach this test)
//
// A cut anywhere in (0.45, 0.80] satisfies the labelled set. Within that band the choice was made
// by reading all 14 distinct logged questions and their survivors: raising the cut to 0.67 turns
// three questions that still get a CORRECT answer into misses -- including "what happens on the
// members list when a contact is deleted", whose answer, KB-FA724D31 "storefront Delete member
// detaches the contact and orphans the account", is exactly right -- and buys one honest miss in
// return ("what does the order status reflect after checkout", where the only survivor at 0.5 is
// about the cart record, not the order status). Three correct answers lost against one unhelpful
// one removed: the bottom of the band wins.
//
// THE MARGIN IS THIN AND IS NOT HIDDEN: the nearest surviving bad hit sits at 0.45, one word in an
// eleven-token question below the cut. That is why the log now records `scores` and `nearMiss`
// (PLAN §7) -- so the next reader re-derives this from the log instead of replaying, and sees
// immediately if misses are piling up just under the line.
//
// AND WHY A COUNT FLOOR IS STILL NEEDED ALONGSIDE IT: coverage alone reintroduces the original
// defect at the short end -- a one-word question matching one word scores coverage 1.00. MIN_WORDS
// is the guard that keeps "one shared common word is an answer" dead in every question length.
export const MIN_COVERAGE = 0.5;
export const MIN_WORDS = 2;

/**
 * The ranker's identity, written onto every `ask` line (PLAN §7).
 *
 * Every line already in the base came from the no-floor ranker. Without a marker, every future
 * before/after comparison silently mixes two systems and §14.1's numbers stop being reproducible.
 * Bump it whenever a change here would move which entries are returned.
 */
export const RANKER = 'floor-1';

/**
 * Is this hit good enough to return, or is the honest answer "the base holds nothing on this"?
 *
 * AN ANCHOR PASSES UNCONDITIONALLY. It is a different KIND of evidence, not more of the same kind:
 * a structured coordinate cannot appear in a sentence by accident, so a question that literally
 * names an entry's coordinate is about that entry however few of its words happen to match. Every
 * anchored hit in the labelled set is good and no bad hit carries one, which is the measurement
 * behind leaving this branch unguarded.
 */
export function admissible(hit) {
  if (hit.anchors.length) return true;
  return hit.overlap.length >= MIN_WORDS && hit.coverage >= MIN_COVERAGE;
}

/**
 * Score every row against one question.
 *
 * Returns EVERYTHING that scored above zero, admissible or not, because the caller needs the best
 * REJECTED candidate too: `nearMiss` is what tells a later reader whether the floor is set too
 * high, and whether some entry is phrased so unlike the way people ask that it can never be found.
 *
 * @returns {Array<{row, score, overlap, anchors, coverage, admissible}>} sorted best first
 */
export function scoreRows(question, rows) {
  const qTokens = tokenize(question);
  const qSet = new Set(qTokens);
  const qLower = String(question ?? '').toLowerCase();

  const scored = rows.map((row) => {
    const haystack = new Set(tokenize(`${row.subject} ${row.question}`));
    const overlap = [...qSet].filter((t) => haystack.has(t));
    const anchors = (row.anchorKeys ?? []).filter((key) => anchorHit(qLower, key));
    // Coverage is measured against THE QUESTION's own vocabulary, not the entry's. Normalising by
    // the entry would reward a short subject for being short, which is a property of the writing
    // and not of the match.
    const coverage = qSet.size ? overlap.length / qSet.size : 0;
    const hit = { row, score: overlap.length + anchors.length * ANCHOR_BONUS, overlap, anchors, coverage };
    return { ...hit, admissible: admissible(hit) };
  }).filter((hit) => hit.score > 0);

  // Ties break on trust, then on id -- so the same question against the same base always returns
  // the same order. A ranker whose output wobbles run to run cannot be measured against the log.
  scored.sort((a, b) => b.score - a.score
    || (b.row.trust ?? 0) - (a.row.trust ?? 0)
    || a.row.id.localeCompare(b.row.id));
  return scored;
}

/** How many bodies one question is allowed to open (PLAN §3.1: the top 1-3). */
export const TOP_N = 3;

/**
 * The top hits that CLEAR THE FLOOR, plus the best one that did not.
 *
 * `nearMiss` is reported only when nothing was admitted, and that is a deliberate narrowing of
 * what PLAN §7 asks for. On an answer the best rejected candidate is rank-four noise and a field on
 * every line for it would be volume with no reader. On a MISS it is the only thing that can tell
 * you two different facts nothing else records: that the floor is too high (misses that keep
 * carrying a near-miss just below the cut), and that some entry is phrased so unlike the way people
 * ask that it is invisible forever -- never returned, never counted, never suspected.
 */
export function rank(question, rows, { top = TOP_N } = {}) {
  const scored = scoreRows(question, rows);
  const hits = scored.filter((h) => h.admissible).slice(0, top);
  return { hits, nearMiss: hits.length ? null : (scored.find((h) => !h.admissible) ?? null) };
}
