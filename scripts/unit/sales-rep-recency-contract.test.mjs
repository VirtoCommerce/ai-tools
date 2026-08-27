/**
 * Unit tests for the RECENCY-CONTRACT half of
 * scripts/seed-data/sales-rep/sales-rep-orders-specs.mjs — the rule behind SR-GQL-013
 * ("salesRepCustomers.lastOrder is store-scoped": the GLOBAL lastOrder must be the secondary-store
 * order, so SRO-ACME-ELEC has to be ORG-001's most recent order).
 *
 * Pure logic only: no network, no env, no fs. Dates are injected, never read from the clock — the
 * whole point of the module is that the fixture's instant comes from the server at seed time rather
 * than being committed, and a test that used the real clock would be the same defect in miniature.
 *
 * The CONTRADICTION cases are the ones that earn their keep. Every row involved in the original
 * failure was individually well-formed: ELEC declared its recency in prose, the WIN rows declared a
 * 7-day window, and no existing check looked at the PAIR. That is why SR-GQL-013 failed four
 * consecutive runs while `td:validate:sr-orders` stayed green.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOW_COLUMN, RECENCY_COLUMN, NEWEST_IN_ORG, RECENCY_CONTRACTS, MAXIMALITY_REBUILD_WIRED,
  recencyContractFor, newestRows, claimsRecencyInProse, isStrictlyNewest, validateRecencyContracts,
} from '../seed-data/sales-rep/sales-rep-orders-specs.mjs';

/** The real SRO-ACME-ELEC row, post-fix. */
const elec = (over = {}) => ({
  order_key: 'SRO-ACME-ELEC', org: 'ORG-001', store: 'Electronics', status: 'New',
  total: '99.00', items_count: '1', seeded: 'true',
  [WINDOW_COLUMN]: '', [RECENCY_COLUMN]: NEWEST_IN_ORG, order_id: '', created_date: '',
  test_purpose: 'ACME order on the SECONDARY store (Electronics) — globally most recent',
  ...over,
});
/** The real rolling-window rivals that took the guarantee away. */
const winNew = (over = {}) => ({
  order_key: 'SRO-ACME-WIN-NEW', org: 'ORG-001', store: 'B2B-store', status: 'New',
  total: '131.00', items_count: '2', seeded: 'true',
  [WINDOW_COLUMN]: '7', [RECENCY_COLUMN]: '', order_id: '', created_date: '',
  test_purpose: 'ROLLING WINDOW (7d) — the New-status order SR-CP-057 counts', ...over,
});
const winProc = (over = {}) => winNew({
  order_key: 'SRO-ACME-WIN-PROC', status: 'Processing', total: '247.00',
  test_purpose: 'ROLLING WINDOW (7d) — the NON-New in-window order', ...over,
});
/** The committed fixture set as it now stands. */
const fixture = () => [elec(), winNew(), winProc()];

// ---- parsing ---------------------------------------------------------------

test('recencyContractFor: only a recognised value opts a row in', () => {
  assert.equal(recencyContractFor(elec()), NEWEST_IN_ORG);
  assert.equal(recencyContractFor(elec({ [RECENCY_COLUMN]: '  NEWEST-IN-ORG ' })), NEWEST_IN_ORG);
  // Blank / absent / junk all mean "no contract". A typo must NOT silently become a contract — but
  // it is separately REPORTED by validateRecencyContracts, because silently ignoring it would
  // restore exactly the unenforced-claim state the column exists to end.
  for (const v of ['', '   ', undefined, 'newest', 'most-recent', 'true']) {
    assert.equal(recencyContractFor(elec({ [RECENCY_COLUMN]: v })), null, `expected null for ${JSON.stringify(v)}`);
  }
  assert.equal(recencyContractFor({}), null);
  assert.equal(recencyContractFor(undefined), null);
});

test('newestRows: selects exactly the declaring rows', () => {
  assert.deepEqual(newestRows(fixture()).map((r) => r.order_key), ['SRO-ACME-ELEC']);
  assert.deepEqual(newestRows([winNew(), winProc()]), []);
  assert.deepEqual(newestRows([]), []);
  assert.deepEqual(newestRows(undefined), []);
});

