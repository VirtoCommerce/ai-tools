#!/usr/bin/env node
/**
 * seed-ga4-lists.mjs — VCST-6017 storefront product-list fixtures (GA4 markup tracking, vc-frontend PR #2543).
 *
 *   --only related     PDP "Related products" widget: an AGENT-TEST anchor product with RELATED.count catalog
 *                      associations to pool products (distinct prices) → PROD_GA4_RELATED_ANCHOR
 *   --only variations  PDP "Variations" widget: an AGENT-TEST parent with VARIATIONS.count priced + stocked
 *                      variations (> one page) → PROD_GA4_VARIATION_PARENT
 *   --only cart        the run account's cart CONVERGED from any state: exactly 1 line + 8 saved-for-later + 6
 *                      recently-browsed, all disjoint, quantities 1
 *                      → CART_GA4_SFL_RB. FIFTH RULE: this is pooled, test-mutable state (every PDP visit by
 *                      the account rewrites recently-browsed; other suites use the same cart), so it is a
 *                      PRECONDITION to re-run immediately before the case, not durable seed data.
 *   (no --only)        all three. The Page Builder pages are `npm run seed:cms-pages -- --only PB_GA4_…`.
 *
 * Rules, shapes and the disjoint product pool live in ./ga4-lists-specs.mjs + ./ga4-pool.mjs (shared with
 * the Page Builder seeder and the drift guard). Runtime ids → aliases.<env>.json.
 *
 *   TEST_ENV=vcst npm run seed:ga4-lists [-- --only cart] [-- --dry-run] [-- --verbose]
 *   TEST_ENV=vcst npm run seed:ga4-lists:teardown
 */
import '../../lib/sync-stdio.mjs';
import {
  BACK_URL, FRONT_URL, STORE_ID, DRY_RUN, VERBOSE, TEARDOWN, ONLY, log, verbose, assertSafeTarget, auth, api,
  ensureVirtualCatalog, ensureCategoryPath, storeMainFulfillmentCenter, buildStoreSeo, writeEnvAliasOverride,
  verifyRemoved, idsParam, enrichProductContent,
} from '../../lib/seed-common.mjs';
import { storefrontToken } from '../../lib/loyalty-ephemeral-account.mjs';
import { productSlug } from '../products/standard-specs.mjs';
import {
  SEED_PREFIX, CURRENCY, CULTURE, CATEGORY_PATH, PRICELIST_NAME, RELATED, VARIATIONS, STOREFRONT_WINDOWS, ALIASES,
  variationSpecs, buildProductBody, buildAssociationBodies, isSeededAssociation, partitionProblems, validateSpec,
  savedForLaterTarget, RB_SESSION_ID,
} from './ga4-lists-specs.mjs';
import { discoverGa4Pool } from './ga4-pool.mjs';

const specProblems = validateSpec();
if (specProblems.length) {
  console.error('ABORT: ga4-lists-specs.mjs does not describe discriminating fixtures:');
  for (const p of specProblems) console.error(`  ✗ ${p}`);
  process.exit(2);
}
const PARTS = ['related', 'variations', 'cart'];
const want = ONLY ? new Set(String(ONLY).split(',')) : new Set(PARTS);
for (const w of want) if (!PARTS.includes(w)) { console.error(`--only: unknown part "${w}" (${PARTS.join('|')})`); process.exit(2); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function gql(query, variables = {}, token = null) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ query, variables }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.errors?.length) throw new Error(`graphql ${res.status}: ${JSON.stringify(j?.errors || '').slice(0, 240)}`);
  return j.data;
}

/* ── catalog helpers ─────────────────────────────────────────────────────── */
/** Exact-code lookup through list entries (DB-backed, so no index lag; an exact `code` criterion, never a
 * keyword window that categories can fill — authoring guide §5a). A failed read throws: UNKNOWN ≠ absent. */
async function findByCode(code) {
  const l = await api('POST', '/api/catalog/listentries', { code, objectType: 'CatalogProduct', searchInVariations: true, take: 10 }, { expectStatus: [200, 201] });
  const e = (l?.listEntries || l?.results || []).find((p) => p.code === code && p.type === 'product');
  return e ? { id: e.id, code, name: e.name } : null;
}

