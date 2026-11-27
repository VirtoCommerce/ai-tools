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
 *       Logo/secondary/favicon BYTES are uploaded here too (not just the config URL): a
 *       row's `logo_source`/`secondary_logo_source`/`favicon_source` (a path under test-data/)
 *       is POSTed to `api/assets?folderUrl=customization[/favicons]` — the same endpoint the
 *       admin blades use — plus its sibling `{stem}_<size>.<ext>` thumbnails (admin tile 64x64
 *       + the WL xAPI favicon set 16/32/96/128/196), so both surfaces render with no 404s.
 *       Idempotent: reuses an already-serving config URL unless --reupload-assets.
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
 *   node scripts/seed-white-labeling.mjs --skip-users        # link lists + WL config only, no org/user provisioning
 *   node scripts/seed-white-labeling.mjs --reupload-assets   # force re-upload logo/favicon bytes even if the current URL serves
 *   node scripts/seed-white-labeling.mjs --disposable        # FR-3: re-arm ONE disposable org + maintainer + DISABLED record
 *   node scripts/seed-white-labeling.mjs --disposable --teardown  # remove it (its records stay, disabled: no REST delete)
 *
 * What a flat row cannot say (the enabled-but-empty record, live image URLs → overlay, the disposable triple, the
 * store without white labeling) lives in the side-effect-free white-labeling-specs.mjs, shared with the drift
 * guard validate-white-labeling-data.mjs (npm run td:validate:white-labeling).
 * Safety: ENV_RISK gate (blocks ENV_RISK=production unless --allow-admin-writes-on-prod); idempotent by list name, org name, user email.
 * No _seed-results report is written (VCST-5406) — live platform ids go to aliases.{env}.json.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename, extname, dirname } from 'node:path';
import {
  assertSafeTarget, auth, api, loadCsv, log, verbose,
  uploadAsset, assetUrlOk, ROOT, loadAliases, writeEnvAliasOverride, verifyRemoved,
  STORE_ID, DRY_RUN, VERBOSE, TEARDOWN, BACK_URL, TEST_ENV,
} from '../../lib/seed-common.mjs';
import {
  __setApi, __setStoreRoot, setFlags, seedOrgs, ensureRoles, seedInlineOrgUsers,
  writeLiveIdAliases, buildWhiteLabelingAliasEntries, deleteUserByEmail, findUserByEmail, findMemberById,
} from '../../lib/user-provision.mjs';
import {
  ORGS_FILE, recordPlan, emptyRecordBody, isEnabledEmptyRecord, liveUrlColumns, overlayUpdatesFor,
  disposableRows, disposableOverlay, isDisposableOrgName, isDisposableEmail, DISPOSABLE,
  STORE_WITHOUT_WL_ALIAS, pickStoreWithoutWl,
} from './white-labeling-specs.mjs';

const SKIP_USERS = process.argv.slice(2).includes('--skip-users');
const DISPOSABLE_MODE = process.argv.slice(2).includes('--disposable');
const REUPLOAD_ASSETS = process.argv.slice(2).includes('--reupload-assets');
const LANG = 'en-US';
const WL_USERS_CSV = 'test-data/white-labeling/users.csv';
const TS = Date.now();

