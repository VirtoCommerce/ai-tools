// Unit tests for scripts/regression/compute-metrics.ts — the gate-verdict core.
// Focus: the `feature` gate (Feature Release Gate, quality-gates.md §1a) added for
// /qa-test Step 5h, its threshold boundaries, and the gate-name guard. Pure functions
// only (no history file, no CLI, no side effects — main() is CLI-guarded).
// Run: `npx tsx --test scripts/unit/compute-metrics-gate.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  evaluateGate,
  isGateType,
  GATE_TYPES,
  SCOPE_REQUIRED_GATES,
  MAX_UNTRIAGED_BLOCKED_PCT,
  GATE_PASS_FLOOR,
  RELEASE_COND_FLOOR,
  parseArgs,
} from "../regression/compute-metrics.ts";

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

// ---- feature gate: ONE pass-rate floor, no band -----------------------------
// Was GO >=95 / CONDITIONAL 93-95 / NO-GO <93. Lowered to a single floor of 80 on
// 2026-09-02 by operator decision (rationale + the recorded counter-argument live on
// GATE_PASS_FLOOR). The tests read the constant, never a literal, so moving the floor again
// does not require editing them.

test("feature: exactly at the floor ⇒ GO (the floor is inclusive)", () => {
  const g = evaluateGate("feature", aggAt(GATE_PASS_FLOOR.feature), 0, 0);
  assert.equal(g.verdict, "GO");
  assert.deepEqual(g.reasons, []);
});

test("feature: a hair below the floor ⇒ NO-GO, and the reason quotes the constant", () => {
  const g = evaluateGate("feature", aggAt(GATE_PASS_FLOOR.feature - 0.1), 0, 0);
  assert.equal(g.verdict, "NO-GO");
  assert.match(g.reasons.join(" "), new RegExp(`${GATE_PASS_FLOOR.feature}% floor`));
});

test("feature: there is no pass-rate conditional band any more", () => {
  // Every rate at or above the floor is a clean GO; only a DECLARED P1 deferral can produce
  // CONDITIONAL GO. 94.9% used to land in the old 93-95 band.
  for (const pr of [80, 85, 90, 94.9, 99, 100]) {
    const g = evaluateGate("feature", aggAt(pr), 0, 0);
    assert.equal(g.verdict, "GO", `${pr}% should be a clean GO`);
    assert.deepEqual(g.reasons, [], `${pr}% should carry no conditions`);
  }
});

test("feature: the floor is 80 today — a deliberate, reviewed value", () => {
  // Pinned so the change is visible in a diff rather than drifting quietly. If this fails,
  // the floor moved: confirm it was intended and update this line with the reason.
  assert.equal(GATE_PASS_FLOOR.feature, 80);
  assert.equal(GATE_PASS_FLOOR.sprint, 80);
  assert.equal(GATE_PASS_FLOOR.hotfix, 80);
  // Untouched: smoke is binary/P0-only, and a release must not sit below the sprint bar it
  // aggregates.
  assert.equal(GATE_PASS_FLOOR.smoke, 100);
  assert.equal(GATE_PASS_FLOOR.release, 98);
  assert.equal(RELEASE_COND_FLOOR, 96);
});

// ---- feature gate: an open P1/High BLOCKS; only a DECLARED deferral downgrades ----
// Policy change (quality-gates.md §1a): an open High used to buy an automatic
// CONDITIONAL GO, i.e. "no critical/high bugs" was enforced for Critical only. It now
// blocks, and the deferral has to be asserted rather than assumed.

test("feature: 100% but an open undeferred P1 ⇒ NO-GO", () => {
  const g = evaluateGate("feature", aggAt(100), 0, 2);
  assert.equal(g.verdict, "NO-GO");
  assert.match(g.reasons.join(" "), /open in-scope P1\/High/);
});

