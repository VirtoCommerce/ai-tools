#!/usr/bin/env node
/**
 * seed-otp-signin.mjs — provision the VCST-5748 OTP email sign-in accounts (suites 104 / 105).
 *
 * WHAT IT MAKES (why each exists: otp-signin-specs.mjs) — every one is OURS, none is borrowed:
 *   OTP_LOCKOUT_USER_1/_2      Customer contact + account on STORE_ID (DESTRUCTIVE, one per case)
 *   OTP_NO_STORE_CONTACT       Customer contact + account, no storeId
 *   OTP_TRUSTED_STORE_CONTACT  Customer contact + account on a store in STORE_ID.trustedGroups (live)
 *   OTP_FOREIGN_STORE_CONTACT  Customer contact + account on AGENT-TEST-OTP-FOREIGN-STORE (no such store)
 *   OTP_ADMIN_LOCKOUT_ON       Administrator, isAdministrator, no member — a REAL admin, torn down after  [opt-in]
 *   OTP_MANAGER_NON_CONTACT    Manager, no member, no roles                                            [opt-in]
 * All: lockoutEnabled, emailConfirmed, passwordExpired false, password {{DEFAULT_TEST_PASSWORD}}.
 * [opt-in] = no case consumes it yet: created only with `--only <alias>`, never by a plain seed or the
 * bootstrap; `--teardown` still removes it. Seed and `--verify` cover the SAME accounts (planScope).
 *
 * RE-ARM: re-running on an existing account unlocks it (POST /users/{id}/unlock keys on the GUID —
 * KB-B9D1132A), zeroes accessFailedCount, re-asserts every flag above and re-sets the password.
 * Re-seed BEFORE each lockout run, never between a lockout observation and its audit
 * (test-data-authoring.md §DISPOSABLE FIXTURES).
 *
 * USAGE
 *   TEST_ENV=<env> node scripts/seed-data/auth/seed-otp-signin.mjs [--dry-run] [--verbose] [--only <alias|key>]
 *   TEST_ENV=<env> node scripts/seed-data/auth/seed-otp-signin.mjs --verify      (seed, then live checks)
 *   TEST_ENV=<env> node scripts/seed-data/auth/seed-otp-signin.mjs --verify-only (live checks, no writes)
 *   TEST_ENV=<env> node scripts/seed-data/auth/seed-otp-signin.mjs --teardown
 *   --probe <alias,alias>   limit the /api/otp/request probe to these aliases (default: all with an
 *                           expected outcome)
 *
 * `--verify` POSTs /api/otp/request ONCE per probed account and compares the outcome with the spec's
 * `expectOutcome` (needs DetailedErrors on; with it off every outcome is masked). It sends a real
 * code email for CodeSent and makes NO grant attempt, so it never burns a failed attempt.
 *
 * Safety: assertSafeTarget (ENV_RISK=production aborts). Teardown removes only SEEDED_ACCOUNTS
 * (agent-test-otp-* accounts; contacts only when they carry our outerId or our email) and ends on a
 * zero-residue assert. No store and no store setting is ever written here.
 */
import "../../lib/sync-stdio.mjs"; // before any output: a piped stdout must not lose its tail to process.exit()
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, verifyRemoved, writeEnvAliasOverride, resetSecurityPassword,
  DRY_RUN, TEARDOWN, ONLY, STORE_ID, BACK_URL, ROOT,
} from '../../lib/seed-common.mjs';
import {
  SEED_PREFIX, PASSWORD_VAR, SEEDED_ACCOUNTS, FOREIGN_STORE_ID,
  contactBody, accountBody, seededProblems, isSeededOuterId, planScope,
} from './otp-signin-specs.mjs';

const argv = process.argv.slice(2);
const VERIFY_ONLY = argv.includes('--verify-only');
const VERIFY = argv.includes('--verify') || VERIFY_ONLY;
const PROBE = argv.includes('--probe') ? String(argv[argv.indexOf('--probe') + 1] || '').split(',').filter(Boolean) : null;
const TEST_ENV = process.env.TEST_ENV || 'vcst';
/** Teardown scope: every account (opt-in included — it may exist from an earlier seed), or `--only`. */
const inScope = (s) => !ONLY || ONLY === s.alias || ONLY === s.key;
/** Seed + verify scope — the same accounts for both (otp-signin-specs.mjs planScope). */
const scopeOf = (ctx) => planScope(SEEDED_ACCOUNTS, { only: ONLY, envStoreId: STORE_ID, trustedGroups: ctx.trustedGroups });
const logSkipped = (skipped) => skipped.forEach((s) => log(`  ! skip ${s.alias}: ${STORE_ID} has no trusted store on ${TEST_ENV} — the case is not decidable here`));

