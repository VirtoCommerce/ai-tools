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
 *   node scripts/refresh-sitemap.mjs --frontend ../vc-frontend   # ALSO diff storefront ROUTES (see readFrontendRoutes)
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

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'dotenv';
import { resolveTestEnv } from '../lib/resolve-test-env.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');

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

/**
 * ROUTE AXIS — the storefront's own client-side routes.
 *
 * WHY THIS EXISTS: the xAPI axis above sees catalog nav + versions only. Storefront routes
 * are SPA client-side records behind an auth guard, so a story that ships a whole page
 * (VCST-5346 /account/missions, VCST-5730 /company/documents) produced an EMPTY sitemap
 * diff — and section 2 of sitemap.md silently rotted ~4 months, missing the entire Sales
 * Rep hub. Measured 2026-09-04 during /qa-test-plan Sprint26-17.
 *
 * TWO SOURCES, and reading only the first under-reports badly:
 *   core    — client-app/router/routes/{account,company,checkout,cart,main}.ts
 *             (company.ts declares ONLY info + members)
 *   modules — client-app/modules/<m>/{index.ts,routes.ts}, mounted at bootstrap via
 *             router.addRoute("Account"|"Company", ...). /account/missions,
 *             /account/points-history, /account/quotes, /account/back-in-stock and every
 *             /company/* hub route live HERE, not in the core router.
 *
 * This is a path-LITERAL inventory, not a resolved route table — enough for the diff to
 * fire when a route appears or disappears, which is the whole job. It deliberately does
 * NOT resolve nesting or evaluate the config/permission gates (Loyalty ENABLED_KEY +
 * MISSIONS_ENABLED_KEY, isSalesRepsEnabled(), documents:read), so a listed route may be
 * absent on a given env — that is normal and is not evidence the route does not exist.
 *
 * FAILS LOUD, NEVER SILENT: with no source reachable it returns {available:false, reason}
 * and the diff prints UNAVAILABLE. It must never report zero routes — a zero would read as
 * "the storefront has no routes" and re-create the exact silent-staleness bug it closes.
 */
/**
 * Provenance of the vc-frontend checkout the route axis just read.
 *
 * WHY: the route axis is only as fresh as the working copy. A checkout that is behind
 * origin/dev reports available:true with a confidently WRONG route set — worse than
 * reporting nothing, because it reads as authoritative. Measured 2026-09-04: a checkout
 * at 17c99c7 (2026-08-26) missed /account/missions, /company/documents and
 * /company/my-customers, all three of which had already shipped.
 *
 * ls-remote is one cheap network round-trip and no fetch. Every probe is best-effort:
 * a failure records the reason and never throws, so the route axis still runs.
 */
