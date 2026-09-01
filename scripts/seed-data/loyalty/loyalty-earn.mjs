/**
 * loyalty-earn.mjs — the ONE implementation of "raise a user's loyalty balance".
 *
 * Side-effect-free module: importing it starts nothing. Every I/O helper takes its transport by
 * injection (`api` for the admin REST surface, `gql` for a customer-token GraphQL call), so the
 * seeders share this code instead of each carrying a similar-looking copy, and the unit tests can
 * exercise the decision rules with no network at all.
 *
 * WHY EARNING IS THE ONLY MECHANISM. vc-module-loyalty exposes the operation log READ-ONLY. Confirmed
 * live against vcst-qa's own swagger on 2026-09-01 — `VirtoCommerce.Loyalty` declares exactly two
 * operation-log routes:
 *     POST /api/loyalty-program-operation-log/search
 *     GET  /api/loyalty-program-operation-log/balance/{userId}
 * There is no write, no delete, no set and no debit anywhere in the module, so a balance moves only
 * when the LoyaltyProgramHandler earns or redeems on a REAL order. Consequences the callers inherit:
 *
 *   • funding places a real, non-reversible order on the target env;
 *   • it is not idempotent — running it again earns more;
 *   • it CANNOT be undone, so teardown can only warn;
 *   • the AMOUNT is not under the caller's control. Points = factor x unit price x qty, and the
 *     factor belongs to whichever ProductPoints program wins for that user. On vcst-qa the winner for
 *     a group-less account is a factor-500 program on a $60 SKU, so ONE unit earns 30,000 points.
 *     A caller that needs a small balance cannot get one by asking for less; qty 1 is the floor.
 *
 * That last point is a fixture-design constraint, not a footnote: any test-data design that needs a
 * balance both SPENDABLE and SMALL has to be split across two accounts, because this environment can
 * produce the first but not the second.
 */

/** Store LINE_ITEM_LIMIT: a quantity of 1,000,000 or more is rejected by the cart validator. */
export const EARN_LINE_ITEM_LIMIT = 999999;

/**
 * The customer-group gate a program's condition tree declares. Walks SELECTED `children` only —
 * `availableChildren` is the palette of conditions the UI offers, not the ones in force, and reading
 * it would make every program look universally eligible. Pure.
 */
export function programGroupGate(program) {
  let all = false;
  const groups = new Set();
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.id === 'AnyUserGroupCondition') all = true;
    if (node.id === 'UserGroupIsCondition') (node.groups || []).forEach((g) => groups.add(g));
    (node.children || []).forEach(walk);
  };
  walk(program?.dynamicExpression);
  return { all, groups };
}

/** Is this a ProductPoints program that could win for this user right now? Pure. */
export function isEligibleProgram(p, userGroups = [], now = new Date()) {
  if (!p || p.programType !== 'ProductPoints' || !p.isActive) return false;
  if (p.startDate && new Date(p.startDate) > now) return false;
  if (p.endDate && new Date(p.endDate) < now) return false;
  const gate = programGroupGate(p);
  return gate.all || userGroups.some((g) => gate.groups.has(g));
}

/** Eligible ProductPoints programs, highest priority first. Pure. */
export function rankEligiblePrograms(programs = [], userGroups = [], now = new Date()) {
  return programs.filter((p) => isEligibleProgram(p, userGroups, now))
    .sort((a, b) => (b.priority || 0) - (a.priority || 0));
}

/** Points a single unit earns. NOT factor x qty — the unit PRICE is in the product. Pure. */
export const pointsPerUnit = (factor, unitPrice) => Number(factor) * Number(unitPrice);

/**
 * Quantity for one order, approaching `remaining` points without exceeding stock or the line limit.
 * Never below 1: an order of zero units earns nothing and would loop forever. Pure.
 */
export function qtyForTarget({ remaining, perUnit, available = null, lineItemLimit = EARN_LINE_ITEM_LIMIT } = {}) {
  if (!(Number(perUnit) > 0)) return 0;
  const wanted = Math.ceil(Number(remaining) / Number(perUnit));
  return Math.max(1, Math.min(lineItemLimit, available || lineItemLimit, wanted));
}

