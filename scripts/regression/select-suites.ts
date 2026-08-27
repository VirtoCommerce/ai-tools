#!/usr/bin/env node
/**
 * select-suites — the deterministic answer to "which suites does this change need?"
 *
 *   npm run regression:select -- --repo vc-module-catalog --diff HEAD~1..HEAD
 *   npm run regression:select -- --repo vc-frontend --changed-files changed.txt
 *   npm run regression:select -- --repo vc-frontend --path client-app/shared/checkout/x.vue
 *   npm run regression:select -- --repo vc-module-order --diff main..HEAD --target 60 --json
 *
 * It exists to replace an LLM. `ci/run-full-cycle.ts:104` asks an agent to print
 * `AFFECTED_SUITES: <ids>` and parses it with a regex at `:113`. That has already hallucinated —
 * the `REG-2026-08-24-1806` notes carry 32 claimed new-case IDs that do not exist, each exactly
 * the next sequential number after a real suite's maximum. This cannot invent a suite id: every
 * id it prints came out of `config/test-suites.json`.
 *
 * WHERE THE DIFF COMES FROM. The suites test the VirtoCommerce product, not this repo, so the
 * interesting diff is usually in another checkout. `--diff <range>` reads THIS repo (useful when
 * test cases themselves changed); `--changed-files <file>` and repeated `--path` take a list from
 * anywhere, which is how a product PR's file list gets in. `--repo` names the repository those
 * paths belong to, as `ci/config/fix-repos.json` names it — without it the paths cannot be placed.
 *
 * Exit codes: 0 a selection was produced · 1 bad usage · 2 the manifest could not be read.
 *
 * NOT the default for anything yet, deliberately. Whether a scoped selection catches what `full`
 * catches is a question about MISSED regressions, and answering it needs run history that does not
 * exist (`history.json` is un-ignored per A4 but no run has written one). Run it in shadow beside
 * a periodic `full` for several cycles first; making it the default now would trade a measured
 * cost for an unmeasured risk.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

import { classifyLane } from "../../ci/lib/lane-classifier.js";
import { loadManifest } from "../../ci/lib/suite-manifest.js";
import { resolveSuiteSource } from "../test-cases/suite-source-map.js";
import {
  formatSelection,
  selectSuites,
  type ChangedPath,
  type HistorySignal,
  type SelectableSuite,
} from "../lib/suite-selection.js";

const CONCURRENCY = { browser: 3, fastpath: 4, deterministic: 2 } as const;
const HISTORY_PATH = "reports/regression/history.json";

interface Args {
  repo: string;
  diff: string | null;
  changedFiles: string | null;
  paths: string[];
  target: number | null;
  rotationCount: number;
  json: boolean;
}

function parseArgs(argv: readonly string[]): Args | { error: string } {
  const a: Args = { repo: "", diff: null, changedFiles: null, paths: [], target: null, rotationCount: 3, json: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    const next = () => argv[++i];
    if (v === "--repo") a.repo = next() ?? "";
    else if (v === "--diff") a.diff = next() ?? null;
    else if (v === "--changed-files") a.changedFiles = next() ?? null;
    else if (v === "--path") a.paths.push(next() ?? "");
    else if (v === "--target") a.target = Number(next());
    else if (v === "--rotation") a.rotationCount = Number(next());
    else if (v === "--json") a.json = true;
    else return { error: `unknown argument '${v}'` };
  }
  if (!a.repo) return { error: "--repo <name> is required: the paths cannot be placed without it" };
  if (!a.diff && !a.changedFiles && a.paths.length === 0) {
    return { error: "give one of --diff <range>, --changed-files <file>, or one or more --path <p>" };
  }
  if (a.target !== null && (!Number.isFinite(a.target) || a.target <= 0)) {
    return { error: "--target must be a positive number of minutes" };
  }
  return a;
}

function collectPaths(a: Args): string[] {
  const out = [...a.paths];
  if (a.changedFiles) {
    if (!existsSync(a.changedFiles)) throw new Error(`--changed-files not found: ${a.changedFiles}`);
    out.push(...readFileSync(a.changedFiles, "utf-8").split(/\r?\n/));
  }
  if (a.diff) {
    // No shell: the range is passed as an argv element, so a range containing shell
    // metacharacters cannot become a command.
    const stdout = execFileSync("git", ["diff", "--name-only", a.diff], { encoding: "utf-8" });
    out.push(...stdout.split(/\r?\n/));
  }
  return [...new Set(out.map((p) => p.trim()).filter(Boolean))];
}

/**
 * History signals, if a run has ever written them.
 *
 * Absent today, and that is stated rather than hidden: A4 un-ignored the file but no run has
 * produced one, so this returns [] and the history rule is a documented no-op.
 */
