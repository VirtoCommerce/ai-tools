// Unit tests for the credential-declaration guard (050m sales-rep audit, 2026-07-29):
//   • credential-specs.mjs — the pure declaration/conflict model behind td:validate:credentials
//   • user-provision.mjs   — password + stale-lockout RECONCILIATION on the existing-account path
// Pure/mocked — no env, no network. Run: `node --test scripts/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizePasswordRef, collectDeclarations, findPasswordConflicts,
  findDestructiveOverlaps, findUndeclaredVars, CSV_CREDENTIAL_SOURCES, DESTRUCTIVE_ROLE_KEYS,
} from '../seed-data/credential-specs.mjs';
import {
  __setApi, ensureSecurityAccount, passwordSource, isPasswordDeclared, hasStaleLockout,
} from '../lib/user-provision.mjs';

/* ── credential-specs: the pure model ─────────────────────────────────────── */

test('normalizePasswordRef canonicalises a password cell', () => {
  assert.equal(normalizePasswordRef('{{B2B_USER_PASSWORD}}'), 'var:B2B_USER_PASSWORD');
  assert.equal(normalizePasswordRef('{{ B2B_USER_PASSWORD }}'), 'var:B2B_USER_PASSWORD'); // tolerant of spaces
  assert.equal(normalizePasswordRef('Password1!'), 'literal');
  assert.equal(normalizePasswordRef(''), 'unset');
  assert.equal(normalizePasswordRef(undefined), 'unset');
});

test('collectDeclarations flattens CSV pairs + role entries, lowercasing emails', () => {
  const decls = collectDeclarations({
    csvFiles: [{ file: 'test-data/b2b/users.csv', rows: [{ user_id: 'USR-002', email: 'Sarah@Test.Local', password: '{{B2B_USER_PASSWORD}}' }] }],
    roleEntries: [{ key: 'LOCKOUT_TEST', email: 'sarah@test.local', passwordVar: 'LOCKOUT_TEST_PASSWORD' }],
  });
  assert.equal(decls.length, 2);
  assert.ok(decls.every((d) => d.email === 'sarah@test.local'), 'emails normalised for comparison');
  assert.equal(decls[0].origin, 'test-data/b2b/users.csv [USR-002]:password');
  assert.equal(decls[0].ref, 'var:B2B_USER_PASSWORD');
  assert.equal(decls[1].kind, 'role');
  assert.equal(decls[1].ref, 'var:LOCKOUT_TEST_PASSWORD');
});

test('collectDeclarations reads BOTH column pairs of a multi-account row (agent-user-pool)', () => {
  const src = CSV_CREDENTIAL_SOURCES.find((s) => s.file === 'test-data/users/agent-user-pool.csv');
  assert.equal(src.pairs.length, 2, 'agent-user-pool declares a personal AND a b2b login per row');
  const decls = collectDeclarations({
    csvFiles: [{ file: src.file, rows: [{ slot: '1', personal_email: 'p@t.local', personal_password: '{{A}}', b2b_email: 'b@t.local', b2b_password: '{{B}}' }] }],
  });
  assert.deepEqual(decls.map((d) => d.email).sort(), ['b@t.local', 'p@t.local']);
});

test('findPasswordConflicts flags the same account declared with different vars', () => {
  const decls = collectDeclarations({
    csvFiles: [{ file: 'test-data/b2b/users.csv', rows: [{ user_id: 'USR-002', email: 'a@t.local', password: '{{B2B_USER_PASSWORD}}' }] }],
    roleEntries: [{ key: 'LOCKOUT_TEST', email: 'a@t.local', passwordVar: 'LOCKOUT_TEST_PASSWORD' }],
  });
  const found = findPasswordConflicts(decls);
  assert.equal(found.length, 1);
  assert.equal(found[0].email, 'a@t.local');
  assert.deepEqual(found[0].refs.sort(), ['var:B2B_USER_PASSWORD', 'var:LOCKOUT_TEST_PASSWORD']);
});

