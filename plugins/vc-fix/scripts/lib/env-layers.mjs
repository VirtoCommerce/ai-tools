// scripts/lib/env-layers.mjs — where an env's files are, and the ONE order every loader applies them in.
//
// An env is a set of files: `.env.<env>` (its URLs, identities, ENV_RISK, PASSWORDS) and `.env.playwright.<env>` (its
// passwords, gitignored). They live in the project root and, for a stand that belongs to one ticket or one machine,
// in DEDICATED folders listed in QA_ENV_PATH (`;`-separated, the first wins; set it in .env.local). A folder may use
// the placeholders QA_OUTPUT_DIR takes — `<ticket>` (the run's ticket), `<env>`, `<sprint>` — and nothing is appended:
//
//   QA_ENV_PATH=P:\VC\_VIRTO\tickets\<ticket>\.work\self-qa;P:\VC\_VIRTO\qa-envs
//
// The order, lowest first (`layered`): the process environment; the root's `.env.playwright.<env>` as KEY_<ENV> where
// unset; `.env.defaults` filling gaps; `.env.<env>`; `.env.local`; every KEY_<ENV> promoted over KEY; then each
// dedicated folder's `.env.<env>` and `.env.playwright.<env>`, the lowest-priority folder first. A dedicated file
// therefore beats the root KEY BY KEY, pins included: a ticket's folder can hold its own stand (`.env.vcst_6314`) or
// override a shared env for that ticket's runs (`.env.vcptcore_dev`). Each file is self-contained: none extends another.
//
// MASTER stands: `PASSWORDS=master` in an env's own file means every test account on it signs in with ONE password,
// MASTER_PASSWORD in the root's `.env.playwright.master`. Every test-account password variable resolves to it, and a
// browser lane types MASTER_PASSWORD in every password field. Without the marker an env keeps its own passwords.
// Only the env's own file counts: the root's `.env.<env>` for an env the project defines, else its QA_ENV_PATH file.
//
// The run's ticket fills `<ticket>`: an explicit argument, else QA_TICKET, else this session's bound run
// (`npm run run:use`); a folder whose placeholder has no value is skipped.
//
// Byte-identical in plugins/vc-fix/scripts/lib/env-layers.mjs: every path resolves against `root`, the caller's
// project root, never against this file. .claude/knowledge/execution/run-env.md is the procedure.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';
import { parse } from 'dotenv';
import { TEST_ENV_PATTERN, envSuffix } from './resolve-test-env.js';
import { TICKET_KEY, globDirs, resolveSprint, sessionRun } from './run-dir.mjs';

/** The master password's file (project root, gitignored) and the one name a browser lane types for it. */
export const MASTER_FILE = '.env.playwright.master';
export const MASTER_NAME = 'MASTER_PASSWORD';
/** `.env.<name>` files that are not envs (`master`: `.env.playwright.master` is the master password, not an env's). */
export const NOT_AN_ENV = new Set(['local', 'defaults', 'backup', 'master']);
const PLACEHOLDER = /<(ticket|env|sprint)>/gi;
/** The passwords every project's accounts have (config.js CORE). */
const CORE_PASSWORDS = ['ADMIN_PASSWORD', 'USER_PASSWORD'];

/**
 * A login password NAME: `X_PASSWORD`. A token/key-shaped name is never one, whatever it ends with — a page or a
 * prompt injection can make an agent type any name a lane registers.
 */
export const isLoginSecretName = (n) => /^[A-Z][A-Z0-9_]*_PASSWORD$/.test(n) && !/TOKEN|API|KEY|SECRET/.test(n);

/** A dotenv file's pairs, or null when it cannot be read (absent). */
export function readEnvFile(file) {
  try { return parse(readFileSync(file)); } catch { return null; }
}

