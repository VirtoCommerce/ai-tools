#!/usr/bin/env node
/**
 * seed-barcode-fixtures.mjs — VCST-2945 barcode-scanner search fixtures: a dedicated AGENT-TEST store
 * on B2B-store's catalog, two short-text Product properties, and the products barcode-specs.mjs PRODUCTS declares (GTIN
 * unique / shared / full-text decoy / code-OR / property / variation MPN / mixed case / QR special /
 * reindex / stale-field).
 *
 * Rules + shapes live in ./barcode-specs.mjs (side-effect-free, shared with the guard + unit test);
 * this file is the thin resolve → find-or-create → reconcile → index → PROVE → write-back layer.
 *
 * WHAT THIS SEEDER REFUSES TO DO
 * ------------------------------
 *  - Touch B2B-store. It is shared by every runner and its barcode settings drive the live storefront.
 *    The store is only READ (catalog, defaults, FFCs); a fingerprint taken before the run is compared
 *    after it, and any difference fails the run loudly.
 *  - Exit 0 on a fixture that exists but proves nothing. After indexing it polls xAPI until every
 *    product resolves on BOTH stores, then asserts each exact-field hit count the spec derives
 *    (1 for a unique GTIN, 3 for the shared one, 0 for the mixed-case prefix, …), that full text finds
 *    ≥2 for the decoy GTIN, that the MPN variation is out of stock while its family is not, and that
 *    both properties appear in the store's /fields list. A timeout is a failure, not a pause.
 *
 *  - Leave ghost index documents. Event-based indexation is off on vcst-qa, so a deleted product's
 *    document stays in the index (counted in totalCount and every facet). Teardown purges the
 *    documents of what it deletes; a seed first sweeps ghosts of earlier runs; the proof asserts the
 *    index holds exactly one document per spec product and the shared-GTIN facet bucket = totalCount.
 *
 * Per-seed reset: a re-seed restores REINDEX's GTIN, re-creates a deleted STALE_FIELD property plus its
 * dedicated product's value, and resets BARCODE_STORE's barcode settings to scannerEnabled=true,
 * fields=[] (tests own that state).
 *
 * USAGE:
 *   TEST_ENV=vcst npm run seed:barcode [-- --dry-run] [-- --verbose]
 *   TEST_ENV=vcst npm run seed:barcode:teardown
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, STORE_ID, FRONT_URL, DRY_RUN, VERBOSE, TEARDOWN,
  log, verbose, assertSafeTarget, auth, api,
  ensureCategoryPath, ensureFulfillmentCenter, writeEnvAliasOverride, verifyRemoved, idsParam, SEED_FAMILY,
} from '../../lib/seed-common.mjs';
import {
  SEED_PREFIX, PROPERTY_PREFIX, CATEGORY_PATH, PRICELIST_NAME, CURRENCY, STORE, PROPERTIES, PRODUCTS,
  aliasStaticFields, indexFieldName, productUrl, buildStoreBody, storeDrift, buildPropertyBody,
  buildProductBody, reconcileProduct, expectedExactHits, quoteFilterValue, validateFixtureShape,
  NAME_STEM, deletionWindows,
} from './barcode-specs.mjs';

const shapeProblems = validateFixtureShape();
if (shapeProblems.length) {
  console.error('ABORT: barcode-specs.mjs does not describe discriminating fixtures:');
  for (const p of shapeProblems) console.error(`  ✗ ${p}`);
  console.error('  Run `npm run td:validate:barcode` for the full report.');
  process.exit(2);
}

const ENV = process.env.TEST_ENV || 'vcst';
const PROOF_TIMEOUT_MS = 300_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── overlay (the record of what this seeder created) ─────────────────────────────────────────── */

function readOverlay() {
  const p = join(ROOT, 'test-data', `aliases.${ENV}.json`);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return {}; }
}

/** sku → recorded product id, read from the aliases this seeder writes. */
function recordedProductIds() {
  const o = readOverlay();
  const s = aliasStaticFields();
  const map = {};
  const put = (sku, id) => { if (sku && id) map[sku] = id; };
  put(s.BARCODE_GTIN_UNIQUE.sku, o.BARCODE_GTIN_UNIQUE?.id);
  put(s.BARCODE_FULLTEXT_DISCRIM.sku, o.BARCODE_FULLTEXT_DISCRIM?.id);
  put(s.BARCODE_FULLTEXT_DISCRIM.otherSku, o.BARCODE_FULLTEXT_DISCRIM?.otherId);
  const sharedIds = String(o.BARCODE_GTIN_SHARED?.ids || '').split(',').filter(Boolean);
  s.BARCODE_GTIN_SHARED.skus.split(',').forEach((sku, i) => put(sku, sharedIds[i]));
  put(s.BARCODE_CODE_OR.sku, o.BARCODE_CODE_OR?.id);
  put(s.BARCODE_PROP.sku, o.BARCODE_PROP?.id);
  put(s.BARCODE_VARIATION_MPN.parentSku, o.BARCODE_VARIATION_MPN?.parentId);
  put(s.BARCODE_VARIATION_MPN.variationSku, o.BARCODE_VARIATION_MPN?.variationId);
  put(s.BARCODE_VARIATION_MPN.siblingSku, o.BARCODE_VARIATION_MPN?.siblingId);
  put(s.BARCODE_CASE.sku, o.BARCODE_CASE?.id);
  put(s.BARCODE_SPECIAL.sku, o.BARCODE_SPECIAL?.id);
  put(s.BARCODE_REINDEX.sku, o.BARCODE_REINDEX?.id);
  put(s.BARCODE_STALE_FIELD.sku, o.BARCODE_STALE_FIELD?.id);
  return map;
}

