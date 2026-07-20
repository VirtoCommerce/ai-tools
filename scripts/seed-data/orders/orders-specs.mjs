/**
 * scripts/seed-data/orders-specs.mjs — SINGLE SOURCE OF TRUTH for the order & quote state fixtures
 * (VCST-5482). Side-effect-free (no env, no network, no fs writes on import) so it can be imported by
 * the seeders (seed-order-states.mjs / seed-quotes.mjs), the drift-guard validator
 * (validate-orders-data.mjs), AND the unit tests (scripts/unit/*.test.mjs) alike.
 *
 * WHY THIS EXISTS — these are the highest-value, NON-feature-gated states from
 * test-data/README.md §Order State / Quote Fixtures. They were DEFERRED (blocking ~54 suite-014/015
 * cases) because the admin status strings needed confirming and there was no seeder. The exact
 * platform status strings still want a live check on first run (G6 in .claude/rules/quality-gates.md);
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
