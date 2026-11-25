#!/usr/bin/env node
/**
 * seed-size-run.mjs — the single-group size-run PDP fixture (B2C-VAR-001, suite 009).
 *
 * Provisions a master product carrying VirtoFrontend_UI_Layout="B2C" (the B2C product template, which
 * renders options.vue → VcVariantPicker) plus 5 stocked, distinctly priced variations whose ONLY
 * VARIATION-type property is Size (XS,S,M,L,XL). Runtime GUIDs go to aliases.<env>.json only.
 *
 * Rules + bodies: ./size-run-specs.mjs (side-effect-free, shared with the guard; reuses the
 * variant-picker builders). Data: test-data/products/size-run.json.
 * This file is resolve → find-or-create → write-back → prove — the same mechanics as
 * seed-variant-picker.mjs (sibling family; that seeder and its fixture are untouched).
 *
 * USAGE:
 *   node scripts/seed-data/products/seed-size-run.mjs [--dry-run] [--verbose]
 *   node scripts/seed-data/products/seed-size-run.mjs --teardown
 *
 * Safety: ENV_RISK gate, idempotent find-or-create by code, AGENT-TEST- naming, reverse teardown
 * (variations → master → pricelist → leaf category + its Variation property) with a verifyRemoved zero-residue assert.
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, DRY_RUN, VERBOSE, TEARDOWN, BACK_URL, STORE_ID,
  log, verbose, assertSafeTarget, auth, api,
  ensureVirtualCatalog, ensureCategoryPath, storeMainFulfillmentCenter, buildStoreSeo,
  writeEnvAliasOverride, verifyRemoved, idsParam,
} from '../../lib/seed-common.mjs';
import {
  FIXTURE_FILE, SEED_PREFIX, LAYOUT,
  loadFixture, validateFixtureShape, variationForSize, leafCategory, buildMasterBody, buildVariationBody, buildVariationPropertyDef,
} from './size-run-specs.mjs';

const JSON_DATA = JSON.parse(readFileSync(join(ROOT, 'test-data', FIXTURE_FILE), 'utf8'));
const shape = validateFixtureShape(JSON_DATA);
if (shape.length) {
  console.error(`ABORT: ${FIXTURE_FILE} cannot produce a size picker B2C-VAR-001 could fail against:`);
  for (const p of shape) console.error(`  ✗ ${p}`);
  process.exit(2);
}
const REC = loadFixture(JSON_DATA);
const PRICELIST_NAME = 'AGENT-TEST-Size-Run-USD';
const ALIAS = 'SIZE_RUN_MASTER';
const LEAF = leafCategory(REC);
const LEAF_CATEGORY_CODE = LEAF.code;
const SIZE_PROP = REC.variationProperties[0];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.errors?.length) throw new Error(`graphql ${res.status}: ${JSON.stringify(j?.errors || '').slice(0, 240)}`);
  return j.data;
}

/** Exact-code, DB-backed lookup (no index lag). A failed read throws: unknown ≠ absent. */
async function findByCode(code) {
  const l = await api('POST', '/api/catalog/listentries', { code, objectType: 'CatalogProduct', searchInVariations: true, take: 10 }, { expectStatus: [200, 201] });
  const e = (l?.listEntries || l?.results || []).find((p) => p.code === code && p.type === 'product');
  return e ? { id: e.id, code, name: e.name } : null;
}

/** Create, or re-apply the fixture's properties/parent link onto an existing product (self-heal). */
async function upsert(code, body, loc) {
  const hit = await findByCode(code);
  if (!hit) {
    const p = await api('POST', '/api/catalog/products', { catalogId: loc.catalogId, categoryId: loc.categoryId, ...body }, { expectStatus: [200, 201] });
    log(`✓ ${code} → ${p?.id}`);
    return p?.id;
  }
  if (!DRY_RUN) {
    const full = await api('GET', `/api/catalog/products/${hit.id}?respGroup=Full`, null, { expectStatus: [200] });
    const drift = productDrift(full, body, loc);
    if (drift.length) {
      // Minimal self-heal: only the fields this fixture owns (whole read-back re-POST fails with PK_Item on a variation — measured by the variant-picker seeder).
      const keep = (full.properties || []).filter((p) => !body.properties.some((x) => x.name === p.name));
      await api('POST', '/api/catalog/products', {
        id: hit.id, code: full.code, name: full.name, catalogId: loc.catalogId, categoryId: loc.categoryId,
        mainProductId: body.mainProductId ?? full.mainProductId, productType: full.productType, isActive: true, isBuyable: true,
        trackInventory: true, seoInfos: full.seoInfos, properties: [...keep, ...body.properties],
      }, { expectStatus: [200, 201, 204] });
      log(`↻ ${code}: re-applied ${drift.join(', ')}`);
    }
  }
  verbose(`↻ ${code} (${hit.id})`);
  return hit.id;
}

