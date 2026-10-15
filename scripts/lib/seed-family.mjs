/**
 * scripts/lib/seed-family.mjs — the shared engine behind a data family's `fixtures | demo` entrypoint.
 *
 * A family runs one of two MUTUALLY EXCLUSIVE step chains on an environment: its AGENT-TEST fixtures
 * or its presentation-grade demo. The two share one surface (an Admin list, a store-wide page), so the
 * engine refuses to seed one over the other and prints the teardown command instead.
 *
 * THE STAMP lives at `_meta.dataset_profiles.<family>` in test-data/aliases.<env>.json, spread into the
 * existing `_meta` so no other family's stamp is touched. Bracketed asymmetrically: stamped BEFORE
 * seeding (a run that dies halfway still blocks the other profile), cleared only AFTER a fully clean
 * teardown (clearing first would unguard a half-swept environment). `--step` never stamps either way:
 * seeding or reverting one step is a repair, not a claim on the environment. Without a writer the
 * guard is dead code, silently — the flag stays null and every check passes.
 *
 * LEGACY STAMP. The sales-rep family predates this engine and stamped a single-valued
 * `_meta.dataset_profile`. Every reader goes through `datasetProfileOf()` / `datasetProfiles()`, which
 * fall back to it, so an environment stamped the old way stays guarded; the next stamp or clear of
 * that family moves it to the new key and drops the old one.
 *
 * WHY spawnSync RATHER THAN IMPORTS. Three properties of the existing seeders, not a style choice:
 *   1. Every seeder calls `main()` at module scope — importing one SEEDS it.
 *   2. `seed-common.mjs` holds a module-level TOKEN, while some seeders mint their own scoped tokens
 *      (the sales-rep tasks / stats / i18n seeders use a storeId password grant) or swap the shared
 *      client via `__setApi()` mid-run. Chaining them in-process cross-contaminates that client — the
 *      `Bearer null` class documented in seed-sales-rep.mjs.
 *   3. seed-bootstrap.mjs already uses exactly this model, so there is one mental model, not two.
 * Children inherit the CALLER's cwd: config.js resolves `.env.local` against it.
 *
 * FLAG COLLISION, handled deliberately. `--only <key>` means a FIXTURE key to every child seeder
 * (`--only ROWCAP`, `--only SR_REP_PRIMARY`), so the engine selects a step with `--step <name>` and
 * forwards `--only` untouched. Overloading `--only` would make `--only ROWCAP` either select no step
 * at all or fan out to every step. `--dry-run`, `--verbose` and `--fresh` are forwarded too;
 * `--skip-optional` runs only the required steps of a seed.
 */

import "./sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, DRY_RUN, TEARDOWN, auth, assertSafeTarget, log } from './seed-common.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
const overlayPath = () => join(ROOT, `test-data/aliases.${TEST_ENV}.json`);

/** Families whose stamp predates `_meta.dataset_profiles`: family → the old `_meta` key. */
const LEGACY_STAMP = Object.freeze({ 'sales-rep': 'dataset_profile' });

