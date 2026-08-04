// Unit tests for membership_status across the TWO other membership-creating paths (VCST-5281
// follow-up): provisionContactLogins (test-data/b2b/users.csv) and seedInlineOrgUsers
// (test-data/white-labeling/users.csv). seedMemberships (organization-memberships.csv) is covered by
// membership-status.test.mjs.
//
// WHY THIS FILE EXISTS — the regression it locks down:
// `ensureOrgMembershipModern`'s reuse comparison is status-aware, so the seeder is AUTHORITATIVE over
// membership status on ALL THREE paths. When only organization-memberships.csv could declare a status,
// the other two passed `null` — so every re-seed force-RESET a real status (e.g. one set via the Admin
// UI) back to null, on 32 of 38 memberships, with no way to express otherwise. That was strictly worse
// than the old behaviour, where status was ignored and therefore survived. These tests assert both
// halves: a declared status is threaded, and a blank one still means "inherit" rather than "force null
// because I cannot say anything".
//
// Pure/mocked — no env, no network. Run: `node --test scripts/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  __setApi, setFlags, provisionContactLogins, seedInlineOrgUsers,
} from '../lib/user-provision.mjs';
import {
  resolveMembershipStatusForIndex, findStatusProblems,
  MANUALLY_SELECTABLE_STATUSES, STATUS_COLUMN,
} from '../seed-data/b2b/membership-alias-specs.mjs';

const MEMBERSHIPS = '/customer/organization-memberships';

// Recording mock. `existingMemberships` seeds what the search returns, so reuse-vs-reconcile is testable.
function makeApiMock({ existingMemberships = [] } = {}) {
  const calls = [];
  let memId = 0;
  // Created accounts must become findable, exactly as the real platform does — ensureSecurityAccount
  // re-resolves the id after create and throws if the lookup misses.
  const usersByEmail = new Map();
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
      const email = (body.email || '').toLowerCase();
      usersByEmail.set(email, { id: 'acct-' + (usersByEmail.size + 1), userName: body.userName, email: body.email, roles: [] });
      return { succeeded: true, errors: [] };
    }
    if (method === 'PUT' && path.includes('/security/users')) return null;
    if (method === 'POST' && path.includes(`${MEMBERSHIPS}/search`)) return { results: existingMemberships };
    if (method === 'POST' && path.endsWith(MEMBERSHIPS)) return { id: 'mem-' + (++memId) };
    if (method === 'PUT' && path.includes(MEMBERSHIPS)) return null;
    if (method === 'POST' && path.endsWith('/api/members')) return { id: 'contact-new' };
    if (method === 'GET' && path.includes('/api/members/')) return { id: 'contact-new', emails: [] };
    return null;
  };
  const posts = () => calls.filter((c) => c.method === 'POST' && c.path.endsWith(MEMBERSHIPS));
  const puts = () => calls.filter((c) => c.method === 'PUT' && c.path.includes(MEMBERSHIPS));
  return { api, calls, posts, puts };
}
const useMock = (opts) => { const m = makeApiMock(opts); setFlags({ dryRun: false, verbose: false }); __setApi(m.api); return m; };

// ── shared fixtures ─────────────────────────────────────────────────────────────────────────────
const ORG_MAP = {
  'ORG-001': { platform_id: 'org-1', name: 'AGENT-TEST-Org-AcmeCorp' },
  'ORG-002': { platform_id: 'org-2', name: 'AGENT-TEST-Org-TechFlow' },
  'ORG-003': { platform_id: 'org-3', name: 'AGENT-TEST-Org-BuildRight' },
};
const CONTACT_MAP = { 'CON-1': { platform_id: 'contact-1', email: 'u@t.test', csv_id: 'CON-1', name: 'U T' } };

const userRow = (over = {}) => ({
  user_id: 'USR-T', contact_id: 'CON-1', org_id: 'ORG-001', email: 'u@t.test',
  password: '{{DEFAULT_TEST_PASSWORD}}', roles: 'Organization employee', status: 'Approved', seeded: 'true', ...over,
});
const wlRow = (over = {}) => ({
  user_id: 'WL-T', email: 'wl@t.test', password: '{{DEFAULT_TEST_PASSWORD}}', first_name: 'W', last_name: 'L',
  org_id: 'ORG-001', roles: 'Organization employee', status: 'Approved', seeded: 'true', ...over,
});

