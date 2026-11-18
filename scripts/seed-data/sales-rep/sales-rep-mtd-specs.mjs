/**
 * sales-rep-mtd-specs.mjs — SINGLE SOURCE OF TRUTH for the Sales Rep *current-month projection*
 * fixtures (VCST-6255: Customer sales report — the rep's own-order revenue / orders / AOV per month).
 *
 * Side-effect-free (no env read, no network, no fs) so the seeder (`seed-sales-rep-stats.mjs --only MTD`)
 * and the drift guard (`td:validate:sales-rep-stats`) import the same declaration.
 *
 * WHY THIS EXISTS — the chain's question, not the screen's (test-data.md SECOND RULE)
 * ---------------------------------------------------------------------------------
 * The report answers "how much did MY customers buy through ME this month". Four server-side branches
 * decide which orders reach that figure, and each must be FALSIFIABLE by this data:
 *   · attribution  — an order counts only when order.CustomerId == the rep's ApplicationUser id
 *                    (NOT the Contact id). `BUYER` is an order in a SERVED org whose CustomerId is a
 *                    buyer of that org: a server that attributed by organization would count it.
 *   · cancel flag  — IsCancelled=true is excluded. `XCANCEL` carries a NON-"Cancelled" status, so the
 *                    flag alone is under test: a server that excluded by status would still count it.
 *   · status only  — Status="Cancelled" with IsCancelled=false (`SCANCEL`). AC says it must NOT count;
 *                    the observed code counts it. The fixture makes the two readings differ by its total.
 *   · per-customer — two served orgs with DIFFERENT AOV (AcmeWest two orders, TechFlow one) so a
 *                    customer filter that leaked the other org, or averaged across orgs, reads a
 *                    different number than the right one.
 * Every total is distinct and non-round, so any sum of a subset of them identifies the subset.
 *
 * LIMITS (state them, do not paper over them)
 *   · `createdDate` is server-assigned (KB-971BC129): every order lands TODAY, i.e. in the current
 *     month. These fixtures are TIME-TERMINAL — they fall into a closed month on the 1st of next
 *     month and must be re-seeded per run. Past months / last year stay at the env's natural baseline.
 *   · They ADD to whatever SR_REP_PRIMARY already has this month; the expected figure is
 *     baseline + `expectedRepDelta()`, read baseline with `npm run sales-rep:stats` before seeding.
 */
import { GUID_RE, lineExtended } from './sales-rep-stats-specs.mjs';

export { GUID_RE };

/** AGENT-TEST- number space — teardown sweeps exactly these and nothing else. */
export const MTD_ORDER_MARK = 'AGENT-TEST-SRO-MTD';
export const mtdOrderNumber = (key) => `${MTD_ORDER_MARK}-${key}`;

/** The rep the counted orders are attributed to, and the store the report queries. */
export const MTD_REP_KEY = 'SR_REP_PRIMARY';
export const MTD_STORE = 'B2B-store';

/**
 * `creator`: 'rep' ⇒ CustomerId = the rep's ApplicationUser id; otherwise a b2b/users.csv user_id
 * whose ApplicationUser id becomes CustomerId (a buyer of that org — not a rep).
 * `counted`: what the SPEC (AC) says the report must do with it. `countedByCode` is what the observed
 * implementation does — they differ only for SCANCEL, which is the point of that fixture.
 */
export const MTD_ORDERS = [
  { key: 'WEST-1',  variant: 'normal',        orgKey: 'ORG-004', creator: 'rep',     status: 'New',        isCancelled: false, counted: true,  countedByCode: true,
    lines: [{ productSlot: 0, quantity: 2, unitPrice: 50.25 }] },                                   // 100.50
  { key: 'WEST-2',  variant: 'normal',        orgKey: 'ORG-004', creator: 'rep',     status: 'Processing', isCancelled: false, counted: true,  countedByCode: true,
    lines: [{ productSlot: 1, quantity: 3, unitPrice: 100.10 }] },                                  // 300.30
  { key: 'TECH-1',  variant: 'normal',        orgKey: 'ORG-002', creator: 'rep',     status: 'New',        isCancelled: false, counted: true,  countedByCode: true,
    lines: [{ productSlot: 2, quantity: 4, unitPrice: 250.25 }] },                                  // 1001.00
  { key: 'XCANCEL', variant: 'flag-cancelled', orgKey: 'ORG-004', creator: 'rep',     status: 'Processing', isCancelled: true,  counted: false, countedByCode: false,
    lines: [{ productSlot: 0, quantity: 7, unitPrice: 111.10 }] },                                  // 777.70
  { key: 'SCANCEL', variant: 'status-cancelled', orgKey: 'ORG-002', creator: 'rep',   status: 'Cancelled',  isCancelled: false, counted: false, countedByCode: true,
    lines: [{ productSlot: 1, quantity: 5, unitPrice: 111.10 }] },                                  // 555.50
  { key: 'BUYER',   variant: 'other-creator', orgKey: 'ORG-002', creator: 'USR-007', status: 'New',        isCancelled: false, counted: false, countedByCode: false,
    lines: [{ productSlot: 2, quantity: 9, unitPrice: 111.10 }] },                                  // 999.90
];

