/**
 * scripts/seed-data/orders-specs.mjs — SINGLE SOURCE OF TRUTH for the order & quote state fixtures
 * (VCST-5482). Side-effect-free (no env, no network, no fs writes on import) so it can be imported by
 * the seeders (seed-order-states.mjs / seed-quotes.mjs), the drift-guard validator
 * (validate-orders-data.mjs), AND the unit tests (scripts/unit/*.test.mjs) alike.
 *
 * WHY THIS EXISTS — these are the highest-value, NON-feature-gated states from
 * test-data/README.md §Order State / Quote Fixtures. They were DEFERRED (blocking ~54 suite-014/015
 * cases) because the admin status strings needed confirming and there was no seeder. The exact
 * platform status strings still want a live check on first run (G6 in .claude/knowledge/execution/quality-gates.md);
 * because they live HERE and nowhere else, correcting one is a one-line edit that the seeder + the
 * validator + the fixtures + the tests all follow.
 *
 * FIXTURE FORMAT — JSON-shaped-to-Swagger (the VCST-5482 pilot). Each fixture file
 * (test-data/orders/*.json, test-data/quotes/*.json) mirrors the platform API request body, so the
 * seeder is a thin resolve-tokens → POST. Runtime GUIDs are NEVER stored in the committed fixture —
 * they are written to test-data/aliases.<env>.json after the POST (per .claude/rules/test-data.md).
 * The deterministic `number` (AGENT-TEST-…) is a business key and DOES live in the committed fixture.
 *
 * NOT in scope (stay DEFERRED, documented in README): invoice / returns-RMA / substitution /
 * negotiation / OOS / discontinued / expired — those are feature-gated and need a product-owner call.
 *
 * DEFERRAL RE-CHECKED 2026-07-25 (TLC-2026-07-25-0415) — the "feature-gated" premise is only
 * PARTLY true, and the store-config half of it is WRONG. A live read of all 96 settings on
 * `GET /api/stores/{STORE_ID}` shows:
 *   - There is NO store-level enable flag for returns, invoice, or buyer-cancel. The README's
 *     assumed keys (`RETURNS_FEATURE_ENABLED`, an invoice store setting, `STORE_CONFIG_BUYER_CANCEL`)
 *     DO NOT EXIST. Nor is there a storefront `$cfg.*` counterpart (knowledge/automation/
 *     storefront-config-flags.md). So "enable the store setting first" is not the blocker.
 *   - Returns: the module IS installed — `Return.ReturnNewNumberTemplate = "RET{0:yyMMdd}-{1:D5}"`
 *     is the only Return.* setting. Presence of the numbering template implies the feature is on.
 *   - Pickup/BOPIS: `XPickup.Enabled = true` (+ `XPickup.GlobalTransferEnabled = true`), so
 *     BOPIS_PICKUP_ORDER is reachable today.
 *   - Invoice: NO platform setting of any kind. Whether a PDF invoice exists on this deployment is
 *     unverified — CHK-047/048 + ORD-014/041/042/043 may be testing a surface that does not exist.
 * What genuinely remains a product-owner call is therefore NOT the config flags but: (a) the exact
 * aggregate status string for a mixed-shipment order (PARTIALLY_SHIPPED_ORDER), (b) the store return
 * window (ORDER_PAST_RETURN_WINDOW), and (c) whether invoice download is in scope at all.
 * Do NOT re-add the phantom store-setting keys to the README when picking this up.
 */

/** AGENT-TEST- prefix so /qa-seed-data teardown sweeps every entity this domain creates. */
export const ORDER_MARK = 'AGENT-TEST-ORD';
export const QUOTE_MARK = 'AGENT-TEST-QTE';

/** Deterministic, idempotency-stable identifiers keyed by the fixture business key. */
export const orderNumber = (key) => `${ORDER_MARK}-${key}`;
export const quoteNumber = (key) => `${QUOTE_MARK}-${key}`;

/**
 * Order state fixtures. `orderStatus` / `shipmentStatus` are the platform admin values the seeded
 * order must end in; `fixtureFile` is the Swagger-shaped create body (relative to test-data/). The
 * `@td()` alias resolves the runtime id from aliases.<env>.json and static fields from the fixture.
 * `blockedCases` documents (for the README + PR body) which suite-014 cases each state unblocks.
 */
export const ORDER_FIXTURES = [
  {
    key: 'COMPLETED',
    alias: 'COMPLETED_ORDER',
    fixtureFile: 'orders/completed-order.json',
    orderStatus: 'Completed',
    shipmentStatus: 'Delivered',
    blockedCases: ['CHK-025', 'CHK-039', 'CHK-040', 'ORD-001', 'ORD-003', 'ORD-007', 'ORD-008', 'ORD-009', 'ORD-010', 'ORD-035'],
  },
  {
    key: 'SHIPPED',
    alias: 'SHIPPED_ORDER',
    fixtureFile: 'orders/shipped-order.json',
    orderStatus: 'Shipped',
    shipmentStatus: 'Sent',
    blockedCases: ['CHK-013', 'ORD-006', 'ORD-012', 'ORD-030'],
  },
  {
    key: 'PROCESSING',
    alias: 'PROCESSING_ORDER',
    fixtureFile: 'orders/processing-order.json',
    orderStatus: 'Processing',
    shipmentStatus: 'New',
    blockedCases: ['CHK-024', 'ORD-047'],
  },
];

/**
 * Quote state fixtures. `quoteStatus` is the platform admin status; `adminPriced` means the seeder
 * must apply per-line pricing after create; `buyerAccepted` means it must then mark the quote accepted.
 */
export const QUOTE_FIXTURES = [
  {
    key: 'ADMIN-RESPONSE',
    alias: 'QUOTE_WITH_ADMIN_RESPONSE',
    fixtureFile: 'quotes/quote-admin-response.json',
    quoteStatus: 'Processing',
    adminPriced: true,
    buyerAccepted: false,
    blockedCases: ['QUOTE-004', 'QUOTE-005', 'QUOTE-006', 'QUOTE-008', 'QUOTE-009', 'QUOTE-018', 'QUOTE-020', 'QUOTE-021', 'QUOTE-025'],
  },
  {
    key: 'ACCEPTED',
    alias: 'ACCEPTED_QUOTE',
    fixtureFile: 'quotes/quote-accepted.json',
    quoteStatus: 'Ordered',
    adminPriced: true,
    buyerAccepted: true,
    blockedCases: ['QUOTE-007', 'QUOTE-024', 'QUOTE-027', 'QUOTE-028', 'QUOTE-030'],
  },
];

/** All fixtures flattened (for validators/iteration). */
export const ALL_FIXTURES = [...ORDER_FIXTURES, ...QUOTE_FIXTURES];

/** The @td() aliases this domain owns (order + quote). */
export const OWNED_ALIASES = ALL_FIXTURES.map((f) => f.alias);

/**
 * Required top-level keys a Swagger-shaped ORDER create body must carry. Kept deliberately small —
 * this is a fixture drift-guard, not the platform's full OpenAPI schema. A live schema pass is the
 * validator's optional second stage; this guarantees the fields the seeder + suites depend on.
 */
export const ORDER_BODY_REQUIRED = ['number', 'storeId', 'currency', 'status', 'items', 'addresses'];
export const QUOTE_BODY_REQUIRED = ['number', 'storeId', 'currency', 'status', 'items'];

