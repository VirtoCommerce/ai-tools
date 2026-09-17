/**
 * org-loyalty-specs.mjs — side-effect-free source of truth for the ORGANIZATION-MODE loyalty
 * fixtures (VCST-5024, vc-module-loyalty PR #17).
 *
 * WHAT THE FEATURE IS, SO THE FIXTURE SET CAN BE JUDGED
 * ----------------------------------------------------
 * PR #17 adds a per-store setting `Loyalty.LoyaltyBalanceCalculationMode` ∈ {Customer, Organization}
 * (default `Customer`). In `Organization` mode the balance, earn/redeem, ledger ownership, the
 * distributed lock and mission progress are all re-keyed from the individual user to the user's
 * ORGANIZATION — "multiple managers can purchase and earn loyalty points for the same outlet".
 *
 * THIS MODULE NEVER READS OR WRITES THAT SETTING. Seeding happens in whatever mode the store is in
 * and must not depend on it; the run flips the setting, tests, and restores it.
 *
 * WHY THESE FIXTURES EXIST AT ALL (the gap they close)
 * ---------------------------------------------------
 * Every existing loyalty fixture (`LOYALTY_VIP_USER`, `LOYALTY_NOBAL_USER`, `LOYALTY_WHOLESALE_USER`)
 * is a single Customer account with NO organization, and the multi-org fixtures (`MULTI_ORG_TF_BR`,
 * `MULTI_ORG_TF_BR_ALT`) are ONE account in TWO orgs — the inverse of what this feature needs.
 * Nothing in `test-data/aliases.json` provided TWO accounts in ONE org, so the central mechanism
 * ("the same outlet") was not expressible, let alone falsifiable.
 *
 * THE FIVE FIXTURES AND THE QUESTION EACH ONE DECIDES
 * --------------------------------------------------
 *   ORG_LOY_A          member #1 of the outlet org        half of "multiple managers, same outlet"
 *   ORG_LOY_B          member #2 of the SAME org          the other half; one account cannot express it
 *   ORG_LOY_LOCKED     member #3, membership isLocked     the org-scope refusal has an actor; with
 *                                                         no locked member there is nothing to refuse
 *                                                         (MEASURED mechanism below — it is NOT the
 *                                                         loyalty authorization handler)
 *   LOY_PERSONAL_NOORG NO organization at all, NON-ZERO   the highest-severity hypothesis: on an
 *                      balance                            org-mode store the READ path may fall back
 *                                                         to the user while the SPEND path does not,
 *                                                         so this actor could SEE points it cannot
 *                                                         SPEND. A zero-balance account cannot
 *                                                         discriminate that — the block would look
 *                                                         correct.
 *   ORG_LOY_MISSION    fresh per-run mission, group-      mission completion is TERMINAL per owner; a
 *                      targeted at the outlet's members   shared mission passes once and never again
 *
 * WHERE THE LOCK IS ACTUALLY ENFORCED — measured, not inferred (localhost, 2026-09-16T13:36Z)
 * -------------------------------------------------------------------------------------------
 * The refusal does NOT happen in the loyalty authorization handler. It happens UPSTREAM, at org-scope
 * resolution, so the loyalty handler is never handed an orgId to check at all. A controlled flip of
 * the ONE variable (unlock → re-lock of `ORG_LOY_LOCKED`'s membership, pool funded at 131 665 PTS):
 *
 *   state      token `organization_id`   me.contact.organizationId   loyaltyBalance   pointsHistory
 *   LOCKED     absent (no `permission`)  null                        0                totalCount 0
 *   UNLOCKED   the outlet org, 2 perms   the outlet org              131 665          totalCount 19
 *   RE-LOCKED  absent                    null                        0                totalCount 0
 *
 * What a case author must NOT conclude from `me.contact.organizationId === null`: that the fixture
 * lost its organization. It did not. `contact.organizations` still lists the outlet in BOTH states
 * (REST `/api/members/{id}` and GraphQL `me.contact.organizations.items`) — affiliation survives the
 * lock; only the RESOLVED CURRENT org is withheld. That surviving list is the in-band discriminator
 * against `LOY_PERSONAL_NOORG`, whose list is `[]`.
 *
 * Two further consequences worth knowing before writing an assertion:
 *   • the locked member is served HTTP 200 with `errors[]` ABSENT — the refusal is silent at the
 *     loyalty surface; `query { organization(id) }` is where it surfaces loudly, as `Forbidden`.
 *   • the persisted contact field `currentOrganizationId` is null for this account in EVERY state
 *     (it is never written by this seeder), so it is NOT a lock signal. Read the token claim or
 *     `me.contact.organizationId` instead.
 *
 * DIVERGENCE — the SECOND RULE (`.claude/rules/test-data.md`), enforced by `validateFixtureShape`
 * ---------------------------------------------------------------------------------------------
 *   • `ORG_LOY_A.earn_qty` !== `ORG_LOY_B.earn_qty`, so a POOLED total (A+B) is distinguishable from
 *     either one alone AND from a double-count of either. With equal quantities A+B, 2A and 2B all
 *     collapse onto the same number and "the outlet pooled" would be unfalsifiable.
 *   • `LOY_PERSONAL_NOORG` is funded ABOVE the cheapest PTS line it will be asked to buy (measured
 *     live at seed time, never a literal), so "blocked" can only mean the scope bug and never a
 *     genuine shortfall.
 *   • The outlet org is a DEDICATED org whose only members are these three accounts, and a SIBLING
 *     AGENT-TEST org (`b2b/organizations.csv` ORG-003 BuildRight, already populated by other lanes)
 *     is declared so a cross-org read has something WRONG to return.
 *
 * THE ONE THING THIS SET CANNOT EXPRESS — stated here rather than implied by a green case
 * --------------------------------------------------------------------------------------
 * Mission targeting on this build is BY CUSTOMER GROUP ONLY. `GET /api/loyalty-missions/new` offers
 * exactly `UserGroupIsCondition` and `AnyUserGroupCondition`, and `missions-specs.mjs` §TARGETING
 * records that no `CustomerIsCondition` / org condition exists anywhere in the module. So
 * "a mission targeting that organization's members" is seeded as a GROUP PROXY: the three outlet
 * contacts carry `OUTLET_GROUP` and nothing else does. That is behaviourally equivalent HERE because
 * the org's member set and the group's member set are seeded identically — but it is an equivalence
 * this fixture MAINTAINS, not one the product guarantees. A case must not conclude anything about
 * org-native mission targeting from it.
 *
 * Importing this module has no side effects (no env read, no fs, no network, no main()), so the
 * seeder, the drift guard (`td:validate:org-loyalty`) and the unit tests all import the same code.
 */

