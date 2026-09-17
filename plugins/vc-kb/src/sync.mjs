// GETTING THE BASE ONTO THE MACHINE, and the reason it is a verb rather than a hook.
//
// Claude Code has no install event. The hook surface is SessionStart, UserPromptSubmit, PreToolUse,
// PostToolUse, Stop and SubagentStop -- nothing fires when a plugin is added. So "the plugin fetches
// the base when you install it" is not available, and the honest alternatives are a SessionStart
// hook that would pull 10 MB over the network at the start of every session in every project, or a
// command somebody runs once. This is the command.
//
// The door already knew the address: `baseNotFoundMessage` has always printed the clone line. All
// this does is turn a sentence a person had to retype into something they can run, and put the
// result where every project on the machine will look for it.
//
// A HALF-FINISHED CLONE MUST NEVER LOOK LIKE A BASE. This is the condition the fourth resolution
// step in `base.mjs` was accepted on, so it ships here rather than later. `looksLikeBase` asks one
// question -- is there a `kb.json` -- and a clone interrupted after that file lands but before the
// entries do would answer yes. The corpus would then be REAL but INCOMPLETE, which is the one shape
// the answer contract cannot survive: `ask` would report coverage misses for entries that exist,
// and a miss is the signal that means "go find out and write it down". The base would quietly
// commission work it already holds the answers to.
//
// So the fetch is staged. Everything lands in a sibling temporary directory, is checked there, and
// only then is moved into place by a single rename. A rename within one directory is atomic on
// every filesystem this runs on, and the sibling -- rather than the system temp directory -- is
// what keeps it on one volume, where rename is a rename and not a copy.
import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

import { BASE_MARKER, BASE_REPO, looksLikeBase, managedBaseDir } from './base.mjs';
import { WRITTEN_STORES } from './planes.mjs';
import { readStore, buildCapturedArtifacts } from './capture.mjs';

export class SyncRefused extends Error {}

/**
 * Build any written store's retrieval index that the checkout does not carry.
 *
 * WHY A FETCH HAS TO DO THIS. The base's `.gitignore` excludes the written indexes on the stated
 * ground that they are not content — `kb reindex` rebuilds them byte-identically from the entries.
 * True, and it means a store whose index was never committed arrives with none. Measured
 * 2026-09-17 on a clone taken the documented way: `rules-index.json` was absent (its two siblings
 * are tracked from before the ignore rule, so nobody noticed), and `openBase` answers a missing
 * index with `degraded` — so EVERY `kb ask` on a freshly synced machine returned
 * "MISS (degraded)", including questions the corpus answers well. The feature that put 217 rules
 * in reach of `kb ask` was inert on any machine that followed the setup.
 *
 * ONLY WHAT IS MISSING IS BUILT, and only the INDEX. Two things follow from the same argument. A
 * rebuild of an index the checkout DOES carry would rewrite a tracked file and leave the working
 * tree dirty, so the next `kb sync` could not fast-forward; and `kb reindex` writes the CATALOG
 * beside the index, which IS tracked and whose byte comparison is what catches an entry edited by
 * hand — a fetch that quietly rewrote it would destroy that signal. So: absent index, ignored by
 * the base, built here. Present-but-stale is `kb reindex`'s business and a human's decision.
 */
export function repairIndexes(dir) {
  const built = [];
  for (const [plane, store] of Object.entries(WRITTEN_STORES)) {
    if (!existsSync(join(dir, store.dir)) || existsSync(join(dir, store.index))) continue;
    try {
      if (!readStore(dir, plane).length) continue;
      writeFileSync(join(dir, store.index), buildCapturedArtifacts(dir, plane).index);
      built.push(store.index);
    } catch (e) {
      // A CORPUS PROBLEM MUST NOT LOSE THE FETCH. The clone is already on disk and usable; an entry
      // this cannot parse is `kb validate`'s finding to report, and failing the whole fetch over it
      // would leave a person with no base at all and an error about frontmatter.
      built.push(`${store.index} FAILED — ${e.message}`);
    }
  }
  return built;
}

const git = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

const gitOut = (args, cwd) => {
  const r = git(args, cwd);
  return r.status === 0 ? String(r.stdout ?? '').trim() : null;
};

/**
 * How old the CONTENT is -- the date of the commit checked out, not when the clone was taken.
 *
 * That is the more useful of the two and the only one that needs no network. A clone pulled an hour
 * ago whose HEAD is a month old is not stale: the base has not moved. A clone taken a month ago is
 * only stale if the base moved since, which cannot be known from here. So this reports what is
 * true -- how old the newest fact in the corpus is -- and leaves "is there more" to `kb sync`.
 */
export function baseAge(dir) {
  const iso = gitOut(['log', '-1', '--format=%cI'], dir);
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  return { iso, days: Math.floor((Date.now() - at.getTime()) / 86_400_000) };
}

/** A git checkout of something, as opposed to a directory somebody assembled by hand. */
export const isCheckout = (dir) => Boolean(dir) && existsSync(join(dir, '.git'));

