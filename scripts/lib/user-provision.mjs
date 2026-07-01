#!/usr/bin/env node
/**
 * scripts/lib/user-provision.mjs
 *
 * SINGLE shared provisioning library for every "company user" fixture (VCST-5406).
 * Replaces the duplicated auth/api/CRUD primitives that used to live in four separate
 * seeders (seed-b2b-fixtures, seed-users, seed-impersonation-targets, seed-loyalty-users).
 * The one entry point that drives it is scripts/seed-company-users.mjs.
 *
 * What it provisions — the full member graph:
 *
 *   organizations ── addresses
 *        │
 *     contacts (0..N orgs, optional customer group)
 *        │
 *   security accounts (Customer login; status Approved | Locked | EmailUnconfirmed)
 *        │
 *   organization-memberships ── roles   (ORG-SCOPED only — VCST-5028, never global)
 *
 * Invariants preserved from the originals:
 *   • B2B roles are org-scoped (OrganizationMembership), NEVER on the account's global roles[]
 *     (VCST-5028) — stripSeededGlobalRoles enforces it.
 *   • find-or-create is idempotent; provisioning a login NEVER creates a second contact
 *     (the historical dedupe bug) — it uses the in-hand contact id.
 *   • account status is data-driven from the CSV `status` column: Locked → lockoutEnd 9999,
 *     EmailUnconfirmed/Pending → emailConfirmed:false (folds in the impersonation-target script).
 *   • loyalty users get their customer group (VIP/Wholesale) on the contact (folds in
 *     seed-loyalty-users).
 *   • identity from .env.{ENV}, secrets from .env.local, per-env suffix promotion (portable).
 *
 * Env: read AFTER the loadDotenv + suffix-promotion below (mirrors config.js/seed-common.mjs).
 * Prod is blocked by config (ENV_RISK=production), not hostname.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { ensureMemberIndex, verifyCreated, verifyRemoved } from './seed-common.mjs';
import { resolveAllRoles } from './user-roles.mjs';

// --- Env (defaults → .env.{ENV} → .env.local) + per-env suffix promotion ---
export const TEST_ENV = process.env.TEST_ENV || 'vcst';
loadDotenv({ path: '.env.defaults' });
loadDotenv({ path: `.env.${TEST_ENV}`, override: true });
loadDotenv({ path: '.env.local', override: true });
const _ENV_SUFFIX = `_${TEST_ENV.toUpperCase()}`;
for (const [k, v] of Object.entries(process.env)) {
  if (k.endsWith(_ENV_SUFFIX) && v) process.env[k.slice(0, -_ENV_SUFFIX.length)] = v;
}

export const BACK_URL = process.env.BACK_URL;
export const ADMIN = process.env.ADMIN;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
export const STORE_ID = process.env.STORE_ID || 'B2B-store';
export const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();
export const DATE = new Date().toISOString().slice(0, 10).replace(/-/g, '');

const __dirname = dirname(fileURLToPath(import.meta.url));
export const ROOT = join(__dirname, '..', '..');

// Runtime flags — set by the entry via setFlags(); default off (unit tests never pass --dry-run).
let DRY_RUN = process.argv.includes('--dry-run');
let VERBOSE = process.argv.includes('--verbose');
export function setFlags({ dryRun, verbose } = {}) {
  if (dryRun !== undefined) DRY_RUN = dryRun;
  if (verbose !== undefined) VERBOSE = verbose;
}
export const isDryRun = () => DRY_RUN;

export { ensureMemberIndex, verifyCreated, verifyRemoved };

// --- CSV parser (quoted-field aware) ---
export function parseCsvLine(line) {
  const fields = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') { fields.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}
export function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const f = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, f[i] || '']));
  });
}
const readCsv = (rel) => { try { return parseCsv(readFileSync(join(ROOT, rel), 'utf-8')); } catch { return []; } };

// --- HTTP (reads run in dry-run; writes are stubbed) ---
let TOKEN = null;
const isReadCall = (method, path) => method === 'GET' || (method === 'POST' && path.includes('/search'));

export async function authenticate() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  if (!res.ok) throw new Error(`Auth ${res.status}: ${await res.text()}`);
  const data = await res.json();
  TOKEN = data.access_token;
  console.log(`  Auth: OK (expires in ${data.expires_in}s)${DRY_RUN ? ' [DRY RUN — reads only]' : ''}`);
}

let api = async function api(method, path, body, { expectStatus = [200, 201, 204] } = {}) {
  if (DRY_RUN && !isReadCall(method, path)) {
    if (VERBOSE) console.log(`  [DRY RUN] ${method} ${path}`);
    return { _dryRun: true, id: `dry-${Math.random().toString(36).slice(2, 10)}` };
  }
  const headers = { Authorization: `Bearer ${TOKEN}` };
  let fetchBody;
  if (body) { headers['Content-Type'] = 'application/json'; fetchBody = JSON.stringify(body); }
  const res = await fetch(`${BACK_URL}${path}`, { method, headers, body: fetchBody });
  if (!expectStatus.includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
};
// Test seam — swap the HTTP layer.
export function __setApi(fn) { api = fn; }
export const getApi = () => api;

// --- Lookups ---
export async function findOrgByName(name) {
  const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: name, take: 50 });
  return (r?.results || []).find(m => m.name === name);
}
export async function findUserByEmail(email) {
  // Search FIRST — the GET-by-username endpoint is cache-flaky (200 + empty/stale body), which
  // caused duplicate account+contact creation across re-seeds. Search is the reliable check.
  try {
    const s = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 10 });
    const hit = (s?.results || []).find(u =>
      (u.userName || '').toLowerCase() === email.toLowerCase() ||
      (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit?.id) return hit;
  } catch { /* fall through */ }
  try {
    const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
    return u?.id ? u : null;
  } catch { return null; }
}
export async function getUserById(id) {
  if (!id) return null;
  try {
    const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
    return u?.id ? u : null;
  } catch { return null; }
}
export async function findContactById(id) {
  if (!id) return null;
  try { return await api('GET', `/api/contacts/${id}`, null, { expectStatus: [200, 404] }); } catch { return null; }
}
export async function findContactByEmail(email) {
  const r = await api('POST', '/api/members/search', { memberType: 'Contact', keyword: email, take: 20 });
  return (r?.results || []).find(m => (m.emails || []).some(e => e?.toLowerCase() === email.toLowerCase()));
}

