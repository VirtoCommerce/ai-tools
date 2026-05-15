#!/usr/bin/env node
// Seed three impersonation-target user fixtures for IMP-048 and IMP-049 in
// regression/suites/Frontend/auth/082-auth-impersonation.csv.
//
// IDEMPOTENT: discovers existing AGENT-TEST entities for 20260514 and reuses them.
//
// Read-only: never seeds against production — asserts BACK_URL matches vcst-qa
// or vcptcore-qa hosts. Admin password resolved from process.env (.env.local).
//
// IMPORTANT data-drift note (2026-05-14):
//   On vcst-qa the original AcmeCorp (ORG-001 eba8b270-...) and AcmeWest
//   (ORG-004 a1e98b8e-...) platform_ids in test-data/b2b/organizations.csv
//   are STALE — the live DB no longer has those orgs. Only TechFlow (ORG-002)
//   and BuildRight (ORG-003) survive from the original four. To reach the
//   11-org threshold for USR-020 we therefore create 11 NEW AGENT-TEST orgs
//   (ORG-009..ORG-019) rather than mixing 4 base orgs + 7 new orgs.
//
// Output: reports/seed/seed-impersonation-targets-20260514.json

import { env } from '../config.js';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const DATE = '20260514';
const REPORT_PATH = `reports/seed/seed-impersonation-targets-${DATE}.json`;

const ALLOWED_HOSTS = ['vcst-qa.govirto.com', 'vcptcore-qa.govirto.com'];
const backHost = new URL(env.BACK_URL).host;
if (!ALLOWED_HOSTS.includes(backHost)) {
  console.error(`ABORT: BACK_URL host "${backHost}" not in allowlist [${ALLOWED_HOSTS.join(', ')}]`);
  process.exit(2);
}
console.log(`[seed] target host: ${backHost}`);

const headers = { 'Content-Type': 'application/json' };

async function authn() {
  const r = await fetch(env.BACK_URL + '/connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      username: env.ADMIN,
      password: env.ADMIN_PASSWORD,
      scope: 'offline_access',
    }),
  });
  if (!r.ok) throw new Error(`auth ${r.status}: ${await r.text()}`);
  const j = await r.json();
  headers['Authorization'] = `Bearer ${j.access_token}`;
  console.log(`[seed] authenticated (expires_in=${j.expires_in}s)`);
}

async function api(method, path, body) {
  const r = await fetch(env.BACK_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = text; }
  if (!r.ok) {
    const err = new Error(`${method} ${path} -> ${r.status}: ${typeof json === 'string' ? (json || '').slice(0, 500) : JSON.stringify(json).slice(0, 500)}`);
    err.status = r.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function findOrgByName(name) {
  const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: name, take: 20 });
  return (r.results || []).find(m => m.name === name);
}

async function findUserByName(userName) {
  try {
    return await api('GET', `/api/platform/security/users/${encodeURIComponent(userName)}`);
  } catch (e) {
    if (e.status === 404) return null;
    throw e;
  }
}

// Canonical contact lookup: via the linked user's memberId. Contact-by-name search
// is unreliable on this platform (returns 0 results for "Many Orgs"/"Blocked User"),
// so we anchor reuse on the user record's memberId field.
async function findContactViaUser(userName) {
  const user = await findUserByName(userName);
  if (!user || !user.memberId) return { user: null, contact: null };
  const contact = await api('GET', `/api/contacts/${user.memberId}`);
  return { user, contact };
}

function orgBody(name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    memberType: 'Organization',
    name,
    emails: [`${slug}@test-agent.com`],
    phones: ['+1-555-AGENT-IMP-001'],
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
      countryCode: 'US',
      countryName: 'United States',
      phone: '+1-555-AGENT-IMP-001',
      email: `${slug}@test-agent.com`,
    }],
    groups: ['store-acme'],
    description: 'AGENT-TEST org for IMP-048 org-switcher scroll+search test',
  };
}

