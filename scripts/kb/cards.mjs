#!/usr/bin/env node
// `npm run kb:cards -- --base <checkout> --list [--out <dir>]`
// `npm run kb:cards -- --base <checkout> --apply <plans.json> [--packet <dir>] [--dry-run]` (VCST-6122).
//
// Retrieval cards for entries that have none. A card (4-6 questions, vocabulary concepts, a closed
// surface) is the strongest channel of the verdict ranker, and an entry captured without one is found
// markedly worse. Until capture requires a card (M5), entries keep arriving without one -- from main,
// and from every capture after the rollout -- so this backfills them in two steps:
//
//   --list   writes <out>/cards-packet.md (the vocabulary, the allowed surfaces and every active entry
//            without a card, with its body) for an agent to write plans from, and
//            <out>/cards-packet.json (each listed entry's hash, for --apply's staleness check).
//   --apply  takes the agent's plans ([{id, action:"keep", surface, questions, concepts}]), stamps each
//            with the hash recorded by --list, and applies them with migrate-schema2's own rules:
//            >= 3 distinct questions, concepts from the vocabulary, a closed surface; an entry that
//            changed since --list is refused; index.json is rebuilt. Only entries the packet listed
//            are accepted, so a card is never written over another one.
//
// Writing the questions is a model's job, not this script's: no API key, no network. Never commits.

import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseEntry } from './core/frontmatter.mjs';
import { buildIndex, buildRow } from './core/index-build.mjs';
import { SURFACES } from './core/index-load.mjs';
import { entryHash, migrate } from './core/migrate-schema2.mjs';

function parseArgs(argv) {
  const a = { base: null, list: false, apply: null, out: null, packet: null, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--base') a.base = argv[++i];
    else if (k === '--list') a.list = true;
    else if (k === '--apply') a.apply = argv[++i];
    else if (k === '--out') a.out = argv[++i];
    else if (k === '--packet') a.packet = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.base || a.list === Boolean(a.apply)) throw new Error('usage: --base <checkout> (--list [--out <dir>] | --apply <plans.json> [--packet <dir>] [--dry-run])');
  if (/^https?:/i.test(a.base)) throw new Error('--base must be a local checkout');
  return a;
}

const lf = (t) => String(t).replace(/\r\n/g, '\n');

function readBase(base) {
  return new Map(readdirSync(join(base, 'entries')).filter((n) => n.endsWith('.md'))
    .map((n) => [`entries/${n}`, lf(readFileSync(join(base, 'entries', n), 'utf8'))]));
}

/** Active entries without a single card question. */
export function uncarded(files) {
  const out = [];
  for (const [path, text] of files) {
    const { data, body } = parseEntry(text, path);
    if (data.status === 'active' && !(data.questions ?? []).length) out.push({ path, id: String(data.id), data, body, hash: entryHash(text) });
  }
  return out.sort((x, y) => x.id.localeCompare(y.id));
}

/** The agent's packet: the closed lists it may choose from, then each entry with its body. */
export function packetText(entries, vocabulary) {
  const voc = (vocabulary?.concepts ?? []).map((c) => `${c.id} - ${c.label ?? ''}${c.aliases?.length ? ` - ${c.aliases.slice(0, 6).join(', ')}` : ''}`);
  const head = [
    'Write a retrieval card for every entry below: 4-6 distinct questions this entry answers (at least one in plain',
    'language, one coordinate-led keyword ask, one about the observed value or condition; each answerable from the body',
    'and specific to this fact), 1-3 concepts ONLY from the vocabulary, 1-2 surfaces ONLY from the list. No client or',
    'customer names, emails or credentials. Output: [{"id","action":"keep","surface":[],"questions":[],"concepts":[]}].',
    '',
    'VOCABULARY (concept id - label - aliases):', ...voc, '', `SURFACES: ${SURFACES.join(', ')}`, '',
  ];
  const blocks = entries.map((e) => [
    `## ${e.id}`, `subject: ${e.data.subject ?? ''}`, `question: ${e.data.question ?? ''}`,
    `anchors: ${(e.data.anchors ?? []).map((x) => (typeof x === 'string' ? x : x.coordinate)).join(', ')}`,
    `appliesTo: ${(e.data.appliesTo ?? []).map((x) => `${x.axis}=${x.value}`).join(', ')}`, e.body.trim(), '',
  ].join('\n'));
  return `${[...head, ...blocks].join('\n')}\n`;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const files = readBase(a.base);
  const vocabulary = JSON.parse(readFileSync(join(a.base, 'vocabulary.json'), 'utf8'));

  if (a.list) {
    const todo = uncarded(files);
    const out = resolve(a.out ?? '.');
    mkdirSync(out, { recursive: true });
    writeFileSync(join(out, 'cards-packet.md'), packetText(todo, vocabulary));
    writeFileSync(join(out, 'cards-packet.json'), `${JSON.stringify(Object.fromEntries(todo.map((e) => [e.id, e.hash])), null, 1)}\n`);
    console.log(`${todo.length} active entr${todo.length === 1 ? 'y' : 'ies'} without a card${todo.length ? `: ${todo.map((e) => e.id).join(' ')}` : ''}`);
    if (todo.length) console.log(`packet: ${join(out, 'cards-packet.md')} -- have an agent write plans from it, then --apply them`);
    return 0;
  }

  const packetDir = resolve(a.packet ?? '.');
  const listed = JSON.parse(readFileSync(join(packetDir, 'cards-packet.json'), 'utf8'));
  const plans = JSON.parse(readFileSync(a.apply, 'utf8'));
  const problems = [];
  const seen = new Set();
  for (const p of plans) {
    if (p.action !== 'keep') problems.push(`${p.id}: only keep plans are applied here (got "${p.action}")`);
    if (!listed[p.id]) problems.push(`${p.id}: not in the packet -- --list it first; a card is never written over another`);
    if (seen.has(p.id)) problems.push(`${p.id}: planned twice`);
    seen.add(p.id);
  }
  const missing = Object.keys(listed).filter((id) => !seen.has(id));
  const stamped = plans.map((p) => ({ ...p, basedOn: listed[p.id] }));
  const r = problems.length ? { problems, writes: new Map() } : migrate(files, stamped, vocabulary);
  if (r.problems.length) {
    console.error(`refused: ${r.problems.length} problem(s), nothing written`);
    for (const p of r.problems) console.error(`  ${p}`);
    return 1;
  }
  console.log(`${plans.length} card(s) valid; ${r.writes.size} file(s) change${missing.length ? `; ${missing.length} listed entr(ies) still without a plan: ${missing.join(' ')}` : ''}`);
  if (a.dryRun) { console.log('dry run: pass without --dry-run to write'); return 0; }
  for (const [path, text] of r.writes) writeFileSync(join(a.base, path), text);
  const all = new Map([...files, ...r.writes]);
  const index = buildIndex([...all].map(([path, text]) => buildRow(parseEntry(text, path).data, path)));
  writeFileSync(join(a.base, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  console.log(`index.json rebuilt: schema ${index.schema}, ${index.count} rows. Nothing was committed.`);
  return 0;
}

if (process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/kb/cards.mjs')) {
  try { process.exitCode = main(); } catch (err) { console.error(err.message); process.exitCode = 3; }
}
