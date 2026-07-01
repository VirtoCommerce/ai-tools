#!/usr/bin/env node
/**
 * Seeds PERSONAL storefront accounts (no organization) from test-data/users/:
 *   - agent-user-pool.csv → the parallel-agent slot logins (personal_email) + the personal account.
 *     NOTE: the b2b_email side of that file (test-john.mitchell…, test-emily.johnson…, …) is owned
 *     by seed-b2b-fixtures.mjs and is NOT created here.
 *   - test-users.csv       → the generic personal QA users (qa-user-NN@…).
 * Each user = a Contact (no organizations) + a Customer security account (login), no roles.
 *
 * USAGE:  node scripts/seed-users.mjs [seed|teardown] [--dry-run] [--verbose]
 * Profiles: seed (default) | teardown (delete the accounts + contacts listed in the two CSVs).
 *
 * Safety: ENV_RISK gate (blocks production); idempotent (re-running finds existing users and skips);
 * TEST_ENV-aware (always pass TEST_ENV=localhost for the local stack).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { ensureMemberIndex, verifyCreated } from '../lib/seed-common.mjs';
import { resolveAllRoles } from '../lib/user-roles.mjs';

const TEST_ENV = process.env.TEST_ENV || 'vcst';
loadDotenv({ path: '.env.defaults' });
loadDotenv({ path: `.env.${TEST_ENV}`, override: true });
loadDotenv({ path: '.env.local', override: true });

// Per-env override promotion (mirrors config.js / seed-common.mjs): promote any
// `_${TEST_ENV.toUpperCase()}`-suffixed key onto its base name so .env.local's
// per-env password variants (e.g. USER_PASSWORD_VIRTOSTART) win. Without this the
// base password (loaded last with override) clobbers the per-env one and the
// seeded account gets the wrong password for this env (VCST-5406).
const _ENV_SUFFIX = `_${TEST_ENV.toUpperCase()}`;
for (const [k, v] of Object.entries(process.env)) {
  if (k.endsWith(_ENV_SUFFIX) && v) process.env[k.slice(0, -_ENV_SUFFIX.length)] = v;
}

const BACK_URL = process.env.BACK_URL;
const ADMIN = process.env.ADMIN;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const STORE_ID = process.env.STORE_ID || 'B2B-store';
const ENV_RISK = (process.env.ENV_RISK || 'dev').toLowerCase();

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUN_MAIN = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
const args = process.argv.slice(2);
const profile = args.includes('teardown') ? 'teardown' : 'seed';
const DRY_RUN = args.includes('--dry-run');
const VERBOSE = args.includes('--verbose');

// --- CSV (lenient, shared shape with the other seeders) ---
function parseCsvLine(line) {
  const f = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
    else { if (ch === '"') q = true; else if (ch === ',') { f.push(cur); cur = ''; } else cur += ch; }
  }
  f.push(cur); return f;
}
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  const h = parseCsvLine(lines[0]);
  return lines.slice(1).map(l => { const fl = parseCsvLine(l); return Object.fromEntries(h.map((k, i) => [k, fl[i] || ''])); });
}

// --- HTTP (reads run in dry-run; writes are stubbed) ---
let TOKEN = null;
const isRead = (m, p) => m === 'GET' || (m === 'POST' && p.includes('/search'));
async function authenticate() {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', username: ADMIN, password: ADMIN_PASSWORD, scope: 'offline_access' }),
  });
  if (!res.ok) throw new Error(`Auth ${res.status}: ${await res.text()}`);
  TOKEN = (await res.json()).access_token;
  console.log(`  Auth: OK${DRY_RUN ? ' [DRY RUN — reads only]' : ''}`);
}
let api = async function api(method, path, body, { expectStatus = [200, 201, 204] } = {}) {
  if (DRY_RUN && !isRead(method, path)) { if (VERBOSE) console.log(`  [DRY RUN] ${method} ${path}`); return { _dryRun: true, id: `dry-${Math.random().toString(36).slice(2, 8)}` }; }
  const headers = { Authorization: `Bearer ${TOKEN}` };
  let fb; if (body) { headers['Content-Type'] = 'application/json'; fb = JSON.stringify(body); }
  const res = await fetch(`${BACK_URL}${path}`, { method, headers, body: fb });
  if (!expectStatus.includes(res.status)) throw new Error(`${method} ${path} → ${res.status}: ${(await res.text().catch(() => '')).slice(0, 300)}`);
  return (res.headers.get('content-type') || '').includes('application/json') ? res.json() : null;
}
async function findUserByEmail(email) {
  try {
    const s = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 10 });
    const hit = (s?.results || []).find(u => (u.userName || '').toLowerCase() === email.toLowerCase() || (u.email || '').toLowerCase() === email.toLowerCase());
    if (hit?.id) return hit;
  } catch { /* fall through */ }
  try { const u = await api('GET', `/api/platform/security/users/${encodeURIComponent(email)}`, null, { expectStatus: [200, 404] }); return u?.id ? u : null; } catch { return null; }
}
async function findContactByEmail(email) {
  const r = await api('POST', '/api/members/search', { memberType: 'Contact', keyword: email, take: 20 });
  return (r?.results || []).find(m => (m.emails || []).some(e => e?.toLowerCase() === email.toLowerCase()));
}

