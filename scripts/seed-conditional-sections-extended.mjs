/**
 * Seed CFG-024..CFG-029: Extended conditional-section test products (VCST-4713).
 *
 * Six products, each exercising a distinct dependency-graph dimension:
 *
 *   CFG-024 Text-driven conditional
 *     A=Text (req, root) "Engraving Line 1" → B=Product (opt) "Style Pack" → C=Product (opt) "Accessory"
 *
 *   CFG-025 File-driven conditional
 *     A=File (req, root) "Design Upload" → B=Product (opt) "Finish Type" → C=Text (opt) "Notes"
 *
 *   CFG-026 Required File child
 *     A=Product (req, root) "Service Plan" → B=File (req) "ID Proof"
 *
 *   CFG-027 Two required siblings on same parent
 *     A=Product (opt with None, root) "Bundle Choice" → B=Product (req) "Size" + C=Product (req) "Color"
 *
 *   CFG-028 Deep 4-level chain
 *     A=Product (req) "Level A" → B=Product (opt) "Level B" → C=Product (opt) "Level C"
 *     → D=Product (opt) "Level D" → E=Product (opt) "Level E"
 *
 *   CFG-029 Required child of optional-with-None parent
 *     A=Product (opt, has None, root) "Add Extras" → B=Product (req) "Extra Type"
 *
 * Requires: VirtoCommerce.Catalog >= 3.1014.0-pr-871 on target env.
 *
 * Usage: node scripts/seed-conditional-sections-extended.mjs
 */

import https from 'https';

const BACK_URL = 'https://vcst-qa.govirto.com';
const CATALOG_ID = '7f840fe0-f141-471c-9bad-97d33ee5e87d';
const CATEGORY_ID = '15ba0fac-fb4d-4ca4-8f3f-5611a61a4f45'; // Build the bike of your dreams
const PRICELIST_ID = '732f3fc9-e02f-4839-b69a-5ff7feaf7950';
const FFC_ID = '142ba5568ae4454aad553ece41b9c3b5';
const VIRTUAL_CATALOG_ID = 'fc596540864a41bf8ab78734ee7353a3';
const VIRTUAL_CATEGORY_ID = 'a50654eb-f860-450d-81ba-0c61853f468e'; // Configurations
const DATE_STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

let TOKEN = '';

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Product definitions per CFG
// ---------------------------------------------------------------------------

const P024 = {
  base:          makeProduct('Text-Driven-Cond',      'TXT-COND-CFG'),
  // Section B — Style Pack (Product, opt, dep A)
  style_classic: makeProduct('TxtCond-Style-Classic', 'TXT-STYLE-CLS'),
  style_modern:  makeProduct('TxtCond-Style-Modern',  'TXT-STYLE-MOD'),
  style_none:    makeProduct('TxtCond-Style-None',    'TXT-STYLE-NONE'),
  // Section C — Accessory (Product, opt, dep B)
  acc_bag:       makeProduct('TxtCond-Acc-Bag',       'TXT-ACC-BAG'),
  acc_case:      makeProduct('TxtCond-Acc-Case',      'TXT-ACC-CASE'),
  acc_none:      makeProduct('TxtCond-Acc-None',      'TXT-ACC-NONE'),
};

const P025 = {
  base:          makeProduct('File-Driven-Cond',      'FILE-COND-CFG'),
  // Section B — Finish Type (Product, opt, dep A)
  finish_matte:  makeProduct('FileCond-Finish-Matte', 'FILE-FIN-MAT'),
  finish_gloss:  makeProduct('FileCond-Finish-Gloss', 'FILE-FIN-GLS'),
  finish_none:   makeProduct('FileCond-Finish-None',  'FILE-FIN-NONE'),
  // Section C — Notes: type=Text, no option products
};

const P026 = {
  base:           makeProduct('Req-File-Child',      'REQ-FILE-CFG'),
  // Section A — Service Plan (Product, req)
  plan_basic:     makeProduct('ReqFile-Plan-Basic',  'REQ-PLAN-BASIC'),
  plan_premium:   makeProduct('ReqFile-Plan-Premium','REQ-PLAN-PREM'),
  // Section B — ID Proof: type=File, required, dep A (no option products)
};