// --- Password resolution (VCST-5406: no secret literals in committed CSVs) ---
// A CSV password cell of the form `{{VAR}}` resolves from process.env[VAR] (which config.js /
// this lib have already suffix-promoted per env). A bare literal passes through (back-compat).
// The localhost-safe fallback lets a fresh clone still seed even before .env.local is filled.
const PW_FALLBACK = 'Password1!';
export function resolvePassword(raw, fallback = PW_FALLBACK) {
  const s = String(raw || '').trim();
  const m = s.match(/^\{\{\s*([A-Z0-9_]+)\s*\}\}$/);
  if (m) return process.env[m[1]] || fallback;
  return s || fallback;
}

// --- Account status flags (data-driven from the CSV `status` column) ---
// Approved (default) | Locked (lockoutEnd 9999) | EmailUnconfirmed/Pending (emailConfirmed:false).
export function statusFlags(status) {
  switch ((status || 'Approved').toLowerCase()) {
    case 'locked':          return { status: 'Locked', emailConfirmed: true, lockoutEnabled: true, lockoutEnd: '9999-12-31T23:59:59Z' };
    case 'emailunconfirmed':
    case 'pending':
    case 'pendingapproval': return { status: 'PendingApproval', emailConfirmed: false, lockoutEnabled: false };
    default:                return { status: 'Approved', emailConfirmed: true, lockoutEnabled: false };
  }
}
const isLockedStatus = (s) => (s || '').toLowerCase() === 'locked';
const isUnconfirmedStatus = (s) => /^(emailunconfirmed|pending|pendingapproval)$/.test((s || '').toLowerCase());