/* ── search-index hygiene ────────────────────────────────────────────────────────────────────────
 * vcst-qa runs with Catalog.Search.EventBasedIndexation.Enable=false, so a product DELETE never
 * removes its index document: ghosts keep counting in totalCount and in every term facet (observed
 * 2026-09-28: 14 documents of a 13:16Z teardown still indexed, the shared-GTIN bucket at 6 for 3
 * products). An explicit-documentIds index request cannot fix that — it only BUILDS documents — so
 * removal goes through the windowed change feed (deletionWindows in barcode-specs.mjs). */

const SPEC_SKUS = new Set(PRODUCTS.map((p) => p.sku));
const PURGE_TIMEOUT_MS = 240_000;
const ORPHAN_LOOKBACK_DAYS = 30;

/** How many of `ids` still have an index document (DB-independent: the admin search counts the index). */
async function indexedCount(ids) {
  let n = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const r = await api('POST', '/api/catalog/search/products', { objectIds: ids.slice(i, i + 100), searchInVariations: true, take: 0 });
    n += Number(r?.totalCount || 0);
  }
  return n;
}

/** The index-document count vs the loaded-product count for NAME_STEM — equal when there are no ghosts. */
async function nameStemCounts() {
  const r = await api('POST', '/api/catalog/search/products', { searchPhrase: NAME_STEM, searchInVariations: true, take: 100 });
  return { indexed: Number(r?.totalCount || 0), loaded: (r?.items || []).length };
}

/** Deleted-product operation-log entries (id + time) for `ids`, polled until every id has one. */
async function deletionLog(ids) {
  const want = new Set(ids);
  const t0 = Date.now();
  for (;;) {
    const r = await api('POST', '/api/platform/changelog/v2/search', { objectType: 'CatalogProduct', objectIds: [...want], operationTypes: ['Deleted'], take: want.size + 10 });
    const got = new Map((r?.results || []).map((e) => [e.objectId, e.createdDate]));
    if ([...want].every((id) => got.has(id)) || Date.now() - t0 > 120_000) return [...got].map(([id, at]) => ({ id, at }));
    await sleep(5_000);
  }
}

/** Remove the index documents of already-deleted products; fails loudly if any survives. */
async function purgeIndexDocs(deleted) {
  const ids = deleted.map((d) => d.id);
  if (!ids.length || !(await indexedCount(ids))) return 0;
  const windows = deletionWindows(deleted.map((d) => d.at));
  const request = () => api('POST', '/api/search/indexes/index', windows.map((w) => ({ documentType: 'Product', ...w })), { expectStatus: [200, 204] });
  await request();
  log(`↻ index purge requested for ${ids.length} deleted product document(s) — ${windows.map((w) => `${w.startDate}…${w.endDate}`).join(', ')}`);
  const t0 = Date.now();
  let retried = false;
  for (;;) {
    const left = await indexedCount(ids);
    if (!left) { log(`✓ ${ids.length} deleted product document(s) gone from the index`); return ids.length; }
    // A second indexation holding the job lock makes ours a silent no-op — re-request once.
    if (!retried && Date.now() - t0 > 60_000) { await request(); retried = true; verbose('index purge re-requested (another indexation may have held the lock)'); }
    if (Date.now() - t0 > PURGE_TIMEOUT_MS) throw new Error(`index purge: ${left} of ${ids.length} deleted product document(s) still indexed after ${PURGE_TIMEOUT_MS / 1000}s`);
    await sleep(10_000);
  }
}

/**
 * Reseed-path self-heal: if NAME_STEM has more index documents than live products, find the ghosts
 * among recently deleted products whose document is one of OURS (code in the spec) and purge them.
 */
