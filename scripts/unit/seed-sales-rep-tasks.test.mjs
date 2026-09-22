// Unit tests for sales-rep-tasks-specs.mjs PURE DERIVATION logic (VCST-5732).
// Pure — no env, no network. Run: `npm test`
//
// FOURTH RULE scope (`.claude/rules/test-data.md` §FOURTH RULE, test-data-authoring.md §7a):
// this file tests ONLY things whose expected value is derived independently of the thing asserted —
// the relative-date computation, the tri-state group classifier, the create-command builder, the sort
// derivations, and the vacuity gate's ability to FIRE on a perturbed input.
//
// Deliberately NOT here, because `npm run td:validate:sales-rep-tasks` owns it and is strictly
// stronger (it calls the same functions and adds the alias-registry / GUID-leak / expectation-count
// checks on top): the 14 declared task rows, and `divergenceProblems(TASK_SPECS) === []` on the
// committed spec. Restating those would be a diff notification with a test runner attached.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TASK_SPECS, TASK_MARK, GROUP_NAMES,
  dueDate, startOfUtcDay, isOpen, classifyGroup, groupSizes,
  buildCreateCommand, taskName, taskDescription, inCreationOrder, sortOrders, divergenceProblems,
} from '../seed-data/sales-rep/sales-rep-tasks-specs.mjs';

const NOW = new Date('2026-09-17T12:00:00.000Z');
const spec = (over = {}) => ({
  key: 'X', alias: 'A', label: 'x', type: 'Other', priority: 'Normal',
  dueOffsetDays: 0, dueHourUtc: 9, completed: false, creationOrder: 1, ...over,
});

// ── dueDate(): the relative-offset derivation ───────────────────────────────────────────────────

test('dueDate applies the offset in WHOLE UTC DAYS, with the spec hour and a zeroed remainder', () => {
  // Expected value derived independently: epoch arithmetic, not a transcribed ISO string.
  const midnight = Date.UTC(2026, 8, 17); // 2026-09-17T00:00:00Z
  for (const offset of [-9, -5, -1, 0, 1, 3, 7, 14]) {
    for (const hour of [0, 7, 9, 15, 23]) {
      const got = new Date(dueDate(spec({ dueOffsetDays: offset, dueHourUtc: hour }), NOW)).getTime();
      assert.equal(got, midnight + offset * 86400000 + hour * 3600000,
        `offset ${offset} hour ${hour}`);
    }
  }
});

test('dueDate is a function of NOW, not a constant — the same spec moves with the seed instant', () => {
  const s = spec({ dueOffsetDays: 3 });
  const a = dueDate(s, new Date('2026-01-10T23:59:00.000Z'));
  const b = dueDate(s, new Date('2026-06-10T00:01:00.000Z'));
  assert.notEqual(a, b);
  // ...and the gap between the two due dates equals the gap between the two "now"s, to the day.
  const days = (x, y) => Math.round((new Date(x) - new Date(y)) / 86400000);
  assert.equal(days(b, a), days(Date.UTC(2026, 5, 10), Date.UTC(2026, 0, 10)));
});

test('dueDate crosses month and year boundaries by real calendar days', () => {
  assert.equal(dueDate(spec({ dueOffsetDays: 1, dueHourUtc: 0 }), new Date('2026-12-31T18:00:00Z')), '2027-01-01T00:00:00.000Z');
  assert.equal(dueDate(spec({ dueOffsetDays: -1, dueHourUtc: 0 }), new Date('2026-03-01T06:00:00Z')), '2026-02-28T00:00:00.000Z');
});

test('startOfUtcDay truncates to UTC midnight regardless of the time of day', () => {
  for (const t of ['2026-09-17T00:00:00Z', '2026-09-17T12:34:56Z', '2026-09-17T23:59:59.999Z']) {
    assert.equal(startOfUtcDay(new Date(t)).toISOString(), '2026-09-17T00:00:00.000Z');
  }
});

// ── isOpen(): the TRI-STATE the API actually returns ────────────────────────────────────────────

test('isOpen treats null as OPEN — an open task reads back completed:null, not false', () => {
  assert.equal(isOpen({ completed: null }), true);
  assert.equal(isOpen({ completed: undefined }), true);
  assert.equal(isOpen({ completed: false }), true);
  assert.equal(isOpen({ completed: true }), false);
});

// ── classifyGroup(): completion outranks date; boundaries are UTC-midnight-exact ────────────────

