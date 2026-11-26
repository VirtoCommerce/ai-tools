#!/usr/bin/env node
/**
 * scripts/maintenance/creds-verify.mjs — `npm run creds:verify [-- <env>...]`
 *
 * Live check that every test account in test-accounts.local.json still SIGNS IN on its stand. `creds:check` says a
 * password name has a value; this says the value is the account's password. Per env (default: every env the store
 * names; an argument narrows it):
 *   - the accounts: every user role (scripts/lib/user-roles.mjs) the env resolves a login and a password for, and
 *     every account the store gives the env (the top level and `envs.<env>`) with a login — one entry per login;
 *     A recorded login whose password is a tool's, not a stand's (JIRA_*, BUILDER_IO_*), is not a stand account;
 *   - ONE sign-in per account per run (POST {BACK_URL}/connect/token, password grant, with the env's STORE_ID — a
 *     Customer gets invalid_grant without it; an admin role signs in context-free). The admin signs in first; with its
 *     token each account is looked up before its sign-in is spent: an absent one is reported, not tried; a locked one
 *     (a lockout fixture is locked on purpose) and one already MAX_FAILED failed attempts from a lockout are skipped,
 *     so running this again never locks an account out.
 * Each failure is one of two classes: GONE — the login no longer exists on the stand (the admin lookup says so; no
 * sign-in is spent), so the entry is stale: a teardown that deleted it would have removed it (accountUnset), and the
 * line gives the `npm run creds:forget` that does it now; or a failed sign-in (wrong password, locked, …). A refused
 * sign-in that counted no failed attempt (re-read after it) had the right password — a fixture the stand refuses on
 * purpose (another store, none) — and is reported as such, not as a failure.
 * Prints logins, password NAMES and the token endpoint's error code — never a value, and no token is kept.
 * A production stand (ENV_RISK=production) is left out unless named. Exit 1 when an account is GONE or does not sign in.
 */
import '../lib/sync-stdio.mjs';
import { STORE_FILE, StoreError, readStore, storeAccounts } from '../lib/test-accounts.mjs';
import { knownEnvs, layered } from '../lib/env-layers.mjs';
import { ROLE_PASSWORD_NAMES } from '../lib/env-core.js';
import { USER_ROLES, resolveAllRoles } from '../lib/user-roles.mjs';
import { isLockedOut } from '../lib/seed-common.mjs';

const root = process.cwd();
const named = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const TIMEOUT_MS = 20000;
const CONCURRENCY = 4;
const MAX_FAILED = 3; // the platform locks an account out after a few failed sign-ins; stop well short of it
const NOT_STAND = /^(JIRA|BUILDER_IO)(_|$)/; // a tool's account (the tracker, the CMS), recorded beside the stand's

let store;
try { store = readStore(root); } catch (e) { console.log(`✗ ${e instanceof StoreError ? e.message : String(e)}`); process.exit(1); }
if (!store.exists) { console.log(`✗ no ${STORE_FILE} — npm run creds:migrate, or get it from the team's secret store`); process.exit(1); }

const fileEnvs = new Set(knownEnvs(root));
// Every env the project defines as well as every env the store names: an env whose accounts are all the store's top
// level (or roles) has no `envs.<env>` section and must still be checked.
const envs = named.length ? named : [...new Set([...fileEnvs, ...Object.keys(store.envs)])].sort();

async function post(url, form) {
  const res = await fetch(url, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form), signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  return { ok: res.ok, status: res.status, body };
}

/** One password grant. → { ok, reason } — reason is the endpoint's error code, never a value. */
async function signIn(backUrl, username, password, storeId) {
  const form = { grant_type: 'password', username, password, scope: 'offline_access' };
  if (storeId) form.storeId = storeId;
  try {
    const r = await post(`${backUrl}/connect/token`, form);
    if (r.ok && r.body?.access_token) return { ok: true, token: r.body.access_token };
    return { ok: false, reason: [r.status, r.body?.error, r.body?.error_description].filter(Boolean).join(' ') };
  } catch (e) { return { ok: false, unreachable: true, reason: e.name === 'TimeoutError' ? 'timeout' : (e.cause?.code ?? e.message) }; }
}

