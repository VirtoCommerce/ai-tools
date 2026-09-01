#!/usr/bin/env node
/**
 * seed-catalog-edge-fixtures.mjs — the three catalog "discrimination" fixtures REG-2026-08-25-1128
 * found missing: an EMPTY category (CAT-043), an ORG-EXCLUDED product (CAT-038), and an
 * SEO-CONFIGURED product (CAT-040).
 *
 * Rules + shapes live in ./catalog-edge-specs.mjs (side-effect-free, shared with the guard + unit
 * tests); this file is the thin resolve → find-or-create → verify → write-back layer.
 *
 * WHAT THIS SEEDER REFUSES TO DO
 * ------------------------------
 * Exit 0 on a fixture that exists but proves nothing. Each of the three is defined by a NEGATIVE
 * property, and a negative property is exactly what a green create call cannot demonstrate:
 *
 *   - the empty category must have ZERO products (a product wandering in makes CAT-043 vacuous);
 *   - the excluded product must NOT resolve through the store's storefront catalog (if it does,
 *     CAT-038's discriminating half asserts something false);
 *   - the SEO product must come BACK from the API with a non-empty title AND description (writing
 *     them is not the same as the platform storing them — the case reads what is served).
 *
 * So each is verified live after creation, and a violation is a hard failure with the reason.
 *
 * USAGE:
 *   node scripts/seed-data/catalog/seed-catalog-edge-fixtures.mjs [--dry-run] [--verbose]
 *   node scripts/seed-data/catalog/seed-catalog-edge-fixtures.mjs --teardown
 *
 * Safety: ENV_RISK gate (assertSafeTarget), idempotent find-or-create, AGENT-TEST- naming, reverse
 * teardown with a verifyRemoved zero-residue assert.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, STORE_ID, DRY_RUN, VERBOSE, TEARDOWN,
  log, verbose, assertSafeTarget, auth, api,
  ensureVirtualCatalog, ensureCategoryPath, ensureFulfillmentCenter,
  writeEnvAliasOverride, verifyRemoved, idsParam,
} from '../../lib/seed-common.mjs';
import {
  SEED_PREFIX, EXCLUDED_CATALOG, EMPTY_CATEGORY, EXCLUDED_PRODUCT, SEO_PRODUCT,
  buildSeoInfo, buildCategoryBody, buildProductBody, validateFixtureShape,
} from './catalog-edge-specs.mjs';

const PRICELIST_NAME = 'AGENT-TEST-CatalogEdge-USD';

// A bad shape here is a silent vacuous pass later, so fail BEFORE touching the environment.
const shapeProblems = validateFixtureShape();
if (shapeProblems.length) {
  console.error('ABORT: catalog-edge-specs.mjs does not describe usable fixtures:');
  for (const p of shapeProblems) console.error(`  ✗ ${p}`);
  console.error('  Run `npm run td:validate:catalog-edge` for the full report.');
  process.exit(2);
}

let STORE_CATALOG_ID = null;

/* ── lookups ──────────────────────────────────────────────────────────────────── */

async function findCatalogByName(name) {
  const r = await api('POST', '/api/catalog/search', { keyword: name, take: 50, searchInChildren: false }, { expectStatus: [200, 201, 404] });
  return (r?.results || r?.catalogs || []).find((c) => c.name === name) || null;
}

async function findProductByCode(code, catalogId = null) {
  const r = await api('POST', '/api/catalog/listentries', {
    keyword: code, ...(catalogId ? { catalogId } : {}), take: 20,
  }, { expectStatus: [200, 201, 400, 404] });
  const hit = (r?.listEntries || r?.results || []).find((p) => p.code === code && p.type === 'product');
  return hit ? { id: hit.id, code, name: hit.name, catalogId: hit.catalogId } : null;
}

/**
 * Resolve the empty category — BY THE ID THE LAST SEED RECORDED, not by search.
 *
 * `POST /api/catalog/listentries` cannot see a category sitting at the ROOT of a virtual catalog
 * (parentId=null): it returns 0 entries for the code, for the name, with `catalogId`, with `catalog`,
 * and unscoped — verified live on vcst-qa 2026-08-25. A find-or-create built on it therefore never
 * finds the category and creates a fresh duplicate on EVERY run, which is exactly what happened here
 * (two AGENT-TEST-Empty-Category rows, neither reachable by teardown — so a "zero residue" teardown
 * silently left both behind).
 *
 * The per-env overlay is the record of what this seeder created, so it is the reliable handle. The id
 * is re-validated against the live category (code + catalog + AGENT-TEST name) before it is trusted,
 * so a stale or repointed overlay degrades to "create a new one" rather than acting on a stranger.
 */
