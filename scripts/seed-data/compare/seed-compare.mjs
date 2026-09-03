#!/usr/bin/env node
/**
 * Seeds the `/compare` (product comparison) fixtures — VCST-5735.
 *
 * SINGLE source of truth: ./compare-specs.mjs (side-effect-free, shared with the drift guard and
 * the unit tests). test-data/compare/compare-products.csv is the committed @td registry mirroring
 * only the DERIVABLE business columns; `platform_id` is committed BLANK and the runtime GUID is
 * written per env to test-data/aliases.<env>.json via syncEnvAliases — never into the CSV.
 *
 * What it provisions (see compare-specs.mjs for WHY each value is what it is):
 *   - two ad-hoc category roots, `Compare Fixtures` (Group A/B/C) and `Compare Nested` (whose child
 *     shares its parent's NAME so two different tab keys render one label),
 *   - 13 products (one of them a VARIATION PARENT with 3 priced variation children, so the
 *     `hasVariations` branch of compare-table.vue has a fixture whose minVariationPrice DIVERGES
 *     from its own price — proven live before the run is called successful),
 *   - each with its quantity constraints (minQuantity / packSize / maxQuantity) and
 *     INLINE product properties (no catalog property definition is created, so nothing leaks onto
 *     the other products of the shared seed catalog and there is nothing extra to tear down),
 *   - one product with NO category, linked at the store virtual-catalog ROOT so its breadcrumbs
 *     carry zero Category entries (the `uncategorized` tab).
 *
 * USAGE:
 *   node scripts/seed-data/compare/seed-compare.mjs [--dry-run] [--verbose] [--only CMP-001] [--teardown]
 *
 * Safety: assertSafeTarget() blocks ENV_RISK=production; idempotent find-or-create by product code
 * scoped to the seed catalog; teardown deletes only AGENT-TEST-prefixed entities and verifies zero
 * residue.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose,
  DRY_RUN, TEARDOWN, ONLY, VERBOSE, BACK_URL, STORE_ID,
  ensureVirtualCatalog, ensureFulfillmentCenter, buildStoreSeo,
  ensureCurrencies, enrichProductContent, syncEnvAliases, verifyRemoved, idsParam, ROOT,
} from '../../lib/seed-common.mjs';
import {
  PRODUCTS, CATEGORY_ROOTS, CATEGORY_PATHS, CSV_FILE_KEY, CURRENCY,
  SEED_PREFIX, priceListName, productSlug, validateSpecShape,
  categoryRootCode, categoryPathCode, categorySegmentSlug,
  variationsOf, hasVariations, minVariationPrice, formatMoney,
} from './compare-specs.mjs';

let VIRTUAL_CATALOG_ID = null;

const records = ONLY ? PRODUCTS.filter((r) => r.cmpId === ONLY || r.alias === ONLY) : PRODUCTS;

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function findProductByCode(code, catalogId) {
  const r = await api('POST', '/api/catalog/listentries', {
    // searchInVariations, or a variation child is invisible to its own seeder: a variation is a
    // real catalog product but is NOT a top-level list entry, so without this the lookup misses and
    // every re-seed creates a fresh set of children under the same parent.
    keyword: code, ...(catalogId ? { catalogId } : {}), take: 10, searchInVariations: true,
  }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find((p) => p.code === code && p.type === 'product');
  return found ? { id: found.id, code, name: found.name } : null;
}

/**
 * The variation children of a parent, read from the PARENT ENTITY rather than the search index.
 * `GET /api/catalog/products/{id}` returns a full `variations[]` (verified live 2026-09-03), which
 * is DB-backed and therefore sees a child the instant it is written — the same reason this file
 * browses categories instead of searching for them. A child resolved only by keyword would be
 * missed inside the index window, then duplicated on re-seed and walked past by a teardown that
 * still reports zero residue.
 */
async function variationChildren(parentId) {
  if (!parentId) return [];
  const full = await api('GET', `/api/catalog/products/${parentId}`, null, { expectStatus: [200, 404] }).catch(() => null);
  return (full?.variations || []).filter((v) => v?.id).map((v) => ({ id: v.id, code: v.code, name: v.name }));
}

