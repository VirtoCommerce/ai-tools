#!/usr/bin/env node
/**
 * scripts/seed-white-labeling.mjs
 *
 * Idempotent seeder for White Labeling test data from test-data/white-labeling/*.csv.
 * Replaces the all-manual Admin-SPA setup-guide.md with a reusable script.
 *
 * Seeds two independent surfaces (verified against vc-module-content, vc-module-white-labeling):
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
 *
 * Orgs + users are NOT provisioned here (VCST-5406 follow-up) — that's a "company users"
 * concern, so it's delegated to scripts/lib/user-provision.mjs's seedWhiteLabelingUsers(),
 * the SAME function seed-company-users.mjs's `wl` kind calls. This script only reuses that
 * function's resulting orgMap (org platform ids) to write the WL config in step 2, sharing
 * seed-common's already-authenticated api() with user-provision.mjs via __setApi() so there's
 * one token and one CRUD surface for the whole run.
 *
 * USAGE:
 *   node scripts/seed-white-labeling.mjs [--dry-run] [--verbose] [--teardown]
 *   node scripts/seed-white-labeling.mjs --skip-users   # link lists + WL config only, no org/user provisioning
 * Safety: ENV_RISK gate (blocks ENV_RISK=production unless --allow-admin-writes-on-prod); idempotent by list name, org name, user email.
 * Writes test-data/_seed-results-wl-{DATE}.json
 */
import {
  assertSafeTarget, auth, api, loadCsv, writeResults, log, verbose,
  STORE_ID, DATE_STAMP, DRY_RUN, VERBOSE, TEARDOWN, BACK_URL,
} from '../lib/seed-common.mjs';
import {
  __setApi, setFlags, seedOrgs, ensureRoles, seedInlineOrgUsers,
  writeLiveIdAliases, buildWhiteLabelingAliasEntries,
} from '../lib/user-provision.mjs';

const SKIP_USERS = process.argv.slice(2).includes('--skip-users');
const LANG = 'en-US';
const WL_USERS_CSV = 'test-data/white-labeling/users.csv';

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
  log(`Teardown complete — ${deleted} link list(s) removed. (Orgs/users are shared "company users" — run "npm run seed:company-users:teardown" to remove those.)`);
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 White-labeling seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await auth();
  setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
  __setApi(api); // share seed-common's already-authenticated client with user-provision.mjs — one token, one CRUD surface

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

  // 2. Orgs (via the shared company-users library — seedOrgs is idempotent by name/platform_id)
  // + white-labeling config. Reusing the same orgMap in step 3 means orgs are only ever seeded ONCE
  // per run, whether org/user provisioning happens here or via `npm run seed:company-users wl`.
  log('Organizations:');
  const orgRows = loadCsv('test-data/white-labeling/organizations.csv');
  const orgMap = await seedOrgs(orgRows);
  log('White-labeling config:');
  for (const row of orgRows) {
    const orgId = orgMap[row.org_id]?.platform_id;
    const main = (row.main_menu_link_list_name || '').trim();
    const footer = (row.footer_link_list_name || '').trim();
    const theme = (row.theme_preset || '').trim(); // must be one of the platform's WhiteLabeling.ThemePresetNames dictionary values — case-sensitive
    const logo = (row.logo_url || '').trim();
    const secondaryLogo = (row.secondary_logo_url || '').trim();
    const favicon = (row.favicon_url || '').trim();
    if (!main && !footer && !theme && !logo && !secondaryLogo && !favicon) { verbose(`  (no WL config for ${row.org_name} — fallback org)`); results.orgs.push({ name: row.org_name, id: orgId, wl: false }); continue; }
    if (orgId && !String(orgId).startsWith('dry-')) {
      const existing = await api('GET', `/api/white-labeling/organization/${orgId}`, null, { expectStatus: [200, 204, 404] });
      const body = {
        organizationId: orgId, isEnabled: true,
        mainMenuLinkListName: main || null, footerLinkListName: footer || null, themePresetName: theme || null,
        logoUrl: logo || null, secondaryLogoUrl: secondaryLogo || null, faviconUrl: favicon || null,
      };
      if (existing && existing.id) { body.id = existing.id; await api('PUT', '/api/white-labeling', body, { expectStatus: [200, 204] }); }
      else { await api('POST', '/api/white-labeling', body, { expectStatus: [200, 201] }); }
      log(`  ✓ WL config: ${row.org_name} (menu=${main || '—'}, footer=${footer || '—'}, theme=${theme || '—'}, logo=${logo ? 'set' : '—'}, secondaryLogo=${secondaryLogo ? 'set' : '—'}, favicon=${favicon ? 'set' : '—'})`);
    }
    results.orgs.push({ name: row.org_name, id: orgId, wl: true });
  }

  // 3. Users — delegates to the shared company-users provisioning (the same seedInlineOrgUsers
  // that seed-company-users.mjs's `wl` kind calls via seedWhiteLabelingUsers()), so there's one
  // place that creates a white-labeling org/contact/login/membership, not two.
  if (SKIP_USERS) {
    log('Users: skipped (--skip-users)');
  } else {
    log('Users:');
    await ensureRoles(); // idempotent PUT of test-data/b2b/roles.csv — WL users get real org-scoped roles too
    const userRows = loadCsv(WL_USERS_CSV);
    const { idByEmail, ...userCounts } = await seedInlineOrgUsers(userRows, orgMap);
    const written = writeLiveIdAliases(buildWhiteLabelingAliasEntries(orgRows, userRows, orgMap, idByEmail));
    if (written) log(`aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${written} live platform id alias(es)`);
    results.users = userRows.map((r) => ({ email: r.email, org_id: r.org_id }));
    Object.assign(results, { userAccounts: userCounts.accounts, userMemberships: userCounts.memberships });
  }

  writeResults(`test-data/_seed-results-wl-${DATE_STAMP}.json`, {
    seededAt: new Date().toISOString(), target: BACK_URL, storeId: STORE_ID, ...results,
  });
  console.log(`\n✅ White-labeling seed complete — ${results.linkLists.length} link lists, ${results.orgs.length} orgs, ${results.users.length} users.`);
}

main().catch((err) => { console.error(`\n❌ White-labeling seed failed: ${err.message}`); process.exit(1); });
