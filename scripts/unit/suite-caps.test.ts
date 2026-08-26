// Unit tests for ci/lib/suite-caps.ts — the DERIVED per-suite execution caps.
//
// These assert against the REAL config/test-suites.json, not a fixture. The whole point of
// the module is that the old global constants were arithmetically wrong for the actual
// corpus, so a fixture would let the bug back in the moment the manifest changed.
//
// Run: `npx tsx --test scripts/unit/suite-caps.test.ts` / `npm test`.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  budgetFor,
  caseCountOf,
  globalBudgetFor,
  maxTurnsFor,
  minutesOf,
  timeoutMsFor,
  SETUP_TURNS,
  TURNS_PER_CASE,
  TURNS_MIN,
  TURNS_MAX,
  TIMEOUT_MIN_MINUTES,
  TIMEOUT_MAX_MINUTES,
} from "../../ci/lib/suite-caps.ts";

interface ManifestSuite {
  id: string;
  testCount: number;
  estimatedMinutes: number;
}

const manifest = JSON.parse(readFileSync("config/test-suites.json", "utf-8")) as {
  suites: ManifestSuite[];
  selections: Record<string, { all?: true; include?: string[]; exclude?: string[] }>;
};

function suite(id: string): ManifestSuite {
  const found = manifest.suites.find((s) => s.id === id);
  assert.ok(found, `manifest is missing suite ${id} — update this test, do not delete it`);
  return found;
}

/** Resolve a simple `{all,exclude}` / `{include}` selection. */
function selection(name: string): ManifestSuite[] {
  const rule = manifest.selections[name];
  assert.ok(rule, `manifest is missing selection "${name}"`);
  if (rule.include) return rule.include.map((id) => suite(id));
  const excluded = new Set(rule.exclude ?? []);
  return manifest.suites.filter((s) => !excluded.has(s.id));
}

// ---- suite 078: the suite every old default got wrong -------------------------------
//
// 115 cases, 83 estimated minutes. Under the old constants it got 100 turns (fewer than it
// has cases) and a 10-minute timeout (12% of its estimate), and reported the resulting
// truncation as "not a real failure".

// These two were originally pinned to suite 078 (115 cases / 83 min). 078 has since been
// split into four dependency-closed siblings, and the pinned numbers failed — correctly,
// as manifest-drift guards. They are now aimed at whatever the corpus's heaviest suite
// actually IS, derived from the manifest rather than transcribed, so the worked example
// tracks the corpus instead of dating it. The historical numbers stay in the comment
// above: 100 turns for a 115-case suite, and 10 minutes for an 83-minute one.

/** The suite with the most cases — the one a turn cap fails first. */
function heaviestByCases() {
  return manifest.suites.reduce((a, b) => (b.testCount > a.testCount ? b : a));
}

/** The suite with the longest estimate — the one a timeout ceiling kills first. */
function heaviestByMinutes() {
  return manifest.suites.reduce((a, b) => (minutesOf(b) > minutesOf(a) ? b : a));
}

test("the heaviest suite's turn cap exceeds its case count instead of falling short of it", () => {
  const s = heaviestByCases();
  const turns = maxTurnsFor(s);
  assert.ok(s.testCount >= 100, `expected a triple-digit suite to exercise this, got ${s.testCount}`);
  assert.equal(turns, SETUP_TURNS + s.testCount * TURNS_PER_CASE);
  assert.ok(turns > s.testCount, `${s.id}: a turn cap below the case count guarantees truncation`);
  assert.ok(turns > 100, `${s.id}: must beat the old global MAX_TURNS=100`);
});

test("the longest suite's timeout exceeds its own estimate instead of cutting it at 12%", () => {
  const s = heaviestByMinutes();
  const minutes = timeoutMsFor(s) / 60_000;
  assert.ok(minutesOf(s) >= 60, `expected a long suite to exercise this, got ${minutesOf(s)}`);
  assert.ok(minutes > minutesOf(s), `${s.id}: a timeout below the estimate is a guaranteed kill`);
  assert.ok(minutes > 10, `${s.id}: must beat the old global 10-minute SUITE_TIMEOUT_MS`);
});

// The invariant, checked across the WHOLE manifest rather than the suites we thought of.
// This is what caught the first draft's flat 180-minute ceiling, which would have killed
// suite 050m (estimated 245 min) before its own expected duration — recreating the exact
// defect this module fixes.
test("EVERY manifest suite gets a timeout strictly greater than its own estimate", () => {
  const offenders = manifest.suites
    .map((s) => ({ id: s.id, estimate: minutesOf(s), timeout: timeoutMsFor(s) / 60_000 }))
    .filter((s) => s.timeout <= s.estimate);
  assert.deepEqual(
    offenders,
    [],
    `these suites would be killed before their estimate: ${offenders
      .map((o) => `${o.id} (${o.timeout} <= ${o.estimate})`)
      .join(", ")}`,
  );
});

