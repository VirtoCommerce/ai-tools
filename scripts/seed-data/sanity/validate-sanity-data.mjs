#!/usr/bin/env node
/**
 * scripts/seed-data/sanity/validate-sanity-data.mjs  (td:validate:sanity)
 *
 * STATIC drift guard for the VCST-6475 Sanity fixture (suite 114). No network. Owns the fixture's
 * NON-VACUITY contract — each check fails when a divergence a case relies on collapses:
 *   1. CONFLICT: one id in BOTH datasets, titles AND permalinks differ (priority rule observable);
 *   2. TYPE FILTER: LANDING_IN_PROD's type is NOT in the primary type list but IS in the secondary
 *      one (per-dataset filter observable); LANDING lives in secondary under a listed type;
 *      UNLISTED's type is in NO list; PAGE_A/PAGE_B/FOOTER types ARE in the primary list;
 *   3. SLUGS: PAGE_A has a permalink, PAGE_B has none but a seo.slug, all slugs distinct;
 *      SETTINGS carries no slug at all;
 *   4. DRAFT: DRAFT_A id = drafts.<PAGE_A id>, its title differs from PAGE_A's;
 *   5. REFS: no strong dangling reference (Sanity would 409); FOOTER keeps found + slug-less +
 *      weak-missing targets; the cross-dataset ref is weak;
 *   6. ASSETS: PAGE_A references both assets; the PNG builder emits a real PNG;
 *   7. hygiene: AGENT-TEST-6475- prefix on every id, no GUID/project id in the spec, every alias of
 *      the contract registered in aliases.json with the DERIVED business fields, asset id/url the ""
 *      placeholder in the base and never "" in an overlay (runtime → aliases.<env>.json; an overlay ""
 *      would shadow nothing and read as "seeded here"); the owner-marker type in no dataset list; PAGE_A's
 *      webhook decoy title differs from every title of page A; informational: this env's overlay.
 * Exit 1 on any violation.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';
import {
  SEED_PREFIX, DRAFT_PREFIX, DATASETS, DATASET_TYPES, DOC_SPECS, ASSET_SPECS, PLACEHOLDER_ASSETS, MISSING_DOC_ID,
  docsFor, allDatasets, strongDanglingRefs, collectRefs, baseAliases, tinyPng, findGuidLeaks, MARKER_TYPE, webhookDecoyTitle,
} from './sanity-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
// The env the session is bound to (TEST_ENV → session binding → .env.test-env → vcst), as the loader picks it.
const TEST_ENV = resolveTestEnv();
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const check = (c, okMsg, failMsg) => (c ? ok(okMsg) : fail(failMsg));

const P = DATASETS.primary; const S = DATASETS.secondary;
const doc = (alias, ds) => { const s = DOC_SPECS.find((x) => x.alias === alias && (!ds || x.dataset === ds)); return s ? s.build(PLACEHOLDER_ASSETS) : null; };
const slugOf = (d) => d?.permalink?.current || d?.seo?.slug?.current || null;

console.log('=== validate Sanity fixture (VCST-6475, static drift guard) ===');

// 1. CONFLICT
const cP = doc('SANITY_DOC_CONFLICT', P); const cS = doc('SANITY_DOC_CONFLICT', S);
check(cP && cS && cP._id === cS._id && cP.title !== cS.title && slugOf(cP) !== slugOf(cS),
  `CONFLICT: ${cP?._id} in both datasets, titles differ ("${cP?.title}" / "${cS?.title}")`, 'CONFLICT: same-id pair missing or titles/permalinks equal');

// 2. TYPE FILTER
const tP = DATASET_TYPES[P]; const tS = DATASET_TYPES[S];
const lip = doc('SANITY_DOC_LANDING_IN_PROD', P); const land = doc('SANITY_DOC_LANDING', S); const unl = doc('SANITY_DOC_UNLISTED', P);
check(lip && !tP.includes(lip._type) && tS.includes(lip._type), `LANDING_IN_PROD: type ${lip?._type} ∉ ${P} [${tP}] but ∈ ${S} [${tS}]`, 'LANDING_IN_PROD: per-dataset type divergence collapsed');
check(land && tS.includes(land._type) && docsFor(S).some((d) => d._id === land._id) && !docsFor(P).some((d) => d._id === land._id), `LANDING: ${land?._type} listed for ${S}, seeded only there`, 'LANDING: not a listed type in secondary only');
check(unl && !tP.includes(unl._type) && !tS.includes(unl._type), `UNLISTED: type ${unl?._type} in no dataset list`, 'UNLISTED: type appears in a dataset list');
const listed = ['SANITY_DOC_PAGE_A', 'SANITY_DOC_PAGE_B', 'SANITY_DOC_FOOTER'].filter((a) => !tP.includes(doc(a, P)?._type));
check(!listed.length, 'PAGE_A / PAGE_B / FOOTER types are in the primary list', `types not in primary list: ${listed.join(', ')}`);
const secPage = doc('SANITY_DOC_SEC_PAGE', S);
check(secPage && tS.includes(secPage._type) && !docsFor(P).some((d) => d._id === secPage._id), 'SEC_PAGE: listed type, secondary only', 'SEC_PAGE contract broken');

// 3. SLUGS
const a = doc('SANITY_DOC_PAGE_A', P); const b = doc('SANITY_DOC_PAGE_B', P); const st = doc('SANITY_DOC_SETTINGS', P);
check(a?.permalink?.current && !b?.permalink && b?.seo?.slug?.current, `PAGE_B: no permalink, seo.slug ${b?.seo?.slug?.current}`, 'PAGE_A/PAGE_B permalink-vs-seo divergence collapsed');
check(st && !slugOf(st) && !tP.includes(st._type), `SETTINGS: ${st?._type}, no slug, outside the primary list`, 'SETTINGS: gained a slug or entered the primary list');
const published = allDatasets().flatMap((ds) => docsFor(ds).filter((d) => !d._id.startsWith(DRAFT_PREFIX)).map((d) => `${ds}:${slugOf(d)}`)).filter((x) => !x.endsWith(':null'));
check(new Set(published).size === published.length, `published slugs distinct per dataset (${published.length})`, 'duplicate slug within a dataset');

// 4. DRAFT
const dr = doc('SANITY_DOC_DRAFT_A', P);
check(dr && dr._id === `${DRAFT_PREFIX}${a._id}` && dr.title !== a.title, `DRAFT_A: ${dr?._id}, title differs from published`, 'DRAFT_A: id or title divergence broken');
const decoy = webhookDecoyTitle(a.title);
check(decoy !== a.title && decoy !== dr?.title, 'PAGE_A: webhook decoy title differs from the published and the draft title', 'PAGE_A: webhook decoy title collapsed onto a real title');

// 5. REFS
for (const ds of allDatasets()) { const bad = strongDanglingRefs(ds); check(!bad.length, `${ds}: no strong dangling reference`, `${ds}: strong dangling ref(s) ${bad.join('; ')}`); }
const fr = collectRefs(doc('SANITY_DOC_FOOTER', P));
check(fr.some((r) => r._ref === a._id) && fr.some((r) => r._ref === b._id) && fr.some((r) => r._ref === st._id) && fr.some((r) => r._ref === MISSING_DOC_ID && r._weak),
  `FOOTER: refs page-a, page-b, settings + weak missing (${fr.length} refs)`, 'FOOTER: a link-resolution class is gone');
check(collectRefs(secPage).every((r) => r._weak), 'SEC_PAGE: cross-dataset ref is weak', 'SEC_PAGE: strong cross-dataset ref');

// 6. ASSETS
const aRefs = collectRefs(a).map((r) => r._ref);
check(aRefs.includes(PLACEHOLDER_ASSETS.image) && aRefs.includes(PLACEHOLDER_ASSETS.file), 'PAGE_A references image + file assets', 'PAGE_A lost an asset reference');
check(tinyPng().subarray(1, 4).toString() === 'PNG', 'PNG builder emits a PNG header', 'PNG builder broken');

// 7. hygiene
const ids = allDatasets().flatMap((ds) => docsFor(ds).map((d) => d._id));
const unprefixed = ids.filter((x) => !x.replace(DRAFT_PREFIX, '').startsWith(SEED_PREFIX));
check(!unprefixed.length, `all ${ids.length} document ids carry ${SEED_PREFIX}`, `unprefixed ids: ${unprefixed.join(', ')}`);
check(!Object.values(DATASET_TYPES).some((t) => t.includes(MARKER_TYPE)), `owner marker type ${MARKER_TYPE} is in no dataset list (never indexed)`, `owner marker type ${MARKER_TYPE} entered a dataset list`);
check(ASSET_SPECS.every((x) => x.filename.startsWith('AGENT-TEST-6475')), 'asset filenames carry the AGENT-TEST-6475 handle', 'asset filename without the teardown handle');
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/sanity/sanity-specs.mjs'), 'utf8');
check(!findGuidLeaks(specSrc).length && !/[a-z0-9]{8}\.api\.sanity\.io|cdn\.sanity\.io\/(images|files)\/[a-z0-9]+/.test(specSrc),
  'spec carries no GUID, project host or CDN url', 'spec leaks a GUID / project id / CDN url');

const registry = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const want = baseAliases();
let regBad = 0;
for (const [alias, fields] of Object.entries(want)) {
  const r = registry[alias];
  if (!r) { fail(`alias ${alias} not registered in aliases.json`); regBad++; continue; }
  for (const [k, v] of Object.entries(fields)) if (String(r[k] ?? '') !== String(v)) { fail(`alias ${alias}.${k} = "${r[k]}" ≠ spec "${v}"`); regBad++; }
  if (findGuidLeaks(JSON.stringify(r)).length) { fail(`alias ${alias} carries a GUID`); regBad++; }
}
if (!regBad) ok(`all ${Object.keys(want).length} aliases registered, fields = spec, asset id/url empty in base`);
for (const name of readdirSync(join(ROOT, 'test-data')).filter((n) => /^aliases\..+\.json$/.test(n))) {
  let reg; try { reg = JSON.parse(readFileSync(join(ROOT, 'test-data', name), 'utf8')); } catch { continue; }
  for (const x of ASSET_SPECS) for (const k of ['id', 'url']) if (reg[x.alias]?.[k] === '') fail(`${name}: ${x.alias}.${k} is "" — it resolves as a value; drop it or write null`);
}

const ovPath = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
const ov = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, 'utf8')) : {};
const seeded = ASSET_SPECS.filter((x) => ov[x.alias]?.id && ov[x.alias]?.url);
console.log(`  · info: aliases.${TEST_ENV}.json asset fields ${seeded.length}/${ASSET_SPECS.length} populated${seeded.length ? '' : ` — seed with TEST_ENV=${TEST_ENV} npm run seed:sanity`}`);
for (const x of seeded) if (!ov[x.alias].url.includes(`/${P}/`)) fail(`${x.alias}.url is not in the ${P} dataset`);

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
