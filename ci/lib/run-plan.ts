// What a regression run WOULD do, computed before anything is dispatched.
//
// Two reasons this is its own pure module rather than inline logging in `main()`:
//
//  1. It makes the run answerable without spending anything. `full` is ~$144 and ~15 hours;
//     "does every selected suite have an executor, which lane does it land in, and what caps
//     will it get" is a question an operator needs answered BEFORE that, not discovered during
//     it. `--dry-run` prints exactly this and exits.
//  2. It is the only part of the new execution layer that can be verified with no
//     ANTHROPIC_API_KEY, no credentials and no reachable environment — so it is what a unit
//     test and a CI-less checkout can actually assert.
//
// The same plan is printed by a real run, so the dry-run output and the live log cannot
// disagree about what was intended.

import {
  budgetFor,
  globalBudgetFor,
  maxTurnsFor,
  minutesOf,
  timeoutMsFor,
  type SuiteCapsInput,
} from "./suite-caps.ts";
import {
  orderLpt,
  simulateBatchBarrierMakespan,
  simulateMakespan,
  type LaneKind,
} from "./scheduler.ts";

/** What the planner needs to know about one selected suite. */
export interface PlannableSuite extends SuiteCapsInput {
  id: string;
  description: string;
  lane: LaneKind;
  /** Browser servers this suite must not be placed on (derived `clickDriven`). */
  browserDenyList?: readonly string[];
  preferredBrowser?: string;
}

export interface PlannedSuite {
  id: string;
  description: string;
  lane: LaneKind;
  cases: number;
  estimatedMinutes: number;
  maxTurns: number;
  timeoutMinutes: number;
  /** Budget this suite would be reserved if it were dispatched first. Indicative only —
   *  the live ledger recomputes from what is actually left. */
  indicativeBudgetUsd: number;
  browserDenyList: readonly string[];
  preferredBrowser?: string;
}

export interface LanePlan {
  lane: LaneKind;
  concurrency: number;
  suites: PlannedSuite[];
  cases: number;
  estimatedMinutes: number;
  makespanMinutes: number;
}

export interface RunPlan {
  suites: PlannedSuite[];
  lanes: LanePlan[];
  totalSuites: number;
  totalCases: number;
  totalEstimatedMinutes: number;
  /** Longest lane — the run's wall-clock under continuous refill + LPT. */
  makespanMinutes: number;
  /** What the old fixed-batch barrier would have cost on the browser lane, for comparison. */
  browserBarrierMinutes: number;
  globalBudgetUsd: number;
  /** Suites whose derived timeout is not strictly greater than their own estimate, or whose
   *  turn cap does not exceed their case count. Should always be empty — a non-empty list means
   *  a cap would guarantee truncation, which is the defect the derived caps exist to remove. */
  capAnomalies: Array<{ id: string; problem: string }>;
}

export interface LaneConcurrency {
  browser: number;
  fastpath: number;
  deterministic: number;
}

/**
 * Build the plan. Pure: no I/O, no clock, no network — the same inputs always give the same
 * plan, which is what lets a unit test assert it against the real manifest.
 *
 * `budgetOverrideUsd` mirrors the MAX_BUDGET_USD override so the printed budget matches what
 * the run would actually use.
 */
