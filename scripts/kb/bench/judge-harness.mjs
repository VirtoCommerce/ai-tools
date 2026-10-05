#!/usr/bin/env node
// The end-to-end harness for the M4 gate (VCST-6122, Decision 1a): the base's verdict, then an agent's
// choice on `ambiguous`, confirmed on the body it opens.
//
// The base decides `answer` and `none` alone; `ambiguous` hands a compact list to the agent. So the gate
// is not the bench's numbers alone -- it is what an agent relies on at the END. This file produces the
// agent's inputs and scores its outputs; the agent itself is a model run outside it (a subagent, given
// the items file and nothing else), because the bench must stay free of an API key.
//
//   items   ask every labelled question of the base under a FROZEN ranker. Writes
//           <out>/items.txt   one block per `ambiguous` verdict -- the exact text `ask` renders, nothing
//                             else: no label, no row id (an opaque code instead), deterministic order
//           <out>/key.json    the labels and the base's own verdicts, for `score` only
//   bodies  for the agent's picks, the body it would read after `kb_show`: <out>/bodies.txt
//   score   every gate line of the amended AC, from key.json + the picks (+ the body confirmations)
//
// THE TEST SPLIT IS OPENED ONCE: `items --split test` refuses without --open-test and records the
// opening beside verdict-bench's own.
//
//   KB_SYNTHETIC=1 node scripts/kb/bench/judge-harness.mjs items --base <dir> --ranker <file> --split dev,calibration --out <dir>
//   KB_SYNTHETIC=1 node scripts/kb/bench/judge-harness.mjs items --decider floor-1 --base <dir> --split ... --out <dir>
//           what `main` runs, end to end: floor-1 hands the agent its hits WITH their bodies and calls it an
//           answer, so every answered ask becomes an item the agent must accept or reject, exactly like an
//           `ambiguous` one (scored the same way); a miss needs no agent.
//   node scripts/kb/bench/judge-harness.mjs bodies --base <dir> --out <dir> --picks <file>
//   node scripts/kb/bench/judge-harness.mjs score --out <dir> --picks <file> [--confirm <file>]

import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { createHash } from 'node:crypto';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openBase } from '../core/base.mjs';
import { parseEntry } from '../core/frontmatter.mjs';
import { loadIndex, retrievable } from '../core/index-load.mjs';
import { prepareVocabulary, readVocabulary } from '../core/query.mjs';
import { prepareRetrieval, retrieve } from '../core/retrieve.mjs';
import { askLines, verdictLines } from '../core/render.mjs';
import { rank, scoreRows as lexicalRows, TOP_N } from '../core/rank.mjs';
import { describeHit } from '../core/verbs.mjs';
import { decide } from '../core/verdict.mjs';
import { RECALL_K, WAVE1_MISSES, labelledRows, tokensOf } from './verdict-bench.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OPENINGS = resolve(HERE, '.test-openings.jsonl');
const DEFAULT_SET = resolve(HERE, 'rank-labelled-set.v2.json');

/** An opaque, stable code per row: the agent must not see a row id that hints at its label. */
export const codeOf = (id, salt) => createHash('sha256').update(`${salt}:${id}`).digest('hex').slice(0, 6);

const readPairs = async (file) => new Map((await readFile(file, 'utf8')).trim().split(/\r?\n/)
  .map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 2));

async function openCatalogue(base) {
  const { reader, why, locator } = openBase({ baseArg: base });
  if (!reader) throw new Error(why);
  const cat = await loadIndex(reader);
  if (cat.state !== 'ok') throw new Error(`${cat.state}: ${cat.why}`);
  return { reader, locator, rows: retrievable(cat.rows) };
}

async function bodyOf(reader, row) {
  const r = await reader.readEntry(row.path);
  return r.ok ? parseEntry(r.text, row.path).body : null;
}

async function items(a) {
  return a.decider === 'floor-1' ? itemsFloor1(a) : itemsVerdict(a);
}

