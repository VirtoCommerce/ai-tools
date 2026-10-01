#!/usr/bin/env node
/**
 * validate-otp-signin-data.mjs — STATIC drift guard for the VCST-5748 OTP sign-in fixtures
 * (otp-signin-specs.mjs + test-data/auth/otp-inputs.json + their aliases). No network.
 *
 * A VACUITY guard first — each check below is a one-cell edit that still seeds, still resolves, and
 * makes a case pass while testing nothing:
 *   - the two lockout accounts must be DISTINCT and appear in no committed .env layer (a lockout
 *     account shared with a happy-path persona locks that persona's suites for ~15 min);
 *   - the long-address pair must stay 254 vs 255 with the SAME shape (otherwise a 254-accept /
 *     255-reject split could be caused by syntax, not by MaxLength(254));
 *   - each malformed code must stay malformed in exactly its one way; each missing-param body must
 *     lack exactly the parameter it is named for;
 *   - unknownEmail must stay a generator directive (a fixed address can be registered later).
 *   - the store-rule pair must stay decidable: the trusted account resolves its store from the LIVE
 *     trustedGroups (a transcribed store id is env configuration), the foreign one sits on an
 *     AGENT-TEST- id; the admin must stay an administrator with no member, the manager a
 *     non-administrator with no member (each is the branch its case exists to probe);
 *   - every account is OURS (agent-test-otp-* email) — no borrowed account may come back.
 * Then the hygiene: aliases registered, runtime ids EMPTY in the base (DV-021), passwords only as
 * the {{VAR}} token, no GUID literal, no overlay shadowing a committed email.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  EMAIL_PREFIX, PASSWORD_TOKEN, STORE_TOKEN, TRUSTED_TOKEN, FOREIGN_STORE_ID, SEEDED_ACCOUNTS,
} from './otp-signin-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const errors = [];
const info = [];
const fail = (m) => errors.push(m);

const base = JSON.parse(readFileSync(join(ROOT, 'test-data/aliases.json'), 'utf8'));
const fxText = readFileSync(join(ROOT, 'test-data/auth/otp-inputs.json'), 'utf8');
const fx = JSON.parse(fxText);
const specText = readFileSync(join(ROOT, 'scripts/seed-data/auth/otp-signin-specs.mjs'), 'utf8');

// [1] seeded aliases
const lockouts = SEEDED_ACCOUNTS.filter((s) => s.kind === 'lockout');
if (lockouts.length !== 2) fail(`[1] expected exactly 2 lockout accounts (one per lockout case), found ${lockouts.length}`);
const emails = SEEDED_ACCOUNTS.map((s) => s.email.toLowerCase());
if (new Set(emails).size !== emails.length) fail('[1] seeded account emails are not unique — two cases would share one lockout counter');
for (const s of SEEDED_ACCOUNTS) {
  if (!s.email.toLowerCase().startsWith(EMAIL_PREFIX)) fail(`[1] ${s.alias}: email ${s.email} lacks the ${EMAIL_PREFIX} sweep prefix`);
  if (s.kind === 'lockout' && s.storeId !== STORE_TOKEN) fail(`[1] ${s.alias}: storeId must be ${STORE_TOKEN}`);
  if (s.kind === 'no-store' && s.storeId !== '') fail(`[1] ${s.alias}: storeId must be EMPTY — that is the whole fixture`);
  if (s.kind === 'trusted-store' && s.storeId !== TRUSTED_TOKEN) fail(`[1] ${s.alias}: storeId must be ${TRUSTED_TOKEN} (resolved live), never a transcribed store id`);
  if (s.kind === 'foreign-store' && (s.storeId !== FOREIGN_STORE_ID || !FOREIGN_STORE_ID.startsWith('AGENT-TEST-'))) fail(`[1] ${s.alias}: storeId must be the AGENT-TEST- foreign id`);
  if (s.kind === 'admin' && !(s.isAdministrator === true && s.userType === 'Administrator' && !s.hasContact && !s.storeId)) fail(`[1] ${s.alias}: must be an Administrator, isAdministrator true, no member, no store`);
  if (s.kind === 'manager' && !(s.isAdministrator === false && s.userType === 'Manager' && !s.hasContact && !s.storeId)) fail(`[1] ${s.alias}: must be a Manager, not administrator, no member, no store`);
  if (s.hasContact && s.userType !== 'Customer') fail(`[1] ${s.alias}: a contact-backed account must be a Customer`);
  if (!s.expectOutcome && s.kind !== 'no-store') fail(`[1] ${s.alias}: no expectOutcome — --verify could not probe it`);
  const a = base[s.alias];
  if (!a) { fail(`[1] ${s.alias} not registered in aliases.json`); continue; }
  if (!a._inline) fail(`[1] ${s.alias}: must be _inline`);
  if (a.email !== s.email || a.userName !== s.email) fail(`[1] ${s.alias}: base email/userName drifted from the spec (${a.email})`);
  if (a.password !== PASSWORD_TOKEN) fail(`[1] ${s.alias}: password must be the ${PASSWORD_TOKEN} token`);
  for (const f of ['id', 'user_id']) if (a[f] !== '') fail(`[1] ${s.alias}.${f} must be EMPTY in the committed base (runtime id → aliases.<env>.json)`);
}

// [2] the store-rule pair must disagree: same shape, opposite outcome
const tr = SEEDED_ACCOUNTS.find((s) => s.kind === 'trusted-store');
const fo = SEEDED_ACCOUNTS.find((s) => s.kind === 'foreign-store');
if (!tr || !fo) fail('[2] both the trusted-store and the foreign-store account must exist');
else if (tr.expectOutcome === fo.expectOutcome) fail('[2] trusted and foreign store accounts expect the SAME outcome — the store rule would be unfalsifiable');

// [3] a destructive account must not be a committed persona anywhere
for (const f of readdirSync(ROOT).filter((n) => /^\.env\.[a-z0-9_]+$/i.test(n) && !/local|playwright/.test(n))) {
  const t = readFileSync(join(ROOT, f), 'utf8').toLowerCase();
  for (const s of lockouts) if (t.includes(s.email.toLowerCase())) fail(`[3] ${s.alias} (${s.email}) appears in ${f} — a lockout account must not double as a persona`);
}
for (const [name, a] of Object.entries(base)) {
  if (SEEDED_ACCOUNTS.some((s) => s.alias === name)) continue;
  const t = JSON.stringify(a).toLowerCase();
  for (const s of lockouts) if (t.includes(s.email.toLowerCase())) fail(`[3] ${s.alias}'s email is also used by alias ${name}`);
}

// [4] overlays: no shadowing of a seeded business key; referenced emails reported per env
for (const f of readdirSync(join(ROOT, 'test-data')).filter((n) => /^aliases\.[a-z0-9_]+\.json$/i.test(n))) {
  let ov; try { ov = JSON.parse(readFileSync(join(ROOT, 'test-data', f), 'utf8')); } catch { continue; }
  for (const s of SEEDED_ACCOUNTS) {
    const o = ov[s.alias];
    if (o && ((o.email && o.email !== s.email) || (o.userName && o.userName !== s.email))) fail(`[4] ${f} ${s.alias} shadows the seeded email with ${o.email || o.userName}`);
  }
  const seeded = SEEDED_ACCOUNTS.filter((s) => ov[s.alias]?.user_id);
  if (seeded.length) info.push(`${f}: ${seeded.length}/${SEEDED_ACCOUNTS.length} OTP accounts seeded`);
}

// [5] input fixture non-vacuity
const reg = base.OTP_INPUTS;
if (!reg || reg.json !== 'auth/otp-inputs') fail('[5] OTP_INPUTS must be a json-backed alias on auth/otp-inputs');
if (!/^random-data\(uniqueEmail\("agent-test-otp-/.test(fx.unknownEmail || '')) fail('[5] unknownEmail must stay a random-data(uniqueEmail("agent-test-otp-…")) directive, never a fixed address');
const long = fx.invalid?.tooLong255 || ''; const max = fx.boundary?.maxLength254 || '';
if (long.length !== 255) fail(`[5] invalid.tooLong255 is ${long.length} chars, must be 255`);
if (max.length !== 254) fail(`[5] boundary.maxLength254 is ${max.length} chars, must be 254`);
const shape = (e) => e.replace(/[a-z]/g, 'x').replace(/x+/g, 'x');
if (long && max && (shape(long) !== shape(max) || long.split('@')[0] !== max.split('@')[0])) fail('[5] the 254/255 pair must differ ONLY in length (same local part, same label shape)');
const labelsOk = (e) => e.split('@')[0].length <= 64 && e.split('@')[1]?.split('.').every((l) => l.length >= 1 && l.length <= 63);
if (max && !labelsOk(max)) fail('[5] boundary.maxLength254 breaks a local-part/label limit — it would be refused for syntax, not length');
const inv = fx.invalid || {};
if (inv.empty !== '') fail('[5] invalid.empty must be ""');
if (!/^[^@\s]+@$/.test(inv.noDomain || '')) fail('[5] invalid.noDomain must be "<local>@" with nothing after it');
if (!/^\S+ \S+@\S+$/.test(inv.innerSpace || '')) fail('[5] invalid.innerSpace must contain exactly one inner space and be otherwise well-formed');
const list = fx.invalidEmails || [];
for (const v of [inv.empty, inv.noDomain, inv.innerSpace, inv.tooLong255]) if (!list.includes(v)) fail(`[5] invalidEmails is missing ${JSON.stringify(String(v).slice(0, 30))}`);
const c = fx.codes || {};
if (!(c.spacedPaste && c.spacedPaste.replace(/\D/g, '').length === 6 && /\s/.test(c.spacedPaste))) fail('[5] codes.spacedPaste must be 6 digits WITH whitespace');
if (!(c.withLetter?.length === 6 && /[a-z]/i.test(c.withLetter) && c.withLetter.replace(/\D/g, '').length === 5)) fail('[5] codes.withLetter must be 6 chars with exactly one letter');
if (!/^\d{5}$/.test(c.fiveDigits || '')) fail('[5] codes.fiveDigits must be 5 digits');
if (!/^\d{7}$/.test(c.sevenDigits || '')) fail('[5] codes.sevenDigits must be 7 digits');
for (const v of Object.values(c)) if (!(fx.malformedCodes || []).includes(v)) fail(`[5] malformedCodes is missing ${JSON.stringify(v)}`);
if (!String(fx.unknownStoreId || '').startsWith('AGENT-TEST-')) fail('[5] unknownStoreId must carry the AGENT-TEST- prefix (so nobody creates it by accident)');
const b = fx.missingParamBodies || {};
const lacks = { request_no_storeId: ['storeId', ['email']], request_no_email: ['email', ['storeId']],
  grant_no_code: ['code', ['storeId', 'email', 'grant_type']], grant_no_storeId: ['storeId', ['email', 'code', 'grant_type']],
  grant_no_email: ['email', ['storeId', 'code', 'grant_type']] };
for (const [k, [missing, present]] of Object.entries(lacks)) {
  const body = b[k];
  if (!body) { fail(`[5] missingParamBodies.${k} missing`); continue; }
  if (missing in body) fail(`[5] missingParamBodies.${k} must NOT carry ${missing}`);
  for (const p of present) if (!(p in body)) fail(`[5] missingParamBodies.${k} must carry ${p} (only ${missing} may be missing)`);
  if (body.grant_type && body.grant_type !== 'otp_email') fail(`[5] missingParamBodies.${k}.grant_type must be otp_email`);
}

// [6a] seeded ⇔ consumed: a default-seeded account no case reads is a real account created for nothing
// (the admin is a REAL administrator); an opt-in account a case DOES read would never be seeded for it.
const suiteText = [];
const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(join(d, e.name))
  : e.name.endsWith('.csv') && suiteText.push(readFileSync(join(d, e.name), 'utf8'))));
walk(join(ROOT, 'regression/suites'));
const consumed = (alias) => suiteText.some((t) => new RegExp(`\\b${alias}\\b`).test(t));
for (const s of SEEDED_ACCOUNTS) {
  if (!s.optIn && !consumed(s.alias)) fail(`[6a] ${s.alias} is seeded by default but no suite case reads it — mark it optIn or add the case`);
  if (s.optIn && consumed(s.alias)) fail(`[6a] ${s.alias} is optIn but a suite case reads it — drop optIn so the seed creates it`);
}

// [6] no GUID / credential literal
if (GUID_RE.test(fxText)) fail('[6] a GUID literal leaked into test-data/auth/otp-inputs.json');
if (GUID_RE.test(specText)) fail('[6] a GUID literal leaked into otp-signin-specs.mjs');
for (const name of SEEDED_ACCOUNTS.map((s) => s.alias)) {
  if (GUID_RE.test(JSON.stringify(base[name] || {}))) fail(`[6] ${name}: GUID literal in the committed base (DV-021)`);
}

console.log('\nOTP sign-in fixtures — drift guard (static)\n');
info.forEach((m) => console.log(`  i ${m}`));
if (errors.length) { errors.forEach((e) => console.log(`  ✗ ${e}`)); console.log(`\n  ${errors.length} problem(s)`); process.exit(1); }
console.log(`  ✓ clean — ${SEEDED_ACCOUNTS.length} seeded accounts (none borrowed), OTP_INPUTS non-vacuous`);
