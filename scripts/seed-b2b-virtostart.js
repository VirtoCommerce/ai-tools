/**
 * B2B Test Data Seed — VirtoStart
 *
 * Mirrors the 2026-03-10 vcst-qa B2B seed (4 orgs / 10 contacts / 10 users) onto the
 * VirtoStart staging environment using the B2B-store group instead of store-acme.
 *
 * Loads .env.virtostart for URLs/admin user, .env.local for passwords. Writes IDs to
 * test-data/b2b/_seed-results-orgs-virtostart.json and a markdown report alongside it.
 *
 * Usage:
 *   node scripts/seed-b2b-virtostart.js [--dry-run] [--verbose]
 */

import { config } from 'dotenv';
import { writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

config({ path: join(ROOT, '.env.local'), override: false });
config({ path: join(ROOT, '.env.virtostart'), override: false });

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';
const STORE_GROUP = 'B2B-store';
const DATE_STAMP = '20260508';
const USER_PASSWORD = 'TestPass123!';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

const RESULTS_FILE = join(ROOT, 'test-data', 'b2b', '_seed-results-orgs-virtostart.json');
const REPORT_FILE = join(ROOT, 'test-data', 'b2b', `seed-report-virtostart-${DATE_STAMP}.md`);

// ---------- DATA ----------

const ORGS = [
  { key: 'AcmeCorp',   name: `AGENT-TEST-Org-AcmeCorp-${DATE_STAMP}`,   groups: ['Premium Customers', STORE_GROUP], parent: null,        emails: ['org-test@test-agent.com'],   phones: ['+1-212-555-1000'], desc: 'Primary B2B org — full user hierarchy (admin + buyers + viewer)' },
  { key: 'TechFlow',   name: `AGENT-TEST-Org-TechFlow-${DATE_STAMP}`,   groups: ['Standard Customers', STORE_GROUP], parent: null,        emails: ['techflow@test-agent.com'],   phones: ['+1-415-555-2000'], desc: 'Second org — multi-org switching' },
  { key: 'BuildRight', name: `AGENT-TEST-Org-BuildRight-${DATE_STAMP}`, groups: ['Standard Customers', STORE_GROUP], parent: null,        emails: ['buildright@test-agent.com'], phones: ['+1-713-555-3000'], desc: 'Third org — industrial/safety' },
  { key: 'AcmeWest',   name: `AGENT-TEST-Org-AcmeWest-${DATE_STAMP}`,   groups: [STORE_GROUP],                       parent: 'AcmeCorp',  emails: ['acme-west@test-agent.com'],  phones: ['+1-310-555-4000'], desc: 'Child of AcmeCorp — hierarchy test' },
];

const ORG_ADDRESSES = {
  AcmeCorp:   { firstName: 'John',   lastName: 'Mitchell',   line1: '1200 Commerce Blvd',   line2: 'Suite 400', city: 'New York',      regionId: 'NY', regionName: 'New York',     postalCode: '10001', countryCode: 'USA', countryName: 'United States', phone: '+1-212-555-1010' },
  TechFlow:   { firstName: 'Emily',  lastName: 'Johnson',    line1: '450 Innovation Way',   line2: 'Floor 8',   city: 'San Francisco', regionId: 'CA', regionName: 'California',   postalCode: '94105', countryCode: 'USA', countryName: 'United States', phone: '+1-415-555-2010' },
  BuildRight: { firstName: 'Carlos', lastName: 'Rodriguez',  line1: '2800 Industrial Blvd', line2: '',          city: 'Houston',       regionId: 'TX', regionName: 'Texas',        postalCode: '77001', countryCode: 'USA', countryName: 'United States', phone: '+1-713-555-3010' },
  AcmeWest:   { firstName: 'Robert', lastName: 'Lee',        line1: '9200 Pacific Coast Hwy', line2: 'Unit B',  city: 'Los Angeles',   regionId: 'CA', regionName: 'California',   postalCode: '90045', countryCode: 'USA', countryName: 'United States', phone: '+1-310-555-4010' },
};

const CONTACTS = [
  { firstName: 'John',    lastName: 'Mitchell',  org: 'AcmeCorp',   role: 'admin',  tz: 'America/New_York',   lang: 'en-US', currency: 'USD', phone: '+1-212-555-1010', purpose: 'Org admin — full permissions' },
  { firstName: 'Sarah',   lastName: 'Chen',      org: 'AcmeCorp',   role: 'buyer',  tz: 'America/New_York',   lang: 'en-US', currency: 'USD', phone: '+1-212-555-1020', purpose: 'Buyer — cart + checkout' },
  { firstName: 'Mike',    lastName: 'Torres',    org: 'AcmeCorp',   role: 'viewer', tz: 'America/New_York',   lang: 'en-US', currency: 'USD', phone: '+1-212-555-1030', purpose: 'Viewer — read-only' },
  { firstName: 'Lisa',    lastName: 'Wang',      org: 'AcmeCorp',   role: 'buyer',  tz: 'America/Chicago',    lang: 'en-US', currency: 'USD', phone: '+1-212-555-1040', purpose: 'Second buyer — multi-buyer workflow' },
  { firstName: 'Emily',   lastName: 'Johnson',   org: 'TechFlow',   role: 'admin',  tz: 'America/Los_Angeles', lang: 'en-US', currency: 'USD', phone: '+1-415-555-2010', purpose: 'TechFlow admin — multi-org' },
  { firstName: 'David',   lastName: 'Kim',       org: 'TechFlow',   role: 'buyer',  tz: 'America/Los_Angeles', lang: 'en-US', currency: 'USD', phone: '+1-415-555-2020', purpose: 'TechFlow buyer — order isolation' },
  { firstName: 'Carlos',  lastName: 'Rodriguez', org: 'BuildRight', role: 'admin',  tz: 'America/Chicago',    lang: 'en-US', currency: 'USD', phone: '+1-713-555-3010', purpose: 'BuildRight admin — safety focus' },
  { firstName: 'Angela',  lastName: 'Foster',    org: 'BuildRight', role: 'buyer',  tz: 'America/Chicago',    lang: 'en-US', currency: 'USD', phone: '+1-713-555-3020', purpose: 'BuildRight buyer — industrial' },
  { firstName: 'Robert',  lastName: 'Lee',       org: 'AcmeWest',   role: 'admin',  tz: 'America/Los_Angeles', lang: 'en-US', currency: 'USD', phone: '+1-310-555-4010', purpose: 'Child org admin — hierarchy' },
  { firstName: 'Hans',    lastName: 'Mueller',   org: 'AcmeCorp',   role: 'admin',  tz: 'Europe/Berlin',      lang: 'de-DE', currency: 'EUR', phone: '+49-30-555-5010', purpose: 'EU admin — multi-language/currency' },
];

const ROLE_NAMES = {
  admin:  'Organization maintainer',
  buyer:  'Purchasing agent',
  viewer: 'Organization employee',
};

// ---------- STATE ----------

const state = {
  token: null,
  roles: {},      // roleKey ('admin'|'buyer'|'viewer') → role object {id,name,normalizedName,concurrencyStamp}
  orgs: {},       // orgKey → {id, name, ...}
  contacts: [],   // [{...contact, id, userName, email}]
  users: [],      // [{id, userName, email, contactId, roleKey}]
};

// ---------- HELPERS ----------

const log = msg => console.log(`  ${msg}`);
const verbose = msg => { if (VERBOSE) console.log(`    [v] ${msg}`); };

async function api(method, path, body, { expectStatus = [200, 204], formUrlEncoded = false } = {}) {
  const url = `${BACK_URL}${path}`;
  verbose(`${method} ${url}`);
  if (DRY_RUN && method !== 'GET') {
    verbose('  [DRY RUN] skipped');
    return { _dryRun: true, id: `dry-${Math.random().toString(36).slice(2, 10)}` };
  }
  const headers = {};
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

  let fetchBody;
  if (body && formUrlEncoded) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    fetchBody = Object.entries(body).map(([k, v]) => `${k}=${v}`).join('&');
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    fetchBody = JSON.stringify(body);
  }
  const res = await fetch(url, { method, headers, body: fetchBody });
  if (!expectStatus.includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 600)}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

