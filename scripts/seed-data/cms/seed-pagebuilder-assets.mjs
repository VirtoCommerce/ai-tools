#!/usr/bin/env node
/**
 * scripts/seed-data/cms/seed-pagebuilder-assets.mjs
 *
 * Provisions the VCST-5726 Page Builder ASSET LIBRARY fixture set (folder tree + 1 000+ tiny files
 * + reference pages + one shared component) under the store's Page Builder asset folder, then
 * READS BACK the oracle the run compares the UI against: per-folder counts from both
 * GET /api/assets and POST /api/page-builder-assets/search, the upload-time first/last of P500,
 * and the reference counts from POST /api/page-builder-assets/references. Nothing is faked: a
 * count the platform does not report is written as observed and flagged.
 *
 * Idempotent find-or-create: existing files are not re-uploaded (a re-run uploads only what is
 * missing); pages and the shared component are matched by exact AGENT-TEST- name.
 * Single source of truth: ./pagebuilder-assets-specs.mjs. Runtime ids → aliases.<env>.json.
 *
 *   TEST_ENV=vcptcore_qa1 npm run seed:cms-assets
 *   TEST_ENV=vcptcore_qa1 npm run seed:cms-assets -- --dry-run --verbose
 *   TEST_ENV=vcptcore_qa1 npm run seed:cms-assets -- --verify      # read-back only, no writes
 *   TEST_ENV=vcptcore_qa1 npm run seed:cms-assets:teardown        # pages → component → folder tree
 *
 * Contracts used (verified live on vcptcore_qa1 2026-10-14, PageBuilderModule 3.1035.0-pr-171):
 *   upload  POST /api/assets?folderUrl=<folder> (multipart) — creates missing folders, accepts any name
 *   folder  POST /api/assets/folder {name,parentUrl} — name validator: lowercase/digits/single dashes
 *   delete  DELETE /api/assets?urls=<folder url> — recursive; the parent listing lags a few seconds
 *   content GET …/grouped/{id}/content?includeVersion=true → {content,eTag}; POST with If-Match
 */
import {
  assertSafeTarget, auth, api, log, verbose, DRY_RUN, TEARDOWN, STORE_ID, BACK_URL, ADMIN, ADMIN_PASSWORD,
  uploadAsset, writeEnvAliasOverride, verifyRemoved,
} from '../../lib/seed-common.mjs';
import {
  ROOT_NAME, FOLDERS, DEEP_ALIAS, REF_ASSETS, REF_PAGES, SC_PREFIX, SHARED_COMPONENTS, scName, scRefCounts, PAGE_PREFIX,
  storeAssetRoot, fixtureRoot, allFolderSpecs, uploadOrder, expectedCounts, totalFiles,
  pageName, pagePermalink, pageRefCounts, createGroupedBody, buildPageContent, buildScBody, fileBytes,
} from './pagebuilder-assets-specs.mjs';

const VERIFY_ONLY = process.argv.includes('--verify');
const ROOT = fixtureRoot(STORE_ID);
const folderUrl = (rel) => (rel ? `${ROOT}/${rel}` : ROOT);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── asset helpers ────────────────────────────────────────────────────────────
async function listFolder(url) {
  const r = await api('GET', `/api/assets?folderUrl=${encodeURIComponent(url)}`, null, { expectStatus: [200] });
  return r?.results || [];
}
async function pbSearch(url, extra = {}) {
  return api('POST', '/api/page-builder-assets/search', { folderUrl: url, skip: 0, take: 20, ...extra }, { expectStatus: [200] });
}
async function ensureEmptyFolder(parentUrl, name) {
  const kids = await listFolder(parentUrl).catch(() => []);
  if (kids.some((k) => k.type === 'folder' && k.name === name)) return 'exists';
  if (DRY_RUN) return 'dry';
  await api('POST', '/api/assets/folder', { name, parentUrl }, { expectStatus: [200, 201, 204] });
  return 'created';
}

