/**
 * Test Data Seed Script
 *
 * Seeds the Virto Commerce QA environment with test data from CSV files.
 * Follows the entity dependency graph: Store → Catalog → Category → Product → Pricing → Inventory → Reindex.
 *
 * Usage:
 *   node scripts/seed-test-data.js [profile] [--teardown] [--dry-run] [--verbose]
 *
 * Profiles:
 *   minimal   — 1 catalog, 1 category, 3 products, 1 price list, basic inventory (default)
 *   catalog   — All catalogs, categories, products with variations and pricing
 *   full      — Everything: catalog + B2B orgs/users + all price lists + all inventory
 *   teardown  — Delete all SEED-* entities created by this script
 *
 * Examples:
 *   node scripts/seed-test-data.js                  # minimal profile
 *   node scripts/seed-test-data.js catalog           # full catalog seed
 *   node scripts/seed-test-data.js full              # everything
 *   node scripts/seed-test-data.js teardown          # cleanup
 *   node scripts/seed-test-data.js catalog --dry-run # preview without creating
 */

import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

config({ path: join(ROOT, '.env'), override: true });

// --- Config ---
const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';
const DATE_STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const PREFIX = `SEED-${DATE_STAMP}`;
const RESULTS_FILE = join(ROOT, 'test-data', `_seed-results-${DATE_STAMP}.json`);

// --- CLI Args ---
const args = process.argv.slice(2);
const profile = ['minimal', 'catalog', 'full', 'teardown'].find(p => args.includes(p)) || 'minimal';
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// --- State ---
const created = {
  catalogs: [],
  categories: [],
  products: [],
  priceLists: [],
  priceAssignments: [],
  fulfillmentCenters: [],  // discovered, not created
  token: null,
  storeOriginalCatalog: null,
};

// --- Helpers ---

function loadCsv(relativePath) {
  const fullPath = join(ROOT, relativePath);
  if (!existsSync(fullPath)) {
    console.error(`  CSV not found: ${relativePath}`);
    return [];
  }
  const content = readFileSync(fullPath, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true });
}

function log(msg) {
  console.log(`  ${msg}`);
}

function verbose(msg) {
  if (VERBOSE) console.log(`    [v] ${msg}`);
}

async function api(method, path, body = null, { expectStatus = [200, 204], formUrlEncoded = false } = {}) {
  const url = `${BACK_URL}${path}`;
  verbose(`${method} ${url}`);

  if (DRY_RUN && method !== 'GET') {
    verbose('  [DRY RUN] skipped');
    return { _dryRun: true };
  }

  const headers = {};
  if (created.token) headers['Authorization'] = `Bearer ${created.token}`;

  let fetchBody;
  if (body && formUrlEncoded) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    // Use raw key=value pairs — avoid double-encoding special chars like ! in passwords
    fetchBody = Object.entries(body).map(([k, v]) => `${k}=${v}`).join('&');
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }

  const res = await fetch(url, { method, headers, body: fetchBody });

  if (!expectStatus.includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return res.json();
  }
  return null;
}

async function authenticate() {
  log('Authenticating...');
  const data = await api('POST', '/connect/token', {
    grant_type: 'password',
    username: ADMIN,
    password: ADMIN_PASSWORD,
  }, { formUrlEncoded: true, expectStatus: [200] });

  if (DRY_RUN) {
    created.token = 'dry-run-token';
    log('Auth: [DRY RUN]');
    return;
  }

  created.token = data.access_token;
  log(`Auth: OK (expires in ${data.expires_in}s)`);
}

// --- Seed Steps ---

async function discoverInfrastructure() {
  log('Discovering infrastructure...');

  if (DRY_RUN) {
    log('  [DRY RUN] skipping infrastructure discovery');
    created.fulfillmentCenters = [{ id: 'dry-ffc-001', code: 'FFC-001', name: 'Dry Run FFC' }];
    return;
  }

  // Get store config
  const store = await api('GET', `/api/stores/${STORE_ID}`);
  if (store) {
    created.storeOriginalCatalog = store.catalog;
    verbose(`Store catalog: ${store.catalog}`);
  }

  // Discover fulfillment centers
  const ffcResult = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 50 });
  if (ffcResult && ffcResult.results) {
    created.fulfillmentCenters = ffcResult.results.filter(f => f.isActive !== false);
    log(`Found ${created.fulfillmentCenters.length} active fulfillment centers`);
  }
}

