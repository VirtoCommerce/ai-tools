#!/usr/bin/env node
/**
 * scripts/seed-data/sales-rep/seed-sales-rep-family.mjs
 *
 * ONE entrypoint for the whole sales-rep data family, forward and reverse. Before this, seeding a
 * usable sales-rep environment meant remembering seven npm scripts in the right order, and tearing
 * one down meant remembering them in the opposite order — which nothing wrote down, so a partial
 * teardown followed by a reseed was the normal outcome rather than the exceptional one.
 *
 * TWO PROFILES, and they are MUTUALLY EXCLUSIVE on one environment:
 *
 *   fixtures (default) — the AGENT-TEST regression family. Deterministic, prefix-marked, consumed
 *                        by the sales-rep suites. Correct for QA; unusable in front of a customer.
 *   demo               — presentation-grade data: real names, real addresses, real products, real
 *                        document titles, and no AGENT-TEST string on any rendered surface.
 *
 * They cannot coexist because they occupy the same surface: one rep list, one global document
 * library, one served-org graph. Seeding either over the other yields a mixture that is neither a
 * clean fixture set nor a credible demo. So the entrypoint REFUSES to seed one while the other is
 * live, and prints the teardown command instead of silently interleaving them. The live profile is
 * recorded in `_meta.dataset_profile` of `test-data/aliases.<env>.json`.
 *
 * WHY spawnSync RATHER THAN IMPORTS. Three properties of the existing seeders, not a style choice:
 *   1. Every seeder calls `main()` at module scope — importing one SEEDS it.
 *   2. `seed-common.mjs` holds a module-level TOKEN, while the tasks / stats / i18n seeders mint
 *      their own rep-scoped tokens (a storeId password grant) and `seed-sales-rep.mjs` swaps the
 *      shared client via `__setApi()` mid-run. Chaining them in-process cross-contaminates that
 *      client — the `Bearer null` class already documented in seed-sales-rep.mjs.
 *   3. seed-bootstrap.mjs already uses exactly this model, so there is one mental model, not two.
 *
 * FLAG COLLISION, handled deliberately. `--only <key>` means a FIXTURE key to every child seeder
 * (`--only ROWCAP`, `--only SR_REP_PRIMARY`). This entrypoint therefore uses `--step <name>` to
 * select a step and forwards `--only` untouched. Overloading `--only` would make `--only ROWCAP`
 * either select no step at all or fan out to all seven.
 *
 * Usage:
 *   TEST_ENV=vcst       npm run seed:sales-rep-family
 *   TEST_ENV=virtostart npm run seed:sales-rep-family -- --profile demo
 *   TEST_ENV=vcst       npm run seed:sales-rep-family -- --teardown
 *   TEST_ENV=vcst       npm run seed:sales-rep-family -- --step docs --only SR_DOC_PDF
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, DRY_RUN, TEARDOWN, api, auth, assertSafeTarget, log,
} from '../../lib/seed-common.mjs';

const argv = process.argv.slice(2);
const flagValue = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);

const SKIP_OPTIONAL = argv.includes('--skip-optional');
const STEP = flagValue('--step');
const PROFILE = (flagValue('--profile') || process.env.SR_DATASET_PROFILE || 'fixtures').toLowerCase();
const TEST_ENV = process.env.TEST_ENV || 'vcst';

/** Forwarded verbatim to every child. `--only` rides along so a step can scope itself. */
const passthrough = [];
for (const a of ['--dry-run', '--verbose']) if (argv.includes(a)) passthrough.push(a);
if (argv.includes('--only')) passthrough.push('--only', flagValue('--only'));

const PROFILES = ['fixtures', 'demo'];

/**
 * The AGENT-TEST regression family, in dependency order.
 *
 * `reps` is required and first: every other step attaches to a rep that must already exist. `rowcap`
 * is the same script as `stats` under a different `--only` scope — they write disjoint order number
 * spaces on purpose, so one sweep can never catch the other's rows.
 */
const FIXTURE_STEPS = [
  { name: 'reps', script: 'sales-rep/seed-sales-rep.mjs', required: true, priority: 10 },
  { name: 'rep-only-org', script: 'sales-rep/seed-rep-only-org.mjs', required: false, priority: 20 },
  { name: 'docs', script: 'sales-rep/seed-sales-rep-docs.mjs', required: false, priority: 30 },
  { name: 'stats', script: 'sales-rep/seed-sales-rep-stats.mjs', required: false, priority: 40 },
  { name: 'rowcap', script: 'sales-rep/seed-sales-rep-stats.mjs', args: ['--only', 'ROWCAP'], required: false, priority: 45 },
  { name: 'i18n', script: 'sales-rep/seed-sales-rep-i18n-plural.mjs', required: false, priority: 50 },
  { name: 'tasks', script: 'sales-rep/seed-sales-rep-tasks.mjs', required: false, priority: 60 },
];

