/**
 * deploy-pr-artifact.ts
 *
 * Gather ALL the fresh CI pre-release artifacts a change produced (across several
 * vc-module-* repos + vc-platform + vc-frontend) and pin them TOGETHER, in ONE manifest
 * update, onto a test environment's vc-deploy-dev branch — so `/qa-test PR #N` and
 * `/qa-verify-fix VCST-XXXX` have the change actually live before they test/verify.
 *
 * A real change is rarely one PR: a feature/fix spans a module + its xAPI + the storefront.
 * Each PR's CI publishes a per-PR pre-release artifact to the vc3prerelease blob
 * (`{Id}_{Version}.zip` for backend, `vc-theme-*.zip` for the storefront). This script
 * resolves every one of them and repins them all at once:
 *   • backend module  → the AzureBlob source of backend/packages.json as {Id,Version,BlobName}
 *                        (removed from GithubReleases so there is no duplicate Id)
 *   • platform        → PlatformVersion + PlatformImageTag
 *   • storefront theme→ the artifact URL inside theme/artifact.json
 *
 * INPUT — the artifact set is the UNION of:
 *   • a tracker ticket's linked PRs across ALL repos, and
 *   • explicit --pr / --module / --platform / --theme flags.
 * Each PR yields its LATEST vc3prerelease build (last Artifact URL in the PR body wins).
 * The explicit --pr/--module path is tracker-agnostic. Ticket-key auto-resolution uses the
 * configured tracker's dev links — Jira today (dev-status API + a PR-URL regex over the issue,
 * via JIRA_EMAIL/JIRA_API_TOKEN); on Azure Boards (or no GitHub dev-links) pass PRs via --pr.
 *
 * DELIVERY — the deploy repo (vc-deploy-dev) is write-restricted (see
 * `reference_deploy_module_pr_to_vcst_qa`): a normal contributor token 403s on a direct push,
 * and PR-merge is denied by the harness anyway. So this script never deploys autonomously:
 *   • DRY-RUN (default): print the resolved artifact table + the combined packages.json /
 *     artifact.json diff + the GitHub web-edit URL(s). Writes NOTHING.
 *   • --apply (gated): commit the combined change to a branch on the TOKEN OWNER'S FORK of
 *     vc-deploy-dev and print the one-click "open PR" compare URL into the env branch (and try
 *     to open the cross-fork PR directly if the token can). On any 403/422 it degrades to the
 *     dry-run diff + web-edit URL. A HUMAN reviews + merges to deploy; NEVER auto-merges.
 *   • --verify: read the env-branch manifest (is each target pinned there?) + the live
 *     /api/platform/modules (is it running yet?) and emit a per-target
 *     PINNED/LIVE/ADVISORY/MISSING table. Pre-release artifacts are often NOT version-bumped
 *     in module.manifest (the -pr suffix lives only in the filename), so a live-version
 *     mismatch is an ADVISORY, not a failure — confirm by behaviour + a cleared browser cache
 *     (`feedback_mcp_browser_cache`).
 *
 * ENV-AWARE: the branch + BACK_URL come from TEST_ENV / .env.<env> — vcst→vcst-qa, else the
 * branch matching the env (never hardcode vcst-qa). --env <name> targets any environment.
 *
 * Usage:
 *   npx tsx scripts/deploy/deploy-pr-artifact.ts <ticket-key> [options]
 *
 * Options:
 *   --env=<name>               Target env (default: resolved TEST_ENV). Picks the vc-deploy-dev branch + BACK_URL.
 *   --pr=<owner/repo#N|url>     Add a PR's latest artifact to the set (repeatable).
 *   --module=<Id=Version>       Add an explicit backend module pin (repeatable). Version = the -pr blob version.
 *   --platform=<Version>        Add an explicit Platform pin.
 *   --theme=<url|version>       Add an explicit storefront theme artifact (a full vc3prerelease URL, or a version).
 *   --apply                     Gated write: commit the bundle to the fork + open/print the cross-fork PR. Omit = dry-run.
 *   --dry-run                   Explicit no-op form of the default (wins over --apply if both given).
 *   --verify                    Report per-target deploy state (env-branch pin + live module version). Read-only.
 *   --fork-owner=<login>        Fork account to push --apply to (default: the token owner from `gh api user`).
 *   --message=<text>            Commit / PR title (default "VCST-XXXX: deploy N artifacts to <env>").
 *   --password=<pw>             Admin password for the /api/platform/modules verify (else env / Password1).
 *   --json                      Machine-readable output.
 *
 * Exit codes:
 *   0  clean dry-run plan / apply hand-off prepared / verify all-green
 *   1  a gate blocked (no artifacts resolved, a PR has no build yet, verify found a target NOT deployed)
 *   2  tool error: bad args, missing token, GitHub/JIRA auth or rate-limit
 *
 * Auth: GIT_TOKEN (a PAT; read/PR on the product repos + push on YOUR fork of vc-deploy-dev),
 * from .env.local / .env.defaults. Ticket-key resolution needs the tracker's creds
 * (Jira: JIRA_EMAIL + JIRA_API_TOKEN). The --verify live check needs the env's admin credentials.
 */

import { existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OWNER = 'VirtoCommerce';
const DEPLOY_REPO_DEFAULT = 'VirtoCommerce/vc-deploy-dev';
const PACKAGES_PATH_DEFAULT = 'backend/packages.json';
const THEME_PATH_DEFAULT = 'theme/artifact.json';
const POLL = 15_000;
const JIRA_BASE = (process.env.JIRA_BASE_URL || 'https://virtocommerce.atlassian.net').replace(/\/$/, '');
// vcst is the default QA env; its vc-deploy-dev branch is vcst-qa (its .env carries no DEPLOY_* block).
// Every other env's branch equals the env name (underscores → hyphens) unless .env.<env> overrides it.
const BRANCH_MAP: Record<string, string> = { vcst: 'vcst-qa' };
const ARTIFACT_RE = /https?:\/\/vc3prerelease\.blob\.core\.windows\.net\/[^\s)"'<>]+?\.zip/gi;
const PR_URL_RE = /github\.com\/(VirtoCommerce)\/([A-Za-z0-9._-]+)\/pull\/(\d+)/gi;
const THEME_URL_RE = /https?:\/\/[^\s"'<>]*vc-theme[^\s"'<>]*\.zip/i;

// ── types ──────────────────────────────────────────────────────────────────────
type Kind = 'module' | 'platform' | 'theme';
interface Target {
  kind: Kind;
  id?: string;             // module Id (backend) or repo pseudo
  version?: string;        // module / platform version
  blobName?: string;       // backend module blob file name
  themeUrl?: string;       // full storefront theme artifact URL
  source: string;          // "PR owner/repo#N" | "--module" | "--platform" | "--theme"
}
interface EnvCoords {
  env: string; deployOwner: string; deployRepo: string; branch: string;
  packagesPath: string; themePath: string; backUrl: string; admin: string; password: string;
}
interface ManifestFile { text: string; sha: string; json: any; }

// ── env / token ──────────────────────────────────────────────────────────────
function loadEnvFiles(testEnv: string): void {
  for (const f of ['.env.defaults', `.env.${testEnv}`, '.env.local']) {
    const p = resolve(REPO_ROOT, f);
    if (existsSync(p)) { const vars = parseDotenv(readFileSync(p)); for (const [k, v] of Object.entries(vars)) if (process.env[k] === undefined) process.env[k] = v; }
  }
}
function readEnvFile(path: string): Record<string, string> {
  return existsSync(path) ? parseDotenv(readFileSync(path)) : {};
}
let TOKEN: string | undefined;
function ghHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'vc-deploy-pr', ...(TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {}), ...extra };
}

