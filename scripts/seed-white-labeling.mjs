#!/usr/bin/env node
/**
 * scripts/seed-white-labeling.mjs
 *
 * Idempotent seeder for White Labeling test data from test-data/white-labeling/*.csv.
 * Replaces the all-manual Admin-SPA setup-guide.md with a reusable script.
 *
 * Seeds three independent surfaces (verified against vc-module-content,
 * vc-module-white-labeling, vc-platform source):
 *
 *  1. Menu link lists — route `api/cms/{storeId}/menu` (vc-module-content).
 *       GET (list, array), POST (upsert → 204), DELETE ?listIds=.
 *       The model is FLAT (a MenuLink has no parent). Nesting is by convention: a
 *       dropdown is its OWN list whose NAME equals the parent link's TITLE. So a
 *       link-lists.csv row with a parent_title becomes a member of a separate list
 *       named after that parent_title. This seeder performs that reshape.
 *  2. White-labeling org config — route `api/white-labeling` (vc-module-white-labeling).
 *       A separate WhiteLabelingSetting entity keyed by organizationId (NOT a member
 *       field, NOT dynamic properties). GET /organization/{id}; POST if absent (→200),
 *       else PUT (→204). Validator: exactly one of storeId/organizationId; can't change
 *       the key on update — so GET-first then PUT the same key.
 *  3. Orgs + users — orgs/contacts via POST /api/members (same pattern as
 *       seed-b2b-fixtures.mjs); storefront login via POST /api/platform/security/users/create
 *       with memberId = the contact id. User creation is best-effort (per-user try/catch);
 *       the exact required-field set is environment/Identity-policy dependent.
 *
 * USAGE:
 *   node scripts/seed-white-labeling.mjs [--dry-run] [--verbose] [--teardown]
 *   node scripts/seed-white-labeling.mjs --skip-users   # link lists + WL config only
 * Safety: ENV_RISK gate (blocks ENV_RISK=production unless --allow-admin-writes-on-prod); idempotent by list name, org name, user email.
 * Writes test-data/_seed-results-wl-{DATE}.json
 */
import {
  assertSafeTarget, auth, api, loadCsv, writeResults, log, verbose,
  STORE_ID, DATE_STAMP, DRY_RUN, TEARDOWN, BACK_URL,
} from './lib/seed-common.mjs';

const SKIP_USERS = process.argv.slice(2).includes('--skip-users');
const LANG = 'en-US';

// --- Reshape link-lists.csv into flat MenuLinkLists (one extra list per parent_title) ---
function buildLinkLists(rows) {
  const lists = new Map(); // name -> [{title,url,priority}]
  const add = (name, title, url, priority) => {
    if (!name || !title) return;
    if (!lists.has(name)) lists.set(name, []);
    lists.get(name).push({ title, url, priority: Number(priority) || 1 });
  };
  for (const r of rows) {
    const parent = (r.parent_title || '').trim();
    add(parent || (r.list_name || '').trim(), r.link_title, r.link_url, r.priority);
  }
  return lists;
}

async function getMenus(storeId) {
  const r = await api('GET', `/api/cms/${storeId}/menu`, null, { expectStatus: [200, 204, 404] });
  return Array.isArray(r) ? r : [];
}

// --- Members (orgs/contacts) ---
async function findMember(memberType, keyword, matchFn) {
  const r = await api('POST', '/api/members/search', { memberType, keyword, take: 50 });
  return (r?.results || []).find(matchFn) || null;
}
async function ensureOrg(name) {
  const found = await findMember('Organization', name, (o) => o.name === name);
  if (found) { verbose(`↻ org: ${name} (${found.id})`); return found; }
  const created = await api('POST', '/api/members', { memberType: 'Organization', name, status: 'Approved' }, { expectStatus: [200, 201] });
  log(`  ✓ org: ${name} (${created?.id})`);
  return created;
}
async function ensureContact(email, fullName, orgId) {
  const found = await findMember('Contact', email, (c) => (c.emails || []).includes(email) || c.name === fullName);
  if (found) { verbose(`↻ contact: ${email} (${found.id})`); return found; }
  const created = await api('POST', '/api/members', {
    memberType: 'Contact', name: fullName, fullName, organizations: orgId ? [orgId] : [], emails: [email], status: 'Approved',
  }, { expectStatus: [200, 201] });
  log(`  ✓ contact: ${email} (${created?.id})`);
  return created;
}
async function ensureUser(email, password, memberId) {
  const existing = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] });
  if (existing && existing.id) { verbose(`↻ user: ${email}`); return existing; }
  const res = await api('POST', '/api/platform/security/users/create', {
    userName: email, email, password, memberId, storeId: STORE_ID, userType: 'Customer', isAdministrator: false,
  }, { expectStatus: [200, 201] });
  if (res && res.succeeded === false) throw new Error(`account rejected: ${JSON.stringify(res.errors || []).slice(0, 200)}`);
  log(`  ✓ user: ${email}`);
  return res;
}

