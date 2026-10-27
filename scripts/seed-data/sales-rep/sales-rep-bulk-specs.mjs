/**
 * sales-rep-bulk-specs.mjs — SINGLE SOURCE OF TRUTH for the Sales Rep BULK-VOLUME dataset on the
 * PLAIN rep SR_REP_PRIMARY (089 SR-FE-052 and the hub's large-number layout checks).
 *
 * Side-effect-free (no env read, no network, no fs): the seeder and the drift guard import it.
 *
 * THE CHAIN'S QUESTION (test-data.md SECOND RULE)
 * -----------------------------------------------
 * Does the hub RENDER large real numbers correctly — a 4-digit order count with thousands grouping
 * next to a 7-digit money total, a 3-digit count beside it, and a rep-wide YTD that is the SUM of the
 * two? Every existing SR_REP_PRIMARY org peaks at single-digit counts and four-digit money, so a
 * grouping / truncation / column-width defect on a big number is undecidable on today's data.
 * The dataset therefore has TWO dedicated orgs whose figures sit in DIFFERENT magnitude classes:
 *
 *   BULK-ORG-01 (large) — >= 1000 statistics-counted orders and >= $1,000,000 YTD (4-digit count,
 *                         7-digit money, the SR-FE-052 row);
 *   BULK-ORG-02 (mid)   — 100..999 orders and a 6-digit total (3-digit count, so a row that groups
 *                         wrongly only above 999 is visibly different from its neighbour).
 * Equal magnitudes would let "the column groups every number" and "the column groups nothing below
 * 1000" pass alike, so bulkShortfalls() FAILS when the two orgs fall into the same class.
 *
 * WHY DEDICATED ORGS, not the rep's existing ORG-001..004: those orgs' order lists are asserted row
 * by row by 050m / 089 / 091 / 097 (SRO-* fixture orders, row caps, recency). A thousand new orders
 * there would push every fixture order off page one. In dedicated orgs only the rep-WIDE figures move
 * (dashboard KPI, activity Orders badge, recent-orders / top-sellers widgets) — the price of the data
 * the request is for, and fully reverted by the teardown.
 *
 * HARD PLATFORM CONSTRAINT: createdDate is server-assigned (sales-rep-stats-specs.mjs; KB-971BC129),
 * so every order lands TODAY: YTD = MTD = week = today for this dataset, previous-period baselines
 * stay 0 and *ChangePercent stays NULL. Not a defect of the data.
 */
import { prng } from './sales-rep-perf-specs.mjs';

/** The rep the orders are attributed to (customerId = its ApplicationUser id, BL-SR-002). */
export const BULK_REP_KEY = 'SR_REP_PRIMARY';
export const BULK_STORE = 'B2B-store';
export const BULK_CURRENCY = 'USD';

/** AGENT-TEST- marks: teardown sweeps exactly these and nothing else. */
export const BULK_ORDER_MARK = 'AGENT-TEST-SRBULK';          // AGENT-TEST-SRBULK-000001
export const BULK_ORG_PREFIX = 'AGENT-TEST-SR-BULK-ORG-';     // AGENT-TEST-SR-BULK-ORG-01, -02
export const BULK_CUSTOMER_NAME = 'AGENT-TEST-SR-BULK Buyer';

export const BULK_ORGS = [
  { index: 1, key: 'LARGE', name: `${BULK_ORG_PREFIX}01` },
  { index: 2, key: 'MID', name: `${BULK_ORG_PREFIX}02` },
];

/** Default dataset size (indices 1..N). Every 7th order goes to MID, the rest to LARGE. */
export const BULK_DEFAULT_COUNT = 1230;
export const BULK_MAX_COUNT = 5000;   // guard against a mistyped --count, not a target
export const MID_EVERY = 7;

/** Thresholds the guard and the seeder both read. */
export const LARGE_MIN_STATS_COUNT = 1000;
export const LARGE_MIN_STATS_TOTAL = 1_000_000;
export const MID_COUNT_RANGE = [100, 999];

export const BULK_PRODUCT_SLOTS = 12;
export const BULK_MAX_LINES = 4;

export const BULK_STATUS_WEIGHTS = [
  { status: 'New', weight: 30 },
  { status: 'Processing', weight: 35 },
  { status: 'Completed', weight: 33 },
  { status: 'Cancelled', weight: 2, isCancelled: true },   // BL-SR-005: excluded from statistics
];

/** Pure functions of the slot — no transcribed price table. Expensive slots sell in small quantities. */
export const bulkSlotUnitPrice = (slot) => Math.round((18 + slot * slot * 7.5) * 100) / 100;
export const bulkSlotMaxQuantity = (slot) => Math.max(1, Math.round(40 / (1 + slot)));

export const bulkOrderNumber = (index) => `${BULK_ORDER_MARK}-${String(index).padStart(6, '0')}`;
export const BULK_ORDER_NUMBER_RE = new RegExp(`^${BULK_ORDER_MARK}-(\\d{6})$`);
export const parseBulkOrderIndex = (number) => {
  const m = BULK_ORDER_NUMBER_RE.exec(String(number || ''));
  return m ? parseInt(m[1], 10) : null;
};

