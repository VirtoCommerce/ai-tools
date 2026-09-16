/**
 * sales-rep-rowcap-specs.mjs — SINGLE SOURCE OF TRUTH for the Sales Rep *widget row-cap* fixtures
 * (VCST-5649: "[FE] [Sales Rep] widget settings: max rows + order status tabs").
 *
 * Side-effect-free (no env read, no network, no fs) so the seeder, the drift-guard validator and the
 * unit tests all import it.
 *
 * WHY THIS EXISTS
 * ---------------
 * VCST-5649's acceptance criteria are about a CAP TAKING EFFECT on rendered rows — Recent Orders
 * (`salesRepOrders`) and Top sellers (`salesRepTopSellers`), in BOTH the `dashboard` scope and the
 * org-scoped `customerProfile` scope. A cap is only observable when the underlying data set is
 * STRICTLY LARGER than the cap; with fewer rows than the cap, "cap = 5" and "cap = 20" render
 * identically and every assertion passes vacuously.
 *
 * The cases must run as **SR_REP_LAYOUT** (`agent-test-sr-layout@example.com`) — the only rep whose
 * persisted layout the 091/093/VCST-5649 cases may mutate (see sales-rep-layout-specs.mjs). But
 * `salesRepOrders` attributes an order to a rep by `order.CustomerId == the rep's ApplicationUser
 * (login) id` — NOT by organization and NOT by the Contact id — so SR_REP_LAYOUT saw
 * `totalCount: 0` / `topSellers: []` even though it serves two orgs that DO have orders (those
 * belong to SR_REP_PRIMARY). Verified live on vcptcore-qa 2026-08-11 before this fixture existed.
 *
 * SIZING — each number below is derived from an acceptance criterion, not chosen for roundness:
 *   · ORDERS_PER_ORG.ORG-001 >= 6   the `customerProfile` scope is ORG-SCOPED, so the ACME slice
 *                                   alone must exceed the registry default cap of 5.
 *   · total orders >= 12            distinguishes caps 1 / 3 / 5 / 10 on the dashboard scope and
 *                                   keeps a cap-20 render meaningfully below the cap.
 *   · >= 3 distinct statuses        the status-tab checkboxes are only verifiable when unchecking a
 *                                   tab can actually REMOVE rows while others remain.
 *   · >= 6 distinct products        `salesRepTopSellers` caps `take` at 10 and defaults to 5, so six
 *                                   distinct products make the default cap bite.
 *
 * NON-GOALS (deliberate, do not "fix"):
 *   · No `SalesRepLayout.*` CustomerPreference is seeded. The row-cap cases start from the
 *     never-saved (null) layout baseline and SAVE it themselves; seeding one would destroy the
 *     precondition. This module creates ORDERS ONLY.
 *   · SR_REP_PRIMARY's orders are untouched — this fixture set is attributed exclusively to
 *     SR_REP_LAYOUT and uses its own AGENT-TEST-SRO-ROWCAP- number space.
 *   · `createdDate` is server-assigned (see sales-rep-stats-specs.mjs), so every order lands "today".
 *     Row caps are count-based, not date-based, so that costs nothing here.
 */
import { GUID_RE, lineExtended } from './sales-rep-stats-specs.mjs';

export { GUID_RE, lineExtended };

/** AGENT-TEST- prefix so teardown sweeps exactly what this fixture set creates, and nothing else. */
export const ROWCAP_ORDER_MARK = 'AGENT-TEST-SRO-ROWCAP';

/** Deterministic order number for a fixture key (PURE) — the committed business key. */
export const rowcapOrderNumber = (key) => `${ROWCAP_ORDER_MARK}-${key}`;

/** The rep these orders are attributed to. NEVER change to SR_REP_PRIMARY (see header). */
export const ROWCAP_REP_KEY = 'SR_REP_LAYOUT';

/** The store the widgets query. Orders on any other store are invisible to salesRepOrders. */
export const ROWCAP_STORE = 'B2B-store';

/**
 * Acceptance-criteria thresholds, exported so the seeder, the validator and the test cases all read
 * the SAME numbers instead of three drifting copies.
 */
export const ROWCAP_MIN_TOTAL_ORDERS = 12;
export const ROWCAP_MIN_ORDERS_IN_PROFILE_ORG = 6;
export const ROWCAP_MIN_DISTINCT_STATUSES = 3;
export const ROWCAP_MIN_DISTINCT_PRODUCTS = 6;

/** The org whose customer profile the `customerProfile`-scope cases open (ACME). */
export const ROWCAP_PROFILE_ORG_KEY = 'ORG-001';

