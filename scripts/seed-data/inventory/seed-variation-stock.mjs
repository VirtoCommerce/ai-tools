#!/usr/bin/env node
/**
 * seed-variation-stock.mjs — the stocked-variation fixture (VCST-5546 / INV-047).
 *
 * Provisions a master product plus a genuine VARIATION child (mainProductId = the master), and puts
 * DIFFERENT non-zero stock on each at the STORE'S MAIN fulfillment center. Runtime GUIDs go to
 * aliases.<env>.json — including FC_EAST's, which until now resolved to the bare CSV business key
 * "FFC-001" rather than the platform id INV-047 needs.
 *
 * Rules + body shapes live in ./variation-stock-specs.mjs (side-effect-free, shared with the guard and
 * the unit tests); data lives in test-data/inventory/variation-stock.csv. This file is the thin
 * resolve → find-or-create → write-back layer.
 *
 * USAGE:
 *   node scripts/seed-data/inventory/seed-variation-stock.mjs [--dry-run] [--verbose]
 *   node scripts/seed-data/inventory/seed-variation-stock.mjs --teardown
 *
 * Safety: ENV_RISK gate, idempotent find-or-create, AGENT-TEST- naming, reverse teardown with a
 * verifyRemoved zero-residue assert.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'csv-parse/sync';
import {
  ROOT, DRY_RUN, VERBOSE, TEARDOWN,
  log, verbose, assertSafeTarget, auth, api,
  ensureVirtualCatalog, ensureCategoryPath, storeMainFulfillmentCenter, buildStoreSeo,
  syncEnvAliases, verifyRemoved, idsParam,
} from '../../lib/seed-common.mjs';
import {
  CSV_SOURCE, FIXTURE_KEY, SEED_PREFIX, MAIN_FFC,
  loadFixture, validateFixtureShape, stockPlan,
  buildMasterBody, buildVariationBody,
} from './variation-stock-specs.mjs';

const rows = parse(readFileSync(join(ROOT, 'test-data', CSV_SOURCE.file), 'utf8'), {
  columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
});
const ffcRows = parse(readFileSync(join(ROOT, 'test-data', MAIN_FFC.csvFile), 'utf8'), {
  columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
});
const REC = loadFixture(rows);
if (!REC) { console.error(`ABORT: no ${FIXTURE_KEY} row in ${CSV_SOURCE.file}`); process.exit(2); }

const shapeProblems = validateFixtureShape(rows, ffcRows);
if (shapeProblems.length) {
  console.error(`ABORT: ${CSV_SOURCE.file} is not a usable variation-stock fixture:`);
  for (const p of shapeProblems) console.error(`  ✗ ${p}`);
  console.error('  Run `npm run td:validate:variation-stock` for the full report.');
  process.exit(2);
}

const PRICELIST_NAME = 'AGENT-TEST-Variation-USD';
let VIRTUAL_CATALOG_ID = null;

async function findProductByCode(code, catalogId) {
  const r = await api('POST', '/api/catalog/listentries', {
    keyword: code, ...(catalogId ? { catalogId } : {}), take: 20, searchInVariations: true,
  }, { expectStatus: [200, 201, 400, 404] });
  const hit = (r?.listEntries || r?.results || []).find((p) => p.code === code && p.type === 'product');
  return hit ? { id: hit.id, code, name: hit.name } : null;
}

/**
 * Resolve the STORE'S MAIN fulfillment center. Never ffcs[0]: the per-FFC blade INV-047 opens is the
 * store's main warehouse, so stock anywhere else is invisible to the case while the seed still reports
 * success. A missing main FFC is a hard abort, not a silent fallback.
 */
async function resolveMainFfc() {
  const r = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 200 }, { expectStatus: [200, 201] });
  const all = (r?.results || r?.items || []).filter((f) => f.isActive !== false);
  const main = await storeMainFulfillmentCenter(api, all);
  if (!main?.id) {
    throw new Error(
      `could not resolve the store's MAIN fulfillment center (${MAIN_FFC.csvFile} ${MAIN_FFC.roleColumn}=${MAIN_FFC.roleValue} → ${MAIN_FFC.csvId}). `
      + 'Run `npm run seed:inventory` first; stocking an arbitrary FFC would put the fixture where INV-047 never looks.'
    );
  }
  log(`main fulfillment center: ${main.name} (${main.id})`);
  return main;
}

async function ensureMaster(loc) {
  const existing = await findProductByCode(REC.master.sku, loc.catalogId);
  if (existing) { verbose(`↻ master ${REC.master.sku} (${existing.id})`); return existing; }
  const p = await api('POST', '/api/catalog/products', {
    catalogId: loc.catalogId, categoryId: loc.categoryId,
    ...buildMasterBody(REC, { seoInfos: [buildStoreSeo({ semanticUrl: REC.master.slug, pageTitle: REC.master.name })] }),
  }, { expectStatus: [200, 201] });
  log(`✓ master ${REC.master.sku} → ${p?.id}`);
  return { id: p?.id, code: REC.master.sku, name: REC.master.name };
}

