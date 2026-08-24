/**
 * scripts/seed-data/standard-specs.mjs
 *
 * SINGLE orchestration source for the standard (non-configurable) product seeder. Side-effect-free
 * (no network, no top-level work) so BOTH the seeder (seed-standard-products.mjs) and the guard
 * (validate-standard-data.mjs) can import it.
 *
 * Model: CSV-as-input (rule 2 in .claude/rules/test-data.md). test-products.csv is the SINGLE source
 * of truth for the standard products AND the @td() resolution registry — the seeder READS it and
 * creates every row flagged `seeded=true`; nothing is transcribed twice. standard-specs.mjs adds
 * only what the flat CSV cannot express:
 *   - CSV_SOURCE:        which CSV to seed from + how each column maps to a product field.
 *   - SPEC_OVERLAYS:     extra create-time fields a lean row lacks (MOQ / pack-size / tier prices),
 *                        keyed by product_id — merged onto the CSV row at seed time.
 *   - DISCOVERED_FIXTURES: real IMPORTED products (standard.csv STD-*) that can't be created — the
 *                        seeder DISCOVERS them by code and captures the runtime id (+ hosting
 *                        catalogId) to aliases.<env>.json (never a committed cross-env GUID).
 *   - the SLUG/URL rules: productSlug() / categorySegmentSlug() / storefrontPathForAdHoc() — the ONE
 *                        definition of the storefront path a seeded product lands on, shared by the
 *                        seeder (which writes the product SEO record) and the guard (which asserts the
 *                        committed product_slug / storefront_url columns still match).
 *   - the CURRENCY model: buildCurrencyPriceSets() / priceListName() — one pricelist per currency, so a
 *                        row carrying `price_eur` is genuinely addable after a storefront currency
 *                        switch instead of collapsing to 0.00 with a disabled stepper.
 *
 * NOT in scope: the normalized relational catalog fixture (test-data/catalogs/*.csv +
 * products/products-full.csv + pricing/*.csv + inventory/stock-levels.csv) driven by the LEGACY
 * seed-test-data.js — that's a separate, foreign-keyed system; do not fold it in here.
 *
 * test-products.csv carries NO runtime GUID (business keys only) → multi-env-safe by construction.
 * The guard (validate-standard-data.mjs) asserts that stays true.
 */

// The one CSV the standard seeder creates products from (also the @td registry for the PROD_* aliases).
// `map`: product field ← CSV column. Only rows with seeded=true are created; the rest are @td-only
// references to live / manually-provisioned products.
export const CSV_SOURCE = {
  key: 'products/test-products',
  file: 'products/test-products.csv',
  map: {
    csvId: 'product_id',
    code: 'sku',
    name: 'product_name',
    categoryPath: 'category',   // "Electronics > Audio" → leaf category under the seed catalog
    listPrice: 'price',
    salePrice: 'sale_price',    // optional per-row sale (actual < list); blank → no sale
    currency: 'currency',
    eurPrice: 'price_eur',      // optional SECOND-currency list price; blank → single-currency row
    stock: 'stock_qty',
    description: 'description',
    seeded: 'seeded',           // 'true' → the seeder creates it; else @td-only
    slug: 'product_slug',       // derived (productSlug); committed so @td(ALIAS.slug) resolves
    storefrontUrl: 'storefront_url', // derived, store-RELATIVE path; @td(ALIAS.url) — never a host
  },
};

// ---------------------------------------------------------------------------
// SLUG / URL rules — ONE definition, shared by the seeder and the guard.
// ---------------------------------------------------------------------------
// A seeded product's SEO record is buildStoreSeo({ semanticUrl: productSlug(name) }) and its
// category chain is created by seed-common's ensureCategoryPath, which gives an AD-HOC segment (one
// that has no test-data/catalogs/categories.csv row — e.g. "Test Fixtures") the semanticUrl
// `seed-<parent-scoped slug>` (see categorySegmentSlug). So the storefront path of a seeded product
// under an ad-hoc category path is fully DERIVABLE — which is why product_slug / storefront_url can
// live in the committed CSV as env-invariant business keys (no runtime GUID) and be drift-guarded
// rather than hand-maintained.
// Confirmed live 2026-07-25 on the 10 `Test Fixtures` rows: /seed-test-fixtures/<product-slug>.

/** The slug rule for any name → SEO semanticUrl segment. */
export const slugify = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** A seeded product's own SEO slug (== seed-standard-products' semanticUrl). */
export const productSlug = (name) => slugify(name);

/**
 * The semanticUrl seed-common's ensureCategoryPath gives an AD-HOC category segment — one with no
 * categories.csv row. It is `seed-<PARENT-SCOPED slug>`: the slugs of the whole path SO FAR joined by
 * '-', not the segment alone. (ensureCategoryPath scopes ad-hoc segments by their ancestry on purpose,
 * so a leaf name reused under different parents — Electronics>Office vs Furniture>Office, or Storage
 * under four parents — resolves to DISTINCT categories with unique semanticUrls.) A segment that IS in
 * categories.csv instead uses `seed-<its seo_slug>`, which this module cannot know (it stays CSV-free);
 * the guard handles that case structurally.
 *
 * `pathSoFar` is the ordered list of segments up to and including this one.
 */