/** Resolve deploy + connection coords for an env. `.env.<env>` DEPLOY_* wins; else convention. */
function resolveEnvCoords(env: string, passwordOverride?: string): EnvCoords {
  // stable / regression live in .env.vcptcore_<key>; everything else in .env.<env>.
  const vcpt = /^vcptcore[_-](stable|regression)$/i.exec(env);
  const primary = vcpt ? resolve(REPO_ROOT, `.env.vcptcore_${vcpt[1].toLowerCase()}`) : resolve(REPO_ROOT, `.env.${env}`);
  const e = readEnvFile(primary);
  const local = readEnvFile(resolve(REPO_ROOT, '.env.local'));
  const repoSpec = e.DEPLOY_REPO || DEPLOY_REPO_DEFAULT;
  const [deployOwner, deployRepo] = repoSpec.includes('/') ? repoSpec.split('/') : [OWNER, repoSpec];
  const branch = e.DEPLOY_BRANCH || BRANCH_MAP[env] || env.replace(/_/g, '-');
  const suffix = env.replace(/^vcptcore[_-]?/, '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  const password = passwordOverride
    || local[`ADMIN_PASSWORD_VCPTCORE_${suffix}`] || local[`ADMIN_PASSWORD_${suffix}`]
    || local.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD || 'Password1';
  return {
    env, deployOwner, deployRepo, branch,
    packagesPath: e.DEPLOY_PACKAGES_PATH || PACKAGES_PATH_DEFAULT,
    themePath: e.DEPLOY_THEME_PATH || THEME_PATH_DEFAULT,
    backUrl: (e.BACK_URL || process.env.BACK_URL || '').replace(/\/$/, ''),
    admin: e.ADMIN || process.env.ADMIN || 'admin', password,
  };
}

// ── GitHub API ───────────────────────────────────────────────────────────────
async function ghJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limited (HTTP ${res.status}). ${TOKEN ? 'Wait for reset.' : 'Set GIT_TOKEN in .env.local.'}`);
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
  return res.json();
}

// ── tracker ticket → linked PRs (Jira impl; port of qa-local-env/resolve-task.mjs) ──
// The configured tracker's dev-link lookup. Jira today; Azure Boards users pass --pr explicitly.
function jiraAuth(): string | null {
  const email = process.env.JIRA_EMAIL, token = process.env.JIRA_API_TOKEN;
  if (!email || !token) return null;
  return 'Basic ' + Buffer.from(`${email}:${token}`).toString('base64');
}
async function jiraGet(path: string): Promise<any> {
  const auth = jiraAuth();
  if (!auth) throw new Error('Tracker creds missing — set JIRA_EMAIL + JIRA_API_TOKEN in .env.local (same account), or pass the PRs via --pr (works with any tracker, incl. Azure Boards).');
  const res = await fetch(`${JIRA_BASE}${path}`, { headers: { Authorization: auth, Accept: 'application/json', 'User-Agent': 'vc-deploy-pr' } });
  if (!res.ok) throw new Error(`JIRA ${path} → ${res.status} ${res.statusText}`);
  return res.json();
}
interface PrRef { owner: string; repo: string; number: number; source: string; }
async function prsFromJira(key: string): Promise<{ summary: string | null; prs: PrRef[] }> {
  const issue = await jiraGet(`/rest/api/3/issue/${encodeURIComponent(key)}?fields=summary,description,comment`);
  const found = new Map<string, PrRef>();
  const add = (owner: string, repo: string, number: number, source: string) => {
    const id = `${owner}/${repo}#${number}`;
    if (!found.has(id)) found.set(id, { owner, repo, number: Number(number), source });
  };
  try {
    const ds = await jiraGet(`/rest/dev-status/latest/issue/detail?issueId=${issue.id}&applicationType=GitHub&dataType=pullrequest`);
    for (const d of ds.detail || []) for (const pr of d.pullRequests || []) {
      PR_URL_RE.lastIndex = 0; const m = PR_URL_RE.exec(pr.url || '');
      if (m) add(m[1], m[2], +m[3], 'dev-status');
    }
  } catch { /* dev-status may be unavailable — fall back to the text scan */ }
  const blob = JSON.stringify(issue);
  PR_URL_RE.lastIndex = 0; let m: RegExpExecArray | null;
  while ((m = PR_URL_RE.exec(blob)) !== null) add(m[1], m[2], +m[3], 'text');
  return { summary: issue.fields?.summary ?? null, prs: [...found.values()] };
}
/** Resolve a single PR's LATEST vc3prerelease artifact → a Target (or a reason it has none). */
async function artifactFromPr(ref: PrRef): Promise<{ target?: Target; state?: string; note: string }> {
  const pr = await ghJson(`https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
  if (!pr) return { note: `${ref.owner}/${ref.repo}#${ref.number}: not found` };
  const urls = (pr.body || '').match(ARTIFACT_RE) || [];
  const src = `PR ${ref.owner}/${ref.repo}#${ref.number}`;
  if (urls.length === 0) return { state: pr.state, note: `${src} [${pr.state}]: no vc3prerelease Artifact URL yet (CI still running?)` };
  const url = urls[urls.length - 1]; // last wins (bodies sometimes list older→newer)
  const file = decodeURIComponent(url.split('/').pop() || '');
  if (ref.repo.toLowerCase() === 'vc-frontend' || /^vc-theme/i.test(file)) {
    return { target: { kind: 'theme', themeUrl: url, source: src }, state: pr.state, note: `${src} [${pr.state}] → theme ${file}` };
  }
  const fm = file.replace(/\.zip$/i, '').match(/^(VirtoCommerce\.[A-Za-z0-9.]+)_(\d.*)$/);
  if (fm) {
    if (fm[1] === 'VirtoCommerce.Platform') return { target: { kind: 'platform', version: fm[2], source: src }, state: pr.state, note: `${src} [${pr.state}] → Platform ${fm[2]}` };
    return { target: { kind: 'module', id: fm[1], version: fm[2], blobName: file, source: src }, state: pr.state, note: `${src} [${pr.state}] → ${fm[1]}=${fm[2]}` };
  }
  // vc-platform repo build whose file isn't the VirtoCommerce.Platform pattern.
  if (ref.repo.toLowerCase() === 'vc-platform') {
    const pv = file.replace(/\.zip$/i, '').match(/_(\d.*)$/);
    if (pv) return { target: { kind: 'platform', version: pv[1], source: src }, state: pr.state, note: `${src} [${pr.state}] → Platform ${pv[1]}` };
  }
  return { state: pr.state, note: `${src} [${pr.state}]: artifact not recognised (${file})` };
}

export function parsePrRef(ref: string): PrRef | null {
  const url = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(ref);
  if (url) return { owner: url[1], repo: url[2], number: +url[3], source: '--pr' };
  const short = /^(?:([^/\s]+)\/)?([a-z0-9._-]+)#(\d+)$/i.exec(ref);
  return short ? { owner: short[1] || OWNER, repo: short[2], number: +short[3], source: '--pr' } : null;
}

// ── manifest read / mutate ──────────────────────────────────────────────────────
async function fetchFile(c: EnvCoords, path: string): Promise<ManifestFile> {
  const j = await ghJson(`https://api.github.com/repos/${c.deployOwner}/${c.deployRepo}/contents/${path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(c.branch)}`);
  if (!j?.content) throw new Error(`Could not read ${c.deployOwner}/${c.deployRepo}/${path}@${c.branch}`);
  const text = Buffer.from(j.content, 'base64').toString('utf8');
  return { text, sha: j.sha, json: JSON.parse(text) };
}
/** Current pin of a module Id: its version + which source it sits in (blob vs GithubReleases).
 *  Recognises BOTH {Id,Version} entries AND BlobName-only AzureBlob entries ("<Id>_<version>.zip",
 *  which carry no Id field — the shape vc-deploy-dev uses for prerelease pins). */
export function pinnedModule(json: any, id: string): { version: string; source: string; blobName?: string } | null {
  for (const s of json.Sources ?? []) for (const m of s?.Modules ?? []) {
    if (m?.Id === id) return { version: String(m.Version), source: String(s.Name ?? ''), blobName: m.BlobName };
    if (typeof m?.BlobName === 'string') { const bm = m.BlobName.match(/^(.+)_(\d.*)\.zip$/i); if (bm && bm[1] === id) return { version: bm[2], source: String(s.Name ?? 'AzureBlob'), blobName: m.BlobName }; }
  }
  return null;
}
/** Pin a module as a pre-release AzureBlob item (and drop it from GithubReleases). Mutates `json`. */
export function applyModule(json: any, id: string, version: string, blobName: string): void {
  json.Sources ||= [];
  const gh = json.Sources.find((s: any) => /github/i.test(s?.Name || '')) || json.Sources.find((s: any) => Array.isArray(s?.Modules) && s.ModuleSources);
  let blob = json.Sources.find((s: any) => s?.Name === 'AzureBlob' || (s?.ServiceUri || '').includes('vc3prerelease'));
  if (!blob) { blob = { Name: 'AzureBlob', Container: 'packages', ServiceUri: 'https://vc3prerelease.blob.core.windows.net', Modules: [] }; json.Sources.push(blob); }
  blob.Modules ||= [];
  if (gh?.Modules) gh.Modules = gh.Modules.filter((m: any) => m.Id !== id);
  const existing = blob.Modules.find((m: any) => m.Id === id);
  if (existing) { existing.Version = version; existing.BlobName = blobName; }
  else blob.Modules.push({ Id: id, Version: version, BlobName: blobName });
}
export function applyPlatform(json: any, version: string): void {
  json.PlatformVersion = version;
  if (json.PlatformImageTag !== undefined) json.PlatformImageTag = version;
}
function serialize(json: any): string { return JSON.stringify(json, null, 2) + '\n'; }
/** Lines added + removed (multiset symmetric difference) — handles insertions/deletions, so a
 *  minimal surgical edit reports a small number and a full reserialize reports a large one. */
export function countChangedLines(before: string, after: string): number {
  const bag = (t: string) => { const m = new Map<string, number>(); for (const l of t.split('\n')) m.set(l, (m.get(l) || 0) + 1); return m; };
  const a = bag(before), b = bag(after);
  let diff = 0;
  for (const k of new Set([...a.keys(), ...b.keys()])) diff += Math.abs((a.get(k) || 0) - (b.get(k) || 0));
  return diff;
}

const enc = (p: string) => p.split('/').map(encodeURIComponent).join('/');

// ── minimal text-surgery (preserve the manifest's formatting; fall back to reserialize) ─────────
// vc-deploy-dev's packages.json MAY use an irregular indent JSON.stringify can't reproduce, in which
// case mutating the parsed object + reserializing rewrites the whole file. These edit the RAW text so
// the deploy PR shows a clean 2-hunk diff (like a vc-ci "<TICKET>-vcst-qa-deployment" PR). Note most
// env branches now round-trip through JSON.stringify(…, 2) exactly, where the reserialize path is
// equally minimal and this surgery only wins 0-2 lines — it is belt-and-braces plus "never reformat
// DevOps's file", NOT a large win. Don't grow this layer further on diff-size grounds alone.
// Each returns null on an unexpected OR ambiguous shape → editPackagesText falls back to reserialize;
// guessing is never correct here, because a wrong-but-valid manifest deploys the wrong build.
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Literal (no `$` expansion) replacement of the first `re` match — `String.replace` treats `$&`,
 *  `` $` ``, `$'`, `$n` in a replacement STRING as references, and these values come from a
 *  PR-body URL via decodeURIComponent, so a `$` in a filename would splice manifest text in. */
const subLiteral = (s: string, re: RegExp, to: string) => s.replace(re, () => to);
/** A line's leading whitespace, tabs included — a spaces-only pattern measures a tab file as 0. */
const indentOf = (l: string) => (l.match(/^[ \t]*/) as RegExpMatchArray)[0];
/** Line range [openBrace, closeBrace] of the Sources[] object whose body matches `marker`. */
function sourceBlockRange(lines: string[], marker: RegExp): [number, number] | null {
  const at = lines.findIndex((l) => marker.test(l));
  if (at < 0) return null;
  let open = -1;                                                 // that object's own opening brace
  for (let i = at; i >= 0; i--) if (/^\s*\{\s*$/.test(lines[i])) { open = i; break; }
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < lines.length; i++) {
    // Depth counts structural braces only — blank the string literals first so a `{`/`[` inside a
    // value (URL, BlobName) can't skew the range.
    for (const ch of lines[i].replace(/"(?:\\.|[^"\\])*"/g, '""')) {
      if (ch === '{' || ch === '[') depth++; else if (ch === '}' || ch === ']') depth--;
    }
    if (i > open && depth <= 0) return at <= i ? [open, i] : null; // range must contain the marker
  }
  return null;
}
/** Split into `\r`-free lines + the EOL to rejoin with. Constructed lines must carry the file's own
 *  EOL, else a CRLF manifest gets LF-only inserts (mixed endings + phantom diff on touched lines). */
