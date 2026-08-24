/**
 * scripts/seed-data/inventory/variation-stock-specs.mjs
 *
 * SINGLE orchestration source for the stocked-variation fixture (VCST-5546 / INV-047).
 * Side-effect-free — no env load, no network, no main() — so the seeder, the drift guard and the unit
 * tests all import the SAME rules.
 *
 * WHAT THE FIXTURE IS, AND WHY ITS SHAPE MATTERS
 * ----------------------------------------------
 * A real VARIATION SKU — a child CatalogProduct carrying `mainProductId` = the master's id, NOT a
 * standalone product — with NON-ZERO stock at the STORE'S MAIN fulfillment center. INV-047 asserts the
 * per-FFC "Products" blade lists variations as their own rows with their own quantities, rather than
 * only masters or a master-aggregated total. Two properties are load-bearing and neither is visible
 * from the CSV row alone:
 *
 *   1. IT IS GENUINELY A VARIATION. A second standalone product would satisfy "two SKUs with stock"
 *      while proving nothing about variation handling. The seeder sets `mainProductId` and the guard
 *      insists the two SKUs are distinct members of one family.
 *   2. THE QUANTITIES DIFFER. If master and variation carry the same stock, "the variation row shows
 *      its OWN inventory record, not the master's aggregate" cannot fail — the numbers are identical
 *      either way. So the guard requires them to diverge.
 *
 * THE FULFILLMENT CENTER IS RESOLVED LIVE, NEVER INDEXED.
 * Stock goes on the STORE'S MAIN FFC (fulfillment-centers.csv `store_role=main` → FFC-001 → FC_EAST),
 * resolved through seed-common's storeMainFulfillmentCenter(). Taking `ffcs[0]` puts the stock on an
 * arbitrary warehouse, where the blade under test never looks.
 */

import { productSlug, storefrontPathForAdHoc } from '../products/standard-specs.mjs';

export const CSV_SOURCE = {
  key: 'inventory/variation-stock',
  file: 'inventory/variation-stock.csv',
  map: {
    fixtureKey: 'fixture_key',
    masterSku: 'master_sku',
    masterName: 'master_name',
    masterSlug: 'master_slug',
    masterUrl: 'master_url',
    variationSku: 'variation_sku',
    variationName: 'variation_name',
    variationProperty: 'variation_property',
    variationValue: 'variation_value',
    categoryPath: 'category_path',
    listPrice: 'list_price',
    currency: 'currency',
    masterStock: 'master_stock_qty',
    variationStock: 'variation_stock_qty',
    ffcCsvId: 'ffc_csv_id',
    seeded: 'seeded',
  },
};

export const FIXTURE_KEY = 'INV_VARIATION';
export const SEED_PREFIX = 'AGENT-TEST';

/** Runtime, server-generated ids — MUST be blank in the committed CSV; they live in aliases.<env>.json. */
export const RUNTIME_COLUMNS = ['master_id', 'variation_id', 'ffc_id'];

/**
 * The fulfillment-centers.csv business key this fixture stocks against, and the alias that names it.
 * Declared here so the guard can assert the CSV row really is the `store_role=main` one — a fixture
 * silently pointing at an `additional` FFC would put its stock where INV-047 never looks.
 */
export const MAIN_FFC = { csvId: 'FFC-001', alias: 'FC_EAST', csvFile: 'inventory/fulfillment-centers.csv', roleColumn: 'store_role', roleValue: 'main' };

const truthy = (v) => /^(true|yes|1)$/i.test(String(v ?? '').trim());
const str = (v) => String(v ?? '').trim();

/** Normalize the single CSV row into the record the seeder + guard both reason about. Pure. */
export function loadFixture(rows) {
  const m = CSV_SOURCE.map;
  const row = (rows || []).find((r) => str(r[m.fixtureKey]) === FIXTURE_KEY);
  if (!row) return null;
  return {
    fixtureKey: FIXTURE_KEY,
    master: { sku: str(row[m.masterSku]), name: str(row[m.masterName]), slug: str(row[m.masterSlug]), url: str(row[m.masterUrl]), stock: Number(row[m.masterStock]) },
    variation: { sku: str(row[m.variationSku]), name: str(row[m.variationName]), property: str(row[m.variationProperty]), value: str(row[m.variationValue]), stock: Number(row[m.variationStock]) },
    categoryPath: str(row[m.categoryPath]),
    listPrice: Number(row[m.listPrice]),
    currency: str(row[m.currency]) || 'USD',
    ffcCsvId: str(row[m.ffcCsvId]),
    seeded: truthy(row[m.seeded]),
    _raw: row,
  };
}

/** Derived slug/url rules — ONE definition, shared with the standard seeder. */
export const deriveSlug = (name) => productSlug(name);
export const deriveUrl = (categoryPath, name) => storefrontPathForAdHoc(categoryPath, name);

/** Master product create body. Pure — the caller supplies catalog/category ids + the SEO record. */
export function buildMasterBody(rec, { seoInfos = [] } = {}) {
  return {
    name: rec.master.name,
    code: rec.master.sku,
    productType: 'Physical',
    vendor: 'QA',
    isActive: true,
    isBuyable: true,
    trackInventory: true,
    seoInfos,
  };
}

/**
 * Variation create body. `mainProductId` is what makes this a VARIATION rather than a second
 * standalone product — it is the entire point of the fixture. The variation deliberately carries NO
 * seoInfos: it has no independent PDP route (it renders on the master's page), and minting one would
 * publish a storefront path that does not exist.
 */
