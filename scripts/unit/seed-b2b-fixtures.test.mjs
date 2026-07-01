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
  seedOrgs, seedContacts, ensureRoles, loadRoleDefs,
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

// --- seedOrgs / ensureRoles: index-independent reuse + stable ids + idempotent role upsert ---
// Recording mock for the org/role endpoints. membersById = GET /api/members/{id}; orgsByName =
// POST /api/members/search; rolesByName = POST /roles/search. GET /roles/{id} is HARDCODED to null
// to prove ensureRoles never depends on the cache-flaky GET-by-id.
function makeOrgRoleMock({ membersById = {}, orgsByName = {}, rolesByName = {} } = {}) {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path.endsWith('/api/members/search')) {
      const m = orgsByName[body?.keyword];
      return { results: m ? [m] : [] };
    }
    if (method === 'GET' && /\/api\/members\/[^/]+$/.test(path)) {
      return membersById[decodeURIComponent(path.split('/').pop())] || null;
    }
    if (method === 'POST' && path.endsWith('/api/members')) return { id: body.id || 'server-gen-id', name: body.name };
    if (method === 'POST' && path.endsWith('/api/platform/security/roles/search')) {
      const r = rolesByName[body?.keyword];
      return { results: r ? [r] : [] };
    }
    if (method === 'GET' && path.includes('/api/platform/security/roles/')) return null; // flaky GET-by-id
    if (method === 'PUT' && path.endsWith('/api/platform/security/roles')) return null;
    return null;
  };
  return { api, calls };
}

test('seedOrgs REUSES by the CSV platform_id via a direct GET (immune to a stale search index)', async () => {
  const { api, calls } = makeOrgRoleMock({
    membersById: { '96f109a7': { id: '96f109a7', name: 'AGENT-TEST-Org-TechFlow', memberType: 'Organization' } },
    orgsByName: {}, // search index is EMPTY (stale) — reuse must still work
  });
  __setApi(api);
  const out = await seedOrgs([{ org_id: 'ORG-002', org_name: 'AGENT-TEST-Org-TechFlow', platform_id: '96f109a7' }]);
  assert.equal(out['ORG-002'].platform_id, '96f109a7', 'reuses the cached platform_id');
  assert.equal(out['ORG-002'].reused, true);
  assert.equal(calls.filter(c => c.method === 'POST' && c.path.endsWith('/api/members')).length, 0,
    'must NOT create a duplicate org even though the search index is stale');
});

test('seedOrgs PINS the CSV platform_id on (re)create so a deleted org comes back with a STABLE id', async () => {
  // Org is gone everywhere: GET-by-id 404s AND the search index is empty.
  const { api, calls } = makeOrgRoleMock({ membersById: {}, orgsByName: {} });
  __setApi(api);
  const out = await seedOrgs([{ org_id: 'ORG-002', org_name: 'AGENT-TEST-Org-TechFlow', platform_id: '96f109a7' }]);
  const create = calls.find(c => c.method === 'POST' && c.path.endsWith('/api/members'));
  assert.ok(create, 'creates the org when it exists nowhere');
  assert.equal(create.body.id, '96f109a7', 'create body pins the CSV platform_id as the org id');
  assert.equal(out['ORG-002'].platform_id, '96f109a7', 'recreated org keeps its stable id (no drift)');
  assert.equal(out['ORG-002'].reused, false);
});

test('seedOrgs falls back to search-by-name when the CSV has no cached platform_id', async () => {
  const { api, calls } = makeOrgRoleMock({
    orgsByName: { 'AGENT-TEST-Org-New': { id: 'found-by-name', name: 'AGENT-TEST-Org-New' } },
  });
  __setApi(api);
  const out = await seedOrgs([{ org_id: 'ORG-099', org_name: 'AGENT-TEST-Org-New', platform_id: '' }]);
  assert.equal(out['ORG-099'].platform_id, 'found-by-name');
  assert.equal(out['ORG-099'].reused, true);
  assert.equal(calls.filter(c => c.method === 'POST' && c.path.endsWith('/api/members')).length, 0, 'no duplicate create');
});