async function seedCatalogs(rows) {
  log(`Creating ${rows.length} catalog(s)...`);

  for (const row of rows) {
    const languages = row.languages.split(',').map((lc, i) => ({
      languageCode: lc.trim(),
      isDefault: lc.trim() === row.default_language,
    }));

    const body = {
      name: `${PREFIX}-${row.catalog_name}`,
      isVirtual: row.catalog_type === 'Virtual',
      languages,
    };

    if (row.catalog_type === 'Virtual' && row.linked_physical_catalogs) {
      // Link to previously created physical catalogs
      const linkNames = row.linked_physical_catalogs.split(',').map(s => s.trim());
      body.links = linkNames
        .map(name => created.catalogs.find(c => c.csvName === name))
        .filter(Boolean)
        .map(c => ({ catalogId: c.id }));
    }

    const result = await api('POST', '/api/catalog/catalogs', body, { expectStatus: [200, 201] });
    const id = result?.id || `dry-${row.catalog_id}`;
    created.catalogs.push({ id, csvId: row.catalog_id, csvName: row.catalog_name, name: body.name, isVirtual: body.isVirtual });
    log(`  ✓ Catalog: ${body.name} (${id})`);
  }

  // Assign virtual catalog to store if one exists
  const virtualCat = created.catalogs.find(c => c.isVirtual && !DRY_RUN);
  if (virtualCat) {
    log('Assigning catalog to store...');
    const store = await api('GET', `/api/stores/${STORE_ID}`);
    if (store) {
      store.catalog = virtualCat.id;
      await api('PUT', '/api/stores', store, { expectStatus: [200, 204] });
      log(`  ✓ Store ${STORE_ID} → catalog ${virtualCat.name}`);
    }

  }
}

async function seedCategories(rows) {
  log(`Creating ${rows.length} categor${rows.length === 1 ? 'y' : 'ies'}...`);

  // Sort by level to create parents first
  const sorted = [...rows].sort((a, b) => Number(a.level) - Number(b.level));

  for (const row of sorted) {
    if (row.is_active === 'No' && profile !== 'full') continue;

    const catalog = created.catalogs.find(c => c.csvId === row.catalog_id);
    if (!catalog) {
      verbose(`Skipping category ${row.category_name} — catalog ${row.catalog_id} not created`);
      continue;
    }

    let parentId = null;
    if (row.parent_id) {
      const parent = created.categories.find(c => c.csvId === row.parent_id);
      parentId = parent?.id || null;
    }

    const body = {
      catalogId: catalog.id,
      parentId,
      name: `${PREFIX}-${row.category_name}`,
      code: `${PREFIX}-${row.code}`,
      isActive: row.is_active !== 'No',
      priority: Number(row.priority) || 1,
      seoInfos: [{
        languageCode: 'en-US',
        semanticUrl: `seed-${row.seo_slug}`,
        pageTitle: row.meta_title || row.category_name,
        metaDescription: row.meta_description || '',
      }],
    };

    const result = await api('POST', '/api/catalog/categories', body, { expectStatus: [200, 201] });
    const id = result?.id || `dry-${row.category_id}`;
    created.categories.push({ id, csvId: row.category_id, name: body.name });
    verbose(`  ✓ Category: ${body.name} (${id})`);
  }

  log(`  ✓ Created ${created.categories.length} categories`);
}

async function linkVirtualCatalog(categoryRows) {
  const virtualCat = created.catalogs.find(c => c.isVirtual);
  if (!virtualCat || DRY_RUN) return;

  // Find root-level categories (no parent_id) that belong to physical catalogs
  const rootCsvIds = categoryRows
    .filter(r => !r.parent_id && r.is_active !== 'No')
    .map(r => r.category_id);

  const rootCats = created.categories.filter(c => rootCsvIds.includes(c.csvId));
  if (rootCats.length === 0) {
    log('  ⚠ No root categories to link into virtual catalog');
    return;
  }

  log(`Linking ${rootCats.length} root categories into virtual catalog ${virtualCat.name}...`);

  const links = rootCats.map(cat => ({
    listEntryId: cat.id,
    listEntryType: 'category',
    catalogId: virtualCat.id,
  }));

  try {
    await api('POST', '/api/catalog/listentrylinks', links, { expectStatus: [200, 204] });
    log(`  ✓ Linked ${rootCats.length} categories: ${rootCats.map(c => c.name).join(', ')}`);
  } catch (err) {
    log(`  ⚠ Virtual catalog linking failed: ${err.message.slice(0, 200)}`);
  }
}

