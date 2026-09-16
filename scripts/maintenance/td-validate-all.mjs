#!/usr/bin/env node
/**
 * td-validate-all.mjs — run EVERY per-domain test-data drift guard and report as one gate.
 *
 * WHY THIS EXISTS (2026-09-15). The repo declares 24 `td:validate:<domain>` guards and, until this
 * file, wired NONE of them into a workflow — `gates.yml` ran only the generic `td:validate` (the
 * @td()-resolver check). So the strongest check the repo owns over its fixture data ran exactly when
 * a human remembered to type it. That is the same finding `unit-tests.yml` was created for, one
 * directory over: a guard nobody runs is a comment.
 *
 * It matters more than it looks, because the guards are what make the unit-test ROI rule safe. Once
 * `test-data-authoring.md` §7a tells an author NOT to unit-test declared fixture data, the drift
 * guard is the only thing left covering it — so it has to actually run.
 *
 * The domain list is DERIVED from package.json, never transcribed here: adding a seeder + its guard
 * enrolls it automatically (GOLDEN RULE, `.claude/rules/test-data.md`).
 *
 * Usage:  npm run td:validate:all          # exits 1 on any unexpected red
 *         npm run td:validate:all -- --warn-only
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const WARN_ONLY = process.argv.includes('--warn-only');

/**
 * Guards that are RED on a clean checkout today. Listed — not silently skipped — so the gate can be
 * switched on without hiding the failures it would otherwise mask. Each entry states what is wrong
 * and where it is tracked; emptying this list is the goal.
 */
const KNOWN_RED = new Map([
  ['missions-e2e',
    'Reward-value collision in tracked test-data/aliases.vcst.json: MSN_E2E_ORDERCOUNT (501 PTS) and '
    + 'MSN_E2E_ORDERVALUE_008 (508 PTS) each tie with a leftover AGENT-TEST-MSN-E2E-2026-09-10 mission '
    + 'that the seed measured as co-granting on the same order, so MSN-E2E-001/008 cannot show that '
    + 'THIS mission paid out. Fixture-owner decision (needs a reward no co-granting mission carries) — '
    + 'docs/repo-findings-backlog.md B-46.'],
]);

const domains = (() => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  return Object.keys(pkg.scripts || {})
    .map((k) => /^td:validate:(.+)$/.exec(k)?.[1])
    .filter((d) => d && !['warn', 'all'].includes(d))
    .sort();
})();

console.log(`td:validate:all — ${domains.length} per-domain drift guard(s)\n`);

const failed = [], knownRed = [];
for (const d of domains) {
  const r = spawnSync('npm', ['run', '--silent', `td:validate:${d}`], {
    cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32',
  });
  const green = r.status === 0;
  const expectedRed = KNOWN_RED.has(d);
  let mark;
  if (green) mark = '  ✓';
  else if (expectedRed) { mark = '  ⚠'; knownRed.push(d); }
  else { mark = '  ✗'; failed.push({ d, out: (r.stdout || r.stderr || '').trim() }); }
  console.log(`${mark} ${d}${green && expectedRed ? '   (KNOWN_RED but PASSING — remove it from the list)' : ''}`);
}

if (knownRed.length) {
  console.log(`\n⚠ ${knownRed.length} known-red guard(s) — tracked, not gating:`);
  for (const d of knownRed) console.log(`   • ${d}: ${KNOWN_RED.get(d)}`);
}

if (failed.length) {
  console.log(`\n✗ ${failed.length} guard(s) failed:\n`);
  for (const f of failed) {
    console.log(`── td:validate:${f.d}`);
    console.log(f.out.split('\n').slice(-25).map((l) => `   ${l}`).join('\n'));
  }
  if (!WARN_ONLY) process.exit(1);
}

console.log(`\n${domains.length - failed.length - knownRed.length}/${domains.length} green`
  + `${knownRed.length ? `, ${knownRed.length} known-red` : ''}`
  + `${failed.length ? `, ${failed.length} FAILED` : ''}`);