/** A committed fixture must contain NO runtime GUID (those live in aliases.<env>.json only). */
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Resolve `{{VAR}}` tokens in every string of a fixture object from `env` (PURE — deep-clones, does
 * not mutate the input). Fixtures only use `{{VAR}}` (env values: STORE_ID / USER_EMAIL /
 * ORG_USER_EMAIL) — never `@td()`, which is for suite CSVs, not create bodies. Returns
 * `{ obj, unresolved }`: any `{{VAR}}` with no env value is LEFT in place and listed in `unresolved`
 * so the seeder can fail loudly instead of POSTing a literal "{{USER_EMAIL}}".
 */
export function resolveTokens(fixtureObj, env = {}) {
  const unresolved = new Set();
  const sub = (s) => s.replace(/\{\{(\w+)\}\}/g, (m, name) => {
    const v = env[name];
    if (v === undefined || v === '') { unresolved.add(name); return m; }
    return String(v);
  });
  const walk = (node) => {
    if (typeof node === 'string') return sub(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') { const o = {}; for (const [k, v] of Object.entries(node)) o[k] = walk(v); return o; }
    return node;
  };
  return { obj: walk(structuredClone(fixtureObj)), unresolved: [...unresolved] };
}

/** Deep-walk a fixture object and return the JSON paths whose string value is a bare GUID. */
export function findGuidLeaks(obj, path = '') {
  const leaks = [];
  const walk = (node, p) => {
    if (typeof node === 'string') { if (GUID_RE.test(node.trim())) leaks.push({ path: p, value: node }); return; }
    if (Array.isArray(node)) { node.forEach((v, i) => walk(v, `${p}[${i}]`)); return; }
    if (node && typeof node === 'object') { for (const [k, v] of Object.entries(node)) walk(v, p ? `${p}.${k}` : k); }
  };
  walk(obj, path);
  return leaks;
}

/**
 * Validate ONE fixture object against the spec + required-keys contract (pure — the validator and the
 * unit tests share this). Returns { ok, problems[] }. Confirms: required keys present, the fixture's
 * `status`/`number` match the spec (no drift), items non-empty, and no runtime GUID leaked in.
 */
export function validateFixtureShape(spec, obj, kind /* 'order' | 'quote' */) {
  const problems = [];
  const required = kind === 'order' ? ORDER_BODY_REQUIRED : QUOTE_BODY_REQUIRED;
  for (const k of required) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === '') problems.push(`missing required key "${k}"`);
  }
  const expectedNumber = kind === 'order' ? orderNumber(spec.key) : quoteNumber(spec.key);
  if (obj.number !== expectedNumber) problems.push(`number "${obj.number}" != spec "${expectedNumber}"`);
  const expectedStatus = kind === 'order' ? spec.orderStatus : spec.quoteStatus;
  if (obj.status !== expectedStatus) problems.push(`status "${obj.status}" != spec "${expectedStatus}" (fix the spec OR the fixture — single source of truth)`);
  if (!Array.isArray(obj.items) || obj.items.length === 0) problems.push('items[] must be non-empty');
  const leaks = findGuidLeaks(obj);
  if (leaks.length) problems.push(`${leaks.length} runtime GUID(s) leaked into the committed fixture (belong in aliases.<env>.json): ${leaks.map((l) => l.path).join(', ')}`);
  return { ok: problems.length === 0, problems };
}

/**
 * Overlay REAL catalog products onto a fixture's line items (PURE — deep-clones). The committed
 * fixture carries synthetic placeholder productId/sku/name (env-agnostic, no GUIDs); at seed time the
 * seeder live-discovers products that actually EXIST in the target env's catalog and this stamps each
 * item's product identity from them, so the seeded order/quote references browsable products (reorder,
 * PDP link, product image all resolve). Quantity / price / currency / productType are KEPT from the
 * fixture (deterministic totals). `products` = [{ id, sku, name, catalogId }]; fewer than items → cycle;
 * empty (e.g. dry-run / bare catalog) → the fixture's placeholders are left untouched.
 */
export function applyCatalogItems(fixtureObj, products = []) {
  const body = structuredClone(fixtureObj);
  if (!Array.isArray(body.items) || !products.length) return body;
  body.items = body.items.map((item, i) => {
    const p = products[i % products.length];
    if (!p) return item;
    return {
      ...item,
      productId: p.id ?? item.productId,
      sku: p.sku ?? p.code ?? item.sku,
      name: p.name ?? item.name,
      ...(p.catalogId ? { catalogId: p.catalogId } : {}),
    };
  });
  return body;
}

/**
 * Finalize an ORDER create body from its Swagger-shaped fixture + runtime context (PURE). Stamps the
 * runtime customer/org attribution and enforces the totals lesson from seed-sales-rep.mjs: the
 * platform folds shipment.total + inPayment.total back into order.Total, so keep the structural
 * shipment/payment records but zero their monetary totals (the payment's `sum` carries the amount).
 * Also stamps the target order/shipment status from the spec so the fixture and the spec can never
 * disagree at seed time. `ctx = { customerId, customerName, organizationId, organizationName }`.
 */
export function finalizeOrderBody(spec, fixtureObj, ctx = {}) {
  const body = structuredClone(fixtureObj);
  body.status = spec.orderStatus;
  if (ctx.customerId) body.customerId = ctx.customerId;
  if (ctx.customerName) body.customerName = ctx.customerName;
  if (ctx.organizationId) body.organizationId = ctx.organizationId;
  if (ctx.organizationName) body.organizationName = ctx.organizationName;
  for (const s of body.shipments || []) {
    s.status = spec.shipmentStatus;
    s.price = 0; s.priceWithTax = 0; s.total = 0; s.totalWithTax = 0;
  }
  for (const p of body.inPayments || []) {
    if (ctx.customerId) p.customerId = ctx.customerId;
    if (ctx.organizationId) p.organizationId = ctx.organizationId;
    p.price = 0; p.priceWithTax = 0; p.total = 0; p.totalWithTax = 0;
  }
  return body;
}

/**
 * Finalize a QUOTE create body from its fixture + runtime context (PURE). Stamps the runtime
 * customer/org attribution and the target status from the spec.
 * `ctx = { customerId, customerName, organizationId, organizationName }`.
 */
export function finalizeQuoteBody(spec, fixtureObj, ctx = {}) {
  const body = structuredClone(fixtureObj);
  body.status = spec.quoteStatus;
  if (ctx.customerId) body.customerId = ctx.customerId;
  if (ctx.customerName) body.customerName = ctx.customerName;
  if (ctx.organizationId) body.organizationId = ctx.organizationId;
  if (ctx.organizationName) body.organizationName = ctx.organizationName;
  // Propagate the quote's currency onto every QuoteItem (and its proposal tier prices). The platform's
  // QuoteItem.Currency / QuoteTierPrice.Currency columns are NOT NULL, so a create with items missing a
  // currency 500s at the DB layer ("Cannot insert NULL into column 'Currency'"). Currency is a single
  // quote-level fact, so we derive it here rather than repeat it per item in the committed fixture.
  const currency = body.currency;
  if (currency && Array.isArray(body.items)) {
    for (const item of body.items) {
      if (!item.currency) item.currency = currency;
      if (Array.isArray(item.proposalPrices)) {
        for (const tp of item.proposalPrices) if (tp && typeof tp === 'object' && !tp.currency) tp.currency = currency;
      }
    }
  }
  return body;
}