import {
  WINDOWS, windowDates, buildGoalNode, buildConditionNode, buildRewardNode,
  blockOf, BLOCK, PROCESSED_PERIODICITY,
} from './missions-specs.mjs';

/* ── Naming / sweep namespace ────────────────────────────────────────────────── */

/** Everything this seeder creates carries this prefix so `--teardown` sweeps it and nothing else. */
export const SEED_PREFIX = 'AGENT-TEST';

/**
 * The customer group that proxies "member of the outlet org" for mission targeting.
 *
 * NOT in the `Customer.MemberGroups` dictionary setting (which on vcst-qa allows only
 * `contract-contract2` / `Wholesaler` / `VIP`) — deliberately. That setting is the Admin UI's
 * pick-list, not a validator: `b2b/organizations.csv` already assigns `store-acme`,
 * `Premium Customers` and `Standard Customers`, none of which are in it either. Using an
 * AGENT-TEST-owned group instead of `VIP` is what keeps the mission's audience equal to the outlet's
 * membership — targeting `VIP` would have pulled in `LOYALTY_VIP_USER` and `LOYALTY_NOBAL_USER`,
 * which other lanes reserve, and the audience would then no longer be the org.
 */
export const OUTLET_GROUP = 'AGENT-TEST-ORGLOY';

/* ── The outlet organization ─────────────────────────────────────────────────── */

/**
 * A DEDICATED org rather than a reused one (TechFlow / BuildRight / AcmeCorp), for one reason that is
 * fatal rather than stylistic: in `Organization` mode the loyalty balance is POOLED ACROSS EVERY
 * MEMBER of the org. Hosting these fixtures in TechFlow or BuildRight would mean `MULTI_ORG_TF_BR`
 * and every other lane's account contributing to — and spending from — the very total the pooled-sum
 * assertion is made on. The pooled number would then be attributable to nothing.
 *
 * `platform_id` is deliberately NOT pinned here. The pinned-GUID exemption in
 * `b2b/organizations.csv` is allowlisted by name in DV-021; a GUID in any other committed file is a
 * plain multi-env violation. The runtime id goes to `aliases.<env>.json`.
 *
 * The address is load-bearing, not decoration: a B2B checkout resolves shipping addresses from the
 * org, and without one the cart never reaches a decisive place-order state (proven 2026-08-05 for
 * suite 083b, recorded in `lib/loyalty-ephemeral-account.mjs`).
 */