async function seedProducts(rows) {
  // Split into parents and variations
  const parents = rows.filter(r => !r.main_product_id);
  const variations = rows.filter(r => r.main_product_id);

  log(`Creating ${parents.length} product(s) + ${variations.length} variation(s)...`);

  // Create parents first
  for (const row of parents) {
    if (row.is_active === 'No' && profile !== 'full') continue;

    const catalog = created.catalogs.find(c => c.csvId === row.catalog_id);
    const category = created.categories.find(c => c.csvId === row.category_id);
    if (!catalog) { verbose(`Skipping ${row.product_name} — no catalog`); continue; }

    const body = buildProductBody(row, catalog, category, null);
    const result = await api('POST', '/api/catalog/products', body, { expectStatus: [200, 201] });
    const id = result?.id || `dry-${row.product_id}`;
    created.products.push({ id, csvId: row.product_id, sku: row.sku, name: body.name, isVariation: false });
    verbose(`  ✓ Product: ${body.name} (${id})`);
  }

  // Create variations
  for (const row of variations) {
    const catalog = created.catalogs.find(c => c.csvId === row.catalog_id);
    const category = created.categories.find(c => c.csvId === row.category_id);
    const parent = created.products.find(p => p.csvId === row.main_product_id);
    if (!catalog || !parent) { verbose(`Skipping variation ${row.sku} — missing parent/catalog`); continue; }

    const body = buildProductBody(row, catalog, category, parent);
    const result = await api('POST', '/api/catalog/products', body, { expectStatus: [200, 201] });
    const id = result?.id || `dry-${row.product_id}`;
    created.products.push({ id, csvId: row.product_id, sku: row.sku, name: body.name, isVariation: true, parentId: parent.id });
    verbose(`  ✓ Variation: ${body.name} (${id})`);
  }

  log(`  ✓ Created ${created.products.length} products total`);
}

function buildProductBody(row, catalog, category, parent) {
  const properties = parseProperties(row.properties);

  const body = {
    catalogId: catalog.id,
    categoryId: category?.id || null,
    name: `${PREFIX}-${row.product_name}`,
    code: `${PREFIX}-${row.sku}`,
    productType: row.product_type || 'Physical',
    isActive: row.is_active !== 'No',
    isBuyable: row.is_buyable !== 'No',
    trackInventory: row.track_inventory !== 'No',
    vendor: row.vendor || undefined,
    gtin: row.gtin || undefined,
    manufacturerPartNumber: row.manufacturer_part_number || undefined,
    taxType: row.tax_type || 'Taxable',
  };

  if (row.weight_kg && Number(row.weight_kg) > 0) {
    body.weight = Number(row.weight_kg);
    body.weightUnit = 'kg';
  }
  if (row.height_cm && Number(row.height_cm) > 0) {
    body.height = Number(row.height_cm);
    body.width = Number(row.width_cm);
    body.length = Number(row.length_cm);
    body.measureUnit = 'cm';
  }
  if (row.package_type && row.package_type !== 'None') {
    body.packageType = row.package_type;
  }

  if (row.description_full) {
    body.descriptions = [
      { content: `<p>${row.description_full}</p>`, descriptionType: 'FullReview', languageCode: 'en-US' },
    ];
    if (row.description_short) {
      body.descriptions.push({ content: `<p>${row.description_short}</p>`, descriptionType: 'QuickReview', languageCode: 'en-US' });
    }
  }

  if (properties.length > 0) body.properties = properties;

  if (row.seo_slug) {
    body.seoInfos = [{
      languageCode: 'en-US',
      semanticUrl: `seed-${row.seo_slug}`,
      pageTitle: row.meta_title || row.product_name,
      metaDescription: row.meta_description || '',
    }];
  }

  if (parent) {
    body.mainProductId = parent.id;
  }

  return body;
}