/** QA_ENV_PATH's folders as written: from the process environment, else the root's .env.local, else .env.defaults. */
export function envPathTemplates({ root = process.cwd(), ambient = process.env } = {}) {
  const raw = ambient.QA_ENV_PATH
    ?? readEnvFile(join(root, '.env.local'))?.QA_ENV_PATH
    ?? readEnvFile(join(root, '.env.defaults'))?.QA_ENV_PATH
    ?? '';
  return raw.split(';').map((s) => s.trim()).filter(Boolean);
}

/** The run's ticket: `ticket` when given (null, or not a ticket key: none), else QA_TICKET, else this session's bound
 *  run; or null. It fills a `<ticket>` path segment, so nothing but a key ever does. */
export function currentTicket({ ticket, root = process.cwd(), ambient = process.env } = {}) {
  if (ticket !== undefined) {
    const key = ticket ? String(ticket).toUpperCase() : null;
    return key && TICKET_KEY.test(key) ? key : null;
  }
  const named = ambient.QA_TICKET?.trim().toUpperCase();
  if (named && TICKET_KEY.test(named)) return named;
  const sid = ambient.CLAUDE_CODE_SESSION_ID;
  return sid ? sessionRun(sid, root)?.ticket ?? null : null;
}

/**
 * The dedicated folders for `env`, absolute and highest priority first: QA_ENV_PATH with its placeholders filled.
 * A folder whose placeholder has no value (`<ticket>` with no run ticket, `<env>` when no env is named) is skipped.
 */
export function envFolders({ env, ticket, root = process.cwd(), ambient = process.env } = {}) {
  const values = { ticket: currentTicket({ ticket, root, ambient }), env: env ?? null };
  const out = [];
  for (const template of envPathTemplates({ root, ambient })) {
    let missing = false;
    const path = template.replace(PLACEHOLDER, (_, name) => {
      const key = name.toLowerCase();
      if (key === 'sprint' && !('sprint' in values)) values.sprint = resolveSprint(root);
      if (!values[key]) missing = true;
      return values[key] ?? '';
    });
    if (missing) continue;
    const dir = isAbsolute(path) ? resolve(path) : resolve(root, path);
    if (!out.includes(dir)) out.push(dir);
  }
  return out;
}

/**
 * The file that defines `env`: the highest-priority dedicated folder's `.env.<env>`, else the root's; null when there
 * is none (or the name is not a TEST_ENV name). An env is whatever this finds — env:use, run:use, `/preflight --env`
 * and deploy:pr accept exactly these names.
 */
export function findEnv(env, { ticket, root = process.cwd(), ambient = process.env } = {}) {
  if (!TEST_ENV_PATTERN.test(env ?? '') || NOT_AN_ENV.has(env)) return null;
  for (const dir of envFolders({ env, ticket, root, ambient })) {
    const file = join(dir, `.env.${env}`);
    if (existsSync(file)) return file;
  }
  const file = join(root, `.env.${env}`);
  return existsSync(file) ? file : null;
}

/**
 * What an env declares itself: its `.env.<env>` files merged key by key, the project root's first and each dedicated
 * folder's over it (`vars`), and its `.env.playwright.<env>` files the same way (`passwords`) — no .env.defaults, no
 * .env.local, no promotion. Deploy coordinates (DEPLOY_BRANCH, BACK_URL) are read from here.
 */
export function ownEnv(env, { ticket, root = process.cwd(), ambient = process.env } = {}) {
  const dirs = [root, ...envFolders({ env, ticket, root, ambient }).reverse()];
  const merge = (name) => Object.assign({}, ...dirs.map((dir) => readEnvFile(join(dir, name)) ?? {}));
  return { vars: merge(`.env.${env}`), passwords: merge(`.env.playwright.${env}`) };
}

/** The envs the project root defines (`.env.<env>`) — the list an "unknown env" error names. */
export function knownEnvs(root = process.cwd()) {
  return readdirSync(root).map((f) => /^\.env\.([a-z0-9_]+)$/.exec(f)?.[1])
    .filter((n) => n && !NOT_AN_ENV.has(n)).sort();
}

