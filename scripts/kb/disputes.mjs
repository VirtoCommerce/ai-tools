#!/usr/bin/env node
// `npm run kb:disputes -- <list|dossier|cluster|observe|resolve> --base <checkout>` (VCST-6179).
//
//   list                         open disputes, clustered, worst first (--json for the raw states)
//   dossier <KB-id>              everything weighed for one entry: evidence, conditions, builds, notes, body
//   cluster <KB-id>              the dossiers of every disputed entry clustered with it
//   observe <KB-id> --deployment <stand> --conditions "k=v; k=v" --note "<what was seen>"
//                                the investigation's observation of a disputed entry, on the judge's branch
//   resolve <KB-id> --at <iso> [--by <session:...>] --verdict <v> --why "<one sentence>" --in <PR or branch>
//           [--main <ref>]       close ONE dispute on the entry, in place, and rewrite that entry's index row;
//                                `claim-amended` records the hash of the body `main` (default origin/main) holds
//
// Reads a LOCAL checkout of the base (entries + logs). `resolve` writes only to that checkout and
// never commits or pushes: the decision goes to the public base as a reviewed PR, and a human merges
// it. The `/kb-judge` skill is the only intended caller of `resolve`.

import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { parseEntry, stringifyFrontmatter } from './core/frontmatter.mjs';
import { buildIndex, buildRow, claimHash, isInvestigation, RESOLUTIONS } from './core/index-build.mjs';
import { standName } from './core/verbs.mjs';
import { appendObservation, applyResolution, clusters, disputeState, dossier, exposure, hints, priority } from './core/disputes.mjs';
import { normalizeConditions, repairConditions } from './core/conditions.mjs';
import { undoMsysRewrite } from './core/anchors.mjs';
import { queueDir, hasSessionId, sessionId } from './core/queue.mjs';
import { loadSecrets, scanText } from './core/secret-gate.mjs';
import { cachedWho } from './core/who.mjs';

const USAGE = `usage: npm run kb:disputes -- list --base <checkout> [--json]
       npm run kb:disputes -- dossier <KB-id> --base <checkout>
       npm run kb:disputes -- cluster <KB-id> --base <checkout>
       npm run kb:disputes -- observe <KB-id> --deployment <stand> --conditions "<k=v; k=v>" --note "<...>" [--main <ref>] --base <checkout>
       npm run kb:disputes -- resolve <KB-id> --at <iso> [--by <dispute's by>] --verdict <${RESOLUTIONS.join('|')}> --why "<...>" --in <PR> [--main <ref>] --base <checkout>`;

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

/**
 * Every entry that parses, and every one that does not. One broken file used to throw out of the
 * whole command; now every verb says which and goes on (a write touches one entry and its own row).
 */
function readEntries(base) {
  const entries = [];
  const broken = [];
  for (const n of readdirSync(join(base, 'entries')).filter((x) => x.endsWith('.md'))) {
    const path = `entries/${n}`;
    try { entries.push({ path, ...parseEntry(readFileSync(join(base, path), 'utf8'), path) }); } catch (err) { broken.push({ path, why: err.message }); }
  }
  return { entries, broken };
}

/**
 * The judging session's own confirm / dispute of `id` still sitting in a queue: the run-private one
 * (`KB_QUEUE_DIR`) and the shared one the MCP server writes. Not in the checkout yet, so the party
 * check cannot see it there (`applyResolution`, `pending`).
 */
function pendingOf(id, by) {
  const dirs = new Set([queueDir(process.env), queueDir({ ...process.env, KB_QUEUE_DIR: '' })]);
  const out = [];
  for (const dir of dirs) {
    let names = [];
    try { names = readdirSync(dir).filter((n) => n.endsWith('.jsonl')); } catch { continue; }
    for (const n of names) {
      let text = '';
      try { text = readFileSync(join(dir, n), 'utf8'); } catch { continue; }
      for (const raw of text.split('\n')) {
        let l;
        try { l = raw.trim() ? JSON.parse(raw) : null; } catch { l = null; }
        if (l && (l.kind === 'confirm' || l.kind === 'dispute') && String(l.id ?? '').toUpperCase() === id && l.payload?.item?.by === by) out.push(l);
      }
    }
  }
  return out;
}

