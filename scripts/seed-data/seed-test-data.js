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
 *
 * 
 *   teardown  — Delete this seeder's entities from EVERY prior run (matches the
 *               date-independent `AGENT-TEST-SEED-*` family + legacy `SEED-*`),
 *               not just today's. Deleting a seed catalog cascades to its
 *               categories/products; price lists are swept by keyword.
 *
 * Examples:
 *   node scripts/seed-test-data.js                  # minimal profile
 *   node scripts/seed-test-data.js catalog           # full catalog seed
 *   node scripts/seed-test-data.js full              # everything
 *   node scripts/seed-test-data.js teardown          # cleanup
 *   node scripts/seed-test-data.js catalog --dry-run # preview without creating
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';
// Layered env loader (side-effect import): populates process.env from
// .env.defaults + .env.${TEST_ENV} + .env.local and validates required vars.
// Replaces the old direct `.env` load so seeding respects TEST_ENV like every
// other entry point. Run from the repo root (config.js uses CWD-relative paths).
import '../../config.js';
// Runtime-GUID writeback: the SAME sanctioned helper every .mjs seeder uses to persist
// env-specific ids to test-data/aliases.<env>.json. Replaces the old _seed-results-*.json
// report (removed — VCST-5406: seeders write runtime GUIDs to aliases.{env}.json, never a
// results file). No-op under --dry-run.
// Store fixtures are now shared: ensureStore + its helpers live in seed-common.mjs so this
// relational seeder and the bootstrap preflight build ONE store from test-data/stores/stores.csv.
import { writeEnvAliasOverride, ensureStore, ensureCatalogs, seedCategoryTree, unlinkSeedRootsFromStoreVirtualCatalog } from '../lib/seed-common.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

// --- Config ---
const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';
const DATE_STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// Naming convention. The STABLE family prefix is date-independent so teardown can
// sweep EVERY prior run (not just today's). The per-run PREFIX adds the date for
// traceability. The family lives under `AGENT-TEST-` so it matches the repo-wide
// teardown convention shared by the Postman path + the specialized .mjs seeders.
// Teardown matches ONLY this family — a bare `SEED-` prefix is deliberately NOT swept:
// it collides with other active seeders (e.g. seed-standard-products.mjs's
// `SEED-<date>-Standards*`), and the rule is "delete only AGENT-TEST entities, nothing else".
const SEED_FAMILY = 'AGENT-TEST-SEED';        // stable matcher (all runs, all dates)
const PREFIX = `${SEED_FAMILY}-${DATE_STAMP}`; // per-run entity name/code prefix

// Runtime GUIDs land in the env overlay (aliases.<env>.json), NOT a _seed-results file.
// The env name mirrors seed-common's default (process.env.TEST_ENV || 'vcst').
const TEST_ENV_NAME = process.env.TEST_ENV || 'vcst';
const ENV_ALIAS_FILE = join(ROOT, 'test-data', `aliases.${TEST_ENV_NAME}.json`);
// Internal bookkeeping key inside aliases.<env>.json — a leading underscore marks it as
// non-@td (like `_meta`). These AGENT-TEST-SEED-* entities are ephemeral fixtures that no
// alias resolves, so we don't map them onto named aliases; we stash this run's ids here
// purely so teardown can clean orphaned products + restore the store catalog.
const SEED_BOOKKEEPING_KEY = '_seedTestData';

// An entity belongs to this seeder ONLY if its name/code carries the AGENT-TEST family
// prefix. Used by teardown — date-independent on purpose, but never matches non-AGENT-TEST data.
function isSeedEntity(name) {
  return typeof name === 'string' && name.startsWith(SEED_FAMILY);
}

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
  // Always fetch a REAL token — even in --dry-run. Dry-run skips WRITES only; reads
  // (GET + POST /search) still execute (see api()), and they need a valid bearer. The
  // old code stubbed a fake 'dry-run-token', which 401'd every read and broke the whole
  // dry-run preview. This bypasses api()'s write-skip guard for the token call itself.
  // Raw key=value (not URLSearchParams) to avoid double-encoding '!' etc. in the password.
  const body = Object.entries({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD })
    .map(([k, v]) => `${k}=${v}`).join('&');
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Auth failed: ${res.status} ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  created.token = data.access_token;
  log(`Auth: OK (expires in ${data.expires_in}s)${DRY_RUN ? ' [DRY RUN — reads only]' : ''}`);
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

