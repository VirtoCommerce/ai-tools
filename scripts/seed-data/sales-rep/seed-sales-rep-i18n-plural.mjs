#!/usr/bin/env node
/**
 * seed-sales-rep-i18n-plural.mjs — the Sales Rep dashboard SINGULAR-PLURAL i18n fixture (VCST-5683).
 *
 * Creates EXACTLY TWO records and nothing else:
 *   1. ONE customer order, created today, in ORG-001, authored by SR_REP_ACME3's ApplicationUser.
 *   2. ONE active (non-empty) cart, created today, in ORG-001, authored by the same rep.
 *
 * Together they make the dashboard `placed_today` / `ordered_this_month` / `new_this_week` counters
 * read exactly 1 for a rep who serves exactly one org, which is the only state in which the SINGULAR
 * i18n branch renders. Rationale, the authorship trap, and the exactly-one invariant live in
 * sales-rep-i18n-plural-specs.mjs.
 *
 * DELIBERATELY NOT part of seed-sales-rep-stats.mjs: that seeder owns the shaped top-seller order and
 * the two multi-org carts, and rebuilds them on every run. On a SHARED env those are fixtures other
 * cases depend on, so a run that only wants this pair must not go through it.
 *
 * Flags: --dry-run (reads only) · --verbose · --teardown (removes only these two records)
 *
 * Run:      TEST_ENV=vcptcore npm run seed:sales-rep-i18n
 * Teardown: TEST_ENV=vcptcore npm run seed:sales-rep-i18n:teardown
 * Verify:   TEST_ENV=vcptcore node scripts/seed-data/sales-rep/probe-sales-rep-statistics.mjs --rep SR_REP_ACME3
 */
import {
  assertSafeTarget, auth, api, log, verbose, loadCsv,
  writeEnvAliasOverride, DRY_RUN, TEARDOWN, BACK_URL, STORE_ID,
} from '../../lib/seed-common.mjs';
import {
  I18N_ORDER, I18N_CART, I18N_REP_KEY, i18nOrderNumber, i18nCartName,
  orderTotal, buildOrderItems, requiredProductSlots, overshootErrors,
  DASHBOARD_NEW_ORDERS_FILTER,
} from './sales-rep-i18n-plural-specs.mjs';
import { preferSanelyPriced } from './sales-rep-stats-specs.mjs';

const REP_PASSWORD = process.env.SR_REP_PASSWORD || process.env.TEST_USER_PASSWORD || 'Password1!';

// ---- business keys from the committed CSVs (never literals here) ------------

function repRow(key) {
  const row = loadCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === key);
  if (!row) throw new Error(`rep_key ${key} missing from test-data/sales-rep/sales-reps.csv`);
  return row;
}
function orgRow(key) {
  const r = loadCsv('test-data/b2b/organizations.csv').find((x) => x.org_id === key);
  if (!r) throw new Error(`org_id ${key} missing from test-data/b2b/organizations.csv`);
  return {
    id: r.platform_id, name: r.org_name,
    line1: r.address_line1, city: r.city, region: r.region_name,
    country: r.country_name, countryCode: r.country_code, postal: r.postal_code,
  };
}

/** The rep's ApplicationUser (login) id — what the sales-rep statistics match authorship against.
 *  NOT the Contact id: an order stamped with the Contact id is invisible to every rep statistic. */
async function resolveUserId(email) {
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  return u?.id || null;
}

// ---- storefront xAPI as the rep --------------------------------------------

/** Password grant. `organization_id` (snake_case) sets the ORG CONTEXT that stamps
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

async function gql(token, query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors) throw new Error(`GraphQL: ${JSON.stringify(body.errors.map((e) => e.message)).slice(0, 300)}`);
  return body.data || {};
}

const CART_SEL = 'id name organizationId organizationName itemsCount total { amount formattedAmount } validationErrors { errorCode errorMessage }';

/**
 * Discover DISTINCT products from the STORE's own catalogue via the storefront xAPI, so the order
 * line and the cart line reference products the store can actually render (env-resilient, never
 * hardcoded). Mirrors seed-sales-rep-stats.mjs: `sort:"code:asc"` is load-bearing (relevance order is
 * not stable across calls once you page a large catalog), `catalogId` is required because
 * OrderLineItem.CatalogId is NOT NULL, and `cartable` narrows to products a cart line will accept.
 */
