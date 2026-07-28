#!/usr/bin/env node
/**
 * Age out old ephemeral run artifacts so local disk usage and the tracked repo
 * don't grow without bound. Two independently-gated targets:
 *
 *   --target=local    (default) Filesystem delete, nothing git-tracked involved:
 *                      .claude/worktrees/*, .fix-workspace/*, and dated run folders
 *                      under reports/regression, reports/test-lifecycle,
 *                      reports/coverage, reports/monitoring. Age comes from the
 *                      YYYY-MM-DD-HHMM embedded in the run-folder name (worktrees/
 *                      fix-workspace fall back to directory mtime, since they carry
 *                      no such name).
 *
 *   --target=tracked   git rm + commit for reports/tickets/<Sprint>/<TICKET>/ and
 *                      vc/shared/archive/sprints/<Sprint>/<TICKET>/. Age comes from
 *                      the last git commit date on that path (`git log -1
 *                      --format=%cI`) — filesystem mtime is meaningless for tracked
 *                      content after a fresh checkout. The CURRENT sprint under
 *                      reports/tickets/ is always skipped regardless of age (people
 *                      are actively working in it); vc/shared/archive/sprints/ has
 *                      no such exclusion since everything there is already a closed
 *                      sprint by definition.
 *
 * Durable categories (reports/bugs, reports/ba, reports/knowledge, regression/suites,
 * reports/exploratory, vc/shared/docs) are never touched — this script never globs
 * into them in the first place, not merely skips them.
 *
 * Dry-run by default. Nothing is deleted/committed unless --apply is also passed.
 * `--target=tracked` must be named explicitly even with --apply — an extra safety
 * rail before anything git-tracked is touched.
 *
 * Usage:
 *   node scripts/maintenance/prune-old-artifacts.mjs                          # dry-run, local, 30d
 *   node scripts/maintenance/prune-old-artifacts.mjs --apply                  # apply, local, 30d
 *   node scripts/maintenance/prune-old-artifacts.mjs --days=14                # dry-run, local, 14d
 *   node scripts/maintenance/prune-old-artifacts.mjs --target=tracked         # dry-run, tracked
 *   node scripts/maintenance/prune-old-artifacts.mjs --target=tracked --apply # apply, tracked (git rm + commit)
 *
 * See `.claude/rules/reports.md` §9 Retention for the policy this implements.
 */
