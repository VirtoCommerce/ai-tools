/**
 * seed-inventory.mjs — Standalone inventory seeder (fulfillment centers + stock).
 *
 * Two modes:
 *   (A) Fixture-driven (default): ensure fulfillment centers from
 *       test-data/inventory/fulfillment-centers.csv exist, then set stock from
 *       test-data/inventory/stock-levels.csv (resolving products by SKU).
 *   (B) Bulk catalog mode (--catalog <id> --stock <n> [--count <n>]): set stock=n
 *       for products discovered in a catalog. The in-stock complement to
 *       `seed:pricing` — together they make catalog products buyable (priced + stocked).
 *
 * Conventions: shares scripts/lib/seed-common.mjs (ENV_RISK prod-guard, auth, api,
 * loadCsv, aliases). No hardcoded GUIDs. Created FFCs carry the AGENT-TEST- prefix
 * for safe teardown. Idempotent: FFCs reused by code; stock is an upsert.
 *
 * Usage:
 *   node scripts/seed-inventory.mjs                                  # fixtures: FFCs + stock-levels.csv
 *   node scripts/seed-inventory.mjs --catalog <id> --stock 1000 --count 100   # bulk in-stock a catalog
 *   node scripts/seed-inventory.mjs --catalog $(VIRTUAL_CATALOG_B2B) ...       # B2B catalog buyability
 *   node scripts/seed-inventory.mjs --dry-run --verbose
 *   node scripts/seed-inventory.mjs --teardown                       # delete AGENT-TEST- fulfillment centers
 */
import {
  DATE_STAMP, DRY_RUN, TEARDOWN, VERBOSE,
  log, verbose, assertSafeTarget, auth, api, loadCsv, loadAliases, storeMainFulfillmentCenter,
} from '../lib/seed-common.mjs';

const argv = process.argv.slice(2);
const FFC_PREFIX = 'AGENT-TEST';
const flag = (name, dflt = null) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : dflt);

const aliases = loadAliases();
const vc = aliases.VIRTUAL_CATALOG_B2B;
const CATALOG_ID = flag('--catalog', null) || (vc && (vc.id || (typeof vc === 'string' ? vc : null)));
const STOCK = Number(flag('--stock', 1000));
const COUNT = Number(flag('--count', 100));

async function listFfcs() {
  const r = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 100 }, { expectStatus: [200, 201] });
  return r?.results || r?.items || [];
}

// Deterministic display name for a CSV FFC row — the idempotency key we CAN rely on.
// (The fulfillmentcenters/search projection does NOT return `code`, so a code-keyed dedupe
//  map is all-undefined and re-creates every FFC on every run — 6→11→16…. Name is returned.)
const ffcName = (row) => `${FFC_PREFIX}-${row.ffc_name}`;

async function ensureFulfillmentCenters() {
  const existing = await listFfcs();
  const byName = new Map(existing.map((f) => [f.name, f]));
  let rows = [];
  try { rows = loadCsv('test-data/inventory/fulfillment-centers.csv'); } catch { rows = []; }
  const out = [...existing];
  // Bulk mode only needs ONE existing FFC; never create. Fixture mode may top up missing
  // FFCs, but creation is best-effort (some envs disallow POST /fulfillmentcenters → 405).
  const bulkMode = argv.includes('--catalog') || argv.includes('--stock');
  if (bulkMode || (existing.length && !rows.some((r) => !byName.has(ffcName(r))))) return out;
  for (const row of rows) {
    const name = ffcName(row);
    if (byName.has(name)) { verbose(`FFC exists: ${name}`); continue; }
    const body = {
      name,
      code: row.ffc_code,
      isActive: String(row.is_active).toLowerCase() !== 'false',
      address: {
        line1: row.address_line1, city: row.city, regionId: row.state,
        postalCode: row.postal_code, countryCode: row.country_code, phone: row.phone,
      },
    };
    if (DRY_RUN) { log(`[DRY] would create FFC ${row.ffc_code}`); out.push({ id: `dry-${row.ffc_code}`, code: row.ffc_code, name }); continue; }
    try {
      // Create/update is PUT (POST /fulfillmentcenters is 405 — only /search,/plenty,/batch are POST).
      let r = await api('PUT', '/api/inventory/fulfillmentcenters', body, { expectStatus: [200, 201, 204] });
      if (!r?.id) {
        // PUT 204 with no body — re-resolve by NAME (search omits code, so a code match fails).
        const again = await listFfcs();
        r = again.find((f) => f.name === name) || r;
      }
      out.push({ id: r?.id, code: row.ffc_code, name, _created: true });
      byName.set(name, r);
      log(`Created FFC ${name} (${r?.id})`);
    } catch (e) {
      log(`⚠ FFC create not available for ${row.ffc_code} (${String(e.message).slice(0, 80)}) — using existing FFCs`);
    }
  }
  return out;
}

