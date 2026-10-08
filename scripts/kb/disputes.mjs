#!/usr/bin/env node
// `npm run kb:disputes -- <list|dossier|cluster|observe|resolve> --base <checkout>` (VCST-6179).
//
//   list                         open disputes, clustered, worst first (--json for the raw states)
//   dossier <KB-id>              everything weighed for one entry: evidence, conditions, builds, notes, body
//   cluster <KB-id>              the dossiers of every disputed entry clustered with it
//   observe <KB-id> --deployment <stand> --conditions "k=v; k=v" --note "<what was seen>"
//                                the investigation's observation of a disputed entry, on the judge's branch
//   resolve <KB-id> --at <iso> --verdict <v> --why "<one sentence>" --in <PR or branch>
//                                close ONE dispute on the entry, in place, and rebuild index.json
//
// Reads a LOCAL checkout of the base (entries + logs). `resolve` writes only to that checkout and
// never commits or pushes: the decision goes to the public base as a reviewed PR, and a human merges
// it. The `/kb-judge` skill is the only intended caller of `resolve`.

import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { parseEntry, stringifyFrontmatter } from './core/frontmatter.mjs';
import { buildIndex, buildRow, RESOLUTIONS } from './core/index-build.mjs';
import { appendObservation, applyResolution, clusters, disputeState, dossier, exposure, hints, priority } from './core/disputes.mjs';
import { canonicalStand } from './core/canonical.mjs';
import { normalizeConditions, repairConditions } from './core/conditions.mjs';
import { undoMsysRewrite } from './core/anchors.mjs';
import { queueDir, hasSessionId, sessionId } from './core/queue.mjs';
import { loadSecrets, scanText } from './core/secret-gate.mjs';
import { cachedWho } from './core/who.mjs';

const USAGE = `usage: npm run kb:disputes -- list --base <checkout> [--json]
       npm run kb:disputes -- dossier <KB-id> --base <checkout>
       npm run kb:disputes -- cluster <KB-id> --base <checkout>
       npm run kb:disputes -- observe <KB-id> --deployment <stand> --conditions "<k=v; k=v>" --note "<...>" --base <checkout>
       npm run kb:disputes -- resolve <KB-id> --at <iso> --verdict <${RESOLUTIONS.join('|')}> --why "<...>" --in <PR> --base <checkout>`;

function parseArgs(argv) {
  const a = { verb: argv[0], id: null, flags: {} };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const name = k.slice(2);
      a.flags[name] = name === 'json' ? true : argv[++i];
    } else if (!a.id) a.id = k.toUpperCase();
    else throw new Error(`unexpected argument ${k}\n${USAGE}`);
  }
  if (!['list', 'dossier', 'cluster', 'observe', 'resolve'].includes(a.verb)) throw new Error(USAGE);
  if (!a.flags.base) throw new Error(`--base <local checkout of the base> is required\n${USAGE}`);
  if (/^https?:/i.test(a.flags.base)) throw new Error('--base must be a local checkout');
  if (a.verb !== 'list' && !a.id) throw new Error(`${a.verb} needs an entry id\n${USAGE}`);
  return a;
}

function readEntries(base) {
  return readdirSync(join(base, 'entries')).filter((n) => n.endsWith('.md')).map((n) => {
    const path = `entries/${n}`;
    return { path, ...parseEntry(readFileSync(join(base, path), 'utf8'), path) };
  });
}

function readLogs(base) {
  const dir = join(base, 'log');
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((n) => n.endsWith('.jsonl')).flatMap((n) => readFileSync(join(dir, n), 'utf8')
    .split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean));
}

/**
 * THE SECRET GATE, which this path would otherwise skip. A door write reaches the base through the
 * queue, and `push` scans every queued line; `observe` and `resolve` write the checkout directly, so
 * the only barrier left would be a reviewer reading a public PR. Kinds only, never the matched text.
 */
function gated(values) {
  const secrets = loadSecrets(process.env);
  if (!secrets.count) console.error('warning: the secret gate loaded no values -- no env file was readable; token shapes and hosts are still checked');
  const hits = scanText(values.filter((v) => v != null).map(String), secrets.values, secrets.hosts);
  return hits.length ? `refused: the secret gate matched ${[...new Set(hits)].join(', ')}; nothing was written` : null;
}

/** Git Bash rewrites an argument that starts with "/" (`--note "/cart ..."`); undo it, as the door does. */
const unshell = (v) => (typeof v === 'string' ? undoMsysRewrite(v, process.env, { wholeArgument: true }) : v);

/** A real session key or none: outside Claude Code each process mints its own, which would make every run "independent". */
const judgeSession = () => (hasSessionId(process.env) ? sessionId(process.env) : null);

