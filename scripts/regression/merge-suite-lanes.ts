#!/usr/bin/env -S npx tsx
/**
 * `npm run suites:merge -- <suiteId> --run-id <RUN_ID>` — fold the per-lane result fragments
 * into the canonical `suite-{ID}-results.json`.
 *
 * Thin CLI over `scripts/lib/suite-results-merge.ts`, which holds every invariant and every
 * unit test. The split lives here only because the merge logic must be callable from a test
 * without a filesystem, and because the live dashboard may invoke this mid-run.
 *
 * MUST RUN BEFORE ANY READER. `scripts/lib/regression-triage.ts` and
 * `generate-regression-html-report.ts` both de-duplicate by `suiteId`, keeping the file with
 * the most cases — so if the fragments were left in place under names those readers match,
 * one lane's results would silently win and the other's would vanish. The fragments are
 * therefore named `suite-{ID}-results.{lane}.json` and this command produces the one file
 * the readers are meant to see.
 *
 * Usage:
 *   npm run suites:merge -- 050h --run-id REG-2026-08-26-1200
 *   npm run suites:merge -- 050h --run-id … --dry-run     # print, write nothing
 *
 * Exit codes: 0 merged · 1 an invariant was violated (the lane split leaked — nothing is
 * written) · 2 the lanes plan is missing, so there is no authoritative case set to merge
 * against.
 */
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { mergeSuiteResults, type CaseLane, type Fragment } from "../lib/suite-results-merge.js";

const LANES: CaseLane[] = ["machine", "browser"];

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const suiteId = args.find((a) => !a.startsWith("--"));
  const runId = argValue(args, "run-id") ?? process.env.RUN_ID;
  const dryRun = args.includes("--dry-run");

  if (!suiteId || !runId) {
    console.error("Usage: npm run suites:merge -- <suiteId> --run-id <RUN_ID> [--dry-run]");
    process.exit(2);
  }

  const runDir = argValue(args, "out") ?? join("reports", "regression", runId);
  const lanesPath = join(runDir, `suite-${suiteId}-lanes.json`);

  if (!existsSync(lanesPath)) {
    // Refusing is the point. Without the plan the merger would have to derive its case set
    // from the fragments, and then a lane that died before writing would produce a smaller,
    // greener suite — the failure this whole file exists to make impossible.
    console.error(`[suites:merge] no lanes plan at ${lanesPath}.`);
    console.error(`Run \`npm run suites:lanes -- ${suiteId} --run-id ${runId}\` first: without it there is`);
    console.error(`no authoritative list of what SHOULD have run, so a dead lane cannot be told from a short suite.`);
    process.exit(2);
  }

  const lanes = JSON.parse(readFileSync(lanesPath, "utf-8")) as {
    suiteId: string;
    suiteName?: string;
    planned: Array<{ id: string; lane: CaseLane }>;
  };

  const fragments: Fragment[] = [];
  for (const lane of LANES) {
    const path = join(runDir, `suite-${suiteId}-results.${lane}.json`);
    if (!existsSync(path)) continue;
    try {
      fragments.push({ lane, source: path, envelope: JSON.parse(readFileSync(path, "utf-8")) });
    } catch (e) {
      console.error(`[suites:merge] ${path} is not valid JSON: ${(e as Error).message}`);
      console.error(`Treating it as absent would turn a writer's crash into a silently shorter suite.`);
      process.exit(1);
    }
  }

  const { envelope, errors, warnings } = mergeSuiteResults({
    suiteId,
    suiteName: lanes.suiteName,
    runId,
    planned: lanes.planned,
    fragments,
  });

  for (const w of warnings) console.warn(`[suites:merge] WARN ${w}`);

  if (errors.length > 0) {
    console.error(`[suites:merge] FAIL — ${errors.length} invariant violation(s); nothing written:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  const outPath = join(runDir, `suite-${suiteId}-results.json`);
  const counts = envelope.lanes as Record<string, number>;
  const summary =
    `${envelope.totalCases} cases (${Object.entries(counts).map(([l, n]) => `${n} ${l}`).join(", ")}) — ` +
    `${envelope.passed} pass · ${envelope.failed} fail · ${envelope.blocked} blocked · ${envelope.skipped} skipped`;

  if (dryRun) {
    console.log(`[suites:merge] would write ${outPath}: ${summary}`);
    return;
  }

  writeFileSync(outPath, JSON.stringify(envelope, null, 2) + "\n", "utf-8");
  console.log(`[suites:merge] ${outPath}: ${summary}`);
  if (fragments.length === 0) {
    console.warn(`[suites:merge] no fragments found — every planned case is recorded as BLOCKED (lane_lost).`);
  }
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
