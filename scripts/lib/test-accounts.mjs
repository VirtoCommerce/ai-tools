// scripts/lib/test-accounts.mjs — THE store of test-account credentials: every test account's login and
// password, for every env, plus the master password, in one gitignored file at the project root.
//
//   { "version": 1, "master": "…", "defaults": { NAME: value }, "envs": { "<env>": { NAME: value } },
//     "accounts": { "<env>": { "<login>": "<NAME of its password>" } } }
//
// A NAME is the variable the suites, test-data and seeders already use (ORG_USER_EMAIL, ORG_USER_PASSWORD, ADMIN,
// DEFAULT_TEST_PASSWORD). `envs.<env>` beats `defaults`. `accounts` lists every login a seeder created or set the
// password of on an env, with the NAME its password is under — so each account's login and password are both here
// (the value once, under the NAME; a login that shares DEFAULT_TEST_PASSWORD with fifty others does not copy it). Tokens and API keys never live here — they are vc-secrets'
// (a TOKEN / API / KEY / SECRET-shaped name is refused). The loader (scripts/lib/env-layers.mjs `layered`) puts these
// values over every .env* file; the Playwright lanes read them in memory (scripts/lanes/playwright-lane.mjs); a seeder
// that sets a password records it here (`recordCredentials`). Design: docs/superpowers/specs/2026-11-17-test-accounts-store-design.md.
//
// Never prints or returns a value except to a caller that asked for one.
import { chmodSync, existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import { join } from 'node:path';

/** The store's file name, in the project root. Gitignored. */
export const STORE_FILE = 'test-accounts.local.json';
/** The tracked template: the store's shape and every declared name, no values. */
export const STORE_EXAMPLE = 'templates/test-accounts.example.json';
const VERSION = 1;
const NAME = /^[A-Z][A-Z0-9_]*$/;
const ENV = /^[a-z0-9_]+$/;

/** A token / API-key-shaped name: vc-secrets', never the store's. */
export const isTokenShaped = (name) => /TOKEN|API|KEY|SECRET/.test(String(name));
/** A name the store may hold. */
export const isStoreName = (name) => NAME.test(String(name)) && !isTokenShaped(name);

export class StoreError extends Error {}

const empty = (file) => ({ file, exists: false, master: null, defaults: {}, envs: {}, accounts: {} });

/**
 * The store of `root`. Absent: an empty store (`exists: false`). Present but unreadable or malformed: throws
 * StoreError — a broken credential store is never read as "no credentials".
 */
export function readStore(root = process.cwd()) {
  const file = join(root, STORE_FILE);
  if (!existsSync(file)) return empty(file);
  let data;
  try { data = JSON.parse(readFileSync(file, 'utf8')); } catch (e) {
    throw new StoreError(`${STORE_FILE} is not valid JSON (${String(e?.message ?? e).split('\n')[0]}) — fix it by hand or restore it from the team's secret store`);
  }
  const problems = validateStore(data);
  if (problems.length) throw new StoreError(`${STORE_FILE}: ${problems.join('; ')}`);
  return { file, exists: true, master: data.master || null, defaults: { ...(data.defaults ?? {}) }, envs: structuredClone(data.envs ?? {}), accounts: structuredClone(data.accounts ?? {}) };
}

/** What is wrong with a parsed store (names and positions only, never a value). Pure. */
export function validateStore(data) {
  const out = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) return ['the file must hold one JSON object'];
  if (data.version !== VERSION) out.push(`version must be ${VERSION}`);
  for (const k of Object.keys(data)) if (!['version', 'master', 'defaults', 'envs', 'accounts', '$schema', '//'].includes(k)) out.push(`unknown top-level key "${k}"`);
  if (data.master !== undefined && data.master !== null && typeof data.master !== 'string') out.push('master must be a string');
  const section = (obj, where) => {
    if (obj === undefined) return;
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { out.push(`${where} must be an object`); return; }
    for (const [k, v] of Object.entries(obj)) {
      if (!NAME.test(k)) out.push(`${where}.${k} is not a variable name`);
      else if (isTokenShaped(k)) out.push(`${where}.${k} is token/key-shaped — tokens and API keys belong in vc-secrets`);
      if (typeof v !== 'string') out.push(`${where}.${k} must be a string`);
    }
  };
  section(data.defaults, 'defaults');
  if (data.envs !== undefined) {
    if (!data.envs || typeof data.envs !== 'object' || Array.isArray(data.envs)) out.push('envs must be an object');
    else for (const [env, obj] of Object.entries(data.envs)) {
      if (!ENV.test(env)) out.push(`envs.${env} is not an env name ([a-z0-9_]+)`);
      section(obj, `envs.${env}`);
    }
  }
  if (data.accounts !== undefined) {
    if (!data.accounts || typeof data.accounts !== 'object' || Array.isArray(data.accounts)) out.push('accounts must be an object');
    else for (const [env, obj] of Object.entries(data.accounts)) {
      if (!ENV.test(env)) out.push(`accounts.${env} is not an env name ([a-z0-9_]+)`);
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { out.push(`accounts.${env} must be an object`); continue; }
      for (const [login, name] of Object.entries(obj)) {
        if (!login.trim()) out.push(`accounts.${env} has an empty login`);
        if (!NAME.test(String(name)) || isTokenShaped(name)) out.push(`accounts.${env}["${login}"] must name the variable its password is under`);
      }
    }
  }
  return out;
}