const PATHS = [
  {
    name: 'provisionContactLogins (b2b/users.csv)',
    run: (over, mockOpts) => { const m = useMock(mockOpts); return provisionContactLogins(CONTACT_MAP, ORG_MAP, { rows: [userRow(over)] }).then(() => m); },
  },
  {
    name: 'seedInlineOrgUsers (white-labeling/users.csv)',
    run: (over, mockOpts) => { const m = useMock(mockOpts); return seedInlineOrgUsers([wlRow(over)], ORG_MAP).then(() => m); },
  },
];

// ── blank ⇒ omitted from the create POST (back-compat on both paths) ────────────────────────────
for (const p of PATHS) {
  test(`${p.name}: blank ${STATUS_COLUMN} ⇒ status key OMITTED from the create POST`, async () => {
    const m = await p.run({ [STATUS_COLUMN]: '' });
    assert.equal(m.posts().length, 1, 'creates one membership');
    assert.equal('status' in m.posts()[0].body, false, 'no status key at all');
  });

  test(`${p.name}: ABSENT ${STATUS_COLUMN} column ⇒ status key OMITTED (pre-change shape)`, async () => {
    const m = await p.run({}); // no membership_status property at all
    assert.equal(m.posts().length, 1);
    assert.equal('status' in m.posts()[0].body, false);
  });

  // ── each legal value threaded into the create POST ────────────────────────────────────────────
  for (const status of MANUALLY_SELECTABLE_STATUSES) {
    test(`${p.name}: ${STATUS_COLUMN}=${status} threaded into the create POST`, async () => {
      const m = await p.run({ [STATUS_COLUMN]: status });
      assert.equal(m.posts().length, 1);
      assert.equal(m.posts()[0].body.status, status);
    });
  }

  // ── reuse-vs-reconcile when ONLY the status differs (the regression) ──────────────────────────
  test(`${p.name}: REGRESSION — a drifted status alone forces a reconcile to the DECLARED value`, async () => {
    const existing = [{ id: 'mem-x', organizationId: 'org-1', isLocked: false, status: 'Rejected', roles: [{ roleId: 'org-employee' }] }];
    const m = await p.run({ [STATUS_COLUMN]: 'Approved' }, { existingMemberships: existing });
    assert.equal(m.puts().length, 1, 'status drift must force exactly one PUT');
    assert.equal(m.puts()[0].body.status, 'Approved', 'PUT carries the DECLARED status');
    assert.equal(m.posts().length, 0, 'heals in place, never duplicates');
  });

  test(`${p.name}: REGRESSION — a blank declaration still HEALS a left-behind status to null`, async () => {
    const existing = [{ id: 'mem-x', organizationId: 'org-1', isLocked: false, status: 'Invited', roles: [{ roleId: 'org-employee' }] }];
    const m = await p.run({ [STATUS_COLUMN]: '' }, { existingMemberships: existing });
    assert.equal(m.puts().length, 1);
    assert.equal(m.puts()[0].body.status, null, 'blank ⇒ declared baseline null');
  });

  test(`${p.name}: a MATCHING status reuses (no write, idempotent)`, async () => {
    const existing = [{ id: 'mem-x', organizationId: 'org-1', isLocked: false, status: 'Approved', roles: [{ roleId: 'org-employee' }] }];
    const m = await p.run({ [STATUS_COLUMN]: 'Approved' }, { existingMemberships: existing });
    assert.equal(m.puts().length, 0);
    assert.equal(m.posts().length, 0);
  });

  test(`${p.name}: blank declaration + already-null stored ⇒ reuse (no churn loop)`, async () => {
    const existing = [{ id: 'mem-x', organizationId: 'org-1', isLocked: false, status: null, roles: [{ roleId: 'org-employee' }] }];
    const m = await p.run({ [STATUS_COLUMN]: '' }, { existingMemberships: existing });
    assert.equal(m.puts().length, 0, 'the common all-blank case must not write on every re-seed');
  });
}

// ── multi-org: status resolves from the SAME row and SAME index as the role ─────────────────────
test('provisionContactLogins: index-parallel status pairs with the index-parallel role', async () => {
  const m = useMock();
  await provisionContactLogins(CONTACT_MAP, ORG_MAP, {
    rows: [userRow({
      org_id: 'ORG-001;ORG-002;ORG-003',
      roles: 'Organization employee;Organization maintainer;Purchasing agent',
      [STATUS_COLUMN]: 'Invited;;Approved', // org2 deliberately blank ⇒ inherit
    })],
  });
  const bodies = m.posts().map((c) => c.body);
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies.map((b) => b.organizationId), ['org-1', 'org-2', 'org-3']);
  assert.deepEqual(bodies.map((b) => b.roles[0].roleId), ['org-employee', 'org-maintainer', 'purchasing-agent']);
  assert.equal(bodies[0].status, 'Invited');
  assert.equal('status' in bodies[1], false, 'a blank slot must OMIT status, not copy slot 0');
  assert.equal(bodies[2].status, 'Approved');
});

