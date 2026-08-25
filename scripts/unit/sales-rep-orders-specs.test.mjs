/**
 * Unit tests for scripts/seed-data/sales-rep/sales-rep-orders-specs.mjs — the ROLLING-WINDOW rule
 * behind SR-CP-057 / SR-HD-048.
 *
 * Pure logic only: no network, no env, no fs. `now` is injected everywhere, because the whole point
 * of the module is that the fixture date is derived from run time rather than committed as a literal
 * — a test that used the real clock would be the same defect in miniature.
 *
 * The VACUITY cases matter more than the presence ones. A rolling-window block that has quietly
 * collapsed to a single status, or to a single org, or whose rows share a total, seeds perfectly
 * green and still leaves both cases unable to fail; that is the failure mode this repo keeps hitting,
 * so each of those has its own test.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  WINDOW_COLUMN, RUNTIME_COLUMNS, aliasNameFor,
  windowDaysFor, windowBounds, isFresh, rollingRows, validateRollingShape,
} from '../seed-data/sales-rep/sales-rep-orders-specs.mjs';

const NOW = new Date('2026-08-25T14:00:00.000Z');
const row = (over = {}) => ({
  order_key: 'SRO-ACME-WIN-NEW', org: 'ORG-001', store: 'B2B-store', status: 'New',
  total: '131.00', items_count: '2', seeded: 'true', [WINDOW_COLUMN]: '7',
  order_id: '', created_date: '', ...over,
});
/** A minimally valid pair: same org, one New + one non-New, distinct totals. */
const validPair = () => [row(), row({ order_key: 'SRO-ACME-WIN-PROC', status: 'Processing', total: '247.00' })];

test('windowDaysFor: only a positive number opts a row in', () => {
  assert.equal(windowDaysFor(row()), 7);
  assert.equal(windowDaysFor(row({ [WINDOW_COLUMN]: '  14 ' })), 14);
  // Blank / absent / 0 / junk all mean "no freshness rule" — NOT "0 days". A 0 would rebuild the
  // order on literally every seed run, which is why it is deliberately not treated as a duration.
  for (const v of ['', '   ', undefined, '0', '-3', 'soon', 'NaN']) {
    assert.equal(windowDaysFor(row({ [WINDOW_COLUMN]: v })), null, `expected null for ${JSON.stringify(v)}`);
  }
  assert.equal(windowDaysFor({}), null);
  assert.equal(windowDaysFor(undefined), null);
});

test('windowBounds: the window ENDS at now and reaches back windowDays', () => {
  const { from, to } = windowBounds(7, NOW);
  assert.equal(to.toISOString(), NOW.toISOString());
  assert.equal(from.toISOString(), '2026-08-18T14:00:00.000Z');
  // This is the property that makes the fixture seedable at all: createdDate is server-assigned, so
  // only a window containing `now` can ever be filled. A past-only window could not be.
  assert.ok(from < NOW && NOW <= to);
});

test('isFresh: an order created now is inside the window; one older than it is not', () => {
  assert.equal(isFresh('2026-08-25T13:59:00.000Z', 7, NOW), true);
  assert.equal(isFresh('2026-08-19T00:00:00.000Z', 7, NOW), true);
  assert.equal(isFresh('2026-08-16T21:04:18.000Z', 7, NOW), false);   // the real pre-fix ORG-001 order
  assert.equal(isFresh('2026-07-06T18:32:49.000Z', 7, NOW), false);
});

test('isFresh: boundary instants are inclusive at both ends', () => {
  const { from, to } = windowBounds(7, NOW);
  assert.equal(isFresh(from.toISOString(), 7, NOW), true);
  assert.equal(isFresh(to.toISOString(), 7, NOW), true);
  assert.equal(isFresh(new Date(from.getTime() - 1).toISOString(), 7, NOW), false);
});

test('isFresh: a row with no window rule is always fresh; an unreadable date never is', () => {
  assert.equal(isFresh('2020-01-01T00:00:00.000Z', null, NOW), true);
  // Unparsable/missing must read STALE, not fresh: assuming freshness is the SILENT direction — the
  // seeder would leave a stale order in place and the case would assert against an empty window.
  for (const bad of [undefined, null, '', 'not-a-date']) {
    assert.equal(isFresh(bad, 7, NOW), false, `expected stale for ${JSON.stringify(bad)}`);
  }
});