export const categorySegmentSlug = (pathSoFar) =>
  `seed-${(Array.isArray(pathSoFar) ? pathSoFar : [pathSoFar]).map(slugify).join('-')}`;

/**
 * Store-relative storefront path for a product placed under a fully AD-HOC category path.
 * `/seed-<a>[/seed-<a>-<b>…]/<product-slug>` — no scheme, no host: a case composes
 * `{{FRONT_URL}}@td(ALIAS.url)` so the same fixture URL works on every env.
 * Returns null when the category path is empty.
 *
 * Verified live 2026-07-25 for the single-segment `Test Fixtures` path (the 10 fixture rows resolve at
 * /seed-test-fixtures/<product-slug>). Deeper ad-hoc paths follow the same cumulative rule read off
 * ensureCategoryPath, but the guard only REQUIRES the column where the path is a single ad-hoc segment.
 */
export function storefrontPathForAdHoc(categoryPath, productName) {
  const segs = String(categoryPath ?? '').split('>').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return null;
  const cats = segs.map((_, i) => categorySegmentSlug(segs.slice(0, i + 1)));
  return `/${cats.join('/')}/${productSlug(productName)}`;
}

// ---------------------------------------------------------------------------
// CURRENCY model — one pricelist per currency.
// ---------------------------------------------------------------------------
// A price row is currency-scoped platform-side, and a pricelist has exactly ONE currency. The seeder
// therefore resolves/creates a pricelist per currency it needs and assigns each to the store's virtual
// catalog. A row with no `price_eur` is USD-only (today's behaviour, unchanged).
export const BASE_CURRENCY = 'USD';
export const SECONDARY_CURRENCY = 'EUR';

/** Stable, date-pinned pricelist name per currency (the USD name is unchanged → idempotent reuse). */
export const priceListName = (dateStamp, currency) => `SEED-${dateStamp}-Standards-${currency}`;

/**
 * Per-currency price sets for a record — the single, unit-tested source of the seeder's multi-currency
 * shape. The base set reuses buildPrices() unchanged (tiers / sale / list). A positive `price_eur`
 * adds ONE flat EUR list row (tier/sale shape is deliberately not mirrored — the second currency
 * exists so the line stays priced + addable after a currency switch, not to duplicate tier logic).
 * A blank / non-positive / non-numeric price_eur is ignored (single-currency), never emitted as 0.
 */
export function buildCurrencyPriceSets(rec) {
  const sets = [];
  const base = buildPrices(rec);
  if (base.length) sets.push({ currency: rec.currency || BASE_CURRENCY, prices: base });
  const eur = Number(rec.eurPrice);
  if (Number.isFinite(eur) && eur > 0) {
    sets.push({ currency: SECONDARY_CURRENCY, prices: [{ list: eur, minQuantity: 1 }] });
  }
  return sets;
}

/** Every currency the CSV records actually need — drives ensureCurrencies() + pricelist creation. */
export function currenciesFor(records) {
  const out = new Set();
  for (const rec of records) for (const s of buildCurrencyPriceSets(rec)) out.add(s.currency);
  return [...out];
}

/**
 * Build the price rows for a record — SINGLE, side-effect-free source of the seeder's price shape so a
 * unit test can assert it without running a seed. Precedence:
 *   1. tierPrices (SPEC_OVERLAYS, e.g. PROD-104) pass through unchanged;
 *   2. a flat listPrice → one row { list, minQuantity:1 }, with `sale` added when the row carries a
 *      salePrice (the `sale_price` CSV column) — this is what makes a product show an actual < list
 *      price for EVERY pricing context (the seeder assigns the pricelist to the store catalog with no
 *      membership condition, so guest / personal / org users all see the sale);
 *   3. no price → [] (unpriced product).
 * salePrice is ignored unless it is a positive number strictly below listPrice (a non-sale or a
 * malformed value degrades to list-only rather than emitting an inverted/zero sale).
 */
export function buildPrices(rec) {
  if (rec.tierPrices) return rec.tierPrices;
  if (rec.listPrice == null) return [];
  const row = { list: rec.listPrice, minQuantity: 1 };
  if (rec.salePrice != null && Number(rec.salePrice) > 0 && Number(rec.salePrice) < Number(rec.listPrice)) {
    row.sale = Number(rec.salePrice);
  }
  return [row];
}

// Extra create-time fields the flat CSV can't express, merged onto the matching row by product_id.
export const SPEC_OVERLAYS = {
  'PROD-103': { minQuantity: 6, packSize: 6 },
  'PROD-104': {
    tierPrices: [
      { minQuantity: 1,  list: 29.99 },
      { minQuantity: 10, list: 29.99, sale: 26.99 },
      { minQuantity: 20, list: 29.99, sale: 23.99 },
    ],
  },
};

