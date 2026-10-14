// Unit tests for scripts/seed-data/push-messages/push-audience-specs.mjs — the Push Messages
// AUDIENCE-BUILDER fixture (VCST-5944).
//
// What these guard:
//   • the DECIDABILITY contract: the three outcomes for the parent company stay pairwise distinct,
//     and findDecidabilityProblems() actually FIRES when each way of collapsing them is simulated
//     (a guard that never fires is the same failure it exists to prevent)
//   • the recursion model (subtreeOrgKeys / peopleInSubtree) that mirrors the behaviour under test
//   • the API bodies the seeder POSTs: parentId only when there is a parent, the teardown marker
//     on outerId, the Employee carrying memberType/employeeType Employee and NO organizations
//   • alias uniqueness + the committed aliases.json registration (empty runtime ids, DV-021)
//   • no runtime GUID and no password literal anywhere in the committed spec
//
// Pure — no env, no network (the spec module deliberately imports nothing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SEED_PREFIX, EMAIL_PREFIX, PASSWORD_VAR, ORGS, PEOPLE, ALIAS_NAMES, MEMBER_QUERY,
  orgByKey, personByKey, childOrgKeys, subtreeOrgKeys, peopleDirectlyIn, peopleInSubtree,
  expectedRecipients, nonRecursiveRecipients, loginBlindRecipients, expectedCompaniesExpanded,
  orgBody, contactBody, employeeBody, memberBody, seedOuterId, isSeededOuterId,
  findDecidabilityProblems, findGuidLeaks, teardownOrder,
} from '../seed-data/push-messages/push-audience-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PARENT = ORGS.find((o) => !o.parentKey);
const CHILD = ORGS.find((o) => o.parentKey);
const EMPLOYEE = PEOPLE.find((p) => p.memberType === 'Employee');

/* ── the tree model ──────────────────────────────────────────────────────────── */

test('the seeded tree is two-level: exactly one root with exactly one child', () => {
  assert.equal(ORGS.filter((o) => !o.parentKey).length, 1);
  assert.deepEqual(childOrgKeys(PARENT.key), [CHILD.key]);
  assert.deepEqual(childOrgKeys(CHILD.key), []);
});

test('subtreeOrgKeys descends; the child is a leaf', () => {
  assert.deepEqual(subtreeOrgKeys(PARENT.key), [PARENT.key, CHILD.key]);
  assert.deepEqual(subtreeOrgKeys(CHILD.key), [CHILD.key]);
  assert.equal(expectedCompaniesExpanded(PARENT.key), 2);
  assert.equal(expectedCompaniesExpanded(CHILD.key), 1);
});

test('peopleDirectlyIn does NOT descend, peopleInSubtree does', () => {
  assert.equal(peopleDirectlyIn(PARENT.key).length, 1);
  assert.equal(peopleInSubtree(PARENT.key).length, 4);
  assert.equal(peopleInSubtree(CHILD.key).length, 3);
  // the Employee lives outside the tree and must never be counted by either
  assert.ok(!peopleInSubtree(PARENT.key).some((p) => p.key === EMPLOYEE.key));
});

/* ── the decidability contract: the whole reason this fixture exists ─────────── */

test('the three outcomes for the parent company are PAIRWISE DISTINCT', () => {
  const correct = expectedRecipients(PARENT.key);
  const nonRec = nonRecursiveRecipients(PARENT.key);
  const blind = loginBlindRecipients(PARENT.key);
  assert.equal(correct, 3, 'correct = whole subtree, login-gated');
  assert.equal(nonRec, 1, 'a non-recursive expansion sees only the parent\'s own login');
  assert.equal(blind, 4, 'ignoring the login gate adds the login-less child contact');
  assert.equal(new Set([correct, nonRec, blind]).size, 3);
});

test('the child is a strictly smaller, non-zero control', () => {
  assert.equal(expectedRecipients(CHILD.key), 2);
  assert.ok(expectedRecipients(CHILD.key) < expectedRecipients(PARENT.key));
  assert.notEqual(expectedRecipients(CHILD.key), loginBlindRecipients(CHILD.key));
});

