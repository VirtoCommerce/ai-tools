#!/usr/bin/env node
// `node scripts/kb/bench/summarize.mjs --base <dir> --out <covers.json>` — STEP 6b (VCST-6087).
//
// Generates, OFF THE BASE, an "also covers" line for every retrievable entry, so the judge can be
// measured on headline + that line (`bench-two-stage.mjs --view covers`) before anyone proposes adding
// such a field to the public base. Nothing is written to the base or to its log.
//
// ONE call per entry, with the committed `summary-prompt.md` as the whole system prompt, written before
// any result was seen. The prompt never sees a label or a benchmark question: a line tuned to the
// questions it will be judged on would measure the tuning. Each line is keyed by a hash of the body it
// was made from, so a re-run reuses what is current and regenerates only what changed.
//
// COST, measured 2026-09-28: about $0.03 per entry through `claude -p` ($5.90 for 194 entries), so
// the cache matters.

process.env.KB_SYNTHETIC = '1';

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

import { openBase } from '../core/base.mjs';
import { parseEntry } from '../core/frontmatter.mjs';
import { loadIndex, retrievable } from '../core/index-load.mjs';
import { JUDGE_MODEL, callWithRetry, pool } from '../bench-two-stage.mjs';

const PROMPT = new URL('./summary-prompt.md', import.meta.url);
const COVERS_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { covers: { type: 'string' } },
  required: ['covers'],
  additionalProperties: false,
});

const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 16);

function parseArgs(argv) {
  const f = { base: null, out: null, concurrency: 6 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') f.base = argv[++i];
    else if (argv[i] === '--out') f.out = argv[++i];
    else if (argv[i] === '--concurrency') f.concurrency = Number(argv[++i]);
  }
  return f;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (!flags.base || !flags.out) throw new Error('usage: summarize.mjs --base <dir> --out <covers.json>');
  const system = readFileSync(PROMPT, 'utf8');
  const promptSha = sha(system);
  const prior = existsSync(flags.out) ? JSON.parse(readFileSync(flags.out, 'utf8')) : null;
  const reuse = prior?.promptSha === promptSha ? prior.covers : {};

  const { reader, why } = openBase({ baseArg: flags.base });
  if (!reader) throw new Error(`no base: ${why}`);
  const cat = await loadIndex(reader);
  if (cat.state !== 'ok') throw new Error(`index not read (${cat.state}): ${cat.why}`);
  const rows = retrievable(cat.rows);

  const covers = {};
  let cost = 0;
  const jobs = [];
  for (const row of rows) {
    jobs.push(async () => {
      const read = await reader.readEntry(row.path);
      if (!read.ok) throw new Error(`${row.id}: body not read (${read.reason})`);
      const body = parseEntry(read.text, row.path).body.trim();
      const bodySha = sha(body);
      if (reuse[row.id]?.bodySha === bodySha) { covers[row.id] = reuse[row.id]; return; }
      const message = `subject: ${row.subject}\nquestion: ${row.question}\n\nbody:\n${body}`;
      const res = await callWithRetry(system, message, COVERS_SCHEMA);
      cost += res.cost;
      covers[row.id] = { bodySha, covers: String(JSON.parse(res.text).covers ?? '').trim() };
    });
  }
  await pool(jobs, flags.concurrency);
  writeFileSync(flags.out, JSON.stringify({ model: JUDGE_MODEL, promptSha, base: flags.base, covers }, null, 2));
  const empty = Object.values(covers).filter((c) => !c.covers).length;
  console.log(`${rows.length} entries · ${empty} with nothing beyond the subject · $${cost.toFixed(3)} → ${flags.out}`);
}

main().catch((err) => { console.error(err.message); process.exit(3); });
