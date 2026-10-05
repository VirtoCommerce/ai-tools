/**
 * scripts/seed-data/edge-cases/edge-cases-specs.mjs
 *
 * SINGLE SOURCE OF TRUTH for four "genuinely-missing" edge-case regression fixtures that block
 * suites 006 / 011 / 014. Side-effect-free (NO env load, NO network, NO fs, NO top-level work per
 * knowledge/execution/test-data-authoring.md §3) so the seeder and the drift-guard validator
 * (td:validate:edge-cases) import the SAME definitions.
 *
 * The four fixtures (all ADDITIVE + ISOLATED — none mutates a shared entity):
 *
 *   F1 MULTI_ORG_BOUNDARY  — two NEW dedicated personas that are members of a DIFFERENT count of the
 *                            existing AGENT-TEST filler orgs (ORG-009..019): ORG_EXACTLY_11 (11 orgs,
 *                            also serves MULTI_ORG_11 / the 6+ & 11+ cases) and ORG_EXACTLY_10 (10).
 *                            Blocks 006 B2C-ORG-007/012/013/014. Reuses the filler orgs by their
 *                            organizations.csv KEY (platform_id resolved by id, never by name search,
 *                            NEVER created here — they belong to seed:b2b) — adds only NEW
 *                            OrganizationMembership + contact rows, never touches the org entities or
 *                            USR-020 (the impersonation target).
 *
 *   F2 ORG_ADDR22          — a NEW isolated org AGENT-TEST-Org-Addr22 carrying 22 addresses + its own
 *                            Org-Admin persona. Deliberately NOT TechFlow (a shared org many suites
 *                            depend on). Blocks 011 CHK-059/060. 22 addresses = 4 pages at the
 *                            storefront's 6/page with a partial last page.
 *
 *   F3 DISCONTINUED_ORDER  — a Completed order owned by a NEW AGENT-TEST buyer, containing one still-
 *                            available shared catalog product + one DEDICATED throwaway product that
 *                            the seeder then discontinues (isActive=false, isBuyable=false). Only the
 *                            dedicated product is mutated, so no shared catalog item breaks. Blocks
 *                            014 CHK-041 / ORD-002 / ORD-034 (partial ORD-036).
 *
 *   F4 PERSONAL_NON_ORG    — a NEW AGENT-TEST personal (no-org) customer replacing the real external
 *                            mailbox that {{PERSONAL_USER_VIRTO}} pointed at.
 *                            Blocks 006 B2C-ORG-031.
 *
 * Runtime platform GUIDs NEVER live here — they are written to test-data/aliases.<env>.json by the
 * seeder (per .claude/rules/test-data.md). Only business keys (emails, names, deterministic numbers,
 * SKUs, counts) live in this module, and passwords are the {{VAR}} token, never a literal.
 */

/** AGENT-TEST- family prefix so /qa-seed-data teardown sweeps exactly what this domain creates. */
export const EC_PREFIX = 'AGENT-TEST';
const STAMP = '20260811';

/** The shared non-prod default password token (resolved from .env.local at seed time). */
export const PW_TOKEN = '{{DEFAULT_TEST_PASSWORD}}';
export const STORE_ID_DEFAULT = 'B2B-store';

/* ── F1 — multi-org boundary personas ─────────────────────────────────────────
 * The existing AGENT-TEST filler orgs, referenced by their test-data/b2b/organizations.csv KEY — the
 * same 11 orgs USR-020 uses. Their names and platform ids live in that CSV (seed:b2b owns the orgs);
 * transcribing the names here once made a name-search miss create 11 duplicate shared orgs. Order
 * matters: a persona with orgCount N joins the FIRST N.
 */
export const FILLER_ORG_KEYS = [
  'ORG-009', 'ORG-010', 'ORG-011', 'ORG-012', 'ORG-013', 'ORG-014',
  'ORG-015', 'ORG-016', 'ORG-017', 'ORG-018', 'ORG-019',
];

/**
 * Resolve the filler orgs from organizations.csv rows (PURE). Returns `{ orgs: [{ key, id, name }],
 * errs }` in FILLER_ORG_KEYS order; a missing row, an empty platform_id or a non-AGENT-TEST name is
 * an error (the seeder fails loudly on it — it never creates or renames a shared org).
 */
