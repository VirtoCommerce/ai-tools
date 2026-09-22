/**
 * sales-rep-tasks-specs.mjs — SINGLE SOURCE OF TRUTH for the Sales Rep TASK fixtures (VCST-5732,
 * "[E2E] Sales Rep Task Management").
 *
 * Side-effect-free (no env read, no network, no fs) so the seeder, the drift-guard validator and the
 * unit tests all import it.
 *
 * ── ISOLATION: per REP ACCOUNT ───────────────────────────────────────────────────────────────────
 * Sales-rep tasks are PRIVATE to the rep who owns them — confirmed live on vcptcore-qa1 2026-09-17:
 * a second rep's `salesRepTasks` returns `totalCount: 0` and cannot read, update or delete any of
 * these ids. So this fixture set is isolated **per REP ACCOUNT** (never "isolated" unqualified —
 * `.claude/rules/test-data.md` §DISPOSABLE FIXTURES): it is NOT isolated per run, per suite or per
 * browser lane. Two suites driving the SAME rep account see each other's mutations; serialise them
 * with a re-seed in between, or give the second suite its own rep.
 *
 * ── DECAY WARNING — the group sizes expire at the next UTC MIDNIGHT ──────────────────────────────
 * Every due date is a RELATIVE OFFSET from the seed instant, computed at seed time. The three
 * `dueOffsetDays: 0` tasks (Alpha / Sierra / Delta) stop being "due today" the moment UTC rolls over,
 * at which point they silently become OVERDUE and the designed group sizes 2/3/5/4 become 5/0/5/4.
 * Nothing errors; a filter case simply starts asserting the wrong number.
 * **Any suite that asserts group membership or group size MUST re-seed first.**
 *
 * ── THE DESIGN CONTRACT (`.claude/rules/test-data.md` §SECOND RULE) ──────────────────────────────
 * This set is designed from the chain's question, not from the screen. Every property below is
 * load-bearing, and `divergenceProblems()` — which the drift guard runs — FAILS when any of them
 * collapses:
 *
 *  1. ALL FOUR GROUP SIZES DIFFER (overdue / due-today / future / completed). Equal sizes would let a
 *     filter wired to the wrong predicate return a plausible number and pass.
 *  2. COMPLETION STRADDLES THE DATE BOUNDARY IN BOTH DIRECTIONS — `Tango` is completed AND due today,
 *     `Foxtrot` is completed AND due in the future. Together they prove completion outranks date: a
 *     "today" or "upcoming" list that leaks either one is wired to the date alone. If both completed
 *     tasks sat in the past, "completed" and "past" would be the same partition and undecidable.
 *  3. NAME ORDER, DUE-DATE ORDER AND CREATION ORDER ARE MUTUALLY DIFFERENT. The NATO-alphabet words
 *     are chosen for exactly this — a sort control that silently does nothing must be detectable, and
 *     it is not if two of the three orders coincide.
 *  4. TWO TASKS SHARE ONE CALENDAR DATE (`Romeo` + `Charlie`, today+7) and the SIX DAYS AFTER IT carry
 *     NONE. That is what makes a multi-task day indicator distinguishable from a single-task day, and
 *     an empty day distinguishable from a rendered one.
 *  5. PRIORITY AND TYPE ARE SPREAD ACROSS EVERY GROUP, so neither correlates with the date — a filter
 *     keyed on the wrong field cannot reproduce a date-group's contents by accident.
 *
 * ── PLATFORM FACTS (confirmed live on vcptcore-qa1, 2026-09-17, `/graphql/sales-rep`) ────────────
 *  - `createSalesRepTask` REQUIRES `name` + `dueDate`; it has NO `completed` input, so completion is a
 *    SECOND call to `changeSalesRepTaskStatus`.
 *  - An OPEN task reads back `completed: null`, **not `false`** — every consumer must treat the field
 *    as tri-state (`null` | `false` | `true`). `isOpen()` below is that predicate.
 *  - `priority` is SERVER-VALIDATED against High | Normal | Low.
 *  - `type` is NOT server-validated — the server accepts any string. So the legitimate set is asserted
 *    HERE (against the live `salesRepTaskTypes` enumeration) rather than trusted from the server.
 */

