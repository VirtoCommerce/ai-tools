/**
 * seed-loyalty-balance.mjs — EARN a positive loyalty balance for a target user (VCST-5103).
 *
 * ⚠️⚠️ READ THIS BEFORE RUNNING ⚠️⚠️
 * There is NO balance-write API in vc-module-loyalty — the operation log is READ-ONLY
 * (GET /api/loyalty-program-operation-log/balance/{userId}). A balance moves ONLY when the
 * LoyaltyProgramHandler earns/redeems points on a REAL order. So the only way to raise a balance
 * is to PLACE REAL, NON-REVERSIBLE ORDERS as the target user. Consequences you must accept:
 *   • Every run places real orders on the target env and permanently drifts the balance UP.
 *   • It is NOT idempotent — re-running ADDS more orders / more points.
 *   • --teardown CANNOT un-earn points (no delete API) — it only WARNS. Balances never come back down.
 *   • A --max-orders cap (default 25) bounds the blast radius; a target that needs more orders than the
 *     cap is reported and NOT chased. Prefer rewriting positive-redemption test cases to be
 *     balance-relative (LOY_SKU_PTS_UNIT) over building a huge live balance.
 *
 * Mechanism (the proven storefront xAPI earn path — mirrors suite 075b/083b):
 *   auth as the user → for each order: create/addItem an earning product → set FixedRate shipment +
 *   DefaultManualPaymentMethod payment → createOrderFromCart → poll balance (earn settles async ~10s)
 *   until balance ≥ target or --max-orders is hit.
 *
 * Usage:
 *   node scripts/seed-data/seed-loyalty-balance.mjs --user LOYALTY_VIP_USER --points 5000000 [--dry-run] [--verbose]
 *   node scripts/seed-data/seed-loyalty-balance.mjs --user AGENT-TEST-vip@test.virtocommerce.com --orders 5
 *   node scripts/seed-data/seed-loyalty-balance.mjs --user LOYALTY_VIP_USER --points 1000000 --max-orders 40
 *
 * NOT wired into seed:bootstrap (it places orders — manual only). Conventions: scripts/lib/seed-common.mjs.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, BACK_URL, STORE_ID, DRY_RUN, VERBOSE, TEARDOWN,
  log, verbose, assertSafeTarget, auth, api, loadAliases,
} from '../lib/seed-common.mjs';

const argv = process.argv.slice(2);
const argVal = (flag, dflt = null) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
const USER_ARG = argVal('--user', 'LOYALTY_VIP_USER');
const TARGET_POINTS = argVal('--points') != null ? Number(argVal('--points')) : null;
const TARGET_ORDERS = argVal('--orders') != null ? Number(argVal('--orders')) : null;
const MAX_ORDERS = Number(argVal('--max-orders', '25'));
const LINE_ITEM_LIMIT = 999999;   // qty ≥ 1,000,000 is rejected by the store LINE_ITEM_LIMIT validator

if (TARGET_POINTS == null && TARGET_ORDERS == null) {
  console.error('ABORT: pass a target — either --points <N> or --orders <N>.');
  process.exit(2);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Resolve the target user's email/password/balance-userId from an alias name or a raw email. */
function resolveUser(arg) {
  const aliases = loadAliases();
  // Alias form (LOYALTY_VIP_USER): pull creds from the alias' *_env vars (or inline fallback).
  const alias = aliases[arg];
  if (alias && typeof alias === 'object') {
    const email = (alias.email_env && process.env[alias.email_env]) || alias.email;
    const password = (alias.password_env && process.env[alias.password_env]) || alias.password;
    return { email, password, balanceUserId: alias.securityAccountId || null, source: `alias ${arg}` };
  }
  // Raw email form: password must come from env (never a literal on the CLI).
  const password = process.env.DEFAULT_TEST_PASSWORD || process.env.TEST_USER_PASSWORD || null;
  return { email: arg, password, balanceUserId: null, source: 'raw email' };
}

