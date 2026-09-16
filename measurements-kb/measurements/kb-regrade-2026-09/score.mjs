#!/usr/bin/env node
/**
 * Compare a blind grader's verdicts against what the runs said about themselves.
 *
 *   node measurements/kb-regrade-2026-09/score.mjs [verdicts.json]
 *
 * This settles one thing only: whether a party with no stake reaches the same conclusions as the
 * parties that had one. It does not decide who is right when they differ. A run knew what it was
 * trying to do and the grader did not; the grader read the entry cold, as the next agent will. Both
 * of those are real advantages and neither wins by default, so a disagreement is a thing to go and
 * look at, not a thing this script resolves.
 */
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const verdictPath = process.argv[2] ?? join(HERE, 'verdicts.json');

if (!existsSync(verdictPath)) {
  console.error(`no verdicts at ${verdictPath}`);
  console.error('Run the grading session first — see README.md.');
  process.exit(2);
}
const verdicts = JSON.parse(readFileSync(verdictPath, 'utf8'));
const truth = JSON.parse(readFileSync(join(HERE, 'truth.json'), 'utf8'));

if (verdicts.sawSomethingIShouldNotHave) {
  console.log('THE GRADER REPORTS SEEING BLINDED MATERIAL.');
  console.log('Read its note before anything below. A grade formed after reading the answer is not');
  console.log('a grade, and this is the one failure the whole exercise is built to detect.\n');
}

// The two scales are not the same scale, and pretending otherwise would manufacture agreement.
// `held` is what the RUN did with the answer; the grader was asked whether the base ANSWERED. They
// line up at the ends and genuinely do not in the middle, so the middle is reported as its own
// category rather than scored.
const EXPECTED = {
  HELD: 'ANSWERED',
  UNANSWERED: 'NOT-ANSWERED',
  CONTRADICTED: 'ANSWERED',   // it answered; the answer was wrong. Still an answer.
  'NOT-USED': null,           // the run did not use it, which says nothing about whether it answered
};

const byId = new Map(truth.rows.map((r) => [r.id, r]));
let agree = 0;
let disagree = 0;
let unscorable = 0;
const rows = [];

for (const v of verdicts.partA ?? []) {
  const t = byId.get(v.id);
  if (!t) { rows.push([v.id, '(no such row)', v.verdict, '?']); continue; }
  const expected = EXPECTED[t.held];
  if (expected === null || expected === undefined) {
    unscorable += 1;
    rows.push([v.id, t.held, v.verdict, 'not scorable']);
    continue;
  }
  if (expected === v.verdict) { agree += 1; continue; }
  disagree += 1;
  rows.push([v.id, t.held, v.verdict, 'DISAGREE']);
}

console.log('PART A — 26 questions\n');
console.log(`  agree        ${agree}`);
console.log(`  disagree     ${disagree}`);
console.log(`  not scorable ${unscorable}   (the run marked NOT-USED, which says nothing about whether the base answered)`);
if (rows.length) {
  console.log('\n  row      run said      grader said     ');
  for (const [id, held, verdict, mark] of rows) {
    console.log(`  ${String(id).padEnd(8)} ${String(held).padEnd(13)} ${String(verdict).padEnd(15)} ${mark}`);
  }
}
for (const v of verdicts.partA ?? []) {
  const t = byId.get(v.id);
  if (!t || EXPECTED[t.held] === v.verdict || EXPECTED[t.held] == null) continue;
  console.log(`\n  ${v.id}`);
  console.log(`    grader : ${v.verdict} — ${v.why ?? '(no reason given)'}`);
  console.log(`    run    : ${t.held}${t.answer ? ` — ${String(t.answer).slice(0, 160)}` : ''}`);
}

// Part B has no counterpart to compare against, and that absence IS the finding. Every one of these
// entries exists because a run judged it worth writing and nobody has since disagreed in writing.
const b = verdicts.partB ?? [];
const count = (field, value) => b.filter((x) => x[field] === value).length;
console.log('\n\nPART B — 19 entries agents wrote\n');
console.log(`  mechanism     ${count('kind', 'MECHANISM')}     instance ${count('kind', 'INSTANCE')}     mixed ${count('kind', 'MIXED')}`);
console.log(`  transferable  ${count('transfer', 'TRANSFERABLE')}     local ${count('transfer', 'LOCAL')}     unclear ${count('transfer', 'UNCLEAR')}`);
console.log(`  channel right ${count('channel', 'RIGHT')}     wrong ${count('channel', 'WRONG')}`);
console.log('\n  There is nothing to compare these against: no second party has ever judged them.');
console.log('  The claim on record is "all mechanisms, no fixtures", and it is the author\'s.');
const flagged = b.filter((x) => x.kind !== 'MECHANISM' || x.transfer !== 'TRANSFERABLE' || x.channel !== 'RIGHT' || x.note);
if (flagged.length) {
  console.log(`\n  ${flagged.length} entr${flagged.length === 1 ? 'y' : 'ies'} the grader would send back:\n`);
  for (const x of flagged) {
    console.log(`  ${x.id}  ${x.kind}/${x.transfer}/${x.channel}`);
    if (x.note) console.log(`      ${x.note}`);
  }
}

console.log('\n\nWhat this does and does not settle: it says whether a party with no stake reaches the');
console.log('same conclusions as the parties that had one. Where they differ it names the row and');
console.log('stops. The run knew what it was trying to do; the grader read the entry cold, as the');
console.log('next agent will. Neither of those wins by default.');
