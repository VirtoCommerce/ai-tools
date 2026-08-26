/**
 * recalibrate-estimates CLI — the source readers.
 *
 * The one judgement in this CLI is what it REFUSES to measure: a multi-suite run's wall-clock
 * cannot be attributed to each of its suites, and a run still in flight has no span. Both would
 * produce a number indistinguishable from a real measurement.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { fromHistory, fromStatus } from "../regression/recalibrate-estimates.ts";

const TSX_CLI = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const CLI = fileURLToPath(new URL("../regression/recalibrate-estimates.ts", import.meta.url));

/** process.execPath + resolved tsx: spawnSync("npx", …) ENOENTs on win32. */
function run(args: readonly string[] = []) {
  return spawnSync(process.execPath, [TSX_CLI, CLI, ...args], { encoding: "utf-8", env: process.env });
}

test("history contributes nothing while no row carries a duration — and that is not an error", () => {
  // 19 real runs landed with their timing discarded at aggregation. An empty result here is the
  // honest reading of that, not a failure.
  const rows = fromHistory();
  assert.ok(Array.isArray(rows));
  for (const r of rows) assert.ok(r.durationMinutes > 0, "a contributed row must carry a real duration");
});

test("the status file yields at most one observation, and says what it did", () => {
  const { observations, note } = fromStatus();
  assert.ok(note.length > 0, "the note is how a refusal is made visible");
  assert.ok(observations.length <= 1);
  for (const o of observations) {
    assert.ok(o.durationMinutes > 0);
    assert.ok(o.suiteId.length > 0);
  }
});

test("CLI: prints the review table and refuses to write the manifest", () => {
  const r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /estimatedMinutes calibration/);
  assert.match(r.stdout, /NEVER writes config\/test-suites\.json/);
});

test("CLI: an empty proposal list exits 0 — a normal state, not a failure", () => {
  // The tool is inert until three runs of a suite land. Exiting non-zero would make it look
  // broken and get it switched off before it ever has data.
  const r = run();
  assert.equal(r.status, 0);
  assert.match(r.stdout, /proposal\(s\)/);
});

test("CLI: --json is parseable and separates the two confidence tiers", () => {
  const r = run(["--json"]);
  assert.equal(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout) as {
    calibrationVersion: string;
    rows: unknown[];
    proposals: unknown[];
    observationsOnly: unknown[];
    sources: { history: number; status: string };
  };
  assert.match(d.calibrationVersion, /^\d+\.\d+\.\d+$/);
  assert.ok(d.rows.length > 100, "every manifest suite gets a row, measured or not");
  assert.ok(Array.isArray(d.proposals));
  assert.ok(Array.isArray(d.observationsOnly));
  assert.equal(typeof d.sources.status, "string");
});

test("CLI: the manifest is not modified by a run", () => {
  const path = "config/test-suites.json";
  const before = spawnSync("git", ["hash-object", path], { encoding: "utf-8" }).stdout.trim();
  run();
  const after = spawnSync("git", ["hash-object", path], { encoding: "utf-8" }).stdout.trim();
  assert.equal(before, after, "recalibrate must never touch the manifest");
});