// Asset upload mirrors the WL admin blades (vc-module-white-labeling): logo/secondary →
// folderUrl=customization, favicon → customization/favicons; stored name {kind}_{orgId}_{ts}.{ext}.
const ASSET_FOLDER = { logo: 'customization', secondary: 'customization', favicon: 'customization/favicons' };
const ASSET_PREFIX = { logo: 'logo', secondary: 'secondary_logo', favicon: 'favicon' };
const CONTENT_TYPE = { '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };

/**
 * Resolve one WL asset URL for an org. If `sourceRel` (a path under test-data/) is given, upload
 * the base file + its sibling `{stem}_<size>.<ext>` derivatives to the platform asset store and
 * return the served base URL. Derivatives are re-named to `{storedBaseStem}_<size>.<ext>` so they
 * match exactly what the admin blade (64x64) and the WL xAPI favicon set (16/32/96/128/196) request.
 * Idempotent: if `currentUrl` already serves 200 (and not --reupload-assets), reuse it — no dupes.
 * With no source, falls back to `currentUrl` (a pre-resolved URL from the CSV/config).
 */
async function resolveAsset(kind, sourceRel, orgId, currentUrl) {
  if (!sourceRel) return currentUrl || null;
  const abs = join(ROOT, 'test-data', sourceRel);
  if (!existsSync(abs)) { log(`  ⚠ ${kind} source missing: ${sourceRel} — keeping current URL`); return currentUrl || null; }
  if (!REUPLOAD_ASSETS && (await assetUrlOk(currentUrl))) { verbose(`${kind}: current URL still serves — reuse`); return currentUrl; }

  const ext = extname(abs);
  const ct = CONTENT_TYPE[ext.toLowerCase()] || 'application/octet-stream';
  const folder = ASSET_FOLDER[kind];
  const base = await uploadAsset(folder, `${ASSET_PREFIX[kind]}_${orgId}_${TS}${ext}`, readFileSync(abs), ct);
  const storedStem = basename(base.name || base.url.split('/').pop(), ext);

  const stem = basename(abs, ext);
  const dir = dirname(abs);
  let derivs = 0;
  for (const f of readdirSync(dir)) {
    if (f === basename(abs) || !f.startsWith(`${stem}_`) || !f.endsWith(ext)) continue;
    const size = f.slice(stem.length + 1, -ext.length); // e.g. "64x64", "16x16"
    await uploadAsset(folder, `${storedStem}_${size}${ext}`, readFileSync(join(dir, f)), ct);
    derivs++;
  }
  log(`  ⬆ ${kind}: ${base.url}${derivs ? ` (+${derivs} thumbnail${derivs > 1 ? 's' : ''})` : ''}`);
  return base.url;
}

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
    // Safety: only delete AGENT-TEST- link lists, never a real store menu that shares a name.
    if (!String(name).startsWith('AGENT-TEST')) { verbose(`skip ${name}: not an AGENT-TEST link list`); continue; }
    const found = menus.find((m) => m.name === name && (m.language || LANG) === LANG);
    if (!found) { verbose(`not present: ${name}`); continue; }
    await api('DELETE', `/api/cms/${STORE_ID}/menu?listIds=${encodeURIComponent(found.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✓ Deleted link list: ${name}`);
    deleted++;
  }
  log(`Teardown complete — ${deleted} link list(s) removed. (Orgs/users are shared "company users" — run "npm run seed:company-users:teardown" to remove those.)`);
}

// --- Overlay helpers -------------------------------------------------------------------------------
function readEnvOverlay() {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}

/** GET /api/white-labeling/organization/{id} — null when the organization has no record (200 null body). */
const getOrgRecord = (orgId) => api('GET', `/api/white-labeling/organization/${orgId}`, null, { expectStatus: [200, 204, 404] });

// --- FR-4: a store without white labeling, discovered (never written to) ------------------------------
async function discoverStoreWithoutWl() {
  const res = await api('POST', '/api/stores/search', { take: 200 });
  const stores = res?.results || [];
  const candidates = [];
  for (const s of stores) {
    let rec;
    try { rec = await api('GET', `/api/white-labeling/store/${encodeURIComponent(s.id)}`, null, { expectStatus: [200, 204] }); }
    catch { continue; } // unreadable → not a candidate (never guess "no record")
    candidates.push({ id: s.id, name: s.name, storeState: s.storeState, hasRecord: !!(rec && rec.id) });
  }
  const currentId = readEnvOverlay()[STORE_WITHOUT_WL_ALIAS]?.id || '';
  const pick = pickStoreWithoutWl(candidates, { primaryStoreId: STORE_ID, currentId });
  if (!pick) { log(`  ⚠ no Open store without a white-labeling record (other than ${STORE_ID}) — ${STORE_WITHOUT_WL_ALIAS} left as is; creating one is a human decision`); return null; }
  writeEnvAliasOverride({ [STORE_WITHOUT_WL_ALIAS]: { id: pick.id, name: pick.name || '' } });
  log(`  ${DRY_RUN ? '[DRY] would write' : '✓'} ${STORE_WITHOUT_WL_ALIAS} = ${pick.id}${pick.id === currentId ? ' (kept)' : ''} — ${candidates.filter((c) => !c.hasRecord).length}/${candidates.length} store(s) have no record`);
  return pick;
}

