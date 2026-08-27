#!/usr/bin/env -S npx tsx
/**
 * `npm run suites:machine -- <suiteId> --run-id <RUN_ID>` — execute a suite's
 * machine-classified cases with `scripts/graphql/graphql-runner.ts`, and write the machine
 * fragment.
 *
 * WHY A SCRIPT AND NOT PROSE IN AN AGENT FILE. This exit-code mapping currently lives as a
 * table in `.claude/agents/test-runner-agent.md` (§GQL-2), which means an LLM re-derives it
 * every run. It is deterministic, so it belongs in code — and once it is here, the runner
 * agent loses a whole mode, a linter invocation, an exit-code table and a class of mistakes.
 *
 * WHAT THE EXIT CODES MEAN (graphql-runner.ts): 0 PASS · 1 FAIL · 2 structural/parse error
 * · 3 uncaught. The interesting one is 2.
 *
 * EXIT 2 IS FAIL-CLOSED, AND THAT IS THE WHOLE SAFETY ARGUMENT. A 2 means the classifier
 * said "the runner can parse this" and the runner disagreed — a classifier bug. The case is
 * then RETURNED to the browser lane (appended to the browser CSV, its lane flipped in the
 * plan) and the disagreement is recorded in `errors[]` so the classifier gets fixed. This is
 * cheap precisely because the machine lane runs FIRST, before any browser agent is
 * dispatched: nothing has to be undone. A case must never be able to vanish because a
 * compiler was wrong about it.
 *
 * Exit 3 stays BLOCKED: an uncaught error is a runtime/environment failure, not a claim
 * about whether the case is executable.
 *
 * SEQUENTIAL BY DEFAULT. Cases inside one suite can share platform state (a created org, a
 * seeded cart) even though `[GQL-CAPTURE]` variables never cross a case boundary. Running in
 * CSV order preserves exactly today's semantics; `--concurrency N` is available for a suite
 * known to be independent, but the default must not quietly change behaviour to buy speed.
 *
 * Usage:
 *   npm run suites:machine -- 050h --run-id REG-2026-08-26-1200
 *   npm run suites:machine -- 050h --run-id … --dry-run    # list what would run
 *
 * Exit codes: 0 every case reported a verdict · 1 at least one case FAILED (a real defect
 * signal for the caller) · 2 the lanes plan is missing.
 */
import { spawnSync } from "child_process";
import { existsSync, readFileSync, writeFileSync, appendFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { COLUMNS, parseSuite, serialiseRows, type Row } from "../test-cases/append-test-cases-to-suite.js";
import type { CaseLane } from "../lib/suite-results-merge.js";

/**
 * tsx's CLI entry, invoked through `process.execPath`.
 *
 * NOT `spawnSync("npx", …)`: on Windows the executable is `npx.cmd`, so a bare "npx" ENOENTs
 * and EVERY case comes back BLOCKED with `exited null` — a whole-lane outage that reads like
 * an environment problem rather than a spawn bug (observed on REG-2026-08-26-1600: 29/29
 * BLOCKED, 2ms each). Same trap, same fix as `scripts/unit/lane-planner.test.ts` and
 * `scripts/test-data/author-fixtures.ts`; needs no shell, so a path containing a space
 * cannot be re-split by one.
 */
const TSX_CLI = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));

interface LanesFile {
  suiteId: string;
  suiteName?: string;
  machineSourceCsv: string;
  browserCsv: string;
  planned: Array<{ id: string; lane: CaseLane }>;
}

interface CaseRow {
  id: string;
  status: "PASS" | "FAIL" | "BLOCKED";
  title?: string;
  failedAssertion?: string;
  evidenceFile?: string;
  durationMs?: number;
  notes?: string;
}

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : undefined;
}

/** The runner prints `EVIDENCE_FILE=<basename>` for exactly this purpose. */
function evidenceFileFrom(stdout: string): string | undefined {
  const m = stdout.match(/^EVIDENCE_FILE=(.+)$/m);
  return m ? m[1].trim() : undefined;
}

/** First failed assertion, read from the evidence the runner already wrote. */
function failedAssertionFrom(evidenceDir: string, file: string | undefined): string | undefined {
  if (!file) return undefined;
  const path = join(evidenceDir, file);
  if (!existsSync(path)) return undefined;
  try {
    const ev = JSON.parse(readFileSync(path, "utf-8")) as {
      assertions?: Array<{ passed?: boolean; raw?: string; predicate?: string; kind?: string }>;
    };
    const bad = (ev.assertions ?? []).find((a) => a.passed === false);
    if (!bad) return undefined;
    return bad.raw ?? `[${bad.kind ?? "?"}] ${bad.predicate ?? ""}`.trim();
  } catch {
    return undefined;
  }
}

