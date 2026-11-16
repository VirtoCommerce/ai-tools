#!/usr/bin/env node
/**
 * seed-locale-slug-category.mjs — the locale↔slug collision category (L10N-ROUTE-001/002, suite 046).
 *
 * Creates a TOP-LEVEL storefront category whose slug starts with a store locale's 2-letter code, with
 * the same slug in every store language, and links it into the root of the store's virtual catalog.
 * Rules: ./locale-slug-specs.mjs. Data: test-data/catalogs/locale-slug-categories.csv.
 * Runtime category id → aliases.<env>.json (via syncEnvAliases), never the CSV.
 *
 * USAGE:
 *   node scripts/seed-data/catalog/seed-locale-slug-category.mjs [--dry-run] [--verbose]
 *   node scripts/seed-data/catalog/seed-locale-slug-category.mjs --teardown
 *
 * Safety: ENV_RISK gate, idempotent find-by-code, AGENT-TEST- naming, reverse teardown with
 * verifyRemoved. Touches no store setting: the store's languages are READ only.
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import {
  DRY_RUN, VERBOSE, TEARDOWN, BACK_URL, STORE_ID,
  log, verbose, assertSafeTarget, auth, api, loadCsv, ensureCatalogs, syncEnvAliases, verifyRemoved, idsParam,
} from '../../lib/seed-common.mjs';
import { CSV_SOURCE, SEED_PREFIX, loadFixtures, validateFixtureShape, buildSeoInfos } from './locale-slug-specs.mjs';

const rows = loadCsv(`test-data/${CSV_SOURCE.file}`);
const FIXTURES = loadFixtures(rows).filter((f) => f.seeded);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function gql(query, variables = {}) {
  const res = await fetch(`${BACK_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query, variables }) });
  const j = await res.json().catch(() => null);
  if (!res.ok || j?.errors?.length) throw new Error(`graphql ${res.status}: ${JSON.stringify(j?.errors || '').slice(0, 240)}`);
  return j.data;
}

/** DB-backed exact-code lookup across all catalogs (no index lag). */
async function findCategoryByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { keyword: code, take: 50 }, { expectStatus: [200, 201] });
  return (r?.listEntries || r?.results || []).find((e) => e.type === 'category' && e.code === code) || null;
}

async function storeContext() {
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  const vc = await api('GET', `/api/catalog/catalogs/${store.catalog}`);
  if (!vc?.isVirtual) throw new Error(`store ${STORE_ID} catalog ${store.catalog} is not virtual — refusing to link a category into a physical catalog`);
  return { languages: store.languages || [], virtualCatalogId: store.catalog };
}

/** xAPI proof: top-level on the storefront + the slug resolves to THIS category in every language. */
async function prove(fx, id) {
  const q = `query($s:String!,$c:String!,$p:String!){
    childCategories(storeId:$s,cultureName:$c,maxLevel:1,onlyActive:true){ childCategories{ id name slug } }
    slugInfo(storeId:$s,cultureName:$c,permalink:$p){ entityInfo{ objectId objectType semanticUrl languageCode } } }`;
  for (let i = 0; i < 20; i++) {
    const res = [];
    for (const lang of fx.languages) {
      const d = await gql(q, { s: STORE_ID, c: lang, p: fx.slug }).catch((e) => { verbose(e.message); return null; });
      const top = (d?.childCategories?.childCategories || []).find((c) => c.id === id);
      const e = d?.slugInfo?.entityInfo;
      res.push({ lang, top: !!top, topSlug: top?.slug, slugOk: e?.objectId === id && /category/i.test(e?.objectType || ''), seoLang: e?.languageCode });
    }
    if (res.every((r) => r.top && r.slugOk)) {
      log('');
      log('✓ storefront (xAPI) proof:');
      for (const r of res) log(`    ${r.lang}: top-level ✓ (slug ${r.topSlug}); slugInfo("${fx.slug}") → this category (seo ${r.seoLang})`);
      return;
    }
    verbose(`waiting: ${JSON.stringify(res)}`);
    await sleep(6000);
  }
  throw new Error(`${fx.key}: the storefront never listed the category top-level / resolved its slug in every language (2 min)`);
}

