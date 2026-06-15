#!/usr/bin/env node
/**
 * Seeds B2B test fixtures (organizations, contacts, addresses) for vcst-qa after
 * the 2026-05-15 catalog wipe. Reads CSVs in test-data/b2b/ as the source of truth
 * for names + relationships; platform IDs are platform-assigned (we don't supply them).
 *
 * Strategy:
 *  1. Find or create each org from organizations.csv (by name). Result: name → new platform_id.
 *  2. Find or create each contact from contacts.csv (by email). Link to its org via
 *     `organizations: [orgPlatformId]`.
 *  3. For each contact that has a matching surviving platform user (matched by email),
 *     PATCH the user's `memberId` to the new contact platform_id so login works.
 *  4. Write _seed-results-orgs-20260518.json with the new ID mapping. The CSVs then need
 *     a one-line-per-row update from this file (or aliases.json gets a new BOPIS-style
 *     mapping).
 *
 * USAGE:
 *   node scripts/seed-b2b-fixtures.mjs [profile] [--dry-run] [--verbose] [--teardown]
 *
 * Profiles:
 *   baseline    — 4 base orgs (AcmeCorp/TechFlow/BuildRight/AcmeWest) + 10 contacts (CON-001..011)
 *   imp         — IMP-049 supporting orgs (ORG-009..019) + impersonation target contacts (CON-020..022)
 *   memberships — Org-scoped role memberships (VCST-5028) from organization-memberships.csv:
 *                 ensures a contact + storefront login (security account) per user_email, an
 *                 optional account-level GLOBAL platform role (the `global_role` column — JIRA
 *                 Test1's "global role + org roles" setup), then creates one OrganizationMembership
 *                 per (user, org) with its org-scoped `role_id`.
 *                 Seeds the cross-org test fixture (one member in N orgs with distinct roles).
 *   full        — baseline + imp + memberships (default — recommended for post-restore recovery)
 *   teardown    — Delete every org/contact whose name starts with "AGENT-TEST-", plus the
 *                 security accounts + org-memberships listed in organization-memberships.csv.
 *
 * Safety:
 *   - ENV_RISK gate — blocks ENV_RISK=production (override --allow-admin-writes-on-prod); runs on dev/test/staging/localhost.
 *   - --dry-run prints the plan, no writes.
 *   - Idempotent: re-running finds existing entities by name/email and reuses them.
 *
 * NOTE: For baseline/imp this does NOT re-create platform users (USR-001..) — they survived the
 * wipe; it only re-links them. The `memberships` profile DOES create security accounts (logins)
 * for its members, because those test users are provisioned fresh.
 *
 * API contracts used by `memberships` (verified live 2026-06-15, VCST-5028 PR #300 — see
 * reference_organization_membership_api_contract memory):
 *   - Security account: POST /api/platform/security/users/create  ( .../users → 405 )
 *   - Org membership:   POST   /api/customer/organization-memberships   body = full OrganizationMembership
 *                       POST   /api/customer/organization-memberships/search   body = { userId }
 *                       DELETE /api/customer/organization-memberships?ids=<id>&ids=<id>
 *     Body FK is `userId` (security-account id, NOT contact memberId); roles = [{ roleId, roleName }].
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
loadDotenv({ path: '.env.defaults' });
loadDotenv({ path: `.env.${TEST_ENV}`, override: true });
loadDotenv({ path: '.env.local', override: true });

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATE = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const RESULTS_FILE = join(ROOT, `test-data/b2b/_seed-results-orgs-${DATE}.json`);

// --- CLI ---
const args = process.argv.slice(2);
const profile = ['baseline', 'imp', 'memberships', 'full', 'teardown'].find(p => args.includes(p)) || 'full';
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) {
  console.error('Missing BACK_URL / ADMIN / ADMIN_PASSWORD in env');
  process.exit(1);
}

// --- Safety: prod gate by config (ENV_RISK), not hostname — see feedback_seed_env_risk_not_host_allowlist ---
const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();
if (ENV_RISK === 'production' && !args.includes('--allow-admin-writes-on-prod')) {
  console.error(`ABORT: ENV_RISK=production for ${new URL(BACK_URL).host} — refusing to seed. Pass --allow-admin-writes-on-prod to override.`);
  process.exit(2);
}

console.log(`\n🌱 Seed B2B fixtures — profile: ${profile}${DRY_RUN ? ' [DRY RUN]' : ''}`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);

// --- CSV parser ---
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map(line => {
    const fields = parseCsvLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, fields[i] || '']));
  });
}
function parseCsvLine(line) {
  const fields = [];
  let cur = '';
  let inQ = false;
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

// --- HTTP ---
// Dry-run policy: we still authenticate + perform read calls (GET, POST /search)
// so dry-run can accurately report which entities already exist and which would
// be created. Only write calls (POST /api/members create, PUT, DELETE) are stubbed.
let TOKEN = null;
function isReadCall(method, path) {
  if (method === 'GET') return true;
  if (method === 'POST' && path.includes('/search')) return true;
  return false;
}

async function authenticate() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: ADMIN,
      password: ADMIN_PASSWORD,
      scope: 'offline_access',
    }),
  });
  if (!res.ok) throw new Error(`Auth ${res.status}: ${await res.text()}`);
  const data = await res.json();
  TOKEN = data.access_token;
  console.log(`  Auth: OK (expires in ${data.expires_in}s)${DRY_RUN ? ' [DRY RUN — reads only]' : ''}`);
}

async function api(method, path, body, { expectStatus = [200, 201, 204] } = {}) {
  if (DRY_RUN && !isReadCall(method, path)) {
    if (VERBOSE) console.log(`  [DRY RUN] ${method} ${path}`);
    return { _dryRun: true, id: `dry-${Math.random().toString(36).slice(2, 10)}` };
  }
  const headers = { 'Authorization': `Bearer ${TOKEN}` };
  let fetchBody;
  if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  const res = await fetch(`${BACK_URL}${path}`, { method, headers, body: fetchBody });
  if (!expectStatus.includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) return res.json();
  return null;
}

// --- Helpers ---
async function findOrgByName(name) {
  const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: name, take: 50 });
  return (r?.results || []).find(m => m.name === name);
}

async function findUserByEmail(email) {
  // Search FIRST — the GET-by-username endpoint is cache-flaky (returns 200 with an empty/stale
  // body, or misses an existing user), which caused duplicate account+contact creation across
  // re-seeds. The search endpoint is the reliable existence check.
  try {
    const s = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 10 });
    const hit = (s?.results || []).find(u =>
      (u.userName || '').toLowerCase() === email.toLowerCase() ||
      (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit?.id) return hit;
  } catch { /* fall through to GET */ }
  try {
    const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
    return u?.id ? u : null; // GET can return 200 with an empty body for a deleted user
  } catch {
    return null;
  }
}