const P027 = {
  base:            makeProduct('Two-Req-Siblings',      'TWO-SIB-CFG'),
  // Section A — Bundle Choice (Product, opt, has None)
  bundle_a:        makeProduct('TwoSib-Bundle-A',       'TWO-BNDL-A'),
  bundle_b:        makeProduct('TwoSib-Bundle-B',       'TWO-BNDL-B'),
  bundle_none:     makeProduct('TwoSib-Bundle-None',    'TWO-BNDL-NONE'),
  // Section B — Size (Product, req, dep A)
  size_s:          makeProduct('TwoSib-Size-S',         'TWO-SIZE-S'),
  size_m:          makeProduct('TwoSib-Size-M',         'TWO-SIZE-M'),
  size_l:          makeProduct('TwoSib-Size-L',         'TWO-SIZE-L'),
  // Section C — Color (Product, req, dep A)
  color_black:     makeProduct('TwoSib-Color-Black',    'TWO-CLR-BLK'),
  color_white:     makeProduct('TwoSib-Color-White',    'TWO-CLR-WHT'),
  color_red:       makeProduct('TwoSib-Color-Red',      'TWO-CLR-RED'),
};

const P028 = {
  base:            makeProduct('Deep-4-Level-Chain',   'DEEP-CHAIN-CFG'),
  // Section A — Level A (Product, req)
  levelA_1:        makeProduct('Deep-LvlA-Opt1',       'DEEP-A-OPT1'),
  levelA_2:        makeProduct('Deep-LvlA-Opt2',       'DEEP-A-OPT2'),
  // Section B — Level B (Product, opt, dep A)
  levelB_1:        makeProduct('Deep-LvlB-Opt1',       'DEEP-B-OPT1'),
  levelB_none:     makeProduct('Deep-LvlB-None',       'DEEP-B-NONE'),
  // Section C — Level C (Product, opt, dep B)
  levelC_1:        makeProduct('Deep-LvlC-Opt1',       'DEEP-C-OPT1'),
  levelC_none:     makeProduct('Deep-LvlC-None',       'DEEP-C-NONE'),
  // Section D — Level D (Product, opt, dep C)
  levelD_1:        makeProduct('Deep-LvlD-Opt1',       'DEEP-D-OPT1'),
  levelD_none:     makeProduct('Deep-LvlD-None',       'DEEP-D-NONE'),
  // Section E — Level E (Product, opt, dep D)
  levelE_1:        makeProduct('Deep-LvlE-Opt1',       'DEEP-E-OPT1'),
  levelE_none:     makeProduct('Deep-LvlE-None',       'DEEP-E-NONE'),
};

const P029 = {
  base:             makeProduct('Req-Child-Opt-Parent',  'REQCHILD-CFG'),
  // Section A — Add Extras (Product, opt, has None)
  extra_pack_a:     makeProduct('ReqChild-Extra-A',      'REQCHILD-EXT-A'),
  extra_pack_b:     makeProduct('ReqChild-Extra-B',      'REQCHILD-EXT-B'),
  extra_none:       makeProduct('ReqChild-Extra-None',   'REQCHILD-EXT-NONE'),
  // Section B — Extra Type (Product, req, dep A)
  type_standard:    makeProduct('ReqChild-Type-Std',     'REQCHILD-TYP-STD'),
  type_premium:     makeProduct('ReqChild-Type-Prem',    'REQCHILD-TYP-PREM'),
};

// All products keyed by cfg prefix for idempotent batch resolution
const ALL_PRODUCTS = {
  p024: P024, p025: P025, p026: P026, p027: P027, p028: P028, p029: P029,
};

const PRICES_MAP = {
  // CFG-024
  'p024.base': 200,
  'p024.style_classic': 30, 'p024.style_modern': 45, 'p024.style_none': 0,
  'p024.acc_bag': 20, 'p024.acc_case': 25, 'p024.acc_none': 0,
  // CFG-025
  'p025.base': 180,
  'p025.finish_matte': 15, 'p025.finish_gloss': 20, 'p025.finish_none': 0,
  // CFG-026
  'p026.base': 150,
  'p026.plan_basic': 0, 'p026.plan_premium': 50,
  // CFG-027
  'p027.base': 120,
  'p027.bundle_a': 40, 'p027.bundle_b': 60, 'p027.bundle_none': 0,
  'p027.size_s': 0, 'p027.size_m': 5, 'p027.size_l': 10,
  'p027.color_black': 0, 'p027.color_white': 0, 'p027.color_red': 5,
  // CFG-028
  'p028.base': 300,
  'p028.levelA_1': 20, 'p028.levelA_2': 40,
  'p028.levelB_1': 10, 'p028.levelB_none': 0,
  'p028.levelC_1': 10, 'p028.levelC_none': 0,
  'p028.levelD_1': 10, 'p028.levelD_none': 0,
  'p028.levelE_1': 10, 'p028.levelE_none': 0,
  // CFG-029
  'p029.base': 100,
  'p029.extra_pack_a': 25, 'p029.extra_pack_b': 35, 'p029.extra_none': 0,
  'p029.type_standard': 0, 'p029.type_premium': 15,
};

