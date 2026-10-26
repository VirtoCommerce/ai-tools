/**
 * scripts/lib/browser-secrets.mjs
 * Which LOGIN-password names the Playwright browser lanes must be able to type, and whether
 * `.env.playwright.local` (the `--secrets` file every playwright-* MCP server loads) registers them.
 *
 * Why this exists: that file used to be filled BY HAND, with values that "must equal .env.local".
 * A name a suite types but the file lacks is not an error anywhere — the MCP substitutes only on an
 * exact name match, so the case signs in with the literal name, fails, and is reported BLOCKED hours
 * into a run (2026-10-14, REG-2026-10-14-1556: 089/091 lost 120 of 124 cases to TEST_USER_PASSWORD).
 * The names are DERIVED here from what the repo already declares; the values come from the layered
 * env (`.env.local` is the source the seeders set passwords from), never from this file.
 *
 * Pure: reads files, never loads env, never writes, never returns or prints a value except to the
 * one caller that writes the secrets files (`scripts/maintenance/sync-playwright-secrets.mjs`).
 * Callers must load the layered env first (config.js / env-facts) so per-env suffixes are promoted —
 * except for the combined file, whose values `combinedSecretValues` layers per env itself.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { parse } from 'dotenv';
import { USER_ROLES } from './user-roles.mjs';
import { layeredEnv } from './env-core.js';
import { envSuffix } from './resolve-test-env.js';
import { dedicatedEnvs, envFolders, isLoginSecretName, knownEnvs, readEnvFile, usesMaster } from './env-layers.mjs';

export { isLoginSecretName };

export const SECRETS_FILE = '.env.playwright.local';
/** The header line that stamps which TEST_ENV the values were resolved for. */
export const ENV_STAMP = /^#\s*generated-for:\s*TEST_ENV=([a-z0-9_]+)\s*$/m;

/**
 * The combined `--secrets` file (`npm run secrets:sync:all`): every env's passwords, each name carrying
 * its env (`ORG_USER_PASSWORD_VCST_QA`), so one set of Playwright lanes serves sessions on several envs
 * with no restart — the env travels in the typed name. Its `# envs:` line is how a reader tells it from
 * a single-env file, whose names are bare.
 */
export const COMBINED_SECRETS_FILE = '.env.playwright.all';
const ENVS_LINE = /^# envs: (.*)$/m;

// isLoginSecretName (scripts/lib/env-layers.mjs): a login password NAME, `X_PASSWORD`. Least privilege is the point of
// a separate file — a page or a prompt injection can make an agent type any registered name — so a token/key-shaped
// name is never one, whatever it ends with. A per-env suffix (`X_PASSWORD_VCST`) is collapsed by the loader and is
// not a name a case types.

/** Every login-password name a text mentions, `{{X_PASSWORD}}` or bare. */
export function namesInText(text) {
  return [...new Set(String(text).match(/\b[A-Z][A-Z0-9_]*_PASSWORD\b/g) ?? [])].filter(isLoginSecretName);
}

function readManifest(root) {
  return JSON.parse(readFileSync(join(root, 'config', 'test-suites.json'), 'utf8'));
}

/** Rows of a CSV as field arrays — quoted fields may span lines. */
function csvRows(text) {
  const rows = []; let row = [], cur = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); cur = '';
      if (row.some((f) => f !== '')) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((f) => f !== '')) rows.push(row);
  return rows;
}

/**
 * Per suite id: how many cases it has and, per login-password name, the case ids whose row types it.
 * Suites whose CSV is missing are skipped.
 * @returns {Record<string, { cases: number, byName: Record<string, string[]> }>}
 */
export function suiteSecretCases(root, ids = null) {
  const want = ids ? new Set(ids) : null;
  const out = {};
  for (const s of readManifest(root).suites ?? []) {
    if (want && !want.has(s.id)) continue;
    const p = s.file ? join(root, s.file) : null;
    if (!p || !existsSync(p)) continue;
    const [head = [], ...rows] = csvRows(readFileSync(p, 'utf8'));
    const idCol = Math.max(0, head.indexOf('ID'));
    /** @type {Record<string, string[]>} */
    const byName = {};
    for (const r of rows) for (const n of namesInText(r.join('\n'))) (byName[n] ??= []).push(r[idCol]);
    out[s.id] = { cases: rows.length, byName };
  }
  return out;
}

/** Per suite id: the login-password names its CSV makes a browser type. */
export function suiteSecretNames(root, ids = null) {
  return Object.fromEntries(Object.entries(suiteSecretCases(root, ids)).map(([id, s]) => [id, Object.keys(s.byName).sort()]));
}