function contactBody(firstName, lastName, email, status = 'Approved') {
  return {
    memberType: 'Contact',
    firstName,
    lastName,
    fullName: `${firstName} ${lastName}`,
    name: `${firstName} ${lastName}`,
    emails: [email],
    phones: ['+1-555-AGENT-IMP-100'],
    organizations: [],
    status,
    addresses: [{
      addressType: 'BillingAndShipping',
      firstName,
      lastName,
      line1: '456 QA Avenue',
      city: 'New York',
      regionId: 'NY',
      regionName: 'New York',
      postalCode: '10001',
      countryCode: 'US',
      countryName: 'United States',
      phone: '+1-555-AGENT-IMP-100',
      email,
    }],
    timeZone: 'America/New_York',
    defaultLanguage: 'en-US',
    currencyCode: 'USD',
  };
}

function userBody(userName, email, password, contactId, emailConfirmed = true) {
  return {
    userName,
    email,
    password,
    storeId: 'B2B-store',
    memberId: contactId,
    isAdministrator: false,
    userType: 'Customer',
    emailConfirmed,
    roles: [],
  };
}

const report = {
  date: DATE,
  host: backHost,
  back_url: env.BACK_URL,
  steps: [],
  entities: { orgs: [], contacts: [], users: [] },
  observed: {},
  deviations: [],
};

function step(name, payload) {
  console.log(`[seed] ${name} ${JSON.stringify(payload).slice(0, 200)}`);
  report.steps.push({ name, ts: new Date().toISOString(), ...payload });
}

// ---------- main ----------
await authn();
step('authn', { ok: true });

// 11 new orgs (ORG-009..ORG-019) — covers USR-020 single-handedly without
// relying on stale ORG-001/ORG-004 platform_ids.
const orgSpec = [
  ['ORG-009', 'AGENT-TEST-Org-BMW-Group-20260514'],
  ['ORG-010', 'AGENT-TEST-Org-Bence-and-Family-20260514'],
  ['ORG-011', 'AGENT-TEST-Org-Brand-Specials-20260514'],
  ['ORG-012', 'AGENT-TEST-Org-Cypress-Company-Kft-20260514'],
  ['ORG-013', 'AGENT-TEST-Org-Elena-Company-20260514'],
  ['ORG-014', 'AGENT-TEST-Org-Fill-Fillips-Company-20260514'],
  ['ORG-015', 'AGENT-TEST-Org-Graceland-Boots-Shoes-20260514'],
  ['ORG-016', 'AGENT-TEST-Org-Hillcrest-Holdings-20260514'],
  ['ORG-017', 'AGENT-TEST-Org-Ironwood-Industries-20260514'],
  ['ORG-018', 'AGENT-TEST-Org-Juniper-Junction-20260514'],
  ['ORG-019', 'AGENT-TEST-Org-Kingsbridge-Imports-20260514'],
];

const seededOrgs = [];
for (const [orgId, name] of orgSpec) {
  let existing = await findOrgByName(name);
  if (existing) {
    step('reuse-org', { org_id: orgId, name, platform_id: existing.id });
  } else {
    existing = await api('POST', '/api/members', orgBody(name));
    step('create-org', { org_id: orgId, name, platform_id: existing.id });
  }
  seededOrgs.push({ org_id: orgId, name, platform_id: existing.id });
}
report.entities.orgs = seededOrgs;

// Live, verified surviving orgs from the original 4 seeded baseline
const TECHFLOW = { org_id: 'ORG-002', platform_id: '6fb516c1-07f3-4af4-be5e-35961e3f7993' };
const BUILDRIGHT = { org_id: 'ORG-003', platform_id: 'fba51391-b652-4dbb-b178-aa2d98d2ceed' };

// All 11 platform_ids for USR-020 (all new AGENT-TEST orgs)
const usr020OrgList = seededOrgs.map(o => ({ org_id: o.org_id, platform_id: o.platform_id }));
const usr020OrgIds = usr020OrgList.map(o => o.platform_id);
const usr020OrgKeys = usr020OrgList.map(o => o.org_id);

// ---- USR-020: assigned to all 11 new AGENT-TEST orgs ----
const u20Email = `AGENT-TEST-imp-target-many-orgs-${DATE}@test-agent.com`;

let { user: u20, contact: c20 } = await findContactViaUser(u20Email);
if (!c20) {
  c20 = await api('POST', '/api/members', contactBody('Many', 'Orgs', u20Email));
  step('create-contact-CON-020', { contact_id: 'CON-020', platform_id: c20.id, email: u20Email });
} else {
  step('reuse-contact-CON-020', { contact_id: 'CON-020', platform_id: c20.id });
}