function sanitizePropName(name) {
  // API requires: starts with letter/digit, only Latin letters, digits, underscore
  // Underscores must be preceded and followed by letter/digit
  return name.trim()
    .replace(/[^a-zA-Z0-9_ ]/g, '')  // remove special chars
    .replace(/\s+/g, '_')             // spaces to underscores
    .replace(/_+/g, '_')              // collapse multiple underscores
    .replace(/^_|_$/g, '');           // trim leading/trailing underscores
}

function parseProperties(propsStr) {
  if (!propsStr) return [];
  return propsStr.split(';').map(pair => {
    const colonIdx = pair.indexOf(':');
    if (colonIdx === -1) return null;
    const name = pair.slice(0, colonIdx);
    const valStr = pair.slice(colonIdx + 1);
    if (!name || !valStr) return null;

    const sanitizedName = sanitizePropName(name);
    if (!sanitizedName) return null;

    const values = valStr.split('|').map(v => {
      const trimmed = v.trim();
      if (trimmed === 'true' || trimmed === 'false') {
        return { value: trimmed, valueType: 'Boolean' };
      }
      if (/^\d+(\.\d+)?$/.test(trimmed)) {
        return { value: trimmed, valueType: 'Number' };
      }
      return { value: trimmed, valueType: 'ShortText' };
    });

    const prop = { name: sanitizedName, values };
    if (values.length > 1) prop.multivalue = true;
    return prop;
  }).filter(Boolean);
}

async function seedPricing(priceListRows, priceRows) {
  log(`Creating ${priceListRows.length} price list(s)...`);

  for (const row of priceListRows) {
    const body = {
      name: `${PREFIX}-${row.pricelist_name}`,
      currency: row.currency,
      description: row.description || 'Seeded price list',
    };

    const result = await api('POST', '/api/pricing/pricelists', body, { expectStatus: [200, 201] });
    const id = result?.id || `dry-${row.pricelist_id}`;
    created.priceLists.push({ id, csvId: row.pricelist_id, name: body.name, currency: row.currency });
    verbose(`  ✓ Price List: ${body.name} (${id})`);
  }

  // Create assignments (link price lists to catalog + store)
  const virtualCat = created.catalogs.find(c => c.isVirtual);
  if (virtualCat) {
    let assignCount = 0;
    for (const pl of created.priceLists) {
      try {
        const assignBody = {
          name: `${pl.name} → ${STORE_ID}`,
          pricelistId: pl.id,
          storeId: STORE_ID,
          priority: 100,
        };
        await api('POST', '/api/pricing/assignments', assignBody, { expectStatus: [200, 201] });
        assignCount++;
        verbose(`  ✓ Assignment: ${pl.name} → ${STORE_ID}`);
      } catch (err) {
        log(`  ⚠ Assignment failed for ${pl.name}: ${err.message.slice(0, 120)}`);
      }
    }
    log(`  ✓ Created ${assignCount}/${created.priceLists.length} price list assignments`);
  }

  // Batch set prices
  const pricesPayload = buildBatchPrices(priceRows);
  if (pricesPayload.length > 0) {
    await api('PUT', '/api/products/prices', pricesPayload, { expectStatus: [200, 204] });
    log(`  ✓ Set prices for ${pricesPayload.length} products`);
  }
}

function buildBatchPrices(priceRows) {
  // Group by product
  const byProduct = {};
  for (const row of priceRows) {
    const product = created.products.find(p => p.csvId === row.product_id);
    const priceList = created.priceLists.find(pl => pl.csvId === row.pricelist_id);
    if (!product || !priceList) continue;

    if (!byProduct[product.id]) {
      byProduct[product.id] = { productId: product.id, prices: [] };
    }

    const price = {
      pricelistId: priceList.id,
      productId: product.id,
      list: Number(row.list_price),
      minQuantity: Number(row.min_quantity) || 1,
      currency: row.currency,
    };
    if (row.sale_price) price.sale = Number(row.sale_price);

    byProduct[product.id].prices.push(price);
  }

  return Object.values(byProduct);
}

