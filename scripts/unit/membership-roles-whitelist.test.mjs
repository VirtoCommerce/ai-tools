// Unit tests for the STORE-LEVEL membership-roles whitelist spec module. Pure — no env, no network.
//
// SCOPE, per `.claude/rules/test-data.md` FOURTH RULE: this file tests the DERIVATION and nothing
// else. It deliberately does NOT assert that ORG_ROLE_NAMES equals three particular strings, that
// DESCRIPTOR_POOL holds three particular strings, or that the alias declares particular fields —
// those are DECLARATIONS, they live one file away in the same commit, and `td:validate:b2b` already
// owns them (and adds the overlay-split and committed-pre_state checks on top). Every guard function
// below is therefore exercised with SYNTHETIC inputs, so a failure here means the logic is wrong,
// never merely that someone edited the fixture on purpose.
//
// The four computations whose silent failure is expensive:
//   1. `sameSet` — the platform REORDERS a dictionary value on write, so an order-sensitive
//      comparison would call every successful write a failure and every re-run a change.
//   2. `capturePreState` — write-once. Recapture on a second apply would record the FIXTURE as the
//      original, and teardown would permanently restore the fixture instead of the environment.
//   3. `planTeardown` — must REFUSE rather than fall back to empty, because an empty store value is
//      a third behavioural state (the picker falls back to the GLOBAL whitelist), not a clean slate.
//   4. `selectSalesRepRoles` — the permission predicate. Name-matching over-collects badly on the
//      real environment, so the predicate being permission-driven is the whole point.
//   5. `buildNarrowedValues` + `findNarrowingProblems` + `findOverlayProblems` — the narrowed
//      variant is the seeded set MINUS one declared role. If the omitted role is absent from the
//      seeded set, a plain filter silently returns the seeded set unchanged, and a case asserting
//      "the role disappeared from the picker" passes against a whitelist that still contains
//      everything. Nothing downstream notices, so these must throw/flag instead of degrading.
//      (The declared VALUE of NARROWED_OMITTED_ROLE is NOT asserted here — that is a declaration,
//      and `td:validate:b2b` [10] owns it, live page-position evidence included.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tenantValuesPath, toSet, sameSet, selectSalesRepRoles, buildWhitelist, buildWriteBody,
  planWrite, capturePreState, planTeardown, entriesOutsideDefaultPage,
  findRoleProblems, findDecidabilityProblems, findAliasProblems,
  buildNarrowedValues, toJsonArrayField, parseJsonArrayField, findNarrowingProblems, findOverlayProblems,
  // Imported so the alias-shape fixture below can be DERIVED from the spec rather than re-typed —
  // a re-typed literal here would restate a declaration `td:validate:b2b` already owns.
  ALIAS, SETTING_NAME, TENANT_TYPE, ORG_ROLE_NAMES, NARROWED_OMITTED_ROLE,
} from '../seed-data/b2b/membership-roles-whitelist-specs.mjs';

/* ── 1. URL builder ───────────────────────────────────────────────────────────────────────────── */

test('tenantValuesPath builds the v2 tenant-values route and encodes the tenant id', () => {
  assert.equal(tenantValuesPath('B2B-store'), '/api/platform/settings/v2/tenant/Store/B2B-store/values');
  // A store id may legally contain a space or a slash; an unencoded one would silently address a
  // different route (or 404) rather than erroring.
  assert.equal(tenantValuesPath('My Store'), '/api/platform/settings/v2/tenant/Store/My%20Store/values');
  assert.equal(tenantValuesPath('a/b'), '/api/platform/settings/v2/tenant/Store/a%2Fb/values');
  assert.equal(tenantValuesPath('X', 'Catalog'), '/api/platform/settings/v2/tenant/Catalog/X/values');
  assert.throws(() => tenantValuesPath(''), /tenantId is required/);
  assert.throws(() => tenantValuesPath(null), /tenantId is required/);
});

/* ── 2. Set semantics — order-independent, case-insensitive, blank-tolerant ───────────────────── */

