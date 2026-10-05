// scripts/deploy/upgrade/theme.ts — the storefront theme target: the newest dev alpha whose CI run is GREEN (draft §3).
// Theme alphas are not in the feed or in GitHub releases; they are blobs in vc3prerelease. The blob
// name carries no sha, so the ONLY link from an alpha to its CI run is time: the blob's Last-Modified
// falls inside one run's "Publish to Blob" step window. Runs are found per commit (`?head_sha=`):
// listing them with `branch=dev&event=push` returned nothing newer than two weeks back (measured 2026-10-02).
import type { Http } from '../lib/github.ts';
import { escRe } from '../lib/manifest.ts';
import type { Change, Row } from './types.ts';
import { cmpVersion, trackerKey } from './versions.ts';

export interface Alpha { name: string; n: number; lastModified: string }
export interface PublishRun { runId: number; headSha: string; conclusion: string | null; start: number; end: number }
export interface ThemeTarget { url: string; name: string; version: string; n: number; headSha: string }

export function parseBlobList(xml: string, pkgName: string, version: string): { alphas: Alpha[]; next: string | null } {
  const re = new RegExp(`^${escRe(pkgName)}-${escRe(version)}-alpha\\.(\\d+)\\.zip$`); // a longer suffix is a feature-branch build
  const alphas: Alpha[] = [];
  for (const b of xml.matchAll(/<Blob>([\s\S]*?)<\/Blob>/g)) {
    const name = /<Name>([^<]+)<\/Name>/.exec(b[1])?.[1], lm = /<Last-Modified>([^<]+)<\/Last-Modified>/.exec(b[1])?.[1];
    const m = name ? re.exec(name) : null;
    if (m && lm) alphas.push({ name: name!, n: +m[1], lastModified: lm });
  }
  return { alphas: alphas.sort((a, b) => b.n - a.n), next: /<NextMarker>([^<]+)<\/NextMarker>/.exec(xml)?.[1] ?? null };
}

/** EVERY run (one entry per run id) whose publish-step window contains the alpha's Last-Modified. */
export function matchRun(a: Alpha, runs: PublishRun[]): PublishRun[] {
  const t = Date.parse(a.lastModified);
  const hit = runs.filter((r) => t >= r.start && t <= r.end);
  return hit.filter((r, i) => hit.findIndex((x) => x.runId === r.runId) === i);
}