/* ────────────────────────────────────────────────────────────────────────────────────────────────
 * VCST-5628 — BUYER'S OWN RETURNS, step 1. Returnable-quantity fixtures.
 *
 * WHY A SECOND FAMILY IN THIS FILE: the repo rule is one spec module per domain, not one per ticket
 * (.claude/knowledge/execution/test-data-authoring.md §Authoring rule). These are customer orders,
 * so the orders spec module owns them. They are a SEPARATE export list (RETURN_ORDER_FIXTURES) from
 * ORDER_FIXTURES because the two families answer different questions, have different seeders, and
 * must not silently pick each other up in a validator loop.
 *
 * WHAT THE FEATURE KEYS ON — the shipment's DeliveryDate. With no DeliveryDate nothing on the order
 * is returnable and there is NO fallback to the order date. seed-order-states.mjs never sets a
 * DeliveryDate at all (its shipments carry `items: []` and no date), which is exactly why these
 * fixtures need their own seeder rather than another ORDER_FIXTURES row.
 *
 * THE DESIGN IS ONE-FACTOR-AT-A-TIME (.claude/rules/test-data.md §SECOND RULE). A is the happy path;
 * B, C and D are each A with EXACTLY ONE thing changed (the delivery date moved outside the window /
 * removed / the order status made disallowed), so a failure names its own cause. A2, E and F carry
 * the three divergences that make their assertions able to fail at all:
 *   - A2: ordered 10 vs delivered 4. If these were equal, an implementation that returned the ORDERED
 *     quantity would pass, and the "capped by what was DELIVERED" rule would be untested.
 *   - E: two deliveries of the SAME line that STRADDLE the window boundary (-40d and today) with
 *     DIFFERENT quantities (5 and 3). Straddling is what distinguishes "window runs from the LATEST
 *     delivery" from "…from the earliest"; the unequal quantities additionally distinguish "sum of
 *     shipment quantities" (8) from "quantity of one shipment" (5 or 3).
 *   - F: a cancelled line and a live line IN THE SAME ORDER. A cancelled-only order could not tell
 *     "the cancelled line is excluded" apart from "the whole order is ineligible".
 *
 * DATES ARE NEVER LITERALS IN THE COMMITTED FIXTURE. A committed `"deliveryDate": "2026-08-13T…"`
 * is correct on the day it is written and silently wrong forever after — the exact failure mode
 * .claude/rules/test-data.md §GOLDEN RULE exists to stop. The fixture carries a RELATIVE
 * `_deliveryOffsetDays` per shipment; the seeder resolves it against seed-time `now` and records both
 * the offset and the resolved instant in aliases.<env>.json, and validate-orders-data.mjs re-checks
 * the resolved instants against the window as real time passes (a fixture seeded 31 days ago is
 * STALE, not merely old).
 * ──────────────────────────────────────────────────────────────────────────────────────────────── */

/** Distinct from ORDER_MARK so a returns teardown can never sweep the ORDER_FIXTURES orders. */
export const RETURN_ORDER_MARK = 'AGENT-TEST-ORD-RET';
export const returnOrderNumber = (key) => `${RETURN_ORDER_MARK}-${key}`;

/**
 * The store's return window, in days, as the fixture SET WAS DESIGNED. This is NOT the source of
 * truth — `returnPolicy(storeId).windowDays` on the live env is — and the seeder reads that policy
 * and ABORTS when it disagrees with this number, because every offset below was chosen to sit a known
 * distance from THIS boundary. Fail loud, never silently seed a fixture set whose "outside the
 * window" order is now inside it.
 */
export const RETURN_WINDOW_DAYS_ASSUMED = 30;

/** The order status the policy is expected to allow, and one it is expected to disallow (fixture D). */
export const RETURN_ALLOWED_STATUS = 'Completed';
export const RETURN_DISALLOWED_STATUS = 'Processing';

/**
 * The ineligibility codes the module's own ReturnIneligibilityReason enum defines. Listed so the
 * validator can reject a typo'd expectation in the spec table rather than let it reach a test case.
 */
export const RETURN_INELIGIBILITY_REASONS = Object.freeze([
  'RETURNS_DISABLED', 'ORDER_STATUS_NOT_ALLOWED', 'LINE_CANCELLED',
  'NOT_DELIVERED', 'OUTSIDE_RETURN_WINDOW', 'NOTHING_LEFT_TO_RETURN',
]);

/**
 * Line roles. A fixture's line items carry `_role` instead of a hardcoded SKU: the seeder
 * live-discovers real catalog products for the target env and stamps them in (no env-specific SKU
 * ever enters a committed fixture). `lineX` is THE line under test — the one every expectation in
 * the table below is about. `cancelledLine` exists only in F.
 */
export const LINE_ROLE_X = 'lineX';
export const LINE_ROLE_CANCELLED = 'cancelledLine';
/**
 * The SECOND line that is eligible at the same time as lineX. Exists only in G, and it is a THIRD
 * distinct catalog product — not the cancelled-line product — because `rolesBySku` maps a sku back to
 * exactly one role, and because a fixture whose two eligible lines are the same product cannot tell a
 * PER-LINE rule from a PER-RETURN one.
 */
export const LINE_ROLE_Y = 'lineY';

/** Every role a returns fixture line can carry, in the order a body lists them. */
export const RETURN_LINE_ROLES = Object.freeze([LINE_ROLE_X, LINE_ROLE_Y, LINE_ROLE_CANCELLED]);

/** The ORDERED quantity a spec row declares for one role, or undefined when it has no such line (PURE). */
export function orderedFor(spec, role) {
  if (role === LINE_ROLE_X) return spec.lineX?.ordered;
  if (role === LINE_ROLE_Y) return spec.lineY?.ordered;
  if (role === LINE_ROLE_CANCELLED) return spec.cancelledLine?.ordered;
  return undefined;
}

/**
 * The spec table. `expect` is what `returnableItems(orderId)` must report for the lineX line — it is
 * the ACCEPTANCE ORACLE, not something the seeder enforces. If the live query disagrees with it that
 * is a finding about the feature, and the fixtures are NOT to be adjusted to make it agree.
 *
 *   orderStatus     — the order's platform status after seeding
 *   lineX           — { ordered } quantity of the line under test
 *   cancelledLine   — { ordered } quantity of F's cancelled line (absent elsewhere)
 *   shipments[]     — { key, offsetDays, delivered, hasDeliveryDate, status }; `offsetDays` is
 *                     relative to seed-time now (0 = today, -40 = forty days ago) and is null when
 *                     the shipment has NO delivery date at all (fixture C)
 *   expect          — { isReturnable, returnableQuantity, deliveredTotal, orderedQuantity,
 *                     ineligibilityReason } for lineX; `expectCancelled` for F's dead line
 */
