// Unit tests for the back-office RBAC fixture pure logic (backoffice-rbac-specs.mjs).
// Pure — no env, no network. Run: `npm test`
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESTRICTED_ROLE, RESTRICTED_ACCOUNT, EXCLUDED_PERMISSION, EXCLUDED_PERMISSIONS,
  roleBody, accountBody, assertRolePermissions, findGuidLeaks, COPY_ENDPOINT,
  CATALOG_LINK_ROLE, CATALOG_LINK_ACCOUNT, CATALOG_LINK_EXCLUDED_PERMISSION,
  CATALOG_LINK_EXCLUDED_PERMISSIONS, CATALOG_LINK_REQUIRED_PERMISSIONS,
  assertCatalogLinkRolePermissions,
  SALESREP_READONLY_ROLE, SALESREP_READONLY_ACCOUNT, SALESREP_READONLY_EXCLUDED_PERMISSION,
  SALESREP_READONLY_EXCLUDED_PERMISSIONS, SALESREP_READONLY_REQUIRED_PERMISSIONS,
  assertSalesRepReadOnlyRolePermissions,
  SALESREP_MEMBER_MUTATE_PERMISSIONS, SALESREP_ACCOUNT_MUTATE_PERMISSIONS, SALESREP_ALL_MUTATE_PERMISSIONS,
  SALESREP_ACCOUNTOPS_ROLE, SALESREP_ACCOUNTOPS_ACCOUNT, SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION,
  SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSIONS, SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS,
  assertSalesRepAccountOpsRolePermissions,
  SALESREP_MEMBERONLY_ROLE, SALESREP_MEMBERONLY_ACCOUNT, SALESREP_MEMBERONLY_EXCLUDED_PERMISSION,
  SALESREP_MEMBERONLY_EXCLUDED_PERMISSIONS, SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS,
  assertSalesRepMemberOnlyRolePermissions,
  SALESREP_FULL_ROLE, SALESREP_FULL_ACCOUNT, SALESREP_FULL_EXCLUDED_PERMISSIONS,
  SALESREP_FULL_REQUIRED_PERMISSIONS, SALESREP_FULL_EXCLUDED_PERMISSION,
  assertSalesRepFullRolePermissions,
} from '../seed-data/platform/backoffice-rbac-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('restricted role EXCLUDES builder:update (the CMS-123/124 boundary)', () => {
  assert.ok(!RESTRICTED_ROLE.permissions.includes(EXCLUDED_PERMISSION));
  assert.equal(EXCLUDED_PERMISSION, 'builder:update');
  for (const p of EXCLUDED_PERMISSIONS) assert.ok(!RESTRICTED_ROLE.permissions.includes(p), `must not hold ${p}`);
});

test('restricted role is read-only page builder (access + read)', () => {
  assert.ok(RESTRICTED_ROLE.permissions.includes('builder:access'));
  assert.ok(RESTRICTED_ROLE.permissions.includes('builder:read'));
  assert.doesNotThrow(() => assertRolePermissions());
});

test('assertRolePermissions throws when a write permission leaks in', () => {
  assert.throws(() => assertRolePermissions(['builder:access', 'builder:read', 'builder:update']), /write permission/);
});

test('assertRolePermissions throws when read/access is missing', () => {
  assert.throws(() => assertRolePermissions(['builder:read']), /builder:access/);
});

test('roleBody() is a valid idempotent upsert body (fixed id, permission objects)', () => {
  const b = roleBody();
  assert.equal(b.id, RESTRICTED_ROLE.role_id);
  assert.deepEqual(b.permissions, [{ name: 'builder:access' }, { name: 'builder:read' }]);
});

test('accountBody() builds a restricted Manager (isAdministrator=false, role attached)', () => {
  const b = accountBody({ email: RESTRICTED_ACCOUNT.email, password: 'x', roleId: 'RID', roleName: 'RN', storeId: 'B2B-store' });
  assert.equal(b.userType, 'Manager');
  assert.equal(b.isAdministrator, false);
  assert.equal(b.userName, RESTRICTED_ACCOUNT.email);
  assert.deepEqual(b.roles, [{ id: 'RID', name: 'RN' }]);
});