test('findPasswordConflicts: agreeing declarations and blank cells are NOT conflicts', () => {
  const agree = collectDeclarations({
    csvFiles: [{ file: 'test-data/b2b/users.csv', rows: [{ user_id: 'USR-001', email: 'a@t.local', password: '{{P}}' }] }],
    roleEntries: [{ key: 'USER', email: 'a@t.local', passwordVar: 'P' }],
  });
  assert.deepEqual(findPasswordConflicts(agree), [], 'same var from two sources is fine');

  const blank = collectDeclarations({
    csvFiles: [{ file: 'test-data/b2b/users.csv', rows: [{ user_id: 'USR-001', email: 'a@t.local', password: '' }] }],
    roleEntries: [{ key: 'USER', email: 'a@t.local', passwordVar: 'P' }],
  });
  assert.deepEqual(findPasswordConflicts(blank), [], 'an undeclared (blank) cell never conflicts');
});

test('findDestructiveOverlaps flags a lockout role sharing an account, even when passwords agree', () => {
  const decls = collectDeclarations({
    csvFiles: [{ file: 'test-data/b2b/users.csv', rows: [{ user_id: 'USR-002', email: 'shared@t.local', password: '{{P}}' }] }],
    roleEntries: [{ key: 'LOCKOUT_TEST', email: 'shared@t.local', passwordVar: 'P' }],
  });
  assert.deepEqual(findPasswordConflicts(decls), [], 'passwords agree, so no password conflict');
  const found = findDestructiveOverlaps(decls);
  assert.equal(found.length, 1, 'the lockout side-effect alone makes the sharing illegal');
  assert.equal(found[0].roleKey, 'LOCKOUT_TEST');
  assert.equal(found[0].sharedWith[0].origin, 'test-data/b2b/users.csv [USR-002]:password');
});

test('findDestructiveOverlaps is clean when the destructive role owns a dedicated account', () => {
  const decls = collectDeclarations({
    csvFiles: [{ file: 'test-data/b2b/users.csv', rows: [{ user_id: 'USR-002', email: 'buyer@t.local', password: '{{P}}' }] }],
    roleEntries: [{ key: 'LOCKOUT_TEST', email: 'agent-test-lockout@t.local', passwordVar: 'LOCKOUT_TEST_PASSWORD' }],
  });
  assert.deepEqual(findDestructiveOverlaps(decls), []);
  assert.ok(DESTRUCTIVE_ROLE_KEYS.includes('LOCKOUT_TEST'), 'LOCKOUT_TEST is registered as destructive');
});

test('findUndeclaredVars reports {{VAR}} tokens with no documented variable', () => {
  const decls = collectDeclarations({
    csvFiles: [{ file: 'test-data/b2b/users.csv', rows: [
      { user_id: 'U1', email: 'a@t.local', password: '{{KNOWN_PW}}' },
      { user_id: 'U2', email: 'b@t.local', password: '{{TYPOD_PW}}' },
      { user_id: 'U3', email: 'c@t.local', password: 'literal' },
    ] }],
  });
  const found = findUndeclaredVars(decls, ['KNOWN_PW']);
  assert.equal(found.length, 1);
  assert.equal(found[0].varName, 'TYPOD_PW');
});

/* ── user-provision: password source + reconciliation ─────────────────────── */

test('passwordSource / isPasswordDeclared separate a real credential from the fallback', () => {
  process.env.__TP_DECLARED = 'Real1!';
  assert.deepEqual(passwordSource('{{__TP_DECLARED}}'), { kind: 'env', varName: '__TP_DECLARED' });
  assert.deepEqual(passwordSource('{{__TP_UNSET__}}'), { kind: 'fallback', varName: '__TP_UNSET__' });
  assert.deepEqual(passwordSource('Literal1!'), { kind: 'literal', varName: null });
  assert.deepEqual(passwordSource(''), { kind: 'fallback', varName: null });
  assert.equal(isPasswordDeclared('{{__TP_DECLARED}}'), true);
  // The load-bearing case: an unset var resolves to PW_FALLBACK, so it must NOT be reconciled onto
  // a live account — otherwise seeding from an unconfigured machine rewrites every password.
  assert.equal(isPasswordDeclared('{{__TP_UNSET__}}'), false);
  delete process.env.__TP_DECLARED;
});

