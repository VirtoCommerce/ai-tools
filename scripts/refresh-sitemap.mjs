#!/usr/bin/env node
/**
 * Refresh the deterministic half of the storefront sitemap.
 *
 * Captures the *structural* + *version* facts of the vcst storefront over
 * xAPI GraphQL + the Platform modules API — NO browser, so it is fast, cheap,
 * and CI-safe (sidesteps the SPA-shell 200 problem and the enforce-real-user
 * hook that blocks DOM `evaluate`). Writes a committed JSON snapshot and prints
 * a diff against the previous snapshot so `/qa-sitemap` can rewrite only the
 * sections of `sitemap.md` that actually changed (diff-gated).
 *
 * What it CAN'T do deterministically (left for the interactive `/qa-sitemap`
 * browser pass): the storefront footer theme "Ver." (SPA-rendered, not in the
 * initial HTML) and exact per-category product counts (virtual-catalog outline
 * mapping — and the doc says never assert on counts anyway).
 *
 * Usage:
 *   node scripts/refresh-sitemap.mjs             # write snapshot + print diff (uses TEST_ENV, default vcst)
 *   node scripts/refresh-sitemap.mjs --dry-run   # print snapshot + diff, write nothing
 *   node scripts/refresh-sitemap.mjs --check     # verify reachable + queryable, write nothing
 *   node scripts/refresh-sitemap.mjs --json      # print the raw snapshot JSON to stdout
 *   TEST_ENV=acme node scripts/refresh-sitemap.mjs            # a configured client env (its .env.acme)
 *   node scripts/refresh-sitemap.mjs --front <url> --back <url> --store <id> --label acme
 *                                                # ad-hoc client run with NO .env file
 *
 * Env: layered like config.js — .env.defaults → .env.${TEST_ENV} → .env.local → process.env.
 * Reads FRONT_URL, BACK_URL, STORE_ID, CULTURE_NAME, ADMIN_USER, ADMIN_PASSWORD[_<ENV>].
 * Flags --front/--back/--store override the env; --label scopes the snapshot file.
 *
 * Portable to ANY VC deployment (incl. a client storefront / vc-frontend fork): the
 * queries are standard xAPI + Platform APIs, present regardless of theme customization.
 * The diff baseline is per-deployment (sitemap-snapshot.<label>.json), so a client run
 * never touches the vcst baseline. Admin creds are OPTIONAL — without them the platform
 * version is null and everything else still runs. Only run against a client env with
 * their authorization (read-only, but it is their data).
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'dotenv';
import { resolveTestEnv } from './lib/resolve-test-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const check = args.includes('--check');
const jsonOut = args.includes('--json');
/** Value of `--flag <value>` (ad-hoc override so a client env needs no .env file). */
const flagVal = (name) => {
  const i = args.indexOf(name);
  return i !== -1 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null;
};

const testEnv = resolveTestEnv('vcst');
const merged = {};
for (const layer of ['.env.defaults', `.env.${testEnv}`, '.env.local']) {
  const p = resolve(ROOT, layer);
  if (existsSync(p)) Object.assign(merged, parse(readFileSync(p)));
}
const cfg = (k, dflt = null) => process.env[k] ?? merged[k] ?? dflt;

// URLs / store context: an ad-hoc `--front/--back/--store` flag wins over env, so
// the script can point at ANY VC deployment (a client storefront) without editing
// .env files. STORE_ID has NO hardcoded default — it is per-deployment and must be
// supplied (vcst gets it from .env.vcst; a client passes --store or sets their env).
const FRONT_URL = (flagVal('--front') || cfg('FRONT_URL') || '').trim().replace(/\/+$/, '');
const BACK_URL = (flagVal('--back') || cfg('BACK_URL') || '').trim().replace(/\/+$/, '');
const STORE_ID = flagVal('--store') || cfg('STORE_ID');
const CULTURE = cfg('CULTURE_NAME', 'en-US');