if (!u20) {
  await api('POST', '/api/platform/security/users/create', userBody(u20Email, u20Email, 'Password1!', c20.id, true));
  u20 = await findUserByName(u20Email);
  step('create-user-USR-020', { user_id: 'USR-020', platform_id: u20.id });
} else {
  step('reuse-user-USR-020', { user_id: 'USR-020', platform_id: u20.id });
}

// PUT contact via /api/contacts with organizations[] = 11 new platform_ids
const c20Full = await api('GET', `/api/contacts/${c20.id}`);
c20Full.organizations = usr020OrgIds;
await api('PUT', '/api/contacts', c20Full);
const c20After = await api('GET', `/api/contacts/${c20.id}`);
const orgCount20 = (c20After.organizations || []).length;
step('assign-CON-020-to-orgs', { contact_id: 'CON-020', requested: usr020OrgIds.length, observed: orgCount20 });
if (orgCount20 < 11) report.deviations.push(`USR-020 has ${orgCount20} orgs (expected >=11)`);

report.entities.contacts.push({
  contact_id: 'CON-020',
  platform_id: c20.id,
  org_count: orgCount20,
  organizations: usr020OrgKeys,
});
report.entities.users.push({
  user_id: 'USR-020',
  platform_id: u20.id,
  contact_id: 'CON-020',
  email: u20Email,
  org_count: orgCount20,
  organizations: usr020OrgKeys,
});

// ---- USR-021: assigned to TechFlow (ORG-002) only, then locked ----
const u21Email = `AGENT-TEST-imp-target-blocked-${DATE}@test-agent.com`;

let { user: u21, contact: c21 } = await findContactViaUser(u21Email);
if (!c21) {
  c21 = await api('POST', '/api/members', contactBody('Blocked', 'User', u21Email));
  step('create-contact-CON-021', { contact_id: 'CON-021', platform_id: c21.id });
} else {
  step('reuse-contact-CON-021', { contact_id: 'CON-021', platform_id: c21.id });
}

const c21Full = await api('GET', `/api/contacts/${c21.id}`);
if (!(c21Full.organizations || []).includes(TECHFLOW.platform_id)) {
  c21Full.organizations = [TECHFLOW.platform_id];
  await api('PUT', '/api/contacts', c21Full);
  step('assign-CON-021-to-ORG-002-TechFlow', { ok: true });
}

if (!u21) {
  await api('POST', '/api/platform/security/users/create', userBody(u21Email, u21Email, 'Password1!', c21.id, true));
  u21 = await findUserByName(u21Email);
  step('create-user-USR-021', { user_id: 'USR-021', platform_id: u21.id });
} else {
  step('reuse-user-USR-021', { user_id: 'USR-021', platform_id: u21.id });
}

let lockedStatus = 'unknown';
try {
  await api('POST', `/api/platform/security/users/${u21.id}/lock`);
  step('lock-USR-021', { ok: true });
} catch (e) {
  report.deviations.push(`USR-021 lock failed: ${e.message}`);
  step('lock-USR-021', { ok: false, error: e.message });
}
const u21Get = await api('GET', `/api/platform/security/users/${encodeURIComponent(u21Email)}`);
let u21LockedFlag = null;
try { u21LockedFlag = await api('GET', `/api/platform/security/users/${u21.id}/locked`); } catch {}
report.observed.locked_endpoint_response = u21LockedFlag;
report.observed.locked_user_fields = {
  lockoutEnabled: u21Get.lockoutEnabled,
  lockoutEnd: u21Get.lockoutEnd,
  lockoutEndDateUtc: u21Get.lockoutEndDateUtc,
  userState: u21Get.userState,
  status: u21Get.status,
  emailConfirmed: u21Get.emailConfirmed,
};
// Canonical lock detection: lockoutEnd is non-null AND > now. The /locked endpoint
// has slight propagation lag; lockoutEnd is the persisted source of truth.
const lockoutEndDate = u21Get.lockoutEnd ? new Date(u21Get.lockoutEnd) : null;
const isLockedByEnd = lockoutEndDate && lockoutEndDate.getTime() > Date.now();
const isLockedByFlag = !!(u21LockedFlag && (u21LockedFlag === true || u21LockedFlag.locked === true));
lockedStatus = (isLockedByEnd || isLockedByFlag) ? 'Locked' : 'NotLocked';
step('verify-USR-021-locked', { locked_status: lockedStatus, locked_by_lockoutEnd: isLockedByEnd, locked_by_flag: isLockedByFlag, fields: report.observed.locked_user_fields });

