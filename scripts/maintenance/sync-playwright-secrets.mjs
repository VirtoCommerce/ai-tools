#!/usr/bin/env node
/**
 * scripts/maintenance/sync-playwright-secrets.mjs — `npm run secrets:sync [-- --check]`
 *
 * GENERATES `.env.playwright.local` (the `--secrets` file of every playwright-* MCP server) instead of
 * it being kept by hand. Names: every login password the suites, test-data and the role registry
 * declare (scripts/lib/browser-secrets.mjs). Values: the layered env for the current TEST_ENV
 * (`.env.local` — the source the seeders set the passwords from), suffix-promoted by config.js.
 *
 * - Never writes a token/key-shaped name — least privilege is why this file is separate from
 *   .env.local. An existing line shaped like one is DROPPED and named.
 * - A derived name the env has no value for keeps the file's earlier value only when the file was generated for this
 *   env (or carries no stamp: a file kept by hand). Off a master stand, no earlier value that IS the master password
 *   is kept: a sync on a master stand writes it under every name, and an env switch would carry it to another stand.
 * - Any other line already in the file that nothing derives is KEPT verbatim (it may be file-only) — except a copy of
 *   the master password, as above.
 * - A derived name nobody has a value for is NOT written (an empty value would type ''): it is listed
 *   in the header and printed, with the suites that need it — a human adds it to .env.local.
 * - Prints names and counts only, never a value. Re-parses what it would write and refuses on mismatch.
 * - `--check`: write nothing; exit 1 if the file would change.
 * - `--all` (`npm run secrets:sync:all`): GENERATES `.env.playwright.all` instead — every env's values,
 *   each name ending in its env (`ORG_USER_PASSWORD_VCST_QA`), so one set of lanes serves sessions on
 *   several envs with no restart. Each env is layered on its own (scripts/lib/env-core.js `layeredEnv`),
 *   the project root's envs and the QA_ENV_PATH folders' (every ticket's); production envs are left out,
 *   and a name whose value differs between a shared env and a ticket's override of it is refused — one
 *   key holds one value. Fully generated: no earlier line is kept.
 * - The master password (`.env.playwright.master`, MASTER_PASSWORD) goes into either file as one stable
 *   line: every PASSWORDS=master stand's lanes type MASTER_PASSWORD, so a new master stand needs no re-sync
 *   and no reconnect. A master stand gets no per-name entries in the combined file.
 * - Writes atomically (a temp file, then a rename): two syncs at once never leave a torn file.
 *
 * The MCP servers read the file at START: after a change, reconnect playwright-* in /mcp — never while
 * a regression run has browser suites in flight (a reconnect kills their sessions).
 */
import '../lib/sync-stdio.mjs'; // before any output: a piped stdout must not lose its tail to process.exit()
import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import { COMBINED_SECRETS_FILE, SECRETS_FILE, combinedSecretValues, deriveSecretNames, readSecretsFile } from '../lib/browser-secrets.mjs';
import { MASTER_FILE, MASTER_NAME, readMaster, usesMaster } from '../lib/env-layers.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const check = process.argv.includes('--check');
const all = process.argv.includes('--all');
// --all layers every env itself, from the environment as it was before any file was loaded; one env is
// config.js's job, which also applies the session's env.
const ambient = { ...process.env };
if (!all) await import('../../config.js');
const testEnv = (process.env.TEST_ENV || 'vcst').toLowerCase();

/** dotenv-safe serialisation of one value; null when no quoting style can carry it unchanged. */
function serialise(v) {
  if (/^[^\s#'"`\\]*$/.test(v)) return v;
  for (const q of ["'", '`', '"']) if (!v.includes(q) && !v.includes('\n') && !(q === '"' && v.includes('\\'))) return `${q}${v}${q}`;
  return null;
}

/** Write `content` to `file` through a temp file and a rename, so a reader (or a second sync) never sees half a file. */
function writeAtomic(file, content) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content, 'utf8');
  try { renameSync(tmp, file); } catch (e) { rmSync(tmp, { force: true }); throw e; }
}

/** The platform's default password policy (IdentityOptions:Password — 8+ characters; ASP.NET Identity also wants an
 *  upper- and a lowercase letter): a master password that fails it cannot be set on a test account. */
function masterPolicyWarning(value) {
  const misses = [value.length < 8 && '8+ characters', !/[A-Z]/.test(value) && 'an uppercase letter', !/[a-z]/.test(value) && 'a lowercase letter'].filter(Boolean);
  return misses.length ? `⚠ ${MASTER_NAME} lacks ${misses.join(', ')} — the platform's default password policy rejects it as an account password` : null;
}

const derived = deriveSecretNames(root);
if (all) syncAll();
const file = readSecretsFile(root);
/** @type {Map<string, string>} */
const next = new Map();
const missing = [], dropped = [], keptFileOnly = [], unserialisable = [], otherEnv = [], masterCopies = [];

