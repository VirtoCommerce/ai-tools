// Unit tests for the VCST-5683 Sales Rep dashboard singular/plural i18n fixture
// (sales-rep-i18n-plural-specs.mjs). Pure — no env, no network. Run: `npm test`
//
// The property under test throughout is EXACTLY-ONE. This fixture exists solely to make three
// dashboard counters read 1 so the SINGULAR i18n branch renders; a second order or a quantity of 2
// silently restores the plural branch and the locale sweep passes vacuously against the same
// unobserved code path it was written to exercise. Every assertion below is an acceptance criterion.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  I18N_ORDER_MARK, I18N_CART_MARK, I18N_ORDER, I18N_CART,
  I18N_REP_KEY, I18N_ORG_KEY, I18N_STORE, OWNED_ALIASES,
  I18N_ORDER_STATUS, DASHBOARD_NEW_ORDERS_FILTER,
  i18nOrderNumber, i18nCartName, orderTotal, lineExtended,
  requiredProductSlots, buildOrderItems, overshootErrors, GUID_RE,
} from '../seed-data/sales-rep/sales-rep-i18n-plural-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });

// ---- the exactly-one invariant (the whole point) ----------------------------

test('the spec set can produce a SINGULAR counter — no overshoot', () => {
  assert.deepEqual(overshootErrors(), []);
});

test('exactly one order line, of quantity exactly 1', () => {
  assert.equal(I18N_ORDER.lines.length, 1);
  assert.equal(I18N_ORDER.lines[0].quantity, 1);
});

test('the cart holds exactly one unit', () => {
  assert.equal(I18N_CART.quantity, 1);
});

test('order and cart target the SAME single org and the SAME single rep', () => {
  assert.equal(I18N_ORDER.orgKey, I18N_ORG_KEY);
  assert.equal(I18N_CART.orgKey, I18N_ORG_KEY);
  assert.equal(I18N_ORDER.repKey, I18N_REP_KEY);
  assert.equal(I18N_CART.repKey, I18N_REP_KEY);
});

// ---- the status <-> newOrdersFilter coupling (VCST-5683 regression) ---------

test('the order status is "New" — the literal the dashboard hardcodes as newOrdersFilter', () => {
  // Regression guard. The "New orders" tile and its placed_today sub-line call
  // period(filter: "New"); an order in any other status makes both read 0 while every UNFILTERED
  // period still reports 1 — which is exactly how this fixture first shipped broken.
  assert.equal(I18N_ORDER_STATUS, 'New');
  assert.equal(I18N_ORDER.status, 'New');
});

test('the seeded status and the dashboard filter are the SAME constant, not two literals', () => {
  assert.equal(I18N_ORDER.status, DASHBOARD_NEW_ORDERS_FILTER);
});

test('overshootErrors rejects a status that the newOrdersFilter would exclude', () => {
  const saved = I18N_ORDER.status;
  try {
    I18N_ORDER.status = 'Processing';
    assert.ok(overshootErrors().some((e) => /newOrdersFilter/.test(e)));
  } finally { I18N_ORDER.status = saved; }
  assert.deepEqual(overshootErrors(), []);
});

// ---- the rep must serve exactly ONE org, or the counters cannot read 1 -------

test(`${I18N_REP_KEY} serves EXACTLY the one org this fixture seeds`, () => {
  // If the rep served a second org, another org's orders/carts would land in the same dashboard
  // counters and the total could exceed 1 without this fixture changing at all.
  const rep = readCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === I18N_REP_KEY);
  assert.ok(rep, `${I18N_REP_KEY} must exist in sales-reps.csv`);
  const served = String(rep.served_orgs || '').split(';').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(served, [I18N_ORG_KEY]);
  assert.equal(rep.store, I18N_STORE);
  assert.equal(String(rep.seeded).toLowerCase(), 'true');
});

test('the target org is pinned in b2b/organizations.csv so the seeder can resolve it', () => {
  const org = readCsv('test-data/b2b/organizations.csv').find((r) => r.org_id === I18N_ORG_KEY);
  assert.ok(org, `${I18N_ORG_KEY} must exist in b2b/organizations.csv`);
  assert.match(org.platform_id, GUID_RE);
});

// ---- business keys + teardown sweepability ----------------------------------

test('order number and cart name are deterministic and AGENT-TEST- prefixed', () => {
  assert.equal(i18nOrderNumber('ACME3'), `${I18N_ORDER_MARK}-ACME3`);
  assert.equal(i18nCartName('ACME3'), `${I18N_CART_MARK}-ACME3`);
  assert.ok(i18nOrderNumber(I18N_ORDER.key).startsWith('AGENT-TEST-'));
  assert.ok(i18nCartName(I18N_CART.key).startsWith('AGENT-TEST-'));
});

