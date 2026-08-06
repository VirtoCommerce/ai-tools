/**
 * The regression dashboard watcher's stall detector.
 *
 * Regression guard for the false "no progress for 45 min — stopping." kill on a
 * healthy run: the signature used to be runId:status:suitesWithResults, which is
 * constant from the first tick of a SINGLE-suite run (the runner pre-seeds every
 * case as PENDING, so the results file — and therefore the suite count — exists
 * immediately and never changes again). Multi-suite runs masked it because the
 * suite count kept incrementing.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  watchProgressSignature,
  tallyCaseProgress,
  type WatchProgress,
} from "../regression/generate-regression-html-report.ts";

type Counters = { casesRecorded: number; passed: number; failed: number; blocked: number; skipped: number };

const suite = (c: Partial<Counters>): Counters => ({
  casesRecorded: 0,
  passed: 0,
  failed: 0,
  blocked: 0,
  skipped: 0,
  ...c,
});

const progress = (p: Partial<WatchProgress>): WatchProgress => ({
  runId: "REG-2026-08-06-1000",
  statusLabel: "in_progress",
  suitesWithResults: 1,
  casesRecorded: 0,
  evaluatedCases: 0,
  ...p,
});

test("single-suite run: signature advances as cases are evaluated", () => {
  // Tick 1: results file pre-seeded — 20 cases recorded, none evaluated yet.
  const seeded = progress({ casesRecorded: 20, evaluatedCases: 0 });
  // Tick 2: three cases done. Suite count is identical — only the cases moved.
  const working = progress({ casesRecorded: 20, evaluatedCases: 3 });

  assert.equal(seeded.suitesWithResults, working.suitesWithResults);
  assert.notEqual(
    watchProgressSignature(seeded),
    watchProgressSignature(working),
    "case progress on a single-suite run must reset the idle timer"
  );
});

test("genuinely idle run keeps a stable signature", () => {
  const p = progress({ casesRecorded: 20, evaluatedCases: 7 });
  assert.equal(watchProgressSignature(p), watchProgressSignature(progress({ casesRecorded: 20, evaluatedCases: 7 })));
});

test("suite-count and run-status changes still register as progress", () => {
  const base = progress({ casesRecorded: 20, evaluatedCases: 7 });
  assert.notEqual(watchProgressSignature(base), watchProgressSignature(progress({ ...base, suitesWithResults: 2 })));
  assert.notEqual(watchProgressSignature(base), watchProgressSignature(progress({ ...base, statusLabel: "completed" })));
  assert.notEqual(watchProgressSignature(base), watchProgressSignature(progress({ ...base, runId: "REG-other" })));
});

test("tallyCaseProgress counts every decided verdict, not just passes", () => {
  const t = tallyCaseProgress([
    suite({ casesRecorded: 20, passed: 3, failed: 1, blocked: 1, skipped: 2 }),
    suite({ casesRecorded: 5, passed: 1 }),
  ]);
  assert.deepEqual(t, { casesRecorded: 25, evaluatedCases: 8 });
});

test("tallyCaseProgress on a freshly pre-seeded run reports zero evaluated", () => {
  assert.deepEqual(tallyCaseProgress([suite({ casesRecorded: 20 })]), { casesRecorded: 20, evaluatedCases: 0 });
  assert.deepEqual(tallyCaseProgress([]), { casesRecorded: 0, evaluatedCases: 0 });
});
