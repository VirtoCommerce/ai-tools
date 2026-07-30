#!/usr/bin/env node
/**
 * scripts/seed-data/platform/seed-backoffice-rbac.mjs
 *
 * Provisions the back-office (Manager) RBAC test accounts the admin/API permission-gate suites
 * need — each a platform user that authenticates but LACKS one boundary permission:
 *
 *   1. RESTRICTED_CMS_ADMIN (CMS-123/124, suite 059): read-only Page Builder, LACKS `builder:update`.
 *   2. CATALOG_LINK_RESTRICTED (VCST-5318): products-only catalog Map/Link linker, LACKS
 *      `catalog:categories:link` (can link products/items, cannot link categories).
 *
 * Idempotent find-or-create per fixture; writes each runtime platform user id + role id to
 * aliases.<env>.json; ships a reverse --teardown (AGENT-TEST only, zero-residue) and a per-fixture
 * --verify live boundary check. Built on seed-common.mjs (single auth context).
 *
 * Single source of truth: ./backoffice-rbac-specs.mjs (side-effect-free).
 *
 *   TEST_ENV=vcst npm run seed:rbac
 *   TEST_ENV=vcst npm run seed:rbac -- --verify      # + live boundary proof (403) per fixture
 *   TEST_ENV=vcst npm run seed:rbac:teardown
 *
 * Flags: --dry-run, --verbose, --teardown, --verify.
 */

import {
  assertSafeTarget, auth, api, log, verbose, DRY_RUN, TEARDOWN, VERBOSE,
  BACK_URL, STORE_ID, writeEnvAliasOverride,
} from '../../lib/seed-common.mjs';
import {
  RESTRICTED_ROLE, RESTRICTED_ACCOUNT, EXCLUDED_PERMISSION,
  CATALOG_LINK_ROLE, CATALOG_LINK_ACCOUNT, CATALOG_LINK_EXCLUDED_PERMISSION,
  SALESREP_READONLY_ROLE, SALESREP_READONLY_ACCOUNT, SALESREP_READONLY_EXCLUDED_PERMISSION,
  SALESREP_READONLY_EXCLUDED_PERMISSIONS, SALESREP_READONLY_REQUIRED_PERMISSIONS,
  SALESREP_ACCOUNTOPS_ROLE, SALESREP_ACCOUNTOPS_ACCOUNT, SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION,
  SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSIONS, SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS,
  assertSalesRepAccountOpsRolePermissions,
  SALESREP_MEMBERONLY_ROLE, SALESREP_MEMBERONLY_ACCOUNT, SALESREP_MEMBERONLY_EXCLUDED_PERMISSION,
  SALESREP_MEMBERONLY_EXCLUDED_PERMISSIONS, SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS,
  assertSalesRepMemberOnlyRolePermissions,
  SALESREP_FULL_ROLE, SALESREP_FULL_ACCOUNT,
  SALESREP_FULL_EXCLUDED_PERMISSIONS, SALESREP_FULL_REQUIRED_PERMISSIONS,
  assertSalesRepFullRolePermissions,
  CATALOG_READONLY_ROLE, CATALOG_READONLY_ACCOUNT, CATALOG_READONLY_EXCLUDED_PERMISSIONS,
  assertCatalogReadOnlyRolePermissions, CATALOG_CREATE_ENDPOINT, CATALOG_DELETE_ENDPOINT,
  roleBody, accountBody, assertRolePermissions, assertCatalogLinkRolePermissions,
  assertSalesRepReadOnlyRolePermissions,
  COPY_ENDPOINT, LISTENTRYLINKS_ENDPOINT, CURRENTUSER_ENDPOINT,
} from './backoffice-rbac-specs.mjs';

const VERIFY = process.argv.includes('--verify');

