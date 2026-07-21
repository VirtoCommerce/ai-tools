#!/usr/bin/env node
/**
 * scripts/seed-data/cms/seed-pagebuilder-pages.mjs
 *
 * Provision the canonical qa-* PageBuilder pages (suites 059/060 published-page cases) to their
 * expected Published status + permalink + content on the target env, idempotently. Two paths:
 *
 *   1. CREATE (from scratch) — when the canonical page does NOT exist on the env (e.g. a fresh
 *      customer env like vcptcore-qa), the seeder AUTHORS it headlessly via REST: POST a minimal
 *      grouped shell (verified live — the server assigns the groupId + a page shell), fill content
 *      from the fixture, and publish. Personalization that needs no live id (visibility + userGroups
 *      string labels) is set from the spec; an org restriction is bound only when the org resolves
 *      LIVE on the env (else the page is created + published and the seeder REPORTS that org
 *      personalization needs manual completion — never fabricates an id). multiLang (return-policy)
 *      creates BOTH the en-US and de-DE single-culture pages sharing the permalink.
 *   2. RECONCILE (pre-existing) — restores an archived page to Published, fills an empty shell from
 *      the fixture, and corrects a FREE permalink. It NEVER forces a permalink into a slot owned by a
 *      different page, NEVER re-personalizes a pre-existing page, and NEVER touches the drifted
 *      "(copy)"/"-2" clones — those are reported for manual cleanup.
 *
 * A second run finds the now-existing pages by EXACT name and reconciles/no-ops — never duplicates.
 * Single source of truth: ./pagebuilder-pages-specs.mjs. Runtime groupIds → aliases.<env>.json.
 *
 *   TEST_ENV=vcst npm run seed:cms-pages
 *   TEST_ENV=vcst npm run seed:cms-pages -- --dry-run --verbose
 *   TEST_ENV=vcst npm run seed:cms-pages:teardown     # re-archive (never deletes — md keep-for-reuse)
 *
 * Flags: --dry-run, --verbose, --teardown.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, DRY_RUN, TEARDOWN, STORE_ID, writeEnvAliasOverride,
  ROOT, BACK_URL, ADMIN, ADMIN_PASSWORD, discoverCatalogProducts, loadCsv,
} from '../../lib/seed-common.mjs';
import {
  CANONICAL_PAGES, STATUS, pickCanonical, permalinkConflict, draftBody, permalinkBody,
  updateBody, isoOffsetDays, pickPromoteCandidate, pickByNameCulture, familyDuplicates,
  CONTENT_FILE, contentDocFor, parseContentDoc, blockCount, buildContentBody, maxDiscover,
  createGroupedBody,
} from './pagebuilder-pages-specs.mjs';

// Content is served/accepted as text/plain JSON, which seed-common's api() (JSON-only) can't READ,
// so raw fetch with a locally-minted token. Loaded once.
let _contentTok = null;
async function contentToken() {
  if (_contentTok) return _contentTok;
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  _contentTok = (await res.json()).access_token;
  return _contentTok;
}
async function getContent(groupId, draft = false) {
  const tok = await contentToken();
  const r = await fetch(`${BACK_URL}/api/page-builder-pages/grouped/${groupId}/content?draft=${draft}`, { headers: { Authorization: `Bearer ${tok}` } });
  return parseContentDoc(await r.text().catch(() => ''));
}
async function postContent(groupId, body) {
  // Write via seed-common api() (JSON request; text/plain response is fine — we ignore it).
  await api('POST', `/api/page-builder-pages/grouped/${groupId}/content`, body, { expectStatus: [200, 201, 204] });
}

let _fixture = null;
function loadContentFixture() {
  if (_fixture !== null) return _fixture;
  const p = join(ROOT, CONTENT_FILE);
  _fixture = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  return _fixture;
}

let _skuCache = null;
async function discoverSkus(n) {
  if (n <= 0) return [];
  if (!_skuCache) _skuCache = (await discoverCatalogProducts(api, Math.max(n, 6))).map((p) => p.sku).filter(Boolean);
  return _skuCache.slice(0, n);
}

/**
 * Idempotently ensure a page's CONTENT and (optional in-window) SCHEDULE in a SINGLE publish.
 * Preserves existing blocks (re-posts live content); fills from the fixture only when the page is
 * empty. Content + dates MUST land in one publish: a second publish drains the just-promoted (empty)
 * draft and wipes the content, and a future/Pending page hides content in every projection — both
 * proven live 2026-07-21. Returns a short status string; no-ops when already correct.
 */
