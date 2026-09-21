#!/usr/bin/env node
/**
 * validate-sales-rep-tasks-data.mjs — STATIC drift guard for the Sales Rep TASK fixtures (VCST-5732).
 * No network, no env writes. Run: npm run td:validate:sales-rep-tasks
 *
 * This guard is a VACUITY guard first and a hygiene guard second, because every way this fixture set
 * can die is a one-line edit that still seeds and still resolves. Each check below names the question
 * that becomes UNDECIDABLE when it fails.
 *
 *  [1] The design contract (`divergenceProblems()`): all four group sizes DIFFER, completion straddles
 *      the date boundary in BOTH directions, name/due/creation orders are mutually different, one
 *      shared calendar day + a run of empty ones, priority and type spread across every group.
 *  [2] Every `type` is drawn from the 8 legitimate `salesRepTaskTypes` values — the server does NOT
 *      validate `type`, so a typo seeds at HTTP 200 and simply matches no filter.
 *  [3] Every `priority` is one of the 3 server-validated values.
 *  [4] Due dates are RELATIVE OFFSETS, never literal dates (a literal is a hardcode with a delay fuse).
 *  [5] Every owned alias is registered in the committed test-data/aliases.json.
 *  [6] Each task alias's committed business fields match the spec EXACTLY, and its runtime fields
 *      (`id`, `due_date`) are EMPTY in the committed base — they come from aliases.<env>.json.
 *  [7] No runtime platform GUID leaked into the committed base for these aliases (DV-021).
 *  [8] The SR_TASK_GROUPS expectation alias's counts equal the sizes DERIVED from the spec rows — so
 *      a suite reading @td(SR_TASK_GROUPS.open_today) can never disagree with what the seeder creates.
 *  [9] The decay warning is present in the alias `_notes` (the group sizes expire at UTC midnight;
 *      a suite that asserts them without re-seeding asserts the wrong number, silently).
 * [10] No password / credential literal anywhere in the spec module or these aliases.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TASK_SPECS, TASK_MARK, TASK_TYPES, TASK_PRIORITIES, GROUPS_ALIAS, OWNED_ALIASES, GUID_RE,
  GROUP_NAMES, SHARED_DAY_OFFSET, EMPTY_DAY_OFFSETS,
  taskName, groupSizes, divergenceProblems, dueDate, sortOrders, expectedTotal,
} from './sales-rep-tasks-specs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..');
const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

// A fixed reference instant keeps the guard deterministic in CI. It is deliberately NOT "now":
// a guard that changes verdict at midnight is a flaky gate.
const REF = new Date('2026-09-17T12:00:00.000Z');

// [1] the design contract ----------------------------------------------------
for (const p of divergenceProblems(TASK_SPECS, REF)) fail(`design contract: ${p}`);
const sizes = groupSizes(TASK_SPECS, REF);
notes.push(`group sizes ${GROUP_NAMES.map((g) => `${g}=${sizes[g]}`).join(' ')} (all distinct, total ${expectedTotal()})`);
const orders = sortOrders(TASK_SPECS, REF);
notes.push(`sort divergence: name[${orders.byName.slice(0, 4).join(',')}…] vs due[${orders.byDue.slice(0, 4).join(',')}…] vs created[${orders.byCreation.slice(0, 4).join(',')}…]`);
notes.push(`shared calendar day +${SHARED_DAY_OFFSET}; empty days +${EMPTY_DAY_OFFSETS.join(', +')}`);

// [2][3][4] per-row contract -------------------------------------------------
for (const s of TASK_SPECS) {
  if (!TASK_TYPES.includes(s.type)) {
    fail(`${s.key}: type "${s.type}" is not one of the 8 salesRepTaskTypes — the server accepts any string, so this would seed silently and match no type filter`);
  }
  if (!TASK_PRIORITIES.includes(s.priority)) {
    fail(`${s.key}: priority "${s.priority}" is outside the server-validated set ${TASK_PRIORITIES.join(' | ')} — createSalesRepTask would reject it`);
  }
  if ('dueDate' in s || 'due' in s) {
    fail(`${s.key}: carries a LITERAL due date. Due dates must stay relative (dueOffsetDays/dueHourUtc) — a literal is correct on the day it was written and silently wrong every day after`);
  }
  if (!Number.isInteger(s.dueOffsetDays)) fail(`${s.key}: dueOffsetDays must be an integer relative day offset`);
  if (typeof s.completed !== 'boolean') fail(`${s.key}: completed must be a boolean in the SPEC (the API's read-back is tri-state null|false|true, but the declaration is not)`);
}

// The derivation itself must stay relative: re-deriving at two different instants must move the dates.
const dayA = dueDate(TASK_SPECS[0], new Date('2026-01-01T00:00:00.000Z'));
const dayB = dueDate(TASK_SPECS[0], new Date('2026-06-01T00:00:00.000Z'));
if (dayA === dayB) fail('dueDate() returned the same instant for two different "now" values — the offsets are no longer relative');

// [5][6][7][10] alias registry ----------------------------------------------
const PASSWORDISH = /password|passwd|pwd/i;
for (const alias of OWNED_ALIASES) {
  const entry = aliases[alias];
  if (!entry) { fail(`alias ${alias} missing from committed test-data/aliases.json`); continue; }
  if (entry._inline !== true) fail(`alias ${alias} must be declared _inline (there is no CSV/JSON fixture file behind it)`);
  if (!entry._notes) fail(`alias ${alias} has no _notes — a consumer cannot tell what it discriminates or when it decays`);
  for (const [k, v] of Object.entries(entry)) {
    if (typeof v === 'string' && GUID_RE.test(v.trim())) {
      fail(`alias ${alias}.${k} carries a runtime platform GUID in the COMMITTED aliases.json — it belongs in aliases.<env>.json (DV-021)`);
    }
    if (PASSWORDISH.test(k) && String(v).trim() && !/^\{\{[A-Z0-9_]+\}\}$/.test(String(v).trim())) {
      fail(`alias ${alias}.${k} carries a password literal — it must be a {{VAR}} token`);
    }
  }
}

for (const s of TASK_SPECS) {
  const entry = aliases[s.alias];
  if (!entry) continue;
  const expected = {
    name: taskName(s),
    type: s.type,
    priority: s.priority,
    due_offset_days: String(s.dueOffsetDays),
    completed: String(s.completed),
  };
  for (const [field, want] of Object.entries(expected)) {
    if (entry[field] !== want) fail(`alias ${s.alias}.${field} = "${entry[field]}" but the spec says "${want}"`);
  }
  for (const runtime of ['id', 'due_date']) {
    if (entry[runtime] !== '') {
      fail(`alias ${s.alias}.${runtime} must be "" in the committed base (got "${entry[runtime]}") — the runtime value comes from the aliases.<env>.json overlay`);
    }
  }
  if (!String(entry.name || '').startsWith(`${TASK_MARK} `)) {
    fail(`alias ${s.alias}.name does not carry the ${TASK_MARK} teardown prefix — the seeder would not sweep it`);
  }
}

// [8] the group-size expectations must equal the DERIVED sizes ---------------
const groups = aliases[GROUPS_ALIAS];
if (groups) {
  const expectedCounts = {
    open_overdue: String(sizes.overdue),
    open_today: String(sizes.today),
    open_future: String(sizes.future),
    completed: String(sizes.completed),
    total: String(expectedTotal()),
  };
  for (const [field, want] of Object.entries(expectedCounts)) {
    if (groups[field] !== want) {
      fail(`alias ${GROUPS_ALIAS}.${field} = "${groups[field]}" but the spec rows derive "${want}" — a case reading @td(${GROUPS_ALIAS}.${field}) would assert a count the seeder never creates`);
    }
  }
  if (groups.shared_day_offset !== String(SHARED_DAY_OFFSET)) {
    fail(`alias ${GROUPS_ALIAS}.shared_day_offset = "${groups.shared_day_offset}" but the spec says "${SHARED_DAY_OFFSET}"`);
  }
  if (groups.empty_day_offsets !== EMPTY_DAY_OFFSETS.join(',')) {
    fail(`alias ${GROUPS_ALIAS}.empty_day_offsets = "${groups.empty_day_offsets}" but the spec says "${EMPTY_DAY_OFFSETS.join(',')}"`);
  }
  for (const runtime of ['seeded_at', 'decays_at_utc', 'owner_rep_email']) {
    if (groups[runtime] !== '') {
      fail(`alias ${GROUPS_ALIAS}.${runtime} must be "" in the committed base (got "${groups[runtime]}") — it is per-env/per-run and belongs in aliases.<env>.json`);
    }
  }
  // [9] the decay warning must survive an edit of the notes.
  if (!/decay|midnight|re-seed/i.test(String(groups._notes || ''))) {
    fail(`alias ${GROUPS_ALIAS}._notes lost the DECAY warning — these counts expire at the next UTC midnight and a suite that asserts them without re-seeding asserts the wrong number, silently`);
  }
}

// [10] no credential literal in the spec module itself
const specSrc = readFileSync(join(HERE, 'sales-rep-tasks-specs.mjs'), 'utf8');
for (const m of specSrc.matchAll(/password\s*[:=]\s*['"]([^'"]+)['"]/gi)) {
  if (!/^\{\{[A-Z0-9_]+\}\}$/.test(m[1])) fail(`sales-rep-tasks-specs.mjs carries a password literal ("${m[1]}") — credentials resolve from .env.local only`);
}
if (/https?:\/\/[a-z0-9.-]*govirto\.com/i.test(specSrc)) {
  fail('sales-rep-tasks-specs.mjs hardcodes an environment host — BACK_URL comes from the layered .env loader');
}

// ---- report ----------------------------------------------------------------
console.log('sales-rep TASK fixtures — static drift guard');
for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`  OK — ${TASK_SPECS.length} task spec(s), ${OWNED_ALIASES.length} alias(es), design contract intact.`);
