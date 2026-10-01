// The verdict (VCST-6122 Decisions 1 and 6): the base decides `answer`, `ambiguous` or `none` itself.
//
// floor-1 decided with one number -- the share of the question's words an entry shared -- and the
// labelled set shows what that buys: on the migrated base, 18 targets whose right entry was ranked
// FIRST were refused, and 12 of 29 controls were answered (baselineFloor1). One magnitude cannot
// separate those, so the decision is made over several STRUCTURAL signals instead, by a logistic
// regression whose weights and thresholds are fitted offline (`kb calibrate`) and live in the base's
// `ranker.json`:
//
//   conceptCoverage  how much of the question's concepts the top entry carries (sufficiency)
//   margin           how far the top entry is ahead of the second (relative fused score)
//   agreement        in how many channels the top entry is first
//   coordMatch       the top entry carries a coordinate the question names
//   coordMissed      the question names a coordinate and the top entry carries none of them
//   surfaceMatch     +1 the top entry is on a surface the question names, -1 it is not, 0 no hint
//   termCoverage     share of the question's content words found in the top entry's text
//   unmappedShare    share of the question's content words that map to no concept
//   idfCoverage      termCoverage weighted by how rare each word is: missing "csv" costs more than
//                    missing "show"
//   sentenceStrength the top entry's best sentence score over the most any sentence could score on
//                    this question -- question-to-question sufficiency, independent of length
//   sentenceMargin   how far that best sentence is ahead of the runner-up entry's
//
// THE ASYMMETRY THAT IS NOT LEARNED: a question whose words the vocabulary mostly cannot map is a
// vocabulary gap before it is a coverage gap, so it may end in `ambiguous` but never in `none` --
// "the base holds nothing" must not be said about something the base could not read.

import { retrieve } from './retrieve.mjs';

export const FEATURES = [
  'conceptCoverage', 'margin', 'agreement', 'coordMatch', 'coordMissed', 'surfaceMatch', 'termCoverage', 'unmappedShare',
  'idfCoverage', 'sentenceStrength', 'sentenceMargin',
];

/**
 * The features the MODEL reads; every feature above is still computed and logged with the verdict.
 * Chosen by leave-one-out cross-validation on dev (56 rows, 25 positives), never on calibration:
 *   all eleven             log-loss 0.425  AUC 0.890   (l2 5, its best)
 *   the eight of Decision 6  -- design's own list --   AUC 0.737-0.879
 *   these four             log-loss 0.387  AUC 0.907   (l2 1)
 * Concept coverage, coordinate and surface match carry no information on dev that the four do not;
 * dev holds few coordinate questions, so that verdict is weak for coordinates and is re-checked when
 * the set grows. `unmappedShare` is not a model input: it acts through its own rule (never `none`).
 */
export const MODEL_FEATURES = ['idfCoverage', 'sentenceStrength', 'sentenceMargin', 'margin'];

const BM25_CEILING = 2.2; // k1 + 1: the most one matching word can contribute to a sentence score

/** How many headlines an `ambiguous` verdict carries. */
export const AMBIGUOUS_TOP = 3;