async function seedInventory(stockRows) {
  log('Setting inventory...');

  // Build flat array of InventoryInfo objects for batch upsert via PUT /api/inventory/plenty
  const inventoryEntries = [];
  for (const row of stockRows) {
    const product = created.products.find(p => p.csvId === row.product_id);
    if (!product) continue;
    if (row.track_inventory === 'false') continue;

    // Match FFC by id or code
    let ffc = created.fulfillmentCenters.find(f =>
      f.id === row.ffc_id || f.code === row.ffc_id || f.name?.includes(row.ffc_id)
    );
    // Fallback: use first active FFC
    if (!ffc && created.fulfillmentCenters.length > 0) {
      ffc = created.fulfillmentCenters[0];
    }
    if (!ffc) continue;

    inventoryEntries.push({
      fulfillmentCenterId: ffc.id,
      productId: product.id,
      inStockQuantity: Number(row.in_stock_quantity) || 0,
      reservedQuantity: Number(row.reserved_quantity) || 0,
    });
  }

  if (inventoryEntries.length > 0) {
    try {
      await api('PUT', '/api/inventory/plenty', inventoryEntries, { expectStatus: [200, 204] });
      log(`  ✓ Set inventory for ${inventoryEntries.length} entries`);
    } catch (err) {
      log(`  ⚠ Batch inventory failed: ${err.message.slice(0, 200)}`);
      // Fallback: try one-by-one with single object (not array)
      let count = 0;
      let failures = 0;
      for (const entry of inventoryEntries) {
        try {
          await api('PUT', `/api/inventory/products/${entry.productId}`, entry, { expectStatus: [200, 204] });
          count++;
        } catch {
          failures++;
        }
      }
      log(`  ✓ Fallback: set ${count} entries${failures ? ` (${failures} failed)` : ''}`);
    }
  }
}

async function triggerReindex() {
  log('Triggering search reindex...');

  await api('POST', '/api/search/indexes/index', [
    { documentType: 'CatalogProduct', rebuild: true },
    { documentType: 'Category', rebuild: true },
  ], { expectStatus: [200, 204] });

  if (DRY_RUN) { log('  [DRY RUN] Reindex skipped'); return; }

  // Poll until complete
  let attempts = 0;
  const maxAttempts = 12; // 60s max
  while (attempts < maxAttempts) {
    await new Promise(r => setTimeout(r, 5000));
    attempts++;
    const tasks = await api('GET', '/api/search/indexes/tasks', null, { expectStatus: [200, 404] });
    if (!tasks || tasks.length === 0) { log('  ✓ Reindex complete'); return; }
    const running = Array.isArray(tasks) ? tasks.filter(t => !t.isCompleted) : [];
    if (running.length === 0) { log('  ✓ Reindex complete'); return; }
    verbose(`  Reindex in progress (${attempts * 5}s)...`);
  }
  log('  ⚠ Reindex timeout — may still be running');
}

async function verifySeededData() {
  log('Verifying seeded data...');
  let ok = 0;
  let fail = 0;

  for (const product of created.products.slice(0, 5)) {
    if (DRY_RUN || product.id.startsWith('dry-')) continue;
    try {
      const p = await api('GET', `/api/catalog/products/${product.id}?responseGroup=Full`, null, { expectStatus: [200] });
      if (p && p.id) { ok++; } else { fail++; }
    } catch {
      fail++;
    }
  }

  log(`  Verified: ${ok} OK, ${fail} failed (checked ${Math.min(5, created.products.length)} of ${created.products.length})`);
}

// --- Teardown ---

