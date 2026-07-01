/**
 * scripts/lib/seed-common.mjs
 *
 * Shared, reusable foundation for the repo's REST seed scripts. Centralizes the
 * boilerplate every seeder used to inline: layered env load (TEST_ENV-aware),
 * production-host allowlist guard, OAuth token, a dry-run-aware `api()` wrapper,
 * CSV/alias loaders, results write-back, and ISO country-code mapping.
 *
 * Conventions enforced here (so individual seeders don't drift):
 *   - Env comes from config.js (layered .env.defaults → .env.${TEST_ENV} → .env.local).
 *   - NEVER seed against a non-allowlisted host (prod safety) — assertSafeTarget().
 *   - Idempotency is each seeder's job (look-up-then-create); this module gives the
 *     `api()` primitive + search helpers, not the policy.
 *   - --dry-run performs reads (GET + POST /search) but skips every write.
 *   - --verbose logs each call. --only <id> lets a seeder filter to one row.
 *
 * Used by: seed-promotions.mjs, seed-bopis.mjs, seed-catalog-properties.mjs,
 *          seed-white-labeling.mjs (and future seeders).
 */

import { config as loadDotenv } from 'dotenv';
import { resolveTestEnv } from './resolve-test-env.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

// Layered, TEST_ENV-aware env load (later files override earlier; no legacy root `.env`).
// Intentionally does NOT import config.js: seeders only need BACK_URL/ADMIN/ADMIN_PASSWORD
// (asserted in assertSafeTarget) and must not be blocked by config.js's strict CORE
// validation of storefront-test vars (e.g. USER_EMAIL) that seeding never uses.
const _TEST_ENV = resolveTestEnv();
loadDotenv({ path: '.env.defaults' });
loadDotenv({ path: `.env.${_TEST_ENV}`, override: true });
loadDotenv({ path: '.env.local', override: true });

// Per-env override promotion (mirrors config.js): any key ending in
// `_${TEST_ENV.toUpperCase()}` is promoted to its base name. Lets `.env.local`
// carry per-env secret variants (e.g. ADMIN_PASSWORD_VCPTCORE1) so seeders run
// against an env whose admin password differs from the shared base. Without this,
// `.env.local`'s base ADMIN_PASSWORD (loaded last with override) clobbers any
// inline override and auth fails with invalid_grant.
const _ENV_SUFFIX = `_${_TEST_ENV.toUpperCase()}`;
for (const [key, value] of Object.entries(process.env)) {
  if (key.endsWith(_ENV_SUFFIX) && value) {
    process.env[key.slice(0, -_ENV_SUFFIX.length)] = value;
  }
}

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Strip trailing slash(es) — some envs set BACK_URL with one (e.g. vcptcore), which would
// produce `//connect/token` and 404. Normalizing keeps `${BACK_URL}${path}` correct.
export const BACK_URL = (process.env.BACK_URL || '').replace(/\/+$/, '');
export const FRONT_URL = (process.env.FRONT_URL || '').replace(/\/+$/, '');
export const ADMIN = process.env.ADMIN;
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
export const STORE_ID = process.env.STORE_ID || 'B2B-store';
export const DATE_STAMP = new Date().toISOString().slice(0, 10).replace(/-/g, '');

// --- Shared CLI flags ---
const argv = process.argv.slice(2);
export const DRY_RUN = argv.includes('--dry-run');
export const VERBOSE = argv.includes('--verbose');
export const TEARDOWN = argv.includes('--teardown');
export const ONLY = argv.includes('--only') ? argv[argv.indexOf('--only') + 1] : null;
const ALLOW_PROD = argv.includes('--allow-admin-writes-on-prod');

export const log = (msg) => console.log(`  ${msg}`);
export const verbose = (msg) => { if (VERBOSE) console.log(`    [v] ${msg}`); };

/**
 * Prod-safety guard — by CONFIG, not by hostname. The repo gates destructive ops on
 * ENV_RISK (dev | test | staging | production; default 'dev' — same logic as config.js),
 * NOT a hardcoded host list, so seeders run freely against localhost, any QA, staging,
 * or a new customer env. Only a production-risk env is blocked, and even that is
 * overridable with --allow-admin-writes-on-prod (mirrors config.js's flag). Set ENV_RISK
 * per env in its .env.${TEST_ENV} file.
 */
