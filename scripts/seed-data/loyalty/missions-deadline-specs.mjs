/**
 * scripts/seed-data/loyalty/missions-deadline-specs.mjs
 *
 * SINGLE SOURCE OF TRUTH for the VCST-5957 "deadline + availability" mission set — the data the
 * redesigned `/account/missions` page (vc-frontend PR #2524) needs and that no other fixture set in
 * this repo can produce. Side-effect-free: no env load, no network, no fs, no main(). The seeder
 * (seed-missions-deadline.mjs) and the drift guard (validate-missions-deadline-data.mjs) import it.
 *
 * WHAT IT IS FOR — three states, each unreachable from the existing fixtures
 * -------------------------------------------------------------------------
 * 1. THE DEADLINE LADDER (#25). The card's date dot is `resolveDateSeverity(mission, daysRemaining)`
 *    in `useMissionCard.ts`: completed -> success; null or > DATE_WARNING_DAYS -> success;
 *    <= DATE_DANGER_DAYS -> danger; otherwise warning. `daysRemaining` is computed per request in the
 *    xAPI resolver (`LoyaltyUserMissionType`, Loyalty 3.1009.0) as
 *    `ceil((EndDate - UtcNow).TotalDays)`, floored at 0, null without an EndDate. Every long-lived
 *    fixture in missions-specs/missions-e2e-specs sits on a 180-day window (observed 157-160 today),
 *    and the one short window (MSN_ENDING_SOON, 5 days) expired on 2026-09-12 — its progress rows are
 *    status `Expired`, so it is not on the page at all. No edge (1, 15, 16, 30, 31) was reachable.
 * 2. COMPLETED INSIDE THE DANGER BAND (#26). The completed override is the first branch of
 *    resolveDateSeverity; a surface that skips it shows "N days left" in red on a mission already won.
 *    It needs real progress — ONE order by the reading account after the mission is published.
 * 3. A SKU TARGET WITH NO availabilityData (#30). `Product.availabilityData` is NON_NULL in the xAPI
 *    schema (introspected live 2026-10-01), so the field can never be null on a returned product —
 *    the only way the storefront receives a target with no flags is `items[].product: null`. Measured:
 *      - an INACTIVE product is still returned, with every flag present and false (NOT this state);
 *      - a product id that no longer exists is OMITTED by xCatalog, so its goal item's `product` is null.
 *    So the fixture is a goal item whose product was DELETED after the mission was authored — an
 *    ordinary merchant action. `sku-mission-modal.vue` still renders that row (name falls back to the
 *    productId) and feeds `?? false` into all four QuantityControl flags; that is the PR's own fix.
 *
 * DISCRIMINATION (SECOND RULE) — every distinction under test is a seeded PAIR that differs in ONE thing
 *   DUE_15 / DUE_16       same goal type (OrderCount), adjacent days, opposite sides of DATE_DANGER_DAYS
 *   DUE_30 / DUE_31       same goal type (OrderValue), adjacent days, opposite sides of DATE_WARNING_DAYS
 *   DUE_15 / DONE_SOON    same goal type, SAME daysRemaining (15); only `completed` differs -> danger vs success
 *   SKU_NOAVAIL rows      in-stock target (flags true) next to a deleted target (product null)
 * Goal types vary ACROSS pairs (PerSku / OrderCount / OrderValue), never within one.
 *
 * WHY THIS IS RUN-SCOPED AND TIME-TERMINAL (FIFTH RULE)
 * ----------------------------------------------------
 * A deadline band moves every day by construction, and a Published mission is immutable — so this
 * set is correct for ONE run window and is minted fresh per run under a run handle. The durable
 * regression cases must create their own mission in-case; this seed serves today's /qa-test run.
 * endDate = seedClock + N days - DAY_OFFSET_SLACK_HOURS, so `daysRemaining` reads exactly N from the
 * seed until seedClock + DAY_OFFSET_SLACK_HOURS (`validUntil`). The seed clock is the PLATFORM's
 * clock (HTTP Date header), not this machine's.
 *
 * VISIBILITY. Published missions are shown to EVERY account on the env regardless of `public`
 * (domain map D7). Everything is named `AGENT-TEST-MSN-VCST5957-<run>-<KEY>` and teardown ARCHIVES
 * (Published -> Archived is the only legal transition; DELETE 500s once a mission has transactions).
 */

