#!/usr/bin/env node
// The verdict bench (VCST-6122 M4): the labelled set v2 against a base, with no judge.
//
// A judge is not needed because the base decides: every decider returns ONE verdict per question --
// `answer` (one entry), `ambiguous` (a short list the agent must choose from) or `none` -- and the
// label says whether that verdict was right. So the numbers below are the numbers production would
// see, not a model's opinion of them.
//
// WHAT IS MEASURED, per split (docs/decisions/kb-write-time-retrieval.md, "How this is measured"):
//   answer precision    answers whose entry is labelled correct / all answers (targets AND controls:
//                       an answer on a control is a confident wrong answer, the one outcome that
//                       matters most)
//   controls none       controls that ended in `none`
//   targets answered    targets answered with a labelled entry
//   paraphrase R@10     paraphrase targets with a labelled entry among the first 10 candidates --
//                       the candidate list, before any decision, which is what M7 is gated on
//   targets resolved    targets answered with a labelled entry OR ended in `ambiguous` with one among
//                       the headlines -- the gate the operator set on 2026-10-01 in place of
//                       "targets answered", which top-1 retrieval caps well below 0.80
//   ambiguous share     rows that ended in `ambiguous`, and how many of those carried a right entry
//   tokens/ask          chars / 4 of the text the agent would be handed, the same rule for every
//                       decider, so the comparison is fair even though the absolute value is rough
//
// THE TEST SPLIT IS OPENED ONCE. Tuning on it would make the gate measure the tuning. So `--split
// test` refuses without `--open-test`, and every opening is appended to `.test-openings.jsonl` beside
// this file -- a second opening is visible in review, not merely discouraged in a comment.
//
// Reads only: the bench calls the ranker and the reader directly and never `ask`, so it writes no log
// line and queues nothing. Run it with KB_SYNTHETIC=1 all the same, as every bench is.
//
//   KB_SYNTHETIC=1 node scripts/kb/bench/verdict-bench.mjs --base <dir> [--decider floor-1]
//                  [--split dev,calibration] [--open-test] [--set <file>] [--rows] [--json]

import '../../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { appendFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openBase } from '../core/base.mjs';
import { parseEntry } from '../core/frontmatter.mjs';
import { loadIndex, retrievable } from '../core/index-load.mjs';
import { rank, RANKER, scoreRows, TOP_N } from '../core/rank.mjs';
import { askLines, verdictLines } from '../core/render.mjs';
import { describeHit } from '../core/verbs.mjs';
import { calibrate } from '../core/calibrate.mjs';
import { prepareVocabulary, readVocabulary } from '../core/query.mjs';
import { prepareRetrieval } from '../core/retrieve.mjs';
import { decide } from '../core/verdict.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_SET = resolve(HERE, 'rank-labelled-set.v2.json');
const OPENINGS = resolve(HERE, '.test-openings.jsonl');
const SPLITS = ['dev', 'calibration', 'test'];
/** The five wave-1 asks whose answer was in the base and never reached the candidates. */
export const WAVE1_MISSES = ['W-P1', 'W-P3', 'W-P6', 'W-L1', 'W-L6'];
export const RECALL_K = 10;

/** The rough token rule, one for every decider. */
export const tokensOf = (lines) => Math.ceil(lines.join('\n').length / 4);

// ── deciders ──────────────────────────────────────────────────────────────────────────────────
//
// A decider takes one question and the loaded base and returns
//   { verdict: 'answer'|'ambiguous'|'none', entries: string[], candidates: string[], tokens: number }
// `entries` is what the verdict hands over (one id for `answer`); `candidates` is the ranked list the
// decision was made from, used for recall@10 only.

/** Bodies, read once per entry per run: the bench asks ~120 questions of the same ~40 entries. */
function bodyCache(reader) {
  const cache = new Map();
  return (row) => {
    if (!cache.has(row.path)) {
      cache.set(row.path, reader.readEntry(row.path).then((r) => {
        if (!r.ok) return null;
        try { return parseEntry(r.text, row.path); } catch { return null; }
      }));
    }
    return cache.get(row.path);
  };
}

/**
 * What `main` runs: `rank()` with the floor-1 admissibility rule, the top 3 bodies returned.
 *
 * floor-1 has no ambiguous state -- it returns up to three bodies or nothing -- so its `answer` is
 * its FIRST hit, which is the entry an agent reading the list top-down would take. Whether one of the
 * other two was right is reported beside it (`top3`) and does not count as an answer.
 */
function floor1({ rows, body }) {
  return async (question) => {
    const candidates = scoreRows(question, rows).slice(0, RECALL_K).map((h) => h.row.id);
    const { hits, nearMiss } = rank(question, rows, { top: TOP_N });
    if (!hits.length) {
      return { verdict: 'none', entries: [], candidates, tokens: tokensOf(askLines({ state: 'miss', hits: [], nearMiss })) };
    }
    const described = await Promise.all(hits.map(async (h) => {
      const parsed = await body(h.row);
      return parsed ? describeHit(h, parsed) : describeHit(h, null, { unavailable: 'body unavailable' });
    }));
    return {
      verdict: 'answer',
      entries: [hits[0].row.id],
      listed: hits.map((h) => h.row.id),
      candidates,
      tokens: tokensOf(askLines({ state: 'answer', hits: described })),
    };
  };
}

