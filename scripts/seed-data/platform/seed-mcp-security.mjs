#!/usr/bin/env node
/**
 * scripts/seed-data/platform/seed-mcp-security.mjs
 *
 * Provisions the four VCST-6155 back-office accounts (MCP_OPERATOR, MCP_APPROVER, MCP_MANAGER,
 * MCP_NOROLE) — Manager, isAdministrator=false, emailConfirmed, not locked out, password
 * {{DEFAULT_TEST_PASSWORD}}. Single source of truth: ./mcp-security-specs.mjs.
 *
 * The operator's role "IT Platform Operator" belongs to the stand: it is READ (GET roles/{name})
 * and checked against the spec, never written or deleted. A drifted role FAILS the seed; a missing
 * one falls back to the owned AGENT-TEST-MCP-Operator role and says so.
 *
 * Idempotent find-or-create; existing accounts are reconciled (roles, isAdministrator, emailConfirmed,
 * lock). Runtime ids → aliases.<env>.json. --verify signs every account in (password grant, no
 * browser) and checks /currentuser: required permissions present, excluded ones absent, not admin.
 *
 *   TEST_ENV=vcst npm run seed:mcp-security -- --verify
 *   TEST_ENV=vcst npm run seed:mcp-security:teardown
 *
 * Flags: --dry-run, --verbose, --teardown, --verify, --only MCP_APPROVER[,MCP_NOROLE].
 */

import {
  assertSafeTarget, auth, api, log, verbose, DRY_RUN, TEARDOWN, ONLY,
  BACK_URL, STORE_ID, writeEnvAliasOverride, resetSecurityPassword, isLockedOut,
} from '../../lib/seed-common.mjs';
import { resolvePassword, passwordSource } from '../../lib/user-provision.mjs';
import {
  ACCOUNTS, ALL_MCP_FIXTURE_PERMISSIONS, OPERATOR_ROLE, OPERATOR_FALLBACK_ROLE, APPROVER_ROLE, MANAGER_ROLE,
  CURRENTUSER_ENDPOINT, roleBody, accountBody, decidabilityProblems,
} from './mcp-security-specs.mjs';

const VERIFY = process.argv.includes('--verify');
const ONLY_SET = ONLY ? new Set(String(ONLY).split(',').map((x) => x.trim()).filter(Boolean)) : null;
const SELECTED = ONLY_SET ? ACCOUNTS.filter((a) => ONLY_SET.has(a.aliasName)) : ACCOUNTS;

