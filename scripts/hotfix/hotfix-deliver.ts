/**
 * hotfix-deliver.ts
 *
 * DELIVER an already-released hotfix onto the deployed `vcptcore-stable` / `vcptcore-regression`
 * environments, then CONFIRM the deploy landed. Downstream of /qa-hotfix (which PRODUCES the patch
 * release); this script only DELIVERS + VERIFIES the delivery — it never cuts a release.
 *
 * Per env (a vc-deploy-dev branch, coords read from `.env.vcptcore_<env>`):
 *   1. Resolve the JIRA task → product repo + merged fix commit (GitHub search, --pr/--repo override).
 *   2. Read the env's backend/packages.json → the module's PINNED version → its line X.Y.
 *   3. Find the released hotfix on that line = the highest X.Y.* tag whose release CONTAINS the fix
 *      (cherry-pick aware). None on the line → STOP: run /qa-hotfix for this bundle first.
 *   4. Asset gate (the rollback trap, `reference-deploy-manifest-module-resolution`): the target
 *      release must exist + carry a downloadable .zip asset, else the GithubReleases Pack step 404s
 *      and the platform rolls back the whole InstallModules step.
 *   5. (--apply) Bump the version in packages.json and commit "VCST-XXXX: <title>" to the branch via
 *      the GitHub Contents API — this push triggers vc-deploy-dev's "Cloud platform deployment".
 *   6. Poll that deploy Action (matched by head_sha) → completed + success.
 *   7. Poll <BACK_URL>/api/platform/modules until the module reports the target version = the env
 *      actually restarted on the hotfix. (Hotfix versions are real release tags, so — unlike a
 *      pre-release — the version bumps cleanly and version-match is a reliable signal.)
 *
 * The FIX-BEHAVIOUR verification (targeted repro of the task on the live env), the JIRA comment, and
 * the stable-bundle bump are orchestrated by the /qa-hotfix-check skill — this script owns only the
 * mechanical, deterministic delivery + deploy-confirmation.
 *
 * SAFE BY DEFAULT: without --apply the script is READ-ONLY (dry-run) — it prints the per-env plan
 * (pinned → target, asset gate, what it would commit) and writes nothing. --apply performs the gated
 * write, one commit per env; the /qa-hotfix-check orchestrator passes it only after human confirmation.
 *
 * Usage:
 *   npx tsx scripts/hotfix-deliver.ts <TASK-KEY> [--envs=stable,regression] [options]
 *
 * Options:
 *   --envs=stable,regression   Target envs (default both). Each maps to `.env.vcptcore_<env>`.
 *   --repo=<name>              Override the auto-resolved product repo.
 *   --pr=<owner/repo#N|url>    Resolve directly from this PR (skip GitHub search).
 *   --version=<X.Y.Z>          Override the target version per env (else auto-resolve on the line).
 *   --message=<text>           Override the commit message (else "VCST-XXXX: <JIRA summary | PR title>").
 *   --apply                    Perform the gated write (commit) + wait for deploy. Omit = dry-run.
 *   --dry-run                  Explicit no-op form of the default (read-only); wins over --apply if both given.
 *   --no-wait                  (with --apply) commit but skip the deploy Action + module polling.
 *   --password=<pw>            Admin password for the /api/platform/modules check (else env/Password1).
 *   --timeout=<sec>            Deploy + restart poll budget per env (default 1200).
 *   --json                     Machine-readable output.
 *
 * Exit codes:
 *   0  every targeted env delivered + confirmed (or dry-run plan clean / already-delivered)
 *   1  a gate blocked (no hotfix on the line / asset missing / deploy failed / version never appeared)
 *   2  tool error: task/repo unresolved, missing env coords, GitHub auth/rate-limit
 *
 * Auth: GIT_TOKEN with contents:write + actions:read on vc-deploy-dev, and repo read on the product
 * repo (a PAT with `repo`/`workflow`). Read from .env.local / .env.defaults — same as the other
 * hotfix scripts. The /api/platform/modules check needs the env's admin credentials.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OWNER = 'VirtoCommerce';
const MAX_PATCH_PROBE = 40;
const MAX_RELEASES_SCAN = 30;
const POLL_INTERVAL_MS = 15_000;
const DEFAULT_TIMEOUT_S = 1200; // deploy build + cloud rollout + platform restart ~ up to 20 min
const PRODUCT_REPO_RE = /^vc-module(-x)?-[a-z0-9.-]+$/i;
const isProductRepo = (n: string) => n === 'vc-platform' || n === 'vc-frontend' || PRODUCT_REPO_RE.test(n);
const JIRA_BASE = (process.env.JIRA_BASE_URL || 'https://virtocommerce.atlassian.net').replace(/\/$/, '');

// ── types ──────────────────────────────────────────────────────────────────────
interface SemVer { major: number; minor: number; patch: number; }
interface PrInfo { repo: string; number: number; title: string; url: string; merged: boolean; mergeCommitSha: string | null; }
interface EnvCoords { env: string; file: string; deployOwner: string; deployRepo: string; branch: string; path: string; backUrl: string; admin: string; password: string; }
type EnvVerdict = 'delivered' | 'already-delivered' | 'no-hotfix-on-line' | 'asset-missing' | 'not-in-manifest' | 'deploy-failed' | 'not-confirmed' | 'committed-unconfirmed' | 'wrong-source' | 'version-line-mismatch' | 'skipped' | 'planned' | 'error';
interface EnvResult {
  env: string; branch: string; moduleId: string | null;
  pinned: string | null; line: string | null; target: string | null;
  verdict: EnvVerdict; note?: string;
  commitSha?: string; deployRunUrl?: string; liveVersion?: string;
}

// ── env / token ──────────────────────────────────────────────────────────────
function loadToken(): string | undefined {
  for (const f of ['.env.defaults', '.env.local']) {
    const p = resolve(REPO_ROOT, f);
    if (existsSync(p)) { const vars = parseDotenv(readFileSync(p)); for (const [k, v] of Object.entries(vars)) if (!process.env[k]) process.env[k] = v; }
  }
  // This script performs a WRITE (Contents PUT) to vc-deploy-dev, so prefer the write-scoped classic
  // token (GITHUB_FIX_BUGS_TOKEN — the same PAT /qa-fix uses to push to VirtoCommerce repos) over the
  // read-only GITHUB_TOKEN, which typically lacks contents:write on vc-deploy-dev (→ HTTP 403).
  return process.env.GIT_TOKEN || process.env.GITHUB_FIX_BUGS_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}
let TOKEN: string | undefined;
function ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'vc-hotfix-deliver', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...extra };
}

/** Parse one .env file into a plain object (no process.env mutation). */
function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parseDotenv(readFileSync(path)) : {};
}
/** Deploy + connection coords for a target env, from `.env.vcptcore_<env>` (+ .env.local secrets). */
function loadEnvCoords(env: string, passwordOverride?: string): EnvCoords {
  const key = env.replace(/^vcptcore[_-]?/, '').replace(/[^a-z0-9]/gi, '').toLowerCase(); // "stable" | "regression"
  const file = resolve(REPO_ROOT, `.env.vcptcore_${key}`);
  if (!existsSync(file)) throw new Error(`No env file for "${env}" (looked for .env.vcptcore_${key}). Known: stable, regression.`);
  const e = readEnvFile(file);
  const local = readEnvFile(resolve(REPO_ROOT, '.env.local'));
  const repoSpec = e.DEPLOY_REPO || '';
  const [deployOwner, deployRepo] = repoSpec.includes('/') ? repoSpec.split('/') : [OWNER, repoSpec];
  if (!deployRepo || !e.DEPLOY_BRANCH || !e.DEPLOY_PACKAGES_PATH) {
    throw new Error(`${file} is missing DEPLOY_REPO/DEPLOY_BRANCH/DEPLOY_PACKAGES_PATH — add the deploy coords (see .env.vcptcore_stable).`);
  }
  const suffix = key.toUpperCase(); // per-env secret override, e.g. ADMIN_PASSWORD_STABLE
  const password = passwordOverride
    || local[`ADMIN_PASSWORD_VCPTCORE_${suffix}`] || local[`ADMIN_PASSWORD_${suffix}`]
    || local.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'Password1';
  return {
    env: key, file, deployOwner, deployRepo, branch: e.DEPLOY_BRANCH, path: e.DEPLOY_PACKAGES_PATH,
    backUrl: (e.BACK_URL || '').replace(/\/$/, ''), admin: e.ADMIN || 'admin', password,
  };
}