/**
 * The SKU that actually earns for THIS user: the buyable factor SKU of the highest-priority eligible
 * program. Only the single global winner earns its factor, so candidates are taken in priority order
 * and the first whose factor SKU is buyable+priced for the user is used — being buyable also proves
 * the product is linked into that user's virtual catalog.
 *
 * `earnInfo(productId)` is injected: it must return `{ sku, productId, unitPrice, availableQuantity }`
 * for a buyable, priced product and `null` otherwise. Returns null when nothing resolves.
 */
export async function resolveWinningEarning({ api, earnInfo, userGroups = [], now = new Date(), onFallback = null } = {}) {
  const programs = (await api('POST', '/api/loyalty-programs/search', { take: 500 }, { expectStatus: [200, 201] }))?.results || [];
  const candidates = rankEligiblePrograms(programs, userGroups, now);
  if (!candidates.length) return null;
  const allFactors = (await api('POST', '/api/loyalty-program-product-factors/search', { take: 1000 }, { expectStatus: [200, 201] }))?.results || [];
  for (const prog of candidates) {
    for (const f of allFactors.filter((x) => x.loyaltyProgramId === prog.id && Number(x.factor) > 0)) {
      const info = await earnInfo(f.productId);
      if (info) {
        if (prog !== candidates[0] && onFallback) onFallback(candidates[0], prog);
        return { programName: prog.name, programId: prog.id, priority: prog.priority, factor: Number(f.factor), ...info };
      }
    }
  }
  return null;
}

/**
 * Place ONE earn order as the user. `gql(query, label)` is injected and must carry the CUSTOMER token.
 * Returns the created order number. The shipping address is a literal only because a brand-new
 * contact has none of its own and checkout will not reach a decisive state without one; nothing
 * asserts on it.
 */
export async function placeEarnOrder({
  gql, storeId, userId, productId, qty, currency = 'USD', culture = 'en-US',
} = {}) {
  await gql(`mutation { addItem(command: { cartName: "default" storeId: "${storeId}" userId: "${userId}" productId: "${productId}" quantity: ${qty} }) { id } }`, 'addItem');
  const cartData = await gql(`query { cart(cartName: "default" storeId: "${storeId}" userId: "${userId}" currencyCode: "${currency}" cultureName: "${culture}") { id availableShippingMethods { code optionName price { amount } } availablePaymentMethods { code } } }`, 'get_cart');
  const cart = cartData?.cart;
  if (!cart?.id) throw new Error('cart not resolved after addItem');
  const ship = (cart.availableShippingMethods || []).find((m) => m.code === 'FixedRate') || cart.availableShippingMethods?.[0];
  if (!ship) throw new Error('no available shipping method');
  await gql(`mutation { addOrUpdateCartShipment(command: { storeId: "${storeId}" userId: "${userId}" currencyCode: "${currency}" cultureName: "${culture}" shipment: { shipmentMethodCode: "${ship.code}" shipmentMethodOption: "${ship.optionName}" price: ${ship.price?.amount ?? 0} deliveryAddress: { firstName: "Seed" lastName: "Agent" line1: "100 Main St" city: "New York" countryCode: "US" countryName: "United States" postalCode: "10001" regionId: "US-NY" regionName: "New York" } } }) { id } }`, 'set_shipment');
  await gql(`mutation { addOrUpdateCartPayment(command: { storeId: "${storeId}" userId: "${userId}" currencyCode: "${currency}" cultureName: "${culture}" payment: { paymentGatewayCode: "DefaultManualPaymentMethod" } }) { id } }`, 'set_payment');
  const order = await gql(`mutation { createOrderFromCart(command: { cartId: "${cart.id}" }) { id number } }`, 'place_order');
  return order?.createOrderFromCart?.number || '(unknown)';
}

/**
 * Earn is settled asynchronously by a Hangfire job (~10s), so a balance read straight after the order
 * still reports the old number. Polls until it MOVES, or gives up and returns the last reading —
 * never invents one. Injected `readBalance` + `sleep` keep it testable.
 */
export async function pollBalanceChange({ readBalance, userId, from, sleep, attempts = 8, intervalMs = 5000 } = {}) {
  let balance = from;
  for (let i = 0; i < attempts; i++) {
    await sleep(intervalMs);
    const b = await readBalance(userId);
    balance = b;
    if (b !== from) break;
  }
  return balance;
}