const INVENTORY_MAP = {
  'p024.base': 30, 'p024.style_classic': 20, 'p024.style_modern': 20, 'p024.style_none': 30,
  'p024.acc_bag': 20, 'p024.acc_case': 20, 'p024.acc_none': 30,
  'p025.base': 30, 'p025.finish_matte': 20, 'p025.finish_gloss': 20, 'p025.finish_none': 30,
  'p026.base': 30, 'p026.plan_basic': 30, 'p026.plan_premium': 20,
  'p027.base': 30,
  'p027.bundle_a': 20, 'p027.bundle_b': 20, 'p027.bundle_none': 30,
  'p027.size_s': 25, 'p027.size_m': 25, 'p027.size_l': 20,
  'p027.color_black': 25, 'p027.color_white': 25, 'p027.color_red': 20,
  'p028.base': 30,
  'p028.levelA_1': 25, 'p028.levelA_2': 20,
  'p028.levelB_1': 20, 'p028.levelB_none': 30,
  'p028.levelC_1': 20, 'p028.levelC_none': 30,
  'p028.levelD_1': 20, 'p028.levelD_none': 30,
  'p028.levelE_1': 20, 'p028.levelE_none': 30,
  'p029.base': 30,
  'p029.extra_pack_a': 20, 'p029.extra_pack_b': 20, 'p029.extra_none': 30,
  'p029.type_standard': 25, 'p029.type_premium': 20,
};

// ---------------------------------------------------------------------------
// Resolved product IDs: keyed as 'p024.base', 'p024.style_classic', etc.
// ---------------------------------------------------------------------------
const productIds = {};

async function resolveAllProducts() {
  console.log('\n=== STEP 1: Resolving / creating products ===');

  const allCodes = {}; // code → 'p024.base' etc.
  for (const [prefix, group] of Object.entries(ALL_PRODUCTS)) {
    for (const [key, p] of Object.entries(group)) {
      allCodes[p.code] = `${prefix}.${key}`;
    }
  }

  async function scanCategory() {
    const s = await request('POST', '/api/catalog/search/products', {
      catalogId: CATALOG_ID, categoryId: CATEGORY_ID, take: 500, sort: 'createdDate:desc',
    });
    for (const item of (s.items || [])) {
      const mapped = allCodes[item.code];
      if (mapped && !productIds[mapped]) productIds[mapped] = item.id;
    }
  }

  await scanCategory();
  console.log(`  Pre-existing: ${Object.keys(productIds).length}/${Object.keys(allCodes).length}`);

  const allProductDefs = [];
  for (const [prefix, group] of Object.entries(ALL_PRODUCTS)) {
    for (const [key, p] of Object.entries(group)) {
      if (!productIds[`${prefix}.${key}`]) allProductDefs.push(p);
    }
  }

  if (allProductDefs.length > 0) {
    console.log(`  Creating ${allProductDefs.length} missing products...`);
    await request('POST', '/api/catalog/products/batch', allProductDefs);
    await scanCategory();
  }

  const total = Object.keys(allCodes).length;
  const found = Object.keys(productIds).length;
  console.log(`  Final mapped: ${found}/${total}`);
  if (found < total) {
    const missing = Object.keys(allCodes).filter(c => !productIds[allCodes[c]]);
    throw new Error('Missing product IDs for codes: ' + missing.join(', '));
  }
}

async function setPrices() {
  console.log('\n=== STEP 2: Setting prices ===');
  const entries = Object.entries(PRICES_MAP).map(([k, list]) => ({
    productId: productIds[k],
    prices: [{ pricelistId: PRICELIST_ID, currency: 'USD', productId: productIds[k], list, minQuantity: 1 }],
  }));
  await request('PUT', '/api/products/prices', entries);
  console.log(`  Prices set for ${entries.length} products`);
}