/** The runtime ids this env's overlay already holds, keyed by alias. */
function overlayIds() {
  const p = join(ROOT, `test-data/aliases.${process.env.TEST_ENV || 'vcst'}.json`);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

/**
 * Resolve an already-seeded fixture. The code lookup goes through the search index, and this domain
 * deliberately owns a product the index REFUSES (CMP-003, whose `Price` property blocks indexing —
 * see compare-specs.mjs), so a code-only lookup would report it missing, create a duplicate on every
 * re-seed, and let teardown walk past it while still reporting zero residue. The overlay's runtime
 * id is the second, index-independent handle; the code is re-verified off the entity itself so a
 * stale overlay can never point the seeder at someone else's product.
 */
async function resolveProduct(rec, catalogId) {
  const byCode = await findProductByCode(rec.code, catalogId);
  if (byCode) return byCode;
  const id = overlayIds()[rec.alias]?.id;
  if (!id) return null;
  const full = await api('GET', `/api/catalog/products/${id}`, null, { expectStatus: [200, 404] });
  if (!full?.id || full.code !== rec.code) return null;
  verbose(`resolved ${rec.code} by overlay id (${id}) — not visible to the search index`);
  return { id: full.id, code: full.code, name: full.name };
}

/**
 * INLINE product property values. `propertyId: null` / `isManageable: false` is the shape the live
 * imported products already use (verified on the Xerox WorkCentre 6515/DN, whose COLOR / FUNCTION /
 * LCD_Size all come back that way and are exposed by xAPI exactly like catalog-defined ones). Using
 * it means this seeder creates NO catalog property definition, so nothing is inherited by the other
 * products of the shared AGENT-TEST-SEED-B2B-Electronics catalog.
 */
const toProperty = (pr) => ({
  name: pr.name,
  type: 'Product',
  valueType: pr.valueType,
  required: false, dictionary: false, multivalue: false, multilanguage: false, hidden: false,
  isManageable: false, isReadOnly: false, isNew: false,
  values: [{ propertyName: pr.name, valueType: pr.valueType, value: pr.value }],
});

function productBody(rec) {
  const body = {
    name: rec.name,
    code: rec.code,
    productType: 'Physical',
    vendor: 'QA',
    isActive: true,
    isBuyable: true,
    trackInventory: true,
    seoInfos: [buildStoreSeo({ semanticUrl: productSlug(rec.name), pageTitle: rec.name })],
  };
  if (rec.minQuantity) body.minQuantity = Number(rec.minQuantity);
  if (rec.packSize) body.packSize = Number(rec.packSize);
  if (rec.maxQuantity) body.maxQuantity = Number(rec.maxQuantity);
  // A two-phase record is created BARE — its properties are applied only after the document has
  // reached the index (see applyDeferredProperties).
  if (rec.properties?.length && !rec.indexTwoPhase) body.properties = rec.properties.map(toProperty);
  return body;
}

let _priceList = null;
async function findOrCreatePriceList() {
  if (_priceList) return _priceList;
  const name = priceListName(CURRENCY);
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find((p) => p?.name === name);
  if (pl) { log(`↻ pricelist: ${name} (${pl.id})`); _priceList = pl; return pl; }
  pl = await api('POST', '/api/pricing/pricelists', { name, currency: CURRENCY, description: 'Seeded for /compare fixtures (VCST-5735)' }, { expectStatus: [200, 201] });
  try {
    await api('POST', '/api/pricing/assignments', {
      name: `${name} → ${STORE_ID}`, pricelistId: pl.id, catalogId: VIRTUAL_CATALOG_ID, priority: 100,
    }, { expectStatus: [200, 201] });
    log(`✓ pricelist + catalog assignment: ${name} (${pl?.id})`);
  } catch (e) { log(`⚠ pricelist created but assignment failed: ${String(e.message).slice(0, 150)}`); }
  _priceList = pl;
  return pl;
}

async function setPrice(priceListId, productId, list) {
  await api('PUT', '/api/products/prices', [{
    productId,
    prices: [{ pricelistId: priceListId, productId, list: Number(list), currency: CURRENCY, minQuantity: 1 }],
  }], { expectStatus: [200, 204] });
}

async function ensureInventory(ffcId, productId, qty) {
  try {
    await api('PUT', '/api/inventory/plenty', [{
      fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0, status: 'Enabled',
    }], { expectStatus: [200, 204] });
  } catch (e) { log(`⚠ inventory ${productId}: ${String(e.message).slice(0, 140)}`); }
}

/**
 * Read-only lookup of the ad-hoc category roots this domain owns. Root-browses every AGENT-TEST-SEED
 * physical catalog (a keyword-less /listentries is DB-backed, unlike the keyword search, which goes
 * through an index that lags a write) and matches top-level categories by CODE. Creates nothing.
 */
async function findSeedCategoryRoots() {
  const wanted = new Map(CATEGORY_ROOTS.map((n) => [categoryRootCode(n), n]));
  const cats = await api('POST', '/api/catalog/catalogs/search', { take: 500 }, { expectStatus: [200, 201] }).catch(() => null);
  const physIds = (cats?.results || []).filter((c) => !c.isVirtual && String(c.name || '').startsWith('AGENT-TEST-SEED')).map((c) => c.id);
  // Deduped by id: a root-level browse can return the same category more than once (once per
  // catalog it is reachable through), and a doubled entry would report two removals of one thing.
  const out = new Map();
  for (const pid of physIds) {
    const r = await api('POST', '/api/catalog/listentries', { catalog: pid, take: 500 }, { expectStatus: [200, 201, 400, 404] }).catch(() => null);
    for (const c of (r?.listEntries || r?.results || [])) {
      if (c.type === 'category' && !c.parentId && wanted.has(c.code) && !out.has(c.id)) {
        out.set(c.id, { rootName: wanted.get(c.code), id: c.id, catalogId: pid });
      }
    }
  }
  return [...out.values()];
}

// --- xAPI visibility ---------------------------------------------------------
// A seeded product the storefront cannot see is a fixture that looks provisioned and renders
// nothing (knowledge/execution/test-data-authoring.md §5a). For the two-phase record we have to
// PROBE for the document rather than trust the index job, so the seeder asks xAPI directly.

async function reindex(ids) {
  await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: ids, rebuild: false }], { expectStatus: [200, 204] }).catch(() => {});
}