test('toSet normalises case and whitespace and drops blanks', () => {
  const s = toSet(['  Organization Employee ', 'organization employee', '', null, 'Purchasing agent']);
  assert.equal(s.size, 2);
  assert.ok(s.has('organization employee'));
  assert.ok(s.has('purchasing agent'));
  assert.equal(toSet(null).size, 0);
  assert.equal(toSet('not an array').size, 0);
});

test('sameSet is ORDER-INDEPENDENT — the platform reorders a dictionary value on write', () => {
  // Measured live: POST ["Organization employee","Sales Representative"] read back as
  // ["Sales Representative","Organization employee"]. Order sensitivity here would make every
  // successful write report as a failed read-back.
  assert.ok(sameSet(['A', 'B'], ['B', 'A']));
  assert.ok(sameSet(['Organization employee'], ['organization employee']));
  assert.ok(sameSet([], []));
  assert.ok(!sameSet(['A'], ['A', 'B']), 'a superset must not compare equal');
  assert.ok(!sameSet(['A', 'B'], ['A']), 'a subset must not compare equal');
  assert.ok(!sameSet(['A'], ['B']));
  assert.ok(!sameSet([], ['A']), 'empty vs non-empty is a real difference — empty is its own behavioural state');
});

/* ── 3. The sales-rep predicate ───────────────────────────────────────────────────────────────── */

test('selectSalesRepRoles selects by PERMISSION, not by name', () => {
  const roles = [
    { name: 'Sales Representative', permissions: ['sales-rep:access'] },
    { name: 'Advanced Sales Representative', permissions: ['sales-rep:access', 'sales-rep-documents:read'] },
    // These three are the real trap: on vcst they all LOOK sales-rep and carry no sales-rep grant.
    { name: 'Sales Rep', permissions: ['customer:read', 'store:read'] },
    { name: 'Sales Executive', permissions: ['order:read'] },
    { name: 'AGENT-TEST-SalesRep-Full', permissions: ['customer:read', 'customer:create'] },
    // Carries a sales-rep permission, but NOT the grant — must be excluded.
    { name: 'Sales Rep Documents Manager', permissions: ['sales-rep-documents:read', 'sales-rep-documents:write'] },
    { name: 'Catalog manager', permissions: [] },
    { name: 'No perms field' },
  ];
  assert.deepEqual(selectSalesRepRoles(roles).map((r) => r.name), ['Sales Representative', 'Advanced Sales Representative']);
});

test('selectSalesRepRoles accepts permissions as objects as well as strings, and is case-insensitive', () => {
  const roles = [
    { name: 'A', permissions: [{ name: 'sales-rep:access' }] },
    { name: 'B', permissions: ['SALES-REP:ACCESS'] },
    { name: 'C', permissions: [{ name: 'customer:read' }] },
  ];
  assert.deepEqual(selectSalesRepRoles(roles).map((r) => r.name), ['A', 'B']);
});

test('selectSalesRepRoles returns empty rather than throwing on junk input', () => {
  assert.deepEqual(selectSalesRepRoles(null), []);
  assert.deepEqual(selectSalesRepRoles([{ name: 'X', permissions: null }]), []);
  assert.deepEqual(selectSalesRepRoles([], 'sales-rep:access'), []);
});

/* ── 4. Composition ───────────────────────────────────────────────────────────────────────────── */

test('buildWhitelist dedupes case-insensitively but PRESERVES the first spelling', () => {
  // The stored value is a display name the picker renders verbatim, so a case fold would leak to UI.
  const out = buildWhitelist(['Organization Employee', 'Purchasing agent'], ['organization employee', 'Sales Representative']);
  assert.deepEqual(out, ['Organization Employee', 'Purchasing agent', 'Sales Representative']);
});

test('buildWhitelist keeps org roles first, drops blanks, and trims', () => {
  assert.deepEqual(buildWhitelist(['  A  ', '', null], ['B']), ['A', 'B']);
  assert.deepEqual(buildWhitelist([], []), []);
});

test('buildWriteBody produces a single-key partial-merge patch', () => {
  assert.deepEqual(buildWriteBody(['A', 'B'], 'Some.Setting'), { 'Some.Setting': ['A', 'B'] });
  assert.equal(Object.keys(buildWriteBody([], 'X')).length, 1, 'the body must never carry a second key');
  assert.throws(() => buildWriteBody('not an array'), /must be an array/);
});