async function authenticate() {
  log('Authenticating...');
  const data = await api('POST', '/connect/token', {
    grant_type: 'password',
    username: ADMIN,
    password: ADMIN_PASSWORD,
    scope: 'offline_access',
  }, { formUrlEncoded: true, expectStatus: [200] });
  if (DRY_RUN) { state.token = 'dry-token'; log('Auth: [DRY RUN]'); return; }
  state.token = data.access_token;
  log(`Auth: OK (expires in ${data.expires_in}s)`);
}

async function discoverRoles() {
  log('Discovering roles...');
  for (const [key, name] of Object.entries(ROLE_NAMES)) {
    if (DRY_RUN) { state.roles[key] = { id: `dry-${key}`, name, normalizedName: name.toUpperCase() }; continue; }
    const r = await api('POST', '/api/platform/security/roles/search', { keyword: name, take: 3 });
    const role = (r.results || []).find(x => x.name === name);
    if (!role) throw new Error(`Role not found: ${name}`);
    state.roles[key] = { id: role.id, name: role.name, normalizedName: role.normalizedName, concurrencyStamp: role.concurrencyStamp };
    verbose(`  role[${key}] = ${role.id} (${role.name})`);
  }
}

function buildOrgBody(org) {
  const addr = ORG_ADDRESSES[org.key];
  const body = {
    memberType: 'Organization',
    name: org.name,
    emails: org.emails,
    phones: org.phones,
    addresses: [{
      addressType: 'BillingAndShipping',
      firstName: addr.firstName,
      lastName: addr.lastName,
      organization: org.name,
      line1: addr.line1,
      line2: addr.line2,
      city: addr.city,
      regionId: addr.regionId,
      regionName: addr.regionName,
      postalCode: addr.postalCode,
      countryCode: addr.countryCode,
      countryName: addr.countryName,
      phone: addr.phone,
      email: org.emails[0],
    }],
    groups: org.groups,
    description: org.desc,
    dynamicProperties: [],
  };
  if (org.parent && state.orgs[org.parent]) {
    body.parentId = state.orgs[org.parent].id;
  }
  return body;
}

