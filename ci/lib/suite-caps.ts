// Per-suite execution caps, DERIVED from manifest data instead of one global constant.
//
// Why this file exists. `ci/run-regression.ts` used three global env constants for every
// suite regardless of its size: MAX_TURNS=100, SUITE_TIMEOUT_MS=600000 (10 min), and a
// per-suite budget floor of $2.00. Against the real manifest that is arithmetically
// broken, and each default fails SILENTLY rather than loudly:
//
//   * suite 078 has 115 test cases. At ~6 turns/case, 100 turns covers ~16 of them. The
//     run then ends `error_max_turns`, which the old status vocabulary mapped to
//     `max_turns` -> counted as `blocked` -> `hasOnlyBudgetIssues` -> exit code 2,
//     annotated "not real failures". A suite that covered 14% of its cases reported as
//     non-failing. That is the worst reliability bug in the runner.
//   * suite 078 is estimated at 83 minutes and was killed at 10 — 12% of expected
//     duration.
//   * the $2.00 per-suite floor could not even pay for re-sending suite 027's inlined
//     CSV (282 KB ~ 78k tokens) across 100 turns.
//   * `full` needs ~$111 at the published $0.04/min but the workflow default was $80, so
//     `full` truncated around 55-70% of suites every time — it has never been able to
//     finish under its own default.
//
// Every function here is PURE so `scripts/unit/suite-caps.test.ts` can assert the real
// manifest's numbers. Env-var overrides stay in the caller (run-regression.ts): this
// module answers "what does this suite need", not "what did the operator force".

/**
 * The subset of a manifest suite these formulas read. `id` is optional because none of the
 * formulas need it — a caller holding only a suite's config (no id) can still derive caps.
 */
export interface SuiteCapsInput {
  id?: string;
  testCount?: number;
  estimatedMinutes?: number;
}

// --- Tunables (named, so the unit tests and the docs reference them, not magic numbers) ---

/** Fixed turns a suite spends before its first case: env check, sign-in, first navigate. */
export const SETUP_TURNS = 15;
/** Turns one case costs: snapshot, act, assert, screenshot-on-fail, write-result, slack. */
export const TURNS_PER_CASE = 6;
export const TURNS_MIN = 60;
export const TURNS_MAX = 1200;

/** A suite is allowed this multiple of its estimate before the timeout fires. */
export const TIMEOUT_SLACK = 2.5;
export const TIMEOUT_MIN_MINUTES = 15;
/**
 * Normal ceiling. It is NOT a hard cap: see `timeoutMsFor`. A fixed ceiling below a suite's
 * own estimate would recreate the very defect this module exists to fix — 050m is estimated
 * at 245 minutes, so a flat 180-minute ceiling would kill it before its expected duration.
 */
export const TIMEOUT_MAX_MINUTES = 180;
/**
 * When a suite's estimate exceeds the normal ceiling, the ceiling degrades to
 * `estimate * this` instead of truncating below the estimate. 1.25 keeps some slack while
 * still bounding a runaway.
 */
export const TIMEOUT_OVERRUN_FACTOR = 1.25;

/**
 * Published cost rate (docs/test-authoring.md: full ~= $60-80 for ~2775 min). This is an
 * ESTIMATE, not a measurement — `reports/regression/history.json` has never been
 * committed, so there is no recorded cost history to calibrate against. Recalibrate once
 * A4 lands history persistence; until then treat budget numbers as a model.
 */
