// scripts/deploy/upgrade/classify.ts — one Row per pinned module and for the platform (draft §4–§5).
import type { Http } from '../lib/github.ts';
import type { Pin } from '../lib/pins.ts';
import type { FeedEntry, FeedVersion } from './feed.ts';
import { isRelease, latestRelease } from './feed.ts';
import type { Change, Row } from './types.ts';
import { baseOf, cmpVersion, parseVersion, trackerKey } from './versions.ts';

export interface PrRelease { state: 'open' | 'closed' | 'merged' | 'missing'; title: string; url: string; mergeSha?: string; releasedIn?: string }

/** A repo's release tags, ascending — fetched once per repo per plan (every PR pin of a repo asks). */
const tagCache = new WeakMap<Http, Map<string, Promise<string[]>>>();
function releaseTags(http: Http, repo: string): Promise<string[]> {
  let byRepo = tagCache.get(http);
  if (!byRepo) tagCache.set(http, (byRepo = new Map()));
  if (!byRepo.has(repo)) {
    byRepo.set(repo, http.ghAll(`/repos/${repo}/releases`).then((rs) => rs
      .filter((r: any) => !r.draft && !r.prerelease && /^v?\d+\.\d+\.\d+$/.test(r.tag_name))
      .map((r: any) => r.tag_name as string)
      .sort((a, b) => cmpVersion(a, b))));
  }
  return byRepo.get(repo)!;
}

/** Does release `tag` contain the PR? By ancestry; else by "(#N)" in the commits `tag` added over the
 *  release before it (hotfix cherry-picks are made without -x, so their sha is not the merge sha). */
async function tagContains(http: Http, repo: string, tags: string[], tag: string, mergeSha: string, pr: number): Promise<boolean> {
  const c = await http.gh(`/repos/${repo}/compare/${tag}...${mergeSha}`);
  if (c && (c.status === 'behind' || c.status === 'identical')) return true;
  const prev = tags[tags.indexOf(tag) - 1];
  if (!prev) return false;
  const own = await http.gh(`/repos/${repo}/compare/${prev}...${tag}`);
  const re = new RegExp(`\\(#${pr}\\)`);
  return (own?.commits ?? []).some((x: any) => re.test(String(x?.commit?.message ?? '').split('\n')[0]));
}

/** Is PR #pr in `target` — the release the pin would MOVE to? Asked of the target itself: the lowest
 *  release containing the PR says nothing about a higher one on another line (a fix merged straight into
 *  a support branch is in 3.1039.13 and may never reach master's 3.1076.0). When the target lacks it, a
 *  newer GitHub release (not in the feed yet) is tried, so the question can say where the PR did land.
 *  No target (a module with no release in the feed): only the PR's state and title are read. */
export async function prRelease(http: Http, repo: string, pr: number, target?: string): Promise<PrRelease> {
  const p = await http.gh(`/repos/${repo}/pulls/${pr}`);
  if (!p) return { state: 'missing', title: '', url: `https://github.com/${repo}/pull/${pr}` };
  const base = { title: String(p.title ?? ''), url: String(p.html_url ?? '') };
  if (!p.merged_at) return { ...base, state: p.state === 'open' ? 'open' : 'closed' };
  const merged = { ...base, state: 'merged' as const, mergeSha: String(p.merge_commit_sha) };
  if (!target) return merged;
  const tags = await releaseTags(http, repo);
  const tgt = tags.find((t) => cmpVersion(t, target) === 0);
  if (tgt && (await tagContains(http, repo, tags, tgt, merged.mergeSha, pr))) return { ...merged, releasedIn: baseOf(tgt) };
  const newest = tags[tags.length - 1];
  if (newest && cmpVersion(newest, target) > 0 && (await tagContains(http, repo, tags, newest, merged.mergeSha, pr))) return { ...merged, releasedIn: baseOf(newest) };
  return merged;
}

export interface ClassifyCtx { http: Http; feed: Map<string, FeedEntry>; repoOf(id: string): string | null; blobBase: string; isPrivate(repo: string): Promise<boolean> }

const nonOptional = (v: FeedVersion) => (v.Dependencies ?? []).filter((d) => !d.Optional).map((d) => ({ Id: d.Id, Version: d.Version }));

async function moduleChange(pin: Pin, target: FeedVersion, status: Change['status'], ctx: ClassifyCtx): Promise<Change> {
  const repo = ctx.repoOf(pin.id);
  // A release pinned in AzureBlob stays there (private repo: the deploy downloads anonymously, so a
  // GithubReleases pin of it 404s). A prerelease in AzureBlob is promoted unless its repo is private.
  const stayInBlob = pin.source === 'AzureBlob' && (parseVersion(pin.version).kind === 'release' || !repo || (await ctx.isPrivate(repo)));
  const mode = pin.source === 'GithubReleases' ? 'release-bump' : stayInBlob ? 'blob-bump' : 'promote';
  return {
    component: pin.id, kind: 'module', from: pin.version, to: target.Version, mode, status,
    platformFloor: target.PlatformVersion,
    deps: nonOptional(target),
    assetUrl: mode === 'blob-bump' ? `${ctx.blobBase}/${pin.id}_${target.Version}.zip` : String(target.PackageUrl),
    assetOk: false, // decided by the plan's download check (plan.ts), never assumed
  };
}