function walk(dir, files = []) {
  if (!existsSync(dir)) return files;
  for (const n of readdirSync(dir)) {
    if (n.startsWith('.')) continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, files);
    else if (/\.(csv|json)$/.test(n)) files.push(p);
  }
  return files;
}

/**
 * Every name the browser lanes may need, with where it was declared: the suite CSVs, the
 * `{{X_PASSWORD}}` tokens in test-data (seed inputs a case signs in with), and the role registry.
 * @returns {Map<string, Set<string>>} name → sources ("suite:089", "test-data", "role:ADMIN")
 */
export function deriveSecretNames(root) {
  /** @type {Map<string, Set<string>>} */
  const names = new Map();
  const add = (n, src) => { if (!isLoginSecretName(n)) return; if (!names.has(n)) names.set(n, new Set()); names.get(n).add(src); };
  for (const [id, ns] of Object.entries(suiteSecretNames(root))) for (const n of ns) add(n, `suite:${id}`);
  for (const f of walk(join(root, 'test-data'))) {
    for (const m of readFileSync(f, 'utf8').matchAll(/\{\{\s*([A-Z][A-Z0-9_]*_PASSWORD)\s*\}\}/g)) add(m[1], 'test-data');
  }
  for (const r of USER_ROLES) add(r.passwordVar, `role:${r.key}`);
  return names;
}

/**
 * What a secrets file holds: whether it exists, the TEST_ENV a single-env file was generated for, the
 * envs a combined file covers (null for a single-env file), and its name → value map.
 * @param {string} root
 * @param {string} [path] the file to read (default: `.env.playwright.local` under `root`)
 */
export function readSecretsFile(root, path = join(root, SECRETS_FILE)) {
  if (!existsSync(path)) return { path, exists: false, env: null, envs: null, values: new Map() };
  const text = readFileSync(path, 'utf8');
  return { path, exists: true, env: ENV_STAMP.exec(text)?.[1] ?? null, envs: combinedEnvs(text), values: new Map(Object.entries(parse(text))) };
}

/** The env list of a combined file's `# envs:` line, or null when the text is a single-env file. */
export function combinedEnvs(text) {
  const m = ENVS_LINE.exec(String(text));
  return m ? m[1].split(/\s+/).filter(Boolean) : null;
}

/** `{ env, name }` of an env-qualified name (`ORG_USER_PASSWORD_VCST_QA`), by the longest env suffix; null when none matches. */
export function splitQualifiedName(qualified, envs) {
  for (const env of [...envs].sort((a, b) => b.length - a.length)) {
    const suffix = envSuffix(env);
    if (qualified.length > suffix.length && qualified.endsWith(suffix)) return { env, name: qualified.slice(0, -suffix.length) };
  }
  return null;
}

/** Claude Code expands `${VAR}` and `${VAR:-default}` in `.mcp.json` args from its own environment; an unset `${VAR}` stays literal. */
const expandVars = (s) => s.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-([^}]*))?\}/g, (whole, name, fallback) => {
  const value = process.env[name];
  if (fallback !== undefined) return value || fallback;
  return value ?? whole;
});

/**
 * The `--secrets` file the playwright-* servers are started with: the first `--secrets` arg in the nearest
 * `.mcp.json` that declares one, from `root` upwards (a parent workspace's `.mcp.json` may declare the
 * servers). Relative paths resolve against `root`. Null when no `.mcp.json` declares one.
 */
export function declaredSecretsFile(root) {
  for (let dir = resolve(root), prev = null; dir !== prev; prev = dir, dir = dirname(dir)) {
    let servers;
    try { servers = JSON.parse(readFileSync(join(dir, '.mcp.json'), 'utf8')).mcpServers ?? {}; } catch { continue; }
    for (const server of Object.values(servers)) {
      const args = server?.args ?? [];
      const i = args.indexOf('--secrets');
      if (i !== -1 && args[i + 1]) {
        const file = expandVars(String(args[i + 1]));
        return isAbsolute(file) ? file : resolve(root, file);
      }
    }
  }
  return null;
}

/**
 * The envs the combined file covers, with the run tickets whose folders define or override each: every `.env.<env>`
 * in the project root (ticket null) and in the QA_ENV_PATH folders, every ticket's (scripts/lib/env-layers.mjs) —
 * except `.env.defaults` / `.env.local` / `.env.backup`, and except an env any of whose layered values or own files
 * says ENV_RISK=production: every lane loads the combined file, and a run never types a production password.
 * @returns {{ envs: string[], excluded: { env: string, reason: string }[], tickets: Map<string, (string | null)[]> }}
 */