// ---------------------------------------------------------------------------
// DISCOUNT-RATIO model (VCST-5691) — the exact fraction a price row must expose.
// ---------------------------------------------------------------------------
// xAPI `PriceType.discountPercent` is a FRACTION, not a whole percent, and the shipped VCST-5691 fix
// (vc-module-x-api ProductPrice.GetDiscountPercent) is:
//
//     Math.Round((list - sale) / list, 4, MidpointRounding.AwayFromZero)
//
// It is NOT the `IMoneyRoundingPolicy` reuse the ticket originally proposed — a reviewer overrode that
// during review (cash-rounding intervals like Rounding05/Rounding1 would corrupt a ratio). So there is
// no rounding policy to configure, and a fixture that varies one proves nothing.
//
// Two properties make a price fixture able to DETECT a regression here, and neither is visible from the
// CSV row alone — which is why they are declared here and drift-guarded rather than left to a reader:
//   * FRACTIONAL   — the raw ratio needs a non-zero 3rd decimal, or a whole-percent implementation
//                    (the pre-fix behaviour) passes. Every other sale/coupon fixture is an integer %.
//   * MIDPOINT     — the raw ratio sits exactly on the 4-decimal rounding midpoint, so AwayFromZero
//                    and banker's/ToEven DISAGREE. Off the midpoint the case is vacuous.
//
// `ratio` is the EXACT rational value of (list - sale) / list for the row's committed prices. It is
// stated here as the intent; the guard re-derives it from the CSV in integer cents (never float
// subtraction, which turns 200.00 - 175.31 into 24.689999999999998 and the ratio into 0.12344999…).
export const DISCOUNT_RATIO_FIXTURES = {
  'PROD-108': { ratio: 0.125,   requireMidpoint: false, purpose: 'fractional (12.5%) discount is not truncated to a whole percent — PRICE-065 / CAT-GQL-140' },
  'PROD-109': { ratio: 0.12345, requireMidpoint: true,  purpose: 'raw ratio sits ON the 4-decimal midpoint, so AwayFromZero (0.1235) diverges from ToEven (0.1234) — PRICE-066' },
};

/** The precision `GetDiscountPercent` rounds the fraction to. Not a guess — read off the shipped fix. */
export const DISCOUNT_PERCENT_DECIMALS = 4;

/**
 * EXACT (list - sale) / list for two 2-decimal money values, computed in integer cents so no float
 * artifact can creep in, and returned scaled by 1e9 as an integer. Callers compare integers.
 * Returns null when either price is not a usable 2-decimal money value.
 */
export function discountRatioScaled(list, sale, scale = 1e9) {
  const cents = (v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) return null;
    const c = Math.round(n * 100);
    return Math.abs(n * 100 - c) < 1e-6 ? c : null;   // reject sub-cent precision
  };
  const l = cents(list), s = cents(sale);
  if (l == null || s == null || s >= l) return null;
  return ((l - s) * scale) / l;   // ints well under 2^53 → exact for any 2-decimal money pair
}

/** Round half AWAY FROM ZERO — what the shipped fix does. */
export const roundAwayFromZero = (x, decimals = DISCOUNT_PERCENT_DECIMALS) => {
  const f = 10 ** decimals;
  return Math.sign(x) * Math.round((Math.abs(x) * f).toFixed(6) * 1) / f;
};

/** Round half to EVEN (banker's) — the pre-fix behaviour the midpoint fixture must distinguish from. */
export function roundHalfToEven(x, decimals = DISCOUNT_PERCENT_DECIMALS) {
  const f = 10 ** decimals;
  const scaled = Number((Math.abs(x) * f).toFixed(6));
  const floor = Math.floor(scaled);
  const diff = scaled - floor;
  let r;
  if (diff > 0.5) r = floor + 1;
  else if (diff < 0.5) r = floor;
  else r = floor % 2 === 0 ? floor : floor + 1;
  return Math.sign(x) * r / f;
}

/**
 * True when `ratio` lands on the rounding midpoint at `decimals` — i.e. AwayFromZero and ToEven
 * disagree. This is the property that makes PROD-109 a real boundary case rather than decoration.
 */
export const isRoundingMidpoint = (ratio, decimals = DISCOUNT_PERCENT_DECIMALS) =>
  roundAwayFromZero(ratio, decimals) !== roundHalfToEven(ratio, decimals);

/** The value xAPI must report for a ratio, per the shipped fix. */
export const expectedDiscountPercent = (ratio) => roundAwayFromZero(ratio, DISCOUNT_PERCENT_DECIMALS);

// Real, IMPORTED catalog products (NOT seedable) that suites reference by GUID. The seeder DISCOVERS
// them by their stable `code` and captures the runtime id (+ hosting catalogId) to aliases.<env>.json
// — never a committed cross-env GUID. Absent on an env → @td resolves "" (clear miss), not a
// wrong-env id. `capture` maps CSV column → xAPI field; syncEnvAliases turns it into the overlay.
export const DISCOVERED_FIXTURES = [
  { csvId: 'STD-001', code: 'ALCE0128',     capture: { product_id_guid: 'id' } },                     // BUYABLE_NO_MIN_QTY
  { csvId: 'STD-002', code: 'EKJ-76373636', capture: { product_id_guid: 'id', catalog_id: 'catalogId' } }, // PROD_VARIATION_PARENT_SALE
];
