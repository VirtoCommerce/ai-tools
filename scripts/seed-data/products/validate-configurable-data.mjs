/**
 * scripts/seed-data/validate-configurable-data.mjs
 *
 * DRIFT GUARD for the configurable-product fixtures (multi-env model). The seeder's SPECS
 * (configurable-specs.mjs) are the single source of truth; test-data/products/configurable-products.csv
 * mirrors the BUSINESS fields for @td() resolution and carries NO runtime GUIDs (those live in
 * aliases.<env>.json, written per-env by the seeder). This validator does NOT regenerate the CSV
 * (its section_details / test_purpose / notes are hand-authored prose) — it asserts the CSV's
 * derivable business columns still match SPECS, and that no GUID leaked back into the CSV.
 *
 * Checks:
 *   1. Every spec has a CSV row whose name / base_price / sale_price / section_count /
 *      section_types match the spec (fail on divergence).
 *   2. No CFG CSV row carries a runtime GUID (product_id_guid, configuration_id, section/option
 *      ids must be blank — they belong in aliases.<env>.json).
 *   3. CFG CSV rows with no matching spec are reported (legacy/stale — not seeder-managed).
 *   4. CFG-034 (VCST-6027 checklist) keeps its non-vacuity contract (configurable-specs.mjs
 *      checklistContractProblems) and is registered in aliases.json.
 *   6. Stand-in specs (`aliasOverlay`): the alias exists in aliases.json; each `aliasPrices` field
 *      the cases assert on equals the spec arithmetic; and the non-vacuity contract holds — every
 *      Product option priced > 0 and distinct within its section (cases pick options.0, whose order
 *      is not controllable), sale < list where a sale is set, variations priced > 0 and distinct.
 *   5. Inline aliases bound to a spec (`_inline` + file/filter, e.g. CFG_FILE_HOODIE → CFG-FILE) keep
 *      their literal business fields equal to the spec/CSV, and keep runtime GUIDs out of the base file.
 *
 * Usage:  node scripts/seed-data/validate-configurable-data.mjs   (exit 1 on any hard problem)
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { SPECS, CHECKLIST_CONTRACT, checklistContractProblems, specPrice } from './configurable-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const CSV = join(ROOT, 'test-data', 'products', 'configurable-products.csv');
const rows = parse(readFileSync(CSV, 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
const byId = new Map(rows.map((r) => [r.product_id, r]));
const cfgRows = rows.filter((r) => /^CFG-/.test(r.product_id));

const GUID_COLS = ['product_id_guid', 'configuration_id', 'default_section_id', 'default_option_id', 'parent_section_id', 'parent_default_option_id', 'dependent_section_id', 'dependent_default_option_id'];
const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const money = (v) => (v == null || v === '' ? '' : Number(v).toFixed(2));

// 1. Specs ↔ CSV business fields.
console.log('\n[1] Every spec has a CSV row with matching business fields');
let matched = 0;
for (const s of SPECS) {
  const r = byId.get(s.csvId);
  if (!r) { fail(`spec ${s.csvId} (${s.name}): no CSV row`); continue; }
  const errs = [];
  if (r.product_name !== s.name) errs.push(`name "${r.product_name}" != spec "${s.name}"`);
  if ((r.base_price || '') !== money(s.basePrice)) errs.push(`base_price "${r.base_price}" != ${money(s.basePrice)}`);
  if ((r.sale_price || '') !== money(s.salePrice)) errs.push(`sale_price "${r.sale_price}" != "${money(s.salePrice)}"`);
  if ((r.section_count || '') !== String(s.sections.length)) errs.push(`section_count "${r.section_count}" != ${s.sections.length}`);
  const types = s.sections.map((x) => x.type).join(',');
  if ((r.section_types || '') !== types) errs.push(`section_types "${r.section_types}" != "${types}"`);
  if (errs.length) fail(`spec ${s.csvId}: ${errs.join('; ')}`); else matched++;
}
if (matched === SPECS.length) ok(`all ${SPECS.length} specs match their CSV business fields`);

// 2. No runtime GUIDs in the committed CSV.
console.log('\n[2] No runtime GUIDs in the CSV (ids live in aliases.<env>.json)');
let clean = 0;
for (const r of cfgRows) {
  const has = GUID_COLS.filter((c) => (r[c] || '').trim());
  if (has.length) fail(`row ${r.product_id}: GUID column(s) not blank: ${has.join(', ')} — must live in aliases.<env>.json`);
  else clean++;
}
if (clean === cfgRows.length) ok(`all ${cfgRows.length} CFG row(s) carry no GUIDs`);

// 3. Orphan CSV rows (no spec → not seeder-managed / drift-checked).
console.log('\n[3] CSV rows covered by a spec');
const specIds = new Set(SPECS.map((s) => s.csvId));
const orphans = cfgRows.filter((r) => !specIds.has(r.product_id)).map((r) => r.product_id);
if (orphans.length) warn(`${orphans.length} CFG CSV row(s) have no spec in configurable-specs.mjs — legacy/stale, NOT regenerated or drift-checked: ${orphans.join(', ')}`);
else ok('every CFG CSV row maps to a spec');

// 4. CFG-034 (VCST-6027 checklist) non-vacuity contract — the data must keep the clamp and all three
//    red link variants decidable, and its alias must be registered.
console.log(`\n[4] ${CHECKLIST_CONTRACT.csvId} checklist non-vacuity contract`);
const chk = SPECS.find((s) => s.csvId === CHECKLIST_CONTRACT.csvId);
const chkProblems = checklistContractProblems(chk);
for (const m of chkProblems) fail(`${CHECKLIST_CONTRACT.csvId}: ${m}`);
if (!chkProblems.length) ok(`${CHECKLIST_CONTRACT.csvId} discriminates: required root Product/Text/File, every Layers option long (no default), short-optioned required dependent Product, long section name`);
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const chkAliases = Object.entries(aliases).filter(([, d]) => d?.file === 'products/configurable-products' && d?.filter?.product_id === CHECKLIST_CONTRACT.csvId);
if (!chkAliases.length) fail(`${CHECKLIST_CONTRACT.csvId}: no alias in aliases.json points at it`);
else ok(`${CHECKLIST_CONTRACT.csvId} alias: ${chkAliases.map(([k]) => k).join(', ')}`);

// 5. Inline aliases that point at a spec (`_inline` + `filter.product_id`, e.g. CFG_FILE_HOODIE → CFG-FILE)
//    carry their business fields as literals, so they must still describe the seeded product: name /
//    price / url / slug, and — for a named File section — exactly one File section of that name and
//    required-ness. Runtime GUIDs mapped through `fields` must NOT also sit inline (overlay only).
console.log('\n[5] Inline aliases bound to a spec match it');
const MiB = 1024 * 1024;
let inlineSeen = 0;
for (const [name, d] of Object.entries(aliases)) {
  if (!d?._inline || d.file !== 'products/configurable-products' || !d.filter?.product_id) continue;
  inlineSeen++;
  const id = d.filter.product_id, s = SPECS.find((x) => x.csvId === id), r = byId.get(id);
  if (!s || !r) { fail(`${name}: filter.product_id ${id} has no spec/CSV row`); continue; }
  const errs = [];
  const eq = (field, want) => { if (d[field] !== undefined && d[field] !== want) errs.push(`${field} ${JSON.stringify(d[field])} != ${JSON.stringify(want)}`); };
  eq('productAlias', id); eq('productName', s.name); eq('basePrice', s.basePrice);
  eq('url', r.storefront_url); eq('slug', r.product_slug);
  if (d.url !== undefined) eq('fullUrl_template', `{{FRONT_URL}}${r.storefront_url}`);
  if (d.fileSectionName !== undefined) {
    const files = s.sections.filter((x) => x.type === 'File');
    if (files.length !== 1) errs.push(`spec has ${files.length} File sections — fileSectionName needs exactly one`);
    else { eq('fileSectionName', files[0].name); eq('fileSectionIsRequired', files[0].isRequired); }
  }
  if (d.maxFileSizeMb !== undefined && d.maxFileSizeBytes !== undefined && d.maxFileSizeMb * MiB !== d.maxFileSizeBytes) errs.push(`maxFileSizeBytes ${d.maxFileSizeBytes} != maxFileSizeMb ${d.maxFileSizeMb} × 1048576`);
  for (const f of Object.keys(d.fields || {})) if (d[f] !== undefined) errs.push(`${f} is a runtime field (fields.${f}) but also set inline`);
  if (errs.length) fail(`${name} → ${id}: ${errs.join('; ')}`); else ok(`${name} → ${id} matches spec + CSV`);
}
if (!inlineSeen) ok('no inline alias bound to a spec');

// 6. Stand-in alias contract + non-vacuity.
console.log('\n[6] Stand-in specs agree with their alias contract and stay discriminating');
const ALIASES = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const standins = SPECS.filter((s) => s.aliasOverlay);
let siOk = 0;
for (const s of standins) {
  const errs = [];
  const a = ALIASES[s.aliasOverlay.alias];
  if (!a) errs.push(`alias ${s.aliasOverlay.alias} missing from aliases.json`);
  for (const [field, expr] of Object.entries(s.aliasPrices || {})) {
    const want = specPrice(s, expr);
    if (a && Number(a[field]) !== want) errs.push(`${s.aliasOverlay.alias}.${field}=${a[field]} != spec ${expr}=${want}`);
  }
  for (const sec of s.sections.filter((x) => x.type === 'Product')) {
    const prices = sec.options.map((o) => Number(o.price));
    if (prices.some((p) => !(p > 0))) errs.push(`section "${sec.name}": an option is unpriced/$0 — options.0 picks would be undecidable`);
    if (new Set(prices).size !== prices.length) errs.push(`section "${sec.name}": option prices not distinct`);
  }
  if (s.salePrice != null && !(Number(s.salePrice) < Number(s.basePrice))) errs.push(`sale ${s.salePrice} not below list ${s.basePrice}`);
  const vp = (s.variations || []).map((v) => Number(v.price));
  if (vp.some((p) => !(p > 0)) || new Set(vp).size !== vp.length) errs.push(`variation prices must be > 0 and distinct (${vp.join(',')})`);
  if (s.sections.some((x) => x.type === 'Variation') && vp.length < 2) errs.push('a Variation section needs >= 2 real variations');
  if (errs.length) fail(`stand-in ${s.csvId}: ${errs.join('; ')}`); else siOk++;
}
if (siOk === standins.length) ok(`all ${standins.length} stand-in spec(s) match their alias contract and are discriminating`);

console.log('\n=== configurable-products drift check ===');
console.log(`  specs: ${SPECS.length} | CSV CFG rows: ${cfgRows.length} | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nConfigurable-products OK — CSV business fields match SPECS, no GUID leakage.');
process.exit(0);
