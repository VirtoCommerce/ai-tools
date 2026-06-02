/**
 * scripts/tag-suites-multi-env.ts
 *
 * One-off (re-runnable, idempotent) tagger for the test-suites manifest.
 * Derives `requiresModules[]` for Backend suites from their file path:
 *
 *   regression/suites/Backend/{module}/...   →   requiresModules: ["{module}"]
 *
 * Skips platform-level dirs (always present in every VC deployment) and
 * directories that don't map to a discrete VC module.
 *
 * Does NOT tag `storefrontProfile[]` — that requires per-suite content review
 * and lands in a follow-up commit.
 *
 * Usage:   npx tsx scripts/tag-suites-multi-env.ts
 * Plan ref: ~/.claude/plans/functional-singing-cosmos.md cleanup #3
 */

import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const MANIFEST_PATH = join(process.cwd(), "config", "test-suites.json");

// Backend path → VC module name. Edit this map to extend coverage.
// Keys are the directory name under regression/suites/Backend/.
// Values are the canonical module name customers will list in MODULES_ENABLED.
const BACKEND_DIR_TO_MODULE: Record<string, string> = {
  catalog: "catalog",
  customer: "customer",
  pricing: "pricing",
  inventory: "inventory",
  marketing: "marketing",
  notifications: "notifications",
  cms: "cms",
  orders: "orders",
  store: "store",
  "configurable-products": "catalog", // CFG lives inside the catalog module
  whitelabeling: "whitelabeling",
  search: "search",
  shipping: "shipping",
  returns: "returns",
  loyalty: "loyalty",
  seo: "seo",
  assets: "assets",
  channels: "channels",
  contracts: "contracts",
  "image-tools": "image-tools",
  "import-export": "import-export",
  "push-messages": "push-messages",
  xmarketing: "marketing", // Extended marketing surface — same module
};

// Platform-level Backend dirs that don't gate on any module — always present
// in every VC deployment. Tagging these with requiresModules would
// incorrectly cause them to skip when MODULES_ENABLED is set to a non-empty
// list that doesn't happen to include 'platform' (which isn't a real module).
// 'smoke' is the cross-cutting backend smoke suite — runs unconditionally.
const PLATFORM_DIRS = new Set(["platform", "api", "graphql", "smoke"]);

interface Suite {
  id: string;
  name: string;
  file: string;
  layer: "frontend" | "backend";
  requiresModules?: string[];
  [key: string]: unknown;
}

interface Manifest {
  suites: Suite[];
  [key: string]: unknown;
}

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));

let taggedCount = 0;
let skippedPlatform = 0;
let alreadyTagged = 0;
let frontendSkipped = 0;
const newTags: Array<{ id: string; module: string }> = [];

for (const suite of manifest.suites) {
  if (suite.layer !== "backend") {
    frontendSkipped++;
    continue;
  }

  // Extract dir under Backend/: regression/suites/Backend/{dir}/...
  const match = suite.file.match(/regression\/suites\/Backend\/([^/]+)\//);
  if (!match) continue;

  const dir = match[1];

  if (PLATFORM_DIRS.has(dir)) {
    skippedPlatform++;
    continue;
  }

  const moduleName = BACKEND_DIR_TO_MODULE[dir];
  if (!moduleName) {
    console.warn(`[tag-suites] Unmapped Backend dir "${dir}" (suite ${suite.id}). Add to BACKEND_DIR_TO_MODULE.`);
    continue;
  }

  if (suite.requiresModules && suite.requiresModules.includes(moduleName)) {
    alreadyTagged++;
    continue;
  }

  suite.requiresModules = [moduleName];
  taggedCount++;
  newTags.push({ id: suite.id, module: moduleName });
}

if (taggedCount > 0) {
  // Preserve trailing newline if original had one
  const original = readFileSync(MANIFEST_PATH, "utf-8");
  const trailingNewline = original.endsWith("\n") ? "\n" : "";
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + trailingNewline);
}

console.log(`[tag-suites] Backend suite tagging complete:`);
console.log(`  Newly tagged:     ${taggedCount}`);
console.log(`  Already tagged:   ${alreadyTagged}`);
console.log(`  Skipped platform: ${skippedPlatform} (platform/api/graphql — always present)`);
console.log(`  Frontend skipped: ${frontendSkipped} (storefront — different gating)`);

if (newTags.length > 0) {
  console.log(`\nNew tags applied:`);
  for (const { id, module } of newTags) {
    console.log(`  ${id} → requiresModules: ["${module}"]`);
  }
}
