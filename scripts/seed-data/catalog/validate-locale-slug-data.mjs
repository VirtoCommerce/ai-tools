/**
 * validate-locale-slug-data.mjs — DRIFT / LEAK GUARD for the locale↔slug collision category
 * (L10N-ROUTE-001/002). STATIC only (no network). `npm run td:validate:locale-slug`.
 *
 *   1. category_id blank and no GUID in any data column (multi-env rule).
 *   2. The non-vacuity contract from locale-slug-specs.mjs — slug starts with a scanned locale code,
 *      is longer than it, is not "seed-"-prefixed, has a record for the collision culture, is the same
 *      in every language, and is a top-level route.
 *   3. L10N_COLLISION_CATEGORY is CSV-backed on this file with column-backed fields.
 *   4. Informational: the overlay carries the runtime id.
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { CSV_SOURCE, RUNTIME_COLUMNS, validateFixtureShape } from './locale-slug-specs.mjs';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ALIAS = 'L10N_COLLISION_CATEGORY';
const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const PROSE = new Set(['test_purpose', 'notes']);

const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);

const rows = parse(readFileSync(join(ROOT, 'test-data', CSV_SOURCE.file), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true });

console.log(`\n[1] ${CSV_SOURCE.file}: runtime columns blank, no GUID`);
for (const r of rows) {
  for (const c of RUNTIME_COLUMNS) if (String(r[c] ?? '').trim()) fail(`${r.fixture_key}: ${c} must be BLANK — runtime ids live in aliases.<env>.json`);
  for (const [c, v] of Object.entries(r)) if (!PROSE.has(c) && GUID_RE.test(String(v ?? '').trim())) fail(`${r.fixture_key}: column ${c} holds a GUID`);
}
if (!problems.length) ok(`${rows.length} row(s) clean`);

console.log('\n[2] the collision is still testable');
const shape = validateFixtureShape(rows);
for (const p of shape) fail(p);
if (!shape.length) for (const r of rows) ok(`${r.fixture_key}: "${r.slug}" collides with locale "${r.collision_locale}", same slug in ${r.seo_languages}`);

console.log(`\n[3] aliases.json: ${ALIAS} is CSV-backed`);
const def = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'))[ALIAS];
const cols = new Set(Object.keys(rows[0] || {}));
if (!def) fail(`${ALIAS} not registered`);
else {
  if (def.file !== CSV_SOURCE.key) fail(`${ALIAS}.file="${def.file}" should be "${CSV_SOURCE.key}"`);
  const key = Object.values(def.filter || {})[0];
  if (!rows.some((r) => r.fixture_key === key)) fail(`${ALIAS}.filter selects "${key}", which has no row`);
  for (const [f, c] of Object.entries(def.fields || {})) if (!cols.has(c)) fail(`${ALIAS}.fields.${f} → missing column "${c}"`);
  for (const req of ['id', 'slug', 'url', 'collisionLocale']) if (!def.fields?.[req]) fail(`${ALIAS} lacks field ${req}`);
  if (!problems.length) ok(`${ALIAS}: ${Object.keys(def.fields).length} column-backed field(s)`);
}

const env = resolveTestEnv('vcst');
console.log(`\n[4] aliases.${env}.json (informational)`);
const op = join(ROOT, 'test-data', `aliases.${env}.json`);
const ov = existsSync(op) ? JSON.parse(readFileSync(op, 'utf8')) : {};
if (String(ov[ALIAS]?.id || '').trim()) ok(`${ALIAS}.id present on ${env}`);
else warn(`${ALIAS}.id absent on ${env} — run \`TEST_ENV=${env} npm run seed:locale-slug\``);

console.log('\n=== locale-slug drift/leak check ===');
if (problems.length) { console.log(`FAILED — ${problems.length} problem(s).`); process.exit(1); }
console.log('Locale-slug OK — a slug-eating router can still fail L10N-ROUTE-001/002.');
process.exit(0);
