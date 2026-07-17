/**
 * hotfix-precheck.ts
 *
 * Read-only precheck for releasing a HOTFIX of an already-merged fix into one or more
 * frozen stable bundles (vc-modules/bundles/vN). Answers, deterministically and per-bundle:
 *
 *   1. Which product repo + merged PR + fix commit does this JIRA task map to?
 *   2. Is that PR MERGED and has the fix already SHIPPED in a normal release?
 *      (If not → STOP: merge / release on the main line first.)
 *   3. For each requested bundle (v12, v14, …): what version is this target pinned at,
 *      does a `support/<major.minor>` hotfix branch exist for that line, is the fix already
 *      on it, and what patch would a hotfix produce (highest-on-line + 1)?
 *
 * It performs NO writes. The cherry-pick + push + "Release hotfix" workflow trigger are
 * gated, confirm-before-each-write steps owned by the /qa-hotfix orchestrator
 * (scripts/hotfix-release.ts triggers the workflow). See .claude/skills/qa-hotfix.
 *
 * VirtoCommerce hotfix mechanics (verified 2026-06-23):
 *   - Hotfix branch convention: `support/<major.minor>` (e.g. order 3.1000.3 → support/3.1000).
 *   - Each repo ships a "Release hotfix" workflow_dispatch:
 *       module repo  → module-release-hotfix.yml
 *       vc-platform  → platform-release-hotfix.yml
 *       vc-frontend  → theme-release-hotfix.yml
 *     run ON the support branch with incrementPatch=true → publishes X.Y.(Z+1), makeLatest=false.
 *
 * Usage:
 *   npx tsx scripts/hotfix-precheck.ts <TASK-KEY> --bundles=v12,v14 [options]
 *
 * Options:
 *   --bundles=v12,v14   Comma-separated bundle names (vN) or full package.json URLs. REQUIRED.
 *   --repo=<name>       Override the auto-resolved repo (use when a task touches several repos).
 *   --commit=<sha>      Override the fix commit to cherry-pick (default: the PR merge commit).
 *   --json              Machine-readable output.
 *
 * Exit codes:
 *   0  every requested bundle is `ready` or `already-applied` — proceed to the write steps
 *   1  at least one gate is blocked (PR open / not released / no support branch / not in bundle)
 *   2  tool error: task/repo unresolved, GitHub auth/rate-limit failure
 *
 * Auth: reads GIT_TOKEN (fallback GITHUB_TOKEN / GITHUB_PERSONAL_ACCESS_TOKEN) from
 * .env.local / .env.defaults / process.env — same as scripts/bundle-version-check.ts.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const OWNER = 'VirtoCommerce';
const MAX_PATCH_PROBE = 40;
const MAX_RELEASES_SCAN = 20; // how many recent releases to scan for "fix already shipped"
const BUNDLES_BASE = `https://github.com/VirtoCommerce/vc-modules/blob/${process.env.BUNDLE_REF || 'master'}/bundles`;
const JIRA_BASE = (process.env.JIRA_BASE_URL || 'https://virtocommerce.atlassian.net').replace(/\/$/, '');
// A fixable / hotfixable product repo: a module (incl. x-api split), the platform, or the theme.
const PRODUCT_REPO_RE = /^vc-module(-x)?-[a-z0-9.-]+$/i;
const isProductRepo = (n: string) => n === 'vc-platform' || n === 'vc-frontend' || PRODUCT_REPO_RE.test(n);

// ── types ──────────────────────────────────────────────────────────────────────
interface SemVer { major: number; minor: number; patch: number; }
interface PrInfo { repo: string; number: number; title: string; url: string; merged: boolean; mergeCommitSha: string | null; baseRef: string | null; }
type Verdict = 'ready' | 'already-applied' | 'no-support-branch' | 'not-in-bundle' | 'unparseable' | 'error';
interface BundleResult {
  bundle: string; bundleUrl: string;
  pinned: string | null; line: string | null;
  supportBranch: string; supportBranchExists: boolean;
  highestOnLine: string | null; nextHotfix: string | null;
  verdict: Verdict; note?: string;
  codeApply?: { checked: number; missing: string[] }; // code-level cherry-pick applicability signal
  baseline?: { props: string | null; manifest: string | null; predictedNext: string | null; mismatch: boolean; collision: boolean }; // version baseline the Release-hotfix workflow increments from
}

// ── env / token ──────────────────────────────────────────────────────────────
function loadToken(): string | undefined {
  for (const f of ['.env.defaults', '.env.local']) {
    const p = resolve(REPO_ROOT, f);
    if (existsSync(p)) {
      const vars = parseDotenv(readFileSync(p));
      for (const [k, v] of Object.entries(vars)) if (!process.env[k]) process.env[k] = v;
    }
  }
  return process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}
let TOKEN: string | undefined;
function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'vc-hotfix-precheck',
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}

// ── version parsing ──────────────────────────────────────────────────────────
function parseSemVer(v: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  return m ? { major: +m[1], minor: +m[2], patch: +m[3] } : null;
}
const lineOf = (s: SemVer) => `${s.major}.${s.minor}`;
const tagOf = (s: SemVer, patch: number) => `${s.major}.${s.minor}.${patch}`;

// ── GitHub API ───────────────────────────────────────────────────────────────
async function ghJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    throw new Error(
      `GitHub rate-limited (HTTP ${res.status}, remaining=${remaining}). ` +
        (TOKEN ? 'Wait for reset.' : 'Set GIT_TOKEN in .env.local to raise the limit to 5000/h.')
    );
  }
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
  return res.json();
}
async function refExists(repo: string, type: 'tags' | 'heads', name: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/git/ref/${type}/${encodeURIComponent(name)}`, { headers: ghHeaders() });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limited (HTTP ${res.status})`);
  throw new Error(`GitHub API error ${res.status} for ${type}/${name} in ${repo}`);
}
const tagExists = (repo: string, tag: string) => refExists(repo, 'tags', tag);
const branchExists = (repo: string, br: string) => refExists(repo, 'heads', br);

/** GitHub compare base...head. Returns {aheadBy, behindBy} or null (one ref missing). */
async function compare(repo: string, base: string, head: string): Promise<{ aheadBy: number; behindBy: number } | null> {
  const j = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`);
  if (!j) return null;
  return { aheadBy: j.ahead_by ?? 0, behindBy: j.behind_by ?? 0 };
}
/** True iff `sha` is already contained in `ref` (ref...sha has nothing ahead). */
async function refContains(repo: string, ref: string, sha: string): Promise<boolean> {
  const c = await compare(repo, ref, sha);
  return !!c && c.aheadBy === 0;
}
/** Paths the fix commit touches, with status (added/modified/removed/renamed). */
async function commitTouchedFiles(repo: string, sha: string): Promise<{ path: string; status: string; prev?: string; patch?: string }[]> {
  const c = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/commits/${encodeURIComponent(sha)}`);
  return (c?.files ?? []).map((f: any) => ({ path: f.filename, status: f.status, prev: f.previous_filename, patch: f.patch }));
}