async function resolveProductIdBySku(sku) {
  const r = await api('POST', '/api/catalog/search/products', { keyword: sku, take: 1 }, { expectStatus: [200, 201] });
  const items = r?.results || r?.items || [];
  return items[0]?.id || null;
}

async function setStock(entries) {
  // PUT /api/inventory/plenty — batch upsert of InventoryInfo (proven in seed-test-data.js).
  for (let i = 0; i < entries.length; i += 50) {
    const chunk = entries.slice(i, i + 50);
    if (!chunk.length) continue;
    if (DRY_RUN) { log(`[DRY] would upsert stock for ${chunk.length}`); continue; }
    await api('PUT', '/api/inventory/plenty', chunk, { expectStatus: [200, 204] });
  }
}

async function seedFromFixtures(ffcs) {
  let rows = [];
  try { rows = loadCsv('test-data/inventory/stock-levels.csv'); } catch { log('no stock-levels.csv — skipping fixture stock'); return 0; }
  // All fixture stock lands on the store's OWN fulfillment center. stock-levels.csv's `ffc_id` is a
  // CODE, but the /fulfillmentcenters/search projection omits `code`, so per-row FFC routing isn't
  // resolvable here — don't pretend it is (a dead `f.code === row.ffc_id` .find always missed). Using
  // the store main FFC (not ffcs[0], an arbitrary search-order pick) keeps stock on the warehouse the
  // store actually fulfills from.
  const storeFfc = (await storeMainFulfillmentCenter(api, ffcs)) || ffcs[0];
  const entries = [];
  for (const row of rows) {
    if (!storeFfc) continue;
    const pid = DRY_RUN ? `dry-${row.sku}` : await resolveProductIdBySku(row.sku);
    if (!pid) { verbose(`unresolved SKU ${row.sku} — skipped`); continue; }
    entries.push({ fulfillmentCenterId: storeFfc.id, productId: pid, inStockQuantity: Number(row.in_stock_quantity) || 0 });
  }
  await setStock(entries);
  log(`✓ Fixture stock: ${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}`);
  return entries.length;
}

async function seedBulkCatalog(ffcs) {
  const ffc = (await storeMainFulfillmentCenter(api, ffcs)) || ffcs[0];
  if (!ffc) { log('no fulfillment center available for bulk stock'); return 0; }
  const products = [];
  let skip = 0;
  while (products.length < COUNT && !DRY_RUN) {
    const r = await api('POST', '/api/catalog/search/products', { catalogId: CATALOG_ID, take: Math.min(100, COUNT - products.length), skip }, { expectStatus: [200, 201] });
    const items = r?.results || r?.items || [];
    if (!items.length) break;
    products.push(...items.map((p) => p.id));
    skip += items.length;
    if (products.length >= (r.totalCount ?? products.length)) break;
  }
  log(`Bulk stock: ${products.length} product(s) in catalog ${CATALOG_ID} → ${STOCK} units @ FFC ${ffc.code}`);
  await setStock(products.map((pid) => ({ fulfillmentCenterId: ffc.id, productId: pid, inStockQuantity: STOCK })));
  return products.length;
}

async function teardown() {
  log(`Teardown: deleting ${FFC_PREFIX}-* fulfillment centers`);
  const ffcs = await listFfcs();
  const ids = ffcs.filter((f) => (f.name || '').startsWith(FFC_PREFIX)).map((f) => f.id).filter(Boolean);
  if (!ids.length) { log('  none to delete'); return; }
  if (DRY_RUN) { log(`  [DRY] would delete ${ids.length}`); return; }
  // Delete one id per request: the controller does NOT parse the comma-joined `?ids=a,b,c`
  // form (it treats the whole string as a single id → matches nothing → deletes 0 while still
  // returning 200, so a batch teardown silently no-ops). Individual deletes are verified to work.
  let deleted = 0;
  for (const id of ids) {
    await api('DELETE', `/api/inventory/fulfillmentcenters?ids=${encodeURIComponent(id)}`, null, { expectStatus: [200, 204, 404] });
    deleted++;
  }
  log(`  ✓ deleted ${deleted} fulfillment center(s)`);
}

(async () => {
  console.log(`📦 Seed Inventory${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) { await teardown(); return; }
  const ffcs = await ensureFulfillmentCenters();
  log(`${ffcs.length} fulfillment center(s) available`);
  const bulk = argv.includes('--catalog') || argv.includes('--stock');
  const count = bulk ? await seedBulkCatalog(ffcs) : await seedFromFixtures(ffcs);
  // No _seed-results report: FC_* aliases resolve by static business key (ffc_id)
  // from the committed CSV — no runtime GUID to persist here.
  log(`Done: ${count} stock entr${count === 1 ? 'y' : 'ies'} across ${ffcs.length} FFC(s).`);
})().catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
