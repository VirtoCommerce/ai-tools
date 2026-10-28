#!/usr/bin/env node
/**
 * seed-passkey.mjs — provision the VCST-6121 passkey sign-in accounts (why each exists: passkey-specs.mjs).
 *
 * WHAT IT MAKES — every entity is OURS (AGENT-TEST-PK*), none is borrowed:
 *   2 organizations   AGENT-TEST-PK-Org-Main, AGENT-TEST-PK-Org-Lockable (only PK_BUYER_MULTI is in it)
 *   5 Customer accounts + contacts on STORE_ID (PK_BUYER, PK_BUYER_MULTI, PK_B2C, PK_LOCKOUT, PK_PASSKEY_ONLY),
 *     buyers with an org-scoped "Purchasing agent" OrganizationMembership per org
 *   3 Manager accounts, no contact (PK_BO_MANAGER, PK_BO_MANAGER_2 — existing least-privilege role by name;
 *     PK_OPERATOR — our own role AGENT-TEST-PK-Impersonator, platform:security:loginOnBehalf only)
 * All: lockoutEnabled, emailConfirmed, passwordExpired false, password {{DEFAULT_TEST_PASSWORD}}.
 *
 * RE-ARM: re-running on an existing account unlocks it, zeroes accessFailedCount, re-asserts every
 * flag and role, unlocks its memberships, re-sets the password (a passkey-only case removed it) and
 * DELETES every passkey left on it by an earlier run (signing in as the account — the platform has no
 * admin endpoint for another user's keys). Re-seed BEFORE a run, never between an observation and
 * its audit (test-data-authoring.md §DISPOSABLE FIXTURES).
 *
 * USAGE
 *   TEST_ENV=<env> node scripts/seed-data/auth/seed-passkey.mjs [--dry-run] [--verbose] [--only <alias|key>]
 *   TEST_ENV=<env> node scripts/seed-data/auth/seed-passkey.mjs --verify       (seed, then live checks)
 *   TEST_ENV=<env> node scripts/seed-data/auth/seed-passkey.mjs --verify-only  (live checks, no writes)
 *   TEST_ENV=<env> node scripts/seed-data/auth/seed-passkey.mjs --teardown
 *
 * --verify: read-back of every flag, a password grant per account (Customers with storeId; Managers
 * without), /currentuser permissions for the Managers, the passkey count per account, and ONE
 * impersonate grant PK_OPERATOR → PK_BUYER. It changes nothing but the sign-in log.
 *
 * Safety: assertSafeTarget (ENV_RISK=production aborts). Teardown removes only agent-test-pk-* accounts,
 * contacts/orgs carrying our outerId marker (or our exact email/name), their memberships, and our own
 * role; it ends on a zero-residue assert. No store and no store setting is ever written here.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, verifyRemoved, writeEnvAliasOverride, resetSecurityPassword,
  DRY_RUN, TEARDOWN, ONLY, STORE_ID, BACK_URL, ROOT,
} from '../../lib/seed-common.mjs';
import {
  SEED_PREFIX, PASSWORD_VAR, ACCOUNTS, ORGS, BUYER_ROLE_NAME, BO_ROLE_NAME, OPERATOR_ROLE,
  orgBody, contactBody, accountBody, accountProblems, isSeededOuterId, seedOuterId, resolveStoreId,
} from './passkey-specs.mjs';

const argv = process.argv.slice(2);
const VERIFY_ONLY = argv.includes('--verify-only');
const VERIFY = argv.includes('--verify') || VERIFY_ONLY;
const TEST_ENV = process.env.TEST_ENV || 'vcst';
const inScope = (s) => !ONLY || ONLY === s.alias || ONLY === s.key;

/* ── lookups ─────────────────────────────────────────────────────────────────── */

function readOverlay() {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}

/** Users search is the reliable existence check (GET-by-name is cache-flaky); keyword matches userName. */
async function findUser(email) {
  const r = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 20 }, { expectStatus: [200, 201] });
  const e = email.toLowerCase();
  return (r?.results || []).find((u) => lc(u.email) === e || lc(u.userName) === e) || null;
}
const lc = (v) => String(v || '').toLowerCase();

async function getMember(id) {
  if (!id || String(id).startsWith('dry-')) return null;
  const m = await api('GET', `/api/members/${encodeURIComponent(id)}`, null, { expectStatus: [200, 204, 404] });
  return m?.id ? m : null;
}

