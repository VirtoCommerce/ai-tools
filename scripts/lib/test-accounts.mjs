// scripts/lib/test-accounts.mjs — THE store of test-account credentials: every test account's login and password,
// for every env, plus the master password, in one gitignored file at the project root.
//
//   {
//     "version": 2,
//     "master": "…",                                   the one password of every PASSWORDS=master stand
//     "shared": { "DEFAULT_TEST_PASSWORD": "…" },       passwords many accounts use — every env
//     "accounts": { "LOYALTY_VIP_USER": { "login": "…", "password": "…" } },   accounts the same on every env
//     "envs": {
//       "vcst": {
//         "shared": { "TEST_USER_PASSWORD": "…" },     this env's own values (beat the top level)
//         "accounts": {
//           "USER":  { "login": "…", "password": "…" },
//           "ADMIN": { "login": "admin", "password": "…", "vars": { "login": ["ADMIN", "ADMIN_EMAIL"] } },
//           "agent-test-x@test-agent.com": { "password": { "use": "DEFAULT_TEST_PASSWORD" } }
//         }
//       }
//     }
//   }
//
// An ACCOUNT holds its login and password side by side. A named one (`USER`) is what the suites, test-data and
// seeders call by variable: the loader exposes its login as `USER_EMAIL` and its password as `USER_PASSWORD` (or the
// names its `vars` lists, for the few accounts named otherwise — `ADMIN` (also `ADMIN_EMAIL`), `PERSONAL_USER_VIRTO`, a rep's `SR_REP_PASSWORD`).
// An account keyed by its login (a seeded fixture) exposes nothing; it is here so every account is in one place. A
// password `{ "use": NAME }` is the value of NAME — a `shared` one, or another account's — so a password fifty
// fixtures share is written once. `envs.<env>` beats the top level, an account field by field; "" unsets a shared one.
// Tokens and API keys never live here — they are vc-secrets' (a TOKEN / API / KEY / SECRET-shaped name is refused).
//
// The loader (scripts/lib/env-layers.mjs `layered`) puts `storeValues` over every .env* file; the Playwright lanes read
// them in memory (scripts/lanes/playwright-lane.mjs); a seeder that creates an account or sets its password records it
// (`recordAccount`, through scripts/lib/user-provision.mjs `accountSet`). Design:
// docs/superpowers/specs/2026-11-17-test-accounts-store-design.md. Never prints or returns a value except to a caller
// that asked for one.
import { chmodSync, closeSync, existsSync, openSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';

/** The store's file name, in the project root. Gitignored. */
export const STORE_FILE = 'test-accounts.local.json';
/** The tracked template: the store's SHAPE (a few example accounts), no values. The names an env needs: creds:check. */
export const STORE_EXAMPLE = 'templates/test-accounts.example.json';
export const STORE_VERSION = 2;
const NAME = /^[A-Z][A-Z0-9_]*$/;
const ENV = /^[a-z0-9_]+$/;

/** A token / API-key-shaped name: vc-secrets', never the store's. */
export const isTokenShaped = (name) => /TOKEN|API|KEY|SECRET/.test(String(name));
/**
 * A person's own account on a tool — the tracker, the code host (`JIRA_EMAIL`, `JIRA_PASSWORD`, `GITHUB_*`, `ADO_*`).
 * Not a test account: it stays with the person (.env.local, or vc-secrets), never in a store the team passes around.
 */
export const isPersonalServiceName = (name) => /^(JIRA|ATLASSIAN|CONFLUENCE|GITHUB|GITLAB|BITBUCKET|GIT|ADO|AZDO|AZURE_DEVOPS)(_|$)/.test(String(name));
/** A name the store may hold. */
export const isStoreName = (name) => NAME.test(String(name)) && !isTokenShaped(name) && !isPersonalServiceName(name);
/** An account key that is a variable stem (`USER`), not a login. */
const isNamedKey = (key) => NAME.test(String(key));

export class StoreError extends Error {}

const emptyStore = () => ({ master: null, shared: {}, accounts: {}, envs: {} });

/** The file parsed, untouched (any version), or null when absent. Throws StoreError on invalid JSON. */
export function readRawStore(root = process.cwd()) {
  const file = join(root, STORE_FILE);
  if (!existsSync(file)) return null;
  try { return JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    throw new StoreError(`${STORE_FILE} is not valid JSON (${String(e?.message ?? e).split('\n')[0]}) — fix it by hand or restore it from the team's secret store`);
  }
}

/**
 * The store of `root`. Absent: an empty store (`exists: false`). Present but unreadable, malformed or an older format:
 * throws StoreError — a broken credential store is never read as "no credentials".
 */
export function readStore(root = process.cwd()) {
  const file = join(root, STORE_FILE);
  const data = readRawStore(root);
  if (data === null) return { file, exists: false, ...emptyStore() };
  if (data?.version === 1) throw new StoreError(`${STORE_FILE} is in the older format (version 1) — npm run creds:migrate converts it`);
  const problems = validateStore(data);
  if (problems.length) throw new StoreError(`${STORE_FILE}: ${problems.join('; ')}`);
  const envs = {};
  for (const [e, s] of Object.entries(data.envs ?? {})) envs[e] = { shared: { ...(s.shared ?? {}) }, accounts: structuredClone(s.accounts ?? {}) };
  return { file, exists: true, master: data.master || null, shared: { ...(data.shared ?? {}) }, accounts: structuredClone(data.accounts ?? {}), envs };
}

/** What is wrong with a parsed store (names and positions only, never a value). Pure. */
export function validateStore(data) {
  const out = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['the file must hold one JSON object'];
  if (data.version !== STORE_VERSION) out.push(`version must be ${STORE_VERSION}`);
  for (const k of Object.keys(data)) if (!['version', 'master', 'shared', 'accounts', 'envs', '$schema', '//'].includes(k)) out.push(`unknown top-level key "${k}"`);
  if (data.master !== undefined && data.master !== null && typeof data.master !== 'string') out.push('master must be a string');
  const isObj = (o) => o && typeof o === 'object' && !Array.isArray(o);
  const shared = (o, where) => {
    if (o === undefined) return;
    if (!isObj(o)) { out.push(`${where} must be an object`); return; }
    for (const [k, v] of Object.entries(o)) {
      if (!NAME.test(k)) out.push(`${where}.${k} is not a variable name`);
      else if (isTokenShaped(k)) out.push(`${where}.${k} is token/key-shaped — tokens and API keys belong in vc-secrets`);
      if (typeof v !== 'string') out.push(`${where}.${k} must be a string`);
    }
  };
  const names = (list, where) => {
    for (const n of list) if (!isStoreName(n)) out.push(`${where}: "${n}" is not a variable name the store may hold`);
  };
  const accounts = (o, where) => {
    if (o === undefined) return;
    if (!isObj(o)) { out.push(`${where} must be an object`); return; }
    for (const [key, a] of Object.entries(o)) {
      const at = `${where}["${key}"]`;
      if (!key.trim()) { out.push(`${where} has an empty key`); continue; }
      if (isNamedKey(key) && isTokenShaped(key)) out.push(`${at} is token/key-shaped — tokens and API keys belong in vc-secrets`);
      if (isNamedKey(key) && isPersonalServiceName(key)) out.push(`${at} is a person's own tool account (tracker / code host) — it stays in .env.local or vc-secrets, not here`);
      if (!isObj(a)) { out.push(`${at} must be an object { login, password }`); continue; }
      for (const f of Object.keys(a)) if (!['login', 'password', 'vars', 'role', '//'].includes(f)) out.push(`${at}.${f} is not a field (login, password, vars, role)`);
      if (a.role !== undefined && !['user', 'admin'].includes(a.role)) out.push(`${at}.role must be "user" (storefront) or "admin" (back office)`);
      if (a.login !== undefined && typeof a.login !== 'string') out.push(`${at}.login must be a string`);
      const p = a.password;
      if (p !== undefined && typeof p !== 'string' && !(isObj(p) && Object.keys(p).length === 1 && typeof p.use === 'string' && isStoreName(p.use))) {
        out.push(`${at}.password must be a string or { "use": "<NAME>" }`);
      }
      if (a.vars !== undefined) {
        if (!isObj(a.vars)) out.push(`${at}.vars must be an object`);
        else {
          if (a.vars.login !== undefined) Array.isArray(a.vars.login) ? names(a.vars.login, `${at}.vars.login`) : out.push(`${at}.vars.login must be a list`);
          if (a.vars.password !== undefined) names([a.vars.password], `${at}.vars.password`);
        }
      }
    }
  };
  shared(data.shared, 'shared');
  accounts(data.accounts, 'accounts');
  if (data.envs !== undefined) {
    if (!isObj(data.envs)) out.push('envs must be an object');
    else for (const [env, s] of Object.entries(data.envs)) {
      if (!ENV.test(env)) out.push(`envs.${env} is not an env name ([a-z0-9_]+)`);
      if (!isObj(s)) { out.push(`envs.${env} must be an object { shared, accounts }`); continue; }
      for (const f of Object.keys(s)) if (!['shared', 'accounts', '//'].includes(f)) out.push(`envs.${env}.${f} is not a field (shared, accounts)`);
      shared(s.shared, `envs.${env}.shared`);
      accounts(s.accounts, `envs.${env}.accounts`);
    }
  }
  return out;
}

/** The variables an account exposes: its login under `loginVars`, its password under `passwordVar` (null: none). */
export function accountVars(key, entry) {
  const named = isNamedKey(key);
  const own = typeof entry?.password === 'string';
  return {
    loginVars: entry?.vars?.login ?? (named ? [`${key}_EMAIL`] : []),
    passwordVar: entry?.vars?.password ?? (named && own ? `${key}_PASSWORD` : null),
  };
}

/** `env`'s view: the top level with the env's `shared` and `accounts` over it (an account field by field). Pure. */
export function envView(store, env) {
  const own = store.envs?.[env] ?? { shared: {}, accounts: {} };
  const accounts = {};
  for (const [k, a] of Object.entries(store.accounts ?? {})) accounts[k] = { ...a };
  for (const [k, a] of Object.entries(own.accounts ?? {})) accounts[k] = { ...(accounts[k] ?? {}), ...a };
  return {
    shared: { ...(store.shared ?? {}), ...(own.shared ?? {}) },
    accounts,
    ownShared: new Set(Object.keys(own.shared ?? {})),
    ownAccounts: new Set(Object.keys(own.accounts ?? {})),
  };
}

/** The value of a password field: a string, or `{ use: NAME }` looked up in `values`. Pure. */
const passwordOf = (p, values) => (typeof p === 'string' ? p : p?.use ? values[p.use] : undefined);

/**
 * The variables `env` gets, flat — what the loader puts in process.env: every shared password by its name, every
 * named account's login and password by theirs. Empty values are dropped. `own`: the names this env's own section
 * sets (not inherited from the top level). Pure.
 */
export function storeValues(store, env) {
  const view = envView(store, env);
  const values = {}, own = new Set();
  const set = (k, v, isOwn) => { if (v) { values[k] = v; if (isOwn) own.add(k); else own.delete(k); } else delete values[k]; };
  for (const [k, v] of Object.entries(view.shared)) set(k, v, view.ownShared.has(k));
  // Own passwords first, then logins, then the passwords that `use` another name (which may be an account's).
  const entries = Object.entries(view.accounts);
  for (const [k, a] of entries) {
    const { passwordVar } = accountVars(k, a);
    if (passwordVar && typeof a.password === 'string') set(passwordVar, a.password, view.ownAccounts.has(k));
  }
  for (const [k, a] of entries) {
    const { loginVars, passwordVar } = accountVars(k, a);
    for (const v of loginVars) if (a.login) set(v, a.login, view.ownAccounts.has(k));
    if (passwordVar && typeof a.password !== 'string') set(passwordVar, passwordOf(a.password, values), view.ownAccounts.has(k));
  }
  return { values, own };
}

/**
 * Every account `env` has, side by side: `{ key, login, passwordName, password }` — login null when the store does
 * not know it, password null when the env has no value. For listing and lookup; returns values.
 */
export function storeAccounts(store, env) {
  const view = envView(store, env);
  const { values } = storeValues(store, env);
  return Object.entries(view.accounts).map(([key, a]) => {
    const { passwordVar } = accountVars(key, a);
    const login = a.login ?? (isNamedKey(key) ? null : key);
    const passwordName = typeof a.password === 'string' ? passwordVar : a.password?.use ?? null;
    return { key, login, passwordName, password: passwordOf(a.password, values) ?? null };
  });
}

/** Serialise a store: keys sorted, an account's fields in reading order, so a diff of two versions reads. Pure. */
export function serialiseStore(store) {
  const sorted = (o) => Object.fromEntries(Object.keys(o ?? {}).sort().map((k) => [k, o[k]]));
  const account = (a) => Object.fromEntries(['login', 'password', 'vars', 'role'].filter((f) => a[f] !== undefined).map((f) => [f, a[f]]));
  const accounts = (o) => Object.fromEntries(Object.keys(o ?? {}).sort().map((k) => [k, account(o[k])]));
  const out = { version: STORE_VERSION };
  if (store.master) out.master = store.master;
  out.shared = sorted(store.shared);
  out.accounts = accounts(store.accounts);
  out.envs = Object.fromEntries(Object.keys(store.envs ?? {}).sort().map((e) => {
    const s = store.envs[e];
    const section = {};
    if (Object.keys(s.shared ?? {}).length) section.shared = sorted(s.shared);
    if (Object.keys(s.accounts ?? {}).length) section.accounts = accounts(s.accounts);
    return [e, section];
  }));
  return `${JSON.stringify(out, null, 2)}\n`;
}

/** Write a store atomically (temp file + rename), owner-only where the OS supports it. */
export function writeStore(root, store) {
  const problems = validateStore(JSON.parse(serialiseStore(store)));
  if (problems.length) throw new StoreError(`refusing to write ${STORE_FILE}: ${problems.join('; ')}`);
  const file = join(root, STORE_FILE);
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, serialiseStore(store), { encoding: 'utf8', mode: 0o600 });
  try { renameSync(tmp, file); } catch (e) { rmSync(tmp, { force: true }); throw e; }
  try { chmodSync(file, 0o600); } catch { /* Windows: ACLs, not modes */ }
  return file;
}