const splitLines = (text: string) => ({ lines: text.split(/\r?\n/), eol: text.includes('\r\n') ? '\r\n' : '\n' });
/** Remove a GithubReleases {Id,Version} object (+ its adjacent comma). Unchanged text if the id
 *  isn't in GithubReleases; null if it's there but not in the canonical 4-line shape. */
export function removeGhReleaseEntry(text: string, id: string): string | null {
  const { lines, eol } = splitLines(text);
  const idRe = new RegExp(`"Id"\\s*:\\s*"${escRe(id)}"`);
  // Scope the search to the GithubReleases source when it's locatable: an AzureBlob prerelease entry
  // may ALSO carry an "Id" (the {Id,Version,BlobName} shape a reserialize writes), and matching THAT
  // one would fail the 4-line shape check and force a needless whole-file reserialize.
  const gh = sourceBlockRange(lines, /"Name"\s*:\s*"[^"]*github[^"]*"/i)
          ?? sourceBlockRange(lines, /"ModuleSources"\s*:/);      // same shapes applyModule() accepts
  let idLine = -1;
  for (let i = gh ? gh[0] : 0, end = gh ? gh[1] : lines.length - 1; i <= end; i++) if (idRe.test(lines[i])) { idLine = i; break; }
  if (idLine < 0) return text;                                   // not in GithubReleases — nothing to remove
  const open = idLine - 1, close = idLine + 2;                   // { · Id · Version · }
  if (open < 0 || close >= lines.length) return null;
  if (!/^\s*\{\s*$/.test(lines[open]) || !/^\s*\},?\s*$/.test(lines[close])) return null;
  const closeHasComma = /\},[ \t]*$/.test(lines[close]);
  lines.splice(open, close - open + 1);
  if (!closeHasComma) {                                          // was the last entry → drop the previous entry's trailing comma
    for (let i = open - 1; i >= 0; i--) { if (/\S/.test(lines[i])) { if (/\},?[ \t]*$/.test(lines[i])) lines[i] = lines[i].replace(/,([ \t]*)$/, '$1'); break; } }
  }
  return lines.join(eol);
}
/** The file's indent step, as the literal whitespace string (so a tab-indented manifest gets tabs).
 *  Read off the first indented line rather than the enclosing block's own indent, which can be
 *  irregular — vcst-qa indented the AzureBlob block's children at the SAME column as its opening
 *  brace, so a parent-delta would yield an empty step. Two spaces if the file has no indent at all. */
