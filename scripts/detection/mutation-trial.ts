#!/usr/bin/env -S npx tsx
/**
 * `npm run detect:mutate -- <suiteId|csvPath>` — the detection trial (REQ-01, trial 2 of
 * `docs/bug-detection-requirements.md`): does this suite catch the bug classes customers report?
 *
 * 1. CLEAN — run every machine-lane case with the preload in probe mode, `--repeat` times. A case
 *    that does not pass every clean repetition is excluded: a mutant "killing" it proves nothing.
 *    The probe also records which mutants each case's responses can express.
 * 2. MUTATE — for every mutant, re-run only the stable cases whose responses it can act on, with
 *    the preload editing live GraphQL responses (`scripts/detection/mutants.mjs`).
 * 3. SCORE — KILLED / SURVIVED / NOT_EXERCISED per mutant (`score.mjs`), written as JSON + Markdown.
 *
 * The runner (`scripts/graphql/graphql-runner.ts`) is not modified: the preload is injected through
 * NODE_OPTIONS, so the trial measures the suite exactly as the machine lane runs it. It needs the
 * same environment as a regression run (`TEST_ENV`, `BACK_URL`, credentials in `.env.local`).
 *
 * Usage:
 *   npm run detect:mutate -- 050a
 *   npm run detect:mutate -- 050a --mutants TRUNCATE_PAGE,SILENT_ERROR --cases GQL-001,GQL-002
 *   npm run detect:mutate -- 050a --repeat 2 --out reports/coverage/COV-2026-10-01-mutation-050a
 *   npm run detect:mutate -- 050a --dry-run
 *
 * Exit codes: 0 trial completed (whatever the score) · 2 bad arguments or no runnable cases.
 */