async function sweepIndexOrphans() {
  const before = await nameStemCounts();
  if (before.indexed <= before.loaded) { verbose(`index: ${before.indexed} ${NAME_STEM} document(s), no ghosts`); return 0; }
  const since = new Date(Date.now() - ORPHAN_LOOKBACK_DAYS * 86_400_000).toISOString();
  const deleted = [];
  for (let skip = 0; ; skip += 500) {
    const r = await api('POST', '/api/platform/changelog/v2/search', { objectType: 'CatalogProduct', operationTypes: ['Deleted'], startDate: since, skip, take: 500 });
    const page = r?.results || [];
    for (let i = 0; i < page.length; i += 100) {
      const chunk = page.slice(i, i + 100);
      if (!(await indexedCount(chunk.map((e) => e.objectId)))) continue;
      for (const e of chunk) {
        const doc = (await api('GET', `/api/search/indexes/index/Product/${encodeURIComponent(e.objectId)}`, null, { expectStatus: [200, 404] }) || [])[0];
        if (doc && SPEC_SKUS.has(doc.code) && String(doc.name || '').startsWith(NAME_STEM)) deleted.push({ id: e.objectId, at: e.createdDate });
      }
    }
    if (page.length < 500) break;
  }
  log(`⚠ index holds ${before.indexed} ${NAME_STEM} document(s) for ${before.loaded} live product(s) — ${deleted.length} ghost(s) of deleted fixtures found`);
  return purgeIndexDocs(deleted);
}

/* ── lookups ─────────────────────────────────────────────────────────────────────────────────── */

async function getProduct(id) {
  if (!id || String(id).startsWith('dry-')) return null;
  return api('GET', `/api/catalog/products/${id}`, null, { expectStatus: [200, 404] }).catch(() => null);
}

/** DB-backed code lookup, paginated (listentries pages categories + products through ONE window). */
async function findProductByCode(code, catalogId) {
  for (let page = 0; page < 10; page++) {
    const r = await api('POST', '/api/catalog/listentries', { keyword: code, catalogId, take: 100, skip: page * 100 }, { expectStatus: [200, 201, 400, 404] });
    const entries = r?.listEntries || r?.results || [];
    const hit = entries.find((e) => e.type === 'product' && e.code === code);
    if (hit) return hit.id;
    if (!entries.length || (page + 1) * 100 >= Number(r?.totalCount ?? 0)) break;
  }
  return null;
}

/** Resolve a spec product to a live id: recorded id (re-validated) → variation list → code search. */
async function resolveProduct(p, { catalogId, recorded, parentId = null }) {
  const rec = await getProduct(recorded[p.sku]);
  if (rec?.id && rec.code === p.sku && String(rec.name || '').startsWith(SEED_PREFIX)) return rec.id;
  if (parentId) {
    const parent = await getProduct(parentId);
    const v = (parent?.variations || []).find((x) => x.code === p.sku);
    if (v?.id) return v.id;
  }
  return findProductByCode(p.sku, catalogId);
}

async function catalogProperties(catalogId) {
  const cat = await api('GET', `/api/catalog/catalogs/${catalogId}`, null, { expectStatus: [200, 404] });
  return cat?.properties || [];
}

/* ── B2B-store guard (read-only; fingerprint before == after) ─────────────────────────────────── */

function storeFingerprint(s) {
  const bc = (s?.settings || []).filter((x) => /^Catalog\.Search\.Barcode/.test(x.name)).map((x) => `${x.name}=${JSON.stringify(x.value)}`).sort();
  return JSON.stringify({
    catalog: s?.catalog, defaultLanguage: s?.defaultLanguage, defaultCurrency: s?.defaultCurrency,
    url: s?.url, email: s?.email, main: s?.mainFulfillmentCenterId, modifiedDate: s?.modifiedDate, bc,
  });
}

/* ── seed steps ──────────────────────────────────────────────────────────────────────────────── */

async function ensureProperties(catalogId) {
  const out = {};
  let props = await catalogProperties(catalogId);
  for (const def of Object.values(PROPERTIES)) {
    let found = props.find((x) => x.name === def.name);
    if (!found) {
      await api('POST', '/api/catalog/properties', buildPropertyBody(def, catalogId), { expectStatus: [200, 201, 204] });
      props = DRY_RUN ? props : await catalogProperties(catalogId);
      found = DRY_RUN ? { id: `dry-${def.key}` } : props.find((x) => x.name === def.name);
      if (!found?.id) throw new Error(`property ${def.name} was created but does not read back from catalog ${catalogId}`);
      log(`✓ property ${def.name} (${found.id}) [${def.type}/${def.valueType}]`);
    } else if (found.type !== def.type || found.valueType !== def.valueType) {
      throw new Error(`property ${def.name} exists as ${found.type}/${found.valueType}, spec needs ${def.type}/${def.valueType} — pr909 would not offer it; delete it (seed:barcode:teardown) and re-seed`);
    } else verbose(`↻ property ${def.name} (${found.id})`);
    out[def.key] = { ...def, id: found.id };
  }
  return out;
}

