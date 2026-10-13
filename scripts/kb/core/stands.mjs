// ONE NAME PER STAND (VCST-6189) -- the alias map, DERIVED from the repo's `.env.<env>` profiles.
//
// WHY A MAP NOW, when `stand()` in verbs.mjs refused one for a month. The refusal had three legs, and
// each was checked again rather than overruled:
//
//   1. "There is no source of truth for a stand's canonical name." There is now: every committed
//      profile DECLARES it (`KB_STAND=vcst_qa`), next to the BACK_URL it names. The map below is read
//      from those files on every load and is never written anywhere, so it cannot go stale -- the
//      GOLDEN RULE applied to a name (.claude/rules/test-data.md). `--check` fails a tracked profile
//      without the line, so a new stand cannot arrive unmapped.
//   2. "`TEST_ENV` / BACK_URL would print this process's guess as the agent's fact." Still true, and
//      still honoured: the map only RENAMES a value the agent passed. It never supplies one, and the
//      process environment is not read at all. An empty value stays absent.
//   3. "A disagreement about which stand it was is a finding." `vcst` and `vcst_qa` were never a
//      disagreement: `.env.vcst`'s BACK_URL IS vcst-qa.govirto.com. They are one stand known by its
//      profile name and by its host. A name the map does not know passes through, spelling-folded
//      only, exactly as before -- a client's stand is not refused for being somebody else's.
//
// Measured on the base 2026-10-13 (vc-knowledge 2b53ece): vcst_qa 550 / vcst 263, vcptcore_qa 134 /
// vcptcore 96, virtostart 35 / virtostart_demo_admin 1 -- 94 entries carried two spellings of one stand.
//
// WHAT A PROFILE CONTRIBUTES: its env name, its KB_STAND, and the first host label of BACK_URL and
// FRONT_URL -- all folded by `canonicalStand`, all pointing at KB_STAND. Two profiles claiming one
// alias for different stands is a CONFLICT: the alias is dropped (never guessed) and `--check` fails.

import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalStand } from './canonical.mjs';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
/** A per-env profile; `.env.local`, `.env.defaults`, `.env.playwright.local` and backups are not stands. */
const PROFILE = /^\.env\.([a-z0-9_]+)$/i;
const NOT_A_STAND = new Set(['local', 'defaults']);

/** The KEY=value pairs a profile assigns, last assignment winning (dotenv semantics), quotes stripped. */
export function readAssignments(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].replace(/\s+#.*$/, '').trim().replace(/^(["'])(.*)\1$/, '$2');
  }
  return out;
}

const hostLabel = (url) => {
  try { return new URL(url).hostname.split('.')[0] || null; } catch { return null; }
};

/**
 * `profiles` -- `[{ env, text }]` -- to the map. Pure: the reading is `loadStands`'s job.
 * Returns `{ stands: Map<canonical, {env, backUrl, frontUrl}>, aliases: Map<alias, canonical>, problems }`.
 */
export function standsFrom(profiles) {
  const stands = new Map();
  const claims = new Map(); // alias -> Set<canonical>
  const problems = [];
  for (const { env, text } of profiles) {
    const a = readAssignments(text);
    const declared = String(a.KB_STAND ?? '').trim();
    if (!declared) { problems.push(`.env.${env}: no KB_STAND= line -- declare the stand name this profile observes`); continue; }
    const canonical = canonicalStand(declared);
    if (!STAND_SHAPE.test(canonical)) { problems.push(`.env.${env}: KB_STAND="${declared}" is not a stand name`); continue; }
    if (stands.has(canonical)) { problems.push(`.env.${env}: KB_STAND=${canonical} is already declared by .env.${stands.get(canonical).env}`); continue; }
    stands.set(canonical, { env, backUrl: a.BACK_URL || null, frontUrl: a.FRONT_URL || null });
    for (const raw of [env, declared, hostLabel(a.BACK_URL), hostLabel(a.FRONT_URL)]) {
      if (!raw) continue;
      const alias = canonicalStand(raw);
      if (!claims.has(alias)) claims.set(alias, new Set());
      claims.get(alias).add(canonical);
    }
  }
  const aliases = new Map();
  for (const [alias, owners] of claims) {
    if (owners.size === 1) aliases.set(alias, [...owners][0]);
    else problems.push(`alias "${alias}" is claimed by ${[...owners].join(', ')} -- dropped; rename a profile or its KB_STAND`);
  }
  return { stands, aliases, problems };
}

