#!/usr/bin/env node
/**
 * STATIC drift guard for the numeric range-facet fixture (suite 061, SRCHA-047). No network.
 *
 *   npm run td:validate:range-facet
 *
 * (a) hygiene — the committed CSV mirrors range-facet-specs.mjs, no runtime GUID in it, every alias
 *     wired the way the seeder's writeback expects;
 * (b) VACUITY — the reasons this data could stop deciding anything: values of N equalised (min == max),
 *     a sub-range that holds everything or nothing, values that sort the same as text and as numbers,
 *     the control product without N removed, the property renamed to a generic (collidable) name.
 *     None of those errors anywhere else; the case would just pass.
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  PRODUCTS, PROPERTY, CSV_COLUMNS, CSV_PATH, CSV_FILE_KEY, FACET_ALIAS, FACET_ALIAS_ROW,
  SUB_RANGE, csvRowFor, validateSpecShape, rangeMin, rangeMax, inRange,
} from './range-facet-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/i;
const problems = [];
const fail = (m) => problems.push(m);

// [1] VACUITY — the spec is discriminating (the same function the seeder aborts on).
for (const p of validateSpecShape()) fail(`[1] VACUITY: ${p}`);

// [2] + [3] The CSV exists, carries the exact column contract, and mirrors every derivable cell.
const csvAbs = join(ROOT, CSV_PATH);
if (!existsSync(csvAbs)) fail(`[2] ${CSV_PATH} is missing — the @td registry for ${FACET_ALIAS} and the PROD_RANGE_* aliases`);
else {
  const rows = parse(readFileSync(csvAbs, 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true });
  const header = Object.keys(rows[0] || {});
  if (header.join(',') !== CSV_COLUMNS.join(',')) fail(`[2] ${CSV_PATH} header is\n      ${header.join(',')}\n    expected\n      ${CSV_COLUMNS.join(',')}`);
  const byId = Object.fromEntries(rows.map((r) => [r.rf_id, r]));
  for (const rec of PRODUCTS) {
    const row = byId[rec.rfId];
    if (!row) { fail(`[3] ${rec.rfId} is in range-facet-specs.mjs but not in the CSV`); continue; }
    for (const [col, want] of Object.entries(csvRowFor(rec))) {
      if (String(row[col] ?? '') !== String(want)) fail(`[3] ${rec.rfId}.${col}: CSV has "${row[col] ?? ''}", the spec derives "${want}"`);
    }
    if (!String(row.test_purpose || '').trim()) fail(`[3] ${rec.rfId} has an empty test_purpose`);
  }
  for (const r of rows) if (!PRODUCTS.some((p) => p.rfId === r.rf_id)) fail(`[3] CSV row ${r.rf_id} has no spec entry — the seeder never creates it`);
  // [4] No runtime GUID in the committed CSV.
  rows.forEach((r, i) => {
    for (const [col, v] of Object.entries(r)) if (GUID_RE.test(String(v ?? ''))) fail(`[4] runtime GUID in ${CSV_PATH} row ${i + 2} column "${col}" — ids belong in aliases.<env>.json`);
    if (String(r.platform_id || '').trim()) fail(`[4] ${r.rf_id}: platform_id must stay BLANK in the committed CSV`);
  });
}

// [5] Alias wiring — syncEnvAliases(CSV_FILE_KEY, {<rf_id>: {platform_id}}) only reaches an alias whose
//     file is this CSV, whose filter selects by rf_id and whose fields map id ← platform_id.
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
for (const rec of PRODUCTS) {
  const a = aliases[rec.alias];
  if (!a) { fail(`[5] alias ${rec.alias} is not registered in test-data/aliases.json`); continue; }
  if (a.file !== CSV_FILE_KEY) fail(`[5] ${rec.alias}.file is "${a.file}", expected "${CSV_FILE_KEY}"`);
  if (a.filter?.rf_id !== rec.rfId) fail(`[5] ${rec.alias}.filter.rf_id is "${a.filter?.rf_id}", expected "${rec.rfId}"`);
  if (a.fields?.id !== 'platform_id') fail(`[5] ${rec.alias}.fields.id must map to "platform_id" — otherwise the seeder's writeback is a silent no-op`);
  for (const f of ['sku', 'name', 'value', 'url']) if (!a.fields?.[f]) fail(`[5] ${rec.alias}.fields.${f} is missing`);
}
const fa = aliases[FACET_ALIAS];
if (!fa) fail(`[5] alias ${FACET_ALIAS} is not registered — SRCHA-047 has nothing to cite for the property, bounds and sub-range`);
else {
  if (fa.file !== CSV_FILE_KEY || fa.filter?.rf_id !== FACET_ALIAS_ROW) fail(`[5] ${FACET_ALIAS} must read ${CSV_FILE_KEY} row ${FACET_ALIAS_ROW}`);
  for (const [f, col] of Object.entries({ property: 'property_name', categoryUrl: 'category_url', min: 'range_min', max: 'range_max', subFrom: 'sub_range_from', subTo: 'sub_range_to', subSkus: 'sub_range_skus' })) {
    if (fa.fields?.[f] !== col) fail(`[5] ${FACET_ALIAS}.fields.${f} must map to "${col}"`);
  }
}
const owned = new Set([...PRODUCTS.map((r) => r.alias), FACET_ALIAS]);
for (const [name, def] of Object.entries(aliases)) if (def?.file === CSV_FILE_KEY && !owned.has(name)) fail(`[5] alias ${name} points at ${CSV_FILE_KEY} but range-facet-specs.mjs does not own it`);

// [6] Seeded state (informational per env): which overlays carry the runtime ids.
for (const env of ['vcst', 'vcptcore', 'virtostart']) {
  const p = join(ROOT, `test-data/aliases.${env}.json`);
  if (!existsSync(p)) continue;
  const o = JSON.parse(readFileSync(p, 'utf8'));
  const have = PRODUCTS.filter((r) => o[r.alias]?.id);
  console.log(`  [6] aliases.${env}.json: ${have.length}/${PRODUCTS.length} range-facet fixtures carry a runtime id`);
  if (have.length && have.length < PRODUCTS.length) fail(`[6] aliases.${env}.json is PARTIALLY seeded — re-run \`TEST_ENV=${env} npm run seed:range-facet\``);
}

console.log(`\nRange facet ${PROPERTY.name}: min ${rangeMin()} · max ${rangeMax()} · sub-range ${SUB_RANGE.from}..${SUB_RANGE.to} → ${inRange(SUB_RANGE).map((p) => p.alias).join(', ')}`);
if (problems.length) {
  console.error(`\n❌ td:validate:range-facet — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\n✅ td:validate:range-facet — clean');