async function ensurePriceList(storeCatalogId) {
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find((p) => p?.name === PRICELIST_NAME);
  if (pl) { verbose(`↻ pricelist ${PRICELIST_NAME} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', { name: PRICELIST_NAME, currency: CURRENCY, description: 'VCST-2945 barcode fixtures' }, { expectStatus: [200, 201] });
  await api('POST', '/api/pricing/assignments', {
    name: `${PRICELIST_NAME} → store catalog`, pricelistId: pl.id, catalogId: storeCatalogId, priority: 100,
  }, { expectStatus: [200, 201] });
  log(`✓ pricelist ${PRICELIST_NAME} (${pl?.id}) assigned to catalog ${storeCatalogId}`);
  return pl;
}

async function ensureProduct(p, { loc, recorded, parentId, propsByKey }) {
  let id = await resolveProduct(p, { catalogId: loc.catalogId, recorded, parentId });
  if (!id) {
    const body = buildProductBody(p, { catalogId: loc.catalogId, categoryId: loc.categoryId, mainProductId: parentId, storeId: STORE_ID });
    const created = await api('POST', '/api/catalog/products', body, { expectStatus: [200, 201] });
    id = created?.id;
    log(`✓ product ${p.sku} → ${id}${parentId ? ` (variation of ${parentId})` : ''}`);
  } else verbose(`↻ product ${p.sku} (${id})`);
  if (DRY_RUN) return id;

  const full = await getProduct(id);
  if (!full) throw new Error(`product ${p.sku} (${id}) does not read back`);
  const changed = reconcileProduct(full, p, propsByKey);
  if (parentId && full.mainProductId !== parentId) { full.mainProductId = parentId; changed.push('mainProductId'); }
  if (full.isActive === false || full.isBuyable === false) { full.isActive = true; full.isBuyable = true; changed.push('active/buyable'); }
  if (changed.length) {
    await api('POST', '/api/catalog/products', full, { expectStatus: [200, 201, 204] });
    log(`↻ ${p.sku}: reconciled ${changed.join(', ')}`);
  }
  return id;
}

async function ensureStore(source) {
  const existing = await api('GET', `/api/stores/${encodeURIComponent(STORE.id)}`, null, { expectStatus: [200, 404] });
  if (!existing?.id) {
    await api('POST', '/api/stores', buildStoreBody(source), { expectStatus: [200, 201, 204] });
    log(`✓ store ${STORE.id} → catalog ${source.catalog} (${source.defaultLanguage} / ${source.defaultCurrency})`);
  } else {
    if (!String(existing.name || '').startsWith(SEED_PREFIX)) throw new Error(`store ${STORE.id} exists but is not an AGENT-TEST store ("${existing.name}") — refusing to touch it`);
    const drift = storeDrift(existing, source);
    if (drift.length) {
      // Whole-entity PUT replaces: GET → merge only the drifted resolution roots → PUT the whole body.
      const want = buildStoreBody(source);
      const merged = { ...existing };
      for (const k of drift) merged[k] = k === 'currencies' ? [...new Set([...(existing.currencies || []), want.defaultCurrency])]
        : k === 'languages' ? [...new Set([...(existing.languages || []), want.defaultLanguage])] : want[k];
      await api('PUT', '/api/stores', merged, { expectStatus: [200, 204] });
      log(`↻ store ${STORE.id}: repaired ${drift.join(', ')}`);
    } else verbose(`↻ store ${STORE.id}`);
  }
  // The per-seed reset of the state tests own — through pr909's validating endpoint.
  await api('PUT', `/api/catalog/barcode-search/store/${encodeURIComponent(STORE.id)}`, STORE.barcodeDefaults, { expectStatus: [200, 204] });
  log(`✓ ${STORE.id} barcode settings reset → scannerEnabled=${STORE.barcodeDefaults.scannerEnabled}, fields=[]`);
}

/* ── live proof ──────────────────────────────────────────────────────────────────────────────── */

const GQL = `query($storeId:String!,$filter:String,$query:String){ products(storeId:$storeId, filter:$filter, query:$query, first:20, cultureName:"en-US", currencyCode:"${CURRENCY}"){ totalCount items { id code slug availabilityData { isInStock isBuyable } price { actual { amount } } } } }`;
async function xapi(storeId, { filter = null, query = null } = {}) {
  const r = await fetch(`${FRONT_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: GQL, variables: { storeId, filter, query } }) });
  const j = await r.json().catch(() => ({}));
  if (j.errors?.length) return { error: j.errors.map((e) => e.message).join('; ').slice(0, 200) };
  return j.data?.products || { error: `HTTP ${r.status}` };
}

