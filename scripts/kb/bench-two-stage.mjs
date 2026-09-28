#!/usr/bin/env node
// `node scripts/kb/bench-two-stage.mjs --base <dir> [--reference <dir> …]` — STEP 6b phase 1 (VCST-6087).
//
// Measures the two-stage design BEFORE it is built: Stage 1 (`bench/candidates.mjs`, BM25 + the
// coordinate channel, no floor) is scored on recall@K, and Stage 2 -- a model judge standing in for
// the agent -- is shown ONLY what an agent would see (the question and K headlines: id, subject,
// question; never a label) and asked to pick the entry that answers or null. `--view bodies` also
// shows each candidate's full body, as `kb_show` would return it (see VIEWS below). The gate
// (from the ticket): controls answered null >= 7/8 AND targets correctly picked >= 9/11, on every
// `--base`. A `--reference` base is measured and printed the same way but never gated -- the
// 2026-09-22 snapshot is one, because two targets' entries postdate it (VCST-6087, 2026-09-28). With
// `--from`, `--reference <locator>` re-marks a saved base as reference.
//
// READ-ONLY on the base and on the log: it loads the index and calls Stage 1 and `scoreRows`
// directly -- never through `ask` -- so it writes no log line. `KB_SYNTHETIC=1` anyway (§14.2).
//
// THE JUDGE is `claude -p` on Haiku, isolated so it cannot see this repo: an empty temporary cwd, no
// tools, no MCP servers, no setting sources (so no project/user CLAUDE.md, hooks or plugins), and the
// committed `bench/judge-prompt.md` as its ENTIRE system prompt. Every case runs `--runs` times
// (default 3) as independent calls; the verdict is the majority, and every disagreement is printed.
// The judge is not unit-tested -- the labelled set is its test.
//
// `--out <file>` saves every raw verdict; `--from <file>` re-prints the table from a saved run
// without calling the model, so a published table can be re-derived from its own evidence.

process.env.KB_SYNTHETIC = '1';

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { openBase } from './core/base.mjs';
import { loadIndex, retrievable } from './core/index-load.mjs';
import { parseEntry } from './core/frontmatter.mjs';
import { RANKER, TOP_N } from './core/rank.mjs';
import { candidates, corpus } from './bench/candidates.mjs';
import { evaluate } from './bench-rank.mjs';

const SET = new URL('./bench/rank-labelled-set.json', import.meta.url);
// What the judge is shown. `headlines` is the design as specified (id, subject, question -- what an
// agent sees before it opens anything). `bodies` adds each candidate's full body, as `kb_show` returns
// it, and has its own prompt, which differs from the first ONLY where the input differs.
//
// `hybrid` shows bodies for the first TOP_N candidates only -- rank.mjs's own "how many bodies one
// question may open" -- and headlines for the rest. `covers` shows no body at all, but a generated
// "also covers" line per entry (`bench/summarize.mjs`, passed with `--covers`), which is the cheap
// field the base would carry if this view holds.
const VIEWS = {
  headlines: new URL('./bench/judge-prompt.md', import.meta.url),
  bodies: new URL('./bench/judge-prompt-bodies.md', import.meta.url),
  hybrid: new URL('./bench/judge-prompt-hybrid.md', import.meta.url),
  covers: new URL('./bench/judge-prompt-covers.md', import.meta.url),
};
export const JUDGE_MODEL = 'claude-haiku-4-5-20251001';
const RECALL_KS = [5, 10, 20];

function parseArgs(argv) {
  const f = { bases: [], ks: [10], runs: 3, fuse: 'add', concurrency: 4, out: null, from: null, view: 'headlines', covers: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--base') f.bases.push({ locator: argv[++i], gated: true });
    else if (a === '--reference') f.bases.push({ locator: argv[++i], gated: false });
    else if (a === '--k') f.ks = argv[++i].split(',').map(Number);
    else if (a === '--runs') f.runs = Number(argv[++i]);
    else if (a === '--fuse') f.fuse = argv[++i];
    else if (a === '--concurrency') f.concurrency = Number(argv[++i]);
    else if (a === '--out') f.out = argv[++i];
    else if (a === '--from') f.from = argv[++i];
    else if (a === '--view') f.view = argv[++i];
    else if (a === '--covers') f.covers.push(argv[++i]);
  }
  return f;
}

