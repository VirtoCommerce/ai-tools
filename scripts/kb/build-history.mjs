#!/usr/bin/env node
// `npm run kb:build-history -- --base <checkout> [--out <file>]` (VCST-6221 step 5).
//
// WHAT A STAND WAS RUNNING ON A DAY IN THE PAST, for evidence written before the door stamped builds.
// Every stand is provisioned from a branch of vc-deploy-dev (`backend/packages.json`, `theme/artifact.json`),
// so the build behind an observation made at time T on stand S is the manifest of S's branch at the last
// commit before T. This is how `/kb-judge` scoped the 2026-10-08 disputes by hand; here it is a derivation.
//
// DECLARED, NOT OBSERVED -- and labelled so (`from: 'deploy-history'`). A deploy lags its commit by
// minutes, a module pinned nowhere (installed as a dependency) is absent, and a hand-patched stand is
// invisible. The live stamp (`core/build.mjs`) is the ground truth; this is the best reconstruction of
// the past there is, and it is only ever used where no live stamp exists.
//
// READ-ONLY on both sides: it reads the base checkout and GitHub (`gh api`, the operator's own login) and
// prints JSON. What to do with it -- a backfill PR on the base, a replay -- is the caller's.

import '../lib/sync-stdio.mjs';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEntry } from './core/frontmatter.mjs';
import { buildPin, canonicalBuild } from './core/canonical.mjs';
import { loadStands, profileOf, REPO_ROOT, resolveStand } from './core/stands.mjs';

const CACHE = join(tmpdir(), 'kb-build-history');
mkdirSync(CACHE, { recursive: true });