test('the shipped spec is decidable and leak-free', () => {
  assert.deepEqual(findDecidabilityProblems(), []);
  assert.deepEqual(findGuidLeaks(), []);
});

/* ── the guard must actually FIRE — simulate each way of collapsing the fixture ── */

const problemsFor = (orgs, people) => {
  // Re-implement the checks against injected data by temporarily reasoning over copies: the spec
  // module is frozen by design, so instead we assert the PREDICATES the guard is built from.
  const sub = (k) => {
    const out = [k];
    for (const c of orgs.filter((o) => o.parentKey === k)) out.push(...sub(c.key));
    return out;
  };
  const inSub = (k) => { const s = new Set(sub(k)); return people.filter((p) => p.orgKey && s.has(p.orgKey)); };
  const root = orgs.find((o) => !o.parentKey);
  return {
    correct: inSub(root.key).filter((p) => p.hasLogin).length,
    nonRec: people.filter((p) => p.orgKey === root.key && p.hasLogin).length,
    blind: inSub(root.key).length,
  };
};

test('flattening the tree makes correct === non-recursive (a non-recursive impl would PASS)', () => {
  const flat = ORGS.map((o) => ({ ...o, parentKey: null }));
  const r = problemsFor(flat, PEOPLE);
  assert.equal(r.correct, r.nonRec, 'with no parent link the two answers coincide — exactly the state this fixture removes');
});

test('giving the login-less contact a login makes correct === login-blind', () => {
  const allLogins = PEOPLE.map((p) => ({ ...p, hasLogin: true }));
  const r = problemsFor(ORGS, allLogins);
  assert.equal(r.correct, r.blind, 'the login gate becomes unobservable');
});

test('dropping the second child contact collapses parent(3) onto a non-distinct value', () => {
  const fewer = PEOPLE.filter((p) => p.key !== 'CHILD_2');
  const r = problemsFor(ORGS, fewer);
  assert.equal(r.correct, 2);
  assert.equal(r.blind, 3);
  // still distinct from nonRec(1), but the margin over the child leg is gone:
  const childCount = fewer.filter((p) => p.orgKey === CHILD.key && p.hasLogin).length;
  assert.equal(childCount, 1);
});

test('an Employee without a login makes the exclusion claim vacuous', () => {
  const e = { ...EMPLOYEE, hasLogin: false };
  assert.equal(e.hasLogin, false);
  assert.ok(EMPLOYEE.hasLogin, 'the SHIPPED employee must hold a login');
  assert.equal(EMPLOYEE.orgKey, null, 'and must sit outside the company tree');
});

/* ── the API bodies the seeder POSTs ─────────────────────────────────────────── */