// Full user record by id (reliable) — needed before any PUT so we never write back a partial object.
async function getUserById(id) {
  if (!id) return null;
  try {
    const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
    return u?.id ? u : null;
  } catch {
    return null;
  }
}

async function findContactById(id) {
  if (!id) return null;
  try {
    return await api('GET', `/api/contacts/${id}`, null, { expectStatus: [200, 404] });
  } catch (e) {
    return null;
  }
}

function orgBody(row) {
  const name = row.org_name;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    memberType: 'Organization',
    name,
    emails: row.emails ? [row.emails.split(';')[0]] : [`${slug}@test-agent.com`],
    phones: row.phones ? row.phones.split(';') : ['+1-555-AGENT-000'],
    addresses: [{
      addressType: 'BillingAndShipping',
      firstName: 'Test',
      lastName: 'Admin',
      organization: name,
      line1: '123 Test Street',
      city: 'New York',
      regionId: 'NY',
      regionName: 'New York',
      postalCode: '10001',
      countryCode: 'USA',
      countryName: 'United States',
      phone: '+1-555-AGENT-000',
      email: `${slug}@test-agent.com`,
    }],
    groups: (row.groups || 'store-acme').split(',').map(g => g.trim()).filter(Boolean),
    description: row.description || `AGENT-TEST org seeded ${DATE}`,
    status: row.status || 'Approved',
  };
}

function contactBody(row, orgPlatformIds) {
  return {
    memberType: 'Contact',
    firstName: row.first_name,
    lastName: row.last_name,
    fullName: row.full_name || `${row.first_name} ${row.last_name}`,
    name: row.full_name || `${row.first_name} ${row.last_name}`,
    emails: [row.email],
    phones: row.phone ? [row.phone] : ['+1-555-AGENT-100'],
    organizations: orgPlatformIds,
    status: row.status || 'Approved',
    timeZone: row.time_zone || 'America/New_York',
    defaultLanguage: row.default_language || 'en-US',
    currencyCode: row.currency_code || 'USD',
    addresses: [{
      addressType: 'BillingAndShipping',
      firstName: row.first_name,
      lastName: row.last_name,
      line1: '456 QA Avenue',
      city: 'New York',
      regionId: 'NY',
      regionName: 'New York',
      postalCode: '10001',
      countryCode: 'USA',
      countryName: 'United States',
      phone: row.phone || '+1-555-AGENT-100',
      email: row.email,
    }],
  };
}