/** Teardown sweeps exactly the rows whose name starts with this. */
export const TASK_MARK = 'AGENT-TEST-TASK';

/** Full task name from a spec (PURE) — the business key the seeder finds/deletes by. */
export const taskName = (spec) => `${TASK_MARK} ${spec.label}`;

/** The description stamped on every seeded row (PURE) — provenance for a human in the back office. */
export const taskDescription = (spec) => `Seeded for VCST-5732 — ${spec.key}`;

/** Server-validated. A value outside this set is rejected by createSalesRepTask. */
export const TASK_PRIORITIES = Object.freeze(['High', 'Normal', 'Low']);

/**
 * The 8 legitimate values the live `salesRepTaskTypes` query enumerates. `type` is NOT server-side
 * validated, so a typo would seed silently and only surface as a filter that matches nothing.
 */
export const TASK_TYPES = Object.freeze([
  'Registration Review',
  'Order Review',
  'Order Processing',
  'Product Catalog Management',
  'Pricing and Promotions',
  'Content Management',
  'Customer Support',
  'Other',
]);

/** A committed fixture must carry NO runtime platform GUID (those live in aliases.<env>.json). */
export const GUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The day offset two tasks deliberately SHARE (multi-task day indicator). */
export const SHARED_DAY_OFFSET = 7;
/** The day offsets immediately after it that MUST carry no task (empty-day indicator). */
export const EMPTY_DAY_OFFSETS = Object.freeze([8, 9, 10, 11, 12, 13]);

/**
 * THE 14 TASKS.
 *
 * `dueOffsetDays` / `dueHourUtc` are RELATIVE — the absolute instant is computed at seed time by
 * `dueDate()`. A literal date here would be a hardcode with a delay fuse: correct on the day it was
 * written and silently wrong every day after.
 *
 * `creationOrder` is the order the seeder POSTs them in, deliberately unrelated to both name order
 * and due-date order (design property 3).
 */