const VISIBILITY_QUERY = `query($storeId:String!,$ids:[String]!){
  products(storeId:$storeId, cultureName:"en-US", currencyCode:"USD", productIds:$ids, first:1){ totalCount }
}`;

async function visibleInXapi(id) {
  const r = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: VISIBILITY_QUERY, variables: { storeId: STORE_ID, ids: [id] } }),
  }).catch(() => null);
  if (!r?.ok) return false;
  const j = await r.json().catch(() => null);
  return Number(j?.data?.products?.totalCount) > 0;
}

async function waitForXapi(id, { tries = 10, delayMs = 8000 } = {}) {
  for (let i = 0; i < tries; i++) {
    await new Promise((r) => setTimeout(r, delayMs));
    if (await visibleInXapi(id)) return true;
  }
  return false;
}

/**
 * Two-phase property application for CMP-003. A product CREATED with a property literally named
 * `Price` never enters the search index at all (measured 2026-09-03 — see compare-specs.mjs), so
 * the record is created bare, indexed, and only then given its properties. A timeout here is
 * reported as a FAILED fixture, never as a pause: the whole point of this record is that it renders.
 */
async function applyDeferredProperties(rec, productId) {
  log('  two-phase: waiting for the bare document to index before applying the colliding properties…');
  await reindex([productId]);
  if (!(await waitForXapi(productId))) {
    log(`  ⚠ ${rec.cmpId} did not become visible to xAPI even WITHOUT its properties — not applying them`);
    return false;
  }
  const full = await api('GET', `/api/catalog/products/${productId}`);
  full.properties = [...(full.properties || []).filter((p) => !rec.properties.some((x) => x.name === p.name)), ...rec.properties.map(toProperty)];
  await api('POST', '/api/catalog/products', full, { expectStatus: [200, 201, 204] });
  await reindex([productId]);
  const ok = await waitForXapi(productId);
  log(ok
    ? `  ✓ two-phase: ${rec.properties.length} propert(y/ies) applied and still visible to xAPI`
    : `  ⚠ ${rec.cmpId} DISAPPEARED from xAPI after its properties were applied — the fixture is NOT provisioned`);
  return ok;
}

// --- variations --------------------------------------------------------------
// The `hasVariations` branch of compare-table.vue. A variation is an ordinary catalog product
// carrying `mainProductId`; it needs no SEO record because it has no independent PDP route on this
// storefront (it renders on its parent's page), and publishing one would be a fabricated route.

const variationBody = (v, parentId, catalogId, categoryId) => ({
  catalogId, categoryId,
  name: v.name, code: v.code, mainProductId: parentId,
  productType: 'Physical', vendor: 'QA',
  isActive: true, isBuyable: true, trackInventory: true,
});