/** Where an unknown env was looked for, for an error message. */
export function lookedIn(env, { ticket, root = process.cwd(), ambient = process.env } = {}) {
  const templates = envPathTemplates({ root, ambient });
  if (!templates.length) return 'the project root';
  const t = currentTicket({ ticket, root, ambient });
  const folders = envFolders({ env, ticket: t, root, ambient });
  const skipped = !t && templates.some((x) => /<ticket>/i.test(x)) ? '; no run ticket, so the <ticket> folders were skipped' : '';
  return `the project root and ${folders.length ? folders.join(', ') : 'no QA_ENV_PATH folder'}${skipped}`;
}

/**
 * Every env file in the dedicated folders, across every ticket: each QA_ENV_PATH folder with its placeholders matched
 * against what exists on disk. `{ env, ticket, dir, file, secrets }` — ticket null for a folder without `<ticket>`,
 * secrets true for a `.env.playwright.<env>`. `npm run secrets:sync:all` writes their passwords; nothing else needs
 * all of them.
 */
export function dedicatedEnvs({ root = process.cwd(), ambient = process.env } = {}) {
  const out = [];
  for (const template of envPathTemplates({ root, ambient })) {
    const abs = resolve(isAbsolute(template) ? template : join(root, template));
    // Per path segment, a matcher that reads the placeholders' values back out of a matching folder's segment.
    const matchers = abs.split(/[\\/]+/).map((seg) => {
      if (!/<(ticket|env|sprint)>/i.test(seg)) return null;
      const body = seg.split(/(<(?:ticket|env|sprint)>)/i).map((p) => (/^<(ticket|env|sprint)>$/i.test(p)
        ? `(?<${p.slice(1, -1).toLowerCase()}>[^\\\\/]+)` : p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('');
      try { return new RegExp(`^${body}$`, 'i'); } catch { return /^$/; } // a placeholder twice in one segment: no match
    });
    for (const dir of globDirs(abs.replace(PLACEHOLDER, '*'))) {
      const parts = resolve(dir).split(/[\\/]+/);
      if (parts.length !== matchers.length) continue;
      const values = {};
      let matched = true;
      matchers.forEach((m, i) => { if (!m) return; const g = m.exec(parts[i])?.groups; if (g) Object.assign(values, g); else matched = false; });
      if (!matched) continue;
      const ticket = values.ticket?.toUpperCase() ?? null, folderEnv = values.env ?? null;
      if ((ticket !== null && !TICKET_KEY.test(ticket)) || (folderEnv !== null && !TEST_ENV_PATTERN.test(folderEnv))) continue;
      let names = [];
      try { names = readdirSync(dir); } catch { continue; }
      for (const f of names) {
        const m = /^\.env\.(playwright\.)?([a-z0-9_]+)$/.exec(f);
        const env = m?.[2];
        if (!env || NOT_AN_ENV.has(env) || (folderEnv !== null && env !== folderEnv)) continue;
        out.push({ env, ticket, dir, file: join(dir, f), secrets: !!m[1] });
      }
    }
  }
  return out;
}

/** Whether a layered env opted in to the master password. */
export const usesMaster = (env) => env?.PASSWORDS?.trim().toLowerCase() === 'master';

/** The master password: MASTER_PASSWORD in the root's `.env.playwright.master`, else in the process environment (CI). */
export function readMaster({ root = process.cwd(), ambient = process.env } = {}) {
  const file = join(root, MASTER_FILE);
  const value = readEnvFile(file)?.[MASTER_NAME] || ambient[MASTER_NAME] || null;
  return { file, value };
}

const scanned = new Map();
/**
 * The login-password names the project's test accounts use: the CORE two, `extra` (the caller's role registry), every
 * name a suite CSV under regression/suites types and every `{{X_PASSWORD}}` in test-data — the names
 * `npm run secrets:sync` derives, read without parsing a CSV. Scanned once per process, and only for a master stand.
 */
export function testAccountPasswordNames(root = process.cwd(), extra = []) {
  const key = resolve(root);
  if (!scanned.has(key)) {
    const names = new Set(CORE_PASSWORDS);
    const walk = (dir, file, re) => {
      let entries = [];
      try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const e of entries) {
        if (e.name.startsWith('.')) continue;
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, file, re);
        else if (file.test(e.name)) {
          try { for (const m of readFileSync(p, 'utf8').matchAll(re)) names.add(m[1]); } catch { /* unreadable */ }
        }
      }
    };
    walk(join(key, 'regression', 'suites'), /\.csv$/i, /\b([A-Z][A-Z0-9_]*_PASSWORD)\b/g);
    walk(join(key, 'test-data'), /\.(csv|json)$/i, /\{\{\s*([A-Z][A-Z0-9_]*_PASSWORD)\s*\}\}/g);
    scanned.set(key, names);
  }
  return new Set([...scanned.get(key), ...extra].filter(isLoginSecretName));
}

