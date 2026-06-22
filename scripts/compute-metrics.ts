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
 *   npx tsx scripts/compute-metrics.ts [--history <path>] [--suite <id>]
 *       [--since <ISO>] [--gate smoke|sprint|release|hotfix]
 *       [--p0-bugs N] [--p1-bugs N] [--json]
 *
 * Exit: 0 unless --gate yields BLOCKED/FAIL (then 1), so it can gate CI.
 */
import { readFileSync, existsSync } from "fs";
import { fileURLToPath } from "url";

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
}

const round = (n: number, d = 2): number => {
  const f = 10 ** d;
  return Math.round(n * f) / f;
};

/** Aggregate execution + defect metrics over a set of run entries. */
export function aggregate(entries: RunEntry[]) {
  const sum = (k: keyof RunEntry) => entries.reduce((a, e) => a + (Number(e[k]) || 0), 0);
  const passed = sum("passed");
  const failed = sum("failed");
  const blocked = sum("blocked");
  const skipped = sum("skipped");
  const planned = sum("total");
  const executed = passed + failed; // executed excludes blocked/skipped (catalog rule)
  const minutes = sum("duration_minutes");
  const bugs = sum("bugs_found");

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
  for (const [suiteId, runsUnsorted] of bySuite) {
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

type GateType = "smoke" | "sprint" | "release" | "hotfix";
type Verdict = "PASS" | "FAIL" | "APPROVED" | "APPROVED WITH CONDITIONS" | "BLOCKED";

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
  return {
    history: get("--history") ?? "reports/regression/history.json",
    suite: get("--suite"),
    since: get("--since"),
    gate: get("--gate") as GateType | undefined,
    p0Bugs: Number(get("--p0-bugs") ?? 0),
    p1Bugs: Number(get("--p1-bugs") ?? 0),
    json: argv.includes("--json"),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

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

  if (args.suite) entries = entries.filter((e) => e.suiteId === args.suite);
  if (args.since) entries = entries.filter((e) => e.date >= args.since!);

  if (entries.length === 0) {
    console.error("✗ No run entries after filtering.");
    process.exit(1);
  }

  const agg = aggregate(entries);
  const trend = trends(entries);
  const gate = args.gate ? evaluateGate(args.gate, agg, args.p0Bugs, args.p1Bugs) : null;

  const blocking = gate ? gate.verdict === "BLOCKED" || gate.verdict === "FAIL" : false;

  if (args.json) {
    console.log(JSON.stringify({ source: args.history, entries: entries.length, aggregate: agg, trends: trend, gate }, null, 2));
  } else {
    console.log(`\nQuality metrics — ${args.history} (${entries.length} run entr${entries.length === 1 ? "y" : "ies"})`);
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
