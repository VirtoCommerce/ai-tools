#!/usr/bin/env node
/**
 * scripts/seed-data/cms/seed-pagebuilder-pages.mjs
 *
 * RECONCILE the canonical qa-* PageBuilder pages (suites 059/060 published-page cases) to their
 * expected Published status + permalink on the target env, idempotently. It does NOT author page
 * content (blocks already exist) — it restores an archived page to Published and, when the expected
 * permalink is FREE, corrects it. It NEVER forces a permalink into a slot owned by a different page
 * and NEVER touches the drifted "(copy)"/"-2" clones — those are reported for manual cleanup.
 *
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
  ROOT, BACK_URL, ADMIN, ADMIN_PASSWORD, discoverCatalogProducts,
} from '../../lib/seed-common.mjs';
import {
  CANONICAL_PAGES, STATUS, pickCanonical, permalinkConflict, draftBody, permalinkBody,
  updateBody, isoOffsetDays, pickPromoteCandidate, pickByNameCulture, familyDuplicates,
  CONTENT_FILE, contentDocFor, parseContentDoc, blockCount, buildContentBody, maxDiscover,
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
  // --- EN canonical ---
  let en = pickByNameCulture(pages, spec.name, spec.culture);
  if (!en) {
    const cand = pickPromoteCandidate(pages, spec);
    if (!cand) { return { result: 'MISSING', enId: null, notes: [`no en-US "${spec.name}" and no promotable ${spec.familyPrefix}* candidate — manual re-author`] }; }
    if (DRY_RUN) { log(`  [DRY] would promote "${cand.name}" (${cand.permalink}) → "${spec.name}" @ ${spec.permalink}`); en = cand; }
    else {
      await applyPatchAndPublish(cand, { name: spec.name, permalink: spec.permalink });
      notes.push(`promoted "${cand.name}" (${cand.permalink}) → EN canonical "${spec.name}" @ ${spec.permalink}`);
      en = { ...cand, name: spec.name, permalink: spec.permalink, status: STATUS.PUBLISHED };
    }
  } else {
    if (en.permalink !== spec.permalink && !DRY_RUN) { await applyPatchAndPublish(en, { permalink: spec.permalink }); notes.push(`EN permalink ${en.permalink} → ${spec.permalink}`); }
    const st = await ensurePublished(en); if (st !== 'ok') notes.push(`EN status ${st}`);
  }
  if (en?.id) { const c = await ensurePageState(en, spec, 'en-US'); notes.push(`EN ${c}`); }
  // --- DE canonical ---
  const de = pickByNameCulture(pages, spec.deName, 'de-DE');
  if (!de) notes.push(`de-DE "${spec.deName}" not found — DE version needs manual creation`);
  else {
    if (de.permalink !== spec.permalink && !DRY_RUN) { await applyPatchAndPublish(de, { permalink: spec.permalink }); notes.push(`DE permalink ${de.permalink} → ${spec.permalink}`); }
    const st = await ensurePublished(de); if (st !== 'ok') notes.push(`DE(${spec.deName}) status ${st}`);
    else notes.push(`DE "${spec.deName}" @ ${spec.permalink} Published`);
    const c = await ensurePageState(de, spec, 'de-DE'); notes.push(`DE ${c}`);
  }
  // --- archive drifted family duplicates (reversible) ---
  const dupes = familyDuplicates(pages, spec, [en?.id, de?.id]);
  for (const d of dupes) {
    if (DRY_RUN) { log(`  [DRY] would archive duplicate "${d.name}" (${d.permalink}, ${d.status})`); continue; }
    await archive(d.id);
    notes.push(`archived duplicate "${d.name}" (${d.permalink})`);
  }
  if (DRY_RUN && dupes.length) notes.push(`${dupes.length} duplicate(s) would be archived`);
  return { result: de ? 'RECONCILED' : 'PARTIAL', enId: en?.id || null, notes };
}

async function seed() {
  const pages = await searchPages();
  const results = [];
  const writeback = {};

  for (const spec of CANONICAL_PAGES) {
    // Multi-language (PAGE-3): two single-culture pages share the permalink; dedicated reconcile.
    if (spec.multiLang) {
      const { result, enId, notes } = await reconcileMultiLang(spec, pages);
      results.push({ alias: spec.alias, name: spec.name, group: enId, action: result, detail: notes.join('; ') });
      if (enId) writeback[spec.alias] = { _inline: true, group_id: enId, permalink: spec.permalink };
      log(`  ${result.padEnd(10)} ${spec.name} — ${notes.join('; ') || 'EN+DE @ ' + spec.permalink}`);
      continue;
    }
    const chosen = pickCanonical(pages, spec);
    if (!chosen) {
      results.push({ alias: spec.alias, name: spec.name, action: 'MISSING', detail: `no exact-name page (only drifted copies) — manual re-seed via test-data/cms/pagebuilder-pages.md` });
      continue;
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
    const action = conflict ? 'CONFLICT' : (statusResult === 'ok' && !permalinkNote && !changed ? 'OK' : 'RECONCILED');
    results.push({ alias: spec.alias, name: spec.name, group: chosen.id, action, detail: [statusResult, permalinkNote, stateNote, cultureNote.trim()].filter(Boolean).join('; ') });
    if (chosen.id) writeback[spec.alias] = { _inline: true, group_id: chosen.id, permalink: spec.permalink };
    log(`  ${action.padEnd(10)} ${spec.name} — ${results[results.length - 1].detail || 'Published @ ' + spec.permalink}`);
  }

  if (!DRY_RUN && Object.keys(writeback).length) {
    writeEnvAliasOverride(writeback);
    log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${Object.keys(writeback).length} PageBuilder page group id(s)`);
  }

  const conflicts = results.filter((r) => ['CONFLICT', 'MISSING', 'PARTIAL'].includes(r.action));
  log('\n  === reconcile summary ===');
  for (const r of results) log(`   ${r.action}: ${r.name}${r.detail ? ' — ' + r.detail : ''}`);
  if (conflicts.length) log(`\n  ⚠ ${conflicts.length} page(s) need MANUAL cleanup (see above) — reported, not forced.`);
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