async function resolveEmptyCategory() {
  const env = process.env.TEST_ENV || 'vcst';
  const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
  if (!existsSync(overlayPath)) return null;
  let recorded;
  try { recorded = JSON.parse(readFileSync(overlayPath, 'utf8'))?.[EMPTY_CATEGORY.aliasName]?.id; }
  catch { return null; }
  if (!recorded) return null;

  const c = await api('GET', `/api/catalog/categories/${recorded}`, null, { expectStatus: [200, 404] }).catch(() => null);
  if (!c?.id) { verbose(`overlay ${EMPTY_CATEGORY.aliasName}.id=${recorded} no longer resolves — will create`); return null; }
  if (c.code !== EMPTY_CATEGORY.code || !String(c.name || '').startsWith(SEED_PREFIX)) {
    log(`⚠ overlay ${EMPTY_CATEGORY.aliasName}.id=${recorded} resolves to "${c.name}" (code ${c.code}) — not this fixture; ignoring it rather than acting on someone else's category`);
    return null;
  }
  if (c.catalogId !== STORE_CATALOG_ID) {
    log(`⚠ recorded category ${recorded} sits in catalog ${c.catalogId}, not the store catalog ${STORE_CATALOG_ID} — will create in the right one`);
    return null;
  }
  return { id: c.id, code: c.code, name: c.name };
}

/* ── the physical, deliberately-unlinked catalog (CAT-038) ────────────────────── */

async function ensureExcludedCatalog() {
  const existing = await findCatalogByName(EXCLUDED_CATALOG.name);
  if (existing?.id) { verbose(`↻ catalog ${EXCLUDED_CATALOG.name} (${existing.id})`); return existing.id; }
  const created = await api('POST', '/api/catalog/catalogs', {
    name: EXCLUDED_CATALOG.name, isVirtual: false, defaultLanguage: { languageCode: 'en-US', isDefault: true },
    languages: [{ languageCode: 'en-US', isDefault: true }],
  }, { expectStatus: [200, 201] });
  log(`✓ physical catalog ${EXCLUDED_CATALOG.name} → ${created?.id}`);
  return created?.id;
}

/* ── fixtures ─────────────────────────────────────────────────────────────────── */

/**
 * CAT-043 — an empty category inside the STORE's catalog (so the storefront can route to it) but
 * deliberately outside the ad-hoc seed category path that other seeders drop products into.
 */
async function ensureEmptyCategory() {
  const existing = await resolveEmptyCategory();
  if (existing?.id) { verbose(`↻ category ${EMPTY_CATEGORY.code} (${existing.id})`); return existing.id; }
  const body = buildCategoryBody(EMPTY_CATEGORY, { catalogId: STORE_CATALOG_ID });
  body.seoInfos = [buildSeoInfo(EMPTY_CATEGORY, { storeId: STORE_ID })];
  const created = await api('POST', '/api/catalog/categories', body, { expectStatus: [200, 201] });
  log(`✓ empty category ${EMPTY_CATEGORY.name} → ${created?.id}`);
  return created?.id;
}

async function ensureProduct(spec, { catalogId, categoryId = null, seo = true }) {
  const existing = await findProductByCode(spec.sku, catalogId);
  if (existing?.id) { verbose(`↻ product ${spec.sku} (${existing.id})`); return { ...existing, catalogId, categoryId }; }
  const body = buildProductBody(spec, {
    catalogId, categoryId,
    seoInfos: seo ? [buildSeoInfo(spec, { storeId: STORE_ID })] : [],
  });
  const p = await api('POST', '/api/catalog/products', body, { expectStatus: [200, 201] });
  log(`✓ product ${spec.sku} → ${p?.id} (catalog ${catalogId})`);
  return { id: p?.id, code: spec.sku, name: spec.name, catalogId, categoryId };
}

/**
 * Force the SEO record onto an EXISTING product too. Creating with seoInfos covers a fresh seed; a
 * product created by an earlier run (or by hand) keeps whatever it had, which for CAT-040 is exactly
 * the null title/description that made the case vacuous in the first place.
 */