/** The demo profile is a single seeder: one narrative, one ledger, one teardown. */
const DEMO_STEPS = [
  { name: 'demo', script: 'sales-rep/seed-sales-rep-demo.mjs', required: true, priority: 10 },
];

const stepsFor = (profile) => [...(profile === 'demo' ? DEMO_STEPS : FIXTURE_STEPS)]
  .sort((a, b) => a.priority - b.priority);

// ---- profile bookkeeping ---------------------------------------------------

const overlayPath = () => join(ROOT, `test-data/aliases.${TEST_ENV}.json`);

/** The profile currently seeded on this environment, per the alias overlay. */
function liveProfile() {
  const p = overlayPath();
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8'))?._meta?.dataset_profile || null;
  } catch {
    return null;
  }
}

/**
 * Record (or clear) which profile this environment now holds.
 *
 * WITHOUT THIS THE GUARD BELOW IS DEAD CODE, and silently so: `assertProfileFree()` reads
 * `_meta.dataset_profile`, so if nothing ever writes it the flag stays null, every check passes,
 * and a routine `seed:bootstrap` drops the fixture family straight on top of a live demo — the
 * exact failure the guard exists to prevent, discovered on stage. Caught by dry-running the
 * forward path and grepping for a writer; there wasn't one.
 *
 * Written as a direct merge rather than through `writeEnvAliasOverride`, which rebuilds `_meta`
 * from its own fields on every call. It spreads the existing `_meta` first, so a stamp written
 * here survives every later seeder write-back.
 */
function stampProfile(value) {
  const p = overlayPath();
  if (DRY_RUN) { log(`[DRY] would ${value ? `stamp dataset_profile=${value}` : 'clear dataset_profile'}`); return; }
  let cur = {};
  if (existsSync(p)) {
    try {
      cur = JSON.parse(readFileSync(p, 'utf8'));
    } catch (e) {
      log(`WARN: cannot stamp dataset_profile — aliases.${TEST_ENV}.json is unparsable (${e.message})`);
      return;
    }
  }
  const meta = { ...(cur._meta || {}), env: TEST_ENV };
  if (value) meta.dataset_profile = value; else delete meta.dataset_profile;
  cur._meta = meta;
  writeFileSync(p, `${JSON.stringify(cur, null, 2)}\n`);
  log(value ? `dataset_profile = ${value}` : 'dataset_profile cleared');
}

/**
 * Refuse to seed one profile over a live other one. This is the guard that keeps a demo from being
 * quietly destroyed by a routine fixture seed — the failure it prevents is discovered on stage.
 */
function assertProfileFree() {
  const live = liveProfile();
  const want = PROFILE === 'demo' ? 'sales-rep-demo' : 'sales-rep-fixtures';
  if (!live || live === want) return;
  console.error(`ABORT: ${TEST_ENV} currently holds the "${live}" sales-rep dataset, and the two cannot coexist.`);
  console.error('  One rep list, one global document library, one served-org graph — seeding over the');
  console.error('  other leaves a mixture that is neither a clean fixture set nor a credible demo.');
  console.error('\n  Tear the live one down first:');
  console.error(`    TEST_ENV=${TEST_ENV} npm run seed:sales-rep-family -- --teardown`);
  console.error(`  then re-run with --profile ${PROFILE}.`);
  process.exit(2);
}

// ---- module presence -------------------------------------------------------

/**
 * Is vc-module-sales-rep deployed here at all? An environment without it is a legitimate deployment
 * shape, not an error — so it produces ONE skip line and a zero exit, rather than seven child
 * seeders each failing separately with their own unrelated-looking message.
 */
async function modulePresent() {
  try {
    await api('GET', '/api/sales-rep/roles', null, { expectStatus: [200, 201] });
    return true;
  } catch {
    return false;
  }
}

// ---- execution -------------------------------------------------------------

function runStep(step, extraArgs = []) {
  const scriptPath = join(ROOT, 'scripts', 'seed-data', step.script);
  if (!existsSync(scriptPath)) {
    log(`⚠ seed:${step.name} — ${step.script} does not exist yet; skipped.`);
    return !step.required;
  }
  log(`\n─── seed:${step.name} (${step.required ? 'required' : 'optional'}) ───`);
  const res = spawnSync('node', [scriptPath, ...(step.args || []), ...extraArgs, ...passthrough], {
    stdio: 'inherit',
    env: process.env,
    cwd: ROOT,
  });
  return res.status === 0;
}

