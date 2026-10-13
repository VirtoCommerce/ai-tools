#!/usr/bin/env node
import '../lib/sync-stdio.mjs';
// `npm run kb:normalize-evidence -- --base <checkout> [--history <kb:build-history output>] [--apply]`
//
// The one-off rewrite of the base that VCST-6189 / 6221 / 6186 need, so old evidence reads the way the
// door now writes new evidence. Like `kb:migrate-schema2` it touches a LOCAL CHECKOUT only and never
// commits: the base is public, so the diff is reviewed as a PR. Without `--apply` it prints what it would
// change and writes nothing.
//
// Per evidence item:
//   * STAND (6189): `deployment` onto the stand's one name (the alias map from the `.env.<env>` profiles).
//     `local_<anything>` becomes `local`, the rest kept as the condition `local=<anything>`. A value that
//     is prose would be removed and its text appended to `note` -- absent beats a guessed stand. (None
//     exist: the two "prose deployments" counted in VCST-6189 were `grep "deployment:"` matching entry
//     BODIES that say "on one deployment:", not evidence.)
//   * SOURCE VERSION (6186): an old source item's `module` + `version` become `deployment: <module>@<version>`.
//   * METHOD (6186): onto the closed vocabulary. A free-text value is `source` only when it names a code
//     reading and nothing seen on a stand; anything else -- including what it does not recognise -- stays
//     `observation`. The original wording is kept in `note` as `how: …`, because it says how the agent looked.
//   * BUILD (6221): from `--history`, `build: <pin>` + `buildFrom: deploy-history` on an item that has no
//     build, and `builds/<pin>.json` for every pin used.
// Then `index.json` is rebuilt from every entry with the push's own `buildRow` / `buildIndex`.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseEntry, stringifyFrontmatter } from './core/frontmatter.mjs';
import { buildIndex, buildRow } from './core/index-build.mjs';
import { loadStands, resolveStand } from './core/stands.mjs';
import { codeVersionProblem } from './core/method.mjs';

const NOTE_MAX = 600;
const appendNote = (note, extra) => {
  const text = [note, extra].filter((x) => String(x ?? '').trim()).join(' | ');
  return text.length > NOTE_MAX ? `${text.slice(0, NOTE_MAX - 1)}…` : text;
};

/** A legacy method onto the vocabulary: `{ method, how }` (`how` = the original text, when it said more). */
export function normalizeMethod(raw) {
  const m = String(raw ?? '').trim();
  const low = m.toLowerCase();
  if (!m || low === 'observation') return { method: 'observation', how: null };
  if (low === 'source') return { method: 'source', how: null };
  // SOURCE ONLY WHEN IT SAYS CODE AND NOTHING ELSE. An unrecognised value ("api", "ui", "static analysis
  // of the deployed bundle" -- a deployed artifact read on a stand) was looked at on the stand: it stays
  // an observation, so a live fact never loses its trust level to a guess (review of ai-tools#429).
  if (/^source|^source[-\s]/.test(low) && !/observ|live|deployed|regression-run/.test(low)) return { method: 'source', how: m };
  return { method: 'observation', how: m };
}

/** One item, normalised: `{ item, changes: [kind] }`. `build` is the history's pin for it, or null. */
export function normalizeItem(e, { map, build = null }) {
  const out = { ...e };
  const changes = [];
  const { method, how } = normalizeMethod(e.method);
  if (method !== e.method) { out.method = method; changes.push('method'); }
  if (how) out.note = appendNote(out.note, `how: ${how}`);
  if (method !== 'source' && typeof e.deployment === 'string') {
    const d = e.deployment.trim();
    const local = /^local_(.+)$/i.exec(d);
    const r = resolveStand(d, { map });
    if (r.problem) {
      delete out.deployment;
      out.note = appendNote(out.note, `stand as written: ${d}`);
      changes.push('prose');
    } else if (local && !r.known) {
      out.deployment = 'local';
      out.conditions = [out.conditions, `local=${local[1]}`].filter(Boolean).join('; ');
      changes.push('local');
    } else if (r.value !== e.deployment) {
      out.deployment = r.value;
      changes.push('stand');
    }
  }
  // A source fact from before VCST-6186 named its code as `module` + `version` and had no deployment:
  // the same fact in the rule's shape is `deployment: <module>@<version>` (path / url are kept).
  if (method === 'source' && e.deployment == null && e.module && e.version) {
    out.deployment = `${e.module}@${e.version}`;
    changes.push('source-version');
  }
  // A source item that named a STAND: the door refuses that shape now, so the stand moves to the note --
  // it says where the agent was, not which code version it read.
  if (method === 'source' && typeof out.deployment === 'string' && codeVersionProblem(out.deployment)) {
    out.note = appendNote(out.note, `read on stand: ${out.deployment}`);
    delete out.deployment;
    changes.push('source-stand');
  }
  if (build && !e.build && method !== 'source') { out.build = build; out.buildFrom = 'deploy-history'; changes.push('build'); }
  return { item: out, changes };
}

