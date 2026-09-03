// Unit tests for the VCST-5733 AUTHORSHIP x ORG-SCOPE fixture matrix (sales-rep-orders-specs.mjs).
// Pure — no env, no network. Run: `npm test`
//
// The tests are written the way the guard has to behave to be worth having: for each rule there is a
// NEGATIVE case that breaks exactly one property and asserts the guard notices. A guard that only
// ever sees the committed (correct) fixture is a rubber stamp — it would pass identically if its body
// were `return []`, which is the failure mode `validateRollingShape`'s history in this repo is about.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  ORDERS_CSV, RUNTIME_COLUMNS,
  CUSTOMER_ROLE_COLUMN, ORDER_NUMBER_COLUMN, ORDER_MARK, orderNumberFor,
  ROLE_REP, customerRoleFor,
  AUTHORSHIP_MATRIX, AUTHORSHIP_ALIASES, AUTHORSHIP_ORDER_KEYS, isAuthorshipRow,
  AUTHORSHIP_CONTROLLED_COLUMNS, authorshipRow, servedOrgKeysFor,
  notServedOrgProblems, authorshipProductSlotProblems, validateAuthorshipShape,
} from '../seed-data/sales-rep/sales-rep-orders-specs.mjs';
import { requiredProductSlots } from '../seed-data/sales-rep/sales-rep-stats-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });

const ROWS = readCsv(ORDERS_CSV);
const ORG_ROWS = readCsv('test-data/b2b/organizations.csv');
const REP_ROWS = readCsv('test-data/sales-rep/sales-reps.csv');
const USER_ROWS = readCsv('test-data/b2b/users.csv');
const CTX = { orgRows: ORG_ROWS, repRows: REP_ROWS, userRows: USER_ROWS, reservedProductSlots: requiredProductSlots() };

/** Deep-ish clone so a negative case can mutate one field without leaking into the next test. */
const clone = (rows) => rows.map((r) => ({ ...r }));
/** Replace the row for a matrix cell with a mutated copy. */
function mutateCell(cellKey, patch) {
  const rows = clone(ROWS);
  const key = AUTHORSHIP_MATRIX[cellKey].orderKey;
  const i = rows.findIndex((r) => r.order_key === key);
  assert.ok(i >= 0, `fixture row ${key} missing`);
  rows[i] = { ...rows[i], ...patch };
  return rows;
}
const problemsFor = (rows) => validateAuthorshipShape(rows, CTX);

// ---------------------------------------------------------------------------
// customerRoleFor — the authorship declaration
// ---------------------------------------------------------------------------
test('customerRoleFor: a BLANK cell is the rep, so adding the column cannot change a legacy row', () => {
  assert.deepEqual(customerRoleFor({}), { kind: ROLE_REP });
  assert.deepEqual(customerRoleFor({ [CUSTOMER_ROLE_COLUMN]: '' }), { kind: ROLE_REP });
  assert.deepEqual(customerRoleFor({ [CUSTOMER_ROLE_COLUMN]: '  ' }), { kind: ROLE_REP });
});

test('customerRoleFor: explicit rep, case-insensitive', () => {
  assert.deepEqual(customerRoleFor({ [CUSTOMER_ROLE_COLUMN]: 'rep' }), { kind: ROLE_REP });
  assert.deepEqual(customerRoleFor({ [CUSTOMER_ROLE_COLUMN]: 'REP' }), { kind: ROLE_REP });
});

test('customerRoleFor: buyer:<user_id> parses and upper-cases the key', () => {
  assert.deepEqual(customerRoleFor({ [CUSTOMER_ROLE_COLUMN]: 'buyer:USR-007' }), { kind: 'buyer', userKey: 'USR-007' });
  assert.deepEqual(customerRoleFor({ [CUSTOMER_ROLE_COLUMN]: 'buyer:usr-007' }), { kind: 'buyer', userKey: 'USR-007' });
});

test('customerRoleFor: an unrecognised value is INVALID, never a silent fallback to the rep', () => {
  // Defaulting to `rep` would attribute a buyer order to the rep and collapse the pair into two
  // identical orders — green everywhere, testing nothing.
  for (const raw of ['buyer', 'buyer:', 'buyer:USR007', 'owner:USR-007', 'nope', 'USR-007']) {
    assert.equal(customerRoleFor({ [CUSTOMER_ROLE_COLUMN]: raw }).kind, 'invalid', `"${raw}" must not parse`);
  }
});

