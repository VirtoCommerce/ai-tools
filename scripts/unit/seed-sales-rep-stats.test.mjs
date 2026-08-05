// Unit tests for the Sales Rep statistics fixtures + sales-rep-stats-specs.mjs pure logic
// (VCST-5589 follow-up). Pure — no env, no network. Run: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CART_MARK, STATS_ORDER_MARK, cartName, statsOrderNumber, GUID_RE,
  buildStatisticsWindows, COMPARISON_AXES,
  TOP_SELLER_LINES, TOP_SELLER_ORDER, CART_FIXTURES,
  lineExtended, shapedOrderTotal, expectedRankings, rankingsDiverge,
  requiredProductSlots, buildShapedItems, OWNED_ALIASES,
} from '../seed-data/sales-rep/sales-rep-stats-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

// ---- deterministic business keys -------------------------------------------

test('business keys are deterministic and AGENT-TEST- prefixed so teardown sweeps them', () => {
  assert.equal(statsOrderNumber('TOPSELLERS'), `${STATS_ORDER_MARK}-TOPSELLERS`);
  assert.equal(cartName('ACME'), `${CART_MARK}-ACME`);
  assert.ok(statsOrderNumber('X').startsWith('AGENT-TEST-'));
  assert.ok(cartName('X').startsWith('AGENT-TEST-'));
});

// ---- window model ----------------------------------------------------------

test('buildStatisticsWindows: Monday-start week; 2026-08-03 IS a Monday so week==today', () => {
  const w = buildStatisticsWindows(new Date('2026-08-03T14:39:00.000Z'));
  assert.equal(w.today.from, '2026-08-03T00:00:00.000Z');
  assert.equal(w.week.from, '2026-08-03T00:00:00.000Z');
  assert.equal(w.prevWeek.from, '2026-07-27T00:00:00.000Z');
  assert.equal(w.prevWeek.to, '2026-08-02T23:59:59.999Z');
});

test('buildStatisticsWindows: mid-week Sunday rolls back to the preceding Monday', () => {
  // 2026-08-09 is a Sunday -> the Monday-start week began 2026-08-03.
  const w = buildStatisticsWindows(new Date('2026-08-09T09:00:00.000Z'));
  assert.equal(w.week.from, '2026-08-03T00:00:00.000Z');
  assert.equal(w.prevWeek.from, '2026-07-27T00:00:00.000Z');
});

test('buildStatisticsWindows: prevMonth/lastYear are the SAME day-span, not whole periods', () => {
  const w = buildStatisticsWindows(new Date('2026-08-03T14:39:00.000Z'));
  assert.equal(w.mtd.from, '2026-08-01T00:00:00.000Z');
  assert.equal(w.prevMonth.from, '2026-07-01T00:00:00.000Z');
  assert.equal(w.prevMonth.to, '2026-07-03T23:59:59.999Z', 'day-span, so Jul 1..Jul 3 — NOT all of July');
  assert.equal(w.ytd.from, '2026-01-01T00:00:00.000Z');
  assert.equal(w.lastYear.from, '2025-01-01T00:00:00.000Z');
  assert.equal(w.lastYear.to, '2025-08-03T23:59:59.999Z');
});

test('buildStatisticsWindows: the documented natural path — a 2026-07-16 order enters prevMonth on 2026-08-17', () => {
  const existingOrder = '2026-07-16T22:02:04.153Z';
  const before = buildStatisticsWindows(new Date('2026-08-03T12:00:00.000Z')).prevMonth;
  const onOrAfter = buildStatisticsWindows(new Date('2026-08-17T12:00:00.000Z')).prevMonth;
  assert.ok(existingOrder > before.to, 'on Aug 3 the Jul-16 order is OUTSIDE prevMonth (Jul 1..Jul 3)');
  assert.ok(existingOrder >= onOrAfter.from && existingOrder <= onOrAfter.to, 'on Aug 17 prevMonth spans Jul 1..Jul 17 and contains it');
});

test('every comparison axis previous window strictly precedes its current window', () => {
  const w = buildStatisticsWindows(new Date('2026-08-03T14:39:00.000Z'));
  for (const a of COMPARISON_AXES) {
    assert.ok(w[a.current], `unknown current window ${a.current}`);
    assert.ok(w[a.previous], `unknown previous window ${a.previous}`);
    assert.ok(w[a.previous].to < w[a.current].from, `${a.key}: previous must precede current`);
  }
});