// --- Main pipeline ---
async function seedOrgs(rows, parentMap = {}) {
  console.log(`\n  Seeding ${rows.length} organization(s)...`);
  const out = {};
  for (const row of rows) {
    let existing = await findOrgByName(row.org_name);
    if (existing) {
      out[row.org_id] = { csv_id: row.org_id, name: row.org_name, platform_id: existing.id, reused: true };
      if (VERBOSE) console.log(`    ↻ reuse  ${row.org_id} ${row.org_name} (${existing.id})`);
      continue;
    }
    const body = orgBody(row);
    if (row.parent_org_id && parentMap[row.parent_org_id]) {
      body.parentId = parentMap[row.parent_org_id];
    }
    const created = await api('POST', '/api/members', body);
    const platformId = created?.id || `dry-${row.org_id}`;
    out[row.org_id] = { csv_id: row.org_id, name: row.org_name, platform_id: platformId, reused: false };
    console.log(`    ✓ create ${row.org_id} ${row.org_name} (${platformId})`);
  }
  return out;
}

async function seedContacts(rows, orgMap) {
  console.log(`\n  Seeding ${rows.length} contact(s)...`);
  const out = {};
  for (const row of rows) {
    // Try to find by linked user's memberId
    const user = await findUserByEmail(row.email);
    if (user?.memberId) {
      const contact = await findContactById(user.memberId);
      if (contact) {
        out[row.contact_id] = {
          csv_id: row.contact_id, name: row.full_name, email: row.email,
          platform_id: contact.id, reused: true, user_id: user.id,
        };
        if (VERBOSE) console.log(`    ↻ reuse  ${row.contact_id} ${row.full_name} (${contact.id}) via user ${user.id}`);
        continue;
      }
    }
    const orgPlatformId = orgMap[row.org_id]?.platform_id;
    if (!orgPlatformId) {
      console.warn(`    ⚠ skip   ${row.contact_id} ${row.full_name}: org ${row.org_id} not in seeded set`);
      continue;
    }
    const body = contactBody(row, [orgPlatformId]);
    const created = await api('POST', '/api/members', body);
    const platformId = created?.id || `dry-${row.contact_id}`;
    out[row.contact_id] = {
      csv_id: row.contact_id, name: row.full_name, email: row.email,
      platform_id: platformId, reused: false, user_id: user?.id || null,
    };
    console.log(`    ✓ create ${row.contact_id} ${row.full_name} (${platformId})`);
  }
  return out;
}

async function relinkUsersToContacts(contactMap) {
  console.log(`\n  Re-linking users to new contact platform_ids...`);
  let linked = 0, skipped = 0;
  for (const [csvId, c] of Object.entries(contactMap)) {
    if (!c.user_id) { skipped++; continue; }
    if (c.reused) { skipped++; continue; } // already linked
    // PATCH the user record to update memberId
    const user = await api('GET', `/api/platform/security/users/${encodeURIComponent(c.email)}`, null, { expectStatus: [200, 404] });
    if (!user) { skipped++; continue; }
    user.memberId = c.platform_id;
    await api('PUT', '/api/platform/security/users', user, { expectStatus: [200, 204] });
    console.log(`    ✓ link   user ${user.id} → contact ${c.platform_id} (${c.email})`);
    linked++;
  }
  console.log(`  Linked: ${linked}, skipped: ${skipped}`);
}

// --- Org-scoped memberships (VCST-5028) ---
const MEMBERSHIPS_CSV = join(ROOT, 'test-data/b2b/organization-memberships.csv');
const STATIC_ROLE_NAMES = {
  'org-maintainer': 'Organization maintainer',
  'org-employee': 'Organization employee',
};
const _roleNameCache = {};
async function resolveRoleName(roleId) {
  if (STATIC_ROLE_NAMES[roleId]) return STATIC_ROLE_NAMES[roleId];
  if (_roleNameCache[roleId]) return _roleNameCache[roleId];
  const r = await api('GET', `/api/platform/security/roles/${encodeURIComponent(roleId)}`, null, { expectStatus: [200, 404] });
  const name = r?.name || roleId;
  _roleNameCache[roleId] = name;
  return name;
}