// ---------------------------------------------------------------------------
// order number derivation
// ---------------------------------------------------------------------------
test('orderNumberFor derives the platform number the seeder stamps', () => {
  assert.equal(orderNumberFor('SRO-TF-REP-PLACED'), `${ORDER_MARK}-SRO-TF-REP-PLACED`);
});

test('the committed order_number of every matrix row equals the derived value', () => {
  for (const meta of Object.values(AUTHORSHIP_MATRIX)) {
    const row = ROWS.find((r) => r.order_key === meta.orderKey);
    assert.equal(row[ORDER_NUMBER_COLUMN], orderNumberFor(meta.orderKey));
  }
});

// ---------------------------------------------------------------------------
// matrix identity + runtime-column hygiene
// ---------------------------------------------------------------------------
test('the matrix declares exactly three distinct cells, keys and aliases', () => {
  assert.equal(Object.keys(AUTHORSHIP_MATRIX).length, 3);
  assert.equal(new Set(AUTHORSHIP_ORDER_KEYS).size, 3);
  assert.equal(new Set(AUTHORSHIP_ALIASES).size, 3);
  assert.deepEqual(AUTHORSHIP_ALIASES, ['ORDER_REP_PLACED', 'ORDER_BUYER_PLACED', 'ORDER_NOT_SERVED']);
});

test('isAuthorshipRow recognises the three rows and nothing else', () => {
  assert.ok(isAuthorshipRow({ order_key: 'SRO-TF-REP-PLACED' }));
  assert.ok(isAuthorshipRow({ order_key: 'SRO-EU-NOT-SERVED' }));
  assert.equal(isAuthorshipRow({ order_key: 'SRO-ACME-NEW' }), false);
  assert.equal(isAuthorshipRow({}), false);
});

test('every runtime column is BLANK for every committed row (ids live in aliases.<env>.json)', () => {
  for (const r of ROWS) {
    for (const col of RUNTIME_COLUMNS) {
      assert.equal(String(r[col] ?? '').trim(), '', `row ${r.order_key} column ${col} must be blank in the committed CSV`);
    }
  }
});

test('customer_id is a declared runtime column — the resolver throws on a missing column, so the seeded value needs a real blank one', () => {
  assert.ok(RUNTIME_COLUMNS.includes('customer_id'));
  assert.ok(Object.keys(ROWS[0]).includes('customer_id'));
});

// ---------------------------------------------------------------------------
// THE COMMITTED FIXTURE IS CLEAN
// ---------------------------------------------------------------------------
test('the committed matrix passes its own guard', () => {
  assert.deepEqual(problemsFor(ROWS), []);
});

test('the committed matrix is genuinely one-factor-at-a-time (asserted directly, not only via the guard)', () => {
  const rep = authorshipRow(ROWS, 'repPlaced');
  const buyer = authorshipRow(ROWS, 'buyerPlaced');
  const notServed = authorshipRow(ROWS, 'notServed');
  // authorship arm: same org, controlled columns equal, customer differs
  assert.equal(rep.org, buyer.org);
  for (const c of AUTHORSHIP_CONTROLLED_COLUMNS) assert.equal(rep[c], buyer[c], `controlled column ${c} must match`);
  assert.notEqual(customerRoleFor(rep).kind, customerRoleFor(buyer).kind);
  assert.notEqual(rep.total, buyer.total);
  // org-scope arm: same authorship, controlled columns equal, org differs and is unserved
  assert.equal(customerRoleFor(notServed).kind, ROLE_REP);
  for (const c of AUTHORSHIP_CONTROLLED_COLUMNS) assert.equal(rep[c], notServed[c], `controlled column ${c} must match`);
  assert.notEqual(rep.org, notServed.org);
  assert.ok(!servedOrgKeysFor(REP_ROWS).includes(notServed.org));
});

// ---------------------------------------------------------------------------
// NEGATIVE CASES — one broken property each
// ---------------------------------------------------------------------------
test('BREAKS: the pair moved into different orgs => authorship and org scope are confounded', () => {
  const p = problemsFor(mutateCell('buyerPlaced', { org: 'ORG-003' }));
  assert.ok(p.some((m) => /DIFFERENT orgs/.test(m)), p.join('\n'));
});

