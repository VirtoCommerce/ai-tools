#!/usr/bin/env node
/**
 * scripts/seed-data/seed-configurable.mjs
 *
 * SINGLE consolidated seeder for EVERY script-created configurable product in
 * test-data/products/configurable-products.csv (CFG-012..CFG-032 + CFG-FILE).
 * Replaces the four legacy per-family scripts that were ~90% duplicated:
 *   - seed-configurable-products.mjs        (base: 012–021,017,019,FILE)
 *   - seed-conditional-sections-extended.mjs (conditional cascades: 022–029)
 *   - seed-default-option-cfg.mjs           (default option: 030,031)
 *   - seed-bike-flat-cfg.mjs                (per-option quantity: 032)
 *
 * Not governed here: CFG-001..CFG-011 are restored/live env-native products
 * (referenced by name/slug, never created by a seeder) — see the CSV.
 *
 * One spec table + one create/update path covers the full feature union:
 *   Product | Text | File sections · per-option price / salePrice / stock (OOS) /
 *   quantity / isDefault · dependsOn cascade wiring · parent basePrice / salePrice.
 *
 * Idempotency is by product CODE (which embeds the original per-family seed date),
 * so re-running against an already-seeded env reuses entities — never duplicates.
 * Each family keeps its ORIGINAL catalog/category/pricelist names for the same
 * reason; a group is only ensured if a spec in scope uses it.
 *
 * USAGE:
 *   node scripts/seed-data/seed-configurable.mjs [flags]
 *     --dry-run                reads only, no writes
 *     --verbose                log every call
 *     --only CFG-013           seed/teardown a single CSV id
 *     --group base|conditional|default|bike   seed/teardown one family
 *     --teardown               remove seeded products (see teardown notes below)
 *
 * Safety: ENV_RISK gate via seed-common.assertSafeTarget() (blocks production;
 *   override --allow-admin-writes-on-prod). Writes runtime GUIDs (product_id_guid
 *   + configuration_id) to test-data/aliases.{env}.json via syncEnvAliases; no-op
 *   for the primary vcst env (its GUIDs stay curated in aliases.json). See
 *   .claude/rules/test-data.md.
 */

import {
  api, auth, assertSafeTarget, ensureVirtualCatalog, ensureFulfillmentCenter,
  syncEnvAliases, verifyRemoved, enrichProductContent, log, verbose, DRY_RUN, ONLY, TEARDOWN, BACK_URL, STORE_ID, idsParam, loadCsv,
} from '../lib/seed-common.mjs';
const argv = process.argv.slice(2);

// Category SEO (pageTitle / slug / meta) sourced from test-data/catalogs/categories.csv, keyed by
// category_name. These categories are created here (not by the category-tree seeders), so their
// SEO title lives in the shared CSV under the CAT-CFG marker catalog (skipped by the tree seeders).
const CATEGORY_SEO = (() => {
  const map = {};
  let rows = [];
  try { rows = loadCsv('test-data/catalogs/categories.csv'); } catch { rows = []; }
  for (const r of rows) {
    if (!r.category_name) continue;
    map[r.category_name.trim().toLowerCase()] = {
      pageTitle: (r.meta_title || r.category_name).trim(),
      metaDescription: (r.meta_description || '').trim(),
      seoSlug: (r.seo_slug || '').trim(),
    };
  }
  return map;
})();
// Build the en-US seoInfo for a category: title/slug/meta from the CSV, falling back to the name/code.
const categorySeoInfo = (name, code) => {
  const m = CATEGORY_SEO[String(name).trim().toLowerCase()] || {};
  return {
    storeId: STORE_ID, languageCode: 'en-US',
    semanticUrl: m.seoSlug || String(code).toLowerCase(),
    pageTitle: m.pageTitle || name,
    metaDescription: m.metaDescription || '',
  };
};
// Ensure an EXISTING category carries the SEO pageTitle (so a re-run backfills it without a reseed).
async function applyCategorySeo(categoryId, seo) {
  if (DRY_RUN || !categoryId || String(categoryId).startsWith('dry-')) return;
  const cat = await api('GET', `/api/catalog/categories/${categoryId}`, null, { expectStatus: [200, 404] });
  if (!cat?.id) return;
  const infos = cat.seoInfos || [];
  const cur = infos.find((s) => s.languageCode === 'en-US' && (s.storeId === STORE_ID || !s.storeId));
  if (cur && cur.pageTitle === seo.pageTitle && (cur.storeId === STORE_ID)) return; // already correct
  if (cur) { cur.pageTitle = seo.pageTitle; cur.storeId = STORE_ID; if (!cur.metaDescription) cur.metaDescription = seo.metaDescription; if (!cur.semanticUrl) cur.semanticUrl = seo.semanticUrl; }
  else infos.push(seo);
  cat.seoInfos = infos;
  await api('PUT', '/api/catalog/categories', cat, { expectStatus: [200, 204] }).catch((e) => verbose(`seo update ${categoryId}: ${String(e.message).slice(0, 120)}`));
}
const GROUP = argv.includes('--group') ? argv[argv.indexOf('--group') + 1] : null;
// Product content enrichment (images + descriptions), on by default — a bare seeded
// product otherwise has no imagery/copy. Idempotent (skips products already populated).
const NO_ASSETS = argv.includes('--no-assets');
const FORCE_ASSETS = argv.includes('--force-assets');
const IMAGES_PER = argv.includes('--images') ? Math.max(0, parseInt(argv[argv.indexOf('--images') + 1], 10)) : 3;
const enrich = (id, code) => (NO_ASSETS ? Promise.resolve({}) : enrichProductContent(id, { images: IMAGES_PER, code, force: FORCE_ASSETS }));