const detectIndentUnit = (lines: string[]) =>
  lines.find((l) => /^[ \t]+\S/.test(l))?.match(/^[ \t]+/)![0] ?? '  ';
/** Seed the first entry into an EMPTY AzureBlob `"Modules": []` — the state of a branch that has
 *  never carried a prerelease pin (vcptcore-stable and -regression are both here today), where there
 *  is no `"BlobName"` line to anchor on. Returns null if the AzureBlob source, or its empty Modules
 *  array, can't be located. Mutates `lines`. */
function insertFirstBlobEntry(lines: string[], blobName: string, eol: string): string | null {
  const range = sourceBlockRange(lines, /"Name"\s*:\s*"AzureBlob"|"ServiceUri"\s*:\s*"[^"]*vc3prerelease/);
  if (!range) return null;                                         // no AzureBlob source at all
  const [open, close] = range;
  let modAt = -1;                                                  // that source's own "Modules" key
  for (let i = open + 1; i < close; i++) if (/"Modules"\s*:/.test(lines[i])) { modAt = i; break; }
  if (modAt < 0) return null;
  const mod = indentOf(lines[modAt]), unit = detectIndentUnit(lines);
  const entry = [`${mod}${unit}{`, `${mod}${unit}${unit}"BlobName": "${blobName}"`, `${mod}${unit}}`];
  const inline = /^([ \t]*"Modules"\s*:\s*)\[[ \t]*\][ \t]*(,?)[ \t]*\r?$/.exec(lines[modAt]);
  if (inline) {                                                    // "Modules": []  (one line)
    lines.splice(modAt, 1, `${inline[1]}[`, ...entry, `${mod}]${inline[2]}`);
    return lines.join(eol);
  }
  if (/"Modules"\s*:\s*\[[ \t]*\r?$/.test(lines[modAt])) {         // "Modules": [ … ] (multi-line)
    for (let i = modAt + 1; i < close; i++) {
      if (!/\S/.test(lines[i])) continue;
      if (!/^[ \t]*\][ \t]*,?[ \t]*\r?$/.test(lines[i])) return null; // array is NOT empty → unexpected
      lines.splice(i, 0, ...entry);
      return lines.join(eol);
    }
  }
  return null;
}
/** Add (or replace) a BlobName-only entry in the AzureBlob source, matching existing indentation.
 *  `id` must own AT MOST one entry and one entry per line — anything ambiguous returns null so the
 *  caller reserializes (whose applyModule matches by `Id`) instead of editing the wrong pin. */