/**
 * Create-or-update this record's variation children and price each one. Returns their ids so the
 * caller can index them alongside the parent — `minVariationPrice` is computed at INDEX time from
 * the children's prices, so a parent reindexed before its children are priced reports the parent's
 * own price and the fixture silently collapses into the vacuous state the guard forbids.
 */
async function seedVariations(rec, parentId, catalogId, categoryId, ffcId) {
  const specs = variationsOf(rec);
  if (!specs.length || DRY_RUN || !parentId) return [];

  const live = await variationChildren(parentId);
  const byCode = new Map(live.map((v) => [v.code, v]));
  const pl = await findOrCreatePriceList();
  const ids = [];

  for (const v of specs) {
    let child = byCode.get(v.code) || await findProductByCode(v.code, catalogId);
    if (child?.id) {
      // Self-heal a child that lost its parent link. Without mainProductId it is a standalone
      // product wearing a variation's name — hasVariations goes false and the branch under test
      // never executes, while the seed still reports success.
      const full = await api('GET', `/api/catalog/products/${child.id}`, null, { expectStatus: [200, 404] });
      if (full && full.mainProductId !== parentId) {
        full.mainProductId = parentId;
        await api('POST', '/api/catalog/products', full, { expectStatus: [200, 201, 204] });
        log(`  ↻ variation ${v.code}: re-linked mainProductId → ${parentId}`);
      } else verbose(`  ↻ variation ${v.code} (${child.id})`);
    } else {
      child = await api('POST', '/api/catalog/products', variationBody(v, parentId, catalogId, categoryId), { expectStatus: [200, 201] });
      log(`  ✓ variation ${v.code} → ${child?.id}`);
    }
    if (!child?.id) continue;
    // A variation with NO price row of its own INHERITS the parent's price (measured live
    // 2026-09-03), which equalises minVariationPrice and price — the exact vacuity the guard
    // rejects. So the price is not optional here; it is what makes the fixture discriminating.
    await setPrice(pl.id, child.id, v.listPrice);
    await ensureInventory(ffcId, child.id, v.stock);
    ids.push(child.id);
  }
  log(`  ✓ ${ids.length}/${specs.length} variation(s) priced ${specs.map((v) => formatMoney(v.listPrice)).join(' / ')} against a parent price of ${formatMoney(rec.listPrice)}`);
  return ids;
}

const PRICE_QUERY = `query($storeId:String!,$ids:[String]!){
  products(storeId:$storeId, cultureName:"en-US", currencyCode:"${CURRENCY}", productIds:$ids, first:5){
    items{ id code hasVariations
      price{ actual{ amount formattedAmount } }
      minVariationPrice{ actual{ amount formattedAmount } }
      variations{ code }
    }
  }
}`;

/**
 * Prove the fixture LIVE. The static guard asserts the spec's numbers diverge; only the storefront
 * read path can say whether that divergence survives indexing — and this is precisely the fixture
 * whose failure mode is a green suite, so an unproven seed is reported as a FAILURE, not a pause.
 */
async function verifyVariationBranch(rec, parentId) {
  const want = variationsOf(rec).length;
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 8000));
    const r = await fetch(`${BACK_URL}/graphql`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: PRICE_QUERY, variables: { storeId: STORE_ID, ids: [parentId] } }),
    }).catch(() => null);
    const item = (await r?.json().catch(() => null))?.data?.products?.items?.[0];
    if (!item) continue;
    const price = item.price?.actual, min = item.minVariationPrice?.actual;
    if (!item.hasVariations || (item.variations || []).length < want) {
      verbose(`  …xAPI reports hasVariations=${item.hasVariations} with ${(item.variations || []).length}/${want} variation(s) — still indexing`);
      continue;
    }
    log('');
    log(`  ✓ variation-branch proof for ${rec.alias}:`);
    log(`      hasVariations   ${item.hasVariations} · variations ${(item.variations || []).length} (the compare link renders that + 1)`);
    log(`      price           ${price?.formattedAmount} (${price?.amount})`);
    log(`      minVariationPrice ${min?.formattedAmount} (${min?.amount})   ← what the compare Price row must read`);
    if (min?.amount === price?.amount || min?.formattedAmount === price?.formattedAmount) {
      log(`  ❌ price and minVariationPrice are BOTH ${price?.formattedAmount} — getDisplayPrice returns the same string on either branch, so this fixture cannot discriminate. NOT usable.`);
      return false;
    }
    if (Number(min?.amount) !== Number(minVariationPrice(rec))) {
      log(`  ⚠ minVariationPrice is ${min?.formattedAmount}, the spec derives ${formatMoney(minVariationPrice(rec))} — the CSV's min_variation_price column would be wrong`);
      return false;
    }
    return true;
  }
  log(`  ⚠ ${rec.cmpId}: xAPI never reported ${want} variations on the parent — the hasVariations branch is NOT provisioned`);
  return false;
}

