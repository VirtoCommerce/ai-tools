/**
 * bundle-version-check.ts
 *
 * Given a URL to a VirtoCommerce stable bundle `package.json` (e.g.
 * https://github.com/VirtoCommerce/vc-modules/blob/master/bundles/v12/package.json),
 * checks every pinned module — plus the Platform and Theme — for a NEWER hotfix
 * release on the SAME major.minor line.
 *
 *   "Is Assets 3.815.1 the latest 3.815.x, or has 3.815.2 shipped?"
 *
 * It does NOT flag newer minor lines: a stable bundle is intentionally frozen to
 * one Platform generation (v12 → Platform 3.917.x), so a higher minor on master
 * is expected and is not a hotfix. The relevant question is same-line patches.
 *
 * Source of truth for "latest patch on a line" is GitHub releases/tags, probed
 * cheaply by tag existence (pinned+1, pinned+2, … until 404) — not modules_v3.json,
 * which does not list hotfix versions reliably.
 *
 * Usage:
 *   npx tsx scripts/bundle-version-check.ts <bundle-url> [options]
 *
 * Options:
 *   --json            Emit machine-readable JSON instead of the table.
 *   --no-platform     Skip the Platform (vc-platform) check.
 *   --no-theme        Skip the Theme (vc-frontend) check.
 *   --concurrency=N   Parallel GitHub probes (default 8).
 *
 * Exit codes:
 *   0  every pinned version is the latest patch on its line  (CI green)
 *   1  at least one same-line hotfix is available            (CI gate trips)
 *   2  tool error: bad URL, unresolved repo, GitHub auth/rate-limit failure
 *
 * Auth: reads GIT_TOKEN (fallback GITHUB_TOKEN / GITHUB_PERSONAL_ACCESS_TOKEN)
 * from .env.local / .env.defaults / process.env. Runs unauthenticated if absent,
 * but the GitHub API then caps at 60 req/h and the run will likely rate-limit.
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { parse as parseDotenv } from 'dotenv';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const OWNER = 'VirtoCommerce';
const MAX_PATCH_PROBE = 30; // safety cap on how far above the pinned patch we probe
// Short bundle names (e.g. "v12", "v14") expand to this template; override the branch via BUNDLE_REF.
const BUNDLES_BASE = `https://github.com/VirtoCommerce/vc-modules/blob/${process.env.BUNDLE_REF || 'master'}/bundles`;
const JIRA_BASE = (process.env.JIRA_BASE_URL || 'https://virtocommerce.atlassian.net').replace(/\/$/, '');
// JIRA issue keys: PROJECT-NUMBER (e.g. VCST-4932, VP-9195, PT-1234). Tightened to
// avoid matching .NET identifiers — project key is 2–10 upper-alnum, must start with a letter.
const JIRA_KEY_RE = /\b([A-Z][A-Z0-9]{1,9}-\d+)\b/g;

// ── types ────────────────────────────────────────────────────────────────────
interface Target {
  name: string; // display name
  id: string; // bundle Id (or "Platform" / "Theme")
  kind: 'module' | 'platform' | 'theme';
  pinned: string; // full version string
  repo: string | null; // resolved GitHub repo (null = unresolved)
}
interface Result extends Target {
  line: string; // "3.815"
  highest: string | null; // highest patch found on the line
  status: 'current' | 'hotfix' | 'unresolved' | 'line-missing';
  note?: string;
  traces?: VersionTrace[]; // provenance for each new patch above the pinned one (hotfixes only)
}
interface PrRef { number: number; title: string; url: string; taskKeys: string[]; taskUrls: string[]; }
interface VersionTrace { version: string; date: string | null; releaseUrl: string | null; prs: PrRef[]; commitTaskKeys?: string[]; source?: 'release-notes' | 'commit-compare'; }
interface SemVer { major: number; minor: number; patch: number; }

// ── env / token ───────────────────────────────────────────────────────────────
function loadToken(): string | undefined {
  // Layered, lightweight — we intentionally do NOT import config.js (it runs the
  // full required-var validator and exits if a test var is missing).
  for (const f of ['.env.defaults', '.env.local']) {
    const p = resolve(REPO_ROOT, f);
    if (existsSync(p)) {
      const vars = parseDotenv(readFileSync(p));
      for (const [k, v] of Object.entries(vars)) if (!process.env[k]) process.env[k] = v;
    }
  }
  return process.env.GIT_TOKEN || process.env.GITHUB_TOKEN || process.env.GITHUB_PERSONAL_ACCESS_TOKEN;
}

// ── version parsing ─────────────────────────────────────────────────────────
function parseSemVer(v: string): SemVer | null {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(v.trim());
  if (!m) return null;
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}
const lineOf = (s: SemVer) => `${s.major}.${s.minor}`;
const tagOf = (s: SemVer, patch: number) => `${s.major}.${s.minor}.${patch}`;

// ── bundle URL → raw ──────────────────────────────────────────────────────────
function toRawUrl(url: string): string {
  // github.com/{o}/{r}/blob/{ref}/{path}  →  raw.githubusercontent.com/{o}/{r}/{ref}/{path}
  const blob = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/(.+)$/.exec(url);
  if (blob) return `https://raw.githubusercontent.com/${blob[1]}/${blob[2]}/${blob[3]}`;
  return url; // already raw, or some other host — fetch as-is
}

// ── repo resolution ─────────────────────────────────────────────────────────
interface RepoMap {
  platformRepo: string;
  themeRepo: string;
  modules: Record<string, string>;
}
function loadRepoMap(): RepoMap {
  const p = resolve(REPO_ROOT, 'config/module-repo-map.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}
function kebab(bare: string): string {
  return bare.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2').toLowerCase();
}
/** Candidate repo names for an unmapped module Id, most-conventional first. VC repo names are
 * irregular (drop "Module", singular, collapsed casing), so we generate several and verify. */
