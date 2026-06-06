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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';

// Resolve virtual catalog root from the canonical alias registry — never hardcode GUIDs.
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const VIRTUAL_CATALOG_ID = aliases?.VIRTUAL_CATALOG_B2B?.id;
if (!VIRTUAL_CATALOG_ID) {
  console.error('ABORT: VIRTUAL_CATALOG_B2B.id not found in test-data/aliases.json');
  process.exit(2);
}

const DATE = '20260519';
const RESULTS_FILE = join(ROOT, `test-data/_seed-results-std-${DATE}.json`);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
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
];

const filterSpecs = ONLY ? STD_SPECS.filter(s => s.csvId === ONLY) : STD_SPECS;
if (!filterSpecs.length) {
  console.error(`ABORT: --only ${ONLY} matched no specs`);
  process.exit(2);
}

console.log(`\n🌱 Standard products seed${DRY_RUN ? ' (DRY RUN)' : ''}`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID} | Virtual catalog: ${VIRTUAL_CATALOG_ID}`);
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

async function getDefaultFfc() {
  const r = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 5 });
  return (r?.results || [])[0];
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
  const catalog = await ensureCatalog();
  const category = await ensureCategory(catalog.id, 'Standard Test Products', `SEED-${DATE}-STD-CAT`);
  const priceList = await findOrCreatePriceList();
  const ffc = await getDefaultFfc();
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

main().catch(e => { console.error(`\n❌ ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