/* ── 5. Idempotency ───────────────────────────────────────────────────────────────────────────── */

test('planWrite is a no-op when live already equals target, regardless of ORDER', () => {
  const p = planWrite(['B', 'A'], ['A', 'B']);
  assert.equal(p.changed, false);
  assert.equal(p.body, null);
});

test('planWrite writes when the sets differ, and the body carries the TARGET not the live value', () => {
  const p = planWrite(['A'], ['A', 'B'], 'S');
  assert.equal(p.changed, true);
  assert.deepEqual(p.body, { S: ['A', 'B'] });
});

/* ── 6. PRE-STATE capture — write-once. The expensive one. ────────────────────────────────────── */

test('capturePreState captures on a first apply', () => {
  const c = capturePreState(null, ['Organization employee'], ['Organization employee', 'Sales Representative']);
  assert.equal(c.capture, true);
  assert.deepEqual(c.value, ['Organization employee']);
});

test('capturePreState NEVER overwrites an existing capture — else teardown restores the fixture', () => {
  // A second apply sees live === the seeded set. Recapturing would record the FIXTURE as "original",
  // and teardown would then restore the fixture forever. This is the bug the guard exists for.
  const c = capturePreState('["Organization employee"]', ['Organization employee', 'Sales Representative'], ['Organization employee', 'Sales Representative']);
  assert.equal(c.capture, false);
  assert.match(c.reason, /already captured/);
});

test('capturePreState refuses when live ALREADY equals the target (nothing original left to record)', () => {
  const c = capturePreState(null, ['A', 'B'], ['B', 'A']);
  assert.equal(c.capture, false);
  assert.match(c.reason, /would record the FIXTURE as the original/);
});

test('capturePreState treats an EMPTY-STRING capture as absent, not as a captured empty list', () => {
  // The alias field is a string and is '' in the committed base. Reading '' as "captured []" would
  // make teardown clear the store whitelist — which is a real behavioural change, not a restore.
  assert.equal(capturePreState('', ['A'], ['A', 'B']).capture, true);
  assert.equal(capturePreState(undefined, ['A'], ['A', 'B']).capture, true);
  // A genuinely captured empty list is JSON '[]', which IS a capture and must not be recaptured.
  assert.equal(capturePreState('[]', ['A'], ['A', 'B']).capture, false);
});

/* ── 7. Teardown — restores the pre-state, refuses to guess ───────────────────────────────────── */

test('planTeardown REFUSES when nothing was captured — empty is not a neutral fallback', () => {
  const p = planTeardown(null, ['A', 'B']);
  assert.equal(p.restore, false);
  assert.equal(p.target, null);
  assert.match(p.reason, /GLOBAL whitelist/, 'the refusal must say WHY empty is not neutral');
  assert.equal(planTeardown('', ['A']).restore, false);
  assert.equal(planTeardown(undefined, ['A']).restore, false);
});

test('planTeardown parses a JSON-encoded capture and targets exactly it', () => {
  const p = planTeardown('["Organization employee"]', ['Organization employee', 'Sales Representative']);
  assert.equal(p.restore, true);
  assert.deepEqual(p.target, ['Organization employee']);
  assert.equal(p.changed, true);
});

test('planTeardown accepts an already-parsed array and reports no change when live matches', () => {
  const p = planTeardown(['A', 'B'], ['B', 'A']);
  assert.equal(p.restore, true);
  assert.equal(p.changed, false, 'order must not manufacture a spurious restore write');
});

test('planTeardown can restore to a captured EMPTY list when that is genuinely what was there', () => {
  const p = planTeardown('[]', ['A']);
  assert.equal(p.restore, true);
  assert.deepEqual(p.target, []);
  assert.equal(p.changed, true);
});

/* ── 8. Picker paging derivation ──────────────────────────────────────────────────────────────── */

