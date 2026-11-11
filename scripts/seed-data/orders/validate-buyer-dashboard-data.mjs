/**
 * validate-buyer-dashboard-data.mjs — drift guard for the VCST-6078 buyer-dashboard fixtures.
 * No network. Shares buyer-dashboard-specs.mjs with the seeder.
 *
 *   [1] Fixture contract (fixtureProblems): every declared expectation equals what the orders give,
 *       and every distinction stays DIVERGENT — count vs revenue change of opposite sign and neither
 *       0 / ±100%; flag-cancelled, status-"Cancelled", prototype and off-org orders present; distinct
 *       totals; AOV >= 1,000,000; conversion observable; store / org scoping changes the figure;
 *       an excluded currency next to a counted one.
 *   [2] No runtime GUID / createdDate in the committed fixture.
 *   [3] One JSON-fixture alias per buyer in aliases.json, every field path resolving in the fixture.
 *   [4] Seeded state (aliases.<TEST_ENV>.json, informational when absent): ids present, prev wave
 *       strictly before cur wave, the seed day (expectations are day-bound — warn when stale).
 *   [5] Opt-in demo targets (demoTargets, e.g. JOHN_DEMO): when seeded, every order id is recorded.
 *       Their fixture contract (AGENT-TEST- prefix apart from the buyer prefix, env-var NAMES, distinct
 *       counted totals, declared added == derived, non-zero) is part of [1].
 *
 * Usage: npm run td:validate:buyer-dashboard   (TEST_ENV picks the overlay for [4])
 */
import '../../lib/sync-stdio.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixture, fixtureProblems, aliasFor, demoTargets, FIXTURE_REL, FIXTURE_ALIAS_JSON } from './buyer-dashboard-specs.mjs';
import { resolveTestEnv } from '../../lib/resolve-test-env.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENV = resolveTestEnv('vcst');
const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const warn = (m) => console.log(`  ⚠ ${m}`);
const fx = loadFixture(ROOT);

console.log('\n[1] Fixture contract — declared == derived, distinctions divergent');
const fp = fixtureProblems(fx);
if (fp.length) fp.forEach(fail); else ok(`${Object.keys(fx.buyers).length} buyers, ${Object.values(fx.buyers).reduce((n, b) => n + b.orders.length, 0)} orders — contract holds`);

console.log('\n[2] No runtime GUID / timestamp in the committed fixture');
const raw = readFileSync(join(ROOT, FIXTURE_REL), 'utf8');
const GUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
if (GUID.test(raw)) fail(`${FIXTURE_REL} contains a GUID — runtime ids belong in aliases.<env>.json`);
else if (/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) fail(`${FIXTURE_REL} contains a timestamp — createdDate is runtime`);
else ok('clean');

console.log('\n[3] aliases.json — one JSON-fixture alias per buyer, every field path resolves');
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const get = (o, path) => path.split('.').reduce((c, s) => (c == null ? undefined : c[s]), o);
for (const k of Object.keys(fx.buyers)) {
  const a = aliases[aliasFor(k)];
  if (!a) { fail(`${aliasFor(k)} missing from aliases.json`); continue; }
  if (a.json !== FIXTURE_ALIAS_JSON) fail(`${aliasFor(k)}.json must be "${FIXTURE_ALIAS_JSON}"`);
  if ('id' in a || 'user_id' in a) fail(`${aliasFor(k)} pins a runtime id in the committed base`);
  const bad = Object.entries(a.fields || {}).filter(([, p]) => get(fx, p) === undefined).map(([f]) => f);
  if (bad.length) fail(`${aliasFor(k)}: field path(s) not in the fixture: ${bad.join(', ')}`); else ok(`${aliasFor(k)} (${Object.keys(a.fields).length} fields)`);
}

console.log(`\n[4] Seeded state — aliases.${ENV}.json`);
const ovPath = join(ROOT, `test-data/aliases.${ENV}.json`);
const ov = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, 'utf8')) : {};
for (const [k, b] of Object.entries(fx.buyers)) {
  const s = ov[aliasFor(k)];
  if (!s) { warn(`${aliasFor(k)} not seeded on ${ENV} (npm run seed:buyer-dashboard)`); continue; }
  const missing = b.orders.filter((o) => !s.orders?.[o.key]?.id).map((o) => o.key);
  if (!s.user_id) fail(`${aliasFor(k)}: user_id missing`);
  if (missing.length) fail(`${aliasFor(k)}: order id(s) missing for ${missing.join(', ')}`);
  const prev = b.orders.filter((o) => o.wave === 'prev').map((o) => s.orders?.[o.key]?.createdDate).filter(Boolean);
  const cur = b.orders.filter((o) => o.wave === 'cur').map((o) => s.orders?.[o.key]?.createdDate).filter(Boolean);
  if (prev.length && cur.length && !(prev.sort().at(-1) < cur.sort()[0])) fail(`${aliasFor(k)}: prev and cur waves interleave — the comparison split is void (re-seed)`);
  const day = String(s.seededAt || '').slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);
  if (day && day !== today) warn(`${aliasFor(k)}: seeded ${day}; WEEK/MTD expectations are day-bound (re-seed with --refresh on the test day)`);
  if (!missing.length && s.user_id) ok(`${aliasFor(k)} seeded ${day || '?'} (${b.orders.length} orders)`);
}

console.log(`\n[5] Opt-in demo targets (existing personas, orders only) — aliases.${ENV}.json`);
for (const [k, t] of Object.entries(demoTargets(fx))) {
  const s = ov[aliasFor(k)];
  if (!s) { ok(`${k}: not seeded on ${ENV} (opt-in: npm run seed:buyer-dashboard -- --only ${k})`); continue; }
  const missing = t.orders.filter((o) => !s.orders?.[o.key]?.id).map((o) => o.key);
  if (!s.user_id) fail(`${aliasFor(k)}: user_id missing`);
  if (missing.length) fail(`${aliasFor(k)}: order id(s) missing for ${missing.join(', ')}`);
  const day = String(s.seededAt || '').slice(0, 10);
  if (!missing.length && s.user_id) ok(`${aliasFor(k)} seeded ${day || '?'} (${t.orders.length} orders, WEEK/MTD hold for that week/month)`);
}

console.log(problems.length ? `\nFAIL — ${problems.length} problem(s)` : '\nPASS');
process.exit(problems.length ? 1 : 0);
