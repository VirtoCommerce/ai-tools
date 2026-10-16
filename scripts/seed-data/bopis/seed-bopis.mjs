#!/usr/bin/env node
/**
 * scripts/seed-bopis.mjs
 *
 * Idempotent seeder for BOPIS pickup locations from test-data/stores/bopis-locations.csv.
 * Fills the gap where pickup locations had no seed script.
 *
 * KEY FACT (verified against vc-module-shipping source): a BOPIS pickup location is a
 * dedicated `PickupLocation` entity (route `api/shipping/pickup-locations`), NOT a flag
 * on a fulfillment center. It REFERENCES an FFC via `fulfillmentCenterId` as its
 * inventory source. This seeder links each location to an existing FFC (matched by the
 * CSV ffc_id, else the first active FFC) — it does not create FFCs.
 *
 * REST contract:
 *   - Create:   POST  /api/shipping/pickup-locations            (single object) → 200
 *   - Update:   PUT   /api/shipping/pickup-locations            (object incl. id) → 200
 *   - Search:   POST  /api/shipping/pickup-locations/search     {storeId, take} → PickupLocation[]
 *   - Delete:   DELETE /api/shipping/pickup-locations/{storeId}/{id} → 200
 *   - FFC lookup: POST /api/inventory/fulfillmentcenters/search {take} → {results[]}
 *   geoLocation is a single "lat,long" string (no space). countryCode is ISO-3.
 *
 * USAGE:
 *   node scripts/seed-bopis.mjs [--dry-run] [--verbose] [--only LOC-001] [--teardown]
 *   node scripts/seed-bopis.mjs --pool [--pool-only] [--product <productId>] [--dry-run]
 *   node scripts/seed-bopis.mjs --teardown --pool-only            (removes ONLY the pool)
 *
 * PAGINATION POOL (opt-in, `--pool`): POOL_SIZE locations from bopis-pool-specs.mjs, all bound to the
 * fulfillment center that STOCKS the BOPIS test product (resolved live from inventory), so every one
 * is cart-eligible for that product — the 50-per-page cases need > 2 pages of eligible locations.
 * After seeding it snapshots the live default order of xAPI productPickupLocations(productId) and
 * writes BOPIS.{location50Id,location51Id,lastLocationId,…,testProductId,testSku,…} to
 * aliases.<env>.json. OPT-IN because vcst's BOPIS overlay is a curated snapshot of its 102 native
 * locations — a default run must not reshape it. Product: --product, else the env overlay's
 * BOPIS.testProductId, else BUYABLE_NO_MIN_QTY.id from the same overlay.
 * Safety: ENV_RISK gate (blocks ENV_RISK=production unless --allow-admin-writes-on-prod); idempotent by location name within the store.
 * No _seed-results report (VCST-5406) — BOPIS_* resolve by static location_id business key.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, loadCsv, log, verbose, csvBool, iso3,
  ensureFulfillmentCenter, verifyRemoved, writeEnvAliasOverride,
  STORE_ID, DATE_STAMP, DRY_RUN, TEARDOWN, ONLY, BACK_URL, FRONT_URL, ROOT,
} from '../../lib/seed-common.mjs';
import { POOL_PREFIX, POOL_SIZE, PAGE_SIZE, poolLocations, poolContractProblems } from './bopis-pool-specs.mjs';

const argv = process.argv.slice(2);
const POOL_ONLY = argv.includes('--pool-only');
const POOL = POOL_ONLY || argv.includes('--pool');
const PRODUCT_ARG = argv.includes('--product') ? argv[argv.indexOf('--product') + 1] : null;

// Pickup locations join the AGENT-TEST family so teardown's safety guard can identify
// and sweep them (the guard only deletes locations whose LIVE name starts with AGENT-TEST).
// Idempotent: a CSV name that already carries the prefix is left as-is.
const seededName = (name) => (name && name.startsWith('AGENT-TEST') ? name : `AGENT-TEST-${name}`);

let FFCS = [];
async function loadFfcs() {
  const r = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 100 });
  FFCS = r?.results || [];
  log(`Discovered ${FFCS.length} fulfillment center(s)`);
}
// Best-effort: match the CSV ffc_id to an existing FFC by id/outerId/name, else first active.
function resolveFfcId(ffcRef) {
  if (!FFCS.length) return null;
  const m = FFCS.find((f) => f.id === ffcRef || f.outerId === ffcRef || f.name === ffcRef || (f.name || '').includes(ffcRef));
  return (m || FFCS[0]).id;
}

async function findPickup(storeId, name) {
  // take 1000, not 200: with the pagination pool a store holds > 200 locations and a name past the
  // first page would read as absent and be created a second time.
  const r = await api('POST', '/api/shipping/pickup-locations/search', { storeId, take: 1000 });
  const list = Array.isArray(r) ? r : (r?.results || []);
  return list.find((p) => p.name === name) || null;
}

function buildBody(row, ffcId, existingId) {
  const storeId = (row.store_id || STORE_ID).trim();
  const lat = (row.latitude || '').trim();
  const lng = (row.longitude || '').trim();
  const body = {
    name: seededName(row.location_name),
    storeId,
    isActive: csvBool(row.is_active, true),
    fulfillmentCenterId: ffcId,
    geoLocation: lat && lng ? `${lat},${lng}` : undefined,
    contactPhone: row.phone || undefined,
    contactEmail: row.email || undefined,
    workingHours: [row.operating_hours_weekday && `Mon-Fri ${row.operating_hours_weekday}`,
      row.operating_hours_weekend && `Sat-Sun ${row.operating_hours_weekend}`].filter(Boolean).join('; ') || undefined,
    description: row.description || undefined,
    address: {
      name: row.location_name,
      line1: row.address_line1,
      line2: row.address_line2 || undefined,
      city: row.city,
      regionId: row.state_province || undefined,
      regionName: row.state_province || undefined,
      postalCode: row.postal_code,
      countryCode: iso3(row.country_code),
      countryName: row.country_name,
    },
  };
  if (existingId) body.id = existingId;
  return body;
}

async function teardown(rows) {
  log(`Teardown — deleting ${rows.length} pickup location(s)...`);
  let deleted = 0;
  for (const row of rows) {
    const storeId = (row.store_id || STORE_ID).trim();
    const found = await findPickup(storeId, seededName(row.location_name));
    if (!found) { verbose(`not present: ${row.location_name}`); continue; }
    // Safety: only delete AGENT-TEST- pickup locations, never a real one that shares a name.
    // Authorize deletion on the LIVE entity's name only — never the seeder-authored CSV name (which
    // is always AGENT-TEST-prefixed and would green-light deleting a real matched location).
    if (!String(found.name || '').startsWith('AGENT-TEST')) { verbose(`skip ${found.name || row.location_name}: not an AGENT-TEST location`); continue; }
    await api('DELETE', `/api/shipping/pickup-locations/${storeId}/${found.id}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✓ Deleted: ${row.location_name} (${found.id})`);
    deleted++;
  }
  // Verify zero residue — re-search for the rows we tried to delete.
  const residual = await verifyRemoved(async () => {
    const still = [];
    for (const row of rows) {
      const storeId = (row.store_id || STORE_ID).trim();
      if (await findPickup(storeId, seededName(row.location_name))) still.push(row.location_name);
    }
    return still;
  });
  log(residual === 0
    ? `Teardown verified — ${deleted} deleted, 0 remain.`
    : `⚠ Teardown incomplete — ${deleted} deleted, ${residual} still present.`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

// ── Pagination pool (opt-in, --pool / --pool-only) ──────────────────────────────
async function listPickups(storeId) {
  const r = await api('POST', '/api/shipping/pickup-locations/search', { storeId, take: 1000 });
  return Array.isArray(r) ? r : (r?.results || []);
}

/** The env's BOPIS test product: --product, else aliases.<env>.json BOPIS.testProductId, else BUYABLE_NO_MIN_QTY.id. */
function poolProductId() {
  if (PRODUCT_ARG) return PRODUCT_ARG;
  const p = join(ROOT, `test-data/aliases.${process.env.TEST_ENV || 'vcst'}.json`);
  const ov = existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
  return ov.BOPIS?.testProductId || ov.BUYABLE_NO_MIN_QTY?.id || null;
}

