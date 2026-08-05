/**
 * sales-rep-stats-specs.mjs — SINGLE SOURCE OF TRUTH for the Sales Rep *statistics* fixtures
 * (VCST-5589 follow-up) and for the statistics window model the storefront widgets request.
 *
 * Side-effect-free (no env read, no network, no fs) so the seeder, the drift-guard validator, the
 * read-only statistics probe, AND the unit tests all import it.
 *
 * WHY THIS EXISTS
 * ---------------
 * The vcptcore-qa sales-rep seed was too thin to JUDGE several statistics assertions: 1 rep-attributed
 * order, 0 non-empty carts, ~1 product, 1 of 4 served orgs with orders. Every period-over-period
 * comparison window was 0, which makes BL-SR-003 (`*ChangePercent` is NULL when the previous baseline
 * is 0) indistinguishable from "the UI never implemented the change indicator".
 *
 * WINDOW MODEL — mirrors the storefront's `buildStatisticsWindows()` so the probe reports exactly what
 * the widgets ask for. Bounds are inclusive UTC instants and the server does NO truncation
 * (BL-SR-001), so the CALLER owns the time component.
 *
 * ── HARD PLATFORM CONSTRAINT (verified live on vcptcore-qa, 2026-08-03) ──────────────────────────
 * `CustomerOrder.createdDate` is **server-assigned and silently ignored** on BOTH
 * `POST` and `PUT /api/order/customerOrders`: a body carrying `2026-06-10T14:00:00Z` read back as the
 * server's own `now`. The only date-ish fields on the aggregate are `createdDate` / `modifiedDate` /
 * `cancelledDate`, none writable. The cart path is the same — xAPI `addItem` *accepts* a `createdDate`
 * input but the created cart does not land in that past window.
 *
 * CONSEQUENCE: any window lying strictly in the PAST (previous week, the previous month's day-span,
 * last year) CANNOT be seeded through the API, so `comparison.previous` is 0 **by construction** for
 * every axis and `*ChangePercent` is legitimately NULL. Do NOT "fix" this by seeding same-day orders
 * and calling the comparison axis covered — it is not. See `COMPARISON_AXES[].pastOnlyPrevious`.
 *
 * NATURAL (zero-seed) PATH to a non-null order percent: `prevMonth` is the same day-span in the
 * previous month, so on 2026-08-DD it spans Jul 1 → Jul DD. A pre-existing rep order dated
 * 2026-07-16T22:02Z therefore falls INSIDE prevMonth from **2026-08-17** onward — from that date the
 * order `mtdVsPrevMonth` axis has a real non-zero baseline with no seeding at all.
 */

/** AGENT-TEST- prefixes so teardown sweeps exactly what these fixtures create. */
export const CART_MARK = 'AGENT-TEST-SR-CART';
export const STATS_ORDER_MARK = 'AGENT-TEST-SRO-STATS';

export const cartName = (key) => `${CART_MARK}-${key}`;
export const statsOrderNumber = (key) => `${STATS_ORDER_MARK}-${key}`;

/** A committed fixture must carry NO runtime platform GUID (those live in aliases.<env>.json). */
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The statistics windows the storefront dashboard/profile widgets request, given "now" (PURE).
 * Week starts MONDAY (UTC). `prevMonth` / `lastYear` are the SAME DAY-SPAN in the previous
 * month / year — month-to-date and year-to-date are compared like-for-like, which is exactly why a
 * mid-month order can fall OUTSIDE the previous-month window early in a month.
 */
export function buildStatisticsWindows(now = new Date()) {
  const d = new Date(now);
  const Y = d.getUTCFullYear(); const M = d.getUTCMonth(); const D = d.getUTCDate();
  const iso = (x) => x.toISOString();
  const utc = (...a) => new Date(Date.UTC(...a));
  const endOfDay = (x) => new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate(), 23, 59, 59, 999));

  const mondayOffset = (d.getUTCDay() + 6) % 7;          // Sunday(0) -> 6
  const weekStart = utc(Y, M, D - mondayOffset);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const prevWeekEnd = new Date(weekStart.getTime() - 1);

  return {
    today:     { from: iso(utc(Y, M, D)),     to: iso(d) },
    week:      { from: iso(weekStart),        to: iso(d) },
    prevWeek:  { from: iso(prevWeekStart),    to: iso(prevWeekEnd) },
    mtd:       { from: iso(utc(Y, M, 1)),     to: iso(d) },
    prevMonth: { from: iso(utc(Y, M - 1, 1)), to: iso(endOfDay(utc(Y, M - 1, D))) },
    ytd:       { from: iso(utc(Y, 0, 1)),     to: iso(d) },
    lastYear:  { from: iso(utc(Y - 1, 0, 1)), to: iso(endOfDay(utc(Y - 1, M, D))) },
  };
}

