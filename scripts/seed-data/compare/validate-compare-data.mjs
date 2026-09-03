#!/usr/bin/env node
/**
 * STATIC drift guard for the `/compare` test-data domain (VCST-5735). No network, no env needed.
 *
 *   npm run td:validate:compare
 *
 * Two jobs, and the second is the one that matters:
 *   (a) the ordinary hygiene every domain guard does — the committed CSV still matches
 *       compare-specs.mjs, no runtime GUID leaked into it, every alias is wired the way the seeder's
 *       writeback expects;
 *   (b) VACUITY. This fixture set exists to make three of the compare page's decisions DECIDABLE,
 *       and each of the three collapses silently under an innocent edit:
 *         - equalise a quantity and the render-loop pair proves nothing (§SECOND RULE);
 *         - equalise the raw values behind a formatted-string collision and the `differs`-over-
 *           formatted-strings defect becomes untestable;
 *         - rename one of the two same-named nested categories and the tab-label collision is gone.
 *       None of those show up as an error anywhere else, which is why they are asserted here.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  PRODUCTS, CSV_COLUMNS, CSV_PATH, CSV_FILE_KEY, csvRowFor,
  validateSpecShape, quantityDivergence, formatCollisionProblems,
  QUANTITY_DIVERGENCE_FIELDS, COMPARE_LIMIT_PER_CATEGORY, CATEGORY_PATHS,
  variationPriceDivergence, variationsOf, hasVariations, minVariationPrice,
  formatMoney, variationLinkCount, byAlias,
} from './compare-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/i;

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

// [1] The spec module is internally coherent + discriminating (shared with the seeder's pre-flight).
for (const p of validateSpecShape()) fail(`[1] spec: ${p}`);

// [2] The committed CSV exists and carries the exact column contract.
const csvAbs = join(ROOT, CSV_PATH);
if (!existsSync(csvAbs)) {
  fail(`[2] ${CSV_PATH} is missing — the @td registry for every PROD_CMP_* alias`);
} else {
  const text = readFileSync(csvAbs, 'utf8');
  const rows = parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true });
  const header = Object.keys(rows[0] || {});
  if (header.join(',') !== CSV_COLUMNS.join(',')) {
    fail(`[2] ${CSV_PATH} header is\n      ${header.join(',')}\n    expected\n      ${CSV_COLUMNS.join(',')}`);
  }

  // [3] Every derivable cell matches the spec — the CSV is a MIRROR, never a second source.
  const byId = Object.fromEntries(rows.map((r) => [r.cmp_id, r]));
  for (const rec of PRODUCTS) {
    const row = byId[rec.cmpId];
    if (!row) { fail(`[3] ${rec.cmpId} (${rec.alias}) is in compare-specs.mjs but not in the CSV`); continue; }
    for (const [col, want] of Object.entries(csvRowFor(rec))) {
      const got = String(row[col] ?? '');
      if (got !== String(want)) fail(`[3] ${rec.cmpId}.${col}: CSV has "${got}", compare-specs.mjs derives "${want}"`);
    }
    if (!String(row.test_purpose || '').trim()) warn(`[3] ${rec.cmpId} has an empty test_purpose`);
    if (!String(row.notes || '').trim()) warn(`[3] ${rec.cmpId} has an empty notes cell`);
  }
  for (const r of rows) if (!PRODUCTS.some((p) => p.cmpId === r.cmp_id)) fail(`[3] CSV row ${r.cmp_id} has no compare-specs.mjs entry — the seeder would never create it, so any case naming it resolves a fixture that does not exist`);

  // [4] NO runtime GUID in the committed CSV. platform_id is filled per env in aliases.<env>.json;
  //     a GUID here would resolve to another env's entity on every other env.
  rows.forEach((r, i) => {
    for (const [col, v] of Object.entries(r)) {
      if (GUID_RE.test(String(v ?? ''))) fail(`[4] runtime GUID in ${CSV_PATH} row ${i + 2} column "${col}" — ids belong in aliases.<env>.json only`);
    }
    if (String(r.platform_id || '').trim()) fail(`[4] ${r.cmp_id}: platform_id must stay BLANK in the committed CSV`);
  });
}

// [5] Alias wiring — the seeder writes back with syncEnvAliases(CSV_FILE_KEY, {<cmp_id>: {platform_id}}),
//     which only reaches an alias whose `file` is this CSV, whose `filter` selects by cmp_id, and
//     whose `fields` declare an id ← platform_id mapping. A drift here makes the writeback a silent
//     no-op: the seed reports success and @td(ALIAS.id) stays empty.
const aliasesPath = join(ROOT, 'test-data/aliases.json');
const aliases = JSON.parse(readFileSync(aliasesPath, 'utf8'));
for (const rec of PRODUCTS) {
  const a = aliases[rec.alias];
  if (!a) { fail(`[5] alias ${rec.alias} is not registered in test-data/aliases.json`); continue; }
  if (a.file !== CSV_FILE_KEY) fail(`[5] ${rec.alias}.file is "${a.file}", expected "${CSV_FILE_KEY}"`);
  if (a.filter?.cmp_id !== rec.cmpId) fail(`[5] ${rec.alias}.filter.cmp_id is "${a.filter?.cmp_id}", expected "${rec.cmpId}"`);
  if (a.fields?.id !== 'platform_id') fail(`[5] ${rec.alias}.fields.id must map to "platform_id" (got "${a.fields?.id}") — syncEnvAliases writes the runtime GUID onto that column, so any other mapping makes the writeback a no-op`);
  for (const f of ['sku', 'name', 'url', 'slug']) if (!a.fields?.[f]) fail(`[5] ${rec.alias}.fields.${f} is missing — a case cannot navigate to or assert on this fixture without it`);
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === 'string' && GUID_RE.test(v) && k !== 'notes') fail(`[5] ${rec.alias}.${k} carries a runtime GUID`);
  }
}
const owned = new Set(PRODUCTS.map((r) => r.alias));
for (const [name, def] of Object.entries(aliases)) {
  if (def?.file === CSV_FILE_KEY && !owned.has(name)) fail(`[5] alias ${name} points at ${CSV_FILE_KEY} but compare-specs.mjs does not own it`);
}

// [6] VACUITY, restated loudly. validateSpecShape already runs these, but they are the checks whose
//     failure mode is a green suite rather than a red one, so they are reported under their own
//     heading instead of being buried in a list of shape errors.
const qd = quantityDivergence();
const fc = formatCollisionProblems();
for (const p of qd) fail(`[6] VACUITY (quantity divergence, ${QUANTITY_DIVERGENCE_FIELDS.join('/')}): ${p}`);
for (const p of fc) fail(`[6] VACUITY (formatted-string collision): ${p}`);

// [8] VACUITY — the hasVariations branch. Its own heading for the same reason as [6]: the failure
//     mode is a GREEN suite. `getDisplayPrice(product)` returns minVariationPrice when hasVariations
//     is true and price otherwise, and it feeds both the Price row and the `differs` computation —
//     so if the two are EQUAL the column renders one string on either branch and every case built
//     on the fixture is a guaranteed pass. That is not hypothetical: it is the state
//     INV_VARIATION_MASTER is in (price == minVariationPrice == $59.99), which is why it could not
//     be reused and this fixture exists.
for (const p of variationPriceDivergence()) fail(`[8] VACUITY (variation price divergence): ${p}`);

// [9] The variation columns of the CSV are DERIVED, so they cannot disagree with the spec — but a
//     hand-edit that emptied them would leave a case resolving @td(...minVariationPrice) to "" and
//     asserting nothing, which reads exactly like a pass.
for (const rec of PRODUCTS.filter(hasVariations)) {
  const row = csvRowFor(rec);
  if (row.min_variation_price !== String(minVariationPrice(rec))) {
    fail(`[9] ${rec.cmpId}.min_variation_price derives "${row.min_variation_price}" but the spec's minimum variation price is ${minVariationPrice(rec)}`);
  }
  if (row.variation_count !== String(variationsOf(rec).length)) {
    fail(`[9] ${rec.cmpId}.variation_count derives "${row.variation_count}" but the spec declares ${variationsOf(rec).length} variation(s)`);
  }
}
// A plain product must NOT advertise variation data — a non-empty min_variation_price on a plain row
// would let a case assert the variations semantic against a product that never takes that branch.
for (const rec of PRODUCTS.filter((r) => !hasVariations(r))) {
  const row = csvRowFor(rec);
  if (row.min_variation_price !== '') fail(`[9] ${rec.cmpId} has no variations but carries min_variation_price "${row.min_variation_price}"`);
  if (row.variation_count !== '0') fail(`[9] ${rec.cmpId} has no variations but carries variation_count "${row.variation_count}"`);
}

// [7] The env overlays. Informational: an unseeded env resolves the id to "" (a clear miss), never
//     another env's value — so this is a report of WHERE the fixtures are provisioned, not a gate.
for (const env of ['vcst', 'vcptcore', 'virtostart']) {
  const p = join(ROOT, `test-data/aliases.${env}.json`);
  if (!existsSync(p)) continue;
  const o = JSON.parse(readFileSync(p, 'utf8'));
  const have = PRODUCTS.filter((r) => o[r.alias]?.id);
  console.log(`  [7] aliases.${env}.json: ${have.length}/${PRODUCTS.length} compare fixtures carry a runtime id`);
  if (have.length && have.length < PRODUCTS.length) {
    warn(`[7] aliases.${env}.json is PARTIALLY seeded (${have.length}/${PRODUCTS.length}) — re-run \`TEST_ENV=${env} npm run seed:compare\``);
  }
}

// ---------------------------------------------------------------------------
console.log(`\nCompare fixtures: ${PRODUCTS.length} products across ${new Set(PRODUCTS.map((r) => r.categoryPath)).size} tabs`);
console.log(`  Group A holds ${PRODUCTS.filter((r) => r.categoryPath === CATEGORY_PATHS.A).length} products against a per-category limit of ${COMPARE_LIMIT_PER_CATEGORY}`);
{
  const v = byAlias.PROD_CMP_VARIATIONS;
  if (v) {
    console.log(`  hasVariations branch: ${v.alias} — price ${formatMoney(v.listPrice)} vs minVariationPrice ${formatMoney(minVariationPrice(v))}`
      + ` across ${variationsOf(v).length} variations (the compare link renders ${variationLinkCount(v)})`);
  }
}
for (const w of warnings) console.log(`  ⚠ ${w}`);
if (problems.length) {
  console.error(`\n❌ td:validate:compare — ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('\n✅ td:validate:compare — clean');