export function resolveFillerOrgs(orgRows = []) {
  const byKey = new Map((orgRows || []).map((r) => [String(r.org_id || '').trim(), r]));
  const orgs = [], errs = [];
  for (const key of FILLER_ORG_KEYS) {
    const r = byKey.get(key);
    if (!r) { errs.push(`${key}: no row in test-data/b2b/organizations.csv`); continue; }
    const id = String(r.platform_id || '').trim();
    const name = String(r.org_name || '').trim();
    if (!id) errs.push(`${key} (${name}): empty platform_id — run seed:b2b first`);
    if (!/^AGENT-TEST-Org-/.test(name)) errs.push(`${key}: org_name "${name}" is not an AGENT-TEST-Org-* fixture`);
    if (id) orgs.push({ key, id, name });
  }
  return { orgs, errs };
}

/** The read-only baseline org role for a boundary persona (org-switcher only needs membership). */
export const BOUNDARY_ROLE = { roleId: 'org-employee', roleName: 'Organization employee' };

export const MULTI_ORG_PERSONAS = [
  {
    alias: 'ORG_EXACTLY_11',
    extraAliases: ['MULTI_ORG_11'], // ≥11 → also serves B2C-ORG-007/012 (6+/11+)
    email: `agent-test-org-exactly-11-${STAMP}@test-agent.com`,
    firstName: 'Elena', lastName: 'Eleven-Orgs',
    orgCount: 11,
    notes: 'Member of exactly 11 AGENT-TEST filler orgs (organizations.csv ORG-009..019, org-employee in each). Serves the >10 org-switcher search-bar cases (B2C-ORG-007/012) and the 11 side of the exactly-10-vs-11 boundary (B2C-ORG-014). Alias MULTI_ORG_11 is the same account.',
  },
  {
    alias: 'ORG_EXACTLY_10',
    extraAliases: [],
    email: `agent-test-org-exactly-10-${STAMP}@test-agent.com`,
    firstName: 'Tina', lastName: 'Tenner-Orgs',
    orgCount: 10,
    notes: 'Member of exactly 10 AGENT-TEST filler orgs (organizations.csv ORG-009..018, org-employee in each). Serves the <=10 org-switcher NO-search-bar case (B2C-ORG-013) and the 10 side of the boundary (B2C-ORG-014).',
  },
];

/* ── F2 — isolated 22-address org ─────────────────────────────────────────────
 * Storefront address-book page size (SOURCE: vc-frontend useCheckout.ts:32 ADDRESSES_PER_PAGE=6).
 * Mirrors addresses-specs.mjs so the two fixtures agree; re-derive from that file if it changes.
 */
export const ADDRESSES_PER_PAGE = 6;
export const ADDR22_TARGET_TOTAL = 22;
export const ADDR22_ORG_NAME = `AGENT-TEST-Org-Addr22-${STAMP}`;
/** The org's own contact email — agent-test- prefixed like every other owned email. */
export const ADDR22_ORG_EMAIL = `agent-test-addr22-org-${STAMP}@test-agent.com`;
export const ADDR22_ADMIN = {
  alias: 'ORG_ADDR22_ADMIN',
  email: `agent-test-addr22-admin-${STAMP}@test-agent.com`,
  firstName: 'Adam', lastName: 'Addr22',
  role: { roleId: 'org-maintainer', roleName: 'Organization maintainer' },
};

/** Pages the storefront renders for `n` addresses; and the partial-last-page rationale check. */
export const pageCount = (n) => Math.ceil(Number(n) / ADDRESSES_PER_PAGE);
export const lastPageSize = (n) => (Number(n) % ADDRESSES_PER_PAGE) || ADDRESSES_PER_PAGE;

/**
 * Generate exactly ADDR22_TARGET_TOTAL org addresses (PURE, deterministic). Every address is
 * BillingAndShipping so all are shipping-selectable in checkout — 22 rows ⇒ 4 pages (6/6/6/4) with a
 * partial last page. Distribution spans 3 countries + many US/CA regions + many cities so the modal's
 * Country/State/City facets are all exercisable. countryCode is ISO-3 (the platform's stored form).
 */
