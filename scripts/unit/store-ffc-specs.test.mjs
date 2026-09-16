// Unit tests for scripts/seed-data/store/store-ffc-specs.mjs — the decision logic behind
// `td:reconcile` check [12] (store ↔ fulfillment-center scope).
//
// These exist because the FAILING states cannot be reproduced live without mutating a shared QA
// store's configuration (clearing a store's FFC set breaks every cart on the env for everyone using
// it). The live run can only ever demonstrate the healthy branch, so the branches that actually
// matter — the ones that blocked suites 042 and 078 on REG-2026-08-17-1030 — are pinned here.
//
// Pure — no env, no network. Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyStoreFfc, isBlockingStoreFfc, describeStoreFfc,
} from '../seed-data/store/store-ffc-specs.mjs';

const LIVE = new Set(['ffc-main', 'ffc-west', 'ffc-central']);

test('healthy store: main FFC live + additional assigned', () => {
  const r = classifyStoreFfc(
    { mainFulfillmentCenterId: 'ffc-main', additionalFulfillmentCenterIds: ['ffc-west'] }, LIVE);
  assert.equal(r.status, 'ok');
  assert.equal(isBlockingStoreFfc(r.status), false);
  assert.deepEqual(r.danglingAdditional, []);
});

test('a main FFC with NO additional centers is still healthy', () => {
  const r = classifyStoreFfc({ mainFulfillmentCenterId: 'ffc-main', additionalFulfillmentCenterIds: [] }, LIVE);
  assert.equal(r.status, 'ok');
});

// The exact REG-2026-08-17-1030 shape: B2B-store on vcptcore-qa.
test('REGRESSION: empty FFC set is BLOCKING — this is what returned PRODUCT_FFC_QTY for every product', () => {
  const r = classifyStoreFfc({ mainFulfillmentCenterId: null, additionalFulfillmentCenterIds: [] }, LIVE);
  assert.equal(r.status, 'none');
  assert.equal(isBlockingStoreFfc(r.status), true);
  const msg = describeStoreFfc(r.status, { storeId: 'B2B-store', testEnv: 'vcptcore' });
  // The message must name the symptom an operator will actually have seen, and the repair.
  assert.match(msg, /PRODUCT_FFC_QTY/);
  assert.match(msg, /npm run seed:store/);
  assert.match(msg, /TEST_ENV=vcptcore/);
});

test('a missing store payload field is treated as empty, not as healthy', () => {
  // A store GET that omits the keys entirely must not read as "configured".
  const r = classifyStoreFfc({}, LIVE);
  assert.equal(r.status, 'none');
  assert.equal(isBlockingStoreFfc(r.status), true);
});

test('additional centers but no main is BLOCKING and reports its own repair', () => {
  const r = classifyStoreFfc({ mainFulfillmentCenterId: null, additionalFulfillmentCenterIds: ['ffc-west'] }, LIVE);
  assert.equal(r.status, 'no-main');
  assert.equal(isBlockingStoreFfc(r.status), true);
  assert.match(describeStoreFfc(r.status, { storeId: 'B2B-store', testEnv: 'vcst', additionalCount: 1 }), /1 additional/);
});

// A deleted main FFC still LOOKS configured in the store payload but behaves like the empty case.
test('dangling main FFC is BLOCKING and is NOT collapsed into the empty case', () => {
  const r = classifyStoreFfc(
    { mainFulfillmentCenterId: 'ffc-deleted', additionalFulfillmentCenterIds: ['ffc-west'] }, LIVE);
  assert.equal(r.status, 'dangling-main');
  assert.equal(isBlockingStoreFfc(r.status), true);
  const msg = describeStoreFfc(r.status, { storeId: 'B2B-store', testEnv: 'vcptcore', main: 'ffc-deleted' });
  assert.match(msg, /ffc-deleted/);
  assert.match(msg, /not a live fulfillment center/);
  // Distinct wording from the empty case — otherwise an operator is pointed at the wrong diagnosis.
  assert.equal(/has NO fulfillment centers/.test(msg), false);
});

test('dangling ADDITIONAL centers are non-blocking while the main FFC is live', () => {
  const r = classifyStoreFfc(
    { mainFulfillmentCenterId: 'ffc-main', additionalFulfillmentCenterIds: ['ffc-west', 'ffc-gone'] }, LIVE);
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.danglingAdditional, ['ffc-gone']);
});

test('falsy ids in the additional list are ignored, not counted as centers', () => {
  const r = classifyStoreFfc({ mainFulfillmentCenterId: null, additionalFulfillmentCenterIds: ['', null] }, LIVE);
  assert.equal(r.status, 'none');
});

test('accepts a plain iterable of live ids, not just a Set', () => {
  const r = classifyStoreFfc({ mainFulfillmentCenterId: 'ffc-main' }, ['ffc-main']);
  assert.equal(r.status, 'ok');
});
