// Unit tests for the VCST-5317 org-membership LOCK AXIS spec module. Pure — no env, no network.
//
// What is worth testing here is not "does the table have rows" but the three things whose silent
// failure is expensive:
//   1. the PREDICATE mirrors vc-module-customer's `IsCurrentlyLocked` exactly (strict `>`, null =
//      permanent) — the VCST-5374 defect was this exact confusion;
//   2. the SAFETY GATE actually refuses, rather than merely having a list to refuse from (testing
//      the list without testing the gate is how `assertLockable` nearly rotted);
//   3. the DECIDABILITY guard fails when a state stops discriminating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  LANES, LANE_NAMES, LOCK_STATES, STATE_NAMES, RESTING_STATE, LOCK_KINDS, TARGETS, MEMBERSHIP_CSV,
  LOCK_CACHE_TTL_MS, MIN_SHORTLIVED_WINDOW_MS, DEFAULT_FUTURE_HORIZON_MS, DEFAULT_PAST_HORIZON_MS,
  V6_IS_READ_ONLY,
  isCurrentlyLocked, disagreesWithServer, resolveLockoutEnd, planState, legStateMatches,
  laneLegs, assertWritable, otherLane, tokenSurvivesState, buildAppliedRecord,
  findLaneReservationProblems, findDecidabilityProblems,
} from '../seed-data/b2b/membership-lock-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, rel), 'utf8'), { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true });
const ROWS = readCsv(`test-data/${MEMBERSHIP_CSV}.csv`);
const ALIASES = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));

const NOW = Date.parse('2026-09-09T12:00:00Z');
const TF = 'org-techflow-id';
const BR = 'org-buildright-id';
const legs = () => ([
  { membershipId: 'm-tf', orgId: TF, orgName: 'AGENT-TEST-Org-TechFlow-20260310', aliasField: 'techflow_membership_id' },
  { membershipId: 'm-br', orgId: BR, orgName: 'AGENT-TEST-Org-BuildRight-20260310', aliasField: 'buildright_membership_id' },
]);

/* ── 1. the predicate ────────────────────────────────────────────────────────────────────────── */

test('isCurrentlyLocked mirrors OrganizationMembership.cs:22 — null LockoutEnd is PERMANENT, not expired', () => {
  assert.equal(isCurrentlyLocked({ isLocked: true, lockoutEnd: null }, NOW), true);
  assert.equal(isCurrentlyLocked({ isLocked: true }, NOW), true);
  assert.equal(isCurrentlyLocked({ isLocked: true, lockoutEnd: '' }, NOW), true);
  // isLocked=false always wins, whatever LockoutEnd says
  assert.equal(isCurrentlyLocked({ isLocked: false, lockoutEnd: '2099-01-01T00:00:00Z' }, NOW), false);
  assert.equal(isCurrentlyLocked({}, NOW), false);
});

test('isCurrentlyLocked uses a STRICT > : an instant exactly equal to LockoutEnd reads as NOT locked', () => {
  const exact = new Date(NOW).toISOString();
  assert.equal(isCurrentlyLocked({ isLocked: true, lockoutEnd: exact }, NOW), false, 'equality must not count as locked — the C# is `LockoutEnd.Value > DateTime.UtcNow`');
  assert.equal(isCurrentlyLocked({ isLocked: true, lockoutEnd: new Date(NOW + 1).toISOString() }, NOW), true);
  assert.equal(isCurrentlyLocked({ isLocked: true, lockoutEnd: new Date(NOW - 1).toISOString() }, NOW), false);
});

test('isCurrentlyLocked fails CLOSED on an unparseable LockoutEnd (never reports a lock as lifted)', () => {
  assert.equal(isCurrentlyLocked({ isLocked: true, lockoutEnd: 'not-a-date' }, NOW), true);
});

test('the V4 shape is the discriminating one: isLocked=true with the flag FALSE (the VCST-5374 defect)', () => {
  const v4 = { isLocked: true, lockoutEnd: new Date(NOW - 3600_000).toISOString() };
  assert.equal(v4.isLocked, true, 'raw IsLocked stays true — a surface reading it shows the org locked');
  assert.equal(isCurrentlyLocked(v4, NOW), false, 'IsCurrentlyLocked is false — a correct surface shows it usable');
});

