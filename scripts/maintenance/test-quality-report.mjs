#!/usr/bin/env node
/**
 * test-quality-report.mjs — measure whether each unit test would NOTICE its subject breaking.
 *
 * THE METRIC: IFDR — Imported-Function Detection Rate.
 *   For every function a test file IMPORTS from a repo module, replace that function's body with
 *   `return undefined;`, one at a time, and re-run only that test file. IFDR = detected / gutted.
 *   A test that stays green while a function it imported has been gutted does not test that function.
 *
 * WHY NOT OPERATOR MUTATION (===→!==, &&→||, …). It was tried first and it measures the operators,
 * not the tests. Two measured failures: `hooks/redact.mjs` is almost entirely regex literals, so the
 * sampler produced ONE mutant and scored a good security test 0%; and spreading a fixed budget over
 * every import scored `ui-step-parser.test.ts` at 13% because half the mutants landed in a 688-line
 * module it uses for one helper (50% once aimed at its real subject). Hand-written semantic mutations
 * of the same redaction rules — neutering `redact()`, passthrough on the AWS-key replacement — were
 * both CAUGHT. Gutting an imported function is semantic by construction, so it does not have that
 * failure mode.
 *
 * WHY "IMPORTED" AND NOT "EXPORTED". Scoping to a module's exported surface reproduces the same
 * artefact one level up: `pick-baseline-tag.test.mjs` legitimately owns ONE function of a 12-function
 * `discover-repos.mjs` and scored 2/12. A test is only answerable for what it took a dependency on.
 *
 * READING IT — a low IFDR is a QUESTION, not a verdict:
 *   100%  every imported function is exercised such that gutting it is noticed.
 *   < 100% the named functions are imported but never meaningfully asserted on — often a helper
 *         pulled in for setup, which is legitimate. Read the file before concluding.
 *   n/a   nothing importable/guttable resolved (fixtures, dynamic imports, arrow-function exports).
 *
 * Known blind spots, stated rather than discovered later: arrow-function exports
 * (`export const f = () => …`) are not gutted, only `export function` declarations; a function whose
 * return value is never used but whose side effects are asserted may read as detected for the wrong
 * reason; and dynamic `await import()` subjects are invisible to the import scan.
 *
 * SAFETY: every edit is restored in a `finally` AND on SIGINT/SIGTERM/SIGHUP/exit, with a byte-compare
 * afterwards. Subjects already dirty in git are skipped.
 *
 * Usage:
 *   npm run test:quality                       # whole corpus (slow; background it)
 *   npm run test:quality -- --file redact.test.mjs
 *   npm run test:quality -- --json out.json
  */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UNIT = join(ROOT, 'scripts', 'unit');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MAX = Number(opt('--max', '8'));
const ONLY = opt('--file', null);
const JSON_OUT = opt('--json', null);

const SKIP_SUBJECT = /_test-helpers|\/fixtures\//;

/** {symbol -> absolute module path} for every repo symbol a test file imports. */
function importedSymbols(testPath) {
  const src = readFileSync(testPath, 'utf8');
  const map = new Map();
  // Both quote styles: the .mjs tests single-quote, the .ts tests double-quote. Matching only one
  // silently scored every TypeScript test file as having no subject.
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"](\.[^'"]+)['"]/g)) {
    const r = resolve(dirname(testPath), m[2]);
    const hit = [r, `${r}.mjs`, `${r}.ts`, `${r}.js`].find((c) => existsSync(c) && /\.(mjs|ts|js)$/.test(c));
    if (!hit || SKIP_SUBJECT.test(hit) || !hit.startsWith(ROOT)) continue;
    for (const sym of m[1].split(',').map((x) => x.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)) {
      map.set(sym, hit);
    }
  }
  return map;
}

/** Replace the body of `export function <name>` with `return undefined;`. Null if not found. */
function gut(srcText, fnName) {
  const lines = srcText.split('\n');
  const i = lines.findIndex((l) => new RegExp(`^export\\s+(?:async\\s+)?function\\s+${fnName}\\b`).test(l));
  if (i < 0) return null;
  let j = i;
  while (j < lines.length && lines[j] !== '}') j++;
  if (j >= lines.length || j <= i) return null;
  const out = [...lines];
  out.splice(i + 1, j - i - 1, '  return undefined;');
  return out.join('\n');
}

