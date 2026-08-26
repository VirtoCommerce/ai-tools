/**
 * `duration_minutes` on a history row — the field that unblocks recalibrating estimatedMinutes.
 *
 * `estimatedMinutes` is a hand-maintained constant, which this repo's own GOLDEN RULE
 * (`.claude/rules/test-data.md`) forbids: it is demonstrably wrong (14 fastpath suites average
 * 1.11 min/case while the one measured suite costs 0.10) and every wall-clock figure in the
 * regression work is derived from it. Recalibration needed run history, and 19 real runs arrived
 * — but every row's `duration_minutes` was empty, because `RunEntry` declared the field and
 * `appendSuiteHistory` never filled it. The per-case `durationMs` and the envelope span were both
 * being produced and then dropped in `normalizeSuiteRaw`.
 *
 * So these tests are about the two ways that field can lie: measuring the wrong interval, and
 * writing a zero where there was no measurement at all.
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import { existsSync, readFileSync } from "node:fs";

import { durationField } from "../lib/regression-triage.ts";

test("the envelope span wins, because that is what estimatedMinutes predicts", () => {
  // Wall-clock includes setup, waits and the gaps between cases. The sum of per-case durations
  // does not, so preferring the sum where a span exists would bias every future estimate down.
  const d = durationField({
    startedAt: "2026-08-26T10:00:00.000Z",
    completedAt: "2026-08-26T10:12:30.000Z",
    cases: [{ durationMs: 1000 }, { durationMs: 2000 }],
  });
  assert.deepEqual(d, { duration_minutes: 12.5 });
});

test("falls back to the sum of case durations when no span was recorded", () => {
  const d = durationField({ cases: [{ durationMs: 60_000 }, { durationMs: 30_000 }] });
  assert.deepEqual(d, { duration_minutes: 1.5 });
});

test("ABSENT, never zero, when nothing was recorded", () => {
  // A 0 would read as "ran instantly" and then be averaged into the calibration as a real
  // measurement. An absent field is visibly absent; a zero is a lie shaped like data.
  assert.deepEqual(durationField({ cases: [] }), {});
  assert.deepEqual(durationField({ cases: [{}] }), {});
  assert.deepEqual(durationField({ cases: [{ durationMs: 0 }] }), {});
});

test("a malformed or inverted span is ignored rather than trusted", () => {
  assert.deepEqual(durationField({ startedAt: "not-a-date", completedAt: "also-not", cases: [] }), {});
  // completedAt before startedAt: a negative duration would poison the calibration silently.
  assert.deepEqual(
    durationField({ startedAt: "2026-08-26T10:12:00Z", completedAt: "2026-08-26T10:00:00Z", cases: [] }),
    {},
  );
});

test("an inverted span still falls through to the case sum", () => {
  const d = durationField({
    startedAt: "2026-08-26T10:12:00Z",
    completedAt: "2026-08-26T10:00:00Z",
    cases: [{ durationMs: 120_000 }],
  });
  assert.deepEqual(d, { duration_minutes: 2 });
});

test("an unfinished suite has no duration", () => {
  // The live contract writes completedAt: "" until Phase 5, so a mid-run read must not invent one.
  assert.deepEqual(durationField({ startedAt: "2026-08-26T10:00:00Z", completedAt: "", cases: [] }), {});
});

test("a sub-minute suite is not rounded away to zero", () => {
  // The whole point of calibrating is that a runner-native suite may cost seconds per case while
  // the manifest claims minutes. Rounding to whole minutes would erase exactly that signal.
  const d = durationField({
    startedAt: "2026-08-26T10:00:00.000Z",
    completedAt: "2026-08-26T10:00:18.000Z",
    cases: [],
  });
  assert.deepEqual(d, { duration_minutes: 0.3 });
});

test("the corpus's existing history has no durations — which is the gap being closed", () => {
  // Recorded as a test so the state is unambiguous: if this ever fails, real durations have
  // started landing and estimatedMinutes can be recalibrated for the suites concerned.
  const path = "reports/regression/history.json";
  if (!existsSync(path)) return;
  const rows = JSON.parse(readFileSync(path, "utf-8")) as Array<Record<string, unknown>>;
  const withDuration = rows.filter((r) => typeof r.duration_minutes === "number");
  assert.ok(
    withDuration.length < rows.length,
    `all ${rows.length} history rows now carry a duration — update this test and run the recalibration`,
  );
});
