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
  ORDERS_CSV, RUNTIME_COLUMNS, CUSTOMER_ROLE_COLUMN, ORDER_MARK, orderNumberFor, ROLE_REP, customerRoleFor, AUTHORSHIP_MATRIX, notServedOrgProblems, authorshipProductSlotProblems, validateAuthorshipShape,
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

test('BREAKS: a missing matrix row is reported, and the pairwise checks do not crash', () => {
  const rows = ROWS.filter((r) => r.order_key !== AUTHORSHIP_MATRIX.notServed.orderKey);
  const p = problemsFor(rows);
  assert.ok(p.some((m) => m.includes(AUTHORSHIP_MATRIX.notServed.orderKey)), p.join('\n'));
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
