// The suite manifest: its types, its selection rules, and the multi-env filters that decide
// which suites would actually run.
//
// Extracted from `ci/run-regression.ts` so the interactive path can answer "what would this
// selection run" with the SAME code the headless runner uses. Before this, selection expansion
// existed in three separate copies (`ci/run-regression.ts`, `scripts/test-cases/sync-test-suites.ts`,
// `scripts/test-cases/verify-multi-env-filters.ts`) — a plan that disagrees with the run it is
// planning is worse than no plan, so a fourth copy was not an option.
//
// Everything here is pure apart from `loadManifest`: the filters read `process.env` (that is
// their input) but take the manifest as a parameter, so a caller can plan for a hypothetical
// selection without touching disk twice.

import { existsSync, readFileSync } from "fs";
import { join } from "path";

export interface ManifestSuite {
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
  storefrontProfile?: Array<"b2b" | "b2c" | "hybrid">;
  requiresModules?: string[];
  envRiskGate?: "dev" | "test" | "staging" | "production";
  paymentProcessors?: string[];
  /** Deterministic executor (e.g. `layout-runner`) — when set, no agent runs this suite. */
  runner?: string;
  /** Command the deterministic executor is invoked with (e.g. `npm run layout:run`). */
  runnerCommand?: string;
  /** Suite requires this browser server (cross-origin iframe suites 039/041 need Chromium). */
  preferredBrowser?: string;
  /** DERIVED by `suites:sync`: the suite performs clicks, so firefox cannot run it. */
  clickDriven?: boolean;
  /**
   * DERIVED by `suites:sync`: how the suite's cases split between the machine lane, a browser
   * agent, explicit Manual, and explicit Deprecated (retired — dispatched nowhere). Present
   * only when the suite has at least one machine case, so a plain browser suite carries
   * nothing; `deprecated` is itself omitted when zero. Lets the planner and the executability
   * report read one recorded answer instead of re-classifying 127 CSVs.
   */
  lanes?: { machine: number; browser: number; manual: number; deprecated?: number };
}

export type WhereFilter = {
  domain?: string;
  layer?: string;
  concern?: string;
  priority?: string;
  tag?: string;
  tagAny?: string[];
};

export type SelectionRule =
  | { include: string[]; exclude?: string[] }
  | { all: true; exclude?: string[] }
  | { where: WhereFilter; include?: string[]; exclude?: string[] };

export interface Manifest {
  _meta: { version: string; description: string; generated: string; totalSuites: number };
  defaults: Record<string, unknown>;
  browserPool: unknown[];
  suites: ManifestSuite[];
  selections: Record<string, SelectionRule>;
}

export const MANIFEST_PATH = join("config", "test-suites.json");

export function loadManifest(path = MANIFEST_PATH): Manifest {
  if (!existsSync(path)) throw new Error(`Suite manifest not found: ${path}`);
  return JSON.parse(readFileSync(path, "utf-8")) as Manifest;
}

// --- Selection expansion -----------------------------------------------------------

export function matchesWhere(suite: ManifestSuite, where: WhereFilter): boolean {
  if (where.domain && suite.domain !== where.domain) return false;
  if (where.layer && suite.layer !== where.layer) return false;
  if (where.concern && suite.concern !== where.concern) return false;
  if (where.priority && suite.priority !== where.priority) return false;
  if (where.tag && !suite.tags.includes(where.tag)) return false;
  if (where.tagAny && !where.tagAny.some((t) => suite.tags.includes(t))) return false;
  return true;
}

/** Order policy: `include` preserves author order; `where`/`all` use manifest order. */
export function expandSelection(manifest: Manifest, rule: SelectionRule): string[] {
  let ids: string[];
  if ("include" in rule && !("where" in rule) && !("all" in rule)) {
    ids = [...rule.include];
  } else if ("all" in rule) {
    ids = manifest.suites.map((s) => s.id);
  } else if ("where" in rule) {
    ids = manifest.suites.filter((s) => matchesWhere(s, rule.where)).map((s) => s.id);
    if (rule.include) for (const id of rule.include) if (!ids.includes(id)) ids.push(id);
  } else {
    throw new Error(`Invalid selection rule: ${JSON.stringify(rule)}`);
  }
  if ("exclude" in rule && rule.exclude) {
    const ex = new Set(rule.exclude);
    ids = ids.filter((id) => !ex.has(id));
  }
  return ids;
}

export interface ResolveResult {
  ids: string[];
  /** Suites a multi-env filter removed, with the reason — printed so a short run is explained. */
  skipped: Array<{ id: string; reason: string }>;
  /** Ids in the selection that the manifest does not know. */
  unknownIds: string[];
  /** Human-readable summary of the active env filters. */
  filterSummary: string;
}

/**
 * Resolve a selection name (or a comma-separated id list) to the suites that would run,
 * including the multi-env filters. Returns problems rather than exiting, so a planner can
 * report them and a runner can decide to fail.
 */