test('classifyGroup puts COMPLETION ahead of the date in both directions', () => {
  // completed + due today, and completed + due in the future, must both be "completed".
  assert.equal(classifyGroup({ completed: true, dueDate: '2026-09-17T15:00:00Z' }, NOW), 'completed');
  assert.equal(classifyGroup({ completed: true, dueDate: '2026-09-22T10:00:00Z' }, NOW), 'completed');
  assert.equal(classifyGroup({ completed: true, dueDate: '2026-09-08T16:00:00Z' }, NOW), 'completed');
});

test('classifyGroup splits OPEN tasks at UTC midnight, exactly', () => {
  const at = (iso) => classifyGroup({ completed: null, dueDate: iso }, NOW);
  assert.equal(at('2026-09-16T23:59:59.999Z'), 'overdue');
  assert.equal(at('2026-09-17T00:00:00.000Z'), 'today', 'the first instant of today is TODAY, not overdue');
  assert.equal(at('2026-09-17T23:59:59.999Z'), 'today');
  assert.equal(at('2026-09-18T00:00:00.000Z'), 'future', 'the first instant of tomorrow is FUTURE, not today');
});

test('classifyGroup accepts a SPEC (relative offset) as well as a live task (absolute date)', () => {
  for (const [offset, group] of [[-1, 'overdue'], [0, 'today'], [1, 'future']]) {
    assert.equal(classifyGroup(spec({ dueOffsetDays: offset }), NOW), group);
    assert.equal(
      classifyGroup({ completed: null, dueDate: dueDate(spec({ dueOffsetDays: offset }), NOW) }, NOW),
      group,
      'spec and live forms must classify identically',
    );
  }
});

test('groupSizes counts live rows whose completed is null the same as a spec whose completed is false', () => {
  const live = TASK_SPECS.map((s) => ({
    completed: s.completed ? true : null,          // the shape the API actually returns
    dueDate: dueDate(s, NOW),
  }));
  assert.deepEqual(groupSizes(live, NOW), groupSizes(TASK_SPECS, NOW));
  // …and every row lands in exactly one group.
  const sizes = groupSizes(live, NOW);
  assert.equal(GROUP_NAMES.reduce((n, g) => n + sizes[g], 0), TASK_SPECS.length);
});

test('groupSizes re-partitions when the clock rolls past UTC midnight (the DECAY the fixture warns about)', () => {
  // The decay acts on ALREADY-PERSISTED absolute dates: the rows were seeded at NOW and keep their
  // instants, while the "today" boundary moves. (Re-deriving the specs at the later instant would
  // re-seed them and show nothing — which is exactly why the fixture must be re-seeded, not re-read.)
  const persisted = TASK_SPECS.map((s) => ({ completed: s.completed ? true : null, dueDate: dueDate(s, NOW) }));
  const today = groupSizes(persisted, NOW);
  const tomorrow = groupSizes(persisted, new Date(NOW.getTime() + 86400000));
  assert.equal(tomorrow.overdue, today.overdue + today.today, "yesterday's due-today tasks become overdue, silently");
  assert.equal(tomorrow.completed, today.completed, 'completion is date-independent');
  assert.equal(new Set(GROUP_NAMES.map((g) => today[g])).size, 4, 'at the seed instant all four sizes differ');
  assert.ok(
    new Set(GROUP_NAMES.map((g) => tomorrow[g])).size < 4,
    'one UTC day later the sizes COLLIDE — which is precisely why a suite asserting group sizes must re-seed',
  );
});

// ── buildCreateCommand(): the seeder's whole payload derivation ─────────────────────────────────

test('buildCreateCommand emits name/description/type/priority/dueDate and NO completed field', () => {
  const s = spec({ key: 'K7', label: 'Kilo something', type: 'Order Review', priority: 'High', dueOffsetDays: 2, dueHourUtc: 8, completed: true });
  const cmd = buildCreateCommand(s, NOW);
  assert.deepEqual(Object.keys(cmd).sort(), ['description', 'dueDate', 'name', 'priority', 'type']);
  assert.equal('completed' in cmd, false, 'createSalesRepTask has no completed input — completion is a SECOND call');
  assert.equal(cmd.name, `${TASK_MARK} Kilo something`);
  assert.equal(cmd.name, taskName(s));
  assert.equal(cmd.description, taskDescription(s));
  assert.equal(cmd.type, 'Order Review');
  assert.equal(cmd.priority, 'High');
  assert.equal(cmd.dueDate, dueDate(s, NOW));
});

test('every built name carries the AGENT-TEST-TASK teardown prefix, so the sweep is exact', () => {
  for (const s of TASK_SPECS) {
    assert.ok(buildCreateCommand(s, NOW).name.startsWith(`${TASK_MARK} `), s.key);
  }
});