/**
 * Statuses drawn from the LIVE `salesRepOrderFilterRules(storeId:"B2B-store")` rule list on
 * vcptcore-qa (2026-08-11): Cancelled, Completed, New, Payment required, Pending, Processing.
 * A status outside that list would render no tab, so the status-tab cases could not select it.
 * `Pending` is deliberately unused: an EMPTY tab is itself a case (checking it must not add rows).
 */
export const ROWCAP_STATUS_VOCABULARY = ['Cancelled', 'Completed', 'New', 'Payment required', 'Pending', 'Processing'];

/**
 * The 14 orders. `productSlot` indexes the live-discovered DISTINCT store-product list (identity
 * comes from the env, quantity/price from here) exactly like TOP_SELLER_LINES — never a hardcoded
 * SKU or GUID, so the fixture stays env-portable.
 *
 * Slot coverage is checked by the validator: all six slots must appear in at least one NON-Cancelled
 * order, because a cancelled order is a plausible exclusion from top-seller aggregation and the
 * six-distinct-product requirement must not depend on that being false.
 */
export const ROWCAP_ORDERS = [
  // --- ORG-001 / AcmeCorp — 8 orders, so the org-scoped customerProfile widget exceeds cap 5 ---
  { key: 'ACME-01', orgKey: 'ORG-001', status: 'New',              lines: [{ productSlot: 0, quantity: 3, unitPrice: 12.00 }] },
  { key: 'ACME-02', orgKey: 'ORG-001', status: 'New',              lines: [{ productSlot: 1, quantity: 2, unitPrice: 55.00 }] },
  { key: 'ACME-03', orgKey: 'ORG-001', status: 'Processing',       lines: [{ productSlot: 2, quantity: 5, unitPrice: 20.00 }] },
  { key: 'ACME-04', orgKey: 'ORG-001', status: 'Processing',       lines: [{ productSlot: 3, quantity: 1, unitPrice: 250.00 }] },
  { key: 'ACME-05', orgKey: 'ORG-001', status: 'Completed',        lines: [{ productSlot: 4, quantity: 4, unitPrice: 30.00 }] },
  { key: 'ACME-06', orgKey: 'ORG-001', status: 'Completed',        lines: [{ productSlot: 5, quantity: 2, unitPrice: 80.00 }] },
  { key: 'ACME-07', orgKey: 'ORG-001', status: 'Cancelled',        lines: [{ productSlot: 0, quantity: 1, unitPrice: 12.00 }] },
  { key: 'ACME-08', orgKey: 'ORG-001', status: 'Payment required', lines: [{ productSlot: 1, quantity: 1, unitPrice: 55.00 }] },
  // --- ORG-002 / TechFlow — 6 orders, so the dashboard scope is cross-org and > 12 in total ------
  { key: 'TECH-01', orgKey: 'ORG-002', status: 'New',              lines: [{ productSlot: 2, quantity: 2, unitPrice: 20.00 }] },
  { key: 'TECH-02', orgKey: 'ORG-002', status: 'Processing',       lines: [{ productSlot: 3, quantity: 2, unitPrice: 250.00 }] },
  { key: 'TECH-03', orgKey: 'ORG-002', status: 'Completed',        lines: [{ productSlot: 4, quantity: 1, unitPrice: 30.00 }] },
  { key: 'TECH-04', orgKey: 'ORG-002', status: 'Completed',        lines: [{ productSlot: 5, quantity: 3, unitPrice: 80.00 }] },
  { key: 'TECH-05', orgKey: 'ORG-002', status: 'Cancelled',        lines: [{ productSlot: 0, quantity: 2, unitPrice: 12.00 }] },
  { key: 'TECH-06', orgKey: 'ORG-002', status: 'Payment required', lines: [{ productSlot: 2, quantity: 1, unitPrice: 20.00 }] },
];

/** Customer name stamped on an order, by org (cosmetic, but AGENT-TEST- prefixed for sweeps). */
export const ROWCAP_CUSTOMER_NAME = {
  'ORG-001': 'AGENT-TEST-SR-ROWCAP Acme Buyer',
  'ORG-002': 'AGENT-TEST-SR-ROWCAP TechFlow Buyer',
};
export const rowcapCustomerName = (orgKey) => ROWCAP_CUSTOMER_NAME[orgKey] || 'AGENT-TEST-SR-ROWCAP Buyer';

/** Order total implied by a fixture's lines (PURE) — what the seeder sends as total/subTotal. */
export const rowcapOrderTotal = (order) =>
  Math.round(order.lines.reduce((s, l) => s + lineExtended(l), 0) * 100) / 100;

/** How many DISTINCT store products the seeder must discover to satisfy every slot (PURE). */
export const requiredRowcapProductSlots = (orders = ROWCAP_ORDERS) =>
  Math.max(...orders.flatMap((o) => o.lines.map((l) => l.productSlot))) + 1;

