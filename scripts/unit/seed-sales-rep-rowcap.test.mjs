// Unit tests for the VCST-5649 Sales Rep widget row-cap fixtures (sales-rep-rowcap-specs.mjs).
// Pure — no env, no network. Run: `npm test`
//
// The property under test throughout is SUFFICIENCY: a row cap is only observable when the data set
// is strictly larger than the cap, so every threshold below is an acceptance criterion, not a taste.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROWCAP_ORDER_MARK, ROWCAP_ORDERS, ROWCAP_ALIASES, ROWCAP_OWNED_ALIASES,
  ROWCAP_REP_KEY, ROWCAP_STORE, ROWCAP_PROFILE_ORG_KEY, ROWCAP_STATUS_VOCABULARY,
  ROWCAP_MIN_TOTAL_ORDERS, ROWCAP_MIN_ORDERS_IN_PROFILE_ORG,
  ROWCAP_MIN_DISTINCT_STATUSES, ROWCAP_MIN_DISTINCT_PRODUCTS,
  rowcapOrderNumber, rowcapOrderTotal, rowcapCustomerName, rowcapShortfalls,
  rowcapOrdersForOrg, rowcapStatuses, rowcapOrgKeys, rowcapTopSellerSlots,
  requiredRowcapProductSlots, buildRowcapItems, GUID_RE,
} from '../seed-data/sales-rep/sales-rep-rowcap-specs.mjs';
import { isDisposableLayoutRep } from '../seed-data/sales-rep/sales-rep-layout-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

// ---- business keys ----------------------------------------------------------

test('order numbers are deterministic, unique and AGENT-TEST- prefixed so teardown sweeps them', () => {
  assert.equal(rowcapOrderNumber('ACME-01'), `${ROWCAP_ORDER_MARK}-ACME-01`);
  assert.ok(rowcapOrderNumber('X').startsWith('AGENT-TEST-'));
  const numbers = ROWCAP_ORDERS.map((o) => rowcapOrderNumber(o.key));
  assert.equal(new Set(numbers).size, numbers.length, 'order numbers must be unique — the number is the idempotency key');
});

test('the row-cap number space is disjoint from the statistics fixtures', () => {
  // AGENT-TEST-SRO-STATS-* belongs to SR_REP_PRIMARY; a shared prefix would let one teardown
  // delete the other family's orders by keyword.
  assert.ok(!ROWCAP_ORDER_MARK.startsWith('AGENT-TEST-SRO-STATS'));
  assert.ok(!'AGENT-TEST-SRO-STATS'.startsWith(ROWCAP_ORDER_MARK));
});

// ---- sufficiency: the whole reason this fixture set exists ------------------

test('the shipped fixture set satisfies every acceptance-criteria threshold', () => {
  assert.deepEqual(rowcapShortfalls(), []);
});

test('total order count exceeds the largest cap the cases distinguish', () => {
  assert.ok(ROWCAP_ORDERS.length >= ROWCAP_MIN_TOTAL_ORDERS,
    `${ROWCAP_ORDERS.length} orders < ${ROWCAP_MIN_TOTAL_ORDERS}`);
});

test('the customerProfile org alone exceeds the default cap of 5', () => {
  // The customerProfile scope is ORG-scoped, so a dashboard-sized set proves nothing there.
  assert.ok(rowcapOrdersForOrg(ROWCAP_PROFILE_ORG_KEY).length >= ROWCAP_MIN_ORDERS_IN_PROFILE_ORG);
});

test('the set spans >= 2 orgs so dashboard and customerProfile scopes differ', () => {
  assert.ok(rowcapOrgKeys().length >= 2);
});

test('statuses are >= 3 distinct and all render a tab (live filter-rule vocabulary)', () => {
  const s = rowcapStatuses();
  assert.ok(s.length >= ROWCAP_MIN_DISTINCT_STATUSES);
  for (const x of s) assert.ok(ROWCAP_STATUS_VOCABULARY.includes(x), `status "${x}" would render no tab`);
});

test('>= 6 distinct products appear in NON-cancelled orders so the Top-sellers cap bites', () => {
  // Non-cancelled specifically: excluding cancelled orders from top-seller aggregation is a
  // plausible backend behaviour, and the product count must not depend on that being false.
  assert.ok(rowcapTopSellerSlots().length >= ROWCAP_MIN_DISTINCT_PRODUCTS);
});