async function ensureProduct(spec, loc, { mainProductId = null, seo = true } = {}) {
  const existing = await findByCode(spec.code);
  if (existing) {
    if (mainProductId && !DRY_RUN) {
      const full = await api('GET', `/api/catalog/products/${existing.id}`, null, { expectStatus: [200, 404] });
      if (full && full.mainProductId !== mainProductId) {
        full.mainProductId = mainProductId; delete full.variations;
        await api('POST', '/api/catalog/products', full, { expectStatus: [200, 201, 204] });
        log(`↻ re-linked ${spec.code} → parent`);
      }
    }
    verbose(`↻ ${spec.code} (${existing.id})`);
    return existing;
  }
  if (DRY_RUN) { log(`[DRY] would create ${spec.code}`); return { id: `dry-${spec.code}`, code: spec.code, name: spec.name }; }
  const seoInfos = seo ? [buildStoreSeo({ semanticUrl: productSlug(spec.name), pageTitle: spec.name })] : [];
  const p = await api('POST', '/api/catalog/products', buildProductBody(spec, { catalogId: loc.catalogId, categoryId: loc.categoryId, seoInfos, mainProductId }), { expectStatus: [200, 201] });
  verbose(`✓ ${spec.code} → ${p?.id}`);
  return { id: p?.id, code: spec.code, name: spec.name };
}

async function ensurePriceList(virtualCatalogId) {
  const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
  let pl = (s?.results || []).find((p) => p?.name === PRICELIST_NAME);
  if (pl || DRY_RUN) return pl || { id: 'dry-pricelist' };
  pl = await api('POST', '/api/pricing/pricelists', { name: PRICELIST_NAME, currency: CURRENCY, description: 'VCST-6017 GA4 list fixtures' }, { expectStatus: [200, 201] });
  await api('POST', '/api/pricing/assignments', { name: `${PRICELIST_NAME} → store virtual catalog`, pricelistId: pl.id, catalogId: virtualCatalogId, priority: 100 }, { expectStatus: [200, 201] });
  log(`✓ pricelist ${PRICELIST_NAME} (${pl.id})`);
  return pl;
}

async function priceAndStock(pl, ffc, rows) {
  if (DRY_RUN) return;
  await api('PUT', '/api/products/prices', rows.map((r) => ({ productId: r.id, prices: [{ pricelistId: pl.id, productId: r.id, list: r.price, currency: CURRENCY, minQuantity: 1 }] })), { expectStatus: [200, 204] });
  await api('PUT', '/api/inventory/plenty', rows.map((r) => ({ fulfillmentCenterId: ffc.id, productId: r.id, inStockQuantity: r.stock, reservedQuantity: 0, status: 'Enabled' })), { expectStatus: [200, 204] });
}

async function linkToStore(virtualCatalogId, loc, id) {
  if (DRY_RUN) return;
  await api('POST', '/api/catalog/listentrylinks', [{ listEntryId: id, listEntryType: 'product', catalogId: virtualCatalogId, categoryId: loc.categoryId }], { expectStatus: [200, 204] })
    .catch((e) => (/PK_Item|duplicate/i.test(e.message) ? verbose('link already present') : log(`⚠ link: ${e.message.slice(0, 120)}`)));
}

async function reindex(ids) {
  if (DRY_RUN || !ids.length) return;
  await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: ids, rebuild: false }], { expectStatus: [200, 204] });
}

/** Probe the storefront read path (authoring guide §5a) until `check` holds; a timeout is a failure. */
async function waitFor(label, check, { tries = 20, delayMs = 6000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await check().catch((e) => { verbose(`${label}: ${e.message.slice(0, 120)}`); return null; });
    if (v) return v;
    await sleep(delayMs);
  }
  throw new Error(`${label}: not visible to the storefront after ${(tries * delayMs) / 1000}s`);
}

const PRODUCT_Q = `query($s:String!,$id:String!){ product(storeId:$s,id:$id,cultureName:"${CULTURE}",currencyCode:"${CURRENCY}"){
  id code name slug hasVariations associations{ totalCount } price{ actual{ amount } } } }`;

async function catalogContext() {
  const virtualCatalogId = await ensureVirtualCatalog(api);
  const loc = await ensureCategoryPath(api, CATEGORY_PATH);
  if (!loc) throw new Error(`could not resolve category path "${CATEGORY_PATH}"`);
  const ffcs = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 200 }, { expectStatus: [200, 201] });
  const ffc = await storeMainFulfillmentCenter(api, (ffcs?.results || []).filter((f) => f.isActive !== false));
  if (!ffc?.id) throw new Error('store main fulfillment center not resolvable — run `npm run seed:inventory` first');
  const pl = await ensurePriceList(virtualCatalogId);
  return { virtualCatalogId, loc, ffc, pl };
}