const git = (base, ...args) => execFileSync('git', ['-C', base, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });

/**
 * Bring `<remote>/<branch>` up to date when `ref` names one: both reads below are of `main` as it is
 * NOW, and a ref last fetched before the judge's run is the very staleness they exist to avoid. A
 * failed fetch (offline, no such remote) is said, not fatal.
 */
function refresh(base, ref) {
  const slash = ref.indexOf('/');
  if (slash < 1) return;
  const remote = ref.slice(0, slash);
  try { if (!git(base, 'remote').split('\n').includes(remote)) return; } catch { return; }
  try { git(base, 'fetch', '--quiet', remote, ref.slice(slash + 1)); } catch { console.error(`warning: could not fetch ${ref}; reading it as last fetched`); }
}

/**
 * One entry as `main` holds it: `{ base }` -- its text at the branch's merge base with `ref`, which is
 * what the judge's edit started from -- and `{ tip }` -- its text at `ref` now. Each is `null` when the
 * entry is not there (a split child, new on the branch) and `undefined` when git cannot say.
 */
function onMain(base, path, ref) {
  // ABSENT and UNREADABLE are different answers: only a path git does not have at that revision is
  // "not on main" (a split child). A failed read or an unparsable file is "git cannot say", which the
  // caller warns about instead of silently skipping the claim-amended checks.
  const show = (rev) => {
    try { git(base, 'cat-file', '-e', `${rev}:${path}`); } catch { return null; }
    try { return parseEntry(git(base, 'show', `${rev}:${path}`), path); } catch { return undefined; }
  };
  let mb;
  try { mb = git(base, 'merge-base', 'HEAD', ref).trim(); } catch { return { base: undefined, tip: undefined }; }
  return { base: show(mb), tip: show(ref) };
}

/**
 * The judging session's own confirm / dispute of `entry` that this checkout does not hold: still in a
 * queue, or pushed to `main` (`tip`) after the branch was cut. Its investigation items are exempt.
 */
function outsideEvidence(entry, id, by, tip) {
  if (!by) return [];
  const fromMain = tip ? (tip.data.evidence ?? []).filter((e) => e.by === by && !isInvestigation(e)
    && !(entry.data.evidence ?? []).some((x) => x.at === e.at && x.by === e.by)) : [];
  return [...pendingOf(id, by), ...fromMain];
}