test('disagreesWithServer flags a predicate divergence, and stays silent when the server sent nothing', () => {
  const lapsed = { isLocked: true, lockoutEnd: new Date(NOW - 1000).toISOString() };
  assert.equal(disagreesWithServer({ ...lapsed, isCurrentlyLocked: false }, NOW), false);
  assert.equal(disagreesWithServer({ ...lapsed, isCurrentlyLocked: true }, NOW), true, 'server says locked, our mirror says lapsed => must be reported');
  assert.equal(disagreesWithServer(lapsed, NOW), false, 'field absent => nothing to compare');
});

/* ── 2. lockoutEnd wire values ───────────────────────────────────────────────────────────────── */

test('resolveLockoutEnd maps each kind onto the wire value POST /lock expects', () => {
  assert.equal(resolveLockoutEnd(LOCK_KINDS.NONE, NOW), undefined, 'unlock takes no body');
  assert.equal(resolveLockoutEnd(LOCK_KINDS.PERMANENT, NOW), null, 'permanent is an EXPLICIT null, distinct from omitting the field');
  assert.ok(Date.parse(resolveLockoutEnd(LOCK_KINDS.TIMED_FUTURE, NOW)) > NOW);
  assert.ok(Date.parse(resolveLockoutEnd(LOCK_KINDS.TIMED_PAST, NOW)) < NOW);
  assert.throws(() => resolveLockoutEnd('bogus', NOW), /unknown lock kind/);
});

test('both default horizons clear the 60s cache floor, so cache lag cannot make V3 read as V4', () => {
  assert.ok(DEFAULT_FUTURE_HORIZON_MS > LOCK_CACHE_TTL_MS);
  assert.ok(DEFAULT_PAST_HORIZON_MS > LOCK_CACHE_TTL_MS);
});

/* ── 3. planState — variants defined RELATIVE to the active org ──────────────────────────────── */

test('V2 locks the NON-active org and V5 locks the ACTIVE one — the axis they exist to separate', () => {
  const v2 = planState('V2', legs(), BR, { now: NOW });          // BuildRight is active (as measured live)
  const tf2 = v2.find((l) => l.orgId === TF); const br2 = v2.find((l) => l.orgId === BR);
  assert.equal(br2.role, TARGETS.ACTIVE);
  assert.equal(tf2.kind, LOCK_KINDS.PERMANENT, 'V2 must lock the non-active org');
  assert.equal(br2.kind, LOCK_KINDS.NONE, 'V2 must leave the active org usable');

  const v5 = planState('V5', legs(), BR, { now: NOW });
  assert.equal(v5.find((l) => l.orgId === BR).kind, LOCK_KINDS.PERMANENT, 'V5 must lock the ACTIVE org');
  assert.equal(v5.find((l) => l.orgId === TF).kind, LOCK_KINDS.NONE);
});

test('the active org is DATA, not a hardcoded org: flipping it flips which leg V2 locks', () => {
  const activeBR = planState('V2', legs(), BR, { now: NOW });
  const activeTF = planState('V2', legs(), TF, { now: NOW });
  assert.equal(activeBR.find((l) => l.orgId === TF).kind, LOCK_KINDS.PERMANENT);
  assert.equal(activeTF.find((l) => l.orgId === BR).kind, LOCK_KINDS.PERMANENT);
  assert.notEqual(
    activeBR.find((l) => l.kind !== LOCK_KINDS.NONE).orgId,
    activeTF.find((l) => l.kind !== LOCK_KINDS.NONE).orgId,
    'if these matched, naming an org by name would silently swap V2 and V5 when the active org drifts',
  );
});

