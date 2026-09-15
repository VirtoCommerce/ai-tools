/**
 * theme-preset-specs.mjs — the WHITE-LABELING THEME PRESET dictionary, as pure logic.
 *
 * SIDE-EFFECT-FREE. No network, no fs, no env, no `main()`. Imported by:
 *   - scripts/lib/seed-common.mjs           (ensureThemePresetNames — the Store(80) phase writer)
 *   - scripts/unit/theme-preset-specs.test.mjs
 *
 * ── WHAT THIS SEEDS, AND WHY IT IS NOT A STORE SETTING ──────────────────────────
 * `WhiteLabeling.ThemePresetNames` is a PLATFORM-GLOBAL dictionary setting, not a store-level one.
 * vc-module-white-labeling's ModuleConstants declares:
 *
 *     ThemePresetNames = { ValueType = ShortText, IsDictionary = true,
 *                          DefaultValue = "Default", AllowedValues = ["Default"] }
 *     StoreLevelSettings => yields WhiteLabelingEnabled ONLY
 *
 * — so it is registered with `objectType`/`objectId` null and every store on the platform picks
 * from the SAME list. The code ships exactly ONE value, "Default"; every other preset name is a
 * DB-stored dictionary item an operator typed into the admin blade (Settings -> White Labeling ->
 * Theme preset names -> Add). On a from-scratch env that list therefore holds one entry, and the
 * WL blades (store level AND organization level) offer a single choice — so a fixture that asks
 * for `Coffee` or `Watermelon` cannot be configured at all, by hand or by seeder.
 *
 * That is why this runs in the store phase next to `ensureCurrencies`: same shape of prerequisite.
 * A store can NAME a currency, but until the platform registers it nothing can select it; a WL
 * record can NAME a preset, but until the platform's dictionary carries it nothing can select it.
 *
 * ── WHERE THE NAMES COME FROM: THE FIXTURES THAT CONSUME THEM ───────────────────
 * Never a transcribed list (.claude/rules/test-data.md §GOLDEN RULE). The set of presets this
 * deployment must offer is exactly the set THIS REPO'S FIXTURES REFERENCE — `PRESET_SOURCES`
 * below names each referencing column, so adding a fixture that needs a new preset is already
 * the whole change. A hand-maintained copy of "the themes we use" would be correct once and then
 * silently drift out of step with the CSV a suite actually asserts on.
 *
 * ── ADDITIVE ONLY ───────────────────────────────────────────────────────────────
 * `POST /api/platform/settings` REPLACES a dictionary setting's value set (SettingEntity.FromModel
 * rebuilds SettingValues from `allowedValues`), so sending only what the fixtures need would DELETE
 * every preset an operator added by hand — including ones a client's own theme ships and this repo
 * has never heard of (vcst-qa carries `red`, which is not a vc-frontend bundled preset). This
 * module therefore only ever proposes a SUPERSET of what is live. Removing a dictionary value stays
 * a human decision.
 */

/* ── Where a preset name is referenced ──────────────────────────────────────────
 * One entry per fixture column that names a theme preset. `rows` are supplied by the caller (the
 * spec module never touches fs), keyed by `file`.
 */
export const PRESET_SOURCES = Object.freeze([
  Object.freeze({
    file: 'test-data/stores/stores.csv',
    column: 'theme_preset',
    what: 'the store-level white-labeling theme each seeded store declares',
  }),
  Object.freeze({
    file: 'test-data/white-labeling/organizations.csv',
    column: 'theme_preset',
    what: 'the org-level theme each WL fixture org overrides the store with',
  }),
]);

/**
 * The storefront's own normalizer, mirrored exactly:
 *   vc-frontend client-app/core/utilities/common/index.ts -> presetNameToFileName()
 *     `name.toLowerCase().replaceAll(" ", "-")`
 * `useThemeContext.addPresetToThemeContext()` runs the WL record's `themePresetName` through it and
 * resolves the result against the bundled presets (falling back to `settings_data.json.current`
 * when it misses). It is mirrored rather than imported because this repo does not build the
 * storefront — so it is kept to one line, and cited above so the next reader can re-check it.
 */
export function presetNameToFileName(name) {
  return String(name ?? '').toLowerCase().replaceAll(' ', '-');
}

/** Trim; treat null/undefined/whitespace as absent. */
const clean = (v) => String(v ?? '').trim();