export const OUTLET_ORG = {
  key: 'ORGLOY-ORG-1',
  aliasField: 'org_id',
  name: 'AGENT-TEST-Org-LoyaltyOutlet',
  businessCategory: 'Test Org-Mode Loyalty',
  address: {
    addressType: 'BillingAndShipping',
    firstName: 'Outlet', lastName: 'Manager',
    line1: '10 Outlet Row', city: 'New York',
    regionId: 'NY', regionName: 'New York',
    postalCode: '10001', countryCode: 'USA', countryName: 'United States',
    isDefault: true,
  },
};

/**
 * The sibling org a cross-org read could WRONGLY return. Reused, never created: ORG-003 BuildRight is
 * an existing AGENT-TEST org with its own long-lived members (so its own org-mode total is non-zero
 * and DIFFERENT from the outlet's), and its `platform_id` is pinned + committed in
 * `b2b/organizations.csv`, which is the one file allowed to carry one.
 *
 * Referenced by CSV ROW KEY, never by GUID — `resolveSiblingOrg` reads the row.
 */
export const SIBLING_ORG = {
  csvFile: 'b2b/organizations.csv',
  csvOrgId: 'ORG-003',
  aliasName: 'ORG_BUILDRIGHT',
};

/** Pull the sibling org's committed row out of `b2b/organizations.csv`. Pure. */
export function resolveSiblingOrg(orgRows = []) {
  const row = (orgRows || []).find((r) => r.org_id === SIBLING_ORG.csvOrgId);
  if (!row) throw new Error(`sibling org ${SIBLING_ORG.csvOrgId} not found in ${SIBLING_ORG.csvFile}`);
  return { id: row.platform_id, name: row.org_name };
}

/** Build the `POST /api/members` body for the outlet org. Pure. */
export function buildOrgBody(spec = OUTLET_ORG) {
  return {
    memberType: 'Organization',
    name: spec.name,
    businessCategory: spec.businessCategory,
    status: 'Active',
    groups: [],
    addresses: [{ ...spec.address }],
  };
}

/**
 * The org row shape `user-provision.mjs` `seedOrgs()` consumes. Built here rather than committed as a
 * second CSV so there is ONE declaration of the org — `seedOrgs` is reused for its idempotent
 * find-or-create-by-name, not for its file format.
 */
export function orgSeedRow(spec = OUTLET_ORG) {
  return {
    org_id: spec.key,
    platform_id: '',                      // never pinned — see OUTLET_ORG
    org_name: spec.name,
    org_type: 'B2B',
    status: 'Active',
    business_category: spec.businessCategory,
    description: 'AGENT-TEST outlet org for VCST-5024 organization-mode loyalty (pooled balance).',
    emails: 'agent-test-orgloy@test-agent.com',
    phones: '+1-555-AGENT-024',
    groups: '',
    parent_org_id: '',
    address_line1: spec.address.line1,
    city: spec.address.city,
    region_id: spec.address.regionId,
    region_name: spec.address.regionName,
    postal_code: spec.address.postalCode,
    country_code: spec.address.countryCode,
    country_name: spec.address.countryName,
  };
}

/* ── The account fixtures (CSV-backed) ───────────────────────────────────────── */

export const CSV_SOURCE = { file: 'loyalty/org-loyalty-users.csv' };

/** The exact column contract. A renamed column is invisible to every other gate. */
export const COLUMNS = [
  'user_id', 'alias_name', 'email', 'password', 'first_name', 'last_name',
  'org_id', 'roles', 'status', 'membership_locked', 'membership_status',
  'customer_groups', 'pool_role', 'earn_qty', 'seeded', 'test_purpose',
];

/**
 * `pool_role` — what an account is FOR in the pooled-total arithmetic. Declared rather than inferred
 * because "which two accounts sum" is the one fact a reader must not have to guess.
 */
export const POOL_ROLES = Object.freeze({
  POOLED_A: 'pooled-a',
  POOLED_B: 'pooled-b',
  LOCKED_ACTOR: 'locked-actor',
  OUTSIDER: 'outsider',
});

/** Every alias this fixture set owns, in the order the seeder reports them. */
export const ACCOUNT_ALIASES = ['ORG_LOY_A', 'ORG_LOY_B', 'ORG_LOY_LOCKED', 'LOY_PERSONAL_NOORG'];
export const MISSION_ALIASES = ['ORG_LOY_MISSION', 'ORG_LOY_MISSION_2', 'ORG_LOY_MISSION_PARTIAL'];
export const ALIASES = [...ACCOUNT_ALIASES, ...MISSION_ALIASES];

