// Unit tests for scripts/seed-data/auth/otp-signin-specs.mjs — the DERIVATION only (VCST-5748):
// store-token resolution, the account body the seeder POSTs, and the live-state predicate
// (seededProblems) that decides whether an account is still armed and decidable. Declared data is
// the drift guard's job (validate-otp-signin-data.mjs), not this file's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_TOKEN, TRUSTED_TOKEN, accountBody, resolveStoreId, seededProblems,
} from '../seed-data/auth/otp-signin-specs.mjs';

const cust = (o) => ({ alias: 'X', email: 'agent-test-otp-x@example.test', userType: 'Customer', isAdministrator: false, hasContact: true, ...o });
const LOCK = cust({ kind: 'lockout', storeId: STORE_TOKEN });
const NOSTORE = cust({ kind: 'no-store', storeId: '' });
const TRUSTED = cust({ kind: 'trusted-store', storeId: TRUSTED_TOKEN });
const FOREIGN = cust({ kind: 'foreign-store', storeId: 'AGENT-TEST-NOWHERE' });
const ADMIN = { alias: 'A', email: 'a@x.test', kind: 'admin', userType: 'Administrator', isAdministrator: true, hasContact: false, storeId: '' };
const MGR = { alias: 'M', email: 'm@x.test', kind: 'manager', userType: 'Manager', isAdministrator: false, hasContact: false, storeId: '' };
const now = Date.parse('2026-09-30T12:00:00Z');
const ctx = { envStoreId: 'S1', trustedGroups: ['Partner'], now };
const armed = (over = {}) => ({ storeId: 'S1', userType: 'Customer', isAdministrator: false, memberId: 'm', lockoutEnabled: true,
  emailConfirmed: true, passwordExpired: false, lockoutEnd: null, accessFailedCount: 0, roles: [], ...over });

test('resolveStoreId: env token, live trusted store (never STORE_ID itself), literal, empty', () => {
  assert.equal(resolveStoreId(LOCK, 'S1'), 'S1');
  assert.equal(resolveStoreId(TRUSTED, 'S1', ['s1', 'Partner']), 'Partner');
  assert.equal(resolveStoreId(TRUSTED, 'S1', []), '');
  assert.equal(resolveStoreId(FOREIGN, 'S1', ['Partner']), 'AGENT-TEST-NOWHERE');
  assert.equal(resolveStoreId(NOSTORE, 'S1'), '');
});

test('accountBody: flags always armed; back-office account carries no member and no store', () => {
  const a = accountBody(TRUSTED, { envStoreId: 'S1', trustedGroups: ['Partner'], password: 'p', memberId: 'm' });
  assert.deepEqual([a.storeId, a.memberId, a.lockoutEnabled, a.emailConfirmed, a.passwordExpired], ['Partner', 'm', true, true, false]);
  const b = accountBody(ADMIN, { envStoreId: 'S1', password: 'p', memberId: 'leaked' });
  assert.deepEqual([b.memberId, b.storeId, b.userType, b.isAdministrator], [null, null, 'Administrator', true]);
});

test('seededProblems: armed lockout account is clean; each disarming state is reported', () => {
  assert.deepEqual(seededProblems(LOCK, armed(), ctx), []);
  // unlock leaves the platform's min date, which must read as unlocked (KB-B9D1132A)
  assert.deepEqual(seededProblems(LOCK, armed({ lockoutEnd: '0001-01-01T00:00:00+00:00' }), ctx), []);
  for (const over of [{ lockoutEnd: '2026-09-30T12:10:00Z' }, { accessFailedCount: 2 }, { lockoutEnabled: false },
    { storeId: 'Other' }, { passwordExpired: true }, { memberId: '' }]) {
    assert.equal(seededProblems(LOCK, armed(over), ctx).length, 1, JSON.stringify(over));
  }
});

test('seededProblems: trusted vs foreign store are complementary for the same live store id', () => {
  assert.deepEqual(seededProblems(TRUSTED, armed({ storeId: 'Partner' }), ctx), []);
  assert.equal(seededProblems(FOREIGN, armed({ storeId: 'Partner' }), ctx).length, 1);
  assert.deepEqual(seededProblems(FOREIGN, armed({ storeId: 'AGENT-TEST-NOWHERE' }), ctx), []);
  assert.equal(seededProblems(TRUSTED, armed({ storeId: 'AGENT-TEST-NOWHERE' }), ctx).length, 1);
  assert.equal(seededProblems(TRUSTED, armed({ storeId: 's1' }), ctx).length, 1);
  assert.equal(seededProblems(FOREIGN, armed({ storeId: null }), ctx).length, 1);
});

test('seededProblems: admin and manager branches', () => {
  const bo = (o) => armed({ storeId: null, memberId: '', ...o });
  assert.deepEqual(seededProblems(ADMIN, bo({ userType: 'Administrator', isAdministrator: true }), ctx), []);
  assert.equal(seededProblems(ADMIN, bo({ userType: 'Administrator', isAdministrator: false }), ctx).length, 1);
  assert.equal(seededProblems(ADMIN, bo({ userType: 'Administrator', isAdministrator: true, memberId: 'c' }), ctx).length, 1);
  assert.deepEqual(seededProblems(MGR, bo({ userType: 'Manager' }), ctx), []);
  assert.equal(seededProblems(MGR, bo({ userType: 'Manager', roles: [{ name: 'R' }] }), ctx).length, 1);
  assert.equal(seededProblems(MGR, null, ctx).length, 1);
});