/** The target user's customer groups — loyalty eligibility is group-scoped. */
async function getUserGroups(email) {
  const r = await api('POST', '/api/members/search', { searchPhrase: email, take: 10 }, { expectStatus: [200, 201] });
  const results = r?.results || [];
  const contact = results.find((m) => (m.emails || []).some((e) => String(e).toLowerCase() === email.toLowerCase())) || results[0];
  return contact?.groups || [];
}

/** Collect a program's group gate from its condition tree — walk SELECTED `children` only (not availableChildren). */
function programGroupGate(program) {
  let all = false; const groups = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.id === 'AnyUserGroupCondition') all = true;
    if (node.id === 'UserGroupIsCondition') (node.groups || []).forEach((g) => groups.add(g));
    (node.children || []).forEach(walk);
  };
  walk(program.dynamicExpression);
  return { all, groups };
}

/** Is this a ProductPoints program that WINS for the user right now: active + in-window + group-eligible. */
function isCandidate(p, userGroups, now = new Date()) {
  if (p.programType !== 'ProductPoints' || !p.isActive) return false;
  if (p.startDate && new Date(p.startDate) > now) return false;
  if (p.endDate && new Date(p.endDate) < now) return false;
  const gate = programGroupGate(p);
  return gate.all || userGroups.some((g) => gate.groups.has(g));
}

/**
 * Resolve the SKU that actually EARNS for THIS user: the buyable factor SKU of the winning ProductPoints
 * program (highest-priority eligible+active+in-window). Only the single global winner earns its factor, so
 * we take candidates in priority order and use the FIRST whose factor SKU is buyable+priced for the user
 * (that also proves it is linked into the user's virtual catalog). Returns unitPrice + stock too, because
 * points = factor × unit price × qty (NOT factor × qty) and qty must respect available inventory.
 */
async function resolveWinningEarning(userToken, userGroups) {
  const progs = (await api('POST', '/api/loyalty-programs/search', { take: 500 }, { expectStatus: [200, 201] }))?.results || [];
  const candidates = progs.filter((p) => isCandidate(p, userGroups)).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  if (!candidates.length) throw new Error(`no eligible+active+in-window ProductPoints program for groups [${userGroups.join(',')}]`);
  const allFactors = (await api('POST', '/api/loyalty-program-product-factors/search', { take: 1000 }, { expectStatus: [200, 201] }))?.results || [];
  for (const prog of candidates) {
    const factors = allFactors.filter((f) => f.loyaltyProgramId === prog.id && Number(f.factor) > 0);
    for (const f of factors) {
      const d = await gql(userToken, `query { product(id: "${f.productId}" storeId: "${STORE_ID}") { code availabilityData { isBuyable isAvailable availableQuantity } price { actual { amount } } } }`, 'winner_product').catch(() => null);
      const p = d?.product; const unitPrice = Number(p?.price?.actual?.amount || 0);
      if (p?.availabilityData?.isBuyable && p?.availabilityData?.isAvailable && unitPrice > 0) {
        if (prog !== candidates[0]) log(`⚠ top winner "${candidates[0].name}" has no buyable factor SKU — falling back to eligible program "${prog.name}" (pri ${prog.priority}).`);
        return { programId: prog.id, programName: prog.name, priority: prog.priority, sku: p.code, productId: f.productId, factor: Number(f.factor), unitPrice, availableQuantity: Number(p.availabilityData.availableQuantity ?? 0) };
      }
    }
  }
  throw new Error('eligible winning program(s) have no buyable+priced factor SKU for this user — cannot earn via script');
}

async function userToken(email, password) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password, scope: 'offline_access', storeId: STORE_ID }),
  });
  if (!res.ok) throw new Error(`user auth failed for ${email}: ${res.status} ${(await res.text().catch(() => '')).slice(0, 160)}`);
  return (await res.json()).access_token;
}

/** POST a GraphQL op with the USER token. Throws on transport error or a non-empty errors[]. */
async function gql(token, query, label) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(`${label}: GraphQL errors ${JSON.stringify(j.errors).slice(0, 240)}`);
  verbose(`gql ${label} ok`);
  return j.data;
}

