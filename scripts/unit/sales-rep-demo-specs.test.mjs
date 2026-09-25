/**
 * Unit tests for scripts/seed-data/sales-rep/sales-rep-demo-specs.mjs — the DERIVATIONS only.
 *
 * The declarations in that module (DEMO_ORGS, DEMO_CONTACTS, DEMO_DOCUMENTS, …) are deliberately NOT
 * tested here: a test asserting that Northwind is in Seattle restates a literal one file away, in the
 * same commit, and can only fail when someone edits the data on purpose. `td:validate:sales-rep-demo`
 * owns that contract — it calls `demoProblems()` and adds the GUID, upload-file, credential-token and
 * ledger-key checks a unit test cannot make (.claude/rules/test-data.md FOURTH RULE,
 * .claude/knowledge/execution/test-data-authoring.md §7a).
 *
 * What is left is the code whose output nobody wrote down: the money split, the marker codec, the
 * teardown scope predicate, the order-number hash, the product filter, and the order body builder.
 * Each of those fails silently when wrong — a drifting split rebuilds every order on every reseed, a
 * broken marker codec makes the dataset undeletable, a non-zero shipment total inflates order.Total —
 * and none of them is caught by any drift guard, because the guard checks the DATA, not the transform.
 *
 * Pure logic only: no network, no env, no fs.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEMO_MARKER_PREFIX, DEMO_MARKER_MAX_LENGTH, DEMO_CURRENCY, DEMO_STORE,
  DEMO_ORDERS, DEMO_ORGS, DEMO_CONTACTS, DEMO_REPS,
  demoMarker, isDemoMarker, demoMarkerKey, markerSweepInScope,
  splitTotal, demoOrderNumber, isDemoSafeProduct, buildDemoOrderBody, productNeedByOrg,
  orgByKey, contactByKey, repByKey, ordersInPostOrder, resolveTaskText,
} from '../seed-data/sales-rep/sales-rep-demo-specs.mjs';

/** Key lists are DERIVED from the declared rows — these tests assert the lookup, never the contents. */
const DEMO_ORGS_KEYS = DEMO_ORGS.map((o) => o.key);
const DEMO_CONTACT_KEYS = DEMO_CONTACTS.map((c) => c.key);
const DEMO_REP_KEYS = DEMO_REPS.map((r) => r.key);

/** Sum in integer cents — floating-point addition is exactly what the split has to survive. */
const cents = (xs) => xs.reduce((a, b) => a + Math.round(b * 100), 0);

// ---- splitTotal ------------------------------------------------------------

test('splitTotal: the parts sum EXACTLY to the total, including the uneven divisions', () => {
  // 200/3 is the documented failure case: an even split gives 66.67 x 3 = 200.01, the platform
  // recomputes order.Total to the drifted figure, and a content-based idempotency check then
  // rebuilds the order on every single reseed.
  for (const [total, n] of [[200, 3], [4820, 4], [940, 3], [3175.20, 4]]) {
    const parts = splitTotal(total, n);
    assert.equal(parts.length, n, `${total}/${n}: expected ${n} parts`);
    assert.equal(cents(parts), Math.round(total * 100), `${total}/${n}: parts ${JSON.stringify(parts)} do not sum to ${total}`);
    for (const p of parts) assert.equal(p, Math.round(p * 100) / 100, `${total}/${n}: ${p} is not a 2-dp money value`);
  }
});

test('splitTotal: the rounding remainder lands on the FIRST element, never spread or dropped', () => {
  const parts = splitTotal(200, 3);
  // 200/3 -> 66.67 per tail element; the first absorbs the -0.01 difference.
  const [first, ...tail] = parts;
  assert.ok(tail.every((p) => p === tail[0]), `tail should be uniform, got ${JSON.stringify(tail)}`);
  assert.ok(first !== tail[0], 'this division has a remainder, so the first element must differ from the tail');
  assert.equal(Math.round(first * 100), Math.round(total100(200) - tail.length * Math.round(tail[0] * 100)));

  // 940/3 rounds the other way (313.33 per tail, remainder ADDED to the first) — the sign of the
  // remainder must not be assumed.
  const [firstUp, ...tailUp] = splitTotal(940, 3);
  assert.ok(firstUp > tailUp[0], `940/3 should put the surplus on the first element, got ${firstUp} vs ${tailUp[0]}`);
  assert.equal(cents([firstUp, ...tailUp]), 94000);

  function total100(t) { return Math.round(t * 100); }
});

