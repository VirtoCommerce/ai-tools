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

// 3. Every rolling-window org is pinned in the org fixture.
console.log('\n[3] b2b/organizations.csv: every rolling-window org is a pinned fixture org');
const orgs = readCsv('test-data/b2b/organizations.csv');
const pinned = new Map(orgs.map((o) => [o.org_id, o.platform_id]));
for (const r of rolling) {
  if (!pinned.has(r.org)) fail(`row ${r.order_key}: org "${r.org}" is not in b2b/organizations.csv — the order would be attributed to nothing`);
  else if (!String(pinned.get(r.org) || '').trim()) fail(`row ${r.order_key}: org "${r.org}" has no pinned platform_id — its id would differ per env and the case could not target it`);
}
if (!problems.length || rolling.every((r) => pinned.get(r.org))) ok(`orgs pinned: ${[...new Set(rolling.map((r) => r.org))].join(', ')}`);

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

console.log('\n=== sales-rep orders drift/vacuity check ===');
console.log(`  ${ORDERS_CSV} rows: ${rows.length} (${rolling.length} rolling-window) | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nSales-rep orders OK — no GUID leakage; the rolling-window block can still discriminate.');
process.exit(0);