const gh = (path, { raw = false } = {}) => {
  const key = join(CACHE, `${Buffer.from(path).toString('base64url').slice(0, 180)}${raw ? '.raw' : '.json'}`);
  try { return readFileSync(key, 'utf8'); } catch { /* fetch */ }
  const args = ['api', path, ...(raw ? ['-H', 'Accept: application/vnd.github.raw'] : [])];
  let out;
  try {
    out = execFileSync('gh', args, { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    // A 404 is an answer -- that file is not in that commit. Anything else (no login, rate limit, no
    // network) is NOT "no commits": failing loud beats reconstructing every build as unknown.
    const why = String(err.stderr ?? err.message);
    if (!/HTTP 404/.test(why)) throw new Error(`gh api ${path} failed: ${why.trim().split(/\r?\n/)[0]}`);
    out = '';
  }
  // Only a sha-pinned read is immutable; a branch listing is cached for this run's process only.
  if (out && /[?&]ref=[0-9a-f]{40}/.test(path)) writeFileSync(key, out);
  return out;
};

/** A branch's commits since `since`, oldest first: `[{sha, at}]`. */
function commitsOf(coords, since) {
  const out = [];
  for (let page = 1; page < 50; page += 1) {
    const text = gh(`repos/${coords.deployOwner}/${coords.deployRepo}/commits?sha=${encodeURIComponent(coords.branch)}&since=${since}&per_page=100&page=${page}`);
    const rows = text ? JSON.parse(text) : [];
    for (const c of rows) out.push({ sha: c.sha, at: c.commit.committer.date });
    if (rows.length < 100) break;
  }
  // THE COMMIT ALREADY ON THE BRANCH when the window opens: `since` returns only commits made after it,
  // so a stand not redeployed since would have no manifest for any of its evidence (Cursor Bugbot on
  // ai-tools#429). The last commit before `since` is the build it was running at the window's start.
  const prior = gh(`repos/${coords.deployOwner}/${coords.deployRepo}/commits?sha=${encodeURIComponent(coords.branch)}&until=${since}&per_page=1`);
  for (const c of prior ? JSON.parse(prior) : []) out.push({ sha: c.sha, at: c.commit.committer.date });
  return [...new Map(out.map((c) => [c.sha, c])).values()].sort((a, b) => a.at.localeCompare(b.at));
}

/** The manifest of S at `sha` as a canonical build, or null when the file is unreadable. */
function buildAt(coords, sha, { listPinnedModules, THEME_URL_RE }) {
  const pk = gh(`repos/${coords.deployOwner}/${coords.deployRepo}/contents/${coords.packagesPath}?ref=${sha}`, { raw: true });
  if (!pk) return null;
  let json;
  try { json = JSON.parse(pk); } catch { return null; }
  const modules = {};
  for (const m of listPinnedModules(json)) modules[m.id] = m.version;
  const th = gh(`repos/${coords.deployOwner}/${coords.deployRepo}/contents/${coords.themePath}?ref=${sha}`, { raw: true });
  const zip = th ? THEME_URL_RE.exec(th)?.[0] : null;
  return canonicalBuild({ platform: json.PlatformImageTag ?? json.PlatformVersion ?? null, theme: zip ? zip.split('/').pop().replace(/\.zip$/i, '') : null, modules });
}

export async function history({ base, root = REPO_ROOT }) {
  const [envLib, manifest] = await Promise.all(['env', 'manifest'].map((m) => import(pathToFileURL(resolve(root, `scripts/deploy/lib/${m}.ts`)).href)));
  const map = loadStands({ KB_STANDS_ROOT: root });
  const items = [];
  for (const f of readdirSync(join(base, 'entries')).filter((n) => n.endsWith('.md'))) {
    const { data } = parseEntry(readFileSync(join(base, 'entries', f), 'utf8'), f);
    (data.evidence ?? []).forEach((e, i) => items.push({ id: data.id, index: i, at: String(e.at ?? ''), by: e.by ?? null, deployment: e.deployment ?? null, build: e.build ?? null }));
  }
  const since = items.map((i) => i.at).filter(Boolean).sort()[0]?.slice(0, 10) ?? '2026-09-01';
  const branches = new Map(); // stand -> { coords, commits }
  const builds = {};
  const shaPin = new Map();
  const out = [];
  for (const it of items) {
    if (it.build) { out.push({ ...it, from: 'live' }); continue; }
    const r = resolveStand(String(it.deployment ?? ''), { map });
    const profile = r.known ? profileOf(r.value, { map }) : null;
    if (!profile || !it.at) { out.push({ ...it, unknown: profile ? 'no date' : `no profile for ${it.deployment}` }); continue; }
    // The same guard as the live stamp (core/build.mjs): a stand whose profile is not committed here is
    // somebody's own, and its builds never go into the public base (review of ai-tools#429).
    if (!profile.tracked) { out.push({ ...it, unknown: `.env.${profile.env} is not tracked: a private stand's builds are never read` }); continue; }
    if (!branches.has(r.value)) {
      const coords = envLib.resolveEnvCoords(profile.env);
      branches.set(r.value, { coords, commits: commitsOf(coords, `${since}T00:00:00Z`) });
    }
    const { coords, commits } = branches.get(r.value);
    const before = commits.filter((c) => c.at <= it.at).at(-1);
    if (!before) { out.push({ ...it, unknown: `no ${coords.branch} commit before ${it.at}` }); continue; }
    if (!shaPin.has(before.sha)) {
      const b = buildAt(coords, before.sha, manifest);
      const pin = b ? buildPin(b) : null;
      if (pin) builds[pin] = b;
      shaPin.set(before.sha, pin);
    }
    const pin = shaPin.get(before.sha);
    out.push(pin ? { ...it, stand: r.value, build: pin, from: 'deploy-history', commit: before.sha.slice(0, 8) } : { ...it, unknown: `manifest unreadable at ${before.sha.slice(0, 8)}` });
  }
  return { generated: new Date().toISOString(), items: out, builds };
}

// `fileURLToPath`, not `.pathname`: a checkout under a path with spaces or Cyrillic is percent-encoded in
// the URL, and the raw comparison made the script exit silently (review of ai-tools#429).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const base = arg('--base');
  if (!base) { console.error('usage: npm run kb:build-history -- --base <vc-knowledge checkout> [--out <file>]'); process.exit(2); }
  const r = await history({ base: resolve(base) });
  const text = `${JSON.stringify(r, null, 2)}\n`;
  if (arg('--out')) writeFileSync(arg('--out'), text); else process.stdout.write(text);
  const known = r.items.filter((i) => i.build).length;
  console.error(`${known} of ${r.items.length} evidence items have a build (${r.items.filter((i) => i.from === 'live').length} live, ${r.items.filter((i) => i.from === 'deploy-history').length} from deploy history); ${Object.keys(r.builds).length} distinct historical builds`);
}
