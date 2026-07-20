// Unit tests for the order-state fixtures + orders-specs.mjs pure logic (VCST-5482).
// Pure — no env, no network. Run: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORDER_FIXTURES, orderNumber, ORDER_MARK,
  resolveTokens, finalizeOrderBody, applyCatalogItems,
  validateFixtureShape, findGuidLeaks,
} from '../seed-data/orders/orders-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const loadFixture = (rel) => JSON.parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'));

test('orderNumber builds a deterministic AGENT-TEST-ORD key', () => {
  assert.equal(orderNumber('COMPLETED'), `${ORDER_MARK}-COMPLETED`);
});

test('resolveTokens substitutes {{VAR}} from env and reports what is missing', () => {
  const { obj, unresolved } = resolveTokens(
    { a: '{{STORE_ID}}', nested: { b: 'x-{{USER_EMAIL}}-y', c: '{{MISSING}}' }, keep: 'plain', n: 5 },
    { STORE_ID: 'B2B-store', USER_EMAIL: 'buyer@test.local' },
  );
  assert.equal(obj.a, 'B2B-store');
  assert.equal(obj.nested.b, 'x-buyer@test.local-y');
  assert.equal(obj.nested.c, '{{MISSING}}', 'unknown token left in place');
  assert.equal(obj.keep, 'plain');
  assert.equal(obj.n, 5);
  assert.deepEqual(unresolved, ['MISSING']);
});

test('resolveTokens does not mutate the input object', () => {
  const input = { a: '{{STORE_ID}}' };
  resolveTokens(input, { STORE_ID: 'B2B-store' });
  assert.equal(input.a, '{{STORE_ID}}');
});

test('finalizeOrderBody stamps status + owner and zeroes shipment/payment monetary totals', () => {
  const spec = ORDER_FIXTURES.find((s) => s.key === 'COMPLETED');
  const fixture = {
    number: orderNumber('COMPLETED'), status: 'PLACEHOLDER',
    items: [{ sku: 'X', quantity: 1, price: 10 }],
    shipments: [{ status: 'New', price: 5, total: 5, totalWithTax: 5 }],
    inPayments: [{ status: 'New', sum: 10, total: 10 }],
  };
  const body = finalizeOrderBody(spec, fixture, { customerId: 'user-1', customerName: 'Buyer', organizationId: 'org-1' });
  assert.equal(body.status, spec.orderStatus, 'status comes from the spec, not the fixture placeholder');
  assert.equal(body.customerId, 'user-1');
  assert.equal(body.shipments[0].status, spec.shipmentStatus);
  assert.equal(body.shipments[0].total, 0, 'shipment monetary total zeroed (order-total inflation lesson)');
  assert.equal(body.inPayments[0].total, 0);
  assert.equal(body.inPayments[0].sum, 10, 'payment sum (the real amount) preserved');
  assert.equal(body.inPayments[0].customerId, 'user-1');
});

test('applyCatalogItems overlays real product identity but keeps quantity/price', () => {
  const fixture = { items: [
    { sku: 'PLACEHOLDER-1', productId: 'p1', name: 'ph1', quantity: 2, price: 25, currency: 'USD' },
    { sku: 'PLACEHOLDER-2', productId: 'p2', name: 'ph2', quantity: 1, price: 30, currency: 'USD' },
  ] };
  const products = [{ id: 'real-1', sku: 'REAL-SKU-1', name: 'Real 1', catalogId: 'cat-1' }];
  const out = applyCatalogItems(fixture, products);
  assert.equal(out.items[0].productId, 'real-1');
  assert.equal(out.items[0].sku, 'REAL-SKU-1');
  assert.equal(out.items[0].name, 'Real 1');
  assert.equal(out.items[0].catalogId, 'cat-1');
  assert.equal(out.items[0].quantity, 2, 'quantity kept from fixture');
  assert.equal(out.items[0].price, 25, 'price kept from fixture');
  assert.equal(out.items[1].productId, 'real-1', 'products cycle when fewer than items');
});

test('applyCatalogItems with no products keeps the fixture placeholders untouched', () => {
  const fixture = { items: [{ sku: 'PLACEHOLDER', productId: 'p', name: 'ph', quantity: 1, price: 1 }] };
  const out = applyCatalogItems(fixture, []);
  assert.equal(out.items[0].sku, 'PLACEHOLDER');
});

test('findGuidLeaks detects a bare GUID anywhere in the object tree', () => {
  const leaks = findGuidLeaks({ ok: 'AGENT-TEST', items: [{ productId: '0b6297e8-d100-4419-ac54-8bf240777271' }] });
  assert.equal(leaks.length, 1);
  assert.match(leaks[0].path, /items\[0\]\.productId/);
});

test('every committed order fixture passes validateFixtureShape (spec ↔ fixture in sync)', () => {
  for (const spec of ORDER_FIXTURES) {
    const obj = loadFixture(spec.fixtureFile);
    const { ok, problems } = validateFixtureShape(spec, obj, 'order');
    assert.ok(ok, `${spec.alias}: ${problems.join('; ')}`);
  }
});

test('validateFixtureShape rejects a status that drifts from the spec', () => {
  const spec = ORDER_FIXTURES.find((s) => s.key === 'COMPLETED');
  const obj = { ...loadFixture(spec.fixtureFile), status: 'WrongStatus' };
  const { ok, problems } = validateFixtureShape(spec, obj, 'order');
  assert.equal(ok, false);
  assert.ok(problems.some((p) => p.includes('status')));
});

test('validateFixtureShape rejects a runtime GUID leaked into a fixture', () => {
  const spec = ORDER_FIXTURES.find((s) => s.key === 'COMPLETED');
  const obj = loadFixture(spec.fixtureFile);
  obj.items[0].productId = '0b6297e8-d100-4419-ac54-8bf240777271';
  const { ok, problems } = validateFixtureShape(spec, obj, 'order');
  assert.equal(ok, false);
  assert.ok(problems.some((p) => p.includes('GUID')));
});
