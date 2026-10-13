#!/usr/bin/env node
// `node scripts/kb/bench/variant-replay.mjs --base <checkout> --history <kb:build-history output> [--round 2026-10-08]`
//
// Replays every dispute a judge has settled through the variant gate (core/variant.mjs) and prints the
// confusion table per relevance rule (VCST-6221 acceptance): the judge's `version-scoped` /
// `conditions-scoped` should come out VARIANT, `claim-amended` / `dispute-wrong` should come out
// DISPUTE. `split` items are excluded: they are the split's copies (step 4), not disagreements.
//
// The gate sees what the door would have seen at dispute time: the dispute item's build and conditions,
// and the entry's support recorded BEFORE it (judge investigations excluded -- they came after).

import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEntry } from '../core/frontmatter.mjs';
import { classifyDisagreement } from '../core/variant.mjs';
import { rulesWith } from '../core/relevance.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const base = resolve(arg('--base') ?? '');
const hist = JSON.parse(readFileSync(resolve(arg('--history') ?? ''), 'utf8'));
const round = arg('--round');
const RULES = rulesWith(arg('--swagger') ? JSON.parse(readFileSync(resolve(arg('--swagger')), 'utf8')) : null);
const builds = { ...hist.builds };
for (const f of (() => { try { return readdirSync(join(base, 'builds')); } catch { return []; } })()) {
  builds[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(base, 'builds', f), 'utf8'));
}
const buildOf = new Map(hist.items.filter((i) => i.build).map((i) => [`${i.id}#${i.index}`, i.build]));

const EXPECT = { 'version-scoped': 'variant', 'conditions-scoped': 'variant', 'claim-amended': 'dispute', 'dispute-wrong': 'dispute' };
const cases = [];
for (const f of readdirSync(join(base, 'entries')).filter((n) => n.endsWith('.md'))) {
  const { data, body } = parseEntry(readFileSync(join(base, 'entries', f), 'utf8'), f);
  const ev = data.evidence ?? [];
  ev.forEach((e, i) => {
    if (!e.contradicts || !EXPECT[e.resolved]) return;
    if (round && !String(e.resolvedAt ?? '').startsWith(round)) return;
    const support = ev.map((s, j) => ({ s, j }))
      .filter(({ s }) => !s.contradicts && !s.investigation && String(s.at) < String(e.at))
      .map(({ s, j }) => ({ build: buildOf.get(`${data.id}#${j}`) ?? null, conditions: s.conditions ?? null }));
    cases.push({ id: data.id, at: e.at, verdict: e.resolved, expect: EXPECT[e.resolved], entry: { ...data, body }, observation: { build: buildOf.get(`${data.id}#${i}`) ?? null, conditions: e.conditions ?? null }, support });
  });
}

console.log(`${cases.length} settled disputes${round ? ` resolved on ${round}` : ''} (split excluded): ${cases.filter((c) => c.expect === 'variant').length} the judge scoped to a build/setup, ${cases.filter((c) => c.expect === 'dispute').length} real contradictions\n`);
console.log('rule'.padEnd(14), 'variant✓', 'variant✗(real→variant)', 'dispute✓', 'dispute✗(scoped→dispute)');
const detail = arg('--detail');
for (const [name, rule] of Object.entries(RULES)) {
  const t = { tv: 0, fv: 0, td: 0, fd: 0 };
  const wrong = [];
  for (const c of cases) {
    const r = classifyDisagreement({ observation: c.observation, support: c.support, builds, relevance: rule(c.entry, builds) });
    if (r.verdict === 'variant') { if (c.expect === 'variant') t.tv += 1; else { t.fv += 1; wrong.push({ c, r }); } } else if (c.expect === 'dispute') t.td += 1; else { t.fd += 1; wrong.push({ c, r }); }
  }
  console.log(name.padEnd(14), String(t.tv).padEnd(8), String(t.fv).padEnd(22), String(t.td).padEnd(8), t.fd);
  if (detail === name) for (const { c, r } of wrong) console.log(`   ${c.id} ${c.verdict} -> ${r.verdict}: ${r.why}${r.diffs ? ` ${JSON.stringify(r.diffs.slice(0, 3))}` : ''}`);
}
