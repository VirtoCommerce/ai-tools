// Unit tests for OrganizationMembership.Status provisioning (VCST-5281) — the field the ticket
// introduces, which the seeder previously could not set at all (it POSTed only userId /
// organizationId / organizationName / roles / isLocked, so every seeded row was status=null).
//
// The regression this file exists to prevent is the LAST test group: `ensureOrgMembershipModern`'s
// reuse check used to compare roles + isLocked ONLY. A status a test left behind (e.g. Rejected)
// therefore took the no-write "reuse" branch, so a re-seed did NOT heal it — the fixture stayed
// silently blocked and every later positive condition failed as if the product were broken.
//
// Legal-set provenance is asserted too: the values must match vc-module-customer @ 2605501d
// ModuleConstants.MembershipStatuses (ManuallySelectableStatuses / BlockingStatuses).
//
// Pure/mocked — no env, no network. Run: `node --test scripts/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setApi, setFlags, ensureOrgMembership } from '../lib/user-provision.mjs';
import {
  normalizeMembershipStatus, isLegalMembershipStatus, isBlockingMembershipStatus, findStatusProblems,
  MEMBERSHIP_STATUSES, MANUALLY_SELECTABLE_STATUSES, BLOCKING_STATUSES, STATUS_COLUMN,
} from '../seed-data/b2b/membership-alias-specs.mjs';

const MEMBERSHIPS = '/customer/organization-memberships';

// Minimal recording mock of the seeder's HTTP layer, scoped to what the membership path touches.
function makeApiMock() {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path.endsWith(MEMBERSHIPS)) return { id: 'mem-new' };
    if (method === 'POST' && path.includes('/platform/security/roles/search')) return { results: [] };
    return null;
  };
  const posts = () => calls.filter((c) => c.method === 'POST' && c.path.endsWith(MEMBERSHIPS));
  const puts = () => calls.filter((c) => c.method === 'PUT' && c.path.includes(MEMBERSHIPS));
  return { api, calls, posts, puts };
}
const useMock = () => { const m = makeApiMock(); setFlags({ dryRun: false, verbose: false }); __setApi(m.api); return m; };

// ── The legal set matches source ────────────────────────────────────────────────────────────────
test('legal set mirrors ModuleConstants.MembershipStatuses (source of truth, single copy)', () => {
  assert.deepEqual([...MANUALLY_SELECTABLE_STATUSES], ['Invited', 'Approved', 'Rejected', 'Deleted']);
  assert.deepEqual([...BLOCKING_STATUSES], ['Invited', 'Rejected', 'Deleted']);
  // Approved is the ONLY non-blocking status — that asymmetry is the whole point of the field.
  assert.equal(BLOCKING_STATUSES.includes(MEMBERSHIP_STATUSES.APPROVED), false);
  assert.equal(STATUS_COLUMN, 'membership_status');
});

// ── Blank ⇒ null (backward compatibility) ───────────────────────────────────────────────────────
test('normalizeMembershipStatus: blank / whitespace / absent ⇒ null, never an empty string', () => {
  for (const blank of ['', '   ', null, undefined]) assert.equal(normalizeMembershipStatus(blank), null, `${JSON.stringify(blank)} ⇒ null`);
  assert.equal(normalizeMembershipStatus('  Approved  '), 'Approved', 'trims');
  assert.equal(normalizeMembershipStatus('Rejected'), 'Rejected');
});

test('a blank cell omits status from the POST body entirely (today\'s behaviour preserved)', async () => {
  const m = useMock();
  await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', [], false, null, '');
  const body = m.posts()[0].body;
  assert.equal('status' in body, false, 'no status key at all — not status:null, not status:""');
  assert.equal(body.isLocked, false, 'locked semantics untouched');
});

test('a row with NO membership_status column behaves exactly as before (absent ⇒ omitted)', async () => {
  const m = useMock();
  // Simulates the pre-change call shape: only 5 args, no status argument at all.
  await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', []);
  assert.equal('status' in m.posts()[0].body, false);
});

// ── Each legal value threaded into POST ─────────────────────────────────────────────────────────
for (const status of MANUALLY_SELECTABLE_STATUSES) {
  test(`POST create carries status=${status}`, async () => {
    const m = useMock();
    await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', [], false, null, status);
    assert.equal(m.posts().length, 1);
    assert.equal(m.posts()[0].body.status, status);
  });
}