async function setInventory() {
  console.log('\n=== STEP 3: Setting inventory ===');
  const entries = Object.entries(INVENTORY_MAP).map(([k, qty]) => ({
    fulfillmentCenterId: FFC_ID,
    productId: productIds[k],
    inStockQuantity: qty,
    reservedQuantity: 0,
  }));
  await request('PUT', '/api/inventory/plenty', entries);
  console.log(`  Inventory set for ${entries.length} products`);
}

async function linkBaseToVirtualCatalog(baseKey, label) {
  const baseId = productIds[baseKey];
  const prod = await request('GET', `/api/catalog/products/${baseId}?respGroup=ItemLargeInfo`);
  const existing = (prod.links || []).find(l => l.catalogId === VIRTUAL_CATALOG_ID && l.categoryId === VIRTUAL_CATEGORY_ID);
  if (existing) {
    console.log(`  ${label}: link already present — skip`);
    return;
  }
  const desiredLink = {
    entryId: baseId, listEntryId: baseId, listEntryType: null, priority: 0,
    catalogId: VIRTUAL_CATALOG_ID, categoryId: VIRTUAL_CATEGORY_ID,
    targetId: VIRTUAL_CATEGORY_ID, name: 'Configurations', isAutomatic: false,
  };
  prod.links = [...(prod.links || []), desiredLink];
  await request('POST', '/api/catalog/products', prod);
  console.log(`  ${label}: linked to virtual catalog Configurations category`);
}

async function linkAllBasesToVirtualCatalog() {
  console.log('\n=== STEP 3b: Linking base products to virtual catalog ===');
  for (const prefix of ['p024', 'p025', 'p026', 'p027', 'p028', 'p029']) {
    await linkBaseToVirtualCatalog(`${prefix}.base`, prefix.toUpperCase());
  }
}

// ---------------------------------------------------------------------------
// Configuration helpers — 2-pass pattern (get IDs, then wire deps)
// ---------------------------------------------------------------------------

async function getOrCreateConfig(baseId) {
  const res = await request('POST', '/api/catalog/products/configurations/search', { productId: baseId, take: 1 });
  return res?.results?.[0] || null;
}

async function postConfig(config) {
  return request('POST', '/api/catalog/products/configurations', config);
}

function buildExistingByName(cfg) {
  const m = {};
  for (const s of (cfg?.sections || [])) m[s.name] = s.id;
  return m;
}

// ---------------------------------------------------------------------------
// CFG-024: Text-driven conditional (A=Text→B=Product→C=Product)
// ---------------------------------------------------------------------------

async function seedCFG024() {
  console.log('\n--- CFG-024: Text-driven conditional ---');
  const baseId = productIds['p024.base'];
  const existing = await getOrCreateConfig(baseId);
  const ebn = buildExistingByName(existing);

  const sections1 = [
    {
      id: ebn['Engraving Line 1'] || undefined,
      name: 'Engraving Line 1',
      type: 'Text',
      isRequired: true,
      displayOrder: 0,
      allowCustomText: true,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [],
    },
    {
      id: ebn['Style Pack'] || undefined,
      name: 'Style Pack',
      type: 'Product',
      isRequired: false,
      displayOrder: 1,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p024.style_none'],    quantity: 1 },
        { productId: productIds['p024.style_classic'], quantity: 1 },
        { productId: productIds['p024.style_modern'],  quantity: 1 },
      ],
    },
    {
      id: ebn['Accessory'] || undefined,
      name: 'Accessory',
      type: 'Product',
      isRequired: false,
      displayOrder: 2,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p024.acc_none'],  quantity: 1 },
        { productId: productIds['p024.acc_bag'],   quantity: 1 },
        { productId: productIds['p024.acc_case'],  quantity: 1 },
      ],
    },
  ].map(s => { if (!s.id) { delete s.id; } return s; });

  const cfg1 = { productId: baseId, isActive: true, sections: sections1 };
  if (existing?.id) cfg1.id = existing.id;
  const res1 = await postConfig(cfg1);
  const sm = {};
  for (const s of (res1?.sections || [])) sm[s.name] = s.id;

  // Pass 2 — wire B depends on A, C depends on B
  const sections2 = res1.sections.map(s => ({
    ...s,
    dependsOnSectionId:
      s.name === 'Style Pack' ? sm['Engraving Line 1'] :
      s.name === 'Accessory'  ? sm['Style Pack'] :
      null,
  }));
  const res2 = await postConfig({ id: res1.id, productId: baseId, isActive: true, sections: sections2 });
  console.log(`  Config ID: ${res2.id}`);
  for (const s of (res2?.sections || [])) console.log(`    "${s.name}" id=${s.id} dep=${s.dependsOnSectionId || 'null'}`);
  return { configId: res2.id, sectionMap: sm, baseId };
}