/**
 * Alias fields that are RUNTIME (server-assigned or measured live) and must therefore be EMPTY in the
 * committed base `test-data/aliases.json`, arriving only through `aliases.<env>.json`.
 *
 * Consumed by the drift guard in BOTH directions — the missing-runtime-field check and the
 * overlay-shadow check (`missions-specs.mjs` §overlayShadowProblems: an overlay carrying an AUTHORED
 * business key silently becomes what `@td()` returns, cannot be repaired by re-seeding, and every
 * existing gate stays green).
 */
export const RUNTIME_ALIAS_FIELDS = Object.freeze({
  ORG_LOY_A: ['userId', 'contactId', 'org_id', 'sibling_org_id', 'earn_points_expected', 'balance_at_seed'],
  ORG_LOY_B: ['userId', 'contactId', 'org_id', 'earn_points_expected', 'balance_at_seed'],
  ORG_LOY_LOCKED: ['userId', 'contactId', 'org_id', 'membershipId', 'balance_at_seed'],
  LOY_PERSONAL_NOORG: ['userId', 'contactId', 'balance_at_seed', 'cheapest_pts_sku', 'cheapest_pts_price', 'dearest_pts_sku', 'dearest_pts_price'],
  ORG_LOY_MISSION: ['id', 'name', 'run_id', 'seeded_at'],
  ORG_LOY_MISSION_2: ['id', 'name', 'run_id', 'seeded_at'],
  ORG_LOY_MISSION_PARTIAL: ['id', 'name', 'run_id', 'seeded_at'],
});

/** Parse + normalize the committed CSV rows. Pure. */
export function loadAccounts(rows = []) {
  return (rows || [])
    .filter((r) => String(r.email || '').includes('@'))
    .map((r) => ({
      userId: r.user_id,
      aliasName: r.alias_name,
      email: String(r.email).trim(),
      password: String(r.password || '').trim(),
      firstName: r.first_name,
      lastName: r.last_name,
      orgKey: String(r.org_id || '').trim(),
      roles: String(r.roles || '').trim(),
      status: r.status || 'Approved',
      membershipLocked: /^true$/i.test(r.membership_locked || ''),
      membershipStatus: String(r.membership_status || '').trim(),
      groups: String(r.customer_groups || '').split(';').map((g) => g.trim()).filter(Boolean),
      poolRole: String(r.pool_role || '').trim(),
      earnQty: Number(r.earn_qty || 0),
      seeded: !/^false$/i.test(r.seeded || ''),
      testPurpose: r.test_purpose || '',
    }));
}

export const accountByAlias = (accounts, alias) => accounts.find((a) => a.aliasName === alias) || null;
export const accountByPoolRole = (accounts, role) => accounts.find((a) => a.poolRole === role) || null;
/** The accounts that live INSIDE the outlet org (i.e. everything but the outsider). Pure. */
export const outletAccounts = (accounts) => accounts.filter((a) => a.orgKey === OUTLET_ORG.key);

/* ── The per-run missions ────────────────────────────────────────────────────── */

/**
 * Mission names are `AGENT-TEST-MSN-ORGLOY[-<KEY>]-<YYYYMMDDHHmmss>-<rand4>`. The timestamp shape is
 * the same as the missions-e2e run handle and the ephemeral-account handle, because all of them are
 * parsed by one age parser and a second format could silently disagree with the first.
 *
 * THE PER-SPEC `key` IS A SWEEP NAMESPACE, AND THAT IS THE WHOLE POINT. Each mission spec owns the
 * name-space `…-ORGLOY-<KEY>-`, and a seed sweeps ONLY its own. Without that, seeding a second
 * mission would delete the first — which is exactly what the top-up needed not to happen:
 * `ORG_LOY_MISSION` is consumed but is now EVIDENCE (it recorded the Customer-mode behaviour that
 * exposed the silent store-mode flip), so it must survive while its successors are minted beside it.
 *
 * `ORG_LOY_MISSION` keeps the EMPTY key, so its already-live name is unchanged and both the legacy
 * and keyed forms are recognised by `isOrgLoyMissionName` (teardown has to reach both).
 */
