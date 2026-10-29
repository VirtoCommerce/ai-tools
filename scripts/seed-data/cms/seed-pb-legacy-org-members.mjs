#!/usr/bin/env node
/**
 * scripts/seed-data/cms/seed-pb-legacy-org-members.mjs  (seed:pb-legacy-members)
 *
 * VCST-6442: provisions one AGENT-TEST storefront reader per PRE-EXISTING organization that legacy
 * duplicate-permalink Page Builder pages are targeted at, so xAPI slugInfo on those pages stops
 * returning null for every account. Spec + rationale: ./pb-legacy-org-members-specs.mjs.
 *
 * Writes ONLY: a new contact (+ its groups), a new security account and an org-scoped
 * OrganizationMembership, all for an agent-test-* email. It never writes the legacy pages or
 * the organizations. The organization is resolved by EXACT name and must be unique, or the run aborts.
 *
 *   TEST_ENV=vcptcore npm run seed:pb-legacy-members [-- --dry-run --verbose]
 *   TEST_ENV=vcptcore npm run seed:pb-legacy-members -- --verify   # sign-in + me.organizationId + live page tie
 *   TEST_ENV=vcptcore npm run seed:pb-legacy-members:teardown
 *
 * Runtime GUIDs (userId, contactId, org_id, membership_id) go to aliases.<env>.json.
 * --verify exits non-zero when a member cannot sign in, lands org-less, or its tie is gone.
 */
import '../../lib/sync-stdio.mjs';
import {
  BACK_URL, STORE_ID, ENV_RISK, setFlags, authenticate, getApi,
  ensureMembershipContact, findContactById, ensureSecurityAccount, stripSeededGlobalRoles,
  searchMemberships, ensureOrgMembership, deleteUserByEmail, findUserByEmail, resolvePassword, findContactByEmail,
} from '../../lib/user-provision.mjs';
import { writeEnvAliasOverride } from '../../lib/seed-common.mjs';
import { MEMBERS, PAGES_STORE_ID, PASSWORD_TOKEN, MEMBER_ROLE_ID, validateSpecs, checkTargetsLive } from './pb-legacy-org-members-specs.mjs';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');
const TEARDOWN = args.includes('--teardown');
const VERIFY = args.includes('--verify');
setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });

const api = (...a) => getApi()(...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function retryFetch(url, init, n = 4) {
  let err;
  for (let i = 0; i < n; i++) {
    try { return await fetch(url, init); } catch (e) { err = e; await sleep(1500 * (i + 1)); }
  }
  throw err;
}

// The org is resolved FROM THE TARGET PAGES (the org that owns the declared tie), then cross-checked
// by exact name. Name alone is not unique on vcptcore ("Automation Testing Corp" exists twice,
// measured 2026-10-28), and a member of the namesake org would sign in fine and still see nothing.
async function resolveOrg(m, pages) {
  const owners = new Set();
  for (const t of m.targets) {
    for (const p of pages) {
      if (p.permalink === t.permalink && p.status === 'Published' && p.organizationId
        && (t.cultureName == null || p.cultureName === t.cultureName)) owners.add(p.organizationId);
    }
  }
  const named = [];
  for (const id of owners) {
    const org = await api('GET', `/api/members/${id}`, null, { expectStatus: [200, 204, 404] }).catch(() => null);
    if (org?.memberType === 'Organization' && org.name === m.orgName) named.push(org);
  }
  if (named.length !== 1) throw new Error(`${m.alias}: ${named.length} organization(s) named "${m.orgName}" own a declared target page, need exactly 1 — refusing to guess`);
  return named[0];
}

async function ensureGroups(contactId, groups) {
  if (!groups.length || String(contactId).startsWith('dry-')) return;
  const c = await findContactById(contactId);
  if (!c) throw new Error(`contact ${contactId} not found after create`);
  const have = new Set(c.groups || []);
  const missing = groups.filter((g) => !have.has(g));
  if (!missing.length) return;
  if (DRY_RUN) { console.log(`    [DRY RUN] would add group(s) ${missing.join(', ')} to ${contactId}`); return; }
  c.groups = [...have, ...missing];
  await api('PUT', '/api/members', c, { expectStatus: [200, 204] });
  console.log(`    ↻ groups contact ${contactId} → +${missing.join(', ')}`);
}

async function seedOne(m, pages) {
  console.log(`\n  ${m.alias} (${m.email}) → "${m.orgName}"`);
  const org = await resolveOrg(m, pages);
  const contactId = await ensureMembershipContact(m.email, m.firstName, m.lastName, [org.id]);
  await ensureGroups(contactId, m.groups);
  const userId = await ensureSecurityAccount(m.email, resolvePassword(PASSWORD_TOKEN), contactId, 'Approved', { reconcilePassword: true });
  await stripSeededGlobalRoles(m.email);
  if (String(userId).startsWith('dry-')) return null;
  const membershipId = await ensureOrgMembership(userId, org.id, org.name, MEMBER_ROLE_ID, await searchMemberships(userId), false, m.email, 'Approved');
  console.log(`    ✓ ${m.alias}: user ${userId}, contact ${contactId}, org ${org.id}, membership ${membershipId}`);
  return { userId, contactId, org_id: org.id, membership_id: membershipId };
}

async function loadStorePages() {
  const out = [];
  for (let skip = 0; ; skip += 200) {
    const r = await api('POST', '/api/page-builder-pages/search', { storeId: PAGES_STORE_ID, skip, take: 200 }, { expectStatus: [200] });
    const batch = r?.results || [];
    out.push(...batch);
    if (batch.length < 200) break;
  }
  return out;
}

async function verifyOne(m, pages) {
  const problems = [];
  const org = await resolveOrg(m, pages);
  problems.push(...checkTargetsLive(m, org.id, pages));
  const form = new URLSearchParams({ grant_type: 'password', username: m.email, password: resolvePassword(PASSWORD_TOKEN), storeId: STORE_ID });
  const tr = await retryFetch(`${BACK_URL}/connect/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  const tj = await tr.json().catch(() => ({}));
  if (tr.status !== 200 || !tj.access_token) { problems.push(`${m.alias}: /connect/token HTTP ${tr.status} ${tj.error || ''}`); return problems; }
  const q = '{ me { id contact { id organizationId groups organizations { items { id name } } } } }';
  const gr = await retryFetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${tj.access_token}` }, body: JSON.stringify({ query: q }) });
  const gj = await gr.json().catch(() => ({}));
  const c = gj?.data?.me?.contact;
  console.log(`    ${m.alias}: token 200, me.contact.organizationId=${c?.organizationId} groups=${JSON.stringify(c?.groups)} orgs=${JSON.stringify((c?.organizations?.items || []).map((o) => o.name))}`);
  if (gj.errors?.length) problems.push(`${m.alias}: xAPI errors ${JSON.stringify(gj.errors.map((e) => e.message))}`);
  if (c?.organizationId !== org.id) problems.push(`${m.alias}: me.contact.organizationId=${c?.organizationId}, expected ${org.id}`);
  for (const g of m.groups) if (!(c?.groups || []).includes(g)) problems.push(`${m.alias}: contact group ${g} missing in xAPI me`);
  return problems;
}

