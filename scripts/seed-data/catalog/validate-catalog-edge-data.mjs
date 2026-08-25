/**
 * validate-catalog-edge-data.mjs — DRIFT / VACUITY GUARD for the three catalog discrimination
 * fixtures (CAT-038 org-excluded product, CAT-040 SEO product, CAT-043 empty category).
 *
 * STATIC only (no network). Run as `npm run td:validate:catalog-edge`; exits 1 on any hard problem.
 *
 * WHAT IT PROTECTS
 * ----------------
 * Each of the three fixtures is defined by a NEGATIVE property — zero products, not linked into the
 * store catalog, SEO fields not null. A negative property is invisible to every "does it exist?"
 * gate: the entity is right there, the seeder exits 0, and the case quietly stops discriminating.
 * So this guard asserts the SHAPE (catalog-edge-specs.validateFixtureShape) plus:
 *
 *   1. No runtime GUID committed into the base aliases.json — the multi-env rule (DV-021's local twin).
 *   2. The alias contract: all three registered, each declaring the field names the cases reference.
 *      A renamed field is invisible elsewhere — @td() just passes the token through unresolved.
 *   3. Store-relative URLs. `/product/<sku>` and an absolute URL both render an SPA soft-404 (HTTP
 *      200 + client-side 404), so a naive status check would pass on a broken path.
 *   4. Informational: whether the per-env overlay carries the runtime ids today.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMPTY_CATEGORY, EXCLUDED_PRODUCT, SEO_PRODUCT, RUNTIME_FIELDS,
  validateFixtureShape, validateSeoShape,
} from './catalog-edge-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;

/** Alias name → the fields the authored cases reference. Renaming one silently un-resolves it. */
const ALIAS_CONTRACT = {
  [EMPTY_CATEGORY.aliasName]: ['name', 'code', 'slug', 'url', 'id'],
  [EXCLUDED_PRODUCT.aliasName]: ['sku', 'name', 'slug', 'id'],
  [SEO_PRODUCT.aliasName]: ['sku', 'name', 'slug', 'pageTitle', 'url', 'id'],
};

const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

// 1. Fixture shape — the non-vacuity contract.
console.log('\n[1] catalog-edge-specs.mjs: each fixture can still make its case FAIL');
const shape = validateFixtureShape();
for (const p of shape) fail(p);
if (!shape.length) {
  ok(`${EMPTY_CATEGORY.aliasName}: "${EMPTY_CATEGORY.name}" keepEmpty=true → the empty-state branch is reachable`);
  ok(`${EXCLUDED_PRODUCT.aliasName}: ${EXCLUDED_PRODUCT.sku} linkedIntoStoreCatalog=false → the org user must NOT see it`);
  ok(`${SEO_PRODUCT.aliasName}: ${SEO_PRODUCT.sku} title + ${String(SEO_PRODUCT.metaDescription).length}-char description, distinct from each other`);
}

// 2. Alias registry — registered, complete, and carrying NO runtime GUID in the committed base.
console.log('\n[2] aliases.json: all three registered, field-complete, and GUID-free');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
for (const [name, fields] of Object.entries(ALIAS_CONTRACT)) {
  const def = aliases[name];
  if (!def) { fail(`${name} is not registered in aliases.json — every @td(${name}.*) passes through unresolved`); continue; }
  const missing = fields.filter((f) => !(f in def));
  if (missing.length) fail(`${name} is missing field(s) the cases reference: ${missing.join(', ')}`);
  for (const rf of RUNTIME_FIELDS) {
    const v = String(def[rf] ?? '').trim();
    if (v && GUID_RE.test(v)) {
      fail(`${name}.${rf}="${v}" is a runtime GUID committed into the BASE aliases.json — it belongs in aliases.<env>.json only, or a run against another env resolves a nonexistent entity (DV-021)`);
    }
  }
  if (!missing.length) ok(`${name}: ${fields.length} contract field(s) present, no committed GUID`);
}

// 3. Store-relative URLs.
console.log('\n[3] storefront paths are store-RELATIVE (an SPA soft-404 returns HTTP 200, so this cannot be caught downstream)');
const env0 = process.env.TEST_ENV || 'vcst';
const overlay0Path = join(ROOT, 'test-data', `aliases.${env0}.json`);
const overlay0 = existsSync(overlay0Path) ? JSON.parse(readFileSync(overlay0Path, 'utf8')) : {};
// The SEO product's PDP path is CATEGORY-QUALIFIED, not the bare SEO semanticUrl leaf. Writing the
// leaf renders an SPA soft-404 (HTTP 200 + a client-side 404 page), so it cannot be caught by a
// status check downstream — hence the derived value is re-computed here and compared.
if (overlay0[SEO_PRODUCT.aliasName]?.url && overlay0[SEO_PRODUCT.aliasName].url !== SEO_PRODUCT.url) {
  fail(`aliases.${env0}.json: ${SEO_PRODUCT.aliasName}.url="${overlay0[SEO_PRODUCT.aliasName].url}" != derived "${SEO_PRODUCT.url}" (rule: standard-specs.storefrontPathForAdHoc). The bare SEO semanticUrl leaf is NOT the storefront path — it renders a client-side 404 behind HTTP 200. Re-run \`TEST_ENV=${env0} npm run seed:catalog-edge\`.`);
}
for (const [name, url] of [
  [EMPTY_CATEGORY.aliasName, aliases[EMPTY_CATEGORY.aliasName]?.url],
  [SEO_PRODUCT.aliasName, overlay0[SEO_PRODUCT.aliasName]?.url],
]) {
  if (!url) { warn(`${name}: no url recorded yet (seed the env)`); continue; }
  if (/^[a-z]+:\/\//i.test(url) || url.includes('{{') || !url.startsWith('/')) {
    fail(`${name}.url="${url}" must be store-RELATIVE and start with "/" — the case composes {{FRONT_URL}}@td(${name}.url)`);
  } else if (/^\/product\//.test(url)) {
    fail(`${name}.url="${url}" uses the /product/<sku> form, which ALWAYS renders a client-side 404 behind HTTP 200`);
  } else ok(`${name}.url=${url}`);
}

// 4. SEO shape, called out separately because it is CAT-040's entire reason to exist.
console.log('\n[4] CAT-040 SEO fixture is a genuine positive example');
const seo = validateSeoShape();
for (const p of seo) fail(p);
if (!seo.length) ok(`pageTitle "${SEO_PRODUCT.pageTitle.slice(0, 45)}…" ≠ metaDescription (${String(SEO_PRODUCT.metaDescription).length} chars)`);

// 5. Overlay presence (informational — an unseeded env is a legitimate state).
const env = process.env.TEST_ENV || 'vcst';
console.log(`\n[5] aliases.${env}.json: runtime ids present (informational — seed the env to populate)`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
const overlay = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};
for (const name of Object.keys(ALIAS_CONTRACT)) {
  const have = Object.entries(overlay[name] || {}).filter(([, v]) => String(v || '').trim());
  if (!have.length) warn(`${name} has no overlay on ${env} — @td(${name}.id) resolves "" until \`TEST_ENV=${env} npm run seed:catalog-edge\` runs`);
  else ok(`${name}: ${have.map(([k]) => k).join(', ')}`);
}

console.log('\n=== catalog edge fixtures drift/vacuity check ===');
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nCatalog edge fixtures OK — each still carries the negative property its case needs.');
process.exit(0);