/** The feature vector of one retrieval, as a name -> value object. */
export function featuresOf(prep, { parsed, candidates }) {
  const top = candidates[0];
  if (!top) return Object.fromEntries(FEATURES.map((f) => [f, 0]));
  const second = candidates[1];
  const own = new Set(top.row.concepts ?? []);
  const anc = (id) => prep.vocab?.ancestors.get(id) ?? [];
  const credit = (q) => (own.has(q) ? 1
    : [...own].some((c) => anc(c).includes(q)) || anc(q).some((a) => own.has(a)) ? 0.5 : 0);
  const conceptCoverage = parsed.concepts.length
    ? parsed.concepts.reduce((s, q) => s + credit(q), 0) / parsed.concepts.length : 0;
  const doc = prep.docs[prep.rows.indexOf(top.row)];
  const q = [...new Set(parsed.terms)];
  const surfaces = new Set(top.row.surfaces ?? []);
  const N = prep.sentences?.length ?? 1;
  const idfOf = (t) => Math.log(1 + (N - (prep.sdf?.get(t) ?? 0) + 0.5) / ((prep.sdf?.get(t) ?? 0) + 0.5));
  const mass = q.reduce((s, t) => s + idfOf(t), 0);
  const s1 = top.sentence?.score ?? 0;
  const s2 = Math.max(0, ...candidates.slice(1).map((c) => c.sentence?.score ?? 0));
  return {
    conceptCoverage,
    margin: second ? (top.fused - second.fused) / top.fused : 1,
    agreement: [top.sentence.rank, top.anchors.rank, top.concepts.rank].filter((r) => r === 1).length / 3,
    coordMatch: top.anchors.hits.length ? 1 : 0,
    coordMissed: parsed.coords.length && !top.anchors.hits.length ? 1 : 0,
    surfaceMatch: parsed.surfaces.length ? (parsed.surfaces.some((s) => surfaces.has(s)) ? 1 : -1) : 0,
    termCoverage: q.length ? q.filter((t) => doc?.tf.has(t)).length / q.length : 0,
    unmappedShare: parsed.unmappedShare,
    idfCoverage: mass ? q.filter((t) => doc?.tf.has(t)).reduce((s, t) => s + idfOf(t), 0) / mass : 0,
    sentenceStrength: mass ? s1 / (mass * BM25_CEILING) : 0,
    sentenceMargin: s1 ? (s1 - s2) / s1 : 0,
  };
}

const sigmoid = (z) => 1 / (1 + Math.exp(-z));

/** The probability that the top entry answers the question, under one fitted model. */
export function probability(model, f) {
  let z = model.bias;
  model.features.forEach((name, i) => { z += model.weights[i] * ((f[name] ?? 0) - model.mean[i]) / model.std[i]; });
  return sigmoid(z);
}

/**
 * Fit a logistic regression: standardised features, L2, plain batch gradient descent -- deterministic,
 * dependency-free, and more than enough for a hundred rows and eight features.
 *
 * @param {Array<{f: object, y: 0|1}>} samples
 */
export function fitLogistic(samples, { features = FEATURES, l2 = 1, iterations = 4000, rate = 0.1 } = {}) {
  const n = samples.length;
  const X = samples.map((s) => features.map((name) => s.f[name] ?? 0));
  const mean = features.map((_, j) => X.reduce((s, x) => s + x[j], 0) / n);
  const std = features.map((_, j) => Math.sqrt(X.reduce((s, x) => s + (x[j] - mean[j]) ** 2, 0) / n) || 1);
  const Z = X.map((x) => x.map((v, j) => (v - mean[j]) / std[j]));
  const w = features.map(() => 0);
  let b = 0;
  for (let it = 0; it < iterations; it++) {
    const gw = features.map(() => 0);
    let gb = 0;
    Z.forEach((z, i) => {
      const err = sigmoid(b + z.reduce((s, v, j) => s + w[j] * v, 0)) - samples[i].y;
      gb += err;
      z.forEach((v, j) => { gw[j] += err * v; });
    });
    for (let j = 0; j < w.length; j++) w[j] -= rate * (gw[j] / n + (l2 / n) * w[j]);
    b -= rate * (gb / n);
  }
  return { features, mean, std, weights: w, bias: b };
}

/** The concept that tells one headline apart from the others it is listed with. */
function separating(cands, i, vocab) {
  const others = new Set(cands.filter((_, j) => j !== i).flatMap((c) => c.row.concepts ?? []));
  const id = (cands[i].row.concepts ?? []).find((c) => !others.has(c));
  return id ? (vocab?.concepts.get(id)?.label ?? id) : null;
}