test('claimsRecencyInProse: fires on a recency promise, not on ordinary hydration prose', () => {
  for (const p of ['created last => globally most recent', 'the most recent order', 'globally newest',
    'this is the latest order for the org', 'the NEWEST order']) {
    assert.equal(claimsRecencyInProse({ test_purpose: p }), true, `expected a claim in: ${p}`);
  }
  // SRO-ACME-NEW's real prose says "default recency" — a hydration note, NOT a maximality promise.
  // If this fired the guard would demand a contract on a row that never made the claim.
  for (const p of ['ACME order (New) with 2 line items — hydration (total/currency/itemsCount not 0) + default recency',
    'ROLLING WINDOW (7d) — the New-status order SR-CP-057 counts',
    'ACME order with distinctive customerName token \'Beacon\' — keyword filter',
    '', undefined]) {
    assert.equal(claimsRecencyInProse({ test_purpose: p }), false, `unexpected claim in: ${p}`);
  }
  assert.equal(claimsRecencyInProse({ notes: 'must stay the most recent order' }), true);
});

// ---- the runtime half ------------------------------------------------------

test('isStrictlyNewest: strictly after every rival, and a TIE is not newest', () => {
  const t = '2026-08-26T12:00:00.000Z';
  assert.equal(isStrictlyNewest(t, ['2026-08-25T14:23:29Z', '2026-08-07T13:49:16Z']), true);
  assert.equal(isStrictlyNewest(t, []), true);
  assert.equal(isStrictlyNewest(t, ['2026-08-26T12:00:00.001Z']), false);
  // A tie must rebuild: `lastOrder` picks one of two same-instant orders arbitrarily, so a tie is
  // not a guarantee — treating it as one would make SR-GQL-013 flaky rather than failing.
  assert.equal(isStrictlyNewest(t, [t]), false);
});

test('isStrictlyNewest: the real pre-fix instants — ELEC loses to the rebuilt WIN row', () => {
  // Measured on vcst 2026-08-26; this is the four-run SR-GQL-013 failure, in one assertion.
  assert.equal(isStrictlyNewest('2026-08-07T13:49:16.449387Z', ['2026-08-25T14:23:29.8170837Z']), false);
  // ...and a foreign order nobody declared beats it too (AGENT-TEST-SRO-TZ-VCST-2104-001), which is
  // why the seeder compares against the LIVE order set rather than the CSV.
  assert.equal(isStrictlyNewest('2026-08-07T13:49:16.449387Z', ['2026-08-16T21:04:18.6476309Z']), false);
  // After a re-post it wins.
  assert.equal(isStrictlyNewest('2026-08-26T16:00:00.000Z',
    ['2026-08-25T14:23:29.8170837Z', '2026-08-16T21:04:18.6476309Z']), true);
});

test('isStrictlyNewest: an unreadable candidate is never newest; an unreadable rival is skipped', () => {
  // Unparsable candidate must read "not newest" — rebuild rather than assume. Assuming the contract
  // holds is the SILENT direction: the seeder would leave the fixture outranked and SR-GQL-013 fails.
  for (const bad of [undefined, null, '', 'not-a-date']) {
    assert.equal(isStrictlyNewest(bad, ['2026-01-01T00:00:00Z']), false, `expected false for ${JSON.stringify(bad)}`);
  }
  // An unparsable RIVAL is skipped rather than read as epoch — reading it as epoch would fake a pass.
  assert.equal(isStrictlyNewest('2026-08-26T12:00:00Z', ['nonsense', null, '2026-08-01T00:00:00Z']), true);
  assert.equal(isStrictlyNewest('2026-08-26T12:00:00Z', ['nonsense', '2026-09-01T00:00:00Z']), false);
});

// ---- the static guard ------------------------------------------------------

test('validateRecencyContracts: the committed fixture set is clean', () => {
  assert.deepEqual(validateRecencyContracts(fixture()), []);
});

test('validateRecencyContracts: no contract declared anywhere is clean', () => {
  assert.deepEqual(validateRecencyContracts([winNew(), winProc()]), []);
  assert.deepEqual(validateRecencyContracts([]), []);
  assert.deepEqual(validateRecencyContracts(undefined), []);
});

