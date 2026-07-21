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
