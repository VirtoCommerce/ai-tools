#!/usr/bin/env node
/**
 * Phase 3: seeds conditional-cascade configurable products (CFG-022..CFG-029)
 * after the 2026-05-15 vcst-qa catalog wipe.
 *
 * Sister script to scripts/seed-configurable-products.mjs (Phase 1+2). Shares
 * the same catalog/category/pricelist/ffc/virtual-catalog wiring, but adds a
 * second pass that sets `dependsOnSectionId` on configuration sections after
 * the section IDs are assigned by the platform.
 *
 * USAGE:
 *   node scripts/seed-conditional-sections-extended.mjs [--dry-run] [--verbose] [--only CFG-024]
 *
 * Safety:
 *   - Host allowlist (vcst-qa, vcptcore-qa)
 *   - Idempotent: searches by product code first, reuses existing entities
 *   - --dry-run prints plan, no writes (reads only)
 *
 * Writes results to test-data/_seed-results-cfg-cond-{DATE}.json.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';

// Resolve virtual catalog root from the canonical alias registry — never hardcode GUIDs.
// See .claude/rules/test-data.md + memory feedback_no_test_data + reference_test_data_resolver.
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const VIRTUAL_CATALOG_ID = aliases?.VIRTUAL_CATALOG_B2B?.id;
if (!VIRTUAL_CATALOG_ID) {
  console.error('ABORT: VIRTUAL_CATALOG_B2B.id not found in test-data/aliases.json');
  process.exit(2);
}

const DATE = '20260519';
const RESULTS_FILE = join(ROOT, `test-data/_seed-results-cfg-cond-${DATE}.json`);

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const ALLOWED_HOSTS = ['vcst-qa.govirto.com', 'vcptcore-qa.govirto.com'];
if (!ALLOWED_HOSTS.includes(new URL(BACK_URL).host)) {
  console.error(`ABORT: BACK_URL host not in allowlist`);
  process.exit(2);
}

// --- CFG Phase 3 specs (conditional cascades) ---
// Each section has a `key` (A/B/C/D/E) for intra-spec dependency wiring.
// `dependsOn` references another section's key; null = root section.
// Order in array = displayOrder. Section-IDs come from the platform after POST.
const CFG_SPECS = [
  {
    csvId: 'CFG-022',
    name: `AGENT-TEST-Config-Conditional-Bike-${DATE}`,
    code: `AGENT-TEST-CFG-022-${DATE}`,
    basePrice: 300,
    isActive: true,
    sections: [
      { key: 'A', name: 'Frame Type', type: 'Product', isRequired: true,  dependsOn: null,
        options: [{ name: 'Aluminum', price: 0 }, { name: 'Carbon', price: 200 }, { name: 'Steel', price: 50 }] },
      { key: 'B', name: 'Wheel Set',  type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Standard', price: 25 }, { name: 'Sport', price: 75 }] },
      { key: 'D', name: 'Frame Color', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Black', price: 10 }, { name: 'Red', price: 15 }] },
      { key: 'C', name: 'Tire Type',  type: 'Product', isRequired: false, dependsOn: 'B',
        options: [{ name: 'Slick', price: 20 }, { name: 'Knobby', price: 35 }] },
    ],
  },
  {
    csvId: 'CFG-023',
    name: `AGENT-TEST-Wedding-Cake-Cond-${DATE}`,
    code: `AGENT-TEST-CFG-023-${DATE}`,
    basePrice: 81,
    isActive: true,
    sections: [
      { key: 'Base',    name: 'Base',                    type: 'Product', isRequired: true,  dependsOn: null,
        options: [
          { name: 'Top White Bottom White', price: 0 },
          { name: 'Top White Bottom Cream', price: 5 },
          { name: 'Top Cream Bottom Cream', price: 10 },
        ] },
      { key: 'Creme',   name: 'Creme',                   type: 'Product', isRequired: false, dependsOn: 'Base',
        options: [
          { name: 'Buttercreme Peach and Blue', price: 12 },
          { name: 'Buttercreme Vanilla',        price: 8 },
        ] },
      { key: 'Message', name: 'Message',                 type: 'Product', isRequired: false, dependsOn: 'Creme',
        options: [
          { name: 'Standard Message Tag', price: 12 },
          { name: 'Premium Message Tag',  price: 20 },
        ] },
      { key: 'Text',    name: 'Custom text required',    type: 'Text', isRequired: true,  dependsOn: 'Message',
        allowCustomText: true, maxLength: 100, options: [] },
      { key: 'Image',   name: 'Image',                   type: 'File', isRequired: false, dependsOn: 'Message',
        options: [] },
    ],
  },
  {
    csvId: 'CFG-024',
    name: `AGENT-TEST-Text-Driven-Cond-${DATE}`,
    code: `AGENT-TEST-CFG-024-${DATE}`,
    basePrice: 200,
    isActive: true,
    sections: [
      { key: 'A', name: 'Engraving Line 1', type: 'Text', isRequired: true, dependsOn: null,
        allowCustomText: true, maxLength: 60, options: [] },
      { key: 'B', name: 'Style Pack',       type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Classic', price: 30 }, { name: 'Modern', price: 45 }] },
      { key: 'C', name: 'Accessory',        type: 'Product', isRequired: false, dependsOn: 'B',
        options: [{ name: 'Bag', price: 20 }, { name: 'Case', price: 25 }] },
    ],
  },
  {
    csvId: 'CFG-025',
    name: `AGENT-TEST-File-Driven-Cond-${DATE}`,
    code: `AGENT-TEST-CFG-025-${DATE}`,
    basePrice: 180,
    isActive: true,
    sections: [
      { key: 'A', name: 'Design Upload', type: 'File', isRequired: true, dependsOn: null, options: [] },
      { key: 'B', name: 'Finish Type',   type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Matte', price: 15 }, { name: 'Gloss', price: 20 }] },
      { key: 'C', name: 'Notes',         type: 'Text', isRequired: false, dependsOn: 'B',
        allowCustomText: true, maxLength: 200, options: [] },
    ],
  },
  {
    csvId: 'CFG-026',
    name: `AGENT-TEST-Req-File-Child-${DATE}`,
    code: `AGENT-TEST-CFG-026-${DATE}`,
    basePrice: 150,
    isActive: true,
    sections: [
      { key: 'A', name: 'Service Plan', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Basic', price: 0 }, { name: 'Premium', price: 50 }] },
      { key: 'B', name: 'ID Proof',     type: 'File',    isRequired: true, dependsOn: 'A', options: [] },
    ],
  },
  {
    csvId: 'CFG-027',
    name: `AGENT-TEST-Two-Req-Siblings-${DATE}`,
    code: `AGENT-TEST-CFG-027-${DATE}`,
    basePrice: 120,
    isActive: true,
    sections: [
      { key: 'A', name: 'Bundle Choice', type: 'Product', isRequired: false, dependsOn: null,
        options: [{ name: 'Bundle A', price: 40 }, { name: 'Bundle B', price: 60 }] },
      { key: 'B', name: 'Size',          type: 'Product', isRequired: true, dependsOn: 'A',
        options: [{ name: 'Small', price: 0 }, { name: 'Medium', price: 5 }, { name: 'Large', price: 10 }] },
      { key: 'C', name: 'Color',         type: 'Product', isRequired: true, dependsOn: 'A',
        options: [{ name: 'Black', price: 0 }, { name: 'White', price: 0 }, { name: 'Red', price: 5 }] },
    ],
  },
  {
    csvId: 'CFG-028',
    name: `AGENT-TEST-Deep-4-Level-Chain-${DATE}`,
    code: `AGENT-TEST-CFG-028-${DATE}`,
    basePrice: 300,
    isActive: true,
    sections: [
      { key: 'A', name: 'Level A', type: 'Product', isRequired: true,  dependsOn: null,
        options: [{ name: 'Opt1', price: 20 }, { name: 'Opt2', price: 40 }] },
      { key: 'B', name: 'Level B', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Opt1', price: 10 }] },
      { key: 'C', name: 'Level C', type: 'Product', isRequired: false, dependsOn: 'B',
        options: [{ name: 'Opt1', price: 10 }] },
      { key: 'D', name: 'Level D', type: 'Product', isRequired: false, dependsOn: 'C',
        options: [{ name: 'Opt1', price: 10 }] },
      { key: 'E', name: 'Level E', type: 'Product', isRequired: false, dependsOn: 'D',
        options: [{ name: 'Opt1', price: 10 }] },
    ],
  },
  {
    csvId: 'CFG-029',
    name: `AGENT-TEST-Req-Child-Opt-Parent-${DATE}`,
    code: `AGENT-TEST-CFG-029-${DATE}`,
    basePrice: 100,
    isActive: true,
    sections: [
      { key: 'A', name: 'Add Extras', type: 'Product', isRequired: false, dependsOn: null,
        options: [{ name: 'Extra A', price: 25 }, { name: 'Extra B', price: 35 }] },
      { key: 'B', name: 'Extra Type', type: 'Product', isRequired: true,  dependsOn: 'A',
        options: [{ name: 'Standard', price: 0 }, { name: 'Premium', price: 15 }] },
    ],
  },
];

const filterSpecs = ONLY ? CFG_SPECS.filter(s => s.csvId === ONLY) : CFG_SPECS;
if (!filterSpecs.length) {
  console.error(`ABORT: --only ${ONLY} matched no specs`);
  process.exit(2);
}

console.log(`\n🌱 Phase 3 conditional-cascade seed${DRY_RUN ? ' (DRY RUN)' : ''}`);
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

// --- Helpers (mirror seed-configurable-products.mjs) ---
async function findCatalogByName(name) {
  const r = await api('POST', '/api/catalog/catalogs/search', { keyword: name, take: 5 });
  return (r?.results || []).find(c => c.name === name);
}

async function ensureCatalog() {
  const name = `SEED-${DATE}-Configurables-Cascades`;
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

async function ensurePrice(priceListId, productId, listPrice, salePrice = null) {
  const price = {
    pricelistId: priceListId, productId,
    list: Number(listPrice), currency: 'USD', minQuantity: 1,
  };
  if (salePrice != null) price.sale = Number(salePrice);
  await api('PUT', '/api/products/prices', [{ productId, prices: [price] }], { expectStatus: [200, 204] });
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
  const name = `SEED-${DATE}-Configurables-Cascades-USD`;
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find(p => p?.name === name);
  if (pl) { console.log(`  ↻ pricelist: ${name} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', { name, currency: 'USD', description: 'Seeded for Phase 3 conditional cascades' }, { expectStatus: [200, 201] });
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

/**
 * Two-pass configuration create with dependsOn wiring.
 *
 * Pass 1: POST with all sections, dependsOnSectionId: null
 * Pass 2: GET assigned IDs, build key→sectionId map, PUT with resolved IDs
 *
 * Idempotency: if configuration already exists, GET it and PUT with corrected deps.
 */