function repoCandidates(id: string): string[] {
  const bare = id.replace(/^VirtoCommerce\./, '');
  const k = kebab(bare);
  const collapsed = bare.toLowerCase();
  const cands = new Set<string>();
  const add = (s: string) => s && cands.add(`vc-module-${s}`);
  add(k); // application-insights
  add(k.replace(/-module$/, '')); // bulk-actions  (BulkActionsModule)
  add(collapsed); // pagebuilder  (PageBuilderModule)
  add(collapsed.replace(/module$/, ''));
  add(k.replace(/s$/, '')); // contract  (Contracts)
  add(k.replace(/-module$/, '').replace(/s$/, ''));
  return [...cands];
}
/** Resolve an unmapped module by probing candidates: a candidate is correct iff the bundle's
 * pinned tag exists in it (proves both the repo AND the version line in one call). */
async function autoResolveRepo(id: string, pinnedFull: string): Promise<string | null> {
  for (const repo of repoCandidates(id)) {
    if (await tagExists(repo, pinnedFull)) return repo;
  }
  return null;
}

// ── GitHub API ────────────────────────────────────────────────────────────────
let TOKEN: string | undefined;
function ghHeaders(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'vc-bundle-version-check',
  };
  if (TOKEN) h.Authorization = `Bearer ${TOKEN}`;
  return h;
}
/** Returns true if the git tag ref exists, false if 404. Throws on rate-limit/other. */
async function tagExists(repo: string, tag: string): Promise<boolean> {
  const url = `https://api.github.com/repos/${OWNER}/${repo}/git/ref/tags/${encodeURIComponent(tag)}`;
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 200) return true;
  if (res.status === 404) return false;
  if (res.status === 403 || res.status === 429) {
    const remaining = res.headers.get('x-ratelimit-remaining');
    throw new Error(
      `GitHub rate-limited (HTTP ${res.status}, remaining=${remaining}). ` +
        (TOKEN ? 'Wait for the limit to reset.' : 'Set GIT_TOKEN in .env.local to raise the limit to 5000/h.')
    );
  }
  throw new Error(`GitHub API error for ${repo}@${tag}: HTTP ${res.status}`);
}
async function repoExists(repo: string): Promise<boolean> {
  const res = await fetch(`https://api.github.com/repos/${OWNER}/${repo}`, { headers: ghHeaders() });
  return res.status === 200;
}