// --- reliable lookups (search-first — GET-by-name/id is cache-flaky, per user-provision.mjs) ---
async function findRole(role) {
  const r = await api('POST', '/api/platform/security/roles/search', { keyword: role.role_name, take: 50 }, { expectStatus: [200] });
  return (r?.results || []).find((x) => x.id === role.role_id || x.name === role.role_name) || null;
}
async function findUser(email) {
  const s = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 10 }, { expectStatus: [200, 201] });
  return (s?.results || []).find((u) =>
    (u.userName || '').toLowerCase() === email.toLowerCase() ||
    (u.email || '').toLowerCase() === email.toLowerCase()) || null;
}
async function getUserById(id) {
  if (!id) return null;
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
  return u?.id ? u : null;
}

function resolvePassword(account) {
  const raw = process.env[account.passwordVar];
  return (raw && String(raw).trim()) || account.passwordFallback;
}

// --- seed (parameterized per fixture) ---
async function ensureRole(role, assertPerms, excluded) {
  assertPerms(); // guard: never PUT a role that violates its boundary (leaks the excluded perm)
  const exists = await findRole(role);
  // PUT is idempotent on the fixed role_id, so it can never create a duplicate and keeps the
  // permission set in sync with the spec on every run.
  await api('PUT', '/api/platform/security/roles', roleBody(role), { expectStatus: [200, 201, 204] });
  log(`${exists ? '↻ update' : '✓ create'} role ${role.role_id} (${role.permissions.join(', ')}) — EXCLUDES ${excluded}`);
  return role.role_id;
}

async function ensureAccount(account, role, roleId) {
  const email = account.email;
  const password = resolvePassword(account);
  const existing = await findUser(email);
  if (existing?.id) {
    // Reconcile: ensure the restricted role is attached and NO administrator flag crept in.
    if (!DRY_RUN) {
      const full = await getUserById(existing.id) || existing;
      let dirty = false;
      const hasRole = (full.roles || []).some((r) => r.id === roleId || r.name === role.role_name);
      if (!hasRole) { full.roles = [{ id: roleId, name: role.role_name }]; dirty = true; }
      if (full.isAdministrator) { full.isAdministrator = false; dirty = true; }
      if (dirty) { await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] }); log(`↻ reconciled account ${email} (role + isAdministrator=false)`); }
      else verbose(`↻ reuse account ${email} (${existing.id})`);
    }
    return existing.id;
  }
  const res = await api('POST', '/api/platform/security/users/create', accountBody({ email, password, roleId, roleName: role.role_name, storeId: STORE_ID, account }));
  if (res && res.succeeded === false) throw new Error(`create ${email}: ${JSON.stringify(res.errors)}`);
  if (DRY_RUN) { log(`✓ create account (dry) ${email}`); return `dry-${email}`; }
  const fresh = await findUser(email);
  if (!fresh?.id) throw new Error(`created ${email} but could not resolve its id`);
  log(`✓ create account ${fresh.id} (${email}) — Manager, isAdministrator=false, role ${role.role_name}`);
  return fresh.id;
}

// --- live verification: CMS-124 boundary (restricted token → 403 on copy endpoint) ---
async function verifyCopyForbidden() {
  const { email } = RESTRICTED_ACCOUNT;
  const password = resolvePassword(RESTRICTED_ACCOUNT);
  log('\n  [verify] CMS-124 — restricted token must get 403 on the copy endpoint');
  const tok = await loginToken(email, password);
  if (!tok) return false;
  // Dummy group ids — the [Authorize] gate runs before handler binding, so a permission denial
  // returns 403 regardless of whether the groups exist.
  const path = COPY_ENDPOINT('AGENT-TEST-tgt-nonexistent', 'AGENT-TEST-src-nonexistent');
  const res = await fetch(`${BACK_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` } });
  if (res.status === 403) { log(`  ✓ copy endpoint → 403 Forbidden (CMS-124 boundary confirmed; lacks ${EXCLUDED_PERMISSION})`); return true; }
  log(`  ✗ copy endpoint → ${res.status} (expected 403). Restricted role may be over-permissioned or the endpoint auth changed.`);
  return false;
}

