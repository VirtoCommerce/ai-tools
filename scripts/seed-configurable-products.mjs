#!/usr/bin/env node
/**
 * Seeds configurable products + their child-option products + configurations
 * for vcst-qa post-restore (2026-05-15).
 *
 * Phase 1 (this script): single Product-section CFGs (CFG-012, CFG-014, CFG-015,
 * CFG-016, CFG-018) — 5 parents + ~15 child products + 5 configurations.
 *
 * Phase 2 (later PR): multi-section CFGs (CFG-013 Laptop, CFG-006, CFG-020, CFG-021).
 * Phase 3 (later PR): conditional cascades (CFG-022..029).
 *
 * USAGE:
 *   node scripts/seed-configurable-products.mjs [--dry-run] [--verbose] [--only CFG-012]
 *
 * Safety:
 *   - ENV_RISK gate (blocks ENV_RISK=production; override --allow-admin-writes-on-prod).
 *   - Idempotent: searches by name first, reuses existing entities.
 *   - --dry-run prints plan, no writes.
 *
 * Writes results to test-data/_seed-results-cfg-{DATE}.json.
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
// See .claude/rules/test-data.md + memory feedback_no_hardcoded_guids_in_scripts.
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const VIRTUAL_CATALOG_ID = aliases?.VIRTUAL_CATALOG_B2B?.id;
if (!VIRTUAL_CATALOG_ID) {
  console.error('ABORT: VIRTUAL_CATALOG_B2B.id not found in test-data/aliases.json');
  process.exit(2);
}

const DATE = '20260518';
const RESULTS_FILE = join(ROOT, `test-data/_seed-results-cfg-${DATE}.json`);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();
if (ENV_RISK === 'production' && !args.includes('--allow-admin-writes-on-prod')) {
  console.error(`ABORT: ENV_RISK=production for ${new URL(BACK_URL).host} — refusing to seed. Pass --allow-admin-writes-on-prod to override.`);
  process.exit(2);
}

// --- CFG Phase 1 specs ---
// Source: test-data/products/configurable-products.csv section_details column.
// Each spec creates:
//   - 1 dedicated parent configurable product
//   - N child products (one per Product-section option, excluding implicit "None")
//   - 1 configuration record with sections + options
//   - Virtual-catalog link on parent
const CFG_SPECS = [
  {
    csvId: 'CFG-012',
    name: `AGENT-TEST-Config-Bike-${DATE}`,
    code: `AGENT-TEST-CFG-012-${DATE}`,
    basePrice: 100,
    isActive: true,
    sections: [
      {
        name: 'Choose Upgrade',
        type: 'Product',
        isRequired: false,
        allowCustomText: false,
        options: [
          { name: 'Basic Seat', price: 15 },
          { name: 'Premium Seat', price: 45 },
          { name: 'Racing Seat', price: 95 },
        ],
      },
    ],
  },
  {
    csvId: 'CFG-014',
    name: `AGENT-TEST-Config-Sale-Bike-${DATE}`,
    code: `AGENT-TEST-CFG-014-${DATE}`,
    basePrice: 250,
    salePrice: 200,
    isActive: true,
    sections: [
      {
        name: 'Handlebars',
        type: 'Product',
        isRequired: false,
        allowCustomText: false,
        options: [
          { name: 'Standard', price: 50, salePrice: 40 },
          { name: 'Drop Bar', price: 100, salePrice: 80 },
        ],
      },
    ],
  },
  {
    csvId: 'CFG-015',
    name: `AGENT-TEST-Config-OOS-Bike-${DATE}`,
    code: `AGENT-TEST-CFG-015-${DATE}`,
    basePrice: 120,
    isActive: true,
    sections: [
      {
        name: 'Frame Color',
        type: 'Product',
        isRequired: true,
        allowCustomText: false,
        options: [
          { name: 'Red', price: 0, stock: 10 },
          { name: 'Blue', price: 0, stock: 5 },
          { name: 'Ltd Black', price: 50, stock: 0 },   // OOS option — the whole point of CFG-015
          { name: 'Silver', price: 25, stock: 8 },
        ],
      },
    ],
  },
  {
    csvId: 'CFG-016',
    name: `AGENT-TEST-Config-Checkout-Bike-${DATE}`,
    code: `AGENT-TEST-CFG-016-${DATE}`,
    basePrice: 150,
    isActive: true,
    sections: [
      {
        name: 'Wheels',
        type: 'Product',
        isRequired: true,
        allowCustomText: false,
        options: [
          { name: 'Standard', price: 0 },
          { name: 'Sport', price: 50 },
        ],
      },
    ],
  },
  {
    csvId: 'CFG-018',
    name: `AGENT-TEST-Config-Custom-Jersey-${DATE}`,
    code: `AGENT-TEST-CFG-018-${DATE}`,
    basePrice: 50,
    isActive: true,
    sections: [
      {
        name: 'Size',
        type: 'Product',
        isRequired: true,
        allowCustomText: false,
        options: [
          { name: 'Small', price: 0 },
          { name: 'Medium', price: 0 },
          { name: 'Large', price: 5 },
        ],
      },
    ],
  },
  // ---------- Phase 2: multi-section CFGs ----------
  {
    csvId: 'CFG-013',
    name: `AGENT-TEST-Config-Laptop-${DATE}`,
    code: `AGENT-TEST-CFG-013-${DATE}`,
    basePrice: 999,
    isActive: true,
    sections: [
      {
        name: 'RAM',
        type: 'Product',
        isRequired: true,
        options: [
          { name: '8GB', price: 0 },
          { name: '16GB', price: 100 },
          { name: '32GB', price: 250 },
        ],
      },
      {
        name: 'Storage',
        type: 'Product',
        isRequired: true,
        options: [
          { name: '256GB SSD', price: 0 },
          { name: '512GB SSD', price: 75 },
          { name: '1TB SSD', price: 150 },
        ],
      },
    ],
  },
  {
    csvId: 'CFG-020',
    name: `AGENT-TEST-Config-Phone-Case-${DATE}`,
    code: `AGENT-TEST-CFG-020-${DATE}`,
    basePrice: 30,
    isActive: true,
    sections: [
      {
        name: 'Case Style',
        type: 'Product',
        isRequired: true,
        options: [
          { name: 'Clear', price: 0 },
          { name: 'Matte', price: 5 },
          { name: 'Gloss', price: 8 },
        ],
      },
      {
        name: 'Accessories',
        type: 'Product',
        isRequired: false,
        options: [
          { name: 'Ring', price: 10 },
          { name: 'Stand', price: 12 },
        ],
      },
      {
        name: 'Custom Name',
        type: 'Text',
        isRequired: false,
        allowCustomText: true,
        maxLength: 20,
      },
    ],
  },
  {
    csvId: 'CFG-021',
    name: `AGENT-TEST-Config-Custom-Bike-${DATE}`,
    code: `AGENT-TEST-CFG-021-${DATE}`,
    basePrice: 500,
    isActive: true,
    sections: [
      {
        name: 'Frame',
        type: 'Product',
        isRequired: true,
        options: [
          { name: 'Aluminum', price: 0 },
          { name: 'Carbon', price: 200 },
          { name: 'Steel', price: 50 },
        ],
      },
      {
        name: 'Wheels',
        type: 'Product',
        isRequired: true,
        options: [
          { name: 'Standard', price: 0 },
          { name: 'Sport', price: 75 },
          { name: 'Pro', price: 150 },
        ],
      },
      {
        name: 'Seat',
        type: 'Product',
        isRequired: false,
        options: [
          { name: 'Basic', price: 0 },
          { name: 'Comfort', price: 30 },
          { name: 'Racing', price: 60 },
        ],
      },
    ],
  },
  {
    csvId: 'CFG-017',
    name: `AGENT-TEST-Ring-Txt-Cfg-${DATE}`,
    code: `AGENT-TEST-CFG-017-${DATE}`,
    basePrice: 150,
    isActive: true,
    sections: [
      {
        name: 'Engraving Text',
        type: 'Text',
        isRequired: true,
        allowCustomText: true,
        maxLength: 30,
      },
    ],
  },
  {
    csvId: 'CFG-019',
    name: `AGENT-TEST-Config-Gift-Box-${DATE}`,
    code: `AGENT-TEST-CFG-019-${DATE}`,
    basePrice: 50,
    isActive: true,
    sections: [
      {
        name: 'Gift Message',
        type: 'Text',
        isRequired: false,
        allowCustomText: true,
        maxLength: 100,
      },
    ],
  },
];

const filterSpecs = ONLY ? CFG_SPECS.filter(s => s.csvId === ONLY) : CFG_SPECS;
if (filterSpecs.length === 0) { console.error(`No specs match --only ${ONLY}`); process.exit(1); }

console.log(`\n🌱 Seed Configurable Products${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID} | Virtual catalog: ${VIRTUAL_CATALOG_ID}`);
console.log(`   Specs to seed: ${filterSpecs.map(s => s.csvId).join(', ')}\n`);

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
  const name = `SEED-${DATE}-Configurables`;
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
  // POST /api/catalog/listentries — verified admin search for both products and categories
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
  // POST /api/catalog/listentries — admin product+category search (verified working 2026-05-18)
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

async function ensurePrice(priceListId, productId, listPrice, salePrice = null) {
  // Canonical batch endpoint: PUT /api/products/prices with [{ productId, prices: [{ pricelistId, list, sale, currency }] }]
  const price = {
    pricelistId: priceListId,
    productId,
    list: Number(listPrice),
    currency: 'USD',
    minQuantity: 1,
  };
  if (salePrice != null) price.sale = Number(salePrice);
  await api('PUT', '/api/products/prices', [{ productId, prices: [price] }], { expectStatus: [200, 204] });
}

async function ensureInventory(ffcId, productId, qty) {
  // PUT /api/inventory/plenty creates entries but defaults to status=Disabled (xAPI addItem
  // silently no-ops on Disabled per memory feedback_xapi_additem_silent_disabled).
  // Must explicitly set status:'Enabled'.
  try {
    await api('PUT', '/api/inventory/plenty', [{
      fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0,
      status: 'Enabled',
    }], { expectStatus: [200, 204] });
  } catch (e) {
    // Fallback: per-product PUT
    try {
      await api('PUT', `/api/inventory/products/${productId}`, {
        fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0,
        status: 'Enabled',
      }, { expectStatus: [200, 204] });
    } catch (e2) { if (VERBOSE) console.log(`    ⚠ inventory ${productId}: ${e2.message.slice(0,150)}`); }
  }
}

async function patchInventoryStatus(productId, status) {
  // PATCH with JsonPatch — the reliable route per reference_inventory_admin_api
  // GET first to find the inventory entry's id
  const list = await api('GET', `/api/inventory/products/${productId}`, null, { expectStatus: [200] });
  if (!Array.isArray(list) || !list.length) return;
  for (const entry of list) {
    if (!entry.id) continue;
    try {
      await api('PATCH', `/api/inventory/${entry.id}`, [
        { op: 'replace', path: '/status', value: status },
      ], { expectStatus: [200, 204] });
    } catch {}
  }
}

async function findOrCreatePriceList() {
  const name = `SEED-${DATE}-Configurables-USD`;
  // GET search (POST /search isn't allowed) — response is { results: [], totalCount }
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find(p => p?.name === name);
  if (pl) { console.log(`  ↻ pricelist: ${name} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', { name, currency: 'USD', description: 'Seeded for configurable products test data' }, { expectStatus: [200, 201] });
  // Assign to store
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

async function createConfiguration(productId, sections) {
  // Idempotency: search for existing configuration on this product first
  const existing = await api('POST', '/api/catalog/products/configurations/search', {
    productIds: [productId], take: 1,
  }, { expectStatus: [200, 400, 404] });
  if (existing?.results?.length) {
    const c = existing.results[0];
    console.log(`  ↻ configuration reused: ${c.id}`);
    return c;
  }
  const body = {
    productId,
    isActive: true,
    sections: sections.map((s, i) => ({
      name: s.name,
      isRequired: s.isRequired,
      displayOrder: i + 1,
      type: s.type,
      allowCustomText: s.allowCustomText ?? false,
      allowPredefinedOptions: s.options?.length > 0,
      maxLength: s.maxLength ?? null,
      options: (s.options || []).map(o => ({
        productId: o._productId,
        quantity: 1,
        text: null,
      })),
    })),
  };
  return await api('POST', '/api/catalog/products/configurations', body);
}

// --- Main ---
async function seedSpec(spec, parentCatalog, parentCategory, childCategory, priceListId, ffcId) {
  console.log(`\n=== ${spec.csvId}: ${spec.name} ===`);

  // 1. Create child products for Product-section options
  for (const section of spec.sections) {
    if (section.type !== 'Product') continue;
    for (const opt of section.options) {
      const childCode = `${spec.code}-OPT-${opt.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase()}`;
      const child = await ensureProduct(parentCatalog.id, childCategory.id, {
        name: `AGENT-TEST-${spec.csvId}-${opt.name}`,
        code: childCode,
        productType: 'Physical',
        vendor: 'QA',
        isActive: true,
        isBuyable: true,
        trackInventory: true,
      });
      opt._productId = child.id;
      if (!DRY_RUN && child.id && !child.id.startsWith('dry-')) {
        if (opt.price != null) await ensurePrice(priceListId, child.id, opt.price, opt.salePrice);
        if (opt.stock != null) await ensureInventory(ffcId, child.id, opt.stock);
        else await ensureInventory(ffcId, child.id, 100); // default
      }
    }
  }

  // 2. Create parent configurable product
  const parent = await ensureProduct(parentCatalog.id, parentCategory.id, {
    name: spec.name,
    code: spec.code,
    productType: 'Physical',
    vendor: 'QA',
    isActive: true,
    isBuyable: true,
    trackInventory: false,
  });
  if (!DRY_RUN && parent.id && !parent.id.startsWith('dry-')) {
    await ensurePrice(priceListId, parent.id, spec.basePrice, spec.salePrice);
  }

  // 3. Create configuration
  const config = await createConfiguration(parent.id, spec.sections);
  console.log(`  ✓ configuration: ${config?.id}`);

  // 4. Link parent into virtual catalog
  if (!DRY_RUN && parent.id && !parent.id.startsWith('dry-')) {
    try {
      await linkProductToVirtualCatalog(parent.id, VIRTUAL_CATALOG_ID);
      console.log(`  ✓ linked into virtual catalog`);
    } catch (e) {
      console.log(`  ⚠ virtual-catalog link: ${e.message.slice(0, 200)}`);
    }
  }

  return {
    csvId: spec.csvId,
    name: spec.name,
    parentId: parent.id,
    configurationId: config?.id,
    options: spec.sections.flatMap(s => (s.options || []).map(o => ({ name: o.name, productId: o._productId }))),
  };
}

async function main() {
  await auth();
  const catalog = await ensureCatalog();
  const parentCategory = await ensureCategory(catalog.id, 'Configurable Parents', `SEED-${DATE}-CFG-PARENTS`);
  const childCategory = await ensureCategory(catalog.id, 'Configurable Options', `SEED-${DATE}-CFG-OPTS`);
  const priceList = await findOrCreatePriceList();
  const ffc = await getDefaultFfc();
  if (!ffc?.id && !DRY_RUN) throw new Error('No fulfillment center available');

  // Link parent category to virtual catalog so parent products become storefront-visible
  if (!DRY_RUN && parentCategory.id && !parentCategory.id.startsWith('dry-')) {
    try {
      await api('POST', '/api/catalog/listentrylinks', [{
        listEntryId: parentCategory.id, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID,
      }], { expectStatus: [200, 204] });
      console.log(`  ✓ parent category linked into virtual catalog`);
    } catch (e) {
      console.log(`  ⚠ parent-category link: ${e.message.slice(0, 200)}`);
    }
  }

  const seeded = [];
  for (const spec of filterSpecs) {
    try {
      const r = await seedSpec(spec, catalog, parentCategory, childCategory, priceList.id, ffc?.id);
      seeded.push(r);
    } catch (e) {
      console.error(`  ❌ ${spec.csvId}: ${e.message.slice(0, 300)}`);
      seeded.push({ csvId: spec.csvId, error: e.message });
    }
  }

  if (!DRY_RUN) {
    // Reindex
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
  console.log(`\n✅ Phase 1: ${ok}/${seeded.length} CFG products seeded`);
  for (const s of seeded) {
    if (s.error) console.log(`  ❌ ${s.csvId}: ${s.error.slice(0, 100)}`);
    else console.log(`  ✓ ${s.csvId} parent=${s.parentId} config=${s.configurationId} options=${s.options.length}`);
  }
}

main().catch(e => { console.error(`\n❌ ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