/** Orders belonging to one org business key (PURE). */
export const rowcapOrdersForOrg = (orgKey, orders = ROWCAP_ORDERS) => orders.filter((o) => o.orgKey === orgKey);

/** Distinct statuses across the fixture set, in first-seen order (PURE). */
export const rowcapStatuses = (orders = ROWCAP_ORDERS) => [...new Set(orders.map((o) => o.status))];

/** Distinct org business keys the fixture set spans (PURE). */
export const rowcapOrgKeys = (orders = ROWCAP_ORDERS) => [...new Set(orders.map((o) => o.orgKey))];

/** Distinct product slots referenced by NON-Cancelled orders (PURE) — the top-seller-safe set. */
export const rowcapTopSellerSlots = (orders = ROWCAP_ORDERS) =>
  [...new Set(orders.filter((o) => o.status !== 'Cancelled').flatMap((o) => o.lines.map((l) => l.productSlot)))].sort((a, b) => a - b);

/**
 * The @td() aliases this fixture set owns. Deliberately THREE, not fourteen: the row-cap cases
 * assert on COUNTS (a property of the set, guaranteed by the validator below), and pin an individual
 * order only where a case names a specific row — one per assertion shape.
 */
export const ROWCAP_ALIASES = {
  SR_ROWCAP_ORDER_ACME_NEW: 'ACME-01',
  SR_ROWCAP_ORDER_ACME_CANCELLED: 'ACME-07',
  SR_ROWCAP_ORDER_TECH_COMPLETED: 'TECH-04',
};

export const ROWCAP_OWNED_ALIASES = Object.keys(ROWCAP_ALIASES);

/**
 * Every acceptance-criteria threshold, evaluated against a fixture set (PURE).
 * Returns `[]` when the set is sufficient, else a list of human-readable shortfalls — so the seeder
 * can refuse to write an insufficient set and the validator can fail on the same rule, from ONE
 * implementation rather than two that drift.
 */
export function rowcapShortfalls(orders = ROWCAP_ORDERS) {
  const out = [];
  if (orders.length < ROWCAP_MIN_TOTAL_ORDERS) {
    out.push(`only ${orders.length} order(s), need >= ${ROWCAP_MIN_TOTAL_ORDERS} to distinguish caps 1/3/5/10`);
  }
  const profileCount = rowcapOrdersForOrg(ROWCAP_PROFILE_ORG_KEY, orders).length;
  if (profileCount < ROWCAP_MIN_ORDERS_IN_PROFILE_ORG) {
    out.push(`only ${profileCount} order(s) in ${ROWCAP_PROFILE_ORG_KEY}, need >= ${ROWCAP_MIN_ORDERS_IN_PROFILE_ORG} for the org-scoped customerProfile widget to exceed the default cap of 5`);
  }
  const statuses = rowcapStatuses(orders);
  if (statuses.length < ROWCAP_MIN_DISTINCT_STATUSES) {
    out.push(`only ${statuses.length} distinct status(es), need >= ${ROWCAP_MIN_DISTINCT_STATUSES} for the status-tab cases`);
  }
  for (const s of statuses) {
    if (!ROWCAP_STATUS_VOCABULARY.includes(s)) {
      out.push(`status "${s}" is not in the live salesRepOrderFilterRules vocabulary [${ROWCAP_STATUS_VOCABULARY.join(', ')}] — no tab would render for it`);
    }
  }
  const slots = rowcapTopSellerSlots(orders);
  if (slots.length < ROWCAP_MIN_DISTINCT_PRODUCTS) {
    out.push(`only ${slots.length} distinct product slot(s) in non-Cancelled orders, need >= ${ROWCAP_MIN_DISTINCT_PRODUCTS} for the Top sellers cap to bite`);
  }
  if (rowcapOrgKeys(orders).length < 2) {
    out.push('fixture set spans < 2 orgs — the dashboard scope would be indistinguishable from the customerProfile scope');
  }
  return out;
}

/**
 * Build one order's line items from the discovered product list (PURE).
 * `products` = [{ id, sku, name, catalogId }]. Throws when a slot is unsatisfied so the seeder fails
 * loudly rather than collapsing two slots onto one product (which would silently drop the distinct
 * product count below the Top-sellers cap and make the cap unobservable again).
 */
export function buildRowcapItems(order, products) {
  return order.lines.map((l) => {
    const p = products[l.productSlot];
    if (!p) throw new Error(`rowcap ${order.key}: productSlot ${l.productSlot} unsatisfied — only ${products.length} distinct product(s) discovered`);
    return {
      sku: p.sku, productId: p.id, name: p.name, ...(p.catalogId ? { catalogId: p.catalogId } : {}),
      quantity: l.quantity, price: l.unitPrice, productType: 'Physical', currency: 'USD',
    };
  });
}
