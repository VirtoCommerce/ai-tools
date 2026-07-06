#!/usr/bin/env node
/**
 * scripts/seed-catalog-properties.mjs
 *
 * Idempotent seeder for catalog property DEFINITIONS (+ dictionary values) from
 * test-data/catalogs/properties.csv. Fills the gap where seed-test-data.js seeds
 * product-INLINE property values but never the catalog/variation property definitions.
 *
 * REST contract (verified against vc-module-catalog source):
 *   - Create/update property: POST /api/catalog/properties  body
 *       { isNew:true, name, catalogId, type, valueType, dictionary, required, multivalue } → 204 (NO body)
 *     Because create returns 204 with no id, we re-read the catalog to obtain the id.
 *   - Property lookup (idempotency): there is NO REST search for property DEFINITIONS
 *       (IPropertySearchService is wired to GraphQL only). We list the catalog's own
 *       properties via GET /api/catalog/catalogs/{id}?responseGroup=Full → properties[]
 *       and match by name. (Verified: /api/catalog/search/properties and
 *       /api/catalog/properties/search both 404 — neither route exists.)
 *   - Dictionary items (separate entity, AFTER the property is saved):
 *       POST /api/catalog/dictionaryitems  ARRAY [{ alias, propertyId, sortOrder, localizedValues:[{languageCode,value}] }] → 200
 *       POST /api/catalog/dictionaryitems/search {propertyIds:[...], keyword} → {results[]}
 *   - Delete property:  DELETE /api/catalog/properties?id={id}&doDeleteValues=true → 204
 *   Enums — type: Product|Variation|Category|Catalog ; valueType: ShortText|LongText|Number|Integer|DateTime|Boolean|...
 *           (CSV PRODUCT/VARIATION → Product/Variation ; DecimalNumber → Number).
 *
 * USAGE:
 *   node scripts/seed-catalog-properties.mjs [--dry-run] [--verbose] [--only PROP-001] [--teardown]
 * Safety: ENV_RISK gate (blocks ENV_RISK=production unless --allow-admin-writes-on-prod); idempotent by property name within the catalog.
 * No _seed-results report (VCST-5406) — properties are not referenced by any @td alias id.
 */
import {
  assertSafeTarget, auth, api, loadCsv, ensureVirtualCatalog, log, verbose, csvBool,
  DATE_STAMP, DRY_RUN, TEARDOWN, ONLY, BACK_URL, SEED_FAMILY,
} from '../lib/seed-common.mjs';

const TYPE_MAP = { PRODUCT: 'Product', VARIATION: 'Variation', CATEGORY: 'Category', CATALOG: 'Catalog' };
const VALUE_TYPE_MAP = { DECIMALNUMBER: 'Number', DECIMAL: 'Number', TEXT: 'ShortText' };
const mapType = (t) => TYPE_MAP[(t || '').trim().toUpperCase()] || (t || '').trim();
const mapValueType = (v) => VALUE_TYPE_MAP[(v || '').trim().toUpperCase()] || (v || '').trim();

const isGuid = (s) => /^[0-9a-f]{32}$|^[0-9a-f-]{36}$/i.test((s || '').trim());

// The platform validates a catalog property NAME as a code-like identifier ("must start with a
// letter or number, and can contain only …") — spaces and punctuation are rejected, so CSV labels
// like "Warranty (months)" / "Release Date" 500 and get silently skipped (7/15 lost). Products
// already reference the identifier form (the storefront shows "Warranty_months"), so we sanitize the
// name to that shape and carry the original human label as a localized displayName.
function toPropertyName(raw) {
  const s = String(raw || '').trim()
    .replace(/[^0-9A-Za-z]+/g, '_') // any run of non-alphanumerics → single underscore
    .replace(/^_+|_+$/g, '');        // trim leading/trailing underscores
  return /^[0-9A-Za-z]/.test(s) ? s : `P_${s}`; // guarantee it starts with a letter/number
}

// Property definitions have no REST search — list them off the catalog itself.
// Cached per catalogId so we GET each catalog at most once per run.
const _propCache = new Map();
async function listCatalogProperties(catalogId) {
  if (_propCache.has(catalogId)) return _propCache.get(catalogId);
  let cat = await api('GET', `/api/catalog/catalogs/${catalogId}?responseGroup=Full`, null, { expectStatus: [200, 404] });
  let props = cat?.properties;
  if (!Array.isArray(props)) { // fall back to default responseGroup if Full didn't include them
    cat = await api('GET', `/api/catalog/catalogs/${catalogId}`, null, { expectStatus: [200, 404] });
    props = cat?.properties || [];
  }
  _propCache.set(catalogId, props);
  return props;
}
async function findProperty(catalogId, name) {
  return (await listCatalogProperties(catalogId)).find((p) => p.name === name) || null;
}
function invalidatePropCache(catalogId) { _propCache.delete(catalogId); }

async function existingDictAliases(propertyId) {
  const r = await api('POST', '/api/catalog/dictionaryitems/search', { propertyIds: [propertyId], take: 500 });
  const list = Array.isArray(r) ? r : (r?.results || []);
  return new Set(list.map((d) => d.alias));
}

async function seedDictionary(propertyId, valuesCsv) {
  const values = (valuesCsv || '').split(',').map((v) => v.trim()).filter(Boolean);
  if (!values.length) return 0;
  const have = DRY_RUN ? new Set() : await existingDictAliases(propertyId);
  const missing = values.filter((v) => !have.has(v));
  if (!missing.length) { verbose(`dict items already present (${values.length})`); return 0; }
  const items = missing.map((alias, i) => ({
    alias, propertyId, sortOrder: i,
    localizedValues: [{ languageCode: 'en-US', value: alias }],
  }));
  await api('POST', '/api/catalog/dictionaryitems', items, { expectStatus: [200, 201, 204] });
  log(`    ✓ ${missing.length} dictionary value(s)`);
  return missing.length;
}