/**
 * The headlines an agent would see -- and, in the `headlines` view, the only thing the judge sees.
 * `detail` adds per-entry lines: `bodies` (id -> body) for the first `bodiesTop` entries, and/or
 * `covers` (id -> "also covers" line) for every entry.
 */
export function headlines(list, { bodies = null, bodiesTop = Infinity, covers = null } = {}) {
  const indent = (s) => String(s).replace(/\n/g, '\n         ');
  return list.map((h, i) => `${i + 1}. ${h.row.id}\n   subject: ${h.row.subject}\n   question: ${h.row.question}`
    + (covers && covers.get(h.row.id) ? `\n   also covers: ${indent(covers.get(h.row.id))}` : '')
    + (bodies && i < bodiesTop ? `\n   body: ${indent(bodies.get(h.row.id) ?? '(body unavailable)')}` : '')).join('\n');
}

export function userMessage(question, list, detail = {}) {
  return `The agent asked:\n\n${question}\n\nThe knowledge base returned ${list.length} candidate entr${list.length === 1 ? 'y' : 'ies'}:\n\n`
    + `${list.length ? headlines(list, detail) : '(none)'}\n\nWhich entry answers the agent's question? Reply with the JSON only.`;
}

/** Strict parse of the judge's reply. Anything off-contract is `invalid`, never coerced into a pick. */
export function parseVerdict(text, ids) {
  let v;
  try { v = JSON.parse(String(text).trim()); } catch { return { pick: 'invalid', why: `unparseable: ${String(text).slice(0, 120)}` }; }
  if (!v || typeof v !== 'object' || !('pick' in v)) return { pick: 'invalid', why: 'no pick field' };
  if (v.pick !== null && !ids.includes(v.pick)) return { pick: 'invalid', why: `pick not in list: ${v.pick}` };
  return { pick: v.pick, why: String(v.why ?? '') };
}

let judgeCwd = null; // an empty directory, made on the first call -- importing this file has no side effect

// The reply's SHAPE is enforced by the API (`--json-schema`), not by the prompt: Haiku fences its JSON
// in ```json on its own, and a harness that strips fences is coercing output it was told to reject.
// `pick` is a free string on purpose -- NOT an enum of the listed ids -- so a pick that is not in the
// list stays visible as `invalid` instead of being made impossible.
export const VERDICT_SCHEMA = JSON.stringify({
  type: 'object',
  properties: { pick: { type: ['string', 'null'] }, why: { type: 'string' } },
  required: ['pick', 'why'],
  additionalProperties: false,
});

/**
 * One isolated headless Haiku call (see the header for what "isolated" means). `schema` fixes the
 * reply's shape; the judge's is VERDICT_SCHEMA, and `bench/summarize.mjs` passes its own.
 */
export function callModel(system, message, schema = VERDICT_SCHEMA) {
  const args = ['-p', '--model', JUDGE_MODEL, '--system-prompt', system, '--tools', '', '--strict-mcp-config',
    '--setting-sources', '', '--no-session-persistence', '--output-format', 'json', '--json-schema', schema];
  return new Promise((resolve, reject) => {
    judgeCwd ??= mkdtempSync(join(tmpdir(), 'kb-judge-'));
    const child = spawn('claude', args, { cwd: judgeCwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      try {
        const j = JSON.parse(out);
        const r = Array.isArray(j) ? j.find((x) => x.type === 'result') : j;
        if (!r || r.is_error) throw new Error(r?.result ?? 'no result');
        const models = Object.keys(r.modelUsage ?? {});
        if (models.some((m) => m !== JUDGE_MODEL)) throw new Error(`unexpected model(s): ${models.join(',')}`);
        resolve({
          text: r.structured_output ? JSON.stringify(r.structured_output) : r.result,
          // A long prompt is cached by the CLI, and `input_tokens` then counts only the uncached
          // tail -- the cached part is in the two cache fields. All three are what the model read.
          inputTokens: (r.usage?.input_tokens ?? 0) + (r.usage?.cache_read_input_tokens ?? 0) + (r.usage?.cache_creation_input_tokens ?? 0),
          cost: r.total_cost_usd ?? 0,
        });
      } catch (e) { reject(new Error(`judge call failed (exit ${code}): ${e.message} ${err.slice(0, 200)}`)); }
    });
    child.stdin.end(message);
  });
}