async function discoverStoreProducts(token, need, { cartable = false } = {}) {
  const out = []; const seenSku = new Set();
  const target = cartable ? Math.max(need * 4, 8) : need;
  for (let page = 0; page < 10 && out.length < target; page++) {
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
  out.sort((a, b) => String(a.sku).localeCompare(String(b.sku)));
  return cartable ? preferSanelyPriced(out) : out;
}

// ---- fixture 1: the single order (admin REST) -------------------------------

function orderAddress(org, addressType) {
  return {
    addressType, firstName: 'AGENT-TEST', lastName: 'Buyer',
    line1: org.line1 || '1 Main St', city: org.city || 'New York', regionName: org.region || 'New York',
    countryCode: org.countryCode || 'USA', countryName: org.country || 'United States',
    postalCode: org.postal || '10001', phone: '+1-206-555-0100', email: 'agent-test-sr-i18n-order@example.com',
  };
}

async function seedOrder(spec, org, customerId, products) {
  const number = i18nOrderNumber(spec.key);
  const items = buildOrderItems(spec.lines, products);
  const total = orderTotal(spec.lines);

  // Idempotent + self-healing on exactly the properties the counters read: authorship (else the
  // order is invisible to the statistics), org, store, status and total.
  const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 5 });
  const existing = (found?.results || [])[0];
  if (existing) {
    const full = await api('GET', `/api/order/customerOrders/${existing.id}`);
    const ok = full?.customerId === customerId
      && full?.organizationId === org.id
      && full?.storeId === spec.store
      && full?.status === spec.status
      && Math.abs((full?.total || 0) - total) < 0.01;
    // A same-day re-run must NOT create a second order — that is the exact overshoot this fixture
    // cannot survive. Reuse when sound; rebuild in place when drifted.
    if (ok) { log(`order ${number} exists (authorship + org + store + status + total ok) -> ${existing.id}`); return existing.id; }
    await api('DELETE', `/api/order/customerOrders?ids=${existing.id}`, null, { expectStatus: [200, 204] });
    log(`order ${number} rebuilding (cust=${full?.customerId === customerId}, org=${full?.organizationId === org.id}, status=${full?.status === spec.status}, total=${Math.abs((full?.total || 0) - total) < 0.01})`);
  }
  if ((found?.results || []).length > 1) {
    throw new Error(`${(found.results).length} orders already match ${number} — refusing to add another (the counter must read 1). Run --teardown first.`);
  }

  const shipAddr = orderAddress(org, 'Shipping');
  const billAddr = orderAddress(org, 'Billing');
  // Totals lesson inherited from the sibling seeders: the platform folds shipment.total and
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
  log(`order ${number} (${spec.status}, ${spec.orgKey}, $${total}) -> ${created?.id || '(created)'}`);
  for (const it of items) log(`    line ${it.sku} qty=${it.quantity} @ $${it.price} — ${it.name}`);
  return created?.id || null;
}

// ---- fixture 2: the single active cart (storefront xAPI as the rep) ---------

async function findCart(token, name, userId) {
  const d = await gql(token, `{ cart(storeId:"${STORE_ID}", cartName:"${name}", cultureName:"en-US", currencyCode:"USD", userId:"${userId}") { ${CART_SEL} } }`);
  return d?.cart || null;
}

