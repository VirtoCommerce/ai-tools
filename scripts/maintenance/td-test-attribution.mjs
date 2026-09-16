#!/usr/bin/env node
/**
 * td-test-attribution.mjs — decide, PER TEST, whether it earns its place.
 *
 * `td-mutation-check.mjs` answers "does this DOMAIN have duplication?". That is not enough to delete
 * anything: it reports per mutation, and a file mixes redundant and irreplaceable tests. This script
 * closes that gap by attributing every mutation to the individual test(s) that caught it.
 *
 * METHOD. For each mutation of the spec module: apply it, run the domain's unit tests capturing the
 * NAMES of the tests that fail (TAP `not ok N - <name>`), run the drift guard, restore. That yields,
 * per test:
 *
 *   catches[]        — the mutations this test detects
 *   uniqueCatches[]  — those the drift guard MISSED
 *
 * VERDICTS
 *   KEEP      — uniqueCatches > 0. The only thing standing between a wrong derivation and a green run.
 *   DELETE    — catches > 0 but uniqueCatches == 0. Everything it detects, `td:validate:<domain>`
 *               detects too, with the alias-registry / GUID / URL checks on top. Duplication.
 *   UNPROVEN  — catches == 0. This mutation set never reached it. NOT a delete verdict: absence of
 *               evidence is not evidence of absence, and the mutation operators here are a sample,
 *               not a proof. Reported for a human to look at, never cut automatically.
 *
 * The asymmetry is deliberate. A wrong KEEP costs some duplicated bytes; a wrong DELETE removes the
 * only detector of a silent seeding bug. So only DELETE is acted on, and only with catches > 0 —
 * i.e. we delete a test only after watching something else catch everything it catches.
 *
 * Usage:  node scripts/maintenance/td-test-attribution.mjs <domain> [--max 40] [--json <path>]
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const UNIT_DIR = join(ROOT, 'scripts', 'unit');
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const MAX = Number(opt('--max', '40'));
const JSON_OUT = opt('--json', null);
const domainArg = argv.find((a) => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--max' && argv[argv.indexOf(a) - 1] !== '--json');

/* ── resolution (same derivation as td-mutation-check: nothing transcribed) ────────────────────── */

function resolveDomain(domain) {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const cmd = pkg.scripts?.[`td:validate:${domain}`];
  if (!cmd) throw new Error(`no td:validate:${domain} script`);
  const guard = join(ROOT, /([\w./-]+\.(?:mjs|ts))/.exec(cmd)[1]);
  const specRel = [...readFileSync(guard, 'utf8').matchAll(/from\s+'(\.[^']*-specs\.mjs)'/g)].map((m) => m[1])[0];
  if (!specRel) throw new Error(`${domain}: guard imports no *-specs.mjs`);
  const spec = resolve(dirname(guard), specRel);
  const tests = readdirSync(UNIT_DIR).filter((f) => /\.test\.(mjs|ts)$/.test(f)).map((f) => join(UNIT_DIR, f))
    .filter((t) => [...readFileSync(t, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)].some((m) => {
      const r = resolve(dirname(t), m[1]);
      return [r, `${r}.mjs`, `${r}.js`].some((c) => existsSync(c) && c === spec);
    }));
  return { domain, guard, spec, tests };
}