// Removed before every attempt and after every failure. A staging directory left behind by an
// interrupted run would fail the next clone with "already exists", which turns one interruption into
// a permanent one.
const clearStaging = (path) => rmSync(path, { recursive: true, force: true });

/**
 * Fetch the base, or bring an existing checkout up to date.
 *
 * @param {object} opts
 * @param {string} [opts.dir]    where it goes; defaults to the managed checkout
 * @param {string} [opts.repo]   what to clone; defaults to the base's own repository
 * @param {string} [opts.ref]    branch to track; defaults to the repository's default
 * @param {boolean} [opts.depth1] shallow clone (default true — 10 MB either way, the history is
 *                                almost entirely working tree, but shallow is still faster to fetch)
 * @returns {{action:'cloned'|'updated'|'current', dir:string, age:object|null, before?:string, after?:string, indexed:string[]}}
 */
export function sync({ dir = managedBaseDir(), repo = BASE_REPO, ref, depth1 = true } = {}) {
  if (git(['--version']).status !== 0) {
    throw new SyncRefused('kb sync needs git on PATH, and did not find it.');
  }

  // AN EXISTING CHECKOUT IS UPDATED IN PLACE, never replaced. It may hold work somebody has not
  // pushed -- entries captured during a run are written straight into the corpus -- so throwing it
  // away to re-clone would be destroying the very thing this tool exists to accumulate.
  if (isCheckout(dir)) {
    const before = gitOut(['rev-parse', 'HEAD'], dir);
    const r = git(['pull', '--ff-only'], dir);
    if (r.status !== 0) {
      const said = (r.stderr || r.stdout || '').trim().split('\n').filter(Boolean).pop() ?? '';
      throw new SyncRefused(
        `kb sync could not fast-forward ${dir}:\n  ${said}\n\n`
        + 'The checkout has diverged or holds uncommitted work. Nothing was changed. Sort it out\n'
        + 'there with git — this command will not discard a corpus it did not write.',
      );
    }
    const after = gitOut(['rev-parse', 'HEAD'], dir);
    return { action: before === after ? 'current' : 'updated', dir, before, after, age: baseAge(dir), indexed: repairIndexes(dir) };
  }

  if (existsSync(dir)) {
    throw new SyncRefused(
      `kb sync refused: ${dir} exists and is not a git checkout.\n`
      + 'Move it aside or pass --dir. Overwriting a directory somebody assembled by hand is not\n'
      + 'something this command decides on its own.',
    );
  }

  const staging = join(dirname(dir), `.${BASE_MARKER.replace(/\W/g, '')}-staging-${process.pid}`);
  mkdirSync(dirname(dir), { recursive: true });
  clearStaging(staging);
  try {
    const args = ['clone', '--quiet'];
    if (depth1) args.push('--depth', '1');
    if (ref) args.push('--branch', ref);
    args.push(repo, staging);
    const r = git(args);
    if (r.status !== 0) {
      const said = (r.stderr || r.stdout || '').trim().split('\n').filter(Boolean).pop() ?? '';
      throw new SyncRefused(`kb sync could not clone ${repo}:\n  ${said}`);
    }

    // CHECKED BEFORE IT IS BELIEVED, in the staging directory, where a failure costs nothing. This
    // is the whole point of staging: past this line the thing is a base, and everything downstream
    // is entitled to treat it as one.
    if (!looksLikeBase(staging)) {
      throw new SyncRefused(
        `kb sync refused: ${repo} cloned, but the result carries no ${BASE_MARKER}, so it is not a\n`
        + 'knowledge base. Nothing was installed.',
      );
    }

    renameSync(staging, dir);
  } finally {
    clearStaging(staging);
  }

  return { action: 'cloned', dir, after: gitOut(['rev-parse', 'HEAD'], dir), age: baseAge(dir), indexed: repairIndexes(dir) };
}

/** One line a person reads: where the base is, how it got there, how old what is in it is. */
export function renderSync(result) {
  const { action, dir, age, indexed = [] } = result;
  const verb = { cloned: 'cloned', updated: 'updated', current: 'already up to date' }[action] ?? action;
  const when = age ? `  newest fact: ${age.iso.slice(0, 10)} (${age.days}d ago)` : '';
  // Reported rather than done silently: a person who sees `rules-index.json` built here knows why
  // the first fetch took a moment, and knows that a base can arrive without one.
  const built = indexed.length ? `
  built the missing retrieval index: ${indexed.join(', ')}` : '';
  return `base ${verb} at ${dir}${when}${built}`;
}

/** Freshness for a readiness line. Never a gate — a stale base answers, it just answers older. */
export function ageNotice(dir, { staleDays = 30 } = {}) {
  if (!isCheckout(dir)) return null;
  const age = baseAge(dir);
  if (!age) return null;
  return {
    ...age,
    stale: age.days >= staleDays,
    // A month-old base answers plausibly, which is worse than not answering: nothing about the reply
    // looks wrong. So the age is printed always, and flagged past the threshold.
    line: `content ${age.days}d old (${age.iso.slice(0, 10)})${age.days >= staleDays ? ' — run `kb sync`' : ''}`,
  };
}

export { managedBaseDir, BASE_REPO };
