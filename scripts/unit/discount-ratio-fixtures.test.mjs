// Unit tests for the VCST-5691 discount-ratio model (scripts/seed-data/products/standard-specs.mjs)
// and the two fixtures it governs. What is actually being protected here:
//
//   • xAPI PriceType.discountPercent is a FRACTION rounded to 4 decimals with MidpointRounding.
//     AwayFromZero (the SHIPPED fix in vc-module-x-api ProductPrice.GetDiscountPercent — NOT the
//     IMoneyRoundingPolicy the ticket proposed; a reviewer overrode that during review). So there is
//     no rounding policy to configure, and the only way to detect a regression is a fixture whose raw
//     ratio has the right shape.
//   • PROD-108 must be FRACTIONAL (12.5%) — a whole-percent implementation passes on every integer-
//     percent fixture, which is all the repo had before.
//   • PROD-109 must sit ON the 4-decimal midpoint (0.12345) so AwayFromZero (0.1235) and banker's/
//     ToEven (0.1234) DISAGREE. Off the midpoint the case proves nothing.
//   • The ratio must be re-derived in INTEGER CENTS. Float subtraction turns 200.00 - 175.31 into
//     24.689999999999998 and the ratio into 0.12344999…, which rounds the WRONG way — the exact class
//     of silent error this fixture exists to catch, so the helper must not be written with floats.
//
// Pure — no env, no network. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  DISCOUNT_RATIO_FIXTURES, DISCOUNT_PERCENT_DECIMALS, CSV_SOURCE,
  discountRatioScaled, roundAwayFromZero, roundHalfToEven, isRoundingMidpoint, expectedDiscountPercent,
} from '../seed-data/products/standard-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const tp = parse(readFileSync(join(ROOT, 'test-data', CSV_SOURCE.file), 'utf8'), {
  columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
});
const byId = new Map(tp.map((r) => [r.product_id, r]));
const SCALE = 1e9;

test('the shipped fix rounds to 4 decimals — the spec states the real precision, not a guess', () => {
  assert.equal(DISCOUNT_PERCENT_DECIMALS, 4);
});

test('discountRatioScaled is exact for 2-decimal money (float subtraction would not be)', () => {
  // The float trap this helper exists to avoid.
  assert.notEqual((200 - 175.31) / 200, 0.12345);
  assert.equal(discountRatioScaled(200.0, 175.31, SCALE), 0.12345 * SCALE);
  assert.equal(discountRatioScaled(100.0, 87.5, SCALE), 0.125 * SCALE);
});

test('discountRatioScaled rejects a non-sale, an inverted pair, and sub-cent precision', () => {
  assert.equal(discountRatioScaled(100, 100), null);          // not a discount
  assert.equal(discountRatioScaled(100, 120), null);          // inverted
  assert.equal(discountRatioScaled(100, 0), null);            // zero sale
  assert.equal(discountRatioScaled(100, 87.505), null);       // finer than money precision
  assert.equal(discountRatioScaled('abc', 10), null);
});

test('roundAwayFromZero and roundHalfToEven disagree exactly on a midpoint', () => {
  assert.equal(roundAwayFromZero(0.12345), 0.1235);
  assert.equal(roundHalfToEven(0.12345), 0.1234);
  // Off the midpoint they must agree, or the midpoint check would fire on everything.
  assert.equal(roundAwayFromZero(0.12341), 0.1234);
  assert.equal(roundHalfToEven(0.12341), 0.1234);
  assert.equal(roundAwayFromZero(0.125), 0.125);
  assert.equal(roundHalfToEven(0.125), 0.125);
});

test('isRoundingMidpoint identifies only genuine midpoints', () => {
  assert.equal(isRoundingMidpoint(0.12345), true);
  assert.equal(isRoundingMidpoint(0.125), false);     // exactly representable at 4dp
  assert.equal(isRoundingMidpoint(0.3334), false);
});

test('PROD-108 is a FRACTIONAL discount of exactly 12.5% and reports 0.1250', () => {
  const spec = DISCOUNT_RATIO_FIXTURES['PROD-108'];
  const row = byId.get('PROD-108');
  assert.ok(row, 'PROD-108 must exist in test-products.csv');
  assert.equal(spec.requireMidpoint, false);
  assert.equal(discountRatioScaled(row.price, row.sale_price, SCALE), Math.round(spec.ratio * SCALE));
  assert.equal(expectedDiscountPercent(spec.ratio), 0.125);
  // The point of the fixture: it is NOT a whole percent, so a truncating implementation is detectable.
  assert.notEqual(spec.ratio * 100, Math.round(spec.ratio * 100));
});

test('PROD-109 lands on the 4-decimal midpoint, so AwayFromZero and ToEven diverge', () => {
  const spec = DISCOUNT_RATIO_FIXTURES['PROD-109'];
  const row = byId.get('PROD-109');
  assert.ok(row, 'PROD-109 must exist in test-products.csv');
  assert.equal(spec.requireMidpoint, true);
  assert.equal(discountRatioScaled(row.price, row.sale_price, SCALE), Math.round(spec.ratio * SCALE));
  assert.equal(isRoundingMidpoint(spec.ratio), true);
  assert.equal(expectedDiscountPercent(spec.ratio), 0.1235);
  assert.equal(roundHalfToEven(spec.ratio), 0.1234);
});

test('both fixtures are seeded rows — an unseeded row leaves the case blocked', () => {
  for (const id of Object.keys(DISCOUNT_RATIO_FIXTURES)) {
    assert.equal(String(byId.get(id)?.seeded).toLowerCase(), 'true', `${id} must be seeded=true`);
  }
});

test('a one-cent price edit breaks the ratio — the drift the guard exists for', () => {
  const spec = DISCOUNT_RATIO_FIXTURES['PROD-109'];
  assert.notEqual(discountRatioScaled(200.0, 175.3, SCALE), Math.round(spec.ratio * SCALE));
  assert.notEqual(discountRatioScaled(200.0, 175.32, SCALE), Math.round(spec.ratio * SCALE));
});