export const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();
export function assertSafeTarget() {
  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) {
    console.error('ABORT: BACK_URL / ADMIN / ADMIN_PASSWORD missing from env (run npm run env:check).');
    process.exit(2);
  }
  const host = new URL(BACK_URL).host;
  if (ENV_RISK === 'production' && !ALLOW_PROD && !DRY_RUN) {
    console.error(`ABORT: ENV_RISK=production for ${host} — refusing to seed a production-risk env. Re-run with --allow-admin-writes-on-prod to override.`);
    process.exit(2);
  }
  log(`Target: ${host} | TEST_ENV=${process.env.TEST_ENV || 'vcst'} | ENV_RISK=${ENV_RISK}${ENV_RISK === 'production' && ALLOW_PROD ? ' [PROD OVERRIDE]' : ''}`);
}

// --- Auth ---
let TOKEN = null;
export async function auth() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  if (!res.ok) throw new Error(`auth failed: ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}`);
  TOKEN = (await res.json()).access_token;
  log(`Auth: OK${DRY_RUN ? ' [DRY RUN — reads only]' : ''}`);
}

// A read call is safe to run in --dry-run (GET, or POST to a /search endpoint).
const isReadCall = (method, path) => method === 'GET' || (method === 'POST' && path.includes('/search'));

/**
 * REST wrapper. In --dry-run, writes are skipped and return a fake { _dryRun, id }.
 * Returns parsed JSON for JSON responses, null for 204/empty.
 */