/** @td() alias per fixture — each one is a row a case names. Business key only in the committed base. */
export const MTD_ALIASES = {
  SR_MTD_ORDER_WEST_1: 'WEST-1',
  SR_MTD_ORDER_WEST_2: 'WEST-2',
  SR_MTD_ORDER_TECH_1: 'TECH-1',
  SR_MTD_ORDER_FLAG_CANCELLED: 'XCANCEL',
  SR_MTD_ORDER_STATUS_CANCELLED: 'SCANCEL',
  SR_MTD_ORDER_OTHER_CREATOR: 'BUYER',
};

export const mtdCustomerName = (o) => (o.creator === 'rep' ? 'AGENT-TEST-SR-MTD Rep Order' : 'AGENT-TEST-SR-MTD Buyer Order');

/** Order total implied by its lines (PURE), rounded to cents. */
export const mtdOrderTotal = (o) => Math.round(o.lines.reduce((s, l) => s + lineExtended(l), 0) * 100) / 100;

export const requiredMtdProductSlots = (orders = MTD_ORDERS) =>
  Math.max(...orders.flatMap((o) => o.lines.map((l) => l.productSlot))) + 1;

const r2 = (n) => Math.round(n * 100) / 100;

/**
 * What these fixtures ADD to the rep's current-month figures (PURE), per reading:
 * `spec` = the AC (SCANCEL excluded), `code` = observed implementation (SCANCEL included).
 * `orgKey` narrows to one served customer (the per-customer filter).
 */
export function expectedRepDelta(reading = 'spec', orgKey = null, orders = MTD_ORDERS) {
  const pick = orders.filter((o) => (reading === 'code' ? o.countedByCode : o.counted) && (!orgKey || o.orgKey === orgKey));
  const total = r2(pick.reduce((s, o) => s + mtdOrderTotal(o), 0));
  return { count: pick.length, total, keys: pick.map((o) => o.key) };
}

/** Every discriminating property, evaluated (PURE). [] = the set can decide every link. */
export function mtdShortfalls(orders = MTD_ORDERS) {
  const out = [];
  const totals = orders.map(mtdOrderTotal);
  if (new Set(totals).size !== totals.length) out.push('two fixtures share a total — a sum can no longer identify which orders were counted');
  for (const o of orders) if (!(mtdOrderTotal(o) > 0)) out.push(`${o.key} has a non-positive total`);
  const by = (v) => orders.filter((o) => o.variant === v);
  for (const v of ['normal', 'flag-cancelled', 'status-cancelled', 'other-creator']) if (!by(v).length) out.push(`no ${v} fixture — that branch is undecidable`);
  for (const o of by('flag-cancelled')) {
    if (!o.isCancelled) out.push(`${o.key}: flag-cancelled fixture must carry isCancelled=true`);
    if (o.status === 'Cancelled') out.push(`${o.key}: flag-cancelled fixture must NOT carry status "Cancelled" — else a status-based exclusion passes for the flag`);
    if (o.creator !== 'rep') out.push(`${o.key}: must be rep-created, or attribution excludes it and the flag is never exercised`);
  }
  for (const o of by('status-cancelled')) {
    if (o.isCancelled) out.push(`${o.key}: status-cancelled fixture must carry isCancelled=false`);
    if (o.status !== 'Cancelled') out.push(`${o.key}: status-cancelled fixture must carry status "Cancelled"`);
    if (o.creator !== 'rep') out.push(`${o.key}: must be rep-created`);
    if (o.counted === o.countedByCode) out.push(`${o.key}: spec and code readings must DIFFER here, else the AC-vs-code gap is invisible`);
  }
  for (const o of by('other-creator')) {
    if (o.creator === 'rep') out.push(`${o.key}: other-creator fixture is attributed to the rep`);
    if (o.isCancelled || o.status === 'Cancelled') out.push(`${o.key}: other-creator fixture must be otherwise countable, so only attribution excludes it`);
  }
  const normalOrgs = [...new Set(by('normal').map((o) => o.orgKey))];
  if (normalOrgs.length < 2) out.push('normal orders span < 2 orgs — the per-customer filter is indistinguishable from All');
  const aov = normalOrgs.map((k) => { const d = expectedRepDelta('spec', k, orders); return r2(d.total / d.count); });
  if (new Set(aov).size !== aov.length) out.push('the served orgs have EQUAL fixture AOV — a cross-org averaging bug would pass');
  const counts = normalOrgs.map((k) => expectedRepDelta('spec', k, orders).count);
  if (new Set(counts).size !== counts.length) out.push('the served orgs have EQUAL fixture order counts — a swapped customer filter would pass on count');
  if (expectedRepDelta('spec').total === expectedRepDelta('code').total) out.push('spec and code readings give the same total');
  return out;
}
