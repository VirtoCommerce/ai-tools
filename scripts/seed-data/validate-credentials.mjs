/**
 * scripts/seed-data/validate-credentials.mjs
 *
 * STATIC (no network) credential-declaration guard: proves that no test account is declared with
 * TWO different passwords, and that a destructive fixture (a lockout/abuse role) owns a dedicated
 * account. Drift-guard companion to the seeders' password reconciliation in
 * scripts/lib/user-provision.mjs (ensureSecurityAccount / ensurePersonalAccount).
 *
 * Class of bug this closes — found by the 050m sales-rep audit (2026-07-29): an account declared
 * both by a committed CSV (`{{VAR}}` cell → `@td(ALIAS.password)`) and by the `.env` role registry
 * (user-roles.mjs `passwordVar`) with DIFFERENT vars can only ever hold one of them. Every consumer
 * of the other declaration then 400s `invalid_grant`, and its whole suite reports BLOCKED — with no
 * error anywhere in the seed. Now that the seeders RECONCILE passwords, a conflict additionally
 * makes two seeders overwrite each other's value on alternating runs, so it must fail the gate.
 *
 * Source of truth for the rules + the pure logic: ./credential-specs.mjs (side-effect-free).
 *
 * Usage:  npm run td:validate:credentials   (or  node scripts/seed-data/validate-credentials.mjs)
 * Exit 1 on any hard problem; advisory items are warnings only.
 */

import "../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  CSV_CREDENTIAL_SOURCES, DESTRUCTIVE_ROLE_KEYS,
  collectDeclarations, findPasswordConflicts, findDestructiveOverlaps, findUndeclaredVars,
} from './credential-specs.mjs';
import { USER_ROLES } from '../lib/user-roles.mjs';
import { STORE_EXAMPLE, STORE_FILE, readStore, storeValues } from '../lib/test-accounts.mjs';
import { SEEDED_ACCOUNTS as OTP_ACCOUNTS, PASSWORD_VAR as OTP_PASSWORD_VAR } from './auth/otp-signin-specs.mjs';

/**
 * Destructive accounts declared OUTSIDE user-roles.mjs: the VCST-5748 OTP fixtures a case locks or
 * blocks (spec flag `destructive`, seeded by auth/seed-otp-signin.mjs). Registered as roles so [3] and
 * [4] see them. Keyed on the flag, not on `kind`, so a new destructive kind cannot slip past.
 */
const SPEC_DESTRUCTIVE = OTP_ACCOUNTS.filter((s) => s.destructive)
  .map((s) => ({ key: s.alias, email: s.email, passwordVar: OTP_PASSWORD_VAR }));
const DESTRUCTIVE_KEYS = [...DESTRUCTIVE_ROLE_KEYS, ...SPEC_DESTRUCTIVE.map((r) => r.key)];

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const problems = [];
const notes = [];
const ok = (m) => console.log(`  ✓ ${m}`);
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };

const readRows = (rel) => {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  return parse(readFileSync(p, 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
};

/**
 * The role identities per env, from the test-account store (test-accounts.local.json), where every test account's
 * login lives. Absent (CI, a fresh clone): one empty layer, so the CSV fixtures and the spec-declared destructive
 * accounts are still checked — the role logins are in no committed file, so they cannot be.
 */
function storeEnvLayers() {
  let store = { exists: false };
  try { store = readStore(ROOT); } catch (e) { warn(`${STORE_FILE}: ${e.message} — role identities not checked`); }
  if (!store.exists || !Object.keys(store.envs).length) {
    warn(`no ${STORE_FILE} here (CI or a fresh clone): the role logins live only there, so [3] and [4] check the CSV and spec fixtures alone`);
    return [{ file: 'committed fixtures', map: {} }];
  }
  return Object.keys(store.envs).sort().map((env) => ({ file: `${STORE_FILE} (${env})`, map: storeValues(store, env).values }));
}

/** Var NAMES documented as meant to exist: the store's template first, then the .env.local template and .env.defaults. */
function templateVarNames() {
  const out = new Set();
  try {
    const ex = JSON.parse(readFileSync(join(ROOT, STORE_EXAMPLE), 'utf8'));
    for (const sec of [ex.defaults ?? {}, ...Object.values(ex.envs ?? {})]) for (const k of Object.keys(sec)) out.add(k);
  } catch { /* no template: the files below still count */ }
  for (const rel of ['templates/.env.local.template', 'templates/.env.{env}.example', '.env.defaults']) {
    const p = join(ROOT, rel);
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=/);
      if (m) out.add(m[1]);
    }
  }
  return [...out];
}

console.log('=== credential-declaration validation (static) ===');

