// `kb calibrate` (VCST-6122 Decision 6): fit the verdict on the labelled set, offline.
//
// THE SPLITS ARE NOT INTERCHANGEABLE, and the order is the whole method:
//   dev          the logistic regression is FITTED here (and the vocabulary was seeded from it);
//   calibration  the thresholds are CHOSEN here -- `answer` at the lowest probability whose answers
//                reach the target precision, `none` and `unmapped` below it;
//   test         never read by this file. It is opened once, by the bench, at the gate.
//
// Writes nothing by itself: it returns `ranker.json`'s content. Where that lands is the caller's
// decision, because ranker.json is base data and base data changes only with the operator's yes.

import { AMBIGUOUS_TOP, MODEL_FEATURES, answerThreshold, featuresOf, fitLogistic, lowerThresholds, probability } from './verdict.mjs';
import { DEFAULT_FUSION, retrieve } from './retrieve.mjs';

/** The name every ask line carries for a verdict ranker; bump it when the method changes. */
export const VERDICT_RANKER = 'verdict-1';

/** Every labelled row of the given splits, retrieved once: features + what the label says of the top. */
export function scoreSet(prep, rows, { fusion = DEFAULT_FUSION } = {}) {
  return rows.map((row) => {
    const r = retrieve(prep, row.q, { fusion });
    const expect = new Set(row.expect ?? []);
    const top = r.candidates[0]?.row.id ?? null;
    return {
      row,
      retrieval: r,
      f: featuresOf(prep, r),
      correct: row.kind === 'target' && expect.has(top),
      rightInTop: row.kind === 'target' && r.candidates.slice(0, AMBIGUOUS_TOP).some((c) => expect.has(c.row.id)),
      empty: !r.candidates.length,
    };
  });
}

/**
 * @param {object} prep            prepareRetrieval(...)
 * @param {object[]} labelled      labelledRows(set) -- every split; test rows are ignored here
 * @returns {object}               the content of ranker.json
 */
export function calibrate(prep, labelled, { precision = 0.95, controlsNone = 0.9, snapshot = null, l2 = 1, fusion = DEFAULT_FUSION } = {}) {
  const dev = scoreSet(prep, labelled.filter((r) => r.split === 'dev'), { fusion });
  const cal = scoreSet(prep, labelled.filter((r) => r.split === 'calibration'), { fusion });
  const model = fitLogistic(dev.filter((s) => !s.empty).map((s) => ({ f: s.f, y: s.correct ? 1 : 0 })), { l2, features: MODEL_FEATURES });
  const p = (s) => (s.empty ? 0 : probability(model, s.f));
  const calScored = cal.map((s) => ({ ...s, p: p(s), kind: s.row.kind, unmappedShare: s.f.unmappedShare }));
  const answer = answerThreshold(calScored, { precision });
  const lower = lowerThresholds(calScored.filter((s) => s.p < answer), { controlsNone });
  return {
    schema: 1,
    rank: VERDICT_RANKER,
    fitted: new Date().toISOString(),
    set: snapshot,
    target: { precision, controlsNone },
    fusion,
    model,
    thresholds: { answer: Number.isFinite(answer) ? answer : null, none: Math.min(lower.none, answer), unmapped: lower.unmapped },
    fit: {
      dev: { rows: dev.length, positives: dev.filter((s) => s.correct).length },
      calibration: { rows: cal.length, answeredAtThreshold: calScored.filter((s) => s.p >= answer).length },
    },
  };
}
