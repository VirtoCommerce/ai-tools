#!/usr/bin/env node
/**
 * seed-category-images.mjs — give the store catalog's categories their real artwork.
 *
 * Source: `test-data/catalogs/category-images.csv` (image_file → category_name) + the PNGs in
 * `test-data/uploads/categories images/`. Contract + pure helpers: `category-images-specs.mjs`.
 *
 * Per row:
 *   1. upload the file to platform asset storage (POST /api/assets?folderUrl=catalog/agent-test-category-images),
 *      reusing an already-serving copy unless --reupload;
 *   2. every category in the STORE's catalog (`STORE_ID` → store.catalog, incl. linked categories from
 *      physical catalogs) whose name matches gets it as images[0] (sortOrder 0 → the storefront `imgSrc`).
 *      Generated `AGENT-TEST-IMG-*` placeholders are dropped; hand-set images are KEPT behind it;
 *   3. the changed categories are re-indexed by id (event-based indexation is off on vcst-qa), then read
 *      back and the asset URL is fetched (verify).
 *
 * A linked category is a PHYSICAL category from another catalog, so its image changes everywhere that
 * category is linked — that is the platform's model, not a side effect of this script.
 *
 * Teardown removes only images whose url lies in the agent-test asset folder (the marker — never the
 * displayed image name), across EVERY category of the store catalog, then deletes the uploaded files and
 * asserts zero residue. It does not restore the generated placeholders; re-running the product/category
 * enrichment does that.
 *
 * Usage:
 *   npm run seed:category-images [-- --dry-run] [--only <image_file|category_name>] [--reupload] [--verbose]
 *   npm run seed:category-images:teardown
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, uploadAsset, assetUrlOk, loadCsv, verifyRemoved,
  ROOT, DRY_RUN, TEARDOWN, ONLY, STORE_ID,
} from '../../lib/seed-common.mjs';
import {
  CSV_PATH, IMAGE_DIR, ASSET_FOLDER, contentTypeFor, nameKey, isOurImage, planImages, stripOurImages, rowProblems,
} from './category-images-specs.mjs';

const REUPLOAD = process.argv.includes('--reupload');

async function storeCatalogCategoryIds() {
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  if (!store?.catalog) throw new Error(`store ${STORE_ID} has no catalog`);
  const entries = [];
  for (let skip = 0; ; skip += 500) {
    const r = await api('POST', '/api/catalog/listentries', { catalogId: store.catalog, searchInChildren: true, objectTypes: ['Category'], take: 500, skip });
    const page = r?.listEntries || r?.results || [];
    entries.push(...page.filter((e) => String(e.type).toLowerCase() === 'category'));
    if (page.length < 500) break;
  }
  return { catalogId: store.catalog, entries };
}

async function getCategories(ids) {
  const out = [];
  for (let i = 0; i < ids.length; i += 30) {
    const q = ids.slice(i, i + 30).map((id) => `ids=${encodeURIComponent(id)}`).join('&');
    out.push(...((await api('GET', `/api/catalog/categories?${q}`)) || []));
  }
  return out;
}

async function listAssetFolder() {
  const r = await api('GET', `/api/assets?folderUrl=${encodeURIComponent(ASSET_FOLDER)}`, null, { expectStatus: [200, 201, 404] }).catch(() => null);
  return (r?.results || []).filter((x) => x.type !== 'folder');
}

async function ensureAsset(file, listed) {
  const existing = listed.find((x) => x.name === file);
  if (!REUPLOAD && existing?.url && await assetUrlOk(existing.url)) { verbose(`${file}: already serving — reused`); return existing.url; }
  const info = await uploadAsset(ASSET_FOLDER, file, readFileSync(join(ROOT, IMAGE_DIR, file)), contentTypeFor(file));
  verbose(`${file}: uploaded → ${info.url}`);
  return info.url;
}

async function reindex(ids) {
  if (!ids.length || DRY_RUN) return;
  await api('POST', '/api/search/indexes/index', [{ documentType: 'Category', documentIds: ids }], { expectStatus: [200, 204] });
}

async function seed() {
  const header = Object.keys(loadCsv(CSV_PATH)[0] || {});
  let rows = loadCsv(CSV_PATH);
  const problems = rowProblems(rows, header, (f) => existsSync(join(ROOT, IMAGE_DIR, f)));
  if (problems.length) { problems.forEach((p) => console.error(`  ✗ ${p}`)); throw new Error(`${CSV_PATH} failed its contract (run npm run td:validate:category-images)`); }
  if (ONLY) rows = rows.filter((r) => r.image_file === ONLY || nameKey(r.category_name) === nameKey(ONLY));
  if (!rows.length) throw new Error(`--only ${ONLY}: no matching row`);

  const { catalogId, entries } = await storeCatalogCategoryIds();
  log(`Store ${STORE_ID} → catalog ${catalogId}: ${entries.length} categories`);
  const byName = new Map();
  for (const e of entries) { const k = nameKey(e.name); if (!byName.has(k)) byName.set(k, []); byName.get(k).push(e.id); }

  const listed = DRY_RUN ? [] : await listAssetFolder();
  const changed = []; const unmatched = []; const expected = new Map(); let unchanged = 0;
  for (const r of rows) {
    const ids = [...new Set(byName.get(nameKey(r.category_name)) || [])];
    if (!ids.length) { unmatched.push(r.category_name); continue; }
    const url = await ensureAsset(r.image_file, listed);
    for (const cat of await getCategories(ids)) {
      const plan = planImages(cat.images, { url, name: r.image_file });
      expected.set(cat.id, url);
      if (!plan.changed) { unchanged++; verbose(`${cat.name} (${cat.id}): already in shape`); continue; }
      const dropped = (cat.images || []).length - (plan.images.length - 1);
      log(`${DRY_RUN ? '[DRY] ' : ''}${cat.name} [${cat.catalogId === catalogId ? 'own' : 'linked'}] ← ${r.image_file}${dropped ? ` (drops ${dropped} placeholder/old)` : ''}${plan.images.length > 1 ? ` (+${plan.images.length - 1} kept)` : ''}`);
      await api('POST', '/api/catalog/categories', { ...cat, images: plan.images }, { expectStatus: [200, 201, 204] });
      changed.push(cat.id);
    }
  }
  await reindex(changed);

  // Verify: images[0] is ours and the asset serves.
  let bad = 0;
  if (!DRY_RUN) {
    for (const cat of await getCategories([...expected.keys()])) {
      const first = [...(cat.images || [])].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
      if (first?.url !== expected.get(cat.id)) { bad++; log(`✗ ${cat.name} (${cat.id}): images[0] is ${first?.url || 'none'}`); }
    }
    for (const url of new Set(expected.values())) if (!(await assetUrlOk(url))) { bad++; log(`✗ asset does not serve: ${url}`); }
  }
  log(`Done: ${changed.length} categor${changed.length === 1 ? 'y' : 'ies'} updated, ${unchanged} already in shape, ${expected.size} verified${bad ? `, ${bad} FAILED` : ''}.`);
  if (unmatched.length) log(`No category named: ${unmatched.join(', ')} (not in ${STORE_ID}'s catalog on this env)`);
  if (bad) throw new Error(`${bad} verification failure(s)`);
}

async function teardown() {
  const { entries } = await storeCatalogCategoryIds();
  const ids = [...new Set(entries.map((e) => e.id))];
  const touched = [];
  for (const cat of await getCategories(ids)) {
    const plan = stripOurImages(cat.images);
    if (!plan.changed) continue;
    log(`${DRY_RUN ? '[DRY] ' : ''}${cat.name} (${cat.id}): remove seeded image`);
    await api('POST', '/api/catalog/categories', { ...cat, images: plan.images }, { expectStatus: [200, 201, 204] });
    touched.push(cat.id);
  }
  await reindex(touched);
  // Delete only what is there: deleting an absent asset answers 500 on this platform.
  const files = await listAssetFolder();
  for (const f of files) {
    log(`${DRY_RUN ? '[DRY] ' : ''}delete asset ${f.name}`);
    await api('DELETE', `/api/assets?urls=${encodeURIComponent(`${ASSET_FOLDER}/${f.name}`)}`, null, { expectStatus: [200, 204] });
  }
  const residue = await verifyRemoved(async () => [
    ...(await getCategories(touched)).filter((c) => (c.images || []).some(isOurImage)),
    ...(await listAssetFolder()),
  ]);
  log(`Teardown: ${touched.length} categories cleaned, ${files.length} asset(s) deleted, residue ${residue}.`);
  if (residue) throw new Error(`teardown left ${residue} residue`);
}

(async () => {
  console.log(`🖼  Category images${TEARDOWN ? ' — TEARDOWN' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown(); else await seed();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
