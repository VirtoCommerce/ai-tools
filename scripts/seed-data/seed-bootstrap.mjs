/**
 * scripts/seed-bootstrap.mjs
 *
 * ONE command to bring ANY environment (fresh /qa-local-env, vcst, vcptcore,
 * virtostart, a new customer env) to a verified, test-ready seeded state
 * (VCST-5406). It does the from-scratch preflight the individual seeders can't
 * do on their own, then runs them in dependency order.
 *
 * Order (plan dependency chain):
 *   preflight: member-index → store/virtual-catalog → fulfillment-center
 *   required : properties → products → pricing → inventory → b2b → users
 *   optional : configurable → promotions → bopis → loyalty → white-labeling
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
  ensureMemberIndex, ensureVirtualCatalog, ensureFulfillmentCenter, log,
} from '../lib/seed-common.mjs';

const SKIP_OPTIONAL = process.argv.includes('--skip-optional');
const passthrough = process.argv.slice(2).filter((a) => a === '--dry-run' || a === '--verbose');

/** Dependency-ordered chain. `required` steps abort on failure; optional ones warn. */
const STEPS = [
  { name: 'properties', script: 'seed-catalog-properties.mjs', required: true },
  { name: 'products', script: 'seed-standard-products.mjs', required: true },
  { name: 'pricing', script: 'seed-pricing.mjs', required: true },
  { name: 'inventory', script: 'seed-inventory.mjs', required: true },
  // Unified company-users: orgs (parent-child) + contacts + org-scoped logins + cross-org
  // memberships + personal storefront accounts (env roles + agent-pool + test-users), all in one.
  { name: 'company-users', script: 'seed-company-users.mjs', args: ['all'], required: true },
  { name: 'configurable', script: 'seed-configurable-products.mjs', required: false },
  { name: 'promotions', script: 'seed-promotions.mjs', required: false },
  { name: 'bopis', script: 'seed-bopis.mjs', required: false },
  { name: 'loyalty', script: 'seed-loyalty.mjs', required: false },
  { name: 'white-labeling', script: 'seed-white-labeling.mjs', required: false },
];

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
  console.log(`=== seed:bootstrap — TEST_ENV=${process.env.TEST_ENV || 'vcst'}${DRY_RUN ? ' [DRY RUN]' : ''} ===`);
  assertSafeTarget();
  await auth();

  // ── Preflight: build the infrastructure a fresh DB lacks, in order. ──
  log('\n[preflight] member index');
  await ensureMemberIndex(api, { required: !DRY_RUN });
  log('[preflight] store + virtual catalog');
  const catalogId = await ensureVirtualCatalog(api);
  if (!catalogId && !DRY_RUN) { console.error('ABORT: could not ensure a virtual catalog.'); process.exit(1); }
  log('[preflight] fulfillment center');
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
