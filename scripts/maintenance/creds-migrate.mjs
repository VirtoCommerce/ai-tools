#!/usr/bin/env node
/**
 * scripts/maintenance/creds-migrate.mjs — `npm run creds:migrate [-- --apply]`
 *
 * Moves every test-account login and password out of the .env files into the ONE store, test-accounts.local.json
 * (scripts/lib/test-accounts.mjs; design: docs/superpowers/specs/2026-11-17-test-accounts-store-design.md), and
 * PROVES nothing changed: for every env (and every run ticket's override of one), every credential variable resolves
 * to the same value through the new loader as it did through the old one. Only a proven plan is applied.
 *
 *   1. The OLD answer: the loader as it was before the store (`git show <base>:scripts/lib/env-layers.mjs`), over the
 *      files as they were — the tracked .env files from <base> (they held the logins), everything local from disk.
 *   2. The store: each env's credentials become ACCOUNTS — a login and its password side by side (a role of
 *      scripts/lib/user-roles.mjs, or X_EMAIL + X_PASSWORD) — and SHARED passwords (one many accounts use, or none logs
 *      in with); what every env has the same goes to the top level, the rest to `envs.<env>`; `master` =
 *      .env.playwright.master. An existing store (either format) keeps its values and its fixture accounts.
 *      A value only a lanes file held (.env.playwright.all / .local) is taken too; one that disagrees is named.
 *   3. The NEW answer: the current loader over a copy of the files as they will be (credential lines gone, the
 *      .env.playwright.* files gone) plus the store. Any difference → exit 1, nothing written.
 *   4. `--apply`: back up every file it touches to .vc-fix/creds-backup/<time>/, write the store (an existing one
 *      keeps its values), remove the credential lines (and comment lines that hold a credential value) from .env.local,
 *      the tracked .env files and the QA_ENV_PATH folders' env files, delete .env.playwright.*, point the .mcp.json
 *      playwright-* lanes at scripts/lanes/playwright-lane.mjs, and re-check the real tree against the old answer.
 *
 * A credential is any `X_PASSWORD` (not token/key-shaped), and the logins paired with one: `X`, `X_EMAIL`,
 * `X_EMAILS`, `X_LOGIN`, and the role registry's emailVars (scripts/lib/user-roles.mjs). Tokens and API keys stay
 * where they are and are listed: they belong in vc-secrets.
 *
 * Prints names and counts only, never a value. `--root <dir>` runs on another checkout; `--base <rev>` names the
 * commit before the store (default: the parent of the commit that added scripts/lib/test-accounts.mjs, else HEAD).
 */
import '../lib/sync-stdio.mjs';
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse } from 'dotenv';
import { STORE_FILE, accountVars, isStoreName, isTokenShaped, readRawStore, readStore, serialiseStore, storeAccounts, storeValues, writeStore } from '../lib/test-accounts.mjs';
import { USER_ROLES } from '../lib/user-roles.mjs';
import { envSuffix } from '../lib/resolve-test-env.js';
import * as NEW from '../lib/env-layers.mjs';

const argv = process.argv.slice(2);
const opt = (name) => { const i = argv.indexOf(name); return i === -1 ? null : argv[i + 1]; };
const APPLY = argv.includes('--apply');
const root = resolve(opt('--root') ?? process.cwd());
const work = join(root, '.vc-fix', 'creds-migrate');
const fail = (m) => { console.error(`✗ ${m}`); process.exit(2); };