// ── version parsing ──────────────────────────────────────────────────────────
function parseSemVer(v: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec((v || '').trim());
  return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
}
const lineOf = (s: SemVer) => `${s.major}.${s.minor}`;
const tagOf = (s: SemVer, patch: number) => `${s.major}.${s.minor}.${patch}`;
const cmpSemVer = (a: SemVer, b: SemVer) => a.major - b.major || a.minor - b.minor || a.patch - b.patch;

// ── GitHub API ───────────────────────────────────────────────────────────────
async function ghJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limited (HTTP ${res.status}). ${TOKEN ? 'Wait for reset.' : 'Set GIT_TOKEN in .env.local.'}`);
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
  return res.json();
}
async function tagExists(repo: string, tag: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`, { headers: ghHeaders() });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  throw new Error(`GitHub API error ${res.status} for tag ${tag} in ${repo}`);
}
async function refContains(repo: string, ref: string, sha: string): Promise<boolean> {
  const j = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/compare/${encodeURIComponent(ref)}...${encodeURIComponent(sha)}`);
  return !!j && (j.ahead_by ?? 0) === 0;
}
async function recentCommitMessages(repo: string, ref: string, n = 40): Promise<string[]> {
  const arr = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/commits?sha=${encodeURIComponent(ref)}&per_page=${n}`);
  return Array.isArray(arr) ? arr.map((c: any) => c?.commit?.message ?? '') : [];
}
/** Does the release tag contain the fix — CHERRY-PICK AWARE (the hotfix commit has a new SHA, so we
 * also accept the `git cherry-pick -x` trailer on a commit reachable from the tag). */