export function buildAddr22Addresses() {
  const rows = [
    // country, region code, region name, city, postal, line1
    ['USA', 'NY', 'New York', 'New York', '10001', '100 Commerce Plaza'],
    ['USA', 'NY', 'New York', 'Buffalo', '14201', '210 Lakefront Ave'],
    ['USA', 'CA', 'California', 'Los Angeles', '90001', '320 Sunset Blvd'],
    ['USA', 'CA', 'California', 'San Diego', '92101', '415 Harbor Dr'],
    ['USA', 'CA', 'California', 'San Jose', '95101', '512 Tech Park Way'],
    ['USA', 'TX', 'Texas', 'Houston', '77001', '600 Energy Corridor'],
    ['USA', 'TX', 'Texas', 'Austin', '73301', '702 Congress Ave'],
    ['USA', 'IL', 'Illinois', 'Chicago', '60601', '810 Michigan Ave'],
    ['USA', 'FL', 'Florida', 'Miami', '33101', '905 Biscayne Blvd'],
    ['USA', 'WA', 'Washington', 'Seattle', '98101', '1010 Pike St'],
    ['USA', 'MA', 'Massachusetts', 'Boston', '02108', '1105 Beacon St'],
    ['USA', 'GA', 'Georgia', 'Atlanta', '30303', '1200 Peachtree St'],
    ['USA', 'CO', 'Colorado', 'Denver', '80202', '1301 Larimer St'],
    ['USA', 'AZ', 'Arizona', 'Phoenix', '85001', '1404 Central Ave'],
    ['CAN', 'ON', 'Ontario', 'Toronto', 'M5H 2N2', '150 King St W'],
    ['CAN', 'ON', 'Ontario', 'Ottawa', 'K1P 1J1', '250 Wellington St'],
    ['CAN', 'BC', 'British Columbia', 'Vancouver', 'V6B 1A1', '350 Granville St'],
    ['CAN', 'QC', 'Quebec', 'Montreal', 'H3B 2Y3', '450 Rue Sainte-Catherine'],
    ['GBR', 'ENG', 'England', 'London', 'EC1A 1BB', '10 Cheapside'],
    ['GBR', 'ENG', 'England', 'Manchester', 'M1 1AD', '20 Deansgate'],
    ['GBR', 'SCT', 'Scotland', 'Edinburgh', 'EH1 1RE', '30 Princes St'],
    ['GBR', 'ENG', 'England', 'Birmingham', 'B1 1AA', '40 New St'],
  ];
  return rows.map(([cc, rid, rname, city, postal, line1], i) => ({
    addressType: 'BillingAndShipping',
    firstName: ADDR22_ADMIN.firstName, lastName: ADDR22_ADMIN.lastName,
    organization: ADDR22_ORG_NAME,
    line1, city,
    regionId: rid, regionName: rname,
    postalCode: postal,
    countryCode: cc,
    countryName: cc === 'USA' ? 'United States' : cc === 'CAN' ? 'Canada' : 'United Kingdom',
    phone: '+1-206-555-0100',
    email: ADDR22_ADMIN.email,
    // Teardown marker on an internal id (org is fully disposable anyway, but keep the convention).
    outerId: `${EC_PREFIX}-ADDR22:${String(i + 1).padStart(2, '0')}`,
  }));
}

/** Coherence of the 22-address contract: >=4 pages and a partial last page. Returns [] when sound. */
export function assertAddr22Coherent() {
  const errs = [];
  const n = ADDR22_TARGET_TOTAL;
  const built = buildAddr22Addresses();
  if (built.length !== n) errs.push(`buildAddr22Addresses() produced ${built.length}, expected ${n}`);
  if (pageCount(n) < 4) errs.push(`${n} addresses yield ${pageCount(n)} page(s) at ${ADDRESSES_PER_PAGE}/page — need >= 4`);
  if (n % ADDRESSES_PER_PAGE === 0) errs.push(`${n} is an exact multiple of ${ADDRESSES_PER_PAGE} — a partial last page is required`);
  return errs;
}

