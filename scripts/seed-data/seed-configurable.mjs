#!/usr/bin/env node
/**
 * scripts/seed-data/seed-configurable.mjs
 *
 * SINGLE consolidated seeder for EVERY script-created configurable product in
 * test-data/products/configurable-products.csv (CFG-012..CFG-032 + CFG-FILE).
 * Replaces the four legacy per-family scripts that were ~90% duplicated:
 *   - seed-configurable-products.mjs        (base: 012–021,017,019,FILE)
 *   - seed-conditional-sections-extended.mjs (conditional cascades: 022–029)
 *   - seed-default-option-cfg.mjs           (default option: 030,031)
 *   - seed-bike-flat-cfg.mjs                (per-option quantity: 032)
 *
 * Not governed here: CFG-001..CFG-011 are restored/live env-native products
 * (referenced by name/slug, never created by a seeder) — see the CSV.
 *
 * One spec table + one create/update path covers the full feature union:
 *   Product | Text | File sections · per-option price / salePrice / stock (OOS) /
 *   quantity / isDefault · dependsOn cascade wiring · parent basePrice / salePrice.
 *
 * Idempotency is by product CODE (which embeds the original per-family seed date),
 * so re-running against an already-seeded env reuses entities — never duplicates.
 * Each family keeps its ORIGINAL catalog/category/pricelist names for the same
 * reason; a group is only ensured if a spec in scope uses it.
 *
 * USAGE:
 *   node scripts/seed-data/seed-configurable.mjs [flags]
 *     --dry-run                reads only, no writes
 *     --verbose                log every call
 *     --only CFG-013           seed/teardown a single CSV id
 *     --group base|conditional|default|bike   seed/teardown one family
 *     --teardown               remove seeded products (see teardown notes below)
 *
 * Safety: ENV_RISK gate via seed-common.assertSafeTarget() (blocks production;
 *   override --allow-admin-writes-on-prod). Writes runtime GUIDs (product_id_guid
 *   + configuration_id) to test-data/aliases.{env}.json via syncEnvAliases; no-op
 *   for the primary vcst env (its GUIDs stay curated in aliases.json). See
 *   .claude/rules/test-data.md.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, api, auth, assertSafeTarget, ensureVirtualCatalog, ensureFulfillmentCenter,
  syncEnvAliases, verifyRemoved, log, verbose, DRY_RUN, ONLY, TEARDOWN, BACK_URL, STORE_ID,
} from '../lib/seed-common.mjs';

const PRIMARY_ENV = 'vcst';
const argv = process.argv.slice(2);
const GROUP = argv.includes('--group') ? argv[argv.indexOf('--group') + 1] : null;

let VIRTUAL_CATALOG_ID = null;

// ── Family → catalog-group + naming/slug conventions ─────────────────────────
// catalogGroup: which SEED-* catalog holds this family's products.
// childNaming:  option-product code/name scheme (must match what the legacy
//               script used, or re-runs would create duplicate child products).
// slugFromCode: parent seoInfos.semanticUrl = code.toLowerCase() (default/bike
//               families did this; base/conditional let VC auto-slug from name).
const FAMILY = {
  base:        { catalogGroup: 'main',   childNaming: 'flat',  slugFromCode: false },
  conditional: { catalogGroup: 'cond',   childNaming: 'keyed', slugFromCode: false },
  default:     { catalogGroup: 'deffam', childNaming: 'keyed', slugFromCode: true },
  bike:        { catalogGroup: 'deffam', childNaming: 'bike',  slugFromCode: true },
};

// ── Catalog groups (original names preserved for idempotency) ─────────────────
const GROUPS = {
  main: {
    catalog: 'SEED-20260518-Configurables',
    parentCat: ['Configurable Parents', 'SEED-20260518-CFG-PARENTS'],
    childCat: ['Configurable Options', 'SEED-20260518-CFG-OPTS'],
    pricelist: 'SEED-20260518-Configurables-USD',
  },
  cond: {
    catalog: 'SEED-20260519-Configurables-Cascades',
    parentCat: ['Conditional Parents', 'SEED-20260519-COND-PARENTS'],
    childCat: ['Conditional Options', 'SEED-20260519-COND-OPTS'],
    pricelist: 'SEED-20260519-Configurables-Cascades-USD',
  },
  deffam: {
    catalog: 'SEED-20260527-Configurables-Default',
    parentCat: ['Default Option Parents', 'SEED-20260527-DEF-PARENTS'],
    childCat: ['Default Option Options', 'SEED-20260527-DEF-OPTS'],
    pricelist: 'SEED-20260527-Configurables-Default-USD',
  },
};

// ── Unified spec table ───────────────────────────────────────────────────────
// Source of truth: test-data/products/configurable-products.csv (section_details).
// Section `key` is intra-spec (dependsOn wiring + config create/update mapping).
// `dependsOn` references another section's key; null/absent = root section.
const SPECS = [
  // ---------- base family (date 20260518, catalog SEED-20260518-Configurables) ----------
  { csvId: 'CFG-012', family: 'base', name: 'AGENT-TEST-Config-Bike-20260518', code: 'AGENT-TEST-CFG-012-20260518', basePrice: 100,
    sections: [
      { key: 'A', name: 'Choose Upgrade', type: 'Product', isRequired: false,
        options: [{ name: 'Basic Seat', price: 15 }, { name: 'Premium Seat', price: 45 }, { name: 'Racing Seat', price: 95 }] },
    ] },
  { csvId: 'CFG-013', family: 'base', name: 'AGENT-TEST-Config-Laptop-20260518', code: 'AGENT-TEST-CFG-013-20260518', basePrice: 999,
    sections: [
      { key: 'A', name: 'RAM', type: 'Product', isRequired: true,
        options: [{ name: '8GB', price: 0 }, { name: '16GB', price: 100 }, { name: '32GB', price: 250 }] },
      { key: 'B', name: 'Storage', type: 'Product', isRequired: true,
        options: [{ name: '256GB SSD', price: 0 }, { name: '512GB SSD', price: 75 }, { name: '1TB SSD', price: 150 }] },
    ] },
  { csvId: 'CFG-014', family: 'base', name: 'AGENT-TEST-Config-Sale-Bike-20260518', code: 'AGENT-TEST-CFG-014-20260518', basePrice: 250, salePrice: 200,
    sections: [
      { key: 'A', name: 'Handlebars', type: 'Product', isRequired: false,
        options: [{ name: 'Standard', price: 50, salePrice: 40 }, { name: 'Drop Bar', price: 100, salePrice: 80 }] },
    ] },
  { csvId: 'CFG-015', family: 'base', name: 'AGENT-TEST-Config-OOS-Bike-20260518', code: 'AGENT-TEST-CFG-015-20260518', basePrice: 120,
    sections: [
      { key: 'A', name: 'Frame Color', type: 'Product', isRequired: true,
        options: [
          { name: 'Red', price: 0, stock: 10 }, { name: 'Blue', price: 0, stock: 5 },
          { name: 'Ltd Black', price: 50, stock: 0 }, // OOS option — the point of CFG-015
          { name: 'Silver', price: 25, stock: 8 },
        ] },
    ] },
  { csvId: 'CFG-016', family: 'base', name: 'AGENT-TEST-Config-Checkout-Bike-20260518', code: 'AGENT-TEST-CFG-016-20260518', basePrice: 150,
    sections: [
      { key: 'A', name: 'Wheels', type: 'Product', isRequired: true,
        options: [{ name: 'Standard', price: 0 }, { name: 'Sport', price: 50 }] },
    ] },
  { csvId: 'CFG-017', family: 'base', name: 'AGENT-TEST-Ring-Txt-Cfg-20260518', code: 'AGENT-TEST-CFG-017-20260518', basePrice: 150,
    sections: [
      { key: 'A', name: 'Engraving Text', type: 'Text', isRequired: true, allowCustomText: true, maxLength: 30, options: [] },
    ] },
  { csvId: 'CFG-018', family: 'base', name: 'AGENT-TEST-Config-Custom-Jersey-20260518', code: 'AGENT-TEST-CFG-018-20260518', basePrice: 50,
    sections: [
      { key: 'A', name: 'Size', type: 'Product', isRequired: true,
        options: [{ name: 'Small', price: 0 }, { name: 'Medium', price: 0 }, { name: 'Large', price: 5 }] },
    ] },
  { csvId: 'CFG-019', family: 'base', name: 'AGENT-TEST-Config-Gift-Box-20260518', code: 'AGENT-TEST-CFG-019-20260518', basePrice: 50,
    sections: [
      { key: 'A', name: 'Gift Message', type: 'Text', isRequired: false, allowCustomText: true, maxLength: 100, options: [] },
    ] },
  { csvId: 'CFG-020', family: 'base', name: 'AGENT-TEST-Config-Phone-Case-20260518', code: 'AGENT-TEST-CFG-020-20260518', basePrice: 30,
    sections: [
      { key: 'A', name: 'Case Style', type: 'Product', isRequired: true,
        options: [{ name: 'Clear', price: 0 }, { name: 'Matte', price: 5 }, { name: 'Gloss', price: 8 }] },
      { key: 'B', name: 'Accessories', type: 'Product', isRequired: false,
        options: [{ name: 'Ring', price: 10 }, { name: 'Stand', price: 12 }] },
      { key: 'C', name: 'Custom Name', type: 'Text', isRequired: false, allowCustomText: true, maxLength: 20, options: [] },
    ] },
  { csvId: 'CFG-021', family: 'base', name: 'AGENT-TEST-Config-Custom-Bike-20260518', code: 'AGENT-TEST-CFG-021-20260518', basePrice: 500,
    sections: [
      { key: 'A', name: 'Frame', type: 'Product', isRequired: true,
        options: [{ name: 'Aluminum', price: 0 }, { name: 'Carbon', price: 200 }, { name: 'Steel', price: 50 }] },
      { key: 'B', name: 'Wheels', type: 'Product', isRequired: true,
        options: [{ name: 'Standard', price: 0 }, { name: 'Sport', price: 75 }, { name: 'Pro', price: 150 }] },
      { key: 'C', name: 'Seat', type: 'Product', isRequired: false,
        options: [{ name: 'Basic', price: 0 }, { name: 'Comfort', price: 30 }, { name: 'Racing', price: 60 }] },
    ] },
  { csvId: 'CFG-FILE', family: 'base', name: 'AGENT-TEST-Config-FileUpload-20260518', code: 'AGENT-TEST-CFG-FILE-20260518', basePrice: 80,
    // File-attachment fixture — backs CFG-GQL-055b (VCST-5173 configurationSection type:"File").
    sections: [
      { key: 'A', name: 'Design Upload', type: 'File', isRequired: false, options: [] },
    ] },

  // ---------- conditional family (date 20260519, catalog SEED-20260519-Configurables-Cascades) ----------
  { csvId: 'CFG-022', family: 'conditional', name: 'AGENT-TEST-Config-Conditional-Bike-20260519', code: 'AGENT-TEST-CFG-022-20260519', basePrice: 300,
    sections: [
      { key: 'A', name: 'Frame Type', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Aluminum', price: 0 }, { name: 'Carbon', price: 200 }, { name: 'Steel', price: 50 }] },
      { key: 'B', name: 'Wheel Set', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Standard', price: 25 }, { name: 'Sport', price: 75 }] },
      { key: 'D', name: 'Frame Color', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Black', price: 10 }, { name: 'Red', price: 15 }] },
      { key: 'C', name: 'Tire Type', type: 'Product', isRequired: false, dependsOn: 'B',
        options: [{ name: 'Slick', price: 20 }, { name: 'Knobby', price: 35 }] },
    ] },
  { csvId: 'CFG-023', family: 'conditional', name: 'AGENT-TEST-Wedding-Cake-Cond-20260519', code: 'AGENT-TEST-CFG-023-20260519', basePrice: 81,
    sections: [
      { key: 'Base', name: 'Base', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Top White Bottom White', price: 0 }, { name: 'Top White Bottom Cream', price: 5 }, { name: 'Top Cream Bottom Cream', price: 10 }] },
      { key: 'Creme', name: 'Creme', type: 'Product', isRequired: false, dependsOn: 'Base',
        options: [{ name: 'Buttercreme Peach and Blue', price: 12 }, { name: 'Buttercreme Vanilla', price: 8 }] },
      { key: 'Message', name: 'Message', type: 'Product', isRequired: false, dependsOn: 'Creme',
        options: [{ name: 'Standard Message Tag', price: 12 }, { name: 'Premium Message Tag', price: 20 }] },
      { key: 'Text', name: 'Custom text required', type: 'Text', isRequired: true, dependsOn: 'Message', allowCustomText: true, maxLength: 100, options: [] },
      { key: 'Image', name: 'Image', type: 'File', isRequired: false, dependsOn: 'Message', options: [] },
    ] },
  { csvId: 'CFG-024', family: 'conditional', name: 'AGENT-TEST-Text-Driven-Cond-20260519', code: 'AGENT-TEST-CFG-024-20260519', basePrice: 200,
    sections: [
      { key: 'A', name: 'Engraving Line 1', type: 'Text', isRequired: true, dependsOn: null, allowCustomText: true, maxLength: 60, options: [] },
      { key: 'B', name: 'Style Pack', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Classic', price: 30 }, { name: 'Modern', price: 45 }] },
      { key: 'C', name: 'Accessory', type: 'Product', isRequired: false, dependsOn: 'B',
        options: [{ name: 'Bag', price: 20 }, { name: 'Case', price: 25 }] },
    ] },
  { csvId: 'CFG-025', family: 'conditional', name: 'AGENT-TEST-File-Driven-Cond-20260519', code: 'AGENT-TEST-CFG-025-20260519', basePrice: 180,
    sections: [
      { key: 'A', name: 'Design Upload', type: 'File', isRequired: true, dependsOn: null, options: [] },
      { key: 'B', name: 'Finish Type', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Matte', price: 15 }, { name: 'Gloss', price: 20 }] },
      { key: 'C', name: 'Notes', type: 'Text', isRequired: false, dependsOn: 'B', allowCustomText: true, maxLength: 200, options: [] },
    ] },
  { csvId: 'CFG-026', family: 'conditional', name: 'AGENT-TEST-Req-File-Child-20260519', code: 'AGENT-TEST-CFG-026-20260519', basePrice: 150,
    sections: [
      { key: 'A', name: 'Service Plan', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Basic', price: 0 }, { name: 'Premium', price: 50 }] },
      { key: 'B', name: 'ID Proof', type: 'File', isRequired: true, dependsOn: 'A', options: [] },
    ] },
  { csvId: 'CFG-027', family: 'conditional', name: 'AGENT-TEST-Two-Req-Siblings-20260519', code: 'AGENT-TEST-CFG-027-20260519', basePrice: 120,
    sections: [
      { key: 'A', name: 'Bundle Choice', type: 'Product', isRequired: false, dependsOn: null,
        options: [{ name: 'Bundle A', price: 40 }, { name: 'Bundle B', price: 60 }] },
      { key: 'B', name: 'Size', type: 'Product', isRequired: true, dependsOn: 'A',
        options: [{ name: 'Small', price: 0 }, { name: 'Medium', price: 5 }, { name: 'Large', price: 10 }] },
      { key: 'C', name: 'Color', type: 'Product', isRequired: true, dependsOn: 'A',
        options: [{ name: 'Black', price: 0 }, { name: 'White', price: 0 }, { name: 'Red', price: 5 }] },
    ] },
  { csvId: 'CFG-028', family: 'conditional', name: 'AGENT-TEST-Deep-4-Level-Chain-20260519', code: 'AGENT-TEST-CFG-028-20260519', basePrice: 300,
    sections: [
      { key: 'A', name: 'Level A', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Opt1', price: 20 }, { name: 'Opt2', price: 40 }] },
      { key: 'B', name: 'Level B', type: 'Product', isRequired: false, dependsOn: 'A', options: [{ name: 'Opt1', price: 10 }] },
      { key: 'C', name: 'Level C', type: 'Product', isRequired: false, dependsOn: 'B', options: [{ name: 'Opt1', price: 10 }] },
      { key: 'D', name: 'Level D', type: 'Product', isRequired: false, dependsOn: 'C', options: [{ name: 'Opt1', price: 10 }] },
      { key: 'E', name: 'Level E', type: 'Product', isRequired: false, dependsOn: 'D', options: [{ name: 'Opt1', price: 10 }] },
    ] },
  { csvId: 'CFG-029', family: 'conditional', name: 'AGENT-TEST-Req-Child-Opt-Parent-20260519', code: 'AGENT-TEST-CFG-029-20260519', basePrice: 100,
    sections: [
      { key: 'A', name: 'Add Extras', type: 'Product', isRequired: false, dependsOn: null,
        options: [{ name: 'Extra A', price: 25 }, { name: 'Extra B', price: 35 }] },
      { key: 'B', name: 'Extra Type', type: 'Product', isRequired: true, dependsOn: 'A',
        options: [{ name: 'Standard', price: 0 }, { name: 'Premium', price: 15 }] },
    ] },

  // ---------- default family (date 20260527, catalog SEED-20260527-Configurables-Default) ----------
  { csvId: 'CFG-030', family: 'default', name: 'AGENT-TEST-CFG-Default-Flat-20260527', code: 'AGENT-TEST-CFG-030-20260527', basePrice: 100,
    sections: [
      { key: 'A', name: 'Frame Material', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Aluminum', price: 0 }, { name: 'Carbon', price: 200, default: true }, { name: 'Steel', price: 50 }] },
    ] },
  { csvId: 'CFG-031', family: 'default', name: 'AGENT-TEST-CFG-Default-Cond-20260527', code: 'AGENT-TEST-CFG-031-20260527', basePrice: 150,
    sections: [
      { key: 'A', name: 'Base Choice', type: 'Product', isRequired: true, dependsOn: null,
        options: [{ name: 'Standard', price: 0, default: true }, { name: 'Deluxe', price: 80 }] },
      { key: 'B', name: 'Add-on', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [{ name: 'Warranty', price: 25, default: true }, { name: 'Case', price: 15 }] },
    ] },

  // ---------- bike family (date 20260527, shares SEED-20260527-Configurables-Default) ----------
  { csvId: 'CFG-032', family: 'bike', name: 'AGENT-TEST-CFG-Bike-Flat-20260527', code: 'AGENT-TEST-CFG-032-20260527', basePrice: 350,
    sections: [
      { key: 'A', name: 'Select one', type: 'Product', isRequired: false, dependsOn: null,
        options: [
          { name: 'Rear wheel, 26", double-wall rim, motorized', price: 88, quantity: 2 },
          { name: '200CC 250CC 4-Stroke Engine Motor', price: 225, quantity: 1 },
          { name: 'Seat', price: 15, quantity: 1 },
          { name: 'Pedals', price: 14, quantity: 1 },
        ] },
    ] },
];

// ── Spec selection ───────────────────────────────────────────────────────────
let specs = SPECS;
if (ONLY) specs = specs.filter(s => s.csvId === ONLY);
if (GROUP) {
  const g = GROUP.toLowerCase();
  const alias = { cond: 'conditional', cascades: 'conditional', def: 'default', 'phase1': 'base' };
  const fam = alias[g] || g;
  specs = specs.filter(s => s.family === fam);
}
if (!specs.length) { console.error(`ABORT: no specs match ${ONLY ? `--only ${ONLY}` : ''}${GROUP ? ` --group ${GROUP}` : ''}`); process.exit(2); }

console.log(`\n🌱 Seed Configurable Products${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}`);
console.log(`   Specs (${specs.length}): ${specs.map(s => s.csvId).join(', ')}\n`);

// ── Helpers ──────────────────────────────────────────────────────────────────
async function findCatalogByName(name) {
  const r = await api('POST', '/api/catalog/catalogs/search', { keyword: name, take: 5 });
  return (r?.results || []).find(c => c.name === name);
}
async function ensureCatalog(name) {
  let cat = await findCatalogByName(name);
  if (cat) { log(`↻ catalog: ${name} (${cat.id})`); return cat; }
  cat = await api('POST', '/api/catalog/catalogs', { name, isVirtual: false, languages: [{ languageCode: 'en-US', isDefault: true }] });
  log(`✓ catalog: ${name} (${cat?.id})`);
  return cat;
}
async function ensureCategory(catalogId, name, code) {
  const r = await api('POST', '/api/catalog/listentries', { catalog: catalogId, keyword: name, take: 20 }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find(c => c.name === name && c.type === 'category');
  if (found) { log(`↻ category: ${name} (${found.id})`); return { id: found.id, name }; }
  const cat = await api('POST', '/api/catalog/categories', {
    catalogId, name, code, isActive: true, priority: 1,
    seoInfos: [{ languageCode: 'en-US', semanticUrl: code.toLowerCase() }],
  });
  log(`✓ category: ${name} (${cat?.id})`);
  return cat;
}
async function findProductByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { keyword: code, take: 5 }, { expectStatus: [200, 201, 400, 404] });
  const f = (r?.listEntries || r?.results || []).find(p => p.code === code && p.type === 'product');
  return f ? { id: f.id, code, name: f.name } : null;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function ensureProduct(catalogId, categoryId, body) {
  let p = await findProductByCode(body.code);
  if (p) { verbose(`↻ product: ${body.name} (${p.id})`); return p; }
  try {
    p = await api('POST', '/api/catalog/products', { catalogId, categoryId, ...body });
    verbose(`✓ product: ${body.name} (${p?.id})`);
    return p;
  } catch (e) {
    // The product exists in the DB but the search index lagged, so findProductByCode
    // missed it and we tried to re-insert (unique IX_Code_CatalogId). Poll the index
    // until it catches up and reuse the existing row rather than failing the spec.
    if (/duplicate key|IX_Code_CatalogId/i.test(e.message)) {
      for (let i = 0; i < 12; i++) {
        await sleep(5000);
        const found = await findProductByCode(body.code);
        if (found) { verbose(`↻ recovered ${body.code} after index lag (${(i + 1) * 5}s)`); return found; }
      }
    }
    throw e;
  }
}
async function ensurePrice(priceListId, productId, listPrice, salePrice = null) {
  const price = { pricelistId: priceListId, productId, list: Number(listPrice), currency: 'USD', minQuantity: 1 };
  if (salePrice != null) price.sale = Number(salePrice);
  await api('PUT', '/api/products/prices', [{ productId, prices: [price] }], { expectStatus: [200, 204] });
}
async function ensureInventory(ffcId, productId, qty) {
  // PUT /plenty defaults to status=Disabled → xAPI addItem silently no-ops
  // (feedback_xapi_additem_silent_disabled). Must set status:'Enabled'.
  try {
    await api('PUT', '/api/inventory/plenty', [{ fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0, status: 'Enabled' }], { expectStatus: [200, 204] });
  } catch {
    try { await api('PUT', `/api/inventory/products/${productId}`, { fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0, status: 'Enabled' }, { expectStatus: [200, 204] }); }
    catch (e2) { verbose(`⚠ inventory ${productId}: ${e2.message.slice(0, 120)}`); }
  }
}
async function findOrCreatePriceList(name) {
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find(p => p?.name === name);
  if (pl) { log(`↻ pricelist: ${name} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', { name, currency: 'USD', description: 'Seeded for configurable products test data' }, { expectStatus: [200, 201] });
  try {
    await api('POST', '/api/pricing/assignments', { name: `${name} → ${STORE_ID}`, pricelistId: pl.id, storeId: STORE_ID, priority: 100 }, { expectStatus: [200, 201] });
    log(`✓ pricelist + store assignment: ${name} (${pl.id})`);
  } catch (e) { log(`⚠ pricelist created but assignment failed: ${e.message.slice(0, 150)}`); }
  return pl;
}
async function linkToVCat(listEntryId, type) {
  await api('POST', '/api/catalog/listentrylinks', [{ listEntryId, listEntryType: type, catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204] });
}
// Link a product UNDER a category in the virtual catalog. VC's CategoryLink targets
// the catalog ROOT when categoryId is omitted (TargetId => Category?.Id ?? Catalog?.Id),
// so a bare catalog link scatters every product at the B2B-mixed root. We first drop any
// stale root link (categoryId null) for this product, then link it under `categoryId` so
// it nests beneath its seed category. Both /delete and add are idempotent server-side.
async function linkProductToCategory(productId, categoryId) {
  await api('POST', '/api/catalog/listentrylinks/delete', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID,
  }], { expectStatus: [200, 204, 404] }).catch(() => {});
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID, categoryId,
  }], { expectStatus: [200, 204] });
}
// Nest a (physical) category UNDER a parent category in the virtual catalog, dropping any
// stale root link so it doesn't appear at both the root and under the parent.
async function linkCategoryUnder(childCategoryId, parentCategoryId) {
  await api('POST', '/api/catalog/listentrylinks/delete', [{
    listEntryId: childCategoryId, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID,
  }], { expectStatus: [200, 204, 404] }).catch(() => {});
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: childCategoryId, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID, categoryId: parentCategoryId,
  }], { expectStatus: [200, 204] });
}
// Resolve the storefront "Products with options" category that the CFG family
// subcategories nest under. Resolved by NAME at runtime within the virtual catalog
// (never a hardcoded GUID — see .claude/rules/test-data.md); created as a native
// virtual category if a fresh env doesn't have it yet.
let PWO_CATEGORY_ID = null;
async function ensureProductsWithOptionsCategory() {
  if (PWO_CATEGORY_ID) return PWO_CATEGORY_ID;
  const name = 'Products with options';
  const r = await api('POST', '/api/catalog/listentries', { catalogId: VIRTUAL_CATALOG_ID, keyword: name, take: 50 }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find(c => c.type === 'category' && (c.name || '').toLowerCase() === name.toLowerCase() && c.catalogId === VIRTUAL_CATALOG_ID);
  if (found) { PWO_CATEGORY_ID = found.id; log(`↻ VC category: ${name} (${found.id})`); return PWO_CATEGORY_ID; }
  const c = await api('POST', '/api/catalog/categories', {
    catalogId: VIRTUAL_CATALOG_ID, name, code: 'products-with-options', isActive: true, priority: 1,
    seoInfos: [{ languageCode: 'en-US', semanticUrl: 'products-with-options' }],
  }, { expectStatus: [200, 201] });
  PWO_CATEGORY_ID = c?.id; log(`✓ VC category created: ${name} (${c?.id})`);
  return PWO_CATEGORY_ID;
}

// --- Primary-env CSV writeback -----------------------------------------------
// On the PRIMARY env (vcst), syncEnvAliases is a no-op — the canonical CFG GUIDs
// live in the committed configurable-products.csv (product_id_guid + configuration_id),
// which the CSV-backed CFG_* aliases resolve against. A delete+reseed mints NEW GUIDs,
// so without this the CSV would go stale and every @td(CFG_*.id) would break. Mirrors
// the users.csv platform_id writeback in user-provision.mjs. Only writes when a value
// actually changed (idempotent reseeds reuse the same GUIDs → no file churn).
const CSV_REL = 'test-data/products/configurable-products.csv';
function parseCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { out.push(cur); cur = ''; } else cur += ch; }
  }
  out.push(cur); return out;
}
function escapeCsvField(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function writeCsvGuids(byKey) {
  const env = process.env.TEST_ENV || PRIMARY_ENV;
  if (env !== PRIMARY_ENV || DRY_RUN || !byKey || !Object.keys(byKey).length) return;
  const path = join(ROOT, CSV_REL);
  const raw = readFileSync(path, 'utf-8');
  const eol = raw.includes('\r\n') ? '\r\n' : '\n';
  const lines = raw.split(/\r?\n/);
  const trailing = lines[lines.length - 1] === '' ? eol : '';
  if (trailing) lines.pop();
  const header = parseCsvLine(lines[0]);
  const idIdx = header.indexOf('product_id');
  const guidIdx = header.indexOf('product_id_guid');
  const cfgIdx = header.indexOf('configuration_id');
  let changed = 0;
  const out = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { out.push(line); continue; }
    const f = parseCsvLine(line);
    if (f.length !== header.length) { out.push(line); continue; }
    const upd = byKey[f[idIdx]];
    if (!upd) { out.push(line); continue; }
    let rowChanged = false;
    if (upd.product_id_guid && f[guidIdx] !== upd.product_id_guid) { f[guidIdx] = upd.product_id_guid; rowChanged = true; }
    if (cfgIdx >= 0 && upd.configuration_id && f[cfgIdx] !== upd.configuration_id) { f[cfgIdx] = upd.configuration_id; rowChanged = true; }
    if (rowChanged) changed++;
    out.push(f.map(escapeCsvField).join(','));
  }
  if (changed) { writeFileSync(path, out.join(eol) + trailing, 'utf-8'); log(`✓ wrote ${changed} row(s) to ${CSV_REL} (product_id_guid + configuration_id)`); }
  else verbose('CSV GUIDs already current — no write');
}

// Option-product code/name — MUST match the legacy family scheme or a re-run
// creates duplicate child products instead of reusing them.
function childIdentity(spec, section, opt, idx) {
  const naming = FAMILY[spec.family].childNaming;
  if (naming === 'flat') {
    const slug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
    return { code: `${spec.code}-OPT-${slug}`, name: `AGENT-TEST-${spec.csvId}-${opt.name}` };
  }
  if (naming === 'bike') {
    const slug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 20);
    return { code: `${spec.code}-${section.key}${idx}-${slug}`, name: opt.name };
  }
  // keyed (conditional / default) — section key in code + name so same option name
  // across sections (e.g. CFG-028 "Opt1" in B/C/D/E) doesn't collide.
  const slug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
  return { code: `${spec.code}-${section.key}-OPT-${slug}`, name: `AGENT-TEST-${spec.csvId}-${section.key}-${opt.name}` };
}

/**
 * Create-or-update the product configuration. Handles the full feature union in
 * one two-pass flow:
 *   Pass 1 — POST all sections (dependsOnSectionId:null), options carry
 *            productId/quantity/text/isDefault. Reuse an existing config if present.
 *   Pass 2 — GET authoritative section IDs, then wire dependsOn + re-assert
 *            isDefault + re-assert quantity by matching option productId. PUT the
 *            whole config back (POST upsert fallback — PUT 404s on some VC builds).
 * Flat specs with no deps/defaults/non-1 quantities compute no change and skip Pass 2's write.
 */
