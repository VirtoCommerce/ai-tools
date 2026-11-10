/**
 * validate-variant-picker-data.mjs — DRIFT / LEAK GUARD for the variant-picker fixture (A11Y-VCP-001).
 * STATIC only (no network). `npm run td:validate:variant-picker`.
 *
 *   1. No runtime GUID anywhere in the committed JSON fixture.
 *   2. The non-vacuity contract from variant-picker-specs.mjs — exact B2C layout value, two VARIATION
 *      properties with ≥2 values each, a NON-full matrix (disabled state reachable), distinct prices,
 *      stocked variations, labels unique across groups, AGENT-TEST naming, derived slug/url.
 *   3. The alias contract: VARIANT_PICKER_MASTER is json-backed on this fixture and every field path resolves.
 *   4. Informational: whether aliases.<env>.json carries the runtime id.
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_FILE, loadFixture, validateFixtureShape, unavailablePairs } from './variant-picker-specs.mjs';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ALIAS = 'VARIANT_PICKER_MASTER';
const JSON_KEY = FIXTURE_FILE.replace(/\.json$/, '');
const GUID_RE = /\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})\b/i;

const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);

const raw = readFileSync(join(ROOT, 'test-data', FIXTURE_FILE), 'utf8');
const data = JSON.parse(raw);

console.log(`\n[1] ${FIXTURE_FILE}: no runtime GUID committed`);
const leak = raw.match(GUID_RE);
if (leak) fail(`GUID "${leak[0]}" in the committed fixture — runtime ids live in aliases.<env>.json`);
else ok('no GUID in the fixture');

console.log('\n[2] fixture can still make A11Y-VCP-001 fail');
const shape = validateFixtureShape(data);
for (const p of shape) fail(p);
if (!shape.length) {
  const rec = loadFixture(data);
  ok(`${rec.variations.length} variations over ${rec.variationProperties.join(' × ')}, layout ${rec.layout.name}=${rec.layout.value}`);
  ok(`unavailable combinations: ${unavailablePairs(rec).join('; ')}`);
}

console.log('\n[3] aliases.json: VARIANT_PICKER_MASTER is json-backed and every path resolves');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const def = aliases[ALIAS];
if (!def) fail(`${ALIAS} not registered — @td(${ALIAS}.*) passes through unresolved`);
else {
  if (def.json !== JSON_KEY) fail(`${ALIAS}.json="${def.json}" should be "${JSON_KEY}"`);
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  for (const [field, path] of Object.entries(def.fields || {})) {
    if (field === 'id') continue; // runtime — overlay only
    if (get(data, path) === undefined) fail(`${ALIAS}.fields.${field} → "${path}" does not exist in ${FIXTURE_FILE}`);
  }
  for (const req of ['id', 'url', 'sku']) if (!def.fields?.[req]) fail(`${ALIAS} is missing field "${req}"`);
  if (!problems.length) ok(`${ALIAS}: ${Object.keys(def.fields).length} field(s), static paths resolve`);
}

const env = resolveTestEnv('vcst');
console.log(`\n[4] aliases.${env}.json: runtime id (informational)`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
const overlay = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};
if (String(overlay[ALIAS]?.id || '').trim()) ok(`${ALIAS}.id present on ${env}`);
else warn(`${ALIAS}.id absent on ${env} — run \`TEST_ENV=${env} npm run seed:variant-picker\``);

console.log('\n=== variant-picker drift/leak check ===');
if (problems.length) { console.log(`FAILED — ${problems.length} problem(s).`); process.exit(1); }
console.log('Variant-picker OK — the fixture can still fail on a missing, mislabeled or state-less picker.');
process.exit(0);