async function ensurePageState(page, spec, culture, { schedule } = {}) {
  const now = Date.now();
  const full = await getGrouped(page.id);
  const live = await getContent(page.id, false);
  const haveContent = blockCount(live) > 0;
  const wantSchedule = !!schedule;
  const inWindow = full?.startDate && Date.parse(full.startDate) < now
    && full?.endDate && Date.parse(full.endDate) > now + 7 * 86400000;
  const scheduleOk = wantSchedule ? inWindow : (!full?.startDate && !full?.endDate);
  if (haveContent && scheduleOk && full?.status === STATUS.PUBLISHED) {
    return `content ok (${blockCount(live)} blocks${wantSchedule ? ', in-window' : ''}, kept)`;
  }
  // Desired content: keep existing blocks; else fill from the fixture (resolving @discover SKUs live).
  const doc = contentDocFor(loadContentFixture(), spec, culture);
  let contentBody, fillNote;
  if (haveContent) { contentBody = { settings: live.settings || {}, content: live.content }; fillNote = `content kept (${blockCount(live)} blocks)`; }
  else if (doc) {
    const skus = await discoverSkus(maxDiscover(doc));
    contentBody = buildContentBody(doc, { skus });
    fillNote = `filled ${doc.content.length} blocks${maxDiscover(doc) ? ` (${skus.length} live SKUs)` : ''}`;
  } else return 'EMPTY (no fixture content to apply)';
  const schedNote = wantSchedule ? ` + in-window schedule (${isoOffsetDays(schedule.startOffsetDays).slice(0, 10)}…${isoOffsetDays(schedule.endOffsetDays).slice(0, 10)})` : '';
  if (DRY_RUN) { log(`  [DRY] would set ${page.name} (${culture}): ${fillNote}${schedNote}`); return `[DRY] ${fillNote}${schedNote}`; }
  // ONE publish carrying content + dates: Draft(+dates) → post content → publish.
  const restore = draftBody(full);
  restore.startDate = wantSchedule ? isoOffsetDays(schedule.startOffsetDays) : null;
  restore.endDate = wantSchedule ? isoOffsetDays(schedule.endOffsetDays) : null;
  await upsert(restore);
  await postContent(page.id, contentBody);
  await publish(page.id);
  const after = blockCount(await getContent(page.id, false));
  return after > 0 ? `${fillNote}${schedNote}` : 'WRITE FAILED (still empty)';
}

async function searchPages() {
  const r = await api('POST', '/api/page-builder-pages/search', { storeId: STORE_ID, take: 500 }, { expectStatus: [200] });
  return r?.results || r?.items || [];
}
const getGrouped = (id) => api('GET', `/api/page-builder-pages/grouped/${id}`, null, { expectStatus: [200, 404] });
const upsert = (body) => api('POST', '/api/page-builder-pages/grouped', body, { expectStatus: [200, 201, 204] });
const publish = (id) => api('POST', `/api/page-builder-pages/grouped/publishing/${id}?publish=true`, null, { expectStatus: [200, 201, 204] });
const archive = (id) => api('POST', `/api/page-builder-pages/grouped/archive?ids=${encodeURIComponent(id)}`, null, { expectStatus: [200, 201, 204] });

/**
 * CREATE a brand-new grouped page from a spec + culture/name/permalink (from-scratch path). POSTs the
 * verified minimal body (createGroupedBody) — no id, pages:[] → the server assigns the groupId and a
 * page shell — then resolves the new groupId (the POST returns the created object; a rare 204 falls
 * back to a name+culture search). Returns a lightweight page stub { id, name, permalink, cultureName,
 * status:'Draft' } the existing publish/content flow consumes, or null on failure.
 */
async function createPage(spec, { culture, name, permalink, orgId = null }) {
  const body = createGroupedBody(spec, { storeId: STORE_ID, culture, name, permalink, orgId });
  const resp = await createGrouped(body);
  const gid = resp?.id || pickByNameCulture(await searchPages(), name, culture)?.id;
  if (!gid) return null;
  return { id: gid, name, permalink, cultureName: culture, status: STATUS.DRAFT };
}
const createGrouped = (body) => api('POST', '/api/page-builder-pages/grouped', body, { expectStatus: [200, 201, 204] });

/** The org platform_id PINNED in test-data/b2b/organizations.csv for the row whose org_name contains
 * `keyword` (env-invariant — seedOrgs forces this id on every env). Null if the CSV/row is absent. */
