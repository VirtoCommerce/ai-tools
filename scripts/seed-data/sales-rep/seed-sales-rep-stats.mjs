#!/usr/bin/env node
/**
 * seed-sales-rep-stats.mjs — the Sales Rep *statistics* fixtures (VCST-5589 follow-up).
 *
 * Companion to seed-sales-rep.mjs, NOT a duplicate of it. The base seeder owns reps, memberships,
 * admin users and the flat per-org order rows (CSV-driven, admin REST). This one owns the two fixture
 * shapes that seeder structurally cannot express, and it exists as a sibling because each needs a
 * different transport:
 *
 *   1. A SHAPED multi-line order (per-line product × quantity × unit price) so `salesRepTopSellers`
 *      re-ranks between `by-units` and `by-revenue` (BL-SR-008). The flat CSV carries only
 *      `items_count` + `total` and splits the total evenly at quantity 1 — mathematically incapable
 *      of making the two rankings disagree. Lines live in sales-rep-stats-specs.mjs.
 *   2. ACTIVE CARTS (BL-SR-006). There is no cart REST API on the platform (`/api/cart/*` → 404), so
 *      carts must be created through the storefront xAPI **as the rep**, using an
 *      `organization_id`-scoped password grant so `cart.organizationId` is stamped with the served
 *      org. The base seeder is admin-token/REST-only and has no rep-token path.
 *
 * Business keys (order number, cart name, org key) live in the spec / committed CSVs; runtime platform
 * GUIDs are written to test-data/aliases.<env>.json — never into a committed fixture.
 *
 * Flags: --dry-run (reads only) · --verbose · --teardown (removes only what this seeder creates)
 *        --only <fixture_key>  (TOPSELLERS | ACME | WEST)
 *
 * Run:  TEST_ENV=vcptcore npm run seed:sales-rep-stats
 * Then: TEST_ENV=vcptcore node scripts/seed-data/sales-rep/probe-sales-rep-statistics.mjs
 */
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv,
  writeEnvAliasOverride, DRY_RUN, TEARDOWN, ONLY, BACK_URL, STORE_ID,
} from '../../lib/seed-common.mjs';
import {
  TOP_SELLER_ORDER, CART_FIXTURES, cartName, statsOrderNumber,
  shapedOrderTotal, buildShapedItems, requiredProductSlots, expectedRankings, rankingsDiverge, preferSanelyPriced,
} from './sales-rep-stats-specs.mjs';

const REP_KEY = 'SR_REP_PRIMARY';
const REP_PASSWORD = process.env.SR_REP_PASSWORD || process.env.TEST_USER_PASSWORD || 'Password1!';

// ---- shared lookups (business keys from the committed CSVs) -----------------

function repRow(key = REP_KEY) {
  const row = loadCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === key);
  if (!row) throw new Error(`rep_key ${key} missing from test-data/sales-rep/sales-reps.csv`);
  return row;
}
function orgMap() {
  const m = {};
  for (const r of loadCsv('test-data/b2b/organizations.csv')) {
    m[r.org_id] = {
      id: r.platform_id, name: r.org_name,
      line1: r.address_line1, city: r.city, region: r.region_name,
      country: r.country_name, countryCode: r.country_code, postal: r.postal_code,
    };
  }
  return m;
}

/** The rep's ApplicationUser (login) id — what GetCurrentUserId() returns from the JWT and what the
 *  sales-rep statistics match order.CustomerId / cart authorship against (NOT the Contact id). */
async function resolveUserId(email) {
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  return u?.id || null;
}

// ---- storefront xAPI as the rep --------------------------------------------

/** Password grant for the rep. `organization_id` (snake_case) sets the ORG CONTEXT that stamps
 *  cart.organizationId; `storeId` is required by the scoped sales-rep grant. */
async function repToken(email, storeId, organizationId = null) {
  const params = { grant_type: 'password', username: email, password: REP_PASSWORD, scope: 'offline_access', storeId };
  if (organizationId) params.organization_id = organizationId;
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  });
  if (!res.ok) throw new Error(`rep token failed (${organizationId ? `org ${organizationId}` : 'no org'}): ${res.status} ${(await res.text()).slice(0, 200)}`);
  return (await res.json()).access_token;
}