/**
 * The calibrated verdict (core/verdict.mjs). Its ranker is `--ranker <file>` when given, otherwise it
 * is fitted here and now by `calibrate` -- on dev and calibration only, so a tuning loop never needs
 * a file and never sees test.
 */
async function verdict({ rows, reader, body, set, rankerPath }) {
  const prep = prepareRetrieval(rows, prepareVocabulary(await readVocabulary(reader)));
  const ranker = rankerPath ? JSON.parse(await readFile(rankerPath, 'utf8')) : calibrate(prep, labelledRows(set), { snapshot: set.snapshot });
  const fn = async (question) => {
    const d = decide(prep, ranker, question);
    const candidates = d.candidates.slice(0, RECALL_K).map((c) => c.row.id);
    let lines;
    if (d.verdict === 'answer') {
      const c = d.entries[0];
      const hit = { row: c.row, score: Math.round(d.p * 100) / 100, overlap: [], anchors: c.anchors.hits };
      const parsed = await body(c.row);
      lines = verdictLines({ verdict: 'answer', hit: parsed ? describeHit(hit, parsed) : describeHit(hit, null, { unavailable: 'body unavailable' }) });
    } else if (d.verdict === 'ambiguous') {
      const headlines = await Promise.all(d.entries.map(async (c) => ({
        id: c.row.id, subject: c.row.subject, separating: c.separating, question: c.row.question, body: (await body(c.row))?.body ?? null,
      })));
      lines = verdictLines({ verdict: 'ambiguous', headlines });
    } else {
      lines = verdictLines({ verdict: 'none', concepts: d.concepts.map((id) => prep.vocab.concepts.get(id)?.label ?? id) });
    }
    return { verdict: d.verdict, entries: d.entries.map((c) => c.row.id), candidates, tokens: tokensOf(lines), p: d.p, features: d.features, lines };
  };
  fn.ranker = ranker;
  return fn;
}

export const DECIDERS = { [RANKER]: floor1, verdict };

// ── scoring ───────────────────────────────────────────────────────────────────────────────────

/** One labelled row + one decision -> the outcome the metrics count. */
export function outcome(row, d) {
  const expect = new Set(row.expect ?? []);
  const isTarget = row.kind === 'target';
  const right = (ids) => (ids ?? []).some((id) => expect.has(id));
  return {
    id: row.id,
    kind: row.kind,
    split: row.split,
    source: row.source,
    verdict: d.verdict,
    entries: d.entries,
    correct: isTarget && d.verdict === 'answer' && right(d.entries),
    wrongAnswer: d.verdict === 'answer' && !(isTarget && right(d.entries)),
    ambiguousRight: isTarget && d.verdict === 'ambiguous' && right(d.entries),
    top3: isTarget && right(d.listed ?? d.entries),
    recalled: isTarget && right((d.candidates ?? []).slice(0, RECALL_K)),
    tokens: d.tokens,
  };
}

const ratio = (n, d) => ({ n, d, v: d ? n / d : null });

/** The metrics of one split (or of any list of outcomes). */
export function metrics(outs) {
  const targets = outs.filter((o) => o.kind === 'target');
  const controls = outs.filter((o) => o.kind === 'control');
  const answers = outs.filter((o) => o.verdict === 'answer');
  const paraphrases = targets.filter((o) => o.source === 'paraphrase');
  const ambiguous = outs.filter((o) => o.verdict === 'ambiguous');
  return {
    rows: outs.length,
    answerPrecision: ratio(answers.filter((o) => o.correct).length, answers.length),
    controlsNone: ratio(controls.filter((o) => o.verdict === 'none').length, controls.length),
    targetsAnswered: ratio(targets.filter((o) => o.correct).length, targets.length),
    targetsResolved: ratio(targets.filter((o) => o.correct || o.ambiguousRight).length, targets.length),
    paraphraseRecall10: ratio(paraphrases.filter((o) => o.recalled).length, paraphrases.length),
    targetsRecall10: ratio(targets.filter((o) => o.recalled).length, targets.length),
    ambiguousShare: ratio(ambiguous.length, outs.length),
    ambiguousRight: ratio(ambiguous.filter((o) => o.ambiguousRight).length, ambiguous.length),
    wrongAnswers: answers.filter((o) => !o.correct).map((o) => o.id),
    top3: ratio(targets.filter((o) => o.top3).length, targets.length),
    meanTokens: outs.length ? Math.round(outs.reduce((s, o) => s + o.tokens, 0) / outs.length) : null,
  };
}

/** The labelled set as one flat list; `contested` rows are left out of every metric. */
export function labelledRows(set) {
  return [
    ...(set.targets ?? []).map((r) => ({ ...r, kind: 'target' })),
    ...(set.controls ?? []).map((r) => ({ ...r, kind: 'control' })),
  ];
}

