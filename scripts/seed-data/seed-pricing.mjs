/**
 * seed-pricing.mjs — Generic, standalone pricing seeder.
 *
 * Fills the gap left by the catalog-folded pricing path: creates a currency
 * pricelist, ASSIGNS it to the store (so the cart's pricing evaluator uses it),
 * then prices products so they become buyable. Directly fixes the
 * `PRODUCT_PRICE_INVALID` / `addItem.validationErrors=1` class of failure that
 * appears when a catalog has products with no valid pricelist coverage (e.g.
 * after a catalog restore — see project_vcstqa_restore_2026_05_15).
 *
 * It is GENERIC: by default it discovers the existing products in the active
 * B2B virtual catalog and prices whatever it finds — it does NOT create new
 * AGENT-TEST products (that is seed:catalog's job). Point it at any catalog/store.
 *
 * Conventions: shares scripts/lib/seed-common.mjs (ENV_RISK prod-guard, auth,
 * api, aliases). No hardcoded GUIDs — catalog/store resolved from
 * test-data/aliases.json / env (feedback_no_hardcoded_guids_in_scripts,
 * feedback_seed_env_risk_not_host_allowlist). AGENT-TEST- prefix → safe teardown.
 *
 * Usage:
 *   node scripts/seed-pricing.mjs                          # USD pricelist, B2B catalog+store, price up to --count products
 *   node scripts/seed-pricing.mjs --currency EUR           # seed an EUR pricelist too
 *   node scripts/seed-pricing.mjs --catalog <id> --store <id>
 *   node scripts/seed-pricing.mjs --count 200 --list-price 149.99
 *   node scripts/seed-pricing.mjs --dry-run --verbose
 *   node scripts/seed-pricing.mjs --teardown               # delete AGENT-TEST-PRICING-* pricelists
 */
import {
  STORE_ID, DATE_STAMP, DRY_RUN, TEARDOWN, VERBOSE,
  log, verbose, assertSafeTarget, auth, api, ensureVirtualCatalog,
} from '../lib/seed-common.mjs';

const argv = process.argv.slice(2);
const PREFIX = 'AGENT-TEST-PRICING';
const flag = (name, dflt = null) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);

const CURRENCY = (flag('--currency', 'USD')).toUpperCase();
const COUNT = Number(flag('--count', 100));
const LIST_PRICE = Number(flag('--list-price', 99.99));
const TARGET_STORE = flag('--store', null) || STORE_ID;

/**
 * Resolve the catalog to price — UNIFIED with every other seeder. Order:
 *   --catalog flag → the store's actual virtual catalog (ensureVirtualCatalog, env-correct,
 *   creates/assigns if missing) → VIRTUAL_CATALOG_B2B env override.
 * We deliberately do NOT read aliases.json's VIRTUAL_CATALOG_B2B here: loadAliases() reads only the
 * base (vcst) file and never layers aliases.<env>.json, so on any non-vcst env it returned vcst's
 * fc596540… root → the pricelist got assigned to a catalog with 0 products (silent "priced 0").
 * ensureVirtualCatalog resolves the catalog the store really uses and is auth-dependent, so it runs
 * after auth() inside seed().
 */
async function resolveCatalogId() {
  const fromFlag = flag('--catalog', null);
  if (fromFlag) return fromFlag;
  const resolved = await ensureVirtualCatalog(api, { storeId: TARGET_STORE });
  return resolved || process.env.VIRTUAL_CATALOG_B2B || null;
}

async function findPricelistByName(name) {
  const r = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  const list = r?.results || r?.priceLists || (Array.isArray(r) ? r : []);
  return list.find((p) => p.name === name) || null;
}

async function discoverProducts(catalogId, take) {
  // Catalog products search (admin) — returns products linked into the (virtual) catalog.
  const collected = [];
  let skip = 0;
  const page = 100;
  while (collected.length < take) {
    const body = { catalogId, take: Math.min(page, take - collected.length), skip, searchInVariations: false };
    const r = await api('POST', '/api/catalog/search/products', body, { expectStatus: [200, 201] });
    const items = r?.results || r?.items || [];
    if (!items.length) break;
    collected.push(...items.map((p) => ({ id: p.id, name: p.name, code: p.code })));
    if (collected.length >= (r.totalCount ?? collected.length)) break;
    skip += items.length;
  }
  return collected;
}

