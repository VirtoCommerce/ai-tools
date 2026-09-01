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
  ROOT, STORE_ID, BACK_URL, DRY_RUN, VERBOSE, TEARDOWN,
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

/**
 * WHO OWNS A WISHLIST — the one thing this seeder got wrong until 2026-08-25.
 *
 * A Wishlist-type cart's `customerId` is the SECURITY ACCOUNT id (ApplicationUser.Id), NOT the
 * Contact member id. The storefront resolves the signed-in session to that account id and sends it
 * as xAPI `products(userId:)`, so a wishlist hung off the contact id is invisible to the storefront:
 * /account/lists renders "You have not created any lists yet" and every in-wishlist marker reads
 * false, while an admin-side /api/carts/search by contact id happily returns both lists. A seeder
 * that exits 0 on that state is the exact vacuous-fixture failure this fixture exists to prevent.
 *
 * LIVE-CONFIRMED on vcst-qa 2026-08-25 — sampled 14 distinct customerIds across the store's 937
 * wishlists: only this fixture's resolved via GET /api/members/{id}; every genuine storefront-created
 * list's did not. Worked example: mutykovaelena@gmail.com has account f194c370… / contact e1e83021…,
 * and its storefront list carries customerId=f194c370… — the ACCOUNT.
 */
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

/**
 * One-time migration sweep: delete this fixture's lists that an earlier run created against the
 * CONTACT id. They are unreachable orphans — no storefront session resolves to that id, and teardown
 * (which searches by account id) would leave them behind forever. Name-guarded to this fixture's own
 * AGENT-TEST- list names, so nothing else the contact owns is touched.
 */
async function dropMisownedWishlists(contactId, ownerId, stores) {
  if (!contactId || contactId === ownerId) return;
  const stale = [];
  for (const role of ['A', 'B']) {
    const found = await api('POST', '/api/carts/search', { type: 'Wishlist', storeId: stores[role].id, customerId: contactId, take: 100 });
    for (const c of (found?.results || [])) {
      if (wishlistSpecs(REC).some((w) => w.listName === c.name) && c.name?.startsWith(SEED_PREFIX)) stale.push(c.id);
    }
  }
  if (!stale.length) return;
  if (DRY_RUN) { log(`[DRY] would delete ${stale.length} contact-owned wishlist(s) left by an earlier run`); return; }
  await api('DELETE', `/api/carts?${idsParam(stale)}`, null, { expectStatus: [200, 204, 404] }).catch((e) => log(`⚠ stale wishlist delete: ${e.message.slice(0, 120)}`));
  log(`✗ removed ${stale.length} wishlist(s) owned by the CONTACT id (unreachable by any storefront session)`);
}

/* ── verification ─────────────────────────────────────────────────────────────── */

/**
 * Prove the fixture is what it claims: the SAME customer resolves to two DIFFERENT wishlist ids in two
 * DIFFERENT stores, holding two DIFFERENT products. A green seed that cannot show this is a vacuous
 * fixture, so this is a hard gate, not a log line.
 */