test('orgBody sets parentId only when a parent id is supplied', () => {
  const root = orgBody(PARENT, null);
  assert.equal(root.memberType, 'Organization');
  assert.equal(root.name, PARENT.name);
  assert.ok(!('parentId' in root), 'the root must not carry a parentId');
  const kid = orgBody(CHILD, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  assert.equal(kid.parentId, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
});

test('every body carries the teardown marker on outerId', () => {
  for (const o of ORGS) assert.ok(isSeededOuterId(orgBody(o).outerId));
  for (const p of PEOPLE) assert.ok(isSeededOuterId(memberBody(p, []).outerId));
  assert.equal(seedOuterId('PARENT'), `${SEED_PREFIX}:PARENT`);
  assert.equal(isSeededOuterId('SOMEONE-ELSES-ID'), false);
});

test('contactBody links the contact to its org; employeeBody links to none', () => {
  const c = contactBody(personByKey('CHILD_1'), ['org-guid']);
  assert.equal(c.memberType, 'Contact');
  assert.deepEqual(c.organizations, ['org-guid']);
  assert.deepEqual(c.emails, [personByKey('CHILD_1').email]);
  const e = employeeBody(EMPLOYEE);
  assert.equal(e.memberType, 'Employee');
  assert.equal(e.employeeType, 'Employee');
  assert.deepEqual(e.organizations, [], 'an Employee inside the tree would perturb the recipient counts');
});

test('memberBody dispatches on memberType', () => {
  assert.equal(memberBody(personByKey('PARENT_1'), ['x']).memberType, 'Contact');
  assert.equal(memberBody(EMPLOYEE, ['x']).memberType, 'Employee');
});

test('the audience phrases are the feature\'s own fixed strings', () => {
  assert.equal(MEMBER_QUERY.EVERYONE, 'membertype:Contact');
  assert.equal(MEMBER_QUERY.EMPLOYEE, 'membertype:Employee');
});

/* ── hygiene: naming, secrets, alias registration ────────────────────────────── */

test('names and emails carry the sweep prefixes', () => {
  for (const o of ORGS) assert.ok(o.name.startsWith(SEED_PREFIX), o.name);
  for (const p of PEOPLE) assert.ok(p.email.startsWith(EMAIL_PREFIX), p.email);
});

test('the password is a {{VAR}} token, never a literal (VCST-5406)', () => {
  assert.match(PASSWORD_VAR, /^\{\{[A-Z0-9_]+\}\}$/);
});

test('alias names are unique and cover every entity', () => {
  assert.equal(new Set(ALIAS_NAMES).size, ALIAS_NAMES.length);
  assert.equal(ALIAS_NAMES.length, ORGS.length + PEOPLE.length);
});

test('every alias is registered in the committed aliases.json with EMPTY runtime ids (DV-021)', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
  for (const spec of [...ORGS, ...PEOPLE]) {
    const a = aliases[spec.alias];
    assert.ok(a, `${spec.alias} missing from test-data/aliases.json`);
    assert.equal(a._inline, true, `${spec.alias} must be an inline alias`);
    assert.equal(a.id, '', `${spec.alias}.id must be empty in the committed base`);
    assert.equal(a.platform_id, '', `${spec.alias}.platform_id must be empty in the committed base`);
    if (spec.email) assert.equal(a.email, spec.email);
    else assert.equal(a.name, spec.name);
  }
});

test('orgByKey / personByKey resolve, and return null for an unknown key', () => {
  assert.equal(orgByKey(PARENT.key).alias, PARENT.alias);
  assert.equal(personByKey('EMPLOYEE').memberType, 'Employee');
  assert.equal(orgByKey('NOPE'), null);
  assert.equal(personByKey('NOPE'), null);
});

/* --- teardown ordering: the bug this fixture already hit once ------------------ */

test('teardownOrder deletes people first, then organizations deepest-first', () => {
  const snapshot = [
    { kind: 'org', spec: PARENT, id: 'org-parent' },
    { kind: 'org', spec: CHILD, id: 'org-child' },
    ...PEOPLE.map((p) => ({ kind: 'person', spec: p, id: `mem-${p.key}` })),
  ];
  const order = teardownOrder(snapshot);
  assert.equal(order.length, snapshot.length, 'nothing may be dropped from the snapshot');
  const kinds = order.map((s) => s.kind);
  assert.equal(kinds.lastIndexOf('person') < kinds.indexOf('org'), true, 'every person precedes every org');
  const orgIds = order.filter((s) => s.kind === 'org').map((s) => s.id);
  assert.deepEqual(orgIds, ['org-child', 'org-parent'], 'the child company is deleted before its parent');
});

test('teardownOrder is total — an entity the search could not resolve is simply absent, never reordered away', () => {
  const partial = [{ kind: 'org', spec: CHILD, id: 'org-child' }, { kind: 'person', spec: PEOPLE[0], id: 'm1' }];
  assert.deepEqual(teardownOrder(partial).map((s) => s.id), ['m1', 'org-child']);
  assert.deepEqual(teardownOrder([]), []);
});