async function teardown() {
  log('Starting teardown — deleting SEED-* entities...');

  // Load seed results file for entity IDs
  const resultsFile = join(ROOT, 'test-data', `_seed-results-${DATE_STAMP}.json`);
  let seedResults = null;
  if (existsSync(resultsFile)) {
    seedResults = JSON.parse(readFileSync(resultsFile, 'utf-8'));
    log(`Loaded seed results from ${resultsFile}`);
  }

  // Delete seed products (from results file or by searching catalogs)
  if (seedResults?.created?.products?.length) {
    const allIds = seedResults.created.products.map(p => p.id);
    const variationIds = seedResults.created.products.filter(p => p.isVariation).map(p => p.id);
    const parentIds = allIds.filter(id => !variationIds.includes(id));

    if (variationIds.length > 0) {
      await api('POST', '/api/catalog/listentries/delete', {
        listEntryIds: variationIds,
        objectType: 'CatalogProduct',
      }, { expectStatus: [200, 204] });
      log(`  ✓ Deleted ${variationIds.length} variations`);
    }
    if (parentIds.length > 0) {
      await api('POST', '/api/catalog/listentries/delete', {
        listEntryIds: parentIds,
        objectType: 'CatalogProduct',
      }, { expectStatus: [200, 204] });
      log(`  ✓ Deleted ${parentIds.length} products`);
    }
  } else {
    log('  No seed results file found — searching catalogs for seed products...');
    // Fallback: search within seed catalogs (found later in the teardown flow)
  }

  // Delete price lists (from results file or by keyword search)
  if (seedResults?.created?.priceLists?.length) {
    const plIds = seedResults.created.priceLists.map(pl => pl.id).join(',');
    await api('DELETE', `/api/pricing/pricelists?ids=${plIds}`, null, { expectStatus: [200, 204] });
    log(`  ✓ Deleted ${seedResults.created.priceLists.length} price lists`);
  } else {
    const plSearch = await api('GET', `/api/pricing/pricelists?keyword=SEED-${DATE_STAMP}`, null, { expectStatus: [200] });
    if (Array.isArray(plSearch) && plSearch.length > 0) {
      const plIds = plSearch.map(pl => pl.id).join(',');
      await api('DELETE', `/api/pricing/pricelists?ids=${plIds}`, null, { expectStatus: [200, 204] });
      log(`  ✓ Deleted ${plSearch.length} price lists`);
    }
  }

  // Search for seed catalogs by listing all and filtering by prefix
  const allCatalogs = await api('POST', '/api/catalog/catalogs/search', { take: 200 }, { expectStatus: [200] });
  const seedCatalogs = (allCatalogs?.results || []).filter(c => c.name && c.name.startsWith(`SEED-${DATE_STAMP}`));

  // Search for seed categories within each seed catalog
  for (const cat of seedCatalogs) {
    const catSearch = await api('POST', '/api/catalog/search/categories', {
      catalogId: cat.id,
      take: 200,
    });
    const seedCats = (catSearch?.results || []).filter(c => c.name?.startsWith(`SEED-${DATE_STAMP}`) || c.code?.startsWith(`SEED-${DATE_STAMP}`));
    if (seedCats.length > 0) {
      await api('POST', '/api/catalog/listentries/delete', {
        listEntryIds: seedCats.map(c => c.id),
        objectType: 'Category',
      }, { expectStatus: [200, 204] });
      log(`  ✓ Deleted ${seedCats.length} categories from ${cat.name}`);
    }
  }

  // Delete seed catalogs (virtual first, then physical)
  const virtualCats = seedCatalogs.filter(c => c.isVirtual);
  const physicalCats = seedCatalogs.filter(c => !c.isVirtual);
  for (const cat of [...virtualCats, ...physicalCats]) {
    await api('DELETE', `/api/catalog/catalogs/${cat.id}`, null, { expectStatus: [200, 204, 404] });
    verbose(`  ✓ Deleted catalog: ${cat.name}`);
  }
  if (seedCatalogs.length > 0) log(`  ✓ Deleted ${seedCatalogs.length} catalogs`);

  // Restore store catalog if it's currently a SEED catalog
  const currentStore = await api('GET', `/api/stores/${STORE_ID}`);
  if (currentStore?.catalog && seedCatalogs.some(c => c.id === currentStore.catalog)) {
    const originalCatalog = seedResults?.storeOriginalCatalog || created.storeOriginalCatalog;
    if (originalCatalog) {
      currentStore.catalog = originalCatalog;
      await api('PUT', '/api/stores', currentStore, { expectStatus: [200, 204] });
      log(`  ✓ Restored store catalog to ${originalCatalog}`);
    } else {
      log('  ⚠ Store catalog points to SEED catalog but no original catalog ID found — restore manually');
    }
  }

  // Reindex to clear deleted entities
  await triggerReindex();
  log('Teardown complete');
}

// --- Profile Definitions ---