test('THE ORIGINAL DEFECT: prose promises global recency but no column enforces it', () => {
  // Exactly the pre-fix CSV: ELEC's test_purpose said "created last => globally most recent" and
  // nothing made it true, so appending the WIN rows below it silently took the guarantee away.
  const rows = [elec({ [RECENCY_COLUMN]: '' }), winNew(), winProc()];
  const problems = validateRecencyContracts(rows);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /SRO-ACME-ELEC/);
  assert.match(problems[0], /prose claims global recency/);
  assert.match(problems[0], /row order does not survive a rolling-window rebuild/);
});

test('a typo\'d contract value is reported, never silently ignored', () => {
  const rows = [elec({ [RECENCY_COLUMN]: 'newest' }), winNew(), winProc()];
  const problems = validateRecencyContracts(rows);
  // Two problems: the unrecognised value, AND the now-unenforced prose claim. Both are true.
  assert.ok(problems.some((p) => /is not a recognised contract/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => /prose claims global recency/.test(p)), problems.join('\n'));
  assert.ok(problems.some((p) => p.includes(RECENCY_CONTRACTS.join(', '))));
});

test('CONTRADICTION: two rows on one org cannot both be its newest order', () => {
  const rows = [elec(), elec({ order_key: 'SRO-ACME-ELEC-TWO', total: '77.00' }), winNew(), winProc()];
  const problems = validateRecencyContracts(rows);
  assert.ok(problems.some((p) => /2 rows declare/.test(p) && /only one order can be an org's most recent/.test(p)),
    problems.join('\n'));
});

test('two maximality rows on DIFFERENT orgs are fine — the contract is per-org', () => {
  const rows = [elec(), elec({ order_key: 'SRO-TECH-ELEC', org: 'ORG-002' }), winNew(), winProc()];
  assert.deepEqual(validateRecencyContracts(rows), []);
});

test('a maximality row the seeder never creates cannot be anyone\'s newest order', () => {
  const problems = validateRecencyContracts([elec({ seeded: 'false' }), winNew(), winProc()]);
  assert.ok(problems.some((p) => /seeded=false/.test(p) && /never create it/.test(p)), problems.join('\n'));
});

test('CONTRADICTION: the two date contracts are mutually exclusive on one row', () => {
  // A freshness window wants the row inside a moving span; maximality wants it strictly after
  // everything. Declaring both hides which rule drives the rebuild and makes the row compete
  // with itself.
  const problems = validateRecencyContracts([elec({ [WINDOW_COLUMN]: '7' }), winNew(), winProc()]);
  assert.ok(problems.some((p) => /declares BOTH/.test(p) && /mutually exclusive/.test(p)), problems.join('\n'));
});

test('VACUITY: a maximality row sharing a total with an in-window rival breaks SR-HD-048', () => {
  // The maximality row is re-posted on EVERY run, so it sits inside every rolling window on its org.
  // SR-HD-048 asserts the KPI total drops by exactly the changed order's amount — unattributable if
  // two in-window orders share a total. Nothing about the CSV looks wrong; the arithmetic just stops
  // being falsifiable, which is the failure mode this repo keeps hitting.
  const problems = validateRecencyContracts([elec({ total: '131.00' }), winNew(), winProc()]);
  assert.ok(problems.some((p) => /total 131.00 equals rolling-window row SRO-ACME-WIN-NEW/.test(p)), problems.join('\n'));
  // A rival on a DIFFERENT org shares no window with it, so an equal total there is harmless.
  assert.deepEqual(validateRecencyContracts([elec({ total: '131.00' }), winNew({ org: 'ORG-002' })]), []);
  // ...and an unseeded rival is never created, so it is not a rival at all.
  assert.deepEqual(validateRecencyContracts([elec({ total: '131.00' }), winNew({ seeded: 'false' })]), []);
});

test('check [5] fires only when the seeder\'s maximality re-post pass is NOT wired', () => {
  // The pass and the flag ship together (seed-sales-rep.mjs Phase 4b). While it is wired, a
  // rolling-window rival on the same org is expected and must not be reported — otherwise the
  // committed fixture could never be green. This test pins BOTH directions so the pass cannot be
  // deleted while the flag still claims it exists.
  assert.equal(MAXIMALITY_REBUILD_WIRED, true,
    'if Phase 4b was removed, clear MAXIMALITY_REBUILD_WIRED so check [5] reports the incompatibility');
  assert.ok(!validateRecencyContracts(fixture()).some((p) => /re-post pass is NOT wired/.test(p)));
});
