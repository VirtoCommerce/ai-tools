/**
 * sales-rep-i18n-plural-specs.mjs — SINGLE SOURCE OF TRUTH for the Sales Rep dashboard
 * SINGULAR-PLURAL i18n fixtures (VCST-5683).
 *
 * Side-effect-free (no env read, no network, no fs) so the seeder, the drift-guard validator and the
 * unit tests all import it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The dashboard sub-lines `placed_today`, `ordered_this_month` and `new_this_week` render a COUNT
 * with a pluralized noun. On every pre-existing fixture those counters sit at 0, so only the
 * ZERO/plural branch has ever been observed — the SINGULAR branch (`1 order` / `1 заказ` / …) has
 * never been rendered in any locale, and a locale sweep therefore cannot judge it.
 *
 * The fixture that makes all three read exactly 1 is one order + one active cart attributed to a rep
 * who serves EXACTLY ONE organization. `SR_REP_ACME3` (Cara Cole) is that rep: `served_orgs` in
 * test-data/sales-rep/sales-reps.csv is `ORG-001` and nothing else, and her ApplicationUser had ZERO
 * authored orders and ZERO carts before this fixture (verified live on vcptcore-qa, 2026-08-14).
 *
 * ── ATTRIBUTION (the trap this spec encodes) ─────────────────────────────────────────────────────
 * `salesRepCustomer*Statistics` scopes by REP AUTHORSHIP, not by organization. Verified live on
 * vcptcore-qa 2026-08-14: ORG-001 holds 15 orders, yet SR_REP_ACME3's ytd count is 0 — because every
 * one of those 15 is authored by a DIFFERENT rep's ApplicationUser (SR_REP_PRIMARY / SR_REP_LAYOUT).
 * So the order must carry BOTH `organizationId` = ORG-001 AND `customerId` = the ACME3 rep's
 * **ApplicationUser** id (`GET /api/platform/security/users/{email}` → `.id`), NOT her Contact id.
 * An order stamped with the Contact id is invisible to every sales-rep statistic and the counter
 * silently stays at 0 — indistinguishable from the bug under test.
 *
 * ── EXACTLY-ONE IS THE WHOLE POINT ───────────────────────────────────────────────────────────────
 * Two orders make the counter read 2 and the singular branch is unobservable again — the fixture
 * would be self-defeating. `overshootErrors()` is the machine-checked statement of that, asserted by
 * the seeder BEFORE it writes anything and by the unit tests.
 *
 * ── PLATFORM CONSTRAINT ──────────────────────────────────────────────────────────────────────────
 * `CustomerOrder.createdDate` is server-assigned and silently ignored on POST/PUT (see
 * sales-rep-stats-specs.mjs). That is not a limitation here: "today" is exactly the window wanted, so
 * the server's own `now` IS the correct value. This fixture is therefore DATE-PERISHABLE — it stops
 * satisfying `placed_today` at the next UTC midnight and must be re-seeded for a later locale sweep.
 */

/** AGENT-TEST- marks so teardown sweeps exactly what this fixture creates and nothing else. */
export const I18N_ORDER_MARK = 'AGENT-TEST-SRO-I18N';
export const I18N_CART_MARK = 'AGENT-TEST-SR-CART-I18N';

export const i18nOrderNumber = (key) => `${I18N_ORDER_MARK}-${key}`;
export const i18nCartName = (key) => `${I18N_CART_MARK}-${key}`;

/** The rep whose dashboard the locale sweep reads. Serves exactly one org — that is why it is her. */
export const I18N_REP_KEY = 'SR_REP_ACME3';
export const I18N_ORG_KEY = 'ORG-001';
export const I18N_STORE = 'B2B-store';

/**
 * The order status the dashboard's "New orders" widget filters on. This is NOT a free choice.
 *
 * ── WHY THIS IS A HARD INVARIANT (VCST-5683, corrected 2026-08-14) ────────────────────────────────
 * The "New orders" tile and its `placed_today` sub-line do not read an unfiltered period. They call
 * `salesRepCustomerOrderStatistics` with a HARDCODED `newOrdersFilter`:
 *
 *     newOrders:      period(filter: "New")
 *     newOrdersToday: period(from: todayFrom, to: todayTo, filter: "New")
 *
 * So an order in ANY other status is invisible to exactly the two counters this fixture exists to
 * drive, while every unfiltered period (`week`/`mtd`/`ytd`) still cheerfully reports `count: 1`.
 * That is the precise failure this fixture first shipped with: the order was seeded `Processing`, the
 * unfiltered probe read 1 and looked green, and the storefront rendered `0 placed today`.
 *
 * The lesson generalises: an UNFILTERED verification query cannot judge a FILTERED widget. Any probe
 * of this fixture must pass `filter: "New"`, matching what the dashboard actually sends.
 */
export const I18N_ORDER_STATUS = 'New';

/**
 * The literal the dashboard passes as `newOrdersFilter`. The seeded status and this filter are the
 * SAME constant by construction — if they were two literals they could drift apart silently, which is
 * exactly how this fixture shipped broken the first time.
 */
export const DASHBOARD_NEW_ORDERS_FILTER = I18N_ORDER_STATUS;

/**
 * THE order. One line, quantity 1 — a single line keeps the Top Sellers widget's own
 * singular/plural surface at 1 too, so the fixture serves the same purpose everywhere it lands.
 * `productSlot` indexes the live-discovered store-product list (never a hardcoded SKU or GUID).
 */