test('account email is an AGENT-TEST business key (teardown-sweepable, env-invariant)', () => {
  assert.ok(RESTRICTED_ACCOUNT.email.startsWith('AGENT-TEST-'));
});

test('COPY_ENDPOINT matches the CMS-124 route shape', () => {
  assert.equal(COPY_ENDPOINT('T', 'S'), '/api/page-builder-pages/grouped/T/content/S');
});

test('spec module carries no runtime GUID', () => {
  const src = readFileSync(join(ROOT, 'scripts/seed-data/platform/backoffice-rbac-specs.mjs'), 'utf8');
  assert.deepEqual(findGuidLeaks(src), []);
});

test('RESTRICTED_CMS_ADMIN alias is registered and GUID-free in aliases.json', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const a = aliases[RESTRICTED_ACCOUNT.aliasName];
  assert.ok(a, 'alias must exist');
  assert.equal(a.email || a.login, RESTRICTED_ACCOUNT.email);
  assert.deepEqual(findGuidLeaks(JSON.stringify(a)), []);
});

// --- CATALOG_LINK_RESTRICTED (VCST-5318) — products-only Map/Link fixture ---

test('catalog-link role EXCLUDES catalog:categories:link (the VCST-5318 boundary)', () => {
  assert.ok(!CATALOG_LINK_ROLE.permissions.includes(CATALOG_LINK_EXCLUDED_PERMISSION));
  assert.equal(CATALOG_LINK_EXCLUDED_PERMISSION, 'catalog:categories:link');
  for (const p of CATALOG_LINK_EXCLUDED_PERMISSIONS) assert.ok(!CATALOG_LINK_ROLE.permissions.includes(p), `must not hold ${p}`);
});

test('catalog-link role HOLDS catalog:products:link and the base/create perms', () => {
  assert.ok(CATALOG_LINK_ROLE.permissions.includes('catalog:products:link'));
  assert.ok(CATALOG_LINK_ROLE.permissions.includes('catalog:access'));
  assert.ok(CATALOG_LINK_ROLE.permissions.includes('catalog:read'));
  // create perms are required to reach the create-gated Map flow
  assert.ok(CATALOG_LINK_ROLE.permissions.includes('catalog:create'));
  assert.ok(CATALOG_LINK_ROLE.permissions.includes('catalog:products:create'));
  assert.doesNotThrow(() => assertCatalogLinkRolePermissions());
});

test('catalog-link role does NOT depend on platform:access (build-variable)', () => {
  assert.ok(!CATALOG_LINK_ROLE.permissions.includes('platform:access'));
});

test('assertCatalogLinkRolePermissions throws when categories:link leaks in', () => {
  assert.throws(
    () => assertCatalogLinkRolePermissions([...CATALOG_LINK_REQUIRED_PERMISSIONS, 'catalog:categories:link']),
    /must NOT carry/,
  );
});

test('assertCatalogLinkRolePermissions throws when products:link is missing', () => {
  const noLink = CATALOG_LINK_REQUIRED_PERMISSIONS.filter((p) => p !== 'catalog:products:link');
  assert.throws(() => assertCatalogLinkRolePermissions(noLink), /missing required permission/);
});

test('roleBody(CATALOG_LINK_ROLE) is a valid idempotent upsert body (fixed id, permission objects)', () => {
  const b = roleBody(CATALOG_LINK_ROLE);
  assert.equal(b.id, CATALOG_LINK_ROLE.role_id);
  assert.deepEqual(b.permissions.map((p) => p.name), CATALOG_LINK_ROLE.permissions);
});

test('accountBody(account=CATALOG_LINK_ACCOUNT) builds a restricted Manager (isAdministrator=false)', () => {
  const b = accountBody({ email: CATALOG_LINK_ACCOUNT.email, password: 'x', roleId: 'RID', roleName: 'RN', storeId: 'B2B-store', account: CATALOG_LINK_ACCOUNT });
  assert.equal(b.userType, 'Manager');
  assert.equal(b.isAdministrator, false);
  assert.equal(b.userName, CATALOG_LINK_ACCOUNT.email);
  assert.deepEqual(b.roles, [{ id: 'RID', name: 'RN' }]);
});