async function searchMembers(memberType, keyword) {
  const r = await api('POST', '/api/members/search', { memberType, keyword, deepSearch: true, take: 50 }, { expectStatus: [200, 201] });
  return r?.results || [];
}

async function findOrg(org, overlayId) {
  const byId = await getMember(overlayId);
  if (byId && (isSeededOuterId(byId.outerId) || byId.name === org.name)) return byId;
  return (await searchMembers('Organization', org.name)).find((m) => m.outerId === seedOuterId(org.key) || m.name === org.name) || null;
}

async function findContact(spec, overlayId) {
  const byId = await getMember(overlayId);
  if (byId) return byId;
  return (await searchMembers('Contact', spec.email)).find((m) => (m.emails || []).some((x) => lc(x) === spec.email)
    || m.outerId === seedOuterId(spec.key)) || null;
}

async function memberships(userId) {
  if (!userId || String(userId).startsWith('dry-')) return [];
  const r = await api('POST', '/api/customer/organization-memberships/search', { userId, take: 100 }, { expectStatus: [200, 201] });
  return r?.results || [];
}

async function getRole(name) {
  const r = await api('GET', `/api/platform/security/roles/${encodeURIComponent(name)}`, null, { expectStatus: [200, 204, 404] });
  return r?.id ? r : null;
}

/** POST /connect/token (form). Returns { status, json } — never logs the body it sent. */
async function token(form, bearer = null) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: new URLSearchParams(form), signal: AbortSignal.timeout(40000),
  });
  let json = null; try { json = JSON.parse(await res.text()); } catch { /* non-JSON */ }
  return { status: res.status, json };
}
const tokenError = (t) => (t.json?.access_token ? null : `${t.status} ${t.json?.error || ''}/${t.json?.code || t.json?.error_description || ''}`);
const passwordGrant = (spec, password, storeId) => token({
  grant_type: 'password', username: spec.email, password, scope: 'offline_access', ...(storeId ? { storeId } : {}),
});
/** The grant that signs this account in for real: Customers + operator with the store, BO managers without. */
const signInStore = (spec) => (spec.kind === 'bo-manager' ? '' : resolveStoreId(spec, STORE_ID));

async function asUser(accessToken, method, path) {
  const res = await fetch(`${BACK_URL}${path}`, { method, headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(40000) });
  let json = null; try { json = JSON.parse(await res.text()); } catch { /* empty */ }
  return { status: res.status, json };
}