function main(): void {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const suiteId = args.find((a) => !a.startsWith("--"));
  const runId = argValue(args, "run-id") ?? process.env.RUN_ID;
  const dryRun = args.includes("--dry-run");

  if (!suiteId || !runId) {
    console.error("Usage: npm run suites:machine -- <suiteId> --run-id <RUN_ID> [--dry-run]");
    process.exit(2);
  }

  const runDir = argValue(args, "out") ?? join("reports", "regression", runId);
  const lanesPath = join(runDir, `suite-${suiteId}-lanes.json`);
  if (!existsSync(lanesPath)) {
    console.error(`[suites:machine] no lanes plan at ${lanesPath} — run \`npm run suites:lanes -- ${suiteId} --run-id ${runId}\` first.`);
    process.exit(2);
  }

  const lanes = JSON.parse(readFileSync(lanesPath, "utf-8")) as LanesFile;
  const machineIds = lanes.planned.filter((p) => p.lane === "machine").map((p) => p.id);
  const evidenceDir = join(runDir, "graphql-evidence");

  if (machineIds.length === 0) {
    console.log(`[suites:machine] ${suiteId}: no machine cases — nothing to run.`);
    return;
  }
  if (dryRun) {
    console.log(`[suites:machine] ${suiteId}: would run ${machineIds.length} case(s) against ${lanes.machineSourceCsv}`);
    for (const id of machineIds) console.log(`  ${id}`);
    return;
  }

  const startedAt = new Date().toISOString();
  const cases: CaseRow[] = [];
  const errors: string[] = [];
  /** Cases the runner could not parse — returned to the browser lane below. */
  const rerouted: string[] = [];

  for (const id of machineIds) {
    const t0 = Date.now();
    const proc = spawnSync(
      process.execPath,
      [
        TSX_CLI,
        "scripts/graphql/graphql-runner.ts",
        "--case",
        `${lanes.machineSourceCsv}:${id}`,
        "--run-id",
        runId,
      ],
      { encoding: "utf-8", env: process.env },
    );
    const durationMs = Date.now() - t0;
    const stdout = proc.stdout ?? "";
    const evidenceFile = evidenceFileFrom(stdout);
    const code = proc.status;

    if (code === 0) {
      cases.push({ id, status: "PASS", evidenceFile, durationMs });
      console.log(`  PASS    ${id} (${durationMs}ms)`);
      continue;
    }
    if (code === 1) {
      cases.push({
        id,
        status: "FAIL",
        evidenceFile,
        durationMs,
        failedAssertion: failedAssertionFrom(evidenceDir, evidenceFile),
      });
      console.log(`  FAIL    ${id} (${durationMs}ms)`);
      continue;
    }
    if (code === 2) {
      // Classifier bug. Return the case to the browser lane rather than reporting a verdict
      // the runner is not entitled to give.
      rerouted.push(id);
      errors.push(
        `case ${id} was classified machine but graphql-runner exited 2 (structure/parse) — ` +
          `returned to the browser lane; fix scripts/lib/case-classifier.ts so it is not ` +
          `misrouted again. Runner said: ${(proc.stderr ?? stdout).trim().split("\n").slice(-3).join(" / ").slice(0, 300)}`,
      );
      console.log(`  REROUTE ${id} → browser lane (runner could not parse it)`);
      continue;
    }
    // 3, a signal, or a spawn failure: a runtime problem, not a claim about the case.
    cases.push({
      id,
      status: "BLOCKED",
      evidenceFile,
      durationMs,
      notes: `graphql-runner exited ${code ?? "null"}${proc.error ? ` (${proc.error.message})` : ""}`,
    });
    console.log(`  BLOCKED ${id} (exit ${code ?? "null"})`);
  }

  // --- return misrouted cases to the browser lane ---------------------------------
  if (rerouted.length > 0) {
    for (const p of lanes.planned) if (rerouted.includes(p.id)) p.lane = "browser";
    writeFileSync(lanesPath, JSON.stringify(lanes, null, 2) + "\n", "utf-8");

    const source = parseSuite(readFileSync(lanes.machineSourceCsv, "utf-8").replace(/^﻿/, "")).rows as Row[];
    const rows = source.filter((r) => rerouted.includes(r.ID));
    const target = lanes.browserCsv || join(runDir, `suite-${suiteId}-resolved.browser.csv`);
    mkdirSync(runDir, { recursive: true });
    if (existsSync(target)) {
      appendFileSync(target, serialiseRows(rows), "utf-8");
    } else {
      writeFileSync(target, `${COLUMNS.join(",")}\n${serialiseRows(rows)}`, "utf-8");
      lanes.browserCsv = target;
      writeFileSync(lanesPath, JSON.stringify(lanes, null, 2) + "\n", "utf-8");
    }
  }

  const fragment = {
    suiteId,
    suiteName: lanes.suiteName ?? "",
    runId,
    lane: "machine",
    environment: process.env.TEST_ENV ?? "vcst",
    startedAt,
    completedAt: new Date().toISOString(),
    totalCases: cases.length,
    passed: cases.filter((c) => c.status === "PASS").length,
    failed: cases.filter((c) => c.status === "FAIL").length,
    blocked: cases.filter((c) => c.status === "BLOCKED").length,
    skipped: 0,
    testCases: cases,
    bugs: [],
    errors,
  };

  mkdirSync(runDir, { recursive: true });
  const out = join(runDir, `suite-${suiteId}-results.machine.json`);
  writeFileSync(out, JSON.stringify(fragment, null, 2) + "\n", "utf-8");

  console.log(
    `\n[suites:machine] ${out}: ${fragment.passed} pass · ${fragment.failed} fail · ` +
      `${fragment.blocked} blocked${rerouted.length ? ` · ${rerouted.length} rerouted to browser` : ""}`,
  );
  // Counts are the caller's signal; the merge step owns the canonical envelope.
  process.exit(fragment.failed > 0 ? 1 : 0);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();

export { evidenceFileFrom, failedAssertionFrom };
