// Unit tests for scripts/seed-data/seed-b2b-fixtures.mjs — codifies the invariants we verified by hand:
//   • roles are ORG-SCOPED only — the security-account body never carries global roles
//   • find-or-create REUSES an existing membership (no duplicate)
//   • provisioning a contact's login NEVER creates a second contact (the dedupe bug)
//   • roles.csv name→id mapping + CSV quoting
// Pure/mocked — no env, no Docker, no network. Run: `node --test tests/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  __setApi, parseCsv, roleIdByName,
  ensureSecurityAccount, ensureOrgMembership, provisionContactLogins,
} from '../../scripts/lib/user-provision.mjs';

// A recording mock of the seeder's HTTP layer. Routes by (method, path) and records every call
// so tests can assert what was (and wasn't) sent.
function makeApiMock() {
  const calls = [];
  const usersByEmail = new Map(); // email → { id, userName, roles:[] } (populated on create)
  let memId = 0;
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    // security users search — return the user only after it's been created
    if (method === 'POST' && path.includes('/security/users/search')) {
      const email = (body?.keyword || '').toLowerCase();
      const u = usersByEmail.get(email);
      return { results: u ? [u] : [] };
    }
    if (method === 'GET' && path.includes('/security/users/')) {
      const seg = decodeURIComponent(path.split('/').pop());
      const byEmail = usersByEmail.get(seg.toLowerCase());
      if (byEmail) return byEmail;
      for (const u of usersByEmail.values()) if (u.id === seg) return u;
      return null;
    }
    if (method === 'POST' && path.includes('/security/users/create')) {
      usersByEmail.set((body.email || '').toLowerCase(), { id: 'user-' + (usersByEmail.size + 1), userName: body.userName, roles: [] });
      return { succeeded: true, errors: [] };
    }
    if (method === 'PUT' && path.includes('/security/users')) return null;
    if (method === 'POST' && path.includes('/organization-memberships/search')) return { results: [] };
    if (method === 'POST' && path.includes('/customer/organization-memberships')) return { id: 'mem-' + (++memId) };
    if (method === 'PUT' && path.includes('/customer/organization-memberships')) return null;
    if (method === 'POST' && path.endsWith('/api/members')) return { id: 'SHOULD-NOT-HAPPEN' }; // a contact create
    return null;
  };
  return { api, calls };
}

test('roleIdByName maps role NAMEs (from roles.csv) to ids', () => {
  assert.equal(roleIdByName('Organization maintainer'), 'org-maintainer');
  assert.equal(roleIdByName('Purchasing agent'), 'purchasing-agent');
  assert.equal(roleIdByName('Organization employee'), 'org-employee');
  assert.equal(roleIdByName('org-maintainer'), 'org-maintainer'); // id passes through
  assert.equal(roleIdByName('Nonexistent role'), null);
});

test('parseCsv handles quoted fields containing commas', () => {
  const rows = parseCsv('a,b,c\n1,"x, y, z",3\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].b, 'x, y, z');
  assert.equal(rows[0].c, '3');
});

test('ensureSecurityAccount creates a login with NO global roles, memberId → the contact', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  const userId = await ensureSecurityAccount('buyer@test.local', 'Password1!', 'contact-XYZ');
  const create = calls.find(c => c.method === 'POST' && c.path.includes('/security/users/create'));
  assert.ok(create, 'should create the security account');
  assert.equal(create.body.memberId, 'contact-XYZ', 'account must link to the seeded contact');
  assert.ok(!create.body.roles || create.body.roles.length === 0, 'account body must NOT carry global roles');
  assert.equal(create.body.userType, 'Customer');
  assert.ok(userId, 'returns the resolved user id');
});

test('ensureOrgMembership REUSES an existing matching membership (no duplicate create)', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  const existing = [{ id: 'mem-existing', organizationId: 'org-1', roles: [{ roleId: 'org-employee' }] }];
  const id = await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', existing);
  assert.equal(id, 'mem-existing');
  assert.equal(calls.filter(c => c.method === 'POST' && c.path.endsWith('/customer/organization-memberships')).length, 0,
    'must NOT create a new membership when one already matches');
});

test('ensureOrgMembership CREATES when none exists', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  const id = await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', []);
  const created = calls.filter(c => c.method === 'POST' && c.path.endsWith('/customer/organization-memberships'));
  assert.equal(created.length, 1, 'creates exactly one membership');
  assert.equal(created[0].body.userId, 'user-1');
  assert.equal(created[0].body.organizationId, 'org-1');
  assert.equal(created[0].body.roles[0].roleId, 'org-employee');
  assert.ok(id);
});

test('ensureOrgMembership creates a LOCKED membership when locked=true (org-scoped block)', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', [], true);
  const created = calls.find(c => c.method === 'POST' && c.path.endsWith('/customer/organization-memberships'));
  assert.ok(created, 'creates the membership');
  assert.equal(created.body.isLocked, true, 'membership must be created with isLocked=true');
});

test('provisionContactLogins: login + org-scoped membership, NO duplicate contact', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  // A contact seedContacts already created (platform_id in hand) + its org.
  const contactMap = {
    'CON-001': { platform_id: 'contact-1', email: 'test-john.mitchell-20260310@test-agent.com', csv_id: 'CON-001', name: 'John Mitchell' },
  };
  const orgMap = { 'ORG-001': { platform_id: 'org-1', name: 'AGENT-TEST-Org-AcmeCorp-20260310' } };
  await provisionContactLogins(contactMap, orgMap);

  // THE key invariant: it must never create a contact (no POST /api/members) → no duplicate.
  assert.equal(calls.filter(c => c.method === 'POST' && c.path.endsWith('/api/members')).length, 0,
    'provisionContactLogins must reuse the in-hand contact, never create a new one');
  // It links the account to that exact contact and assigns the org role from users.csv.
  const create = calls.find(c => c.path.includes('/security/users/create'));
  assert.ok(create, 'creates the login');
  assert.equal(create.body.memberId, 'contact-1', 'account links to the existing contact id');
  const mem = calls.find(c => c.method === 'POST' && c.path.endsWith('/customer/organization-memberships'));
  assert.ok(mem, 'creates the org membership');
  assert.equal(mem.body.organizationId, 'org-1');
  assert.equal(mem.body.roles[0].roleId, 'org-maintainer', 'role comes from users.csv (John Mitchell = Organization maintainer)');
});

test('provisionContactLogins: a user with NO role still gets a login (account, no membership)', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  // CON-022 (imp-target-invited) is seeded=true with an EMPTY role in users.csv.
  const contactMap = {
    'CON-022': { platform_id: 'contact-22', email: 'AGENT-TEST-imp-target-invited-20260514@test-agent.com', csv_id: 'CON-022', name: 'Invited User' },
  };
  const orgMap = { 'ORG-002': { platform_id: 'org-2', name: 'AGENT-TEST-Org-TechFlow-20260310' } };
  await provisionContactLogins(contactMap, orgMap);

  assert.ok(calls.find(c => c.path.includes('/security/users/create')), 'every seeded user gets a login');
  assert.equal(calls.filter(c => c.method === 'POST' && c.path.endsWith('/customer/organization-memberships')).length, 0,
    'no role → no org membership (account only)');
});
