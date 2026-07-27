/**
 * scripts/seed-data/validate-standard-data.mjs
 *
 * DRIFT / LEAK GUARD for the standard-product fixtures (multi-env model). The standard seeder
 * (seed-standard-products.mjs) has ONE CSV source of truth — test-products.csv — plus the imported
 * fixtures registered in standard.csv. This guard asserts both stay multi-env-safe and coherent
 * with standard-specs.mjs (CSV_SOURCE / SPEC_OVERLAYS / DISCOVERED_FIXTURES).
 *
 * Per the multi-env rule (.claude/rules/test-data.md "Authoring rule for ANY new seeder"), NO runtime
 * platform GUID may sit in a committed CSV — a baked-in id resolves to the wrong / a nonexistent
 * entity on any other env and breaks regression.
 *
 * Checks:
 *   1. standard.csv: no runtime GUIDs in data columns (product_id_guid / catalog_id — ids live in
 *      aliases.<env>.json). Prose columns (notes) are ignored.
 *   2. standard.csv: every DISCOVERED_FIXTURE has a row whose product_code matches its discover code.
 *   3. test-products.csv: no runtime GUID in ANY non-prose column (it must stay business-keys-only).
 *   4. test-products.csv: every SPEC_OVERLAYS key is a seeded=true row (an overlay on a non-seeded
 *      or missing row would never apply).
 *   5. test-products.csv: at least one seeded=true row exists (the seeder would otherwise abort).
 *   6. test-products.csv: sale_price rows are genuine sales (0 < sale < list).
 *   7. .env.* ↔ CSV: any NON-EMPTY OOS_SKU / LOW_STOCK_SKU / PACK_SIZE_SKU / TIER_PRICED_SKU must
 *      equal its CSV row's sku. Empty stays legal (the "not provisioned on this env" signal).
 *      Guards the 2026-07-25 class of drift: .env.vcst pointed three of them at one-off products that
 *      no longer existed on the env and disagreed with the aliases.
 *   8. test-products.csv: product_slug == productSlug(product_name), and a seeded row under a fully
 *      AD-HOC category path (no categories.csv row) has the derivable storefront_url. Stops cases
 *      hand-composing /product/<sku>, which renders a client-side 404 (HTTP 200 SPA soft-404).
 *   9. test-products.csv: storefront_url is store-RELATIVE (leading /, no scheme/host/{{VAR}}) and
 *      ends with /<product_slug>.
 *  10. test-products.csv: price_eur is a positive number on a row that also has a base list price
 *      (a second-currency price with no base would price the product in EUR only).
 *  11. test-products.csv: no seeded=true row still carries a pre-seeding "Template only — NOT seeded"
 *      manual-provisioning recipe in `notes` (it contradicts the seeder + the alias _status).
 *
 * Usage:  npm run td:validate:standard   (exit 1 on any hard problem)
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  CSV_SOURCE, SPEC_OVERLAYS, DISCOVERED_FIXTURES,
  productSlug, storefrontPathForAdHoc, slugify,
} from './standard-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });

const std = readCsv('products/standard.csv');
const stdById = new Map(std.map((r) => [r.product_id, r]));
const tp = readCsv(CSV_SOURCE.file);

const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const STD_GUID_COLS = ['product_id_guid', 'catalog_id'];
// Free-text columns that legitimately mention ids/dates in prose — never GUID-scanned.
const TP_PROSE_COLS = new Set(['description', 'test_purpose', 'notes']);
const truthy = (v) => /^(true|yes|1)$/i.test(String(v || '').trim());

const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

// 1. standard.csv — no runtime GUIDs in data columns.
console.log('\n[1] standard.csv: no runtime GUIDs in data columns (ids live in aliases.<env>.json)');
let clean = 0;
for (const r of std) {
  const has = STD_GUID_COLS.filter((c) => (r[c] || '').trim());
  if (has.length) for (const c of has) fail(`standard.csv row ${r.product_id}: "${c}"="${r[c].trim()}" must be blank — captured to aliases.<env>.json`);
  else clean++;
}
if (clean === std.length) ok(`all ${std.length} standard.csv row(s) carry no GUIDs in ${STD_GUID_COLS.join(' / ')}`);

// 2. standard.csv — discovered fixtures map to a row by code.
console.log('\n[2] standard.csv: every DISCOVERED_FIXTURE maps to a row by code');
let matched = 0;
for (const f of DISCOVERED_FIXTURES) {
  const r = stdById.get(f.csvId);
  if (!r) { fail(`fixture ${f.csvId} (${f.code}): no standard.csv row`); continue; }
  if ((r.product_code || '').trim() !== f.code) fail(`fixture ${f.csvId}: product_code "${r.product_code}" != discover code "${f.code}"`);
  else matched++;
}
if (matched === DISCOVERED_FIXTURES.length) ok(`all ${DISCOVERED_FIXTURES.length} discovered fixture(s) map to a standard.csv row`);

// 3. test-products.csv — no runtime GUID in any non-prose column.
console.log(`\n[3] ${CSV_SOURCE.file}: no runtime GUIDs (business keys only)`);
let leaks = 0;
for (const r of tp) {
  for (const [col, val] of Object.entries(r)) {
    if (TP_PROSE_COLS.has(col)) continue;
    if (GUID_RE.test(String(val || '').trim())) { fail(`${CSV_SOURCE.file} row ${r.product_id}: column "${col}" holds a GUID "${val}" — must be a business key`); leaks++; }
  }
}
if (!leaks) ok(`no GUIDs in any data column across ${tp.length} row(s)`);

// 4. Overlays target a seeded row.
console.log(`\n[4] ${CSV_SOURCE.file}: every SPEC_OVERLAYS key is a seeded=true row`);
const seededIds = new Set(tp.filter((r) => truthy(r[CSV_SOURCE.map.seeded])).map((r) => r[CSV_SOURCE.map.csvId]));
let overlayOk = 0;
for (const id of Object.keys(SPEC_OVERLAYS)) {
  if (!seededIds.has(id)) fail(`SPEC_OVERLAYS["${id}"] targets a row that is not seeded=true (overlay would never apply)`);
  else overlayOk++;
}
if (overlayOk === Object.keys(SPEC_OVERLAYS).length) ok(`all ${Object.keys(SPEC_OVERLAYS).length} overlay(s) target a seeded row`);

// 5. At least one seeded row.
console.log(`\n[5] ${CSV_SOURCE.file}: has seeded=true rows`);
if (!seededIds.size) fail(`no seeded=true rows — the seeder would abort`);
else ok(`${seededIds.size} seeded=true row(s): ${[...seededIds].join(', ')}`);

// 6. Sale-price coherence — any row carrying a sale_price must be a genuine sale (0 < sale < list).
// A blank sale_price is fine (no sale). An inverted / zero / non-numeric sale would silently degrade
// to list-only at seed time (buildPrices guards it), but it almost always signals a fixture typo.
console.log(`\n[6] ${CSV_SOURCE.file}: sale_price rows are genuine sales (0 < sale < list)`);
const saleCol = CSV_SOURCE.map.salePrice;
const listCol = CSV_SOURCE.map.listPrice;
let saleRows = 0;
for (const r of tp) {
  const raw = String(r[saleCol] ?? '').trim();
  if (!raw) continue;
  saleRows++;
  const sale = Number(raw), list = Number(r[listCol]);
  if (!Number.isFinite(sale) || sale <= 0) fail(`${CSV_SOURCE.file} row ${r.product_id}: sale_price "${raw}" is not a positive number`);
  else if (!Number.isFinite(list)) fail(`${CSV_SOURCE.file} row ${r.product_id}: has sale_price ${sale} but no numeric list price ("${r[listCol]}")`);
  else if (sale >= list) fail(`${CSV_SOURCE.file} row ${r.product_id}: sale_price ${sale} must be strictly below list price ${list}`);
  else ok(`${r.product_id}: sale ${sale} < list ${list} (${Math.round((1 - sale / list) * 100)}% off)`);
}
if (!saleRows) ok('no sale_price rows to check');

// 7. Env-layer reconciliation — a non-empty *_SKU must equal its CSV row's sku, on EVERY env layer.
// A SKU is an env-INVARIANT business key: the only legal per-env variation is "seeded here" (a value)
// vs "not seeded here" (empty). @td(PROD_*.sku) is the single source of truth; these vars are a legacy
// mirror. This check is what stops the mirror silently drifting away from the fixture again.
console.log('\n[7] .env.*: every non-empty fixture SKU var matches its test-products.csv row');
const SKU_VARS = {
  OOS_SKU: 'PROD-101',
  LOW_STOCK_SKU: 'PROD-102',
  PACK_SIZE_SKU: 'PROD-103',
  TIER_PRICED_SKU: 'PROD-104',
};
const tpById = new Map(tp.map((r) => [r[CSV_SOURCE.map.csvId], r]));
// Scan every committed per-env file. `.env.local` (gitignored secrets) and the templates are skipped:
// a template ships blank on purpose, and secrets never hold a SKU.
const envFiles = readdirSync(ROOT)
  .filter((f) => f.startsWith('.env.') && !/\.(local|backup|example)$/.test(f) && !f.includes('{'))
  .filter((f) => existsSync(join(ROOT, f)));
let envChecked = 0, envBlank = 0;
for (const f of envFiles) {
  const text = readFileSync(join(ROOT, f), 'utf8');
  for (const [varName, csvId] of Object.entries(SKU_VARS)) {
    // Last uncommented assignment wins (dotenv semantics).
    const matches = [...text.matchAll(new RegExp(`^\\s*${varName}\\s*=(.*)$`, 'gm'))];
    if (!matches.length) continue;
    const raw = (matches[matches.length - 1][1] || '').trim().replace(/^["']|["']$/g, '');
    if (!raw) { envBlank++; continue; }               // "not provisioned on this env" — legal
    const row = tpById.get(csvId);
    if (!row) { fail(`${f}: ${varName} set but ${CSV_SOURCE.file} has no row ${csvId}`); continue; }
    const sku = (row[CSV_SOURCE.map.code] || '').trim();
    if (raw !== sku) fail(`${f}: ${varName}="${raw}" disagrees with ${csvId} sku "${sku}" — @td() is the source of truth; set it to "${sku}" or blank it if this env is unseeded`);
    else envChecked++;
  }
}
if (!problems.length || envChecked) ok(`${envChecked} non-empty SKU var(s) match the CSV; ${envBlank} deliberately blank across ${envFiles.length} env file(s)`);

// 8. Derived slug — the seeder writes buildStoreSeo({ semanticUrl: productSlug(name) }), so a committed
// product_slug that disagrees is a stale hand edit, not new information.
console.log(`\n[8] ${CSV_SOURCE.file}: product_slug is the derived productSlug(product_name)`);
const slugCol = CSV_SOURCE.map.slug;
const urlCol = CSV_SOURCE.map.storefrontUrl;
const catCol = CSV_SOURCE.map.categoryPath;
const nameCol = CSV_SOURCE.map.name;
// A category segment is AD-HOC when categories.csv has no row for it — ensureCategoryPath then gives it
// the derivable `seed-<parent-scoped slug>` semanticUrl. A segment that IS in categories.csv uses its
// own seo_slug, which this guard cannot derive, so those rows are only checked structurally (see [9]).
// The lookup mirrors ensureCategoryPath EXACTLY: catSlug(r.code || r.category_name), code-first.
const catRows = readCsv('catalogs/categories.csv');
const csvTreeSlugs = new Set(catRows.map((r) => slugify(r.code || r.category_name || '')).filter(Boolean));
// Only a SINGLE ad-hoc segment is required to carry the derived url: that is the shape confirmed live
// (`Test Fixtures` → /seed-test-fixtures/<slug>). Deeper ad-hoc paths follow the same documented rule
// but are not live-verified, so they are asserted only when a value is actually present.
const isSingleSegmentAdHoc = (path) => {
  const segs = String(path || '').split('>').map((s) => s.trim()).filter(Boolean);
  return segs.length === 1 && !csvTreeSlugs.has(slugify(segs[0]));
};
let slugChecked = 0, slugBlank = 0;
for (const r of tp) {
  const have = (r[slugCol] || '').trim();
  if (!have) { slugBlank++; continue; }
  const want = productSlug(r[nameCol]);
  if (have !== want) fail(`${CSV_SOURCE.file} row ${r[CSV_SOURCE.map.csvId]}: product_slug "${have}" != derived "${want}" (rule: standard-specs.mjs productSlug)`);
  else slugChecked++;
}
ok(`${slugChecked} derived slug(s) match; ${slugBlank} row(s) leave slug/url blank (category path not offline-derivable)`);
// A seeded row on a SINGLE ad-hoc segment is derivable end-to-end → it must carry both columns, and the
// value must equal the derivation. Any other row with a value present is still checked for correctness.
let adHocProblems = 0, adHocRequired = 0, adHocPresent = 0;
for (const r of tp) {
  const id = r[CSV_SOURCE.map.csvId];
  const path = (r[catCol] || '').trim();
  const have = (r[urlCol] || '').trim();
  const required = truthy(r[CSV_SOURCE.map.seeded]) && isSingleSegmentAdHoc(path);
  if (!required && !have) continue;
  const want = storefrontPathForAdHoc(path, r[nameCol]);
  if (required) adHocRequired++;
  if (!have) { fail(`${CSV_SOURCE.file} row ${id}: seeded under the ad-hoc category "${path}" so storefront_url is derivable and required — expected "${want}"`); adHocProblems++; continue; }
  adHocPresent++;
  // Present but on a categories.csv-backed path: the category semanticUrls come from their seo_slug,
  // which this guard cannot derive — [9] still checks the value structurally.
  if (!isSingleSegmentAdHoc(path)) continue;
  if (have !== want) { fail(`${CSV_SOURCE.file} row ${id}: storefront_url "${have}" != derived "${want}" (rule: standard-specs.mjs storefrontPathForAdHoc)`); adHocProblems++; }
}
if (!adHocProblems) ok(`${adHocRequired} required ad-hoc-category row(s) carry the derived storefront_url (${adHocPresent} row(s) with a value in total)`);

// 9. storefront_url stays store-RELATIVE: a case composes {{FRONT_URL}}@td(ALIAS.url), so a committed
// scheme/host would hardcode an environment (and a {{VAR}} would not survive the CSV resolver).
console.log(`\n[9] ${CSV_SOURCE.file}: storefront_url is store-relative and ends with the product slug`);
let urlChecked = 0;
for (const r of tp) {
  const have = (r[urlCol] || '').trim();
  if (!have) continue;
  const id = r[CSV_SOURCE.map.csvId];
  if (/^[a-z]+:\/\//i.test(have) || have.includes('{{')) { fail(`${CSV_SOURCE.file} row ${id}: storefront_url "${have}" must be a store-relative path — no scheme/host, no {{VAR}} (compose {{FRONT_URL}}@td(ALIAS.url) in the case)`); continue; }
  if (!have.startsWith('/')) { fail(`${CSV_SOURCE.file} row ${id}: storefront_url "${have}" must start with "/"`); continue; }
  const slug = (r[slugCol] || '').trim();
  if (slug && !have.endsWith(`/${slug}`)) { fail(`${CSV_SOURCE.file} row ${id}: storefront_url "${have}" must end with "/${slug}"`); continue; }
  urlChecked++;
}
if (urlChecked) ok(`${urlChecked} storefront_url value(s) are relative and slug-terminated`);

// 10. Second-currency price coherence. price_eur drives a separate EUR pricelist
// (standard-specs.mjs buildCurrencyPriceSets); a 0/negative/non-numeric value is silently dropped at
// seed time, which is exactly the "line shows 0.00 with a disabled stepper" symptom this column exists
// to fix — so fail loudly here instead.
console.log(`\n[10] ${CSV_SOURCE.file}: price_eur rows are positive numbers with a base list price`);
const eurCol = CSV_SOURCE.map.eurPrice;
let eurRows = 0;
for (const r of tp) {
  const raw = String(r[eurCol] ?? '').trim();
  if (!raw) continue;
  eurRows++;
  const id = r[CSV_SOURCE.map.csvId];
  const eur = Number(raw), list = Number(r[listCol]);
  if (!Number.isFinite(eur) || eur <= 0) fail(`${CSV_SOURCE.file} row ${id}: price_eur "${raw}" is not a positive number (it would be dropped at seed time → 0.00 line)`);
  else if (!Number.isFinite(list) || list <= 0) fail(`${CSV_SOURCE.file} row ${id}: has price_eur ${eur} but no positive base price ("${r[listCol]}")`);
  else if (!truthy(r[CSV_SOURCE.map.seeded])) warn(`${CSV_SOURCE.file} row ${id}: price_eur ${eur} on a seeded=false row — the seeder will never create the EUR price`);
  else ok(`${id}: dual-currency ${list} ${r[CSV_SOURCE.map.currency] || 'USD'} + ${eur} EUR`);
}
if (!eurRows) warn('no price_eur rows — no fixture is addable after a storefront currency switch (every line collapses to 0.00 with a disabled qty stepper)');

// 11. Stale pre-seeding recipe. A seeded=true row whose notes still say "Template only — NOT seeded"
// contradicts both the seeder and the alias `_status`, and sends a reader off to provision by hand.
console.log(`\n[11] ${CSV_SOURCE.file}: no seeded=true row still carries a "NOT seeded" template note`);
const STALE_NOTE_RE = /template only\s*[—–-]{0,2}\s*not seeded/i;
let stale = 0;
for (const r of tp) {
  if (!truthy(r[CSV_SOURCE.map.seeded])) continue;
  if (STALE_NOTE_RE.test(String(r.notes || ''))) { fail(`${CSV_SOURCE.file} row ${r[CSV_SOURCE.map.csvId]}: seeded=true but notes still say "Template only — NOT seeded" (stale pre-seeding recipe — describe the seeded reality instead)`); stale++; }
}
if (!stale) ok('no stale "Template only — NOT seeded" notes on seeded rows');

console.log('\n=== standard-products drift/leak check ===');
console.log(`  standard.csv rows: ${std.length} | ${CSV_SOURCE.file} rows: ${tp.length} | seeded: ${seededIds.size} | discovered: ${DISCOVERED_FIXTURES.length}`);
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nStandard-products OK — no GUID leakage; discovered fixtures + overlays coherent with the CSVs.');
process.exit(0);