/* ── F3 — discontinued-item order ─────────────────────────────────────────────
 * A Completed order (reorder is gated on status=Completed) with two line items: an available shared
 * catalog product (stamped live) and a DEDICATED product this seeder discontinues after the order is
 * placed, so reorder sees exactly one unavailable/discontinued line.
 */
export const DISC_ORDER_NUMBER = `${EC_PREFIX}-ORD-DISCONTINUED`;
export const DISC_PRODUCT = {
  code: `${EC_PREFIX}-DISC-SKU-${STAMP}`,
  name: `${EC_PREFIX} Discontinued Widget`,
};
export const DISC_BUYER = {
  alias: 'DISCONTINUED_ORDER_BUYER',
  email: `agent-test-discontinued-buyer-${STAMP}@test-agent.com`,
  firstName: 'Dan', lastName: 'Discontinued',
};
export const DISCONTINUED_ORDER_ALIAS = 'DISCONTINUED_ITEM_ORDER';

/**
 * Build the Completed-order create body (PURE). `ctx` carries the runtime owner + the two resolved
 * products. `availableProduct` / `discontinuedProduct` = { id, sku, name }. No runtime GUIDs are
 * hardcoded — every id comes from ctx. storeId/currency are stamped from ctx (env-resilient).
 */
export function buildDiscontinuedOrderBody(ctx = {}) {
  const { storeId = STORE_ID_DEFAULT, currency = 'USD', owner = {}, availableProduct = null, discontinuedProduct = null, catalogId = null } = ctx;
  // OrderLineItem.CatalogId is NOT NULL — every line must carry one; fall back to the shared ctx.catalogId.
  const catFallback = catalogId || availableProduct?.catalogId || discontinuedProduct?.catalogId || 'agent-test';
  const line = (p, fallbackSku, fallbackName, price) => ({
    sku: p?.sku ?? fallbackSku,
    productId: p?.id ?? fallbackSku,
    catalogId: p?.catalogId ?? catFallback,
    name: p?.name ?? fallbackName,
    quantity: 1, price, productType: 'Physical', currency,
  });
  const items = [
    line(availableProduct, `${EC_PREFIX}-DISC-AVAIL`, 'AGENT-TEST Available Item', 100),
    line(discontinuedProduct, DISC_PRODUCT.code, DISC_PRODUCT.name, 49.99),
  ];
  const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
  const addr = (addressType) => ({
    addressType, firstName: DISC_BUYER.firstName, lastName: DISC_BUYER.lastName,
    line1: '1 Reorder Way', city: 'New York', regionName: 'New York', regionId: 'NY',
    countryCode: 'USA', countryName: 'United States', postalCode: '10001',
    phone: '+1-206-555-0100', email: owner.email || DISC_BUYER.email,
  });
  return {
    number: DISC_ORDER_NUMBER,
    storeId, currency, status: 'Completed',
    customerId: owner.id || undefined,
    customerName: owner.name || `${DISC_BUYER.firstName} ${DISC_BUYER.lastName}`,
    total, subTotal: total, shippingTotal: 0, shippingTotalWithTax: 0, taxTotal: 0,
    items,
    addresses: [addr('Shipping'), addr('Billing')],
    shipments: [{
      shipmentMethodCode: 'FixedRate', shipmentMethodOption: 'Ground', currency,
      status: 'Delivered', number: `${DISC_ORDER_NUMBER}-S1`, trackingNumber: `${EC_PREFIX}-TRK-DISC`,
      price: 0, priceWithTax: 0, total: 0, totalWithTax: 0, items: [],
    }],
    inPayments: [{
      gatewayCode: 'DefaultManualPaymentMethod', currency,
      // customerId is a NOT-NULL validation on the payment (POST /api/order/customerOrders → 400
      // "InPayments[0].CustomerId must not be empty" without it) — stamp the runtime owner.
      customerId: owner.id || undefined,
      customerName: owner.name || `${DISC_BUYER.firstName} ${DISC_BUYER.lastName}`,
      sum: total, status: 'Paid', paymentStatus: 'Paid', number: `${DISC_ORDER_NUMBER}-P1`,
      price: 0, priceWithTax: 0, total: 0, totalWithTax: 0,
    }],
  };
}

