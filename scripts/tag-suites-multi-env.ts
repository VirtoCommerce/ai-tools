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

// Frontend suites that clearly write persistent state (place orders, create
// quotes, modify orders) → envRiskGate: "staging" (refuses to run on prod
// by default). Backend suites with requiresModules[] are admin-write by
// definition and also get the gate.
//
// Read-mostly Frontend suites (catalog navigation, search, auth, cart, BOPIS,
// cross-cutting smoke/security/a11y/perf, storefront marketing/whitelabeling)
// stay at the default 'production' gate — fine to run on prod.
const FRONTEND_WRITE_SUITES = new Set([
  "011", // Checkout Flow — places orders
  "013", // Checkout B2B — places orders
  "014", // Orders Frontend — order operations
  "015", // Quotes — creates quotes
  "039",  // Payment CyberSource — places orders
  "040a", // Payment Skyflow — places orders
  "040b", // Payment Authorize.Net — places orders
  "040c", // Payment Datatrans — places orders
  "041",  // Payment Cross-Cutting — places orders
  "077", // Marketing Coupons Storefront — applies/redeems
]);

// Also: any Backend suite under api/ or graphql/ that's a write/mutation
// surface. Listed explicitly because the Backend platform-dirs exemption above
// keeps them off the requiresModules path.
const BACKEND_PLATFORM_WRITE_SUITES = new Set([
  "020", // Platform users/roles (creates users)
  "021", // Dynamic properties (modifies platform schema)
  "049", // Platform REST API (creates entities)
  "063", // Core settings (modifies global config)
]);

interface Suite {
  id: string;
  name: string;
  file: string;
  layer: "frontend" | "backend";
  requiresModules?: string[];
  envRiskGate?: "dev" | "test" | "staging" | "production";
  [key: string]: unknown;
}

interface Manifest {
  suites: Suite[];
  [key: string]: unknown;
}

const manifest: Manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf-8"));

let modulesTaggedCount = 0;
let modulesSkippedPlatform = 0;
let modulesAlreadyTagged = 0;
let modulesFrontendSkipped = 0;
let riskGateTaggedCount = 0;
let riskGateAlreadyTagged = 0;
const newModuleTags: Array<{ id: string; module: string }> = [];
const newRiskGateTags: Array<{ id: string; reason: string }> = [];

for (const suite of manifest.suites) {
  // --- Pass 1: requiresModules (Backend module-admin suites only) ---
  if (suite.layer === "backend") {
    const match = suite.file.match(/regression\/suites\/Backend\/([^/]+)\//);
    if (match) {
      const dir = match[1];
      if (!PLATFORM_DIRS.has(dir)) {
        const moduleName = BACKEND_DIR_TO_MODULE[dir];
        if (!moduleName) {
          console.warn(`[tag-suites] Unmapped Backend dir "${dir}" (suite ${suite.id}). Add to BACKEND_DIR_TO_MODULE.`);
        } else if (suite.requiresModules && suite.requiresModules.includes(moduleName)) {
          modulesAlreadyTagged++;
        } else {
          suite.requiresModules = [moduleName];
          modulesTaggedCount++;
          newModuleTags.push({ id: suite.id, module: moduleName });
        }
      } else {
        modulesSkippedPlatform++;
      }
    }
  } else {
    modulesFrontendSkipped++;
  }

  // --- Pass 2: envRiskGate (staging gate for write-heavy suites) ---
  // Already tagged? respect explicit overrides.
  if (suite.envRiskGate) {
    riskGateAlreadyTagged++;
    continue;
  }

  let shouldGate = false;
  let reason = "";

  // Backend suites with requiresModules[] are admin-write by definition.
  if (suite.layer === "backend" && suite.requiresModules && suite.requiresModules.length > 0) {
    shouldGate = true;
    reason = `module-admin (writes: ${suite.requiresModules.join(",")})`;
  }
  // Backend platform-level write suites (explicit list — exempted from module path).
  else if (suite.layer === "backend" && BACKEND_PLATFORM_WRITE_SUITES.has(suite.id)) {
    shouldGate = true;
    reason = "platform-write suite";
  }
  // Frontend write-heavy suites (checkout, payment, orders).
  else if (suite.layer === "frontend" && FRONTEND_WRITE_SUITES.has(suite.id)) {
    shouldGate = true;
    reason = "places orders / creates persistent state";
  }

  if (shouldGate) {
    suite.envRiskGate = "staging";
    riskGateTaggedCount++;
    newRiskGateTags.push({ id: suite.id, reason });
  }
}

if (modulesTaggedCount > 0 || riskGateTaggedCount > 0) {
  const original = readFileSync(MANIFEST_PATH, "utf-8");
  const trailingNewline = original.endsWith("\n") ? "\n" : "";
  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + trailingNewline);
}

console.log(`[tag-suites] Tagging complete:`);
console.log(`  --- requiresModules[] (Backend module-admin) ---`);
console.log(`  Newly tagged:     ${modulesTaggedCount}`);
console.log(`  Already tagged:   ${modulesAlreadyTagged}`);
console.log(`  Skipped platform: ${modulesSkippedPlatform} (platform/api/graphql/smoke — always present)`);
console.log(`  Frontend skipped: ${modulesFrontendSkipped} (storefront — different gating)`);
console.log(`  --- envRiskGate: "staging" (write-heavy suites) ---`);
console.log(`  Newly tagged:     ${riskGateTaggedCount}`);
console.log(`  Already tagged:   ${riskGateAlreadyTagged}`);

if (newModuleTags.length > 0) {
  console.log(`\nNew requiresModules tags:`);
  for (const { id, module } of newModuleTags) {
    console.log(`  ${id} → requiresModules: ["${module}"]`);
  }
}
if (newRiskGateTags.length > 0) {
  console.log(`\nNew envRiskGate: "staging" tags:`);
  for (const { id, reason } of newRiskGateTags) {
    console.log(`  ${id} → ${reason}`);
  }
}