function getProfileSlice(data, profile) {
  const catalogs = data.catalogs;
  const categories = data.categories;
  const products = data.products;
  const priceLists = data.priceLists;
  const prices = data.prices;
  const stock = data.stock;

  if (profile === 'minimal') {
    // 1 physical catalog, first 5 categories, first 5 products + their variations, 1 price list, matching inventory
    const catIds = new Set(['CAT-PHYS-001']);
    const catCatIds = new Set(categories.filter(c => catIds.has(c.catalog_id)).slice(0, 5).map(c => c.category_id));
    const prodIds = new Set();

    const filteredProducts = products.filter(p => catIds.has(p.catalog_id)).slice(0, 5);
    filteredProducts.forEach(p => prodIds.add(p.product_id));
    // Include their variations
    const variationProducts = products.filter(p => prodIds.has(p.main_product_id));
    variationProducts.forEach(p => prodIds.add(p.product_id));

    return {
      catalogs: catalogs.filter(c => catIds.has(c.catalog_id)),
      categories: categories.filter(c => catCatIds.has(c.category_id)),
      products: [...filteredProducts, ...variationProducts],
      priceLists: priceLists.slice(0, 1),
      prices: prices.filter(p => prodIds.has(p.product_id) && p.pricelist_id === priceLists[0]?.pricelist_id),
      stock: stock.filter(s => prodIds.has(s.product_id)),
    };
  }

  if (profile === 'catalog') {
    // All catalogs, categories, products — standard + volume pricing
    const plIds = new Set(['PL-USD-001', 'PL-USD-002', 'PL-EUR-001']);
    return {
      catalogs,
      categories,
      products,
      priceLists: priceLists.filter(pl => plIds.has(pl.pricelist_id)),
      prices: prices.filter(p => plIds.has(p.pricelist_id)),
      stock,
    };
  }

  // full — everything
  return { catalogs, categories, products, priceLists, prices, stock };
}

// --- Main ---

async function main() {
  console.log(`\n🌱 Seed Test Data — profile: ${profile}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID} | Prefix: ${PREFIX}\n`);

  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) {
    console.error('Missing BACK_URL, ADMIN, or ADMIN_PASSWORD in .env');
    process.exit(1);
  }

  // Load all CSV data
  const data = {
    catalogs: loadCsv('test-data/catalogs/catalogs.csv'),
    categories: loadCsv('test-data/catalogs/categories.csv'),
    products: loadCsv('test-data/products/products-full.csv'),
    priceLists: loadCsv('test-data/pricing/price-lists.csv'),
    prices: loadCsv('test-data/pricing/prices.csv'),
    stock: loadCsv('test-data/inventory/stock-levels.csv'),
  };

  await authenticate();

  if (profile === 'teardown') {
    await discoverInfrastructure();
    await teardown();
    return;
  }

  const slice = getProfileSlice(data, profile);

  console.log(`  Data slice: ${slice.catalogs.length} catalogs, ${slice.categories.length} categories, ${slice.products.length} products, ${slice.priceLists.length} price lists, ${slice.prices.length} prices, ${slice.stock.length} stock entries\n`);

  await discoverInfrastructure();
  await seedCatalogs(slice.catalogs);
  await seedCategories(slice.categories);
  await linkVirtualCatalog(slice.categories);
  await seedProducts(slice.products);
  await seedPricing(slice.priceLists, slice.prices);
  await seedInventory(slice.stock);
  await triggerReindex();
  await verifySeededData();

  // Save results
  if (!DRY_RUN) {
    const report = {
      profile,
      dateStamp: DATE_STAMP,
      prefix: PREFIX,
      target: BACK_URL,
      storeId: STORE_ID,
      created: {
        catalogs: created.catalogs.map(c => ({ id: c.id, name: c.name, csvId: c.csvId })),
        categories: created.categories.map(c => ({ id: c.id, name: c.name, csvId: c.csvId })),
        products: created.products.map(p => ({ id: p.id, sku: p.sku, name: p.name, csvId: p.csvId, isVariation: p.isVariation })),
        priceLists: created.priceLists.map(pl => ({ id: pl.id, name: pl.name, csvId: pl.csvId, currency: pl.currency })),
      },
      storeOriginalCatalog: created.storeOriginalCatalog,
    };
    writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2));
    log(`\nResults saved to ${RESULTS_FILE}`);
  }

  console.log('\n✅ Seed complete!\n');
}

main().catch(err => {
  console.error(`\n❌ Seed failed: ${err.message}`);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
