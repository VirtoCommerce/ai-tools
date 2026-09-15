/**
 * Unit tests for the VCST-5024 organization-mode loyalty fixtures.
 *
 * Two halves, on purpose:
 *   • PURE tests of `validateFixtureShape` / `validateSeededState` / `buildMissionBody`, driven by
 *     synthetic rows — these prove the GUARD can actually fail, which is the only thing that makes a
 *     green guard mean anything.
 *   • Tests that read the REAL committed CSV and the REAL aliases.json, so the shipped fixture set is
 *     gated too, not just the predicates (same reasoning as membership-status-required.test.mjs).
 *
 * No env, no network.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  OUTLET_GROUP, OUTLET_ORG, SIBLING_ORG, resolveSiblingOrg, orgSeedRow, buildOrgBody,
  CSV_SOURCE, COLUMNS, ALIASES, RUNTIME_ALIAS_FIELDS, POOL_ROLES,
  MISSION, MISSIONS, MISSION_BY_ALIAS, MISSION_NAME_PREFIX, missionName, isOrgLoyMissionName, isMissionOfSpec, RESERVED_REWARDS,
  loadAccounts, accountByAlias, outletAccounts,
  buildMissionBody, validateFixtureShape, validateSeededState,
} from '../seed-data/loyalty/org-loyalty-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const readCsv = (rel) => parse(readFileSync(join(ROOT, 'test-data', rel), 'utf8'), {
  columns: true, skip_empty_lines: true, trim: true, relax_quotes: true, relax_column_count: true,
});

/* ── synthetic rows: the smallest well-formed set the guard accepts ───────────── */

const row = (o) => ({
  user_id: 'X', alias_name: 'ORG_LOY_A', email: 'agent-test-orgloy-a@test-agent.com',
  password: '{{DEFAULT_TEST_PASSWORD}}', first_name: 'A', last_name: 'B',
  org_id: OUTLET_ORG.key, roles: 'Organization maintainer', status: 'Approved',
  membership_locked: 'false', membership_status: 'Approved',
  customer_groups: OUTLET_GROUP, pool_role: POOL_ROLES.POOLED_A, earn_qty: '1',
  seeded: 'true', test_purpose: 'why', ...o,
});

const goodSet = () => [
  row({ user_id: 'A', alias_name: 'ORG_LOY_A', pool_role: POOL_ROLES.POOLED_A, earn_qty: '1' }),
  row({ user_id: 'B', alias_name: 'ORG_LOY_B', email: 'agent-test-orgloy-b@test-agent.com', roles: 'Purchasing agent', pool_role: POOL_ROLES.POOLED_B, earn_qty: '3' }),
  row({ user_id: 'L', alias_name: 'ORG_LOY_LOCKED', email: 'agent-test-orgloy-locked@test-agent.com', roles: 'Purchasing agent', membership_locked: 'true', pool_role: POOL_ROLES.LOCKED_ACTOR, earn_qty: '1' }),
  row({ user_id: 'N', alias_name: 'LOY_PERSONAL_NOORG', email: 'agent-test-orgloy-noorg@test-agent.com', org_id: '', roles: '', membership_status: '', customer_groups: '', pool_role: POOL_ROLES.OUTSIDER, earn_qty: '1' }),
];

const has = (problems, needle) => problems.some((p) => p.includes(needle));

test('a well-formed set is clean', () => {
  assert.deepEqual(validateFixtureShape(goodSet()), []);
});

/* ── THE divergence guard — the check the whole fixture set exists for ────────── */

test('equal earn_qty on A and B is a DATA DEFECT, not a neutral choice', () => {
  const rows = goodSet();
  rows[1].earn_qty = '1';                       // B now matches A
  const problems = validateFixtureShape(rows);
  assert.ok(has(problems, 'EQUAL earn_qty'), problems.join('\n'));
  assert.ok(has(problems, 'double-count'), 'the message must say WHY equality is fatal');
});

