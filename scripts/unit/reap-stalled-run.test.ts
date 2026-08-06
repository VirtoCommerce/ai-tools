/**
 * Deterministic backstop for an orphaned regression run.
 *
 * `test-run-status.json` is written only by the orchestrator (an LLM step). If it
 * dies mid-run the file stays `in_progress` forever: the dashboard watcher never
 * settles and /qa-regression Step 0's duplicate check blocks every future run.
 * These tests pin both halves of the contract — that a proven-silent run IS
 * reclaimed, and that an unproven one is NOT (a false reap frees the interlock
 * and lets two runs fight over the same three browser lanes).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  classifyRun,
  gatherActivity,
  markRunStalled,
  loadStatus,
  DEFAULT_IDLE_LIMIT_MS,
  NON_EVIDENCE_BASENAMES,
  type RunStatusFile,
} from "../regression/reap-stalled-run.ts";

const NOW = Date.UTC(2026, 7, 6, 12, 0, 0);
const MIN = 60_000;
const RUN = "REG-2026-08-06-1000";

const inProgress: RunStatusFile = { runId: RUN, status: "in_progress" };

function scratch(): string {
  const root = mkdtempSync(join(tmpdir(), "reap-test-"));
  mkdirSync(join(root, RUN), { recursive: true });
  return root;
}

function ageFile(path: string, minutesOld: number): void {
  const t = new Date(NOW - minutesOld * MIN);
  utimesSync(path, t, t);
}

// --- classification --------------------------------------------------------

test("silent past the idle limit → stalled", () => {
  const c = classifyRun(inProgress, { newestActivityMs: NOW - 50 * MIN }, NOW, DEFAULT_IDLE_LIMIT_MS);
  assert.equal(c.liveness, "stalled");
  assert.equal(c.runId, RUN);
  assert.equal(c.idleMs, 50 * MIN);
});

test("recent activity → active, even with the same in_progress status", () => {
  assert.equal(classifyRun(inProgress, { newestActivityMs: NOW - 3 * MIN }, NOW, DEFAULT_IDLE_LIMIT_MS).liveness, "active");
  // Exactly at the limit is not yet over it.
  assert.equal(classifyRun(inProgress, { newestActivityMs: NOW - 45 * MIN }, NOW, DEFAULT_IDLE_LIMIT_MS).liveness, "active");
});

test("unreadable evidence never reaps — absence of evidence is not evidence of a stall", () => {
  const c = classifyRun(inProgress, { newestActivityMs: null }, NOW, DEFAULT_IDLE_LIMIT_MS);
  assert.equal(c.liveness, "active");
  assert.match(c.reason, /refusing to reap/);
});

test("an already-closed run is settled, not stalled", () => {
  for (const status of ["completed", "stalled", "failed"]) {
    const c = classifyRun({ runId: RUN, status }, { newestActivityMs: NOW - 10 * 60 * MIN }, NOW, DEFAULT_IDLE_LIMIT_MS);
    assert.equal(c.liveness, "settled", `status "${status}" must not be reaped again`);
  }
});

test("missing status file / runId → no-status", () => {
  assert.equal(classifyRun(null, { newestActivityMs: NOW }, NOW).liveness, "no-status");
  assert.equal(classifyRun({ status: "in_progress" }, { newestActivityMs: NOW }, NOW).liveness, "no-status");
});

// --- evidence gathering ----------------------------------------------------

test("the watcher's own report output does not count as run activity", () => {
  const root = scratch();
  const runDir = join(root, RUN);
  writeFileSync(join(root, "test-run-status.json"), JSON.stringify(inProgress));
  writeFileSync(join(runDir, "suite-002-results.json"), "{}");
  // The watcher rewrites this every tick; counting it would make a dead run look
  // busy forever — the precise trap this backstop exists to avoid.
  writeFileSync(join(runDir, "regression-report.html"), "<html>");

  ageFile(join(root, "test-run-status.json"), 90);
  ageFile(join(runDir, "suite-002-results.json"), 60);
  ageFile(join(runDir, "regression-report.html"), 0);

  const activity = gatherActivity(root, RUN);
  assert.ok(NON_EVIDENCE_BASENAMES.has("regression-report.html"));
  assert.equal(activity.newestActivitySource, "suite-002-results.json");
  assert.equal(classifyRun(inProgress, activity, NOW, DEFAULT_IDLE_LIMIT_MS).liveness, "stalled");
});

test("a nested screenshot written a moment ago keeps the run active", () => {
  const root = scratch();
  const shots = join(root, RUN, "evidence", "screenshots");
  mkdirSync(shots, { recursive: true });
  writeFileSync(join(root, "test-run-status.json"), JSON.stringify(inProgress));
  writeFileSync(join(root, RUN, "suite-002-results.json"), "{}");
  writeFileSync(join(shots, "CAT-004-FAIL.png"), "x");

  ageFile(join(root, "test-run-status.json"), 90);
  ageFile(join(root, RUN, "suite-002-results.json"), 90);
  ageFile(join(shots, "CAT-004-FAIL.png"), 2);

  const activity = gatherActivity(root, RUN);
  assert.equal(classifyRun(inProgress, activity, NOW, DEFAULT_IDLE_LIMIT_MS).liveness, "active");
});

// --- applying the mark -----------------------------------------------------

test("marking stalled preserves the run record and never claims completion", () => {
  const root = scratch();
  const original = { runId: RUN, status: "in_progress", selection: "002", suites: [{ id: "002", status: "running" }] };
  writeFileSync(join(root, "test-run-status.json"), JSON.stringify(original));

  assert.equal(markRunStalled(root, RUN, "silent for 50 min", "2026-08-06T12:00:00Z"), true);

  const after = loadStatus(root)!;
  assert.equal(after.status, "stalled", "must not be reported as completed — the run did not finish");
  assert.equal(after.stalledAt, "2026-08-06T12:00:00Z");
  assert.equal(after.stalledReason, "silent for 50 min");
  assert.equal(after.selection, "002", "unrelated fields survive");
  assert.deepEqual(after.suites, original.suites);
  // Written as readable JSON, like every other status write.
  assert.match(readFileSync(join(root, "test-run-status.json"), "utf-8"), /\n {2}"status": "stalled"/);
});

test("a run that changed underneath the reaper is left alone — the orchestrator wins", () => {
  const root = scratch();

  // Orchestrator woke up and closed the run itself.
  writeFileSync(join(root, "test-run-status.json"), JSON.stringify({ runId: RUN, status: "completed" }));
  assert.equal(markRunStalled(root, RUN, "r", "2026-08-06T12:00:00Z"), false);
  assert.equal(loadStatus(root)!.status, "completed");

  // A different run has since started — reaping it would kill a live run.
  writeFileSync(join(root, "test-run-status.json"), JSON.stringify({ runId: "REG-newer", status: "in_progress" }));
  assert.equal(markRunStalled(root, RUN, "r", "2026-08-06T12:00:00Z"), false);
  assert.equal(loadStatus(root)!.status, "in_progress");
});