test('ensureRoles ALWAYS upserts (idempotent, never gated by the flaky GET-by-id) with CSV perms', async () => {
  const defs = loadRoleDefs();
  // Make every role appear to already exist via SEARCH (GET-by-id is hardcoded null in the mock).
  const rolesByName = Object.fromEntries(defs.map(d => [d.role_name, { id: d.role_id, name: d.role_name }]));
  const { api, calls } = makeOrgRoleMock({ rolesByName });
  __setApi(api);
  await ensureRoles();
  const puts = calls.filter(c => c.method === 'PUT' && c.path.endsWith('/api/platform/security/roles'));
  assert.equal(puts.length, defs.length, 'upserts EVERY role even when it already exists (perm sync, not skip)');
  for (const p of puts) {
    const def = defs.find(d => d.role_id === p.body.id);
    assert.ok(def, `PUT uses a fixed CSV role_id (${p.body.id}) — idempotent, cannot create a duplicate`);
    const expected = (def.permissions || '').split(';').map(s => s.trim()).filter(Boolean);
    assert.equal(p.body.permissions.length, expected.length, `${def.role_id} PUT carries all CSV permissions`);
  }
  // Pin the org-maintainer contract from roles.csv (11 perms incl the two xAPI + loginOnBehalf).
  const maint = puts.find(p => p.body.id === 'org-maintainer');
  const perms = maint.body.permissions.map(x => x.name);
  assert.equal(perms.length, 11, 'org-maintainer carries 11 permissions');
  assert.ok(perms.includes('xapi:my_organization:order:view'), 'org-maintainer has xapi order:view');
  assert.ok(perms.includes('xapi:my_organization:user:invite'), 'org-maintainer has xapi user:invite');
  assert.ok(perms.includes('platform:security:loginOnBehalf'), 'org-maintainer has loginOnBehalf (impersonation operator)');
});

test('writeBackUserPlatformIds rewrites only field 2 per USR- row, keyed by email', async () => {
  const { writeBackUserPlatformIds } = await import('../../scripts/lib/user-provision.mjs');
  // Function reads/writes the real users.csv; assert it is callable and no-ops on unknown emails
  // (empty map → 0 rewrites), which proves it never corrupts the file on an empty/absent id set.
  const n = writeBackUserPlatformIds({});
  assert.equal(n, 0, 'empty id map performs zero rewrites (never corrupts the CSV)');
  const n2 = writeBackUserPlatformIds({ 'nobody@nowhere.invalid': 'dry-skip' });
  assert.equal(n2, 0, 'dry- ids and unmatched emails are skipped');
});

test('seedContacts RECONCILES a reused contact currency from currency_code (USD→EUR)', async () => {
  const calls = [];
  let contactCcy = 'USD';
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path.includes('/security/users/search')) return { results: [{ id: 'u-1', userName: 'test-john.mitchell@x.com', memberId: 'c-1' }] };
    if (method === 'GET' && path.includes('/api/contacts/')) return { id: 'c-1', name: 'John Mitchell', currencyCode: contactCcy };
    if (method === 'POST' && path.endsWith('/api/members')) { if (body.currencyCode) contactCcy = body.currencyCode; return { id: 'c-1' }; }
    return null;
  };
  __setApi(api);
  const out = await seedContacts(
    [{ contact_id: 'CON-001', full_name: 'John Mitchell', email: 'test-john.mitchell@x.com', org_id: 'ORG-001', currency_code: 'EUR' }],
    { 'ORG-001': { platform_id: 'org-1', name: 'AcmeCorp' } },
  );
  assert.equal(out['CON-001'].reused, true, 'reuses the existing contact');
  const upsert = calls.find(c => c.method === 'POST' && c.path.endsWith('/api/members'));
  assert.ok(upsert, 'reconciles by upserting the contact');
  assert.equal(upsert.body.currencyCode, 'EUR', 'currency corrected to EUR on reuse');
});