async function tagHasFix(repo: string, tag: string, fixSha: string): Promise<boolean> {
  if (await refContains(repo, tag, fixSha)) return true;
  const short = fixSha.slice(0, 8);
  const msgs = await recentCommitMessages(repo, tag, 40);
  return msgs.some((m) => /cherry picked from commit/i.test(m) && (m.includes(fixSha) || m.includes(short)));
}
/** Released tag for a version, with a downloadable .zip asset? (the GithubReleases Pack gate). */
async function releaseAssetOk(repo: string, id: string, version: string): Promise<{ ok: boolean; note: string }> {
  const rel = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/releases/tags/${encodeURIComponent(version)}`);
  if (!rel) return { ok: false, note: `no published release ${version} in ${repo}` };
  if (rel.draft) return { ok: false, note: `release ${version} is a DRAFT (not published)` };
  const assets: any[] = rel.assets ?? [];
  const wanted = `${id}_${version}.zip`.toLowerCase();
  const zip = assets.find((a) => (a.name || '').toLowerCase() === wanted) || assets.find((a) => /\.zip$/i.test(a.name || ''));
  if (!zip) return { ok: false, note: `release ${version} has no .zip asset — GithubReleases Pack would 404 → platform rolls back InstallModules` };
  return { ok: true, note: `release ${version} OK (asset ${zip.name})` };
}
/** Highest patch that exists on the line, at/above `from`. null = the base tag itself is missing. */
async function highestOnLine(repo: string, base: SemVer): Promise<number | null> {
  if (!(await tagExists(repo, tagOf(base, base.patch)))) return null;
  let highest = base.patch;
  for (let n = base.patch + 1; n <= base.patch + MAX_PATCH_PROBE; n++) {
    if (await tagExists(repo, tagOf(base, n))) highest = n; else break;
  }
  return highest;
}

// ── task → PR → fix commit ─────────────────────────────────────────────────────
function parsePrRef(ref: string): { repo: string; number: number } | null {
  const url = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/.exec(ref);
  if (url) return { repo: url[1], number: +url[2] };
  const short = /(?:[^/\s]+\/)?([a-z0-9.-]+)#(\d+)/i.exec(ref);
  return short ? { repo: short[1], number: +short[2] } : null;
}
async function fetchPr(repo: string, number: number): Promise<PrInfo | null> {
  const pr = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/pulls/${number}`);
  if (!pr) return null;
  return { repo, number, title: pr.title ?? '', url: pr.html_url ?? '', merged: !!pr.merged_at, mergeCommitSha: pr.merge_commit_sha ?? null };
}
async function resolveTask(task: string, repoOverride?: string, prOverride?: string): Promise<{ repo: string; fix: PrInfo }> {
  if (prOverride) {
    const ref = parsePrRef(prOverride);
    if (!ref) throw new Error(`--pr could not be parsed: "${prOverride}" (want owner/repo#N or a PR URL).`);
    if (!isProductRepo(ref.repo)) throw new Error(`--pr repo ${ref.repo} is not a product repo.`);
    const pr = await fetchPr(ref.repo, ref.number);
    if (!pr) throw new Error(`PR ${ref.repo}#${ref.number} not found.`);
    return { repo: ref.repo, fix: pr };
  }
  const q = encodeURIComponent(`org:${OWNER} ${task} type:pr`);
  const search = await ghJson(`https://api.github.com/search/issues?q=${q}&per_page=30`);
  const items: any[] = search?.items ?? [];
  const candidates = items.map((i) => ({ repo: i.repository_url.split('/').pop() as string, number: i.number as number })).filter((c) => isProductRepo(c.repo));
  const repos = [...new Set(candidates.map((c) => c.repo))];
  let repo = repoOverride ?? (repos.length === 1 ? repos[0] : undefined);
  if (!repo) {
    if (repos.length > 1) throw new Error(`${task} touches multiple repos (${repos.join(', ')}). Disambiguate with --repo or --pr.`);
    // FALLBACK, mirroring hotfix-precheck.ts: GitHub search finds nothing → try the PR link in the
    // JIRA issue description (needs JIRA_EMAIL + JIRA_API_TOKEN in .env.local).
    const fromJira = await prFromJiraDescription(task);
    if (!fromJira) throw new Error(`No product-repo PR found for ${task} (GitHub search + JIRA description). Pass --pr=<owner/repo#N|url> or --repo=<name>.`);
    if (!isProductRepo(fromJira.repo)) throw new Error(`JIRA-described PR repo ${fromJira.repo} is not a product repo.`);
    const pr = await fetchPr(fromJira.repo, fromJira.number);
    if (!pr) throw new Error(`JIRA-described PR ${fromJira.repo}#${fromJira.number} not found.`);
    return { repo: fromJira.repo, fix: pr };
  }
  const prs: PrInfo[] = [];
  for (const c of candidates.filter((c) => c.repo === repo)) { const pr = await fetchPr(c.repo, c.number); if (pr) prs.push(pr); }
  const fix = prs.find((p) => p.merged) ?? prs[0];
  if (!fix) throw new Error(`No PR resolved for ${task} in ${repo}.`);
  return { repo, fix };
}
/** FALLBACK only: when no PR references the task on GitHub, parse the PR link out of the JIRA issue
 * description (same approach as hotfix-precheck.ts's prFromJiraDescription). */
