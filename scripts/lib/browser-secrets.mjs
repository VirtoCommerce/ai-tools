/**
 * scripts/lib/browser-secrets.mjs
 * Which LOGIN-password names the Playwright browser lanes must be able to type, what each lane holds, and whether a
 * running lane still holds what the credential store (scripts/lib/test-accounts.mjs) says now.
 *
 * Why the names are derived: a name a suite types but the lane lacks is not an error anywhere — Playwright MCP
 * substitutes only on an exact name match, so the case signs in with the literal name, fails, and is reported BLOCKED
 * hours into a run (2026-10-14, REG-2026-10-14-1556: 089/091 lost 120 of 124 cases to TEST_USER_PASSWORD). The names
 * come from what the repo already declares; the values from each env's layered env, whose credentials are the store's.
 *
 * A lane (scripts/lanes/playwright-lane.mjs) holds every non-production env's names as NAME_<ENV>, plus
 * MASTER_PASSWORD, in memory — no file. At start it writes a MANIFEST, `.vc-fix/lanes/<lane>-<pid>.json`: the names
 * and a salted fingerprint per value, never a value. The secret-token hook, the pre-flight and env:use compare a
 * manifest with the store to say "reconnect <lane>" when the store changed under it.
 *
 * Pure except for the manifest writer: reads files, never loads env, never prints a value; `laneSecrets` returns
 * values to the one caller that hands them to Playwright MCP.
 */
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { USER_ROLES } from './user-roles.mjs';
import { layeredEnv } from './env-core.js';
import { envSuffix } from './resolve-test-env.js';
import { MASTER_NAME, dedicatedEnvs, envFolders, isLoginSecretName, knownEnvs, readEnvFile, readMaster, usesMaster } from './env-layers.mjs';

export { isLoginSecretName };

/** Where a running lane leaves its manifest. Gitignored (.vc-fix/). */
export const LANES_DIR = join('.vc-fix', 'lanes');

// isLoginSecretName (scripts/lib/env-layers.mjs): a login password NAME, `X_PASSWORD`. Least privilege is why a lane
// holds only these — a page or a prompt injection can make an agent type any registered name — so a token/key-shaped
// name is never one, whatever it ends with.

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

/** `{ env, name }` of an env-qualified name (`ORG_USER_PASSWORD_VCST_QA`), by the longest env suffix; null when none matches. */
export function splitQualifiedName(qualified, envs) {
  for (const env of [...envs].sort((a, b) => b.length - a.length)) {
    const suffix = envSuffix(env);
    if (qualified.length > suffix.length && qualified.endsWith(suffix)) return { env, name: qualified.slice(0, -suffix.length) };
  }
  return null;
}

/**
 * The envs a lane covers, with the run tickets whose folders define or override each: every `.env.<env>` in the
 * project root (ticket null) and in the QA_ENV_PATH folders, every ticket's (scripts/lib/env-layers.mjs) — except
 * `.env.defaults` / `.env.local` / `.env.backup`, and except an env any of whose layered values or own files says
 * ENV_RISK=production: a run never types a production password.
 * @returns {{ envs: string[], excluded: { env: string, reason: string }[], tickets: Map<string, (string | null)[]> }}
 */
export function combinedEnvCandidates(root, ambient = process.env) {
  const tickets = new Map();
  const add = (env, ticket) => {
    if (!tickets.has(env)) tickets.set(env, []);
    if (!tickets.get(env).includes(ticket)) tickets.get(env).push(ticket);
  };
  for (const env of knownEnvs(root)) add(env, null);
  for (const d of dedicatedEnvs({ root, ambient })) if (!d.secrets) add(d.env, d.ticket);
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
 * Every env's value for each name, keyed `NAME_<ENV>`, from that env's layered env — once per run ticket that defines
 * or overrides it. One key holds one value, so a name whose value differs between them is a CONFLICT, never an entry.
 * A master stand (PASSWORDS=master) gets no entries: its lanes type MASTER_PASSWORD. Returns values: only the lane
 * launcher may use them. A name an env has no value for is listed under that env's `missing`.
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
      if (entries.has(qualified)) throw new Error(`${qualified} would be registered for two envs; rename one of them`);
      entries.set(qualified, { env, name: n, value: own.map((c) => c.values[n]).find(Boolean) });
    }
    envs.push({ env, written: have.length, missing: sorted.filter((n) => !have.includes(n) && !clash.includes(n)) });
  }
  return { entries, envs, excluded, master, conflicts };
}