// --- lookups. Users: search to find, GET users/{userName} for the full record (GET users/{id} answers
// nothing — the id route is users/id/{id}). Roles: GET roles/{name}, because roles/search returns
// permissions: [] for every role (kb KB-49F6B6EF). ---
async function getRole(name) {
  const r = await api('GET', `/api/platform/security/roles/${encodeURIComponent(name)}`, null, { expectStatus: [200, 204, 404] });
  return r?.id ? r : null;
}
async function findUser(email) {
  const s = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 10 }, { expectStatus: [200, 201] });
  return (s?.results || []).find((u) => (u.userName || '').toLowerCase() === email.toLowerCase()
    || (u.email || '').toLowerCase() === email.toLowerCase()) || null;
}
async function getUser(userName) {
  const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(userName)}`, null, { expectStatus: [200, 204, 404] });
  return u?.id ? u : null;
}
const permsOf = (role) => (role?.permissions || []).map((p) => p.name || p.id).sort();

// --- roles ---
/** The stand-owned operator role, checked; else the owned fallback. Returns the role spec actually used. */
async function resolveOperatorRole() {
  const live = await getRole(OPERATOR_ROLE.role_name);
  if (!live) {
    log(`⚠ role "${OPERATOR_ROLE.role_name}" is MISSING on this stand — falling back to owned ${OPERATOR_FALLBACK_ROLE.role_name}`);
    return { spec: OPERATOR_FALLBACK_ROLE, ref: await upsertRole(OPERATOR_FALLBACK_ROLE) };
  }
  const want = [...OPERATOR_ROLE.permissions].sort().join(',');
  const got = permsOf(live).join(',');
  if (want !== got) {
    throw new Error(`stand-owned role "${OPERATOR_ROLE.role_name}" drifted — holds [${got}], the cases expect [${want}]. `
      + 'Not modifying a shared role: fix it on the stand or update OPERATOR_ROLE in mcp-security-specs.mjs.');
  }
  log(`✓ role "${live.name}" exists (stand-owned, read only) with exactly [${got}]`);
  return { spec: OPERATOR_ROLE, ref: { id: live.id, name: live.name } };
}

async function upsertRole(role) {
  const before = await getRole(role.role_name);
  await api('PUT', '/api/platform/security/roles', roleBody(role), { expectStatus: [200, 201, 204] });
  log(`${before ? '↻ update' : '✓ create'} role ${role.role_name} [${role.permissions.join(', ')}]`);
  if (DRY_RUN) return { id: role.role_id, name: role.role_name };
  const after = await getRole(role.role_name);
  if (!after) throw new Error(`role ${role.role_name} not readable after PUT`);
  const got = permsOf(after).join(','); const want = [...role.permissions].sort().join(',');
  if (got !== want) throw new Error(`role ${role.role_name} holds [${got}] after PUT, expected [${want}]`);
  return { id: after.id, name: after.name };
}

// --- accounts ---
async function ensureAccount(account, roleRef) {
  const password = resolvePassword(account.password);
  const existing = await findUser(account.email);
  if (!existing) {
    const res = await api('POST', '/api/platform/security/users/create', accountBody(account, { password, storeId: STORE_ID, roleRef }));
    if (res && res.succeeded === false) throw new Error(`create ${account.email}: ${JSON.stringify(res.errors)}`);
    if (DRY_RUN) { log(`✓ create account (dry) ${account.email}`); return null; }
    const fresh = await findUser(account.email);
    if (!fresh?.id) throw new Error(`created ${account.email} but could not resolve its id`);
    log(`✓ create account ${account.email} (${fresh.id}) — Manager, isAdministrator=false, roles [${roleRef ? roleRef.name : ''}]`);
    await reconcile(fresh, account, roleRef); // in case users/create dropped emailConfirmed
    return fresh.id;
  }
  if (!DRY_RUN) await reconcile(existing, account, roleRef);
  return existing.id;
}

/**
 * Make an existing account match the spec exactly — roles, admin flag, confirmed, unlocked.
 * lockoutEnabled is NOT reconciled: the platform keeps it true on create and on PUT (measured vcst
 * 2026-11-09: PUT succeeded:true, read back true). "Not locked" is lockoutEnd, via isLockedOut().
 */
async function reconcile(found, account, roleRef) {
  const full = (await getUser(account.email)) || found;
  const fixes = [];
  const roleNames = (full.roles || []).map((r) => r.name).sort().join(',');
  const want = roleRef ? roleRef.name : '';
  if (roleNames !== want) { full.roles = roleRef ? [roleRef] : []; fixes.push(`roles [${roleNames}]→[${want}]`); }
  if (full.isAdministrator) { full.isAdministrator = false; fixes.push('isAdministrator→false'); }
  if (full.userType !== account.userType) { full.userType = account.userType; fixes.push(`userType→${account.userType}`); }
  if (full.emailConfirmed !== true) { full.emailConfirmed = true; fixes.push('emailConfirmed→true'); }
  if (fixes.length) {
    await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
    log(`↻ reconciled ${account.email}: ${fixes.join(', ')}`);
  } else verbose(`↻ reuse ${account.email} (${found.id})`);
  if (isLockedOut(full)) {
    await api('POST', `/api/platform/security/users/${encodeURIComponent(found.id)}/unlock`, null, { expectStatus: [200, 204] });
    log(`↻ unlocked ${account.email}`);
  }
}

// --- verification (no browser: password grant + /currentuser + admin search) ---
async function token(email, password) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: email, password, scope: 'offline_access' }),
  });
  return res.ok ? (await res.json()).access_token : { status: res.status };
}

async function verifyAccount(account, roleRef) {
  let pw = resolvePassword(account.password);
  let tok = await token(account.email, pw);
  if (typeof tok !== 'string' && passwordSource(account.password).kind === 'env') {
    // A reused account may carry an older password: re-apply the declared one once (never the fallback).
    log(`  ⚠ ${account.email}: /connect/token ${tok.status} — re-applying {{DEFAULT_TEST_PASSWORD}} once`);
    await resetSecurityPassword(api, account.email, pw);
    tok = await token(account.email, pw);
  }
  if (typeof tok !== 'string') { log(`  ✗ ${account.aliasName}: /connect/token ${tok.status}`); return false; }
  const me = await (await fetch(`${BACK_URL}${CURRENTUSER_ENDPOINT}`, { headers: { Authorization: `Bearer ${tok}` } })).json().catch(() => null);
  const perms = new Set(me?.permissions || []);
  const missing = account.required.filter((p) => !perms.has(p));
  const leaked = account.excluded.filter((p) => perms.has(p));
  const u = (await getUser(account.email)) || {};
  const roles = (u.roles || []).map((r) => r.name).sort().join(',');
  const ok = !missing.length && !leaked.length && me?.isAdministrator === false
    && u.emailConfirmed === true && !isLockedOut(u) && roles === (roleRef ? roleRef.name : '');
  log(`  ${ok ? '✓' : '✗'} ${account.aliasName}: token 200 · roles [${roles}] · emailConfirmed=${u.emailConfirmed} · locked=${isLockedOut(u)} · `
    + `isAdministrator=${me?.isAdministrator} · missing [${missing.join(', ')}] · leaked [${leaked.join(', ')}] · ${perms.size} effective perm(s)`);
  return ok;
}

// --- teardown (reverse; AGENT-TEST only; the stand-owned role is never touched) ---
async function teardown() {
  for (const account of [...SELECTED].reverse()) {
    if (await findUser(account.email)) {
      await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(account.email)}`, null, { expectStatus: [200, 204, 404] });
      log(`✗ deleted account ${account.email}`);
    } else verbose(`account ${account.email} already gone`);
  }
  const ownedRoles = [];
  if (!ONLY_SET || ONLY_SET.has('MCP_MANAGER')) ownedRoles.push(MANAGER_ROLE);
  if (!ONLY_SET || ONLY_SET.has('MCP_APPROVER')) ownedRoles.push(APPROVER_ROLE);
  if (!ONLY_SET || ONLY_SET.has('MCP_OPERATOR')) ownedRoles.push(OPERATOR_FALLBACK_ROLE);
  for (const role of ownedRoles) {
    const live = await getRole(role.role_name);
    if (live) {
      await api('DELETE', `/api/platform/security/roles?ids=${encodeURIComponent(live.id)}`, null, { expectStatus: [200, 204, 404] });
      log(`✗ deleted role ${role.role_name}`);
    } else verbose(`role ${role.role_name} already gone`);
  }
  if (DRY_RUN) return;
  const left = [];
  for (const a of SELECTED) if (await findUser(a.email)) left.push(a.email);
  for (const r of ownedRoles) if (await getRole(r.role_name)) left.push(r.role_name);
  const shared = await getRole(OPERATOR_ROLE.role_name);
  if (left.length) { log(`⚠ residue: ${left.join(', ')}`); process.exitCode = 1; }
  else log(`✓ teardown zero-residue (${SELECTED.length} account(s) + ${ownedRoles.length} owned role slot(s)); "${OPERATOR_ROLE.role_name}" ${shared ? 'left in place' : 'not present'}`);
}