/**
 * Fix-shape check — the developer's pre-hotfix checklist (pts 1–3), computed once from the fix
 * commit's own diff (repo/task-level, NOT per-bundle). Points 4 (cherry-pick) / 5 (vc-build compress
 * = the Release-hotfix workflow build+test job) / 6 (regression env) are enforced downstream.
 *   1. single module — the fix stays inside ONE src/<Project> tree (multi-project ⇒ hand off)
 *   3. no dependency-version bump — the fix must not raise a VirtoCommerce.* dependency pin in a
 *      module.manifest / .csproj / Directory.Build.props (that would drag other modules' versions)
 *   2. no breaking changes — HEURISTIC only: flag contract-bearing files (manifest, csproj, props,
 *      DTO/Model/Contract/interface, Client) so a human confirms; never auto-passes a breaking change.
 * Semantic "does the feature exist here / won't it break" is NOT decidable statically — that is what
 * the build+test job and the regression env are for. On any RISK the tool STOPs → analyze + involve
 * a developer (never force it through). */
interface FixShape {
  modules: string[];          // distinct module identities (src/<Project> root, layer suffix stripped) the fix touches
  multiModule: boolean;       // pt.1 violated — fix spans >1 module
  dependencyBumps: string[];  // pt.3 violated — "file: Pkg oldVer → newVer"
  contractFiles: string[];    // pt.2 heuristic — contract-bearing files touched (human must confirm)
}
function analyzeFixShape(files: { path: string; status: string; prev?: string; patch?: string }[]): FixShape {
  // A single VC module conventionally SPANS several src/<Project> directories — Core/Data/Web (and
  // tests/<Project>.Tests) — per knowledge/architecture/vc-module-architecture.md §2. Bucketing by the
  // raw project folder would flag every ordinary cross-layer fix (Core DTO + Data service + Web
  // controller) as "multi-module", so strip the trailing layer suffix before deduping — only a fix
  // that genuinely spans distinct MODULES (different base name) counts as pt.1's multi-module signal.
  const LAYER_SUFFIX_RE = /\.(Core|Data|Web|Client|Test|Tests)$/i;
  const srcRoot = (p: string) => (/^src\/([^/]+)\//.exec(p)?.[1]) ?? null;
  const moduleOf = (project: string) => project.replace(LAYER_SUFFIX_RE, '');
  const modules = [...new Set(files.map((f) => srcRoot(f.path)).filter((x): x is string => !!x).map(moduleOf))];

  // pt.3 — dependency-version bumps: scan added/removed patch lines for a VirtoCommerce.* version.
  //   .csproj:          <PackageReference Include="VirtoCommerce.X.Core" Version="3.800.0" />
  //   module.manifest:  <dependency id="VirtoCommerce.X" version="3.800.0" />
  //   Directory.Build.props: <VirtoCommercePlatformVersion>3.800.0</VirtoCommercePlatformVersion>
  const isDepFile = (p: string) => /module\.manifest$/i.test(p) || /\.csproj$/i.test(p) || /Directory\.Build\.props$/i.test(p);
  const verOnLine = (line: string): string | null => {
    const m = /(?:Version|version)\s*=\s*"([^"]+)"/.exec(line)                 // csproj / manifest attribute
      || /<(?:[A-Za-z.]*Version)>([^<]+)<\/[A-Za-z.]*Version>/.exec(line);      // props element
    return m?.[1] ?? null;
  };
  // Identifies WHICH dependency a version belongs to, so a file that bumps several packages in one
  // commit doesn't get its old/new versions flattened and cross-attributed.
  const depKeyOnLine = (line: string): string | null =>
    /(?:Include|id)\s*=\s*"([^"]+)"/.exec(line)?.[1]                           // csproj Include= / manifest id=
    ?? /<([A-Za-z.]*Version)>/.exec(line)?.[1]                                 // props element tag name
    ?? null;
  const dependencyBumps: string[] = [];
  for (const f of files.filter((f) => isDepFile(f.path) && f.patch)) {
    const removedByKey = new Map<string, string>(), addedByKey = new Map<string, string>();
    for (const l of f.patch!.split('\n')) {
      if (!/VirtoCommerce/i.test(l)) continue;
      const ver = verOnLine(l);
      if (ver === null) continue;
      const key = depKeyOnLine(l) ?? '?';
      if (l.startsWith('+') && !l.startsWith('+++')) addedByKey.set(key, ver);
      else if (l.startsWith('-') && !l.startsWith('---')) removedByKey.set(key, ver);
    }
    for (const key of new Set([...removedByKey.keys(), ...addedByKey.keys()])) {
      const from = removedByKey.get(key) ?? '∅', to = addedByKey.get(key) ?? '∅';
      if (from !== to) dependencyBumps.push(`${f.path}: ${key} ${from} → ${to}`);
    }
  }

  // pt.2 — breaking-change surface (heuristic; requires human confirmation, not an auto-block).
  const CONTRACT_RE = /(module\.manifest$|\.csproj$|Directory\.Build\.props$|Dto\.cs$|Model[s]?\/|Contracts?\/|[/\\]I[A-Z][A-Za-z0-9]+\.cs$|Client\.cs$)/;
  const contractFiles = files.filter((f) => f.status !== 'added' && CONTRACT_RE.test(f.path)).map((f) => f.path);

  return { modules, multiModule: modules.length > 1, dependencyBumps, contractFiles };
}
/** True if a path exists on the given ref (branch/tag). */
async function pathExistsOnRef(repo: string, path: string, ref: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, { headers: ghHeaders() });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limited (HTTP ${res.status})`);
  return false;
}
/** Code-level applicability signal (no clone): every file the fix MODIFIES/REMOVES/RENAMES must
 * exist on the support branch, else the line diverged there and the cherry-pick will likely
 * conflict. ADDED files are expected to be absent, so they're excluded. The definitive check is
 * still the actual cherry-pick at the write step. */
async function codeApplyCheck(repo: string, files: { path: string; status: string; prev?: string }[], branch: string): Promise<{ checked: number; missing: string[] }> {
  const need = files.filter((f) => f.status !== 'added').map((f) => f.prev || f.path);
  const present = await Promise.all(need.map((p) => pathExistsOnRef(repo, p, branch)));
  return { checked: need.length, missing: need.filter((_, i) => !present[i]) };
}

/** Read a file's raw text on a ref, or null if absent. */
async function rawFile(repo: string, path: string, ref: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(ref)}`, { headers: { ...ghHeaders(), Accept: 'application/vnd.github.raw' } });
  return res.status === 200 ? res.text() : null;
}
/** Locate the module's manifest (prefer src/**.Web/module.manifest, skip samples/tests). */
async function findManifestPath(repo: string, ref: string): Promise<string | null> {
  const tree = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`);
  const paths: string[] = (tree?.tree ?? []).map((t: any) => t.path).filter((p: string) => /module\.manifest$/.test(p) && !/^samples\//.test(p));
  return paths.find((p) => /^src\/.*\.Web\/module\.manifest$/.test(p)) ?? paths.find((p) => p.startsWith('src/')) ?? paths[0] ?? null;
}
/** The version baseline the Release-hotfix workflow actually increments from: VersionPrefix in
 * Directory.Build.props and <version> in the module's manifest. These two MUST match (else the
 * "Get Artifact Version" CI step fails) and MUST NOT lag the latest tag (else incrementPatch
 * targets an already-released patch → 422). This is what the workflow does — distinct from the
 * line-state "highest tag + 1" the rest of the precheck reports. */
async function branchBaseline(repo: string, branch: string): Promise<{ props: string | null; manifest: string | null }> {
  const propsTxt = await rawFile(repo, 'Directory.Build.props', branch);
  const props = propsTxt ? (/<VersionPrefix>([^<]+)</.exec(propsTxt)?.[1] ?? null) : null;
  const mp = await findManifestPath(repo, branch);
  const mTxt = mp ? await rawFile(repo, mp, branch) : null;
  const manifest = mTxt ? (/<version>([^<]+)</.exec(mTxt)?.[1] ?? null) : null;
  return { props, manifest };
}

/** Is the fix already on the branch — CHERRY-PICK AWARE? The cherry-pick gets a new SHA, so the
 * original commit isn't an ancestor; also accept the `git cherry-pick -x` trailer
 * ("cherry picked from commit <originalSha>") on a recent commit of the branch. */
async function branchHasFix(repo: string, branch: string, fixSha: string): Promise<boolean> {
  if (await refContains(repo, branch, fixSha)) return true;
  const short = fixSha.slice(0, 8);
  const arr = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=40`);
  const msgs: string[] = Array.isArray(arr) ? arr.map((c: any) => c?.commit?.message ?? '') : [];
  return msgs.some((m) => /cherry picked from commit/i.test(m) && (m.includes(fixSha) || m.includes(short)));
}

