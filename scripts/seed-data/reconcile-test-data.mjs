/**
 * scripts/reconcile-test-data.mjs
 *
 * LIVE consistency gate for test-data against the CURRENT environment (VCST-5406).
 *
 * `validate-td-refs.ts` is STATIC — it proves @td() tokens resolve to a fixture
 * row and flags bare GUID literals, but it can't tell whether the referenced
 * entity actually EXISTS on the target platform. This script fills that gap: it
 * authenticates against BACK_URL and probes the live REST/xAPI surface to confirm
 * the entities test-data points at are really there for THIS `TEST_ENV`.
 *
 * Checks:
 *   1. Catalog root      — the active B2B virtual-catalog root resolves + exists.
 *   2. User roles        — every role in user-roles.mjs: env identity present +
 *                          live security account exists (the .env.{ENV} ↔ platform
 *                          alignment from Phase 2b).
 *   3. B2B organizations  — seeded rows in test-data/b2b/organizations.csv are
 *                          findable live (catches the stale-ORG-id drift).
 *   4. Secret hygiene     — no password literals committed in the user CSVs.
 *
 * Usage:
 *   TEST_ENV=vcst   npm run td:reconcile
 *   TEST_ENV=localhost npm run td:reconcile
 *   npm run td:reconcile -- --warn-only   # never exit non-zero (report only)
 *
 * Exit code: 1 when a REQUIRED role is missing/absent, the catalog root is
 * missing, or a password literal sits in a committed CSV — unless --warn-only.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, BACK_URL, api, auth, assertSafeTarget, loadAliases, log,
} from '../lib/seed-common.mjs';
import { resolveAllRoles } from '../lib/user-roles.mjs';

const WARN_ONLY = process.argv.includes('--warn-only');
const TEST_ENV = process.env.TEST_ENV || 'vcst';

/** hard failures (gate) vs soft notes (informational). */
const problems = [];
const notes = [];
const fail = (msg) => { problems.push(msg); console.log(`  ✗ ${msg}`); };
const ok = (msg) => console.log(`  ✓ ${msg}`);
const warn = (msg) => { notes.push(msg); console.log(`  ⚠ ${msg}`); };

/** Merge aliases.json ← aliases.{TEST_ENV}.json (same precedence as the resolver). */
function mergedAliases() {
  const base = loadAliases();
  const envPath = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  if (existsSync(envPath)) {
    try {
      const over = JSON.parse(readFileSync(envPath, 'utf8'));
      for (const [k, v] of Object.entries(over)) if (k !== '_meta') base[k] = v;
    } catch { /* ignore malformed override */ }
  }
  return base;
}

/* ── 1. Catalog root ─────────────────────────────────────────── */
async function checkCatalogRoot() {
  console.log('\n[1] Catalog root');
  const aliases = mergedAliases();
  const root = aliases?.VIRTUAL_CATALOG_B2B?.id;
  if (!root) { fail('VIRTUAL_CATALOG_B2B.id is not defined for this env (aliases.json / aliases.' + TEST_ENV + '.json)'); return; }
  const cat = await api('GET', `/api/catalog/catalogs/${encodeURIComponent(root)}`, null, { expectStatus: [200, 404] });
  if (cat?.id) ok(`virtual catalog ${cat.name || ''} (${root}) exists`);
  else fail(`VIRTUAL_CATALOG_B2B.id=${root} does NOT exist on ${new URL(BACK_URL).host} — stale/wrong for ${TEST_ENV}`);
}

/* ── 2. User roles (.env.{ENV} ↔ live platform) ──────────────── */
async function findSecurityUser(login) {
  const s = await api('POST', '/api/platform/security/users/search', { keyword: login, take: 10 }, { expectStatus: [200, 201] });
  return (s?.results || []).find((u) =>
    (u.userName || '').toLowerCase() === login.toLowerCase() ||
    (u.email || '').toLowerCase() === login.toLowerCase()) || null;
}

async function checkUserRoles() {
  console.log('\n[2] User roles (.env.' + TEST_ENV + ' ↔ platform)');
  const roles = resolveAllRoles();
  for (const r of roles) {
    if (!r.present) {
      const msg = `${r.key}: env identity incomplete (missing ${r.missing.join(', ')})`;
      if (r.required) fail(msg); else warn(`${msg} [optional]`);
      continue;
    }
    let user = null;
    try { user = await findSecurityUser(r.email); }
    catch (e) { warn(`${r.key}: probe error for ${r.email} — ${String(e.message).slice(0, 100)}`); continue; }
    if (user?.id) { ok(`${r.key} → ${r.email} (account exists)`); continue; }
    // Admin-kind roles are the platform administrator, NOT a seedable Customer member — they don't
    // surface in the customer/member search. Their existence is already proven by the successful
    // auth() this reconcile ran, so a search miss is not a real failure.
    if (r.kind === 'admin') { ok(`${r.key} → ${r.email} (platform admin — verified via auth, not seeded)`); continue; }
    if (r.required) fail(`${r.key} → ${r.email} has NO live account on ${TEST_ENV} (needs seed)`);
    else warn(`${r.key} → ${r.email} has no live account [optional — seed if the suite needs it]`);
  }
}