async function main() {
  assertSafeTarget();
  if (ONLY_SET && !SELECTED.length) throw new Error(`--only ${ONLY} matched no fixture (${ACCOUNTS.map((a) => a.aliasName).join(', ')})`);
  const spec = decidabilityProblems();
  if (spec.length) throw new Error(`spec is not decidable: ${spec.join('; ')}`);
  await auth();
  if (TEARDOWN) { await teardown(); return; }

  // A stand without the MCP module registers none of these permissions: skip (exit 0), never seed
  // roles that would carry permissions the platform does not know.
  const known = new Set(((await api('GET', '/api/platform/security/permissions', null, { expectStatus: [200] })) || []).map((p) => p.id || p.name));
  const unknown = ALL_MCP_FIXTURE_PERMISSIONS.filter((p) => !known.has(p));
  if (unknown.length) { log(`⏭ skip — this stand does not register ${unknown.join(', ')} (MCP / System Operations module absent?)`); return; }

  const roleRefs = {};
  for (const account of SELECTED) {
    if (!account.role) continue;
    roleRefs[account.aliasName] = account.role.owned ? await upsertRole(account.role) : (await resolveOperatorRole()).ref;
  }

  for (const account of SELECTED) {
    const roleRef = roleRefs[account.aliasName] || null;
    const id = await ensureAccount(account, roleRef);
    if (id) {
      writeEnvAliasOverride({
        [account.aliasName]: {
          _inline: true, platform_id: id, user_id: id, id, userName: account.email, email: account.email,
          role_id: roleRef?.id || null, role_name: roleRef?.name || null,
        },
      });
      log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${account.aliasName}`);
    }
  }
  log(DRY_RUN ? 'DRY RUN complete.' : 'Seed complete.');

  if (VERIFY && !DRY_RUN) {
    log('\n  [verify] sign-in (password grant) + /currentuser + admin record per account');
    const results = [];
    for (const account of SELECTED) results.push(await verifyAccount(account, roleRefs[account.aliasName] || null));
    const bad = results.filter((x) => !x).length;
    if (bad) { log(`\n✗ ${bad}/${results.length} account(s) FAILED verification`); process.exitCode = 1; }
    else log(`\n✓ all ${results.length} account(s) verified live.`);
  }
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