test('a zero earn_qty on a pooled account is rejected (an order of zero units earns nothing)', () => {
  const rows = goodSet();
  rows[0].earn_qty = '0';
  assert.ok(has(validateFixtureShape(rows), 'earn_qty must each be >= 1'));
});

test('the pooled sum is distinct from each member and from each double', () => {
  const accounts = loadAccounts(goodSet());
  const a = accounts.find((x) => x.aliasName === 'ORG_LOY_A').earnQty;
  const b = accounts.find((x) => x.aliasName === 'ORG_LOY_B').earnQty;
  const pooled = a + b;
  for (const collision of [a, b, 2 * a, 2 * b]) assert.notEqual(pooled, collision);
});

/* ── the locked actor ─────────────────────────────────────────────────────────── */

test('un-locking ORG_LOY_LOCKED leaves the authorization handler nothing to refuse', () => {
  const rows = goodSet();
  rows[2].membership_locked = 'false';
  assert.ok(has(validateFixtureShape(rows), 'membership_locked is not true'));
});

test('a second locked member is rejected — only ORG_LOY_LOCKED is the locked actor', () => {
  const rows = goodSet();
  rows[0].membership_locked = 'true';
  assert.ok(has(validateFixtureShape(rows), 'membership_locked must be false'));
});

/* ── the outsider ─────────────────────────────────────────────────────────────── */

test('giving LOY_PERSONAL_NOORG an org destroys the read-path/spend-path actor', () => {
  const rows = goodSet();
  rows[3].org_id = OUTLET_ORG.key;
  const problems = validateFixtureShape(rows);
  assert.ok(has(problems, 'LOY_PERSONAL_NOORG: has an org'));
  // and it also breaks the "exactly 3 in the outlet" invariant
  assert.ok(has(problems, 'exactly 3 accounts'));
});

test('putting the outsider in the targeted group destroys the audience control', () => {
  const rows = goodSet();
  rows[3].customer_groups = OUTLET_GROUP;
  assert.ok(has(validateFixtureShape(rows), 'must NOT be in'));
});

test('an outlet member dropped from the targeted group cannot see the org mission', () => {
  const rows = goodSet();
  rows[1].customer_groups = '';
  assert.ok(has(validateFixtureShape(rows), `not in ${OUTLET_GROUP}`));
});

/* ── committed-file hygiene ───────────────────────────────────────────────────── */

test('a bare password literal is rejected (td:reconcile secret hygiene)', () => {
  const rows = goodSet();
  rows[0].password = 'Password1!';
  assert.ok(has(validateFixtureShape(rows), 'must be a {{VAR}} token'));
});

test('a runtime GUID in any column is rejected (the multi-env rule)', () => {
  const rows = goodSet();
  rows[0].customer_groups = '105c2c4e-23be-4258-8691-568a0ff190be';
  assert.ok(has(validateFixtureShape(rows), 'runtime GUID'));
});

test('a blank membership_status on a membership-creating row is rejected', () => {
  const rows = goodSet();
  rows[1].membership_status = '';
  assert.ok(has(validateFixtureShape(rows), 'membership_status is blank'));
});

/* ── the mission set ──────────────────────────────────────────────────────────── */

test('no mission reward collides with a missions-e2e reward', () => {
  for (const m of MISSIONS) assert.ok(!RESERVED_REWARDS.includes(m.reward), `${m.aliasName} reuses ${m.reward}`);
});

test('all three rewards are mutually distinct — one order can move more than one mission', () => {
  const rewards = MISSIONS.map((m) => m.reward);
  assert.equal(new Set(rewards).size, rewards.length);
});

test('the count-1 / count-2 pair separates pooled COMPLETION from pooled PROGRESS', () => {
  assert.equal(MISSION_BY_ALIAS.ORG_LOY_MISSION_2.goal.count, 1);
  assert.ok(MISSION_BY_ALIAS.ORG_LOY_MISSION_PARTIAL.goal.count >= 2);
  assert.notEqual(
    MISSION_BY_ALIAS.ORG_LOY_MISSION_2.goal.count,
    MISSION_BY_ALIAS.ORG_LOY_MISSION_PARTIAL.goal.count,
  );
});

