// Unit tests for scripts/seed-data/b2b/membership-alias-specs.mjs (VCST-5281).
//
// What matters here: the overlay writeback must be DECLARATIVE (driven by the CSV's alias /
// membership_id_field columns), must never write a placeholder id, must only touch aliases actually
// seeded in the run (so a scoped `--only` seed can't clobber a reserved fixture), and the drift guard
// must catch the silent-failure shapes — an alias that doesn't exist, an alias missing the field the
// seeder writes, and two aliases claiming one account.
//
// Pure — no env, no fs, no network. Run: `node --test scripts/unit/`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMembershipAliasUpdates, matchesOnly, findAliasDeclarationProblems,
  ALIAS_COLUMN, MEMBERSHIP_FIELD_COLUMN, ACCOUNT_ID_FIELDS,
} from '../seed-data/b2b/membership-alias-specs.mjs';

const ROWS = [
  { membership_id: 'MOM-001', user_email: 'a@x.test', org_name: 'Org-TF', role_id: 'org-maintainer', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR', [MEMBERSHIP_FIELD_COLUMN]: 'techflow_membership_id' },
  { membership_id: 'MOM-002', user_email: 'a@x.test', org_name: 'Org-BR', role_id: 'org-employee', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR', [MEMBERSHIP_FIELD_COLUMN]: 'buildright_membership_id' },
  { membership_id: 'MOM-003', user_email: 'b@x.test', org_name: 'Org-TF', role_id: 'org-maintainer', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR_ALT', [MEMBERSHIP_FIELD_COLUMN]: 'techflow_membership_id' },
  { membership_id: 'MOM-004', user_email: 'b@x.test', org_name: 'Org-BR', role_id: 'org-employee', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR_ALT', [MEMBERSHIP_FIELD_COLUMN]: 'buildright_membership_id' },
];

const aliasDef = (extra = {}) => ({
  _inline: true,
  fields: {
    id: 'id', userId: 'userId', email: 'email', password: 'password',
    techflow_membership_id: 'techflow_membership_id', buildright_membership_id: 'buildright_membership_id',
    ...extra,
  },
});
const REGISTRY = { MULTI_ORG_TF_BR: aliasDef(), MULTI_ORG_TF_BR_ALT: aliasDef() };

const result = (membership_id, email, mid) => ({
  membership_id, email, contact_id: `contact-${email}`, user_id: `user-${email}`, platform_membership_id: mid,
});

test('buildMembershipAliasUpdates maps account + per-org ids onto the declared alias fields', () => {
  const updates = buildMembershipAliasUpdates(ROWS, [
    result('MOM-003', 'b@x.test', 'mid-tf'),
    result('MOM-004', 'b@x.test', 'mid-br'),
  ]);
  assert.deepEqual(updates, {
    MULTI_ORG_TF_BR_ALT: {
      [ACCOUNT_ID_FIELDS.contact]: 'contact-b@x.test',
      [ACCOUNT_ID_FIELDS.account]: 'user-b@x.test',
      techflow_membership_id: 'mid-tf',
      buildright_membership_id: 'mid-br',
    },
  });
});

test('buildMembershipAliasUpdates touches ONLY aliases seeded in this run (scoped --only is safe)', () => {
  // The reserved fixture's rows are in the CSV but were not seeded → must not appear in the payload,
  // or a scoped seed would rewrite a live lane's overlay entry.
  const updates = buildMembershipAliasUpdates(ROWS, [result('MOM-003', 'b@x.test', 'mid-tf')]);
  assert.deepEqual(Object.keys(updates), ['MULTI_ORG_TF_BR_ALT']);
  assert.equal('MULTI_ORG_TF_BR' in updates, false);
});

test('buildMembershipAliasUpdates never writes a dry-run placeholder or empty id', () => {
  const updates = buildMembershipAliasUpdates(ROWS, [
    { membership_id: 'MOM-003', contact_id: 'dry-contact-b', user_id: '', platform_membership_id: 'dry-mom-tf' },
  ]);
  assert.deepEqual(updates, {}, 'a dry run must produce no overlay write at all');
});

test('buildMembershipAliasUpdates ignores a row that declares no alias', () => {
  const rows = [{ membership_id: 'MOM-009', user_email: 'c@x.test', org_name: 'Org-TF' }];
  assert.deepEqual(buildMembershipAliasUpdates(rows, [result('MOM-009', 'c@x.test', 'mid-x')]), {});
});

test('matchesOnly scopes by membership_id, email or alias; null passes everything', () => {
  assert.equal(matchesOnly(ROWS[2], 'MULTI_ORG_TF_BR_ALT'), true);
  assert.equal(matchesOnly(ROWS[0], 'MULTI_ORG_TF_BR_ALT'), false, 'the reserved fixture must NOT match the twin token');
  assert.equal(matchesOnly(ROWS[2], 'MOM-003'), true);
  assert.equal(matchesOnly(ROWS[2], 'b@x.test'), true);
  assert.equal(matchesOnly(ROWS[2], 'multi_org_tf_br_alt'), true, 'case-insensitive');
  assert.equal(matchesOnly(ROWS[0], null), true);
  // Documented sharp edge: substring matching means the shorter token matches the longer alias.
  assert.equal(matchesOnly(ROWS[2], 'MULTI_ORG_TF_BR'), true);
});

test('findAliasDeclarationProblems: the shipped declaration is clean', () => {
  assert.deepEqual(findAliasDeclarationProblems(ROWS, REGISTRY), []);
});

test('findAliasDeclarationProblems catches an alias that does not exist in aliases.json', () => {
  const errs = findAliasDeclarationProblems(ROWS, { MULTI_ORG_TF_BR: aliasDef() });
  assert.equal(errs.length, 2);
  assert.match(errs[0], /MULTI_ORG_TF_BR_ALT.*does not exist/);
});

test('findAliasDeclarationProblems catches an alias missing the field the seeder writes', () => {
  const reg = {
    ...REGISTRY,
    MULTI_ORG_TF_BR_ALT: { _inline: true, fields: { id: 'id', userId: 'userId', techflow_membership_id: 'techflow_membership_id' } },
  };
  const errs = findAliasDeclarationProblems(ROWS, reg);
  assert.equal(errs.length, 1);
  assert.match(errs[0], /does not declare field "buildright_membership_id"/);
});

test('findAliasDeclarationProblems catches a missing account-level field (id / userId)', () => {
  const reg = { ...REGISTRY, MULTI_ORG_TF_BR_ALT: { _inline: true, fields: { id: 'id', techflow_membership_id: 'x', buildright_membership_id: 'y' } } };
  const errs = findAliasDeclarationProblems(ROWS, reg);
  assert.equal(errs.length, 2, 'both twin rows report the missing userId');
  assert.ok(errs.every((e) => /does not declare field "userId"/.test(e)));
});

test('findAliasDeclarationProblems catches two aliases claiming ONE account', () => {
  const rows = [
    { membership_id: 'MOM-001', user_email: 'a@x.test', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR', [MEMBERSHIP_FIELD_COLUMN]: 'techflow_membership_id' },
    { membership_id: 'MOM-002', user_email: 'a@x.test', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR_ALT', [MEMBERSHIP_FIELD_COLUMN]: 'buildright_membership_id' },
  ];
  const errs = findAliasDeclarationProblems(rows, REGISTRY);
  assert.ok(errs.some((e) => /declared by TWO aliases/.test(e)));
});

test('findAliasDeclarationProblems catches a runtime GUID committed to the CSV', () => {
  const rows = [{ ...ROWS[2], platform_membership_id: '65f9e33ea90b4bbfbea94ac6a7b2725c' }];
  const errs = findAliasDeclarationProblems(rows, REGISTRY);
  assert.ok(errs.some((e) => /holds a runtime GUID/.test(e)), errs.join(' | '));
  // Hyphenated form too.
  const rows2 = [{ ...ROWS[2], contact_id: '85d1aeea-ee57-4041-9c18-c16431fe23ec' }];
  assert.ok(findAliasDeclarationProblems(rows2, REGISTRY).some((e) => /holds a runtime GUID/.test(e)));
});

test('findAliasDeclarationProblems catches a half-declared row (field without alias, alias without field)', () => {
  const a = findAliasDeclarationProblems([{ membership_id: 'M1', user_email: 'z@x.test', [MEMBERSHIP_FIELD_COLUMN]: 'techflow_membership_id' }], REGISTRY);
  assert.ok(a.some((e) => /no alias/.test(e)));
  const b = findAliasDeclarationProblems([{ membership_id: 'M2', user_email: 'z@x.test', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR' }], REGISTRY);
  assert.ok(b.some((e) => /no membership_id_field/.test(e)));
});

test('findAliasDeclarationProblems catches two rows of one alias writing the same per-org field', () => {
  const rows = [
    { membership_id: 'M1', user_email: 'q@x.test', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR_ALT', [MEMBERSHIP_FIELD_COLUMN]: 'techflow_membership_id' },
    { membership_id: 'M2', user_email: 'q@x.test', [ALIAS_COLUMN]: 'MULTI_ORG_TF_BR_ALT', [MEMBERSHIP_FIELD_COLUMN]: 'techflow_membership_id' },
  ];
  assert.ok(findAliasDeclarationProblems(rows, REGISTRY).some((e) => /both write "techflow_membership_id"/.test(e)));
});
