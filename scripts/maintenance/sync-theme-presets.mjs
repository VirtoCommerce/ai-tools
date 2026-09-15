#!/usr/bin/env node
/**
 * Derive the set of theme presets the STOREFRONT can actually resolve, straight from the
 * vc-frontend source — instead of anybody (human or agent) guessing which names are real.
 *
 * WHY THIS EXISTS
 * ---------------
 * `WhiteLabeling.ThemePresetNames` is a free-text platform dictionary: the admin blade accepts
 * ANY string, and the storefront silently falls back to the theme default when it cannot resolve
 * one (`useThemeContext.addPresetToThemeContext` → `getThemeConfig().current`). So a typo, a
 * retired preset, or a name from a different theme all look identical to a passing test — the
 * page renders, just not in the theme the fixture asked for.
 *
 * Measured 2026-09-15, and this file is the direct result: `red` was on vcst-qa's store-level WL
 * record; `GET {FRONT_URL}/assets/presets/red.json` returned 404; the repo's own notes listed six
 * presets, not including `red`. Every available signal said "unresolvable". All of them were
 * wrong — bundled presets are compiled INTO the JS, never served as files, and `red.json` had
 * been added upstream since those notes were written. The deployed bundle carries it.
 *
 * The lesson is not "check harder". It is that a set nobody generates is a set everybody guesses.
 * So we generate it, commit the generated file, and drift-guard it in CI.
 *
 * GOLDEN RULE (.claude/rules/test-data.md): nothing here is hardcoded — not the preset names, and
 * not even the storefront's own name→file normalizer, which `theme-preset-specs.mjs` mirrors in
 * one line. The upstream expression is recorded in the generated file so that a change to it
 * breaks `presets:check` (and the unit test that compares our mirror against it) instead of
 * quietly desynchronising the seeder from the storefront.
 *
 * SOURCES (single source of truth = the vc-frontend repo)
 *   client-app/assets/presets/index.ts        → `presets` / `darkPresets` record keys
 *                                               (what `getPredefinedPreset` can resolve)
 *   client-app/assets/presets/                → the preset JSON files on disk (cross-check)
 *   client-app/core/utilities/common/index.ts → `presetNameToFileName` (the normalizer)
 *
 * WHAT IT DOES NOT TELL YOU
 * -------------------------
 * This is the set bundled by vc-frontend at `--ref`. A DEPLOYMENT may differ two ways, both fine:
 * it may run an older/newer build, and a theme may drop extra presets into the served
 * `/assets/presets/<file>.json` (which `loadPreset` fetches at runtime). That is why every
 * consumer treats a name outside this list as a WARNING to check, never as a failure.
 *
 * USAGE
 *   npm run presets:sync     # fetch + rewrite scripts/lib/theme-presets.generated.json
 *   npm run presets:check    # verify the committed file still matches upstream (CI gate)
 *
 *   --from <dir>   read from a local vc-frontend checkout instead of GitHub
 *   --ref <ref>    git ref to read from GitHub (default: dev)
 *
 * EXIT CODES
 *   0  in sync (check) / written (sync)
 *   1  drift detected (check) — run `npm run presets:sync` and review the diff
 *   2  could not reach a source (network/checkout) — advisory, never silently "passes"
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..');
const OUT_FILE = join(REPO_ROOT, 'scripts', 'lib', 'theme-presets.generated.json');

const REPO = 'VirtoCommerce/vc-frontend';
const PRESET_DIR = 'client-app/assets/presets';
const FILES = {
  presetIndex: `${PRESET_DIR}/index.ts`,
  utilities: 'client-app/core/utilities/common/index.ts',
};

const args = process.argv.slice(2);
const MODE = args.includes('--check') ? 'check' : 'sync';
const REF = argValue('--ref') ?? 'dev';
const FROM = argValue('--from');

function argValue(flag) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : undefined;
}

/* ── Source loading ─────────────────────────────────────────────────────────── */

async function loadSource(relPath) {
  if (FROM) {
    const p = join(resolve(FROM), relPath);
    if (!existsSync(p)) throw new Error(`not found in --from checkout: ${p}`);
    return readFileSync(p, 'utf8');
  }
  const url = `https://raw.githubusercontent.com/${REPO}/${REF}/${relPath}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  return res.text();
}

/** The `.json` files actually sitting in the presets directory — a cross-check on index.ts. */
async function listPresetFiles() {
  if (FROM) {
    const dir = join(resolve(FROM), PRESET_DIR);
    if (!existsSync(dir)) throw new Error(`not found in --from checkout: ${dir}`);
    return readdirSync(dir).filter((f) => f.endsWith('.json'));
  }
  const url = `https://api.github.com/repos/${REPO}/contents/${PRESET_DIR}?ref=${encodeURIComponent(REF)}`;
  const res = await fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'vc-mcp-testing-module' } });
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  const body = await res.json();
  if (!Array.isArray(body)) throw new Error(`${url} did not return a directory listing`);
  return body.map((e) => e.name).filter((n) => n.endsWith('.json'));
}

/* ── Parsing ────────────────────────────────────────────────────────────────── */

/**
 * Keys of an exported `Record<string, IThemeConfigPreset>`. Handles both spellings the file uses:
 * a bare identifier (`default:`) and a computed string for a name that is not a valid identifier
 * (`['black-gold']:`). The KEYS are what matters — `getPredefinedPreset` does `presetName in
 * presets`, so a preset file that exists but is not exported here is not predefined.
 */