export const USD_PER_MIN = 0.04;
/** Head-room on a single suite's derived budget. */
export const BUDGET_SLACK = 1.25;
/** Head-room on the whole selection's derived budget. */
export const GLOBAL_BUDGET_SLACK = 1.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Cases a suite declares; 0 when the manifest omits it (never NaN). */
export function caseCountOf(suite: SuiteCapsInput): number {
  const n = suite.testCount;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Minutes a suite is expected to take. Falls back to 1 rather than 0 so a suite missing
 * an estimate still gets a slot in the scheduler and a non-zero budget share instead of
 * silently sorting last and starving.
 */
export function minutesOf(suite: SuiteCapsInput): number {
  const n = suite.estimatedMinutes;
  return typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 1;
}

/** Turn cap scaled to the suite's case count. Suite 078: 15 + 115*6 = 705, not 100. */
export function maxTurnsFor(suite: SuiteCapsInput): number {
  return clamp(SETUP_TURNS + Math.ceil(caseCountOf(suite) * TURNS_PER_CASE), TURNS_MIN, TURNS_MAX);
}

/**
 * Timeout scaled to the suite's estimate. Suite 078: 83 min -> 180 min (the ceiling), not 10.
 *
 * INVARIANT: the result is always strictly greater than the suite's own estimate. A timeout
 * at or below the estimate is a guaranteed kill, which is what the old flat 10 minutes did to
 * every suite longer than that. So the ceiling is raised for a suite that outgrows it rather
 * than applied blindly — `scripts/unit/suite-caps.test.ts` asserts this across every suite in
 * the manifest, not just the ones we happened to think about.
 */
export function timeoutMsFor(suite: SuiteCapsInput): number {
  const estimate = minutesOf(suite);
  const upper = Math.max(TIMEOUT_MAX_MINUTES, estimate * TIMEOUT_OVERRUN_FACTOR);
  const minutes = clamp(estimate * TIMEOUT_SLACK, TIMEOUT_MIN_MINUTES, upper);
  return Math.round(minutes * 60_000);
}

/**
 * Per-suite budget: the larger of (a) what this suite's own size implies and (b) its
 * proportional share of what is left. (b) keeps a long tail from being starved by an
 * over-generous head; (a) keeps a small suite from being handed the whole remainder.
 *
 * `remainingMinutes` is the summed estimate of every suite still to run, INCLUDING this
 * one — pass 0/undefined and the proportional term is skipped rather than dividing by zero.
 */
export function budgetFor(
  suite: SuiteCapsInput,
  remainingUsd: number,
  remainingMinutes: number,
): number {
  const own = minutesOf(suite) * USD_PER_MIN * BUDGET_SLACK;
  const share =
    remainingMinutes > 0 && Number.isFinite(remainingMinutes)
      ? (remainingUsd * minutesOf(suite)) / remainingMinutes
      : 0;
  return Math.max(own, share);
}

/** What the whole selection needs. `full` (2775 min) -> ~$144, against a former $80 default. */
export function globalBudgetFor(suites: readonly SuiteCapsInput[]): number {
  const minutes = suites.reduce((sum, s) => sum + minutesOf(s), 0);
  return minutes * USD_PER_MIN * GLOBAL_BUDGET_SLACK;
}

// --- Status vocabulary -------------------------------------------------------------
//
// The old union was `"success" | "error" | "budget_exceeded" | "max_turns"`, and the exit
// logic folded budget_exceeded/max_turns into "not real failures" (exit 2). That is how a
// truncated run reads as green. Truncation is now its own class, and `exitCodeFor` makes
// it impossible for a truncated suite to produce exit 0.

export type SuiteStatus =
  | "success"
  | "fail"
  | "blocked"
  | "truncated_turns"
  | "truncated_budget"
  | "timeout"
  | "deferred"
  | "error";

/** Statuses that mean "the suite did not finish because WE cut it off". */
export const TRUNCATED_STATUSES: readonly SuiteStatus[] = [
  "truncated_turns",
  "truncated_budget",
  "timeout",
];

/** Statuses that mean "the suite never started". */
export const NOT_ATTEMPTED_STATUSES: readonly SuiteStatus[] = ["deferred"];

export function isTruncated(status: SuiteStatus): boolean {
  return TRUNCATED_STATUSES.includes(status);
}

export function isNotAttempted(status: SuiteStatus): boolean {
  return NOT_ATTEMPTED_STATUSES.includes(status);
}

/**
 * Process exit code for a run.
 *   0 = every suite finished and passed
 *   1 = a real product/test failure (`fail`) or a runner error
 *   2 = nothing failed, but something was cut off or never attempted
 *   3 = infrastructure blocked the run
 *
 * The rule that matters: a truncated or deferred suite can NEVER yield 0. Callers that
 * gate on "green" therefore cannot be fooled by partial coverage.
 */
export function exitCodeFor(statuses: readonly SuiteStatus[]): 0 | 1 | 2 | 3 {
  if (statuses.some((s) => s === "fail" || s === "error")) return 1;
  if (statuses.some((s) => s === "blocked")) return 3;
  if (statuses.some((s) => isTruncated(s) || isNotAttempted(s))) return 2;
  return 0;
}

/** Map an Agent SDK result subtype onto the status vocabulary. */
export function statusFromSdkSubtype(subtype: string): SuiteStatus {
  switch (subtype) {
    case "success":
      return "success";
    case "error_max_turns":
      return "truncated_turns";
    case "error_max_budget_usd":
      return "truncated_budget";
    default:
      return "error";
  }
}
