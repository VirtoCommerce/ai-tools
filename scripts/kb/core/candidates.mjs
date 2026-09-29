// Stage 1 of the two-stage design (STEP 6b, VCST-6087): CANDIDATES, not answers.
//
// Stage 1's only job is to put the right entry somewhere in a short list; deciding whether any
// entry in that list answers the question is Stage 2's job (a judgement, not a threshold -- see
// the STEP 6 note above `MIN_COVERAGE` in core/rank.mjs). So there is NO FLOOR here: anything that
// matched is a candidate, and the measure of this function is recall@K, never precision.
//
// `ask` retrieves with THIS (PLAN STEP 6, VCST-6087 Phase 2); `rank.mjs`'s `scoreRows` stays for the
// capture-side hints, which were measured under it. Written from the textbook, not fitted to the
// labelled set: `K1` and `B` are the standard BM25 defaults and are NOT tuned -- 19 labelled rows are
// a set one can overfit in an afternoon. The measurement it was accepted on is
// `bench-two-stage.mjs` (PR #337).
//
// CANDIDATES_K and how many of them `ask` opens are DECIDED BY THAT MEASUREMENT, not by taste. On
// vc-knowledge @818d478, a Haiku judge shown 10 headlines plus the first TOP_N (3) bodies picked
// 10/11 targets and declined 8/8 controls, at about 1.4k tokens per ask. Headlines alone reached only
// 8/11; all 10 bodies also reached 10/11, but at about 3.4k tokens. K=20 with the same 3 bodies fell
// to 8/11: more headlines crowd the judgement.

import { namespaceRoots } from './coordinates.mjs';
import { anchorHit, anchorWeight, tokenize } from './rank.mjs';

/** BM25 term-frequency saturation (textbook default). */
export const K1 = 1.2;
/** BM25 length normalisation (textbook default). */
export const B = 0.75;
/** Reciprocal-rank-fusion damping (the value from Cormack et al., 2009). */
export const RRF_K = 60;
/** How many candidates `ask` returns (see the measurement above). */
export const CANDIDATES_K = 10;

/**
 * Plural folding -- the ONLY normalisation on top of `tokenize`, and exactly this:
 *
 *   `…ies` -> `…y`  when at least two letters precede it   (entries -> entry, policies -> policy)
 *   `…s`   -> `…`   when at least three letters precede it and the letter before the `s` is not
 *                   `s`, `u` or `i`                         (coupons -> coupon, items -> item;
 *                                                             address, status, analysis untouched)
 *
 * Deliberately NOT folded: `-es` plurals (`boxes` stays `boxes`), irregulars, and any other
 * inflection. It is a fold, not a stemmer, and it is applied identically to question and entry, so a
 * wrong fold (`canvas` -> `canva`) costs nothing -- both sides get the same wrong word.
 */
export function foldPlural(token) {
  if (/^[a-z0-9]{2,}ies$/.test(token)) return `${token.slice(0, -3)}y`;
  if (/^[a-z0-9]{2,}[^siu]s$/.test(token)) return token.slice(0, -1);
  return token;
}

export const terms = (text) => tokenize(text).map(foldPlural);

/**
 * BM25 inverse document frequency, the non-negative (Lucene) form: ln(1 + (N - df + 0.5)/(df + 0.5)).
 * The classic form goes negative for a term in more than half the corpus, which would let a common
 * word SUBTRACT from a candidate; recall is the measure here, so a match may only ever add.
 */
export const idf = (n, df) => Math.log(1 + (n - df + 0.5) / (df + 0.5));

/**
 * The corpus-side statistics, computed once per base. Exposed so a caller scoring many questions
 * against one base does not rebuild them per question.
 */