async function prFromJiraDescription(task: string): Promise<{ repo: string; number: number } | null> {
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  if (!email || !token) { console.error(`[hotfix-deliver] no GitHub PR found for ${task}; JIRA description fallback needs JIRA_EMAIL + JIRA_API_TOKEN in .env.local`); return null; }
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const res = await fetch(`${JIRA_BASE}/rest/api/3/issue/${encodeURIComponent(task)}?fields=description`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'User-Agent': 'vc-hotfix-deliver' } });
  if (!res.ok) { console.error(`[hotfix-deliver] JIRA fetch for ${task} failed (HTTP ${res.status})`); return null; }
  const j = await res.json();
  // description is ADF (JSON) — the PR href lives in a link mark; stringify + regex finds it.
  const blob = JSON.stringify(j?.fields?.description ?? '');
  const m = /github\.com\/[^/"\\]+\/([a-z0-9._-]+)\/pull\/(\d+)/i.exec(blob);
  return m ? { repo: m[1], number: +m[2] } : null;
}
/** FALLBACK title: the JIRA summary (for a clean commit message), if creds are present. */
async function jiraSummary(task: string): Promise<string | null> {
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  if (!email || !token) return null;
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const res = await fetch(`${JIRA_BASE}/rest/api/3/issue/${encodeURIComponent(task)}?fields=summary`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'User-Agent': 'vc-hotfix-deliver' } });
  if (!res.ok) return null;
  return (await res.json())?.fields?.summary ?? null;
}

// ── deploy manifest (vc-deploy-dev packages.json) ──────────────────────────────
interface Manifest { text: string; sha: string; json: any; }
async function fetchManifest(c: EnvCoords): Promise<Manifest> {
  const j = await ghJson(`https://api.github.com/repos/${c.deployOwner}/${c.deployRepo}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(c.branch)}`);
  if (!j?.content) throw new Error(`Could not read ${c.deployOwner}/${c.deployRepo}/${c.path}@${c.branch}`);
  const text = Buffer.from(j.content, 'base64').toString('utf8');
  return { text, sha: j.sha, json: JSON.parse(text) };
}
/** Current pinned version of a module Id inside the manifest (GithubReleases source), or null. */
function pinnedModule(json: any, id: string): { version: string; sourceIdx: number } | null {
  const sources = json.Sources ?? [];
  for (let i = 0; i < sources.length; i++) {
    for (const m of sources[i]?.Modules ?? []) if (m?.Id === id) return { version: String(m.Version), sourceIdx: i };
  }
  return null;
}
/** Produce the new manifest text with the module bumped to `version` (preserving 2-space JSON). */
function bumpModule(json: any, id: string, version: string): string {
  const clone = JSON.parse(JSON.stringify(json));
  for (const src of clone.Sources ?? []) for (const m of src?.Modules ?? []) if (m?.Id === id) m.Version = version;
  return JSON.stringify(clone, null, 2) + '\n';
}
function bumpPlatform(json: any, version: string): string {
  const clone = JSON.parse(JSON.stringify(json));
  clone.PlatformVersion = version;
  clone.PlatformImageTag = version;
  return JSON.stringify(clone, null, 2) + '\n';
}
/** How many lines actually changed between the original manifest text and the re-serialized one.
 * `bumpModule`/`bumpPlatform` round-trip the WHOLE file through JSON.parse+stringify rather than
 * editing the target value in place, so if the source file's on-disk formatting (key order, line
 * endings, indentation) differs even slightly from a plain 2-space stringify, the "bump" silently
 * rewrites the entire file. This is still valid JSON either way, but a big, unreviewable diff on a
 * commit that triggers a live deploy is worth flagging loudly rather than letting it pass quietly —
 * see the caller for the `expectedChangedLines` threshold. */
