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
 * Usage:
 *   npx tsx scripts/regression/compute-metrics.ts [--history <path>]
 *       [--run-id <RUN_ID>] [--suites <id,id,...>] [--suite <id>] [--since <ISO>]
 *       [--gate smoke|sprint|release|hotfix|feature]
 *       [--p0-bugs N] [--p1-bugs N] [--json]
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
  | "NO-GO";

export interface GateResult {
  gate: GateType;
  verdict: Verdict;
  passRate: number;
  reasons: string[];
}

/** Evaluate a gate per quality-gates.md §9. p0/p1 are supplied bug counts. */
export function evaluateGate(
  gate: GateType,
  agg: ReturnType<typeof aggregate>,
  p0Bugs: number,
  p1Bugs: number,
): GateResult {
  const pr = agg.passRate;
  const reasons: string[] = [];
  let verdict: Verdict;

  if (gate === "smoke") {
    const clean = agg.blocked === 0 && agg.skipped === 0;
    if (pr >= 99.999 && p0Bugs === 0 && clean) verdict = "PASS";
    else {
      verdict = "FAIL";
      if (pr < 99.999) reasons.push(`P0 pass rate ${pr}% < 100%`);
      if (p0Bugs > 0) reasons.push(`${p0Bugs} open P0 bug(s)`);
      if (!clean) reasons.push(`${agg.blocked} blocked / ${agg.skipped} skipped (must be 0)`);
    }
  } else if (gate === "hotfix") {
    if (pr >= 95 && p0Bugs === 0) verdict = "APPROVED";
    else {
      verdict = "BLOCKED";
      if (pr < 95) reasons.push(`affected-area pass rate ${pr}% < 95%`);
      if (p0Bugs > 0) reasons.push(`${p0Bugs} open P0 bug(s) in hotfix area`);
    }
  } else if (gate === "feature") {
    // Feature Release Gate (quality-gates.md §1a) — per-feature GO / CONDITIONAL GO / NO-GO.
    // pr = change-scoped (Artifact-C) regression pass rate; p0/p1 = open IN-SCOPE bug counts.
    // This computes ONLY the pass-rate + bug-count math; the qualitative §1a criteria (AC coverage,
    // BL-* preserved, NFRs, smoke, /qa-test verdict, security) stay agent-judged and are combined by the
    // Step-6h verifier. GO floor 95%, conditional band 93-95%, any open P0 or <93% => NO-GO.
    if (p0Bugs > 0) {
      verdict = "NO-GO";
      reasons.push(`${p0Bugs} open in-scope P0 bug(s) (non-negotiable)`);
    } else if (pr < 93) {
      verdict = "NO-GO";
      reasons.push(`change-scoped regression ${pr}% < 93% floor`);
    } else if (pr >= 95 && p1Bugs === 0) {
      verdict = "GO";
    } else {
      verdict = "CONDITIONAL GO";
      if (pr < 95) reasons.push(`regression ${pr}% in conditional band (93-94.99%) — risk acceptance required`);
      if (p1Bugs > 0) reasons.push(`${p1Bugs} open in-scope P1 bug(s) — documented workaround + risk acceptance required`);
    }
  } else {
    // sprint / release share the same shape, different thresholds.
    const approveAt = gate === "release" ? 98 : 95;
    const condFloor = gate === "release" ? 96 : 93;
    const p1ApprovedMax = gate === "release" ? 2 : 0; // release allows <3 with workaround
    const p1BlockMin = 3;

    if (p0Bugs > 0) {
      verdict = "BLOCKED";
      reasons.push(`${p0Bugs} open P0 bug(s) (non-negotiable)`);
    } else if (p1Bugs >= p1BlockMin) {
      verdict = "BLOCKED";
      reasons.push(`${p1Bugs} open P1 bug(s) >= ${p1BlockMin}`);
    } else if (pr < condFloor) {
      verdict = "BLOCKED";
      reasons.push(`pass rate ${pr}% below ${condFloor}% floor`);
    } else if (pr >= approveAt && p1Bugs <= p1ApprovedMax) {
      verdict = "APPROVED";
    } else {
      verdict = "APPROVED WITH CONDITIONS";
      if (pr < approveAt) reasons.push(`pass rate ${pr}% in conditional band (${condFloor}-${approveAt - 0.01}%) — risk acceptance required`);
      if (p1Bugs > p1ApprovedMax) reasons.push(`${p1Bugs} open P1 bug(s) — documented workaround + risk acceptance required`);
    }
  }

  return { gate, verdict, passRate: pr, reasons };
}

function parseArgs(argv: string[]) {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i !== -1 ? argv[i + 1] : undefined;
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
    p0Bugs: Number(get("--p0-bugs") ?? 0),
    p1Bugs: Number(get("--p1-bugs") ?? 0),
    json: argv.includes("--json"),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

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
  const gate = gateType ? evaluateGate(gateType, agg, args.p0Bugs, args.p1Bugs) : null;

  const blocking = gate
    ? gate.verdict === "BLOCKED" || gate.verdict === "FAIL" || gate.verdict === "NO-GO"
    : false;

  if (args.json) {
    console.log(JSON.stringify({ source: args.history, scope: scopeLabel.length ? scopeLabel.join(" + ") : "all", entries: entries.length, aggregate: agg, trends: trend, gate }, null, 2));
  } else {
    console.log(`\nQuality metrics — ${args.history} (${entries.length} run entr${entries.length === 1 ? "y" : "ies"}` +
      `${scopeLabel.length ? `, scope: ${scopeLabel.join(" + ")}` : ", scope: all"})`);
    console.log(`  Execution: ${agg.passed}P / ${agg.failed}F / ${agg.blocked}B / ${agg.skipped}S of ${agg.planned} planned`);
    console.log(`  Pass ${agg.passRate}%  Fail ${agg.failRate}%  Blocked ${agg.blockedRate}%  Skip ${agg.skipRate}%` +
      (agg.velocityPerHour != null ? `  Velocity ${agg.velocityPerHour}/hr` : ""));
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
      if (args.p0Bugs === 0 && args.p1Bugs === 0)
        console.log(`    (P0/P1 bug counts assumed 0 — supply --p0-bugs/--p1-bugs from JIRA for a full verdict)`);
    }
  }

  process.exit(blocking ? 1 : 0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
