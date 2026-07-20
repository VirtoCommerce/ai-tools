/**
 * scripts/seed-data/validate-configurable-data.mjs
 *
 * DRIFT GUARD for the configurable-product fixtures (multi-env model). The seeder's SPECS
 * (configurable-specs.mjs) are the single source of truth; test-data/products/configurable-products.csv
 * mirrors the BUSINESS fields for @td() resolution and carries NO runtime GUIDs (those live in
 * aliases.<env>.json, written per-env by the seeder). This validator does NOT regenerate the CSV
 * (its section_details / test_purpose / notes are hand-authored prose) — it asserts the CSV's
 * derivable business columns still match SPECS, and that no GUID leaked back into the CSV.
 *
 * Checks:
 *   1. Every spec has a CSV row whose name / base_price / sale_price / section_count /
 *      section_types match the spec (fail on divergence).
 *   2. No CFG CSV row carries a runtime GUID (product_id_guid, configuration_id, section/option
 *      ids must be blank — they belong in aliases.<env>.json).
 *   3. CFG CSV rows with no matching spec are reported (legacy/stale — not seeder-managed).
 *
 * Usage:  node scripts/seed-data/validate-configurable-data.mjs   (exit 1 on any hard problem)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { SPECS } from './configurable-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CSV = join(ROOT, 'test-data', 'products', 'configurable-products.csv');
const rows = parse(readFileSync(CSV, 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
const byId = new Map(rows.map((r) => [r.product_id, r]));
const cfgRows = rows.filter((r) => /^CFG-/.test(r.product_id));

const GUID_COLS = ['product_id_guid', 'configuration_id', 'default_section_id', 'default_option_id', 'parent_section_id', 'parent_default_option_id', 'dependent_section_id', 'dependent_default_option_id'];
const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const money = (v) => (v == null || v === '' ? '' : Number(v).toFixed(2));

// 1. Specs ↔ CSV business fields.
console.log('\n[1] Every spec has a CSV row with matching business fields');
let matched = 0;
for (const s of SPECS) {
  const r = byId.get(s.csvId);
  if (!r) { fail(`spec ${s.csvId} (${s.name}): no CSV row`); continue; }
  const errs = [];
  if (r.product_name !== s.name) errs.push(`name "${r.product_name}" != spec "${s.name}"`);
  if ((r.base_price || '') !== money(s.basePrice)) errs.push(`base_price "${r.base_price}" != ${money(s.basePrice)}`);
  if ((r.sale_price || '') !== money(s.salePrice)) errs.push(`sale_price "${r.sale_price}" != "${money(s.salePrice)}"`);
  if ((r.section_count || '') !== String(s.sections.length)) errs.push(`section_count "${r.section_count}" != ${s.sections.length}`);
  const types = s.sections.map((x) => x.type).join(',');
  if ((r.section_types || '') !== types) errs.push(`section_types "${r.section_types}" != "${types}"`);
  if (errs.length) fail(`spec ${s.csvId}: ${errs.join('; ')}`); else matched++;
}
if (matched === SPECS.length) ok(`all ${SPECS.length} specs match their CSV business fields`);

// 2. No runtime GUIDs in the committed CSV.
console.log('\n[2] No runtime GUIDs in the CSV (ids live in aliases.<env>.json)');
let clean = 0;
for (const r of cfgRows) {
  const has = GUID_COLS.filter((c) => (r[c] || '').trim());
  if (has.length) fail(`row ${r.product_id}: GUID column(s) not blank: ${has.join(', ')} — must live in aliases.<env>.json`);
  else clean++;
}
if (clean === cfgRows.length) ok(`all ${cfgRows.length} CFG row(s) carry no GUIDs`);

// 3. Orphan CSV rows (no spec → not seeder-managed / drift-checked).
console.log('\n[3] CSV rows covered by a spec');
const specIds = new Set(SPECS.map((s) => s.csvId));
const orphans = cfgRows.filter((r) => !specIds.has(r.product_id)).map((r) => r.product_id);
if (orphans.length) warn(`${orphans.length} CFG CSV row(s) have no spec in configurable-specs.mjs — legacy/stale, NOT regenerated or drift-checked: ${orphans.join(', ')}`);
else ok('every CFG CSV row maps to a spec');

console.log('\n=== configurable-products drift check ===');
console.log(`  specs: ${SPECS.length} | CSV CFG rows: ${cfgRows.length} | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nConfigurable-products OK — CSV business fields match SPECS, no GUID leakage.');
process.exit(0);
