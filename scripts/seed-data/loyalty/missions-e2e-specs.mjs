/**
 * scripts/seed-data/loyalty/missions-e2e-specs.mjs
 *
 * SINGLE SOURCE OF TRUTH for the suite-083d ("loyalty missions E2E") fixture set. Side-effect-free —
 * no env load, no network, no fs, no main() — so the seeder (seed-missions-e2e.mjs), the drift guard
 * (validate-missions-e2e-data.mjs) and the unit tests all import the SAME rules.
 *
 * WHY THIS EXISTS SEPARATELY FROM missions-specs.mjs
 * --------------------------------------------------
 * `missions-specs.mjs` provisions STABLE, long-lived missions for suites 075d / 083c: a fixture is
 * looked up by a fixed name, reused when its structural signature matches, and deliberately NOT
 * recreated. That is exactly right for a suite that asserts a mission's DEFINITION.
 *
 * 083d asserts the mission LOOP — progress advances, the mission completes, the reward lands. Loop
 * assertions consume the fixture: mission progress is per-(user, mission), cumulative, monotonic and
 * FROZEN once the mission completes, and vc-module-loyalty exposes no reset of any kind
 * (`/api/loyalty-mission-progress` has `POST /search` and `GET /{id}` and nothing else; the sole
 * writer is `LoyaltyMissionLogicService.ProcessOrderAsync` off an order INSERT). So the second run of
 * 083d against a stable mission asserts against a Completed row and can never watch progress move.
 * Measured on vcst-qa 2026-08-28 (run REG-2026-08-28-1154): MSN_ORDERCOUNT sat at 2 of 2 Completed
 * and MSN_ORDERVALUE at $5,842,446 / 100%, and a Completed mission was proven to stop accruing
 * entirely by a control pair inside one order — MSN_ZEROTARGET went 24 -> 25 while MSN_ORDERCOUNT
 * stayed frozen at 2. Six of the suite's eight cases were BLOCKED.
 *
 * THE ONE SHAPE THAT IS REPEATABLE
 * --------------------------------
 * Because progress cannot be reset, repeatability cannot come from resetting anything. It comes from
 * asking a DIFFERENT question each run: a mission minted THIS run has no progress row for anybody, so
 * it starts every account at 0% regardless of that account's entire history. Run identity is carried
 * in the mission NAME (`AGENT-TEST-MSN-E2E-<runId>-<KEY>`), so:
 *   - the CSV binds to a stable alias name while the underlying mission id changes every run;
 *   - two runs never share a mission, so 083d is safe to run concurrently with 075d / 083c and with
 *     itself (see feedback_concurrent_runners_distinct_org_users_taskstop);
 *   - teardown is a PREFIX SWEEP with an age floor, not an inline delete, so a crashed run's missions
 *     are still reclaimed by the next one.
 *
 * WHAT IS RUN-SCOPED AND WHAT IS NOT — the split is load-bearing
 * -------------------------------------------------------------
 * MISSIONS are run-scoped, because progress accumulates ON them. PRODUCTS are NOT: a product carries
 * no per-user state, so minting four products per run would add churn, index lag and catalog litter
 * while buying nothing. The products are stable, find-or-create, `trackInventory: false` (so they are
 * infinitely re-purchasable and no case can ever be blocked by stock), and are the only part of this
 * fixture set a teardown of the run does not touch.
 *
 * THE FOUR THINGS THIS SET FIXES, EACH OF WHICH FAILS SILENTLY
 * -----------------------------------------------------------
 * 1. VACUITY. A mission that is already Completed at seed time still exists, still resolves, still
 *    renders a card — and the case asserting "progress advances" reads a frozen number as a product
 *    bug (or, worse, asserts a Completed state it was handed). The seeder records the OBSERVED
 *    seed-time progress into the overlay and the guard FAILS on anything that is not pre-completion.
 *    That check is the one that was missing, and its absence is the direct cause of this episode.
 * 2. LEGIBILITY. MSN-E2E-004's thesis is that the points spent were EARNED FROM A MISSION.
 *    LOYALTY_VIP_USER holds ~964,189,233 PTS, so a 500-PTS reward is ~0.00005% of the balance and no
 *    arithmetic can demonstrate the thesis. The reward account is therefore bound to the per-run
 *    ephemeral LOYALTY_ZERO_USER, and the guard asserts the recorded seed-time balance is BELOW the
 *    reward — i.e. the grant at least doubles it. Note the balance CLIMBS on every completion, which
 *    is why this is an invariant re-checked each run and not a one-off provisioning step.
 * 3. PTS-PRICED PERSKU TARGET. MSN-E2E-007 needs a product that is simultaneously a PerSkuGoal target
 *    and priced in the loyalty currency, and none existed. The accrual path
 *    (`LoyaltyMissionLogicService.cs:~416`) increments `CurrentQuantity` from `order.Items` with NO
 *    currency filter while its sibling `LoyaltyProgramHandler.cs:199` filters
 *    `!x.Currency.EqualsIgnoreCase(loyaltyCurrency)` — so whether a points-currency line counts
 *    toward a quantity target is genuinely open, and unaskable without this fixture.
 * 4. PACK SIZE. MSN_PERSKU_PRODUCT_B (55557702) has pack size 2 and steps 0 -> 2 -> 0, so a case step
 *    saying "raise the stepper to exactly 1" is unachievable. Every product here is CREATED with
 *    packSize 1, `pack_size` is an authored alias field so no case has to assume, and the guard
 *    asserts each goal quantity is a whole multiple of its product's pack size.
 *
 * API SHAPES are inherited wholesale from `missions-specs.mjs` rather than restated — this module
 * imports its node builders, window model and block map, so a change to the mission body shape is
 * made in exactly one place. The only thing overridden here is the NAME (run-scoped) and the fixture
 * set itself.
 *
 * NAMING: `AGENT-TEST-MSN-E2E-<runId>-<KEY>` for missions, `AGENT-TEST-MSN-E2E-<KEY>` for products —
 * both under the `AGENT-TEST-` prefix `/qa-seed-data teardown` sweeps.
 * RUNTIME IDS: mission GUIDs, product ids, catalog ids, the resolved currency, the reward account's
 * identity and every observed seed-time state live ONLY in aliases.<env>.json — never in a committed
 * file.
 */
import {
  WINDOWS, windowDates, PROCESSED_PERIODICITY, BLOCK, blockOf,
  buildGoalNode, buildConditionNode, buildRewardNode,
  READING_ORDER, readingValues, readingsConsistentWith,
  TARGETING, TARGET_GROUP, specDifferences, targetedGroups, groupsInclude,
} from './missions-specs.mjs';

/** Everything disposable this seeder creates carries this prefix. */
export const SEED_PREFIX = 'AGENT-TEST';

/** Mission names are `${NAME_PREFIX}-${runId}-${key}`. */
export const NAME_PREFIX = 'AGENT-TEST-MSN-E2E';

/** Product codes are `${PRODUCT_PREFIX}-${key}` — stable, NOT run-scoped (see the header). */
export const PRODUCT_PREFIX = 'AGENT-TEST-MSN-E2E';

/**
 * A run handle: `<YYYYMMDDHHmmss>-<rand4>`. Deliberately the SAME shape as
 * seed-loyalty-ephemeral-user.mjs's account handle, because both are swept by age and a second
 * timestamp format would mean a second parser that can silently disagree with the first.
 */
export const RUN_ID_PATTERN = /^(\d{14})-([0-9a-f]{4})$/;

/** Mint a run handle. The ONE impure-looking export — it reads the clock and Math.random, nothing else. */
export function newRunId(now = new Date(), rand = Math.random()) {
  const ts = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `${ts}-${Math.floor(rand * 65536).toString(16).padStart(4, '0')}`;
}

/** Compose a run-scoped mission name. Pure. */
export const missionName = (runId, key) => `${NAME_PREFIX}-${runId}-${key}`;

/** Is this a mission THIS seeder owns? The hard teardown guard — nothing else is ever deleted. */
export const isE2EMissionName = (name) => new RegExp(`^${NAME_PREFIX}-\\d{14}-[0-9a-f]{4}-`).test(String(name || ''));

/** Pull the run handle back out of a mission name, or null. Pure. */
export function runIdFromName(name) {
  const m = new RegExp(`^${NAME_PREFIX}-(\\d{14}-[0-9a-f]{4})-`).exec(String(name || ''));
  return m ? m[1] : null;
}

/**
 * Age of a run handle in hours, or null when it does not parse. Used by teardown's `--max-age-hours`
 * floor so a sweep cannot delete the missions of a run that is still executing beside it.
 */
export function runIdAgeHours(runId, now = new Date()) {
  const m = RUN_ID_PATTERN.exec(String(runId || ''));
  if (!m) return null;
  const s = m[1];
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}Z`;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (now.getTime() - t) / 3600000 : null;
}

/** Default age floor for a teardown sweep: younger runs are spared. */
export const DEFAULT_SWEEP_MAX_AGE_HOURS = 6;

/**
 * Fields that are server- or env-determined, keyed by ALIAS KIND. They MUST be empty in the committed
 * `test-data/aliases.json` and are written per-env into `aliases.<env>.json`.
 *
 * Keyed by kind rather than flattened for the same reason missions-specs.mjs does it: `name` is
 * RUNTIME on a mission here (it carries the run handle, so it cannot be committed) and AUTHORED on a
 * product (we create it by that code). A single union list would demand that the products' own
 * identifiers be blanked.
 */
export const RUNTIME_FIELDS_BY_KIND = {
  // `catalog_id` / `category_id` are the PIN that stops ensureCategoryPath minting a duplicate
  // category every run (its lookup is index-backed and this env does not index categories).
  run: ['run_id', 'seeded_at', 'store_id', 'catalog_id', 'category_id'],
  // `name` is runtime BECAUSE it is run-scoped — this is the difference from the stable fixture set.
  mission: ['id', 'name', 'run_id', 'goal_currency', 'progress_status_at_seed', 'progress_percent_at_seed'],
  product: ['productId', 'catalogId', 'currency', 'url', 'slug'],
  rewardUser: ['email', 'user_id', 'member_id', 'balance_at_seed'],
  // A per-case mission adds MEASURED fields. `goal_target` is runtime here and authored on a plain
  // `mission`: the target is derived from a live probe cart on the case's own account, because the
  // quantity it has to separate (merchandise vs order total) is composed by the platform — a 20% tax
  // this repo never declared is what actually makes them differ on vcst-qa. Transcribing a target
  // would re-introduce exactly the undecidable fixture `.claude/rules/test-data.md` SECOND RULE
  // describes.
  caseMission: [
    'id', 'name', 'run_id', 'goal_currency', 'goal_target',
    'progress_status_at_seed', 'progress_percent_at_seed',
    'order_shipping_max', 'available_shipping',
    'measured_subtotal', 'measured_discount', 'measured_tax', 'measured_shipping', 'measured_total',
    'measured_total_undiscounted', 'reading_values', 'separates_above', 'separates_below',
    'separation_margin', 'co_completing_missions', 'reward_expected_total',
  ],
  // The JOURNEY mission (MSN-E2E-001, OrderCountGoal 2). Its target is AUTHORED — a count is not a
  // money quantity and nothing about it is composed by the platform — but its ORDERS are measured,
  // because the case asserts on a balance delta at completion and that delta is not the mission's own
  // reward on this environment. Two orders complete it, so the co-grant set is recorded PER ORDER:
  // order 1 is where a fresh account's one-shot missions all fire, order 2 is the completing order
  // whose delta the case actually attributes.
  journeyMission: [
    'id', 'name', 'run_id', 'goal_currency',
    'progress_status_at_seed', 'progress_percent_at_seed',
    'order_shipping_max', 'available_shipping',
    'measured_subtotal', 'measured_discount', 'measured_tax', 'measured_shipping', 'measured_total',
    'reading_values',
    'order1_co_missions', 'order1_expected_delta',
    'co_completing_missions', 'reward_expected_total',
  ],
  // A TARGETING mission records what each of its two declared accounts could SEE. The reading is
  // recorded and never asserted: whether `public` hides a mission, and whether a group condition
  // filters the customer-facing query, are the findings the fixture exists to make observable — a
  // fixture that encoded the expected answer would prove it by construction.
  targetingMission: [
    'id', 'name', 'run_id', 'goal_currency', 'goal_target',
    'progress_status_at_seed', 'progress_percent_at_seed', 'observed_visibility',
  ],
  caseUser: ['email', 'user_id', 'member_id', 'handle', 'balance_at_seed', 'groups_at_seed'],
  // A FUNDED per-run account. Everything a plain caseUser records, plus the funding provenance and
  // the PerSku baseline its own case reads a delta against. `pts_*_at_seed` is recorded rather than
  // assumed for the reason the whole vacuity guard exists: the previous fixture read `currentQuantity
  // 0 / InProgress` off untouched seed state and could not tell that from "processed and correctly
  // excluded", which is the entire distinction MSN-029 is supposed to make.
  fundedCaseUser: [
    'email', 'user_id', 'member_id', 'handle', 'balance_at_seed', 'groups_at_seed',
    'pts_line_cost', 'funding_program', 'funding_order', 'funding_points_per_unit',
    'pts_progress_status_at_seed', 'pts_is_started_at_seed', 'pts_current_quantity_at_seed',
  ],
};

/* ── Products ────────────────────────────────────────────────────────────────
 *
 * All four are Physical, isBuyable, `trackInventory: false`, packSize 1, and live in the store's
 * virtual catalog. Non-tracked inventory is not a shortcut: 083d places REAL orders on every run
 * forever, so a tracked fixture would drain and start failing cases for a reason that has nothing to
 * do with missions — the same class of silent decay this whole module exists to remove.
 */

/**
 * The denomination product. Priced at ONE unit of the store default currency, so an order of quantity
 * N has a subtotal of exactly N and any order value in 083d is composable without fixture gymnastics.
 * Same trick, and the same justification, as LOY_SKU_PTS_UNIT's 1-PTS divisor price.
 */
export const UNIT_PRODUCT = {
  aliasName: 'MSN_E2E_PRODUCT_UNIT',
  kind: 'product',
  slot: 'U',
  key: 'UNIT',
  sku: `${PRODUCT_PREFIX}-UNIT`,
  productName: 'AGENT-TEST Missions E2E Unit',
  listPrice: 5,
  currencyIntent: 'store-default',
  packSize: 1,
  purpose:
    'Denomination product for every OrderValueGoal case. At 5 units of the store default currency a '
    + 'cart of quantity N has subtotal 5N, so the order values MSN-E2E-003/005 need (just below the '
    + 'target; exactly at it) are composable by quantity alone.',
};

/** The two PerSku targets. Two, not one, because `all=true` over a single target is indistinguishable
 *  from `all=false` — the ALL semantics need a second row to mean anything. */
export const PERSKU_PRODUCTS = [
  {
    aliasName: 'MSN_E2E_PRODUCT_A',
    kind: 'product',
    slot: 'A',
    key: 'PERSKU-A',
    sku: `${PRODUCT_PREFIX}-PERSKU-A`,
    productName: 'AGENT-TEST Missions E2E PerSku Target A',
    listPrice: 10,
    currencyIntent: 'store-default',
    packSize: 1,
    goalQuantity: 1,
    purpose: 'PerSku target A. packSize 1 so "raise the stepper to exactly 1" is achievable.',
  },
  {
    aliasName: 'MSN_E2E_PRODUCT_B',
    kind: 'product',
    slot: 'B',
    key: 'PERSKU-B',
    sku: `${PRODUCT_PREFIX}-PERSKU-B`,
    productName: 'AGENT-TEST Missions E2E PerSku Target B',
    listPrice: 10,
    currencyIntent: 'store-default',
    packSize: 1,
    goalQuantity: 1,
    purpose: 'PerSku target B — the second row that makes `all=true` mean something.',
  },
];

/**
 * The PTS-priced PerSku target (MSN-E2E-007). Priced ONLY in the loyalty currency, deliberately: a
 * product carrying both a PTS and a default-currency price would let the line settle in either one,
 * and the case could not attribute what it observed. With a single PTS price the line item's currency
 * is not in question, so "does a points-currency line count toward a quantity target?" has an
 * answerable form.
 */
export const PTS_PRODUCT = {
  aliasName: 'MSN_E2E_PRODUCT_PTS',
  kind: 'product',
  slot: 'P',
  key: 'PERSKU-PTS',
  sku: `${PRODUCT_PREFIX}-PERSKU-PTS`,
  productName: 'AGENT-TEST Missions E2E PerSku PTS Target',
  listPrice: 1,
  /** Resolved from LOYALTY_SETTINGS.currency_code at seed time — never assumed to be the literal 'PTS'. */
  currencyIntent: 'loyalty',
  packSize: 1,
  goalQuantity: 1,
  purpose:
    'The unambiguous instance of the no-currency-filter finding: a PerSkuGoal target priced in the '
    + 'LOYALTY currency, so a line item bought with points either does or does not increment '
    + 'CurrentQuantity. LoyaltyMissionLogicService.cs:~416 applies no currency filter while the '
    + 'sibling LoyaltyProgramHandler.cs:199 does — this fixture is what makes the discrepancy '
    + 'observable from the storefront.',
};

export const PRODUCTS = [UNIT_PRODUCT, ...PERSKU_PRODUCTS, PTS_PRODUCT];
export const PRODUCT_BY_SLOT = Object.fromEntries(PRODUCTS.map((p) => [p.slot, p]));
export const PRODUCT_BY_ALIAS = Object.fromEntries(PRODUCTS.map((p) => [p.aliasName, p]));

