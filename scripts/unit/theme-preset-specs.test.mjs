/**
 * Unit tests for scripts/seed-data/store/theme-preset-specs.mjs — the white-labeling theme-preset
 * dictionary (`WhiteLabeling.ThemePresetNames`). Pure logic only: no network, no env, no fs.
 *
 * The tests are written against the three ways this seeder could be WORSE THAN NOT SEEDING:
 *
 *   (a) It could DELETE presets. `POST /api/platform/settings` rebuilds a dictionary's value set
 *       from `allowedValues` (SettingEntity.FromModel), so a merge that dropped a live value would
 *       silently remove an operator-added preset — vcst-qa carries `red`, which is in no vc-frontend
 *       bundle and exists only because somebody typed it. §2 pins additive-only behaviour.
 *
 *   (b) It could propose a value the admin UI forbids. The dictionary blade's `validateDictValue`
 *       rejects a ShortText duplicate IGNORING CASE, so proposing "coffee" beside a live "Coffee"
 *       proposes an unsaveable list. §1/§2 pin case-insensitive dedupe on both sides.
 *
 *   (c) It could register names the storefront cannot tell apart. `presetNameToFileName` collapses
 *       "Purple Pink" and "purple-pink" to one preset, so a case asserting two orgs render
 *       differently would assert a distinction that does not survive to the browser. §3.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PRESET_SOURCES, presetNameToFileName, requiredPresetNames,
  mergeAllowedValues, fileNameCollisions, buildDictionaryUpdateBody,
  classifyPresetName, mergeStoreWhiteLabeling, fieldsLostByWlWrite, WL_PRESERVED_FIELDS,
} from '../seed-data/store/theme-preset-specs.mjs';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const generated = () => JSON.parse(readFileSync(join(REPO_ROOT, 'scripts/lib/theme-presets.generated.json'), 'utf8'));

const STORES = 'test-data/stores/stores.csv';
const ORGS = 'test-data/white-labeling/organizations.csv';

/** The live vcst-qa setting, transcribed from GET /api/platform/settings/WhiteLabeling.ThemePresetNames. */
const liveSetting = () => ({
  itHasValues: true,
  objectId: null,
  objectType: null,
  isReadOnly: false,
  value: null,
  id: 'f72f3625-e325-40d2-81ad-d8bdb34c9007',
  moduleId: 'VirtoCommerce.WhiteLabeling',
  groupName: 'WhiteLabeling|General',
  name: 'WhiteLabeling.ThemePresetNames',
  valueType: 'ShortText',
  allowedValues: ['Default', 'Mercury', 'red', 'Watermelon', 'Coffee', 'black-gold', 'Purple Pink'],
  defaultValue: 'Default',
  isDictionary: true,
});

/* ── §0 The source list is declarative ───────────────────────────────────────── */

test('§0 every preset source names a file and a column', () => {
  assert.ok(PRESET_SOURCES.length >= 2);
  for (const s of PRESET_SOURCES) {
    assert.match(s.file, /\.csv$/);
    assert.equal(typeof s.column, 'string');
    assert.ok(s.column.length);
  }
  // Both fixture sets that carry a theme must be covered — the whole point is that the dictionary
  // is derived from the fixtures rather than transcribed.
  assert.ok(PRESET_SOURCES.some((s) => s.file === STORES));
  assert.ok(PRESET_SOURCES.some((s) => s.file === ORGS));
});

/* ── §1 Derivation from the fixtures ─────────────────────────────────────────── */

test('§1 collects every theme_preset across both fixture files, first-seen order', () => {
  const { names } = requiredPresetNames({
    [STORES]: [{ theme_preset: 'Coffee' }, { theme_preset: 'Default' }, { theme_preset: 'Coffee' }],
    [ORGS]: [{ theme_preset: 'Watermelon' }, { theme_preset: 'black-gold' }],
  });
  assert.deepEqual(names, ['Coffee', 'Default', 'Watermelon', 'black-gold']);
});

test('§1 a blank / missing theme_preset contributes nothing (a fixture with no theme is valid)', () => {
  const { names } = requiredPresetNames({
    [STORES]: [{ theme_preset: '' }, { theme_preset: '   ' }, {}, { theme_preset: null }],
    [ORGS]: [{ theme_preset: 'Coffee' }],
  });
  assert.deepEqual(names, ['Coffee']);
});

