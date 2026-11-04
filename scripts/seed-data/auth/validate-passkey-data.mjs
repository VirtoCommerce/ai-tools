#!/usr/bin/env node
/**
 * validate-passkey-data.mjs — STATIC drift guard for the VCST-6121 passkey sign-in accounts
 * (passkey-specs.mjs + their aliases). No network.
 *
 * A VACUITY guard first — each check is a one-cell edit that still seeds and still resolves while a
 * case tests nothing:
 *   - PK_BUYER_MULTI must sit in TWO DIFFERENT orgs, and its org A (the one a case locks) must have no
 *     other member among our accounts — otherwise the fallback has nowhere to go, or locking it
 *     reaches another account's cases;
 *   - single-org buyers have exactly one org, PK_B2C none (an org claim on it would hide the
 *     no-organization branch);
 *   - the back-office accounts are Managers — never Customer (Admin entry is refused to a Customer by
 *     design, so that would test the refusal) and never Administrator (permission checks bypassed);
 *     the two of them are distinct accounts (independent key sets);
 *   - the operator's role carries loginOnBehalf and nothing else, and the operator is not a Customer;
 *   - a Customer carries no global role (org roles belong on the membership — VCST-5028);
 *   - every account is DISTINCT and OURS (agent-test-pk-*), and no destructive account doubles as a
 *     persona in a committed .env layer or another alias.
 * Then the hygiene: aliases registered, runtime ids EMPTY in the base, password only as the token,
 * no GUID literal, no overlay shadowing a committed email, every overlay field declared in the base.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMAIL_PREFIX, PASSWORD_TOKEN, STORE_TOKEN, ACCOUNTS, ORGS, OPERATOR_ROLE, BO_ROLE, BO_ROLE_NAME, OWN_ROLES, FOREIGN_STORE_MARKER,
} from './passkey-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const RUNTIME = ['userId', 'memberId', 'storeId', 'org_id', 'org_a_id', 'org_b_id', 'membership_a_id', 'membership_b_id', 'id'];
const errors = [];
const info = [];
const fail = (m) => errors.push(m);
const base = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const specText = readFileSync(join(ROOT, 'scripts/seed-data/auth/passkey-specs.mjs'), 'utf8');
const by = (alias) => ACCOUNTS.find((a) => a.alias === alias);

// [1] the shapes the cases need
const multi = ACCOUNTS.filter((a) => a.kind === 'multi-org');
if (multi.length !== 1) fail(`[1] expected exactly one multi-org account, found ${multi.length}`);
for (const m of multi) {
  if (m.orgs.length !== 2 || m.orgs[0] === m.orgs[1]) fail(`[1] ${m.alias}: needs TWO DIFFERENT orgs (org A locked, org B the fallback), has [${m.orgs.join(', ')}]`);
  const others = ACCOUNTS.filter((a) => a !== m && a.orgs.includes(m.orgs[0]));
  if (others.length) fail(`[1] ${m.alias}: its lockable org ${m.orgs[0]} also holds ${others.map((a) => a.alias).join(', ')} — locking it would reach their cases`);
}
for (const a of ACCOUNTS) {
  if (!a.email.startsWith(EMAIL_PREFIX)) fail(`[1] ${a.alias}: email ${a.email} lacks the ${EMAIL_PREFIX} sweep prefix`);
  for (const k of a.orgs) if (!ORGS.some((o) => o.key === k)) fail(`[1] ${a.alias}: unknown org ${k}`);
  if (a.kind === 'buyer' && a.orgs.length !== 1) fail(`[1] ${a.alias}: a single-org buyer needs exactly one org`);
  if (a.kind === 'b2c' && a.orgs.length) fail(`[1] ${a.alias}: a personal customer must have NO organization`);
  if (a.userType === 'Customer') {
    const wantStore = a.kind === 'foreign-store' ? FOREIGN_STORE_MARKER : STORE_TOKEN;
    if (!a.hasContact || a.storeId !== wantStore) fail(`[1] ${a.alias}: a ${a.kind} Customer needs a contact and storeId ${wantStore}`);
    if (a.roles.length) fail(`[1] ${a.alias}: a Customer carries no global role (VCST-5028)`);
  } else {
    if (a.userType !== 'Manager') fail(`[1] ${a.alias}: back-office account must be a Manager, is ${a.userType}`);
    if (a.hasContact || a.orgs.length) fail(`[1] ${a.alias}: a Manager here has no contact and no org`);
    if (a.roles.length !== 1) fail(`[1] ${a.alias}: exactly one global role expected`);
  }
  if (a.isAdministrator !== false) fail(`[1] ${a.alias}: isAdministrator must be false`);
}
const bo = ACCOUNTS.filter((a) => a.kind === 'bo-manager');
if (bo.length !== 2) fail(`[1] expected two back-office managers (Admin Shell / AngularJS), found ${bo.length}`);
for (const a of bo) {
  if (a.roles[0] !== BO_ROLE_NAME) fail(`[1] ${a.alias}: role must be ${BO_ROLE_NAME}`);
  if (a.storeId) fail(`[1] ${a.alias}: a back-office manager has no storeId`);
}
// PKA-015: the foreign-store contact is decidable only while it is a Customer of ANOTHER store with
// no org (an org claim or the run store would let the grant succeed for an unrelated reason), and
// only while no other persona borrows the marker. Its store is never written here (picked live).
const foreign = ACCOUNTS.filter((a) => a.kind === 'foreign-store');
if (foreign.length !== 1) fail(`[1] expected exactly one foreign-store account, found ${foreign.length}`);
for (const a of foreign) {
  if (a.userType !== 'Customer') fail(`[1] ${a.alias}: the foreign-store account must be a Customer (only Customers are held to the store rule), is ${a.userType}`);
  if (a.orgs.length) fail(`[1] ${a.alias}: the foreign-store account must have NO organization`);
  if (a.destructive) fail(`[1] ${a.alias}: the foreign-store account is not destructive — a lock would turn the store-rule refusal into a lockout refusal`);
}
for (const a of ACCOUNTS) if (a.kind !== 'foreign-store' && a.storeId === FOREIGN_STORE_MARKER) fail(`[1] ${a.alias}: only the foreign-store account may carry ${FOREIGN_STORE_MARKER}`);
const op = by('PK_OPERATOR');
if (!op || op.kind !== 'operator' || op.roles[0] !== OPERATOR_ROLE.name) fail('[1] PK_OPERATOR must hold OPERATOR_ROLE');
if (JSON.stringify(OPERATOR_ROLE.permissions) !== JSON.stringify(['platform:security:loginOnBehalf'])) fail('[1] OPERATOR_ROLE must carry platform:security:loginOnBehalf and nothing else');
for (const r of OWN_ROLES) {
  if (!r.id.startsWith('AGENT-TEST-') || !r.name.startsWith('AGENT-TEST-')) fail(`[1] own role ${r.name} must carry the AGENT-TEST- prefix (teardown deletes it)`);
  if (!r.permissions.length) fail(`[1] own role ${r.name} has no permission — a Manager holding only it would land on the Admin SPA no-access screen`);
}
if (new Set(OWN_ROLES.map((r) => r.id)).size !== OWN_ROLES.length) fail('[1] own roles must have distinct pinned ids');
if (!OWN_ROLES.includes(BO_ROLE) || BO_ROLE_NAME !== BO_ROLE.name) fail('[1] BO_ROLE must be one of OWN_ROLES — an EXISTING role is stand data and differs per env');
// The two Manager kinds must stay apart: a back-office manager that could impersonate would blur the
// operator-only refusal; an operator that is a plain back-office manager would have nothing to impersonate with.
if (BO_ROLE.permissions.includes('platform:security:loginOnBehalf')) fail('[1] BO_ROLE must not carry loginOnBehalf (that is OPERATOR_ROLE\'s one permission)');
if (BO_ROLE.permissions.some((p) => /^platform:security:/.test(p))) fail('[1] BO_ROLE must stay least-privilege: no platform:security:* permission');
for (const o of ORGS) if (!o.name.startsWith('AGENT-TEST-')) fail(`[1] org ${o.key} lacks the AGENT-TEST- prefix`);
const emails = ACCOUNTS.map((a) => a.email);
if (new Set(emails).size !== emails.length) fail('[1] account emails are not unique — two cases would share one key set / lockout count');
if (new Set(ACCOUNTS.map((a) => a.alias)).size !== ACCOUNTS.length) fail('[1] aliases are not unique');

// [2] registry
for (const a of [...ACCOUNTS, ...ORGS]) {
  const r = base[a.alias];
  if (!r) { fail(`[2] ${a.alias} not registered in aliases.json`); continue; }
  if (!r._inline) fail(`[2] ${a.alias}: must be _inline`);
  if (r.seed !== 'seed:passkey') fail(`[2] ${a.alias}: "seed" must be seed:passkey`);
  for (const f of RUNTIME) if (f in r && r[f] !== '') fail(`[2] ${a.alias}.${f} must be EMPTY in the committed base (runtime id → aliases.<env>.json)`);
  if (a.email) {
    if (r.email !== a.email || r.userName !== a.email) fail(`[2] ${a.alias}: base email/userName drifted from the spec (${r.email})`);
    if (r.password !== PASSWORD_TOKEN) fail(`[2] ${a.alias}: password must be the ${PASSWORD_TOKEN} token`);
    if (r.userType !== a.userType) fail(`[2] ${a.alias}: base userType ${r.userType} ≠ spec ${a.userType}`);
    if (a.kind === 'multi-org' && !['org_a_id', 'org_b_id', 'membership_a_id'].every((f) => f in r)) fail(`[2] ${a.alias}: must declare org_a_id / org_b_id / membership_a_id`);
    if (a.kind === 'foreign-store') {
      if (!('storeId' in r)) fail(`[2] ${a.alias}: must declare storeId (the live-picked foreign store is written back there)`);
      if (r.storeId_env) fail(`[2] ${a.alias}: storeId_env ${r.storeId_env} — its store is picked live, never an env variable`);
    }
  } else if (r.name !== a.name) fail(`[2] ${a.alias}: base name ${r.name} ≠ spec ${a.name}`);
}

// [3] a destructive account must not be a committed persona anywhere
const destructive = ACCOUNTS.filter((a) => a.destructive);
for (const f of readdirSync(ROOT).filter((n) => /^\.env\.[a-z0-9_]+$/i.test(n) && !/local|playwright/.test(n))) {
  const t = readFileSync(join(ROOT, f), 'utf8').toLowerCase();
  for (const a of ACCOUNTS) if (t.includes(a.email)) fail(`[3] ${a.alias} (${a.email}) appears in ${f} — a disposable account must not double as a persona`);
}
for (const [name, r] of Object.entries(base)) {
  if (ACCOUNTS.some((a) => a.alias === name)) continue;
  const t = JSON.stringify(r).toLowerCase();
  for (const a of destructive) if (t.includes(a.email)) fail(`[3] ${a.alias}'s email is also used by alias ${name}`);
}

// [4] overlays: no shadowing of a business key, no undeclared field
for (const f of readdirSync(join(ROOT, 'test-data')).filter((n) => /^aliases\.[a-z0-9_]+\.json$/i.test(n))) {
  let ov; try { ov = JSON.parse(readFileSync(join(ROOT, 'test-data', f), 'utf8')); } catch { continue; }
  for (const a of [...ACCOUNTS, ...ORGS]) {
    const o = ov[a.alias];
    if (!o) continue;
    if (a.email && ((o.email && o.email !== a.email) || (o.userName && o.userName !== a.email))) fail(`[4] ${f} ${a.alias} shadows the seeded email`);
    for (const k of Object.keys(o)) if (!(k in (base[a.alias] || {}))) fail(`[4] ${f} ${a.alias}.${k} is not declared in the base alias`);
  }
  const seeded = ACCOUNTS.filter((a) => ov[a.alias]?.userId);
  if (seeded.length) info.push(`${f}: ${seeded.length}/${ACCOUNTS.length} passkey accounts seeded`);
}

// [5] no GUID literal
if (GUID_RE.test(specText)) fail('[5] a GUID literal leaked into passkey-specs.mjs');
for (const a of [...ACCOUNTS, ...ORGS]) if (GUID_RE.test(JSON.stringify(base[a.alias] || {}))) fail(`[5] ${a.alias}: GUID literal in the committed base`);

console.log('\nPasskey sign-in fixtures — drift guard (static)\n');
info.forEach((m) => console.log(`  i ${m}`));
if (errors.length) { errors.forEach((e) => console.log(`  ✗ ${e}`)); console.log(`\n  ${errors.length} problem(s)`); process.exit(1); }
console.log(`  ✓ clean — ${ACCOUNTS.length} accounts + ${ORGS.length} orgs, all ours, multi-org pair decidable`);