test('entriesOutsideDefaultPage reports whitelist entries the un-keyworded picker cannot show', () => {
  const ordered = ['r1', 'r2', 'r3', 'r4', 'r5'];
  assert.deepEqual(entriesOutsideDefaultPage(ordered, ['r1', 'r4', 'r9'], 3), ['r4', 'r9']);
  assert.deepEqual(entriesOutsideDefaultPage(ordered, ['r1', 'r2'], 3), []);
  assert.deepEqual(entriesOutsideDefaultPage(ordered, ['R1'], 3), [], 'matching is case-insensitive, like the picker');
  assert.deepEqual(entriesOutsideDefaultPage([], ['r1'], 3), ['r1']);
});

/* ── 9. The guards, on SYNTHETIC inputs only ──────────────────────────────────────────────────── */

test('findRoleProblems flags a whitelist entry that matches no live role', () => {
  const probs = findRoleProblems({
    orgRoleNames: ['Real Role', 'Ghost Role'],
    salesRepRoles: [{ name: 'SR' }],
    liveRoles: [{ name: 'Real Role' }, { name: 'Ghost Rolex' }],
  });
  assert.equal(probs.length, 1);
  assert.match(probs[0], /Ghost Role/);
  assert.match(probs[0], /silently invisible/);
});

test('findRoleProblems FAILS LOUD when the sales-rep set resolves to zero', () => {
  // The instruction was "plus ALL sales-rep roles"; resolving that to nothing and seeding only the
  // org roles would report success while dropping half the requested set.
  const probs = findRoleProblems({ orgRoleNames: ['R'], salesRepRoles: [], liveRoles: [{ name: 'R' }] });
  assert.equal(probs.length, 1);
  assert.match(probs[0], /resolved to ZERO/);
});

test('findRoleProblems is clean when every entry resolves (case-insensitively)', () => {
  assert.deepEqual(findRoleProblems({
    orgRoleNames: ['organization employee'],
    salesRepRoles: [{ name: 'SR' }],
    liveRoles: [{ name: 'Organization Employee' }, { name: 'SR' }],
  }), []);
});

test('findDecidabilityProblems FAILS when the sales-rep half is empty (the vacuity case)', () => {
  const probs = findDecidabilityProblems({ orgRoleNames: ['A'], salesRepRoleNames: [], pool: ['A'] });
  assert.equal(probs.length, 1);
  assert.match(probs[0], /vacuous pass/);
});

