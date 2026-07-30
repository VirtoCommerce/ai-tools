#!/usr/bin/env tsx
/**
 * Validate config/test-suites.json and refresh derivable _meta fields.
 *
 * `selections` holds rule objects (not flat string arrays); consumers expand
 * them at load time. This script only:
 *   - sorts `suites` by id
 *   - refreshes `_meta.totalSuites` and `_meta.generated`
 *   - verifies every rule expands to known suite IDs
 *
 * Usage:
 *   npm run suites:sync          rewrite the file
 *   npm run suites:lint          exit 1 if file is out of sync (for CI)
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";
import { parse as parseCsv } from "csv-parse/sync";

const MANIFEST_PATH = join("config", "test-suites.json");
const CHECK_MODE = process.argv.includes("--check");

/**
 * Strict CSV lint baseline — a BURN-DOWN list of suites that already fail the
 * strict parse as of 2026-07-01 (malformed quote-escaping / unquoted commas, or
 * a missing file for 080). This is a ratchet, NOT a permanent exemption: the lint
 * hard-fails on any suite NOT in this set, so new drift is caught immediately.
 * Fix a listed suite and remove its id here — the lint will remind you (a
 * baselined suite that now passes is reported as "stale baseline entry").
 * Goal: shrink this to empty.
 */
const CSV_LINT_BASELINE = new Set<string>([
  "015", "026", "044", "045", "052", "080",
]);

interface Suite {
  id: string;
  name: string;
  file: string;
  domain: string;
  layer: string;
  concern: string;
  priority: string;
  testCount: number;
  estimatedMinutes: number;
  agent: string;
  tags: string[];
}

type WhereFilter = Partial<Pick<Suite, "domain" | "layer" | "concern" | "priority">> & {
  tag?: string;
  tagAny?: string[];
};

type SelectionRule =
  | { include: string[]; exclude?: string[] }
  | { all: true; exclude?: string[] }
  | { where: WhereFilter; include?: string[]; exclude?: string[] };

interface Manifest {
  $schema?: string;
  _meta: {
    version: string;
    description: string;
    generated: string;
    totalSuites: number;
    [k: string]: unknown;
  };
  defaults: Record<string, unknown>;
  browserPool: unknown[];
  suites: Suite[];
  selections: Record<string, SelectionRule | { _doc?: string }>;
}

function matchesWhere(suite: Suite, where: WhereFilter): boolean {
  if (where.domain && suite.domain !== where.domain) return false;
  if (where.layer && suite.layer !== where.layer) return false;
  if (where.concern && suite.concern !== where.concern) return false;
  if (where.priority && suite.priority !== where.priority) return false;
  if (where.tag && !suite.tags.includes(where.tag)) return false;
  if (where.tagAny && !where.tagAny.some((t) => suite.tags.includes(t))) return false;
  return true;
}

function expandRule(rule: SelectionRule, suites: Suite[]): string[] {
  let ids: string[];
  if ("include" in rule && !("where" in rule) && !("all" in rule)) {
    ids = [...rule.include];
  } else if ("all" in rule) {
    ids = suites.map((s) => s.id);
  } else if ("where" in rule) {
    ids = suites.filter((s) => matchesWhere(s, rule.where)).map((s) => s.id);
    if (rule.include) {
      for (const id of rule.include) if (!ids.includes(id)) ids.push(id);
    }
  } else {
    throw new Error(`Invalid rule: ${JSON.stringify(rule)}`);
  }
  if ("exclude" in rule && rule.exclude) {
    const ex = new Set(rule.exclude);
    ids = ids.filter((id) => !ex.has(id));
  }
  return ids;
}

function validateRules(manifest: Manifest): string[] {
  const errors: string[] = [];
  const allIds = new Set(manifest.suites.map((s) => s.id));
  for (const [name, rule] of Object.entries(manifest.selections)) {
    if (name.startsWith("_")) continue;
    try {
      const ids = expandRule(rule as SelectionRule, manifest.suites);
      if (ids.length === 0) {
        errors.push(`selection "${name}" expands to empty list`);
      }
      for (const id of ids) {
        if (!allIds.has(id)) errors.push(`selection "${name}" references unknown suite "${id}"`);
      }
    } catch (e) {
      errors.push(`selection "${name}": ${(e as Error).message}`);
    }
  }
  return errors;
}

/**
 * Strict-parse every suite CSV with the repo's canonical settings (bom + strict
 * column count + strict quotes — same as graphql-runner.ts / review-graphql-labels.ts).
 * Returns errors for suites NOT in the burn-down baseline, plus any baseline entries
 * that now pass (stale — should be removed from the baseline).
 */
function lintSuiteCsvs(manifest: Manifest): { newErrors: string[]; baselineStale: string[] } {
  const newErrors: string[] = [];
  const baselineStale: string[] = [];
  for (const suite of manifest.suites) {
    let problem: string | null = null;
    if (!existsSync(suite.file)) {
      problem = `CSV file missing: ${suite.file}`;
    } else {
      try {
        parseCsv(readFileSync(suite.file, "utf-8"), {
          columns: true,
          skip_empty_lines: true,
          relax_column_count: false,
          bom: true,
        });
      } catch (e) {
        const err = e as { code?: string; lines?: number; message?: string };
        const at = err.lines !== undefined ? ` @line ${err.lines}` : "";
        problem = `${err.code ?? "PARSE_ERROR"}${at}`;
      }
    }
    const inBaseline = CSV_LINT_BASELINE.has(suite.id);
    if (problem && !inBaseline) newErrors.push(`suite ${suite.id} (${suite.file}): ${problem}`);
    if (!problem && inBaseline) baselineStale.push(suite.id);
  }
  return { newErrors, baselineStale };
}