export async function api(method, path, body = null, { expectStatus = [200, 201, 204] } = {}) {
  if (DRY_RUN && !isReadCall(method, path)) {
    verbose(`[DRY] ${method} ${path}`);
    return { _dryRun: true, id: `dry-${DATE_STAMP}-${Math.random().toString(36).slice(2, 10)}` };
  }
  const headers = { Authorization: `Bearer ${TOKEN}` };
  let payload;
  if (body != null) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  verbose(`${method} ${path}`);
  const res = await fetch(`${BACK_URL}${path}`, { method, headers, body: payload });
  if (!expectStatus.includes(res.status)) {
    const text = await res.text().catch(() => '');
    throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 400)}`);
  }
  if (res.status === 204) return null;
  const ct = res.headers.get('content-type') || '';
  return ct.includes('application/json') ? res.json() : null;
}

// --- Data helpers ---
export function loadCsv(relPath) {
  const full = join(ROOT, relPath);
  if (!existsSync(full)) { console.error(`ABORT: CSV not found: ${relPath}`); process.exit(2); }
  return parse(readFileSync(full, 'utf8'), {
    columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true,
  });
}

export function loadAliases() {
  return JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
}

export function writeResults(relPath, obj) {
  if (DRY_RUN) { log(`[DRY] would write ${relPath}`); return; }
  const full = join(ROOT, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, JSON.stringify(obj, null, 2));
  log(`Results → ${relPath}`);
}

// CSV booleans are loose ('true'/'Yes'/'1' → true; '', 'No', 'false' → false).
export const csvBool = (v, dflt = false) => {
  if (v == null || v === '') return dflt;
  return /^(true|yes|y|1)$/i.test(String(v).trim());
};

// VC stores countryCode as ISO-3 (see reference_address_data_conventions). CSVs
// sometimes carry ISO-2 — normalize. Unknown 2-letter codes pass through unchanged.
const ISO2_TO_3 = {
  US: 'USA', CA: 'CAN', GB: 'GBR', DE: 'DEU', FR: 'FRA', AU: 'AUS',
  NL: 'NLD', ES: 'ESP', IT: 'ITA', JP: 'JPN', CN: 'CHN', MX: 'MEX',
};
export function iso3(code) {
  if (!code) return code;
  const up = String(code).trim().toUpperCase();
  return up.length === 3 ? up : (ISO2_TO_3[up] || up);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Persist runtime-resolved ids to test-data/aliases.<TEST_ENV>.json so regression
 * SUITES resolve them too (the resolver merges this env-override over aliases.json).
 * Only writes for localhost (a fresh-DB env whose ids drift every provision — the
 * file is gitignored and regenerated each seed); never touches committed env overrides.
 */
export function writeLocalAliasOverride(updates) {
  if ((process.env.TEST_ENV || '') !== 'localhost' || DRY_RUN) return;
  const p = join(ROOT, 'test-data/aliases.localhost.json');
  let cur = {};
  try { if (existsSync(p)) cur = JSON.parse(readFileSync(p, 'utf8')); } catch { cur = {}; }
  const merged = {
    ...cur, ...updates,
    _meta: { ...(cur._meta || {}), env: 'localhost', note: 'Auto-generated by /qa-local-env seeders — IDs drift each fresh-DB provision; gitignored.' },
  };
  writeFileSync(p, JSON.stringify(merged, null, 2));
  verbose(`wrote aliases.localhost.json (${Object.keys(updates).join(', ')})`);
}

// --- From-scratch infrastructure helpers (idempotent; safe on a fresh DB) -----
// These exist so seeders never depend on a pre-existing, env-specific GUID (the
// classic "hardcoded fixture rot": products/configurable/properties used to read
// aliases.VIRTUAL_CATALOG_B2B.id, which doesn't exist on a freshly provisioned
// /qa-local-env stack). Each helper resolves the entity at runtime and creates it
// if missing. They take the caller's `api` (so they work for seeders that import
// seed-common's api AND ones that inline their own — same signature).

/**
 * Ensure the store exists (a fresh /qa-local-env DB is provisioned with
 * -skipSampleData, so it has NO store) and is pointed at `catalogId`. Creates a
 * minimal viable store (en-US / USD / Open) when missing. Returns the store id.
 * Pass `existing` if you already fetched the store, to avoid a second GET.
 */
export async function ensureStore(api, { storeId = STORE_ID, catalogId = null, existing = undefined } = {}) {
  const store = existing !== undefined
    ? existing
    : await api('GET', `/api/stores/${encodeURIComponent(storeId)}`, null, { expectStatus: [200, 404] });
  if (store?.id) {
    if (catalogId && store.catalog !== catalogId) {
      try {
        await api('PUT', '/api/stores', { ...store, catalog: catalogId }, { expectStatus: [200, 204] });
        log(`✓ store ${storeId} → catalog ${catalogId}`);
      } catch (e) { log(`⚠ store→catalog assign failed: ${String(e.message).slice(0, 150)}`); }
    }
    return store.id;
  }
  if (DRY_RUN) { log(`[DRY] would create store ${storeId}`); return storeId; }
  const body = {
    id: storeId, name: storeId, storeState: 'Open', timeZone: 'America/New_York',
    defaultLanguage: 'en-US', languages: ['en-US'],
    defaultCurrency: 'USD', currencies: ['USD'],
    ...(catalogId ? { catalog: catalogId } : {}),
  };
  try {
    const created = await api('POST', '/api/stores', body, { expectStatus: [200, 201] });
    log(`✓ created store: ${storeId}${catalogId ? ` → catalog ${catalogId}` : ''}`);
    return created?.id || storeId;
  } catch (e) { log(`⚠ store create failed: ${String(e.message).slice(0, 150)}`); return null; }
}

/**
 * Resolve the virtual catalog the store actually uses; create + assign one if the
 * store (or the catalog) is missing. Returns its id. Order: store-assigned virtual
 * catalog → existing virtual catalog (by name → a "*mixed*" one → first) → create.
 * Always ensures the store exists and is assigned the result (from-scratch safe).
 */
export async function ensureVirtualCatalog(api, { storeId = STORE_ID, name = `LOCAL-${DATE_STAMP}-Virtual-B2B` } = {}) {
  const store = await api('GET', `/api/stores/${encodeURIComponent(storeId)}`, null, { expectStatus: [200, 404] });
  if (store?.catalog) {
    const cat = await api('GET', `/api/catalog/catalogs/${store.catalog}`, null, { expectStatus: [200, 404] });
    if (cat?.isVirtual) {
      log(`↻ virtual catalog (store ${storeId}): ${cat.name} (${cat.id})`);
      writeLocalAliasOverride({ VIRTUAL_CATALOG_B2B: { _inline: true, id: cat.id } });
      return cat.id;
    }
  }
  const search = await api('POST', '/api/catalog/catalogs/search', { take: 100 }, { expectStatus: [200, 201] });
  const virtuals = (search?.results || []).filter((c) => c.isVirtual);
  let vc = virtuals.find((c) => c.name === name)
        || virtuals.find((c) => /mixed/i.test(c.name || ''))
        || virtuals[0];
  if (!vc) {
    vc = await api('POST', '/api/catalog/catalogs', {
      name, isVirtual: true, languages: [{ languageCode: 'en-US', isDefault: true }],
    }, { expectStatus: [200, 201] });
    log(`✓ created virtual catalog: ${name} (${vc?.id})`);
  } else {
    log(`↻ virtual catalog: ${vc.name} (${vc.id})`);
  }
  // Ensure the store exists and is assigned this catalog (creates the store on a fresh DB).
  await ensureStore(api, { storeId, catalogId: vc?.id, existing: store });
  if (vc?.id) writeLocalAliasOverride({ VIRTUAL_CATALOG_B2B: { _inline: true, id: vc.id } });
  return vc?.id;
}

/**
 * Return an active fulfillment center, creating a minimal default one if none
 * exists (fresh DB has zero). Used by product/configurable/bopis seeders.
 */
export async function ensureFulfillmentCenter(api, { name = 'AGENT-TEST-Default-FFC', code = 'AGENT-TEST-FFC-MAIN' } = {}) {
  const r = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 100 }, { expectStatus: [200, 201] });
  const existing = (r?.results || r?.items || []).filter((f) => f.isActive !== false);
  if (existing.length) { verbose(`↻ fulfillment center: ${existing[0].name} (${existing[0].id})`); return existing[0]; }
  if (DRY_RUN) { log(`[DRY] would create fulfillment center ${code}`); return { id: `dry-ffc-${DATE_STAMP}`, code }; }
  const body = {
    name, code, isActive: true, description: 'Auto-created by seed-common for from-scratch envs',
    address: {
      line1: '1 Test Way', city: 'Testville', regionId: 'US-CA', regionName: 'California',
      postalCode: '90001', countryCode: 'USA', countryName: 'United States',
    },
  };
  try {
    // Create/update is PUT on this route — POST /fulfillmentcenters is 405 (only /search,/plenty,/batch are POST).
    let ffc = await api('PUT', '/api/inventory/fulfillmentcenters', body, { expectStatus: [200, 201, 204] });
    if (!ffc?.id) {
      // PUT may 204 with no body — re-resolve the id by code.
      const again = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 100 }, { expectStatus: [200, 201] });
      ffc = (again?.results || again?.items || []).find((f) => f.code === code) || ffc;
    }
    log(`✓ created fulfillment center: ${name} (${ffc?.id})`);
    return ffc;
  } catch (e) {
    log(`⚠ fulfillment-center create failed: ${String(e.message).slice(0, 150)}`);
    return null;
  }
}

/**
 * Ensure the ElasticSearch Member index is queryable. A fresh stack has no Member
 * index, so POST /api/members/search returns 503 "all shards failed". Trigger a
 * Member reindex and poll until the search responds. Call once before any member
 * search in the b2b / impersonation / users seeders. Returns true if ready.
 *
 * Poll budget defaults to ~3 min (18 × 10s): building a Member index from an empty
 * DB on a cold stack routinely takes minutes, and the old 30s budget let seeders
 * "proceed anyway" and then fail every member search (VCST-5406). Pass
 * `{ required: true }` to make a not-ready index a hard error instead — the
 * bootstrap orchestrator uses this so a full seed refuses to run half-broken.
 */
export async function ensureMemberIndex(api, { tries = 18, delayMs = 10000, required = false } = {}) {
  if (DRY_RUN) return true;
  const probe = async () => {
    try { await api('POST', '/api/members/search', { take: 1 }, { expectStatus: [200, 201] }); return true; }
    catch (e) {
      if (/all shards failed|503|index[_ ]?not[_ ]?found|no such index/i.test(String(e.message))) return false;
      throw e;
    }
  };
  if (await probe()) return true;
  log('member index not ready — triggering Member reindex…');
  try { await api('POST', '/api/search/indexes/index', [{ documentType: 'Member', rebuild: true }], { expectStatus: [200, 201, 204] }); }
  catch (e) { verbose(`member reindex trigger: ${String(e.message).slice(0, 120)}`); }
  for (let i = 0; i < tries; i++) {
    await sleep(delayMs);
    if (await probe()) { log(`✓ member index ready (after ${((i + 1) * delayMs) / 1000}s)`); return true; }
  }
  const msg = `member index still not ready after reindex + ${(tries * delayMs) / 1000}s`;
  if (required) throw new Error(`${msg} — aborting (member-dependent seeding would fail)`);
  log(`⚠ ${msg} — proceeding (member searches may fail)`);
  return false;
}

/* ── Post-seed / post-teardown verification (VCST-5406) ────────────────────────
 * "Ran without error" ≠ "data is correct on this env." These read the entity back
 * through the same surface a test uses, so a seeder can assert what it created is
 * actually present (and a teardown can assert it's gone). Best-effort + defensive:
 * an unknown kind or a probe error returns false rather than throwing, so a verify
 * failure is reported, never a crash. Skipped under --dry-run (nothing was written).
 */

/**
 * Confirm a just-created entity exists. `kind` ∈ catalog | product | pricelist |
 * fulfillmentcenter | member | organization | contact | user. `user` matches by
 * userName/email (pass `name`); everything else matches by id.
 * @returns {Promise<boolean>}
 */
export async function verifyCreated(api, kind, id, { name } = {}) {
  if (DRY_RUN) return true;
  if (!id || String(id).startsWith('dry-')) return true;
  try {
    switch (kind) {
      case 'catalog': {
        const c = await api('GET', `/api/catalog/catalogs/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
        return !!c?.id;
      }
      case 'product': {
        const p = await api('GET', `/api/catalog/products/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
        return !!p?.id;
      }
      case 'pricelist': {
        const pl = await api('GET', `/api/pricing/pricelists/${encodeURIComponent(id)}`, null, { expectStatus: [200, 404] });
        return !!pl?.id;
      }
      case 'fulfillmentcenter': {
        const r = await api('POST', '/api/inventory/fulfillmentcenters/search', { take: 200 }, { expectStatus: [200, 201] });
        return (r?.results || r?.items || []).some((f) => f.id === id);
      }
      case 'member': case 'organization': case 'contact': {
        const r = await api('POST', '/api/members/search', { objectIds: [id], take: 1 }, { expectStatus: [200, 201] });
        return (r?.results || []).some((m) => m.id === id);
      }
      case 'user': {
        const s = await api('POST', '/api/platform/security/users/search', { keyword: name || id, take: 10 }, { expectStatus: [200, 201] });
        return (s?.results || []).some((u) => u.id === id ||
          (u.userName || '').toLowerCase() === String(name || '').toLowerCase() ||
          (u.email || '').toLowerCase() === String(name || '').toLowerCase());
      }
      default:
        return true; // unknown kind — don't block, caller can add a probe.
    }
  } catch { return false; }
}

/**
 * Confirm a teardown left zero residue. `searchFn` is a caller thunk that returns
 * the remaining matching entities (array) or a count. Returns the residual count;
 * 0 means a clean teardown. Reused by every `*:teardown` path.
 * @returns {Promise<number>}
 */
export async function verifyRemoved(searchFn) {
  if (DRY_RUN) return 0;
  try {
    const r = await searchFn();
    if (typeof r === 'number') return r;
    if (Array.isArray(r)) return r.length;
    return (r?.results || r?.items || []).length;
  } catch { return 0; }
}