// --- category resolution -----------------------------------------------------
// seed-common's ensureCategoryPath is deliberately NOT used here. Its per-segment lookup goes
// through the keyword search index, which lags a write, so a second run inside that window MISSES
// its own categories and creates a fresh parallel tree. Measured on vcst-qa 2026-09-03: three
// `Compare Fixtures` roots and three `Group A` children accumulated across three runs, and — much
// worse than the litter — CMP-003 landed under a DIFFERENT `Group A` than its five tab-mates, so
// the tab it exists to be compared in no longer contained it. Nothing errored.
//
// This resolver browses the catalog instead: a keyword-less /listentries is DB-backed (the same
// property unlinkSeedRootsFromStoreVirtualCatalog relies on), so it sees a category the instant it
// is written. It matches the SAME ad-hoc code rule ensureCategoryPath applies, so the two agree on
// what a path means; it only disagrees about how to find it.

const SEED_CATALOG_NAME = 'AGENT-TEST-SEED-B2B-Electronics';
let _physicalCatalogId = null;
async function seedCatalogId() {
  if (_physicalCatalogId) return _physicalCatalogId;
  const cats = await api('POST', '/api/catalog/catalogs/search', { take: 500 }, { expectStatus: [200, 201] });
  const c = (cats?.results || []).find((x) => !x.isVirtual && x.name === SEED_CATALOG_NAME);
  if (!c?.id) throw new Error(`physical catalog "${SEED_CATALOG_NAME}" not found — run \`npm run seed:catalog\` first`);
  _physicalCatalogId = c.id;
  return c.id;
}

/** Direct children (categories) of `parentId`, or the catalog's roots when parentId is null. */
async function browseCategories(catalogId, parentId) {
  const body = parentId ? { catalog: catalogId, categoryId: parentId, take: 500 } : { catalog: catalogId, take: 1000 };
  const r = await api('POST', '/api/catalog/listentries', body, { expectStatus: [200, 201, 400, 404] }).catch(() => null);
  const all = (r?.listEntries || r?.results || []).filter((c) => c.type === 'category');
  return parentId ? all : all.filter((c) => !c.parentId);
}

const _pathCache = new Map();
async function ensureComparePath(path) {
  if (_pathCache.has(path)) return _pathCache.get(path);
  const segs = String(path || '').split('>').map((s) => s.trim()).filter(Boolean);
  if (!segs.length) return null;
  const catalogId = await seedCatalogId();

  let parentId = null; let rootId = null; let leaf = null;
  const soFar = [];
  for (const seg of segs) {
    soFar.push(seg);
    // Same code rule as ensureCategoryPath's ad-hoc branch: AGENT-TEST-SEED-<parent-scoped slug>.
    const code = categoryPathCode(soFar);
    const siblings = await browseCategories(catalogId, parentId);
    const matches = siblings.filter((c) => c.code === code);
    if (matches.length > 1) {
      log(`⚠ ${matches.length} categories share the code "${code}" — using the lowest id; run \`npm run seed:compare:teardown\` to clear the duplicates`);
    }
    let id = matches.map((c) => c.id).sort()[0] || null;
    if (!id) {
      if (DRY_RUN) { leaf = { catalogId, categoryId: `dry-${code}`, name: seg }; parentId = leaf.categoryId; continue; }
      const created = await api('POST', '/api/catalog/categories', {
        catalogId, parentId, name: seg, code, isActive: true, priority: 1,
        seoInfos: [buildStoreSeo({ semanticUrl: categorySegmentSlug(soFar), pageTitle: seg })],
      }, { expectStatus: [200, 201] });
      id = created?.id;
      log(`✓ category: ${seg} (${id})`);
    }
    rootId = rootId || id;
    parentId = id;
    leaf = { catalogId, categoryId: id, name: seg };
  }

  // The root must be linked into the store's virtual catalog or the whole subtree is invisible to
  // the storefront. Idempotent; teardown removes exactly these links.
  if (rootId && !DRY_RUN && VIRTUAL_CATALOG_ID) {
    await api('POST', '/api/catalog/listentrylinks', [{ listEntryId: rootId, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204] }).catch(() => {});
  }
  _pathCache.set(path, leaf);
  return leaf;
}

