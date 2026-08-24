#!/usr/bin/env node
/**
 * seed-wishlists.mjs — the two-store wishlist fixture (VCST-5705).
 *
 * Provisions ONE customer holding TWO wishlists in TWO DIFFERENT stores, each containing a DIFFERENT
 * product, and writes every runtime GUID to aliases.<env>.json. Unblocks CAT-079 (catalog-listing
 * marker), CAT-080 (PDP marker) and WISH-30 (xAPI product.wishlistIds).
 *
 * The rules + shapes live in ./wishlist-specs.mjs (side-effect-free, shared with the guard + unit
 * tests); the fixture data lives in test-data/wishlists/two-store-wishlists.csv. This file is the thin
 * resolve → find-or-create → write-back layer.
 *
 * THE ONE THING THIS SEEDER REFUSES TO DO
 * ---------------------------------------
 * Seed a single-store fixture. VCST-5705 was "storeId accepted but never applied"; a fixture whose two
 * wishlists sit in the same store (or whose store B does not exist) makes CAT-079/CAT-080 pass while
 * testing nothing — reproducing the defect in the test suite itself. So a missing / non-distinct /
 * closed store B is a HARD ABORT with the reason, never a degraded seed.
 *
 * USAGE:
 *   node scripts/seed-data/wishlists/seed-wishlists.mjs [--dry-run] [--verbose]
 *   node scripts/seed-data/wishlists/seed-wishlists.mjs --teardown
 *
 * Safety: ENV_RISK gate (assertSafeTarget), idempotent find-or-create, AGENT-TEST- naming, reverse
 * teardown with a verifyRemoved zero-residue assert.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  ROOT, STORE_ID, DRY_RUN, VERBOSE, TEARDOWN,
  log, verbose, assertSafeTarget, auth, api,
  ensureVirtualCatalog, ensureCategoryPath, ensureFulfillmentCenter, buildStoreSeo,
  syncEnvAliases, verifyRemoved, idsParam,
} from '../../lib/seed-common.mjs';
import {
  authenticate as userAuth, setFlags as setUserFlags, ensureSecurityAccount,
  findUserByEmail, findContactByEmail, resolvePassword, isPasswordDeclared,
} from '../../lib/user-provision.mjs';
import {
  CSV_SOURCE, FIXTURE_KEY, SEED_PREFIX,
  loadFixture, productSpecs, wishlistSpecs, validateFixtureShape,
  buildContactBody, buildProductBody, buildLineItem, buildWishlistBody,
} from './wishlist-specs.mjs';

const STORE_A = STORE_ID;
const STORE_B = (process.env.STORE_ID_SECONDARY || '').trim();
const PRICELIST_NAME = 'AGENT-TEST-Wishlist-USD';

const rows = parse(readFileSync(join(ROOT, 'test-data', CSV_SOURCE.file), 'utf8'), {
  columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
});
const REC = loadFixture(rows);
if (!REC) { console.error(`ABORT: no ${FIXTURE_KEY} row in ${CSV_SOURCE.file}`); process.exit(2); }

// Fail on a fixture that could not do its job BEFORE touching the environment — a bad shape here is a
// silent vacuous pass later, which is the whole failure mode this fixture exists to prevent.
const shapeProblems = validateFixtureShape(rows);
if (shapeProblems.length) {
  console.error(`ABORT: ${CSV_SOURCE.file} is not a usable two-store fixture:`);
  for (const p of shapeProblems) console.error(`  ✗ ${p}`);
  console.error('  Run `npm run td:validate:wishlists` for the full report.');
  process.exit(2);
}

let VIRTUAL_CATALOG_ID = null;

/* ── store resolution ─────────────────────────────────────────────────────────── */

