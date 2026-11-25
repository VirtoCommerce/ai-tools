#!/usr/bin/env node
// scripts/maintenance/sync-env-loader.mjs — the env loader is ONE set of files; every plugin carries a byte-identical copy.
//
// A plugin never imports from the repo root or from another plugin (plugins/CLAUDE.md), so the loader is copied into
// each one. Copies kept "in step by hand" drifted within weeks — the vc-init loader lost QA_ENV_PATH, the session
// binding and the master stand; vc-fix's grew legacy layers the repo's lacked. This script owns the copies:
//
//   npm run env:sync          copy every source over its copies
//   npm run env:sync:check    exit 1 when a copy differs from its source (gates.yml) — never writes
//
// Edit the SOURCE, never a copy. The sources and where each one goes are SYNC below.
import '../lib/sync-stdio.mjs';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PLUGINS = ['vc-fix', 'vc-test', 'vc-init'];
const plugin = (p, f) => `plugins/${p}/scripts/lib/${f}`;

/** source → copies. The layers live in the repo's scripts/lib/; the plugins' load wrapper lives in vc-fix. */
export const SYNC = [
  ...['env-layers.mjs', 'env-layers.d.mts', 'resolve-test-env.js', 'resolve-test-env.d.ts', 'run-dir.mjs', 'run-dir.d.mts', 'test-accounts.mjs', 'persona-sets.mjs', 'persona-sets.d.mts']
    .map((f) => ({ source: `scripts/lib/${f}`, copies: PLUGINS.map((p) => plugin(p, f)) })),
  ...['env-check.mjs', 'env-check.d.mts'].map((f) => ({ source: `scripts/lib/${f}`, copies: [plugin('vc-fix', f)] })),
  { source: plugin('vc-fix', 'load-layered-env.mjs'), copies: PLUGINS.filter((p) => p !== 'vc-fix').map((p) => plugin(p, 'load-layered-env.mjs')) },
];

const check = process.argv.includes('--check');
const drifted = [];
let written = 0;
// Compared and written with LF line endings: a Windows checkout may hold a file as CRLF (some copies are pinned
// eol=lf, the sources are not), and git stores both as LF — a line-ending difference is not drift.
const lf = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
for (const { source, copies } of SYNC) {
  const want = lf(join(ROOT, source));
  for (const copy of copies) {
    const path = join(ROOT, copy);
    if (existsSync(path) && lf(path) === want) continue;
    if (check) { drifted.push(`${copy}  ≠  ${source}`); continue; }
    writeFileSync(path, want);
    written++;
  }
}
if (check) {
  if (drifted.length) {
    console.error(`[env:sync] ${drifted.length} env-loader cop${drifted.length === 1 ? 'y differs' : 'ies differ'} from the source:\n  ${drifted.join('\n  ')}\nEdit the source, then run: npm run env:sync`);
    process.exit(1);
  }
  console.log(`[env:sync] every env-loader copy matches its source (${SYNC.reduce((n, s) => n + s.copies.length, 0)} copies)`);
} else {
  console.log(`[env:sync] ${written} cop${written === 1 ? 'y' : 'ies'} written`);
}