/** Upload the files of one folder spec that are not there yet, in the spec's upload order. */
async function ensureFiles(spec) {
  const url = folderUrl(spec.rel);
  const have = new Set((await listFolder(url).catch(() => [])).filter((k) => k.type === 'blob').map((k) => k.name));
  const todo = uploadOrder(spec).filter((n) => !have.has(n));
  if (!todo.length) return { uploaded: 0, kept: have.size };
  if (DRY_RUN) { log(`  [DRY] would upload ${todo.length} file(s) → ${spec.rel}`); return { uploaded: 0, kept: have.size }; }
  // P500 MUST be sequential so created-time order == the seeded shuffle. Others go 6-wide.
  const width = spec.shuffled ? 1 : 6;
  let i = 0, done = 0;
  async function worker() {
    while (i < todo.length) {
      const name = todo[i++];
      const { bytes, type } = fileBytes(name);
      for (let attempt = 0; ; attempt++) {
        try { await uploadAsset(url, name, bytes, type); break; }
        catch (e) { if (attempt >= 2) throw e; verbose(`retry ${name}: ${e.message.slice(0, 80)}`); await sleep(1000 * (attempt + 1)); }
      }
      if (spec.shuffled) await sleep(15); // distinct created timestamps
      if (++done % 100 === 0) log(`    ${spec.rel}: ${done}/${todo.length}`);
    }
  }
  await Promise.all(Array.from({ length: width }, worker));
  return { uploaded: todo.length, kept: have.size };
}