async function reconcileSeo(productId, spec) {
  const full = await api('GET', `/api/catalog/products/${productId}`);
  const want = buildSeoInfo(spec, { storeId: STORE_ID });
  const seoInfos = full.seoInfos || [];
  const hit = seoInfos.find((s) => s.storeId === STORE_ID && s.languageCode === want.languageCode);
  const already = hit && hit.pageTitle === want.pageTitle && hit.metaDescription === want.metaDescription && hit.semanticUrl === want.semanticUrl;
  if (already) { verbose(`↻ SEO already correct on ${spec.sku}`); return; }
  full.seoInfos = hit
    ? seoInfos.map((s) => (s === hit ? { ...s, ...want } : s))
    : [...seoInfos, want];
  await api('PUT', '/api/catalog/products', full, { expectStatus: [200, 204] });
  log(`↻ SEO reconciled on ${spec.sku} (title + description + semanticUrl)`);
}

async function findOrCreatePriceList() {
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find((p) => p?.name === PRICELIST_NAME);
  if (pl) { verbose(`↻ pricelist ${PRICELIST_NAME} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', {
    name: PRICELIST_NAME, currency: SEO_PRODUCT.currency, description: 'Catalog edge fixtures (CAT-038/040/043)',
  }, { expectStatus: [200, 201] });
  await api('POST', '/api/pricing/assignments', {
    name: `${PRICELIST_NAME} → ${STORE_ID}`, pricelistId: pl.id, catalogId: STORE_CATALOG_ID, priority: 100,
  }, { expectStatus: [200, 201] }).catch((e) => log(`⚠ pricelist assignment failed: ${e.message.slice(0, 120)}`));
  log(`✓ pricelist ${PRICELIST_NAME} (${pl?.id})`);
  return pl;
}

async function setPrice(priceListId, productId, spec) {
  await api('PUT', '/api/products/prices', [{
    productId,
    prices: [{ pricelistId: priceListId, productId, list: spec.listPrice, currency: spec.currency, minQuantity: 1 }],
  }], { expectStatus: [200, 204] });
}

async function setStock(ffcId, productId, spec) {
  if (!ffcId) return;
  await api('PUT', '/api/inventory/plenty', [{
    fulfillmentCenterId: ffcId, productId, inStockQuantity: spec.stockQty, reservedQuantity: 0, status: 'Enabled',
  }], { expectStatus: [200, 204] }).catch((e) => log(`⚠ inventory ${productId}: ${e.message.slice(0, 120)}`));
}

async function linkIntoStoreCatalog(productId, categoryId) {
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: productId, listEntryType: 'product', catalogId: STORE_CATALOG_ID, categoryId,
  }], { expectStatus: [200, 204] });
}

/* ── verification — each fixture's NEGATIVE property, proven live ─────────────── */

async function verifyEmptyCategoryIsEmpty(categoryId) {
  const r = await api('POST', '/api/catalog/listentries', { catalogId: STORE_CATALOG_ID, categoryId, take: 5 }, { expectStatus: [200, 201, 404] });
  const products = (r?.listEntries || r?.results || []).filter((e) => e.type === 'product');
  if (products.length) {
    throw new Error(
      `${EMPTY_CATEGORY.aliasName}: category ${categoryId} holds ${products.length} product(s) `
      + `(${products.slice(0, 3).map((p) => p.code).join(', ')}) — CAT-043 asserts the EMPTY-state render, `
      + 'which a populated category never produces. Move those products out, or point the fixture at a category nothing else writes to.');
  }
  log(`✓ ${EMPTY_CATEGORY.aliasName}: 0 products — the empty-state branch is reachable`);
}

async function verifyExcludedFromStoreCatalog(productId) {
  const r = await api('POST', '/api/catalog/listentries', { catalogId: STORE_CATALOG_ID, keyword: EXCLUDED_PRODUCT.sku, take: 20 }, { expectStatus: [200, 201, 404] });
  const hit = (r?.listEntries || r?.results || []).find((e) => e.code === EXCLUDED_PRODUCT.sku);
  if (hit) {
    throw new Error(
      `${EXCLUDED_PRODUCT.aliasName}: ${EXCLUDED_PRODUCT.sku} IS reachable through the store's catalog `
      + `(${STORE_CATALOG_ID}) — the org user would see it, and CAT-038's discriminating half asserts the `
      + 'opposite. Remove the listentry link; "not linked" is the whole fixture.');
  }
  log(`✓ ${EXCLUDED_PRODUCT.aliasName}: ${EXCLUDED_PRODUCT.sku} exists physically but is NOT in the store catalog`);
}