test("feature: every P1 declared deferred ⇒ CONDITIONAL GO, never a clean GO", () => {
  const g = evaluateGate("feature", aggAt(100), 0, 2, { p1Deferred: 2 });
  assert.equal(g.verdict, "CONDITIONAL GO");
  assert.match(g.reasons.join(" "), /deferred P1\/High/);
});

test("feature: a partial deferral still leaves the remainder blocking", () => {
  const g = evaluateGate("feature", aggAt(100), 0, 3, { p1Deferred: 1 });
  assert.equal(g.verdict, "NO-GO");
  assert.match(g.reasons.join(" "), /^2 open in-scope P1/);
});

test("feature: deferring more than are open cannot go negative into a GO", () => {
  const g = evaluateGate("feature", aggAt(100), 0, 1, { p1Deferred: 5 });
  assert.equal(g.verdict, "CONDITIONAL GO");
});

test("feature: P0 outranks a sub-floor rate (one reason, NO-GO)", () => {
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

test("smoke is untouched by the floor change — still binary at 100%", () => {
  assert.equal(evaluateGate("smoke", aggAt(100), 0, 0).verdict, "PASS");
  assert.equal(evaluateGate("smoke", aggAt(99.9), 0, 0).verdict, "FAIL");
});

test("sprint / hotfix are a single 80 floor: at it APPROVED, below it BLOCKED", () => {
  for (const g of ["sprint", "hotfix"] as const) {
    assert.equal(evaluateGate(g, aggAt(GATE_PASS_FLOOR[g]), 0, 0).verdict, "APPROVED", g);
    // 94% used to be APPROVED WITH CONDITIONS at sprint; with no band it is a clean APPROVED.
    assert.equal(evaluateGate(g, aggAt(94), 0, 0).verdict, "APPROVED", g);
    assert.equal(evaluateGate(g, aggAt(GATE_PASS_FLOOR[g] - 0.1), 0, 0).verdict, "BLOCKED", g);
  }
});

test("release keeps its 98/96 band — the one gate the 80% floor does not touch", () => {
  assert.equal(evaluateGate("release", aggAt(98), 0, 0).verdict, "APPROVED");
  assert.equal(evaluateGate("release", aggAt(97), 0, 0).verdict, "APPROVED WITH CONDITIONS");
  assert.equal(evaluateGate("release", aggAt(RELEASE_COND_FLOOR - 0.1), 0, 0).verdict, "BLOCKED");
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

// ---- completeness: "no serious blockers" ------------------------------------
// The criterion exists because `executed = passed + failed` puts BLOCKED OUTSIDE the
// pass-rate denominator, so the rate RISES as blockers accumulate. Before it, no gate
// below smoke read the blocked count at all.

test("feature: blocked share above the ceiling ⇒ CANNOT EVALUATE, not NO-GO", () => {
  // 1000 executed at 100% + 300 blocked = 23.1% of 1300 planned.
  const g = evaluateGate("feature", aggAt(100, { blocked: 300 }), 0, 0);
  assert.equal(g.verdict, "CANNOT EVALUATE");
  assert.match(g.reasons.join(" "), /BLOCKED and untriaged/);
  // The pass rate it refuses to certify is still reported, both bases.
  assert.equal(g.passRate, 100);
  assert.equal(g.plannedPassRate, 76.92);
});

test("feature: triaged blockers are discounted, so the same run evaluates", () => {
  const g = evaluateGate("feature", aggAt(100, { blocked: 300 }), 0, 0, { blockedTriaged: 300 });
  assert.equal(g.verdict, "GO");
  assert.equal(g.blockedShare, 0);
});

test("completeness: the ceiling is exclusive — exactly at it still evaluates", () => {
  // 900 blocked of 9000 planned = exactly 10%.
  const a = aggregate([
    { runId: "R", date: "2026-08-03", suiteId: "028", total: 9000, passed: 8100, failed: 0, blocked: 900, skipped: 0 },
  ]);
  assert.equal(a.blockedRate, MAX_UNTRIAGED_BLOCKED_PCT);
  assert.equal(evaluateGate("feature", a, 0, 0).verdict, "GO");
});

test("completeness: SKIPPED is reported but never gated (Manual/Deprecated lanes)", () => {
  // An explicit Manual/Deprecated lane is an intentional non-execution, not a blocker;
  // gating on it would leave the corpus's 838 Manual cases permanently unevaluable.
  const g = evaluateGate("feature", aggAt(100, { skipped: 900 }), 0, 0);
  assert.equal(g.verdict, "GO");
  assert.equal(g.plannedPassRate, 52.63); // and the planned basis says so out loud
});

test("an open P0 outranks an unevaluable run — it needs no complete run to decide", () => {
  const g = evaluateGate("feature", aggAt(100, { blocked: 900 }), 1, 0);
  assert.equal(g.verdict, "NO-GO");
  assert.match(g.reasons.join(" "), /P0\/Critical/);
});

test("nothing executed ⇒ CANNOT EVALUATE at every gate (not a 0% pass rate)", () => {
  const a = aggregate([
    { runId: "R", date: "2026-08-03", suiteId: "028", total: 40, passed: 0, failed: 0, blocked: 40, skipped: 0 },
  ]);
  for (const g of GATE_TYPES)
    assert.equal(evaluateGate(g, a, 0, 0).verdict, "CANNOT EVALUATE", `gate ${g}`);
});

test("smoke keeps its own stricter blocked===0 rule rather than the 10% ceiling", () => {
  // One blocked case in 1001 planned is 0.1% — under the ceiling, but smoke demands zero.
  const g = evaluateGate("smoke", aggAt(100, { blocked: 1 }), 0, 0);
  assert.equal(g.verdict, "FAIL");
  assert.match(g.reasons.join(" "), /must be 0/);
});

// ---- P1 policy at the other gates -------------------------------------------

test("sprint: an open undeferred P1 ⇒ BLOCKED (was: tolerated below 3)", () => {
  const g = evaluateGate("sprint", aggAt(100), 0, 1);
  assert.equal(g.verdict, "BLOCKED");
  assert.match(g.reasons.join(" "), /> 0 tolerated/);
});

test("sprint: a declared deferral caps at APPROVED WITH CONDITIONS", () => {
  const g = evaluateGate("sprint", aggAt(100), 0, 1, { p1Deferred: 1 });
  assert.equal(g.verdict, "APPROVED WITH CONDITIONS");
});

test("release: keeps its <=2-with-workaround allowance, as CONDITIONS not APPROVED", () => {
  assert.equal(evaluateGate("release", aggAt(100), 0, 2).verdict, "APPROVED WITH CONDITIONS");
  assert.equal(evaluateGate("release", aggAt(100), 0, 3).verdict, "BLOCKED");
  assert.equal(evaluateGate("release", aggAt(100), 0, 0).verdict, "APPROVED");
});

test("hotfix: an open P1 in the hotfix area ⇒ BLOCKED (§8 requires 0)", () => {
  // The p1 argument was previously ignored on this branch, so this read APPROVED.
  const g = evaluateGate("hotfix", aggAt(100), 0, 1);
  assert.equal(g.verdict, "BLOCKED");
  assert.match(g.reasons.join(" "), /hotfix area/);
});

// ---- both pass-rate bases are always carried on the result ------------------

test("aggregate reports the planned basis beside the executed one", () => {
  // The shape of REG-2026-07-13-1247: 26P / 0F / 32B / 12S of 71 planned.
  const a = aggregate([
    { runId: "R", date: "2026-07-13", suiteId: "050", total: 71, passed: 26, failed: 0, blocked: 32, skipped: 12 },
  ]);
  assert.equal(a.passRate, 100); // executed basis — 26 of 26
  assert.equal(a.plannedPassRate, 36.62); // planned basis — the number that settles it
  assert.equal(a.executedShare, 36.62);
});

// ---- operator inputs are clamped to what actually exists --------------------
// Both flags are ASSERTIONS by the operator, so a stale or copy-pasted one must not be able
// to change a verdict it has no bearing on.

test("a deferral declared against ZERO open P1s leaves a clean GO", () => {
  // Unclamped this returned CONDITIONAL GO — a conditional verdict about bugs that do not
  // exist — because the branch tested `p1Deferred > 0` rather than "a real P1 was deferred".
  const g = evaluateGate("feature", aggAt(100), 0, 0, { p1Deferred: 2 });
  assert.equal(g.verdict, "GO");
  assert.deepEqual(g.reasons, []);
});

test("the same over-declaration cannot downgrade sprint or release either", () => {
  assert.equal(evaluateGate("sprint", aggAt(100), 0, 0, { p1Deferred: 3 }).verdict, "APPROVED");
  assert.equal(evaluateGate("release", aggAt(100), 0, 0, { p1Deferred: 3 }).verdict, "APPROVED");
});

test("a deferral is clamped, never inverted — 1 open + 5 declared is still 1 deferred", () => {
  const g = evaluateGate("feature", aggAt(100), 0, 1, { p1Deferred: 5 });
  assert.equal(g.verdict, "CONDITIONAL GO");
  assert.match(g.reasons.join(" "), /^1 deferred P1\/High/);
});

test("triaged blockers declared against a run with none change nothing", () => {
  const g = evaluateGate("feature", aggAt(100), 0, 0, { blockedTriaged: 999 });
  assert.equal(g.verdict, "GO");
  assert.equal(g.blockedShare, 0);
});

test("a negative or garbage operator input degrades to 0, never to a free pass", () => {
  // evaluateGate is also called programmatically, so it cannot rely on the CLI guard.
  for (const bad of [-5, NaN, undefined] as const) {
    const g = evaluateGate("feature", aggAt(100), 0, 1, { p1Deferred: bad as number });
    assert.equal(g.verdict, "NO-GO", `p1Deferred=${bad} must not defer anything`);
  }
});

// ---- CLI: a numeric flag that cannot be read is an ERROR, never 0 -----------
// `Number(get("--p0-bugs") ?? 0)` returned NaN for `--p0-bugs --json` and for a typo, and every
// downstream test is `> 0` (false for NaN) — so the count silently became zero and a P0 NO-GO
// printed as a GO. Failing in the direction that looks better than the evidence is the worst
// available default, which is why this is now exercised.

test("parseArgs: a numeric flag eating the NEXT FLAG as its value is an error", () => {
  const a = parseArgs(["--gate", "feature", "--p0-bugs", "--json"]);
  assert.equal(a.errors.length, 1);
  assert.match(a.errors[0], /--p0-bugs requires a value/);
  assert.match(a.errors[0], /--json/);
});

test("parseArgs: a numeric flag at the end of the argv is an error", () => {
  const a = parseArgs(["--gate", "feature", "--p1-bugs"]);
  assert.equal(a.errors.length, 1);
  assert.match(a.errors[0], /end of arguments/);
});

test("parseArgs: a non-numeric, fractional or negative value is an error", () => {
  for (const bad of ["one", "3.5", "-1", ""])
    assert.equal(parseArgs(["--p0-bugs", bad]).errors.length, 1, `"${bad}" must be rejected`);
});

test("parseArgs: valid counts parse, absent flags are 0, and neither errors", () => {
  const a = parseArgs(["--p0-bugs", "0", "--p1-bugs", "3", "--p1-deferred", "2"]);
  assert.deepEqual(a.errors, []);
  assert.equal(a.p0Bugs, 0);
  assert.equal(a.p1Bugs, 3);
  assert.equal(a.p1Deferred, 2);
  assert.equal(a.blockedTriaged, 0); // absent
});

test("parseArgs: every numeric flag is guarded, not just the two oldest", () => {
  for (const flag of ["--p0-bugs", "--p1-bugs", "--p1-deferred", "--blocked-triaged"])
    assert.equal(parseArgs([flag, "nope"]).errors.length, 1, `${flag} is unguarded`);
});

