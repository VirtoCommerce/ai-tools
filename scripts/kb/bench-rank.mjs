#!/usr/bin/env node
// `node scripts/kb/bench-rank.mjs` — replay the ranker's labelled set against the live index (STEP 6).
//
// It measures BOTH directions, because a ranking change that reports only recall is not measured
// (PLAN §14.4): how many TARGETS land in the top 3 an agent sees, and how many CONTROLS stop being a
// MISS. A control that starts answering is the base losing its ability to say "I don't know", and
// no amount of recall pays for that.
//
// READ-ONLY. It loads the index and calls `scoreRows` directly -- it never goes through `ask`, so it
// writes no log line at all. `KB_SYNTHETIC=1` is set anyway, so that if this ever grows a path
// through the verbs, the traffic is still kept out of the demand panels (§14.2).
//
// THE "floor-1b (scoreRows)" ARM IS rank.mjs ITSELF -- its scoring, its order, its `admissible` -- never a copy:
// it measures the rule the capture side still runs (`ask` itself moved to `two-stage-1`, measured by bench-two-stage.mjs). "floor-1" is the retired rule, rebuilt from `MIN_WORDS` + `MIN_COVERAGE` over the flat
// anchor bonus it ran with (floor-1b kept its admission and changed only the order). Every other arm is a CANDIDATE kept for the record of how the shipped
// rule was chosen: it starts from the same flat-bonus hits and applies its own admission and, where
// it has one, its own anchor weight. `floor-1 + A1+B1 order (a)` is the experiment floor-1b was
// ported from, so it must agree with "floor-1b (scoreRows)" row for row -- a disagreement means the port drifted.

process.env.KB_SYNTHETIC = '1';

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFile } from 'node:fs/promises';

import { openBase } from './core/base.mjs';
import { loadIndex, retrievable } from './core/index-load.mjs';
import { isSingleSegmentPath } from './core/coordinates.mjs';
import { ANCHOR_BONUS, MIN_COVERAGE, MIN_WORDS, TOP_N, admissible, scoreRows, tokenize } from './core/rank.mjs';

const SET = new URL('./bench/rank-labelled-set.json', import.meta.url);

const FLOOR = 4;
const isPage = (key) => isSingleSegmentPath(key);

/**
 * Candidate rules. `admit(hit)` decides what may be returned; `bonus(anchorKey, ctx)`, when an arm
 * has one, RE-WEIGHTS each matched anchor and the hits are re-sorted -- so the ordering arms differ
 * from the admission arms in order, not only in membership. Without `bonus` an anchor is worth a
 * flat `ANCHOR_BONUS`, as it was under floor-1.
 *
 * `ctx.carriers(key)` = how many retrievable entries carry that anchor. That count is what "hot"
 * means: `/cart` sits on 14 entries, so matching it says "about the cart", not "about THIS entry".
 */
const words = (n) => (h) => h.anchors.length > 0 || h.overlap.length >= n;
const ARMS = [
  // `ask` stopped ranking with `scoreRows` at `two-stage-1` (bench-two-stage.mjs measures that). This
  // arm is still rank.mjs's own scoring and admission -- floor-1b, which the capture side runs on.
  { name: 'floor-1b (scoreRows)', shipped: true, admit: admissible },
  { name: 'floor-1', admit: (h) => h.anchors.length > 0 || (h.overlap.length >= MIN_WORDS && h.coverage >= MIN_COVERAGE) },
  { name: 'coverage >= 0.35', admit: (h) => h.anchors.length > 0 || (h.overlap.length >= 2 && h.coverage >= 0.35) },
  { name: 'overlap >= 3', admit: words(3) },
  { name: 'overlap >= 4', admit: words(4) },
  { name: 'overlap >= 5', admit: words(5) },
  // A — a hot anchor weighs less. Admission unchanged from `overlap >= 4`.
  { name: 'A1 >=4, bonus 10/n', admit: words(FLOOR), bonus: (k, ctx) => ANCHOR_BONUS / ctx.carriers(k) },
  { name: 'A2 >=4, bonus 10/sqrt(n)', admit: words(FLOOR), bonus: (k, ctx) => ANCHOR_BONUS / Math.sqrt(ctx.carriers(k)) },
  // B — a PAGE anchor (`/cart`, `/sign-in`) is not a coordinate of one fact.
  {
    name: 'B1 >=4, page anchor ignored',
    admit: (h) => h.anchors.some((k) => !isPage(k)) || h.overlap.length >= FLOOR,
    bonus: (k) => (isPage(k) ? 0 : ANCHOR_BONUS),
  },
  // A1+B1 — a page anchor is neither a bonus nor a bypass; every other anchor weighs 10/n.
  {
    name: 'A1+B1 >=4',
    admit: (h) => h.anchors.some((k) => !isPage(k)) || h.overlap.length >= FLOOR,
    bonus: (k, ctx) => (isPage(k) ? 0 : ANCHOR_BONUS / ctx.carriers(k)),
  },
  // floor-1's coverage admission, with A1+B1 only re-ordering. (a) any anchor still admits, as in
  // floor-1; (b) a page anchor no longer admits either, as in B1.
  {
    name: 'floor-1 + A1+B1 order (a)',
    admit: (h) => h.anchors.length > 0 || (h.overlap.length >= MIN_WORDS && h.coverage >= MIN_COVERAGE),
    bonus: (k, ctx) => (isPage(k) ? 0 : ANCHOR_BONUS / ctx.carriers(k)),
  },
  {
    name: 'floor-1 + A1+B1 (b, page no bypass)',
    admit: (h) => h.anchors.some((k) => !isPage(k)) || (h.overlap.length >= MIN_WORDS && h.coverage >= MIN_COVERAGE),
    bonus: (k, ctx) => (isPage(k) ? 0 : ANCHOR_BONUS / ctx.carriers(k)),
  },
  {
    name: 'B2 >=4, page anchor needs 2 words',
    admit: (h) => h.anchors.some((k) => !isPage(k)) || h.overlap.length >= FLOOR
      || (h.anchors.length > 0 && h.overlap.length >= 2),
  },
];

