// Unit tests for the VCST-5733 #21 account-lock toggle (set-rep-account-lock.mjs) + the
// SR_REP_LOCKABLE fixture's resting-state contract. Pure — no env, no network.
//
// Importing the script must NOT run it: `main()` is behind an invoked-directly guard precisely so
// this file can import its helpers without authenticating against a live environment.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  LOCKABLE_REP_KEYS, isLockedNow, assertLockable, repRow as repRowFromScript,
  lockStateMatches,
} from '../seed-data/sales-rep/set-rep-account-lock.mjs';
import { repFixtureStatus, DISPOSABLE_LAYOUT_REP_KEYS, parseServedOrgs } from '../seed-data/sales-rep/sales-rep-layout-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });
const REPS = readCsv('test-data/sales-rep/sales-reps.csv');
const repRow = (key) => REPS.find((r) => r.rep_key === key);

test('isLockedNow reads whatever the server stored, and treats a PAST lockoutEnd as unlocked', () => {
  const now = Date.parse('2026-09-02T12:00:00Z');
  assert.equal(isLockedNow({ lockoutEnd: '9999-12-31T23:59:59.9999999+00:00' }, now), true);
  // the value the /unlock endpoint actually writes — not null, but long past
  assert.equal(isLockedNow({ lockoutEnd: '0001-01-01T00:00:00+00:00' }, now), false);
  assert.equal(isLockedNow({ lockoutEnd: '2026-08-26T09:27:49.9578383+00:00' }, now), false);
  assert.equal(isLockedNow({ lockoutEnd: null }, now), false);
  assert.equal(isLockedNow({}, now), false);
  // an unparsable value must not read as LOCKED — that would wedge the toggle into refusing to lock
  assert.equal(isLockedNow({ lockoutEnd: 'not-a-date' }, now), false);
});

test('lockoutEnabled alone is NOT a lock — only a future lockoutEnd is', () => {
  // The seeded rep rests at lockoutEnabled=true / lockoutEnd=0001-01-01, i.e. lockable but unlocked.
  // Reading lockoutEnabled as the state would report every such account as permanently locked.
  assert.equal(isLockedNow({ lockoutEnabled: true, lockoutEnd: '0001-01-01T00:00:00+00:00' }), false);
});

test('the lockable allowlist is minimal and never contains a load-bearing rep', () => {
  assert.deepEqual(LOCKABLE_REP_KEYS, ['SR_REP_LOCKABLE']);
  // SR_REP_PRIMARY backs ~40 cases and owns the customerId of the VCST-5733 order fixtures.
  assert.ok(!LOCKABLE_REP_KEYS.includes('SR_REP_PRIMARY'));
  // the disposable-LAYOUT rep is a different kind of disposable; the two allowlists must not merge
  for (const k of DISPOSABLE_LAYOUT_REP_KEYS) assert.ok(!LOCKABLE_REP_KEYS.includes(k), `${k} is on both allowlists`);
});

test('every lockable rep exists, is seeded, and RESTS UNLOCKED', () => {
  for (const key of LOCKABLE_REP_KEYS) {
    const row = repRow(key);
    assert.ok(row, `${key} is not in sales-reps.csv`);
    assert.match(String(row.seeded).trim().toLowerCase(), /^(true|yes|y|1)$/, `${key} must be seeded`);
    // is_locked=false is what makes repFixtureStatus() Approved, which is what makes
    // hasStaleLockout() treat a leftover lockout as STALE and clear it on the next reseed.
    // Flip this to true and the self-heal silently stops working while everything still looks fine.
    assert.equal(repFixtureStatus(row), 'Approved', `${key} must rest UNLOCKED so the seeder self-heal applies`);
  }
});

test('a lockable rep serves at least one org, so a post-unlock query returns real data', () => {
  for (const key of LOCKABLE_REP_KEYS) {
    const { orgKeys } = parseServedOrgs(repRow(key).served_orgs);
    assert.ok(orgKeys.length >= 1, `${key} serves no org — step 1b/4b of the procedure could not tell a working query from an empty one`);
  }
});