test('catalog-link account email is an AGENT-TEST business key (teardown-sweepable, env-invariant)', () => {
  assert.ok(CATALOG_LINK_ACCOUNT.email.startsWith('AGENT-TEST-'));
  assert.ok(CATALOG_LINK_ROLE.role_id.startsWith('AGENT-TEST-'));
});

test('CATALOG_LINK_RESTRICTED alias is registered, coherent, and GUID-free in aliases.json', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const a = aliases[CATALOG_LINK_ACCOUNT.aliasName];
  assert.ok(a, 'alias must exist');
  assert.equal(a.email || a.login, CATALOG_LINK_ACCOUNT.email);
  assert.equal(a.excluded_permission, CATALOG_LINK_EXCLUDED_PERMISSION);
  assert.deepEqual(findGuidLeaks(JSON.stringify(a)), []);
});

// --- RESTRICTED_ADMIN_SALESREP_READONLY (SR-ADM-023 / candidate BL-SREP-003) — read-only Sales Rep admin ---

test('read-only Sales Rep role EXCLUDES the 6 mutate perms (the SR-ADM-023 boundary)', () => {
  for (const p of SALESREP_READONLY_EXCLUDED_PERMISSIONS) {
    assert.ok(!SALESREP_READONLY_ROLE.permissions.includes(p), `must not hold ${p}`);
  }
  // the six write perms: member-side + account-side
  assert.deepEqual(SALESREP_READONLY_EXCLUDED_PERMISSIONS, [
    'customer:create', 'customer:update', 'customer:delete',
    'platform:security:create', 'platform:security:update', 'platform:security:delete',
  ]);
  // the representative boundary is a member of the full excluded set
  assert.equal(SALESREP_READONLY_EXCLUDED_PERMISSION, 'customer:update');
  assert.ok(SALESREP_READONLY_EXCLUDED_PERMISSIONS.includes(SALESREP_READONLY_EXCLUDED_PERMISSION));
});

test('read-only Sales Rep role HOLDS customer:read (the access gate) and nothing else', () => {
  assert.deepEqual(SALESREP_READONLY_ROLE.permissions, ['customer:read']);
  assert.deepEqual(SALESREP_READONLY_REQUIRED_PERMISSIONS, ['customer:read']);
  assert.doesNotThrow(() => assertSalesRepReadOnlyRolePermissions());
});

test('read-only Sales Rep role does NOT use sales-rep:access (does not gate the back-office app)', () => {
  assert.ok(!SALESREP_READONLY_ROLE.permissions.includes('sales-rep:access'));
});

test('assertSalesRepReadOnlyRolePermissions throws when a mutate perm leaks in', () => {
  assert.throws(
    () => assertSalesRepReadOnlyRolePermissions(['customer:read', 'customer:update']),
    /must NOT carry/,
  );
  assert.throws(
    () => assertSalesRepReadOnlyRolePermissions(['customer:read', 'platform:security:create']),
    /must NOT carry/,
  );
});

test('assertSalesRepReadOnlyRolePermissions throws when customer:read is missing', () => {
  assert.throws(() => assertSalesRepReadOnlyRolePermissions([]), /missing required permission/);
});

test('roleBody(SALESREP_READONLY_ROLE) is a valid idempotent upsert body (fixed id, permission objects)', () => {
  const b = roleBody(SALESREP_READONLY_ROLE);
  assert.equal(b.id, SALESREP_READONLY_ROLE.role_id);
  assert.deepEqual(b.permissions, [{ name: 'customer:read' }]);
});