test('rowcapShortfalls actually detects an insufficient set (the guard is not vacuous)', () => {
  const tooFew = ROWCAP_ORDERS.slice(0, 2);
  const problems = rowcapShortfalls(tooFew);
  assert.ok(problems.length >= 3, `expected several shortfalls, got ${JSON.stringify(problems)}`);
  assert.ok(problems.some((p) => /distinct status/.test(p)));
  assert.ok(problems.some((p) => /product slot/.test(p)));
});

test('rowcapShortfalls rejects a status outside the live filter-rule vocabulary', () => {
  const bogus = ROWCAP_ORDERS.map((o, i) => (i === 0 ? { ...o, status: 'Shipped' } : o));
  assert.ok(rowcapShortfalls(bogus).some((p) => /"Shipped" is not in the live/.test(p)));
});

// ---- arithmetic + product slots --------------------------------------------

test('every order total equals the sum of its extended line prices', () => {
  for (const o of ROWCAP_ORDERS) {
    const want = o.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
    assert.ok(Math.abs(rowcapOrderTotal(o) - want) < 0.005, `${o.key}: ${rowcapOrderTotal(o)} != ${want}`);
    assert.ok(rowcapOrderTotal(o) > 0);
  }
});

test('requiredRowcapProductSlots covers the highest slot any line references', () => {
  const highest = Math.max(...ROWCAP_ORDERS.flatMap((o) => o.lines.map((l) => l.productSlot)));
  assert.equal(requiredRowcapProductSlots(), highest + 1);
});

test('buildRowcapItems maps slot -> discovered product, keeping spec quantity and price', () => {
  const products = Array.from({ length: requiredRowcapProductSlots() }, (_, i) => ({
    id: `p${i}`, sku: `SKU-${i}`, name: `Product ${i}`, catalogId: 'cat',
  }));
  const order = ROWCAP_ORDERS[0];
  const items = buildRowcapItems(order, products);
  assert.equal(items.length, order.lines.length);
  assert.equal(items[0].sku, `SKU-${order.lines[0].productSlot}`);
  assert.equal(items[0].quantity, order.lines[0].quantity);
  assert.equal(items[0].price, order.lines[0].unitPrice);
  assert.equal(items[0].currency, 'USD');
});

test('buildRowcapItems throws on an unsatisfied slot rather than collapsing two slots', () => {
  // Silently reusing one product would drop the distinct-product count and make the cap
  // unobservable again — exactly the failure this fixture set exists to remove.
  const order = ROWCAP_ORDERS.find((o) => o.lines.some((l) => l.productSlot > 0)) || ROWCAP_ORDERS[0];
  assert.throws(() => buildRowcapItems(order, []), /unsatisfied/);
});

// ---- containment: never touch the shared primary rep ------------------------

test('orders are attributed to the DISPOSABLE-layout rep, never the shared primary', () => {
  assert.equal(ROWCAP_REP_KEY, 'SR_REP_LAYOUT');
  assert.ok(isDisposableLayoutRep(ROWCAP_REP_KEY));
  assert.ok(!isDisposableLayoutRep('SR_REP_PRIMARY'));
});

test('every order is on the store the widgets query', () => {
  assert.equal(ROWCAP_STORE, 'B2B-store');
});

test('customer names are AGENT-TEST- prefixed for the sweep convention', () => {
  for (const key of rowcapOrgKeys()) assert.ok(rowcapCustomerName(key).startsWith('AGENT-TEST-'));
  assert.ok(rowcapCustomerName('UNKNOWN-ORG').startsWith('AGENT-TEST-'));
});

// ---- alias contract ---------------------------------------------------------

test('every owned alias is registered, keyed by business number, with no GUID and an empty id', () => {
  for (const alias of ROWCAP_OWNED_ALIASES) {
    const entry = aliases[alias];
    assert.ok(entry, `alias ${alias} missing from test-data/aliases.json`);
    assert.equal(entry.number, rowcapOrderNumber(ROWCAP_ALIASES[alias]));
    assert.equal(entry.id, '', 'the runtime id belongs in aliases.<env>.json (DV-021)');
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === 'string') assert.ok(!GUID_RE.test(v.trim()), `alias ${alias}.${k} carries a runtime GUID`);
    }
  }
});

test('every alias points at an order the spec actually creates', () => {
  for (const key of Object.values(ROWCAP_ALIASES)) {
    assert.ok(ROWCAP_ORDERS.some((o) => o.key === key), `alias target ${key} is not in ROWCAP_ORDERS`);
  }
});