// ---------------------------------------------------------------------------
// CFG-025: File-driven conditional (A=File→B=Product→C=Text)
// ---------------------------------------------------------------------------

async function seedCFG025() {
  console.log('\n--- CFG-025: File-driven conditional ---');
  const baseId = productIds['p025.base'];
  const existing = await getOrCreateConfig(baseId);
  const ebn = buildExistingByName(existing);

  const sections1 = [
    {
      id: ebn['Design Upload'] || undefined,
      name: 'Design Upload',
      type: 'File',
      isRequired: true,
      displayOrder: 0,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [],
    },
    {
      id: ebn['Finish Type'] || undefined,
      name: 'Finish Type',
      type: 'Product',
      isRequired: false,
      displayOrder: 1,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p025.finish_none'],  quantity: 1 },
        { productId: productIds['p025.finish_matte'], quantity: 1 },
        { productId: productIds['p025.finish_gloss'], quantity: 1 },
      ],
    },
    {
      id: ebn['Notes'] || undefined,
      name: 'Notes',
      type: 'Text',
      isRequired: false,
      displayOrder: 2,
      allowCustomText: true,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [],
    },
  ].map(s => { if (!s.id) { delete s.id; } return s; });

  const cfg1 = { productId: baseId, isActive: true, sections: sections1 };
  if (existing?.id) cfg1.id = existing.id;
  const res1 = await postConfig(cfg1);
  const sm = {};
  for (const s of (res1?.sections || [])) sm[s.name] = s.id;

  const sections2 = res1.sections.map(s => ({
    ...s,
    dependsOnSectionId:
      s.name === 'Finish Type' ? sm['Design Upload'] :
      s.name === 'Notes'       ? sm['Finish Type'] :
      null,
  }));
  const res2 = await postConfig({ id: res1.id, productId: baseId, isActive: true, sections: sections2 });
  console.log(`  Config ID: ${res2.id}`);
  for (const s of (res2?.sections || [])) console.log(`    "${s.name}" id=${s.id} dep=${s.dependsOnSectionId || 'null'}`);
  return { configId: res2.id, sectionMap: sm, baseId };
}

// ---------------------------------------------------------------------------
// CFG-026: Required File child (A=Product req→B=File req)
// ---------------------------------------------------------------------------

async function seedCFG026() {
  console.log('\n--- CFG-026: Required File child ---');
  const baseId = productIds['p026.base'];
  const existing = await getOrCreateConfig(baseId);
  const ebn = buildExistingByName(existing);

  const sections1 = [
    {
      id: ebn['Service Plan'] || undefined,
      name: 'Service Plan',
      type: 'Product',
      isRequired: true,
      displayOrder: 0,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p026.plan_basic'],   quantity: 1 },
        { productId: productIds['p026.plan_premium'], quantity: 1 },
      ],
    },
    {
      id: ebn['ID Proof'] || undefined,
      name: 'ID Proof',
      type: 'File',
      isRequired: true,
      displayOrder: 1,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [],
    },
  ].map(s => { if (!s.id) { delete s.id; } return s; });

  const cfg1 = { productId: baseId, isActive: true, sections: sections1 };
  if (existing?.id) cfg1.id = existing.id;
  const res1 = await postConfig(cfg1);
  const sm = {};
  for (const s of (res1?.sections || [])) sm[s.name] = s.id;

  const sections2 = res1.sections.map(s => ({
    ...s,
    dependsOnSectionId: s.name === 'ID Proof' ? sm['Service Plan'] : null,
  }));
  const res2 = await postConfig({ id: res1.id, productId: baseId, isActive: true, sections: sections2 });
  console.log(`  Config ID: ${res2.id}`);
  for (const s of (res2?.sections || [])) console.log(`    "${s.name}" id=${s.id} dep=${s.dependsOnSectionId || 'null'}`);
  return { configId: res2.id, sectionMap: sm, baseId };
}

// ---------------------------------------------------------------------------
// CFG-027: Two required siblings on same parent
// ---------------------------------------------------------------------------