export function upsertBlobEntry(text: string, id: string, blobName: string): string | null {
  const { lines, eol } = splitLines(text);
  const blobRe = new RegExp(`"BlobName"\\s*:\\s*"${escRe(id)}_`, 'i');
  const owns = lines.filter((l) => blobRe.test(l)).length;
  if (owns > 1) return null;                                      // same module pinned twice — don't guess
  const existing = lines.findIndex((l) => blobRe.test(l));
  if (existing >= 0) {
    // One entry per line, else the id-anchored match above and the positional replace below can
    // disagree and rewrite a NEIGHBOUR's BlobName (silently dropping that module's pin).
    if ((lines[existing].match(/"BlobName"\s*:/g) || []).length > 1) return null;
    lines[existing] = subLiteral(lines[existing], /"BlobName"\s*:\s*"[^"]*"/, `"BlobName": "${blobName}"`);
    // Refresh this entry's "Version" if it has one: pinnedModule() prefers an explicit Version over
    // the BlobName-derived one, so leaving it stale would make the table / --verify report a version
    // the pin no longer points at. (Entries written by a reserialize carry Id+Version+BlobName.)
    const ver = blobName.match(/^.+_(\d.*)\.zip$/i)?.[1];
    const setVer = (l: string) => l.replace(/("Version"\s*:\s*")[^"]*(")/, (_m, a, b) => a + ver + b);
    if (/"Version"\s*:/.test(lines[existing])) {                  // single-line entry: Version sits here
      if (!ver) return null;
      lines[existing] = setVer(lines[existing]);
    } else {
      // Multi-line entry: bound the search to THIS entry's own field lines — contiguous, at the same
      // indent as the BlobName line, stopping at any brace/bracket. So an outer key (e.g. a
      // source-level "Version") can never be rewritten, and order within the entry doesn't matter.
      const sibling = (i: number) => !/^[ \t]*[{}[\]]/.test(lines[i]) && indentOf(lines[i]) === indentOf(lines[existing]);
      let lo = existing, hi = existing;
      while (lo - 1 >= 0 && sibling(lo - 1)) lo--;
      while (hi + 1 < lines.length && sibling(hi + 1)) hi++;
      for (let i = lo; i <= hi; i++) {
        if (!/"Version"\s*:/.test(lines[i])) continue;
        if (!ver) return null;                                    // can't derive a version → reserialize
        lines[i] = setVer(lines[i]);
        break;
      }
    }
    return lines.join(eol);
  }
  const sample = lines.findIndex((l) => /"BlobName"\s*:/.test(l));
  if (sample < 1) return insertFirstBlobEntry(lines, blobName, eol); // empty AzureBlob — no sibling to mirror
  const blobIndent = indentOf(lines[sample]);
  const braceIndent = indentOf(lines[sample - 1]);
  let lastClose = -1;
  for (let i = 0; i < lines.length - 1; i++) if (/"BlobName"\s*:/.test(lines[i]) && /^\s*\}/.test(lines[i + 1])) lastClose = i + 1;
  if (lastClose < 0) return null;
  lines[lastClose] = lines[lastClose].replace(/^([ \t]*\})[ \t]*,?[ \t]*$/, '$1,');
  lines.splice(lastClose + 1, 0, `${braceIndent}{`, `${blobIndent}"BlobName": "${blobName}"`, `${braceIndent}}`);
  return lines.join(eol);
}
export function bumpPlatformText(text: string, version: string): string | null {
  let hit = 0;
  const out = text.replace(/("PlatformVersion"\s*:\s*")[^"]*(")/, (_m, a, b) => (hit++, a + version + b))
                  .replace(/("PlatformImageTag"\s*:\s*")[^"]*(")/, (_m, a, b) => (hit++, a + version + b));
  return hit > 0 ? out : null;
}
/** Apply all module moves + a platform bump. Prefer minimal surgery; verify (valid JSON + intended
 *  semantic delta) and fall back to a full reserialize if anything is off. */
export function editPackagesText(origText: string, origJson: any, modules: Target[], platformT?: Target): { text: string; minimal: boolean } {
  let text: string | null = origText;
  for (const t of modules) {
    text = removeGhReleaseEntry(text!, t.id!); if (text == null) break;
    text = upsertBlobEntry(text, t.id!, t.blobName!); if (text == null) break;
  }
  if (text != null && platformT) text = bumpPlatformText(text, platformT.version!);
  if (text != null) {
    try {
      const j = JSON.parse(text);
      const gh = j.Sources?.find((s: any) => /github/i.test(s?.Name || ''));
      const blob = j.Sources?.find((s: any) => s?.Name === 'AzureBlob' || (s?.ServiceUri || '').includes('vc3prerelease'));
      let good = true;
      // Assert the intended END STATE, not mere presence. Surgery matches by BlobName prefix while the
      // reserialize fallback matches by `Id`; when the two can disagree (duplicate pin, stale sibling
      // Version, an entry the prefix scan missed) the only safe outcome is the reserialize. pinnedModule
      // is the right oracle because it is exactly what the dry-run table and --verify read.
      for (const t of modules) {
        if (gh?.Modules?.some((m: any) => m.Id === t.id)) good = false;
        const owning = (blob?.Modules ?? []).filter((m: any) =>
          m?.Id === t.id || String(m?.BlobName ?? '').toLowerCase().startsWith(`${String(t.id).toLowerCase()}_`));
        if (owning.length !== 1) good = false;                     // missing, or duplicated (stale one could win)
        const pin = pinnedModule(j, t.id!);
        if (pin?.version !== t.version || pin?.blobName !== t.blobName) good = false;
      }
      if (platformT && (String(j.PlatformVersion) !== platformT.version
        || (j.PlatformImageTag !== undefined && String(j.PlatformImageTag) !== platformT.version))) good = false;
      if (good) return { text, minimal: true };
    } catch { /* fall through */ }
  }
  const clone = JSON.parse(JSON.stringify(origJson));
  for (const t of modules) applyModule(clone, t.id!, t.version!, t.blobName!);
  if (platformT) applyPlatform(clone, platformT.version!);
  return { text: serialize(clone), minimal: false };
}
export function editThemeText(text: string, newUrl: string): { text: string; from: string | null } {
  const m = THEME_URL_RE.exec(text);
  return m ? { text: text.replace(m[0], newUrl), from: m[0] } : { text, from: null };
}

// ── writes via `gh` (keyring classic token — the credential with write on vc-deploy-dev) ─────────
// The ambient fine-grained PAT (TOKEN, used for reads) lacks fork/PR rights on the deploy repo;
// `gh` falls back to the keyring gho_ classic token when GITHUB_TOKEN/GH_TOKEN are unset (the same
// routing the rest of this repo uses for VirtoCommerce writes — see reference_github_token_routing).
const GH_ENV: NodeJS.ProcessEnv = (() => { const e = { ...process.env }; delete e.GITHUB_TOKEN; delete e.GH_TOKEN; return e; })();
function gh(args: string[]): string { return execFileSync('gh', args, { env: GH_ENV, encoding: 'utf8', maxBuffer: 1 << 26 }); }
function ghApi(path: string, extra: string[] = []): any { return JSON.parse(gh(['api', path, ...extra])); }
function ghUser(): string | null { try { return ghApi('user').login ?? null; } catch { return null; } }
/** Actual account permission on a repo: admin|maintain|write|triage|read|none. */
function accountPermission(owner: string, repo: string, me: string): string {
  try { return ghApi(`repos/${owner}/${repo}/collaborators/${encodeURIComponent(me)}/permission`).permission ?? 'none'; } catch { return 'none'; }
}
const canWrite = (p: string) => p === 'admin' || p === 'maintain' || p === 'write';
function refSha(owner: string, repo: string, branch: string): string | null {
  try { return ghApi(`repos/${owner}/${repo}/git/ref/heads/${encodeURIComponent(branch)}`).object?.sha ?? null; } catch { return null; }
}
async function ensureFork(owner: string, repo: string, me: string): Promise<boolean> {
  try { ghApi(`repos/${me}/${repo}`); return true; } catch { /* no fork yet */ }
  try { gh(['repo', 'fork', `${owner}/${repo}`, '--clone=false']); } catch { return false; }
  for (let i = 0; i < 20; i++) { await sleep(3000); try { ghApi(`repos/${me}/${repo}`); return true; } catch { /* keep polling */ } }
  return false;
}
function createRef(owner: string, repo: string, branch: string, sha: string): boolean {
  try { gh(['api', '--method', 'POST', `repos/${owner}/${repo}/git/refs`, '-f', `ref=refs/heads/${branch}`, '-f', `sha=${sha}`]); return true; }
  catch (e: any) { return /already exists|Reference already exists/i.test(String(e.stderr || e.message || e)); }
}
function commitViaGh(owner: string, repo: string, path: string, text: string, branch: string, message: string): boolean {
  let sha: string | null = null;
  try { sha = ghApi(`repos/${owner}/${repo}/contents/${enc(path)}?ref=${encodeURIComponent(branch)}`).sha ?? null; } catch { /* new file */ }
  const args = ['api', '--method', 'PUT', `repos/${owner}/${repo}/contents/${enc(path)}`, '-f', `message=${message}`, '-f', `content=${Buffer.from(text, 'utf8').toString('base64')}`, '-f', `branch=${branch}`];
  if (sha) args.push('-f', `sha=${sha}`);
  try { gh(args); return true; } catch (e: any) { console.error('[deploy-pr] commit failed:', String(e.stderr || e.message || e).slice(0, 240)); return false; }
}
function createPr(owner: string, repo: string, base: string, head: string, title: string, body: string): { ok: boolean; url?: string; note: string } {
  try { const url = gh(['pr', 'create', '--repo', `${owner}/${repo}`, '--base', base, '--head', head, '--title', title, '--body', body]).trim(); return { ok: true, url, note: 'opened' }; }
  catch (e: any) {
    const msg = String(e.stderr || e.message || e);
    if (/already exists/i.test(msg)) { try { const url = gh(['pr', 'list', '--repo', `${owner}/${repo}`, '--head', head.includes(':') ? head.split(':')[1] : head, '--json', 'url', '--jq', '.[0].url']).trim(); if (url) return { ok: true, url, note: 'already open' }; } catch { /* ignore */ } }
    return { ok: false, note: msg.slice(0, 240) };
  }
}

// ── live verify (/api/platform/modules) ─────────────────────────────────────────
async function getAdminToken(c: EnvCoords): Promise<string | null> {
  if (!c.backUrl) return null;
  try {
    const r = await fetch(`${c.backUrl}/connect/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'password', username: c.admin, password: c.password }) });
    if (r.status !== 200) return null;
    return (await r.json())?.access_token ?? null;
  } catch { return null; }
}
async function liveModules(c: EnvCoords, token: string): Promise<Record<string, string> | null> {
  try {
    const r = await fetch(`${c.backUrl}/api/platform/modules`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.status !== 200) return null;
    const mods = await r.json();
    const out: Record<string, string> = {};
    for (const m of Array.isArray(mods) ? mods : []) if (m?.id) out[String(m.id).toLowerCase()] = String(m.version ?? '');
    return out;
  } catch { return null; }
}
async function platformHealthy(c: EnvCoords): Promise<boolean> {
  try { return (await fetch(`${c.backUrl}/health`, { redirect: 'manual' })).status === 200; } catch { return false; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
class Exit { constructor(public code: number) {} }
function fail(msg: string): never { console.error(`[deploy-pr] ${msg}`); throw new Exit(2); }

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const flags = (n: string) => args.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.split('=').slice(1).join('='));
  const has = (n: string) => args.includes(`--${n}`);
  const asJson = has('json');
  const apply = has('apply') && !has('dry-run');
  const verify = has('verify');
  const key = args.find((a) => !a.startsWith('--'))?.toUpperCase();

  loadEnvFiles(process.env.TEST_ENV || 'vcst');
  const env = flag('env') || process.env.TEST_ENV || 'vcst';
  TOKEN = process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!TOKEN) fail('No GIT_TOKEN — a PAT with product-repo read + push on your vc-deploy-dev fork (read .env.local).');
  const c = resolveEnvCoords(env, flag('password'));

  // ── 1. resolve the artifact set ──
  const targets: Target[] = [];
  const resolveNotes: string[] = [];
  let summary: string | null = null;

  if (key) {
    if (!/^[A-Z][A-Z0-9]{1,9}-\d+$/.test(key)) fail(`"${key}" is not a ticket key. Usage: deploy-pr-artifact.ts <ticket-key> [--pr ...] [--module Id=Ver] [--platform Ver] [--theme url]`);
    const r = await prsFromJira(key).catch((e) => fail(e.message));
    summary = r.summary;
    for (const ref of r.prs) { const a = await artifactFromPr(ref); resolveNotes.push(a.note); if (a.target) targets.push(a.target); }
  }
  for (const ref of flags('pr')) {
    const parsed = parsePrRef(ref); if (!parsed) fail(`--pr could not be parsed: "${ref}" (want owner/repo#N or a PR URL).`);
    const a = await artifactFromPr(parsed); resolveNotes.push(a.note); if (a.target) targets.push(a.target);
  }
  for (const raw of flags('module')) {
    const i = raw.indexOf('='); if (i < 0) fail(`--module wants Id=Version, got "${raw}"`);
    const id = raw.slice(0, i).trim(), version = raw.slice(i + 1).trim();
    targets.push({ kind: 'module', id, version, blobName: `${id}_${version}.zip`, source: '--module' });
  }
  const platformFlag = flag('platform');
  if (platformFlag) targets.push({ kind: 'platform', version: platformFlag.trim(), source: '--platform' });
  for (const raw of flags('theme')) {
    const themeUrl = /^https?:\/\//.test(raw) ? raw : `https://vc3prerelease.blob.core.windows.net/packages/vc-theme-b2b-vue-${raw}.zip`;
    targets.push({ kind: 'theme', themeUrl, source: '--theme' });
  }

  // De-dup: latest module Id wins; single platform + single theme (last wins).
  const byModule = new Map<string, Target>();
  let platformT: Target | undefined; let themeT: Target | undefined;
  for (const t of targets) {
    if (t.kind === 'module') byModule.set(t.id!, t);
    else if (t.kind === 'platform') platformT = t;
    else if (t.kind === 'theme') themeT = t;
  }
  const modules = [...byModule.values()];
  const bundle = [...modules, ...(platformT ? [platformT] : []), ...(themeT ? [themeT] : [])];

  if (!asJson) {
    console.log(`\nDeploy PR artifacts → ${env} (${c.deployOwner}/${c.deployRepo}@${c.branch})`);
    if (key) console.log(`Ticket:  ${key}${summary ? ` — ${summary}` : ''}`);
    if (resolveNotes.length) { console.log('Resolved PR artifacts:'); for (const n of resolveNotes) console.log(`  · ${n}`); }
  }
  const noArtifactPr = resolveNotes.some((n) => /no vc3prerelease Artifact URL yet/.test(n));
  if (bundle.length === 0) {
    if (!asJson) console.error('[deploy-pr] No artifacts resolved. Pass --pr / --module / --platform / --theme, or a JIRA key whose PRs have published CI builds.');
    throw new Exit(1);
  }

  // ── 2. read current manifest(s) ──
  const pkg = await fetchFile(c, c.packagesPath).catch((e) => fail(e.message));
  const theme = themeT ? await fetchFile(c, c.themePath).catch((e) => fail(e.message)) : null;

  // ── 3. compute the combined diff + a per-target row (minimal text surgery, fallback to reserialize) ──
  interface Row { target: Target; current: string; proposed: string; }
  const rows: Row[] = [];
  for (const t of modules) { const cur = pinnedModule(pkg.json, t.id!); rows.push({ target: t, current: cur ? `${cur.version} (${cur.source})` : 'absent', proposed: `${t.version} (AzureBlob)` }); }
  if (platformT) rows.push({ target: platformT, current: String(pkg.json.PlatformVersion ?? 'absent'), proposed: platformT.version! });
  const pkgTouched = modules.length > 0 || !!platformT;
  const pkgEdit = pkgTouched ? editPackagesText(pkg.text, pkg.json, modules, platformT) : { text: pkg.text, minimal: true };
  const newPkgText = pkgEdit.text;
  const pkgMinimal = pkgEdit.minimal;
  const pkgChanged = countChangedLines(pkg.text, newPkgText);

  let newThemeText: string | null = null;
  if (themeT && theme) {
    const te = editThemeText(theme.text, themeT.themeUrl!);
    rows.push({ target: themeT, current: te.from ? te.from.split('/').pop()! : 'absent', proposed: themeT.themeUrl!.split('/').pop()! });
    newThemeText = te.text;
    if (!te.from && !asJson) console.error('[deploy-pr] ⚠ theme/artifact.json had no recognisable vc-theme URL to replace — review the diff by hand.');
  }

  const webEditPkg = `https://github.com/${c.deployOwner}/${c.deployRepo}/edit/${c.branch}/${c.packagesPath}`;
  const webEditTheme = `https://github.com/${c.deployOwner}/${c.deployRepo}/edit/${c.branch}/${c.themePath}`;

  if (!asJson) {
    console.log(`\n${'Artifact'.padEnd(42)}  ${'Current'.padEnd(26)}  Proposed`);
    console.log('─'.repeat(104));
    for (const r of rows) {
      const label = r.target.kind === 'module' ? r.target.id! : r.target.kind === 'platform' ? 'Platform' : 'Theme';
      console.log(`${label.padEnd(42)}  ${r.current.padEnd(26)}  ${r.proposed}`);
    }
    console.log('─'.repeat(104));
    if (pkgTouched) console.log(`packages.json: ${pkgChanged} line(s) change${!pkgMinimal ? `  ⚠ could not do a minimal edit (manifest shape unexpected) — fell back to a full reserialize; JSON is semantically identical, review the PR with "Hide whitespace changes" enabled` : ' (minimal)'}`);
    if (noArtifactPr) console.log('⚠ Some linked PRs have NO CI build yet — they are omitted. Re-run once their CI publishes.');
  }

  // ── VERIFY (read-only live/branch state) ──
  if (verify) {
    let token: string | null = null, live: Record<string, string> | null = null;
    if (c.backUrl) { token = await getAdminToken(c); if (token) live = await liveModules(c, token); }
    const vrows: { label: string; pinned: string; liveVer: string; verdict: string }[] = [];
    let anyMissing = false;
    for (const t of modules) {
      const cur = pinnedModule(pkg.json, t.id!);
      const pinned = cur && (cur.blobName === t.blobName || cur.version === t.version) ? 'yes' : 'no';
      const lv = live ? (live[t.id!.toLowerCase()] ?? '—') : '?';
      let verdict = 'MISSING';
      if (pinned === 'yes') verdict = live ? (lv === t.version ? 'LIVE' : 'ADVISORY (pinned; live version differs — pre-release not bumped)') : 'PINNED';
      if (verdict === 'MISSING') anyMissing = true;
      vrows.push({ label: t.id!, pinned, liveVer: lv, verdict });
    }
    if (platformT) { const ok = String(pkg.json.PlatformVersion) === platformT.version; const healthy = c.backUrl ? await platformHealthy(c) : false; vrows.push({ label: 'Platform', pinned: ok ? 'yes' : 'no', liveVer: healthy ? 'healthy' : '?', verdict: ok ? (healthy ? 'LIVE' : 'PINNED') : 'MISSING' }); if (!ok) anyMissing = true; }
    if (themeT && theme) { const has = THEME_URL_RE.test(theme.text) && theme.text.includes(themeT.themeUrl!.split('/').pop()!); vrows.push({ label: 'Theme', pinned: has ? 'yes' : 'no', liveVer: '—', verdict: has ? 'PINNED' : 'MISSING' }); if (!has) anyMissing = true; }
    if (asJson) { console.log(JSON.stringify({ env, branch: c.branch, verify: vrows, allDeployed: !anyMissing }, null, 2)); throw new Exit(anyMissing ? 1 : 0); }
    console.log(`\nVerify — is the bundle deployed on ${env}? (branch pin + live /api/platform/modules)`);
    console.log(`${'Artifact'.padEnd(42)}  ${'Pinned'.padEnd(8)}  ${'Live'.padEnd(16)}  Verdict`);
    console.log('─'.repeat(96));
    for (const r of vrows) console.log(`${r.label.padEnd(42)}  ${r.pinned.padEnd(8)}  ${r.liveVer.padEnd(16)}  ${r.verdict}`);
    console.log('─'.repeat(96));
    if (!live && c.backUrl) console.log('(live column unavailable — admin token/creds not resolved; branch-pin only)');
    console.log(anyMissing ? '\n⛔ Not all artifacts are deployed — run without --verify to prepare the deploy.' : '\n✅ All artifacts pinned on the env branch.');
    throw new Exit(anyMissing ? 1 : 0);
  }

  // ── DRY-RUN (default) ──
  const title = flag('message') || `${key ? key + ': ' : ''}deploy ${bundle.length} artifact${bundle.length > 1 ? 's' : ''} to ${env}`;
  if (!apply) {
    if (asJson) { console.log(JSON.stringify({ env, branch: c.branch, key, summary, bundle, rows, webEditPkg: pkgTouched ? webEditPkg : null, webEditTheme: newThemeText ? webEditTheme : null, apply: false }, null, 2)); throw new Exit(0); }
    console.log('\nDry-run — nothing was written.');
    if (pkgTouched) console.log(`  packages.json web-edit: ${webEditPkg}`);
    if (newThemeText) console.log(`  artifact.json web-edit: ${webEditTheme}`);
    console.log(`\nTo open the deploy PR (gated; direct same-repo PR if you have write, else a fork PR — never merges):`);
    const applyArgs = args.filter((a) => a !== '--dry-run' && a !== '--apply' && a !== '--json' && a !== '--verify');
    if (!applyArgs.some((a) => a.startsWith('--env='))) applyArgs.push(`--env=${env}`);
    console.log(`  npm run deploy:pr:apply -- ${applyArgs.join(' ')}`);
    console.log(`\n⚠ vc-deploy-dev merge is a HUMAN action — this never merges. Revert the pin after verification.`);
    throw new Exit(0);
  }

  // ── APPLY (gated write; DIRECT same-repo PR when the account has write, else a fork PR) ──
  const me = flag('fork-owner') || ghUser();
  if (!me) fail('Could not resolve the GitHub account — is `gh` authenticated? (run `gh auth status`).');
  const perm = accountPermission(c.deployOwner, c.deployRepo, me);
  const direct = canWrite(perm);
  const baseSha = refSha(c.deployOwner, c.deployRepo, c.branch);
  if (!baseSha) fail(`Could not read ${c.deployOwner}/${c.deployRepo}@${c.branch} head — check the branch name for env "${env}".`);
  // Match the vc-ci "<TICKET>-<branch>-deployment" convention (e.g. VCST-5505-vcst-qa-deployment).
  const headBranch = `${key || 'deploy'}-${c.branch}-deployment`;
  const body = [
    `Deploy ${bundle.length} PR artifact(s) to **${env}** (\`${c.branch}\`) for QA verification.`, '',
    ...rows.map((r) => `- \`${r.target.kind === 'module' ? r.target.id : r.target.kind}\`: ${r.current} → ${r.proposed}${r.target.source.startsWith('PR') ? ` (${r.target.source})` : ''}`),
    ...(key ? ['', `Ref: https://virtocommerce.atlassian.net/browse/${key}`] : []),
    ...(pkgMinimal ? [] : ['', '> Manifest shape was unexpected — this fell back to a full reserialize; JSON is semantically identical, review with **"Hide whitespace changes"** enabled.']),
    '', '**DO NOT MERGE until reviewed.** Revert this pin after the change is verified on the env.',
  ].join('\n');

  let writeOwner: string, headSpec: string;
  if (direct) {
    writeOwner = c.deployOwner; headSpec = headBranch;
    console.log(`\n[apply] direct (perm=${perm}) on ${c.deployOwner}/${c.deployRepo} — branch ${headBranch} → ${c.branch}`);
  } else {
    console.log(`\n[apply] account "${me}" has no write (perm=${perm}) on ${c.deployOwner}/${c.deployRepo} — forking`);
    if (!(await ensureFork(c.deployOwner, c.deployRepo, me))) { console.error('[deploy-pr] Could not create/find your fork.'); return handoff(); }
    try { gh(['api', '--method', 'POST', `repos/${me}/${c.deployRepo}/merge-upstream`, '-f', `branch=${c.branch}`]); } catch { /* fork may already be current */ }
    writeOwner = me; headSpec = `${me}:${headBranch}`;
  }
  const branchSha = direct ? baseSha : (refSha(me, c.deployRepo, c.branch) || baseSha);
  // Surface (not silently resolve) a concurrent run: if this deterministic branch already existed
  // before we touched it, someone else's in-flight/prior --apply may already have a commit here —
  // our writes below will overwrite it without a merge. Warn loudly rather than clobber quietly.
  const headExistedBefore = refSha(writeOwner, c.deployRepo, headBranch) !== null;
  const compareUrl = `https://github.com/${c.deployOwner}/${c.deployRepo}/compare/${c.branch}...${headSpec.replace(':', '%3A')}?expand=1`;
  if (!createRef(writeOwner, c.deployRepo, headBranch, branchSha)) { console.error('[deploy-pr] Could not create the deployment branch.'); return handoff(); }
  if (headExistedBefore && !asJson) {
    console.log(`\n⚠ Branch ${writeOwner}/${c.deployRepo}@${headBranch} already existed before this run.`);
    console.log(`  Possible concurrent /qa-deploy-pr run for the same ticket+env — the commits below will`);
    console.log(`  overwrite whatever is currently on that branch (no merge). If unsure, stop and compare first:`);
    console.log(`  ${compareUrl}`);
  }
  let pkgOk = true, themeOk = true;
  if (pkgTouched) pkgOk = commitViaGh(writeOwner, c.deployRepo, c.packagesPath, newPkgText, headBranch, `${title}`);
  if (newThemeText) themeOk = commitViaGh(writeOwner, c.deployRepo, c.themePath, newThemeText, headBranch, `${title}`);
  const anyCommitted = (pkgTouched && pkgOk) || (newThemeText && themeOk);
  const allCommitted = (!pkgTouched || pkgOk) && (!newThemeText || themeOk);
  if (!allCommitted) {
    if (anyCommitted) {
      // A real commit already landed on headBranch — do NOT call handoff() (it implies nothing was
      // written). Report the partial, inconsistent branch state explicitly so it can't be missed.
      console.error(`[deploy-pr] ⚠ PARTIAL commit — the branch is now in an inconsistent state (push rights?).`);
      if (pkgTouched) console.error(`  packages.json: ${pkgOk ? 'committed' : 'FAILED'}`);
      if (newThemeText) console.error(`  theme/artifact.json: ${themeOk ? 'committed' : 'FAILED'}`);
      console.error(`[deploy-pr] Inspect/fix directly on ${writeOwner}/${c.deployRepo}@${headBranch}, or delete that branch and re-run:`);
      console.error(`  ${compareUrl}`);
      throw new Exit(1);
    }
    console.error('[deploy-pr] A commit failed (push rights?).');
    return handoff();
  }
  const pr = createPr(c.deployOwner, c.deployRepo, c.branch, headSpec, title, body);
  if (asJson) { console.log(JSON.stringify({ env, branch: c.branch, account: me, direct, perm, headBranch, bundle, pr, compareUrl, applied: true }, null, 2)); throw new Exit(0); }
  console.log(`\n✅ Committed to ${writeOwner}/${c.deployRepo}@${headBranch} (${pkgMinimal ? 'minimal diff' : 'reserialized'})`);
  if (pr.ok) console.log(`✅ PR ${pr.note}: ${pr.url}\n   A human reviews + merges it to deploy. NEVER auto-merged.`);
  else { console.log(`⚠ PR not opened (${pr.note}) — the branch is pushed; open it:\n   ${compareUrl}`); }
  console.log(`\nAfter merge, confirm live:  npm run deploy:pr -- ${key || ''} --env=${env} --verify`);
  console.log(`Revert the pin after verification (this is a temporary QA repin).`);
  throw new Exit(0);

  // couldn't write directly or via a fork → degrade to prepare-only
  function handoff(): never {
    console.log('\n— Falling back to prepare-only (hand this diff to DevOps) —');
    if (pkgTouched) console.log(`  packages.json web-edit: ${webEditPkg}`);
    if (newThemeText) console.log(`  artifact.json web-edit: ${webEditTheme}`);
    console.log('  (apply the Proposed column above on the env branch; a human merges to deploy.)');
    throw new Exit(0);
  }
}

// Guarded so this module can be `import()`ed (e.g. by unit tests) without running the CLI.
const isMain = (() => {
  try { return !!process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]); } catch { return false; }
})();
if (isMain) {
  main().catch((e) => {
    if (e instanceof Exit) { process.exitCode = e.code; return; }
    console.error(`[deploy-pr] fatal: ${e.message}`);
    process.exitCode = 2;
  });
}
