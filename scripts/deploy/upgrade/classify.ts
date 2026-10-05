// scripts/deploy/upgrade/classify.ts — one Row per pinned module and for the platform (draft §4–§5).
import type { Http } from '../lib/github.ts';
import type { Pin } from './pins.ts';
import type { FeedEntry, FeedVersion } from './feed.ts';
import { latestRelease } from './feed.ts';
import type { Change, Row } from './types.ts';
import { baseOf, cmpVersion, parseVersion, trackerKey } from './versions.ts';

export interface PrRelease { state: 'open' | 'closed' | 'merged' | 'missing'; title: string; url: string; mergeSha?: string; releasedIn?: string }

const releaseTags = async (http: Http, repo: string): Promise<string[]> =>
  (await http.ghAll(`/repos/${repo}/releases`))
    .filter((r: any) => !r.draft && !r.prerelease && /^v?\d+\.\d+\.\d+$/.test(r.tag_name))
    .map((r: any) => r.tag_name as string)
    .sort((a, b) => cmpVersion(a, b));

/** Which release (if any) contains PR #pr. First the tags ≥ the pin's base, ascending, by ancestry;
 *  then "(#N)" in the latest release's own commits (hotfix cherry-picks are made without -x). */
export async function prRelease(http: Http, repo: string, pr: number, pinBase: string): Promise<PrRelease> {
  const p = await http.gh(`/repos/${repo}/pulls/${pr}`);
  if (!p) return { state: 'missing', title: '', url: `https://github.com/${repo}/pull/${pr}` };
  const base = { title: String(p.title ?? ''), url: String(p.html_url ?? '') };
  if (!p.merged_at) return { ...base, state: p.state === 'open' ? 'open' : 'closed' };
  const tags = await releaseTags(http, repo);
  for (const tag of tags.filter((t) => cmpVersion(t, pinBase) >= 0)) {
    const c = await http.gh(`/repos/${repo}/compare/${tag}...${p.merge_commit_sha}`);
    if (c && (c.status === 'behind' || c.status === 'identical')) return { ...base, state: 'merged', mergeSha: p.merge_commit_sha, releasedIn: tag };
  }
  if (tags.length >= 2) {
    const c = await http.gh(`/repos/${repo}/compare/${tags[tags.length - 2]}...${tags[tags.length - 1]}`);
    const re = new RegExp(`\\(#${pr}\\)`);
    if ((c?.commits ?? []).some((x: any) => re.test(String(x?.commit?.message ?? '').split('\n')[0]))) return { ...base, state: 'merged', mergeSha: p.merge_commit_sha, releasedIn: tags[tags.length - 1] };
  }
  return { ...base, state: 'merged', mergeSha: p.merge_commit_sha };
}

export interface ClassifyCtx { http: Http; feed: Map<string, FeedEntry>; repoOf(id: string): string | null; blobBase: string; isPrivate(repo: string): Promise<boolean> }

async function moduleChange(pin: Pin, target: FeedVersion, status: Change['status'], ctx: ClassifyCtx): Promise<Change> {
  const repo = ctx.repoOf(pin.id);
  // A release pinned in AzureBlob stays there (private repo: the deploy downloads anonymously, so a
  // GithubReleases pin of it 404s). A prerelease in AzureBlob is promoted unless its repo is private.
  const stayInBlob = pin.source === 'AzureBlob' && (parseVersion(pin.version).kind === 'release' || !repo || (await ctx.isPrivate(repo)));
  const mode = pin.source === 'GithubReleases' ? 'release-bump' : stayInBlob ? 'blob-bump' : 'promote';
  return {
    component: pin.id, kind: 'module', from: pin.version, to: target.Version, mode, status,
    platformFloor: target.PlatformVersion,
    deps: (target.Dependencies ?? []).filter((d) => !d.Optional).map((d) => ({ Id: d.Id, Version: d.Version })),
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
  const pr = v.kind === 'pr' && repo ? await prRelease(ctx.http, repo, v.pr!, v.base) : null;
  const key = trackerKey(pr?.title, v.branch);
  if (!entry) return { ...row, status: 'NOT_IN_FEED', note: 'custom, client or private module', trackerKey: key, prUrl: pr?.url };
  const latest = latestRelease(entry);
  if (!latest) return { ...row, status: 'NO_RELEASE', note: 'feed holds only alpha versions' };
  row.latest = latest.Version;
  if (v.kind === 'release') {
    const d = cmpVersion(v.base, latest.Version);
    if (d === 0) return { ...row, status: 'EQUAL' };
    if (d > 0) return { ...row, status: 'AHEAD', note: 'newer than the latest release — never downgraded' };
    return { ...row, status: 'BEHIND', change: await moduleChange(pin, latest, 'BEHIND', ctx) };
  }
  const downgrade = cmpVersion(latest.Version, v.base) < 0;
  const ask = async (note: string): Promise<Row> =>
    ({ ...row, status: 'PRERELEASE?', note, trackerKey: key, prUrl: pr?.url, downgrade, replace: await moduleChange(pin, latest, 'PRERELEASE→RELEASE', ctx) });
  if (v.kind === 'pr') {
    if (!pr || pr.state === 'missing') return ask(`PR #${v.pr} not found`);
    if (pr.state !== 'merged') return ask(pr.state === 'open' ? 'PR open' : 'PR closed unmerged');
    if (!pr.releasedIn) return ask('merged, not released yet');
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
  const pr = t.kind === 'pr' ? await prRelease(http, platformRepo, t.pr!, t.base) : null;
  if (pr?.releasedIn) return { ...row, status: 'PRERELEASE→RELEASE', note: `PR #${t.pr} is in ${pr.releasedIn}`, prUrl: pr.url, trackerKey: trackerKey(pr.title), change: change('PRERELEASE→RELEASE') };
  return { ...row, status: 'PRERELEASE?', note: pr ? (pr.state === 'open' ? 'PR open' : pr.state === 'merged' ? 'merged, not released yet' : `PR ${pr.state}`) : 'prerelease image', prUrl: pr?.url, trackerKey: trackerKey(pr?.title, tag), downgrade: cmpVersion(latest, baseOf(tag)) < 0, replace: change('PRERELEASE→RELEASE') };
}