/** Everything this seeder creates carries this prefix; teardown sweeps exactly it. */
export const NAME_PREFIX = 'AGENT-TEST-MSN-VCST5957';

/** The overlay alias that records the run handle, its clock and its validity window. */
export const RUN_ALIAS = 'MSN_DL_RUN';

/** Whose view the set is built for: the account the VCST-5957 plan reads `/account/missions` as. */
export const READER_ALIAS = 'LOY_PERSONAL_NOORG';

/**
 * The storefront's two band edges, from `useMissionCard.ts` at vc-frontend PR #2524 head
 * (DATE_DANGER_DAYS / DATE_WARNING_DAYS). Declared here only because the ladder is meaningless without
 * the numbers it straddles; if the frontend moves them, this is the one place the fixture follows.
 * (missions-specs.mjs DANGER_THRESHOLD_DAYS = 10 is the PRE-#2524 threshold and is not used here.)
 */
export const DATE_DANGER_DAYS = 15;
export const DATE_WARNING_DAYS = 30;

/** Mirror of `resolveDateSeverity` — used by the guard to prove each pair straddles a band. Pure. */
export function severityFor({ daysRemaining, completed }) {
  if (completed) return 'success';
  if (daysRemaining === null || daysRemaining === undefined || daysRemaining > DATE_WARNING_DAYS) return 'success';
  return daysRemaining <= DATE_DANGER_DAYS ? 'danger' : 'warning';
}

/**
 * Hours subtracted from N whole days. With 12 h, `ceil` reads N for the first 12 h after the seed
 * and the platform/seeder clocks may disagree by up to 12 h before an edge moves the wrong way.
 */
export const DAY_OFFSET_SLACK_HOURS = 12;

/** Minutes until the expired-not-swept mission's window closes (it must still be open when the order lands). */
export const EXPIRING_SOON_MINUTES = 20;

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/**
 * The SKU targets. `fromAlias` names the alias that already owns the product (business key in the
 * committed base, productId in the env overlay) — this module never declares a second copy of it.
 * `GONE` is the one product this seeder creates, and it creates it only to delete it.
 */
export const TARGETS = {
  IN_STOCK: { fromAlias: 'MSN_PERSKU_PRODUCT_A' },
  OTHER: { fromAlias: 'MSN_PERSKU_PRODUCT_B' },
  GONE: {
    aliasName: 'MSN_DL_NOAVAIL_PRODUCT',
    sku: `${NAME_PREFIX}-GONE`,
    name: 'AGENT-TEST Missions Deleted Target',
    // Inherits catalog + category from this alias's product (the 083c out-of-stock target).
    catalogFromAlias: 'MSN_ZEROSTOCK_PRODUCT',
  },
};

/**
 * The single order that gives the reading account real progress (need #26). The line product is the
 * 083d denomination unit: cash-priced, untracked (cannot drain), and — checked live before the order —
 * not a PerSku target of any mission the reader can see, so the order moves no SKU row anywhere.
 */
export const READER_ORDER = {
  key: 'ORD',
  lineFromAlias: 'MSN_E2E_PRODUCT_UNIT',
  quantity: 1,
  status: 'New',
};

/** Banner per goal type, borrowed from the 083c fixtures that uploaded it (per-env URL, overlay only). */
export const BANNER_FROM_ALIAS = {
  OrderValueGoal: 'MSN_ORDERVALUE',
  OrderCountGoal: 'MSN_ORDERCOUNT',
  PerSkuGoal: 'MSN_PERSKU_ALL',
};

/** A goal no reader order in this run can complete. Large and explicit, never "probably enough". */
const UNREACHABLE_COUNT = 50;
const UNREACHABLE_VALUE = 100000;