export async function callWithRetry(system, message, schema = VERDICT_SCHEMA) {
  try { return await callModel(system, message, schema); } catch { return callModel(system, message, schema); }
}
const judgeWithRetry = (system, message) => callWithRetry(system, message);

export async function pool(jobs, n) {
  const results = new Array(jobs.length);
  let next = 0;
  let done = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < jobs.length) {
      const i = next++;
      results[i] = await jobs[i]();
      done += 1;
      if (done % 20 === 0 || done === jobs.length) process.stderr.write(`  judged ${done}/${jobs.length}\n`);
    }
  }));
  return results;
}

/** Majority of the runs' picks, or `split` when no value has more than half. */
export function majority(picks) {
  const count = new Map();
  for (const p of picks) count.set(p, (count.get(p) ?? 0) + 1);
  const [best, n] = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  return n * 2 > picks.length ? best : 'split';
}

async function loadBase(locator) {
  const { reader, why } = openBase({ baseArg: locator });
  if (!reader) throw new Error(`no base: ${why}`);
  const cat = await loadIndex(reader);
  if (cat.state !== 'ok') throw new Error(`index not read (${cat.state}): ${cat.why}`);
  return { rows: retrievable(cat.rows), reader };
}

/** Each row's body exactly as `kb_show` returns it: the parsed entry's body, trimmed. */
async function loadBodies(reader, rows) {
  const bodies = new Map();
  await Promise.all(rows.map(async (row) => {
    const read = await reader.readEntry(row.path);
    if (!read.ok) throw new Error(`${row.id}: body not read (${read.reason})`);
    bodies.set(row.id, parseEntry(read.text, row.path).body.trim());
  }));
  return bodies;
}

/**
 * What each view adds to the headlines, for one base. A `covers` file names the base it was made
 * from, and the one for THIS base is required -- lines made from another base's bodies would describe
 * entries that are not the ones being judged.
 */
async function detailFor(flags, locator, reader, rows) {
  if (flags.view === 'bodies') return { bodies: await loadBodies(reader, rows) };
  if (flags.view === 'hybrid') return { bodies: await loadBodies(reader, rows), bodiesTop: TOP_N };
  if (flags.view === 'covers') {
    const file = flags.covers.map((p) => JSON.parse(readFileSync(p, 'utf8'))).find((c) => c.base === locator);
    if (!file) throw new Error(`--view covers: no --covers file was made from ${locator}`);
    const missing = rows.filter((r) => !(r.id in file.covers)).map((r) => r.id);
    if (missing.length) throw new Error(`--covers for ${locator} lacks ${missing.length} entries (${missing.slice(0, 3).join(', ')}…)`);
    return { covers: new Map(Object.entries(file.covers).map(([id, c]) => [id, c.covers])) };
  }
  return {};
}

