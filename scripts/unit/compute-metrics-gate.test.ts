// Unit tests for scripts/regression/compute-metrics.ts — the gate-verdict core.
// Focus: the `feature` gate (Feature Release Gate, quality-gates.md §1a) added for
// /qa-test Step 5h, its threshold boundaries, and the gate-name guard. Pure functions
// only (no history file, no CLI, no side effects — main() is CLI-guarded).
// Run: `npx tsx --test scripts/unit/compute-metrics-gate.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { aggregate, evaluateGate, isGateType, GATE_TYPES, SCOPE_REQUIRED_GATES } from "../regression/compute-metrics.ts";

/** Aggregate shaped from a target pass rate, so the tests read as percentages. */
function aggAt(passRate: number, opts: { blocked?: number; skipped?: number } = {}) {
  const executed = 1000;
  const passed = Math.round((passRate / 100) * executed);
  return aggregate([
    {
      runId: "REG-TEST",
      date: "2026-08-03",
      suiteId: "028",
      total: executed + (opts.blocked ?? 0) + (opts.skipped ?? 0),
      passed,
      failed: executed - passed,
      blocked: opts.blocked ?? 0,
      skipped: opts.skipped ?? 0,
    },
  ]);
}

// ---- feature gate: P0 is non-negotiable --------------------------------------

test("feature: any open in-scope P0 ⇒ NO-GO even at a perfect pass rate", () => {
  const g = evaluateGate("feature", aggAt(100), 1, 0);
  assert.equal(g.verdict, "NO-GO");
  assert.match(g.reasons.join(" "), /P0/);
});

// ---- feature gate: pass-rate boundaries (93 floor / 95 GO) -------------------

test("feature: 95% with no P1 ⇒ GO (floor is inclusive)", () => {
  const g = evaluateGate("feature", aggAt(95), 0, 0);
  assert.equal(g.verdict, "GO");
  assert.deepEqual(g.reasons, []);
});

test("feature: 94.9% ⇒ CONDITIONAL GO (in the 93-95 band)", () => {
  const g = evaluateGate("feature", aggAt(94.9), 0, 0);
  assert.equal(g.verdict, "CONDITIONAL GO");
  assert.match(g.reasons.join(" "), /conditional band/);
});

test("feature: exactly 93% ⇒ CONDITIONAL GO, not NO-GO (floor is inclusive)", () => {
  const g = evaluateGate("feature", aggAt(93), 0, 0);
  assert.equal(g.verdict, "CONDITIONAL GO");
});

test("feature: 92.9% ⇒ NO-GO (below the floor)", () => {
  const g = evaluateGate("feature", aggAt(92.9), 0, 0);
  assert.equal(g.verdict, "NO-GO");
  assert.match(g.reasons.join(" "), /93% floor/);
});

// ---- feature gate: P1 downgrades a passing rate ------------------------------

test("feature: 100% but an open P1 ⇒ CONDITIONAL GO (workaround + risk acceptance)", () => {
  const g = evaluateGate("feature", aggAt(100), 0, 2);
  assert.equal(g.verdict, "CONDITIONAL GO");
  assert.match(g.reasons.join(" "), /P1/);
});

test("feature: P0 outranks the conditional band (one reason, NO-GO)", () => {
  const g = evaluateGate("feature", aggAt(94), 1, 3);
  assert.equal(g.verdict, "NO-GO");
});

// ---- the feature verdict vocabulary must stay disjoint from the others -------

test("feature verdicts are GO/CONDITIONAL GO/NO-GO — never PASS/APPROVED", () => {
  for (const [pr, p0, p1] of [
    [100, 0, 0],
    [94, 0, 0],
    [90, 0, 0],
    [100, 1, 0],
  ] as const) {
    const v = evaluateGate("feature", aggAt(pr), p0, p1).verdict;
    assert.ok(["GO", "CONDITIONAL GO", "NO-GO"].includes(v), `unexpected feature verdict ${v}`);
  }
});

test("adding `feature` did not shift the sprint/release/smoke/hotfix verdicts", () => {
  assert.equal(evaluateGate("smoke", aggAt(100), 0, 0).verdict, "PASS");
  assert.equal(evaluateGate("smoke", aggAt(99.9), 0, 0).verdict, "FAIL");
  assert.equal(evaluateGate("hotfix", aggAt(95), 0, 0).verdict, "APPROVED");
  assert.equal(evaluateGate("sprint", aggAt(95), 0, 0).verdict, "APPROVED");
  assert.equal(evaluateGate("sprint", aggAt(94), 0, 0).verdict, "APPROVED WITH CONDITIONS");
  assert.equal(evaluateGate("release", aggAt(97), 0, 0).verdict, "APPROVED WITH CONDITIONS");
  assert.equal(evaluateGate("release", aggAt(98), 0, 0).verdict, "APPROVED");
});

// ---- gate-name guard: a typo must not evaluate as sprint ---------------------

test("isGateType accepts exactly the five gates", () => {
  assert.deepEqual([...GATE_TYPES], ["smoke", "sprint", "release", "hotfix", "feature"]);
  for (const g of GATE_TYPES) assert.equal(isGateType(g), true);
});

test("isGateType rejects a near-miss typo (the `featrue` → sprint-thresholds bug)", () => {
  for (const bad of ["featrue", "Feature", "FEATURE", "features", "", "release "])
    assert.equal(isGateType(bad), false, `"${bad}" must not be accepted as a gate`);
});

test("feature is scope-required so it cannot be computed over the rolling history", () => {
  assert.ok(SCOPE_REQUIRED_GATES.includes("feature"));
  // The other gates are legitimately history-wide (or scoped by the caller's own selection).
  for (const g of ["smoke", "sprint", "release", "hotfix"] as const)
    assert.equal(SCOPE_REQUIRED_GATES.includes(g), false);
});

// ---- aggregate: an empty set must not masquerade as 0% ------------------------

test("aggregate over zero entries reports 0 runs — callers must treat it as not-evaluated", () => {
  const a = aggregate([]);
  assert.equal(a.runs, 0);
  assert.equal(a.executed, 0);
  // passRate is 0 by construction, which is exactly why main() exits 2 on an empty
  // scope instead of feeding this into a gate (an absent run is not a 0% run).
  assert.equal(a.passRate, 0);
});
