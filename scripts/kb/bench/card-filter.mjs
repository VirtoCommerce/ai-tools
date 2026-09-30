#!/usr/bin/env node
// The doc2query-- filter over the retrieval cards (VCST-6122 Decision 3; arXiv 2301.03266).
//
// A card question earns its place only if it FINDS ITS ENTRY. Each question is asked of the base with
// that one sentence left out of its own entry (otherwise every question finds itself, trivially), and
// when the entry that comes first is ANOTHER entry the question is dropped: it describes that other
// fact at least as well as this one, and keeping it would teach the ranker to confuse the two.
//
// Ties do not drop: a question is dropped only when another entry is strictly ahead of its own.
//
// DRY RUN BY DEFAULT. Dropping questions changes base data, and base data changes only with the
// operator's approval, so this prints what it would drop and writes nothing. The push-side filter of
// M5 will call the same `cardVerdicts`.
//
//   KB_SYNTHETIC=1 node scripts/kb/bench/card-filter.mjs --base <dir> [--list] [--json]

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { openBase } from '../core/base.mjs';
import { loadIndex, retrievable } from '../core/index-load.mjs';
import { prepareVocabulary } from '../core/query.mjs';
import { prepareRetrieval, retrieve } from '../core/retrieve.mjs';

/**
 * Every card question of every entry, judged.
 *
 * @returns {Array<{id:string, question:number, text:string, keep:boolean, rank:number, top:string}>}
 *   `rank` is the entry's own position for that question (0 when not found at all); `top` the id that
 *   came first.
 */
export function cardVerdicts(prep) {
  const out = [];
  prep.rows.forEach((row, index) => {
    (row.questions ?? []).forEach((text, question) => {
      const { candidates } = retrieve(prep, text, { leaveOut: { index, question } });
      const own = candidates.findIndex((c) => c.row.id === row.id);
      const ahead = own < 0 ? candidates.length > 0 : candidates[0].fused > candidates[own].fused;
      out.push({ id: row.id, question, text, keep: !ahead, rank: own + 1, top: candidates[0]?.row.id ?? null });
    });
  });
  return out;
}

/** Totals and the entries a filtered card would leave short. */
export function summarise(verdicts, { minQuestions = 3 } = {}) {
  const byEntry = new Map();
  for (const v of verdicts) {
    if (!byEntry.has(v.id)) byEntry.set(v.id, { kept: 0, dropped: 0 });
    byEntry.get(v.id)[v.keep ? 'kept' : 'dropped'] += 1;
  }
  const entries = [...byEntry.values()];
  const collisions = new Map();
  for (const v of verdicts) if (!v.keep) {
    const pair = [v.id, v.top].sort().join(' ~ ');
    collisions.set(pair, (collisions.get(pair) ?? 0) + 1);
  }
  return {
    questions: verdicts.length,
    dropped: verdicts.filter((v) => !v.keep).length,
    entries: entries.length,
    entriesTouched: entries.filter((e) => e.dropped).length,
    entriesEmptied: [...byEntry].filter(([, e]) => !e.kept).map(([id]) => id),
    entriesBelowMin: [...byEntry].filter(([, e]) => e.kept && e.kept < minQuestions).map(([id]) => id),
    topCollisions: [...collisions].sort((a, b) => b[1] - a[1]).slice(0, 15),
  };
}

/** Read `vocabulary.json` from a base; absent is an empty vocabulary, never an error. */
export async function readVocabulary(reader) {
  const r = await reader.readIndex('vocabulary.json');
  return r.ok ? JSON.parse(r.text) : { concepts: [] };
}

async function main() {
  const argv = process.argv.slice(2);
  const at = argv.indexOf('--base');
  const { reader, why, locator } = openBase({ baseArg: at >= 0 ? argv[at + 1] : null });
  if (!reader) throw new Error(why);
  const cat = await loadIndex(reader);
  if (cat.state !== 'ok') throw new Error(`${cat.state}: ${cat.why}`);
  const prep = prepareRetrieval(retrievable(cat.rows), prepareVocabulary(await readVocabulary(reader)));
  const verdicts = cardVerdicts(prep);
  const s = summarise(verdicts);
  if (argv.includes('--json')) { console.log(JSON.stringify({ base: locator, ...s, verdicts }, null, 2)); return; }
  console.log(`base ${locator}   ${prep.n} retrievable rows   DRY RUN, nothing written`);
  console.log(`  card questions      ${s.questions}`);
  console.log(`  would drop          ${s.dropped} (${(100 * s.dropped / s.questions).toFixed(1)}%)`);
  console.log(`  entries touched     ${s.entriesTouched} of ${s.entries}`);
  console.log(`  cards left empty    ${s.entriesEmptied.length}${s.entriesEmptied.length ? `: ${s.entriesEmptied.join(' ')}` : ''}`);
  console.log(`  cards left below 3  ${s.entriesBelowMin.length}`);
  console.log('  most frequent collisions (entry ~ entry: questions)');
  for (const [pair, n] of s.topCollisions) console.log(`    ${pair}: ${n}`);
  if (argv.includes('--list')) {
    for (const v of verdicts.filter((x) => !x.keep)) console.log(`  drop ${v.id} q${v.question + 1} (own rank ${v.rank || '—'}, top ${v.top}): ${v.text}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => { console.error(`card-filter: ${err.message}`); process.exit(2); });
}