/**
 * What a lane holds: every derived name of every non-production env as NAME_<ENV>, and MASTER_PASSWORD when the store
 * has one. `secrets` carries VALUES — for the launcher (and the checks that fingerprint them) only.
 * @returns {{ secrets: Map<string, string>, envs: string[], master: { env: string }[], conflicts: { env: string, name: string }[],
 *   excluded: { env: string, reason: string }[], missing: Map<string, string[]> }}
 */
export function laneSecrets(root, { ambient = process.env } = {}) {
  const { entries, envs, excluded, master, conflicts } = combinedSecretValues(root, deriveSecretNames(root).keys(), { ambient });
  const secrets = new Map([...entries].map(([q, e]) => [q, e.value]));
  const masterValue = readMaster({ root, ambient }).value;
  if (masterValue) secrets.set(MASTER_NAME, masterValue);
  return {
    secrets,
    envs: [...new Set([...envs.map((e) => e.env), ...master.map((m) => m.env)])].sort(),
    master, conflicts, excluded,
    missing: new Map(envs.map((e) => [e.env, e.missing])),
  };
}

/** A salted fingerprint of one value: tells two values apart, never gives one back. */
export const fingerprint = (salt, value) => createHmac('sha256', salt).update(String(value)).digest('hex').slice(0, 24);

const manifestName = (lane, pid) => `${lane}-${pid}.json`;

/** Write this lane's manifest (names + fingerprints, no value). Returns its path. */
export function writeLaneManifest(root, lane, secrets, { pid = process.pid, envs = [] } = {}) {
  const dir = join(root, LANES_DIR);
  mkdirSync(dir, { recursive: true });
  const salt = randomBytes(16).toString('hex');
  const names = Object.fromEntries([...secrets.keys()].sort().map((n) => [n, fingerprint(salt, secrets.get(n))]));
  const file = join(dir, manifestName(lane, pid));
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, `${JSON.stringify({ lane, pid, startedAt: new Date().toISOString(), envs, salt, names }, null, 2)}\n`);
  renameSync(tmp, file);
  return file;
}

/** Remove one manifest (a lane on its way out). */
export function removeLaneManifest(root, lane, pid = process.pid) {
  rmSync(join(root, LANES_DIR, manifestName(lane, pid)), { force: true });
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e?.code === 'EPERM'; } };

/**
 * The manifests of lanes that are running now (`lane` given: that lane's only), newest first. A manifest whose
 * process is gone is deleted on the way.
 */
export function readLaneManifests(root, lane = null, { isAlive = alive } = {}) {
  const dir = join(root, LANES_DIR);
  if (!existsSync(dir)) return [];
  const out = [];
  for (const f of readdirSync(dir)) {
    if (!f.endsWith('.json')) continue;
    let m;
    try { m = JSON.parse(readFileSync(join(dir, f), 'utf8')); } catch { continue; }
    if (!m?.lane || !m.pid || !m.names || !m.salt) continue;
    if (!isAlive(m.pid)) { rmSync(join(dir, f), { force: true }); continue; }
    if (lane && m.lane !== lane) continue;
    out.push(m);
  }
  return out.sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
}

/**
 * How a running lane differs from what the store says now: `stale` — names whose value changed; `absent` — names the
 * lane should hold now but does not (a seeder added an account); `gone` — names it holds that no longer exist. Values
 * are compared through the manifest's fingerprints only.
 * @param {{ salt: string, names: Record<string, string> }} manifest
 * @param {Map<string, string>} current laneSecrets(root).secrets
 */
export function laneDrift(manifest, current) {
  const stale = [], absent = [], gone = [];
  for (const [n, v] of current) {
    if (!(n in manifest.names)) absent.push(n);
    else if (manifest.names[n] !== fingerprint(manifest.salt, v)) stale.push(n);
  }
  for (const n of Object.keys(manifest.names)) if (!current.has(n)) gone.push(n);
  return { stale: stale.sort(), absent: absent.sort(), gone: gone.sort() };
}