export function themePinKind(url: string, pkgName: string): { kind: 'release' | 'alpha' | 'branch-alpha' | 'pr' | 'unknown'; version?: string; n?: number; pr?: number; branch?: string } {
  const file = decodeURIComponent(url.split('/').pop() ?? '');
  const p = escRe(pkgName);
  let m: RegExpExecArray | null;
  if (/\/releases\/download\//.test(url) && (m = /-(\d+\.\d+\.\d+)\.zip$/.exec(file))) return { kind: 'release', version: m[1] };
  if ((m = new RegExp(`^${p}-(\\d+\\.\\d+\\.\\d+)-pr-(\\d+)`).exec(file))) return { kind: 'pr', version: m[1], pr: +m[2] };
  if ((m = new RegExp(`^${p}-(\\d+\\.\\d+\\.\\d+)-alpha\\.(\\d+)\\.zip$`).exec(file))) return { kind: 'alpha', version: m[1], n: +m[2] };
  if ((m = new RegExp(`^${p}-(\\d+\\.\\d+\\.\\d+)-alpha\\.(\\d+)-(.+)\\.zip$`).exec(file))) return { kind: 'branch-alpha', version: m[1], n: +m[2], branch: m[3] };
  return { kind: 'unknown' };
}

export async function resolveThemeTarget(http: Http, repo: string, blobBase: string, workflowFile: string): Promise<{ target: ThemeTarget | null; pkgName: string; version: string; notes: string[] }> {
  const info = await http.gh(`/repos/${repo}`);
  const branch = String(info?.default_branch ?? 'dev');
  const file = await http.gh(`/repos/${repo}/contents/package.json?ref=${encodeURIComponent(branch)}`);
  if (!file?.content) throw new Error(`theme: cannot read ${repo}/package.json@${branch}`);
  const pkg = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
  const pkgName = String(pkg.name), version = String(pkg.version);
  const alphas: Alpha[] = [];
  for (let marker: string | null = '', i = 0; marker !== null && i < 20; i++) {
    const xml = await http.getText(`${blobBase}?restype=container&comp=list&prefix=${encodeURIComponent(`${pkgName}-${version}-alpha.`)}${marker ? `&marker=${encodeURIComponent(marker)}` : ''}`);
    if (xml == null) throw new Error(`theme: blob listing failed at ${blobBase}`);
    const page = parseBlobList(xml, pkgName, version);
    alphas.push(...page.alphas);
    marker = page.next;
  }
  alphas.sort((a, b) => b.n - a.n);
  const notes: string[] = [];
  const runs: PublishRun[] = [];
  const commits = await http.ghAll(`/repos/${repo}/commits?sha=${encodeURIComponent(branch)}`, 2);
  let ci = 0;
  /** Load the next (older) commit's publish steps; returns the ones it added. */
  const loadNext = async (): Promise<PublishRun[]> => {
    const sha = String(commits[ci++].sha), added: PublishRun[] = [];
    for (const r of (await http.gh(`/repos/${repo}/actions/runs?head_sha=${sha}&per_page=20`))?.workflow_runs ?? []) {
      if (!String(r.path ?? '').endsWith(workflowFile) || r.event !== 'push' || r.head_branch !== branch) continue;
      for (const j of (await http.gh(`/repos/${repo}/actions/runs/${r.id}/jobs?per_page=100`))?.jobs ?? []) {
        for (const s of j.steps ?? []) {
          if (/publish.*blob/i.test(String(s.name)) && s.started_at && s.completed_at) {
            added.push({ runId: r.id, headSha: r.head_sha, conclusion: r.conclusion, start: Date.parse(s.started_at), end: Date.parse(s.completed_at) });
          }
        }
      }
    }
    runs.push(...added);
    return added;
  };
  for (const a of alphas) {
    const t = Date.parse(a.lastModified);
    while (!matchRun(a, runs).length && ci < commits.length) await loadNext();
    // A run of an OLDER commit can still be publishing at the same moment (concurrent pushes): keep
    // loading until a commit's publish steps all ended before this alpha — only then is the match set complete.
    if (matchRun(a, runs).length) while (ci < commits.length) { const got = await loadNext(); if (got.length && got.every((r) => r.end < t)) break; }
    const matched = matchRun(a, runs);
    if (!matched.length) { notes.push(`${a.name}: no ${workflowFile} publish step found for it`); continue; }
    const ids = matched.map((r) => r.runId).join(', ');
    if (new Set(matched.map((r) => r.conclusion)).size > 1) {
      notes.push(`${a.name}: ambiguous — publish windows of runs ${ids} overlap with different conclusions`);
      continue;
    }
    // A red run can still have published (it failed after the publish step): such an alpha exists but is never the target.
    // All matched runs agree here. If they are green, take the OLDEST commit's (runs load newest-first),
    // so a "PR is in the target" ancestry check against headSha can only under-claim, never over-claim.
    const run = matched[matched.length - 1];
    if (run.conclusion === 'success') return { target: { url: `${blobBase}/${a.name}`, name: a.name, version, n: a.n, headSha: run.headSha }, pkgName, version, notes };
    notes.push(`${a.name}: run${matched.length > 1 ? 's' : ''} ${ids} concluded ${run.conclusion} — not a target`);
  }
  return { target: null, pkgName, version, notes };
}

export async function classifyTheme(http: Http, repo: string, currentUrl: string | null, t: { target: ThemeTarget | null; pkgName: string; version: string }): Promise<Row> {
  const file = (u: string) => decodeURIComponent(u.split('/').pop() ?? u);
  const row: Row = { component: 'Theme', kind: 'theme', current: currentUrl ? file(currentUrl) : 'absent', latest: t.target ? t.target.name : null, status: 'EQUAL', note: '' };
  if (!t.target) return { ...row, status: 'NO_RELEASE', note: `no green ${t.version} dev alpha` };
  if (!currentUrl) return { ...row, status: 'NOT_IN_FEED', note: 'theme file has no recognisable URL' };
  const target = t.target;
  const change = (status: Change['status']): Change => ({ component: 'Theme', kind: 'theme', from: currentUrl, to: target.url, mode: 'theme', status, deps: [], assetUrl: target.url, assetOk: false });
  const k = themePinKind(currentUrl, t.pkgName);
  const ask = (note: string, extra: Partial<Row> = {}): Row => ({ ...row, status: 'PRERELEASE?', note, replace: change('PRERELEASE→RELEASE'), ...extra });
  if (k.kind === 'release') return cmpVersion(k.version!, target.version) >= 0
    ? { ...row, status: 'AHEAD', note: `release ${k.version} ≥ dev ${target.version} — never downgraded to an alpha` }
    : { ...row, status: 'BEHIND', change: change('BEHIND') };
  if (k.kind === 'alpha') {
    const d = cmpVersion(k.version!, target.version) || Math.sign(k.n! - target.n);
    return d === 0 ? row : d > 0 ? { ...row, status: 'AHEAD', note: 'newer alpha than the target (its run was not green) — kept' } : { ...row, status: 'BEHIND', change: change('BEHIND') };
  }
  if (k.kind === 'pr') {
    const p = await http.gh(`/repos/${repo}/pulls/${k.pr}`);
    const key = trackerKey(p?.title);
    if (p?.merged_at) {
      const c = await http.gh(`/repos/${repo}/compare/${p.merge_commit_sha}...${target.headSha}`);
      if (c && (c.status === 'ahead' || c.status === 'identical')) return { ...row, status: 'PRERELEASE→RELEASE', note: `PR #${k.pr} is in ${target.name}`, prUrl: p.html_url, trackerKey: key, change: change('PRERELEASE→RELEASE') };
    }
    return ask(p ? (p.merged_at ? 'merged, not in the target alpha' : `PR ${p.state}`) : `PR #${k.pr} not found`, { prUrl: p?.html_url, trackerKey: key });
  }
  if (k.kind === 'branch-alpha') return ask(`feature branch \`${k.branch}\``, { trackerKey: trackerKey(k.branch) });
  return ask('unrecognised theme URL');
}