/**
 * An env's variables in the one order (the head of this file), computed WITHOUT touching process.env, so one process
 * can hold several envs (`secrets:sync:all`, the enforce-secret-token hook).
 *
 * @param {string} testEnv
 * @param {{ root?: string, ambient?: Record<string, string | undefined>, ticket?: string | null,
 *           ambientWins?: boolean, passwordNames?: Iterable<string>, masterValues?: boolean }} [options]
 *   `root`: the project root (default: the cwd); `ambient`: the environment before any loading (default:
 *   process.env); `ticket`: the run's ticket for `<ticket>` folders (default: currentTicket; null: none);
 *   `ambientWins`: what the environment already holds beats every file and pin (runners CI drives with `-e`);
 *   `passwordNames`: test-account password names beyond the scan (the caller's role registry);
 *   `masterValues: false`: decide PASSWORDS=master but skip the name scan and the master values — for a caller that
 *   needs only the decision (the enforce-secret-token hook, one process per typed password).
 * @returns {{ env: Record<string, string | undefined>, ticket: string | null, rootFile: boolean, dedicated: string[],
 *   dedicatedKeys: Set<string>, perEnv: Set<string>, master: null | { file: string, found: boolean, names: string[] },
 *   ignoredPasswords: null | { value: string | undefined, file: string | null }, sourceOf: (key: string) => string }}
 *   `perEnv`: keys holding this env's own value (a KEY_<ENV> pin, a dedicated file, the master password);
 *   `ignoredPasswords`: a PASSWORDS value dropped because it did not come from the env's own files;
 *   `sourceOf(key)` names what supplied a key's value — print it next to any target you act on.
 */