function printSummary(results) {
  console.log('\n=== sales-rep family summary ===');
  for (const r of results) {
    const mark = { ok: '✓', warn: '⚠', FAILED: '✗', skipped: '·' }[r.status] || '?';
    console.log(`  ${mark} seed:${r.name} — ${r.status}`);
  }
}

async function main() {
  if (!PROFILES.includes(PROFILE)) {
    console.error(`ABORT: --profile must be one of ${PROFILES.join(' | ')} (got "${PROFILE}").`);
    process.exit(2);
  }

  console.log(`=== sales-rep family${TEARDOWN ? ' [TEARDOWN]' : ''} — profile=${PROFILE} TEST_ENV=${TEST_ENV}${DRY_RUN ? ' [DRY RUN]' : ''} ===`);
  assertSafeTarget();
  await auth();

  if (!(await modulePresent())) {
    log('vc-module-sales-rep is not deployed on this environment (/api/sales-rep/roles unreachable) — nothing to do.');
    process.exit(0);
  }

  // On teardown the live profile decides which chain to reverse — not the --profile flag, which
  // would happily tear down a chain that was never seeded and leave the real one standing.
  const effective = TEARDOWN ? (liveProfile() === 'sales-rep-demo' ? 'demo' : PROFILE) : PROFILE;
  if (!TEARDOWN) assertProfileFree();

  // The stamp brackets the chain ASYMMETRICALLY, and the asymmetry is the point: in both
  // directions the flag must stay set across any half-finished state.
  //   seeding  — stamp BEFORE. A run that dies halfway leaves a half-seeded dataset, which must
  //              still block the other profile; stamping only on success leaves that unguarded.
  //   teardown — clear AFTER. Clearing first would unguard a half-swept environment, letting the
  //              other profile seed on top of whatever the failed teardown left behind.
  // `--step` never stamps either way: seeding or reverting one step is a repair, not a claim on
  // the environment.
  if (!TEARDOWN && !STEP) stampProfile(`sales-rep-${effective}`);

  let steps = stepsFor(effective);
  if (STEP) {
    steps = steps.filter((s) => s.name === STEP);
    if (!steps.length) {
      console.error(`ABORT: --step ${STEP} is not a step of the "${effective}" profile.`);
      console.error(`  Available: ${stepsFor(effective).map((s) => s.name).join(', ')}`);
      process.exit(2);
    }
  }

  const results = [];

  // Teardown = the same chain reversed, each child given its own --teardown. Best-effort per step,
  // mirroring seed-bootstrap: one stuck domain must not block the rest of the clean.
  if (TEARDOWN) {
    for (const step of [...steps].reverse()) {
      const ok = runStep(step, ['--teardown']);
      results.push({ ...step, status: ok ? 'ok' : 'warn' });
      if (!ok) log(`⚠ teardown ${step.name} reported a problem — continuing.`);
    }
    // Clear only a FULL, CLEAN sweep. A teardown that warned left something behind, so the
    // environment still holds part of this profile and must keep blocking the other one.
    const clean = results.every((r) => r.status === 'ok');
    if (!STEP && clean) stampProfile(null);
    else if (!STEP) log(`dataset_profile left at "sales-rep-${effective}" — teardown was not clean, so the environment still holds part of it.`);
    printSummary(results);
    console.log(`\nTeardown complete. Re-seed with \`npm run seed:sales-rep-family -- --profile ${effective}\`.`);
    console.log('Note: this reverses the per-seeder chain only. To sweep entities the CSVs no longer');
    console.log('declare — hand-made reps, orphaned documents — use `npm run sr:inventory`.');
    process.exit(0);
  }

  for (const step of steps) {
    if (SKIP_OPTIONAL && !step.required) { results.push({ ...step, status: 'skipped' }); continue; }
    const ok = runStep(step);
    if (ok) { results.push({ ...step, status: 'ok' }); continue; }
    if (step.required) {
      results.push({ ...step, status: 'FAILED' });
      console.error(`\nABORT: required step seed:${step.name} failed. Fix it, then re-run (seeders are idempotent).`);
      printSummary(results);
      process.exit(1);
    }
    results.push({ ...step, status: 'warn' });
    log(`⚠ optional step seed:${step.name} failed — continuing.`);
  }

  printSummary(results);
  console.log(results.some((r) => r.status === 'warn')
    ? '\nFinished with optional-step warnings (see above).'
    : `\nSales-rep family OK (profile=${effective}). Next: \`npm run td:reconcile\`.`);
  process.exit(0);
}

main().catch((e) => { console.error('sales-rep family crashed:', e.message); process.exit(2); });
