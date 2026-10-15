/**
 * sales-rep-perf-specs.mjs — SINGLE SOURCE OF TRUTH for the Sales Rep PERFORMANCE dataset
 * (VCST-5755 AC-5: "hub open with caching disabled (TTL=0) on a large order dataset — sizes the
 * invalidation worst case").
 *
 * Side-effect-free (no env read, no network, no fs): the seeder and any validator import it.
 *
 * THE CHAIN'S QUESTION (test-data.md SECOND RULE)
 * -----------------------------------------------
 * The sales-rep statistics family is CREATOR + MEMBERSHIP scoped (BL-SR-002 half b): it aggregates
 * only orders whose customerId is the CALLING rep's ApplicationUser id, inside orgs the rep serves.
 * So the load-bearing quantity is "orders this rep created", and the cost of aggregating them depends
 * on how they are SPREAD, not just how many there are. A set where every order is identical, in one
 * org, on one day, in one status, with one product, lets the database answer every query from a
 * trivially small group and the benchmark measures nothing. Each order is therefore generated to
 * vary on every axis the queries group or filter by:
 *
 *   organization  — 15 dedicated orgs with a SKEWED (Zipf-like) share, so per-org counts/totals all
 *                   differ and the salesRepCustomers order-metric sorts have a real ranking;
 *   status        — New / Processing / Completed + ~5% Cancelled (IsCancelled=true, BL-SR-005:
 *                   excluded from statistics, kept in the order list — BL-SR-009);
 *   lines         — 1..6 lines over a pool of distinct products, per-slot unit prices inversely
 *                   related to typical quantities, so salesRepTopSellers by-units and by-revenue
 *                   DISAGREE (BL-SR-008) — checked by datasetShortfalls(), not hoped for;
 *   date          — an INTENDED createdDate spread over ~400 days (YTD, previous month, last year).
 *                   The platform assigns createdDate server-side (sales-rep-stats-specs.mjs, HARD
 *                   PLATFORM CONSTRAINT); the seeder still sends the intended date and MEASURES how
 *                   many were honoured, so the limit is reported per run rather than assumed.
 *
 * Generation is DETERMINISTIC per order index (seeded PRNG), so order #N has the same shape on every
 * run and env: resumable seeding (create only the missing indices) and teardown by number prefix.
 * Product IDENTITY is live-discovered (slot -> discovered product); only slot/qty/price live here.
 */

/** Every entity carries an AGENT-TEST- mark so teardown sweeps exactly this set and nothing else. */
export const PERF_ORDER_MARK = 'AGENT-TEST-SRPERF';         // order numbers: AGENT-TEST-SRPERF-000001
export const PERF_ORG_PREFIX = 'AGENT-TEST-SR-PERF-ORG-';    // orgs: AGENT-TEST-SR-PERF-ORG-01..15
export const PERF_STORE = 'B2B-store';
export const PERF_CURRENCY = 'USD';

/** The dedicated rep — never SR_REP_PRIMARY, so no existing fixture or suite sees this data. */
export const PERF_REP = {
  key: 'SR_REP_PERF',
  alias: 'SR_REP_PERF',
  email: 'agent-test-sr-perf@example.com',
  // The module RECOMPUTES fullName from firstName + lastName and ignores a sent fullName (observed
  // vcptcore-qa 2026-10-12: fullName "AGENT-TEST-SR-PERF Rep" persisted as "Perf Rep"), so the
  // AGENT-TEST- mark has to ride firstName for the rep's displayed name to carry it.
  firstName: 'AGENT-TEST-SR-PERF',
  lastName: 'Rep',
  fullName: 'AGENT-TEST-SR-PERF Rep',
  store: PERF_STORE,
};

export const PERF_ORG_COUNT = 15;
/** Distinct products the generator draws lines from (live-discovered; slot -> product). */
export const PERF_PRODUCT_SLOTS = 24;
export const MAX_LINES = 6;
/** Days back the intended createdDate is spread over (covers YTD + previous month + last year). */
export const DATE_SPREAD_DAYS = 400;
/** Hard ceiling — a guard against a mistyped --count, not a target. */
export const MAX_COUNT = 60000;