// A master stand's lanes type MASTER_PASSWORD in every password field (the loader set it from .env.playwright.master).
const onMaster = usesMaster(process.env) && process.env[MASTER_NAME];
const masterValue = readMaster({ root, ambient }).value;
const isMasterCopy = (v) => !onMaster && !!masterValue && v === masterValue;
for (const n of [...derived.keys()].sort()) {
  const old = file.values.get(n);
  let v = process.env[n] || '';
  if (!v && old) {
    if (file.env && file.env !== testEnv) otherEnv.push(n);
    else if (isMasterCopy(old)) masterCopies.push(n);
    else v = old;
  }
  if (v) next.set(n, v); else missing.push(n);
}
if (onMaster) next.set(MASTER_NAME, process.env[MASTER_NAME]);
for (const [n, v] of file.values) {
  if (derived.has(n) || n === MASTER_NAME) continue; // MASTER_PASSWORD: set above on a master stand, never kept from an old file
  if (/TOKEN|API|KEY|SECRET/.test(n)) { dropped.push(n); continue; }
  if (isMasterCopy(v)) { masterCopies.push(n); continue; }
  if (v) { next.set(n, v); keptFileOnly.push(n); }
}

const lines = [];
for (const n of [...next.keys()].sort()) {
  const s = serialise(next.get(n));
  if (s === null) { unserialisable.push(n); continue; }
  lines.push(`${n}=${s}`);
}
const header = [
  `# ${SECRETS_FILE} — GENERATED by \`npm run secrets:sync\`. Do not edit by hand: change .env.local and re-run.`,
  `# generated-for: TEST_ENV=${testEnv}`,
  '# Names: suite CSVs + test-data {{X_PASSWORD}} + scripts/lib/user-roles.mjs; earlier lines kept. Never a token or key.',
  ...(onMaster ? [`# ${testEnv} is a master stand (PASSWORDS=master): type ${MASTER_NAME} in every password field.`] : []),
  '# The playwright-* MCP servers read this at START: after a change, reconnect them in /mcp (not mid-run).',
  ...(missing.length ? [`# missing — no value anywhere, add to .env.local: ${missing.join(', ')}`] : []),
];
const content = `${header.join('\n')}\n${lines.join('\n')}\n`;

const parsed = parse(content);
const roundTrip = lines.length === Object.keys(parsed).length && lines.every((l) => { const n = l.slice(0, l.indexOf('=')); return parsed[n] === next.get(n); });
if (!roundTrip || unserialisable.length) {
  console.error(`✗ refusing to write ${SECRETS_FILE}: ${unserialisable.length ? `no dotenv quoting carries the value of ${unserialisable.join(', ')}` : 'what would be written does not parse back to the same values'}`);
  process.exit(2);
}

const before = existsSync(join(root, SECRETS_FILE)) ? readFileSync(join(root, SECRETS_FILE), 'utf8') : null;
const changed = before !== content;
const added = [...next.keys()].filter((n) => !file.values.get(n));
const updated = [...next.keys()].filter((n) => file.values.get(n) && file.values.get(n) !== next.get(n));

console.log(`${SECRETS_FILE} for TEST_ENV=${testEnv}${file.env && file.env !== testEnv ? ` (was generated for ${file.env})` : ''}: ${next.size} name(s)`);
if (added.length) console.log(`  added:     ${added.join(', ')}`);
if (updated.length) console.log(`  updated:   ${updated.join(', ')}  (value differed from the layered env)`);
if (keptFileOnly.length) console.log(`  kept:      ${keptFileOnly.join(', ')}  (in the file only — not derived, nothing to compare)`);
if (dropped.length) console.log(`  dropped:   ${dropped.join(', ')}  (token/key-shaped — never in the browser secrets file)`);
if (otherEnv.length) console.log(`  not kept:  ${otherEnv.join(', ')}  (only the file had a value, and it was generated for ${file.env}: that env's password)`);
if (masterCopies.length) console.log(`  not kept:  ${masterCopies.join(', ')}  (the file's value is the master password, and ${testEnv} is not a master stand)`);
for (const n of missing) console.log(`  MISSING:   ${n} — needed by ${[...derived.get(n)].join(', ')}; add it to .env.local (team secret store), then re-run`);
if (onMaster) {
  console.log(`  master:    ${testEnv} uses the master password — the lanes type ${MASTER_NAME}`);
  const policy = masterPolicyWarning(process.env[MASTER_NAME]);
  if (policy) console.log(`  ${policy}`);
}

if (check) {
  console.log(changed ? '✗ out of date — run `npm run secrets:sync`' : '✓ up to date');
  process.exit(changed ? 1 : 0);
}
if (!changed) { console.log('✓ already up to date — nothing written'); process.exit(0); }
writeAtomic(join(root, SECRETS_FILE), content);
console.log(`✓ wrote ${SECRETS_FILE}. Reconnect playwright-chrome / -firefox / -edge (/mcp → Reconnect) for it to take effect — not while browser suites are running.`);