// DEPRECATED / UNUSED: seedCatalogs, seedCategories, linkVirtualCatalog below created date-stamped
// (AGENT-TEST-SEED-<date>-*) catalogs that forked from the bootstrap. main() now delegates to the
// shared seed-common ensureCatalogs + seedCategoryTree (stable AGENT-TEST-SEED-* names, store-scoped
// SEO, root-linking, store binding). These are kept only as reference and are safe to remove.
// eslint-disable-next-line no-unused-vars
async function seedCatalogs(rows) {
  log(`Creating ${rows.length} catalog(s)...`);

  for (const row of rows) {
    const fullName = `${PREFIX}-${row.catalog_name}`;
    // Idempotent: reuse an existing catalog with this exact name instead of duplicating it.
    const existingCat = DRY_RUN ? null : await findCatalogByName(fullName);
    if (existingCat) {
      created.catalogs.push({ id: existingCat.id, csvId: row.catalog_id, csvName: row.catalog_name, name: fullName, isVirtual: existingCat.virtual ?? (row.catalog_type === 'Virtual') });
      verbose(`  ↻ reuse Catalog: ${fullName} (${existingCat.id})`);
      continue;
    }
    const languages = row.languages.split(',').map((lc, i) => ({
      languageCode: lc.trim(),
      isDefault: lc.trim() === row.default_language,
    }));

    const body = {
      name: fullName,
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

  // Ensure the store exists and points at the freshly seeded virtual catalog.
  // On a fresh start-local DB there is NO store yet, so we CREATE it from
  // test-data/stores/stores.csv (mapping the flag columns → store settings);
  // on an env that already has the store we just re-point its catalog.
  const virtualCat = created.catalogs.find(c => c.isVirtual && !DRY_RUN);
  log('Ensuring store + catalog assignment...');
  // Shared store seeder (seed-common) — pass this seeder's own `api`; it reads stores.csv.
  await ensureStore(api, { catalogId: virtualCat?.id });
}

// storeSettingsFromRow / loadCurrencyDefs / ensureCurrencies / applyFulfillmentCenters / ensureStore
// were EXTRACTED to scripts/lib/seed-common.mjs (imported above) so the bootstrap preflight and this
// relational seeder build ONE store from test-data/stores/stores.csv. Do not re-add local copies.

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
      name: row.category_name,
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

    let id, reused = false;
    if (DRY_RUN) { id = `dry-${row.category_id}`; }
    else {
      const r = await createOrReuseCatalogEntity('category', '/api/catalog/categories', catalog.id, body.code, body);
      id = r.entity?.id || `dry-${row.category_id}`; reused = r.reused;
    }
    created.categories.push({ id, csvId: row.category_id, name: body.name });
    verbose(`  ${reused ? '↻ reuse' : '✓'} Category: ${body.name} (${id})`);
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
    let id, reused = false;
    if (DRY_RUN) { id = `dry-${row.product_id}`; }
    else {
      const r = await createOrReuseCatalogEntity('product', '/api/catalog/products', catalog.id, body.code, body);
      id = r.entity?.id || `dry-${row.product_id}`; reused = r.reused;
    }
    created.products.push({ id, csvId: row.product_id, sku: row.sku, name: body.name, isVariation: false });
    verbose(`  ${reused ? '↻ reuse' : '✓'} Product: ${body.name} (${id})`);
  }

  // Create variations
  for (const row of variations) {
    const catalog = created.catalogs.find(c => c.csvId === row.catalog_id);
    const category = created.categories.find(c => c.csvId === row.category_id);
    const parent = created.products.find(p => p.csvId === row.main_product_id);
    if (!catalog || !parent) { verbose(`Skipping variation ${row.sku} — missing parent/catalog`); continue; }

    const body = buildProductBody(row, catalog, category, parent);
    let id, reused = false;
    if (DRY_RUN) { id = `dry-${row.product_id}`; }
    else {
      const r = await createOrReuseCatalogEntity('product', '/api/catalog/products', catalog.id, body.code, body);
      id = r.entity?.id || `dry-${row.product_id}`; reused = r.reused;
    }
    created.products.push({ id, csvId: row.product_id, sku: row.sku, name: body.name, isVariation: true, parentId: parent.id });
    verbose(`  ${reused ? '↻ reuse' : '✓'} Variation: ${body.name} (${id})`);
  }

  log(`  ✓ Created ${created.products.length} products total`);
}