async function seedCFG027() {
  console.log('\n--- CFG-027: Two required siblings on same parent ---');
  const baseId = productIds['p027.base'];
  const existing = await getOrCreateConfig(baseId);
  const ebn = buildExistingByName(existing);

  const sections1 = [
    {
      id: ebn['Bundle Choice'] || undefined,
      name: 'Bundle Choice',
      type: 'Product',
      isRequired: false,
      displayOrder: 0,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p027.bundle_none'], quantity: 1 },
        { productId: productIds['p027.bundle_a'],    quantity: 1 },
        { productId: productIds['p027.bundle_b'],    quantity: 1 },
      ],
    },
    {
      id: ebn['Size'] || undefined,
      name: 'Size',
      type: 'Product',
      isRequired: true,
      displayOrder: 1,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p027.size_s'], quantity: 1 },
        { productId: productIds['p027.size_m'], quantity: 1 },
        { productId: productIds['p027.size_l'], quantity: 1 },
      ],
    },
    {
      id: ebn['Color'] || undefined,
      name: 'Color',
      type: 'Product',
      isRequired: true,
      displayOrder: 2,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p027.color_black'], quantity: 1 },
        { productId: productIds['p027.color_white'], quantity: 1 },
        { productId: productIds['p027.color_red'],   quantity: 1 },
      ],
    },
  ].map(s => { if (!s.id) { delete s.id; } return s; });

  const cfg1 = { productId: baseId, isActive: true, sections: sections1 };
  if (existing?.id) cfg1.id = existing.id;
  const res1 = await postConfig(cfg1);
  const sm = {};
  for (const s of (res1?.sections || [])) sm[s.name] = s.id;

  // Both Size and Color depend on Bundle Choice
  const sections2 = res1.sections.map(s => ({
    ...s,
    dependsOnSectionId:
      (s.name === 'Size' || s.name === 'Color') ? sm['Bundle Choice'] : null,
  }));
  const res2 = await postConfig({ id: res1.id, productId: baseId, isActive: true, sections: sections2 });
  console.log(`  Config ID: ${res2.id}`);
  for (const s of (res2?.sections || [])) console.log(`    "${s.name}" id=${s.id} dep=${s.dependsOnSectionId || 'null'}`);
  return { configId: res2.id, sectionMap: sm, baseId };
}

// ---------------------------------------------------------------------------
// CFG-028: Deep 4-level chain (A→B→C→D→E)
// ---------------------------------------------------------------------------

async function seedCFG028() {
  console.log('\n--- CFG-028: Deep 4-level chain ---');
  const baseId = productIds['p028.base'];
  const existing = await getOrCreateConfig(baseId);
  const ebn = buildExistingByName(existing);

  const sections1 = [
    {
      id: ebn['Level A'] || undefined,
      name: 'Level A',
      type: 'Product',
      isRequired: true,
      displayOrder: 0,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p028.levelA_1'], quantity: 1 },
        { productId: productIds['p028.levelA_2'], quantity: 1 },
      ],
    },
    {
      id: ebn['Level B'] || undefined,
      name: 'Level B',
      type: 'Product',
      isRequired: false,
      displayOrder: 1,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p028.levelB_none'], quantity: 1 },
        { productId: productIds['p028.levelB_1'],    quantity: 1 },
      ],
    },
    {
      id: ebn['Level C'] || undefined,
      name: 'Level C',
      type: 'Product',
      isRequired: false,
      displayOrder: 2,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p028.levelC_none'], quantity: 1 },
        { productId: productIds['p028.levelC_1'],    quantity: 1 },
      ],
    },
    {
      id: ebn['Level D'] || undefined,
      name: 'Level D',
      type: 'Product',
      isRequired: false,
      displayOrder: 3,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p028.levelD_none'], quantity: 1 },
        { productId: productIds['p028.levelD_1'],    quantity: 1 },
      ],
    },
    {
      id: ebn['Level E'] || undefined,
      name: 'Level E',
      type: 'Product',
      isRequired: false,
      displayOrder: 4,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p028.levelE_none'], quantity: 1 },
        { productId: productIds['p028.levelE_1'],    quantity: 1 },
      ],
    },
  ].map(s => { if (!s.id) { delete s.id; } return s; });

  const cfg1 = { productId: baseId, isActive: true, sections: sections1 };
  if (existing?.id) cfg1.id = existing.id;
  const res1 = await postConfig(cfg1);
  const sm = {};
  for (const s of (res1?.sections || [])) sm[s.name] = s.id;

  const chain = { 'Level B': sm['Level A'], 'Level C': sm['Level B'], 'Level D': sm['Level C'], 'Level E': sm['Level D'] };
  const sections2 = res1.sections.map(s => ({
    ...s,
    dependsOnSectionId: chain[s.name] || null,
  }));
  const res2 = await postConfig({ id: res1.id, productId: baseId, isActive: true, sections: sections2 });
  console.log(`  Config ID: ${res2.id}`);
  for (const s of (res2?.sections || [])) console.log(`    "${s.name}" id=${s.id} dep=${s.dependsOnSectionId || 'null'}`);
  return { configId: res2.id, sectionMap: sm, baseId };
}