test('all three axes are flagged pastOnlyPrevious — their baselines are un-seedable via the API', () => {
  assert.equal(COMPARISON_AXES.length, 3);
  assert.ok(COMPARISON_AXES.every((a) => a.pastOnlyPrevious === true));
});

// ---- top-seller shaping ----------------------------------------------------

test('lineExtended / shapedOrderTotal arithmetic', () => {
  assert.equal(lineExtended({ quantity: 40, unitPrice: 3.5 }), 140);
  assert.equal(lineExtended({ quantity: 3, unitPrice: 260 }), 780);
  assert.equal(lineExtended({ quantity: 12, unitPrice: 25 }), 300);
  assert.equal(lineExtended({ quantity: 25, unitPrice: 6 }), 150);
  assert.equal(lineExtended({ quantity: 8, unitPrice: 45 }), 360);
  assert.equal(lineExtended({ quantity: 2, unitPrice: 520 }), 1040);
  assert.equal(shapedOrderTotal(), 2770);
});

test('shapedOrderTotal equals the sum of extended prices (no rounding drift)', () => {
  const sum = TOP_SELLER_LINES.reduce((s, l) => s + lineExtended(l), 0);
  assert.ok(Math.abs(sum - shapedOrderTotal()) < 0.005);
});

test('by-units and by-revenue rankings DIVERGE — the point of the shaped order (BL-SR-008)', () => {
  const { byUnits, byRevenue } = expectedRankings();
  assert.deepEqual(byUnits, [0, 3, 2, 4, 1, 5], 'most units first: 40, 25, 12, 8, 3, 2');
  assert.deepEqual(byRevenue, [5, 1, 4, 2, 3, 0], 'most revenue first: $1040, $780, $360, $300, $150, $140');
  assert.deepEqual(byRevenue, [...byUnits].reverse(), 'the two rankings are EXACTLY reversed — every slot moves');
  assert.ok(rankingsDiverge());
});

test('no ties on either axis — a ranking assertion can never pass by coincidence', () => {
  assert.equal(new Set(TOP_SELLER_LINES.map((l) => l.quantity)).size, TOP_SELLER_LINES.length);
  assert.equal(new Set(TOP_SELLER_LINES.map(lineExtended)).size, TOP_SELLER_LINES.length);
});

// 093 SR-HD-010: the widget's default `take: 5` cap is only OBSERVABLE when more than 5 distinct
// products were purchased — with <=5 "exactly 5 rows" and "all rows" are the same assertion.
test('shaped order supplies >5 distinct products so the Top Sellers take:5 cap is observable', () => {
  assert.ok(TOP_SELLER_LINES.length > 5, `need >5 distinct products, spec has ${TOP_SELLER_LINES.length}`);
  const { byUnits, byRevenue } = expectedRankings();
  assert.notDeepEqual(
    [...byUnits.slice(0, 5)].sort(), [...byRevenue.slice(0, 5)].sort(),
    'the top-5 SET must differ per sort, so the cap is proven to apply AFTER ranking, not before',
  );
});

test('rankingsDiverge is FALSE for a uniform even split — the flat-CSV shape the base seeder produces', () => {
  // items_count=3, total=300 -> qty 1 @ $100 each: units and revenue rank identically.
  const evenSplit = [
    { productSlot: 0, quantity: 1, unitPrice: 100 },
    { productSlot: 1, quantity: 1, unitPrice: 100 },
    { productSlot: 2, quantity: 1, unitPrice: 100 },
  ];
  assert.equal(rankingsDiverge(evenSplit), false);
});

test('requiredProductSlots covers every order line and cart slot', () => {
  const need = requiredProductSlots();
  for (const l of TOP_SELLER_LINES) assert.ok(l.productSlot < need);
  for (const c of CART_FIXTURES) assert.ok(c.productSlot < need);
  assert.equal(need, 6);
});

// ---- buildShapedItems ------------------------------------------------------