/**
 * THE SET. `days` is the daysRemaining the reader must see during the validity window; null = the
 * expired-not-swept mission (observed, not predicted). `phase` orders creation around the order:
 * `pre` missions exist BEFORE the reader's order (so it accrues to them), `post` ones after it (so it
 * cannot). Rewards are unique so the points chip identifies a card.
 */
export const MISSIONS = [
  {
    aliasName: 'MSN_DL_DUE_01', key: 'DUE-01', days: 1, phase: 'post',
    goal: { type: 'PerSkuGoal', all: false }, targets: [{ slot: 'OTHER', quantity: 99 }],
    reward: 101, expect: { status: 'InProgress', severity: 'danger' },
    purpose: 'Minimum non-zero deadline (1 day left). PerSkuAny with an unreachable quantity on target B.',
  },
  {
    aliasName: 'MSN_DL_DUE_15', key: 'DUE-15', days: 15, phase: 'post',
    goal: { type: 'OrderCountGoal', count: UNREACHABLE_COUNT },
    reward: 115, expect: { status: 'InProgress', severity: 'danger' },
    purpose: 'Danger edge (daysRemaining == DATE_DANGER_DAYS, inclusive). Pairs with DUE_16 and with DONE_SOON.',
  },
  {
    aliasName: 'MSN_DL_DUE_16', key: 'DUE-16', days: 16, phase: 'post',
    goal: { type: 'OrderCountGoal', count: UNREACHABLE_COUNT },
    reward: 116, expect: { status: 'InProgress', severity: 'warning' },
    purpose: 'First warning day. Same goal type as DUE_15 so the band is the only difference.',
  },
  {
    aliasName: 'MSN_DL_DUE_30', key: 'DUE-30', days: 30, phase: 'post',
    goal: { type: 'OrderValueGoal', value: UNREACHABLE_VALUE, currency: 'store-default' },
    reward: 130, expect: { status: 'InProgress', severity: 'warning' },
    purpose: 'Warning edge (daysRemaining == DATE_WARNING_DAYS, inclusive). Pairs with DUE_31.',
  },
  {
    aliasName: 'MSN_DL_DUE_31', key: 'DUE-31', days: 31, phase: 'post',
    goal: { type: 'OrderValueGoal', value: UNREACHABLE_VALUE, currency: 'store-default' },
    reward: 131, expect: { status: 'InProgress', severity: 'success' },
    purpose: 'First safe day. Same goal type as DUE_30 so the band is the only difference.',
  },
  {
    aliasName: 'MSN_DL_DONE_SOON', key: 'DONE-15', days: 15, phase: 'pre',
    goal: { type: 'OrderCountGoal', count: 1 },
    reward: 215, expect: { status: 'Completed', severity: 'success' },
    purpose: 'Completed with 15 days left: the completed override must beat danger. Completed by READER_ORDER.',
  },
  {
    aliasName: 'MSN_DL_EXPIRED', key: 'DUE-00', days: null, phase: 'pre', expiresInMinutes: EXPIRING_SOON_MINUTES,
    goal: { type: 'OrderCountGoal', count: UNREACHABLE_COUNT },
    reward: 100, expect: { status: 'InProgress', severity: 'danger', observational: true },
    purpose: 'Expired-not-swept: the order gives the reader a progress row while the window is open; the '
      + 'window then closes. Until the expiry job flips the row to Expired it may read daysRemaining 0. '
      + 'OBSERVATIONAL — whether it renders under statuses [InProgress, Completed] is what the run records.',
  },
  {
    aliasName: 'MSN_DL_SKU_NOAVAIL', key: 'SKU-NOAVAIL', days: 60, phase: 'post',
    goal: { type: 'PerSkuGoal', all: true }, targets: [{ slot: 'IN_STOCK', quantity: 1 }, { slot: 'GONE', quantity: 1 }],
    reward: 230, expect: { status: 'InProgress', severity: 'success' },
    purpose: 'SKU modal with an in-stock row (flags true) next to a target whose product was deleted '
      + '(items[].product null, so no availabilityData reaches the stepper).',
  },
];

