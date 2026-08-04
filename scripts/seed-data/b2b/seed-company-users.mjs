#!/usr/bin/env node
/**
 * scripts/seed-company-users.mjs — ONE entry for every "company user" fixture (VCST-5406).
 *
 * Replaces four overlapping seeders (seed-b2b-fixtures, seed-users, seed-impersonation-targets,
 * seed-loyalty-users) with a single CSV/env-driven orchestrator over scripts/lib/user-provision.mjs.
 * Every account kind now shares one auth path, one idempotent create-or-reuse, one status model,
 * and — critically — ONE teardown that sweeps ALL sources (the coverage gap that used to orphan
 * b2b/users.csv logins is now structural).
 *
 * Usage:
 *   node scripts/seed-company-users.mjs [all|b2b|personal|imp|loyalty|cross-org|wl] [flags]
 *   flags: --teardown  --dry-run  --verbose  --allow-admin-writes-on-prod
 *          --only <token>   scope the cross-org membership step to rows whose membership_id /
 *                           user_email / alias contains <token> (leaves reserved fixtures untouched)
 *
 * Kinds:
 *   all        orgs + contacts + b2b logins + cross-org memberships + personal + white-labeling (default)
 *   b2b        the whole B2B graph: orgs (parent-child) + contacts + org-scoped logins + cross-org
 *   imp        just the impersonation subset: ORG-009..019 + CON/USR-020..022 (blocked/invited via status)
 *   cross-org  just organization-memberships.csv (multi-org members; orgs must already exist)
 *   personal   personal storefront accounts: env customer roles + agent-pool + test-users (no org)
 *   loyalty    just the loyalty personal users (VIP/Wholesale group)
 *   wl         white-labeling orgs + users (test-data/white-labeling/*.csv) — same org-scoped-role
 *              model as b2b (VCST-5028); shared by seed-white-labeling.mjs's user-provisioning step
 *              so there's ONE place that creates a WL org/contact/login/membership, not two
 *
 * Data sources: test-data/b2b/{organizations,contacts,users,organization-memberships,roles}.csv,
 * test-data/users/{agent-user-pool,test-users}.csv, test-data/white-labeling/{organizations,users}.csv,
 * and the .env.{ENV} role registry (user-roles.mjs).
 * Identity from .env.{ENV}; secrets from .env.local. Prod blocked by ENV_RISK=production.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACK_URL, ADMIN, ADMIN_PASSWORD, STORE_ID, ENV_RISK, ROOT, DATE,
  setFlags, authenticate, ensureMemberIndex, parseCsv,
  seedOrgs, seedContacts, relinkUsersToContacts, ensureRoles, provisionContactLogins, seedMemberships,
  personalUsers, ensurePersonalAccount, adminUsers, ensureAdminAccount, seedWhiteLabelingUsers,
  deleteUserByEmail, sweepAgentTestMembers, allSeededEmails, whiteLabelingSeededEmails,
  deleteWhiteLabelingOrgs, clearWhiteLabelingAliases, getApi,
} from '../../lib/user-provision.mjs';
import { writeEnvAliasOverride } from '../../lib/seed-common.mjs';
import { buildMembershipAliasUpdates } from './membership-alias-specs.mjs';

const args = process.argv.slice(2);
const KINDS = ['all', 'b2b', 'imp', 'cross-org', 'personal', 'loyalty', 'wl'];
const kind = KINDS.find(k => args.includes(k)) || 'all';
const TEARDOWN = args.includes('--teardown') || args.includes('teardown');
// --only <token> currently scopes the `cross-org` membership step only (membership_id / user_email /
// alias substring) — so a NEW cross-org fixture can be seeded without re-reconciling a reserved one
// that a parallel test lane is actively mutating.
const ONLY = args.includes('--only') ? args[args.indexOf('--only') + 1] : null;
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });

// The impersonation subset: the 11 many-orgs orgs PLUS TechFlow (ORG-002), which the blocked/
// invited targets (CON-021/CON-022) belong to. Contacts selected explicitly by id.
const IMP_ORG_IDS = new Set(['ORG-002','ORG-009','ORG-010','ORG-011','ORG-012','ORG-013','ORG-014','ORG-015','ORG-016','ORG-017','ORG-018','ORG-019']);
// CON-020..022 = impersonation TARGETS; CON-024 = the impersonation OPERATOR (org-maintainer @ ORG-002,
// incl. loginOnBehalf — provisioned CSV-native via provisionContactLogins like every other org member).
const IMP_CONTACT_IDS = new Set(['CON-020','CON-021','CON-022','CON-024']);

const readCsv = (rel) => { try { return parseCsv(readFileSync(join(ROOT, rel), 'utf-8')); } catch { return []; } };

// `--only <token>` for the ORG-GRAPH step (contacts.csv + users.csv), the counterpart of the
// membership step's own --only. Matches a contact/user row on contact_id / user_id / email / full_name
// and narrows the ORG set to just the orgs those contacts belong to.
//
// Why this matters: an unscoped `b2b` run re-provisions all 25 users.csv memberships — which, now that
// the reconcile is status-aware, REWRITES them. When you only need to add ONE fixture, that is a large
// unnecessary write across other lanes' data. Orgs are still resolved via seedOrgs, which reuses an
// existing org by pinned id and writes nothing unless the NAME drifted.
// Returns null when the token matches nothing, so the caller can abort instead of silently seeding all.
function orgGraphFiltersFor(token) {
  if (!token) return {};
  const t = token.toLowerCase();
  const hit = (r, keys) => keys.some((k) => String(r[k] ?? '').toLowerCase().includes(t));
  const contacts = readCsv('test-data/b2b/contacts.csv');
  const users = readCsv('test-data/b2b/users.csv');
  const selected = new Set([
    ...contacts.filter(r => hit(r, ['contact_id', 'email', 'full_name'])).map(r => r.contact_id),
    ...users.filter(r => hit(r, ['user_id', 'email', 'user_name', 'contact_id'])).map(r => r.contact_id),
  ].filter(Boolean));
  if (!selected.size) return null;
  const orgIds = new Set();
  for (const r of contacts) {
    if (!selected.has(r.contact_id)) continue;
    for (const o of String(r.org_id || '').split(';')) if (o.trim()) orgIds.add(o.trim());
  }
  console.log(`  --only "${token}" → ${selected.size} contact(s) [${[...selected].join(', ')}], ${orgIds.size} org(s) [${[...orgIds].join(', ')}]`);
  return { contactFilter: r => selected.has(r.contact_id), orgFilter: r => orgIds.has(r.org_id) };
}

// --- Seed the org graph (orgs → contacts → logins) for a given org/contact filter ---
async function seedOrgGraph({ orgFilter = null, contactFilter = null } = {}) {
  const orgsAll = readCsv('test-data/b2b/organizations.csv').filter(r => r.org_name);
  const contactsAll = readCsv('test-data/b2b/contacts.csv').filter(r => r.email && (r.seeded || '').toLowerCase() !== 'false');
  const orgsToSeed = orgFilter ? orgsAll.filter(orgFilter) : orgsAll;
  const allowedOrg = new Set(orgsToSeed.map(r => r.org_id));
  // With an explicit contactFilter (imp), use it; otherwise a contact is in-scope if ANY of its
  // (possibly multi-valued) orgs is being seeded.
  const contactsToSeed = contactFilter
    ? contactsAll.filter(contactFilter)
    : contactsAll.filter(r => (r.org_id || '').split(';').map(s => s.trim()).some(o => allowedOrg.has(o)));
  console.log(`  Plan: ${orgsToSeed.length} orgs, ${contactsToSeed.length} contacts`);

  // Two-pass for parent-child orgs: parents first, then children (need parent platform ids).
  const parents = orgsToSeed.filter(r => !r.parent_org_id);
  const children = orgsToSeed.filter(r => r.parent_org_id);
  const orgMap = await seedOrgs(parents);
  if (children.length) {
    const parentMap = Object.fromEntries(Object.entries(orgMap).map(([id, v]) => [id, v.platform_id]));
    Object.assign(orgMap, await seedOrgs(children, parentMap));
  }
  const contactMap = await seedContacts(contactsToSeed, orgMap);
  await relinkUsersToContacts(contactMap);
  await ensureRoles();
  await provisionContactLogins(contactMap, orgMap);
  return { orgs: Object.values(orgMap), contacts: Object.values(contactMap) };
}

// Seed the cross-org membership rows AND persist their runtime GUIDs (contact id, security-account
// id, per-org membership id) to aliases.<env>.json — the multi-env writeback rule. The alias name +
// per-org field come from the CSV's own `alias` / `membership_id_field` columns (see
// membership-alias-specs.mjs), so the CSV stays the single source of truth and only the aliases
// actually seeded in THIS run are rewritten.
async function seedCrossOrgMemberships() {
  const results = await seedMemberships({ only: ONLY });
  const updates = buildMembershipAliasUpdates(readCsv('test-data/b2b/organization-memberships.csv'), results);
  const names = Object.keys(updates);
  if (names.length) {
    writeEnvAliasOverride(updates);
    console.log(`  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: ${names.join(', ')}`);
  }
  return results;
}

async function seedPersonal(loyaltyOnly = false) {
  let users = personalUsers();
  if (loyaltyOnly) users = users.filter(u => u.group);
  console.log(`\n  ${users.length} personal account(s)${loyaltyOnly ? ' (loyalty)' : ''}...`);
  let created = 0, reused = 0;
  for (const u of users) { (await ensurePersonalAccount(u)) === 'created' ? created++ : reused++; }
  console.log(`  ✓ personal: ${created} created, ${reused} reused`);
  const report = { personal: users.map(u => ({ email: u.email, source: u.source, group: u.group || null })) };
  // Provisionable admin env-roles (provision=true, kind:admin) — created by NO other path. The
  // impersonation OPERATOR is NO LONGER here: it's a CSV-native B2B org member (users.csv USR-024),
  // seeded org-scoped via provisionContactLogins. This block stays for any future global admin fixture.
  if (!loyaltyOnly) {
    const admins = adminUsers();
    if (admins.length) {
      console.log(`\n  ${admins.length} admin account(s)...`);
      let aC = 0, aR = 0;
      for (const u of admins) { (await ensureAdminAccount(u)) === 'created' ? aC++ : aR++; }
      console.log(`  ✓ admin: ${aC} created, ${aR} reused`);
      report.admins = admins.map(u => ({ email: u.email, source: u.source }));
    }
  }
  return report;
}

// `wl` is the only kind with a scoped teardown today — its accounts are unambiguous (one CSV), and
// it removes its own orgs via deleteWhiteLabelingOrgs. Every other kind (including bare `--teardown`
// with no kind) runs the unified sweep, which now removes b2b orgs too: their platform_id is pinned
// in test-data/b2b/organizations.csv and forced on create, so a reseed restores the identical GUID —
// nothing needs to survive teardown for id-stability. A full teardown therefore leaves zero
// AGENT-TEST orgs behind — the VCST-5406 "one teardown, no orphan gap" goal, now including orgs.
async function runTeardown() {
  const scoped = kind === 'wl';
  const emails = scoped ? whiteLabelingSeededEmails() : allSeededEmails();
  console.log(`\n  Teardown${scoped ? ' (white-labeling only)' : ''}: ${emails.length} account(s)...`);
  let accounts = 0, contacts = 0;
  for (const email of emails) {
    const r = await deleteUserByEmail(email);
    if (r.account) accounts++;
    if (r.contact) contacts++;
  }
  console.log(`  Teardown: ${accounts} account(s) + ${contacts} contact(s)`);
  if (scoped) {
    const orgs = await deleteWhiteLabelingOrgs();
    const clearedAliases = clearWhiteLabelingAliases();
    console.log(`\n✅ White-labeling teardown complete — ${accounts} accounts, ${contacts} contacts, ${orgs} orgs removed${clearedAliases ? `, ${clearedAliases} stale alias(es) cleared` : ''}\n`);
    return;
  }
  const members = await sweepAgentTestMembers();
  console.log(`\n✅ Company-users teardown complete — ${accounts} accounts, ${contacts + members} members removed\n`);
}

async function run() {
  // Preflight: creds + prod gate.
  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) { console.error('Missing BACK_URL / ADMIN / ADMIN_PASSWORD in env'); process.exit(1); }
  if (ENV_RISK === 'production' && !args.includes('--allow-admin-writes-on-prod')) {
    console.error(`ABORT: ENV_RISK=production for ${new URL(BACK_URL).host} — refusing to seed. Pass --allow-admin-writes-on-prod to override.`);
    process.exit(2);
  }
  console.log(`\n🌱 Seed company users — kind: ${kind}${TEARDOWN ? ' [TEARDOWN]' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);

  await authenticate();
  await ensureMemberIndex(getApi());

  if (TEARDOWN) { await runTeardown(); return; }

  const report = { seedDate: DATE, kind, platform: BACK_URL, storeId: STORE_ID };
  if (kind === 'personal') {
    Object.assign(report, await seedPersonal(false));
  } else if (kind === 'loyalty') {
    Object.assign(report, await seedPersonal(true));
  } else if (kind === 'cross-org') {
    report.memberships = await seedCrossOrgMemberships();
  } else if (kind === 'imp') {
    // Seeds the impersonation TARGETS (CON-020..022) AND the OPERATOR (CON-024, org-maintainer @
    // ORG-002 incl. loginOnBehalf) — all via the generic org-graph + provisionContactLogins path.
    Object.assign(report, await seedOrgGraph({ orgFilter: r => IMP_ORG_IDS.has(r.org_id), contactFilter: r => IMP_CONTACT_IDS.has(r.contact_id) }));
  } else if (kind === 'b2b') {
    const filters = orgGraphFiltersFor(ONLY);
    if (filters === null) {
      console.error(`ABORT: --only "${ONLY}" matched no contacts.csv / users.csv row. Refusing to fall back to seeding the WHOLE org graph.`);
      process.exit(3);
    }
    Object.assign(report, await seedOrgGraph(filters));
    report.memberships = await seedCrossOrgMemberships();
  } else if (kind === 'wl') {
    Object.assign(report, await seedWhiteLabelingUsers());
  } else { // all
    Object.assign(report, await seedOrgGraph());
    report.memberships = await seedCrossOrgMemberships();
    Object.assign(report, await seedPersonal(false));
    report.whiteLabeling = await seedWhiteLabelingUsers();
  }

  // No _seed-results report (VCST-5406): live platform ids are written to aliases.{env}.json
  // by user-provision's syncEnvAliases/writeLiveIdAliases (every env incl. vcst); the rest
  // resolves by static business key (email / org name) from the committed CSVs.
  console.log(`\n✅ Company-users seed complete (kind=${kind})\n`);
}

run().catch(e => { console.error(`\n❌ Seed failed: ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
