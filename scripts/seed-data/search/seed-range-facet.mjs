#!/usr/bin/env node
/**
 * Seeds the numeric RANGE-FACET fixture for suite 061 / SRCHA-047.
 *
 * SINGLE source of truth: ./range-facet-specs.mjs (side-effect-free, shared with the drift guard).
 * test-data/search/range-facet-products.csv mirrors only its derivable columns; `platform_id` is
 * committed BLANK and each env's runtime GUID goes to test-data/aliases.<env>.json (syncEnvAliases).
 *
 * What it provisions:
 *   - one ad-hoc root category `Range Facet Fixtures` in the AGENT-TEST-SEED-B2B-Electronics catalog,
 *     linked into the store's virtual catalog,
 *   - a CATEGORY-level Number property `AgentTest_Length_mm` on that category (offered by the store's
 *     Facets list; inherited only by this category's products),
 *   - four products in it — three with different values of the property, one control without it —
 *     each priced (own pricelist, assigned to the store catalog) and in stock.
 * It does NOT configure the store facet: SRCHA-047 does that itself and restores it.
 *
 * Proven LIVE after the index write, and a failed proof exits 1 (a fixture that looks provisioned
 * and answers nothing is the failure this seeder exists to prevent):
 *   - every product is visible to xAPI,
 *   - the property is offered by GET /api/catalog/aggregationproperties/{storeId}/properties,
 *   - the index field is NUMERIC: xAPI `<field>:[5 TO 20]` returns exactly the LOW product (a text
 *     field would return none), and the case's sub-range returns exactly the MID product.
 *
 * USAGE:
 *   node scripts/seed-data/search/seed-range-facet.mjs [--dry-run] [--verbose] [--teardown]
 * Safety: assertSafeTarget() blocks ENV_RISK=production; find-or-create by code inside the fixture
 * category (DB-backed browse, not the lagging index); teardown deletes only AGENT-TEST entities and
 * verifies zero residue.
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import {
  assertSafeTarget, auth, api, log, verbose,
  DRY_RUN, TEARDOWN, VERBOSE, BACK_URL, STORE_ID,
  ensureVirtualCatalog, ensureFulfillmentCenter, ensureCurrencies, buildStoreSeo,
  syncEnvAliases, verifyRemoved, idsParam,
} from '../../lib/seed-common.mjs';
import {
  PRODUCTS, PROPERTY, CATEGORY_NAME, CATEGORY_CODE, CATEGORY_URL, SEED_CATALOG_NAME, SEED_PREFIX,
  CURRENCY, PRICE_LIST_NAME, SUB_RANGE, NUMERIC_PROBE, CSV_FILE_KEY,
  indexFieldName, inRange, productSlug, validateSpecShape,
} from './range-facet-specs.mjs';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let VIRTUAL_CATALOG_ID = null;

// --- lookups (DB-backed: keyword-less /listentries browse sees a write immediately) ---------------

async function seedCatalogId() {
  const cats = await api('POST', '/api/catalog/catalogs/search', { take: 500 }, { expectStatus: [200, 201] });
  const c = (cats?.results || []).find((x) => !x.isVirtual && x.name === SEED_CATALOG_NAME);
  if (!c?.id) throw new Error(`physical catalog "${SEED_CATALOG_NAME}" not found — run \`npm run seed:catalog\` first`);
  return c.id;
}

async function browse(catalogId, categoryId = null) {
  const body = categoryId ? { catalog: catalogId, categoryId, take: 500 } : { catalog: catalogId, take: 1000 };
  const r = await api('POST', '/api/catalog/listentries', body, { expectStatus: [200, 201, 400, 404] }).catch(() => null);
  return r?.listEntries || r?.results || [];
}

async function findCategory(catalogId) {
  const roots = (await browse(catalogId)).filter((e) => e.type === 'category' && !e.parentId && e.code === CATEGORY_CODE);
  if (roots.length > 1) log(`⚠ ${roots.length} categories share the code ${CATEGORY_CODE} — using the lowest id`);
  return roots.map((c) => c.id).sort()[0] || null;
}

async function productsInCategory(catalogId, categoryId) {
  if (!categoryId) return [];
  return (await browse(catalogId, categoryId)).filter((e) => e.type === 'product');
}

/** The category's own definition of N (catalog-defined, categoryId == ours), or null. */
async function findProperty(categoryId) {
  const cat = await api('GET', `/api/catalog/categories/${categoryId}`, null, { expectStatus: [200, 404] });
  return (cat?.properties || []).find((p) => p.name === PROPERTY.name && p.categoryId === categoryId && p.id) || null;
}

