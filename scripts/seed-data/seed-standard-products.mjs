#!/usr/bin/env node
/**
 * Seeds 6 standard (non-configurable) test products on vcst-qa after the
 * 2026-05-15 catalog wipe.
 *
 * Specs sourced from test-data/products/test-products.csv + alias notes in
 * test-data/aliases.json (PROD_HEADPHONES, PROD_LAPTOP, PROD_OOS, PROD_LOW_STOCK,
 * PROD_PACK_SIZE, PROD_TIER_PRICED).
 *
 * USAGE:
 *   node scripts/seed-standard-products.mjs [--dry-run] [--verbose] [--only PROD-001]
 *
 * Safety:
 *   - ENV_RISK gate (blocks ENV_RISK=production; override --allow-admin-writes-on-prod)
 *   - Idempotent: searches by product code first, reuses existing entities
 *   - --dry-run prints plan, no writes
 *
 * Writes results to test-data/_seed-results-std-{DATE}.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
// Layered, TEST_ENV-aware load (later files override) — matches config.js so the
// seeder works across envs (vcst/vcptcore/localhost/...). No legacy root `.env`.
loadDotenv({ path: '.env.defaults' });
loadDotenv({ path: `.env.${process.env.TEST_ENV || 'vcst'}`, override: true });
loadDotenv({ path: '.env.local', override: true });
import { ensureVirtualCatalog, ensureFulfillmentCenter, verifyRemoved } from '../lib/seed-common.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';

// Virtual catalog is resolved at RUNTIME from the store's assigned catalog (and
// created if the env has none) — never a hardcoded GUID, so this seeds a fresh DB too.
let VIRTUAL_CATALOG_ID = null;

const DATE = '20260519';
const RESULTS_FILE = join(ROOT, `test-data/_seed-results-std-${DATE}.json`);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const TEARDOWN = args.includes('--teardown');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();
if (ENV_RISK === 'production' && !args.includes('--allow-admin-writes-on-prod')) {
  console.error(`ABORT: ENV_RISK=production for ${new URL(BACK_URL).host} — refusing to seed. Pass --allow-admin-writes-on-prod to override.`);
  process.exit(2);
}

// --- Standard product specs ---
// AGENT-TEST-* code so /qa-seed-data teardown can sweep them later.
// `stock` is the inStockQuantity. `inventoryStatus` defaults to 'Enabled'.
// `tierPrices` (optional) is an array of { minQuantity, list, sale? } applied as separate price rows.
// Each spec: `code` IS the SKU (matches the storefront/xAPI lookup pattern). `name` carries
// the AGENT-TEST-* identifier. Tests resolve via @td(PROD_*.sku) → SKU → platform.products
// filter "code:<sku>" → product GUID, exactly the way STD-001/ALCOE9535 works.
const STD_SPECS = [
  {
    csvId: 'PROD-001',
    name: 'AGENT-TEST-Wireless-Headphones',
    code: 'WH-001',
    listPrice: 99.99,
    stock: 50,
    notes: 'PROD_HEADPHONES — Standard checkout product.',
  },
  {
    csvId: 'PROD-002',
    name: 'AGENT-TEST-Gaming-Laptop',
    code: 'LT-001',
    listPrice: 1299.99,
    stock: 10,
    notes: 'PROD_LAPTOP — High-value checkout product.',
  },
  {
    csvId: 'PROD-101',
    name: 'AGENT-TEST-OOS-Fixture',
    code: 'QA-OOS-001',
    listPrice: 19.99,
    stock: 0,
    notes: 'PROD_OOS — Permanently out-of-stock (stock=0).',
  },
  {
    csvId: 'PROD-102',
    name: 'AGENT-TEST-Low-Stock-Fixture',
    code: 'QA-LOW-001',
    listPrice: 14.99,
    stock: 5,
    notes: 'PROD_LOW_STOCK — Near-limit stock fixture (stock=5).',
  },
  {
    csvId: 'PROD-103',
    name: 'AGENT-TEST-Pack-Size-Fixture',
    code: 'QA-PACK-001',
    listPrice: 9.99,
    stock: 60,
    minQuantity: 6,
    packSize: 6,
    notes: 'PROD_PACK_SIZE — MOQ=6 / pack-size=6 fixture.',
  },
  {
    csvId: 'PROD-104',
    name: 'AGENT-TEST-Tier-Priced-Fixture',
    code: 'QA-TIER-001',
    listPrice: 29.99,
    stock: 200,
    tierPrices: [
      { minQuantity: 1,  list: 29.99 },
      { minQuantity: 10, list: 29.99, sale: 26.99 },
      { minQuantity: 20, list: 29.99, sale: 23.99 },
    ],
    notes: 'PROD_TIER_PRICED — tier pricing: 1-9 std, 10-19 -10%, 20+ -20%.',
  },
  // --- VCST-5135 loyalty ProductPoints: dedicated single-program SKUs so each
  // program's earning behavior is cleanly observable in cart.items[].loyaltyPoints
  // (no SKU shared by two programs active for the same user → no masked gates).
  // All in-stock & priced so addItem(qty:1) succeeds and factor×price is observable.
  {
    csvId: 'PROD-201',
    name: 'AGENT-TEST-Loy-Inactive',
    code: 'QA-LOY-INACT-001',
    listPrice: 50.0,
    stock: 100,
    notes: 'LOY_PP_INACTIVE dedicated SKU — inactive-program earning gate (in-stock so it is addable).',
  },
  {
    csvId: 'PROD-202',
    name: 'AGENT-TEST-Loy-Zero',
    code: 'QA-LOY-ZERO-001',
    listPrice: 50.0,
    stock: 100,
    notes: 'LOY_PP_ZERO dedicated SKU — factor=0 BVA earning.',
  },
  {
    csvId: 'PROD-203',
    name: 'AGENT-TEST-Loy-Multi-A',
    code: 'QA-LOY-MULTI-A',
    listPrice: 40.0,
    stock: 100,
    notes: 'LOY_PP_MULTI dedicated SKU #1 — multi-SKU summation (factor 50).',
  },
  {
    csvId: 'PROD-204',
    name: 'AGENT-TEST-Loy-Multi-B',
    code: 'QA-LOY-MULTI-B',
    listPrice: 80.0,
    stock: 100,
    notes: 'LOY_PP_MULTI dedicated SKU #2 — multi-SKU summation (factor 25, distinct from A).',
  },
  {
    csvId: 'PROD-205',
    name: 'AGENT-TEST-Loy-Priority',
    code: 'QA-LOY-PRIO-001',
    listPrice: 60.0,
    stock: 100,
    notes: 'LOY_PP_PRIORITY + LOY_PP_ALL both target this SKU — priority-stacking observation.',
  },
  {
    csvId: 'PROD-206',
    name: 'AGENT-TEST-Loy-Localized',
    code: 'QA-LOY-LOCALE-001',
    listPrice: 30.0,
    stock: 100,
    notes: 'LOY_PP_LOCALIZED dedicated SKU — localized-name program earning.',
  },
];

const filterSpecs = ONLY ? STD_SPECS.filter(s => s.csvId === ONLY) : STD_SPECS;
if (!filterSpecs.length) {
  console.error(`ABORT: --only ${ONLY} matched no specs`);
  process.exit(2);
}

console.log(`\n🌱 Standard products seed${DRY_RUN ? ' (DRY RUN)' : ''}`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}`);
console.log(`   Specs: ${filterSpecs.map(s => s.csvId).join(', ')}\n`);

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

async function ensureCategory(catalogId, name, code) {
  const r = await api('POST', '/api/catalog/listentries', {
    catalog: catalogId, keyword: name, take: 20,
  }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find(c => c.name === name && c.type === 'category');
  if (found) { console.log(`  ↻ category: ${name} (${found.id})`); return { id: found.id, name }; }
  const cat = await api('POST', '/api/catalog/categories', {
    catalogId, name, code,
    isActive: true, priority: 1,
    seoInfos: [{ languageCode: 'en-US', semanticUrl: code.toLowerCase() }],
  });
  console.log(`  ✓ category: ${name} (${cat?.id})`);
  return cat;
}

async function findProductByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', {
    keyword: code, take: 5,
  }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find(p =>
    (p.code === code) && p.type === 'product'
  );
  return found ? { id: found.id, code, name: found.name } : null;
}

async function ensureProduct(catalogId, categoryId, body) {
  let p = await findProductByCode(body.code);
  if (p) { if (VERBOSE) console.log(`    ↻ product: ${body.name} (${p.id})`); return p; }
  p = await api('POST', '/api/catalog/products', { catalogId, categoryId, ...body });
  if (VERBOSE) console.log(`    ✓ product: ${body.name} (${p?.id})`);
  return p;
}

async function setPrices(priceListId, productId, prices) {
  // prices: [{ list, sale?, minQuantity? }]
  // Canonical batch endpoint: PUT /api/products/prices
  const payload = prices.map(p => {
    const out = {
      pricelistId: priceListId,
      productId,
      list: Number(p.list),
      currency: 'USD',
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

async function findOrCreatePriceList() {
  const name = `SEED-${DATE}-Standards-USD`;
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find(p => p?.name === name);
  if (pl) { console.log(`  ↻ pricelist: ${name} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', { name, currency: 'USD', description: 'Seeded for standard products' }, { expectStatus: [200, 201] });
  try {
    await api('POST', '/api/pricing/assignments', {
      name: `${name} → ${STORE_ID}`, pricelistId: pl.id, storeId: STORE_ID, priority: 100,
    }, { expectStatus: [200, 201] });
    console.log(`  ✓ pricelist + store assignment: ${name} (${pl.id})`);
  } catch (e) {
    console.log(`  ⚠ pricelist created but assignment failed: ${e.message.slice(0, 150)}`);
  }
  return pl;
}

async function linkProductToVirtualCatalog(productId, virtualCatalogId) {
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: productId, listEntryType: 'product', catalogId: virtualCatalogId,
  }], { expectStatus: [200, 204] });
}

// --- Main per-spec seed ---
async function seedSpec(spec, catalog, category, priceListId, ffcId) {
  console.log(`\n=== ${spec.csvId}: ${spec.name} (SKU ${spec.code}) ===`);

  // Product body — includes minQuantity/packSize for PROD-103.
  const body = {
    name: spec.name,
    code: spec.code,
    productType: 'Physical',
    vendor: 'QA',
    isActive: true,
    isBuyable: true,
    trackInventory: true,
  };
  if (spec.minQuantity != null) body.minQuantity = Number(spec.minQuantity);
  if (spec.packSize != null) body.packSize = Number(spec.packSize);

  const product = await ensureProduct(catalog.id, category.id, body);
  if (!DRY_RUN && product.id && !product.id.startsWith('dry-')) {
    // Prices: tier-priced spec passes multiple price rows; others pass a single one.
    const prices = spec.tierPrices ?? [{ list: spec.listPrice, minQuantity: 1 }];
    await setPrices(priceListId, product.id, prices);

    await ensureInventory(ffcId, product.id, spec.stock);

    try {
      await linkProductToVirtualCatalog(product.id, VIRTUAL_CATALOG_ID);
      console.log(`  ✓ linked into virtual catalog`);
    } catch (e) {
      console.log(`  ⚠ virtual-catalog link: ${e.message.slice(0, 200)}`);
    }
  }

  return {
    csvId: spec.csvId,
    name: spec.name,
    sku: spec.code, // code is the SKU
    code: spec.code,
    productId: product.id,
    listPrice: spec.listPrice,
    stock: spec.stock,
    minQuantity: spec.minQuantity ?? null,
    packSize: spec.packSize ?? null,
    tierPrices: spec.tierPrices ?? null,
  };
}

async function main() {
  await auth();
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  console.log(`  Virtual catalog: ${VIRTUAL_CATALOG_ID}`);
  const catalog = await ensureCatalog();
  const category = await ensureCategory(catalog.id, 'Standard Test Products', `SEED-${DATE}-STD-CAT`);
  const priceList = await findOrCreatePriceList();
  const ffc = await ensureFulfillmentCenter(api);
  if (!ffc?.id && !DRY_RUN) throw new Error('No fulfillment center available');

  // Link parent category to virtual catalog
  if (!DRY_RUN && category.id && !category.id.startsWith('dry-')) {
    try {
      await api('POST', '/api/catalog/listentrylinks', [{
        listEntryId: category.id, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID,
      }], { expectStatus: [200, 204] });
      console.log(`  ✓ category linked into virtual catalog`);
    } catch (e) {
      console.log(`  ⚠ category link: ${e.message.slice(0, 200)}`);
    }
  }

  const seeded = [];
  for (const spec of filterSpecs) {
    try {
      const r = await seedSpec(spec, catalog, category, priceList.id, ffc?.id);
      seeded.push(r);
    } catch (e) {
      console.error(`  ❌ ${spec.csvId}: ${e.message.slice(0, 300)}`);
      seeded.push({ csvId: spec.csvId, error: e.message });
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

    mkdirSync(dirname(RESULTS_FILE), { recursive: true });
    writeFileSync(RESULTS_FILE, JSON.stringify({
      date: DATE,
      platform: BACK_URL,
      storeId: STORE_ID,
      catalog: { id: catalog.id, name: catalog.name },
      virtualCatalogId: VIRTUAL_CATALOG_ID,
      seeded,
    }, null, 2));
    console.log(`\nResults: ${RESULTS_FILE}`);
  }

  const ok = seeded.filter(s => !s.error).length;
  console.log(`\n✅ Standards: ${ok}/${seeded.length} products seeded`);
  for (const s of seeded) {
    if (s.error) console.log(`  ❌ ${s.csvId}: ${s.error.slice(0, 100)}`);
    else console.log(`  ✓ ${s.csvId} sku=${s.sku} id=${s.productId} stock=${s.stock} price=${s.listPrice}${s.minQuantity ? ` MOQ=${s.minQuantity}` : ''}${s.tierPrices ? ` tiers=${s.tierPrices.length}` : ''}`);
  }
}

// --- Teardown: remove the standard products + their seed catalog/pricelist, then verify ---
async function teardown() {
  await auth();
  console.log(`\n🧹 Standard products teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const ids = [];
  for (const spec of filterSpecs) {
    const p = await findProductByCode(spec.code);
    if (p?.id) ids.push(p.id);
  }
  if (ids.length) {
    await api('POST', '/api/catalog/listentries/delete', { ids, objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] }).catch((e) => console.log(`  ⚠ product delete: ${e.message.slice(0, 120)}`));
    console.log(`  ✗ deleted ${ids.length} product(s)`);
  } else console.log('  – no seeded products found');

  // Pricelist + seed catalog created by this seeder (names are DATE-stable).
  const plName = `SEED-${DATE}-Standards-USD`;
  const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(plName)}`, null, { expectStatus: [200, 404] });
  const pls = (s?.results || []).filter((p) => p?.name === plName).map((p) => p.id);
  if (pls.length) await api('DELETE', `/api/pricing/pricelists?ids=${pls.join(',')}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
  const cat = await findCatalogByName(`SEED-${DATE}-Standards`);
  if (cat?.id) await api('DELETE', `/api/catalog/catalogs/${cat.id}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});

  // Verify zero residue.
  const residual = await verifyRemoved(async () => {
    const out = [];
    for (const spec of filterSpecs) { const p = await findProductByCode(spec.code); if (p?.id) out.push(p.id); }
    return out;
  });
  console.log(residual === 0
    ? `\n✅ Standards teardown verified — 0 products remain`
    : `\n⚠ Standards teardown incomplete — ${residual} product(s) still present`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch(e => { console.error(`\n❌ ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