export const TASK_SPECS = Object.freeze([
  // ── OVERDUE (open, due before today) : 2 ───────────────────────────────────────────────────────
  { key: 'OD1', alias: 'SR_TASK_OVERDUE_ZULU',    label: 'Zulu overdue callback Northwind',     type: 'Customer Support',           priority: 'High',   dueOffsetDays: -5, dueHourUtc: 10, completed: false, creationOrder: 7 },
  { key: 'OD2', alias: 'SR_TASK_OVERDUE_MIKE',    label: 'Mike overdue price list review',      type: 'Pricing and Promotions',     priority: 'Low',    dueOffsetDays: -1, dueHourUtc: 9,  completed: false, creationOrder: 2 },

  // ── DUE TODAY (open, due within today UTC) : 3 ────────────────────────────────────────────────
  // These three are what the DECAY WARNING above is about — they expire at the next UTC midnight.
  { key: 'TD1', alias: 'SR_TASK_TODAY_ALPHA',     label: 'Alpha today morning order review',    type: 'Order Review',               priority: 'High',   dueOffsetDays: 0,  dueHourUtc: 7,  completed: false, creationOrder: 12 },
  { key: 'TD2', alias: 'SR_TASK_TODAY_SIERRA',    label: 'Sierra today midday support ping',    type: 'Customer Support',           priority: 'Normal', dueOffsetDays: 0,  dueHourUtc: 12, completed: false, creationOrder: 5 },
  { key: 'TD3', alias: 'SR_TASK_TODAY_DELTA',     label: 'Delta today evening catalog sync',    type: 'Product Catalog Management', priority: 'Low',    dueOffsetDays: 0,  dueHourUtc: 20, completed: false, creationOrder: 9 },

  // ── FUTURE (open, due after today) : 5 ────────────────────────────────────────────────────────
  { key: 'UP1', alias: 'SR_TASK_FUTURE_YANKEE',   label: 'Yankee tomorrow registration',        type: 'Registration Review',        priority: 'Normal', dueOffsetDays: 1,  dueHourUtc: 11, completed: false, creationOrder: 1 },
  { key: 'UP2', alias: 'SR_TASK_FUTURE_BRAVO',    label: 'Bravo in three days processing',      type: 'Order Processing',           priority: 'High',   dueOffsetDays: 3,  dueHourUtc: 15, completed: false, creationOrder: 13 },
  // UP3 + UP4 SHARE one calendar date (design property 4) — two tasks, one day.
  { key: 'UP3', alias: 'SR_TASK_FUTURE_ROMEO',    label: 'Romeo in seven days content am',      type: 'Content Management',         priority: 'Low',    dueOffsetDays: 7,  dueHourUtc: 9,  completed: false, creationOrder: 4 },
  { key: 'UP4', alias: 'SR_TASK_FUTURE_CHARLIE',  label: 'Charlie in seven days content pm',    type: 'Content Management',         priority: 'High',   dueOffsetDays: 7,  dueHourUtc: 17, completed: false, creationOrder: 10 },
  // …and nothing lands on +8..+13, so those days MUST render empty.
  { key: 'UP5', alias: 'SR_TASK_FUTURE_OSCAR',    label: 'Oscar in fourteen days other',        type: 'Other',                      priority: 'Normal', dueOffsetDays: 14, dueHourUtc: 13, completed: false, creationOrder: 6 },

  // ── COMPLETED : 4, straddling the due-date boundary in BOTH directions (design property 2) ─────
  { key: 'CP1', alias: 'SR_TASK_DONE_NOVEMBER',   label: 'November completed past onboard',     type: 'Other',                      priority: 'Normal', dueOffsetDays: -2, dueHourUtc: 12, completed: true,  creationOrder: 11 },
  { key: 'CP2', alias: 'SR_TASK_DONE_ECHO',       label: 'Echo completed past pricing',         type: 'Pricing and Promotions',     priority: 'High',   dueOffsetDays: -9, dueHourUtc: 16, completed: true,  creationOrder: 3 },
  // CP3: completed AND due TODAY — must NOT appear under "today's open tasks".
  { key: 'CP3', alias: 'SR_TASK_DONE_TANGO',      label: 'Tango completed due today',           type: 'Order Review',               priority: 'Low',    dueOffsetDays: 0,  dueHourUtc: 15, completed: true,  creationOrder: 14 },
  // CP4: completed AND due in the FUTURE — must NOT appear under "upcoming".
  { key: 'CP4', alias: 'SR_TASK_DONE_FOXTROT',    label: 'Foxtrot completed due future',        type: 'Registration Review',        priority: 'High',   dueOffsetDays: 5,  dueHourUtc: 10, completed: true,  creationOrder: 8 },
]);

/** The alias that carries the GROUP-SIZE expectations, so no case ever hardcodes a count. */
export const GROUPS_ALIAS = 'SR_TASK_GROUPS';

/** Every `@td()` alias this fixture set owns. */
export const OWNED_ALIASES = Object.freeze([...TASK_SPECS.map((s) => s.alias), GROUPS_ALIAS]);

// ── DERIVATIONS (PURE — these are what the unit tests exercise) ──────────────────────────────────

/**
 * Absolute due instant for a spec, relative to `now` (PURE).
 * UTC throughout: the group boundary the whole fixture rests on is "UTC midnight", so a local-time
 * computation would put a task in a different group depending on the seeder's machine.
 */
export function dueDate(spec, now = new Date()) {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + spec.dueOffsetDays);
  d.setUTCHours(spec.dueHourUtc, 0, 0, 0);
  return d.toISOString();
}

