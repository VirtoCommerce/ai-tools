// Candidate generation (VCST-6122 Decision 6, step 2): three channels, fused by reciprocal rank.
//
//   words     BM25 over the entry's card questions + subject + question + its concepts' names. The
//             question is expanded with the names of the concepts it parsed to, so "promo code" also
//             searches "coupon" -- the vocabulary works in this channel as well as in its own.
//   anchors   entries whose coordinate the question names, weighted by how RARE the coordinate is:
//             `/cart` is carried by fifteen entries and says little about which one is meant; a
//             coordinate carried by one entry says nearly everything. floor-1 gave every anchor the
//             same flat bonus and let it pass unconditionally, which is how `/cart` came to answer
//             questions about pickup and about promotion lines (baselineFloor1 in the labelled set).
//   concepts  entries carrying the question's concepts; an ancestor or a descendant counts for half.
//
// Fusion is RRF (k = 60) because the three scores live on unrelated scales. Ties in a channel share a
// rank, so an id never breaks a tie a score could not.
//
// An entry WITHOUT a card -- anything captured on main after the migration -- still has a words
// document (subject + question) and its anchors, so it is still found; it simply has less to be found by.

import { namespaceRoots } from './coordinates.mjs';
import { anchorHit } from './rank.mjs';
import { parseQuestion, terms, withAncestors } from './query.mjs';

export const RRF_K = 60;
const BM25_K1 = 1.2;
const BM25_B = 0.75;

const counts = (tokens) => {
  const m = new Map();
  for (const t of tokens) m.set(t, (m.get(t) ?? 0) + 1);
  return m;
};

/** The text an entry is found by, field by field; `questions` stay separate so one can be left out. */
function fieldsOf(row, vocab) {
  const conceptNames = (row.concepts ?? []).map((id) => {
    const c = vocab?.concepts.get(id);
    return `${id.replace(/-/g, ' ')} ${c?.label ?? ''}`;
  });
  return {
    base: terms(`${row.subject} ${row.question} ${conceptNames.join(' ')}`),
    questions: (row.questions ?? []).map(terms),
  };
}

/**
 * Prepare a base for retrieval, once: the BM25 statistics, the anchor document frequencies and the
 * concept postings.
 */
export function prepareRetrieval(rows, vocab) {
  const docs = rows.map((row) => {
    const f = fieldsOf(row, vocab);
    const all = [...f.base, ...f.questions.flat()];
    return { row, fields: f, tf: counts(all), len: all.length };
  });
  const df = new Map();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / Math.max(1, docs.length);
  const anchorDf = new Map();
  for (const row of rows) for (const k of row.anchorKeys ?? []) anchorDf.set(k, (anchorDf.get(k) ?? 0) + 1);
  const conceptSets = rows.map((row) => ({
    own: new Set(row.concepts ?? []),
    near: new Set(vocab ? withAncestors(vocab, row.concepts ?? []) : row.concepts ?? []),
  }));
  const conceptDf = new Map();
  for (const s of conceptSets) for (const id of s.own) conceptDf.set(id, (conceptDf.get(id) ?? 0) + 1);
  return { rows, vocab, docs, df, avgLen, anchorDf, conceptSets, conceptDf, namespaces: namespaceRoots(rows), n: rows.length };
}

const idf = (n, df) => Math.log(1 + (n - df + 0.5) / (df + 0.5));

/**
 * BM25 of one question against every document. `leaveOut` = {index, question} removes one card
 * question from one document first -- the doc2query-- filter asks whether a card question would still
 * find its entry if the entry did not already contain that very sentence.
 */
