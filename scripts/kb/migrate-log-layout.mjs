// ONE-TIME: fold the base's older log files into the current layout, `log/<YYYYMMDD>-<session>.jsonl`.
//
//   npm run kb:migrate-log -- --base <raw locator>            # dry run: prints every move, sends nothing
//   npm run kb:migrate-log -- --base <raw locator> --apply    # one atomic commit, then verified
//
// THE BASE IS PUBLIC AND ITS LOG IS THE PROJECT'S EVIDENCE, so this tool is built around three
// refusals rather than one feature:
//
//   1. NO DEFAULT BASE. `--base` is required and there is no fallback to KB_BASE or the declared
//      default: a migration pointed at `main` by accident is a public commit.
//   2. LINES ARE NEVER REWRITTEN. Containers are regrouped; every line's bytes land unchanged, and
//      none is dropped or de-duplicated — even byte-identical repeats from the 2026-09-21 double
//      push stay, because the migration's job is to move evidence, not to judge it. So the check
//      after is exact: the multiset of lines before equals the multiset after.
//   3. ONE COMMIT, ON THE HEAD THAT WAS READ. A lost compare-and-swap is not retried: somebody pushed
//      in between, the plan is stale, and the right move is to run the dry run again.
//
// It carries its OWN reader for the two older shapes (`oldShape`) rather than borrowing the report's,
// so the report's parser can drop them once this has run without breaking a re-run of this tool —
// which is what a stale checkout still writing the old layout would need.

import { pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

import { writeRefusal } from './core/base.mjs';
import { coordinatesOf, githubApi } from './core/github-api.mjs';
import { logTargetOf } from './core/push.mjs';

// ── the two older shapes, read without the report's help ──────────────────────────────────────

/** `<stamp>-<session>` (to 2026-09-21) and `<session>-<seq>` (to 2026-09-23), under a day folder. */
const STAMPED = /^\d{8}T\d{6}Z-(.+)$/;
const SEQUENCED = /^(.+)-\d{4,}$/;

/**
 * `log/<YYYY-MM-DD>/[<session>/]<name>.jsonl` → `{ day, session }`, or null for anything else —
 * including a file already in the current flat shape, which is therefore never touched. Stamped is
 * tried before sequenced: an all-digit session key satisfies both, and only the stamp is anchored.
 */
export function oldShape(relative) {
  const m = /^log\/(\d{4}-\d{2}-\d{2})\/(?:[^/]+\/)?([^/]+)\.jsonl$/.exec(String(relative));
  if (!m) return null;
  const name = m[2];
  return { day: m[1], session: STAMPED.exec(name)?.[1] ?? SEQUENCED.exec(name)?.[1] ?? name };
}

/** The lines of a log blob as they are stored: split on `\n`, blank lines are not content. */
export const rawLines = (text) => String(text ?? '').split('\n').filter((l) => l.trim() !== '');

/**
 * THE PLAN — pure, so every property the migration promises is a property of this function.
 *
 * @param {Array<{path: string, text: string}>} files every blob under `log/`, paths RELATIVE to the base
 * @returns {{ writes: Map<string,string[]>, deletions: string[], moves: Array, before: object, after: object }}
 *
 * A line is routed exactly as the writer routes it (`logTargetOf`): by its own `at`, and a `session`
 * line to the session it describes. An unparseable line, or one with no usable `at`, falls back to
 * its old file's day folder and session — it keeps its bytes and lands beside its neighbours. A
 * target that already exists in the current shape keeps its lines FIRST, unchanged, and migrated
 * lines follow it; within the migrated lines, order is by `at` (stable, so ties keep file order).
 */
export function planMigration(files) {
  const current = new Map();
  const old = [];
  for (const f of files) {
    if (!f.path.startsWith('log/') || !f.path.endsWith('.jsonl')) continue;
    const shape = oldShape(f.path);
    if (shape) old.push({ ...f, ...shape }); else current.set(f.path, rawLines(f.text));
  }
  old.sort((a, b) => a.path.localeCompare(b.path));

  const incoming = new Map();
  const moves = [];
  for (const f of old) {
    const fallback = new Date(`${f.day}T00:00:00Z`);
    const to = {};
    for (const [i, raw] of rawLines(f.text).entries()) {
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch { /* routed on the fallback, bytes unchanged */ }
      const target = logTargetOf(parsed ?? {}, { session: f.session, fallback });
      const key = Date.parse(String(parsed?.at ?? '')) || fallback.getTime();
      if (!incoming.has(target)) incoming.set(target, []);
      incoming.get(target).push({ raw, key, order: `${f.path}\u0000${String(i).padStart(6, '0')}` });
      to[target] = (to[target] ?? 0) + 1;
    }
    moves.push({ from: f.path, lines: rawLines(f.text).length, to });
  }

  const writes = new Map();
  for (const [target, items] of incoming) {
    items.sort((a, b) => (a.key - b.key) || a.order.localeCompare(b.order));
    writes.set(target, [...(current.get(target) ?? []), ...items.map((x) => x.raw)]);
  }

  const sessionsOf = (entries) => {
    const s = new Set();
    for (const [session, lines] of entries) {
      s.add(session);
      for (const raw of lines) {
        try { const j = JSON.parse(raw); if (j?.kind === 'session' && typeof j.session === 'string') s.add(j.session); } catch { /* not a session line */ }
      }
    }
    return s;
  };
  const flatSession = (p) => /^log\/\d{8}-([^/]+)\.jsonl$/.exec(p)?.[1] ?? '';
  const afterFiles = new Map(current);
  for (const [p, lines] of writes) afterFiles.set(p, lines);

  return {
    writes,
    deletions: old.map((f) => f.path),
    moves,
    before: {
      files: old.length + current.size,
      lines: old.reduce((n, f) => n + rawLines(f.text).length, 0) + [...current.values()].reduce((n, l) => n + l.length, 0),
      sessions: sessionsOf([...old.map((f) => [f.session, rawLines(f.text)]), ...[...current].map(([p, l]) => [flatSession(p), l])]),
    },
    after: {
      files: afterFiles.size,
      lines: [...afterFiles.values()].reduce((n, l) => n + l.length, 0),
      sessions: sessionsOf([...afterFiles].map(([p, l]) => [flatSession(p), l])),
    },
  };
}

/** The exact promise: the multiset of lines is unchanged. Returns the first difference, or null. */
export function sameLines(beforeTexts, afterTexts) {
  const count = (texts) => {
    const m = new Map();
    for (const t of texts) for (const l of rawLines(t)) m.set(l, (m.get(l) ?? 0) + 1);
    return m;
  };
  const a = count(beforeTexts);
  const b = count(afterTexts);
  for (const [l, n] of a) if (b.get(l) !== n) return { line: l.slice(0, 120), before: n, after: b.get(l) ?? 0 };
  for (const [l, n] of b) if (!a.has(l)) return { line: l.slice(0, 120), before: 0, after: n };
  return null;
}

// ── the CLI ───────────────────────────────────────────────────────────────────────────────────

async function readLogs(api, prefix) {
  const ref = await api.getRef();
  if (!ref.ok) throw new Error(`getRef: ${ref.detail}`);
  const commit = await api.getCommit(ref.sha);
  if (!commit.ok) throw new Error(`getCommit: ${commit.detail}`);
  const tree = await api.getTree(commit.tree);
  if (!tree.ok) throw new Error(`getTree: ${tree.detail}`);
  if (tree.truncated) throw new Error('the tree came back truncated — refusing to plan from a partial listing');
  const head = prefix ? `${prefix}/` : '';
  const files = [];
  for (const e of tree.entries) {
    if (e.type !== 'blob' || !e.path.startsWith(`${head}log/`)) continue;
    const blob = await api.getBlob(e.sha);
    if (!blob.ok) throw new Error(`getBlob ${e.path}: ${blob.detail}`);
    files.push({ path: e.path.slice(head.length), text: blob.text });
  }
  return { sha: ref.sha, tree: commit.tree, files };
}

async function main(argv) {
  const at = argv.indexOf('--base');
  const base = at === -1 ? null : argv[at + 1];
  const apply = argv.includes('--apply');
  if (!base) {
    console.error('refused: --base <raw locator> is required, and there is deliberately no default.');
    return 2;
  }
  const coords = coordinatesOf(base);
  if (!coords) { console.error(`refused: ${base} is not a raw.githubusercontent.com base`); return 2; }
  const refused = apply ? writeRefusal(coords) : null;
  if (refused) { console.error(`refused: ${refused}`); return 2; }
  const token = process.env.KB_GITHUB_TOKEN || process.env.GITHUB_TOKEN
    || (() => { try { return execSync('gh auth token', { encoding: 'utf8' }).trim(); } catch { return null; } })();
  const api = githubApi({ owner: coords.owner, repo: coords.repo, branch: coords.branch, token });
  const prefix = coords.prefix ?? '';
  const full = (p) => (prefix ? `${prefix}/${p}` : p);

  const read = await readLogs(api, prefix);
  const plan = planMigration(read.files);
  console.log(`base ${base} @ ${read.sha.slice(0, 7)}`);
  for (const m of plan.moves) {
    const to = Object.entries(m.to).map(([p, n]) => `${p} (${n})`).join(', ');
    console.log(`  ${m.from} [${m.lines}] -> ${to}`);
  }
  console.log('new files:');
  for (const [p, lines] of [...plan.writes].sort()) console.log(`  ${p}  ${lines.length} lines`);
  const lost = [...plan.before.sessions].filter((s) => !plan.after.sessions.has(s));
  console.log(`before: ${plan.before.files} files, ${plan.before.lines} lines, ${plan.before.sessions.size} sessions`);
  console.log(`after:  ${plan.after.files} files, ${plan.after.lines} lines, ${plan.after.sessions.size} sessions`);
  console.log(`sessions missing after: ${lost.length ? lost.join(', ') : 'none'}`);
  if (plan.before.lines !== plan.after.lines || lost.length) { console.error('REFUSED: the plan does not preserve every line and every session'); return 1; }
  if (!plan.deletions.length) { console.log('nothing to migrate.'); return 0; }
  if (!apply) { console.log('dry run — nothing was sent. Re-run with --apply to commit this plan.'); return 0; }
  if (!token) { console.error('refused: no token for --apply'); return 2; }

  const entries = [];
  for (const [p, lines] of plan.writes) {
    const b = await api.createBlob(`${lines.join('\n')}\n`);
    if (!b.ok) throw new Error(`createBlob: ${b.detail}`);
    entries.push({ path: full(p), sha: b.sha });
  }
  for (const d of plan.deletions) entries.push({ path: full(d), sha: null });
  const tree = await api.createTree({ baseTree: read.tree, entries });
  if (!tree.ok) throw new Error(`createTree: ${tree.detail}`);
  const message = `kb: migrate log layout to log/<YYYYMMDD>-<session>.jsonl (${plan.before.files} -> ${plan.after.files} files, ${plan.before.lines} lines unchanged)`;
  const commit = await api.createCommit({ message, tree: tree.sha, parents: [read.sha] });
  if (!commit.ok) throw new Error(`createCommit: ${commit.detail}`);
  const ref = await api.updateRef({ sha: commit.sha });
  if (!ref.ok) { console.error(`NOT APPLIED: ${ref.reason ?? ''} ${ref.detail ?? ''} — the base moved; run the dry run again`); return 1; }
  console.log(`committed ${commit.sha.slice(0, 7)}`);

  // VERIFY FROM THE BASE, not from the plan: re-read what is now there.
  const now = await readLogs(api, prefix);
  const diff = sameLines(read.files.map((f) => f.text), now.files.map((f) => f.text));
  const leftover = now.files.filter((f) => oldShape(f.path)).length;
  console.log(`verify: ${now.files.length} files, ${now.files.reduce((n, f) => n + rawLines(f.text).length, 0)} lines, old-shape files left ${leftover}, line multiset ${diff ? `DIFFERS ${JSON.stringify(diff)}` : 'identical'}`);
  return diff || leftover ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((code) => process.exit(code), (err) => { console.error(err.message); process.exit(1); });
}
