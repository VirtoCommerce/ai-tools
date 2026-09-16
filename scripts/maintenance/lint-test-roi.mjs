#!/usr/bin/env node
/**
 * lint-test-roi.mjs — enforce RULE 1, "NO CODE ⇒ NO UNIT TEST"
 * (`.claude/knowledge/execution/when-to-write-a-test.md`).
 *
 * WHY. The rule was previously prose in an agent prompt, and prose that only an agent reads is
 * advisory. This makes the cheap half executable: a change that ships no executable behaviour may not
 * add a `scripts/unit/` test file. It deliberately does NOT try to judge test QUALITY — that needs
 * mutation evidence (`td:test-attribution`) and is not a build-time question.
 *
 * WHAT IT CHECKS, on the diff against a base ref:
 *   1. NEW unit-test file added, while the diff touches NO executable source → FAIL. The change is a
 *      prompt / CSV / manifest / doc edit, and its gate is context:check / suites:lint /
 *      td:validate:<domain> / bl:lint, not a second copy in the test runner.
 *   2. NEW unit-test file added whose only repo imports are `*-specs.mjs` declarative spec modules
 *      that already have a `td:validate:<domain>` guard → FAIL. That coverage belongs in the guard.
 *
 * ESCAPE HATCH, because backfilling coverage for PRE-EXISTING code is legitimate and this check
 * cannot see intent: put a line in the new test file's header —
 *
 *   // test-roi: backfill — <why this cannot live in a drift guard>
 *
 * It is a declaration, not a mute: it names the author's reason in the file a reviewer opens first.
 *
 * Exit 2 (not 1) when the base ref is unreachable — a fact about the checkout, never about the change.
 *
 * Usage:  npm run test:roi-check [-- --base origin/main]
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const BASE = opt('--base', process.env.GITHUB_BASE_REF ? `origin/${process.env.GITHUB_BASE_REF}` : 'origin/main');

const git = (...a) => spawnSync('git', a, { cwd: ROOT, encoding: 'utf8' });

if (git('rev-parse', '--verify', '--quiet', BASE).status !== 0) {
  console.log(`test:roi-check — base ref '${BASE}' not available; skipping (checkout fact, not a change fact)`);
  process.exit(2);
}
const mergeBase = git('merge-base', BASE, 'HEAD').stdout.trim() || BASE;
const changed = git('diff', '--name-status', `${mergeBase}...HEAD`).stdout
  .split('\n').filter(Boolean)
  .map((l) => { const [status, ...rest] = l.split(/\t/); return { status: status[0], path: rest[rest.length - 1] }; });

if (!changed.length) { console.log('test:roi-check — no changes'); process.exit(0); }

const isUnitTest = (p) => /^scripts\/unit\/.+\.test\.(mjs|ts)$/.test(p);
const isExecutable = (p) => /\.(mjs|ts|js|cjs)$/.test(p) && !isUnitTest(p) && !p.startsWith('node_modules/');

const addedTests = changed.filter((c) => c.status === 'A' && isUnitTest(c.path)).map((c) => c.path);
const touchedCode = changed.filter((c) => isExecutable(c.path)).map((c) => c.path);

console.log(`test:roi-check — base ${BASE} · ${changed.length} changed file(s), `
  + `${addedTests.length} new unit test(s), ${touchedCode.length} executable source file(s)\n`);

if (!addedTests.length) { console.log('  ✓ no new unit tests — nothing to judge'); process.exit(0); }

/** Guarded declarative spec modules: the domains whose data a drift guard already owns. */
const guardedSpecs = (() => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const out = new Set();
  for (const [k, v] of Object.entries(pkg.scripts || {})) {
    if (!/^td:validate:/.test(k)) continue;
    const f = /([\w./-]+\.(?:mjs|ts))/.exec(v)?.[1];
    if (!f || !existsSync(join(ROOT, f))) continue;
    for (const m of readFileSync(join(ROOT, f), 'utf8').matchAll(/from\s+'(\.[^']*-specs\.mjs)'/g)) {
      out.add(resolve(dirname(join(ROOT, f)), m[1]));
    }
  }
  return out;
})();

const problems = [];
let exempt = 0;
for (const t of addedTests) {
  const abs = join(ROOT, t);
  if (!existsSync(abs)) continue;
  const src = readFileSync(abs, 'utf8');
  if (/^\s*\/\/\s*test-roi:\s*backfill\b/m.test(src)) {
    console.log(`  ⚠ ${t} — declared \`test-roi: backfill\`, exempt`);
    exempt++;
    continue;
  }
  // (1) no executable source in the diff at all
  if (!touchedCode.length) {
    problems.push(`${t}\n      NEW unit test, but this change ships NO executable source. RULE 1: a prompt / `
      + `knowledge / suite-CSV / manifest / doc change is gated by context:check, suites:lint, `
      + `td:validate:<domain> or bl:lint — not by a unit test. Delete it, or declare `
      + `\`// test-roi: backfill — <reason>\` if it covers pre-existing code.`);
    continue;
  }
  // (2) imports only guarded declarative spec modules
  const imports = [...src.matchAll(/from\s+'(\.[^']+)'/g)].map((m) => {
    const r = resolve(dirname(abs), m[1]);
    return [r, `${r}.mjs`, `${r}.ts`, `${r}.js`].find((c) => existsSync(c)) || r;
  }).filter((p) => p.startsWith(ROOT));
  if (imports.length && imports.every((p) => guardedSpecs.has(p))) {
    problems.push(`${t}\n      NEW unit test whose only repo imports are declarative spec module(s) already `
      + `owned by a td:validate:<domain> drift guard. RULE 3: that coverage belongs in the guard, which `
      + `also sees seeded state and checks the alias registry / GUID leaks / URL shapes. `
      + `Verify with: npm run td:test-attribution -- <domain>`);
  }
}

if (!problems.length) {
  const judged = addedTests.length - exempt;
  console.log(judged
    ? `  ✓ ${judged} new unit test(s) accompany executable source${exempt ? `; ${exempt} exempt` : ''}`
    : `  ✓ all ${exempt} new unit test(s) declared \`test-roi: backfill\` — nothing left to judge`);
  process.exit(0);
}

console.log(`  ✗ ${problems.length} problem(s):\n`);
for (const p of problems) console.log(`    • ${p}\n`);
console.log('  Rule: .claude/knowledge/execution/when-to-write-a-test.md');
process.exit(1);