export async function classifyModule(pin: Pin, duplicate: boolean, ctx: ClassifyCtx): Promise<Row> {
  const row: Row = { component: pin.id, kind: 'module', current: pin.version, source: pin.source, latest: null, status: 'EQUAL', note: '' };
  if (duplicate) return { ...row, status: 'DUPLICATE', note: 'pinned in both sources — fix by hand' };
  const v = parseVersion(pin.version);
  const repo = ctx.repoOf(pin.id);
  const entry = ctx.feed.get(pin.id);
  const latest = entry ? latestRelease(entry) : null;
  const pr = v.kind === 'pr' && repo ? await prRelease(ctx.http, repo, v.pr!, latest?.Version) : null;
  const key = trackerKey(pr?.title, v.branch);
  if (!entry) return { ...row, status: 'NOT_IN_FEED', note: 'custom, client or private module', trackerKey: key, prUrl: pr?.url };
  if (!latest) return { ...row, status: 'NO_RELEASE', note: 'feed holds only alpha versions' };
  row.latest = latest.Version;
  // What the pinned release itself requires: a module that STAYS is checked against the end state too.
  const cur = v.kind === 'release' ? entry.Versions.find((x) => isRelease(x) && cmpVersion(x.Version, v.base) === 0) : undefined;
  if (cur) { row.currentDeps = nonOptional(cur); row.currentPlatformFloor = cur.PlatformVersion; }
  if (v.kind === 'release') {
    const d = cmpVersion(v.base, latest.Version);
    if (d === 0) return { ...row, status: 'EQUAL' };
    if (d > 0) return { ...row, status: 'AHEAD', note: 'newer than the latest release — never downgraded' };
    return { ...row, status: 'BEHIND', change: await moduleChange(pin, latest, 'BEHIND', ctx) };
  }
  const downgrade = cmpVersion(latest.Version, v.base) < 0;
  const ask = async (note: string, down = downgrade): Promise<Row> =>
    ({ ...row, status: 'PRERELEASE?', note, trackerKey: key, prUrl: pr?.url, downgrade: down, replace: await moduleChange(pin, latest, 'PRERELEASE→RELEASE', ctx) });
  if (v.kind === 'pr') {
    if (!pr || pr.state === 'missing') return ask(`PR #${v.pr} not found`);
    if (pr.state !== 'merged') return ask(pr.state === 'open' ? 'PR open' : 'PR closed unmerged');
    if (!pr.releasedIn) return ask(`merged, not in release ${latest.Version}`);
    if (cmpVersion(latest.Version, pr.releasedIn) < 0) return ask(`released in ${pr.releasedIn}, feed latest ${latest.Version}`);
    if (downgrade) return ask(`PR #${v.pr} is in ${pr.releasedIn} (lower than the pin)`, true);
    return { ...row, status: 'PRERELEASE→RELEASE', note: `PR #${v.pr} is in ${pr.releasedIn}`, trackerKey: key, prUrl: pr.url, change: await moduleChange(pin, latest, 'PRERELEASE→RELEASE', ctx) };
  }
  if (v.kind === 'alpha') {
    // X.Y.Z-alpha.N precedes release X.Y.Z: the last alpha of a version is built minutes before its release.
    if (!downgrade) return { ...row, status: 'PRERELEASE→RELEASE', note: `by version (release ${latest.Version} ≥ ${v.base})`, change: await moduleChange(pin, latest, 'PRERELEASE→RELEASE', ctx) };
    return ask(`alpha of ${v.base}, no release ≥ it yet`);
  }
  if (v.kind === 'branch-alpha') return ask(`feature branch \`${v.branch}\``);
  return ask('unrecognised suffix');
}

/** Platform: not in the feed. A PlatformImageTag that is not plain X.Y.Z, or differs from PlatformVersion, is a prerelease image. */
export async function classifyPlatform(json: any, latest: string, platformRepo: string, http: Http): Promise<Row> {
  const version = String(json.PlatformVersion ?? ''), tag = json.PlatformImageTag !== undefined ? String(json.PlatformImageTag) : version;
  const current = tag !== version ? `${version} (image ${tag})` : version;
  const row: Row = { component: 'Platform', kind: 'platform', current, latest, status: 'EQUAL', note: '' };
  const change = (status: Change['status']): Change => ({ component: 'Platform', kind: 'platform', from: tag, to: latest, mode: 'platform', status, deps: [], assetUrl: '', assetOk: false });
  const t = parseVersion(tag);
  if (t.kind === 'release' && tag === version) {
    const d = cmpVersion(version, latest);
    return d === 0 ? row : d > 0 ? { ...row, status: 'AHEAD', note: 'never downgraded' } : { ...row, status: 'BEHIND', change: change('BEHIND') };
  }
  const pr = t.kind === 'pr' ? await prRelease(http, platformRepo, t.pr!, latest) : null;
  const key = trackerKey(pr?.title, tag);
  let note = pr ? (pr.state === 'open' ? 'PR open' : pr.state === 'merged' ? `merged, not in release ${latest}` : `PR ${pr.state}`) : 'prerelease image';
  const downgrade = cmpVersion(latest, baseOf(tag)) < 0;
  if (pr?.releasedIn) {
    if (cmpVersion(latest, pr.releasedIn) < 0) note = `released in ${pr.releasedIn}, latest release ${latest}`;
    else if (downgrade) note = `PR #${t.pr} is in ${pr.releasedIn} (lower than the pin)`;
    else return { ...row, status: 'PRERELEASE→RELEASE', note: `PR #${t.pr} is in ${pr.releasedIn}`, prUrl: pr.url, trackerKey: key, change: change('PRERELEASE→RELEASE') };
  }
  return { ...row, status: 'PRERELEASE?', note, prUrl: pr?.url, trackerKey: key, downgrade, replace: change('PRERELEASE→RELEASE') };
}