/* ── The PTS-SPEND account: why it is a SECOND account and not a funded first ─
 *
 * The PerSku-PTS case (075d MSN-029 / 083d MSN-E2E-007) has to BUY the loyalty-currency target. A
 * points line is refused at place-order unless the balance covers it — measured on vcst-qa
 * 2026-09-01: `createOrderFromCart` returned `errors[]: "The cart has validation errors"` over the
 * cart's own `validationErrors: LOYALTY_INSUFFICIENT_BALANCE`.
 *
 * It used to borrow MSN_E2E_REWARD_USER, whose alias note claimed a `balance_at_seed` of 0 "makes a
 * subsequent points-spend cart possible at all". That is exactly inverted: a zero balance is the one
 * balance that makes the spend IMPOSSIBLE. The case then read `currentQuantity 0 / InProgress`
 * straight off untouched seed state and `isStarted` never moved across seven polls, so it decided
 * nothing in either direction.
 *
 * THE TWO REQUIREMENTS CANNOT LIVE ON ONE ACCOUNT ON THIS ENVIRONMENT, and that is the argument for
 * the split rather than a preference:
 *   - MSN-E2E-004 needs `balance < reward` (`balanceIsLegible`) — the grant has to dominate the
 *     balance or "the points I spent came FROM the mission" is unrecoverable arithmetic.
 *   - a spend needs `balance >= the line's cost`.
 *   - and a balance can only be RAISED BY EARNING (the loyalty op-log is read-only — confirmed live
 *     against vcst-qa's own swagger 2026-09-01: `VirtoCommerce.Loyalty` exposes exactly
 *     `POST /api/loyalty-program-operation-log/search` and
 *     `GET /api/loyalty-program-operation-log/balance/{userId}`, no write of any kind).
 *   - the smallest earn this store can produce is NOT small: the winning ProductPoints program for a
 *     group-less account resolves to a factor-500 program on a $60 SKU, i.e. 30,000 PTS for one unit
 *     (points = factor x unit price x qty, so qty 1 is the floor). Against a 150- or 500-PTS reward
 *     no funded account is ever legible.
 * One account therefore cannot hold both properties. Two can, and each keeps its own.
 *
 * The funded account carries NO legibility requirement of its own, and that is a limit worth stating:
 * MSN-029's oracle is the PerSku target's own quantity, not a balance delta, so nothing it asserts
 * reads the balance. An earn->spend assertion on THIS account would not be readable; that assertion
 * belongs to MSN_E2E_REWARD_USER, which is why that account is left at zero.
 */
export const PTS_SPEND_ALIAS = 'MSN_E2E_USER_PTSSPEND';

/** Units of the PTS-priced target the case buys. One: `all=false`, so a single line is the goal. */
export const PTS_SPEND_UNITS = 1;

/**
 * What the points line costs, DERIVED from the product's own list price. A transcribed cost goes
 * stale the moment the fixture price moves, and it goes stale SILENTLY — by the guard passing an
 * account that can no longer pay.
 */
export const ptsLineCost = (product = PTS_PRODUCT, units = PTS_SPEND_UNITS) =>
  Number(product.listPrice) * Number(units);

/** Can this balance actually pay for the line the case must buy? The spend-side vacuity rule. */
export const balanceCoversPtsLine = (balance, cost = ptsLineCost()) =>
  Number.isFinite(Number(balance)) && Number(balance) >= Number(cost);

/** The funding declaration the seeder acts on and the guard checks against. */
export const PTS_SPEND_FUNDING = {
  /** Minimum the account must hold at seed time. Derived from the line, never authored. */
  minPoints: () => ptsLineCost(),
  /**
   * Earning is the ONLY mechanism (there is no balance-write API), and an earn order advances every
   * mission applicable to its user. So it is placed BEFORE this run's missions are minted, and what
   * the account's PerSku row reads afterwards is RECORDED rather than assumed — the case asserts a
   * delta against that baseline instead of against a 0 it never verified.
   */
  mechanism: 'earn',
  purpose:
    'Funds the PerSku-PTS case so it can actually place the mixed cash+PTS order its question needs. '
    + 'Its own account because a spendable balance and MSN-E2E-004\'s legibility are mutually '
    + 'exclusive on one identity (see the block above).',
};

/* ── Catalog visibility: existence vs indexedness ────────────────────────────
 *
 * These two questions LOOK like one and are not, and conflating them cost this fixture set three
 * consecutive failed seeds (measured on vcst-qa, 2026-09-01):
 *
 *   "does this product EXIST?"     — a DATABASE question. Teardown, residue verification and
 *                                    find-or-create all ask this one. A wrong answer here creates
 *                                    an undeletable orphan and then a duplicate-key HTTP 500.
 *   "is this product INDEXED?"     — a SEARCH question. The storefront resolves mission-modal
 *                                    products through the index, so an unindexed fixture renders
 *                                    nothing and tests nothing.
 *
 * The functions below are the decision rules for both, kept here (side-effect-free) so the seeder,
 * the drift guard and the unit tests share ONE answer rather than three similar-looking ones.
 */

/**
 * How a catalog lookup was scoped. Only an EXACT criterion can prove absence — see `absenceIsProven`.
 *   'code'    — `POST /api/catalog/listentries { code }`, exact + unpaged + DATABASE-backed
 *               (measured: returns a product created milliseconds earlier, long before it is indexed).
 *   'byCodes' — `POST /api/catalog/{catalogId}/products-by-codes`, exact + unpaged + database-backed.
 *   'keyword' — `POST /api/catalog/listentries { keyword }`, FUZZY + paged. Never proof of absence.
 */
export const EXACT_LOOKUP_CRITERIA = ['code', 'byCodes'];

/**
 * Is a catalog-lookup response strong enough to conclude the entity is ABSENT?
 *
 * THIS IS THE BUG THAT ATE THE FIXTURE SET, written down as a rule. `findProductByCode` searched
 * `listentries` with `{ keyword: <sku>, take: 10 }` and read "no product in the page" as "no such
 * product". But that endpoint pages CATEGORIES AND PRODUCTS THROUGH ONE WINDOW, categories first:
 * the product segment only begins after the category total is consumed. Measured on vcst-qa for
 * `AGENT-TEST-MSN-E2E-PERSKU-A`: totalCount 21, and `take` 1/5/10 all return ZERO entries while
 * `take` 15+ returns the product. Its sibling `…-UNIT` matches only 8, stays inside the window, and
 * was found and deleted every time — which is why the survivor was deterministically PERSKU-A.
 *
 * It is also SELF-AMPLIFYING: every failed run leaves another `AGENT-TEST-MSN-E2E-*` category
 * behind, each of which is itself a keyword hit, so the category segment grows and pushes more
 * products out of the window on the next teardown.
 *
 * So: a fuzzy, paged response that returned fewer rows than it counted proves nothing at all. It is
 * neither presence nor absence — it is an unanswered question, and the caller must escalate to an
 * exact lookup rather than defaulting to "absent" (which silently means "create it again").
 */
export function absenceIsProven({ criterion, totalCount = 0, returned = 0 } = {}) {
  if (EXACT_LOOKUP_CRITERIA.includes(criterion)) return true;
  return Number(totalCount || 0) <= Number(returned || 0);
}

/**
 * The document type the platform's search-indexation module REGISTERS for products.
 *
 * `'CatalogProduct'` — the spelling this seeder, `seed-loyalty-missions.mjs` and
 * `seed-catalog-edge-fixtures.mjs` all used — is NOT a registered indexer. The platform accepts the
 * request anyway (HTTP 200 + a real jobId) and indexes NOTHING. Measured on vcst-qa 2026-09-01:
 * `GET /api/search/indexes` registers `Product`, `Category`, `ContentFile`, `Member`,
 * `PickupLocation`, `Pages`, `CustomerOrder` — no `CatalogProduct`. A freshly created product
 * triggered with `CatalogProduct` was still unindexed after 120 s; the same product triggered with
 * `Product` + its own `documentIds` was indexed in under 6 s.
 *
 * That is why the seeder's index guard fired: not because this environment cannot index, but
 * because the trigger addressed a document type that does not exist here.
 */
export const PRODUCT_INDEX_DOCUMENT_TYPE = 'Product';

/**
 * Spellings that are ACCEPTED by the platform and then do nothing. Listed so the mistake is
 * detectable by name instead of by a two-minute timeout — a silent success is the worst failure
 * shape available, and this one shipped in three seeders.
 */
export const SILENTLY_INERT_INDEX_DOCUMENT_TYPES = ['CatalogProduct'];

/**
 * The reindex request body. TARGETED by document id, never a bare incremental sweep: an incremental
 * run depends on the platform's own changed-since bookkeeping, and on this environment the
 * time-based incremental job is disabled by default (ECL-14.7 — reindex here can be abandoned
 * rather than merely delayed). Naming the ids removes that dependency entirely.
 */
export function buildReindexRequest(productIds, documentType = PRODUCT_INDEX_DOCUMENT_TYPE) {
  const ids = [...new Set((productIds || []).filter(Boolean))];
  if (!ids.length) throw new Error('buildReindexRequest: no product ids — a reindex of nothing is not a trigger');
  if (SILENTLY_INERT_INDEX_DOCUMENT_TYPES.includes(documentType)) {
    throw new Error(
      `buildReindexRequest: documentType "${documentType}" is accepted by the platform and indexes nothing. `
      + `Use "${PRODUCT_INDEX_DOCUMENT_TYPE}".`,
    );
  }
  return [{ documentType, documentIds: ids }];
}

/**
 * Is the document type we are about to trigger one the platform actually registers?
 *
 * `registered` is the `GET /api/search/indexes` payload (or its documentType strings). Returns null
 * when the type is registered, else the reason — checked BEFORE the wait, so a mis-addressed
 * trigger fails in a second with the real cause instead of in two minutes with the wrong one.
 */
export function indexDocumentTypeProblem(registered, documentType = PRODUCT_INDEX_DOCUMENT_TYPE) {
  const types = (registered || []).map((r) => (typeof r === 'string' ? r : r?.documentType)).filter(Boolean);
  if (!types.length) return 'GET /api/search/indexes returned no registered document types — cannot confirm the reindex trigger is addressable';
  if (types.includes(documentType)) return null;
  return `document type "${documentType}" is not registered on this platform (registered: ${types.join(', ')})`;
}

/**
 * The teardown verdict, as a pure reduction over "what we created" × "what a DB lookup still sees".
 *
 * The point of extracting it: the old residue check re-ran the SAME index-window-blind lookup the
 * delete loop had just used, so it could not fail on anything the delete loop had missed. It was
 * not a narrower check — it was the identical blind spot asked twice, and it reported "zero
 * residue" while `PERSKU-A` sat in the database waiting to 500 the next seed.
 *
 * `stillPresentByCode` MUST come from an exact database lookup (`EXACT_LOOKUP_CRITERIA`). A code
 * this seeder creates that is still present is residue, full stop — `ok:false`, and the caller
 * fails loudly.
 */
export function productTeardownVerdict({ specs = PRODUCTS, stillPresentByCode = {}, criterion } = {}) {
  if (!EXACT_LOOKUP_CRITERIA.includes(criterion)) {
    return {
      ok: false,
      checked: specs.map((s) => s.sku),
      residue: [],
      reason: `residue was verified with a "${criterion}" lookup; only ${EXACT_LOOKUP_CRITERIA.join('/')} can prove a product is gone`,
    };
  }
  const checked = specs.map((s) => s.sku);
  const residue = checked.filter((sku) => Boolean(stillPresentByCode[sku]));
  return {
    ok: residue.length === 0,
    checked,
    residue,
    reason: residue.length ? `${residue.length} product(s) this seeder creates still exist after teardown: ${residue.join(', ')}` : null,
  };
}

/* ── Missions ────────────────────────────────────────────────────────────── */

/**
 * The coupon 083d's discount case applies. Declared here — not because this module owns the coupon,
 * but because the OrderValueGoal target must leave a band in which a pre-discount order clears the
 * target and its post-discount total does not. Without the rate written down, that band is an
 * accident and `discountBand()` cannot check it.
 */
export const DISCOUNT_ALIAS = 'COUPON_20PCT';
export const DISCOUNT_RATE = 0.2;

export const MISSIONS = [
  {
    aliasName: 'MSN_E2E_ORDERVALUE',
    key: 'ORDERVALUE',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'OrderValueGoal', value: 50, currency: 'store-default' },
    reward: 500,
    cases: ['MSN-E2E-004'],
    purpose:
      'MSN-E2E-004 ONLY, since the per-case split. 004 asks whether the points it spends were EARNED '
      + 'FROM A MISSION — a question about the reward, not about how the goal is measured — so a plain '
      + 'authored target that the case order comfortably clears is the right shape, and its account '
      + '(the per-run LOYALTY_ZERO_USER) was never contended: progress is per-(user, mission), and 004 '
      + 'is the only case on that account. 003/005/006/008 shared LOYALTY_VIP_USER and therefore shared '
      + 'every OrderValueGoal row on it; they now have their own missions AND their own accounts (see '
      + 'CASE_MISSIONS).',
  },
  {
    aliasName: 'MSN_E2E_ORDERCOUNT',
    key: 'ORDERCOUNT',
    caseId: 'MSN-E2E-001',
    /**
     * ITS OWN ACCOUNT, for the same reason the four OrderValue cases have theirs, and with a sharper
     * edge because 001 is the JOURNEY case.
     *
     * `ProcessOrderAsync` advances EVERY mission applicable to the order's user, so a journey run on
     * a shared account watches its own card move while three sibling cards move underneath it, and
     * the grant it asserts on at completion is a sum over whatever else happened to settle. 001 is
     * the one case that asserts the WHOLE chain — order -> accrue -> complete -> grant -> visible —
     * so every link of it has to be attributable, and none of them is on a shared identity.
     */
    accountAlias: 'MSN_E2E_USER_001',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'OrderCountGoal', count: 2 },
    /**
     * 501, NOT 300, and the change is a finding rather than a preference.
     *
     * Measured on vcst-qa 2026-08-28: the journey's SECOND order also completes the shared 083c
     * fixture AGENT-TEST-MSN-ORDERCOUNT — likewise an OrderCountGoal of 2, likewise Published,
     * untargeted and visible to every per-run account — whose reward was also 300. Two 300-PTS grants
     * settling on one order are indistinguishable in a balance delta AND in a points-history amount,
     * so "the mission paid out" was unfalsifiable by amount while every fixture in the set still
     * resolved. The set's own divergent-reward rule could not see it: it scans THIS set, and the
     * collision was with a mission another suite owns. The live guard that now catches the class reads
     * the co-grant set the seeder measures — see validateSeededState's co-grant reward check.
     */
    reward: 501,
    /**
     * AUTHORED intent for EACH of the two orders the journey places; the money is measured, exactly as
     * for the per-case OrderValue set. The count target is NOT derived — a count is not a quantity the
     * platform composes — but the ORDER is measured anyway, because 001 asserts that points LANDED and
     * a fresh account's first order grants far more than this mission's own reward.
     *
     * Three units is deliberate on both sides: small enough that twice the order total stays under
     * every other OrderValue target the run mints (so order 2 completes THIS mission and, measurably,
     * nothing else), and distinct from MSN-E2E-008's four so the two journeys are never confused in a
     * log.
     */
    order: { units: 3, coupon: null },
    /** How many orders the case places. Equal to the goal count — an order is one increment. */
    journeyOrders: 2,
    cases: ['MSN-E2E-001'],
    purpose:
      'Order-count goal, target 2. Two and not one: at count=1 "counts orders" and "fires on any '
      + 'order" are the same observation, so the first order would prove nothing about counting. Two '
      + 'also gives MSN-E2E-001 an intermediate state to assert — 1 of 2, InProgress, not Completed — '
      + 'between the two orders it places.',
    decides:
      'Does the whole chain hold — does placing an order advance an OrderCountGoal by exactly one, does '
      + 'the SECOND order complete it, and do the reward points then land and show? Target 2 is what '
      + 'makes the first three links separable: a target of 1 collapses "advanced" and "completed" into '
      + 'one observation, so a mission that fires on any order at all would look identical to one that '
      + 'counts. The intermediate reading (1 of 2, InProgress) is the observation that tells them apart.',
    limits:
      'It says nothing about WHAT counts as an order — a cancelled order, a zero-total order and an '
      + 'order in another store are all outside it. And THE COMPLETION DELTA IS NOT THE REWARD: every '
      + 'per-run account can SEE every Published, untargeted mission in the store, so its orders '
      + 'complete the store\'s one-shot fixtures (order 1) and any OrderValue mission its cumulative '
      + 'value clears (order 2), whatever account those missions were sized for. Accounts isolate '
      + 'PROGRESS, not grants. So the case identifies the grant by its unique AMOUNT and by the '
      + 'run-scoped mission NAME in the points history, and uses reward_expected_total — measured, not '
      + 'assumed — as the corroborating figure for the balance. A case that asserts '
      + '`BAL_1 - BAL_0 === reward` is asserting something this environment has never done.',
  },
  {
    aliasName: 'MSN_E2E_PERSKU',
    key: 'PERSKU',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'PerSkuGoal', all: true },
    reward: 750,
    slots: ['A', 'B'],
    cases: ['MSN-E2E-002'],
    purpose:
      'The featured-SKU modal subject. `all=true` over TWO targets at quantity 1 each: adding to cart '
      + 'from the modal must leave both rows at 0, and completing the purchase must advance them. Both '
      + 'targets are packSize-1 products, so the "set the stepper to exactly 1" step in MSN-E2E-002 is '
      + 'achievable — it is not against MSN_PERSKU_PRODUCT_B, which steps 0 -> 2 -> 0.',
  },
  {
    aliasName: 'MSN_E2E_PERSKU_PTS',
    key: 'PERSKU-PTS',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'PerSkuGoal', all: false },
    reward: 150,
    slots: ['P'],
    cases: ['MSN-E2E-007'],
    caseId: 'MSN-E2E-007',
    // Its OWN account, and a FUNDED one. The case has to buy the PTS-priced target, and a
    // points-currency line is refused at place-order unless the balance covers it — see the PTS-SPEND block.
    accountAlias: PTS_SPEND_ALIAS,
    accountFunding: PTS_SPEND_FUNDING,
    purpose:
      'The currency-filter subject. ONE target, the PTS-priced product, `all=false` so a single '
      + 'points-currency line is the whole goal and the observation is not diluted by a second row '
      + 'bought in the default currency. Whether it completes IS the finding.',
  },
];