async function seedOrgs() {
  log('Creating organizations...');
  for (const org of ORGS) {
    const body = buildOrgBody(org);
    const created = await api('POST', '/api/members', body, { expectStatus: [200, 201, 204] });
    state.orgs[org.key] = { id: created.id, name: org.name, parent: org.parent, groups: org.groups };
    log(`  ✓ ${org.name} → ${created.id}`);
  }
}

function userNameFor(c) {
  return `test-${c.firstName.toLowerCase()}.${c.lastName.toLowerCase()}-${DATE_STAMP}@test-agent.com`;
}

function buildContactBody(c) {
  const userName = userNameFor(c);
  const orgId = state.orgs[c.org].id;
  return {
    memberType: 'Contact',
    firstName: c.firstName,
    lastName: c.lastName,
    fullName: `${c.firstName} ${c.lastName}-${DATE_STAMP}`,
    name: `${c.firstName} ${c.lastName}-${DATE_STAMP}`,
    emails: [userName],
    phones: [c.phone],
    organizations: [orgId],
    addresses: [{
      addressType: 'Shipping',
      firstName: c.firstName,
      lastName: c.lastName,
      line1: '100 Test Street',
      city: 'New York',
      regionId: 'NY',
      regionName: 'New York',
      postalCode: '10001',
      countryCode: 'USA',
      countryName: 'United States',
      phone: c.phone,
      email: userName,
    }],
    timeZone: c.tz,
    defaultLanguage: c.lang,
    currencyCode: c.currency,
    status: 'Approved',
    description: c.purpose,
  };
}

async function seedContacts() {
  log('Creating contacts...');
  for (const c of CONTACTS) {
    const body = buildContactBody(c);
    const created = await api('POST', '/api/members', body, { expectStatus: [200, 201, 204] });
    const userName = userNameFor(c);
    state.contacts.push({ ...c, id: created.id, userName, email: userName });
    log(`  ✓ ${c.firstName} ${c.lastName} (${c.org}) → ${created.id}`);
  }
}

function buildUserBody(contact) {
  const role = state.roles[contact.role];
  return {
    userName: contact.userName,
    email: contact.email,
    password: USER_PASSWORD,
    storeId: STORE_ID,
    memberId: contact.id,
    isAdministrator: false,
    userType: 'Customer',
    emailConfirmed: true,
    status: 'Approved',
    roles: [{ id: role.id, name: role.name, normalizedName: role.normalizedName, concurrencyStamp: role.concurrencyStamp }],
  };
}