test('accountBody(account=SALESREP_READONLY_ACCOUNT) builds a restricted Manager (isAdministrator=false)', () => {
  const b = accountBody({ email: SALESREP_READONLY_ACCOUNT.email, password: 'x', roleId: 'RID', roleName: 'RN', storeId: 'B2B-store', account: SALESREP_READONLY_ACCOUNT });
  assert.equal(b.userType, 'Manager');
  assert.equal(b.isAdministrator, false);
  assert.equal(b.userName, SALESREP_READONLY_ACCOUNT.email);
  assert.deepEqual(b.roles, [{ id: 'RID', name: 'RN' }]);
});

test('read-only Sales Rep account email + role_id are AGENT-TEST business keys (env-invariant, sweepable)', () => {
  assert.ok(SALESREP_READONLY_ACCOUNT.email.startsWith('AGENT-TEST-'));
  assert.ok(SALESREP_READONLY_ROLE.role_id.startsWith('AGENT-TEST-'));
  assert.equal(SALESREP_READONLY_ACCOUNT.passwordVar, 'RESTRICTED_SALESREP_ADMIN_PASSWORD');
});

test('RESTRICTED_ADMIN_SALESREP_READONLY alias is registered, coherent, and GUID-free in aliases.json', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const a = aliases[SALESREP_READONLY_ACCOUNT.aliasName];
  assert.ok(a, 'alias must exist');
  assert.equal(a.email || a.login, SALESREP_READONLY_ACCOUNT.email);
  assert.equal(a.role, SALESREP_READONLY_ROLE.role_name);
  assert.equal(a.excluded_permission, SALESREP_READONLY_EXCLUDED_PERMISSION);
  assert.deepEqual(findGuidLeaks(JSON.stringify(a)), []);
});

// --- Sales Rep matrix universe (source-verified split) ---

test('Sales Rep mutate-permission universe is split correctly (member vs account, no overlap)', () => {
  assert.deepEqual(SALESREP_MEMBER_MUTATE_PERMISSIONS, ['customer:create', 'customer:update', 'customer:delete']);
  assert.deepEqual(SALESREP_ACCOUNT_MUTATE_PERMISSIONS, ['platform:security:create', 'platform:security:update', 'platform:security:delete']);
  assert.deepEqual(SALESREP_ALL_MUTATE_PERMISSIONS, [...SALESREP_MEMBER_MUTATE_PERMISSIONS, ...SALESREP_ACCOUNT_MUTATE_PERMISSIONS]);
});

// --- RESTRICTED_ADMIN_SALESREP_ACCOUNTOPS (account-ops class in isolation) ---

test('account-ops role INCLUDES customer:read + platform:security:update and EXCLUDES customer:update', () => {
  assert.deepEqual(SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS, ['customer:read', 'platform:security:update']);
  assert.equal(SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION, 'customer:update');
  for (const p of SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS) assert.ok(SALESREP_ACCOUNTOPS_ROLE.permissions.includes(p), `must hold ${p}`);
  for (const p of SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSIONS) assert.ok(!SALESREP_ACCOUNTOPS_ROLE.permissions.includes(p), `must not hold ${p}`);
  // the exact exclude-set: everything mutating except platform:security:update (the account-ops perm it keeps)
  assert.deepEqual(SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSIONS, [
    'customer:create', 'customer:update', 'customer:delete',
    'platform:security:create', 'platform:security:delete',
  ]);
  assert.doesNotThrow(() => assertSalesRepAccountOpsRolePermissions());
});

test('account-ops role keeps platform:security:update (so block/unblock/set-password succeed)', () => {
  assert.ok(SALESREP_ACCOUNTOPS_ROLE.permissions.includes('platform:security:update'));
  assert.ok(!SALESREP_ACCOUNTOPS_ROLE.permissions.includes('customer:update'));
});

test('assertSalesRepAccountOpsRolePermissions throws when customer:update leaks in', () => {
  assert.throws(() => assertSalesRepAccountOpsRolePermissions([...SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS, 'customer:update']), /must NOT carry/);
});

test('assertSalesRepAccountOpsRolePermissions throws when platform:security:update is missing', () => {
  assert.throws(() => assertSalesRepAccountOpsRolePermissions(['customer:read']), /missing required permission/);
});

