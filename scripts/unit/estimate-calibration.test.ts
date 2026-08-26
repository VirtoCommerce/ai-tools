/**
 * estimatedMinutes calibration.
 *
 * `estimatedMinutes` is a hand-maintained constant the repo's own GOLDEN RULE forbids, and it is
 * wrong by up to ×88 on runner-native suites. What these tests defend is not the arithmetic —
 * it is the two ways a calibration tool can do damage:
 *
 *   1. Laundering one run into the manifest. A flaky or truncated pass that silently rewrote a
 *      number would reorder dispatch and re-scope every future change-scoped selection with no
 *      reviewer in the loop. Hence proposals need k>=3, and nothing is ever written.
 *   2. Turning a partial run into a confident number. A truncated run measured a fraction of the
 *      suite; scaling it up describes a run that never happened.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  CALIBRATION_VERSION,
  MIN_OBSERVATIONS_FOR_PROPOSAL,
  calibrate,
  formatCalibration,
  isUsableObservation,
  type CalibratableSuite,
  type DurationObservation,
} from "../lib/estimate-calibration.ts";

const SUITES: CalibratableSuite[] = [
  { id: "050m", name: "GraphQL xAPI — Sales Rep", testCount: 119, estimatedMinutes: 245 },
  { id: "042", name: "Smoke Tests", testCount: 34, estimatedMinutes: 18 },
];

const obs = (over: Partial<DurationObservation> & { suiteId: string }): DurationObservation => ({
  runId: "REG-TEST",
  durationMinutes: 3,
  ...over,
});

test("one observation is REPORTED but never proposed", () => {
  // The 050m case exactly: a real, dramatic measurement that a reviewer should see today, and
  // that must not move the manifest on its own.
  const r = calibrate(SUITES, [obs({ suiteId: "050m", durationMinutes: 2.77, casesReported: 119, totalCases: 119 })]);
  const row = r.rows.find((x) => x.suiteId === "050m")!;
  assert.equal(row.tier, "observation");
  assert.equal(row.measuredMinutes, 2.77);
  assert.equal(row.ratio, 88.45);
  assert.deepEqual(r.proposals, []);
  assert.equal(r.observationsOnly.length, 1);
});

test(`${MIN_OBSERVATIONS_FOR_PROPOSAL} observations promote it to a proposal`, () => {
  const three = [2.5, 2.77, 3.1].map((d) =>
    obs({ suiteId: "050m", durationMinutes: d, casesReported: 119, totalCases: 119 }),
  );
  const r = calibrate(SUITES, three);
  const row = r.rows.find((x) => x.suiteId === "050m")!;
  assert.equal(row.tier, "proposal");
  assert.equal(row.measuredMinutes, 2.77, "the MEDIAN, so one outlier cannot carry it");
  assert.equal(r.proposals.length, 1);
});

test("the median resists a single wild run", () => {
  const r = calibrate(SUITES, [
    obs({ suiteId: "042", durationMinutes: 12, casesReported: 34, totalCases: 34 }),
    obs({ suiteId: "042", durationMinutes: 13, casesReported: 34, totalCases: 34 }),
    obs({ suiteId: "042", durationMinutes: 400, casesReported: 34, totalCases: 34 }),
  ]);
  assert.equal(r.rows.find((x) => x.suiteId === "042")!.measuredMinutes, 13);
});

test("a TRUNCATED run is rejected, with the reason kept", () => {
  // REG-2026-08-03-1900 reported 8 of 078-p3's 38 cases. Scaling that elapsed time up to 38
  // would produce a confident number describing a run that never happened.
  const v = isUsableObservation(obs({ suiteId: "x", casesReported: 8, totalCases: 38 }));
  assert.equal(v.usable, false);
  assert.match(v.reason ?? "", /truncated run — 8\/38 cases reported \(21%\)/);
});

test("a nearly-complete run is accepted — 95% is the bar, not 100%", () => {
  // A single SKIPPED case must not disqualify an otherwise sound measurement.
  assert.equal(isUsableObservation(obs({ suiteId: "x", casesReported: 119, totalCases: 119 })).usable, true);
  assert.equal(isUsableObservation(obs({ suiteId: "x", casesReported: 33, totalCases: 34 })).usable, true);
  assert.equal(isUsableObservation(obs({ suiteId: "x", casesReported: 30, totalCases: 34 })).usable, false);
});

test("a rejected observation appears in the row, never silently dropped", () => {
  const r = calibrate(SUITES, [obs({ suiteId: "050m", casesReported: 8, totalCases: 119 })]);
  const row = r.rows.find((x) => x.suiteId === "050m")!;
  assert.equal(row.tier, "insufficient");
  assert.equal(row.measuredMinutes, null);
  assert.equal(row.rejected.length, 1);
  assert.match(row.rejected[0].reason, /truncated/);
});

test("a zero or negative duration is not a measurement", () => {
  for (const d of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.equal(isUsableObservation(obs({ suiteId: "x", durationMinutes: d })).usable, false, String(d));
  }
});

test("an observation with no case counts is accepted — coverage is optional evidence", () => {
  // history rows predating the counts should still contribute; absence of the check is not
  // evidence of truncation.
  assert.equal(isUsableObservation({ suiteId: "x", runId: "r", durationMinutes: 4 }).usable, true);
});

test("an unmeasured suite is 'insufficient', not zero", () => {
  const r = calibrate(SUITES, []);
  for (const row of r.rows) {
    assert.equal(row.tier, "insufficient");
    assert.equal(row.measuredMinutes, null);
    assert.equal(row.ratio, null);
  }
});

test("the report states plainly that it never writes the manifest", () => {
  const r = calibrate(SUITES, [obs({ suiteId: "050m", durationMinutes: 2.77, casesReported: 119, totalCases: 119 })]);
  const text = formatCalibration(r);
  assert.match(text, /NEVER writes config\/test-suites\.json/);
  assert.match(text, /OBSERVED/);
  assert.match(text, /050m/);
  assert.match(text, /x88/);
});

test("the report shows rejected observations too", () => {
  const r = calibrate(SUITES, [obs({ suiteId: "050m", casesReported: 8, totalCases: 119 })]);
  const text = formatCalibration(r);
  assert.match(text, /REJECTED observations — reported, never dropped in silence/);
});

test("CALIBRATION_VERSION is a comparable semver", () => {
  assert.match(CALIBRATION_VERSION, /^\d+\.\d+\.\d+$/);
});