export const MISSION_NAME_PREFIX = `${SEED_PREFIX}-MSN-ORGLOY`;
export const missionNamePrefix = (spec) => (spec?.key ? `${MISSION_NAME_PREFIX}-${spec.key}` : MISSION_NAME_PREFIX);
export const missionName = (spec, runId) => `${missionNamePrefix(spec)}-${runId}`;
/** Does this live name belong to THIS spec's sweep namespace? Pure. */
export const isMissionOfSpec = (spec, name) => new RegExp(`^${missionNamePrefix(spec)}-\\d{14}-[0-9a-f]{4}$`).test(String(name || ''));
/** Does this live name belong to ANY org-loyalty mission (keyed or legacy)? Teardown's predicate. */
export const isOrgLoyMissionName = (name) => new RegExp(`^${MISSION_NAME_PREFIX}(-[A-Z0-9]+)?-\\d{14}-[0-9a-f]{4}$`).test(String(name || ''));

/**
 * THE MISSIONS. All three share targeting (group `AGENT-TEST-ORGLOY`), window and status, and differ
 * ONLY in the question they decide and the reward that makes the answer attributable.
 *
 *   ORG_LOY_MISSION          count 1   the ORIGINAL. CONSUMED on 2026-09-11 and kept deliberately:
 *                                      both ORG_LOY_A and ORG_LOY_B completed it and were each granted
 *                                      617 while the store was still (silently) in Customer mode.
 *                                      Once-per-MEMBER is correct Customer-mode behaviour, so the
 *                                      record is the cleanest evidence that the mode flip had not
 *                                      taken effect — but a terminal mission can never discriminate
 *                                      again, which is why it is REPLACED rather than re-used.
 *   ORG_LOY_MISSION_2        count 1   the live SHARED-COMPLETION question: with the pool genuinely
 *                                      org-scoped, does A completing it CONSUME it for B?
 *   ORG_LOY_MISSION_PARTIAL  count 2   the PARTIAL-ACCUMULATION question this set previously named as
 *                                      an uncovered gap: does A's ONE order advance a TWO-order
 *                                      mission for B (1/2 for both), or only for A?
 *
 * WHY count 1 AND count 2 MUST BOTH EXIST. A shared COMPLETION and a shared INCREMENT are different
 * claims, and a count-1 mission cannot separate them: it is Completed the instant anything accrues, so
 * "B sees it done" is consistent with both "progress is pooled" and "completion is pooled but progress
 * is not". count 2 splits them — after A's single order a pooled implementation reads 1/2 for BOTH
 * members, a user-keyed one reads 1/2 for A and 0/2 for B, and neither is Completed, so the reading is
 * unambiguous. Equal counts on the two would collapse the pair back into one question.
 *
 * WHY EVERY REWARD DIFFERS. The three are simultaneously live and target the same group, so one
 * order can move more than one of them. Identical rewards would make a balance delta or a
 * points-history row name NOTHING — the same failure the missions-e2e set hit with four 500s.
 * `validateFixtureShape` enforces mutual distinctness AND no collision with the missions-e2e
 * rewards (501/509).
 */
export const MISSIONS = [
  {
    aliasName: 'ORG_LOY_MISSION',
    key: '',
    goal: { type: 'OrderCountGoal', count: 1 },
    condition: { type: 'UserGroupIsCondition', groups: [OUTLET_GROUP] },
    reward: 617,
    window: 'active',
    status: 'Published',
    public: true,
    decides: 'shared COMPLETION at count 1 (generation 1 — CONSUMED 2026-09-11 in Customer mode; kept as evidence)',
  },
  {
    aliasName: 'ORG_LOY_MISSION_2',
    key: 'M2',
    goal: { type: 'OrderCountGoal', count: 1 },
    condition: { type: 'UserGroupIsCondition', groups: [OUTLET_GROUP] },
    reward: 619,
    window: 'active',
    status: 'Published',
    public: true,
    decides: 'shared COMPLETION at count 1 — does A completing it consume it for B at organization scope?',
  },
  {
    aliasName: 'ORG_LOY_MISSION_PARTIAL',
    key: 'P2',
    goal: { type: 'OrderCountGoal', count: 2 },
    condition: { type: 'UserGroupIsCondition', groups: [OUTLET_GROUP] },
    reward: 631,
    window: 'active',
    status: 'Published',
    public: true,
    decides: 'PARTIAL ACCUMULATION — after A places ONE order, does B read 1/2 (pooled) or 0/2 (user-keyed)?',
  },
];

export const MISSION_BY_ALIAS = Object.fromEntries(MISSIONS.map((m) => [m.aliasName, m]));
/** The generation that is CURRENT for the shared-completion question (the newest count-1 spec). */
export const MISSION = MISSION_BY_ALIAS.ORG_LOY_MISSION;