let _orgCsv = null;
function pinnedOrgId(keyword) {
  try {
    if (!_orgCsv) _orgCsv = loadCsv('test-data/b2b/organizations.csv');
    return _orgCsv.find((r) => String(r.org_name || '').includes(keyword))?.platform_id || null;
  } catch { return null; }
}

/**
 * Resolve an org's LIVE platform id by business-key keyword (POST /api/members/search — the same route
 * the user seeders use). Env-correct, never fabricated: returns null when the org is absent on the env
 * (the caller creates + publishes the page anyway and reports that org personalization needs manual
 * completion). PREFERS the CSV-pinned id when it exists live — that is the org the seeded TechFlow test
 * users actually belong to, so the page restriction gates for them (an env may carry drifted duplicate
 * orgs of the same name); else falls back to the first live hit containing the keyword.
 */
async function resolveOrgId(keyword) {
  if (!keyword) return null;
  try {
    const r = await api('POST', '/api/members/search', { memberType: 'Organization', keyword, take: 25 }, { expectStatus: [200, 201] });
    const orgs = r?.results || r?.items || [];
    if (!orgs.length) return null;
    const pinned = pinnedOrgId(keyword);
    if (pinned && orgs.some((o) => o.id === pinned)) return pinned;
    return orgs.find((o) => String(o.name || '').includes(keyword))?.id || orgs[0]?.id || null;
  } catch (e) { verbose(`resolveOrgId(${keyword}) failed: ${String(e.message).slice(0, 120)}`); return null; }
}

/** Ensure `page` is Published. Archived → restore-to-Draft (upsert) → publish; Draft → publish. */
async function ensurePublished(page) {
  if (page.status === STATUS.PUBLISHED) { verbose(`already Published: ${page.name}`); return 'ok'; }
  if (DRY_RUN) { log(`  [DRY] would republish ${page.name} (${page.status} → Published)`); return 'would-republish'; }
  const full = await getGrouped(page.id);
  if (page.status === STATUS.ARCHIVED) await upsert(draftBody(full));
  await publish(page.id);
  const after = await getGrouped(page.id);
  return after?.status === STATUS.PUBLISHED ? 'republished' : `still-${after?.status}`;
}

/** Ensure `page` is Draft (unpublished). Published → publishing?publish=false, which the module
 * turns the published page back to Draft (content preserved). Idempotent: re-fetches the true status
 * and no-ops when already non-Published. Tolerant: reports (never throws) if the unpublish is refused
 * (e.g. the group has a pending Draft → module blocks unpublish). Used for a deliberately-unpublished
 * multi-lang sibling (frStatus: Draft) — the CMS-028 untranslated-language subject. */
async function ensureDraft(page) {
  const full = await getGrouped(page.id);
  const status = full?.status ?? page.status;
  if (status !== STATUS.PUBLISHED) { verbose(`already ${status}: ${page.name}`); return 'ok'; }
  if (DRY_RUN) { log(`  [DRY] would unpublish ${page.name} (Published → Draft)`); return 'would-unpublish'; }
  try {
    await api('POST', `/api/page-builder-pages/grouped/publishing/${page.id}?publish=false`, null, { expectStatus: [200, 201, 204] });
  } catch (e) {
    return `unpublish-failed (${String(e.message).slice(0, 80)})`;
  }
  const after = await getGrouped(page.id);
  return after?.status !== STATUS.PUBLISHED ? 'unpublished' : `still-${after?.status}`;
}

/** Apply a metadata patch (name / permalink / startDate / endDate) then re-publish so it takes. */
async function applyPatchAndPublish(page, patch) {
  if (DRY_RUN) { log(`  [DRY] would patch ${page.name}: ${JSON.stringify(patch)}`); return; }
  const full = await getGrouped(page.id);
  await upsert(updateBody(full, patch));
  await publish(page.id);
}


/**
 * Multi-language reconcile (PAGE-3): ensure a canonical en-US page AND a canonical de-DE page both
 * sit at spec.permalink, Published (two single-culture pages sharing the permalink — the platform's
 * model). If the exact-name EN page is missing, promote the closest drifted EN copy. Archive the rest
 * of the /qa-return-policy* family (reversible). Returns { result, enId, notes }.
 */