/** Start of `now`'s UTC day (PURE) — the lower boundary of the "due today" group. */
export function startOfUtcDay(now = new Date()) {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/**
 * Tri-state completion predicate (PURE). An OPEN task reads back `completed: null` from this API,
 * NOT `false` — `!task.completed` is the correct test and `task.completed === false` is not.
 */
export const isOpen = (task) => task.completed !== true;

/**
 * Which group a task belongs to (PURE): 'completed' | 'overdue' | 'today' | 'future'.
 * COMPLETION IS CHECKED FIRST — that ordering IS design property 2, and inverting it is exactly the
 * defect Tango and Foxtrot exist to catch.
 * Accepts either a live task (`{ completed, dueDate }`) or a spec (`{ completed, dueOffsetDays }`).
 */
export function classifyGroup(task, now = new Date()) {
  if (!isOpen(task)) return 'completed';
  const due = task.dueDate != null ? new Date(task.dueDate) : new Date(dueDate(task, now));
  const dayStart = startOfUtcDay(now);
  const nextDay = new Date(dayStart.getTime() + 86400000);
  if (due < dayStart) return 'overdue';
  if (due < nextDay) return 'today';
  return 'future';
}

/** The four group names, in the order the report prints them. */
export const GROUP_NAMES = Object.freeze(['overdue', 'today', 'future', 'completed']);

/**
 * Group sizes for a collection of tasks or specs (PURE) — `{ overdue, today, future, completed }`.
 * This is the ORACLE the drift guard and the live reconcile both compare against, so the designed
 * 2 / 3 / 5 / 4 is COMPUTED from the spec rows and never transcribed.
 */
export function groupSizes(tasks = TASK_SPECS, now = new Date()) {
  const out = Object.fromEntries(GROUP_NAMES.map((g) => [g, 0]));
  for (const t of tasks) out[classifyGroup(t, now)] += 1;
  return out;
}

/** Total rows this fixture set seeds. */
export const expectedTotal = () => TASK_SPECS.length;

/** The create command body for one spec (PURE) — the seeder is a thin resolve → POST over this. */
export function buildCreateCommand(spec, now = new Date()) {
  return {
    name: taskName(spec),
    description: taskDescription(spec),
    type: spec.type,
    priority: spec.priority,
    dueDate: dueDate(spec, now),
  };
}

/** Specs in the order the seeder POSTs them (PURE) — creation order, not declaration order. */
export const inCreationOrder = (specs = TASK_SPECS) =>
  [...specs].sort((a, b) => a.creationOrder - b.creationOrder);

/** Keys ordered by name / by due instant / by creation (PURE) — the three orders property 3 needs. */
export function sortOrders(specs = TASK_SPECS, now = new Date()) {
  return {
    byName: [...specs].sort((a, b) => taskName(a).localeCompare(taskName(b))).map((s) => s.key),
    byDue: [...specs].sort((a, b) => new Date(dueDate(a, now)) - new Date(dueDate(b, now))).map((s) => s.key),
    byCreation: inCreationOrder(specs).map((s) => s.key),
  };
}

/**
 * THE VACUITY GATE (PURE). Returns a list of problems — empty means the fixture set still makes the
 * feature's questions decidable. The drift guard runs this, so a "tidy-up" that collapses any design
 * property fails LOUDLY instead of turning a suite into a vacuous pass.
 *
 * Evaluated at a FIXED reference instant by default so the guard is deterministic in CI; the seeder
 * re-runs it at the real seed instant.
 */
export function divergenceProblems(specs = TASK_SPECS, now = new Date('2026-09-17T12:00:00.000Z')) {
  const problems = [];

  // [1] all four group sizes differ
  const sizes = groupSizes(specs, now);
  const values = GROUP_NAMES.map((g) => sizes[g]);
  if (new Set(values).size !== GROUP_NAMES.length) {
    problems.push(`group sizes collide (${GROUP_NAMES.map((g) => `${g}=${sizes[g]}`).join(', ')}) — a filter wired to the wrong predicate would return a plausible count and PASS`);
  }
  for (const g of GROUP_NAMES) {
    if (sizes[g] === 0) problems.push(`group "${g}" is EMPTY — its filter cannot be distinguished from one that returns nothing`);
  }

  // [2] completion straddles the boundary in BOTH directions
  const completed = specs.filter((s) => s.completed);
  const doneToday = completed.filter((s) => s.dueOffsetDays === 0);
  const doneFuture = completed.filter((s) => s.dueOffsetDays > 0);
  if (!doneToday.length) problems.push('no COMPLETED task is due TODAY — nothing proves completion outranks the date for the "today" list');
  if (!doneFuture.length) problems.push('no COMPLETED task is due in the FUTURE — nothing proves completion outranks the date for the "upcoming" list');

  // [3] name / due / creation orders mutually different
  const { byName, byDue, byCreation } = sortOrders(specs, now);
  if (byName.join() === byDue.join()) problems.push('name order == due-date order — a sort control that does nothing is undetectable');
  if (byName.join() === byCreation.join()) problems.push('name order == creation order — a sort control that does nothing is undetectable');
  if (byDue.join() === byCreation.join()) problems.push('due-date order == creation order — a sort control that does nothing is undetectable');

  // [4] one shared calendar day, then a run of empty ones
  const byOffset = new Map();
  for (const s of specs) byOffset.set(s.dueOffsetDays, (byOffset.get(s.dueOffsetDays) || 0) + 1);
  if ((byOffset.get(SHARED_DAY_OFFSET) || 0) < 2) {
    problems.push(`day offset +${SHARED_DAY_OFFSET} no longer carries 2+ tasks — a multi-task day indicator becomes indistinguishable from a single-task one`);
  }
  for (const off of EMPTY_DAY_OFFSETS) {
    if (byOffset.get(off)) problems.push(`day offset +${off} was meant to stay EMPTY but now carries ${byOffset.get(off)} task(s) — an empty-day indicator becomes untestable`);
  }

  // [5] priority and type do not correlate with the date group
  for (const field of ['priority', 'type']) {
    const groupsFor = new Map();
    for (const s of specs) {
      const g = classifyGroup(s, now);
      if (!groupsFor.has(s[field])) groupsFor.set(s[field], new Set());
      groupsFor.get(s[field]).add(g);
    }
    const confined = [...groupsFor.entries()].filter(([, gs]) => gs.size < 2).map(([v]) => v);
    // Every group must also hold at least two distinct values of the field.
    for (const g of GROUP_NAMES) {
      const vals = new Set(specs.filter((s) => classifyGroup(s, now) === g).map((s) => s[field]));
      if (vals.size < 2) problems.push(`group "${g}" carries only ${vals.size} distinct ${field} value(s) — ${field} correlates with the date group, so a filter keyed on the wrong field could reproduce it`);
    }
    if (field === 'priority' && confined.length) {
      problems.push(`priority value(s) ${confined.join(', ')} appear in only ONE date group — priority correlates with the date`);
    }
  }

  // Hygiene the spec module owns for itself.
  const seenKey = new Set(); const seenAlias = new Set(); const seenName = new Set();
  for (const s of specs) {
    if (seenKey.has(s.key)) problems.push(`duplicate spec key ${s.key}`);
    if (seenAlias.has(s.alias)) problems.push(`duplicate alias ${s.alias}`);
    if (seenName.has(taskName(s))) problems.push(`duplicate task name ${taskName(s)}`);
    seenKey.add(s.key); seenAlias.add(s.alias); seenName.add(taskName(s));
    if (!taskName(s).startsWith(`${TASK_MARK} `)) problems.push(`${s.key} name does not carry the ${TASK_MARK} teardown prefix`);
    if (!TASK_PRIORITIES.includes(s.priority)) problems.push(`${s.key} priority "${s.priority}" is outside the server-validated set ${TASK_PRIORITIES.join(' | ')}`);
    if (!TASK_TYPES.includes(s.type)) problems.push(`${s.key} type "${s.type}" is outside the 8 legitimate salesRepTaskTypes — the server does NOT validate type, so this would seed silently and match no filter`);
    if (!Number.isInteger(s.dueOffsetDays)) problems.push(`${s.key} dueOffsetDays must be an integer day offset (relative), got ${s.dueOffsetDays}`);
    if (!(s.dueHourUtc >= 0 && s.dueHourUtc <= 23)) problems.push(`${s.key} dueHourUtc ${s.dueHourUtc} outside 0..23`);
  }
  const orders = specs.map((s) => s.creationOrder).sort((a, b) => a - b);
  if (orders.some((o, i) => o !== i + 1)) problems.push(`creationOrder must be a 1..${specs.length} permutation, got [${orders.join(',')}]`);

  return problems;
}
