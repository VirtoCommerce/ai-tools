/**
 * hotfix-release.ts
 *
 * Step 5 of the hotfix flow: trigger the repo's "Release hotfix" workflow on a `support/<X.Y>`
 * branch (after the fix has been cherry-picked + pushed there), then optionally poll for the run
 * and VERIFY the published patch release actually contains the fix commit (step 6).
 *
 * This is the ONE write the /qa-hotfix orchestrator runs against a product repo, and only after
 * explicit human confirmation (see .claude/skills/qa-hotfix). It dispatches the
 * workflow_dispatch event — equivalent to clicking "Run workflow" in the GitHub UI — it does NOT
 * merge or tag anything itself; the workflow builds, tests, and publishes.
 *
 * The hotfix workflow filename varies by repo kind and is DISCOVERED at runtime by workflow name
 * ("Release hotfix") so we don't hardcode it:
 *   module repo → module-release-hotfix.yml · vc-platform → platform-release-hotfix.yml · vc-frontend → theme-release-hotfix.yml
 *
 * Usage:
 *   npx tsx scripts/hotfix-release.ts --repo=vc-module-order --branch=support/3.1000 [options]
 *
 * Options:
 *   --repo=<name>           Target product repo. REQUIRED.
 *   --branch=support/X.Y    Support branch to release from. REQUIRED.
 *   --expect-commit=<sha>   Verify the resulting release contains this commit (recommended).
 *   --no-increment          Pass incrementPatch=false (default true → bumps the patch).
 *   --poll                  Wait for the dispatched run to finish, then verify + print the release.
 *   --json                  Machine-readable output.
 *
 * Exit codes:
 *   0  dispatched (and, with --poll, the run succeeded and verification passed)
 *   1  --poll: the run failed, or the published release does NOT contain --expect-commit
 *   2  tool error: bad args, no hotfix workflow, branch missing, GitHub auth/rate-limit
 *
 * Auth: GIT_TOKEN must have `actions:write` + `contents:read` on the repo (a PAT with `repo`/`workflow`).
 */

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OWNER = 'VirtoCommerce';
const POLL_INTERVAL_MS = 15_000;
const POLL_TIMEOUT_MS = 25 * 60_000; // hotfix build+test+publish can take ~10-20 min

function loadToken(): string | undefined {
  // A variable already set is never overwritten, so the file read FIRST wins: .env.local before .env.defaults gives
  // the documented order (process env, then .env.local, then .env.defaults). The reverse let a default beat a local value.
  for (const f of ['.env.local', '.env.defaults']) {
    const p = resolve(REPO_ROOT, f);
    if (existsSync(p)) { const vars = parseDotenv(readFileSync(p)); for (const [k, v] of Object.entries(vars)) if (!process.env[k]) process.env[k] = v; }
  }
  return process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}
let TOKEN: string | undefined;
function ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'vc-hotfix-release', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...extra };
}
async function ghJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limited (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
  return res.json();
}
async function refContains(repo: string, ref: string, sha: string): Promise<boolean> {
  const j = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/compare/${encodeURIComponent(ref)}...${encodeURIComponent(sha)}`);
  return !!j && (j.ahead_by ?? 0) === 0;
}
/** The most recent commit messages reachable from a ref (tag/branch). */
async function recentCommitMessages(repo: string, ref: string, n = 40): Promise<string[]> {
  const arr = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/commits?sha=${encodeURIComponent(ref)}&per_page=${n}`);
  return Array.isArray(arr) ? arr.map((c: any) => c?.commit?.message ?? '') : [];
}
/** Verify a release contains the fix — CHERRY-PICK AWARE. The cherry-pick gets a NEW sha, so the
 * original commit is not an ancestor; we also accept the `git cherry-pick -x` trailer
 * ("cherry picked from commit <originalSha>") found on a commit reachable from the release tag. */
async function releaseHasFix(repo: string, tag: string, expectCommit: string): Promise<boolean> {
  if (await refContains(repo, tag, expectCommit)) return true; // direct (non-cherry-pick) case
  const short = expectCommit.slice(0, 8);
  const msgs = await recentCommitMessages(repo, tag, 40);
  return msgs.some((m) => /cherry picked from commit/i.test(m) && (m.includes(expectCommit) || m.includes(short)));
}
/** Is the release's version on nuget.org? Package ids come from the tag's own `src/*.Core` / `src/*.Data`
 * projects — never from the zip name: `VirtoCommerce.Catalog_X.zip` ships `VirtoCommerce.CatalogModule.Core`.
 * The id is the project folder name (the csproj name), which is the PackageId VC modules publish under.
 * null = no such project at the tag (platform/theme), so nothing is claimed. Polls briefly: nuget.org
 * accepts a push minutes before the flat container lists it. */