/** Highest patch that exists on the line (>= pinned). */
async function highestOnLine(repo: string, pinned: SemVer): Promise<number | null> {
  if (!(await tagExists(repo, tagOf(pinned, pinned.patch)))) return null;
  let highest = pinned.patch;
  for (let n = pinned.patch + 1; n <= pinned.patch + MAX_PATCH_PROBE; n++) {
    if (await tagExists(repo, tagOf(pinned, n))) highest = n;
    else break;
  }
  return highest;
}

// ── task → PR resolution (GitHub search) ───────────────────────────────────────
async function resolvePrsForTask(task: string): Promise<PrInfo[]> {
  // NOTE: do NOT scope to in:title,body — VC PRs often carry the JIRA key only in a comment
  // (the title is a plain "Fix: …"). The unscoped query also matches comments, which is how
  // VCST-5082 → vc-module-catalog#882 resolves. Product-repo + merged filtering keeps noise low.
  const q = encodeURIComponent(`org:${OWNER} ${task} type:pr`);
  const search = await ghJson(`https://api.github.com/search/issues?q=${q}&per_page=30`);
  const items: any[] = search?.items ?? [];
  const candidates = items
    .map((i) => ({ repo: i.repository_url.split('/').pop() as string, number: i.number as number }))
    .filter((c) => isProductRepo(c.repo));
  // Fetch each PR for merge state + merge commit + base branch.
  const out: PrInfo[] = [];
  for (const c of candidates) {
    const pr = await ghJson(`https://api.github.com/repos/${OWNER}/${c.repo}/pulls/${c.number}`);
    if (!pr) continue;
    out.push({
      repo: c.repo, number: c.number, title: pr.title ?? '',
      url: pr.html_url ?? `https://github.com/${OWNER}/${c.repo}/pull/${c.number}`,
      merged: !!pr.merged_at, mergeCommitSha: pr.merge_commit_sha ?? null, baseRef: pr.base?.ref ?? null,
    });
  }
  return out;
}

