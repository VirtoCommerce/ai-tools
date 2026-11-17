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
 *   2. The store: `defaults` = the values every env shared (.env.local / .env.defaults without a suffix), `envs.<env>`
 *      = what differs per env, a `KEY_<ENV>` pin, or a QA_ENV_PATH folder's value; `master` = .env.playwright.master.
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
import { STORE_FILE, isStoreName, isTokenShaped, readStore, serialiseStore, storeValues, writeStore } from '../lib/test-accounts.mjs';
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

// Which variables are credentials: every login password, and the logins paired with one.
const passwordNames = new Set(roleNames.filter(NEW.isLoginSecretName));
for (const c of contexts) for (const k of Object.keys(c.old)) if (NEW.isLoginSecretName(k)) passwordNames.add(k);
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

// ---- 3. the store -------------------------------------------------------------------------------------------------
const existing = readStore(root);
const master = OLD.readEnvFile(join(oldRoot, '.env.playwright.master'))?.MASTER_PASSWORD || null;
const shared = {};
for (const f of ['.env.defaults', '.env.local']) {
  for (const [k, v] of Object.entries(OLD.readEnvFile(join(oldRoot, f)) ?? {})) if (v && isCredential(k)) shared[k] = v;
}
const store = { master, defaults: { ...shared }, envs: {}, accounts: {} };
const conflicts = [], pinDisagreed = [];
const nonMaster = (c) => !c.master;
for (const env of envList) {
  const own = contexts.filter((c) => c.env === env && c.ticket === null)[0];
  const section = {};
  for (const [k, v] of Object.entries(own.old)) {
    if (!v || !isCredential(k)) continue;
    if (own.master && passwordNames.has(k)) continue; // a master stand's passwords are the master password
    if (own.perEnv.has(k) || shared[k] !== v) section[k] = v;
  }
  // A pin of this env's own (`X_PASSWORD_VCPTCORE` on vcptcore) is NAME_<ENV> in the new loader, which is the env's
  // own name: keep the name in the section so the pin still exists. Where the old pin disagreed with what the env
  // actually used for the bare name (lanes, seeders), the bare name's value wins and the pin is named.
  for (const [k, v] of Object.entries(own.old)) {
    const p = pinOf(k);
    if (!v || !p || p.env !== env || (own.master && passwordNames.has(p.base))) continue;
    if (own.old[p.base] === v) section[p.base] = v;
    else pinDisagreed.push(`${k} (${env} used ${p.base}'s value; the pin held another)`);
  }
  for (const k of Object.keys(shared)) {
    if (own.old[k]) continue;
    if (own.master && passwordNames.has(k)) continue;
    section[k] = ''; // the shared value never reached this env: keep it so
  }
  for (const c of contexts.filter((x) => x.env === env && x.ticket !== null && nonMaster(x))) {
    for (const [k, v] of Object.entries(c.old)) {
      if (v && isCredential(k) && (section[k] || shared[k]) !== v) conflicts.push(`${k} on ${env}: run ticket ${c.ticket} overrides it`);
    }
  }
  if (Object.keys(section).length) store.envs[env] = section;
  // Every account the env's variables pair a login with a password for (a role, X_EMAIL + X_PASSWORD, X + X_PASSWORD):
  // listed under accounts.<env> with the NAME its password is under, so the file shows both for each account.
  const accounts = {};
  for (const p of passwordNames) {
    if (!own.old[p] && !(own.master && own.old.MASTER_PASSWORD)) continue;
    const x = p.slice(0, -'_PASSWORD'.length);
    const loginVars = [...new Set([...USER_ROLES.filter((r) => r.passwordVar === p).flatMap((r) => r.emailVars ?? []), `${x}_EMAIL`, `${x}_LOGIN`, x])];
    const login = loginVars.map((v) => own.old[v]).find((v) => v && !/[;,\s]/.test(v));
    if (login) accounts[login] = p;
  }
  if (Object.keys(accounts).length) store.accounts[env] = accounts;
}

// What only a lanes file held, and what it disagrees on. `extra`: env → names the new answer may have that the old
// did not (taken from a lanes file, or kept from an existing store).
const laneOnly = [], laneDiffers = [];
const extra = new Map(envList.map((e) => [e, new Set()]));
const resolvedOld = (env, k) => contexts.find((c) => c.env === env && c.ticket === null)?.old[k];
const lanesAll = OLD.readEnvFile(join(oldRoot, '.env.playwright.all')) ?? {};
for (const [q, v] of Object.entries(lanesAll)) {
  if (!v || q === 'MASTER_PASSWORD') continue;
  const p = pinOf(q);
  if (!p || !envList.includes(p.env)) continue;
  const now = resolvedOld(p.env, p.base);
  if (!now) { (store.envs[p.env] ??= {})[p.base] = v; laneOnly.push(q); extra.get(p.env).add(p.base); } else if (now !== v) laneDiffers.push(q);
}
const lanesLocalText = existsSync(join(oldRoot, '.env.playwright.local')) ? readFileSync(join(oldRoot, '.env.playwright.local'), 'utf8') : '';
const stamp = /^#\s*generated-for:\s*TEST_ENV=([a-z0-9_]+)\s*$/m.exec(lanesLocalText)?.[1];
if (stamp && envList.includes(stamp)) {
  for (const [k, v] of Object.entries(parse(lanesLocalText))) {
    if (!v || !isCredential(k)) continue;
    const now = resolvedOld(stamp, k);
    if (!now) { (store.envs[stamp] ??= {})[k] = v; laneOnly.push(`${k} (${stamp})`); extra.get(stamp).add(k); } else if (now !== v) laneDiffers.push(`${k} (${stamp})`);
  }
}
// An existing store keeps its values.
const kept = [];
if (existing.exists) {
  if (!store.master && existing.master) store.master = existing.master; else if (existing.master && existing.master !== store.master) { store.master = existing.master; kept.push('master'); }
  for (const [k, v] of Object.entries(existing.defaults)) { if (store.defaults[k] !== undefined && store.defaults[k] !== v) kept.push(`defaults.${k}`); store.defaults[k] = v; }
  for (const [e, s] of Object.entries(existing.envs)) for (const [k, v] of Object.entries(s)) {
    if (store.envs[e]?.[k] !== undefined && store.envs[e][k] !== v) kept.push(`envs.${e}.${k}`);
    (store.envs[e] ??= {})[k] = v;
  }
  for (const e of envList) for (const k of Object.keys({ ...existing.defaults, ...(existing.envs[e] ?? {}) })) extra.get(e).add(k);
  for (const [e, a] of Object.entries(existing.accounts ?? {})) Object.assign((store.accounts[e] ??= {}), a);
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
    const kept = existing.exists && !c.master ? storeValues(existing, c.env).values : {};
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
console.log(`\nstore: ${count(store.defaults)} shared name(s), ${Object.keys(store.envs).length} env section(s) (${Object.entries(store.envs).map(([e, s]) => `${e} ${count(s)}`).join(', ')})${store.master ? ', master password' : ''}`);
console.log(`  accounts (login + the name of its password): ${Object.entries(store.accounts).map(([e, a]) => `${e} ${Object.keys(a).length}`).join(', ') || 'none'}`);
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
if (existing.exists) { mkdirSync(backup, { recursive: true }); copyFileSync(join(root, STORE_FILE), join(backup, STORE_FILE)); }
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