/** Rewards these missions must not collide with — the missions-e2e set's own (see MISSIONS). */
export const RESERVED_REWARDS = [501, 509];

/**
 * Compose the `POST /api/loyalty-missions` body from the LIVE `GET /api/loyalty-missions/new`
 * template. Every node is OVERLAID onto the template's own `availableChildren` prototype (the shared
 * `buildGoalNode` / `buildConditionNode` / `buildRewardNode` from `missions-specs.mjs`), so a field
 * the module adds or renames arrives with its server-supplied default instead of silently going
 * missing — the GOLDEN RULE applied to an API body. Pure.
 */
export function buildMissionBody({ template, storeId, runId, now = new Date(), spec = MISSION } = {}) {
  if (!template) throw new Error('buildMissionBody needs the GET /api/loyalty-missions/new template');
  if (!storeId) throw new Error('buildMissionBody needs a storeId');
  if (!runId) throw new Error('buildMissionBody needs a runId');
  if (!spec) throw new Error('buildMissionBody needs a mission spec');
  const tree = template.dynamicExpression;
  const { startDate, endDate } = windowDates(spec.window, now);
  return {
    ...template,
    id: null,
    name: missionName(spec, runId),
    storeId,
    status: spec.status,
    public: spec.public,
    periodicity: PROCESSED_PERIODICITY,
    startDate,
    endDate,
    dynamicExpression: {
      ...tree,
      children: [
        { ...blockOf(tree, BLOCK.condition), children: [buildConditionNode(spec, blockOf(tree, BLOCK.condition))] },
        { ...blockOf(tree, BLOCK.goals), children: [buildGoalNode(spec, blockOf(tree, BLOCK.goals))] },
        { ...blockOf(tree, BLOCK.reward), children: [buildRewardNode(spec, blockOf(tree, BLOCK.reward))] },
      ],
    },
  };
}

/* ── Shape validation — the drift guard's deterministic core ─────────────────── */

const GUID_RE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[0-9a-f]{32})$/i;
const VAR_TOKEN_RE = /^\{\{\s*[A-Z0-9_]+\s*\}\}$/;

/**
 * Assert the committed fixture set is internally coherent and still DISCRIMINATING. Returns an array
 * of problem strings ([] = clean).
 *
 * Every rule below exists because breaking it leaves a fixture that still seeds, still resolves and
 * still passes — while answering nothing. That is the failure class this file is here to prevent.
 */