async function createOrUpdateConfiguration(productId, sections) {
  const sectionsForCreate = sections.map((s, i) => ({
    name: s.name, isRequired: s.isRequired, displayOrder: i + 1, type: s.type,
    allowCustomText: s.allowCustomText ?? false,
    allowPredefinedOptions: (s.options?.length ?? 0) > 0,
    maxLength: s.maxLength ?? null,
    dependsOnSectionId: null, // wired in Pass 2
    options: (s.options || []).map(o => ({ productId: o._productId, quantity: o.quantity ?? 1, text: null, isDefault: !!o.default })),
  }));

  const existing = await api('POST', '/api/catalog/products/configurations/search', { productIds: [productId], take: 1 }, { expectStatus: [200, 400, 404] });
  let cfg;
  if (existing?.results?.length) { cfg = existing.results[0]; log(`↻ configuration reused: ${cfg.id}`); }
  else { cfg = await api('POST', '/api/catalog/products/configurations', { productId, isActive: true, sections: sectionsForCreate }); log(`✓ configuration created: ${cfg?.id}`); }

  if (DRY_RUN) return cfg;

  // Pass 2: resolve section IDs, wire deps + re-assert defaults/quantities.
  const fresh = await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
  const keyToId = {};
  sections.forEach((spec, i) => {
    const ps = fresh.sections.find(p => p.name === spec.name && p.displayOrder === i + 1) || fresh.sections[i];
    if (ps) keyToId[spec.key] = ps.id;
  });
  verbose(`key→id: ${JSON.stringify(keyToId)}`);

  const wired = JSON.parse(JSON.stringify(fresh));
  let changed = false;
  for (const spec of sections) {
    const target = wired.sections.find(s => s.id === keyToId[spec.key]);
    if (!target) continue;
    if (spec.dependsOn) {
      const parentId = keyToId[spec.dependsOn];
      if (parentId && target.dependsOnSectionId !== parentId) { target.dependsOnSectionId = parentId; changed = true; }
      else if (!parentId) log(`⚠ ${spec.name}: dependsOn=${spec.dependsOn} unresolved`);
    }
    for (const opt of (spec.options || [])) {
      const to = (target.options || []).find(o => o.productId === opt._productId);
      if (!to) continue;
      if (!!to.isDefault !== !!opt.default) { to.isDefault = !!opt.default; changed = true; }
      const q = opt.quantity ?? 1;
      if (to.quantity !== q) { to.quantity = q; changed = true; }
    }
  }
  if (!changed) { log(`↻ configuration wiring already correct`); return fresh; }

  try { await api('PUT', `/api/catalog/products/configurations/${cfg.id}`, wired, { expectStatus: [200, 204] }); log(`✓ configuration wired via PUT`); }
  catch (e) { verbose(`PUT failed (${e.message.slice(0, 60)}), POST upsert`); await api('POST', '/api/catalog/products/configurations', wired, { expectStatus: [200, 201] }); log(`✓ configuration wired via POST upsert`); }
  return await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
}

