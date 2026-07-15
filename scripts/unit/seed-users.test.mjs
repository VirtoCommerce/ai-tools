// Unit tests for scripts/seed-data/seed-users.mjs — the personal-account seeder.
// Invariants: it reads BOTH user CSVs (deduped, personal emails only, skips seeded=false), and it
// creates each account as a Customer login linked to a NO-ORG contact with NO roles.
// Pure/mocked — no env, no network. Run: `node --test tests/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { __setApi, parseCsv, personalUsers, ensurePersonalAccount, ensureAdminAccount } from '../../scripts/lib/user-provision.mjs';
import { resolveRole, roleByKey } from '../../scripts/lib/user-roles.mjs';

function makeApiMock() {
  const calls = [];
  const created = new Set();
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path.includes('/security/users/search')) {
      const email = (body?.keyword || '').toLowerCase();
      return { results: created.has(email) ? [{ id: 'u-' + email, userName: email }] : [] };
    }
    if (method === 'GET' && path.includes('/security/users/')) return null;     // not found (new)
    if (method === 'POST' && path.endsWith('/api/members')) return { id: 'contact-1' };
    if (method === 'POST' && path.includes('/security/users/create')) { created.add((body.email || '').toLowerCase()); return { succeeded: true, errors: [] }; }
    return null;
  };
  return { api, calls };
}

test('parseCsv handles quoted fields with commas', () => {
  const rows = parseCsv('a,b\n1,"x, y"\n');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].b, 'x, y');
});

test('personalUsers reads both CSVs: personal emails only, deduped, no b2b emails', () => {
  const users = personalUsers();
  const emails = users.map(u => u.email.toLowerCase());
  // agent-user-pool personal logins are included...
  assert.ok(emails.includes('qa-agent-slot1@virtocommerce.com'), 'includes agent slot personal login');
  assert.ok(emails.includes('milamuller2024@yahoo.com'), 'includes the personal (no-org) account');
  // ...the b2b side of agent-user-pool is NOT (owned by the b2b seeder)
  assert.ok(!emails.includes('test-john.mitchell-20260310@test-agent.com'), 'must NOT include b2b_email rows');
  // test-users.csv generic accounts are included
  assert.ok(emails.some(e => /^qa-user-\d+@/.test(e)), 'includes test-users.csv accounts');
  // no duplicates
  assert.equal(new Set(emails).size, emails.length, 'emails are deduped');
});

test('ensurePersonalAccount creates a NO-ORG contact + Customer login with NO roles', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  const r = await ensurePersonalAccount({ email: 'qa-user-99@example.com', password: 'Test123!', first: 'QA', last: 'User' });
  assert.equal(r, 'created');
  const contact = calls.find(c => c.method === 'POST' && c.path.endsWith('/api/members'));
  assert.ok(contact, 'creates a contact');
  assert.equal(contact.body.memberType, 'Contact');
  assert.ok(!contact.body.organizations || contact.body.organizations.length === 0, 'personal contact has NO organizations');
  const acct = calls.find(c => c.method === 'POST' && c.path.includes('/security/users/create'));
  assert.ok(acct, 'creates the login');
  assert.equal(acct.body.userType, 'Customer');
  assert.equal(acct.body.memberId, 'contact-1', 'login links to the created contact');
  assert.ok(!acct.body.roles || acct.body.roles.length === 0, 'account has NO roles');
});

test('ensurePersonalAccount is idempotent — reuses an existing user (no create)', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  await ensurePersonalAccount({ email: 'dup@example.com', password: 'x', first: 'A', last: 'B' });   // creates
  const before = calls.length;
  const r = await ensurePersonalAccount({ email: 'dup@example.com', password: 'x', first: 'A', last: 'B' }); // should reuse
  assert.equal(r, 'reused');
  assert.equal(calls.slice(before).filter(c => c.path.endsWith('/api/members')).length, 0, 'no second contact created on re-run');
});

test('EUR_USER role carries currency EUR; other customer roles default to null (USD)', () => {
  const eur = resolveRole(roleByKey('EUR_USER'), { EUR_USER_EMAIL: 'e@x.com', EUR_USER_PASSWORD: 'p' });
  assert.equal(eur.currency, 'EUR');
  const usr = resolveRole(roleByKey('USER'), { USER_EMAIL: 'u@x.com', USER_PASSWORD: 'p' });
  assert.equal(usr.currency, null, 'non-EUR roles carry no currency override (seeder falls back to USD)');
});

