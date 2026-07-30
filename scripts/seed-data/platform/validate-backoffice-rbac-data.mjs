#!/usr/bin/env node
/**
 * scripts/seed-data/platform/validate-backoffice-rbac-data.mjs
 *
 * STATIC drift-guard for the back-office RBAC fixtures (no network). Wired as `td:validate:rbac`.
 * Covers both fixtures the seeder owns:
 *   - RESTRICTED_CMS_ADMIN   (CMS-123/124): read-only Page Builder, NO builder:update.
 *   - CATALOG_LINK_RESTRICTED (VCST-5318):  products-only Map/Link, NO catalog:categories:link.
 *
 * Asserts:
 *   1. each restricted role's permission set is correct (holds its base/link perms, EXCLUDES its
 *      boundary permission);
 *   2. no runtime GUID leaked into the spec module (VCST-5406 — ids live in aliases.<env>.json);
 *   3. each alias is registered in test-data/aliases.json, its email and role match the spec, its
 *      declared excluded_permission is coherent (equals the spec's excluded perm AND is genuinely
 *      absent from the role), and it carries NO GUID.
 *
 * Exit 1 on any violation.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESTRICTED_ROLE, RESTRICTED_ACCOUNT, EXCLUDED_PERMISSION, assertRolePermissions,
  CATALOG_LINK_ROLE, CATALOG_LINK_ACCOUNT, CATALOG_LINK_EXCLUDED_PERMISSION, assertCatalogLinkRolePermissions,
  SALESREP_READONLY_ROLE, SALESREP_READONLY_ACCOUNT, SALESREP_READONLY_EXCLUDED_PERMISSION, assertSalesRepReadOnlyRolePermissions,
  SALESREP_ACCOUNTOPS_ROLE, SALESREP_ACCOUNTOPS_ACCOUNT, SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION, assertSalesRepAccountOpsRolePermissions,
  SALESREP_MEMBERONLY_ROLE, SALESREP_MEMBERONLY_ACCOUNT, SALESREP_MEMBERONLY_EXCLUDED_PERMISSION, assertSalesRepMemberOnlyRolePermissions,
  SALESREP_FULL_ROLE, SALESREP_FULL_ACCOUNT, SALESREP_FULL_REQUIRED_PERMISSIONS, assertSalesRepFullRolePermissions,
  CATALOG_READONLY_ROLE, CATALOG_READONLY_ACCOUNT, CATALOG_READONLY_EXCLUDED_PERMISSION,
  CATALOG_READONLY_EXCLUDED_PERMISSIONS, assertCatalogReadOnlyRolePermissions,
  findGuidLeaks,
} from './backoffice-rbac-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };

console.log('=== validate back-office RBAC fixtures (static drift-guard) ===');

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));

/** Assert one fixture's alias is registered, GUID-free, and its excluded_permission is coherent. */
function checkAlias(role, account, excludedPermission) {
  const alias = aliases[account.aliasName];
  if (!alias) { fail(`alias ${account.aliasName} not registered in test-data/aliases.json`); return; }

  const emailOk = (alias.email || alias.login) === account.email;
  if (!emailOk) fail(`alias ${account.aliasName}.email must equal the spec email ${account.email}`);
  else ok(`alias ${account.aliasName} registered (email matches spec)`);

  if (alias.role !== role.role_name) {
    fail(`alias ${account.aliasName}.role is "${alias.role}" but the spec role is "${role.role_name}"`);
  } else ok(`alias ${account.aliasName}.role matches spec ("${role.role_name}")`);

  if (excludedPermission === null) {
    // Positive control (FULL): no boundary permission. The load-bearing negative assertion is
    // isAdministrator=false — assert the alias declares it and the spec account honours it.
    if (alias.excluded_permission != null) {
      fail(`alias ${account.aliasName} is a positive control (no boundary perm) — excluded_permission must be null, got "${alias.excluded_permission}"`);
    } else ok(`alias ${account.aliasName} is a positive control (excluded_permission: null)`);
    if (alias.is_administrator !== false || account.isAdministrator !== false) {
      fail(`alias ${account.aliasName} positive control must be isAdministrator=false (exercise the gate, not the bypass) — alias:${alias.is_administrator} spec:${account.isAdministrator}`);
    } else ok(`alias ${account.aliasName} positive control is isAdministrator=false (exercises the real gate)`);
  } else if (alias.excluded_permission !== excludedPermission) {
    // excluded_permission must equal the spec's boundary AND be genuinely absent from the role.
    fail(`alias ${account.aliasName}.excluded_permission is "${alias.excluded_permission}" but the spec boundary is "${excludedPermission}"`);
  } else if (role.permissions.includes(excludedPermission)) {
    fail(`alias ${account.aliasName}.excluded_permission "${excludedPermission}" is INCOHERENT — the role actually grants it`);
  } else {
    ok(`alias ${account.aliasName}.excluded_permission "${excludedPermission}" is coherent (declared + genuinely absent from the role)`);
  }

  const aliasLeaks = findGuidLeaks(JSON.stringify(alias));
  if (aliasLeaks.length) fail(`alias ${account.aliasName} carries a runtime GUID in aliases.json (${aliasLeaks.join(', ')}) — it belongs in aliases.<env>.json`);
  else ok(`alias ${account.aliasName} carries no runtime GUID (platform_id resolves from the env overlay)`);
}