test('seedInlineOrgUsers: index-parallel status pairs with the index-parallel role', async () => {
  const m = useMock();
  await seedInlineOrgUsers([wlRow({
    org_id: 'ORG-002;ORG-003',
    roles: 'Organization maintainer;Organization employee',
    [STATUS_COLUMN]: 'Approved;Rejected',
  })], ORG_MAP);
  const bodies = m.posts().map((c) => c.body);
  assert.equal(bodies.length, 2);
  assert.deepEqual(bodies.map((b) => b.organizationId), ['org-2', 'org-3']);
  assert.deepEqual(bodies.map((b) => b.status), ['Approved', 'Rejected']);
});

test('a SINGLE status value applies to EVERY org (mirrors the roles[0] fallback)', async () => {
  const m = useMock();
  await provisionContactLogins(CONTACT_MAP, ORG_MAP, {
    rows: [userRow({ org_id: 'ORG-001;ORG-002;ORG-003', roles: 'Organization employee', [STATUS_COLUMN]: 'Invited' })],
  });
  const bodies = m.posts().map((c) => c.body);
  assert.equal(bodies.length, 3);
  assert.deepEqual(bodies.map((b) => b.status), ['Invited', 'Invited', 'Invited']);
});

// ── the resolver's grammar, directly ────────────────────────────────────────────────────────────
test('resolveMembershipStatusForIndex: single value applies to all; list is strictly index-parallel', () => {
  assert.equal(resolveMembershipStatusForIndex('Invited', 0), 'Invited');
  assert.equal(resolveMembershipStatusForIndex('Invited', 5), 'Invited', 'no ; ⇒ same value for every index');
  assert.equal(resolveMembershipStatusForIndex('', 0), null);
  assert.equal(resolveMembershipStatusForIndex(undefined, 0), null);
  assert.equal(resolveMembershipStatusForIndex('Invited;;Approved', 0), 'Invited');
  assert.equal(resolveMembershipStatusForIndex('Invited;;Approved', 1), null, 'blank slot ⇒ null, NOT slot 0');
  assert.equal(resolveMembershipStatusForIndex('Invited;;Approved', 2), 'Approved');
  assert.equal(resolveMembershipStatusForIndex('Invited;Approved', 9), null, 'out of range ⇒ null, never a wrong org');
  assert.equal(resolveMembershipStatusForIndex(' Approved ; Rejected ', 1), 'Rejected', 'trims slots');
});

// ── illegal values rejected for the two new sources ─────────────────────────────────────────────
test('findStatusProblems rejects an illegal value in b2b/users.csv shape', () => {
  const { problems } = findStatusProblems(
    [{ user_id: 'USR-9', email: 'x@t.test', org_id: 'ORG-001', [STATUS_COLUMN]: 'Pending' }],
    { label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id' },
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /USR-9/);
  assert.match(problems[0], /illegal OrganizationMembership status/);
});

test('findStatusProblems rejects an illegal SLOT inside a valid-looking list', () => {
  const { problems } = findStatusProblems(
    [{ user_id: 'USR-9', email: 'x@t.test', org_id: 'ORG-001;ORG-002', [STATUS_COLUMN]: 'Approved;Bogus' }],
    { label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id' },
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /"Bogus"/);
});

test('findStatusProblems rejects an ARITY mismatch against org_id (index-parallel rule)', () => {
  const { problems } = findStatusProblems(
    [{ user_id: 'USR-9', email: 'x@t.test', org_id: 'ORG-001;ORG-002;ORG-003', [STATUS_COLUMN]: 'Approved;Invited' }],
    { label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id' },
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /2 value\(s\) for 3 org\(s\)/);
});

test('findStatusProblems: a single value against many orgs is NOT an arity error', () => {
  const { problems } = findStatusProblems(
    [{ user_id: 'USR-9', email: 'x@t.test', org_id: 'ORG-001;ORG-002;ORG-003', [STATUS_COLUMN]: 'Approved' }],
    { label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id' },
  );
  assert.deepEqual(problems, []);
});

test('findStatusProblems: blocking status warns per declared slot, never fails', () => {
  const { problems, blocking } = findStatusProblems(
    [{ user_id: 'WL-1', email: 'w@t.test', org_id: 'ORG-001;ORG-002', [STATUS_COLUMN]: 'Invited;Rejected' }],
    { label: 'wl-user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id' },
  );
  assert.deepEqual(problems, []);
  assert.equal(blocking.length, 2);
});