test('splitTotal: an even division leaves every element identical', () => {
  assert.deepEqual(splitTotal(4820, 4), [1205, 1205, 1205, 1205]);
  assert.deepEqual(splitTotal(3175.20, 4), [793.8, 793.8, 793.8, 793.8]);
});

test('splitTotal: a degenerate count still returns one part carrying the whole total', () => {
  for (const n of [1, 0, -2, undefined, null, NaN]) {
    const parts = splitTotal(1265.50, n);
    assert.equal(parts.length, 1, `n=${n} should collapse to a single line, not ${parts.length}`);
    assert.equal(cents(parts), 126550, `n=${n} must still carry the full total`);
  }
});

// ---- marker codec ----------------------------------------------------------

test('demoMarker / isDemoMarker / demoMarkerKey round-trip', () => {
  for (const [type, key] of [['ORG', 'DORG-NORTHWIND'], ['CT', 'DCT-NW-1'], ['ORD', 'DORD-WT-02']]) {
    const m = demoMarker(type, key);
    assert.ok(isDemoMarker(m), `${m} should be recognised as ours`);
    assert.equal(demoMarkerKey(m), key, `${m} should decode back to ${key}`);
    assert.ok(m.length <= DEMO_MARKER_MAX_LENGTH, `${m} exceeds the OuterId column length`);
  }
});

test('demoMarkerKey: a key containing the separator survives the round-trip', () => {
  // The codec joins the tail back together rather than taking split()[2] — otherwise a key with a
  // colon would decode to a truncated prefix, and teardown would silently match nothing.
  const m = demoMarker('ORD', 'DORD:WT:02');
  assert.equal(demoMarkerKey(m), 'DORD:WT:02');
});

test('isDemoMarker is FALSE for the AGENT-TEST family and for everything else', () => {
  // This is the whole reason the prefix is DEMO-SR and not AGENT-TEST: sweepAgentTestMembers()
  // enumerates by the literal 'AGENT-TEST-' keyword, so an overlap would let a b2b teardown that
  // never mentioned the demo delete it.
  for (const v of ['AGENT-TEST-x', 'AGENT-TEST-Org-AcmeCorp-20260310', '', '   ', null, undefined, 0,
    'DEMO-SR', 'demo-sr:ORD:x', 'X-DEMO-SR:ORD:x']) {
    assert.equal(isDemoMarker(v), false, `${JSON.stringify(v)} must not be treated as a demo marker`);
    assert.equal(demoMarkerKey(v), null, `${JSON.stringify(v)} must not decode to a key`);
  }
  assert.ok(!DEMO_MARKER_PREFIX.includes('AGENT-TEST'));
});

test('demoMarkerKey: a marker with an EMPTY key decodes to null, not to ""', () => {
  // A falsy-but-present key would make markerSweepInScope('…::') compare '' against `only` and,
  // under an unscoped sweep, delete an entity nothing can name.
  assert.equal(demoMarkerKey(`${DEMO_MARKER_PREFIX}:ORD:`), null);
});

test('isDemoMarker tolerates surrounding whitespace, as the platform round-trips it', () => {
  assert.equal(isDemoMarker(`  ${demoMarker('ORG', 'DORG-CONTOSO')}  `), true);
  assert.equal(demoMarkerKey(`  ${demoMarker('ORG', 'DORG-CONTOSO')}  `), 'DORG-CONTOSO');
});

// ---- markerSweepInScope ----------------------------------------------------

test('markerSweepInScope: unscoped run sweeps every marker of ours and nothing else', () => {
  assert.equal(markerSweepInScope(demoMarker('ORD', 'DORD-NW-01'), undefined), true);
  assert.equal(markerSweepInScope(demoMarker('ORG', 'DORG-FABRIKAM'), null), true);
  assert.equal(markerSweepInScope(demoMarker('CT', 'DCT-CN-2'), ''), true);
  // Not ours — an unscoped sweep must still not touch it.
  assert.equal(markerSweepInScope('AGENT-TEST-something', undefined), false);
  assert.equal(markerSweepInScope('', undefined), false);
  assert.equal(markerSweepInScope(null, undefined), false);
});

test('markerSweepInScope: a --only run sweeps the matching key', () => {
  assert.equal(markerSweepInScope(demoMarker('ORD', 'DORD-CN-03'), 'DORD-CN-03'), true);
});

