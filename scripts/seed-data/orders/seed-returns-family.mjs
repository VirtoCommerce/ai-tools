#!/usr/bin/env node
/**
 * scripts/seed-data/orders/seed-returns-family.mjs
 *
 * ONE entrypoint for the whole returns data family, forward and reverse — the returns twin of
 * sales-rep/seed-sales-rep-family.mjs, and built the same way (spawnSync per child, `--step` to
 * select one, `--only` forwarded untouched). Read that file's header for why.
 *
 * TWO PROFILES, MUTUALLY EXCLUSIVE on one environment:
 *
 *   fixtures (default) — the AGENT-TEST regression family: seed-return-orders (VCST-5628),
 *                        seed-return-decisions (VCST-5883), seed-org-returns (VCST-5884).
 *   demo               — seed-returns-demo: presentation-grade returns on the sales-rep demo's
 *                        customers, no AGENT-TEST string on any rendered surface.
 *
 * They share one surface — the Admin SPA Return list and the store's return numbering — so a demo
 * seeded over live fixtures shows a hundred `AGENT-TEST-ORD-RET-*` rows around eight real-looking
 * ones. The entrypoint refuses to seed one over the other and prints the teardown command instead.
 *
 * THE STAMP is `_meta.dataset_profiles.returns` in test-data/aliases.<env>.json — its own key, not
 * the sales-rep family's single-valued `_meta.dataset_profile`, so neither family can clear the
 * other's guard. Bracketed as the sales-rep family brackets it: stamped BEFORE seeding (a half-run
 * still blocks the other profile), cleared only AFTER a fully clean teardown.
 *
 * Usage:
 *   TEST_ENV=vcst       npm run seed:returns-family
 *   TEST_ENV=virtostart npm run seed:returns-family -- --profile demo
 *   TEST_ENV=virtostart npm run seed:returns-family -- --teardown
 */

import "../../lib/sync-stdio.mjs";
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DRY_RUN, TEARDOWN, api, auth, assertSafeTarget, log } from '../../lib/seed-common.mjs';
import { RETURNS_FAMILY, RETURNS_PROFILE } from './returns-demo-specs.mjs';

const argv = process.argv.slice(2);
const flagValue = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const STEP = flagValue('--step');
const PROFILE = (flagValue('--profile') || process.env.RETURNS_DATASET_PROFILE || 'fixtures').toLowerCase();
const TEST_ENV = process.env.TEST_ENV || 'vcst';

const passthrough = [];
for (const a of ['--dry-run', '--verbose', '--fresh']) if (argv.includes(a)) passthrough.push(a);
if (argv.includes('--only')) passthrough.push('--only', flagValue('--only'));

/** Each fixture seeder owns its own orders, buyers and returns; none reads another's, so order is by step number. */
const FIXTURE_STEPS = [
  { name: 'return-orders', script: 'orders/seed-return-orders.mjs', required: false, priority: 10 },
  { name: 'decisions', script: 'orders/seed-return-decisions.mjs', required: false, priority: 20 },
  { name: 'org-returns', script: 'orders/seed-org-returns.mjs', required: false, priority: 30 },
];
const DEMO_STEPS = [
  { name: 'demo', script: 'orders/seed-returns-demo.mjs', required: true, priority: 10 },
];
const stepsFor = (profile) => [...(profile === 'demo' ? DEMO_STEPS : FIXTURE_STEPS)].sort((a, b) => a.priority - b.priority);

// ---- profile stamp -------------------------------------------------------------

const overlayPath = () => join(ROOT, `test-data/aliases.${TEST_ENV}.json`);

