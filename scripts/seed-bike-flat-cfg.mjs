#!/usr/bin/env node
/**
 * Seed a flat single-section configurable "Bike" product matching what the
 * 072 suite (CFG-PDP-001/002 …) asserts, after the live "Bike with options"
 * drifted away from the test shape post-2026-05-15 restore.
 *
 *   CFG-032  AGENT-TEST-CFG-Bike-Flat-{DATE}
 *            base $350, one OPTIONAL Product section "Select one" with 4 options:
 *              Rear wheel … motorized  $88  qty 2  (contributes $176)
 *              200CC 250CC 4-Stroke Engine Motor  $225  qty 1
 *              Seat   $15  qty 1
 *              Pedals $14  qty 1
 *            (optional section → storefront renders implicit "None" radio → 5 radios)
 *
 * Mirrors scripts/seed-default-option-cfg.mjs wiring (same catalog, category,
 * pricelist, ffc, virtual-catalog link). Adds per-option quantity support.
 *
 * USAGE: node scripts/seed-bike-flat-cfg.mjs [--verbose]
 * Safety: ENV_RISK gate (blocks production; override --allow-admin-writes-on-prod); idempotent by product code.
 * Writes test-data/_seed-results-bike-flat-{DATE}.json.
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

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const VIRTUAL_CATALOG_ID = aliases?.VIRTUAL_CATALOG_B2B?.id;
if (!VIRTUAL_CATALOG_ID) { console.error('ABORT: VIRTUAL_CATALOG_B2B.id missing'); process.exit(2); }

const DATE = '20260527';
const RESULTS_FILE = join(ROOT, `test-data/_seed-results-bike-flat-${DATE}.json`);
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');

const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();
if (ENV_RISK === 'production' && !args.includes('--allow-admin-writes-on-prod')) { console.error(`ABORT: ENV_RISK=production — refusing to seed; pass --allow-admin-writes-on-prod to override.`); process.exit(2); }

const SPEC = {
  csvId: 'CFG-032',
  name: `AGENT-TEST-CFG-Bike-Flat-${DATE}`,
  code: `AGENT-TEST-CFG-032-${DATE}`,
  basePrice: 350,
  sections: [
    { key: 'A', name: 'Select one', type: 'Product', isRequired: false, dependsOn: null,
      options: [
        { name: 'Rear wheel, 26", double-wall rim, motorized', price: 88, quantity: 2 },
        { name: '200CC 250CC 4-Stroke Engine Motor',          price: 225, quantity: 1 },
        { name: 'Seat',                                        price: 15,  quantity: 1 },
        { name: 'Pedals',                                      price: 14,  quantity: 1 },
      ] },
  ],
};

console.log(`\n🚲 Bike-flat configurable seed`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID} | VCat: ${VIRTUAL_CATALOG_ID}`);
console.log(`   Spec: ${SPEC.csvId} ${SPEC.name}\n`);

let TOKEN = null;
async function auth() {
  const r = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  if (!r.ok) throw new Error(`auth ${r.status}`);
  TOKEN = (await r.json()).access_token;
  console.log('  Auth: OK');
}
async function api(method, path, body, { expectStatus = [200, 201, 204] } = {}) {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  let fetchBody;
  if (body) { headers['Content-Type'] = 'application/json'; fetchBody = JSON.stringify(body); }
  const r = await fetch(`${BACK_URL}${path}`, { method, headers, body: fetchBody });
  if (!expectStatus.includes(r.status)) { const t = await r.text().catch(() => ''); throw new Error(`${method} ${path} → ${r.status}: ${t.slice(0, 600)}`); }
  const ct = r.headers.get('content-type') || '';
  return ct.includes('application/json') ? r.json() : null;
}

async function findCatalogByName(name) {
  const r = await api('POST', '/api/catalog/catalogs/search', { keyword: name, take: 5 });
  return (r?.results || []).find(c => c.name === name);
}
async function ensureCatalog() {
  const name = `SEED-${DATE}-Configurables-Default`;
  let cat = await findCatalogByName(name);
  if (cat) { console.log(`  ↻ catalog ${name} (${cat.id})`); return cat; }
  cat = await api('POST', '/api/catalog/catalogs', { name, isVirtual: false, languages: [{ languageCode: 'en-US', isDefault: true }] });
  console.log(`  ✓ catalog ${name} (${cat?.id})`);
  return cat;
}
async function ensureCategory(catalogId, name, code) {
  const r = await api('POST', '/api/catalog/listentries', { catalog: catalogId, keyword: name, take: 20 }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find(c => c.name === name && c.type === 'category');
  if (found) { console.log(`  ↻ category ${name} (${found.id})`); return { id: found.id, name }; }
  const cat = await api('POST', '/api/catalog/categories', { catalogId, name, code, isActive: true, priority: 1, seoInfos: [{ languageCode: 'en-US', semanticUrl: code.toLowerCase() }] });
  console.log(`  ✓ category ${name} (${cat?.id})`);
  return cat;
}
async function findProductByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { keyword: code, take: 5 }, { expectStatus: [200, 201, 400, 404] });
  const f = (r?.listEntries || r?.results || []).find(p => p.code === code && p.type === 'product');
  return f ? { id: f.id, code, name: f.name } : null;
}
async function ensureProduct(catalogId, categoryId, body) {
  let p = await findProductByCode(body.code);
  if (p) {
    if (p.name !== body.name) {
      const full = await api('GET', `/api/catalog/products/${p.id}`, null, { expectStatus: [200] });
      full.name = body.name;
      await api('POST', '/api/catalog/products', full, { expectStatus: [200, 201, 204] });
      if (VERBOSE) console.log(`    ✎ renamed ${p.id} → ${body.name}`);
    } else if (VERBOSE) console.log(`    ↻ product ${body.name} (${p.id})`);
    return { ...p, name: body.name };
  }
  p = await api('POST', '/api/catalog/products', { catalogId, categoryId, ...body });
  if (VERBOSE) console.log(`    ✓ product ${body.name} (${p?.id})`);
  return p;
}
async function ensurePrice(priceListId, productId, listPrice) {
  await api('PUT', '/api/products/prices', [{ productId, prices: [{ pricelistId: priceListId, productId, list: Number(listPrice), currency: 'USD', minQuantity: 1 }] }], { expectStatus: [200, 204] });
}
async function ensureInventory(ffcId, productId, qty) {
  try {
    await api('PUT', '/api/inventory/plenty', [{ fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0, status: 'Enabled' }], { expectStatus: [200, 204] });
  } catch (e) {
    try { await api('PUT', `/api/inventory/products/${productId}`, { fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0, status: 'Enabled' }, { expectStatus: [200, 204] }); }
    catch (e2) { if (VERBOSE) console.log(`    ⚠ inventory ${productId}: ${e2.message.slice(0, 120)}`); }
  }
}
async function findOrCreatePriceList() {
  const name = `SEED-${DATE}-Configurables-Default-USD`;
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find(p => p?.name === name);
  if (pl) { console.log(`  ↻ pricelist ${name} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', { name, currency: 'USD', description: 'Bike-flat seed' }, { expectStatus: [200, 201] });
  try {
    await api('POST', '/api/pricing/assignments', { name: `${name} → ${STORE_ID}`, pricelistId: pl.id, storeId: STORE_ID, priority: 100 }, { expectStatus: [200, 201] });
    console.log(`  ✓ pricelist + assignment ${name} (${pl.id})`);
  } catch (e) { console.log(`  ⚠ assignment failed: ${e.message.slice(0, 120)}`); }
  return pl;
}
async function getDefaultFfc() {
  const r = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 5 });
  return (r?.results || [])[0];
}
async function linkToVCat(listEntryId, type) {
  await api('POST', '/api/catalog/listentrylinks', [{ listEntryId, listEntryType: type, catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204] });
}

async function createOrUpdateConfiguration(productId, sections) {
  const sectionsForCreate = sections.map((s, i) => ({
    name: s.name, isRequired: s.isRequired, displayOrder: i + 1, type: s.type,
    allowCustomText: s.allowCustomText ?? false,
    allowPredefinedOptions: (s.options?.length ?? 0) > 0, maxLength: s.maxLength ?? null,
    dependsOnSectionId: null,
    options: (s.options || []).map(o => ({ productId: o._productId, quantity: o.quantity ?? 1, text: null, isDefault: !!o.default })),
  }));

  const existing = await api('POST', '/api/catalog/products/configurations/search', { productIds: [productId], take: 1 }, { expectStatus: [200, 400, 404] });
  let cfg;
  if (existing?.results?.length) { cfg = existing.results[0]; console.log(`  ↻ configuration reused ${cfg.id}`); }
  else { cfg = await api('POST', '/api/catalog/products/configurations', { productId, isActive: true, sections: sectionsForCreate }); console.log(`  ✓ configuration created ${cfg?.id}`); }

  // Pass 2: re-assert quantity by matching option productId (in case create normalised it).
  const fresh = await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
  const wired = JSON.parse(JSON.stringify(fresh));
  let changed = false;
  for (const spec of sections) {
    const target = wired.sections.find(s => s.name === spec.name) || wired.sections[sections.indexOf(spec)];
    if (!target) continue;
    for (const opt of (spec.options || [])) {
      const to = (target.options || []).find(o => o.productId === opt._productId);
      if (to && (opt.quantity ?? 1) !== to.quantity) { to.quantity = opt.quantity ?? 1; changed = true; }
    }
  }
  if (!changed) { console.log(`  ↻ option quantities already correct`); return fresh; }

  try { await api('PUT', `/api/catalog/products/configurations/${cfg.id}`, wired, { expectStatus: [200, 204] }); console.log(`  ✓ quantities wired via PUT`); }
  catch (e) { if (VERBOSE) console.log(`    PUT failed (${e.message.slice(0, 60)}), POST upsert`); await api('POST', '/api/catalog/products/configurations', wired, { expectStatus: [200, 201] }); console.log(`  ✓ quantities wired via POST upsert`); }
  return await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
}

async function seedSpec(spec, catalog, parentCat, childCat, priceListId, ffcId) {
  console.log(`\n=== ${spec.csvId}: ${spec.name} ===`);
  for (const section of spec.sections) {
    if (section.type !== 'Product') continue;
    let optIdx = 0;
    for (const opt of section.options) {
      optIdx += 1;
      const optSlug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 20);
      const childCode = `${spec.code}-${section.key}${optIdx}-${optSlug}`;
      const child = await ensureProduct(catalog.id, childCat.id, {
        name: opt.name, code: childCode,
        productType: 'Physical', vendor: 'QA', isActive: true, isBuyable: true, trackInventory: true,
      });
      opt._productId = child.id;
      if (opt.price != null) await ensurePrice(priceListId, child.id, opt.price);
      await ensureInventory(ffcId, child.id, opt.stock ?? 100);
    }
  }
  const parent = await ensureProduct(catalog.id, parentCat.id, {
    name: spec.name, code: spec.code, productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: false,
    seoInfos: [{ languageCode: 'en-US', semanticUrl: spec.code.toLowerCase() }],
  });
  await ensurePrice(priceListId, parent.id, spec.basePrice);
  const cfg = await createOrUpdateConfiguration(parent.id, spec.sections);
  try { await linkToVCat(parent.id, 'product'); console.log('  ✓ linked into virtual catalog'); }
  catch (e) { console.log(`  ⚠ vcat link: ${e.message.slice(0, 160)}`); }

  const sectionReport = (cfg?.sections || []).map(s => ({
    id: s.id, name: s.name, type: s.type, isRequired: s.isRequired,
    dependsOnSectionId: s.dependsOnSectionId, displayOrder: s.displayOrder,
    options: (s.options || []).map(o => ({ id: o.id, productId: o.productId, productName: o.productName, quantity: o.quantity, isDefault: !!o.isDefault })),
  }));
  return { csvId: spec.csvId, name: spec.name, code: spec.code, parentId: parent.id, basePrice: spec.basePrice, configurationId: cfg?.id, sections: sectionReport };
}

async function main() {
  await auth();
  const catalog = await ensureCatalog();
  const parentCat = await ensureCategory(catalog.id, 'Default Option Parents', `SEED-${DATE}-DEF-PARENTS`);
  const childCat  = await ensureCategory(catalog.id, 'Default Option Options', `SEED-${DATE}-DEF-OPTS`);
  const priceList = await findOrCreatePriceList();
  const ffc = await getDefaultFfc();
  if (!ffc?.id) throw new Error('No fulfillment center');

  try { await linkToVCat(parentCat.id, 'category'); console.log('  ✓ parent category linked into virtual catalog'); }
  catch (e) { console.log(`  ⚠ parent-cat link: ${e.message.slice(0, 160)}`); }

  let seeded;
  try { seeded = await seedSpec(SPEC, catalog, parentCat, childCat, priceList.id, ffc.id); }
  catch (e) { console.error(`  ❌ ${SPEC.csvId}: ${e.message.slice(0, 300)}`); seeded = { csvId: SPEC.csvId, error: e.message }; }

  try { await api('POST', '/api/search/indexes/index', [{ documentType: 'CatalogProduct', rebuild: true }], { expectStatus: [200, 204] }); console.log('\n  ✓ reindex (rebuild) triggered'); }
  catch (e) { console.log(`  ⚠ reindex: ${e.message.slice(0, 120)}`); }

  mkdirSync(dirname(RESULTS_FILE), { recursive: true });
  writeFileSync(RESULTS_FILE, JSON.stringify({ date: DATE, platform: BACK_URL, storeId: STORE_ID, catalog: { id: catalog.id, name: catalog.name }, virtualCatalogId: VIRTUAL_CATALOG_ID, seeded: [seeded] }, null, 2));
  console.log(`\nResults: ${RESULTS_FILE}`);
  if (seeded.error) { console.log(`\n❌ ${seeded.csvId}: ${seeded.error.slice(0, 200)}`); process.exit(1); }
  console.log(`\n✅ ${seeded.csvId} parent=${seeded.parentId} config=${seeded.configurationId}`);
  for (const sec of seeded.sections) console.log(`      §${sec.displayOrder} ${sec.name} id=${sec.id} req=${sec.isRequired} opts=[${sec.options.map(o => `${o.productName}×${o.quantity}`).join(', ')}]`);
  console.log(`\n  Next: repoint CFG_BIKE alias → product_id_guid ${seeded.parentId}, add CSV row ${seeded.csvId}.`);
}
main().catch(e => { console.error(`\n❌ ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