/* ── related ─────────────────────────────────────────────────────────────── */
async function seedRelated(ctx, pool) {
  const anchor = await ensureProduct(RELATED.anchor, ctx.loc);
  await priceAndStock(ctx.pl, ctx.ffc, [{ id: anchor.id, price: RELATED.anchor.price, stock: RELATED.anchor.stock }]);
  await linkToStore(ctx.virtualCatalogId, ctx.loc, anchor.id);
  if (!DRY_RUN) await enrichProductContent(anchor.id, { images: 1, code: RELATED.anchor.code }).catch((e) => log(`⚠ image: ${e.message.slice(0, 100)}`));
  const targets = pool.related;
  if (!DRY_RUN) {
    // Reconcile: our anchor's associations are ALL ours — drop any not in the current target set, add the missing.
    const existing = await api('GET', `/api/catalog/products/associations/${anchor.id}`, null, { expectStatus: [200, 404] }) || [];
    const wantIds = new Set(targets.map((p) => p.id));
    const stale = existing.filter((a) => !wantIds.has(a.associatedObjectId));
    if (stale.length) await api('DELETE', `/api/catalog/products/associations?${idsParam(stale.map((a) => a.id))}`, null, { expectStatus: [200, 204] });
    const have = new Set(existing.filter((a) => wantIds.has(a.associatedObjectId)).map((a) => a.associatedObjectId));
    const missing = buildAssociationBodies(anchor.id, targets).filter((b) => !have.has(b.associatedObjectId));
    if (missing.length) await api('POST', '/api/catalog/products/associations', missing, { expectStatus: [200, 204] });
    log(`✓ related: ${targets.length} associations (${missing.length} added, ${stale.length} removed), group "${RELATED.group}"`);
  }
  await reindex([anchor.id]);
  if (DRY_RUN) return null;
  const seen = await waitFor('related anchor', async () => {
    const d = await gql(PRODUCT_Q, { s: STORE_ID, id: anchor.id });
    return d?.product?.slug && d.product.associations?.totalCount === targets.length ? d.product : null;
  });
  const rel = await gql(`query($s:String!,$id:String!){ product(storeId:$s,id:$id,cultureName:"${CULTURE}",currencyCode:"${CURRENCY}"){ associations(first:${STOREFRONT_WINDOWS.relatedFetchFirst}){ items{ product{ id code price{ actual{ amount } } } } } } }`, { s: STORE_ID, id: anchor.id });
  const items = rel.product.associations.items.map((i) => i.product).filter(Boolean);
  const prices = new Set(items.map((p) => Math.round(p.price.actual.amount * 100)));
  if (items.length !== targets.length || prices.size !== items.length) throw new Error(`related widget would render ${items.length} products with ${prices.size} distinct prices, want ${targets.length} distinct`);
  log(`✓ related proof: xAPI Query.product.associations → ${items.length} products, ${prices.size} distinct prices`);
  return { _inline: true, id: anchor.id, code: RELATED.anchor.code, name: RELATED.anchor.name, slug: seen.slug, url: `/${seen.slug}`,
    related_count: items.length, related_codes: targets.map((p) => p.code).join(','), related_ids: targets.map((p) => p.id).join(',') };
}

