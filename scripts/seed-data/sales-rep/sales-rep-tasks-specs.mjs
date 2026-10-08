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
 *
 * ── VCST-6077 EXTENSION (Tasks page redesign, vc-frontend PR #2536) — 8 more rows, 22 total ──────
 * The redesigned page classifies on the CLIENT, in the BROWSER'S LOCAL DAY, and adds two states the
 * rep-scoped GraphQL cannot create. Each row below exists because without it a scenario cannot FAIL:
 *  6. CANCELED — the client derives `canceled` as `isActive === false && completed !== true` ("closed in
 *     the admin app without completing"). Three of them, one per leak direction: past-due (leaks into
 *     Overdue), due today (leaks into the Today scope), future (leaks into Upcoming). Days -3 and +2 carry
 *     ONLY a canceled task, so any calendar dot on them is a defect. Three, not one: one canceled would
 *     tie the dateless count (1), two would tie the overdue count (2) — a mis-wired predicate returning
 *     the canceled set would then show a plausible badge.
 *  7. DATELESS — `dueDate: null`, open. The client chips it "Upcoming" while every dated tab omits it, so
 *     `All − (Upcoming + Overdue + Completed) = canceled + dateless` (Test Model scenario 7 — a PO
 *     decision, NOT an oracle; the expectation is stated in `SR_TASK_GROUPS.all_minus_tabs`).
 *  8. DAY-BOUNDARY rows whose due time is a LOCAL wall-clock time (`dueLocal`) in a ZONE: 00:00 and 23:30
 *     in the BROWSER's zone (resolved at seed time, see `BROWSER_ZONE`), and 23:30 in America/New_York.
 *     For a UTC+ browser the 00:00 row's UTC date is YESTERDAY — a window built in UTC files it under
 *     Overdue. For a UTC− browser the New York 23:30 row's UTC date is TOMORROW.
 *  9. OFF-SCREEN — one open row more than `MAX_GRID_SPAN_DAYS` ahead, so it can never sit on today's
 *     month grid (the date-chip "× when its day is off-screen" fallback).
 *
 * PLATFORM FACTS for the extension (confirmed live on vcst-qa 2026-10-07, TaskManagement REST under the
 * platform API, admin token):
 *  - `POST /api/task-management` (WorkTask body) accepts `dueDate: null` and persists it; the rep's
 *    `salesRepTasks` then returns the row with `dueDate: null`.
 *  - `POST /api/task-management/finish?id=<id>&completed=false` (JSON body `{}` — no body is HTTP 415)
 *    sets `isActive: false, completed: false`, i.e. canceled. The rep still LISTS it, and the rep's
 *    `deleteSalesRepTask` deletes it — so teardown stays symmetric through the rep endpoint.
 *  - A task's `responsibleId` is the rep's CONTACT id (not the user id); a REST-created row must carry
 *    the same `responsibleId` / `organizationId` / `storeId` as a rep-created one or the rep cannot see
 *    it, so the seeder copies them from a row the rep just created.
 *
 * DECAY, restated for the extension: the browser's day ends at LOCAL midnight, not UTC midnight — for a
 * CEST browser that is 22:00Z. The seeder prints the local decay instant and refuses to seed when the
 * design no longer holds at the seed instant (e.g. between 00:00Z and 04:00Z the New York date is still
 * yesterday, and the today/future sizes would collide).
 */

/** Teardown sweeps exactly the rows whose name starts with this. */
export const TASK_MARK = 'AGENT-TEST-TASK';

/** Full task name from a spec (PURE) — the business key the seeder finds/deletes by. */
export const taskName = (spec) => `${TASK_MARK} ${spec.label}`;

/** The description stamped on every seeded row (PURE) — provenance for a human in the back office. */
export const taskDescription = (spec) => `Seeded for ${spec.ticket || 'VCST-5732'} — ${spec.key}`;

/**
 * `zone` placeholder for "the zone the test browser runs in". The spec cannot know it (side-effect-free),
 * so the seeder resolves it at seed time and passes it to every derivation as `tz`.
 */
export const BROWSER_ZONE = 'browser';

/** A UTC-negative zone for the "23:30 local is TOMORROW in UTC" boundary (Test Model scenario 18). */
export const NEGATIVE_OFFSET_ZONE = 'America/New_York';

/**
 * Any two cells of a month grid at most 7 weeks tall are at most 7*7-1 = 48 days apart, so a task more
 * than 48 days ahead can never be on today's grid, whatever the month length or first weekday.
 */
export const MAX_GRID_SPAN_DAYS = 7 * 7 - 1;

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

  // ══ VCST-6077 extension (header §6–9) ══════════════════════════════════════════════════════════
  // ── CANCELED : 3, one per leak direction. Created by the rep, then closed WITHOUT completing via
  //    TaskManagement REST `finish?completed=false` (no rep-side cancel exists). ────────────────────
  { key: 'CN1', alias: 'SR_TASK_CANCELED_KILO',   label: 'Kilo canceled past due',              type: 'Order Processing',           priority: 'Normal', dueOffsetDays: -3, dueHourUtc: 11, completed: false, canceled: true, creationOrder: 19, ticket: 'VCST-6077' },
  { key: 'CN2', alias: 'SR_TASK_CANCELED_LIMA',   label: 'Lima canceled due today',             type: 'Customer Support',           priority: 'High',   dueOffsetDays: 0,  dueHourUtc: 10, completed: false, canceled: true, creationOrder: 16, ticket: 'VCST-6077' },
  { key: 'CN3', alias: 'SR_TASK_CANCELED_HOTEL',  label: 'Hotel canceled due future',           type: 'Content Management',         priority: 'Low',    dueOffsetDays: 2,  dueHourUtc: 14, completed: false, canceled: true, creationOrder: 21, ticket: 'VCST-6077' },

  // ── DATELESS : 1, open. `dueOffsetDays: null` ⇒ dueDate null ⇒ created via TaskManagement REST
  //    (`createSalesRepTask` requires dueDate). ──────────────────────────────────────────────────
  { key: 'ND1', alias: 'SR_TASK_NODATE_INDIA',    label: 'India no due date',                   type: 'Registration Review',        priority: 'Normal', dueOffsetDays: null, dueHourUtc: null, completed: false, creationOrder: 18, ticket: 'VCST-6077' },

  // ── DAY-BOUNDARY : local wall-clock times in a zone (`dueLocal` replaces `dueHourUtc`). ─────────
  // EG1 is "today" in the browser's zone; in UTC (for a UTC+ browser) it is YESTERDAY.
  { key: 'EG1', alias: 'SR_TASK_EDGE_GOLF',       label: 'Golf edge local midnight',            type: 'Order Review',               priority: 'Low',    dueOffsetDays: 0,  dueLocal: '00:00', zone: BROWSER_ZONE,         completed: false, creationOrder: 20, ticket: 'VCST-6077' },
  { key: 'EG2', alias: 'SR_TASK_EDGE_PAPA',       label: 'Papa edge local 2330',                type: 'Pricing and Promotions',     priority: 'Normal', dueOffsetDays: 0,  dueLocal: '23:30', zone: BROWSER_ZONE,         completed: false, creationOrder: 22, ticket: 'VCST-6077' },
  // EG3 is "today 23:30" for a New York browser, "tomorrow" in UTC and for a CEST browser.
  { key: 'EG3', alias: 'SR_TASK_EDGE_QUEBEC',     label: 'Quebec edge new york 2330',           type: 'Other',                      priority: 'High',   dueOffsetDays: 0,  dueLocal: '23:30', zone: NEGATIVE_OFFSET_ZONE, completed: false, creationOrder: 15, ticket: 'VCST-6077' },

  // ── OFF-SCREEN : open, > MAX_GRID_SPAN_DAYS ahead — never on today's month grid. ───────────────
  { key: 'EG4', alias: 'SR_TASK_EDGE_UNIFORM',    label: 'Uniform edge off screen month',       type: 'Order Processing',           priority: 'Low',    dueOffsetDays: 60, dueHourUtc: 10, completed: false, creationOrder: 17, ticket: 'VCST-6077' },
]);