test('every mission targets the outlet group and nothing else', () => {
  for (const m of MISSIONS) {
    assert.equal(m.condition.type, 'UserGroupIsCondition', m.aliasName);
    assert.deepEqual(m.condition.groups, [OUTLET_GROUP], m.aliasName);
    assert.equal(m.status, 'Published', m.aliasName);
  }
});

test('mission names are run-scoped and recognisable by the sweep', () => {
  const name = missionName(MISSION, '20260911120000-ab12');
  assert.ok(name.startsWith(`${MISSION_NAME_PREFIX}-`));
  assert.equal(isOrgLoyMissionName(name), true);
  assert.equal(isOrgLoyMissionName(`${MISSION_NAME_PREFIX}-not-a-handle`), false);
  assert.equal(isOrgLoyMissionName('AGENT-TEST-MSN-E2E-20260911120000-ab12'), false,
    'the ORGLOY sweep must never claim a missions-e2e mission');
});

test('generation 1 keeps its legacy (keyless) name, so the already-live mission is still recognised', () => {
  assert.equal(MISSION_BY_ALIAS.ORG_LOY_MISSION.key, '');
  assert.equal(missionName(MISSION_BY_ALIAS.ORG_LOY_MISSION, '20260911142044-0639'),
    'AGENT-TEST-MSN-ORGLOY-20260911142044-0639');
  assert.equal(isOrgLoyMissionName('AGENT-TEST-MSN-ORGLOY-20260911142044-0639'), true);
});

/**
 * THE property the top-up turned on: each spec owns a sweep name-space, so seeding one mission can
 * never delete a sibling. Without it, minting ORG_LOY_MISSION_2 would have swept the CONSUMED
 * ORG_LOY_MISSION — and that record is the evidence that the store-mode flip had not taken effect.
 */
test('a sweep is scoped to its own spec and claims no sibling', () => {
  const names = Object.fromEntries(MISSIONS.map((m) => [m.aliasName, missionName(m, '20260911120000-ab12')]));
  for (const spec of MISSIONS) {
    assert.equal(isMissionOfSpec(spec, names[spec.aliasName]), true, `${spec.aliasName} must claim its own`);
    for (const other of MISSIONS) {
      if (other.aliasName === spec.aliasName) continue;
      assert.equal(isMissionOfSpec(spec, names[other.aliasName]), false,
        `${spec.aliasName}'s sweep must NOT claim ${other.aliasName} — seeding one would delete the other`);
    }
    assert.equal(isOrgLoyMissionName(names[spec.aliasName]), true, 'teardown must still reach every generation');
  }
});

test('the keyless generation-1 namespace does not swallow a keyed sibling', () => {
  // The sharpest edge: `AGENT-TEST-MSN-ORGLOY-` is a literal prefix of `AGENT-TEST-MSN-ORGLOY-M2-`,
  // so a prefix-only match would make generation 1's sweep delete every successor.
  const gen1 = MISSION_BY_ALIAS.ORG_LOY_MISSION;
  assert.equal(isMissionOfSpec(gen1, 'AGENT-TEST-MSN-ORGLOY-M2-20260911120000-ab12'), false);
  assert.equal(isMissionOfSpec(gen1, 'AGENT-TEST-MSN-ORGLOY-P2-20260911120000-ab12'), false);
});

/* ── buildMissionBody: overlaid on the LIVE template, never a literal ─────────── */

const TEMPLATE = {
  id: 'x',
  dynamicExpression: {
    id: 'LoyaltyMissionConditionAndRewardTree',
    children: [
      { id: 'BlockLoyaltyMissionCondition', availableChildren: [{ id: 'UserGroupIsCondition', groups: [] }, { id: 'AnyUserGroupCondition' }], children: [] },
      { id: 'BlockLoyaltyMissionGoals', availableChildren: [{ id: 'OrderCountGoal', count: 0, serverDefault: 'kept' }, { id: 'OrderValueGoal', value: 0 }], children: [] },
      { id: 'BlockLoyaltyReward', availableChildren: [{ id: 'FixedAmountReward', amount: 0 }], children: [] },
    ],
  },
};
const blockOfBody = (body, id) => body.dynamicExpression.children.find((c) => c.id === id);