test('account-ops account is an AGENT-TEST Manager, isAdministrator=false, shared password var', () => {
  assert.ok(SALESREP_ACCOUNTOPS_ACCOUNT.email.startsWith('AGENT-TEST-'));
  assert.ok(SALESREP_ACCOUNTOPS_ROLE.role_id.startsWith('AGENT-TEST-'));
  assert.equal(SALESREP_ACCOUNTOPS_ACCOUNT.userType, 'Manager');
  assert.equal(SALESREP_ACCOUNTOPS_ACCOUNT.isAdministrator, false);
  assert.equal(SALESREP_ACCOUNTOPS_ACCOUNT.passwordVar, 'RESTRICTED_SALESREP_ADMIN_PASSWORD');
});

test('RESTRICTED_ADMIN_SALESREP_ACCOUNTOPS alias is registered, coherent, GUID-free', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const a = aliases[SALESREP_ACCOUNTOPS_ACCOUNT.aliasName];
  assert.ok(a, 'alias must exist');
  assert.equal(a.email || a.login, SALESREP_ACCOUNTOPS_ACCOUNT.email);
  assert.equal(a.role, SALESREP_ACCOUNTOPS_ROLE.role_name);
  assert.equal(a.excluded_permission, SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION);
  assert.deepEqual(findGuidLeaks(JSON.stringify(a)), []);
});

// --- RESTRICTED_ADMIN_SALESREP_MEMBERONLY (AND-gate from the member side) ---

test('member-only role INCLUDES customer:read + customer:update and EXCLUDES platform:security:update', () => {
  assert.deepEqual(SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS, ['customer:read', 'customer:update']);
  assert.equal(SALESREP_MEMBERONLY_EXCLUDED_PERMISSION, 'platform:security:update');
  for (const p of SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS) assert.ok(SALESREP_MEMBERONLY_ROLE.permissions.includes(p), `must hold ${p}`);
  for (const p of SALESREP_MEMBERONLY_EXCLUDED_PERMISSIONS) assert.ok(!SALESREP_MEMBERONLY_ROLE.permissions.includes(p), `must not hold ${p}`);
  assert.deepEqual(SALESREP_MEMBERONLY_EXCLUDED_PERMISSIONS, [
    'customer:create', 'customer:delete',
    'platform:security:create', 'platform:security:update', 'platform:security:delete',
  ]);
  assert.doesNotThrow(() => assertSalesRepMemberOnlyRolePermissions());
});

test('member-only role keeps customer:update but lacks the account side (Update still 403s)', () => {
  assert.ok(SALESREP_MEMBERONLY_ROLE.permissions.includes('customer:update'));
  assert.ok(!SALESREP_MEMBERONLY_ROLE.permissions.includes('platform:security:update'));
});

test('assertSalesRepMemberOnlyRolePermissions throws when platform:security:update leaks in', () => {
  assert.throws(() => assertSalesRepMemberOnlyRolePermissions([...SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS, 'platform:security:update']), /must NOT carry/);
});

test('assertSalesRepMemberOnlyRolePermissions throws when customer:update is missing', () => {
  assert.throws(() => assertSalesRepMemberOnlyRolePermissions(['customer:read']), /missing required permission/);
});

test('member-only account is an AGENT-TEST Manager, isAdministrator=false, shared password var', () => {
  assert.ok(SALESREP_MEMBERONLY_ACCOUNT.email.startsWith('AGENT-TEST-'));
  assert.ok(SALESREP_MEMBERONLY_ROLE.role_id.startsWith('AGENT-TEST-'));
  assert.equal(SALESREP_MEMBERONLY_ACCOUNT.userType, 'Manager');
  assert.equal(SALESREP_MEMBERONLY_ACCOUNT.isAdministrator, false);
  assert.equal(SALESREP_MEMBERONLY_ACCOUNT.passwordVar, 'RESTRICTED_SALESREP_ADMIN_PASSWORD');
});

