// Unit tests for the membership_status REQUIRED-ness contract (VCST-5281 follow-up).
//
// WHY THIS FILE EXISTS — and why it reads the REAL CSVs rather than only synthetic rows:
// membership-status.test.mjs proves the seeder can THREAD a status, and that a drifted one is healed.
// It says nothing about whether the committed fixtures actually DECLARE one. They did not: the
// `membership_status` column shipped on all three sources with every cell blank, so the seeded
// outcome was status=null everywhere and `ResolveEffectiveStatus` fell through to the CONTACT's
// status. A case asserting a per-org status was therefore asserting a property of a different
// entity — invisible from the fixture row, and silently re-meaninged the moment the contact's status
// is edited. `td:validate:b2b` [9] is the real gate; these tests are the fast, network-free twin, and
// the fixture-level group below is what would actually catch a NEW row authored with a blank cell.
//
// The legal set is imported, never re-listed (provenance: vc-module-customer@2605501d
// ModuleConstants.MembershipStatuses, re-verified live via
// GET /api/platform/settings/Customer.OrganizationMembershipStatuses).
//
// Pure — no env, no network. Run: `npx tsx --test scripts/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  findStatusProblems, rowCreatesMembership, statusCoverage,
  normalizeMembershipStatus, isBlockingMembershipStatus,
  MANUALLY_SELECTABLE_STATUSES, BLOCKING_STATUSES, REINVITABLE_STATUSES,
  DEFAULT_MEMBERSHIP_STATUS, STATUS_COLUMN, STATUS_SETTING_NAME, STATUS_SOURCE_REF,
} from '../seed-data/b2b/membership-alias-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), {
  columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true,
});

