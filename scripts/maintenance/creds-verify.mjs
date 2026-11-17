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
 * Prints logins, password NAMES and the token endpoint's error code — never a value, and no token is kept.
 * A production stand (ENV_RISK=production) is left out unless named. Exit 1 when an account does not sign in.
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
const envs = named.length ? named : Object.keys(store.envs).sort();

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
  }
  const list = [...accounts.values()];
  const header = `${backUrl}${r.master ? ' (master stand)' : ''} — ${list.length} account(s)`;

  // The admin: its token lets every other account be looked up before a sign-in is spent on it.
  const admin = list.find((a) => a.kind === 'admin');
  let token = null;
  if (admin?.password) {
    const s = await signIn(backUrl, admin.login, admin.password);
    if (s.unreachable) return { env, lines: [`  ${backUrl}: unreachable (${s.reason}) — skipped`], skipped: true };
    token = s.ok ? s.token : null;
  }

  const results = await pool(list, async (a) => {
    const label = `${a.login} (${a.name})`;
    if (!a.password) return { ok: false, line: `✗ ${label}: ${env} has no value for ${a.name}` };
    let sid = a.kind === 'admin' ? null : storeId;
    if (token) {
      const user = await lookUp(backUrl, token, a.login);
      if (user?.absent) return { ok: false, line: `✗ ${label}: no such account on the stand` };
      if (user && isLockedOut(user)) return { ok: true, skipped: true, line: `– ${label}: locked until ${user.lockoutEnd} — not tried` };
      if ((user?.accessFailedCount ?? 0) >= MAX_FAILED) return { ok: false, line: `✗ ${label}: ${user.accessFailedCount} failed sign-ins already — not tried (fix the password, then reset the count by a good sign-in or a re-seed)` };
      if (user?.userType === 'Administrator') sid = null;
    }
    const s = await signIn(backUrl, a.login, a.password, sid);
    if (s.ok) return { ok: true, line: `✓ ${label}${sid ? ` storeId=${sid}` : ''}` };
    return { ok: false, line: `✗ ${label}: ${s.unreachable ? 'unreachable ' : ''}${s.reason}` };
  });
  const failed = results.filter((x) => !x.ok).length;
  const skipped = results.filter((x) => x.skipped).length;
  lines.push(`  ${header}: ${results.length - failed - skipped} sign in, ${failed} do not${skipped ? `, ${skipped} skipped` : ''}${token ? '' : admin ? ' (admin did not sign in — no lookup)' : ' (no admin account — no lookup)'}`);
  for (const x of results) if (!x.ok || x.skipped || process.argv.includes('--all')) lines.push(`    ${x.line}`);
  return { env, lines, failed };
}

const ROLE_PW = new Map(USER_ROLES.map((r) => [r.key, r.passwordVar]));

const results = await Promise.all(envs.map((e) => verifyEnv(e).catch((err) => ({ env: e, lines: [`  error: ${err.message}`], failed: 1 }))));
let failed = 0;
for (const res of results) {
  const mark = res.skipped ? '–' : res.failed ? '✗' : '✓';
  console.log(`${mark} ${res.env}`);
  for (const l of res.lines) console.log(l);
  failed += res.failed ?? 0;
}
console.log(failed ? `\n${failed} account(s) do not sign in. Wrong password: re-run the account's seeder (it records the new one) or fix the value in ${STORE_FILE}; no such account: seed it.` : '\nEvery checked account signs in.');
process.exit(failed ? 1 : 0);
