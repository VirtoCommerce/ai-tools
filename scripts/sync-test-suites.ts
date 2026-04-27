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

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MANIFEST_PATH = join("config", "test-suites.json");
const CHECK_MODE = process.argv.includes("--check");

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

function regenerate(manifest: Manifest): { next: Manifest; drift: string[] } {
  const sortedSuites = [...manifest.suites].sort((a, b) => a.id.localeCompare(b.id));
  const today = new Date().toISOString().slice(0, 10);

  const next: Manifest = {
    ...manifest,
    _meta: {
      ...manifest._meta,
      generated: today,
      totalSuites: sortedSuites.length,
    },
    suites: sortedSuites,
  };

  const drift: string[] = [];
  if (manifest._meta.totalSuites !== next._meta.totalSuites) {
    drift.push(`_meta.totalSuites (${manifest._meta.totalSuites} -> ${next._meta.totalSuites})`);
  }
  const idsBefore = manifest.suites.map((s) => s.id).join(",");
  const idsAfter = next.suites.map((s) => s.id).join(",");
  if (idsBefore !== idsAfter) drift.push("suites order");

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