// ── content (raw fetch: text/plain + If-Match) ───────────────────────────────
let _tok = null;
async function rawToken() {
  if (_tok) return _tok;
  const r = await fetch(`${BACK_URL}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }) });
  _tok = (await r.json()).access_token; return _tok;
}
async function getContentVersioned(groupId) {
  const r = await fetch(`${BACK_URL}/api/page-builder-pages/grouped/${groupId}/content?draft=true&includeVersion=true`, { headers: { Authorization: `Bearer ${await rawToken()}` } });
  const t = await r.text();
  try { const j = JSON.parse(t); return { doc: typeof j.content === 'string' ? JSON.parse(j.content || '{}') : (j.content || j), eTag: j.eTag || null }; }
  catch { return { doc: {}, eTag: null }; }
}
async function saveContent(groupId, body) {
  const { eTag } = await getContentVersioned(groupId);
  const headers = { Authorization: `Bearer ${await rawToken()}`, 'Content-Type': 'application/json' };
  if (eTag) headers['If-Match'] = eTag;
  const r = await fetch(`${BACK_URL}/api/page-builder-pages/grouped/${groupId}/content?includeVersion=true`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (![200, 201, 204].includes(r.status)) throw new Error(`save content ${groupId} → ${r.status}: ${(await r.text()).slice(0, 200)}`);
}

// ── pages / shared component ─────────────────────────────────────────────────
async function searchPages() {
  const r = await api('POST', '/api/page-builder-pages/search', { storeId: STORE_ID, keyword: PAGE_PREFIX, take: 200 }, { expectStatus: [200] });
  return (r?.results || []).filter((p) => String(p.name || '').startsWith(PAGE_PREFIX));
}
async function searchSc() {
  const r = await api('POST', '/api/page-builder-shared-components/search', { storeId: STORE_ID, take: 500 }, { expectStatus: [200, 201] });
  return (r?.results || []).filter((c) => String(c.name || '').startsWith(SC_PREFIX));
}

async function seed() {
  log(`Fixture root: ${ROOT}  (${totalFiles()} files across ${allFolderSpecs().length} folders)`);
  const urlByRel = {};
  // 1. files
  for (const spec of allFolderSpecs()) {
    const r = await ensureFiles(spec);
    log(`  ${spec.rel.padEnd(40)} uploaded ${r.uploaded}, kept ${r.kept}`);
  }
  // 2. empty sub-folders
  for (const spec of FOLDERS.filter((f) => f.subfolders)) {
    let created = 0; for (const s of spec.subfolders) if ((await ensureEmptyFolder(folderUrl(spec.rel), s)) === 'created') created++;
    log(`  ${spec.rel}: ${spec.subfolders.length} sub-folders (${created} created)`);
  }
  for (const spec of FOLDERS.filter((f) => f.createEmpty)) log(`  ${spec.rel}: ${await ensureEmptyFolder(ROOT, spec.rel)}`);
  if (DRY_RUN) { log('[DRY] skipping references'); return; }

  // resolve absolute urls of the referenced assets from the live listing (the form the Designer stores)
  for (const rel of new Set([...REF_ASSETS.map((a) => a.rel), ...REF_PAGES.flatMap((p) => p.assets)])) {
    const dir = rel.split('/').slice(0, -1).join('/'); const name = rel.split('/').pop();
    const hit = (await listFolder(folderUrl(dir))).find((k) => k.name === name);
    if (!hit) throw new Error(`referenced asset not found after upload: ${rel}`);
    urlByRel[rel] = hit.url;
  }
  const urlOf = (rel) => urlByRel[rel];

  // 3. pages
  const existing = await searchPages();
  const pageIds = {};
  for (const p of REF_PAGES) {
    let page = existing.find((x) => x.name === pageName(p.n));
    if (!page) {
      const resp = await api('POST', '/api/page-builder-pages/grouped', createGroupedBody(p.n, { storeId: STORE_ID }), { expectStatus: [200, 201, 204] });
      page = { id: resp?.id || (await searchPages()).find((x) => x.name === pageName(p.n))?.id };
      if (!page.id) throw new Error(`could not create ${pageName(p.n)}`);
    }
    await saveContent(page.id, buildPageContent(p.n, urlOf));
    pageIds[p.n] = page.id;
    log(`  page ${pageName(p.n)} @ ${pagePermalink(p.n)} → ${p.assets.length} image ref(s)`);
  }
  // 4. shared components
  const existingSc = await searchSc();
  const scIds = {};
  for (const sc of SHARED_COMPONENTS) {
    const body = buildScBody(sc.n, STORE_ID, urlOf);
    let id = existingSc.find((c) => c.name === scName(sc.n))?.id || null;
    if (!id) {
      const resp = await api('POST', '/api/page-builder-shared-components', body, { expectStatus: [200, 201] });
      id = resp?.id || (await searchSc()).find((c) => c.name === scName(sc.n))?.id || null;
    } else {
      await api('POST', `/api/page-builder-shared-components/${encodeURIComponent(id)}/content`, body.content, { expectStatus: [200, 201, 204] });
    }
    scIds[sc.n] = id;
    log(`  shared component ${scName(sc.n)}: ${id ? 'ok' : 'NOT CREATED'}`);
  }
  return { pageIds, scIds, urlByRel };
}

// ── read-back: the oracle ────────────────────────────────────────────────────
async function readBack(ctx = {}) {
  const out = { folders: {}, problems: [] };
  const rels = ['', ...new Set(allFolderSpecs().flatMap((f) => { const parts = f.rel.split('/'); return parts.map((_, i) => parts.slice(0, i + 1).join('/')); }))];
  for (const rel of rels) {
    const exp = expectedCounts(rel);
    if (rel === '') { exp.fileCount = 0; exp.folderCount = FOLDERS.filter((f) => !f.rel.includes('/')).length + 1; exp.totalCount = exp.folderCount; }
    const listed = await listFolder(folderUrl(rel)).catch(() => null);
    const s = await pbSearch(folderUrl(rel)).catch((e) => ({ err: e.message }));
    const got = { list: listed ? listed.length : null, listFiles: listed ? listed.filter((k) => k.type === 'blob').length : null, totalCount: s.totalCount, fileCount: s.fileCount };
    const ok = got.list === exp.totalCount && got.totalCount === exp.totalCount && got.fileCount === exp.fileCount;
    if (!ok) out.problems.push(`${rel || '<root>'}: expected total ${exp.totalCount}/files ${exp.fileCount}, got list ${got.list} search total ${got.totalCount}/files ${got.fileCount}`);
    out.folders[rel] = { ...got, expected: exp, ok };
  }
  // mixed with an image accept filter
  const mixImg = await pbSearch(folderUrl('mixed'), { acceptedTypes: ['image/*'], sort: 'name' }).catch((e) => ({ err: e.message }));
  out.mixedImage = { totalCount: mixImg.totalCount, fileCount: mixImg.fileCount, first: mixImg.results?.[0]?.name };
  // p500 by upload time (from the live created/modified dates, not the plan)
  const p500 = (await listFolder(folderUrl('p500'))).filter((k) => k.type === 'blob');
  const byDate = [...p500].sort((a, b) => Date.parse(a.createdDate) - Date.parse(b.createdDate) || a.name.localeCompare(b.name));
  const byName = [...p500].sort((a, b) => a.name.localeCompare(b.name));
  out.p500 = { count: p500.length, firstByName: byName[0]?.name, lastByName: byName.at(-1)?.name, firstByUpload: byDate[0]?.name, lastByUpload: byDate.at(-1)?.name,
    distinctCreated: new Set(p500.map((k) => k.createdDate)).size };
  // references
  const assetUrls = REF_ASSETS.map((a) => ctx.urlByRel?.[a.rel] || `${folderUrl(a.rel.split('/').slice(0, -1).join('/'))}/${a.rel.split('/').pop()}`);
  const refs = await api('POST', '/api/page-builder-assets/references', { storeId: STORE_ID, assetUrls, includePages: true }, { expectStatus: [200] }).catch((e) => ({ err: e.message }));
  const derived = pageRefCounts(); const derivedSc = scRefCounts();
  out.refs = REF_ASSETS.map((a, i) => {
    const r = refs.results?.[i] || {};
    const row = { alias: a.alias, rel: a.rel, assetUrl: assetUrls[i], pages: r.pageReferencesCount, sc: r.sharedComponentReferencesCount, total: r.referencesCount,
      expectedPages: derived[a.rel] || 0, expectedSc: derivedSc[a.rel] || 0, pageIds: (r.pages || []).map((p) => p.id), pageNames: (r.pages || []).map((p) => p.name) };
    if (row.pages !== row.expectedPages || row.sc !== row.expectedSc) out.problems.push(`refs ${a.rel}: expected ${row.expectedPages}p/${row.expectedSc}sc, platform says ${row.pages}p/${row.sc}sc`);
    return row;
  });
  // folder-level lookup from deep/ (folder-delete usage)
  const deepRef = await api('POST', '/api/page-builder-assets/references', { storeId: STORE_ID, folderUrl: folderUrl('deep'), assetUrls: [], includePages: true }, { expectStatus: [200] }).catch((e) => ({ err: e.message }));
  out.deepFolderRefs = { pages: deepRef.results?.[0]?.pageReferencesCount, sc: deepRef.results?.[0]?.sharedComponentReferencesCount, names: (deepRef.results?.[0]?.pages || []).map((p) => p.name) };
  if (out.deepFolderRefs.pages !== 1) out.problems.push(`folder refs deep/: expected 1 page, platform says ${out.deepFolderRefs.pages}`);
  return out;
}

function writeAliases(rb, ctx) {
  const w = {};
  const f = (rel) => folderUrl(rel);
  const cnt = (rel) => rb.folders[rel] || {};
  w.PB_ASSETS_ROOT = { _inline: true, folderUrl: f(''), storeAssetRoot: storeAssetRoot(STORE_ID) };
  w.PB_ASSETS_P500 = { _inline: true, folderUrl: f('p500'), count: rb.p500.count, firstByName: rb.p500.firstByName, lastByName: rb.p500.lastByName, firstByUpload: rb.p500.firstByUpload, lastByUpload: rb.p500.lastByUpload };
  w.PB_ASSETS_MIXED = { _inline: true, folderUrl: f('mixed'), count: cnt('mixed').totalCount, imageCount: rb.mixedImage.fileCount ?? rb.mixedImage.totalCount, firstImage: rb.mixedImage.first };
  w.PB_ASSETS_FOLDERS = { _inline: true, folderUrl: f('folders'), totalCount: cnt('folders').totalCount, fileCount: cnt('folders').fileCount };
  w.PB_ASSETS_DEEP = { _inline: true, folderUrl: f('deep'), leafUrl: f('deep/l1/l2/l3/l4/l5') };
  w.PB_ASSETS_EMPTY = { _inline: true, folderUrl: f('empty'), totalCount: cnt('empty').totalCount };
  const tplDir = FOLDERS.find((x) => x.key === 'TPL_DIR');
  w.PB_ASSETS_TPL = { _inline: true, folderUrl: f('tpl'), file: FOLDERS.find((x) => x.key === 'TPL').files[0], tplFolder: tplDir.rel, tplFolderUrl: f(tplDir.rel) };
  for (const r of rb.refs) w[r.alias] = { _inline: true, assetUrl: r.assetUrl, expectedRefs: r.expectedPages + r.expectedSc, observedPages: r.pages, observedSc: r.sc, observedTotal: r.total, pageIds: r.pageIds };
  w.PB_ASSET_REF_SC = { _inline: true, ids: SHARED_COMPONENTS.map((sc) => ctx?.scIds?.[sc.n] || null), names: SHARED_COMPONENTS.map((sc) => scName(sc.n)) };
  writeEnvAliasOverride(w);
  log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${Object.keys(w).length} PB asset alias(es)`);
}