export function combinedEnvCandidates(root, ambient = process.env) {
  const tickets = new Map();
  const add = (env, ticket) => {
    if (!tickets.has(env)) tickets.set(env, []);
    if (!tickets.get(env).includes(ticket)) tickets.get(env).push(ticket);
  };
  const dedicated = dedicatedEnvs({ root, ambient });
  for (const env of knownEnvs(root)) add(env, null);
  for (const d of dedicated) if (!d.secrets) add(d.env, d.ticket);
  for (const d of dedicated) if (d.secrets && tickets.has(d.env)) add(d.env, d.ticket); // a ticket's passwords for a defined env
  const out = [], excluded = [];
  for (const env of [...tickets.keys()].sort()) {
    const risk = tickets.get(env).flatMap((ticket) => {
      const own = [root, ...envFolders({ env, ticket, root, ambient })].map((dir) => readEnvFile(join(dir, `.env.${env}`))).filter(Boolean);
      return [layeredEnv(env, { root, ambient, ticket }).ENV_RISK, ...own.flatMap((o) => [o.ENV_RISK, o[`ENV_RISK${envSuffix(env)}`]])];
    });
    if (risk.some((r) => r?.trim().toLowerCase() === 'production')) excluded.push({ env, reason: 'ENV_RISK=production' });
    else out.push(env);
  }
  return { envs: out, excluded, tickets };
}

/**
 * Every env's value for each name, keyed `NAME_<ENV>`, from that env's layered env (config.js order) — once per
 * run ticket that defines or overrides it. One key holds one value, so a name whose value differs between them is a
 * CONFLICT, never an entry. A master stand (PASSWORDS=master) gets no entries: its lanes type MASTER_PASSWORD.
 * Only the writer of the combined file may call this: it returns values. A name an env has no value for is listed
 * under that env's `missing`; an env with no value at all is excluded.
 * @param {string} root
 * @param {Iterable<string>} names
 * @param {{ ambient?: Record<string, string | undefined> }} [options] the environment before any loading
 */
export function combinedSecretValues(root, names, { ambient = process.env } = {}) {
  const { envs: candidates, excluded, tickets } = combinedEnvCandidates(root, ambient);
  const sorted = [...new Set(names)].sort();
  const entries = new Map(), envs = [], master = [], conflicts = [];
  for (const env of candidates) {
    const contexts = tickets.get(env).map((ticket) => ({ ticket, values: layeredEnv(env, { root, ambient, ticket }) }));
    const own = contexts.filter((c) => !usesMaster(c.values));
    if (own.length < contexts.length) master.push({ env, tickets: contexts.filter((c) => usesMaster(c.values)).map((c) => c.ticket) });
    if (!own.length) continue;
    const have = [], clash = [];
    for (const n of sorted) {
      const values = new Set(own.map((c) => c.values[n]).filter(Boolean));
      if (values.size > 1) clash.push(n);
      else if (values.size) have.push(n);
    }
    for (const n of clash) conflicts.push({ env, name: n, tickets: own.filter((c) => c.values[n]).map((c) => c.ticket) });
    if (!have.length) { if (!clash.length) excluded.push({ env, reason: 'no password values' }); continue; }
    for (const n of have) {
      const qualified = n + envSuffix(env);
      if (entries.has(qualified)) throw new Error(`${qualified} would be written for two envs; rename one of them`);
      entries.set(qualified, { env, name: n, value: own.map((c) => c.values[n]).find(Boolean) });
    }
    envs.push({ env, written: have.length, missing: sorted.filter((n) => !have.includes(n) && !clash.includes(n)) });
  }
  return { entries, envs, excluded, master, conflicts };
}

/**
 * Classify each name against the loaded env and the file. Values are compared, never returned.
 *   ok         — the file holds the env's value (or the file is the only source: nothing to compare)
 *   unsynced   — the env has a value the file lacks or disagrees with → `npm run secrets:sync`
 *   undeclared — neither the env nor the file has it → a human must add it to .env.local
 * @param {Iterable<string>} names
 * @param {{ values: Map<string, string> }} file
 * @param {Record<string, string | undefined>} env
 */
export function classifySecretNames(names, file, env = process.env) {
  /** @type {{ ok: string[], unsynced: string[], undeclared: string[] }} */
  const out = { ok: [], unsynced: [], undeclared: [] };
  for (const n of [...new Set(names)].sort()) {
    const want = env[n], have = file.values.get(n);
    if (want) (have === want ? out.ok : out.unsynced).push(n);
    else (have ? out.ok : out.undeclared).push(n);
  }
  return out;
}