// --- Entity bodies ---
export function orgBody(row) {
  const name = row.org_name;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    memberType: 'Organization',
    name,
    emails: row.emails ? [row.emails.split(';')[0]] : [`${slug}@test-agent.com`],
    phones: row.phones ? row.phones.split(';') : ['+1-555-AGENT-000'],
    addresses: [{
      addressType: 'BillingAndShipping', firstName: 'Test', lastName: 'Admin', organization: name,
      line1: row.address_line1 || '123 Test Street', city: row.city || 'New York',
      regionId: row.region_id || 'NY', regionName: row.region_name || 'New York',
      postalCode: row.postal_code || '10001', countryCode: row.country_code || 'USA',
      countryName: row.country_name || 'United States',
      phone: (row.phones ? row.phones.split(';')[0] : '') || '+1-555-AGENT-000',
      email: row.emails ? row.emails.split(';')[0] : `${slug}@test-agent.com`,
    }],
    groups: (row.groups || 'store-acme').split(',').map(g => g.trim()).filter(Boolean),
    description: row.description || `AGENT-TEST org seeded ${DATE}`,
    status: row.status || 'Approved',
  };
}
export function contactBody(row, orgPlatformIds, groups = []) {
  const body = {
    memberType: 'Contact',
    firstName: row.first_name, lastName: row.last_name,
    fullName: row.full_name || `${row.first_name} ${row.last_name}`,
    name: row.full_name || `${row.first_name} ${row.last_name}`,
    emails: [row.email],
    phones: row.phone ? [row.phone] : ['+1-555-AGENT-100'],
    organizations: orgPlatformIds,
    status: 'Approved',
    timeZone: row.time_zone || 'America/New_York',
    defaultLanguage: row.default_language || 'en-US',
    currencyCode: row.currency_code || 'USD',
    addresses: [{
      addressType: 'BillingAndShipping', firstName: row.first_name, lastName: row.last_name,
      line1: '456 QA Avenue', city: 'New York', regionId: 'NY', regionName: 'New York',
      postalCode: '10001', countryCode: 'USA', countryName: 'United States',
      phone: row.phone || '+1-555-AGENT-100', email: row.email,
    }],
  };
  if (groups.length) body.groups = groups;
  return body;
}

// --- Roles (roles.csv is the oracle) ---
const ROLES_CSV = 'test-data/b2b/roles.csv';
const USERS_CSV = 'test-data/b2b/users.csv';
const ORGS_CSV = 'test-data/b2b/organizations.csv';
const CONTACTS_CSV = 'test-data/b2b/contacts.csv';
const MEMBERSHIPS_CSV = 'test-data/b2b/organization-memberships.csv';
const STATIC_ROLE_NAMES = { 'org-maintainer': 'Organization maintainer', 'org-employee': 'Organization employee' };
let _roleDefs = null;
export function loadRoleDefs() {
  if (!_roleDefs) _roleDefs = readCsv(ROLES_CSV).filter(r => r.role_id);
  return _roleDefs;
}
export function roleIdByName(name) {
  if (!name) return null;
  return loadRoleDefs().find(r => r.role_name === name || r.role_id === name)?.role_id || null;
}
const _roleNameCache = {};
export async function resolveRoleName(roleId) {
  if (STATIC_ROLE_NAMES[roleId]) return STATIC_ROLE_NAMES[roleId];
  if (_roleNameCache[roleId]) return _roleNameCache[roleId];
  const r = await api('GET', `/api/platform/security/roles/${encodeURIComponent(roleId)}`, null, { expectStatus: [200, 404] });
  return (_roleNameCache[roleId] = r?.name || roleId);
}
export async function ensureRoles() {
  const defs = loadRoleDefs();
  if (!defs.length) return;
  console.log(`\n  Ensuring ${defs.length} platform role(s) from roles.csv...`);
  for (const d of defs) {
    const ex = await api('GET', `/api/platform/security/roles/${encodeURIComponent(d.role_id)}`, null, { expectStatus: [200, 404] });
    if (ex?.id) { if (VERBOSE) console.log(`    ↻ role ${d.role_id}`); continue; }
    const permissions = (d.permissions || '').split(';').map(p => p.trim()).filter(Boolean).map(name => ({ name }));
    await api('PUT', '/api/platform/security/roles', { id: d.role_id, name: d.role_name, permissions }, { expectStatus: [200, 201, 204] });
    console.log(`    ✓ role ${d.role_id} (${d.role_name})`);
  }
}