const isDirty = (f) => spawnSync('git', ['diff', '--quiet', '--', relative(ROOT, f)], { cwd: ROOT }).status !== 0;
const runs = (testFile) => spawnSync('npx', ['tsx', '--test', relative(ROOT, testFile)],
  { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32', timeout: 180000 }).status === 0;

const testFiles = readdirSync(UNIT).filter((f) => /\.test\.(mjs|ts)$/.test(f))
  .filter((f) => !ONLY || f === ONLY || f.includes(ONLY)).map((f) => join(UNIT, f));
if (!testFiles.length) { console.error(`no test file matches ${ONLY}`); process.exit(1); }

console.log(`test:quality — imported-function detection rate over ${testFiles.length} test file(s)\n`);

const rows = [];
for (const tf of testFiles) {
  const name = basename(tf);
  const syms = importedSymbols(tf);
  if (!syms.size) { rows.push({ name, ifdr: null, note: 'no repo imports' }); continue; }

  // Which imported symbols are actually guttable `export function` declarations?
  const work = [];
  const originals = new Map();
  for (const [sym, mod] of syms) {
    if (isDirty(mod)) continue;
    if (!originals.has(mod)) originals.set(mod, readFileSync(mod, 'utf8'));
    if (gut(originals.get(mod), sym)) work.push({ sym, mod });
  }
  if (!work.length) { rows.push({ name, ifdr: null, note: 'no guttable exported functions (arrow exports / dynamic import)' }); continue; }
  if (!runs(tf)) { rows.push({ name, ifdr: null, note: 'BASELINE RED' }); continue; }

  let restored = false;
  const restore = () => { if (restored) return; restored = true; for (const [f, t] of originals) { try { writeFileSync(f, t); } catch {} } };
  const onSig = () => { restore(); process.exit(130); };
  for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.once(sig, onSig);
  process.once('exit', restore);

  let detected = 0; const missed = [];
  try {
    for (const w of work.slice(0, 25)) {
      writeFileSync(w.mod, gut(originals.get(w.mod), w.sym));
      if (runs(tf)) missed.push(w.sym); else detected++;
      writeFileSync(w.mod, originals.get(w.mod));
    }
  } finally {
    restore(); restored = false;
    for (const [f, t] of originals) {
      if (readFileSync(f, 'utf8') !== t) { console.error(`\n✗ FAILED TO RESTORE ${f} — git checkout it now.`); process.exit(2); }
    }
    for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.removeListener(sig, onSig);
  }
  const n = Math.min(work.length, 25);
  const ifdr = Math.round((detected / n) * 100);
  rows.push({ name, ifdr, gutted: n, detected, missed });
  console.log(`  ${String(ifdr).padStart(3)}%  ${String(detected).padStart(2)}/${String(n).padEnd(2)}  ${name}${missed.length ? `   undetected: ${missed.slice(0, 5).join(', ')}` : ''}`);
}

const scored = rows.filter((r) => r.ifdr !== null);
scored.sort((a, b) => a.ifdr - b.ifdr);
console.log('\n── WEAKEST (lowest imported-function detection — a question, not a verdict) ──');
for (const r of scored.slice(0, 20)) {
  console.log(`  ${String(r.ifdr).padStart(3)}%  ${r.detected}/${r.gutted}  ${r.name}   undetected: ${(r.missed || []).slice(0, 6).join(', ')}`);
}
const avg = scored.length ? Math.round(scored.reduce((a, r) => a + r.ifdr, 0) / scored.length) : 0;
console.log(`\n${scored.length} scored · mean IFDR ${avg}% · ${scored.filter((r) => r.ifdr === 100).length} at 100% · `
  + `${scored.filter((r) => r.ifdr === 0).length} at 0% · ${rows.length - scored.length} unscored`);
if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify(rows, null, 2)); console.log(`→ ${JSON_OUT}`); }