let VIRTUAL_CATALOG_ID = null;
const cfgSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// ── Family → catalog-group + naming/slug conventions ─────────────────────────
// catalogGroup: which SEED-* catalog holds this family's products.
// childNaming:  option-product code/name scheme (must match what the legacy
//               script used, or re-runs would create duplicate child products).
// slugFromCode: parent seoInfos.semanticUrl = code.toLowerCase() (default/bike
//               families did this; base/conditional let VC auto-slug from name).
const FAMILY = {
  base:        { catalogGroup: 'main',   childNaming: 'flat',  slugFromCode: false },
  conditional: { catalogGroup: 'cond',   childNaming: 'keyed', slugFromCode: false },
  default:     { catalogGroup: 'deffam', childNaming: 'keyed', slugFromCode: true },
  bike:        { catalogGroup: 'deffam', childNaming: 'bike',  slugFromCode: true },
};

// ── Catalog groups (original names preserved for idempotency) ─────────────────
const GROUPS = {
  main: {
    catalog: 'SEED-20260518-Configurables',
    parentCat: ['Configurable Parents', 'SEED-20260518-CFG-PARENTS'],
    childCat: ['Configurable Options', 'SEED-20260518-CFG-OPTS'],
    pricelist: 'SEED-20260518-Configurables-USD',
  },
  cond: {
    catalog: 'SEED-20260519-Configurables-Cascades',
    parentCat: ['Conditional Parents', 'SEED-20260519-COND-PARENTS'],
    childCat: ['Conditional Options', 'SEED-20260519-COND-OPTS'],
    pricelist: 'SEED-20260519-Configurables-Cascades-USD',
  },
  deffam: {
    catalog: 'SEED-20260527-Configurables-Default',
    parentCat: ['Default Option Parents', 'SEED-20260527-DEF-PARENTS'],
    childCat: ['Default Option Options', 'SEED-20260527-DEF-OPTS'],
    pricelist: 'SEED-20260527-Configurables-Default-USD',
  },
};

// ── Unified spec table ───────────────────────────────────────────────────────
// Source of truth: test-data/products/configurable-products.csv (section_details).
// Section `key` is intra-spec (dependsOn wiring + config create/update mapping).
// `dependsOn` references another section's key; null/absent = root section.
import { SPECS } from './configurable-specs.mjs';

// ── Spec selection ───────────────────────────────────────────────────────────
let specs = SPECS;
if (ONLY) specs = specs.filter(s => s.csvId === ONLY);
if (GROUP) {
  const g = GROUP.toLowerCase();
  const alias = { cond: 'conditional', cascades: 'conditional', def: 'default', 'phase1': 'base' };
  const fam = alias[g] || g;
  specs = specs.filter(s => s.family === fam);
}
if (!specs.length) { console.error(`ABORT: no specs match ${ONLY ? `--only ${ONLY}` : ''}${GROUP ? ` --group ${GROUP}` : ''}`); process.exit(2); }