async function nugetHas(repo: string, release: any): Promise<{ ids: string[]; found: boolean } | null> {
  const tag = release.tag_name as string;
  const tree = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/git/trees/${encodeURIComponent(tag)}?recursive=1`);
  const ids = [...new Set<string>((tree?.tree ?? []).map((t: any) => t.path as string)
    .map((p: string) => /^src\/([^/]+\.(?:Core|Data))\/\1\.csproj$/.exec(p)?.[1]).filter(Boolean))];
  if (!ids.length) return null;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const id of ids) {
      const r = await fetch(`https://api.nuget.org/v3-flatcontainer/${id.toLowerCase()}/index.json`).catch(() => null);
      if (r?.ok && ((await r.json()).versions ?? []).includes(tag)) return { ids, found: true };
    }
    if (attempt < 3) await sleep(60_000);
  }
  return { ids, found: false };
}

/** Jobs of a workflow run, by name → conclusion. */
async function runJobs(repo: string, runId: number): Promise<{ name: string; conclusion: string | null }[]> {
  const j = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/actions/runs/${runId}/jobs`);
  return (j?.jobs ?? []).map((x: any) => ({ name: x.name as string, conclusion: x.conclusion as string | null }));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Find the "Release hotfix" workflow file for the repo (by name, fallback to *-release-hotfix.yml). */
async function findHotfixWorkflow(repo: string): Promise<{ id: number; path: string } | null> {
  const wf = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/actions/workflows?per_page=100`);
  const list: any[] = wf?.workflows ?? [];
  const byName = list.find((w) => /release hotfix/i.test(w.name || ''));
  const byPath = list.find((w) => /-release-hotfix\.yml$/i.test(w.path || ''));
  const hit = byName ?? byPath;
  return hit ? { id: hit.id, path: hit.path.replace(/^\.github\/workflows\//, '') } : null;
}

// Controlled exit — never process.exit() with a fetch socket open (libuv assert on Windows clobbers the code).
class Exit { constructor(public code: number) {} }
function fail(msg: string): never { console.error(`[hotfix-release] ${msg}`); throw new Exit(2); }

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const has = (n: string) => args.includes(`--${n}`);
  const repo = flag('repo');
  const branch = flag('branch');
  const expectCommit = flag('expect-commit');
  const incrementPatch = !has('no-increment');
  const poll = has('poll');
  const asJson = has('json');

  if (!repo || !branch) fail('Usage: npx tsx scripts/hotfix-release.ts --repo=<name> --branch=support/X.Y [--expect-commit=<sha>] [--no-increment] [--poll] [--json]');
  TOKEN = loadToken();
  if (!TOKEN) fail('No GIT_TOKEN — a PAT with actions:write + contents:read is required to dispatch the workflow.');

  // Branch must exist (the cherry-pick must already be pushed).
  const branchRef = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
  if (!branchRef) fail(`Branch ${branch} not found in ${repo} — cherry-pick + push it before releasing.`);

  const wf = await findHotfixWorkflow(repo);
  if (!wf) fail(`No "Release hotfix" workflow found in ${repo}.`);

  // Mark the dispatch time so we can identify the run we triggered.
  const since = new Date(Date.now() - 60_000).toISOString();

  // ── dispatch ──
  const dispatchRes = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/actions/workflows/${wf.id}/dispatches`, {
    method: 'POST', headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ref: branch, inputs: { incrementPatch: String(incrementPatch) } }),
  });
  if (dispatchRes.status !== 204) {
    const body = await dispatchRes.text().catch(() => '');
    fail(`workflow_dispatch failed (HTTP ${dispatchRes.status}) for ${wf.path} on ${branch}. ${body.slice(0, 300)}`);
  }
  const runsUrl = `https://github.com/${OWNER}/${repo}/actions/workflows/${wf.path}`;
  if (!asJson) console.log(`✓ Dispatched "${wf.path}" on ${branch} (incrementPatch=${incrementPatch}). Runs: ${runsUrl}`);

  if (!poll) {
    if (asJson) console.log(JSON.stringify({ dispatched: true, repo, branch, workflow: wf.path, runsUrl }, null, 2));
    else console.log(`\n(no --poll) Watch the run, then verify the new patch release contains ${expectCommit ?? 'the fix'}.`);
    throw new Exit(0);
  }

  // ── poll for the run we just triggered ──
  if (!asJson) console.error(`[hotfix-release] polling for the dispatched run …`);
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let runId: number | null = null, conclusion: string | null = null, runUrl = runsUrl;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    const runs = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/actions/workflows/${wf.id}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&created=>=${since}&per_page=5`);
    const run = (runs?.workflow_runs ?? [])[0];
    if (run) { runId = run.id; runUrl = run.html_url; if (run.status === 'completed') { conclusion = run.conclusion; break; } }
  }
  if (!runId) fail('Could not locate the dispatched run within the poll window — check the Actions tab.');

  // Judge success by the PUBLISH job, not the overall run conclusion: the trailing `increment-version`
  // job (which only bumps the branch version files for next time, via a flaky `dotnet tool install`)
  // can fail AFTER the release is already published — that must not mark the hotfix as failed.
  const jobs = await runJobs(repo, runId!);
  const publishJob = jobs.find((j) => /publish-github-release|publish-github/i.test(j.name));
  const published = publishJob?.conclusion === 'success';
  const failedJobs = jobs.filter((j) => j.conclusion && !['success', 'skipped'].includes(j.conclusion));
  // NB: guard on failedJobs.length — [].every() is true, which would fire a false "increment failed".
  const incrementOnlyFailure = published && failedJobs.length > 0 && failedJobs.every((j) => /increment-version/i.test(j.name));

  if (!published) {
    const which = failedJobs.map((j) => `${j.name}=${j.conclusion}`).join(', ') || `conclusion=${conclusion}`;
    // An old workflow creates the GitHub release and THEN pushes NuGet inside the same job: a 403 on the push
    // fails the job with the release already out, and increment-version is skipped. Say exactly that.
    const partial = ((await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=10`)) ?? [])
      .find((r: any) => r.target_commitish === branch && !r.draft && Date.parse(r.created_at) >= Date.parse(since));
    const partialNote = partial
      ? `GitHub release ${partial.tag_name} WAS created (${partial.html_url}) but the job failed after it — its NuGet packages are most likely NOT on nuget.org, and increment-version was skipped, so the branch still carries the previous version. A plain re-run would target ${partial.tag_name} again (422). Fix: port Trusted Publishing, set props+manifest to ${partial.tag_name}, release the next patch (.claude/skills/qa-hotfix/support-line-ci.md).`
      : '';
    if (asJson) console.log(JSON.stringify({ dispatched: true, runId, conclusion, published: false, partialRelease: partial ? partial.tag_name : null, failedJobs: failedJobs.map((j) => j.name), runUrl, verified: false, note: partialNote }, null, 2));
    else console.log(`\n⛔ Release not published — failing job(s): ${which}. ${runUrl}${partialNote ? `\n  ⚠ ${partialNote}` : ''}`);
    throw new Exit(1);
  }

  // ── verify the published release (cherry-pick aware) ──
  await sleep(5_000);
  const rels: any[] = (await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=10`)) ?? [];
  const hotfix = rels.find((r) => r.target_commitish === branch && !r.draft);
  let verified = false, verifyNote = '';
  if (!hotfix) verifyNote = `published but no release with target_commitish=${branch} found yet (may still be propagating).`;
  else if (expectCommit) { verified = await releaseHasFix(repo, hotfix.tag_name, expectCommit); verifyNote = verified ? `release ${hotfix.tag_name} contains the fix (${expectCommit.slice(0, 8)}, direct or cherry-picked)` : `release ${hotfix.tag_name} does NOT contain ${expectCommit.slice(0, 8)}`; }
  else { verified = true; verifyNote = `release ${hotfix.tag_name} published (no --expect-commit to verify contents)`; }

  // NuGet: the GitHub release is what stands deploy, nuget.org is what downstream projects build against.
  const nuget = hotfix ? await nugetHas(repo, hotfix) : null;
  const warns = [
    incrementOnlyFailure ? `increment-version job failed (transient tool install) — release is OUT but the branch version files were NOT auto-bumped; the next hotfix on ${branch} will need its baseline set manually.` : '',
    nuget && !nuget.found ? `NuGet pending: nuget.org does not list ${nuget.ids.join(' / ')} ${hotfix.tag_name} after ~3 min. Indexing can take ~15 min — re-check later; still missing then, read the run's NuGet push step.` : '',
  ].filter(Boolean);
  const warn = warns.join(' ');

  if (asJson) { console.log(JSON.stringify({ dispatched: true, runId, conclusion, published: true, incrementVersionFailed: incrementOnlyFailure, runUrl, release: hotfix ? { tag: hotfix.tag_name, url: hotfix.html_url, assets: (hotfix.assets ?? []).map((a: any) => a.browser_download_url) } : null, verified, verifyNote, warn }, null, 2)); throw new Exit(verified ? 0 : 1); }

  console.log(`\n✓ Hotfix release PUBLISHED. ${runUrl}`);
  if (hotfix) {
    console.log(`  Release: ${hotfix.tag_name} → ${hotfix.html_url}`);
    for (const a of hotfix.assets ?? []) console.log(`  Asset:   ${a.browser_download_url}`);
  }
  console.log(`  Verify:  ${verified ? '✓' : '✗'} ${verifyNote}`);
  if (nuget?.found) console.log(`  NuGet:   ✓ ${nuget.ids.join(' / ')} ${hotfix.tag_name} on nuget.org`);
  for (const w of warns) console.log(`  ⚠ ${w}`);
  throw new Exit(verified ? 0 : 1);
}

main().catch((e) => {
  if (e instanceof Exit) { process.exitCode = e.code; return; }
  console.error(`[hotfix-release] fatal: ${e.message}`);
  process.exitCode = 2;
});
