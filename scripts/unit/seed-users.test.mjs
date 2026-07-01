// Unit tests for scripts/seed-data/seed-users.mjs — the personal-account seeder.
// Invariants: it reads BOTH user CSVs (deduped, personal emails only, skips seeded=false), and it
// creates each account as a Customer login linked to a NO-ORG contact with NO roles.
// Pure/mocked — no env, no network. Run: `node --test tests/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setApi, parseCsv, personalUsers, ensurePersonalAccount } from '../../scripts/seed-data/seed-users.mjs';

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