// The diff baseline is PER-DEPLOYMENT: snapshot file is scoped by label (default the
// resolved TEST_ENV, override with --label). This is why pointing at a client store
// never clobbers the vcst baseline or reports a whole-catalog false "changed".
const label = (flagVal('--label') || testEnv).replace(/[^a-z0-9_-]/gi, '');
const SNAPSHOT = resolve(ROOT, `.claude/knowledge/domain/sitemap-snapshot.${label}.json`);

if (!BACK_URL) {
  console.error(
    `Error: BACK_URL not set. Pass --back <url> or set BACK_URL in .env.defaults / .env.${testEnv} / .env.local.`
  );
  process.exit(1);
}
if (!STORE_ID) {
  console.error(
    `Error: STORE_ID not set. Pass --store <id> or set STORE_ID in .env.${testEnv} / .env.local ` +
      `(no default — the store id is per-deployment; a client storefront has its own).`
  );
  process.exit(1);
}
const GQL = `${BACK_URL}/graphql`;

async function gql(query, variables = {}) {
  const res = await fetch(GQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors) throw new Error(`GraphQL error: ${JSON.stringify(json.errors[0].message)}`);
  return json.data;
}

/** Store nav tree top level (the "All products" set) — id/name/slug, deterministic. */
async function fetchNavCategories(categoryId = null) {
  const data = await gql(
    `query($s:String!,$c:String,$id:String){
       childCategories(storeId:$s, cultureName:$c, categoryId:$id, maxLevel:1, onlyActive:true){
         childCategories{ id name slug }
       }
     }`,
    { s: STORE_ID, c: CULTURE, id: categoryId }
  );
  return (data?.childCategories?.childCategories ?? [])
    .filter(Boolean)
    .map((c) => ({ slug: c.slug, name: c.name }))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

async function fetchStoreTotalProducts() {
  const data = await gql(
    `query($s:String!){ products(storeId:$s, first:0){ totalCount } }`,
    { s: STORE_ID }
  );
  return data?.products?.totalCount ?? null;
}

/** Theme footer "Ver." — best-effort; SPA-rendered, so usually null (interactive fill). */
async function fetchThemeVersion() {
  if (!FRONT_URL) return null;
  try {
    const html = await (await fetch(FRONT_URL)).text();
    const m = html.match(/Ver\.\s*([0-9][^<\s]*)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

/** Platform assembly line + module count — needs an admin token (never a password literal in output). */
async function fetchPlatform() {
  const user = cfg('ADMIN_USER', 'admin');
  const pass = cfg(`ADMIN_PASSWORD_${testEnv.toUpperCase()}`) || cfg('ADMIN_PASSWORD');
  if (!pass) return { maxPlatformVersion: null, moduleCount: null, note: 'no admin creds' };
  try {
    const body = new URLSearchParams({ grant_type: 'password', username: user, password: pass });
    const tok = await (
      await fetch(`${BACK_URL}/connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      })
    ).json();
    if (!tok.access_token) return { maxPlatformVersion: null, moduleCount: null, note: 'auth failed' };
    const mods = await (
      await fetch(`${BACK_URL}/api/platform/modules`, {
        headers: { Authorization: `Bearer ${tok.access_token}` },
      })
    ).json();
    // The Platform itself isn't a module; use the max required platformVersion as the assembly line.
    const versions = mods.map((m) => m.platformVersion).filter(Boolean);
    const max = versions.sort(cmpSemver).at(-1) ?? null;
    return { maxPlatformVersion: max, moduleCount: mods.length };
  } catch (e) {
    return { maxPlatformVersion: null, moduleCount: null, note: e.message };
  }
}

function cmpSemver(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function diffLists(prev, curr, label, lines) {
  const pset = (a) => new Map(a.map((x) => [x.slug, x.name]));
  const p = pset(prev || []);
  const c = pset(curr || []);
  const added = [...c.keys()].filter((s) => !p.has(s));
  const removed = [...p.keys()].filter((s) => !c.has(s));
  const renamed = [...c.keys()].filter((s) => p.has(s) && p.get(s) !== c.get(s));
  if (added.length) lines.push(`  ${label} ADDED (${added.length}): ${added.join(', ')}`);
  if (removed.length) lines.push(`  ${label} REMOVED (${removed.length}): ${removed.join(', ')}`);
  for (const s of renamed) lines.push(`  ${label} RENAMED: ${s}  "${p.get(s)}" → "${c.get(s)}"`);
  return added.length + removed.length + renamed.length;
}

function diffScalar(prev, curr, label, lines) {
  if (String(prev ?? '') !== String(curr ?? '')) {
    lines.push(`  ${label}: ${prev ?? '(none)'} → ${curr ?? '(none)'}`);
    return 1;
  }
  return 0;
}

async function main() {
  console.error(`Querying ${GQL} (store=${STORE_ID}, label=${label})...`);

  const navCategories = await fetchNavCategories(null);
  // resolve the products-with-options category id from the nav tree, then drill in
  let productsWithOptions = [];
  try {
    const pwoData = await gql(
      `query($s:String!,$c:String){ childCategories(storeId:$s, cultureName:$c, maxLevel:1, onlyActive:true){ childCategories{ id slug } } }`,
      { s: STORE_ID, c: CULTURE }
    );
    const pwo = (pwoData?.childCategories?.childCategories ?? []).find((x) => x.slug === 'products-with-options');
    if (pwo) productsWithOptions = await fetchNavCategories(pwo.id);
  } catch { /* PWO restructured away — leave empty, the diff will show it */ }

  const [themeVersion, storeTotalProducts, platform] = await Promise.all([
    fetchThemeVersion(),
    fetchStoreTotalProducts(),
    fetchPlatform(),
  ]);

  const snapshot = {
    generatedIso: new Date().toISOString(),
    env: testEnv,
    frontUrl: FRONT_URL || null,
    backUrl: BACK_URL,
    storeId: STORE_ID,
    themeVersion,
    platform,
    storeTotalProducts,
    navCategories,
    productsWithOptions,
  };

  console.error(
    `  nav categories: ${navCategories.length} | products-with-options: ${productsWithOptions.length} | ` +
      `total products: ${storeTotalProducts} | platform line: ${platform.maxPlatformVersion} (${platform.moduleCount} modules) | ` +
      `theme Ver.: ${themeVersion ?? '(SPA-rendered — fill via browser)'}`
  );

  if (jsonOut) {
    process.stdout.write(JSON.stringify(snapshot, null, 2) + '\n');
  }

  // Diff vs committed snapshot
  const prev = existsSync(SNAPSHOT) ? JSON.parse(readFileSync(SNAPSHOT, 'utf-8')) : null;
  const lines = [];
  let changes = 0;
  if (!prev) {
    lines.push('  (no previous snapshot — first run, everything is new)');
    changes = 1;
  } else {
    changes += diffScalar(prev.themeVersion, themeVersion, 'theme Ver.', lines);
    changes += diffScalar(prev.platform?.maxPlatformVersion, platform.maxPlatformVersion, 'platform line', lines);
    changes += diffScalar(prev.platform?.moduleCount, platform.moduleCount, 'module count', lines);
    changes += diffScalar(prev.storeTotalProducts, storeTotalProducts, 'total products', lines);
    changes += diffLists(prev.navCategories, navCategories, 'nav category', lines);
    changes += diffLists(prev.productsWithOptions, productsWithOptions, 'products-with-options child', lines);
  }

  console.error('\n=== Sitemap diff (vs committed snapshot) ===');
  console.error(changes ? lines.join('\n') : '  (no structural/version changes)');
  console.error('===========================================');

  if (check) {
    console.error(`[check] OK — reachable & queryable; ${navCategories.length} nav categories. Nothing written.`);
  } else if (dryRun) {
    console.error('[dry-run] Nothing written.');
  } else {
    writeFileSync(SNAPSHOT, JSON.stringify(snapshot, null, 2) + '\n', 'utf-8');
    console.error(`Snapshot written to ${SNAPSHOT}`);
  }

  // Machine-readable trailer for /qa-test-plan and CI to gate on.
  console.log(`SITEMAP_CHANGED=${changes ? 'yes' : 'no'}`);
}

main().catch((e) => {
  console.error('Failed:', e.message);
  process.exit(1);
});
