/**
 * Deterministic quality-metrics computer — the formula + gate-verdict core of
 * `/qa-metrics`. Every number here is a pure function of the regression history
 * (no judgment), so the skill keeps only the narrative around the numbers.
 *
 * Formulas + targets: quality-metrics-catalog.md. Gate verdicts (§9 numeric
 * definitions): quality-gates.md. This script is the single place those
 * formulas live in code.
 *
 * Input: reports/regression/history.json — an array of run entries:
 *   { runId, date, suiteId, suiteName, environment, browser,
 *     total, passed, failed, blocked, skipped, duration_minutes,
 *     bugs_found, pass_rate }
 * (A single-run summary in the same entry shape also works.)
 *
 * Bug-SEVERITY gate criteria (open P0/P1) come from JIRA/bug reports, not the
 * run entries, so they are passed in via --p0-bugs / --p1-bugs (default 0). The
 * pass-rate criteria are computed; the verdict combines both. This keeps the
 * verdict honest about what was measured vs. supplied.
 *
 * An open P1/High BLOCKS (quality-gates.md §1a/§2) — it no longer downgrades to a
 * CONDITIONAL verdict by itself. The deferral path survives but must be DECLARED:
 * --p1-deferred N asserts that N of the P1s carry a documented workaround + signed risk
 * acceptance + a monitoring plan, and a declared deferral caps the verdict at CONDITIONAL
 * (it never yields a clean GO/APPROVED). Release still tolerates <=2 undeferred.
 *
 * COMPLETENESS is a criterion too, checked before the pass rate: `executed = passed +
 * failed`, so BLOCKED sits OUTSIDE the pass-rate denominator and the rate RISES as
 * blockers accumulate. A run with more than MAX_UNTRIAGED_BLOCKED_PCT of its planned
 * cases blocked-and-untriaged returns CANNOT EVALUATE; --blocked-triaged N discounts the
 * ones /qa-triage-results attributed to a documented non-product cause.
 *
 * Usage:
 *   npx tsx scripts/regression/compute-metrics.ts [--history <path>]
 *       [--run-id <RUN_ID>] [--suites <id,id,...>] [--suite <id>] [--since <ISO>]
 *       [--gate smoke|sprint|release|hotfix|feature]
 *       [--p0-bugs N] [--p1-bugs N] [--p1-deferred N] [--blocked-triaged N] [--json]
 *
 * SCOPE. Unscoped, every number aggregates the whole rolling history. `--gate feature`
 * (quality-gates.md §1a) is defined on ONE change-scoped run, so it REFUSES to run
 * unscoped — pass `--run-id <summary.json regression.run_id>` (preferred) or
 * `--suites <regression.suites>`. Without that guard it silently returned the global
 * pass rate, identical for every feature.
 *
 * Exit: 0 = evaluated, gate not blocking · 1 = gate BLOCKED/FAIL/NO-GO, or bad
 * arguments · 2 = CANNOT EVALUATE (no entries in scope: the run was deferred,
 * skipped, or never recorded). 2 is deliberately distinct from 1 — an absent run
 * is not a failing pass rate, and must never be reported as a regression failure.
 */
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";
import { resolve, join } from "path";
import {
  collectAttributions,
  indexAttributions,
  loadKnownCaseIds,
} from "../lib/defect-attribution.js";

interface RunEntry {
  runId: string;
  date: string;
  suiteId: string;
  suiteName?: string;
  environment?: string;
  browser?: string;
  total: number;
  passed: number;
  failed: number;
  blocked: number;
  skipped: number;
  duration_minutes?: number;
  bugs_found?: number;
  pass_rate?: number;
  mode?: "ci" | "interactive"; // "ci" = coarse 1-unit-per-suite; excluded from trends when richer rows exist
}

const round = (n: number, d = 2): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Aggregate execution + defect metrics over a set of run entries. */
/**
 * Bugs attributed to a (runId, suiteId), DERIVED from `reports/bugs/**` at read
 * time rather than read off the history row.
 *
 * `bugs_found` has been an optional field on `RunEntry` since this script was
 * written and is populated in 0 of 109 rows, so `defectDensity` has computed a
 * flat 0 for the entire corpus. The fix is not to start writing the field: the
 * bug report is the source of truth for "a defect exists", it is durable while
 * history.json prunes at 90 days, and a stored count goes stale the moment a bug
 * moves open/ -> fixed/ -> closed/. So it is joined, not stored — the same
 * derive-at-decision-time rule as `oracle-significance.ts`
 * (`.claude/rules/test-data.md` §GOLDEN RULE).
 *
 * The row's own `bugs_found` still wins when present, so a CI writer that does
 * supply it is not overridden.
 */
