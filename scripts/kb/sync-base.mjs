#!/usr/bin/env node
// `npm run kb:sync-base -- --base <checkout> [--remote origin] [--main main] [--dry-run]` (VCST-6122).
//
// Merges base `main` into the checked-out base branch when `main` only APPENDED evidence to entries
// the branch also holds, or closed a dispute in place (`kb:disputes resolve`, VCST-6179)
// (core/sync-base.mjs says why plain `git merge` is not enough). Steps:
//   1. refuse on a dirty tree or a merge already in progress; fetch <remote>;
//   2. classify everything main changed since the merge base: entries modified (must be
//      evidence-only), entries added (taken as written), entries deleted (refused), other files;
//   3. --dry-run stops here and prints the plan;
//   4. `git merge --no-commit --no-ff <remote>/<main>`, then write every main-modified entry as the
//      branch version + main's new evidence (+ hand-off to successors) + main's dispute resolutions,
//      re-flag duplicate sessions, rebuild index.json, stage the result;
//   5. refuse to leave a half-merge: a merge that did not start is reported, not written over; any
//      other unmerged path, or any failure after the merge started, aborts the merge.
// It NEVER commits or pushes: the base is public, so the staged merge is reviewed and committed by a
// person (`git commit`), then pushed to the branch. New entries from main carry no retrieval card:
// they are listed, and carded with migrate-schema2 keep plans.

import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEntry } from './core/frontmatter.mjs';
import { buildIndex, buildRow } from './core/index-build.mjs';
import { syncEvidence } from './core/sync-base.mjs';

function parseArgs(argv) {
  const a = { base: null, remote: 'origin', main: 'main', dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--base') a.base = argv[++i];
    else if (k === '--remote') a.remote = argv[++i];
    else if (k === '--main') a.main = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
    else throw new Error(`unknown argument ${k}`);
  }
  if (!a.base) throw new Error('usage: --base <local checkout of the base branch> [--remote origin] [--main main] [--dry-run]');
  if (/^https?:/i.test(a.base)) throw new Error('--base must be a local checkout');
  return a;
}