// --- Org + contact seeding ---
export async function seedOrgs(rows, parentMap = {}) {
  console.log(`\n  Seeding ${rows.length} organization(s)...`);
  const out = {};
  for (const row of rows) {
    const existing = await findOrgByName(row.org_name);
    if (existing) {
      out[row.org_id] = { csv_id: row.org_id, name: row.org_name, platform_id: existing.id, reused: true };
      if (VERBOSE) console.log(`    ↻ reuse  ${row.org_id} ${row.org_name} (${existing.id})`);
      continue;
    }
    const body = orgBody(row);
    if (row.parent_org_id && parentMap[row.parent_org_id]) body.parentId = parentMap[row.parent_org_id];
    const created = await api('POST', '/api/members', body);
    const platformId = created?.id || `dry-${row.org_id}`;
    out[row.org_id] = { csv_id: row.org_id, name: row.org_name, platform_id: platformId, reused: false };
    console.log(`    ✓ create ${row.org_id} ${row.org_name} (${platformId})`);
  }
  return out;
}

export async function seedContacts(rows, orgMap) {
  console.log(`\n  Seeding ${rows.length} contact(s)...`);
  const out = {};
  for (const row of rows) {
    const user = await findUserByEmail(row.email);
    if (user?.memberId) {
      const contact = await findContactById(user.memberId);
      if (contact) {
        out[row.contact_id] = { csv_id: row.contact_id, name: row.full_name, email: row.email, platform_id: contact.id, reused: true, user_id: user.id };
        if (VERBOSE) console.log(`    ↻ reuse  ${row.contact_id} ${row.full_name} (${contact.id}) via user ${user.id}`);
        continue;
      }
    }
    const orgPlatformIds = (row.org_id || '').split(';').map(s => s.trim()).filter(Boolean)
      .map(o => orgMap[o]?.platform_id).filter(Boolean);
    if (!orgPlatformIds.length) {
      console.warn(`    ⚠ skip   ${row.contact_id} ${row.full_name}: org ${row.org_id} not in seeded set`);
      continue;
    }
    const created = await api('POST', '/api/members', contactBody(row, orgPlatformIds));
    const platformId = created?.id || `dry-${row.contact_id}`;
    out[row.contact_id] = { csv_id: row.contact_id, name: row.full_name, email: row.email, platform_id: platformId, reused: false, user_id: user?.id || null };
    console.log(`    ✓ create ${row.contact_id} ${row.full_name} (${platformId})`);
  }
  return out;
}

export async function relinkUsersToContacts(contactMap) {
  console.log(`\n  Re-linking users to new contact platform_ids...`);
  let linked = 0, skipped = 0;
  for (const [, c] of Object.entries(contactMap)) {
    if (!c.user_id || c.reused) { skipped++; continue; }
    const user = await api('GET', `/api/platform/security/users/${encodeURIComponent(c.email)}`, null, { expectStatus: [200, 404] });
    if (!user) { skipped++; continue; }
    user.memberId = c.platform_id;
    await api('PUT', '/api/platform/security/users', user, { expectStatus: [200, 204] });
    console.log(`    ✓ link   user ${user.id} → contact ${c.platform_id} (${c.email})`);
    linked++;
  }
  console.log(`  Linked: ${linked}, skipped: ${skipped}`);
}