/** Find the highest patch that exists on the pinned line (>= pinned). */
async function highestOnLine(repo: string, pinned: SemVer): Promise<{ highest: SemVer | null; lineMissing: boolean }> {
  // Confirm the pinned tag itself exists — a sanity check on the mapping/line.
  const pinnedExists = await tagExists(repo, tagOf(pinned, pinned.patch));
  if (!pinnedExists) {
    // Pinned tag absent: either wrong repo or the line was never tagged. Distinguish.
    if (!(await repoExists(repo))) return { highest: null, lineMissing: true };
    return { highest: null, lineMissing: true };
  }
  let highest = pinned.patch;
  for (let n = pinned.patch + 1; n <= pinned.patch + MAX_PATCH_PROBE; n++) {
    if (await tagExists(repo, tagOf(pinned, n))) highest = n;
    else break;
  }
  return { highest: { ...pinned, patch: highest }, lineMissing: false };
}

// ── hotfix provenance: tag → release → PR → JIRA task ─────────────────────────
async function ghJson(url: string): Promise<any | null> {
  const res = await fetch(url, { headers: ghHeaders() });
  if (res.status === 404) return null;
  if (res.status === 403 || res.status === 429) throw new Error(`GitHub rate-limited (HTTP ${res.status}) while tracing`);
  if (!res.ok) throw new Error(`GitHub API error ${res.status} for ${url}`);
  return res.json();
}
function extractTaskKeys(...texts: (string | null | undefined)[]): string[] {
  const keys = new Set<string>();
  for (const t of texts) {
    if (!t) continue;
    for (const m of t.matchAll(JIRA_KEY_RE)) keys.add(m[1]);
  }
  return [...keys];
}
/** Fetch the PR, pull its title/branch/body, and extract any JIRA task keys. */
async function resolvePr(repo: string, num: number): Promise<PrRef> {
  const pr = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/pulls/${num}`);
  const title = pr?.title ?? '';
  const taskKeys = pr ? extractTaskKeys(pr.title, pr.head?.ref, pr.body) : [];
  return {
    number: num,
    title,
    url: pr?.html_url ?? `https://github.com/${OWNER}/${repo}/pull/${num}`,
    taskKeys,
    taskUrls: taskKeys.map((k) => `${JIRA_BASE}/browse/${k}`),
  };
}
/** For one tag: read the release notes, find the PR(s) that produced it, resolve their tasks.
 * Falls back to diffing prevTag..tag and scanning commit messages when the release has no notes. */
