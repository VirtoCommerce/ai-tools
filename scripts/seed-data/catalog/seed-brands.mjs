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
 *   2. Store settings — BrandsEnabled=true, BrandCatalogId, BrandPropertyName (the env's value is kept;
 *      `Brand` only when empty). Written only when something differs (GET → mutate → PUT the full store).
 *   3. `Featured` Boolean category property on the brand catalog (drives the "Top brands" row).
 *   4. Per CSV row: a brand category with a Logo + Banner image, a FullReview description, a store SEO
 *      record and Featured. A brand the catalog ALREADY carries (by name or code) and that is not ours
 *      is left alone — the env's own content wins. Ours (code prefix `CODE_PREFIX`, or an image in
 *      `ASSET_FOLDER`) is reconciled. Language = the store's defaultLanguage.
 *   5. `pinned-links` menu entry Brands → /brands — only for an owned catalog (an env with its own
 *      brand catalog already decided its navigation).
 *   6. Re-index the touched categories (event indexation is off on vcst-qa), then verify read-back.
 *
 * Product ↔ brand matching is by NAME: a product shows on a brand page when its BrandPropertyName
 * property value equals the brand category name. These are the sample-data products' brands
 * (Heineken, FABORY, EPSON, …), so the pages fill on any env built from that sample.
 *
 * Teardown: deletes the categories carrying our marker image, the uploaded files, and — for an owned
 * catalog — the catalog, its pinned-links list, and resets BrandsEnabled/BrandCatalogId. Env-owned
 * brands and an env-owned catalog are never deleted.
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
  contentTypeFor, nameKey, isOurCategory, planStoreSettings, settingValue, missingSettings, categoryBody, categoryCode, rowProblems,
} from './brands-specs.mjs';

const REUPLOAD = process.argv.includes('--reupload');
const OWNED_CATALOG_NAME = `${SEED_FAMILY}-${OWNED_CATALOG_SUFFIX}`;

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

async function getMenus() {
  // No catch: a failed read must not pass for "no pinned-links list" and create a second one.
  const r = await api('GET', `/api/cms/${encodeURIComponent(STORE_ID)}/menu`, null, { expectStatus: [200, 204, 404] });
  return Array.isArray(r) ? r : [];
}
const findPinned = (menus, lang) => menus.find((m) => m.name === PINNED_LIST && (m.language || lang) === lang);
const isOnlyOurPinnedLink = (list) => (list?.menuLinks || []).length === 1 && list.menuLinks[0].url === PINNED_LINK.url;

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

async function ensureFeaturedProperty(catalog) {
  const find = (props) => (props || []).find((p) => p.name === FEATURED_PROPERTY && String(p.type).toLowerCase() === 'category');
  const have = find(catalog.properties);
  if (have) { verbose(`property ${FEATURED_PROPERTY}: present (${have.id})`); return have; }
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
  await applyStoreSettings(store, catalog.id);
  const featuredProp = await ensureFeaturedProperty(catalog);

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
    log(`${DRY_RUN ? '[DRY] ' : ''}${cur ? '↻' : '✓'} brand: ${r.brand_name}${r.featured === 'true' ? ' ★' : ''} (${id})`);
    if (id) { touched.push(id); expected.set(id, urls); }
  }

  if (owned) {
    const menus = await getMenus();
    if (!findPinned(menus, lang)) {
      await api('POST', `/api/cms/${encodeURIComponent(STORE_ID)}/menu`, { name: PINNED_LIST, storeId: STORE_ID, language: lang, menuLinks: [{ ...PINNED_LINK }] }, { expectStatus: [200, 201, 204] });
      log(`${DRY_RUN ? '[DRY] ' : ''}✓ menu ${PINNED_LIST}: ${PINNED_LINK.title} → ${PINNED_LINK.url}`);
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
  const store = await getStore();
  const configuredId = settingValue(store.settings, SETTING.catalogId);
  const candidates = [await getCatalog(configuredId), await findCatalogByName(OWNED_CATALOG_NAME).then((c) => c && getCatalog(c.id))]
    .filter((c) => c?.id);
  const catalogs = [...new Map(candidates.map((c) => [c.id, c])).values()];
  let deleted = 0;
  for (const catalog of catalogs) {
    const owned = catalog.name === OWNED_CATALOG_NAME;
    const ours = (await catalogCategories(catalog.id)).filter(isOurCategory);
    if (ours.length) {
      log(`${DRY_RUN ? '[DRY] ' : ''}${catalog.name}: delete ${ours.length} seeded brand(s)`);
      await api('DELETE', `/api/catalog/categories?${ours.map((c) => `ids=${encodeURIComponent(c.id)}`).join('&')}`, null, { expectStatus: [200, 204, 404] });
      deleted += ours.length;
    }
    if (!owned) continue;
    const pinned = findPinned(await getMenus(), store.defaultLanguage);
    if (pinned && isOnlyOurPinnedLink(pinned)) {
      log(`${DRY_RUN ? '[DRY] ' : ''}delete menu ${PINNED_LIST}`);
      await api('DELETE', `/api/cms/${encodeURIComponent(STORE_ID)}/menu?listIds=${encodeURIComponent(pinned.id)}`, null, { expectStatus: [200, 204, 404] });
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
  // Delete only what is there: deleting an absent asset answers 500 on this platform.
  const files = await listAssetFolder();
  for (const f of files) {
    verbose(`${DRY_RUN ? '[DRY] ' : ''}delete asset ${f.name}`);
    await api('DELETE', `/api/assets?urls=${encodeURIComponent(`${ASSET_FOLDER}/${f.name}`)}`, null, { expectStatus: [200, 204] });
  }
  const residue = await verifyRemoved(async () => [
    ...(await Promise.all(catalogs.map(async (c) => ((await getCatalog(c.id)) ? (await catalogCategories(c.id)).filter(isOurCategory) : [])))).flat(),
    ...(await listAssetFolder()),
  ]);
  log(`Teardown: ${deleted} brand(s) deleted, ${files.length} asset(s) deleted, residue ${residue}.`);
  if (residue) throw new Error(`teardown left ${residue} residue`);
}

(async () => {
  console.log(`🏷  Brands${TEARDOWN ? ' — TEARDOWN' : ''}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown(); else await seed();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
