/**
 * scripts/seed-bootstrap.mjs
 *
 * ONE command to bring ANY environment (fresh /qa-local-env, vcst, vcptcore,
 * virtostart, a new customer env) to a verified, test-ready seeded state
 * (VCST-5406). It does the from-scratch preflight the individual seeders can't
 * do on their own, then runs them in dependency order.
 *
 * Order (explicit seed priority — see STEPS[].priority):
 *   preflight    : member-index → catalog+categories+store (ensureVirtualCatalog) → fulfillment-center
 *   priority 30+ : properties → products → configurable → pricing → inventory → bopis
 *                  → company-users → promotions → loyalty → white-labeling
 *   (prices run AFTER products AND configurable so every product is priced; bopis after inventory
 *    so a fulfillment center exists; company-users after the member index is ready.)
 *
 * A REQUIRED step that fails aborts the run (non-zero exit). An OPTIONAL step
 * that fails is a warning — e.g. the Loyalty module may be absent from a
 * baseline manifest, or BOPIS has no fulfillment center yet. Each child seeder
 * is the existing standalone script (reused verbatim), spawned with the same env.
 *
 * Usage:
 *   TEST_ENV=localhost npm run seed:bootstrap
 *   TEST_ENV=vcst      npm run seed:bootstrap -- --dry-run
 *   npm run seed:bootstrap -- --skip-optional      # required chain only
 *   npm run seed:bootstrap -- --verbose
 */

import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import {
  ROOT, DRY_RUN, VERBOSE, api, auth, assertSafeTarget,
  ensureMemberIndex, ensureFulfillmentCenter, log,
} from '../lib/seed-common.mjs';

const SKIP_OPTIONAL = process.argv.includes('--skip-optional');
const TEARDOWN = process.argv.includes('--teardown');
const passthrough = process.argv.slice(2).filter((a) => a === '--dry-run' || a === '--verbose');

/**
 * Unified teardown chain — the mirror of the seed chain, in REVERSE dependency order (dependents
 * before their dependencies). Each domain seeder exposes its own `--teardown`; catalog + categories
 * (+ any leftover products/pricelists) are swept by seed-test-data.js's family teardown, which also
 * unbinds the store from a deleted catalog. The store itself is intentionally NOT deleted. Every
 * step is best-effort: a failing teardown warns and the chain continues (so one stuck domain can't
 * block a full clean). Invoked with `npm run seed:bootstrap -- --teardown`.
 */
const TEARDOWN_STEPS = [
  // Orders/quotes reference products + users, so sweep them FIRST (before the entities they point at).
  { name: 'quotes', script: 'orders/seed-quotes.mjs', args: ['--teardown'] },
  { name: 'orders', script: 'orders/seed-order-states.mjs', args: ['--teardown'] },
  { name: 'white-labeling', script: 'white-labeling/seed-white-labeling.mjs', args: ['--teardown'] },
  { name: 'rbac', script: 'platform/seed-backoffice-rbac.mjs', args: ['--teardown'] },
  { name: 'cms-pages', script: 'cms/seed-pagebuilder-pages.mjs', args: ['--teardown'] },
  { name: 'loyalty', script: 'loyalty/seed-loyalty.mjs', args: ['--teardown'] },
  { name: 'loyalty-fixtures', script: 'loyalty/seed-loyalty-fixtures.mjs', args: ['--teardown'] },
  { name: 'promotions', script: 'promotions/seed-promotions.mjs', args: ['--teardown'] },
  { name: 'b2b-addresses', script: 'b2b/seed-b2b-addresses.mjs', args: ['--teardown'] },
  { name: 'company-users', script: 'b2b/seed-company-users.mjs', args: ['--teardown'] },
  { name: 'bopis', script: 'bopis/seed-bopis.mjs', args: ['--teardown'] },
  { name: 'inventory', script: 'inventory/seed-inventory.mjs', args: ['--teardown'] },
  { name: 'pricing', script: 'pricing/seed-pricing.mjs', args: ['--teardown'] },
  { name: 'configurable', script: 'products/seed-configurable.mjs', args: ['--teardown'] },
  { name: 'products', script: 'products/seed-standard-products.mjs', args: ['--teardown'] },
  { name: 'properties', script: 'catalog/seed-catalog-properties.mjs', args: ['--teardown'] },
  // Sweeps every AGENT-TEST-SEED-* catalog + its categories/products/pricelists and unbinds the store.
  { name: 'catalog+categories', script: 'seed-test-data.js', args: ['teardown'] },
];

