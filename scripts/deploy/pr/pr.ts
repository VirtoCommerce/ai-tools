/**
 * vc-deploy.ts pr — deploy a change's PR artifacts
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
 *   • platform        → PlatformVersion (base semver) + PlatformImageTag (the container tag CI pushed).
 *                       vc-platform publishes NO vc3prerelease zip — its PR body carries
 *                       `Image tag: ghcr.io/VirtoCommerce/platform:<tag>`, and that tag is the only
 *                       field vc-deploy-dev's deploy-backend.yml reads for the platform.
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
 *   npx tsx scripts/deploy/vc-deploy.ts pr <ticket-key> [options]
 *
 * Options:
 *   --env=<name>               Target env (default: resolved TEST_ENV). Picks the vc-deploy-dev branch + BACK_URL.
 *   --pr=<owner/repo#N|url>     Add a PR's latest artifact to the set (repeatable).
 *   --module=<Id=Version>       Add an explicit backend module pin (repeatable). Version = the -pr blob version.
 *   --platform=<Ver|tag|Ver=tag> Add an explicit Platform pin. A bare release version sets both fields;
 *                               a PR container tag (`3.1053.0-pr-3092-…`, or a full ghcr.io ref) keeps
 *                               PlatformVersion at the base semver and puts the tag in PlatformImageTag.
 *   --theme=<url|version>       Add an explicit storefront theme artifact (a full vc3prerelease URL, or a version).
 *   --apply                     Gated write: commit the bundle to the fork + open/print the cross-fork PR. Omit = dry-run.
 *   --dry-run                   Explicit no-op form of the default (wins over --apply if both given).
 *   --verify                    Report per-target deploy state (env-branch pin + live module version). Read-only.
 *   --fork-owner=<login>        Fork account to push --apply to (default: the token owner from `gh api user`).
 *   --message=<text>            Commit / PR title (default "VCST-XXXX: <ticket title>", else
 *                               "VCST-XXXX: deploy N artifacts to <env>" when no summary resolved).
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

import { OWNER, loadEnvFiles, resolveEnvCoords } from '../lib/env.ts';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';
import { fetchFile, getToken, ghJson, setToken } from '../lib/github.ts';
import { DeliverError, deliverPr } from '../lib/deliver.ts';
import type { DeliverResult } from '../lib/deliver.ts';
import { THEME_URL_RE, countChangedLines, editPackagesText, editThemeText, pinnedModule, tagOf } from '../lib/manifest.ts';
import type { Target } from '../lib/manifest.ts';
import { getAdminToken, liveModules, platformHealthy } from '../lib/live.ts';
import { Exit, fail } from '../lib/exit.ts';

const JIRA_BASE = (process.env.JIRA_BASE_URL || 'https://virtocommerce.atlassian.net').replace(/\/$/, '');
const ARTIFACT_RE = /https?:\/\/vc3prerelease\.blob\.core\.windows\.net\/[^\s)"'<>]+?\.zip/gi;
const PR_URL_RE = /github\.com\/(VirtoCommerce)\/([A-Za-z0-9._-]+)\/pull\/(\d+)/gi;
// A vc-platform PR does NOT publish a vc3prerelease zip — its CI pushes a CONTAINER IMAGE and the
// PR body carries `Image tag: ghcr.io/VirtoCommerce/platform:<tag>`. That tag is the only thing
// vc-deploy-dev's deploy-backend.yml reads for the platform (`PlatformImageTag` → docker build-arg),
// so it is what a platform pin actually needs. Matched case-insensitively on the image path since
// PR bodies use `VirtoCommerce` while the manifest's PlatformImage is lowercase.
const PLATFORM_IMAGE_TAG_RE = /ghcr\.io\/[A-Za-z0-9._-]+\/platform:([A-Za-z0-9._-]+)/i;
/** Leading semver of a container tag: `3.1053.0-pr-3092-2588-vcst-5532-2588d613` → `3.1053.0`. */
const SEMVER_PREFIX_RE = /^(\d+\.\d+\.\d+(?:\.\d+)?)/;

/**
 * Build a platform Target from a container tag. `PlatformVersion` keeps the tag's BASE semver while
 * `PlatformImageTag` carries the full pre-release tag — they are different fields with different
 * consumers, and writing the tag into both leaves PlatformVersion a non-semver string that anything
 * parsing it (vc-build module compat, humans reading the manifest) reads as garbage.
 */