/**
 * Actual executable case count for a suite CSV = rows carrying a non-empty ID.
 * Returns null when the file is absent or unparseable (a baselined suite), so the
 * caller leaves the declared count alone rather than zeroing it.
 */
function actualCaseCount(file: string): number | null {
  if (!existsSync(file)) return null;
  try {
    const rows = parseCsv(readFileSync(file, "utf-8"), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      bom: true,
    }) as Record<string, string>[];
    if (rows.length === 0) return 0;
    const idCol = Object.keys(rows[0])[0];
    return rows.filter((r) => String(r[idCol] ?? "").trim() !== "").length;
  } catch {
    return null;
  }
}

function regenerate(manifest: Manifest): { next: Manifest; drift: string[] } {
  const sortedSuites = [...manifest.suites].sort((a, b) => a.id.localeCompare(b.id));
  const today = new Date().toISOString().slice(0, 10);

  // testCount reconciliation. This was previously DECLARED in the Suite interface but
  // never compared or written, so `suites:lint` exited 0 while 33 of 120 suites carried
  // a stale count. That is not cosmetic: the regression HTML dashboard reads
  // `testCount` as the run's `totalCases`, so a drifted suite misreports its own
  // denominator — the class of quiet wrongness that makes a pass-rate untrustworthy.
  // Unparseable / missing CSVs (the CSV_LINT_BASELINE burn-down set) return null and
  // keep their declared value, so this guard never zeroes a suite it cannot read.
  const countDrift: string[] = [];
  const reconciled = sortedSuites.map((s) => {
    const actual = actualCaseCount(s.file);
    if (actual === null || actual === s.testCount) return s;
    countDrift.push(`${s.id}: testCount ${s.testCount} -> ${actual}`);
    return { ...s, testCount: actual };
  });

  const next: Manifest = {
    ...manifest,
    _meta: {
      ...manifest._meta,
      generated: today,
      totalSuites: reconciled.length,
    },
    suites: reconciled,
  };

  const drift: string[] = [];
  if (manifest._meta.totalSuites !== next._meta.totalSuites) {
    drift.push(`_meta.totalSuites (${manifest._meta.totalSuites} -> ${next._meta.totalSuites})`);
  }
  const idsBefore = manifest.suites.map((s) => s.id).join(",");
  const idsAfter = next.suites.map((s) => s.id).join(",");
  if (idsBefore !== idsAfter) drift.push("suites order");
  if (countDrift.length > 0) {
    drift.push(
      countDrift.length <= 6
        ? countDrift.join(", ")
        : `${countDrift.length} suites with stale testCount (${countDrift.slice(0, 4).join(", ")}, …)`,
    );
  }

  return { next, drift };
}

function main(): void {
  const raw = readFileSync(MANIFEST_PATH, "utf-8");
  const manifest = JSON.parse(raw) as Manifest;

  const errors = validateRules(manifest);
  if (errors.length > 0) {
    console.error(`[suites:lint] FAIL — ${errors.length} rule errors:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }

  // Strict CSV lint (ratchet + burn-down baseline).
  const { newErrors, baselineStale } = lintSuiteCsvs(manifest);
  if (baselineStale.length > 0) {
    console.warn(
      `[suites:lint] ${baselineStale.length} baselined suite(s) now PASS — remove from CSV_LINT_BASELINE: ${baselineStale.join(", ")}`,
    );
  }
  if (CSV_LINT_BASELINE.size > 0) {
    console.warn(
      `[suites:lint] CSV burn-down backlog: ${CSV_LINT_BASELINE.size} known-malformed suite(s) baselined — fix + de-baseline to shrink.`,
    );
  }
  if (newErrors.length > 0) {
    console.error(`[suites:lint] FAIL — ${newErrors.length} CSV parse error(s) (not in baseline — new drift):`);
    for (const e of newErrors) console.error(`  - ${e}`);
    console.error(`Fix the CSV, or (only if genuinely pre-existing) add its id to CSV_LINT_BASELINE in scripts/sync-test-suites.ts.`);
    process.exit(1);
  }

  const { next, drift } = regenerate(manifest);

  if (CHECK_MODE) {
    if (drift.length > 0) {
      console.error(`[suites:lint] OUT OF SYNC: ${drift.join(", ")}`);
      console.error(`Run \`npm run suites:sync\` to regenerate.`);
      process.exit(1);
    }
    const ruleCount = Object.keys(manifest.selections).filter((k) => !k.startsWith("_")).length;
    console.log(`[suites:lint] OK (${next.suites.length} suites, ${ruleCount} selections)`);
    return;
  }

  if (drift.length === 0 && manifest._meta.generated === next._meta.generated) {
    console.log(`[suites:sync] Already in sync`);
    return;
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(next, null, 2) + "\n", "utf-8");
  if (drift.length > 0) {
    console.log(`[suites:sync] Regenerated: ${drift.join(", ")}, generated=${next._meta.generated}`);
  } else {
    console.log(`[suites:sync] Updated generated date to ${next._meta.generated}`);
  }
}

main();
