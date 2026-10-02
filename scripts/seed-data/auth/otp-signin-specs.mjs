/**
 * otp-signin-specs.mjs — side-effect-free source of truth for the VCST-5748 OTP email sign-in
 * fixtures (suites 104 storefront / 105 API). Imported by the seeder, the drift guard and the unit
 * test; importing it reads no env, touches no file and makes no request.
 *
 * Every account here is OURS: created on every env by seed-otp-signin.mjs (business key = email,
 * committed in aliases.json; runtime ids only in aliases.<env>.json), re-armed on every re-seed,
 * removed by --teardown. None of them borrows a manual or another seeder's account — a borrowed
 * account drifts (password expiry, store move, role change) with no signal to this run.
 *
 *   OTP_LOCKOUT_USER_1 / _2   Customer contact + account on STORE_ID. DISPOSABLE and DESTRUCTIVE:
 *                             the lockout cases lock them for the platform lockout window — env
 *                             configuration, never assume a length (observed: 5 failures, 120 s on
 *                             vcptcore_qa1). One account PER CASE — isolation is per ACCOUNT; two
 *                             cases on one account would read each other's failed-attempt count.
 *   OTP_BLOCKED_USER          Customer contact + account on STORE_ID. DISPOSABLE and DESTRUCTIVE:
 *                             OTP-028 administrator-blocks it. Its own account, so no other case
 *                             depends on the order the two run in or on OTP-028's cleanup.
 *   OTP_NO_STORE_CONTACT      Customer contact + account with NO storeId.
 *   OTP_TRUSTED_STORE_CONTACT Customer contact + account whose storeId is a store in STORE_ID's
 *                             trustedGroups — resolved LIVE at seed time (TRUSTED_TOKEN), never
 *                             transcribed, because the trusted list is env configuration.
 *   OTP_FOREIGN_STORE_CONTACT Customer contact + account whose storeId is FOREIGN_STORE_ID, an id
 *                             that exists on no env: it can never be STORE_ID, never be trusted by
 *                             it, and never acquire an OTP configuration of its own.
 *
 * NO BACK-OFFICE ACCOUNT, by design. Every address here is a PUBLIC yopmail inbox and these accounts
 * sign in by emailed code, so anyone can request a code for one and read it. That is acceptable for a
 * storefront Customer on a test env and never for a back-office user: an Administrator here was an
 * admin token for anyone who knew its address. The two that existed are RETIRED_ACCOUNTS — swept by
 * teardown, never seeded. A future back-office case needs an inbox only we can read.
 *
 * `optIn: true`: no case consumes the account yet, so a plain seed / bootstrap does NOT create it —
 * only `--only <alias>` does. Teardown still sweeps it. Drop the flag in the same change that adds
 * the first case that reads the alias. `destructive: true`: a case locks or blocks the account, so
 * it may never double as a persona (validate-credentials.mjs, validate-otp-signin-data.mjs [3]).
 */

export const SEED_PREFIX = 'AGENT-TEST-OTP';
export const EMAIL_PREFIX = 'agent-test-otp-';
/** The ONLY password source. A token, never a literal (VCST-5406). */
export const PASSWORD_VAR = 'DEFAULT_TEST_PASSWORD';
export const PASSWORD_TOKEN = `{{${PASSWORD_VAR}}}`;
export const STORE_TOKEN = '{{STORE_ID}}';
/** Resolved at seed time to the first entry of STORE_ID's live trustedGroups. */
export const TRUSTED_TOKEN = '{{TRUSTED_STORE_OF_STORE_ID}}';
export const FOREIGN_STORE_ID = 'AGENT-TEST-OTP-FOREIGN-STORE';

const customer = (o) => ({ userType: 'Customer', isAdministrator: false, hasContact: true, ...o });