async function findContactByEmail(email) {
  const r = await api('POST', '/api/members/search', { memberType: 'Contact', keyword: email, take: 20 });
  return (r?.results || []).find(m => (m.emails || []).some(e => e?.toLowerCase() === email.toLowerCase()));
}

// Ensure the contact exists and is a member of every org listed for this email; returns its platform id.
async function ensureMembershipContact(email, firstName, lastName, orgPlatformIds) {
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
  const body = {
    memberType: 'Contact', firstName, lastName,
    fullName: `${firstName} ${lastName}`, name: `${firstName} ${lastName}`,
    emails: [email], organizations: orgPlatformIds, status: 'Approved',
    timeZone: 'America/New_York', defaultLanguage: 'en-US', currencyCode: 'USD',
  };
  const created = await api('POST', '/api/members', body);
  const id = created?.id || `dry-contact-${email}`;
  console.log(`    ✓ create contact ${id} (${email})`);
  return id;
}

// Ensure a storefront login exists for the contact; returns the security-account user id.
async function ensureSecurityAccount(email, password, contactId) {
  const existing = await findUserByEmail(email);
  if (existing?.id) {
    if (!DRY_RUN && contactId && existing.memberId !== contactId) {
      // Relink against the FULL record (search hits are partial — PUTting one would drop fields).
      const full = await getUserById(existing.id) || existing;
      full.memberId = contactId;
      await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
    }
    if (VERBOSE) console.log(`    ↻ reuse  user ${existing.id} (${email})`);
    return existing.id;
  }
  const body = {
    userName: email, email, password, memberId: contactId, storeId: STORE_ID,
    userType: 'Customer', isAdministrator: false, emailConfirmed: true,
    lockoutEnabled: false, status: 'Approved',
  };
  const result = await api('POST', '/api/platform/security/users/create', body);
  if (result && result.succeeded === false) {
    throw new Error(`security/users/create failed for ${email}: ${JSON.stringify(result.errors)}`);
  }
  if (DRY_RUN) { console.log(`    ✓ create user  (dry) (${email})`); return `dry-user-${email}`; }
  // /users/create returns a SecurityResult { succeeded, errors } — NOT the user. Fetch the new id.
  const fresh = await findUserByEmail(email);
  const id = fresh?.id;
  if (!id) throw new Error(`created user ${email} but could not resolve its id via GET`);
  console.log(`    ✓ create user  ${id} (${email})`);
  return id;
}

// Ensure a GLOBAL platform role (e.g. org-maintainer) is on the security account's roles[] —
// distinct from the org-scoped OrganizationMembership roles. Mirrors JIRA Test1 (global role + org roles).
async function ensureGlobalRole(email, roleId) {
  if (!roleId) return;
  if (DRY_RUN) { if (VERBOSE) console.log(`    [DRY RUN] ensure global role ${roleId} on ${email}`); return; }
  const found = await findUserByEmail(email);
  if (!found?.id) return;
  // Always operate on the FULL user record (search hits omit roles[]).
  const user = await getUserById(found.id) || found;
  if ((user.roles || []).some(r => r.id === roleId || r.name === roleId)) {
    if (VERBOSE) console.log(`    ↻ global role ${roleId} already on ${email}`);
    return;
  }
  // roles/search matches by NAME, not id — so fetch the catalog and resolve by id|name ourselves.
  const rs = await api('POST', '/api/platform/security/roles/search', { take: 1000 });
  const role = (rs?.results || []).find(r => r.id === roleId || r.name === roleId);
  if (!role) { console.warn(`    ⚠ global role "${roleId}" not found — skipping`); return; }
  user.roles = [...(user.roles || []), role];
  await api('PUT', '/api/platform/security/users', user, { expectStatus: [200, 204] });
  console.log(`    ✓ global role ${role.id} → ${email}`);
}

async function searchMemberships(userId) {
  if (DRY_RUN && userId?.startsWith?.('dry-')) return [];
  const r = await api('POST', '/api/customer/organization-memberships/search', { userId, take: 100 });
  return r?.results || [];
}

// Idempotent: one OrganizationMembership per (user, org). Returns the membership id.
async function ensureOrgMembership(userId, orgId, orgName, roleId, existing) {
  const found = (existing || []).find(m => m.organizationId === orgId);
  if (found) {
    if (VERBOSE) console.log(`    ↻ reuse  membership ${found.id} (${orgName})`);
    return found.id;
  }
  const roleName = await resolveRoleName(roleId);
  const body = {
    userId, organizationId: orgId, organizationName: orgName,
    roles: [{ roleId, roleName }],
  };
  const created = await api('POST', '/api/customer/organization-memberships', body);
  const id = created?.id || `dry-mom-${orgId}`;
  console.log(`    ✓ create membership ${id} (${orgName} → ${roleName})`);
  return id;
}