// --- live verification: VCST-5318 boundary (products-only token → 403 linking a CATEGORY) ---
async function verifyCategoryLinkForbidden() {
  const { email } = CATALOG_LINK_ACCOUNT;
  const password = resolvePassword(CATALOG_LINK_ACCOUNT);
  log('\n  [verify] VCST-5318 — products-only token must get 403 linking a CATEGORY');
  const tok = await loginToken(email, password);
  if (!tok) return false;
  // The CreateLinks [Authorize] gate is entity-TYPE keyed, so a category-typed entry is forbidden
  // regardless of whether the referenced ids exist. Dummy AGENT-TEST ids keep this data-free.
  const body = [{
    listEntryId: 'AGENT-TEST-cat-nonexistent',
    listEntryType: 'category',
    catalogId: 'AGENT-TEST-vcat-nonexistent',
  }];
  const res = await fetch(`${BACK_URL}${LISTENTRYLINKS_ENDPOINT}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 403) { log(`  ✓ create-links (category) → 403 Forbidden (VCST-5318 boundary confirmed; lacks ${CATALOG_LINK_EXCLUDED_PERMISSION})`); return true; }
  log(`  ⚠ create-links (category) → ${res.status} (expected 403). Check the role perms or the endpoint auth/shape on this build.`);
  return false;
}

// --- live verification: SR-ADM-023 boundary (read-only Sales Rep admin) ---
// Read-only proof (no mutating call): the restricted account authenticates, and /currentuser
// reflects customer:read present, the six write perms absent, and isAdministrator=false — so the
// Sales Rep app opens read-only and the gate applies. This is the access side; the "cannot mutate"
// side is guaranteed by the excluded perms being absent (asserted at role upsert + drift-guard).
async function verifySalesRepReadOnlyAccess() {
  const { email } = SALESREP_READONLY_ACCOUNT;
  const password = resolvePassword(SALESREP_READONLY_ACCOUNT);
  log('\n  [verify] SR-ADM-023 — read-only Sales Rep admin: customer:read present, write perms absent');
  const tok = await loginToken(email, password);
  if (!tok) return false;
  const res = await fetch(`${BACK_URL}${CURRENTUSER_ENDPOINT}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!res.ok) { log(`  ⚠ /currentuser → ${res.status} (expected 200). Cannot confirm effective perms.`); return false; }
  const me = await res.json();
  const perms = new Set(me?.permissions || []);
  const hasRead = SALESREP_READONLY_REQUIRED_PERMISSIONS.every((p) => perms.has(p));
  const leaked = SALESREP_READONLY_EXCLUDED_PERMISSIONS.filter((p) => perms.has(p));
  const isAdmin = me?.isAdministrator === true;
  if (hasRead && leaked.length === 0 && !isAdmin) {
    log(`  ✓ currentuser: customer:read present, no write perms, isAdministrator=false (SR-ADM-023 read-only boundary confirmed)`);
    return true;
  }
  log(`  ✗ currentuser boundary mismatch — read:${hasRead} leakedWrites:[${leaked.join(', ')}] isAdministrator:${isAdmin}`);
  return false;
}

