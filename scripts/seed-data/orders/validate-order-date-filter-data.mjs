/**
 * validate-order-date-filter-data.mjs — drift guard for the /account/orders date-range filter fixture
 * (VCST-5097). No network. Shares order-date-filter-specs.mjs with the seeder.
 *
 *   [1] Fixture contract (fixtureProblems): AGENT-TEST- prefix and names, password as a var NAME, one
 *       multi day (>= 2 orders) and one single day (exactly 1), DIFFERENT counts (equal counts make the
 *       filter undecidable), unique keys, distinct totals, listed statuses, gap >= 24 h, month relation.
 *   [2] No runtime GUID / timestamp in the committed fixture.
 *   [3] aliases.json — ORD_DATE_FILTER_BUYER is a JSON-fixture alias (seed: seed:order-date-filter),
 *       no runtime id pinned in the base, every field path resolves.
 *   [4] Seeded state (aliases.<TEST_ENV>.json, informational when absent): ids + instants present, each
 *       group on one day in every zone, groups >= 24 h apart and in the declared month relation, status
 *       consistent; warns while pending and while the newest day is still today (not yet in the past).
 *
 * Usage: npm run td:validate:order-date-filter   (TEST_ENV picks the overlay for [4])
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixture, fixtureProblems, seededStateProblems, ALIAS, SEED_SCRIPT, FIXTURE_REL, FIXTURE_ALIAS_JSON } from './order-date-filter-specs.mjs';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENV = resolveTestEnv('vcst');
const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const fx = loadFixture(ROOT);

console.log('\n[1] Fixture contract — multi vs single day divergent, naming, password var');
const fp = fixtureProblems(fx);
if (fp.length) fp.forEach(fail); else ok(`${fx.dayOrder.map((g) => `${g}=${fx.days[g].orders.length}`).join(', ')} — contract holds`);

console.log('\n[2] No runtime GUID / timestamp in the committed fixture');
const raw = readFileSync(join(ROOT, FIXTURE_REL), 'utf8');
if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(raw)) fail(`${FIXTURE_REL} contains a GUID — runtime ids belong in aliases.<env>.json`);
else if (/\d{4}-\d{2}-\d{2}/.test(raw)) fail(`${FIXTURE_REL} contains a date — the days are runtime (createdDate is server-assigned)`);
else ok('clean');

console.log('\n[3] aliases.json — JSON-fixture alias, every field path resolves');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const get = (o, path) => path.split('.').reduce((c, s) => (c == null ? undefined : c[s]), o);
const a = aliases[ALIAS];
if (!a) fail(`${ALIAS} missing from aliases.json`);
else {
  if (a.json !== FIXTURE_ALIAS_JSON) fail(`${ALIAS}.json must be "${FIXTURE_ALIAS_JSON}"`);
  if (a.seed !== SEED_SCRIPT) fail(`${ALIAS}.seed must be "${SEED_SCRIPT}"`);
  if ('id' in a || 'user_id' in a) fail(`${ALIAS} pins a runtime id in the committed base`);
  if (a.password_env !== fx.buyer.passwordVar) fail(`${ALIAS}.password_env must be ${fx.buyer.passwordVar}`);
  const bad = Object.entries(a.fields || {}).filter(([, p]) => get(fx, p) === undefined).map(([f]) => f);
  if (bad.length) fail(`${ALIAS}: field path(s) not in the fixture: ${bad.join(', ')}`); else ok(`${ALIAS} (${Object.keys(a.fields || {}).length} fields)`);
}

console.log(`\n[4] Seeded state — aliases.${ENV}.json`);
const ovPath = join(ROOT, `test-data/aliases.${ENV}.json`);
const s = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, 'utf8'))[ALIAS] : null;
if (!s) warn(`${ALIAS} not seeded on ${ENV} (npm run ${SEED_SCRIPT})`);
else {
  const { problems: sp, complete } = seededStateProblems(fx, s);
  sp.forEach((m) => fail(`${ALIAS}: ${m}`));
  if (!sp.length) ok(`${ALIAS}: ${fx.dayOrder.map((g) => `${g} ${s.days?.[g]?.date || '-'} ×${s.days?.[g]?.count || 0}`).join(', ')}`);
  if (!complete) warn(`${ALIAS}: status pending — run npm run ${SEED_SCRIPT} again at or after ${s.nextRunFrom}`);
  const today = new Date().toISOString().slice(0, 10);
  const newest = fx.dayOrder.map((g) => s.days?.[g]?.date).filter(Boolean).sort().at(-1);
  if (newest && newest >= today) warn(`${ALIAS}: newest day ${newest} is not in the past yet (a case reading "past days" waits until tomorrow)`);
}

console.log(problems.length ? `\nFAIL — ${problems.length} problem(s)` : '\nPASS');
process.exit(problems.length ? 1 : 0);