/** `--all`: write (or `--check`) `.env.playwright.all`, every env's values as `NAME_<ENV>`. Exits. */
function syncAll() {
  const out = join(root, COMBINED_SECRETS_FILE);
  const { entries, envs, excluded, master, conflicts } = combinedSecretValues(root, derived.keys(), { ambient });
  const { value: masterValue } = readMaster({ root, ambient });
  if (conflicts.length) {
    console.error(`✗ refusing to write ${COMBINED_SECRETS_FILE}: a NAME_<ENV> key holds one value, and these differ between the env's run tickets:`);
    for (const c of conflicts) console.error(`  ${c.name}_${c.env.toUpperCase()}: ${c.tickets.map((t) => t ?? 'the shared definition').join(' vs ')}`);
    console.error("  Give the ticket's stand its own env name (e.g. vcst_6314), or drop the override.");
    process.exit(2);
  }
  if (!envs.length && !masterValue) {
    console.error(`✗ no env has a value for any password name, and there is no ${MASTER_FILE}: nothing to write to ${COMBINED_SECRETS_FILE}`);
    process.exit(2);
  }
  const blocks = [], unserialisable = [];
  if (masterValue) {
    const s = serialise(masterValue);
    if (s === null) unserialisable.push(MASTER_NAME);
    else blocks.push(`# --- master: every PASSWORDS=master stand (${MASTER_FILE}) ---\n${MASTER_NAME}=${s}`);
  }
  for (const { env } of envs) {
    const lines = [];
    for (const [qualified, e] of entries) {
      if (e.env !== env) continue;
      const s = serialise(e.value);
      if (s === null) unserialisable.push(qualified); else lines.push(`${qualified}=${s}`);
    }
    blocks.push(`# --- ${env} ---\n${lines.join('\n')}`);
  }
  const header = [
    `# ${COMBINED_SECRETS_FILE} — GENERATED by \`npm run secrets:sync:all\`. Do not edit by hand: change .env.local or .env.playwright.<env> and re-run.`,
    "# Every env's login passwords, each name ending in its env: type ORG_USER_PASSWORD_VCST_QA to sign in on vcst_qa.",
    `# A master stand (PASSWORDS=master in its env file) has no entries here: type ${MASTER_NAME} in every password field.`,
    '# Names: suite CSVs + test-data {{X_PASSWORD}} + scripts/lib/user-roles.mjs. Never a token or key; production envs are left out.',
    '# The playwright-* MCP servers read this at START: after a change, reconnect them in /mcp (not mid-run).',
    `# envs: ${envs.map((e) => e.env).join(' ')}`,
  ];
  const content = `${header.join('\n')}\n\n${blocks.join('\n\n')}\n`;

  const parsed = parse(content);
  const written = [...entries].filter(([q]) => !unserialisable.includes(q));
  if (masterValue && !unserialisable.includes(MASTER_NAME)) written.push([MASTER_NAME, { value: masterValue }]);
  const roundTrip = Object.keys(parsed).length === written.length && written.every(([q, e]) => parsed[q] === e.value);
  if (!roundTrip || unserialisable.length) {
    console.error(`✗ refusing to write ${COMBINED_SECRETS_FILE}: ${unserialisable.length ? `no dotenv quoting carries the value of ${unserialisable.join(', ')}` : 'what would be written does not parse back to the same values'}`);
    process.exit(2);
  }

  const before = existsSync(out) ? readFileSync(out, 'utf8') : null;
  const changed = before !== content;
  console.log(`${COMBINED_SECRETS_FILE}: ${written.length} name(s) for ${envs.length} env(s)${masterValue ? ', MASTER_PASSWORD included' : ''}`);
  for (const e of envs) console.log(`  ${e.env.padEnd(22)} ${e.written} name(s)${e.missing.length ? `; no value: ${e.missing.join(', ')}` : ''}`);
  for (const e of excluded) console.log(`  ${e.env.padEnd(22)} left out: ${e.reason}`);
  for (const m of master) {
    const where = m.tickets.some(Boolean) ? ` (${m.tickets.map((t) => t ?? 'shared').join(', ')})` : '';
    console.log(`  ${m.env.padEnd(22)} master stand${where}: the lanes type ${MASTER_NAME}${masterValue ? '' : ` — ⚠ there is no ${MASTER_FILE} yet`}`);
  }
  if (masterValue) {
    const policy = masterPolicyWarning(masterValue);
    if (policy) console.log(`  ${policy}`);
  }
  if (check) {
    console.log(changed ? '✗ out of date — run `npm run secrets:sync:all`' : '✓ up to date');
    process.exit(changed ? 1 : 0);
  }
  if (!changed) { console.log('✓ already up to date — nothing written'); process.exit(0); }
  writeAtomic(out, content);
  console.log(`✓ wrote ${COMBINED_SECRETS_FILE}. Point every playwright-* server's --secrets at it (templates/.mcp.json.example), then reconnect them in /mcp — not while browser suites are running.`);
  process.exit(0);
}