// Named .env.{ENV} role identities that are PERSONAL customers (kind 'customer').
// These are the accounts suites reference via {{USER_EMAIL}} / @td(USER.email); seeding
// them here from the env registry guarantees the seeded account == the referenced
// account, with the per-env password, on EVERY env. 'admin'/'org' kinds are excluded:
// admin pre-exists, org members are owned by seed-b2b-fixtures.mjs (VCST-5406).
function roleUsers() {
  const nameFromEmail = (email) => {
    const local = (email.split('@')[0] || 'QA').replace(/[._-]+/g, ' ').trim().split(/\s+/);
    return { first: (local[0] || 'QA'), last: (local[1] || 'User') };
  };
  return resolveAllRoles()
    .filter((r) => r.kind === 'customer' && r.present)
    .map((r) => { const n = nameFromEmail(r.email); return { email: r.email, password: r.password, first: n.first, last: n.last, source: `env-role:${r.key}` }; });
}

// --- Build the personal-account list: env roles first, then both CSVs (deduped by email) ---
function personalUsers() {
  const out = []; const seen = new Set();
  const add = (email, password, first, last, source, status = 'Active') => {
    const e = (email || '').trim(); if (!e.includes('@')) return;
    const k = e.toLowerCase(); if (seen.has(k)) return; seen.add(k);
    out.push({ email: e, password: password || 'Password1!', first: first || 'QA', last: last || 'User', source, status: status || 'Active' });
  };
  // Env-role identities take precedence over CSV rows with the same email.
  for (const u of roleUsers()) add(u.email, u.password, u.first, u.last, u.source);
  try {
    for (const r of parseCsv(readFileSync(join(ROOT, 'test-data/users/agent-user-pool.csv'), 'utf-8'))) {
      if ((r.seeded || '').toLowerCase() === 'false') continue;
      if (r.personal_email && r.personal_email !== 'n/a') add(r.personal_email, r.personal_password, r.personal_first_name, r.personal_last_name, 'agent-pool');
    }
  } catch { /* optional */ }
  try {
    for (const r of parseCsv(readFileSync(join(ROOT, 'test-data/users/test-users.csv'), 'utf-8'))) {
      // `seeded=false` rows are deliberately NOT created (social-login, 2FA, inactive — states a
      // plain password-create can't represent). `status` (Active/Locked/Pending) is honored below.
      if ((r.seeded || '').toLowerCase() === 'false') continue;
      add(r.email, r.password, r.first_name, r.last_name, 'test-users', r.status);
    }
  } catch { /* optional */ }
  return out;
}