/** The alias that carries the GROUP-SIZE expectations, so no case ever hardcodes a count. */
export const GROUPS_ALIAS = 'SR_TASK_GROUPS';
/** The same expectations, classified in NEGATIVE_OFFSET_ZONE — for a browser switched to that zone. */
export const GROUPS_NY_ALIAS = 'SR_TASK_GROUPS_NY';

/** Every `@td()` alias this fixture set owns. */
export const OWNED_ALIASES = Object.freeze([...TASK_SPECS.map((s) => s.alias), GROUPS_ALIAS, GROUPS_NY_ALIAS]);

// ── ZONED TIME (PURE — Intl only, no env read) ───────────────────────────────────────────────────

function zoneParts(instant, tz) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  return Object.fromEntries(f.formatToParts(instant).filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}

/** `tz`'s UTC offset in ms at `instant` (PURE). */
export function zoneOffsetMs(instant, tz) {
  const p = zoneParts(instant, tz);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - (instant.getTime() - instant.getUTCMilliseconds());
}

/** True when `tz` is a zone Intl can resolve (PURE). */
export function isValidZone(tz) {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
}

/** The instant of local wall-clock y-m-d hh:mm in `tz` (PURE; `d` may overflow the month). */
export function zonedInstant(tz, y, m, d, hh = 0, mm = 0) {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - zoneOffsetMs(new Date(guess), tz);
  return new Date(guess - zoneOffsetMs(new Date(first), tz)); // second pass settles a DST edge
}