const PRODUCTS = [
  { id: 'p-aaa', sku: 'SKU-A', name: 'Alpha', catalogId: 'cat-1' },
  { id: 'p-bbb', sku: 'SKU-B', name: 'Beta', catalogId: 'cat-1' },
  { id: 'p-ccc', sku: 'SKU-C', name: 'Gamma' },
  { id: 'p-ddd', sku: 'SKU-D', name: 'Delta', catalogId: 'cat-1' },
  { id: 'p-eee', sku: 'SKU-E', name: 'Epsilon', catalogId: 'cat-1' },
  { id: 'p-fff', sku: 'SKU-F', name: 'Zeta', catalogId: 'cat-2' },
];

test('buildShapedItems takes identity from the env and quantity/price from the spec', () => {
  const items = buildShapedItems(TOP_SELLER_LINES, PRODUCTS);
  assert.equal(items.length, 6);
  assert.equal(items[0].sku, 'SKU-A');
  assert.equal(items[0].quantity, 40);
  assert.equal(items[0].price, 3.5);
  assert.equal(items[1].sku, 'SKU-B');
  assert.equal(items[1].quantity, 3);
  assert.equal(items[1].price, 260);
  assert.equal(items[5].sku, 'SKU-F');
  assert.equal(items[5].quantity, 2);
  assert.equal(items[5].price, 520);
  assert.equal(items[0].catalogId, 'cat-1');
  assert.equal(items[2].catalogId, undefined, 'catalogId omitted when the product has none');
  assert.ok(items.every((i) => i.currency === 'USD' && i.productType === 'Physical'));
});

test('buildShapedItems FAILS LOUD on an unsatisfied slot rather than collapsing two slots onto one product', () => {
  assert.throws(() => buildShapedItems(TOP_SELLER_LINES, PRODUCTS.slice(0, 2)), /productSlot 2 unsatisfied/);
  // The LAST slot is the one a too-narrow discovery silently drops first — pin it explicitly.
  assert.throws(() => buildShapedItems(TOP_SELLER_LINES, PRODUCTS.slice(0, 5)), /productSlot 5 unsatisfied/);
});

test('buildShapedItems keeps line SKUs distinct so the ranking cannot self-collapse', () => {
  const items = buildShapedItems(TOP_SELLER_LINES, PRODUCTS);
  assert.equal(new Set(items.map((i) => i.sku)).size, items.length);
});

// ---- fixture / alias contract ---------------------------------------------

test('cart fixtures sit in two DIFFERENT served orgs so the dashboard count is >1 and cross-org scoped', () => {
  assert.ok(CART_FIXTURES.length >= 2, 'BL-SR-006 needs at least 2 active carts');
  assert.equal(new Set(CART_FIXTURES.map((c) => c.orgKey)).size, CART_FIXTURES.length);
});

test('the shaped order targets a SECOND served org, not the one that already had orders', () => {
  assert.equal(TOP_SELLER_ORDER.orgKey, 'ORG-002');
  assert.notEqual(TOP_SELLER_ORDER.orgKey, 'ORG-001');
});

test('the shaped order status stays inside the BL-SR-005 baseline set (not Cancelled)', () => {
  assert.notEqual(TOP_SELLER_ORDER.status, 'Cancelled');
  assert.equal(TOP_SELLER_ORDER.status, 'Processing');
});

test('every owned alias is registered in aliases.json with an EMPTY id and the spec business key', () => {
  const expected = {
    SR_STATS_TOPSELLER_ORDER: ['number', statsOrderNumber(TOP_SELLER_ORDER.key)],
    SR_STATS_CART_ACME: ['name', cartName('ACME')],
    SR_STATS_CART_WEST: ['name', cartName('WEST')],
  };
  for (const alias of OWNED_ALIASES) {
    const entry = aliases[alias];
    assert.ok(entry, `alias ${alias} must exist in test-data/aliases.json`);
    const [field, value] = expected[alias];
    assert.equal(entry[field], value, `${alias}.${field}`);
    assert.equal(entry.id, '', `${alias}.id must be empty in the committed base — runtime id lives in the env overlay`);
  }
});

test('no committed alias for this domain carries a runtime platform GUID (DV-021)', () => {
  for (const alias of OWNED_ALIASES) {
    for (const [k, v] of Object.entries(aliases[alias] || {})) {
      if (typeof v === 'string') assert.ok(!GUID_RE.test(v.trim()), `${alias}.${k} leaks a runtime GUID into the committed base`);
    }
  }
});
