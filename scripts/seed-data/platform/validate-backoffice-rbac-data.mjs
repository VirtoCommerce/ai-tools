#!/usr/bin/env node
/**
 * scripts/seed-data/platform/validate-backoffice-rbac-data.mjs
 *
 * STATIC drift-guard for the back-office RBAC fixture (no network). Wired as `td:validate:rbac`.
 * Asserts:
 *   1. the restricted role permission set is correct — READ-ONLY page builder, and NO write
 *      permission (esp. builder:update, the CMS-123/124 boundary);
 *   2. no runtime GUID leaked into the spec module (VCST-5406 — ids live in aliases.<env>.json);
 *   3. the RESTRICTED_CMS_ADMIN alias is registered in test-data/aliases.json and carries NO GUID.
 *
 * Exit 1 on any violation.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  RESTRICTED_ROLE, RESTRICTED_ACCOUNT, EXCLUDED_PERMISSION,
  assertRolePermissions, findGuidLeaks,
} from './backoffice-rbac-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };

console.log('=== validate back-office RBAC fixture (static drift-guard) ===');

// 1. role permission set
try { assertRolePermissions(); ok(`role "${RESTRICTED_ROLE.role_name}" is read-only page builder (${RESTRICTED_ROLE.permissions.join(', ')}) — excludes ${EXCLUDED_PERMISSION}`); }
catch (e) { fail(e.message); }

// 2. no GUID in the spec module
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/platform/backoffice-rbac-specs.mjs'), 'utf8');
const specLeaks = findGuidLeaks(specSrc);
if (specLeaks.length) fail(`spec module leaks runtime GUID(s): ${specLeaks.join(', ')}`);
else ok('spec module carries no runtime GUID (ids belong in aliases.<env>.json)');

// 3. alias registered + GUID-free in the committed aliases.json
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const alias = aliases[RESTRICTED_ACCOUNT.aliasName];
if (!alias) fail(`alias ${RESTRICTED_ACCOUNT.aliasName} not registered in test-data/aliases.json`);
else {
  const emailOk = (alias.email || alias.login) === RESTRICTED_ACCOUNT.email;
  if (!emailOk) fail(`alias ${RESTRICTED_ACCOUNT.aliasName}.email must equal the spec email ${RESTRICTED_ACCOUNT.email}`);
  else ok(`alias ${RESTRICTED_ACCOUNT.aliasName} registered (email matches spec)`);
  const aliasLeaks = findGuidLeaks(JSON.stringify(alias));
  if (aliasLeaks.length) fail(`alias ${RESTRICTED_ACCOUNT.aliasName} carries a runtime GUID in aliases.json (${aliasLeaks.join(', ')}) — it belongs in aliases.<env>.json`);
  else ok(`alias ${RESTRICTED_ACCOUNT.aliasName} carries no runtime GUID (platform_id resolves from the env overlay)`);
}

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