test('buildMissionBody composes exactly one condition / goal / reward child', () => {
  const body = buildMissionBody({ template: TEMPLATE, storeId: 'B2B-store', runId: '20260911120000-ab12' });
  assert.equal(body.name, missionName(MISSION, '20260911120000-ab12'));
  assert.equal(body.storeId, 'B2B-store');
  assert.equal(body.id, null);
  for (const block of body.dynamicExpression.children) assert.equal(block.children.length, 1);
});

test('the goal is OrderCountGoal 1 and keeps the template-supplied defaults', () => {
  const body = buildMissionBody({ template: TEMPLATE, storeId: 'B2B-store', runId: '20260911120000-ab12' });
  const goal = blockOfBody(body, 'BlockLoyaltyMissionGoals').children[0];
  assert.equal(goal.id, 'OrderCountGoal');
  assert.equal(goal.count, 1);
  assert.equal(goal.serverDefault, 'kept', 'a field the module adds must arrive with its server default, not go missing');
});

test('the condition targets the outlet group — never the constant-true AnyUserGroupCondition', () => {
  const body = buildMissionBody({ template: TEMPLATE, storeId: 'B2B-store', runId: '20260911120000-ab12' });
  const cond = blockOfBody(body, 'BlockLoyaltyMissionCondition').children[0];
  assert.equal(cond.id, 'UserGroupIsCondition');
  assert.deepEqual(cond.groups, [OUTLET_GROUP]);
});

test('the reward is the fixture reward', () => {
  const body = buildMissionBody({ template: TEMPLATE, storeId: 'B2B-store', runId: '20260911120000-ab12' });
  assert.equal(blockOfBody(body, 'BlockLoyaltyReward').children[0].amount, MISSION.reward);
});

test('buildMissionBody refuses to invent a template, a store or a run id', () => {
  assert.throws(() => buildMissionBody({ storeId: 's', runId: 'r' }), /template/);
  assert.throws(() => buildMissionBody({ template: TEMPLATE, runId: 'r' }), /storeId/);
  assert.throws(() => buildMissionBody({ template: TEMPLATE, storeId: 's' }), /runId/);
});

test('the mission window is open at the seed clock', () => {
  const now = new Date('2026-09-11T12:00:00Z');
  const body = buildMissionBody({ template: TEMPLATE, storeId: 'B2B-store', runId: '20260911120000-ab12', now });
  assert.ok(Date.parse(body.startDate) < now.getTime());
  assert.ok(Date.parse(body.endDate) > now.getTime());
});

/* ── validateSeededState: facts about the ENV, which shape validation cannot see ─ */

test('a group the platform silently dropped is reported, never assumed', () => {
  const problems = validateSeededState({
    groupsByAlias: { ORG_LOY_A: [OUTLET_GROUP], ORG_LOY_B: [], ORG_LOY_LOCKED: [OUTLET_GROUP] },
  });
  assert.ok(problems.some((p) => p.startsWith('ORG_LOY_B')));
  assert.ok(problems.some((p) => p.includes('fail-closed')));
});

test('group matching mirrors the server: ordinal case-insensitive', () => {
  assert.deepEqual(
    validateSeededState({ groupsByAlias: { ORG_LOY_A: ['agent-test-orgloy'], ORG_LOY_B: [OUTLET_GROUP], ORG_LOY_LOCKED: [OUTLET_GROUP] } }),
    [],
  );
});