// ── Per-spec seed ────────────────────────────────────────────────────────────
async function seedSpec(spec, ctx, ffcId) {
  console.log(`\n=== ${spec.csvId}: ${spec.name} ===`);
  const { catalog, parentCat, childCat, priceList } = ctx;
  const slugFromCode = FAMILY[spec.family].slugFromCode;

  // 1. child option products
  for (const section of spec.sections) {
    if (section.type !== 'Product') continue;
    let idx = 0;
    for (const opt of section.options) {
      idx += 1;
      const { code, name } = childIdentity(spec, section, opt, idx);
      const child = await ensureProduct(catalog.id, childCat.id, {
        name, code, productType: 'Physical', vendor: 'QA', isActive: true, isBuyable: true, trackInventory: true,
      });
      opt._productId = child.id;
      if (!DRY_RUN && !String(child.id).startsWith('dry-')) {
        if (opt.price != null) await ensurePrice(priceList.id, child.id, opt.price, opt.salePrice ?? null);
        await ensureInventory(ffcId, child.id, opt.stock ?? 100);
      }
    }
  }

  // 2. parent configurable product
  const parentBody = {
    name: spec.name, code: spec.code, productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: false,
  };
  if (slugFromCode) parentBody.seoInfos = [{ languageCode: 'en-US', semanticUrl: spec.code.toLowerCase() }];
  const parent = await ensureProduct(catalog.id, parentCat.id, parentBody);
  if (!DRY_RUN && !String(parent.id).startsWith('dry-')) await ensurePrice(priceList.id, parent.id, spec.basePrice, spec.salePrice ?? null);

  // 3. configuration
  const cfg = await createOrUpdateConfiguration(parent.id, spec.sections);

  // 4. link parent into the virtual catalog UNDER its seed category (not the root)
  if (!DRY_RUN && !String(parent.id).startsWith('dry-')) {
    try { await linkProductToCategory(parent.id, parentCat.id); log(`✓ linked under category ${parentCat.name}`); }
    catch (e) { log(`⚠ virtual-catalog link: ${e.message.slice(0, 160)}`); }
  }

  const sectionReport = (cfg?.sections || []).map(s => ({
    id: s.id, name: s.name, type: s.type, isRequired: s.isRequired,
    dependsOnSectionId: s.dependsOnSectionId, displayOrder: s.displayOrder,
    options: (s.options || []).map(o => ({ productName: o.productName, quantity: o.quantity, isDefault: !!o.isDefault })),
  }));
  return { csvId: spec.csvId, name: spec.name, parentId: parent.id, configurationId: cfg?.id, sections: sectionReport };
}