/**
 * Delete a folder tree BOTTOM-UP. A single recursive DELETE of the root is not reliable: on the
 * file-system provider it 500s "Directory not empty" for a folder holding both files and empty
 * sub-folders (seen live 2026-10-14 on `folders/`). So: walk, delete each folder's files in
 * batches, then delete folders deepest-first.
 */
async function deleteTree(rootUrl) {
  const dirs = []; const stack = [{ url: rootUrl, depth: 0 }];
  while (stack.length) {
    const d = stack.pop(); dirs.push(d);
    const kids = await listFolder(d.url).catch(() => []);
    const blobs = kids.filter((k) => k.type === 'blob').map((k) => k.url);
    for (let i = 0; i < blobs.length; i += 50) {
      const q = blobs.slice(i, i + 50).map((u) => `urls=${encodeURIComponent(u)}`).join('&');
      await api('DELETE', `/api/assets?${q}`, null, { expectStatus: [200, 204] });
    }
    kids.filter((k) => k.type === 'folder').forEach((k) => stack.push({ url: k.url, depth: d.depth + 1 }));
  }
  for (const d of dirs.sort((a, b) => b.depth - a.depth)) {
    await api('DELETE', `/api/assets?urls=${encodeURIComponent(d.url)}`, null, { expectStatus: [200, 204] })
      .catch((e) => verbose(`delete ${d.url}: ${e.message.slice(0, 120)}`));
  }
}

