#!/usr/bin/env node
/**
 * When in a run's life the base was consulted.
 *
 *   node measurements/kb-live-2026-09/consultation-shape.mjs
 *   node measurements/kb-live-2026-09/consultation-shape.mjs MEASUREMENT   # one directory
 *
 * WHY THIS EXISTS, AND WHY IT IS LATE. "Touches, largest silence, touches in the middle 60%" is the
 * headline number of the whole live measurement. It decided that briefs do not fix front-loading,
 * it is the reason the loop and the arrival hook were built, and it is quoted in three run
 * conditions and in a memory. It has never had a script. Every figure was computed by hand, once,
 * and the definition of "touch" was never written down — so the numbers in the earlier table do not
 * reproduce from the logs they were read off.
 *
 * That is the exact defect the retrieval work opened with: three different fractions quoted for one
 * measurement and no script anywhere that produced any of them. It was fixed there and left here.
 *
 * THE DEFINITIONS, stated because the last set was not:
 *
 *   call         one tool call. A batch tool carries its real work in actions[] and the hook writes
 *                one line per action; continuation parts (part > 1) are NOT calls, matching
 *                countCalls() in tool-log.mjs. Lines and calls differ, and counting lines inflates
 *                a browser-heavy run against a shell-heavy one.
 *   consultation a `kb deliver` or `kb ask` — the run ASKING the base something. This is the number
 *                the front-loading claim was ever about.
 *   kb call      any bin/kb.mjs invocation, consultations plus capture, confirm, validate, demand.
 *                Reported beside it because a run that writes ten entries and asks nothing is not
 *                the same animal as one that asks ten times and writes nothing.
 *   silence      the largest run of consecutive calls with no consultation, counting the tail after
 *                the last one — a run that stops asking at call 9 of 319 has a 310-call silence,
 *                and hiding the tail was how run 03's shape looked less extreme than it was.
 *   middle 60%   consultations falling in [0.2n, 0.8n). Orientation and write-up both sit outside
 *                it, so this counts the ones that happened while the work was actually being done.
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(HERE, '../..');

const IS_KB = /bin[/\\]kb\.mjs/;
// `how` joins them from run 08, which is the run that proved why. Its single `how` call bought the
// biggest measured saving of the whole experiment -- 15 calls from /cart to a placed order against
// run 07's 78 -- and without this it counts as a run that asked the base nothing at all before
// working. Runs 01-07 made no `how` calls, so their numbers below are unchanged by this.
const IS_CONSULT = /bin[/\\]kb\.mjs\s+(?:deliver|ask|how)\b/;

// The authoring session writes into the same directory and its log must never be counted as a run.
const FOREIGN = /c842f27b|authoring/;

function logIn(dir) {
  if (!existsSync(dir)) return null;
  const f = readdirSync(dir).filter((x) => /^tool-log-.*\.jsonl$/.test(x) && !FOREIGN.test(x));
  return f.length === 1 ? join(dir, f[0]) : null;
}

export function shapeOf(path) {
  const calls = readFileSync(path, 'utf8').trim().split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((l) => !(l.part && l.part > 1));

  const at = [];
  let kb = 0;
  calls.forEach((l, i) => {
    const t = l.tool === 'Bash' || l.tool === 'PowerShell' ? String(l.target ?? '') : '';
    if (!IS_KB.test(t)) return;
    kb += 1;
    if (IS_CONSULT.test(t)) at.push(i);
  });

  const n = calls.length;
  let silence = 0;
  let prev = -1;
  for (const i of [...at, n]) {
    silence = Math.max(silence, i - prev - 1);
    prev = i;
  }
  const lo = Math.floor(n * 0.2);
  const hi = Math.ceil(n * 0.8);
  return { calls: n, consultations: at.length, kbCalls: kb, silence, middle: at.filter((i) => i >= lo && i < hi).length, at };
}

const dirs = process.argv.slice(2).length
  ? process.argv.slice(2).map((d) => [d, join(ROOT, d)])
  : [
    ...readdirSync(join(ROOT, 'MEASUREMENT-archive'))
      .filter((d) => /^run-\d+/.test(d))
      .sort()
      .map((d) => [d, join(ROOT, 'MEASUREMENT-archive', d)]),
    ['MEASUREMENT (current)', join(ROOT, 'MEASUREMENT')],
  ];

console.log('run                        calls  consults  kb calls  largest silence  consults in middle 60%');
for (const [name, dir] of dirs) {
  const path = logIn(dir);
  if (!path) {
    console.log(`${name.padEnd(26)} (no single run log in ${dir})`);
    continue;
  }
  const s = shapeOf(path);
  console.log(
    `${name.padEnd(26)} ${String(s.calls).padStart(5)}  ${String(s.consultations).padStart(8)}  ${String(s.kbCalls).padStart(8)}  ${String(s.silence).padStart(15)}  ${String(s.middle).padStart(22)}`,
  );
  console.log(`${' '.repeat(26)} at calls: ${s.at.join(', ') || '(none)'}`);
}