// Property names are generic (Brand, Color, Size…) with NO AGENT-TEST prefix, so teardown must NOT
// delete them from a real catalog it happens to resolve to. Guard: only delete properties that live
// in an AGENT-TEST-SEED catalog (the seed's own). On a real env the store/target catalog isn't a seed
// catalog, so this is a safe no-op there. Cached per catalog id.
const _seedCatalogCache = new Map();
async function isSeedCatalog(catalogId) {
  if (_seedCatalogCache.has(catalogId)) return _seedCatalogCache.get(catalogId);
  const cat = await api('GET', `/api/catalog/catalogs/${catalogId}`, null, { expectStatus: [200, 404] });
  const ok = (cat?.name || '').startsWith(SEED_FAMILY);
  _seedCatalogCache.set(catalogId, ok);
  return ok;
}

async function teardown(rows, catalogId) {
  log(`Teardown — deleting ${rows.length} propert(y/ies) (AGENT-TEST-SEED catalogs only)...`);
  let deleted = 0, skipped = 0;
  for (const row of rows) {
    const cid = row.catalog_id && isGuid(row.catalog_id) ? row.catalog_id : catalogId;
    // SAFETY: never delete a generically-named property from a non-seed (real) catalog.
    if (!(await isSeedCatalog(cid))) { verbose(`skip ${row.property_name}: catalog ${cid} is not an AGENT-TEST-SEED catalog`); skipped++; continue; }
    const found = await findProperty(cid, toPropertyName(row.property_name));
    if (!found) { verbose(`not present: ${row.property_name}`); continue; }
    await api('DELETE', `/api/catalog/properties?id=${found.id}&doDeleteValues=true`, null, { expectStatus: [200, 204, 404] });
    log(`  ✓ Deleted: ${row.property_name} (${found.id})`);
    deleted++;
  }
  log(`Teardown complete — ${deleted} deleted${skipped ? `, ${skipped} skipped (non-seed catalog)` : ''}.`);
}

async function main() {
  assertSafeTarget();

  console.log(`\n🌱 Catalog-properties seed${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  console.log(`   Target: ${BACK_URL}\n`);
  await auth();
  // Default catalog = the store's virtual catalog, resolved/created at runtime (never a hardcoded GUID).
  const defaultCatalogId = await ensureVirtualCatalog(api);
  console.log(`   Catalog: ${defaultCatalogId}`);

  const all = loadCsv('test-data/catalogs/properties.csv');
  const rows = ONLY ? all.filter((r) => r.property_id === ONLY) : all;
  if (!rows.length) { console.error(`ABORT: --only ${ONLY} matched no properties`); process.exit(2); }

  if (TEARDOWN) { await teardown(rows, defaultCatalogId); return; }

  const results = [];
  let failed = 0;
  for (const row of rows) {
    const catalogId = isGuid(row.catalog_id) ? row.catalog_id.trim() : defaultCatalogId;
    const label = row.property_name;          // human label as authored in the CSV
    const name = toPropertyName(label);        // platform-valid identifier (== what products reference)
    // Per-row isolation: a single rejected property (e.g. an invalid CSV name) must not
    // abort the whole seeder — log it and continue so the valid properties still seed.
    try {
      let prop = await findProperty(catalogId, name);
      if (prop) {
        log(`↻ property: ${name} (${prop.id})`);
      } else {
        const body = {
          isNew: true,
          name,
          catalogId,
          type: mapType(row.property_type),
          valueType: mapValueType(row.value_type),
          dictionary: csvBool(row.is_dictionary),
          required: csvBool(row.is_required),
          multivalue: csvBool(row.is_multivalue),
          multilanguage: false,
          // Preserve the readable label for the Admin UI without violating the name rule.
          displayNames: label && label !== name ? [{ languageCode: 'en-US', name: label }] : undefined,
        };
        await api('POST', '/api/catalog/properties', body, { expectStatus: [200, 201, 204] });
        // 204 carries no id — re-read the catalog (bypassing the stale cache) to resolve it.
        invalidatePropCache(catalogId);
        prop = DRY_RUN ? { id: `dry-${row.property_id}` } : await findProperty(catalogId, name);
        log(`✓ property: ${name} (${prop?.id}) [${body.type}/${body.valueType}]`);
      }

      let dictAdded = 0;
      if (csvBool(row.is_dictionary) && prop?.id && !String(prop.id).startsWith('dry-')) {
        dictAdded = await seedDictionary(prop.id, row.dictionary_values);
      }
      results.push({ propertyId: row.property_id, name, id: prop?.id, catalogId, dictAdded });
    } catch (e) {
      failed++;
      log(`⚠ skipped property ${row.property_id} "${name}": ${String(e.message).slice(0, 160)}`);
      results.push({ propertyId: row.property_id, name, catalogId, error: String(e.message).slice(0, 200) });
    }
  }
  if (failed) log(`(${failed} propert${failed === 1 ? 'y' : 'ies'} skipped due to errors)`);

  // No _seed-results report: catalog properties are not referenced by @td alias id —
  // nothing runtime-drifting to persist here.
  console.log(`\n✅ Catalog-properties seed complete — ${results.length} propert(y/ies).`);
}

main().catch((err) => { console.error(`\n❌ Catalog-properties seed failed: ${err.message}`); process.exit(1); });