/** xAPI as the account. The REST currentuser/sign-in-methods answers 403 to a Customer; xAPI serves both types. */
async function gql(accessToken, query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST', headers: { 'content-type': 'application/json', Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ query, variables }), signal: AbortSignal.timeout(40000),
  });
  let json = null; try { json = JSON.parse(await res.text()); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

/** The account's own passkeys, read as the account. `error` is set when the read itself failed — never a silent 0. */
async function passkeysOf(accessToken) {
  const r = await gql(accessToken, '{ signInMethods { name keys { id } } }');
  const methods = r.json?.data?.signInMethods;
  if (!Array.isArray(methods)) return { keys: [], error: `${r.status} ${JSON.stringify(r.json?.errors?.[0]?.message || r.json).slice(0, 120)}` };
  return { keys: methods.find((m) => lc(m.name) === 'passkey')?.keys || [], error: null };
}

/* ── seed ────────────────────────────────────────────────────────────────────── */

async function ensureRoles() {
  const bo = await getRole(BO_ROLE_NAME);
  if (!bo) throw new Error(`role "${BO_ROLE_NAME}" does not exist on ${TEST_ENV} — pick another least-privilege role in passkey-specs.mjs BO_ROLE_NAME`);
  let op = await getRole(OPERATOR_ROLE.name);
  const want = OPERATOR_ROLE.permissions;
  const have = (op?.permissions || []).map((p) => p.name);
  if (!op || want.some((p) => !have.includes(p)) || have.length !== want.length) {
    await api('PUT', '/api/platform/security/roles', {
      id: OPERATOR_ROLE.id, name: OPERATOR_ROLE.name, description: OPERATOR_ROLE.description,
      permissions: want.map((name) => ({ name })),
    }, { expectStatus: [200, 204] });
    log(`  ${op ? '↻ reconcile' : '✓ create'} role ${OPERATOR_ROLE.name} [${want.join(', ')}]`);
    op = DRY_RUN ? { id: OPERATOR_ROLE.id, name: OPERATOR_ROLE.name } : await getRole(OPERATOR_ROLE.name);
  }
  const buyerRole = await getRole(BUYER_ROLE_NAME);
  if (!buyerRole) throw new Error(`org role "${BUYER_ROLE_NAME}" does not exist on ${TEST_ENV}`);
  log(`  role ${BO_ROLE_NAME} (${bo.id}) permissions LIVE: [${(bo.permissions || []).map((p) => p.name).join(', ')}]`);
  return { [BO_ROLE_NAME]: { id: bo.id, name: bo.name }, [OPERATOR_ROLE.name]: { id: op.id, name: op.name }, buyer: buyerRole };
}

async function ensureOrgs(overlay) {
  const ids = {};
  for (const org of ORGS) {
    let m = await findOrg(org, overlay[org.alias]?.id);
    if (!m) {
      const created = await api('POST', '/api/members', orgBody(org), { expectStatus: [200, 201] });
      if (!created?.id && !DRY_RUN) throw new Error(`POST /api/members ${org.name} returned no id`);
      m = created?.id ? created : { id: `dry-org-${org.key}` };
      log(`  ✓ create org ${m.id} (${org.name})`);
    } else verbose(`reuse org ${m.id} (${org.name})`);
    ids[org.key] = m.id;
  }
  return ids;
}

async function ensureContact(spec, orgIds, overlay, user) {
  let contact = user?.memberId ? await getMember(user.memberId) : null;
  if (!contact) contact = await findContact(spec, overlay[spec.alias]?.memberId);
  if (!contact) {
    const created = await api('POST', '/api/members', contactBody(spec, orgIds), { expectStatus: [200, 201] });
    if (!created?.id && !DRY_RUN) throw new Error(`POST /api/members ${spec.email} returned no contact id`);
    log(`  ✓ create contact ${created?.id || '(dry)'} (${spec.email})`);
    return created?.id || `dry-contact-${spec.key}`;
  }
  const orgs = contact.organizations || [];
  const missing = orgIds.filter((id) => !orgs.includes(id));
  const stray = orgs.filter((id) => !orgIds.includes(id));
  if ((missing.length || stray.length || contact.status !== 'Approved') && !DRY_RUN) {
    await api('PUT', '/api/members', { ...contact, organizations: orgIds, status: 'Approved' }, { expectStatus: [200, 204] });
    log(`  ↻ contact ${contact.id} organizations/status reconciled (${spec.email})`);
  } else verbose(`reuse contact ${contact.id} (${spec.email})`);
  return contact.id;
}

async function ensureMemberships(spec, userId, orgIds, buyerRole) {
  const rows = await memberships(userId);
  const out = {};
  const want = [{ roleId: buyerRole.id, roleName: buyerRole.name }];
  for (const [i, orgId] of orgIds.entries()) {
    const org = ORGS.find((o) => o.key === spec.orgs[i]);
    const m = rows.find((x) => x.organizationId === orgId);
    if (!m) {
      const created = await api('POST', '/api/customer/organization-memberships',
        { userId, organizationId: orgId, organizationName: org.name, roles: want, isLocked: false }, { expectStatus: [200, 201] });
      out[spec.orgs[i]] = created?.id || '';
      log(`  ✓ membership ${created?.id || '(dry)'} ${spec.alias} → ${org.name} [${buyerRole.name}]`);
      continue;
    }
    if (DRY_RUN) { out[spec.orgs[i]] = m.id; continue; }
    if (m.isLocked) {
      await api('POST', `/api/customer/organization-memberships/${encodeURIComponent(m.id)}/unlock`, {}, { expectStatus: [200, 201, 204] });
      log(`  ↻ unlocked membership ${m.id} (${spec.alias} in ${org.name})`);
    }
    const roleOk = (m.roles || []).length === 1 && (m.roles[0].roleId === buyerRole.id || m.roles[0].roleName === buyerRole.name);
    const fresh = m.isLocked ? await api('GET', `/api/customer/organization-memberships/${encodeURIComponent(m.id)}`, null, { expectStatus: [200] }) : m;
    if (!roleOk || fresh.isLocked || (fresh.status && fresh.status !== 'Approved')) {
      await api('PUT', `/api/customer/organization-memberships/${encodeURIComponent(m.id)}`,
        { ...fresh, roles: want, isLocked: false, lockoutEnd: null, status: null }, { expectStatus: [200, 204] });
      log(`  ↻ membership ${m.id} reconciled (role ${buyerRole.name}, unlocked)`);
    }
    out[spec.orgs[i]] = m.id;
  }
  // Ours only: a membership in an org the spec does not list was left by a case — remove it.
  const stray = rows.filter((x) => !orgIds.includes(x.organizationId)).map((x) => x.id);
  if (stray.length && !DRY_RUN) {
    await api('DELETE', `/api/customer/organization-memberships?${stray.map((id) => `ids=${encodeURIComponent(id)}`).join('&')}`, null, { expectStatus: [200, 204] });
    log(`  ✗ removed ${stray.length} stray membership(s) of ${spec.alias}`);
  }
  return out;
}

async function clearPasskeys(spec, password) {
  const t = await passwordGrant(spec, password, signInStore(spec));
  if (tokenError(t)) { log(`  ! ${spec.alias}: cannot sign in to clear leftover passkeys (${tokenError(t)})`); return; }
  const { keys, error } = await passkeysOf(t.json.access_token);
  if (error) { log(`  ! ${spec.alias}: cannot read its passkeys (${error})`); return; }
  for (const k of keys) {
    const r = await gql(t.json.access_token,
      'mutation($c: InputDeleteSignInKeyType!) { deleteSignInKey(command: $c) { succeeded errors { code description } } }',
      { c: { signInMethodName: 'Passkey', keyId: k.id } });
    const ok = r.json?.data?.deleteSignInKey?.succeeded === true;
    log(`  ${ok ? '✗ deleted' : '! could not delete'} leftover passkey ${k.id} of ${spec.alias}${ok ? '' : ` (${JSON.stringify(r.json?.data?.deleteSignInKey?.errors || r.json?.errors || r.status).slice(0, 120)})`}`);
  }
}

async function ensureAccount(spec, ctx) {
  const { password, overlay, orgIdsByKey, roles } = ctx;
  let user = await findUser(spec.email);
  const orgIds = spec.orgs.map((k) => orgIdsByKey[k]);
  const memberId = spec.hasContact ? await ensureContact(spec, orgIds, overlay, user) : null;
  const roleRefs = spec.roles.map((n) => roles[n]);
  const body = accountBody(spec, { envStoreId: STORE_ID, password, memberId, roles: roleRefs });

  if (!user) {
    const res = await api('POST', '/api/platform/security/users/create', body, { expectStatus: [200, 201] });
    if (res && res.succeeded === false) throw new Error(`users/create ${spec.email}: ${JSON.stringify(res.errors)}`);
    if (!DRY_RUN) {
      user = await findUser(spec.email);
      if (!user?.id) throw new Error(`created ${spec.email} but the users search cannot find it`);
      // users/create ignores roles on some builds — assert them through a PUT.
      if (roleRefs.length && roleRefs.some((r) => !(user.roles || []).some((x) => x.id === r.id))) {
        await api('PUT', '/api/platform/security/users', { ...user, roles: roleRefs }, { expectStatus: [200, 204] });
      }
    }
    log(`  ✓ create account ${user?.id || '(dry)'} (${spec.email}) [${spec.userType}]`);
  } else if (!DRY_RUN) {
    if (user.lockoutEnd && new Date(user.lockoutEnd).getTime() > Date.now()) {
      await api('POST', `/api/platform/security/users/${user.id}/unlock`, {}, { expectStatus: [200, 201, 204] });
      user = (await findUser(spec.email)) || user;
    }
    const { password: _pw, ...flags } = body;
    const full = { ...user, ...flags, lockoutEnd: null, accessFailedCount: 0 };
    delete full.password; delete full.passwordHash;
    const put = await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
    if (put && put.succeeded === false) throw new Error(`PUT users ${spec.email}: ${JSON.stringify(put.errors)}`);
    if (!await resetSecurityPassword(api, user.userName, password)) throw new Error(`password reset failed for ${spec.email}`);
    await clearPasskeys(spec, password);
    log(`  ↻ re-armed ${spec.email} (${user.id})`);
  } else log(`  ↻ would re-arm ${spec.email}`);

  const userId = user?.id || `dry-user-${spec.key}`;
  const mships = spec.orgs.length ? await ensureMemberships(spec, userId, orgIds, roles.buyer) : {};
  const wb = {
    userId: DRY_RUN ? '' : userId, memberId: DRY_RUN ? '' : (memberId || ''),
    storeId: resolveStoreId(spec, STORE_ID), org_id: DRY_RUN ? '' : (orgIds[orgIds.length - 1] || ''),
  };
  if (spec.kind === 'multi-org' && !DRY_RUN) {
    Object.assign(wb, { org_a_id: orgIds[0], org_b_id: orgIds[1], membership_a_id: mships[spec.orgs[0]] || '', membership_b_id: mships[spec.orgs[1]] || '' });
  }
  return wb;
}

async function seed(roles) {
  const password = process.env[PASSWORD_VAR];
  if (!password && !DRY_RUN) throw new Error(`${PASSWORD_VAR} is not set (resolve through .env.local) — refusing to seed a fallback password`);
  const overlay = readOverlay();
  const orgIdsByKey = await ensureOrgs(overlay);
  const writeback = Object.fromEntries(ORGS.map((o) => [o.alias, { name: o.name, id: DRY_RUN ? '' : orgIdsByKey[o.key] }]));
  const ctx = { password, overlay, orgIdsByKey, roles };
  for (const spec of ACCOUNTS.filter(inScope)) writeback[spec.alias] = await ensureAccount(spec, ctx);
  writeEnvAliasOverride(writeback);
  return orgIdsByKey;
}

/* ── verify (live; changes nothing but the sign-in log) ─────────────────────── */

async function liveOrgIds() {
  const overlay = readOverlay();
  const ids = {};
  for (const org of ORGS) ids[org.key] = (await findOrg(org, overlay[org.alias]?.id))?.id;
  return ids;
}

async function verify(orgIdsByKey) {
  console.log('\n[verify] every passkey account against the shape its cases need\n');
  const password = process.env[PASSWORD_VAR];
  const problems = [];
  const tokens = {};
  for (const spec of ACCOUNTS.filter(inScope)) {
    const user = await findUser(spec.email);
    const member = user?.memberId ? await getMember(user.memberId) : null;
    const rows = await memberships(user?.id);
    const p = accountProblems(spec, user, { member, memberships: rows, orgIdsByKey, envStoreId: STORE_ID });
    const t = user ? await passwordGrant(spec, password, signInStore(spec)) : { status: 0 };
    if (tokenError(t)) p.push(`${spec.alias}: password grant ${signInStore(spec) ? `storeId=${signInStore(spec)}` : 'without storeId'} → ${tokenError(t)}`);
    else tokens[spec.alias] = t.json.access_token;
    let extra = '';
    if (tokens[spec.alias]) {
      const { keys, error } = await passkeysOf(tokens[spec.alias]);
      extra += ` passkeys:${error ? 'UNREADABLE' : keys.length}`;
      if (error) p.push(`${spec.alias}: signInMethods unreadable (${error})`);
      if (keys.length) p.push(`${spec.alias}: ${keys.length} leftover passkey(s) — re-seed to clear`);
      if (spec.userType === 'Manager') {
        const me = (await asUser(tokens[spec.alias], 'GET', '/api/platform/security/currentuser')).json || {};
        extra += ` permissions:[${(me.permissions || []).join(', ')}]`;
        if (!(me.permissions || []).length) p.push(`${spec.alias}: no permission — the Admin SPA would show its no-access screen`);
      }
    }
    log(`${p.length ? '✗' : '✓'} ${spec.alias} = ${spec.email} {userType:${user?.userType}, admin:${user?.isAdministrator}, storeId:${user?.storeId || 'none'}, lockoutEnabled:${user?.lockoutEnabled}, emailConfirmed:${user?.emailConfirmed}, roles:[${(user?.roles || []).map((r) => r.name).join(', ')}], memberships:${rows.length}, token:${tokens[spec.alias] ? 'yes' : 'no'}${extra}}`);
    problems.push(...p);
  }
  // The operator must be able to act as PK_BUYER — one impersonate grant, read back as the target.
  if (tokens.PK_OPERATOR && (!ONLY || ['PK_OPERATOR', 'OPERATOR'].includes(ONLY))) {
    const target = await findUser(ACCOUNTS.find((a) => a.alias === 'PK_BUYER').email);
    const im = target ? await token({ grant_type: 'impersonate', user_id: target.id, scope: 'offline_access' }, tokens.PK_OPERATOR) : { status: 0 };
    let ok = !tokenError(im);
    if (ok) ok = lc((await asUser(im.json.access_token, 'GET', '/api/platform/security/currentuser')).json?.userName) === lc(target.userName);
    log(`${ok ? '✓' : '✗'} PK_OPERATOR impersonate grant → PK_BUYER ${ok ? '(token is PK_BUYER)' : tokenError(im) || 'token is not PK_BUYER'}`);
    if (!ok) problems.push('PK_OPERATOR cannot impersonate PK_BUYER');
  }
  console.log('');
  problems.forEach((x) => log(`✗ ${x}`));
  log(problems.length ? `[verify] ${problems.length} problem(s)` : '[verify] ✓ every passkey account is armed');
  return problems;
}

/* ── teardown ────────────────────────────────────────────────────────────────── */

async function teardown() {
  log(`Teardown: removing ${SEED_PREFIX} accounts, their memberships + contacts, the orgs and ${OPERATOR_ROLE.name}`);
  const overlay = readOverlay();
  const snap = [];
  for (const spec of ACCOUNTS.filter(inScope)) {
    const user = await findUser(spec.email);
    const contact = spec.hasContact ? ((user?.memberId && await getMember(user.memberId)) || await findContact(spec, overlay[spec.alias]?.memberId)) : null;
    const ours = contact && (isSeededOuterId(contact.outerId) || (contact.emails || []).some((x) => lc(x) === spec.email));
    snap.push({ spec, user, contactId: ours ? contact.id : null, mships: (await memberships(user?.id)).map((m) => m.id) });
  }
  const orgs = ONLY ? [] : (await Promise.all(ORGS.map((o) => findOrg(o, overlay[o.alias]?.id)))).filter(Boolean);
  for (const s of snap) {
    if (s.mships.length && !DRY_RUN) await api('DELETE', `/api/customer/organization-memberships?${s.mships.map((id) => `ids=${encodeURIComponent(id)}`).join('&')}`, null, { expectStatus: [200, 204, 404] });
    if (s.user) {
      if (!DRY_RUN) await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(s.user.userName)}`, null, { expectStatus: [200, 204, 404] });
      log(`  ✗ account ${s.user.userName} (+${s.mships.length} membership(s); its passkeys go with it)`);
    }
    if (s.contactId) {
      if (!DRY_RUN) await api('DELETE', `/api/members?ids=${encodeURIComponent(s.contactId)}`, null, { expectStatus: [200, 204, 404] });
      log(`  ✗ contact ${s.contactId} (${s.spec.email})`);
    }
  }
  for (const o of orgs) {
    if (!DRY_RUN) await api('DELETE', `/api/members?ids=${encodeURIComponent(o.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✗ org ${o.id} (${o.name})`);
  }
  const role = ONLY ? null : await getRole(OPERATOR_ROLE.name);
  if (role) {
    if (!DRY_RUN) await api('DELETE', `/api/platform/security/roles?ids=${encodeURIComponent(role.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✗ role ${role.name}`);
  }
  const residue = await verifyRemoved(async () => {
    const left = [];
    for (const s of snap) {
      if (await findUser(s.spec.email)) left.push(`account ${s.spec.email}`);
      if (s.contactId && await getMember(s.contactId)) left.push(`contact ${s.contactId}`);
      if (s.user && (await memberships(s.user.id)).length) left.push(`membership(s) of ${s.spec.email}`);
    }
    for (const o of orgs) if (await getMember(o.id)) left.push(`org ${o.name}`);
    if (role && await getRole(OPERATOR_ROLE.name)) left.push(`role ${OPERATOR_ROLE.name}`);
    left.forEach((x) => log(`  residual ${x}`));
    return left;
  });
  const blank = { userId: '', memberId: '', org_id: '' };
  writeEnvAliasOverride({
    ...Object.fromEntries(snap.map((s) => [s.spec.alias, s.spec.kind === 'multi-org'
      ? { ...blank, org_a_id: '', org_b_id: '', membership_a_id: '', membership_b_id: '' } : blank])),
    ...(ONLY ? {} : Object.fromEntries(ORGS.map((o) => [o.alias, { id: '' }]))),
  });
  log(residue === 0 ? 'Teardown complete — zero residue.' : `WARN: ${residue} residual entity/entities remain.`);
  if (residue) process.exitCode = 1;
}

/* ── main ────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  await auth();
  console.log(`\nPasskey sign-in fixtures — TEST_ENV=${TEST_ENV} store=${STORE_ID}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);
  if (TEARDOWN) { await teardown(); return; }
  let orgIds = null;
  if (!VERIFY_ONLY) orgIds = await seed(await ensureRoles());
  if (VERIFY && !DRY_RUN) { if ((await verify(orgIds || await liveOrgIds())).length) process.exitCode = 1; }
  log(DRY_RUN ? 'DRY RUN complete.' : 'Done.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