test('equal measured points on A and B is reported even when the quantities differ', () => {
  const problems = validateSeededState({
    groupsByAlias: { ORG_LOY_A: [OUTLET_GROUP], ORG_LOY_B: [OUTLET_GROUP], ORG_LOY_LOCKED: [OUTLET_GROUP] },
    pointsByAlias: { ORG_LOY_A: 30000, ORG_LOY_B: 30000 },
  });
  assert.ok(problems.some((p) => p.includes('SAME number of points')));
});

test('a balance that does not exceed the cheapest PTS line makes a refusal ambiguous', () => {
  const base = { groupsByAlias: { ORG_LOY_A: [OUTLET_GROUP], ORG_LOY_B: [OUTLET_GROUP], ORG_LOY_LOCKED: [OUTLET_GROUP] } };
  assert.ok(validateSeededState({ ...base, noOrgBalance: 22, cheapestPtsPrice: 22 })
    .some((p) => p.includes('NOT strictly greater')));
  assert.deepEqual(validateSeededState({ ...base, noOrgBalance: 23, cheapestPtsPrice: 22 }), []);
});

/* ── org helpers ──────────────────────────────────────────────────────────────── */

test('the outlet org body carries a shipping address and no pinned GUID', () => {
  const body = buildOrgBody();
  assert.equal(body.memberType, 'Organization');
  assert.equal(body.addresses.length, 1);
  assert.match(body.addresses[0].addressType, /Shipping/);
  assert.equal(body.id, undefined, 'the org id is runtime — pinning one here is a multi-env violation');
  assert.equal(orgSeedRow().platform_id, '');
});

test('the sibling org resolves from the committed b2b rows, never from a literal', () => {
  const sibling = resolveSiblingOrg([{ org_id: SIBLING_ORG.csvOrgId, platform_id: 'abc', org_name: 'AGENT-TEST-Org-BuildRight-20260310' }]);
  assert.equal(sibling.id, 'abc');
  assert.throws(() => resolveSiblingOrg([]), /not found/);
});

/* ── the REAL shipped fixture set ─────────────────────────────────────────────── */

test('the committed CSV is clean against the guard', () => {
  assert.deepEqual(validateFixtureShape(readCsv(CSV_SOURCE.file)), []);
});

test('the committed CSV declares exactly the column contract', () => {
  const rows = readCsv(CSV_SOURCE.file);
  assert.deepEqual(Object.keys(rows[0]), COLUMNS);
});

test('the committed CSV puts three members in ONE org and one outside', () => {
  const accounts = loadAccounts(readCsv(CSV_SOURCE.file));
  assert.equal(outletAccounts(accounts).length, 3);
  assert.equal(accountByAlias(accounts, 'LOY_PERSONAL_NOORG').orgKey, '');
});

test('the committed CSV reuses the sibling org that really exists in b2b/organizations.csv', () => {
  const sibling = resolveSiblingOrg(readCsv('b2b/organizations.csv'));
  assert.ok(sibling.id, 'the sibling org must carry its pinned platform_id');
  assert.match(sibling.name, /^AGENT-TEST-/);
});

test('every alias is registered, inline, and has its runtime fields EMPTY in the committed base', () => {
  const base = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
  for (const name of ALIASES) {
    const entry = base[name];
    assert.ok(entry, `alias ${name} is missing from aliases.json`);
    assert.equal(entry._inline, true, `${name} must be inline`);
    assert.ok(entry._notes, `${name} must state its own limits`);
    for (const f of RUNTIME_ALIAS_FIELDS[name]) {
      assert.ok(f in (entry.fields || {}), `${name}.${f} is not exposed in fields{}`);
      assert.equal(String(entry[f] ?? '').trim(), '',
        `${name}.${f} is runtime — an unseeded env must resolve it to "" (a clear miss)`);
    }
  }
});

test('the alias emails agree with the CSV (one identity, not two)', () => {
  const base = JSON.parse(readFileSync(join(ROOT, 'test-data', 'aliases.json'), 'utf8'));
  for (const a of loadAccounts(readCsv(CSV_SOURCE.file))) {
    assert.equal(base[a.aliasName].email, a.email, `${a.aliasName}: alias email drifted from the CSV row`);
  }
});