/** `now`'s calendar date in `tz` (PURE) — `{ y, m, d }`, month 1-based. */
export function localYmd(now, tz = 'UTC') {
  const p = zoneParts(new Date(now), tz);
  return { y: p.year, m: p.month, d: p.day };
}

/** Start of `now`'s local day in `tz`, shifted by `plusDays` (PURE). */
export function startOfLocalDay(now = new Date(), tz = 'UTC', plusDays = 0) {
  const { y, m, d } = localYmd(now, tz);
  return zonedInstant(tz, y, m, d + plusDays, 0, 0);
}

/** Whole local calendar days from `now` to `instant`, both read in `tz` (PURE). */
export function localDayOffset(instant, now, tz = 'UTC') {
  const a = localYmd(instant, tz); const b = localYmd(now, tz);
  return Math.round((Date.UTC(a.y, a.m - 1, a.d) - Date.UTC(b.y, b.m - 1, b.d)) / 86400000);
}

/** The zone a spec's `dueLocal` is read in (PURE): its own zone, or the browser's `tz`. */
export const resolveZone = (spec, tz = 'UTC') => (!spec.zone || spec.zone === BROWSER_ZONE ? tz : spec.zone);

// ── DERIVATIONS (PURE — these are what the unit tests exercise) ──────────────────────────────────

/**
 * Absolute due instant for a spec, relative to `now` (PURE). `null` for a DATELESS spec.
 * Base rows (`dueHourUtc`) stay UTC, so their group never depends on the seeder's machine.
 * Boundary rows (`dueLocal` + `zone`) are a local wall-clock time on the zone's own "today + offset";
 * `tz` is what `zone: BROWSER_ZONE` resolves to (UTC when the caller does not say).
 */
export function dueDate(spec, now = new Date(), tz = 'UTC') {
  if (spec.dueOffsetDays == null) return null;
  if (spec.dueLocal) {
    const zone = resolveZone(spec, tz);
    const [hh, mm] = spec.dueLocal.split(':').map(Number);
    const { y, m, d } = localYmd(now, zone);
    return zonedInstant(zone, y, m, d + spec.dueOffsetDays, hh, mm).toISOString();
  }
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() + spec.dueOffsetDays);
  d.setUTCHours(spec.dueHourUtc, 0, 0, 0);
  return d.toISOString();
}

/** Start of `now`'s UTC day (PURE) — kept for callers that mean UTC explicitly. */
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
 * The PR #2536 client rule (PURE): canceled = closed without completing. A spec says so with
 * `canceled: true`; a live row with `isActive === false && completed !== true`.
 */
export const isCanceled = (task) => task.completed !== true && (task.canceled === true || task.isActive === false);

/**
 * Which group a task belongs to (PURE):
 * 'completed' | 'canceled' | 'dateless' | 'overdue' | 'today' | 'future'.
 * COMPLETION IS CHECKED FIRST — that ordering IS design property 2. Then canceled (it outranks the
 * date the same way), then dateless, then the date window — the LOCAL day of `tz`.
 * Accepts a live task (`{ completed, isActive, dueDate }`) or a spec (`{ completed, dueOffsetDays… }`).
 */
export function classifyGroup(task, now = new Date(), tz = 'UTC') {
  if (!isOpen(task)) return 'completed';
  if (isCanceled(task)) return 'canceled';
  const iso = 'dueDate' in task ? task.dueDate : dueDate(task, now, tz);
  if (iso == null) return 'dateless';
  const due = new Date(iso);
  if (due < startOfLocalDay(now, tz)) return 'overdue';
  if (due < startOfLocalDay(now, tz, 1)) return 'today';
  return 'future';
}