// --- Security accounts (status-aware) ---
// Ensure a storefront login exists for the contact; returns the security-account user id.
// `status` drives Approved | Locked | EmailUnconfirmed via statusFlags (folds in the imp targets).
export async function ensureSecurityAccount(email, password, contactId, status = 'Approved') {
  const existing = await findUserByEmail(email);
  if (existing?.id) {
    if (!DRY_RUN) {
      const full = await getUserById(existing.id) || existing;
      let dirty = false;
      if (contactId && full.memberId !== contactId) { full.memberId = contactId; dirty = true; }
      // Reconcile the special states so a reused account still reflects the CSV oracle.
      if (isLockedStatus(status)) {
        const end = full.lockoutEnd ? new Date(full.lockoutEnd).getTime() : 0;
        if (!(end > Date.now())) { full.lockoutEnabled = true; full.lockoutEnd = '9999-12-31T23:59:59Z'; dirty = true; }
      } else if (isUnconfirmedStatus(status)) {
        if (full.emailConfirmed !== false) { full.emailConfirmed = false; dirty = true; }
      }
      if (dirty) await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
    }
    if (VERBOSE) console.log(`    ↻ reuse  user ${existing.id} (${email})`);
    return existing.id;
  }
  const body = {
    userName: email, email, password, memberId: contactId, storeId: STORE_ID,
    userType: 'Customer', isAdministrator: false, ...statusFlags(status),
  };
  const result = await api('POST', '/api/platform/security/users/create', body);
  if (result && result.succeeded === false) throw new Error(`security/users/create failed for ${email}: ${JSON.stringify(result.errors)}`);
  if (DRY_RUN) { console.log(`    ✓ create user  (dry) (${email})`); return `dry-user-${email}`; }
  const fresh = await findUserByEmail(email);
  if (!fresh?.id) throw new Error(`created user ${email} but could not resolve its id via GET`);
  console.log(`    ✓ create user  ${fresh.id} (${email})${status && status !== 'Approved' ? ` [${status}]` : ''}`);
  return fresh.id;
}

// VCST-5028: strip any org-scoped (B2B) role from the account's global roles[] — org roles live
// ONLY on OrganizationMembership. Store-type roles are legitimately global and left intact.
export async function stripSeededGlobalRoles(email) {
  if (DRY_RUN) { if (VERBOSE) console.log(`    [DRY RUN] strip global org role(s) on ${email}`); return; }
  const found = await findUserByEmail(email);
  if (!found?.id) return;
  const user = await getUserById(found.id) || found;
  const b2bRoleIds = new Set(loadRoleDefs().filter(r => (r.role_type || '').toUpperCase() === 'B2B').map(r => r.role_id));
  const orgRoleIds = new Set([...Object.keys(STATIC_ROLE_NAMES), ...b2bRoleIds]);
  const before = user.roles || [];
  const kept = before.filter(r => !orgRoleIds.has(r.id) && !orgRoleIds.has(r.name));
  if (kept.length === before.length) { if (VERBOSE) console.log(`    ↻ no global org role on ${email}`); return; }
  user.roles = kept;
  await api('PUT', '/api/platform/security/users', user, { expectStatus: [200, 204] });
  console.log(`    ✓ stripped ${before.length - kept.length} global org role(s) from ${email}`);
}

