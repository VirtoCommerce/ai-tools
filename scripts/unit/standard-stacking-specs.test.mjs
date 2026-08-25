/**
 * Unit tests for the DISCOUNT-STACKING model in scripts/seed-data/products/standard-specs.mjs
 * (STACKING_FIXTURES / stackingExpectation / validateStackingShape) — the fixtures behind PRICE-059
 * and PRICE-061.
 *
 * Pure logic only: no network, no env, no fs.
 *
 * Both cases assert WHICH pricing layer a percentage coupon is computed off. That is only observable
 * while the layers yield DIFFERENT numbers — so these tests are about DISTINCTNESS, not presence. A
 * fixture whose sale equals its list, or whose tier equals its sale, still seeds green and still
 * leaves the case passing no matter what the pricing engine did.
 *
 * Live-confirmed on vcst-qa 2026-08-25 (cart-level addItem):
 *   QA-STACK-SALE-001 ×1  → placedPrice 70  (list 100)
 *   QA-STACK-TIER-001 ×1  → placedPrice 150 (sale layer)
 *   QA-STACK-TIER-001 ×10 → placedPrice 120 (tier layer overrides the sale at the threshold)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STACKING_FIXTURES, stackingExpectation, validateStackingShape, SPEC_OVERLAYS, buildPrices,
} from '../seed-data/products/standard-specs.mjs';

const rowsById = { 'PROD-110': { sale_price: '70.00' }, 'PROD-111': { sale_price: '' } };

test('the committed stacking fixtures are clean as authored', () => {
  assert.deepEqual(validateStackingShape(rowsById), []);
});

test('stackingExpectation reproduces the numbers PRICE-059 asserts', () => {
  const fx = STACKING_FIXTURES['PROD-110'];
  assert.deepEqual(stackingExpectation(fx, 'sale'), { unit: 70, discountPerUnit: 7, extendedPrice: 63 });
  // The whole point: applying the same coupon to the LIST price gives a different, distinguishable
  // answer. If these two coincided the case could not tell which layer the engine used.
  assert.deepEqual(stackingExpectation(fx, 'list'), { unit: 100, discountPerUnit: 10, extendedPrice: 90 });
  assert.deepEqual(stackingExpectation(fx, 'effective'), stackingExpectation(fx, 'sale'));
});

test('stackingExpectation reproduces the numbers PRICE-061 asserts, for all three layers', () => {
  const fx = STACKING_FIXTURES['PROD-111'];
  assert.deepEqual(stackingExpectation(fx, 'tier'), { unit: 120, discountPerUnit: 24, extendedPrice: 960 });
  assert.deepEqual(stackingExpectation(fx, 'sale'), { unit: 150, discountPerUnit: 30, extendedPrice: 1200 });
  assert.deepEqual(stackingExpectation(fx, 'list'), { unit: 200, discountPerUnit: 40, extendedPrice: 1600 });
  // "effective" is the tier, because the case adds qty 10 — the threshold.
  assert.deepEqual(stackingExpectation(fx, 'effective'), stackingExpectation(fx, 'tier'));
});

test('all three layer outcomes are mutually distinct', () => {
  const fx = STACKING_FIXTURES['PROD-111'];
  const ext = ['list', 'sale', 'tier'].map((n) => stackingExpectation(fx, n).extendedPrice);
  assert.equal(new Set(ext).size, 3, `expected three distinct extendedPrices, got ${ext.join(', ')}`);
});

/** Temporarily swap one fixture's layers so the guard is exercised against real drift, then restore. */
function withLayers(id, layers, fn) {
  const saved = STACKING_FIXTURES[id].layers;
  STACKING_FIXTURES[id].layers = layers;
  try { return fn(); } finally { STACKING_FIXTURES[id].layers = saved; }
}

