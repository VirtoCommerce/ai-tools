/**
 * scripts/seed-data/validate-loyalty-data.mjs
 *
 * STATIC drift guard for the loyalty PTS-divisor fixture (VCST-5103, multi-env rule). Scoped
 * DELIBERATELY to LOY_SKU_PTS_UNIT — the fixture whose runtime GUIDs were moved out of the base
 * alias into the per-env overlay (aliases.<env>.json). It does NOT scan the other loyalty aliases
 * (LOYALTY_VIP_USER / LOYALTY_NOBAL_USER carry deterministic-by-email account ids inline by design,
 * and programs.csv pins program platform_ids that resolve by NAME) — those are intentional and out
 * of scope here.
 *
 * Checks:
 *   1. Base aliases.json LOY_SKU_PTS_UNIT is _inline and keeps the env-invariant business fields
 *      (sku, price, currency) — and carries NO runtime GUID (`id` / `pricelistId` must be ABSENT;
 *      those live in aliases.<env>.json, written by seed-loyalty-fixtures.mjs).
 *   2. The 1-PTS divisor SKU is never written as a bare GUID into a committed loyalty CSV
 *      (program-factors.csv `sku` column must hold business SKUs, not GUIDs).
 *   3. (informational) The committed vcst overlay carries LOY_SKU_PTS_UNIT.id so @td resolves today.
 *
 * Usage:  npm run td:validate:loyalty   (exit 1 on any hard problem)
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

// 1. Base LOY_SKU_PTS_UNIT: business fields present, runtime GUIDs absent.
console.log('\n[1] Base aliases.json LOY_SKU_PTS_UNIT — no pinned runtime GUIDs');
const a = aliases.LOY_SKU_PTS_UNIT;
if (!a || typeof a !== 'object') fail('LOY_SKU_PTS_UNIT alias missing from aliases.json');
else {
  if (!a._inline) fail('LOY_SKU_PTS_UNIT must be _inline');
  for (const f of ['sku', 'price', 'currency']) if (a[f] === undefined || a[f] === '') fail(`LOY_SKU_PTS_UNIT missing env-invariant field "${f}"`);
  for (const guidField of ['id', 'pricelistId']) {
    if (a[guidField] !== undefined) fail(`LOY_SKU_PTS_UNIT.${guidField} must NOT be pinned in base aliases.json — it belongs in aliases.<env>.json (run seed:loyalty-fixtures). Found: "${a[guidField]}"`);
  }
  // Catch any OTHER top-level field that is a bare GUID (a future accidental pin).
  for (const [k, v] of Object.entries(a)) {
    if (k === 'fields' || k === '_notes') continue;
    if (typeof v === 'string' && GUID_RE.test(v)) fail(`LOY_SKU_PTS_UNIT.${k} looks like a runtime GUID ("${v}") — move it to aliases.<env>.json`);
  }
  if (!problems.length) ok('LOY_SKU_PTS_UNIT holds only env-invariant business fields (sku/price/currency); no runtime GUID');
}

// 2. program-factors.csv sku column holds business SKUs, not GUIDs.
console.log('\n[2] program-factors.csv — SKUs are business keys, not GUIDs');
const pfPath = join(ROOT, 'test-data', 'loyalty', 'program-factors.csv');
if (!existsSync(pfPath)) warn('program-factors.csv absent — skipping');
else {
  const rows = parse(readFileSync(pfPath, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
  const bad = rows.filter((r) => GUID_RE.test((r.sku || '').trim()));
  if (bad.length) fail(`program-factors.csv has ${bad.length} row(s) whose sku is a GUID (must be a business SKU): ${bad.map((r) => r.program_id).join(', ')}`);
  else ok(`all ${rows.length} program-factor rows reference SKUs by business key`);
}

// 3. Informational: does the committed vcst overlay carry the runtime id?
console.log('\n[3] (info) vcst overlay carries LOY_SKU_PTS_UNIT.id');
const vcstPath = join(ROOT, 'test-data', 'aliases.vcst.json');
if (existsSync(vcstPath)) {
  const ov = JSON.parse(readFileSync(vcstPath, 'utf8')).LOY_SKU_PTS_UNIT;
  if (ov?.id && GUID_RE.test(String(ov.id))) ok(`aliases.vcst.json → LOY_SKU_PTS_UNIT.id = ${ov.id}`);
  else warn('aliases.vcst.json has no LOY_SKU_PTS_UNIT.id — @td(LOY_SKU_PTS_UNIT.id) will not resolve on vcst until `npm run seed:loyalty-fixtures` runs.');
} else warn('aliases.vcst.json absent — run seed:loyalty-fixtures to populate the overlay.');

// Summary.
console.log('\n=== loyalty fixture validation (LOY_SKU_PTS_UNIT) ===');
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nLoyalty fixture test-data OK — LOY_SKU_PTS_UNIT is multi-env-clean.');
process.exit(0);