/* ── Per-case OrderValue missions + per-case accounts ────────────────────────
 *
 * THE CONTENTION, AND WHICH AXIS ACTUALLY FIXES IT
 * ------------------------------------------------
 * MSN_E2E_ORDERVALUE used to serve five cases. Four of them — 003/005/006/008 — also shared ONE
 * account (LOYALTY_VIP_USER), and that is the axis that actually broke them.
 *
 * `LoyaltyMissionLogicService.ProcessOrderAsync` runs once per order INSERT and advances EVERY
 * mission applicable to that order's user. So a single account carrying four OrderValueGoal missions
 * has all four rows moved by any one case's order: 003's 9-unit order would leave 005, 006 and 008
 * each part-consumed before they started. Minting four missions on one account therefore fixes
 * NOTHING — it multiplies the rows one order touches.
 *
 * Progress is keyed per-(user, mission). MSN-E2E-004 already proved the correct axis: it shares the
 * mission DEFINITION with the other four and is not contended, because it runs on its own account.
 * So the fix is per-case ACCOUNTS. Evidence that one order moves many missions, from the same
 * environment: run REG-2026-08-28-1154 granted 750+450+550+400 mission rewards from the single order
 * CO260828-00001, and its control pair showed MSN_ZEROTARGET advancing 24 -> 25 in that same order.
 *
 * PER-CASE MISSIONS ARE STILL REQUIRED — FOR SIZING, NOT FOR ISOLATION
 * --------------------------------------------------------------------
 * Accounts remove the contention; they do not let one target answer four different questions. Under
 * `.claude/rules/test-data.md` SECOND RULE each mission's target has to be placed so that the wrong
 * implementation of ITS link produces a different observation, and those placements conflict:
 *   - 003 needs the target strictly BETWEEN merchandise value and order total;
 *   - 005 needs it strictly BETWEEN the same cart's discounted and undiscounted totals;
 *   - 006 needs it BELOW every candidate reading, so a failure to reach 100% can only mean the
 *     settlement window misbehaved and never "the goal measures something smaller";
 *   - 008 needs it below every reading AND low enough that its own order completes NO other mission
 *     in this set, or the reward it asserts on is not attributable.
 * One number cannot be all four. Minting is cheap (POST /api/loyalty-missions, already proven), so
 * each case gets its own.
 *
 * EVERY TARGET IS MEASURED, NOT MODELLED — this is the correction the SECOND RULE forced
 * ---------------------------------------------------------------------------------------
 * The previous fixture derived its numbers from `units x listPrice`, i.e. from a model of the cart.
 * That model is wrong on this environment. Measured on vcst-qa / B2B-store, 2026-08-28, through the
 * same xAPI the storefront uses:
 *
 *     9 x UNIT @ 5   ->  subTotal 45  tax  9  shipping 0  TOTAL 54
 *    10 x UNIT @ 5   ->  subTotal 50  tax 10  shipping 0  TOTAL 60
 *    10 x UNIT + 20% ->  subTotal 50  tax  8  discount 10  TOTAL 48
 *
 * There is a 20% tax nothing in this repo had declared, applied to (subTotal - discount + shipping).
 * It is the whole reason merchandise value and order total differ at all when shipping is 0 — and
 * therefore the whole reason 003 is decidable. A modelled `postDiscount = 40` (what the old
 * `discountBand()` predicts) is 8.00 away from the platform's actual 48, which is four times the
 * band 005 was supposed to discriminate inside. So the seeder builds a real probe cart per case, on
 * that case's own account, and derives the target from what the platform returned.
 *
 * The reading vocabulary is NOT re-invented here: `ORDER_VALUE_READINGS` / `READING_ORDER` /
 * `readingValues` / `readingsConsistentWith` are imported from `missions-specs.mjs`, which already
 * models "what could an OrderValueGoal be measuring". This module only supplies a money shape read
 * off a live cart instead of composed from an authored order.
 */

/** Sweep namespace for the per-case accounts. The ONLY accounts this seeder will ever delete. */
export const CASE_ACCOUNT_PREFIX = 'AGENT-TEST-msne2e-';

/**
 * How a case mission's target is placed. Each rule names the DISTINCTION the mission exists to make
 * decidable; the seeder feeds it measured money and gets a number.
 */
export const TARGET_RULES = {
  /** Between the merchandise readings and the order-total readings. */
  totalVsMerchandise: 'totalVsMerchandise',
  /** Between the same cart's discounted and undiscounted order totals. */
  discountedVsUndiscounted: 'discountedVsUndiscounted',
  /** Below EVERY candidate reading — the mission's question is not about the measured value. */
  everyReading: 'everyReading',
  /**
   * ABOVE every order this fixture set can compose, by two orders of magnitude. Used by the targeting
   * missions, whose question is VISIBILITY and not accrual.
   *
   * It is isolation, not laziness. A targeting mission with a reachable target would be Published,
   * neutral-conditioned and cheap to clear — i.e. it would grant on the FIRST order of every other
   * per-case account in the run, inflating MSN-E2E-008's balance delta and the journey's completion
   * delta with a reward that has nothing to do with either. Placed out of reach it stays permanently
   * visible (visibility does not depend on progress) and permanently non-granting, so it perturbs no
   * sibling case at all. The number itself is DERIVED from the largest cart the set declares — see
   * unreachableTarget() — never authored.
   */
  unreachable: 'unreachable',
};

/**
 * Where a `everyReading` target sits, as a fraction of the weakest reading the case's own order
 * produces. 0.6 leaves 40% headroom, so the mission still completes if the platform turns out to
 * measure the smallest of the four candidates.
 */
export const COMPLETE_ALL_FRACTION = 0.6;

/**
 * The smallest gap, in store currency, between a derived target and either quantity it separates.
 *
 * Below this the fixture has stopped discriminating in practice even though the arithmetic still
 * "works": a one-cent band is indistinguishable from a rounding rule. Both separated quantities are
 * exact platform output, so this is a design floor rather than a tolerance.
 */
export const MIN_TARGET_SEPARATION = 1;

/**
 * The four contended cases, one mission and one account each.
 *
 * `reward` is DISTINCT per mission and mnemonic (503 for MSN-E2E-003, and so on). That is the
 * SECOND RULE's divergence clause applied to attribution: four missions sharing a 500-PTS reward
 * would be indistinguishable in a balance delta or a points-history row, so "the grant came from THIS
 * mission" would be unfalsifiable. None of these values collides with an existing loyalty fixture
 * reward (500/300/750/400/275/200/100/250/150/325/450/550/350).
 *
 * `order.units` is AUTHORED intent (how big a cart the case drives); every money figure that follows
 * from it is MEASURED. The units are chosen so the four orders' totals stay ordered
 * 008 < 003 < 006 < 005, which is what makes 008's reward attributable — see ATTRIBUTION below.
 */
export const CASE_MISSIONS = [
  {
    aliasName: 'MSN_E2E_ORDERVALUE_003',
    key: 'ORDERVALUE-003',
    caseId: 'MSN-E2E-003',
    cases: ['MSN-E2E-003'],
    accountAlias: 'MSN_E2E_USER_003',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    /** `value` is DERIVED at seed time from the probe cart — never authored. */
    goal: { type: 'OrderValueGoal', value: null, currency: 'store-default' },
    reward: 503,
    order: { units: 9, coupon: null },
    targetRule: TARGET_RULES.totalVsMerchandise,
    decides:
      'Does an OrderValueGoal accrue the order TOTAL (merchandise less discounts, plus shipping and '
      + 'tax) or merchandise value alone? The two diverge by the tax the platform adds: 9 units give '
      + 'subTotal 45 and TOTAL 54 on vcst-qa. The target lands between them, so a merchandise reading '
      + 'leaves the card short and a total reading completes it. The old flat fixture could not ask '
      + 'this — both readings predicted the same number, which is the worked example in '
      + '.claude/rules/test-data.md SECOND RULE.',
    limits:
      'It separates {netMerchandise, grossMerchandise} from {orderTotal, totalPlusPoints} as GROUPS. '
      + 'Without a discount net and gross are the same number, and without a points line orderTotal '
      + 'and totalPlusPoints are the same number, so this mission cannot tell the members of either '
      + 'pair apart. Distinguishing net from gross is MSN_E2E_ORDERVALUE_005\'s job.',
  },
  {
    aliasName: 'MSN_E2E_ORDERVALUE_005',
    key: 'ORDERVALUE-005',
    caseId: 'MSN-E2E-005',
    cases: ['MSN-E2E-005'],
    accountAlias: 'MSN_E2E_USER_005',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'OrderValueGoal', value: null, currency: 'store-default' },
    reward: 505,
    order: { units: 10, coupon: DISCOUNT_ALIAS },
    targetRule: TARGET_RULES.discountedVsUndiscounted,
    decides:
      'Is a checkout discount reflected in what the goal accrues? The seeder measures the SAME cart '
      + 'twice on the same account — with the coupon and without it (48 and 60 on vcst-qa) — and puts '
      + 'the target between the two. The case places the discounted order; the fixture has already '
      + 'measured that the identical undiscounted order would have completed the mission, so '
      + '"it would have crossed pre-discount and fell back post-discount" is a measured counterfactual '
      + 'rather than an assumption.',
    limits:
      'Non-completion ALONE does not prove discount-sensitivity: a discount-BLIND grossMerchandise '
      + 'reading (50) also falls under the target (54). What identifies the reading is the amount the '
      + 'card reports as spent — 40 (net) / 50 (gross) / 48 (total) are three distinct values on this '
      + 'environment — so the case must record the spent amount and match it against `reading_values`, '
      + 'not merely observe that no Completed chip appeared.',
  },
  {
    aliasName: 'MSN_E2E_ORDERVALUE_006',
    key: 'ORDERVALUE-006',
    caseId: 'MSN-E2E-006',
    cases: ['MSN-E2E-006'],
    accountAlias: 'MSN_E2E_USER_006',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'OrderValueGoal', value: null, currency: 'store-default' },
    reward: 506,
    order: { units: 12, coupon: null },
    targetRule: TARGET_RULES.everyReading,
    decides:
      'Does the missions page degrade cleanly between order confirmation and Hangfire settlement, and '
      + 'converge to 100% inside the budget? The question is about the WINDOW, so the target is placed '
      + 'below every candidate reading. That is deliberate and is the whole reason this mission is '
      + 'separate: if the target sat where only some readings complete, a card stuck below 100% would '
      + 'be ambiguous between "settlement regressed" (the finding) and "the goal measures something '
      + 'smaller than we assumed" (a different finding entirely), and the case could not tell which.',
    limits:
      'It says nothing about WHAT the goal measures — by construction. It also cannot distinguish a '
      + 'slow settlement from a fast one beyond the poll budget the case applies.',
  },
  {
    aliasName: 'MSN_E2E_ORDERVALUE_008',
    key: 'ORDERVALUE-008',
    caseId: 'MSN-E2E-008',
    cases: ['MSN-E2E-008'],
    accountAlias: 'MSN_E2E_USER_008',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'OrderValueGoal', value: null, currency: 'store-default' },
    reward: 508,
    order: { units: 4, coupon: null },
    targetRule: TARGET_RULES.everyReading,
    decides:
      'Is a mission reward clawed back when its order is cancelled? Like 006 the target is below every '
      + 'reading, because the question is about the grant and not about the measurement. What is '
      + 'special here is ATTRIBUTION: the case asserts on a balance delta, so its order must complete '
      + 'this mission and no other mission in this set. Four units keep its order total (24) below '
      + 'every other per-case target, and the reward 508 is unique, so the grant is identifiable by '
      + 'amount as well as by mission name.',
    limits:
      'Attribution is exact only WITHIN this fixture set. Other store-wide missions still grant on a '
      + 'fresh account\'s first order — MSN_ZEROTARGET (OrderCountGoal 0, reward 200), MSN_LOCALIZED '
      + 'and the other count-1 fixtures all fire — so a raw balance delta is NOT equal to this '
      + 'mission\'s reward. The seeder measures that co-grant set live and records it as '
      + '`co_completing_missions` / `reward_expected_total`; a case asserting on the delta must use '
      + 'those, or assert on the attributable points-history row instead.',
  },
];

export const CASE_MISSION_BY_ALIAS = Object.fromEntries(CASE_MISSIONS.map((m) => [m.aliasName, m]));

/* ── Targeting: two questions, and why they need FOUR fixtures ───────────────
 *
 * The scenario asks two things that look like one:
 *   (a) is a mission scoped to a customer group withheld from a user OUTSIDE that group?
 *   (b) does `public = false` withhold an UNTARGETED mission from a customer at all?
 *
 * Both are answered by an ABSENCE from `loyaltyMissionProgress`, and an absence is the least
 * decidable observation there is: "correctly hidden", "the query returned nothing", "the mission was
 * never minted" and "this account can see no mission at all" are the same reading. So the fixture is
 * a STAR around one positive control, each arm differing from the control on exactly ONE input:
 *
 *   fixture                condition   public   the arm isolates
 *   MSN_E2E_TGT_CONTROL    Any         true     nothing — it is the INSTRUMENT
 *   MSN_E2E_TGT_GROUP      VIP         true     the CONDITION     (vs control)
 *   MSN_E2E_TGT_PRIVATE    Any         false    the `public` FLAG  (vs control)
 *
 * read through two accounts that differ from each other on exactly one input:
 *
 *   MSN_E2E_USER_TGTMEMBER    groups ['VIP']   inside the audience
 *   MSN_E2E_USER_TGTOUTSIDER  groups []        outside it
 *
 * WHAT MAKES EACH ANSWER OBSERVABLE — the SECOND RULE's requirement, not a formality:
 *   - The CONTROL must come back for BOTH accounts. That is the only visibility the seed ASSERTS, and
 *     it is what converts every other absence from "we saw nothing" into a reading.
 *   - (a) is decided by the GROUP arm READ TWICE. Present for the member and absent for the outsider
 *     means the condition filters the customer read; present for both means it does not; absent for
 *     both means the mission is unreachable for a reason that is not targeting. Three distinct
 *     readings, none of them the default.
 *   - (b) is decided by PRIVATE vs CONTROL on the SAME account in the SAME response. Both present
 *     means `public` is inert on the read path; PRIVATE absent while the control is present means it
 *     gates it.
 *
 * NOTHING HERE DECLARES WHICH ANSWER IS EXPECTED. At the deployed build (VirtoCommerce.Loyalty
 * 3.1006.0-pr-14-da8a = da8abc6) `LoyaltyMissionSearchCriteria.Public` exists and no caller in the
 * module sets it, so the PREDICTED reading is "PRIVATE is visible" — and a fixture that encoded that
 * prediction would confirm it by construction. Measured on vcst-qa 2026-08-28, the shared
 * AGENT-TEST-MSN-PUBLISHED-PRIVATE did come back for a groupless per-run account while
 * AGENT-TEST-MSN-GROUP-VIP did not: evidence that both arms can move, not an assertion about either.
 *
 * WHY RUN-SCOPED COPIES AND NOT THE SHARED 083c TRIPLE. MSN_GROUP_VIP / MSN_GROUP_VIP_PRIVATE /
 * MSN_PUBLISHED_PRIVATE ask the same questions and are correct, but they belong to another suite:
 * their ids move when 083c re-seeds, their audience is two long-lived shared accounts differing on
 * org, balance and order history as well as on group, and MSN_PUBLISHED_PRIVATE has no CONTROLLED
 * twin — the fourth cell of that matrix is "ten fixtures already are it", not one of which is
 * identical to it but for `public`. Minting is cheap; borrowing another suite's fixtures is not.
 */

/**
 * Fields a star ARM is allowed to differ from the CONTROL on. Written as "compare everything EXCEPT
 * these" rather than "compare this list" on purpose — same rule, and the same reason, as
 * missions-specs.mjs GROUP_PAIR_EXEMPT_FIELDS: a field added to the spec shape later is then compared
 * automatically instead of silently escaping the control.
 *
 * `public` and `condition` are deliberately ABSENT from the exemption. They are the two variables
 * the star isolates, so each arm's diff against the control must come out as exactly one of them.
 */
export const STAR_EXEMPT_FIELDS = ['aliasName', 'key', 'purpose', 'decides', 'limits', 'targetingRole', 'visibility'];

/** The reward all three targeting cells carry. Identical BY DESIGN — see TARGETING_MISSIONS. */
export const TARGETING_REWARD = 509;

/** The audience the group arm targets. Imported, never re-declared — missions-specs.mjs owns it. */
export const TARGETING_GROUP = TARGET_GROUP;

/** The two accounts the star is read through. */
export const TARGETING_MEMBER_ALIAS = 'MSN_E2E_USER_TGTMEMBER';
export const TARGETING_OUTSIDER_ALIAS = 'MSN_E2E_USER_TGTOUTSIDER';

/** The case the star serves. */
export const TARGETING_CASE_ID = 'MSN-E2E-009';

/**
 * The star. All three share `goal`, `reward`, `window` and `status`; each differs from the control on
 * exactly one field, asserted with `specDifferences` rather than by listing what to compare — a field
 * added later is then compared automatically instead of quietly escaping the control.
 *
 * The SHARED REWARD is the one place this set deliberately breaks its own divergent-reward rule, and
 * the exemption is narrow: these three can never grant (their target is out of reach by construction),
 * so no balance delta and no points-history row ever has to attribute one of them. Distinct rewards
 * would instead BREAK the control — two cells differing on `public` AND on reward isolate neither.
 */