export const perfOrgName = (i) => `${PERF_ORG_PREFIX}${String(i).padStart(2, '0')}`;
export const PERF_ORG_NAMES = Array.from({ length: PERF_ORG_COUNT }, (_, i) => perfOrgName(i + 1));
export const perfOrderNumber = (index) => `${PERF_ORDER_MARK}-${String(index).padStart(6, '0')}`;
export const PERF_ORDER_NUMBER_RE = new RegExp(`^${PERF_ORDER_MARK}-(\\d{6})$`);
export const parsePerfOrderIndex = (number) => {
  const m = PERF_ORDER_NUMBER_RE.exec(String(number || ''));
  return m ? parseInt(m[1], 10) : null;
};

/** Status mix (weights sum to 100). Cancelled is the IsCancelled flag, not just the status text. */
export const STATUS_WEIGHTS = [
  { status: 'New', weight: 30 },
  { status: 'Processing', weight: 35 },
  { status: 'Completed', weight: 30 },
  { status: 'Cancelled', weight: 5, isCancelled: true },
];

/**
 * Per-slot unit price: cheap slots sell in bulk, expensive ones in ones and twos, so the by-units and
 * by-revenue top-seller rankings invert. Pure function of the slot (no transcribed price table).
 */
export const slotUnitPrice = (slot) => Math.round((4 + slot * slot * 2.75) * 100) / 100;
/** Typical quantity ceiling for a slot — inversely related to its price. */
export const slotMaxQuantity = (slot) => Math.max(1, Math.round(60 / (1 + slot * 0.6)));

// ---- deterministic PRNG -----------------------------------------------------

/** mulberry32 — tiny, deterministic, good enough for fixture shaping. */
export function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Zipf-like org weights (org 1 heaviest). Normalised cumulative table. */
const ORG_CUM = (() => {
  const w = Array.from({ length: PERF_ORG_COUNT }, (_, i) => 1 / (i + 1) ** 0.8);
  const sum = w.reduce((s, x) => s + x, 0);
  let acc = 0;
  return w.map((x) => (acc += x / sum));
})();
const STATUS_CUM = (() => {
  let acc = 0;
  return STATUS_WEIGHTS.map((s) => ({ ...s, cum: (acc += s.weight / 100) }));
})();

/**
 * The full shape of order #index (PURE, deterministic). `now` anchors the intended date.
 * Returns { index, number, orgIndex (1-based), status, isCancelled, intendedCreatedDate, lines[] }
 * where each line is { productSlot, quantity, unitPrice }.
 */
export function perfOrderSpec(index, now = new Date()) {
  if (!Number.isInteger(index) || index < 1) throw new Error(`order index must be a positive integer, got ${index}`);
  const r = prng(index * 2654435761);
  const u = r();
  const orgIndex = ORG_CUM.findIndex((c) => u <= c) + 1 || PERF_ORG_COUNT;
  const v = r();
  const st = STATUS_CUM.find((s) => v <= s.cum) || STATUS_CUM[STATUS_CUM.length - 1];
  const lineCount = 1 + Math.floor(r() * MAX_LINES);
  const slots = new Set();
  while (slots.size < lineCount) {
    // Skew toward low slots so a handful of products dominate units (a realistic long tail).
    slots.add(Math.min(PERF_PRODUCT_SLOTS - 1, Math.floor(PERF_PRODUCT_SLOTS * r() ** 1.6)));
  }
  const lines = [...slots].sort((a, b) => a - b).map((productSlot) => ({
    productSlot,
    quantity: 1 + Math.floor(r() * slotMaxQuantity(productSlot)),
    unitPrice: slotUnitPrice(productSlot),
  }));
  const daysBack = Math.floor(r() * DATE_SPREAD_DAYS);
  const secondsIntoDay = Math.floor(r() * 86400);
  const base = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const intended = new Date(base - daysBack * 86400000 + secondsIntoDay * 1000);
  return {
    index, number: perfOrderNumber(index), orgIndex,
    status: st.status, isCancelled: !!st.isCancelled,
    intendedCreatedDate: (intended > now ? now : intended).toISOString(),
    lines,
  };
}