/** FALLBACK only: when no PR references the task on GitHub, parse the PR link out of the JIRA
 * issue description. Needs JIRA_EMAIL + JIRA_API_TOKEN in .env.local; returns null (with a hint)
 * if they're absent. */
async function prFromJiraDescription(task: string): Promise<{ repo: string; number: number } | null> {
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  if (!email || !token) { console.error(`[hotfix-precheck] no GitHub PR found for ${task}; JIRA description fallback needs JIRA_EMAIL + JIRA_API_TOKEN in .env.local`); return null; }
  const auth = Buffer.from(`${email}:${token}`).toString('base64');
  const res = await fetch(`${JIRA_BASE}/rest/api/3/issue/${encodeURIComponent(task)}?fields=description`, { headers: { Authorization: `Basic ${auth}`, Accept: 'application/json', 'User-Agent': 'vc-hotfix-precheck' } });
  if (!res.ok) { console.error(`[hotfix-precheck] JIRA fetch for ${task} failed (HTTP ${res.status})`); return null; }
  const j = await res.json();
  // description is ADF (JSON) — the PR href lives in a link mark; stringify + regex finds it.
  const blob = JSON.stringify(j?.fields?.description ?? '');
  const m = /github\.com\/[^/"\\]+\/([a-z0-9._-]+)\/pull\/(\d+)/i.exec(blob);
  return m ? { repo: m[1], number: +m[2] } : null;
}

/** Find the most recent published release whose tag already contains the fix commit. */
async function releaseContaining(repo: string, sha: string): Promise<{ tag: string; url: string } | null> {
  const rels: any[] = (await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/releases?per_page=${MAX_RELEASES_SCAN}`)) ?? [];
  for (const r of rels) {
    if (r.draft) continue;
    if (await refContains(repo, r.tag_name, sha)) return { tag: r.tag_name, url: r.html_url };
  }
  return null;
}

// ── repo map (repo → bundle module Id) ─────────────────────────────────────────
interface RepoMap { platformRepo: string; themeRepo: string; modules: Record<string, string>; }
function loadRepoMap(): RepoMap {
  return JSON.parse(readFileSync(resolve(REPO_ROOT, 'config/module-repo-map.json'), 'utf8'));
}

// ── bundle parsing ─────────────────────────────────────────────────────────────
function toRawUrl(url: string): string {
  const blob = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url);
  return blob ? `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}` : url;
}
function bundleUrlOf(name: string): string {
  return /^https?:\/\//i.test(name) ? name : `${BUNDLES_BASE}/${name.replace(/^\/+|\/+$/g, '')}/package.json`;
}
async function fetchBundle(url: string): Promise<any> {
  const res = await fetch(toRawUrl(url), { headers: { 'User-Agent': 'vc-hotfix-precheck', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching bundle ${url}`);
  return res.json();
}
/** Pinned version of a given repo's target inside a bundle, or null if absent. */
function pinnedInBundle(bundle: any, repo: string, map: RepoMap): string | null {
  if (repo === map.platformRepo) return bundle.PlatformVersion ? String(bundle.PlatformVersion) : null;
  if (repo === map.themeRepo) {
    const v = /\/releases\/download\/([^/]+)\//.exec(String(bundle.ThemeB2BVue || ''))?.[1];
    return v ?? null;
  }
  const id = Object.entries(map.modules).find(([, r]) => r === repo)?.[0];
  if (!id) return null; // repo not in map — caller surfaces this
  for (const src of bundle.Sources ?? []) {
    for (const m of src?.Modules ?? []) if (m?.Id === id) return String(m.Version);
  }
  return null;
}