async function traceVersionBump(repo: string, tag: string, prevTag: string): Promise<VersionTrace> {
  const rel = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  const body: string = rel?.body ?? '';
  // VC release notes reference PRs either as ".../pull/<n>" (auto-generated) or as a
  // bare "(#<n>)" in the changelog HTML — catch both.
  const prNums = new Set<number>();
  for (const m of body.matchAll(/\/pull\/(\d+)/g)) prNums.add(+m[1]);
  for (const m of body.matchAll(/#(\d+)\b/g)) prNums.add(+m[1]);

  if (prNums.size) {
    const prs = await Promise.all([...prNums].sort((a, b) => a - b).map((n) => resolvePr(repo, n)));
    return { version: tag, date: rel?.published_at ?? null, releaseUrl: rel?.html_url ?? null, prs, source: 'release-notes' };
  }

  // Fallback: no PR in the release body (e.g. theme releases have null notes). Diff the
  // previous tag against this one and mine commit messages for PR refs + task keys.
  const cmp = await ghJson(`https://api.github.com/repos/${OWNER}/${repo}/compare/${encodeURIComponent(prevTag)}...${encodeURIComponent(tag)}`);
  const commitTaskKeys = new Set<string>();
  for (const c of cmp?.commits ?? []) {
    const msg: string = c?.commit?.message ?? '';
    for (const m of msg.matchAll(/(?:^|[\s(])#(\d+)\b/g)) prNums.add(+m[1]);
    for (const k of extractTaskKeys(msg)) commitTaskKeys.add(k);
  }
  const prs = await Promise.all([...prNums].sort((a, b) => a - b).map((n) => resolvePr(repo, n)));
  // PR-derived task keys subsume commit ones; only surface commit keys not already covered.
  const fromPrs = new Set(prs.flatMap((p) => p.taskKeys));
  const extra = [...commitTaskKeys].filter((k) => !fromPrs.has(k));
  return { version: tag, date: rel?.published_at ?? null, releaseUrl: rel?.html_url ?? null, prs, commitTaskKeys: extra, source: 'commit-compare' };
}

// ── concurrency pool ────────────────────────────────────────────────────────
async function mapPool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── bundle parsing ────────────────────────────────────────────────────────────
function parseBundle(json: any, map: RepoMap, opts: { platform: boolean; theme: boolean }): Target[] {
  const targets: Target[] = [];

  // Modules: Sources[].Modules[] = { Id, Version }
  const sources: any[] = Array.isArray(json.Sources) ? json.Sources : [];
  for (const src of sources) {
    const mods: any[] = Array.isArray(src?.Modules) ? src.Modules : [];
    for (const m of mods) {
      if (!m?.Id || !m?.Version) continue;
      const repo = map.modules[m.Id] ?? null;
      targets.push({
        name: m.Id.replace(/^VirtoCommerce\./, ''),
        id: m.Id,
        kind: 'module',
        pinned: String(m.Version),
        repo,
      });
    }
  }

  if (opts.platform && json.PlatformVersion) {
    targets.push({ name: 'Platform', id: 'PlatformVersion', kind: 'platform', pinned: String(json.PlatformVersion), repo: map.platformRepo });
  }

  if (opts.theme && json.ThemeB2BVue) {
    // Version is embedded in the release-download URL: .../releases/download/2.36.0/...
    const v = /\/releases\/download\/([^/]+)\//.exec(String(json.ThemeB2BVue))?.[1];
    if (v) targets.push({ name: 'Theme (B2B Vue)', id: 'ThemeB2BVue', kind: 'theme', pinned: v, repo: map.themeRepo });
  }

  return targets;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const positional = args.filter((a) => !a.startsWith('--'));
  const bundleArg = positional[0];
  const asJson = flags.has('--json');
  const concArg = [...flags].find((f) => f.startsWith('--concurrency='));
  const concurrency = concArg ? Math.max(1, parseInt(concArg.split('=')[1], 10) || 8) : 8;

  if (!bundleArg) {
    console.error(
      'Usage: npx tsx scripts/bundle-version-check.ts <vN | bundle-url> [--json] [--no-platform] [--no-theme] [--no-trace] [--no-links|--links] [--concurrency=N]\n' +
        '  <vN>          a bundle name (e.g. v12, v14) — expands to vc-modules/bundles/<vN>/package.json\n' +
        '  <bundle-url>  a full github.com/.../blob/... or raw URL to a package.json\n' +
        'Examples:\n' +
        '  npx tsx scripts/bundle-version-check.ts v12\n' +
        '  npx tsx scripts/bundle-version-check.ts https://github.com/VirtoCommerce/vc-modules/blob/master/bundles/v14/package.json'
    );
    process.exit(2);
  }

  // Accept either a full URL or a short bundle name (v12, v14, …) → expand to the bundles template.
  const bundleUrl = /^https?:\/\//i.test(bundleArg)
    ? bundleArg
    : `${BUNDLES_BASE}/${bundleArg.replace(/^\/+|\/+$/g, '')}/package.json`;

  TOKEN = loadToken();
  if (!asJson) console.error(`[bundle-check] auth: ${TOKEN ? 'GIT_TOKEN found' : 'NONE (60 req/h limit — set GIT_TOKEN in .env.local)'}`);

  const map = loadRepoMap();

  // Fetch + parse the bundle
  const rawUrl = toRawUrl(bundleUrl);
  let bundle: any;
  try {
    const res = await fetch(rawUrl, { headers: TOKEN ? { Authorization: `Bearer ${TOKEN}`, 'User-Agent': 'vc-bundle-version-check' } : { 'User-Agent': 'vc-bundle-version-check' } });
    if (!res.ok) throw new Error(`HTTP ${res.status} for ${rawUrl}`);
    bundle = await res.json();
  } catch (e: any) {
    console.error(`[bundle-check] failed to fetch/parse bundle: ${e.message}`);
    process.exit(2);
  }

  const targets = parseBundle(bundle, map, { platform: !flags.has('--no-platform'), theme: !flags.has('--no-theme') });
  if (targets.length === 0) {
    console.error('[bundle-check] no modules found in bundle — unexpected structure.');
    process.exit(2);
  }

  // Auto-resolve modules absent from the map (the module set varies per bundle, so the map
  // always lags). Probe repo-name candidates; a hit is verified by the pinned tag existing.
  // Discovered mappings are persisted back into config/module-repo-map.json (self-healing cache).
  const unmapped = targets.filter((t) => !t.repo && t.kind === 'module');
  const autoResolved: string[] = [];
  if (unmapped.length) {
    if (!asJson) console.error(`[bundle-check] resolving ${unmapped.length} unmapped module(s) …`);
    await mapPool(unmapped, concurrency, async (t) => {
      try { t.repo = await autoResolveRepo(t.id, t.pinned); } catch { /* rate-limit surfaces during probing */ }
      if (t.repo) autoResolved.push(`${t.id} → ${t.repo}`);
    });
    // Persist newly discovered mappings so the next run is deterministic + free.
    const found = unmapped.filter((t) => t.repo);
    if (found.length) {
      try {
        const mapPath = resolve(REPO_ROOT, 'config/module-repo-map.json');
        const raw = JSON.parse(readFileSync(mapPath, 'utf8'));
        for (const t of found) raw.modules[t.id] = t.repo;
        raw.modules = Object.fromEntries(Object.entries(raw.modules).sort(([a], [b]) => a.localeCompare(b)));
        writeFileSync(mapPath, JSON.stringify(raw, null, 2) + '\n');
        if (!asJson) console.error(`[bundle-check] added to config/module-repo-map.json: ${found.map((t) => t.id).join(', ')}`);
      } catch (e: any) {
        if (!asJson) console.error(`[bundle-check] could not persist map (${e.message}) — resolved for this run only`);
      }
    }
  }

  // Probe each target.
  let probeError: string | null = null;
  const results: Result[] = await mapPool(targets, concurrency, async (t): Promise<Result> => {
    const sv = parseSemVer(t.pinned);
    if (!sv || !t.repo) {
      return { ...t, line: t.pinned, highest: null, status: 'unresolved', note: !sv ? 'unparseable version' : 'no repo' };
    }
    try {
      const { highest, lineMissing } = await highestOnLine(t.repo, sv);
      if (lineMissing) return { ...t, line: lineOf(sv), highest: null, status: 'line-missing', note: 'pinned tag not found (check repo/line)' };
      const hp = highest!.patch;
      if (hp > sv.patch) return { ...t, line: lineOf(sv), highest: tagOf(sv, hp), status: 'hotfix' };
      return { ...t, line: lineOf(sv), highest: tagOf(sv, hp), status: 'current' };
    } catch (e: any) {
      probeError = e.message;
      return { ...t, line: lineOf(sv), highest: null, status: 'unresolved', note: e.message };
    }
  });

  // ── trace provenance for each hotfix (PR → task) unless disabled ──
  const hotfixes = results.filter((r) => r.status === 'hotfix');
  if (hotfixes.length && !flags.has('--no-trace')) {
    if (!asJson) console.error(`[bundle-check] tracing ${hotfixes.length} hotfix(es) → PR → task …`);
    for (const r of hotfixes) {
      const sv = parseSemVer(r.pinned)!;
      const top = parseSemVer(r.highest!)!.patch;
      const newPatches: { tag: string; prev: string }[] = [];
      for (let n = sv.patch + 1; n <= top; n++) newPatches.push({ tag: tagOf(sv, n), prev: tagOf(sv, n - 1) });
      try {
        r.traces = await mapPool(newPatches, concurrency, (p) => traceVersionBump(r.repo!, p.tag, p.prev));
      } catch (e: any) {
        r.note = `trace failed: ${e.message}`;
      }
    }
  }

  // ── output ──
  const problems = results.filter((r) => r.status === 'unresolved' || r.status === 'line-missing');

  if (asJson) {
    console.log(JSON.stringify({ bundle: bundleArg, bundleUrl, checkedAt: new Date().toISOString(), counts: { total: results.length, hotfix: hotfixes.length, current: results.filter((r) => r.status === 'current').length, problems: problems.length }, results }, null, 2));
  } else {
    const pad = (s: string, n: number) => s.padEnd(n);
    // OSC 8 hyperlinks make the label itself clickable in modern terminals (VS Code,
    // Windows Terminal, iTerm2). Fall back to "label (url)" when not a TTY (piped/redirected)
    // or when --no-links is passed, so the URL is never lost.
    const useLinks = !flags.has('--no-links') && (flags.has('--links') || !!process.stdout.isTTY);
    const link = (label: string, url: string) =>
      useLinks ? `]8;;${url}${label}]8;;` : `${label} (${url})`;
    const nameW = Math.max(...results.map((r) => r.name.length), 8);
    console.log(`\nBundle: ${bundleArg}${/^https?:/i.test(bundleArg) ? '' : ` → ${bundleUrl}`}`);
    console.log(`${pad('Module', nameW)}  ${pad('Pinned', 12)}  ${pad('Latest on line', 14)}  Status`);
    console.log('─'.repeat(nameW + 2 + 12 + 2 + 14 + 2 + 22));
    for (const r of results.sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : rank(a.status) - rank(b.status)))) {
      const badge =
        r.status === 'hotfix' ? `⬆ HOTFIX AVAILABLE → ${r.highest}` :
        r.status === 'current' ? '✓ current' :
        r.status === 'line-missing' ? `✗ ${r.note}` :
        `⚠ ${r.note}`;
      console.log(`${pad(r.name, nameW)}  ${pad(r.pinned, 12)}  ${pad(r.highest ?? '—', 14)}  ${badge}`);
    }
    console.log('─'.repeat(nameW + 2 + 12 + 2 + 14 + 2 + 22));
    console.log(`Total ${results.length} · current ${results.filter((r) => r.status === 'current').length} · hotfixes ${hotfixes.length} · problems ${problems.length}`);
    if (autoResolved.length) {
      console.error(`\n✓ auto-resolved + cached to config/module-repo-map.json:\n  ${autoResolved.join('\n  ')}`);
    }
    if (hotfixes.length) {
      console.log(`\nHotfixes available (with the PR + task that raised each version):`);
      for (const h of hotfixes) {
        console.log(`\n  • ${h.name}: ${h.pinned} → ${h.highest}  (${h.repo})`);
        for (const t of h.traces ?? []) {
          const when = t.date ? t.date.slice(0, 10) : '—';
          if (!t.prs.length) {
            const tasks = t.commitTaskKeys?.length ? `  task (from commits): ${t.commitTaskKeys.map((k) => link(k, `${JIRA_BASE}/browse/${k}`)).join(', ')}` : '';
            const rel = t.releaseUrl ? ` · ${link('release', t.releaseUrl)}` : '';
            console.log(`      ${t.version} (${when}) — no PR in release notes${rel}${tasks}`);
            continue;
          }
          for (const pr of t.prs) {
            const task = pr.taskKeys.length ? pr.taskKeys.map((k, i) => link(k, pr.taskUrls[i])).join(', ') : 'no task ref';
            console.log(`      ${t.version} (${when}) — PR ${link('#' + pr.number, pr.url)} "${pr.title}"`);
            console.log(`          task: ${task}`);
          }
        }
        if (!h.traces) console.log(`      (trace skipped/failed${h.note ? `: ${h.note}` : ''})`);
      }
    }
  }

  // ── exit code ──
  if (probeError && problems.length === results.length) process.exit(2); // total failure (e.g. rate-limited from the start)
  if (problems.length) {
    if (!asJson) console.error(`\n[bundle-check] ${problems.length} target(s) could not be verified — see ⚠/✗ rows. Exit 2.`);
    process.exit(2);
  }
  process.exit(hotfixes.length ? 1 : 0);
}

function rank(s: Result['status']): number {
  return { hotfix: 0, 'line-missing': 1, unresolved: 2, current: 3 }[s];
}

main().catch((e) => {
  console.error(`[bundle-check] fatal: ${e.message}`);
  process.exit(2);
});
