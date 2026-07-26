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