export const TARGETING_MISSIONS = [
  {
    aliasName: 'MSN_E2E_TGT_CONTROL',
    key: 'TGT-CONTROL',
    caseId: TARGETING_CASE_ID,
    accountAliases: [TARGETING_MEMBER_ALIAS, TARGETING_OUTSIDER_ALIAS],
    targetingRole: 'control',
    /** The ONE cell whose visibility the seed asserts — it is the instrument, not a measurement. */
    visibility: 'required',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'OrderValueGoal', value: null, currency: 'store-default' },
    targetRule: TARGET_RULES.unreachable,
    reward: TARGETING_REWARD,
    cases: [TARGETING_CASE_ID],
    decides:
      'Nothing about the product, and that is its job. It answers "did this account\'s '
      + 'loyaltyMissionProgress query work at all?", which is the precondition every other reading in '
      + 'the star depends on. A Published, untargeted, public mission that does NOT come back means the '
      + 'instrument is broken, so the seed fails instead of recording two absences as a finding.',
    limits:
      'It cannot distinguish a working audience gate from a working query — by construction it has no '
      + 'audience gate. It never completes and never grants, so it says nothing about accrual either.',
  },
  {
    aliasName: 'MSN_E2E_TGT_GROUP',
    key: 'TGT-GROUP',
    caseId: TARGETING_CASE_ID,
    accountAliases: [TARGETING_MEMBER_ALIAS, TARGETING_OUTSIDER_ALIAS],
    targetingRole: 'groupTargeted',
    /** RECORDED, never asserted: whether a group condition filters the read IS the finding. */
    visibility: 'observed',
    status: 'Published',
    public: true,
    window: 'active',
    condition: { type: TARGETING.groupCondition.id, groups: [TARGET_GROUP] },
    goal: { type: 'OrderValueGoal', value: null, currency: 'store-default' },
    targetRule: TARGET_RULES.unreachable,
    reward: TARGETING_REWARD,
    cases: [TARGETING_CASE_ID],
    decides:
      'Is a group-scoped mission withheld from a user outside the group? Read TWICE — as the member and '
      + 'as the outsider — against a control both accounts can see. Present/absent means the condition '
      + 'filters the customer-facing read; present/present means it does not; absent/absent means the '
      + 'mission is unreachable for a reason that is not targeting. The two accounts are minted seconds '
      + 'apart into the same org and differ ONLY in member.Groups, which is the only input '
      + 'UserGroupIsCondition reads, so a difference between the two readings has one available cause.',
    limits:
      'It tests ONE group by whole-string, ordinal case-insensitive, UNTRIMMED match — what the server '
      + 'does. It says nothing about multi-group conditions, about partial matches ("VIP Gold" is not '
      + '"VIP"), and nothing about whether a non-member would ACCRUE: it can never complete, so accrual '
      + 'is out of its reach by design.',
  },
  {
    aliasName: 'MSN_E2E_TGT_PRIVATE',
    key: 'TGT-PRIVATE',
    caseId: TARGETING_CASE_ID,
    accountAliases: [TARGETING_MEMBER_ALIAS, TARGETING_OUTSIDER_ALIAS],
    targetingRole: 'notPublic',
    /** RECORDED, never asserted — this cell's visibility is the whole question. */
    visibility: 'observed',
    status: 'Published',
    public: false,
    window: 'active',
    condition: { type: 'AnyUserGroupCondition' },
    goal: { type: 'OrderValueGoal', value: null, currency: 'store-default' },
    targetRule: TARGET_RULES.unreachable,
    reward: TARGETING_REWARD,
    cases: [TARGETING_CASE_ID],
    decides:
      'Does `public = false` withhold an UNTARGETED mission from a customer? Read against '
      + 'MSN_E2E_TGT_CONTROL in the SAME response for the SAME account, the two differing on `public` '
      + 'and nothing else. Both present means `public` is inert on the read path; this one absent while '
      + 'the control is present means it gates it. Either answer is a reading — which is the property '
      + 'the shared MSN_PUBLISHED_PRIVATE lacks alone: with no controlled twin, an absence there is '
      + 'equally consistent with an unreachable mission.',
    limits:
      'It says nothing about ADMIN visibility (a non-public mission must stay findable in the admin '
      + 'search, or the leak check passes for the wrong reason), nothing about `public` ON TOP OF a '
      + 'condition (that cell is deliberately left to the shared MSN_GROUP_VIP_PRIVATE), and nothing '
      + 'about accrual. Read the name as "not advertised", NEVER as "audience-restricted": its '
      + 'AnyUserGroupCondition means every customer IS its intended audience, and getting that backwards '
      + 'cost a retracted P1 on 2026-08-27.',
  },
];

export const TARGETING_MISSION_BY_ALIAS = Object.fromEntries(TARGETING_MISSIONS.map((m) => [m.aliasName, m]));

/** Is this a targeting-star cell? Pure. */
export const isTargetingMission = (spec) => TARGETING_MISSION_BY_ALIAS[spec?.aliasName] != null;

/** Every mission this seeder mints — authored-target, measured per-case, and the targeting star. */
export const ALL_MISSIONS = [...MISSIONS, ...CASE_MISSIONS, ...TARGETING_MISSIONS];

export const MISSION_BY_ALIAS = Object.fromEntries(ALL_MISSIONS.map((m) => [m.aliasName, m]));

/** Does this spec carry a measured, seed-time-derived target? Pure. */
export const isCaseMission = (spec) => CASE_MISSION_BY_ALIAS[spec?.aliasName] != null;

/**
 * The account alias(es) a mission owns. `accountAlias` is the one-mission-one-account form the
 * per-case OrderValue split uses; `accountAliases` is the targeting star's form, where three cells
 * are read through the SAME pair of accounts because the pair IS the comparison. Pure.
 */
export const boundAccounts = (spec) => (
  spec?.accountAlias ? [spec.accountAlias]
    : Array.isArray(spec?.accountAliases) ? [...spec.accountAliases]
      : []
);

/** Every mission with dedicated per-run account(s) — the isolation axis, not the sizing axis. */
export const ACCOUNT_BOUND_MISSIONS = ALL_MISSIONS.filter((m) => boundAccounts(m).length);

/** Missions read through the SHARED per-run reward account (they declare no account of their own). */
export const SHARED_ACCOUNT_MISSIONS = ALL_MISSIONS.filter((m) => !boundAccounts(m).length);

/**
 * The per-run accounts, DERIVED from the missions that declare them so the two can never disagree.
 *
 * `groups` is authored and is the only field that differs across the targeting pair; everything else
 * about those two accounts — org, creation instant, password, sweep namespace — is identical, which
 * is what makes a difference between their two readings attributable to membership.
 */
const ACCOUNT_PURPOSE = (caseId, missionAliases) =>
  `Per-run, zero-balance account for ${caseId}. Its own account is what isolates ${missionAliases.join(' / ')}: `
  + 'one order advances every applicable mission for its user, so a shared account cannot be fixed by '
  + 'minting more missions. Created WITH org membership because the org supplies the shipping ADDRESSES '
  + 'checkout needs — a brand-new contact has none and the cart never reaches a decisive place-order state.';

export const CASE_ACCOUNTS = (() => {
  const byAlias = new Map();
  for (const m of ACCOUNT_BOUND_MISSIONS) {
    for (const alias of boundAccounts(m)) {
      if (!byAlias.has(alias)) {
        byAlias.set(alias, { aliasName: alias, kind: 'caseUser', caseId: m.caseId, missionAliases: [], groups: [] });
      }
      byAlias.get(alias).missionAliases.push(m.aliasName);
      // Funding is declared on the MISSION that needs a spendable account, so the account and the
      // reason it is funded can never drift apart into two independently-editable declarations.
      if (m.accountFunding) {
        byAlias.get(alias).kind = 'fundedCaseUser';
        byAlias.get(alias).funding = m.accountFunding;
      }
    }
  }
  // The audience half of the targeting pair is the one account in the set that carries a group.
  const member = byAlias.get(TARGETING_MEMBER_ALIAS);
  if (member) {
    member.groups = [TARGET_GROUP];
    member.audienceRole = 'member';
    member.pairedWith = TARGETING_OUTSIDER_ALIAS;
  }
  const outsider = byAlias.get(TARGETING_OUTSIDER_ALIAS);
  if (outsider) {
    outsider.audienceRole = 'outsider';
    outsider.pairedWith = TARGETING_MEMBER_ALIAS;
  }
  for (const a of byAlias.values()) {
    a.purpose = a.funding
      ? `Per-run, FUNDED account for ${a.caseId}. ${a.funding.purpose} `
        + `It must hold at least ${a.funding.minPoints()} points at seed time — the cost of the line `
        + `${a.missionAliases.join(' / ')} makes it buy — or the order is refused with `
        + 'LOYALTY_INSUFFICIENT_BALANCE and the case reads untouched seed state as a result.'
      : a.audienceRole
      ? `Per-run account for ${a.caseId}, the ${a.audienceRole} half of the targeting pair`
        + `${a.groups.length ? ` (member.Groups = [${a.groups.join(', ')}])` : ' (member.Groups is empty)'}. `
        + 'It exists as one of a PAIR minted seconds apart into the same org and differing in this one '
        + 'field, because UserGroupIsCondition reads member.Groups and nothing else — so a difference '
        + 'between the two accounts\' readings has exactly one available cause. Two long-lived shared '
        + 'accounts would differ on org, balance, order history and every other group they carry, and '
        + '"the member saw it, the outsider did not" would name none of them.'
      : ACCOUNT_PURPOSE(a.caseId, a.missionAliases);
  }
  return [...byAlias.values()];
})();

export const CASE_ACCOUNT_BY_ALIAS = Object.fromEntries(CASE_ACCOUNTS.map((a) => [a.aliasName, a]));

/** The targeting pair, in reading order (member first). */
export const TARGETING_ACCOUNTS = [TARGETING_MEMBER_ALIAS, TARGETING_OUTSIDER_ALIAS]
  .map((alias) => CASE_ACCOUNT_BY_ALIAS[alias])
  .filter(Boolean);

/**
 * The alias registry this fixture set declares, with the KIND that decides which of its fields are
 * runtime. Exported so the drift guard reads one list instead of re-deriving it and drifting from it.
 */
export const declaredAliases = () => [
  { aliasName: 'MSN_E2E_RUN', kind: 'run' },
  // Keyed on `journeyOrders`, NOT on "does it own an account". Owning an account is now also true of
  // the PerSku-PTS mission, which records none of the journey's measured per-order fields; keying the
  // kind off the wrong property would demand a dozen measurements that mission never makes.
  ...MISSIONS.map((m) => ({ aliasName: m.aliasName, kind: m.journeyOrders != null ? 'journeyMission' : 'mission' })),
  ...CASE_MISSIONS.map((m) => ({ aliasName: m.aliasName, kind: 'caseMission' })),
  ...TARGETING_MISSIONS.map((m) => ({ aliasName: m.aliasName, kind: 'targetingMission' })),
  ...PRODUCTS.map((p) => ({ aliasName: p.aliasName, kind: 'product' })),
  { aliasName: REWARD_USER.aliasName, kind: 'rewardUser' },
  ...CASE_ACCOUNTS.map((a) => ({ aliasName: a.aliasName, kind: a.kind })),
];

/** Every alias in this set that `[AUTH role=...]` may be pointed at — the credential-contract scope. */
export const CREDENTIAL_ALIASES = () => [
  ...CASE_ACCOUNTS.map((a) => a.aliasName),
  REWARD_USER.aliasName,
];

/** The per-run accounts that must hold a spendable balance, with the cost each one must cover. */
export const FUNDED_ACCOUNTS = () => CASE_ACCOUNTS
  .filter((a) => a.funding)
  .map((a) => ({ ...a, minPoints: a.funding.minPoints() }));

/** How a mission's own visibility to its accounts is treated at seed time. Pure. */
export const visibilityPolicy = (spec) => String(spec?.visibility || 'required');

/**
 * Serialise / parse the per-account visibility reading recorded in the overlay. One field rather than
 * one per account, because the account set is a property of the spec and a flat field per account
 * would have to be re-declared in the committed base every time the pair changes.
 */
export const formatVisibility = (byAccountAlias) => Object.entries(byAccountAlias || {})
  .map(([alias, seen]) => `${alias}=${seen ? 'visible' : 'absent'}`).join('; ');

export function parseVisibility(text) {
  const out = {};
  for (const part of String(text || '').split(';')) {
    const [alias, seen] = part.split('=').map((x) => String(x || '').trim());
    if (alias) out[alias] = seen === 'visible';
  }
  return out;
}

/**
 * How large a target has to be to be UNREACHABLE by anything this set can order.
 *
 * DERIVED from the largest cart the specs declare (and, at seed time, from the largest cart actually
 * measured), never authored: a transcribed ceiling goes stale the moment a case orders more, and it
 * fails silently — the targeting mission would start completing and start granting on other cases'
 * orders. 100x is the headroom.
 */
export const UNREACHABLE_MULTIPLE = 100;

export function unreachableTarget(measuredOrderTotals = []) {
  const declaredMax = Math.max(0, ...ALL_MISSIONS.map((m) => Number(m.order?.units) || 0))
    * Number(UNIT_PRODUCT.listPrice);
  const measuredMax = Math.max(0, ...(measuredOrderTotals || []).map(Number).filter(Number.isFinite));
  return Number((Math.max(declaredMax, measuredMax) * UNREACHABLE_MULTIPLE).toFixed(2));
}

const round2 = (n) => Number(Number(n).toFixed(2));
const num = (v) => (v == null ? 0 : Number(v?.amount ?? v) || 0);

/**
 * Turn a LIVE cart reading into the money shape `missions-specs.mjs` already models readings over.
 *
 * Deliberately a straight transcription of what the platform returned plus ONE derived field
 * (`netMerchandise`), so nothing here can quietly disagree with the cart. `pointsLineValue` is 0
 * because these probe carts contain only the default-currency denomination product; the PTS fixture
 * belongs to MSN-E2E-007, which is a PerSku case and not an OrderValueGoal at all.
 */
export function measuredMoney(cart) {
  const grossMerchandise = round2(num(cart?.subTotal));
  const discountTotal = round2(num(cart?.discountTotal));
  const shippingTotal = round2(num(cart?.shippingTotal));
  const taxTotal = round2(num(cart?.taxTotal));
  const orderTotal = round2(num(cart?.total));
  const netMerchandise = round2(grossMerchandise - discountTotal);
  return {
    grossMerchandise, discountTotal, netMerchandise, shippingTotal, taxTotal,
    orderTotal, pointsLineValue: 0, totalPlusPoints: orderTotal,
  };
}

/**
 * Does the platform compose this cart the way the reading model assumes
 * (`net + shipping + tax === total`)? Returns null when it does, or a description when it does not.
 *
 * A mismatch is NOT tolerated by widening a tolerance: it would mean the composition has a term this
 * module does not model, and every derived target would be placed against an incomplete picture.
 */
export function moneyIncoherence(money, tolerance = 0.01) {
  const expect = round2(money.netMerchandise + money.shippingTotal + money.taxTotal);
  if (Math.abs(expect - money.orderTotal) <= tolerance) return null;
  return (
    `the platform reports total ${money.orderTotal} but net ${money.netMerchandise} + shipping `
    + `${money.shippingTotal} + tax ${money.taxTotal} = ${expect}. The order total carries a term this `
    + 'module does not model, so every target derived from this cart would be placed against an '
    + 'incomplete picture of what the goal could be measuring.'
  );
}

/** The smallest value any candidate reading predicts for this money shape. Pure. */
export const minReading = (money) => Math.min(...READING_ORDER.map((k) => Number(readingValues(money)[k])));

/** The largest value any candidate reading predicts. Pure. */
export const maxReading = (money) => Math.max(...READING_ORDER.map((k) => Number(readingValues(money)[k])));

/**
 * Place a case mission's target from measured money. Pure.
 *
 * `measurements` is `{ base, undiscounted? }` — `base` is the cart the CASE will actually place
 * (coupon applied where the spec declares one) and `undiscounted` is the same cart measured without
 * the coupon, which only the `discountedVsUndiscounted` rule needs.
 *
 * Returns `{ target, above, below, aboveLabel, belowLabel, margin }`, or throws when the measurement
 * leaves no band at all — a fixture that cannot discriminate must fail the SEED, never the suite.
 */
export function deriveCaseTarget(spec, measurements) {
  const base = measurements?.base;
  if (!base) throw new Error(`${spec.aliasName}: no measured cart to derive a target from`);
  const bad = moneyIncoherence(base);
  if (bad) throw new Error(`${spec.aliasName}: ${bad}`);

  const band = (below, above, belowLabel, aboveLabel) => {
    if (!(above > below)) {
      throw new Error(
        `${spec.aliasName}: ${aboveLabel} (${above}) is not above ${belowLabel} (${below}), so there is `
        + 'no band to place a target in and the mission would answer the same way whichever reading is '
        + 'right. Change the order composition rather than the target.',
      );
    }
    const target = round2((above + below) / 2);
    const margin = round2(Math.min(target - below, above - target));
    if (margin < MIN_TARGET_SEPARATION) {
      throw new Error(
        `${spec.aliasName}: the band between ${belowLabel} (${below}) and ${aboveLabel} (${above}) leaves `
        + `only ${margin} either side of target ${target}, under the ${MIN_TARGET_SEPARATION} floor — a `
        + 'gap that narrow is indistinguishable from a rounding rule. Raise the order quantity.',
      );
    }
    return { target, below, above, belowLabel, aboveLabel, margin };
  };

  switch (spec.targetRule) {
    case TARGET_RULES.totalVsMerchandise:
      return band(base.grossMerchandise, base.orderTotal, 'grossMerchandise', 'orderTotal');

    case TARGET_RULES.discountedVsUndiscounted: {
      const undiscounted = measurements?.undiscounted;
      if (!undiscounted) throw new Error(`${spec.aliasName}: the discountedVsUndiscounted rule needs the same cart measured without its coupon`);
      if (!(base.discountTotal > 0)) {
        throw new Error(
          `${spec.aliasName}: the coupon reduced the probe cart by ${base.discountTotal} — it did not apply, `
          + 'so the case would place an undiscounted order and assert a discount effect that never happened.',
        );
      }
      return band(base.orderTotal, undiscounted.orderTotal, 'orderTotal (discounted)', 'orderTotal (undiscounted)');
    }

    case TARGET_RULES.everyReading: {
      const weakest = minReading(base);
      const target = round2(weakest * COMPLETE_ALL_FRACTION);
      const margin = round2(weakest - target);
      if (margin < MIN_TARGET_SEPARATION) {
        throw new Error(
          `${spec.aliasName}: the weakest reading of the probe cart is ${weakest}, which leaves only ${margin} `
          + `above target ${target} — this mission must complete under EVERY reading or a card short of 100% is `
          + 'ambiguous between its own question and a measurement question. Raise the order quantity.',
        );
      }
      return { target, below: 0, above: weakest, belowLabel: 'zero', aboveLabel: 'weakest reading', margin };
    }

    default:
      throw new Error(`${spec.aliasName}: unknown target rule "${spec.targetRule}"`);
  }
}