async function resolveStores() {
  if (!STORE_B) {
    throw new Error(
      'STORE_ID_SECONDARY is not set for this environment. The two-store wishlist fixture cannot be '
      + 'provisioned without a genuine second store — seeding both wishlists into one store would make '
      + 'CAT-079/CAT-080 pass vacuously, which is exactly the VCST-5705 defect. Set STORE_ID_SECONDARY '
      + `in .env.${process.env.TEST_ENV || 'vcst'} (or .env.defaults) to a real, Open store id.`
    );
  }
  if (STORE_B === STORE_A) {
    throw new Error(`STORE_ID_SECONDARY ("${STORE_B}") is the SAME store as STORE_ID — the fixture would be single-store. Point it at a different store.`);
  }
  const out = {};
  for (const [role, id] of [['A', STORE_A], ['B', STORE_B]]) {
    const s = await api('GET', `/api/stores/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
    if (!s) throw new Error(`store ${role} "${id}" does not exist on this environment — provision it, or point STORE_ID_SECONDARY at a store that does.`);
    if (String(s.storeState) === 'Closed') throw new Error(`store ${role} "${id}" is Closed — a closed store rejects storefront requests, so the fixture would be untestable.`);
    out[role] = { id, catalogId: s.catalog, name: s.name, currency: s.defaultCurrency };
    log(`store ${role}: ${id} (catalog ${s.catalog}, ${s.storeState})`);
  }
  if (!out.B.catalogId) throw new Error(`store B "${STORE_B}" has no catalog assigned — its product could not be "available in that store".`);
  return out;
}

/* ── catalog helpers ──────────────────────────────────────────────────────────── */

async function findProductByCode(code, catalogId) {
  const r = await api('POST', '/api/catalog/listentries', {
    keyword: code, ...(catalogId ? { catalogId } : {}), take: 20,
  }, { expectStatus: [200, 201, 400, 404] });
  const hit = (r?.listEntries || r?.results || []).find((p) => p.code === code && p.type === 'product');
  return hit ? { id: hit.id, code, name: hit.name } : null;
}

async function ensureProduct(spec, catalogId, categoryId) {
  const existing = await findProductByCode(spec.sku, catalogId);
  if (existing) { verbose(`↻ product ${spec.sku} (${existing.id})`); return { ...existing, catalogId, categoryId }; }
  const body = {
    catalogId, categoryId,
    ...buildProductBody(spec, REC, { seoInfos: [buildStoreSeo({ semanticUrl: spec.slug, pageTitle: spec.name })] }),
  };
  const p = await api('POST', '/api/catalog/products', body, { expectStatus: [200, 201] });
  log(`✓ product ${spec.sku} → ${p?.id} (catalog ${catalogId})`);
  return { id: p?.id, code: spec.sku, name: spec.name, catalogId, categoryId };
}

/**
 * Surface a product in STORE A's virtual catalog under the ad-hoc seed category. Drop any stale root
 * link first — a bare catalog link targets the catalog ROOT and scatters the product there (the same
 * trap seed-standard-products documents), which would also break the derived storefront url.
 */
async function linkIntoStoreA(productId, categoryId) {
  await api('POST', '/api/catalog/listentrylinks/delete', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID,
  }], { expectStatus: [200, 204, 404] }).catch(() => {});
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID, categoryId,
  }], { expectStatus: [200, 204] });
}

async function findOrCreatePriceList() {
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find((p) => p?.name === PRICELIST_NAME);
  if (pl) { verbose(`↻ pricelist ${PRICELIST_NAME} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', {
    name: PRICELIST_NAME, currency: REC.currency, description: 'Two-store wishlist fixture (VCST-5705)',
  }, { expectStatus: [200, 201] });
  await api('POST', '/api/pricing/assignments', {
    name: `${PRICELIST_NAME} → ${STORE_A}`, pricelistId: pl.id, catalogId: VIRTUAL_CATALOG_ID, priority: 100,
  }, { expectStatus: [200, 201] }).catch((e) => log(`⚠ pricelist assignment failed: ${e.message.slice(0, 120)}`));
  log(`✓ pricelist ${PRICELIST_NAME} (${pl?.id}) assigned to store-A virtual catalog`);
  return pl;
}

async function setPrice(priceListId, productId) {
  await api('PUT', '/api/products/prices', [{
    productId,
    prices: [{ pricelistId: priceListId, productId, list: REC.listPrice, currency: REC.currency, minQuantity: 1 }],
  }], { expectStatus: [200, 204] });
}