export function bugsForEntry(e: RunEntry, join?: ReadonlyMap<string, number>): number {
  // A row may carry the field as a string; the pre-existing `sum()` coerced, so
  // `Number.isFinite(e.bugs_found)` alone would have silently dropped "3".
  const own = e.bugs_found;
  if (own !== undefined && own !== null && Number.isFinite(Number(own))) return Number(own);
  if (!join || !e.runId || !e.suiteId) return 0;
  return join.get(`${e.runId}::${e.suiteId}`) ?? 0;
}

export function aggregate(entries: RunEntry[], bugJoin?: ReadonlyMap<string, number>) {
  const sum = (k: keyof RunEntry) => entries.reduce((a, e) => a + (Number(e[k]) || 0), 0);
  const passed = sum("passed");
  const failed = sum("failed");
  const blocked = sum("blocked");
  const skipped = sum("skipped");
  const planned = sum("total");
  const executed = passed + failed; // executed excludes blocked/skipped (catalog rule)
  const minutes = sum("duration_minutes");
  const bugs = entries.reduce((a, e) => a + bugsForEntry(e, bugJoin), 0);

  return {
    runs: entries.length,
    planned,
    executed,
    passed,
    failed,
    blocked,
    skipped,
    bugsFound: bugs,
    passRate: executed ? round((passed / executed) * 100) : 0,
    failRate: executed ? round((failed / executed) * 100) : 0,
    blockedRate: planned ? round((blocked / planned) * 100) : 0,
    skipRate: planned ? round((skipped / planned) * 100) : 0,
    // PLANNED-basis pass rate: passed / planned, i.e. the share of what the run set out to
    // do that actually went green. Reported beside passRate because the two diverge wildly
    // and only one of them can be read as "the run went well": REG-2026-07-13-1247 is
    // 26P / 0F / 32B / 12S — passRate 100%, plannedPassRate 36.6%. A gate quoting only the
    // first certifies a run that executed a third of its cases as perfect.
    plannedPassRate: planned ? round((passed / planned) * 100) : 0,
    // Share of planned cases that produced ANY verdict. 100 - this is blocked + skipped.
    executedShare: planned ? round((executed / planned) * 100) : 0,
    velocityPerHour: minutes ? round(executed / (minutes / 60)) : null,
    defectDensity: executed ? round(bugs / executed, 3) : 0,
  };
}

export type SuiteTrend = {
  suiteId: string;
  points: number;
  passRates: number[];
  rollingAvg5: number | null;
  deltaVsPrevious: number | null;
  stdDev: number | null;
  consecutiveDrops: number;
  flaky: boolean;
  direction: "improving" | "stable" | "degrading" | "insufficient-data";
};

function passRateOf(e: RunEntry): number {
  const executed = (e.passed || 0) + (e.failed || 0);
  return executed ? (e.passed / executed) * 100 : 0;
}

/** Per-suite trend metrics. Needs >=3 points for a direction (catalog rule). */
export function trends(entries: RunEntry[]): SuiteTrend[] {
  const bySuite = new Map<string, RunEntry[]>();
  for (const e of entries) {
    const arr = bySuite.get(e.suiteId) ?? [];
    arr.push(e);
    bySuite.set(e.suiteId, arr);
  }

  const out: SuiteTrend[] = [];
  for (const [suiteId, allRuns] of bySuite) {
    // Coarse CI rows (mode "ci", binary 0/100 pass_rate) mixed with case-level
    // rows for the same suite would create false perfect↔non-perfect crossings
    // (→ bogus flaky). If the suite has any richer (non-"ci") row, drop the CI
    // ones from the trend; a CI-only suite keeps them (binary flaky is still valid).
    const hasRich = allRuns.some((r) => r.mode !== "ci");
    const runsUnsorted = hasRich ? allRuns.filter((r) => r.mode !== "ci") : allRuns;
    const runs = runsUnsorted.slice().sort((a, b) => a.date.localeCompare(b.date));
    const rates = runs.map((r) => round(passRateOf(r)));
    const n = rates.length;

    const last5 = rates.slice(-5);
    const rollingAvg5 = last5.length >= 5 ? round(last5.reduce((a, b) => a + b, 0) / last5.length) : null;
    const deltaVsPrevious = n >= 2 ? round(rates[n - 1] - rates[n - 2]) : null;

    let stdDev: number | null = null;
    if (n >= 5) {
      const mean = rates.reduce((a, b) => a + b, 0) / n;
      stdDev = round(Math.sqrt(rates.reduce((a, b) => a + (b - mean) ** 2, 0) / n));
    }

    let consecutiveDrops = 0;
    for (let i = n - 1; i > 0; i--) {
      if (rates[i] < rates[i - 1]) consecutiveDrops++;
      else break;
    }

    // Flaky: oscillates pass<->fail across runs (a 100% run next to a <100% run,
    // repeatedly) — proxy for the catalog's "oscillation without code change".
    let direction: SuiteTrend["direction"] = "insufficient-data";
    if (n >= 3) {
      const recent = rates.slice(-3);
      if (recent[2] - recent[0] >= 3) direction = "improving";
      else if (recent[0] - recent[2] >= 3) direction = "degrading";
      else direction = "stable";
    }
    let crossings = 0;
    for (let i = 1; i < n; i++) {
      const wasPerfect = rates[i - 1] >= 99.999;
      const nowPerfect = rates[i] >= 99.999;
      if (wasPerfect !== nowPerfect) crossings++;
    }
    const flaky = n >= 4 && crossings >= 3;

    out.push({ suiteId, points: n, passRates: rates, rollingAvg5, deltaVsPrevious, stdDev, consecutiveDrops, flaky, direction });
  }
  return out;
}