export function layered(testEnv, { root = process.cwd(), ambient = process.env, ticket, ambientWins = false, passwordNames = [], masterValues = true } = {}) {
  const suffix = envSuffix(testEnv);
  const env = { ...ambient, TEST_ENV: testEnv };
  const from = new Map(); // key → { file, pin? }: the layer that set its value (file null: the process environment)
  const perEnv = new Set(), dedicatedKeys = new Set(), dedicated = [];
  const held = (key) => ambientWins && key in ambient;
  const put = (key, value, file, pin) => { env[key] = value; from.set(key, pin ? { file, pin } : { file }); };

  const rootSecrets = `.env.playwright.${testEnv}`;
  for (const [k, v] of Object.entries(readEnvFile(join(root, rootSecrets)) ?? {})) {
    if (v && env[k + suffix] === undefined) put(k + suffix, v, rootSecrets);
  }
  for (const [k, v] of Object.entries(readEnvFile(join(root, '.env.defaults')) ?? {})) if (!(k in env)) put(k, v, '.env.defaults');
  const own = readEnvFile(join(root, `.env.${testEnv}`));
  for (const [file, parsed] of [[`.env.${testEnv}`, own], ['.env.local', readEnvFile(join(root, '.env.local'))]]) {
    for (const [k, v] of Object.entries(parsed ?? {})) if (!held(k)) put(k, v, file);
  }
  for (const [k, v] of Object.entries(env)) {
    if (!k.endsWith(suffix) || !v) continue;
    const base = k.slice(0, -suffix.length);
    if (!base || (ambientWins && base in ambient && !(k in ambient))) continue; // a file's pin never beats the environment
    put(base, v, from.get(k)?.file ?? null, k);
    perEnv.add(base);
  }

  const resolvedTicket = currentTicket({ ticket, root, ambient });
  for (const dir of envFolders({ env: testEnv, ticket: resolvedTicket, root, ambient }).reverse()) {
    for (const name of [`.env.${testEnv}`, `.env.playwright.${testEnv}`]) {
      const file = join(dir, name);
      const parsed = readEnvFile(file);
      if (!parsed) continue;
      dedicated.push(file);
      const values = { ...parsed };
      for (const [k, v] of Object.entries(parsed)) if (k.endsWith(suffix) && v && k.length > suffix.length) values[k.slice(0, -suffix.length)] = v;
      for (const [k, v] of Object.entries(values)) if (!held(k)) { put(k, v, file); perEnv.add(k); dedicatedKeys.add(k); }
    }
  }

  // PASSWORDS opts in ONE stand, and only from that stand's own file: the root's `.env.<env>` (or its
  // PASSWORDS_<ENV> pin) for an env the project defines, else the env's own QA_ENV_PATH files; for a CI runner, the
  // environment. A .env.local line, a .env.defaults one, an inherited environment or a ticket folder's override of a
  // project env is dropped: each would switch a stand others use, and seeding would reset its accounts to the master
  // password.
  let ignoredPasswords = null;
  const rootPasswords = own ? (own[`PASSWORDS${suffix}`] ?? own.PASSWORDS) : undefined;
  if (env.PASSWORDS !== undefined || rootPasswords !== undefined) {
    const f = from.get('PASSWORDS');
    const ownValue = !f ? (ambientWins ? env.PASSWORDS : undefined) // the environment: a CI runner's own, else inherited
      : own ? rootPasswords // a project env: its root file, whatever overrides it
        : dedicatedKeys.has('PASSWORDS') ? env.PASSWORDS : undefined; // an env only QA_ENV_PATH defines: its files
    if (env.PASSWORDS !== ownValue) {
      ignoredPasswords = { value: env.PASSWORDS, file: f?.file ?? null };
      if (ownValue === undefined) { delete env.PASSWORDS; from.delete('PASSWORDS'); } else put('PASSWORDS', ownValue, `.env.${testEnv}`);
    }
  }

  let master = null;
  if (usesMaster(env)) {
    const { file, value } = readMaster({ root, ambient });
    const names = masterValues ? [...testAccountPasswordNames(root, passwordNames)].sort() : [];
    if (value && masterValues) {
      for (const n of [...names, MASTER_NAME]) if (!held(n)) { put(n, value, MASTER_FILE); perEnv.add(n); }
    }
    master = { file, found: !!value, names };
  } else if (!ambientWins && ambient[MASTER_NAME]) {
    // A process that inherited a master stand's values (a script loaded one, then started this one on another env)
    // keeps them wherever this env sets nothing. Off a master stand those copies of the master password are dropped —
    // MASTER_PASSWORD and every test-account password equal to it — so this env never signs in or seeds with them.
    const inherited = ambient[MASTER_NAME];
    for (const k of Object.keys(env)) {
      if (!from.has(k) && env[k] === inherited && (k === MASTER_NAME || isLoginSecretName(k))) delete env[k];
    }
  }

  const sourceOf = (key) => {
    if (env[key] === undefined) return `${key} is unset`;
    const f = from.get(key);
    const where = (file) => (file === MASTER_FILE ? `the master password (${MASTER_FILE})` : file ?? 'the process environment');
    if (!f) return `${key} from the process environment`;
    return f.pin ? `${f.pin} from ${where(f.file)}` : `${key} from ${where(f.file)}`;
  };
  return { env, ticket: resolvedTicket, rootFile: own !== null, dedicated, dedicatedKeys, perEnv, master, ignoredPasswords, sourceOf };
}