/* ── F4 — personal (non-org) replacement ─────────────────────────────────────── */
export const PERSONAL_NON_ORG = {
  alias: 'PERSONAL_NON_ORG_USER',
  email: `agent-test-personal-virto-${STAMP}@test-agent.com`,
  firstName: 'Mila', lastName: 'Personal-NonOrg',
  notes: 'AGENT-TEST personal (no-org) storefront customer replacing the real external mailbox {{PERSONAL_USER_VIRTO}} used to point at. Re-points {{PERSONAL_USER_VIRTO}} / {{PERSONAL_USER_VIRTO_PASSWORD}}. No org membership by design (B2C-ORG-031 asserts a non-org user sees default price).',
};

/* ── Guards shared by the seeder + the drift-guard validator ─────────────────── */
export const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
export function findGuidLeaks(text) {
  return String(text ?? '').match(new RegExp(GUID_RE, 'gi')) || [];
}

/** Every email this domain owns — used by the validator's uniqueness + AGENT-TEST-prefix checks. */
export function allOwnedEmails() {
  return [
    ...MULTI_ORG_PERSONAS.map((p) => p.email),
    ADDR22_ADMIN.email,
    ADDR22_ORG_EMAIL,
    DISC_BUYER.email,
    PERSONAL_NON_ORG.email,
  ];
}

/** Every base @td alias this domain registers (for the validator's registration check). */
export function allOwnedAliases() {
  return [
    ...MULTI_ORG_PERSONAS.flatMap((p) => [p.alias, ...p.extraAliases]),
    'ORG_ADDR22', ADDR22_ADMIN.alias,
    DISCONTINUED_ORDER_ALIAS, DISC_BUYER.alias,
    PERSONAL_NON_ORG.alias,
  ];
}

/**
 * Static self-consistency of the whole spec (PURE). Returns [] when sound. Catches the mistakes a
 * hand-edit introduces: a non-AGENT-TEST email, a duplicate email/alias, a GUID leaked into any
 * business field, or the address contract drifting away from 4-pages-with-a-partial-last.
 */
export function validateSpec() {
  const errs = [...assertAddr22Coherent()];
  const emails = allOwnedEmails();
  for (const e of emails) {
    if (!/^agent-test-/i.test(e)) errs.push(`email "${e}" lacks the agent-test- prefix (teardown would miss it)`);
  }
  const dupEmail = emails.find((e, i) => emails.indexOf(e) !== i);
  if (dupEmail) errs.push(`duplicate owned email "${dupEmail}"`);
  const aliases = allOwnedAliases();
  const dupAlias = aliases.find((a, i) => aliases.indexOf(a) !== i);
  if (dupAlias) errs.push(`duplicate owned alias "${dupAlias}"`);
  // No GUID may appear in any committed business field.
  const scan = JSON.stringify({
    MULTI_ORG_PERSONAS, FILLER_ORG_KEYS, ADDR22_ORG_NAME, ADDR22_ORG_EMAIL, ADDR22_ADMIN,
    addresses: buildAddr22Addresses(), DISC_ORDER_NUMBER, DISC_PRODUCT, DISC_BUYER, PERSONAL_NON_ORG,
  });
  const leaks = findGuidLeaks(scan);
  if (leaks.length) errs.push(`${leaks.length} runtime GUID(s) in committed spec fields: ${leaks.slice(0, 3).join(', ')}`);
  // F1 counts must straddle the 10/11 boundary.
  const counts = MULTI_ORG_PERSONAS.map((p) => p.orgCount).sort((a, b) => a - b);
  if (!(counts.includes(10) && counts.includes(11))) errs.push(`F1 personas must include exactly-10 AND exactly-11 (have ${counts.join(',')})`);
  if (Math.max(...counts) > FILLER_ORG_KEYS.length) errs.push(`a persona needs more orgs (${Math.max(...counts)}) than filler orgs declared (${FILLER_ORG_KEYS.length})`);
  if (new Set(FILLER_ORG_KEYS).size !== FILLER_ORG_KEYS.length) errs.push('duplicate key in FILLER_ORG_KEYS');
  return errs;
}
