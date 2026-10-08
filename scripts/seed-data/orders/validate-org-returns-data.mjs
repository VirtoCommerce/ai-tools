/**
 * validate-org-returns-data.mjs — STATIC drift guard for the VCST-5884 organization-returns fixture
 * set (npm run td:validate:returns-org). No network, no env — safe in CI. Shares org-returns-specs.mjs
 * with the seeder, so the spec, the seeder and this guard cannot disagree.
 *
 *   [1] the spec is DISCRIMINATING (validateOrgReturnsFixtureSet): the three grant sources isolated,
 *       blocking holders differing in status/lock only, buyer ≠ viewer in one org, a cross-org return,
 *       org email ≠ buyer email, the same-address / no-email / long-name boundaries intact;
 *   [2] no dedicated role id collides with a SHARED role declared in test-data/b2b/roles.csv;
 *   [3] every owned alias is registered in aliases.json with the same static values the spec declares,
 *       `seed: seed:returns:org`, a `_notes` with STATED LIMITS, a {{VAR}} password, and NO runtime GUID;
 *       no FIXTURE-GAP alias is registered (a case citing one must fail, not resolve to "");
 *   [4] seeded state on TEST_ENV's overlay (default vcst): the runtime ids exist, orders are attributed
 *       to the organization the spec says, and the grant sources did not collapse onto one org.
 */
import "../../lib/sync-stdio.mjs";
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLES, ORGS, PERSONAS, OTHER_RETURN, OWNED_ALIASES, FIXTURE_GAPS, SEED_SCRIPT, PASSWORD_TOKEN, BASE_ROLE,
  emailOf, orgEmailOf, upperVariant, fullNameOf, orgOrderNumber, validateOrgReturnsFixtureSet,
} from './org-returns-specs.mjs';
import { GUID_RE } from './orders-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TARGET_ENV = process.env.TEST_ENV || 'vcst';
const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);
const info = (m) => console.log(`  · ${m}`);
const readJson = (rel) => JSON.parse(readFileSync(join(ROOT, rel), 'utf8'));
const aliases = readJson('test-data/aliases.json');
const pkg = readJson('package.json');

console.log('\n[1] Fixture set is discriminating (SECOND RULE)');
const sharedRoleIds = readFileSync(join(ROOT, 'test-data/b2b/roles.csv'), 'utf8').split(/\r?\n/).slice(1).map((l) => l.split(',')[0]).filter(Boolean);
const v = validateOrgReturnsFixtureSet({ sharedRoleIds });
if (v.ok) ok(`${PERSONAS.length} personas, ${ORGS.length} organizations, ${ROLES.length} roles — every distinction under test holds`);
else v.problems.forEach(fail);

console.log('\n[2] Dedicated roles never collide with a shared role');
if (!sharedRoleIds.includes(BASE_ROLE.id)) fail(`BASE_ROLE ${BASE_ROLE.id} is not a declared shared role in b2b/roles.csv`);
for (const r of ROLES) if (sharedRoleIds.includes(r.id)) fail(`${r.alias}: id ${r.id} is a shared role`); else ok(`${r.alias} → ${r.id}`);

console.log('\n[3] Alias registry (aliases.json) — static values match the spec, no GUID, gaps unregistered');
if (!pkg.scripts?.[SEED_SCRIPT]) fail(`npm script ${SEED_SCRIPT} missing`);
const expectStatic = {};
for (const r of ROLES) expectStatic[r.alias] = { id: r.id, name: r.name, permissions: r.permissions.join(';') };
for (const o of ORGS) {
  const e = { name: o.name };
  if (orgEmailOf(o)) e.email = orgEmailOf(o);
  if (o.key === 'SAME_ADDRESS') e.email_upper = upperVariant(orgEmailOf(o));
  expectStatic[o.alias] = e;
}
for (const p of PERSONAS) {
  const e = { login: p.login, password: PASSWORD_TOKEN, name: fullNameOf(p), store_id: 'B2B-store' };
  if (emailOf(p)) e.email = emailOf(p);
  expectStatic[p.alias] = e;
}
expectStatic[OTHER_RETURN.alias] = {};
const scanGuid = (node, path, alias) => {
  if (typeof node === 'string') { if (GUID_RE.test(node)) fail(`${alias}: runtime GUID committed at ${path} (belongs in aliases.<env>.json)`); return; }
  if (node && typeof node === 'object') for (const [k, x] of Object.entries(node)) if (!k.startsWith('_')) scanGuid(x, `${path}.${k}`, alias);
};
for (const alias of OWNED_ALIASES) {
  const a = aliases[alias];
  if (!a) { fail(`${alias}: not registered in aliases.json`); continue; }
  const bad = [];
  if (a.seed !== SEED_SCRIPT) bad.push(`seed "${a.seed}" != "${SEED_SCRIPT}"`);
  if (!/STATED LIMITS/.test(a._notes || '')) bad.push('_notes lacks STATED LIMITS');
  for (const [k, want] of Object.entries(expectStatic[alias] || {})) {
    if (a[k] !== want) bad.push(`${k} "${a[k]}" != spec "${want}"`);
    if (!a.fields?.[k]) bad.push(`field ${k} not declared in fields{}`);
  }
  if (a.password !== undefined && !/^\{\{[A-Z0-9_]+\}\}$/.test(a.password)) bad.push('password is not a {{VAR}} token');
  scanGuid(a, alias, alias);
  if (bad.length) bad.forEach((b) => fail(`${alias}: ${b}`)); else ok(`${alias}`);
}
for (const g of FIXTURE_GAPS) if (aliases[g.alias]) fail(`${g.alias} is a declared FIXTURE-GAP but is registered — a case citing it would resolve instead of failing`);
info(`FIXTURE-GAPs (unregistered on purpose): ${FIXTURE_GAPS.map((g) => g.alias).join(', ')}`);