// ── Each legal value threaded into the reconcile PUT ────────────────────────────────────────────
for (const status of MANUALLY_SELECTABLE_STATUSES) {
  test(`PUT reconcile assigns the DECLARED status=${status} (not the value read back)`, async () => {
    const m = useMock();
    // Existing row is drifted: wrong status. Roles/lock already match, so ONLY status forces the write.
    const existing = [{ id: 'mem-1', organizationId: 'org-1', isLocked: false, status: 'Deleted', roles: [{ roleId: 'org-employee' }] }];
    const id = await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', existing, false, null, status);
    assert.equal(id, 'mem-1');
    if (status === 'Deleted') {
      assert.equal(m.puts().length, 0, 'already at the declared value ⇒ reuse, no write');
      return;
    }
    assert.equal(m.puts().length, 1, 'status drift must force exactly one PUT');
    assert.equal(m.puts()[0].body.status, status, 'PUT must carry the DECLARED status, not the drifted one');
    assert.equal(m.puts()[0].path.includes('mem-1'), true);
  });
}

// ── Illegal values rejected by the drift guard ──────────────────────────────────────────────────
test('isLegalMembershipStatus: blank legal, the four legal, everything else rejected', () => {
  assert.equal(isLegalMembershipStatus(''), true, 'blank is legal (⇒ null)');
  for (const s of MANUALLY_SELECTABLE_STATUSES) assert.equal(isLegalMembershipStatus(s), true, s);
  for (const bad of ['Pending', 'New', 'Active', 'Locked', 'approved', 'APPROVED', 'Deleted ✗', 'null', 'true']) {
    assert.equal(isLegalMembershipStatus(bad), false, `${bad} must be rejected`);
  }
});

test('findStatusProblems: hard-fails an illegal value and names the legal set', () => {
  const rows = [{ membership_id: 'MOM-X', user_email: 'x@t.test', [STATUS_COLUMN]: 'Pending' }];
  const { problems } = findStatusProblems(rows);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /MOM-X/);
  assert.match(problems[0], /illegal OrganizationMembership status/);
  assert.match(problems[0], /"Pending"/, 'names the offending value');
  assert.match(problems[0], /Invited, Approved, Rejected, Deleted/);
});

test('findStatusProblems: case matters — "approved" is NOT "Approved"', () => {
  const { problems } = findStatusProblems([{ membership_id: 'MOM-Y', user_email: 'y@t.test', [STATUS_COLUMN]: 'approved' }]);
  assert.equal(problems.length, 1, 'the platform compares case-sensitively; so must we');
});

test('findStatusProblems: a BLANK cell on a membership-creating row is now a HARD FAILURE', () => {
  // This inverted on 2026-08-03. Blank used to be accepted as "inherit the contact's status", but a
  // committed fixture that inherits makes the per-org status a property of a DIFFERENT entity — not
  // observable from the row, and silently re-meaninged if the contact is ever edited. The WIRE
  // behaviour of blank is unchanged (⇒ null, key omitted) so a re-seed can still heal a row back to
  // no-override; what is forbidden is a committed row DECLARING blank.
  const { problems } = findStatusProblems([{ membership_id: 'A', user_email: 'a@t.test', [STATUS_COLUMN]: '' }]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /is blank but this row seeds an OrganizationMembership/);
  assert.match(problems[0], /Invited, Approved, Rejected, Deleted/, 'names the legal set');
  assert.match(problems[0], /happy path ⇒ Approved/, 'points at the platform default');
});

test('findStatusProblems: an ABSENT column still produces no findings (validator gates that separately)', () => {
  // A source with no membership_status column at all is caught by td:validate:b2b [9]'s own
  // missing-column check, which can say something far more useful than a per-row message.
  assert.deepEqual(findStatusProblems([{ membership_id: 'B', user_email: 'b@t.test' }]), { problems: [], blocking: [] });
  assert.deepEqual(findStatusProblems([]), { problems: [], blocking: [] });
});

test('findStatusProblems: a legal BLOCKING status is a warning, not a failure', () => {
  const rows = BLOCKING_STATUSES.map((s, i) => ({ membership_id: `MOM-B${i}`, user_email: `b${i}@t.test`, [STATUS_COLUMN]: s }));
  const { problems, blocking } = findStatusProblems(rows);
  assert.equal(problems.length, 0, 'blocking is legal — it must not fail the gate');
  assert.equal(blocking.length, BLOCKING_STATUSES.length, 'but every one must be surfaced');
  const approved = findStatusProblems([{ membership_id: 'MOM-OK', user_email: 'ok@t.test', [STATUS_COLUMN]: 'Approved' }]);
  assert.deepEqual(approved, { problems: [], blocking: [] }, 'Approved is neither a problem nor blocking');
});