export const SEEDED_ACCOUNTS = [
  customer({ key: 'LOCKOUT-1', alias: 'OTP_LOCKOUT_USER_1', kind: 'lockout', email: 'agent-test-otp-lockout-1@yopmail.com',
    lastName: 'Lockout One', storeId: STORE_TOKEN, expectOutcome: 'succeeded', destructive: true,
    consumer: '105 OTP-019 — wrong codes lock the account at the platform threshold' }),
  customer({ key: 'LOCKOUT-2', alias: 'OTP_LOCKOUT_USER_2', kind: 'lockout', email: 'agent-test-otp-lockout-2@yopmail.com',
    lastName: 'Lockout Two', storeId: STORE_TOKEN, expectOutcome: 'succeeded', destructive: true,
    consumer: '105 OTP-020 — OTP and password share one failed-attempt counter' }),
  customer({ key: 'BLOCKED', alias: 'OTP_BLOCKED_USER', kind: 'blocked', email: 'agent-test-otp-blocked@yopmail.com',
    lastName: 'Blocked', storeId: STORE_TOKEN, expectOutcome: 'succeeded', destructive: true,
    consumer: '105 OTP-028 — an administrator-blocked account receives no sign-in code' }),
  customer({ key: 'NO-STORE', alias: 'OTP_NO_STORE_CONTACT', kind: 'no-store', email: 'agent-test-otp-nostore@yopmail.com',
    lastName: 'No Store', storeId: '', expectOutcome: null,
    consumer: '105 OTP-024 — a contact of another store is refused (email2)' }),
  customer({ key: 'TRUSTED', alias: 'OTP_TRUSTED_STORE_CONTACT', kind: 'trusted-store', email: 'agent-test-otp-trusted@yopmail.com',
    lastName: 'Trusted Store', storeId: TRUSTED_TOKEN, expectOutcome: 'succeeded',
    consumer: '105 OTP-023 — a contact of a trusted-group store signs in to STORE_ID' }),
  customer({ key: 'FOREIGN', alias: 'OTP_FOREIGN_STORE_CONTACT', kind: 'foreign-store', email: 'agent-test-otp-foreign@yopmail.com',
    lastName: 'Foreign Store', storeId: FOREIGN_STORE_ID, expectOutcome: 'user_cannot_login_in_store',
    consumer: '105 OTP-024 — a contact of another store is refused and no code is sent' }),
].map((s) => ({ firstName: SEED_PREFIX, lastName: s.key, ...s }));

export const SEEDED_ALIASES = SEEDED_ACCOUNTS.map((a) => a.alias);

/**
 * Accounts an earlier version of this seeder created and this one must never create again (see the
 * header: back-office users on a public inbox). Teardown only — it deletes them wherever they still
 * exist. Keep an entry until no env can still hold the account.
 */
export const RETIRED_ACCOUNTS = [
  { key: 'ADMIN', alias: 'OTP_ADMIN_LOCKOUT_ON', email: 'agent-test-otp-admin@yopmail.com', hasContact: false },
  { key: 'MANAGER', alias: 'OTP_MANAGER_NON_CONTACT', email: 'agent-test-otp-manager@yopmail.com', hasContact: false },
];

export const seedOuterId = (key) => `${SEED_PREFIX}:${key}`;
export const isSeededOuterId = (v) => String(v || '').startsWith(`${SEED_PREFIX}:`);

/** Resolve a spec store token. `trustedGroups` is STORE_ID's live list. '' stays ''. */
export function resolveStoreId(spec, envStoreId, trustedGroups = []) {
  if (spec.storeId === STORE_TOKEN) return String(envStoreId || '');
  if (spec.storeId === TRUSTED_TOKEN) {
    const t = trustedGroups.find((g) => g && String(g).toLowerCase() !== String(envStoreId || '').toLowerCase());
    return t ? String(t) : '';
  }
  return String(spec.storeId || '');
}

/**
 * The accounts one seed / verify run covers — ONE answer for both, so `--verify` never checks an
 * account the seed did not arm. `only` (alias or key) selects exactly that account, opt-in or not;
 * without it opt-in accounts are left out. A trusted-store account is SKIPPED when STORE_ID trusts no
 * other store (the case is not decidable there). Teardown does not use this: it sweeps opt-in too.
 */
export function planScope(accounts, { only = null, envStoreId, trustedGroups = [] } = {}) {
  const selected = accounts.filter((s) => (only ? only === s.alias || only === s.key : !s.optIn));
  const undecidable = (s) => s.kind === 'trusted-store' && !resolveStoreId(s, envStoreId, trustedGroups);
  return { active: selected.filter((s) => !undecidable(s)), skipped: selected.filter(undecidable) };
}

/** POST /api/members body for a customer account's contact (no organization). */
export function contactBody(spec) {
  const name = `${spec.firstName} ${spec.lastName}`;
  return {
    memberType: 'Contact', firstName: spec.firstName, lastName: spec.lastName, fullName: name, name,
    emails: [spec.email], status: 'Approved', defaultLanguage: 'en-US', currencyCode: 'USD',
    outerId: seedOuterId(spec.key),
  };
}