export function platformTargetFromTag(tag: string, source: string): Target {
  const base = SEMVER_PREFIX_RE.exec(tag);
  return { kind: 'platform', version: base ? base[1] : tag, imageTag: tag, source };
}
/**
 * `--platform` accepts three forms, so the caller never has to hand-split the two manifest fields:
 *   • `3.1051.0`                                    → both fields (a plain release bump)
 *   • `3.1053.0-pr-3092-2588-vcst-5532-2588d613`     → PlatformVersion 3.1053.0 + that tag
 *   • `3.1053.0=<tag>` or a full `ghcr.io/...:<tag>` → explicit version / tag split
 */
export function parsePlatformFlag(raw: string, source: string): Target {
  const v = raw.trim();
  const fromImage = PLATFORM_IMAGE_TAG_RE.exec(v);
  if (fromImage) return platformTargetFromTag(fromImage[1], source);
  const eq = v.indexOf('=');
  if (eq > 0) return { kind: 'platform', version: v.slice(0, eq).trim(), imageTag: v.slice(eq + 1).trim(), source };
  return platformTargetFromTag(v, source);
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
export interface PrRef { owner: string; repo: string; number: number; source: string; }
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
/**
 * Resolve a single PR's LATEST artifact → a Target (or a reason it has none).
 * Backend modules + the storefront theme publish a vc3prerelease ZIP; vc-platform instead publishes
 * a CONTAINER IMAGE, so its PR body has an empty "Artifact URL:" and an `Image tag:` line — which is
 * checked before giving up, otherwise every platform PR reads as "CI still running" forever.
 */
export function artifactFromPrBody(
  ref: PrRef,
  body: string,
  state: string,
): { target?: Target; state?: string; note: string } {
  const urls = (body || '').match(ARTIFACT_RE) || [];
  const src = `PR ${ref.owner}/${ref.repo}#${ref.number}`;
  const imageTag = PLATFORM_IMAGE_TAG_RE.exec(body || '')?.[1];
  // Platform pin, tag-only (the normal vc-platform case — no zip is ever published).
  if (urls.length === 0) {
    if (imageTag) {
      const t = platformTargetFromTag(imageTag, src);
      return { target: t, state, note: `${src} [${state}] → Platform ${t.version} (image tag ${t.imageTag})` };
    }
    return { state, note: `${src} [${state}]: no vc3prerelease Artifact URL or platform image tag yet (CI still running?)` };
  }
  const url = urls[urls.length - 1]; // last wins (bodies sometimes list older→newer)
  const file = decodeURIComponent(url.split('/').pop() || '');
  if (ref.repo.toLowerCase() === 'vc-frontend' || /^vc-theme/i.test(file)) {
    return { target: { kind: 'theme', themeUrl: url, source: src }, state, note: `${src} [${state}] → theme ${file}` };
  }
  // A platform build that ALSO published a zip: keep the zip's version as PlatformVersion but prefer
  // the body's image tag for PlatformImageTag — the tag is what the deploy actually pulls.
  const platform = (version: string) => {
    const t: Target = { kind: 'platform', version, imageTag: imageTag ?? version, source: src };
    const suffix = t.imageTag !== version ? ` (image tag ${t.imageTag})` : '';
    return { target: t, state, note: `${src} [${state}] → Platform ${version}${suffix}` };
  };
  const fm = file.replace(/\.zip$/i, '').match(/^(VirtoCommerce\.[A-Za-z0-9.]+)_(\d.*)$/);
  if (fm) {
    if (fm[1] === 'VirtoCommerce.Platform') return platform(fm[2]);
    return { target: { kind: 'module', id: fm[1], version: fm[2], blobName: file, source: src }, state, note: `${src} [${state}] → ${fm[1]}=${fm[2]}` };
  }
  // vc-platform repo build whose file isn't the VirtoCommerce.Platform pattern.
  if (ref.repo.toLowerCase() === 'vc-platform') {
    const pv = file.replace(/\.zip$/i, '').match(/_(\d.*)$/);
    if (pv) return platform(pv[1]);
  }
  return { state, note: `${src} [${state}]: artifact not recognised (${file})` };
}
/** Network wrapper: fetch the PR, then delegate the (pure, unit-tested) body parse. */
async function artifactFromPr(ref: PrRef): Promise<{ target?: Target; state?: string; note: string }> {
  const pr = await ghJson(`https://api.github.com/repos/${ref.owner}/${ref.repo}/pulls/${ref.number}`);
  if (!pr) return { note: `${ref.owner}/${ref.repo}#${ref.number}: not found` };
  return artifactFromPrBody(ref, pr.body || '', pr.state);
}

export function parsePrRef(ref: string): PrRef | null {
  const url = /github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/.exec(ref);
  if (url) return { owner: url[1], repo: url[2], number: +url[3], source: '--pr' };
  const short = /^(?:([^/\s]+)\/)?([a-z0-9._-]+)#(\d+)$/i.exec(ref);
  return short ? { owner: short[1] || OWNER, repo: short[2], number: +short[3], source: '--pr' } : null;
}


// ── main ─────────────────────────────────────────────────────────────────────
export async function runPr(args: string[]): Promise<void> {
  const flag = (n: string) => args.find((a) => a.startsWith(`--${n}=`))?.split('=').slice(1).join('=');
  const flags = (n: string) => args.filter((a) => a.startsWith(`--${n}=`)).map((a) => a.split('=').slice(1).join('='));
  const has = (n: string) => args.includes(`--${n}`);
  const asJson = has('json');
  const apply = has('apply') && !has('dry-run');
  const verify = has('verify');
  const key = args.find((a) => !a.startsWith('--'))?.toUpperCase();

  // The session env as every entry point resolves it (TEST_ENV, else .env.test-env, else vcst): reading
  // TEST_ENV alone sent a checkout whose env is set only in .env.test-env to vcst / vcst-qa.
  const sessionEnv = resolveTestEnv('vcst');
  loadEnvFiles(sessionEnv);
  const env = flag('env') || sessionEnv;
  setToken(process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN);
  if (!getToken()) fail('No GIT_TOKEN — a PAT with product-repo read + push on your vc-deploy-dev fork (read .env.local).');
  const c = resolveEnvCoords(env, flag('password'));

  // ── 1. resolve the artifact set ──
  const targets: Target[] = [];
  const resolveNotes: string[] = [];
  let summary: string | null = null;

  if (key) {
    if (!/^[A-Z][A-Z0-9]{1,9}-\d+$/.test(key)) fail(`"${key}" is not a ticket key. Usage: vc-deploy.ts pr <ticket-key> [--pr ...] [--module Id=Ver] [--platform Ver] [--theme url]`);
    // A tracker lookup failure is only FATAL when the ticket is the sole source of targets. With an
    // explicit --pr/--module/--platform/--theme the run is tracker-agnostic by design (Azure Boards,
    // no dev-links, dead creds) — the key then only labels the branch / commit message.
    const explicit = flags('pr').length + flags('module').length + flags('theme').length + (flag('platform') ? 1 : 0) > 0;
    const r = await prsFromJira(key).catch((e) => {
      if (!explicit) fail(e.message);
      resolveNotes.push(`ticket ${key}: tracker lookup FAILED (${e.message}) — using the explicit targets only`);
      return { summary: null, prs: [] as PrRef[] };
    });
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
  if (platformFlag) targets.push(parsePlatformFlag(platformFlag, '--platform'));
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
  if (platformT) {
    // Show the TAG, not just the version — for a PR pre-release they differ, and the tag is what
    // actually gets deployed. Hiding it made the table read as a no-op re-pin of the same version.
    const curTag = pkg.json.PlatformImageTag !== undefined ? String(pkg.json.PlatformImageTag) : null;
    const curVer = String(pkg.json.PlatformVersion ?? 'absent');
    const newTag = tagOf(platformT);
    rows.push({
      target: platformT,
      current: curTag && curTag !== curVer ? `${curVer} → tag ${curTag}` : curVer,
      proposed: newTag !== platformT.version ? `${platformT.version} → tag ${newTag}` : platformT.version!,
    });
  }
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
    if (platformT) {
      // The IMAGE TAG is the load-bearing field (deploy-backend.yml reads only PlatformImageTag), so
      // checking PlatformVersion alone reported PINNED for a branch still running the old container.
      const wantTag = tagOf(platformT);
      const ok = String(pkg.json.PlatformImageTag ?? pkg.json.PlatformVersion) === wantTag;
      const healthy = c.backUrl ? await platformHealthy(c) : false;
      vrows.push({ label: 'Platform', pinned: ok ? 'yes' : 'no', liveVer: healthy ? 'healthy' : '?', verdict: ok ? (healthy ? 'LIVE' : 'PINNED') : 'MISSING' });
      if (!ok) anyMissing = true;
    }
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
  // Title convention: "<TICKET>: <ticket title>" — matches vc-ci / /qa-hotfix-check manifest commits,
  // so the deploy PR reads as the change it delivers rather than as plumbing. Falls back to the
  // artifact count when the tracker gave us no summary (explicit --pr/--module run, or ticket unreadable).
  const titleText = (summary ?? '').replace(/\s+/g, ' ').trim();
  const title = flag('message')
    || (key && titleText
      ? `${key}: ${titleText.length > 120 ? titleText.slice(0, 119).trimEnd() + '…' : titleText}`
      : `${key ? key + ': ' : ''}deploy ${bundle.length} artifact${bundle.length > 1 ? 's' : ''} to ${env}`);
  if (!apply) {
    if (asJson) { console.log(JSON.stringify({ env, branch: c.branch, key, summary, title, bundle, rows, webEditPkg: pkgTouched ? webEditPkg : null, webEditTheme: newThemeText ? webEditTheme : null, apply: false }, null, 2)); throw new Exit(0); }
    console.log('\nDry-run — nothing was written.');
    console.log(`  PR title would be: ${title}`);
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
  const headBranch = `${key || 'deploy'}-${c.branch}-deployment`; // vc-ci "<TICKET>-<branch>-deployment" convention
  const body = [
    `Deploy ${bundle.length} PR artifact(s) to **${env}** (\`${c.branch}\`) for QA verification.`, '',
    ...rows.map((r) => `- \`${r.target.kind === 'module' ? r.target.id : r.target.kind}\`: ${r.current} → ${r.proposed}${r.target.source.startsWith('PR') ? ` (${r.target.source})` : ''}`),
    ...(key ? ['', `Ref: https://virtocommerce.atlassian.net/browse/${key}`] : []),
    ...(pkgMinimal ? [] : ['', '> Manifest shape was unexpected — this fell back to a full reserialize; JSON is semantically identical, review with **"Hide whitespace changes"** enabled.']),
    '', '**DO NOT MERGE until reviewed.** Revert this pin after the change is verified on the env.',
  ].join('\n');

  const files = [
    ...(pkgTouched ? [{ path: c.packagesPath, text: newPkgText }] : []),
    ...(newThemeText ? [{ path: c.themePath, text: newThemeText }] : []),
  ];
  let r: DeliverResult;
  try { r = await deliverPr({ coords: c, headBranch, title, body, files, forkOwner: flag('fork-owner'), log: asJson ? undefined : (l) => console.log(l) }); }
  catch (e) { if (e instanceof DeliverError) fail(e.message); throw e; }
  if (r.kind === 'handoff') { console.error(`[deploy-pr] ${r.reason}`); return handoff(); }
  if (r.kind === 'stale' || r.kind === 'unreadable') fail(`unexpected ${r.kind} result for ${r.path}`); // pr mode passes no snapshot
  if (r.kind === 'partial') {
    console.error(`[deploy-pr] ⚠ PARTIAL commit — the branch is now in an inconsistent state (push rights?).`);
    for (const p of r.committed) console.error(`  ${p}: committed`);
    for (const p of r.failed) console.error(`  ${p}: FAILED`);
    console.error(`[deploy-pr] Inspect/fix directly on ${r.writeOwner}/${c.deployRepo}@${r.headBranch}, or delete that branch and re-run:`);
    console.error(`  ${r.compareUrl}`);
    throw new Exit(1);
  }
  const pr = r.kind === 'pr' ? { ok: true, url: r.url, note: r.note } : { ok: false, note: r.note };
  if (asJson) { console.log(JSON.stringify({ env, branch: c.branch, account: r.account, direct: r.direct, perm: r.perm, headBranch: r.headBranch, bundle, pr, compareUrl: r.compareUrl, applied: true }, null, 2)); throw new Exit(0); }
  console.log(`\n✅ Committed to ${r.direct ? c.deployOwner : r.account}/${c.deployRepo}@${r.headBranch} (${pkgMinimal ? 'minimal diff' : 'reserialized'})`);
  if (pr.ok) console.log(`✅ PR ${pr.note}: ${pr.url}\n   A human reviews + merges it to deploy. NEVER auto-merged.`);
  else { console.log(`⚠ PR not opened (${pr.note}) — the branch is pushed; open it:\n   ${r.compareUrl}`); }
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