test('V2 leaves EXACTLY ONE selectable org, which is what makes it also serve the V8 flip boundary', () => {
  const plan = planState('V2', legs(), BR, { now: NOW });
  const selectable = plan.filter((l) => !l.wantCurrentlyLocked);
  assert.equal(selectable.length, 1, 'the isMultiOrganization boundary is "exactly one selectable org"');
  assert.ok(LOCK_STATES.V2.alsoServes.includes('V8'));
});

test('V7 locks EVERY leg, so no selectable org survives', () => {
  const plan = planState('V7', legs(), BR, { now: NOW });
  assert.equal(plan.filter((l) => l.wantCurrentlyLocked).length, plan.length);
  assert.equal(plan.filter((l) => !l.wantCurrentlyLocked).length, 0);
});

test('V1 locks nothing and is the resting state teardown restores', () => {
  const plan = planState('V1', legs(), BR, { now: NOW });
  assert.ok(plan.every((l) => l.kind === LOCK_KINDS.NONE && !l.wantIsLocked && !l.wantCurrentlyLocked));
  assert.equal(RESTING_STATE, 'V1');
  assert.equal(LOCK_STATES[RESTING_STATE].resting, true);
});

test('V3 and V4 differ only in the flag — same isLocked, OPPOSITE isCurrentlyLocked', () => {
  const v3 = planState('V3', legs(), BR, { now: NOW }).find((l) => l.orgId === TF);
  const v4 = planState('V4', legs(), BR, { now: NOW }).find((l) => l.orgId === TF);
  assert.equal(v3.wantIsLocked, true); assert.equal(v4.wantIsLocked, true);
  assert.equal(v3.wantCurrentlyLocked, true);
  assert.equal(v4.wantCurrentlyLocked, false, 'without this divergence the raw-IsLocked defect is undetectable');
});

test('V4B refuses to run without an explicit window, and refuses one shorter than the cache floor', () => {
  assert.throws(() => planState('V4B', legs(), BR, { now: NOW }), /must be given explicitly/);
  assert.throws(() => planState('V4B', legs(), BR, { now: NOW, offsetMs: 10_000 }), /below the .* floor/);
  const okPlan = planState('V4B', legs(), BR, { now: NOW, offsetMs: MIN_SHORTLIVED_WINDOW_MS });
  assert.equal(okPlan.find((l) => l.orgId === TF).wantCurrentlyLocked, true, 'a V4B lock must start LIVE, then expire');
});

test('planState rejects an unknown state, a single-org account, and a missing active org', () => {
  assert.throws(() => planState('V99', legs(), BR, { now: NOW }), /unknown state/);
  assert.throws(() => planState('V2', [legs()[0]], BR, { now: NOW }), /at least two legs/);
  assert.throws(() => planState('V5', legs(), null, { now: NOW }), /active org must be resolved/);
  // V1 targets nothing, so it does NOT need the active org — teardown must work even if it is unresolvable
  assert.doesNotThrow(() => planState('V1', legs(), null, { now: NOW }));
});

/* ── 4. idempotency ─────────────────────────────────────────────────────────────────────────── */

test('legStateMatches will not let a PERMANENT lock silently satisfy a TIMED one', () => {
  const plan = planState('V3', legs(), BR, { now: NOW }).find((l) => l.orgId === TF);
  const permanent = { isLocked: true, lockoutEnd: null };
  assert.equal(legStateMatches(permanent, plan, NOW), false, 'V2 must not be mistaken for V3 — both are currently-locked, but they are different fixtures');
  assert.equal(legStateMatches({ isLocked: true, lockoutEnd: plan.lockoutEnd }, plan, NOW), true);
});

test('legStateMatches compares BOTH halves, so a half-applied state is not reported as matching', () => {
  const plan = planState('V2', legs(), BR, { now: NOW }).find((l) => l.orgId === TF);
  assert.equal(legStateMatches({ isLocked: true, lockoutEnd: null }, plan, NOW), true);
  assert.equal(legStateMatches({ isLocked: false, lockoutEnd: null }, plan, NOW), false);
  // isLocked=true but already lapsed => currentlyLocked disagrees, so it is NOT the V2 state
  assert.equal(legStateMatches({ isLocked: true, lockoutEnd: new Date(NOW - 1000).toISOString() }, plan, NOW), false);
  assert.equal(legStateMatches(null, plan, NOW), false);
});

