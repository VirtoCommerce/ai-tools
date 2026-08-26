// Unit tests for the run status vocabulary in ci/lib/suite-caps.ts.
//
// The bug being locked out: the old union was
// `"success" | "error" | "budget_exceeded" | "max_turns"`, and `main()` computed
//
//   const hasOnlyBudgetIssues = !hasRealFailures && results.some(
//     (r) => r.status === "budget_exceeded" || r.status === "max_turns");
//   process.exit(hasRealFailures ? 1 : hasOnlyBudgetIssues ? 2 : 0);
//
// with the workflow annotating exit 2 as "no real failures". Suite 078 had 115 cases and a
// 100-turn cap, so it truncated at ~16 cases, landed in `max_turns`, and reported as
// not-failing. A suite that covered 14% of its cases read as fine.
//
// Run: `npx tsx --test scripts/unit/suite-status-vocab.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  exitCodeFor,
  isNotAttempted,
  isTruncated,
  statusFromSdkSubtype,
  NOT_ATTEMPTED_STATUSES,
  TRUNCATED_STATUSES,
  type SuiteStatus,
} from "../../ci/lib/suite-caps.ts";

// ---- the load-bearing rule ---------------------------------------------------------

test("a truncated suite can NEVER produce exit 0", () => {
  for (const status of TRUNCATED_STATUSES) {
    assert.notEqual(
      exitCodeFor(["success", status]),
      0,
      `${status} alongside a pass must not read as green`,
    );
    assert.equal(exitCodeFor(["success", status]), 2, `${status} should exit 2`);
  }
});

test("a deferred suite can NEVER produce exit 0", () => {
  for (const status of NOT_ATTEMPTED_STATUSES) {
    assert.notEqual(exitCodeFor(["success", status]), 0);
    assert.equal(exitCodeFor(["success", status]), 2);
  }
});

test("an all-success run is the ONLY way to exit 0", () => {
  assert.equal(exitCodeFor(["success", "success", "success"]), 0);
  assert.equal(exitCodeFor([]), 0, "an empty selection is vacuously green");

  const every: SuiteStatus[] = [
    "fail",
    "blocked",
    "truncated_turns",
    "truncated_budget",
    "timeout",
    "deferred",
    "error",
  ];
  for (const status of every) {
    assert.notEqual(exitCodeFor(["success", status]), 0, `${status} must not exit 0`);
  }
});

// ---- precedence --------------------------------------------------------------------

test("a real failure outranks truncation, blocking and deferral", () => {
  assert.equal(exitCodeFor(["fail", "timeout", "blocked", "deferred"]), 1);
  assert.equal(exitCodeFor(["error", "timeout", "blocked", "deferred"]), 1);
});

test("blocking outranks truncation (infra first, then coverage)", () => {
  assert.equal(exitCodeFor(["blocked", "timeout"]), 3);
  assert.equal(exitCodeFor(["blocked", "deferred"]), 3);
});

test("classifier helpers agree with the exit code", () => {
  assert.ok(isTruncated("truncated_turns"));
  assert.ok(isTruncated("truncated_budget"));
  assert.ok(isTruncated("timeout"));
  assert.ok(!isTruncated("success"));
  assert.ok(!isTruncated("fail"));
  assert.ok(isNotAttempted("deferred"));
  assert.ok(!isNotAttempted("blocked"), "blocked means it WAS attempted");
});

// ---- SDK subtype mapping -----------------------------------------------------------

test("SDK cut-offs map to truncation, not to error", () => {
  assert.equal(statusFromSdkSubtype("success"), "success");
  assert.equal(statusFromSdkSubtype("error_max_turns"), "truncated_turns");
  assert.equal(statusFromSdkSubtype("error_max_budget_usd"), "truncated_budget");
});

test("an unrecognised SDK subtype degrades to error, never to success", () => {
  for (const subtype of ["", "something_new", "error_during_execution"]) {
    const status = statusFromSdkSubtype(subtype);
    assert.equal(status, "error", `${subtype} should be an error`);
    assert.notEqual(status, "success", "an unknown outcome must never read as a pass");
  }
});
