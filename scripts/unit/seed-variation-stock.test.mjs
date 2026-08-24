// Unit tests for the stocked-variation fixture's pure logic (scripts/seed-data/inventory/
// variation-stock-specs.mjs). VCST-5546 / INV-047.
//
// INV-047 asserts the per-fulfillment-center products blade lists VARIATIONS as their own rows with
// their own quantities. Three ways that case can silently stop being able to fail, each pinned below:
//   • the "variation" is really a standalone product (no mainProductId) — then nothing about variation
//     handling is exercised;
//   • master and variation carry the SAME stock — then "its own record, not the master's aggregate"
//     is unfalsifiable;
//   • the stock lands on a non-main fulfillment center — then the blade under test never sees it
//     (the ffcs[0] trap).
//
// Pure — no env, no network (variation-stock-specs is side-effect-free). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  CSV_SOURCE, FIXTURE_KEY, RUNTIME_COLUMNS, SEED_PREFIX, MAIN_FFC,
  loadFixture, validateFixtureShape, stockPlan, deriveSlug, deriveUrl,
  buildMasterBody, buildVariationBody,
} from '../seed-data/inventory/variation-stock-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

const rows = readCsv(CSV_SOURCE.file);
const ffcRows = readCsv(MAIN_FFC.csvFile);
const rec = loadFixture(rows);
const withColumn = (col, value) => rows.map((r) => ({ ...r, [col]: value }));

test('the committed fixture parses, is seeded, and passes every shape assertion', () => {
  assert.ok(rec, `a row with fixture_key=${FIXTURE_KEY} must exist`);
  assert.equal(rec.seeded, true);
  assert.deepEqual(validateFixtureShape(rows, ffcRows), []);
});

test('runtime id columns are declared and blank in the committed CSV (multi-env rule)', () => {
  assert.deepEqual(RUNTIME_COLUMNS, ['master_id', 'variation_id', 'ffc_id']);
  for (const col of RUNTIME_COLUMNS) {
    assert.equal(String(rows[0][col] ?? '').trim(), '', `${col} must be blank — runtime ids live in aliases.<env>.json`);
  }
});

test('buildVariationBody sets mainProductId — this is what makes it a VARIATION, not a second product', () => {
  const body = buildVariationBody(rec, 'master-guid-123');
  assert.equal(body.mainProductId, 'master-guid-123');
  assert.equal(body.code, rec.variation.sku);
  assert.equal(body.trackInventory, true);
});

test('the variation deliberately publishes NO SEO record — it has no independent PDP route', () => {
  const body = buildVariationBody(rec, 'm');
  assert.equal(body.seoInfos, undefined, 'inventing a variation PDP path would publish a route that does not exist');
  // The master is the navigable half.
  const master = buildMasterBody(rec, { seoInfos: [{ semanticUrl: rec.master.slug }] });
  assert.deepEqual(master.seoInfos, [{ semanticUrl: rec.master.slug }]);
});

test('master and variation SKUs are distinct — INV-047 asserts two separate grid rows', () => {
  assert.notEqual(rec.master.sku, rec.variation.sku);
  const problems = validateFixtureShape(withColumn('variation_sku', rec.master.sku), ffcRows);
  assert.ok(problems.some((p) => /share the sku/.test(p)));
});

test('stock quantities DIVERGE — equal quantities make the aggregate assertion unfalsifiable', () => {
  assert.notEqual(rec.master.stock, rec.variation.stock);
  const problems = validateFixtureShape(withColumn('master_stock_qty', String(rec.variation.stock)), ffcRows);
  assert.ok(problems.some((p) => /cannot fail when the numbers are identical/.test(p)));
});

test('a zero-stock variation is rejected — an absent row would be legitimate, so nothing could fail', () => {
  const problems = validateFixtureShape(withColumn('variation_stock_qty', '0'), ffcRows);
  assert.ok(problems.some((p) => /variation_stock_qty must be a positive number/.test(p)));
});

test('the fixture stocks the store_role=main fulfillment center, never an arbitrary one', () => {
  assert.equal(rec.ffcCsvId, MAIN_FFC.csvId);
  const mainRow = ffcRows.find((r) => r.ffc_id === MAIN_FFC.csvId);
  assert.equal(String(mainRow[MAIN_FFC.roleColumn]).trim().toLowerCase(), MAIN_FFC.roleValue);
  // Pointing it at an `additional` FFC must be rejected — that is the ffcs[0] trap in fixture form.
  const additional = ffcRows.find((r) => String(r[MAIN_FFC.roleColumn]).trim().toLowerCase() === 'additional');
  const problems = validateFixtureShape(withColumn('ffc_csv_id', additional.ffc_id), ffcRows);
  assert.ok(problems.some((p) => /store_role=main|should be "FFC-001"/.test(p)));
});

test('stockPlan writes the master first, then the variation, with the fixture quantities', () => {
  assert.deepEqual(stockPlan(rec), [
    { role: 'master', sku: rec.master.sku, quantity: rec.master.stock },
    { role: 'variation', sku: rec.variation.sku, quantity: rec.variation.stock },
  ]);
});

test('both products carry the AGENT-TEST- prefix so teardown can guard on the name', () => {
  assert.ok(rec.master.name.startsWith(SEED_PREFIX));
  assert.ok(rec.variation.name.startsWith(SEED_PREFIX));
  const problems = validateFixtureShape(withColumn('variation_name', 'Blue XL'), ffcRows);
  assert.ok(problems.some((p) => new RegExp(`must start with "${SEED_PREFIX}"`).test(p)));
});

test('the master slug/url are DERIVED and store-relative', () => {
  assert.equal(rec.master.slug, deriveSlug(rec.master.name));
  assert.equal(rec.master.url, deriveUrl(rec.categoryPath, rec.master.name));
  assert.ok(rec.master.url.startsWith('/'));
  const problems = validateFixtureShape(withColumn('master_url', 'https://vcst-qa/x'), ffcRows);
  assert.ok(problems.length > 0);
});

test('a missing fixture row is reported, not silently treated as empty', () => {
  assert.equal(loadFixture([]), null);
  assert.deepEqual(validateFixtureShape([], ffcRows), [`no row with fixture_key="${FIXTURE_KEY}" in ${CSV_SOURCE.file}`]);
});