export const MISSION_BY_ALIAS = Object.fromEntries(MISSIONS.map((m) => [m.aliasName, m]));

/**
 * NOT a fixture: the seeder's own proof that its teardown works. Published with a window that opens
 * 30 days from now (so no customer query returns it), then archived by the same function teardown
 * uses, then read back. Archive is the only teardown this set has, and it is irreversible — so it is
 * proven on a mission nobody can see rather than on the fixtures the run is about to read.
 */
export const TEARDOWN_PROBE = {
  key: 'TEARDOWN-PROBE', startInDays: 30, lengthDays: 1,
  goal: { type: 'OrderCountGoal', count: UNREACHABLE_COUNT }, reward: 1,
};

/** Runtime fields per alias kind — empty in the committed base, written to aliases.<env>.json. */
export const RUNTIME_FIELDS_BY_KIND = {
  mission: ['id', 'name', 'run_id', 'end_date', 'valid_until', 'days_remaining_at_seed', 'status_at_seed', 'percentage_at_seed'],
  run: ['run_id', 'seeded_at', 'valid_until', 'clock_skew_ms', 'reader_user_id', 'order_id', 'order_number',
    'balance_before', 'balance_after', 'order_co_completed', 'expired_observation'],
  product: ['productId', 'catalogId', 'deleted_at'],
};

export function runtimeFieldsFor(aliasName) {
  if (aliasName === RUN_ALIAS) return RUNTIME_FIELDS_BY_KIND.run;
  if (aliasName === TARGETS.GONE.aliasName) return RUNTIME_FIELDS_BY_KIND.product;
  if (MISSION_BY_ALIAS[aliasName]) return RUNTIME_FIELDS_BY_KIND.mission;
  return null;
}

export const ALL_ALIASES = [RUN_ALIAS, TARGETS.GONE.aliasName, ...MISSIONS.map((m) => m.aliasName)];

/* ── Names and run handles ─────────────────────────────────────────────────── */

/** `yyyymmddHHMM` (UTC) of the seed clock. Pure. */
export const newRunId = (clock) => new Date(clock).toISOString().replace(/[-:T]/g, '').slice(0, 12);

export const missionName = (spec, runId) => `${NAME_PREFIX}-${runId}-${spec.key}`;

export const isOurMissionName = (name) => typeof name === 'string' && name.startsWith(`${NAME_PREFIX}-`);

/** The run handle embedded in a mission name, or null. Pure. */
export function runIdFromName(name) {
  if (!isOurMissionName(name)) return null;
  const m = name.slice(NAME_PREFIX.length + 1).match(/^(\d{12})-/);
  return m ? m[1] : null;
}

/* ── Windows ─────────────────────────────────────────────────────────────── */

/** startDate / endDate for a spec against the PLATFORM seed clock (ms). Pure. */
export function windowFor(spec, clock) {
  if (spec.startInDays) {
    const s = clock + spec.startInDays * DAY;
    return { startDate: new Date(s).toISOString(), endDate: new Date(s + spec.lengthDays * DAY).toISOString() };
  }
  const startDate = new Date(clock - DAY).toISOString();
  if (spec.expiresInMinutes) return { startDate, endDate: new Date(clock + spec.expiresInMinutes * 60 * 1000).toISOString() };
  return { startDate, endDate: new Date(clock + spec.days * DAY - DAY_OFFSET_SLACK_HOURS * HOUR).toISOString() };
}

/** The last instant at which every `days` mission still reads exactly its `days`. Pure. */
export const validUntil = (clock) => new Date(clock + DAY_OFFSET_SLACK_HOURS * HOUR).toISOString();

/** The resolver's arithmetic, for predicting a reading at a given instant. Pure. */
export function predictDaysRemaining(endDate, at) {
  if (!endDate) return null;
  return Math.max(0, Math.ceil((Date.parse(endDate) - at) / DAY));
}

/* ── Body builders (pure; the node builders come from missions-specs) ────── */

