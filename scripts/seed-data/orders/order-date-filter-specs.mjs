/**
 * order-date-filter-specs.mjs — single source of truth for the /account/orders date-range filter
 * fixture (VCST-5097, suite 014 ORD-084/085/086/088/089/091/094).
 *
 * Side-effect free apart from reading the committed fixture: the DATA lives in
 * test-data/orders/order-date-filter.json (business keys only); this module holds the RULES the
 * seeder and the drift guard share — the non-vacuity contract, the calendar-day arithmetic, and the
 * placement decision (which day group a run may create now).
 *
 * Why placement exists: CustomerOrder.createdDate is server-assigned on POST and PUT (KB-971BC129,
 * re-measured on vcst 2026-11-26), so two distinct days can only be two real seed days. Groups are
 * placed in `dayOrder`, one per run, each >= minDayGapHours after the previous group, inside the
 * month relation the fixture declares.
 *
 * "Same calendar day" is judged in EVERY time zone (UTC-12 … UTC+14, 15-minute steps): the storefront
 * renders dates in the browser's zone, which the fixture cannot know. A 24 h gap between groups makes
 * their days differ in any zone; a group created within seconds shares one day in every zone unless
 * the run straddles a local midnight, which groupDayProblems() reports.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const FIXTURE_REL = 'test-data/orders/order-date-filter.json';
export const FIXTURE_ALIAS_JSON = 'orders/order-date-filter';
export const ALIAS = 'ORD_DATE_FILTER_BUYER';
export const SEED_SCRIPT = 'seed:order-date-filter';

export function loadFixture(root = ROOT) {
  return JSON.parse(readFileSync(join(root, FIXTURE_REL), 'utf8'));
}

export const orderNumber = (fx, key) => `${fx.orderPrefix}${key}`;
export const groupNumbers = (fx, g) => fx.days[g].orders.map((o) => orderNumber(fx, o.key));
export const allOrderNumbers = (fx) => fx.dayOrder.flatMap((g) => groupNumbers(fx, g));

// ---- calendar arithmetic ---------------------------------------------------

const HOUR = 3600_000;
/** Every UTC offset in use, in minutes (UTC-12 … UTC+14, 15-minute steps covers :30 and :45 zones). */
export const OFFSETS_MIN = Array.from({ length: (26 * 60) / 15 + 1 }, (_, i) => -12 * 60 + i * 15);

/** YYYY-MM-DD of `instant` at a UTC offset in minutes. */
export const dateAt = (instant, offsetMin = 0) => new Date(Date.parse(instant) + offsetMin * 60_000).toISOString().slice(0, 10);
export const monthAt = (instant, offsetMin = 0) => dateAt(instant, offsetMin).slice(0, 7);

/** Problems when a group's instants do not share ONE calendar day in some time zone. */
export function groupDayProblems(instants) {
  const bad = OFFSETS_MIN.filter((off) => new Set(instants.map((t) => dateAt(t, off))).size > 1);
  return bad.length ? [`orders straddle a local midnight at ${bad.length} UTC offset(s) (e.g. ${fmtOffset(bad[0])})`] : [];
}

/** Problems between an earlier and a later group: gap and month relation, judged in every zone. */
export function relationProblems(fx, earlierInstants, laterInstants) {
  const p = [];
  const lastEarlier = Math.max(...earlierInstants.map(Date.parse));
  const firstLater = Math.min(...laterInstants.map(Date.parse));
  const gapH = (firstLater - lastEarlier) / HOUR;
  if (!(gapH >= fx.minDayGapHours)) p.push(`groups only ${gapH.toFixed(2)} h apart (< ${fx.minDayGapHours} h): their days can coincide in some zone`);
  const months = OFFSETS_MIN.map((off) => [monthAt(earlierInstants[0], off), monthAt(laterInstants[0], off)]);
  if (fx.monthRelation === 'same' && months.some(([a, b]) => a !== b)) p.push('groups fall in different calendar months in some zone (monthRelation: same)');
  if (fx.monthRelation === 'different' && months.some(([a, b]) => a === b)) p.push('groups fall in the same calendar month in some zone (monthRelation: different)');
  return p;
}