// --- writes ---------------------------------------------------------------------------------------

async function ensureCategory(catalogId) {
  let id = await findCategory(catalogId);
  if (id) log(`↻ category ${CATEGORY_NAME} (${id})`);
  else if (!DRY_RUN) {
    const c = await api('POST', '/api/catalog/categories', {
      catalogId, parentId: null, name: CATEGORY_NAME, code: CATEGORY_CODE, isActive: true, priority: 1,
      seoInfos: [buildStoreSeo({ semanticUrl: CATEGORY_URL.slice(1), pageTitle: CATEGORY_NAME })],
    }, { expectStatus: [200, 201] });
    id = c?.id;
    log(`✓ category ${CATEGORY_NAME} (${id})`);
  } else return 'dry-category';
  // The root must be linked into the store's virtual catalog or the storefront cannot see it.
  await api('POST', '/api/catalog/listentrylinks', [{ listEntryId: id, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204] }).catch(() => {});
  return id;
}

async function ensureProperty(catalogId, categoryId) {
  if (DRY_RUN) return { id: 'dry-property' };
  let prop = await findProperty(categoryId);
  if (prop) {
    if (prop.valueType !== PROPERTY.valueType) throw new Error(`${PROPERTY.name} exists with valueType ${prop.valueType}, expected ${PROPERTY.valueType} — delete it (seed:range-facet:teardown) and re-seed`);
    log(`↻ property ${PROPERTY.name} (${prop.id})`);
    return prop;
  }
  await api('POST', '/api/catalog/properties', {
    isNew: true, name: PROPERTY.name, catalogId, categoryId, type: PROPERTY.type, valueType: PROPERTY.valueType,
    dictionary: false, required: false, multivalue: false, multilanguage: false, hidden: false,
    displayNames: [{ languageCode: 'en-US', name: PROPERTY.name }],
  }, { expectStatus: [200, 201, 204] });
  prop = await findProperty(categoryId);
  if (!prop) throw new Error(`property ${PROPERTY.name} was saved but is not on category ${categoryId}`);
  log(`✓ property ${PROPERTY.name} (${prop.id}) [category-level ${PROPERTY.valueType}]`);
  return prop;
}