/** Link a product at the store virtual-catalog ROOT (no categoryId) — the `uncategorized` shape. */
async function linkAtVirtualRoot(productId) {
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID,
  }], { expectStatus: [200, 204] });
}

// ---------------------------------------------------------------------------
// seed
// ---------------------------------------------------------------------------

async function seedRecord(rec, ffcId, defaultCatalogId) {
  console.log(`\n=== ${rec.cmpId} ${rec.alias}: ${rec.name} (${rec.code}) ===`);

  let catalogId = defaultCatalogId;
  let categoryId = null;
  if (rec.categoryPath) {
    const loc = await ensureComparePath(rec.categoryPath);
    if (!loc) throw new Error(`could not resolve category path "${rec.categoryPath}"`);
    catalogId = loc.catalogId;
    categoryId = loc.categoryId;
    log(`  category: ${loc.name} (${categoryId})`);
  } else {
    log('  category: NONE (catalog root → uncategorized tab)');
  }

  const body = productBody(rec);
  let product = await resolveProduct(rec, catalogId);
  if (product) {
    verbose(`↻ product ${rec.code} (${product.id}) — re-applying body`);
    // Re-apply so a spec edit (a changed MOQ / property value) lands on the next run rather than
    // leaving a stale fixture that still LOOKS provisioned. Merge onto the live entity so platform
    // fields we do not own are preserved.
    const full = await api('GET', `/api/catalog/products/${product.id}`, null, { expectStatus: [200, 404] });
    if (full && !DRY_RUN) {
      const merged = { ...full, ...body, id: product.id, catalogId: full.catalogId, categoryId: categoryId ?? full.categoryId };
      // A product entity carries its variation CHILDREN inline, and POSTing them back re-INSERTS
      // them: `500 Violation of PRIMARY KEY constraint 'PK_Item' … duplicate key value is <the
      // variation's id>`. Measured on the third consecutive seed of CMP-050 — the first run created
      // the parent (no children yet, so no conflict) and every run after it failed, which is the
      // worst shape for this bug because a seeder that works twice reads as idempotent. The children
      // are owned by seedVariations(); the parent's own write must not mention them.
      delete merged.variations;
      // seoInfos: keep the existing record's id so the PUT updates rather than duplicating.
      if (full.seoInfos?.length) merged.seoInfos = full.seoInfos;
      // A two-phase record must be STRIPPED back to bare on a re-seed, not merged: leaving the
      // index-blocking property in place means the bare document never re-indexes and phase 2
      // waits out its whole budget for a document that was never going to appear.
      if (rec.indexTwoPhase) merged.properties = (full.properties || []).filter((p) => !rec.properties.some((x) => x.name === p.name));
      await api('POST', '/api/catalog/products', merged, { expectStatus: [200, 201, 204] });
    }
  } else {
    product = await api('POST', '/api/catalog/products', { catalogId, categoryId, ...body }, { expectStatus: [200, 201] });
    log(`  ✓ created product (${product?.id})`);
  }

  if (DRY_RUN || !product?.id) return { ...rec, productId: product?.id ?? null };

  const pl = await findOrCreatePriceList();
  await setPrice(pl.id, product.id, rec.listPrice);
  await ensureInventory(ffcId, product.id, rec.stock);
  if (!rec.categoryPath) await linkAtVirtualRoot(product.id);
  await enrichProductContent(product.id, { images: 1, code: rec.code });
  if (rec.indexTwoPhase) await applyDeferredProperties(rec, product.id);
  const variationIds = await seedVariations(rec, product.id, catalogId, categoryId, ffcId);

  log(`  ✓ price ${rec.listPrice} ${CURRENCY} · stock ${rec.stock} · moq ${rec.minQuantity} · pack ${rec.packSize} · max ${rec.maxQuantity || '∞'} · props ${rec.properties.length}${variationIds.length ? ` · variations ${variationIds.length}` : ''}`);
  return { ...rec, productId: product.id, variationIds };
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 Compare fixtures seed${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}`);
  console.log(`   Rows (${records.length}): ${records.map((r) => r.cmpId).join(', ')}\n`);

  // Fail LOUD on a vacuous fixture set rather than seeding data that cannot decide anything.
  const shape = validateSpecShape();
  if (shape.length) {
    console.error('ABORT: compare-specs.mjs is not a discriminating fixture set:');
    for (const p of shape) console.error(`  - ${p}`);
    process.exit(2);
  }

  await auth();
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  log(`Virtual catalog: ${VIRTUAL_CATALOG_ID}`);
  await ensureCurrencies(api, [CURRENCY]);
  const ffc = await ensureFulfillmentCenter(api);
  if (!ffc?.id && !DRY_RUN) throw new Error('No fulfillment center available');
  await findOrCreatePriceList();

  // The uncategorized fixture still needs a PHYSICAL catalog to live in. Resolve the same one every
  // categorised record lands in (ensureCategoryPath's default) so teardown's catalog-scoped lookup
  // finds it too.
  const anchor = await ensureComparePath(CATEGORY_PATHS.A);
  const defaultCatalogId = anchor?.catalogId ?? null;

  const seeded = [];
  for (const rec of records) {
    try { seeded.push(await seedRecord(rec, ffc?.id, defaultCatalogId)); }
    catch (e) { console.error(`  ❌ ${rec.cmpId}: ${String(e.message).slice(0, 300)}`); seeded.push({ ...rec, error: e.message }); }
  }

  if (!DRY_RUN) {
    // Variation children are indexed WITH their parent, never after it: minVariationPrice is
    // computed at index time from the children's prices, so a parent indexed alone reports its own
    // price as the minimum and the fixture collapses into exactly the vacuous state the guard bans.
    const ids = seeded.flatMap((s) => (s.productId ? [s.productId, ...(s.variationIds || [])] : []));
    try {
      // documentType MUST be 'Product' (not 'CatalogProduct', which is accepted and indexes
      // nothing) and the field MUST be `documentIds` (not `ids`, which degrades to a global
      // incremental) — see knowledge/execution/test-data-authoring.md §5a.
      await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: ids, rebuild: false }], { expectStatus: [200, 204] });
      log('✓ reindex triggered');
    } catch (e) { log(`⚠ reindex: ${String(e.message).slice(0, 120)}`); }

    // Runtime GUIDs → aliases.<env>.json only. The committed CSV keeps platform_id BLANK.
    const byKey = {};
    for (const s of seeded) if (s.productId) byKey[s.cmpId] = { platform_id: s.productId };
    if (Object.keys(byKey).length) {
      syncEnvAliases(CSV_FILE_KEY, byKey);
      log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${Object.keys(byKey).length} runtime id(s)`);
    }
  }

  // The variation branch is proven LIVE, after the index write. Everything else in this domain is
  // verifiable by looking at it; "does the storefront read a DIFFERENT price for this column" is not.
  let variationProofFailed = false;
  if (!DRY_RUN) {
    for (const s of seeded) {
      if (!s.productId || !hasVariations(s)) continue;
      if (!(await verifyVariationBranch(s, s.productId))) variationProofFailed = true;
    }
  }

  const ok = seeded.filter((s) => !s.error).length;
  console.log(`\n✅ Compare fixtures: ${ok}/${seeded.length} products seeded`);
  for (const s of seeded) {
    console.log(s.error ? `  ❌ ${s.cmpId}: ${String(s.error).slice(0, 120)}` : `  ✓ ${s.cmpId} ${s.alias} id=${s.productId}${s.variationIds?.length ? ` (+${s.variationIds.length} variations)` : ''}`);
  }
  if (variationProofFailed) {
    console.error('\n❌ the hasVariations fixture did not prove out live — it is provisioned but NOT discriminating. Do not author cases against it until this is green.');
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// teardown — reverse order, AGENT-TEST-only, zero-residue verified
// ---------------------------------------------------------------------------

async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 Compare fixtures teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);

  // 1. Products. Hard AGENT-TEST name guard on top of the exact-code match, so a real product that
  //    happens to share a code can never be deleted.
  //    Variation CHILDREN are collected first and deleted in the same call as their parents, so the
  //    delete is bottom-up within one transaction: a child left behind is an orphaned product with a
  //    dangling mainProductId that the next seed would find by code and "re-link" to a parent that
  //    no longer exists. They are read off the parent entity, not the index, so a child written
  //    seconds ago is still found (see variationChildren).
  const ids = [];
  for (const rec of records) {
    const p = await resolveProduct(rec, null);
    if (!p?.id) continue;
    if (!String(p.name || '').startsWith(SEED_PREFIX)) { log(`⚠ skip ${rec.code}: "${p.name}" lacks the ${SEED_PREFIX} prefix — not a seed product`); continue; }
    for (const child of await variationChildren(p.id)) {
      if (!String(child.name || '').startsWith(SEED_PREFIX)) { log(`⚠ skip variation "${child.name}" of ${rec.code}: lacks the ${SEED_PREFIX} prefix`); continue; }
      ids.push(child.id);
      verbose(`  variation of ${rec.code}: ${child.code} (${child.id})`);
    }
    ids.push(p.id);
  }
  if (ids.length && !DRY_RUN) {
    // MUST be `objectIds` — an empty ObjectIds wipes EVERY authorized product.
    await api('POST', '/api/catalog/listentries/delete', { objectIds: ids, objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] })
      .catch((e) => log(`⚠ product delete: ${String(e.message).slice(0, 140)}`));
    log(`✗ deleted ${ids.length} product(s)`);
  } else log(ids.length ? `[DRY] would delete ${ids.length} product(s)` : '– no seeded compare products found');

  // 2. Pricelist (name is date-stable, so this is exactly the one this seeder made).
  //    ONLY runs on a full teardown, for the same reason as the category roots below: the pricelist
  //    is SHARED by every product in the domain, so deleting it under `--only` strips the prices off
  //    the twelve fixtures that were not being torn down — silently, since an unpriced product still
  //    renders (as $0.00, with a dead qty stepper) and nothing reports an error.
  const plName = priceListName(CURRENCY);
  const s = ONLY ? null : await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(plName)}`, null, { expectStatus: [200, 404] });
  const pls = (s?.results || []).filter((p) => p?.name === plName).map((p) => p.id);
  if (ONLY) log(`– keeping pricelist ${plName}: it is shared by the whole domain and --only scopes to one fixture`);
  if (pls.length && !DRY_RUN) {
    await api('DELETE', `/api/pricing/pricelists?${idsParam(pls)}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
    log(`✗ deleted pricelist ${plName}`);
  }

  // 3. The two ad-hoc category roots this domain owns — unlink from the store virtual catalog
  //    FIRST (otherwise the live catalog keeps a dangling entry), then delete the subtree.
  //    ONLY runs on a full teardown: `--only` scopes to one product and must not remove a tab that
  //    the other fixtures still live in.
  //
  //    It LOOKS UP each root and NEVER creates one. ensureCategoryPath would be the obvious call
  //    and is wrong here: it resolve-or-CREATEs through a search index that lags a write, so on the
  //    first real teardown (2026-09-03) it missed both roots, created two fresh ones, deleted those,
  //    reported "0 fixtures remain" and left the real categories orphaned. A teardown that creates
  //    what it deletes always verifies. findSeedCategoryRoots() root-browses the catalog instead —
  //    listentries without a keyword is DB-backed, which is exactly why unlinkSeedRootsFrom-
  //    StoreVirtualCatalog uses the same call for the same reason.
  if (!ONLY) {
    for (const { rootName, id } of await findSeedCategoryRoots()) {
      if (DRY_RUN) { log(`[DRY] would unlink + delete category root "${rootName}" (${id})`); continue; }
      await api('POST', '/api/catalog/listentrylinks/delete', [{ listEntryId: id, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204, 404] }).catch(() => {});
      await api('POST', '/api/catalog/listentries/delete', { objectIds: [id], objectType: 'Category' }, { expectStatus: [200, 204, 404] })
        .catch((e) => log(`⚠ category delete "${rootName}": ${String(e.message).slice(0, 140)}`));
      log(`✗ removed category root "${rootName}" (${id})`);
    }
    const left = await findSeedCategoryRoots();
    if (left.length) log(`⚠ ${left.length} compare category root(s) still present: ${left.map((c) => `${c.rootName} (${c.id})`).join(', ')}`);
  }

  const residual = await verifyRemoved(async () => {
    const out = [];
    for (const rec of records) {
      const p = await resolveProduct(rec, null);
      if (p?.id && String(p.name || '').startsWith(SEED_PREFIX)) out.push(p.id);
      // A surviving variation is residue too — and it is the invisible kind, since it is not a
      // top-level list entry, so a residue check that only looked at parents would report zero.
      for (const v of variationsOf(rec)) {
        const child = await findProductByCode(v.code, null);
        if (child?.id && String(child.name || '').startsWith(SEED_PREFIX)) out.push(child.id);
      }
    }
    return out;
  });
  console.log(residual === 0
    ? '\n✅ Compare teardown verified — 0 fixtures remain'
    : `\n⚠ Compare teardown incomplete — ${residual} product(s) still present`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ Compare seed failed: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