async function reconcileMultiLang(spec, pages) {
  const notes = [];
  let anyCreated = false;
  // --- EN canonical ---
  let en = pickByNameCulture(pages, spec.name, spec.culture);
  if (!en) {
    const cand = pickPromoteCandidate(pages, spec);
    if (cand) {
      if (DRY_RUN) { log(`  [DRY] would promote "${cand.name}" (${cand.permalink}) → "${spec.name}" @ ${spec.permalink}`); en = cand; }
      else {
        await applyPatchAndPublish(cand, { name: spec.name, permalink: spec.permalink });
        notes.push(`promoted "${cand.name}" (${cand.permalink}) → EN canonical "${spec.name}" @ ${spec.permalink}`);
        en = { ...cand, name: spec.name, permalink: spec.permalink, status: STATUS.PUBLISHED };
      }
    } else if (DRY_RUN) {
      log(`  [DRY] would CREATE EN "${spec.name}" @ ${spec.permalink} + fill content`);
      notes.push(`[DRY] would create EN "${spec.name}"`);
      anyCreated = true;
    } else {
      // No exact-name EN and nothing to promote → CREATE the EN single-culture page from scratch.
      en = await createPage(spec, { culture: spec.culture, name: spec.name, permalink: spec.permalink });
      if (!en) return { result: 'CREATE-FAILED', enId: null, notes: [...notes, 'EN create returned no groupId'] };
      anyCreated = true;
      notes.push(`CREATED EN "${spec.name}" @ ${spec.permalink}`);
    }
  } else {
    if (en.permalink !== spec.permalink && !DRY_RUN) { await applyPatchAndPublish(en, { permalink: spec.permalink }); notes.push(`EN permalink ${en.permalink} → ${spec.permalink}`); }
    const st = await ensurePublished(en); if (st !== 'ok') notes.push(`EN status ${st}`);
  }
  if (en?.id) { const c = await ensurePageState(en, spec, 'en-US'); notes.push(`EN ${c}`); }
  // --- DE canonical (the platform models EN+DE as TWO single-culture pages SHARING the permalink) ---
  let de = pickByNameCulture(pages, spec.deName, 'de-DE');
  if (!de) {
    if (DRY_RUN) { log(`  [DRY] would CREATE DE "${spec.deName}" @ ${spec.permalink} + fill content`); notes.push(`[DRY] would create DE "${spec.deName}"`); anyCreated = true; }
    else {
      de = await createPage(spec, { culture: 'de-DE', name: spec.deName, permalink: spec.permalink });
      if (!de) notes.push(`⚠ DE "${spec.deName}" create returned no groupId — needs manual creation`);
      else { anyCreated = true; notes.push(`CREATED DE "${spec.deName}" @ ${spec.permalink}`); }
    }
  } else {
    if (de.permalink !== spec.permalink && !DRY_RUN) { await applyPatchAndPublish(de, { permalink: spec.permalink }); notes.push(`DE permalink ${de.permalink} → ${spec.permalink}`); }
    const st = await ensurePublished(de); if (st !== 'ok') notes.push(`DE(${spec.deName}) status ${st}`);
    else notes.push(`DE "${spec.deName}" @ ${spec.permalink} Published`);
  }
  if (de?.id) { const c = await ensurePageState(de, spec, 'de-DE'); notes.push(`DE ${c}`); }
  // --- FR canonical (a third single-culture page sharing the permalink) ---
  // frStatus:'Draft' keeps FR deliberately UNPUBLISHED (CMS-028 untranslated-language subject): create
  // it if missing but never publish/fill, and unpublish an existing Published FR back to Draft — so
  // /fr/<permalink> falls back to the default-language content instead of serving FR.
  let fr = null;
  if (spec.frName) {
    const frDraft = spec.frStatus === STATUS.DRAFT;
    fr = pickByNameCulture(pages, spec.frName, 'fr-FR');
    if (!fr) {
      if (DRY_RUN) { log(`  [DRY] would CREATE FR "${spec.frName}" @ ${spec.permalink}${frDraft ? ' (Draft)' : ' + fill content'}`); notes.push(`[DRY] would create FR "${spec.frName}"`); anyCreated = true; }
      else {
        fr = await createPage(spec, { culture: 'fr-FR', name: spec.frName, permalink: spec.permalink });
        if (!fr) notes.push(`⚠ FR "${spec.frName}" create returned no groupId — needs manual creation`);
        else { anyCreated = true; notes.push(`CREATED FR "${spec.frName}" @ ${spec.permalink}${frDraft ? ' (Draft)' : ''}`); }
      }
    } else if (!frDraft) {
      if (fr.permalink !== spec.permalink && !DRY_RUN) { await applyPatchAndPublish(fr, { permalink: spec.permalink }); notes.push(`FR permalink ${fr.permalink} → ${spec.permalink}`); }
      const st = await ensurePublished(fr); if (st !== 'ok') notes.push(`FR(${spec.frName}) status ${st}`);
    }
    if (fr?.id) {
      if (frDraft) { const st = await ensureDraft(fr); notes.push(`FR "${spec.frName}" Draft (${st})`); }
      else { const c = await ensurePageState(fr, spec, 'fr-FR'); notes.push(`FR ${c}`); }
    }
  }
  // --- culture-heal: creating/publishing a page at a SHARED permalink can flip a sibling's
  // cultureName (proven live — an FR create flipped EN → fr-FR). Re-assert each sibling's culture via
  // a content-safe metadata upsert (no publish, so content is never drained). Idempotent (no-op when correct).
  const heal = [[en, spec.culture], [de, 'de-DE'], [fr, 'fr-FR']];
  for (const [pg, cul] of heal) {
    if (!pg?.id || DRY_RUN) continue;
    const h = await enforceCulture(pg.id, cul);
    if (h) notes.push(h);
  }
  // --- archive drifted family duplicates (reversible) ---
  const dupes = familyDuplicates(pages, spec, [en?.id, de?.id, fr?.id]);
  for (const d of dupes) {
    if (DRY_RUN) { log(`  [DRY] would archive duplicate "${d.name}" (${d.permalink}, ${d.status})`); continue; }
    await archive(d.id);
    notes.push(`archived duplicate "${d.name}" (${d.permalink})`);
  }
  if (DRY_RUN && dupes.length) notes.push(`${dupes.length} duplicate(s) would be archived`);
  return { result: anyCreated ? 'CREATED' : (de ? 'RECONCILED' : 'PARTIAL'), enId: en?.id || null, frId: fr?.id || null, notes };
}

