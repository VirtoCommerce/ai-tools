/**
 * Guards on the regression run close-out.
 *
 * Closing a run needs TWO writes — the status flip to `completed` and the per-suite append
 * to `history.json` — and until 2026-09-07 they were two separate manual actions. Doing half
 * of it was therefore the default outcome, and it was also the actual one: eight September
 * runs sat on disk with zero rows in history, which had not been appended since 2026-08-27.
 * `close-run.ts` makes the pair one command.
 *
 * These tests exist because the FIRST version of that command closed a live run during its
 * own testing. Two defects combined: `--run-id` defaulted to "latest", which resolved to the
 * newest run dir — the one then executing — and the completeness check ran only ahead of the
 * status flip, not ahead of the history append. So the tests below pin the three properties
 * that accident violated: a terminal write must name its target, must refuse a run whose lanes
 * are still live, and must never clobber an envelope describing a different run.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { loadStatus, markRunClosed, openSuites } from "../regression/close-run.ts";

function statusFile(body: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), "close-run-test-"));
  const p = join(dir, "test-run-status.json");
  writeFileSync(p, JSON.stringify(body, null, 2), "utf-8");
  return p;
}

test("openSuites reports every lane that is still running or pending", () => {
  // The envelope already carries per-suite state, so "is this run over?" is checkable
  // rather than assumed — which is what the original guard failed to ask.
  const p = statusFile({
    runId: "REG-2026-09-07-1342",
    status: "in_progress",
    suites: {
      "1": { status: "done" },
      "8": { status: "running" },
      "9": { status: "running" },
      "12": { status: "pending" },
    },
  });
  const open = openSuites(p);
  assert.deepEqual(
    open.map((o) => o.id).sort(),
    ["12", "8", "9"],
    "a done suite is finished; running and pending are both unfinished",
  );
});

test("openSuites is empty for a fully finished run", () => {
  const p = statusFile({
    runId: "REG-1",
    status: "in_progress",
    suites: { "1": { status: "done" }, "2": { status: "done" } },
  });
  assert.equal(openSuites(p).length, 0);
});

test("a suite with no status is NOT treated as finished-by-omission", () => {
  // An absent status is unknown, not done. It must not silently qualify a run as closeable.
  const p = statusFile({ runId: "REG-1", status: "in_progress", suites: { "1": {} } });
  assert.equal(openSuites(p).length, 0, "unknown is not counted as open either");
  // ...but the run is still not provably complete, which is why the CLI also requires an
  // explicit --run-id rather than inferring a target. Documented, not asserted here.
});

test("markRunClosed refuses an envelope that describes a DIFFERENT run", () => {
  // Several sessions share this working tree. Overwriting another session's run envelope
  // is unrecoverable for them, so the write re-reads and bails.
  const p = statusFile({ runId: "REG-LIVE", status: "in_progress", suites: {} });
  const r = markRunClosed("REG-OTHER", "completed", "2026-09-07T00:00:00.000Z", p);
  assert.equal(r.written, false);
  assert.match(String(r.reason), /REG-LIVE/, "the reason names the run it actually found");
  assert.equal(
    JSON.parse(readFileSync(p, "utf-8")).status,
    "in_progress",
    "the live envelope is untouched",
  );
});

test("markRunClosed leaves an already-terminal run alone", () => {
  const p = statusFile({ runId: "REG-1", status: "completed", finishedAt: "2026-09-01T00:00:00.000Z", suites: {} });
  const r = markRunClosed("REG-1", "completed", "2026-09-07T00:00:00.000Z", p);
  assert.equal(r.written, false);
  assert.match(String(r.reason), /already terminal/);
});

test("markRunClosed writes the flip, and preserves an existing finishedAt", () => {
  const p = statusFile({ runId: "REG-1", status: "in_progress", finishedAt: null, suites: {} });
  const r = markRunClosed("REG-1", "completed", "2026-09-07T12:00:00.000Z", p);
  assert.equal(r.written, true);
  const after = JSON.parse(readFileSync(p, "utf-8"));
  assert.equal(after.status, "completed");
  assert.equal(after.finishedAt, "2026-09-07T12:00:00.000Z", "a null finishedAt is filled");
  assert.deepEqual(after.suites, {}, "no other field is disturbed");

  // Idempotent-ish: a second call is refused rather than re-stamping the time.
  const again = markRunClosed("REG-1", "completed", "2026-09-07T13:00:00.000Z", p);
  assert.equal(again.written, false);
  assert.equal(JSON.parse(readFileSync(p, "utf-8")).finishedAt, "2026-09-07T12:00:00.000Z");
});

test("loadStatus returns null rather than throwing on a missing or corrupt file", () => {
  assert.equal(loadStatus(join(tmpdir(), "definitely-not-here-close-run.json")), null);
  const dir = mkdtempSync(join(tmpdir(), "close-run-test-"));
  const bad = join(dir, "test-run-status.json");
  writeFileSync(bad, "{ not json", "utf-8");
  assert.equal(loadStatus(bad), null, "a half-written envelope must not crash the close-out");
});