export const RETURN_ORDER_FIXTURES = [
  {
    key: 'A',
    alias: 'RETURNS_ORDER_A_HAPPY',
    fixtureFile: 'orders/returns/return-order-a.json',
    purpose: 'Happy path — delivered today, ordered == delivered. The return entry point must appear.',
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: 5 },
    shipments: [{ key: 'S1', offsetDays: 0, delivered: 5, hasDeliveryDate: true, status: 'Delivered' }],
    expect: { isReturnable: true, returnableQuantity: 5, deliveredTotal: 5, orderedQuantity: 5, ineligibilityReason: null },
  },
  {
    key: 'A2',
    alias: 'RETURNS_ORDER_A2_PARTIAL_DELIVERY',
    fixtureFile: 'orders/returns/return-order-a2.json',
    purpose: 'Returnable quantity is capped by what was DELIVERED (4), not by what was ORDERED (10).',
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: 10 },
    shipments: [{ key: 'S1', offsetDays: 0, delivered: 4, hasDeliveryDate: true, status: 'Delivered' }],
    expect: { isReturnable: true, returnableQuantity: 4, deliveredTotal: 4, orderedQuantity: 10, ineligibilityReason: null },
  },
  {
    key: 'B',
    alias: 'RETURNS_ORDER_B_OUTSIDE_WINDOW',
    fixtureFile: 'orders/returns/return-order-b.json',
    purpose: 'A, with the delivery moved 40 days back — past the 30-day window. Nothing else differs.',
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: 5 },
    shipments: [{ key: 'S1', offsetDays: -40, delivered: 5, hasDeliveryDate: true, status: 'Delivered' }],
    expect: { isReturnable: false, returnableQuantity: 0, deliveredTotal: 5, orderedQuantity: 5, ineligibilityReason: 'OUTSIDE_RETURN_WINDOW' },
    observed: {
      at: '2026-09-22', env: 'vcptcore_qa1', module: '3.1002.0-pr-26-323d',
      returnableQuantity: 5,
      note: 'isReturnable=false and ineligibilityReason=OUTSIDE_RETURN_WINDOW are both correct, and '
        + 'returnableUntil (2026-09-12) is correctly in the past — but returnableQuantity stays at the '
        + 'DELIVERED quantity instead of dropping to 0. See RETURN_OBSERVED_DIVERGENCE below.',
    },
  },
  {
    key: 'C',
    alias: 'RETURNS_ORDER_C_NOT_DELIVERED',
    fixtureFile: 'orders/returns/return-order-c.json',
    purpose: 'A, with the delivery date REMOVED (shipment still holds the goods). Nothing else differs.',
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: 5 },
    shipments: [{ key: 'S1', offsetDays: null, delivered: 5, hasDeliveryDate: false, status: 'Sent' }],
    expect: { isReturnable: false, returnableQuantity: 0, deliveredTotal: 0, orderedQuantity: 5, ineligibilityReason: 'NOT_DELIVERED' },
  },
  {
    key: 'D',
    alias: 'RETURNS_ORDER_D_STATUS_NOT_ALLOWED',
    fixtureFile: 'orders/returns/return-order-d.json',
    purpose: 'A, with the ORDER STATUS made disallowed. Delivered today, full quantity — the order '
      + 'status is deliberately the ONLY reason it is ineligible, so the assertion cannot pass for '
      + 'the wrong reason.',
    orderStatus: RETURN_DISALLOWED_STATUS,
    lineX: { ordered: 5 },
    shipments: [{ key: 'S1', offsetDays: 0, delivered: 5, hasDeliveryDate: true, status: 'Delivered' }],
    expect: { isReturnable: false, returnableQuantity: 0, deliveredTotal: 5, orderedQuantity: 5, ineligibilityReason: 'ORDER_STATUS_NOT_ALLOWED' },
    observed: {
      at: '2026-09-22', env: 'vcptcore_qa1', module: '3.1002.0-pr-26-323d',
      returnableQuantity: 5,
      note: 'isReturnable=false and ineligibilityReason=ORDER_STATUS_NOT_ALLOWED are both correct, but '
        + 'returnableQuantity stays at the DELIVERED quantity instead of dropping to 0. See '
        + 'RETURN_OBSERVED_DIVERGENCE below.',
    },
  },
  {
    key: 'E',
    alias: 'RETURNS_ORDER_E_SPLIT_DELIVERY',
    fixtureFile: 'orders/returns/return-order-e.json',
    purpose: 'TWO deliveries of the SAME line, straddling the window boundary (-40d and today) with '
      + 'DIFFERENT quantities (5 and 3). The window must run from the LATEST delivery, and the '
      + 'delivered total must be the SUM, 8.',
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: 8 },
    shipments: [
      { key: 'S1', offsetDays: -40, delivered: 5, hasDeliveryDate: true, status: 'Delivered' },
      { key: 'S2', offsetDays: 0, delivered: 3, hasDeliveryDate: true, status: 'Delivered' },
    ],
    expect: { isReturnable: true, returnableQuantity: 8, deliveredTotal: 8, orderedQuantity: 8, ineligibilityReason: null },
  },
  {
    key: 'F',
    alias: 'RETURNS_ORDER_F_CANCELLED_LINE',
    fixtureFile: 'orders/returns/return-order-f.json',
    purpose: 'A live line delivered today PLUS a cancelled line, in one order. The cancelled line must '
      + 'be excluded while the live line stays returnable.',
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: 5 },
    cancelledLine: { ordered: 2 },
    shipments: [{ key: 'S1', offsetDays: 0, delivered: 5, hasDeliveryDate: true, status: 'Delivered' }],
    expect: { isReturnable: true, returnableQuantity: 5, deliveredTotal: 5, orderedQuantity: 5, ineligibilityReason: null },
    expectCancelled: { isReturnable: false, returnableQuantity: 0, ineligibilityReason: 'LINE_CANCELLED' },
  },
  {
    key: 'G',
    alias: 'RETURNS_ORDER_G_TWO_ELIGIBLE_LINES',
    fixtureFile: 'orders/returns/return-order-g.json',
    purpose: 'TWO lines eligible AT THE SAME TIME — different products, different quantities (5 and 3), '
      + 'both delivered today in one shipment. The only fixture that reports 2 of 2 lines eligible: F is '
      + 'the other two-line order and its second line is CANCELLED, so it reports 1 of 2. Unlocks the two '
      + 'cases nothing else can reach — bulk-applying a reason across lines, and "an attachment is '
      + 'required PER LINE, not per return".',
    orderStatus: RETURN_ALLOWED_STATUS,
    lineX: { ordered: 5 },
    // The divergence IS the fixture. Equal quantities would make a bulk-applied reason indistinguishable
    // from a per-return one, and a per-line attachment hint ("1 line still needs a photo") impossible to
    // tell from a per-return hint — the two things these cases exist to prove
    // (.claude/rules/test-data.md §SECOND RULE).
    lineY: { ordered: 3 },
    shipments: [{
      key: 'S1', offsetDays: 0, hasDeliveryDate: true, status: 'Delivered',
      deliveredByRole: { [LINE_ROLE_X]: 5, [LINE_ROLE_Y]: 3 },
    }],
    expect: { isReturnable: true, returnableQuantity: 5, deliveredTotal: 5, orderedQuantity: 5, ineligibilityReason: null },
    expectLineY: { isReturnable: true, returnableQuantity: 3, deliveredTotal: 3, orderedQuantity: 3, ineligibilityReason: null },
  },
];

/** The @td() aliases the returns family owns: one per order, plus the shared line-X product alias. */
export const RETURN_LINE_X_ALIAS = 'RETURNS_LINE_X';
export const RETURN_OWNED_ALIASES = [...RETURN_ORDER_FIXTURES.map((f) => f.alias), RETURN_LINE_X_ALIAS];

/** Required top-level keys a returns fixture create body must carry (superset of ORDER_BODY_REQUIRED). */
export const RETURN_BODY_REQUIRED = [...ORDER_BODY_REQUIRED, 'shipments'];

/** ISO-8601-looking date literal — banned inside a committed returns fixture (see the header). */
export const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** Resolve one shipment spec's offset to a concrete ISO instant (PURE). null offset -> null date. */
export function deliveryDateFor(shipmentSpec, now = new Date()) {
  if (!shipmentSpec.hasDeliveryDate || shipmentSpec.offsetDays === null || shipmentSpec.offsetDays === undefined) return null;
  return new Date(now.getTime() + shipmentSpec.offsetDays * 86400000).toISOString();
}

/**
 * What one shipment delivered, PER LINE ROLE (PURE). Every fixture but G delivers only lineX and says
 * so with the scalar `delivered`; G delivers two DIFFERENT lines in the same shipment and says so with
 * `deliveredByRole`. One reader for both shapes, so no caller has to know which a row uses.
 */
