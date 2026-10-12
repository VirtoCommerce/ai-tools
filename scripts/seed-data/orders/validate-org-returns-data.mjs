/**
 * validate-org-returns-data.mjs — STATIC drift guard for the VCST-5884 organization-returns fixture
 * set (npm run td:validate:returns-org). STATIC by default: no network, no env — safe in CI. `--live`
 * (npm run td:validate:returns-org:live) adds the probes [L1]-[L4] of the ISOLATED sets' seeded state
 * (zero returns in ORG_RET_EMPTY_ORG, one member per isolated org, ORG_RET_RENAME_ORG not left renamed).
 * Shares org-returns-specs.mjs with the seeder, so the spec, the seeder and this guard cannot disagree.
 *
 *   [1] the spec is DISCRIMINATING (validateOrgReturnsFixtureSet): the three grant sources isolated,
 *       blocking holders differing in status/lock only, buyer ≠ viewer in one org, a cross-org return,
 *       org email ≠ buyer email, the same-address / no-email / long-name boundaries intact;
 *   [2] no dedicated role id collides with a SHARED role declared in test-data/b2b/roles.csv;
 *   [3] every owned alias is registered in aliases.json with the same static values the spec declares,
 *       `seed: seed:returns:org`, a `_notes` with STATED LIMITS, a {{VAR}} password, and NO runtime GUID;
 *       no FIXTURE-GAP alias is registered (a case citing one must fail, not resolve to "");
 *   [4] seeded state on TEST_ENV's overlay (default vcst): the runtime ids exist, orders are attributed
 *       to the organization the spec says, and the grant sources did not collapse onto one org; every
 *       declared spare order (RETURNABLE_LINE_FLOOR capacity) is registered in fields{} and seeded, and
 *       no spare resolves to its persona's main order or to another spare.
 */
import "../../lib/sync-stdio.mjs";
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ROLES, ORGS, PERSONAS, OTHER_RETURN, OWNED_ALIASES, FIXTURE_GAPS, SEED_SCRIPT, PASSWORD_TOKEN, BASE_ROLE,
  emailOf, accountEmailOf, authUsernameOf, orgEmailOf, upperVariant, fullNameOf, orgOrderNumber, validateOrgReturnsFixtureSet,
  spareOrderKeys, spareField, SPARE_FIELDS, RETURNABLE_LINE_FLOOR, declaredLineCapacity, ISOLATED_ORG_KEYS,
} from './org-returns-specs.mjs';
import { GUID_RE } from './orders-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const TARGET_ENV = process.env.TEST_ENV || 'vcst';
const LIVE = process.argv.includes('--live');
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
if (v.ok) ok(`${PERSONAS.length} personas, ${ORGS.length} organizations, ${ROLES.length} roles — every distinction under test holds; returnable-line capacity ${Object.entries(RETURNABLE_LINE_FLOOR).map(([k, f]) => `${k} ${declaredLineCapacity(PERSONAS.find((p) => p.key === k))}/${f}`).join(', ')}`);
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
  // The rename target and the name a case restores in Cleanup — both read from the spec, never typed in a case.
  if (o.renamedName) { e.original_name = o.name; e.renamed_name = o.renamedName; }
  expectStatic[o.alias] = e;
}
for (const p of PERSONAS) {
  // `email` is the AUTH username (graphql-auth resolveRole sends @td(<role>.email) as `username`) — the
  // login for every persona; an email-less persona's real account address lives in `account_email`.
  const e = { login: p.login, password: PASSWORD_TOKEN, name: fullNameOf(p), store_id: 'B2B-store', email: authUsernameOf(p) };
  if (!emailOf(p)) e.account_email = accountEmailOf(p);
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
  const persona = PERSONAS.find((p) => p.alias === alias);
  for (let i = 1; i <= (persona?.spares || 0); i++) for (const f of SPARE_FIELDS) if (!a.fields?.[spareField(i, f)]) bad.push(`spare field ${spareField(i, f)} not declared in fields{}`);
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
    const spareIds = [];
    spareOrderKeys(p).forEach((k, n) => {
      const i = n + 1;
      const gone = SPARE_FIELDS.filter((f) => f !== 'SeededAt' && !r[spareField(i, f)]);
      if (gone.length) { fail(`${p.alias}: spare ${i} missing ${gone.map((f) => spareField(i, f)).join(', ')} on ${TARGET_ENV} — run: TEST_ENV=${TARGET_ENV} npm run ${SEED_SCRIPT} -- --spares-only`); return; }
      if (r[spareField(i, 'OrderNumber')] !== orgOrderNumber(k)) fail(`${p.alias}: spare ${i} orderNumber ${r[spareField(i, 'OrderNumber')]} != ${orgOrderNumber(k)}`);
      spareIds.push(r[spareField(i, 'OrderId')]);
    });
    if (new Set([r.orderId, ...spareIds]).size !== 1 + spareIds.length) fail(`${p.alias}: a spare order resolves to the main order or to another spare — the line capacity collapsed`);
  }
  const userIds = PERSONAS.map((p) => ov[p.alias]?.userId).filter(Boolean);
  if (new Set(userIds).size !== userIds.length) fail('two personas resolve to ONE account — viewer and buyer would be the same person');
  const oth = ov[OTHER_RETURN.alias];
  if (!oth?.id || !oth?.number) fail(`${OTHER_RETURN.alias}: not seeded on ${TARGET_ENV}`);
  else if (oth.organizationId !== orgId.OTHER) fail(`${OTHER_RETURN.alias}: organizationId ${oth.organizationId} != ORG_RET_OTHER_ORG`);
  else if (oth.organizationId === orgId.VIEWER) fail(`${OTHER_RETURN.alias} sits in the VIEWER org — the leak probe is gone`);
  // Isolated sets: no seeded order may be attributed to the EMPTY org, and their member ids are theirs alone.
  for (const p of PERSONAS) {
    const r = ov[p.alias] || {};
    const orderOrgs = [r.orderOrganizationId].filter(Boolean);
    if (orgId.EMPTY && orderOrgs.includes(orgId.EMPTY)) fail(`${p.alias}: an order is attributed to ORG_RET_EMPTY_ORG — the zero-returns state can be broken`);
  }
  if (!problems.length) ok(`runtime ids present and coherent for ${PERSONAS.length} personas + ${ORGS.length} orgs + ${OTHER_RETURN.alias}`);
}