async function seedCart(spec, org, rep, userId, products) {
  const name = i18nCartName(spec.key);
  const product = products[spec.productSlot];
  if (!product) throw new Error(`cart productSlot ${spec.productSlot} unsatisfied (${products.length} cartable product(s) found) — refusing to leave the cart counter at 0`);

  if (DRY_RUN) { log(`[DRY] would create cart ${name} in ${spec.orgKey} with ${product.sku} ×${spec.quantity}`); return null; }

  // Org context is what stamps cart.organizationId — a plain grant would create an org-less cart
  // that no per-org statistic can see.
  const tok = await repToken(rep.email, rep.store || STORE_ID, org.id);

  const existing = await findCart(tok, name, userId);
  if (existing?.id && (existing.itemsCount || 0) > 0 && existing.organizationId === org.id) {
    log(`cart ${name} exists (${existing.itemsCount} item(s), ${existing.total?.formattedAmount}, org ok) -> ${existing.id}`);
    return existing.id;
  }
  // An EMPTY cart of the same name is not an active cart — drop it and rebuild.
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
  if (errs.length) log(`  WARN cart ${name} validation: ${errs.map((e) => `${e.errorCode}: ${e.errorMessage}`).join(' | ')}`);
  if (!cart?.itemsCount) {
    // Fail LOUD: an empty cart is not an ACTIVE cart, so the counter would silently stay 0 and the
    // singular branch would be as unobservable as before the seed ran.
    throw new Error(`cart ${name} came back EMPTY (itemsCount=0) — not an active cart, so new_this_week would stay 0`);
  }
  log(`cart ${name} (${spec.orgKey}) -> ${cart.id}  ${product.sku} ×${spec.quantity} = ${cart.total?.formattedAmount} (${cart.itemsCount} line(s))`);
  return cart.id;
}

// ---- post-seed self-check: the DASHBOARD's own filtered query ---------------

/**
 * Assert the counters the widgets actually render, using the SAME `filter: "New"` the dashboard
 * hardcodes — plus the unfiltered period alongside it, so a mismatch between the two is reported
 * rather than hidden.
 *
 * This exists because an UNFILTERED probe cannot judge a FILTERED widget: the first version of this
 * fixture seeded `Processing`, the unfiltered `week`/`mtd`/`ytd` all read `count: 1` and looked
 * green, while the storefront rendered `0 placed today` because `newOrdersToday` filters on "New".
 * Verifying with a different query than the product uses is not verification.
 */