// --- live verification: PLAT-079 boundary (read-only catalog token → 403 on CREATE and DELETE) ---
async function verifyCatalogReadOnlyForbidden() {
  const { email } = CATALOG_READONLY_ACCOUNT;
  const password = resolvePassword(CATALOG_READONLY_ACCOUNT);
  log('\n  [verify] PLAT-079 — catalog:read-only token must get 403 on BOTH create and delete');
  const tok = await loginToken(email, password);
  if (!tok) return false;

  const createRes = await fetch(`${BACK_URL}${CATALOG_CREATE_ENDPOINT}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'AGENT-TEST-verify-readonly-nonexistent', languages: [{ languageCode: 'en-US', isDefault: true }] }),
  });
  const createOk = createRes.status === 403;
  if (createOk) log(`  ✓ create catalog → 403 Forbidden (PLAT-079 boundary confirmed; lacks catalog:create)`);
  else log(`  ✗ create catalog → ${createRes.status} (expected 403). Role may be over-permissioned.`);

  // The [Authorize] gate runs before handler binding, so a nonexistent catalog id still 403s.
  const deleteRes = await fetch(`${BACK_URL}${CATALOG_DELETE_ENDPOINT('AGENT-TEST-cat-nonexistent')}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tok}` },
  });
  const deleteOk = deleteRes.status === 403;
  if (deleteOk) log(`  ✓ delete catalog → 403 Forbidden (PLAT-079 boundary confirmed; lacks catalog:delete)`);
  else log(`  ✗ delete catalog → ${deleteRes.status} (expected 403). Role may be over-permissioned.`);

  return createOk && deleteOk;
}

// --- generic effective-permission proof (read-only, no mutating call) ---------------------------
// Auth-sanity for a Sales Rep matrix fixture: password grant 200, then /currentuser reflects EXACTLY
// the intended include-set present, none of the exclude-set, and isAdministrator=false. This proves
// the grant landed correctly and the gate applies; the endpoint-level 403/200 behaviour is verified
// live by qa-backend-expert against the controller matrix.
async function verifyEffectivePermissions(account, required, excluded, label) {
  const { email } = account;
  const password = resolvePassword(account);
  log(`\n  [verify] ${label} — currentuser must reflect the exact include/exclude set, isAdministrator=false`);
  const tok = await loginToken(email, password);
  if (!tok) return false;
  const res = await fetch(`${BACK_URL}${CURRENTUSER_ENDPOINT}`, { headers: { Authorization: `Bearer ${tok}` } });
  if (!res.ok) { log(`  ⚠ /currentuser → ${res.status} (expected 200). Cannot confirm effective perms.`); return false; }
  const me = await res.json();
  const perms = new Set(me?.permissions || []);
  const missing = required.filter((p) => !perms.has(p));
  const leaked = excluded.filter((p) => perms.has(p));
  const isAdmin = me?.isAdministrator === true;
  if (missing.length === 0 && leaked.length === 0 && !isAdmin) {
    log(`  ✓ currentuser: include-set [${required.join(', ')}] present, exclude-set absent, isAdministrator=false (${label} boundary confirmed)`);
    return true;
  }
  log(`  ✗ currentuser boundary mismatch — missing:[${missing.join(', ')}] leaked:[${leaked.join(', ')}] isAdministrator:${isAdmin}`);
  return false;
}

const verifyAccountOps = () => verifyEffectivePermissions(
  SALESREP_ACCOUNTOPS_ACCOUNT, SALESREP_ACCOUNTOPS_REQUIRED_PERMISSIONS, SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSIONS,
  'SalesRep ACCOUNT-OPS (platform:security:update, no customer:update)');
const verifyMemberOnly = () => verifyEffectivePermissions(
  SALESREP_MEMBERONLY_ACCOUNT, SALESREP_MEMBERONLY_REQUIRED_PERMISSIONS, SALESREP_MEMBERONLY_EXCLUDED_PERMISSIONS,
  'SalesRep MEMBER-ONLY (customer:update, no platform:security:update)');
const verifyFull = () => verifyEffectivePermissions(
  SALESREP_FULL_ACCOUNT, SALESREP_FULL_REQUIRED_PERMISSIONS, SALESREP_FULL_EXCLUDED_PERMISSIONS,
  'SalesRep FULL positive control (full CRUD + account-ops, isAdministrator=false)');

async function loginToken(email, password) {
  try {
    const res = await fetch(`${BACK_URL}/connect/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', username: email, password, scope: 'offline_access' }),
    });
    if (!res.ok) { log(`  ✗ restricted login FAILED (${res.status}) for ${email}`); return null; }
    log(`  ✓ restricted account authenticates (${email}, /connect/token 200)`);
    return (await res.json()).access_token;
  } catch (e) { log(`  ✗ restricted login error: ${String(e.message).slice(0, 120)}`); return null; }
}