async function ensurePriceList() {
  const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICE_LIST_NAME)}`, null, { expectStatus: [200, 404] });
  let pl = (s?.results || []).find((p) => p?.name === PRICE_LIST_NAME);
  if (pl) { log(`↻ pricelist ${PRICE_LIST_NAME} (${pl.id})`); return pl; }
  if (DRY_RUN) return { id: 'dry-pricelist' };
  pl = await api('POST', '/api/pricing/pricelists', { name: PRICE_LIST_NAME, currency: CURRENCY, description: 'Seeded for SRCHA-047 range facet fixtures' }, { expectStatus: [200, 201] });
  await api('POST', '/api/pricing/assignments', { name: `${PRICE_LIST_NAME} → ${STORE_ID}`, pricelistId: pl.id, catalogId: VIRTUAL_CATALOG_ID, priority: 100 }, { expectStatus: [200, 201] });
  log(`✓ pricelist + store-catalog assignment ${PRICE_LIST_NAME} (${pl.id})`);
  return pl;
}

/** Set (or clear) the product's value of N, through the inherited category property. */
async function applyValue(productId, rec, prop) {
  const full = await api('GET', `/api/catalog/products/${productId}`);
  delete full.variations; // a GET→POST round-trip re-INSERTS variation children (KB-969D7E09)
  const others = (full.properties || []).filter((p) => p.name !== PROPERTY.name);
  const inherited = (full.properties || []).find((p) => p.name === PROPERTY.name && p.id === prop.id);
  if (!inherited) throw new Error(`${rec.code} does not inherit ${PROPERTY.name} — is it in the fixture category?`);
  inherited.values = rec.value == null ? [] : [{ propertyId: prop.id, propertyName: PROPERTY.name, valueType: PROPERTY.valueType, value: rec.value }];
  full.properties = [...others, inherited];
  await api('POST', '/api/catalog/products', full, { expectStatus: [200, 201, 204] });
}

async function seedProduct(rec, catalogId, categoryId, prop, pl, ffcId, existing) {
  let id = existing.find((e) => e.code === rec.code)?.id;
  if (id) verbose(`↻ ${rec.code} (${id})`);
  else if (!DRY_RUN) {
    const p = await api('POST', '/api/catalog/products', {
      catalogId, categoryId, name: rec.name, code: rec.code, productType: 'Physical', vendor: 'QA',
      isActive: true, isBuyable: true, trackInventory: true,
      seoInfos: [buildStoreSeo({ semanticUrl: productSlug(rec.name), pageTitle: rec.name })],
    }, { expectStatus: [200, 201] });
    id = p?.id;
    log(`✓ ${rec.code} (${id})`);
  }
  if (DRY_RUN || !id) return null;
  await applyValue(id, rec, prop);
  await api('PUT', '/api/products/prices', [{ productId: id, prices: [{ pricelistId: pl.id, productId: id, list: rec.listPrice, currency: CURRENCY, minQuantity: 1 }] }], { expectStatus: [200, 204] });
  await api('PUT', '/api/inventory/plenty', [{ fulfillmentCenterId: ffcId, productId: id, inStockQuantity: rec.stock, reservedQuantity: 0, status: 'Enabled' }], { expectStatus: [200, 204] });
  log(`  ${rec.rfId} ${rec.alias}: ${PROPERTY.name}=${rec.value ?? '(none)'} · ${rec.listPrice} ${CURRENCY} · stock ${rec.stock}`);
  return id;
}

// --- live proof -----------------------------------------------------------------------------------

async function xapiIds(ids, filter = '') {
  const q = `query($s:String!,$ids:[String],$f:String){products(storeId:$s,cultureName:"en-US",currencyCode:"${CURRENCY}",productIds:$ids,filter:$f,first:20){totalCount items{id code}}}`;
  const r = await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q, variables: { s: STORE_ID, ids: ids || null, f: filter || null } }) }).catch(() => null);
  const j = await r?.json().catch(() => null);
  if (j?.errors?.length) verbose(`xAPI: ${JSON.stringify(j.errors).slice(0, 200)}`);
  return (j?.data?.products?.items || []).map((x) => x.code).sort();
}

async function prove(idsByCode) {
  const ids = Object.values(idsByCode);
  const problems = [];
  let visible = [];
  for (let i = 0; i < 15 && visible.length < ids.length; i++) { await sleep(8000); visible = await xapiIds(ids); }
  if (visible.length < ids.length) problems.push(`only ${visible.length}/${ids.length} fixture products are visible to xAPI on ${STORE_ID}`);

  const field = indexFieldName();
  for (const [want, range] of [['NUMERIC_PROBE', NUMERIC_PROBE], ['SUB_RANGE', SUB_RANGE]]) {
    const expected = inRange(range).map((p) => p.code).sort();
    // NO productIds here: xAPI products() with productIds loads those products and ignores `filter`
    // (measured 2026-11-03 — every id came back for every range). The field is namespaced, so the
    // store-wide result is exactly the fixture products whose value lies in the range.
    let got = [];
    for (let i = 0; i < 6; i++) { // the reindex just written may still be refreshing
      got = await xapiIds(null, `${field}:[${range.from} TO ${range.to}]`);
      if (got.join() === expected.join()) break;
      await sleep(5000);
    }
    if (got.join() !== expected.join()) problems.push(`${want} ${field}:[${range.from} TO ${range.to}] returned [${got.join(', ')}], expected [${expected.join(', ')}]${want === 'NUMERIC_PROBE' ? ' — the field is not indexed as a number' : ''}`);
    else log(`✓ xAPI ${field}:[${range.from} TO ${range.to}] → ${got.join(', ')}`);
  }

  const agg = await api('GET', `/api/catalog/aggregationproperties/${STORE_ID}/properties`, null, { expectStatus: [200, 204] }).catch(() => null);
  if (!(agg || []).some((p) => p.name === PROPERTY.name)) problems.push(`${PROPERTY.name} is not offered by GET /api/catalog/aggregationproperties/${STORE_ID}/properties — step 2 of the case cannot pick it`);
  else log(`✓ ${PROPERTY.name} is offered in ${STORE_ID} Search configuration > Facets`);
  return problems;
}

// --- seed / teardown ------------------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 Range-facet fixtures seed${DRY_RUN ? ' [DRY RUN]' : ''}\n   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  const shape = validateSpecShape();
  if (shape.length) { console.error('ABORT: range-facet-specs.mjs is not discriminating:'); for (const p of shape) console.error(`  - ${p}`); process.exit(2); }

  await auth();
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  await ensureCurrencies(api, [CURRENCY]);
  const ffc = await ensureFulfillmentCenter(api);
  if (!ffc?.id && !DRY_RUN) throw new Error('No fulfillment center available');
  const catalogId = await seedCatalogId();
  const categoryId = await ensureCategory(catalogId);
  const prop = await ensureProperty(catalogId, categoryId);
  const pl = await ensurePriceList();
  const existing = await productsInCategory(catalogId, categoryId);

  const idsByCode = {};
  const byKey = {};
  for (const rec of PRODUCTS) {
    const id = await seedProduct(rec, catalogId, categoryId, prop, pl, ffc?.id, existing);
    if (id) { idsByCode[rec.code] = id; byKey[rec.rfId] = { platform_id: id }; }
  }
  if (DRY_RUN) { console.log('\n[DRY] nothing written'); return; }

  // documentType MUST be 'Product' and the field MUST be documentIds (test-data-authoring.md §5a).
  await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: Object.values(idsByCode), rebuild: false }], { expectStatus: [200, 204] });
  log('✓ reindex triggered');
  syncEnvAliases(CSV_FILE_KEY, byKey);
  log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: ${Object.keys(byKey).length} runtime id(s)`);

  const problems = await prove(idsByCode);
  if (problems.length) {
    console.error('\n❌ range-facet fixture is provisioned but NOT proven:');
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`\n✅ Range-facet fixtures: ${Object.keys(idsByCode).length} products in "${CATEGORY_NAME}", ${PROPERTY.name} ${inRange({ from: -Infinity, to: Infinity }).map((p) => p.value).join(' / ')}`);
}