/**
 * The store's effective tax rate, DERIVED from a measured cart rather than declared.
 *
 * vcst-qa applies 20% to (subTotal - discount + shipping); nothing in this repo had written that down,
 * and it is the term that makes merchandise value and order total differ at all when shipping is 0.
 * Reading it off the cart means a store that changes its rate — or has none — moves every dependent
 * number with it instead of leaving a stale one behind. Returns 0 when there is nothing to divide by.
 */
export function taxRateOf(money) {
  const base = Number(money.netMerchandise) + Number(money.shippingTotal);
  if (!(base > 0)) return 0;
  return Number(money.taxTotal) / base;
}

/**
 * How much SHIPPING this case's order can carry before its fixture stops discriminating — the number
 * the case needs in order to choose a delivery method, and which it currently has to guess at.
 *
 * `null` means unbounded. The two bounded rules are bounded for different reasons:
 *   - `discountedVsUndiscounted`: shipping raises the discounted AND undiscounted totals together, so
 *     it eats the band from below. Headroom is `margin / (1 + taxRate)` because the shipping charge is
 *     itself taxed.
 *   - MSN-E2E-008: shipping raises its order total toward the nearest SIBLING target, and the moment
 *     it reaches one, a second mission grants on the same order and the balance delta the case asserts
 *     on stops naming anything.
 * `totalVsMerchandise` and the plain `everyReading` case are unbounded: shipping only ever moves the
 * total UP, which is the side that already completes.
 */
export function shippingHeadroom(spec, { money, target, nearestSiblingTarget = null } = {}) {
  const t = taxRateOf(money);
  const grow = (gap) => (gap == null ? null : Math.max(0, Number((gap / (1 + t)).toFixed(2))));
  if (spec.targetRule === TARGET_RULES.discountedVsUndiscounted) {
    return grow(Number(target) - Number(money.orderTotal));
  }
  if (spec.caseId === 'MSN-E2E-008' && nearestSiblingTarget != null) {
    return grow(Number(nearestSiblingTarget) - Number(money.orderTotal));
  }
  return null;
}

/**
 * ATTRIBUTION. MSN-E2E-008 asserts on a balance delta, so its own order must complete its own mission
 * and NO other mission in this set. Given each case's derived target and the order total its account
 * will place, return the problems ([] = clean). Pure.
 */
export function attributionProblems(derivedByAlias, orderTotalByAlias, margin = MIN_TARGET_SEPARATION) {
  const problems = [];
  const attributed = CASE_MISSIONS.filter((m) => m.caseId === 'MSN-E2E-008');
  for (const owner of attributed) {
    const ownTotal = Number(orderTotalByAlias?.[owner.aliasName]);
    if (!Number.isFinite(ownTotal)) { problems.push(`${owner.aliasName}: no measured order total, so attribution cannot be checked`); continue; }
    const ownTarget = Number(derivedByAlias?.[owner.aliasName]?.target);
    if (!(ownTarget <= ownTotal)) problems.push(`${owner.aliasName}: its own order (${ownTotal}) does not reach its target (${ownTarget}) — the reward it asserts on would never be granted`);
    for (const other of ALL_MISSIONS) {
      if (other.aliasName === owner.aliasName) continue;
      if (other.goal?.type !== 'OrderValueGoal') continue;
      const otherTarget = Number(derivedByAlias?.[other.aliasName]?.target ?? other.goal?.value);
      // A target that is not a positive number is NOT ESTABLISHED — an unseeded targeting cell whose
      // ceiling is derived at seed time reads as `Number(null) === 0`, and treating that as a real
      // target would report every sibling order as reaching it. The missing target is already
      // reported, loudly, by the check that owns it; manufacturing a second, wrong diagnosis here
      // would send a reader to the order quantities instead of to the unseeded fixture.
      if (!(otherTarget > 0)) continue;
      if (ownTotal + margin > otherTarget) {
        problems.push(
          `${owner.aliasName}: its order total ${ownTotal} reaches ${other.aliasName}'s target ${otherTarget}, so that `
          + `mission grants on the same order and the ${owner.reward}-PTS delta ${owner.caseId} asserts on is no longer `
          + 'attributable. Lower this order\'s quantity or raise the other target.',
        );
      }
    }
  }
  return problems;
}

/**
 * Which readings a live-observed "spent" amount is consistent with — the falsifiability check run
 * against observation rather than intent. Re-exported through this module so a consumer of the E2E
 * fixture set has one import, and so the pass-through is unit-tested here too.
 */
export const readingsFor = (observed, money, tolerance = 0.01) => readingsConsistentWith(observed, money, tolerance);

/** The PerSku slots a spec targets, and the goal quantity per slot. Pure. */
export const missionSlots = (spec) => (spec?.slots ? [...spec.slots] : []);
export const needsGoalItems = (spec) => spec?.goal?.type === 'PerSkuGoal';

/** The goal-item rows this mission needs, once the products are resolved. Pure. */
export function buildGoalItems(spec, missionId, resolvedBySlot) {
  if (!needsGoalItems(spec)) return [];
  return missionSlots(spec).map((slot) => {
    const product = resolvedBySlot?.[slot];
    if (!product?.id) throw new Error(`PerSku slot ${slot} has no resolved product`);
    const declared = PRODUCT_BY_SLOT[slot];
    if (!declared) throw new Error(`slot ${slot} is not declared in PRODUCTS`);
    return { missionId, productId: product.id, quantity: declared.goalQuantity };
  });
}

/* ── Derived arithmetic — the numbers the cases compose orders from ─────────
 *
 * Every one of these is DERIVED, never a second literal. A case that wants "the quantity that just
 * fails" reads it from the alias; if the target or the unit price ever moves, the number moves with
 * it instead of going quietly stale (.claude/rules/test-data.md GOLDEN RULE).
 */

/** Units of UNIT_PRODUCT whose subtotal first reaches the OrderValue target. */
export const unitsToComplete = (spec = MISSION_BY_ALIAS.MSN_E2E_ORDERVALUE, product = UNIT_PRODUCT) =>
  Math.ceil(Number(spec.goal.value) / Number(product.listPrice));

/** The largest unit count that still falls SHORT of the target. */
export const unitsJustBelow = (spec = MISSION_BY_ALIAS.MSN_E2E_ORDERVALUE, product = UNIT_PRODUCT) =>
  unitsToComplete(spec, product) - 1;

/**
 * MSN-E2E-005's band. An order of exactly `unitsToComplete` clears the target; the same order after
 * the coupon is worth `postDiscount`, and `shippingHeadroom` is how much shipping may be added on top
 * before the discounted TOTAL creeps back over the target and the case stops discriminating.
 */
export function discountBand(spec = MISSION_BY_ALIAS.MSN_E2E_ORDERVALUE, product = UNIT_PRODUCT, rate = DISCOUNT_RATE) {
  const target = Number(spec.goal.value);
  const preDiscount = unitsToComplete(spec, product) * Number(product.listPrice);
  const postDiscount = Number((preDiscount * (1 - rate)).toFixed(2));
  return { target, preDiscount, postDiscount, shippingHeadroom: Number((target - postDiscount).toFixed(2)) };
}

/* ── The credential contract: what makes `[AUTH role=<alias>]` RESOLVE ───────
 *
 * Every account this set mints is signed into two different ways, and until 2026-09-01 the fixtures
 * only served one of them:
 *
 *   browser lane   — a Playwright case types the env-var NAME so `--secrets` substitutes and REDACTS
 *                    the value (`.claude/rules/mcp-browsers.md`). It needs the bare name, which is
 *                    what `password_var` carries.
 *   runner lane    — `[AUTH role=<alias>]` calls graphql-auth.ts `resolveRole()`, which for an
 *                    `_inline` alias with no `email_env`/`password_env` resolves `@td(<alias>.email)`
 *                    and `@td(<alias>.password)` and then expands any `{{VAR}}` through the env.
 *                    `password_var` is not a field it knows, so it fell through to the last-resort
 *                    `<ALIAS>_EMAIL` / `<ALIAS>_PASSWORD` env pattern and THREW.
 *
 * Measured: six of nine 075d cases (MSN-027/028/029/030/032/033) could not get past step 1 unattended;
 * the one run that reported results had bridged the gap by hand with an uncommitted wrapper.
 *
 * So the alias carries BOTH, and they are NOT two sources of truth: `password` is DERIVED from
 * `password_var` by `passwordTokenFor`, and `credentialProblems` fails the pair the moment they
 * disagree. The var name stays the single authored fact; a literal password in a committed file is a
 * secret-hygiene failure (`td:reconcile`), and this repo is public.
 */

/** The one password var every per-run account in this set is created with. */
export const ACCOUNT_PASSWORD_VAR = 'DEFAULT_TEST_PASSWORD';

/** The committed `password` field is the var name in `{{VAR}}` form — derived, never transcribed. */
export const passwordTokenFor = (varName = ACCOUNT_PASSWORD_VAR) => `{{${varName}}}`;

/** A committed credential value must be a `{{VAR}}` token, never a secret. */
export const isPasswordToken = (v) => /^\{\{\w+\}\}$/.test(String(v ?? ''));

/**
 * Does this committed alias satisfy the contract `resolveRole()` actually implements? Pure — it takes
 * the parsed alias object, so the drift guard and the unit tests judge the same rule the runner does.
 *
 * It deliberately models the RESOLVER, not a field checklist: the failure it exists to catch is an
 * alias that looks fully populated and still cannot produce a token.
 */
export function credentialProblems(aliasName, alias) {
  const out = [];
  const a = alias || {};
  if (a._inline !== true) {
    out.push(`${aliasName}: not _inline — resolveRole()'s inline/direct-field branch is the only one this set uses`);
    return out;
  }
  // The email_env/password_env branch wins first in resolveRole(); if an alias declares one half of
  // it the resolver takes that branch and the {{VAR}} password below is never consulted.
  if ((a.email_env && !a.password_env) || (!a.email_env && a.password_env)) {
    out.push(`${aliasName}: declares only one of email_env/password_env — resolveRole() needs both or neither, and half of it silently changes which branch resolves`);
  }
  if (!('email' in a)) {
    out.push(`${aliasName}: no \`email\` key — @td(${aliasName}.email) throws "unknown field" rather than resolving to the per-env overlay value`);
  }
  const pv = a.password_var;
  if (!pv) {
    out.push(`${aliasName}: no \`password_var\` — a browser case has to type the env-var NAME so Playwright --secrets can redact it, and a literal password in a committed file is a secret-hygiene failure`);
  }
  const pw = a.password;
  if (pw == null || pw === '') {
    out.push(`${aliasName}: no \`password\` — resolveRole() resolves @td(${aliasName}.password), finds nothing, falls through to the ${aliasName}_EMAIL/${aliasName}_PASSWORD env pattern and THROWS, so every [AUTH role=${aliasName}] case fails at step 1 before issuing a request`);
  } else if (!isPasswordToken(pw)) {
    out.push(`${aliasName}.password = ${JSON.stringify(pw)} is not a {{VAR}} token — a committed secret (this repo is public; td:reconcile secret hygiene fails it)`);
  } else if (pv && pw !== passwordTokenFor(pv)) {
    out.push(`${aliasName}.password ${pw} does not match its own password_var ${pv} — the browser lane and the runner lane would sign in with different credentials`);
  }
  if (a.fields && !('password' in a.fields)) {
    out.push(`${aliasName}.fields declares no \`password\` mapping — the alias registry stops documenting the field the runner resolves`);
  }
  return out;
}

/* ── The reward account ─────────────────────────────────────────────────────
 *
 * NOT provisioned here. It is the per-run ephemeral account seed-loyalty-ephemeral-user.mjs already
 * mints (LOYALTY_ZERO_USER), and this module only declares the BINDING and the invariant that makes
 * it usable. Building a second ephemeral-account provisioner would be a second implementation of a
 * solved problem, and the two would drift.
 */
export const REWARD_USER = {
  aliasName: 'MSN_E2E_REWARD_USER',
  kind: 'rewardUser',
  /** The alias whose per-run account this one borrows. */
  sourceAlias: 'LOYALTY_ZERO_USER',
  /** The mission whose reward must be legible against the balance. */
  rewardAlias: 'MSN_E2E_ORDERVALUE',
  purpose:
    'MSN-E2E-004 asserts that the points it spends were EARNED FROM A MISSION. That is a claim about '
    + 'the RATIO, not the amount: on LOYALTY_VIP_USER (964,189,233 PTS) a 500-PTS grant is 0.00005% of '
    + 'the balance and no arithmetic recovers the thesis. Bound to the per-run zero-balance account so '
    + 'the grant is the balance. Re-checked every run, not provisioned once, because the balance '
    + 'CLIMBS on every completion and there is no write API to bring it back down.',
};

/**
 * Is a mission reward legible against a balance? The reward must at least DOUBLE the balance, i.e.
 * the balance before the grant must be strictly below the reward. Anything weaker and "the balance
 * went up by the reward" stops being distinguishable from ordinary accrual noise.
 */
export const balanceIsLegible = (balance, reward) => Number(balance) < Number(reward);

/* ── Pre-completion: the vacuity invariant ──────────────────────────────────
 *
 * A mission is USABLE by 083d only if the bound account has not already finished it. These are the
 * only progress states that qualify, and the seeder records what it OBSERVED rather than what it
 * intended — a recorded intention would assert itself.
 */
export const PRE_COMPLETION_STATUSES = ['NotStarted', 'InProgress'];
export const MAX_SEED_PROGRESS_PERCENT = 0;

/**
 * Is this observed state a legitimate starting point? `percent` above zero is rejected as well as a
 * Completed status: a mission minted this run that already reports progress means the run handle
 * collided or the seeder silently reused an older mission, and either way the suite is asserting
 * against somebody else's state.
 */
export function isPreCompletion({ status, percent } = {}) {
  if (status != null && !PRE_COMPLETION_STATUSES.includes(String(status))) return false;
  if (percent != null && Number(percent) > MAX_SEED_PROGRESS_PERCENT) return false;
  return true;
}

/* ── Mission body ───────────────────────────────────────────────────────────── */

/**
 * Compose the `POST /api/loyalty-missions` body for a run-scoped spec. Delegates every node to
 * missions-specs.mjs's builders so the body SHAPE has exactly one definition in the repo; the only
 * thing this adds is the run-scoped name. Pure.
 */
export function buildE2EMissionBody(spec, runId, { template, storeId, now = new Date(), currencies } = {}) {
  if (!template) throw new Error('buildE2EMissionBody needs the GET /api/loyalty-missions/new template');
  if (!storeId) throw new Error('buildE2EMissionBody needs a storeId');
  if (!RUN_ID_PATTERN.test(String(runId || ''))) throw new Error(`invalid run id: ${runId}`);
  const tree = template.dynamicExpression;
  const { startDate, endDate } = windowDates(spec.window, now);
  return {
    ...template,
    id: null,
    name: missionName(runId, spec.key),
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
        { ...blockOf(tree, BLOCK.goals), children: [buildGoalNode(spec, blockOf(tree, BLOCK.goals), { currencies })] },
        { ...blockOf(tree, BLOCK.reward), children: [buildRewardNode(spec, blockOf(tree, BLOCK.reward))] },
      ],
    },
  };
}

/* ── Shape validation (the drift guard's deterministic core) ─────────────────── */

/**
 * Assert the committed spec set is internally coherent and still DISCRIMINATING. Returns an array of
 * problem strings ([] = clean). Every rule exists because breaking it leaves a fixture that still
 * seeds, still resolves and still passes — while testing nothing.
 */