// ── Group context cache (ensure a catalog group only once, and only if used) ──
const groupCtx = {};
async function ctxFor(groupKey) {
  if (groupCtx[groupKey]) return groupCtx[groupKey];
  const g = GROUPS[groupKey];
  log(`\n─── catalog group: ${g.catalog} ───`);
  const catalog = await ensureCatalog(g.catalog);
  const parentCat = await ensureCategory(catalog.id, g.parentCat[0], g.parentCat[1]);
  const childCat = await ensureCategory(catalog.id, g.childCat[0], g.childCat[1]);
  const priceList = await findOrCreatePriceList(g.pricelist);
  if (!DRY_RUN && parentCat.id && !String(parentCat.id).startsWith('dry-')) {
    try { await linkCategoryUnder(parentCat.id, PWO_CATEGORY_ID); log(`✓ ${parentCat.name} nested under "Products with options"`); }
    catch (e) { log(`⚠ parent-category link: ${e.message.slice(0, 160)}`); }
  }
  groupCtx[groupKey] = { catalog, parentCat, childCat, priceList };
  return groupCtx[groupKey];
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  assertSafeTarget();
  await auth();
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  log(`Virtual catalog: ${VIRTUAL_CATALOG_ID}`);
  await ensureProductsWithOptionsCategory();
  const ffc = await ensureFulfillmentCenter(api);
  if (!ffc?.id && !DRY_RUN) throw new Error('No fulfillment center available');

  const seeded = [];
  for (const spec of specs) {
    try {
      const ctx = await ctxFor(FAMILY[spec.family].catalogGroup);
      seeded.push(await seedSpec(spec, ctx, ffc?.id));
    } catch (e) {
      console.error(`  ❌ ${spec.csvId}: ${e.message.slice(0, 300)}`);
      seeded.push({ csvId: spec.csvId, error: e.message });
    }
  }

  if (!DRY_RUN) {
    try { await api('POST', '/api/search/indexes/index', [{ documentType: 'CatalogProduct', rebuild: false }], { expectStatus: [200, 204] }); log(`\n✓ reindex triggered`); }
    catch (e) { log(`⚠ reindex: ${e.message.slice(0, 100)}`); }

    // Persist runtime GUIDs to aliases.<env>.json (product_id_guid + configuration_id).
    // Business keys / names / slugs stay in the committed CSV. No-op for primary vcst.
    const byKey = {};
    for (const s of seeded) if (!s.error) byKey[s.csvId] = { product_id_guid: s.parentId, configuration_id: s.configurationId };
    syncEnvAliases('products/configurable-products', byKey); // non-primary envs → aliases.{env}.json
    writeCsvGuids(byKey);                                    // primary vcst → committed CSV columns
  }

  const ok = seeded.filter(s => !s.error).length;
  console.log(`\n✅ ${ok}/${seeded.length} CFG products seeded`);
  for (const s of seeded) {
    if (s.error) { console.log(`  ❌ ${s.csvId}: ${s.error.slice(0, 120)}`); continue; }
    const deps = (s.sections || []).filter(x => x.dependsOnSectionId).length;
    console.log(`  ✓ ${s.csvId} parent=${s.parentId} config=${s.configurationId} sections=${s.sections?.length ?? 0} deps=${deps}`);
    for (const sec of (s.sections || [])) {
      const defs = sec.options.filter(o => o.isDefault).map(o => o.productName);
      const extra = [
        sec.dependsOnSectionId ? `dep=${sec.dependsOnSectionId}` : null,
        defs.length ? `default=[${defs.join(',')}]` : null,
      ].filter(Boolean).join(' ');
      verbose(`  §${sec.displayOrder} ${sec.name} (${sec.type}) req=${sec.isRequired} ${extra}`);
    }
  }
}