async function pollUntil(label, fn) {
  const t0 = Date.now();
  let last;
  while (Date.now() - t0 < PROOF_TIMEOUT_MS) {
    last = await fn();
    if (last.ok) { verbose(`${label}: ok after ${Math.round((Date.now() - t0) / 1000)}s`); return last; }
    await sleep(10_000);
  }
  throw new Error(`${label}: not reached within ${PROOF_TIMEOUT_MS / 1000}s — last: ${last?.detail || 'n/a'}. The fixture never reached the storefront read path (BL-CAT-003 index lag, or a missing catalog link).`);
}

async function prove(ids) {
  const s = aliasStaticFields();
  const stores = [STORE_ID, STORE.id];
  const report = [];

  // 1. every product resolves by code on both stores (variations need an explicit is: scope).
  for (const storeId of stores) {
    await pollUntil(`xAPI findability on ${storeId}`, async () => {
      const missing = [];
      for (const p of PRODUCTS) {
        const filter = `${p.parent ? 'is:variation ' : ''}code:${quoteFilterValue(p.sku)}`;
        const r = await xapi(storeId, { filter });
        if (r.error || r.totalCount !== 1 || r.items?.[0]?.id !== ids[p.sku]) missing.push(`${p.sku}(${r.error || r.totalCount})`);
      }
      return { ok: !missing.length, detail: `unresolved: ${missing.join(', ')}` };
    });
    report.push(`✓ ${storeId}: all ${PRODUCTS.length} products resolve by code (variations via is:variation)`);
  }

  // 2. exact-field counts the spec derives — direct term filters, independent of barcode settings.
  const problems = [];
  for (const e of expectedExactHits()) {
    const filter = `${e.variations ? 'is:product,variation ' : ''}${e.field}:${quoteFilterValue(e.value)}`;
    const r = await xapi(STORE_ID, { filter });
    const got = r.error ? `ERR ${r.error}` : r.totalCount;
    report.push(`${got === e.hits ? '✓' : '✗'} ${e.label}: ${filter} → ${got} (spec ${e.hits})`);
    if (got !== e.hits) problems.push(`${e.label}: ${got} ≠ ${e.hits}`);
  }

  // 2b. no ghost documents: a deleted fixture's document still counts in totalCount and in facets.
  const stem = await nameStemCounts();
  const stemOk = stem.indexed === stem.loaded && stem.loaded === PRODUCTS.length;
  report.push(`${stemOk ? '✓' : '✗'} admin index "${NAME_STEM}": ${stem.indexed} document(s), ${stem.loaded} live (spec ${PRODUCTS.length})`);
  if (!stemOk) problems.push(`index holds ${stem.indexed} ${NAME_STEM} document(s) for ${stem.loaded} live product(s), spec ${PRODUCTS.length}`);
  const shared = s.BARCODE_GTIN_SHARED.gtin;
  const fq = `query($s:String!,$f:String){ products(storeId:$s, filter:$f, facet:"gtin", first:1, cultureName:"en-US", currencyCode:"${CURRENCY}"){ totalCount term_facets { name terms { term count } } } }`;
  const fres = await fetch(`${FRONT_URL}/graphql`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: fq, variables: { s: STORE_ID, f: `gtin:${quoteFilterValue(shared)}` } }) }).then((x) => x.json()).catch(() => ({}));
  const fp = fres.data?.products;
  const bucket = fp?.term_facets?.find((t) => t.name === 'gtin')?.terms?.find((t) => t.term === shared)?.count;
  const facetOk = bucket === fp?.totalCount && bucket === Number(s.BARCODE_GTIN_SHARED.count);
  report.push(`${facetOk ? '✓' : '✗'} gtin facet bucket "${shared}" = ${bucket}, totalCount ${fp?.totalCount} (spec ${s.BARCODE_GTIN_SHARED.count})`);
  if (!facetOk) problems.push(`shared-GTIN facet bucket ${bucket} ≠ totalCount ${fp?.totalCount} / spec ${s.BARCODE_GTIN_SHARED.count}`);

  // 3. full text finds the target AND the decoy; exact-on-gtin found exactly one above.
  const ft = await xapi(STORE_ID, { query: s.BARCODE_FULLTEXT_DISCRIM.gtin });
  const ftCodes = (ft.items || []).map((i) => i.code);
  const ftOk = !ft.error && ft.totalCount >= 2 && ftCodes.includes(s.BARCODE_FULLTEXT_DISCRIM.sku) && ftCodes.includes(s.BARCODE_FULLTEXT_DISCRIM.otherSku);
  report.push(`${ftOk ? '✓' : '✗'} full text "${s.BARCODE_FULLTEXT_DISCRIM.gtin}" → ${ft.error || ft.totalCount} hit(s) [${ftCodes.join(', ')}] (need ≥2 incl. target + decoy)`);
  if (!ftOk) problems.push('full-text decoy not discriminating');

  // 4. special value — informational: how the platform's filter parser treats an escaped quote.
  const sp = await xapi(STORE_ID, { filter: `${s.BARCODE_PROP.propertyName}:${quoteFilterValue(s.BARCODE_SPECIAL.value)}` });
  report.push(`• special value via escaped term filter → ${sp.error ? `ERR ${sp.error}` : sp.totalCount} (informational — the case under test owns this)`);

  // 5. availability shape: GTIN_UNIQUE buyable + priced; MPN variation OOS while its sibling is in stock.
  const u = (await xapi(STORE_ID, { filter: `code:${quoteFilterValue(s.BARCODE_GTIN_UNIQUE.sku)}` })).items?.[0];
  const uOk = u?.availabilityData?.isInStock && u?.availabilityData?.isBuyable && u?.price?.actual?.amount > 0;
  const wantSlug = productUrl(PRODUCTS.find((p) => p.sku === s.BARCODE_GTIN_UNIQUE.sku)).replace(/^\//, '');
  report.push(`${uOk ? '✓' : '✗'} GTIN_UNIQUE buyable=${u?.availabilityData?.isBuyable} inStock=${u?.availabilityData?.isInStock} price=${u?.price?.actual?.amount} slug=${u?.slug}${u?.slug === wantSlug ? ' (= derived url)' : ` (≠ derived ${wantSlug})`}`);
  if (!uOk) problems.push('GTIN_UNIQUE is not buyable/in stock/priced');
  if (u?.slug !== wantSlug) problems.push(`GTIN_UNIQUE slug ${u?.slug} ≠ derived url ${wantSlug}`);
  const vm = (await xapi(STORE_ID, { filter: `is:variation code:${quoteFilterValue(s.BARCODE_VARIATION_MPN.variationSku)}` })).items?.[0];
  const vs = (await xapi(STORE_ID, { filter: `is:variation code:${quoteFilterValue(s.BARCODE_VARIATION_MPN.siblingSku)}` })).items?.[0];
  const vOk = vm?.availabilityData?.isInStock === false && vs?.availabilityData?.isInStock === true;
  report.push(`${vOk ? '✓' : '✗'} VARIATION_MPN inStock=${vm?.availabilityData?.isInStock}, sibling inStock=${vs?.availabilityData?.isInStock} (need false / true)`);
  if (!vOk) problems.push('variation stock split not observed');

  // 6. pr909 offers both properties as barcode fields on the dedicated store.
  const want = Object.values(PROPERTIES).map((d) => indexFieldName(d.name));
  const fr = await pollUntil(`/fields lists ${want.join(', ')}`, async () => {
    const f = await api('GET', `/api/catalog/barcode-search/store/${encodeURIComponent(STORE.id)}/fields`);
    const names = (f || []).map((x) => x.name);
    return { ok: want.every((w) => names.includes(w)), detail: `missing ${want.filter((w) => !names.includes(w)).join(', ')}`, names };
  });
  report.push(`✓ /fields on ${STORE.id} lists ${want.join(', ')} (${fr.names.length} fields)`);

  log('');
  log('Live proof (xAPI via FRONT_URL/graphql, anonymous):');
  for (const line of report) log(`  ${line}`);
  if (problems.length) throw new Error(`fixture proof FAILED — ${problems.join(' | ')}`);
}

