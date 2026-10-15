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
 * one caller that writes the secrets file (`scripts/env/sync-playwright-secrets.mjs`).
 * Callers must load the layered env first (config.js / env-facts) so per-env suffixes are promoted.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'dotenv';
import { USER_ROLES } from './user-roles.mjs';

export const SECRETS_FILE = '.env.playwright.local';
/** The header line that stamps which TEST_ENV the values were resolved for. */
export const ENV_STAMP = /^#\s*generated-for:\s*TEST_ENV=([a-z0-9_]+)\s*$/m;

/**
 * A login password NAME: `X_PASSWORD`. Least privilege is the point of a separate file — a page or a
 * prompt injection can make an agent type any registered name — so a token/key-shaped name is never
 * one, whatever it ends with. A per-env suffix (`X_PASSWORD_VCST`) is collapsed by the loader and
 * is not a name a case types.
 */
export const isLoginSecretName = (n) => /^[A-Z][A-Z0-9_]*_PASSWORD$/.test(n) && !/TOKEN|API|KEY|SECRET/.test(n);

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

/** What the secrets file holds: whether it exists, the TEST_ENV it was generated for, and its name → value map. */
export function readSecretsFile(root) {
  const p = join(root, SECRETS_FILE);
  if (!existsSync(p)) return { exists: false, env: null, values: new Map() };
  const text = readFileSync(p, 'utf8');
  return { exists: true, env: ENV_STAMP.exec(text)?.[1] ?? null, values: new Map(Object.entries(parse(text))) };
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
