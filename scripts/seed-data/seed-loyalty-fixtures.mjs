/**
 * seed-loyalty-fixtures.mjs — the 1-PTS divisor product fixture (LOY_SKU_PTS_UNIT).
 *
 * Idempotently provisions the balance-relative loyalty test fixture that suites 075b / 083b
 * (insufficient-balance + ≤-boundary) depend on: a Physical, isBuyable, trackInventory=false
 * product `AGENT-TEST-PTS-UNIT-001` priced EXACTLY 1 PTS in a PTS price list, linked into the
 * store's virtual catalog. Because list = 1 PTS, addItem qty=N makes the cart's PTS subtotal == N
 * exactly, so a test can drive Σ(PTS) to any integer relative to a user's live balance.
 *
 * WHY THIS EXISTS (VCST-5103): the fixture was hand-created once and pinned as an inline alias with
 * hardcoded env GUIDs (product id + PTS price-list id). Those drifted after the 2026-05-15 catalog
 * restore → the PTS line silently stopped adding (no 1-PTS price resolved → 0 PTS subtotal → line
 * dropped, order placed). This seeder replaces that fragile pin: it resolves the price list + virtual
 * catalog at RUNTIME (no hardcoded GUIDs), re-establishes the 1-PTS price + catalog link, and writes
 * the runtime ids to aliases.<env>.json (per the multi-env rule in .claude/rules/test-data.md). The
 * base aliases.json keeps only env-invariant business fields (sku/price/currency).
 *
 * Conventions: scripts/lib/seed-common.mjs (ENV_RISK prod-guard, auth, api, virtual-catalog / FFC /
 * category resolvers, writeEnvAliasOverride, verifyCreated/verifyRemoved). No hardcoded GUIDs.
 * Idempotent: looks the product up by SKU, reconciles price + catalog link; re-runnable.
 *
 * Usage:
 *   node scripts/seed-data/seed-loyalty-fixtures.mjs [--dry-run] [--verbose]
 *   node scripts/seed-data/seed-loyalty-fixtures.mjs --teardown        # delete the product + overlay ids
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, STORE_ID, DRY_RUN, TEARDOWN, VERBOSE,
  log, verbose, assertSafeTarget, auth, api,
  ensureVirtualCatalog, ensureFulfillmentCenter, ensureCategoryPath, ensureCurrencies,
  buildStoreSeo, writeEnvAliasOverride, verifyCreated, verifyRemoved, idsParam,
} from '../lib/seed-common.mjs';

const SEED_NAME_PREFIX = 'AGENT-TEST';       // hard teardown guard — never delete a non-seed product
const SKU = 'AGENT-TEST-PTS-UNIT-001';
const PRODUCT_NAME = 'AGENT-TEST PTS Unit Divisor';
const PTS = 'PTS';
const PTS_PRICELIST_NAME = 'Loyalty PTS price list';   // currency=PTS — NOT the MOA 'BoltsLoyalty' list
const CATEGORY_PATH = 'Loyalty Fixtures';              // stable ad-hoc seed category (created + linked into virtual)
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

let VIRTUAL_CATALOG_ID = null;

/** Find an existing PTS-currency price list by exact name; create + assign to the virtual catalog if absent. */
async function ensurePtsPriceList() {
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PTS_PRICELIST_NAME)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find((p) => p?.name === PTS_PRICELIST_NAME);
  if (pl) { log(`  ↻ PTS price list: ${PTS_PRICELIST_NAME} (${pl.id})`); return pl; }
  if (DRY_RUN) { log(`  [DRY] would create PTS price list "${PTS_PRICELIST_NAME}" (currency=${PTS})`); return { id: `dry-pl-pts` }; }
  pl = await api('POST', '/api/pricing/pricelists', { name: PTS_PRICELIST_NAME, currency: PTS, description: 'VCST-5103 loyalty PTS divisor pricing (1 PTS/unit)' }, { expectStatus: [200, 201] });
  try {
    await api('POST', '/api/pricing/assignments', { name: `${PTS_PRICELIST_NAME} → ${STORE_ID}`, pricelistId: pl.id, catalogId: VIRTUAL_CATALOG_ID, priority: 100 }, { expectStatus: [200, 201] });
    log(`  ✓ PTS price list + catalog assignment: ${PTS_PRICELIST_NAME} (${pl.id})`);
  } catch (e) { log(`  ⚠ PTS price list created but assignment failed: ${String(e.message).slice(0, 150)}`); }
  return pl;
}

async function findProductByCode(code, catalogId) {
  const r = await api('POST', '/api/catalog/listentries', { keyword: code, ...(catalogId ? { catalogId } : {}), take: 5 }, { expectStatus: [200, 201, 400, 404] });
  const found = (r?.listEntries || r?.results || []).find((p) => p.code === code && p.type === 'product');
  return found ? { id: found.id, code, name: found.name } : null;
}

/** Set the product's 1-PTS price in the PTS price list (idempotent — PUT replaces). */
async function setPtsPrice(pricelistId, productId) {
  const prices = [{ pricelistId, productId, list: 1, currency: PTS, minQuantity: 1 }];
  await api('PUT', '/api/products/prices', [{ productId, prices }], { expectStatus: [200, 204] });
}