export function shipmentDeliveries(shipmentSpec) {
  if (shipmentSpec.deliveredByRole) return { ...shipmentSpec.deliveredByRole };
  return { [LINE_ROLE_X]: shipmentSpec.delivered };
}

/** Sum of ONE role's delivered quantities across the shipments that actually HAVE a delivery date. */
export function deliveredTotalFor(spec, role = LINE_ROLE_X) {
  return (spec.shipments || [])
    .filter((s) => s.hasDeliveryDate)
    .reduce((n, s) => n + (shipmentDeliveries(s)[role] || 0), 0);
}

/** The most recent delivery offset for a fixture (the one the window runs from), or null. */
export function latestDeliveryOffset(spec) {
  const dated = (spec.shipments || []).filter((s) => s.hasDeliveryDate).map((s) => s.offsetDays);
  return dated.length ? Math.max(...dated) : null;
}

/**
 * The returns fixture-set drift guard (PURE — shared by validate-orders-data.mjs and the unit tests).
 * Every check here is about a property that would make a CASE VACUOUS if it silently collapsed, not
 * about the fixture merely being well-formed. `ageDays` (optional) is how long ago the set was
 * actually seeded on the target env: the in-window fixtures age OUT of the window as real time
 * passes, which is the drift a static-only guard cannot see.
 */
export function validateReturnFixtureSet(fixtures = RETURN_ORDER_FIXTURES, { windowDays = RETURN_WINDOW_DAYS_ASSUMED, ageDays = null } = {}) {
  const problems = [];
  const byKey = Object.fromEntries(fixtures.map((f) => [f.key, f]));
  const P = (m) => problems.push(m);

  for (const f of fixtures) {
    // No future deliveries, and a dated shipment must actually carry an offset.
    for (const s of f.shipments || []) {
      if (s.hasDeliveryDate && (s.offsetDays === null || s.offsetDays === undefined)) P(`${f.key}/${s.key}: hasDeliveryDate but no offsetDays`);
      if (s.hasDeliveryDate && s.offsetDays > 0) P(`${f.key}/${s.key}: offsetDays ${s.offsetDays} is in the FUTURE`);
      if (!s.hasDeliveryDate && s.offsetDays !== null) P(`${f.key}/${s.key}: no delivery date, so offsetDays must be null (got ${s.offsetDays})`);
      for (const [role, q] of Object.entries(shipmentDeliveries(s))) {
        if (!(q >= 0)) P(`${f.key}/${s.key}: delivered quantity for ${role} must be >= 0 (got ${q})`);
        if (orderedFor(f, role) === undefined) P(`${f.key}/${s.key}: delivers role "${role}" but the spec row has no such line`);
      }
    }
    if (f.expect?.ineligibilityReason && !RETURN_INELIGIBILITY_REASONS.includes(f.expect.ineligibilityReason)) {
      P(`${f.key}: ineligibilityReason "${f.expect.ineligibilityReason}" is not one of the module's codes`);
    }
    if (f.expectCancelled?.ineligibilityReason && !RETURN_INELIGIBILITY_REASONS.includes(f.expectCancelled.ineligibilityReason)) {
      P(`${f.key}: expectCancelled.ineligibilityReason "${f.expectCancelled.ineligibilityReason}" is not one of the module's codes`);
    }
    // The expectation table must agree with the fixture it describes.
    const dt = deliveredTotalFor(f);
    if (f.expect && f.expect.deliveredTotal !== dt) P(`${f.key}: expect.deliveredTotal ${f.expect.deliveredTotal} != the fixture's dated shipment sum ${dt}`);
    if (f.expect && f.expect.orderedQuantity !== f.lineX.ordered) P(`${f.key}: expect.orderedQuantity ${f.expect.orderedQuantity} != lineX.ordered ${f.lineX.ordered}`);
    // Never deliver more of lineX than was ordered — an over-delivered line is a different bug report,
    // not this fixture set's question, and it would make the "capped by delivered" reading ambiguous.
    if (dt > f.lineX.ordered) P(`${f.key}: delivered total ${dt} exceeds lineX.ordered ${f.lineX.ordered}`);

    // The SECOND eligible line gets exactly the same treatment — an expectation table that only
    // describes lineX would let G's whole reason for existing drift unchecked.
    if (f.lineY) {
      if (!f.expectLineY) P(`${f.key}: has a lineY but no expectLineY — the second line's answer is unstated`);
      else {
        const dtY = deliveredTotalFor(f, LINE_ROLE_Y);
        if (f.expectLineY.ineligibilityReason && !RETURN_INELIGIBILITY_REASONS.includes(f.expectLineY.ineligibilityReason)) {
          P(`${f.key}: expectLineY.ineligibilityReason "${f.expectLineY.ineligibilityReason}" is not one of the module's codes`);
        }
        if (f.expectLineY.deliveredTotal !== dtY) P(`${f.key}: expectLineY.deliveredTotal ${f.expectLineY.deliveredTotal} != the fixture's dated shipment sum for lineY ${dtY}`);
        if (f.expectLineY.orderedQuantity !== f.lineY.ordered) P(`${f.key}: expectLineY.orderedQuantity ${f.expectLineY.orderedQuantity} != lineY.ordered ${f.lineY.ordered}`);
        if (dtY > f.lineY.ordered) P(`${f.key}: lineY delivered total ${dtY} exceeds lineY.ordered ${f.lineY.ordered}`);
      }
    } else if (f.expectLineY) P(`${f.key}: carries expectLineY but has no lineY line`);
  }

  // ── The divergences. Each of these collapsing turns a real case into a vacuous pass. ──
  const a2 = byKey.A2;
  if (a2 && deliveredTotalFor(a2) === a2.lineX.ordered) {
    P('A2: ordered == delivered — the "capped by DELIVERED, not ORDERED" case is now vacuous (SECOND RULE)');
  }
  const e = byKey.E;
  if (e) {
    const dated = (e.shipments || []).filter((s) => s.hasDeliveryDate);
    if (dated.length < 2) P('E: needs >= 2 dated shipments of the same line');
    else {
      const offs = dated.map((s) => s.offsetDays);
      const inside = offs.filter((o) => o > -windowDays);
      const outside = offs.filter((o) => o < -windowDays);
      if (!inside.length || !outside.length) {
        P(`E: deliveries ${JSON.stringify(offs)} do NOT straddle the ${windowDays}-day boundary — "the window runs from the LATEST delivery" is untestable`);
      }
      const qtys = dated.map((s) => s.delivered);
      if (new Set(qtys).size < 2) P(`E: shipment quantities ${JSON.stringify(qtys)} are equal — cannot distinguish the SUM from a single shipment`);
    }
  }
  const fF = byKey.F;
  if (fF && !fF.cancelledLine) P('F: needs a cancelled line alongside the live one');
  if (fF && fF.cancelledLine && !fF.expectCancelled) P('F: cancelled line has no expectation');

  // G — the ONLY fixture with two lines eligible at once. Three ways it can silently stop answering:
  // one of the lines becomes ineligible (back to F's "1 of 2"), the two lines become interchangeable in
  // quantity, or they stop being delivered together.
  const g = byKey.G;
  if (g) {
    if (!g.lineY) P('G: needs a SECOND eligible line — without it G is just A, and the bulk-reason / per-line-attachment cases stay BLOCKED');
    else if (g.cancelledLine) P('G: must not carry a cancelled line — a cancelled line is F\'s question, and it would drop G back to "1 of 2 lines eligible"');
    else {
      if (!(g.expect?.isReturnable && g.expectLineY?.isReturnable)) {
        P('G: BOTH lines must be expected ELIGIBLE at the same time — that is the one thing no other fixture provides');
      }
      if (g.expect?.ineligibilityReason || g.expectLineY?.ineligibilityReason) {
        P('G: neither line may expect an ineligibility reason — G is the 2-of-2-eligible fixture');
      }
      if (g.lineX.ordered === g.lineY.ordered) {
        P(`G: both lines ordered ${g.lineX.ordered} — interchangeable lines cannot tell a PER-LINE rule from a PER-RETURN one (SECOND RULE)`);
      }
      const dX = deliveredTotalFor(g, LINE_ROLE_X);
      const dY = deliveredTotalFor(g, LINE_ROLE_Y);
      if (dX === dY) P(`G: both lines delivered ${dX} — a bulk-applied reason landing on each line independently, and a per-line attachment hint, both become undecidable`);
      if (!(dX > 0 && dY > 0)) P(`G: both lines must be DELIVERED (got lineX ${dX}, lineY ${dY}) — an undelivered line is ineligible, which is C's question`);
      for (const s of g.shipments || []) {
        const d = shipmentDeliveries(s);
        if (!(d[LINE_ROLE_X] > 0 && d[LINE_ROLE_Y] > 0)) {
          P(`G/${s.key}: must deliver BOTH lines in the same shipment (got ${JSON.stringify(d)}) — split shipments would put the two lines at different points in the window`);
        }
      }
    }
  }

  // ── The window relationship. This is what a date LITERAL would silently break. ──
  for (const f of fixtures) {
    const latest = latestDeliveryOffset(f);
    if (latest === null) continue;
    const expectedOutside = f.expect?.ineligibilityReason === 'OUTSIDE_RETURN_WINDOW';
    if (expectedOutside && latest > -windowDays) P(`${f.key}: latest delivery ${latest}d is INSIDE the ${windowDays}-day window but the fixture expects OUTSIDE_RETURN_WINDOW`);
    if (!expectedOutside && latest < -windowDays) P(`${f.key}: latest delivery ${latest}d is OUTSIDE the ${windowDays}-day window but the fixture does not expect OUTSIDE_RETURN_WINDOW`);
    // Real-time drift: an in-window fixture seeded `ageDays` ago has aged by that much.
    if (ageDays !== null && !expectedOutside && -(latest) + ageDays >= windowDays) {
      P(`${f.key}: STALE — seeded ${ageDays}d ago with latest delivery ${latest}d, so it is now ${-(latest) + ageDays}d old and has aged OUT of the ${windowDays}-day window. Re-seed (npm run seed:returns).`);
    }
  }

  return { ok: problems.length === 0, problems };
}