// The three sources the seeder creates OrganizationMemberships from, each with the column that GATES
// creation. Kept identical to validate-b2b-data.mjs [9] on purpose — if they diverge, the fast gate
// and the real gate disagree, which is worse than having only one.
const SOURCES = [
  { name: 'test-data/b2b/organization-memberships.csv', label: 'membership', idCol: 'membership_id', emailCol: 'user_email', orgCol: null, roleCol: 'role_id' },
  { name: 'test-data/b2b/users.csv', label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id', roleCol: 'roles' },
  { name: 'test-data/white-labeling/users.csv', label: 'wl-user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id', roleCol: 'roles' },
];

// ── the vocabulary is grounded, and is NOT the contact-status vocabulary ────────────────────────
test('the legal set is exactly the four MembershipStatuses values, and Approved is the only non-blocking one', () => {
  assert.deepEqual([...MANUALLY_SELECTABLE_STATUSES], ['Invited', 'Approved', 'Rejected', 'Deleted']);
  assert.deepEqual([...BLOCKING_STATUSES], ['Invited', 'Rejected', 'Deleted']);
  assert.deepEqual([...REINVITABLE_STATUSES], ['Rejected', 'Deleted']);
  assert.equal(DEFAULT_MEMBERSHIP_STATUS, 'Approved');
  // The happy-path default must be the one value that leaves a fixture able to sign in. If this ever
  // flips, every "Approved" fixture in the repo silently becomes a blocked one.
  assert.equal(isBlockingMembershipStatus(DEFAULT_MEMBERSHIP_STATUS), false);
  assert.equal(MANUALLY_SELECTABLE_STATUSES.filter((s) => !isBlockingMembershipStatus(s)).length, 1);
  // Provenance is quoted in gate output so a failure names its own oracle.
  assert.equal(STATUS_SETTING_NAME, 'Customer.OrganizationMembershipStatuses');
  assert.match(STATUS_SOURCE_REF, /2605501d/);
});

test('CONTACT statuses are a DIFFERENT, wider vocabulary — never legal for a membership', () => {
  // Customer.ContactStatuses allows six values on the same env (Deleted, New, Locked, Invited,
  // Rejected, Approved). "New"/"Locked" are legal for a contact but are NOT membership statuses, and
  // because they are also absent from BlockingStatuses they would fall through as NON-blocking — so a
  // value copied across the two vocabularies produces a fixture that silently grants access.
  for (const contactOnly of ['New', 'Locked']) {
    assert.equal(MANUALLY_SELECTABLE_STATUSES.includes(contactOnly), false, `${contactOnly} must not be a membership status`);
    const { problems } = findStatusProblems([{ membership_id: 'MOM-X', user_email: 'x@t.test', [STATUS_COLUMN]: contactOnly }]);
    assert.equal(problems.length, 1, `${contactOnly} must be rejected by the gate`);
    assert.match(problems[0], /illegal OrganizationMembership status/);
  }
});

// ── rowCreatesMembership: the required-vs-inert discriminator ───────────────────────────────────
test('rowCreatesMembership: an empty role cell means NO membership row is created', () => {
  // This is the mechanism, not a heuristic: provisionContactLogins/seedInlineOrgUsers pair each org
  // with its index-parallel role and then filter out any pair without one. It is exactly how
  // ORG_ASSOC_ONLY_NO_GLOBAL is built (USR-025, empty `roles`).
  assert.equal(rowCreatesMembership({ roles: '' }, 'roles'), false);
  assert.equal(rowCreatesMembership({ roles: '   ' }, 'roles'), false);
  assert.equal(rowCreatesMembership({ roles: ';;' }, 'roles'), false, 'separators only ⇒ still no role');
  assert.equal(rowCreatesMembership({}, 'roles'), false, 'absent cell ⇒ no role');
  assert.equal(rowCreatesMembership({ roles: 'Organization employee' }, 'roles'), true);
  assert.equal(rowCreatesMembership({ roles: ';Purchasing agent' }, 'roles'), true, 'one non-blank slot is enough');
  // roleCol null ⇒ caller does not model roles; assume creating, which is the stricter reading.
  assert.equal(rowCreatesMembership({ roles: '' }, null), true);
});

test('a status DECLARED on a row that creates no membership is a hard failure (inert, reads as coverage)', () => {
  const { problems } = findStatusProblems(
    [{ user_id: 'USR-Z', email: 'z@t.test', org_id: 'ORG-001;ORG-002', roles: '', [STATUS_COLUMN]: 'Invited' }],
    { label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id', roleCol: 'roles' },
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /creates NO OrganizationMembership/);
  assert.match(problems[0], /inert/);
});

test('a BLANK status on a row that creates no membership is correct — and must NOT be flagged', () => {
  // The USR-022 / USR-025 shape. Requiring a status here would force an authoring lie.
  const { problems, blocking } = findStatusProblems(
    [{ user_id: 'USR-022', email: 'i@t.test', org_id: 'ORG-002', roles: '', [STATUS_COLUMN]: '' }],
    { label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id', roleCol: 'roles' },
  );
  assert.deepEqual(problems, []);
  assert.deepEqual(blocking, []);
});

test('a blank SLOT inside the ;-form is a failure, and the message names the slot index', () => {
  // The `;`-form is index-parallel with org_id, so a blank slot silently seeds status=null for that
  // ONE org — the hardest variant of this bug to see by eye.
  const { problems } = findStatusProblems(
    [{ user_id: 'USR-M', email: 'm@t.test', org_id: 'ORG-001;ORG-002;ORG-003', roles: 'a;b;c', [STATUS_COLUMN]: 'Approved;;Rejected' }],
    { label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id', roleCol: 'roles' },
  );
  assert.equal(problems.length, 1);
  assert.match(problems[0], /blank slot\(s\) at index 1/);
});

test('every legal value is accepted on a membership-creating row; blocking ones warn but never fail', () => {
  for (const s of MANUALLY_SELECTABLE_STATUSES) {
    const { problems, blocking } = findStatusProblems(
      [{ membership_id: 'MOM-X', user_email: 'x@t.test', role_id: 'org-employee', [STATUS_COLUMN]: s }],
      { roleCol: 'role_id' },
    );
    assert.deepEqual(problems, [], `${s} must pass the gate`);
    assert.equal(blocking.length, isBlockingMembershipStatus(s) ? 1 : 0, `${s} blocking-warning count`);
  }
});

// ── statusCoverage ─────────────────────────────────────────────────────────────────────────────
test('statusCoverage reports missing values and ignores rows that create no membership', () => {
  const rows = [
    { role_id: 'r', [STATUS_COLUMN]: 'Approved' },
    { role_id: 'r', [STATUS_COLUMN]: 'Invited' },
    { role_id: '', [STATUS_COLUMN]: 'Rejected' }, // creates nothing ⇒ must NOT count as coverage
  ];
  const cov = statusCoverage(rows, 'role_id');
  assert.deepEqual(cov.covered, ['Invited', 'Approved']);
  assert.deepEqual(cov.missing, ['Rejected', 'Deleted']);
  assert.equal(cov.counts.Approved, 1);
  assert.equal(cov.counts.Rejected, 0, 'an inert declaration is not coverage');
});

// ── THE FIXTURE-LEVEL GATE: the committed CSVs themselves ──────────────────────────────────────
for (const src of SOURCES) {
  test(`FIXTURES ${src.name}: every membership-creating row declares a concrete ${STATUS_COLUMN}`, () => {
    const rows = readCsv(src.name);
    assert.ok(rows.length, 'source must not be empty');
    assert.ok(rows.some((r) => r[STATUS_COLUMN] !== undefined), `${src.name} must carry the ${STATUS_COLUMN} column`);

    const { problems } = findStatusProblems(rows, src);
    assert.deepEqual(problems, [], `${src.name} must have no status problems`);

    // Asserted directly too, not only via findStatusProblems — so a future loosening of the gate
    // cannot make this test vacuously pass.
    for (const r of rows) {
      const declared = normalizeMembershipStatus(r[STATUS_COLUMN]);
      const creates = rowCreatesMembership(r, src.roleCol);
      const tag = `${src.name} ${r[src.idCol]}`;
      if (creates) assert.ok(declared !== null, `${tag} creates a membership ⇒ must declare a status`);
      else assert.equal(declared, null, `${tag} creates no membership ⇒ status must be blank`);
    }
  });
}

test('FIXTURES: the whole set covers all four legal statuses (no IsBlocking branch unrepresented)', () => {
  const covered = new Set();
  for (const src of SOURCES) for (const s of statusCoverage(readCsv(src.name), src.roleCol).covered) covered.add(s);
  assert.deepEqual(
    MANUALLY_SELECTABLE_STATUSES.filter((s) => !covered.has(s)), [],
    'a value with no seeded representative cannot be exercised without a test writing it first',
  );
});

test('FIXTURES: each blocking-status fixture is SINGLE-org and on its own dedicated account', () => {
  // Two load-bearing properties. (1) Single-org: a second org lets GetAccessibleOrganizationIdsAsync
  // fall through to a healthy org and MASK the refusal, so the case would pass while testing nothing.
  // (2) Dedicated account: a blocking status prevents org sign-in, so sharing the account with any
  // happy-path fixture would block that fixture too.
  const rows = readCsv('test-data/b2b/organization-memberships.csv');
  const rowsByEmail = new Map();
  for (const r of rows) {
    const k = String(r.user_email || '').toLowerCase();
    rowsByEmail.set(k, [...(rowsByEmail.get(k) || []), r]);
  }
  const blocking = rows.filter((r) => isBlockingMembershipStatus(r[STATUS_COLUMN]));
  assert.ok(blocking.length >= 2, 'at least Invited + Rejected representatives must exist');

  for (const r of blocking) {
    const siblings = rowsByEmail.get(String(r.user_email).toLowerCase());
    assert.equal(siblings.length, 1, `${r.membership_id} must own exactly ONE membership row (single-org) — found ${siblings.length}`);
    assert.ok(String(r.user_email).startsWith('agent-test-'), `${r.membership_id} must be an AGENT-TEST- account so teardown sweeps it`);
    assert.ok(String(r.alias || '').trim(), `${r.membership_id} must declare an alias so its runtime ids write back`);
  }

  // No blocking fixture may share an account with a non-blocking one — that is the collision that
  // would silently lock a happy-path suite out of its own org.
  for (const [email, group] of rowsByEmail) {
    const kinds = new Set(group.map((r) => isBlockingMembershipStatus(r[STATUS_COLUMN])));
    assert.equal(kinds.size, 1, `account ${email} mixes blocking and non-blocking membership statuses`);
  }
});

test('FIXTURES: passwords stay {{VAR}} tokens and no runtime GUID leaks into the status column', () => {
  const guid = /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
  for (const src of SOURCES) {
    for (const r of readCsv(src.name)) {
      const tag = `${src.name} ${r[src.idCol]}`;
      if (r.password !== undefined && String(r.password).trim()) {
        assert.match(String(r.password), /^\{\{[A-Z0-9_]+\}\}$/, `${tag} password must be a {{VAR}} token, never a literal`);
      }
      assert.equal(guid.test(String(r[STATUS_COLUMN] ?? '').trim()), false, `${tag} ${STATUS_COLUMN} must not hold a GUID`);
    }
  }
});