function readOverlay() {
  const p = overlayPath();
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

const liveProfile = () => readOverlay()?._meta?.dataset_profiles?.[RETURNS_FAMILY] || null;

/** Direct merge, spreading the existing `_meta` so the sales-rep stamp and every seeder note survive. */
function stampProfile(value) {
  if (DRY_RUN) { log(`[DRY] would ${value ? `stamp dataset_profiles.${RETURNS_FAMILY}=${value}` : `clear dataset_profiles.${RETURNS_FAMILY}`}`); return; }
  const cur = readOverlay();
  if (cur === null) { log(`WARN: cannot stamp — aliases.${TEST_ENV}.json is unparsable`); return; }
  const profiles = { ...(cur._meta?.dataset_profiles || {}) };
  if (value) profiles[RETURNS_FAMILY] = value; else delete profiles[RETURNS_FAMILY];
  const meta = { ...(cur._meta || {}), env: TEST_ENV, dataset_profiles: profiles };
  if (!Object.keys(profiles).length) delete meta.dataset_profiles;
  cur._meta = meta;
  writeFileSync(overlayPath(), `${JSON.stringify(cur, null, 2)}\n`);
  log(value ? `dataset_profiles.${RETURNS_FAMILY} = ${value}` : `dataset_profiles.${RETURNS_FAMILY} cleared`);
}

function assertProfileFree() {
  const live = liveProfile();
  const want = RETURNS_PROFILE[PROFILE];
  if (!live || live === want) return;
  console.error(`ABORT: ${TEST_ENV} currently holds the "${live}" returns dataset, and the two cannot coexist`);
  console.error('  (one Admin Return list, one store-wide return numbering).');
  console.error(`\n  Tear the live one down first:\n    TEST_ENV=${TEST_ENV} npm run seed:returns-family -- --teardown`);
  console.error(`  then re-run with --profile ${PROFILE}.`);
  process.exit(2);
}

/** A store without vc-module-return is a legitimate shape: one skip line, exit 0. */
async function modulePresent() {
  try { await api('POST', '/api/return/search', { take: 0 }, { expectStatus: [200, 201] }); return true; } catch { return false; }
}

/** AGENT-TEST returns already live — the demo warns rather than aborts, since nothing stamped them. */
async function unstampedFixtureCount() {
  const r = await api('POST', '/api/order/customerOrders/search', { keyword: 'AGENT-TEST-ORD-RET', take: 0 }, { expectStatus: [200, 201] }).catch(() => null);
  return r?.totalCount || 0;
}

function runStep(step, extra = []) {
  const scriptPath = join(ROOT, 'scripts', 'seed-data', step.script);
  log(`\n─── seed:${step.name} (${step.required ? 'required' : 'optional'}) ───`);
  const res = spawnSync('node', [scriptPath, ...(step.args || []), ...extra, ...passthrough], { stdio: 'inherit', env: process.env, cwd: process.cwd() });
  return res.status === 0;
}

function printSummary(results) {
  console.log('\n=== returns family summary ===');
  for (const r of results) console.log(`  ${{ ok: '✓', warn: '⚠', FAILED: '✗', skipped: '·' }[r.status] || '?'} seed:${r.name} — ${r.status}`);
}

async function main() {
  if (!RETURNS_PROFILE[PROFILE]) { console.error(`ABORT: --profile must be one of ${Object.keys(RETURNS_PROFILE).join(' | ')} (got "${PROFILE}").`); process.exit(2); }
  console.log(`=== returns family${TEARDOWN ? ' [TEARDOWN]' : ''} — profile=${PROFILE} TEST_ENV=${TEST_ENV}${DRY_RUN ? ' [DRY RUN]' : ''} ===`);
  assertSafeTarget();
  await auth();
  if (!(await modulePresent())) { log('vc-module-return is not deployed here (/api/return/search unreachable) — nothing to do.'); process.exit(0); }

  // On teardown the STAMP decides which chain to reverse, never the flag.
  const effective = TEARDOWN ? (liveProfile() === RETURNS_PROFILE.demo ? 'demo' : PROFILE) : PROFILE;
  if (!TEARDOWN) {
    assertProfileFree();
    if (effective === 'demo') {
      const n = await unstampedFixtureCount();
      if (n) log(`WARN: ${n} AGENT-TEST-ORD-RET* order(s) are live and will sit beside the demo in the Admin Return list. Sweep them with \`npm run seed:returns-family -- --teardown\` BEFORE seeding the demo.`);
    }
    if (!STEP) stampProfile(RETURNS_PROFILE[effective]);
  }

  let steps = stepsFor(effective);
  if (STEP) {
    steps = steps.filter((s) => s.name === STEP);
    if (!steps.length) { console.error(`ABORT: --step ${STEP} is not a step of "${effective}" (have: ${stepsFor(effective).map((s) => s.name).join(', ')})`); process.exit(2); }
  }

  const results = [];
  if (TEARDOWN) {
    for (const step of [...steps].reverse()) {
      const ok = runStep(step, ['--teardown']);
      results.push({ ...step, status: ok ? 'ok' : 'warn' });
    }
    const clean = results.every((r) => r.status === 'ok');
    if (!STEP && clean) stampProfile(null);
    else if (!STEP) log(`dataset_profiles.${RETURNS_FAMILY} left at "${RETURNS_PROFILE[effective]}" — teardown was not clean.`);
    printSummary(results);
    process.exit(0);
  }

  for (const step of steps) {
    const ok = runStep(step);
    if (ok) { results.push({ ...step, status: 'ok' }); continue; }
    if (step.required) { results.push({ ...step, status: 'FAILED' }); printSummary(results); console.error(`\nABORT: required step seed:${step.name} failed (seeders are idempotent — fix and re-run).`); process.exit(1); }
    results.push({ ...step, status: 'warn' });
  }
  printSummary(results);
  console.log(results.some((r) => r.status === 'warn') ? '\nFinished with warnings (see above).' : `\nReturns family OK (profile=${effective}).`);
  process.exit(0);
}

main().catch((e) => { console.error('returns family crashed:', e.message); process.exit(2); });