async function createOrUpdateConfiguration(productId, sections) {
  const sectionsForCreate = sections.map((s, i) => ({
    name: s.name,
    isRequired: s.isRequired,
    displayOrder: i + 1,
    type: s.type,
    allowCustomText: s.allowCustomText ?? false,
    allowPredefinedOptions: (s.options?.length ?? 0) > 0,
    maxLength: s.maxLength ?? null,
    dependsOnSectionId: null, // wired in Pass 2
    options: (s.options || []).map(o => ({
      productId: o._productId, quantity: 1, text: null,
    })),
  }));

  // Pass 1: create or fetch
  const existing = await api('POST', '/api/catalog/products/configurations/search', {
    productIds: [productId], take: 1,
  }, { expectStatus: [200, 400, 404] });

  let cfg;
  if (existing?.results?.length) {
    cfg = existing.results[0];
    console.log(`  ↻ configuration reused: ${cfg.id}`);
  } else {
    cfg = await api('POST', '/api/catalog/products/configurations', {
      productId, isActive: true, sections: sectionsForCreate,
    });
    console.log(`  ✓ configuration created: ${cfg?.id}`);
  }

  if (DRY_RUN) return cfg;

  // Pass 2: fetch authoritative section IDs, resolve deps, PUT back
  const fresh = await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
  const keyToId = {};
  sections.forEach((spec, i) => {
    const platformSection = fresh.sections.find(p => p.name === spec.name && p.displayOrder === i + 1)
      || fresh.sections[i];
    if (platformSection) keyToId[spec.key] = platformSection.id;
  });
  if (VERBOSE) console.log(`    key→id: ${JSON.stringify(keyToId)}`);

  // Mutate fresh sections in place: set dependsOnSectionId and keep all other fields
  const wired = JSON.parse(JSON.stringify(fresh));
  let changed = false;
  for (const spec of sections) {
    if (!spec.dependsOn) continue;
    const parentId = keyToId[spec.dependsOn];
    if (!parentId) {
      console.log(`    ⚠ ${spec.name}: dependsOn=${spec.dependsOn} unresolved`);
      continue;
    }
    const target = wired.sections.find(s => s.id === keyToId[spec.key]);
    if (target && target.dependsOnSectionId !== parentId) {
      target.dependsOnSectionId = parentId;
      changed = true;
    }
  }
  if (!changed) {
    console.log(`  ↻ dependsOn wiring already correct`);
    return fresh;
  }

  // PUT the whole configuration back. If PUT 404s, fall back to POST (some VC versions upsert via POST).
  let updated;
  try {
    updated = await api('PUT', `/api/catalog/products/configurations/${cfg.id}`, wired, { expectStatus: [200, 204] });
    console.log(`  ✓ dependsOn wired via PUT`);
  } catch (e) {
    if (VERBOSE) console.log(`    PUT failed (${e.message.slice(0, 80)}), trying POST upsert`);
    updated = await api('POST', '/api/catalog/products/configurations', wired, { expectStatus: [200, 201] });
    console.log(`  ✓ dependsOn wired via POST upsert`);
  }
  return updated || fresh;
}