async function seed() {
  // Resolve the store's real virtual catalog at runtime (env-correct) — never a base-aliases GUID.
  const CATALOG_ID = await resolveCatalogId();
  if (!CATALOG_ID) {
    console.error('ABORT: no catalog id. Pass --catalog <id> or set VIRTUAL_CATALOG_B2B alias / env.');
    process.exit(1);
  }
  const plName = `${PREFIX}-${CURRENCY}-${DATE_STAMP}`;
  log(`Catalog: ${CATALOG_ID} | Store: ${TARGET_STORE} | Currency: ${CURRENCY} | pricing up to ${COUNT} products @ ${LIST_PRICE}`);

  // 1. Pricelist (idempotent — reuse if it already exists).
  let pricelist = DRY_RUN ? null : await findPricelistByName(plName);
  if (pricelist) {
    log(`Reusing pricelist ${plName} (${pricelist.id})`);
  } else {
    const body = { name: plName, currency: CURRENCY, description: 'Generic pricing seed — makes catalog products buyable' };
    const r = DRY_RUN ? { id: `dry-${plName}` } : await api('POST', '/api/pricing/pricelists', body, { expectStatus: [200, 201] });
    pricelist = { id: r.id, name: plName };
    log(`Created pricelist ${plName} (${pricelist.id})`);
  }

  // 2. Assignment → CATALOG (VC pricelist assignments are catalog-scoped; `catalogId` is the
  // binding field. A storeId-only assignment never binds to the catalog, so the cart finds no
  // valid price for catalog products → PRODUCT_PRICE_INVALID. Assign to the B2B-mixed catalog.)
  const assignName = `${plName} → ${CATALOG_ID}`;
  if (!DRY_RUN) {
    try {
      await api('POST', '/api/pricing/assignments', { name: assignName, catalogId: CATALOG_ID, pricelistId: pricelist.id, priority: 1000 }, { expectStatus: [200, 201] });
      log(`Assigned ${plName} → catalog ${CATALOG_ID} (priority 1000)`);
    } catch (e) {
      log(`⚠ Assignment may already exist or failed: ${String(e.message).slice(0, 140)}`);
    }
  }

  // 3. Discover products in the catalog.
  const products = DRY_RUN ? [] : await discoverProducts(CATALOG_ID, COUNT);
  log(`Discovered ${products.length} product(s) in catalog ${CATALOG_ID}`);
  if (DRY_RUN) { log('[DRY RUN] would create a pricelist+assignment and price discovered products'); return; }

  // 4. Batch-set prices (PUT /api/products/prices — proven in seed-test-data.js).
  const payload = products.map((p) => ({
    productId: p.id,
    prices: [{ pricelistId: pricelist.id, productId: p.id, list: LIST_PRICE, minQuantity: 1, currency: CURRENCY }],
  }));
  let priced = 0;
  // chunk to avoid oversized PUT bodies
  for (let i = 0; i < payload.length; i += 50) {
    const chunk = payload.slice(i, i + 50);
    if (!chunk.length) continue;
    await api('PUT', '/api/products/prices', chunk, { expectStatus: [200, 204] });
    priced += chunk.length;
    verbose(`  priced ${priced}/${payload.length}`);
  }
  log(`✓ Set ${CURRENCY} prices for ${priced} product(s) in ${plName}`);

  // Storefront/cart price comes from the search index, so a pricing change is invisible
  // to the cart until CatalogProduct is reindexed (mirrors seed-test-data.js triggerReindex).
  // NOTE: a scoped (ids) reindex may be insufficient on some envs — a full rebuild
  // (POST /api/search/indexes/index [{documentType:"CatalogProduct", rebuild:true}]) may be
  // required, and it is async (Hangfire). Verify buyability after the job completes.
  try {
    const idsToIndex = products.map((p) => p.id);
    await api('POST', '/api/search/indexes/index', [{ documentType: 'CatalogProduct', ids: idsToIndex }], { expectStatus: [200, 201, 202, 204] });
    log(`Queued CatalogProduct reindex for ${idsToIndex.length} product(s) — async; allow time before cart use`);
  } catch (e) {
    log(`⚠ reindex trigger failed (${String(e.message).slice(0, 100)}) — run a CatalogProduct reindex manually before cart tests`);
  }

  // No _seed-results report: PRICELIST_* aliases resolve by static business key
  // (pricelist_id) from the committed CSV — no runtime GUID to persist here.
  log(`Done: ${priced} product(s) priced on ${pricelist?.name || CURRENCY} list.`);
}

async function teardown() {
  log(`Teardown: deleting ${PREFIX}-* pricelists`);
  const r = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(PREFIX)}`, null, { expectStatus: [200, 404] });
  const list = r?.results || r?.priceLists || (Array.isArray(r) ? r : []);
  const ids = list.filter((p) => (p.name || '').startsWith(PREFIX)).map((p) => p.id);
  if (!ids.length) { log('  nothing to delete'); return; }
  if (DRY_RUN) { log(`  [DRY RUN] would delete ${ids.length} pricelist(s)`); return; }
  await api('DELETE', `/api/pricing/pricelists?ids=${ids.join(',')}`, null, { expectStatus: [200, 204, 404] });
  log(`  ✓ deleted ${ids.length} pricelist(s) (assignments + prices cascade)`);
}

(async () => {
  console.log(`💲 Seed Pricing${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown();
  else await seed();
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