export function validateFixtureShape(rows = []) {
  const problems = [];
  const accounts = loadAccounts(rows);
  const p = (m) => problems.push(m);

  // -- column contract + hygiene -------------------------------------------------
  for (const r of rows) {
    for (const col of COLUMNS) {
      if (!(col in r)) { p(`row ${r.user_id || '(no id)'}: missing column "${col}"`); break; }
    }
    for (const [col, val] of Object.entries(r)) {
      if (GUID_RE.test(String(val || '').trim())) {
        p(`row ${r.user_id}: column "${col}" holds a runtime GUID — it belongs in aliases.<env>.json, never in a committed CSV`);
      }
    }
  }

  if (accounts.length !== 4) p(`expected exactly 4 account rows, found ${accounts.length}`);

  const emails = new Set();
  for (const a of accounts) {
    if (emails.has(a.email)) p(`duplicate email ${a.email}`);
    emails.add(a.email);

    // A bare password literal in committed test data fails td:reconcile secret hygiene. The token
    // form is also what lets Playwright's --secrets substitute it BY BARE KEY NAME.
    if (!VAR_TOKEN_RE.test(a.password)) {
      p(`${a.aliasName}: password must be a {{VAR}} token (found ${a.password ? 'a literal' : 'an empty cell'})`);
    }
    if (!a.email.startsWith('agent-test-')) {
      p(`${a.aliasName}: email "${a.email}" lacks the agent-test- prefix, so teardown cannot sweep it`);
    }
    if (!a.testPurpose) p(`${a.aliasName}: no test_purpose — an undocumented fixture gets "tidied" into uselessness`);
    if (!ALIASES.includes(a.aliasName)) p(`${a.aliasName}: not a declared alias (${ALIASES.join(', ')})`);
  }

  // -- the outlet: three members, ONE org ---------------------------------------
  const inOutlet = outletAccounts(accounts);
  if (inOutlet.length !== 3) {
    p(`the outlet org must hold exactly 3 accounts (A, B, LOCKED); found ${inOutlet.length}. `
      + 'Two members in ONE org IS the mechanism — one account cannot express it.');
  }
  for (const a of inOutlet) {
    if (!a.membershipStatus) {
      p(`${a.aliasName}: membership_status is blank — a blank cell falls through to the CONTACT's status, `
        + 'so the per-org status a suite asserts on becomes a side effect of a different entity');
    }
    if (!a.roles) p(`${a.aliasName}: no role — provisionContactLogins skips a membership with no role`);
    if (!a.groups.includes(OUTLET_GROUP)) {
      p(`${a.aliasName}: not in ${OUTLET_GROUP} — the mission targets that group, so an outlet member `
        + 'outside it cannot see the mission the org is supposed to own');
    }
  }

  // -- the locked member ---------------------------------------------------------
  const locked = accountByAlias(accounts, 'ORG_LOY_LOCKED');
  if (locked && !locked.membershipLocked) {
    p('ORG_LOY_LOCKED: membership_locked is not true — the lock is what withholds the resolved org '
      + 'scope (token organization_id claim), so with no locked member there is nothing to refuse');
  }
  for (const a of accounts.filter((x) => x.aliasName !== 'ORG_LOY_LOCKED')) {
    if (a.membershipLocked) p(`${a.aliasName}: membership_locked must be false — only ORG_LOY_LOCKED is the locked actor`);
  }

  // -- the outsider --------------------------------------------------------------
  const outsider = accountByAlias(accounts, 'LOY_PERSONAL_NOORG');
  if (outsider) {
    if (outsider.orgKey) {
      p('LOY_PERSONAL_NOORG: has an org — the whole point is an account with NO organization membership at all, '
        + 'so the read-path/spend-path asymmetry has an actor it can be observed on');
    }
    if (outsider.groups.includes(OUTLET_GROUP)) {
      p(`LOY_PERSONAL_NOORG: must NOT be in ${OUTLET_GROUP} — it is the control that proves the mission's audience `
        + 'is the outlet and not everybody');
    }
    if (!(outsider.earnQty > 0)) {
      p('LOY_PERSONAL_NOORG: earn_qty must be > 0 — its balance cannot be SET on this platform (the loyalty '
        + 'operation log is read-only), so it can only be EARNED, and qty 0 earns nothing');
    }
  }

  // -- THE divergence guard ------------------------------------------------------
  const a = accountByPoolRole(accounts, POOL_ROLES.POOLED_A);
  const b = accountByPoolRole(accounts, POOL_ROLES.POOLED_B);
  if (!a || !b) {
    p(`both pool roles must be present (${POOL_ROLES.POOLED_A} / ${POOL_ROLES.POOLED_B})`);
  } else if (a.earnQty === b.earnQty) {
    p(`ORG_LOY_A and ORG_LOY_B have EQUAL earn_qty (${a.earnQty}). Equal values on both sides of a distinction `
      + 'under test are a data defect: A+B, 2A and 2B collapse onto the same number, so a pooled total '
      + 'cannot be told apart from a double-count of either member.');
  } else if (a.earnQty < 1 || b.earnQty < 1) {
    p('ORG_LOY_A / ORG_LOY_B earn_qty must each be >= 1 — an order of zero units earns nothing');
  }

  // -- the missions --------------------------------------------------------------
  const seenKeys = new Set();
  const seenRewards = new Map();
  for (const m of MISSIONS) {
    const id = m.aliasName;
    if (!MISSION_ALIASES.includes(id)) p(`${id}: not a declared mission alias`);
    if (seenKeys.has(m.key)) {
      p(`${id}: sweep key "${m.key}" is already used. Each mission needs its OWN name-space or a seed of `
        + 'one would delete the other — which is precisely what the ORG_LOY_MISSION generation must survive.');
    }
    seenKeys.add(m.key);
    if (m.key && !/^[A-Z0-9]+$/.test(m.key)) p(`${id}: sweep key "${m.key}" must be [A-Z0-9]+ so isMissionOfSpec can anchor on it`);

    if (!WINDOWS[m.window]) p(`${id}: unknown window intent "${m.window}"`);
    else if (!WINDOWS[m.window].expectOpen) p(`${id}: window "${m.window}" is not an OPEN window — a closed mission accrues nothing`);
    if (m.status !== 'Published') p(`${id}: must be Published — a Draft mission never reaches the storefront`);
    if (m.goal?.type !== 'OrderCountGoal' || !(m.goal.count >= 1)) {
      p(`${id}: must be an OrderCountGoal with count >= 1`);
    }
    if (m.condition?.type !== 'UserGroupIsCondition' || !m.condition.groups?.includes(OUTLET_GROUP)) {
      p(`${id}: must be UserGroupIsCondition targeting ${OUTLET_GROUP}. AnyUserGroupCondition is a CONSTANT TRUE `
        + '(missions-specs.mjs §4), so it would target everybody and the audience would no longer be the org.');
    }
    if (m.condition?.groups?.length !== 1) {
      p(`${id}: exactly one targeted group. The condition block persists with all:false = OR, so a second `
        + 'condition child would OR a real predicate with something else and the targeting becomes a silent no-op.');
    }
    if (RESERVED_REWARDS.includes(m.reward)) {
      p(`${id}: reward ${m.reward} collides with a missions-e2e reward (${RESERVED_REWARDS.join('/')}) — `
        + 'a balance delta would no longer be attributable to this mission');
    }
    if (seenRewards.has(m.reward)) {
      p(`${id}: reward ${m.reward} is already used by ${seenRewards.get(m.reward)}. All three missions are live at `
        + 'once and target the same group, so ONE order can move more than one of them; identical rewards make a '
        + 'balance delta and a points-history row name NOTHING.');
    }
    seenRewards.set(m.reward, id);
  }

  // THE partial-vs-shared divergence: a count-1 and a count-2 mission answer different questions, and
  // equal counts collapse them back into one.
  const shared = MISSION_BY_ALIAS.ORG_LOY_MISSION_2;
  const partial = MISSION_BY_ALIAS.ORG_LOY_MISSION_PARTIAL;
  if (!shared || !partial) {
    p('both ORG_LOY_MISSION_2 (shared completion) and ORG_LOY_MISSION_PARTIAL (partial accumulation) must exist');
  } else {
    if (shared.goal.count !== 1) p(`ORG_LOY_MISSION_2: count must be 1 — it is the shared-COMPLETION probe (found ${shared.goal.count})`);
    if (!(partial.goal.count >= 2)) {
      p(`ORG_LOY_MISSION_PARTIAL: count must be >= 2 (found ${partial.goal.count}). At count 1 the mission is `
        + 'Completed the instant anything accrues, so "B sees it done" cannot separate pooled PROGRESS from pooled '
        + 'COMPLETION — which is the only thing this fixture is for.');
    }
    if (shared.goal.count === partial.goal.count) {
      p('ORG_LOY_MISSION_2 and ORG_LOY_MISSION_PARTIAL have EQUAL counts — the pair then asks one question twice');
    }
  }

  return problems;
}