function bm25(prep, qTerms, leaveOut) {
  let { df } = prep;
  let docs = prep.docs;
  if (leaveOut) {
    const d = prep.docs[leaveOut.index];
    const kept = [...d.fields.base, ...d.fields.questions.filter((_, i) => i !== leaveOut.question).flat()];
    const tf = counts(kept);
    df = new Map(df);
    for (const t of d.tf.keys()) if (!tf.has(t)) df.set(t, df.get(t) - 1);
    docs = [...prep.docs];
    docs[leaveOut.index] = { ...d, tf, len: kept.length };
  }
  const q = [...new Set(qTerms)];
  return docs.map((d) => {
    let s = 0;
    for (const t of q) {
      const f = d.tf.get(t);
      if (!f) continue;
      s += idf(prep.n, df.get(t) ?? 0) * (f * (BM25_K1 + 1)) / (f + BM25_K1 * (1 - BM25_B + BM25_B * d.len / prep.avgLen));
    }
    return s;
  });
}

/** Competition ranks (1, 2, 2, 4) over positive scores; 0 means "not in this channel". */
function ranksOf(scores) {
  const order = scores.map((s, i) => [s, i]).filter(([s]) => s > 0).sort((a, b) => b[0] - a[0]);
  const ranks = new Array(scores.length).fill(0);
  order.forEach(([s, i], pos) => { ranks[i] = pos > 0 && order[pos - 1][0] === s ? ranks[order[pos - 1][1]] : pos + 1; });
  return ranks;
}

/**
 * Rank every entry against one question.
 *
 * @returns {{parsed: object, candidates: Array<{row, fused:number, words:{score,rank}, anchors:{score,rank,hits:string[]}, concepts:{score,rank,own:string[]}}>}}
 *   candidates sorted by fused score, best first; only entries found by at least one channel.
 */
export function retrieve(prep, question, { leaveOut = null, parsed = null } = {}) {
  const p = parsed ?? parseQuestion(question, prep.vocab, { namespaces: prep.namespaces });
  const conceptTerms = p.concepts.flatMap((id) => terms(`${id.replace(/-/g, ' ')} ${prep.vocab?.concepts.get(id)?.label ?? ''}`));
  const words = bm25(prep, [...p.terms, ...conceptTerms], leaveOut);

  const qLower = String(question ?? '').toLowerCase();
  const anchorHits = prep.rows.map((row) => (row.anchorKeys ?? []).filter((k) => anchorHit(qLower, k, { namespaces: prep.namespaces })));
  const anchors = anchorHits.map((hits) => hits.reduce((s, k) => s + idf(prep.n, prep.anchorDf.get(k) ?? 1), 0));

  const qOwn = new Set(p.concepts);
  const qNear = new Set(p.expanded);
  const conceptOwn = prep.conceptSets.map((s) => p.concepts.filter((id) => s.own.has(id)));
  const concepts = prep.conceptSets.map((s, i) => {
    let score = 0;
    for (const id of s.own) {
      const w = idf(prep.n, prep.conceptDf.get(id) ?? 1);
      if (qOwn.has(id)) score += w;
      // Half credit across the hierarchy, either way: the entry's concept is an ancestor
      // of the question's, or the question's is an ancestor of the entry's.
      else if (qNear.has(id) || (prep.vocab?.ancestors.get(id) ?? []).some((a) => qOwn.has(a))) score += w / 2;
    }
    return conceptOwn[i].length || score ? score : 0;
  });

  const [rw, ra, rc] = [ranksOf(words), ranksOf(anchors), ranksOf(concepts)];
  const candidates = [];
  prep.rows.forEach((row, i) => {
    if (!rw[i] && !ra[i] && !rc[i]) return;
    const fused = [rw[i], ra[i], rc[i]].reduce((s, r) => s + (r ? 1 / (RRF_K + r) : 0), 0);
    candidates.push({
      row,
      fused,
      words: { score: words[i], rank: rw[i] },
      anchors: { score: anchors[i], rank: ra[i], hits: anchorHits[i] },
      concepts: { score: concepts[i], rank: rc[i], own: conceptOwn[i] },
    });
  });
  candidates.sort((a, b) => b.fused - a.fused || b.words.score - a.words.score || a.row.id.localeCompare(b.row.id));
  return { parsed: p, candidates };
}
