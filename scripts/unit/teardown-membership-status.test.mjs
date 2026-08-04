// Unit tests for TEARDOWN symmetry across membership STATUS (VCST-5281 follow-up).
//
// WHY THIS FILE EXISTS — the orphan class it locks down:
// `Deleted` is one of the four legal OrganizationMembership.Status values (MANUALLY_SELECTABLE_STATUSES),
// and it is a STATUS VALUE, not a row deletion — the membership row still exists. Teardown
// (`deleteUserByEmail`) removes membership rows by id from whatever `searchMemberships()` returns, so
// the fixture ORG_TF_MBR_DELETED (organization-memberships.csv MOM-009) is only torn down as long as
// that search stays STATUS-AGNOSTIC.
//
// It is today — proven both ways against vc-module-customer@2605501d and live on vcst 2026-08-03:
//   • SOURCE: OrganizationMembershipSearchService.BuildQuery applies `x => criteria.Statuses.Contains(x.Status)`
//     ONLY when `criteria.Statuses` is non-empty, and OrganizationMembershipController.Search passes the
//     body straight through with no default — so a `{userId}`-only search returns every status.
//   • LIVE: POST /api/customer/organization-memberships/search {userId} returned the Deleted row, and a
//     scoped teardown+re-seed removed it with zero residue (TechFlow org-wide rows 17 → 14 → 17).
//
// The residual risk is OURS, not the platform's: if someone ever narrows `searchMemberships()` — adds a
// `statuses` filter, an "only active" optimisation, or filters the ids by status in `deleteUserByEmail`
// — the Deleted-status row silently stops being deleted. Nothing else would catch it: teardown still
// reports success, the orphan row is invisible to `td:validate` (static) and to `td:reconcile` [11]
// (which probes MEMBER guids, not membership rows), and the next re-seed mints a NEW row rather than
// colliding. So the failure is a slow leak of rows nobody owns. These tests assert the two properties
// that keep it closed.
//
// Pure/mocked — no env, no network. Run: `node --test scripts/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { __setApi, setFlags, deleteUserByEmail } from '../lib/user-provision.mjs';
import { MANUALLY_SELECTABLE_STATUSES } from '../seed-data/b2b/membership-alias-specs.mjs';

const MEMBERSHIPS = '/customer/organization-memberships';
const EMAIL = 'agent-test-tf-mbr-deleted-20260803@yopmail.com';
const ACCOUNT_ID = 'acct-tf-mbr-deleted';
const CONTACT_ID = 'contact-tf-mbr-deleted';

/**
 * Recording mock of the teardown surface. `memberships` are the rows that exist on the platform for
 * this account, whatever their status.
 *
 * The membership search MIRRORS THE REAL SERVER's status semantics — BuildQuery narrows by
 * `criteria.Statuses` only when that list is non-empty, and ignores it otherwise. That fidelity is
 * what gives these tests teeth: a mock that returned `memberships` unconditionally would keep
 * passing even if the caller started sending a status filter, which is the exact regression at issue.
 */
function makeApiMock({ memberships = [] } = {}) {
  const calls = [];
  const api = async (method, path, body) => {
    calls.push({ method, path, body });
    if (method === 'POST' && path.includes('/security/users/search')) {
      return { results: [{ id: ACCOUNT_ID, userName: EMAIL, email: EMAIL, memberId: CONTACT_ID }] };
    }
    if (method === 'POST' && path.includes(`${MEMBERSHIPS}/search`)) {
      const wanted = body?.statuses ?? body?.Statuses;
      const results = Array.isArray(wanted) && wanted.length
        ? memberships.filter((m) => wanted.includes(m.status))
        : memberships;
      return { results, totalCount: results.length };
    }
    if (method === 'DELETE') return null;
    return null;
  };
  const searches = () => calls.filter((c) => c.method === 'POST' && c.path.includes(`${MEMBERSHIPS}/search`));
  const membershipDeletes = () => calls.filter((c) => c.method === 'DELETE' && c.path.includes(MEMBERSHIPS));
  return { api, calls, searches, membershipDeletes };
}
const useMock = (opts) => { const m = makeApiMock(opts); setFlags({ dryRun: false, verbose: false }); __setApi(m.api); return m; };

/** The membership ids teardown actually asked the platform to delete, across all DELETE calls. */
const deletedIds = (m) => m.membershipDeletes()
  .flatMap((c) => [...new URL(`http://x${c.path}`).searchParams.getAll('ids')])
  .sort();

const row = (id, status) => ({ id, organizationId: 'org-techflow', status, isLocked: false, roles: [{ roleId: 'org-employee' }] });

test('teardown deletes a membership row whose status is Deleted (Deleted is a status, not a row deletion)', async () => {
  const m = useMock({ memberships: [row('mem-deleted', 'Deleted')] });

  const res = await deleteUserByEmail(EMAIL);

  assert.deepEqual(deletedIds(m), ['mem-deleted'],
    'the Deleted-status row must be included in the membership DELETE — otherwise ORG_TF_MBR_DELETED orphans a row on every teardown');
  assert.equal(res.account, true, 'the security account is still deleted');
  assert.equal(res.contact, true, 'the contact is still deleted');
});

test('teardown is status-AGNOSTIC: every legal status is swept, including the blocking ones', async () => {
  const rows = MANUALLY_SELECTABLE_STATUSES.map((s, i) => row(`mem-${i}-${s.toLowerCase()}`, s));
  // A row the platform stores with no status override at all (null) must be swept too.
  rows.push(row('mem-null', null));
  const m = useMock({ memberships: rows });

  await deleteUserByEmail(EMAIL);

  assert.deepEqual(deletedIds(m), rows.map((r) => r.id).sort(),
    `every membership row must be deleted regardless of status (legal set: ${[...MANUALLY_SELECTABLE_STATUSES].join(', ')}, plus null)`);
});

test('teardown does NOT narrow the membership search by status', async () => {
  const m = useMock({ memberships: [row('mem-deleted', 'Deleted')] });

  await deleteUserByEmail(EMAIL);

  const [search] = m.searches();
  assert.ok(search, 'teardown must search for memberships before deleting');
  // The platform only filters when `Statuses` is non-empty (vc-module-customer
  // OrganizationMembershipSearchService.BuildQuery), so sending ANY status key re-opens the orphan.
  for (const key of ['statuses', 'Statuses', 'status', 'Status']) {
    assert.ok(!(key in (search.body || {})),
      `the teardown membership search must not send "${key}" — a status filter would hide Deleted/Rejected/Invited rows from teardown and orphan them`);
  }
  assert.equal(search.body.userId, ACCOUNT_ID, 'the search is scoped by the account id only');
});