/**
 * Decide one question.
 *
 * @param {object} ranker  `{rank, model, thresholds: {answer, none, unmapped}}` (ranker.json)
 * @returns {{verdict:'answer'|'ambiguous'|'none', p:number, features:object, entries:object[],
 *            candidates:object[], parsed:object, concepts:string[]}}
 *   `entries` is what the verdict hands over: one candidate for `answer`, the headlines for
 *   `ambiguous`, none for `none`. `concepts` are, for `none`, the nearest concepts the base holds.
 */
export function decide(prep, ranker, question, { retrieval = null } = {}) {
  const r = retrieval ?? retrieve(prep, question, { fusion: ranker.fusion });
  const f = featuresOf(prep, r);
  // ranker.json stores an unreachable answer threshold as null: JSON has no Infinity.
  const answer = ranker.thresholds.answer ?? Infinity;
  const { none, unmapped } = ranker.thresholds;
  const p = r.candidates.length ? probability(ranker.model, f) : 0;
  let verdict;
  if (!r.candidates.length) verdict = 'none';
  else if (p >= answer) verdict = 'answer';
  else if (p >= none || f.unmappedShare >= unmapped) verdict = 'ambiguous';
  else verdict = 'none';
  const listed = verdict === 'answer' ? r.candidates.slice(0, 1)
    : verdict === 'ambiguous' ? r.candidates.slice(0, AMBIGUOUS_TOP) : [];
  const entries = listed.map((c, i) => ({ ...c, separating: verdict === 'ambiguous' ? separating(listed, i, prep.vocab) : null }));
  const near = r.parsed.concepts.length ? r.parsed.concepts
    : [...new Set(r.candidates.slice(0, 3).flatMap((c) => c.row.concepts ?? []))].slice(0, 3);
  return { verdict, p, features: f, entries, candidates: r.candidates, parsed: r.parsed, concepts: verdict === 'none' ? near : [] };
}

// ── thresholds ────────────────────────────────────────────────────────────────────────────────

/**
 * The `answer` threshold: the LOWEST probability at which the answers above it reach the target
 * precision. Infinity when no threshold reaches it -- the base then never answers on its own, which is
 * the safe failure.
 *
 * @param {Array<{p:number, correct:boolean}>} scored
 */
export function answerThreshold(scored, { precision = 0.95 } = {}) {
  const ps = [...new Set(scored.map((s) => s.p))].sort((a, b) => a - b);
  for (const t of ps) {
    const ans = scored.filter((s) => s.p >= t);
    if (ans.length && ans.filter((s) => s.correct).length / ans.length >= precision) return t;
  }
  return Infinity;
}

/**
 * The `none` and `unmapped` thresholds, together, below the answer threshold: as many targets as
 * possible end in `ambiguous` WITH their right entry among the headlines, subject to controls ending
 * in `none` at the target rate; ties go to the higher `none` threshold (fewer tokens).
 *
 * @param {Array<{p:number, kind:'target'|'control', unmappedShare:number, rightInTop:boolean}>} scored
 *   rows below the answer threshold
 */
export function lowerThresholds(scored, { controlsNone = 0.9, unmappedGrid = [0.5, 0.6, 0.7, 0.8, 0.9, 1] } = {}) {
  const controls = scored.filter((s) => s.kind === 'control');
  const ps = [0, ...new Set(scored.map((s) => s.p))].sort((a, b) => a - b);
  let best = null;
  for (const unmapped of unmappedGrid) {
    for (const none of ps) {
      const amb = (s) => s.p >= none || s.unmappedShare >= unmapped;
      const cNone = controls.length ? controls.filter((s) => !amb(s)).length / controls.length : 1;
      const useful = scored.filter((s) => s.kind === 'target' && s.rightInTop && amb(s)).length;
      const key = [cNone >= controlsNone ? 1 : 0, cNone >= controlsNone ? useful : cNone, none, unmapped];
      if (!best || cmp(key, best.key) > 0) best = { key, none, unmapped };
    }
  }
  return { none: best?.none ?? 0, unmapped: best?.unmapped ?? 1 };
}

const cmp = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i]; return 0; };
