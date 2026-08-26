/**
 * validate-sales-rep-orders-data.mjs — DRIFT / VACUITY GUARD for the sales-rep order fixtures, and in
 * particular for the ROLLING-WINDOW rows SR-CP-057 and SR-HD-048 depend on.
 *
 * STATIC only (no network). Run as `npm run td:validate:sr-orders`; exits 1 on any hard problem.
 *
 * WHAT IT PROTECTS
 * ----------------
 * 1. No runtime GUID in the committed CSV — the multi-env rule. Order ids are server-assigned and
 *    per-env; the CSV carries only business keys.
 * 2. The rolling-window block can still DISCRIMINATE (validateRollingShape). This is the check that
 *    earns its keep: a window block that quietly collapses to a single status, or to a single org, or
 *    whose rows share a total, still seeds perfectly green while leaving both cases unable to fail.
 *    Absence would have been caught by anyone; VACUITY is what actually happens.
 * 3. Every rolling-window row's org is PINNED in b2b/organizations.csv, so the fixture keeps pointing
 *    at a real org id on every env rather than resolving to nothing.
 * 4. Informational: whether the rolling-window orders are in the window RIGHT NOW on this env. That
 *    is time-dependent, not a drift, so it warns — the fix is to re-run the seeder, not to edit data.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  ORDERS_CSV, WINDOW_COLUMN, windowDaysFor, rollingRows, windowBounds, validateRollingShape, aliasNameFor,
  RECENCY_COLUMN, NEWEST_IN_ORG, newestRows, validateRecencyContracts,
} from './sales-rep-orders-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), { columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true });

const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const PROSE_COLS = new Set(['test_purpose', 'notes']);

const problems = [], notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const rows = readCsv(ORDERS_CSV);
const rolling = rollingRows(rows);
const newest = newestRows(rows);

// 1. No runtime GUID committed.
console.log(`\n[1] ${ORDERS_CSV}: no runtime GUID committed (multi-env rule)`);
let leaks = 0;
for (const r of rows) {
  for (const [col, val] of Object.entries(r)) {
    if (PROSE_COLS.has(col)) continue;
    if (GUID_RE.test(String(val ?? '').trim())) { fail(`row ${r.order_key}: column "${col}" holds a GUID "${val}" — order ids are server-assigned and per-env; keep business keys only`); leaks++; }
  }
}
if (!leaks) ok(`${rows.length} row(s) carry business keys only`);

// 2. The rolling-window block can still discriminate.
console.log(`\n[2] ${ORDERS_CSV}: the ${WINDOW_COLUMN} block can still make SR-CP-057 / SR-HD-048 fail`);
const shape = validateRollingShape(rows);
for (const p of shape) fail(p);
if (!shape.length) {
  ok(`${rolling.length} rolling-window row(s): ${rolling.map((r) => `${r.order_key} (${r.org}, ${r.status}, ${r.total}, ${windowDaysFor(r)}d)`).join(' | ')}`);
  ok('at least one org carries BOTH a New and a non-New in-window order, with distinct totals');
}

// 2b. Declared RECENCY contracts are not contradicted by another row on the same org.
//     This is the check that was missing when SR-GQL-013 broke: SRO-ACME-ELEC's test_purpose claimed
//     "created last => globally most recent", nothing enforced it, and the later SRO-ACME-WIN-* rows
//     quietly took the guarantee away — every row individually well-formed, the PAIR incompatible.
console.log(`\n[2b] ${ORDERS_CSV}: no row's declared ${RECENCY_COLUMN} is contradicted by another row`);
const recency = validateRecencyContracts(rows);
for (const p of recency) fail(p);
if (!recency.length) {
  if (!newest.length) ok(`no row declares ${RECENCY_COLUMN} — nothing to contradict`);
  else {
    ok(`${newest.length} ${NEWEST_IN_ORG} row(s): ${newest.map((r) => `${r.order_key} (${r.org}, ${r.store}, ${r.total})`).join(' | ')}`);
    ok(`each is seeded, carries no ${WINDOW_COLUMN}, is the only maximality claim on its org, and its total is distinct from every rolling-window total there`);
    ok('no row claims global recency in prose without declaring the contract');
  }
}

// 3. Every DATE-CONTRACT org (rolling-window or newest-in-org) is pinned in the org fixture. Both
//    contracts target a specific org, so an unpinned org id drifts per env and the case cannot aim.
const dated = [...new Set([...rolling, ...newest])];
console.log('\n[3] b2b/organizations.csv: every date-contract org is a pinned fixture org');
const orgs = readCsv('test-data/b2b/organizations.csv');
const pinned = new Map(orgs.map((o) => [o.org_id, o.platform_id]));
for (const r of dated) {
  if (!pinned.has(r.org)) fail(`row ${r.order_key}: org "${r.org}" is not in b2b/organizations.csv — the order would be attributed to nothing`);
  else if (!String(pinned.get(r.org) || '').trim()) fail(`row ${r.order_key}: org "${r.org}" has no pinned platform_id — its id would differ per env and the case could not target it`);
}
if (dated.every((r) => pinned.get(r.org))) ok(`orgs pinned: ${[...new Set(dated.map((r) => r.org))].join(', ')}`);

// 4. Are they in the window on this env RIGHT NOW? Time-dependent → a warning, never a hard failure.
const env = process.env.TEST_ENV || 'vcst';
console.log(`\n[4] aliases.${env}.json: rolling-window freshness at this instant (informational)`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
const overlay = existsSync(overlayPath) ? JSON.parse(readFileSync(overlayPath, 'utf8')) : {};
for (const r of rolling) {
  const alias = aliasNameFor(r.order_key);
  const seededAt = overlay[alias]?.createdDate;
  const days = windowDaysFor(r);
  const { from } = windowBounds(days);
  if (!seededAt) { warn(`${r.order_key}: no seeded createdDate recorded on ${env} — run \`TEST_ENV=${env} npm run seed:sales-rep\``); continue; }
  const fresh = Date.parse(seededAt) >= from.getTime();
  if (fresh) ok(`${r.order_key}: created ${seededAt} — inside the ${days}d window (from ${from.toISOString()})`);
  else warn(`${r.order_key}: created ${seededAt} — now OUTSIDE the ${days}d window (from ${from.toISOString()}). SR-CP-057 / SR-HD-048 will read an empty window until \`TEST_ENV=${env} npm run seed:sales-rep\` re-creates it. This is expected ageing, not a data defect.`);
}

// 4b. Is each maximality row still its org's most recent AMONG THE FIXTURES on this env? Comparing
//     the recorded createdDates is a cheap, offline, PARTIAL check — a foreign order (or a fixture
//     with no recorded date) is invisible here, so only the seeder's live Phase-4b pass is
//     authoritative. Time-dependent → warns, never fails.
console.log(`\n[4b] aliases.${env}.json: ${NEWEST_IN_ORG} rows still outrank the recorded fixture dates (informational, partial)`);
if (!newest.length) ok(`no ${NEWEST_IN_ORG} row to check`);
for (const r of newest) {
  const at = overlay[aliasNameFor(r.order_key)]?.createdDate;
  if (!at) { warn(`${r.order_key}: no seeded createdDate recorded on ${env} — add its @td alias and/or run \`TEST_ENV=${env} npm run seed:sales-rep\` (until then only the live seeder pass can confirm the contract)`); continue; }
  const rivals = rows
    .filter((o) => o.order_key !== r.order_key && o.org === r.org)
    .map((o) => [o.order_key, overlay[aliasNameFor(o.order_key)]?.createdDate])
    .filter(([, d]) => d);
  const ahead = rivals.filter(([, d]) => Date.parse(d) >= Date.parse(at));
  if (!rivals.length) warn(`${r.order_key}: created ${at} — no other ${r.org} fixture has a recorded date, so this check proves nothing; the live seeder pass is the real guarantee`);
  else if (!ahead.length) ok(`${r.order_key}: created ${at} — ahead of every recorded ${r.org} fixture date (${rivals.map(([k]) => k).join(', ')})`);
  else warn(`${r.order_key}: created ${at} — OUTRANKED on ${env} by ${ahead.map(([k, d]) => `${k}@${d}`).join(', ')}. SR-GQL-013's allStores assertion will FAIL until \`TEST_ENV=${env} npm run seed:sales-rep\` re-posts it. This is what REG-2026-08-26-1631 hit.`);
}

console.log('\n=== sales-rep orders drift/vacuity check ===');
console.log(`  ${ORDERS_CSV} rows: ${rows.length} (${rolling.length} rolling-window, ${newest.length} ${NEWEST_IN_ORG}) | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nSales-rep orders OK — no GUID leakage; the rolling-window block can still discriminate; no recency contract is contradicted.');
process.exit(0);
