/**
 * scripts/lib/seed-family.mjs — the shared engine behind a data family's `fixtures | demo` entrypoint.
 *
 * A family runs one of two MUTUALLY EXCLUSIVE step chains on an environment: its AGENT-TEST fixtures
 * or its presentation-grade demo. The two share one surface (an Admin list, a store-wide page), so the
 * engine refuses to seed one over the other and prints the teardown command instead.
 *
 * THE STAMP lives at `_meta.dataset_profiles.<family>` in test-data/aliases.<env>.json, spread into the
 * existing `_meta` so no other family's stamp (or the sales-rep family's legacy `_meta.dataset_profile`)
 * is touched. Bracketed asymmetrically, as the sales-rep family does it: stamped BEFORE seeding (a run
 * that dies halfway still blocks the other profile), cleared only AFTER a fully clean teardown.
 *
 * Children run through spawnSync, never import: every seeder calls main() at module scope and holds a
 * module-level token (seed-sales-rep-family.mjs header has the full reasoning). `--step` selects one
 * step; `--only`, `--dry-run`, `--verbose` and `--fresh` are forwarded untouched.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DRY_RUN, TEARDOWN, auth, assertSafeTarget, log } from './seed-common.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const overlayPath = () => join(ROOT, `test-data/aliases.${TEST_ENV}.json`);

function readOverlay() {
  const p = overlayPath();
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/** The profile id stamped for `family` on this environment, or null. */
export const liveDatasetProfile = (family) => readOverlay()?._meta?.dataset_profiles?.[family] || null;

function stamp(family, value) {
  if (DRY_RUN) { log(`[DRY] would ${value ? `stamp dataset_profiles.${family}=${value}` : `clear dataset_profiles.${family}`}`); return; }
  const cur = readOverlay();
  if (cur === null) { log(`WARN: cannot stamp — aliases.${TEST_ENV}.json is unparsable`); return; }
  const profiles = { ...(cur._meta?.dataset_profiles || {}) };
  if (value) profiles[family] = value; else delete profiles[family];
  const meta = { ...(cur._meta || {}), env: TEST_ENV, dataset_profiles: profiles };
  if (!Object.keys(profiles).length) delete meta.dataset_profiles;
  cur._meta = meta;
  writeFileSync(overlayPath(), `${JSON.stringify(cur, null, 2)}\n`);
  log(value ? `dataset_profiles.${family} = ${value}` : `dataset_profiles.${family} cleared`);
}

/**
 * Run a family.
 *   family        — the stamp key, e.g. 'returns'
 *   npmScript     — the family's npm script, quoted in every printed command
 *   profiles      — { fixtures: { id, steps[] }, demo: { id, steps[] } }; a step is
 *                   { name, script (under scripts/seed-data), args?, required }
 *   modulePresent — async () => boolean; false ⇒ one skip line, exit 0
 *   beforeDemo    — optional async () => void, run before a demo seed (e.g. warn about live fixtures)
 */
export async function runFamily({ family, npmScript, profiles, modulePresent, beforeDemo }) {
  const argv = process.argv.slice(2);
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const STEP = flag('--step');
  const PROFILE = (flag('--profile') || 'fixtures').toLowerCase();
  const passthrough = ['--dry-run', '--verbose', '--fresh'].filter((a) => argv.includes(a));
  if (argv.includes('--only')) passthrough.push('--only', flag('--only'));

  if (!profiles[PROFILE]) { console.error(`ABORT: --profile must be one of ${Object.keys(profiles).join(' | ')} (got "${PROFILE}").`); process.exit(2); }
  console.log(`=== ${family} family${TEARDOWN ? ' [TEARDOWN]' : ''} — profile=${PROFILE} TEST_ENV=${TEST_ENV}${DRY_RUN ? ' [DRY RUN]' : ''} ===`);
  assertSafeTarget();
  await auth();
  if (modulePresent && !(await modulePresent())) { log(`the ${family} module is not deployed here — nothing to do.`); process.exit(0); }

  // On teardown the STAMP decides which chain to reverse, never the flag.
  const live = liveDatasetProfile(family);
  const effective = TEARDOWN ? (Object.keys(profiles).find((k) => profiles[k].id === live) || PROFILE) : PROFILE;
  if (!TEARDOWN) {
    if (live && live !== profiles[PROFILE].id) {
      console.error(`ABORT: ${TEST_ENV} currently holds the "${live}" ${family} dataset, and the two cannot coexist.`);
      console.error(`\n  Tear the live one down first:\n    TEST_ENV=${TEST_ENV} npm run ${npmScript} -- --teardown`);
      console.error(`  then re-run with --profile ${PROFILE}.`);
      process.exit(2);
    }
    if (effective === 'demo' && beforeDemo) await beforeDemo();
    if (!STEP) stamp(family, profiles[effective].id);
  }

  let steps = [...profiles[effective].steps];
  if (STEP) {
    steps = steps.filter((s) => s.name === STEP);
    if (!steps.length) { console.error(`ABORT: --step ${STEP} is not a step of "${effective}" (have: ${profiles[effective].steps.map((s) => s.name).join(', ')})`); process.exit(2); }
  }

  const run = (step, extra = []) => {
    log(`\n─── seed:${step.name} (${step.required ? 'required' : 'optional'}) ───`);
    const res = spawnSync('node', [join(ROOT, 'scripts', 'seed-data', step.script), ...(step.args || []), ...extra, ...passthrough], { stdio: 'inherit', env: process.env, cwd: process.cwd() });
    return res.status === 0;
  };
  const summary = (results) => {
    console.log(`\n=== ${family} family summary ===`);
    for (const r of results) console.log(`  ${{ ok: '✓', warn: '⚠', FAILED: '✗' }[r.status] || '?'} seed:${r.name} — ${r.status}`);
  };

  const results = [];
  if (TEARDOWN) {
    for (const step of [...steps].reverse()) results.push({ ...step, status: run(step, ['--teardown']) ? 'ok' : 'warn' });
    const clean = results.every((r) => r.status === 'ok');
    if (!STEP && clean) stamp(family, null);
    else if (!STEP) log(`dataset_profiles.${family} left at "${profiles[effective].id}" — teardown was not clean.`);
    summary(results);
    process.exit(0);
  }
  for (const step of steps) {
    if (run(step)) { results.push({ ...step, status: 'ok' }); continue; }
    if (step.required) { results.push({ ...step, status: 'FAILED' }); summary(results); console.error(`\nABORT: required step seed:${step.name} failed (seeders are idempotent — fix and re-run).`); process.exit(1); }
    results.push({ ...step, status: 'warn' });
  }
  summary(results);
  console.log(results.some((r) => r.status === 'warn') ? '\nFinished with warnings (see above).' : `\n${family} family OK (profile=${effective}).`);
  process.exit(0);
}