/** Keys whose `.env.local` override of the env's own value is almost always a mistake. */
const ENV_OWNED = ['BACK_URL', 'FRONT_URL', 'ENV_RISK'];

/**
 * `layered` for this process: every changed value written into process.env. Warns once per run (child processes
 * inherit the mark) about the silent ways an env goes wrong — no file defines it (a typo, or a ticket's stand with
 * no run ticket), `.env.local` overriding a root env's own URL or risk class, PASSWORDS=master with no master
 * password. Returns what `layered` returns.
 */
export function applyLayered(testEnv, { root = process.cwd(), ticket, ambientWins = false, passwordNames = [] } = {}) {
  const ambient = { ...process.env };
  const r = layered(testEnv, { root, ambient, ticket, ambientWins, passwordNames });
  for (const [k, v] of Object.entries(r.env)) if (v !== undefined && process.env[k] !== v) process.env[k] = v;
  for (const k of Object.keys(ambient)) if (!(k in r.env)) delete process.env[k]; // inherited values `layered` dropped
  warnOnce(testEnv, r, root, ambient);
  return r;
}

function warnOnce(testEnv, r, root, ambient) {
  const mark = `${testEnv}|${r.ticket ?? ''}`;
  if (process.env.TEST_ENV_CHECKED === mark) return;
  process.env.TEST_ENV_CHECKED = mark;
  const envFile = `.env.${testEnv}`;
  if (!r.rootFile && !r.dedicated.some((f) => basename(f) === envFile)) {
    console.warn(`[env] TEST_ENV=${testEnv} but there is no ${envFile} in ${lookedIn(testEnv, { ticket: r.ticket, root, ambient })} — only .env.defaults and .env.local apply. Typo?`);
    return;
  }
  if (r.ignoredPasswords?.value?.trim().toLowerCase() === 'master' && r.ignoredPasswords.file) {
    const own = r.rootFile ? `the project root's ${envFile}` : `${testEnv}'s own ${envFile} in its QA_ENV_PATH folder`;
    console.warn(`[env] PASSWORDS=master from ${r.ignoredPasswords.file} is ignored: only ${own} can make ${testEnv} a master stand. Anything else would switch a stand others use, and seeding would reset its accounts to the master password.`);
  }
  if (r.master && !r.master.found) {
    console.warn(`[env] ${testEnv} says PASSWORDS=master, but there is no ${MASTER_NAME} in ${MASTER_FILE} — its passwords stay unset. Create the file (one password every test account on master stands uses), then npm run secrets:sync:all.`);
  }
  if (!r.rootFile) return;
  const own = readEnvFile(join(root, envFile)) ?? {};
  const local = readEnvFile(join(root, '.env.local')) ?? {};
  const suffix = envSuffix(testEnv);
  for (const key of ENV_OWNED) {
    // A `KEY_<ENV>` anywhere is promoted over .env.local, and a dedicated file beats both, so then the override never takes effect.
    const pinned = own[key + suffix] || local[key + suffix] || ambient[key + suffix] || r.dedicatedKeys.has(key);
    if (!pinned && own[key] && local[key] && own[key] !== local[key]) {
      console.warn(`[env] .env.local sets ${key}=${local[key]}, overriding ${envFile} (${own[key]}) — .env.local loads last for every TEST_ENV. Move it out, or pin ${key}${suffix}= in ${envFile}.`);
    }
  }
}