function main() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const base = arg('--base');
  if (!base || /^https?:/i.test(base)) { console.error('usage: npm run kb:normalize-evidence -- --base <local checkout> [--history <file>] [--apply]'); process.exit(2); }
  const apply = process.argv.includes('--apply');
  const hist = arg('--history') ? JSON.parse(readFileSync(resolve(arg('--history')), 'utf8')) : { items: [], builds: {} };
  // Joined on WHAT the item is (entry, time, session), never on its position: the base can move between
  // `kb:build-history` and `--apply`, and a position would then hand a build to the wrong observation
  // (review of ai-tools#429). An item the history does not know simply gets no build.
  const itemKey = (id, e) => `${id}|${e.at ?? ''}|${e.by ?? ''}`;
  const pinOf = new Map(hist.items.filter((i) => i.build && i.from === 'deploy-history').map((i) => [itemKey(i.id, i), i.build]));
  const map = loadStands();
  const read = (rel) => readFileSync(join(base, rel), 'utf8').replace(/\r\n/g, '\n');

  const before = new Map(); const after = new Map(); const tally = {};
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  const files = new Map(); const writes = new Map(); const pins = new Set();
  let roundtripDrift = 0;
  for (const n of readdirSync(join(base, 'entries')).filter((x) => x.endsWith('.md'))) {
    const path = `entries/${n}`;
    const text = read(path);
    files.set(path, text);
    const { data, body } = parseEntry(text, path);
    // Safety: an untouched entry must stringify to its own bytes, or "only changed files" is not true.
    if (`${stringifyFrontmatter(data)}\n${body}` !== text) roundtripDrift += 1;
    let changed = false;
    const evidence = (data.evidence ?? []).map((e, i) => {
      bump(before, String(e.deployment ?? '(none)').slice(0, 40));
      const r = normalizeItem(e, { map, build: pinOf.get(itemKey(data.id, e)) ?? null });
      for (const c of r.changes) tally[c] = (tally[c] ?? 0) + 1;
      if (r.changes.length) changed = true;
      if (r.item.build && r.changes.includes('build')) pins.add(r.item.build);
      bump(after, String(r.item.deployment ?? '(none)'));
      return r.item;
    });
    if (changed) writes.set(path, `${stringifyFrontmatter({ ...data, evidence })}\n${body}`);
  }
  const table = (m) => [...m].sort((a, b) => b[1] - a[1]).map(([k, v]) => `    ${String(v).padStart(5)}  ${k}`).join('\n');
  console.log(`deployment values BEFORE:\n${table(before)}\n\ndeployment values AFTER:\n${table(after)}\n`);
  console.log(`items changed by kind: ${JSON.stringify(tally)}`);
  console.log(`${writes.size} entr(ies) change; ${pins.size} build snapshot(s) to add${roundtripDrift ? `; WARNING ${roundtripDrift} untouched entr(ies) would not round-trip` : ''}`);
  if (!apply) { console.log('dry run: pass --apply to write'); return; }

  for (const [path, text] of writes) writeFileSync(join(base, path), text);
  mkdirSync(join(base, 'builds'), { recursive: true });
  for (const pin of pins) writeFileSync(join(base, 'builds', `${pin}.json`), `${JSON.stringify({ pin, ...hist.builds[pin] }, null, 2)}\n`);
  // Every index the manifest declares, each row filed under its entry's plane -- the layout `kb reindex`
  // writes. Not `reindex` itself: it queues a log line, and a migration has nothing to say in the public
  // log (review of ai-tools#429).
  const manifest = JSON.parse(read('kb.json'));
  const byPlane = new Map(Object.entries(manifest.indexes ?? {}).map(([plane, file]) => [plane, String(file)]));
  const rowsFor = new Map([...new Set(byPlane.values())].map((file) => [file, []]));
  for (const [path, text] of new Map([...files, ...writes])) {
    const { data } = parseEntry(text, path);
    const file = byPlane.get(String(data.plane ?? 'experiential'));
    if (!file) throw new Error(`${path}: plane "${data.plane}" is not in kb.json indexes`);
    rowsFor.get(file).push(buildRow(data, path));
  }
  for (const [file, rows] of rowsFor) {
    const index = buildIndex(rows);
    writeFileSync(join(base, file), `${JSON.stringify(index, null, 2)}\n`);
    console.log(`written; ${file} rebuilt: ${index.count} rows`);
  }
}

if (process.argv[1] && /normalize-evidence\.mjs$/.test(process.argv[1])) {
  try { main(); } catch (err) { console.error(err.message); process.exit(3); }
}