async function ensureVariation(loc, masterId) {
  const existing = await findProductByCode(REC.variation.sku, loc.catalogId);
  if (existing) {
    // Self-heal a variation that lost (or never had) its parent link — without mainProductId it is a
    // standalone product wearing a variation's name, and INV-047 would prove nothing.
    const full = await api('GET', `/api/catalog/products/${existing.id}`, null, { expectStatus: [200, 404] });
    if (full && full.mainProductId !== masterId && !DRY_RUN) {
      full.mainProductId = masterId;
      await api('POST', '/api/catalog/products', full, { expectStatus: [200, 201, 204] });
      log(`↻ variation ${REC.variation.sku}: re-linked mainProductId → ${masterId}`);
    } else verbose(`↻ variation ${REC.variation.sku} (${existing.id})`);
    return existing;
  }
  const p = await api('POST', '/api/catalog/products', {
    catalogId: loc.catalogId, categoryId: loc.categoryId, ...buildVariationBody(REC, masterId),
  }, { expectStatus: [200, 201] });
  log(`✓ variation ${REC.variation.sku} → ${p?.id} (mainProductId ${masterId})`);
  return { id: p?.id, code: REC.variation.sku, name: REC.variation.name };
}

/**
 * One pricelist for this fixture, assigned to the store's virtual catalog. The fixture does not NEED a
 * price to satisfy INV-047 (an Admin blade test), but the master is linked into the storefront catalog,
 * and an unpriced product renders there as a 0.00 card with a dead qty stepper — visible clutter that
 * another suite can trip over. Pricing it also makes the CSV's list_price column real rather than
 * decorative, which is the whole point of having one source of truth.
 */
async function findOrCreatePriceList() {
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find((p) => p?.name === PRICELIST_NAME);
  if (pl) { verbose(`↻ pricelist ${PRICELIST_NAME} (${pl.id})`); return pl; }
  pl = await api('POST', '/api/pricing/pricelists', {
    name: PRICELIST_NAME, currency: REC.currency, description: 'Variation-stock fixture (VCST-5546)',
  }, { expectStatus: [200, 201] });
  await api('POST', '/api/pricing/assignments', {
    name: `${PRICELIST_NAME} → store virtual catalog`, pricelistId: pl.id, catalogId: VIRTUAL_CATALOG_ID, priority: 100,
  }, { expectStatus: [200, 201] }).catch((e) => log(`⚠ pricelist assignment failed: ${e.message.slice(0, 120)}`));
  log(`✓ pricelist ${PRICELIST_NAME} (${pl?.id})`);
  return pl;
}

async function setPrice(priceListId, productId) {
  await api('PUT', '/api/products/prices', [{
    productId,
    prices: [{ pricelistId: priceListId, productId, list: REC.listPrice, currency: REC.currency, minQuantity: 1 }],
  }], { expectStatus: [200, 204] }).catch((e) => log(`⚠ price ${productId}: ${e.message.slice(0, 120)}`));
}

async function setStock(ffcId, productId, quantity) {
  await api('PUT', '/api/inventory/plenty', [{
    fulfillmentCenterId: ffcId, productId, inStockQuantity: quantity, reservedQuantity: 0, status: 'Enabled',
  }], { expectStatus: [200, 204] });
}

/**
 * Confirm the platform agrees this is a variation family with two DISTINCT inventory records on the
 * main FFC. A seed that cannot show this has produced a fixture INV-047 would pass against vacuously.
 */
async function verifyVariationStock(ffcId, master, variation) {
  const child = await api('GET', `/api/catalog/products/${variation.id}`, null, { expectStatus: [200, 404] });
  if (!child) throw new Error(`variation ${variation.id} not readable back`);
  if (child.mainProductId !== master.id) {
    throw new Error(`variation ${REC.variation.sku} has mainProductId="${child.mainProductId}", expected the master "${master.id}" — it is a standalone product, not a variation`);
  }
  const inv = await api('POST', '/api/inventory/search', {
    productIds: [master.id, variation.id], fulfillmentCenterIds: [ffcId], take: 50,
  }, { expectStatus: [200, 201, 400, 404] }).catch(() => null);
  const results = inv?.results || inv?.items || [];
  const byProduct = new Map(results.map((i) => [i.productId, i]));
  const mInv = byProduct.get(master.id), vInv = byProduct.get(variation.id);
  if (!results.length) {
    log(`⚠ inventory search returned no rows for this FFC — could not confirm the per-FFC records programmatically (the writes themselves succeeded)`);
    return;
  }
  if (!vInv) throw new Error(`the variation has NO inventory record on the main FFC (${ffcId}) — INV-047 would find no row`);
  if (Number(vInv.inStockQuantity) !== REC.variation.stock) {
    throw new Error(`variation stock on the main FFC is ${vInv.inStockQuantity}, expected ${REC.variation.stock}`);
  }
  if (mInv && Number(mInv.inStockQuantity) === Number(vInv.inStockQuantity)) {
    throw new Error(`master and variation both report ${vInv.inStockQuantity} on the main FFC — the "own record, not the master's aggregate" assertion could not fail`);
  }
  log('');
  log('✓ variation-stock proof:');
  log(`    master    ${REC.master.sku} (${master.id}) → ${mInv ? mInv.inStockQuantity : 'no record'} @ ${ffcId}`);
  log(`    variation ${REC.variation.sku} (${variation.id}) → ${vInv.inStockQuantity} @ ${ffcId}  [mainProductId ✓]`);
}

