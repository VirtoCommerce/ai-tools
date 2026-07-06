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

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { ensureMemberIndex, verifyCreated, verifyRemoved, syncEnvAliases } from './seed-common.mjs';
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
// Direct GET by platform id — INDEX-INDEPENDENT (unlike the member search, which lags right after a
// teardown/reseed and would otherwise miss an existing org → create a duplicate with a fresh GUID).
export async function findMemberById(id) {
  if (!id) return null;
  try { return await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 404] }); } catch { return null; }
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
const WL_ORGS_CSV = 'test-data/white-labeling/organizations.csv';
const WL_USERS_CSV = 'test-data/white-labeling/users.csv';
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
// Inverse of roleIdByName — the roles.csv oracle name for an id (STATIC fallback covers the two
// built-in org roles even if roles.csv is unreadable). Offline; used to seed the platform lookup.
export function roleNameById(roleId) {
  if (!roleId) return null;
  return loadRoleDefs().find(r => r.role_id === roleId)?.role_name || STATIC_ROLE_NAMES[roleId] || null;
}
const _roleNameCache = {};
export async function resolveRoleName(roleId) {
  if (!roleId) return roleId;
  if (_roleNameCache[roleId]) return _roleNameCache[roleId];
  // The candidate name comes from the roles.csv oracle (what ensureRoles PUSHES to the platform),
  // so it normally equals the platform's origin name. Confirm against the LIVE platform via the
  // reliable SEARCH endpoint (keyword MUST be the name — the roles search matches on name, and
  // GET /roles/{id} is cache-flaky, same class as findRole/findUserByEmail). If the platform name
  // has drifted from roles.csv, the live value wins; otherwise the CSV name is authoritative.
  const csvName = roleNameById(roleId);
  try {
    const found = await findRole({ role_id: roleId, role_name: csvName || undefined });
    if (found?.name) return (_roleNameCache[roleId] = found.name);
  } catch { /* fall through to the offline oracle */ }
  return (_roleNameCache[roleId] = csvName || roleId);
}
// Reliable role existence check via SEARCH — GET /api/platform/security/roles/{id} is cache-flaky
// (404s even when the role exists, same class as the findUserByEmail GET-by-username bug), so it
// must not gate role writes.
// The roles search matches on NAME, so look up by name and confirm the id — reliable, unlike the
// cache-flaky GET /api/platform/security/roles/{id}.
export async function findRole({ role_id, role_name }) {
  if (!role_id && !role_name) return null;
  const r = await api('POST', '/api/platform/security/roles/search', { keyword: role_name || role_id, take: 50 }, { expectStatus: [200] });
  return (r?.results || []).find(role => role.id === role_id || role.name === role_name) || null;
}
export async function ensureRoles() {
  const defs = loadRoleDefs();
  if (!defs.length) return;
  console.log(`\n  Ensuring ${defs.length} platform role(s) from roles.csv...`);
  for (const d of defs) {
    // Always upsert against the FIXED role_id — PUT is idempotent on that id, so it can never create
    // a duplicate, and it keeps permissions in sync with roles.csv (the oracle) on every run. The
    // search-based existence check is only for accurate create-vs-update logging.
    const exists = await findRole(d);
    const permissions = (d.permissions || '').split(';').map(p => p.trim()).filter(Boolean).map(name => ({ name }));
    await api('PUT', '/api/platform/security/roles', { id: d.role_id, name: d.role_name, permissions }, { expectStatus: [200, 201, 204] });
    console.log(`    ${exists ? '↻ update' : '✓ create'} role ${d.role_id} (${d.role_name}) — ${permissions.length} perm(s)`);
  }
}

