// Pure enumeration + execution of the runner-native (machine-lane) cases, for the Playwright wrapper
// spec. The ~640 GraphQL/REST/MCP rows are NOT rewritten as specs: they stay CSV rows executed by
// `scripts/graphql/graphql-runner.ts`, and the wrapper only exposes them to `playwright test`.
import "../../config.js"; // layered .env loader — the spawned runner inherits process.env
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { isCanonicalHeader, parseSuite } from "../../scripts/test-cases/append-test-cases-to-suite.js";
import { classifyCase, type ClassifiableRow } from "../../scripts/lib/case-classifier.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Same entry as `scripts/regression/machine-lane.ts`: tsx's CLI through `process.execPath`, never `npx` (ENOENT on Windows). */
const TSX_CLI = resolve(ROOT, "node_modules", "tsx", "dist", "cli.mjs");

export interface RunnerCase {
  id: string;
  title: string;
}
export interface RunnerSuite {
  id: string;
  name: string;
  csv: string;
  cases: RunnerCase[];
}
export interface RunnerCases {
  suites: RunnerSuite[];
  skipped: Array<{ file: string; reason: string }>;
}

/**
 * Machine-lane rows of every manifest suite, in manifest order. A CSV that cannot be read or does not
 * carry the canonical header goes to `skipped` (never thrown): `parseSuite` maps fields positionally, so
 * classifying a legacy-header file would route rows on the wrong columns — and one bad file must not
 * abort collection of the other suites.
 */
export function listRunnerCases(manifestPath = resolve(ROOT, "config", "test-suites.json")): RunnerCases {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as {
    suites: Array<{ id: string; name: string; file: string }>;
  };
  const suites: RunnerSuite[] = [];
  const skipped: RunnerCases["skipped"] = [];

  for (const s of manifest.suites) {
    try {
      const raw = readFileSync(resolve(ROOT, s.file), "utf-8");
      if (!isCanonicalHeader(raw)) {
        skipped.push({ file: s.file, reason: "header is not the canonical 15-column format" });
        continue;
      }
      const rows = parseSuite(raw.replace(/^\uFEFF/, "")).rows;
      const cases = rows
        .filter((r) => classifyCase(r as unknown as ClassifiableRow).lane === "machine")
        .map((r) => ({ id: r.ID, title: r.Title }));
      if (cases.length > 0) suites.push({ id: s.id, name: s.name, csv: s.file, cases });
    } catch (e) {
      skipped.push({ file: s.file, reason: e instanceof Error ? e.message : String(e) });
    }
  }
  return { suites, skipped };
}

/** One case through the runner, argv identical to `machine-lane.ts`. A signal / spawn failure is code 3. */
export function runCase(csv: string, id: string, runId: string): { code: number; stdout: string; stderr: string } {
  const proc = spawnSync(
    process.execPath,
    [TSX_CLI, "scripts/graphql/graphql-runner.ts", "--case", `${csv}:${id}`, "--run-id", runId],
    { encoding: "utf-8", env: process.env, cwd: ROOT, timeout: 240_000 },
  );
  return {
    code: proc.status ?? 3,
    stdout: proc.stdout ?? "",
    stderr: (proc.stderr ?? "") + (proc.error ? `\n${proc.error.message}` : ""),
  };
}

/** `SPECS-20261021T101500` — the default run id when `RUN_ID` is not supplied. */
export function defaultRunId(now = new Date()): string {
  return "SPECS-" + now.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "");
}

export const REPO_ROOT = ROOT;
