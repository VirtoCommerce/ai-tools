/**
 * scripts/seed-data/edge-cases/validate-edge-cases-data.mjs
 *
 * STATIC drift guard for the four edge-case fixtures (no network, no env — safe in CI). Shares the
 * single source of truth edge-cases-specs.mjs with the seeder.
 *
 * Checks (exit 1 on any hard problem):
 *   1. The spec is self-consistent (validateSpec: AGENT-TEST emails, unique emails/aliases, no GUID
 *      in any committed business field, 10/11 boundary present, 22-address contract coherent).
 *   1b. The F1 filler orgs (FILLER_ORG_KEYS) resolve in test-data/b2b/organizations.csv to a pinned
 *      platform_id + an AGENT-TEST-Org-* name — the seeder resolves them by id and never creates them.
 *   2. Every owned base @td() alias exists in aliases.json and pins NO runtime GUID (ids belong in
 *      the per-env overlay). Login aliases carry the {{VAR}} password token, never a literal, and
 *      their email equals the spec's (the alias is a registry entry, the spec the source of truth).
 *   3. (informational) The vcst overlay carries the seeded runtime ids so @td() resolves today.
 *
 * Usage:  npm run td:validate:edge-cases
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  validateSpec, allOwnedAliases, allOwnedEmails, GUID_RE, resolveFillerOrgs, FILLER_ORG_KEYS,
  MULTI_ORG_PERSONAS, ADDR22_ADMIN, DISC_BUYER, PERSONAL_NON_ORG, DISCONTINUED_ORDER_ALIAS,
  ADDR22_ORG_NAME, DISC_ORDER_NUMBER,
} from './edge-cases-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));

// 1. Spec self-consistency.
console.log('\n[1] edge-cases-specs.mjs — self-consistency');
const specErrs = validateSpec();
if (specErrs.length) specErrs.forEach(fail);
else ok(`spec sound — ${allOwnedEmails().length} owned emails, ${allOwnedAliases().length} owned aliases, 22-address contract coherent`);

// 1b. Filler orgs resolve in organizations.csv (by key → platform_id; never by a transcribed name).
console.log('\n[1b] F1 filler orgs — declared in test-data/b2b/organizations.csv');
{
  const rows = parse(readFileSync(join(ROOT, 'test-data/b2b/organizations.csv'), 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_column_count: true });
  const { orgs, errs } = resolveFillerOrgs(rows);
  errs.forEach((e) => fail(`filler org ${e}`));
  if (!errs.length) ok(`${orgs.length}/${FILLER_ORG_KEYS.length} filler orgs (${FILLER_ORG_KEYS[0]}..${FILLER_ORG_KEYS.at(-1)}) carry a platform_id + AGENT-TEST-Org-* name`);
}

// 2. Base alias registration + no pinned GUID + {{VAR}} password.
console.log('\n[2] aliases.json — owned aliases registered, no runtime GUID pinned, password tokenized');
const aliases = readJson('test-data/aliases.json');
// Login aliases must carry a {{VAR}} password token, not a literal.
const emailByAlias = new Map([
  ...MULTI_ORG_PERSONAS.flatMap((p) => [p.alias, ...p.extraAliases].map((a) => [a, p.email])),
  [ADDR22_ADMIN.alias, ADDR22_ADMIN.email], [DISC_BUYER.alias, DISC_BUYER.email], [PERSONAL_NON_ORG.alias, PERSONAL_NON_ORG.email],
]);
const loginAliases = [...emailByAlias.keys()];
for (const name of allOwnedAliases()) {
  const a = aliases[name];
  if (!a || typeof a !== 'object') { fail(`alias ${name} missing from aliases.json`); continue; }
  for (const [k, v] of Object.entries(a)) {
    if (k === 'notes' || k.startsWith('_')) continue;
    if (typeof v === 'string' && GUID_RE.test(v)) fail(`alias ${name}.${k} pins a runtime GUID ("${v}") — move it to aliases.<env>.json`);
  }
  if (loginAliases.includes(name)) {
    const pw = String(a.password || '');
    if (!/^\{\{[A-Z0-9_]+\}\}$/.test(pw)) fail(`login alias ${name}.password must be a {{VAR}} token, got "${pw}"`);
    const want = emailByAlias.get(name);
    if (a.email !== want) fail(`login alias ${name}.email "${a.email}" != spec "${want}" — the spec is the source of truth`);
  }
  const keyWant = { ORG_ADDR22: ['org_name', ADDR22_ORG_NAME], [DISCONTINUED_ORDER_ALIAS]: ['number', DISC_ORDER_NUMBER] }[name];
  if (keyWant && a[keyWant[0]] !== keyWant[1]) fail(`alias ${name}.${keyWant[0]} "${a[keyWant[0]]}" != spec "${keyWant[1]}"`);
  if (!problems.some((p) => p.includes(name))) ok(`${name} registered (no pinned GUID)`);
}

// 3. Informational: vcst overlay carries the seeded ids.
console.log('\n[3] (info) vcst overlay carries the seeded ids');
const vcstPath = join(ROOT, 'test-data', 'aliases.vcst.json');
if (existsSync(vcstPath)) {
  const overlay = JSON.parse(readFileSync(vcstPath, 'utf8'));
  const idKeyFor = (name) => (name === 'ORG_ADDR22' ? 'org_id' : name === DISCONTINUED_ORDER_ALIAS ? 'id' : 'userId');
  for (const name of allOwnedAliases()) {
    const key = idKeyFor(name);
    const id = overlay[name]?.[key];
    if (id && GUID_RE.test(String(id))) ok(`aliases.vcst.json → ${name}.${key} present`);
    else warn(`aliases.vcst.json has no ${name}.${key} — @td(${name}) won't resolve on vcst until \`npm run seed:edge-cases\` runs.`);
  }
} else warn('aliases.vcst.json absent — run seed:edge-cases to populate the overlay.');

console.log('\n=== edge-case fixture validation ===');
console.log(`  hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nEdge-case fixture test-data OK — spec-consistent, multi-env-clean.');
process.exit(0);