async function teardown() {
  const pages = await searchPages();
  for (const p of pages) { if (!DRY_RUN) await api('DELETE', `/api/page-builder-pages/grouped/${p.id}`, null, { expectStatus: [200, 204, 404] }); log(`  ✗ page ${p.name}`); }
  for (const c of await searchSc()) { if (!DRY_RUN) await api('DELETE', `/api/page-builder-shared-components/${encodeURIComponent(c.id)}`, null, { expectStatus: [200, 204, 404] }); log(`  ✗ shared component ${c.name}`); }
  const parent = await listFolder(storeAssetRoot(STORE_ID));
  const me = parent.find((k) => k.type === 'folder' && k.name === ROOT_NAME);
  if (me && !DRY_RUN) { await deleteTree(me.url); log(`  ✗ folder tree ${ROOT}`); }
  // zero-residue: the parent listing lags a few seconds after a recursive delete
  let residue = 0;
  for (let i = 0; i < 10; i++) {
    residue = await verifyRemoved(async () => [
      ...(await searchPages()), ...(await searchSc()),
      ...(await listFolder(storeAssetRoot(STORE_ID))).filter((k) => k.name === ROOT_NAME),
    ]);
    if (!residue) break; await sleep(3000);
  }
  log(residue ? `⚠ residue: ${residue} entit(y/ies) still present` : '✓ zero residue');
  if (residue) process.exitCode = 1;
}

async function main() {
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); return; }
  const ctx = VERIFY_ONLY ? {} : await seed();
  if (DRY_RUN) { log('DRY RUN complete.'); return; }
  const rb = await readBack(ctx || {});
  log('\n  === read-back (oracle) ===');
  for (const [rel, v] of Object.entries(rb.folders)) log(`   ${(rel || '<root>').padEnd(40)} list ${v.list} | search total ${v.totalCount} files ${v.fileCount} ${v.ok ? '✓' : '✗'}`);
  log(`   mixed image-accept: total ${rb.mixedImage.totalCount} files ${rb.mixedImage.fileCount} first ${rb.mixedImage.first}`);
  log(`   p500: ${rb.p500.count} files, byName ${rb.p500.firstByName}…${rb.p500.lastByName}, byUpload ${rb.p500.firstByUpload}…${rb.p500.lastByUpload}, distinct created ${rb.p500.distinctCreated}`);
  for (const r of rb.refs) log(`   refs ${r.rel}: pages ${r.pages} sc ${r.sc} total ${r.total} (expected ${r.expectedPages}p/${r.expectedSc}sc) ${r.pageNames.join(', ')}`);
  log(`   folder refs deep/: pages ${rb.deepFolderRefs.pages} sc ${rb.deepFolderRefs.sc} ${rb.deepFolderRefs.names.join(', ')}`);
  if (!VERIFY_ONLY) writeAliases(rb, ctx);
  if (rb.problems.length) { log(`\n  ⚠ ${rb.problems.length} read-back mismatch(es):`); rb.problems.forEach((p) => log(`   - ${p}`)); process.exitCode = 1; }
  else log('\n  ✓ read-back matches the spec');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
