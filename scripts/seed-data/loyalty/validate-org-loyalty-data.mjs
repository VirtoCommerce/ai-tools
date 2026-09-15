#!/usr/bin/env node
/**
 * validate-org-loyalty-data.mjs — DRIFT / LEAK / VACUITY GUARD for the org-mode loyalty fixtures
 * (VCST-5024). STATIC only (no network). `npm run td:validate:org-loyalty`; exits 1 on a hard problem.
 *
 * What it protects, and why each check earns its place:
 *
 *  [1] The committed CSV is still DISCRIMINATING — `org-loyalty-specs.validateFixtureShape()`. This is
 *      the one that matters: the set can stay perfectly well-formed, seed cleanly and resolve every
 *      `@td()` while answering nothing. Equalise `ORG_LOY_A.earn_qty` and `ORG_LOY_B.earn_qty` and the
 *      pooled total collapses onto a double-count of either member; un-lock ORG_LOY_LOCKED and the
 *      authorization handler has nothing to refuse; give LOY_PERSONAL_NOORG an org and the
 *      read-path/spend-path asymmetry loses its only actor. Each is a one-cell edit that no other gate
 *      in this repo can see. It also guards the MISSION SET: a duplicate sweep key (one mission's seed
 *      would then delete another), a reward that duplicates a sibling or collides with the missions-e2e
 *      set (a balance delta would name nothing — all three are live at once against one group), a
 *      ORG_LOY_MISSION_2 that stops being count 1, a ORG_LOY_MISSION_PARTIAL below count 2 (at count 1
 *      it is Completed the instant anything accrues, so pooled PROGRESS and pooled COMPLETION become
 *      indistinguishable), and equal counts across the pair — which asks one question twice.
 *  [2] No runtime GUID and no password literal in the committed CSV (the multi-env rule + td:reconcile
 *      secret hygiene).
 *  [3] The alias contract: all seven aliases exist, are `_inline`, expose exactly the field names the
 *      authored cases reference, and their RUNTIME fields are EMPTY in the committed base — an
 *      unseeded env must resolve them to "" (a clear miss), never to another env's value.
 *  [4] The OVERLAY-SHADOW check (`missions-specs.overlayShadowProblems`, the exact inverse of [3]): an
 *      AUTHORED business key sitting in `aliases.<env>.json` wins field-by-field over the base, still
 *      resolves, keeps `td:validate` green — and CANNOT be repaired by re-seeding, because
 *      `writeEnvAliasOverride` merges per alias and never deletes.
 *  [5] Informational: whether each env overlay actually carries the runtime ids today, and what
 *      pooled arithmetic the last seed recorded.
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import { overlayShadowProblems } from './missions-specs.mjs';
import {
  CSV_SOURCE, COLUMNS, ALIASES, RUNTIME_ALIAS_FIELDS, OUTLET_GROUP, OUTLET_ORG, SIBLING_ORG,
  MISSIONS, MISSION_ALIASES, RESERVED_REWARDS, loadAccounts, accountByPoolRole, POOL_ROLES, validateFixtureShape,
} from './org-loyalty-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), {
  columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true,
});
const readJson = (rel) => (existsSync(join(ROOT, rel)) ? JSON.parse(readFileSync(join(ROOT, rel), 'utf8')) : null);

const problems = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => console.log(`  ⚠ ${m}`);
const ok = (m) => console.log(`  ✓ ${m}`);

const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const VAR_TOKEN_RE = /^\{\{\s*[A-Z0-9_]+\s*\}\}$/;
const PROSE_COLS = new Set(['test_purpose']);

console.log(`\n🏬 td:validate:org-loyalty — ${CSV_SOURCE.file}\n`);

const rows = readCsv(CSV_SOURCE.file);
const accounts = loadAccounts(rows);

/* [1] The fixture is still discriminating ─────────────────────────────────────── */
console.log('[1] the committed set is still DISCRIMINATING (divergence, locked actor, outsider, mission set)');
const shape = validateFixtureShape(rows);
for (const p of shape) fail(p);
if (!shape.length) {
  const a = accountByPoolRole(accounts, POOL_ROLES.POOLED_A);
  const b = accountByPoolRole(accounts, POOL_ROLES.POOLED_B);
  ok(`earn_qty diverges: ${a.aliasName}=${a.earnQty} vs ${b.aliasName}=${b.earnQty} `
    + `(pooled ${a.earnQty + b.earnQty} is distinct from ${2 * a.earnQty} and ${2 * b.earnQty})`);
  ok(`3 members in ONE org (${OUTLET_ORG.name}); 1 outsider with no org; sibling control = ${SIBLING_ORG.csvOrgId}`);
  for (const m of MISSIONS) {
    ok(`${m.aliasName}: ${m.goal.type} ${m.goal.count}, reward ${m.reward}, sweep key "${m.key || '(none — generation 1)'}" → ${m.decides}`);
  }
  ok(`rewards are mutually distinct (${MISSIONS.map((m) => m.reward).join('/')}) and clear of the missions-e2e set (${RESERVED_REWARDS.join('/')}) — `
    + 'all three are live at once against one group, so one order can move more than one of them');
}