export function resolveSelection(manifest: Manifest, selection: string): ResolveResult {
  const known = new Set(manifest.suites.map((s) => s.id));
  const rule = manifest.selections[selection];

  let ids: string[];
  const unknownIds: string[] = [];
  if (rule) {
    ids = expandSelection(manifest, rule);
  } else {
    ids = selection.split(",").map((s) => s.trim().padStart(2, "0"));
    for (const id of ids) if (!known.has(id)) unknownIds.push(id);
  }

  const filtered = applyMultiEnvFilters(manifest, ids);
  return { ids: filtered.kept, skipped: filtered.skipped, unknownIds, filterSummary: filtered.summary };
}

/** Selection group names a user may pass (the `_`-prefixed keys are documentation). */
export function selectionNames(manifest: Manifest): string[] {
  return Object.keys(manifest.selections).filter((k) => !k.startsWith("_"));
}

// --- Multi-env filters -------------------------------------------------------------
//
// Read MODULES_ENABLED / STOREFRONT_PROFILE / ENV_RISK / PAYMENT_PROCESSORS_ENABLED from the
// runtime env. An empty or absent value means "no filter", never "exclude everything".

const ENV_RISK_RANK: Record<string, number> = { dev: 0, test: 1, staging: 2, production: 3 };

export interface FilterResult {
  kept: string[];
  skipped: Array<{ id: string; reason: string }>;
  summary: string;
}

export function applyMultiEnvFilters(manifest: Manifest, ids: readonly string[]): FilterResult {
  const enabledModules = splitEnv(process.env.MODULES_ENABLED);
  const enabledProcessors = splitEnv(process.env.PAYMENT_PROCESSORS_ENABLED).map((p) => p.toLowerCase());
  const activeProfile = (process.env.STOREFRONT_PROFILE || "").toLowerCase();
  const activeRisk = (process.env.ENV_RISK || "dev").toLowerCase();
  const activeRiskRank = ENV_RISK_RANK[activeRisk] ?? 0;

  // Escape hatch for the envRiskGate: lets an operator run admin-write suites against
  // ENV_RISK=production. Deliberately explicit — those suites mutate production state.
  const allowAdminWritesOnProd =
    process.env.ALLOW_ADMIN_WRITES_ON_PROD === "true" ||
    process.argv.includes("--allow-admin-writes-on-prod");

  const skipped: Array<{ id: string; reason: string }> = [];
  const kept: string[] = [];

  for (const id of ids) {
    const suite = manifest.suites.find((s) => s.id === id);
    if (!suite) {
      kept.push(id); // unknown id — let the caller's error handling take it
      continue;
    }

    if (enabledModules.length > 0 && suite.requiresModules?.length) {
      const missing = suite.requiresModules.filter((m) => !enabledModules.includes(m));
      if (missing.length > 0) {
        skipped.push({ id, reason: `requires modules [${missing.join(", ")}] not in MODULES_ENABLED` });
        continue;
      }
    }

    if (activeProfile && suite.storefrontProfile?.length) {
      if (!suite.storefrontProfile.includes(activeProfile as "b2b" | "b2c" | "hybrid")) {
        skipped.push({
          id,
          reason: `storefrontProfile [${suite.storefrontProfile.join(", ")}] excludes active "${activeProfile}"`,
        });
        continue;
      }
    }

    const gate = (suite.envRiskGate || "production").toLowerCase();
    const gateRank = ENV_RISK_RANK[gate] ?? 3;
    if (activeRiskRank > gateRank && !allowAdminWritesOnProd) {
      skipped.push({
        id,
        reason:
          `envRiskGate "${gate}" exceeded by active ENV_RISK "${activeRisk}" ` +
          `(pass --allow-admin-writes-on-prod or set ALLOW_ADMIN_WRITES_ON_PROD=true to override)`,
      });
      continue;
    }

    if (enabledProcessors.length > 0 && suite.paymentProcessors?.length) {
      const overlap = suite.paymentProcessors.some((p) => enabledProcessors.includes(p.toLowerCase()));
      if (!overlap) {
        skipped.push({
          id,
          reason: `paymentProcessors [${suite.paymentProcessors.join(", ")}] not in PAYMENT_PROCESSORS_ENABLED`,
        });
        continue;
      }
    }

    kept.push(id);
  }

  const summary =
    `ENV_RISK=${activeRisk} STOREFRONT_PROFILE=${activeProfile || "(any)"} ` +
    `MODULES_ENABLED=${enabledModules.length ? enabledModules.join(",") : "(all)"} ` +
    `PAYMENT_PROCESSORS_ENABLED=${enabledProcessors.length ? enabledProcessors.join(",") : "(all)"}` +
    (allowAdminWritesOnProd && activeRisk === "production"
      ? " [ALLOW_ADMIN_WRITES_ON_PROD active — admin-write suites WILL run against production]"
      : "");

  return { kept, skipped, summary };
}

function splitEnv(value: string | undefined): string[] {
  return (value || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}