test('the number space cannot collide with the sibling sales-rep fixtures', () => {
  // A shared number space would let this fixture's teardown sweep another suite's orders.
  for (const foreign of ['AGENT-TEST-SRO-STATS', 'AGENT-TEST-SRO-ROWCAP', 'AGENT-TEST-SRO-ACME']) {
    assert.ok(!i18nOrderNumber(I18N_ORDER.key).startsWith(foreign), `must not share the ${foreign} number space`);
    assert.ok(!foreign.startsWith(I18N_ORDER_MARK), `${foreign} must not fall inside this fixture's sweep`);
  }
  assert.ok(!i18nCartName(I18N_CART.key).startsWith('AGENT-TEST-SR-CART-ACME'));
});

// ---- no runtime GUID in the committed spec ----------------------------------

test('the committed spec carries NO runtime platform GUID (those live in aliases.<env>.json)', () => {
  const src = readFileSync(join(ROOT, 'scripts/seed-data/sales-rep/sales-rep-i18n-plural-specs.mjs'), 'utf8');
  const hits = src.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi) || [];
  assert.deepEqual(hits, [], `spec must carry no GUID, found: ${hits.join(', ')}`);
});

test('aliases are owned, unique and named for what they prove', () => {
  assert.deepEqual(OWNED_ALIASES, [I18N_ORDER.alias, I18N_CART.alias]);
  assert.equal(new Set(OWNED_ALIASES).size, OWNED_ALIASES.length);
});

// ---- arithmetic + line building ---------------------------------------------

test('order total is the extended line price', () => {
  assert.equal(lineExtended({ quantity: 1, unitPrice: 49 }), 49);
  assert.equal(orderTotal(), 49);
  assert.equal(orderTotal([{ quantity: 3, unitPrice: 1.115 }]), 3.35);
});

test('requiredProductSlots covers every slot the seeder indexes', () => {
  const max = Math.max(...I18N_ORDER.lines.map((l) => l.productSlot), I18N_CART.productSlot);
  assert.equal(requiredProductSlots(), max + 1);
});

test('buildOrderItems takes product IDENTITY from the env and quantity/price from the spec', () => {
  const products = [{ id: 'p-1', sku: 'SKU-1', name: 'Product One', catalogId: 'cat-1' }];
  const items = buildOrderItems(I18N_ORDER.lines, products);
  assert.equal(items.length, 1);
  assert.equal(items[0].sku, 'SKU-1');
  assert.equal(items[0].productId, 'p-1');
  assert.equal(items[0].catalogId, 'cat-1');
  assert.equal(items[0].quantity, 1);
  assert.equal(items[0].price, I18N_ORDER.lines[0].unitPrice);
});

test('buildOrderItems throws loudly on an unsatisfied slot rather than writing a productless order', () => {
  assert.throws(() => buildOrderItems(I18N_ORDER.lines, []), /productSlot 0 unsatisfied/);
});

// ---- the guard actually fires (a guard that cannot fail guards nothing) ------

test('overshootErrors detects a second order line', () => {
  const twoLines = [{ productSlot: 0, quantity: 1, unitPrice: 10 }, { productSlot: 1, quantity: 1, unitPrice: 10 }];
  const saved = I18N_ORDER.lines;
  try {
    I18N_ORDER.lines = twoLines;
    assert.ok(overshootErrors().some((e) => /exactly 1 order line/.test(e)));
  } finally { I18N_ORDER.lines = saved; }
  assert.deepEqual(overshootErrors(), []);
});

test('overshootErrors detects a quantity above 1', () => {
  const saved = I18N_CART.quantity;
  try {
    I18N_CART.quantity = 2;
    assert.ok(overshootErrors().some((e) => /cart quantity 1/.test(e)));
  } finally { I18N_CART.quantity = saved; }
  assert.deepEqual(overshootErrors(), []);
});

test('overshootErrors detects a drifted org or rep', () => {
  const savedOrg = I18N_CART.orgKey;
  try {
    I18N_CART.orgKey = 'ORG-002';
    assert.ok(overshootErrors().some((e) => /single served org/.test(e)));
  } finally { I18N_CART.orgKey = savedOrg; }
  const savedRep = I18N_ORDER.repKey;
  try {
    I18N_ORDER.repKey = 'SR_REP_PRIMARY';
    assert.ok(overshootErrors().some((e) => /single-org rep/.test(e)));
  } finally { I18N_ORDER.repKey = savedRep; }
  assert.deepEqual(overshootErrors(), []);
});
