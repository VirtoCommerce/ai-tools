#!/usr/bin/env node
/**
 * validate-sales-rep-stats-data.mjs — STATIC drift guard for the Sales Rep statistics fixtures.
 * No network, no env writes. Run: npm run td:validate:sales-rep-stats
 *
 * Asserts:
 *  [1] the spec still makes by-units and by-revenue DIVERGE (the whole point of the shaped order),
 *  [2] every spec'd productSlot is satisfiable by `requiredProductSlots()`,
 *  [3] shaped line arithmetic is coherent (total == sum of extended prices, no zero/negative lines),
 *  [4] every OWNED_ALIAS is registered in the committed test-data/aliases.json,
 *  [5] each owned alias's committed business key matches the spec's deterministic value,
 *  [6] NO runtime platform GUID leaked into the committed base aliases.json for these aliases
 *      (they belong in aliases.<env>.json — .claude/rules/test-data.md, DV-021),
 *  [7] every spec'd orgKey exists in test-data/b2b/organizations.csv WITH a pinned platform_id,
 *  [8] the window model is self-consistent (previous windows strictly precede their current window).
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TOP_SELLER_ORDER, CART_FIXTURES, OWNED_ALIASES, GUID_RE,
  cartName, statsOrderNumber, shapedOrderTotal, lineExtended,
  expectedRankings, rankingsDiverge, requiredProductSlots,
  buildStatisticsWindows, COMPARISON_AXES,
} from './sales-rep-stats-specs.mjs';
import {
  ROWCAP_ORDERS, ROWCAP_ALIASES, ROWCAP_REP_KEY, ROWCAP_STORE, ROWCAP_PROFILE_ORG_KEY,
  rowcapOrderNumber, rowcapOrderTotal, rowcapShortfalls, rowcapOrgKeys,
  rowcapOrdersForOrg, rowcapStatuses, rowcapTopSellerSlots,
} from './sales-rep-rowcap-specs.mjs';
import { isDisposableLayoutRep } from './sales-rep-layout-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const problems = [];
const notes = [];
const fail = (m) => problems.push(m);

const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

/** Minimal CSV reader (header row + comma split honoring double quotes). */
function readCsv(rel) {
  const text = readFileSync(join(ROOT, rel), 'utf8').replace(/^﻿/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const split = (line) => {
    const out = []; let cur = ''; let q = false;
    for (const ch of line) {
      if (ch === '"') q = !q;
      else if (ch === ',' && !q) { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur); return out.map((s) => s.trim());
  };
  const head = split(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(split(l).map((v, i) => [head[i], v])));
}

// [1] rankings diverge
if (!rankingsDiverge()) {
  fail('TOP_SELLER_LINES no longer make by-units and by-revenue disagree — the shaped order stops proving BL-SR-008');
} else {
  const r = expectedRankings();
  notes.push(`by-units slots [${r.byUnits}] vs by-revenue slots [${r.byRevenue}] — divergent`);
}

// [2] slots satisfiable
const need = requiredProductSlots();
for (const l of TOP_SELLER_ORDER.lines) {
  if (l.productSlot < 0 || l.productSlot >= need) fail(`top-seller line productSlot ${l.productSlot} outside 0..${need - 1}`);
}
for (const c of CART_FIXTURES) {
  if (c.productSlot < 0 || c.productSlot >= need) fail(`cart ${c.key} productSlot ${c.productSlot} outside 0..${need - 1}`);
}

// [3] line arithmetic
const sum = TOP_SELLER_ORDER.lines.reduce((s, l) => s + lineExtended(l), 0);
if (Math.abs(sum - shapedOrderTotal()) > 0.005) fail(`shapedOrderTotal() ${shapedOrderTotal()} != sum of extended prices ${sum.toFixed(2)}`);
for (const l of TOP_SELLER_ORDER.lines) {
  if (!(l.quantity > 0)) fail(`top-seller line slot ${l.productSlot} has non-positive quantity ${l.quantity}`);
  if (!(l.unitPrice > 0)) fail(`top-seller line slot ${l.productSlot} has non-positive unitPrice ${l.unitPrice}`);
}
for (const c of CART_FIXTURES) {
  if (!(c.quantity > 0)) fail(`cart ${c.key} has non-positive quantity ${c.quantity}`);
}
notes.push(`shaped order total $${shapedOrderTotal()} across ${TOP_SELLER_ORDER.lines.length} lines`);

// [4][5][6] alias registration, business keys, GUID leak
const expectedKey = {
  [TOP_SELLER_ORDER.alias]: { field: 'number', value: statsOrderNumber(TOP_SELLER_ORDER.key) },
  ...Object.fromEntries(CART_FIXTURES.map((c) => [c.alias, { field: 'name', value: cartName(c.key) }])),
};
for (const alias of OWNED_ALIASES) {
  const entry = aliases[alias];
  if (!entry) { fail(`alias ${alias} missing from committed test-data/aliases.json`); continue; }
  const { field, value } = expectedKey[alias];
  if (entry[field] !== value) fail(`alias ${alias}.${field} = "${entry[field]}" but the spec says "${value}"`);
  for (const [k, v] of Object.entries(entry)) {
    if (typeof v === 'string' && GUID_RE.test(v.trim())) {
      fail(`alias ${alias}.${k} carries a runtime platform GUID in the COMMITTED aliases.json — it belongs in aliases.<env>.json (DV-021)`);
    }
  }
  if (entry.id !== '') fail(`alias ${alias}.id must be "" in the committed base (got "${entry.id}") — the runtime id comes from the env overlay`);
}

// [7] orgs pinned
const orgs = Object.fromEntries(readCsv('test-data/b2b/organizations.csv').map((r) => [r.org_id, r]));
for (const key of [TOP_SELLER_ORDER.orgKey, ...CART_FIXTURES.map((c) => c.orgKey)]) {
  const o = orgs[key];
  if (!o) { fail(`orgKey ${key} not found in test-data/b2b/organizations.csv`); continue; }
  if (!o.platform_id) fail(`orgKey ${key} has no pinned platform_id in b2b/organizations.csv — the fixture cannot resolve its org`);
}

// [8] window model coherence
const w = buildStatisticsWindows(new Date('2026-08-03T14:00:00.000Z'));
for (const axis of COMPARISON_AXES) {
  const cur = w[axis.current]; const prev = w[axis.previous];
  if (!cur || !prev) { fail(`comparison axis ${axis.key} references an unknown window`); continue; }
  if (!(prev.to < cur.from)) fail(`axis ${axis.key}: previous window (${prev.from}..${prev.to}) must strictly precede current (${cur.from}..)`);
}
// The Monday-start week + same-day-span month/year semantics, pinned on a known date.
if (w.week.from !== '2026-08-03T00:00:00.000Z') fail(`week start drifted: ${w.week.from} (2026-08-03 is a Monday, so week start == that day)`);
if (w.prevWeek.from !== '2026-07-27T00:00:00.000Z') fail(`prevWeek start drifted: ${w.prevWeek.from}`);
if (w.prevMonth.to !== '2026-07-03T23:59:59.999Z') fail(`prevMonth end drifted: ${w.prevMonth.to} (same day-span in the previous month)`);
if (w.lastYear.to !== '2025-08-03T23:59:59.999Z') fail(`lastYear end drifted: ${w.lastYear.to}`);

// ---- [9] VCST-5649 widget row-cap fixtures ---------------------------------
// Same seeder, same teardown, so the same guard. These checks all exist because the corresponding
// failure is SILENT: an insufficient set makes every "the cap took effect" assertion pass on an
// under-full widget, which is indistinguishable from a working cap.
{
  const shortfalls = rowcapShortfalls();
  for (const s of shortfalls) fail(`row-cap fixture set: ${s}`);

  // Deterministic business keys + line arithmetic.
  const seenKey = new Set();
  for (const o of ROWCAP_ORDERS) {
    if (seenKey.has(o.key)) fail(`row-cap order key ${o.key} is duplicated — the order number is the idempotency key`);
    seenKey.add(o.key);
    if (!rowcapOrderNumber(o.key).startsWith('AGENT-TEST-')) fail(`row-cap order ${o.key} number is not AGENT-TEST- prefixed — teardown would not sweep it`);
    if (!(rowcapOrderTotal(o) > 0)) fail(`row-cap order ${o.key} has a non-positive total`);
    for (const l of o.lines) {
      if (!(l.quantity > 0)) fail(`row-cap order ${o.key} line slot ${l.productSlot} has non-positive quantity`);
      if (!(l.unitPrice > 0)) fail(`row-cap order ${o.key} line slot ${l.productSlot} has non-positive unitPrice`);
    }
  }

  // The row-cap orders must be attributed to the DISPOSABLE-layout rep, never the shared primary —
  // seeding them onto SR_REP_PRIMARY would pollute the ~40 cases pinned to its data shape.
  if (!isDisposableLayoutRep(ROWCAP_REP_KEY)) {
    fail(`row-cap orders are attributed to ${ROWCAP_REP_KEY}, which is NOT in the disposable-layout allowlist — only a disposable rep may carry throwaway fixtures`);
  }
  const repRow = readCsv('test-data/sales-rep/sales-reps.csv').find((r) => r.rep_key === ROWCAP_REP_KEY);
  if (!repRow) fail(`row-cap rep ${ROWCAP_REP_KEY} missing from test-data/sales-rep/sales-reps.csv`);
  else {
    if (String(repRow.seeded).toLowerCase() !== 'true') fail(`row-cap rep ${ROWCAP_REP_KEY} is seeded=false — its orders would have no account to attribute to`);
    if (repRow.store !== ROWCAP_STORE) fail(`row-cap rep ${ROWCAP_REP_KEY} store "${repRow.store}" != the widget store "${ROWCAP_STORE}"`);
    // Every org the fixture set targets must actually be SERVED by the rep, or salesRepOrders
    // filters those orders out and the count silently drops below the cap thresholds.
    const served = new Set(String(repRow.served_orgs || '').split(';').map((s) => s.trim()).filter(Boolean));
    for (const key of rowcapOrgKeys()) {
      if (!served.has(key)) fail(`row-cap orders target ${key} but ${ROWCAP_REP_KEY} does not serve it (served_orgs=${repRow.served_orgs})`);
    }
  }

  // Orgs pinned, aliases registered, no GUID leak in the committed base (DV-021).
  for (const key of rowcapOrgKeys()) {
    const o = orgs[key];
    if (!o) { fail(`row-cap orgKey ${key} not found in test-data/b2b/organizations.csv`); continue; }
    if (!o.platform_id) fail(`row-cap orgKey ${key} has no pinned platform_id in b2b/organizations.csv`);
  }
  for (const [alias, key] of Object.entries(ROWCAP_ALIASES)) {
    if (!ROWCAP_ORDERS.some((o) => o.key === key)) { fail(`alias ${alias} points at unknown row-cap order key ${key}`); continue; }
    const entry = aliases[alias];
    if (!entry) { fail(`alias ${alias} missing from committed test-data/aliases.json`); continue; }
    if (entry.number !== rowcapOrderNumber(key)) fail(`alias ${alias}.number = "${entry.number}" but the spec says "${rowcapOrderNumber(key)}"`);
    if (entry.id !== '') fail(`alias ${alias}.id must be "" in the committed base (got "${entry.id}") — the runtime id comes from the env overlay`);
    for (const [k, v] of Object.entries(entry)) {
      if (typeof v === 'string' && GUID_RE.test(v.trim())) fail(`alias ${alias}.${k} carries a runtime platform GUID in the COMMITTED aliases.json (DV-021)`);
    }
  }

  if (!shortfalls.length) {
    notes.push(`row-cap: ${ROWCAP_ORDERS.length} order(s) for ${ROWCAP_REP_KEY}, ${rowcapOrdersForOrg(ROWCAP_PROFILE_ORG_KEY).length} in ${ROWCAP_PROFILE_ORG_KEY}, statuses [${rowcapStatuses().join(', ')}], ${rowcapTopSellerSlots().length} distinct non-cancelled product slot(s)`);
  }
}

// ---- report ----------------------------------------------------------------
console.log('sales-rep statistics + row-cap fixtures — static drift guard');
for (const n of notes) console.log(`  note: ${n}`);
if (problems.length) {
  console.error(`\nFAILED (${problems.length}):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`  OK — ${OWNED_ALIASES.length} alias(es), ${TOP_SELLER_ORDER.lines.length} shaped line(s), ${CART_FIXTURES.length} cart fixture(s), window model coherent.`);