export function corpus(rows) {
  const docs = rows.map((row) => {
    const tf = new Map();
    const toks = terms(`${row.subject} ${row.question}`);
    for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { row, tf, len: toks.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const carriers = new Map();
  for (const row of rows) for (const key of new Set(row.anchorKeys ?? [])) carriers.set(key, (carriers.get(key) ?? 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  return { docs, df, carriers, avgLen, n: docs.length, namespaces: namespaceRoots(rows) };
}

/** BM25 of one document against the question's distinct terms. */
export function bm25(qTerms, doc, stats) {
  let score = 0;
  for (const t of qTerms) {
    const f = doc.tf.get(t);
    if (!f) continue;
    const norm = f + K1 * (1 - B + B * (doc.len / (stats.avgLen || 1)));
    score += idf(stats.n, stats.df.get(t)) * ((f * (K1 + 1)) / norm);
  }
  return score;
}

const byScore = (a, b) => b.score - a.score
  || (b.row.trust ?? 0) - (a.row.trust ?? 0)
  || a.row.id.localeCompare(b.row.id);

/**
 * The candidate list for one question.
 *
 * THE COORDINATE CHANNEL is `rank.mjs`'s own `anchorHit` / `anchorWeight`, imported, never copied:
 * a matched anchor contributes ANCHOR_BONUS / carriers, a page anchor 0. How it meets BM25 is the
 * `fuse` option, and both are kept because they fail differently:
 *
 *   'add'  score = bm25 + anchor. The anchor weight was calibrated against a score in which one
 *          shared word = 1; one BM25 term is worth roughly idf (~1-5 here), so the same number now
 *          counts for less. Kept because it is the direct port of floor-1b's arithmetic.
 *   'rrf'  score = 1/(RRF_K + rank in the BM25 list) + 1/(RRF_K + rank in the anchor list). Fuses by
 *          POSITION, so neither channel's scale can drown the other -- the reason RRF exists. An
 *          entry absent from a list contributes nothing from it.
 *
 * A candidate is any entry sharing at least one term OR matching at least one anchor (a page anchor
 * weighs 0 but still makes the entry a candidate, as it still admits under `admissible`). Ties break
 * on trust, then id, so the list is deterministic.
 *
 * `overlap` is the question's (folded) terms this entry shares -- WHY it is a candidate, shown to the
 * agent and logged as `matchedBy`, never used for the order.
 *
 * @returns {Array<{row, score, bm25, anchor, anchors, overlap}>} the top `k`, best first
 */
export function candidates(question, rows, { k = CANDIDATES_K, fuse = 'add', stats = corpus(rows) } = {}) {
  const qTerms = [...new Set(terms(question))];
  const qLower = String(question ?? '').toLowerCase();
  const scored = [];
  for (const doc of stats.docs) {
    const lexical = bm25(qTerms, doc, stats);
    const anchors = (doc.row.anchorKeys ?? []).filter((key) => anchorHit(qLower, key, { namespaces: stats.namespaces }));
    if (lexical === 0 && anchors.length === 0) continue;
    const anchor = anchors.reduce((s, key) => s + anchorWeight(key, stats.carriers.get(key)), 0);
    const overlap = qTerms.filter((t) => doc.tf.has(t));
    scored.push({ row: doc.row, bm25: lexical, anchor, anchors, overlap, score: lexical + anchor });
  }
  if (fuse === 'rrf') {
    const rankIn = (field) => {
      const list = scored.filter((h) => h[field] > 0).sort((a, b) => byScore({ ...a, score: a[field] }, { ...b, score: b[field] }));
      return new Map(list.map((h, i) => [h.row.id, i + 1]));
    };
    const lex = rankIn('bm25');
    const anc = rankIn('anchor');
    for (const h of scored) {
      h.score = (lex.has(h.row.id) ? 1 / (RRF_K + lex.get(h.row.id)) : 0)
        + (anc.has(h.row.id) ? 1 / (RRF_K + anc.get(h.row.id)) : 0);
    }
  } else if (fuse !== 'add') {
    throw new Error(`unknown fuse: ${fuse}`);
  }
  return scored.sort(byScore).slice(0, k);
}
