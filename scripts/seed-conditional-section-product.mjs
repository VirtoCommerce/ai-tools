/**
 * Seed CFG-022: Configurable product with conditional sections (VCST-4713).
 *
 * Dependency chain:
 *   Section A "Frame Type"   (Product, REQUIRED) ─┬─→ Section B "Wheel Set"   (optional, dependsOn=A) ──→ Section C "Tire Type" (optional, dependsOn=B)
 *                                                  └─→ Section D "Frame Color" (optional, dependsOn=A)  [sibling of B]
 *
 * Covers:
 *  - Required parent gate (A must be selected before B/D appear)
 *  - Sibling dependents (B and D both depend on A)
 *  - Transitive chain (C hidden until B selected; B hidden until A selected)
 *  - Mixed required/optional
 *
 * Requires: VirtoCommerce.Catalog >= 3.1014.0-pr-871 on target env.
 *
 * Usage: node scripts/seed-conditional-section-product.mjs
 */

import https from 'https';

const BACK_URL = 'https://vcst-qa.govirto.com';
const CATALOG_ID = '7f840fe0-f141-471c-9bad-97d33ee5e87d';
const CATEGORY_ID = '15ba0fac-fb4d-4ca4-8f3f-5611a61a4f45'; // Build the bike of your dreams
const PRICELIST_ID = '732f3fc9-e02f-4839-b69a-5ff7feaf7950';
const FFC_ID = '142ba5568ae4454aad553ece41b9c3b5';
// Virtual catalog (B2B-mixed) link — REQUIRED for product to resolve on storefront URLs.
// Without this link the storefront returns 404 even after reindex; the physical catalog above
// is not exposed to B2B-store. The base configurable product needs to appear under
// "Products with options > Configurations".
const VIRTUAL_CATALOG_ID = 'fc596540864a41bf8ab78734ee7353a3';
const VIRTUAL_CATEGORY_ID = 'a50654eb-f860-450d-81ba-0c61853f468e'; // Configurations
const DATE_STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