/**
 * The three comparison axes the widgets render, as (current, previous) window-key pairs.
 * `pastOnlyPrevious: true` marks an axis whose PREVIOUS window lies entirely in the past and is
 * therefore UN-SEEDABLE through the API (see the createdDate constraint above). The probe labels
 * those STRUCTURALLY-ZERO so a NULL percent there is never mistaken for a product finding.
 */
export const COMPARISON_AXES = [
  { key: 'mtdVsPrevMonth', current: 'mtd',  previous: 'prevMonth', pastOnlyPrevious: true },
  { key: 'weekVsPrevWeek', current: 'week', previous: 'prevWeek',  pastOnlyPrevious: true },
  { key: 'ytdVsLastYear',  current: 'ytd',  previous: 'lastYear',  pastOnlyPrevious: true },
];

/**
 * TOP-SELLER SHAPING (BL-SR-008). Top Sellers must visibly RE-ORDER between `by-units` and
 * `by-revenue`; the base seeder's uniform "quantity 1, price = total/n" split can never produce that.
 * Each line pins a per-line (productSlot, quantity, unitPrice) so the two rankings deliberately
 * disagree — this is why the shaped order needs a spec module and cannot be a flat CSV row:
 *
 * The six lines are shaped so the two rankings are EXACTLY REVERSED — every slot moves, and no two
 * lines tie on either axis, so a ranking assertion can never pass by coincidence:
 *
 *   by-units    [0, 3, 2, 4, 1, 5]
 *   by-revenue  [5, 1, 4, 2, 3, 0]
 *
 * WHY SIX AND NOT THREE (093 SR-HD-010): the Top Sellers widget renders `take: 5` by default and the
 * backend caps `take` at 10. With only three distinct purchased products the 5-row cap is
 * unobservable — the widget shows every product it has, so "exactly 5 rows" and "all rows" are the
 * same assertion and the cap is never actually exercised. Six distinct products make the cap bite,
 * and because the top-5 SETS differ per sort ([0,3,2,4,1] by units vs [5,1,4,2,3] by revenue) the
 * excluded product differs too — so the cap is proven to apply AFTER ranking, not before.
 *
 * `productSlot` indexes the live-discovered DISTINCT store-product list (never a hardcoded SKU or
 * GUID), so the fixture stays env-portable: product IDENTITY comes from the env, quantity + price
 * from here. Order line items are not inventory-validated, so these need no stock.
 */
export const TOP_SELLER_LINES = [
  { productSlot: 0, quantity: 40, unitPrice: 3.50 },   //  40 units, $ 140.00  -> #1 units, #6 revenue
  { productSlot: 1, quantity: 3,  unitPrice: 260.00 }, //   3 units, $ 780.00  -> #5 units, #2 revenue
  { productSlot: 2, quantity: 12, unitPrice: 25.00 },  //  12 units, $ 300.00  -> #3 units, #4 revenue
  { productSlot: 3, quantity: 25, unitPrice: 6.00 },   //  25 units, $ 150.00  -> #2 units, #5 revenue
  { productSlot: 4, quantity: 8,  unitPrice: 45.00 },  //   8 units, $ 360.00  -> #4 units, #3 revenue
  { productSlot: 5, quantity: 2,  unitPrice: 520.00 }, //   2 units, $1040.00  -> #6 units, #1 revenue
];

/** The shaped order's org + status. `Processing` keeps it inside the BL-SR-005 baseline set. */
export const TOP_SELLER_ORDER = {
  key: 'TOPSELLERS',
  alias: 'SR_STATS_TOPSELLER_ORDER',
  orgKey: 'ORG-002',            // TechFlow — a SECOND served org with real revenue (priority 3)
  store: 'B2B-store',
  status: 'Processing',
  customerName: 'AGENT-TEST-SR TechFlow Buyer',
  lines: TOP_SELLER_LINES,
  test_purpose: 'Shaped multi-line order so salesRepTopSellers re-ranks between by-units and by-revenue (BL-SR-008), in a second served org (BL-SR-002/BL-SREP-002)',
};

/** Extended price of one shaped line (PURE). */
export const lineExtended = (l) => Math.round(l.quantity * l.unitPrice * 100) / 100;

/** Order total implied by the shaped lines (PURE) — what the seeder sends as total/subTotal. */
export const shapedOrderTotal = (lines = TOP_SELLER_LINES) =>
  Math.round(lines.reduce((s, l) => s + lineExtended(l), 0) * 100) / 100;

/**
 * Expected by-units / by-revenue slot rankings from the shaped lines (PURE) — the ORACLE the probe
 * and the unit tests assert, so "the two rankings differ" is a CHECKED property, not a hope.
 * Returns { byUnits: [slot,…], byRevenue: [slot,…] }, best first.
 */