/** The four DATE/completion groups of the VCST-5732 base contract (design property 5 runs on these). */
export const DATE_GROUP_NAMES = Object.freeze(['overdue', 'today', 'future', 'completed']);
/** Every group, in the order the report prints them. */
export const GROUP_NAMES = Object.freeze([...DATE_GROUP_NAMES, 'canceled', 'dateless']);

/**
 * Group sizes for a collection of tasks or specs (PURE). This is the ORACLE the drift guard and the
 * live reconcile both compare against, so every size is COMPUTED from the rows and never transcribed.
 */
export function groupSizes(tasks = TASK_SPECS, now = new Date(), tz = 'UTC') {
  const out = Object.fromEntries(GROUP_NAMES.map((g) => [g, 0]));
  for (const t of tasks) out[classifyGroup(t, now, tz)] += 1;
  return out;
}

/**
 * The count expectations a case reads through `@td(SR_TASK_GROUPS.*)` (PURE), derived from rows.
 * Chip arithmetic follows the Test Model's reading of PR #2536: Upcoming = open, dated, due today or
 * later (Today ⊂ Upcoming); Overdue = open, dated, before today; Completed; All = every row.
 * `today_scope_excl_canceled` = rows due in the local day, completed included, canceled NOT;
 * `canceled_due_today` is stated separately because whether the Today scope shows a canceled row is
 * not settled. `all_minus_tabs` = canceled + dateless is the PR-code expectation and a PO question.
 */
export function countExpectations(tasks = TASK_SPECS, now = new Date(), tz = 'UTC') {
  const s = groupSizes(tasks, now, tz);
  const lo = startOfLocalDay(now, tz); const hi = startOfLocalDay(now, tz, 1);
  const dueIn = (t) => {
    const iso = 'dueDate' in t ? t.dueDate : dueDate(t, now, tz);
    return iso != null && new Date(iso) >= lo && new Date(iso) < hi;
  };
  const completedDueToday = tasks.filter((t) => classifyGroup(t, now, tz) === 'completed' && dueIn(t)).length;
  const canceledDueToday = tasks.filter((t) => classifyGroup(t, now, tz) === 'canceled' && dueIn(t)).length;
  const upcoming = s.today + s.future;
  return {
    open_overdue: s.overdue, open_today: s.today, open_future: s.future, completed: s.completed,
    canceled: s.canceled, dateless: s.dateless, total: tasks.length,
    chip_upcoming: upcoming, chip_overdue: s.overdue, chip_completed: s.completed, chip_all: tasks.length,
    today_scope_excl_canceled: s.today + completedDueToday, canceled_due_today: canceledDueToday,
    all_minus_tabs: tasks.length - (upcoming + s.overdue + s.completed),
  };
}

/** Total rows this fixture set seeds. */
export const expectedTotal = () => TASK_SPECS.length;

/**
 * How a spec reaches its state (PURE). The rep endpoint cannot create a dateless row or cancel one, so
 * those two steps go through TaskManagement REST with the admin token.
 */
export function provisioningPath(spec) {
  return {
    create: spec.dueOffsetDays == null ? 'admin-rest' : 'rep-graphql',
    complete: spec.completed ? 'rep-graphql' : null,
    cancel: spec.canceled ? 'admin-rest-finish' : null,
  };
}

/** The rep-GraphQL create command for one spec (PURE) — the seeder is a thin resolve → POST over this. */
export function buildCreateCommand(spec, now = new Date(), tz = 'UTC') {
  return {
    name: taskName(spec),
    description: taskDescription(spec),
    type: spec.type,
    priority: spec.priority,
    dueDate: dueDate(spec, now, tz),
  };
}

/**
 * The TaskManagement REST WorkTask body for one spec (PURE). `owner` is copied from a row the rep
 * created in the same run (`responsibleId` is the rep's CONTACT id), so the rep can see the row.
 */
export function buildRestCreateBody(spec, owner, now = new Date(), tz = 'UTC') {
  return {
    ...buildCreateCommand(spec, now, tz),
    isActive: true,
    responsibleId: owner.responsibleId,
    responsibleName: owner.responsibleName,
    organizationId: owner.organizationId,
    storeId: owner.storeId,
  };
}