// --- FR-3: the per-run disposable triple ----------------------------------------------------------
/** Every disposable org / login a previous round (or a crashed one) left: the overlay's, plus a prefix search. */
async function findDisposableLeftovers() {
  const ov = readEnvOverlay();
  const a = DISPOSABLE.aliases;
  const orgs = new Map(); // id → { id, name, recordIds:Set }
  const ovOrgId = ov[a.orgId]?.id;
  if (ovOrgId) {
    const m = await findMemberById(ovOrgId);
    // Safety: touch the overlay's org only if it is still a disposable one (or already gone).
    if (!m?.id || isDisposableOrgName(m.name)) {
      const entry = { id: ovOrgId, name: m?.name || ov[a.org]?.name || '', recordIds: new Set(), gone: !m?.id };
      if (ov[a.org]?.record_id) entry.recordIds.add(ov[a.org].record_id);
      orgs.set(ovOrgId, entry);
    }
  }
  const found = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: DISPOSABLE.orgPrefix, take: 100 });
  for (const m of found?.results || []) if (isDisposableOrgName(m.name) && !orgs.has(m.id)) orgs.set(m.id, { id: m.id, name: m.name, recordIds: new Set() });
  const emails = new Set();
  if (ov[a.maintainer]?.email && isDisposableEmail(ov[a.maintainer].email)) emails.add(ov[a.maintainer].email);
  const users = await api('POST', '/api/platform/security/users/search', { keyword: DISPOSABLE.emailPrefix, take: 100 });
  for (const u of users?.results || []) for (const e of [u.userName, u.email]) if (isDisposableEmail(e)) emails.add(e);
  return { orgs: [...orgs.values()], emails: [...emails] };
}

/**
 * Tear the disposable round(s) down: disable every record we can reach (records have NO REST delete — KB-52D2F554 —
 * so they stay, orphaned), delete the maintainer(s) and the organization(s), clear the overlay. Returns the
 * number of records left orphaned. GET /organization/{id} shows only the NEWEST record (KB-F1605A45), so a second
 * record the case's mutation created is reached through it, the seeded one through the overlay's record_id.
 */
async function teardownDisposable() {
  const { orgs, emails } = await findDisposableLeftovers();
  let orphans = 0;
  for (const o of orgs) {
    const newest = await getOrgRecord(o.id); // records outlive their org, so this works for a deleted one too
    if (newest?.id) o.recordIds.add(newest.id);
    for (const rid of o.recordIds) {
      const rec = await api('GET', `/api/white-labeling/${rid}`, null, { expectStatus: [200, 204, 404] });
      if (!rec?.id) continue;
      orphans++;
      if (rec.isEnabled !== false) {
        await api('PUT', '/api/white-labeling', { ...rec, isEnabled: false }, { expectStatus: [200, 204] });
        log(`  ↓ record ${rec.id} of ${o.name || o.id}: isEnabled → false`);
      } else verbose(`record ${rec.id} already disabled`);
    }
  }
  for (const e of emails) await deleteUserByEmail(e);
  const liveOrgs = orgs.filter((o) => !o.gone);
  for (const o of liveOrgs) {
    await api('DELETE', `/api/members?ids=${encodeURIComponent(o.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✗ org ${o.name} (${o.id})`);
  }
  const residue = await verifyRemoved(async () => {
    const left = [];
    for (const o of liveOrgs) if ((await findMemberById(o.id))?.id) left.push(o.id);
    for (const e of emails) if ((await findUserByEmail(e))?.id) left.push(e);
    return left;
  });
  writeEnvAliasOverride(disposableOverlay(null));
  log(`Disposable teardown: ${liveOrgs.length} org(s), ${emails.length} login(s) removed; residue ${residue}; ${orphans} white-labeling record(s) of these org(s) left orphaned, disabled (no REST delete, KB-52D2F554)`);
  if (residue) throw new Error(`disposable teardown left ${residue} entity(ies) behind`);
  return orphans;
}

