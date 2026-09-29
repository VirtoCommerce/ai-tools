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

import { isSingleSegmentPath, isStructuredCoordinate, namespaceRoots } from './coordinates.mjs';

// A one-segment path is matched on boundaries: `/cart` must not fire inside `/api/carts`,
// `/api/cart` or `/cartesian`. A deeper segment may follow (`/cart/items`).
function mentionsSingleSegment(questionLower, path) {
  let from = 0;
  for (;;) {
    const at = questionLower.indexOf(path, from);
    if (at < 0) return false;
    const before = at === 0 ? '' : questionLower[at - 1];
    const after = questionLower[at + path.length] ?? '';
    if (!/[a-z0-9_./-]/.test(before) && !/[a-z0-9_-]/.test(after)) return true;
    from = at + 1;
  }
}

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
export function anchorHit(questionLower, anchorKey, { namespaces } = {}) {
  if (!isStructuredCoordinate(anchorKey, { namespaces })) return false;
  const key = String(anchorKey).toLowerCase();
  const path = /^[a-z]+ (\/.+)$/.exec(key)?.[1] ?? (key.startsWith('/') ? key : null);
  if (path && isSingleSegmentPath(path)) return mentionsSingleSegment(questionLower, path);
  if (questionLower.includes(key)) return true;
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
  const namespaces = namespaceRoots(rows);

  const scored = rows.map((row) => {
    const haystack = new Set(tokenize(`${row.subject} ${row.question}`));
    const overlap = [...qSet].filter((t) => haystack.has(t));
    const anchors = (row.anchorKeys ?? []).filter((key) => anchorHit(qLower, key, { namespaces }));
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

// ── RELATED — the same arithmetic, a different question, its own floor ────────────────────────
//
// Everything above answers "does this entry ANSWER the question". This answers "is the writer
// about to contradict something already in the base" -- asked at `capture`, about a fact that does
// not exist yet. Three things follow from that and none of them is cosmetic.
//
// IT IS SCORED ON `subject` + `question` TOGETHER, and that was measured rather than chosen. The
// three captures a live session queued on 2026-09-19 were scored against the 91-entry base under
// each field, and the field is the whole decision -- under one of them the motivating pair is
// found at rank 1 and under another it is lost at rank 4:
//
//   capture        best related entry                      question    subject     subject+question
//   KB-F78ED1CC    KB-0C163966 (which its body CONTRADICTS) #1 of 45   #4 of 28    #1 of 46
//   KB-4AE52041    KB-191B1B4C (master product / variants)  #1 of 19   #1 of 16    #1 of 27
//   KB-50EBEEE9    KB-EF925925 (cart page / Place order)    #5 of 47   absent      #1 of 62
//
// `subject` alone loses the motivating pair outright. `question` alone finds it, but only on a
// TIE -- ranks 1-3 all score 3 at coverage 0.375 and the order between them is the trust/id
// tiebreak, i.e. arbitrary -- and on KB-50EBEEE9 its top five are a five-way tie in which the one
// relevant entry sits fifth, below "the amount a payment is for is not the payment's total". Under
// `subject+question` the right entry is ALONE at the top of all three, one clear point above the
// field. The subject carries the vocabulary that distinguishes THIS observation (cart, checkout,
// configurable, master, stepper); the question carries the vocabulary it shares with the corpus.
// Neither half is sufficient and the concatenation is not a compromise between them.
//
// A 13-entry held-out sample (every 7th id, each scored against the other 90) was also run and is
// reported because it does NOT discriminate -- 69/72/69% of the top 3 share a scope axis,
// 44/41/38% share an anchor namespace, which is a tie inside the noise of n=13. The reason it
// cannot discriminate is the reason it is worth recording: a held-out entry's `subject` is a base
// SUBJECT -- a terse label, 3 to 11 tokens, median 6 -- while the three subjects a live session
// actually wrote today are 12, 17 and 16 tokens of sentence. The held-out test can only measure
// the old house style, so the live captures are the evidence and the sample is the control.
export const MIN_RELATED_WORDS = 3;

/**
 * The relatedness floor, and why it is NOT `MIN_COVERAGE`.
 *
 * §11's floor governs ANSWERS and is derived from a labelled set on which no score cut works --
 * the worst good hit scores 4 and the worst bad hit scores 5, inverted, so only a coverage cut
 * separates them. THIS labelled set is inverted the other way, and that is the argument for a
 * second constant rather than a reuse of the first. Scoring the three live captures and labelling
 * every hit in their top 8 by whether it shares a mechanism with what is being written:
 *
 *   GOOD, must survive   overlap 4 4 4 3 3 3 · 2      coverage 0.286 0.214 0.214 0.200 0.190 0.143 · 0.100
 *   BAD, must die        overlap 2 2 2 2 2 2 1 1 1    coverage 0.143 0.143 0.143 0.095 0.095 0.095 0.050 …
 *
 * ON COVERAGE THE TWO SETS TOUCH: the worst surviving good hit and the worst bad hit are both
 * 0.143, so NO coverage cut separates them at any value. On overlap they part cleanly at 3 -- nine
 * bad hits die, six of seven good ones live. The one casualty (KB-4AE52041 x KB-0C163966, overlap
 * 2) sits inside the bad cluster and cannot be bought back without all nine.
 *
 * WHY COVERAGE IS THE WRONG INSTRUMENT HERE, independently of the numbers: coverage is the
 * fraction of the QUERY's vocabulary an entry accounts for, and the query is now a whole capture.
 * No existing entry can account for much of a NEW fact's vocabulary -- if one could it would be a
 * duplicate, which is `identity.mjs`'s business and not this one. So coverage reads mostly how
 * verbose the capturing agent was, which is a property of the writing and not of the match: the
 * same objection this file already makes to normalising by the entry. Overlap does not move when
 * a subject gets longer; it can only rise. Measured over 94 trials, the correlation between query
 * length and how many entries clear this floor is 0.31, and the median capture surfaces 2.
 *
 * MIN_COVERAGE IS UNTOUCHED AND IS NOT CONSULTED HERE. A related hint costs the reader a line; a
 * missed contradiction sits in the base for months. Those are not the same cost, so they do not
 * get the same floor -- and an anchor still passes unconditionally, for the reason `admissible`
 * already gives.
 */
export function relatedEnough(hit) {
  return hit.anchors.length > 0 || hit.overlap.length >= MIN_RELATED_WORDS;
}

/** How many related entries one capture is allowed to put in front of its writer. */
export const RELATED_TOP = 3;

/**
 * Entries the fact being captured may speak to -- shown, never enforced.
 *
 * Returns the top few AND how many more cleared the floor, because "3 related" and "3 related, 10
 * not shown" are different situations for the writer and the capped list cannot tell them apart.
 *
 * @returns {{hits: Array, more: number}}
 */
export function relatedTo(text, rows, { exclude = [], top = RELATED_TOP } = {}) {
  const skip = new Set(exclude);
  const scored = scoreRows(text, rows).filter((h) => !skip.has(h.row.id) && relatedEnough(h));
  return { hits: scored.slice(0, top), more: Math.max(0, scored.length - top) };
}

/** How many anchor neighbours one capture is allowed to print. */
export const NEIGHBOUR_TOP = 3;

/**
 * Anchor neighbours, ORDERED AND CAPPED — a readability fix, and explicitly not a retrieval one.
 *
 * `neighbours()` answers "who else stood at this coordinate" and returns them in id order, uncapped.
 * Measured over the 102-entry base: the median capture has 2 and that is fine, but 23 entries sit
 * above 10 and the worst has 25, all on one hot coordinate (`GET /api/order/customerorders/{}`).
 * At that size the list stops being information: the 2026-09-20 capture of KB-133FD544 had its
 * contradicted entry at row 10 of 25, in id order, and the writer did not see it.
 *
 * THE COST IS NOT ONLY THE 25 LINES. They print BEFORE the word-ranked hint and before the
 * read-this-session hint, so a long coordinate list buries the two lists that were built to be
 * read. Capping is what gives those lines somewhere to be seen.
 *
 * WHAT THIS DOES NOT DO, measured before it was written: it does not surface contradictions.
 * Ranking these by word score puts the contradicted entry of the motivating pair at rank 12 of 25
 * — better than 10-of-25-by-id and still nowhere anybody reads. Three reorderings were tried
 * against the three labelled contradiction pairs in the corpus and the best put the target at 12;
 * one of them also demoted the single pair the word hint gets right today. A candidate that shares
 * ONE token with the new fact cannot be reached by reordering, which is why the actual remedy is
 * `openedThisSession` in `verbs.mjs` and not anything in this file.
 *
 * Scored by the same arithmetic as everything else so the order is explicable, and ties break on id
 * so the same capture against the same base always prints the same list.
 *
 * @returns {{hits: Array, more: number}}
 */
export function rankNeighbours(rows, text, { top = NEIGHBOUR_TOP } = {}) {
  const score = new Map(scoreRows(text, rows).map((h) => [h.row.id, h.score]));
  const ordered = [...rows].sort((a, b) => (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0)
    || a.id.localeCompare(b.id));
  return { hits: ordered.slice(0, top), more: Math.max(0, ordered.length - top) };
}
