// The cross-plane check: a written claim that the contract refutes.
//
// It exists because of one entry. "An order cannot be deleted on this platform — only cancelled"
// rode through twelve runs, three run briefs and a controlled comparison while the derived plane
// published `DELETE /api/order/customerOrders` the whole time. The gate checked that entries were
// well-formed and that indexes matched their contents, and never that a written claim survived the
// contract sitting beside it.
//
// The tests below hold the two halves that matter: it catches that shape, and it stays quiet about
// everything else. A check that cried wolf would be switched off, and then the next false claim
// rides for another twelve runs.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contradictions } from '../src/contradiction.mjs';

const OPS = [
  { id: 'KB-ORDERS01', method: 'DELETE', route: '/api/order/customerorders', operationId: 'OrderModule_DeleteOrdersByIds' },
  { id: 'KB-ORDERS01', method: 'PUT', route: '/api/order/customerorders', operationId: 'OrderModule_UpdateOrder' },
  { id: 'KB-SHIP0001', method: 'PATCH', route: '/api/order/shipments/{id}', operationId: 'OrderModuleShipments_PatchShipment' },
  { id: 'KB-PROMO001', method: 'DELETE', route: '/api/marketing/promotions', operationId: 'MarketingModulePromotion_DeletePromotions' },
  { id: 'KB-STORES01', method: 'DELETE', route: '/api/stores', operationId: 'StoreModule_DeleteStore' },
];

test('the sentence that cost this project twelve runs is caught, and cites the operation that refutes it', () => {
  const found = contradictions('An order cannot be deleted once placed - only cancelled.', OPS);
  assert.equal(found.length, 1);
  assert.equal(found[0].coordinate, 'DELETE /api/order/customerorders');
  assert.equal(found[0].operationId, 'OrderModule_DeleteOrdersByIds');
});

test('three phrasings of the same claim are all caught', () => {
  for (const s of [
    'A promotion cannot be deleted once it has been used on an order.',
    'There is no way to delete a store through the API once products reference it.',
    "You can't delete a promotion that a live cart references.",
  ]) {
    assert.equal(contradictions(s, OPS).length, 1, s);
  }
});

// The first version cited `PATCH /api/order/shipments/{id}` here, because that route contains
// `order` too. A reader handed the wrong coordinate checks it, finds it irrelevant, and stops
// trusting the check.
test('the coordinate cited is the one that matches the object, not merely one that mentions it', () => {
  const found = contradictions('A customer order cannot be updated after it reaches Completed.', OPS);
  assert.equal(found.length, 1);
  assert.equal(found[0].coordinate, 'PUT /api/order/customerorders');
});

test('an impossibility the contract says nothing about is left alone', () => {
  for (const s of [
    'A shopper cannot rename their own organization from the storefront.',
    'The Active column cannot be sorted in the Admin members grid.',
    'A pending invitation cannot be resent from the roster.',
  ]) {
    assert.deepEqual(contradictions(s, OPS), [], s);
  }
});

test('a claim with no impossibility in it is left alone, however many coordinates it mentions', () => {
  assert.deepEqual(
    contradictions('Deleting an order removes it from the grid and from the count. Promotions are deleted the same way.', OPS),
    [],
  );
});

test('the object is taken from the same clause, not from three paragraphs away', () => {
  // `order` appears, and so does an impossibility — but they are about different things, and the
  // whole-body version of this matched them to each other.
  const body = 'A store cannot be renamed after products reference it.\n\nSeparately: an order carries a delete control in the Admin toolbar.';
  assert.deepEqual(contradictions(body, OPS), []);
});

test('nothing published means nothing to contradict, and no crash', () => {
  assert.deepEqual(contradictions('An order cannot be deleted.', []), []);
  assert.deepEqual(contradictions('', OPS), []);
  assert.deepEqual(contradictions(null, OPS), []);
});