async function seedMemberships() {
  let rows;
  try {
    rows = parseCsv(readFileSync(MEMBERSHIPS_CSV, 'utf-8')).filter(r => r.user_email && r.org_name);
  } catch {
    console.log('\n  Memberships: organization-memberships.csv not found — skipping.');
    return [];
  }
  console.log(`\n  Seeding ${rows.length} org membership row(s)...`);

  // Group rows by member (email) so we create the contact once with all its orgs.
  const byEmail = {};
  for (const r of rows) (byEmail[r.user_email] ||= []).push(r);

  const out = [];
  for (const [email, memberRows] of Object.entries(byEmail)) {
    // Resolve all org platform ids for this member (orgs must already exist).
    const orgs = [];
    for (const r of memberRows) {
      const org = await findOrgByName(r.org_name);
      if (!org) { console.warn(`    ⚠ skip   ${r.membership_id}: org "${r.org_name}" not found (seed orgs first)`); continue; }
      orgs.push({ row: r, orgId: org.id });
    }
    if (!orgs.length) continue;

    const first = memberRows[0];
    const contactId = await ensureMembershipContact(email, first.first_name, first.last_name, orgs.map(o => o.orgId));
    const userId = await ensureSecurityAccount(email, first.password || 'Password1!', contactId);
    // Optional account-level (global) platform role from the CSV's global_role column.
    const globalRole = memberRows.map(r => r.global_role).find(Boolean);
    await ensureGlobalRole(email, globalRole);
    const existing = await searchMemberships(userId);

    for (const { row, orgId } of orgs) {
      const membershipId = await ensureOrgMembership(userId, orgId, row.org_name, row.role_id, existing);
      out.push({
        membership_id: row.membership_id, email, contact_id: contactId, user_id: userId,
        org_name: row.org_name, org_id: orgId, role_id: row.role_id, platform_membership_id: membershipId,
      });
    }
  }
  return out;
}

