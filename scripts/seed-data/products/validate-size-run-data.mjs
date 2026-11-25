/**
 * validate-size-run-data.mjs — DRIFT / LEAK GUARD for the size-run fixture (B2C-VAR-001, suite 009).
 * STATIC only (no network). `npm run td:validate:size-run`.
 *
 *   1. No runtime GUID anywhere in the committed JSON fixture.
 *   2. The non-vacuity contract from size-run-specs.mjs — exact B2C layout value, ONE Variation
 *      property Size with exactly XS,S,M,L,XL, distinct SKUs/prices (master price distinct too),
 *      stocked variations, an interior selection that is a real variation, AGENT-TEST naming, derived slug/url.
 *   3. The alias contract: SIZE_RUN_MASTER is json-backed on this fixture and every static field path resolves.
 *   4. Informational: whether aliases.<env>.json carries the runtime ids.
 */

import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FIXTURE_FILE, loadFixture, validateFixtureShape, variationForSize } from './size-run-specs.mjs';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ALIAS = 'SIZE_RUN_MASTER';
const RUNTIME_FIELDS = new Set(['id', 'selectedVariationId']); // overlay only
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

console.log('\n[2] fixture can still make B2C-VAR-001 fail');
const shape = validateFixtureShape(data);
for (const p of shape) fail(p);
if (!shape.length) {
  const rec = loadFixture(data);
  const sel = variationForSize(rec, rec.selection.size);
  ok(`${rec.variations.length} variations over ${rec.variationProperties.join('')}: ${rec.sizes.join(',')}; layout ${rec.layout.name}=${rec.layout.value}`);
  ok(`selection ${rec.selection.size} ⇒ ${sel.sku} @ ${sel.listPrice}; other prices ${rec.variations.filter((v) => v !== sel).map((v) => v.listPrice).join(',')}; master ${rec.master.listPrice}`);
}

console.log(`\n[3] aliases.json: ${ALIAS} is json-backed and every path resolves`);
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
const def = aliases[ALIAS];
if (!def) fail(`${ALIAS} not registered — @td(${ALIAS}.*) passes through unresolved`);
else {
  const before = problems.length;
  if (def.json !== JSON_KEY) fail(`${ALIAS}.json="${def.json}" should be "${JSON_KEY}"`);
  const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  for (const [field, path] of Object.entries(def.fields || {})) {
    if (RUNTIME_FIELDS.has(field)) continue;
    if (get(data, path) === undefined) fail(`${ALIAS}.fields.${field} → "${path}" does not exist in ${FIXTURE_FILE}`);
  }
  for (const req of ['id', 'url', 'sku', 'sizes', 'selectedSku', 'selectedPrice']) if (!def.fields?.[req]) fail(`${ALIAS} is missing field "${req}"`);
  if (problems.length === before) ok(`${ALIAS}: ${Object.keys(def.fields).length} field(s), static paths resolve`);
}

const env = resolveTestEnv('vcst');
console.log(`\n[4] aliases.${env}.json: runtime ids (informational)`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
const overlay = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};
if (String(overlay[ALIAS]?.id || '').trim()) ok(`${ALIAS}.id present on ${env}`);
else warn(`${ALIAS}.id absent on ${env} — run \`TEST_ENV=${env} npm run seed:size-run\``);

console.log('\n=== size-run drift/leak check ===');
if (problems.length) { console.log(`FAILED — ${problems.length} problem(s).`); process.exit(1); }
console.log('Size-run OK — the fixture can still fail on a wrong size list or a wrong variation for the selected size.');
process.exit(0);
