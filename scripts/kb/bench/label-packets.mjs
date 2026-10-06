#!/usr/bin/env node
// Candidate packets for labelling a large question set (VCST-6122, the large labelled set).
//
// A labeller can only name the right entry if it is in front of them, so each question gets the
// UNION of three independent nets over the base: the verdict ranker's top 10, floor-1's top 3, and a
// plain BM25 over subject + question + body + anchors (the net that shares no code with either
// ranker, so it catches what both miss). Each candidate carries its full body.
//
// The packets carry NO trace of what happened at ask time (state, who, the ranker's order): the
// labeller judges the question against the bodies, not against the base's past behaviour. The order
// of candidates is shuffled per labeller (`--seed`), so two independent passes do not share a
// position bias.
//
// Reads only. Run with KB_SYNTHETIC=1 like every bench.
//
//   KB_SYNTHETIC=1 node scripts/kb/bench/label-packets.mjs --base <dir> --ranker <file> --in <questions.json>
//                  --out <dir> [--chunk 30] [--seed <n>] [--bm25 8]

import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { openBase } from '../core/base.mjs';
import { parseEntry } from '../core/frontmatter.mjs';
import { loadIndex, retrievable } from '../core/index-load.mjs';
import { DECIDERS } from './verdict-bench.mjs';

const STOP = new Set('the and for are what does how when with that this from not but can its their into which who will was has have any all only one per via then than there been also out use used'.split(' '));
const tok = (s) => (String(s).toLowerCase().match(/[a-z0-9]+/g) ?? [])
  .map((w) => w.replace(/ies$/, 'y').replace(/([^s])s$/, '$1')).filter((w) => w.length > 2 && !STOP.has(w));

/** A seeded shuffle, so a pass is reproducible and two passes differ. */
function shuffle(list, seed) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

function parseArgs(argv) {
  const a = { chunk: 30, seed: 1, bm25: 8 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (['--base', '--ranker', '--in', '--out'].includes(k)) a[k.slice(2)] = argv[++i];
    else if (['--chunk', '--seed', '--bm25'].includes(k)) a[k.slice(2)] = Number(argv[++i]);
    else throw new Error(`unknown argument ${k}`);
  }
  for (const k of ['base', 'ranker', 'in', 'out']) if (!a[k]) throw new Error(`--${k} is required`);
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  const { reader, why } = openBase({ baseArg: a.base });
  if (!reader) throw new Error(why);
  const cat = await loadIndex(reader);
  if (cat.state !== 'ok') throw new Error(`${cat.state}: ${cat.why}`);
  const rows = retrievable(cat.rows);

  const parsed = new Map();
  for (const row of rows) {
    const r = await reader.readEntry(row.path);
    if (r.ok) parsed.set(row.id, { row, entry: parseEntry(r.text, row.path) });
  }
  const cache = new Map();
  const body = (row) => {
    if (!cache.has(row.path)) cache.set(row.path, parsed.get(row.id)?.entry ?? null);
    return cache.get(row.path);
  };
  const deciders = {
    verdict: await DECIDERS.verdict({ rows, reader, body, manifest: cat.manifest, rankerPath: a.ranker }),
    floor1: await DECIDERS['floor-1']({ rows, reader, body, manifest: cat.manifest }),
  };

  const docs = [...parsed.values()].map(({ row, entry }) => ({
    id: row.id,
    t: tok([entry.data.subject, entry.data.question, entry.body, ...(entry.data.anchors ?? []).map((x) => x.coordinate)].join(' ')),
  }));
  const N = docs.length;
  const avg = docs.reduce((s, d) => s + d.t.length, 0) / N;
  const df = new Map();
  for (const d of docs) for (const w of new Set(d.t)) df.set(w, (df.get(w) ?? 0) + 1);
  const bm25 = (q, d) => {
    const tf = new Map();
    for (const w of d.t) tf.set(w, (tf.get(w) ?? 0) + 1);
    let s = 0;
    for (const w of new Set(tok(q))) {
      const f = tf.get(w);
      if (!f) continue;
      const idf = Math.log(1 + (N - df.get(w) + 0.5) / (df.get(w) + 0.5));
      s += (idf * f * 2.2) / (f + 1.2 * (0.25 + (0.75 * d.t.length) / avg));
    }
    return s;
  };

  const questions = JSON.parse(await readFile(a.in, 'utf8'));
  const key = [];
  const blocks = [];
  for (const q of questions) {
    const v = await deciders.verdict(q.q);
    const f = await deciders.floor1(q.q);
    const lex = docs.map((d) => [bm25(q.q, d), d.id]).sort((x, y) => y[0] - x[0]).slice(0, a.bm25).map((x) => x[1]);
    const ids = [...new Set([...(v.candidates ?? []).slice(0, 10), ...(f.entries ?? []).slice(0, 3), ...lex])].filter((id) => parsed.has(id));
    key.push({ id: q.id, candidates: ids, verdict: v.verdict, verdictEntries: v.entries, verdictTop10: (v.candidates ?? []).slice(0, 10), floor1: f.verdict, floor1Entries: f.entries, bm25: lex });
    const shown = shuffle(ids, a.seed * 7919 + Number(q.id.replace(/\D/g, '')));
    const parts = [`## ${q.id}`, `Q: ${q.q}`, ''];
    for (const id of shown) {
      const { entry } = parsed.get(id);
      const anchors = (entry.data.anchors ?? []).map((x) => x.coordinate).join(', ');
      parts.push(`### ${id}`, `subject: ${entry.data.subject ?? ''}`, `question: ${entry.data.question ?? ''}`, `anchors: ${anchors}`, entry.body.trim(), '');
    }
    blocks.push(parts.join('\n'));
  }

  await mkdir(a.out, { recursive: true });
  const chunks = [];
  for (let i = 0; i < blocks.length; i += a.chunk) chunks.push(blocks.slice(i, i + a.chunk));
  for (let i = 0; i < chunks.length; i++) await writeFile(join(a.out, `chunk-${String(i + 1).padStart(2, '0')}.md`), `${chunks[i].join('\n\n')}\n`);
  await writeFile(join(a.out, 'key.json'), `${JSON.stringify(key, null, 1)}\n`);
  const sizes = key.map((k) => k.candidates.length);
  console.log(`${questions.length} questions, ${chunks.length} chunks, candidates per question min ${Math.min(...sizes)} max ${Math.max(...sizes)} mean ${(sizes.reduce((s, x) => s + x, 0) / sizes.length).toFixed(1)}`);
}

main().catch((err) => { console.error(`label-packets: ${err.message}`); process.exit(2); });