function readOverlay() {
  const p = overlayPath();
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

/** Every family's stamp in a parsed overlay, legacy stamps included. */
export function datasetProfiles(overlay) {
  const meta = overlay?._meta || {};
  const out = {};
  for (const [family, key] of Object.entries(LEGACY_STAMP)) if (meta[key]) out[family] = meta[key];
  return { ...out, ...(meta.dataset_profiles || {}) };
}

/** The profile id stamped for `family` in a parsed overlay, or null. */
export const datasetProfileOf = (overlay, family) => datasetProfiles(overlay)[family] || null;

/** The profile id stamped for `family` on this environment, or null. */
export const liveDatasetProfile = (family) => datasetProfileOf(readOverlay(), family);

function stamp(family, value) {
  if (DRY_RUN) { log(`[DRY] would ${value ? `stamp dataset_profiles.${family}=${value}` : `clear dataset_profiles.${family}`}`); return; }
  const cur = readOverlay();
  if (cur === null) { log(`WARN: cannot stamp — aliases.${TEST_ENV}.json is unparsable`); return; }
  const profiles = { ...(cur._meta?.dataset_profiles || {}) };
  if (value) profiles[family] = value; else delete profiles[family];
  const meta = { ...(cur._meta || {}), env: TEST_ENV, dataset_profiles: profiles };
  if (LEGACY_STAMP[family]) delete meta[LEGACY_STAMP[family]];
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
 *                   { name, script (under scripts/seed-data), args?, required }, run in array order
 *   modulePresent — async () => boolean; false ⇒ one skip line, exit 0
 *   beforeDemo    — optional async () => void, run before a demo seed (e.g. warn about live fixtures)
 *   teardownNote  — optional lines printed after a teardown (e.g. what the chain does NOT sweep)
 */
export async function runFamily({ family, npmScript, profiles, modulePresent, beforeDemo, teardownNote = [] }) {
  const argv = process.argv.slice(2);
  const flag = (n) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : null);
  const STEP = flag('--step');
  const PROFILE = (flag('--profile') || 'fixtures').toLowerCase();
  const SKIP_OPTIONAL = argv.includes('--skip-optional');
  const passthrough = ['--dry-run', '--verbose', '--fresh'].filter((a) => argv.includes(a));
  if (argv.includes('--only')) passthrough.push('--only', flag('--only'));

  if (!profiles[PROFILE]) { console.error(`ABORT: --profile must be one of ${Object.keys(profiles).join(' | ')} (got "${PROFILE}").`); process.exit(2); }
  console.log(`=== ${family} family${TEARDOWN ? ' [TEARDOWN]' : ''} — profile=${PROFILE} TEST_ENV=${TEST_ENV}${DRY_RUN ? ' [DRY RUN]' : ''} ===`);
  assertSafeTarget();
  await auth();
  if (modulePresent && !(await modulePresent())) { log(`the ${family} module is not deployed here — nothing to do.`); process.exit(0); }

  // On teardown the STAMP decides which chain to reverse, never the flag: the flag would happily tear
  // down a chain that was never seeded and leave the real one standing.
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
    const script = join(ROOT, 'scripts', 'seed-data', step.script);
    if (!existsSync(script)) { log(`⚠ seed:${step.name} — ${step.script} does not exist; skipped.`); return !step.required; }
    log(`\n─── seed:${step.name} (${step.required ? 'required' : 'optional'}) ───`);
    const res = spawnSync('node', [script, ...(step.args || []), ...extra, ...passthrough], { stdio: 'inherit', env: process.env, cwd: process.cwd() });
    return res.status === 0;
  };
  const summary = (results) => {
    console.log(`\n=== ${family} family summary ===`);
    for (const r of results) console.log(`  ${{ ok: '✓', warn: '⚠', FAILED: '✗', skipped: '·' }[r.status] || '?'} seed:${r.name} — ${r.status}`);
  };

  const results = [];
  if (TEARDOWN) {
    // Best-effort per step: one stuck domain must not block the rest of the clean.
    for (const step of [...steps].reverse()) results.push({ ...step, status: run(step, ['--teardown']) ? 'ok' : 'warn' });
    const clean = results.every((r) => r.status === 'ok');
    if (!STEP && clean) stamp(family, null);
    else if (!STEP) log(`dataset_profiles.${family} left at "${profiles[effective].id}" — teardown was not clean.`);
    summary(results);
    console.log(`\nTeardown complete. Re-seed with \`npm run ${npmScript} -- --profile ${effective}\`.`);
    for (const line of teardownNote) console.log(line);
    process.exit(0);
  }
  for (const step of steps) {
    if (SKIP_OPTIONAL && !step.required) { results.push({ ...step, status: 'skipped' }); continue; }
    if (run(step)) { results.push({ ...step, status: 'ok' }); continue; }
    if (step.required) { results.push({ ...step, status: 'FAILED' }); summary(results); console.error(`\nABORT: required step seed:${step.name} failed (seeders are idempotent — fix and re-run).`); process.exit(1); }
    results.push({ ...step, status: 'warn' });
  }
  summary(results);
  console.log(results.some((r) => r.status === 'warn') ? '\nFinished with warnings (see above).' : `\n${family} family OK (profile=${effective}).`);
  process.exit(0);
}