test("EVERY manifest suite gets more turns than it has cases", () => {
  const offenders = manifest.suites
    .filter((s) => s.testCount > 0)
    .map((s) => ({ id: s.id, cases: s.testCount, turns: maxTurnsFor(s) }))
    .filter((s) => s.turns <= s.cases);
  assert.deepEqual(
    offenders,
    [],
    `these suites cannot reach their last case: ${offenders
      .map((o) => `${o.id} (${o.turns} turns for ${o.cases} cases)`)
      .join(", ")}`,
  );
});

// ---- `full`: the selection that could never finish under its own budget -------------

test("full: derived global budget covers the selection, unlike the old $80 default", () => {
  const suites = selection("full");
  const minutes = suites.reduce((sum, s) => sum + minutesOf(s), 0);
  assert.equal(suites.length, 119, "manifest drift: full's suite count changed");
  assert.equal(minutes, 2775, "manifest drift: full's total estimate changed");

  const budget = globalBudgetFor(suites);
  assert.ok(budget >= 140, `expected >= $140, got $${budget.toFixed(2)}`);
  assert.ok(budget > 80, "must beat the workflow's old MAX_BUDGET_USD=80, which always truncated");
});

test("smoke: derived budget is proportionally small, not a flat floor", () => {
  const smoke = globalBudgetFor(selection("smoke"));
  const full = globalBudgetFor(selection("full"));
  assert.ok(smoke > 0);
  assert.ok(smoke < full / 10, "a 2-suite selection must not be budgeted like the whole corpus");
});

// ---- clamps and degenerate inputs --------------------------------------------------

test("turn cap clamps at both ends", () => {
  assert.equal(maxTurnsFor({ testCount: 0 }), TURNS_MIN, "a zero-case suite still gets the floor");
  assert.equal(maxTurnsFor({}), TURNS_MIN, "a suite with no testCount gets the floor, not NaN");
  assert.equal(maxTurnsFor({ testCount: 100_000 }), TURNS_MAX, "an absurd count is capped");
});

test("timeout clamps at the floor, and the ceiling never undercuts the estimate", () => {
  assert.equal(timeoutMsFor({}) / 60_000, TIMEOUT_MIN_MINUTES, "no estimate => floor, not zero");
  assert.equal(timeoutMsFor({ estimatedMinutes: 1 }) / 60_000, TIMEOUT_MIN_MINUTES);
  // A suite far above the normal ceiling still gets more than its estimate, not the ceiling.
  const huge = timeoutMsFor({ estimatedMinutes: 10_000 }) / 60_000;
  assert.ok(huge > 10_000, `ceiling must yield to the estimate, got ${huge}`);
  // A suite below the ceiling is capped by it.
  assert.equal(timeoutMsFor({ estimatedMinutes: 100 }) / 60_000, TIMEOUT_MAX_MINUTES);
});

test("degenerate manifest values never produce NaN", () => {
  for (const bad of [
    { testCount: Number.NaN, estimatedMinutes: Number.NaN },
    { testCount: -5, estimatedMinutes: -5 },
    { testCount: Number.POSITIVE_INFINITY, estimatedMinutes: Number.POSITIVE_INFINITY },
  ]) {
    assert.ok(Number.isFinite(maxTurnsFor(bad)), `maxTurnsFor(${JSON.stringify(bad)}) not finite`);
    assert.ok(Number.isFinite(timeoutMsFor(bad)), `timeoutMsFor(${JSON.stringify(bad)}) not finite`);
    assert.ok(Number.isFinite(minutesOf(bad)));
    assert.ok(Number.isFinite(caseCountOf(bad)));
  }
});

// ---- per-suite budget --------------------------------------------------------------

test("budgetFor: takes the larger of own-size and proportional share", () => {
  const small = { estimatedMinutes: 10 };
  // Plenty remaining => the proportional share dominates.
  const rich = budgetFor(small, 100, 20);
  assert.ok(rich > 10 * 0.04 * 1.25, "with head-room the share should win");
  // Nothing remaining => falls back to what the suite itself implies, never 0.
  const poor = budgetFor(small, 0, 20);
  assert.ok(poor > 0, "a suite must never be dispatched with a zero budget");
});

test("budgetFor: remainingMinutes of 0 does not divide by zero", () => {
  const b = budgetFor({ estimatedMinutes: 10 }, 50, 0);
  assert.ok(Number.isFinite(b) && b > 0, `expected a finite positive budget, got ${b}`);
});

test("budgetFor: a bigger suite is never budgeted below a smaller one", () => {
  const remaining = 100;
  const totalMinutes = 200;
  const big = budgetFor({ estimatedMinutes: 100 }, remaining, totalMinutes);
  const small = budgetFor({ estimatedMinutes: 5 }, remaining, totalMinutes);
  assert.ok(big > small, "budget must scale with the work");
});