async function lookUp(backUrl, token, login) {
  try {
    const res = await fetch(`${backUrl}/api/platform/security/users/${encodeURIComponent(login)}`, {
      headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404 || res.status === 204) return { absent: true };
    if (!res.ok) return null;
    const text = await res.text();
    return (text ? JSON.parse(text) : null) ?? { absent: true };
  } catch { return null; }
}

async function pool(items, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

async function verifyEnv(env) {
  const lines = [];
  if (!fileEnvs.has(env)) return { env, lines: [`  no .env.${env} file — skipped`], skipped: true };
  const recorded = storeAccounts(store, env);
  const passwordNames = [...ROLE_PASSWORD_NAMES, ...recorded.map((a) => a.passwordName).filter(Boolean)];
  const r = layered(env, { root, ambient: {}, passwordNames });
  const backUrl = (r.env.BACK_URL ?? '').replace(/\/$/, '');
  const storeId = r.env.STORE_ID;
  if (!backUrl) return { env, lines: ['  no BACK_URL — skipped'], skipped: true };
  if (!named.length && r.env.ENV_RISK?.trim().toLowerCase() === 'production') return { env, lines: [`  ${backUrl}: ENV_RISK=production — skipped (name it to check it)`], skipped: true };

  // Every account, one per login: the roles first (their kind is known), then what the store recorded.
  const accounts = new Map();
  for (const role of resolveAllRoles(r.env)) {
    if (!role.present) continue;
    const key = role.email.toLowerCase();
    if (!accounts.has(key)) accounts.set(key, { login: role.email, name: ROLE_PW.get(role.key), password: role.password, kind: role.kind });
  }
  for (const a of recorded) {
    if (!a.login || NOT_STAND.test(a.key) || NOT_STAND.test(a.passwordName ?? '')) continue;
    const key = a.login.toLowerCase();
    const password = (a.passwordName && r.env[a.passwordName]) ?? a.password;
    if (!accounts.has(key)) accounts.set(key, { login: a.login, name: a.passwordName ?? `${a.key}_PASSWORD`, password, kind: null });
    // Where the store holds it for this env — what creds:forget can remove (the env's own section only).
    if (Object.hasOwn(store.envs[env]?.accounts ?? {}, a.key)) accounts.get(key).storeKey = a.key;
  }
  const list = [...accounts.values()];
  const header = `${backUrl}${r.master ? ' (master stand)' : ''} — ${list.length} account(s)`;

  // The admin: its token lets every other account be looked up before a sign-in is spent on it.
  const admin = list.find((a) => a.kind === 'admin');
  let token = null;
  let adminSignIn = null;
  if (admin?.password) {
    adminSignIn = await signIn(backUrl, admin.login, admin.password);
    if (adminSignIn.unreachable) return { env, lines: [`  ${backUrl}: unreachable (${adminSignIn.reason}) — skipped`], skipped: true };
    token = adminSignIn.ok ? adminSignIn.token : null;
  }

  const results = await pool(list, async (a) => {
    const label = `${a.login} (${a.name})`;
    // A login with no password is an account the store names but does not sign in with (a colleague's reused demo rep).
    if (!a.password) return { ok: true, skipped: true, line: `– ${label}: no password recorded — not ours to sign in, not tried` };
    // The admin's one sign-in already happened above: never spend a second one on it.
    if (a === admin && adminSignIn) return adminSignIn.ok ? { ok: true, line: `✓ ${label}` } : { ok: false, line: `✗ ${label}: ${adminSignIn.reason}` };
    // Without the admin's token no account's lockout state can be read: trying them would spend unguarded failed sign-ins.
    if (adminSignIn && !token) return { ok: true, skipped: true, line: `– ${label}: not tried — the admin did not sign in, so its lockout state cannot be checked` };
    let sid = a.kind === 'admin' ? null : storeId;
    let user = null;
    if (token) {
      user = await lookUp(backUrl, token, a.login);
      if (user?.absent) return { ok: false, gone: true, line: `✗ GONE ${label}: no such account on the stand — ${goneFix(env, a)}` };
      if (user && isLockedOut(user)) return { ok: true, skipped: true, line: `– ${label}: locked until ${user.lockoutEnd} — not tried` };
      if ((user?.accessFailedCount ?? 0) >= MAX_FAILED) return { ok: false, line: `✗ ${label}: ${user.accessFailedCount} failed sign-ins already — not tried (fix the password, then reset the count by a good sign-in or a re-seed)` };
      if (user?.userType === 'Administrator') sid = null;
    }
    const s = await signIn(backUrl, a.login, a.password, sid);
    if (s.ok) return { ok: true, line: `✓ ${label}${sid ? ` storeId=${sid}` : ''}` };
    // A refusal that counted no failed attempt is not a wrong password: the stand checked the password, accepted it and
    // refused the sign-in for another reason — a fixture on another store, or on none, refused on purpose (OTP-024).
    // Only where lockout is on: an account with it off never counts a failed attempt, wrong password or not.
    if (!s.unreachable && user && !user.absent && user.lockoutEnabled !== false) {
      const after = await lookUp(backUrl, token, a.login);
      if (after && !after.absent && (after.accessFailedCount ?? 0) <= (user.accessFailedCount ?? 0)) {
        return { ok: true, refused: true, line: `– ${label}: password right (no failed attempt counted), sign-in refused by the stand (${s.reason}) — account store ${JSON.stringify(user.storeId ?? null)}, tried with storeId=${sid ?? 'none'}` };
      }
    }
    return { ok: false, line: `✗ ${label}: ${s.unreachable ? 'unreachable ' : ''}${s.reason}` };
  });
  const failed = results.filter((x) => !x.ok).length;
  const gone = results.filter((x) => x.gone).length;
  const skipped = results.filter((x) => x.skipped).length;
  const refused = results.filter((x) => x.refused).length;
  lines.push(`  ${header}: ${results.length - failed - skipped - refused} sign in, ${failed - gone} do not${gone ? `, ${gone} GONE` : ''}${refused ? `, ${refused} refused with the right password` : ''}${skipped ? `, ${skipped} skipped` : ''}${token ? '' : admin ? ' (admin did not sign in — no lookup)' : ' (no admin account — no lookup)'}`);
  for (const x of results) if (!x.ok || x.skipped || x.refused || process.argv.includes('--all')) lines.push(`    ${x.line}`);
  return { env, lines, failed: failed - gone, gone };
}

/** The fix for a GONE account: remove its entry when it is this env's own, else re-seed (a role, the top level). */
function goneFix(env, a) {
  if (!a.storeKey) return `not an entry of this env's own (a role, or the store's top level) — re-seed it`;
  if (a.storeKey.toLowerCase() === a.login.toLowerCase()) return `stale entry — remove: npm run creds:forget -- ${env} ${a.login}`;
  return `re-seed it, or if ${a.storeKey} is retired: npm run creds:forget -- ${env} ${a.storeKey}`;
}

const ROLE_PW = new Map(USER_ROLES.map((r) => [r.key, r.passwordVar]));

const results = await Promise.all(envs.map((e) => verifyEnv(e).catch((err) => ({ env: e, lines: [`  error: ${err.message}`], failed: 1 }))));
let failed = 0, gone = 0;
for (const res of results) {
  const mark = res.skipped ? '–' : res.failed || res.gone ? '✗' : '✓';
  console.log(`${mark} ${res.env}`);
  for (const l of res.lines) console.log(l);
  failed += res.failed ?? 0;
  gone += res.gone ?? 0;
}
const out = [];
if (failed) out.push(`${failed} account(s) do not sign in: re-run the account's seeder (it records the new password) or fix the value in ${STORE_FILE}.`);
if (gone) out.push(`${gone} account(s) GONE from their stand: each line says whether to remove the entry (npm run creds:forget) or re-seed the account.`);
console.log(out.length ? `\n${out.join('\n')}` : '\nEvery checked account signs in.');
process.exit(failed || gone ? 1 : 0);
