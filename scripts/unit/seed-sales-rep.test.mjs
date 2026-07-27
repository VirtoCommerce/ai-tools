// Unit tests for the Sales-Rep credential self-heal (VCST-5406 SR drift fix).
// Covers the pure/importable surface: the resetSecurityPassword DI helper (seed-common) and the
// SALES_REP / SALES_REP_NOCUSTOMERS registry entries (user-roles). Pure — no env, no network (the
// api is a mock passed by DI). Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetSecurityPassword } from '../../scripts/lib/seed-common.mjs';
import { resolveRole, roleByKey } from '../../scripts/lib/user-roles.mjs';
import { roleUsers } from '../../scripts/lib/user-provision.mjs';

function apiSpy(response = { succeeded: true, errors: [] }) {
  const calls = [];
  const api = async (method, path, body, opts) => { calls.push({ method, path, body, opts }); return response; };
  return { api, calls };
}

test('resetSecurityPassword POSTs the admin reset endpoint with a camelCase body and returns true', async () => {
  const { api, calls } = apiSpy();
  const ok = await resetSecurityPassword(api, 'agent-test-sr-primary@example.com', 'S3cret!!');
  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  const c = calls[0];
  assert.equal(c.method, 'POST');
  assert.equal(c.path, '/api/platform/security/users/agent-test-sr-primary%40example.com/resetpassword');
  assert.equal(c.body.newPassword, 'S3cret!!');
  assert.equal(c.body.forcePasswordChangeOnNextSignIn, false, 'never forces a password change on next sign-in (runner logs in headless)');
  assert.deepEqual(c.opts, { expectStatus: [200] });
});

test('resetSecurityPassword reads success from the SecurityResult body (200 + succeeded:false → false, no throw)', async () => {
  const { api } = apiSpy({ succeeded: false, errors: [{ description: 'Password too weak' }] });
  const ok = await resetSecurityPassword(api, 'x@example.com', 'weak', { silent: true });
  assert.equal(ok, false, 'a 200 with succeeded:false is a failure, not a pass');
});

test('resetSecurityPassword is a no-op guard when userName or password is missing', async () => {
  const { api, calls } = apiSpy();
  assert.equal(await resetSecurityPassword(api, '', 'p'), false);
  assert.equal(await resetSecurityPassword(api, 'x@example.com', ''), false);
  assert.equal(calls.length, 0, 'never calls the API without both a userName and a password');
});

test('SALES_REP and SALES_REP_NOCUSTOMERS are org-kind roles keyed to TEST_USER_PASSWORD', () => {
  for (const key of ['SALES_REP', 'SALES_REP_NOCUSTOMERS']) {
    const def = roleByKey(key);
    assert.equal(def.passwordVar, 'TEST_USER_PASSWORD', `${key} resolves its secret from TEST_USER_PASSWORD`);
    assert.equal(def.kind, 'org', `${key} is an org account (created by seed-sales-rep, not the generic user seeders)`);
    assert.equal(def.required, false, `${key} is optional (module deployed only on QA envs)`);
  }
  const primary = resolveRole(roleByKey('SALES_REP'), { SALES_REP_EMAIL: 'p@ex.com', TEST_USER_PASSWORD: 'pw' });
  assert.equal(primary.email, 'p@ex.com');
  assert.equal(primary.password, 'pw');
  const nocust = resolveRole(roleByKey('SALES_REP_NOCUSTOMERS'), { SALES_REP_NOCUSTOMERS_EMAIL: 'n@ex.com', TEST_USER_PASSWORD: 'pw' });
  assert.equal(nocust.email, 'n@ex.com');
  assert.equal(nocust.password, 'pw');
});

test('the SR org-roles are NOT provisioned by the generic personal-user seeder (kind org is filtered out)', () => {
  const emails = roleUsers().map((u) => u.email.toLowerCase());
  assert.ok(!emails.includes('agent-test-sr-primary@example.com'), 'SR primary is not a personal customer role');
  assert.ok(!emails.includes('agent-test-sr-nocustomers@example.com'), 'SR nocustomers is not a personal customer role');
});