let TOKEN = '';

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BACK_URL);
    const opts = {
      method,
      hostname: url.hostname,
      path: url.pathname + url.search,
      headers: { 'Authorization': `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
      rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) reject(new Error(`HTTP ${res.statusCode} ${method} ${path}: ${data.substring(0, 600)}`));
        else { try { resolve(data ? JSON.parse(data) : null); } catch { resolve(data); } }
      });
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function getToken() {
  return new Promise((resolve, reject) => {
    const post = 'grant_type=password&scope=offline_access&username=admin&password=Password1!';
    const opts = {
      method: 'POST', hostname: 'vcst-qa.govirto.com', path: '/connect/token',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(post) },
      rejectUnauthorized: false,
    };
    const req = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c);
      res.on('end', () => { const j = JSON.parse(d); j.access_token ? resolve(j.access_token) : reject(new Error('Auth: ' + d)); });
    });
    req.on('error', reject); req.write(post); req.end();
  });
}

function makeProduct(name, sku) {
  return {
    name: `AGENT-TEST-${name}-${DATE_STAMP}`,
    code: `AGENT-TEST-${sku}-${DATE_STAMP}`,
    productType: 'Physical',
    catalogId: CATALOG_ID,
    categoryId: CATEGORY_ID,
    isActive: true,
    isBuyable: true,
    trackInventory: true,
    startDate: new Date().toISOString(),
  };
}

// 1 base + 11 option products (3 + 3 + 3 + 3 - some shared "None" reused? keep distinct for clarity)
const PRODUCTS = {
  // Base
  base: makeProduct('Config-Conditional-Bike', 'COND-BIKE-CFG'),
  // Section A — Frame Type (REQUIRED, parent of B and D)
  frame_alu:    makeProduct('Cond-Frame-Aluminum', 'COND-FRM-ALU'),
  frame_carbon: makeProduct('Cond-Frame-Carbon',   'COND-FRM-CARB'),
  frame_steel:  makeProduct('Cond-Frame-Steel',    'COND-FRM-STL'),
  // Section B — Wheel Set (optional, dependsOn A; parent of C)
  wheel_none:   makeProduct('Cond-Wheel-None',     'COND-WHL-NONE'),
  wheel_std:    makeProduct('Cond-Wheel-Standard', 'COND-WHL-STD'),
  wheel_sport:  makeProduct('Cond-Wheel-Sport',    'COND-WHL-SPT'),
  // Section D — Frame Color (optional, dependsOn A; sibling of B)
  color_none:   makeProduct('Cond-Color-None',     'COND-CLR-NONE'),
  color_black:  makeProduct('Cond-Color-Black',    'COND-CLR-BLK'),
  color_red:    makeProduct('Cond-Color-Red',      'COND-CLR-RED'),
  // Section C — Tire Type (optional, dependsOn B; transitive)
  tire_none:    makeProduct('Cond-Tire-None',      'COND-TIRE-NONE'),
  tire_slick:   makeProduct('Cond-Tire-Slick',     'COND-TIRE-SLK'),
  tire_knobby:  makeProduct('Cond-Tire-Knobby',    'COND-TIRE-KNB'),
};

const PRICES = {
  base: { list: 300 },
  frame_alu: { list: 0 }, frame_carbon: { list: 200 }, frame_steel: { list: 50 },
  wheel_none: { list: 0 }, wheel_std: { list: 25 }, wheel_sport: { list: 75 },
  color_none: { list: 0 }, color_black: { list: 10 }, color_red: { list: 15 },
  tire_none: { list: 0 }, tire_slick: { list: 20 }, tire_knobby: { list: 35 },
};

const INVENTORY = {
  base: 30,
  frame_alu: 30, frame_carbon: 15, frame_steel: 20,
  wheel_none: 30, wheel_std: 25, wheel_sport: 15,
  color_none: 30, color_black: 25, color_red: 20,
  tire_none: 30, tire_slick: 20, tire_knobby: 15,
};

const productIds = {};

async function createProducts() {
  console.log('\n=== STEP 1: Resolving / creating products ===');

  // Helper — resolve all by scanning the category (DB-backed, no search index lag)
  async function resolveFromCategory() {
    const s = await request('POST', '/api/catalog/search/products', {
      catalogId: CATALOG_ID, categoryId: CATEGORY_ID, take: 500, sort: 'createdDate:desc',
    });
    for (const item of (s.items || [])) {
      for (const [k, p] of Object.entries(PRODUCTS)) {
        if (item.code === p.code && !productIds[k]) { productIds[k] = item.id; break; }
      }
    }
  }

  await resolveFromCategory();
  console.log(`  Pre-existing: ${Object.keys(productIds).length}/${Object.keys(PRODUCTS).length}`);

  const stillMissing = Object.keys(PRODUCTS).filter(k => !productIds[k]);
  if (stillMissing.length > 0) {
    const payload = stillMissing.map(k => PRODUCTS[k]);
    console.log(`  Creating ${payload.length} missing products via batch...`);
    await request('POST', '/api/catalog/products/batch', payload);
    await resolveFromCategory();
  }

  const found = Object.keys(productIds).length;
  console.log(`  Final mapped: ${found}/${Object.keys(PRODUCTS).length}`);
  if (found < Object.keys(PRODUCTS).length) {
    const missing = Object.keys(PRODUCTS).filter(k => !productIds[k]);
    throw new Error('Missing product IDs: ' + missing.join(', '));
  }
}

async function setPrices() {
  console.log('\n=== STEP 2: Setting prices ===');
  const entries = Object.entries(PRICES).map(([k, pi]) => ({
    productId: productIds[k],
    prices: [{ pricelistId: PRICELIST_ID, currency: 'USD', productId: productIds[k], list: pi.list, minQuantity: 1 }],
  }));
  await request('PUT', '/api/products/prices', entries);
  console.log(`  Prices set for ${entries.length} products`);
}

async function setInventory() {
  console.log('\n=== STEP 3: Setting inventory ===');
  const entries = Object.entries(INVENTORY).map(([k, qty]) => ({
    fulfillmentCenterId: FFC_ID,
    productId: productIds[k],
    inStockQuantity: qty,
    reservedQuantity: 0,
  }));
  await request('PUT', '/api/inventory/plenty', entries);
  console.log(`  Inventory set for ${entries.length} products`);
}

async function linkBaseToVirtualCatalog() {
  console.log('\n=== STEP 3b: Linking base product to virtual catalog (storefront visibility) ===');
  const baseId = productIds.base;
  const prod = await request('GET', `/api/catalog/products/${baseId}?respGroup=ItemLargeInfo`);
  const desiredLink = {
    entryId: baseId, listEntryId: baseId, listEntryType: null, priority: 0,
    catalogId: VIRTUAL_CATALOG_ID, categoryId: VIRTUAL_CATEGORY_ID,
    targetId: VIRTUAL_CATEGORY_ID, name: 'Configurations', isAutomatic: false,
  };
  const existing = (prod.links || []).find(l => l.catalogId === VIRTUAL_CATALOG_ID && l.categoryId === VIRTUAL_CATEGORY_ID);
  if (existing) {
    console.log('  Link already present — skip');
    return;
  }
  prod.links = [...(prod.links || []), desiredLink];
  await request('POST', '/api/catalog/products', prod);
  console.log(`  Linked: catalog=${VIRTUAL_CATALOG_ID} category=${VIRTUAL_CATEGORY_ID} (Configurations)`);
}

function buildSections(deps = {}, existingByName = {}) {
  // deps = { B: '<id-of-A>', D: '<id-of-A>', C: '<id-of-B>' }
  // existingByName = { 'Frame Type': '<id>', 'Wheel Set': '<id>', ... } — reuse to preserve section IDs across re-runs
  const withId = (s) => existingByName[s.name] ? { ...s, id: existingByName[s.name] } : s;
  return [
    {
      name: 'Frame Type',
      type: 'Product',
      isRequired: true,
      displayOrder: 0,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds.frame_alu,    quantity: 1 },
        { productId: productIds.frame_carbon, quantity: 1 },
        { productId: productIds.frame_steel,  quantity: 1 },
      ],
    },
    {
      name: 'Wheel Set',
      type: 'Product',
      isRequired: false,
      displayOrder: 1,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: deps.B || null,
      options: [
        { productId: productIds.wheel_none,  quantity: 1 },
        { productId: productIds.wheel_std,   quantity: 1 },
        { productId: productIds.wheel_sport, quantity: 1 },
      ],
    },
    {
      name: 'Frame Color',
      type: 'Product',
      isRequired: false,
      displayOrder: 2,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: deps.D || null,
      options: [
        { productId: productIds.color_none,  quantity: 1 },
        { productId: productIds.color_black, quantity: 1 },
        { productId: productIds.color_red,   quantity: 1 },
      ],
    },
    {
      name: 'Tire Type',
      type: 'Product',
      isRequired: false,
      displayOrder: 3,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: deps.C || null,
      options: [
        { productId: productIds.tire_none,   quantity: 1 },
        { productId: productIds.tire_slick,  quantity: 1 },
        { productId: productIds.tire_knobby, quantity: 1 },
      ],
    },
  ].map(withId);
}

async function createConfiguration() {
  console.log('\n=== STEP 4: Creating/updating configuration (pass 1, no dependencies) ===');

  // Idempotency — reuse existing configuration if present (ProductId has unique index)
  const existing = await request('POST', '/api/catalog/products/configurations/search', {
    productId: productIds.base, take: 1,
  });
  const existingCfg = existing?.results?.[0];
  const existingByName = {};
  for (const s of (existingCfg?.sections || [])) existingByName[s.name] = s.id;

  // Pass 1 — POST sections without deps to get back section IDs
  const config1 = {
    productId: productIds.base,
    isActive: true,
    sections: buildSections({}, existingByName),
  };
  if (existingCfg?.id) {
    config1.id = existingCfg.id;
    console.log(`  Reusing existing configuration ID: ${existingCfg.id}`);
  }
  const res1 = await request('POST', '/api/catalog/products/configurations', config1);
  console.log(`  Config ${existingCfg ? 'updated' : 'created'}. ID: ${res1?.id}`);
  console.log(`  Sections returned: ${res1?.sections?.length}`);

  // Map section IDs by name
  const sectionMap = {};
  for (const s of (res1?.sections || [])) {
    sectionMap[s.name] = s.id;
    console.log(`    "${s.name}" id=${s.id}, dependsOn=${s.dependsOnSectionId || 'null'}`);
  }

  const A = sectionMap['Frame Type'];
  const B = sectionMap['Wheel Set'];
  const D = sectionMap['Frame Color'];
  const C = sectionMap['Tire Type'];
  if (!A || !B || !C || !D) throw new Error('Section ID resolution failed: ' + JSON.stringify(sectionMap));

  console.log('\n=== STEP 4b: Re-POST configuration with dependsOnSectionId wired ===');
  // Pass 2 — re-POST preserving section IDs returned from pass 1 + dependency wiring
  const idsByName = { 'Frame Type': A, 'Wheel Set': B, 'Frame Color': D, 'Tire Type': C };
  const sectionsWithDeps = buildSections({ B: A, D: A, C: B }, idsByName);

  const config2 = {
    id: res1.id,
    productId: productIds.base,
    isActive: true,
    sections: sectionsWithDeps,
  };
  const res2 = await request('POST', '/api/catalog/products/configurations', config2);
  console.log(`  Config updated. Sections:`);
  for (const s of (res2?.sections || [])) {
    console.log(`    "${s.name}" id=${s.id}, dependsOn=${s.dependsOnSectionId || 'null'}`);
  }

  return { configId: res1.id, sectionMap: { A, B, D, C } };
}

async function triggerReindex() {
  console.log('\n=== STEP 5: Triggering reindex ===');
  try {
    await request('POST', '/api/search/indexes/index', { documentType: 'KnownDocumentTypes.Product' });
    console.log('  Reindex triggered');
  } catch (e) {
    console.log(`  Reindex failed (manual trigger may be needed): ${e.message}`);
  }
}

async function verify(configId) {
  console.log('\n=== STEP 6: Verification ===');
  const search = await request('POST', '/api/catalog/products/configurations/search', { productId: productIds.base, take: 1 });
  const cfg = search.results?.[0];
  console.log(`  Config active=${cfg?.isActive}, sections=${cfg?.sections?.length}`);
  for (const s of (cfg?.sections || [])) {
    console.log(`    "${s.name}" required=${s.isRequired} dependsOn=${s.dependsOnSectionId || 'null'} options=${s.options?.length || 0}`);
  }
}

async function main() {
  console.log('=== CFG-022 Conditional Section Seed (VCST-4713) ===');
  console.log(`Date: ${DATE_STAMP}  Catalog: ${CATALOG_ID}  Category: ${CATEGORY_ID}`);

  TOKEN = await getToken();
  console.log('Auth OK');

  await createProducts();
  await setPrices();
  await setInventory();
  await linkBaseToVirtualCatalog();
  const { configId, sectionMap } = await createConfiguration();
  await triggerReindex();
  await verify(configId);

  console.log('\n=== SUMMARY ===');
  console.log(`Base product:    ${PRODUCTS.base.name}`);
  console.log(`Base product ID: ${productIds.base}`);
  console.log(`Slug (expected): agent-test-config-conditional-bike-${DATE_STAMP}`);
  console.log(`Config ID: ${configId}`);
  console.log('Section IDs:');
  console.log(`  A "Frame Type"   = ${sectionMap.A}`);
  console.log(`  B "Wheel Set"    = ${sectionMap.B}  (dependsOn A)`);
  console.log(`  D "Frame Color"  = ${sectionMap.D}  (dependsOn A)`);
  console.log(`  C "Tire Type"    = ${sectionMap.C}  (dependsOn B)`);
  console.log('\nDone.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