export const GATE_TYPES = ["smoke", "sprint", "release", "hotfix", "feature"] as const;
type GateType = (typeof GATE_TYPES)[number];

/**
 * An unknown --gate string must NOT fall through to the sprint/release branch:
 * `--gate featrue` used to print "Gate (featrue): BLOCKED" against SPRINT
 * thresholds and exit 1, i.e. a typo produced a confident wrong verdict instead
 * of an error. Callers are agents copying a documented command line, so the
 * cheap typo is the likely one.
 */
export const isGateType = (v: string): v is GateType => (GATE_TYPES as readonly string[]).includes(v);

/**
 * Gates whose criteria are defined on a SPECIFIC run's suites, not on the
 * rolling history. `feature` (quality-gates.md §1a) keys off the change-scoped
 * Artifact-C run recorded in `summary.json` `regression.run_id`; computing it
 * over the whole 90-day window returns a number that has nothing to do with the
 * feature under test (and is identical for every feature), so scoping is
 * REQUIRED rather than optional.
 */
export const SCOPE_REQUIRED_GATES: readonly GateType[] = ["feature"];
type Verdict =
  | "PASS"
  | "FAIL"
  | "APPROVED"
  | "APPROVED WITH CONDITIONS"
  | "BLOCKED"
  | "GO"
  | "CONDITIONAL GO"
  | "NO-GO"
  // Not a failure — the run cannot SUPPORT a verdict (nothing executed, or too much of it
  // was blocked and untriaged). main() exits 2 for this, never 1: reporting it as BLOCKED /
  // NO-GO makes an unmeasured run indistinguishable from a catastrophic regression.
  | "CANNOT EVALUATE";

export interface GateResult {
  gate: GateType;
  verdict: Verdict;
  /** Executed-basis: passed / (passed + failed). The threshold criterion. */
  passRate: number;
  /** Planned-basis: passed / planned. Reported, never thresholded — see aggregate(). */
  plannedPassRate: number;
  /** Untriaged BLOCKED as a share of planned — the completeness criterion's input. */
  blockedShare: number;
  reasons: string[];
}

/**
 * Completeness ceiling — the share of PLANNED cases a gate tolerates as BLOCKED without a
 * documented non-product cause before it refuses to evaluate ("no serious blockers").
 *
 * Why a gate needs this at all: `executed = passed + failed`, so BLOCKED is excluded from
 * the pass-rate DENOMINATOR. The pass rate therefore RISES as blockers accumulate, and
 * before this criterion existed no gate below `smoke` looked at the blocked count at all —
 * REG-2026-07-14-0018 (777P / 170F / 371B / 167S of 1485 planned) satisfied every numeric
 * criterion in the file. Corpus blocked rate is 19.9% (28.6% on suites of 81+ cases), so a
 * run generally has to be triaged through /qa-triage-results to clear this; that is the
 * intent, and CANNOT EVALUATE is deliberately cheap to resolve (`--blocked-triaged N`).
 *
 * SKIPPED is deliberately NOT counted here. An explicit `Manual` / `Deprecated` lane is
 * materialised as SKIPPED with its reason (.claude/rules/regression.md §Per-Case Lane
 * Routing) — an intentional non-execution, not a blocker. Counting the corpus's 838 Manual
 * + 35 Deprecated cases as blockers would leave the gate permanently unevaluable for
 * reasons that are by design. The planned-basis pass rate is what exposes them.
 */
export const MAX_UNTRIAGED_BLOCKED_PCT = 10;