/**
 * Record an account a seeder has just created, or set the password of, on `env`: `login`, whose password is the value
 * of `passwordName`. The account it belongs to — a named account with that login, else one keyed by the login — gets
 * that password: its own when `passwordName` is its own variable, else `{ use: passwordName }`. With `password` (one
 * generated because the env had no value for `passwordName`), the value is recorded too: in that account when the
 * name is its own, else in the env's `shared`. Re-reads the file right before writing. Returns true when it changed.
 * Never logs a value.
 */
export function recordAccount(root, env, login, passwordName, password) {
  if (!ENV.test(String(env))) throw new StoreError(`not an env name: ${JSON.stringify(env)}`);
  if (!isStoreName(passwordName)) throw new StoreError(`${passwordName} cannot name a password in ${STORE_FILE}`);
  const who = String(login ?? '').trim();
  if (!who) throw new StoreError('refusing to record an account with no login');
  if (password !== undefined && (typeof password !== 'string' || !password)) throw new StoreError(`${passwordName}: refusing to record an empty value`);
  // Read-modify-write under the store's lock: two seeders (two sessions on two envs) must not drop each other's records.
  return withStoreLock(root, () => {
    const store = readStore(root);
    const section = (store.envs[env] ??= { shared: {}, accounts: {} });
    section.shared ??= {}; section.accounts ??= {};
    const before = serialiseStore(store);
    const view = envView(store, env);
    const key = Object.keys(view.accounts).find((k) => (view.accounts[k].login ?? (isNamedKey(k) ? null : k)) === who) ?? who;
    const entry = view.accounts[key] ?? {};
    const { values } = storeValues(store, env);
    const refersTo = entry.password && typeof entry.password === 'object' ? entry.password.use : null;
    const ownVar = isNamedKey(key) ? accountVars(key, { ...entry, password: '' }).passwordVar : null;
    const envEntry = (section.accounts[key] ??= {});
    const recordShared = () => { if (password !== undefined && values[passwordName] !== password) section.shared[passwordName] = password; };
    if (!isNamedKey(key) || refersTo === passwordName) {
      // A fixture keyed by its login, or an account that already uses passwordName: say so, keep a generated value there.
      if (refersTo !== passwordName) envEntry.password = { use: passwordName };
      recordShared();
    } else if (ownVar === passwordName) {
      // A named account whose own password this is.
      if (password !== undefined && values[passwordName] !== password) envEntry.password = password;
    } else {
      // A named account set with another name's password: it holds that value now; its own name stays its own.
      recordShared();
      const value = password ?? values[passwordName];
      if (value && passwordOf(entry.password, values) !== value) envEntry.password = value;
    }
    if (!Object.keys(envEntry).length) delete section.accounts[key];
    if (serialiseStore(store) === before) return false;
    writeStore(root, store);
    return true;
  });
}