console.log(`\n🌱 Seed Configurable Products${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}`);
console.log(`   Specs (${specs.length}): ${specs.map(s => s.csvId).join(', ')}\n`);

// ── Helpers ──────────────────────────────────────────────────────────────────
async function findCatalogByName(name) {
  // List all catalogs + exact-name match — NOT a fuzzy/lagging `{keyword}` search. Catalogs have no
  // unique-name constraint, so a keyword miss makes ensureCatalog create a DUPLICATE catalog that
  // grows its own tree (same hardening as seed-common.findCatalogByName).
  const r = await api('POST', '/api/catalog/catalogs/search', { take: 500 });
  return (r?.results || []).find(c => c.name === name);
}
async function ensureCatalog(name) {
  let cat = await findCatalogByName(name);
  if (cat) { log(`↻ catalog: ${name} (${cat.id})`); return cat; }
  cat = await api('POST', '/api/catalog/catalogs', {
    name, isVirtual: false, languages: [{ languageCode: 'en-US', isDefault: true }],
    // Catalog SEO with store + language (generic slug + generic "Catalog" title — not the internal name).
    seoInfos: [{ storeId: STORE_ID, languageCode: 'en-US', semanticUrl: 'catalog', pageTitle: 'Catalog', isActive: true }],
  });
  log(`✓ catalog: ${name} (${cat?.id})`);
  return cat;
}
async function ensureCategory(catalogId, name, code) {
  const seo = categorySeoInfo(name, code);
  const r = await api('POST', '/api/catalog/listentries', { catalog: catalogId, keyword: name, take: 20 }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find(c => c.name === name && c.type === 'category');
  if (found) { await applyCategorySeo(found.id, seo); log(`↻ category: ${name} (${found.id})`); return { id: found.id, name }; }
  const cat = await api('POST', '/api/catalog/categories', {
    catalogId, name, code, isActive: true, priority: 1,
    seoInfos: [seo],
  });
  log(`✓ category: ${name} (${cat?.id})`);
  return cat;
}
async function findProductByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { keyword: code, take: 5 }, { expectStatus: [200, 201, 400, 404] });
  const f = (r?.listEntries || r?.results || []).find(p => p.code === code && p.type === 'product');
  return f ? { id: f.id, code, name: f.name } : null;
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function ensureProduct(catalogId, categoryId, body) {
  let p = await findProductByCode(body.code);
  if (p) { verbose(`↻ product: ${body.name} (${p.id})`); return p; }
  try {
    p = await api('POST', '/api/catalog/products', { catalogId, categoryId, ...body });
    verbose(`✓ product: ${body.name} (${p?.id})`);
    return p;
  } catch (e) {
    // The product exists in the DB but the search index lagged, so findProductByCode
    // missed it and we tried to re-insert (unique IX_Code_CatalogId). Poll the index
    // until it catches up and reuse the existing row rather than failing the spec.
    if (/duplicate key|IX_Code_CatalogId/i.test(e.message)) {
      // The row exists in the DB but the CatalogProduct search index lagged (findProductByCode is
      // index-based). Poll won't resolve on its own without a reindex, so TRIGGER one, then poll —
      // re-triggering periodically until the index shows the row (recovers a partial prior run).
      const reindex = () => api('POST', '/api/search/indexes/index', [{ documentType: 'CatalogProduct', rebuild: false }], { expectStatus: [200, 204] }).catch(() => {});
      await reindex();
      for (let i = 0; i < 12; i++) {
        await sleep(5000);
        const found = await findProductByCode(body.code);
        if (found) { verbose(`↻ recovered ${body.code} after index lag (${(i + 1) * 5}s)`); return found; }
        if (i === 3 || i === 7) await reindex();
      }
    }
    throw e;
  }
}
async function ensurePrice(priceListId, productId, listPrice, salePrice = null) {
  const price = { pricelistId: priceListId, productId, list: Number(listPrice), currency: 'USD', minQuantity: 1 };
  if (salePrice != null) price.sale = Number(salePrice);
  await api('PUT', '/api/products/prices', [{ productId, prices: [price] }], { expectStatus: [200, 204] });
}
async function ensureInventory(ffcId, productId, qty) {
  // PUT /plenty defaults to status=Disabled → xAPI addItem silently no-ops
  // (feedback_xapi_additem_silent_disabled). Must set status:'Enabled'.
  try {
    await api('PUT', '/api/inventory/plenty', [{ fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0, status: 'Enabled' }], { expectStatus: [200, 204] });
  } catch {
    try { await api('PUT', `/api/inventory/products/${productId}`, { fulfillmentCenterId: ffcId, productId, inStockQuantity: Number(qty), reservedQuantity: 0, status: 'Enabled' }, { expectStatus: [200, 204] }); }
    catch (e2) { verbose(`⚠ inventory ${productId}: ${e2.message.slice(0, 120)}`); }
  }
}
async function findOrCreatePriceList(name) {
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find(p => p?.name === name);
  if (pl) { log(`↻ pricelist: ${name} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', { name, currency: 'USD', description: 'Seeded for configurable products test data' }, { expectStatus: [200, 201] });
  try {
    await api('POST', '/api/pricing/assignments', { name: `${name} → ${VIRTUAL_CATALOG_ID}`, pricelistId: pl.id, catalogId: VIRTUAL_CATALOG_ID, priority: 100 }, { expectStatus: [200, 201] });
    log(`✓ pricelist + catalog assignment: ${name} (${pl.id})`);
  } catch (e) { log(`⚠ pricelist created but assignment failed: ${e.message.slice(0, 150)}`); }
  return pl;
}
async function linkToVCat(listEntryId, type) {
  await api('POST', '/api/catalog/listentrylinks', [{ listEntryId, listEntryType: type, catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204] });
}
// Link a product UNDER a category in the virtual catalog. VC's CategoryLink targets
// the catalog ROOT when categoryId is omitted (TargetId => Category?.Id ?? Catalog?.Id),
// so a bare catalog link scatters every product at the B2B-mixed root. We first drop any
// stale root link (categoryId null) for this product, then link it under `categoryId` so
// it nests beneath its seed category. Both /delete and add are idempotent server-side.
async function linkProductToCategory(productId, categoryId) {
  await api('POST', '/api/catalog/listentrylinks/delete', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID,
  }], { expectStatus: [200, 204, 404] }).catch(() => {});
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID, categoryId,
  }], { expectStatus: [200, 204] });
}
// Nest a (physical) category UNDER a parent category in the virtual catalog, dropping any
// stale root link so it doesn't appear at both the root and under the parent.
async function linkCategoryUnder(childCategoryId, parentCategoryId) {
  await api('POST', '/api/catalog/listentrylinks/delete', [{
    listEntryId: childCategoryId, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID,
  }], { expectStatus: [200, 204, 404] }).catch(() => {});
  await api('POST', '/api/catalog/listentrylinks', [{
    listEntryId: childCategoryId, listEntryType: 'category', catalogId: VIRTUAL_CATALOG_ID, categoryId: parentCategoryId,
  }], { expectStatus: [200, 204] });
}
// Resolve the storefront "Products with options" category that the CFG family
// subcategories nest under. Resolved by NAME at runtime within the virtual catalog
// (never a hardcoded GUID — see .claude/rules/test-data.md); created as a native
// virtual category if a fresh env doesn't have it yet.
let PWO_CATEGORY_ID = null;
async function ensureProductsWithOptionsCategory() {
  if (PWO_CATEGORY_ID) return PWO_CATEGORY_ID;
  const name = 'Products with options';
  const r = await api('POST', '/api/catalog/listentries', { catalogId: VIRTUAL_CATALOG_ID, keyword: name, take: 50 }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find(c => c.type === 'category' && (c.name || '').toLowerCase() === name.toLowerCase() && c.catalogId === VIRTUAL_CATALOG_ID);
  const seo = categorySeoInfo(name, 'products-with-options');
  if (found) { PWO_CATEGORY_ID = found.id; await applyCategorySeo(found.id, seo); log(`↻ VC category: ${name} (${found.id})`); return PWO_CATEGORY_ID; }
  const c = await api('POST', '/api/catalog/categories', {
    catalogId: VIRTUAL_CATALOG_ID, name, code: 'products-with-options', isActive: true, priority: 1,
    seoInfos: [seo],
  }, { expectStatus: [200, 201] });
  PWO_CATEGORY_ID = c?.id; log(`✓ VC category created: ${name} (${c?.id})`);
  return PWO_CATEGORY_ID;
}

// --- Section/option id capture (for the default/conditional CFG aliases) ------
// CFG_WITH_DEFAULT (CFG-030) and CFG_WITH_DEFAULT_COND (CFG-031) resolve section +
// default-option GUIDs, not just product_id_guid — derive them from the seeded config
// (sectionReport) so they land in aliases.<env>.json alongside the core ids (multi-env:
// the committed CSV carries NO GUIDs). Only emits a field when unambiguously determined
// (a base section with a default option; a dependent section via dependsOnSectionId);
// writeEnvAliasOverride merges, so an absent field never clobbers a captured value.
// Mapping matches the CSV semantics: base/default section == the controlling (parent)
// section; dependent == the section with dependsOnSectionId set.
function sectionOptionIds(sections) {
  const defOpt = (s) => (s?.options || []).find((o) => o.isDefault)?.id || null;
  const base = (sections || []).find((s) => !s.dependsOnSectionId && defOpt(s));
  const dependent = (sections || []).find((s) => s.dependsOnSectionId);
  const out = {};
  if (base) { out.default_section_id = base.id; out.default_option_id = defOpt(base); }
  if (dependent) {
    if (base) { out.parent_section_id = base.id; out.parent_default_option_id = defOpt(base); }
    out.dependent_section_id = dependent.id;
    out.dependent_default_option_id = defOpt(dependent);
  }
  return Object.fromEntries(Object.entries(out).filter(([, v]) => v)); // drop null/empty
}

// Option-product code/name — MUST match the legacy family scheme or a re-run
// creates duplicate child products instead of reusing them.
function childIdentity(spec, section, opt, idx) {
  const naming = FAMILY[spec.family].childNaming;
  if (naming === 'flat') {
    const slug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
    return { code: `${spec.code}-OPT-${slug}`, name: `AGENT-TEST-${spec.csvId}-${opt.name}` };
  }
  if (naming === 'bike') {
    const slug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase().slice(0, 20);
    return { code: `${spec.code}-${section.key}${idx}-${slug}`, name: opt.name };
  }
  // keyed (conditional / default) — section key in code + name so same option name
  // across sections (e.g. CFG-028 "Opt1" in B/C/D/E) doesn't collide.
  const slug = opt.name.replace(/[^A-Za-z0-9]+/g, '-').toUpperCase();
  return { code: `${spec.code}-${section.key}-OPT-${slug}`, name: `AGENT-TEST-${spec.csvId}-${section.key}-${opt.name}` };
}

/**
 * Create-or-update the product configuration. Handles the full feature union in
 * one two-pass flow:
 *   Pass 1 — POST all sections (dependsOnSectionId:null), options carry
 *            productId/quantity/text/isDefault. Reuse an existing config if present.
 *   Pass 2 — GET authoritative section IDs, then wire dependsOn + re-assert
 *            isDefault + re-assert quantity by matching option productId. PUT the
 *            whole config back (POST upsert fallback — PUT 404s on some VC builds).
 * Flat specs with no deps/defaults/non-1 quantities compute no change and skip Pass 2's write.
 */
async function createOrUpdateConfiguration(productId, sections) {
  const sectionsForCreate = sections.map((s, i) => ({
    name: s.name, isRequired: s.isRequired, displayOrder: i + 1, type: s.type,
    allowCustomText: s.allowCustomText ?? false,
    allowPredefinedOptions: (s.options?.length ?? 0) > 0,
    maxLength: s.maxLength ?? null,
    dependsOnSectionId: null, // wired in Pass 2
    options: (s.options || []).map(o => ({ productId: o._productId, quantity: o.quantity ?? 1, text: null, isDefault: !!o.default })),
  }));

  const existing = await api('POST', '/api/catalog/products/configurations/search', { productIds: [productId], take: 1 }, { expectStatus: [200, 400, 404] });
  let cfg;
  if (existing?.results?.length) { cfg = existing.results[0]; log(`↻ configuration reused: ${cfg.id}`); }
  else { cfg = await api('POST', '/api/catalog/products/configurations', { productId, isActive: true, sections: sectionsForCreate }); log(`✓ configuration created: ${cfg?.id}`); }

  if (DRY_RUN) return cfg;

  // Pass 2: resolve section IDs, wire deps + re-assert defaults/quantities.
  const fresh = await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
  const keyToId = {};
  sections.forEach((spec, i) => {
    const ps = fresh.sections.find(p => p.name === spec.name && p.displayOrder === i + 1) || fresh.sections[i];
    if (ps) keyToId[spec.key] = ps.id;
  });
  verbose(`key→id: ${JSON.stringify(keyToId)}`);

  const wired = JSON.parse(JSON.stringify(fresh));
  let changed = false;
  for (const spec of sections) {
    const target = wired.sections.find(s => s.id === keyToId[spec.key]);
    if (!target) continue;
    if (spec.dependsOn) {
      const parentId = keyToId[spec.dependsOn];
      if (parentId && target.dependsOnSectionId !== parentId) { target.dependsOnSectionId = parentId; changed = true; }
      else if (!parentId) log(`⚠ ${spec.name}: dependsOn=${spec.dependsOn} unresolved`);
    }
    for (const opt of (spec.options || [])) {
      const to = (target.options || []).find(o => o.productId === opt._productId);
      if (!to) continue;
      if (!!to.isDefault !== !!opt.default) { to.isDefault = !!opt.default; changed = true; }
      const q = opt.quantity ?? 1;
      if (to.quantity !== q) { to.quantity = q; changed = true; }
    }
  }
  if (!changed) { log(`↻ configuration wiring already correct`); return fresh; }

  try { await api('PUT', `/api/catalog/products/configurations/${cfg.id}`, wired, { expectStatus: [200, 204] }); log(`✓ configuration wired via PUT`); }
  catch (e) { verbose(`PUT failed (${e.message.slice(0, 60)}), POST upsert`); await api('POST', '/api/catalog/products/configurations', wired, { expectStatus: [200, 201] }); log(`✓ configuration wired via POST upsert`); }
  return await api('GET', `/api/catalog/products/configurations/${cfg.id}`, null, { expectStatus: [200] });
}

// ── Per-spec seed ────────────────────────────────────────────────────────────
async function seedSpec(spec, ctx, ffcId) {
  console.log(`\n=== ${spec.csvId}: ${spec.name} ===`);
  const { catalog, parentCat, childCat, priceList } = ctx;
  const slugFromCode = FAMILY[spec.family].slugFromCode;

  // 1. child option products
  for (const section of spec.sections) {
    if (section.type !== 'Product') continue;
    let idx = 0;
    for (const opt of section.options) {
      idx += 1;
      const { code, name } = childIdentity(spec, section, opt, idx);
      const child = await ensureProduct(catalog.id, childCat.id, {
        name, code, productType: 'Physical', vendor: 'QA', isActive: true, isBuyable: true, trackInventory: true,
        seoInfos: [{ storeId: STORE_ID, languageCode: 'en-US', semanticUrl: cfgSlug(code), pageTitle: name }],
      });
      opt._productId = child.id;
      if (!DRY_RUN && !String(child.id).startsWith('dry-')) {
        if (opt.price != null) await ensurePrice(priceList.id, child.id, opt.price, opt.salePrice ?? null);
        await ensureInventory(ffcId, child.id, opt.stock ?? 100);
        await enrich(child.id, code); // images + descriptions (idempotent)
      }
    }
  }

  // 2. parent configurable product
  const parentBody = {
    name: spec.name, code: spec.code, productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: false,
    // Store-scoped product SEO (platform default leaves storeId=null). Preserve the slug scheme:
    // slugFromCode families keep the code slug; others use the name slug (== the prior auto-slug).
    seoInfos: [{ storeId: STORE_ID, languageCode: 'en-US', semanticUrl: slugFromCode ? spec.code.toLowerCase() : cfgSlug(spec.name), pageTitle: spec.name }],
  };
  const parent = await ensureProduct(catalog.id, parentCat.id, parentBody);
  if (!DRY_RUN && !String(parent.id).startsWith('dry-')) {
    await ensurePrice(priceList.id, parent.id, spec.basePrice, spec.salePrice ?? null);
    await enrich(parent.id, spec.code); // images + descriptions (idempotent)
  }

  // 3. configuration
  const cfg = await createOrUpdateConfiguration(parent.id, spec.sections);

  // 4. link parent into the virtual catalog UNDER its seed category (not the root)
  if (!DRY_RUN && !String(parent.id).startsWith('dry-')) {
    try { await linkProductToCategory(parent.id, parentCat.id); log(`✓ linked under category ${parentCat.name}`); }
    catch (e) { log(`⚠ virtual-catalog link: ${e.message.slice(0, 160)}`); }
  }

  const sectionReport = (cfg?.sections || []).map(s => ({
    id: s.id, name: s.name, type: s.type, isRequired: s.isRequired,
    dependsOnSectionId: s.dependsOnSectionId, displayOrder: s.displayOrder,
    options: (s.options || []).map(o => ({ id: o.id, productName: o.productName, quantity: o.quantity, isDefault: !!o.isDefault })),
  }));
  return { csvId: spec.csvId, name: spec.name, parentId: parent.id, configurationId: cfg?.id, sections: sectionReport };
}

// ── Unified catalog context (ONE stable catalog for every family) ─────────────
// UNIFIED: all configurable families place into a SINGLE stable-named physical catalog
// `AGENT-TEST-SEED-Configurables` (was 3 date-stamped SEED-<date>-Configurables catalogs → orphan
// sprawl + not family-swept). The stable name is caught by the `seed:teardown` family sweep. The
// storefront-special "Products with options" category (exact name — NOT AGENT-TEST-prefixed) is kept
// as the parent nesting so /products-with-options still resolves. seedSpec is untouched.
const UNIFIED = { catalog: 'AGENT-TEST-SEED-Configurables' };
let sharedCtx = null;
async function ctxFor(_groupKey) {
  if (sharedCtx) return sharedCtx;
  log(`\n─── configurable catalog: ${UNIFIED.catalog} ───`);
  const catalog = await ensureCatalog(UNIFIED.catalog);
  const parentCat = await ensureCategory(catalog.id, 'Configurable Parents', 'AGENT-TEST-SEED-CFG-PARENTS');
  const childCat = await ensureCategory(catalog.id, 'Configurable Options', 'AGENT-TEST-SEED-CFG-OPTS');
  const priceList = await findOrCreatePriceList('AGENT-TEST-SEED-Configurables-USD');
  if (!DRY_RUN && parentCat.id && !String(parentCat.id).startsWith('dry-')) {
    try { await linkCategoryUnder(parentCat.id, PWO_CATEGORY_ID); log(`✓ ${parentCat.name} nested under "Products with options"`); }
    catch (e) { log(`⚠ parent-category link: ${e.message.slice(0, 160)}`); }
  }
  sharedCtx = { catalog, parentCat, childCat, priceList };
  return sharedCtx;
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  assertSafeTarget();
  await auth();
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  log(`Virtual catalog: ${VIRTUAL_CATALOG_ID}`);
  await ensureProductsWithOptionsCategory();
  const ffc = await ensureFulfillmentCenter(api);
  if (!ffc?.id && !DRY_RUN) throw new Error('No fulfillment center available');

  const seeded = [];
  for (const spec of specs) {
    try {
      const ctx = await ctxFor(FAMILY[spec.family].catalogGroup);
      seeded.push(await seedSpec(spec, ctx, ffc?.id));
    } catch (e) {
      console.error(`  ❌ ${spec.csvId}: ${e.message.slice(0, 300)}`);
      seeded.push({ csvId: spec.csvId, error: e.message });
    }
  }

  if (!DRY_RUN) {
    try { await api('POST', '/api/search/indexes/index', [{ documentType: 'CatalogProduct', rebuild: false }], { expectStatus: [200, 204] }); log(`\n✓ reindex triggered`); }
    catch (e) { log(`⚠ reindex: ${e.message.slice(0, 100)}`); }

    // Persist runtime GUIDs to aliases.<env>.json for EVERY env incl. vcst: product_id_guid,
    // configuration_id, and — for the default/conditional specs — section + default-option ids.
    // Business keys / names / slugs stay in the committed CSV (which carries NO GUIDs).
    const byKey = {};
    for (const s of seeded) if (!s.error) byKey[s.csvId] = { product_id_guid: s.parentId, configuration_id: s.configurationId, ...sectionOptionIds(s.sections) };
    syncEnvAliases('products/configurable-products', byKey); // → aliases.{env}.json (all envs)
  }

  const ok = seeded.filter(s => !s.error).length;
  console.log(`\n✅ ${ok}/${seeded.length} CFG products seeded`);
  for (const s of seeded) {
    if (s.error) { console.log(`  ❌ ${s.csvId}: ${s.error.slice(0, 120)}`); continue; }
    const deps = (s.sections || []).filter(x => x.dependsOnSectionId).length;
    console.log(`  ✓ ${s.csvId} parent=${s.parentId} config=${s.configurationId} sections=${s.sections?.length ?? 0} deps=${deps}`);
    for (const sec of (s.sections || [])) {
      const defs = sec.options.filter(o => o.isDefault).map(o => o.productName);
      const extra = [
        sec.dependsOnSectionId ? `dep=${sec.dependsOnSectionId}` : null,
        defs.length ? `default=[${defs.join(',')}]` : null,
      ].filter(Boolean).join(' ');
      verbose(`  §${sec.displayOrder} ${sec.name} (${sec.type}) req=${sec.isRequired} ${extra}`);
    }
  }
}

// ── Teardown ─────────────────────────────────────────────────────────────────
// Full teardown (no --only): delete each touched catalog group + its pricelist —
// deleting the non-virtual catalog cascades all parents + child options.
// --only <id>: delete just that one parent product by code (siblings/catalog kept).
async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 Configurable products teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);

  if (ONLY) {
    const spec = specs[0];
    const p = await findProductByCode(spec.code);
    if (p?.id) {
      // MUST be `objectIds` (NOT `ids`): POST /api/catalog/listentries/delete takes a
      // CatalogListEntrySearchCriteria — the wrong field name `ids` leaves ObjectIds empty, which
      // the endpoint treats as "search-and-delete EVERY authorized product" (a full-catalog wipe).
      // Extra guard: only delete a product whose name carries the AGENT-TEST seed prefix.
      if (!p.name?.startsWith('AGENT-TEST')) { log(`⚠ skip ${spec.csvId}: "${p.name}" lacks AGENT-TEST prefix — not a seed product`); }
      else {
        await api('POST', '/api/catalog/listentries/delete', { objectIds: [p.id], objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] }).catch(e => log(`⚠ delete: ${e.message.slice(0, 120)}`));
        log(`✗ deleted parent ${spec.csvId} (${p.id}) — child options + catalog preserved (partial teardown)`);
      }
    } else log(`– ${spec.csvId} not found`);
  } else {
    // Delete the unified catalog + pricelist AND any legacy date-stamped ones from prior runs.
    const catalogs = [UNIFIED.catalog, ...Object.values(GROUPS).map(g => g.catalog)];
    const pricelists = ['AGENT-TEST-SEED-Configurables-USD', ...Object.values(GROUPS).map(g => g.pricelist)];
    for (const plName of [...new Set(pricelists)]) {
      const plSearch = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(plName)}`, null, { expectStatus: [200, 404] });
      const plIds = (plSearch?.results || []).filter(p => p?.name === plName).map(p => p.id);
      if (plIds.length) await api('DELETE', `/api/pricing/pricelists?${idsParam(plIds)}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
    }
    for (const catName of [...new Set(catalogs)]) {
      const cat = await findCatalogByName(catName);
      if (cat?.id) { await api('DELETE', `/api/catalog/catalogs/${cat.id}`, null, { expectStatus: [200, 204, 404] }).catch(e => log(`⚠ catalog delete: ${e.message.slice(0, 120)}`)); log(`✗ deleted catalog ${catName} (cascades children)`); }
    }
  }

  const residual = await verifyRemoved(async () => {
    const out = [];
    for (const spec of specs) { const p = await findProductByCode(spec.code); if (p?.id) out.push(p.id); }
    return out;
  });
  console.log(residual === 0 ? `\n✅ Teardown verified — 0 parents remain` : `\n⚠ Teardown incomplete — ${residual} parent(s) still present`);
  if (residual > 0 && !DRY_RUN && !ONLY) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch(e => { console.error(`\n❌ ${e.message}`); if (process.argv.includes('--verbose')) console.error(e.stack); process.exit(1); });