async function teardownMemberships() {
  let rows;
  try {
    rows = parseCsv(readFileSync(MEMBERSHIPS_CSV, 'utf-8')).filter(r => r.user_email);
  } catch { return; }
  const emails = [...new Set(rows.map(r => r.user_email))];
  console.log(`\n  Teardown: ${emails.length} membership user(s) from organization-memberships.csv...`);
  for (const email of emails) {
    const user = await findUserByEmail(email);
    if (!user?.id) { if (VERBOSE) console.log(`    – no user for ${email}`); continue; }
    const memberships = await searchMemberships(user.id);
    const ids = memberships.map(m => m.id).filter(Boolean);
    if (ids.length) {
      const qs = ids.map(id => `ids=${encodeURIComponent(id)}`).join('&');
      await api('DELETE', `/api/customer/organization-memberships?${qs}`, null, { expectStatus: [200, 204, 404] });
      console.log(`    ✗ deleted ${ids.length} membership(s) for ${email}`);
    }
    // NOTE: the security delete query param is `names` (NOT `userNames`); `?userNames=` binds an
    // empty array and returns a vacuous { succeeded:true } without deleting anything.
    await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(email)}`, null, { expectStatus: [200, 204, 404] });
    console.log(`    ✗ deleted security account ${email}`);
  }
}

async function teardown() {
  await teardownMemberships();
  console.log('\n  Teardown: scanning for AGENT-TEST-* members...');
  const res = await api('POST', '/api/members/search', { keyword: 'AGENT-TEST-', take: 500 });
  const items = res?.results || [];
  console.log(`  Found ${items.length} AGENT-TEST-* member(s)`);
  let deleted = 0;
  for (const m of items) {
    try {
      // members delete is a query-array endpoint (`?ids=`); `DELETE /api/members/{id}` returns 405.
      await api('DELETE', `/api/members?ids=${encodeURIComponent(m.id)}`, null, { expectStatus: [200, 204, 404] });
      console.log(`    ✗ deleted ${m.memberType} ${m.name} (${m.id})`);
      deleted++;
    } catch (e) {
      console.warn(`    ⚠ delete failed for ${m.name}: ${e.message.slice(0, 100)}`);
    }
  }
  console.log(`  Teardown: ${deleted}/${items.length} deleted`);
}

// --- Main ---
async function main() {
  await authenticate();
  if (profile === 'teardown') { await teardown(); return; }

  // memberships-only: orgs must already exist; just (re)create members + logins + org-scoped roles.
  if (profile === 'memberships') {
    const memberships = await seedMemberships();
    if (!DRY_RUN) {
      mkdirSync(dirname(RESULTS_FILE), { recursive: true });
      writeFileSync(RESULTS_FILE, JSON.stringify({ seedDate: DATE, profile, platform: BACK_URL, storeId: STORE_ID, memberships }, null, 2));
      console.log(`\nResults: ${RESULTS_FILE}`);
    }
    console.log(`\n✅ B2B seed complete (profile=memberships)\n`);
    console.log('Next steps:');
    console.log('  1. Register/refresh the @td() alias for each seeded member in test-data/aliases.json (id/userId/email/password/org ids + roles).');
    console.log('  2. Trigger member index rebuild (optional): /api/search/indexes/index Member rebuild.');
    return;
  }

  const orgsAll = parseCsv(readFileSync(join(ROOT, 'test-data/b2b/organizations.csv'), 'utf-8'))
    .filter(r => r.platform_id && r.org_name); // skip rows without IDs
  const contactsAll = parseCsv(readFileSync(join(ROOT, 'test-data/b2b/contacts.csv'), 'utf-8'))
    .filter(r => r.email);

  // Profile filter
  const baselineOrgIds = new Set(['ORG-001', 'ORG-002', 'ORG-003', 'ORG-004']);
  const impOrgIds = new Set([
    'ORG-009', 'ORG-010', 'ORG-011', 'ORG-012', 'ORG-013', 'ORG-014',
    'ORG-015', 'ORG-016', 'ORG-017', 'ORG-018', 'ORG-019',
  ]);
  let orgsToSeed = orgsAll;
  let contactsToSeed = contactsAll;
  if (profile === 'baseline') {
    orgsToSeed = orgsAll.filter(r => baselineOrgIds.has(r.org_id));
    const allowedOrg = new Set(orgsToSeed.map(r => r.org_id));
    contactsToSeed = contactsAll.filter(r => allowedOrg.has(r.org_id));
  } else if (profile === 'imp') {
    orgsToSeed = orgsAll.filter(r => impOrgIds.has(r.org_id));
    const allowedOrg = new Set(orgsToSeed.map(r => r.org_id));
    contactsToSeed = contactsAll.filter(r => allowedOrg.has(r.org_id));
  }

  console.log(`  Plan: ${orgsToSeed.length} orgs, ${contactsToSeed.length} contacts`);

  // Two-pass for parent-child orgs: seed parents first (no parent_org_id), then children.
  const parents = orgsToSeed.filter(r => !r.parent_org_id);
  const children = orgsToSeed.filter(r => r.parent_org_id);
  const orgMap = await seedOrgs(parents);
  if (children.length > 0) {
    const parentMap = Object.fromEntries(Object.entries(orgMap).map(([csvId, v]) => [csvId, v.platform_id]));
    Object.assign(orgMap, await seedOrgs(children, parentMap));
  }

  const contactMap = await seedContacts(contactsToSeed, orgMap);

  await relinkUsersToContacts(contactMap);

  // full profile also seeds org-scoped memberships (VCST-5028) on top of the base fixtures.
  let memberships = [];
  if (profile === 'full') memberships = await seedMemberships();

  // Write results
  if (!DRY_RUN) {
    const report = {
      seedDate: DATE,
      profile,
      platform: BACK_URL,
      storeId: STORE_ID,
      orgs: Object.values(orgMap),
      contacts: Object.values(contactMap),
      memberships,
    };
    mkdirSync(dirname(RESULTS_FILE), { recursive: true });
    writeFileSync(RESULTS_FILE, JSON.stringify(report, null, 2));
    console.log(`\nResults: ${RESULTS_FILE}`);
  }

  console.log(`\n✅ B2B seed complete (profile=${profile})\n`);
  console.log('Next steps:');
  console.log('  1. Update test-data/b2b/organizations.csv platform_id column from this results file.');
  console.log('  2. Update test-data/b2b/contacts.csv platform_id column likewise.');
  console.log('  3. Bump test-data/aliases.json _meta.version with changelog entry.');
  console.log('  4. Trigger member index rebuild (optional): /api/search/indexes/index Member rebuild.');
}

main().catch(e => { console.error(`\n❌ Seed failed: ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
