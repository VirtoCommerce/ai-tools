#!/usr/bin/env node
/**
 * set-rep-account-lock.mjs — lock / unlock a sales-rep's PLATFORM ACCOUNT mid-session (VCST-5733 #21).
 *
 * WHY THIS EXISTS
 * ---------------
 * vc-module-sales-rep PR #14 wires `EnsureAuthenticatedAsync` → `IUserManagerCore.CheckCurrentUserState`
 * into `SalesRepQueryBuilder.BeforeMediatorSend`, so EVERY sales-rep GraphQL query re-checks the
 * caller's account state at QUERY time instead of trusting the token's claims. Before that change a
 * locked account kept working until its token expired (~30 min), and an `OrganizationMembership`
 * lock — which is what `SR_REP_LOCKED` carries — is a MEMBERSHIP lock, not an account lock, so it
 * never exercised this gate either.
 *
 * The gate is unreachable from a statically-locked fixture. `SR_REP_BLOCKED` is locked at rest, so
 * `POST /connect/token` refuses it outright (400) and the GraphQL layer is never entered: the refusal
 * proves the TOKEN endpoint works, not the query-time re-check. The only way in is a state
 * TRANSITION — a token issued while the account was healthy, then used after it was locked:
 *
 *   1. POST /connect/token as @td(SR_REP_LOCKABLE.email)          -> a valid access token
 *   2. TEST_ENV=<env> npm run sr:lock                             -> the account is now locked
 *   3. re-issue the sales-rep query on the SAME still-valid token -> expect the state refusal
 *   4. TEST_ENV=<env> npm run sr:unlock                           -> back to the resting state
 *
 * `vc-module-x-api` PR #84 memoizes `CheckUserState` per REQUEST (it caches the verdict, keyed on
 * userId + flags), so the lock is observed on the NEXT request rather than part-way through one.
 * A case must therefore issue a FRESH request after step 2, not merely select another root field.
 *
 * SAFETY — the allowlist is the point, not a formality
 * ---------------------------------------------------
 * Locking a shared rep locks every suite that authenticates as it out of the environment, and the
 * symptom (a 400 at `/connect/token`) looks nothing like the cause. So this script refuses every rep
 * except the ones declared LOCKABLE below. In particular it refuses `SR_REP_PRIMARY`: ~40 cases in
 * 050m/089/091/093 authenticate as it, and this fixture set's own three order aliases are attributed
 * to its account id.
 *
 * TEARDOWN IS AUTOMATIC, AND THAT IS DELIBERATE
 * ---------------------------------------------
 * A lock left behind by an interrupted run is exactly the residue that poisons a later suite, and an
 * `--unlock` that only runs on the happy path is not a teardown. So the resting state is enforced by
 * the ORDINARY seeder: `SR_REP_LOCKABLE` has `is_locked=false`, so `repFixtureStatus()` is `Approved`,
 * so `seed-sales-rep.mjs`'s `clearRepStaleLockout()` → `hasStaleLockout()` clears `lockoutEnd` and
 * `accessFailedCount` on EVERY reseed. `npm run sr:unlock` is the fast path; a plain
 * `npm run seed:sales-rep` is the backstop, and `--verify` reports the current state without writing.
 *
 * Usage:
 *   TEST_ENV=vcst node scripts/seed-data/sales-rep/set-rep-account-lock.mjs --lock   [--rep SR_REP_LOCKABLE]
 *   TEST_ENV=vcst node scripts/seed-data/sales-rep/set-rep-account-lock.mjs --unlock [--rep SR_REP_LOCKABLE]
 *   TEST_ENV=vcst node scripts/seed-data/sales-rep/set-rep-account-lock.mjs --verify [--rep SR_REP_LOCKABLE]
 */
import { assertSafeTarget, auth, api, log, loadCsv, DRY_RUN } from '../../lib/seed-common.mjs';
import { setLockoutVerified, __setApi } from '../../lib/user-provision.mjs';
import { repFixtureStatus } from './sales-rep-layout-specs.mjs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/**
 * Reps whose ACCOUNT lock this script may toggle. A one-element allowlist by design: any rep on it
 * must be resting-unlocked and referenced by no case that needs it authenticable concurrently.
 * Adding a rep here without checking that is how a shared env loses a whole suite.
 */
export const LOCKABLE_REP_KEYS = ['SR_REP_LOCKABLE'];