async function measure(flags, set, system) {
  const cases = [...set.targets.map((t) => ({ ...t, kind: 'target' })), ...set.controls.map((c) => ({ ...c, kind: 'control' }))];
  const bases = [];
  for (const { locator, gated } of flags.bases) {
    const { rows, reader } = await loadBase(locator);
    const detail = await detailFor(flags, locator, reader, rows);
    const ids = new Set(rows.map((r) => r.id));
    const stats = corpus(rows);
    const recall = {};
    for (const fuse of ['add', 'rrf']) {
      recall[fuse] = set.targets.map((t) => {
        const all = candidates(t.q, rows, { k: Infinity, fuse, stats });
        const at = all.findIndex((h) => t.expect.includes(h.row.id));
        return { id: t.id, rank: at < 0 ? null : at + 1, present: t.expect.some((e) => ids.has(e)) };
      });
    }
    const floors = evaluate(set, rows).filter((r) => r.arm.startsWith('current') || r.arm === 'floor-1');
    const jobs = [];
    const judged = [];
    for (const k of flags.ks) {
      for (const c of cases) {
        const list = candidates(c.q, rows, { k, fuse: flags.fuse, stats });
        const listIds = list.map((h) => h.row.id);
        const message = userMessage(c.q, list, detail);
        const entry = { k, id: c.id, kind: c.kind, expect: c.expect ?? [], present: (c.expect ?? []).some((e) => ids.has(e)),
          list: listIds, listChars: headlines(list, detail).length, runs: [] };
        judged.push(entry);
        for (let r = 0; r < flags.runs; r += 1) {
          jobs.push(async () => {
            const res = await judgeWithRetry(system, message);
            entry.runs.push({ ...parseVerdict(res.text, listIds), inputTokens: res.inputTokens, cost: res.cost });
          });
        }
      }
    }
    process.stderr.write(`base ${locator}: ${rows.length} entries, ${jobs.length} judge calls\n`);
    await pool(jobs, flags.concurrency);
    bases.push({ locator, gated, rows: rows.length, recall, floors, judged });
  }
  // One call with an EMPTY list prices the fixed part of the prompt, so the list's own share of the
  // input can be separated from it.
  const empty = await judgeWithRetry(system, userMessage('(calibration)', []));
  return { model: JUDGE_MODEL, view: flags.view, fuse: flags.fuse, runs: flags.runs, ks: flags.ks, ranker: RANKER,
    promptSha: createHash('sha256').update(system).digest('hex').slice(0, 12), fixedInputTokens: empty.inputTokens, bases };
}

function outcome(e) {
  const picks = e.runs.map((r) => r.pick);
  const m = majority(picks);
  const unanimous = picks.every((p) => p === picks[0]);
  if (e.kind === 'control') return { m, unanimous, verdict: m === null ? 'none' : (m === 'split' || m === 'invalid' ? m : 'picked') };
  if (m === null) return { m, unanimous, verdict: 'none' };
  if (m === 'split' || m === 'invalid') return { m, unanimous, verdict: m };
  return { m, unanimous, verdict: e.expect.includes(m) ? 'correct' : 'wrong' };
}