export const lineTotal = (l) => Math.round(l.quantity * l.unitPrice * 100) / 100;
export const perfOrderTotal = (spec) => Math.round(spec.lines.reduce((s, l) => s + lineTotal(l), 0) * 100) / 100;

/**
 * Aggregate what a dataset of orders 1..count looks like (PURE) — the expectations a live probe
 * compares against, and what datasetShortfalls() judges for discriminating power.
 */
export function datasetProfile(count, now = new Date()) {
  const perOrg = new Array(PERF_ORG_COUNT).fill(0);
  const perStatus = {};
  const units = new Array(PERF_PRODUCT_SLOTS).fill(0);
  const revenue = new Array(PERF_PRODUCT_SLOTS).fill(0);
  let cancelled = 0; let lines = 0; let total = 0; let statsTotal = 0;
  for (let i = 1; i <= count; i++) {
    const s = perfOrderSpec(i, now);
    perOrg[s.orgIndex - 1]++;
    perStatus[s.status] = (perStatus[s.status] || 0) + 1;
    if (s.isCancelled) cancelled++;
    lines += s.lines.length;
    const t = perfOrderTotal(s);
    total += t;
    if (!s.isCancelled) {
      statsTotal += t;
      for (const l of s.lines) { units[l.productSlot] += l.quantity; revenue[l.productSlot] += lineTotal(l); }
    }
  }
  const rank = (arr) => arr.map((v, slot) => ({ slot, v })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v).map((x) => x.slot);
  return {
    count, cancelled, statsCount: count - cancelled, lines,
    total: Math.round(total * 100) / 100, statsTotal: Math.round(statsTotal * 100) / 100,
    perOrg, perStatus, topByUnits: rank(units).slice(0, 10), topByRevenue: rank(revenue).slice(0, 10),
  };
}

/**
 * Why a dataset of `count` orders could NOT answer the chain's question (PURE). Empty = fit.
 * Below ~100 orders some axes legitimately cannot diverge yet; the seeder refuses only on a
 * shortfall at the requested size, so a 100-order measurement run is judged at 100.
 */
export function datasetShortfalls(count, now = new Date()) {
  const p = datasetProfile(count, now);
  const out = [];
  const usedOrgs = p.perOrg.filter((n) => n > 0).length;
  if (usedOrgs < Math.min(PERF_ORG_COUNT, Math.ceil(count / 4))) out.push(`only ${usedOrgs} org(s) receive orders — org scope is not exercised`);
  if (new Set(p.perOrg.filter((n) => n > 0)).size < Math.min(usedOrgs, 3)) out.push('per-org order counts do not differ — order-metric customer sorts cannot rank');
  for (const s of STATUS_WEIGHTS) if (count >= 40 && !p.perStatus[s.status]) out.push(`status ${s.status} absent`);
  if (count >= 40 && p.cancelled === 0) out.push('no cancelled order — BL-SR-005 exclusion is not exercised');
  if (p.topByUnits.join(',') === p.topByRevenue.join(',')) out.push('top sellers by-units and by-revenue agree — BL-SR-008 sort is not discriminated');
  return out;
}

/** Build the line items from the discovered product list (PURE). Throws on an unsatisfied slot. */
export function buildPerfItems(spec, products) {
  return spec.lines.map((l) => {
    const p = products[l.productSlot];
    if (!p) throw new Error(`productSlot ${l.productSlot} unsatisfied — only ${products.length} distinct product(s) discovered`);
    return {
      sku: p.sku, productId: p.id, name: p.name, catalogId: p.catalogId, ...(p.imgSrc ? { imageUrl: p.imgSrc } : {}),
      quantity: l.quantity, price: l.unitPrice, productType: 'Physical', currency: PERF_CURRENCY,
    };
  });
}

/** Percentile over a numeric array (PURE, nearest-rank). */
export function percentile(values, p) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil((p / 100) * s.length) - 1))];
}