// ── sort derivations ────────────────────────────────────────────────────────────────────────────

test('inCreationOrder is a stable permutation ordered by creationOrder, not declaration order', () => {
  const got = inCreationOrder(TASK_SPECS).map((s) => s.creationOrder);
  assert.deepEqual(got, [...got].sort((a, b) => a - b));
  assert.equal(new Set(got).size, TASK_SPECS.length);
  assert.notDeepEqual(inCreationOrder(TASK_SPECS).map((s) => s.key), TASK_SPECS.map((s) => s.key));
});

test('sortOrders orders by NAME, by DUE INSTANT and by CREATION independently', () => {
  const o = sortOrders(TASK_SPECS, NOW);
  const byKey = Object.fromEntries(TASK_SPECS.map((s) => [s.key, s]));
  // by name: monotonically non-decreasing on the built name
  const names = o.byName.map((k) => taskName(byKey[k]));
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  // by due: monotonically non-decreasing on the derived instant
  const dues = o.byDue.map((k) => new Date(dueDate(byKey[k], NOW)).getTime());
  assert.deepEqual(dues, [...dues].sort((a, b) => a - b));
  // by creation: matches inCreationOrder
  assert.deepEqual(o.byCreation, inCreationOrder(TASK_SPECS).map((s) => s.key));
});

// ── divergenceProblems(): the vacuity gate must FIRE, not merely stay quiet ─────────────────────
// These are mutation tests: each perturbs the input and asserts the gate reports it. Asserting that
// the COMMITTED spec passes is the drift guard's job, not this file's.

const mutate = (key, over) => TASK_SPECS.map((s) => (s.key === key ? { ...s, ...over } : s));
const fires = (specs, re) => {
  const ps = divergenceProblems(specs, NOW);
  assert.ok(ps.some((p) => re.test(p)), `expected a problem matching ${re}; got:\n  ${ps.join('\n  ') || '(none)'}`);
};

test('gate fires when two group sizes collide', () => {
  // Move a future task into "today": 5 → 4 future, 3 → 4 today.
  fires(mutate('UP5', { dueOffsetDays: 0 }), /group sizes collide/);
});

test('gate fires when a group empties out', () => {
  fires(TASK_SPECS.filter((s) => classifyGroup(s, NOW) !== 'overdue'), /group "overdue" is EMPTY/);
});

test('gate fires when the completion straddle loses either direction', () => {
  fires(mutate('CP3', { dueOffsetDays: -3 }), /COMPLETED task is due TODAY/);
  fires(mutate('CP4', { dueOffsetDays: -4 }), /COMPLETED task is due in the FUTURE/);
});

test('gate fires when two of the three orders coincide', () => {
  // Re-number creationOrder to follow due-date order exactly.
  const byDue = [...TASK_SPECS].sort((a, b) => new Date(dueDate(a, NOW)) - new Date(dueDate(b, NOW)));
  fires(byDue.map((s, i) => ({ ...s, creationOrder: i + 1 })), /due-date order == creation order/);
});

test('gate fires when the shared calendar day stops being shared', () => {
  fires(mutate('UP4', { dueOffsetDays: 4 }), /no longer carries 2\+ tasks/);
});

test('gate fires when a task lands on a day that was meant to stay empty', () => {
  fires(mutate('UP5', { dueOffsetDays: 9 }), /day offset \+9 was meant to stay EMPTY/);
});

test('gate fires when a type leaves the 8 legitimate salesRepTaskTypes (the server does NOT validate it)', () => {
  fires(mutate('OD1', { type: 'Custome Support' }), /outside the 8 legitimate salesRepTaskTypes/);
});

test('gate fires when a priority leaves the 3 server-validated values', () => {
  fires(mutate('OD1', { priority: 'Urgent' }), /outside the server-validated set/);
});

test('gate fires when priority or type starts correlating with the date group', () => {
  // Make the whole overdue group one priority.
  fires(mutate('OD2', { priority: 'High' }), /group "overdue" carries only 1 distinct priority/);
  fires(mutate('OD2', { type: 'Customer Support' }), /group "overdue" carries only 1 distinct type/);
});

test('gate fires on duplicate keys, names and a broken creationOrder permutation', () => {
  fires(mutate('OD2', { label: TASK_SPECS[0].label }), /duplicate task name/);
  fires(mutate('OD2', { creationOrder: 7 }), /creationOrder must be a 1\.\.14 permutation/);
});
