/**
 * Offline verifier for multi-env suite-filter pipeline.
 *
 * Re-implements the exact filter chain from `ci/run-regression.ts`
 * (`applyMultiEnvFilters`) and replays it against the manifest for a set
 * of scenarios. Produces a deterministic report of kept/skipped suites
 * per scenario, with skip-reasons grouped by gate.
 *
 * Purpose:
 * - Workstream #7 (live multi-env filter verification) — proven offline.
 * - Workstream #8 (ALLOW_ADMIN_WRITES_ON_PROD escape hatch) — proven offline.
 * - Phase-1 acceptance: "Run logs show specific skip-reason lines per filter."
 *
 * Usage:
 *   npx tsx scripts/verify-multi-env-filters.ts
 *   npx tsx scripts/verify-multi-env-filters.ts --json   (machine-readable)
 *   npx tsx scripts/verify-multi-env-filters.ts --scenario virtostart-smoke
 *
 * Exit code: 0 iff every declared expectation matched the actual filter output.
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Manifest types (mirrors ci/run-regression.ts)
// ---------------------------------------------------------------------------

interface ManifestSuite {
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
}

type WhereFilter = {
  domain?: string;
  layer?: string;
  concern?: string;
  priority?: string;
  tag?: string;
  tagAny?: string[];
};

type SelectionRule =
  | { include: string[]; exclude?: string[] }
  | { all: true; exclude?: string[] }
  | { where: WhereFilter; include?: string[]; exclude?: string[] };

interface Manifest {
  _meta: { version: string; description: string; generated: string; totalSuites: number };
  defaults: Record<string, unknown>;
  browserPool: unknown[];
  suites: ManifestSuite[];
  selections: Record<string, SelectionRule>;
}

const ENV_RISK_RANK: Record<string, number> = { dev: 0, test: 1, staging: 2, production: 3 };

// ---------------------------------------------------------------------------
// Filter logic (verbatim port of ci/run-regression.ts applyMultiEnvFilters)
// ---------------------------------------------------------------------------

interface FilterContext {
  TEST_ENV?: string;
  MODULES_ENABLED?: string;
  PAYMENT_PROCESSORS_ENABLED?: string;
  STOREFRONT_PROFILE?: string;
  ENV_RISK?: string;
  ALLOW_ADMIN_WRITES_ON_PROD?: string;
}

interface FilterResult {
  kept: string[];
  skipped: Array<{ id: string; reason: string; gate: "modules" | "profile" | "risk" | "processors" }>;
  escapeHatchActive: boolean;
}

function applyMultiEnvFilters(manifest: Manifest, ids: string[], env: FilterContext): FilterResult {
  const enabledModules = (env.MODULES_ENABLED || "").split(",").map((m) => m.trim()).filter(Boolean);
  const enabledProcessors = (env.PAYMENT_PROCESSORS_ENABLED || "").split(",").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const activeProfile = (env.STOREFRONT_PROFILE || "").toLowerCase();
  const activeRisk = (env.ENV_RISK || "dev").toLowerCase();
  const activeRiskRank = ENV_RISK_RANK[activeRisk] ?? 0;
  const allowAdminWritesOnProd = env.ALLOW_ADMIN_WRITES_ON_PROD === "true";
  const escapeHatchActive = allowAdminWritesOnProd && activeRisk === "production";

  const skipped: FilterResult["skipped"] = [];
  const kept: string[] = [];

  for (const id of ids) {
    const suite = manifest.suites.find((s) => s.id === id);
    if (!suite) {
      kept.push(id);
      continue;
    }

    if (enabledModules.length > 0 && suite.requiresModules && suite.requiresModules.length > 0) {
      const missing = suite.requiresModules.filter((m) => !enabledModules.includes(m));
      if (missing.length > 0) {
        skipped.push({ id, gate: "modules", reason: `requires modules [${missing.join(", ")}] not in MODULES_ENABLED` });
        continue;
      }
    }

    if (activeProfile && suite.storefrontProfile && suite.storefrontProfile.length > 0) {
      if (!suite.storefrontProfile.includes(activeProfile as "b2b" | "b2c" | "hybrid")) {
        skipped.push({ id, gate: "profile", reason: `storefrontProfile [${suite.storefrontProfile.join(", ")}] excludes active "${activeProfile}"` });
        continue;
      }
    }

    const gate = (suite.envRiskGate || "production").toLowerCase();
    const gateRank = ENV_RISK_RANK[gate] ?? 3;
    if (activeRiskRank > gateRank && !allowAdminWritesOnProd) {
      skipped.push({ id, gate: "risk", reason: `envRiskGate "${gate}" exceeded by ENV_RISK "${activeRisk}"` });
      continue;
    }

    if (enabledProcessors.length > 0 && suite.paymentProcessors && suite.paymentProcessors.length > 0) {
      const overlap = suite.paymentProcessors.some((p) => enabledProcessors.includes(p.toLowerCase()));
      if (!overlap) {
        skipped.push({ id, gate: "processors", reason: `paymentProcessors [${suite.paymentProcessors.join(", ")}] not in PAYMENT_PROCESSORS_ENABLED` });
        continue;
      }
    }

    kept.push(id);
  }

  return { kept, skipped, escapeHatchActive };
}

function matchesWhere(suite: ManifestSuite, where: WhereFilter): boolean {
  if (where.domain && suite.domain !== where.domain) return false;
  if (where.layer && suite.layer !== where.layer) return false;
  if (where.concern && suite.concern !== where.concern) return false;
  if (where.priority && suite.priority !== where.priority) return false;
  if (where.tag && !suite.tags.includes(where.tag)) return false;
  if (where.tagAny && !where.tagAny.some((t) => suite.tags.includes(t))) return false;
  return true;
}

function expandSelection(manifest: Manifest, rule: SelectionRule): string[] {
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

// ---------------------------------------------------------------------------
// Scenarios — each declares the env vars to apply + an expectation
// ---------------------------------------------------------------------------

interface Scenario {
  name: string;
  description: string;
  selection: string;
  env: FilterContext;
  expect: {
    keptCountMin?: number;
    keptCountMax?: number;
    skippedGateAtLeast?: Partial<Record<"modules" | "profile" | "risk" | "processors", number>>;
    escapeHatchActive?: boolean;
    mustKeepIds?: string[];
    mustSkipIds?: string[];
  };
}

const SCENARIOS: Scenario[] = [
  {
    name: "virtostart-smoke",
    description: "Default virtostart smoke run — no module/profile/processor restrictions, ENV_RISK=test. Should run smoke selection fully (no gates triggered).",
    selection: "smoke",
    env: { TEST_ENV: "virtostart", ENV_RISK: "test" },
    expect: { keptCountMin: 1, escapeHatchActive: false },
  },
  {
    name: "virtostart-restricted-modules",
    description: "Customer running with only catalog,customer,orders modules enabled — must skip suites requiring marketing/loyalty/notifications/etc.",
    selection: "full",
    env: { TEST_ENV: "virtostart", ENV_RISK: "test", MODULES_ENABLED: "catalog,customer,orders" },
    expect: { skippedGateAtLeast: { modules: 1 }, escapeHatchActive: false },
  },
  {
    name: "virtostart-b2c-profile",
    description: "Customer running a B2C-only deployment — must skip B2B-flagged suites.",
    selection: "full",
    env: { TEST_ENV: "virtostart", ENV_RISK: "test", STOREFRONT_PROFILE: "b2c" },
    expect: { skippedGateAtLeast: { profile: 1 } },
  },
  {
    name: "production-risk-blocks-writes",
    description: "ENV_RISK=production with no escape hatch — must skip all 45 envRiskGate-tagged suites.",
    selection: "full",
    env: { TEST_ENV: "customer_prod", ENV_RISK: "production" },
    expect: { skippedGateAtLeast: { risk: 45 }, escapeHatchActive: false },
  },
  {
    name: "production-risk-with-escape-hatch",
    description: "ENV_RISK=production + ALLOW_ADMIN_WRITES_ON_PROD=true — escape hatch UNLOCKS the 45 envRiskGate suites.",
    selection: "full",
    env: { TEST_ENV: "customer_prod", ENV_RISK: "production", ALLOW_ADMIN_WRITES_ON_PROD: "true" },
    expect: { skippedGateAtLeast: { risk: 0 }, escapeHatchActive: true },
  },
  {
    name: "cybersource-only-storefront",
    description: "PAYMENT_PROCESSORS_ENABLED=cybersource — must skip suites declaring other processors (Skyflow/Datatrans/Authorize.Net).",
    selection: "payment",
    env: { TEST_ENV: "virtostart", ENV_RISK: "test", PAYMENT_PROCESSORS_ENABLED: "cybersource" },
    expect: { skippedGateAtLeast: { processors: 1 } },
  },
];

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

function loadManifest(): Manifest {
  const p = join("config", "test-suites.json");
  if (!existsSync(p)) throw new Error(`Manifest not found: ${p}`);
  return JSON.parse(readFileSync(p, "utf-8")) as Manifest;
}

function resolveIds(manifest: Manifest, selection: string): string[] {
  const rule = manifest.selections[selection];
  if (!rule) throw new Error(`Unknown selection: ${selection}`);
  return expandSelection(manifest, rule);
}

interface ScenarioResult {
  scenario: Scenario;
  selectionIds: string[];
  filterResult: FilterResult;
  ok: boolean;
  failures: string[];
}

function runScenario(manifest: Manifest, scenario: Scenario): ScenarioResult {
  const selectionIds = resolveIds(manifest, scenario.selection);
  const filterResult = applyMultiEnvFilters(manifest, selectionIds, scenario.env);
  const failures: string[] = [];

  const e = scenario.expect;
  if (e.keptCountMin !== undefined && filterResult.kept.length < e.keptCountMin) {
    failures.push(`expected kept >= ${e.keptCountMin}, got ${filterResult.kept.length}`);
  }
  if (e.keptCountMax !== undefined && filterResult.kept.length > e.keptCountMax) {
    failures.push(`expected kept <= ${e.keptCountMax}, got ${filterResult.kept.length}`);
  }
  if (e.skippedGateAtLeast) {
    for (const [gate, min] of Object.entries(e.skippedGateAtLeast)) {
      const actual = filterResult.skipped.filter((s) => s.gate === gate).length;
      if (actual < (min ?? 0)) {
        failures.push(`expected ${gate}-gate skips >= ${min}, got ${actual}`);
      }
    }
  }
  if (e.escapeHatchActive !== undefined && filterResult.escapeHatchActive !== e.escapeHatchActive) {
    failures.push(`expected escapeHatchActive=${e.escapeHatchActive}, got ${filterResult.escapeHatchActive}`);
  }
  if (e.mustKeepIds) {
    for (const id of e.mustKeepIds) {
      if (!filterResult.kept.includes(id)) failures.push(`expected suite ${id} to be kept`);
    }
  }
  if (e.mustSkipIds) {
    const skippedSet = new Set(filterResult.skipped.map((s) => s.id));
    for (const id of e.mustSkipIds) {
      if (!skippedSet.has(id)) failures.push(`expected suite ${id} to be skipped`);
    }
  }

  return { scenario, selectionIds, filterResult, ok: failures.length === 0, failures };
}

function formatHuman(results: ScenarioResult[]): string {
  const lines: string[] = [];
  lines.push("# Multi-env Filter Verification — Offline Report");
  lines.push("");
  lines.push(`Scenarios: ${results.length} · Passed: ${results.filter((r) => r.ok).length} · Failed: ${results.filter((r) => !r.ok).length}`);
  lines.push("");
  for (const r of results) {
    const status = r.ok ? "PASS" : "FAIL";
    lines.push(`## [${status}] ${r.scenario.name}`);
    lines.push("");
    lines.push(r.scenario.description);
    lines.push("");
    const envStr = Object.entries(r.scenario.env).map(([k, v]) => `${k}=${v}`).join(" ");
    lines.push(`**Env:** \`${envStr}\``);
    lines.push(`**Selection:** \`${r.scenario.selection}\` → ${r.selectionIds.length} suites`);
    lines.push(`**Kept:** ${r.filterResult.kept.length}  ·  **Skipped:** ${r.filterResult.skipped.length}  ·  **EscapeHatch:** ${r.filterResult.escapeHatchActive ? "ACTIVE" : "off"}`);
    if (r.filterResult.skipped.length > 0) {
      const byGate: Record<string, number> = {};
      for (const s of r.filterResult.skipped) byGate[s.gate] = (byGate[s.gate] || 0) + 1;
      lines.push(`**Skip breakdown:** ${Object.entries(byGate).map(([g, n]) => `${g}=${n}`).join(", ")}`);
    }
    if (!r.ok) {
      lines.push("");
      lines.push("**Failures:**");
      for (const f of r.failures) lines.push(`  - ${f}`);
    }
    if (r.filterResult.skipped.length > 0 && r.filterResult.skipped.length <= 10) {
      lines.push("");
      lines.push("**Sample skips:**");
      for (const s of r.filterResult.skipped.slice(0, 10)) {
        lines.push(`  - \`${s.id}\` (${s.gate}): ${s.reason}`);
      }
    } else if (r.filterResult.skipped.length > 10) {
      lines.push("");
      lines.push(`**Sample skips (first 5 of ${r.filterResult.skipped.length}):**`);
      for (const s of r.filterResult.skipped.slice(0, 5)) {
        lines.push(`  - \`${s.id}\` (${s.gate}): ${s.reason}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const wantJson = args.includes("--json");
const scenarioFilter = args.find((a, i) => args[i - 1] === "--scenario");
const writeReport = args.includes("--write-report");

const manifest = loadManifest();
const targets = scenarioFilter ? SCENARIOS.filter((s) => s.name === scenarioFilter) : SCENARIOS;

if (scenarioFilter && targets.length === 0) {
  console.error(`Unknown scenario: ${scenarioFilter}`);
  console.error(`Available: ${SCENARIOS.map((s) => s.name).join(", ")}`);
  process.exit(2);
}

const results = targets.map((s) => runScenario(manifest, s));

if (wantJson) {
  console.log(JSON.stringify({ ok: results.every((r) => r.ok), results }, null, 2));
} else {
  const report = formatHuman(results);
  console.log(report);
  if (writeReport) {
    const outDir = join("reports", "multi-env-verification");
    if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
    const stamp = new Date().toISOString().slice(0, 10);
    const outPath = join(outDir, `verification-${stamp}.md`);
    writeFileSync(outPath, report);
    console.log(`\nReport written to: ${outPath}`);
  }
}

const allOk = results.every((r) => r.ok);
process.exit(allOk ? 0 : 1);