// --- Org + contact seeding ---
export async function seedOrgs(rows, parentMap = {}) {
  console.log(`\n  Seeding ${rows.length} organization(s)...`);
  const out = {};
  for (const row of rows) {
    // Reuse key #1: the platform_id cached in organizations.csv — a direct GET, so a stale member
    // search index (common right after teardown/reseed) can't cause a duplicate org with a new GUID.
    let existing = null;
    if (row.platform_id) {
      const byId = await findMemberById(row.platform_id);
      // The pinned platform_id is the org's STABLE identity — reuse it regardless of the live name.
      // (Previously this required byId.name === row.org_name, so a RENAMED org, e.g. TEST-* →
      // AGENT-TEST-Org-*, wasn't reused; on an already-seeded env it fell through to a create with a
      // duplicate pinned id — a conflict/rewrite every run. Reuse by id + rename in place instead.)
      if (byId?.id) existing = byId;
    }
    // Reuse key #2 (fallback): search-by-name — covers a first-ever seed with no cached id.
    if (!existing) existing = await findOrgByName(row.org_name);
    if (existing) {
      // Name is not the identity (the id is) — if the live name drifted from the CSV, rename in place
      // (upsert by id) so a rename propagates without a duplicate-id create.
      if (existing.name && existing.name !== row.org_name && !DRY_RUN) {
        try {
          await api('POST', '/api/members', { ...existing, name: row.org_name }, { expectStatus: [200, 201, 204] });
          console.log(`    ✎ renamed ${row.org_id} "${existing.name}" → "${row.org_name}" (${existing.id})`);
        } catch (e) { console.log(`    ⚠ rename ${row.org_id} failed: ${String(e.message).slice(0, 120)}`); }
      }
      out[row.org_id] = { csv_id: row.org_id, name: row.org_name, platform_id: existing.id, reused: true };
      if (VERBOSE) console.log(`    ↻ reuse  ${row.org_id} ${row.org_name} (${existing.id})`);
      continue;
    }
    const body = orgBody(row);
    // Pin the CSV platform_id on (re)create so a deleted org comes back with its STABLE id — this is
    // what keeps @td(...org_id) aliases from drifting when an org is torn down and reseeded.
    if (row.platform_id) body.id = row.platform_id;
    if (row.parent_org_id && parentMap[row.parent_org_id]) body.parentId = parentMap[row.parent_org_id];
    const created = await api('POST', '/api/members', body);
    const platformId = created?.id || row.platform_id || `dry-${row.org_id}`;
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
        // Reconcile currency on reuse — contacts.csv currency_code is the oracle, so a re-seed fixes
        // a pre-existing contact stuck on the wrong currency (e.g. an EUR buyer created as USD).
        const wantCcy = (row.currency_code || '').trim();
        if (wantCcy && contact.currencyCode !== wantCcy && !DRY_RUN) {
          contact.currencyCode = wantCcy;
          await api('POST', '/api/members', contact, { expectStatus: [200, 201, 204] });
          console.log(`    ↻ reuse  ${row.contact_id} ${row.full_name} — currencyCode → ${wantCcy}`);
        }
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

// Build { user_id: { platform_id } } for syncEnvAliases from the live security-account ids just
// resolved (keyed by email in `idByEmail`) joined to the CSV rows' user_id. Skips dry-/empty ids.
function byUserIdFromEmails(userRows, idByEmail) {
  const idByLcEmail = {};
  for (const [e, i] of Object.entries(idByEmail)) {
    if (e && i && !String(i).startsWith('dry-')) idByLcEmail[e.toLowerCase()] = i;
  }
  const byUserId = {};
  for (const u of userRows) {
    const id = idByLcEmail[(u.email || '').toLowerCase()];
    if (u.user_id && id) byUserId[u.user_id] = { platform_id: id };
  }
  return byUserId;
}

// Give each seeded contact a login + org-scoped membership (role + status from users.csv).
export async function provisionContactLogins(contactMap, orgMap) {
  const userRows = readCsv(USERS_CSV);
  const userByContact = {};
  for (const u of userRows) if (u.contact_id) userByContact[u.contact_id] = u;
  console.log(`\n  Provisioning contact logins + org memberships...`);
  let nAcct = 0, nMem = 0;
  const idByEmail = {};
  for (const [csvId, c] of Object.entries(contactMap)) {
    const u = userByContact[csvId];
    if (!u || (u.seeded || '').toLowerCase() === 'false') continue;
    const email = (u.email || c.email || '').trim();
    if (!email.includes('@') || String(c.platform_id).startsWith('dry-')) continue;

    const userId = await ensureSecurityAccount(email, resolvePassword(u.password), c.platform_id, u.status || 'Approved');
    idByEmail[email] = userId;
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
  if (!DRY_RUN) {
    // Persist the live security-account userIds to aliases.<env>.json for EVERY env (incl. vcst)
    // so @td(ACME_ADMIN.platform_id) / @td(IMPERSONATE_TARGET.userId) resolve. The committed
    // users.csv carries NO platform_id — each env's ids live only in its own overlay, so a suite
    // run against one env can never resolve another env's GUIDs. The resolver layers the overlay
    // over the base CSV field-by-field (code/name/email/role stay in the shared CSV).
    const byUserId = byUserIdFromEmails(userRows, idByEmail);
    syncEnvAliases('b2b/users', byUserId);
    console.log(`  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${Object.keys(byUserId).length} b2b user platform_id(s)`);
  }
  return { accounts: nAcct, memberships: nMem };
}

// Contact + login + org-scoped membership in ONE pass, for CSVs where a single row IS the contact
// (no separate contacts.csv join like b2b's) — e.g. white-labeling/users.csv. `org_id`/`roles` are
// `;`-joined and INDEX-PARALLEL, so one row can be a multi-org member with a DIFFERENT role per org
// (VCST-5028) — unlike provisionContactLogins's single `roles` value applied to every org uniformly.
export async function seedInlineOrgUsers(rows, orgMap) {
  console.log(`\n  Seeding ${rows.length} inline contact+login+membership row(s)...`);
  const idByEmail = {};
  let nAcct = 0, nMem = 0;
  for (const row of rows) {
    if ((row.seeded || '').toLowerCase() === 'false') continue;
    const email = (row.email || '').trim();
    if (!email.includes('@')) continue;

    const orgIds = (row.org_id || '').split(';').map(s => s.trim()).filter(Boolean);
    const roleNames = (row.roles || '').split(';').map(s => s.trim()).filter(Boolean);
    const resolvedOrgs = orgIds.map(id => orgMap[id]).filter((o) => o?.platform_id);
    if (orgIds.length && !resolvedOrgs.length) {
      console.warn(`    ⚠ skip   ${row.user_id || email}: org(s) "${row.org_id}" not in seeded set`);
      continue;
    }

    // Resolve via the account's memberId FIRST (a direct GET) — same as seedContacts() above.
    // The member-search index lags right after a write (VCST-5406's documented flakiness class),
    // so searching by email here would miss a just-created contact and mint a duplicate.
    const existingUser = await findUserByEmail(email);
    let contact = existingUser?.memberId ? await findContactById(existingUser.memberId) : null;
    if (!contact) contact = await findContactByEmail(email);
    if (!contact) {
      const created = await api('POST', '/api/members', contactBody(row, resolvedOrgs.map((o) => o.platform_id)));
      contact = created;
      console.log(`    ✓ create contact ${created?.id || ''} (${email})`);
    } else if (VERBOSE) console.log(`    ↻ reuse  contact ${contact.id} (${email})`);
    if (!contact?.id) continue;

    const userId = await ensureSecurityAccount(email, resolvePassword(row.password), contact.id, row.status || 'Approved');
    idByEmail[email] = userId;
    await stripSeededGlobalRoles(email);
    nAcct++;
    if (String(contact.id).startsWith('dry-') || String(userId).startsWith('dry-')) continue;

    const locked = /^true$/i.test(row.membership_locked || '');
    const existingMemberships = await searchMemberships(userId);
    for (let i = 0; i < resolvedOrgs.length; i++) {
      const org = resolvedOrgs[i];
      const roleName = roleNames[i] || roleNames[0];
      const roleId = roleIdByName(roleName);
      if (!roleId) { console.warn(`    ⚠ role "${roleName}" not found in roles.csv — skipping membership for ${email} @ ${org.name}`); continue; }
      await ensureOrgMembership(userId, org.platform_id, org.name, roleId, existingMemberships, locked);
      nMem++;
    }
  }
  console.log(`  ✓ Provisioned ${nAcct} login(s) + ${nMem} org-scoped membership(s)`);
  return { accounts: nAcct, memberships: nMem, idByEmail };
}

// Write live-resolved ids as INLINE per-env aliases — test-data/aliases.${TEST_ENV}.json — instead
// of into a CSV column. Unlike b2b (whose organizations.csv/users.csv pin a platform_id that's only
// valid on the ONE env it was captured from, despite being a single file shared across all envs),
// white-labeling's CSVs carry NO live ids at all, so they stay correct for any environment; each
// env's actual ids live in its own override file, layered over the base test-data/aliases.json by
// TestDataResolver (same per-env-overlay mechanism as aliases.localhost.json, just not gitignored —
// vcst-qa is a stable shared env, not a fresh-DB-per-run one). Entries are `{alias}_PLATFORM_ID`.
export function writeLiveIdAliases(entries) {
  const clean = Object.fromEntries(Object.entries(entries).filter(([, id]) => id && !String(id).startsWith('dry-')));
  if (DRY_RUN || !Object.keys(clean).length) return 0;
  const env = process.env.TEST_ENV || 'vcst';
  const path = join(ROOT, `test-data/aliases.${env}.json`);
  let cur = {};
  try { if (existsSync(path)) cur = JSON.parse(readFileSync(path, 'utf-8')); } catch { cur = {}; }
  const additions = {};
  for (const [key, id] of Object.entries(clean)) additions[key] = { _inline: true, id, fields: { id: 'id' } };
  const merged = {
    ...cur, ...additions,
    _meta: {
      ...(cur._meta || {}), env,
      note: 'Auto-generated by seed-white-labeling.mjs / seed-company-users.mjs (wl kind) via writeLiveIdAliases() — live platform ids for this env only. The white-labeling CSVs intentionally carry no ids (multi-env safe).',
    },
  };
  writeFileSync(path, JSON.stringify(merged, null, 2));
  return Object.keys(clean).length;
}

// Builds {`${alias_name}_PLATFORM_ID`: platformId} from white-labeling org/user rows' `alias_name`
// column (the CSV-declared key into test-data/aliases.json) + the ids seedOrgs/seedInlineOrgUsers
// just resolved. Shared by seedWhiteLabelingUsers() and seed-white-labeling.mjs's own user step so
// both entry points produce identical alias output.
export function buildWhiteLabelingAliasEntries(orgRows, userRows, orgMap, idByEmail) {
  const entries = {};
  for (const r of orgRows) {
    const platformId = orgMap[r.org_id]?.platform_id;
    if (r.alias_name && platformId) entries[`${r.alias_name}_PLATFORM_ID`] = platformId;
  }
  for (const r of userRows) {
    const platformId = idByEmail[r.email];
    if (r.alias_name && platformId) entries[`${r.alias_name}_PLATFORM_ID`] = platformId;
  }
  return entries;
}

// Full white-labeling org+user provisioning — the SINGLE function called by both
// seed-company-users.mjs's `wl` kind and seed-white-labeling.mjs's user step (VCST-5406 follow-up:
// white-labeling used to duplicate its own org/contact/user CRUD instead of sharing this library).
export async function seedWhiteLabelingUsers() {
  const orgRows = readCsv(WL_ORGS_CSV).filter((r) => r.org_name);
  const userRows = readCsv(WL_USERS_CSV).filter((r) => r.email);
  console.log(`\n  Plan: ${orgRows.length} white-labeling org(s), ${userRows.length} user(s)`);
  const orgMap = await seedOrgs(orgRows);
  await ensureRoles();
  const { idByEmail, ...counts } = await seedInlineOrgUsers(userRows, orgMap);
  const written = writeLiveIdAliases(buildWhiteLabelingAliasEntries(orgRows, userRows, orgMap, idByEmail));
  if (written) console.log(`  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${written} live platform id alias(es)`);
  return { whiteLabelingOrgs: Object.values(orgMap), ...counts };
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
    .map(r => { const n = nameFromEmail(r.email); return { email: r.email, password: r.password, first: n.first, last: n.last, source: `env-role:${r.key}`, group: r.group || null, currency: r.currency || null }; });
}
// Admin-kind env-roles the seeder must CREATE (provision=true) — e.g. IMPERSONATION_ADMIN. The
// bootstrap ADMIN has no `provision` flag, so it's never (re)created here.
export function adminUsers() {
  return resolveAllRoles()
    .filter(r => r.kind === 'admin' && r.provision && r.present)
    .map(r => ({ email: r.email, password: r.password, source: `env-role:${r.key}` }));
}
export async function ensureAdminAccount(u) {
  const existing = await findUserByEmail(u.email);
  if (existing?.id) { if (VERBOSE) console.log(`    ↻ reuse admin ${u.email}`); return 'reused'; }
  if (DRY_RUN) { console.log(`    ✓ create admin (dry) ${u.email}`); return 'created'; }
  const res = await api('POST', '/api/platform/security/users/create', {
    userName: u.email, email: u.email, password: u.password, storeId: STORE_ID, userType: 'Manager', isAdministrator: true,
  });
  if (res && res.succeeded === false) throw new Error(`create admin ${u.email}: ${JSON.stringify(res.errors)}`);
  const present = await verifyCreated(api, 'user', res?.id || u.email, { name: u.email });
  if (!present && !DRY_RUN) throw new Error(`create admin ${u.email}: account not found after create`);
  console.log(`    ✓ create admin ${u.email} [${u.source}]`);
  return 'created';
}
export function personalUsers() {
  const out = []; const seen = new Set();
  const add = (email, password, first, last, source, status = 'Active', group = null, currency = null) => {
    const e = (email || '').trim(); if (!e.includes('@')) return;
    const k = e.toLowerCase(); if (seen.has(k)) return; seen.add(k);
    out.push({ email: e, password: password || 'Password1!', first: first || 'QA', last: last || 'User', source, status: status || 'Active', group, currency });
  };
  for (const u of roleUsers()) add(u.email, u.password, u.first, u.last, u.source, 'Active', u.group, u.currency);
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
  if (existing?.id) {
    // Reconcile the contact's currency on reuse — a create-only path would leave a pre-existing
    // account stuck on the wrong currency (e.g. EUR_USER seeded as USD). The CSV/registry is the oracle.
    if (u.currency && existing.memberId && !DRY_RUN) {
      const contact = await findContactById(existing.memberId);
      if (contact && contact.currencyCode !== u.currency) {
        contact.currencyCode = u.currency;
        await api('POST', '/api/members', contact, { expectStatus: [200, 201, 204] });
        console.log(`    ↻ reuse ${u.email} — currencyCode → ${u.currency}`);
        return 'reused';
      }
    }
    if (VERBOSE) console.log(`    ↻ reuse ${u.email}`);
    return 'reused';
  }
  const contactBodyObj = {
    memberType: 'Contact', firstName: u.first, lastName: u.last, fullName: `${u.first} ${u.last}`, name: `${u.first} ${u.last}`,
    emails: [u.email], status: 'Approved', timeZone: 'America/New_York', defaultLanguage: 'en-US', currencyCode: u.currency || 'USD',
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
  console.log(`    ✓ create ${u.email}${u.source?.startsWith('env-role') ? ` [${u.source}]` : ''}${u.group ? ` (group ${u.group})` : ''}${u.currency ? ` (${u.currency})` : ''}`);
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Paginate /api/members/search over `searchBody`, returning only members whose OWN name carries
// the AGENT-TEST prefix. Safety: the keyword search can match on fields other than the name, so we
// re-verify the prefix here — never delete a real member the search happened to surface.
async function collectAgentTestMembers(searchBody) {
  const out = [];
  const page = 100;
  for (let skip = 0; ; ) {
    const res = await api('POST', '/api/members/search', { ...searchBody, skip, take: page });
    const batch = res?.results || [];
    out.push(...batch.filter((m) => (m.name || '').startsWith('AGENT-TEST')));
    skip += batch.length;
    if (batch.length < page || skip >= (res?.totalCount ?? skip)) break;
  }
  return out;
}

// Sweep every remaining AGENT-TEST-* member (orgs + contacts). The generic keyword search alone
// under-returned organizations (a full teardown left pinned b2b orgs behind), so we ALSO enumerate
// memberType:'Organization' UNCONDITIONALLY (all orgs, filtered by name prefix — no reliance on the
// flaky keyword match). b2b orgs are no longer permanent fixtures: their platform_id is pinned in
// test-data/b2b/organizations.csv and forced on create, so a reseed restores the identical GUID —
// sweeping them keeps a full teardown truly residue-free.
export async function sweepAgentTestMembers() {
  console.log('\n  Teardown: scanning for AGENT-TEST-* members...');
  const byId = new Map();
  for (const m of await collectAgentTestMembers({ keyword: 'AGENT-TEST-' })) byId.set(m.id, m);
  for (const m of await collectAgentTestMembers({ memberType: 'Organization' })) byId.set(m.id, m);
  const items = [...byId.values()];
  console.log(`  Found ${items.length} AGENT-TEST-* member(s)`);
  let deleted = 0;
  for (const m of items) {
    try {
      await api('DELETE', `/api/members?ids=${encodeURIComponent(m.id)}`, null, { expectStatus: [200, 204, 404] });
      if (VERBOSE) console.log(`    ✗ deleted ${m.memberType} ${m.name} (${m.id})`);
      deleted++;
    } catch (e) { console.warn(`    ⚠ delete failed for ${m.name}: ${e.message.slice(0, 100)}`); }
  }
  // Org residue can survive the first pass: members/search is index-backed and lags right after a
  // large contact teardown, so the enumeration misses some orgs (a full teardown left 2 child orgs
  // behind — the index hadn't caught up). Settle-and-retry: sleep for the index, re-enumerate, delete
  // whatever surfaced, and loop until a settled search comes back empty (or attempts are exhausted).
  // We trust a fresh post-sleep search, never the attempted count (a DELETE that 200s but leaves the
  // entity must never read as success).
  let residual = [];
  for (let attempt = 1; attempt <= 5; attempt++) {
    await sleep(1500);
    residual = await collectAgentTestMembers({ memberType: 'Organization' });
    if (!residual.length) break;
    for (const o of residual) {
      try {
        await api('DELETE', `/api/members?ids=${encodeURIComponent(o.id)}`, null, { expectStatus: [200, 204, 404] });
        if (VERBOSE) console.log(`    ✗ deleted (settle pass ${attempt}) ${o.memberType} ${o.name} (${o.id})`);
        deleted++;
      } catch (e) { console.warn(`    ⚠ retry delete failed for ${o.name}: ${e.message.slice(0, 100)}`); }
    }
  }
  if (residual.length) console.warn(`  ⚠ ${residual.length} AGENT-TEST org(s) still present after retries: ${residual.map((o) => o.name).join(', ')}`);
  console.log(`  Teardown: ${deleted} member(s) deleted${residual.length ? ` — ${residual.length} org(s) RESIDUAL` : ''}`);
  return deleted;
}

// Emails that every teardown must sweep: b2b/users.csv + organization-memberships.csv +
// white-labeling/users.csv + personal.
export function allSeededEmails() {
  const emails = new Set();
  for (const u of readCsv(USERS_CSV)) if ((u.email || '').trim()) emails.add(u.email.trim());
  for (const m of readCsv(MEMBERSHIPS_CSV)) if ((m.user_email || '').trim()) emails.add(m.user_email.trim());
  for (const w of readCsv(WL_USERS_CSV)) if ((w.email || '').trim()) emails.add(w.email.trim());
  for (const p of personalUsers()) emails.add(p.email);
  return [...emails];
}

// Scoped subset of allSeededEmails() for the `wl` kind's teardown — so `seed-company-users.mjs wl
// --teardown` sweeps ONLY white-labeling accounts, not the full b2b/personal/imp/loyalty set.
export function whiteLabelingSeededEmails() {
  return readCsv(WL_USERS_CSV).map((w) => (w.email || '').trim()).filter(Boolean);
}

// Delete the white-labeling orgs by name (live lookup — org platform ids live only in
// aliases.${TEST_ENV}.json now, never in the CSV, so this doesn't trust a possibly-stale cache).
// This is the SCOPED `wl` teardown's org step. The unified sweep (sweepAgentTestMembers) now removes
// b2b orgs too — a reseed restores their pinned platform_id identically — so neither kind of org is
// treated as a permanent fixture any more; a full teardown leaves zero AGENT-TEST orgs behind.
export async function deleteWhiteLabelingOrgs() {
  const orgRows = readCsv(WL_ORGS_CSV).filter((r) => r.org_name);
  let deleted = 0;
  for (const row of orgRows) {
    // Safety: only delete AGENT-TEST- WL orgs, never a real org that shares a name.
    if (!String(row.org_name).startsWith('AGENT-TEST')) { if (VERBOSE) console.log(`    skip "${row.org_name}": not an AGENT-TEST org`); continue; }
    const found = await findOrgByName(row.org_name);
    if (!found?.id || !String(found.name || '').startsWith('AGENT-TEST')) { if (VERBOSE) console.log(`    ↻ org "${row.org_name}" already gone or not AGENT-TEST`); continue; }
    await api('DELETE', `/api/members?ids=${encodeURIComponent(found.id)}`, null, { expectStatus: [200, 204, 404] });
    console.log(`    ✗ org ${row.org_name} (${found.id})`);
    deleted++;
  }
  return deleted;
}

// Removes every `WL_*_PLATFORM_ID` entry writeLiveIdAliases() wrote — called on `wl` teardown so
// aliases.${TEST_ENV}.json doesn't keep pointing @td() references at now-deleted orgs/accounts.
export function clearWhiteLabelingAliases() {
  if (DRY_RUN) return 0;
  const env = process.env.TEST_ENV || 'vcst';
  const path = join(ROOT, `test-data/aliases.${env}.json`);
  let cur = {};
  try { if (existsSync(path)) cur = JSON.parse(readFileSync(path, 'utf-8')); } catch { return 0; }
  const keys = Object.keys(cur).filter((k) => k.startsWith('WL_') && k.endsWith('_PLATFORM_ID'));
  if (!keys.length) return 0;
  for (const k of keys) delete cur[k];
  writeFileSync(path, JSON.stringify(cur, null, 2));
  return keys.length;
}
