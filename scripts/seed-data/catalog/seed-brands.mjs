#!/usr/bin/env node
/**
 * seed-brands.mjs — the storefront Brands catalog (`/brands`, brand pages, "Top brands" logo row).
 *
 * Source: `test-data/catalogs/brands.csv` + `test-data/uploads/brands/` — the 19 brands the
 * vc-sample-data B2B store ships (VCST-3286). Contract + pure helpers: `brands-specs.mjs`.
 *
 * ADDITIVE, never overriding what an env already has:
 *   1. Brand catalog — the one the store's `BrandCatalogId` setting names. Only when the store has none
 *      (or it points at a deleted catalog) is `AGENT-TEST-SEED-Brands` created, with the store-scoped SEO
 *      record `brands` that `/brands` resolves through. That catalog is "owned": teardown removes it.
 *   2. Store settings — BrandsEnabled=true, BrandCatalogId, BrandPropertyName (`Brand` only when empty).
 *      OWNED catalog only (GET → mutate → PUT the full store, only when something differs). On an
 *      env-owned catalog the settings are the env's decision: what /brands would need is logged, not written.
 *   3. `Featured` Boolean category property (drives the "Top brands" row) — created on an owned catalog;
 *      on an env-owned one it is used when present and otherwise logged as missing, never created.
 *   4. Per CSV row: a brand category with a Logo + Banner image, a FullReview description, a store SEO
 *      record and Featured. A brand the catalog ALREADY carries (by name or code) and that is not ours
 *      is left alone — the env's own content wins. Ours (`isOurCategory`: code prefix `CODE_PREFIX`, or
 *      an image in `ASSET_FOLDER`) is reconciled, its store SEO record included. Language = the store's
 *      defaultLanguage.
 *   5. `pinned-links` menu entry Brands → /brands — only for an owned catalog (an env with its own
 *      brand catalog already decided its navigation): the list is created, or the link appended to it.
 *   6. Re-index the touched categories (event indexation is off on vcst-qa), then verify read-back.
 *
 * So on an env-owned catalog the only writes are our categories and asset files, and teardown removes
 * exactly those.
 *
 * Product ↔ brand matching is by NAME: a product shows on a brand page when its BrandPropertyName
 * property value equals the brand category name. These are the sample-data products' brands
 * (Heineken, FABORY, EPSON, …), so the pages fill on any env built from that sample.
 *
 * Teardown: deletes our categories (`isOurCategory`), purges their search-index documents (a delete
 * does not reach the index while event indexation is off), deletes the uploaded files and — for an
 * owned catalog — removes our pinned link (the whole list when it holds nothing else), resets
 * BrandsEnabled/BrandCatalogId and deletes the catalog. Env-owned brands and an env-owned catalog are
 * never deleted. BrandPropertyName is left as is: whether it was empty before is not known, and with
 * BrandsEnabled=false it has no effect. Teardown is all-or-nothing; `--only` is refused.
 *
 * Usage:
 *   npm run seed:brands [-- --dry-run] [--only <brand_code>] [--reupload] [--verbose]
 *   npm run seed:brands:teardown
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, uploadAsset, assetUrlOk, loadCsv, verifyRemoved, buildStoreSeo,
  ROOT, DRY_RUN, TEARDOWN, ONLY, STORE_ID, SEED_FAMILY,
} from '../../lib/seed-common.mjs';
import {
  CSV_PATH, IMAGE_DIR, ASSET_FOLDER, OWNED_CATALOG_SUFFIX, SETTING, FEATURED_PROPERTY, PINNED_LIST, PINNED_LINK,
  contentTypeFor, nameKey, isOurCategory, isTrue, planStoreSettings, settingValue, missingSettings, categoryBody, categoryCode, rowProblems,
} from './brands-specs.mjs';
import { deletionWindows } from './barcode-specs.mjs';

const REUPLOAD = process.argv.includes('--reupload');
const OWNED_CATALOG_NAME = `${SEED_FAMILY}-${OWNED_CATALOG_SUFFIX}`;
const PURGE_TIMEOUT_MS = 180_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const getStore = () => api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`, null, { expectStatus: [200] });
// Only a 404 means "no such catalog". Every other failure THROWS: read as "absent", a transient 5xx on
// the env's configured brand catalog would make the seeder create its own and repoint BrandCatalogId.
async function getCatalog(id) {
  if (!id) return null;
  const c = await api('GET', `/api/catalog/catalogs/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
  return c?.id ? c : null;
}

async function findCatalogByName(name) {
  const r = await api('POST', '/api/catalog/catalogs/search', { take: 500 }, { expectStatus: [200, 201] });
  return (r?.results || []).find((c) => c.name === name) || null;
}

async function catalogCategories(catalogId) {
  const ids = [];
  for (let skip = 0; ; skip += 500) {
    const r = await api('POST', '/api/catalog/listentries', { catalogId, objectTypes: ['Category'], take: 500, skip });
    const page = r?.listEntries || r?.results || [];
    ids.push(...page.filter((e) => String(e.type).toLowerCase() === 'category').map((e) => e.id));
    if (page.length < 500) break;
  }
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

/** Ids among `ids` that still have a Category document in the search index. */
async function indexedCategories(ids) {
  const left = [];
  for (const id of ids) {
    const doc = (await api('GET', `/api/search/indexes/index/Category/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] }) || [])[0];
    if (doc) left.push(id);
  }
  return left;
}

/**
 * Remove the index documents of deleted categories. Indexing explicit documentIds only (re)builds — a
 * deleted category builds nothing and its document stays — so this replays the change feed for a window
 * around the deletion (`deletionWindows`, the barcode seeder's mechanism), whose Deleted entries become
 * index removals. Returns the ids still indexed when it gives up.
 */
async function purgeIndexDocs(deleted) {
  const ids = deleted.map((d) => d.id);
  if (!ids.length || DRY_RUN || !(await indexedCategories(ids)).length) return [];
  const windows = deletionWindows(deleted.map((d) => d.at));
  const request = () => api('POST', '/api/search/indexes/index', windows.map((w) => ({ documentType: 'Category', ...w })), { expectStatus: [200, 204] });
  await request();
  log(`↻ index purge requested for ${ids.length} deleted brand document(s)`);
  const t0 = Date.now();
  let retried = false;
  for (;;) {
    const left = await indexedCategories(ids);
    if (!left.length) { log(`✓ ${ids.length} deleted brand document(s) gone from the index`); return []; }
    // Another indexation holding the job lock makes ours a silent no-op — re-request once.
    if (!retried && Date.now() - t0 > 60_000) { await request(); retried = true; verbose('index purge re-requested'); }
    if (Date.now() - t0 > PURGE_TIMEOUT_MS) return left;
    await sleep(10_000);
  }
}

async function getMenus() {
  // No catch: a failed read must not pass for "no pinned-links list" and create a second one.
  const r = await api('GET', `/api/cms/${encodeURIComponent(STORE_ID)}/menu`, null, { expectStatus: [200, 204, 404] });
  return Array.isArray(r) ? r : [];
}
const findPinned = (menus, lang) => menus.find((m) => m.name === PINNED_LIST && (m.language || lang) === lang);
const isOurPinnedLink = (l) => l?.url === PINNED_LINK.url && l?.title === PINNED_LINK.title;
const saveMenu = (list) => api('POST', `/api/cms/${encodeURIComponent(STORE_ID)}/menu`, list, { expectStatus: [200, 201, 204] });

/** Brand catalog the store uses; creates the owned one when none is configured. */
async function resolveBrandCatalog(store, lang) {
  const configured = await getCatalog(settingValue(store.settings, SETTING.catalogId));
  if (configured?.id) return { catalog: configured, owned: configured.name === OWNED_CATALOG_NAME };
  const found = await findCatalogByName(OWNED_CATALOG_NAME);
  if (found) return { catalog: await getCatalog(found.id), owned: true };
  const body = {
    name: OWNED_CATALOG_NAME, isVirtual: false,
    languages: [{ languageCode: lang, isDefault: true }],
    seoInfos: [{ ...buildStoreSeo({ semanticUrl: 'brands', pageTitle: 'Brands', languageCode: lang }), objectType: 'Catalog', isActive: true }],
  };
  const created = await api('POST', '/api/catalog/catalogs', body, { expectStatus: [200, 201] });
  log(`✓ catalog: ${OWNED_CATALOG_NAME} (${created?.id})`);
  return { catalog: DRY_RUN ? { ...body, id: created.id, properties: [] } : await getCatalog(created.id), owned: true };
}

async function ensureFeaturedProperty(catalog, { create }) {
  const find = (props) => (props || []).find((p) => p.name === FEATURED_PROPERTY && String(p.type).toLowerCase() === 'category');
  const have = find(catalog.properties);
  if (have) { verbose(`property ${FEATURED_PROPERTY}: present (${have.id})`); return have; }
  if (!create) {
    log(`⚠ catalog ${catalog.name} has no Category property ${FEATURED_PROPERTY} — no "Top brands" row; not created (env-owned catalog)`);
    return null;
  }
  await api('POST', '/api/catalog/properties', {
    isNew: true, name: FEATURED_PROPERTY, catalogId: catalog.id, type: 'Category', valueType: 'Boolean',
    dictionary: false, required: false, multivalue: false, multilanguage: false,
  }, { expectStatus: [200, 201, 204] });
  const prop = DRY_RUN ? { id: 'dry-featured' } : find((await getCatalog(catalog.id))?.properties);
  if (!prop) throw new Error(`${FEATURED_PROPERTY} property not readable after create on catalog ${catalog.id}`);
  log(`✓ property: ${FEATURED_PROPERTY} (${prop.id})`);
  return prop;
}

async function applyStoreSettings(store, catalogId) {
  const plan = planStoreSettings(store.settings, catalogId);
  if (!plan.length) { verbose('store brand settings already in shape'); return; }
  for (const ch of plan) {
    log(`${DRY_RUN ? '[DRY] ' : ''}store setting ${ch.name}: ${JSON.stringify(ch.from)} → ${JSON.stringify(ch.to)}`);
    store.settings.find((s) => s.name === ch.name).value = ch.to;
  }
  await api('PUT', '/api/stores', store, { expectStatus: [200, 201, 204] });
}

async function seed() {
  const all = loadCsv(CSV_PATH);
  const rows = ONLY ? all.filter((r) => r.brand_code === ONLY || nameKey(r.brand_name) === nameKey(ONLY)) : all;
  if (!rows.length) throw new Error(`--only ${ONLY} matched no brand in ${CSV_PATH}`);
  // Same contract td:validate:brands enforces — checked BEFORE the first write, so a missing image
  // cannot fail the run halfway (settings written, some brands created, nothing re-indexed).
  const problems = rowProblems(all, Object.keys(all[0] || {}), (f) => existsSync(join(ROOT, IMAGE_DIR, f)));
  if (problems.length) throw new Error(`${CSV_PATH} is not seedable:\n    ${problems.join('\n    ')}`);

  const store = await getStore();
  const missing = missingSettings(store.settings);
  if (missing.length) {
    log(`⚠ store ${STORE_ID} lacks ${missing.join(', ')} — this platform build has no brand feature; skipped.`);
    return;
  }
  const lang = store.defaultLanguage;
  if (!lang) throw new Error(`store ${STORE_ID} has no defaultLanguage`);
  const { catalog, owned } = await resolveBrandCatalog(store, lang);
  log(`Brand catalog: ${catalog.name} (${catalog.id})${owned ? ' [owned]' : ' [env-owned — brands are added, nothing is replaced]'}`);
  if (!owned && !(catalog.seoInfos || []).some((s) => s.semanticUrl)) {
    log(`⚠ catalog ${catalog.name} has no SEO record — /brands may 404 until one is added (not changed: env-owned catalog)`);
  }
  if (owned) await applyStoreSettings(store, catalog.id);
  else {
    for (const ch of planStoreSettings(store.settings, catalog.id)) {
      log(`⚠ store setting ${ch.name} is ${JSON.stringify(ch.from)} — not changed (env-owned brand catalog); /brands needs ${JSON.stringify(ch.to)}`);
    }
  }
  const featuredProp = await ensureFeaturedProperty(catalog, { create: owned });

  const existing = DRY_RUN && String(catalog.id).startsWith('dry-') ? [] : await catalogCategories(catalog.id);
  const byName = new Map(existing.map((c) => [nameKey(c.name), c]));
  const byCode = new Map(existing.map((c) => [c.code, c]));
  const listed = await listAssetFolder();
  const touched = []; const kept = []; const expected = new Map();

  for (const r of rows) {
    const cur = byName.get(nameKey(r.brand_name)) || byCode.get(categoryCode(r)) || byCode.get(r.brand_code) || null;
    if (cur && !isOurCategory(cur)) { kept.push(r.brand_name); verbose(`${r.brand_name}: env already has it (${cur.id}) — left alone`); continue; }
    const urls = { logo: await ensureAsset(r.logo_file, listed), banner: await ensureAsset(r.banner_file, listed) };
    const seo = buildStoreSeo({ semanticUrl: r.brand_code, pageTitle: r.brand_name, metaDescription: r.description, languageCode: lang });
    const body = categoryBody(r, { catalogId: catalog.id, urls, featuredProp, seo, lang, existing: cur });
    const saved = await api('POST', '/api/catalog/categories', body, { expectStatus: [200, 201, 204] });
    const id = cur?.id || saved?.id;
    log(`${DRY_RUN ? '[DRY] ' : ''}${cur ? '↻' : '✓'} brand: ${r.brand_name}${isTrue(r.featured) ? ' ★' : ''} (${id})`);
    if (id) { touched.push(id); expected.set(id, urls); }
  }

  if (owned) {
    const pinned = findPinned(await getMenus(), lang);
    if (!pinned) {
      await saveMenu({ name: PINNED_LIST, storeId: STORE_ID, language: lang, menuLinks: [{ ...PINNED_LINK }] });
      log(`${DRY_RUN ? '[DRY] ' : ''}✓ menu ${PINNED_LIST}: ${PINNED_LINK.title} → ${PINNED_LINK.url}`);
    } else if (!(pinned.menuLinks || []).some((l) => l.url === PINNED_LINK.url)) {
      await saveMenu({ ...pinned, menuLinks: [...(pinned.menuLinks || []), { ...PINNED_LINK }] });
      log(`${DRY_RUN ? '[DRY] ' : ''}✓ menu ${PINNED_LIST}: ${PINNED_LINK.title} → ${PINNED_LINK.url} appended`);
    }
  }
  await reindex(touched);

  let bad = 0;
  if (!DRY_RUN) {
    const now = new Map((await catalogCategories(catalog.id)).map((c) => [c.id, c]));
    for (const [id, urls] of expected) {
      const c = now.get(id);
      if (!c) { bad++; log(`✗ brand ${id} not found in catalog after save`); continue; }
      for (const [group, url] of [['Logo', urls.logo], ['Banner', urls.banner]]) {
        if (!(c.images || []).some((im) => im.url === url && im.group === group)) { bad++; log(`✗ ${c.name}: ${group} image missing`); }
      }
    }
    const served = new Set([...expected.values()].flatMap((u) => [u.logo, u.banner]));
    for (const url of served) if (!(await assetUrlOk(url))) { bad++; log(`✗ asset does not serve: ${url}`); }
  }
  log(`Done: ${touched.length} brand(s) seeded, ${kept.length} already on the env (left alone)${bad ? `, ${bad} FAILED` : ''}.`);
  if (kept.length) verbose(`env-owned: ${kept.join(', ')}`);
  if (bad) throw new Error(`${bad} verification failure(s)`);
}

async function teardown() {
  // A partial teardown would leave an owned catalog, its settings and menu pointing at brands that are gone.
  if (ONLY) throw new Error('--only is not supported with --teardown: teardown removes every seeded brand');
  const store = await getStore();
  const configuredId = settingValue(store.settings, SETTING.catalogId);
  const candidates = [await getCatalog(configuredId), await findCatalogByName(OWNED_CATALOG_NAME).then((c) => c && getCatalog(c.id))]
    .filter((c) => c?.id);
  const catalogs = [...new Map(candidates.map((c) => [c.id, c])).values()];
  const deleted = [];
  for (const catalog of catalogs) {
    const owned = catalog.name === OWNED_CATALOG_NAME;
    const ours = (await catalogCategories(catalog.id)).filter(isOurCategory);
    if (ours.length) {
      log(`${DRY_RUN ? '[DRY] ' : ''}${catalog.name}: delete ${ours.length} seeded brand(s)`);
      await api('DELETE', `/api/catalog/categories?${ours.map((c) => `ids=${encodeURIComponent(c.id)}`).join('&')}`, null, { expectStatus: [200, 204, 404] });
      const at = new Date().toISOString();
      deleted.push(...ours.map((c) => ({ id: c.id, at })));
    }
    if (!owned) continue;
    const pinned = findPinned(await getMenus(), store.defaultLanguage);
    const others = (pinned?.menuLinks || []).filter((l) => !isOurPinnedLink(l));
    if (pinned && others.length === (pinned.menuLinks || []).length) verbose(`menu ${PINNED_LIST}: no ${PINNED_LINK.url} link of ours`);
    else if (pinned && !others.length) {
      log(`${DRY_RUN ? '[DRY] ' : ''}delete menu ${PINNED_LIST}`);
      await api('DELETE', `/api/cms/${encodeURIComponent(STORE_ID)}/menu?listIds=${encodeURIComponent(pinned.id)}`, null, { expectStatus: [200, 204, 404] });
    } else if (pinned) {
      log(`${DRY_RUN ? '[DRY] ' : ''}menu ${PINNED_LIST}: remove ${PINNED_LINK.url}, keep ${others.length} other link(s)`);
      await saveMenu({ ...pinned, menuLinks: others });
    }
    if (configuredId === catalog.id && !missingSettings(store.settings).length) {
      log(`${DRY_RUN ? '[DRY] ' : ''}store settings: ${SETTING.enabled}=false, ${SETTING.catalogId}=""`);
      store.settings.find((s) => s.name === SETTING.enabled).value = false;
      store.settings.find((s) => s.name === SETTING.catalogId).value = '';
      await api('PUT', '/api/stores', store, { expectStatus: [200, 201, 204] });
    }
    log(`${DRY_RUN ? '[DRY] ' : ''}delete catalog ${catalog.name} (${catalog.id})`);
    await api('DELETE', `/api/catalog/catalogs/${encodeURIComponent(catalog.id)}`, null, { expectStatus: [200, 204, 404] });
  }
  const stillIndexed = await purgeIndexDocs(deleted);
  if (stillIndexed.length) log(`✗ ${stillIndexed.length} deleted brand document(s) still indexed after ${PURGE_TIMEOUT_MS / 1000}s: ${stillIndexed.join(', ')}`);
  // Delete only what is there: deleting an absent asset answers 500 on this platform.
  const files = await listAssetFolder();
  for (const f of files) {
    verbose(`${DRY_RUN ? '[DRY] ' : ''}delete asset ${f.name}`);
    await api('DELETE', `/api/assets?urls=${encodeURIComponent(`${ASSET_FOLDER}/${f.name}`)}`, null, { expectStatus: [200, 204] });
  }
  // Residue = the database AND the index: a category gone from the DB but still indexed is still on /brands.
  const residue = await verifyRemoved(async () => [
    ...(await Promise.all(catalogs.map(async (c) => ((await getCatalog(c.id)) ? (await catalogCategories(c.id)).filter(isOurCategory) : [])))).flat(),
    ...(await listAssetFolder()),
    ...(DRY_RUN ? [] : await indexedCategories(deleted.map((d) => d.id))),
  ]);
  log(`Teardown: ${deleted.length} brand(s) deleted, ${files.length} asset(s) deleted, residue ${residue}.`);
  if (residue) throw new Error(`teardown left ${residue} residue`);
}

(async () => {
  console.log(`🏷  Brands${TEARDOWN ? ' — TEARDOWN' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown(); else await seed();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