test('hasStaleLockout: future lockout or failed attempts on a non-Locked fixture is stale', () => {
  const now = Date.parse('2026-07-29T12:00:00Z');
  const future = { lockoutEnd: '2026-07-29T12:30:00Z', accessFailedCount: 0 };
  const past = { lockoutEnd: '2026-07-29T11:00:00Z', accessFailedCount: 0 };
  assert.equal(hasStaleLockout(future, 'Approved', now), true);
  assert.equal(hasStaleLockout({ accessFailedCount: 2 }, 'Approved', now), true, 'failed-attempt counters count as residue');
  assert.equal(hasStaleLockout(past, 'Approved', now), false, 'an expired lockout with no counters is clean');
  assert.equal(hasStaleLockout({}, 'Approved', now), false);
  // A Locked fixture is SUPPOSED to be locked — never "healed".
  assert.equal(hasStaleLockout(future, 'Locked', now), false);
  assert.equal(hasStaleLockout({ lockoutEnd: '9999-12-31T23:59:59Z' }, 'Locked', now), false);
});

function makeApiMock(seedUser) {
  const calls = [];
  const usersByEmail = new Map();
  if (seedUser) usersByEmail.set(seedUser.email.toLowerCase(), seedUser);
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path.includes('/security/users/search')) {
      const u = usersByEmail.get((body?.keyword || '').toLowerCase());
      return { results: u ? [u] : [] };
    }
    if (method === 'GET' && path.includes('/security/users/')) {
      const seg = decodeURIComponent(path.split('/').pop());
      return usersByEmail.get(seg.toLowerCase()) || [...usersByEmail.values()].find((u) => u.id === seg) || null;
    }
    if (method === 'POST' && path.includes('/security/users/create')) {
      usersByEmail.set((body.email || '').toLowerCase(), { id: 'u-new', userName: body.userName, email: body.email, roles: [] });
      return { succeeded: true, errors: [] };
    }
    // Model the MEASURED platform contract (vcst 2026-09-02), not a convenient fiction:
    // `PUT /security/users` persists every field EXCEPT `lockoutEnd`, which it silently discards
    // in both directions while returning `{ succeeded: true }`. Mocking the PUT as able to clear a
    // lockout is what let a repair that changes nothing on a real environment ship green.
    if (method === 'PUT' && path.endsWith('/security/users')) {
      const stored = [...usersByEmail.values()].find((u) => u.id === body?.id);
      if (stored) {
        const { lockoutEnd: _discarded, ...persisted } = body || {};
        Object.assign(stored, persisted);
      }
      return { succeeded: true, errors: [] };
    }
    // `POST /security/users/{id}/lock|/unlock` is the only pair that moves `lockoutEnd`.
    const lockMatch = /\/security\/users\/([^/]+)\/(lock|unlock)$/.exec(path);
    if (method === 'POST' && lockMatch) {
      const stored = [...usersByEmail.values()].find((u) => u.id === lockMatch[1]);
      if (stored) stored.lockoutEnd = lockMatch[2] === 'lock' ? '9999-12-31T23:59:59Z' : null;
      return { succeeded: true, errors: [] };
    }
    return null;
  };
  return { api, calls };
}
const lockCall = (calls, verb) => calls.find((c) => c.method === 'POST' && new RegExp(`/${verb}$`).test(c.path));
const resetCall = (calls) => calls.find((c) => c.path.includes('/resetpassword'));
const putCall = (calls) => calls.find((c) => c.method === 'PUT' && c.path.endsWith('/security/users'));

test('ensureSecurityAccount RECONCILES a drifted password on an existing account', async () => {
  // The 050m regression: an account created before its {{VAR}} was set kept the fallback password
  // forever, because the reuse path was create-only for the credential.
  const user = { id: 'u-1', email: 'drifted@agent-test.local', userName: 'drifted@agent-test.local', memberId: 'contact-1', roles: [] };
  const { api, calls } = makeApiMock(user);
  __setApi(api);
  const id = await ensureSecurityAccount(user.email, 'Declared1!', 'contact-1', 'Approved', { reconcilePassword: true });
  assert.equal(id, 'u-1', 'still reuses the existing account');
  const reset = resetCall(calls);
  assert.ok(reset, 'issues a resetpassword for the declared value');
  assert.equal(reset.body.newPassword, 'Declared1!');
  assert.equal(reset.body.forcePasswordChangeOnNextSignIn, false, 'headless runners cannot answer a change-password prompt');
});