async function setStock(ffcId, productId) {
  if (!ffcId) return;
  await api('PUT', '/api/inventory/plenty', [{
    fulfillmentCenterId: ffcId, productId, inStockQuantity: REC.stockQty, reservedQuantity: 0, status: 'Enabled',
  }], { expectStatus: [200, 204] }).catch((e) => log(`⚠ inventory ${productId}: ${e.message.slice(0, 120)}`));
}

/* ── customer ─────────────────────────────────────────────────────────────────── */

async function ensureCustomer() {
  const contact = await findContactByEmail(REC.email);
  let contactId = contact?.id;
  if (contactId) { verbose(`↻ contact ${REC.email} (${contactId})`); }
  else {
    const created = await api('POST', '/api/members', buildContactBody(REC), { expectStatus: [200, 201] });
    contactId = created?.id;
    log(`✓ contact ${REC.email} → ${contactId}`);
  }
  const password = resolvePassword(REC.password);
  const userId = await ensureSecurityAccount(REC.email, password, contactId, 'Approved', {
    reconcilePassword: isPasswordDeclared(REC.password),
  });
  return { contactId, userId };
}

/* ── wishlists ────────────────────────────────────────────────────────────────── */

async function findWishlist(storeId, customerId, listName) {
  const r = await api('POST', '/api/carts/search', { type: 'Wishlist', storeId, customerId, take: 100 });
  return (r?.results || []).find((c) => c.name === listName) || null;
}

/**
 * Find-or-create the wishlist and make its contents EXACTLY the one fixture product. Items go inline
 * on create / via a whole-cart PUT: POST /api/carts/{id}/items 500s on a Wishlist-type cart
 * ("Sequence contains no matching element") — verified live on vcst-qa 2026-08-24.
 */
async function ensureWishlist({ storeId, listName, product, customerId }) {
  const item = buildLineItem(product, REC);
  const existing = await findWishlist(storeId, customerId, listName);
  if (existing) {
    const skus = (existing.items || []).map((i) => i.sku);
    if (skus.length === 1 && skus[0] === product.code) { verbose(`↻ wishlist "${listName}"@${storeId} (${existing.id}) already holds ${product.code}`); return existing; }
    const full = await api('GET', `/api/carts/${existing.id}`);
    full.items = [item];
    await api('PUT', '/api/carts', full, { expectStatus: [200, 201, 204] });
    log(`↻ wishlist "${listName}"@${storeId} (${existing.id}) → items reset to [${product.code}]`);
    return existing;
  }
  const created = await api('POST', '/api/carts', buildWishlistBody({
    listName, storeId, customerId, customerName: REC.fullName, currency: REC.currency, items: [item],
  }), { expectStatus: [200, 201] });
  log(`✓ wishlist "${listName}"@${storeId} → ${created?.id} [${product.code}]`);
  return created;
}

/* ── verification ─────────────────────────────────────────────────────────────── */

/**
 * Prove the fixture is what it claims: the SAME customer resolves to two DIFFERENT wishlist ids in two
 * DIFFERENT stores, holding two DIFFERENT products. A green seed that cannot show this is a vacuous
 * fixture, so this is a hard gate, not a log line.
 */