async function teardown() {
  assertSafeTarget();
  console.log(`\n🧹 Range-facet fixtures teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);
  await auth();
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  const catalogId = await seedCatalogId();
  const categoryId = await findCategory(catalogId);
  const codes = new Set(PRODUCTS.map((p) => p.code));
  const victims = (await productsInCategory(catalogId, categoryId))
    .filter((e) => codes.has(e.code) && String(e.name || '').startsWith(SEED_PREFIX));

  if (victims.length && !DRY_RUN) {
    // MUST be objectIds — an empty ObjectIds wipes EVERY authorized product.
    await api('POST', '/api/catalog/listentries/delete', { objectIds: victims.map((v) => v.id), objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] });
  }
  log(`${DRY_RUN ? '[DRY] would delete' : '✗ deleted'} ${victims.length} product(s)`);

  if (categoryId) {
    const prop = await findProperty(categoryId);
    if (prop && !DRY_RUN) await api('DELETE', `/api/catalog/properties?id=${prop.id}&doDeleteValues=true`, null, { expectStatus: [200, 204, 404] });
    if (prop) log(`${DRY_RUN ? '[DRY] would delete' : '✗ deleted'} property ${PROPERTY.name} (${prop.id})`);
    if (!DRY_RUN) {
      await api('POST', '/api/catalog/listentrylinks/delete', [{ listEntryId: categoryId, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204, 404] }).catch(() => {});
      await api('POST', '/api/catalog/listentries/delete', { objectIds: [categoryId], objectType: 'Category' }, { expectStatus: [200, 204, 404] });
    }
    log(`${DRY_RUN ? '[DRY] would remove' : '✗ removed'} category ${CATEGORY_NAME} (${categoryId})`);
  }

  const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICE_LIST_NAME)}`, null, { expectStatus: [200, 404] });
  const pls = (s?.results || []).filter((p) => p?.name === PRICE_LIST_NAME).map((p) => p.id);
  if (pls.length && !DRY_RUN) await api('DELETE', `/api/pricing/pricelists?${idsParam(pls)}`, null, { expectStatus: [200, 204, 404] });
  if (pls.length) log(`${DRY_RUN ? '[DRY] would delete' : '✗ deleted'} pricelist ${PRICE_LIST_NAME}`);

  const residual = await verifyRemoved(async () => {
    const out = [];
    if (await findCategory(catalogId)) out.push('category');
    // By id, off the entity (DB-backed): a keyword search goes through the index, which still lists
    // a just-deleted product and would report residue that is not there.
    for (const v of victims) {
      const e = await api('GET', `/api/catalog/products/${v.id}`, null, { expectStatus: [200, 204, 404] }).catch(() => null);
      if (e?.id) out.push(e.id);
    }
    return out;
  });
  console.log(residual === 0 ? '\n✅ Range-facet teardown verified — 0 fixtures remain' : `\n⚠ Range-facet teardown incomplete — ${residual} entit(y/ies) still present`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ Range-facet seed failed: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