test('ensureSecurityAccount does NOT touch the password when reconcilePassword is off', async () => {
  const user = { id: 'u-2', email: 'untouched@agent-test.local', userName: 'untouched@agent-test.local', memberId: 'contact-2', roles: [] };
  const { api, calls } = makeApiMock(user);
  __setApi(api);
  await ensureSecurityAccount(user.email, 'Password1!', 'contact-2', 'Approved');
  assert.equal(resetCall(calls), undefined, 'default is the previous create-only behaviour (back-compat)');
});

test('ensureSecurityAccount clears a stale lockout on a reused Approved account', async () => {
  const user = {
    id: 'u-3', email: 'locked-out@agent-test.local', userName: 'locked-out@agent-test.local',
    memberId: 'contact-3', roles: [], lockoutEnd: '9999-01-01T00:00:00Z', lockoutEnabled: true, accessFailedCount: 3,
  };
  const { api, calls } = makeApiMock(user);
  __setApi(api);
  await ensureSecurityAccount(user.email, 'Declared1!', 'contact-3', 'Approved', { reconcilePassword: true });
  const put = putCall(calls);
  assert.ok(put, 'writes the cleared state back');
  // The fields the PUT genuinely persists.
  assert.equal(put.body.lockoutEnabled, false);
  assert.equal(put.body.accessFailedCount, 0);
  // `lockoutEnd` is NOT assertable from the PUT body — the platform discards it there. The repair
  // has to go through POST /unlock, and the only proof it worked is the persisted entity.
  assert.ok(lockCall(calls, 'unlock'), 'must POST /users/{id}/unlock — a PUT cannot clear a lockout');
  assert.equal(user.lockoutEnd, null, 'the account must actually end up unlocked');
});

test('a residual status:Locked is stale even when lockoutEnd is already clear', () => {
  // The two halves of a lock are written by different endpoints, so a run that applied one and
  // failed before the other leaves a residue. Keying staleness on lockoutEnd alone made that
  // residue invisible to every self-heal path AND to --unlock's idempotency short-circuit.
  assert.equal(
    hasStaleLockout({ lockoutEnd: null, accessFailedCount: 0, status: 'Locked' }, 'Approved'),
    true,
  );
  // ...but a fixture that is MEANT to be locked is still never "healed".
  assert.equal(
    hasStaleLockout({ lockoutEnd: null, accessFailedCount: 0, status: 'Locked' }, 'Locked'),
    false,
  );
  // A genuinely clean account is not stale.
  assert.equal(
    hasStaleLockout({ lockoutEnd: null, accessFailedCount: 0, status: 'Approved' }, 'Approved'),
    false,
  );
});

test('ensureSecurityAccount restores the status half of a residual lock', async () => {
  const user = {
    id: 'u-3b', email: 'residual-status@agent-test.local', userName: 'residual-status@agent-test.local',
    memberId: 'contact-3b', roles: [], lockoutEnd: null, lockoutEnabled: false, accessFailedCount: 0,
    status: 'Locked',
  };
  const { api, calls } = makeApiMock(user);
  __setApi(api);
  await ensureSecurityAccount(user.email, 'Declared1!', 'contact-3b', 'Approved', { reconcilePassword: true });
  const put = putCall(calls);
  assert.ok(put, 'the status half is only repairable through the PUT');
  assert.equal(put.body.status, 'Approved');
  assert.equal(user.status, 'Approved', 'the residue must not survive a reseed');
});

test('ensureSecurityAccount keeps a Locked fixture locked (does not "heal" the intended state)', async () => {
  const user = {
    id: 'u-4', email: 'blocked-target@agent-test.local', userName: 'blocked-target@agent-test.local',
    memberId: 'contact-4', roles: [], lockoutEnd: '9999-12-31T23:59:59Z', lockoutEnabled: true,
  };
  const { api, calls } = makeApiMock(user);
  __setApi(api);
  await ensureSecurityAccount(user.email, 'Declared1!', 'contact-4', 'Locked', { reconcilePassword: true });
  const put = putCall(calls);
  assert.ok(!put || put.body.lockoutEnd === '9999-12-31T23:59:59Z', 'lockout preserved');
});