// 1. role permission sets
try { assertRolePermissions(); ok(`role "${RESTRICTED_ROLE.role_name}" is read-only page builder (${RESTRICTED_ROLE.permissions.join(', ')}) — excludes ${EXCLUDED_PERMISSION}`); }
catch (e) { fail(e.message); }

try { assertCatalogLinkRolePermissions(); ok(`role "${CATALOG_LINK_ROLE.role_name}" is a products-only Map/Link role — holds catalog:products:link, excludes ${CATALOG_LINK_EXCLUDED_PERMISSION}`); }
catch (e) { fail(e.message); }

try { assertSalesRepReadOnlyRolePermissions(); ok(`role "${SALESREP_READONLY_ROLE.role_name}" is a read-only Sales Rep admin — holds customer:read, excludes ${SALESREP_READONLY_EXCLUDED_PERMISSION} (+ the other 5 mutate perms)`); }
catch (e) { fail(e.message); }

try { assertSalesRepAccountOpsRolePermissions(); ok(`role "${SALESREP_ACCOUNTOPS_ROLE.role_name}" is the account-ops Sales Rep admin — holds customer:read + platform:security:update, excludes ${SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION} (entity Update 403s)`); }
catch (e) { fail(e.message); }

try { assertSalesRepMemberOnlyRolePermissions(); ok(`role "${SALESREP_MEMBERONLY_ROLE.role_name}" is the member-only Sales Rep admin — holds customer:read + customer:update, excludes ${SALESREP_MEMBERONLY_EXCLUDED_PERMISSION} (Update AND-gate still 403s)`); }
catch (e) { fail(e.message); }

try { assertSalesRepFullRolePermissions(); ok(`role "${SALESREP_FULL_ROLE.role_name}" is the Sales Rep positive control — holds the full CRUD + account-ops set (${SALESREP_FULL_REQUIRED_PERMISSIONS.length} perms), isAdministrator=false`); }
catch (e) { fail(e.message); }

try { assertCatalogReadOnlyRolePermissions(); ok(`role "${CATALOG_READONLY_ROLE.role_name}" is read-only catalog (PLAT-079) — holds catalog:access + catalog:read, excludes ${CATALOG_READONLY_EXCLUDED_PERMISSIONS.join(', ')}`); }
catch (e) { fail(e.message); }

// 2. no GUID in the spec module (single scan covers both fixtures)
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/platform/backoffice-rbac-specs.mjs'), 'utf8');
const specLeaks = findGuidLeaks(specSrc);
if (specLeaks.length) fail(`spec module leaks runtime GUID(s): ${specLeaks.join(', ')}`);
else ok('spec module carries no runtime GUID (ids belong in aliases.<env>.json)');

// 3. aliases registered + GUID-free + coherent excluded_permission
checkAlias(RESTRICTED_ROLE, RESTRICTED_ACCOUNT, EXCLUDED_PERMISSION);
checkAlias(CATALOG_LINK_ROLE, CATALOG_LINK_ACCOUNT, CATALOG_LINK_EXCLUDED_PERMISSION);
checkAlias(SALESREP_READONLY_ROLE, SALESREP_READONLY_ACCOUNT, SALESREP_READONLY_EXCLUDED_PERMISSION);
checkAlias(SALESREP_ACCOUNTOPS_ROLE, SALESREP_ACCOUNTOPS_ACCOUNT, SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION);
checkAlias(SALESREP_MEMBERONLY_ROLE, SALESREP_MEMBERONLY_ACCOUNT, SALESREP_MEMBERONLY_EXCLUDED_PERMISSION);
checkAlias(SALESREP_FULL_ROLE, SALESREP_FULL_ACCOUNT, null); // positive control — no boundary perm
checkAlias(CATALOG_READONLY_ROLE, CATALOG_READONLY_ACCOUNT, CATALOG_READONLY_EXCLUDED_PERMISSION);

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