console.log(`\n[4] Seeded state on ${TARGET_ENV} (aliases.${TARGET_ENV}.json)`);
const ovPath = join(ROOT, `test-data/aliases.${TARGET_ENV}.json`);
const ov = existsSync(ovPath) ? JSON.parse(readFileSync(ovPath, 'utf8')) : {};
const orgId = Object.fromEntries(ORGS.map((o) => [o.key, ov[o.alias]?.id]));
if (!Object.values(orgId).some(Boolean)) info(`not seeded on ${TARGET_ENV} — run: TEST_ENV=${TARGET_ENV} npm run ${SEED_SCRIPT}`);
else {
  const ids = Object.values(orgId);
  if (new Set(ids.filter(Boolean)).size !== ids.filter(Boolean).length) fail('two organizations share one runtime id — the cross-org / source isolation collapsed');
  for (const o of ORGS) if (!orgId[o.key]) fail(`${o.alias}: no runtime id on ${TARGET_ENV}`);
  for (const p of PERSONAS) {
    const r = ov[p.alias] || {};
    const miss = ['userId', 'contactId', 'organizationId', 'membershipId', ...(p.order ? ['orderId', 'orderNumber', 'lineAItemId', 'lineBItemId'] : [])].filter((f) => !r[f]);
    if (miss.length) { fail(`${p.alias}: missing ${miss.join(', ')} on ${TARGET_ENV}`); continue; }
    if (p.order && r.orderNumber !== orgOrderNumber(p.key)) fail(`${p.alias}: orderNumber ${r.orderNumber} != ${orgOrderNumber(p.key)}`);
    if (p.order && r.orderOrganizationId !== orgId[p.order]) fail(`${p.alias}: order attributed to ${r.orderOrganizationId}, spec says ${p.order} (${orgId[p.order]})`);
    const home = p.memberships[p.memberships.length === 1 ? 0 : 1];
    if (r.organizationId !== orgId[home.org]) fail(`${p.alias}: organizationId ${r.organizationId} != ${home.org}`);
    if (p.order && r.lineAOrderedQuantity === r.lineBOrderedQuantity) fail(`${p.alias}: both lines ordered ${r.lineAOrderedQuantity}`);
  }
  const userIds = PERSONAS.map((p) => ov[p.alias]?.userId).filter(Boolean);
  if (new Set(userIds).size !== userIds.length) fail('two personas resolve to ONE account — viewer and buyer would be the same person');
  const oth = ov[OTHER_RETURN.alias];
  if (!oth?.id || !oth?.number) fail(`${OTHER_RETURN.alias}: not seeded on ${TARGET_ENV}`);
  else if (oth.organizationId !== orgId.OTHER) fail(`${OTHER_RETURN.alias}: organizationId ${oth.organizationId} != ORG_RET_OTHER_ORG`);
  else if (oth.organizationId === orgId.VIEWER) fail(`${OTHER_RETURN.alias} sits in the VIEWER org — the leak probe is gone`);
  if (!problems.length) ok(`runtime ids present and coherent for ${PERSONAS.length} personas + ${ORGS.length} orgs + ${OTHER_RETURN.alias}`);
}

if (problems.length) { console.log(`\nFAILED — ${problems.length} problem(s).`); process.exit(1); }
console.log('\nOK — td:validate:returns-org green.');
process.exit(0);