function countChangedLines(before: string, after: string): number {
  const a = before.split('\n'), b = after.split('\n');
  if (a.length !== b.length) return Math.max(a.length, b.length); // structural reformat — treat as fully changed
  let changed = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) changed++;
  return changed;
}
/** Gated write: commit the new manifest to the branch. Returns the commit sha. */
async function commitManifest(c: EnvCoords, newText: string, sha: string, message: string): Promise<string> {
  const res = await fetch(`https://api.github.com/repos/${c.deployOwner}/${c.deployRepo}/contents/${c.path.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'PUT', headers: ghHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ message, content: Buffer.from(newText, 'utf8').toString('base64'), sha, branch: c.branch }),
  });
  if (!res.ok) { const b = await res.text().catch(() => ''); throw new Error(`Contents PUT failed (HTTP ${res.status}) on ${c.branch}. ${b.slice(0, 300)}`); }
  return (await res.json())?.commit?.sha ?? '';
}

// ── deploy Action poll (match by head_sha of our commit) ───────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitDeploy(c: EnvCoords, commitSha: string, timeoutS: number): Promise<{ ok: boolean; url: string; note: string }> {
  const deadline = Date.now() + timeoutS * 1000;
  let url = `https://github.com/${c.deployOwner}/${c.deployRepo}/actions?query=branch%3A${c.branch}`;
  while (Date.now() < deadline) {
    const runs = await ghJson(`https://api.github.com/repos/${c.deployOwner}/${c.deployRepo}/actions/runs?branch=${encodeURIComponent(c.branch)}&event=push&per_page=15`);
    // The backend/packages.json push fires "Cloud platform deployment" (deploy-backend.yml). Match on
    // OUR commit sha so we never latch onto an unrelated concurrent run.
    const run = (runs?.workflow_runs ?? []).find((r: any) =>
      r.head_sha === commitSha && (/deploy-backend\.yml$/.test(r.path || '') || /platform deployment/i.test(r.name || '')));
    if (run) {
      url = run.html_url;
      if (run.status === 'completed') return { ok: run.conclusion === 'success', url, note: `deploy Action ${run.conclusion}` };
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return { ok: false, url, note: `deploy Action did not complete within ${timeoutS}s` };
}

// ── live module-version poll (/api/platform/modules) ───────────────────────────
async function getAdminToken(c: EnvCoords): Promise<string | null> {
  if (!c.backUrl) return null;
  const body = new URLSearchParams({ grant_type: 'password', username: c.admin, password: c.password });
  try {
    const r = await fetch(`${c.backUrl}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body });
    if (r.status !== 200) return null;
    return (await r.json())?.access_token ?? null;
  } catch { return null; }
}
/** `status` lets the poller tell "still restarting" (5xx/network) apart from "token went stale"
 * (401/403) — both previously collapsed into the same `null`, so a persistent auth failure could
 * spin silently until timeout with a note that read identically to "app just hasn't come up yet". */
async function liveModuleVersion(c: EnvCoords, token: string, id: string): Promise<{ status: number; version: string | null }> {
  try {
    const r = await fetch(`${c.backUrl}/api/platform/modules`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return { status: r.status, version: null };
    const mods = await r.json();
    const m = (Array.isArray(mods) ? mods : []).find((x: any) => (x.id || '').toLowerCase() === id.toLowerCase());
    return { status: r.status, version: m?.version ?? null };
  } catch { return { status: 0, version: null }; }
}
/** Single /health probe (used to confirm a Platform delivery, which has no modules-API version). */
async function platformHealthy(c: EnvCoords): Promise<boolean> {
  try { const r = await fetch(`${c.backUrl}/health`, { redirect: 'manual' }); return r.status === 200; } catch { return false; }
}
/** Poll the live env until the module reports `target` (or timeout). */
async function waitLiveVersion(c: EnvCoords, id: string, target: string, timeoutS: number): Promise<{ ok: boolean; version: string | null; note: string }> {
  const deadline = Date.now() + timeoutS * 1000;
  let token = await getAdminToken(c);
  if (!token) return { ok: false, version: null, note: `could not get an admin token at ${c.backUrl} — verify the version by hand` };
  let last: string | null = null;
  let consecutiveAuthFailures = 0;
  while (Date.now() < deadline) {
    const { status, version } = await liveModuleVersion(c, token, id);
    last = version;
    if (version === target) return { ok: true, version, note: `live module ${id} = ${version}` };
    consecutiveAuthFailures = status === 401 || status === 403 ? consecutiveAuthFailures + 1 : 0;
    await sleep(POLL_INTERVAL_MS);
    token = (await getAdminToken(c)) || token; // refresh (deploy may bounce the app / expire the token)
  }
  if (consecutiveAuthFailures > 0) {
    return { ok: false, version: last, note: `admin token was rejected (401/403) on the last ${consecutiveAuthFailures} check(s) at ${c.backUrl} — this may be an auth problem, not "still restarting"; verify credentials before assuming the version` };
  }
  return { ok: false, version: last, note: `live module ${id} still ${last ?? 'unreachable'} (expected ${target}) after ${timeoutS}s` };
}

// controlled exit — never process.exit() with a fetch socket open (libuv assert on Windows).
class Exit { constructor(public code: number) {} }
function fail(msg: string): never { console.error(`[hotfix-deliver] ${msg}`); throw new Exit(2); }

async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const has = (n: string) => args.includes(`--${n}`);
  const task = args.find((a) => !a.startsWith('--'))?.toUpperCase();
  const asJson = has('json');
  // Dry-run is the default (no write happens without --apply); --dry-run is accepted as an explicit,
  // self-documenting no-op — recognizing it (rather than silently ignoring an unknown flag) means a
  // caller that types it gets the write-safe behavior they asked for even if --apply is also present.
  const apply = has('apply') && !has('dry-run');
  const noWait = has('no-wait');
  const timeoutFlag = flag('timeout');
  const timeoutS = timeoutFlag !== undefined && Number.isFinite(Number(timeoutFlag)) ? Number(timeoutFlag) : DEFAULT_TIMEOUT_S;
  const envs = (flag('envs') ?? 'stable,regression').split(',').map((s) => s.trim()).filter(Boolean);
  const versionOverride = flag('version');
  const passwordOverride = flag('password');

  if (!task || !/^[A-Z][A-Z0-9]{1,9}-\d+$/.test(task)) fail('Usage: npx tsx scripts/hotfix-deliver.ts <TASK-KEY> [--envs=stable,regression] [--dry-run (default) | --apply] [--repo=] [--pr=] [--version=] [--json]');

  TOKEN = loadToken();
  if (!TOKEN) fail('No GIT_TOKEN — a PAT with contents:write on vc-deploy-dev is required (read .env.local).');
  if (apply && !asJson) console.error('[hotfix-deliver] --apply: gated WRITES enabled (one commit per env).');
  else if (!asJson) console.error('[hotfix-deliver] dry-run (read-only) — pass --apply to commit.');

  // ── 1. task → repo + fix commit ──
  const { repo, fix } = await resolveTask(task, flag('repo'), flag('pr')).catch((e) => fail(e.message));
  if (!fix.merged) fail(`PR ${repo}#${fix.number} for ${task} is not merged — a hotfix delivers a released fix. Merge + release first.`);
  const fixSha = fix.mergeCommitSha!;
  const summary = (await jiraSummary(task).catch(() => null)) || fix.title || 'hotfix';
  // Prefer an explicit --message (the orchestrator passes the clean JIRA summary); else derive it.
  // Strip a leading duplicate of the key from the derived summary (PR titles like "fix(VCST-XXXX): …").
  const commitMessage = flag('message')
    || `${task}: ${summary.replace(new RegExp(`^\\s*(fix|feat|chore)?\\(?${task}\\)?\\s*:?\\s*`, 'i'), '').trim() || 'hotfix'}`;
  const isPlatform = repo === 'vc-platform';
  if (repo === 'vc-frontend') fail('vc-frontend (theme) is delivered via the storefront/theme deploy, not backend/packages.json — out of scope for hotfix-deliver.');
  const moduleId = isPlatform ? null : Object.entries(loadRepoMap().modules).find(([, r]) => r === repo)?.[0] ?? null;
  if (!isPlatform && !moduleId) fail(`Could not map repo ${repo} → a manifest module Id (config/module-repo-map.json). Add it and retry.`);

  if (!asJson) {
    console.log(`\nHotfix delivery — ${task}`);
    console.log(`Repo:    ${repo}${moduleId ? ` (module ${moduleId})` : ' (Platform)'}`);
    console.log(`PR:      #${fix.number} "${fix.title}" → MERGED  ${fix.url}`);
    console.log(`Fix sha: ${fixSha}`);
    console.log(`Commit:  "${commitMessage}"`);
  }

  // ── per-env delivery ──
  const results: EnvResult[] = [];
  // Fail-fast across envs: once an env has been WRITTEN but did not come up clean, pause the rest
  // (matches "deliver one env at a time; a failure on the first pauses the second").
  let aborted = false;
  for (const env of envs) {
    if (aborted) {
      const key = env.replace(/^vcptcore[_-]?/, '');
      results.push({ env: key, branch: '—', moduleId, pinned: null, line: null, target: null, verdict: 'skipped', note: 'a prior env failed after its commit under --apply — paused (deliver/inspect it before this one)' });
      continue;
    }
    let c: EnvCoords;
    try { c = loadEnvCoords(env, passwordOverride); } catch (e: any) { results.push({ env, branch: '—', moduleId, pinned: null, line: null, target: null, verdict: 'error', note: e.message }); continue; }
    const r: EnvResult = { env: c.env, branch: c.branch, moduleId, pinned: null, line: null, target: null, verdict: 'error' };
    try {
      const manifest = await fetchManifest(c);

      // 2. current pinned version + line
      let pinnedVer: string | null;
      if (isPlatform) pinnedVer = manifest.json.PlatformVersion ? String(manifest.json.PlatformVersion) : null;
      else {
        const p = pinnedModule(manifest.json, moduleId!);
        pinnedVer = p?.version ?? null;
        // Guard: a module currently pinned via a prerelease AzureBlob source (BlobName, not {Id,Version})
        // must NOT be silently version-bumped — moving it to a released hotfix is a source change (remove
        // the blob entry, add it under GithubReleases). STOP and hand off rather than corrupt the manifest.
        const srcName = p ? String(manifest.json.Sources?.[p.sourceIdx]?.Name ?? '') : '';
        if (p && !/github/i.test(srcName)) {
          results.push({ ...r, pinned: pinnedVer, verdict: 'wrong-source', note: `${moduleId} is pinned via the "${srcName}" source (prerelease), not GithubReleases — moving it to a released hotfix is a source change; do it by hand` });
          continue;
        }
      }
      if (!pinnedVer) { results.push({ ...r, verdict: 'not-in-manifest', note: `${isPlatform ? 'Platform' : moduleId} is not pinned in ${c.branch}'s packages.json — nothing to hotfix here` }); continue; }
      r.pinned = pinnedVer;
      const sv = parseSemVer(pinnedVer);
      if (!sv) { results.push({ ...r, verdict: 'error', note: `unparseable pinned version ${pinnedVer}` }); continue; }
      r.line = lineOf(sv);

      // Guard: an explicit --version must be on the SAME line as this env's pin — never cross-pin
      // generations (stable on 3.1000 must not get a 3.1011 build just because --version said so).
      if (versionOverride) {
        const ov = parseSemVer(versionOverride);
        if (!ov || lineOf(ov) !== r.line) { results.push({ ...r, target: versionOverride, verdict: 'version-line-mismatch', note: `--version=${versionOverride} is not on this env's line ${r.line} — refusing to cross-pin generations` }); continue; }
      }

      // 3. target = the released hotfix on this line (highest X.Y.* containing the fix)
      let target = versionOverride ?? null;
      if (!target) {
        const highest = await highestOnLine(repo, sv);
        if (highest == null) { results.push({ ...r, verdict: 'error', note: `pinned tag ${pinnedVer} not found on ${repo} — cannot resolve the line` }); continue; }
        if (highest === sv.patch) {
          // nothing newer on the line — is the fix already in the pinned release?
          const hasFix = await tagHasFix(repo, pinnedVer, fixSha);
          results.push({ ...r, target: pinnedVer, verdict: hasFix ? 'already-delivered' : 'no-hotfix-on-line', note: hasFix ? `pinned ${pinnedVer} already contains the fix` : `no patch above ${pinnedVer} on line ${r.line} — run /qa-hotfix for this bundle first` });
          continue;
        }
        // walk down from the highest patch to the pinned; first one that contains the fix is the hotfix
        let chosen: string | null = null;
        for (let n = highest; n > sv.patch; n--) { const t = tagOf(sv, n); if (await tagHasFix(repo, t, fixSha)) { chosen = t; break; } }
        if (!chosen) { results.push({ ...r, verdict: 'no-hotfix-on-line', note: `patches exist above ${pinnedVer} on line ${r.line} but none contain the fix — run /qa-hotfix for this bundle first` }); continue; }
        target = chosen;
      }
      r.target = target;
      if (target === pinnedVer) { results.push({ ...r, verdict: 'already-delivered', note: `already pinned at ${target}` }); continue; }

      // 4. asset gate (rollback trap)
      if (!isPlatform) {
        const asset = await releaseAssetOk(repo, moduleId!, target);
        if (!asset.ok) { results.push({ ...r, verdict: 'asset-missing', note: asset.note }); continue; }
      } else if (!(await tagExists(repo, target))) {
        results.push({ ...r, verdict: 'asset-missing', note: `vc-platform release tag ${target} not found` }); continue;
      }

      // 5. gated write (only with --apply)
      const newText = isPlatform ? bumpPlatform(manifest.json, target) : bumpModule(manifest.json, moduleId!, target);
      const expectedChangedLines = isPlatform ? 2 : 1; // Platform: PlatformVersion + PlatformImageTag; module: one Version line
      const changedLines = countChangedLines(manifest.text, newText);
      const reformatWarning = changedLines > expectedChangedLines
        ? ` ⚠ this bump reformats ~${changedLines} lines (expected ${expectedChangedLines}) — the source file's formatting differs from a plain 2-space JSON.stringify; review the full diff before confirming, not just the version change`
        : '';
      if (!apply) { results.push({ ...r, verdict: 'planned', note: `would bump ${isPlatform ? 'Platform' : moduleId} ${pinnedVer} → ${target} and commit "${commitMessage}"${reformatWarning}` }); continue; }
      if (reformatWarning && !asJson) console.error(`[hotfix-deliver] [${c.env}]${reformatWarning}`);
      const commitSha = await commitManifest(c, newText, manifest.sha, commitMessage);
      r.commitSha = commitSha;
      if (!asJson) console.log(`\n[${c.env}] committed ${pinnedVer} → ${target} @ ${c.branch} (${commitSha.slice(0, 8)})`);

      // NOT 'delivered' — that verdict means deploy-green + live-version-confirmed (see Step 2 of the
      // skill). --no-wait skips both checks, so the commit landed but nothing was actually confirmed;
      // label it distinctly so neither the exit code nor the printed badge reads as a clean pass.
      if (noWait) { results.push({ ...r, verdict: 'committed-unconfirmed', note: `committed (--no-wait: deploy + version not confirmed — verify out-of-band before treating this as delivered)` }); continue; }

      // 6. wait for the deploy Action
      if (!asJson) console.log(`[${c.env}] waiting for "Cloud platform deployment" …`);
      const dep = await waitDeploy(c, commitSha, timeoutS);
      r.deployRunUrl = dep.url;
      if (!dep.ok) { results.push({ ...r, verdict: 'deploy-failed', note: dep.note }); continue; }

      // 7. confirm the env is live. Module hotfix → poll /api/platform/modules for the version.
      //    Platform → no modules-API version, so confirm the app came back up via /health.
      if (isPlatform) {
        const healthy = await platformHealthy(c);
        results.push({ ...r, verdict: healthy ? 'delivered' : 'not-confirmed', note: healthy ? `deploy succeeded; /health 200 (Platform ${target} — no modules-API version to assert)` : `deploy Action succeeded but /health is not 200 yet — verify Platform ${target} by hand` });
      } else {
        if (!asJson) console.log(`[${c.env}] deploy OK — polling /api/platform/modules for ${moduleId}=${target} …`);
        const live = await waitLiveVersion(c, moduleId!, target, timeoutS);
        r.liveVersion = live.version ?? undefined;
        results.push({ ...r, verdict: live.ok ? 'delivered' : 'not-confirmed', note: live.note });
      }
    } catch (e: any) {
      results.push({ ...r, verdict: 'error', note: e.message });
    }
    // Fail-fast: if THIS env was committed (write happened) and the deploy/version check actively
    // FAILED, pause the rest. 'committed-unconfirmed' (--no-wait) is a deliberate skip, not a
    // failure, so it must NOT trip this guard — otherwise --no-wait across multiple envs would
    // pause after the first env every time, defeating its purpose.
    const last = results[results.length - 1];
    const HARD_FAIL_AFTER_COMMIT: EnvVerdict[] = ['deploy-failed', 'not-confirmed'];
    if (apply && last.commitSha && HARD_FAIL_AFTER_COMMIT.includes(last.verdict)) aborted = true;
  }

  // ── output ──
  const bad: EnvVerdict[] = ['no-hotfix-on-line', 'asset-missing', 'not-in-manifest', 'deploy-failed', 'not-confirmed', 'committed-unconfirmed', 'wrong-source', 'version-line-mismatch', 'skipped', 'error'];
  const blocked = results.some((x) => bad.includes(x.verdict));

  if (asJson) { console.log(JSON.stringify({ task, repo, moduleId, fixSha, commitMessage, apply, envs: results, checkedAt: new Date().toISOString() }, null, 2)); throw new Exit(blocked ? 1 : 0); }

  const badge = (v: EnvVerdict): string => ({
    delivered: '✅ delivered', 'already-delivered': '◯ already delivered', planned: '📝 planned (dry-run)',
    'no-hotfix-on-line': '⛔ no hotfix on line', 'asset-missing': '⛔ asset missing', 'not-in-manifest': '— not in manifest',
    'deploy-failed': '⛔ deploy failed', 'not-confirmed': '⚠ deployed, version not confirmed',
    'committed-unconfirmed': '⚠ committed, deploy/version NOT confirmed (--no-wait)',
    'wrong-source': '⛔ prerelease source (hand off)', 'version-line-mismatch': '⛔ --version wrong line',
    skipped: '⏸ skipped (prior env failed)', error: '⚠ error',
  } as Record<EnvVerdict, string>)[v];
  console.log(`\n${'Env'.padEnd(12)}  ${'Branch'.padEnd(22)}  ${'Pinned'.padEnd(12)}  ${'Target'.padEnd(12)}  Verdict`);
  console.log('─'.repeat(96));
  for (const x of results) {
    console.log(`${x.env.padEnd(12)}  ${x.branch.padEnd(22)}  ${(x.pinned ?? '—').padEnd(12)}  ${(x.target ?? '—').padEnd(12)}  ${badge(x.verdict)}`);
    if (x.note) console.log(`  ↳ ${x.note}`);
    if (x.deployRunUrl) console.log(`  ↳ deploy: ${x.deployRunUrl}`);
  }
  console.log('─'.repeat(96));

  if (!apply && results.some((x) => x.verdict === 'planned')) {
    console.log(`\nDry-run — nothing was written. To deliver (gated write, after human confirm):`);
    console.log(`  npm run hotfix:deliver -- ${task} --envs=${envs.join(',')} --apply`);
  }
  if (results.some((x) => x.verdict === 'delivered')) {
    console.log(`\nNext (owned by /qa-hotfix-check): verify the fix behaviour live on each delivered env,`);
    console.log(`then comment on ${task} (English) and bump the stable bundles.`);
  }
  if (results.some((x) => x.verdict === 'committed-unconfirmed')) {
    console.log(`\n⚠ Committed with --no-wait — confirm the deploy + live version out-of-band before treating`);
    console.log(`  that env as delivered; do not proceed to behaviour verification / the JIRA comment until confirmed.`);
  }
  throw new Exit(blocked ? 1 : 0);
}

function loadRepoMap(): { platformRepo: string; themeRepo: string; modules: Record<string, string> } {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, 'config/module-repo-map.json'), 'utf8'));
}

main().catch((e) => {
  if (e instanceof Exit) { process.exitCode = e.code; return; }
  console.error(`[hotfix-deliver] fatal: ${e.message}`);
  process.exitCode = 2;
});