async function verifyTwoStore(customerId, wishlists) {
  const seen = [];
  for (const role of ['A', 'B']) {
    const w = wishlists[role];
    const found = await api('POST', '/api/carts/search', { type: 'Wishlist', storeId: w.storeId, customerId, take: 100 });
    const hit = (found?.results || []).find((c) => c.id === w.id);
    if (!hit) throw new Error(`wishlist ${role} (${w.id}) is not returned by a store-scoped search on "${w.storeId}"`);
    seen.push({ role, id: hit.id, storeId: hit.storeId, skus: (hit.items || []).map((i) => i.sku) });
  }
  const [a, b] = seen;
  if (a.id === b.id) throw new Error('both wishlists resolved to the SAME id — not a two-store fixture');
  if (a.storeId === b.storeId) throw new Error(`both wishlists sit in store "${a.storeId}" — not a two-store fixture`);
  if (!a.skus.length || !b.skus.length) throw new Error(`a wishlist is empty (A=[${a.skus}] B=[${b.skus}]) — the marker assertion needs a product in each`);
  if (a.skus.join() === b.skus.join()) throw new Error(`both wishlists hold the same product [${a.skus}] — cannot distinguish a leaked id from a correct one`);
  log('');
  log('✓ two-store proof:');
  for (const s of seen) log(`    store ${s.role}: wishlist ${s.id} @ ${s.storeId} → [${s.skus.join(', ')}]`);
  return seen;
}

/* ── main ─────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  await auth();
  setUserFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
  await userAuth();

  console.log(`\n🌱 Two-store wishlist fixture${DRY_RUN ? ' (DRY RUN)' : ''} — ${FIXTURE_KEY}`);
  const stores = await resolveStores();

  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  log(`store-A virtual catalog: ${VIRTUAL_CATALOG_ID}`);
  const loc = await ensureCategoryPath(api, REC.categoryPath);
  if (!loc) throw new Error(`could not resolve category path "${REC.categoryPath}"`);
  const ffc = await ensureFulfillmentCenter(api);
  const pl = DRY_RUN ? { id: 'dry-pl' } : await findOrCreatePriceList();

  // Products: A in the shared seed catalog, B physically in STORE B's own catalog. Both linked into
  // store A's virtual catalog so CAT-079 can see both cards on one page.
  const products = {};
  for (const spec of productSpecs(REC)) {
    const catalogId = spec.physicalCatalog === 'storeB' ? stores.B.catalogId : loc.catalogId;
    const categoryId = spec.physicalCatalog === 'storeB' ? null : loc.categoryId;
    const p = await ensureProduct(spec, catalogId, categoryId);
    if (!DRY_RUN && p.id) {
      await linkIntoStoreA(p.id, loc.categoryId);
      await setPrice(pl.id, p.id);
      await setStock(ffc?.id, p.id);
    }
    products[spec.role] = { ...p, productType: 'Physical' };
  }

  const { contactId, userId } = await ensureCustomer();

  const wishlists = {};
  for (const w of wishlistSpecs(REC)) {
    const created = await ensureWishlist({
      storeId: stores[w.role].id, listName: w.listName, product: products[w.role], customerId: contactId,
    });
    wishlists[w.role] = { id: created?.id, storeId: stores[w.role].id };
  }

  if (!DRY_RUN) {
    await api('POST', '/api/search/indexes/index', [{ documentType: 'CatalogProduct', rebuild: false }], { expectStatus: [200, 204] })
      .catch((e) => log(`⚠ reindex: ${e.message.slice(0, 100)}`));

    // Runtime values → aliases.<env>.json ONLY. store_a_id/store_b_id ride along because they are
    // per-env (STORE_ID / STORE_ID_SECONDARY), not because they are GUIDs.
    syncEnvAliases(CSV_SOURCE.key, {
      [FIXTURE_KEY]: {
        contact_id: contactId,
        user_id: userId,
        store_a_id: stores.A.id,
        store_b_id: stores.B.id,
        store_a_wishlist_id: wishlists.A.id,
        store_b_wishlist_id: wishlists.B.id,
      },
    });
    log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${FIXTURE_KEY} runtime ids`);

    await verifyTwoStore(contactId, wishlists);
  }

  console.log(`\n✅ ${FIXTURE_KEY} ${DRY_RUN ? 'dry run complete' : 'seeded'} — customer ${REC.email}`);
}

/* ── teardown (reverse order: wishlists → products → account → contact) ───────── */