const git = (...a) => {
  const r = spawnSync('git', a, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
};
const ENV_FILE = /^\.env\.([a-z0-9_]+)$/;
const isEnvFileName = (n) => n === '.env.defaults' || n === '.env.local' || ENV_FILE.test(n) || /^\.env\.playwright\./.test(n);

// ---- 1. the old loader and the old tree --------------------------------------------------------------------------
const added = (git('log', '--diff-filter=A', '--format=%H', '--', 'scripts/lib/test-accounts.mjs') ?? '').trim().split('\n').filter(Boolean).pop();
const base = opt('--base') ?? (added ? `${added}^` : 'HEAD');
if (!git('rev-parse', '--verify', `${base}^{commit}`)) fail(`no commit ${base} — pass --base <the commit before the test-account store>`);
console.log(`old loader and tracked env files: ${base}${added ? '' : ' (the store is not committed yet)'}`);

rmSync(work, { recursive: true, force: true });
const oldLib = join(work, 'old', 'scripts', 'lib');
mkdirSync(oldLib, { recursive: true });
for (const f of ['env-layers.mjs', 'resolve-test-env.js', 'run-dir.mjs']) {
  const text = git('show', `${base}:scripts/lib/${f}`);
  if (text === null) fail(`cannot read scripts/lib/${f} at ${base}`);
  if (f === 'env-layers.mjs' && text.includes('test-accounts.mjs')) fail(`${base} already has the store — pass --base <the commit before it>`);
  writeFileSync(join(oldLib, f), text);
}
const OLD = await import(pathToFileURL(join(oldLib, 'env-layers.mjs')).href);

const oldRoot = join(work, 'old-root');
mkdirSync(oldRoot, { recursive: true });
const trackedAtBase = new Set((git('ls-tree', '--name-only', base) ?? '').split('\n').filter(isEnvFileName));
for (const n of trackedAtBase) writeFileSync(join(oldRoot, n), git('show', `${base}:${n}`) ?? '');
const localFiles = readdirSync(root).filter((n) => isEnvFileName(n) && !trackedAtBase.has(n));
for (const n of localFiles) copyFileSync(join(root, n), join(oldRoot, n));

// QA_ENV_PATH as the old tree has it, made absolute against the real root (the copies live elsewhere).
const rawTemplates = OLD.envPathTemplates({ root: oldRoot, ambient: {} });
const templates = rawTemplates.map((t) => (isAbsolute(t) ? resolve(t) : resolve(root, t)));
const ambient = templates.length ? { QA_ENV_PATH: templates.join(';') } : {};
const stripRoot = (p) => resolve(p).replace(/^[A-Za-z]:[\\/]?/, '').replace(/^[\\/]+/, '');

// ---- 2. every env, every run ticket, the old answer ---------------------------------------------------------------
const roleNames = USER_ROLES.map((r) => r.passwordVar);
const roleLogins = new Set(USER_ROLES.flatMap((r) => r.emailVars ?? []));
const dedicated = OLD.dedicatedEnvs({ root: oldRoot, ambient });
const contexts = [];
const envNames = new Set(OLD.knownEnvs(oldRoot));
for (const d of dedicated) if (!d.secrets) envNames.add(d.env);
for (const env of [...envNames].sort()) {
  const tickets = [null, ...new Set(dedicated.filter((d) => d.env === env && d.ticket).map((d) => d.ticket))];
  for (const ticket of tickets) {
    const r = OLD.layered(env, { root: oldRoot, ambient, ticket, passwordNames: roleNames });
    contexts.push({ env, ticket, old: r.env, perEnv: r.perEnv, master: OLD.usesMaster(r.env) });
  }
}
const envList = [...envNames];

// An existing store (either format) is part of the answer: after a first --apply the .env files no longer carry its
// values, so the old loader cannot reproduce them. `existingFlat(env)`: the variables it gives that env.
const raw = readRawStore(root);
const existingV2 = raw && raw.version !== 1 ? readStore(root) : null;
const existingFlat = (env) => {
  if (!raw) return {};
  if (raw.version === 1) {
    const out = {};
    for (const [k, v] of Object.entries({ ...(raw.defaults ?? {}), ...(raw.envs?.[env] ?? {}) })) if (v) out[k] = v;
    return out;
  }
  return storeValues(existingV2, env).values;
};
/** login → the name of its password, for the accounts the existing store keys by login (seeded fixtures). */
const existingFixtures = (env) => {
  if (!raw) return {};
  if (raw.version === 1) return { ...(raw.accounts?.[env] ?? {}) };
  return Object.fromEntries(storeAccounts(existingV2, env).filter((a) => a.key === a.login && a.passwordName).map((a) => [a.login, a.passwordName]));
};

// Which variables are credentials: every login password, and the logins paired with one.
const passwordNames = new Set(roleNames.filter(NEW.isLoginSecretName));
for (const c of contexts) for (const k of Object.keys(c.old)) if (NEW.isLoginSecretName(k)) passwordNames.add(k);
for (const e of envNames) for (const k of Object.keys(existingFlat(e))) if (NEW.isLoginSecretName(k)) passwordNames.add(k);
const loginFor = (k) => [...passwordNames].some((p) => { const x = p.slice(0, -'_PASSWORD'.length); return [x, `${x}_EMAIL`, `${x}_EMAILS`, `${x}_LOGIN`].includes(k); });
const isCredential = (k) => isStoreName(k) && (passwordNames.has(k) || roleLogins.has(k) || loginFor(k));
/** `{ base, env }` when `k` is a credential pinned to a known env (`ADMIN_PASSWORD_VCST`), else null. */
const pinOf = (k) => {
  for (const env of [...envList].sort((a, b) => b.length - a.length)) {
    const s = envSuffix(env);
    if (k.length > s.length && k.endsWith(s) && isCredential(k.slice(0, -s.length))) return { base: k.slice(0, -s.length), env };
  }
  return null;
};
const isCredentialKey = (k) => isCredential(k) || !!pinOf(k);

// ---- 3. what each env must get, then the store that gives it --------------------------------------------------------
const master = OLD.readEnvFile(join(oldRoot, '.env.playwright.master'))?.MASTER_PASSWORD || raw?.master || null;
/** The values every env shared: the unsuffixed credentials of .env.defaults / .env.local (the old top level). */
const globals = {};
for (const f of ['.env.defaults', '.env.local']) {
  for (const [k, v] of Object.entries(OLD.readEnvFile(join(oldRoot, f)) ?? {})) if (v && isCredential(k)) globals[k] = v;
}
if (raw?.version === 1) for (const [k, v] of Object.entries(raw.defaults ?? {})) if (v) globals[k] = v;
if (existingV2) for (const [k, v] of Object.entries(existingV2.shared)) if (v) globals[k] = v;

const conflicts = [], pinDisagreed = [], laneOnly = [], laneDiffers = [], kept = [];
// `extra`: env → names the new answer may have that the old did not (a lanes file's, an existing store's).
const extra = new Map(envList.map((e) => [e, new Set()]));
/** env → the flat credentials it must get (base names). */
const target = new Map();
/** env → names that must be the env's own (a KEY_<ENV> pin, a QA_ENV_PATH folder): so NAME_<ENV> still exists. */
const forceOwn = new Map();
const lanesAll = OLD.readEnvFile(join(oldRoot, '.env.playwright.all')) ?? {};
const lanesLocalText = existsSync(join(oldRoot, '.env.playwright.local')) ? readFileSync(join(oldRoot, '.env.playwright.local'), 'utf8') : '';
const stamp = /^#\s*generated-for:\s*TEST_ENV=([a-z0-9_]+)\s*$/m.exec(lanesLocalText)?.[1];
for (const env of envList) {
  const own = contexts.find((c) => c.env === env && c.ticket === null);
  const T = {}, force = new Set();
  for (const [k, v] of Object.entries(own.old)) {
    if (!v || !isCredential(k)) continue;
    if (own.master && passwordNames.has(k)) continue; // a master stand's passwords are the master password
    T[k] = v;
    if (own.perEnv.has(k)) force.add(k);
  }
  // A pin of this env's own (`X_PASSWORD_VCPTCORE` on vcptcore) stays NAME_<ENV>: the name must be the env's own.
  // Where it disagreed with what the env actually used for the bare name (lanes, seeders), the bare value wins.
  for (const [k, v] of Object.entries(own.old)) {
    const p = pinOf(k);
    if (!v || !p || p.env !== env || (own.master && passwordNames.has(p.base))) continue;
    if (own.old[p.base] === v) force.add(p.base);
    else pinDisagreed.push(`${k} (${env} used ${p.base}'s value; the pin held another)`);
  }
  // What only a lanes file held.
  for (const [q, v] of Object.entries(lanesAll)) {
    const p = q === 'MASTER_PASSWORD' ? null : pinOf(q);
    if (!v || !p || p.env !== env) continue;
    if (!T[p.base]) { T[p.base] = v; force.add(p.base); laneOnly.push(q); extra.get(env).add(p.base); } else if (T[p.base] !== v) laneDiffers.push(q);
  }
  if (stamp === env) {
    for (const [k, v] of Object.entries(parse(lanesLocalText))) {
      if (!v || !isCredential(k)) continue;
      if (!T[k]) { T[k] = v; laneOnly.push(`${k} (${env})`); extra.get(env).add(k); } else if (T[k] !== v) laneDiffers.push(`${k} (${env})`);
    }
  }
  // An existing store keeps its values.
  for (const [k, v] of Object.entries(existingFlat(env))) {
    if (!isCredential(k)) continue;
    if (T[k] !== undefined && T[k] !== v) kept.push(`${k} (${env})`);
    T[k] = v; extra.get(env).add(k);
  }
  for (const c of contexts.filter((x) => x.env === env && x.ticket !== null && !x.master)) {
    for (const [k, v] of Object.entries(c.old)) if (v && isCredential(k) && T[k] !== v) conflicts.push(`${k} on ${env}: run ticket ${c.ticket} overrides it`);
  }
  target.set(env, T);
  forceOwn.set(env, force);
}

/**
 * Which account owns each password: the one role of the registry whose password it is, else the stem account X of
 * X_PASSWORD when some env has a login for it (X_EMAIL, X_LOGIN, X, X_EMAILS). A password two roles share, or one no
 * account logs in with (DEFAULT_TEST_PASSWORD, B2B_USER_PASSWORD — the seeded fixtures'), is SHARED.
 */
const stemLogins = (x) => [`${x}_EMAIL`, `${x}_LOGIN`, x, `${x}_EMAILS`];
const ownerOf = new Map();
for (const P of passwordNames) {
  const roles = USER_ROLES.filter((r) => r.passwordVar === P);
  const x = P.slice(0, -'_PASSWORD'.length);
  if (roles.length === 1) ownerOf.set(P, roles[0].key);
  else if (!roles.length && envList.some((e) => stemLogins(x).some((v) => target.get(e)[v]))) ownerOf.set(P, x);
}
/** The login variables an account has: a role's emailVars, else its stem's. */
const loginVarsOf = (key) => USER_ROLES.find((r) => r.key === key)?.emailVars ?? stemLogins(key);

/**
 * One env's accounts and shared passwords from its flat credentials: every owned password goes into its account,
 * beside the account's login when this env has one; a shared password stays shared, and the accounts that sign in
 * with it `use` it. The variables an account exposes are its defaults (`<KEY>_EMAIL`, `<KEY>_PASSWORD`) unless `vars`
 * says otherwise.
 */
function accountsOf(env, T) {
  const accounts = {}, shared = {}, used = new Set();
  const account = (key) => (accounts[key] ??= {});
  const setLogin = (key, loginVars) => {
    const entry = account(key);
    entry.login = T[loginVars[0]];
    if (!(loginVars.length === 1 && loginVars[0] === `${key}_EMAIL`)) entry.vars = { ...(entry.vars ?? {}), login: loginVars };
    loginVars.forEach((v) => used.add(v));
  };
  for (const P of Object.keys(T).filter((k) => passwordNames.has(k)).sort()) {
    const key = ownerOf.get(P);
    if (!key) { shared[P] = T[P]; continue; }
    const entry = account(key);
    entry.password = T[P];
    if (P !== `${key}_PASSWORD`) entry.vars = { ...(entry.vars ?? {}), password: P };
  }
  // Logins: every role and stem account this env has a login for — its password beside it, or the shared one it uses.
  const keys = new Set([...USER_ROLES.map((r) => r.key), ...ownerOf.values()]);
  for (const key of [...keys].sort()) {
    const loginVars = loginVarsOf(key).filter((v) => T[v] && !used.has(v) && !passwordNames.has(v));
    if (!loginVars.length) continue;
    setLogin(key, loginVars);
    const role = USER_ROLES.find((r) => r.key === key);
    if (accounts[key].password === undefined && role) {
      if (!ownerOf.has(role.passwordVar)) accounts[key].password = { use: role.passwordVar };
      else if (role.passwordVar !== `${key}_PASSWORD`) accounts[key].vars = { ...(accounts[key].vars ?? {}), password: role.passwordVar };
    }
  }
  // Any other login left: its own account, login only.
  for (const k of Object.keys(T).filter((k) => !passwordNames.has(k) && !used.has(k)).sort()) {
    const key = k.replace(/_(EMAILS?|LOGIN)$/, '');
    const at = accounts[key] && accounts[key].login !== T[k] ? k : key;
    if (accounts[at]?.login === T[k]) {
      accounts[at].vars = { ...(accounts[at].vars ?? {}), login: [...(accounts[at].vars?.login ?? [`${at}_EMAIL`]), k] };
      used.add(k);
    } else setLogin(at, [k]);
  }
  // The seeded fixtures the existing store lists by login.
  const logins = new Set(Object.values(accounts).map((a) => a.login));
  for (const [login, name] of Object.entries(existingFixtures(env))) if (!logins.has(login)) accounts[login] = { password: { use: name } };
  return { accounts, shared };
}

// Every env's own, then what every env has the same goes to the top level (an env keeps what is its own).
const perEnv = new Map(envList.map((e) => [e, accountsOf(e, target.get(e))]));
const store = { master, shared: {}, accounts: {}, envs: {} };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const exposedBy = (key, entry) => { const v = accountVars(key, entry); return [...v.loginVars, v.passwordVar].filter(Boolean); };
for (const key of new Set([...perEnv.values()].flatMap((p) => Object.keys(p.accounts)))) {
  const entries = envList.map((e) => perEnv.get(e).accounts[key]);
  if (entries.every((a) => a && same(a, entries[0])) && envList.every((e) => !exposedBy(key, entries[0]).some((n) => forceOwn.get(e).has(n)))) {
    store.accounts[key] = entries[0];
    for (const e of envList) delete perEnv.get(e).accounts[key];
  }
}
for (const name of new Set([...perEnv.values()].flatMap((p) => Object.keys(p.shared)))) {
  const top = globals[name] ?? (envList.every((e) => perEnv.get(e).shared[name] === perEnv.get(envList[0]).shared[name]) ? perEnv.get(envList[0]).shared[name] : undefined);
  if (top === undefined) continue;
  store.shared[name] = top;
  for (const e of envList) {
    const s = perEnv.get(e).shared;
    if (s[name] === undefined) s[name] = ''; // the shared value never reached this env: keep it so
    else if (s[name] === top && !forceOwn.get(e).has(name)) delete s[name];
  }
}
for (const e of envList) {
  const { accounts, shared } = perEnv.get(e);
  if (Object.keys(accounts).length || Object.keys(shared).length) store.envs[e] = { shared, accounts };
}

// ---- 4. the files as they will be ---------------------------------------------------------------------------------
// Password values (never logins: an email in an explanatory comment is no secret), to find comment lines holding one.
const values = new Set();
const isPasswordKey = (k) => passwordNames.has(k) || passwordNames.has(pinOf(k)?.base);
for (const c of contexts) for (const [k, v] of Object.entries(c.old)) if (v && v.length >= 6 && isPasswordKey(k)) values.add(v);
if (master) values.add(master);
const tokenNames = new Set();
/** A .env text without its credential lines: assignments of a credential (commented out too), commented-out token
 *  assignments (a dead copy of a live secret), and comment lines that hold a password value. Returns the text and what
 *  it took (names; `#NAME` for a commented-out line). */
function cleanText(text) {
  const removed = [];
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(#\s*)?(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line);
    // A commented-out token counts only with a real-looking value (16+ characters, not `...` or `<placeholder>`):
    // a documentation line such as `#   JIRA_API_TOKEN=...` stays.
    const deadToken = m && m[1] && isTokenShaped(m[2]) && /=\s*["']?(?![.<])[^\s#"'.]{16,}/.test(line);
    if (m && ((isCredentialKey(m[2]) && (!m[1] || /=\s*\S/.test(line))) || deadToken)) { removed.push(m[1] ? `#${m[2]}` : m[2]); continue; }
    if (m && !m[1] && isTokenShaped(m[2])) tokenNames.add(m[2]);
    if (/^\s*#/.test(line) && [...values].some((v) => line.includes(v))) { removed.push(m ? `#${m[2]}` : '# (a comment holding a credential value)'); continue; }
    out.push(line);
  }
  return { text: out.join('\n'), removed };
}

const newRoot = join(work, 'new-root');
mkdirSync(newRoot, { recursive: true });
/** Every file the migration changes or deletes: { real, sim, action: 'clean' | 'delete', removed }. */
const plan = [];
for (const n of readdirSync(root).filter(isEnvFileName)) {
  const real = join(root, n);
  if (/^\.env\.playwright\./.test(n)) { plan.push({ real, action: 'delete', removed: [] }); continue; }
  const { text, removed } = cleanText(readFileSync(real, 'utf8'));
  writeFileSync(join(newRoot, n), text);
  if (removed.length) plan.push({ real, action: 'clean', removed });
}
for (const n of trackedAtBase) if (!existsSync(join(newRoot, n)) && !/^\.env\.playwright\./.test(n)) writeFileSync(join(newRoot, n), cleanText(git('show', `${base}:${n}`) ?? '').text);
const simTemplates = templates.map((t, i) => join(work, `qa${i}`, stripRoot(t)));
const newAmbient = templates.length ? { QA_ENV_PATH: simTemplates.join(';') } : {};
const seenFolderFiles = new Set();
templates.forEach((t, i) => {
  for (const d of OLD.dedicatedEnvs({ root: oldRoot, ambient: { QA_ENV_PATH: t } })) {
    if (seenFolderFiles.has(d.file)) continue;
    seenFolderFiles.add(d.file);
    if (d.secrets) { plan.push({ real: d.file, action: 'delete', removed: [] }); continue; }
    // The copy sits where the template, rooted at work/qa<i>, puts this folder.
    const sim = join(work, `qa${i}`, stripRoot(d.dir), basename(d.file));
    mkdirSync(dirname(sim), { recursive: true });
    const { text, removed } = cleanText(readFileSync(d.file, 'utf8'));
    writeFileSync(sim, text);
    if (removed.length) plan.push({ real: d.file, action: 'clean', removed });
  }
});
// The new tree's .env.local must point QA_ENV_PATH at the copies: the ambient value wins, so pass it in.
writeFileSync(join(newRoot, STORE_FILE), serialiseStore(store));

// ---- 5. the proof -------------------------------------------------------------------------------------------------
function compare(rootDir, amb, label) {
  const diffs = [];
  for (const c of contexts) {
    const now = NEW.layered(c.env, { root: rootDir, ambient: amb, ticket: c.ticket, passwordNames: roleNames }).env;
    // A store that already exists is the answer for what it holds: after a first --apply the .env files no longer
    // carry those values, so the old loader cannot reproduce them.
    const kept = c.master ? {} : existingFlat(c.env);
    for (const [k, v0] of Object.entries(c.old)) {
      if (!isCredentialKey(k)) continue;
      const v = kept[k] ?? v0;
      const p = pinOf(k);
      if (p && p.env === c.env && v && c.old[p.base] !== v) continue; // a self-pin that disagreed: reported, the bare value wins
      if ((now[k] || undefined) !== (v || undefined)) diffs.push(`${c.env}${c.ticket ? `/${c.ticket}` : ''}: ${k} ${now[k] ? 'differs' : 'is lost'}`);
    }
    for (const k of Object.keys(now)) {
      if (isCredential(k) && now[k] && !c.old[k] && !extra.get(c.env)?.has(k)) diffs.push(`${c.env}${c.ticket ? `/${c.ticket}` : ''}: ${k} appears`);
    }
  }
  console.log(`proof (${label}): ${contexts.length} env context(s) — ${diffs.length ? `${diffs.length} difference(s)` : 'every credential resolves as before'}`);
  for (const d of diffs.slice(0, 40)) console.log(`  ✗ ${d}`);
  return diffs;
}

const count = (o) => Object.values(o).filter(Boolean).length;
console.log(`\nstore: ${Object.keys(store.accounts).length} account(s) and ${count(store.shared)} shared password(s) on every env${store.master ? ', master password' : ''}`);
console.log(`  per env (own accounts / own shared): ${Object.entries(store.envs).map(([e, s]) => `${e} ${Object.keys(s.accounts).length}/${count(s.shared)}`).join(', ') || 'none'}`);
if (laneOnly.length) console.log(`  taken from a lanes file (no .env file had them): ${laneOnly.join(', ')}`);
if (laneDiffers.length) console.log(`  ⚠ a lanes file disagreed — the store keeps the env files' value: ${laneDiffers.join(', ')}`);
if (kept.length) console.log(`  the existing ${STORE_FILE} keeps: ${kept.join(', ')}`);
for (const c of conflicts) console.log(`  ⚠ ${c} — the store has one value per env; give that stand its own env name`);
for (const d of pinDisagreed) console.log(`  ⚠ ${d} — check it on the stand; the store keeps one value per name per env`);
console.log(`files: ${plan.filter((p) => p.action === 'clean').length} to clean, ${plan.filter((p) => p.action === 'delete').length} to delete`);
for (const p of plan) {
  const where = relative(root, p.real).startsWith('..') ? p.real : relative(root, p.real);
  console.log(`  ${p.action === 'delete' ? 'delete' : 'clean '} ${where}${p.removed.length ? ` — ${p.removed.length} line(s): ${[...new Set(p.removed)].slice(0, 12).join(', ')}${p.removed.length > 12 ? ', …' : ''}` : ''}`);
}
if (tokenNames.size) console.log(`  tokens / API keys left in place (move them to vc-secrets): ${[...tokenNames].sort().join(', ')}`);

const diffs = compare(newRoot, newAmbient, 'simulated');
if (diffs.length) { console.error('✗ the migration would change what a credential resolves to — nothing written'); process.exit(1); }
if (!APPLY) {
  console.log('\ndry run — nothing written. Re-run with --apply to write the store and clean the files.');
  rmSync(work, { recursive: true, force: true });
  process.exit(0);
}

// ---- 6. apply -----------------------------------------------------------------------------------------------------
const stampDir = new Date().toISOString().replace(/[:.]/g, '-');
const backup = join(root, '.vc-fix', 'creds-backup', stampDir);
const backupOf = (file) => join(backup, relative(root, file).startsWith('..') ? join('external', stripRoot(file)) : relative(root, file));
for (const p of plan) { mkdirSync(dirname(backupOf(p.real)), { recursive: true }); copyFileSync(p.real, backupOf(p.real)); }
if (raw) { mkdirSync(backup, { recursive: true }); copyFileSync(join(root, STORE_FILE), join(backup, STORE_FILE)); }
writeStore(root, store);
for (const p of plan) {
  if (p.action === 'delete') { rmSync(p.real, { force: true }); continue; }
  const original = readFileSync(p.real, 'utf8');
  const eol = original.includes('\r\n') ? '\r\n' : '\n';
  writeFileSync(p.real, cleanText(original).text.split('\n').join(eol));
}
const mcp = rewriteMcp(join(root, '.mcp.json'));
console.log(`\n✓ wrote ${STORE_FILE}; backup of every changed file: ${relative(root, backup)} (holds the old values — delete it once you have checked)`);
if (mcp) console.log(`✓ .mcp.json: ${mcp.join(', ')} now start through scripts/lanes/playwright-lane.mjs — restart Claude Code (or reconnect them in /mcp)`);
const after = compare(root, ambient, 'the real tree');
rmSync(work, { recursive: true, force: true });
process.exit(after.length ? 1 : 0);

/** Point every playwright-* lane that runs `@playwright/mcp@<pin>` with `--secrets` at the launcher. Returns the lanes changed. */
function rewriteMcp(file) {
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const data = JSON.parse(text);
  const changed = [];
  for (const [name, s] of Object.entries(data.mcpServers ?? {})) {
    if (!/^playwright-/.test(name) || !Array.isArray(s.args)) continue;
    const i = s.args.findIndex((a) => /^@playwright\/mcp@\d/.test(a));
    if (i === -1 || s.args.includes('scripts/lanes/playwright-lane.mjs')) continue;
    const spec = s.args[i];
    const rest = [];
    for (let j = i + 1; j < s.args.length; j++) {
      if (s.args[j] === '--secrets') { j++; continue; }
      if (String(s.args[j]).startsWith('--secrets=')) continue;
      rest.push(s.args[j]);
    }
    const pre = s.args.slice(0, i).filter((a) => a !== '-y');
    s.args = [...pre, '-y', '-p', spec, 'node', 'scripts/lanes/playwright-lane.mjs', name, spec, ...rest];
    changed.push(name);
  }
  if (changed.length) {
    mkdirSync(backup, { recursive: true });
    writeFileSync(join(backup, '.mcp.json'), text);
    writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
  }
  return changed;
}