async function verifySeoServed(productId) {
  const full = await api('GET', `/api/catalog/products/${productId}`);
  const seo = (full?.seoInfos || []).find((s) => s.storeId === STORE_ID) || (full?.seoInfos || [])[0];
  const title = String(seo?.pageTitle || '').trim();
  const desc = String(seo?.metaDescription || '').trim();
  if (!title || !desc) {
    throw new Error(
      `${SEO_PRODUCT.aliasName}: the platform serves pageTitle="${title}" metaDescription="${desc}" — `
      + 'CAT-040 reads what is SERVED, not what was written, and a null here is the exact state that made '
      + 'the case unable to discriminate (100/100 sampled products returned null).');
  }
  log(`✓ ${SEO_PRODUCT.aliasName}: SEO served — title "${title.slice(0, 40)}…", description ${desc.length} chars`);
  return seo;
}

/* ── main ─────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  await auth();
  console.log(`\n🌱 Catalog edge fixtures${DRY_RUN ? ' (DRY RUN)' : ''} — CAT-038 / CAT-040 / CAT-043`);

  STORE_CATALOG_ID = await ensureVirtualCatalog(api);
  log(`store catalog: ${STORE_CATALOG_ID}`);
  const loc = await ensureCategoryPath(api, SEO_PRODUCT.categoryPath);
  if (!loc) throw new Error(`could not resolve category path "${SEO_PRODUCT.categoryPath}"`);
  const ffc = await ensureFulfillmentCenter(api);
  const pl = DRY_RUN ? { id: 'dry-pl' } : await findOrCreatePriceList();

  // CAT-043 — the empty category.
  const emptyCategoryId = await ensureEmptyCategory();

  // CAT-038 — physical catalog + product, deliberately NOT linked into the store's catalog.
  const excludedCatalogId = await ensureExcludedCatalog();
  const excluded = await ensureProduct(EXCLUDED_PRODUCT, { catalogId: excludedCatalogId, seo: false });
  if (!DRY_RUN && excluded.id) {
    await setPrice(pl.id, excluded.id, EXCLUDED_PRODUCT);
    await setStock(ffc?.id, excluded.id, EXCLUDED_PRODUCT);
    // NOTE: deliberately NO linkIntoStoreCatalog() here. That omission IS the fixture.
  }

  // CAT-040 — SEO-configured product, browsable in the store.
  const seoProduct = await ensureProduct(SEO_PRODUCT, { catalogId: loc.catalogId, categoryId: loc.categoryId });
  if (!DRY_RUN && seoProduct.id) {
    await reconcileSeo(seoProduct.id, SEO_PRODUCT);
    if (loc.catalogId !== STORE_CATALOG_ID) await linkIntoStoreCatalog(seoProduct.id, loc.categoryId);
    await setPrice(pl.id, seoProduct.id, SEO_PRODUCT);
    await setStock(ffc?.id, seoProduct.id, SEO_PRODUCT);
  }

  if (DRY_RUN) { console.log('\n✅ dry run complete (no writes).'); return; }

  await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', rebuild: false }], { expectStatus: [200, 204] })
    .catch((e) => log(`⚠ reindex: ${e.message.slice(0, 100)}`));

  log('');
  log('✓ negative-property proofs:');
  await verifyEmptyCategoryIsEmpty(emptyCategoryId);
  await verifyExcludedFromStoreCatalog(excluded.id);
  await verifySeoServed(seoProduct.id);

  writeEnvAliasOverride({
    [EMPTY_CATEGORY.aliasName]: { id: emptyCategoryId, catalogId: STORE_CATALOG_ID },
    [EXCLUDED_PRODUCT.aliasName]: { id: excluded.id, catalogId: excludedCatalogId },
    [SEO_PRODUCT.aliasName]: { id: seoProduct.id, catalogId: loc.catalogId, categoryId: loc.categoryId, url: SEO_PRODUCT.url },
  });
  log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote runtime ids for 3 fixture(s)`);

  console.log('\n✅ Catalog edge fixtures seeded — CAT-038 / CAT-040 / CAT-043 unblocked');
}

/* ── teardown (products → category → catalog → pricelist) ─────────────────────── */