/** The store FFC (main + additional) holding the most available stock of the product. */
async function stockingFfc(productId) {
  const store = await api('GET', `/api/stores/${STORE_ID}`);
  const storeFfcs = new Set([store?.mainFulfillmentCenterId, ...(store?.additionalFulfillmentCenterIds || [])].filter(Boolean));
  const inv = await api('POST', '/api/inventory/search', { productIds: [productId], take: 100 });
  const rows = (inv?.results || []).filter((i) => storeFfcs.has(i.fulfillmentCenterId) && Number(i.inStockQuantity) - Number(i.reservedQuantity || 0) > 0);
  rows.sort((a, b) => Number(b.inStockQuantity) - Number(a.inStockQuantity));
  return rows[0]?.fulfillmentCenterId || null;
}

function poolBody(row, ffcId, existingId) {
  const body = {
    name: row.name, storeId: STORE_ID, isActive: true, fulfillmentCenterId: ffcId,
    geoLocation: row.geoLocation, workingHours: 'Mon-Fri 09:00-18:00',
    description: 'AGENT-TEST BOPIS pagination pool (bopis-pool-specs.mjs)',
    address: { name: row.name, line1: row.line1, city: row.city, regionId: row.region, regionName: row.region, postalCode: row.postal, countryCode: row.country, countryName: row.countryName },
  };
  if (existingId) body.id = existingId;
  return body;
}

