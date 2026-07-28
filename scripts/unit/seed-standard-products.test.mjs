// Unit tests for the standard-products seeder's pure logic (scripts/seed-data/products/
// standard-specs.mjs). Codifies:
//   • the sale-price fixture behaviour added for CPN-059 (BL-CART-003): a flat row with a sale_price
//     emits one price row carrying `sale` (actual < list); a plain row stays list-only; tierPrices pass
//     through untouched; an inverted / zero / non-numeric sale degrades to list-only;
//   • the MULTI-CURRENCY model (price_eur → a second, EUR-currency price set + its own pricelist), which
//     is what makes a fixture stay priced and addable after a storefront currency switch instead of
//     collapsing to 0.00 with a disabled qty stepper;
//   • the SLUG / URL rules that make the committed product_slug / storefront_url columns derivable
//     (and therefore drift-guardable) rather than hand-maintained — cases navigate
//     {{FRONT_URL}}@td(ALIAS.url), never /product/<sku>, which renders a client-side 404.
// Pure — no env, no network (standard-specs is side-effect-free). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrices, CSV_SOURCE, buildCurrencyPriceSets, currenciesFor, priceListName,
  productSlug, categorySegmentSlug, storefrontPathForAdHoc, slugify,
  BASE_CURRENCY, SECONDARY_CURRENCY,
} from '../seed-data/products/standard-specs.mjs';

test('CSV_SOURCE.map exposes the sale_price column as salePrice', () => {
  assert.equal(CSV_SOURCE.map.salePrice, 'sale_price');
  assert.equal(CSV_SOURCE.map.listPrice, 'price');
});