export function buildVariationBody(rec, masterId) {
  return {
    name: rec.variation.name,
    code: rec.variation.sku,
    mainProductId: masterId,
    productType: 'Physical',
    vendor: 'QA',
    isActive: true,
    isBuyable: true,
    trackInventory: true,
  };
}

/** The two inventory writes this fixture makes, in seed order. Pure. */
export const stockPlan = (rec) => [
  { role: 'master', sku: rec.master.sku, quantity: rec.master.stock },
  { role: 'variation', sku: rec.variation.sku, quantity: rec.variation.stock },
];

/**
 * Shape assertions shared by the drift guard and the unit tests. `ffcRows` is the parsed
 * fulfillment-centers.csv (optional — the FFC role check is skipped when it is not supplied).
 * Returns problem strings; empty means the fixture can still do its job.
 */
export function validateFixtureShape(rows, ffcRows = null) {
  const problems = [];
  const rec = loadFixture(rows);
  if (!rec) return [`no row with ${CSV_SOURCE.map.fixtureKey}="${FIXTURE_KEY}" in ${CSV_SOURCE.file}`];

  if (!rec.seeded) problems.push(`${FIXTURE_KEY}: seeded=false — the seeder would never create it, so INV-047 stays blocked`);
  if (!rec.master.sku || !rec.variation.sku) problems.push(`${FIXTURE_KEY}: both master_sku and variation_sku are required`);
  if (rec.master.sku && rec.master.sku === rec.variation.sku) {
    problems.push(`${FIXTURE_KEY}: master and variation share the sku "${rec.master.sku}" — INV-047 asserts the variation appears as a row DISTINCT from its master`);
  }
  for (const [role, p] of [['master', rec.master], ['variation', rec.variation]]) {
    if (p.name && !p.name.startsWith(SEED_PREFIX)) problems.push(`${FIXTURE_KEY}: ${role} name "${p.name}" must start with "${SEED_PREFIX}" so teardown can guard on it`);
    if (p.sku && !p.sku.toUpperCase().startsWith('QA-INVVAR-')) problems.push(`${FIXTURE_KEY}: ${role} sku "${p.sku}" should keep the QA-INVVAR- family prefix`);
  }

  // The quantities MUST diverge, and both must be usable numbers.
  if (!Number.isFinite(rec.variation.stock) || rec.variation.stock <= 0) {
    problems.push(`${FIXTURE_KEY}: variation_stock_qty must be a positive number — a zero-stock variation may legitimately be absent from a per-FFC grid, so the case could not fail`);
  }
  if (!Number.isFinite(rec.master.stock) || rec.master.stock < 0) {
    problems.push(`${FIXTURE_KEY}: master_stock_qty must be a non-negative number`);
  }
  if (Number.isFinite(rec.master.stock) && Number.isFinite(rec.variation.stock) && rec.master.stock === rec.variation.stock) {
    problems.push(`${FIXTURE_KEY}: master_stock_qty and variation_stock_qty are BOTH ${rec.master.stock} — "the variation row shows its own inventory, not the master's aggregate" cannot fail when the numbers are identical`);
  }

  // Derived master slug/url — never hand-maintained.
  if (rec.master.name) {
    const wantSlug = deriveSlug(rec.master.name);
    if (rec.master.slug !== wantSlug) problems.push(`${FIXTURE_KEY}: master_slug "${rec.master.slug}" != derived "${wantSlug}" (rule: standard-specs.mjs productSlug)`);
    const wantUrl = deriveUrl(rec.categoryPath, rec.master.name);
    if (rec.master.url !== wantUrl) problems.push(`${FIXTURE_KEY}: master_url "${rec.master.url}" != derived "${wantUrl}" (rule: standard-specs.mjs storefrontPathForAdHoc)`);
  }
  if (rec.master.url && (/^[a-z]+:\/\//i.test(rec.master.url) || rec.master.url.includes('{{') || !rec.master.url.startsWith('/'))) {
    problems.push(`${FIXTURE_KEY}: master_url "${rec.master.url}" must be a store-RELATIVE path (the case composes {{FRONT_URL}}@td(...))`);
  }

  // The FFC must be the store's MAIN one, not just any row.
  if (rec.ffcCsvId !== MAIN_FFC.csvId) {
    problems.push(`${FIXTURE_KEY}: ffc_csv_id "${rec.ffcCsvId}" should be "${MAIN_FFC.csvId}" (${MAIN_FFC.alias}) — stock on a non-main FFC lands where INV-047's blade never looks`);
  }
  if (ffcRows) {
    const row = ffcRows.find((r) => String(r.ffc_id ?? '').trim() === rec.ffcCsvId);
    if (!row) problems.push(`${FIXTURE_KEY}: ffc_csv_id "${rec.ffcCsvId}" has no row in ${MAIN_FFC.csvFile}`);
    else if (String(row[MAIN_FFC.roleColumn] ?? '').trim().toLowerCase() !== MAIN_FFC.roleValue) {
      problems.push(`${FIXTURE_KEY}: ${MAIN_FFC.csvFile} row ${rec.ffcCsvId} has ${MAIN_FFC.roleColumn}="${row[MAIN_FFC.roleColumn]}", not "${MAIN_FFC.roleValue}" — the fixture would stock a non-main warehouse`);
    }
  }

  if (!Number.isFinite(rec.listPrice) || rec.listPrice <= 0) problems.push(`${FIXTURE_KEY}: list_price must be a positive number`);
  return problems;
}
