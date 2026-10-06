#!/usr/bin/env node
// `node scripts/kb/merge-entries.mjs --base <checkout> --plans <file> [--stamp | --apply]` (VCST-6122).
//
// Merges entries that state the SAME fact into one survivor -- the "one entry, one fact" rule read
// from the other side: a split (migrate-schema2) turns one entry holding two facts into two; a merge
// turns two entries holding one fact into one. Overlapping entries cost twice: the ranker shows one,
// a label names the other, and a right reliance is scored wrong.
//
// A plan is { survivor, absorbed: [ids], body?: string|null, subject?: string|null, why }, or a
// subject-only rewrite { id, subject }. For a merge:
//   - each absorbed entry becomes `status: superseded`, `supersededBy: survivor`; its body stays, so
//     `show` of an old id still resolves and says where the fact went;
//   - the survivor gains every absorbed entry's evidence (tagged `mergedFrom`), the anchors, card
//     questions and concepts it does not already carry, and optionally a new body and subject.
// Like the schema-2 migration it works on a LOCAL CHECKOUT only, never commits, refuses the whole run
// on any problem, and rebuilds index.json with the same builder the push uses. Without --apply it
// prints what it would write.

import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEntry, stringifyFrontmatter } from './core/frontmatter.mjs';
import { buildIndex, buildRow } from './core/index-build.mjs';
import { entryHash } from './core/migrate-schema2.mjs';

/** Every entry id a plan reads, survivor first. */
const idsOf = (p) => (p.survivor ? [p.survivor, ...(p.absorbed ?? [])] : [p.id]);

const key = (o) => JSON.stringify(o);
const union = (a, b, by) => {
  const seen = new Set((a ?? []).map(by));
  return [...(a ?? []), ...(b ?? []).filter((x) => !seen.has(by(x)) && seen.add(by(x)))];
};

/** Apply the plans to the entries; returns the writes, or the problems and no writes. */
export function merge(files, plans) {
  const byId = new Map();
  for (const [path, text] of files) {
    const { data, body } = parseEntry(text, path);
    byId.set(String(data.id), { path, data, body, text });
  }
  const problems = [];
  // A plan is written from one version of each entry it reads, and a merged body is built FROM those
  // versions: applied to a newer entry it would silently drop whatever changed since (a confirm, a
  // dispute, a corrected anchor). `basedOn` (id -> entryHash, written by --stamp) is required, and a
  // stale one refuses the run, as migrate-schema2 does.
  for (const p of plans) {
    for (const id of idsOf(p)) {
      const e = byId.get(id);
      if (!e) continue; // reported below as "not in the base"
      const want = p.basedOn?.[id];
      if (!want) problems.push(`${id}: the plan carries no basedOn for it; run --stamp right after writing the plan`);
      else if (want !== entryHash(e.text)) problems.push(`${id}: the entry changed since the plan was written (basedOn ${want}), re-plan it`);
    }
  }
  const next = new Map(); // id -> { data, body } as it will be written
  const touched = new Set();
  const get = (id) => next.get(id) ?? byId.get(id);
  const absorbedBy = new Map();

  for (const p of plans) {
    if (p.survivor) {
      const s = byId.get(p.survivor);
      if (!s) { problems.push(`${p.survivor}: not in the base`); continue; }
      if (s.data.status !== 'active') problems.push(`${p.survivor}: survivor is ${s.data.status}`);
      if (absorbedBy.has(p.survivor)) problems.push(`${p.survivor}: is absorbed by ${absorbedBy.get(p.survivor)} and cannot survive`);
      if (!(p.absorbed ?? []).length) problems.push(`${p.survivor}: a merge needs at least one absorbed entry`);
      for (const id of p.absorbed ?? []) {
        const a = byId.get(id);
        if (!a) { problems.push(`${id}: not in the base`); continue; }
        if (a.data.status !== 'active') problems.push(`${id}: absorbed entry is ${a.data.status}`);
        if (absorbedBy.has(id)) problems.push(`${id}: absorbed twice`);
        if (id === p.survivor) problems.push(`${id}: absorbs itself`);
        absorbedBy.set(id, p.survivor);
      }
    } else if (!p.id || !String(p.subject ?? '').trim()) {
      problems.push(`a plan is neither a merge nor a subject rewrite: ${key(p).slice(0, 80)}`);
    }
  }
  for (const [id, by] of absorbedBy) if ([...absorbedBy.values()].includes(id)) problems.push(`${id}: absorbed by ${by} and also absorbs another`);
  if (problems.length) return { writes: new Map(), problems };

  for (const p of plans.filter((x) => x.survivor)) {
    const s = get(p.survivor);
    let data = { ...s.data };
    for (const id of p.absorbed) {
      const a = byId.get(id).data;
      // A supporting item from a session that already supports the survivor is the same observer
      // filing the same fact twice: carried for provenance, flagged so trust does not count it again.
      const seen = new Set((data.evidence ?? []).filter((e) => !e.contradicts && e.by).map((e) => e.by));
      data.evidence = [...(data.evidence ?? []), ...(a.evidence ?? []).map((e) => ({
        ...e, mergedFrom: id, ...(!e.contradicts && e.by && seen.has(e.by) ? { duplicateSession: true } : {}),
      }))];
      data.anchors = union(data.anchors, a.anchors, (x) => x.coordinate);
      if (data.questions || a.questions) data.questions = union(data.questions, a.questions, (x) => x.text.toLowerCase());
      if (data.concepts || a.concepts) data.concepts = union(data.concepts, a.concepts, (x) => x.id);
      next.set(id, { data: { ...a, status: 'superseded', supersededBy: p.survivor }, body: byId.get(id).body });
      touched.add(id);
    }
    if (p.subject) data.subject = String(p.subject).trim();
    next.set(p.survivor, { data, body: p.body ? `\n${String(p.body).trim()}\n` : s.body });
    touched.add(p.survivor);
  }
  for (const p of plans.filter((x) => !x.survivor)) {
    if (absorbedBy.has(p.id)) continue; // its subject no longer matters
    const e = get(p.id);
    if (!e) { problems.push(`${p.id}: not in the base`); continue; }
    next.set(p.id, { data: { ...e.data, subject: String(p.subject).trim() }, body: e.body });
    touched.add(p.id);
  }
  if (problems.length) return { writes: new Map(), problems };

  const writes = new Map();
  for (const id of touched) {
    const path = byId.get(id).path;
    const { data, body } = next.get(id);
    const text = `${stringifyFrontmatter(data)}\n${body.replace(/^\n?/, '')}`;
    // Round-trip: what we write must parse back to the same id and status.
    const back = parseEntry(text, path).data;
    if (back.id !== data.id || back.status !== data.status) problems.push(`${id}: does not round-trip`);
    if (files.get(path) !== text) writes.set(path, text);
  }
  return problems.length ? { writes: new Map(), problems } : { writes, problems, merged: absorbedBy.size };
}