/* ── lookups ─────────────────────────────────────────────────────────────────── */

function readOverlay() {
  const p = join(ROOT, `test-data/aliases.${TEST_ENV}.json`);
  try { return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {}; } catch { return {}; }
}

/**
 * Security-users search is the reliable existence check (the GET-by-name is cache-flaky). Its keyword
 * matches userName, not email (KB-9560787E) — every account here has userName == email.
 */
async function findUser(email) {
  const r = await api('POST', '/api/platform/security/users/search', { keyword: email, take: 20 }, { expectStatus: [200, 201] });
  const e = String(email).toLowerCase();
  return (r?.results || []).find((u) => String(u.email || '').toLowerCase() === e || String(u.userName || '').toLowerCase() === e) || null;
}

async function getMember(id) {
  if (!id) return null;
  const m = await api('GET', `/api/members/${encodeURIComponent(id)}`, null, { expectStatus: [200, 204, 404] });
  return m?.id ? m : null;
}

/** Contact by email; deepSearch:true or the search returns a count with an empty page (KB-B9D1132A). */
async function findContact(spec, overlayId) {
  const byId = await getMember(overlayId);
  if (byId) return byId;
  const r = await api('POST', '/api/members/search', { memberType: 'Contact', keyword: spec.email, deepSearch: true, take: 20 }, { expectStatus: [200, 201] });
  return (r?.results || []).find((m) => (m.emails || []).some((x) => String(x).toLowerCase() === spec.email.toLowerCase())
    || m.outerId === `${SEED_PREFIX}:${spec.key}`) || null;
}