/** Read the live balance via the admin op-log endpoint (points key = security-account userId). */
async function readBalance(userId) {
  const r = await api('GET', `/api/loyalty-program-operation-log/balance/${encodeURIComponent(userId)}`, null, { expectStatus: [200, 404] });
  // Endpoint returns a number or an object with a balance/points field depending on version — be defensive.
  if (typeof r === 'number') return r;
  return Number(r?.balance ?? r?.points ?? r?.amount ?? 0) || 0;
}

/** One earn order for the user. Returns the created order number. */
async function placeEarnOrder(token, userId, productId, qty) {
  await gql(token, `mutation { addItem(command: { cartName: "default" storeId: "${STORE_ID}" userId: "${userId}" productId: "${productId}" quantity: ${qty} }) { id } }`, 'addItem');
  const cartData = await gql(token, `query { cart(cartName: "default" storeId: "${STORE_ID}" userId: "${userId}" currencyCode: "USD" cultureName: "en-US") { id availableShippingMethods { code optionName price { amount } } availablePaymentMethods { code } } }`, 'get_cart');
  const cart = cartData?.cart;
  if (!cart?.id) throw new Error('cart not resolved after addItem');
  const ship = (cart.availableShippingMethods || []).find((m) => m.code === 'FixedRate') || cart.availableShippingMethods?.[0];
  if (!ship) throw new Error('no available shipping method');
  await gql(token, `mutation { addOrUpdateCartShipment(command: { storeId: "${STORE_ID}" userId: "${userId}" currencyCode: "USD" cultureName: "en-US" shipment: { shipmentMethodCode: "${ship.code}" shipmentMethodOption: "${ship.optionName}" price: ${ship.price?.amount ?? 0} deliveryAddress: { firstName: "Seed" lastName: "Agent" line1: "100 Main St" city: "New York" countryCode: "US" countryName: "United States" postalCode: "10001" regionId: "US-NY" regionName: "New York" } } }) { id } }`, 'set_shipment');
  await gql(token, `mutation { addOrUpdateCartPayment(command: { storeId: "${STORE_ID}" userId: "${userId}" currencyCode: "USD" cultureName: "en-US" payment: { paymentGatewayCode: "DefaultManualPaymentMethod" } }) { id } }`, 'set_payment');
  const order = await gql(token, `mutation { createOrderFromCart(command: { cartId: "${cart.id}" }) { id number } }`, 'place_order');
  return order?.createOrderFromCart?.number || '(unknown)';
}

/** Live storefront availability for a product as the user (stock decrements per order). */
async function currentAvailability(token, productId) {
  const d = await gql(token, `query { product(id: "${productId}" storeId: "${STORE_ID}") { availabilityData { availableQuantity } } }`, 'availability').catch(() => null);
  return Number(d?.product?.availabilityData?.availableQuantity ?? 0);
}

