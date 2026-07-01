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
 *   node scripts/seed-company-users.mjs [all|b2b|personal|imp|loyalty|cross-org] [flags]
 *   flags: --teardown  --dry-run  --verbose  --allow-admin-writes-on-prod
 *
 * Kinds:
 *   all        orgs + contacts + b2b logins + cross-org memberships + personal accounts (default)
 *   b2b        the whole B2B graph: orgs (parent-child) + contacts + org-scoped logins + cross-org
 *   imp        just the impersonation subset: ORG-009..019 + CON/USR-020..022 (blocked/invited via status)
 *   cross-org  just organization-memberships.csv (multi-org members; orgs must already exist)
 *   personal   personal storefront accounts: env customer roles + agent-pool + test-users (no org)
 *   loyalty    just the loyalty personal users (VIP/Wholesale group)
 *
 * Data sources: test-data/b2b/{organizations,contacts,users,organization-memberships,roles}.csv,
 * test-data/users/{agent-user-pool,test-users}.csv, and the .env.{ENV} role registry (user-roles.mjs).
 * Identity from .env.{ENV}; secrets from .env.local. Prod blocked by ENV_RISK=production.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import {
  BACK_URL, ADMIN, ADMIN_PASSWORD, STORE_ID, ENV_RISK, ROOT, DATE,
  setFlags, authenticate, ensureMemberIndex, parseCsv,
  seedOrgs, seedContacts, relinkUsersToContacts, ensureRoles, provisionContactLogins, seedMemberships,
  personalUsers, ensurePersonalAccount, adminUsers, ensureAdminAccount,
  deleteUserByEmail, sweepAgentTestMembers, allSeededEmails, getApi,
} from '../lib/user-provision.mjs';

const args = process.argv.slice(2);
const KINDS = ['all', 'b2b', 'imp', 'cross-org', 'personal', 'loyalty'];
const kind = KINDS.find(k => args.includes(k)) || 'all';
const TEARDOWN = args.includes('--teardown') || args.includes('teardown');
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });

// The impersonation subset: the 11 many-orgs orgs PLUS TechFlow (ORG-002), which the blocked/
// invited targets (CON-021/CON-022) belong to. Contacts selected explicitly by id.
const IMP_ORG_IDS = new Set(['ORG-002','ORG-009','ORG-010','ORG-011','ORG-012','ORG-013','ORG-014','ORG-015','ORG-016','ORG-017','ORG-018','ORG-019']);
const IMP_CONTACT_IDS = new Set(['CON-020','CON-021','CON-022']);

const readCsv = (rel) => { try { return parseCsv(readFileSync(join(ROOT, rel), 'utf-8')); } catch { return []; } };

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

async function seedPersonal(loyaltyOnly = false) {
  let users = personalUsers();
  if (loyaltyOnly) users = users.filter(u => u.group);
  console.log(`\n  ${users.length} personal account(s)${loyaltyOnly ? ' (loyalty)' : ''}...`);
  let created = 0, reused = 0;
  for (const u of users) { (await ensurePersonalAccount(u)) === 'created' ? created++ : reused++; }
  console.log(`  ✓ personal: ${created} created, ${reused} reused`);
  const report = { personal: users.map(u => ({ email: u.email, source: u.source, group: u.group || null })) };
  // Provisionable admin env-roles (IMPERSONATION_ADMIN, …) — created by NO other path before this.
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

async function runTeardown() {
  const emails = allSeededEmails();
  console.log(`\n  Teardown: ${emails.length} account(s) across users.csv + memberships.csv + personal...`);
  let accounts = 0, contacts = 0;
  for (const email of emails) {
    const r = await deleteUserByEmail(email);
    if (r.account) accounts++;
    if (r.contact) contacts++;
  }
  console.log(`  Teardown: ${accounts} account(s) + ${contacts} contact(s)`);
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
    report.memberships = await seedMemberships();
  } else if (kind === 'imp') {
    Object.assign(report, await seedOrgGraph({ orgFilter: r => IMP_ORG_IDS.has(r.org_id), contactFilter: r => IMP_CONTACT_IDS.has(r.contact_id) }));
  } else if (kind === 'b2b') {
    Object.assign(report, await seedOrgGraph());
    report.memberships = await seedMemberships();
  } else { // all
    Object.assign(report, await seedOrgGraph());
    report.memberships = await seedMemberships();
    Object.assign(report, await seedPersonal(false));
  }

  if (!DRY_RUN) {
    const out = join(ROOT, `test-data/b2b/_seed-results-company-users-${DATE}.json`);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, JSON.stringify(report, null, 2));
    console.log(`\nResults: ${out}`);
  }
  console.log(`\n✅ Company-users seed complete (kind=${kind})\n`);
}

run().catch(e => { console.error(`\n❌ Seed failed: ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