// ── PR direct fetch (JIRA-first: pass the PR from the issue description/dev-panel) ──
/** Parse "owner/repo#123", "repo#123", or a full PR URL → {repo, number}. */
function parsePrRef(ref: string): { repo: string; number: number } | null {
  const url = /github\.com\/[^/]+\/([^/]+)\/pull\/(\d+)/.exec(ref);
  if (url) return { repo: url[1], number: +url[2] };
  const short = /(?:[^/\s]+\/)?([a-z0-9.-]+)#(\d+)/i.exec(ref);
  if (short) return { repo: short[1], number: +short[2] };
  return null;
}
async function fetchPrDirect(repo: string, number: number): Promise<PrInfo | null> {
  const pr = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/pulls/${number}`);
  if (!pr) return null;
  return {
    repo, number, title: pr.title ?? '', url: pr.html_url ?? `https://github.com/${OWNER}/${repo}/pull/${number}`,
    merged: !!pr.merged_at, mergeCommitSha: pr.merge_commit_sha ?? null, baseRef: pr.base?.ref ?? null,
  };
}

// ── main ──────────────────────────────────────────────────────────────────────
/** Controlled exit: set the code and unwind via the bottom catch — NEVER process.exit() with a
 * fetch socket still open (Node 24 + undici aborts with a libuv assertion on Windows, which would
 * clobber the real exit code that CI gates on). */