/** Rows of index.json whose counts differ from what the entry's own evidence gives, as lines. */
function indexDrift(base, entries) {
  let rows;
  try { rows = JSON.parse(readFileSync(join(base, 'index.json'), 'utf8')).entries ?? []; } catch { return []; }
  const byId = new Map(rows.map((r) => [String(r.id).toUpperCase(), r]));
  const out = [];
  for (const e of entries) {
    const row = byId.get(String(e.data.id).toUpperCase());
    if (!row) continue;
    const want = buildRow(e.data, e.path);
    const pairs = ['trust', 'disputed', 'resolved'].filter((k) => (row[k] ?? 0) !== (want[k] ?? 0));
    if (pairs.length) out.push(`${want.id}  ${pairs.map((k) => `${k} ${row[k] ?? 0} -> ${want[k] ?? 0}`).join(', ')}`);
  }
  return out;
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

async function main() {
  const a = parseArgs(process.argv.slice(2));
  for (const f of ['note', 'why', 'in']) a.flags[f] = unshell(a.flags[f]);
  a.flags.conditions = repairConditions(a.flags.conditions, process.env);
  const { entries, broken } = readEntries(a.flags.base);
  const byId = new Map(entries.map((e) => [String(e.data.id).toUpperCase(), e]));
  for (const b of broken) console.error(`! ${b.path} does not parse: ${b.why}`);

  // One entry rewritten byte-stably, then ONLY ITS ROW in the index its plane maps to (kb.json).
  // Not `kb reindex`: that rewrites every stale row in the base too, and a judge's diff must hold
  // nothing a verdict does not explain (/kb-judge Step 6). `list` names the stale rows; repairing
  // them is a separate `kb reindex`, reviewed on its own. Rows are kept as written, as push keeps them.
  const write = async (entry, data) => {
    const manifestPath = join(a.flags.base, 'kb.json');
    const indexes = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')).indexes ?? {} : { experiential: 'index.json' };
    const file = indexes[String(data.plane ?? 'experiential')];
    if (!file) throw new Error(`plane "${data.plane}" of ${data.id} is not in kb.json indexes; nothing was written`);
    const indexPath = join(a.flags.base, file);
    const rows = existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')).entries ?? [] : [];
    const row = buildRow(data, entry.path);
    writeFileSync(join(a.flags.base, entry.path), `${stringifyFrontmatter(data)}\n${entry.body}`);
    writeFileSync(indexPath, `${JSON.stringify(buildIndex([...rows.filter((r) => String(r.id).toUpperCase() !== row.id.toUpperCase()), row]), null, 2)}\n`);
    return row;
  };

  if (a.verb === 'observe') {
    const entry = byId.get(a.id);
    if (!entry) throw new Error(`${a.id} is not in ${a.flags.base}`);
    const cond = normalizeConditions(a.flags.conditions);
    if (cond.problem) { console.error(`refused: --conditions ${cond.problem}`); return 1; }
    const session = judgeSession();
    const ref = a.flags.main ?? 'origin/main';
    refresh(a.flags.base, ref);
    const { tip } = onMain(a.flags.base, entry.path, ref);
    if (tip === undefined) console.error(`warning: git could not read ${ref}; the party check sees this checkout and the queues only`);
    const r = appendObservation(entry.data, {
      deployment: standName(String(a.flags.deployment ?? '')), conditions: cond.value, note: a.flags.note,
      session, who: cachedWho({ dir: queueDir(process.env), env: process.env }), body: entry.body,
      pending: outsideEvidence(entry, a.id, session ? `session:${session}` : null, tip),
    });
    if (r.problem) { console.error(`refused: ${r.problem}`); return 1; }
    const blocked = gated([r.item.deployment, r.item.conditions, r.item.note]);
    if (blocked) { console.error(blocked); return 1; }
    const row = await write(entry, r.data);
    console.log(`observed on ${a.id} at ${r.item.at} (${r.item.deployment}); ${row.trust} confirmation(s), ${row.disputed} open dispute(s). Nothing was committed.`);
    return 0;
  }

  if (a.verb === 'resolve') {
    const entry = byId.get(a.id);
    if (!entry) throw new Error(`${a.id} is not in ${a.flags.base}`);
    const session = judgeSession();
    const ref = a.flags.main ?? 'origin/main';
    refresh(a.flags.base, ref);
    const main = onMain(a.flags.base, entry.path, ref);
    if (main.tip === undefined) console.error(`warning: git could not read ${ref}; the party check sees this checkout and the queues only`);
    // claim-amended: what the verdict corrects is the body `main` holds. Unchanged here means the
    // body was never edited (Step 6.1), and the verdict would claim a correction that is not there.
    let amendedFrom = null;
    if (a.flags.verdict === 'claim-amended') {
      // A SPLIT CHILD is new on the branch, so main never held its body -- main held its PARENT's, and
      // that is the wording confirmations kept landing on while the PR was open (push hands them to the
      // child, hashed against the parent). So the parent's body is what this amendment replaced.
      // Up the `splitFrom` chain (a child of a child is two splits from main), taking each ancestor
      // as main held it at the merge base or, failing that, as main holds it now. Every way this ends
      // without a body is SAID: a silent miss records a dated verdict and lets old-wording
      // confirmations count again.
      let before = main.base;
      let from = entry.path;
      let node = entry;
      let warned = false;
      for (let hop = 0; before === null && hop < 8; hop++) {
        const parents = [...new Set((node.data.evidence ?? []).map((e) => e.splitFrom).filter(Boolean))];
        if (parents.length !== 1) {
          console.error(`warning: ${from} is not on ${ref} and names ${parents.length || 'no'} split parent(s); the amendment is dated, not hashed`);
          warned = true;
          break;
        }
        from = `entries/${parents[0]}.md`;
        const at = onMain(a.flags.base, from, ref);
        before = at.base === null && at.tip ? at.tip : at.base;
        node = byId.get(parents[0].toUpperCase()) ?? { data: {} };
      }
      if (before === null && !warned) console.error(`warning: neither ${a.id} nor its split ancestors are on ${ref}; the amendment is dated, not hashed`);
      if (before === undefined) console.error(`warning: git could not show ${from} at ${ref}; the amendment is dated, not hashed`);
      else if (before) {
        if (claimHash(before.body) === claimHash(entry.body)) { console.error(`refused: claim-amended, but the body of ${a.id} is the one ${ref} holds -- edit the claim first`); return 1; }
        amendedFrom = claimHash(before.body);
      }
    }
    const r = applyResolution(entry.data, {
      at: a.flags.at, by: a.flags.by ?? null, verdict: a.flags.verdict, why: a.flags.why, ref: a.flags.in, session,
      pending: outsideEvidence(entry, a.id, session ? `session:${session}` : null, main.tip), amendedFrom,
    });
    if (r.problem) { console.error(`refused: ${r.problem}`); return 1; }
    const blocked = gated([a.flags.why, a.flags.in]);
    if (blocked) { console.error(blocked); return 1; }
    // A session is not a person (applyResolution, header): say so when the operator is the same one.
    const me = cachedWho({ dir: queueDir(process.env), env: process.env });
    const filedBy = (entry.data.evidence ?? []).filter((e) => e.contradicts && String(e.at) === String(a.flags.at)
      && (!a.flags.by || e.by === a.flags.by)).map((e) => e.who).filter(Boolean);
    if (me && filedBy.includes(me)) console.error(`note: this dispute was filed by the same operator (${me}) in another session -- say so in the PR`);
    const row = await write(entry, r.data);
    console.log(`resolved the dispute at ${a.flags.at} on ${a.id} as ${a.flags.verdict}; ${row.disputed} open, ${row.resolved ?? 0} resolved`);
    console.log('its index row rewritten. Review with `git diff`, commit on the cluster branch, open the PR. Nothing was committed.');
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
  // Active entries only, as `/kb-report` panel 5 counts them, so the two numbers agree.
  const live = entries.filter((e) => String(e.data.status ?? 'active') === 'active');
  const resolvedEntries = live.filter((e) => buildRow(e.data, e.path).resolved).length;
  console.log(`${states.length} of ${live.length} active entries hold an open dispute, in ${groups.length} cluster(s); ${resolvedEntries} entr(ies) carry a resolved one`);
  // ROWS THE INDEX GOT WRONG. A client older than VCST-6179 rebuilds the row of any entry it writes
  // with resolved disputes counted as open, and nothing else notices: `ask` compares only `trust`.
  // The entries are the truth and are already read here, so say which rows disagree and the repair.
  const drift = indexDrift(a.flags.base, entries);
  if (drift.length) {
    console.log(`\n! index.json disagrees with ${drift.length} entr(ies) on trust/disputed/resolved (stale rows: an older client rebuilt them, or the counting rule changed); repair with \`npm run kb -- reindex --base ${a.flags.base}\` and commit index.json`);
    for (const d of drift.slice(0, 20)) console.log(`   ${d}`);
  }
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

try { process.exitCode = await main(); } catch (err) { console.error(err.message); process.exitCode = 3; }