// --- Idempotency helpers: find-or-create by name/code so re-running NEVER duplicates.
// Catalogs use the DB-backed catalogs/search (reliable); categories/products use the catalog
// index search (eventually-consistent — fine for across-run dedup, the duplication case). ---
async function findCatalogByName(name) {
  const r = await api('POST', '/api/catalog/catalogs/search', { keyword: name, take: 50 }, { expectStatus: [200, 201] });
  return (r?.results || []).find(c => c.name === name);
}
async function findCategoryByCode(catalogId, code) {
  try {
    const r = await api('POST', '/api/catalog/search/categories', { catalogId, keyword: code, take: 100 }, { expectStatus: [200, 201] });
    return (r?.results || r?.items || []).find(c => c.code === code);
  } catch { return null; }
}
async function findProductByCode(catalogId, code) {
  try {
    const r = await api('POST', '/api/catalog/search/products', { catalogId, keyword: code, take: 50 }, { expectStatus: [200, 201] });
    return (r?.results || r?.items || []).find(p => p.code === code);
  } catch { return null; }
}

// Find-or-create for catalog entities with a unique code+catalog constraint (categories,
// products). The index search is eventually-consistent, so a back-to-back re-run can miss an
// entity that already exists → the create then 500s on the DB unique key. We treat that
// duplicate-key 500 as "already exists" (idempotent), re-resolving the id after a short settle.
async function createOrReuseCatalogEntity(kind, path, catalogId, code, body) {
  const find = kind === 'category' ? findCategoryByCode : findProductByCode;
  const existing = await find(catalogId, code);
  if (existing) return { entity: existing, reused: true };
  try {
    return { entity: await api('POST', path, body, { expectStatus: [200, 201] }), reused: false };
  } catch (e) {
    if (/duplicate key|IX_Code_CatalogId|unique constraint/i.test(e.message)) {
      await new Promise(r => setTimeout(r, 2000)); // let the catalog index settle, then re-resolve
      const found = await find(catalogId, code);
      if (VERBOSE) console.log(`    ↻ ${kind} ${code} already existed (dup-key) → reused`);
      return { entity: found || { id: null }, reused: true };
    }
    throw e;
  }
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

  // Store-scoped product SEO (unified with the other seeders — platform default leaves storeId=null).
  const seoSlug = row.seo_slug || String(row.product_name || row.sku).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  body.seoInfos = [{
    storeId: STORE_ID,
    languageCode: 'en-US',
    semanticUrl: `seed-${seoSlug}`,
    pageTitle: row.meta_title || row.product_name,
    metaDescription: row.meta_description || '',
  }];

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
          name: `${pl.name} → ${virtualCat.id}`,
          pricelistId: pl.id,
          catalogId: virtualCat.id,
          priority: 100,
        };
        await api('POST', '/api/pricing/assignments', assignBody, { expectStatus: [200, 201] });
        assignCount++;
        verbose(`  ✓ Assignment: ${pl.name} → catalog ${virtualCat.id}`);
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

  // stock-levels.csv references FFCs by business key (row.ffc_id, e.g. "FFC-001"), but the
  // LIVE fulfillment centers (created by seed-inventory.mjs) carry code=ffc_code (e.g.
  // "FFC-EAST") and name="AGENT-TEST-FFC-<ffc_name>" — neither equals "FFC-001". Bridge the
  // two through fulfillment-centers.csv so per-FFC stock lands on the intended center instead
  // of silently collapsing onto the first active one.
  let ffcMeta = [];
  try { ffcMeta = loadCsv('test-data/inventory/fulfillment-centers.csv'); } catch { /* optional */ }
  const ffcMetaByBusinessId = {};
  for (const r of ffcMeta) {
    ffcMetaByBusinessId[r.ffc_id] = { code: (r.ffc_code || '').trim(), name: (r.ffc_name || '').trim() };
  }
  const resolveFfc = (businessId) => {
    const meta = ffcMetaByBusinessId[businessId] || {};
    return created.fulfillmentCenters.find(f =>
      f.id === businessId ||
      f.code === businessId ||
      (meta.code && f.code === meta.code) ||
      (meta.name && f.name?.includes(meta.name)) ||
      f.name?.includes(businessId)
    );
  };

  // Build flat array of InventoryInfo objects for batch upsert via PUT /api/inventory/plenty
  const inventoryEntries = [];
  for (const row of stockRows) {
    const product = created.products.find(p => p.csvId === row.product_id);
    if (!product) continue;
    if (row.track_inventory === 'false') continue;

    // Match FFC by business id → live code/name (see bridge above)
    let ffc = resolveFfc(row.ffc_id);
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

// Read this seeder's bookkeeping section from aliases.<env>.json (written at the end of a
// successful seed). Supplies product ids for orphan cleanup + the store's original catalog
// for restore. The PRIMARY teardown path is the date-independent AGENT-TEST-SEED catalog
// prefix-sweep (overlay-independent) — this only covers products whose catalog was already
// removed. One overlay per env ⇒ only the latest run's ids are stored here; older runs are
// still swept by the prefix path (their catalogs cascade their products away).
function loadSeedBookkeeping() {
  const empty = { products: [], priceLists: [], storeOriginalCatalog: null };
  try {
    if (!existsSync(ENV_ALIAS_FILE)) return empty;
    const bk = JSON.parse(readFileSync(ENV_ALIAS_FILE, 'utf-8'))?.[SEED_BOOKKEEPING_KEY];
    if (!bk) return empty;
    return {
      products: Array.isArray(bk.products) ? bk.products : [],
      priceLists: Array.isArray(bk.priceLists) ? bk.priceLists : [],
      storeOriginalCatalog: bk.storeOriginalCatalog || null,
    };
  } catch { verbose(`Could not read bookkeeping from ${ENV_ALIAS_FILE}`); return empty; }
}

async function teardown() {
  log(`Starting teardown — deleting ${SEED_FAMILY}-* entities across ALL runs (AGENT-TEST family only)...`);

  // First remove the seed root-category links we injected into the store's virtual catalog (e.g.
  // the live B2B-mixed), restoring its original entry set. Runs BEFORE catalog deletion so the
  // roots are still resolvable; only AGENT-TEST-SEED roots are touched.
  await unlinkSeedRootsFromStoreVirtualCatalog(api);

  const seedResults = loadSeedBookkeeping();
  if (seedResults.products.length || seedResults.priceLists.length) {
    log(`Bookkeeping from aliases.${TEST_ENV_NAME}.json: ${seedResults.products.length} products, ${seedResults.priceLists.length} price lists`);
  }

  // --- 1. Find every seed catalog by the date-independent prefix ---
  const allCatalogs = await api('POST', '/api/catalog/catalogs/search', { take: 500 }, { expectStatus: [200] });
  const seedCatalogs = (allCatalogs?.results || []).filter(c => isSeedEntity(c.name));
  log(`Found ${seedCatalogs.length} seed catalog(s)`);

  // --- 2. Within each seed catalog, delete seed categories (products cascade with
  //        the catalog at step 5, but explicit category deletion keeps the catalog
  //        empty so its own deletion can't be blocked by residual content) ---
  for (const cat of seedCatalogs) {
    const catSearch = await api('POST', '/api/catalog/search/categories', { catalogId: cat.id, take: 500 });
    const seedCats = (catSearch?.results || []).filter(c => isSeedEntity(c.name) || isSeedEntity(c.code));
    if (seedCats.length > 0) {
      // `objectIds` (NOT listEntryIds): POST /api/catalog/listentries/delete takes a
      // CatalogListEntrySearchCriteria — an empty/absent ObjectIds triggers a
      // search-and-delete of EVERY authorized entity (full-catalog wipe). The wrong field
      // deserialized to null ObjectIds. Correct field + the seedCats.length guard keep this
      // on the delete-only-these-ids branch.
      await api('POST', '/api/catalog/listentries/delete', {
        objectIds: seedCats.map(c => c.id),
        objectType: 'Category',
      }, { expectStatus: [200, 204] });
      log(`  ✓ Deleted ${seedCats.length} categories from ${cat.name}`);
    }
  }

  // --- 3. Best-effort product deletion from the env-overlay bookkeeping. Covers
  //        products whose catalog was already removed or is shared; survivors in
  //        a seed catalog cascade away at step 5. 404 is tolerated (already gone). ---
  const resultProductIds = [...new Set(
    seedResults.products.map(p => p.id).filter(id => id && !String(id).startsWith('dry-'))
  )];
  if (resultProductIds.length > 0) {
    const variationIds = seedResults.products.filter(p => p.isVariation).map(p => p.id);
    const parentIds = resultProductIds.filter(id => !variationIds.includes(id));
    for (const [ids, label] of [[variationIds, 'variations'], [parentIds, 'products']]) {
      if (ids.length === 0) continue;
      try {
        // `objectIds` (NOT listEntryIds) — see the Category delete above: an empty ObjectIds
        // makes this endpoint wipe every authorized product. `ids.length === 0` is guarded above.
        await api('POST', '/api/catalog/listentries/delete', {
          objectIds: ids,
          objectType: 'CatalogProduct',
        }, { expectStatus: [200, 204, 404] });
        log(`  ✓ Deleted ${ids.length} ${label} (from bookkeeping)`);
      } catch (err) {
        verbose(`bookkeeping ${label} delete failed: ${err.message.slice(0, 120)}`);
      }
    }
  }

  // --- 4. Delete seed price lists: keyword search per family + bookkeeping IDs ---
  const plIds = new Set(seedResults.priceLists.map(pl => pl.id).filter(Boolean));
  const plSearch = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(SEED_FAMILY)}`, null, { expectStatus: [200, 404] });
  const plList = Array.isArray(plSearch) ? plSearch : (plSearch?.results || []);
  plList.filter(pl => isSeedEntity(pl.name)).forEach(pl => plIds.add(pl.id));
  if (plIds.size > 0) {
    // Repeated `ids=a&ids=b` — the platform binds `[FromQuery] string[] ids` ONLY from the
    // repeated form; a comma-joined `ids=a,b` binds to one string that matches no id → silent no-op.
    const plQs = [...plIds].map((id) => `ids=${encodeURIComponent(id)}`).join('&');
    await api('DELETE', `/api/pricing/pricelists?${plQs}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✓ Deleted ${plIds.size} price lists`);
  }

  // --- 5. Restore the store catalog BEFORE deleting catalogs, so the store never
  //        points at a deleted catalog mid-teardown ---
  const currentStore = await api('GET', `/api/stores/${STORE_ID}`);
  if (currentStore?.catalog && seedCatalogs.some(c => c.id === currentStore.catalog)) {
    const originalCatalog = seedResults.storeOriginalCatalog || created.storeOriginalCatalog;
    if (originalCatalog) {
      currentStore.catalog = originalCatalog;
      await api('PUT', '/api/stores', currentStore, { expectStatus: [200, 204] });
      log(`  ✓ Restored store catalog to ${originalCatalog}`);
    } else {
      log('  ⚠ Store catalog points to a seed catalog but no original catalog ID found — restore manually');
    }
  }

  // --- 6. Delete seed catalogs (virtual first, then physical; cascades products) ---
  const virtualCats = seedCatalogs.filter(c => c.isVirtual);
  const physicalCats = seedCatalogs.filter(c => !c.isVirtual);
  for (const cat of [...virtualCats, ...physicalCats]) {
    await api('DELETE', `/api/catalog/catalogs/${cat.id}`, null, { expectStatus: [200, 204, 404] });
    verbose(`  ✓ Deleted catalog: ${cat.name}`);
  }
  if (seedCatalogs.length > 0) log(`  ✓ Deleted ${seedCatalogs.length} catalogs`);

  // --- 7. Reindex to clear deleted entities ---
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
  // UNIFIED with the bootstrap: build the SAME stable-named catalog + category structure
  // (AGENT-TEST-SEED-*, store-scoped SEO, roots linked into the virtual catalog, store bound) via the
  // shared seed-common helpers — NOT a date-stamped fork. Populate created.catalogs / created.categories
  // (keyed by CSV business id) so seedProducts / seedPricing / seedInventory resolve them unchanged.
  const catMap = await ensureCatalogs(api);
  const _cseen = new Set();
  created.catalogs = Object.values(catMap)
    .filter(c => c?.id && !_cseen.has(c.id) && _cseen.add(c.id))
    .map(c => ({ id: c.id, csvId: c.csvId, csvName: c.csvName, name: c.name, isVirtual: c.isVirtual }));
  const catgMap = await seedCategoryTree(api, catMap);
  created.categories = Object.entries(catgMap).map(([csvId, c]) => ({ id: c.id, csvId, name: c.name }));
  await seedProducts(slice.products);
  await seedPricing(slice.priceLists, slice.prices);
  await seedInventory(slice.stock);
  await triggerReindex();
  await verifySeededData();

  // Persist this run's runtime GUIDs to test-data/aliases.<env>.json — the sanctioned
  // location for env-specific ids (no _seed-results-*.json). These AGENT-TEST-SEED-*
  // entities are ephemeral and resolved by no @td() alias, so they live under an internal
  // bookkeeping key (see SEED_BOOKKEEPING_KEY) rather than named aliases. Kept only so
  // teardown can clean orphaned products + restore the store catalog. No-op under --dry-run.
  if (!DRY_RUN) {
    // Preserve the FIRST-recorded original catalog: on a re-seed the store already points at
    // a seed catalog, so this run's discovered "original" would be a seed catalog — don't let
    // it overwrite the real one captured on the initial seed.
    const prior = loadSeedBookkeeping();
    writeEnvAliasOverride({
      [SEED_BOOKKEEPING_KEY]: {
        profile,
        dateStamp: DATE_STAMP,
        prefix: PREFIX,
        products: created.products.map(p => ({ id: p.id, sku: p.sku, name: p.name, csvId: p.csvId, isVariation: p.isVariation })),
        priceLists: created.priceLists.map(pl => ({ id: pl.id, name: pl.name, csvId: pl.csvId, currency: pl.currency })),
        storeOriginalCatalog: prior.storeOriginalCatalog || created.storeOriginalCatalog,
      },
    });
    log(`\nRuntime GUIDs saved to test-data/aliases.${TEST_ENV_NAME}.json (${SEED_BOOKKEEPING_KEY})`);
  }

  console.log('\n✅ Seed complete!\n');
}

main().catch(err => {
  console.error(`\n❌ Seed failed: ${err.message}`);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
