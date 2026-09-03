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
  AUTHORSHIP_MATRIX, AUTHORSHIP_ALIASES, AUTHORSHIP_CONTROLLED_COLUMNS, authorshipRow,
  validateAuthorshipShape, customerRoleFor, servedOrgKeysFor,
} from './sales-rep-orders-specs.mjs';
import { requiredProductSlots } from './sales-rep-stats-specs.mjs';

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


// 5. AUTHORSHIP x ORG-SCOPE — the VCST-5733 matrix can still DISCRIMINATE.
//    Same class of check as [2]: every one of these three rows is well-formed on its own, and the
//    fixture is still worthless the moment the RELATIONSHIP between them collapses — the pair drifts
//    into two orgs, or onto one customer, or someone bumps one row's status. None of that is visible
//    row-by-row, and the surface under test would then behave identically whether it authorizes by
//    authorship or by org scope. Same reason td:validate:variation-stock asserts two quantities
//    DIVERGE rather than merely exist.
console.log(`\n[5] ${ORDERS_CSV}: the AUTHORSHIP x ORG-SCOPE matrix can still make VCST-5733 fail`);
const authorship = validateAuthorshipShape(rows, {
  orgRows: orgs,
  repRows: readCsv('test-data/sales-rep/sales-reps.csv'),
  userRows: readCsv('test-data/b2b/users.csv'),
  reservedProductSlots: requiredProductSlots(),
});
for (const p of authorship) fail(p);
if (!authorship.length) {
  const cells = Object.fromEntries(Object.keys(AUTHORSHIP_MATRIX).map((k) => [k, authorshipRow(rows, k)]));
  const served = servedOrgKeysFor(readCsv('test-data/sales-rep/sales-reps.csv'));
  for (const [k, meta] of Object.entries(AUTHORSHIP_MATRIX)) {
    const r = cells[k];
    const role = customerRoleFor(r);
    ok(`${meta.alias} (${r.order_key}): ${r.org} / ${r.store} / ${r.status} / ${r.total} / customer=${role.kind === 'buyer' ? `buyer ${role.userKey}` : 'the rep'} / productSlot ${meta.productSlot}`);
  }
  ok(`AUTHORSHIP isolated: ${cells.repPlaced.order_key} and ${cells.buyerPlaced.order_key} share org ${cells.repPlaced.org} and match on ${AUTHORSHIP_CONTROLLED_COLUMNS.join('/')}, differing ONLY in the customer`);
  ok(`ORG SCOPE isolated: ${cells.notServed.order_key} is rep-authored like ${cells.repPlaced.order_key} but sits in ${cells.notServed.org}, which is NOT in the rep's served set (${served.join(';')}) and whose status is Active (so a null result has exactly one cause)`);
  ok(`product slots ${Object.values(AUTHORSHIP_MATRIX).map((m) => m.productSlot).join('/')} are distinct and clear of the ${requiredProductSlots()} slot(s) sales-rep-stats-specs reserves for its BL-SR-008 ranking assertions`);
}

// 5b. The three matrix aliases are registered, CSV-backed, and carry NO GUID in the committed base.
console.log('\n[5b] aliases.json: the matrix aliases are wired and GUID-free (DV-021)');
const aliasRegistry = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
for (const [cellKey, meta] of Object.entries(AUTHORSHIP_MATRIX)) {
  const a = aliasRegistry[meta.alias];
  if (!a) { fail(`alias ${meta.alias} is missing from test-data/aliases.json — the cases for the ${meta.cell} cell could not resolve anything`); continue; }
  if (a.file !== 'sales-rep/sales-rep-orders') fail(`alias ${meta.alias}: file="${a.file}", expected sales-rep/sales-rep-orders — syncEnvAliases matches on file+filter, so a wrong file means the seeder never writes its runtime id`);
  if (a.filter?.order_key !== meta.orderKey) fail(`alias ${meta.alias}: filter.order_key="${a.filter?.order_key}", expected "${meta.orderKey}"`);
  // `id` is what salesRepCustomerOrder(id:) takes, so an alias without it cannot express the query.
  for (const f of ['id', 'number', 'customerId']) {
    if (!a.fields?.[f]) fail(`alias ${meta.alias}: no "${f}" field — salesRepCustomerOrder takes an ID, a storefront case asserts the visible number, and the divergence assertion needs customerId`);
  }
  for (const [f, v] of Object.entries(a.fields || {})) {
    if (GUID_RE.test(String(v).trim())) fail(`alias ${meta.alias}: field "${f}" maps to a GUID literal — the committed base alias must map to a CSV COLUMN, with runtime ids in aliases.<env>.json (DV-021)`);
  }
}
if (!problems.length) ok(`${AUTHORSHIP_ALIASES.join(', ')} wired to ${ORDERS_CSV} with id/number/customerId, no committed GUID`);

