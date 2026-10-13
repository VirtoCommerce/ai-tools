// WHAT THE STAND WAS RUNNING when an observation was made (VCST-6221) -- read by the machine, not
// typed by the agent.
//
// Measured on the base 2026-10-13: 146 of 1,689 evidence items carried a `platformVersion`, and of the
// 128 disputes a judge has settled, 46 were `version-scoped` and 7 `conditions-scoped` -- a different
// build, not a contradiction -- while only 14 of those dispute items named a build at all. VCST-6179's
// `conditions` is written by the agent and stays mostly empty; this is the half the machine can know.
//
// THE SHAPE. An evidence item carries `build: <pin>` -- a hash of the platform version, the installed
// module versions and the theme. The full snapshot is written ONCE to the base as `builds/<pin>.json`
// (`push`), content-addressed, so every writer of one build writes the same bytes. Which modules MATTER
// to an entry is decided when two builds are COMPARED (`relevance.mjs`), never at write time: a better
// relevance rule then applies to every stamp already written.
//
// WHERE THE VERSIONS COME FROM. The stand the AGENT named (VCST-6189) -> its `.env.<env>` profile ->
// BACK_URL and the admin credentials of THAT stand, read from the files without touching this
// process's environment (`resolveEnvCoords`, never `loadEnvFiles`, which mutates `process.env`).
// Modules from `/api/platform/modules` (admin token -- 401 anonymously on every stand, checked
// 2026-10-13); the platform from the anonymous Admin page (`probePlatformVersion`); the theme from the
// stand's deploy manifest in vc-deploy-dev, which is DECLARED rather than observed and is omitted when no
// GitHub token is configured. The readers are the pre-flight's (`scripts/deploy/lib/live.ts`), imported
// rather than re-written, so one HTTP contract serves both.
//
// ABSENT, NEVER GUESSED. No profile for the stand, no credentials, no TypeScript loader in this Node, a
// stand that is down -- each returns `{ unknown }` and the write goes ahead without a stamp. A stamp is
// evidence about the observation; a wrong one is worse than none, because a judge scopes by it.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildPin, canonicalBuild } from './canonical.mjs';
import { loadStands, profileOf, REPO_ROOT } from './stands.mjs';
import { isOff, queueDir, sessionId } from './queue.mjs';

export { buildPin };

/** Where a session keeps the builds it has read: once per session per stand. */
const cachePath = (env, stand) => join(queueDir(env), `${sessionId(env)}.build.${stand}.json`);

/** The pre-flight's readers. Dynamic, so a Node without type stripping degrades to "unknown" instead of failing to load. */
async function readers(root) {
  try {
    // Not `github.ts`: it uses TypeScript parameter properties, which plain Node's type stripping
    // refuses (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX), and the theme needs one GET (`declaredTheme`).
    const [envLib, live, manifest] = await Promise.all(['env', 'live', 'manifest']
      .map((m) => import(pathToFileURL(resolve(root, `scripts/deploy/lib/${m}.ts`)).href)));
    return { envLib, live, manifest };
  } catch (err) {
    return { unknown: `the deploy readers did not load (${err.code ?? err.message}) -- Node with type stripping is required` };
  }
}

/** The theme a stand's deploy manifest declares, or null. Declared, not observed: the storefront serves no version. */
async function declaredTheme({ envLib, manifest }, coords) {
  const local = envLib.readEnvFile(resolve(envLib.REPO_ROOT, '.env.local'));
  const token = local.GIT_TOKEN || local.GITHUB_TOKEN || local.GITHUB_PERSONAL_ACCESS_TOKEN;
  if (!token) return null;
  try {
    const url = `https://api.github.com/repos/${coords.deployOwner}/${coords.deployRepo}/contents/${coords.themePath}?ref=${encodeURIComponent(coords.branch)}`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'vc-kb' } });
    if (!r.ok) return null;
    const zip = manifest.THEME_URL_RE.exec(await r.text())?.[0];
    return zip ? zip.split('/').pop().replace(/\.zip$/i, '') : null;
  } catch { return null; }
}

/**
 * The build a canonical stand is running NOW: `{ pin, snapshot }` or `{ unknown }`.
 * `probe` is injectable for tests; the default reads the stand live.
 */
export async function liveBuild(stand, { env = process.env, root = REPO_ROOT, probe = null, now = () => new Date() } = {}) {
  if (!stand) return { unknown: 'no stand named' };
  // `KB_BUILD=0` -- no stand is read. `npm test` sets it: the door tests spawn the real CLI, and a
  // machine with `.env.local` would otherwise log in to every real stand a fixture names.
  if (isOff(env.KB_BUILD)) return { unknown: 'KB_BUILD=0' };
  const file = cachePath(env, stand);
  try {
    const cached = JSON.parse(await readFile(file, 'utf8'));
    if (cached?.pin && cached?.snapshot) return cached;
    // A failure is retried after UNKNOWN_TTL_MS: a stand that was down a minute ago may be up now, and
    // re-probing it on every write would put its timeout in front of every write.
    if (cached?.unknown && now() - new Date(cached.at) < UNKNOWN_TTL_MS) return cached;
  } catch { /* first read this session */ }

  const result = await withDeadline((probe ?? probeStand)(stand, { env, root }), PROBE_DEADLINE_MS);
  const out = result.unknown ? { unknown: result.unknown, at: now().toISOString() }
    : { pin: buildPin(result), snapshot: canonicalBuild(result), at: now().toISOString() };
  try { await mkdir(queueDir(env), { recursive: true }); await writeFile(file, JSON.stringify(out)); } catch { /* a cache, not a record */ }
  return out;
}

/** A write never waits on a slow stand for longer than this; past it the evidence goes unstamped. */
export const PROBE_DEADLINE_MS = 10_000;
const UNKNOWN_TTL_MS = 5 * 60_000;
const withDeadline = (p, ms) => Promise.race([
  p.catch((err) => ({ unknown: `probe failed: ${err.message}` })),
  new Promise((r) => { setTimeout(() => r({ unknown: `no answer within ${ms / 1000}s` }), ms).unref?.(); }),
]);

async function probeStand(stand, { env, root }) {
  const profile = profileOf(stand, { map: loadStands(env) });
  if (!profile) return { unknown: `no .env profile declares KB_STAND=${stand}` };
  const r = await readers(root);
  if (r.unknown) return r;
  const coords = r.envLib.resolveEnvCoords(profile.env);
  if (!coords.backUrl) return { unknown: `.env.${profile.env} has no BACK_URL` };
  const [platform, token] = await Promise.all([r.live.probePlatformVersion(coords), r.live.probeAdminToken(coords)]);
  if (!token.token) return { unknown: `no admin token for ${stand} (${token.status})` };
  const mods = await r.live.probeLiveModules(coords, token.token);
  if (!mods.ok) return { unknown: `modules of ${stand} unreadable (${mods.status})` };
  const modules = {};
  for (const m of mods.modules) if (m.isInstalled !== false) modules[m.id] = m.version;
  return { platform: platform.ok ? platform.version : null, theme: await declaredTheme(r, coords), modules };
}