function main() {
  const a = parseArgs(process.argv.slice(2));
  const git = (...args) => execFileSync('git', ['-C', a.base, ...args], { encoding: 'utf8', maxBuffer: 256 << 20 });
  const tryGit = (...args) => { try { return { ok: true, out: git(...args) }; } catch (e) { return { ok: false, out: String(e.stdout ?? '') + String(e.stderr ?? '') }; } };
  const show = (rev, path) => git('show', `${rev}:${path}`);

  if (git('status', '--porcelain').trim()) throw new Error('the base checkout has uncommitted changes; commit or stash them first');
  if (tryGit('rev-parse', '-q', '--verify', 'MERGE_HEAD').ok) throw new Error('a merge is already in progress in the base checkout');
  git('fetch', '-q', a.remote);
  const target = `${a.remote}/${a.main}`;
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').trim();
  const mb = git('merge-base', 'HEAD', target).trim();
  const behind = Number(git('rev-list', '--count', `HEAD..${target}`).trim());
  if (!behind) { console.log(`${branch} already contains ${target}; nothing to do`); return 0; }

  const rows = git('diff', '--name-status', '--no-renames', mb, target).trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
  const entries = rows.filter(([, p]) => /^entries\/.+\.md$/.test(p));
  const modified = entries.filter(([s]) => s === 'M').map(([, p]) => p);
  const added = entries.filter(([s]) => s === 'A').map(([, p]) => p);
  const deleted = entries.filter(([s]) => s === 'D').map(([, p]) => p);
  const other = rows.filter(([, p]) => !/^entries\//.test(p) && p !== 'index.json');

  const changed = new Map(modified.map((p) => [p, { base: show(mb, p), main: show(target, p) }]));
  const branchFiles = new Map(readdirSync(join(a.base, 'entries')).filter((n) => n.endsWith('.md'))
    .map((n) => [`entries/${n}`, readFileSync(join(a.base, 'entries', n), 'utf8')]));
  const r = syncEvidence({ changed, branch: branchFiles });
  const problems = [...r.problems, ...deleted.map((p) => `${p}: deleted on main`)];

  console.log(`${branch} is ${behind} commit(s) behind ${target} (merge base ${mb.slice(0, 7)})`);
  console.log(`  entries modified on main: ${modified.length} (evidence-only required)`);
  console.log(`  entries added on main:    ${added.length} (taken as written; they need retrieval cards)`);
  console.log(`  other files:              ${other.length} (${other.map(([s, p]) => `${s} ${p}`).slice(0, 6).join(', ')}${other.length > 6 ? ', ...' : ''})`);
  if (problems.length) {
    console.error(`refused: ${problems.length} problem(s) need a person; nothing was merged`);
    for (const p of problems) console.error(`  ${p}`);
    return 1;
  }
  for (const id of r.extended) console.log(`  + evidence ${id}`);
  for (const h of r.handedOff) console.log(`  handed off ${h}`);
  for (const d of r.resolvedOn ?? []) console.log(`  resolved on main ${d}`);
  if (a.dryRun) { console.log('dry run: nothing merged'); return 0; }

  const merged = tryGit('merge', '--no-commit', '--no-ff', target);
  const gitSaid = () => merged.out.trim().split('\n').filter(Boolean).slice(0, 5).map((l) => `  git: ${l}`).join('\n');
  // A merge that failed before it started (no MERGE_HEAD) changed nothing: writing the entries now
  // would leave branch-side edits staged with no merge to commit them into.
  if (!tryGit('rev-parse', '-q', '--verify', 'MERGE_HEAD').ok) {
    console.error('refused: git merge did not start; nothing was merged');
    if (!merged.ok) console.error(gitSaid());
    return 1;
  }
  // From here a merge is in progress: any refusal or throw aborts it, never leaves it half done.
  let index;
  try {
    for (const [path, text] of r.writes) writeFileSync(join(a.base, path), text);
    if (r.writes.size) git('add', ...r.writes.keys());
    // index.json is rebuilt below, so its own conflict is not one; any other unmerged path is.
    const unmerged = git('diff', '--name-only', '--diff-filter=U').trim().split('\n').filter((p) => p && p !== 'index.json');
    if (unmerged.length) {
      git('merge', '--abort');
      console.error(`refused: git left ${unmerged.length} path(s) unmerged that this tool does not resolve; the merge was aborted`);
      for (const p of unmerged) console.error(`  ${p}`);
      if (!merged.ok) console.error(gitSaid());
      return 1;
    }
    const all = readdirSync(join(a.base, 'entries')).filter((n) => n.endsWith('.md'))
      .map((n) => buildRow(parseEntry(readFileSync(join(a.base, 'entries', n), 'utf8'), `entries/${n}`).data, `entries/${n}`));
    index = buildIndex(all);
    writeFileSync(join(a.base, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
    git('add', 'index.json');
  } catch (err) {
    tryGit('merge', '--abort');
    throw new Error(`${err.message}\nthe merge was aborted`);
  }
  const uncarded = added.filter((p) => { try { return !(parseEntry(readFileSync(join(a.base, p), 'utf8'), p).data.questions ?? []).length; } catch { return true; } });
  console.log(`merged and staged: index.json rebuilt (${index.count} rows, schema ${index.schema}); ${r.writes.size} entr(ies) rewritten`);
  if (uncarded.length) console.log(`  ${uncarded.length} new entr(ies) without a retrieval card: ${uncarded.map((p) => p.slice(8, -3)).join(' ')}`);
  console.log('review with `git diff --cached`, then `git commit` and push the branch. Nothing was committed.');
  return 0;
}

try { process.exitCode = main(); } catch (err) { console.error(err.message); process.exitCode = 3; }