/* ── 5. the safety gate — the REFUSAL, not just the list ─────────────────────────────────────── */

test('assertWritable REFUSES IMPERSONATE_TARGET_BLOCKED by name, and says what depends on it', () => {
  assert.throws(
    () => assertWritable(V6_IS_READ_ONLY.membershipId, [V6_IS_READ_ONLY.membershipId], { lane: 'frontend' }),
    (e) => /REFUSING/.test(e.message) && /082/.test(e.message) && /V6/.test(e.message),
    'the named refusal must fire EVEN when the id is passed in the allowlist — it is the last line of defence',
  );
});

test('assertWritable refuses anything outside the lane\'s own legs (allowlist by construction)', () => {
  assert.throws(() => assertWritable('some-other-membership', ['m-tf', 'm-br'], { lane: 'frontend' }), /REFUSING/);
  assert.throws(() => assertWritable('m-tf', [], { lane: 'frontend' }), /REFUSING/, 'an unresolved allowlist must refuse everything, never default to permissive');
  assert.throws(() => assertWritable('', ['m-tf'], { lane: 'frontend' }), /REFUSING/);
  assert.doesNotThrow(() => assertWritable('m-tf', ['m-tf', 'm-br'], { lane: 'frontend' }));
});

test('every membership the two lanes plan to write is refused by the OTHER lane', () => {
  const laneIds = { frontend: ['m-tf-fe', 'm-br-fe'], backend: ['m-tf-be', 'm-br-be'] };
  for (const id of laneIds.frontend) assert.throws(() => assertWritable(id, laneIds.backend, { lane: 'backend' }), /REFUSING/);
  for (const id of laneIds.backend) assert.throws(() => assertWritable(id, laneIds.frontend, { lane: 'frontend' }), /REFUSING/);
});

/* ── 6. session-termination semantics (post-state, not transition) ───────────────────────────── */

test('tokenSurvivesState encodes the handler\'s POST-STATE guard, not a transition', () => {
  // fires when the NEW state is IsCurrentlyLocked
  assert.equal(tokenSurvivesState('V2'), false);
  assert.equal(tokenSurvivesState('V3'), false);
  assert.equal(tokenSurvivesState('V5'), false);
  assert.equal(tokenSurvivesState('V7'), false);
  assert.equal(tokenSurvivesState('V4B'), false);
  // does NOT fire: unlock, and a lock whose LockoutEnd is already past
  assert.equal(tokenSurvivesState('V1'), true, 'unlock leaves IsCurrentlyLocked false, so the handler does not fire');
  assert.equal(tokenSurvivesState('V4'), true, 'a PAST LockoutEnd never makes the row currently-locked');
  assert.throws(() => tokenSurvivesState('V6'), /unknown state/);
});

/* ── 7. the drift guards themselves ─────────────────────────────────────────────────────────── */

test('findDecidabilityProblems is clean on the shipped table', () => {
  assert.deepEqual(findDecidabilityProblems(), []);
});

test('findDecidabilityProblems FAILS when a discriminating gap collapses (the guard has teeth)', () => {
  const real = LOCK_STATES.V5.target;
  try {
    // Collapse the active-org axis: make V5 target the same side as V2.
    Object.defineProperty(LOCK_STATES.V5, 'target', { value: LOCK_STATES.V2.target, configurable: true, writable: true });
    const found = findDecidabilityProblems();
    assert.ok(found.some((p) => /active-vs-non-active axis has collapsed/.test(p)), `expected a collapse to be reported, got: ${found.join(' | ')}`);
  } finally {
    Object.defineProperty(LOCK_STATES.V5, 'target', { value: real, configurable: true, writable: true });
  }
  assert.deepEqual(findDecidabilityProblems(), [], 'restored');
});