const fmtOffset = (m) => `UTC${m < 0 ? '-' : '+'}${String(Math.floor(Math.abs(m) / 60)).padStart(2, '0')}:${String(Math.abs(m) % 60).padStart(2, '0')}`;

// ---- non-vacuity contract (committed fixture) ------------------------------

export function fixtureProblems(fx) {
  const p = [];
  if (!String(fx.orderPrefix || '').startsWith('AGENT-TEST-')) p.push('orderPrefix must start with AGENT-TEST- (teardown sweeps by it)');
  const b = fx.buyer || {};
  if (!/^agent-test-[a-z0-9-]+@/i.test(b.email || '')) p.push('buyer.email must start with agent-test-');
  if (!String(b.firstName || '').startsWith('AGENT-TEST')) p.push('buyer.firstName must start with AGENT-TEST (the member sweep keys on the contact name)');
  if (!/^[A-Z][A-Z0-9_]*$/.test(b.passwordVar || '')) p.push('buyer.passwordVar must be an env var NAME, never a value');
  if (!b.store || !b.currency) p.push('buyer.store and buyer.currency are required');
  const groups = Object.keys(fx.days || {});
  if (JSON.stringify([...(fx.dayOrder || [])].sort()) !== JSON.stringify([...groups].sort())) p.push('dayOrder must list every day group exactly once');
  if (!(fx.minDayGapHours >= 24)) p.push('minDayGapHours must be >= 24 (a shorter gap lets two groups share a day in some zone)');
  if (!['same', 'different'].includes(fx.monthRelation)) p.push('monthRelation must be "same" or "different"');
  const multi = groups.filter((g) => fx.days[g].role === 'multi');
  const single = groups.filter((g) => fx.days[g].role === 'single');
  if (multi.length !== 1 || single.length !== 1 || groups.length !== 2) p.push('exactly two day groups: one role "multi", one role "single"');
  for (const g of multi) if (!(fx.days[g].orders?.length >= 2)) p.push(`${g}: a multi-order day needs >= 2 orders (ORD-084/086 isolate it by count)`);
  for (const g of single) if (fx.days[g].orders?.length !== 1) p.push(`${g}: the single-order day needs EXACTLY 1 order (ORD-085)`);
  if (multi.length === 1 && single.length === 1 && fx.days[multi[0]].orders?.length === fx.days[single[0]].orders?.length) p.push('multi and single day must hold different order counts — equal counts make the filter undecidable');
  const all = groups.flatMap((g) => fx.days[g].orders || []);
  const keys = all.map((o) => o.key);
  if (new Set(keys).size !== keys.length) p.push('order keys must be unique');
  const totals = all.map((o) => o.total);
  if (new Set(totals).size !== totals.length) p.push('order totals must be distinct (each row identifiable on the list)');
  for (const o of all) {
    if (!(o.total > 0)) p.push(`${o.key}: total must be > 0`);
    if (!['New', 'Completed', 'Processing'].includes(o.status)) p.push(`${o.key}: status ${o.status} — use a non-cancelled status so the order is listed`);
  }
  return p;
}

// ---- placement (which group a run creates now) -----------------------------

/**
 * Decide, from the live orders, what this run does with each group.
 *   live:  { [group]: [{ key, createdDate, ok }] }  — the orders found for the group (ok = matches the
 *          fixture: owner, store, currency, total, status). Missing orders are simply absent.
 *   now:   ISO instant of the run.
 * Returns { actions: { [group]: 'keep' | 'create' | 'pending' }, discard: [group…], pendingFrom, reasons }.
 *   keep    — complete, valid, in order: leave it.
 *   create  — (re)create the whole group now (its existing orders are discarded first).
 *   pending — cannot be placed in this run; `pendingFrom` = earliest instant the next run may place it.
 * `discard` lists groups whose existing orders must be deleted (invalid, or invalidated by an earlier rebuild).
 * At most ONE group is created per run: the next one is pending until the gap has passed.
 */