/** Re-assert a page's cultureName via a content-safe metadata upsert (NO publish). Returns a note if
 * it changed, else ''. (Bare publish drains the draft; metadata upserts preserve content — proven live.) */
async function enforceCulture(groupId, culture) {
  const full = await getGrouped(groupId);
  if (!full || full.cultureName === culture) return '';
  await upsert(updateBody(full, { cultureName: culture }));
  return `healed culture ${full.cultureName} → ${culture} ("${full.name}")`;
}

async function seed() {
  const pages = await searchPages();
  const results = [];
  const writeback = {};

  for (const spec of CANONICAL_PAGES) {
    // Multi-language (PAGE-3): two single-culture pages share the permalink; dedicated reconcile.
    if (spec.multiLang) {
      const { result, enId, frId, notes } = await reconcileMultiLang(spec, pages);
      results.push({ alias: spec.alias, name: spec.name, group: enId, action: result, detail: notes.join('; ') });
      if (enId) writeback[spec.alias] = { _inline: true, group_id: enId, permalink: spec.permalink };
      if (frId && spec.frAlias) writeback[spec.frAlias] = { _inline: true, group_id: frId, permalink: spec.permalink };
      log(`  ${result.padEnd(10)} ${spec.name} — ${notes.join('; ') || 'EN+DE+FR @ ' + spec.permalink}`);
      continue;
    }
    let chosen = pickCanonical(pages, spec);
    let created = false;
    let createNote = '';
    if (!chosen) {
      // From-scratch CREATE: the canonical page doesn't exist on this env — author it headlessly
      // (create shell → publish content, below) instead of reporting MISSING.
      const personalPreview = spec.personalization === 'org'
        ? ` [org personalization: resolve "${spec.orgSearchKeyword}" live]`
        : (spec.userGroups ? ` [userGroups ${spec.userGroups.join(', ')} — manual (module NREs on userGroups)]` : '');
      if (DRY_RUN) {
        log(`  [DRY] would CREATE "${spec.name}" @ ${spec.permalink} (${spec.culture})${personalPreview} + fill content${spec.schedule ? ' + in-window schedule' : ''}`);
        results.push({ alias: spec.alias, name: spec.name, action: 'CREATE', detail: `[DRY] would create + publish content${spec.schedule ? ' + schedule' : ''}${personalPreview}` });
        continue;
      }
      let orgId = null;
      if (spec.personalization === 'org') {
        orgId = await resolveOrgId(spec.orgSearchKeyword);
        createNote = orgId
          ? `org bound (${spec.orgSearchKeyword})`
          : `⚠ ORG PERSONALIZATION NEEDS MANUAL COMPLETION — no "${spec.orgSearchKeyword}" org on ${process.env.TEST_ENV || 'vcst'} (page created + published, unrestricted)`;
      } else if (spec.userGroups) {
        createNote = `⚠ userGroup personalization [${spec.userGroups.join(', ')}] NOT set — module NREs on userGroups upsert; page published UNRESTRICTED, needs manual completion`;
      }
      chosen = await createPage(spec, { culture: spec.culture, name: spec.name, permalink: spec.permalink, orgId });
      if (!chosen) {
        results.push({ alias: spec.alias, name: spec.name, action: 'CREATE-FAILED', detail: 'POST /grouped returned no groupId' });
        log(`  CREATE-FAILED ${spec.name}`);
        continue;
      }
      created = true;
    }
    const conflict = permalinkConflict(pages, spec, chosen);
    let permalinkNote = '';
    if (chosen.permalink !== spec.permalink) {
      if (conflict) {
        permalinkNote = `permalink ${spec.permalink} OCCUPIED by "${conflict.name}" (${conflict.cultureName}, ${conflict.status}) — NOT forced`;
      } else if (!DRY_RUN) {
        const full = await getGrouped(chosen.id);
        await upsert(permalinkBody(full, spec.permalink));
        permalinkNote = `permalink ${chosen.permalink} → ${spec.permalink}`;
      } else {
        permalinkNote = `[DRY] would set permalink ${chosen.permalink} → ${spec.permalink}`;
      }
    }
    // Even under a permalink conflict, still ensure the canonical page's own status is Published.
    const statusResult = await ensurePublished(chosen);
    // Content + (optional) in-window schedule in ONE publish — fills an empty shell from the fixture
    // (never overwrites existing blocks) and applies PAGE-4's schedule window atomically.
    const stateNote = await ensurePageState(chosen, spec, spec.culture, { schedule: spec.schedule });
    const cultureNote = chosen.cultureName && chosen.cultureName !== spec.culture ? ` [culture drift: ${chosen.cultureName}≠${spec.culture}]` : '';
    const changed = !/^content ok/.test(stateNote);
    const action = created ? 'CREATED' : (conflict ? 'CONFLICT' : (statusResult === 'ok' && !permalinkNote && !changed ? 'OK' : 'RECONCILED'));
    results.push({ alias: spec.alias, name: spec.name, group: chosen.id, action, detail: [createNote, statusResult, permalinkNote, stateNote, cultureNote.trim()].filter(Boolean).join('; ') });
    if (chosen.id) writeback[spec.alias] = { _inline: true, group_id: chosen.id, permalink: spec.permalink };
    log(`  ${action.padEnd(10)} ${spec.name} — ${results[results.length - 1].detail || 'Published @ ' + spec.permalink}`);
  }

  if (!DRY_RUN && Object.keys(writeback).length) {
    writeEnvAliasOverride(writeback);
    log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${Object.keys(writeback).length} PageBuilder page group id(s)`);
  }

  const conflicts = results.filter((r) => ['CONFLICT', 'MISSING', 'PARTIAL', 'CREATE-FAILED'].includes(r.action));
  const personalWarn = results.filter((r) => /⚠/.test(r.detail || '') && !conflicts.includes(r));
  log('\n  === provisioning summary ===');
  for (const r of results) log(`   ${r.action}: ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (conflicts.length) log(`\n  ⚠ ${conflicts.length} page(s) need MANUAL cleanup (see above) — reported, not forced.`);
  if (personalWarn.length) log(`  ⚠ ${personalWarn.length} page(s) published but need MANUAL personalization completion (userGroup/org — see notes).`);
  return results;
}

async function teardown() {
  // Re-archive the canonical pages we manage (md: keep for reuse, never delete).
  const pages = await searchPages();
  for (const spec of CANONICAL_PAGES) {
    const chosen = pickCanonical(pages, spec);
    if (!chosen?.id) { verbose(`teardown: ${spec.name} not found`); continue; }
    if (chosen.status === STATUS.ARCHIVED) { verbose(`teardown: ${spec.name} already Archived`); continue; }
    if (DRY_RUN) { log(`  [DRY] would archive ${spec.name}`); continue; }
    await archive(chosen.id);
    log(`  ✗ archived ${spec.name} (${chosen.id})`);
  }
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); log('Teardown complete (pages archived, not deleted).'); return; }
  await seed();
  log(DRY_RUN ? 'DRY RUN complete.' : 'Seed complete.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