// --- Org-scoped memberships (VCST-5028) ---
export async function searchMemberships(userId) {
  if (DRY_RUN && userId?.startsWith?.('dry-')) return [];
  const r = await api('POST', '/api/customer/organization-memberships/search', { userId, take: 100 });
  return r?.results || [];
}
export async function ensureOrgMembership(userId, orgId, orgName, roleId, existing, locked = false) {
  const roleName = await resolveRoleName(roleId);
  const found = (existing || []).find(m => m.organizationId === orgId);
  if (found) {
    const currentRoleIds = (found.roles || []).map(r => r.roleId || r.id);
    if (currentRoleIds.length === 1 && currentRoleIds[0] === roleId && found.isLocked === locked) {
      if (VERBOSE) console.log(`    ↻ reuse  membership ${found.id} (${orgName} → ${roleName}${locked ? ', LOCKED' : ''})`);
      return found.id;
    }
    if (!DRY_RUN) {
      found.roles = [{ roleId, roleName }];
      found.isLocked = locked;
      await api('PUT', `/api/customer/organization-memberships/${encodeURIComponent(found.id)}`, found, { expectStatus: [200, 204] });
    }
    console.log(`    ✓ reconcile membership ${found.id} (${orgName} → ${roleName}${locked ? ', LOCKED' : ''}) [was: ${currentRoleIds.join(',') || 'none'}]`);
    return found.id;
  }
  const created = await api('POST', '/api/customer/organization-memberships', { userId, organizationId: orgId, organizationName: orgName, roles: [{ roleId, roleName }], isLocked: locked });
  const id = created?.id || `dry-mom-${orgId}`;
  console.log(`    ✓ create membership ${id} (${orgName} → ${roleName}${locked ? ', LOCKED in org' : ''})`);
  return id;
}

// Ensure a contact exists and is a member of every listed org; returns its platform id.
export async function ensureMembershipContact(email, firstName, lastName, orgPlatformIds) {
  const user = await findUserByEmail(email);
  let contact = user?.memberId ? await findContactById(user.memberId) : null;
  if (!contact) contact = await findContactByEmail(email);
  if (contact) {
    const current = new Set(contact.organizations || []);
    const missing = orgPlatformIds.filter(id => !current.has(id));
    if (missing.length && !DRY_RUN) {
      contact.organizations = [...current, ...missing];
      await api('PUT', '/api/members', contact, { expectStatus: [200, 204] });
      if (VERBOSE) console.log(`    ↻ link contact ${contact.id} → +${missing.length} org(s)`);
    }
    return contact.id;
  }
  const created = await api('POST', '/api/members', {
    memberType: 'Contact', firstName, lastName, fullName: `${firstName} ${lastName}`, name: `${firstName} ${lastName}`,
    emails: [email], organizations: orgPlatformIds, status: 'Approved', timeZone: 'America/New_York', defaultLanguage: 'en-US', currencyCode: 'USD',
  });
  const id = created?.id || `dry-contact-${email}`;
  console.log(`    ✓ create contact ${id} (${email})`);
  return id;
}

// Give each seeded contact a login + org-scoped membership (role + status from users.csv).
export async function provisionContactLogins(contactMap, orgMap) {
  const userRows = readCsv(USERS_CSV);
  const userByContact = {};
  for (const u of userRows) if (u.contact_id) userByContact[u.contact_id] = u;
  console.log(`\n  Provisioning contact logins + org memberships...`);
  let nAcct = 0, nMem = 0;
  for (const [csvId, c] of Object.entries(contactMap)) {
    const u = userByContact[csvId];
    if (!u || (u.seeded || '').toLowerCase() === 'false') continue;
    const email = (u.email || c.email || '').trim();
    if (!email.includes('@') || String(c.platform_id).startsWith('dry-')) continue;

    const userId = await ensureSecurityAccount(email, resolvePassword(u.password), c.platform_id, u.status || 'Approved');
    await stripSeededGlobalRoles(email);
    nAcct++;

    const roleId = roleIdByName(u.roles);
    if (roleId) {
      const locked = /^true$/i.test(u.membership_locked || '');
      const orgIds = (u.org_id || '').split(';').map(s => s.trim()).filter(Boolean);
      const resolved = orgIds.map(oid => orgMap[oid]).filter(o => o?.platform_id);
      if (resolved.length) {
        const existing = await searchMemberships(userId);
        for (const org of resolved) { await ensureOrgMembership(userId, org.platform_id, org.name, roleId, existing, locked); nMem++; }
      }
    }
  }
  console.log(`  ✓ Provisioned ${nAcct} login(s) + ${nMem} org-scoped membership(s)`);
  return { accounts: nAcct, memberships: nMem };
}