/* ── main ────────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  await auth();
  console.log(`\n🌱 Barcode fixtures${DRY_RUN ? ' (DRY RUN)' : ''} — VCST-2945`);

  const b2b = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  const before = storeFingerprint(b2b);
  const storeCat = await api('GET', `/api/catalog/catalogs/${b2b.catalog}`, null, { expectStatus: [200, 404] });
  if (!storeCat?.isVirtual) throw new Error(`${STORE_ID}'s catalog ${b2b.catalog} is not a virtual catalog — refusing to re-point a shared store; fix the env first`);
  log(`${STORE_ID} catalog: ${storeCat.name} (${storeCat.id}) — read only`);

  const loc = await ensureCategoryPath(api, CATEGORY_PATH);
  if (!loc) throw new Error(`could not resolve category path "${CATEGORY_PATH}"`);
  const physical = DRY_RUN ? { name: SEED_FAMILY } : await api('GET', `/api/catalog/catalogs/${loc.catalogId}`);
  if (!String(physical?.name || '').startsWith(SEED_FAMILY)) throw new Error(`category path resolved into "${physical?.name}", not an ${SEED_FAMILY} catalog — properties would land on real data`);
  const ffc = await ensureFulfillmentCenter(api);
  if (!ffc?.id) throw new Error('no fulfillment center resolved');
  log(`products → ${physical.name} / ${CATEGORY_PATH}; stock → ${ffc.name}`);

  const propsByKey = await ensureProperties(loc.catalogId);
  const pl = DRY_RUN ? { id: 'dry-pl' } : await ensurePriceList(b2b.catalog);

  const recorded = recordedProductIds();
  const ids = {};
  for (const p of PRODUCTS.filter((x) => !x.parent)) ids[p.sku] = await ensureProduct(p, { loc, recorded, propsByKey });
  for (const p of PRODUCTS.filter((x) => x.parent)) ids[p.sku] = await ensureProduct(p, { loc, recorded, parentId: ids[p.parent], propsByKey });

  if (!DRY_RUN) {
    for (const p of PRODUCTS) {
      await api('PUT', '/api/products/prices', [{ productId: ids[p.sku], prices: [{ pricelistId: pl.id, productId: ids[p.sku], list: p.listPrice, currency: CURRENCY, minQuantity: 1 }] }], { expectStatus: [200, 204] });
      // Out-of-stock is written EXPLICITLY (0) on both the seed FFC and the store's own main FFC, so
      // "0 at the main FFC" holds whichever one a reader treats as main.
      const ffcIds = p.stock === 0 ? [...new Set([ffc.id, b2b.mainFulfillmentCenterId].filter(Boolean))] : [ffc.id];
      await api('PUT', '/api/inventory/plenty', ffcIds.map((fid) => ({ fulfillmentCenterId: fid, productId: ids[p.sku], inStockQuantity: p.stock, reservedQuantity: 0, status: 'Enabled' })), { expectStatus: [200, 204] });
    }
    log(`✓ prices (${CURRENCY}) + stock written for ${PRODUCTS.length} products`);
  }

  await ensureStore(b2b);

  if (DRY_RUN) { console.log('\n✅ dry run complete (no writes).'); return; }

  // Ghosts of products an earlier run deleted first — the purge and the reindex share one job lock.
  await sweepIndexOrphans();
  await api('POST', '/api/search/indexes/index', [{ documentType: 'Product', documentIds: Object.values(ids) }], { expectStatus: [200, 204] });
  log(`✓ reindex requested for ${Object.keys(ids).length} product documents`);

  await prove(ids);

  const after = storeFingerprint(await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`));
  if (after !== before) throw new Error(`${STORE_ID} CHANGED during the run — before ${before} after ${after}. Investigate before any other runner uses it.`);
  log(`✓ ${STORE_ID} unchanged (catalog, defaults, url, FFC, barcode settings, modifiedDate)`);

  const s = aliasStaticFields();
  writeEnvAliasOverride({
    BARCODE_STORE: { catalogId: b2b.catalog },
    BARCODE_GTIN_UNIQUE: { id: ids[s.BARCODE_GTIN_UNIQUE.sku] },
    BARCODE_FULLTEXT_DISCRIM: { id: ids[s.BARCODE_FULLTEXT_DISCRIM.sku], otherId: ids[s.BARCODE_FULLTEXT_DISCRIM.otherSku] },
    BARCODE_GTIN_SHARED: { ids: s.BARCODE_GTIN_SHARED.skus.split(',').map((k) => ids[k]).join(',') },
    BARCODE_CODE_OR: { id: ids[s.BARCODE_CODE_OR.sku] },
    BARCODE_PROP: { id: ids[s.BARCODE_PROP.sku], propertyId: propsByKey.upc.id },
    BARCODE_VARIATION_MPN: { parentId: ids[s.BARCODE_VARIATION_MPN.parentSku], variationId: ids[s.BARCODE_VARIATION_MPN.variationSku], siblingId: ids[s.BARCODE_VARIATION_MPN.siblingSku] },
    BARCODE_CASE: { id: ids[s.BARCODE_CASE.sku] },
    BARCODE_SPECIAL: { id: ids[s.BARCODE_SPECIAL.sku] },
    BARCODE_REINDEX: { id: ids[s.BARCODE_REINDEX.sku] },
    BARCODE_STALE_FIELD: { id: ids[s.BARCODE_STALE_FIELD.sku], propertyId: propsByKey.stale.id },
  });
  log(`✓ aliases.${ENV}.json: runtime ids for ${Object.keys(s).length} BARCODE_* aliases`);
  console.log('\n✅ Barcode fixtures seeded and proven — VCST-2945');
}

/* ── teardown (products → properties → store → pricelist; AGENT-TEST only; zero residue) ─────── */