/** Fields of an existing product that differ from what the fixture declares. Empty ⇒ no write. */
function productDrift(full, body, loc) {
  const d = [];
  if (full.categoryId !== loc.categoryId) d.push('category');
  if ((body.mainProductId ?? null) !== (full.mainProductId ?? null)) d.push('mainProductId');
  for (const want of body.properties) {
    const have = (full.properties || []).find((p) => p.name === want.name);
    const val = have?.values?.[0]?.value;
    const bound = want.id ? have?.values?.[0]?.propertyId === want.id : true;
    if (val !== want.values[0].value || !bound) d.push(`property ${want.name}`);
  }
  return d;
}

/** Exact-code category lookup. `{ code, objectType }` reaches CHILD categories; a keyword search does not (measured). */
async function findCategoryByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { code, objectType: 'Category', take: 20 }, { expectStatus: [200, 201] });
  return (r?.listEntries || r?.results || []).find((e) => e.type === 'category' && e.code === code) || null;
}

/** The fixture's own leaf under the shared `Test Fixtures` root, resolved by exact code (see seed-variant-picker.mjs ensureLeaf). */
async function ensureLeaf() {
  const root = await ensureCategoryPath(api, LEAF.root);
  if (!root) throw new Error(`could not resolve root category "${LEAF.root}"`);
  const hit = await findCategoryByCode(LEAF_CATEGORY_CODE);
  if (hit) { verbose(`↻ leaf ${LEAF_CATEGORY_CODE} (${hit.id})`); return { catalogId: root.catalogId, categoryId: hit.id }; }
  const c = await api('POST', '/api/catalog/categories', {
    catalogId: root.catalogId, parentId: root.categoryId, name: LEAF.name, code: LEAF_CATEGORY_CODE, isActive: true, priority: 1,
    seoInfos: [buildStoreSeo({ semanticUrl: LEAF.slug, pageTitle: LEAF.name })],
  }, { expectStatus: [200, 201] });
  log(`✓ leaf category ${LEAF.name} → ${c?.id}`);
  return { catalogId: root.catalogId, categoryId: c?.id };
}

/** The leaf category's OWN Size definition (categoryId = leaf), created if missing. */
async function ensureVariationDefs(loc) {
  const read = async () => {
    const c = await api('GET', `/api/catalog/categories/${loc.categoryId}`, null, { expectStatus: [200] });
    return (c?.properties || []).filter((p) => p.categoryId === loc.categoryId);
  };
  let own = DRY_RUN ? [] : await read();
  for (const name of REC.variationProperties) {
    if (own.some((p) => p.name === name && p.type === 'Variation')) continue;
    await api('POST', '/api/catalog/properties', buildVariationPropertyDef(name, loc), { expectStatus: [200, 201, 204] });
    log(`✓ Variation property "${name}" on the fixture category`);
  }
  if (DRY_RUN) return Object.fromEntries(REC.variationProperties.map((n) => [n, { id: `dry-${n}` }]));
  own = await read();
  const defs = Object.fromEntries(REC.variationProperties.map((n) => [n, own.find((p) => p.name === n && p.type === 'Variation')]));
  for (const [n, d] of Object.entries(defs)) if (!d?.id) throw new Error(`Variation property "${n}" not readable back on category ${loc.categoryId}`);
  return defs;
}