if (LIVE) await live();

/**
 * --live (needs the layered env + admin credentials; never part of CI). Probes the states the ISOLATED sets
 * exist to hold — a static guard cannot see another lane spending them:
 *   [L1] ORG_RET_EMPTY_ORG holds ZERO returns: POST /api/return/search {organizationId} with no status flag,
 *        so drafts and cancelled rows count too (KB-09C378C0: excludeDrafts is ignored; submittedOnly would
 *        hide a draft that still makes the org non-empty for the next run). Each offending return is named.
 *   [L2] ORG_RET_EMPTY_ORG holds zero orders (an order is what lets a return be raised in it).
 *   [L3] each isolated org has exactly ONE membership — its declared member.
 *   [L4] ORG_RET_RENAME_ORG carries its ORIGINAL name and status Approved — a RET-ORG-028 run that died before Cleanup
 *        leaves it renamed, and the next run's old-name assertion would then read the wrong value.
 */
async function live() {
  const { auth, api } = await import('../../lib/seed-common.mjs');
  console.log(`\n[L] live probe — TEST_ENV=${TARGET_ENV}`);
  await auth();
  const isolated = ORGS.filter((o) => ISOLATED_ORG_KEYS.includes(o.key));
  const emptyId = orgId.EMPTY;
  if (!emptyId) fail('[L1] ORG_RET_EMPTY_ORG has no runtime id — run: TEST_ENV=<env> npm run seed:returns:org -- --isolated-only');
  else {
    const r = await api('POST', '/api/return/search', { organizationId: emptyId, take: 50 });
    const rows = (r?.results || []).filter((x) => x.organizationId === emptyId);
    const total = Math.max(r?.totalCount || 0, rows.length);
    if (total) fail(`[L1] ORG_RET_EMPTY_ORG holds ${total} return(s), must hold 0: ${rows.map((x) => `${x.number} (id ${x.id}, ${x.status}, customer ${x.customerName}, order ${x.orderNumber || x.orderId})`).join('; ')}`);
    else ok('[L1] ORG_RET_EMPTY_ORG: POST /api/return/search {organizationId} totalCount 0');
    const o = await api('POST', '/api/order/customerOrders/search', { organizationId: emptyId, take: 20 });
    const orders = (o?.results || []).filter((x) => x.organizationId === emptyId);
    if (orders.length || o?.totalCount) fail(`[L2] ORG_RET_EMPTY_ORG has ${o?.totalCount || orders.length} order(s), must have 0: ${orders.map((x) => `${x.number} (id ${x.id}, customer ${x.customerName})`).join('; ')}`);
    else ok('[L2] ORG_RET_EMPTY_ORG: POST /api/order/customerOrders/search {organizationId} totalCount 0');
  }
  for (const org of isolated) {
    const id = orgId[org.key];
    if (!id) { fail(`[L3] ${org.alias}: no runtime id`); continue; }
    const member = PERSONAS.find((p) => p.memberships.some((x) => x.org === org.key));
    const mems = ((await api('POST', '/api/customer/organization-memberships/search', { organizationId: id, take: 50 }))?.results || []).filter((x) => x.organizationId === id);
    const want = ov[member.alias]?.membershipId;
    if (mems.length !== 1 || mems[0].id !== want) fail(`[L3] ${org.alias}: ${mems.length} membership(s) [${mems.map((x) => `${x.id} user ${x.userId}`).join(', ')}], must be exactly ${member.alias}'s ${want}`);
    else ok(`[L3] ${org.alias}: one membership — ${member.alias}`);
    if (org.renamedName) {
      const live = await api('GET', `/api/organizations/${id}`, null, { expectStatus: [200, 204, 404] }).catch(() => null);
      // PUT /api/organizations is a full replace: a rename body without status nulls it (vcst 2026-10-12).
      if (live?.name !== org.name || live?.status !== 'Approved') fail(`[L4] ${org.alias} is "${live?.name}" status ${live?.status}, must be "${org.name}" status Approved — a rename was not (fully) restored; re-run the isolated seed (it restores both)`);
      else ok(`[L4] ${org.alias}: name is the original "${org.name}", status Approved`);
    }
  }
}

if (problems.length) { console.log(`\nFAILED — ${problems.length} problem(s).`); process.exit(1); }
console.log('\nOK — td:validate:returns-org green.');
process.exit(0);
