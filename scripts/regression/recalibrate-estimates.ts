#!/usr/bin/env node
/**
 * recalibrate-estimates — read measured run durations, print a review diff for
 * `estimatedMinutes`. Never writes the manifest.
 *
 *   npm run regression:recalibrate           # the review table
 *   npm run regression:recalibrate -- --json # machine-readable
 *
 * Sources, in the order they are trusted:
 *
 *   1. `reports/regression/history.json` — the durable, multi-run record. Its rows carry
 *      `duration_minutes` only from the fix that closed the pipe: for 19 runs before that, the
 *      timing was produced per case AND per envelope and then discarded at aggregation, so those
 *      rows are silent here. That is a gap in the data, not in this tool.
 *   2. `reports/regression/test-run-status.json` — the tracked status file for the CURRENT run.
 *      It carries `startedAt`/`finishedAt` and per-suite counts, so a completed run yields one
 *      real observation even when nothing appended it to history. This is how `050m`'s ×88
 *      overstatement is visible today.
 *
 * Exit codes: 0 always for a successful read (an empty proposal list is a normal state, not a
 * failure) · 2 when neither source can be read.
 */

import { existsSync, readFileSync } from "node:fs";

import { loadManifest } from "../../ci/lib/suite-manifest.js";
import {
  calibrate,
  formatCalibration,
  type CalibratableSuite,
  type DurationObservation,
} from "../lib/estimate-calibration.js";

const HISTORY = "reports/regression/history.json";
const STATUS = "reports/regression/test-run-status.json";

function fromHistory(): DurationObservation[] {
  if (!existsSync(HISTORY)) return [];
  let rows: Array<Record<string, unknown>>;
  try {
    const raw = JSON.parse(readFileSync(HISTORY, "utf-8")) as unknown;
    rows = Array.isArray(raw) ? (raw as Array<Record<string, unknown>>) : [];
  } catch {
    return [];
  }
  const out: DurationObservation[] = [];
  for (const r of rows) {
    const d = Number(r.duration_minutes);
    if (!Number.isFinite(d) || d <= 0) continue; // a row with no timing contributes nothing
    const passed = Number(r.passed ?? 0);
    const failed = Number(r.failed ?? 0);
    const blocked = Number(r.blocked ?? 0);
    const skipped = Number(r.skipped ?? 0);
    out.push({
      suiteId: String(r.suiteId ?? ""),
      runId: String(r.runId ?? "?"),
      durationMinutes: d,
      casesReported: passed + failed + blocked + skipped,
      totalCases: Number(r.total ?? 0),
      // A `--cases`-scoped row measured a slice; `isUsableObservation` rejects it outright. Its
      // own `total` is the slice size, so coverage would compute to 1.0 and look complete.
      ...(r.scoped === true ? { scoped: true } : {}),
    });
  }
  return out;
}

/**
 * One observation from the current run's status file, if it finished.
 *
 * The span is the RUN's, so this is only sound for a single-suite run — attributing a whole
 * multi-suite run's wall-clock to each of its suites would inflate every one of them. A
 * multi-suite status file is therefore skipped rather than apportioned: a guessed split would
 * look exactly like a measurement.
 */
function fromStatus(): { observations: DurationObservation[]; note: string } {
  if (!existsSync(STATUS)) return { observations: [], note: `${STATUS}: absent` };
  let d: Record<string, unknown>;
  try {
    d = JSON.parse(readFileSync(STATUS, "utf-8")) as Record<string, unknown>;
  } catch (e) {
    return { observations: [], note: `${STATUS}: unreadable (${(e as Error).message})` };
  }
  if (String(d.status) !== "completed") {
    return { observations: [], note: `${STATUS}: run ${d.runId} is ${d.status}, not completed` };
  }
  const start = Date.parse(String(d.startedAt ?? ""));
  const end = Date.parse(String(d.finishedAt ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    return { observations: [], note: `${STATUS}: run ${d.runId} has no usable span` };
  }
  const suites = (d.suites ?? {}) as Record<string, Record<string, unknown>>;
  const ids = Object.keys(suites);
  if (ids.length !== 1) {
    return {
      observations: [],
      note: `${STATUS}: run ${d.runId} covers ${ids.length} suites — the run span cannot be apportioned between them without guessing`,
    };
  }
  const id = ids[0];
  const s = suites[id];
  const passed = Number(s.passed ?? 0);
  const failed = Number(s.failed ?? 0);
  const blocked = Number(s.blocked ?? 0);
  const skipped = Number(s.skipped ?? 0);
  return {
    observations: [
      {
        suiteId: id,
        runId: String(d.runId ?? "?"),
        durationMinutes: Math.round(((end - start) / 60000) * 100) / 100,
        casesReported: passed + failed + blocked + skipped,
        totalCases: Number(s.testCount ?? 0),
      },
    ],
    note: `${STATUS}: run ${d.runId} contributed 1 observation for ${id}`,
  };
}

function main(): number {
  let manifest;
  try {
    manifest = loadManifest();
  } catch (e) {
    console.error(`[recalibrate] ${(e as Error).message}`);
    return 2;
  }

  const suites: CalibratableSuite[] = manifest.suites.map((s) => {
    const raw = s as unknown as Record<string, unknown>;
    return {
      id: s.id,
      name: s.name,
      testCount: s.testCount,
      estimatedMinutes: Number(raw.estimatedMinutes ?? 0),
    };
  });

  const hist = fromHistory();
  const status = fromStatus();
  const observations = [...hist, ...status.observations];

  const result = calibrate(suites, observations);

  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ sources: { history: hist.length, status: status.note }, ...result }, null, 2));
    return 0;
  }

  console.log(formatCalibration(result));
  console.log("");
  console.log(`sources: ${hist.length} observation(s) from ${HISTORY} · ${status.note}`);
  if (hist.length === 0) {
    console.log(
      `NOTE: no history row carries a duration yet. The per-case durationMs and the envelope span ` +
        `are both recorded by the runners; they reach history only via \`npm run triage:history\` ` +
        `after a run, so run that to make the next run calibrate itself.`,
    );
  }
  return 0;
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop() ?? "")) {
  process.exit(main());
}

export { fromHistory, fromStatus };