// NOTE: there is deliberately no LOCK_UNTIL constant here. The `/lock` endpoint chooses the instant
// itself (observed: `9999-12-31T23:59:59.9999999+00:00`), and since `PUT` cannot write `lockoutEnd`
// at all, a constant in this file could only ever be a value we do NOT control — exactly the kind of
// transcribed-and-wrong number .claude/rules/test-data.md §GOLDEN RULE is about. `isLockedNow` reads
// whatever the server actually stored.

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d = null) => (has(f) ? argv[argv.indexOf(f) + 1] : d);

const REP_KEY = val('--rep', LOCKABLE_REP_KEYS[0]);
const MODE = has('--lock') ? 'lock' : has('--unlock') ? 'unlock' : has('--verify') ? 'verify' : null;

/** The committed rep row, or a loud failure. Identity is a business key, never a literal here. */
export function repRow(key) {
  const row = loadCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === key);
  if (!row) throw new Error(`rep_key "${key}" is not in test-data/sales-rep/sales-reps.csv`);
  return row;
}

/**
 * Refuse anything not explicitly declared lockable, with the reason spelled out.
 *
 * EXPORTED so `scripts/unit/sales-rep-account-lock.test.mjs` can assert the REFUSAL itself, not
 * merely the contents of `LOCKABLE_REP_KEYS`. Testing the list without testing the gate that reads
 * it left this — the one function standing between `sr:lock` and locking a shared fixture — with
 * zero coverage: weakening it to `|| key.startsWith('SR_')` kept every test green.
 */
export function assertLockable(key, row) {
  if (LOCKABLE_REP_KEYS.includes(key)) return;
  throw new Error(
    `REFUSING to change the account lock of "${key}". Only ${LOCKABLE_REP_KEYS.join(', ')} may be toggled.\n`
    + `  Locking a shared rep locks every suite that authenticates as it out of this environment, and the\n`
    + `  symptom (400 at /connect/token) looks nothing like the cause.${key === 'SR_REP_PRIMARY'
      ? ' SR_REP_PRIMARY specifically backs ~40 cases in 050m/089/091/093 and owns the customerId of the VCST-5733 order fixtures.'
      : ''}\n`
    + `  If you need another lockable rep, add a DEDICATED resting-unlocked row to sales-reps.csv and put\n`
    + `  its key on LOCKABLE_REP_KEYS — do not repurpose ${key} (fixture status: ${repFixtureStatus(row)}).`,
  );
}

/** Is this account currently locked out? (a lockoutEnd in the future) */
export function isLockedNow(user, now = Date.now()) {
  const end = user?.lockoutEnd ? new Date(user.lockoutEnd).getTime() : 0;
  return end > now;
}

/**
 * A lock is TWO fields, so "is it in the desired state?" is not one boolean.
 *
 * `status` is written by the PUT (which persists it but silently discards `lockoutEnd`), and
 * `lockoutEnd` is written by POST /lock|/unlock (the only endpoint that moves it). A run that
 * applied one and failed before the other leaves the two disagreeing, and that residue is what
 * reading `lockoutEnd` alone could not see: `--unlock` short-circuited on "already UNLOCKED" and
 * returned WITHOUT restoring `status`, so nothing recovered it.
 *
 * `desiredStatus` is DERIVED from the fixture row (`repFixtureStatus`), never transcribed — a
 * second lockable rep with a different resting status must not be silently reset to Approved.
 */
export function lockStateMatches(user, wantLocked, desiredStatus, now = Date.now()) {
  return isLockedNow(user, now) === wantLocked && (user?.status ?? '') === desiredStatus;
}

/** Human-readable current state of BOTH halves, for logs and `--verify`. */
export function describeLockState(user, now = Date.now()) {
  return `lockoutEnd=${user?.lockoutEnd ?? 'null'} status=${user?.status ?? 'null'} `
    + `lockoutEnabled=${user?.lockoutEnabled} accessFailedCount=${user?.accessFailedCount ?? 0} `
    + `=> ${isLockedNow(user, now) ? 'LOCKED' : 'UNLOCKED'}`;
}