/**
 * Derive the preset names the fixtures require.
 *
 * @param {Record<string, Array<Record<string,string>>>} rowsByFile  parsed CSV rows, keyed by the
 *        `file` of a PRESET_SOURCES entry. A missing/empty file contributes nothing (a deployment
 *        need not carry every fixture set).
 * @returns {{names:string[], references:Array<{name:string,file:string,column:string}>}}
 *          `names` in first-seen order, deduped CASE-INSENSITIVELY — the platform's own rule: the
 *          admin dictionary blade's `validateDictValue` rejects a ShortText duplicate ignoring
 *          case, so proposing both "Coffee" and "coffee" would propose a value the UI forbids.
 */
export function requiredPresetNames(rowsByFile = {}) {
  const names = [];
  const seen = new Set();
  const references = [];
  for (const src of PRESET_SOURCES) {
    for (const row of rowsByFile[src.file] || []) {
      const name = clean(row?.[src.column]);
      if (!name) continue;                       // a fixture with no theme is a valid fixture
      references.push({ name, file: src.file, column: src.column });
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      names.push(name);
    }
  }
  return { names, references };
}

/**
 * Merge the required names into the LIVE dictionary. Additive only — every live value survives,
 * in its live order, with the new ones appended.
 *
 * @param {string[]} liveAllowedValues  `allowedValues` from GET /api/platform/settings/{name}
 * @param {string[]} requiredNames      from requiredPresetNames()
 * @returns {{next:string[], added:string[], alreadyPresent:string[], changed:boolean}}
 *          `added` is what this write would contribute; empty ⇒ no write at all.
 */
export function mergeAllowedValues(liveAllowedValues, requiredNames) {
  const next = (liveAllowedValues || []).map(clean).filter(Boolean);
  const have = new Set(next.map((v) => v.toLowerCase()));   // case-insensitive, per the admin blade
  const added = [];
  const alreadyPresent = [];
  for (const name of requiredNames || []) {
    const n = clean(name);
    if (!n) continue;
    if (have.has(n.toLowerCase())) { alreadyPresent.push(n); continue; }
    have.add(n.toLowerCase());
    next.push(n);
    added.push(n);
  }
  return { next, added, alreadyPresent, changed: added.length > 0 };
}

/**
 * Names the STOREFRONT cannot tell apart: two distinct dictionary entries whose
 * `presetNameToFileName()` collapses to the same file name (e.g. "Purple Pink" and "purple-pink").
 * Both are legal dictionary values and the admin blade accepts both, but the storefront resolves
 * them to ONE preset — so a case asserting that org A and org B render differently would be
 * asserting a distinction that does not exist downstream. Reported, never auto-resolved: deleting
 * one is a human decision (see §ADDITIVE ONLY).
 *
 * @returns {Array<{fileName:string, names:string[]}>}  one entry per colliding group (2+ names)
 */
export function fileNameCollisions(allowedValues) {
  const byFile = new Map();
  for (const v of (allowedValues || []).map(clean).filter(Boolean)) {
    const f = presetNameToFileName(v);
    if (!byFile.has(f)) byFile.set(f, []);
    if (!byFile.get(f).includes(v)) byFile.get(f).push(v);
  }
  return [...byFile.entries()]
    .filter(([, names]) => names.length > 1)
    .map(([fileName, names]) => ({ fileName, names }));
}

/* ── Does the storefront actually have this preset? ──────────────────────────── */

/**
 * Classify a theme preset name against the preset set vc-frontend bundles
 * (`scripts/lib/theme-presets.generated.json`, produced by `npm run presets:sync`).
 *
 * `RESOLVES` is the only verdict that means anything on its own. `UNKNOWN` does NOT mean broken —
 * a deployment can run a different vc-frontend build, and a theme can drop extra presets into the
 * served `/assets/presets/<file>.json` that `loadPreset()` fetches at runtime. So the caller
 * treats UNKNOWN as "probe the live storefront, then warn", never as a failure.
 *
 * Getting this wrong in the confident direction is the expensive case and it has already happened:
 * on 2026-09-15 `red` was read as unresolvable because the repo's notes listed six presets and
 * `/assets/presets/red.json` 404s. Both signals were worthless — bundled presets are compiled into
 * the JS and never served as files, and `red` had been added upstream. The deployed bundle had it.
 *
 * @returns {{name:string, fileName:string, verdict:'RESOLVES'|'UNKNOWN', reason:string}}
 */
