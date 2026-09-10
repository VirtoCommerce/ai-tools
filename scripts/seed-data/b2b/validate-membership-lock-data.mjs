#!/usr/bin/env node
/**
 * validate-membership-lock-data.mjs — DRIFT / DECIDABILITY GUARD for the org-membership lock axis
 * (VCST-5317). STATIC only (no network). `npm run td:validate:membership-lock`.
 *
 * Unlike a normal seeder's guard, there is no committed fixture file to diff here — lock is runtime
 * state on rows that already exist. So this guard defends the four things that CAN silently rot:
 *
 *   [1] LANE SPLIT — LANES in membership-lock-specs.mjs still agrees with the reservation declared in
 *       aliases.json prose, and the two lanes are genuinely different accounts. If this diverges, two
 *       concurrent lanes eat each other's isLocked state and both report confident wrong results.
 *   [2] DECIDABILITY (`.claude/rules/test-data.md` §SECOND RULE) — every state is DISCRIMINATING:
 *       V3 vs V4 compute OPPOSITE isCurrentlyLocked, V2 vs V5 target OPPOSITE sides of the active-org
 *       axis, V7 locks every leg, V1 locks nothing. This is the check that FAILS when the gap the
 *       variants exist to probe collapses.
 *   [3] LANE LEGS — each lane still resolves at least two membership legs from the committed CSV, with
 *       distinct orgs and distinct alias fields. A lane that degenerates to one org makes every
 *       multi-org variant vacuous.
 *   [4] NO GUID LEAK + the V6 prohibition is still declared with its reason.
 *
 * It does NOT assert the live lock state — that is `--verify` on the runner, which needs a network.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  LANES, LANE_NAMES, LOCK_STATES, STATE_NAMES, RESTING_STATE, MEMBERSHIP_CSV,
  LOCK_CACHE_TTL_MS, LOCK_CACHE_TTL_SOURCE_REF, LOCK_PREDICATE_SOURCE_REF, SETTLE_TOLERANCE_MS,
  V6_IS_READ_ONLY, laneLegs, findLaneReservationProblems, findDecidabilityProblems,
  isCurrentlyLocked, tokenSurvivesState,
} from './membership-lock-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const PROSE_COLS = new Set(['notes', 'test_purpose']);

const problems = []; const notes = [];
const fail = (m) => { problems.push(m); console.log(`  ✗ ${m}`); };
const warn = (m) => { notes.push(m); console.log(`  ⚠ ${m}`); };
const ok = (m) => console.log(`  ✓ ${m}`);

const rows = readCsv(`${MEMBERSHIP_CSV}.csv`);
const aliases = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

console.log(`\n[1] lane split: LANES agrees with the reservation declared in aliases.json`);
const laneProblems = findLaneReservationProblems(aliases);
laneProblems.forEach(fail);
if (!laneProblems.length) ok(`${LANE_NAMES.length} lanes, distinct accounts: ${Object.entries(LANES).map(([l, a]) => `${l}=${a}`).join(', ')}`);

console.log(`\n[2] decidability (SECOND RULE): every state must be DISCRIMINATING, not merely present`);
const decProblems = findDecidabilityProblems();
decProblems.forEach(fail);
if (!decProblems.length) {
  ok(`${STATE_NAMES.length} states, each with a stated \`decides\` rationale`);
  ok('V3 (timed-future) computes isCurrentlyLocked=true and V4 (timed-past) computes false — the predicate gap holds');
  ok(`V2 targets ${LOCK_STATES.V2.target} and V5 targets ${LOCK_STATES.V5.target} — the active-org axis has not collapsed`);
  ok(`V7 targets ${LOCK_STATES.V7.target}; resting state ${RESTING_STATE} locks nothing`);
}

console.log(`\n[3] lane legs resolve from test-data/${MEMBERSHIP_CSV}.csv (multi-org, distinct orgs + fields)`);
for (const lane of LANE_NAMES) {
  let legs;
  try { legs = laneLegs(rows, lane); } catch (e) { fail(`lane "${lane}": ${e.message}`); continue; }
  const orgs = legs.map((l) => l.orgName);
  const fields = legs.map((l) => l.aliasField);
  if (new Set(orgs).size !== orgs.length) fail(`lane "${lane}": duplicate org(s) across legs (${orgs.join(', ')}) — a multi-org variant needs DISTINCT orgs`);
  if (new Set(fields).size !== fields.length) fail(`lane "${lane}": duplicate membership_id_field across legs (${fields.join(', ')}) — one leg's id would overwrite the other's`);
  const emails = new Set(legs.map((l) => l.email));
  if (emails.size !== 1) fail(`lane "${lane}": legs span ${emails.size} accounts (${[...emails].join(', ')}) — a lane is ONE account`);
  for (const l of legs) {
    if (!l.aliasField) fail(`lane "${lane}" row ${l.membershipRowId}: no membership_id_field — its membership id has nowhere to resolve from`);
    const declared = aliases?.[LANES[lane]]?.fields || {};
    if (l.aliasField && !(l.aliasField in declared)) fail(`lane "${lane}": alias ${LANES[lane]} does not declare field "${l.aliasField}" — @td(${LANES[lane]}.${l.aliasField}) cannot resolve`);
  }
  if (!problems.length || legs.length >= 2) ok(`lane "${lane}" (${LANES[lane]}): ${legs.length} legs — ${orgs.join(' + ')}`);
}

// Cross-lane: the two lanes must not share a membership row, or the split is a no-op in practice.
const byLane = {};
for (const lane of LANE_NAMES) { try { byLane[lane] = laneLegs(rows, lane); } catch { byLane[lane] = []; } }
const rowIds = Object.values(byLane).flat().map((l) => l.membershipRowId);
if (new Set(rowIds).size !== rowIds.length) fail(`two lanes share a membership CSV row (${rowIds.join(', ')}) — they would mutate the same isLocked`);
const laneEmails = LANE_NAMES.map((l) => (byLane[l][0] || {}).email).filter(Boolean);
if (new Set(laneEmails).size !== laneEmails.length) fail(`the lanes resolve to the SAME account (${laneEmails.join(', ')}) — the lane split is a no-op and two concurrent lanes WILL corrupt each other`);
else ok(`lanes are distinct accounts: ${laneEmails.join(' | ')}`);

console.log(`\n[4] no runtime GUID in the committed CSV (multi-env rule)`);
let leaks = 0;
for (const r of rows) {
  for (const [col, v] of Object.entries(r)) {
    if (PROSE_COLS.has(col)) continue;
    if (GUID_RE.test(String(v ?? '').trim())) { fail(`row ${r.membership_id}: column "${col}" holds a GUID "${v}" — membership/contact/account ids live in aliases.<env>.json`); leaks += 1; }
  }
}
if (!leaks) ok(`${rows.length} row(s) carry business keys only`);

console.log(`\n[5] the V6 prohibition is still declared, with its reason`);
if (!V6_IS_READ_ONLY.membershipId || !GUID_RE.test(V6_IS_READ_ONLY.membershipId)) fail('V6_IS_READ_ONLY.membershipId is not a membership id — the named refusal in assertWritable() cannot fire');
else if (!String(V6_IS_READ_ONLY.dependedOnBy || '').trim()) fail('V6_IS_READ_ONLY declares no dependedOnBy — a refusal that does not say WHAT it protects gets overridden');
else if (!isCurrentlyLocked(V6_IS_READ_ONLY.observed)) fail(`V6_IS_READ_ONLY.observed is not a locked state (${JSON.stringify(V6_IS_READ_ONLY.observed)}) — it is documented as the V6 (all-locked, single-org) variant at rest`);
else ok(`${V6_IS_READ_ONLY.alias} ${V6_IS_READ_ONLY.membershipId} is declared read-only, protecting ${V6_IS_READ_ONLY.dependedOnBy}`);
if (Object.keys(LOCK_STATES).includes('V6')) fail('LOCK_STATES declares a V6 state — V6 must stay READ-ONLY (it is IMPERSONATE_TARGET_BLOCKED, which suite 082 depends on), never provisionable');
else ok('LOCK_STATES declares no V6 — it is consumed read-only, never written');

console.log(`\n[6] transcribed-constant provenance (GOLDEN RULE: a constant that cannot be derived must be cited + guarded)`);
for (const [name, ref] of [['LOCK_CACHE_TTL_MS', LOCK_CACHE_TTL_SOURCE_REF], ['isCurrentlyLocked', LOCK_PREDICATE_SOURCE_REF]]) {
  if (!/vc-module-customer/.test(ref) || !/\.cs:\d+/.test(ref)) fail(`${name} has no file:line source citation ("${ref}") — it cannot be re-verified against the source it was copied from`);
  else ok(`${name} cites ${ref}`);
}
if (SETTLE_TOLERANCE_MS <= 0) fail('SETTLE_TOLERANCE_MS must be positive — the runner measures the settle and needs headroom before calling it drift');
else ok(`the runner MEASURES the settle and fails past ${LOCK_CACHE_TTL_MS} + ${SETTLE_TOLERANCE_MS} ms, so a change to the upstream TTL surfaces as one loud failure`);

console.log(`\n[7] session-termination semantics are declared per state (post-state, not transition)`);
for (const s of STATE_NAMES) {
  const survives = tokenSurvivesState(s);
  console.log(`  ${s.padEnd(4)} token minted before the change ${survives ? 'SURVIVES' : 'is KILLED'} (${LOCK_STATES[s].label})`);
}
if (tokenSurvivesState('V2')) fail('V2 is reported as session-surviving, but a permanent lock lands IsCurrentlyLocked=true, which terminates all sessions — a case would reuse a dead token and misread the failure');
if (!tokenSurvivesState('V4')) fail('V4 is reported as session-killing, but a PAST LockoutEnd leaves IsCurrentlyLocked false, so the handler does not fire — over-stating this costs a needless re-auth in every V4 case');
if (!tokenSurvivesState(RESTING_STATE)) fail(`${RESTING_STATE} (unlock) is reported as session-killing, but the handler guards on the NEW state being currently-locked, so an unlock does not fire it`);

const env = process.env.TEST_ENV || 'vcst';
console.log(`\n[8] aliases.${env}.json: the ids the lock axis binds are resolvable (informational)`);
const overlayPath = join(ROOT, 'test-data', `aliases.${env}.json`);
if (!existsSync(overlayPath)) warn(`aliases.${env}.json does not exist — the lock axis is reproducible only on an env whose MULTI_ORG* aliases are seeded`);
else {
  const overlay = JSON.parse(readFileSync(overlayPath, 'utf8'));
  for (const [lane, alias] of Object.entries(LANES)) {
    const o = overlay[alias] || {};
    const need = ['userId', 'id', ...(byLane[lane] || []).map((l) => l.aliasField)];
    const missing = need.filter((f) => !String(o[f] || '').trim());
    if (missing.length) warn(`${alias} (${lane} lane) is missing ${missing.join(', ')} on ${env} — the runner cannot resolve this lane until \`seed-company-users.mjs cross-org --only ${alias}\` has run`);
    else ok(`${alias} (${lane} lane): ${need.join(', ')} all resolve on ${env}`);
  }
}

console.log('\n=== membership-lock drift/decidability check ===');
console.log(`  lanes: ${LANE_NAMES.length} | states: ${STATE_NAMES.length} | hard problems: ${problems.length} | warnings: ${notes.length}`);
if (problems.length) { console.log('\nFAILED — fix the ✗ items above.'); process.exit(1); }
console.log(`\nMembership-lock OK — the lane split holds, every state is discriminating, and V6 stays read-only.`);
process.exit(0);