test('markerSweepInScope: a --only run leaves NON-matching keys alone', () => {
  // The expensive direction. An unscoped marker sweep during a scoped teardown deletes fixtures the
  // operator explicitly asked to keep, and nothing reports it — the entities are simply gone.
  assert.equal(markerSweepInScope(demoMarker('ORD', 'DORD-CN-03'), 'DORD-NW-01'), false);
  assert.equal(markerSweepInScope(demoMarker('ORG', 'DORG-WINGTIP'), 'DORG-CONTOSO'), false);
  // A prefix of the real key is not the real key.
  assert.equal(markerSweepInScope(demoMarker('ORD', 'DORD-CN-03'), 'DORD-CN'), false);
  // A non-marker value stays out of scope whatever `only` says.
  assert.equal(markerSweepInScope('AGENT-TEST-Org', 'DORD-CN-03'), false);
});

// ---- demoOrderNumber -------------------------------------------------------

test('demoOrderNumber: deterministic across calls and free of any family prefix', () => {
  for (const o of DEMO_ORDERS) {
    const a = demoOrderNumber(o.key);
    assert.equal(a, demoOrderNumber(o.key), `${o.key} is not stable across calls — a reseed would create a duplicate order`);
    assert.match(a, /^SO-\d{6}$/, `${o.key} -> "${a}" is not a plausible 6-digit sales-order number`);
    assert.doesNotMatch(a, /AGENT-TEST/i);
  }
});

test('demoOrderNumber: distinct across every declared order', () => {
  // A collision does not error anywhere: the second POST simply updates the first order, so a
  // customer silently loses a row from their history.
  const numbers = DEMO_ORDERS.map((o) => demoOrderNumber(o.key));
  assert.equal(new Set(numbers).size, numbers.length, `collision in ${JSON.stringify(numbers)}`);
});

test('demoOrderNumber: different keys hash to different numbers (the hash is not a constant)', () => {
  const sample = ['A', 'B', 'DORD-X-01', 'DORD-X-02', 'DORD-Y-01'];
  assert.equal(new Set(sample.map(demoOrderNumber)).size, sample.length);
});

// ---- isDemoSafeProduct -----------------------------------------------------

test('isDemoSafeProduct accepts a real catalog product', () => {
  assert.equal(isDemoSafeProduct({ id: 'p1', sku: 'ST-4410', name: 'Stainless Steel Fastener Kit' }), true);
  // `code` is an accepted alternative to `sku` — discovery returns either.
  assert.equal(isDemoSafeProduct({ id: 'p1', code: 'CBL-220', name: 'Armoured Cable 25m' }), true);
});

test('isDemoSafeProduct rejects fixture products on name, sku OR code', () => {
  // Note on `DRY-`: the pattern is `\bDRY-\b`, so it matches a HYPHENATED token ("DRY-RUN") and not
  // a trailing "DRY- " — the word boundary after the hyphen needs a word character. Asserted as it
  // behaves, not as it reads.
  for (const bad of ['AGENT-TEST-Cordless Drill', 'AGENT-TEST-Gloves Winter', 'agent-test-lowercase', 'TEST-AGENT-Reversed', 'DRY-RUN leftover']) {
    assert.equal(isDemoSafeProduct({ id: 'p1', sku: 'OK-1', name: bad }), false, `name "${bad}" should be rejected`);
    assert.equal(isDemoSafeProduct({ id: 'p1', sku: bad, name: 'Innocuous' }), false, `sku "${bad}" should be rejected`);
    assert.equal(isDemoSafeProduct({ id: 'p1', code: bad, name: 'Innocuous' }), false, `code "${bad}" should be rejected`);
  }
});

test('isDemoSafeProduct rejects an unusable discovery result rather than passing it through', () => {
  // A product with no id or no sku/code cannot be put on a line item at all; letting it through
  // produces an order whose lines reference nothing.
  for (const p of [null, undefined, {}, { id: 'p1' }, { sku: 'S-1' }, { id: '', sku: 'S-1', name: 'X' }]) {
    assert.equal(isDemoSafeProduct(p), false, `${JSON.stringify(p)} should not be demo-safe`);
  }
});

// ---- buildDemoOrderBody ----------------------------------------------------

const ORG = orgByKey('DORG-NORTHWIND');
const CONTACT = contactByKey('DCT-NW-1');
const CTX = { org: ORG, contact: CONTACT, orgId: 'org-runtime-id', customerId: 'cust-runtime-id' };
const PRODUCTS = [
  { id: 'p1', sku: 'ST-1', catalogId: 'cat', name: 'Steel Plate' },
  { id: 'p2', sku: 'ST-2', catalogId: 'cat', name: 'Steel Rod' },
];