/**
 * Problems in the SEEDED state, judged against what the seeder actually observed. Pure; the seeder
 * passes its live readings in. Separate from `validateFixtureShape` because these are facts about the
 * environment, not about the committed file.
 */
export function validateSeededState({ groupsByAlias = {}, pointsByAlias = {}, noOrgBalance = null, cheapestPtsPrice = null } = {}) {
  const problems = [];
  for (const alias of ['ORG_LOY_A', 'ORG_LOY_B', 'ORG_LOY_LOCKED']) {
    const observed = (groupsByAlias[alias] || []).map((g) => String(g).toLowerCase());
    if (!observed.includes(OUTLET_GROUP.toLowerCase())) {
      problems.push(`${alias}: the platform did NOT store group ${OUTLET_GROUP} (observed [${(groupsByAlias[alias] || []).join(', ')}]). `
        + 'UserGroupIsCondition is fail-closed and NOT trimmed, so a silently dropped or padded group targets NOBODY.');
    }
  }
  const pa = Number(pointsByAlias.ORG_LOY_A);
  const pb = Number(pointsByAlias.ORG_LOY_B);
  if (Number.isFinite(pa) && Number.isFinite(pb) && pa === pb) {
    problems.push(`ORG_LOY_A and ORG_LOY_B would earn the SAME number of points (${pa}) despite different quantities — `
      + 'the pooled total is not distinguishable from a double-count. Check the winning program factor and unit price.');
  }
  if (noOrgBalance != null && cheapestPtsPrice != null && !(noOrgBalance > cheapestPtsPrice)) {
    problems.push(`LOY_PERSONAL_NOORG balance ${noOrgBalance} is NOT strictly greater than the cheapest PTS line `
      + `(${cheapestPtsPrice}) — a refusal to spend would then be a genuine shortfall, not the scope bug under test`);
  }
  return problems;
}