/** Deep-clone an object with every `_`-prefixed metadata key removed (PURE). */
export function stripFixtureMeta(node) {
  if (Array.isArray(node)) return node.map(stripFixtureMeta);
  if (node && typeof node === 'object') {
    const o = {};
    for (const [k, v] of Object.entries(node)) if (!k.startsWith('_')) o[k] = stripFixtureMeta(v);
    return o;
  }
  return node;
}

/**
 * Overlay live-discovered catalog products onto a returns fixture's line items BY ROLE (PURE).
 * `productsByRole = { lineX: {id,sku,name,catalogId}, cancelledLine: {...} }`. A role with no product
 * keeps its placeholder (dry-run / bare catalog). Quantity, price and currency stay from the fixture.
 */
export function applyReturnCatalogItems(fixtureObj, productsByRole = {}) {
  const body = structuredClone(fixtureObj);
  if (!Array.isArray(body.items)) return body;
  body.items = body.items.map((it) => {
    const p = productsByRole[it._role];
    if (!p) return it;
    return { ...it, productId: p.id ?? it.productId, sku: p.sku ?? it.sku, name: p.name ?? it.name, ...(p.catalogId ? { catalogId: p.catalogId } : {}) };
  });
  return body;
}

/**
 * Finalize the PHASE-1 create body for a returns fixture (PURE). Stamps the spec's order status and
 * per-line quantities, the runtime customer attribution, resolves each shipment's delivery date from
 * its offset against `now`, zeroes the shipment/payment monetary totals (the platform folds them back
 * into order.Total — the lesson seed-sales-rep.mjs paid for), and strips all `_` metadata.
 * Shipment ITEMS stay empty here: the platform assigns line item ids, so linking is phase 2.
 */
export function finalizeReturnOrderBody(spec, fixtureObj, ctx = {}, now = new Date()) {
  const body = structuredClone(fixtureObj);
  body.status = spec.orderStatus;
  if (ctx.customerId) body.customerId = ctx.customerId;
  if (ctx.customerName) body.customerName = ctx.customerName;
  if (ctx.organizationId) body.organizationId = ctx.organizationId;
  if (ctx.organizationName) body.organizationName = ctx.organizationName;

  for (const it of body.items || []) {
    const ordered = orderedFor(spec, it._role);
    if (ordered !== undefined) it.quantity = ordered;
  }
  const specShip = Object.fromEntries((spec.shipments || []).map((s) => [s.key, s]));
  for (const s of body.shipments || []) {
    const ss = specShip[s._shipmentKey];
    if (ss) {
      s.status = ss.status;
      const d = deliveryDateFor(ss, now);
      if (d) s.deliveryDate = d; else delete s.deliveryDate;
    }
    s.items = [];
    s.price = 0; s.priceWithTax = 0; s.total = 0; s.totalWithTax = 0;
  }
  for (const p of body.inPayments || []) {
    if (ctx.customerId) p.customerId = ctx.customerId;
    if (ctx.organizationId) p.organizationId = ctx.organizationId;
    p.price = 0; p.priceWithTax = 0; p.total = 0; p.totalWithTax = 0;
  }
  return stripFixtureMeta(body);
}

/**
 * Build the PHASE-2 mutation of an order the platform has already created (PURE). Takes the order as
 * the platform returned it plus the fixture's shipment metadata, and returns the body to PUT back:
 * every shipment gets its delivery date and its `items[]` linked to the REAL line item id, and the
 * cancelled line (if any) is marked cancelled.
 *
 * Two platform behaviours are baked in here because both fail SILENTLY:
 *   - a shipment item with only `lineItemId` is dropped; the inline `lineItem` object must be present;
 *   - the platform does NOT preserve the POSTed line order, so lines are matched by SKU, never index.
 *
 * `rolesBySku = { '<sku>': 'lineX' | 'cancelledLine' }`.
 */
export function buildReturnPhase2Body(spec, fullOrder, rolesBySku, now = new Date()) {
  const body = structuredClone(fullOrder);
  const lineByRole = {};
  for (const li of body.items || []) {
    const role = rolesBySku[li.sku];
    if (role) lineByRole[role] = li;
  }
  const specShip = Object.fromEntries((spec.shipments || []).map((s) => [s.key, s]));
  for (const s of body.shipments || []) {
    const key = String(s.number || '').split('-').pop();
    const ss = specShip[key];
    if (!ss) continue;
    s.status = ss.status;
    const d = deliveryDateFor(ss, now);
    if (d) s.deliveryDate = d; else s.deliveryDate = null;
    // One shipment item per ROLE the shipment delivers. Single-line fixtures yield exactly the one
    // item they always did; G yields two, which is the whole point of it.
    s.items = Object.entries(shipmentDeliveries(ss))
      .map(([role, qty]) => {
        const line = lineByRole[role];
        return line ? { lineItemId: line.id, lineItem: line, quantity: qty, barCode: null, outerId: null, shipmentId: s.id } : null;
      })
      .filter(Boolean);
  }
  const dead = lineByRole[LINE_ROLE_CANCELLED];
  if (dead && spec.cancelledLine) {
    dead.isCancelled = true;
    dead.cancelledDate = now.toISOString();
    dead.cancelReason = 'AGENT-TEST VCST-5628 cancelled line fixture';
  }
  return body;
}

