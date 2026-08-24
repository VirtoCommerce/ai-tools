/**
 * validate-wishlist-data.mjs — DRIFT / LEAK GUARD for the two-store wishlist fixture (VCST-5705).
 *
 * STATIC only (no network). Run as `npm run td:validate:wishlists`; exits 1 on any hard problem.
 *
 * What it protects, and why each check earns its place:
 *   1. No runtime GUID (or per-env store id) in the committed CSV — the multi-env rule. A committed
 *      id makes a run against another env resolve a nonexistent or WRONG entity.
 *   2. The fixture SHAPE assertions from wishlist-specs.mjs validateFixtureShape() — distinct stores,
 *      distinct products, distinct list names, {{VAR}} password, AGENT-TEST- naming, and the DERIVED
 *      slug/url. These are what stop the fixture quietly degrading into a single-store fixture, which
 *      would make CAT-079/CAT-080 pass while testing nothing (the VCST-5705 defect, re-enacted).
 *   3. The alias contract: WISH_TWO_STORE_CUSTOMER exists, is CSV-backed on this file, and declares
 *      exactly the field names the authored cases already reference. A renamed field is invisible to
 *      every other gate — @td() just passes the token through unresolved.
 *   4. Informational: whether the per-env overlay actually carries the runtime ids today.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  CSV_SOURCE, FIXTURE_KEY, RUNTIME_COLUMNS, loadFixture, validateFixtureShape,
} from './wishlist-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

const ALIAS_NAME = 'WISH_TWO_STORE_CUSTOMER';
// The exact field names CAT-079 / CAT-080 already reference. Renaming one silently un-resolves the
// case's @td() token, so this list is a contract, not a convenience.
const REQUIRED_ALIAS_FIELDS = [
  'email', 'password',
  'storeAProductSku', 'storeAProductUrl',
  'storeBProductSku', 'storeBProductUrl',
  'storeAId', 'storeBId',
];
const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const PROSE_COLS = new Set(['test_purpose', 'notes']);

const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const rows = readCsv(CSV_SOURCE.file);
const rec = loadFixture(rows);

// 1. No runtime GUID / per-env store id committed.
console.log(`\n[1] ${CSV_SOURCE.file}: runtime columns are blank and no GUID leaked (multi-env rule)`);
for (const r of rows) {
  for (const col of RUNTIME_COLUMNS) {
    const v = String(r[col] ?? '').trim();
    if (v) fail(`row ${r.fixture_key}: "${col}"="${v}" must be BLANK — it is per-env/runtime and belongs in aliases.<env>.json (written by seed:wishlists)`);
  }
  for (const [col, val] of Object.entries(r)) {
    if (PROSE_COLS.has(col)) continue;
    if (GUID_RE.test(String(val ?? '').trim())) fail(`row ${r.fixture_key}: column "${col}" holds a GUID "${val}" — committed fixtures carry business keys only`);
  }
}
if (!problems.length) ok(`${RUNTIME_COLUMNS.length} runtime column(s) blank across ${rows.length} row(s); no GUIDs in any data column`);

// 2. Fixture shape — the non-vacuity contract.
console.log(`\n[2] ${CSV_SOURCE.file}: fixture shape can still detect a cross-store wishlist leak`);
const shape = validateFixtureShape(rows);
for (const p of shape) fail(p);
if (!shape.length && rec) {
  ok(`${FIXTURE_KEY}: ${rec.email} — store A list "${rec.stores.A.listName}" [${rec.stores.A.sku}] vs store B list "${rec.stores.B.listName}" [${rec.stores.B.sku}]`);
  ok(`derived urls: A ${rec.stores.A.url} | B ${rec.stores.B.url} (both store-A-relative — the cases compose {{FRONT_URL}}@td(...))`);
}

// 3. Alias contract.
console.log(`\n[3] aliases.json: ${ALIAS_NAME} is CSV-backed on this fixture and declares every field the cases use`);
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const def = aliases[ALIAS_NAME];
if (!def) fail(`${ALIAS_NAME} is not registered in aliases.json — every @td(${ALIAS_NAME}.*) in CAT-079/CAT-080 passes through unresolved`);
else {
  if (def.file !== CSV_SOURCE.key) fail(`${ALIAS_NAME}.file="${def.file}" should be "${CSV_SOURCE.key}"`);
  if (def.filter?.fixture_key !== FIXTURE_KEY) fail(`${ALIAS_NAME}.filter must select fixture_key="${FIXTURE_KEY}" (got ${JSON.stringify(def.filter)})`);
  const declared = Object.keys(def.fields || {});
  const missing = REQUIRED_ALIAS_FIELDS.filter((f) => !declared.includes(f));
  if (missing.length) fail(`${ALIAS_NAME} is missing alias field(s) the authored cases reference: ${missing.join(', ')}`);
  const csvCols = new Set(Object.keys(rows[0] || {}));
  for (const [field, col] of Object.entries(def.fields || {})) {
    if (!csvCols.has(col)) fail(`${ALIAS_NAME}.fields.${field} points at CSV column "${col}", which does not exist in ${CSV_SOURCE.file}`);
  }
  if (!missing.length) ok(`${declared.length} field(s) declared, all ${REQUIRED_ALIAS_FIELDS.length} required ones present and column-backed`);
}

// 4. Overlay liveness (informational — an unseeded env is a legitimate state).
const env = process.env.TEST_ENV || 'vcst';
console.log(`\n[4] aliases.${env}.json: runtime ids present (informational — seed the env to populate)`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
if (!existsSync(overlayPath)) warn(`aliases.${env}.json does not exist — run \`TEST_ENV=${env} npm run seed:wishlists\``);
else {
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'))[ALIAS_NAME];
  const have = Object.entries(overlay || {}).filter(([, v]) => String(v || '').trim());
  if (!have.length) warn(`${ALIAS_NAME} has no overlay on ${env} — @td(${ALIAS_NAME}.storeAId/.storeBId) resolves "" until \`TEST_ENV=${env} npm run seed:wishlists\` runs`);
  else {
    ok(`${have.length} runtime field(s) on ${env}: ${have.map(([k]) => k).join(', ')}`);
    if (overlay.storeAId && overlay.storeBId && overlay.storeAId === overlay.storeBId) {
      fail(`aliases.${env}.json: storeAId and storeBId are BOTH "${overlay.storeAId}" — the seeded fixture is single-store and CAT-079/CAT-080 would pass vacuously`);
    }
    if (overlay.storeAWishlistId && overlay.storeAWishlistId === overlay.storeBWishlistId) {
      fail(`aliases.${env}.json: both wishlist ids are "${overlay.storeAWishlistId}" — one wishlist, not two`);
    }
  }
}

console.log('\n=== two-store wishlist drift/leak check ===');
console.log(`  ${CSV_SOURCE.file} rows: ${rows.length} | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nTwo-store wishlist OK — no GUID/per-env leakage; the fixture can still fail on a cross-store leak.');
process.exit(0);