async function main() {
  assertSafeTarget();
  await auth();
  console.log(`\n🌱 Locale-slug collision categor${FIXTURES.length === 1 ? 'y' : 'ies'}${DRY_RUN ? ' (DRY RUN)' : ''}`);
  const ctx = await storeContext();
  const problems = validateFixtureShape(rows, ctx.languages);
  if (problems.length) {
    console.error(`ABORT: ${CSV_SOURCE.file} cannot make L10N-ROUTE-001/002 decidable on ${STORE_ID}:`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(2);
  }
  const cats = await ensureCatalogs(api);
  const physical = cats['B2B-Electronics'];
  if (!physical?.id) throw new Error('seed physical catalog B2B-Electronics not resolvable');

  const ids = {};
  for (const fx of FIXTURES) {
    let cat = await findCategoryByCode(fx.code);
    const seoInfos = buildSeoInfos(fx, STORE_ID);
    if (!cat) {
      cat = await api('POST', '/api/catalog/categories', { catalogId: physical.id, parentId: null, name: fx.name, code: fx.code, isActive: true, priority: 1, seoInfos }, { expectStatus: [200, 201] });
      log(`✓ category ${fx.name} → ${cat?.id}`);
    } else if (!DRY_RUN) {
      const full = await api('GET', `/api/catalog/categories/${cat.id}`);
      await api('POST', '/api/catalog/categories', { ...full, name: fx.name, isActive: true, seoInfos }, { expectStatus: [200, 201, 204] });
      verbose(`↻ ${fx.code} (${cat.id}) — SEO re-applied`);
    }
    if (DRY_RUN) continue;
    await api('POST', '/api/catalog/listentrylinks', [{ listEntryId: cat.id, listEntryType: 'category', catalogId: ctx.virtualCatalogId }], { expectStatus: [200, 204] })
      .catch((e) => (/PK_|duplicate/i.test(e.message) ? verbose('link already present') : Promise.reject(e)));
    await api('POST', '/api/search/indexes/index', [{ documentType: 'Category', documentIds: [cat.id], rebuild: false }], { expectStatus: [200, 204] });
    ids[fx.key] = { category_id: cat.id };
    await prove(fx, cat.id);
    log(`    routes: ${fx.url} and /<locale-prefix>${fx.url} (collision locale: ${fx.collisionLocale})`);
  }
  if (!DRY_RUN) {
    syncEnvAliases(CSV_SOURCE.key, ids);
    log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${Object.keys(ids).join(', ')} category ids`);
  }
  console.log(`\n✅ ${DRY_RUN ? 'dry run complete' : 'seeded'}`);
}

async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 Locale-slug teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const found = [];
  for (const fx of FIXTURES) {
    const c = await findCategoryByCode(fx.code);
    if (!c) continue;
    if (!c.name?.startsWith(SEED_PREFIX)) { log(`⚠ skip ${fx.code}: "${c.name}" lacks ${SEED_PREFIX}`); continue; }
    found.push(c.id);
  }
  if (found.length && !DRY_RUN) {
    await api('DELETE', `/api/catalog/categories?${idsParam(found)}`, null, { expectStatus: [200, 204, 404] });
    await api('POST', '/api/search/indexes/index', [{ documentType: 'Category', documentIds: found, rebuild: false }], { expectStatus: [200, 204] }).catch(() => {});
  }
  log(found.length ? `✗ deleted ${found.length} categor${found.length === 1 ? 'y' : 'ies'}` : '– nothing to delete');
  const residual = await verifyRemoved(async () => {
    const left = [];
    for (const fx of FIXTURES) { const c = await findCategoryByCode(fx.code); if (c?.name?.startsWith(SEED_PREFIX)) left.push(c.id); }
    return left;
  });
  console.log(residual === 0 ? '\n✅ Locale-slug teardown verified — 0 residue' : `\n⚠ teardown incomplete — ${residual} remain`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ SEED FAILED: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