test('BREAKS: the buyer row was re-attributed to the rep => the pair collapses into two identical orders', () => {
  const p = problemsFor(mutateCell('buyerPlaced', { [CUSTOMER_ROLE_COLUMN]: 'rep' }));
  assert.ok(p.some((m) => /must be buyer-authored/.test(m)), p.join('\n'));
});

test('BREAKS: a controlled column drifted => a behavioural difference gains a rival explanation', () => {
  for (const [col, val] of [['status', 'Processing'], ['store', 'Electronics'], ['items_count', '3']]) {
    const p = problemsFor(mutateCell('buyerPlaced', { [col]: val }));
    assert.ok(p.some((m) => m.includes(`differ on "${col}"`)), `${col}: ${p.join('\n')}`);
  }
});

test('BREAKS: the pair share a total => a list assertion cannot attribute what it saw', () => {
  const rep = authorshipRow(ROWS, 'repPlaced');
  const p = problemsFor(mutateCell('buyerPlaced', { total: rep.total }));
  assert.ok(p.some((m) => /share total/.test(m)), p.join('\n'));
});

test('BREAKS: the not-served row became buyer-authored => a null is explainable by either dimension', () => {
  const p = problemsFor(mutateCell('notServed', { [CUSTOMER_ROLE_COLUMN]: 'buyer:USR-007' }));
  assert.ok(p.some((m) => /must be rep-authored/.test(m)), p.join('\n'));
});

