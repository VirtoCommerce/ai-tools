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
  log, verbose, assertSafeTarget, auth, api, loadAliases, loadCsv,
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

/** Pick the highest-factor earning SKU from program-factors.csv (rough — the live winning program decides). */
function pickEarningFactor() {
  try {
    const rows = loadCsv('test-data/loyalty/program-factors.csv');
    const ranked = rows.map((r) => ({ sku: r.sku, factor: Number(r.factor) || 0 })).filter((r) => r.sku && r.factor > 0).sort((a, b) => b.factor - a.factor);
    return ranked[0] || { sku: 'LT-001', factor: 1 };
  } catch { return { sku: 'LT-001', factor: 1 }; }
}

async function userToken(email, password) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password, scope: 'offline_access' }),
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

async function run() {
  const { email, password, balanceUserId, source } = resolveUser(USER_ARG);
  if (!email || !password) { console.error(`ABORT: could not resolve email+password for "${USER_ARG}" (${source}). Set the alias' *_env vars in .env.local.`); process.exit(2); }
  const earn = pickEarningFactor();

  log(`Target user: ${email} (${source})`);
  log(`Earning SKU: ${earn.sku} (factor ${earn.factor})`);
  log(`Cap: --max-orders ${MAX_ORDERS} | LINE_ITEM_LIMIT qty < ${LINE_ITEM_LIMIT + 1}`);

  // Admin token (seed-common auth) for the balance read + safety context.
  const startBalance = balanceUserId ? await readBalance(balanceUserId).catch(() => 0) : 0;
  const target = TARGET_POINTS != null ? TARGET_POINTS : null;
  log(`Current balance: ${balanceUserId ? startBalance : '(unknown — no securityAccountId on alias)'} PTS`);
  if (target != null) log(`Points target: ${target} PTS (remaining ≈ ${Math.max(0, target - startBalance)})`);
  if (TARGET_ORDERS != null) log(`Orders target: ${TARGET_ORDERS} (capped at ${MAX_ORDERS})`);

  // Per-order quantity: approach the remaining target in as few orders as possible, bounded by the
  // line-item limit. Points earned per unit are decided by the LIVE winning program (polled after each
  // order), so this is only an opening estimate; the loop re-reads the real balance and stops at target.
  const perUnitEst = Math.max(1, earn.factor);
  const remaining = target != null ? Math.max(0, target - startBalance) : perUnitEst * 100;
  const qty = Math.min(LINE_ITEM_LIMIT, Math.max(1, Math.ceil(remaining / perUnitEst)));
  const estOrders = TARGET_ORDERS != null ? TARGET_ORDERS : Math.max(1, Math.ceil(remaining / (perUnitEst * qty)));

  if (DRY_RUN) {
    log(`[DRY] PLAN: place ~${estOrders} order(s) of ${earn.sku} × qty ${qty} (est ${perUnitEst}×/unit) → approach ${target ?? '(orders mode)'} PTS.`);
    if (estOrders > MAX_ORDERS) log(`[DRY] ⚠ estimated ${estOrders} orders EXCEEDS --max-orders ${MAX_ORDERS} — target not reachable in one run. Lower --points, raise --max-orders, or make the redemption cases balance-relative (LOY_SKU_PTS_UNIT).`);
    log('[DRY] No orders placed. Earn points are decided by the live winning program and polled at runtime.');
    return;
  }

  // ⚠ LIVE: places real orders.
  const token = await userToken(email, password);
  const meData = await gql(token, `query { me { id } }`, 'me');
  const userId = meData?.me?.id || balanceUserId;
  if (!userId) throw new Error('could not resolve userId (me.id) for the target user');

  let placed = 0; let balance = balanceUserId ? startBalance : await readBalance(userId);
  const done = () => (target != null ? balance >= target : placed >= TARGET_ORDERS);
  while (!done() && placed < MAX_ORDERS) {
    const num = await placeEarnOrder(token, userId, /* productId resolved just-in-time */ await resolveProductId(earn.sku), qty);
    placed++;
    // Earn settles asynchronously (ProcessOrdersAsync Hangfire ~10s) — poll a few times before re-reading.
    for (let i = 0; i < 6; i++) { await sleep(5000); const b = await readBalance(userId); if (b !== balance) { balance = b; break; } balance = b; }
    log(`  order ${placed}: ${num} → balance ${balance} PTS`);
  }
  if (target != null && balance < target) log(`⚠ stopped at ${balance}/${target} PTS after ${placed} order(s) (hit --max-orders ${MAX_ORDERS}). Re-run to continue, or lower the target.`);
  else log(`✓ done: ${placed} order(s) placed, balance now ${balance} PTS.`);
}

/** Resolve an earning product's productId by SKU (admin catalog search). */
async function resolveProductId(sku) {
  const r = await api('POST', '/api/catalog/search/products', { searchPhrase: `code:"${sku}"`, take: 5, responseGroup: 'ItemInfo' }, { expectStatus: [200, 201] });
  const items = r?.items || [];
  const id = (items.find((i) => i.code === sku) || items[0])?.id;
  if (!id) throw new Error(`earning SKU "${sku}" not found — seed standard products first (npm run seed:products)`);
  return id;
}

(async () => {
  console.log(`💰 Seed Loyalty Balance (EARN via real orders)${DRY_RUN ? ' [DRY RUN]' : ''}`);
  if (TEARDOWN) { console.log('⚠ --teardown is a NO-OP: loyalty points CANNOT be un-earned (no balance-write API). Nothing to do.'); return; }
  assertSafeTarget();
  await auth();
  await run();
})().catch((e) => { console.error('FAILED:', e.message); if (VERBOSE) console.error(e.stack); process.exit(1); });