test('findDecidabilityProblems FAILS when a sales-rep role drifts INSIDE the module pool', () => {
  // The discriminating property is that the sales-rep entries could ONLY have come from the stored
  // tenant value. A sales-rep role inside the descriptor pool destroys exactly that.
  const probs = findDecidabilityProblems({ orgRoleNames: ['A'], salesRepRoleNames: ['B'], pool: ['A', 'B'] });
  assert.equal(probs.length, 1);
  assert.match(probs[0], /INSIDE the module's hardcoded pool/);
});

test('findDecidabilityProblems FAILS when an org role sits outside the pool', () => {
  const probs = findDecidabilityProblems({ orgRoleNames: ['A', 'Z'], salesRepRoleNames: ['S'], pool: ['A'] });
  assert.equal(probs.length, 1);
  assert.match(probs[0], /"Z"/);
});

test('findDecidabilityProblems FAILS when the two halves overlap', () => {
  const probs = findDecidabilityProblems({ orgRoleNames: ['A'], salesRepRoleNames: ['A', 'S'], pool: ['A'] });
  assert.ok(probs.some((p) => /BOTH halves/.test(p)));
});

test('findDecidabilityProblems is clean for a properly diverging set', () => {
  assert.deepEqual(findDecidabilityProblems({ orgRoleNames: ['A', 'B'], salesRepRoleNames: ['S1', 'S2'], pool: ['A', 'B'] }), []);
});

test('findAliasProblems rejects a committed runtime field — that would leak one env state to all', () => {
  // The static fields are DERIVED from the spec's own exports, never re-typed. Re-typing them would
  // make this test fail whenever someone deliberately edits a declaration — which `td:validate:b2b`
  // already owns, and which the FOURTH RULE says is not this file's business. Measured: with
  // `narrowed_omitted_role` written as a literal here, mutating NARROWED_OMITTED_ROLE went RED in
  // BOTH the unit test and the guard, i.e. the unit assertion added nothing.
  const base = {
    [ALIAS]: {
      _inline: true,
      fields: {
        setting: SETTING_NAME, tenant_type: TENANT_TYPE,
        org_roles: ORG_ROLE_NAMES.join(';'),
        narrowed_omitted_role: NARROWED_OMITTED_ROLE,
        seeded_values: '', seeded_values_json: '', sales_rep_roles: '', narrowed_values: '',
        pre_state: '', captured_at: '',
      },
      _notes: 'x',
    },
  };
  // Asserted as a DELTA, not as "the base is clean": `findAliasProblems` also grades the module's
  // own declarations (pool membership of NARROWED_OMITTED_ROLE, and so on), so an absolute
  // `deepEqual(…, [])` here would go red on any deliberate declaration edit — which `td:validate:b2b`
  // already catches, and which makes this file duplication (measured: it did, in BOTH).
  const baseProbs = findAliasProblems(base);

  const leaked = structuredClone(base);
  leaked[ALIAS].fields.pre_state = '["Organization employee"]';
  const added = findAliasProblems(leaked).filter((p) => !baseProbs.includes(p));
  assert.equal(added.length, 1, 'a committed runtime field must add exactly one problem');
  assert.match(added[0], /COMMITTED base/);
});

test('findAliasProblems reports a missing alias rather than throwing', () => {
  const probs = findAliasProblems({});
  assert.equal(probs.length, 1);
  assert.match(probs[0], /not registered/);
});

/* ── 10. THE NARROWED VARIANT — the derivation ORGROLE-019's falsification rests on ───────────── */

test('buildNarrowedValues removes exactly the omitted role and preserves the rest, in order', () => {
  const seeded = ['Organization employee', 'Purchasing agent', 'Organization maintainer', 'Sales Representative'];
  assert.deepEqual(
    buildNarrowedValues(seeded, 'Purchasing agent'),
    ['Organization employee', 'Organization maintainer', 'Sales Representative'],
  );
});

test('buildNarrowedValues matches the omitted role case-insensitively and trims, like the picker', () => {
  assert.deepEqual(buildNarrowedValues(['A', '  Purchasing Agent ', 'B'], 'purchasing agent'), ['A', 'B']);
});

test('buildNarrowedValues THROWS when the omitted role is absent — the silent-degradation case', () => {
  // A plain filter would return the seeded set unchanged. The case then writes a whitelist that
  // still contains everything, observes no change, and PASSES its "the role disappeared" assertion.
  assert.throws(
    () => buildNarrowedValues(['Organization employee', 'Sales Representative'], 'Purchasing agent'),
    /is NOT in the seeded set/,
  );
  assert.throws(
    () => buildNarrowedValues(['Organization employee'], 'Purchasing agent'),
    /IDENTICAL to the seeded set/,
  );
});

test('buildNarrowedValues THROWS rather than narrowing to empty — empty is a different state', () => {
  // An empty store value makes the picker SKIP the override and fall back to the GLOBAL whitelist.
  assert.throws(() => buildNarrowedValues(['Purchasing agent'], 'Purchasing agent'), /removed EVERY entry/);
  assert.throws(() => buildNarrowedValues([], 'Purchasing agent'), /seeded set is EMPTY/);
  assert.throws(() => buildNarrowedValues(['A'], ''), /omittedRole is required/);
});

/* ── 11. The JSON-array-shaped field convention ───────────────────────────────────────────────── */

test('toJsonArrayField produces a string that embeds UNQUOTED into a REST body as a real array', () => {
  const s = toJsonArrayField(['Organization employee', 'Sales Representative']);
  assert.equal(s, '["Organization employee","Sales Representative"]');
  // The whole point of the shape: substituted raw by @td(), it must parse back as an array.
  assert.deepEqual(
    JSON.parse(`{"Customer.MembershipRolesWhitelist": ${s}}`)['Customer.MembershipRolesWhitelist'],
    ['Organization employee', 'Sales Representative'],
  );
  assert.equal(toJsonArrayField([]), '[]');
  assert.throws(() => toJsonArrayField('A;B'), /must be an array/);
});

test('toJsonArrayField escapes a value that would otherwise break the embedded body', () => {
  assert.equal(JSON.parse(toJsonArrayField(['a"b'])).length, 1);
  assert.deepEqual(JSON.parse(toJsonArrayField(['a"b', 'c\\d'])), ['a"b', 'c\\d']);
});

test('parseJsonArrayField reads the shape back, treats blank as absent, and rejects the display form', () => {
  assert.deepEqual(parseJsonArrayField('["A","B"]'), ['A', 'B']);
  assert.equal(parseJsonArrayField(''), null);
  assert.equal(parseJsonArrayField(null), null);
  assert.equal(parseJsonArrayField(undefined), null);
  assert.deepEqual(parseJsonArrayField(['A']), ['A'], 'an already-parsed array passes through');
  // The semicolon display form is the exact mistake the two shapes exist to keep apart.
  assert.throws(() => parseJsonArrayField('A;B', 'X.f'), /X\.f is not JSON-array-shaped/);
  assert.throws(() => parseJsonArrayField('{"a":1}', 'X.f'), /not an array/);
});

/* ── 12. Narrowing admissibility — the guard that stops a paging artifact reading as evidence ─── */

const PAGE = ['r01', 'r02', 'Purchasing agent', 'r04', 'Organization employee'];
const SEEDED = ['Organization employee', 'Purchasing agent', 'Sales Representative'];

test('findNarrowingProblems is clean for an in-page pool role that is in the seeded set', () => {
  assert.deepEqual(findNarrowingProblems({
    seededValues: SEEDED,
    omittedRole: 'Purchasing agent',
    orderedLiveRoleNames: PAGE,
    pageSize: 4,
    pool: ['Organization employee', 'Purchasing agent'],
  }), []);
});

test('findNarrowingProblems FLAGS an omitted role outside the picker default page (paging artifact)', () => {
  // 'Organization employee' is position 5 with pageSize 4 — absent from the un-keyworded picker
  // whether or not it is whitelisted, so its disappearance would not be evidence of narrowing.
  const probs = findNarrowingProblems({
    seededValues: SEEDED,
    omittedRole: 'Organization employee',
    orderedLiveRoleNames: PAGE,
    pageSize: 4,
    pool: ['Organization employee', 'Purchasing agent'],
  });
  assert.equal(probs.length, 1);
  assert.match(probs[0], /position 5/, 'the message must name the live position so a reader can re-check it');
  assert.match(probs[0], /PAGING artifact/);
});

test('findNarrowingProblems FLAGS an omitted role that matches no live role', () => {
  const probs = findNarrowingProblems({
    seededValues: ['Ghost', 'A'],
    omittedRole: 'Ghost',
    orderedLiveRoleNames: PAGE,
    pageSize: 4,
    pool: ['Ghost'],
  });
  assert.ok(probs.some((p) => /matches NO live role/.test(p)));
});

test('findNarrowingProblems FLAGS an omitted role outside the module pool', () => {
  // Narrowing is "the override HIDES an option otherwise offered"; a non-pool entry hides nothing.
  const probs = findNarrowingProblems({
    seededValues: SEEDED,
    omittedRole: 'Sales Representative',
    orderedLiveRoleNames: null,
    pool: ['Organization employee', 'Purchasing agent'],
  });
  assert.equal(probs.length, 1);
  assert.match(probs[0], /NOT in the module's hardcoded pool/);
});

test('findNarrowingProblems FLAGS an omitted role absent from the seeded set', () => {
  const probs = findNarrowingProblems({
    seededValues: ['Organization employee'],
    omittedRole: 'Purchasing agent',
    pool: ['Organization employee', 'Purchasing agent'],
  });
  assert.ok(probs.some((p) => /not present in the seeded set/.test(p)));
});

test('findNarrowingProblems FLAGS a narrowing that empties the whitelist', () => {
  const probs = findNarrowingProblems({
    seededValues: ['Purchasing agent'],
    omittedRole: 'Purchasing agent',
    pool: ['Purchasing agent'],
  });
  assert.ok(probs.some((p) => /GLOBAL whitelist/.test(p)), 'must say WHY empty is not "narrowest"');
});

test('findNarrowingProblems runs its declaration-only checks with no live list supplied', () => {
  // The static td:validate:b2b guard has no network; it must still grade the pool membership.
  assert.deepEqual(findNarrowingProblems({
    seededValues: [],
    omittedRole: 'Purchasing agent',
    pool: ['Purchasing agent'],
  }), []);
  assert.equal(findNarrowingProblems({ omittedRole: '', pool: ['A'] }).length, 1);
});

/* ── 13. Overlay grading — the drift nothing else can see ─────────────────────────────────────── */

// SYNTHETIC throughout. `findOverlayProblems` takes `omittedRole`/`pool` as parameters precisely so
// these tests never mention what the spec DECLARES — a fixture built from the real constants went
// red in BOTH the unit test and the guard when NARROWED_OMITTED_ROLE was mutated (measured), i.e.
// the unit assertion was duplication. What is under test here is the guard's arithmetic.
const OPTS = { omittedRole: 'P', pool: ['E', 'P', 'M'] };
const OVERLAY_OK = {
  seeded_values: 'E;P;M;S',
  seeded_values_json: '["E","P","M","S"]',
  narrowed_values: '["E","M","S"]',
  pre_state: '["E"]',
};

test('findOverlayProblems is clean for a correctly seeded overlay, and silent on an unseeded one', () => {
  assert.deepEqual(findOverlayProblems(OVERLAY_OK, 'aliases.test.json', OPTS), []);
  assert.deepEqual(findOverlayProblems(undefined, 'aliases.test.json', OPTS), [], 'an env that has never been seeded is not a defect');
  assert.deepEqual(findOverlayProblems({}, 'aliases.test.json', OPTS), []);
});

test('findOverlayProblems FAILS when narrowed_values has collapsed into the seeded set', () => {
  // This is the exact silent degradation ORGROLE-019 depends on NOT happening: both writes succeed,
  // the seeder reports success, and the case keeps passing while deciding nothing.
  const ov = { ...OVERLAY_OK, narrowed_values: OVERLAY_OK.seeded_values_json };
  const probs = findOverlayProblems(ov, 'aliases.test.json', OPTS);
  assert.ok(probs.some((p) => /omits NOTHING/.test(p)));
});

test('findOverlayProblems FAILS when narrowed_values is not seeded minus the declared role', () => {
  // Drops the WRONG entry: 'M' instead of 'P'. Same size, so only the derivation check catches it.
  const ov = { ...OVERLAY_OK, narrowed_values: '["E","P","S"]' };
  const probs = findOverlayProblems(ov, 'aliases.test.json', OPTS);
  assert.ok(probs.some((p) => /is not the declared derivation/.test(p)));
});

test('findOverlayProblems FAILS when the display and JSON renderings of the seeded set disagree', () => {
  const ov = { ...OVERLAY_OK, seeded_values: 'E;P' };
  const probs = findOverlayProblems(ov, 'aliases.test.json', OPTS);
  assert.ok(probs.some((p) => /describe DIFFERENT sets/.test(p)));
});

test('findOverlayProblems reports the missing JSON handles rather than letting a case hardcode', () => {
  const noJson = { seeded_values: 'E;P', pre_state: '["E"]' };
  const probs = findOverlayProblems(noJson, 'aliases.test.json', OPTS);
  assert.ok(probs.some((p) => /no seeded_values_json/.test(p)));

  const noNarrowed = { seeded_values: 'E;P', seeded_values_json: '["E","P"]' };
  assert.ok(findOverlayProblems(noNarrowed, 'aliases.test.json', OPTS).some((p) => /no narrowed_values/.test(p)));
});

test('findOverlayProblems reports a malformed JSON field instead of throwing out of the validator', () => {
  const probs = findOverlayProblems({ ...OVERLAY_OK, narrowed_values: 'A;B' }, 'aliases.test.json', OPTS);
  assert.ok(probs.some((p) => /narrowed_values is not JSON-array-shaped/.test(p)));
});