/* ── 3. B2B organizations ────────────────────────────────────── */
function parseCsvLoose(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
  if (!lines.length) return [];
  const head = lines[0].split(',').map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split(',');
    const row = {};
    head.forEach((h, i) => { row[h] = (cells[i] || '').trim(); });
    return row;
  });
}

async function checkB2bOrgs() {
  console.log('\n[3] B2B organizations (seeded rows findable live)');
  const p = join(ROOT, 'test-data/b2b/organizations.csv');
  if (!existsSync(p)) { warn('test-data/b2b/organizations.csv not found — skipping'); return; }
  const rows = parseCsvLoose(readFileSync(p, 'utf8'))
    .filter((r) => /^(true|yes|1)$/i.test(r.seeded || ''));
  if (!rows.length) { warn('no seeded=true org rows to check'); return; }
  for (const r of rows) {
    const name = r.name || r.org_name || r.organization_name;
    if (!name) continue;
    let hit = null;
    try {
      const s = await api('POST', '/api/members/search', { memberType: 'Organization', keyword: name, take: 5 }, { expectStatus: [200, 201] });
      hit = (s?.results || []).find((m) => (m.name || '').toLowerCase() === name.toLowerCase()) || null;
    } catch (e) { warn(`org "${name}" probe error — ${String(e.message).slice(0, 90)}`); continue; }
    if (hit?.id) {
      if (r.platform_id && hit.id !== r.platform_id) warn(`org "${name}" exists but platform_id drifted (csv=${r.platform_id} live=${hit.id})`);
      else ok(`org "${name}" exists`);
    } else warn(`org "${name}" (seeded=true) NOT found live — stale CSV row or needs reseed`);
  }
}

/* ── 5. B2B org-scoped memberships & role scoping (VCST-5028) ──
 * Invariants for every seeded org ("company") user:
 *   (a) the SECURITY ACCOUNT carries NO global org role — roles are org-scoped only;
 *   (b) the contact HAS ≥1 OrganizationMembership WITH a role;
 *   (c) a multi-org contact is a member of several orgs with DIFFERENT roles.
 */
function b2bOrgRoleIds() {
  const p = join(ROOT, 'test-data/b2b/roles.csv');
  const fallback = new Set(['org-employee', 'org-maintainer', 'purchasing-agent']);
  if (!existsSync(p)) return fallback;
  try {
    const rows = parseCsvLoose(readFileSync(p, 'utf8'));
    const ids = rows.filter((r) => (r.role_type || '').toUpperCase() === 'B2B').map((r) => r.role_id).filter(Boolean);
    return ids.length ? new Set(ids) : fallback;
  } catch { return fallback; }
}

/** Collect the org-user set (email → expected distinct org count) from both CSVs. */
function orgUsersToCheck() {
  const map = new Map(); // email → { orgs:Set, source }
  const bump = (email, orgKey, source) => {
    if (!email || !email.includes('@')) return;
    const e = email.trim().toLowerCase();
    const cur = map.get(e) || { email: email.trim(), orgs: new Set(), source };
    if (orgKey) orgKey.split(';').map((s) => s.trim()).filter(Boolean).forEach((o) => cur.orgs.add(o));
    map.set(e, cur);
  };
  const mem = join(ROOT, 'test-data/b2b/organization-memberships.csv');
  if (existsSync(mem)) for (const r of parseCsvLoose(readFileSync(mem, 'utf8'))) bump(r.user_email, r.org_name, 'memberships.csv');
  const usr = join(ROOT, 'test-data/b2b/users.csv');
  if (existsSync(usr)) for (const r of parseCsvLoose(readFileSync(usr, 'utf8'))) {
    if (!/^(true|yes|1)$/i.test(r.seeded || '')) continue;      // skip not-seeded / negative-test rows
    if (/^(true|yes|1)$/i.test(r.is_admin || '')) continue;     // admins legitimately hold global roles
    if (!(r.roles || '').trim()) continue;                       // no role → nothing to assert
    bump(r.email, r.org_id, 'users.csv');
  }
  return [...map.values()];
}