test('findLaneReservationProblems is clean, and fails when the aliases.json reservation prose goes', () => {
  assert.deepEqual(findLaneReservationProblems(ALIASES), []);
  assert.ok(findLaneReservationProblems({}).length >= LANE_NAMES.length, 'missing aliases must be reported per lane');
  const stripped = JSON.parse(JSON.stringify(ALIASES));
  // Prose with the lane contract genuinely gone (not merely reworded) must be reported.
  stripped[LANES.frontend]._notes = 'a cross-org fixture account in two orgs.';
  stripped[LANES.frontend]._comment = '';
  assert.ok(findLaneReservationProblems(stripped).some((p) => /RESERVATION/.test(p)));

  // And prose that still SAYS "reserved" but no longer names WHICH lane must also be reported —
  // otherwise a reword silently decouples the docs from LANES.
  const vague = JSON.parse(JSON.stringify(ALIASES));
  vague[LANES.frontend]._notes = 'RESERVATION — this account is reserved for one lane at a time.';
  vague[LANES.frontend]._comment = '';
  assert.ok(findLaneReservationProblems(vague).some((p) => /does not name it as the FRONTEND lane/.test(p)));
});

/* ── 8. the lane legs come from the CSV, not from this file ─────────────────────────────────── */

test('laneLegs resolves both lanes from the committed CSV, one account each, distinct orgs', () => {
  for (const lane of LANE_NAMES) {
    const l = laneLegs(ROWS, lane);
    assert.ok(l.length >= 2, `lane ${lane} must be multi-org`);
    assert.equal(new Set(l.map((x) => x.email)).size, 1, 'a lane is ONE account');
    assert.equal(new Set(l.map((x) => x.orgName)).size, l.length, 'distinct orgs');
    assert.equal(new Set(l.map((x) => x.aliasField)).size, l.length, 'distinct alias fields');
  }
});

test('the two lanes are different accounts and share no CSV row — otherwise the split is a no-op', () => {
  const fe = laneLegs(ROWS, 'frontend'); const be = laneLegs(ROWS, 'backend');
  assert.notEqual(fe[0].email, be[0].email);
  const shared = fe.map((l) => l.membershipRowId).filter((id) => be.some((b) => b.membershipRowId === id));
  assert.deepEqual(shared, []);
  assert.equal(otherLane('frontend'), 'backend');
  assert.equal(otherLane('backend'), 'frontend');
});

test('laneLegs rejects an unknown lane and a degenerate single-org lane', () => {
  assert.throws(() => laneLegs(ROWS, 'nope'), /unknown lane/);
  assert.throws(() => laneLegs([ROWS.find((r) => r.alias === LANES.frontend)], 'frontend'), /needs a MULTI-org account/);
});

/* ── 9. the applied-state record ────────────────────────────────────────────────────────────── */

test('buildAppliedRecord carries its provenance and says the resting state is V1', () => {
  const plan = planState('V2', legs(), BR, { now: NOW });
  const rec = buildAppliedRecord({ lane: 'frontend', state: 'V2', activeOrgId: BR, legs: plan, env: 'vcst', settleMs: 12, now: NOW });
  assert.equal(rec.lane, 'frontend');
  assert.equal(rec.laneAlias, LANES.frontend);
  assert.equal(rec.restingState, 'V1');
  assert.equal(rec.tokenSurvives, false);
  assert.equal(rec.observedSettleMs, 12);
  assert.match(rec.cacheFloorSource, /OrganizationMembershipSearchService\.cs:\d+/);
  assert.match(rec.predicateSource, /OrganizationMembership\.cs:\d+/);
  assert.match(rec._comment, /EPHEMERAL/);
  assert.equal(rec.legs.length, 2);
  assert.ok(rec.legs.every((l) => 'wantCurrentlyLocked' in l));
});

test('every state declares what it decides, and none of them is V6', () => {
  for (const s of STATE_NAMES) assert.ok(String(LOCK_STATES[s].decides || '').trim().length > 20, `${s} needs a real \`decides\` rationale`);
  assert.ok(!STATE_NAMES.includes('V6'), 'V6 is IMPERSONATE_TARGET_BLOCKED — read-only, never provisionable');
});