async function verifyDashboardCounters(rep, org) {
  const tok = await repToken(rep.email, rep.store || STORE_ID);
  const now = new Date();
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString();
  const to = now.toISOString();
  const res = await fetch(`${BACK_URL}/graphql/sales-rep`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
    body: JSON.stringify({
      query: `query {
        orders: salesRepCustomerOrderStatistics(storeId: "${rep.store || STORE_ID}") {
          newOrders:        period(filter: "${DASHBOARD_NEW_ORDERS_FILTER}") { count total { amount } }
          newOrdersToday:   period(from: "${from}", to: "${to}", filter: "${DASHBOARD_NEW_ORDERS_FILTER}") { count total { amount } }
          unfilteredToday:  period(from: "${from}", to: "${to}") { count total { amount } }
        }
        carts: salesRepCustomerCartStatistics(storeId: "${rep.store || STORE_ID}") {
          today: period(from: "${from}", to: "${to}") { count total { amount } }
        }
      }`,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (body.errors) { log(`  WARN self-check GraphQL: ${JSON.stringify(body.errors.map((e) => e.message)).slice(0, 200)}`); return; }
  const o = body.data?.orders || {}; const c = body.data?.carts || {};
  log('post-seed self-check (the dashboard\'s own query):');
  log(`    newOrders        (filter:"${DASHBOARD_NEW_ORDERS_FILTER}")        count=${o.newOrders?.count}   $${o.newOrders?.total?.amount}`);
  log(`    newOrdersToday   (filter:"${DASHBOARD_NEW_ORDERS_FILTER}", today) count=${o.newOrdersToday?.count}   $${o.newOrdersToday?.total?.amount}`);
  log(`    unfilteredToday  (no filter, today)      count=${o.unfilteredToday?.count}   $${o.unfilteredToday?.total?.amount}`);
  log(`    activeCartsToday (no filter, today)      count=${c.today?.count}   $${c.today?.total?.amount}`);
  const problems = [];
  if (o.newOrders?.count !== 1) problems.push(`newOrders count=${o.newOrders?.count}, expected 1`);
  if (o.newOrdersToday?.count !== 1) problems.push(`newOrdersToday count=${o.newOrdersToday?.count}, expected 1 — the widget's "placed today" sub-line would render this`);
  if (c.today?.count !== 1) problems.push(`active carts today count=${c.today?.count}, expected 1`);
  if (problems.length) throw new Error(`the seeded fixture does NOT drive the dashboard counters:\n  - ${problems.join('\n  - ')}`);
  log('    ✓ all three counters read exactly 1 under the filter the dashboard uses');
}

// ---- teardown --------------------------------------------------------------

async function teardown(org, rep, userId) {
  log('TEARDOWN — removing ONLY the AGENT-TEST-*-I18N order + cart for SR_REP_ACME3');

  // Cart first (child of the org/product graph), then the order.
  const name = i18nCartName(I18N_CART.key);
  try {
    const tok = await repToken(rep.email, rep.store || STORE_ID, org.id);
    const c = await findCart(tok, name, userId);
    if (c?.id) {
      // DRY_RUN guard is MANDATORY: carts are removed over GraphQL, and gql() is a raw fetch with no
      // dry-run short-circuit — unlike api(), which skips every non-read call.
      if (DRY_RUN) log(`  [DRY] would remove cart ${name}`);
      else {
        await gql(tok, 'mutation($cmd: InputRemoveCartType!) { removeCart(command: $cmd) }', { cmd: { cartId: c.id, userId } });
        log(`  removed cart ${name}`);
      }
    } else verbose(`cart ${name} absent`);
  } catch (e) { log(`  WARN cart teardown: ${String(e.message).slice(0, 160)}`); }

  const number = i18nOrderNumber(I18N_ORDER.key);
  const found = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 10 });
  for (const o of (found?.results || [])) {
    await api('DELETE', `/api/order/customerOrders?ids=${o.id}`, null, { expectStatus: [200, 204] });
    log(DRY_RUN ? `  [DRY] would delete order ${number}` : `  deleted order ${number} (${o.id})`);
  }

  if (DRY_RUN) { log('  [DRY] residue check skipped (nothing was deleted)'); log('Teardown complete (dry run — no writes).'); return; }
  const after = await api('POST', '/api/order/customerOrders/search', { keyword: number, take: 10 });
  const residue = (after?.results || []).length;
  log(residue === 0 ? '  verifyRemoved: zero residue' : `  WARN verifyRemoved: ${residue} order(s) still present`);
  log('Teardown complete.');
}

// ---- main ------------------------------------------------------------------

async function main() {
  assertSafeTarget();
  await auth();

  // Refuse to write a set that cannot prove what it exists for — checked BEFORE anything is created.
  const errs = overshootErrors();
  if (errs.length) throw new Error(`fixture set would not produce a SINGULAR counter:\n  - ${errs.join('\n  - ')}`);

  const org = orgRow(I18N_ORDER.orgKey);
  if (!org.id) throw new Error(`org ${I18N_ORDER.orgKey} has no pinned platform_id in test-data/b2b/organizations.csv`);
  const rep = repRow(I18N_REP_KEY);
  const userId = await resolveUserId(rep.email);
  if (!userId) throw new Error(`could not resolve the ApplicationUser id for ${rep.email} — run npm run seed:sales-rep first`);
  log(`rep ${I18N_REP_KEY} <${rep.email}> ApplicationUser=${userId} | org ${I18N_ORDER.orgKey}=${org.id}`);

  if (TEARDOWN) { await teardown(org, rep, userId); return; }

  const need = requiredProductSlots();
  const repTok = await repToken(rep.email, rep.store || STORE_ID);
  const orderProducts = await discoverStoreProducts(repTok, need);
  const cartProducts = await discoverStoreProducts(repTok, need, { cartable: true });
  log(`discovered ${orderProducts.length} product(s) for the order line, ${cartProducts.length} CARTABLE product(s)`);
  if (orderProducts.length < need) throw new Error(`need ${need} distinct store product(s), found ${orderProducts.length}`);

  const writeback = {};
  const orderId = await seedOrder(I18N_ORDER, org, userId, orderProducts);
  if (orderId) writeback[I18N_ORDER.alias] = { id: orderId, number: i18nOrderNumber(I18N_ORDER.key) };
  const cartId = await seedCart(I18N_CART, org, rep, userId, cartProducts);
  if (cartId) writeback[I18N_CART.alias] = { id: cartId, name: i18nCartName(I18N_CART.key) };

  if (!DRY_RUN && Object.keys(writeback).length) {
    writeEnvAliasOverride(writeback);
    log(`write-back -> aliases.<env>.json: ${Object.keys(writeback).join(', ')}`);
  }
  if (!DRY_RUN) await verifyDashboardCounters(rep, org);
  log(DRY_RUN ? 'DRY RUN complete (no writes).' : 'Seed complete.');
}
main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