export function planPlacement(fx, live, now) {
  const actions = {}; const discard = new Set(); const reasons = [];
  let prev = null; // instants of the last kept/created group
  let blocked = false; let pendingFrom = null;
  for (const g of fx.dayOrder) {
    const want = fx.days[g].orders.map((o) => o.key);
    const found = live[g] || [];
    const has = (found.length > 0);
    if (blocked) { actions[g] = 'pending'; if (has) discard.add(g); continue; }
    const complete = want.every((k) => found.some((f) => f.key === k && f.ok)) && found.length === want.length;
    const instants = found.map((f) => f.createdDate);
    const valid = complete && groupDayProblems(instants).length === 0 && (!prev || relationProblems(fx, prev, instants).length === 0);
    if (valid) { actions[g] = 'keep'; prev = instants; continue; }
    if (has) { discard.add(g); reasons.push(`${g}: ${complete ? 'out of order / day contract broken' : 'incomplete or differs'} — rebuilt`); }
    const why = prev ? relationProblems(fx, prev, [now]) : [];
    if (why.length) {
      actions[g] = 'pending'; blocked = true;
      const earliest = new Date(Math.max(...prev.map(Date.parse)) + fx.minDayGapHours * HOUR).toISOString();
      // null = never: in a "same" month relation, a group that cannot land in the first group's month
      // even at the earliest gap-satisfying instant needs a teardown + fresh seed.
      const neverSameMonth = fx.monthRelation === 'same' && relationProblems(fx, prev, [earliest]).some((w) => w.includes('month'));
      pendingFrom = neverSameMonth ? null : earliest;
      reasons.push(`${g}: pending — ${why.join('; ')}`);
      continue;
    }
    actions[g] = 'create'; prev = [now]; blocked = true; // one group per run; a later group that exists is discarded above
    pendingFrom = fx.dayOrder.indexOf(g) < fx.dayOrder.length - 1 ? new Date(Date.parse(now) + fx.minDayGapHours * HOUR).toISOString() : null;
  }
  return { actions, discard: [...discard], pendingFrom, reasons };
}

// ---- seeded state (aliases.<env>.json entry) -------------------------------

/** Problems in a seeded overlay entry; `complete` false while a group is still pending (not a problem). */
export function seededStateProblems(fx, s) {
  const p = [];
  if (!s?.user_id) p.push('user_id missing');
  const groups = fx.dayOrder.filter((g) => s?.days?.[g]?.orders);
  for (const g of groups) {
    const d = s.days[g];
    const keys = fx.days[g].orders.map((o) => o.key);
    const missing = keys.filter((k) => !d.orders[k]?.id || !d.orders[k]?.createdDate);
    if (missing.length) { p.push(`${g}: order id/createdDate missing for ${missing.join(', ')}`); continue; }
    const inst = keys.map((k) => d.orders[k].createdDate);
    p.push(...groupDayProblems(inst).map((x) => `${g}: ${x}`));
    if (d.count !== keys.length) p.push(`${g}: count ${d.count} != ${keys.length} orders`);
    if (d.date !== dateAt(inst[0])) p.push(`${g}: date ${d.date} != the orders' UTC date ${dateAt(inst[0])}`);
  }
  for (let i = 1; i < groups.length; i++) {
    const a = fx.days[groups[i - 1]].orders.map((o) => s.days[groups[i - 1]].orders[o.key]?.createdDate).filter(Boolean);
    const b = fx.days[groups[i]].orders.map((o) => s.days[groups[i]].orders[o.key]?.createdDate).filter(Boolean);
    if (a.length && b.length) p.push(...relationProblems(fx, a, b));
  }
  const complete = groups.length === fx.dayOrder.length;
  if (complete !== (s?.status === 'complete')) p.push(`status "${s?.status}" disagrees with ${groups.length}/${fx.dayOrder.length} groups placed`);
  return { problems: p, complete };
}