test('BREAKS: the not-served row moved into a SERVED org => it is visible and asserts nothing', () => {
  const p = problemsFor(mutateCell('notServed', { org: 'ORG-002' }));
  assert.ok(p.some((m) => /same org as/.test(m) || /IS in the rep's served set/.test(m)), p.join('\n'));
});

test('BREAKS: the not-served host is ORG_SUSPENDED => the exclusion has two candidate causes', () => {
  // ORG-006 is Suspended in the committed org fixture. It is the obvious-looking host and is exactly
  // the choice this check exists to refuse: a null there could be the suspension, not the org scope.
  const p = problemsFor(mutateCell('notServed', { org: 'ORG-006' }));
  assert.ok(p.some((m) => /status is "Suspended", not Active/.test(m)), p.join('\n'));
});

test('BREAKS: an authorship row also declares a rolling window or a recency contract => its id churns', () => {
  assert.ok(problemsFor(mutateCell('repPlaced', { rolling_window_days: '7' }))
    .some((m) => /must not also carry a freshness rule/.test(m)));
  assert.ok(problemsFor(mutateCell('repPlaced', { recency_contract: 'newest-in-org' }))
    .some((m) => /must not also carry a maximality contract/.test(m)));
});

test('BREAKS: seeded=false => the alias resolves to an id that does not exist', () => {
  const p = problemsFor(mutateCell('notServed', { seeded: 'false' }));
  assert.ok(p.some((m) => /seeded=false/.test(m)), p.join('\n'));
});

test('BREAKS: a stale order_number => the storefront case fails on the fixture, not the product', () => {
  const p = problemsFor(mutateCell('repPlaced', { [ORDER_NUMBER_COLUMN]: 'AGENT-TEST-SRO-TF-REP-PLACED-OLD' }));
  assert.ok(p.some((m) => m.includes(ORDER_NUMBER_COLUMN)), p.join('\n'));
});

test('BREAKS: a missing matrix row is reported, and the pairwise checks do not crash', () => {
  const rows = ROWS.filter((r) => r.order_key !== AUTHORSHIP_MATRIX.notServed.orderKey);
  const p = problemsFor(rows);
  assert.ok(p.some((m) => m.includes(AUTHORSHIP_MATRIX.notServed.orderKey)), p.join('\n'));
});

test('BREAKS: the buyer is not a member of the pair org => it is not the case the fixture claims', () => {
  // USR-001 is an ACME user, not a TechFlow one.
  const acmeUser = USER_ROWS.find((u) => String(u.org_id || '') === 'ORG-001' && String(u.seeded).toLowerCase() === 'true');
  assert.ok(acmeUser, 'expected at least one seeded ORG-001 user in the b2b fixture');
  const p = problemsFor(mutateCell('buyerPlaced', { [CUSTOMER_ROLE_COLUMN]: `buyer:${acmeUser.user_id}` }));
  assert.ok(p.some((m) => /belongs to org\(s\)/.test(m)), p.join('\n'));
});

test('BREAKS: the buyer key names nobody => the seeder would have to guess an attribution', () => {
  const p = problemsFor(mutateCell('buyerPlaced', { [CUSTOMER_ROLE_COLUMN]: 'buyer:USR-999' }));
  assert.ok(p.some((m) => /not in b2b\/users\.csv/.test(m)), p.join('\n'));
});

// ---------------------------------------------------------------------------
// servedOrgKeysFor / notServedOrgProblems / product slots
// ---------------------------------------------------------------------------
test('servedOrgKeysFor reads the rep fixture at run time and never returns a transcribed list', () => {
  const keys = servedOrgKeysFor(REP_ROWS);
  assert.ok(keys.length >= 2, `expected SR_REP_PRIMARY to serve >=2 orgs, got ${JSON.stringify(keys)}`);
  for (const k of keys) assert.match(k, /^[A-Za-z]{2,5}-\d{2,4}$/);
  // an unknown rep yields nothing, which the guard treats as a HARD failure rather than a skip
  assert.deepEqual(servedOrgKeysFor(REP_ROWS, 'SR_REP_DOES_NOT_EXIST'), []);
  // a `PAGING:12` style served_orgs cell must not leak a pseudo-key
  assert.deepEqual(servedOrgKeysFor([{ rep_key: 'X', served_orgs: 'PAGING:12' }], 'X'), []);
});

test('an empty rep fixture is a hard failure, not a silent pass (the rubber-stamp direction)', () => {
  const p = validateAuthorshipShape(ROWS, { ...CTX, repRows: [] });
  assert.ok(p.some((m) => /rubber stamp/.test(m)), p.join('\n'));
});

test('notServedOrgProblems rejects an unpinned org, a served org, and a non-Active org', () => {
  const served = ['ORG-001', 'ORG-002'];
  assert.deepEqual(notServedOrgProblems('ORG-005', ORG_ROWS, served), []);
  assert.ok(notServedOrgProblems('ORG-002', ORG_ROWS, served).some((m) => /IS in the rep's served set/.test(m)));
  assert.ok(notServedOrgProblems('ORG-006', ORG_ROWS, served).some((m) => /not Active/.test(m)));
  assert.ok(notServedOrgProblems('ORG-NOPE', ORG_ROWS, served).some((m) => /not in b2b\/organizations\.csv/.test(m)));
  assert.ok(notServedOrgProblems('ORG-X', [{ org_id: 'ORG-X', platform_id: '', status: 'Active' }], served)
    .some((m) => /no pinned platform_id/.test(m)));
});

test('product slots are distinct and clear of the slots the stats fixture reserves for its rankings', () => {
  assert.deepEqual(authorshipProductSlotProblems(requiredProductSlots()), []);
  // if the stats fixture ever grows past our slots, the guard must say so rather than let these
  // orders add units/revenue to a product whose BL-SR-008 ranking another case asserts
  const maxSlot = Math.max(...Object.values(AUTHORSHIP_MATRIX).map((m) => m.productSlot));
  assert.ok(authorshipProductSlotProblems(maxSlot + 1).some((m) => /reserved by sales-rep-stats-specs/.test(m)));
});

// ---------------------------------------------------------------------------
// alias registry wiring
// ---------------------------------------------------------------------------
test('each matrix alias is CSV-backed, filtered on its own order_key, and exposes id/number/customerId', () => {
  const registry = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
  for (const meta of Object.values(AUTHORSHIP_MATRIX)) {
    const a = registry[meta.alias];
    assert.ok(a, `alias ${meta.alias} missing`);
    assert.equal(a.file, 'sales-rep/sales-rep-orders');
    assert.equal(a.filter.order_key, meta.orderKey);
    assert.equal(a.fields.id, 'order_id');
    assert.equal(a.fields.customerId, 'customer_id');
    // .number must resolve the FULL platform number, not the bare business key — the older
    // SR_ORDER_* aliases map it to order_key and force every case to prepend the prefix by hand.
    assert.equal(a.fields.number, ORDER_NUMBER_COLUMN);
  }
});