function main() {
  const args = process.argv.slice(2);
  const base = args[args.indexOf('--base') + 1];
  const planFiles = args.flatMap((a, i) => (a === '--plans' ? [args[i + 1]] : []));
  if (args.indexOf('--base') < 0 || !planFiles.length) throw new Error('usage: --base <local checkout> --plans <file> [--plans <file>] [--stamp | --apply]');
  if (args.includes('--stamp')) {
    for (const f of planFiles) {
      const plans = JSON.parse(readFileSync(f, 'utf8'));
      for (const p of plans) p.basedOn = Object.fromEntries(idsOf(p).map((id) => [id, entryHash(readFileSync(join(base, 'entries', `${id}.md`), 'utf8'))]));
      writeFileSync(f, `${JSON.stringify(plans, null, 1)}\n`);
      console.log(`stamped ${plans.length} plan(s) in ${f} from ${base}`);
    }
    return;
  }
  if (/^https?:/i.test(base)) throw new Error('--base must be a local checkout');
  const files = new Map(readdirSync(join(base, 'entries')).filter((n) => n.endsWith('.md'))
    .map((n) => [`entries/${n}`, readFileSync(join(base, 'entries', n), 'utf8').replace(/\r\n/g, '\n')]));
  const plans = planFiles.flatMap((f) => JSON.parse(readFileSync(f, 'utf8')));
  const r = merge(files, plans);
  if (r.problems.length) {
    console.error(`refused: ${r.problems.length} problem(s), nothing written`);
    for (const p of r.problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`${plans.length} plan(s): ${r.merged} entr${r.merged === 1 ? 'y' : 'ies'} absorbed; ${r.writes.size} file(s) change`);
  for (const path of [...r.writes.keys()].sort()) console.log(`  M ${path}`);
  if (!args.includes('--apply')) { console.log('dry run: pass --apply to write'); return; }
  for (const [path, text] of r.writes) writeFileSync(join(base, path), text);
  const all = new Map([...files, ...r.writes]);
  const index = buildIndex([...all].map(([path, text]) => buildRow(parseEntry(text, path).data, path)));
  writeFileSync(join(base, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`index.json rebuilt: schema ${index.schema}, ${index.count} rows`);
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/kb/merge-entries.mjs')) {
  try { main(); } catch (err) { console.error(err.message); process.exit(3); }
}