/* ── variations ──────────────────────────────────────────────────────────── */
async function seedVariations(ctx) {
  const parent = await ensureProduct(VARIATIONS.parent, ctx.loc);
  await linkToStore(ctx.virtualCatalogId, ctx.loc, parent.id);
  if (!DRY_RUN) await enrichProductContent(parent.id, { images: 1, code: VARIATIONS.parent.code }).catch((e) => log(`⚠ image: ${e.message.slice(0, 100)}`));
  const vs = variationSpecs();
  const rows = [{ id: parent.id, price: VARIATIONS.parent.price, stock: VARIATIONS.parent.stock }];
  for (const v of vs) {
    const p = await ensureProduct(v, ctx.loc, { mainProductId: parent.id, seo: false });
    rows.push({ id: p.id, price: v.price, stock: v.stock, code: v.code });
  }
  await priceAndStock(ctx.pl, ctx.ffc, rows);
  log(`✓ variations: parent + ${vs.length} variations priced ${vs[0].price}…${vs[vs.length - 1].price} ${CURRENCY}`);
  await reindex(rows.map((r) => r.id));
  if (DRY_RUN) return null;
  // The PDP pages variations with filter "productfamilyid:<id> is:product,variation" — probe exactly that.
  const VQ = `query($s:String!,$f:String){ products(storeId:$s,cultureName:"${CULTURE}",currencyCode:"${CURRENCY}",first:${STOREFRONT_WINDOWS.variationsPageSize},filter:$f){ totalCount items{ price{ actual{ amount } } } } }`;
  const filter = `productfamilyid:${parent.id} is:product,variation`;
  const got = await waitFor('variation family', async () => {
    const d = await gql(VQ, { s: STORE_ID, f: filter });
    return d.products.totalCount >= vs.length ? d.products : null;
  });
  const seen = await gql(PRODUCT_Q, { s: STORE_ID, id: parent.id });
  if (!seen.product?.hasVariations) throw new Error('parent does not report hasVariations — the Variations widget would not render');
  const pages = Math.ceil(got.totalCount / STOREFRONT_WINDOWS.variationsPageSize);
  log(`✓ variations proof: family search totalCount=${got.totalCount} → ${pages} page(s) of ${STOREFRONT_WINDOWS.variationsPageSize}, hasVariations=true`);
  return { _inline: true, id: parent.id, code: VARIATIONS.parent.code, name: VARIATIONS.parent.name, slug: seen.product.slug, url: `/${seen.product.slug}`,
    variations_count: vs.length, family_total: got.totalCount, page_size: STOREFRONT_WINDOWS.variationsPageSize, pages };
}

/* ── cart / saved-for-later / recently browsed (the run account) ─────────── */
const CART_Q = `query($s:String!,$u:String!){ cart(storeId:$s,userId:$u,currencyCode:"${CURRENCY}",cultureName:"${CULTURE}"){ id items{ id productId sku quantity } } }`;
const SFL_Q = `query($s:String!,$u:String!){ getSavedForLater(storeId:$s,userId:$u,currencyCode:"${CURRENCY}",cultureName:"${CULTURE}"){ id items{ id productId sku quantity } } }`;
const RB_Q = `query($s:String!){ recentlyBrowsed(storeId:$s,currencyCode:"${CURRENCY}",cultureName:"${CULTURE}",maxProducts:${STOREFRONT_WINDOWS.recentlyBrowsedMax}){ products{ id code } } }`;
const ADD_M = `mutation($c:InputAddItemType!){ addItem(command:$c){ id } }`;
const REMOVE_M = `mutation($c:InputRemoveItemType!){ removeCartItem(command:$c){ id } }`;
const QTY_M = `mutation($c:InputChangeCartItemQuantityType!){ changeCartItemQuantity(command:$c){ id } }`;
const TO_SFL_M = `mutation($c:InputSaveForLaterType!){ moveToSavedForLater(command:$c){ list{ id } } }`;
const FROM_SFL_M = `mutation($c:InputSaveForLaterType!){ moveFromSavedForLater(command:$c){ cart{ id } } }`;
const PUSH_M = `mutation($c:InputPushHistoricalEventType!){ pushHistoricalEvent(command:$c) }`;

async function accountSession() {
  const email = process.env.USER_EMAIL;
  if (!email || !process.env.USER_PASSWORD) throw new Error('USER_EMAIL / USER_PASSWORD not resolvable through the layered loader');
  const token = await storefrontToken(BACK_URL, STORE_ID, email, process.env.USER_PASSWORD);
  if (!token) throw new Error(`storefront sign-in failed for USER_EMAIL on ${STORE_ID}`);
  const me = await gql('{ me { id } }', {}, token);
  return { token, userId: me.me.id, email };
}
const base = (s) => ({ storeId: STORE_ID, userId: s.userId, currencyCode: CURRENCY, cultureName: CULTURE });
const readCart = async (s) => (await gql(CART_Q, { s: STORE_ID, u: s.userId }, s.token)).cart;
const readSfl = async (s) => (await gql(SFL_Q, { s: STORE_ID, u: s.userId }, s.token)).getSavedForLater;
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

