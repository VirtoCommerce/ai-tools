#!/usr/bin/env node
/**
 * Seeds the standard (non-configurable) test-product fixtures. The SINGLE source of truth is
 * test-data/products/test-products.csv — the seeder creates every row flagged seeded=true; the
 * column→field mapping + create-time overlays + imported-fixture discovery live in ./standard-specs.mjs.
 *
 * Multi-currency: a row carrying `price_eur` is priced in BOTH its base currency and EUR, each into its
 * own single-currency pricelist (SEED-<date>-Standards-<CUR>), so the line stays priced and addable
 * after a storefront currency switch instead of collapsing to 0.00 with a disabled stepper.
 *
 * The committed `product_slug` / `storefront_url` columns are the store-RELATIVE storefront path this
 * seeder puts the product on (rule: standard-specs.mjs productSlug / storefrontPathForAdHoc). A case
 * composes `{{FRONT_URL}}@td(ALIAS.url)` instead of hand-building `/product/<sku>`, which does not
 * resolve. Both columns are env-invariant business keys, drift-guarded by td:validate:standard.
 *
 * Aliases resolve these by SKU/business key (PROD_* → @td(PROD_*.sku) → platform lookup by
 * code), so NO runtime GUID is written into the CSV — env-invariant + multi-env-safe by construction.
 * The imported STD-* fixtures (standard.csv) can't be created; they're discovered by code and their
 * runtime ids captured to aliases.<env>.json. Products are linked UNDER their leaf category in the
 * virtual catalog (never the B2B-store root).
 *
 * NOT this seeder: the normalized relational catalog (test-data/catalogs/*.csv + products-full.csv +
 * pricing/*.csv + inventory/stock-levels.csv) driven by the legacy seed-test-data.js.
 *
 * USAGE:
 *   node scripts/seed-standard-products.mjs [--dry-run] [--verbose] [--only PROD-001]
 *
 * Safety:
 *   - ENV_RISK gate (blocks ENV_RISK=production; override --allow-admin-writes-on-prod)
 *   - Idempotent: searches by product code first, reuses existing entities
 *   - --dry-run prints plan, no writes
 *
 * No _seed-results report (VCST-5406) — PROD_* resolve by SKU/business key from the committed CSV.
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { config as loadDotenv } from 'dotenv';
// Layered, TEST_ENV-aware load (later files override) — matches config.js so the
// seeder works across envs (vcst/vcptcore/localhost/...). No legacy root `.env`.
loadDotenv({ path: '.env.defaults' });
loadDotenv({ path: `.env.${process.env.TEST_ENV || 'vcst'}`, override: true });
loadDotenv({ path: '.env.local', override: true });
import { ensureVirtualCatalog, ensureFulfillmentCenter, ensureCategoryPath, seedCategoryTree, buildStoreSeo, verifyRemoved, auth as commonAuth, enrichProductContent, syncEnvAliases, idsParam, ensureCurrencies } from '../../lib/seed-common.mjs';
// Orchestration source (single source of truth) — side-effect-free, shared with the guard.
import {
  CSV_SOURCE, SPEC_OVERLAYS, DISCOVERED_FIXTURES,
  productSlug, buildCurrencyPriceSets, currenciesFor, priceListName,
} from './standard-specs.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..', '..');

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';

// Virtual catalog is resolved at RUNTIME from the store's assigned catalog (and
// created if the env has none) — never a hardcoded GUID, so this seeds a fresh DB too.
let VIRTUAL_CATALOG_ID = process.env.VIRTUAL_CATALOG_ID || null;

const DATE = '20260519';

// Teardown only ever removes products THIS seeder authored — every seeded row's display
// name carries this prefix (verified against test-products.csv). This is the hard guard on
// top of catalog-scoping + exact-code match: a product whose name lacks it is never deleted,
// so teardown can never touch a real/other product even on a code or catalog collision.
const SEED_NAME_PREFIX = 'AGENT-TEST';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const TEARDOWN = args.includes('--teardown');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
// Product content enrichment (images + descriptions), on by default; idempotent.
const NO_ASSETS = args.includes('--no-assets');
const FORCE_ASSETS = args.includes('--force-assets');
const IMAGES_PER = args.includes('--images') ? Math.max(0, parseInt(args[args.indexOf('--images') + 1], 10)) : 3;

const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();
if (ENV_RISK === 'production' && !args.includes('--allow-admin-writes-on-prod')) {
  console.error(`ABORT: ENV_RISK=production for ${new URL(BACK_URL).host} — refusing to seed. Pass --allow-admin-writes-on-prod to override.`);
  process.exit(2);
}

// ---- Load seed records from test-products.csv (the single CSV source of truth) ----
// standard-specs.mjs declares the column→field mapping (CSV_SOURCE) + create-time overlays a flat
// row can't express (SPEC_OVERLAYS) + the imported fixtures to discover (DISCOVERED_FIXTURES).
// Only rows flagged seeded=true are created; the rest are @td-only references to live/manual products.
const CSV_PATH = join(ROOT, 'test-data', CSV_SOURCE.file);
const truthy = (v) => /^(true|yes|1)$/i.test(String(v || '').trim());
const num = (v) => (v === '' || v == null ? null : Number(v));
const leafCategory = (path) => (String(path || '').split('>').pop().trim()) || 'Standard Test Products';
// The slug rule lives in standard-specs.mjs (productSlug) so the guard can assert the committed
// product_slug / storefront_url columns against the very rule the seeder applies. Do NOT re-inline it.
const slug = productSlug;

function loadRecords() {
  const m = CSV_SOURCE.map;
  const rows = parse(readFileSync(CSV_PATH, 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
  return rows
    .map((r) => ({
      csvId: r[m.csvId],
      code: (r[m.code] || '').trim(),
      name: (r[m.name] || '').trim(),
      categoryPath: (r[m.categoryPath] || '').trim(),
      listPrice: num(r[m.listPrice]),
      salePrice: num(r[m.salePrice]),
      currency: (r[m.currency] || 'USD').trim(),
      eurPrice: num(r[m.eurPrice]),   // optional second-currency list price (blank → USD only)
      stock: num(r[m.stock]) ?? 0,
      description: (r[m.description] || '').trim(),
      seeded: truthy(r[m.seeded]),
      ...(SPEC_OVERLAYS[r[m.csvId]] || {}),
    }))
    .filter((rec) => rec.seeded && rec.code);
}

const allRecords = loadRecords();
const records = ONLY ? allRecords.filter((r) => r.csvId === ONLY) : allRecords;
if (!records.length) {
  console.error(ONLY
    ? `ABORT: --only ${ONLY} matched no seeded=true row in ${CSV_SOURCE.file}`
    : `ABORT: no seeded=true rows in ${CSV_SOURCE.file}`);
  process.exit(2);
}

console.log(`\n🌱 Standard products seed${DRY_RUN ? ' (DRY RUN)' : ''}`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}`);
console.log(`   Source: ${CSV_SOURCE.file} | seeded rows (${records.length}): ${records.map(r => r.csvId).join(', ')}\n`);

// --- HTTP ---
let TOKEN = null;
async function auth() {
  const r = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  if (!r.ok) throw new Error(`auth ${r.status}`);
  TOKEN = (await r.json()).access_token;
  console.log(`  Auth: OK${DRY_RUN ? ' [DRY RUN — reads only]' : ''}`);
}

const isReadCall = (method, path) =>
  method === 'GET' || (method === 'POST' && path.includes('/search'));

async function api(method, path, body, { expectStatus = [200, 201, 204] } = {}) {
  if (DRY_RUN && !isReadCall(method, path)) {
    if (VERBOSE) console.log(`    [DRY] ${method} ${path}`);
    return { _dryRun: true, id: `dry-${Math.random().toString(36).slice(2, 10)}` };
  }
  const headers = { 'Authorization': `Bearer ${TOKEN}` };
  let fetchBody;
  if (body) { headers['Content-Type'] = 'application/json'; fetchBody = JSON.stringify(body); }
  const r = await fetch(`${BACK_URL}${path}`, { method, headers, body: fetchBody });
  if (!expectStatus.includes(r.status)) {
    const t = await r.text().catch(() => '');
    throw new Error(`${method} ${path} → ${r.status}: ${t.slice(0, 600)}`);
  }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : null;
}

// --- Helpers ---
async function findCatalogByName(name) {
  const r = await api('POST', '/api/catalog/catalogs/search', { keyword: name, take: 5 });
  return (r?.results || []).find(c => c.name === name);
}

async function ensureCatalog() {
  const name = `SEED-${DATE}-Standards`;
  let cat = await findCatalogByName(name);
  if (cat) { console.log(`  ↻ catalog: ${name} (${cat.id})`); return cat; }
  cat = await api('POST', '/api/catalog/catalogs', {
    name, isVirtual: false,
    languages: [{ languageCode: 'en-US', isDefault: true }],
  });
  console.log(`  ✓ catalog: ${name} (${cat?.id})`);
  return cat;
}

// Find a product by exact code. SCOPED to a catalog when `catalogId` is given — the
// listentries search is otherwise platform-wide, so a bare code lookup would match (and
// let teardown delete) a real product on the env that happens to share a generic SKU
// like WH-001/LT-001. Only captureDiscoveredFixtures() calls this catalog-blind on purpose
// (STD-* fixtures live in their own imported catalogs).
async function findProductByCode(code, catalogId) {
  const r = await api('POST', '/api/catalog/listentries', {
    keyword: code, ...(catalogId ? { catalogId } : {}), take: 5,
  }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find(p =>
    (p.code === code) && p.type === 'product'
  );
  return found ? { id: found.id, code, name: found.name } : null;
}

async function ensureProduct(catalogId, categoryId, body) {
  let p = await findProductByCode(body.code, catalogId);
  if (p) { if (VERBOSE) console.log(`    ↻ product: ${body.name} (${p.id})`); return p; }
  p = await api('POST', '/api/catalog/products', { catalogId, categoryId, ...body });
  if (VERBOSE) console.log(`    ✓ product: ${body.name} (${p?.id})`);
  return p;
}

// prices: [{ list, sale?, minQuantity? }] — written into `priceListId`, whose currency MUST equal
// `currency` (a pricelist is single-currency platform-side). Canonical batch endpoint:
// PUT /api/products/prices. Called once per currency set (see buildCurrencyPriceSets).
async function setPrices(priceListId, productId, prices, currency) {
  const payload = prices.map(p => {
    const out = {
      pricelistId: priceListId,
      productId,
      list: Number(p.list),
      currency,
      minQuantity: Number(p.minQuantity ?? 1),
    };
    if (p.sale != null) out.sale = Number(p.sale);
    return out;
  });
  await api('PUT', '/api/products/prices', [{ productId, prices: payload }], { expectStatus: [200, 204] });
}

async function ensureInventory(ffcId, productId, qty) {
  try {
    await api('PUT', '/api/inventory/plenty', [{
      fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0,
      status: 'Enabled',
    }], { expectStatus: [200, 204] });
  } catch (e) {
    try {
      await api('PUT', `/api/inventory/products/${productId}`, {
        fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0,
        status: 'Enabled',
      }, { expectStatus: [200, 204] });
    } catch (e2) { if (VERBOSE) console.log(`    ⚠ inventory ${productId}: ${e2.message.slice(0,150)}`); }
  }
}

// One pricelist per currency (a pricelist is single-currency platform-side). Resolved/created
// idempotently by its stable, date-pinned name and assigned to the store's virtual catalog with no
// membership condition, so guest / personal / org users all see the price. Memoized per run: the
// per-record loop asks for a currency's pricelist once per product.
const _priceListByCurrency = new Map();
async function findOrCreatePriceList(currency) {
  if (_priceListByCurrency.has(currency)) return _priceListByCurrency.get(currency);
  const name = priceListName(DATE, currency);
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find(p => p?.name === name);
  if (pl) {
    console.log(`  ↻ pricelist: ${name} (${pl.id})`);
    _priceListByCurrency.set(currency, pl);
    return pl;
  }
  pl = await api('POST', '/api/pricing/pricelists', { name, currency, description: `Seeded for standard products (${currency})` }, { expectStatus: [200, 201] });
  try {
    await api('POST', '/api/pricing/assignments', {
      name: `${name} → ${STORE_ID}`, pricelistId: pl.id, catalogId: VIRTUAL_CATALOG_ID, priority: 100,
    }, { expectStatus: [200, 201] });
    console.log(`  ✓ pricelist + catalog assignment: ${name} (${pl.id})`);
  } catch (e) {
    console.log(`  ⚠ pricelist created but assignment failed: ${e.message.slice(0, 150)}`);
  }
  _priceListByCurrency.set(currency, pl);
  return pl;
}

// Link a product UNDER a category in the virtual catalog. A bare catalog link (no categoryId)
// targets the catalog ROOT (VC CategoryLink TargetId => Category?.Id ?? Catalog?.Id), scattering
// every product at the B2B-store root. So drop any stale root link first, then link under
// `categoryId` so it nests beneath its seed category. Both calls are idempotent server-side.
// (Same pattern as seed-configurable.mjs's linkProductToCategory.)
async function linkProductToCategory(productId, categoryId) {
  await api('POST', '/api/catalog/listentrylinks/delete', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID,
  }], { expectStatus: [200, 204, 404] }).catch(() => {});
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID, categoryId,
  }], { expectStatus: [200, 204] });
}

// Discover the imported-fixture products by code and write their runtime GUIDs to
// aliases.<env>.json (never the CSV). Per the multi-env rule: ids live per-env in the overlay.
async function captureDiscoveredFixtures() {
  console.log(`\n  Discovering imported GUID fixtures (${DISCOVERED_FIXTURES.map(f => f.code).join(', ')})...`);
  const byKey = {};
  for (const f of DISCOVERED_FIXTURES) {
    const hit = await findProductByCode(f.code);
    if (!hit?.id) { console.log(`  ⚠ ${f.csvId} (${f.code}) not present on this env — skipped (alias resolves "")`); continue; }
    const prov = {};
    if (f.capture.product_id_guid) prov.product_id_guid = hit.id;
    if (f.capture.catalog_id) {
      const full = await api('GET', `/api/catalog/products/${hit.id}`, null, { expectStatus: [200, 404] });
      if (full?.catalogId) prov.catalog_id = full.catalogId;
    }
    byKey[f.csvId] = prov;
    console.log(`  ✓ ${f.csvId} (${f.code}) → ${hit.id}${prov.catalog_id ? ` [catalog ${prov.catalog_id}]` : ''}`);
  }
  if (!DRY_RUN && Object.keys(byKey).length) {
    syncEnvAliases('products/standard', byKey);
    console.log(`  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${Object.keys(byKey).length} discovered fixture id(s)`);
  }
}

// --- Main per-record seed ---
async function seedRecord(rec, ffcId) {
  console.log(`\n=== ${rec.csvId}: ${rec.name} (SKU ${rec.code}) ===`);
  // UNIFIED placement: resolve-or-create the product's category path in the categories.csv tree
  // (physical catalogs) — reuse an existing category, create it only if missing. The product then
  // surfaces in the store's virtual catalog via that catalog's root→virtual subtree link.
  const loc = await ensureCategoryPath(api, rec.categoryPath);
  if (!loc) throw new Error(`could not resolve category path "${rec.categoryPath}"`);

  // Product body — SPEC_OVERLAYS add minQuantity/packSize for PROD-103.
  const body = {
    name: rec.name,
    code: rec.code,
    productType: 'Physical',
    vendor: 'QA',
    isActive: true,
    isBuyable: true,
    trackInventory: true,
    // Store-scoped product SEO (platform default leaves storeId=null): slug + title + store + language.
    seoInfos: [buildStoreSeo({ semanticUrl: slug(rec.name), pageTitle: rec.name })],
  };
  if (rec.minQuantity != null) body.minQuantity = Number(rec.minQuantity);
  if (rec.packSize != null) body.packSize = Number(rec.packSize);

  const product = await ensureProduct(loc.catalogId, loc.categoryId, body);
  if (!DRY_RUN && product.id && !product.id.startsWith('dry-')) {
    // Prices, per currency: the base set is tier-priced (multiple rows) or flat (one row, with `sale`
    // when the row has a salePrice); a row carrying price_eur adds a second, EUR set. Each set goes
    // into ITS currency's pricelist. buildCurrencyPriceSets() is the single, unit-tested source of
    // shape. A single-currency product behaves exactly as before.
    for (const set of buildCurrencyPriceSets(rec)) {
      const pl = await findOrCreatePriceList(set.currency);
      await setPrices(pl.id, product.id, set.prices, set.currency);
      if (VERBOSE) console.log(`    ✓ prices [${set.currency}]: ${set.prices.map(p => p.list + (p.sale != null ? `/${p.sale}` : '') + `@${p.minQuantity ?? 1}`).join(', ')}`);
    }

    await ensureInventory(ffcId, product.id, rec.stock);
    console.log(`  ✓ placed in ${loc.name} (catalog ${loc.catalogId})`);

    if (!NO_ASSETS) {
      const did = await enrichProductContent(product.id, { images: IMAGES_PER, code: rec.code, force: FORCE_ASSETS });
      if (did?.images || did?.reviews) console.log(`  ✓ enriched: +${did.images || 0} img +${did.reviews || 0} desc`);
    }
  }

  return {
    csvId: rec.csvId,
    name: rec.name,
    sku: rec.code, // code is the SKU
    code: rec.code,
    productId: product.id,
    listPrice: rec.listPrice,
    salePrice: rec.salePrice ?? null,
    eurPrice: rec.eurPrice ?? null,
    stock: rec.stock,
    minQuantity: rec.minQuantity ?? null,
    packSize: rec.packSize ?? null,
    tierPrices: rec.tierPrices ?? null,
  };
}

async function main() {
  await auth();
  if (!NO_ASSETS) await commonAuth(); // token for seed-common's enrichProductContent (images → assets)
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  console.log(`  Virtual catalog: ${VIRTUAL_CATALOG_ID}`);
  // Every currency the CSV rows need must be a registered platform Currency BEFORE a pricelist in it
  // is created — otherwise the price exists but the storefront can't render/select that currency
  // (which is exactly how an AGENT-TEST line collapses to 0.00 with a disabled stepper after a
  // currency switch). Idempotent; defs come from test-data/stores/currencies.csv.
  const currencies = currenciesFor(records);
  console.log(`  Currencies in scope: ${currencies.join(', ')}`);
  await ensureCurrencies(api, currencies);
  // Resolve/create each currency's pricelist up front so the assignment exists before any price write.
  for (const c of currencies) await findOrCreatePriceList(c);
  const ffc = await ensureFulfillmentCenter(api);
  if (!ffc?.id && !DRY_RUN) throw new Error('No fulfillment center available');

  // SINGLE-PROCESS SEEDING: build the categories.csv tree HERE, in the same process that places
  // products, so seedCategoryTree and ensureCategoryPath share the in-process (catalogId, code)
  // category cache. Running the tree as a separate `seed:categories` node process leaves the products
  // process unable to see those categories (no lookup endpoint is immediately consistent across
  // processes) → it re-creates them → duplicate categories.csv tree. This is the canonical creator;
  // `seed:categories` is dropped from the seed chain / bootstrap so there is exactly ONE creator.
  await seedCategoryTree(api);

  // UNIFIED placement: each product goes into the categories.csv tree (physical catalogs) via
  // seedRecord → ensureCategoryPath (reuse-or-create its category path). No private SEED-Standards
  // catalog and no flat leaf categories — products surface in the store virtual catalog by subtree.
  const seeded = [];
  for (const rec of records) {
    try {
      const r = await seedRecord(rec, ffc?.id);
      seeded.push(r);
    } catch (e) {
      console.error(`  ❌ ${rec.csvId}: ${e.message.slice(0, 300)}`);
      seeded.push({ csvId: rec.csvId, error: e.message });
    }
  }

  if (!DRY_RUN) {
    try {
      await api('POST', '/api/search/indexes/index', [
        { documentType: 'CatalogProduct', rebuild: false },
      ], { expectStatus: [200, 204] });
      console.log(`\n  ✓ reindex triggered`);
    } catch (e) {
      console.log(`  ⚠ reindex: ${e.message.slice(0, 100)}`);
    }

    // PROD_* resolve by SKU/business key from the committed CSV — no GUID to persist. The imported
    // GUID fixtures (standard.csv STD-001/002) are captured to aliases.<env>.json by
    // captureDiscoveredFixtures() below (runtime ids, per env — never the committed CSV).
  }

  // Capture the imported GUID fixtures (STD-001/002) into aliases.<env>.json.
  await captureDiscoveredFixtures();

  const ok = seeded.filter(s => !s.error).length;
  console.log(`\n✅ Standards: ${ok}/${seeded.length} products seeded`);
  for (const s of seeded) {
    if (s.error) console.log(`  ❌ ${s.csvId}: ${s.error.slice(0, 100)}`);
    else console.log(`  ✓ ${s.csvId} sku=${s.sku} id=${s.productId} stock=${s.stock} price=${s.listPrice}${s.salePrice != null ? ` sale=${s.salePrice}` : ''}${s.eurPrice != null ? ` EUR=${s.eurPrice}` : ''}${s.minQuantity ? ` MOQ=${s.minQuantity}` : ''}${s.tierPrices ? ` tiers=${s.tierPrices.length}` : ''}`);
  }
}

// --- Teardown: remove the standard products + their seed catalog/pricelist, then verify ---
async function teardown() {
  await auth();
  console.log(`\n🧹 Standard products teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);

  // Products now live in the shared AGENT-TEST-SEED physical catalogs (not a private SEED-Standards
  // catalog), so we delete them by code with a hard AGENT-TEST name guard — never a real product that
  // happens to share a generic SKU (WH-001/LT-001). The catalogs themselves are the unified structure
  // (removed by the family sweep in `seed:teardown` / `seed:bootstrap:teardown`), NOT deleted here.
  const ids = [];
  for (const rec of records) {
    const p = await findProductByCode(rec.code);
    if (!p?.id) continue;
    if (!p.name?.startsWith(SEED_NAME_PREFIX)) {
      console.log(`  ⚠ skip ${rec.code}: "${p.name}" lacks ${SEED_NAME_PREFIX} prefix — not a seed product`);
      continue;
    }
    ids.push(p.id);
  }
  if (ids.length) {
    // MUST be `objectIds` — an empty ObjectIds on POST /api/catalog/listentries/delete wipes EVERY
    // authorized product. Correct field + the `if (ids.length)` guard keep this to only-these-ids.
    await api('POST', '/api/catalog/listentries/delete', { objectIds: ids, objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] }).catch((e) => console.log(`  ⚠ product delete: ${e.message.slice(0, 120)}`));
    console.log(`  ✗ deleted ${ids.length} product(s)`);
  } else console.log('  – no seeded products found');

  // Pricelists created by this seeder — ONE PER CURRENCY the CSV needs (names are DATE-stable).
  // Symmetric with findOrCreatePriceList: a multi-currency seed must not leave an orphan EUR pricelist
  // (a stale EUR price would keep pricing a deleted fixture's SKU if it were re-created by hand).
  // No catalog deletion (shared structure).
  for (const currency of currenciesFor(records)) {
    const plName = priceListName(DATE, currency);
    const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(plName)}`, null, { expectStatus: [200, 404] });
    const pls = (s?.results || []).filter((p) => p?.name === plName).map((p) => p.id);
    if (pls.length) {
      await api('DELETE', `/api/pricing/pricelists?${idsParam(pls)}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
      console.log(`  ✗ deleted pricelist ${plName}`);
    }
  }

  // Verify zero residue (code lookup + AGENT-TEST guard).
  const residual = await verifyRemoved(async () => {
    const out = [];
    for (const rec of records) { const p = await findProductByCode(rec.code); if (p?.id && p.name?.startsWith(SEED_NAME_PREFIX)) out.push(p.id); }
    return out;
  });
  console.log(residual === 0
    ? `\n✅ Standards teardown verified — 0 products remain`
    : `\n⚠ Standards teardown incomplete — ${residual} product(s) still present`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch(e => { console.error(`\n❌ ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
