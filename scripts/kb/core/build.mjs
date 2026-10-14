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
// storefront's own entry bundle at the profile's FRONT_URL (`probeThemeVersion`), anonymous and OBSERVED.
// It used to be the stand's deploy manifest in vc-deploy-dev: DECLARED, needing a GitHub token, and
// missing on every stand whose branch keeps no `theme/artifact.json` -- measured 2026-10-14, the
// manifest gave no theme for vcptcore_stable, vcptcore_regression and virtostart (352 of 1,709 stamps
// carried none), while the bundle answered on all six tracked stands within 2.2 s, agreeing with the
// manifest wherever both answered. No manifest fallback: a declared theme is a guess about the stand,
// and a storefront that does not answer leaves the theme null. The readers are the pre-flight's
// (`scripts/deploy/lib/live.ts`), imported rather than re-written, so one HTTP contract serves both.
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

/** Where a session keeps the builds it has read: one file per stand, re-read after BUILD_TTL_MS. */
const cachePath = (env, stand) => join(queueDir(env), `${sessionId(env)}.build.${stand}.json`);

/** The pre-flight's readers. Dynamic, so a Node without type stripping degrades to "unknown" instead of failing to load. */
async function readers(root) {
  try {
    const [envLib, live] = await Promise.all(['env', 'live']
      .map((m) => import(pathToFileURL(resolve(root, `scripts/deploy/lib/${m}.ts`)).href)));
    return { envLib, live };
  } catch (err) {
    return { unknown: `the deploy readers did not load (${err.code ?? err.message}) -- Node with type stripping is required` };
  }
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
    // A build read is good for BUILD_TTL_MS, not the whole session: the MCP server lives for hours and a
    // stand redeployed meanwhile would keep stamping (and labelling) the build it ran before.
    if (cached?.pin && cached?.snapshot && now() - new Date(cached.at) < BUILD_TTL_MS) return cached;
    // A failure is retried after UNKNOWN_TTL_MS: a stand that was down a minute ago may be up now, and
    // re-probing it on every write would put its timeout in front of every write.
    if (cached?.unknown && now() - new Date(cached.at) < UNKNOWN_TTL_MS) return cached;
  } catch { /* first read this session */ }

  // The deadline ABORTS the requests, not only the wait: a stand that never answers would otherwise keep
  // its sockets -- and a CLI process, which ends by `exitCode` -- alive until the platform's own timeout.
  const abort = new AbortController();
  const result = await withDeadline((probe ?? probeStand)(stand, { env, root, signal: abort.signal }), PROBE_DEADLINE_MS, abort);
  const out = result.unknown ? { unknown: result.unknown, at: now().toISOString() }
    : { pin: buildPin(result), snapshot: canonicalBuild(result), at: now().toISOString() };
  try { await mkdir(queueDir(env), { recursive: true }); await writeFile(file, JSON.stringify(out)); } catch { /* a cache, not a record */ }
  return out;
}

/** A write never waits on a slow stand for longer than this; past it the evidence goes unstamped. */
export const PROBE_DEADLINE_MS = 10_000;
/** The storefront gets less than the whole probe: past this the stamp goes out without its theme. */
const THEME_DEADLINE_MS = 5_000;
const UNKNOWN_TTL_MS = 5 * 60_000;
export const BUILD_TTL_MS = 30 * 60_000;
function withDeadline(p, ms, abort) {
  let timer;
  return Promise.race([
    p.catch((err) => ({ unknown: `probe failed: ${err.message}` })),
    new Promise((r) => { timer = setTimeout(() => { abort?.abort(); r({ unknown: `no answer within ${ms / 1000}s` }); }, ms); timer.unref?.(); }),
  ]).finally(() => clearTimeout(timer));
}

async function probeStand(stand, { env, root, signal }) {
  const profile = profileOf(stand, { map: loadStands(env) });
  if (!profile) return { unknown: `no .env profile declares KB_STAND=${stand}` };
  // A stand whose profile is not committed here is somebody's own -- a client's. Its build is never
  // read: the snapshot would be published to the public base (review of ai-tools#429).
  if (!profile.tracked) return { unknown: `.env.${profile.env} is not tracked in this repo: a private stand's build is never read into the public base` };
  const r = await readers(root);
  if (r.unknown) return r;
  const coords = r.envLib.resolveEnvCoords(profile.env);
  if (!coords.backUrl) return { unknown: `.env.${profile.env} has no BACK_URL` };
  // The THEME runs beside everything else and never holds it up: it is another host, and a slow storefront
  // must cost the stamp its theme, not its platform and modules. So it has its own deadline, shorter than
  // the whole probe's, and is aborted with it.
  const front = String(profile.frontUrl ?? '').replace(/\/+$/, '');
  const themeAbort = new AbortController();
  const stop = () => themeAbort.abort();
  signal?.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(stop, THEME_DEADLINE_MS); timer.unref?.();
  const themeP = (front ? r.live.probeThemeVersion(front, themeAbort.signal) : Promise.resolve({ ok: false }))
    .catch(() => ({ ok: false }))
    .finally(() => { clearTimeout(timer); signal?.removeEventListener('abort', stop); });
  const [platform, token] = await Promise.all([r.live.probePlatformVersion(coords, signal), r.live.probeAdminToken(coords, signal)]);
  if (!token.token) { stop(); return { unknown: `no admin token for ${stand} (${token.status})` }; }
  const mods = await r.live.probeLiveModules(coords, token.token, signal);
  if (!mods.ok) { stop(); return { unknown: `modules of ${stand} unreadable (${mods.status})` }; }
  const modules = {};
  for (const m of mods.modules) if (m.isInstalled !== false) modules[m.id] = m.version;
  const theme = await themeP;
  return { platform: platform.ok ? platform.version : null, theme: theme.ok ? theme.version : null, modules };
}
