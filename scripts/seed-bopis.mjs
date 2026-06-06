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
 * Safety: ENV_RISK gate (blocks ENV_RISK=production unless --allow-admin-writes-on-prod); idempotent by location name within the store.
 * Writes test-data/_seed-results-bopis-{DATE}.json
 */
import {
  assertSafeTarget, auth, api, loadCsv, writeResults, log, verbose, csvBool, iso3,
  STORE_ID, DATE_STAMP, DRY_RUN, TEARDOWN, ONLY, BACK_URL,
} from './lib/seed-common.mjs';

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
  const r = await api('POST', '/api/shipping/pickup-locations/search', { storeId, take: 200 });
  const list = Array.isArray(r) ? r : (r?.results || []);
  return list.find((p) => p.name === name) || null;
}

function buildBody(row, ffcId, existingId) {
  const storeId = (row.store_id || STORE_ID).trim();
  const lat = (row.latitude || '').trim();
  const lng = (row.longitude || '').trim();
  const body = {
    name: row.location_name,
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
    const found = await findPickup(storeId, row.location_name);
    if (!found) { verbose(`not present: ${row.location_name}`); continue; }
    await api('DELETE', `/api/shipping/pickup-locations/${storeId}/${found.id}`, null, { expectStatus: [200, 204, 404] });
    log(`  ✓ Deleted: ${row.location_name} (${found.id})`);
    deleted++;
  }
  log(`Teardown complete — ${deleted} deleted.`);
}

async function main() {
  assertSafeTarget();
  console.log(`\n🌱 BOPIS pickup-locations seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await auth();

  const all = loadCsv('test-data/stores/bopis-locations.csv');
  const rows = ONLY ? all.filter((r) => r.location_id === ONLY) : all;
  if (!rows.length) { console.error(`ABORT: --only ${ONLY} matched no locations`); process.exit(2); }

  if (TEARDOWN) { await teardown(rows); return; }

  await loadFfcs();
  if (!FFCS.length && !DRY_RUN) {
    console.error('ABORT: no fulfillment centers exist — a pickup location requires an FFC. Seed/enable an FFC first.');
    process.exit(2);
  }

  const results = [];
  for (const row of rows) {
    const storeId = (row.store_id || STORE_ID).trim();
    const ffcId = resolveFfcId(row.ffc_id);
    const existing = await findPickup(storeId, row.location_name);
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

  writeResults(`test-data/_seed-results-bopis-${DATE_STAMP}.json`, {
    seededAt: new Date().toISOString(), target: BACK_URL, storeId: STORE_ID, pickupLocations: results,
  });
  console.log(`\n✅ BOPIS seed complete — ${results.length} pickup location(s).`);
}

main().catch((err) => { console.error(`\n❌ BOPIS seed failed: ${err.message}`); process.exit(1); });