test('isBlockingMembershipStatus matches BlockingStatuses; blank and Approved are not blocking', () => {
  for (const s of BLOCKING_STATUSES) assert.equal(isBlockingMembershipStatus(s), true, s);
  assert.equal(isBlockingMembershipStatus('Approved'), false);
  assert.equal(isBlockingMembershipStatus(''), false);
});

// ── THE REGRESSION: reuse-vs-reconcile when ONLY the status differs ─────────────────────────────
// This is why the change exists. Before it, every case below took the reuse branch and wrote nothing,
// so a re-seed could not heal a status a test had left behind.
test('REGRESSION: a drifted status alone forces a reconcile — a re-seed HEALS a left-behind status', async () => {
  for (const leftBehind of BLOCKING_STATUSES) {
    const m = useMock();
    // Exactly the post-test state: roles + lock still correct, status left blocking by the test.
    const existing = [{ id: 'mem-1', organizationId: 'org-1', isLocked: false, status: leftBehind, roles: [{ roleId: 'org-employee' }] }];
    // Declared baseline is null (a blank CSV cell) — the shape all six shipped rows use.
    await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', existing, false, null, null);
    assert.equal(m.puts().length, 1, `status=${leftBehind} left behind must be reconciled, not reused`);
    assert.equal(m.puts()[0].body.status, null, `must be healed back to the declared null baseline (was ${leftBehind})`);
    assert.equal(m.posts().length, 0, 'heals in place — never creates a duplicate membership');
  }
});

test('REGRESSION: a matching status still REUSES (no pointless write, idempotence preserved)', async () => {
  for (const status of [null, ...MANUALLY_SELECTABLE_STATUSES]) {
    const m = useMock();
    const existing = [{ id: 'mem-1', organizationId: 'org-1', isLocked: false, status, roles: [{ roleId: 'org-employee' }] }];
    const id = await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', existing, false, null, status);
    assert.equal(id, 'mem-1');
    assert.equal(m.puts().length, 0, `status=${status} already matches ⇒ no write`);
    assert.equal(m.posts().length, 0);
  }
});

test('REGRESSION: platform null vs declared blank are the SAME state (no write loop)', async () => {
  // The platform returns an absent status as null on some builds and '' on others. If those did not
  // normalize together, every single re-seed would PUT forever — churn that looks like real drift.
  for (const stored of [null, undefined, '']) {
    const m = useMock();
    const existing = [{ id: 'mem-1', organizationId: 'org-1', isLocked: false, status: stored, roles: [{ roleId: 'org-employee' }] }];
    await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', existing, false, null, '');
    assert.equal(m.puts().length, 0, `stored ${JSON.stringify(stored)} vs declared blank must compare equal`);
  }
});

test('locked semantics are untouched by the status change (both drift independently)', async () => {
  // isLocked drift alone still reconciles, and carries the declared status along.
  const m = useMock();
  const existing = [{ id: 'mem-1', organizationId: 'org-1', isLocked: true, status: null, roles: [{ roleId: 'org-employee' }] }];
  await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', existing, false, null, null);
  assert.equal(m.puts().length, 1, 'lock drift still forces a reconcile');
  assert.equal(m.puts()[0].body.isLocked, false);
  assert.equal(m.puts()[0].body.status, null);

  // locked=true + a declared status must both land on create.
  const m2 = useMock();
  await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-employee', [], true, null, 'Invited');
  assert.equal(m2.posts()[0].body.isLocked, true);
  assert.equal(m2.posts()[0].body.status, 'Invited');
});

test('role drift and status drift are reported together, and both are written', async () => {
  const m = useMock();
  const existing = [{ id: 'mem-1', organizationId: 'org-1', isLocked: false, status: 'Rejected', roles: [{ roleId: 'org-employee' }] }];
  await ensureOrgMembership('user-1', 'org-1', 'Org One', 'org-maintainer', existing, false, null, 'Approved');
  assert.equal(m.puts().length, 1);
  assert.equal(m.puts()[0].body.status, 'Approved');
  assert.equal(m.puts()[0].body.roles[0].roleId, 'org-maintainer');
});