async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 Barcode fixtures teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const loc = await ensureCategoryPath(api, CATEGORY_PATH);
  const recorded = recordedProductIds();

  const productIds = [];
  const variations = [];
  for (const p of PRODUCTS.filter((x) => !x.parent)) {
    const id = await resolveProduct(p, { catalogId: loc?.catalogId, recorded });
    if (!id) continue;
    const full = await getProduct(id);
    if (!String(full?.name || '').startsWith(SEED_PREFIX)) { log(`⚠ skip ${p.sku}: "${full?.name}" lacks ${SEED_PREFIX}`); continue; }
    productIds.push(id);
    for (const v of full?.variations || []) if (PRODUCTS.some((x) => x.sku === v.code)) variations.push(v.id);
  }
  for (const p of PRODUCTS.filter((x) => x.parent)) { const id = recorded[p.sku]; if (id && !variations.includes(id) && (await getProduct(id))?.id) variations.push(id); }
  const all = [...variations, ...productIds];
  if (all.length && !DRY_RUN) {
    if (variations.length) await api('DELETE', `/api/catalog/products?${idsParam(variations)}`, null, { expectStatus: [200, 204, 404] });
    if (productIds.length) await api('DELETE', `/api/catalog/products?${idsParam(productIds)}`, null, { expectStatus: [200, 204, 404] });
    log(`✗ deleted ${variations.length} variation(s) + ${productIds.length} product(s)`);
    // Event-based indexation is off: without this their documents outlive them (ghost hits + facets).
    // A purge timeout must not abort the rest of the teardown — the residue check below reports it.
    try { await purgeIndexDocs(await deletionLog(all)); } catch (e) { log(`⚠ ${e.message}`); }
  } else log(`– ${all.length} seeded product(s) found${DRY_RUN ? ' (dry run — nothing deleted)' : ''}`);

  if (loc?.catalogId) {
    const cat = await api('GET', `/api/catalog/catalogs/${loc.catalogId}`, null, { expectStatus: [200, 404] });
    if (String(cat?.name || '').startsWith(SEED_FAMILY)) {
      for (const def of Object.values(PROPERTIES)) {
        const found = (cat.properties || []).find((x) => x.name === def.name && x.name.startsWith(PROPERTY_PREFIX));
        if (!found) continue;
        if (!DRY_RUN) await api('DELETE', `/api/catalog/properties?id=${encodeURIComponent(found.id)}&doDeleteValues=true`, null, { expectStatus: [200, 204, 404] });
        log(`✗ deleted property ${def.name}`);
      }
    }
  }

  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE.id)}`, null, { expectStatus: [200, 404] });
  if (store?.id && String(store.name || '').startsWith(SEED_PREFIX)) {
    if (!DRY_RUN) await api('DELETE', `/api/stores?ids=${encodeURIComponent(STORE.id)}`, null, { expectStatus: [200, 204, 404] });
    log(`✗ deleted store ${STORE.id}`);
  }

  const pls = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
  const plIds = (pls?.results || []).filter((p) => p?.name === PRICELIST_NAME).map((p) => p.id);
  if (plIds.length) {
    if (!DRY_RUN) await api('DELETE', `/api/pricing/pricelists?${idsParam(plIds)}`, null, { expectStatus: [200, 204, 404] });
    log(`✗ deleted pricelist ${PRICELIST_NAME}`);
  }

  // Residue by id / exact name via DB-backed GETs — never the lagging search index.
  const residual = await verifyRemoved(async () => {
    const left = [];
    for (const id of all) if ((await getProduct(id))?.id) left.push(`product ${id}`);
    const ghosts = all.length && !DRY_RUN ? await indexedCount(all) : 0;
    if (ghosts) left.push(`${ghosts} index document(s) of deleted products`);
    if (loc?.catalogId) for (const p of await catalogProperties(loc.catalogId)) if (Object.values(PROPERTIES).some((d) => d.name === p.name)) left.push(`property ${p.name}`);
    if ((await api('GET', `/api/stores/${encodeURIComponent(STORE.id)}`, null, { expectStatus: [200, 404] }))?.id) left.push(`store ${STORE.id}`);
    return left;
  });
  if (!DRY_RUN) {
    // Resolution must be EMPTY, not stale, on a torn-down env.
    writeEnvAliasOverride({
      BARCODE_STORE: { catalogId: '' }, BARCODE_GTIN_UNIQUE: { id: '' }, BARCODE_FULLTEXT_DISCRIM: { id: '', otherId: '' },
      BARCODE_GTIN_SHARED: { ids: '' }, BARCODE_CODE_OR: { id: '' }, BARCODE_PROP: { id: '', propertyId: '' },
      BARCODE_VARIATION_MPN: { parentId: '', variationId: '', siblingId: '' }, BARCODE_CASE: { id: '' },
      BARCODE_SPECIAL: { id: '' }, BARCODE_REINDEX: { id: '' }, BARCODE_STALE_FIELD: { id: '', propertyId: '' },
    });
  }
  console.log(residual === 0 ? '\n✅ Barcode teardown verified — 0 residue' : `\n⚠ Barcode teardown incomplete — ${residual} entit(y/ies) still present`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ SEED FAILED: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