async function teardown() {
  log('Teardown — deleting WL link lists by name...');
  const linkRows = loadCsv('test-data/white-labeling/link-lists.csv');
  const lists = buildLinkLists(linkRows);
  const menus = await getMenus(STORE_ID);
  let deleted = 0;
  for (const name of lists.keys()) {
    const found = menus.find((m) => m.name === name && (m.language || LANG) === LANG);
    if (!found) { verbose(`not present: ${name}`); continue; }
    await api('DELETE', `/api/cms/${STORE_ID}/menu?listIds=${encodeURIComponent(found.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✓ Deleted link list: ${name}`);
    deleted++;
  }
  log(`Teardown complete — ${deleted} link list(s) removed. (Orgs/users/WL-config left in place — shared fixtures.)`);
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 White-labeling seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await auth();

  if (TEARDOWN) { await teardown(); return; }

  const results = { linkLists: [], orgs: [], users: [] };

  // 1. Link lists
  log('Link lists:');
  const linkRows = loadCsv('test-data/white-labeling/link-lists.csv');
  const lists = buildLinkLists(linkRows);
  const menus = await getMenus(STORE_ID);
  for (const [name, menuLinks] of lists) {
    const existing = menus.find((m) => m.name === name && (m.language || LANG) === LANG);
    const body = { name, storeId: STORE_ID, language: LANG, menuLinks };
    if (existing?.id) body.id = existing.id;
    await api('POST', `/api/cms/${STORE_ID}/menu`, body, { expectStatus: [200, 201, 204] });
    log(`  ${existing ? '↻' : '✓'} ${name} (${menuLinks.length} links)`);
    results.linkLists.push({ name, links: menuLinks.length, updated: !!existing });
  }

  // 2. Orgs + white-labeling config
  log('Organizations + WL config:');
  const orgRows = loadCsv('test-data/white-labeling/organizations.csv');
  for (const row of orgRows) {
    const org = await ensureOrg(row.org_name);
    const orgId = org?.id;
    const main = (row.main_menu_link_list_name || '').trim();
    const footer = (row.footer_link_list_name || '').trim();
    if (!main && !footer) { verbose(`  (no WL config for ${row.org_name} — fallback org)`); results.orgs.push({ name: row.org_name, id: orgId, wl: false }); continue; }
    if (orgId && !String(orgId).startsWith('dry-')) {
      const existing = await api('GET', `/api/white-labeling/organization/${orgId}`, null, { expectStatus: [200, 204, 404] });
      const body = { organizationId: orgId, isEnabled: true, mainMenuLinkListName: main || null, footerLinkListName: footer || null };
      if (existing && existing.id) { body.id = existing.id; await api('PUT', '/api/white-labeling', body, { expectStatus: [200, 204] }); }
      else { await api('POST', '/api/white-labeling', body, { expectStatus: [200, 201] }); }
      log(`  ✓ WL config: ${row.org_name} (menu=${main || '—'}, footer=${footer || '—'})`);
    }
    results.orgs.push({ name: row.org_name, id: orgId, wl: true });
  }

  // 3. Users
  if (SKIP_USERS) {
    log('Users: skipped (--skip-users)');
  } else {
    log('Users:');
    const userRows = loadCsv('test-data/white-labeling/users.csv');
    for (const row of userRows) {
      try {
        const org = row.organization ? await ensureOrg(row.organization) : null;
        const fullName = [row.first_name, row.last_name].filter(Boolean).join(' ') || row.email;
        const contact = await ensureContact(row.email, fullName, org?.id);
        if (contact?.id && !String(contact.id).startsWith('dry-')) {
          await ensureUser(row.email, row.password || 'Test123!', contact.id);
        }
        results.users.push({ email: row.email, org: row.organization, contactId: contact?.id });
      } catch (err) {
        log(`  ⚠ user ${row.email} failed: ${err.message.slice(0, 160)}`);
        results.users.push({ email: row.email, error: err.message.slice(0, 160) });
      }
    }
  }

  writeResults(`test-data/_seed-results-wl-${DATE_STAMP}.json`, {
    seededAt: new Date().toISOString(), target: BACK_URL, storeId: STORE_ID, ...results,
  });
  console.log(`\n✅ White-labeling seed complete — ${results.linkLists.length} link lists, ${results.orgs.length} orgs, ${results.users.length} users.`);
}

main().catch((err) => { console.error(`\n❌ White-labeling seed failed: ${err.message}`); process.exit(1); });
