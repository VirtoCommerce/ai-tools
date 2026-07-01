// Unit tests for the NEW behavior in scripts/lib/user-provision.mjs (VCST-5406 consolidation):
//   • status-aware account create — Locked → lockoutEnd 9999 + lockoutEnabled; EmailUnconfirmed → emailConfirmed:false
//   • contact groups (loyalty VIP/Wholesale) flow onto the personal contact body
//   • allSeededEmails covers ALL sources (b2b/users.csv + organization-memberships.csv + personal)
//     — the coverage that makes the unified teardown gap-free.
// Pure/mocked — no env, no network. Run: `node --test scripts/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  __setApi, statusFlags, ensureSecurityAccount, ensurePersonalAccount, allSeededEmails, resolvePassword,
} from '../../scripts/lib/user-provision.mjs';

function makeApiMock() {
  const calls = [];
  const usersByEmail = new Map();
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path.includes('/security/users/search')) {
      const u = usersByEmail.get((body?.keyword || '').toLowerCase());
      return { results: u ? [u] : [] };
    }
    if (method === 'GET' && path.includes('/security/users/')) {
      const seg = decodeURIComponent(path.split('/').pop());
      return usersByEmail.get(seg.toLowerCase()) || [...usersByEmail.values()].find(u => u.id === seg) || null;
    }
    if (method === 'POST' && path.includes('/security/users/create')) {
      usersByEmail.set((body.email || '').toLowerCase(), { id: 'u-' + (usersByEmail.size + 1), userName: body.userName, email: body.email, roles: [] });
      return { succeeded: true, errors: [] };
    }
    if (method === 'POST' && path.endsWith('/api/members')) return { id: 'contact-1' };
    return null;
  };
  return { api, calls };
}

test('resolvePassword: {{VAR}} resolves from env, literal passes through, fallback on missing', () => {
  process.env.__TP_TEST = 'FromEnv1!';
  assert.equal(resolvePassword('{{__TP_TEST}}'), 'FromEnv1!');
  assert.equal(resolvePassword('{{ __TP_TEST }}'), 'FromEnv1!');           // tolerant of spaces
  assert.equal(resolvePassword('LiteralPass1!'), 'LiteralPass1!');         // back-compat literal
  assert.equal(resolvePassword('{{__TP_MISSING__}}', 'fb!'), 'fb!');       // unset → fallback
  delete process.env.__TP_TEST;
});

test('statusFlags maps CSV status → account flags', () => {
  assert.deepEqual(statusFlags('Locked'), { status: 'Locked', emailConfirmed: true, lockoutEnabled: true, lockoutEnd: '9999-12-31T23:59:59Z' });
  assert.equal(statusFlags('EmailUnconfirmed').emailConfirmed, false);
  assert.equal(statusFlags('Pending').emailConfirmed, false);
  assert.equal(statusFlags('Approved').status, 'Approved');
  assert.equal(statusFlags(undefined).status, 'Approved');
});

test('ensureSecurityAccount create carries Locked flags (impersonation-blocked target)', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  await ensureSecurityAccount('blocked@test.local', 'Password1!', 'contact-x', 'Locked');
  const create = calls.find(c => c.path.includes('/security/users/create'));
  assert.equal(create.body.lockoutEnabled, true);
  assert.equal(create.body.lockoutEnd, '9999-12-31T23:59:59Z');
  assert.ok(!create.body.roles || create.body.roles.length === 0, 'still no global roles');
});

test('ensureSecurityAccount create carries emailConfirmed:false (invited target)', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  await ensureSecurityAccount('invited@test.local', 'Password1!', 'contact-y', 'EmailUnconfirmed');
  const create = calls.find(c => c.path.includes('/security/users/create'));
  assert.equal(create.body.emailConfirmed, false);
});

test('ensurePersonalAccount tags the contact with a customer group (loyalty)', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  await ensurePersonalAccount({ email: 'vip@test.local', password: 'x', first: 'V', last: 'IP', group: 'VIP' });
  const contact = calls.find(c => c.method === 'POST' && c.path.endsWith('/api/members'));
  assert.deepEqual(contact.body.groups, ['VIP'], 'loyalty contact carries its group');
});

test('allSeededEmails covers b2b/users.csv + memberships.csv + personal (no teardown gap)', () => {
  const emails = allSeededEmails().map(e => e.toLowerCase());
  // b2b/users.csv (an org buyer)
  assert.ok(emails.includes('test-john.mitchell-20260310@test-agent.com'), 'includes b2b/users.csv accounts');
  // impersonation targets (b2b/users.csv)
  assert.ok(emails.includes('agent-test-imp-target-many-orgs-20260514@test-agent.com'), 'includes imp targets');
  // organization-memberships.csv (cross-org member)
  assert.ok(emails.includes('agent-test-multiorg-20260615@yopmail.com'), 'includes cross-org members');
  // personal (agent pool)
  assert.ok(emails.some(e => /^qa-agent-slot\d@/.test(e)), 'includes personal accounts');
  assert.equal(new Set(emails).size, emails.length, 'deduped');
});