export function expectedRankings(lines = TOP_SELLER_LINES) {
  return {
    byUnits: [...lines].sort((a, b) => b.quantity - a.quantity).map((l) => l.productSlot),
    byRevenue: [...lines].sort((a, b) => lineExtended(b) - lineExtended(a)).map((l) => l.productSlot),
  };
}

/** True when the two rankings genuinely disagree (the whole point of the shaping). */
export function rankingsDiverge(lines = TOP_SELLER_LINES) {
  const { byUnits, byRevenue } = expectedRankings(lines);
  return byUnits.join(',') !== byRevenue.join(',');
}

/**
 * CART FIXTURES (BL-SR-006) — `active-carts` = NON-EMPTY, non-wishlist carts. Two carts in two
 * DIFFERENT served orgs so the dashboard `count` is > 1 and cross-org cart scoping is exercised.
 *
 * `orgKey` is a b2b/organizations.csv business key, resolved to a runtime GUID at seed time (never
 * committed). Carts are created through the storefront xAPI **as the rep** with an
 * `organization_id`-scoped password grant — that org context is what stamps `cart.organizationId`,
 * and rep authorship is what puts the cart in scope (BL-SR-002).
 *
 * `productSlot` indexes the live-discovered **ADD-TO-CART-ABLE** product list — a narrower set than
 * the top-seller list, because a cart line IS inventory-validated: `B2B-store` on vcptcore-qa has NO
 * fulfillment center (`mainFulfillmentCenterId: null`), so every inventory-TRACKED product resolves
 * to `availableQuantity: 0` and `addItem` rejects it with `PRODUCT_FFC_QTY`. Only products whose
 * `availabilityData.isInStock` is true (i.e. inventory tracking off) can be carted.
 *
 * NOTE: the `price` input on `addItem` is NOT honored for this caller, so a cart's line price is the
 * catalog price and cart TOTALS are env-derived, not spec-pinned. `count` is the metric BL-SR-006
 * calls primary, so the spec pins quantity only.
 */
/**
 * Cart line prices come from the CATALOG (the `price` input is not honored for this caller), and this
 * store carries a few real-estate-style listings priced in the millions. Picking one would give the
 * cart tile a ~$12,500,000 total that reads as a rendering bug rather than test data, so cartable
 * product selection PREFERS a plausible B2B unit price and only falls back to any cartable product.
 */
export const MAX_SANE_UNIT_PRICE = 10000;

/** Prefer sanely-priced candidates, keeping discovery order; fall back to everything (PURE). */
export function preferSanelyPriced(candidates, max = MAX_SANE_UNIT_PRICE) {
  const sane = candidates.filter((p) => typeof p.price === 'number' && p.price > 0 && p.price <= max);
  return sane.length ? [...sane, ...candidates.filter((p) => !sane.includes(p))] : candidates;
}

export const CART_FIXTURES = [
  { key: 'ACME', alias: 'SR_STATS_CART_ACME', orgKey: 'ORG-001', productSlot: 0, quantity: 5, test_purpose: 'Active (non-empty) cart in ACME — salesRepCustomerCartStatistics count/lastCartDate non-zero (BL-SR-006)' },
  { key: 'WEST', alias: 'SR_STATS_CART_WEST', orgKey: 'ORG-004', productSlot: 1, quantity: 2, test_purpose: 'Active cart in AcmeWest — a second org so the dashboard cart count is >1 and cross-org scoping is exercised' },
];

/** How many DISTINCT store products the seeder must discover to satisfy every slot. */
export const requiredProductSlots = () =>
  Math.max(...TOP_SELLER_LINES.map((l) => l.productSlot), ...CART_FIXTURES.map((c) => c.productSlot)) + 1;

/** The @td() aliases this fixture set owns. */
export const OWNED_ALIASES = [TOP_SELLER_ORDER.alias, ...CART_FIXTURES.map((c) => c.alias)];

/**
 * Build the shaped order's line items from the discovered product list (PURE).
 * `products` = [{ id, sku, name, catalogId }] — identity from the env, quantity/price from the spec.
 * Throws when a slot cannot be satisfied, so the seeder fails loudly rather than silently
 * collapsing two slots onto one product (which would destroy the by-units/by-revenue divergence).
 */
export function buildShapedItems(lines, products) {
  return lines.map((l) => {
    const p = products[l.productSlot];
    if (!p) throw new Error(`productSlot ${l.productSlot} unsatisfied — only ${products.length} distinct product(s) discovered`);
    return {
      sku: p.sku, productId: p.id, name: p.name, ...(p.catalogId ? { catalogId: p.catalogId } : {}),
      quantity: l.quantity, price: l.unitPrice, productType: 'Physical', currency: 'USD',
    };
  });
}