test('the statically-locked rep is NOT the account-state fixture, and the two are distinct reps', () => {
  // SR_REP_BLOCKED is locked at rest, so /connect/token refuses it and the GraphQL gate is never
  // reached. If someone ever "simplifies" by pointing the #21 procedure at it, this fails.
  const blocked = repRow('SR_REP_BLOCKED');
  // Asserted, not guarded: wrapping the body in `if (blocked)` meant a RENAME of this fixture made
  // the test pass while proving nothing.
  assert.ok(blocked, 'SR_REP_BLOCKED is missing from sales-reps.csv');
  assert.equal(repFixtureStatus(blocked), 'Locked');
  assert.ok(!LOCKABLE_REP_KEYS.includes('SR_REP_BLOCKED'));
});

// ---- the SAFETY GATE itself, not just the list it reads ----------------------------------------
// These are the highest-value tests in this file: `assertLockable` is the only thing between
// `npm run sr:lock` and locking a shared fixture out of the whole environment. Asserting only
// `LOCKABLE_REP_KEYS`'s contents left the gate itself uncovered — weakening it to
// `|| key.startsWith('SR_')` kept every other test in this file green.

test('assertLockable REFUSES a rep that is not on the allowlist', () => {
  assert.throws(
    () => assertLockable('SR_REP_PRIMARY', repRowFromScript('SR_REP_PRIMARY')),
    /REFUSING to change the account lock of "SR_REP_PRIMARY"/,
    'the guard must refuse the rep ~40 cases authenticate as',
  );
});

test('assertLockable names the specific blast radius for SR_REP_PRIMARY', () => {
  // The message is the whole value of the refusal: a bare "not allowed" leaves an operator
  // reaching for --rep on the next rep along.
  assert.throws(() => assertLockable('SR_REP_PRIMARY', repRowFromScript('SR_REP_PRIMARY')), /backs ~40 cases/);
});

test('assertLockable REFUSES every other rep in the committed CSV', () => {
  for (const row of REPS) {
    if (LOCKABLE_REP_KEYS.includes(row.rep_key)) continue;
    assert.throws(() => assertLockable(row.rep_key, row), /REFUSING/, `${row.rep_key} must not be lockable`);
  }
});

test('assertLockable ALLOWS the declared lockable rep', () => {
  for (const key of LOCKABLE_REP_KEYS) {
    assert.doesNotThrow(() => assertLockable(key, repRowFromScript(key)));
  }
});

test('repRow fails loudly on an unknown rep_key rather than returning undefined', () => {
  assert.throws(() => repRowFromScript('SR_REP_DOES_NOT_EXIST'), /is not in test-data\/sales-rep\/sales-reps\.csv/);
});

// ---- a lock is TWO fields ----------------------------------------------------------------------

test('lockStateMatches requires BOTH lockoutEnd and status to match the target', () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  // the residue that used to be unrecoverable: status says Locked, lockoutEnd says not locked
  const residue = { lockoutEnd: null, status: 'Locked' };
  assert.equal(lockStateMatches(residue, false, 'Approved'), false,
    'a residual status:Locked must NOT read as a clean unlocked state');
  assert.equal(lockStateMatches(residue, true, 'Locked'), false,
    'a missing lockoutEnd must NOT read as a fully locked state either');
  // both halves consistent
  assert.equal(lockStateMatches({ lockoutEnd: null, status: 'Approved' }, false, 'Approved'), true);
  assert.equal(lockStateMatches({ lockoutEnd: future, status: 'Locked' }, true, 'Locked'), true);
});

test('lockStateMatches honours a DERIVED resting status, not a hardcoded Approved', () => {
  // A future lockable rep resting in some other status must not be silently reset to Approved.
  const user = { lockoutEnd: null, status: 'EmailUnconfirmed' };
  assert.equal(lockStateMatches(user, false, 'EmailUnconfirmed'), true);
  assert.equal(lockStateMatches(user, false, 'Approved'), false);
});

test('no rep key is duplicated and the lockable rep has its own email', () => {
  const keys = REPS.map((r) => r.rep_key);
  assert.equal(new Set(keys).size, keys.length);
  const emails = REPS.map((r) => String(r.email).toLowerCase());
  assert.equal(new Set(emails).size, emails.length);
});