/**
 * POST /api/platform/security/users/create body. lockoutEnabled is TRUE for every account: with it
 * off the OTP request answers `LockoutDisabled` and never sends a code. passwordExpired is FALSE so
 * the account can authenticate without a forced change (the two borrowed manual accounts this
 * replaced had expired passwords).
 */
export function accountBody(spec, { envStoreId, trustedGroups = [], password, memberId }) {
  const storeId = resolveStoreId(spec, envStoreId, trustedGroups);
  return {
    userName: spec.email, email: spec.email, password,
    memberId: spec.hasContact ? memberId : null,
    storeId: storeId || null, userType: spec.userType, isAdministrator: spec.isAdministrator,
    roles: [], status: 'Approved', emailConfirmed: true, lockoutEnabled: true, passwordExpired: false,
  };
}

const lc = (v) => String(v || '').trim().toLowerCase();

/**
 * Live state an account must be in before a run. Returns problem strings ([] = armed and
 * decidable). `user` is the security-users search row, `member` its linked member (or null),
 * `trustedGroups` STORE_ID's live list; `now` injectable for tests.
 */
export function seededProblems(spec, user, { member = null, envStoreId, trustedGroups = [], now = Date.now() } = {}) {
  if (!user) return [`${spec.alias}: no security account for ${spec.email}`];
  const out = [];
  const p = (m) => out.push(`${spec.alias}: ${m}`);
  const store = lc(user.storeId);
  const trusted = trustedGroups.map(lc);
  if (user.userType !== spec.userType) p(`userType ${user.userType}, expected ${spec.userType}`);
  if (Boolean(user.isAdministrator) !== spec.isAdministrator) p(`isAdministrator ${user.isAdministrator}, expected ${spec.isAdministrator}`);
  if (user.lockoutEnabled !== true) p('lockoutEnabled is not true — OTP request would answer LockoutDisabled');
  if (user.emailConfirmed !== true) p('emailConfirmed is not true');
  if (user.passwordExpired !== false) p(`passwordExpired is ${user.passwordExpired}, expected false`);
  // A Rejected / Blocked account (left by a manual test or a case) refuses for a reason no case is about.
  if (user.status && user.status !== 'Approved') p(`account status ${user.status}, expected Approved`);
  if (member?.status && member.status !== 'Approved') p(`contact status ${member.status}, expected Approved`);
  const end = user.lockoutEnd ? new Date(user.lockoutEnd).getTime() : 0;
  if (end > now) p(`LOCKED until ${user.lockoutEnd} — re-seed to re-arm`);
  if ((user.accessFailedCount || 0) > 0) p(`accessFailedCount ${user.accessFailedCount} — a lockout case would start mid-count`);
  if (spec.hasContact) {
    if (!user.memberId) p('no memberId — the account is not linked to its contact');
    else if (member && member.memberType !== 'Contact') p(`member is ${member.memberType}, expected Contact`);
  } else if (user.memberId) p(`memberId ${user.memberId} present — expected NO member`);
  switch (spec.kind) {
    case 'lockout':
    case 'blocked':
      if (store !== lc(envStoreId)) p(`storeId "${user.storeId ?? ''}", expected "${envStoreId}"`);
      break;
    case 'no-store':
      if (store) p(`storeId "${user.storeId}", expected none`);
      break;
    case 'trusted-store':
      if (!store) p('storeId empty — STORE_ID has no trusted store to borrow on this env');
      else if (store === lc(envStoreId)) p(`storeId IS ${envStoreId} — the trusted-group rule is not exercised`);
      else if (!trusted.includes(store)) p(`storeId ${user.storeId} is NOT in ${envStoreId}.trustedGroups [${trustedGroups.join(', ')}]`);
      break;
    case 'foreign-store':
      if (!store) p('storeId empty — that is the no-store branch, not the foreign one');
      else if (store === lc(envStoreId)) p(`storeId IS ${envStoreId}`);
      else if (trusted.includes(store)) p(`storeId ${user.storeId} IS trusted by ${envStoreId} — it would be allowed, not refused`);
      break;
    default:
      p(`unknown kind ${spec.kind}`);
  }
  return out;
}