test('IMPERSONATION_ADMIN is an org-scoped role (CSV-native B2B member), NOT a provisioned admin', () => {
  const imp = resolveRole(roleByKey('IMPERSONATION_ADMIN'), { IMPERSONATION_ADMIN_EMAIL: 'i@x.com', IMPERSONATION_ADMIN_PASSWORD: 'p' });
  assert.equal(imp.kind, 'org', 'operator is an org member (org-maintainer @ TechFlow), not a global admin');
  assert.notEqual(imp.provision, true, 'NOT provisioned via the admin path — seeded CSV-native via b2b/users.csv USR-024');
  const admin = resolveRole(roleByKey('ADMIN'), { ADMIN: 'admin', ADMIN_PASSWORD: 'p' });
  assert.equal(admin.provision, false, 'bootstrap admin is never provisioned by the seeder');
});

test('ensureAdminAccount creates a missing admin as isAdministrator=true, else reuses', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  const r1 = await ensureAdminAccount({ email: 'imp@example.com', password: 'x', source: 'env-role:IMPERSONATION_ADMIN' });
  assert.equal(r1, 'created');
  const create = calls.find(c => c.method === 'POST' && c.path.includes('/security/users/create'));
  assert.equal(create.body.isAdministrator, true, 'admin account created with isAdministrator=true');
  assert.equal(create.body.userType, 'Manager');
  assert.ok(!create.body.memberId, 'admin has no contact member');
  const r2 = await ensureAdminAccount({ email: 'imp@example.com', password: 'x', source: 'env-role:IMPERSONATION_ADMIN' });
  assert.equal(r2, 'reused', 'idempotent — existing admin is reused, not recreated');
});

test('ensurePersonalAccount sets contact currencyCode from the user, defaulting to USD', async () => {
  const { api, calls } = makeApiMock();
  __setApi(api);
  await ensurePersonalAccount({ email: 'eur@example.com', password: 'x', first: 'EUR', last: 'User', currency: 'EUR' });
  assert.equal(calls.find(c => c.method === 'POST' && c.path.endsWith('/api/members')).body.currencyCode, 'EUR');
  const m2 = makeApiMock(); __setApi(m2.api);
  await ensurePersonalAccount({ email: 'plain@example.com', password: 'x', first: 'QA', last: 'User' });
  assert.equal(m2.calls.find(c => c.method === 'POST' && c.path.endsWith('/api/members')).body.currencyCode, 'USD', 'defaults to USD when no currency');
});

test('ensurePersonalAccount RECONCILES currency on reuse (USD→EUR) — fixes pre-existing drift', async () => {
  const calls = [];
  let contactCurrency = 'USD';
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path.includes('/security/users/search')) return { results: [{ id: 'u-1', userName: 'eur@example.com', memberId: 'c-1' }] };
    if (method === 'GET' && path.includes('/api/contacts/')) return { id: 'c-1', currencyCode: contactCurrency };
    if (method === 'POST' && path.endsWith('/api/members')) { contactCurrency = body.currencyCode; return { id: 'c-1' }; }
    return null;
  };
  __setApi(api);
  const r = await ensurePersonalAccount({ email: 'eur@example.com', password: 'x', first: 'EUR', last: 'User', currency: 'EUR' });
  assert.equal(r, 'reused');
  const put = calls.find(c => c.method === 'POST' && c.path.endsWith('/api/members'));
  assert.ok(put, 'reconciles by upserting the existing contact');
  assert.equal(put.body.currencyCode, 'EUR', 'currency corrected to EUR on reuse (not left as USD)');
});

test('impersonation OPERATOR is a CSV row (users.csv USR-024): Customer, org-maintainer @ ORG-002, no global admin', () => {
  const users = parseCsv(readFileSync('test-data/b2b/users.csv', 'utf8'));
  const op = users.find(u => u.user_id === 'USR-024');
  assert.ok(op, 'USR-024 exists in b2b/users.csv');
  assert.equal(op.user_type, 'Customer');
  assert.equal(op.org_id, 'ORG-002', 'scoped to the TechFlow org');
  assert.equal(op.roles, 'Organization maintainer', 'org-maintainer role BY NAME (incl. loginOnBehalf)');
  assert.equal(op.is_admin, 'false', 'NOT a global admin');
  assert.match(op.password, /^\{\{[A-Z0-9_]+\}\}$/, 'password is a {{VAR}} token, not a literal');
  const contacts = parseCsv(readFileSync('test-data/b2b/contacts.csv', 'utf8'));
  assert.ok(contacts.find(c => c.contact_id === 'CON-024' && c.org_id === 'ORG-002'), 'CON-024 contact row exists in TechFlow');
});
