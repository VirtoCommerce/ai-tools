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
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
 * WHAT GIT DOES NOT CARRY IS OURS TO KEEP CORRECT, and only the INDEX is touched. An index the
 * repository TRACKS arrives with the pull and is left alone: rewriting it would dirty the working
 * tree and the next `kb sync` could not fast-forward. An IGNORED one never arrives at all, so
 * after a fetch that changed the entries it is stale — and a stale index is not a notice, it is a
 * `kb validate` PROBLEM. Measured the first time a real pull carried a corrected rule: the entry
 * came down, the index git never had did not, and validate failed on that machine.
 *
 * The CATALOG is never rebuilt here. It is tracked, it comes down with the pull, and its byte
 * comparison is what catches an entry edited by hand — a fetch that quietly rewrote it would
 * destroy that signal.
 */
export function repairIndexes(dir) {
  const built = [];
  for (const [plane, store] of Object.entries(WRITTEN_STORES)) {
    if (!existsSync(join(dir, store.dir))) continue;
    // Present AND git's to deliver: leave it alone. Present and OURS: rebuild it, because nothing
    // else will, and `kb validate` fails on a stale one.
    if (existsSync(join(dir, store.index)) && !isUntracked(dir, store.index)) continue;
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
 * Does git carry this file, or is it ours to maintain?
 *
 * The line between the two is the whole of the index question. A tracked index arrives with the
 * pull and is git's business; an ignored one does not arrive at ALL, so after a fetch that changed
 * the entries it is stale, and `kb validate` FAILS on a stale index — not a notice, a problem.
 * Measured the first time a real pull carried a corrected rule: the entry came down, the index git
 * never had did not, and the next `kb validate` on that machine failed.
 */
const isUntracked = (dir, file) => gitOut(['ls-files', '--', file], dir) === '';

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
 * The open loop's ledger, which every `kb ask` appends to and git tracks.
 *
 * THIS COMBINATION BREAKS THE FETCH, and it breaks it for everybody who uses the tool as intended.
 * `demand.jsonl` is deliberately IN the corpus — an unanswered question is a fact about the base,
 * not about whoever asked, so the next agent inherits it. It is equally deliberately APPEND-ONLY:
 * two agents work against one base at once and a read-modify-write would drop one of their rows.
 * The consequence nobody had hit yet: one `kb ask` leaves the checkout dirty, and the next
 * `git pull --ff-only` that carries somebody else's asks refuses with *"your local changes would be
 * overwritten"*. Reproduced in a sandbox, not reasoned about. Every user reaches it; the only
 * reason this base has not is that it has one writer.
 *
 * Git cannot merge it, because git does not know the format. This tool does, and an append-only log
 * of independent rows has exactly one correct merge: the union, in order. So the rows written since
 * the last commit are PARKED, the file is restored to what HEAD says, the fast-forward runs, and
 * the parked rows are appended to whatever came down — including when the pull fails, which leaves
 * the checkout exactly as it was found.
 *
 * ONLY AN APPEND IS PARKED. If the working copy is not the committed file plus new lines, somebody
 * edited or truncated it, and this refuses to be clever about that: the pull then fails the way it
 * always did, with git's own words.
 */
export const DEMAND_FILE = 'demand.jsonl';
/**
 * Where the parked rows sit for the few milliseconds they are not in the ledger.
 *
 * Because the park RESTORES the tracked file, there is a window in which the only copy of those
 * rows is in this process's memory — and the first sandbox run of this code died in exactly that
 * window and took a row with it. So they go to disk first. Untracked, so it cannot block the
 * fast-forward it exists to enable; picked up by the next sync if a run dies mid-flight.
 *
 * The residual risk is a duplicated row rather than a lost one — a crash between the append and the
 * unlink replays it next time — and that is the right way round for a log whose counts are a
 * signal: one extra "asked" is noise, a missing question is a coverage gap nobody will ever see.
 */
export const PARKED_FILE = 'demand.jsonl.parked';

export function parkDemand(dir) {
  const file = join(dir, DEMAND_FILE);
  const parked = join(dir, PARKED_FILE);
  // A LEFTOVER IS ROWS NOBODY PUT BACK. Replayed before anything else is considered.
  if (existsSync(parked)) return readFileSync(parked, 'utf8') || null;
  if (!existsSync(file)) return null;
  const shown = git(['show', `HEAD:${DEMAND_FILE}`], dir);
  if (shown.status !== 0) return null;                       // untracked — a pull does not mind it

  // COMPARED AS LINES, NOT AS BYTES. `git show` prints the blob with LF while the working copy may
  // hold CRLF, and either may or may not end with a newline; on bytes, both differences read as
  // "somebody rewrote the file" and the park silently never happens — the failure this exists to
  // remove, restored by its own fix.
  const lines = (s) => String(s ?? '').split('\n').map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
  const committed = lines(shown.stdout);
  const current = readFileSync(file, 'utf8');
  const currentLines = lines(current);
  const head = committed.filter((l, i) => i < committed.length - 1 || l !== '');
  if (currentLines.length < head.length) return null;
  for (let i = 0; i < head.length; i += 1) if (currentLines[i] !== head[i]) return null;
  const extra = currentLines.slice(head.length).filter((l) => l.trim());
  if (!extra.length) return null;

  const rows = `${extra.join('\n')}\n`;
  writeFileSync(parked, rows, 'utf8');
  if (git(['checkout', '--', DEMAND_FILE], dir).status !== 0) {
    rmSync(parked, { force: true });
    return null;
  }
  return rows;
}

/** Put the parked rows back on top of whatever the fetch brought down. */
export function replayDemand(dir, extra) {
  if (!extra) return 0;
  const file = join(dir, DEMAND_FILE);
  const now = existsSync(file) ? readFileSync(file, 'utf8') : '';
  writeFileSync(file, now && !now.endsWith('\n') ? `${now}\n${extra}` : `${now}${extra}`, 'utf8');
  rmSync(join(dir, PARKED_FILE), { force: true });
  return extra.split('\n').filter((l) => l.trim()).length;
}

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
    const parked = parkDemand(dir);
    const r = git(['pull', '--ff-only'], dir);
    // Replayed on BOTH paths. On failure this restores the checkout to exactly what it was found
    // as, which is what "nothing was changed" below promises.
    const replayed = replayDemand(dir, parked);
    if (r.status !== 0) {
      const said = (r.stderr || r.stdout || '').trim().split('\n').filter(Boolean).pop() ?? '';
      throw new SyncRefused(
        `kb sync could not fast-forward ${dir}:\n  ${said}\n\n`
        + 'The checkout has diverged or holds uncommitted work. Nothing was changed. Sort it out\n'
        + 'there with git — this command will not discard a corpus it did not write.',
      );
    }
    const after = gitOut(['rev-parse', 'HEAD'], dir);
    return { action: before === after ? 'current' : 'updated', dir, before, after, age: baseAge(dir), indexed: repairIndexes(dir), replayed };
  }

  // AN EMPTY DIRECTORY IS NOT SOMETHING SOMEBODY ASSEMBLED BY HAND.
  //
  // The refusal below is right about a directory with contents and was wrong about an empty one,
  // which is the shape a reader reaches most often: `mkdir` the path you were told to use, then
  // run the command. Four independent reviewers hit it on their first attempt, and the message
  // they got warned them about overwriting work that was not there.
  if (existsSync(dir) && readdirSync(dir).length > 0) {
    throw new SyncRefused(
      `kb sync refused: ${dir} exists, is not empty, and is not a git checkout.\n`
      + 'Move it aside, or name a different directory with --dir. Overwriting a directory somebody\n'
      + 'assembled by hand is not something this command decides on its own.',
    );
  }
  // A directory that exists and is empty is in the way of the staged rename, and removing an empty
  // directory destroys nothing.
  if (existsSync(dir)) rmSync(dir, { recursive: true });

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
  const { action, dir, age, indexed = [], replayed = 0 } = result;
  const verb = { cloned: 'cloned', updated: 'updated', current: 'already up to date' }[action] ?? action;
  const when = age ? `  newest fact: ${age.iso.slice(0, 10)} (${age.days}d ago)` : '';
  // Reported rather than done silently: a person who sees `rules-index.json` built here knows why
  // the first fetch took a moment, and knows that a base can arrive without one.
  const built = indexed.length ? `
  built the retrieval index git does not carry: ${indexed.join(', ')}` : '';
  const kept = replayed ? `
  kept ${replayed} unpushed demand row(s) — re-applied on top of what came down` : '';
  return `base ${verb} at ${dir}${when}${built}${kept}`;
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