export function buildBody(spec, { template, storeId, runId, clock, currencies, bannerUrl, nodes }) {
  if (!template?.dynamicExpression) throw new Error('buildBody needs the GET /api/loyalty-missions/new template');
  const tree = template.dynamicExpression;
  const block = (id) => (tree.children || []).find((b) => b.id === id);
  const { startDate, endDate } = windowFor(spec, clock);
  // The shared builders take a missions-specs-shaped spec; adapt, never fork them.
  const shaped = { aliasName: spec.aliasName, goal: spec.goal, reward: spec.reward, condition: { type: 'AnyUserGroupCondition' } };
  const goalBlock = block('BlockLoyaltyMissionGoals');
  const condBlock = block('BlockLoyaltyMissionCondition');
  const rewardBlock = block('BlockLoyaltyReward');
  return {
    ...template,
    id: null,
    name: missionName(spec, runId),
    bannerUrl,
    storeId,
    status: 'Published',
    public: true,
    periodicity: 'None',
    startDate,
    endDate,
    dynamicExpression: {
      ...tree,
      children: [
        { ...condBlock, children: [nodes.condition(shaped, condBlock)] },
        { ...goalBlock, children: [nodes.goal(shaped, goalBlock, { currencies })] },
        { ...rewardBlock, children: [nodes.reward(shaped, rewardBlock)] },
      ],
    },
  };
}

/* ── Static shape (the guard runs this; the seeder runs it before any write) ─ */

export function validateSpecShape() {
  const p = [];
  const by = MISSION_BY_ALIAS;
  for (const m of MISSIONS) {
    if (!m.aliasName || !m.key || !m.goal?.type) p.push(`${m.aliasName || '?'}: aliasName/key/goal.type are required`);
    if (!['pre', 'post'].includes(m.phase)) p.push(`${m.aliasName}: phase must be pre|post`);
    if (m.days !== null && !(Number.isInteger(m.days) && m.days >= 1)) p.push(`${m.aliasName}: days must be a positive integer (or null for the expired one)`);
    const declared = severityFor({ daysRemaining: m.days === null ? 0 : m.days, completed: m.expect.status === 'Completed' });
    if (declared !== m.expect.severity) p.push(`${m.aliasName}: declares severity ${m.expect.severity} but its days/status give ${declared}`);
    if (m.goal.type === 'PerSkuGoal' && !(m.targets || []).length) p.push(`${m.aliasName}: a PerSku mission with no targets is permanently uncompletable and renders an empty modal`);
    // Only DONE_SOON may be completable by the reader's single order.
    const completable = (m.goal.type === 'OrderCountGoal' && m.goal.count <= 1 && m.phase === 'pre');
    if (completable !== (m.expect.status === 'Completed')) {
      p.push(`${m.aliasName}: expects ${m.expect.status} but the one reader order ${completable ? 'WOULD' : 'would NOT'} complete it`);
    }
  }
  const rewards = MISSIONS.map((m) => m.reward);
  if (new Set(rewards).size !== rewards.length) p.push('rewards must be unique — the points chip is how a case tells cards apart');
  const keys = MISSIONS.map((m) => m.key);
  if (new Set(keys).size !== keys.length) p.push('mission keys must be unique');

  // The ladder itself: every edge value present, and each pair straddles its band with ONE difference.
  const ladder = MISSIONS.filter((m) => m.days !== null && m.expect.status !== 'Completed').map((m) => m.days);
  for (const d of [1, DATE_DANGER_DAYS, DATE_DANGER_DAYS + 1, DATE_WARNING_DAYS, DATE_WARNING_DAYS + 1]) {
    if (!ladder.includes(d)) p.push(`deadline ladder is missing daysRemaining=${d}`);
  }
  const pair = (a, b, why) => {
    const x = by[a]; const y = by[b];
    if (!x || !y) { p.push(`pair ${a}/${b} is not declared`); return; }
    if (x.goal.type !== y.goal.type) p.push(`${a}/${b}: different goal types — the ${why} would not be the only difference`);
    const sx = severityFor({ daysRemaining: x.days, completed: x.expect.status === 'Completed' });
    const sy = severityFor({ daysRemaining: y.days, completed: y.expect.status === 'Completed' });
    if (sx === sy) p.push(`${a}/${b}: both render ${sx} — the ${why} is undecidable on this data`);
  };
  pair('MSN_DL_DUE_15', 'MSN_DL_DUE_16', 'danger/warning edge');
  pair('MSN_DL_DUE_30', 'MSN_DL_DUE_31', 'warning/success edge');
  pair('MSN_DL_DUE_15', 'MSN_DL_DONE_SOON', 'completed override');
  if (by.MSN_DL_DUE_15 && by.MSN_DL_DONE_SOON && by.MSN_DL_DUE_15.days !== by.MSN_DL_DONE_SOON.days) {
    p.push('MSN_DL_DONE_SOON must have the SAME days as MSN_DL_DUE_15, or the override pair differs in two things');
  }
  const sku = by.MSN_DL_SKU_NOAVAIL;
  if (!sku || !sku.targets.some((t) => t.slot === 'GONE') || !sku.targets.some((t) => t.slot === 'IN_STOCK')) {
    p.push('MSN_DL_SKU_NOAVAIL must pair an IN_STOCK target with the GONE target');
  }
  if (DAY_OFFSET_SLACK_HOURS <= 0 || DAY_OFFSET_SLACK_HOURS >= 24) p.push('DAY_OFFSET_SLACK_HOURS must be inside (0, 24)');
  return p;
}