const STATUS_CUM = (() => {
  let acc = 0;
  return BULK_STATUS_WEIGHTS.map((s) => ({ ...s, cum: (acc += s.weight / 100) }));
})();

/** The full shape of order #index (PURE, deterministic across runs and envs). */
export function bulkOrderSpec(index) {
  if (!Number.isInteger(index) || index < 1) throw new Error(`order index must be a positive integer, got ${index}`);
  const r = prng(index * 2246822519 + 17);
  const orgIndex = index % MID_EVERY === 0 ? 2 : 1;
  const v = r();
  const st = STATUS_CUM.find((s) => v <= s.cum) || STATUS_CUM[STATUS_CUM.length - 1];
  const lineCount = 1 + Math.floor(r() * BULK_MAX_LINES);
  const slots = new Set();
  while (slots.size < lineCount) slots.add(Math.floor(r() * BULK_PRODUCT_SLOTS));
  const lines = [...slots].sort((a, b) => a - b).map((productSlot) => ({
    productSlot,
    quantity: 1 + Math.floor(r() * bulkSlotMaxQuantity(productSlot)),
    unitPrice: bulkSlotUnitPrice(productSlot),
  }));
  return { index, number: bulkOrderNumber(index), orgIndex, status: st.status, isCancelled: !!st.isCancelled, lines };
}

export const bulkLineTotal = (l) => Math.round(l.quantity * l.unitPrice * 100) / 100;
export const bulkOrderTotal = (spec) => Math.round(spec.lines.reduce((s, l) => s + bulkLineTotal(l), 0) * 100) / 100;

/** Per-org expectations for orders 1..count (PURE) — what the live verification compares against. */
export function bulkProfile(count = BULK_DEFAULT_COUNT) {
  const perOrg = BULK_ORGS.map((o) => ({ ...o, count: 0, cancelled: 0, statsCount: 0, statsTotal: 0 }));
  for (let i = 1; i <= count; i++) {
    const s = bulkOrderSpec(i);
    const o = perOrg[s.orgIndex - 1];
    o.count++;
    if (s.isCancelled) o.cancelled++;
    else { o.statsCount++; o.statsTotal += bulkOrderTotal(s); }
  }
  for (const o of perOrg) o.statsTotal = Math.round(o.statsTotal * 100) / 100;
  const statsCount = perOrg.reduce((s, o) => s + o.statsCount, 0);
  const statsTotal = Math.round(perOrg.reduce((s, o) => s + o.statsTotal, 0) * 100) / 100;
  return { count, perOrg, statsCount, statsTotal };
}

const digits = (n) => String(Math.trunc(n)).length;

/** Why a `count`-order dataset could NOT answer the chain's question (PURE). Empty = fit. */
export function bulkShortfalls(count = BULK_DEFAULT_COUNT) {
  const out = [];
  if (!Number.isInteger(count) || count < 1) return [`count must be a positive integer, got ${count}`];
  if (count > BULK_MAX_COUNT) out.push(`count ${count} exceeds BULK_MAX_COUNT ${BULK_MAX_COUNT}`);
  const { perOrg } = bulkProfile(count);
  const [large, mid] = perOrg;
  if (large.statsCount < LARGE_MIN_STATS_COUNT) out.push(`LARGE org counts only ${large.statsCount} statistics orders, need >= ${LARGE_MIN_STATS_COUNT} (SR-FE-052, 4-digit count)`);
  if (large.statsTotal < LARGE_MIN_STATS_TOTAL) out.push(`LARGE org total $${large.statsTotal} < $${LARGE_MIN_STATS_TOTAL} (7-digit money)`);
  if (mid.statsCount < MID_COUNT_RANGE[0] || mid.statsCount > MID_COUNT_RANGE[1]) out.push(`MID org counts ${mid.statsCount}, need ${MID_COUNT_RANGE[0]}..${MID_COUNT_RANGE[1]} (3-digit count)`);
  if (digits(large.statsCount) === digits(mid.statsCount)) out.push('LARGE and MID counts have the same number of digits — grouping above/below 1000 is not discriminated');
  if (digits(large.statsTotal) === digits(mid.statsTotal)) out.push('LARGE and MID totals have the same number of digits — money magnitudes do not diverge');
  if (count >= 100 && perOrg.every((o) => o.cancelled === 0)) out.push('no cancelled order — BL-SR-005 exclusion (count != statistics count) is not exercised');
  return out;
}

/** Line items from the live-discovered product list (PURE). Throws on an unsatisfied slot. */
export function buildBulkItems(spec, products) {
  return spec.lines.map((l) => {
    const p = products[l.productSlot];
    if (!p) throw new Error(`productSlot ${l.productSlot} unsatisfied — only ${products.length} distinct product(s) discovered`);
    return {
      sku: p.sku, productId: p.id, name: p.name, catalogId: p.catalogId, ...(p.imgSrc ? { imageUrl: p.imgSrc } : {}),
      quantity: l.quantity, price: l.unitPrice, productType: 'Physical', currency: BULK_CURRENCY,
    };
  });
}

/** The overlay alias this dataset writes (runtime GUIDs + measured counts; never committed rows). */
export const BULK_DATASET_ALIAS = 'SR_BULK_DATASET';