async function gql(token, query, variables = {}, endpoint = '/graphql') {
  const res = await fetch(`${BACK_URL}${endpoint}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors) throw new Error(`GraphQL: ${JSON.stringify(body.errors.map((e) => e.message)).slice(0, 300)}`);
  return body.data || {};
}

const CART_SEL = 'id name organizationId organizationName itemsCount total { amount formattedAmount } validationErrors { errorCode errorMessage }';

/**
 * Discover DISTINCT products from the STORE's own catalogue via the storefront xAPI, so line items
 * and cart items reference products the store can actually render (env-resilient, never hardcoded).
 * `cartable: true` narrows to products a cart line will accept — see the CART_FIXTURES note: with no
 * fulfillment center on the store, inventory-TRACKED products all resolve to availableQuantity 0 and
 * addItem rejects them (PRODUCT_FFC_QTY), so only `isInStock` (untracked) products can be carted.
 * De-duplicates by SKU: two entries sharing a SKU would collapse the top-seller ranking.
 */
async function discoverStoreProducts(token, need, { cartable = false } = {}) {
  const out = []; const seenSku = new Set();
  // Cartable candidates are scarce, so scan a wider net and then apply the price-sanity preference
  // (see MAX_SANE_UNIT_PRICE) instead of taking the first `need` matches.
  const target = cartable ? Math.max(need * 4, 8) : need;
  // `sort: "code:asc"` is LOAD-BEARING, not cosmetic. Without it the query returns relevance order,
  // which is not stable across calls once you page into a large catalog — and vcst's B2B-store has
  // 4523 products, so the old 10-page (500-product) scan was a SHIFTING WINDOW. Two consecutive
  // seeds on 2026-08-05 picked entirely disjoint product sets (15018752… then 15198098…), so the
  // shaped order was torn down and rebuilt on EVERY reseed and the reproducible top-seller identity
  // the browser oracle needs never actually held. Sorting the RESULT client-side cannot fix that:
  // it orders whatever subset happened to come back. Ordering must come from the QUERY.
  for (let page = 0; page < 10 && out.length < target; page++) {
    // catalogId is REQUIRED: OrderLineItem.CatalogId is NOT NULL, so an order create without it
    // 500s at the DB layer ("Cannot insert the value NULL into column 'CatalogId'").
    const d = await gql(token, `{ products(storeId:"${STORE_ID}", cultureName:"en-US", currencyCode:"USD", first: 50, after:"${page * 50}", sort:"code:asc", query:"") {
        items { id code name catalogId availabilityData { isBuyable isInStock } price { actual { amount } } } } }`);
    const items = d?.products?.items || [];
    if (!items.length) break;
    for (const p of items) {
      if (!p.availabilityData?.isBuyable) continue;
      if (cartable && !p.availabilityData?.isInStock) continue;
      const sku = p.code;
      if (!sku || seenSku.has(sku)) continue;
      seenSku.add(sku);
      if (!p.catalogId) { verbose(`skip ${sku}: no catalogId (OrderLineItem.CatalogId is NOT NULL)`); continue; }
      out.push({ id: p.id, sku, name: String(p.name || sku).replace(/\s+/g, ' ').trim(), catalogId: p.catalogId, price: p.price?.actual?.amount });
      if (out.length >= target) break;
    }
  }
  // Belt-and-braces: the query already returns code:asc, so this is a no-op on a healthy response.
  // It is kept so a platform that ignores the `sort` argument degrades to a stable-within-page
  // mapping rather than a silently drifting one.
  out.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  return cartable ? preferSanelyPriced(out) : out;
}

// ---- fixture 1: the shaped top-seller order (admin REST) -------------------

function orderAddress(org, addressType) {
  return {
    addressType, firstName: 'AGENT-TEST', lastName: 'Buyer',
    line1: org.line1 || '1 Main St', city: org.city || 'New York', regionName: org.region || 'New York',
    countryCode: org.countryCode || 'USA', countryName: org.country || 'United States',
    postalCode: org.postal || '10001', phone: '+1-206-555-0100', email: 'agent-test-sr-order@example.com',
  };
}

async function seedShapedOrder(spec, orgs, customerId, products) {
  const org = orgs[spec.orgKey];
  if (!org?.id) { log(`WARN: org ${spec.orgKey} has no pinned platform_id — skipping shaped order`); return null; }
  const number = statsOrderNumber(spec.key);
  const items = buildShapedItems(spec.lines, products);
  const total = shapedOrderTotal(spec.lines);

  // Idempotent + self-healing: rebuild when attribution, org, status, total or the SHAPE drifted
  // (a stale even-split order would silently un-diverge the two top-seller rankings).
  const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 1 });
  const existing = (found?.results || [])[0];
  if (existing) {
    const full = await api('GET', `/api/order/customerOrders/${existing.id}`);
    const shapeOk = (full?.items || []).length === items.length
      && items.every((want) => (full.items).some((got) => got.sku === want.sku && got.quantity === want.quantity && Math.abs((got.price || 0) - want.price) < 0.01));
    const ok = full?.customerId === customerId
      && full?.organizationId === org.id
      && full?.status === spec.status
      && Math.abs((full?.total || 0) - total) < 0.01
      && shapeOk;
    if (ok) { log(`shaped order ${number} exists (attribution + org + status + total + line shape ok)`); return existing.id; }
    await api('DELETE', `/api/order/customerOrders?ids=${existing.id}`, null, { expectStatus: [200, 204] });
    log(`shaped order ${number} rebuilding (cust=${full?.customerId === customerId}, org=${full?.organizationId === org.id}, status=${full?.status === spec.status}, total=${Math.abs((full?.total || 0) - total) < 0.01}, shape=${shapeOk})`);
  }

  const shipAddr = orderAddress(org, 'Shipping');
  const billAddr = orderAddress(org, 'Billing');
  // Totals lesson inherited from seed-sales-rep.mjs: the platform folds shipment.total and
  // inPayment.total back into order.Total, so keep the structural records but zero their monetary
  // totals (the payment's `sum` carries the amount) or order.Total drifts off the spec.
  const body = {
    number, storeId: spec.store, organizationId: org.id, organizationName: org.name,
    customerId, customerName: spec.customerName, currency: 'USD', status: spec.status,
    total, subTotal: total, shippingTotal: 0, shippingTotalWithTax: 0, taxTotal: 0,
    items, addresses: [shipAddr, billAddr],
    shipments: [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground', currency: 'USD',
      organizationId: org.id, organizationName: org.name,
      price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'New', number: `${number}-S1`, deliveryAddress: shipAddr, items: [],
    }],
    inPayments: [{
      gatewayCode: 'DefaultManualPaymentMethod', currency: 'USD',
      customerId, customerName: spec.customerName, organizationId: org.id, organizationName: org.name,
      sum: total, price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
      status: 'New', paymentStatus: 'New', number: `${number}-P1`, billingAddress: billAddr,
    }],
  };
  const created = await api('POST', '/api/order/customerOrders', body);
  log(`shaped order ${number} (${spec.status}, ${spec.orgKey}, $${total}) -> ${created?.id || '(created)'}`);
  for (const it of items) log(`    line ${it.sku} qty=${it.quantity} @ $${it.price} = $${(it.quantity * it.price).toFixed(2)}`);
  return created?.id || null;
}

// ---- fixture 2: active carts (storefront xAPI as the rep) ------------------

/** Find the rep's cart by name within the current org context. */
async function findCart(token, name, userId) {
  const d = await gql(token, `{ cart(storeId:"${STORE_ID}", cartName:"${name}", cultureName:"en-US", currencyCode:"USD", userId:"${userId}") { ${CART_SEL} } }`);
  return d?.cart || null;
}

async function seedCart(spec, orgs, rep, userId, products) {
  const org = orgs[spec.orgKey];
  if (!org?.id) { log(`WARN: org ${spec.orgKey} has no pinned platform_id — skipping cart ${spec.key}`); return null; }
  const name = cartName(spec.key);
  const product = products[spec.productSlot];
  if (!product) { log(`WARN: cart ${spec.key} — productSlot ${spec.productSlot} unsatisfied (${products.length} cartable product(s) found), skipping`); return null; }

  if (DRY_RUN) { verbose(`[DRY] cart ${name} in ${spec.orgKey} with ${product.sku} ×${spec.quantity}`); return null; }

  // Org context is what stamps cart.organizationId — a plain grant would create an org-less cart
  // that no per-org statistics query can see.
  const tok = await repToken(rep.email, rep.store || STORE_ID, org.id);

  const existing = await findCart(tok, name, userId);
  if (existing?.id && (existing.itemsCount || 0) > 0 && existing.organizationId === org.id) {
    log(`cart ${name} exists (${existing.itemsCount} item(s), ${existing.total?.formattedAmount}, org ok)`);
    return existing.id;
  }
  // An EMPTY cart of the same name is not an active cart (BL-SR-006) — drop it and rebuild.
  if (existing?.id) {
    await gql(tok, 'mutation($cmd: InputRemoveCartType!) { removeCart(command: $cmd) }', { cmd: { cartId: existing.id, userId } });
    verbose(`removed stale/empty cart ${name}`);
  }

  const d = await gql(tok, `mutation($cmd: InputAddItemType!) { addItem(command: $cmd) { ${CART_SEL} } }`, {
    cmd: {
      storeId: STORE_ID, userId, cartName: name, currencyCode: 'USD', cultureName: 'en-US',
      productId: product.id, quantity: spec.quantity,
    },
  });
  const cart = d?.addItem;
  const errs = cart?.validationErrors || [];
  if (errs.length) {
    // Fail LOUD: a cart that silently stayed empty is not an active cart and would quietly
    // under-report the statistic we are seeding for.
    log(`  WARN cart ${name} validation: ${errs.map((e) => `${e.errorCode}: ${e.errorMessage}`).join(' | ')}`);
  }
  if (!cart?.itemsCount) {
    log(`  WARN cart ${name} created EMPTY (itemsCount=0) — NOT an active cart per BL-SR-006`);
    return cart?.id || null;
  }
  log(`cart ${name} (${spec.orgKey}) -> ${cart.id}  ${product.sku} ×${spec.quantity} = ${cart.total?.formattedAmount} (${cart.itemsCount} line(s))`);
  return cart.id;
}

// ---- teardown --------------------------------------------------------------

async function teardown(orgs, rep, userId) {
  log('TEARDOWN — removing only the AGENT-TEST-SR statistics fixtures');

  // Carts first (children of the org/product graph), then the order.
  for (const spec of CART_FIXTURES) {
    const org = orgs[spec.orgKey];
    if (!org?.id) continue;
    try {
      const tok = await repToken(rep.email, rep.store || STORE_ID, org.id);
      const name = cartName(spec.key);
      const c = await findCart(tok, name, userId);
      if (c?.id) {
        // DRY_RUN guard is MANDATORY here: carts are removed over GraphQL, and `gql()` is a raw
        // fetch with no dry-run short-circuit — unlike `api()`, which skips every non-read call.
        // Without this, `--teardown --dry-run` really deleted both carts while printing what
        // looked like a preview (found 2026-08-05 by dry-running the teardown to prove its scope).
        if (DRY_RUN) { log(`  [DRY] would remove cart ${name}`); continue; }
        await gql(tok, 'mutation($cmd: InputRemoveCartType!) { removeCart(command: $cmd) }', { cmd: { cartId: c.id, userId } });
        log(`  removed cart ${name}`);
      } else verbose(`cart ${name} absent`);
    } catch (e) { log(`  WARN cart ${spec.key} teardown: ${String(e.message).slice(0, 160)}`); }
  }

  const number = statsOrderNumber(TOP_SELLER_ORDER.key);
  const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
  for (const o of (found?.results || [])) {
    // `api()` already skips the DELETE under --dry-run; say so rather than reporting a deletion
    // that did not happen (the log line runs either way).
    await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
    log(DRY_RUN ? `  [DRY] would delete shaped order ${number}` : `  deleted shaped order ${number}`);
  }

  // Zero-residue assert. Meaningless in a dry run — nothing was deleted, so the fixture is still
  // there by design and a WARN would read as a teardown failure.
  if (DRY_RUN) { log('  [DRY] residue check skipped (nothing was deleted)'); log('Teardown complete (dry run — no writes).'); return; }
  const after = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
  const residue = (after?.results || []).length;
  log(residue === 0 ? '  verifyRemoved: zero residue' : `  WARN verifyRemoved: ${residue} order(s) still present`);
  log('Teardown complete.');
}

// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  await auth();
  const orgs = orgMap();
  const rep = repRow();
  const userId = await resolveUserId(rep.email);
  if (!userId) throw new Error(`could not resolve the ApplicationUser id for ${rep.email} — seed the reps first (npm run seed:sales-rep)`);
  verbose(`rep ${REP_KEY} <${rep.email}> ApplicationUser=${userId}`);

  if (TEARDOWN) { await teardown(orgs, rep, userId); return; }

  // Sanity-check the spec's own promise before writing anything.
  if (!rankingsDiverge()) throw new Error('TOP_SELLER_LINES no longer make by-units and by-revenue disagree — fix the spec');
  const r = expectedRankings();
  log(`spec oracle: by-units slots [${r.byUnits}] vs by-revenue slots [${r.byRevenue}] (divergent)`);

  const need = requiredProductSlots();
  const repTok = await repToken(rep.email, rep.store || STORE_ID);
  const orderProducts = await discoverStoreProducts(repTok, need);
  const cartProducts = await discoverStoreProducts(repTok, need, { cartable: true });
  log(`discovered ${orderProducts.length} distinct store product(s) for order lines: ${orderProducts.map((p) => p.sku).join(', ')}`);
  log(`discovered ${cartProducts.length} distinct CARTABLE product(s): ${cartProducts.map((p) => p.sku).join(', ')}`);
  if (orderProducts.length < need) throw new Error(`need ${need} distinct store products for the shaped order, found ${orderProducts.length}`);

  const writeback = {};

  const orderId = await seedShapedOrder(TOP_SELLER_ORDER, orgs, userId, orderProducts);
  if (orderId) writeback[TOP_SELLER_ORDER.alias] = { id: orderId, number: statsOrderNumber(TOP_SELLER_ORDER.key) };

  for (const spec of CART_FIXTURES) {
    if (ONLY && spec.key !== ONLY) continue;
    const id = await seedCart(spec, orgs, rep, userId, cartProducts);
    if (id) writeback[spec.alias] = { id, name: cartName(spec.key) };
  }

  if (!DRY_RUN && Object.keys(writeback).length) {
    writeEnvAliasOverride(writeback);
    log(`write-back -> aliases.<env>.json: ${Object.keys(writeback).join(', ')}`);
  }
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Seed complete.');
}
main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