/**
 * Explicit seed PRIORITY — the dependency chain, encoded as a number per step so ordering is
 * data-driven (sorted below), not an accident of array position. Reorder by editing `priority`.
 *
 *   Catalog(10) > Properties(30) > Products(40) > Configurations(50) >
 *   Prices(60) > Inventory(70) > Store(80) > BOPIS(90) > Company-users(100) > …others(110+)
 *
 * Every phase is its own common script — the preflight only warms the member index + ensures one
 * bridge fulfillment center. seed-catalog(10) builds the AGENT-TEST-SEED-* catalog structure and
 * binds the store; seed-store(80) finalizes store config + FFC roles. There is NO separate categories
 * phase: the categories.csv tree is built IN-PROCESS by Products(40) (seed-standard-products calls
 * seedCategoryTree) so its category cache spans category creation + product placement — a separate
 * categories process couldn't be seen by the products process (cross-process index lag) → duplicate
 * tree. `seed:categories` remains only as a standalone command; do NOT re-add a categories step here.
 * WHY this order: prices must come AFTER every product exists, so Configurations(50) is priced
 * too → pricing(60) follows both products(40) and configurable(50); BOPIS(90) needs a
 * fulfillment center (inventory/70); company-users(100) needs the member index.
 * `required` steps abort the run on failure; optional ones warn and continue.
 */
const STEPS = [
  { name: 'catalog', script: 'catalog/seed-catalog.mjs', required: true, priority: 10 },
  // NOTE: the categories.csv tree is NOT a separate phase — the products phase (priority 40) builds it
  // in-process via seedCategoryTree so its (catalogId, code) cache spans category creation + product
  // placement. A separate `seed-catalog-categories.mjs` process could not be seen by the products
  // process (cross-process index lag) → duplicate categories.csv tree. `seed:categories` remains only
  // as a standalone command. Do NOT re-add a categories step here.
  { name: 'store', script: 'store/seed-store.mjs', required: true, priority: 80 },
  { name: 'properties', script: 'catalog/seed-catalog-properties.mjs', required: true, priority: 30 },
  { name: 'products', script: 'products/seed-standard-products.mjs', required: true, priority: 40 },
  { name: 'configurable', script: 'products/seed-configurable.mjs', required: false, priority: 50 },
  // NOTE: no generic 'pricing' phase — standard-products + configurable price their OWN products
  // (distinct per-product prices). The generic seed-pricing.mjs set a FLAT 99.99 pricelist at high
  // priority that overrode every per-product price (all products showed 99.99). It remains available
  // as a standalone `npm run seed:pricing` for explicitly bulk-pricing an arbitrary catalog.
  { name: 'inventory', script: 'inventory/seed-inventory.mjs', required: true, priority: 70 },
  // Relational fixture set (products-full.csv + pricing/*.csv + stock-levels.csv). Now UNIFIED: it
  // delegates catalog/categories to the shared ensureCatalogs + seedCategoryTree (stable AGENT-TEST-SEED
  // names, store-scoped SEO) instead of a date-stamped fork, and seeds into the same catalogs. Runs
  // after inventory(70) so its stock has FFCs. Optional — supplementary to the .mjs product set.
  { name: 'test-data', script: 'seed-test-data.js', args: ['catalog'], required: false, priority: 75 },
  { name: 'bopis', script: 'bopis/seed-bopis.mjs', required: true, priority: 90 },
  { name: 'company-users', script: 'b2b/seed-company-users.mjs', args: ['all'], required: true, priority: 100 },
  // Org addresses beyond the single inline default baked into orgBody() — needs the org graph (100) first.
  { name: 'b2b-addresses', script: 'b2b/seed-b2b-addresses.mjs', required: false, priority: 105 },
  { name: 'promotions', script: 'promotions/seed-promotions.mjs', required: false, priority: 110 },
  // The 1-PTS divisor fixture (LOY_SKU_PTS_UNIT) that balance-relative loyalty tests depend on. Runs
  // just BEFORE the loyalty programs (120) and is OPTIONAL (warns if the loyalty module/PTS currency
  // is absent — it's a no-op then). Needs the catalog/store/products phases done (its category +
  // price list resolve against them). Does NOT create a balance (no balance-write API — see
  // seed-loyalty-balance.mjs, which is manual-only and NOT wired here because it places real orders).
  { name: 'loyalty-fixtures', script: 'loyalty/seed-loyalty-fixtures.mjs', required: false, priority: 118 },
  { name: 'loyalty', script: 'loyalty/seed-loyalty.mjs', required: false, priority: 120 },
  { name: 'white-labeling', script: 'white-labeling/seed-white-labeling.mjs', required: false, priority: 130 },
  // Restricted back-office (Manager) RBAC account for CMS-123/124 — read-only Page Builder, no
  // builder:update. Independent of the catalog/user graph (own role + account); optional.
  { name: 'rbac', script: 'platform/seed-backoffice-rbac.mjs', required: false, priority: 135 },
  // Reconcile the canonical qa-* PageBuilder pages (status + permalink) so the 059/060 published-page
  // cases resolve. Reconcile-only (no content authoring); reports conflicts. Optional.
  { name: 'cms-pages', script: 'cms/seed-pagebuilder-pages.mjs', required: false, priority: 136 },
  // Order/quote STATE fixtures (VCST-5482) — after products (40) + company-users (100): orders are
  // owned by USER_EMAIL, quotes submitted by ORG_USER_EMAIL, and line items point at real catalog
  // products. Optional: quotes need the Quote module deployed + Stores.EnableQuotes on the store.
  { name: 'orders', script: 'orders/seed-order-states.mjs', required: false, priority: 140 },
  { name: 'quotes', script: 'orders/seed-quotes.mjs', required: false, priority: 145 },
].sort((a, b) => a.priority - b.priority);