function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const f of ['note', 'why', 'in']) a.flags[f] = unshell(a.flags[f]);
  a.flags.conditions = repairConditions(a.flags.conditions, process.env);
  const entries = readEntries(a.flags.base);
  const byId = new Map(entries.map((e) => [String(e.data.id).toUpperCase(), e]));

  // One entry rewritten byte-stably, then the index rebuilt with the builder every writer uses.
  const write = (entry, data) => {
    writeFileSync(join(a.flags.base, entry.path), `${stringifyFrontmatter(data)}\n${entry.body}`);
    const rows = readEntries(a.flags.base).map((e) => buildRow(e.data, e.path));
    writeFileSync(join(a.flags.base, 'index.json'), `${JSON.stringify(buildIndex(rows), null, 2)}\n`);
    return rows.find((x) => x.id === data.id);
  };

  if (a.verb === 'observe') {
    const entry = byId.get(a.id);
    if (!entry) throw new Error(`${a.id} is not in ${a.flags.base}`);
    const cond = normalizeConditions(a.flags.conditions);
    if (cond.problem) { console.error(`refused: --conditions ${cond.problem}`); return 1; }
    const r = appendObservation(entry.data, {
      deployment: canonicalStand(String(a.flags.deployment ?? '')), conditions: cond.value, note: a.flags.note,
      session: judgeSession(), who: cachedWho({ dir: queueDir(process.env), env: process.env }),
    });
    if (r.problem) { console.error(`refused: ${r.problem}`); return 1; }
    const blocked = gated([r.item.deployment, r.item.conditions, r.item.note]);
    if (blocked) { console.error(blocked); return 1; }
    const row = write(entry, r.data);
    console.log(`observed on ${a.id} at ${r.item.at} (${r.item.deployment}); ${row.trust} confirmation(s), ${row.disputed} open dispute(s). Nothing was committed.`);
    return 0;
  }

  if (a.verb === 'resolve') {
    const entry = byId.get(a.id);
    if (!entry) throw new Error(`${a.id} is not in ${a.flags.base}`);
    const r = applyResolution(entry.data, {
      at: a.flags.at, verdict: a.flags.verdict, why: a.flags.why, ref: a.flags.in, session: judgeSession(),
    });
    if (r.problem) { console.error(`refused: ${r.problem}`); return 1; }
    const blocked = gated([a.flags.why, a.flags.in]);
    if (blocked) { console.error(blocked); return 1; }
    // A session is not a person (applyResolution, header): say so when the operator is the same one.
    const me = cachedWho({ dir: queueDir(process.env), env: process.env });
    const filedBy = (entry.data.evidence ?? []).filter((e) => e.contradicts && String(e.at) === String(a.flags.at)).map((e) => e.who).filter(Boolean);
    if (me && filedBy.includes(me)) console.error(`note: this dispute was filed by the same operator (${me}) in another session -- say so in the PR`);
    const row = write(entry, r.data);
    console.log(`resolved the dispute at ${a.flags.at} on ${a.id} as ${a.flags.verdict}; ${row.disputed} open, ${row.resolved ?? 0} resolved`);
    console.log('index.json rebuilt. Review with `git diff`, commit on the cluster branch, open the PR. Nothing was committed.');
    return 0;
  }

  const states = entries.map(disputeState).filter(Boolean);
  const exp = exposure(readLogs(a.flags.base), states);
  const stateOf = new Map(states.map((s) => [s.id, s]));

  if (a.verb === 'dossier') {
    const entry = byId.get(a.id);
    if (!entry) throw new Error(`${a.id} is not in ${a.flags.base}`);
    console.log(dossier(entry, { exp: exp.get(a.id) ?? null, state: stateOf.get(a.id) ?? null }));
    return 0;
  }

  const groups = clusters(states)
    .map((g) => g.sort((x, y) => priority(y, exp.get(y.id)) - priority(x, exp.get(x.id))))
    .sort((x, y) => priority(y[0], exp.get(y[0].id)) - priority(x[0], exp.get(x[0].id)));

  if (a.verb === 'cluster') {
    const group = groups.find((g) => g.some((s) => s.id === a.id));
    if (!group) throw new Error(`${a.id} has no open dispute`);
    console.log(`# Cluster of ${a.id}: ${group.length} disputed entr(ies)\n`);
    for (const s of group) console.log(`${dossier(byId.get(s.id), { exp: exp.get(s.id), state: s })}\n\n---\n`);
    return 0;
  }

  if (a.flags.json) {
    console.log(JSON.stringify(groups.map((g) => g.map((s) => ({ ...s, exposure: exp.get(s.id), hints: hints(s) }))), null, 2));
    return 0;
  }
  const active = entries.filter((e) => String(e.data.status ?? 'active') === 'active').length;
  const resolvedEntries = entries.filter((e) => buildRow(e.data, e.path).resolved).length;
  console.log(`${states.length} of ${active} active entries hold an open dispute, in ${groups.length} cluster(s); ${resolvedEntries} entr(ies) carry a resolved one`);
  groups.forEach((g, i) => {
    const concepts = [...new Set(g.flatMap((s) => s.concepts))].slice(0, 4).join(', ') || g[0].anchors[0] || '—';
    console.log(`\n${i + 1}. ${concepts}  (${g.length})`);
    for (const s of g) {
      const e = exp.get(s.id);
      console.log(`   ${s.id}  ${s.confirmations} confirm / ${s.open} open  served ${e.asks}+${e.shows}  ${s.subject.slice(0, 90)}`);
    }
  });
  return 0;
}

try { process.exitCode = main(); } catch (err) { console.error(err.message); process.exitCode = 3; }
