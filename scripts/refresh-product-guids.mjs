#!/usr/bin/env node
/**
 * Refreshes empty product_id_guid cells in test-data/products/configurable-products.csv
 * by querying the storefront xAPI by name/code (whichever the CSV's product_name column
 * happens to hold for that row).
 *
 * Run on demand whenever the catalog is reseeded and CFG_* aliases stop resolving GUIDs.
 *
 *   npm run refresh-product-guids                        — refresh empty cells only
 *   npm run refresh-product-guids -- --all               — refresh every row (verify drift)
 *   npm run refresh-product-guids -- --dry-run           — print plan, don't write
 *   npm run refresh-product-guids -- --row CFG-003       — refresh a single row
 *
 * Reads BACK_URL and STORE_ID from .env.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { config as loadDotenv } from "dotenv";

loadDotenv();

const ROOT = resolve(process.cwd());
const CSV_PATH = join(ROOT, "test-data/products/configurable-products.csv");
const BACK_URL = process.env.BACK_URL;
const STORE_ID = process.env.STORE_ID || "B2B-store";

if (!BACK_URL) {
  console.error("BACK_URL is missing from .env");
  process.exit(1);
}

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const REFRESH_ALL = args.includes("--all");
const rowFilterIdx = args.indexOf("--row");
const SINGLE_ROW = rowFilterIdx >= 0 ? args[rowFilterIdx + 1] : null;

function parseCsvLine(line) {
  const fields = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') inQuotes = false;
      else current += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ",") { fields.push(current); current = ""; }
      else current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function escapeCsvField(value) {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

async function lookup(productName) {
  const safe = productName.replace(/"/g, '\\"');
  const filter = `name:"${safe}" OR code:"${safe}"`;
  const body = {
    query: `query($f: String!) { products(storeId: "${STORE_ID}", filter: $f) { totalCount items { id name code productType } } }`,
    variables: { f: filter },
  };
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`GraphQL errors: ${json.errors.map((e) => e.message).join("; ")}`);
  }
  const items = json.data?.products?.items ?? [];
  return items;
}

const raw = readFileSync(CSV_PATH, "utf-8");
const eol = raw.includes("\r\n") ? "\r\n" : "\n";
const lines = raw.split(/\r?\n/);
const trailingEmpty = lines[lines.length - 1] === "" ? eol : "";
if (trailingEmpty) lines.pop();

const headerCols = parseCsvLine(lines[0]);
const idIdx = headerCols.indexOf("product_id");
const nameIdx = headerCols.indexOf("product_name");
const guidIdx = headerCols.indexOf("product_id_guid");
if (idIdx < 0 || nameIdx < 0 || guidIdx < 0) {
  console.error(`CSV missing one of: product_id, product_name, product_id_guid`);
  process.exit(1);
}

const summary = { scanned: 0, refreshed: 0, unchanged: 0, skipped: 0, missing: 0, ambiguous: 0 };
const updatedLines = [lines[0]];

for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  if (!line.trim()) { updatedLines.push(line); continue; }
  const fields = parseCsvLine(line);
  if (fields.length !== headerCols.length) {
    console.error(`Row ${i + 1} has ${fields.length} fields but header has ${headerCols.length} — fix the CSV before refreshing GUIDs.`);
    process.exit(3);
  }

  const productId = fields[idIdx];
  const productName = fields[nameIdx];
  const currentGuid = fields[guidIdx];

  if (SINGLE_ROW && productId !== SINGLE_ROW) { updatedLines.push(line); continue; }

  summary.scanned++;
  const needsLookup = REFRESH_ALL || !currentGuid;
  if (!needsLookup) {
    summary.unchanged++;
    updatedLines.push(line);
    continue;
  }
  if (!productName) {
    console.warn(`[${productId}] skipped — no product_name`);
    summary.skipped++;
    updatedLines.push(line);
    continue;
  }

  try {
    const items = await lookup(productName);
    if (items.length === 0) {
      console.warn(`[${productId}] no match for name/code "${productName}"`);
      summary.missing++;
      updatedLines.push(line);
      continue;
    }
    if (items.length > 1) {
      console.warn(`[${productId}] ambiguous — ${items.length} matches for "${productName}"; keeping existing value`);
      summary.ambiguous++;
      updatedLines.push(line);
      continue;
    }
    const newGuid = items[0].id;
    if (newGuid === currentGuid) {
      console.log(`[${productId}] up-to-date (${newGuid})`);
      summary.unchanged++;
      updatedLines.push(line);
      continue;
    }
    const action = currentGuid ? `updating ${currentGuid} -> ${newGuid}` : `setting ${newGuid}`;
    console.log(`[${productId}] ${action}`);
    fields[guidIdx] = newGuid;
    summary.refreshed++;
    const rebuilt = fields.map(escapeCsvField).join(",");
    updatedLines.push(rebuilt);
  } catch (err) {
    console.error(`[${productId}] lookup failed: ${err.message}`);
    summary.skipped++;
    updatedLines.push(line);
  }
}

const output = updatedLines.join(eol) + trailingEmpty;

if (DRY_RUN) {
  console.log("\n--- DRY RUN — no file written ---");
} else if (summary.refreshed > 0) {
  writeFileSync(CSV_PATH, output, "utf-8");
  console.log(`\nWrote ${summary.refreshed} updated row(s) to ${CSV_PATH}`);
} else {
  console.log(`\nNo updates needed.`);
}

console.log(`\nSummary: scanned=${summary.scanned} refreshed=${summary.refreshed} unchanged=${summary.unchanged} missing=${summary.missing} ambiguous=${summary.ambiguous} skipped=${summary.skipped}`);

process.exit(summary.missing + summary.ambiguous > 0 ? 2 : 0);
