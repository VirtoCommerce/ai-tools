#!/usr/bin/env node
/**
 * VCST-4715: seed two configurable products with the default-option feature
 * (option.isDefault=true) into vcst-qa.
 *
 *   CFG-030  AGENT-TEST-CFG-Default-Flat-{DATE}  — one required Product section,
 *            3 options, exactly one isDefault.
 *   CFG-031  AGENT-TEST-CFG-Default-Cond-{DATE}  — parent Product section (required,
 *            one isDefault) + dependent Product section (dependsOn parent, one isDefault).
 *
 * Mirrors scripts/seed-conditional-sections-extended.mjs wiring (same catalog,
 * category, pricelist, ffc, virtual-catalog link, two-pass dependsOn). Adds
 * option.isDefault. Server keeps only the FIRST isDefault per section, so we
 * submit exactly one default per section.
 *
 * USAGE: node scripts/seed-default-option-cfg.mjs [--verbose] [--only CFG-030]
 * Safety: host allowlist (vcst-qa, vcptcore-qa); idempotent by product code.
 * Writes test-data/_seed-results-cfg-default-{DATE}.json.
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

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const VIRTUAL_CATALOG_ID = aliases?.VIRTUAL_CATALOG_B2B?.id;
if (!VIRTUAL_CATALOG_ID) { console.error('ABORT: VIRTUAL_CATALOG_B2B.id missing'); process.exit(2); }

const DATE = '20260527';
const RESULTS_FILE = join(ROOT, `test-data/_seed-results-cfg-default-${DATE}.json`);
const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;

const ALLOWED_HOSTS = ['vcst-qa.govirto.com', 'vcptcore-qa.govirto.com'];
if (!ALLOWED_HOSTS.includes(new URL(BACK_URL).host)) { console.error('ABORT: host not allowlisted'); process.exit(2); }

// key = intra-spec id for dependsOn wiring; default:true marks the default option.
const CFG_SPECS = [
  {
    csvId: 'CFG-030',
    name: `AGENT-TEST-CFG-Default-Flat-${DATE}`,
    code: `AGENT-TEST-CFG-030-${DATE}`,
    basePrice: 100,
    sections: [
      { key: 'A', name: 'Frame Material', type: 'Product', isRequired: true, dependsOn: null,
        options: [
          { name: 'Aluminum', price: 0, default: false },
          { name: 'Carbon',   price: 200, default: true },
          { name: 'Steel',    price: 50, default: false },
        ] },
    ],
  },
  {
    csvId: 'CFG-031',
    name: `AGENT-TEST-CFG-Default-Cond-${DATE}`,
    code: `AGENT-TEST-CFG-031-${DATE}`,
    basePrice: 150,
    sections: [
      { key: 'A', name: 'Base Choice', type: 'Product', isRequired: true, dependsOn: null,
        options: [
          { name: 'Standard', price: 0, default: true },
          { name: 'Deluxe',   price: 80, default: false },
        ] },
      { key: 'B', name: 'Add-on', type: 'Product', isRequired: false, dependsOn: 'A',
        options: [
          { name: 'Warranty', price: 25, default: true },
          { name: 'Case',     price: 15, default: false },
        ] },
    ],
  },
];

const specs = ONLY ? CFG_SPECS.filter(s => s.csvId === ONLY) : CFG_SPECS;
if (!specs.length) { console.error(`ABORT: --only ${ONLY} matched nothing`); process.exit(2); }

console.log(`\n🌱 VCST-4715 default-option seed`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID} | VCat: ${VIRTUAL_CATALOG_ID}`);
console.log(`   Specs: ${specs.map(s => s.csvId).join(', ')}\n`);

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
  if (p) { if (VERBOSE) console.log(`    ↻ product ${body.name} (${p.id})`); return p; }
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
  pl = await api('POST', '/api/pricing/pricelists', { name, currency: 'USD', description: 'VCST-4715 default-option seed' }, { expectStatus: [200, 201] });
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
    options: (s.options || []).map(o => ({ productId: o._productId, quantity: 1, text: null, isDefault: !!o.default })),
  }));

  const existing = await api('POST', '/api/catalog/products/configurations/search', { productIds: [productId], take: 1 }, { expectStatus: [200, 400, 404] });
  let cfg;
  if (existing?.results?.length) { cfg = existing.results[0]; console.log(`  ↻ configuration reused ${cfg.id}`); }
  else { cfg = await api('POST', '/api/catalog/products/configurations', { productId, isActive: true, sections: sectionsForCreate }); console.log(`  ✓ configuration created ${cfg?.id}`); }

  // Pass 2: resolve section IDs, wire dependsOn + re-assert isDefault, PUT (fallback POST upsert).
  const fresh = await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
  const keyToId = {};
  sections.forEach((spec, i) => {
    const ps = fresh.sections.find(p => p.name === spec.name && p.displayOrder === i + 1) || fresh.sections[i];
    if (ps) keyToId[spec.key] = ps.id;
  });
  if (VERBOSE) console.log(`    key→id ${JSON.stringify(keyToId)}`);

  const wired = JSON.parse(JSON.stringify(fresh));
  let changed = false;
  for (const spec of sections) {
    const target = wired.sections.find(s => s.id === keyToId[spec.key]);
    if (!target) continue;
    // dependsOn
    if (spec.dependsOn) {
      const parentId = keyToId[spec.dependsOn];
      if (parentId && target.dependsOnSectionId !== parentId) { target.dependsOnSectionId = parentId; changed = true; }
    }
    // re-assert isDefault by matching option productId (in case create dropped it)
    for (const opt of (spec.options || [])) {
      const to = (target.options || []).find(o => o.productId === opt._productId);
      if (to && !!to.isDefault !== !!opt.default) { to.isDefault = !!opt.default; changed = true; }
    }
  }
  if (!changed) { console.log(`  ↻ wiring + defaults already correct`); return fresh; }

  let updated;
  try { updated = await api('PUT', `/api/catalog/products/configurations/${cfg.id}`, wired, { expectStatus: [200, 204] }); console.log(`  ✓ wired via PUT`); }
  catch (e) { if (VERBOSE) console.log(`    PUT failed (${e.message.slice(0, 60)}), POST upsert`); updated = await api('POST', '/api/catalog/products/configurations', wired, { expectStatus: [200, 201] }); console.log(`  ✓ wired via POST upsert`); }
  // GET final authoritative state
  return await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
}

async function seedSpec(spec, catalog, parentCat, childCat, priceListId, ffcId) {
  console.log(`\n=== ${spec.csvId}: ${spec.name} ===`);
  // 1. option products
  for (const section of spec.sections) {
    if (section.type !== 'Product') continue;
    for (const opt of section.options) {
      const optSlug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
      const childCode = `${spec.code}-${section.key}-OPT-${optSlug}`;
      const child = await ensureProduct(catalog.id, childCat.id, {
        name: `AGENT-TEST-${spec.csvId}-${section.key}-${opt.name}`, code: childCode,
        productType: 'Physical', vendor: 'QA', isActive: true, isBuyable: true, trackInventory: true,
      });
      opt._productId = child.id;
      if (opt.price != null) await ensurePrice(priceListId, child.id, opt.price);
      await ensureInventory(ffcId, child.id, opt.stock ?? 100);
    }
  }
  // 2. parent configurable
  const parent = await ensureProduct(catalog.id, parentCat.id, {
    name: spec.name, code: spec.code, productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: false,
    seoInfos: [{ languageCode: 'en-US', semanticUrl: spec.code.toLowerCase() }],
  });
  await ensurePrice(priceListId, parent.id, spec.basePrice);
  // 3. configuration
  const cfg = await createOrUpdateConfiguration(parent.id, spec.sections);
  // 4. link parent into virtual catalog
  try { await linkToVCat(parent.id, 'product'); console.log('  ✓ linked into virtual catalog'); }
  catch (e) { console.log(`  ⚠ vcat link: ${e.message.slice(0, 160)}`); }

  const sectionReport = (cfg?.sections || []).map(s => ({
    id: s.id, name: s.name, type: s.type, isRequired: s.isRequired,
    dependsOnSectionId: s.dependsOnSectionId, displayOrder: s.displayOrder,
    options: (s.options || []).map(o => ({ id: o.id, productId: o.productId, productName: o.productName, isDefault: !!o.isDefault })),
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

  const seeded = [];
  for (const spec of specs) {
    try { seeded.push(await seedSpec(spec, catalog, parentCat, childCat, priceList.id, ffc.id)); }
    catch (e) { console.error(`  ❌ ${spec.csvId}: ${e.message.slice(0, 300)}`); seeded.push({ csvId: spec.csvId, error: e.message }); }
  }

  // rebuild index for these products
  try { await api('POST', '/api/search/indexes/index', [{ documentType: 'CatalogProduct', rebuild: true }], { expectStatus: [200, 204] }); console.log('\n  ✓ reindex (rebuild) triggered'); }
  catch (e) { console.log(`  ⚠ reindex: ${e.message.slice(0, 120)}`); }

  mkdirSync(dirname(RESULTS_FILE), { recursive: true });
  writeFileSync(RESULTS_FILE, JSON.stringify({ date: DATE, platform: BACK_URL, storeId: STORE_ID, catalog: { id: catalog.id, name: catalog.name }, virtualCatalogId: VIRTUAL_CATALOG_ID, seeded }, null, 2));
  console.log(`\nResults: ${RESULTS_FILE}`);
  console.log(`\n✅ ${seeded.filter(s => !s.error).length}/${seeded.length} seeded`);
  for (const s of seeded) {
    if (s.error) { console.log(`  ❌ ${s.csvId}: ${s.error.slice(0, 120)}`); continue; }
    console.log(`  ✓ ${s.csvId} parent=${s.parentId} config=${s.configurationId}`);
    for (const sec of s.sections) console.log(`      §${sec.displayOrder} ${sec.name} id=${sec.id} req=${sec.isRequired} dep=${sec.dependsOnSectionId || '-'} defaults=[${sec.options.filter(o => o.isDefault).map(o => o.productName).join(',')}]`);
  }
}
main().catch(e => { console.error(`\n❌ ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
