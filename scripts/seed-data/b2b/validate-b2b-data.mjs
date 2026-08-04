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
 *   6. Address-book PAGINATION fixture: the pagination org (addresses-specs.mjs
 *      PAGINATION_ORG_ID) carries >= TARGET_TOTAL addresses, yielding >= MIN_PAGES pages at the
 *      storefront's ADDRESSES_PER_PAGE — the precondition suite 011 CHK-060 / CHK-098 depend on;
 *      no runtime GUID leaked into addresses.csv; facets span >1 country; and the
 *      TECHFLOW_ORG_ADDRESSES alias numbers still match what the CSV yields.
 *
 * Usage:  npm run td:validate:b2b   (or  node scripts/seed-data/validate-b2b-data.mjs)
 * Exit 1 on any hard error; warnings (optional/pending fixtures) don't fail.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  paginationAudit, assertContractCoherent, findGuidLeaks, findMarkerProblems,
  ADDRESSES_PER_PAGE, MIN_PAGES, TARGET_TOTAL, SEED_MARKER_PREFIX,
} from './addresses-specs.mjs';
import {
  findAliasDeclarationProblems, findStatusProblems, rowCreatesMembership, statusCoverage,
  ALIAS_COLUMN, STATUS_COLUMN, MANUALLY_SELECTABLE_STATUSES, STATUS_SOURCE_REF,
} from './membership-alias-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
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
  // An ASSOCIATION-ONLY fixture deliberately has no role: that is what makes provisionContactLogins
  // create the login WITHOUT any OrganizationMembership row (the legacy `contact.organizations` shape
  // — 104 of the 105 at-risk accounts on this env). It must be declared with the explicit
  // ASSOCIATION-ONLY marker so "no role" can never pass silently as an authoring slip.
  const assocOnly = /ASSOCIATION-ONLY/.test(u.test_purpose || '');
  const roleNames = (u.roles || '').split(';').map((s) => s.trim()).filter(Boolean);
  if (!roleNames.length) {
    if (assocOnly) ok(`user ${tag}: no role — OK (ASSOCIATION-ONLY fixture: contact.organizations without any OrganizationMembership row, by design)`);
    else if (invited) warn(`user ${tag}: no role — OK (invitation-pending)`);
    else fail(`user ${tag}: no role → no org membership with a role`);
  } else if (assocOnly) {
    fail(`user ${tag}: declared ASSOCIATION-ONLY but carries role(s) "${roleNames.join('", "')}" — a role makes the seeder create an OrganizationMembership row, which destroys the fixture's only reason to exist`);
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

// 6. Address-book PAGINATION fixture (unblocks suite 011 CHK-060 / CHK-098).
// GRD-001 only checks that an assertion carries a provenance tag, never that the precondition it
// names is satisfiable — so a pagination case whose org quietly dropped back to 4 addresses lints
// green and fails as if the product were broken. This check makes the fixture size a gate.
console.log('\n[6] Address-book pagination fixture (pagination org)');
{
  const contractErrs = assertContractCoherent();
  for (const e of contractErrs) fail(`pagination contract incoherent: ${e}`);

  const a = paginationAudit(addresses, orgs);
  if (!a.orgName) {
    fail(`pagination org ${a.orgId} not found in organizations.csv`);
  } else {
    // No runtime platform GUID may sit in the committed addresses.csv — an org address is matched
    // by CONTENT, so there is nothing to pin, and a leaked GUID would resolve to the wrong entity
    // (or nothing) on every other env.
    const leaks = findGuidLeaks(readFileSync(join(B2B, 'addresses.csv'), 'utf8'));
    if (leaks.length) fail(`addresses.csv leaks ${leaks.length} runtime GUID(s) (e.g. ${leaks[0]}) — org addresses are content-matched; ids belong in aliases.<env>.json`);
    else ok('addresses.csv carries no runtime platform GUID');

    if (a.duplicateRowIds.length) {
      warn(`${a.orgId}: row(s) ${a.duplicateRowIds.join(', ')} duplicate another row's content key (addressType|line1|city|country) — the seeder creates ONE address for them`);
    }
    // The invariant CHK-060 / CHK-098 depend on: enough addresses for a multi-page address book.
    if (a.expectedTotal < TARGET_TOTAL) {
      fail(`${a.orgId} (${a.orgName}): ${a.expectedTotal} address(es) — needs >= ${TARGET_TOTAL} for the address-book pagination cases (${a.csvDistinct} distinct addresses.csv row(s) + ${a.unmanagedInline} inline org address). Add rows to addresses.csv, then: TEST_ENV=<env> npm run seed:b2b:addresses`);
    } else if (a.pages < MIN_PAGES) {
      fail(`${a.orgId}: ${a.expectedTotal} address(es) → only ${a.pages} page(s) at ${ADDRESSES_PER_PAGE}/page — needs >= ${MIN_PAGES}`);
    } else {
      ok(`${a.orgId} (${a.orgName}): ${a.expectedTotal} addresses → ${a.pages} pages at ${ADDRESSES_PER_PAGE}/page, last page ${a.lastPage}`);
    }
    if (!a.partialLastPage) {
      warn(`${a.orgId}: ${a.expectedTotal} is an exact multiple of ${ADDRESSES_PER_PAGE} — a full last page hides the partial-last-page edge case`);
    }
    // The modal has Country / State / City facets; one value per facet exercises none of them.
    if (a.countryCount < 2) fail(`${a.orgId}: addresses span ${a.countryCount} country(ies) — the Country facet needs >= 2`);
    else ok(`facet spread: ${a.countryCount} countries, ${a.stateCount} states/provinces, ${a.cityCount} cities`);

    // The @td() aliases suite 011/081 read must agree with the CSV, or a case asserts a count the
    // fixture no longer has. Alias numbers are a MIRROR of the CSV — the CSV is the source.
    const aliasPath = join(ROOT, 'test-data', 'aliases.json');
    if (existsSync(aliasPath)) {
      const aliases = JSON.parse(readFileSync(aliasPath, 'utf8'));
      const declared = aliases.TECHFLOW_ORG_ADDRESSES;
      if (declared) {
        const expect = { count: a.expectedTotal, csv_managed_count: a.csvDistinct, countries_distinct: a.countryCount, cities_distinct: a.cityCount, states_distinct: a.stateCount };
        // Track THIS check's own outcome. Gating the ok() on the global `problems` array (or on
        // `count` alone) printed "alias agrees" immediately after failing on a different field —
        // e.g. cities_distinct drifts while count still matches — which is a false success sitting
        // one line below its own failure.
        const mismatched = [];
        for (const [k, v] of Object.entries(expect)) {
          if (declared[k] !== undefined && declared[k] !== v) {
            mismatched.push(k);
            fail(`aliases.json TECHFLOW_ORG_ADDRESSES.${k} = ${JSON.stringify(declared[k])} but addresses.csv yields ${v} — the CSV is the source of truth; update the alias`);
          }
        }
        if (!mismatched.length) ok(`TECHFLOW_ORG_ADDRESSES alias agrees with addresses.csv (count=${a.expectedTotal})`);
      }
    }
  }
}

console.log('\n[7] Teardown seed markers (address_id → outerId)');
{
  // Teardown reclaims an address by content key OR by the `outerId` marker the seeder writes
  // (AGENT-TEST-ADDR:<address_id>). The marker is what survives a row being DELETED from the CSV —
  // so a duplicate or over-length address_id does not just look untidy, it breaks the only
  // mechanism that can reclaim an orphaned address, and it breaks it silently.
  const errs = findMarkerProblems(addresses);
  for (const e of errs) fail(`teardown marker: ${e}`);
  if (!errs.length) {
    const orgRows = addresses.filter((r) => r.org_id && !r.contact_id).length;
    ok(`${orgRows} org address row(s) mint a unique, in-length ${SEED_MARKER_PREFIX}: marker`);
  }
}

// 8. Cross-org membership → @td() alias declaration (the overlay writeback contract).
// The seeder writes each cross-org fixture's four runtime GUIDs (contact id, security-account id,
// two membership ids) into aliases.<env>.json using the CSV's own `alias` / `membership_id_field`
// columns. If the alias doesn't exist, doesn't declare the field, or two aliases claim one account,
// the seeder writes an id nothing can read — and the fixture fails SILENTLY: @td() resolves to ""
// and the case looks like a product bug. Also re-asserts no runtime GUID leaked into the CSV.
console.log('\n[8] organization-memberships.csv → @td() alias writeback declaration');
{
  const aliasPath = join(ROOT, 'test-data', 'aliases.json');
  const aliasReg = existsSync(aliasPath) ? JSON.parse(readFileSync(aliasPath, 'utf8')) : {};
  const errs = findAliasDeclarationProblems(memberships, aliasReg);
  for (const e of errs) fail(e);
  if (!errs.length) {
    const declared = [...new Set(memberships.map((m) => (m[ALIAS_COLUMN] || '').trim()).filter(Boolean))];
    const undeclared = memberships.filter((m) => !(m[ALIAS_COLUMN] || '').trim()).length;
    if (declared.length) ok(`${declared.length} cross-org alias(es) declared coherently: ${declared.join(', ')}`);
    else warn('no membership row declares an `alias` — runtime GUIDs will not be written back to aliases.<env>.json');
    if (undeclared) warn(`${undeclared} membership row(s) declare no alias — their runtime ids are not written back`);
  }
}

// 9. membership_status column — legal value, and blocking statuses surfaced (VCST-5281).
// POST /organization-memberships does NOT validate status server-side (only PUT does, and only when
// the value both is non-empty and differs), so an illegal value on a NEW membership would be
// persisted silently. Gate it statically here. Legal set is imported, never re-listed.
// Covers ALL THREE membership-creating sources, because the seeder is authoritative over membership
// status on every one of them: organization-memberships.csv (seedMemberships), b2b/users.csv
// (provisionContactLogins) and white-labeling/users.csv (seedInlineOrgUsers). b2b/contacts.csv,
// users/test-users.csv and users/agent-user-pool.csv are deliberately NOT here — they create no
// OrganizationMembership at all (contacts / personal accounts only), so a status column there would
// be inert. Legal set imported from membership-alias-specs.mjs — never re-listed per source.
console.log(`\n[9] ${STATUS_COLUMN} (OrganizationMembership.Status) across every membership-creating source`);
{
  const wlUsers = (() => {
    const p = join(ROOT, 'test-data', 'white-labeling', 'users.csv');
    if (!existsSync(p)) return [];
    return parse(readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
  })();
  // `roleCol` is the column that GATES membership creation on each source, and it is what makes the
  // required-vs-inert split decidable statically: the seeder pairs each org with its index-parallel
  // role and drops any pair without one, so an empty role cell provably yields zero membership rows.
  const SOURCES = [
    { rows: memberships, label: 'membership', idCol: 'membership_id', emailCol: 'user_email', orgCol: null, roleCol: 'role_id', name: 'b2b/organization-memberships.csv', via: 'seedMemberships' },
    { rows: users, label: 'user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id', roleCol: 'roles', name: 'b2b/users.csv', via: 'provisionContactLogins' },
    { rows: wlUsers, label: 'wl-user', idCol: 'user_id', emailCol: 'email', orgCol: 'org_id', roleCol: 'roles', name: 'white-labeling/users.csv', via: 'seedInlineOrgUsers' },
  ];
  let totalDeclared = 0, totalCreating = 0, missingColumn = 0;
  const coveredOverall = new Set();
  for (const src of SOURCES) {
    if (!src.rows.length) { warn(`${src.name}: no rows — skipping`); continue; }
    if (!src.rows.some((r) => r[STATUS_COLUMN] !== undefined)) {
      // NOT cosmetic: the seeder passes null for a source that cannot declare a status, and null is
      // now enforced on reconcile — so a missing column means every re-seed force-resets a real
      // status to null on that source's memberships, with no way to express otherwise.
      fail(`${src.name} (→ ${src.via}) creates OrganizationMemberships but has NO ${STATUS_COLUMN} column — the seeder would force every one of its memberships to status=null on each re-seed with no way to declare otherwise. Add the trailing column and declare a concrete status on every membership-creating row.`);
      missingColumn++;
      continue;
    }
    const { problems: statusErrs, blocking } = findStatusProblems(src.rows, src);
    for (const e of statusErrs) fail(`${src.name}: ${e}`);
    for (const b of blocking) warn(`${src.name}: ${b}`);

    const creating = src.rows.filter((r) => rowCreatesMembership(r, src.roleCol));
    const declared = creating.filter((r) => (r[STATUS_COLUMN] || '').trim()).length;
    totalDeclared += declared;
    totalCreating += creating.length;
    const cov = statusCoverage(src.rows, src.roleCol);
    for (const s of cov.covered) coveredOverall.add(s);
    if (!statusErrs.length) {
      console.log(`    · ${src.name} (→ ${src.via}): ${declared}/${creating.length} membership-creating row(s) declare a status; ${src.rows.length - creating.length} row(s) create none (status correctly blank) — ${cov.covered.map((s) => `${s}×${cov.counts[s]}`).join(', ') || 'none'}`);
    }
  }

  // Fixture-set coverage over the legal vocabulary. Informational (a single source need not carry all
  // four), but a set that only ever says `Approved` cannot exercise MembershipStatuses.IsBlocking at
  // all — that is a coverage hole worth naming rather than discovering during a run.
  const missingOverall = MANUALLY_SELECTABLE_STATUSES.filter((s) => !coveredOverall.has(s));
  if (missingOverall.length) warn(`no fixture anywhere declares ${STATUS_COLUMN} = ${missingOverall.join(', ')} — the blocking/reinvitable branches of that value have no seeded representative`);
  else ok(`every legal status has a seeded representative across the three sources: ${MANUALLY_SELECTABLE_STATUSES.join(', ')}`);

  if (!missingColumn && !problems.length) {
    ok(`${totalDeclared}/${totalCreating} membership-creating row(s) declare a CONCRETE ${STATUS_COLUMN} — no seeded membership inherits its status by omission. Legal set: ${MANUALLY_SELECTABLE_STATUSES.join(', ')} (${STATUS_SOURCE_REF})`);
  }
}

// Summary.
console.log('\n=== B2B test-data validation ===');
console.log(`  orgs: ${orgs.length} | contacts: ${contacts.length} | users: ${users.length} | roles: ${roles.length} | memberships: ${memberships.length} | addresses: ${addresses.length}`);
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nB2B test-data OK — contacts, users, orgs, memberships and roles are connected.');
process.exit(0);
