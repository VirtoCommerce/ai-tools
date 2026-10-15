#!/usr/bin/env node
/**
 * scripts/seed-data/cms/validate-pagebuilder-assets-data.mjs  (td:validate:cms-assets)
 *
 * STATIC drift-guard for the VCST-5726 Page Builder Asset Library fixture (no network).
 * Owns the NON-VACUITY contract — every check below fails when a divergence the run depends on
 * collapses:
 *   1. P500: 500 unique names, and the seeded shuffle puts a DIFFERENT file first/last by upload
 *      than by name (else a sort-by-date bug is invisible);
 *   2. MIXED: ≥ 1 non-image file, sorting BEFORE the first image (else an ignored accept filter is
 *      invisible), and the image count ≠ the folder total;
 *   3. FOLDERS: totalCount ≠ fileCount, and > 20 children (spans a second page at size 20);
 *   4. DEEP: ≥ 5 levels, ≥ 2 sibling branches, the deep reference sits at the leaf;
 *   5. EMPTY: zero children; TPL: names carry a `{{=` template marker;
 *   6. REFS: page-ref counts are DERIVED from REF_PAGES and must equal the declared expectations,
 *      shared-component counts DERIVED from SHARED_COMPONENTS likewise; the p500 TOTALS (pages + components)
 *      must be pairwise DISTINCT (1 / 3 / 4), and the assets place on page 1 / page 2 / the last page at
 *      size 20 by name; at least one p500 asset has 0 refs;
 *   7. hygiene: AGENT-TEST- prefixes, no runtime GUID in the spec, aliases registered + GUID-free.
 * Exit 1 on any violation.
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROOT_NAME, PAGE_PREFIX, SC_PREFIX, SHARED_COMPONENTS, scRefCounts, FOLDERS, DEEP_ALIAS, DEEP_LEVELS, DEEP_BRANCHES, REF_ASSETS, REF_PAGES,
  deepFolders, expectedCounts, uploadOrder, pageRefCounts, findGuidLeaks, tinyPng, tinyPdf, storeAssetRoot,
} from './pagebuilder-assets-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const check = (cond, okMsg, failMsg) => (cond ? ok(okMsg) : fail(failMsg));
const byKey = (k) => FOLDERS.find((f) => f.key === k);
const PAGE_SIZE = 20;

console.log('=== validate PB asset library fixture (VCST-5726, static drift-guard) ===');

// 1. P500
const p500 = byKey('P500');
const names = [...p500.files].sort();
const up = uploadOrder(p500);
check(p500.files.length === 500 && new Set(p500.files).size === 500, 'P500: 500 unique names', `P500: ${p500.files.length} files, ${new Set(p500.files).size} unique`);
check(up[0] !== names[0] && up.at(-1) !== names.at(-1) && up[0] !== names.at(-1) && up.at(-1) !== names[0],
  `P500: upload order diverges from name order (first ${up[0]}, last ${up.at(-1)})`, 'P500: shuffle collapsed — first/last by upload coincides with name order');

// 2. MIXED
const mixed = byKey('MIXED'); const mSorted = [...mixed.files].sort();
const mImgs = mSorted.filter((n) => n.endsWith('.png'));
check(mSorted[0].endsWith('.pdf') && mImgs.length < mixed.files.length && mImgs.length > PAGE_SIZE,
  `MIXED: non-image sorts first (${mSorted[0]}); images ${mImgs.length} ≠ total ${mixed.files.length}; first image ${mImgs[0]}`, 'MIXED: accept-filter divergence collapsed');

// 3. FOLDERS
const fc = expectedCounts('folders');
check(fc.totalCount !== fc.fileCount && fc.folderCount > 0 && fc.totalCount > PAGE_SIZE,
  `FOLDERS: total ${fc.totalCount} ≠ files ${fc.fileCount}, spans > 1 page`, `FOLDERS: total/file divergence collapsed (${JSON.stringify(fc)})`);

// 4. DEEP
const deep = deepFolders();
const leaf = deep.filter((d) => /\/l\d+$/.test(d.rel)).at(-1);
const deepRef = REF_ASSETS.find((a) => a.rel.startsWith('deep/'));
check(DEEP_LEVELS >= 5 && DEEP_BRANCHES >= 2 && deepRef && deepRef.rel.startsWith(`${leaf.rel}/`) && leaf.files.includes(deepRef.rel.split('/').pop()),
  `DEEP: ${DEEP_LEVELS} levels + ${DEEP_BRANCHES} branches, reference at the leaf (${deepRef?.rel})`, 'DEEP: depth/branches/leaf-reference contract broken');

// 5. EMPTY + TPL
const ec = expectedCounts('empty');
check(ec.totalCount === 0, 'EMPTY: zero children', `EMPTY: ${ec.totalCount} children`);
const tpl = FOLDERS.filter((f) => f.key.startsWith('TPL'));
check(tpl.length === 2 && tpl.every((f) => (f.rel + f.files.join('')).includes('{{=')), 'TPL: folder + file carry a {{= marker', 'TPL: template-literal marker missing');

// 6. REFS
const derived = pageRefCounts(); const derivedSc = scRefCounts();
let refBad = 0;
for (const a of REF_ASSETS) if ((derived[a.rel] || 0) !== a.expectedPageRefs) { fail(`REFS ${a.rel}: derived ${derived[a.rel] || 0} pages ≠ declared ${a.expectedPageRefs}`); refBad++; }
for (const a of REF_ASSETS) if ((derivedSc[a.rel] || 0) !== a.expectedScRefs) { fail(`REFS ${a.rel}: derived ${derivedSc[a.rel] || 0} components ≠ declared ${a.expectedScRefs}`); refBad++; }
for (const sc of SHARED_COMPONENTS) for (const r of sc.assets) if (!REF_ASSETS.some((a) => a.rel === r)) { fail(`REFS: component ${sc.n} references undeclared asset ${r}`); refBad++; }
for (const p of REF_PAGES) for (const r of p.assets) if (!REF_ASSETS.some((a) => a.rel === r)) { fail(`REFS: page ${p.n} references undeclared asset ${r}`); refBad++; }
const p500Refs = REF_ASSETS.filter((a) => a.rel.startsWith('p500/'));
const pc = p500Refs.map((a) => a.expectedPageRefs);
if (new Set(pc).size !== pc.length) { fail(`REFS: p500 page-ref counts not distinct (${pc.join(',')})`); refBad++; }
const tc = p500Refs.map((a) => a.expectedPageRefs + a.expectedScRefs);
if (new Set(tc).size !== tc.length) { fail(`REFS: p500 TOTAL ref counts not pairwise distinct (${tc.join(',')})`); refBad++; }
const pageOf = (rel) => Math.floor(names.indexOf(rel.split('/').pop()) / PAGE_SIZE) + 1;
const lastPage = Math.ceil(names.length / PAGE_SIZE);
const pages = p500Refs.map((a) => pageOf(a.rel));
if (!(pages.includes(1) && pages.includes(2) && pages.includes(lastPage))) { fail(`REFS: p500 refs must land on page 1, 2 and ${lastPage} (got ${pages.join(',')})`); refBad++; }
if (!names.some((n) => !derived[`p500/${n}`])) { fail('REFS: no unreferenced p500 asset'); refBad++; }
if (!refBad) ok(`REFS: derived = declared, p500 totals distinct ${tc.join('/')} (${p500Refs.map((a) => `${a.rel.split('/').pop()}=${a.expectedPageRefs}p+${a.expectedScRefs}sc`).join(', ')}), distinct, on pages ${pages.join('/')} of ${lastPage}`);

// 7. hygiene
check(ROOT_NAME.startsWith('AGENT-TEST-') && PAGE_PREFIX.startsWith('AGENT-TEST-') && SC_PREFIX.startsWith('AGENT-TEST-'), 'AGENT-TEST- prefixes', 'missing AGENT-TEST- prefix');
check(storeAssetRoot('X') === '/stores/X/Page Builder', 'fixture root derived from the store id', 'storeAssetRoot shape changed');
check(tinyPng('a.png').subarray(1, 4).toString() === 'PNG' && tinyPdf('a').subarray(0, 5).toString() === '%PDF-', 'file builders emit real PNG/PDF headers', 'file builders broken');
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/cms/pagebuilder-assets-specs.mjs'), 'utf8');
const leaks = findGuidLeaks(specSrc);
check(!leaks.length, 'spec module carries no runtime GUID', `spec module leaks GUID(s): ${leaks.join(', ')}`);
const registry = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const want = [...new Set([...FOLDERS.map((f) => f.alias), DEEP_ALIAS, 'PB_ASSETS_ROOT', 'PB_ASSET_REF_SC', ...REF_ASSETS.map((a) => a.alias)])];
const missing = want.filter((a) => !registry[a]);
const dirty = want.filter((a) => registry[a] && findGuidLeaks(JSON.stringify(registry[a])).length);
check(!missing.length && !dirty.length, `all ${want.length} aliases registered + GUID-free in aliases.json`, `aliases missing [${missing.join(', ')}] / GUID-leaking [${dirty.join(', ')}]`);

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
