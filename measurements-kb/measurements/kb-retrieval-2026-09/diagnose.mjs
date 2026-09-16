#!/usr/bin/env node
/**
 * Why a row is served what it is served.
 *
 *   node measurements/kb-retrieval-2026-09/diagnose.mjs            # every row
 *   node measurements/kb-retrieval-2026-09/diagnose.mjs r2.8 r3.3  # named rows
 *   node measurements/kb-retrieval-2026-09/diagnose.mjs --depth 8
 *
 * `replay-questions.mjs` says WHETHER a served list changed. It deliberately does not say why, and
 * for three rounds of tuning the why was reconstructed by hand each time from `kb stat` and grep.
 * This prints it: for each row, the candidates in score order past the limit, each with its plane,
 * its score, and the exact content terms it matched. The floor and the plane split are the two
 * things being changed, so both are shown per candidate rather than inferred from the outcome.
 *
 * Each matched term is printed with the number of documents that contain it, out of the whole
 * corpus — `wishlist·42` beside `organization·112`. That is what makes run 06's one retrieval
 * failure legible: two candidates matched four of nine terms each, and the coverage count cannot
 * tell you that only one of them matched the noun the question was about.
 *
 * It grades nothing. Which candidate SHOULD have been served is a judgement, and the two blind
 * graders already made it -- `--regrade` prints their verdict beside the row so the judgement and
 * the mechanics are read together instead of in two windows.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

import { openBase, FUNCTION_WORDS } from '../../src/resolve.mjs';
import { tokenize, SEARCH_OPTIONS } from '../../src/index-build.mjs';
import { QUESTIONS } from './questions.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : (process.env.KB_BASE ?? 'C:/_VIRTO/vc-knowledge');
const depth = args.includes('--depth') ? Number(args[args.indexOf('--depth') + 1]) : 6;
const rows = args.filter((a) => /^r\d/.test(a));

// The two graders' Part A verdicts, keyed the way the regrade names rows (r01.1) rather than the
// way the runs did (r1.1).
function verdicts() {
  const p = join(HERE, '../kb-regrade-2026-09/');
  const read = (f) => (existsSync(p + f) ? JSON.parse(readFileSync(p + f, 'utf8')).partA : []);
  const out = new Map();
  for (const [pass, list] of [['pass2', read('verdicts.json')], ['pass1', read('verdicts-pass1.json')]]) {
    for (const r of list) {
      const key = r.id.replace(/^r0?(\d+)\./, 'r$1.');
      if (!out.has(key)) out.set(key, {});
      out.get(key)[pass] = r.verdict;
    }
  }
  return out;
}

const opened = openBase(base);
if (opened.degraded) {
  console.error(opened.degraded.reason);
  process.exit(1);
}
const grades = verdicts();

// HOW COMMON EACH MATCHED TERM IS, over both planes together. Printed because the one retrieval
// failure run 06 produced is invisible without it. Its first question put an entry about deleting an
// organization member above the createWishlist signature, and BOTH matched exactly four of the nine
// content terms -- so neither the floor nor the coverage count says anything at all.
//
// The readout shows what does separate them, and it is NOT rarity. The losing entry matched
// `scoped`, which only four documents carry. What it did not match is `wishlist` -- the noun the
// question is ABOUT -- while matching `storefront`, `create` and `organization`, which are
// circumstance. A first cut of this file flagged candidates whose every matched term was common,
// and it did not fire on the one case it was written for; the flag was removed rather than shipped.
// "The subject noun of the question" is not something an index knows, and that is exactly why this
// stays a readout and does not become a rule.
//
// Counted across both indexes because rarity has to be measured over the corpus a reader is served
// from: the captured index holds 33 documents, so every term in it looks rare against its own index
// and looks like nothing against the derived one.
//
// This is a READOUT, not a rule. A floor keyed on rarity was swept over the 23 rows and changed
// nothing either way, and one row is not a reason to add a constant. It is here so that when there
// are five such rows the argument can be made from them instead of from memory.
function frequencies() {
  const df = new Map();
  let n = 0;
  for (const ms of [opened.derived, opened.captured]) {
    if (!ms) continue;
    n += ms._documentCount;
    for (const [term, node] of ms._index) {
      const docs = new Set();
      for (const [, m] of node) for (const d of m.keys()) docs.add(d);
      df.set(term, (df.get(term) ?? 0) + docs.size);
    }
  }
  return { df, n };
}
const { df: DF, n: CORPUS } = frequencies();
const rarity = (t) => `${t}·${DF.get(t) ?? 0}`;

for (const row of QUESTIONS) {
  if (rows.length && !rows.includes(row.row)) continue;
  const queryTerms = new Set(
    tokenize(row.q).map((t) => t.toLowerCase()).filter((t) => t.length > 1 && !FUNCTION_WORDS.has(t)),
  );
  const search = (index, plane) => (index ? index.search(row.q, SEARCH_OPTIONS).map((h) => ({ ...h, plane })) : []);
  const raw = [...search(opened.derived, 'derived'), ...search(opened.captured, 'experiential')];
  const scored = raw
    .map((h) => ({ ...h, terms: Object.keys(h.match).filter((t) => queryTerms.has(t)) }))
    .sort((a, b) => b.score - a.score);

  const g = grades.get(row.row);
  const gradeMark = g ? `  [pass1 ${g.pass1 ?? '?'} · pass2 ${g.pass2 ?? '?'}]` : '';
  console.log(`${row.row}  limit ${row.limit}  held ${row.held}${gradeMark}`);
  console.log(`  ${row.q}`);
  console.log(`  query terms: ${[...queryTerms].join(' ')}`);
  for (const [i, h] of scored.slice(0, depth).entries()) {
    const served = i < row.limit && h.terms.length > 0 ? '>' : ' ';
    const floor = h.terms.length === 0 ? ' BELOW-FLOOR' : '';
    console.log(
      `  ${served} ${String(i + 1).padStart(2)}. ${h.score.toFixed(2).padStart(7)}  ${h.plane === 'experiential' ? 'EXP' : '   '} ` +
      `${h.id}  ${h.subject}`,
    );
    console.log(`        matched: ${h.terms.map(rarity).join(' ') || '(none)'}${floor}`);
  }
  const expBest = scored.findIndex((h) => h.plane === 'experiential' && h.terms.length > 0);
  console.log(`  best experiential candidate: ${expBest === -1 ? 'none above the floor' : `rank ${expBest + 1}`}`);
  console.log('');
}