async function seedPool() {
  const rows = poolLocations();
  const problems = poolContractProblems(rows);
  if (problems.length) { console.error(`ABORT: pool declaration is not discriminating: ${problems.join('; ')}`); process.exit(2); }
  const productId = poolProductId();
  if (!productId) { console.error('ABORT: no BOPIS test product — pass --product <id> or seed BUYABLE_NO_MIN_QTY for this env'); process.exit(2); }
  const product = await api('GET', `/api/catalog/products/${productId}`, null, { expectStatus: [200, 204, 404] });
  if (!product?.id) { console.error(`ABORT: product ${productId} not found on ${BACK_URL}`); process.exit(2); }
  const ffcId = await stockingFfc(productId);
  if (!ffcId) { console.error(`ABORT: product ${product.code} has no stock on any ${STORE_ID} fulfillment center — no pickup location could be eligible`); process.exit(2); }
  log(`Pool: ${rows.length} location(s) → FFC ${ffcId} (stocks ${product.code} "${product.name}")`);

  const byName = new Map((await listPickups(STORE_ID)).map((p) => [p.name, p]));
  let created = 0, updated = 0;
  for (const row of rows) {
    const existing = byName.get(row.name);
    if (existing && existing.fulfillmentCenterId === ffcId && existing.isActive) { verbose(`= ${row.name}`); continue; }
    const body = poolBody(row, ffcId, existing?.id);
    if (existing) { await api('PUT', '/api/shipping/pickup-locations', body, { expectStatus: [200, 204] }); updated++; }
    else { await api('POST', '/api/shipping/pickup-locations', body, { expectStatus: [200, 201] }); created++; }
  }
  log(`✓ pool: ${created} created, ${updated} updated, ${rows.length - created - updated} unchanged${DRY_RUN ? ' [DRY RUN — nothing written]' : ''}`);
  if (DRY_RUN) return;
  await snapshotPool(product);
}