test('CSV_SOURCE.map exposes the second-currency + slug/url columns', () => {
  assert.equal(CSV_SOURCE.map.eurPrice, 'price_eur');
  assert.equal(CSV_SOURCE.map.slug, 'product_slug');
  assert.equal(CSV_SOURCE.map.storefrontUrl, 'storefront_url');
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

// --- multi-currency (the CART-093 currency-switch gap) --------------------------------------------

test('buildCurrencyPriceSets: no price_eur → a single base-currency set (today\'s behaviour)', () => {
  assert.deepEqual(buildCurrencyPriceSets({ listPrice: 99.99, currency: 'USD' }), [
    { currency: 'USD', prices: [{ list: 99.99, minQuantity: 1 }] },
  ]);
});

test('buildCurrencyPriceSets: a positive price_eur adds a second, EUR set', () => {
  assert.deepEqual(buildCurrencyPriceSets({ listPrice: 24.99, currency: 'USD', eurPrice: 22.49 }), [
    { currency: 'USD', prices: [{ list: 24.99, minQuantity: 1 }] },
    { currency: 'EUR', prices: [{ list: 22.49, minQuantity: 1 }] },
  ]);
});

test('buildCurrencyPriceSets: a blank / zero / negative / non-numeric price_eur is ignored, never emitted as 0', () => {
  // A 0.00 EUR row is the exact symptom the second currency exists to prevent, so it must never be
  // written; the row degrades to single-currency instead.
  for (const bad of ['', null, undefined, 0, '0', -3, 'n/a', NaN]) {
    const sets = buildCurrencyPriceSets({ listPrice: 10, currency: 'USD', eurPrice: bad });
    assert.deepEqual(sets, [{ currency: 'USD', prices: [{ list: 10, minQuantity: 1 }] }], `eurPrice=${String(bad)}`);
  }
});

test('buildCurrencyPriceSets: an unpriced row yields no sets at all (not an empty EUR set)', () => {
  assert.deepEqual(buildCurrencyPriceSets({}), []);
  assert.deepEqual(buildCurrencyPriceSets({ eurPrice: 5 }), [{ currency: 'EUR', prices: [{ list: 5, minQuantity: 1 }] }]);
});

test('buildCurrencyPriceSets: the base set keeps tier shape; EUR stays one flat row', () => {
  const tiers = [{ minQuantity: 1, list: 29.99 }, { minQuantity: 10, list: 29.99, sale: 26.99 }];
  assert.deepEqual(buildCurrencyPriceSets({ tierPrices: tiers, currency: 'USD', eurPrice: 27.5 }), [
    { currency: 'USD', prices: tiers },
    { currency: 'EUR', prices: [{ list: 27.5, minQuantity: 1 }] },
  ]);
});

test('currenciesFor: the union of every record\'s currencies, deduped and order-stable', () => {
  const recs = [
    { listPrice: 10, currency: 'USD' },
    { listPrice: 20, currency: 'USD', eurPrice: 18 },
    { listPrice: 30, currency: 'USD', eurPrice: 27 },
    {},
  ];
  assert.deepEqual(currenciesFor(recs), ['USD', 'EUR']);
  assert.deepEqual(currenciesFor([{ listPrice: 1, currency: 'USD' }]), ['USD']);
});

test('priceListName: one stable, date-pinned name PER CURRENCY (the USD name is unchanged)', () => {
  // Unchanged USD name == idempotent reuse of the pricelist already live on the env.
  assert.equal(priceListName('20260519', 'USD'), 'SEED-20260519-Standards-USD');
  assert.equal(priceListName('20260519', 'EUR'), 'SEED-20260519-Standards-EUR');
  assert.notEqual(priceListName('20260519', BASE_CURRENCY), priceListName('20260519', SECONDARY_CURRENCY));
});

// --- slug / storefront-url rules (the dead-PDP-route gap) ------------------------------------------

test('productSlug: matches the seeder\'s semanticUrl rule for the live fixture names', () => {
  // Confirmed live 2026-07-25 against the seeded products' seoInfos.
  assert.equal(productSlug('AGENT-TEST-OOS-Fixture'), 'agent-test-oos-fixture');
  assert.equal(productSlug('AGENT-TEST-Low-Stock-Fixture'), 'agent-test-low-stock-fixture');
  assert.equal(productSlug('AGENT-TEST-Sale Sample Widget'), 'agent-test-sale-sample-widget');
  assert.equal(productSlug('AGENT-TEST-Silicone Mats 2-pack'), 'agent-test-silicone-mats-2-pack');
});

test('slugify: collapses runs of non-alphanumerics and trims the edges', () => {
  assert.equal(slugify('  Audio & Video  '), 'audio-video');
  assert.equal(slugify('Home > Kitchen'), 'home-kitchen');
  assert.equal(slugify(''), '');
  assert.equal(slugify(null), '');
});

test('categorySegmentSlug: an ad-hoc segment is PARENT-SCOPED, not bare', () => {
  // ensureCategoryPath scopes ad-hoc segments by ancestry so a leaf name reused under different
  // parents (Storage under four parents) gets distinct categories AND distinct semanticUrls.
  assert.equal(categorySegmentSlug(['Test Fixtures']), 'seed-test-fixtures');
  assert.equal(categorySegmentSlug(['Home']), 'seed-home');
  assert.equal(categorySegmentSlug(['Home', 'Kitchen']), 'seed-home-kitchen');
  assert.notEqual(categorySegmentSlug(['Home', 'Storage']), categorySegmentSlug(['Tools', 'Storage']));
});

test('storefrontPathForAdHoc: the live-verified single-segment shape', () => {
  // /seed-test-fixtures/<product-slug> — the ONLY working PDP path for these fixtures
  // (/product/<sku> renders a client-side 404: HTTP 200 SPA soft-404).
  assert.equal(
    storefrontPathForAdHoc('Test Fixtures', 'AGENT-TEST-OOS-Fixture'),
    '/seed-test-fixtures/agent-test-oos-fixture',
  );
  assert.equal(
    storefrontPathForAdHoc('Test Fixtures', 'AGENT-TEST-SubFive-Fixture'),
    '/seed-test-fixtures/agent-test-subfive-fixture',
  );
});

test('storefrontPathForAdHoc: deeper paths accumulate the scoped category slugs', () => {
  assert.equal(
    storefrontPathForAdHoc('Home > Kitchen', 'AGENT-TEST-Dish Rack'),
    '/seed-home/seed-home-kitchen/agent-test-dish-rack',
  );
});

test('storefrontPathForAdHoc: always store-RELATIVE (no scheme/host) and null on an empty path', () => {
  const p = storefrontPathForAdHoc('Test Fixtures', 'AGENT-TEST-X');
  assert.ok(p.startsWith('/'), 'must be relative so a case composes {{FRONT_URL}}@td(ALIAS.url)');
  assert.ok(!/^[a-z]+:\/\//i.test(p) && !p.includes('{{'));
  assert.equal(storefrontPathForAdHoc('', 'AGENT-TEST-X'), null);
  assert.equal(storefrontPathForAdHoc(null, 'AGENT-TEST-X'), null);
});

test('the committed CSV columns agree with the derivation for every Test Fixtures row', async () => {
  // End-to-end guard-of-the-guard: the values actually in test-products.csv must be reproducible from
  // the rules above, so no one can hand-edit a slug/url into the CSV undetected.
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { parse } = await import('csv-parse/sync');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const rows = parse(readFileSync(join(root, 'test-data', CSV_SOURCE.file), 'utf8'), {
    columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
  });
  const fixtures = rows.filter((r) => (r[CSV_SOURCE.map.categoryPath] || '').trim() === 'Test Fixtures');
  assert.ok(fixtures.length >= 12, `expected the Test Fixtures family, got ${fixtures.length}`);
  for (const r of fixtures) {
    const name = r[CSV_SOURCE.map.name];
    assert.equal(r[CSV_SOURCE.map.slug], productSlug(name), `${r[CSV_SOURCE.map.csvId]} product_slug`);
    assert.equal(
      r[CSV_SOURCE.map.storefrontUrl],
      storefrontPathForAdHoc('Test Fixtures', name),
      `${r[CSV_SOURCE.map.csvId]} storefront_url`,
    );
  }
});

test('the sub-$5 fixture is genuinely below the COUPON_FIXED5 discount amount', async () => {
  // The whole point of PROD-107: with the previously-cheapest fixture at 9.99 a $5 fixed-amount coupon
  // could never exceed the subtotal, so a "total floors at zero, never negative" assertion passed
  // vacuously. If this ever regresses, the boundary silently stops being reachable again.
  const { readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const { parse } = await import('csv-parse/sync');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const rows = parse(readFileSync(join(root, 'test-data', CSV_SOURCE.file), 'utf8'), {
    columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
  });
  const row = rows.find((r) => r[CSV_SOURCE.map.csvId] === 'PROD-107');
  assert.ok(row, 'PROD-107 (the sub-$5 fixture) must exist');
  const FIXED_DISCOUNT = 5; // @td(COUPON_FIXED5) — "Fixed $5 dollar off cart subtotal"
  assert.ok(
    Number(row[CSV_SOURCE.map.listPrice]) < FIXED_DISCOUNT,
    `PROD-107 price ${row[CSV_SOURCE.map.listPrice]} must stay strictly below the $${FIXED_DISCOUNT} fixed discount`,
  );
  assert.ok(Number(row[CSV_SOURCE.map.eurPrice]) < FIXED_DISCOUNT, 'the EUR price must clear the same boundary');
});