test('§1 dedupes case-insensitively — the admin blade forbids a case-variant duplicate', () => {
  const { names } = requiredPresetNames({
    [STORES]: [{ theme_preset: 'Coffee' }],
    [ORGS]: [{ theme_preset: 'coffee' }, { theme_preset: 'COFFEE' }],
  });
  assert.deepEqual(names, ['Coffee'], 'first spelling wins; no unsaveable case-variant pair');
});

test('§1 an absent fixture file contributes nothing rather than throwing', () => {
  const { names } = requiredPresetNames({ [ORGS]: [{ theme_preset: 'Coffee' }] });
  assert.deepEqual(names, ['Coffee']);
  assert.deepEqual(requiredPresetNames({}).names, []);
  assert.deepEqual(requiredPresetNames().names, []);
});

test('§1 references keep provenance for every occurrence, including the deduped ones', () => {
  const { references } = requiredPresetNames({
    [STORES]: [{ theme_preset: 'Coffee' }, { theme_preset: 'Coffee' }],
    [ORGS]: [{ theme_preset: 'coffee' }],
  });
  assert.equal(references.length, 3);
  assert.deepEqual(references.map((r) => r.file), [STORES, STORES, ORGS]);
});

/* ── §2 The merge is ADDITIVE, and it is the whole safety story ──────────────── */

test('§2 keeps every live value, in live order, and appends only what is new', () => {
  const live = liveSetting().allowedValues;
  const { next, added, changed } = mergeAllowedValues(live, ['Coffee', 'Safco', 'Watermelon']);
  assert.deepEqual(next.slice(0, live.length), live, 'no live value is dropped or reordered');
  assert.deepEqual(added, ['Safco']);
  assert.equal(changed, true);
  assert.ok(next.includes('red'), 'an operator-added preset this repo never declared survives');
});

test('§2 no write at all when the fixtures name nothing new', () => {
  const live = liveSetting().allowedValues;
  const { added, alreadyPresent, changed } = mergeAllowedValues(live, ['Coffee', 'Watermelon', 'black-gold', 'Purple Pink', 'Default']);
  assert.deepEqual(added, []);
  assert.equal(changed, false, 'changed:false is what suppresses the POST — idempotency lives here');
  assert.equal(alreadyPresent.length, 5);
});

test('§2 a case-variant of a live value is NOT added', () => {
  const { next, added } = mergeAllowedValues(['Coffee'], ['coffee', 'COFFEE']);
  assert.deepEqual(next, ['Coffee']);
  assert.deepEqual(added, []);
});

test('§2 two case-variants inside the SAME required list collapse to one', () => {
  const { next, added } = mergeAllowedValues(['Default'], ['Safco', 'safco']);
  assert.deepEqual(next, ['Default', 'Safco']);
  assert.deepEqual(added, ['Safco']);
});

test('§2 a fresh platform (code default ["Default"]) gains every fixture preset', () => {
  const { next, added } = mergeAllowedValues(['Default'], ['Coffee', 'Watermelon', 'black-gold', 'Purple Pink']);
  assert.deepEqual(next, ['Default', 'Coffee', 'Watermelon', 'black-gold', 'Purple Pink']);
  assert.equal(added.length, 4);
});

test('§2 tolerates a null/absent live list and blank live entries', () => {
  assert.deepEqual(mergeAllowedValues(null, ['Coffee']).next, ['Coffee']);
  assert.deepEqual(mergeAllowedValues(undefined, ['Coffee']).next, ['Coffee']);
  assert.deepEqual(mergeAllowedValues(['Default', '', '  '], ['Coffee']).next, ['Default', 'Coffee']);
});

test('§2 trims the names it writes — a stray CSV space is not a new preset', () => {
  const { next, added } = mergeAllowedValues(['Coffee'], ['  Coffee  ', ' Safco ']);
  assert.deepEqual(next, ['Coffee', 'Safco']);
  assert.deepEqual(added, ['Safco']);
});

/* ── §3 Storefront resolution: names that collapse to one preset ─────────────── */

