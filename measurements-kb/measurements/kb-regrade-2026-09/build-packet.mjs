#!/usr/bin/env node
/**
 * Assemble the blind re-grade packet.
 *
 *   node measurements/kb-regrade-2026-09/build-packet.mjs
 *
 * Everything anyone knows about the quality of this base was decided by a party with an interest in
 * the answer. Each run graded its own question rows. Each run decided its own captures were worth
 * writing. I read the reports and agreed, having also written the tooling and the commit messages
 * claiming the entries are good. Nobody outside that circle has checked any of it, and this is the
 * reviewer's cheapest falsifier, still unrun.
 *
 * So: a session that has not read the journals grades the same material, and the two are compared.
 *
 * WHAT IS BLINDED, AND WHY EACH. From the question rows: `held`, `answer`, `found_via`,
 * `found_elsewhere`, `note` and `backed_by`. The first is the verdict under test. The rest are the
 * run's own reasoning, and a grader who reads "the base surfaced only the derived table for this
 * wording" will not independently decide whether the base answered -- it will agree.
 *
 * WHAT IS NOT BLINDED. The entries themselves, whole, including their confirmation counts. A
 * confirmation is evidence that a second run saw the same thing, not an opinion about quality, and
 * removing it would hide something a fair grader should weigh.
 *
 * The packet is self-contained on purpose. The grader must be able to do the whole job without
 * opening the repositories, because three things in them leak the answer: the run reports, the
 * measurement READMEs, and the git history -- whose commit messages contain my own claims about
 * exactly what is being graded.
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(HERE, 'packet');
const BASE = process.env.KB_BASE ?? 'C:/_VIRTO/vc-knowledge';

const RUNS = [
  ['01', 'run-01-promotions'],
  ['02', 'run-02-order-discount'],
  ['03', 'run-03-org-roles'],
  ['04', 'run-04-member-state'],
];

// When each run started, so the entries it cites can be pulled from the corpus as it stood then.
// Read from the first line of each archived tool log rather than typed here, so it cannot drift.
const RUN_STARTED = Object.fromEntries(RUNS.map(([label, dir]) => {
  const abs = join(ROOT, 'MEASUREMENT-archive', dir);
  const f = existsSync(abs) ? readdirSync(abs).find((x) => /^tool-log-.*\.jsonl$/.test(x)) : null;
  if (!f) return [label, null];
  const first = readFileSync(join(abs, f), 'utf8').split('\n').find(Boolean);
  return [label, JSON.parse(first).ts];
}));

// Minimal CSV reader: the rows carry quoted commas and doubled quotes, and pulling in a parser for
// four files would be the tail wagging the dog.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const servedByHash = (dir) => {
  const f = readdirSync(dir).find((x) => /^kb-log-.*\.jsonl$/.test(x));
  const out = new Map();
  if (!f) return out;
  for (const line of readFileSync(join(dir, f), 'utf8').split('\n').filter(Boolean)) {
    const row = JSON.parse(line);
    if (row.verb !== 'deliver' && row.verb !== 'ask') continue;
    if (row.question_hash) out.set(row.question_hash, (row.served ?? []).map((s) => s.id));
  }
  return out;
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(join(OUT, 'entries'), { recursive: true });

// ---------------------------------------------------------------- part A: the question rows
const questions = [];
const truth = [];
for (const [label, dir] of RUNS) {
  const abs = join(ROOT, 'MEASUREMENT-archive', dir);
  if (!existsSync(abs)) { console.error(`missing archive: ${abs}`); process.exit(1); }
  const csvName = readdirSync(abs).find((x) => /^questions-.*\.csv$/.test(x));
  const rows = parseCsv(readFileSync(join(abs, csvName), 'utf8'));
  const head = rows[0];
  const col = (name) => head.indexOf(name);
  const served = servedByHash(abs);

  for (const r of rows.slice(1)) {
    if (r.length < head.length - 2) continue;
    const id = `r${label}.${r[col('row')]}`;
    questions.push({
      id,
      question: r[col('question')],
      served: served.get(r[col('question')] ? null : null) ?? null,
    });
    truth.push({
      id,
      held: r[col('held')],
      backedBy: r[col('backed_by')],
      answer: r[col('answer')],
      note: r[col('note')],
    });
  }
}

// The served ids come from the verb log rather than the CSV, which does not carry them. Matched on
// the question text through the same hash the journal writes.
const { questionHash } = await import('../../src/journal.mjs');
let i = 0;
for (const [label, dir] of RUNS) {
  const abs = join(ROOT, 'MEASUREMENT-archive', dir);
  const served = servedByHash(abs);
  const csvName = readdirSync(abs).find((x) => /^questions-.*\.csv$/.test(x));
  const rows = parseCsv(readFileSync(join(abs, csvName), 'utf8'));
  const head = rows[0];
  for (const r of rows.slice(1)) {
    if (r.length < head.length - 2) continue;
    questions[i].served = served.get(questionHash(r[head.indexOf('question')])) ?? [];
    i += 1;
  }
}

const entryFiles = readdirSync(join(BASE, 'captured')).filter((f) => f.endsWith('.md')).sort();

const qLines = ['# Part A — questions put to the base, and what it served', ''];
qLines.push(`${questions.length} rows, from four runs. For each: the question an agent asked while doing real work,`);
qLines.push('and the ids the base returned. What the agent concluded is deliberately not here.');
qLines.push('');
for (const q of questions) {
  qLines.push(`## ${q.id}`);
  qLines.push('');
  qLines.push(`**Question.** ${q.question}`);
  qLines.push('');
  // An experiential entry is written once, unsuffixed, because it is graded as it stands today --
  // so Part A must not name a `--rNN` file for one. The second grader hit this on five rows, worked
  // out what had happened and graded them correctly, which is luck rather than design.
  const run = q.id.slice(1, 3);
  const captured = new Set(entryFiles.map((f) => f.replace('.md', '')));
  qLines.push(q.served.length
    ? `**Served.** ${q.served.map((s) => `\`entries/${s}${captured.has(s) ? '' : `--r${run}`}.md\``).join(', ')}`
    : '**Served.** nothing (MISS)');
  qLines.push('');
}
writeFileSync(join(OUT, 'PART-A-questions.md'), `${qLines.join('\n')}\n`);

// ---------------------------------------------------------------- part B: the entries
const capturedDir = join(BASE, 'captured');
for (const f of entryFiles) writeFileSync(join(OUT, 'entries', f), readFileSync(join(capturedDir, f), 'utf8'));

// The entry files carry a run suffix because the SAME id can have a different body per run -- that
// is the whole point of pulling them at each run's commit. Part A names the exact file, so a grader
// never has to guess which version a row was served.

// Every derived entry a Part A row cites, AS IT WAS WHEN THAT ROW WAS ASKED.
//
// The first version of this packet copied today's files, and it produced a false result. Run 01
// asked "Mutations.addItem InputAddItemType" and recorded the full field list as its answer; the
// grader read today's `gql-mutations-additem`, found only a pointer to the type's own entry, and
// marked the row PARTLY. Both were right about different artifacts: the entry run 01 was served was
// 5677 bytes and inlined InputAddItemType's whole table, and the type restructure the next day cut
// it to 1202 bytes and moved that table into `gql-type-inputadditemtype`.
//
// So five of fourteen disagreements were manufactured by this script. A corpus that is regenerated
// cannot be explained by its current state, and a re-grade that forgets this grades the wrong
// thing while looking exactly like one that did not.
const derivedAt = (id, commit) => {
  const r = spawnSync('git', ['show', `${commit}:derived/entries/${id}.md`], { cwd: BASE, encoding: 'utf8' });
  if (r.status === 0) return r.stdout;
  // Before `4c302eb` the derived plane lived at `entries/`, not `derived/entries/`.
  const legacy = spawnSync('git', ['show', `${commit}:entries/${id}.md`], { cwd: BASE, encoding: 'utf8' });
  return legacy.status === 0 ? legacy.stdout : null;
};

// The last commit at or before the run started is what that run was reading.
const commitFor = (isoDate) => spawnSync(
  'git', ['rev-list', '-1', `--before=${isoDate}`, 'HEAD'], { cwd: BASE, encoding: 'utf8' },
).stdout.trim();

let copied = 0;
let stale = 0;
for (const [label] of RUNS) {
  const commit = commitFor(RUN_STARTED[label]);
  for (const q of questions.filter((x) => x.id.startsWith(`r${label}.`))) {
    for (const id of q.served) {
      const asServed = commit ? derivedAt(id, commit) : null;
      if (asServed === null) continue;
      const f = `${id}--r${label}.md`;
      writeFileSync(join(OUT, 'entries', f), asServed);
      copied += 1;
      const now = join(BASE, 'derived', 'entries', `${id}.md`);
      if (existsSync(now) && readFileSync(now, 'utf8') !== asServed) stale += 1;
    }
  }
}

// ---------------------------------------------------------------- the answer key, kept apart
writeFileSync(join(HERE, 'truth.json'), `${JSON.stringify({ builtAt: new Date().toISOString(), rows: truth }, null, 2)}\n`);

console.log(`packet: ${OUT}`);
console.log(`  Part A     ${questions.length} question rows`);
console.log(`  entries    ${entryFiles.length} captured + ${copied} derived, each AS SERVED to the run that cites it`);
console.log(`             ${stale} of those differ from the same entry today — the corpus has been regenerated since`);
console.log(`  answer key ${join(HERE, 'truth.json')}  — NOT in the packet, do not hand it over`);
