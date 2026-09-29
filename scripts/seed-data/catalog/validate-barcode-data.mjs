#!/usr/bin/env node
/**
 * validate-barcode-data.mjs — STATIC drift guard for the VCST-2945 barcode fixtures (no network).
 * Wired as `td:validate:barcode`. It owns the fixture's DATA contract (FOURTH RULE):
 *
 *   1. the spec still describes DISCRIMINATING fixtures (validateFixtureShape — unique vs shared GTIN,
 *      full-text decoy, OR-able code, OOS variation MPN, mixed-case value + non-matching prefix, …);
 *   2. every BARCODE_* alias is registered in test-data/aliases.json and its static fields EQUAL the
 *      spec (aliases.json is the only hand-visible mirror — this is what stops it drifting);
 *   3. no runtime GUID leaked into the spec module or the committed aliases;
 *   4. every barcode image exists, is a PNG, and its `barcode-value` tEXt chunk equals the value its
 *      alias names (a changed spec value with a stale image fails here, not in a browser);
 *   5. (informational) the current env overlay carries the runtime ids.
 *
 * Exit 1 on any violation.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateFixtureShape, aliasStaticFields, expectedExactHits, buildPropertyBody, PROPERTIES, PRODUCTS, IMAGES, IMAGE_DIR, RUNTIME_FIELDS,
} from './barcode-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/gi;
const problems = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };

console.log('=== validate barcode fixtures (VCST-2945, static drift guard) ===');

// 1. non-vacuity contract
const shape = validateFixtureShape();
if (shape.length) shape.forEach(fail); else ok('spec describes discriminating fixtures (unique/shared/full-text/OR/property/variation/case+flipped/special/reindex/stale-on-own-product)');

// 1b. property bodies — a dictionary property rejects free values, a multivalue one indexes as a
// collection (pr909 flags isCollection); either would change what the PROP / SPECIAL cases observe.
for (const def of Object.values(PROPERTIES)) {
  const b = buildPropertyBody(def, 'catalog');
  if (b.dictionary || b.multivalue || b.multilanguage) fail(`property ${def.name}: must be a plain single-value, non-dictionary property (dictionary=${b.dictionary} multivalue=${b.multivalue} multilanguage=${b.multilanguage})`);
  else ok(`property ${def.name} is a plain single-value ${def.type}/${def.valueType} property`);
}

// 1c. the live proof's expected hit counts agree with what each alias promises the cases.
{
  const s = aliasStaticFields();
  const promise = {
    'GTIN_UNIQUE gtin': 1, 'FULLTEXT gtin (exact)': 1, 'GTIN_SHARED gtin': Number(s.BARCODE_GTIN_SHARED.count),
    'CODE_OR code': 1, 'PROP value': 1, 'VARIATION mpn': 1, 'CASE code': 1, 'CASE prefix (must be 0)': 0, 'REINDEX gtin': 1, 'STALE_FIELD value': 1,
  };
  const hits = expectedExactHits();
  const bad = hits.filter((h) => promise[h.label] !== h.hits).map((h) => `${h.label}: proof expects ${h.hits}, alias promises ${promise[h.label]}`);
  const missing = Object.keys(promise).filter((l) => !hits.some((h) => h.label === l));
  // An exact filter whose holder is a VARIATION must be proven with the widened is:product,variation
  // scope — the default is:product scope cannot see it, so the proof would report 0 for a correct seed.
  for (const h of hits) {
    const holders = PRODUCTS.filter((p) => [p.sku, p.gtin, p.mpn, ...Object.values(p.props || {})].some((v) => v != null && String(v).toLowerCase() === String(h.value).toLowerCase()));
    if (holders.some((p) => p.parent) && !h.variations) bad.push(`${h.label}: its holder is a variation, so the proof must widen to is:product,variation`);
  }
  if (bad.length || missing.length) fail(`seeder proof disagrees with the alias contract — ${[...bad, ...missing.map((m) => `no proof for ${m}`)].join('; ')}`);
  else ok(`seeder proof expects exactly what the aliases promise (${hits.length} exact filters)`);
}

// 2. alias registry == spec
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
for (const [name, fields] of Object.entries(aliasStaticFields())) {
  const a = aliases[name];
  if (!a) { fail(`alias ${name} is not registered in test-data/aliases.json`); continue; }
  if (a._inline !== true) fail(`alias ${name} must be _inline`);
  const drift = Object.entries(fields).filter(([k, v]) => String(a[k] ?? '') !== String(v)).map(([k, v]) => `${k}: "${a[k]}" ≠ spec "${v}"`);
  if (drift.length) fail(`alias ${name} drifted from barcode-specs.mjs — ${drift.join('; ')}`);
  else ok(`alias ${name} matches the spec (${Object.keys(fields).join(', ')})`);
  // BARCODE_STORE.id is the store's chosen business key, not a server-assigned value.
  const leaked = RUNTIME_FIELDS.filter((f) => !(f in fields) && a[f] && String(a[f]).trim() !== '');
  if (leaked.length) fail(`alias ${name} carries runtime field(s) ${leaked.join(', ')} in aliases.json — they belong in aliases.<env>.json`);
  const guids = JSON.stringify(a).match(GUID_RE) || [];
  if (guids.length) fail(`alias ${name} carries GUID(s) ${guids.join(', ')}`);
}

// 3. spec module GUID-free
const specSrc = readFileSync(join(ROOT, 'scripts/seed-data/catalog/barcode-specs.mjs'), 'utf8');
const specGuids = specSrc.match(GUID_RE) || [];
if (specGuids.length) fail(`barcode-specs.mjs carries GUID(s): ${specGuids.join(', ')}`); else ok('spec module carries no runtime GUID');

// 4. images: PNG + tEXt barcode-value == spec
function pngText(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, i) => buf[i] === b)) return { png: false };
  const text = {};
  for (let o = 8; o + 8 <= buf.length;) {
    const len = buf.readUInt32BE(o); const type = buf.toString('latin1', o + 4, o + 8);
    if (type === 'tEXt') {
      const data = buf.subarray(o + 8, o + 8 + len); const z = data.indexOf(0);
      text[data.toString('latin1', 0, z)] = data.toString('latin1', z + 1);
    }
    if (type === 'IEND') break;
    o += 12 + len;
  }
  return { png: true, text };
}
for (const [key, img] of Object.entries(IMAGES)) {
  const p = join(ROOT, IMAGE_DIR, img.file);
  if (!existsSync(p)) { fail(`image ${IMAGE_DIR}/${img.file} (${key}) is missing`); continue; }
  const { png, text } = pngText(readFileSync(p));
  if (!png) fail(`image ${img.file} is not a PNG`);
  else if (text['barcode-value'] !== img.value) fail(`image ${img.file} encodes "${text['barcode-value']}" but the spec value is "${img.value}" — regenerate it (recipe in barcode-specs.mjs header)`);
  else ok(`image ${img.file} (${img.bcid}) is stamped with the spec value`);
}

// 5. informational — overlay for the current env
const env = process.env.TEST_ENV || 'vcst';
const overlayPath = join(ROOT, `test-data/aliases.${env}.json`);
const overlay = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};
const idAliases = Object.keys(aliasStaticFields()).filter((n) => n !== 'BARCODE_STORE');
const seeded = idAliases.filter((n) => Object.entries(overlay[n] || {}).some(([k, v]) => RUNTIME_FIELDS.includes(k) && v));
console.log(`  • ${env} overlay: runtime ids present for ${seeded.length}/${idAliases.length} product/property aliases${seeded.length < idAliases.length ? ` — run TEST_ENV=${env} npm run seed:barcode` : ''}`);

console.log(`\n${problems.length ? `FAILED — ${problems.length} problem(s)` : 'OK'}`);
process.exit(problems.length ? 1 : 0);
