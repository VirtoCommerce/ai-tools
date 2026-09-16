#!/usr/bin/env node
/**
 * Every question three live runs actually asked, put back to the base.
 *
 *   node measurements/kb-retrieval-2026-09/replay-questions.mjs            # report against the baseline
 *   node measurements/kb-retrieval-2026-09/replay-questions.mjs --write    # rewrite the baseline (deliberate)
 *   node measurements/kb-retrieval-2026-09/replay-questions.mjs --base <path>
 *
 * WHY THIS EXISTS. The retrieval configuration -- the relevance floor, the decision not to boost
 * fields, the decision to keep the platform's prose out of the index -- was settled on numbers that
 * no longer reproduce: the scripts were `_*.mjs` and gitignored, and an independent review found
 * three different fractions quoted for the same measurement. So the base was about to be
 * restructured with no way to notice if retrieval got worse. This is that missing baseline, built
 * from the only held-out questions that exist: ones a working agent asked while doing a real task,
 * with what it did about each answer already recorded at the point of use.
 *
 * It is deliberately mechanical. It does not grade an answer -- grading is what contaminated the
 * seeded corpus. It asks one question per row that a machine can settle:
 *
 *   SAME     the served list is what it was
 *   MOVED    the list changed but the entry that ranked first is still in it
 *   LOST     that entry is gone -- a regression, whatever else improved
 *
 * ROWS ARE REPLAYED AT THE LIMIT THEIR OWN RUN USED. Run 01 passed `--limit 2`; runs 02 and 03
 * took the default 3. Replaying everything at one limit would compare against a served list no
 * agent ever saw, and the whole point of these rows is that they are what agents saw.
 *
 * `want` IS NOT A GRADE I ADDED. Each one is read out of the run's OWN `answer` column -- what the
 * agent wrote down as the answer once it knew, at the point of use:
 *
 *   r1.2  "CartType.discounts ... plus CartType.discountTotal. Both proved to be the fields that
 *         actually moved" -> the entry that describes CartType, KB-D61E2FFA.
 *   r2.9  "the experiential entry KB-D4A064A5 that answers it did not rank ... read it off disk",
 *         and the note says outright: "Resolver ranking issue, not a content gap". Named by id by
 *         the run itself.
 *   r3.2  Query.orders vs Query.organizationOrders is the whole distinction the answer turns on;
 *         run 03's report cites KB-6FE58084 as what the base gave it.
 *
 * Those three rows are the defect this harness exists to close. Every other row is a guard.
 *
 * ONE ANCHOR IS OVERRIDDEN, AND IT WAS OVERRIDDEN AFTER IT FIRED -- say so plainly rather than
 * leave it to be discovered. r2.5's first-ranked entry was `gql-type-customerordertype`, and a
 * change that improved other rows dropped it. But that row's recorded answer names DiscountType,
 * OrderDiscountType and OrderLineItemType, and not CustomerOrderType: the entry led the list
 * without being what the agent used. The rank-1 heuristic was wrong for that row, and the run's own
 * answer column is better evidence than rank. The override carries its reason into the output so
 * the judgement travels with the number instead of hiding behind it.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { deliver } from '../../src/deliver.mjs';
import { QUESTIONS } from './questions.mjs';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const BASELINE = `${HERE}data/baseline.json`;

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : (process.env.KB_BASE ?? 'C:/_VIRTO/vc-knowledge');
const write = args.includes('--write');


const run = () => QUESTIONS.map(({ row, held, want, anchor, because, by, limit, q }) => {
  const d = deliver(base, q, { limit });
  return { row, held, want: want ?? null, anchor: anchor ?? null, because: because ?? null, by: by ?? null, limit, question: q, served: (d.citations ?? []).map((c) => c.id), miss: !d.hit };
});

const current = run();

if (write || !existsSync(BASELINE)) {
  writeFileSync(BASELINE, `${JSON.stringify({ base, at: new Date().toISOString(), rows: current }, null, 2)}\n`);
  console.log(`baseline written: ${BASELINE}`);
  for (const r of current) console.log(`  ${r.row.padEnd(6)} ${r.held.padEnd(10)} ${r.served.join(', ') || '(MISS)'}`);
  process.exit(0);
}

const before = JSON.parse(readFileSync(BASELINE, 'utf8'));
const byRow = new Map(before.rows.map((r) => [r.row, r]));

let lost = 0;
let wantOk = 0;
let wantTotal = 0;
console.log(`baseline taken ${before.at} against ${before.base}`);
console.log(`now            ${new Date().toISOString()} against ${base}`);
console.log('');
for (const r of current) {
  const was = byRow.get(r.row);
  if (!was) {
    console.log(`  ${r.row.padEnd(6)} ${r.held.padEnd(10)} NEW    ${r.served.join(', ') || '(MISS)'}`);
    continue;
  }
  // The entry that ranked FIRST is the one the agent read first and acted on, so it is the one
  // whose disappearance is a regression. A rank change inside the served set is not.
  const anchorId = r.anchor ?? was.served[0] ?? null;
  const kept = anchorId ? r.served.includes(anchorId) : null;
  const changed = JSON.stringify(was.served) !== JSON.stringify(r.served);
  if (kept === false) lost += 1;

  let wantMark = '';
  if (r.want) {
    wantTotal += 1;
    const got = r.served.includes(r.want);
    if (got) wantOk += 1;
    wantMark = got ? `  WANT-OK ${r.want}` : `  WANT-MISSING ${r.want}`;
  }

  const mark = kept === false ? 'LOST  ' : changed ? 'MOVED ' : 'SAME  ';
  console.log(`  ${r.row.padEnd(6)} ${r.held.padEnd(10)} ${mark} ${r.served.join(', ') || '(MISS)'}${wantMark}`);
  if (changed) console.log(`${' '.repeat(25)}was: ${was.served.join(', ') || '(MISS)'}`);
  if (r.anchor) console.log(`${' '.repeat(25)}anchor overridden to ${r.anchor}, by ${r.by ?? '(unattributed)'}: ${r.because}`);
}
console.log('');
console.log(`rows whose first-ranked entry disappeared: ${lost} of ${current.length}`);
console.log(`want rows served:                          ${wantOk} of ${wantTotal}`);
console.log('');
if (lost > 0) {
  console.log('REGRESSION — a question that was answered is no longer served what answered it.');
} else if (wantOk === wantTotal) {
  console.log('BAR MET — every row the runs said was buried is served, and no other row lost what served it.');
} else {
  console.log(`No regression. ${wantTotal - wantOk} of ${wantTotal} buried row(s) still buried — see the README for which, and why it is left open rather than tuned away.`);
}