// ---------------------------------------------------------------------------
// CFG-029: Required child of optional-with-None parent
// ---------------------------------------------------------------------------

async function seedCFG029() {
  console.log('\n--- CFG-029: Required child of optional-with-None parent ---');
  const baseId = productIds['p029.base'];
  const existing = await getOrCreateConfig(baseId);
  const ebn = buildExistingByName(existing);

  const sections1 = [
    {
      id: ebn['Add Extras'] || undefined,
      name: 'Add Extras',
      type: 'Product',
      isRequired: false,
      displayOrder: 0,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p029.extra_none'],   quantity: 1 },
        { productId: productIds['p029.extra_pack_a'], quantity: 1 },
        { productId: productIds['p029.extra_pack_b'], quantity: 1 },
      ],
    },
    {
      id: ebn['Extra Type'] || undefined,
      name: 'Extra Type',
      type: 'Product',
      isRequired: true,
      displayOrder: 1,
      allowCustomText: false,
      allowPredefinedOptions: false,
      dependsOnSectionId: null,
      options: [
        { productId: productIds['p029.type_standard'], quantity: 1 },
        { productId: productIds['p029.type_premium'],  quantity: 1 },
      ],
    },
  ].map(s => { if (!s.id) { delete s.id; } return s; });

  const cfg1 = { productId: baseId, isActive: true, sections: sections1 };
  if (existing?.id) cfg1.id = existing.id;
  const res1 = await postConfig(cfg1);
  const sm = {};
  for (const s of (res1?.sections || [])) sm[s.name] = s.id;

  const sections2 = res1.sections.map(s => ({
    ...s,
    dependsOnSectionId: s.name === 'Extra Type' ? sm['Add Extras'] : null,
  }));
  const res2 = await postConfig({ id: res1.id, productId: baseId, isActive: true, sections: sections2 });
  console.log(`  Config ID: ${res2.id}`);
  for (const s of (res2?.sections || [])) console.log(`    "${s.name}" id=${s.id} dep=${s.dependsOnSectionId || 'null'}`);
  return { configId: res2.id, sectionMap: sm, baseId };
}

// ---------------------------------------------------------------------------
// Reindex
// ---------------------------------------------------------------------------