async function ensurePriceList(virtualCatalogId) {
  const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
  let pl = (s?.results || []).find((p) => p?.name === PRICELIST_NAME);
  if (pl) return pl;
  pl = await api('POST', '/api/pricing/pricelists', { name: PRICELIST_NAME, currency: REC.currency, description: 'B2C-VAR-001 size-run fixture' }, { expectStatus: [200, 201] });
  await api('POST', '/api/pricing/assignments', { name: `${PRICELIST_NAME} → store virtual catalog`, pricelistId: pl.id, catalogId: virtualCatalogId, priority: 100 }, { expectStatus: [200, 201] });
  log(`✓ pricelist ${PRICELIST_NAME} (${pl.id})`);
  return pl;
}

/** Prove, on the storefront read path (xAPI), the B2C template + one Size option per variation, stocked and priced. */
async function proveOnStorefront(masterId) {
  const q = `query($s:String!,$id:String!,$f:String!){
    product(storeId:$s,id:$id,cultureName:"en-US",currencyCode:"${REC.currency}"){ id slug hasVariations properties{ name value propertyType } }
    products(storeId:$s,cultureName:"en-US",currencyCode:"${REC.currency}",first:50,filter:$f){ totalCount items{ code availabilityData{ isInStock } price{ actual{ amount } } properties{ name value propertyType } } } }`;
  const filter = `productfamilyid:${masterId} is:product,variation`;
  for (let i = 0; i < 20; i++) {
    const d = await gql(q, { s: STORE_ID, id: masterId, f: filter }).catch((e) => { verbose(e.message); return null; });
    const layout = d?.product?.properties?.find((p) => p.name === LAYOUT.name)?.value;
    const items = (d?.products?.items || []).filter((x) => x.code !== REC.master.sku);
    const withOpt = items.filter((x) => x.availabilityData?.isInStock && x.properties.some((p) => p.name === SIZE_PROP && /variation/i.test(p.propertyType)));
    if (d?.product && layout === LAYOUT.value && withOpt.length === REC.variations.length) {
      log('');
      log('✓ storefront (xAPI) proof:');
      log(`    product ${d.product.slug}: ${LAYOUT.name}=${layout}, hasVariations=${d.product.hasVariations}`);
      for (const x of withOpt) {
        log(`    ${x.code}: ${SIZE_PROP}=${x.properties.find((p) => p.name === SIZE_PROP)?.value}  inStock=${x.availabilityData?.isInStock} price=${x.price?.actual?.amount}`);
      }
      const sel = variationForSize(REC, REC.selection.size);
      log(`    selection the case makes: ${SIZE_PROP}=${REC.selection.size} ⇒ ${sel.sku} @ ${sel.listPrice} ${REC.currency}`);
      return;
    }
    verbose(`waiting for index: layout=${layout} variations-with-size=${withOpt.length}/${REC.variations.length}`);
    await sleep(6000);
  }
  throw new Error('the storefront never showed the B2C layout + all variations with a VARIATION Size (2 min) — the PDP would not render the size picker');
}