async function verifyTwoStore(ownerId, contactId, wishlists) {
  const seen = [];
  for (const role of ['A', 'B']) {
    const w = wishlists[role];
    const found = await api('POST', '/api/carts/search', { type: 'Wishlist', storeId: w.storeId, customerId: ownerId, take: 100 });
    const hit = (found?.results || []).find((c) => c.id === w.id);
    if (!hit) throw new Error(`wishlist ${role} (${w.id}) is not returned by a store-scoped search on "${w.storeId}"`);
    // Ownership is the failure mode that hid for a whole run: both lists existed, both were findable
    // by contact id, and the storefront saw neither. Assert the OWNER, not merely the existence.
    if (hit.customerId !== ownerId) {
      throw new Error(`wishlist ${role} (${w.id}) is owned by "${hit.customerId}", not the security account "${ownerId}" — the storefront resolves the session to the ACCOUNT id, so it would not see this list`);
    }
    if (contactId && hit.customerId === contactId) {
      throw new Error(`wishlist ${role} (${w.id}) is owned by the CONTACT id "${contactId}" — see the ownership note above; /account/lists would render empty`);
    }
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

/**
 * THE ACCEPTANCE PROOF — sign in as the fixture customer exactly the way the storefront does, and
 * read the in-wishlist matrix back through xAPI with the id THAT SESSION resolves to.
 *
 * An admin-token probe cannot show this: it lets the caller choose the userId, so it proves the data
 * exists for SOME id, not that the storefront's own id finds it. That gap is precisely how CAT-079 /
 * CAT-080 came to be blocked against a seeder that exited 0. So this signs in for real, asserts the
 * session resolves to the account id we seeded against, and then asserts the full 2×2 matrix:
 *
 *              store A            store B
 *   product A  inWishlist=true    inWishlist=false
 *   product B  inWishlist=false   inWishlist=true
 *
 * Both `false` cells are load-bearing: they are what a pre-VCST-5705 build (storeId accepted but
 * never applied) gets wrong, so a fixture that cannot produce them cannot fail on the regression.
 */
async function verifyStorefrontMatrix(ownerId, products, stores) {
  const password = resolvePassword(REC.password);

  async function storefrontToken(storeId) {
    const res = await fetch(`${BACK_URL}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', username: REC.email, password, scope: 'offline_access', storeId }),
    });
    if (!res.ok) {
      const body = (await res.text().catch(() => '')).slice(0, 200);
      throw new Error(`storefront sign-in failed for ${REC.email} @ store "${storeId}": ${res.status} ${body}`);
    }
    return (await res.json()).access_token;
  }

  async function gql(token, query, variables) {
    const res = await fetch(`${BACK_URL}/graphql`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables }),
    });
    const j = await res.json().catch(() => ({}));
    if (j.errors?.length) throw new Error(`graphql: ${j.errors.map((e) => e.message).join('; ').slice(0, 300)}`);
    return j.data;
  }

  const ME = 'query { me { id userName contact { id } } }';
  const PRODUCTS = `query($storeId:String!,$userId:String!,$q:String!){
    products(storeId:$storeId,userId:$userId,filter:$q,first:10){ items { code inWishlist wishlistIds } }
  }`;

  log('');
  log('✓ storefront acceptance proof (real sign-in, session-resolved id):');
  const matrix = {};
  for (const role of ['A', 'B']) {
    const storeId = stores[role].id;
    const token = await storefrontToken(storeId);

    const me = (await gql(token, ME)).me;
    // The whole bug in one assertion: if the session resolves to something other than the id the
    // wishlists hang off, the storefront cannot see them no matter how green the seed looked.
    if (me?.id !== ownerId) {
      throw new Error(
        `store ${role}: the storefront session for ${REC.email} resolves to me.id="${me?.id}" but the `
        + `wishlists are owned by "${ownerId}" — /account/lists would render empty and every `
        + `in-wishlist marker would read false. (me.contact.id="${me?.contact?.id}")`,
      );
    }

    const codes = [products.A.code, products.B.code];
    const items = (await gql(token, PRODUCTS, {
      storeId, userId: me.id, q: codes.map((c) => `code:"${c}"`).join(' OR '),
    }))?.products?.items || [];
    const byCode = Object.fromEntries(items.map((i) => [i.code, i]));
    matrix[role] = byCode;
    log(`    store ${role} (${storeId}) as me.id=${me.id}: `
      + codes.filter((c) => byCode[c])
        .map((c) => `${c} inWishlist=${byCode[c].inWishlist} wishlistIds=[${(byCode[c].wishlistIds || []).join(',')}]`).join(' | ')
      + codes.filter((c) => !byCode[c]).map((c) => ` | ${c} not in this store's catalog`).join(''));
  }

  /**
   * VISIBILITY vs the MATRIX — two different requirements, and conflating them over-constrains the
   * fixture. CAT-079/CAT-080 both run on STORE A, so store A must show BOTH cards (that co-visibility
   * is what lets the isolation assertion fail rather than silently skip). Store B only has to prove
   * its own list resolves; product A is deliberately not in store B's catalog, and demanding it there
   * would mean linking a store-A fixture product into a second store for no case's benefit.
   */
  for (const code of [products.A.code, products.B.code]) {
    if (!matrix.A[code]) throw new Error(`store A: product ${code} is not visible to the storefront — CAT-079 needs BOTH cards on store A's /catalog page, or the isolation assertion cannot fail`);
  }
  if (!matrix.B[products.B.code]) throw new Error(`store B: product ${products.B.code} is not visible in its own store — the store-B wishlist could not be exercised there`);

  // `false` cells are as load-bearing as the `true` ones: a pre-VCST-5705 build (storeId accepted but
  // never applied) gets exactly those wrong, so a fixture that cannot produce them cannot fail.
  const expect = [
    ['A', products.A.code, true], ['A', products.B.code, false],
    ['B', products.B.code, true], ['B', products.A.code, false],
  ].filter(([role, code]) => matrix[role][code]);
  const wrong = expect.filter(([role, code, want]) => matrix[role][code].inWishlist !== want)
    .map(([role, code, want]) => `store ${role} / ${code}: inWishlist=${matrix[role][code].inWishlist}, expected ${want}`);
  if (wrong.length) throw new Error(`in-wishlist matrix is wrong — the fixture cannot support CAT-079/CAT-080:\n    ${wrong.join('\n    ')}`);

  // A leak shows up as MORE than one wishlist id in a store context — the VCST-5705 signature.
  for (const [role, code] of expect.map(([r, c]) => [r, c])) {
    const ids = matrix[role][code].wishlistIds || [];
    if (ids.length > 1) throw new Error(`store ${role} / ${code}: wishlistIds=[${ids.join(',')}] — more than one store's list leaked (the VCST-5705 signature)`);
  }
  log(`    matrix OK (${expect.length} cells): A=true/B=false in store A, B=true in store B`);
  return matrix;
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

  // OWNER = the security account id. See the ownership note above findWishlist(): the storefront
  // resolves the signed-in session to this id and sends it as xAPI products(userId:); a wishlist hung
  // off the contact id is invisible to it. Seeding against contactId is what blocked CAT-079/CAT-080.
  const ownerId = userId;

  // Sweep any list this seeder previously created against the WRONG owner. Left in place they are
  // orphans no storefront session can reach, and teardown (which now searches by account id) would
  // never find them either.
  await dropMisownedWishlists(contactId, ownerId, stores);

  const wishlists = {};
  for (const w of wishlistSpecs(REC)) {
    const created = await ensureWishlist({
      storeId: stores[w.role].id, listName: w.listName, product: products[w.role], customerId: ownerId,
    });
    wishlists[w.role] = { id: created?.id, storeId: stores[w.role].id };
  }

  if (!DRY_RUN) {
    await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', rebuild: false }], { expectStatus: [200, 204] })
      .catch((e) => log(`⚠ reindex: ${e.message.slice(0, 100)}`));

    // Runtime values → aliases.<env>.json ONLY. store_a_id/store_b_id ride along because they are
    // per-env (STORE_ID / STORE_ID_SECONDARY), not because they are GUIDs.
    syncEnvAliases(CSV_SOURCE.key, {
      [FIXTURE_KEY]: {
        contact_id: contactId,
        user_id: ownerId,
        store_a_id: stores.A.id,
        store_b_id: stores.B.id,
        store_a_wishlist_id: wishlists.A.id,
        store_b_wishlist_id: wishlists.B.id,
      },
    });
    log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${FIXTURE_KEY} runtime ids`);

    await verifyTwoStore(ownerId, contactId, wishlists);
    await verifyStorefrontMatrix(ownerId, products, stores);
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
  // Resolve the account id BEFORE anything is deleted — the security account is removed in step 4,
  // and the step-5 zero-residue re-search needs this id to look the wishlists up.
  const ownerId = (await findUserByEmail(REC.email))?.id;

  // 1. Wishlists (children of the customer) — matched by store + AGENT-TEST- name. Searched under
  // BOTH owner ids: the account id is the correct owner, the contact id catches lists left by a
  // pre-2026-08-25 seed so teardown still reaches zero residue on an env seeded by the old code.
  const wishlistIds = [];
  for (const ownerCandidate of [ownerId, contactId].filter(Boolean)) {
    for (const [role, storeId] of [['A', STORE_A], ['B', STORE_B]]) {
      if (!storeId) continue;
      const found = await api('POST', '/api/carts/search', { type: 'Wishlist', storeId, customerId: ownerCandidate, take: 100 });
      for (const c of (found?.results || [])) {
        if (c.name?.startsWith(SEED_PREFIX) && wishlistSpecs(REC).some((w) => w.listName === c.name) && !wishlistIds.includes(c.id)) {
          wishlistIds.push(c.id);
          verbose(`store ${role}: wishlist ${c.name} (${c.id}) owner=${ownerCandidate}`);
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
    for (const ownerCandidate of [ownerId, contactId].filter(Boolean)) {
      for (const storeId of [STORE_A, STORE_B].filter(Boolean)) {
        const found = await api('POST', '/api/carts/search', { type: 'Wishlist', storeId, customerId: ownerCandidate, take: 100 });
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