// --- Main per-spec seed ---
async function seedSpec(spec, parentCatalog, parentCategory, childCategory, priceListId, ffcId) {
  console.log(`\n=== ${spec.csvId}: ${spec.name} ===`);

  // 1. Create child products for Product-section options
  //    Include section key in the code/name so specs with same option name in
  //    multiple sections (e.g. CFG-028's "Opt1" across B/C/D/E) don't dedup.
  for (const section of spec.sections) {
    if (section.type !== 'Product') continue;
    for (const opt of section.options) {
      const optSlug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
      const childCode = `${spec.code}-${section.key}-OPT-${optSlug}`;
      const child = await ensureProduct(parentCatalog.id, childCategory.id, {
        name: `AGENT-TEST-${spec.csvId}-${section.key}-${opt.name}`,
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
        await ensureInventory(ffcId, child.id, opt.stock ?? 100);
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

  // 3. Create configuration with two-pass dependsOn wiring
  const cfg = await createOrUpdateConfiguration(parent.id, spec.sections);

  // 4. Link parent into virtual catalog
  if (!DRY_RUN && parent.id && !parent.id.startsWith('dry-')) {
    try {
      await linkProductToVirtualCatalog(parent.id, VIRTUAL_CATALOG_ID);
      console.log(`  ✓ linked into virtual catalog`);
    } catch (e) {
      console.log(`  ⚠ virtual-catalog link: ${e.message.slice(0, 200)}`);
    }
  }

  // Build report
  const sectionReport = (cfg?.sections || []).map(s => ({
    id: s.id, name: s.name, type: s.type, isRequired: s.isRequired,
    dependsOnSectionId: s.dependsOnSectionId, displayOrder: s.displayOrder,
    optionCount: (s.options || []).length,
  }));

  return {
    csvId: spec.csvId,
    name: spec.name,
    parentId: parent.id,
    configurationId: cfg?.id,
    sections: sectionReport,
    options: spec.sections.flatMap(s => (s.options || []).map(o => ({ name: o.name, productId: o._productId }))),
  };
}

async function main() {
  await auth();
  const catalog = await ensureCatalog();
  const parentCategory = await ensureCategory(catalog.id, 'Conditional Parents', `SEED-${DATE}-COND-PARENTS`);
  const childCategory  = await ensureCategory(catalog.id, 'Conditional Options', `SEED-${DATE}-COND-OPTS`);
  const priceList = await findOrCreatePriceList();
  const ffc = await getDefaultFfc();
  if (!ffc?.id && !DRY_RUN) throw new Error('No fulfillment center available');

  // Link parent category to virtual catalog so parents become storefront-visible
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
  console.log(`\n✅ Phase 3: ${ok}/${seeded.length} CFG products seeded`);
  for (const s of seeded) {
    if (s.error) console.log(`  ❌ ${s.csvId}: ${s.error.slice(0, 100)}`);
    else {
      const depWired = (s.sections || []).filter(x => x.dependsOnSectionId).length;
      console.log(`  ✓ ${s.csvId} parent=${s.parentId} config=${s.configurationId} sections=${s.sections?.length} deps=${depWired} options=${s.options.length}`);
    }
  }
}

main().catch(e => { console.error(`\n❌ ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