/* [2] Committed-file hygiene ──────────────────────────────────────────────────── */
console.log('\n[2] no runtime GUID / password literal / per-env id in the committed CSV');
let leaks = 0;
for (const r of rows) {
  for (const [col, val] of Object.entries(r)) {
    const v = String(val ?? '').trim();
    if (!v || PROSE_COLS.has(col)) continue;
    if (GUID_RE.test(v)) { fail(`${r.user_id}.${col} holds a GUID (${v}) — runtime ids belong in aliases.<env>.json`); leaks += 1; }
  }
  const pw = String(r.password || '').trim();
  if (!VAR_TOKEN_RE.test(pw)) { fail(`${r.user_id}: password is not a {{VAR}} token — td:reconcile secret hygiene fails a bare literal`); leaks += 1; }
}
const missingCols = COLUMNS.filter((c) => !(c in (rows[0] || {})));
if (missingCols.length) fail(`CSV is missing column(s): ${missingCols.join(', ')}`);
if (!leaks && !missingCols.length) ok(`${rows.length} row(s), ${COLUMNS.length} columns, no GUID, every password a {{VAR}} token`);

/* [3] The alias contract ──────────────────────────────────────────────────────── */
console.log('\n[3] alias contract: declared, inline, runtime fields EMPTY in the committed base');
const base = readJson('test-data/aliases.json') || {};
const aliasProblemsBefore = problems.length;
for (const name of ALIASES) {
  const entry = base[name];
  if (!entry) { fail(`alias ${name} is not registered in test-data/aliases.json`); continue; }
  if (entry._inline !== true) fail(`${name}: must be an _inline alias (its ids are runtime, not a CSV column)`);
  const fields = entry.fields || {};
  for (const f of RUNTIME_ALIAS_FIELDS[name]) {
    if (!(f in fields)) { fail(`${name}: runtime field "${f}" is not exposed in fields{} — @td(${name}.${f}) would pass through unresolved`); continue; }
    const committed = entry[f];
    if (committed !== undefined && String(committed).trim() !== '') {
      fail(`${name}.${f} = ${JSON.stringify(committed)} is committed in the BASE alias file. `
        + 'It is runtime/per-env: an unseeded env must resolve it to "" (a clear miss), never to another env\'s value.');
    }
  }
  if (!entry._notes) fail(`${name}: no _notes — a fixture must state its own limits where a case can read them`);
}
if (problems.length === aliasProblemsBefore) ok(`${ALIASES.length} aliases registered with empty runtime fields and _notes`);

/* [4] Overlay shadow — an AUTHORED key hiding in a per-env overlay ────────────── */
console.log('\n[4] overlay shadow: no AUTHORED business key present in any aliases.<env>.json');
const overlayFiles = readdirSync(join(ROOT, 'test-data')).filter((f) => /^aliases\.[a-z0-9-]+\.json$/i.test(f));
let shadows = 0;
for (const f of overlayFiles) {
  const overlay = readJson(`test-data/${f}`) || {};
  for (const p of overlayShadowProblems(RUNTIME_ALIAS_FIELDS, overlay, base)) { fail(`${f}: ${p}`); shadows += 1; }
}
if (!shadows) ok(`${overlayFiles.length} overlay file(s) carry runtime fields only`);

/* [5] Informational — what the last seed actually recorded ────────────────────── */
console.log('\n[5] per-env overlay state (informational — NOT a gate)');
for (const f of overlayFiles) {
  const overlay = readJson(`test-data/${f}`) || {};
  const seeded = ALIASES.filter((n) => Object.entries(overlay[n] || {}).some(([k, v]) => k !== 'fields' && !k.startsWith('_') && String(v || '').trim()));
  if (!seeded.length) { warn(`${f}: none of the org-loyalty aliases are seeded here — run TEST_ENV=<env> npm run seed:org-loyalty`); continue; }
  const pa = Number(overlay.ORG_LOY_A?.earn_points_expected || 0);
  const pb = Number(overlay.ORG_LOY_B?.earn_points_expected || 0);
  console.log(`  ${f}: ${seeded.length}/${ALIASES.length} seeded | org ${overlay.ORG_LOY_A?.org_id || '(none)'}`);
  for (const alias of MISSION_ALIASES) {
    const m = overlay[alias] || {};
    console.log(`    ${alias.padEnd(23)} ${m.id ? `${m.id}  ${m.name}` : '(not seeded here)'}`);
  }
  if (pa && pb) {
    console.log(`    pooled plan: A ${pa} + B ${pb} = ${pa + pb} PTS`);
    if (pa === pb) warn(`${f}: the two accounts would earn the SAME points despite different quantities — the pooled total is not attributable`);
  }
  const bal = Number(overlay.LOY_PERSONAL_NOORG?.balance_at_seed || 0);
  const pts = Number(overlay.LOY_PERSONAL_NOORG?.cheapest_pts_price || 0);
  if (bal || pts) {
    console.log(`    LOY_PERSONAL_NOORG balance_at_seed ${bal} PTS vs cheapest PTS line ${overlay.LOY_PERSONAL_NOORG?.cheapest_pts_sku || '?'} @ ${pts}`);
    if (pts && !(bal > pts)) warn(`${f}: balance_at_seed is NOT above the cheapest PTS line — a refusal to spend would be a genuine shortfall, not the scope bug`);
    console.log('    (a seed-time READING, never a contract — a balance cannot be reset on this platform, so assert deltas)');
  }
}

console.log(`\n[6] group proxy: mission targets customer group "${OUTLET_GROUP}". `
  + 'Org-native mission targeting does NOT exist on this build (missions-specs §TARGETING: no CustomerIsCondition / org condition), '
  + 'so audience == org membership is an equivalence THIS fixture maintains, not one the product guarantees.');

if (problems.length) {
  console.log(`\n❌ ${problems.length} problem(s)\n`);
  process.exit(1);
}
console.log('\n✅ org-loyalty fixtures clean\n');
