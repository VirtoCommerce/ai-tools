#!/usr/bin/env node
// `npm run kb:migrate-schema2 -- --base <checkout> --plans <file> [--apply]` (VCST-6122 M2).
//
// Applies migration plans to a LOCAL CHECKOUT of the base -- never to a URL, and it never commits:
// the base is public, so the diff is reviewed in git and pushed by hand, to a branch first. Without
// `--apply` it prints what it would write and changes nothing.
//
// It refuses the whole run on any problem (`core/migrate-schema2.mjs`), then rebuilds `index.json`
// from EVERY entry with the same `buildRow`/`buildIndex` the push uses, so the index a migration
// writes is the index the next push would write.

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEntry } from './core/frontmatter.mjs';
import { buildIndex, buildRow } from './core/index-build.mjs';
import { migrate } from './core/migrate-schema2.mjs';

function parseArgs(argv) {
  const f = { base: null, plans: [], apply: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') f.base = argv[++i];
    else if (argv[i] === '--plans') f.plans.push(argv[++i]);
    else if (argv[i] === '--apply') f.apply = true;
  }
  if (!f.base || !f.plans.length) throw new Error('usage: --base <local checkout> --plans <file> [--plans <file> …] [--apply]');
  if (/^https?:/i.test(f.base)) throw new Error('--base must be a local checkout, not a URL: the diff is reviewed in git before anything is pushed');
  return f;
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  const read = (rel) => readFileSync(join(flags.base, rel), 'utf8');
  const files = new Map(readdirSync(join(flags.base, 'entries')).filter((n) => n.endsWith('.md'))
    .map((n) => [`entries/${n}`, read(`entries/${n}`)]));
  const plans = flags.plans.flatMap((p) => JSON.parse(readFileSync(p, 'utf8')));
  const vocabulary = JSON.parse(read('vocabulary.json'));

  const r = migrate(files, plans, vocabulary);
  if (r.problems.length) {
    console.error(`refused: ${r.problems.length} problem(s), nothing written`);
    for (const p of r.problems) console.error(`  ${p}`);
    process.exit(1);
  }
  const kept = plans.filter((p) => p.action === 'keep').length;
  console.log(`${plans.length} plan(s): ${kept} kept, ${r.superseded.length} split into ${r.created.length} new entr${r.created.length === 1 ? 'y' : 'ies'}`);
  console.log(`${r.writes.size} file(s) change`);
  for (const path of [...r.writes.keys()].sort()) console.log(`  ${files.has(path) ? 'M' : 'A'} ${path}`);
  if (!flags.apply) { console.log('dry run: pass --apply to write'); return; }

  for (const [path, text] of r.writes) writeFileSync(join(flags.base, path), text);
  const all = new Map([...files, ...r.writes]);
  const rows = [...all].map(([path, text]) => buildRow(parseEntry(text, path).data, path));
  const index = buildIndex(rows);
  writeFileSync(join(flags.base, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`index.json rebuilt: schema ${index.schema}, ${index.count} rows`);
}

try { main(); } catch (err) { console.error(err.message); process.exit(3); }