async function seedUsers() {
  log('Creating user accounts...');
  for (const c of state.contacts) {
    const body = buildUserBody(c);
    const created = await api('POST', '/api/platform/security/users/create', body, { expectStatus: [200, 201] });
    if (DRY_RUN) {
      state.users.push({ id: 'dry-user', userName: c.userName, email: c.email, contactId: c.id, roleKey: c.role });
      continue;
    }
    if (created && created.succeeded === false) {
      const errText = (created.errors || []).map(e => e.description || e.code).join('; ');
      throw new Error(`User create failed for ${c.userName}: ${errText}`);
    }
    // Re-read user to get its id
    const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(c.userName)}`);
    state.users.push({ id: u.id, userName: c.userName, email: c.email, contactId: c.id, roleKey: c.role });
    log(`  ✓ ${c.userName} → ${u.id} [${state.roles[c.role].name}]`);
  }
}

async function rebuildMemberIndex() {
  log('Triggering member index rebuild...');
  if (DRY_RUN) { log('  [DRY RUN] skipped'); return; }
  await api('POST', '/api/search/indexes/index', [{ documentType: 'Member', rebuild: true }], { expectStatus: [200, 204] });
  log('  ✓ index job queued');
}

// ---------- OUTPUT ----------

function buildResultsJson() {
  return {
    profile: 'b2b',
    target: BACK_URL,
    storeId: STORE_ID,
    storeGroup: STORE_GROUP,
    dateStamp: DATE_STAMP,
    seededAt: new Date().toISOString(),
    organizations: ORGS.map(o => ({
      key: o.key,
      id: state.orgs[o.key]?.id,
      name: o.name,
      parentId: o.parent ? state.orgs[o.parent]?.id : null,
      parentKey: o.parent,
      groups: o.groups,
    })),
    contacts: state.contacts.map(c => ({
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      fullName: `${c.firstName} ${c.lastName}-${DATE_STAMP}`,
      email: c.email,
      orgKey: c.org,
      orgId: state.orgs[c.org]?.id,
      role: c.role,
      timeZone: c.tz,
      defaultLanguage: c.lang,
      currencyCode: c.currency,
    })),
    users: state.users.map(u => ({
      id: u.id,
      userName: u.userName,
      email: u.email,
      contactId: u.contactId,
      role: ROLE_NAMES[u.roleKey],
      password: USER_PASSWORD,
      storeId: STORE_ID,
    })),
  };
}

function writeMarkdownReport(results) {
  const lines = [];
  lines.push(`# B2B Test Data Seed Report — VirtoStart — ${DATE_STAMP}`);
  lines.push('');
  lines.push(`**Platform:** ${BACK_URL}`);
  lines.push(`**Store:** ${STORE_ID} (group: ${STORE_GROUP})`);
  lines.push(`**Date:** ${results.seededAt}`);
  lines.push(`**Method:** REST API via admin token (\`/api/members\`, \`/api/platform/security/users/create\`)`);
  lines.push(`**Naming Convention:** \`AGENT-TEST-*-${DATE_STAMP}\` prefix`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Entity | Count |');
  lines.push('|--------|-------|');
  lines.push(`| Organizations | ${results.organizations.length} |`);
  lines.push(`| Contacts | ${results.contacts.length} |`);
  lines.push(`| User Accounts | ${results.users.length} |`);
  lines.push('');
  lines.push('## Organizations');
  lines.push('');
  lines.push('| Key | Name | ID | Parent | Groups |');
  lines.push('|-----|------|-----|--------|--------|');
  for (const o of results.organizations) {
    lines.push(`| ${o.key} | ${o.name} | \`${o.id}\` | ${o.parentKey || '—'} | ${o.groups.join(', ')} |`);
  }
  lines.push('');
  lines.push('## Contacts');
  lines.push('');
  lines.push('| Name | Org | Role | Email | Contact ID |');
  lines.push('|------|-----|------|-------|------------|');
  for (const c of results.contacts) {
    lines.push(`| ${c.firstName} ${c.lastName}-${DATE_STAMP} | ${c.orgKey} | ${ROLE_NAMES[c.role]} | ${c.email} | \`${c.id}\` |`);
  }
  lines.push('');
  lines.push('## Users');
  lines.push('');
  lines.push('| Username | Role | User ID | Contact ID |');
  lines.push('|----------|------|---------|------------|');
  for (const u of results.users) {
    lines.push(`| ${u.userName} | ${u.role} | \`${u.id}\` | \`${u.contactId}\` |`);
  }
  lines.push('');
  lines.push(`**Password (all users):** \`${USER_PASSWORD}\``);
  lines.push('');
  return lines.join('\n');
}

// ---------- MAIN ----------

async function main() {
  console.log(`\n🌱 B2B Seed — VirtoStart${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Target: ${BACK_URL}`);
  console.log(`   Store:  ${STORE_ID} (group: ${STORE_GROUP})`);
  console.log(`   Date:   ${DATE_STAMP}\n`);
  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) {
    console.error('Missing BACK_URL, ADMIN, or ADMIN_PASSWORD in .env.virtostart / .env.local');
    process.exit(1);
  }
  await authenticate();
  await discoverRoles();
  await seedOrgs();
  await seedContacts();
  await seedUsers();
  await rebuildMemberIndex();

  const results = buildResultsJson();
  if (!DRY_RUN) {
    writeFileSync(RESULTS_FILE, JSON.stringify(results, null, 2));
    log(`\nResults JSON: ${RESULTS_FILE}`);
    writeFileSync(REPORT_FILE, writeMarkdownReport(results));
    log(`Report MD:    ${REPORT_FILE}`);
  }
  console.log('\n✅ B2B seed complete!\n');
}

main().catch(err => {
  console.error(`\n❌ Seed failed: ${err.message}`);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
