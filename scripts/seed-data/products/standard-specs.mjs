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
 *
 * NOT in scope: the normalized relational catalog fixture (test-data/catalogs/*.csv +
 * products/products-full.csv + pricing/*.csv + inventory/stock-levels.csv) driven by the LEGACY
 * seed-test-data.js — that's a separate, foreign-keyed system; do not fold it in here.
 *
 * test-products.csv carries NO runtime GUID (business keys only) → multi-env-safe by construction.
 * The guard (validate-standard-data.mjs) asserts that stays true.
 */

// The one CSV the standard seeder creates products from (also the @td registry — 10 PROD_* aliases).
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
    stock: 'stock_qty',
    description: 'description',
    seeded: 'seeded',           // 'true' → the seeder creates it; else @td-only
  },
};

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

// Real, IMPORTED catalog products (NOT seedable) that suites reference by GUID. The seeder DISCOVERS
// them by their stable `code` and captures the runtime id (+ hosting catalogId) to aliases.<env>.json
// — never a committed cross-env GUID. Absent on an env → @td resolves "" (clear miss), not a
// wrong-env id. `capture` maps CSV column → xAPI field; syncEnvAliases turns it into the overlay.
export const DISCOVERED_FIXTURES = [
  { csvId: 'STD-001', code: 'ALCE0128',     capture: { product_id_guid: 'id' } },                     // BUYABLE_NO_MIN_QTY
  { csvId: 'STD-002', code: 'EKJ-76373636', capture: { product_id_guid: 'id', catalog_id: 'catalogId' } }, // PROD_VARIATION_PARENT_SALE
];