// Map a CSV `status` to the proven security-account create flags (mirrors seed-b2b-fixtures).
function statusFlags(status) {
  switch ((status || 'Active').toLowerCase()) {
    case 'locked':  return { status: 'Locked', emailConfirmed: true, lockoutEnabled: true, lockoutEnd: '9999-12-31T23:59:59Z' };
    case 'pending': return { status: 'PendingApproval', emailConfirmed: false, lockoutEnabled: false };
    default:        return { status: 'Approved', emailConfirmed: true, lockoutEnabled: false }; // Active
  }
}

async function ensurePersonalAccount(u) {
  const existing = await findUserByEmail(u.email);
  if (existing?.id) { if (VERBOSE) console.log(`    ↻ reuse ${u.email}`); return 'reused'; }
  // Personal contact (no organizations) + a Customer login linked to it. No roles.
  const contact = await api('POST', '/api/members', {
    memberType: 'Contact', firstName: u.first, lastName: u.last,
    fullName: `${u.first} ${u.last}`, name: `${u.first} ${u.last}`,
    emails: [u.email], status: 'Approved', timeZone: 'America/New_York', defaultLanguage: 'en-US', currencyCode: 'USD',
  });
  const contactId = contact?.id || `dry-${u.email}`;
  const res = await api('POST', '/api/platform/security/users/create', {
    userName: u.email, email: u.email, password: u.password, memberId: contactId, storeId: STORE_ID,
    userType: 'Customer', isAdministrator: false, ...statusFlags(u.status),
  });
  if (res && res.succeeded === false) throw new Error(`create ${u.email}: ${JSON.stringify(res.errors)}`);
  // Read the account back through the same search path a test/login uses — "created" must mean "present".
  const present = await verifyCreated(api, 'user', res?.id || contactId, { name: u.email });
  if (!present && !DRY_RUN) throw new Error(`create ${u.email}: account not found after create (verify failed)`);
  console.log(`    ✓ create ${u.email}${u.source?.startsWith('env-role') ? ` [${u.source}]` : ''}`);
  return 'created';
}

async function teardownAccount(u) {
  const user = await findUserByEmail(u.email);
  let contactId = user?.memberId || null;
  if (user?.id) await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(u.email)}`, null, { expectStatus: [200, 204, 404] });
  if (!contactId) contactId = (await findContactByEmail(u.email))?.id || null;
  if (contactId) await api('DELETE', `/api/members?ids=${encodeURIComponent(contactId)}`, null, { expectStatus: [200, 204, 404] });
  if (user?.id || contactId) console.log(`    ✗ ${u.email}`);
}

async function main() {
  console.log(`\n🌱 Seed personal users — profile: ${profile}${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log(`   Target: ${BACK_URL} | Store: ${STORE_ID}\n`);
  await authenticate();
  await ensureMemberIndex(api);
  const users = personalUsers();
  console.log(`  ${users.length} personal account(s) from agent-user-pool.csv + test-users.csv`);
  if (profile === 'teardown') {
    for (const u of users) await teardownAccount(u);
    console.log(`\n✅ Personal users teardown complete (${users.length} processed)\n`);
    return;
  }
  let created = 0, reused = 0;
  for (const u of users) { (await ensurePersonalAccount(u)) === 'created' ? created++ : reused++; }
  console.log(`\n✅ Personal users seed complete — ${created} created, ${reused} reused\n`);
}

if (RUN_MAIN) {
  if (!BACK_URL || !ADMIN || !ADMIN_PASSWORD) { console.error('Missing BACK_URL / ADMIN / ADMIN_PASSWORD in env'); process.exit(1); }
  if (ENV_RISK === 'production' && !args.includes('--allow-admin-writes-on-prod')) {
    console.error(`ABORT: ENV_RISK=production for ${new URL(BACK_URL).host} — refusing to seed. Pass --allow-admin-writes-on-prod to override.`);
    process.exit(2);
  }
  main().catch(e => { console.error(`\n❌ Seed failed: ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
}

// Test seam: swap the HTTP layer for unit tests.
export function __setApi(fn) { api = fn; }
export { parseCsv, personalUsers, ensurePersonalAccount };