async function run() {
  if (!BACK_URL) { console.error('Missing BACK_URL'); process.exit(1); }
  if (ENV_RISK === 'production') { console.error(`ABORT: ENV_RISK=production for ${new URL(BACK_URL).host}`); process.exit(2); }
  if (STORE_ID !== PAGES_STORE_ID) { console.error(`ABORT: STORE_ID=${STORE_ID}, but the legacy pages live on ${PAGES_STORE_ID}`); process.exit(2); }
  const specProblems = validateSpecs();
  if (specProblems.length) { console.error(`ABORT: spec invalid:\n   - ${specProblems.join('\n   - ')}`); process.exit(3); }
  console.log(`\n🌱 PB legacy org members (VCST-6442)${TEARDOWN ? ' [TEARDOWN]' : ''}${VERIFY ? ' [VERIFY]' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}\n   Target: ${BACK_URL} | Store: ${STORE_ID}`);
  await authenticate();

  if (TEARDOWN) {
    for (const m of MEMBERS) await deleteUserByEmail(m.email);
    if (DRY_RUN) return;
    await sleep(2000);
    let residue = 0;
    for (const m of MEMBERS) {
      if (await findUserByEmail(m.email)) { residue++; console.log(`    ✗ residue account ${m.email}`); }
      if (await findContactByEmail(m.email)) { residue++; console.log(`    ✗ residue contact ${m.email}`); }
    }
    if (residue) { console.error(`\n❌ teardown left ${residue} residue item(s)`); process.exit(1); }
    writeEnvAliasOverride(Object.fromEntries(MEMBERS.map((m) => [m.alias, { userId: null, contactId: null, org_id: null, membership_id: null }])));
    console.log('\n✅ teardown complete — zero residue; alias runtime ids nulled');
    return;
  }

  const pages = await loadStorePages();
  if (!VERIFY) {
    const updates = {};
    for (const m of MEMBERS) { const r = await seedOne(m, pages); if (r) updates[m.alias] = r; }
    writeEnvAliasOverride(updates);
    if (Object.keys(updates).length) console.log(`\n  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: ${Object.keys(updates).join(', ')}`);
    if (DRY_RUN) { console.log('\n✅ dry run complete'); return; }
  }

  console.log('\n  Verifying (sign-in + me.organizationId + live duplicate-page tie)...');
  const problems = [];
  for (const m of MEMBERS) problems.push(...await verifyOne(m, pages));
  if (problems.length) { console.error(`\n❌ verify failed:\n   - ${problems.join('\n   - ')}`); process.exit(1); }
  console.log('\n✅ PB legacy org members provisioned and verified');
}

run().catch((e) => { console.error(`\n❌ ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