test('VACUITY: a sale equal to list is rejected', () => {
  // With no real markdown, 'coupon off the sale price' and 'coupon off the list price' are the same
  // number — PRICE-059 then passes whichever layer the engine used.
  const problems = withLayers('PROD-110', { list: 100, sale: 100 }, () => validateStackingShape(rowsById));
  assert.ok(problems.some((p) => /sale 100 is not below list 100/.test(p)), problems.join('\n'));
});

test('VACUITY: a tier equal to (or above) the sale is rejected', () => {
  // 'tier overrides sale at the threshold' becomes unobservable — exactly why no pre-existing
  // fixture could serve PRICE-061.
  const problems = withLayers('PROD-111', { list: 200, sale: 150, tier: 150 }, () => validateStackingShape(rowsById));
  assert.ok(problems.some((p) => /tier 150 is not below sale 150/.test(p)), problems.join('\n'));
});

test('VACUITY: two layers yielding the SAME discounted outcome are rejected', () => {
  // The subtle one: the base prices differ (so a naive strictly-decreasing check passes) but both
  // round to an identical discount and extendedPrice, so the discount still cannot be attributed.
  // 0.4 and 0.404 both give discountPerUnit 0.04 at 10% and the same 1-qty extendedPrice.
  const problems = withLayers('PROD-110', { list: 0.404, sale: 0.4 }, () => validateStackingShape(rowsById));
  assert.ok(problems.some((p) => /both yield discount .* extendedPrice/.test(p)), problems.join('\n'));
});
test('VACUITY: a tiered row that ALSO fills sale_price is rejected', () => {
  // buildPrices() returns tierPrices VERBATIM and drops sale_price, so the column would look
  // meaningful and do nothing — a trap that silently removes the sale layer.
  const problems = validateStackingShape({ ...rowsById, 'PROD-111': { sale_price: '150.00' } });
  assert.ok(problems.some((p) => /tierPrices AND a sale_price/.test(p)), problems.join('\n'));
});

test('VACUITY: a tier threshold above the quantity the case adds is rejected', () => {
  const saved = SPEC_OVERLAYS['PROD-111'].tierPrices;
  try {
    SPEC_OVERLAYS['PROD-111'].tierPrices = [
      { minQuantity: 1, list: 200, sale: 150 },
      { minQuantity: 50, list: 200, sale: 120 },
    ];
    const problems = validateStackingShape(rowsById);
    assert.ok(problems.some((p) => /tier threshold is 50/.test(p)), problems.join('\n'));
  } finally {
    SPEC_OVERLAYS['PROD-111'].tierPrices = saved;
  }
});

test('the sale layer lives INSIDE the tier rows, because buildPrices drops sale_price', () => {
  const tiers = SPEC_OVERLAYS['PROD-111'].tierPrices;
  assert.equal(tiers.length, 2);
  assert.deepEqual(tiers[0], { minQuantity: 1, list: 200.00, sale: 150.00 });
  assert.deepEqual(tiers[1], { minQuantity: 10, list: 200.00, sale: 120.00 });
  // Proof of the precedence that forces the shape: a record carrying BOTH is resolved to the tiers.
  const out = buildPrices({ tierPrices: tiers, listPrice: 200, salePrice: 150 });
  assert.deepEqual(out, tiers, 'buildPrices must return tierPrices verbatim, ignoring listPrice/salePrice');
});

test('PROD-110 keeps the flat sale shape (no tier override)', () => {
  assert.equal(SPEC_OVERLAYS['PROD-110'], undefined);
  assert.deepEqual(buildPrices({ listPrice: 100, salePrice: 70 }), [{ list: 100, minQuantity: 1, sale: 70 }]);
});

test('each fixture names the coupon alias it reuses rather than seeding a new one', () => {
  // The coupons already exist (QA10OFF / SUPER, confirmed live). The literal SAVE10 / SAVE20 in the
  // case Steps never existed on any env — that is a Steps defect, not a data gap.
  assert.equal(STACKING_FIXTURES['PROD-110'].couponAlias, 'COUPON_10PCT');
  assert.equal(STACKING_FIXTURES['PROD-111'].couponAlias, 'COUPON_20PCT');
});