test('RESTRICTED_ADMIN_SALESREP_MEMBERONLY alias is registered, coherent, GUID-free', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const a = aliases[SALESREP_MEMBERONLY_ACCOUNT.aliasName];
  assert.ok(a, 'alias must exist');
  assert.equal(a.email || a.login, SALESREP_MEMBERONLY_ACCOUNT.email);
  assert.equal(a.role, SALESREP_MEMBERONLY_ROLE.role_name);
  assert.equal(a.excluded_permission, SALESREP_MEMBERONLY_EXCLUDED_PERMISSION);
  assert.deepEqual(findGuidLeaks(JSON.stringify(a)), []);
});

// --- RESTRICTED_ADMIN_SALESREP_FULL (permissioned non-admin positive control) ---

test('full role HOLDS the complete CRUD + account-ops set, EXCLUDES nothing', () => {
  assert.deepEqual(SALESREP_FULL_REQUIRED_PERMISSIONS, [
    'customer:read',
    'customer:create', 'customer:update', 'customer:delete',
    'platform:security:create', 'platform:security:update', 'platform:security:delete',
  ]);
  assert.deepEqual(SALESREP_FULL_EXCLUDED_PERMISSIONS, []);
  assert.equal(SALESREP_FULL_EXCLUDED_PERMISSION, null);
  for (const p of SALESREP_FULL_REQUIRED_PERMISSIONS) assert.ok(SALESREP_FULL_ROLE.permissions.includes(p), `must hold ${p}`);
  assert.doesNotThrow(() => assertSalesRepFullRolePermissions());
});

test('full positive control is NOT isAdministrator (exercises the real gate, not the bypass)', () => {
  assert.equal(SALESREP_FULL_ACCOUNT.isAdministrator, false);
});

test('assertSalesRepFullRolePermissions throws when a required perm is missing', () => {
  const missingDelete = SALESREP_FULL_REQUIRED_PERMISSIONS.filter((p) => p !== 'platform:security:delete');
  assert.throws(() => assertSalesRepFullRolePermissions(missingDelete), /missing required permission/);
});

test('full account is an AGENT-TEST Manager, shared password var', () => {
  assert.ok(SALESREP_FULL_ACCOUNT.email.startsWith('AGENT-TEST-'));
  assert.ok(SALESREP_FULL_ROLE.role_id.startsWith('AGENT-TEST-'));
  assert.equal(SALESREP_FULL_ACCOUNT.userType, 'Manager');
  assert.equal(SALESREP_FULL_ACCOUNT.passwordVar, 'RESTRICTED_SALESREP_ADMIN_PASSWORD');
});

test('roleBody(SALESREP_FULL_ROLE) is a valid idempotent upsert body (fixed id, 7 permission objects)', () => {
  const b = roleBody(SALESREP_FULL_ROLE);
  assert.equal(b.id, SALESREP_FULL_ROLE.role_id);
  assert.deepEqual(b.permissions.map((p) => p.name), SALESREP_FULL_REQUIRED_PERMISSIONS);
});

test('RESTRICTED_ADMIN_SALESREP_FULL alias is a positive control (excluded_permission null, is_administrator false), GUID-free', () => {
  const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
  const a = aliases[SALESREP_FULL_ACCOUNT.aliasName];
  assert.ok(a, 'alias must exist');
  assert.equal(a.email || a.login, SALESREP_FULL_ACCOUNT.email);
  assert.equal(a.role, SALESREP_FULL_ROLE.role_name);
  assert.equal(a.excluded_permission, null);
  assert.equal(a.is_administrator, false);
  assert.deepEqual(findGuidLeaks(JSON.stringify(a)), []);
});

test('all five back-office RBAC aliases are distinct and AGENT-TEST-prefixed (full matrix coverage)', () => {
  const emails = [
    RESTRICTED_ACCOUNT.email,
    SALESREP_READONLY_ACCOUNT.email,
    SALESREP_ACCOUNTOPS_ACCOUNT.email,
    SALESREP_MEMBERONLY_ACCOUNT.email,
    SALESREP_FULL_ACCOUNT.email,
  ];
  assert.equal(new Set(emails).size, emails.length, 'emails must be unique');
  for (const e of emails) assert.ok(e.startsWith('AGENT-TEST-'), `${e} must be AGENT-TEST-prefixed`);
});
