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
 */
export function anchorHit(questionLower, anchorKey) {
  if (!isStructuredCoordinate(anchorKey)) return false;
  if (questionLower.includes(anchorKey)) return true;
  const path = /^[a-z]+ (\/.+)$/.exec(anchorKey)?.[1];
  return Boolean(path && isStructuredCoordinate(path) && questionLower.includes(path));
}

/**
 * Score every row against one question.
 *
 * @returns {Array<{row: object, score: number, overlap: string[], anchors: string[]}>} sorted best first
 */
export function scoreRows(question, rows) {
  const qTokens = tokenize(question);
  const qSet = new Set(qTokens);
  const qLower = String(question ?? '').toLowerCase();

  const scored = rows.map((row) => {
    const haystack = new Set(tokenize(`${row.subject} ${row.question}`));
    const overlap = [...qSet].filter((t) => haystack.has(t));
    const anchors = (row.anchorKeys ?? []).filter((key) => anchorHit(qLower, key));
    return { row, score: overlap.length + anchors.length * ANCHOR_BONUS, overlap, anchors };
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

export function rank(question, rows, { top = TOP_N } = {}) {
  return scoreRows(question, rows).slice(0, top);
}