export function validateSpecShape() {
  const problems = [];
  const push = (m) => problems.push(m);

  // --- identity ---------------------------------------------------------------
  if (!NAME_PREFIX.startsWith(SEED_PREFIX)) push(`NAME_PREFIX "${NAME_PREFIX}" does not start with ${SEED_PREFIX} — teardown would not sweep it`);
  if (!PRODUCT_PREFIX.startsWith(SEED_PREFIX)) push(`PRODUCT_PREFIX "${PRODUCT_PREFIX}" does not start with ${SEED_PREFIX}`);
  const sample = missionName(newRunId(new Date(0), 0), 'X');
  if (!isE2EMissionName(sample)) push(`missionName() produces "${sample}", which isE2EMissionName() does not recognise — teardown would never match this run's own missions`);

  // --- missions ---------------------------------------------------------------
  if (!MISSIONS.length) push('MISSIONS is empty');
  const aliases = new Set();
  const keys = new Set();
  for (const m of ALL_MISSIONS) {
    if (aliases.has(m.aliasName)) push(`duplicate mission alias ${m.aliasName}`);
    aliases.add(m.aliasName);
    if (keys.has(m.key)) push(`duplicate mission key ${m.key}`);
    keys.add(m.key);
    if (!WINDOWS[m.window]) push(`${m.aliasName}: unknown window intent "${m.window}"`);
    // Every E2E mission must be REACHABLE by the customer: a Draft or non-public mission never
    // reaches loyaltyMissionProgress, so a loop case would assert against a card that is not there.
    if (m.status !== 'Published') push(`${m.aliasName}: status "${m.status}" — an E2E loop fixture must be Published or the storefront never sees it`);
    if (WINDOWS[m.window]?.expectOpen !== true) push(`${m.aliasName}: window "${m.window}" is not expected to be open — a closed mission cannot accrue`);
    // `public` and the CONDITION are inputs to the targeting star, so they are only constrained on the
    // LOOP missions. On a loop mission both are load-bearing in the same direction: a non-public or
    // group-targeted mission is filtered out of the customer-facing query for an account that belongs
    // to no group — which every per-run account does — and the case reports a missing mission as a
    // product failure. On a targeting cell they are the variable under observation, and the tighter
    // per-role rules live in the targeting block below.
    if (!isTargetingMission(m)) {
      if (m.public !== true) push(`${m.aliasName}: public=${m.public} — a non-public mission may be filtered out of the customer-facing query, so the loop is unobservable. Only the targeting star may vary this, and only against a control.`);
      if ((m.condition?.type || 'AnyUserGroupCondition') !== 'AnyUserGroupCondition') {
        push(`${m.aliasName}: condition "${m.condition?.type}" — every per-run account this set mints belongs to no group, so a targeted mission would be invisible to exactly the account that drives it`);
      }
    }
    // A zero reward makes "the reward landed" unfalsifiable.
    if (!(Number(m.reward) > 0)) push(`${m.aliasName}: reward=${m.reward} — a loop case asserts that points LAND, which a zero reward cannot show`);
    if (!Array.isArray(m.cases) || !m.cases.length) push(`${m.aliasName}: declares no cases[] — a fixture nothing consumes is dead weight nobody will notice`);
  }

  // --- goal shapes ------------------------------------------------------------
  const ov = MISSION_BY_ALIAS.MSN_E2E_ORDERVALUE;
  if (!ov) push('MSN_E2E_ORDERVALUE is missing — five of the eight cases bind to it');
  else {
    if (ov.goal.type !== 'OrderValueGoal') push(`MSN_E2E_ORDERVALUE goal is ${ov.goal.type}, expected OrderValueGoal`);
    if (!(Number(ov.goal.value) > 0)) push(`MSN_E2E_ORDERVALUE target is ${ov.goal.value} — a zero target auto-completes and there is no loop to watch`);
    if (!ov.goal.currency) push('MSN_E2E_ORDERVALUE declares no currency intent — OrderValueGoal.currencyCode is rejected as null/"" at save');
    // COMPOSABILITY: the target must be reachable by whole units of the denomination product, and
    // reachable CHEAPLY. A target that needs 40 stepper presses is a case nobody re-runs.
    const target = Number(ov.goal.value);
    const unit = Number(UNIT_PRODUCT.listPrice);
    if (target % unit !== 0) {
      push(`MSN_E2E_ORDERVALUE target ${target} is not a whole multiple of the ${unit} unit price — no quantity lands exactly on the target, so "just below" and "exactly at" collapse into one observation`);
    }
    const units = unitsToComplete(ov, UNIT_PRODUCT);
    if (units < 2) push(`MSN_E2E_ORDERVALUE completes in ${units} unit(s) — at one unit there is no quantity that falls SHORT, so MSN-E2E-003 has no below-target order to place`);
    if (units > 20) push(`MSN_E2E_ORDERVALUE needs ${units} units to complete — too many for a storefront stepper to drive reliably; lower the target or raise the unit price`);
    // DISCOUNT BAND: MSN-E2E-005 only discriminates while the discounted total stays below the target.
    const band = discountBand(ov, UNIT_PRODUCT);
    if (!(band.shippingHeadroom > 0)) {
      push(`MSN-E2E-005 has no discount band: a ${DISCOUNT_RATE * 100}% coupon takes the completing order to ${band.postDiscount}, which is not below the ${band.target} target — the case cannot show a fall-back`);
    } else if (band.shippingHeadroom < unit) {
      push(`MSN-E2E-005's shipping headroom is ${band.shippingHeadroom}, below one unit (${unit}) — any shipping charge pushes the discounted total back over the target and the case silently stops discriminating`);
    }
  }

  const oc = MISSION_BY_ALIAS.MSN_E2E_ORDERCOUNT;
  if (!oc) push('MSN_E2E_ORDERCOUNT is missing — MSN-E2E-001 binds to it');
  else if (Number(oc.goal.count) < 2) {
    push(`MSN_E2E_ORDERCOUNT target is ${oc.goal.count} — at 1, "counts orders" and "fires on any order" are the same observation and there is no intermediate state to assert`);
  }

  // --- PerSku pairing ---------------------------------------------------------
  const persku = MISSION_BY_ALIAS.MSN_E2E_PERSKU;
  const perskuPts = MISSION_BY_ALIAS.MSN_E2E_PERSKU_PTS;
  if (!persku) push('MSN_E2E_PERSKU is missing — MSN-E2E-002 binds to it');
  else {
    if (persku.goal.all !== true) push('MSN_E2E_PERSKU must be all=true — it is the ALL-semantics subject');
    if (missionSlots(persku).length < 2) {
      push(`MSN_E2E_PERSKU targets ${missionSlots(persku).length} slot(s) — with fewer than two, all=true and all=false are the same mission and the modal has one row`);
    }
  }
  if (!perskuPts) push('MSN_E2E_PERSKU_PTS is missing — MSN-E2E-007 binds to it');
  else {
    if (missionSlots(perskuPts).length !== 1) push(`MSN_E2E_PERSKU_PTS targets ${missionSlots(perskuPts).length} slots — the currency observation must not be diluted by a second, default-currency row`);
    if (!missionSlots(perskuPts).includes(PTS_PRODUCT.slot)) push(`MSN_E2E_PERSKU_PTS does not target the PTS-priced product (slot ${PTS_PRODUCT.slot}) — without it the case asks nothing about currency`);
    if (perskuPts.goal.all !== false) push('MSN_E2E_PERSKU_PTS must be all=false — with a single target, all=true adds a semantics variable the case is not asking about');
  }

  // --- products ---------------------------------------------------------------
  const slots = new Set();
  const skus = new Set();
  for (const p of PRODUCTS) {
    if (slots.has(p.slot)) push(`duplicate product slot ${p.slot}`);
    slots.add(p.slot);
    if (skus.has(p.sku)) push(`duplicate product sku ${p.sku}`);
    skus.add(p.sku);
    if (!p.sku.startsWith(SEED_PREFIX)) push(`${p.aliasName}: sku "${p.sku}" lacks the ${SEED_PREFIX} prefix — teardown would not sweep it`);
    // GAP 3: pack size is the fixture property that makes a stepper step reachable.
    if (Number(p.packSize) !== 1) {
      push(`${p.aliasName}: packSize=${p.packSize} — a pack size above 1 makes the stepper jump (MSN_PERSKU_PRODUCT_B steps 0 -> 2 -> 0), so "set the quantity to exactly 1" is unachievable`);
    }
    if (!(Number(p.listPrice) > 0)) push(`${p.aliasName}: listPrice=${p.listPrice} — an unpriced product renders as a broken row, which reads as a different defect`);
    if (p.goalQuantity != null && Number(p.goalQuantity) % Number(p.packSize) !== 0) {
      push(`${p.aliasName}: goal quantity ${p.goalQuantity} is not a whole multiple of pack size ${p.packSize} — the target can never be hit exactly`);
    }
  }
  // Every slot a mission targets must exist as a product, and every PerSku product must be targeted.
  const targeted = new Set(MISSIONS.flatMap(missionSlots));
  for (const slot of targeted) if (!PRODUCT_BY_SLOT[slot]) push(`mission slot ${slot} has no declared product`);
  for (const p of [...PERSKU_PRODUCTS, PTS_PRODUCT]) {
    if (!targeted.has(p.slot)) push(`${p.aliasName} (slot ${p.slot}) is targeted by no mission — a goal-item product nothing points at is never bought`);
  }
  // The PTS product's whole point is a currency DIFFERENT from the one the value goal is measured in.
  if (PTS_PRODUCT.currencyIntent === UNIT_PRODUCT.currencyIntent) {
    push(`the PTS target and the denomination product share the currency intent "${PTS_PRODUCT.currencyIntent}" — MSN-E2E-007 asks whether a NON-default-currency line counts, and cannot ask it in the default currency`);
  }

  // --- reward account ---------------------------------------------------------
  if (!MISSION_BY_ALIAS[REWARD_USER.rewardAlias]) push(`REWARD_USER.rewardAlias "${REWARD_USER.rewardAlias}" is not a declared mission`);
  if (!REWARD_USER.sourceAlias) push('REWARD_USER declares no sourceAlias — the account has to come from somewhere');

  // --- per-case missions + accounts -------------------------------------------
  //
  // These rules are the SECOND RULE applied to the split. Each one, broken, leaves a fixture set that
  // still seeds, still resolves and still reports green while the cases on it contend or decide
  // nothing.
  const caseIds = new Set();
  const accountAliases = new Set();
  const rewards = new Map();
  for (const m of ALL_MISSIONS) {
    // DIVERGENT REWARDS. Two missions sharing a reward are indistinguishable in a balance delta or a
    // points-history row, so "the grant came from THIS mission" stops being falsifiable. Same
    // divergence requirement as td:validate:variation-stock's "the quantities must differ".
    //
    // THE STAR IS EXEMPT FROM ITSELF, AND ONLY FROM ITSELF. Its three cells MUST share a reward or
    // they stop being a controlled comparison, and they can never grant (their target is out of reach
    // by construction), so there is no delta for a reward to have to attribute. A collision between a
    // star cell and any mission that CAN grant is still a real defect and is still reported.
    const prior = rewards.get(m.reward);
    if (prior && isTargetingMission(m) && isTargetingMission(MISSION_BY_ALIAS[prior])) continue;
    if (prior) push(`${m.aliasName} and ${prior} both reward ${m.reward} PTS — a grant from either is indistinguishable in a balance delta or a points-history row, so no case on them can attribute what it observed`);
    else rewards.set(m.reward, m.aliasName);
  }
  for (const m of CASE_MISSIONS) {
    if (m.goal?.value != null) {
      push(`${m.aliasName}: goal.value is authored as ${m.goal.value} — a per-case target is DERIVED from a live probe cart at seed time (a modelled target was 8.00 out against the platform's real 20% tax, four times the band it was meant to discriminate inside)`);
    }
    if (m.goal?.type !== 'OrderValueGoal') push(`${m.aliasName}: goal type ${m.goal?.type} — the per-case split exists for OrderValueGoal sizing`);
    if (!m.goal?.currency) push(`${m.aliasName}: declares no currency intent — OrderValueGoal.currencyCode is rejected as null/"" at save`);
    if (!TARGET_RULES[m.targetRule]) push(`${m.aliasName}: unknown targetRule "${m.targetRule}"`);
    if (!(Number(m.order?.units) > 0)) push(`${m.aliasName}: order.units=${m.order?.units} — the seeder has no cart to measure`);
    if (Number(m.order?.units) > 20) push(`${m.aliasName}: order.units=${m.order.units} is more than a storefront quantity control is worth driving`);

    // A coupon is required by exactly one rule and meaningless to the others; a stray one would
    // silently change the measured money the target is placed against.
    const wantsCoupon = m.targetRule === TARGET_RULES.discountedVsUndiscounted;
    if (wantsCoupon && !m.order?.coupon) push(`${m.aliasName}: the discountedVsUndiscounted rule needs order.coupon — without it both measurements are the same cart and the target has no band`);
    if (!wantsCoupon && m.order?.coupon) push(`${m.aliasName}: declares order.coupon "${m.order.coupon}" but its "${m.targetRule}" rule does not use one — the coupon would change the measured money the target is placed against`);

    if (caseIds.has(m.caseId)) push(`two per-case missions claim ${m.caseId}`);
    caseIds.add(m.caseId);
    if (accountAliases.has(m.accountAlias)) push(`${m.aliasName} shares account alias ${m.accountAlias} with another case — a shared account is the contention this split exists to remove, since one order advances EVERY mission applicable to its user`);
    accountAliases.add(m.accountAlias);
    if (!CASE_ACCOUNT_BY_ALIAS[m.accountAlias]) push(`${m.aliasName}: account alias ${m.accountAlias} is not declared in CASE_ACCOUNTS`);

    // STATE THE LIMITS. `.claude/rules/test-data.md` SECOND RULE: a fixture whose limits are not
    // written down lets a green case imply an answer it cannot give.
    if (!String(m.decides || '').trim()) push(`${m.aliasName}: declares no \`decides\` — a fixture that does not say which question its data makes decidable cannot be reviewed for whether it does`);
    if (!String(m.limits || '').trim()) push(`${m.aliasName}: declares no \`limits\` — every one of these missions has a distinction it CANNOT make, and an unstated limit is how a green case comes to imply an answer it never tested`);
  }

  // ATTRIBUTION, at the spec level: MSN-E2E-008's order must be the smallest, or its own order
  // completes a sibling mission and the reward delta it asserts on stops being attributable. The
  // measured form of this check runs in the seeder (attributionProblems); this one catches the
  // authoring mistake before anything is provisioned.
  const attributed = CASE_MISSIONS.find((m) => m.caseId === 'MSN-E2E-008');
  if (attributed) {
    for (const other of CASE_MISSIONS) {
      if (other.aliasName === attributed.aliasName) continue;
      if (Number(attributed.order.units) >= Number(other.order.units)) {
        push(
          `${attributed.aliasName} orders ${attributed.order.units} units, not fewer than ${other.aliasName}'s `
          + `${other.order.units} — MSN-E2E-008 asserts on a balance delta, so its order must complete its own `
          + 'mission and no sibling. Give it the smallest cart in the set.',
        );
      }
    }
  }

  for (const a of CASE_ACCOUNTS) {
    if (!a.aliasName.startsWith('MSN_E2E_USER_')) push(`${a.aliasName}: a per-run account alias should be MSN_E2E_USER_<case>`);
    if (!a.missionAliases?.length) push(`${a.aliasName}: binds to no mission — an account nothing reads through is dead weight nobody will notice`);
    for (const alias of a.missionAliases || []) {
      const m = MISSION_BY_ALIAS[alias];
      if (!m) { push(`${a.aliasName}: binds to ${alias}, which is not a declared mission`); continue; }
      if (!boundAccounts(m).includes(a.aliasName)) push(`${a.aliasName} claims ${alias} but ${alias} does not declare it — the account list and the mission list disagree, so one of them is describing a fixture that is not being seeded`);
    }
    // A padded group never matches: the server compares with EqualsIgnoreCase and does NOT trim, so
    // " VIP" is silently outside the audience and the pair can only ever agree.
    for (const g of a.groups || []) {
      if (typeof g !== 'string' || !g.trim()) push(`${a.aliasName}: declares an empty group — UserGroupIsCondition is fail-closed on an empty groups[], so this targets nobody rather than everybody`);
      else if (g !== g.trim()) push(`${a.aliasName}: group "${g}" is padded — the server's match is EqualsIgnoreCase and is NOT trimmed, so this account is silently outside its own audience`);
    }
  }

  /* ── The targeting star ───────────────────────────────────────────────────
   *
   * Every rule here defends a cell that can be destroyed by an edit which still seeds cleanly. Give
   * the private cell a group and it merges into the group arm; make the control non-public and the
   * whole star loses its instrument and reports two absences as a finding; let an arm drift on a
   * second field and neither reading attributes anything.
   */
  if (TARGETING_MISSIONS.length) {
    const byRole = {};
    for (const m of TARGETING_MISSIONS) {
      if (byRole[m.targetingRole]) push(`two targeting cells claim the role "${m.targetingRole}" (${m.aliasName}, ${byRole[m.targetingRole].aliasName}) — the star is a control plus one arm per question, and a duplicate role means one question is asked twice and another not at all`);
      byRole[m.targetingRole] = m;
    }
    const control = byRole.control;
    const group = byRole.groupTargeted;
    const priv = byRole.notPublic;
    if (!control) push('the targeting star has no "control" cell — without a Published, untargeted, public mission that BOTH accounts can see, every absence in the star is equally consistent with a broken query, and neither targeting question is decidable');
    if (!group) push('the targeting star has no "groupTargeted" cell — the group non-match question has nothing to read');
    if (!priv) push('the targeting star has no "notPublic" cell — the public=false question has nothing to read');

    if (control) {
      if (control.public !== true) push(`${control.aliasName} is the control and must be public=true — a control that may itself be hidden cannot certify that the query works`);
      if ((control.condition?.type || 'AnyUserGroupCondition') !== 'AnyUserGroupCondition') push(`${control.aliasName} is the control and must carry AnyUserGroupCondition — a targeted control cannot certify anything for an account outside its audience`);
      if (visibilityPolicy(control) !== 'required') push(`${control.aliasName} must declare visibility:'required' — asserting the control is the one visibility claim this star is allowed to make, and it is what turns every other absence into a reading`);
    }
    if (group) {
      if (visibilityPolicy(group) !== 'observed') push(`${group.aliasName} must declare visibility:'observed' — whether a group condition filters the customer read IS the finding, and a fixture that asserts it proves it by construction`);
      const groups = targetedGroups(group);
      if (!groups?.length) push(`${group.aliasName} is the group arm but targets no group — UserGroupIsCondition is fail-closed on an empty groups[], so it would be invisible to EVERYONE and the arm would read as a leak-free pass for the wrong reason`);
      for (const g of groups || []) {
        if (g !== String(g).trim()) push(`${group.aliasName}: group "${g}" is padded — the server does not trim, so the mission would target nobody`);
      }
      if (control) {
        const diff = specDifferences(group, control, STAR_EXEMPT_FIELDS);
        if (JSON.stringify(diff) !== JSON.stringify(['condition'])) {
          push(`${group.aliasName} differs from the control ${control.aliasName} on [${(diff || []).join(', ')}] — it must differ on "condition" and nothing else, or a difference between the two readings names none of them`);
        }
      }
    }
    if (priv) {
      if (priv.public !== false) push(`${priv.aliasName} is the public=false arm and must be public:false — at public:true it duplicates the control and asks nothing`);
      if (visibilityPolicy(priv) !== 'observed') push(`${priv.aliasName} must declare visibility:'observed' — whether \`public\` hides a mission IS the finding`);
      if ((priv.condition?.type || 'AnyUserGroupCondition') !== 'AnyUserGroupCondition') push(`${priv.aliasName} must carry AnyUserGroupCondition — with a group condition it stops isolating \`public\` and duplicates the shared MSN_GROUP_VIP_PRIVATE. Read its name as "not advertised", never as "audience-restricted"; getting that backwards cost a retracted P1 on 2026-08-27.`);
      if (control) {
        const diff = specDifferences(priv, control, STAR_EXEMPT_FIELDS);
        if (JSON.stringify(diff) !== JSON.stringify(['public'])) {
          push(`${priv.aliasName} differs from the control ${control.aliasName} on [${(diff || []).join(', ')}] — it must differ on "public" and nothing else, or an absence next to a present control names the second variable just as well`);
        }
      }
    }
    for (const m of TARGETING_MISSIONS) {
      if (m.targetRule !== TARGET_RULES.unreachable) push(`${m.aliasName}: targetRule "${m.targetRule}" — a targeting cell must be UNREACHABLE, or it grants on the first order of every other per-case account in the run and inflates the deltas MSN-E2E-001 and MSN-E2E-008 assert on`);
      if (m.goal?.value != null) push(`${m.aliasName}: goal.value is authored as ${m.goal.value} — the unreachable target is DERIVED from the largest cart the set declares (unreachableTarget()), because a transcribed ceiling goes stale the moment a case orders more and fails SILENTLY, by the mission quietly becoming completable`);
      const bound = boundAccounts(m);
      for (const alias of [TARGETING_MEMBER_ALIAS, TARGETING_OUTSIDER_ALIAS]) {
        if (!bound.includes(alias)) push(`${m.aliasName} is not read through ${alias} — every cell of the star must be read through BOTH accounts or the pair is not a comparison`);
      }
    }
    // The pair itself: same case, same kind, differing in GROUPS and nothing else the spec declares.
    const member = CASE_ACCOUNT_BY_ALIAS[TARGETING_MEMBER_ALIAS];
    const outsider = CASE_ACCOUNT_BY_ALIAS[TARGETING_OUTSIDER_ALIAS];
    if (!member || !outsider) push('the targeting star needs BOTH a member and an outsider account — "the VIP user sees the VIP mission" is equally true of a mission with no targeting at all, which is precisely the observation that produced the retracted 2026-08-27 bug');
    else {
      if (!groupsInclude(member.groups, TARGETING_GROUP)) push(`${member.aliasName} does not carry the targeted group ${TARGETING_GROUP} — the audience half of the pair is outside its own audience, so both halves would read the same whatever the server does`);
      if (groupsInclude(outsider.groups, TARGETING_GROUP)) push(`${outsider.aliasName} carries the targeted group ${TARGETING_GROUP} — the control half is INSIDE the audience, so the pair can only ever agree and the group question is unfalsifiable`);
      if (member.caseId !== outsider.caseId) push('the targeting pair spans two cases — the pair is one comparison and must belong to one case');
      const diff = specDifferences(member, outsider, ['aliasName', 'purpose', 'audienceRole', 'pairedWith', 'missionAliases']);
      if (JSON.stringify(diff) !== JSON.stringify(['groups'])) {
        push(`the targeting accounts differ on [${(diff || []).join(', ')}] — they must differ on "groups" and nothing else, because member.Groups is the only input UserGroupIsCondition reads and any second difference makes a divergent reading unattributable`);
      }
    }
    // The unreachable target must be out of reach of the WHOLE journey, not just of one order.
    const ceiling = unreachableTarget();
    const biggestJourney = Math.max(0, ...ALL_MISSIONS.map((m) => (
      (Number(m.order?.units) || 0) * Number(UNIT_PRODUCT.listPrice) * (Number(m.journeyOrders) || 1)
    )));
    if (!(ceiling > biggestJourney * 2)) {
      push(`the unreachable target ${ceiling} is not comfortably above the largest journey this set can place (${biggestJourney}) — a targeting cell that becomes completable starts granting on other cases' orders`);
    }
  }

  /* ── The journey mission ──────────────────────────────────────────────── */
  for (const m of ALL_MISSIONS.filter((x) => x.journeyOrders != null)) {
    if (m.goal?.type !== 'OrderCountGoal') push(`${m.aliasName}: journeyOrders is declared on a ${m.goal?.type} — an order is one increment only for a count goal`);
    else if (Number(m.journeyOrders) !== Number(m.goal.count)) {
      push(`${m.aliasName}: journeyOrders=${m.journeyOrders} but the goal counts ${m.goal.count} — the case would place the wrong number of orders and either never complete the mission or complete it before it can observe the intermediate state`);
    }
    if (Number(m.journeyOrders) < 2) push(`${m.aliasName}: journeyOrders=${m.journeyOrders} — with one order there is no intermediate state to observe, so "progress advanced" and "the mission completed" are the same reading`);
    if (!(Number(m.order?.units) > 0)) push(`${m.aliasName}: declares journeyOrders but no order.units — the seeder has no cart to measure, so the completion delta the case asserts on would be a guess`);
    if (!boundAccounts(m).length) push(`${m.aliasName}: a journey mission MUST own its account — it asserts the whole chain, so every link has to be attributable, and one order advances every mission applicable to its user`);
  }
  if (!CASE_ACCOUNT_PREFIX.startsWith(SEED_PREFIX)) push(`CASE_ACCOUNT_PREFIX "${CASE_ACCOUNT_PREFIX}" does not start with ${SEED_PREFIX} — teardown would not sweep the per-case accounts`);
  // The per-case accounts must NOT fall inside the ephemeral-user seeder's own sweep namespace, or
  // `npm run seed:loyalty:zero-user:teardown` would delete them mid-run.
  if (CASE_ACCOUNT_PREFIX.startsWith('AGENT-TEST-loyzero-')) push(`CASE_ACCOUNT_PREFIX collides with seed-loyalty-ephemeral-user.mjs's sweep namespace — that seeder's teardown would delete the per-case accounts underneath a running suite`);

  // --- the funded (points-spend) account ---------------------------------------
  //
  // A funded account is the one account in the set whose USEFULNESS is a number. Everything below
  // asks whether that number can still be satisfied and still means something.
  const funded = FUNDED_ACCOUNTS();
  for (const a of funded) {
    if (!(Number(a.minPoints) > 0)) {
      push(`${a.aliasName}: its funding floor derives to ${a.minPoints} — a floor of zero is satisfied by the zero-balance account that could not place the order in the first place, so the guard would pass the exact fixture it exists to reject`);
    }
    for (const alias of a.missionAliases) {
      const m = MISSION_BY_ALIAS[alias];
      if (!m) { push(`${a.aliasName} is funded for ${alias}, which is not a declared mission`); continue; }
      if (m.goal?.type !== 'PerSkuGoal') {
        push(`${a.aliasName} funds ${alias}, whose goal is ${m.goal?.type} — funding exists so a case can BUY a loyalty-currency line, and only the PerSku target is priced in one`);
      }
    }
    if (a.groups?.length) {
      push(`${a.aliasName} carries groups [${a.groups.join(', ')}] — customer-group membership changes which ProductPoints program wins, so the funded amount would depend on a variable this account has no reason to carry`);
    }
  }
  // The PTS product must be the one the funded account buys, and it must cost SOMETHING. A zero-priced
  // points target makes the spend free, which removes the balance from the question entirely — the
  // case would pass on a zero-balance account and prove nothing about currency at all.
  if (!(Number(PTS_PRODUCT.listPrice) > 0)) {
    push(`${PTS_PRODUCT.aliasName}.listPrice = ${PTS_PRODUCT.listPrice} — a free points line costs no balance, so the mixed cart is not a points SPEND and MSN-E2E-007 asks nothing about the loyalty currency`);
  }
  if (PTS_PRODUCT.currencyIntent !== 'loyalty') {
    push(`${PTS_PRODUCT.aliasName}.currencyIntent = "${PTS_PRODUCT.currencyIntent}" — the funded account exists to buy a LOYALTY-currency line; in any other currency no balance is consumed and the question collapses`);
  }
  // The two account properties that cannot coexist must be held by two different accounts. This is
  // the rule that would have caught MSN-029 borrowing the zero-balance reward account.
  for (const a of funded) {
    if (a.aliasName === REWARD_USER.aliasName) {
      push(
        `${a.aliasName} is both the legibility account and a funded spend account. `
        + 'Those are mutually exclusive: legibility needs balance < reward, a spend needs balance >= the '
        + "line's cost, and a balance can only be raised by earning (the loyalty op-log is read-only). "
        + 'Split them.',
      );
    }
  }

  return problems;
}