const LOCK_STALE_MS = 30_000;
const LOCK_WAIT_MS = 10_000;
/**
 * Run `fn` holding `<store>.lock` (created exclusively; a lock older than LOCK_STALE_MS is a crashed writer's and is
 * taken over). Waits up to LOCK_WAIT_MS for another writer, then throws StoreError.
 */
function withStoreLock(root, fn) {
  const lock = join(root, `${STORE_FILE}.lock`);
  const deadline = Date.now() + LOCK_WAIT_MS;
  for (;;) {
    try { closeSync(openSync(lock, 'wx')); break; } catch (e) {
      if (e?.code !== 'EEXIST') throw e;
      let age = 0;
      try { age = Date.now() - statSync(lock).mtimeMs; } catch { continue; /* released meanwhile */ }
      if (age > LOCK_STALE_MS) { rmSync(lock, { force: true }); continue; }
      if (Date.now() > deadline) throw new StoreError(`${STORE_FILE} is locked by another writer (${lock}) — retry; delete the lock only if no seeder is running`);
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try { return fn(); } finally { rmSync(lock, { force: true }); }
}

/**
 * A new account password the platform's default policy accepts (8+ characters, an upper- and a lowercase letter, a
 * digit, a symbol) and nobody else has: 20 characters from an alphabet with no quote, backslash or `$`, so it survives
 * every dotenv and shell it may pass through.
 */
export function generatePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!#%*+-.:=?@_'];
  const all = sets.join('');
  const chars = sets.map((s) => s[randomInt(s.length)]);
  while (chars.length < 20) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}