async function main() {
  assertSafeTarget();
  await auth();
  console.log(`\n🌱 Size-run fixture${DRY_RUN ? ' (DRY RUN)' : ''} — ${REC.fixtureKey}`);
  const vc = await ensureVirtualCatalog(api);
  const loc = await ensureLeaf();

  const masterId = await upsert(REC.master.sku, buildMasterBody(REC, { seoInfos: [buildStoreSeo({ semanticUrl: REC.master.slug, pageTitle: REC.master.name })] }), loc);
  const defs = await ensureVariationDefs(loc);
  const varIds = [];
  for (const v of REC.variations) varIds.push(await upsert(v.sku, buildVariationBody(REC, v, masterId, defs), loc));
  if (DRY_RUN) { console.log('\n✅ dry run complete'); return; }

  const ffcs = (await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 200 }, { expectStatus: [200, 201] }))?.results || [];
  const ffc = await storeMainFulfillmentCenter(api, ffcs.filter((f) => f.isActive !== false));
  if (!ffc?.id) throw new Error("could not resolve the store's MAIN fulfillment center — run `npm run seed:inventory` first");

  const pl = await ensurePriceList(vc);
  const priced = [{ id: masterId, price: REC.master.listPrice }, ...REC.variations.map((v, i) => ({ id: varIds[i], price: v.listPrice }))];
  await api('PUT', '/api/products/prices', priced.map((p) => ({
    productId: p.id, prices: [{ pricelistId: pl.id, productId: p.id, list: p.price, currency: REC.currency, minQuantity: 1 }],
  })), { expectStatus: [200, 204] });
  // Variations only: the master has no stock record, so it stays out of the in-stock family search.
  await api('PUT', '/api/inventory/plenty', REC.variations.map((v, i) => ({
    fulfillmentCenterId: ffc.id, productId: varIds[i], inStockQuantity: v.stock, reservedQuantity: 0, status: 'Enabled',
  })), { expectStatus: [200, 204] });
  log(`✓ ${priced.length} prices, ${REC.variations.length} stock records @ ${ffc.name}`);

  await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: [masterId, ...varIds], rebuild: false }], { expectStatus: [200, 204] });

  const selIdx = REC.variations.indexOf(variationForSize(REC, REC.selection.size));
  writeEnvAliasOverride({ [ALIAS]: { id: masterId, selectedVariationId: varIds[selIdx] } });
  log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${ALIAS} runtime ids`);

  await proveOnStorefront(masterId);
  console.log(`\n✅ ${REC.fixtureKey} seeded — open {{FRONT_URL}}${REC.master.url}`);
}

async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 Size-run teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const codes = [...REC.variations.map((v) => v.sku), REC.master.sku]; // children before parent
  const found = [];
  for (const c of codes) {
    const p = await findByCode(c);
    if (!p) continue;
    if (!p.name?.startsWith(SEED_PREFIX)) { log(`⚠ skip ${c}: "${p.name}" lacks ${SEED_PREFIX}`); continue; }
    found.push(p.id);
  }
  if (found.length && !DRY_RUN) {
    await api('POST', '/api/catalog/listentries/delete', { objectIds: found, objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] });
    // Event-based indexation may be off: purge the deleted documents or they linger in search.
    await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: found, rebuild: false }], { expectStatus: [200, 204] }).catch(() => {});
  }
  log(found.length ? `✗ deleted ${found.length} product(s)` : '– no seeded products found');
  if (!DRY_RUN) {
    const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
    const ids = (s?.results || []).filter((p) => p?.name === PRICELIST_NAME).map((p) => p.id);
    if (ids.length) { await api('DELETE', `/api/pricing/pricelists?${idsParam(ids)}`, null, { expectStatus: [200, 204, 404] }); log(`✗ deleted pricelist ${PRICELIST_NAME}`); }
  }
  // The fixture's own leaf category — and with it the Size definition scoped to it. The shared root stays.
  const leafHit = await findCategoryByCode(LEAF_CATEGORY_CODE);
  if (leafHit && !DRY_RUN) {
    const leaf = await api('GET', `/api/catalog/categories/${leafHit.id}`, null, { expectStatus: [200, 404] });
    for (const p of (leaf?.properties || []).filter((x) => x.categoryId === leafHit.id)) {
      await api('DELETE', `/api/catalog/properties?id=${encodeURIComponent(p.id)}&doDeleteValues=true`, null, { expectStatus: [200, 204, 404] });
      log(`✗ deleted property ${p.name}`);
    }
    await api('DELETE', `/api/catalog/categories?${idsParam([leafHit.id])}`, null, { expectStatus: [200, 204, 404] });
    await api('POST', '/api/search/indexes/index', [{ documentType: 'Category', documentIds: [leafHit.id], rebuild: false }], { expectStatus: [200, 204] }).catch(() => {});
    log(`✗ deleted category ${leafHit.name}`);
  }
  const residual = await verifyRemoved(async () => {
    const left = [];
    for (const c of codes) { const p = await findByCode(c); if (p?.name?.startsWith(SEED_PREFIX)) left.push(p.id); }
    const leaf = await findCategoryByCode(LEAF_CATEGORY_CODE);
    if (leaf) left.push(leaf.id);
    return left;
  });
  console.log(residual === 0 ? '\n✅ Size-run teardown verified — 0 residue' : `\n⚠ teardown incomplete — ${residual} entity(ies) remain`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ SEED FAILED: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