function loadHistory(): { signals: HistorySignal[]; note: string } {
  if (!existsSync(HISTORY_PATH)) {
    return { signals: [], note: `no ${HISTORY_PATH} yet — the history signal is inert until a run writes one` };
  }
  try {
    const raw = JSON.parse(readFileSync(HISTORY_PATH, "utf-8")) as unknown;
    const rows = Array.isArray(raw) ? raw : (raw as { runs?: unknown[] }).runs ?? [];
    const bySuite = new Map<string, { fails: number; streak: number }>();
    for (const r of rows as Array<Record<string, unknown>>) {
      const id = String(r.suiteId ?? r.suite ?? "");
      if (!id) continue;
      const failed = Number(r.failed ?? 0) > 0;
      const cur = bySuite.get(id) ?? { fails: 0, streak: 0 };
      cur.fails += failed ? 1 : 0;
      cur.streak = failed ? cur.streak + 1 : 0;
      bySuite.set(id, cur);
    }
    return {
      signals: [...bySuite].map(([suiteId, v]) => ({ suiteId, consecutiveDrops: v.streak })),
      note: `${bySuite.size} suite(s) seen in ${HISTORY_PATH}`,
    };
  } catch (e) {
    // A malformed history must not decide a selection either way.
    return { signals: [], note: `${HISTORY_PATH} unreadable (${(e as Error).message}) — history signal skipped` };
  }
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2));
  if ("error" in parsed) {
    console.error(`[select-suites] ${parsed.error}`);
    return 1;
  }

  let manifest;
  try {
    manifest = loadManifest();
  } catch (e) {
    console.error(`[select-suites] ${(e as Error).message}`);
    return 2;
  }

  const suites: SelectableSuite[] = manifest.suites.map((s) => {
    const raw = s as unknown as Record<string, unknown>;
    return {
      id: s.id,
      name: s.name,
      file: s.file,
      domain: raw.domain as string | undefined,
      layer: raw.layer as string | undefined,
      priority: raw.priority as string | undefined,
      tags: raw.tags as string[] | undefined,
      testCount: s.testCount,
      estimatedMinutes: raw.estimatedMinutes as number | undefined,
      requiresModules: raw.requiresModules as string[] | undefined,
      clickDriven: raw.clickDriven as boolean | undefined,
      runner: raw.runner as string | undefined,
      preferredBrowser: raw.preferredBrowser as string | undefined,
      // Supplied, not re-derived: classifyLane reads the CSV to spot a runner-native suite, and a
      // local `runner ? deterministic : browser` shortcut disagreed with it by 306 minutes on the
      // whole-corpus baseline — i.e. it would have overstated this selector's own saving.
      lane: classifyLane({ file: s.file, runner: raw.runner as string | undefined }),
    };
  });

  const suiteRepos = new Map<string, readonly string[]>();
  for (const s of manifest.suites) {
    const raw = s as unknown as Record<string, unknown>;
    suiteRepos.set(s.id, resolveSuiteSource(s.id, (raw.requiresModules as string[] | undefined) ?? []).repos);
  }

  let paths: string[];
  try {
    paths = collectPaths(parsed);
  } catch (e) {
    console.error(`[select-suites] ${(e as Error).message}`);
    return 1;
  }
  if (paths.length === 0) {
    console.error(`[select-suites] the diff is empty — nothing changed, so nothing is selected beyond the risk floor`);
  }

  const changed: ChangedPath[] = paths.map((p) => ({ repo: parsed.repo, path: p }));
  const history = loadHistory();

  const result = selectSuites({
    suites,
    changed,
    suiteRepos,
    history: history.signals,
    // Rotation order is the audit queue's, so an untouched suite still comes round eventually
    // instead of rotting unnoticed. Cheap to derive: staleness is already the queue's sort key.
    rotation: suites.map((s) => s.id),
    rotationCount: parsed.rotationCount,
    targetMinutes: parsed.target,
    concurrency: CONCURRENCY,
  });

  if (parsed.json) {
    console.log(JSON.stringify({ repo: parsed.repo, changedPaths: paths.length, historyNote: history.note, ...result }, null, 2));
    return 0;
  }

  console.log(formatSelection(result));
  console.log("");
  console.log(`repo: ${parsed.repo} · ${paths.length} changed path(s) · ${history.note}`);
  console.log(
    `This is a SHADOW tool: it is not the default for any pipeline. Run it beside a periodic ` +
      `\`full\` and compare what it would have skipped before trusting it.`,
  );
  return 0;
}

// Only run when invoked directly, so importing for tests has no side effects.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split(/[\\/]/).pop() ?? "")) {
  process.exit(main());
}

export { loadHistory, parseArgs };