import { existsSync, readdirSync, statSync, rmSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** Controlled exit: set the code and unwind via the bottom catch — never process.exit()
 * with an open handle (matches scripts/hotfix/hotfix-precheck.ts's rationale). */
class Exit { constructor(code) { this.code = code; } }
function fail(msg) { console.error(`[prune-old-artifacts] ${msg}`); throw new Exit(2); }

const args = process.argv.slice(2);
const flag = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const has = (name) => args.includes(`--${name}`);

const DAYS = Number(flag('days') ?? 30);
const APPLY = has('apply');
const TARGET = flag('target') ?? 'local';

if (!Number.isFinite(DAYS) || DAYS < 0) fail(`--days must be a non-negative number, got ${flag('days')}`);
if (!['local', 'tracked'].includes(TARGET)) fail(`--target must be "local" or "tracked", got ${TARGET}`);

function cutoffDateStr(days) {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return cutoff.toISOString().slice(0, 10);
}
const CUTOFF = cutoffDateStr(DAYS);

function dirSizeBytes(path) {
  let total = 0;
  const stack = [path];
  while (stack.length) {
    const cur = stack.pop();
    let entries;
    try { entries = readdirSync(cur, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(cur, e.name);
      if (e.isDirectory()) stack.push(p);
      else { try { total += statSync(p).size; } catch { /* race/broken symlink, skip */ } }
    }
  }
  return total;
}
const fmtMB = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;

/** Parses the `YYYY-MM-DD-HHMM` run-id suffix out of a folder name like `REG-2026-07-24-2121`. */
function dateFromRunFolderName(name) {
  const m = name.match(/(\d{4}-\d{2}-\d{2})-\d{4}$/);
  return m ? m[1] : null;
}

function listDirs(path) {
  if (!existsSync(path)) return [];
  return readdirSync(path, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
}

// ── target: local (filesystem only) ─────────────────────────────────────────────

const RUN_FOLDER_ROOTS = [
  { root: 'reports/regression', match: /^(REG|SMOKE)-/ },
  { root: 'reports/test-lifecycle', match: /^TLC-/ },
  { root: 'reports/coverage', match: /^COV-/ },
  { root: 'reports/monitoring', match: /^MONITOR-/ },
];

// Defense in depth: these are persistent stores, not run reports. They live directly
// under the root (not inside a dated run folder) so the globs above can never match
// them anyway — this list documents that guarantee rather than papering over a gap.
const NEVER_DELETE_BASENAMES = new Set([
  'test-run-status.json', 'history.json', '.triage-fingerprints.json', '.seen-fingerprints.json',
]);

function planLocal() {
  const plan = [];

  for (const { root, match } of RUN_FOLDER_ROOTS) {
    const abs = join(REPO_ROOT, root);
    for (const name of listDirs(abs)) {
      if (!match.test(name) || NEVER_DELETE_BASENAMES.has(name)) continue;
      const dateStr = dateFromRunFolderName(name);
      if (!dateStr) continue; // unrecognized shape — never touch what we can't confidently age
      const path = join(abs, name);
      plan.push({ path, label: `${root}/${name}`, ageDate: dateStr, stale: dateStr < CUTOFF, sizeBytes: dirSizeBytes(path) });
    }
  }

  for (const root of ['.claude/worktrees', '.fix-workspace']) {
    const abs = join(REPO_ROOT, root);
    for (const name of listDirs(abs)) {
      const path = join(abs, name);
      const mtimeStr = statSync(path).mtime.toISOString().slice(0, 10);
      plan.push({ path, label: `${root}/${name}`, ageDate: mtimeStr, stale: mtimeStr < CUTOFF, sizeBytes: dirSizeBytes(path) });
    }
  }

  return plan;
}

function runLocal() {
  const plan = planLocal();
  const stale = plan.filter((p) => p.stale);
  console.log(`[prune-old-artifacts] target=local  days=${DAYS}  cutoff=${CUTOFF}  ${APPLY ? '(APPLYING)' : '(dry-run)'}`);
  if (!plan.length) { console.log('Nothing found under any watched local path.'); throw new Exit(0); }

  for (const p of plan) {
    console.log(`  ${p.stale ? 'REMOVE' : 'keep  '}  ${p.label.padEnd(45)} age=${p.ageDate}  ${fmtMB(p.sizeBytes)}`);
  }
  const totalBytes = stale.reduce((s, p) => s + p.sizeBytes, 0);
  console.log(`\n${stale.length}/${plan.length} folders older than ${DAYS}d — ${fmtMB(totalBytes)} to reclaim.`);

  if (!stale.length) throw new Exit(0);
  if (!APPLY) { console.log('Dry-run — nothing deleted. Re-run with --apply to delete.'); throw new Exit(0); }

  for (const p of stale) {
    rmSync(p.path, { recursive: true, force: true });
    console.log(`  deleted ${p.label}`);
  }
  console.log(`Reclaimed ${fmtMB(totalBytes)}.`);
  throw new Exit(0);
}

// ── target: tracked (git rm + commit) ───────────────────────────────────────────

const TRACKED_ROOTS = [
  { root: 'reports/tickets', commitVerb: 'ticket reports', hasSprintSubdir: true, excludeCurrentSprint: true },
  { root: 'vc/shared/archive/sprints', commitVerb: 'sprint archive', hasSprintSubdir: true, excludeCurrentSprint: false },
];

function isSprintDirName(name) { return /^Sprint\d+-\d+$/.test(name); }

/** `Sprint26-14` -> [26, 14], comparable/subtractable as a flat ordinal. Confirmed against real
 * sprint-plan dates (vc/shared/docs/Sprint plans/*-summary.json): sprints are ~14 days apart
 * (Sprint26-12 start 06-15 -> Sprint26-13 start 06-29 -> Sprint26-14 start 07-13). */
function sprintOrdinal(name) {
  const m = name.match(/^Sprint(\d+)-(\d+)$/);
  return m ? Number(m[1]) * 100 + Number(m[2]) : null;
}
const DAYS_PER_SPRINT = 14;

/** reports/tickets/Sprint-current, if present, names the active sprint; otherwise the
 * numerically-latest SprintXX-XX folder is treated as current (mirrors commands/qa-test.md Step 1). */
function resolveCurrentSprint(ticketsAbsRoot) {
  const marker = join(ticketsAbsRoot, 'Sprint-current');
  if (existsSync(marker) && statSync(marker).isFile()) {
    const content = readFileSync(marker, 'utf8').trim();
    if (content) return content;
  }
  const sprintDirs = listDirs(ticketsAbsRoot).filter(isSprintDirName);
  if (!sprintDirs.length) return null;
  sprintDirs.sort((a, b) => sprintOrdinal(a) - sprintOrdinal(b));
  return sprintDirs[sprintDirs.length - 1];
}

/** True if git has at least one tracked file under this path. A folder can exist on disk with real
 * bytes in it (dirSizeBytes counts filesystem content, not git status) while being ENTIRELY untracked —
 * e.g. a folder that holds only *.png, which is blanket-gitignored (.gitignore:68). `git rm -r` on such
 * a path fails ("pathspec did not match any files") because there's nothing in the index to remove. */
function hasTrackedFiles(absPath) {
  const rel = relative(REPO_ROOT, absPath).split('\\').join('/');
  try {
    return execSync(`git ls-files -- "${rel}"`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim().length > 0;
  } catch { return false; }
}

function lastCommitDate(absPath) {
  const rel = relative(REPO_ROOT, absPath).split('\\').join('/');
  let out;
  try {
    out = execSync(`git log -1 --format=%cI -- "${rel}"`, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch { return null; }
  return out ? out.slice(0, 10) : null; // empty output = no commit touches this path (untracked/new)
}

/** Age signal split by shape:
 *  - Sprint-numbered folders (Sprint26-02, ...): git's last-commit date is UNRELIABLE here — this
 *    repo has a one-time bulk `git mv` ("relocate vcst-qa archive to vc/shared") that stamped every
 *    pre-existing archived sprint folder with the SAME commit date, erasing their real chronology.
 *    Use sprint-ordinal distance from the latest sprint seen anywhere (x DAYS_PER_SPRINT) instead.
 *  - Ad-hoc folders (no sprint number, e.g. reports/tickets/<TICKET>/): no ordinal exists, so fall
 *    back to the last-commit date — reliable there since ad-hoc tickets aren't part of that bulk move. */
function planTracked() {
  const plan = [];

  // Global "now" anchor: the latest sprint ordinal seen across BOTH tracked roots, so archive and
  // tickets share one clock instead of each root inventing its own "current".
  let latestOrdinal = -Infinity;
  for (const { root } of TRACKED_ROOTS) {
    const abs = join(REPO_ROOT, root);
    for (const top of listDirs(abs)) {
      const o = sprintOrdinal(top);
      if (o !== null) latestOrdinal = Math.max(latestOrdinal, o);
    }
  }

  for (const { root, hasSprintSubdir, excludeCurrentSprint } of TRACKED_ROOTS) {
    const abs = join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    const currentSprint = excludeCurrentSprint ? resolveCurrentSprint(abs) : null;

    for (const top of listDirs(abs)) {
      const topAbs = join(abs, top);
      const isSprint = hasSprintSubdir && isSprintDirName(top);

      const leafDirs = isSprint
        ? listDirs(topAbs).map((leaf) => ({ leaf, abs: join(topAbs, leaf), label: `${root}/${top}/${leaf}` }))
        : [{ leaf: top, abs: topAbs, label: `${root}/${top}` }]; // ad-hoc reports/tickets/<TICKET>/

      if (isSprint && excludeCurrentSprint && top === currentSprint) {
        for (const { label } of leafDirs) plan.push({ root, path: null, label, ageLabel: 'current sprint', stale: false, reason: 'current sprint' });
        continue;
      }

      if (isSprint) {
        const sprintsBehind = latestOrdinal - sprintOrdinal(top);
        const stale = sprintsBehind * DAYS_PER_SPRINT >= DAYS;
        for (const { abs: leafAbs, label } of leafDirs) {
          plan.push({ root, path: leafAbs, label, ageLabel: `${top} (~${sprintsBehind * DAYS_PER_SPRINT}d behind)`, stale, sizeBytes: dirSizeBytes(leafAbs) });
        }
        continue;
      }

      for (const { abs: leafAbs, label } of leafDirs) {
        const ageDate = lastCommitDate(leafAbs);
        if (ageDate === null) { plan.push({ root, path: null, label, ageLabel: null, stale: false, reason: 'no git history' }); continue; }
        plan.push({ root, path: leafAbs, label, ageLabel: `commit ${ageDate}`, stale: ageDate < CUTOFF, sizeBytes: dirSizeBytes(leafAbs) });
      }
    }
  }

  return plan;
}

function runTracked() {
  const plan = planTracked();
  console.log(`[prune-old-artifacts] target=tracked  days=${DAYS}  cutoff=${CUTOFF}  ${APPLY ? '(APPLYING)' : '(dry-run)'}`);
  if (!plan.length) { console.log('Nothing found under reports/tickets or vc/shared/archive/sprints.'); throw new Exit(0); }

  for (const p of plan) {
    const tag = p.stale ? 'REMOVE' : 'keep  ';
    const detail = p.ageLabel ? `${p.ageLabel}  ${fmtMB(p.sizeBytes ?? 0)}` : `(${p.reason})`;
    console.log(`  ${tag}  ${p.label.padEnd(55)} ${detail}`);
  }
  const stale = plan.filter((p) => p.stale);
  const totalBytes = stale.reduce((s, p) => s + (p.sizeBytes ?? 0), 0);
  console.log(`\n${stale.length}/${plan.length} folders older than ${DAYS}d-equivalent — ${fmtMB(totalBytes)} to reclaim.`);

  if (!stale.length) throw new Exit(0);
  if (!APPLY) { console.log('Dry-run — nothing removed. Re-run with --target=tracked --apply to git rm + commit.'); throw new Exit(0); }

  for (const { root, commitVerb } of TRACKED_ROOTS) {
    const rootStale = stale.filter((p) => p.root === root);
    if (!rootStale.length) continue;
    let gitRemoved = 0;
    for (const p of rootStale) {
      if (hasTrackedFiles(p.path)) {
        const rel = relative(REPO_ROOT, p.path).split('\\').join('/');
        execSync(`git rm -r --quiet -- "${rel}"`, { cwd: REPO_ROOT });
        gitRemoved++;
      } else {
        console.log(`  deleted untracked-only ${p.label} (nothing in git to remove)`);
      }
      // `git rm -r` only removes TRACKED files — any gitignored siblings (e.g. blanket-ignored *.png
      // screenshots sitting next to the tracked .md/.json) are left behind as orphaned leftovers.
      // Always finish with a plain recursive delete so local disk is actually reclaimed too, not
      // just the git index.
      rmSync(p.path, { recursive: true, force: true });
    }
    if (gitRemoved > 0) {
      execSync(`git commit -m "chore: prune ${commitVerb} older than ${DAYS}d"`, { cwd: REPO_ROOT, stdio: 'inherit' });
      console.log(`  committed removal of ${gitRemoved} folder(s) under ${root}`);
    }
  }

  // A sprint folder whose every ticket subfolder just got pruned is now an empty shell (never
  // git-tracked on its own — git doesn't track empty directories) — remove it too rather than
  // leaving dangling `SprintNN-MM/` husks behind.
  for (const { root } of TRACKED_ROOTS) {
    const abs = join(REPO_ROOT, root);
    if (!existsSync(abs)) continue;
    for (const name of listDirs(abs)) {
      if (!isSprintDirName(name)) continue;
      const dirAbs = join(abs, name);
      if (readdirSync(dirAbs).length === 0) {
        rmSync(dirAbs, { recursive: true, force: true });
        console.log(`  removed now-empty ${root}/${name}`);
      }
    }
  }

  console.log(`Reclaimed ${fmtMB(totalBytes)} (pending push).`);
  throw new Exit(0);
}

// ── main ─────────────────────────────────────────────────────────────────────────

function main() {
  if (TARGET === 'local') runLocal();
  else runTracked();
}

try {
  main();
} catch (e) {
  if (e instanceof Exit) { process.exitCode = e.code; }
  else { console.error(`[prune-old-artifacts] fatal: ${e.message}`); process.exitCode = 2; }
}