/**
 * Judge the reader's LIVE view of a seeded run. Pure — takes the parsed `loyaltyMissionProgress`
 * items, the overlay entries, the instant of the read and the GONE product id.
 * Returns { problems, readings } — readings are what the seeder writes back and the report quotes.
 */
export function judgeReaderView(items, aliases, at, goneProductId) {
  const problems = [];
  const readings = {};
  const byName = new Map((items || []).map((i) => [i.name, i]));
  for (const spec of MISSIONS) {
    const a = aliases[spec.aliasName] || {};
    const card = byName.get(a.name);
    if (!card) {
      if (spec.expect.observational) { readings[spec.aliasName] = { present: false }; continue; }
      problems.push(`${spec.aliasName} (${a.name || 'unnamed'}): not in the reader's loyaltyMissionProgress`);
      continue;
    }
    readings[spec.aliasName] = { present: true, daysRemaining: card.daysRemaining, status: card.status, percentage: card.percentage };
    if (spec.expect.observational) continue;
    if (card.daysRemaining !== spec.days) problems.push(`${spec.aliasName}: daysRemaining ${card.daysRemaining}, expected ${spec.days}`);
    if (card.status !== spec.expect.status) problems.push(`${spec.aliasName}: status ${card.status}, expected ${spec.expect.status}`);
    const sev = severityFor({ daysRemaining: card.daysRemaining, completed: card.status === 'Completed' });
    if (sev !== spec.expect.severity) problems.push(`${spec.aliasName}: live data gives severity ${sev}, expected ${spec.expect.severity}`);
    if (spec.aliasName === 'MSN_DL_SKU_NOAVAIL') {
      const rows = card.items || [];
      const gone = rows.find((r) => r.productId === goneProductId);
      const live = rows.find((r) => r.productId !== goneProductId);
      if (!gone) problems.push('MSN_DL_SKU_NOAVAIL: the deleted target row is missing from items[] (goal item cascaded away?)');
      else if (gone.product !== null) problems.push(`MSN_DL_SKU_NOAVAIL: deleted target still resolves a product (${gone.product?.code}) — availabilityData is not missing`);
      if (!live?.product?.availabilityData?.isBuyable || !live?.product?.availabilityData?.isInStock) {
        problems.push('MSN_DL_SKU_NOAVAIL: the in-stock control row does not read buyable + in stock');
      }
    }
  }
  if (Date.parse(aliases[RUN_ALIAS]?.valid_until || 0) <= at) {
    problems.push(`run ${aliases[RUN_ALIAS]?.run_id || '?'} is past valid_until ${aliases[RUN_ALIAS]?.valid_until} — the ladder has shifted; re-seed`);
  }
  return { problems, readings };
}
