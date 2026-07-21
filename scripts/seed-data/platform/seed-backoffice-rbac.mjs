#!/usr/bin/env node
/**
 * scripts/seed-data/platform/seed-backoffice-rbac.mjs
 *
 * Provisions the restricted back-office (Manager) account CMS-123/124 need: a platform user that
 * authenticates but LACKS Page Builder UPDATE (`builder:update`) — read-only Page Builder role.
 * Idempotent find-or-create; writes the runtime platform user id to aliases.<env>.json; ships a
 * reverse --teardown and a --verify live check. Built on seed-common.mjs (single auth context).
 *
 * Single source of truth: ./backoffice-rbac-specs.mjs (side-effect-free).
 *
 *   TEST_ENV=vcst npm run seed:rbac
 *   TEST_ENV=vcst npm run seed:rbac -- --verify      # + live 403 proof for CMS-124
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
  roleBody, accountBody, assertRolePermissions, COPY_ENDPOINT,
} from './backoffice-rbac-specs.mjs';

const VERIFY = process.argv.includes('--verify');

// --- reliable lookups (search-first — GET-by-name/id is cache-flaky, per user-provision.mjs) ---
async function findRole() {
  const r = await api('POST', '/api/platform/security/roles/search', { keyword: RESTRICTED_ROLE.role_name, take: 50 }, { expectStatus: [200] });
  return (r?.results || []).find((x) => x.id === RESTRICTED_ROLE.role_id || x.name === RESTRICTED_ROLE.role_name) || null;
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

function resolvePassword() {
  const raw = process.env[RESTRICTED_ACCOUNT.passwordVar];
  return (raw && String(raw).trim()) || RESTRICTED_ACCOUNT.passwordFallback;
}

// --- seed ---
async function ensureRole() {
  assertRolePermissions(); // guard: never PUT a role that carries a write permission
  const exists = await findRole();
  // PUT is idempotent on the fixed role_id, so it can never create a duplicate and keeps the
  // permission set in sync with the spec on every run.
  await api('PUT', '/api/platform/security/roles', roleBody(), { expectStatus: [200, 201, 204] });
  log(`${exists ? '↻ update' : '✓ create'} role ${RESTRICTED_ROLE.role_id} (${RESTRICTED_ROLE.permissions.join(', ')}) — EXCLUDES ${EXCLUDED_PERMISSION}`);
  return RESTRICTED_ROLE.role_id;
}

async function ensureAccount(roleId) {
  const email = RESTRICTED_ACCOUNT.email;
  const password = resolvePassword();
  const existing = await findUser(email);
  if (existing?.id) {
    // Reconcile: ensure the restricted role is attached and NO administrator flag crept in.
    if (!DRY_RUN) {
      const full = await getUserById(existing.id) || existing;
      let dirty = false;
      const hasRole = (full.roles || []).some((r) => r.id === roleId || r.name === RESTRICTED_ROLE.role_name);
      if (!hasRole) { full.roles = [{ id: roleId, name: RESTRICTED_ROLE.role_name }]; dirty = true; }
      if (full.isAdministrator) { full.isAdministrator = false; dirty = true; }
      if (dirty) { await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] }); log(`↻ reconciled account ${email} (role + isAdministrator=false)`); }
      else verbose(`↻ reuse account ${email} (${existing.id})`);
    }
    return existing.id;
  }
  const res = await api('POST', '/api/platform/security/users/create', accountBody({ email, password, roleId, roleName: RESTRICTED_ROLE.role_name, storeId: STORE_ID }));
  if (res && res.succeeded === false) throw new Error(`create ${email}: ${JSON.stringify(res.errors)}`);
  if (DRY_RUN) { log(`✓ create account (dry) ${email}`); return `dry-${email}`; }
  const fresh = await findUser(email);
  if (!fresh?.id) throw new Error(`created ${email} but could not resolve its id`);
  log(`✓ create account ${fresh.id} (${email}) — Manager, isAdministrator=false, role ${RESTRICTED_ROLE.role_name}`);
  return fresh.id;
}

// --- live verification: CMS-124 boundary (restricted token → 403 on copy endpoint) ---
async function verifyCopyForbidden() {
  const email = RESTRICTED_ACCOUNT.email;
  const password = resolvePassword();
  log('\n  [verify] CMS-124 — restricted token must get 403 on the copy endpoint');
  let tok;
  try {
    const res = await fetch(`${BACK_URL}/connect/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', username: email, password, scope: 'offline_access' }),
    });
    if (!res.ok) { log(`  ✗ restricted login FAILED (${res.status}) — account cannot authenticate to back office`); return false; }
    tok = (await res.json()).access_token;
    log('  ✓ restricted account authenticates (/connect/token 200)');
  } catch (e) { log(`  ✗ restricted login error: ${String(e.message).slice(0, 120)}`); return false; }

  // Dummy group ids — the [Authorize] gate runs before handler binding, so a permission denial
  // returns 403 regardless of whether the groups exist.
  const path = COPY_ENDPOINT('AGENT-TEST-tgt-nonexistent', 'AGENT-TEST-src-nonexistent');
  const res = await fetch(`${BACK_URL}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${tok}` } });
  if (res.status === 403) { log(`  ✓ copy endpoint → 403 Forbidden (CMS-124 boundary confirmed; lacks ${EXCLUDED_PERMISSION})`); return true; }
  log(`  ✗ copy endpoint → ${res.status} (expected 403). Restricted role may be over-permissioned or the endpoint auth changed.`);
  return false;
}

// --- teardown (reverse; AGENT-TEST only; zero-residue) ---
async function teardown() {
  const email = RESTRICTED_ACCOUNT.email;
  const user = await findUser(email);
  if (user?.id) {
    await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
    log(`✗ deleted account ${email}`);
  } else verbose(`account ${email} already gone`);

  const role = await findRole();
  if (role?.id) {
    // Role delete accepts the repeated ids= query form; tolerate either 200/204/404.
    await api('DELETE', `/api/platform/security/roles?ids=${encodeURIComponent(role.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`✗ deleted role ${RESTRICTED_ROLE.role_name}`);
  } else verbose(`role ${RESTRICTED_ROLE.role_name} already gone`);

  if (!DRY_RUN) {
    const acctLeft = await findUser(email);
    const roleLeft = await findRole();
    if (acctLeft?.id || roleLeft?.id) log(`⚠ residue: ${acctLeft ? 'account ' : ''}${roleLeft ? 'role' : ''} still present`);
    else log('✓ teardown zero-residue (account + role removed)');
  }
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  const roleId = await ensureRole();
  const userId = await ensureAccount(roleId);

  if (!DRY_RUN && userId && !String(userId).startsWith('dry-')) {
    writeEnvAliasOverride({
      [RESTRICTED_ACCOUNT.aliasName]: { _inline: true, platform_id: userId, user_id: userId, role_id: roleId },
    });
    log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${RESTRICTED_ACCOUNT.aliasName}.platform_id`);
  }

  if (VERIFY) await verifyCopyForbidden();
  log(DRY_RUN ? 'DRY RUN complete.' : 'Seed complete.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