function report(data, set) {
  const lines = [];
  const say = (s = '') => lines.push(s);
  say(`judge ${data.model} · view=${data.view ?? 'headlines'} · prompt sha256:${data.promptSha} · ${data.runs} runs/case, majority · Stage 1 fuse=${data.fuse} · ranker ${data.ranker}`);
  say(`fixed prompt cost (empty list): ${data.fixedInputTokens} input tokens\n`);
  const gates = [];
  for (const b of data.bases) {
    say(`## base ${b.locator} — ${b.rows} retrievable entries${b.gated === false ? ' — REFERENCE, not gated' : ''}`);
    const absent = b.recall.add.filter((t) => !t.present).map((t) => t.id);
    if (absent.length) say(`targets whose entry is NOT in this base (cannot be picked correctly): ${absent.join(', ')}`);
    say('\n### Stage 1 recall (targets)\n');
    say(`| fuse | ${RECALL_KS.map((k) => `@${k}`).join(' | ')} | ${set.targets.map((t) => t.id).join(' | ')} |`);
    say(`|---|${RECALL_KS.map(() => '---').join('|')}|${set.targets.map(() => '---').join('|')}|`);
    for (const [fuse, rs] of Object.entries(b.recall)) {
      const at = (k) => rs.filter((t) => t.rank !== null && t.rank <= k).length;
      say(`| ${fuse} | ${RECALL_KS.map((k) => `${at(k)}/${rs.length}`).join(' | ')} | ${rs.map((t) => (t.rank === null ? '—' : `#${t.rank}`)).join(' | ')} |`);
    }
    say('\n### Stage 2 judge vs. the single-stage rankers\n');
    say('| rule | targets correct | wrong | none | split/invalid | controls none | controls picked | disagreements | ≈ list tokens (chars/4, mean) |');
    say('|---|---|---|---|---|---|---|---|---|');
    for (const f of b.floors) {
      say(`| ${f.arm} (top 3) | ${f.targetsInTop}/${f.targets.length} | — | ${f.targets.filter((t) => t.rank === null).length} refused | — | ${f.controls.length - f.controlsBroken}/${f.controls.length} | ${f.controlsBroken} | — | — |`);
    }
    for (const k of data.ks) {
      const rows = b.judged.filter((e) => e.k === k).map((e) => ({ ...e, ...outcome(e) }));
      const t = rows.filter((e) => e.kind === 'target');
      const c = rows.filter((e) => e.kind === 'control');
      const n = (arr, v) => arr.filter((e) => e.verdict === v).length;
      // Estimated from the list's own text, which every saved run carries -- not from the API's usage,
      // which runs saved before the cache fields were summed under-report once the prompt is cached.
      const mean = Math.round(rows.reduce((s, e) => s + e.listChars, 0) / rows.length / 4);
      const pass = n(c, 'none') >= 7 && n(t, 'correct') >= 9;
      if (b.gated !== false) gates.push({ base: b.locator, k, pass });
      say(`| two-stage, judge @K=${k} | ${n(t, 'correct')}/${t.length} | ${n(t, 'wrong')} | ${n(t, 'none')} | ${n(t, 'split') + n(t, 'invalid')} | ${n(c, 'none')}/${c.length} | ${n(c, 'picked')} (+${n(c, 'split') + n(c, 'invalid')} split/invalid) | ${rows.filter((e) => !e.unanimous).length} | ${mean} |`);
    }
    for (const k of data.ks) {
      say(`\n### Per-row verdicts @K=${k}\n`);
      say('| case | kind | target rank in list | majority | verdict | runs | why (run 1) |');
      say('|---|---|---|---|---|---|---|');
      for (const e of b.judged.filter((x) => x.k === k)) {
        const o = outcome(e);
        const at = e.list.findIndex((id) => e.expect.includes(id));
        const rank = e.kind === 'control' ? '—' : (at < 0 ? (e.present ? 'not in list' : 'absent from base') : `#${at + 1}`);
        const runs = e.runs.map((r) => r.pick ?? 'null').join(', ');
        say(`| ${e.id} | ${e.kind} | ${rank} | ${o.m ?? 'null'} | ${o.verdict}${o.unanimous ? '' : ' ⚠ split'} | ${runs} | ${String(e.runs[0]?.why ?? '').replace(/\|/g, '/')} |`);
      }
    }
    say();
  }
  const cost = data.bases.flatMap((b) => b.judged.flatMap((e) => e.runs.map((r) => r.cost))).reduce((s, x) => s + x, 0);
  say(`judge cost: $${cost.toFixed(3)}`);
  say('\n### Gate (controls none >= 7/8 AND targets correct >= 9/11, on every gated base)\n');
  for (const k of data.ks) {
    const at = gates.filter((g) => g.k === k);
    const verdict = at.length ? (at.every((g) => g.pass) ? 'PASS' : 'FAIL') : 'NOT MEASURED (no gated base)';
    say(`K=${k}: ${at.map((g) => `${g.base.split(/[\\/]/).pop()} ${g.pass ? 'PASS' : 'FAIL'}`).join(' · ')} → ${verdict}`);
  }
  return lines.join('\n');
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const set = JSON.parse(readFileSync(SET, 'utf8'));
  let data;
  if (flags.from) {
    data = JSON.parse(readFileSync(flags.from, 'utf8'));
    const reference = new Set(flags.bases.filter((b) => !b.gated).map((b) => b.locator));
    for (const b of data.bases) if (reference.has(b.locator)) b.gated = false;
  } else {
    if (!flags.bases.length) throw new Error('pass at least one --base');
    if (!VIEWS[flags.view]) throw new Error(`unknown --view: ${flags.view} (${Object.keys(VIEWS).join(' | ')})`);
    const system = readFileSync(VIEWS[flags.view], 'utf8');
    data = await measure(flags, set, system);
    if (flags.out) writeFileSync(flags.out, JSON.stringify(data, null, 2));
  }
  console.log(report(data, set));
}

if (process.argv[1]?.endsWith('bench-two-stage.mjs')) {
  main().catch((err) => { console.error(err.message); process.exit(3); });
}