export function buildRunPlan(
  suites: readonly PlannableSuite[],
  concurrency: LaneConcurrency,
  budgetOverrideUsd: number | null = null,
): RunPlan {
  const globalBudgetUsd = budgetOverrideUsd ?? globalBudgetFor(suites);
  const totalEstimatedMinutes = suites.reduce((sum, s) => sum + minutesOf(s), 0);

  const planned: PlannedSuite[] = suites.map((s) => ({
    id: s.id,
    description: s.description,
    lane: s.lane,
    cases: s.testCount ?? 0,
    estimatedMinutes: minutesOf(s),
    maxTurns: maxTurnsFor(s),
    timeoutMinutes: Math.round(timeoutMsFor(s) / 60_000),
    indicativeBudgetUsd:
      s.lane === "deterministic" ? 0 : budgetFor(s, globalBudgetUsd, totalEstimatedMinutes),
    browserDenyList: s.browserDenyList ?? [],
    preferredBrowser: s.preferredBrowser,
  }));

  const lanes: LanePlan[] = (["browser", "fastpath", "deterministic"] as LaneKind[]).map((lane) => {
    const laneSuites = planned.filter((s) => s.lane === lane);
    const c = concurrency[lane];
    return {
      lane,
      concurrency: c,
      suites: laneSuites,
      cases: laneSuites.reduce((sum, s) => sum + s.cases, 0),
      estimatedMinutes: laneSuites.reduce((sum, s) => sum + s.estimatedMinutes, 0),
      makespanMinutes: round2(simulateMakespan(orderLpt(laneSuites), c).makespanMinutes),
    };
  });

  const browserLane = lanes.find((l) => l.lane === "browser");

  // A cap that cannot let a suite finish is the defect the derived caps replaced, so the plan
  // reports it rather than leaving it to be discovered as a "failure" mid-run.
  const capAnomalies: Array<{ id: string; problem: string }> = [];
  for (const s of planned) {
    if (s.timeoutMinutes <= s.estimatedMinutes) {
      capAnomalies.push({
        id: s.id,
        problem: `timeout ${s.timeoutMinutes}m <= estimate ${s.estimatedMinutes}m — guaranteed kill`,
      });
    }
    if (s.cases > 0 && s.maxTurns <= s.cases) {
      capAnomalies.push({
        id: s.id,
        problem: `${s.maxTurns} turns for ${s.cases} cases — cannot reach the last case`,
      });
    }
  }

  return {
    suites: planned,
    lanes,
    totalSuites: planned.length,
    totalCases: planned.reduce((sum, s) => sum + s.cases, 0),
    totalEstimatedMinutes,
    makespanMinutes: round2(Math.max(0, ...lanes.map((l) => l.makespanMinutes))),
    browserBarrierMinutes: browserLane
      ? round2(simulateBatchBarrierMakespan(browserLane.suites, browserLane.concurrency))
      : 0,
    globalBudgetUsd: round2(globalBudgetUsd),
    capAnomalies,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function hm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/**
 * Render the plan for a human. Used by `--dry-run` and by the header of a real run, so the two
 * can never describe different intentions.
 *
 * `verbose` adds the per-suite cap table — worth reading before a `full` run, noise before a
 * two-suite smoke.
 */
export function formatRunPlan(plan: RunPlan, opts: { verbose?: boolean } = {}): string {
  const out: string[] = [];

  out.push(
    `Suites: ${plan.totalSuites} | Cases: ${plan.totalCases} | Estimated work: ${hm(plan.totalEstimatedMinutes)}`,
  );
  out.push(`Derived global budget: $${plan.globalBudgetUsd.toFixed(2)}`);
  out.push("");
  out.push("Lanes:");
  out.push("  lane            suites  cases  work      concurrency  makespan");
  for (const lane of plan.lanes) {
    if (lane.suites.length === 0) continue;
    out.push(
      `  ${lane.lane.padEnd(15)}${String(lane.suites.length).padStart(6)}${String(lane.cases).padStart(7)}  ` +
        `${hm(lane.estimatedMinutes).padEnd(9)} ${String(lane.concurrency).padStart(11)}  ${hm(lane.makespanMinutes)}`,
    );
  }

  const browser = plan.lanes.find((l) => l.lane === "browser");
  const offloaded = plan.lanes
    .filter((l) => l.lane !== "browser")
    .reduce((sum, l) => sum + l.cases, 0);
  out.push("");
  out.push(`Predicted wall clock: ${hm(plan.makespanMinutes)}`);
  if (browser && plan.browserBarrierMinutes > 0) {
    const saved = plan.browserBarrierMinutes - browser.makespanMinutes;
    const pct = plan.browserBarrierMinutes > 0 ? (100 * saved) / plan.browserBarrierMinutes : 0;
    out.push(
      `  browser lane ${hm(browser.makespanMinutes)} vs ${hm(plan.browserBarrierMinutes)} ` +
        `under the old fixed-batch barrier (${pct.toFixed(0)}% saved)`,
    );
  }
  if (offloaded > 0) {
    out.push(`  ${offloaded} cases run without a browser slot (fastpath + deterministic lanes)`);
  }

  if (plan.capAnomalies.length > 0) {
    out.push("");
    out.push(`CAP ANOMALIES (${plan.capAnomalies.length}) — these suites could not finish:`);
    for (const a of plan.capAnomalies) out.push(`  ${a.id}: ${a.problem}`);
  }

  if (opts.verbose) {
    out.push("");
    out.push("Per-suite caps:");
    out.push("  suite   lane           cases  est    turns  timeout  budget");
    for (const s of [...plan.suites].sort((a, b) => b.estimatedMinutes - a.estimatedMinutes)) {
      out.push(
        `  ${s.id.padEnd(8)}${s.lane.padEnd(15)}${String(s.cases).padStart(5)}` +
          `${String(s.estimatedMinutes).padStart(7)}${String(s.maxTurns).padStart(7)}` +
          `${String(s.timeoutMinutes + "m").padStart(9)}  $${s.indicativeBudgetUsd.toFixed(2)}`,
      );
    }
  }

  return out.join("\n");
}