/**
 * Pass-rate floor per gate, EXECUTED basis (passed / (passed + failed)).
 *
 * One exported constant rather than literals in the branches, because this number is quoted
 * in ~8 documents and a transcribed copy of it goes stale silently
 * (`.claude/rules/test-data.md` §GOLDEN RULE). Docs cite `GATE_PASS_FLOOR`, never a figure.
 *
 * **Lowered 95 -> 80 for feature/sprint/hotfix on 2026-09-02, by operator decision.** The
 * recorded counter-argument, so a future reader can weigh it: BLOCKED and SKIPPED are already
 * outside this denominator, so the artefactual failures (contaminated cart, drifted session,
 * dead lane) do not depress it — what an 80% floor admits is 1 in 5 EXECUTED cases failing for
 * product reasons. On the 21-run history at the time, 4 runs moved from NO-GO to GO. The
 * decision was taken with that on the table, and it is paired with two tightenings that did
 * not exist before (§0 completeness, and an undeferred P1 now blocking), so the gate is not
 * uniformly looser than the one it replaces.
 *
 * Deliberately NOT changed: `smoke` (100%, binary, P0-only) and `release` (98%) — a production
 * release aggregates many already-gated features, so a bar beneath the sprint bar it rolls up
 * would be incoherent. Change `release` here if that is wanted; nothing else needs editing.
 */
export const GATE_PASS_FLOOR: Record<GateType, number> = {
  smoke: 100,
  feature: 80,
  sprint: 80,
  hotfix: 80,
  release: 98,
};

/**
 * Release alone keeps a 2-point conditional band beneath its floor (96-98). The 80% gates are a
 * SINGLE floor: with the floor at 80 a band underneath it would be a second, quieter threshold
 * nobody quotes, and "pass more than 80%" is meant to be one number. So at those gates a
 * CONDITIONAL verdict means exactly one thing — a declared P1 deferral.
 */
export const RELEASE_COND_FLOOR = 96;

/** Operator-supplied inputs that no run artifact can carry, so they must be declared. */
export interface GateInputs {
  /**
   * Open P1/High bugs carrying a documented workaround + risk acceptance signed by the
   * product owner + a monitoring plan. Subtracted from p1Bugs. A deferral CAPS the verdict
   * at CONDITIONAL GO / APPROVED WITH CONDITIONS — it never buys a clean GO, because the
   * risk was accepted rather than removed.
   */
  p1Deferred?: number;
  /**
   * BLOCKED cases triaged (/qa-triage-results) to a documented NON-PRODUCT cause — env,
   * precondition, contaminated lane. Subtracted before the completeness check. Untriaged
   * blockers stay counted: an untriaged BLOCKED may well be the product failing.
   */
  blockedTriaged?: number;
}

/**
 * Evaluate a gate per quality-gates.md §0 (completeness) + §9 (numeric definitions).
 *
 * Three families of criterion, applied in this order and for this reason:
 *   1. SEVERITY  — an open P0/Critical needs no complete run to be decided, so it outranks
 *                  everything, including an unevaluable run.
 *   2. COMPLETENESS — did the run measure enough to support ANY verdict? Checked BEFORE the
 *                  pass rate, because a pass rate computed over a heavily-blocked run is
 *                  not a weak signal, it is the wrong number (blocked is excluded from its
 *                  denominator, so blockers push it UP).
 *   3. PASS RATE — the floor (`GATE_PASS_FLOOR`), finally trustworthy.
 *
 * p0/p1 counts and the two GateInputs come from the bug tracker + triage, not from the run
 * entries, so the verdict stays honest about what was measured vs. what was supplied.
 */