export const I18N_ORDER = {
  key: 'ACME3',
  alias: 'SR_I18N_SINGULAR_ORDER',
  repKey: I18N_REP_KEY,
  orgKey: I18N_ORG_KEY,
  store: I18N_STORE,
  status: I18N_ORDER_STATUS,
  customerName: 'AGENT-TEST-SR-I18N Acme Buyer',
  lines: [{ productSlot: 0, quantity: 1, unitPrice: 49.0 }],
  test_purpose: 'Exactly ONE rep-authored order created today in ORG-001, so the dashboard placed_today / ordered_this_month counters read 1 and the SINGULAR i18n branch renders (VCST-5683)',
};

/**
 * THE cart. Created through the storefront xAPI **as the rep** with an `organization_id`-scoped
 * password grant — that org context is what stamps `cart.organizationId`, and rep authorship is what
 * puts the cart in the rep's statistics scope.
 *
 * `productSlot` indexes the ADD-TO-CART-ABLE list, a narrower set than the order-line list: a cart
 * line IS inventory-validated and `B2B-store` on vcptcore-qa has no fulfillment center
 * (`mainFulfillmentCenterId: null`), so every inventory-TRACKED product resolves to
 * `availableQuantity: 0` and `addItem` rejects it with `PRODUCT_FFC_QTY`. Only products whose
 * `availabilityData.isInStock` is true (inventory tracking off) can be carted.
 */
export const I18N_CART = {
  key: 'ACME3',
  alias: 'SR_I18N_SINGULAR_CART',
  repKey: I18N_REP_KEY,
  orgKey: I18N_ORG_KEY,
  productSlot: 0,
  quantity: 1,
  test_purpose: 'Exactly ONE active (non-empty) cart created today in ORG-001, so the dashboard new_this_week counter reads 1 and the SINGULAR i18n branch renders (VCST-5683)',
};

/** The @td() aliases this fixture set owns. */
export const OWNED_ALIASES = [I18N_ORDER.alias, I18N_CART.alias];

/** A committed fixture must carry NO runtime platform GUID (those live in aliases.<env>.json). */
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Extended price of one line (PURE). */
export const lineExtended = (l) => Math.round(l.quantity * l.unitPrice * 100) / 100;

/** Order total implied by the lines (PURE) — what the seeder sends as total/subTotal. */
export const orderTotal = (lines = I18N_ORDER.lines) =>
  Math.round(lines.reduce((s, l) => s + lineExtended(l), 0) * 100) / 100;

/** How many DISTINCT store products the seeder must discover to satisfy every slot. */
export const requiredProductSlots = () =>
  Math.max(...I18N_ORDER.lines.map((l) => l.productSlot), I18N_CART.productSlot) + 1;

/**
 * The machine-checked statement of "exactly one order, exactly one cart, one org, one rep" (PURE).
 * Returns [] when the fixture set can still produce a SINGULAR counter, else the reasons it cannot.
 *
 * This is not defensive boilerplate: overshooting is the specific way this fixture fails silently.
 * Two orders make `placed_today` read 2, the plural branch renders, every locale assertion passes
 * vacuously, and the singular branch stays as unobserved as it was before the seed ran.
 */
export function overshootErrors() {
  const errs = [];
  const orders = [I18N_ORDER];
  const carts = [I18N_CART];
  if (orders.length !== 1) errs.push(`expected exactly 1 order spec, found ${orders.length} — a second order makes placed_today read 2 and the SINGULAR branch unobservable`);
  if (carts.length !== 1) errs.push(`expected exactly 1 cart spec, found ${carts.length} — a second cart makes new_this_week read 2 and the SINGULAR branch unobservable`);
  const totalQty = I18N_ORDER.lines.reduce((s, l) => s + l.quantity, 0);
  if (I18N_ORDER.lines.length !== 1 || totalQty !== 1) errs.push(`expected exactly 1 order line of quantity 1, found ${I18N_ORDER.lines.length} line(s) totalling ${totalQty}`);
  if (I18N_CART.quantity !== 1) errs.push(`expected cart quantity 1, found ${I18N_CART.quantity}`);
  // The order status must equal the filter the "New orders" widget hardcodes, or the two counters
  // this fixture exists to drive read 0 while every unfiltered period still reports 1.
  if (I18N_ORDER.status !== DASHBOARD_NEW_ORDERS_FILTER) errs.push(`order status must be "${DASHBOARD_NEW_ORDERS_FILTER}" to satisfy the dashboard's hardcoded newOrdersFilter, found "${I18N_ORDER.status}" — newOrders/newOrdersToday would read 0`);
  const orgs = new Set([I18N_ORDER.orgKey, I18N_CART.orgKey]);
  if (orgs.size !== 1 || !orgs.has(I18N_ORG_KEY)) errs.push(`order and cart must target the single served org ${I18N_ORG_KEY}, found [${[...orgs].join(', ')}]`);
  const reps = new Set([I18N_ORDER.repKey, I18N_CART.repKey]);
  if (reps.size !== 1 || !reps.has(I18N_REP_KEY)) errs.push(`order and cart must be authored by the single-org rep ${I18N_REP_KEY}, found [${[...reps].join(', ')}]`);
  return errs;
}

/**
 * Build the order's line items from the discovered product list (PURE).
 * `products` = [{ id, sku, name, catalogId }] — identity from the env, quantity/price from the spec.
 * Throws when a slot cannot be satisfied, so the seeder fails loudly rather than silently writing an
 * order with no resolvable product.
 */
export function buildOrderItems(lines, products) {
  return lines.map((l) => {
    const p = products[l.productSlot];
    if (!p) throw new Error(`productSlot ${l.productSlot} unsatisfied — only ${products.length} distinct product(s) discovered`);
    return {
      sku: p.sku, productId: p.id, name: p.name, ...(p.catalogId ? { catalogId: p.catalogId } : {}),
      quantity: l.quantity, price: l.unitPrice, productType: 'Physical', currency: 'USD',
    };
  });
}