export function classifyPresetName(name, bundledPresets = []) {
  const fileName = presetNameToFileName(name);
  const bundled = (bundledPresets || []).map((p) => presetNameToFileName(p));
  if (bundled.includes(fileName)) {
    return { name: clean(name), fileName, verdict: 'RESOLVES', reason: `bundled by vc-frontend as ${fileName}.json` };
  }
  return {
    name: clean(name),
    fileName,
    verdict: 'UNKNOWN',
    reason: bundled.length
      ? `not among the ${bundled.length} presets vc-frontend bundles — either this deployment ships it under /assets/presets/${fileName}.json, or the storefront will silently fall back to the theme default`
      : 'no generated preset list to check against — run `npm run presets:sync`',
  };
}

/**
 * The body for `POST /api/platform/settings` — an ObjectSettingEntry[] of ONE entry, built by
 * SPREADING the live setting so nothing the platform sent back is dropped. `SettingEntity.FromModel`
 * reads `name`, `valueType`, `isDictionary` and `allowedValues`; a hand-rolled partial body that
 * omitted `valueType` would round-trip every value through the wrong converter, and one that
 * omitted `isDictionary` would store the whole list as a single scalar value.
 */
export function buildDictionaryUpdateBody(liveSetting, allowedValues) {
  return [{ ...liveSetting, allowedValues, value: null }];
}

/* ── The STORE-LEVEL white-labeling record ───────────────────────────────────────
 * Registering a preset in the dictionary only makes it SELECTABLE. What a store actually renders
 * comes from its own `WhiteLabelingSetting` record — `GET /api/white-labeling/store/{storeId}`,
 * created with POST and updated with PUT (vc-module-white-labeling's WhiteLabelingController).
 * `stores.csv` has carried a `theme_preset` column since the file was written and nothing ever
 * read it, so the declared store theme was fiction.
 *
 * ── PUT REPLACES. THIS IS THE 2026-08-27 SHAPE AGAIN ──────────────────────────
 * The WL record holds fields `stores.csv` knows NOTHING about — on vcst-qa, B2B-store's record
 * carries `logoUrl`, `footerLinkListName: "footer-links"` and `mainMenuLinkListName:
 * "catalog-menu"`. A body composed from the CSV alone — `{storeId, isEnabled, themePresetName}` —
 * is a complete WhiteLabelingSetting as far as the validator is concerned, so it saves, and it
 * takes the store's logo and both navigation menus with it. That is precisely the partial
 * `PUT /api/stores` that blanked four fields and took the storefront down, wearing a different
 * entity. Hence: spread the live record, move ONE field, and refuse the write if anything the
 * live record held would come back empty (`fieldsLostByWlWrite`).
 */

/** Fields the CSV cannot supply and must therefore never blank. Gated by fieldsLostByWlWrite. */
export const WL_PRESERVED_FIELDS = Object.freeze([
  'logoUrl', 'secondaryLogoUrl', 'faviconUrl', 'footerLinkListName', 'mainMenuLinkListName',
]);

/**
 * Compose the next store-level WL record.
 *
 * @param {object|null} live    the record from GET /api/white-labeling/store/{id} (null when none)
 * @param {{storeId:string, themePresetName:string, isEnabled?:boolean}} desired
 * @returns {{next:object|null, op:'create'|'update'|'noop', from:string|null, to:string|null}}
 *          `op:'noop'` ⇒ no request at all. On create, `isEnabled` comes from the CSV; on update it
 *          is LEFT ALONE — the live record's enabled state is an operator switch, and stores.csv
 *          declares a theme, not a decision to turn somebody's white labeling back on.
 */
export function mergeStoreWhiteLabeling(live, { storeId, themePresetName, isEnabled = true } = {}) {
  const theme = clean(themePresetName);
  if (!theme) return { next: null, op: 'noop', from: null, to: null };

  if (!live?.id) {
    return {
      next: { storeId, organizationId: null, userId: null, isEnabled: isEnabled !== false, themePresetName: theme },
      op: 'create',
      from: null,
      to: theme,
    };
  }
  const from = clean(live.themePresetName) || null;
  if (from && from.toLowerCase() === theme.toLowerCase()) return { next: null, op: 'noop', from, to: from };
  return { next: { ...live, themePresetName: theme }, op: 'update', from, to: theme };
}

/**
 * The WL twin of `fieldsLostByWrite` (store-defaults-specs.mjs): which fields the live record holds
 * that the composed body would blank. Empty ⇒ safe to send. Non-empty ⇒ the body was composed, not
 * merged — refuse it.
 */
export function fieldsLostByWlWrite(live, nextBody) {
  if (!live?.id) return [];
  const lost = [];
  for (const f of WL_PRESERVED_FIELDS) {
    if (!clean(live[f])) continue;             // already empty — this write is not what emptied it
    if (!clean(nextBody?.[f])) lost.push(f);
  }
  return lost;
}
