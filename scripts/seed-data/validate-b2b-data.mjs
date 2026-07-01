/**
 * scripts/seed-data/validate-b2b-data.mjs
 *
 * STATIC (no network) consistency validator for the B2B + users test-data CSVs
 * (VCST-5406). Enforces the invariants a seeded env must satisfy so that every
 * org-user resolves end to end:
 *
 *   1. Every organization has a shipping address (line1 + city + postalCode + countryCode).
 *   2. Every seeded contact belongs to ≥1 organization that exists.
 *   3. Every seeded user maps to a contact row (account ← contact), is assigned to
 *      ≥1 existing org, and — unless invitation-pending — has a role that resolves
 *      in roles.csv (so the seeder can create an OrganizationMembership WITH a role).
 *   4. A user's org set ⊆ its contact's org set (membership can be created per org).
 *
 * Usage:  npm run td:validate:b2b   (or  node scripts/seed-data/validate-b2b-data.mjs)
 * Exit 1 on any hard error; warnings (optional/pending fixtures) don't fail.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const B2B = join(ROOT, 'test-data', 'b2b');
const load = (f) => {
  const p = join(B2B, f);
  if (!existsSync(p)) { console.error(`ABORT: missing ${f}`); process.exit(2); }
  return parse(readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
};
const isTrue = (v) => /^(true|yes|1)$/i.test(String(v || '').trim());
const ids = (v) => String(v || '').split(';').map((s) => s.trim()).filter(Boolean);

const orgs = load('organizations.csv');
const contacts = load('contacts.csv');
const users = load('users.csv');
const roles = load('roles.csv');

const orgById = new Map(orgs.map((o) => [o.org_id, o]));
const contactById = new Map(contacts.map((c) => [c.contact_id, c]));
const roleKeys = new Set(roles.flatMap((r) => [r.role_id, r.role_name]).filter(Boolean));

const problems = [];
const notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

// 1. Organization addresses — present AND well-formed (a valid address per org).
console.log('\n[1] Organization addresses (present + valid)');
const addrCols = ['address_line1', 'city', 'postal_code', 'country_code'];
let orgAddrOk = 0;
for (const o of orgs) {
  const errs = [];
  for (const c of addrCols) if (!(o[c] || '').trim()) errs.push(`missing ${c}`);
  const cc = (o.country_code || '').trim();
  if (cc && !/^[A-Z]{3}$/.test(cc)) errs.push(`country_code "${cc}" is not ISO-3 (e.g. USA, DEU)`);
  // US/Canada require a region (state/province); US postal must be a 5-digit ZIP.
  if (/^(USA|CAN)$/.test(cc) && !(o.region_id || '').trim()) errs.push('region_id required for USA/CAN');
  if (cc === 'USA' && (o.postal_code || '').trim() && !/^\d{5}$/.test(o.postal_code.trim())) errs.push(`postal_code "${o.postal_code}" is not a 5-digit US ZIP`);
  if (errs.length) fail(`org ${o.org_id} (${o.org_name}): ${errs.join('; ')}`);
  else orgAddrOk++;
}
if (orgAddrOk === orgs.length) ok(`all ${orgs.length} organizations have a valid address`);

// 2. Contacts → org.
console.log('\n[2] Seeded contacts belong to an existing org');
for (const c of contacts) {
  if (!isTrue(c.seeded)) continue;
  const cOrgs = ids(c.org_id);
  if (!cOrgs.length) { fail(`contact ${c.contact_id} (${c.email}) has no org_id`); continue; }
  const unknown = cOrgs.filter((o) => !orgById.has(o));
  if (unknown.length) fail(`contact ${c.contact_id} references unknown org(s): ${unknown.join(', ')}`);
}
console.log('  (checked seeded contacts)');

// 3 & 4. Users → contact + account + org + role/membership.
console.log('\n[3] Seeded users → contact, org, role (→ membership)');
for (const u of users) {
  const tag = `${u.user_id} (${u.email})`;
  const seeded = isTrue(u.seeded);
  // contact
  const c = contactById.get(u.contact_id);
  if (!c) { (seeded ? fail : warn)(`user ${tag}: contact_id ${u.contact_id} not found in contacts.csv`); }
  // org assignment
  const uOrgs = ids(u.org_id);
  if (!uOrgs.length) fail(`user ${tag}: no org_id (a B2B user must be assigned to an org)`);
  const unknownOrgs = uOrgs.filter((o) => !orgById.has(o));
  if (unknownOrgs.length) fail(`user ${tag}: unknown org(s) ${unknownOrgs.join(', ')}`);
  // user orgs ⊆ contact orgs (so a membership can exist per org)
  if (c) {
    const cOrgs = new Set(ids(c.org_id));
    const notInContact = uOrgs.filter((o) => !cOrgs.has(o));
    if (notInContact.length) fail(`user ${tag}: assigned to org(s) ${notInContact.join(', ')} not on its contact ${c.contact_id} (no membership possible)`);
  }
  // role → membership. Empty role only OK for invitation-pending users.
  const invited = /invit|unconfirm|pending/i.test(`${u.status} ${u.test_purpose}`);
  if (!(u.roles || '').trim()) {
    if (invited) warn(`user ${tag}: no role — OK (invitation-pending fixture)`);
    else fail(`user ${tag}: no role → seeder cannot create an org membership with a role`);
  } else if (!roleKeys.has(u.roles.trim())) {
    fail(`user ${tag}: role "${u.roles}" does not resolve in roles.csv`);
  }
  // account: seeded users must be creatable (need a password).
  if (seeded && !(u.password || '').trim()) fail(`user ${tag}: seeded but no password → account cannot be created`);
}
console.log('  (checked all users)');

// Summary.
console.log('\n=== B2B test-data validation ===');
console.log(`  orgs: ${orgs.length} | contacts: ${contacts.length} | users: ${users.length} | roles: ${roles.length}`);
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nB2B test-data OK.');
process.exit(0);
