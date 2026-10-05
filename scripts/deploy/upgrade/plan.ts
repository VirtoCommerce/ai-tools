// scripts/deploy/upgrade/plan.ts — build the plan (network, read-only), then finalize/render (pure).
import type { EnvCoords } from '../lib/env.ts';
import type { Http } from '../lib/github.ts';
import { enc, fetchFile } from '../lib/github.ts';
import { THEME_URL_RE } from '../lib/manifest.ts';
import { getAdminToken, liveModules } from '../lib/live.ts';
import { blobBase, readPins } from '../lib/pins.ts';
import { classifyModule, classifyPlatform } from './classify.ts';
import type { FeedEntry } from './feed.ts';
import { classifyTheme, resolveThemeTarget } from './theme.ts';
import { resolveEndState } from './checks.ts';
import type { Dropped, Requires } from './checks.ts';
import type { Change, Decision, Decisions, QuestionGroup, Row, UpgradePlan } from './types.ts';

export interface RepoMap { platformRepo: string; themeRepo: string; modules: Record<string, string> }
const full = (bare: string) => (bare.includes('/') ? bare : `VirtoCommerce/${bare}`);

/** HEAD 200 anonymously — the deploy downloads without a token, and one 404 rolls back the whole install. */
async function checkAsset(http: Http, c: Change, platformImage: string | undefined, platformRepo: string): Promise<void> {
  if (c.kind === 'platform') {
    const zip = `https://github.com/${platformRepo}/releases/download/${c.to}/VirtoCommerce.Platform.${c.to}.zip`;
    c.assetUrl = zip;
    const zipOk = (await http.head(zip)).status === 200;
    let imgOk = true;
    if (platformImage) {
      const path = platformImage.replace(/^ghcr\.io\//, '');
      const tok = (await http.getJson(`https://ghcr.io/token?scope=repository:${path}:pull`))?.token;
      imgOk = !!tok && (await http.head(`https://ghcr.io/v2/${path}/manifests/${c.to}`, {
        Authorization: `Bearer ${tok}`,
        Accept: 'application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json',
      })).status === 200;
    }
    c.assetOk = zipOk && imgOk;
    if (!c.assetOk) c.assetNote = [!zipOk && 'platform zip', !imgOk && `image ${platformImage}:${c.to}`].filter(Boolean).join(' + ');
    return;
  }
  c.assetOk = (await http.head(c.assetUrl)).status === 200;
}

/** A theme URL's file name, decoded — the theme target is an alpha blob, never a release. */
const fileOf = (url: string) => decodeURIComponent(url.split('/').pop() ?? url);

export function groupQuestions(rows: Row[]): QuestionGroup[] {
  const groups = new Map<string, Row[]>();
  for (const r of rows) {
    const asked = r.status === 'PRERELEASE?';
    const companion = r.status === 'NOT_IN_FEED' && r.trackerKey; // shown in the group, never changed
    if (!asked && !companion) continue;
    const key = r.trackerKey ?? r.component;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  return [...groups].filter(([, rs]) => rs.some((r) => r.status === 'PRERELEASE?')).map(([key, rs]) => ({
    key,
    components: rs.filter((r) => r.status === 'PRERELEASE?').map((r) => r.component),
    // A downgrade is never the one-click recommendation: the operator has to choose it on purpose.
    recommended: !rs.some((r) => r.downgrade) && rs.every((r) => r.status !== 'PRERELEASE?' || /closed unmerged/.test(r.note)) ? 'replace' : 'keep',
    lines: rs.map((r) => r.replace
      ? `${r.component}: ${r.current} → ${r.kind === 'theme' ? `green dev alpha ${fileOf(r.replace.to)}` : `release ${r.replace.to}`}${r.downgrade ? ' (DOWNGRADE)' : ''} — ${r.note}${r.prUrl ? ` ${r.prUrl}` : ''}`
      : `${r.component}: ${r.current} — ${r.status}, stays as is${r.prUrl ? ` ${r.prUrl}` : ''}`),
  }));
}

export async function buildPlan(c: EnvCoords, http: Http, opts: { repoMap: RepoMap; feedUrl: string; themeWorkflow: string; now: Date }): Promise<UpgradePlan> {
  const repoFull = `${c.deployOwner}/${c.deployRepo}`;
  if (!(await http.gh(`/repos/${repoFull}/branches/${encodeURIComponent(c.branch)}`))) {
    throw new Error(`branch ${repoFull}@${c.branch} not found for env "${c.env}" (tried DEPLOY_BRANCH, BRANCH_MAP, then the env name with _→-)`);
  }
  const openUpgradePrs = (await http.ghAll(`/repos/${repoFull}/pulls?state=open&base=${encodeURIComponent(c.branch)}`))
    .filter((p: any) => String(p.head?.ref ?? '').startsWith('env-upgrade-'))
    .map((p: any) => ({ number: p.number, url: p.html_url, head: p.head.ref }));
  const pkg = await fetchFile(c, c.packagesPath);
  const notes: string[] = [];
  // Only a 404 means "this env has no theme file"; any other failure (rate limit, network) stops the plan
  // rather than silently dropping the Theme row.
  const themeJ = await http.gh(`/repos/${repoFull}/contents/${enc(c.themePath)}?ref=${encodeURIComponent(c.branch)}`);
  const theme = themeJ?.content ? { text: Buffer.from(themeJ.content, 'base64').toString('utf8') } : null;
  if (!theme) notes.push(`no ${c.themePath} on ${c.branch} — the theme is not checked`);
  const feedArr = await http.getJson(opts.feedUrl);
  if (!Array.isArray(feedArr)) throw new Error(`module feed unreadable: ${opts.feedUrl}`);
  const feed = new Map<string, FeedEntry>(feedArr.map((e: FeedEntry) => [e.Id, e]));
  const platformRepo = full(opts.repoMap.platformRepo), themeRepo = full(opts.repoMap.themeRepo);
  const latestRel = await http.gh(`/repos/${platformRepo}/releases/latest`);
  if (!latestRel?.tag_name) throw new Error(`no latest release on ${platformRepo}`);
  const platformLatest = String(latestRel.tag_name).replace(/^v/, '');

  const base = blobBase(pkg.json);
  const privacy = new Map<string, boolean>();
  const ctx = {
    http, feed, blobBase: base,
    repoOf: (id: string) => (opts.repoMap.modules[id] ? full(opts.repoMap.modules[id]) : /github\.com\/([^/]+\/[^/]+)/.exec(feed.get(id)?.ProjectUrl ?? '')?.[1] ?? null),
    // Unknown visibility (404 to this token) counts as private: keeping a pin in AzureBlob never 404s the deploy.
    isPrivate: async (repo: string) => { if (!privacy.has(repo)) privacy.set(repo, (await http.gh(`/repos/${repo}`))?.private !== false); return privacy.get(repo)!; },
  };
  const { pins, duplicates } = readPins(pkg.json);
  const rows: Row[] = [await classifyPlatform(pkg.json, platformLatest, platformRepo, http)];
  for (const p of pins) rows.push(await classifyModule(p, duplicates.includes(p.id), ctx));
  if (theme) {
    const t = await resolveThemeTarget(http, themeRepo, base, opts.themeWorkflow);
    notes.push(...t.notes);
    rows.push(await classifyTheme(http, themeRepo, THEME_URL_RE.exec(theme.text)?.[0] ?? null, t));
  }
  for (const r of rows) for (const c of [r.change, r.replace]) if (c) await checkAsset(http, c, pkg.json.PlatformImage, platformRepo);

  let live: Record<string, string> | null = null;
  const token = c.backUrl ? await getAdminToken(c) : null;
  if (token) live = await liveModules(c, token);
  return {
    schema: 1, env: c.env, deployOwner: c.deployOwner, deployRepo: c.deployRepo, branch: c.branch,
    packagesPath: c.packagesPath, themePath: c.themePath, fetchedAt: opts.now.toISOString(), feedUrl: opts.feedUrl, platformLatest,
    snapshot: { packages: pkg.text, theme: theme?.text ?? null },
    rows, questions: groupQuestions(rows), openUpgradePrs, live, notes,
  };
}

export interface Finalized { accepted: Change[]; dropped: Dropped[]; passes: number; approved: Set<string>; kept: Row[] }

export function finalize(plan: UpgradePlan, decisions: Decisions): Finalized {
  const valid = (d: unknown): d is Decision => d === 'keep' || d === 'replace';
  if (decisions === null || typeof decisions !== 'object' || Array.isArray(decisions)) {
    throw new Error('decisions: must be a JSON object { "<group key>": "keep" | "replace" | { "<component>": "keep" | "replace" } }');
  }
  for (const [key, d] of Object.entries(decisions)) {
    const g = plan.questions.find((q) => q.key === key);
    if (!g) throw new Error(`decisions: unknown group "${key}" (groups: ${plan.questions.map((q) => q.key).join(', ') || 'none'})`);
    if (typeof d === 'string') { if (!valid(d)) throw new Error(`decisions["${key}"]: must be "keep" or "replace"`); continue; }
    if (d === null || typeof d !== 'object' || Array.isArray(d) || Object.keys(d).length === 0) {
      throw new Error(`decisions["${key}"]: must be "keep" or "replace", or a non-empty { component: "keep"|"replace" } object`);
    }
    for (const [comp, v] of Object.entries(d)) {
      if (!g.components.includes(comp)) throw new Error(`decisions["${key}"]: "${comp}" is not in group ${key}`);
      if (!valid(v)) throw new Error(`decisions["${key}"]["${comp}"]: must be "keep" or "replace"`);
    }
  }
  const decisionFor = (r: Row): Decision => {
    const g = plan.questions.find((q) => q.components.includes(r.component));
    const d = g ? decisions[g.key] : undefined;
    return d === undefined ? 'keep' : typeof d === 'string' ? d : d[r.component] ?? 'keep';
  };
  const proposed: Change[] = [], approved = new Set<string>(), kept: Row[] = [];
  for (const r of plan.rows) {
    if (r.change) proposed.push(r.change);
    else if (r.status === 'PRERELEASE?' && r.replace) {
      if (decisionFor(r) === 'replace') { proposed.push(r.replace); approved.add(r.component); } else kept.push(r);
    }
  }
  const current = new Map(plan.rows.filter((r) => r.kind !== 'theme').map((r) => [r.component, r.kind === 'platform' ? r.current.split(' ')[0] : r.current]));
  const atLatest = new Set(plan.rows.filter((r) => r.status === 'EQUAL').map((r) => r.component));
  const requires = new Map<string, Requires>(plan.rows.filter((r) => r.currentDeps).map((r) => [r.component, { deps: r.currentDeps!, platformFloor: r.currentPlatformFloor }]));
  const res = resolveEndState(current, proposed, atLatest, requires);
  return { ...res, approved, kept };
}

/** The theme target is a green dev alpha, never a release — label it so at render time. */
const THEME_LABEL = '→ GREEN DEV ALPHA';

const statusOrder = (r: Row, f: Finalized): number =>
  r.kind === 'platform' ? 0 : f.accepted.some((c) => c.component === r.component) ? 1 : (f.kept.includes(r) || r.status === 'AHEAD') ? 2 : f.dropped.some((d) => d.change.component === r.component) ? 3 : 4;

export function renderTable(plan: UpgradePlan, f: Finalized): string {
  const out = [`Env: ${plan.env} · ${plan.deployOwner}/${plan.deployRepo}@${plan.branch} · feed fetched ${plan.fetchedAt} · platform latest ${plan.platformLatest}`, '',
    '| Component | On env | Live | Target | Status | Action / note |', '|---|---|---|---|---|---|'];
  const equal = plan.rows.filter((r) => r.status === 'EQUAL' && r.kind !== 'platform');
  const shown = plan.rows.filter((r) => !equal.includes(r)).sort((a, b) => statusOrder(a, f) - statusOrder(b, f) || a.component.localeCompare(b.component));
  for (const r of shown) {
    const acc = f.accepted.find((c) => c.component === r.component);
    const drop = f.dropped.find((d) => d.change.component === r.component);
    const status = drop ? drop.status : acc && r.kind === 'theme' ? THEME_LABEL : acc && f.approved.has(r.component) ? 'PRERELEASE→RELEASE' : r.status;
    const approved = f.approved.has(r.component) ? (r.downgrade ? ' (you approved, DOWNGRADE)' : ' (you approved)') : '';
    const action = acc ? `→ ${r.kind === 'theme' ? acc.to.split('/').pop() : acc.to}${approved}`
      : drop ? `${f.approved.has(r.component) ? `you approved → ${r.kind === 'theme' ? 'green dev alpha' : 'release'}; ` : ''}blocked: ${drop.reason}` : r.note || '—';
    const live = r.kind === 'module' ? (plan.live?.[r.component.toLowerCase()] ?? '?') : '—';
    out.push(`| ${r.component} | ${r.current} | ${live} | ${r.latest ?? '—'} | ${status} | ${action} |`);
  }
  out.push('', `${equal.length} other module${equal.length === 1 ? '' : 's'} already match.`);
  const equalCount = plan.rows.filter((r) => r.status === 'EQUAL').length;
  out.push(`${f.accepted.length} to change · ${equalCount} equal · ${f.kept.length} kept · ${f.dropped.length} blocked`);
  out.push(`Checks (${f.passes} pass${f.passes === 1 ? '' : 'es'}): ${['BLOCKED_ASSET', 'PLATFORM_FLOOR', 'DEP_CONFLICT', 'COUPLED'].map((s) => `${s} ${f.dropped.filter((d) => d.status === s).length}`).join(' · ')}`);
  if (plan.notes.length) out.push('', ...plan.notes.map((n) => `note: ${n}`));
  return out.join('\n');
}

/** What the change moves to, in words: the theme's target is an alpha, so "latest releases" alone would call it one. */
const goal = (f: Finalized): string => (f.accepted.some((c) => c.kind === 'theme') ? 'latest releases + green theme alpha' : 'latest releases');

export function renderCommitMessage(plan: UpgradePlan, f: Finalized, trailers: string[]): { title: string; message: string } {
  const n = f.accepted.length;
  const title = `${plan.env}: upgrade to ${goal(f)} (${n} component${n === 1 ? '' : 's'})`;
  const down = (c: { component: string }) => f.approved.has(c.component) && plan.rows.some((r) => r.component === c.component && r.downgrade);
  const lines = f.accepted.map((c) => `- ${c.component}: ${c.kind === 'theme' ? c.from.split('/').pop() : c.from} → ${c.kind === 'theme' ? c.to.split('/').pop() : c.to}${down(c) ? ' (DOWNGRADE, operator approved)' : ''}`);
  return { title, message: [title, '', ...lines, ...(trailers.length ? ['', ...trailers] : [])].join('\n') };
}

export function renderPrBody(plan: UpgradePlan, f: Finalized, footer: string): string {
  const changed = f.accepted.map((c) => {
    const r = plan.rows.find((x) => x.component === c.component)!;
    return `| ${c.component} | ${r.current} | ${c.kind === 'theme' ? c.to.split('/').pop() : c.to} | ${c.kind === 'theme' ? THEME_LABEL : c.status}${r.prUrl ? ` — ${r.prUrl}` : ''}${f.approved.has(c.component) ? (r.downgrade ? ' (operator approved, DOWNGRADE)' : ' (operator approved)') : ''} |`;
  });
  const keptRows = [
    ...f.kept.map((r) => `| ${r.component} | ${r.current} | kept on purpose — ${r.note}${r.prUrl ? ` ${r.prUrl}` : ''} |`),
    ...f.dropped.map((d) => `| ${d.change.component} | ${d.change.from} | ${d.status}: ${d.reason} |`),
  ];
  // Rows this tool never changes — a reviewer still needs to see them (a DUPLICATE is theirs to fix by hand).
  const leftRows = plan.rows.filter((r) => ['AHEAD', 'DUPLICATE', 'NOT_IN_FEED', 'NO_RELEASE'].includes(r.status))
    .map((r) => `| ${r.component} | ${r.current} | ${r.status}${r.note ? ` — ${r.note}` : ''}${r.prUrl ? ` ${r.prUrl}` : ''} |`);
  const equal = plan.rows.filter((r) => r.status === 'EQUAL').length;
  return [
    `Upgrade **${plan.env}** (\`${plan.branch}\`) to the ${goal(f)}. Feed fetched ${plan.fetchedAt}; platform latest ${plan.platformLatest}.`, '',
    '### Changed', '', '| Component | Was | Now | Why |', '|---|---|---|---|', ...changed, '',
    ...(keptRows.length ? ['### Kept on purpose', '', '| Component | On env | Reason |', '|---|---|---|', ...keptRows, ''] : []),
    ...(leftRows.length ? ['### Not changed by this tool', '', '| Component | On env | Why |', '|---|---|---|', ...leftRows, ''] : []),
    `The other ${equal} component(s) already match. Checks ran to a fixed point in ${f.passes} pass(es).`, '',
    '**A human merges this PR; the merge triggers the deploy.** Right after it the env can serve the OLD build for a minute or two —',
    'check `/api/platform/modules` only after the deploy Action is green **and** the versions have actually changed.',
    ...(footer ? ['', footer] : []),
  ].join('\n');
}