test('§3 presetNameToFileName mirrors the storefront exactly', () => {
  assert.equal(presetNameToFileName('Coffee'), 'coffee');
  assert.equal(presetNameToFileName('Purple Pink'), 'purple-pink');
  assert.equal(presetNameToFileName('black-gold'), 'black-gold');
  assert.equal(presetNameToFileName('Default'), 'default');
  assert.equal(presetNameToFileName(null), '');
});

test('§3 flags two dictionary spellings the storefront renders identically', () => {
  const collisions = fileNameCollisions(['Purple Pink', 'purple-pink', 'Coffee']);
  assert.equal(collisions.length, 1);
  assert.equal(collisions[0].fileName, 'purple-pink');
  assert.deepEqual(collisions[0].names, ['Purple Pink', 'purple-pink']);
});

test('§3 the live vcst-qa dictionary has no collisions', () => {
  assert.deepEqual(fileNameCollisions(liveSetting().allowedValues), []);
});

test('§3 a repeated identical spelling is not a collision', () => {
  assert.deepEqual(fileNameCollisions(['Coffee', 'Coffee']), []);
});

/* ── §4 The request body ─────────────────────────────────────────────────────── */

test('§4 the update body spreads the live setting and carries the dictionary fields', () => {
  const live = liveSetting();
  const next = [...live.allowedValues, 'Safco'];
  const body = buildDictionaryUpdateBody(live, next);
  assert.equal(body.length, 1, 'ObjectSettingEntry[] of exactly one entry');
  const [entry] = body;
  // SettingEntity.FromModel reads these four; omitting any is a silently wrong write.
  assert.equal(entry.name, 'WhiteLabeling.ThemePresetNames');
  assert.equal(entry.valueType, 'ShortText');
  assert.equal(entry.isDictionary, true);
  assert.deepEqual(entry.allowedValues, next);
  // Global setting: the scope keys must round-trip as null, not vanish.
  assert.equal(entry.objectType, null);
  assert.equal(entry.objectId, null);
  assert.equal(entry.value, null, 'a dictionary carries its values in allowedValues, never in value');
});

test('§4 building the body does not mutate the live setting', () => {
  const live = liveSetting();
  const before = [...live.allowedValues];
  buildDictionaryUpdateBody(live, [...before, 'Safco']);
  assert.deepEqual(live.allowedValues, before);
});

/* ── §5 Resolvability — the generated list, and the mirror that must track it ─── */

test('§5 our mirrored normalizer still matches the one recorded from vc-frontend', () => {
  // The whole point of recording the upstream expression in the generated file: if
  // presetNameToFileName changes upstream, THIS fails rather than the seeder quietly
  // desynchronising from the storefront. `presets:check` catches the same drift in CI.
  const { normalizer } = generated();
  const probes = ['Coffee', 'Purple Pink', 'black-gold', 'MiXeD Case Name', 'Default'];
  // eslint-disable-next-line no-new-func
  const upstream = new Function('name', `return ${normalizer};`);
  for (const p of probes) assert.equal(presetNameToFileName(p), upstream(p), `mirror diverged on "${p}"`);
});

test('§5 every fixture theme_preset in the generated list is RESOLVES', () => {
  const { presets } = generated();
  for (const name of ['Coffee', 'Watermelon', 'black-gold', 'Purple Pink', 'Default', 'red']) {
    assert.equal(classifyPresetName(name, presets).verdict, 'RESOLVES', name);
  }
});

test('§5 a name outside the bundle is UNKNOWN, never a failure verdict', () => {
  const v = classifyPresetName('Safco', generated().presets);
  assert.equal(v.verdict, 'UNKNOWN');
  assert.equal(v.fileName, 'safco');
  assert.match(v.reason, /deployment|fall back/i, 'the reason must say UNKNOWN is not the same as broken');
});

test('§5 with no generated list, everything is UNKNOWN and says why', () => {
  const v = classifyPresetName('Coffee', []);
  assert.equal(v.verdict, 'UNKNOWN');
  assert.match(v.reason, /presets:sync/);
});

test('§5 classification is case- and space-insensitive, like the storefront', () => {
  const presets = ['purple-pink'];
  assert.equal(classifyPresetName('Purple Pink', presets).verdict, 'RESOLVES');
  assert.equal(classifyPresetName('PURPLE PINK', presets).verdict, 'RESOLVES');
});