async function main() {
  assertSafeTarget();
  if (!MODE) throw new Error('specify one of --lock | --unlock | --verify');
  const row = repRow(REP_KEY);
  if (MODE !== 'verify') assertLockable(REP_KEY, row);

  await auth();
  const user = await api('GET', `/api/platform/security/users/${encodeURIComponent(row.email)}`, null, { expectStatus: [200, 404] });
  if (!user?.id) {
    throw new Error(`${REP_KEY} (${row.email}) has no platform account on this env — run \`TEST_ENV=${process.env.TEST_ENV || 'vcst'} npm run seed:sales-rep -- --only ${REP_KEY}\` first`);
  }
  const restingStatus = repFixtureStatus(row);
  log(`${REP_KEY} (${row.email}) account ${user.id}: ${describeLockState(user)}`);

  if (MODE === 'verify') {
    // Judge BOTH halves. Reporting only `lockoutEnd` told an operator the fixture was "as expected"
    // while `status` was still Locked — i.e. it exonerated exactly the residue it should surface.
    const consistent = lockStateMatches(user, false, restingStatus);
    log(`resting state per the fixture is UNLOCKED / status=${restingStatus} (is_locked=${row.is_locked}); currently ${
      consistent
        ? 'as expected'
        : `INCONSISTENT (${describeLockState(user)}) — run \`npm run sr:unlock\` (or any \`npm run seed:sales-rep\`, which self-heals)`
    }`);
    if (!consistent) process.exitCode = 1;
    return;
  }

  const want = MODE === 'lock';
  const targetStatus = want ? 'Locked' : restingStatus;
  // Short-circuit only when BOTH halves already match. Keying this on `lockoutEnd` alone is what
  // made a residual `status` unrecoverable: `--unlock` reported "nothing to do" and left it.
  if (lockStateMatches(user, want, targetStatus)) {
    log(`already ${want ? 'LOCKED' : 'UNLOCKED'} with status=${targetStatus} — nothing to do (idempotent)`);
    return;
  }
  if (DRY_RUN) { log(`[DRY] would ${MODE} ${REP_KEY} (target: lockedOut=${want}, status=${targetStatus})`); return; }

  // ── The lockout is NOT settable through `PUT /api/platform/security/users` ────────────────────
  // Measured on vcst 2026-09-02. That PUT returns `{ succeeded: true, errors: [] }` and persists
  // `status`, but SILENTLY DISCARDS `lockoutEnd` in BOTH directions — it can neither set nor clear
  // it. So a body carrying `lockoutEnd: '9999-…'` reads back `lockoutEnd: null` with a success
  // envelope, and one carrying `lockoutEnd: null` leaves an existing `9999-…` in place. Confirmed
  // both ways against this rep's own account.
  //
  // The endpoints that DO work are `POST /users/{id}/lock` and `POST /users/{id}/unlock`, and they
  // key on the ACCOUNT GUID — the userName/email form returns `{ succeeded: false, errors: [] }`,
  // i.e. a failure with no message. Hence `user.id`, never `row.email`, below.
  //
  // `status` is still worth PUTting: it is the field that surface reads for the Admin UI's account
  // state, and it is the half the PUT genuinely applies.
  // Order matters: the `status` half goes first because the PUT round-trips the whole entity, then
  // the `lockoutEnd` half through the SHARED helper so there is one implementation of that move.
  user.status = targetStatus;
  if (!want) { user.lockoutEnabled = false; user.accessFailedCount = 0; }
  await api('PUT', '/api/platform/security/users', user, { expectStatus: [200, 204] });
  __setApi(api); // the helper is authenticated through THIS script's seed-common client
  const moved = await setLockoutVerified(user.id, row.email, want);
  if (!moved) {
    throw new Error(`${MODE} did NOT take effect on lockoutEnd — check the token has platform:security:update`);
  }

  // Read back BOTH halves. The endpoint returns 200 on shapes it did not apply, so success is
  // confirmed from the persisted entity — and confirming only `lockoutEnd` is what let the two
  // fields drift apart in the first place.
  const after = await api('GET', `/api/platform/security/users/${encodeURIComponent(row.email)}`, null, { expectStatus: [200, 404] });
  if (!lockStateMatches(after, want, targetStatus)) {
    throw new Error(`${MODE} left the two halves disagreeing: ${describeLockState(after)} (wanted lockedOut=${want}, status=${targetStatus})`);
  }
  log(`${REP_KEY} is now ${describeLockState(after)}`);
  if (want) log('  REMEMBER: the resting state is UNLOCKED. Run `npm run sr:unlock` when the case is done; any `npm run seed:sales-rep` also self-heals it.');
}

// Run ONLY when executed, never on import — `LOCKABLE_REP_KEYS` / `LOCK_UNTIL` / `isLockedNow` are
// imported by scripts/unit/, and an unguarded `main()` would authenticate against a live env from a
// unit test (the rule in knowledge/execution/test-data-authoring.md §1).
const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1]);
if (invokedDirectly) {
  main().catch((e) => { console.error(`SET-REP-LOCK FAILED: ${e.message}`); process.exit(1); });
}