report.entities.contacts.push({ contact_id: 'CON-021', platform_id: c21.id, organizations: ['ORG-002'] });
report.entities.users.push({
  user_id: 'USR-021',
  platform_id: u21.id,
  contact_id: 'CON-021',
  email: u21Email,
  observed_status: lockedStatus,
  organizations: ['ORG-002'],
});

// ---- USR-022: emailConfirmed=false + sendVerificationEmail ----
const u22Email = `AGENT-TEST-imp-target-invited-${DATE}@test-agent.com`;

let { user: u22, contact: c22 } = await findContactViaUser(u22Email);
if (!c22) {
  c22 = await api('POST', '/api/members', contactBody('Invited', 'User', u22Email));
  step('create-contact-CON-022', { contact_id: 'CON-022', platform_id: c22.id });
} else {
  step('reuse-contact-CON-022', { contact_id: 'CON-022', platform_id: c22.id });
}

const c22Full = await api('GET', `/api/contacts/${c22.id}`);
if (!(c22Full.organizations || []).includes(TECHFLOW.platform_id)) {
  c22Full.organizations = [TECHFLOW.platform_id];
  await api('PUT', '/api/contacts', c22Full);
  step('assign-CON-022-to-ORG-002-TechFlow', { ok: true });
}

if (!u22) {
  await api('POST', '/api/platform/security/users/create', userBody(u22Email, u22Email, 'Password1!', c22.id, false));
  u22 = await findUserByName(u22Email);
  step('create-user-USR-022', { user_id: 'USR-022', platform_id: u22.id });
} else {
  step('reuse-user-USR-022', { user_id: 'USR-022', platform_id: u22.id });
}

let invitedStatus = 'unknown';
try {
  await api('POST', `/api/platform/security/users/${u22.id}/sendVerificationEmail`);
  step('send-verification-email-USR-022', { ok: true });
} catch (e) {
  report.deviations.push(`USR-022 sendVerificationEmail failed: ${e.message}`);
  step('send-verification-email-USR-022', { ok: false, error: e.message });
}
const u22Get = await api('GET', `/api/platform/security/users/${encodeURIComponent(u22Email)}`);
report.observed.invited_user_fields = {
  emailConfirmed: u22Get.emailConfirmed,
  userState: u22Get.userState,
  status: u22Get.status,
  lockoutEnabled: u22Get.lockoutEnabled,
};
invitedStatus = u22Get.emailConfirmed === false ? 'EmailUnconfirmed' : 'Unknown';
step('verify-USR-022-invited', { invited_status: invitedStatus, fields: report.observed.invited_user_fields });

report.entities.contacts.push({ contact_id: 'CON-022', platform_id: c22.id, organizations: ['ORG-002'] });
report.entities.users.push({
  user_id: 'USR-022',
  platform_id: u22.id,
  contact_id: 'CON-022',
  email: u22Email,
  observed_status: invitedStatus,
  organizations: ['ORG-002'],
});

// Persist report
mkdirSync(dirname(REPORT_PATH), { recursive: true });
writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
console.log(`\n[seed] wrote ${REPORT_PATH}`);
console.log(`[seed] DONE — orgs: ${seededOrgs.length}, users: 3, contacts: 3`);
console.log(`[seed] USR-020 org_count: ${orgCount20}`);
console.log(`[seed] USR-021 locked: ${lockedStatus}`);
console.log(`[seed] USR-022 emailConfirmed: ${u22Get.emailConfirmed}`);
if (report.deviations.length) {
  console.log(`[seed] DEVIATIONS:`);
  report.deviations.forEach(d => console.log('  - ' + d));
} else {
  console.log(`[seed] no deviations`);
}