function runStep(step) {
  const scriptPath = join(ROOT, 'scripts', 'seed-data', step.script);
  log(`\n─── seed:${step.name} (${step.required ? 'required' : 'optional'}) ───`);
  const res = spawnSync('node', [scriptPath, ...(step.args || []), ...passthrough], {
    stdio: 'inherit',
    env: process.env,
    cwd: ROOT,
  });
  return res.status === 0;
}

(async () => {
  console.log(`=== seed:bootstrap${TEARDOWN ? ' [TEARDOWN]' : ''} — TEST_ENV=${process.env.TEST_ENV || 'vcst'}${DRY_RUN ? ' [DRY RUN]' : ''} ===`);
  assertSafeTarget();
  await auth();

  // ── Teardown mode: reverse-order sweep of every domain, then exit. Best-effort per step. ──
  if (TEARDOWN) {
    const tdResults = [];
    for (const step of TEARDOWN_STEPS) {
      const ok = runStep({ ...step, required: false });
      tdResults.push({ ...step, status: ok ? 'ok' : 'warn' });
      if (!ok) log(`⚠ teardown ${step.name} reported a problem — continuing.`);
    }
    printSummary(tdResults);
    console.log('\nTeardown complete. Re-seed with `npm run seed:bootstrap`.');
    process.exit(0);
  }

  // ── Preflight: only what the STEPS below don't own. Catalog/categories/store are now explicit
  // steps (priority 10/20/80) that build the AGENT-TEST-SEED-* structure and bind the store — so the
  // preflight must NOT call ensureVirtualCatalog (it would create a LOCAL-<date> orphan before the
  // catalog step's B2B-mixed). We warm the member index early (it's slow/async; company-users needs
  // it) and ensure ONE fulfillment center exists so product seeding (priority 40) — which runs before
  // the inventory step (70) — has a stock target; the inventory step tops up the full FFC set. ──
  log('\n[preflight] member index');
  await ensureMemberIndex(api, { required: !DRY_RUN });
  log('[preflight] fulfillment center (bridge for products before the inventory step)');
  await ensureFulfillmentCenter(api);

  // ── Seeder chain ──
  const results = [];
  for (const step of STEPS) {
    if (SKIP_OPTIONAL && !step.required) { results.push({ ...step, status: 'skipped' }); continue; }
    const okStep = runStep(step);
    if (okStep) results.push({ ...step, status: 'ok' });
    else if (step.required) {
      results.push({ ...step, status: 'FAILED' });
      console.error(`\nABORT: required step seed:${step.name} failed. Fix it, then re-run (seeders are idempotent).`);
      printSummary(results);
      process.exit(1);
    } else {
      results.push({ ...step, status: 'warn' });
      log(`⚠ optional step seed:${step.name} failed — continuing.`);
    }
  }

  printSummary(results);
  const anyWarn = results.some((r) => r.status === 'warn');
  console.log(anyWarn
    ? '\nBootstrap finished with optional-step warnings (see above).'
    : '\nBootstrap OK. Next: run `npm run td:reconcile` to verify live data, then `/qa-smoke`.');
  process.exit(0);
})().catch((e) => { console.error('bootstrap crashed:', e); process.exit(2); });

function printSummary(results) {
  console.log('\n=== bootstrap summary ===');
  for (const r of results) {
    const mark = { ok: '✓', warn: '⚠', FAILED: '✗', skipped: '·' }[r.status] || '?';
    console.log(`  ${mark} seed:${r.name} — ${r.status}`);
  }
}