// Cross-org memberships from organization-memberships.csv (orgs must already exist).
export async function seedMemberships() {
  const rows = readCsv(MEMBERSHIPS_CSV).filter(r => r.user_email && r.org_name);
  if (!rows.length) { console.log('\n  Memberships: organization-memberships.csv empty — skipping.'); return []; }
  console.log(`\n  Seeding ${rows.length} org membership row(s)...`);
  const byEmail = {};
  for (const r of rows) (byEmail[r.user_email] ||= []).push(r);
  const out = [];
  for (const [email, memberRows] of Object.entries(byEmail)) {
    const orgs = [];
    for (const r of memberRows) {
      const org = await findOrgByName(r.org_name);
      if (!org) { console.warn(`    ⚠ skip   ${r.membership_id}: org "${r.org_name}" not found (seed orgs first)`); continue; }
      orgs.push({ row: r, orgId: org.id });
    }
    if (!orgs.length) continue;
    const first = memberRows[0];
    const contactId = await ensureMembershipContact(email, first.first_name, first.last_name, orgs.map(o => o.orgId));
    const userId = await ensureSecurityAccount(email, resolvePassword(first.password), contactId);
    await stripSeededGlobalRoles(email);
    const existing = await searchMemberships(userId);
    for (const { row, orgId } of orgs) {
      const membershipId = await ensureOrgMembership(userId, orgId, row.org_name, row.role_id, existing);
      out.push({ membership_id: row.membership_id, email, contact_id: contactId, user_id: userId, org_name: row.org_name, org_id: orgId, role_id: row.role_id, platform_membership_id: membershipId });
    }
  }
  return out;
}

// --- Personal (no-org) users: env customer roles + agent-pool.csv + test-users.csv ---
// The accounts suites reference via {{USER_EMAIL}} / @td(ROLE.email). Seeding from the env
// registry guarantees seeded == referenced, with the per-env password, on every env.
export function roleUsers() {
  const nameFromEmail = (email) => {
    const local = (email.split('@')[0] || 'QA').replace(/[._-]+/g, ' ').trim().split(/\s+/);
    return { first: local[0] || 'QA', last: local[1] || 'User' };
  };
  return resolveAllRoles()
    .filter(r => r.kind === 'customer' && r.present)
    .map(r => { const n = nameFromEmail(r.email); return { email: r.email, password: r.password, first: n.first, last: n.last, source: `env-role:${r.key}`, group: r.group || null }; });
}
export function personalUsers() {
  const out = []; const seen = new Set();
  const add = (email, password, first, last, source, status = 'Active', group = null) => {
    const e = (email || '').trim(); if (!e.includes('@')) return;
    const k = e.toLowerCase(); if (seen.has(k)) return; seen.add(k);
    out.push({ email: e, password: password || 'Password1!', first: first || 'QA', last: last || 'User', source, status: status || 'Active', group });
  };
  for (const u of roleUsers()) add(u.email, u.password, u.first, u.last, u.source, 'Active', u.group);
  for (const r of readCsv('test-data/users/agent-user-pool.csv')) {
    if ((r.seeded || '').toLowerCase() === 'false') continue;
    if (r.personal_email && r.personal_email !== 'n/a') add(r.personal_email, resolvePassword(r.personal_password), r.personal_first_name, r.personal_last_name, 'agent-pool');
  }
  for (const r of readCsv('test-data/users/test-users.csv')) {
    if ((r.seeded || '').toLowerCase() === 'false') continue;
    add(r.email, resolvePassword(r.password), r.first_name, r.last_name, 'test-users', r.status);
  }
  return out;
}

