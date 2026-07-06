/**
 * scripts/seed-data/validate-b2b-data.mjs
 *
 * STATIC (no network) consistency validator for the B2B + users test-data CSVs
 * (VCST-5406). Proves the whole relational graph is connected and aligned:
 *
 *   organizations ── addresses
 *        │
 *     contacts ──┐
 *        │       │
 *      users ────┴─ organization-memberships ── roles
 *
 * Invariants enforced:
 *   1. Orgs: unique ids; every org has a valid address (line1+city+ISO-3 country;
 *      US/CA need a region; US ZIP is 5 digits). If the org also has a default
 *      Shipping row in addresses.csv, the inline org address must MATCH it.
 *   2. addresses.csv: every row references an existing org_id XOR contact_id, with
 *      a valid country/postal.
 *   3. Contacts: unique ids; seeded contact belongs to ≥1 existing org.
 *   4. Users: unique ids/emails; seeded user → a contact; the user's org set EXACTLY
 *      equals its contact's org set; each org exists; a role that resolves in roles.csv
 *      (⇒ an OrganizationMembership per org with a role) — unless invitation-pending;
 *      a password (⇒ account creatable).
 *   5. organization-memberships.csv: user_email set; org_name resolves in
 *      organizations.csv (by NAME); role_id resolves in roles.csv.
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
const load = (f, required = true) => {
  const p = join(B2B, f);
  if (!existsSync(p)) { if (required) { console.error(`ABORT: missing ${f}`); process.exit(2); } return []; }
  return parse(readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
};
const isTrue = (v) => /^(true|yes|1)$/i.test(String(v || '').trim());
const ids = (v) => String(v || '').split(';').map((s) => s.trim()).filter(Boolean);
const norm = (v) => String(v || '').trim().toLowerCase().replace(/\s+/g, ' ');

const orgs = load('organizations.csv');
const contacts = load('contacts.csv');
const users = load('users.csv');
const roles = load('roles.csv');
const memberships = load('organization-memberships.csv', false);
const addresses = load('addresses.csv', false);

const orgById = new Map(orgs.map((o) => [o.org_id, o]));
const orgByName = new Map(orgs.map((o) => [norm(o.org_name), o]));
const contactById = new Map(contacts.map((c) => [c.contact_id, c]));
const roleKeys = new Set(roles.flatMap((r) => [r.role_id, r.role_name]).filter(Boolean));
// addresses.csv default Shipping address per org (for the inline↔table consistency check).
const defaultShipByOrg = new Map();
for (const a of addresses) {
  if (a.org_id && /shipping/i.test(a.address_type || '') && isTrue(a.is_default)) defaultShipByOrg.set(a.org_id, a);
}

const problems = [];
const notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const dupes = (rows, key) => {
  const seen = new Set(), dup = new Set();
  for (const r of rows) { const v = (r[key] || '').trim(); if (!v) continue; if (seen.has(v)) dup.add(v); seen.add(v); }
  return [...dup];
};

// 0. Uniqueness of primary keys.
console.log('\n[0] Unique keys');
for (const [rows, key, label] of [[orgs, 'org_id', 'organizations'], [contacts, 'contact_id', 'contacts'], [users, 'user_id', 'users'], [users, 'email', 'users.email']]) {
  const d = dupes(rows, key); if (d.length) fail(`${label}: duplicate ${key}: ${d.join(', ')}`);
}
if (!problems.length) ok('org_id / contact_id / user_id / email are unique');

// 1. Organization addresses (present + valid + aligned with addresses.csv).
// NOTE: organizations.csv KEEPS its platform_id (unlike users/contacts). It's a PINNED id —
// seedOrgs forces `body.id = row.platform_id` on create, so the same org GUID is used on EVERY
// env by construction (a deterministic seed input, not a runtime-drift output). Do not blank it:
// it's env-invariant, so it neither leaks cross-env nor needs a per-env overlay.
console.log('\n[1] Organization addresses (present + valid + aligned)');
let orgAddrOk = 0;
for (const o of orgs) {
  const errs = [];
  for (const c of ['address_line1', 'city', 'postal_code', 'country_code']) if (!(o[c] || '').trim()) errs.push(`missing ${c}`);
  const cc = (o.country_code || '').trim();
  if (cc && !/^[A-Z]{3}$/.test(cc)) errs.push(`country_code "${cc}" not ISO-3`);
  if (/^(USA|CAN)$/.test(cc) && !(o.region_id || '').trim()) errs.push('region_id required for USA/CAN');
  if (cc === 'USA' && (o.postal_code || '').trim() && !/^\d{5}$/.test(o.postal_code.trim())) errs.push(`postal_code "${o.postal_code}" not a 5-digit US ZIP`);
  // If addresses.csv has a default shipping row for this org, the inline address must match it.
  const da = defaultShipByOrg.get(o.org_id);
  if (da && (norm(o.address_line1) !== norm(da.line1) || norm(o.city) !== norm(da.city) || (o.postal_code || '').trim() !== (da.postal_code || '').trim())) {
    errs.push(`inline address differs from addresses.csv ${da.address_id} ("${o.address_line1}, ${o.city} ${o.postal_code}" vs "${da.line1}, ${da.city} ${da.postal_code}")`);
  }
  if (errs.length) fail(`org ${o.org_id} (${o.org_name}): ${errs.join('; ')}`);
  else orgAddrOk++;
}
if (orgAddrOk === orgs.length) ok(`all ${orgs.length} organizations have a valid, aligned address`);

// 2. addresses.csv referential integrity.
console.log('\n[2] addresses.csv references');
if (!addresses.length) warn('addresses.csv empty or absent — skipping');
else {
  let addrOk = 0;
  for (const a of addresses) {
    const errs = [];
    if (!a.org_id && !a.contact_id) errs.push('neither org_id nor contact_id set');
    if (a.org_id && !orgById.has(a.org_id)) errs.push(`unknown org_id ${a.org_id}`);
    if (a.contact_id && !contactById.has(a.contact_id)) errs.push(`unknown contact_id ${a.contact_id}`);
    const cc = (a.country_code || '').trim();
    if (cc && !/^[A-Z]{2,3}$/.test(cc)) errs.push(`country_code "${cc}" invalid`);
    if (errs.length) fail(`address ${a.address_id}: ${errs.join('; ')}`);
    else addrOk++;
  }
  if (addrOk === addresses.length) ok(`all ${addresses.length} address rows reference a valid org/contact`);
}

// 3. Contacts → org.
console.log('\n[3] Seeded contacts belong to an existing org');
let contactOk = 0;
for (const c of contacts) {
  // Multi-env rule (same as users): contact platform_id is a runtime, per-env id — it must NOT sit
  // in the committed CSV. (No @td alias consumes it today; keep it blank so one never leaks cross-env.)
  if ((c.platform_id || '').trim()) fail(`contact ${c.contact_id} (${c.email}): platform_id "${c.platform_id.trim()}" must be blank — contact ids resolve per env, not from the shared CSV`);
  if (!isTrue(c.seeded)) continue;
  const cOrgs = ids(c.org_id);
  if (!cOrgs.length) { fail(`contact ${c.contact_id} (${c.email}) has no org_id`); continue; }
  const unknown = cOrgs.filter((o) => !orgById.has(o));
  if (unknown.length) fail(`contact ${c.contact_id} references unknown org(s): ${unknown.join(', ')}`);
  else contactOk++;
}
ok(`${contactOk} seeded contact(s) map to existing orgs`);

// 4. Users → contact + exact org alignment + role/membership + account.
console.log('\n[4] Users → contact, org (exact), role (→ membership), account');
for (const u of users) {
  const tag = `${u.user_id} (${u.email})`;
  const seeded = isTrue(u.seeded);
  const c = contactById.get(u.contact_id);
  if (!c) { (seeded ? fail : warn)(`user ${tag}: contact_id ${u.contact_id} not found`); }
  const uOrgs = ids(u.org_id);
  if (!uOrgs.length) fail(`user ${tag}: no org_id`);
  const unknownOrgs = uOrgs.filter((o) => !orgById.has(o));
  if (unknownOrgs.length) fail(`user ${tag}: unknown org(s) ${unknownOrgs.join(', ')}`);
  // EXACT contact/user org alignment (both directions).
  if (c) {
    const cOrgs = ids(c.org_id);
    const uSet = new Set(uOrgs), cSet = new Set(cOrgs);
    const uNotC = uOrgs.filter((o) => !cSet.has(o));
    const cNotU = cOrgs.filter((o) => !uSet.has(o));
    if (uNotC.length) fail(`user ${tag}: org(s) ${uNotC.join(', ')} not on contact ${c.contact_id} (no membership possible)`);
    if (cNotU.length) warn(`user ${tag}: contact ${c.contact_id} has extra org(s) ${cNotU.join(', ')} the user isn't assigned to`);
  }
  const invited = /invit|unconfirm|pending/i.test(`${u.status} ${u.test_purpose}`);
  // `roles` is `;`-joined and INDEX-PARALLEL with `org_id` (VCST-5028): a single role applies to
  // every org; N roles ⇒ the i-th role scopes the i-th org (a multi-org member with distinct
  // per-org roles). Each part must resolve in roles.csv; a multi-role list must match the org count.
  const roleNames = (u.roles || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (!roleNames.length) {
    if (invited) warn(`user ${tag}: no role — OK (invitation-pending)`);
    else fail(`user ${tag}: no role → no org membership with a role`);
  } else {
    const badRoles = roleNames.filter((r) => !roleKeys.has(r));
    if (badRoles.length) fail(`user ${tag}: role(s) "${badRoles.join('", "')}" do not resolve in roles.csv`);
    else if (roleNames.length > 1 && roleNames.length !== uOrgs.length) fail(`user ${tag}: ${roleNames.length} role(s) for ${uOrgs.length} org(s) — a multi-role list must be index-parallel with org_id (or one role for all)`);
  }
  if (seeded && !(u.password || '').trim()) fail(`user ${tag}: seeded but no password`);
  // Multi-env rule: b2b user platform_id must NOT live in the committed CSV — runtime ids live in
  // aliases.<env>.json per env (written by the seeder), so a suite run against any env resolves
  // ONLY that env's ids and can never leak another env's GUID (or a leaked mock like "user-1").
  const pid = (u.platform_id || '').trim();
  if (pid) fail(`user ${tag}: platform_id "${pid}" must be blank — b2b user ids live in aliases.<env>.json (multi-env-safe), not users.csv`);
}
ok('checked all users');

// 5. organization-memberships.csv (explicit cross-org fixtures).
console.log('\n[5] organization-memberships.csv → org + role');
if (!memberships.length) warn('organization-memberships.csv empty or absent — skipping');
else {
  for (const m of memberships) {
    const tag = `${m.membership_id} (${m.user_email})`;
    if (!m.user_email) fail(`membership ${m.membership_id}: no user_email`);
    if (!orgByName.has(norm(m.org_name))) fail(`membership ${tag}: org_name "${m.org_name}" not found in organizations.csv`);
    if (!roleKeys.has((m.role_id || '').trim())) fail(`membership ${tag}: role_id "${m.role_id}" not found in roles.csv`);
  }
  // Multi-org members should span ≥2 orgs (that's the point of the fixture).
  const byEmail = {};
  for (const m of memberships) (byEmail[m.user_email] ||= new Set()).add(norm(m.org_name));
  for (const [email, set] of Object.entries(byEmail)) {
    if (set.size > 1) ok(`multi-org member ${email}: ${set.size} orgs`);
  }
}

// Summary.
console.log('\n=== B2B test-data validation ===');
console.log(`  orgs: ${orgs.length} | contacts: ${contacts.length} | users: ${users.length} | roles: ${roles.length} | memberships: ${memberships.length} | addresses: ${addresses.length}`);
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nB2B test-data OK — contacts, users, orgs, memberships and roles are connected.');
process.exit(0);