async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 Catalog edge fixtures teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);
  STORE_CATALOG_ID = await ensureVirtualCatalog(api);

  // 1. Products — exact code match PLUS a hard AGENT-TEST name guard, so a code collision with a
  // real product on a shared env can never delete it.
  const productIds = [];
  for (const spec of [EXCLUDED_PRODUCT, SEO_PRODUCT]) {
    const p = await findProductByCode(spec.sku);
    if (!p?.id) continue;
    if (!p.name?.startsWith(SEED_PREFIX)) { log(`⚠ skip ${spec.sku}: "${p.name}" lacks the ${SEED_PREFIX} prefix — not a seed product`); continue; }
    productIds.push(p.id);
  }
  if (productIds.length && !DRY_RUN) {
    // `POST /api/catalog/listentries/delete` is a SILENT NO-OP for a product that lives outside the
    // store's catalog: it returns success and leaves the row in place. Observed here on 2026-08-25 —
    // QA-SEO-001 (shared seed catalog) was removed by it while QA-EXCL-001 (its own physical catalog)
    // survived, and teardown still reported "deleted 2 product(s)". The dedicated endpoint deletes
    // both, and each id is re-read afterwards so a future silent no-op is reported, not assumed away.
    await api('DELETE', `/api/catalog/products?${idsParam(productIds)}`, null, { expectStatus: [200, 204, 404] })
      .catch((e) => log(`⚠ product delete: ${e.message.slice(0, 120)}`));
    let gone = 0;
    for (const id of productIds) {
      const still = await api('GET', `/api/catalog/products/${id}`, null, { expectStatus: [200, 404] }).catch(() => null);
      if (still?.id) log(`⚠ product ${id} ("${still.name}") survived the delete — reported below as residue`);
      else gone++;
    }
    log(`✗ deleted ${gone}/${productIds.length} product(s)`);
  } else log('– no seeded products found');

  // 2. The empty category.
  const cat = await resolveEmptyCategory();
  if (cat?.id && !DRY_RUN) {
    if (!cat.name?.startsWith(SEED_PREFIX)) log(`⚠ skip category ${EMPTY_CATEGORY.code}: "${cat.name}" lacks the ${SEED_PREFIX} prefix`);
    else {
      await api('POST', '/api/catalog/listentries/delete', { objectIds: [cat.id], objectType: 'Category' }, { expectStatus: [200, 204, 404] })
        .catch((e) => log(`⚠ category delete: ${e.message.slice(0, 120)}`));
      log(`✗ deleted category ${EMPTY_CATEGORY.name}`);
    }
  } else log('– no seeded empty category found');

  // 3. The physical catalog this seeder created.
  const physical = await findCatalogByName(EXCLUDED_CATALOG.name);
  if (physical?.id && !DRY_RUN) {
    await api('DELETE', `/api/catalog/catalogs/${physical.id}`, null, { expectStatus: [200, 204, 404] }).catch((e) => log(`⚠ catalog delete: ${e.message.slice(0, 120)}`));
    log(`✗ deleted catalog ${EXCLUDED_CATALOG.name}`);
  }

  // 4. The pricelist this seeder created.
  if (!DRY_RUN) {
    const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
    const ids = (s?.results || []).filter((p) => p?.name === PRICELIST_NAME).map((p) => p.id);
    if (ids.length) {
      await api('DELETE', `/api/pricing/pricelists?${idsParam(ids)}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
      log(`✗ deleted pricelist ${PRICELIST_NAME}`);
    }
  }

  // 5. Zero-residue assert across everything this seeder owns.
  // Residue is checked BY ID via GET, not by the search index. `listentries` lags deletion by seconds
  // to minutes, so an index-backed check reports phantom residue (and, worse, could report a real
  // survivor as gone once the index catches up with a delete that never happened).
  const residual = await verifyRemoved(async () => {
    const left = [];
    for (const id of productIds) {
      const p = await api('GET', `/api/catalog/products/${id}`, null, { expectStatus: [200, 404] }).catch(() => null);
      if (p?.id && String(p.name || '').startsWith(SEED_PREFIX)) left.push(p.id);
    }
    const c = await resolveEmptyCategory();
    if (c?.id && c.name?.startsWith(SEED_PREFIX)) left.push(c.id);
    const cat2 = await findCatalogByName(EXCLUDED_CATALOG.name);
    if (cat2?.id) left.push(cat2.id);
    return left;
  });
  console.log(residual === 0
    ? '\n✅ Catalog edge teardown verified — 0 residue'
    : `\n⚠ Catalog edge teardown incomplete — ${residual} entit(y/ies) still present`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ SEED FAILED: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