/** Re-arm: tear the previous round down, then create ONE fresh org + Approved maintainer + DISABLED record. */
async function armDisposable() {
  log('Previous disposable round(s):');
  await teardownDisposable();
  const ts = Date.now();
  const { org, user } = disposableRows(ts);
  log(`Arming ${org.org_name}:`);
  const orgMap = await seedOrgs([org]);
  const orgId = orgMap[org.org_id]?.platform_id;
  await ensureRoles();
  const { idByEmail } = await seedInlineOrgUsers([user], orgMap);
  if (DRY_RUN) { log(`[DRY] would POST a white-labeling record (organizationId=<new org>, isEnabled=${DISPOSABLE.recordIsEnabled}) and write ${Object.values(DISPOSABLE.aliases).join(', ')}`); return; }
  await api('POST', '/api/white-labeling', { organizationId: orgId, isEnabled: DISPOSABLE.recordIsEnabled }, { expectStatus: [200, 201] });
  const rec = await getOrgRecord(orgId);
  if (!rec?.id || rec.isEnabled !== DISPOSABLE.recordIsEnabled) throw new Error(`disposable record reads back ${rec ? `isEnabled=${rec.isEnabled}` : 'absent'} for ${orgId}`);
  writeEnvAliasOverride(disposableOverlay({ orgName: org.org_name, orgId, recordId: rec.id, email: user.email, userId: idByEmail[user.email] || '' }));
  log(`  ✓ ${org.org_name} (${orgId}) · maintainer ${user.email} · record ${rec.id} isEnabled=false → aliases.${TEST_ENV}.json (${Object.values(DISPOSABLE.aliases).join(', ')})`);
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 White-labeling seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await auth();
  setFlags({ dryRun: DRY_RUN, verbose: VERBOSE });
  __setApi(api); // share seed-common's already-authenticated client with user-provision.mjs — one token, one CRUD surface
  // __setApi is also user-provision's TEST seam and switches off recording accounts in test-accounts.local.json;
  // this is a real seed, so turn recording back on: every account created here is recorded (accountSet) and every
  // one a teardown deletes is forgotten (accountUnset).
  __setStoreRoot(ROOT);

  if (DISPOSABLE_MODE) { if (TEARDOWN) await teardownDisposable(); else await armDisposable(); return; }
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
  const liveUrls = {}; // org_id → { logo_url, secondary_logo_url, favicon_url } read back from the live record
  for (const row of orgRows) {
    const orgId = orgMap[row.org_id]?.platform_id;
    const plan = recordPlan(row);
    if (plan?.kind === 'empty') {
      // FR-1: an ENABLED record that carries nothing. Converged, never blindly re-PUT.
      if (orgId && !String(orgId).startsWith('dry-')) {
        const existing = await getOrgRecord(orgId);
        if (isEnabledEmptyRecord(existing)) verbose(`  empty record already in place for ${row.org_name}`);
        else if (existing?.id) await api('PUT', '/api/white-labeling', emptyRecordBody(orgId, existing.id), { expectStatus: [200, 204] });
        else await api('POST', '/api/white-labeling', emptyRecordBody(orgId), { expectStatus: [200, 201] });
        const after = DRY_RUN ? existing : await getOrgRecord(orgId);
        if (!DRY_RUN && !isEnabledEmptyRecord(after)) throw new Error(`${row.org_name}: record reads back ${JSON.stringify(after)?.slice(0, 200)} — expected enabled and empty`);
        liveUrls[row.org_id] = liveUrlColumns(after);
        log(`  ✓ WL config: ${row.org_name} (enabled, EMPTY record${existing?.id ? (isEnabledEmptyRecord(existing) ? ' — unchanged' : ' — reset') : ' — created'})`);
      }
      results.orgs.push({ name: row.org_name, id: orgId, wl: true });
      continue;
    }
    const main = (row.main_menu_link_list_name || '').trim();
    const footer = (row.footer_link_list_name || '').trim();
    const theme = (row.theme_preset || '').trim(); // must be one of the platform's WhiteLabeling.ThemePresetNames dictionary values — case-sensitive
    const logoSrc = (row.logo_source || '').trim();
    const secondarySrc = (row.secondary_logo_source || '').trim();
    const faviconSrc = (row.favicon_source || '').trim();
    const logoUrl0 = (row.logo_url || '').trim();
    const secondaryUrl0 = (row.secondary_logo_url || '').trim();
    const faviconUrl0 = (row.favicon_url || '').trim();
    if (!plan) { verbose(`  (no WL config for ${row.org_name} — fallback org)`); results.orgs.push({ name: row.org_name, id: orgId, wl: false }); continue; }
    if (orgId && !String(orgId).startsWith('dry-')) {
      const existing = await api('GET', `/api/white-labeling/organization/${orgId}`, null, { expectStatus: [200, 204, 404] });
      // Upload assets from source (idempotent), preferring an already-serving config URL to avoid dupes.
      const logo = await resolveAsset('logo', logoSrc, orgId, existing?.logoUrl || logoUrl0);
      const secondaryLogo = await resolveAsset('secondary', secondarySrc, orgId, existing?.secondaryLogoUrl || secondaryUrl0);
      const favicon = await resolveAsset('favicon', faviconSrc, orgId, existing?.faviconUrl || faviconUrl0);
      const body = {
        organizationId: orgId, isEnabled: true,
        mainMenuLinkListName: main || null, footerLinkListName: footer || null, themePresetName: theme || null,
        logoUrl: logo || null, secondaryLogoUrl: secondaryLogo || null, faviconUrl: favicon || null,
      };
      if (existing && existing.id) { body.id = existing.id; await api('PUT', '/api/white-labeling', body, { expectStatus: [200, 204] }); }
      else { await api('POST', '/api/white-labeling', body, { expectStatus: [200, 201] }); }
      log(`  ✓ WL config: ${row.org_name} (menu=${main || '—'}, footer=${footer || '—'}, theme=${theme || '—'}, logo=${logo ? 'set' : '—'}, secondaryLogo=${secondaryLogo ? 'set' : '—'}, favicon=${favicon ? 'set' : '—'})`);
      // Read back what the platform holds: the aliases' .logo/.secondary_logo/.favicon are those URLs (per env).
      if (!DRY_RUN) liveUrls[row.org_id] = liveUrlColumns(await getOrgRecord(orgId));
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

  // 4. Live image URLs → aliases.<env>.json (derived from the record, never transcribed into the CSV).
  const urlUpdates = overlayUpdatesFor(loadAliases(), ORGS_FILE, liveUrls);
  writeEnvAliasOverride(urlUpdates);
  if (Object.keys(urlUpdates).length) log(`aliases.${TEST_ENV}.json: live logo/secondary logo/favicon URLs for ${Object.keys(urlUpdates).join(', ')}`);

  // 5. FR-4 — a store without white labeling (discovered; nothing is written to any store).
  log('Store without white labeling:');
  await discoverStoreWithoutWl();

  // No _seed-results report (VCST-5406 migration): live platform ids are written to
  // aliases.{env}.json by user-provision's writeLiveIdAliases; everything else resolves
  // by static business key from the committed CSVs.
  console.log(`\n✅ White-labeling seed complete — ${results.linkLists.length} link lists, ${results.orgs.length} orgs, ${results.users.length} users.`);
}

main().catch((err) => { console.error(`\n❌ White-labeling seed failed: ${err.message}`); process.exit(1); });