test('buildDemoOrderBody: the line prices sum to the declared total, with and without products', () => {
  for (const spec of DEMO_ORDERS) {
    for (const products of [[], PRODUCTS]) {
      const body = buildDemoOrderBody(spec, { ...CTX, products });
      assert.equal(body.items.length, spec.items, `${spec.key}: wrong line count`);
      assert.equal(
        cents(body.items.map((i) => i.price * i.quantity)), Math.round(spec.total * 100),
        `${spec.key} (${products.length} product(s)): lines sum to ${body.items.reduce((a, i) => a + i.price * i.quantity, 0)}, declared ${spec.total}`,
      );
      assert.equal(body.total, spec.total);
      assert.equal(body.currency, DEMO_CURRENCY);
      assert.equal(body.storeId, DEMO_STORE);
    }
  }
});

test('buildDemoOrderBody: the hidden teardown marker is set on the order', () => {
  // The marker in outerId is one of exactly two teardown handles this dataset has; an order without
  // it is invisible to the orphan sweep and survives every teardown.
  const spec = DEMO_ORDERS[0];
  const body = buildDemoOrderBody(spec, { ...CTX, products: PRODUCTS });
  assert.ok(isDemoMarker(body.outerId), `outerId "${body.outerId}" is not a demo marker`);
  assert.equal(demoMarkerKey(body.outerId), spec.key);
  assert.equal(body.number, demoOrderNumber(spec.key));
});

test('buildDemoOrderBody: shipment and payment MONETARY totals are zero, payment.sum carries the amount', () => {
  // Load-bearing zeroing. The platform's total calculator folds shipment/payment totals back into
  // order.Total, so a non-zero shipment total silently inflates the order above the declared figure
  // — and then the idempotency comparison never matches and the order is rebuilt on every reseed.
  for (const spec of DEMO_ORDERS) {
    const body = buildDemoOrderBody(spec, { ...CTX, products: PRODUCTS });

    const ship = body.shipments[0];
    for (const f of ['price', 'priceWithTax', 'total', 'totalWithTax']) {
      assert.equal(ship[f], 0, `${spec.key}: shipment.${f} must be 0, got ${ship[f]}`);
    }
    const pay = body.inPayments[0];
    for (const f of ['price', 'priceWithTax', 'total', 'totalWithTax']) {
      assert.equal(pay[f], 0, `${spec.key}: payment.${f} must be 0, got ${pay[f]}`);
    }
    assert.equal(pay.sum, spec.total, `${spec.key}: payment.sum must carry the order amount`);

    assert.equal(body.shippingTotal, 0);
    assert.equal(body.shippingTotalWithTax, 0);
    assert.equal(body.taxTotal, 0);
  }
});

test('buildDemoOrderBody: the order is wired to the runtime org and customer ids it was given', () => {
  const spec = DEMO_ORDERS[0];
  const body = buildDemoOrderBody(spec, { ...CTX, products: PRODUCTS });
  assert.equal(body.organizationId, 'org-runtime-id');
  assert.equal(body.customerId, 'cust-runtime-id');
  assert.equal(body.shipments[0].organizationId, 'org-runtime-id');
  assert.equal(body.inPayments[0].customerId, 'cust-runtime-id');
  // Both addresses are built from the SAME org/contact, and both are populated: an order whose
  // shipTo has no city renders as a visibly empty cell on the rep dashboard.
  const [shipAddr, billAddr] = body.addresses;
  assert.equal(shipAddr.addressType, 'Shipping');
  assert.equal(billAddr.addressType, 'Billing');
  for (const a of [shipAddr, billAddr]) {
    assert.ok(a.city && a.regionName && a.countryCode, `address is missing locality fields: ${JSON.stringify(a)}`);
    assert.equal(a.email, CONTACT.email);
  }
});

test('buildDemoOrderBody: products are cycled, never exhausted, when fewer than the line count', () => {
  // Order DORD-NW-03 declares 5 lines; two products must cover them all rather than yielding
  // undefined lines when the pool runs short.
  const spec = DEMO_ORDERS.find((o) => o.items > PRODUCTS.length);
  const body = buildDemoOrderBody(spec, { ...CTX, products: PRODUCTS });
  assert.equal(body.items.length, spec.items);
  for (const item of body.items) {
    assert.ok(PRODUCTS.some((p) => p.id === item.productId), `line references an unknown product: ${JSON.stringify(item)}`);
    assert.ok(item.name && item.sku, 'a line item must carry a name and a sku');
  }
});

// ---- key lookups -----------------------------------------------------------