class Exit { constructor(public code: number) {} }
function fail(msg: string): never { console.error(`[hotfix-precheck] ${msg}`); throw new Exit(2); }

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const has = (name: string) => args.includes(`--${name}`);
  const task = args.find((a) => !a.startsWith('--'))?.toUpperCase();
  const asJson = has('json');
  const bundleNames = (flag('bundles') ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const repoOverride = flag('repo');
  const commitOverride = flag('commit');
  const prOverride = flag('pr'); // "owner/repo#123" | "repo#123" | full PR URL — from the JIRA description/dev-panel

  if (!task || !/^[A-Z][A-Z0-9]{1,9}-\d+$/.test(task)) {
    fail('Usage: npx tsx scripts/hotfix-precheck.ts <TASK-KEY> [--bundles=v12,v14] [--repo=<name>] [--commit=<sha>] [--json]');
  }
  // --bundles is OPTIONAL: omitted → run the gate phase only (PR → merged → released) and stop,
  // so the orchestrator can ASK which bundles are the latest stable before the per-bundle analysis.

  TOKEN = loadToken();
  if (!asJson) console.error(`[hotfix-precheck] auth: ${TOKEN ? 'GIT_TOKEN found' : 'NONE (60 req/h — set GIT_TOKEN in .env.local)'}`);
  const map = loadRepoMap();

  // ── 1. task → PR → repo + fix commit ──
  // JIRA-first: if the caller passes the PR from the issue description/dev-panel (--pr), use it
  // directly — that's authoritative. Otherwise fall back to GitHub search by task key.
  let repo: string | undefined;
  let mergedPr: PrInfo | undefined;
  if (prOverride) {
    const ref = parsePrRef(prOverride);
    if (!ref) fail(`--pr could not be parsed: "${prOverride}" (expected owner/repo#123, repo#123, or a PR URL).`);
    if (!isProductRepo(ref.repo)) fail(`--pr repo ${ref.repo} is not a hotfixable product repo (vc-module-*, vc-platform, vc-frontend).`);
    const pr = await fetchPrDirect(ref.repo, ref.number).catch((e: any) => fail(e.message));
    if (!pr) fail(`PR ${ref.repo}#${ref.number} not found.`);
    repo = ref.repo; mergedPr = pr!;
  } else {
    // PRIMARY: the PR linked to the task (GitHub search by key). FALLBACK: parse it from the JIRA
    // issue description (only when search finds nothing / can't disambiguate).
    let prs: PrInfo[] = [];
    try { prs = await resolvePrsForTask(task); } catch (e: any) { fail(e.message); }
    const repos = [...new Set(prs.map((p) => p.repo))];
    repo = repoOverride ?? (repos.length === 1 ? repos[0] : undefined);
    if (repo) {
      const repoPrs = prs.filter((p) => p.repo === repo);
      mergedPr = repoPrs.find((p) => p.merged) ?? repoPrs[0];
    } else {
      // 0 or multiple repos from search → fall back to the JIRA description link.
      const fromJira = await prFromJiraDescription(task);
      if (fromJira) {
        if (!isProductRepo(fromJira.repo)) fail(`JIRA-described PR repo ${fromJira.repo} is not a hotfixable product repo.`);
        const pr = await fetchPrDirect(fromJira.repo, fromJira.number);
        if (!pr) fail(`JIRA-described PR ${fromJira.repo}#${fromJira.number} not found.`);
        repo = fromJira.repo; mergedPr = pr!;
      } else if (repos.length > 1) {
        fail(`${task} touches multiple repos (${repos.join(', ')}). Disambiguate with --repo=<name> or --pr=<ref>.`);
      } else {
        fail(`No PR linked to ${task} (GitHub search + JIRA description). Pass --pr=<owner/repo#num | url>.`);
      }
    }
    if (!isProductRepo(repo!)) fail(`--repo=${repo} is not a hotfixable product repo (vc-module-*, vc-platform, vc-frontend).`);
  }

  // ── 2a. PR merged? ──
  const prGate = {
    repo, pr: mergedPr ?? null,
    merged: !!mergedPr?.merged,
  };
  const fixSha = commitOverride ?? mergedPr?.mergeCommitSha ?? null;

  // ── 2b. fix shipped in a release? (skip if not merged or no sha) ──
  let releaseGate: { released: boolean; tag?: string; url?: string } = { released: false };
  if (prGate.merged && fixSha) {
    const rel = await releaseContaining(repo, fixSha);
    releaseGate = rel ? { released: true, tag: rel.tag, url: rel.url } : { released: false };
  }

  // ── 3. per-bundle analysis ──
  // Fetch the files the fix touches once (for the code-level applicability check below).
  const touchedFiles = fixSha ? await commitTouchedFiles(repo, fixSha).catch(() => []) : [];
  // Fix-shape check (developer's pre-hotfix checklist, pts 1–3) — repo/task-level, computed once.
  const fixShape = touchedFiles.length ? analyzeFixShape(touchedFiles) : null;
  const bundleResults: BundleResult[] = [];
  for (const name of bundleNames) {
    const url = bundleUrlOf(name);
    const base: BundleResult = { bundle: name, bundleUrl: url, pinned: null, line: null, supportBranch: '', supportBranchExists: false, highestOnLine: null, nextHotfix: null, verdict: 'error' };
    try {
      const bundle = await fetchBundle(url);
      const pinned = pinnedInBundle(bundle, repo, map);
      if (!pinned) { bundleResults.push({ ...base, verdict: 'not-in-bundle', note: `${repo} is not pinned in ${name}` }); continue; }
      base.pinned = pinned;
      const sv = parseSemVer(pinned);
      if (!sv) { bundleResults.push({ ...base, verdict: 'unparseable', note: `unparseable version ${pinned}` }); continue; }
      base.line = lineOf(sv);
      base.supportBranch = `support/${lineOf(sv)}`;
      base.supportBranchExists = await branchExists(repo, base.supportBranch);
      if (!base.supportBranchExists) { bundleResults.push({ ...base, verdict: 'no-support-branch', note: `no ${base.supportBranch} branch — hotfix not physically possible without one` }); continue; }
      const highest = await highestOnLine(repo, sv);
      base.highestOnLine = highest != null ? tagOf(sv, highest) : null;
      base.nextHotfix = highest != null ? tagOf(sv, highest + 1) : null;
      // already on the branch? (cherry-pick aware — original SHA differs after cherry-pick)
      const applied = fixSha ? await branchHasFix(repo, base.supportBranch, fixSha) : false;
      // code-level applicability: do the files the fix touches still exist on this support branch?
      const codeApply = !applied && touchedFiles.length ? await codeApplyCheck(repo, touchedFiles, base.supportBranch) : undefined;
      // version baseline the workflow will increment from (props/manifest on the branch)
      const bl = await branchBaseline(repo, base.supportBranch);
      const blSv = parseSemVer(bl.props || bl.manifest || '');
      const baseline = {
        props: bl.props, manifest: bl.manifest,
        predictedNext: blSv ? tagOf(blSv, blSv.patch + 1) : null,
        mismatch: !!(bl.props && bl.manifest && bl.props !== bl.manifest),
        collision: !!(blSv && highest != null && blSv.patch + 1 <= highest), // incrementPatch would hit an existing tag
      };
      bundleResults.push({ ...base, verdict: applied ? 'already-applied' : 'ready', codeApply, baseline, note: applied ? 'fix commit already on the support branch' : undefined });
    } catch (e: any) {
      bundleResults.push({ ...base, verdict: 'error', note: e.message });
    }
  }

  // ── output ──
  const baselineIssues = bundleResults.filter((b) => b.baseline && (b.baseline.mismatch || b.baseline.collision));
  // Fix-shape hard signals (developer checklist): a multi-module fix (pt.1) or a dependency-version
  // bump (pt.3) is a STOP → analyze + involve a developer, never force it through a hotfix.
  const fixShapeBlocked = !!fixShape && (fixShape.multiModule || fixShape.dependencyBumps.length > 0);
  const blocked = !prGate.merged || !releaseGate.released || baselineIssues.length > 0 || fixShapeBlocked || bundleResults.some((b) => b.verdict === 'no-support-branch' || b.verdict === 'not-in-bundle' || b.verdict === 'error');

  if (asJson) {
    console.log(JSON.stringify({ task, repo, fixSha, prGate, releaseGate, fixShape, bundles: bundleResults, checkedAt: new Date().toISOString() }, null, 2));
    throw new Exit(blocked ? 1 : 0);
  }

  console.log(`\nHotfix precheck — ${task}`);
  console.log(`Repo:    ${repo}`);
  if (mergedPr) console.log(`PR:      #${mergedPr.number} "${mergedPr.title}" → ${mergedPr.merged ? `MERGED (base ${mergedPr.baseRef})` : 'NOT MERGED'}  ${mergedPr.url}`);
  else console.log(`PR:      none found for ${task} in ${repo}`);
  console.log(`Fix sha: ${fixSha ?? '—'}`);

  // Gate 1: merged
  if (!prGate.merged) {
    console.log(`\n⛔ BLOCKED — the PR for ${task} is not merged yet.`);
    console.log(`   → Merge it first, then re-run. (A hotfix cherry-picks the merged fix commit.)`);
    throw new Exit(1);
  }
  // Gate 2: released
  if (!releaseGate.released) {
    console.log(`\n⛔ BLOCKED — the fix is merged but NOT yet shipped in a release of ${repo}.`);
    console.log(`   → Run the normal "Release" workflow on ${mergedPr?.baseRef ?? 'the base branch'} first, then re-run.`);
    throw new Exit(1);
  }
  console.log(`Shipped: ${releaseGate.tag} (${releaseGate.url})`);

  // Gates-only mode: PR + merged + released confirmed — now ASK which bundles are the latest stable.
  if (!bundleNames.length) {
    console.log(`\n✓ Gates passed — the fix is merged and shipped in a release.`);
    console.log(`Next: which release bundles are currently the latest stable? Re-run with --bundles=<vN,...>.`);
    throw new Exit(0);
  }

  // Per-bundle table. "Hotfix possible?" is the explicit physical-possibility check: a hotfix can
  // only be cut if the support/X.Y branch exists AND the pinned tag is real on that line.
  const pad = (s: string, n: number) => s.padEnd(n);
  const possibleOf = (v: Verdict): string =>
    v === 'ready' || v === 'already-applied' ? '✓ yes' :
    v === 'no-support-branch' ? '✗ no' :
    v === 'not-in-bundle' ? '— n/a' : '? ';
  const nameW = Math.max(...bundleResults.map((b) => b.bundle.length), 6);
  const W = nameW + 2 + 12 + 2 + 16 + 2 + 10 + 2 + 10 + 2 + 9 + 2 + 24;
  console.log(`\n${pad('Bundle', nameW)}  ${pad('Pinned', 12)}  ${pad('Support branch', 16)}  ${pad('Latest', 10)}  ${pad('Next', 10)}  ${pad('Possible?', 9)}  Verdict`);
  console.log('─'.repeat(W));
  for (const b of bundleResults) {
    const badge =
      b.verdict === 'ready' ? `✓ READY → cherry-pick → ${b.nextHotfix}` :
      b.verdict === 'already-applied' ? '◯ already applied' :
      b.verdict === 'no-support-branch' ? `✗ no ${b.supportBranch} (not physically possible)` :
      b.verdict === 'not-in-bundle' ? '— not in bundle' :
      `⚠ ${b.note ?? b.verdict}`;
    console.log(`${pad(b.bundle, nameW)}  ${pad(b.pinned ?? '—', 12)}  ${pad(b.supportBranchExists ? b.supportBranch : (b.supportBranch || '—'), 16)}  ${pad(b.highestOnLine ?? '—', 10)}  ${pad(b.nextHotfix ?? '—', 10)}  ${pad(possibleOf(b.verdict), 9)}  ${badge}`);
  }
  console.log('─'.repeat(W));

  // Fix-shape check — the developer's pre-hotfix checklist (pts 1–3), from the fix commit's own diff.
  if (fixShape) {
    console.log(`\nFix-shape check (developer checklist — before any hotfix):`);
    console.log(`  1. single module      : ${fixShape.multiModule
      ? `⚠ fix spans ${fixShape.modules.length} modules (${fixShape.modules.join(', ')}) → STOP, hand off to a developer`
      : `✓ one module${fixShape.modules.length ? ` (${fixShape.modules[0]})` : ' (no src/ project files touched)'}`}`);
    console.log(`  2. no breaking change : ${fixShape.contractFiles.length
      ? `⚠ touches contract-bearing files — a developer MUST confirm no breaking change:\n       ${fixShape.contractFiles.slice(0, 8).join('\n       ')}${fixShape.contractFiles.length > 8 ? `\n       (+${fixShape.contractFiles.length - 8} more)` : ''}`
      : `✓ no obvious API/DTO/manifest contract file touched (heuristic)`}`);
    console.log(`  3. no dep-version bump: ${fixShape.dependencyBumps.length
      ? `⚠ raises a VirtoCommerce dependency pin → STOP, hand off:\n       ${fixShape.dependencyBumps.join('\n       ')}`
      : `✓ no VirtoCommerce.* dependency version changed (manifest/.csproj/props)`}`);
    console.log(`  4. cherry-pick clean  : ↓ definitive at the write step (git cherry-pick)`);
    console.log(`  5. vc-build compress  : ↓ enforced by the "Release hotfix" workflow (build + test job); hotfix:release --poll fails red`);
    console.log(`  6. regression env     : ↓ after the release, on the regression environment`);
    if (fixShapeBlocked) console.log(`  ⛔ A fix-shape signal fired — if something looks like it could break, STOP: analyze and involve a developer before hotfixing.`);
  }

  // Code-level applicability (the "по коду" check): touched files present on each support branch.
  const withCode = bundleResults.filter((b) => b.codeApply);
  if (withCode.length) {
    console.log(`\nCode check — files the fix touches, present on the support branch (clean cherry-pick likely):`);
    for (const b of withCode) {
      const c = b.codeApply!;
      if (c.missing.length === 0) console.log(`  ${b.bundle}: ✓ ${c.checked}/${c.checked} touched files present on ${b.supportBranch}`);
      else console.log(`  ${b.bundle}: ⚠ ${c.missing.length}/${c.checked} missing on ${b.supportBranch} → cherry-pick will likely CONFLICT: ${c.missing.slice(0, 6).join(', ')}${c.missing.length > 6 ? ` (+${c.missing.length - 6})` : ''}`);
    }
    console.log(`  (definitive conflict check = the actual cherry-pick at the write step)`);
  }

  // Version baseline — what the Release-hotfix workflow will ACTUALLY publish (branch props/manifest + 1).
  const withBaseline = bundleResults.filter((b) => b.baseline);
  if (withBaseline.length) {
    console.log(`\nVersion baseline (what "Release hotfix" will publish = branch props/manifest + 1):`);
    for (const b of withBaseline) {
      const bl = b.baseline!;
      if (bl.mismatch) console.log(`  ${b.bundle}: ⚠ props≠manifest (${bl.props} vs ${bl.manifest}) — "Get Artifact Version" will FAIL; sync both on ${b.supportBranch} before releasing`);
      else if (bl.collision) console.log(`  ${b.bundle}: ⚠ baseline ${bl.props} lags the line (latest tag ${b.highestOnLine}) — incrementPatch → ${bl.predictedNext} ALREADY EXISTS (422); bump baseline to ${b.highestOnLine} on ${b.supportBranch} first`);
      else console.log(`  ${b.bundle}: ✓ props=manifest=${bl.props} → will publish ${bl.predictedNext}`);
    }
  }

  // Plan for ready bundles — suppressed while a fix-shape signal is unresolved (STOP + hand off first).
  const ready = fixShapeBlocked ? [] : bundleResults.filter((b) => b.verdict === 'ready');
  if (fixShapeBlocked && bundleResults.some((b) => b.verdict === 'ready')) {
    console.log(`\n⛔ Bundles are branch-ready, but the fix-shape check flagged a risk (multi-module or dependency bump).`);
    console.log(`   Do NOT hotfix yet — analyze and involve a developer. Override only with a human decision.`);
  }
  if (ready.length) {
    console.log(`\nNext steps (confirm before each write — the /qa-hotfix orchestrator runs these):`);
    for (const b of ready) {
      console.log(`\n  • ${b.bundle} — line ${b.line} → ${b.nextHotfix}`);
      console.log(`      1. git fetch && git checkout ${b.supportBranch}`);
      console.log(`      2. git cherry-pick ${fixSha}`);
      console.log(`      3. (resolve conflicts if any) → git push origin ${b.supportBranch}`);
      console.log(`      4. npm run hotfix:release -- --repo=${repo} --branch=${b.supportBranch} --expect-commit=${fixSha} --poll`);
    }
  }
  const noBranch = bundleResults.filter((b) => b.verdict === 'no-support-branch');
  if (noBranch.length && fixShapeBlocked) {
    console.log(`\n⛔ ${noBranch.map((b) => b.bundle).join(', ')} need${noBranch.length === 1 ? 's' : ''} a support branch, but the fix-shape check flagged a risk above.`);
    console.log(`   Resolve the fix-shape signal FIRST — don't create a support branch for a fix that isn't safe to hotfix yet.`);
  } else if (noBranch.length) {
    console.log(`\n⚠ No support branch yet for: ${noBranch.map((b) => `${b.bundle} (need ${b.supportBranch}, base ${b.pinned})`).join(', ')}`);
    console.log(`   Create it first (gated write step 0): branch ${noBranch[0].supportBranch} from the line's base tag`);
    console.log(`   (highest released X.Y.* tag, else the bundle-pinned tag), confirm the base, push, then re-run this precheck.`);
  }

  throw new Exit(blocked ? 1 : 0);
}

main().catch((e) => {
  if (e instanceof Exit) { process.exitCode = e.code; return; }
  console.error(`[hotfix-precheck] fatal: ${e.message}`);
  process.exitCode = 2;
});