// --- teardown (reverse; AGENT-TEST only; zero-residue) ---
async function teardownFixture(role, account) {
  const email = account.email;
  const user = await findUser(email);
  if (user?.id) {
    await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
    log(`✗ deleted account ${email}`);
  } else verbose(`account ${email} already gone`);

  const found = await findRole(role);
  if (found?.id) {
    // Role delete accepts the repeated ids= query form; tolerate either 200/204/404.
    await api('DELETE', `/api/platform/security/roles?ids=${encodeURIComponent(found.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`✗ deleted role ${role.role_name}`);
  } else verbose(`role ${role.role_name} already gone`);

  if (!DRY_RUN) {
    const acctLeft = await findUser(email);
    const roleLeft = await findRole(role);
    if (acctLeft?.id || roleLeft?.id) log(`⚠ residue: ${acctLeft ? 'account ' : ''}${roleLeft ? 'role' : ''} still present for ${role.role_name}`);
    else log(`✓ teardown zero-residue for ${role.role_name} (account + role removed)`);
  }
}

// Every back-office RBAC fixture this seeder owns. Add a new entry here to extend coverage.
const FIXTURES = [
  {
    role: RESTRICTED_ROLE, account: RESTRICTED_ACCOUNT,
    assertPerms: assertRolePermissions, excluded: EXCLUDED_PERMISSION, verify: verifyCopyForbidden,
  },
  {
    role: CATALOG_LINK_ROLE, account: CATALOG_LINK_ACCOUNT,
    assertPerms: assertCatalogLinkRolePermissions, excluded: CATALOG_LINK_EXCLUDED_PERMISSION, verify: verifyCategoryLinkForbidden,
  },
  {
    role: SALESREP_READONLY_ROLE, account: SALESREP_READONLY_ACCOUNT,
    assertPerms: assertSalesRepReadOnlyRolePermissions, excluded: SALESREP_READONLY_EXCLUDED_PERMISSION, verify: verifySalesRepReadOnlyAccess,
  },
  {
    role: SALESREP_ACCOUNTOPS_ROLE, account: SALESREP_ACCOUNTOPS_ACCOUNT,
    assertPerms: assertSalesRepAccountOpsRolePermissions, excluded: SALESREP_ACCOUNTOPS_EXCLUDED_PERMISSION, verify: verifyAccountOps,
  },
  {
    role: SALESREP_MEMBERONLY_ROLE, account: SALESREP_MEMBERONLY_ACCOUNT,
    assertPerms: assertSalesRepMemberOnlyRolePermissions, excluded: SALESREP_MEMBERONLY_EXCLUDED_PERMISSION, verify: verifyMemberOnly,
  },
  {
    role: SALESREP_FULL_ROLE, account: SALESREP_FULL_ACCOUNT,
    assertPerms: assertSalesRepFullRolePermissions, excluded: '(none — positive control, isAdministrator=false)', verify: verifyFull,
  },
  {
    role: CATALOG_READONLY_ROLE, account: CATALOG_READONLY_ACCOUNT,
    assertPerms: assertCatalogReadOnlyRolePermissions, excluded: CATALOG_READONLY_EXCLUDED_PERMISSIONS.join(', '), verify: verifyCatalogReadOnlyForbidden,
  },
];

async function main() {
  assertSafeTarget();
  await auth();

  if (TEARDOWN) {
    // Reverse order (symmetry): tear down in the mirror of the create order.
    for (const { role, account } of [...FIXTURES].reverse()) await teardownFixture(role, account);
    return;
  }

  for (const { role, account, assertPerms, excluded } of FIXTURES) {
    const roleId = await ensureRole(role, assertPerms, excluded);
    const userId = await ensureAccount(account, role, roleId);

    if (!DRY_RUN && userId && !String(userId).startsWith('dry-')) {
      writeEnvAliasOverride({
        [account.aliasName]: { _inline: true, platform_id: userId, user_id: userId, role_id: roleId },
      });
      log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${account.aliasName}.platform_id`);
    }
  }

  if (VERIFY) for (const { verify } of FIXTURES) await verify();
  log(DRY_RUN ? 'DRY RUN complete.' : 'Seed complete.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
