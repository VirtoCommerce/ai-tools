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
  CSV_SOURCE, FIXTURE_KEY, RUNTIME_COLUMNS, SEED_PREFIX, MAIN_FFC, loadFixture, validateFixtureShape, deriveSlug, deriveUrl, buildVariationBody,
} from '../seed-data/inventory/variation-stock-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

const rows = readCsv(CSV_SOURCE.file);
const ffcRows = readCsv(MAIN_FFC.csvFile);
const rec = loadFixture(rows);
const withColumn = (col, value) => rows.map((r) => ({ ...r, [col]: value }));

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

test('a zero-stock variation is rejected — an absent row would be legitimate, so nothing could fail', () => {
  const problems = validateFixtureShape(withColumn('variation_stock_qty', '0'), ffcRows);
  assert.ok(problems.some((p) => /variation_stock_qty must be a positive number/.test(p)));
});

test('a missing fixture row is reported, not silently treated as empty', () => {
  assert.equal(loadFixture([]), null);
  assert.deepEqual(validateFixtureShape([], ffcRows), [`no row with fixture_key="${FIXTURE_KEY}" in ${CSV_SOURCE.file}`]);
});