function rescore(hits, arm, ctx) {
  if (!arm.bonus) return hits;
  return hits
    .map((h) => ({ ...h, score: h.overlap.length + h.anchors.reduce((s, k) => s + arm.bonus(k, ctx), 0) }))
    .sort((a, b) => b.score - a.score
      || (b.row.trust ?? 0) - (a.row.trust ?? 0)
      || a.row.id.localeCompare(b.row.id));
}

function carriersOf(rows) {
  const count = new Map();
  for (const r of rows) for (const k of new Set(r.anchorKeys ?? [])) count.set(k, (count.get(k) ?? 0) + 1);
  return (k) => count.get(k) ?? 1;
}

function parseArgs(argv) {
  const flags = { base: null, verbose: false, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--base') flags.base = argv[++i];
    else if (argv[i] === '--verbose') flags.verbose = true;
    else if (argv[i] === '--json') flags.json = true;
  }
  return flags;
}

/** Position (1-based) of the first expected entry among the ADMITTED hits, or null. */
function admittedRank(admitted, expect) {
  const at = admitted.findIndex((h) => expect.includes(h.row.id));
  return at < 0 ? null : at + 1;
}

export function evaluate(set, rows, arms = ARMS) {
  const cases = [...set.targets, ...set.controls];
  const shipped = new Map(cases.map((c) => [c.id, scoreRows(c.q, rows)]));
  const flat = new Map(cases.map((c) => [c.id, scoreRows(c.q, rows, { weighAnchors: false })]));
  const ctx = { carriers: carriersOf(rows) };
  const admittedFor = (id, arm) => (arm.shipped
    ? shipped.get(id).filter(arm.admit)
    : rescore(flat.get(id), arm, ctx).filter(arm.admit));
  return arms.map((arm) => {
    const targets = set.targets.map((t) => {
      const admitted = admittedFor(t.id, arm);
      const rank = admittedRank(admitted, t.expect);
      return { id: t.id, rank, inTop: rank !== null && rank <= TOP_N };
    });
    const controls = set.controls.map((c) => {
      const admitted = admittedFor(c.id, arm);
      return { id: c.id, broken: admitted.length > 0, served: admitted.slice(0, TOP_N).map((h) => h.row.id) };
    });
    return {
      arm: arm.name,
      targetsInTop: targets.filter((t) => t.inTop).length,
      targets,
      controlsBroken: controls.filter((c) => c.broken).length,
      controls,
    };
  });
}

function describe(h) {
  return `${h.row.id} score ${h.score} overlap ${h.overlap.length} coverage ${h.coverage.toFixed(2)}`
    + `${h.anchors.length ? ` anchor ${h.anchors.join(',')}` : ''} — ${String(h.row.subject).slice(0, 90)}`;
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  const set = JSON.parse(await readFile(SET, 'utf8'));
  const { reader, locator, why } = openBase({ baseArg: flags.base });
  if (!reader) throw new Error(`no base: ${why}`);
  const cat = await loadIndex(reader);
  if (cat.state !== 'ok') throw new Error(`index not read (${cat.state}): ${cat.why}`);
  const rows = retrievable(cat.rows);
  const results = evaluate(set, rows);

  if (flags.json) {
    console.log(JSON.stringify({ base: locator, rows: rows.length, results }, null, 2));
    return;
  }

  console.log(`base ${locator} · ${rows.length} retrievable entries · top ${TOP_N}`);
  console.log(`${set.targets.length} targets · ${set.controls.length} controls\n`);
  const head = ['rule', 'targets in top 3', 'controls broken', ...set.targets.map((t) => t.id)];
  console.log(`| ${head.join(' | ')} |`);
  console.log(`|${head.map(() => '---').join('|')}|`);
  for (const r of results) {
    const ranks = r.targets.map((t) => (t.rank === null ? 'refused' : `#${t.rank}`));
    console.log(`| ${r.arm} | ${r.targetsInTop}/${r.targets.length} | ${r.controlsBroken} | ${ranks.join(' | ')} |`);
  }
  for (const r of results.filter((x) => x.controlsBroken)) {
    for (const c of r.controls.filter((x) => x.broken)) console.log(`  ${r.arm}: ${c.id} served ${c.served.join(', ')}`);
  }

  if (flags.verbose) {
    for (const c of [...set.targets, ...set.controls]) {
      const s = scoreRows(c.q, rows);
      console.log(`\n${c.id}  [${new Set(tokenize(c.q)).size} distinct words]  ${c.q}`);
      s.slice(0, 8).forEach((h, i) => console.log(`  ${i + 1}. ${describe(h)}`));
    }
  }
}

if (import.meta.url === new URL(process.argv[1], 'file:').href || process.argv[1]?.endsWith('bench-rank.mjs')) {
  main().catch((err) => { console.error(err.message); process.exit(3); });
}