async function gql(query) {
  const r = await fetch(`${FRONT_URL}/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query }) });
  const j = await r.json();
  if (j.errors) throw new Error(`xAPI: ${JSON.stringify(j.errors).slice(0, 300)}`);
  return j.data;
}

/**
 * Snapshot the live default order of productPickupLocations(productId) — the service and default
 * sort cartPickupLocations uses for a cart holding only this product — and write the position
 * aliases. Polls while the pickup-location index catches up with freshly created rows.
 */
async function snapshotPool(product) {
  const q = `{ productPickupLocations(productId:"${product.id}", storeId:"${STORE_ID}", cultureName:"en-US", first:500) { totalCount items { id name } } }`;
  let data;
  for (let i = 0; i < 24; i++) {
    data = (await gql(q)).productPickupLocations;
    if (data.totalCount > POOL_SIZE) break;
    verbose(`index catching up: ${data.totalCount} eligible`);
    await new Promise((res) => setTimeout(res, 5000));
  }
  const items = data.items || [];
  if (items.length <= PAGE_SIZE) { console.error(`⚠ only ${items.length} eligible location(s) visible — BOPIS position aliases NOT written`); process.exitCode = 1; return; }
  const p50 = items[PAGE_SIZE - 1], p51 = items[PAGE_SIZE], last = items[items.length - 1];
  const store = await gql(`{ pickupLocations(storeId:"${STORE_ID}", first:1) { totalCount } }`);
  writeEnvAliasOverride({
    BOPIS: {
      location50Id: p50.id, location50Name: p50.name,
      location51Id: p51.id, location51Name: p51.name,
      lastLocationId: last.id, lastLocationName: last.name,
      locationCount: data.totalCount, lastPageIndex: data.totalCount,
      testProductId: product.id, testSku: product.code, testProductName: product.name, testProductCatalogId: product.catalogId,
      captured_at: new Date().toISOString().slice(0, 10),
      source_query: `productPickupLocations(productId: BOPIS.testProductId, storeId:"${STORE_ID}", first:500) default order; store-level pickupLocations totalCount=${store.pickupLocations.totalCount} — seed-bopis.mjs --pool`,
    },
  });
  log(`✓ aliases.${process.env.TEST_ENV || 'vcst'}.json BOPIS: ${data.totalCount} eligible (store total ${store.pickupLocations.totalCount}); #50 "${p50.name}", #51 "${p51.name}" (${p51.id}), last "${last.name}"`);
}

async function teardownPool() {
  const names = new Set(poolLocations().map((r) => r.name));
  // Live-name guard: only a pool name the spec declares AND that carries the AGENT-TEST pool prefix.
  const targets = (await listPickups(STORE_ID)).filter((p) => names.has(p.name) && String(p.name).startsWith(POOL_PREFIX));
  log(`Pool teardown — ${targets.length} location(s)${DRY_RUN ? ' [DRY RUN — nothing deleted]' : ''}`);
  for (const p of targets) await api('DELETE', `/api/shipping/pickup-locations/${STORE_ID}/${p.id}`, null, { expectStatus: [200, 204, 404] });
  const residual = await verifyRemoved(async () => (await listPickups(STORE_ID)).filter((p) => names.has(p.name)));
  log(residual === 0 ? 'Pool teardown verified — 0 remain.' : `⚠ Pool teardown incomplete — ${residual} remain.`);
  if (residual > 0 && !DRY_RUN) process.exit(1);
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 BOPIS pickup-locations seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await auth();

  if (POOL_ONLY) { await (TEARDOWN ? teardownPool() : seedPool()); return; }

  const all = loadCsv('test-data/stores/bopis-locations.csv');
  const rows = ONLY ? all.filter((r) => r.location_id === ONLY) : all;
  if (!rows.length) { console.error(`ABORT: --only ${ONLY} matched no locations`); process.exit(2); }

  if (TEARDOWN) { await teardown(rows); if (POOL) await teardownPool(); return; }

  await loadFfcs();
  if (!FFCS.length && !DRY_RUN) {
    // Fresh DB has no FFC — create a default one (a pickup location requires an FFC as its inventory source).
    const ffc = await ensureFulfillmentCenter(api);
    if (ffc?.id) { FFCS = [ffc]; log(`Using created fulfillment center ${ffc.id}`); }
  }
  if (!FFCS.length && !DRY_RUN) {
    console.error('ABORT: no fulfillment centers exist and one could not be created — a pickup location requires an FFC.');
    process.exit(2);
  }

  const results = [];
  for (const row of rows) {
    const storeId = (row.store_id || STORE_ID).trim();
    const ffcId = resolveFfcId(row.ffc_id);
    const existing = await findPickup(storeId, seededName(row.location_name));
    const body = buildBody(row, ffcId, existing?.id);
    if (existing) {
      await api('PUT', '/api/shipping/pickup-locations', body, { expectStatus: [200, 204] });
      log(`↻ pickup: ${row.location_name} (${existing.id}) → FFC ${ffcId}`);
      results.push({ locationId: row.location_id, name: row.location_name, id: existing.id, ffcId });
    } else {
      const saved = await api('POST', '/api/shipping/pickup-locations', body, { expectStatus: [200, 201] });
      log(`✓ pickup: ${row.location_name} (${saved?.id}) → FFC ${ffcId}`);
      results.push({ locationId: row.location_id, name: row.location_name, id: saved?.id, ffcId });
    }
  }

  // No _seed-results report: BOPIS_* aliases resolve by static location_id business
  // keys, and the live BOPIS inline snapshot (position-50/51 ids) is captured out-of-band
  // (VCST-4707), not seeded — so this seeder has no runtime GUIDs to persist.
  console.log(`\n✅ BOPIS seed complete — ${results.length} pickup location(s).`);
  if (POOL) await seedPool();
}

main().catch((err) => { console.error(`\n❌ BOPIS seed failed: ${err.message}`); process.exit(1); });