/** Link the product UNDER its category in the virtual catalog (drop any stale root link first). */
async function linkProductToCategory(productId, categoryId) {
  await api('POST', '/api/catalog/listentrylinks/delete', [{ listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204, 404] }).catch(() => {});
  await api('POST', '/api/catalog/listentrylinks', [{ listEntryId: productId, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID, categoryId }], { expectStatus: [200, 204] });
}

/** Remove the LOY_SKU_PTS_UNIT runtime ids from aliases.<env>.json on teardown (static file edit). */
function removeOverlayIds() {
  if (DRY_RUN) { log('  [DRY] would remove LOY_SKU_PTS_UNIT overlay ids from aliases.<env>.json'); return; }
  const env = process.env.TEST_ENV || 'vcst';
  const p = join(ROOT, `test-data/aliases.${env}.json`);
  if (!existsSync(p)) return;
  const cur = JSON.parse(readFileSync(p, 'utf8'));
  if (cur.LOY_SKU_PTS_UNIT) { delete cur.LOY_SKU_PTS_UNIT; writeFileSync(p, JSON.stringify(cur, null, 2)); log(`  ✓ removed LOY_SKU_PTS_UNIT overlay from aliases.${env}.json`); }
}

async function seed() {
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  log(`  Virtual catalog: ${VIRTUAL_CATALOG_ID}`);
  await ensureCurrencies(api, [PTS]);                       // PTS must be a registered currency for the price list
  const pl = await ensurePtsPriceList();
  const ffc = await ensureFulfillmentCenter(api);           // resolved for completeness; product is trackInventory=false
  const loc = await ensureCategoryPath(api, CATEGORY_PATH);
  if (!loc) throw new Error(`could not resolve category path "${CATEGORY_PATH}"`);

  // Idempotent product create (Physical, buyable, NON-tracked so it is always addable).
  let product = await findProductByCode(SKU, loc.catalogId);
  if (product) { log(`  ↻ product: ${PRODUCT_NAME} (${product.id})`); }
  else if (DRY_RUN) { log(`  [DRY] would create product ${PRODUCT_NAME} (${SKU})`); product = { id: 'dry-pts-unit' }; }
  else {
    product = await api('POST', '/api/catalog/products', {
      catalogId: loc.catalogId, categoryId: loc.categoryId,
      name: PRODUCT_NAME, code: SKU, productType: 'Physical', vendor: 'QA',
      isActive: true, isBuyable: true, trackInventory: false,
      seoInfos: [buildStoreSeo({ semanticUrl: slug(PRODUCT_NAME), pageTitle: PRODUCT_NAME })],
    }, { expectStatus: [200, 201] });
    log(`  ✓ product: ${PRODUCT_NAME} (${product?.id})`);
  }

  if (!DRY_RUN && product?.id && !String(product.id).startsWith('dry-')) {
    await setPtsPrice(pl.id, product.id);
    log(`  ✓ price: 1 ${PTS} in "${PTS_PRICELIST_NAME}"`);
    await linkProductToCategory(product.id, loc.categoryId);
    log(`  ✓ linked into virtual catalog under ${loc.name}`);
    const okProduct = await verifyCreated(api, 'product', product.id);
    log(okProduct ? `  ✓ verified product present (${product.id})` : `  ⚠ product NOT found on read-back (${product.id})`);
    // Multi-env write-back: runtime GUIDs → aliases.<env>.json (base alias keeps only sku/price/currency).
    writeEnvAliasOverride({ LOY_SKU_PTS_UNIT: { id: product.id, pricelistId: pl.id } });
    log(`  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: LOY_SKU_PTS_UNIT.id + .pricelistId`);
  }
  log('Done: LOY_SKU_PTS_UNIT fixture ensured.');
}

async function teardown() {
  log(`Teardown: deleting ${SKU} (${SEED_NAME_PREFIX} guard)`);
  const product = await findProductByCode(SKU);
  if (!product?.id) { log('  – product not found'); }
  else if (!product.name?.startsWith(SEED_NAME_PREFIX)) { log(`  ⚠ skip: "${product.name}" lacks ${SEED_NAME_PREFIX} prefix — not a seed product`); }
  else if (DRY_RUN) { log(`  [DRY] would delete product ${product.id}`); }
  else {
    // objectIds (never empty ObjectIds — that wipes the whole catalog); the guard above bounds it to this SKU.
    await api('POST', '/api/catalog/listentries/delete', { objectIds: [product.id], objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] }).catch((e) => log(`  ⚠ delete: ${String(e.message).slice(0, 120)}`));
    log(`  ✗ deleted product ${product.id}`);
    const residual = await verifyRemoved(async () => { const p = await findProductByCode(SKU); return p?.id && p.name?.startsWith(SEED_NAME_PREFIX) ? [p.id] : []; });
    log(residual === 0 ? '  ✓ teardown verified — product gone' : `  ⚠ teardown incomplete — ${residual} still present`);
  }
  removeOverlayIds();
}

(async () => {
  console.log(`🎁 Seed Loyalty Fixtures (LOY_SKU_PTS_UNIT)${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown(); else await seed();
})().catch((e) => { console.error('FAILED:', e.message); if (VERBOSE) console.error(e.stack); process.exit(1); });