// ── Teardown ─────────────────────────────────────────────────────────────────
// Full teardown (no --only): delete each touched catalog group + its pricelist —
// deleting the non-virtual catalog cascades all parents + child options.
// --only <id>: delete just that one parent product by code (siblings/catalog kept).
async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 Configurable products teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);

  if (ONLY) {
    const spec = specs[0];
    const p = await findProductByCode(spec.code);
    if (p?.id) {
      await api('POST', '/api/catalog/listentries/delete', { ids: [p.id], objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] }).catch(e => log(`⚠ delete: ${e.message.slice(0, 120)}`));
      log(`✗ deleted parent ${spec.csvId} (${p.id}) — child options + catalog preserved (partial teardown)`);
    } else log(`– ${spec.csvId} not found`);
  } else {
    const groupKeys = [...new Set(specs.map(s => FAMILY[s.family].catalogGroup))];
    for (const gk of groupKeys) {
      const g = GROUPS[gk];
      const plSearch = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(g.pricelist)}`, null, { expectStatus: [200, 404] });
      const plIds = (plSearch?.results || []).filter(p => p?.name === g.pricelist).map(p => p.id);
      if (plIds.length) await api('DELETE', `/api/pricing/pricelists?ids=${plIds.join(',')}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
      const cat = await findCatalogByName(g.catalog);
      if (cat?.id) { await api('DELETE', `/api/catalog/catalogs/${cat.id}`, null, { expectStatus: [200, 204, 404] }).catch(e => log(`⚠ catalog delete: ${e.message.slice(0, 120)}`)); log(`✗ deleted catalog ${g.catalog} (cascades children)`); }
      else log(`– catalog ${g.catalog} not found`);
    }
  }

  const residual = await verifyRemoved(async () => {
    const out = [];
    for (const spec of specs) { const p = await findProductByCode(spec.code); if (p?.id) out.push(p.id); }
    return out;
  });
  console.log(residual === 0 ? `\n✅ Teardown verified — 0 parents remain` : `\n⚠ Teardown incomplete — ${residual} parent(s) still present`);
  if (residual > 0 && !DRY_RUN && !ONLY) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch(e => { console.error(`\n❌ ${e.message}`); if (process.argv.includes('--verbose')) console.error(e.stack); process.exit(1); });
