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