/** The profiles at `root`: every one present (`tracked: false`, the door) or only git-tracked ones (`--check`). */
export function readProfiles({ root = REPO_ROOT, tracked = false } = {}) {
  let names;
  try {
    names = tracked
      ? execFileSync('git', ['ls-files', '.env.*'], { cwd: root, encoding: 'utf8' }).split(/\r?\n/).filter(Boolean)
      : readdirSync(root);
  } catch { return []; }
  return names
    .map((n) => [n, PROFILE.exec(n)?.[1]])
    .filter(([, env]) => env && !NOT_A_STAND.has(env.toLowerCase()))
    .map(([n, env]) => { try { return { env, text: readFileSync(join(root, n), 'utf8') }; } catch { return null; } })
    .filter(Boolean);
}

let cached = null;
/** The map the door uses, read once per process. `KB_STANDS_ROOT` points it at another checkout (tests, fixtures). */
export function loadStands(env = process.env) {
  const root = env.KB_STANDS_ROOT || REPO_ROOT;
  if (cached?.root !== root) cached = { root, map: standsFrom(readProfiles({ root })) };
  return cached.map;
}

/**
 * A stand-shaped name after folding: a token, no prose. The longest the base has held is 33 characters
 * (`local_vcfrontend_pr2522_on_vcst_qa`); two values were whole paragraphs, which is what this refuses.
 */
export const STAND_SHAPE = /^[a-z0-9][a-z0-9_.]{0,39}$/;

/**
 * What the agent typed, as the base will spell it. `{ value }` -- canonical when the map knows the
 * name, spelling-folded when it does not -- or `{ problem }` for a value that is not a stand name.
 * `{}` for nothing typed: never defaulted (leg 2 above).
 */
const examples = (map) => [...map.stands].filter(([, p]) => !/\/\/(localhost|127\.)/.test(p.backUrl ?? '')).map(([n]) => n).slice(0, 3).join(', ') || 'vcst_qa';

export function resolveStand(raw, { map = loadStands() } = {}) {
  const typed = typeof raw === 'string' ? raw.trim() : '';
  if (!typed) return {};
  if (/\s/.test(typed)) return { problem: `"${typed.slice(0, 40)}${typed.length > 40 ? '…' : ''}" is prose, not a stand name -- pass the stand you observed it on as one token (e.g. ${examples(map)}); what you saw goes in the claim or note` };
  const folded = canonicalStand(typed);
  if (!STAND_SHAPE.test(folded)) return { problem: `"${typed.slice(0, 40)}" is not a stand name -- letters, digits and _ only, at most 40 characters (e.g. ${examples(map)})` };
  return { value: map.aliases.get(folded) ?? folded, known: map.aliases.has(folded) };
}

/** The `.env.<env>` profile behind a canonical stand, or null -- how a build stamp finds the stand's BACK_URL. */
export function profileOf(stand, { map = loadStands() } = {}) {
  return map.stands.get(stand) ?? null;
}

// `node scripts/kb/core/stands.mjs --check` -- the drift gate: every TRACKED profile declares its stand,
// and no alias is claimed twice. Untracked profiles (a client's) are never read here.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { stands, aliases, problems } = standsFrom(readProfiles({ tracked: true }));
  if (process.argv.includes('--json')) console.log(JSON.stringify({ stands: Object.fromEntries(stands), aliases: Object.fromEntries(aliases), problems }, null, 2));
  else {
    for (const [name, p] of stands) console.log(`${name.padEnd(22)} .env.${p.env}  ${[...aliases].filter(([, c]) => c === name).map(([a]) => a).join(', ')}`);
    for (const p of problems) console.error(`FAIL ${p}`);
  }
  process.exitCode = problems.length ? 1 : 0;
}