async function triggerReindex() {
  console.log('\n=== STEP 5: Triggering reindex ===');
  try {
    await request('POST', '/api/search/indexes/index', { documentType: 'KnownDocumentTypes.Product' });
    console.log('  Reindex triggered');
  } catch (e) {
    console.log(`  Reindex failed (manual trigger may be needed): ${e.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('=== CFG-024..029 Conditional Sections Extended Seed (VCST-4713) ===');
  console.log(`Date: ${DATE_STAMP}  Catalog: ${CATALOG_ID}  Category: ${CATEGORY_ID}`);

  TOKEN = await getToken();
  console.log('Auth OK');

  await resolveAllProducts();
  await setPrices();
  await setInventory();
  await linkAllBasesToVirtualCatalog();

  console.log('\n=== STEP 4: Creating / updating configurations ===');
  const cfg024 = await seedCFG024();
  const cfg025 = await seedCFG025();
  const cfg026 = await seedCFG026();
  const cfg027 = await seedCFG027();
  const cfg028 = await seedCFG028();
  const cfg029 = await seedCFG029();

  await triggerReindex();

  // ---------------------------------------------------------------------------
  // Summary
  // ---------------------------------------------------------------------------
  console.log('\n\n========== SUMMARY ==========');

  console.log('\n--- CFG-024: Text-driven conditional ---');
  console.log(`  Base product: ${P024.base.name}`);
  console.log(`  Base product ID: ${cfg024.baseId}`);
  console.log(`  Slug (expected): agent-test-text-driven-cond-${DATE_STAMP}`);
  console.log(`  Config ID: ${cfg024.configId}`);
  console.log('  Section IDs:');
  console.log(`    A "Engraving Line 1" (Text, req, root) = ${cfg024.sectionMap['Engraving Line 1']}`);
  console.log(`    B "Style Pack"       (Product, opt, dep A) = ${cfg024.sectionMap['Style Pack']}`);
  console.log(`    C "Accessory"        (Product, opt, dep B) = ${cfg024.sectionMap['Accessory']}`);

  console.log('\n--- CFG-025: File-driven conditional ---');
  console.log(`  Base product: ${P025.base.name}`);
  console.log(`  Base product ID: ${cfg025.baseId}`);
  console.log(`  Slug (expected): agent-test-file-driven-cond-${DATE_STAMP}`);
  console.log(`  Config ID: ${cfg025.configId}`);
  console.log('  Section IDs:');
  console.log(`    A "Design Upload" (File, req, root) = ${cfg025.sectionMap['Design Upload']}`);
  console.log(`    B "Finish Type"   (Product, opt, dep A) = ${cfg025.sectionMap['Finish Type']}`);
  console.log(`    C "Notes"         (Text, opt, dep B) = ${cfg025.sectionMap['Notes']}`);

  console.log('\n--- CFG-026: Required File child ---');
  console.log(`  Base product: ${P026.base.name}`);
  console.log(`  Base product ID: ${cfg026.baseId}`);
  console.log(`  Slug (expected): agent-test-req-file-child-${DATE_STAMP}`);
  console.log(`  Config ID: ${cfg026.configId}`);
  console.log('  Section IDs:');
  console.log(`    A "Service Plan" (Product, req, root) = ${cfg026.sectionMap['Service Plan']}`);
  console.log(`    B "ID Proof"     (File, req, dep A)   = ${cfg026.sectionMap['ID Proof']}`);

  console.log('\n--- CFG-027: Two required siblings on same parent ---');
  console.log(`  Base product: ${P027.base.name}`);
  console.log(`  Base product ID: ${cfg027.baseId}`);
  console.log(`  Slug (expected): agent-test-two-req-siblings-${DATE_STAMP}`);
  console.log(`  Config ID: ${cfg027.configId}`);
  console.log('  Section IDs:');
  console.log(`    A "Bundle Choice" (Product, opt with None, root) = ${cfg027.sectionMap['Bundle Choice']}`);
  console.log(`    B "Size"          (Product, req, dep A)          = ${cfg027.sectionMap['Size']}`);
  console.log(`    C "Color"         (Product, req, dep A)          = ${cfg027.sectionMap['Color']}`);

  console.log('\n--- CFG-028: Deep 4-level chain ---');
  console.log(`  Base product: ${P028.base.name}`);
  console.log(`  Base product ID: ${cfg028.baseId}`);
  console.log(`  Slug (expected): agent-test-deep-4-level-chain-${DATE_STAMP}`);
  console.log(`  Config ID: ${cfg028.configId}`);
  console.log('  Section IDs:');
  console.log(`    A "Level A" (Product, req, root)    = ${cfg028.sectionMap['Level A']}`);
  console.log(`    B "Level B" (Product, opt, dep A)   = ${cfg028.sectionMap['Level B']}`);
  console.log(`    C "Level C" (Product, opt, dep B)   = ${cfg028.sectionMap['Level C']}`);
  console.log(`    D "Level D" (Product, opt, dep C)   = ${cfg028.sectionMap['Level D']}`);
  console.log(`    E "Level E" (Product, opt, dep D)   = ${cfg028.sectionMap['Level E']}`);

  console.log('\n--- CFG-029: Required child of optional-with-None parent ---');
  console.log(`  Base product: ${P029.base.name}`);
  console.log(`  Base product ID: ${cfg029.baseId}`);
  console.log(`  Slug (expected): agent-test-req-child-opt-parent-${DATE_STAMP}`);
  console.log(`  Config ID: ${cfg029.configId}`);
  console.log('  Section IDs:');
  console.log(`    A "Add Extras"  (Product, opt with None, root) = ${cfg029.sectionMap['Add Extras']}`);
  console.log(`    B "Extra Type"  (Product, req, dep A)          = ${cfg029.sectionMap['Extra Type']}`);

  console.log('\nDone. Update test-data/aliases.json with the IDs above.');
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