test('orgByKey / contactByKey / repByKey return the ROW WITH THAT KEY, not merely a row', () => {
  // The failure this catches is a matcher inverted or loosened into `find(() => true)`: every
  // lookup then returns the FIRST row, every order is built against the wrong organization, and
  // nothing complains — `demoProblems()` only asks whether the lookup found *something*. The demo
  // would ship with Fabrikam's orders addressed to Northwind.
  for (const key of DEMO_ORGS_KEYS) assert.equal(orgByKey(key).key, key, `orgByKey(${key}) returned the wrong row`);
  for (const key of DEMO_CONTACT_KEYS) assert.equal(contactByKey(key).key, key, `contactByKey(${key}) returned the wrong row`);
  for (const key of DEMO_REP_KEYS) assert.equal(repByKey(key).key, key, `repByKey(${key}) returned the wrong row`);
});

test('orgByKey / contactByKey / repByKey return null for an unknown key', () => {
  // `undefined` from Array.find would break the seeder's `|| null` contract and turn a typo into a
  // TypeError three calls later instead of a reported miss.
  for (const fn of [orgByKey, contactByKey, repByKey]) {
    assert.equal(fn('NO-SUCH-KEY'), null);
    assert.equal(fn(''), null);
    assert.equal(fn(undefined), null);
  }
});

test('every order resolves to its OWN org and buyer', () => {
  for (const o of DEMO_ORDERS) {
    assert.equal(orgByKey(o.org).key, o.org, `${o.key} resolved to the wrong org`);
    assert.equal(contactByKey(o.buyer).key, o.buyer, `${o.key} resolved to the wrong buyer`);
    // And the buyer belongs to that order's organization — a cross-wired pair seeds fine and puts
    // one customer's employee on another customer's order.
    assert.equal(contactByKey(o.buyer).org, o.org, `${o.key}: buyer ${o.buyer} is not a member of ${o.org}`);
  }
});

// ---- productNeedByOrg ------------------------------------------------------

test('productNeedByOrg: sums the item counts per organization', () => {
  const orders = [
    { key: 'A1', org: 'ORG-X', items: 3 },
    { key: 'A2', org: 'ORG-X', items: 2 },
    { key: 'B1', org: 'ORG-Y', items: 5 },
  ];
  assert.deepEqual(productNeedByOrg(orders), { 'ORG-X': 5, 'ORG-Y': 5 });
});

test('productNeedByOrg: an empty order set needs nothing, and the default is the declared set', () => {
  assert.deepEqual(productNeedByOrg([]), {});
  const byDefault = productNeedByOrg();
  const byArgument = productNeedByOrg(DEMO_ORDERS);
  assert.deepEqual(byDefault, byArgument, 'the default argument must be the declared order set');
  // Cross-check the total against an independent reduction over the same rows.
  const totalNeed = Object.values(byDefault).reduce((a, b) => a + b, 0);
  assert.equal(totalNeed, DEMO_ORDERS.reduce((a, o) => a + o.items, 0));
  // Every org that has an order appears; the count is the seeder's per-customer discovery budget,
  // so a dropped key means that customer's orders silently fall back to placeholder lines.
  assert.deepEqual(new Set(Object.keys(byDefault)), new Set(DEMO_ORDERS.map((o) => o.org)));
});

// ---- ordersInPostOrder -----------------------------------------------------

test('ordersInPostOrder: ascending seq, non-destructive, and every order kept', () => {
  // createdDate is server-assigned, so POST order is the ONLY lever on relative recency — the row
  // meant to read as a customer's latest has to be posted last.
  const before = DEMO_ORDERS.map((o) => o.key);
  const sorted = ordersInPostOrder();
  assert.equal(sorted.length, DEMO_ORDERS.length);
  for (let i = 1; i < sorted.length; i += 1) {
    assert.ok(sorted[i].seq >= sorted[i - 1].seq, `seq went backwards at ${sorted[i].key}`);
  }
  assert.deepEqual(DEMO_ORDERS.map((o) => o.key), before, 'ordersInPostOrder() must not mutate DEMO_ORDERS');
});

test('resolveTaskText: an order token becomes the number the order is posted with', () => {
  const orders = [{ key: 'DORD-X-01' }];
  assert.equal(resolveTaskText('Chase {{order:DORD-X-01}} today', orders), `Chase ${demoOrderNumber('DORD-X-01')} today`);
});

test('resolveTaskText: an unknown order key is left in place for demoProblems to report', () => {
  assert.equal(resolveTaskText('See {{order:NOPE}}', [{ key: 'DORD-X-01' }]), 'See {{order:NOPE}}');
  assert.equal(resolveTaskText(undefined), '');
});