// 5c. Did the last seed actually record the divergence LIVE? The static checks above prove the
//     fixture is DESIGNED to discriminate; only the seeded customerIds prove it CAME OUT that way.
//     A buyer whose account failed to resolve would collapse the pair onto the rep, and nothing
//     static could see it. Time/env-dependent, so this warns rather than failing.
console.log(`\n[5c] aliases.${env}.json: the seeded customerIds actually DIVERGE on this env`);
const seededCustomer = (alias) => overlay[alias]?.customerId || '';
const repPlacedCid = seededCustomer(AUTHORSHIP_MATRIX.repPlaced.alias);
const buyerPlacedCid = seededCustomer(AUTHORSHIP_MATRIX.buyerPlaced.alias);
const notServedCid = seededCustomer(AUTHORSHIP_MATRIX.notServed.alias);
if (!repPlacedCid || !buyerPlacedCid) {
  warn(`no seeded customerId recorded for ${!repPlacedCid ? AUTHORSHIP_MATRIX.repPlaced.alias : ''}${!repPlacedCid && !buyerPlacedCid ? ' / ' : ''}${!buyerPlacedCid ? AUTHORSHIP_MATRIX.buyerPlaced.alias : ''} on ${env} — run \`TEST_ENV=${env} npm run seed:sales-rep\`; until then the divergence is designed but unproven on this env`);
} else if (repPlacedCid === buyerPlacedCid) {
  fail(`${AUTHORSHIP_MATRIX.repPlaced.alias} and ${AUTHORSHIP_MATRIX.buyerPlaced.alias} were SEEDED WITH THE SAME customerId (${repPlacedCid}) on ${env} — the authorship pair has collapsed into two identical orders, so "read-only for someone else's order" cannot fail. The usual cause is the buyer account not resolving at seed time; re-seed and check the seeder log.`);
} else {
  ok(`seeded customerIds diverge: ${AUTHORSHIP_MATRIX.repPlaced.alias}=${repPlacedCid} vs ${AUTHORSHIP_MATRIX.buyerPlaced.alias}=${buyerPlacedCid}`);
}
if (notServedCid && repPlacedCid && notServedCid !== repPlacedCid) {
  fail(`${AUTHORSHIP_MATRIX.notServed.alias} was seeded with customerId ${notServedCid} but ${AUTHORSHIP_MATRIX.repPlaced.alias} with ${repPlacedCid} — the org-scope arm must share the rep-authored customer, or a null result is explainable by authorship as well as by org scope`);
} else if (notServedCid && repPlacedCid) {
  ok(`${AUTHORSHIP_MATRIX.notServed.alias} shares the rep-authored customerId (${notServedCid}) — a null result there isolates ORG SCOPE`);
}

console.log('\n=== sales-rep orders drift/vacuity check ===');
console.log(`  ${ORDERS_CSV} rows: ${rows.length} (${rolling.length} rolling-window, ${newest.length} ${NEWEST_IN_ORG}) | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log('\nSales-rep orders OK — no GUID leakage; the rolling-window block can still discriminate; no recency contract is contradicted.');
process.exit(0);