/**
 * Validate ONE committed returns fixture against its spec row (PURE — validator + unit tests share it).
 * Confirms the create-body contract, that the fixture has not drifted from the spec table, and that no
 * literal date or runtime GUID has crept in.
 */
export function validateReturnFixtureShape(spec, obj) {
  const problems = [];
  for (const k of RETURN_BODY_REQUIRED) {
    if (obj[k] === undefined || obj[k] === null || obj[k] === '') problems.push(`missing required key "${k}"`);
  }
  const expectedNumber = returnOrderNumber(spec.key);
  if (obj.number !== expectedNumber) problems.push(`number "${obj.number}" != spec "${expectedNumber}"`);
  if (obj.status !== spec.orderStatus) problems.push(`status "${obj.status}" != spec "${spec.orderStatus}"`);

  const items = Array.isArray(obj.items) ? obj.items : [];
  const single = {};
  for (const role of RETURN_LINE_ROLES) {
    const found = items.filter((i) => i._role === role);
    const ordered = orderedFor(spec, role);
    if (ordered === undefined) {
      if (found.length) problems.push(`spec has no ${role} but the fixture carries ${found.length}`);
      continue;
    }
    if (found.length !== 1) { problems.push(`expected exactly 1 "${role}" line, found ${found.length}`); continue; }
    if (found[0].quantity !== ordered) problems.push(`${role} quantity ${found[0].quantity} != spec ${ordered}`);
    single[role] = found[0];
  }
  // Two lines under test that share a product answer nothing: for F "the cancelled line is excluded"
  // collapses into "the order is ineligible", and for G a PER-LINE rule collapses into a PER-RETURN one.
  const present = Object.entries(single);
  for (let i = 0; i < present.length; i++) {
    for (let j = i + 1; j < present.length; j++) {
      if (present[i][1].sku === present[j][1].sku) {
        problems.push(`${present[i][0]} and ${present[j][0]} use the SAME sku ("${present[i][1].sku}") — the distinction under test becomes undecidable`);
      }
    }
  }

  const ships = Array.isArray(obj.shipments) ? obj.shipments : [];
  if (ships.length !== (spec.shipments || []).length) problems.push(`${ships.length} shipment(s) in the fixture, ${(spec.shipments || []).length} in the spec`);
  for (const ss of spec.shipments || []) {
    const s = ships.find((z) => z._shipmentKey === ss.key);
    if (!s) { problems.push(`shipment "${ss.key}" missing from the fixture`); continue; }
    if (s._deliveryOffsetDays !== ss.offsetDays) problems.push(`shipment ${ss.key}: _deliveryOffsetDays ${s._deliveryOffsetDays} != spec ${ss.offsetDays}`);
    // A single-line shipment states `_deliveredQuantity` (lineX); a shipment that delivers more than
    // one line must state `_deliveredByRole`, so "which line got how many" is never inferred.
    const specDeliveries = shipmentDeliveries(ss);
    const fixtureDeliveries = s._deliveredByRole
      || (s._deliveredQuantity !== undefined ? { [LINE_ROLE_X]: s._deliveredQuantity } : null);
    if (!fixtureDeliveries) problems.push(`shipment ${ss.key}: carries neither _deliveredQuantity nor _deliveredByRole`);
    else {
      const norm = (o) => JSON.stringify(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
      if (norm(fixtureDeliveries) !== norm(specDeliveries)) {
        problems.push(`shipment ${ss.key}: delivered ${norm(fixtureDeliveries)} != spec ${norm(specDeliveries)}`);
      }
    }
    if (s.status !== ss.status) problems.push(`shipment ${ss.key}: status "${s.status}" != spec "${ss.status}"`);
    if (s.deliveryDate !== undefined) problems.push(`shipment ${ss.key}: carries a literal deliveryDate — dates are derived from _deliveryOffsetDays at seed time (GOLDEN RULE)`);
  }

  for (const leak of findGuidLeaks(obj)) problems.push(`runtime GUID leaked at ${leak.path} (belongs in aliases.<env>.json)`);
  const dateLeaks = [];
  const walkDates = (node, p) => {
    if (typeof node === 'string') { if (ISO_DATE_RE.test(node) && !p.startsWith('_')) dateLeaks.push(p); return; }
    if (Array.isArray(node)) { node.forEach((v, i) => walkDates(v, `${p}[${i}]`)); return; }
    if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walkDates(v, p ? `${p}.${k}` : k);
  };
  walkDates(obj, '');
  for (const p of dateLeaks) problems.push(`literal date at ${p} — it is correct once and silently wrong forever after (GOLDEN RULE); use _deliveryOffsetDays`);

  return { ok: problems.length === 0, problems };
}

/**
 * Compare a LIVE platform order against its returns spec row (PURE). One function serves two callers
 * that must never disagree: the seeder's idempotency decision (rebuild when this reports problems)
 * and the post-seed reconcile (a POSTed fixture that did not TAKE is worse than none).
 *
 * The delivery-date checks are deliberately expressed as a relationship to the WINDOW, not as an
 * equality against an expected instant. An order seeded yesterday is still a perfectly good "delivered
 * today" fixture; an order seeded 31 days ago is NOT, because it has aged out of the window while
 * nothing about it changed. That is exactly the drift a literal date hides.
 *
 * `rolesBySku = { '<sku>': 'lineX' | 'cancelledLine' }` maps the seeded products back to their roles.
 */
export function diagnoseSeededOrder(spec, order, rolesBySku, { windowDays = RETURN_WINDOW_DAYS_ASSUMED, now = new Date(), ownerId = null } = {}) {
  const problems = [];
  const P = (m) => problems.push(m);
  if (!order) return { ok: false, problems: ['order not found'] };

  if (order.number !== returnOrderNumber(spec.key)) P(`number "${order.number}" != "${returnOrderNumber(spec.key)}"`);
  if (order.status !== spec.orderStatus) P(`order status "${order.status}" != spec "${spec.orderStatus}"`);
  if (ownerId && order.customerId !== ownerId) P(`customerId "${order.customerId}" != the buyer under test "${ownerId}"`);

  const lines = order.items || [];
  const lineByRole = {};
  for (const li of lines) { const r = rolesBySku[li.sku]; if (r) lineByRole[r] = li; }

  const x = lineByRole[LINE_ROLE_X];
  if (!x) P(`no line carrying the ${LINE_ROLE_X} product (sku roles ${JSON.stringify(rolesBySku)})`);
  else {
    if (x.quantity !== spec.lineX.ordered) P(`lineX ordered quantity ${x.quantity} != spec ${spec.lineX.ordered}`);
    if (x.isCancelled) P('lineX is cancelled — it must be the LIVE line');
  }
  const y = lineByRole[LINE_ROLE_Y];
  if (spec.lineY) {
    if (!y) P(`no line carrying the ${LINE_ROLE_Y} product — the SECOND eligible line is missing, so this order reports 1 of 2 lines eligible like F`);
    else {
      if (y.quantity !== spec.lineY.ordered) P(`lineY ordered quantity ${y.quantity} != spec ${spec.lineY.ordered}`);
      if (y.isCancelled) P('lineY is cancelled — BOTH lines must be eligible at the same time');
      if (x && y.sku === x.sku) P(`lineX and lineY are the SAME product ("${y.sku}") — a PER-LINE rule is indistinguishable from a PER-RETURN one`);
      if (x && y.quantity === x.quantity) P(`lineX and lineY both ordered ${y.quantity} — interchangeable lines make a bulk-applied reason undecidable per line`);
    }
  } else if (y) P('an unexpected lineY product is present');

  const dead = lineByRole[LINE_ROLE_CANCELLED];
  if (spec.cancelledLine) {
    if (!dead) P(`no line carrying the ${LINE_ROLE_CANCELLED} product`);
    else {
      if (dead.quantity !== spec.cancelledLine.ordered) P(`cancelledLine ordered quantity ${dead.quantity} != spec ${spec.cancelledLine.ordered}`);
      if (!dead.isCancelled) P('the cancelled line is NOT flagged isCancelled — "a cancelled line is not returnable" is undecidable');
    }
  } else if (dead) P('an unexpected cancelledLine product is present');

  const ships = order.shipments || [];
  if (ships.length !== (spec.shipments || []).length) P(`${ships.length} shipment(s) live, ${(spec.shipments || []).length} in the spec`);

  const ages = [];
  for (const ss of spec.shipments || []) {
    const s = ships.find((z) => String(z.number || '').endsWith(`-${ss.key}`));
    if (!s) { P(`shipment ${ss.key} missing`); continue; }
    if (s.status !== ss.status) P(`shipment ${ss.key}: status "${s.status}" != spec "${ss.status}"`);
    const hasDate = !!s.deliveryDate;
    if (hasDate !== ss.hasDeliveryDate) {
      P(`shipment ${ss.key}: deliveryDate ${hasDate ? `present ("${s.deliveryDate}")` : 'ABSENT'} but the spec says it must be ${ss.hasDeliveryDate ? 'present' : 'absent'}`);
    }
    const items = s.items || [];
    // Per ROLE, not in aggregate: a shipment that delivered 8 units could be 5+3 of two lines or 8 of
    // one, and for G those are different fixtures.
    const shippedIds = new Set();
    for (const [role, qty] of Object.entries(shipmentDeliveries(ss))) {
      const line = lineByRole[role];
      if (!line) { P(`shipment ${ss.key}: no live line for role ${role} to have delivered ${qty} of`); continue; }
      shippedIds.add(line.id);
      const got = items.filter((i) => i.lineItemId === line.id).reduce((n, i) => n + (i.quantity || 0), 0);
      if (got !== qty) P(`shipment ${ss.key}: delivered quantity for ${role} is ${got} != spec ${qty}${items.length === 0 ? ' (shipment items[] is EMPTY — the phase-2 PUT did not take)' : ''}`);
    }
    if (items.length && !items.every((i) => shippedIds.has(i.lineItemId))) P(`shipment ${ss.key}: a shipment item does not point at a line this shipment is specified to deliver`);
    if (hasDate && ss.hasDeliveryDate) ages.push({ key: ss.key, ageDays: (now.getTime() - new Date(s.deliveryDate).getTime()) / 86400000, offsetDays: ss.offsetDays });
  }

  // The window relationship — the whole reason this fixture set exists.
  if (ages.length) {
    const newest = ages.reduce((a, b) => (a.ageDays <= b.ageDays ? a : b));
    const expectedOutside = spec.expect?.ineligibilityReason === 'OUTSIDE_RETURN_WINDOW';
    if (expectedOutside && newest.ageDays < windowDays) {
      P(`STALE/WRONG: latest delivery (${newest.key}) is ${newest.ageDays.toFixed(1)}d old, INSIDE the ${windowDays}-day window, but this fixture must sit OUTSIDE it`);
    }
    if (!expectedOutside && newest.ageDays >= windowDays) {
      P(`STALE: latest delivery (${newest.key}) is ${newest.ageDays.toFixed(1)}d old and has aged OUT of the ${windowDays}-day window — re-seed (npm run seed:returns)`);
    }
    // A straddling fixture must still straddle in real time, not just in the spec table.
    if ((spec.shipments || []).filter((s) => s.hasDeliveryDate).length > 1) {
      const oldest = ages.reduce((a, b) => (a.ageDays >= b.ageDays ? a : b));
      if (!(oldest.ageDays > windowDays && newest.ageDays < windowDays)) {
        P(`the two deliveries no longer STRADDLE the ${windowDays}-day boundary (oldest ${oldest.ageDays.toFixed(1)}d, newest ${newest.ageDays.toFixed(1)}d) — "the window runs from the LATEST delivery" is untestable`);
      }
    }
  }

  return { ok: problems.length === 0, problems };
}

/**
 * THE FIXTURE SET'S FIRST FINDING — recorded, deliberately NOT designed around.
 *
 * Measured on vcptcore-qa1 2026-09-22 against Return module 3.1002.0-pr-26-323d, across all seven
 * fixtures (8 returnable-item rows): `returnableQuantity` is ALWAYS equal to `deliveredQuantity`,
 * in every row, including the rows the module itself reports as NOT returnable.
 *
 *   fixture  delivered  returnable  isReturnable  ineligibilityReason
 *   A            5          5          true        null
 *   A2           4          4          true        null           <- correctly capped by DELIVERED, not ORDERED (10)
 *   B            5          5          FALSE       OUTSIDE_RETURN_WINDOW
 *   C            0          0          false       NOT_DELIVERED
 *   D            5          5          FALSE       ORDER_STATUS_NOT_ALLOWED
 *   E            8          8          true        null           <- SUM of both deliveries; window ran from the LATEST
 *   F lineX      5          5          true        null
 *   F cancelled  0          0          false       LINE_CANCELLED
 *
 * So `returnableQuantity` is not gated by eligibility at all — it is "what was delivered". C and the
 * cancelled line in F only LOOK gated because their delivered quantity is independently 0; B and D are
 * the only fixtures where an ineligible line has a non-zero delivered quantity, and both report a
 * non-zero returnable quantity. A consumer that sizes a quantity picker from `returnableQuantity`
 * would offer 5 returnable units on an order that is 40 days past its return window.
 *
 * WHY THE EXPECTATION STAYS 0: `.claude/rules/test-data.md` §SECOND RULE — a fixture is designed from
 * the chain's question, and the answer is not edited to match the observation. Whether `isReturnable`
 * alone is the contract and `returnableQuantity` is deliberately ungated is a product-owner call, not
 * a test-data one. Until it is answered, `npm run returns:check` reports B and D as a KNOWN
 * divergence (it exits non-zero: an open finding stays loud) and any OTHER mismatch as a NEW one.
 * If the call comes back "ungated is by design", change `expect.returnableQuantity` for B and D to
 * match `observed` and delete these blocks — do not delete the fixtures, which are what proved it.
 */
export const RETURN_OBSERVED_DIVERGENCE = Object.freeze({
  summary: 'returnableQuantity == deliveredQuantity even when isReturnable=false (fixtures B and D)',
  observedAt: '2026-09-22',
  observedOn: 'vcptcore_qa1',
  module: '3.1002.0-pr-26-323d',
  affects: ['B', 'D'],
  correctOnTheseFixtures: ['isReturnable', 'ineligibilityReason', 'returnableUntil', 'deliveryDate', 'orderedQuantity', 'deliveredQuantity'],
});

/** True when a live value differs from `expect` in exactly the way `observed` already records. */
export function isKnownDivergence(spec, field, actual) {
  return spec.observed !== undefined && spec.observed[field] !== undefined && spec.observed[field] === actual;
}