function parseRecordKeys(src, exportName) {
  const start = src.indexOf(`export const ${exportName}`);
  if (start < 0) throw new Error(`no \`export const ${exportName}\` in ${FILES.presetIndex}`);
  const open = src.indexOf('{', start);
  const close = src.indexOf('};', open);
  if (open < 0 || close < 0) throw new Error(`cannot delimit the \`${exportName}\` object literal`);
  const body = src.slice(open + 1, close);
  const keys = [];
  for (const line of body.split('\n')) {
    const m = line.match(/^\s*(?:\[\s*['"]([^'"]+)['"]\s*\]|['"]([^'"]+)['"]|([A-Za-z_$][\w$]*))\s*:/);
    if (!m) continue;
    keys.push(m[1] ?? m[2] ?? m[3]);
  }
  if (!keys.length) throw new Error(`\`${exportName}\` parsed empty`);
  return [...new Set(keys)].sort();
}

/**
 * The body of `presetNameToFileName`, recorded verbatim so a change upstream fails the gate.
 * theme-preset-specs.mjs mirrors this expression; the unit test asserts the two still agree.
 */
function parseNormalizer(src) {
  const m = src.match(/export function presetNameToFileName\([^)]*\)[^{]*\{\s*return\s+([^;]+);/);
  if (!m) throw new Error(`no \`presetNameToFileName\` in ${FILES.utilities}`);
  return m[1].replace(/\s+/g, ' ').trim();
}

/* ── Emit ───────────────────────────────────────────────────────────────────── */

function render({ presets, darkPresets, normalizer, files, ref, sourcedFrom }) {
  return `${JSON.stringify({
    _generated: 'AUTO-GENERATED — DO NOT EDIT BY HAND. Regenerate: npm run presets:sync · Drift-guard: npm run presets:check',
    _what: 'Theme preset names the vc-frontend storefront can resolve. A WhiteLabeling.ThemePresetNames value outside this list is not necessarily wrong (a deployment may run a different build, or ship extra presets under /assets/presets/) — it is a name to CHECK, never a failure.',
    source: sourcedFrom,
    ref,
    normalizer,
    normalizerSource: FILES.utilities,
    presets,
    darkPresets,
    presetFiles: files,
  }, null, 2)}\n`;
}

/* ── Main ───────────────────────────────────────────────────────────────────── */

async function main() {
  const sourcedFrom = FROM ? `local checkout ${resolve(FROM)}` : `https://github.com/${REPO}`;
  let presets, darkPresets, normalizer, files;
  try {
    const [indexSrc, utilSrc, listing] = await Promise.all([
      loadSource(FILES.presetIndex),
      loadSource(FILES.utilities),
      listPresetFiles(),
    ]);
    presets = parseRecordKeys(indexSrc, 'presets');
    darkPresets = parseRecordKeys(indexSrc, 'darkPresets');
    normalizer = parseNormalizer(utilSrc);
    files = listing.slice().sort();
  } catch (err) {
    console.error(`[presets:${MODE}] CANNOT REACH SOURCE — ${err.message}`);
    console.error(`[presets:${MODE}] This is advisory, not a pass. Re-run with network, or`);
    console.error(`[presets:${MODE}] point at a local checkout: --from ../vc-frontend`);
    process.exit(2);
  }

  // Cross-check: a preset file on disk that index.ts does not export is NOT predefined, and a key
  // with no file behind it cannot load at all. Either is worth saying out loud — upstream may be
  // mid-change, and a consumer that trusted only one of the two sources would be confidently wrong.
  const stems = new Set(files.filter((f) => !f.endsWith('.dark.json')).map((f) => f.replace(/\.json$/, '')));
  const unexported = [...stems].filter((s) => !presets.includes(s));
  const missingFile = presets.filter((p) => !stems.has(p));
  for (const s of unexported) console.warn(`[presets:${MODE}] note: ${s}.json exists but index.ts does not export it — not predefined`);
  for (const p of missingFile) console.warn(`[presets:${MODE}] note: index.ts exports "${p}" with no ${p}.json beside it`);

  const next = render({ presets, darkPresets, normalizer, files, ref: REF, sourcedFrom });
  const prev = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : null;
  // `ref`/`source` describe HOW it was fetched, not WHAT was found — a --from run must not "drift".
  const normalize = (s) => (s ?? '').replace(/\r\n/g, '\n').replace(/^\s*"(ref|source)":.*$/gm, '');

  console.log(`[presets:${MODE}] light presets : ${presets.join(', ')}`);
  console.log(`[presets:${MODE}] dark presets  : ${darkPresets.join(', ')}`);
  console.log(`[presets:${MODE}] normalizer    : ${normalizer}`);

  if (MODE === 'check') {
    if (prev === null) {
      console.error(`[presets:check] FAIL — ${OUT_FILE} missing. Run \`npm run presets:sync\`.`);
      process.exit(1);
    }
    if (normalize(prev) !== normalize(next)) {
      console.error(`[presets:check] FAIL — the committed preset list DRIFTED from vc-frontend@${REF}.`);
      console.error('[presets:check] A preset was added, renamed or retired, or the name→file');
      console.error('[presets:check] normalizer changed. Run `npm run presets:sync`, review the diff,');
      console.error('[presets:check] and re-check any theme_preset fixture column that names a');
      console.error('[presets:check] preset that just disappeared.');
      process.exit(1);
    }
    console.log(`[presets:check] OK — committed preset list matches vc-frontend@${REF}.`);
    process.exit(0);
  }

  writeFileSync(OUT_FILE, next, 'utf8');
  const changed = normalize(prev) !== normalize(next);
  console.log(`[presets:sync] ${changed ? 'UPDATED' : 'unchanged'} → ${OUT_FILE.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '')}`);
  if (changed && prev !== null) {
    console.log('[presets:sync] The preset set moved — re-check the theme_preset columns of');
    console.log('[presets:sync] test-data/stores/stores.csv and test-data/white-labeling/organizations.csv.');
  }
  process.exit(0);
}

await main();