/**
 * The OVERLAY vacuity guard, and the check whose absence produced the 6-BLOCKED run. Pure: it judges
 * the state the last seed RECORDED, so it runs offline and still answers "was the data this suite ran
 * against actually usable?".
 *
 * `overlay` is the parsed aliases.<env>.json. Returns problem strings ([] = clean). An overlay with no
 * E2E entries at all is reported as UNSEEDED (one problem), not as clean — silence is never a pass.
 */
export function validateSeededState(overlay, { now = new Date(), maxAgeHours = null } = {}) {
  const problems = [];
  const o = overlay || {};
  const run = o.MSN_E2E_RUN || {};
  const runId = String(run.run_id || '');

  if (!runId) {
    return [
      'MSN_E2E_RUN.run_id is empty in the overlay — suite 083d has never been seeded on this env, so every '
      + 'case would resolve its mission to "" and read as a product failure. Run `npm run seed:missions-e2e`.',
    ];
  }
  if (!RUN_ID_PATTERN.test(runId)) problems.push(`MSN_E2E_RUN.run_id "${runId}" does not parse as a run handle — teardown cannot age it and the sweep floor is inoperative`);

  const age = runIdAgeHours(runId, now);
  if (maxAgeHours != null && age != null && age > maxAgeHours) {
    problems.push(`the seeded run is ${age.toFixed(1)}h old (limit ${maxAgeHours}h) — 083d's missions are minted per run, so a stale run means the suite is about to assert against progress a previous execution already consumed`);
  }

  for (const spec of ALL_MISSIONS) {
    const a = o[spec.aliasName];
    if (!a) { problems.push(`${spec.aliasName}: absent from the overlay — cases ${spec.cases.join(', ')} would resolve to nothing`); continue; }
    if (!a.id) problems.push(`${spec.aliasName}.id is empty — the mission was not created`);
    if (!a.name) problems.push(`${spec.aliasName}.name is empty — the storefront card is matched by name`);
    // RUN-SCOPING. This is the check that catches the seeder silently falling back to a reused
    // mission: the name must carry THIS run's handle, not some earlier one.
    if (a.name && !isE2EMissionName(a.name)) {
      problems.push(`${spec.aliasName}.name "${a.name}" is not a run-scoped E2E mission name — the fixture is not per-run, so its progress carries over between executions`);
    }
    if (a.name && runIdFromName(a.name) !== runId) {
      problems.push(`${spec.aliasName}.name carries run "${runIdFromName(a.name)}" but MSN_E2E_RUN.run_id is "${runId}" — the alias set is a mix of two runs, so some cases would assert against already-consumed progress`);
    }
    // VACUITY. The observed seed-time state must be pre-completion.
    const status = a.progress_status_at_seed;
    const percent = a.progress_percent_at_seed;
    if (status === '' || status == null) {
      problems.push(`${spec.aliasName}: no progress_status_at_seed was recorded — the seeder did not verify the fixture was usable, which is exactly the omission that let run REG-2026-08-28-1154 execute against six already-Completed missions`);
    } else if (!isPreCompletion({ status, percent })) {
      problems.push(
        `${spec.aliasName} was already at ${status} ${percent}% when it was seeded — cases ${spec.cases.join(', ')} `
        + 'cannot watch progress advance on a mission that has already finished, and a Completed mission stops accruing entirely.',
      );
    }
  }

  /* ── The per-case split, checked against what the seed actually recorded ──────
   *
   * Everything here asks whether the split DID ITS JOB, not whether it is present. A per-case mission
   * that seeded fine but sits on the same account as its sibling, or whose target no longer separates
   * anything, still resolves and still renders — and the case on it is back to reporting a coincidence.
   */
  const seenAccounts = new Map();
  const derivedByAlias = {};
  const orderTotalByAlias = {};
  for (const spec of CASE_MISSIONS) {
    const a = o[spec.aliasName] || {};
    const acct = o[spec.accountAlias];

    // [a] A DERIVED, non-empty target. Empty means the probe cart never ran and the mission was minted
    //     against nothing.
    const target = Number(a.goal_target);
    if (a.goal_target === '' || a.goal_target == null) {
      problems.push(`${spec.aliasName}.goal_target is empty — its target is derived from a live probe cart, so an empty one means the measurement never happened and the mission was minted against a number nobody computed`);
    } else if (!(target > 0)) {
      problems.push(`${spec.aliasName}.goal_target = ${a.goal_target} — a zero or negative target auto-completes and ${spec.caseId} has no loop to watch`);
    }
    derivedByAlias[spec.aliasName] = { target };

    // [b] THE BAND IS REAL. The two quantities the target separates must both be recorded and must
    //     straddle it by the declared floor. This is the check that fails when a fixture quietly stops
    //     discriminating — the failure mode `.claude/rules/test-data.md` SECOND RULE is about.
    const above = Number(a.separates_above);
    const below = Number(a.separates_below);
    const margin = Number(a.separation_margin);
    if (a.separates_above === '' || a.separates_above == null || a.separates_below === '' || a.separates_below == null) {
      problems.push(`${spec.aliasName}: the seed recorded no separates_above/separates_below — nothing says what this target was placed BETWEEN, so whether ${spec.caseId} can discriminate at all is unknown`);
    } else if (Number.isFinite(above) && Number.isFinite(below) && Number.isFinite(target)) {
      if (!(below < target && target <= above)) {
        problems.push(
          `${spec.aliasName}: target ${target} does not sit between ${below} and ${above} — the two readings `
          + `${spec.caseId} exists to tell apart now fall on the SAME side of it, so the case reports the same `
          + 'result whichever one the platform implements.',
        );
      }
      if (Number.isFinite(margin) && margin < MIN_TARGET_SEPARATION) {
        problems.push(`${spec.aliasName}: only ${margin} separates target ${target} from the nearer of ${below}/${above}, under the ${MIN_TARGET_SEPARATION} floor — a band that narrow is indistinguishable from a rounding rule`);
      }
    }

    // [c] The measured cart must be COHERENT and must be the cart the case will place.
    //
    // An UNRECORDED field is checked as an empty string, not coerced: `Number('')` is 0, which is
    // perfectly finite, so a missing measurement would otherwise read as a free and coherent zero and
    // sail through every check below it.
    const MEASURED_FIELDS = ['measured_subtotal', 'measured_discount', 'measured_tax', 'measured_shipping', 'measured_total'];
    const unrecorded = MEASURED_FIELDS.filter((f) => a[f] === '' || a[f] == null);
    const money = {
      grossMerchandise: Number(a.measured_subtotal),
      discountTotal: Number(a.measured_discount),
      netMerchandise: Number(a.measured_subtotal) - Number(a.measured_discount),
      shippingTotal: Number(a.measured_shipping),
      taxTotal: Number(a.measured_tax),
      orderTotal: Number(a.measured_total),
      pointsLineValue: 0,
      totalPlusPoints: Number(a.measured_total),
    };
    if (!unrecorded.length && Object.values(money).every((v) => Number.isFinite(v))) {
      const bad = moneyIncoherence(money);
      if (bad) problems.push(`${spec.aliasName}: ${bad}`);
      orderTotalByAlias[spec.aliasName] = money.orderTotal;
    } else {
      const which = unrecorded.length ? unrecorded.join(', ') : 'subtotal/discount/tax/shipping/total';
      problems.push(`${spec.aliasName}: the seed recorded no measured cart (${which}) — every number ${spec.caseId} composes its order from would be a guess`);
    }

    // [d] A coupon-driven mission must have actually been discounted when measured.
    if (spec.order.coupon) {
      if (!(Number(a.measured_discount) > 0)) {
        problems.push(`${spec.aliasName}: measured_discount is ${a.measured_discount} — the ${spec.order.coupon} coupon did not apply on the probe cart, so ${spec.caseId} would place an undiscounted order and assert a discount effect that never happened`);
      }
      const undiscounted = Number(a.measured_total_undiscounted);
      if (!Number.isFinite(undiscounted) || !(undiscounted > Number(a.measured_total))) {
        problems.push(`${spec.aliasName}: measured_total_undiscounted (${a.measured_total_undiscounted}) is not above measured_total (${a.measured_total}) — the counterfactual "the same order without the coupon WOULD have completed" was never measured, so ${spec.caseId} cannot claim it`);
      }
    }

    // [e] The per-case account is checked in the account pass below, which covers every per-run
    //     account rather than only the four measured cases. Only its PRESENCE is case-specific here.
    if (!acct) {
      problems.push(`${spec.accountAlias}: absent from the overlay — ${spec.caseId} has no dedicated account, so its order would advance every sibling mission on whatever account it falls back to (run \`npm run seed:missions-e2e\`)`);
    }
  }

  /* ── [e] EVERY per-run account, and each must be genuinely its own ────────
   *
   * A shared account IS the defect this whole split exists to remove: one order advances every
   * mission applicable to its user, so two aliases resolving to one login means the two cases consume
   * each other's progress however cleanly their missions are separated. Run over CASE_ACCOUNTS rather
   * than over the measured case missions, because the journey account and the targeting pair are just
   * as consumable and were previously unchecked.
   */
  for (const a of CASE_ACCOUNTS) {
    const acct = o[a.aliasName];
    if (!acct) {
      problems.push(`${a.aliasName}: absent from the overlay — ${a.caseId} has no dedicated account (run \`npm run seed:missions-e2e\`)`);
      continue;
    }
    if (!acct.email) problems.push(`${a.aliasName}.email is empty — ${a.caseId} cannot sign in`);
    if (!acct.user_id) problems.push(`${a.aliasName}.user_id is empty — progress is keyed on the security-account id, so nothing can verify this account's own row`);
    if (acct.email && !String(acct.email).startsWith(CASE_ACCOUNT_PREFIX)) {
      problems.push(`${a.aliasName}.email "${acct.email}" is outside the ${CASE_ACCOUNT_PREFIX} sweep namespace — teardown would leak it, and it may not be a per-run account at all`);
    }
    if (acct.email && seenAccounts.has(acct.email)) {
      problems.push(
        `${a.aliasName} and ${seenAccounts.get(acct.email)} resolve to the SAME account (${acct.email}). `
        + 'One order advances every mission applicable to its user, so these two cases would consume each '
        + 'other\'s progress — which is exactly the contention the per-case split exists to remove.',
      );
    } else if (acct.email) seenAccounts.set(acct.email, a.aliasName);

    // OBSERVED group membership, recorded by the seeder off the member entity rather than echoed
    // from the request. An empty string is "the seeder did not look", which is not the same as "no
    // groups" and must not be readable as one.
    if (acct.groups_at_seed == null) {
      problems.push(`${a.aliasName}: no groups_at_seed was recorded — member.Groups is the only input a UserGroupIsCondition reads, so an unrecorded reading means nothing verified which side of the audience this account is on`);
    } else {
      const observed = String(acct.groups_at_seed).split(';').map((g) => g.trim()).filter(Boolean);
      const wanted = a.groups || [];
      for (const g of wanted) {
        if (!groupsInclude(observed, g)) {
          problems.push(`${a.aliasName} was seeded to carry group "${g}" but the platform reported [${observed.join(', ') || 'none'}] — the audience half of the targeting pair is outside its own audience, so both halves read the same whatever the server does`);
        }
      }
      if (!wanted.length && groupsInclude(observed, TARGETING_GROUP)) {
        problems.push(`${a.aliasName} is the outsider half of the targeting pair but the platform reports it in [${observed.join(', ')}] — it is INSIDE the audience, so the pair can only ever agree and the group question is unfalsifiable`);
      }
    }
  }

  /* ── [g] THE TARGETING STAR, against what the seed actually observed ──────
   *
   * The star records readings and asserts almost nothing, which is correct — whether `public` hides a
   * mission and whether a group condition filters the customer read are the findings. What the guard
   * MUST enforce is that the readings are decidable at all:
   *   - a reading exists for BOTH accounts on every cell (an unrecorded reading is not an absence);
   *   - the CONTROL came back for both accounts (the instrument works, so every other absence is a
   *     reading rather than a broken query);
   *   - the cells' targets are still out of reach (a completable star cell grants on other cases'
   *     orders and corrupts the two deltas that ARE asserted on).
   */
  for (const spec of TARGETING_MISSIONS) {
    // An alias absent from the overlay is reported once, by the pass above. Re-reporting it here as
    // three more problems would bury the one line that says what to do about it.
    if (!o[spec.aliasName]) continue;
    const a = o[spec.aliasName];
    const bound = boundAccounts(spec);
    const reading = parseVisibility(a.observed_visibility);
    if (a.observed_visibility === '' || a.observed_visibility == null) {
      problems.push(`${spec.aliasName}: no observed_visibility was recorded — the seed never read the storefront's mission list as either account, so ${spec.caseId} would be asserting against a targeting question nobody has established is observable`);
    } else {
      for (const alias of bound) {
        if (!(alias in reading)) problems.push(`${spec.aliasName}: observed_visibility carries no reading for ${alias} — a cell read through only one account is not a comparison`);
      }
    }
    const target = Number(a.goal_target);
    if (!(target > 0)) {
      problems.push(`${spec.aliasName}.goal_target = ${a.goal_target} — a targeting cell needs an UNREACHABLE target, and a zero one auto-completes and starts granting on every account that sees it`);
    } else if (target < unreachableTarget()) {
      problems.push(`${spec.aliasName}.goal_target = ${target}, below the ${unreachableTarget()} derived from the largest cart this set declares — the cell has become completable, so it grants on the first order of every per-case account and inflates the deltas MSN-E2E-001 and MSN-E2E-008 assert on`);
    }
  }
  const controlSpec = TARGETING_MISSIONS.find((m) => m.targetingRole === 'control');
  if (controlSpec) {
    const reading = parseVisibility(o[controlSpec.aliasName]?.observed_visibility);
    for (const alias of boundAccounts(controlSpec)) {
      if (reading[alias] === false) {
        problems.push(
          `${controlSpec.aliasName} — the targeting star's positive CONTROL — was NOT visible to ${alias} at seed time. `
          + 'It is a Published, untargeted, public mission, so its absence means that account sees no missions at '
          + 'all; every other absence in the star is then equally consistent with a broken query and neither '
          + 'targeting question is decidable. This is a broken instrument, not a finding.',
        );
      }
    }
  }

  /* ── [h] THE JOURNEY, against what the seed measured ─────────────────────
   *
   * MSN-E2E-001 asserts the whole chain and ends on a balance delta, so the number it may assert on
   * is the delta of the COMPLETING order — not the mission's own reward. On this environment a fresh
   * account's FIRST order fires every one-shot mission the store carries, so `BAL_1 - BAL_0` is not
   * the reward and never was; the two orders are therefore recorded separately.
   */
  for (const spec of ALL_MISSIONS.filter((m) => m.journeyOrders != null)) {
    const a = o[spec.aliasName] || {};
    const MEASURED = ['measured_subtotal', 'measured_discount', 'measured_tax', 'measured_shipping', 'measured_total'];
    const missing = MEASURED.filter((f) => a[f] === '' || a[f] == null);
    if (missing.length) {
      problems.push(`${spec.aliasName}: the seed recorded no measured cart (${missing.join(', ')}) — ${spec.caseId} composes both of its orders from those numbers, and an unmeasured cart makes the completion delta a guess`);
    } else {
      const money = {
        grossMerchandise: Number(a.measured_subtotal),
        discountTotal: Number(a.measured_discount),
        netMerchandise: Number(a.measured_subtotal) - Number(a.measured_discount),
        shippingTotal: Number(a.measured_shipping),
        taxTotal: Number(a.measured_tax),
        orderTotal: Number(a.measured_total),
        pointsLineValue: 0,
        totalPlusPoints: Number(a.measured_total),
      };
      const bad = moneyIncoherence(money);
      if (bad) problems.push(`${spec.aliasName}: ${bad}`);
    }
    for (const f of ['order1_co_missions', 'order1_expected_delta', 'co_completing_missions', 'reward_expected_total']) {
      if (a[f] === '' || a[f] == null) {
        problems.push(`${spec.aliasName}.${f} is empty — the co-grant set is MEASURED per order because a fresh account's first order fires every one-shot mission the store carries. Without it ${spec.caseId} would assert that a ${spec.reward}-PTS grant equals a balance delta that is not ${spec.reward}.`);
      }
    }
  }

  /* ── [i] THE GRANT MUST BE IDENTIFIABLE BY AMOUNT, against the MEASURED co-grant set ───
   *
   * Accounts isolate PROGRESS; they do not isolate GRANTS. Every per-run account can see every
   * Published, untargeted mission in the store, so its order completes whatever it clears — including
   * missions another suite owns. A case that asserts a mission paid out therefore needs the grant to
   * be identifiable, and the two things that identify it are the run-scoped mission NAME in the points
   * history and the AMOUNT. The name is unique by construction; the amount is not, and nothing in this
   * repo could see a collision with a fixture outside this set.
   *
   * Measured on vcst-qa 2026-08-28: the journey's completing order also completed the shared 083c
   * AGENT-TEST-MSN-ORDERCOUNT — an OrderCountGoal of 2 whose reward was ALSO 300. Two identical grants
   * on one order, and every fixture still resolved, still rendered and still reported green.
   *
   * The set's own divergent-reward rule cannot catch this: it scans the eleven missions this module
   * declares. This one reads the co-grant set the SEEDER measured live, which is the only place the
   * rest of the store appears.
   */
  for (const spec of ALL_MISSIONS) {
    const a = o[spec.aliasName];
    if (!a) continue;
    for (const field of ['order1_co_missions', 'co_completing_missions']) {
      const raw = a[field];
      if (!raw || raw === 'none') continue;
      for (const entry of String(raw).split(';')) {
        const idx = entry.lastIndexOf('=');
        if (idx < 0) continue;
        const name = entry.slice(0, idx).trim();
        const reward = Number(entry.slice(idx + 1));
        if (!Number.isFinite(reward) || reward !== Number(spec.reward)) continue;
        problems.push(
          `${spec.aliasName} rewards ${spec.reward} PTS and so does ${name}, which the seed MEASURED as also `
          + `granting on the same order (${field}). Two identical grants settling together are `
          + `indistinguishable in a balance delta and in a points-history amount, so ${spec.caseId} cannot show `
          + 'that THIS mission paid out. Give this mission a reward no co-granting mission carries — the '
          + 'collision is usually with a fixture another suite owns, which the in-set divergence rule cannot see.',
        );
      }
    }
  }

  // [f] ATTRIBUTION, against the measured order totals. MSN-E2E-008's own order must complete its own
  //     mission and no sibling, or the balance delta it asserts on names nothing.
  if (Object.keys(orderTotalByAlias).length === CASE_MISSIONS.length) {
    for (const spec of ALL_MISSIONS) {
      if (derivedByAlias[spec.aliasName]) continue;
      if (spec.goal?.type !== 'OrderValueGoal') continue;
      // A star cell's target is DERIVED at seed time (unreachable), so its authored `value` is null and
      // `Number(null)` is 0 — which would make every sibling order look like it completes it and
      // manufacture an attribution failure out of the one design property that guarantees there is
      // none. Read the recorded target instead, and skip a cell the overlay has not recorded yet.
      const recorded = isTargetingMission(spec) ? Number(o[spec.aliasName]?.goal_target) : Number(spec.goal.value);
      if (Number.isFinite(recorded)) derivedByAlias[spec.aliasName] = { target: recorded };
    }
    for (const m of attributionProblems(derivedByAlias, orderTotalByAlias)) problems.push(m);
  }

  for (const p of PRODUCTS) {
    const a = o[p.aliasName];
    if (!a) { problems.push(`${p.aliasName}: absent from the overlay — the product was never resolved`); continue; }
    if (!a.productId) problems.push(`${p.aliasName}.productId is empty — the fixture product does not exist on this env`);
    if (!a.currency) problems.push(`${p.aliasName}.currency is empty — the resolved price currency was never recorded, so no case can tell which currency the line settles in`);
    // The PDP path must come from the storefront's own product resolver, not from string composition.
    // `/product/<sku>` and a flat `/<sku>` both render a client-side 404 behind HTTP 200 on this
    // storefront — a soft-404 no status check can see — so a composed url sends the case to a blank
    // page it will report as a product bug.
    if (!a.slug) problems.push(`${p.aliasName}.slug is empty — the storefront path was never resolved, so any PDP navigation in 083d is a guess`);
    if (!a.url) problems.push(`${p.aliasName}.url is empty — cases navigate {{FRONT_URL}}@td(${p.aliasName}.url)`);
    if (a.slug && a.url && a.url !== `/${String(a.slug).replace(/^\/+/, '')}`) {
      problems.push(`${p.aliasName}.url "${a.url}" does not match its resolved slug "${a.slug}" — one of the two was composed by hand and will 404`);
    }
  }
  const ptsOverlay = o[PTS_PRODUCT.aliasName] || {};
  const unitOverlay = o[UNIT_PRODUCT.aliasName] || {};
  if (ptsOverlay.currency && unitOverlay.currency && ptsOverlay.currency === unitOverlay.currency) {
    problems.push(
      `${PTS_PRODUCT.aliasName} resolved to the same currency as ${UNIT_PRODUCT.aliasName} (${ptsOverlay.currency}) — `
      + 'MSN-E2E-007 asks whether a LOYALTY-currency line counts toward a quantity target, and both products now settle in the same currency, so it asks nothing.',
    );
  }

  // LEGIBILITY. The reward account's balance must stay below the reward it is about to be granted.
  const ru = o[REWARD_USER.aliasName];
  const reward = Number(MISSION_BY_ALIAS[REWARD_USER.rewardAlias]?.reward);
  if (!ru) {
    problems.push(`${REWARD_USER.aliasName}: absent from the overlay — MSN-E2E-004 has no low-balance account and would run against whatever balance the session happens to carry`);
  } else {
    if (!ru.email) problems.push(`${REWARD_USER.aliasName}.email is empty — the per-run zero-balance account was not provisioned (run \`npm run seed:loyalty:zero-user\`)`);
    if (ru.balance_at_seed === '' || ru.balance_at_seed == null) {
      problems.push(`${REWARD_USER.aliasName}: no balance_at_seed was recorded — the legibility of the reward was never checked`);
    } else if (!balanceIsLegible(ru.balance_at_seed, reward)) {
      problems.push(
        `${REWARD_USER.aliasName} held ${ru.balance_at_seed} PTS at seed time against a ${reward} PTS reward — `
        + 'MSN-E2E-004 asserts the points it spends were EARNED FROM THE MISSION, and a grant that does not at '
        + 'least double the balance cannot demonstrate that. The balance climbs on every completion and there is '
        + 'no write API to lower it, so the fix is a fresh ephemeral account: `npm run seed:loyalty:zero-user`.',
      );
    }
  }

  /* ── [j] SPENDABILITY. The mirror image of legibility, and the second way this set could resolve
   *      perfectly and test nothing.
   *
   * A funded account that cannot pay for the line its case must buy fails at `createOrderFromCart`
   * with LOYALTY_INSUFFICIENT_BALANCE. The case then never places an order, so the mission's own
   * seed-time reading — `InProgress`, `currentQuantity 0`, `isStarted false` — is still sitting there
   * when it polls, and it reports that untouched state as though it were the outcome. Measured
   * exactly so on 2026-09-01: seven polls, nothing moved, and the case concluded neither that the
   * points line was counted nor that it was excluded.
   */
  for (const a of FUNDED_ACCOUNTS()) {
    const acct = o[a.aliasName];
    if (!acct) continue;   // absence is reported once by the account pass above
    const cost = Number(a.minPoints);
    const bal = acct.balance_at_seed;
    if (bal === '' || bal == null) {
      problems.push(`${a.aliasName}: no balance_at_seed was recorded — this is the one account whose usefulness IS its balance, and an unrecorded balance means the seed never established it could pay for the line ${a.caseId} must buy`);
    } else if (!balanceCoversPtsLine(bal, cost)) {
      problems.push(
        `${a.aliasName} held ${bal} points at seed time but ${a.caseId} must buy a line costing ${cost}. `
        + 'The order is refused with LOYALTY_INSUFFICIENT_BALANCE, so the case never places it and reads '
        + 'the mission\'s untouched seed-time state as its result — a fixture that resolves, renders and '
        + 'reports while deciding nothing. Points can only be raised by EARNING (the loyalty operation '
        + 'log is read-only): re-run `npm run seed:missions-e2e`, which funds this account.',
      );
    }
    if (acct.pts_line_cost !== '' && acct.pts_line_cost != null && Number(acct.pts_line_cost) !== cost) {
      problems.push(`${a.aliasName}.pts_line_cost = ${acct.pts_line_cost} but the fixture derives ${cost} from ${PTS_PRODUCT.aliasName}'s own list price — the recorded cost has stopped following its source, so the balance was checked against the wrong number`);
    }
    // THE BASELINE. The case reads a DELTA against what the seed observed, so an unrecorded baseline
    // is what let the previous fixture mistake seed state for an outcome.
    for (const f of ['pts_progress_status_at_seed', 'pts_is_started_at_seed', 'pts_current_quantity_at_seed']) {
      if (acct[f] === '' || acct[f] == null) {
        problems.push(`${a.aliasName}.${f} is empty — ${a.caseId} distinguishes "not yet processed" from "processed and correctly excluded", and without the seed-time baseline both readings are the same number`);
      }
    }
    // A target already part-bought at seed time cannot show a contribution of zero.
    const q = Number(acct.pts_current_quantity_at_seed);
    if (Number.isFinite(q) && q > 0) {
      problems.push(`${a.aliasName}: the PerSku target already read currentQuantity ${q} at seed time — ${a.caseId} asks whether a points line contributes 0, and a target that is already above 0 cannot show that`);
    }
    // isStarted MUST still be false. It is the case's settle signal — the one reading that separates
    // "the order has not been processed yet" from "it was processed and the points line was correctly
    // excluded", because BOTH of those show currentQuantity 0. And it is not specific to the target:
    // measured on vcst-qa 2026-09-01, a funding order for an unrelated cash SKU flipped isStarted to
    // true on this mission while leaving currentQuantity at 0. So an account funded AFTER its missions
    // were minted arrives with the signal already spent, and the case can no longer tell the two
    // states apart in either direction.
    if (String(acct.pts_is_started_at_seed) === 'true') {
      problems.push(
        `${a.aliasName}: the PerSku mission already read isStarted=true at seed time, so ${a.caseId}'s settle `
        + 'signal is spent before the case starts — with currentQuantity 0 on both sides, "not yet processed" '
        + 'and "processed and correctly excluded" become the same reading. Any order by this user flips '
        + 'isStarted, target SKU or not, so the funding order must be placed BEFORE the run\'s missions are '
        + 'minted: re-run the full `npm run seed:missions-e2e` rather than `--fund-accounts`, which funds '
        + 'against an already-minted run and can only produce this state.',
      );
    }
  }

  return problems;
}