/**
 * The credentials `env` gets: `defaults` with `envs.<env>` over them, empty values dropped. `own`: the names
 * `envs.<env>` itself sets. Pure.
 */
export function storeValues(store, env) {
  const own = store.envs?.[env] ?? {};
  const values = {};
  for (const [k, v] of Object.entries({ ...store.defaults, ...own })) if (v) values[k] = v;
  return { values, own: new Set(Object.keys(own).filter((k) => own[k])) };
}

/** Every name the store holds anywhere (defaults and every env). Pure. */
export function storeNames(store) {
  return new Set([...Object.keys(store.defaults ?? {}), ...Object.values(store.envs ?? {}).flatMap((o) => Object.keys(o))]);
}

/** Serialise a store: sections and names sorted, so a diff of two versions reads. Pure. */
export function serialiseStore(store) {
  const sorted = (o) => Object.fromEntries(Object.keys(o ?? {}).sort().map((k) => [k, o[k]]));
  const out = { version: VERSION };
  if (store.master) out.master = store.master;
  out.defaults = sorted(store.defaults);
  out.envs = Object.fromEntries(Object.keys(store.envs ?? {}).sort().map((e) => [e, sorted(store.envs[e])]));
  const accounts = Object.keys(store.accounts ?? {}).filter((e) => Object.keys(store.accounts[e]).length).sort();
  if (accounts.length) out.accounts = Object.fromEntries(accounts.map((e) => [e, sorted(store.accounts[e])]));
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
 * Record credentials a seeder (or a person, through the migration) has just set: `entries` { NAME: value } into
 * `envs.<env>` (or `defaults` with env null). Re-reads the file right before writing, so two seeders that finish one
 * after the other both land. Returns the names whose value changed. Never logs a value.
 */
export function recordCredentials(root, env, entries) {
  if (env !== null && !ENV.test(String(env))) throw new StoreError(`not an env name: ${JSON.stringify(env)}`);
  const store = readStore(root);
  const target = env === null ? (store.defaults ??= {}) : (store.envs[env] ??= {});
  const changed = [];
  for (const [k, v] of Object.entries(entries)) {
    if (!isStoreName(k)) throw new StoreError(`${k} cannot go in ${STORE_FILE}: ${isTokenShaped(k) ? 'tokens and API keys belong in vc-secrets' : 'not a variable name'}`);
    if (typeof v !== 'string' || !v) throw new StoreError(`${k}: refusing to record an empty value`);
    if (target[k] !== v) { target[k] = v; changed.push(k); }
  }
  if (changed.length) writeStore(root, store);
  return changed;
}

/**
 * Record an account a seeder has just created, or set the password of, on `env`: its login, under `accounts.<env>`,
 * with the NAME its password is under; and, with `password`, that value under `envs.<env>.<NAME>` when the env does
 * not already resolve NAME to it (a password generated for a NAME the env had no value for). Re-reads the file right
 * before writing. Returns true when the file changed. Never logs a value.
 */
export function recordAccount(root, env, login, passwordName, password) {
  if (!ENV.test(String(env))) throw new StoreError(`not an env name: ${JSON.stringify(env)}`);
  if (!isStoreName(passwordName)) throw new StoreError(`${passwordName} cannot name a password in ${STORE_FILE}`);
  const key = String(login ?? '').trim();
  if (!key) throw new StoreError('refusing to record an account with no login');
  const store = readStore(root);
  let changed = false;
  const accounts = (store.accounts[env] ??= {});
  if (accounts[key] !== passwordName) { accounts[key] = passwordName; changed = true; }
  if (password !== undefined) {
    if (typeof password !== 'string' || !password) throw new StoreError(`${passwordName}: refusing to record an empty value`);
    if (storeValues(store, env).values[passwordName] !== password) { (store.envs[env] ??= {})[passwordName] = password; changed = true; }
  }
  if (changed) writeStore(root, store);
  return changed;
}

/** The accounts the store lists for `env`: login → { name, password } (password: the value, or null when the env has none). */
export function storeAccounts(store, env) {
  const { values } = storeValues(store, env);
  return Object.fromEntries(Object.entries(store.accounts?.[env] ?? {}).map(([login, name]) => [login, { name, password: values[name] ?? null }]));
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