async function run() {
  const { email, password, balanceUserId, source } = resolveUser(USER_ARG);
  if (!email || !password) { console.error(`ABORT: could not resolve email+password for "${USER_ARG}" (${source}). Set the alias' *_env vars in .env.local.`); process.exit(2); }

  log(`Target user: ${email} (${source})`);
  log(`Cap: --max-orders ${MAX_ORDERS} | LINE_ITEM_LIMIT qty < ${LINE_ITEM_LIMIT + 1}`);

  // Auth as the user (read-only until an order is placed) so the WINNING program + its live price/stock are
  // resolved from the user's own storefront context — eligibility and earning both depend on the user.
  const token = await userToken(email, password);
  const userId = (await gql(token, `query { me { id } }`, 'me'))?.me?.id || balanceUserId;
  if (!userId) throw new Error('could not resolve userId (me.id) for the target user');
  const userGroups = await getUserGroups(email);
  const earn = await resolveWinningEarning(token, userGroups);
  const perUnit = earn.factor * earn.unitPrice;   // points = factor × unit price × qty (measured, not factor × qty)
  log(`User groups: [${userGroups.join(', ')}]`);
  log(`Winning program: "${earn.programName}" (pri ${earn.priority}) → earn SKU ${earn.sku} (factor ${earn.factor} × $${earn.unitPrice} = ${perUnit} PTS/unit, stock ${earn.availableQuantity})`);
  if (perUnit <= 0) throw new Error(`winning SKU ${earn.sku} earns 0 PTS/unit (factor ${earn.factor} × price ${earn.unitPrice}) — cannot reach a points target`);

  const startBalance = await readBalance(userId).catch(() => 0);
  const target = TARGET_POINTS != null ? TARGET_POINTS : null;
  log(`Current balance: ${startBalance} PTS`);
  if (target != null) log(`Points target: ${target} PTS (remaining ≈ ${Math.max(0, target - startBalance)})`);
  if (TARGET_ORDERS != null) log(`Orders target: ${TARGET_ORDERS} (capped at ${MAX_ORDERS})`);

  // Per-order qty approaches the remaining target, bounded by the line-item limit AND live inventory.
  const remaining = target != null ? Math.max(0, target - startBalance) : perUnit * 100;
  const qtyFor = (avail) => Math.max(1, Math.min(LINE_ITEM_LIMIT, avail || LINE_ITEM_LIMIT, Math.ceil(remaining / perUnit)));

  if (DRY_RUN) {
    const q = qtyFor(earn.availableQuantity);
    const estOrders = TARGET_ORDERS != null ? TARGET_ORDERS : Math.max(1, Math.ceil(remaining / (perUnit * q)));
    log(`[DRY] PLAN: ~${estOrders} order(s) of ${earn.sku} × qty ${q} (${perUnit} PTS/unit) → approach ${target ?? '(orders mode)'} PTS.`);
    if (estOrders > MAX_ORDERS) log(`[DRY] ⚠ estimated ${estOrders} orders EXCEEDS --max-orders ${MAX_ORDERS} — lower --points or raise --max-orders.`);
    if (target != null && earn.availableQuantity > 0 && remaining > perUnit * earn.availableQuantity * MAX_ORDERS) log(`[DRY] ⚠ target may exceed what ${MAX_ORDERS} orders × stock ${earn.availableQuantity} can earn.`);
    log('[DRY] No orders placed.');
    return;
  }

  // ⚠ LIVE: places real orders.
  let placed = 0; let balance = startBalance;
  const done = () => (target != null ? balance >= target : placed >= TARGET_ORDERS);
  while (!done() && placed < MAX_ORDERS) {
    const avail = await currentAvailability(token, earn.productId);   // re-read: stock decrements as we buy
    if (avail <= 0) { log(`⚠ ${earn.sku} out of stock (availableQuantity ${avail}) — stopping after ${placed} order(s).`); break; }
    const qty = qtyFor(avail);
    const num = await placeEarnOrder(token, userId, earn.productId, qty);
    placed++;
    // Earn settles asynchronously (ProcessOrdersAsync Hangfire ~10s) — poll before re-reading.
    for (let i = 0; i < 8; i++) { await sleep(5000); const b = await readBalance(userId); if (b !== balance) { balance = b; break; } balance = b; }
    log(`  order ${placed}: ${num} (${earn.sku} ×${qty}) → balance ${balance} PTS`);
  }
  if (target != null && balance < target) log(`⚠ stopped at ${balance}/${target} PTS after ${placed} order(s) (hit --max-orders ${MAX_ORDERS} or stock). Re-run to continue, or lower the target.`);
  else log(`✓ done: ${placed} order(s) placed, balance now ${balance} PTS.`);
}

(async () => {
  console.log(`💰 Seed Loyalty Balance (EARN via real orders)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (TEARDOWN) { console.log('⚠ --teardown is a NO-OP: loyalty points CANNOT be un-earned (no balance-write API). Nothing to do.'); return; }
  assertSafeTarget();
  await auth();
  await run();
})().catch((e) => { console.error('FAILED:', e.message); if (VERBOSE) console.error(e.stack); process.exit(1); });
