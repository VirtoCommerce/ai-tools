/**
 * scripts/seed-data/validate-orders-data.mjs
 *
 * STATIC drift guard for the order & quote state fixtures (VCST-5482, multi-env rule). Shares the
 * single source of truth orders-specs.mjs with the seeders and the unit tests, so the fixture,
 * the seeder, and this guard can never disagree. No network, no env — safe in CI.
 *
 * Checks (exit 1 on any hard problem):
 *   1. Each Swagger-shaped fixture (test-data/orders|quotes/*.json) parses, carries the required
 *      create-body keys, its `number`/`status` MATCH orders-specs.mjs (no drift), and contains NO
 *      runtime GUID (those live in aliases.<env>.json).
 *   2. Each owned @td() alias exists in aliases.json as a JSON-fixture alias (`json` → the fixture),
 *      and pins NO runtime GUID in the committed base (id belongs in the env overlay).
 *   3. (informational) The committed vcst overlay carries each alias id so @td(<ALIAS>.id) resolves.
 *
 * Usage:  npm run td:validate:orders
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ORDER_FIXTURES, QUOTE_FIXTURES, ALL_FIXTURES, OWNED_ALIASES,
  validateFixtureShape, findGuidLeaks, GUID_RE,
} from './orders-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const aliases = readJson('test-data/aliases.json');

// 1. Fixture shape + status match + no GUID leak.
console.log('\n[1] Order/quote JSON fixtures — shape, status match, no GUID leak');
for (const [kind, list] of [['order', ORDER_FIXTURES], ['quote', QUOTE_FIXTURES]]) {
  for (const spec of list) {
    const rel = `test-data/${spec.fixtureFile}`;
    if (!existsSync(join(ROOT, rel))) { fail(`${spec.alias}: fixture ${rel} missing`); continue; }
    let obj;
    try { obj = readJson(rel); } catch (e) { fail(`${spec.alias}: ${rel} is not valid JSON (${e.message})`); continue; }
    const { ok: shapeOk, problems: ps } = validateFixtureShape(spec, obj, kind);
    if (shapeOk) ok(`${spec.alias} (${spec.fixtureFile}) — ${kind} body valid, status "${obj.status}" matches spec, no GUID`);
    else ps.forEach((p) => fail(`${spec.alias}: ${p}`));
  }
}

// 2. Owned aliases are JSON-fixture aliases in the base registry, no pinned GUID.
console.log('\n[2] aliases.json — owned aliases are JSON-fixture-backed, no runtime GUID pinned');
for (const spec of ALL_FIXTURES) {
  const a = aliases[spec.alias];
  if (!a || typeof a !== 'object') { fail(`alias ${spec.alias} missing from aliases.json`); continue; }
  if (!a.json) { fail(`alias ${spec.alias} must be a JSON-fixture alias (needs a "json" pointer to ${spec.fixtureFile})`); continue; }
  const expectedJson = spec.fixtureFile.replace(/\.json$/, '');
  if (a.json !== expectedJson) fail(`alias ${spec.alias}.json = "${a.json}" — expected "${expectedJson}"`);
  for (const [k, v] of Object.entries(a)) {
    if (k === 'fields' || k === 'notes' || k === 'json' || k.startsWith('_')) continue;
    if (typeof v === 'string' && GUID_RE.test(v)) fail(`alias ${spec.alias}.${k} pins a runtime GUID ("${v}") — move it to aliases.<env>.json`);
  }
  if (!problems.some((p) => p.includes(spec.alias))) ok(`${spec.alias} → json:${a.json} (no pinned GUID)`);
}

// 3. Informational: vcst overlay carries the runtime ids.
console.log('\n[3] (info) vcst overlay carries the seeded ids');
const vcstPath = join(ROOT, 'test-data', 'aliases.vcst.json');
if (existsSync(vcstPath)) {
  const overlay = JSON.parse(readFileSync(vcstPath, 'utf8'));
  for (const alias of OWNED_ALIASES) {
    const id = overlay[alias]?.id;
    if (id && GUID_RE.test(String(id))) ok(`aliases.vcst.json → ${alias}.id = ${id}`);
    else warn(`aliases.vcst.json has no ${alias}.id — @td(${alias}.id) won't resolve on vcst until \`npm run seed:orders\`/\`seed:quotes\` runs.`);
  }
} else warn('aliases.vcst.json absent — run seed:orders / seed:quotes to populate the overlay.');

console.log('\n=== order/quote fixture validation (VCST-5482) ===');
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nOrder/quote fixture test-data OK — Swagger-shaped, spec-matched, multi-env-clean.');
process.exit(0);