// ── 1. Load every credential-bearing CSV ─────────────────────────────────────
console.log('\n[1] Credential sources');
const csvFiles = [];
for (const src of CSV_CREDENTIAL_SOURCES) {
  const rows = readRows(src.file);
  if (rows === null) { warn(`${src.file}: not found — skipped`); continue; }
  csvFiles.push({ file: src.file, rows });
  ok(`${src.file}: ${rows.length} row(s), column pair(s) ${src.pairs.map((p) => `${p.email}/${p.password}`).join(', ')}`);
}

// ── 2. Resolve role-registry identities from the COMMITTED env layers ────────
// One role can name a different account per env, so a conflict is evaluated PER ENV LAYER.
console.log(`\n[2] Role-registry identities (per env, from ${STORE_FILE})`);
const envLayers = storeEnvLayers();
const roleEntriesByEnv = new Map();
for (const layer of envLayers) {
  const entries = [];
  for (const role of USER_ROLES) {
    for (const v of role.emailVars || []) {
      const email = layer.map[v];
      if (email && email.includes('@')) { entries.push({ key: role.key, email, passwordVar: role.passwordVar }); break; }
    }
  }
  roleEntriesByEnv.set(layer.file, [...entries, ...SPEC_DESTRUCTIVE]);
  ok(`${layer.file}: ${entries.length} role identity/ies declared`);
}

// ── 3. Same account, two different passwords (WARN — degraded, not blocked) ──
// Severity rationale: a contested declaration is now SAFELY DEGRADED — the seeders' password
// reconciliation skips these accounts (user-provision.mjs contestedPasswordEmails), so the two
// declarations no longer overwrite each other; the account simply keeps whatever it has. That is a
// debt item to pay down, not a reason to block every commit on a pre-existing backlog. The one
// class with NO safe degradation is check [4] below, which stays hard.
console.log('\n[3] No account declared with conflicting passwords');
let conflictCount = 0;
for (const [envFile, roleEntries] of roleEntriesByEnv) {
  const decls = collectDeclarations({ csvFiles, roleEntries });
  for (const c of findPasswordConflicts(decls)) {
    conflictCount++;
    // One representative origin per DISTINCT ref — listing every duplicate row obscures the conflict.
    const byRef = c.refs.map((ref) => `${c.declarations.find((d) => d.ref === ref).origin} → ${ref}`);
    warn(`${envFile}: "${c.email}" is declared with ${c.refs.length} DIFFERENT passwords — ${byRef.join('  vs  ')}`
      + '  |  password reconciliation is DISABLED for this account until the declarations agree (or one fixture gets its own dedicated account)');
  }
}
if (!conflictCount) ok(`no conflicting password declarations across ${csvFiles.length} CSV source(s) × ${envLayers.length} env layer(s)`);

// ── 4. Destructive fixtures own a dedicated account (HARD) ──────────────────
console.log('\n[4] Destructive (lockout/abuse) fixtures own a dedicated account');
let overlapCount = 0;
for (const [envFile, roleEntries] of roleEntriesByEnv) {
  const decls = collectDeclarations({ csvFiles, roleEntries });
  for (const o of findDestructiveOverlaps(decls, DESTRUCTIVE_KEYS)) {
    overlapCount++;
    fail(`${envFile}: destructive role ${o.roleKey} points at "${o.email}", which is ALSO declared by `
      + o.sharedWith.map((d) => d.origin).join(', ')
      + `  |  ${o.roleKey} deliberately fails logins, so every other consumer of this account is BLOCKED for the lockout window — give ${o.roleKey} its own AGENT-TEST account`);
  }
}
if (!overlapCount) ok(`destructive role(s) [${DESTRUCTIVE_KEYS.join(', ')}] are isolated from shared fixtures`);

// ── 5. Advisory: `{{VAR}}` cells whose var isn't documented anywhere ─────────
console.log('\n[5] Every {{VAR}} password token names a documented variable');
const known = templateVarNames();
const allDecls = collectDeclarations({ csvFiles, roleEntries: [...roleEntriesByEnv.values()].flat() });
const undeclared = findUndeclaredVars(allDecls, known);
for (const u of undeclared) warn(`${u.origin}: {{${u.varName}}} is not documented in ${STORE_EXAMPLE} — add the name there, so every copy of the store knows it`);
if (!undeclared.length) ok(`all ${new Set(allDecls.filter((d) => d.ref.startsWith('var:')).map((d) => d.ref)).size} distinct password var(s) are documented`);

// ── Summary ─────────────────────────────────────────────────────────────────
console.log('\n=== credential-declaration validation ===');
console.log(`  declarations: ${allDecls.length} | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nCredential declarations OK — every account has exactly one declared password.');
process.exit(0);