async function storeContext() {
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`, null, { expectStatus: [200, 204, 404] });
  const trustedGroups = store?.trustedGroups || [];
  const foreign = await api('GET', `/api/stores/${encodeURIComponent(FOREIGN_STORE_ID)}`, null, { expectStatus: [200, 204, 404] });
  return { trustedGroups, foreignExists: !!foreign?.id };
}

/* ── seed / re-arm ───────────────────────────────────────────────────────────── */

async function ensureAccount(spec, password, overlay, ctx) {
  let user = await findUser(spec.email);
  let contactId = null;
  if (spec.hasContact) {
    let contact = user?.memberId ? await getMember(user.memberId) : null;
    if (!contact) contact = await findContact(spec, overlay[spec.alias]?.id);
    if (!contact) {
      const created = await api('POST', '/api/members', contactBody(spec), { expectStatus: [200, 201] });
      if (!created?.id && !DRY_RUN) throw new Error(`POST /api/members ${spec.email} returned no contact id — refusing to link the account to a placeholder`);
      contact = created?.id ? created : { id: `dry-contact-${spec.key}` };
      log(`  ✓ create contact ${contact.id} (${spec.email})`);
    } else verbose(`reuse contact ${contact.id} (${spec.email})`);
    contactId = contact.id;
  }
  const body = accountBody(spec, { envStoreId: STORE_ID, trustedGroups: ctx.trustedGroups, password, memberId: contactId });

  if (!user) {
    const res = await api('POST', '/api/platform/security/users/create', body, { expectStatus: [200, 201] });
    if (res && res.succeeded === false) throw new Error(`users/create ${spec.email}: ${JSON.stringify(res.errors)}`);
    if (DRY_RUN) { log(`  ✓ create account (dry) ${spec.email} [${spec.userType}]`); return { contactId, userId: '' }; }
    user = await findUser(spec.email);
    if (!user?.id) throw new Error(`created ${spec.email} but the users search cannot find it`);
    log(`  ✓ create account ${user.id} (${spec.email}) [${user.userType}${user.isAdministrator ? ', admin' : ''}] storeId=${user.storeId ?? 'null'}`);
    return { contactId, userId: user.id };
  }

  // Existing account — RE-ARM it (a lockout case may have locked it on the previous run).
  if (DRY_RUN) { log(`  ↻ would re-arm ${spec.email}`); return { contactId, userId: user.id }; }
  const end = user.lockoutEnd ? new Date(user.lockoutEnd).getTime() : 0;
  if (end > Date.now()) {
    await api('POST', `/api/platform/security/users/${user.id}/unlock`, {}, { expectStatus: [200, 201, 204] });
    log(`  ↻ unlocked ${spec.email} (was locked until ${user.lockoutEnd})`);
    user = (await findUser(spec.email)) || user; // the pre-unlock row still carries the stamps the unlock changed
  }
  const { password: _pw, ...flags } = body;
  // lockoutEnd is cleared EXPLICITLY: ApplicationUser.Patch copies LockoutEnd + AccessFailedCount from
  // the PUT body, so the pre-unlock value would re-lock the account the unlock just released.
  const full = { ...user, ...flags, lockoutEnd: null, accessFailedCount: 0 };
  delete full.password;
  delete full.passwordHash;
  const put = await api('PUT', '/api/platform/security/users', full, { expectStatus: [200, 204] });
  if (put && put.succeeded === false) throw new Error(`PUT users ${spec.email}: ${JSON.stringify(put.errors)}`);
  if (!await resetSecurityPassword(api, user.userName, password)) throw new Error(`password reset failed for ${spec.email}`);
  log(`  ↻ re-armed ${spec.email} (${user.id})`);
  return { contactId, userId: user.id };
}

async function seed(ctx) {
  const password = process.env[PASSWORD_VAR];
  if (!password && !DRY_RUN) throw new Error(`${PASSWORD_VAR} is not set (resolve through .env.local) — refusing to seed a fallback password`);
  if (ctx.foreignExists) throw new Error(`${FOREIGN_STORE_ID} EXISTS on ${TEST_ENV} — the foreign-store fixture would no longer be foreign`);
  const overlay = readOverlay();
  const writeback = {};
  const { active, skipped } = scopeOf(ctx);
  logSkipped(skipped);
  for (const spec of active) {
    const { contactId, userId } = await ensureAccount(spec, password, overlay, ctx);
    writeback[spec.alias] = { id: DRY_RUN ? '' : (contactId || ''), user_id: DRY_RUN ? '' : userId };
  }
  writeEnvAliasOverride(writeback);
  if (!DRY_RUN) {
    // Read back — the PUT envelope is not proof (lockoutEnd / accessFailedCount have lied before).
    let bad = 0;
    for (const spec of active) {
      const { problems: p } = await liveState(spec, ctx);
      p.forEach((x) => log(`  ✗ ${x}`)); bad += p.length;
      if (!p.length) log(`  ✓ armed ${spec.alias}`);
    }
    if (bad) throw new Error(`${bad} seeded-state problem(s) after seed`);
  }
}

/** One user search + one member GET; returns the row too so a caller never searches twice. */
async function liveState(spec, ctx) {
  const user = await findUser(spec.email);
  const member = user?.memberId ? await getMember(user.memberId) : null;
  return { user, problems: seededProblems(spec, user, { member, envStoreId: STORE_ID, trustedGroups: ctx.trustedGroups }) };
}

/* ── verify (live; the only write is a code email) ───────────────────────────── */

async function verify(ctx) {
  console.log('\n[verify] every OTP account against its decidability shape\n');
  log(`${STORE_ID}.trustedGroups = [${ctx.trustedGroups.join(', ')}] | ${FOREIGN_STORE_ID} exists: ${ctx.foreignExists}`);
  const problems = [];
  if (ctx.foreignExists) problems.push(`${FOREIGN_STORE_ID} exists — the foreign-store fixture is no longer foreign`);

  const { active, skipped } = scopeOf(ctx);
  logSkipped(skipped);
  for (const spec of active) {
    const { user, problems: p } = await liveState(spec, ctx);
    log(`${p.length ? '✗' : '✓'} ${spec.alias} = ${spec.email} {userType:${user?.userType}, admin:${user?.isAdministrator}, storeId:${user?.storeId || 'none'}, member:${user?.memberId ? 'yes' : 'none'}, roles:${(user?.roles || []).length}, lockoutEnabled:${user?.lockoutEnabled}, passwordExpired:${user?.passwordExpired}}`);
    problems.push(...p);
  }

  const inputs = JSON.parse(readFileSync(join(ROOT, 'test-data/auth/otp-inputs.json'), 'utf8'));
  const ghost = await api('GET', `/api/stores/${encodeURIComponent(inputs.unknownStoreId)}`, null, { expectStatus: [200, 204, 404] });
  if (ghost?.id) problems.push(`OTP_INPUTS.unknownStoreId ${inputs.unknownStoreId} EXISTS on ${TEST_ENV}`);
  else log(`✓ OTP_INPUTS.unknownStoreId ${inputs.unknownStoreId} does not exist`);

  // ONE anonymous code request per probed account, as the storefront sends it. No grant call.
  for (const spec of active.filter((s) => s.expectOutcome && (!PROBE || PROBE.includes(s.alias)))) {
    const res = await fetch(`${BACK_URL}/api/otp/request`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ storeId: STORE_ID, email: spec.email }), signal: AbortSignal.timeout(40000),
    });
    const text = await res.text();
    // vc-module-otp#1 @11d6 (2026-09-30) answers {succeeded, error:{code}} instead of {outcome}.
    let outcome = null;
    try { const b = JSON.parse(text); outcome = b?.succeeded === true ? 'succeeded' : (b?.error?.code ?? b?.outcome ?? null); } catch { /* non-JSON */ }
    const ok = res.status === 200 && String(outcome) === spec.expectOutcome;
    log(`${ok ? '✓' : '✗'} POST /api/otp/request ${spec.alias} -> ${res.status} ${text.slice(0, 120)} (expected ${spec.expectOutcome})`);
    if (!ok) problems.push(`${spec.alias}: /api/otp/request answered ${res.status} ${text.slice(0, 80)}, expected ${spec.expectOutcome}`);
  }

  console.log('');
  problems.forEach((p) => log(`✗ ${p}`));
  log(problems.length ? `[verify] ${problems.length} problem(s)` : '[verify] ✓ every OTP fixture has the shape its case needs');
  return problems;
}

/* ── teardown ────────────────────────────────────────────────────────────────── */

async function teardown() {
  log(`Teardown: removing ${SEED_PREFIX} accounts (incl. the seeded ADMINISTRATOR) + their contacts`);
  const overlay = readOverlay();
  // Snapshot every id BEFORE deleting — deleting an account re-writes the member's index document
  // and a later by-email search can miss it (measured on vcptcore_qa1 2026-09-24, push-audience).
  const snap = [];
  for (const spec of SEEDED_ACCOUNTS.filter(inScope)) {
    const user = await findUser(spec.email);
    let contactId = null;
    if (spec.hasContact) {
      const contact = (user?.memberId && await getMember(user.memberId)) || await findContact(spec, overlay[spec.alias]?.id);
      // Safety: only delete a contact that is ours — our outerId marker, or our agent-test-otp-* email.
      const ours = contact && (isSeededOuterId(contact.outerId)
        || (contact.emails || []).some((x) => String(x).toLowerCase() === spec.email.toLowerCase()));
      contactId = ours ? contact.id : null;
    }
    snap.push({ spec, user, contactId });
  }
  for (const s of snap) {
    if (s.user) {
      if (!DRY_RUN) await api('DELETE', `/api/platform/security/users?names=${encodeURIComponent(s.user.userName)}`, null, { expectStatus: [200, 204, 404] });
      log(`  ✗ account ${s.user.userName}${s.user.isAdministrator ? ' [ADMINISTRATOR]' : ''}`);
    }
    if (s.contactId) {
      if (!DRY_RUN) await api('DELETE', `/api/members?ids=${encodeURIComponent(s.contactId)}`, null, { expectStatus: [200, 204, 404] });
      log(`  ✗ contact ${s.contactId} (${s.spec.email})`);
    }
  }
  const residue = await verifyRemoved(async () => {
    const left = [];
    for (const s of snap) {
      if (await findUser(s.spec.email)) left.push(`account ${s.spec.email}`);
      if (s.contactId && await getMember(s.contactId)) left.push(`contact ${s.contactId}`);
    }
    left.forEach((x) => log(`  residual ${x}`));
    return left;
  });
  writeEnvAliasOverride(Object.fromEntries(snap.map((s) => [s.spec.alias, { id: '', user_id: '' }])));
  log(residue === 0 ? 'Teardown complete — zero residue.' : `WARN: ${residue} residual entity/entities remain.`);
  if (residue) process.exitCode = 1;
}

/* ── main ────────────────────────────────────────────────────────────────────── */

async function main() {
  assertSafeTarget();
  await auth();
  console.log(`\nOTP sign-in fixtures — TEST_ENV=${TEST_ENV} store=${STORE_ID}${DRY_RUN ? ' [DRY RUN]' : ''}\n`);
  if (TEARDOWN) { await teardown(); return; }
  const ctx = await storeContext();
  if (!VERIFY_ONLY) await seed(ctx);
  if (VERIFY && !DRY_RUN) { if ((await verify(ctx)).length) process.exitCode = 1; }
  log(DRY_RUN ? 'DRY RUN complete.' : 'Done.');
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1); });