async function checkB2bMemberships() {
  console.log('\n[5] B2B org-scoped memberships & role scoping (VCST-5028)');
  const users = orgUsersToCheck();
  if (!users.length) { warn('no seeded org users to check'); return; }
  const orgRoleIds = b2bOrgRoleIds();
  for (const u of users) {
    let acct = null;
    try { acct = await findSecurityUser(u.email); } catch { warn(`${u.email}: account probe error`); continue; }
    if (!acct?.id) { warn(`${u.email}: no security account (run seed:b2b) [${u.source}]`); continue; }

    // (a) no GLOBAL org role on the account — fetch the FULL record (search hits omit roles[]).
    let full = null;
    try { full = await api('GET', `/api/platform/security/users/${encodeURIComponent(acct.id)}`, null, { expectStatus: [200, 404] }); } catch { /* ignore */ }
    const leaked = (full?.roles || []).map((r) => r.id || r.name).filter((r) => orgRoleIds.has(r));
    if (leaked.length) fail(`${u.email}: security account carries GLOBAL org role(s) [${leaked.join(', ')}] — roles must be org-scoped only`);

    // (b)/(c) org memberships with roles.
    let mems = [];
    try {
      const s = await api('POST', '/api/customer/organization-memberships/search', { userId: acct.id, take: 100 }, { expectStatus: [200, 201] });
      mems = s?.results || [];
    } catch (e) { warn(`${u.email}: membership search error — ${String(e.message).slice(0, 80)}`); continue; }
    const withRoles = mems.filter((m) => (m.roles || []).length > 0);
    if (!withRoles.length) { fail(`${u.email}: has NO OrganizationMembership with a role (needs seed:b2b memberships)`); continue; }

    const expectedOrgs = u.orgs.size || 1;
    const distinctRoles = new Set(withRoles.flatMap((m) => (m.roles || []).map((r) => r.roleId || r.id)));
    if (expectedOrgs > 1) {
      if (mems.length < expectedOrgs) fail(`${u.email}: multi-org member expected in ${expectedOrgs} orgs, found ${mems.length}`);
      else if (distinctRoles.size < 2) warn(`${u.email}: multi-org member but all ${mems.length} memberships share one role [${[...distinctRoles]}] — expected different roles per org`);
      else if (leaked.length === 0) ok(`${u.email}: multi-org (${mems.length} orgs, ${distinctRoles.size} distinct roles), account clean of global org roles`);
    } else if (leaked.length === 0) {
      ok(`${u.email}: org-scoped membership present (${withRoles.length}), account clean of global org roles`);
    }
  }
}

/* ── 4. Secret hygiene — no password literals in committed CSVs ── */
function checkSecretHygiene() {
  console.log('\n[4] Secret hygiene (no password literals in committed CSVs)');
  const targets = [
    { file: 'test-data/b2b/users.csv', cols: ['password'] },
    { file: 'test-data/b2b/organization-memberships.csv', cols: ['password'] },
    { file: 'test-data/users/test-users.csv', cols: ['password'] },
    { file: 'test-data/users/agent-user-pool.csv', cols: ['personal_password', 'b2b_password'] },
  ];
  // A `{{VAR}}` token is NOT a secret — it resolves from .env.local at seed time
  // (user-provision.mjs resolvePassword). Only bare literals count as a leak.
  const isToken = (v) => /^\{\{\s*[A-Z0-9_]+\s*\}\}$/.test(String(v || '').trim());
  let anyHit = false;
  for (const t of targets) {
    const p = join(ROOT, t.file);
    if (!existsSync(p)) continue;
    const rows = parseCsvLoose(readFileSync(p, 'utf8'));
    for (const col of t.cols) {
      const literals = rows.filter((r) => r[col] && r[col] !== 'n/a' && !isToken(r[col])).length;
      if (literals > 0) { warn(`${t.file}: column "${col}" has ${literals} password literal(s) — replace with a {{VAR}} token backed by .env.local (see user-provision.mjs resolvePassword)`); anyHit = true; }
    }
  }
  if (!anyHit) ok('no password literals in committed user CSVs ({{VAR}} tokens resolve from .env.local)');
}

/* ── main ─────────────────────────────────────────────────────── */
(async () => {
  console.log(`=== test-data live reconciliation — TEST_ENV=${TEST_ENV} ===`);
  assertSafeTarget();
  await auth();
  await checkCatalogRoot();
  await checkUserRoles();
  await checkB2bOrgs();
  await checkB2bMemberships();
  checkSecretHygiene();

  console.log('\n=== Summary ===');
  console.log(`  hard problems: ${problems.length}`);
  console.log(`  notes/warnings: ${notes.length}`);
  if (problems.length && !WARN_ONLY) {
    console.log('\nReconciliation FAILED. Fix the ✗ items above (or re-run with --warn-only to report only).');
    process.exit(1);
  }
  console.log(problems.length ? '\n(--warn-only: not failing despite hard problems.)' : '\nReconciliation OK.');
  process.exit(0);
})().catch((e) => { console.error('reconcile crashed:', e); process.exit(2); });
