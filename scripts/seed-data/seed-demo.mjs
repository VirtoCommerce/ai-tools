#!/usr/bin/env node
/**
 * scripts/seed-data/seed-demo.mjs — the DEMO dataset across every data family that has one.
 *
 * A family with a demo profile owns a presentation-grade dataset (real-looking names, no AGENT-TEST
 * string on any rendered surface) beside its AGENT-TEST fixtures, behind its own family entrypoint
 * and its own profile stamp. This file only ORDERS those entrypoints: dependencies first on seed,
 * reversed on teardown. Adding a family = one row in DEMO_FAMILIES, nothing else.
 *
 *   sales-rep  — organizations, buyers, reps' books, orders, documents, tasks, lists, carts
 *   returns    — delivered orders + returns in every status, on the sales-rep demo's customers
 *                (depends on sales-rep: it reads that demo's ledger for orgs and buyer accounts)
 *   loyalty-missions — store-wide missions with buyer progress (completed / in progress / not started)
 *
 * Families WITHOUT a demo profile are untouched — their fixtures stay whatever is seeded. Run
 * `npm run seed:demo -- --list` to see which families have one.
 *
 * Usage:
 *   TEST_ENV=virtostart npm run seed:demo                  # seed every demo family, in order
 *   TEST_ENV=virtostart npm run seed:demo -- --dry-run
 *   TEST_ENV=virtostart npm run seed:demo -- --family returns
 *   TEST_ENV=virtostart npm run seed:demo:teardown         # reverse order
 */

import "../lib/sync-stdio.mjs";
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT, DRY_RUN, TEARDOWN, assertSafeTarget, log } from '../lib/seed-common.mjs';

const argv = process.argv.slice(2);
const flagValue = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
const FAMILY = flagValue('--family');
const TEST_ENV = process.env.TEST_ENV || 'vcst';

/** In dependency order. `dependsOn` is checked, so a reorder that breaks it fails here, not on stage. */
export const DEMO_FAMILIES = [
  { name: 'sales-rep', script: 'sales-rep/seed-sales-rep-family.mjs', dependsOn: [] },
  { name: 'returns', script: 'orders/seed-returns-family.mjs', dependsOn: ['sales-rep'] },
  // After returns, not only after sales-rep: mission progress moves on EVERY order a demo buyer gets,
  // so the returns demo's orders must exist before the missions do, or they would count toward them.
  { name: 'loyalty-missions', script: 'loyalty/seed-missions-family.mjs', dependsOn: ['sales-rep', 'returns'] },
];

function orderProblems(families = DEMO_FAMILIES) {
  const seen = new Set(); const out = [];
  for (const f of families) {
    for (const d of f.dependsOn) if (!seen.has(d)) out.push(`${f.name} depends on ${d}, which is not listed before it`);
    seen.add(f.name);
  }
  return out;
}

const passthrough = ['--dry-run', '--verbose'].filter((a) => argv.includes(a));

function run(family) {
  log(`\n═══ ${family.name} (demo)${TEARDOWN ? ' — teardown' : ''} ═══`);
  const args = [join(ROOT, 'scripts', 'seed-data', family.script), ...(TEARDOWN ? ['--teardown'] : ['--profile', 'demo']), ...passthrough];
  return spawnSync('node', args, { stdio: 'inherit', env: process.env, cwd: process.cwd() }).status === 0;
}

function main() {
  if (argv.includes('--list')) { DEMO_FAMILIES.forEach((f) => console.log(`${f.name}${f.dependsOn.length ? `  (after ${f.dependsOn.join(', ')})` : ''}`)); return; }
  const problems = orderProblems();
  if (problems.length) { console.error(`ABORT: DEMO_FAMILIES is mis-ordered:\n  - ${problems.join('\n  - ')}`); process.exit(2); }
  console.log(`=== seed:demo${TEARDOWN ? ' [TEARDOWN]' : ''} — TEST_ENV=${TEST_ENV}${DRY_RUN ? ' [DRY RUN]' : ''} ===`);
  assertSafeTarget();

  let families = TEARDOWN ? [...DEMO_FAMILIES].reverse() : DEMO_FAMILIES;
  if (FAMILY) {
    families = families.filter((f) => f.name === FAMILY);
    if (!families.length) { console.error(`ABORT: no demo family "${FAMILY}" (have: ${DEMO_FAMILIES.map((f) => f.name).join(', ')})`); process.exit(2); }
  }
  const results = [];
  for (const f of families) {
    const ok = run(f);
    results.push({ name: f.name, ok });
    // Seeding stops at the first failure: every later family stands on the earlier ones.
    if (!ok && !TEARDOWN) break;
  }
  console.log('\n=== seed:demo summary ===');
  results.forEach((r) => console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}`));
  const skipped = families.slice(results.length).map((f) => f.name);
  if (skipped.length) console.log(`  · not run (depends on a failed family): ${skipped.join(', ')}`);
  process.exit(results.every((r) => r.ok) && !skipped.length ? 0 : 1);
}

main();