/** floor-1 end to end: its answer is the list it returns, which the agent judges like `ambiguous`. */
async function itemsFloor1({ base, splits, out, set: setFile, openTest, salt }) {
  if (splits.includes('test') && !openTest) throw new Error('the test split is opened once, at the gate: pass --open-test');
  const set = JSON.parse(await readFile(setFile, 'utf8'));
  const { reader, locator, rows } = await openCatalogue(base);
  if (splits.includes('test')) {
    await appendFile(OPENINGS, `${JSON.stringify({ at: new Date().toISOString(), decider: 'judge-harness/floor-1', base: locator, set: set.snapshot ?? null })}\n`);
  }
  const blocks = [];
  const key = [];
  for (const row of labelledRows(set).filter((r) => splits.includes(r.split))) {
    const candidates = lexicalRows(row.q, rows).slice(0, RECALL_K).map((h) => h.row.id);
    const { hits, nearMiss } = rank(row.q, rows, { top: TOP_N });
    const code = codeOf(row.id, salt);
    let lines;
    if (hits.length) {
      const described = await Promise.all(hits.map(async (h) => {
        const r = await reader.readEntry(h.row.path);
        return r.ok ? describeHit(h, parseEntry(r.text, h.row.path)) : describeHit(h, null, { unavailable: 'body unavailable' });
      }));
      lines = askLines({ state: 'answer', hits: described });
      blocks.push({ code, text: [`ITEM ${code}`, `QUESTION: ${row.q}`, ...lines].join('\n') });
    } else {
      lines = askLines({ state: 'miss', hits: [], nearMiss });
    }
    key.push({
      code, id: row.id, kind: row.kind, split: row.split, source: row.source, partial: Boolean(row.partial), expect: row.expect ?? [],
      verdict: hits.length ? 'ambiguous' : 'none', base: null, shown: hits.map((h) => h.row.id),
      recalled: (row.expect ?? []).some((e) => candidates.includes(e)), tokens: tokensOf(lines), p: null,
    });
  }
  blocks.sort((x, y) => x.code.localeCompare(y.code));
  await writeFile(join(out, 'items.txt'), `${blocks.map((b) => b.text).join('\n\n')}\n`);
  await writeFile(join(out, 'key.json'), `${JSON.stringify({ ranker: 'floor-1', splits, base: locator, rows: key }, null, 1)}\n`);
  console.log(`${key.length} rows; ${blocks.length} answered items written (the agent judges each); misses ${key.filter((k) => k.verdict === 'none').length}`);
}