/** Specs in the order the seeder POSTs them (PURE) — creation order, not declaration order. */
export const inCreationOrder = (specs = TASK_SPECS) =>
  [...specs].sort((a, b) => a.creationOrder - b.creationOrder);

/** Keys ordered by name / by due instant (dateless first) / by creation (PURE) — property 3. */
export function sortOrders(specs = TASK_SPECS, now = new Date(), tz = 'UTC') {
  const at = (s) => { const d = dueDate(s, now, tz); return d == null ? 0 : new Date(d).getTime(); };
  return {
    byName: [...specs].sort((a, b) => taskName(a).localeCompare(taskName(b))).map((s) => s.key),
    byDue: [...specs].sort((a, b) => at(a) - at(b)).map((s) => s.key),
    byCreation: inCreationOrder(specs).map((s) => s.key),
  };
}

/**
 * THE VACUITY GATE (PURE). Returns a list of problems — empty means the fixture set still makes the
 * feature's questions decidable. The drift guard runs this, so a "tidy-up" that collapses any design
 * property fails LOUDLY instead of turning a suite into a vacuous pass.
 *
 * Evaluated at a FIXED reference instant in UTC by default so the guard is deterministic in CI; the
 * seeder re-runs it at the real seed instant in the browser's zone.
 */
export function divergenceProblems(specs = TASK_SPECS, now = new Date('2026-09-17T12:00:00.000Z'), tz = 'UTC') {
  const problems = [];
  // An unresolvable zone would make every derivation below THROW instead of reporting — check first.
  const badZones = specs.filter((s) => s.dueLocal && s.zone !== BROWSER_ZONE && !isValidZone(s.zone));
  if (!isValidZone(tz) || badZones.length) {
    if (!isValidZone(tz)) problems.push(`browser zone "${tz}" is not a valid IANA zone`);
    for (const s of badZones) problems.push(`${s.key} zone "${s.zone}" is neither "${BROWSER_ZONE}" nor a valid IANA zone`);
    return problems;
  }
  const group = (s) => classifyGroup(s, now, tz);

  // [1] every group size differs, and none is empty
  const sizes = groupSizes(specs, now, tz);
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
  const { byName, byDue, byCreation } = sortOrders(specs, now, tz);
  if (byName.join() === byDue.join()) problems.push('name order == due-date order — a sort control that does nothing is undetectable');
  if (byName.join() === byCreation.join()) problems.push('name order == creation order — a sort control that does nothing is undetectable');
  if (byDue.join() === byCreation.join()) problems.push('due-date order == creation order — a sort control that does nothing is undetectable');

  // [4] one shared calendar day, then a run of empty ones — read as LOCAL calendar days of `tz`
  const byOffset = new Map();
  const canceledOnly = new Map(); // day offset → true while every task on it is canceled
  for (const s of specs) {
    const iso = dueDate(s, now, tz);
    if (iso == null) continue;
    const off = localDayOffset(new Date(iso), now, tz);
    byOffset.set(off, (byOffset.get(off) || 0) + 1);
    canceledOnly.set(off, (canceledOnly.get(off) ?? true) && group(s) === 'canceled');
  }
  if ((byOffset.get(SHARED_DAY_OFFSET) || 0) < 2) {
    problems.push(`day offset +${SHARED_DAY_OFFSET} no longer carries 2+ tasks — a multi-task day indicator becomes indistinguishable from a single-task one`);
  }
  for (const off of EMPTY_DAY_OFFSETS) {
    if (byOffset.get(off)) problems.push(`day offset +${off} was meant to stay EMPTY but now carries ${byOffset.get(off)} task(s) — an empty-day indicator becomes untestable`);
  }

  // [5] priority and type do not correlate with the date group (the four base date groups)
  const dated = specs.filter((s) => DATE_GROUP_NAMES.includes(group(s)));
  for (const field of ['priority', 'type']) {
    const groupsFor = new Map();
    for (const s of dated) {
      if (!groupsFor.has(s[field])) groupsFor.set(s[field], new Set());
      groupsFor.get(s[field]).add(group(s));
    }
    const confined = [...groupsFor.entries()].filter(([, gs]) => gs.size < 2).map(([v]) => v);
    for (const g of DATE_GROUP_NAMES) {
      const vals = new Set(dated.filter((s) => group(s) === g).map((s) => s[field]));
      if (vals.size < 2) problems.push(`group "${g}" carries only ${vals.size} distinct ${field} value(s) — ${field} correlates with the date group, so a filter keyed on the wrong field could reproduce it`);
    }
    if (field === 'priority' && confined.length) {
      problems.push(`priority value(s) ${confined.join(', ')} appear in only ONE date group — priority correlates with the date`);
    }
  }

  // [6] VCST-6077: canceled in every leak direction, and a day carrying ONLY canceled tasks
  const canceled = specs.filter((s) => group(s) === 'canceled');
  const leakTarget = { PAST: 'Overdue tab', TODAY: 'Today scope', FUTURE: 'Upcoming tab' };
  for (const [dir, pred] of [['PAST', (o) => o < 0], ['TODAY', (o) => o === 0], ['FUTURE', (o) => o > 0]]) {
    if (!canceled.some((s) => s.dueOffsetDays != null && pred(s.dueOffsetDays))) {
      problems.push(`no CANCELED task is due ${dir} — a canceled row leaking into the ${leakTarget[dir]} cannot be observed`);
    }
  }
  if (![...canceledOnly.values()].some(Boolean)) {
    problems.push('no calendar day carries ONLY canceled tasks — "canceled gets no dot" cannot fail, every canceled day has a legitimate dot');
  }

  // [7] VCST-6077: an open dateless row
  if (!specs.some((s) => s.dueOffsetDays == null && group(s) === 'dateless')) {
    problems.push('no open DATELESS task — the "All − tabs" arithmetic and the dateless "Upcoming" chip cannot be observed');
  }

  // [8] VCST-6077: the local-day boundary rows (open, due today, at a local wall-clock time)
  const edge = (time, zonePred) => specs.find((s) => s.dueOffsetDays === 0 && s.dueLocal === time
    && zonePred(s.zone || BROWSER_ZONE) && !s.completed && !s.canceled);
  if (!edge('00:00', (z) => z === BROWSER_ZONE)) problems.push('no OPEN task due at exactly 00:00 browser-local today — the lower day boundary is untested');
  if (!edge('23:30', (z) => z === BROWSER_ZONE)) problems.push('no OPEN task due at 23:30 browser-local today — the upper day boundary is untested');
  const ny = edge('23:30', (z) => z !== BROWSER_ZONE && isValidZone(z));
  if (!ny) {
    problems.push('no OPEN task due at 23:30 TODAY in a fixed UTC-negative zone — a window built in UTC passes for every UTC+ browser');
  } else {
    const at = new Date(dueDate(ny, now, tz));
    if (zoneOffsetMs(at, ny.zone) >= 0) problems.push(`${ny.key} zone ${ny.zone} is not UTC-negative at the reference instant`);
    const ymd = (z) => Object.values(localYmd(at, z)).join('-');
    if (ymd('UTC') === ymd(ny.zone)) {
      problems.push(`${ny.key} lands on the same calendar date in UTC and in ${ny.zone} — it no longer discriminates a UTC window`);
    }
  }

  // [9] VCST-6077: one open task off today's month grid
  if (!specs.some((s) => s.dueOffsetDays > MAX_GRID_SPAN_DAYS && group(s) === 'future')) {
    problems.push(`no OPEN task more than ${MAX_GRID_SPAN_DAYS} days ahead — the date chip's "off-screen day" fallback cannot be reached`);
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
    if (s.dueOffsetDays !== null && !Number.isInteger(s.dueOffsetDays)) problems.push(`${s.key} dueOffsetDays must be an integer day offset (relative) or null (dateless), got ${s.dueOffsetDays}`);
    if (s.dueOffsetDays != null && !s.dueLocal && !(s.dueHourUtc >= 0 && s.dueHourUtc <= 23)) problems.push(`${s.key} dueHourUtc ${s.dueHourUtc} outside 0..23`);
    if (s.dueLocal && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s.dueLocal)) problems.push(`${s.key} dueLocal "${s.dueLocal}" is not HH:MM`);
    if (s.canceled && s.completed) problems.push(`${s.key} is both canceled and completed — the client rule makes completed win, so it would not be canceled`);
  }
  const orders = specs.map((s) => s.creationOrder).sort((a, b) => a - b);
  if (orders.some((o, i) => o !== i + 1)) problems.push(`creationOrder must be a 1..${specs.length} permutation, got [${orders.join(',')}]`);

  return problems;
}