/* ── §6 The store-level WL record — merged, never composed ───────────────────── */

/** The live vcst-qa B2B-store WL record, transcribed from GET /api/white-labeling/store/B2B-store. */
const liveWl = () => ({
  id: '0418f833-55fe-4afe-a4dd-58b7de9cd4a9',
  storeId: 'B2B-store',
  organizationId: null,
  userId: null,
  isEnabled: true,
  logoUrl: 'https://vcst-qa.govirto.com/cms-content/assets/customization/logo_B2B-store_1779365528907.svg',
  secondaryLogoUrl: null,
  faviconUrl: null,
  footerLinkListName: 'footer-links',
  mainMenuLinkListName: 'catalog-menu',
  themePresetName: 'red',
});

test('§6 an update moves ONLY themePresetName and keeps everything the CSV cannot supply', () => {
  const live = liveWl();
  const { next, op, from, to } = mergeStoreWhiteLabeling(live, { storeId: 'B2B-store', themePresetName: 'Coffee' });
  assert.equal(op, 'update');
  assert.equal(from, 'red');
  assert.equal(to, 'Coffee');
  assert.equal(next.themePresetName, 'Coffee');
  for (const f of WL_PRESERVED_FIELDS) assert.equal(next[f], live[f], `${f} must survive the merge`);
  assert.equal(next.id, live.id, 'the id is what makes this a PUT rather than a second record');
  assert.equal(next.isEnabled, true, 'isEnabled is the operator\'s switch — a theme declaration must not move it');
});

test('§6 THE INCIDENT SHAPE: a body composed from the CSV alone is refused', () => {
  const live = liveWl();
  // Exactly what a hand-rolled seeder would send, and exactly what the validator would accept.
  const composed = { storeId: 'B2B-store', isEnabled: true, themePresetName: 'Coffee' };
  const lost = fieldsLostByWlWrite(live, composed);
  assert.deepEqual(lost.sort(), ['footerLinkListName', 'logoUrl', 'mainMenuLinkListName']);
});

test('§6 the merged body loses nothing', () => {
  const live = liveWl();
  const { next } = mergeStoreWhiteLabeling(live, { storeId: 'B2B-store', themePresetName: 'Coffee' });
  assert.deepEqual(fieldsLostByWlWrite(live, next), []);
});

test('§6 a field already empty on the live record is not counted as lost', () => {
  const live = { ...liveWl(), logoUrl: null, footerLinkListName: '' };
  assert.deepEqual(fieldsLostByWlWrite(live, { mainMenuLinkListName: 'catalog-menu' }), []);
});

test('§6 no live record ⇒ create, with isEnabled from the CSV', () => {
  const a = mergeStoreWhiteLabeling(null, { storeId: 'B2C-store', themePresetName: 'Default', isEnabled: false });
  assert.equal(a.op, 'create');
  assert.equal(a.from, null);
  assert.equal(a.next.isEnabled, false);
  assert.equal(a.next.storeId, 'B2C-store');
  assert.equal(a.next.organizationId, null, 'the validator demands exactly one of storeId / organizationId');

  const b = mergeStoreWhiteLabeling(null, { storeId: 'B2C-store', themePresetName: 'Default' });
  assert.equal(b.next.isEnabled, true, 'default when the CSV says nothing');
});

test('§6 nothing to do when the live theme already matches, case-insensitively', () => {
  assert.equal(mergeStoreWhiteLabeling(liveWl(), { storeId: 'B2B-store', themePresetName: 'red' }).op, 'noop');
  assert.equal(mergeStoreWhiteLabeling(liveWl(), { storeId: 'B2B-store', themePresetName: 'RED' }).op, 'noop');
});

test('§6 a blank theme_preset is a noop, not a write of ""', () => {
  for (const v of ['', '   ', null, undefined]) {
    const r = mergeStoreWhiteLabeling(liveWl(), { storeId: 'B2B-store', themePresetName: v });
    assert.equal(r.op, 'noop', JSON.stringify(v));
    assert.equal(r.next, null);
  }
});

test('§6 fieldsLostByWlWrite says nothing about a record that does not exist yet', () => {
  assert.deepEqual(fieldsLostByWlWrite(null, { storeId: 'X' }), []);
});