async function itemsVerdict({ base, ranker: rankerFile, splits, out, set: setFile, openTest, salt }) {
  if (splits.includes('test') && !openTest) throw new Error('the test split is opened once, at the gate: pass --open-test');
  const set = JSON.parse(await readFile(setFile, 'utf8'));
  const ranker = JSON.parse(await readFile(rankerFile, 'utf8'));
  const { reader, locator, rows } = await openCatalogue(base);
  const prep = prepareRetrieval(rows, prepareVocabulary(await readVocabulary(reader)));
  if (splits.includes('test')) {
    await appendFile(OPENINGS, `${JSON.stringify({ at: new Date().toISOString(), decider: `judge-harness/${ranker.rank}`, base: locator, set: set.snapshot ?? null })}\n`);
  }
  const blocks = [];
  const key = [];
  for (const row of labelledRows(set).filter((r) => splits.includes(r.split))) {
    // What ask will do: retrieve, read the bodies of the head, then decide (the re-rank reads them).
    const found = retrieve(prep, row.q, { fusion: ranker.fusion });
    const head = found.candidates.slice(0, ranker.rerank?.k ?? 3);
    const bodies = new Map(await Promise.all(head.map(async (c) => [c.row.id, await bodyOf(reader, c.row)])));
    const d = decide(prep, ranker, row.q, { retrieval: found, bodies });
    const code = codeOf(row.id, salt);
    let lines;
    if (d.verdict === 'ambiguous') {
      const headlines = await Promise.all(d.entries.map(async (c) => ({
        id: c.row.id, subject: c.row.subject, separating: c.separating, question: c.row.question, body: await bodyOf(reader, c.row),
      })));
      lines = verdictLines({ verdict: 'ambiguous', headlines });
      blocks.push({ code, text: [`ITEM ${code}`, `QUESTION: ${row.q}`, ...lines].join('\n') });
    } else {
      // `answer` and `none` need no agent; their rendered size still counts toward tokens per ask.
      lines = d.verdict === 'answer'
        ? [`kb ask: answered`, `  ${d.entries[0].row.id}  ${d.entries[0].row.subject}`, String(await bodyOf(reader, d.entries[0].row) ?? '')]
        : verdictLines({ verdict: 'none', concepts: d.concepts });
    }
    key.push({
      code, id: row.id, kind: row.kind, split: row.split, source: row.source, partial: Boolean(row.partial), expect: row.expect ?? [],
      verdict: d.verdict, base: d.verdict === 'answer' ? d.entries[0].row.id : null, shown: d.entries.map((c) => c.row.id),
      recalled: (row.expect ?? []).some((e) => d.candidates.slice(0, RECALL_K).some((c) => c.row.id === e)),
      tokens: tokensOf(lines), p: d.p,
    });
  }
  blocks.sort((a, b) => a.code.localeCompare(b.code));
  await writeFile(join(out, 'items.txt'), `${blocks.map((b) => b.text).join('\n\n')}\n`);
  await writeFile(join(out, 'key.json'), `${JSON.stringify({ ranker: ranker.rank, splits, base: locator, rows: key }, null, 1)}\n`);
  console.log(`${key.length} rows; ${blocks.length} ambiguous items written; base answers ${key.filter((k) => k.verdict === 'answer').length}, none ${key.filter((k) => k.verdict === 'none').length}`);
}

async function bodies({ base, out, picks: picksFile }) {
  const { key: k } = { key: JSON.parse(await readFile(join(out, 'key.json'), 'utf8')) };
  const picks = await readPairs(picksFile);
  const { reader, rows } = await openCatalogue(base);
  const byId = new Map(rows.map((r) => [r.id, r]));
  const itemsText = await readFile(join(out, 'items.txt'), 'utf8');
  const question = new Map([...itemsText.matchAll(/^ITEM (\w+)\nQUESTION: (.*)$/gm)].map((m) => [m[1], m[2]]));
  const blocks = [];
  for (const row of k.rows) {
    const pick = picks.get(row.code);
    if (!pick || pick === 'none' || !byId.has(pick)) continue;
    const entry = byId.get(pick);
    blocks.push([`ITEM ${row.code}`, `QUESTION: ${question.get(row.code)}`, `ENTRY ${pick}: ${entry.subject}`, String(await bodyOf(reader, entry) ?? '').trim()].join('\n'));
  }
  await writeFile(join(out, 'bodies.txt'), `${blocks.join('\n\n')}\n`);
  console.log(`${blocks.length} bodies written`);
}

const ratio = (n, d) => `${n}/${d}${d ? ` (${Math.round((100 * n) / d)}%)` : ''}`;

