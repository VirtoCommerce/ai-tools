// Unit tests for scripts/seed-data/auth/otp-signin-specs.mjs — the DERIVATION only (VCST-5748):
// store-token resolution, the account body the seeder POSTs, and the live-state predicate
// (seededProblems) that decides whether an account is still armed and decidable. Declared data is
// the drift guard's job (validate-otp-signin-data.mjs), not this file's.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  STORE_TOKEN, TRUSTED_TOKEN, accountBody, resolveStoreId, seededProblems, planScope,
} from '../seed-data/auth/otp-signin-specs.mjs';

const cust = (o) => ({ alias: 'X', email: 'agent-test-otp-x@example.test', userType: 'Customer', isAdministrator: false, hasContact: true, ...o });
const LOCK = cust({ kind: 'lockout', storeId: STORE_TOKEN });
const NOSTORE = cust({ kind: 'no-store', storeId: '' });
const TRUSTED = cust({ kind: 'trusted-store', storeId: TRUSTED_TOKEN });
const FOREIGN = cust({ kind: 'foreign-store', storeId: 'AGENT-TEST-NOWHERE' });
const BLOCKED = cust({ kind: 'blocked', storeId: STORE_TOKEN });
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

test('accountBody: flags always armed; an empty store is sent as null', () => {
  const a = accountBody(TRUSTED, { envStoreId: 'S1', trustedGroups: ['Partner'], password: 'p', memberId: 'm' });
  assert.deepEqual([a.storeId, a.memberId, a.lockoutEnabled, a.emailConfirmed, a.passwordExpired, a.status], ['Partner', 'm', true, true, false, 'Approved']);
  assert.equal(accountBody(NOSTORE, { envStoreId: 'S1', password: 'p', memberId: 'm' }).storeId, null);
});

test('seededProblems: armed lockout account is clean; each disarming state is reported', () => {
  assert.deepEqual(seededProblems(LOCK, armed(), ctx), []);
  // unlock leaves the platform's min date, which must read as unlocked (KB-B9D1132A)
  assert.deepEqual(seededProblems(LOCK, armed({ lockoutEnd: '0001-01-01T00:00:00+00:00' }), ctx), []);
  for (const over of [{ lockoutEnd: '2026-09-30T12:10:00Z' }, { accessFailedCount: 2 }, { lockoutEnabled: false },
    { storeId: 'Other' }, { passwordExpired: true }, { memberId: '' }, { status: 'Rejected' }]) {
    assert.equal(seededProblems(LOCK, armed(over), ctx).length, 1, JSON.stringify(over));
  }
  // a blocked CONTACT refuses too, and --verify-only must say so instead of printing ✓
  assert.equal(seededProblems(LOCK, armed({ status: 'Approved' }), { ...ctx, member: { memberType: 'Contact', status: 'Blocked' } }).length, 1);
  assert.deepEqual(seededProblems(LOCK, armed({ status: 'Approved' }), { ...ctx, member: { memberType: 'Contact', status: 'Approved' } }), []);
});

test('seededProblems: the blocked-account fixture must sit on STORE_ID', () => {
  assert.deepEqual(seededProblems(BLOCKED, armed(), ctx), []);
  assert.equal(seededProblems(BLOCKED, armed({ storeId: 'Partner' }), ctx).length, 1);
});

test('seededProblems: trusted vs foreign store are complementary for the same live store id', () => {
  assert.deepEqual(seededProblems(TRUSTED, armed({ storeId: 'Partner' }), ctx), []);
  assert.equal(seededProblems(FOREIGN, armed({ storeId: 'Partner' }), ctx).length, 1);
  assert.deepEqual(seededProblems(FOREIGN, armed({ storeId: 'AGENT-TEST-NOWHERE' }), ctx), []);
  assert.equal(seededProblems(TRUSTED, armed({ storeId: 'AGENT-TEST-NOWHERE' }), ctx).length, 1);
  assert.equal(seededProblems(TRUSTED, armed({ storeId: 's1' }), ctx).length, 1);
  assert.equal(seededProblems(FOREIGN, armed({ storeId: null }), ctx).length, 1);
});

test('planScope: seed and verify share one scope — opt-in only via --only, undecidable trusted skipped', () => {
  const T = { ...TRUSTED, alias: 'T', key: 'TK' };
  const OPT = { ...NOSTORE, alias: 'A', optIn: true };
  const all = [LOCK, T, OPT];
  const names = (r) => [r.active.map((s) => s.alias), r.skipped.map((s) => s.alias)];
  assert.deepEqual(names(planScope(all, { envStoreId: 'S1', trustedGroups: ['Partner'] })), [['X', 'T'], []]);
  assert.deepEqual(names(planScope(all, { envStoreId: 'S1', trustedGroups: ['S1'] })), [['X'], ['T']]);
  assert.deepEqual(names(planScope(all, { only: 'A', envStoreId: 'S1' })), [['A'], []]);
  assert.deepEqual(names(planScope(all, { only: 'TK', envStoreId: 'S1', trustedGroups: [] })), [[], ['T']]);
});