import "../lib/sync-stdio.mjs";
import { spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { parseSuite } from "../test-cases/append-test-cases-to-suite.js";
import { classifyCase } from "../lib/case-classifier.js";
import { MUTANTS, mutantIds } from "./mutants.mjs";
import { scoreTrial, stableCleanCases } from "./score.mjs";

const TSX_CLI = fileURLToPath(new URL("../../node_modules/tsx/dist/cli.mjs", import.meta.url));
const PRELOAD = pathToFileURL(fileURLToPath(new URL("./mutant-preload.mjs", import.meta.url))).href;
const RUNNER = "scripts/graphql/graphql-runner.ts";

interface Manifest { suites: Array<{ id: string; file: string }> }

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function resolveSuite(target: string): { id: string; file: string } {
  if (target.endsWith(".csv")) return { id: target.replace(/^.*\//, "").replace(/\.csv$/, ""), file: target };
  const manifest = JSON.parse(readFileSync("config/test-suites.json", "utf-8")) as Manifest;
  const hit = manifest.suites.find((s) => s.id === target);
  if (!hit) throw new Error(`suite "${target}" is not in config/test-suites.json`);
  return hit;
}

function stamp(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
}

/** One runner invocation. Returns the exit code and the preload's log lines for this run. */
function runCase(csv: string, id: string, evidenceDir: string, logFile: string, env: Record<string, string>) {
  rmSync(logFile, { force: true });
  const proc = spawnSync(process.execPath, [TSX_CLI, RUNNER, "--case", `${csv}:${id}`, "--evidence-dir", evidenceDir], {
    encoding: "utf-8",
    env: {
      ...process.env,
      ...env,
      DETECTION_LOG: logFile,
      NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${PRELOAD}`.trim(),
    },
  });
  const lines = existsSync(logFile)
    ? readFileSync(logFile, "utf-8").split("\n").filter(Boolean).map((l) => JSON.parse(l))
    : [];
  return { exit: proc.status, lines };
}

function markdown(suite: { id: string; file: string }, result: ReturnType<typeof scoreTrial>, meta: Record<string, unknown>): string {
  const pct = result.score === null ? "n/a" : `${Math.round(result.score * 100)}%`;
  const rows = result.mutants
    .map((m) => `| \`${m.id}\` | ${m.archetype} | ${m.status} | ${m.killedBy.slice(0, 5).join(", ") || "—"} | ${m.exercisedBy.length} | ${m.models} |`)
    .join("\n");
  return `# Mutation trial — suite ${suite.id}

- **Suite:** \`${suite.file}\`
- **Environment:** ${meta.testEnv} · **run:** ${meta.startedAt} → ${meta.finishedAt}
- **Cases:** ${meta.machineCases} machine-lane · ${meta.stableCases} stable on the clean build · ${meta.excludedCases} excluded (did not pass every clean run)
- **Score:** ${result.killed} killed / ${result.killed + result.survived} exercised = **${pct}** · ${result.notExercised} mutant(s) never exercised (the suite never reads that shape)

| Mutant | Archetype | Verdict | Killed by (first 5) | Cases exercised | Models |
|---|---|---|---|---|---|
${rows}

KILLED: a case failed with the mutant and passed without it. SURVIVED: the suite saw the mutated response and still passed.
NOT_EXERCISED: no case produced a response the mutant could act on. Only KILLED counts as caught.
`;
}

function main() {
  const args = process.argv.slice(2);
  const VALUED = new Set(["--mutants", "--cases", "--repeat", "--out"]);
  const target = args.find((a, i) => !a.startsWith("--") && !VALUED.has(args[i - 1] ?? ""));
  if (!target) {
    console.error("Usage: npm run detect:mutate -- <suiteId|csvPath> [--mutants A,B] [--cases X,Y] [--repeat N] [--out dir] [--dry-run]");
    process.exit(2);
  }
  const suite = resolveSuite(target);
  const repeat = Math.max(1, Number(argValue(args, "repeat") ?? 1));
  const onlyCases = argValue(args, "cases")?.split(",").map((s) => s.trim()).filter(Boolean);
  const onlyMutants = argValue(args, "mutants")?.split(",").map((s) => s.trim()).filter(Boolean);
  for (const m of onlyMutants ?? []) if (!mutantIds().includes(m)) throw new Error(`unknown mutant "${m}"`);
  const mutants = MUTANTS.filter((m) => !onlyMutants || onlyMutants.includes(m.id));

  const { rows } = parseSuite(readFileSync(suite.file, "utf-8").replace(/^﻿/, ""));
  const machine = rows
    .map((r) => classifyCase({ ID: r.ID, Steps: r.Steps ?? "", Assertions: r.Assertions ?? "", Automation_Status: r.Automation_Status }))
    .filter((v) => v.lane === "machine")
    .map((v) => v.id)
    .filter((id) => !onlyCases || onlyCases.includes(id));

  if (machine.length === 0) {
    console.error(`[detect:mutate] ${suite.id}: no machine-lane cases to run.`);
    process.exit(2);
  }
  if (args.includes("--dry-run")) {
    console.log(`[detect:mutate] ${suite.id}: ${machine.length} machine case(s) × up to ${mutants.length} mutant(s), clean runs ×${repeat}`);
    for (const id of machine) console.log(`  ${id}`);
    return;
  }

  const outDir = resolve(argValue(args, "out") ?? join("reports", "coverage", `COV-${stamp()}-mutation-${suite.id}`));
  const evidenceDir = join(outDir, "evidence");
  mkdirSync(evidenceDir, { recursive: true });
  const logFile = join(outDir, ".preload.jsonl");
  const startedAt = new Date().toISOString();

  // 1. CLEAN + probe
  const cleanExits: Record<string, number[]> = {};
  const applicable: Record<string, Set<string>> = {};
  for (const id of machine) {
    cleanExits[id] = [];
    applicable[id] = new Set();
    for (let i = 0; i < repeat; i++) {
      const { exit, lines } = runCase(suite.file, id, evidenceDir, logFile, { DETECTION_PROBE: "1" });
      cleanExits[id].push(exit ?? -1);
      for (const l of lines) for (const m of l.applicable ?? []) applicable[id].add(m);
    }
    console.log(`  clean   ${id}  exits=${cleanExits[id].join(",")}  expressible=${[...applicable[id]].join(",") || "—"}`);
  }
  const { stable, excluded } = stableCleanCases(cleanExits);

  // 2. MUTATE
  const runs: Array<{ mutant: string; caseId: string; exit: number | null; applied: boolean }> = [];
  for (const m of mutants) {
    for (const id of stable) {
      if (!applicable[id].has(m.id)) continue;
      const { exit, lines } = runCase(suite.file, id, evidenceDir, logFile, { DETECTION_MUTANT: m.id });
      const applied = lines.some((l) => l.applied);
      runs.push({ mutant: m.id, caseId: id, exit, applied });
      console.log(`  ${m.id.padEnd(18)} ${id}  exit=${exit}${applied ? "" : " (not applied)"}`);
    }
  }
  rmSync(logFile, { force: true });

  // 3. SCORE
  const result = scoreTrial({ mutants, runs });
  const meta = {
    suite: suite.id,
    file: suite.file,
    testEnv: process.env.TEST_ENV ?? "vcst",
    startedAt,
    finishedAt: new Date().toISOString(),
    repeat,
    machineCases: machine.length,
    stableCases: stable.length,
    excludedCases: excluded.length,
  };
  writeFileSync(join(outDir, "mutation-trial.json"), JSON.stringify({ meta, excluded, ...result, runs }, null, 2));
  writeFileSync(join(outDir, "mutation-trial.md"), markdown(suite, result, meta));
  const pct = result.score === null ? "n/a" : `${Math.round(result.score * 100)}%`;
  console.log(`\n[detect:mutate] ${suite.id}: ${result.killed} killed · ${result.survived} survived · ${result.notExercised} not exercised · score ${pct}`);
  console.log(`[detect:mutate] report: ${join(outDir, "mutation-trial.md")}`);
}

const isCli = !!process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isCli) main();