/** Every amended-AC line, from what the base did and what the agent relied on. */
export function scoreRows(rows, picks, confirm = null) {
  const relied = (r) => {
    if (r.verdict === 'answer') return r.base;
    if (r.verdict !== 'ambiguous') return null;
    const p = picks.get(r.code);
    if (!p || p === 'none') return null;
    return confirm && confirm.get(r.code) !== 'yes' ? null : p;
  };
  const T = rows.filter((r) => r.kind === 'target');
  const C = rows.filter((r) => r.kind === 'control');
  const reliedRows = rows.filter((r) => relied(r));
  const right = (r) => r.kind === 'target' && r.expect.includes(relied(r));
  const full = T.filter((r) => !r.partial);
  const para = T.filter((r) => r.source === 'paraphrase');
  return {
    picksPrecision: [reliedRows.filter(right).length, reliedRows.length],
    controlsAnsweredByBase: C.filter((r) => r.verdict === 'answer').length,
    controlsNone: [C.filter((r) => !relied(r)).length, C.length],
    resolvedNonPartial: [full.filter(right).length, full.length],
    resolvedPartial: [T.filter((r) => r.partial).filter(right).length, T.filter((r) => r.partial).length],
    resolvedAll: [T.filter(right).length, T.length],
    shownNonPartial: [full.filter((r) => r.shown.some((id) => r.expect.includes(id))).length, full.length],
    paraphraseRecall10: [para.filter((r) => r.recalled).length, para.length],
    meanAskTokens: rows.length ? Math.round(rows.reduce((s, r) => s + r.tokens, 0) / rows.length) : null,
    baseAnswers: [rows.filter((r) => r.verdict === 'answer' && right(r)).length, rows.filter((r) => r.verdict === 'answer').length],
    wave1: rows.filter((r) => WAVE1_MISSES.includes(r.id)).map((r) => ({ id: r.id, shown: r.shown.some((id) => r.expect.includes(id)), relied: relied(r), right: right(r) })),
    wrong: reliedRows.filter((r) => !right(r)).map((r) => ({ id: r.id, kind: r.kind, relied: relied(r), expect: r.expect })),
  };
}

async function score({ out, picks: picksFile, confirm: confirmFile }) {
  const key = JSON.parse(await readFile(join(out, 'key.json'), 'utf8'));
  const picks = await readPairs(picksFile);
  const confirm = confirmFile ? await readPairs(confirmFile) : null;
  for (const split of [...key.splits, ...(key.splits.length > 1 ? ['all'] : [])]) {
    const s = scoreRows(key.rows.filter((r) => split === 'all' || r.split === split), picks, confirm);
    console.log(`\n${split}${confirm ? '  (picks confirmed on the body)' : ''}`);
    console.log(`  picks precision          ${ratio(...s.picksPrecision)}      gate >= 95%`);
    console.log(`  controls answered (base) ${s.controlsAnsweredByBase}                gate 0`);
    console.log(`  controls none / kb_none  ${ratio(...s.controlsNone)}      gate >= 90%`);
    console.log(`  resolved, non-partial    ${ratio(...s.resolvedNonPartial)}      gate >= 80%   (shown ${ratio(...s.shownNonPartial)})`);
    console.log(`  resolved, partial        ${ratio(...s.resolvedPartial)}   all targets ${ratio(...s.resolvedAll)}`);
    console.log(`  paraphrase recall@10     ${ratio(...s.paraphraseRecall10)}      gate >= 90%`);
    console.log(`  mean ask tokens          ${s.meanAskTokens}              gate <= 400`);
    console.log(`  base answered alone      ${ratio(...s.baseAnswers)} right`);
    if (s.wave1.length) console.log(`  wave-1 misses            ${s.wave1.map((w) => `${w.id}:${w.right ? 'resolved' : w.shown ? 'shown' : 'missed'}`).join(' ')}`);
    for (const w of s.wrong) console.log(`    WRONG ${w.id} (${w.kind}) relied on ${w.relied}, expect ${w.expect.join(' ') || '-'}`);
  }
}

function parseArgs(argv) {
  const [verb, ...rest] = argv;
  const a = { verb, splits: ['dev', 'calibration'], set: DEFAULT_SET, openTest: false, salt: 'm4-gate' };
  for (let i = 0; i < rest.length; i++) {
    const k = rest[i];
    if (k === '--open-test') a.openTest = true;
    else if (k === '--split') a.splits = rest[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (['--base', '--ranker', '--out', '--picks', '--confirm', '--set', '--salt', '--decider'].includes(k)) a[k.slice(2)] = rest[++i];
    else throw new Error(`unknown argument ${k}`);
  }
  if (a.out) a.out = resolve(a.out);
  return a;
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  if (a.verb === 'items') return items(a);
  if (a.verb === 'bodies') return bodies(a);
  if (a.verb === 'score') return score(a);
  throw new Error('usage: judge-harness.mjs items|bodies|score ...');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`judge-harness: ${err.message}`); process.exit(2); });
}