/**
 * CONVERGE the account to the target state from ANY prior state (FIFTH RULE precondition):
 *   cart = exactly the cartLine product(s) at quantity 1 — every other line is removed;
 *   SFL  = exactly the 8 seeded products (savedForLater + savedForLaterTail) at quantity 1 — foreign items
 *          are moved out and removed with the other extra cart lines;
 *   RB   = exactly the 6 seeded products, pushed LAST under the seeder's own session (RB_SESSION_ID — the
 *          spec explains why a sessionless push cannot be made deterministic).
 * Reported 2026-10-13: a browser run left an extra line, 111798 at qty 2 and the RB window holding the run's
 * own PDPs; the earlier additive step could not undo any of that.
 */
async function seedCart(pool) {
  const s = await accountSession();
  const cartTarget = pool.cartLine, sflTarget = savedForLaterTarget(pool), rbTarget = pool.recentlyBrowsed;
  const cartIds = cartTarget.map((p) => p.id), sflIds = sflTarget.map((p) => p.id), rbIds = rbTarget.map((p) => p.id);
  let cart = await readCart(s), sfl = await readSfl(s);
  if (DRY_RUN) {
    const extra = (cart?.items || []).filter((i) => !cartIds.includes(i.productId));
    const foreign = (sfl?.items || []).filter((i) => !sflIds.includes(i.productId));
    log(`[DRY] cart: would remove ${extra.length} line(s) [${extra.map((i) => i.sku).join(',')}] and keep ${cartTarget.map((p) => p.code)} x1; SFL: would drop ${foreign.length} foreign [${foreign.map((i) => i.sku).join(',')}]; RB: would push ${rbTarget.length} under ${RB_SESSION_ID}`);
    return null;
  }
  const removed = [], fixedQty = [];
  // 1. SFL items that are foreign, or ours at the wrong quantity → back into the cart (handled in step 3 / 2).
  const outOfSfl = (sfl?.items || []).filter((i) => !sflIds.includes(i.productId) || i.quantity !== 1);
  if (outOfSfl.length) {
    await gql(FROM_SFL_M, { c: { ...base(s), cartId: cart?.id, lineItemIds: outOfSfl.map((i) => i.id) } }, s.token);
    cart = await readCart(s); sfl = await readSfl(s);
  }
  // 2. Every SFL target not saved yet: make it a qty-1 cart line, then move that line.
  for (const p of sflTarget) {
    if ((sfl?.items || []).some((i) => i.productId === p.id)) continue;
    let line = (cart?.items || []).find((i) => i.productId === p.id);
    if (!line) {
      await gql(ADD_M, { c: { ...base(s), cartId: cart?.id, productId: p.id, quantity: 1 } }, s.token);
      cart = await readCart(s); line = cart.items.find((i) => i.productId === p.id);
    }
    if (line.quantity !== 1) { await gql(QTY_M, { c: { ...base(s), cartId: cart.id, lineItemId: line.id, quantity: 1 } }, s.token); fixedQty.push(p.code); }
    await gql(TO_SFL_M, { c: { ...base(s), cartId: cart.id, lineItemIds: [line.id] } }, s.token);
    cart = await readCart(s); sfl = await readSfl(s);
  }
  // 3. Cart: remove every non-target line (and duplicate target lines), set the target to qty 1, add if missing.
  cart = await readCart(s);
  const kept = new Set();
  for (const line of cart?.items || []) {
    if (cartIds.includes(line.productId) && !kept.has(line.productId)) {
      kept.add(line.productId);
      if (line.quantity !== 1) { await gql(QTY_M, { c: { ...base(s), cartId: cart.id, lineItemId: line.id, quantity: 1 } }, s.token); fixedQty.push(line.sku); }
      continue;
    }
    await gql(REMOVE_M, { c: { ...base(s), cartId: cart.id, lineItemId: line.id } }, s.token);
    removed.push(`${line.sku}x${line.quantity}`);
  }
  for (const p of cartTarget) if (!kept.has(p.id)) await gql(ADD_M, { c: { ...base(s), cartId: cart?.id, productId: p.id, quantity: 1 } }, s.token);
  // 4. Recently browsed — LAST, oldest first, one call per product so each row gets its own ModifiedDate.
  for (const p of rbTarget) await gql(PUSH_M, { c: { storeId: STORE_ID, productId: p.id, eventType: 'click', sessionId: RB_SESSION_ID } }, s.token);

  // Proof — exactly what the cart page reads.
  cart = await readCart(s); sfl = await readSfl(s);
  const rb = await waitFor('recently browsed = the seeded 6', async () => {
    const got = ((await gql(RB_Q, { s: STORE_ID }, s.token)).recentlyBrowsed?.products || []).map((p) => p.id);
    return sameSet(got, rbIds) ? got : null;
  }, { tries: 10, delayMs: 3000 });
  const problems = [];
  if (!sameSet((cart?.items || []).map((i) => i.productId), cartIds)) problems.push(`cart holds [${cart.items.map((i) => i.sku).join(',')}], want exactly [${cartTarget.map((p) => p.code)}]`);
  if ((cart?.items || []).some((i) => i.quantity !== 1)) problems.push('a cart line is not at quantity 1');
  if (!sameSet((sfl?.items || []).map((i) => i.productId), sflIds)) problems.push(`SFL holds ${sfl.items.length} [${sfl.items.map((i) => i.sku).join(',')}], want exactly the ${sflIds.length} seeded`);
  if ((sfl?.items || []).some((i) => i.quantity !== 1)) problems.push('an SFL item is not at quantity 1');
  if (rb.some((id) => sflIds.includes(id) || cartIds.includes(id))) problems.push('recently browsed overlaps SFL or the cart');
  if (problems.length) throw new Error(`cart proof failed: ${problems.join('; ')}`);
  const rbOrder = rb.map((id) => rbTarget.find((p) => p.id === id).code);
  log(`✓ cart converged: removed ${removed.length ? removed.join(',') : 'nothing'}${fixedQty.length ? `; quantity → 1 for ${fixedQty.join(',')}` : ''}`);
  log(`✓ cart proof: cart = [${cart.items.map((i) => `${i.sku}x${i.quantity}`).join(',')}], SFL = ${sfl.items.length} seeded at qty 1, recently browsed = exactly the ${rb.length} seeded (newest first ${rbOrder.join(',')}), disjoint from SFL + cart`);
  return { _inline: true, account_env: 'USER_EMAIL', cart_id: cart.id, saved_for_later_list_id: sfl.id, rb_session_id: RB_SESSION_ID,
    cart_line_codes: cartTarget.map((p) => p.code).join(','), cart_line_ids: cartIds.join(','),
    saved_for_later_codes: sflTarget.map((p) => p.code).join(','), saved_for_later_ids: sflIds.join(','),
    recently_browsed_codes: rbTarget.map((p) => p.code).join(','), recently_browsed_ids: rbIds.join(','),
    recently_browsed_order_newest_first: rbOrder.join(','),
    saved_for_later_count: sfl.items.length, sfl_show_more_step: STOREFRONT_WINDOWS.savedForLaterStep, url: '/cart' };
}

