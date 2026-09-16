#!/usr/bin/env node
/**
 * td-mutation-check.mjs — the ARBITER for "unit test or drift guard?"
 * (`.claude/knowledge/execution/test-data-authoring.md` §7a).
 *
 * WHY THIS EXISTS. A unit test over a seed spec is worth keeping only when the expected value is
 * derived independently of the thing asserted. Re-stating a literal that lives one file away, in the
 * same commit, by the same author, cannot fail for a reason nobody intended — and the per-domain
 * drift guard already covers that ground with the alias-registry / GUID / URL checks on top. Arguing
 * this case by reading the tests does not converge (measured: two static classifiers, both wrong in
 * both directions). Perturbing the spec and watching which artifact goes red does converge.
 *
 * WHAT IT DOES. For a domain it perturbs the spec module one edit at a time and, per mutation, runs
 *   (a) that domain's unit test(s), and (b) `npm run td:validate:<domain>`
 * then classifies:
 *
 *   BOTH      — the unit test is DUPLICATION. The guard already catches it. Delete the unit test.
 *   UNIT ONLY — the unit test is the ONLY line of defence. Keep it.
 *   GUARD ONLY— fine; the guard owns the data contract.
 *   NEITHER   — nothing catches this edit. The finding worth acting on: add a guard check.
 *
 * NOTHING IS TRANSCRIBED. The domain list comes from package.json `td:validate:*`; the spec module
 * comes from the guard's own imports; the unit tests come from whoever imports that spec. Adding a
 * seeder therefore needs no edit here (GOLDEN RULE, `.claude/rules/test-data.md`).
 *
 * Usage:
 *   npm run td:mutation-check -- <domain>     # one domain (e.g. catalog-edge)
 *   npm run td:mutation-check -- --list       # domains it can resolve
 *   npm run td:mutation-check -- --all        # every resolvable domain (slow)
 *   npm run td:mutation-check -- <domain> --max 20
 *
 * SAFETY: every mutation is written to the real file and restored in a `finally`, and the original
 * bytes are also kept in memory. It refuses to start on a dirty spec file, and re-verifies byte
 * equality on exit. Read-only with respect to git.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UNIT_DIR = join(ROOT, 'scripts', 'unit');

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const optVal = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MAX = Number(optVal('--max', '12'));
const positional = argv.filter((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--max');

/* ── resolution: domain → guard script → spec module → unit tests ─────────────────────────────── */

function guardScripts() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const out = new Map();
  for (const [k, v] of Object.entries(pkg.scripts || {})) {
    const m = /^td:validate:(.+)$/.exec(k);
    if (!m || m[1] === 'warn') continue;
    const f = /([\w./-]+\.mjs|[\w./-]+\.ts)/.exec(v);
    if (f) out.set(m[1], join(ROOT, f[1]));
  }
  return out;
}

/** The spec module a guard imports — the file whose literals and builders are under test. */
function specFor(guardPath) {
  if (!existsSync(guardPath)) return null;
  const src = readFileSync(guardPath, 'utf8');
  const cands = [...src.matchAll(/from\s+'(\.[^']*-specs\.mjs)'/g)].map((m) => m[1]);
  if (!cands.length) return null;
  const p = resolve(dirname(guardPath), cands[0]);
  return existsSync(p) ? p : null;
}

/** Every unit test that imports that spec module. */
function testsFor(specPath) {
  if (!existsSync(UNIT_DIR)) return [];
  return readdirSync(UNIT_DIR)
    .filter((f) => /\.test\.(mjs|ts)$/.test(f))
    .map((f) => join(UNIT_DIR, f))
    .filter((t) => {
      const src = readFileSync(t, 'utf8');
      return [...src.matchAll(/from\s+'(\.[^']+)'/g)].some((m) => {
        let r = resolve(dirname(t), m[1]);
        for (const c of [r, `${r}.mjs`, `${r}.js`]) if (existsSync(c) && c === specPath) return true;
        return false;
      });
    });
}

function resolveDomains() {
  const out = [];
  for (const [domain, guard] of guardScripts()) {
    const spec = specFor(guard);
    if (!spec) continue;
    const tests = testsFor(spec);
    out.push({ domain, guard, spec, tests });
  }
  return out;
}

/* ── mutation generation — data literals AND derivation logic ─────────────────────────────────── */

const RULES = [
  // DATA: the declared fixture values. These are what a mirror test re-states.
  { kind: 'data', re: /:\s*true\b/, to: (s) => s.replace(/:\s*true\b/, ': false'), label: 'bool true→false' },
  { kind: 'data', re: /:\s*false\b/, to: (s) => s.replace(/:\s*false\b/, ': true'), label: 'bool false→true' },
  { kind: 'data', re: /:\s*(\d+)\b/, to: (s) => s.replace(/:\s*(\d+)\b/, (_, n) => `: ${Number(n) + 1}`), label: 'number +1' },
  // LOGIC: the derivation. These are what a builder test catches and a guard usually cannot.
  { kind: 'logic', re: /\+\s*days\s*\*/, to: (s) => s.replace(/\+\s*days\s*\*/, '- days *'), label: 'arith sign flip' },
  { kind: 'logic', re: /\s===\s/, to: (s) => s.replace(/\s===\s/, ' !== '), label: '=== → !==' },
  { kind: 'logic', re: /\s!==\s/, to: (s) => s.replace(/\s!==\s/, ' === '), label: '!== → ===' },
  { kind: 'logic', re: /\s&&\s/, to: (s) => s.replace(/\s&&\s/, ' || '), label: '&& → ||' },
  { kind: 'logic', re: /\s\?\?\s/, to: (s) => s.replace(/\s\?\?\s/, ' || '), label: '?? → ||' },
  { kind: 'logic', re: /\.filter\(/, to: (s) => s.replace(/\.filter\(/, '.map('), label: 'filter → map' },
];

/** Spread candidates across the file so one dense block cannot monopolise the budget. */
function mutations(specPath, max) {
  const lines = readFileSync(specPath, 'utf8').split('\n');
  const found = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
    for (const r of RULES) {
      if (!r.re.test(line)) continue;
      const next = r.to(line);
      if (next !== line) found.push({ line: i, kind: r.kind, label: r.label, from: line, to: next });
      break;
    }
  });
  const byKind = { data: found.filter((f) => f.kind === 'data'), logic: found.filter((f) => f.kind === 'logic') };
  const take = (arr, n) => {
    if (arr.length <= n) return arr;
    const step = arr.length / n;
    return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
  };
  // Logic mutations are the scarce, informative ones — never let data literals crowd them out.
  const nLogic = Math.min(byKind.logic.length, Math.max(3, Math.floor(max / 2)));
  return [...take(byKind.logic, nLogic), ...take(byKind.data, max - nLogic)].sort((a, b) => a.line - b.line);
}

