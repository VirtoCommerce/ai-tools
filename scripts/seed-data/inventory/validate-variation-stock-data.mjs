/**
 * validate-variation-stock-data.mjs — DRIFT / LEAK GUARD for the stocked-variation fixture
 * (VCST-5546 / INV-047). STATIC only (no network). `npm run td:validate:variation-stock`.
 *
 * Checks:
 *   1. No runtime GUID in the committed CSV; the three runtime id columns are blank (multi-env rule).
 *   2. The fixture SHAPE assertions from variation-stock-specs.mjs — distinct master/variation SKUs,
 *      DIVERGENT stock quantities, AGENT-TEST- naming, derived master slug/url, and an ffc_csv_id that
 *      really is the `store_role=main` row. Each of these is a way the fixture could silently stop
 *      being able to fail.
 *   3. The alias contract: INV_VARIATION_STOCKED + INV_VARIATION_MASTER are CSV-backed on this file
 *      and declare column-backed fields.
 *   4. Informational: whether the per-env overlay carries the runtime ids — including FC_EAST's, which
 *      the seeder now populates so @td(FC_EAST.id) stops resolving to the bare business key.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  CSV_SOURCE, FIXTURE_KEY, RUNTIME_COLUMNS, MAIN_FFC, loadFixture, validateFixtureShape,
} from './variation-stock-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

const REQUIRED_ALIASES = {
  INV_VARIATION_STOCKED: ['sku', 'name', 'id', 'stock', 'masterSku', 'masterId', 'ffcId'],
  INV_VARIATION_MASTER: ['sku', 'name', 'id', 'slug', 'url', 'stock'],
};
const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const PROSE_COLS = new Set(['test_purpose', 'notes']);

const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const rows = readCsv(CSV_SOURCE.file);
const ffcRows = readCsv(MAIN_FFC.csvFile);
const rec = loadFixture(rows);

console.log(`\n[1] ${CSV_SOURCE.file}: runtime id columns blank, no GUID leaked (multi-env rule)`);
for (const r of rows) {
  for (const col of RUNTIME_COLUMNS) {
    const v = String(r[col] ?? '').trim();
    if (v) fail(`row ${r.fixture_key}: "${col}"="${v}" must be BLANK — runtime ids live in aliases.<env>.json (written by seed:variation-stock)`);
  }
  for (const [col, val] of Object.entries(r)) {
    if (PROSE_COLS.has(col)) continue;
    if (GUID_RE.test(String(val ?? '').trim())) fail(`row ${r.fixture_key}: column "${col}" holds a GUID "${val}" — committed fixtures carry business keys only`);
  }
}
if (!problems.length) ok(`${RUNTIME_COLUMNS.length} runtime column(s) blank across ${rows.length} row(s); no GUIDs in any data column`);

console.log(`\n[2] ${CSV_SOURCE.file}: fixture shape can still detect a missing/aggregated variation row`);
const shape = validateFixtureShape(rows, ffcRows);
for (const p of shape) fail(p);
if (!shape.length && rec) {
  ok(`${FIXTURE_KEY}: master ${rec.master.sku} (stock ${rec.master.stock}) vs variation ${rec.variation.sku} (stock ${rec.variation.stock}) — quantities diverge, so the per-row assertion can fail`);
  ok(`stocked against ${rec.ffcCsvId} (${MAIN_FFC.alias}), the ${MAIN_FFC.roleColumn}=${MAIN_FFC.roleValue} fulfillment center — not ffcs[0]`);
  ok(`master storefront path: ${rec.master.url} (no variation url published — a variation has no independent PDP route)`);
}

console.log('\n[3] aliases.json: the variation aliases are CSV-backed on this fixture');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const csvCols = new Set(Object.keys(rows[0] || {}));
for (const [name, required] of Object.entries(REQUIRED_ALIASES)) {
  const def = aliases[name];
  if (!def) { fail(`${name} is not registered in aliases.json — every @td(${name}.*) passes through unresolved`); continue; }
  if (def.file !== CSV_SOURCE.key) fail(`${name}.file="${def.file}" should be "${CSV_SOURCE.key}"`);
  if (def.filter?.fixture_key !== FIXTURE_KEY) fail(`${name}.filter must select fixture_key="${FIXTURE_KEY}" (got ${JSON.stringify(def.filter)})`);
  const declared = Object.keys(def.fields || {});
  const missing = required.filter((f) => !declared.includes(f));
  if (missing.length) fail(`${name} is missing field(s): ${missing.join(', ')}`);
  for (const [field, col] of Object.entries(def.fields || {})) {
    if (!csvCols.has(col)) fail(`${name}.fields.${field} points at CSV column "${col}", which does not exist in ${CSV_SOURCE.file}`);
  }
  if (!missing.length) ok(`${name}: ${declared.length} field(s), all required ones present and column-backed`);
}

const env = process.env.TEST_ENV || 'vcst';
console.log(`\n[4] aliases.${env}.json: runtime ids present (informational — seed the env to populate)`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
if (!existsSync(overlayPath)) warn(`aliases.${env}.json does not exist — run \`TEST_ENV=${env} npm run seed:variation-stock\``);
else {
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
  for (const name of Object.keys(REQUIRED_ALIASES)) {
    const have = Object.entries(overlay[name] || {}).filter(([, v]) => String(v || '').trim());
    if (!have.length) warn(`${name} has no overlay on ${env} — its ids resolve "" until \`TEST_ENV=${env} npm run seed:variation-stock\` runs`);
    else ok(`${name}: ${have.map(([k]) => k).join(', ')}`);
  }
  const fcId = String(overlay[MAIN_FFC.alias]?.id || '').trim();
  if (!fcId) warn(`${MAIN_FFC.alias} has no overlay id on ${env} — @td(${MAIN_FFC.alias}.id) still resolves to the CSV business key "${MAIN_FFC.csvId}", which is not a platform id`);
  else if (fcId === MAIN_FFC.csvId) fail(`${MAIN_FFC.alias}.id on ${env} is the business key "${fcId}", not a runtime platform id — INV-047 and the rest of suite 056 cannot use it against the API`);
  else ok(`${MAIN_FFC.alias}.id resolves to a runtime platform id on ${env}`);
}

console.log('\n=== variation-stock drift/leak check ===');
console.log(`  ${CSV_SOURCE.file} rows: ${rows.length} | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nVariation-stock OK — no GUID leakage; the fixture can still fail on a missing or aggregated variation row.');
process.exit(0);