/* ── main / teardown ─────────────────────────────────────────────────────── */
async function main() {
  assertSafeTarget();
  await auth();
  console.log(`\n🌱 VCST-6017 GA4 list fixtures${DRY_RUN ? ' (DRY RUN)' : ''} — ${[...want].join(', ')}`);
  const pool = await discoverGa4Pool({ backUrl: BACK_URL, storeId: STORE_ID });
  const pp = partitionProblems(pool);
  if (pp.length) throw new Error(`pool is not discriminating: ${pp.join('; ')}`);
  const writeback = {};
  if (want.has('related') || want.has('variations')) {
    const ctx = await catalogContext();
    if (want.has('related')) { const r = await seedRelated(ctx, pool); if (r) writeback[ALIASES.related] = r; }
    if (want.has('variations')) { const r = await seedVariations(ctx); if (r) writeback[ALIASES.variations] = r; }
  }
  if (want.has('cart')) { const r = await seedCart(pool); if (r) writeback[ALIASES.cart] = r; }
  if (!DRY_RUN && Object.keys(writeback).length) {
    writeEnvAliasOverride(writeback);
    log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: ${Object.keys(writeback).join(', ')}`);
    for (const [k, v] of Object.entries(writeback)) if (v.url) log(`   ${k}: ${FRONT_URL}${v.url}`);
  }
  console.log(`\n✅ ${DRY_RUN ? 'dry run complete' : 'seeded'}`);
}

async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 VCST-6017 GA4 list fixtures teardown${DRY_RUN ? ' [DRY RUN]' : ''} — ${[...want].join(', ')}`);
  if (want.has('cart')) {
    // Remove only what this seeder put there (the pool's cart groups); pre-existing lines are not ours.
    // Recently-browsed history is an event log with no delete path — it ages out, it is not torn down.
    const pool = await discoverGa4Pool({ backUrl: BACK_URL, storeId: STORE_ID });
    const s = await accountSession();
    const ours = new Set([...pool.cartLine, ...savedForLaterTarget(pool)].map((p) => p.id));
    const sfl = (await gql(SFL_Q, { s: STORE_ID, u: s.userId }, s.token)).getSavedForLater;
    const sflOurs = (sfl?.items || []).filter((i) => ours.has(i.productId));
    let cart = (await gql(CART_Q, { s: STORE_ID, u: s.userId }, s.token)).cart;
    if (!DRY_RUN && sflOurs.length) await gql(FROM_SFL_M, { c: { ...base(s), cartId: cart.id, lineItemIds: sflOurs.map((i) => i.id) } }, s.token);
    cart = (await gql(CART_Q, { s: STORE_ID, u: s.userId }, s.token)).cart;
    for (const line of (cart?.items || []).filter((i) => ours.has(i.productId))) {
      if (!DRY_RUN) await gql(REMOVE_M, { c: { ...base(s), cartId: cart.id, lineItemId: line.id } }, s.token);
    }
    const left = await verifyRemoved(async () => {
      const c = (await gql(CART_Q, { s: STORE_ID, u: s.userId }, s.token)).cart;
      const l = (await gql(SFL_Q, { s: STORE_ID, u: s.userId }, s.token)).getSavedForLater;
      return [...(c?.items || []), ...(l?.items || [])].filter((i) => ours.has(i.productId));
    });
    log(`${left ? '⚠' : '✓'} cart: ${sflOurs.length} SFL item(s) moved back + seeded lines removed — residue ${left} (recently-browsed history is not deletable)`);
    if (left && !DRY_RUN) process.exitCode = 1;
  }
  const codes = [];
  if (want.has('variations')) codes.push(...variationSpecs().map((v) => v.code), VARIATIONS.parent.code);
  if (want.has('related')) codes.push(RELATED.anchor.code);
  if (codes.length) {
    const found = [];
    for (const c of codes) { const p = await findByCode(c); if (p?.id && String(p.name || '').startsWith(SEED_PREFIX)) found.push(p.id); }
    if (want.has('related')) {
      const a = await findByCode(RELATED.anchor.code);
      if (a?.id && !DRY_RUN) {
        const assoc = (await api('GET', `/api/catalog/products/associations/${a.id}`, null, { expectStatus: [200, 404] }) || []).filter(isSeededAssociation);
        if (assoc.length) await api('DELETE', `/api/catalog/products/associations?${idsParam(assoc.map((x) => x.id))}`, null, { expectStatus: [200, 204] });
      }
    }
    if (found.length && !DRY_RUN) {
      for (let i = 0; i < found.length; i += 50) {
        await api('POST', '/api/catalog/listentries/delete', { objectIds: found.slice(i, i + 50), objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] });
      }
      // Event-based indexation is off on vcst: purge the deleted documents or they linger in search.
      await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: found, rebuild: false }], { expectStatus: [200, 204] }).catch(() => {});
    }
    log(`✗ deleted ${found.length} product(s) (variations before parent)`);
    if (!DRY_RUN && want.has('related') && want.has('variations')) {
      const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
      const ids = (s?.results || []).filter((p) => p?.name === PRICELIST_NAME).map((p) => p.id);
      if (ids.length) { await api('DELETE', `/api/pricing/pricelists?${idsParam(ids)}`, null, { expectStatus: [200, 204, 404] }); log(`✗ deleted pricelist ${PRICELIST_NAME}`); }
    }
    const residual = await verifyRemoved(async () => {
      const left = [];
      for (const c of codes) { const p = await findByCode(c); if (p?.id && String(p.name || '').startsWith(SEED_PREFIX)) left.push(p.id); }
      return left;
    });
    log(`${residual ? '⚠' : '✓'} catalog residue: ${residual}`);
    if (residual && !DRY_RUN) process.exitCode = 1;
  }
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ SEED FAILED: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