test('aliasNameFor: order key maps to its @td alias name', () => {
  assert.equal(aliasNameFor('SRO-ACME-WIN-NEW'), 'SR_ORDER_ACME_WIN_NEW');
  assert.equal(aliasNameFor('SRO-ACME-WIN-PROC'), 'SR_ORDER_ACME_WIN_PROC');
});

test('rollingRows: selects exactly the opted-in rows', () => {
  const rows = [...validPair(), row({ order_key: 'SRO-ACME-NEW', [WINDOW_COLUMN]: '' })];
  assert.deepEqual(rollingRows(rows).map((r) => r.order_key), ['SRO-ACME-WIN-NEW', 'SRO-ACME-WIN-PROC']);
});

test('validateRollingShape: a well-formed pair is clean', () => {
  assert.deepEqual(validateRollingShape(validPair()), []);
});

test('validateRollingShape: no rolling row at all is a hard problem', () => {
  const problems = validateRollingShape([row({ [WINDOW_COLUMN]: '' })]);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no row declares rolling_window_days/);
});

test('VACUITY: a window holding only New-status orders cannot discriminate', () => {
  // SR-CP-057's card VALUE is New-only while its DELTA is the same window's all-status volume. With
  // only New orders present the two figures coincide, so the assertion passes no matter what the
  // product does — the seeder would still exit 0.
  const rows = [row(), row({ order_key: 'SRO-ACME-WIN-TWO', status: 'New', total: '200.00' })];
  const problems = validateRollingShape(rows);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /no single org has BOTH a New and a non-New/);
  assert.match(problems[0], /ORG-001=\[New, New\]/);
});

test('VACUITY: a window holding no New-status order leaves the card reading 0', () => {
  const rows = [row({ status: 'Processing' }), row({ order_key: 'SRO-ACME-WIN-TWO', status: 'Cancelled', total: '200.00' })];
  assert.match(validateRollingShape(rows)[0], /no single org has BOTH a New and a non-New/);
});

test('VACUITY: New and non-New split ACROSS orgs does not satisfy the rule', () => {
  // Both statuses exist, but no SINGLE org carries both — so no single customer profile can show the
  // value/delta divergence SR-CP-057 asserts. A naive "both statuses present" check would pass here.
  const rows = [row(), row({ order_key: 'SRO-TECH-WIN', org: 'ORG-002', status: 'Processing', total: '247.00' })];
  assert.match(validateRollingShape(rows)[0], /no single org has BOTH a New and a non-New/);
});

test('VACUITY: two in-window orders sharing a total make the KPI decrement unattributable', () => {
  const rows = [row({ total: '150.00' }), row({ order_key: 'SRO-ACME-WIN-PROC', status: 'Processing', total: '150.00' })];
  const problems = validateRollingShape(rows);
  assert.ok(problems.some((p) => /share a total/.test(p)), problems.join('\n'));
});

test('validateRollingShape: seeded=false on a rolling row leaves the window empty', () => {
  const rows = validPair();
  rows[0].seeded = 'false';
  assert.ok(validateRollingShape(rows).some((p) => /seeded=false/.test(p)));
});

test('validateRollingShape: an absurdly wide window is rejected', () => {
  const rows = validPair();
  rows[0][WINDOW_COLUMN] = '365';
  assert.ok(validateRollingShape(rows).some((p) => /wider than a month/.test(p)));
});

test('validateRollingShape: a runtime id committed into the CSV is rejected', () => {
  // The multi-env rule. order_id / created_date are server-assigned and belong in aliases.<env>.json.
  for (const col of RUNTIME_COLUMNS) {
    const rows = validPair();
    rows[0][col] = col === 'order_id' ? 'b01333a5-cf93-461c-b709-7818f68a3332' : '2026-08-25T14:23:12Z';
    const problems = validateRollingShape(rows);
    assert.ok(problems.some((p) => p.includes(`"${col}"`) && /must be BLANK/.test(p)),
      `expected ${col} to be rejected; got ${JSON.stringify(problems)}`);
  }
});