async function main() {
  assertSafeTarget();
  await auth();
  console.log(`\n🌱 Variation-stock fixture${DRY_RUN ? ' (DRY RUN)' : ''} — ${FIXTURE_KEY}`);

  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  const loc = await ensureCategoryPath(api, REC.categoryPath);
  if (!loc) throw new Error(`could not resolve category path "${REC.categoryPath}"`);
  const ffc = await resolveMainFfc();

  const master = await ensureMaster(loc);
  const variation = await ensureVariation(loc, master.id);

  if (!DRY_RUN) {
    // Surface the MASTER in the store's virtual catalog (the variation rides its parent's PDP).
    await api('POST', '/api/catalog/listentrylinks/delete', [{ listEntryId: master.id, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204, 404] }).catch(() => {});
    // A PK_Item violation here means the link already exists — the product reaches the storefront via
    // its category's catalog-root link either way (confirmed live: the master resolves at the derived
    // /seed-test-fixtures/<slug> path), so it is noise, not a failure.
    await api('POST', '/api/catalog/listentrylinks', [{ listEntryId: master.id, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID, categoryId: loc.categoryId }], { expectStatus: [200, 204] })
      .catch((e) => (/PK_Item|duplicate/i.test(e.message) ? verbose('link already present') : log(`⚠ link: ${e.message.slice(0, 120)}`)));

    const pl = await findOrCreatePriceList();
    const byId = { master: master.id, variation: variation.id };
    for (const step of stockPlan(REC)) {
      await setPrice(pl.id, byId[step.role]);
      await setStock(ffc.id, byId[step.role], step.quantity);
      log(`✓ stock ${step.sku} = ${step.quantity} @ ${ffc.name}`);
    }

    syncEnvAliases(CSV_SOURCE.key, {
      [FIXTURE_KEY]: { master_id: master.id, variation_id: variation.id, ffc_id: ffc.id },
    });
    // FC_EAST's own id is a runtime GUID too. Until now it resolved to the CSV business key "FFC-001",
    // so @td(FC_EAST.id) — which INV-047 and the rest of suite 056 reference — was not a usable
    // platform id on any env. This is the same writeback rule, applied to the alias that was missing it.
    syncEnvAliases('inventory/fulfillment-centers', { [MAIN_FFC.csvId]: { ffc_id: ffc.id } });
    log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: wrote ${FIXTURE_KEY} + ${MAIN_FFC.alias} runtime ids`);

    await verifyVariationStock(ffc.id, master, variation);
  }

  console.log(`\n✅ ${FIXTURE_KEY} ${DRY_RUN ? 'dry run complete' : 'seeded'}`);
}

async function teardown() {
  assertSafeTarget();
  await auth();
  console.log(`\n🧹 Variation-stock teardown${DRY_RUN ? ' [DRY RUN]' : ''}`);

  // Bottom-up: the variation (child) before the master (parent).
  const ids = [];
  for (const sku of [REC.variation.sku, REC.master.sku]) {
    const p = await findProductByCode(sku);
    if (!p?.id) continue;
    if (!p.name?.startsWith(SEED_PREFIX)) { log(`⚠ skip ${sku}: "${p.name}" lacks the ${SEED_PREFIX} prefix — not a seed product`); continue; }
    ids.push(p.id);
  }
  if (ids.length && !DRY_RUN) {
    await api('POST', '/api/catalog/listentries/delete', { objectIds: ids, objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] })
      .catch((e) => log(`⚠ delete: ${e.message.slice(0, 120)}`));
    log(`✗ deleted ${ids.length} product(s) (variation first, then master)`);
  } else log('– no seeded products found');

  // The pricelist this seeder created — a stale one would keep pricing the SKUs if they were ever
  // re-created by hand.
  if (!DRY_RUN) {
    const s = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
    const plIds = (s?.results || []).filter((p) => p?.name === PRICELIST_NAME).map((p) => p.id);
    if (plIds.length) {
      await api('DELETE', `/api/pricing/pricelists?${idsParam(plIds)}`, null, { expectStatus: [200, 204, 404] }).catch(() => {});
      log(`✗ deleted pricelist ${PRICELIST_NAME}`);
    }
  }

  const residual = await verifyRemoved(async () => {
    const left = [];
    for (const sku of [REC.variation.sku, REC.master.sku]) {
      const p = await findProductByCode(sku);
      if (p?.id && p.name?.startsWith(SEED_PREFIX)) left.push(p.id);
    }
    return left;
  });
  console.log(residual === 0
    ? `\n✅ Variation-stock teardown verified — 0 residue`
    : `\n⚠ Variation-stock teardown incomplete — ${residual} product(s) still present`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

(TEARDOWN ? teardown() : main()).catch((e) => {
  console.error(`\n❌ SEED FAILED: ${e.message}`);
  if (VERBOSE) console.error(e.stack);
  process.exit(1);
});