export function evaluateGate(
  gate: GateType,
  agg: ReturnType<typeof aggregate>,
  p0Bugs: number,
  p1Bugs: number,
  inputs: GateInputs = {},
): GateResult {
  const pr = agg.passRate;
  const reasons: string[] = [];

  // Both operator inputs are CLAMPED to what the ledger / the run actually contains.
  // Unclamped, `--p1-deferred 2` against a feature with ZERO open P1s downgraded a clean run to
  // CONDITIONAL GO — a conditional verdict about bugs that do not exist — because the branch
  // tests `p1Deferred > 0` rather than "a real P1 was deferred". Same shape for a
  // `--blocked-triaged` larger than the blocked count. Clamping keeps a stale or copy-pasted
  // flag from changing a verdict it has no bearing on, in the safe direction: it can never
  // manufacture a deferral, only ignore one that has nothing to defer.
  const p1DeferredDeclared = Math.max(0, Number(inputs.p1Deferred ?? 0) || 0);
  const blockedTriagedDeclared = Math.max(0, Number(inputs.blockedTriaged ?? 0) || 0);
  const p1Deferred = Math.min(p1DeferredDeclared, Math.max(0, p1Bugs));
  const blockedTriaged = Math.min(blockedTriagedDeclared, Math.max(0, agg.blocked));
  const p1Net = Math.max(0, p1Bugs - p1Deferred);
  const untriagedBlocked = Math.max(0, agg.blocked - blockedTriaged);
  const blockedShare = agg.planned ? round((untriagedBlocked / agg.planned) * 100) : 0;

  const out = (verdict: Verdict): GateResult => ({
    gate,
    verdict,
    passRate: pr,
    plannedPassRate: agg.plannedPassRate,
    blockedShare,
    reasons,
  });

  // The word this gate uses for "do not ship". Kept in one place so the three vocabularies
  // (PASS/FAIL · GO/NO-GO · APPROVED/BLOCKED) cannot drift between the shared pre-checks
  // and the per-gate branches.
  const blockVerdict: Verdict = gate === "smoke" ? "FAIL" : gate === "feature" ? "NO-GO" : "BLOCKED";

  // ---- [1] SEVERITY: an open P0/Critical is non-negotiable at every gate -----------------
  if (p0Bugs > 0) {
    reasons.push(`${p0Bugs} open P0/Critical bug(s) (non-negotiable)`);
    return out(blockVerdict);
  }

  // ---- [2] COMPLETENESS: can this run support a verdict at all? -------------------------
  // Nothing executed. Distinct from a 0% pass rate — see main()'s exit-2 branch.
  if (agg.executed === 0) {
    reasons.push(
      `no case produced a pass/fail verdict (${agg.planned} planned, ${agg.blocked} blocked, ` +
        `${agg.skipped} skipped) — this is NOT a 0% pass rate`,
    );
    return out("CANNOT EVALUATE");
  }
  // "No serious blockers." Smoke keeps its own stricter blocked === 0 && skipped === 0 rule
  // in its branch below, so it is exempt from the ceiling rather than double-judged by it.
  if (gate !== "smoke" && blockedShare > MAX_UNTRIAGED_BLOCKED_PCT) {
    reasons.push(
      `${untriagedBlocked} of ${agg.planned} planned case(s) BLOCKED and untriaged ` +
        `(${blockedShare}% > ${MAX_UNTRIAGED_BLOCKED_PCT}% ceiling) — the ${pr}% pass rate excludes ` +
        `them from its denominator, so it cannot be read as this run's quality. Triage via ` +
        `/qa-triage-results, then re-run with --blocked-triaged N`,
    );
    return out("CANNOT EVALUATE");
  }

  // ---- [3] PASS RATE + P1 ledger, per gate ----------------------------------------------
  let verdict: Verdict;

  if (gate === "smoke") {
    const clean = agg.blocked === 0 && agg.skipped === 0;
    if (pr >= 99.999 && clean) verdict = "PASS";
    else {
      verdict = "FAIL";
      if (pr < 99.999) reasons.push(`P0 pass rate ${pr}% < 100%`);
      if (!clean) reasons.push(`${agg.blocked} blocked / ${agg.skipped} skipped (must be 0)`);
    }
  } else if (gate === "hotfix") {
    // §8 requires 0 open P1 in the hotfix area. The p1 argument was previously ignored on
    // this branch entirely, so a hotfix with open Highs read as APPROVED against a doc that
    // said it must not.
    if (pr < GATE_PASS_FLOOR.hotfix) {
      verdict = "BLOCKED";
      reasons.push(`affected-area pass rate ${pr}% < ${GATE_PASS_FLOOR.hotfix}% floor`);
    } else if (p1Net > 0) {
      verdict = "BLOCKED";
      reasons.push(`${p1Net} open P1/High bug(s) in the hotfix area (§8 requires 0)`);
    } else verdict = "APPROVED";
  } else if (gate === "feature") {
    // Feature Release Gate (quality-gates.md §1a) — per-feature GO / CONDITIONAL GO / NO-GO.
    // pr = change-scoped (Artifact-C) regression pass rate; p0/p1 = open IN-SCOPE bug counts.
    // This computes ONLY the severity + completeness + pass-rate math; the qualitative §1a
    // criteria (AC coverage, BL-* preserved, NFRs, smoke, /qa-test verdict, security) stay
    // agent-judged and are combined with it by the Step-5e verifier. Single GO floor
    // (GATE_PASS_FLOOR.feature); below it => NO-GO. CONDITIONAL GO now means only "a High was
    // deferred", never "the pass rate nearly cleared the bar".
    if (p1Net > 0) {
      verdict = "NO-GO";
      reasons.push(
        `${p1Net} open in-scope P1/High bug(s) — fix them, or defer explicitly (documented ` +
          `workaround + signed risk acceptance + monitoring plan) and pass --p1-deferred N`,
      );
    } else if (pr < GATE_PASS_FLOOR.feature) {
      verdict = "NO-GO";
      reasons.push(`change-scoped regression ${pr}% < ${GATE_PASS_FLOOR.feature}% floor`);
    } else if (p1Deferred === 0) {
      verdict = "GO";
    } else {
      verdict = "CONDITIONAL GO";
      reasons.push(
        `${p1Deferred} deferred P1/High bug(s) — a deferral caps this gate at CONDITIONAL GO; ` +
          `the risk was accepted, not removed`,
      );
    }
  } else {
    // sprint / release share the same shape, different thresholds.
    const approveAt = GATE_PASS_FLOOR[gate];
    // Release keeps a 2-point band beneath its floor; sprint is a single floor, so its band is
    // empty by construction (condFloor === approveAt) and the band reason can never fire.
    const condFloor = gate === "release" ? RELEASE_COND_FLOOR : approveAt;
    // Open (undeferred) P1s tolerated at all: none at sprint, <=2 at release — a production
    // release bundles many already-gated features, so stripping its documented-workaround
    // path would block a whole release on one cosmetic High.
    const p1CondMax = gate === "release" ? 2 : 0;

    if (p1Net > p1CondMax) {
      verdict = "BLOCKED";
      reasons.push(
        `${p1Net} open P1/High bug(s) > ${p1CondMax} tolerated at this gate — fix them, or defer ` +
          `explicitly (documented workaround + signed risk acceptance) and pass --p1-deferred N`,
      );
    } else if (pr < condFloor) {
      verdict = "BLOCKED";
      reasons.push(`pass rate ${pr}% below ${condFloor}% floor`);
    } else if (pr >= approveAt && p1Net === 0 && p1Deferred === 0) {
      verdict = "APPROVED";
    } else {
      verdict = "APPROVED WITH CONDITIONS";
      if (pr < approveAt) reasons.push(`pass rate ${pr}% in conditional band (${condFloor}-${approveAt - 0.01}%) — risk acceptance required`);
      if (p1Net > 0) reasons.push(`${p1Net} open P1/High bug(s) — documented workaround + risk acceptance required`);
      if (p1Deferred > 0) reasons.push(`${p1Deferred} deferred P1/High bug(s) — workaround + monitoring plan required`);
    }
  }

  return out(verdict);
}

