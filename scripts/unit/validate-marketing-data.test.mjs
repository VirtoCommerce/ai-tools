/**
 * Unit tests for the marketing (promotion/coupon) drift-guard pure helpers.
 * Logic-only — no filesystem, no network (the helpers are exported side-effect-free
 * from validate-marketing-data.mjs). Guards the VCST-5233 CPN-062 case-fidelity
 * invariant: a lowercase coupon whose uppercase twin is NOT another coupon.
 *
 * Run:  npm test   (tsx --test)
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COUPON_CODE_RE, GUID_RE, hasLowercaseLetter, upperTwinCollision,
  findBadCouponCodes, findGuidLeaks,
} from '../seed-data/promotions/validate-marketing-data.mjs';

test('COUPON_CODE_RE accepts alphanumeric, rejects hyphen/space/symbol', () => {
  assert.ok(COUPON_CODE_RE.test('agenttestlc062'));
  assert.ok(COUPON_CODE_RE.test('SUPER'));
  assert.ok(COUPON_CODE_RE.test('VALID10'));
  assert.ok(!COUPON_CODE_RE.test('EXPIRED-TEST')); // hyphen (pre-migration form)
  assert.ok(!COUPON_CODE_RE.test('QA MAXED'));     // space
  assert.ok(!COUPON_CODE_RE.test('CAT20#%$'));     // symbols
});

test('hasLowercaseLetter — the /[a-z]/ display/case-fidelity gate', () => {
  assert.ok(hasLowercaseLetter('agenttestlc062'));
  assert.ok(hasLowercaseLetter('super'));
  assert.ok(hasLowercaseLetter('Valid10'));
  assert.ok(!hasLowercaseLetter('SUPER'));
  assert.ok(!hasLowercaseLetter('VALID10'));
  assert.ok(!hasLowercaseLetter('AGENTTESTLC062'));
});

test('upperTwinCollision — the new code is collision-free', () => {
  // The whole point of CPN-062: agenttestlc062 uppercases to AGENTTESTLC062,
  // which is NOT another coupon → null (safe, deterministic invalid signal).
  const codes = ['agenttestlc062', 'SUPER', 'VALID10', 'QA', 'winegift'];
  assert.equal(upperTwinCollision('agenttestlc062', codes), null);
});

test('upperTwinCollision — reproduces the super/SUPER confound', () => {
  // The bug this alias replaces: uppercasing 'super' hits the unrelated 'SUPER'.
  const codes = ['super', 'SUPER', 'agenttestlc062'];
  assert.equal(upperTwinCollision('super', codes), 'SUPER');
});

test('upperTwinCollision — an all-uppercase code is not a lowercase-stored case', () => {
  const codes = ['SUPER', 'super'];
  assert.equal(upperTwinCollision('SUPER', codes), null); // already uppercase → not applicable
});

test('findBadCouponCodes flags non-alphanumeric rows only', () => {
  const rows = [
    { coupon_id: 'COU-A', code: 'agenttestlc062' },
    { coupon_id: 'COU-B', code: 'BAD-CODE' },
    { coupon_id: 'COU-C', code: '' },           // blank ignored
    { coupon_id: 'COU-D', code: 'ok123' },
  ];
  const bad = findBadCouponCodes(rows);
  assert.deepEqual(bad.map((b) => b.coupon_id), ['COU-B']);
});

test('findGuidLeaks catches a runtime GUID in any cell', () => {
  const clean = [{ coupon_id: 'COU-027', code: 'agenttestlc062', promo_id: 'P21' }];
  assert.equal(findGuidLeaks(clean, 'coupon_id').length, 0);
  const dirty = [{ coupon_id: 'COU-X', code: 'x', platform_id: '3803a743-1780-476e-ab4e-4c6e92de475b' }];
  const leaks = findGuidLeaks(dirty, 'coupon_id');
  assert.equal(leaks.length, 1);
  assert.equal(leaks[0].col, 'platform_id');
  assert.ok(GUID_RE.test(leaks[0].value));
});
