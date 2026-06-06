/**
 * Validate @td() References + Hardcoded-ID Anti-Pattern Scan
 *
 * 1. Scans all regression suite CSVs for @td() tokens and attempts to resolve them.
 *    Reports unresolvable references, stats by domain and suite.
 * 2. Enforces DV-013 (`.claude/skills/testing/qa-review-tests/review-criteria.md`):
 *    flags bare UUID/GUID literals in suite CSVs that are NOT wrapped in @td() or {{VAR}}.
 *    System-generated GUIDs regenerate on every teardown+reseed and differ per env, so a
 *    literal one rots into a false BLOCKED/FAIL. Reference data by its stable business key
 *    (code / name / slug / SKU) and resolve the GUID at runtime if truly needed — see DV-020.
 *
 * Usage:
 *   npx tsx scripts/validate-td-refs.ts              # @td failures AND hardcoded IDs are fatal (default gate)
 *   npx tsx scripts/validate-td-refs.ts --warn-only  # downgrade hardcoded IDs to warnings (WIP escape hatch)
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { TestDataResolver } from "./lib/test-data-resolver.js";

const ROOT = process.cwd();
const SUITES_DIR = join(ROOT, "regression", "suites");
const TEST_DATA_DIR = join(ROOT, "test-data");
const WARN_ONLY = process.argv.includes("--warn-only");

const resolver = new TestDataResolver(TEST_DATA_DIR);

// --- DV-013 hardcoded-ID scan config ---
// UUID-style and bare 32-char-hex literals are entity GUIDs unless allowlisted below.
const UUID_RE = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/g;
const HEX32_RE = /\b[0-9a-f]{32}\b/gi;
// Sentinel/empty GUIDs (00000000-…-0000/0001/0002) are null-id placeholders, not entity refs.
const SENTINEL_RE = /^0{8}-0{4}-0{4}-0{4}-0{11}[0-9a-fA-F]$/;
// Stable environment constants (documented in knowledge/catalog.md & store-settings.md) — allowed.
// Keep tiny; everything else must be @td() or runtime-resolved.
const ALLOWED_IDS = new Set<string>([
  "fc596540864a41bf8ab78734ee7353a3", // active B2B virtual-catalog root (stable across deploys)
]);

interface IdHit { file: string; line: number; value: string; }

// Find bare GUID/ID literals AFTER stripping @td(...) and {{VAR}} (those are the correct forms).
function scanHardcodedIds(file: string, content: string): IdHit[] {
  const hits: IdHit[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const stripped = lines[i].replace(/@td\([^)]*\)/g, "").replace(/\{\{[^}]*\}\}/g, "");
    for (const re of [UUID_RE, HEX32_RE]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(stripped)) !== null) {
        const v = m[0];
        if (SENTINEL_RE.test(v) || ALLOWED_IDS.has(v.toLowerCase())) continue;
        hits.push({ file: relative(ROOT, file).replace(/\\/g, "/"), line: i + 1, value: v });
      }
    }
  }
  return hits;
}

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
const idHits: IdHit[] = [];

for (const file of csvFiles) {
  const content = readFileSync(file, "utf-8");

  // DV-013: scan EVERY suite (even those with no @td() refs) for bare hardcoded GUIDs.
  idHits.push(...scanHardcodedIds(file, content));

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

// --- DV-013: Hardcoded ID / GUID anti-pattern ---
console.log("\n--- Hardcoded ID / GUID Scan (DV-013) ---\n");
if (idHits.length === 0) {
  console.log("  No bare GUID/ID literals found. ✓");
} else {
  // Group by file for readable output.
  const byFile = new Map<string, IdHit[]>();
  for (const h of idHits) (byFile.get(h.file) ?? byFile.set(h.file, []).get(h.file)!).push(h);
  const tag = WARN_ONLY ? "WARN" : "FAIL";
  console.log(`  ${idHits.length} hardcoded ID/GUID literal(s) across ${byFile.size} file(s) [${tag}]:`);
  for (const [file, hits] of byFile) {
    for (const h of hits) console.log(`    ${file}:${h.line}  ${h.value}`);
  }
  console.log(
    "\n  Anti-pattern: a system GUID rots on every teardown+reseed and differs per env.\n" +
    "  Fix: reference by stable business key (code / name / slug / SKU) and capture the\n" +
    "  GUID at runtime ([GQL-CAPTURE] / live-discover) if truly needed. See DV-013 / DV-020\n" +
    "  in .claude/skills/testing/qa-review-tests/review-criteria.md." +
    (WARN_ONLY ? "\n  (--warn-only: not failing the build. Drop the flag to enforce.)" : "")
  );
}

const idFatal = idHits.length > 0 && !WARN_ONLY;
process.exit(totalFailed > 0 || idFatal ? 1 : 0);