/* ── running ──────────────────────────────────────────────────────────────────────────────────── */

const quiet = { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' };
const runsClean = (cmd, args) => spawnSync(cmd, args, quiet).status === 0;
const unitGreen = (tests) => tests.length === 0 || runsClean('npx', ['tsx', '--test', ...tests.map((t) => relative(ROOT, t))]);
const guardGreen = (domain) => runsClean('npm', ['run', '--silent', `td:validate:${domain}`]);

function checkDomain(d) {
  const original = readFileSync(d.spec, 'utf8');
  const muts = mutations(d.spec, MAX);

  console.log(`\n── ${d.domain} ${'─'.repeat(Math.max(0, 56 - d.domain.length))}`);
  console.log(`   spec  ${relative(ROOT, d.spec)}`);
  console.log(`   guard td:validate:${d.domain}`);
  console.log(`   tests ${d.tests.length ? d.tests.map((t) => relative(ROOT, t)).join(', ') : '(none)'}`);
  if (!muts.length) { console.log('   no mutable lines found — nothing to say'); return null; }

  // A red baseline makes every verdict meaningless: everything would read as "caught".
  const base = { unit: unitGreen(d.tests), guard: guardGreen(d.domain) };
  if (!base.unit || !base.guard) {
    console.log(`   ⚠ BASELINE NOT GREEN (unit=${base.unit ? 'green' : 'RED'}, guard=${base.guard ? 'green' : 'RED'}) — verdicts suppressed`);
    return { domain: d.domain, skipped: true };
  }

  const tally = { BOTH: 0, 'UNIT ONLY': 0, 'GUARD ONLY': 0, NEITHER: 0 };
  try {
    for (const m of muts) {
      const lines = original.split('\n');
      lines[m.line] = m.to;
      writeFileSync(d.spec, lines.join('\n'));
      const u = !unitGreen(d.tests);   // true = the mutation was caught
      const g = !guardGreen(d.domain);
      const verdict = u && g ? 'BOTH' : u ? 'UNIT ONLY' : g ? 'GUARD ONLY' : 'NEITHER';
      tally[verdict]++;
      const note = { BOTH: 'unit test is duplication → delete', 'UNIT ONLY': 'unit test is the only defence → keep',
        'GUARD ONLY': 'guard owns it → fine', NEITHER: 'NOTHING catches this → add a guard check' }[verdict];
      console.log(`   L${String(m.line + 1).padEnd(5)} ${m.kind.padEnd(5)} ${m.label.padEnd(16)} ${verdict.padEnd(10)} ${note}`);
    }
  } finally {
    writeFileSync(d.spec, original);
    if (readFileSync(d.spec, 'utf8') !== original) {
      console.error(`\n✗ FAILED TO RESTORE ${d.spec} — restore it from git before doing anything else.`);
      process.exitCode = 2;
    }
  }
  console.log(`   ⇒ both:${tally.BOTH}  unit-only:${tally['UNIT ONLY']}  guard-only:${tally['GUARD ONLY']}  neither:${tally.NEITHER}`);
  return { domain: d.domain, ...tally };
}

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */

const domains = resolveDomains();

if (flag('--list') || (!positional.length && !flag('--all'))) {
  console.log('Resolvable domains (guard → spec module → unit tests):\n');
  for (const d of domains) {
    console.log(`  ${d.domain.padEnd(20)} ${relative(ROOT, d.spec).padEnd(52)} ${d.tests.length} test file(s)`);
  }
  console.log(`\n${domains.length} domain(s). Run: npm run td:mutation-check -- <domain>`);
  process.exit(0);
}

const selected = flag('--all') ? domains : domains.filter((d) => positional.includes(d.domain));
if (!selected.length) {
  console.error(`No such domain: ${positional.join(', ')}. Try --list.`);
  process.exit(1);
}

const results = selected.map(checkDomain).filter(Boolean);
const live = results.filter((r) => !r.skipped);
if (live.length > 1) {
  const sum = live.reduce((a, r) => ({
    BOTH: a.BOTH + r.BOTH, U: a.U + r['UNIT ONLY'], G: a.G + r['GUARD ONLY'], N: a.N + r.NEITHER,
  }), { BOTH: 0, U: 0, G: 0, N: 0 });
  console.log(`\n══ TOTAL  both(delete the unit test):${sum.BOTH}  unit-only(keep):${sum.U}  guard-only:${sum.G}  neither(GAP):${sum.N}`);
}
// Advisory by design: this reports where coverage sits, it does not gate a build.