async function teardown() {
  assertSafeTarget();
  await auth();
  setUserFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
  await userAuth();
  console.log(`\n🧹 Two-store wishlist teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);

  const contact = await findContactByEmail(REC.email);
  const contactId = contact?.id;

  // 1. Wishlists (children of the customer) — matched by store + AGENT-TEST- name.
  const wishlistIds = [];
  if (contactId) {
    for (const [role, storeId] of [['A', STORE_A], ['B', STORE_B]]) {
      if (!storeId) continue;
      const found = await api('POST', '/api/carts/search', { type: 'Wishlist', storeId, customerId: contactId, take: 100 });
      for (const c of (found?.results || [])) {
        if (c.name?.startsWith(SEED_PREFIX) && wishlistSpecs(REC).some((w) => w.listName === c.name)) {
          wishlistIds.push(c.id);
          verbose(`store ${role}: wishlist ${c.name} (${c.id})`);
        }
      }
    }
  }
  if (wishlistIds.length && !DRY_RUN) {
    await api('DELETE', `/api/carts?${idsParam(wishlistIds)}`, null, { expectStatus: [200, 204, 404] }).catch((e) => log(`⚠ wishlist delete: ${e.message.slice(0, 120)}`));
    log(`✗ deleted ${wishlistIds.length} wishlist(s)`);
  } else log('– no seeded wishlists found');

  // 2. Products — hard AGENT-TEST name guard on top of the exact-code match, so a code collision with
  // a real product on the env can never delete it.
  const productIds = [];
  for (const spec of productSpecs(REC)) {
    const p = await findProductByCode(spec.sku);
    if (!p?.id) continue;
    if (!p.name?.startsWith(SEED_PREFIX)) { log(`⚠ skip ${spec.sku}: "${p.name}" lacks the ${SEED_PREFIX} prefix — not a seed product`); continue; }
    productIds.push(p.id);
  }
  if (productIds.length && !DRY_RUN) {
    await api('POST', '/api/catalog/listentries/delete', { objectIds: productIds, objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] })
      .catch((e) => log(`⚠ product delete: ${e.message.slice(0, 120)}`));
    log(`✗ deleted ${productIds.length} product(s)`);
  } else log('– no seeded products found');

  // 3. Pricelist created by this seeder.
  if (!DRY_RUN) {
    const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
    const ids = (s?.results || []).filter((p) => p?.name === PRICELIST_NAME).map((p) => p.id);
    if (ids.length) {
      await api('DELETE', `/api/pricing/pricelists?${idsParam(ids)}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
      log(`✗ deleted pricelist ${PRICELIST_NAME}`);
    }
  }

  // 4. Security account, then the contact (bottom-up).
  const user = await findUserByEmail(REC.email);
  if (user?.id && !DRY_RUN) {
    await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(REC.email)}`, null, { expectStatus: [200, 204, 404] }).catch((e) => log(`⚠ user delete: ${e.message.slice(0, 120)}`));
    log(`✗ deleted security account ${REC.email}`);
  }
  if (contactId && !DRY_RUN) {
    await api('DELETE', `/api/members?${idsParam([contactId])}`, null, { expectStatus: [200, 204, 404] }).catch((e) => log(`⚠ contact delete: ${e.message.slice(0, 120)}`));
    log(`✗ deleted contact ${REC.email}`);
  }

  // 5. Zero-residue assert across everything this seeder owns.
  const residual = await verifyRemoved(async () => {
    const left = [];
    for (const spec of productSpecs(REC)) {
      const p = await findProductByCode(spec.sku);
      if (p?.id && p.name?.startsWith(SEED_PREFIX)) left.push(p.id);
    }
    if (contactId) {
      for (const storeId of [STORE_A, STORE_B].filter(Boolean)) {
        const found = await api('POST', '/api/carts/search', { type: 'Wishlist', storeId, customerId: contactId, take: 100 });
        for (const c of (found?.results || [])) if (wishlistSpecs(REC).some((w) => w.listName === c.name)) left.push(c.id);
      }
    }
    if (await findUserByEmail(REC.email)) left.push(REC.email);
    return left;
  });
  console.log(residual === 0
    ? `\n✅ Wishlist teardown verified — 0 residue`
    : `\n⚠ Wishlist teardown incomplete — ${residual} entit(y/ies) still present`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ SEED FAILED: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
