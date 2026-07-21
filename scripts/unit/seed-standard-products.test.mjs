// Unit tests for the standard-products seeder's pure price-shaping logic (scripts/seed-data/products/
// standard-specs.mjs). Codifies the sale-price fixture behaviour added for CPN-059 (BL-CART-003):
//   • a flat row with a sale_price emits one price row carrying `sale` (actual < list);
//   • a plain row (no sale) stays list-only;
//   • tierPrices pass through untouched;
//   • an inverted / zero / non-numeric sale degrades to list-only (never an inverted sale);
//   • the CSV column mapping exposes sale_price.
// Pure — no env, no network (standard-specs is side-effect-free). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrices, CSV_SOURCE } from '../seed-data/products/standard-specs.mjs';

test('CSV_SOURCE.map exposes the sale_price column as salePrice', () => {
  assert.equal(CSV_SOURCE.map.salePrice, 'sale_price');
  assert.equal(CSV_SOURCE.map.listPrice, 'price');
});

test('buildPrices: flat row with a valid sale emits one row with sale (actual < list)', () => {
  assert.deepEqual(buildPrices({ listPrice: 29.99, salePrice: 19.99 }), [
    { list: 29.99, sale: 19.99, minQuantity: 1 },
  ]);
});

test('buildPrices: flat row with no sale stays list-only', () => {
  assert.deepEqual(buildPrices({ listPrice: 99.99 }), [{ list: 99.99, minQuantity: 1 }]);
  assert.deepEqual(buildPrices({ listPrice: 99.99, salePrice: null }), [{ list: 99.99, minQuantity: 1 }]);
});

test('buildPrices: tierPrices pass through unchanged', () => {
  const tiers = [
    { minQuantity: 1, list: 29.99 },
    { minQuantity: 10, list: 29.99, sale: 26.99 },
  ];
  assert.equal(buildPrices({ tierPrices: tiers }), tiers);
});

test('buildPrices: unpriced row → []', () => {
  assert.deepEqual(buildPrices({}), []);
  assert.deepEqual(buildPrices({ listPrice: null }), []);
});

test('buildPrices: a non-sale (sale >= list) or zero/negative sale degrades to list-only', () => {
  assert.deepEqual(buildPrices({ listPrice: 20, salePrice: 20 }), [{ list: 20, minQuantity: 1 }]);
  assert.deepEqual(buildPrices({ listPrice: 20, salePrice: 25 }), [{ list: 20, minQuantity: 1 }]);
  assert.deepEqual(buildPrices({ listPrice: 20, salePrice: 0 }), [{ list: 20, minQuantity: 1 }]);
  assert.deepEqual(buildPrices({ listPrice: 20, salePrice: -5 }), [{ list: 20, minQuantity: 1 }]);
});
