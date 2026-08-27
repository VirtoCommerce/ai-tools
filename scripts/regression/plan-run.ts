#!/usr/bin/env -S npx tsx
/**
 * `npm run regression:plan -- <selection>` — what a regression run WOULD do, before it runs.
 *
 * WHY THIS IS A CLI. Regression here is driven by `/qa-regression`, which dispatches
 * `regression-orchestrator` / `test-runner-agent` sub-agents from inside a Claude Code session.
 * Those agents follow a markdown file, so they cannot `import` the TypeScript that knows how to
 * order and pack a run — but they CAN run a command and follow its output. So the scheduling
 * intelligence lives in `ci/lib/` (shared, unit-tested, one source of truth) and reaches the
 * interactive path through this command.
 *
 * It replaces three things the orchestrator previously did by hand, each of which it got wrong
 * at least once in the recorded history:
 *
 *   1. Lane classification by grepping CSVs. The documented rule ("every non-empty Steps cell
 *      carries a runner tag") was applied inconsistently — run REG-2026-08-24-1806 put suite
 *      050h on the browser lane with a hand-written note explaining why, and the same run's
 *      notes show 32 case IDs that do not exist anywhere in the corpus.
 *   2. Dispatch order. Fixed batches of 3 with a barrier between them: each batch costs its
 *      slowest suite and a freed slot idles until the whole batch drains.
 *   3. The firefox rule. `playwright-firefox` cannot click on this storefront or the Admin SPA,
 *      and the rule lived as prose in three separate files, re-derived per decision.
 *
 * Usage:
 *   npm run regression:plan                      # smoke
 *   npm run regression:plan -- critical
 *   npm run regression:plan -- full --verbose    # + per-suite caps
 *   npm run regression:plan -- sprint --json     # machine-readable, for an agent to follow
 *
 * Exit codes: 0 planned cleanly · 1 the selection cannot run as-is (unknown id, missing CSV,
 * no executor, or a cap that would guarantee truncation).
 */
import { existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { loadManifest, resolveSelection, selectionNames, type ManifestSuite } from "../../ci/lib/suite-manifest.ts";
import { classifyLane } from "../../ci/lib/lane-classifier.ts";
import { buildRunPlan, formatRunPlan, type PlannableSuite } from "../../ci/lib/run-plan.ts";
import { orderLpt } from "../../ci/lib/scheduler.ts";
import { formatPreflightProblems, preflightManifest, type PreflightSuite } from "../../ci/lib/manifest-preflight.ts";

const DEFAULT_CONCURRENCY = { browser: 3, fastpath: 4, deterministic: 2 };

function parseArgs(argv: string[]): {
  selection: string;
  json: boolean;
  verbose: boolean;
  concurrency: typeof DEFAULT_CONCURRENCY;
} {
  const args = argv.filter((a) => a !== "--");
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const positional = args.filter((a) => !a.startsWith("--"));

  const numFlag = (name: string, fallback: number): number => {
    const i = args.indexOf(`--${name}`);
    if (i < 0) return fallback;
    const n = parseInt(args[i + 1] ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  return {
    selection: positional[0] || "smoke",
    json: flags.has("--json"),
    verbose: flags.has("--verbose"),
    concurrency: {
      browser: numFlag("browsers", DEFAULT_CONCURRENCY.browser),
      fastpath: numFlag("fastpath", DEFAULT_CONCURRENCY.fastpath),
      deterministic: numFlag("deterministic", DEFAULT_CONCURRENCY.deterministic),
    },
  };
}

/**
 * Browser servers a suite must not be placed on.
 *
 * `clickDriven` is derived into the manifest by `npm run suites:sync`. An idle lane is
 * strictly cheaper than a firefox attempt on a clicking suite: the click resolves the element
 * and then times out on Playwright's actionability gate, so the whole attempt is wasted.
 * Confirmed six times independently; the root cause is in the `@playwright/mcp` layer.
 */
function browserDenyListFor(suite: ManifestSuite): string[] {
  return suite.clickDriven ? ["playwright-firefox"] : [];
}

function main(): void {
  const { selection, json, verbose, concurrency } = parseArgs(process.argv.slice(2));
  const manifest = loadManifest();

  const resolved = resolveSelection(manifest, selection);

  if (resolved.unknownIds.length > 0) {
    console.error(`Unknown suite ID(s): ${resolved.unknownIds.join(", ")}`);
    console.error(`Valid selections: ${selectionNames(manifest).join(", ")}`);
    process.exit(1);
  }
  if (resolved.ids.length === 0) {
    console.error(
      `Selection "${selection}" resolved to ZERO suites after multi-env filters (${resolved.filterSummary}).`,
    );
    console.error("That is almost never intended — check the env filters before running.");
    process.exit(1);
  }

  const suites = resolved.ids
    .map((id) => manifest.suites.find((s) => s.id === id))
    .filter((s): s is ManifestSuite => Boolean(s));

  // Preflight BEFORE planning: a suite with no CSV or no executor is not a scheduling problem,
  // it is a manifest problem, and it should not be discovered mid-run as a "test failure".
  const preflight: PreflightSuite[] = suites.map((s) => ({
    id: s.id,
    csvPath: s.file,
    agent: s.agent,
    runner: s.runner,
    agentPath: join("ci", "agents", `${s.agent}.md`),
  }));
  // The interactive path's agents live under `.claude/agents/`, so a missing `ci/agents/*.md`
  // is not fatal here — only a missing CSV or a suite with no executor at all is.
  const problems = preflightManifest(preflight, { fileExists: existsSync }).filter(
    (p) => p.kind !== "missing-agent",
  );

  const plannable: PlannableSuite[] = suites.map((s) => ({
    id: s.id,
    description: s.name,
    lane: classifyLane(s),
    testCount: s.testCount,
    estimatedMinutes: s.estimatedMinutes,
    preferredBrowser: s.preferredBrowser,
    browserDenyList: browserDenyListFor(s),
  }));

  const plan = buildRunPlan(plannable, concurrency);

  if (json) {
    // Shape the orchestrator follows: per lane, the LPT dispatch order with everything needed
    // to place each suite without re-deriving anything.
    const out = {
      selection,
      filterSummary: resolved.filterSummary,
      skipped: resolved.skipped,
      problems,
      totals: {
        suites: plan.totalSuites,
        cases: plan.totalCases,
        estimatedMinutes: plan.totalEstimatedMinutes,
        predictedMakespanMinutes: plan.makespanMinutes,
        browserBarrierMinutes: plan.browserBarrierMinutes,
      },
      lanes: plan.lanes
        .filter((l) => l.suites.length > 0)
        .map((l) => ({
          lane: l.lane,
          concurrency: l.concurrency,
          makespanMinutes: l.makespanMinutes,
          /** DISPATCH IN THIS ORDER. Longest first, so the tail starts early. */
          dispatchOrder: orderLpt(l.suites).map((s) => ({
            id: s.id,
            description: s.description,
            cases: s.cases,
            estimatedMinutes: s.estimatedMinutes,
            timeoutMinutes: s.timeoutMinutes,
            browserDenyList: s.browserDenyList,
            preferredBrowser: s.preferredBrowser,
          })),
        })),
      capAnomalies: plan.capAnomalies,
    };
    console.log(JSON.stringify(out, null, 2));
    process.exit(problems.length > 0 || plan.capAnomalies.length > 0 ? 1 : 0);
  }

  console.log(`=== Regression plan: ${selection} ===`);
  console.log(`Env filters: ${resolved.filterSummary}`);
  if (resolved.skipped.length > 0) {
    console.log("");
    console.log(`Filtered out (${resolved.skipped.length}) — this is why the run is shorter than expected:`);
    for (const s of resolved.skipped) console.log(`  ${s.id}: ${s.reason}`);
  }
  console.log("");
  console.log(formatRunPlan(plan, { verbose }));

  for (const lane of plan.lanes) {
    if (lane.suites.length === 0) continue;
    console.log("");
    console.log(`Dispatch order — ${lane.lane} lane (longest first, refill a slot as soon as it frees):`);
    for (const s of orderLpt(lane.suites)) {
      const deny = s.browserDenyList.length > 0 ? `  NOT ON ${s.browserDenyList.join(",")}` : "";
      const pref = s.preferredBrowser ? `  REQUIRES ${s.preferredBrowser}` : "";
      console.log(
        `  ${s.id.padEnd(8)}${String(s.estimatedMinutes + "m").padStart(6)}  ${String(s.cases).padStart(4)} cases  ${s.description.slice(0, 44).padEnd(46)}${pref}${deny}`,
      );
    }
  }

  if (problems.length > 0) {
    console.log("");
    console.error(formatPreflightProblems(problems));
    console.error("\nThis selection cannot run as-is.");
    process.exit(1);
  }
  if (plan.capAnomalies.length > 0) {
    console.error("\nCap anomalies above would guarantee truncation — fix before running.");
    process.exit(1);
  }

  console.log("");
  console.log("Plan is runnable: every suite has a CSV and an executor, and no cap guarantees truncation.");
  process.exit(0);
}

// Same CLI guard as scripts/test-cases/sync-test-suites.ts: importing this module must not run it.
const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
