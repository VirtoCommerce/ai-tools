/**
 * Validate @td() References
 *
 * Scans all regression suite CSVs for @td() tokens and attempts to resolve them.
 * Reports unresolvable references, stats by domain and suite.
 *
 * Usage: npx tsx scripts/validate-td-refs.ts
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { TestDataResolver } from "../lib/test-data-resolver.js";

const ROOT = process.cwd();
const SUITES_DIR = join(ROOT, "regression", "suites");
const TEST_DATA_DIR = join(ROOT, "test-data");

const resolver = new TestDataResolver(TEST_DATA_DIR);

interface SuiteReport {
  file: string;
  totalRefs: number;
  resolved: number;
  failed: number;
  failures: string[];
}

function findCSVFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...findCSVFiles(fullPath));
    } else if (entry.endsWith(".csv")) {
      files.push(fullPath);
    }
  }
  return files;
}

function countRefs(content: string): string[] {
  const matches = content.match(/@td\([^)]+\)/g);
  return matches || [];
}

// --- Main ---
const csvFiles = findCSVFiles(SUITES_DIR);
const reports: SuiteReport[] = [];

let totalRefs = 0;
let totalResolved = 0;
let totalFailed = 0;

for (const file of csvFiles) {
  const content = readFileSync(file, "utf-8");
  const refs = countRefs(content);

  if (refs.length === 0) continue;

  resolver.clearWarnings();
  resolver.resolveCSV(content);
  const warnings = resolver.getWarnings();

  const report: SuiteReport = {
    file: relative(ROOT, file).replace(/\\/g, "/"),
    totalRefs: refs.length,
    resolved: refs.length - warnings.length,
    failed: warnings.length,
    failures: warnings,
  };

  reports.push(report);
  totalRefs += refs.length;
  totalResolved += report.resolved;
  totalFailed += warnings.length;
}

// --- Output ---
console.log("=== @td() Reference Validation Report ===\n");
console.log(`Suites scanned: ${csvFiles.length}`);
console.log(`Suites with @td() refs: ${reports.length}`);
console.log(`Total @td() references: ${totalRefs}`);
console.log(`  Resolved: ${totalResolved}`);
console.log(`  Failed:   ${totalFailed}`);
console.log();

if (reports.length === 0) {
  console.log("No @td() references found in any suite CSV.");
  process.exit(0);
}

// Per-suite breakdown
console.log("--- Per-Suite Breakdown ---\n");
for (const r of reports) {
  const status = r.failed === 0 ? "OK" : "FAIL";
  console.log(`[${status}] ${r.file}: ${r.resolved}/${r.totalRefs} resolved`);
  for (const f of r.failures) {
    console.log(`       ${f}`);
  }
}

// Domain breakdown (extract from alias names)
const domainCounts: Record<string, number> = {};
for (const r of reports) {
  const content = readFileSync(join(ROOT, r.file), "utf-8");
  const refs = countRefs(content);
  for (const ref of refs) {
    const inner = ref.slice(4, -1); // strip @td( and )
    const alias = inner.split(".")[0];
    // Classify by prefix
    let domain = "other";
    if (/^CYBERSOURCE|^SKYFLOW|^AUTHORIZENET|^DATATRANCE|^CARD_/.test(alias)) domain = "payment";
    else if (/^COUPON_/.test(alias)) domain = "promotions";
    else if (/^STORE_/.test(alias)) domain = "stores";
    else if (/^ADDR_/.test(alias)) domain = "addresses";
    else if (/^ACME_|^TECHFLOW_|^BUILDRIGHT_|^EU_|^SUSPENDED_|^ACMEWEST_/.test(alias)) domain = "b2b-users";
    else if (/^ORG_/.test(alias)) domain = "b2b-orgs";
    else if (/^PROD_/.test(alias)) domain = "products";
    else if (/^CFG_/.test(alias)) domain = "configurable-products";
    else if (/^FC_/.test(alias)) domain = "inventory";
    else if (/^BOPIS_/.test(alias)) domain = "bopis";
    else if (/^PRICELIST_/.test(alias)) domain = "pricing";
    else if (/^CATALOG_/.test(alias)) domain = "catalogs";
    else if (/^WL_/.test(alias)) domain = "white-labeling";
    else if (/^LANG_/.test(alias)) domain = "localization";
    else if (/^SEARCH_/.test(alias)) domain = "search";
    domainCounts[domain] = (domainCounts[domain] || 0) + 1;
  }
}

console.log("\n--- Domain Breakdown ---\n");
for (const [domain, count] of Object.entries(domainCounts).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${domain}: ${count} refs`);
}

process.exit(totalFailed > 0 ? 1 : 0);