// ── the CLI ───────────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { ranker: null, decider: RANKER, splits: ['dev', 'calibration'], openTest: false, set: DEFAULT_SET, base: null, rows: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--decider') args.decider = argv[++i];
    else if (a === '--split') args.splits = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (a === '--open-test') args.openTest = true;
    else if (a === '--set') args.set = resolve(argv[++i]);
    else if (a === '--base') args.base = argv[++i];
    else if (a === '--ranker') args.ranker = resolve(argv[++i]);
    else if (a === '--rows') args.rows = true;
    else if (a === '--json') args.json = true;
    else throw new Error(`unknown argument ${a}`);
  }
  for (const s of args.splits) if (!SPLITS.includes(s)) throw new Error(`unknown split ${s} (one of ${SPLITS.join(', ')})`);
  if (!DECIDERS[args.decider]) throw new Error(`unknown decider ${args.decider} (one of ${Object.keys(DECIDERS).join(', ')})`);
  return args;
}

const pct = (r) => (r.v == null ? '—' : `${r.n}/${r.d} (${(r.v * 100).toFixed(0)}%)`);

function printSplit(name, m) {
  console.log(`\n${name}  (${m.rows} rows)`);
  console.log(`  answer precision   ${pct(m.answerPrecision)}${m.wrongAnswers.length ? `   wrong: ${m.wrongAnswers.join(' ')}` : ''}`);
  console.log(`  controls none      ${pct(m.controlsNone)}`);
  console.log(`  targets resolved   ${pct(m.targetsResolved)}`);
  console.log(`  targets answered   ${pct(m.targetsAnswered)}   (a right entry anywhere in the returned list: ${pct(m.top3)})`);
  console.log(`  paraphrase R@10    ${pct(m.paraphraseRecall10)}   (all targets: ${pct(m.targetsRecall10)})`);
  console.log(`  ambiguous share    ${pct(m.ambiguousShare)}   (carrying a right entry: ${pct(m.ambiguousRight)})`);
  console.log(`  mean tokens/ask    ${m.meanTokens}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.splits.includes('test') && !args.openTest) {
    throw new Error('the test split is opened once, at the gate: pass --open-test to open it (the opening is recorded)');
  }
  const set = JSON.parse(await readFile(args.set, 'utf8'));
  const { reader, why, locator } = openBase({ baseArg: args.base });
  if (!reader) throw new Error(why);
  const cat = await loadIndex(reader);
  if (cat.state !== 'ok') throw new Error(`${cat.state}: ${cat.why}`);
  const rows = retrievable(cat.rows);
  const decide = await DECIDERS[args.decider]({ rows, reader, body: bodyCache(reader), manifest: cat.manifest, set, rankerPath: args.ranker });

  if (args.openTest && args.splits.includes('test')) {
    await appendFile(OPENINGS, `${JSON.stringify({ at: new Date().toISOString(), decider: args.decider, base: locator, set: set.snapshot ?? null })}\n`);
  }

  const labelled = labelledRows(set).filter((r) => args.splits.includes(r.split));
  const outs = [];
  for (const row of labelled) outs.push(outcome(row, await decide(row.q)));

  const bySplit = Object.fromEntries(args.splits.map((s) => [s, metrics(outs.filter((o) => o.split === s))]));
  const misses = outs.filter((o) => WAVE1_MISSES.includes(o.id));
  const report = { decider: args.decider, base: locator, active: rows.length, splits: bySplit, wave1Misses: misses.map(({ id, verdict, entries, correct, recalled }) => ({ id, verdict, entries, correct, recalled })) };

  if (args.json) { console.log(JSON.stringify(args.rows ? { ...report, outcomes: outs } : report, null, 2)); return; }
  console.log(`decider ${args.decider}   base ${locator}   ${rows.length} retrievable rows`);
  if (decide.ranker) console.log(`ranker ${decide.ranker.rank}   thresholds ${JSON.stringify(decide.ranker.thresholds)}   weights ${decide.ranker.model.features.map((f, i) => `${f}=${decide.ranker.model.weights[i].toFixed(2)}`).join(' ')}`);
  for (const [s, m] of Object.entries(bySplit)) printSplit(s, m);
  if (misses.length) {
    console.log('\nwave-1 misses (dev)');
    for (const o of misses) console.log(`  ${o.id.padEnd(6)} ${o.verdict.padEnd(9)} ${o.correct ? 'answered' : o.recalled ? 'in top 10, not answered' : 'not in top 10'}  ${o.entries.join(' ')}`);
  }
  if (args.rows) {
    console.log('\nrows');
    for (const o of outs) {
      const mark = o.correct ? 'ok ' : o.wrongAnswer ? 'BAD' : o.kind === 'control' && o.verdict === 'none' ? 'ok ' : '-- ';
      console.log(`  ${mark} ${o.split.padEnd(11)} ${o.kind.padEnd(7)} ${o.id.padEnd(16)} ${o.verdict.padEnd(9)} ${o.entries.join(' ')}${o.recalled ? '' : o.kind === 'target' ? '  (not in top 10)' : ''}`);
    }
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`verdict-bench: ${err.message}`); process.exit(2); });
}
