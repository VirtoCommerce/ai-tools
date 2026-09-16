#!/usr/bin/env node
/**
 * Replay the archived tool logs through the arrival matcher.
 *
 *   node measurements/kb-arrival-2026-09/replay-logs.mjs [--base <path>]
 *
 * Answers one question per run: how often would the base have handed the agent something, at the
 * moment it touched a coordinate, without being asked?
 *
 * The column that matters is the second one. An entry is only counted as help if it EXISTED BEFORE
 * THE RUN STARTED -- otherwise every run appears to be helped by answers it wrote itself, which is
 * the same self-confirmation that made the seeded corpus meaningless in the first place. Derived
 * entries count as pre-existing: the plane is regenerated from the deployment and was there.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildArrivalIndex, arrivalsFor, textOf } from '../../src/arrive.mjs';
import { CAPTURED_DIR } from '../../src/planes.mjs';

const HERE = fileURLToPath(new URL('../..', import.meta.url));
const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : (process.env.KB_BASE ?? 'C:/_VIRTO/vc-knowledge');

const RUNS = [
  ['run 01', 'run-01-promotions', 'promotions, REST driven by curl'],
  ['run 02', 'run-02-order-discount', 'discount to checkout, browser against GraphQL'],
  ['run 03', 'run-03-org-roles', 'organization roles, browser UI'],
];

// When each captured entry was first observed. The frontmatter's evidence row is the only honest
// answer: a file's mtime says when this checkout was written, not when the fact was recorded.
const bornAt = new Map();
const capturedDir = join(base, CAPTURED_DIR);
if (existsSync(capturedDir)) {
  for (const f of readdirSync(capturedDir)) {
    if (!f.endsWith('.md')) continue;
    const m = readFileSync(join(capturedDir, f), 'utf8').match(/^ *at: (.*)$/m);
    bornAt.set(f.replace('.md', ''), m ? m[1].trim() : '9999');
  }
}

const index = buildArrivalIndex(base);
console.log(`base ${base} — ${index.size} coordinates\n`);
console.log('run      calls  fires  pre-existing   work');

for (const [label, dir, what] of RUNS) {
  const archive = join(HERE, 'MEASUREMENT-archive', dir);
  const file = existsSync(archive) ? readdirSync(archive).find((f) => /^tool-log-.*\.jsonl$/.test(f)) : null;
  if (!file) {
    console.log(`${label.padEnd(8)} (no archived tool log at ${archive})`);
    continue;
  }
  const calls = readFileSync(join(archive, file), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const startedAt = calls[0]?.ts ?? '0000';

  let fires = 0;
  let preExisting = 0;
  const offered = new Map();
  for (const call of calls) {
    const hits = arrivalsFor(textOf(call.target ?? ''), index);
    if (!hits.length) continue;
    fires += 1;
    for (const h of hits) offered.set(`${h.id}  ${h.subject}`, (offered.get(`${h.id}  ${h.subject}`) ?? 0) + 1);
    if (hits.some((h) => h.plane === 'derived-first' || (bornAt.get(h.id) ?? '9999') < startedAt)) preExisting += 1;
  }

  console.log(`${label.padEnd(8)} ${String(calls.length).padStart(5)}  ${String(fires).padStart(5)}  ${String(preExisting).padStart(12)}   ${what}`);
  for (const [entry, n] of [...offered.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4)) {
    console.log(`${' '.repeat(9)}${String(n).padStart(3)}x  ${entry}`);
  }
}

console.log('');
console.log('`pre-existing` is the honest column: fires on entries that were already in the base when');
console.log('the run began. A run helped by its own captures is not evidence of anything.');