/**
 * Exported for its own unit tests: the numeric-flag guard below is error-handling, and
 * error-handling that nothing exercises is where a silent wrong answer hides.
 */
export function parseArgs(argv: string[]) {
  const errors: string[] = [];
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
  };
  /**
   * A numeric flag with a missing, flag-shaped, or non-numeric value is an ERROR, never 0.
   *
   * `Number(get("--p0-bugs") ?? 0)` returned NaN for `--p0-bugs --json` (the next token eaten
   * as the value) and for a typo like `--p0-bugs one`; every downstream test is `> 0`, which is
   * false for NaN, so the count silently became ZERO. That fails in the one direction that
   * matters: a NO-GO caused by an open P0 turns into a GO, and nothing in the output says the
   * argument was not understood. Same value-lookahead hole `tc:promote --ids` had.
   */
  const count = (flag: string): number => {
    const i = argv.indexOf(flag);
    if (i === -1) return 0;
    const raw = argv[i + 1];
    // An EMPTY value (`--p0-bugs ""`, a shell variable that expanded to nothing) is rejected
    // too: Number("") is 0, so it was the one unreadable value that still parsed cleanly.
    if (raw === undefined || raw.startsWith("--") || raw.trim() === "") {
      errors.push(
        `${flag} requires a value (got ${
          raw === undefined ? "end of arguments" : raw.trim() === "" ? "an empty value" : `the next flag "${raw}"`
        }).`,
      );
      return 0;
    }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 0) {
      errors.push(`${flag} must be a non-negative whole number (got "${raw}").`);
      return 0;
    }
    return n;
  };
  const suites = get("--suites");
  return {
    history: get("--history") ?? "reports/regression/history.json",
    suite: get("--suite"),
    // Multi-suite scope (e.g. a /qa-test Artifact-C selection: --suites 028,029,030).
    suiteIds: suites ? suites.split(",").map((s) => s.trim()).filter(Boolean) : undefined,
    runId: get("--run-id"),
    since: get("--since"),
    gate: get("--gate"),
    p0Bugs: count("--p0-bugs"),
    p1Bugs: count("--p1-bugs"),
    // Operator assertions, not measurements — see GateInputs. Defaulting both to 0 keeps
    // the strict reading when nobody vouches for a deferral or a triaged blocker.
    p1Deferred: count("--p1-deferred"),
    blockedTriaged: count("--blocked-triaged"),
    json: argv.includes("--json"),
    // Reported and acted on by main() BEFORE any number is computed — a run that could not
    // read its own arguments must not print a confident verdict.
    errors,
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  // Refuse before computing anything. A malformed numeric flag used to degrade to 0, which
  // could only ever make a verdict LOOK better than the evidence.
  if (args.errors.length) {
    for (const e of args.errors) console.error(`✗ ${e}`);
    console.error(
      `  Refusing to evaluate — a bug count that cannot be read is not the same as a count of\n` +
        `  zero, and defaulting it to zero turns a blocking verdict into a passing one.`,
    );
    process.exit(1);
  }

  if (args.gate !== undefined && !isGateType(args.gate)) {
    console.error(
      `✗ Unknown --gate "${args.gate}". Valid: ${GATE_TYPES.join(" | ")}.\n` +
        `  (Refusing to evaluate — an unrecognised gate previously fell through to the sprint\n` +
        `  thresholds and printed a confident verdict for a gate that does not exist.)`,
    );
    process.exit(1);
  }
  const gateType: GateType | undefined = args.gate as GateType | undefined;

  // A scope-required gate (feature) must be pinned to its own run before any number is computed.
  const scoped = !!(args.runId || args.suiteIds || args.suite);
  if (gateType && SCOPE_REQUIRED_GATES.includes(gateType) && !scoped) {
    console.error(
      `✗ --gate ${gateType} requires a run scope.\n` +
        `  This gate is defined on the CHANGE-SCOPED regression run, not the rolling history —\n` +
        `  unscoped it aggregates every suite in ${args.history} and returns the same number for\n` +
        `  every feature. Pass the run recorded by /qa-test in summary.json:\n` +
        `    --run-id <regression.run_id>            (preferred)\n` +
        `    --suites <regression.suites, e.g. 028,029,030>`,
    );
    process.exit(1);
  }

  if (!existsSync(args.history)) {
    console.error(
      `✗ History file not found: ${args.history}\n` +
        `  Provide one with --history <path>, or have the regression pipeline write it ` +
        `(reports/regression/history.json — schema in quality-metrics-catalog.md §7).`,
    );
    process.exit(1);
  }

  let entries: RunEntry[];
  try {
    const parsed = JSON.parse(readFileSync(args.history, "utf-8"));
    entries = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    console.error(`✗ Could not parse ${args.history}: ${(e as Error).message}`);
    process.exit(1);
  }

  const scopeLabel: string[] = [];
  if (args.runId) {
    entries = entries.filter((e) => e.runId === args.runId);
    scopeLabel.push(`run ${args.runId}`);
  }
  if (args.suiteIds) {
    entries = entries.filter((e) => args.suiteIds!.includes(e.suiteId));
    scopeLabel.push(`suites ${args.suiteIds.join(",")}`);
  }
  if (args.suite) {
    entries = entries.filter((e) => e.suiteId === args.suite);
    scopeLabel.push(`suite ${args.suite}`);
  }
  if (args.since) {
    entries = entries.filter((e) => e.date >= args.since!);
    scopeLabel.push(`since ${args.since}`);
  }

  if (entries.length === 0) {
    // CANNOT EVALUATE ≠ FAILED. An empty scope means the run was deferred, skipped, or never
    // written to history — NOT that its pass rate was 0%. Aggregating on to a 0% pass rate would
    // hand the caller a NO-GO/BLOCKED that looks exactly like a catastrophic regression. Exit 2
    // (distinct from the gate-failure 1) so a caller can tell the two apart.
    console.error(
      `✗ Cannot evaluate: no run entries in ${args.history}` +
        (scopeLabel.length ? ` for ${scopeLabel.join(" + ")}` : "") +
        `.\n  This is NOT a failing pass rate — the run is absent (deferred, skipped, or not yet\n` +
        `  recorded). Report the gate as NOT EVALUATED; do not read it as a regression failure.`,
    );
    process.exit(2);
  }

  // Join the durable bug reports so defectDensity stops reading a flat 0.
  // Best-effort: a missing/unreadable reports/bugs tree degrades to the old
  // behaviour rather than failing the metrics run.
  // Resolved from the module, not from cwd: bare relative paths made this
  // silently report defectDensity 0 whenever the script ran from anywhere but
  // the repo root — the exact "never pass on an unreachable source" failure
  // .claude/rules/test-data.md §GOLDEN RULE step 4 warns about. The old `catch`
  // was dead too: these functions return [] rather than throwing.
  const repoRoot = resolve(fileURLToPath(import.meta.url), "../../..");
  const bugsRoot = join(repoRoot, "reports", "bugs");
  const suitesRoot = join(repoRoot, "regression", "suites");
  let bugJoin: ReadonlyMap<string, number> | undefined;
  if (!existsSync(bugsRoot) || !existsSync(suitesRoot)) {
    console.error(
      `⚠ defect attribution unavailable (${bugsRoot} / ${suitesRoot} not found) — ` +
        `bugsFound/defectDensity below are NOT measured, they are absent.`,
    );
  } else {
    bugJoin = indexAttributions(collectAttributions(bugsRoot, loadKnownCaseIds(suitesRoot))).byRunSuite;
  }

  const agg = aggregate(entries, bugJoin);
  const trend = trends(entries);
  const gate = gateType
    ? evaluateGate(gateType, agg, args.p0Bugs, args.p1Bugs, {
        p1Deferred: args.p1Deferred,
        blockedTriaged: args.blockedTriaged,
      })
    : null;

  const blocking = gate
    ? gate.verdict === "BLOCKED" || gate.verdict === "FAIL" || gate.verdict === "NO-GO"
    : false;
  // CANNOT EVALUATE shares exit 2 with the empty-scope branch above, for the same reason:
  // the run did not support a verdict. Exiting 1 would make an unmeasured run read as a
  // failing one, which is the confusion this whole exit-code split exists to prevent.
  const cannotEvaluate = gate?.verdict === "CANNOT EVALUATE";

  if (args.json) {
    console.log(JSON.stringify({ source: args.history, scope: scopeLabel.length ? scopeLabel.join(" + ") : "all", entries: entries.length, aggregate: agg, trends: trend, gate }, null, 2));
  } else {
    console.log(`\nQuality metrics — ${args.history} (${entries.length} run entr${entries.length === 1 ? "y" : "ies"}` +
      `${scopeLabel.length ? `, scope: ${scopeLabel.join(" + ")}` : ", scope: all"})`);
    console.log(`  Execution: ${agg.passed}P / ${agg.failed}F / ${agg.blocked}B / ${agg.skipped}S of ${agg.planned} planned`);
    console.log(`  Pass ${agg.passRate}%  Fail ${agg.failRate}%  Blocked ${agg.blockedRate}%  Skip ${agg.skipRate}%` +
      (agg.velocityPerHour != null ? `  Velocity ${agg.velocityPerHour}/hr` : ""));
    // Both bases, always, side by side. Pass ${passRate}% alone is what let a 26P/0F/32B/12S
    // run be reported as 100%; the second number says 36.6% and settles it.
    console.log(`  Pass (of planned) ${agg.plannedPassRate}%  —  ${agg.executedShare}% of ` +
      `${agg.planned} planned case(s) produced a verdict`);
    console.log(`  Defects: ${agg.bugsFound} bug(s), density ${agg.defectDensity} (bugs/executed)`);

    const withDir = trend.filter((t) => t.direction !== "insufficient-data");
    if (withDir.length) {
      console.log(`  Trends (>=3 points):`);
      for (const t of withDir)
        console.log(`    ${t.suiteId}: ${t.direction}` +
          (t.deltaVsPrevious != null ? `, Δ ${t.deltaVsPrevious >= 0 ? "+" : ""}${t.deltaVsPrevious}%` : "") +
          (t.consecutiveDrops >= 3 ? `, ${t.consecutiveDrops} consecutive drops ⚠` : "") +
          (t.flaky ? `, FLAKY ⚠` : ""));
    }
    const lowData = trend.filter((t) => t.direction === "insufficient-data");
    if (lowData.length) console.log(`  (${lowData.length} suite(s) with <3 points — no trend direction asserted)`);

    if (gate) {
      console.log(`\n  Gate (${gate.gate}): ${gate.verdict}`);
      for (const r of gate.reasons) console.log(`    - ${r}`);
      if (gate.blockedShare > 0)
        console.log(`    untriaged BLOCKED: ${gate.blockedShare}% of planned ` +
          `(ceiling ${MAX_UNTRIAGED_BLOCKED_PCT}%; discount triaged ones with --blocked-triaged N)`);
      if (args.p0Bugs === 0 && args.p1Bugs === 0)
        console.log(`    (P0/P1 bug counts assumed 0 — supply --p0-bugs/--p1-bugs from JIRA for a full verdict)`);
    }
  }

  process.exit(cannotEvaluate ? 2 : blocking ? 1 : 0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