function frontendProvenance(base) {
  const git = (...a) => execFileSync('git', ['-C', base, ...a], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  const out = { head: null, headDate: null, branch: null, remoteHead: null, behindRemote: null, note: null };
  try {
    out.head = git('rev-parse', 'HEAD');
    out.headDate = git('log', '-1', '--format=%cI');
    out.branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  } catch {
    out.note = 'not a git checkout — freshness UNKNOWN, treat the route list as of unknown age';
    return out;
  }
  try {
    const ref = out.branch && out.branch !== 'HEAD' ? out.branch : 'dev';
    const line = git('ls-remote', 'origin', ref).split('\n')[0] || '';
    out.remoteHead = line.split(/\s+/)[0] || null;
    if (out.remoteHead) out.behindRemote = out.remoteHead !== out.head;
  } catch {
    out.note = 'could not reach origin — cannot tell whether the checkout is behind; freshness UNKNOWN';
  }
  return out;
}

function readFrontendRoutes() {
  const dir = flagVal('--frontend') || process.env.VC_FRONTEND_PATH || null;
  const candidates = dir
    ? [dir]
    : [resolve(ROOT, '..', 'vc-frontend'), resolve(ROOT, '.fix-workspace', 'vc-frontend')];
  const base = candidates.find((c) => c && existsSync(resolve(c, 'client-app', 'router', 'routes')));
  if (!base) {
    return {
      available: false,
      reason:
        'no vc-frontend checkout found (pass --frontend <path>, set VC_FRONTEND_PATH, or clone it as a sibling dir). ' +
        'Storefront ROUTE drift is NOT covered by this run.',
      paths: [],
    };
  }

  const files = [];
  const coreDir = resolve(base, 'client-app', 'router', 'routes');
  for (const f of readdirSync(coreDir)) {
    if (f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'constants.ts' && f !== 'index.ts') {
      files.push({ kind: 'core', file: 'router/routes/' + f, abs: resolve(coreDir, f) });
    }
  }
  const modDir = resolve(base, 'client-app', 'modules');
  if (existsSync(modDir)) {
    for (const m of readdirSync(modDir, { withFileTypes: true })) {
      if (!m.isDirectory()) continue;
      for (const cand of ['index.ts', 'routes.ts']) {
        const abs = resolve(modDir, m.name, cand);
        if (existsSync(abs)) files.push({ kind: 'module', file: 'modules/' + m.name + '/' + cand, abs });
      }
      const rIdx = resolve(modDir, m.name, 'routes', 'index.ts');
      if (existsSync(rIdx)) files.push({ kind: 'module', file: 'modules/' + m.name + '/routes/index.ts', abs: rIdx });
    }
  }

  const seen = new Map();
  let parseErrors = 0;
  for (const f of files) {
    let txt;
    try {
      txt = readFileSync(f.abs, 'utf-8');
    } catch {
      parseErrors++;
      continue;
    }
    // path: "literal" — the only form the route records use.
    for (const m of txt.matchAll(/\bpath\s*:\s*["']([^"']*)["']/g)) {
      const raw = m[1];
      if (raw === '') continue; // index child of an already-recorded parent
      const key = f.file + '::' + raw;
      if (!seen.has(key)) seen.set(key, { path: raw, source: f.file, kind: f.kind });
    }
    // Which parent a module mounts onto — the fact that makes a bare "missions" an /account route.
    for (const m of txt.matchAll(/addRoute\(\s*["']([A-Za-z]+)["']/g)) {
      const key = f.file + '::@mount:' + m[1];
      if (!seen.has(key)) seen.set(key, { path: '@mount:' + m[1], source: f.file, kind: f.kind });
    }
  }

  const paths = [...seen.values()].sort((a, b) => (a.source + a.path).localeCompare(b.source + b.path));
  if (!paths.length) {
    return {
      available: false,
      reason: 'checkout at ' + base + ' yielded ZERO route literals — parser or repo layout changed; treat as UNKNOWN, not empty',
      paths: [],
    };
  }
  return { available: true, base, provenance: frontendProvenance(base), fileCount: files.length, parseErrors, paths };
}

/** Diff the route inventory. An axis that went UNAVAILABLE is reported, never scored as "no change". */
function diffRoutes(prev, curr, lines) {
  if (!curr.available) {
    lines.push('  routes: UNAVAILABLE — ' + curr.reason);
    return 0;
  }
  // Freshness is reported on EVERY run, stale or not, and deliberately does not count as a
  // 'change' — it must not force a rev bump, but it must never be silent either.
  const pv = curr.provenance || {};
  if (pv.behindRemote === true) {
    lines.push(
      '  routes: WARNING — checkout is BEHIND origin/' + (pv.branch || 'dev') + ' (local ' +
        String(pv.head).slice(0, 8) + ' @ ' + String(pv.headDate).slice(0, 10) + ', remote ' + String(pv.remoteHead).slice(0, 8) +
        '). Routes added upstream since then are MISSING from this list — pull before trusting it.'
    );
  } else if (pv.behindRemote === false) {
    lines.push('  routes: checkout up to date with origin/' + (pv.branch || 'dev') + ' @ ' + String(pv.headDate).slice(0, 10));
  } else {
    lines.push('  routes: freshness UNKNOWN — ' + (pv.note || 'no provenance captured'));
  }
  if (!prev || !prev.available) {
    lines.push(
      '  routes: baseline established — ' + curr.paths.length + ' literals across ' + curr.fileCount +
        ' files (no comparable previous axis)'
    );
    return 1;
  }
  const key = (r) => r.source + '::' + r.path;
  const pm = new Map((prev.paths || []).map((r) => [key(r), r]));
  const cm = new Map(curr.paths.map((r) => [key(r), r]));
  const added = [...cm.values()].filter((r) => !pm.has(key(r)));
  const removed = [...pm.values()].filter((r) => !cm.has(key(r)));
  const fmt = (rs) => rs.map((r) => r.path + ' [' + r.source + ']').join(', ');
  if (added.length) lines.push('  route ADDED (' + added.length + '): ' + fmt(added));
  if (removed.length) lines.push('  route REMOVED (' + removed.length + '): ' + fmt(removed));
  return added.length + removed.length;
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

  const routes = readFrontendRoutes();

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
    routes,
  };

  console.error(
    `  nav categories: ${navCategories.length} | products-with-options: ${productsWithOptions.length} | ` +
      `total products: ${storeTotalProducts} | platform line: ${platform.maxPlatformVersion} (${platform.moduleCount} modules) | ` +
      `theme Ver.: ${themeVersion ?? '(SPA-rendered — fill via browser)'}`
  );
  console.error(
    routes.available
      ? `  storefront routes: ${routes.paths.length} literals across ${routes.fileCount} files (${routes.base})` +
        `${routes.provenance?.behindRemote === true ? ' [STALE — behind origin, pull first]' : ''}`
      : `  storefront routes: UNAVAILABLE — ${routes.reason}`
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
    if (!routes.available) lines.push(`  routes: UNAVAILABLE — ${routes.reason}`);
    changes = 1;
  } else {
    changes += diffScalar(prev.themeVersion, themeVersion, 'theme Ver.', lines);
    changes += diffScalar(prev.platform?.maxPlatformVersion, platform.maxPlatformVersion, 'platform line', lines);
    changes += diffScalar(prev.platform?.moduleCount, platform.moduleCount, 'module count', lines);
    changes += diffScalar(prev.storeTotalProducts, storeTotalProducts, 'total products', lines);
    changes += diffLists(prev.navCategories, navCategories, 'nav category', lines);
    changes += diffLists(prev.productsWithOptions, productsWithOptions, 'products-with-options child', lines);
    changes += diffRoutes(prev.routes, routes, lines);
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