const RULES = [
  { kind: 'data', re: /:\s*true\b/, to: (s) => s.replace(/:\s*true\b/, ': false'), label: 'bool true→false' },
  { kind: 'data', re: /:\s*false\b/, to: (s) => s.replace(/:\s*false\b/, ': true'), label: 'bool false→true' },
  { kind: 'data', re: /:\s*(\d+)\b/, to: (s) => s.replace(/:\s*(\d+)\b/, (_, n) => `: ${Number(n) + 1}`), label: 'number +1' },
  { kind: 'data', re: /:\s*'([^']{2,})'/, to: (s) => s.replace(/:\s*'([^']{2,})'/, (_, v) => `: '${v}X'`), label: 'string mutate' },
  { kind: 'logic', re: /\+\s*days\s*\*/, to: (s) => s.replace(/\+\s*days\s*\*/, '- days *'), label: 'arith sign flip' },
  { kind: 'logic', re: /\s===\s/, to: (s) => s.replace(/\s===\s/, ' !== '), label: '=== → !==' },
  { kind: 'logic', re: /\s!==\s/, to: (s) => s.replace(/\s!==\s/, ' === '), label: '!== → ===' },
  { kind: 'logic', re: /\s&&\s/, to: (s) => s.replace(/\s&&\s/, ' || '), label: '&& → ||' },
  { kind: 'logic', re: /\s\?\?\s/, to: (s) => s.replace(/\s\?\?\s/, ' || '), label: '?? → ||' },
  { kind: 'logic', re: /\.filter\(/, to: (s) => s.replace(/\.filter\(/, '.map('), label: 'filter → map' },
  { kind: 'logic', re: /\.every\(/, to: (s) => s.replace(/\.every\(/, '.some('), label: 'every → some' },
  { kind: 'logic', re: />=/, to: (s) => s.replace(/>=/, '>'), label: '>= → >' },
];

function mutations(spec, max) {
  const lines = readFileSync(spec, 'utf8').split('\n');
  const found = [];
  lines.forEach((line, i) => {
    const t = line.trim();
    if (!t || t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
    for (const r of RULES) {
      if (!r.re.test(line)) continue;
      const next = r.to(line);
      if (next !== line) found.push({ line: i, kind: r.kind, label: r.label, to: next });
      break;
    }
  });
  const byKind = { logic: found.filter((f) => f.kind === 'logic'), data: found.filter((f) => f.kind === 'data') };
  const take = (a, n) => (a.length <= n ? a : Array.from({ length: n }, (_, i) => a[Math.floor(i * (a.length / n))]));
  const nLogic = Math.min(byKind.logic.length, Math.max(4, Math.floor(max * 0.5)));
  return [...take(byKind.logic, nLogic), ...take(byKind.data, max - nLogic)].sort((a, b) => a.line - b.line);
}

/** Names of the tests that FAILED, from the node test runner's TAP stream. */
function failingTests(tests) {
  const r = spawnSync('npx', ['tsx', '--test', ...tests.map((t) => relative(ROOT, t))],
    { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024 });
  const out = `${r.stdout || ''}\n${r.stderr || ''}`;
  const names = new Set();
  for (const m of out.matchAll(/^not ok \d+ - (.+?)\s*$/gm)) {
    const n = m[1].trim();
    // Suite-level roll-ups repeat a child's failure; keep leaf names only.
    if (!/\.test\.(mjs|ts)$/.test(n)) names.add(n);
  }
  return { failed: r.status !== 0, names };
}

const guardCatches = (domain) =>
  spawnSync('npm', ['run', '--silent', `td:validate:${domain}`],
    { cwd: ROOT, stdio: 'ignore', shell: process.platform === 'win32' }).status !== 0;

/* ── main ─────────────────────────────────────────────────────────────────────────────────────── */

if (!domainArg) { console.error('usage: td-test-attribution.mjs <domain> [--max N] [--json path]'); process.exit(1); }
const d = resolveDomain(domainArg);

// A domain with no unit tests has nothing to attribute — and `tsx --test` with an EMPTY path list
// does not no-op, it walks the whole repo and runs the entire suite, once per mutation. That turned a
// 5-minute probe into an unbounded one on `cfg`/`review-variants` (both correctly test-free).
if (!d.tests.length) {
  console.log(`\n── ${d.domain}: no unit tests — td:validate:${d.domain} already owns this domain outright. Nothing to attribute.`);
  process.exit(0);
}

const original = readFileSync(d.spec, 'utf8');
const muts = mutations(d.spec, MAX);

// A `finally` does not run when the process is killed, and a half-applied mutation left on disk is a
// corrupted spec module in the working tree. Restore on the way out, however we leave.
let restored = false;
const restore = () => { if (!restored) { restored = true; try { writeFileSync(d.spec, original); } catch { /* best effort */ } } };
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { restore(); process.exit(130); });
process.on('exit', restore);

console.log(`\n── ${d.domain}`);
console.log(`   spec  ${relative(ROOT, d.spec)}`);
console.log(`   tests ${d.tests.map((t) => relative(ROOT, t)).join(', ') || '(none)'}`);
console.log(`   ${muts.length} mutation(s)\n`);

const base = failingTests(d.tests);
if (base.failed || !guardCatches(d.domain) === false) { /* guard green check below */ }
if (base.failed) { console.error('   ✗ baseline unit tests are RED — fix before attributing'); process.exit(2); }
if (guardCatches(d.domain)) { console.error('   ✗ baseline guard is RED — fix before attributing'); process.exit(2); }

const perTest = new Map();   // test name -> { catches, unique }
const note = (name, unique) => {
  const e = perTest.get(name) || { catches: 0, unique: 0 };
  e.catches++; if (unique) e.unique++;
  perTest.set(name, e);
};

try {
  muts.forEach((m, i) => {
    const lines = original.split('\n');
    lines[m.line] = m.to;
    writeFileSync(d.spec, lines.join('\n'));
    const u = failingTests(d.tests);
    const g = guardCatches(d.domain);
    for (const n of u.names) note(n, !g);
    process.stdout.write(`\r   probing ${i + 1}/${muts.length} …`);
  });
} finally {
  restore();
  if (readFileSync(d.spec, 'utf8') !== original) {
    console.error(`\n✗ FAILED TO RESTORE ${d.spec} — restore from git before anything else.`);
    process.exit(2);
  }
}
process.stdout.write('\r                              \r');

// Every test declared in the domain's files, so UNPROVEN ones are visible rather than absent.
const declared = new Map();
for (const t of d.tests) {
  for (const m of readFileSync(t, 'utf8').matchAll(/^\s*(?:test|it)\(\s*(['"`])([\s\S]*?)\1/gm)) {
    declared.set(m[2].replace(/\\'/g, "'"), relative(ROOT, t));
  }
}

const rows = [...declared].map(([name, file]) => {
  const e = perTest.get(name) || { catches: 0, unique: 0 };
  const verdict = e.unique > 0 ? 'KEEP' : e.catches > 0 ? 'DELETE' : 'UNPROVEN';
  return { name, file, ...e, verdict };
});
const order = { DELETE: 0, KEEP: 1, UNPROVEN: 2 };
rows.sort((a, b) => order[a.verdict] - order[b.verdict] || b.catches - a.catches);

for (const r of rows) {
  if (r.verdict === 'UNPROVEN') continue;
  console.log(`   ${r.verdict.padEnd(9)} catches=${String(r.catches).padEnd(3)} unique=${String(r.unique).padEnd(3)} ${r.name.slice(0, 96)}`);
}
const c = (v) => rows.filter((r) => r.verdict === v).length;
console.log(`\n   ⇒ DELETE ${c('DELETE')} · KEEP ${c('KEEP')} · UNPROVEN ${c('UNPROVEN')} (not cut — mutation set never reached them)`);

if (JSON_OUT) { writeFileSync(JSON_OUT, JSON.stringify({ domain: d.domain, tests: d.tests.map((t) => relative(ROOT, t)), rows }, null, 2)); console.log(`   → ${JSON_OUT}`); }
