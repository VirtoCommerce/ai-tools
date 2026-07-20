/**
 * scripts/seed-data/validate-standard-data.mjs
 *
 * DRIFT / LEAK GUARD for the standard-product fixtures (multi-env model). The standard seeder
 * (seed-standard-products.mjs) has ONE CSV source of truth — test-products.csv — plus the imported
 * fixtures registered in standard.csv. This guard asserts both stay multi-env-safe and coherent
 * with standard-specs.mjs (CSV_SOURCE / SPEC_OVERLAYS / DISCOVERED_FIXTURES).
 *
 * Per the multi-env rule (.claude/rules/test-data.md "Authoring rule for ANY new seeder"), NO runtime
 * platform GUID may sit in a committed CSV — a baked-in id resolves to the wrong / a nonexistent
 * entity on any other env and breaks regression.
 *
 * Checks:
 *   1. standard.csv: no runtime GUIDs in data columns (product_id_guid / catalog_id — ids live in
 *      aliases.<env>.json). Prose columns (notes) are ignored.
 *   2. standard.csv: every DISCOVERED_FIXTURE has a row whose product_code matches its discover code.
 *   3. test-products.csv: no runtime GUID in ANY non-prose column (it must stay business-keys-only).
 *   4. test-products.csv: every SPEC_OVERLAYS key is a seeded=true row (an overlay on a non-seeded
 *      or missing row would never apply).
 *   5. test-products.csv: at least one seeded=true row exists (the seeder would otherwise abort).
 *
 * Usage:  npm run td:validate:standard   (exit 1 on any hard problem)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { CSV_SOURCE, SPEC_OVERLAYS, DISCOVERED_FIXTURES } from './standard-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

const std = readCsv('products/standard.csv');
const stdById = new Map(std.map((r) => [r.product_id, r]));
const tp = readCsv(CSV_SOURCE.file);

const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const STD_GUID_COLS = ['product_id_guid', 'catalog_id'];
// Free-text columns that legitimately mention ids/dates in prose — never GUID-scanned.
const TP_PROSE_COLS = new Set(['description', 'test_purpose', 'notes']);
const truthy = (v) => /^(true|yes|1)$/i.test(String(v || '').trim());

const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

// 1. standard.csv — no runtime GUIDs in data columns.
console.log('\n[1] standard.csv: no runtime GUIDs in data columns (ids live in aliases.<env>.json)');
let clean = 0;
for (const r of std) {
  const has = STD_GUID_COLS.filter((c) => (r[c] || '').trim());
  if (has.length) for (const c of has) fail(`standard.csv row ${r.product_id}: "${c}"="${r[c].trim()}" must be blank — captured to aliases.<env>.json`);
  else clean++;
}
if (clean === std.length) ok(`all ${std.length} standard.csv row(s) carry no GUIDs in ${STD_GUID_COLS.join(' / ')}`);

// 2. standard.csv — discovered fixtures map to a row by code.
console.log('\n[2] standard.csv: every DISCOVERED_FIXTURE maps to a row by code');
let matched = 0;
for (const f of DISCOVERED_FIXTURES) {
  const r = stdById.get(f.csvId);
  if (!r) { fail(`fixture ${f.csvId} (${f.code}): no standard.csv row`); continue; }
  if ((r.product_code || '').trim() !== f.code) fail(`fixture ${f.csvId}: product_code "${r.product_code}" != discover code "${f.code}"`);
  else matched++;
}
if (matched === DISCOVERED_FIXTURES.length) ok(`all ${DISCOVERED_FIXTURES.length} discovered fixture(s) map to a standard.csv row`);

// 3. test-products.csv — no runtime GUID in any non-prose column.
console.log(`\n[3] ${CSV_SOURCE.file}: no runtime GUIDs (business keys only)`);
let leaks = 0;
for (const r of tp) {
  for (const [col, val] of Object.entries(r)) {
    if (TP_PROSE_COLS.has(col)) continue;
    if (GUID_RE.test(String(val || '').trim())) { fail(`${CSV_SOURCE.file} row ${r.product_id}: column "${col}" holds a GUID "${val}" — must be a business key`); leaks++; }
  }
}
if (!leaks) ok(`no GUIDs in any data column across ${tp.length} row(s)`);

// 4. Overlays target a seeded row.
console.log(`\n[4] ${CSV_SOURCE.file}: every SPEC_OVERLAYS key is a seeded=true row`);
const seededIds = new Set(tp.filter((r) => truthy(r[CSV_SOURCE.map.seeded])).map((r) => r[CSV_SOURCE.map.csvId]));
let overlayOk = 0;
for (const id of Object.keys(SPEC_OVERLAYS)) {
  if (!seededIds.has(id)) fail(`SPEC_OVERLAYS["${id}"] targets a row that is not seeded=true (overlay would never apply)`);
  else overlayOk++;
}
if (overlayOk === Object.keys(SPEC_OVERLAYS).length) ok(`all ${Object.keys(SPEC_OVERLAYS).length} overlay(s) target a seeded row`);

// 5. At least one seeded row.
console.log(`\n[5] ${CSV_SOURCE.file}: has seeded=true rows`);
if (!seededIds.size) fail(`no seeded=true rows — the seeder would abort`);
else ok(`${seededIds.size} seeded=true row(s): ${[...seededIds].join(', ')}`);

console.log('\n=== standard-products drift/leak check ===');
console.log(`  standard.csv rows: ${std.length} | ${CSV_SOURCE.file} rows: ${tp.length} | seeded: ${seededIds.size} | discovered: ${DISCOVERED_FIXTURES.length}`);
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nStandard-products OK — no GUID leakage; discovered fixtures + overlays coherent with the CSVs.');
process.exit(0);