export async function ensurePersonalAccount(u) {
  const existing = await findUserByEmail(u.email);
  if (existing?.id) { if (VERBOSE) console.log(`    ↻ reuse ${u.email}`); return 'reused'; }
  const contactBodyObj = {
    memberType: 'Contact', firstName: u.first, lastName: u.last, fullName: `${u.first} ${u.last}`, name: `${u.first} ${u.last}`,
    emails: [u.email], status: 'Approved', timeZone: 'America/New_York', defaultLanguage: 'en-US', currencyCode: 'USD',
  };
  if (u.group) contactBodyObj.groups = [u.group];
  const contact = await api('POST', '/api/members', contactBodyObj);
  const contactId = contact?.id || `dry-${u.email}`;
  const res = await api('POST', '/api/platform/security/users/create', {
    userName: u.email, email: u.email, password: u.password, memberId: contactId, storeId: STORE_ID,
    userType: 'Customer', isAdministrator: false, ...statusFlags(u.status),
  });
  if (res && res.succeeded === false) throw new Error(`create ${u.email}: ${JSON.stringify(res.errors)}`);
  const present = await verifyCreated(api, 'user', res?.id || contactId, { name: u.email });
  if (!present && !DRY_RUN) throw new Error(`create ${u.email}: account not found after create (verify failed)`);
  console.log(`    ✓ create ${u.email}${u.source?.startsWith('env-role') ? ` [${u.source}]` : ''}${u.group ? ` (group ${u.group})` : ''}`);
  return 'created';
}

// --- Teardown primitives ---
// Delete one account (+ its memberships + contact) by email. Returns {account, contact}.
export async function deleteUserByEmail(email) {
  const user = await findUserByEmail(email);
  let contactId = user?.memberId || null;
  let account = false, contact = false;
  if (user?.id) {
    const ids = (await searchMemberships(user.id)).map(m => m.id).filter(Boolean);
    if (ids.length) {
      const qs = ids.map(id => `ids=${encodeURIComponent(id)}`).join('&');
      await api('DELETE', `/api/customer/organization-memberships?${qs}`, null, { expectStatus: [200, 204, 404] });
      if (VERBOSE) console.log(`    ✗ deleted ${ids.length} membership(s) for ${email}`);
    }
    // security delete query param is `names` (NOT userNames — that binds an empty array).
    await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
    account = true;
  }
  if (!contactId) contactId = (await findContactByEmail(email))?.id || null;
  if (contactId) {
    await api('DELETE', `/api/members?ids=${encodeURIComponent(contactId)}`, null, { expectStatus: [200, 204, 404] });
    contact = true;
  }
  if (account || contact) console.log(`    ✗ ${email}`);
  return { account, contact };
}

// Sweep every remaining AGENT-TEST-* member (orgs + contacts) by keyword.
export async function sweepAgentTestMembers() {
  console.log('\n  Teardown: scanning for AGENT-TEST-* members...');
  const res = await api('POST', '/api/members/search', { keyword: 'AGENT-TEST-', take: 500 });
  const items = res?.results || [];
  console.log(`  Found ${items.length} AGENT-TEST-* member(s)`);
  let deleted = 0;
  for (const m of items) {
    try {
      await api('DELETE', `/api/members?ids=${encodeURIComponent(m.id)}`, null, { expectStatus: [200, 204, 404] });
      if (VERBOSE) console.log(`    ✗ deleted ${m.memberType} ${m.name} (${m.id})`);
      deleted++;
    } catch (e) { console.warn(`    ⚠ delete failed for ${m.name}: ${e.message.slice(0, 100)}`); }
  }
  console.log(`  Teardown: ${deleted}/${items.length} member(s) deleted`);
  return deleted;
}

// Emails that every teardown must sweep: b2b/users.csv + organization-memberships.csv + personal.
export function allSeededEmails() {
  const emails = new Set();
  for (const u of readCsv(USERS_CSV)) if ((u.email || '').trim()) emails.add(u.email.trim());
  for (const m of readCsv(MEMBERSHIPS_CSV)) if ((m.user_email || '').trim()) emails.add(m.user_email.trim());
  for (const p of personalUsers()) emails.add(p.email);
  return [...emails];
}
