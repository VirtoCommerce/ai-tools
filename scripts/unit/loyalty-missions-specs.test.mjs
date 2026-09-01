/**
 * Unit tests for scripts/seed-data/loyalty/missions-specs.mjs — the VCST-5319 Loyalty Missions
 * fixture set. Pure logic only: no network, no env, no fs.
 *
 * The tests are written against the ways this fixture set can go VACUOUS rather than the ways it can
 * go missing. Every mission here is defined by a value that reads as arbitrary — public=false, a
 * target of 0, a reward of 0, a null currency, an `all` flag that must disagree with its twin — and
 * each of those survives any "does the fixture exist?" check after being edited to something more
 * plausible. So most of what follows perturbs the spec set and asserts the guard NOTICES.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SEED_PREFIX, NAME_PREFIX, RUNTIME_FIELDS_BY_KIND, STORE_SETTING, TARGETING, PROCESSED_PERIODICITY,
  STATUSES, ALLOWED_TRANSITION, WINDOWS, PERSKU_PRODUCTS, CURRENCY_INTENTS,
  MISSIONS, MISSION_BY_ALIAS, BLOCK,
  missionName, isSeededMissionName, needsGoalItems, windowDates, resolveCurrencies,
  buildGoalNode, buildConditionNode, buildRewardNode, buildMissionBody, blockOf,
  missionSignature, signaturesMatch, windowIsOpen, windowExpectsOpen,
  BANNERS, BANNER_FOLDER, bannerKeyFor, bannerSourceRel, bannerAssetRel, resolveBannerUrl,
  resolveLocales, localizedString, localizedValues, buildLocalizedFields, LOCALE_INTENTS, MIN_LOCALES,
  buildGoalItems, reconcileGoalItems, validateSpecShape, separatorTarget, predictOrderValueByReading,
  PROGRESS_ORDER, PROGRESS_ORDERS, PROGRESS_ORDER_COUNT, progressOrderNumber, predictProgress, progressFixtures,
  goalItemQuantities, DANGER_THRESHOLD_DAYS, WINDOW_CLOCK_SLACK_DAYS,
  TARGET_GROUP, GROUP_AUDIENCE, GROUP_PAIR_EXEMPT_FIELDS,
  specDifferences, targetedGroups, isGroupTargeted, groupMatches, groupsInclude,
  ZERO_STOCK_PRODUCT, TARGET_PRODUCTS, goalSlotsFor, productBySlot,
  localeIntentsUsed, localeFieldFor,
} from '../seed-data/loyalty/missions-specs.mjs';

/* ── A faithful stand-in for GET /api/loyalty-missions/new ───────────────────
 * Transcribed from the live response on vcst-qa @ VirtoCommerce.Loyalty 3.1006.0-pr-14-1be7. Kept
 * verbatim (including the empty availableChildren/children on leaves) so a builder that quietly
 * depends on the real shape fails here rather than at seed time.
 */
const template = () => ({
  status: 'Draft', name: null, localizedName: null, description: null, bannerUrl: null,
  storeId: null, startDate: null, endDate: null, public: false, periodicity: 'None',
  dynamicExpression: {
    all: true, not: false, id: 'LoyaltyMissionConditionAndRewardTree',
    availableChildren: [],
    children: [
      {
        all: false, not: false, id: 'BlockLoyaltyMissionCondition',
        availableChildren: [
          { groups: null, id: 'UserGroupIsCondition', availableChildren: [], children: [] },
          { id: 'AnyUserGroupCondition', availableChildren: [], children: [] },
        ],
        children: [],
      },
      {
        all: false, not: false, id: 'BlockLoyaltyMissionGoals',
        availableChildren: [
          { value: 0, currencyCode: null, missionType: 'OrderValue', id: 'OrderValueGoal', availableChildren: [], children: [] },
          { count: 0, missionType: 'OrderCount', id: 'OrderCountGoal', availableChildren: [], children: [] },
          { all: true, missionType: 'PerSku', id: 'PerSkuGoal', availableChildren: [], children: [] },
        ],
        children: [],
      },
      {
        id: 'BlockLoyaltyReward',
        availableChildren: [{ amount: 0, id: 'FixedAmountReward', availableChildren: [], children: [] }],
        children: [],
      },
    ],
  },
  createdDate: '0001-01-01T00:00:00Z', modifiedDate: null, createdBy: null, modifiedBy: null, id: null,
});

const NOW = new Date('2026-08-27T12:00:00.000Z');
/** The B2B-store currency set as it stands on vcst-qa, resolved through the same pure helper. */
const STORE_CURRENCIES = { defaultCurrency: 'USD', currencies: ['GHS', 'CZK', 'CNY', 'PTS', 'AUD', 'EUR', 'XPT', 'GBP', 'USD'] };
const CURRENCIES = resolveCurrencies(STORE_CURRENCIES);
/** The B2B-store language set as it stands on vcst-qa, resolved through the same pure helper. */
const STORE_LANGUAGES = {
  defaultLanguage: 'en-US',
  languages: ['pl-PL', 'sv-SE', 'de-DE', 'fr-FR', 'en-US', 'ja-JP'],
};
const LOCALES = resolveLocales(STORE_LANGUAGES);
/** Everything a full create body needs, so a whole-set loop cannot forget one and skip a fixture. */
/** Stand-in for what the platform asset store hands back — absolute and host-bearing, as it really is. */
const BANNER_URLS = Object.fromEntries(Object.keys(BANNERS).map((k) => [k, 'https://env.test/cms-content/assets/' + bannerAssetRel(k)]));
const RESOLVED = { currencies: CURRENCIES, locales: LOCALES, bannerUrls: BANNER_URLS };
const spec = (alias) => MISSION_BY_ALIAS[alias];
/** A deep, mutable copy of the whole spec set, for perturbation tests. */
const clone = (o) => JSON.parse(JSON.stringify(o));

/* ── The committed set ──────────────────────────────────────────────────────── */

test('the committed spec set is clean as authored', () => {
  assert.deepEqual(validateSpecShape(), []);
});

test('every mission name is prefixed so teardown can sweep exactly these', () => {
  for (const m of MISSIONS) {
    assert.ok(missionName(m).startsWith(`${NAME_PREFIX}-`), `${m.aliasName} is not swept by the prefix`);
    assert.ok(missionName(m).startsWith(SEED_PREFIX), `${m.aliasName} is outside the ${SEED_PREFIX} family`);
    assert.equal(isSeededMissionName(missionName(m)), true);
  }
});

test('isSeededMissionName does not claim missions someone else created', () => {
  assert.equal(isSeededMissionName('Summer Points Drive'), false);
  assert.equal(isSeededMissionName('AGENT-TEST-Loyalty-Program'), false, 'a sibling AGENT-TEST entity is not a mission');
  assert.equal(isSeededMissionName(''), false);
  assert.equal(isSeededMissionName(null), false);
});

test('mission alias names and business keys are unique', () => {
  assert.equal(new Set(MISSIONS.map((m) => m.aliasName)).size, MISSIONS.length);
  assert.equal(new Set(MISSIONS.map((m) => missionName(m))).size, MISSIONS.length);
});

test('the fixture set covers all three goal types and both PerSku modes', () => {
  const goals = new Set(MISSIONS.map((m) => m.goal.type));
  assert.deepEqual([...goals].sort(), ['OrderCountGoal', 'OrderValueGoal', 'PerSkuGoal']);
  assert.equal(spec('MSN_PERSKU_ALL').goal.all, true);
  assert.equal(spec('MSN_PERSKU_ANY').goal.all, false);
});

test('every mission uses the only periodicity the module actually processes', () => {
  for (const m of MISSIONS) {
    const body = buildMissionBody(m, { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
    assert.equal(body.periodicity, PROCESSED_PERIODICITY, `${m.aliasName} would exercise unprocessed periodicity surface`);
  }
});

/* ── The vacuity guards: perturb, then assert the guard notices ─────────────── */

/**
 * validateSpecShape reads the module-level constants, so perturbing them in place is the only way to
 * exercise it. Each test mutates one field, asserts the guard fires with a recognisable reason, and
 * restores — so a guard that has been quietly weakened to always-return-[] fails here.
 */
function withMutation(target, key, value, assertFn) {
  const original = target[key];
  target[key] = value;
  try { assertFn(); } finally { target[key] = original; }
}

test('guard catches MSN_PUBLISHED_PRIVATE being flipped public (C17 goes vacuous)', () => {
  withMutation(spec('MSN_PUBLISHED_PRIVATE'), 'public', true, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /MSN_PUBLISHED_PRIVATE/.test(x)), `expected a MSN_PUBLISHED_PRIVATE problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches MSN_PUBLISHED_PRIVATE being demoted to Draft', () => {
  withMutation(spec('MSN_PUBLISHED_PRIVATE'), 'status', 'Draft', () => {
    assert.ok(validateSpecShape().some((x) => /MSN_PUBLISHED_PRIVATE/.test(x)));
  });
});

test('guard catches the PerSku pair collapsing to the same all-flag', () => {
  withMutation(spec('MSN_PERSKU_ANY'), 'goal', { type: 'PerSkuGoal', all: true }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /unfalsifiable/.test(x)), `expected the ALL/ANY divergence problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches MSN_ZEROTARGET losing its zero', () => {
  withMutation(spec('MSN_ZEROTARGET'), 'goal', { type: 'OrderCountGoal', count: 1 }, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_ZEROTARGET/.test(x)));
  });
});

test('guard catches MSN_ZEROREWARD losing its zero', () => {
  withMutation(spec('MSN_ZEROREWARD'), 'reward', 50, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_ZEROREWARD/.test(x)));
  });
});

test('guard catches a LITERAL currency code being committed instead of an intent', () => {
  // A currency is per-env store config (store.defaultCurrency / store.currencies), so a committed
  // "USD" is the same class of mistake as a committed GUID.
  withMutation(spec('MSN_ORDERVALUE'), 'goal', { type: 'OrderValueGoal', value: 250, currencyCode: 'USD' }, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_ORDERVALUE/.test(x) && /literal currencyCode|one of store-default/.test(x)));
  });
});

test('guard catches the currency pair collapsing onto one currency', () => {
  withMutation(spec('MSN_ORDERVALUE_ALTCURRENCY'), 'goal', { type: 'OrderValueGoal', value: 250, currency: 'store-default' }, () => {
    assert.ok(validateSpecShape().some((x) => /SAME currency intent/.test(x)));
  });
});

test('guard catches the currency pair drifting on a second variable', () => {
  // The pair is a controlled experiment. If the thresholds or rewards diverge too, a failure can no
  // longer be attributed to the currency.
  withMutation(spec('MSN_ORDERVALUE_ALTCURRENCY'), 'goal', { type: 'OrderValueGoal', value: 999, currency: 'store-alternate' }, () => {
    assert.ok(validateSpecShape().some((x) => /only variable/.test(x)));
  });
  withMutation(spec('MSN_ORDERVALUE_ALTCURRENCY'), 'reward', 1, () => {
    assert.ok(validateSpecShape().some((x) => /only variable/.test(x)));
  });
});

test('guard catches a null-currency order-value goal, which the server rejects outright', () => {
  withMutation(spec('MSN_ORDERVALUE'), 'goal', { type: 'OrderValueGoal', value: 250, currency: null }, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_ORDERVALUE/.test(x) && /store-default/.test(x)));
  });
});

test('resolveCurrencies picks a deterministic, genuinely different alternate', () => {
  const r = resolveCurrencies(STORE_CURRENCIES);
  assert.equal(r['store-default'], 'USD');
  assert.notEqual(r['store-alternate'], r['store-default']);
  assert.equal(r['store-alternate'], 'AUD', 'first non-default in sorted order, so a re-seed does not churn the overlay');
  assert.deepEqual(resolveCurrencies(STORE_CURRENCIES), r, 'must be stable across calls');
});

test('resolveCurrencies refuses a single-currency store rather than collapsing the pair', () => {
  // Two "different-currency" fixtures sharing a currency test nothing, so this fails loudly at seed
  // time instead of quietly seeding a degenerate pair.
  assert.throws(() => resolveCurrencies({ defaultCurrency: 'USD', currencies: ['USD'] }), /needs a second one/);
  assert.throws(() => resolveCurrencies({ defaultCurrency: 'USD', currencies: ['usd', 'USD'] }), /needs a second one/, 'case-insensitive: usd is not a different currency from USD');
  assert.throws(() => resolveCurrencies({ currencies: ['USD', 'EUR'] }), /no defaultCurrency/);
});

test('buildGoalNode resolves the currency intent and refuses an unresolvable one', () => {
  const goals = blockOf(template().dynamicExpression, BLOCK.goals);
  assert.equal(buildGoalNode(spec('MSN_ORDERVALUE'), goals, { currencies: CURRENCIES }).currencyCode, 'USD');
  assert.equal(buildGoalNode(spec('MSN_ORDERVALUE_ALTCURRENCY'), goals, { currencies: CURRENCIES }).currencyCode, 'AUD');
  // No currencies supplied: must throw rather than emit currencyCode:null, which the server rejects
  // with a message that says nothing about the real cause.
  assert.throws(() => buildGoalNode(spec('MSN_ORDERVALUE'), goals, {}), /did not resolve/);
  assert.throws(() => buildGoalNode(spec('MSN_ORDERVALUE'), goals, { currencies: {} }), /REQUIRED at save/);
});

test('buildGoalNode never emits a currencyCode on a goal type that has none', () => {
  const goals = blockOf(template().dynamicExpression, BLOCK.goals);
  const count = buildGoalNode(spec('MSN_ORDERCOUNT'), goals, { currencies: CURRENCIES });
  assert.equal(count.currencyCode, undefined);
  const perSku = buildGoalNode(spec('MSN_PERSKU_ALL'), goals, { currencies: CURRENCIES });
  assert.equal(perSku.currencyCode, undefined);
  assert.equal('currency' in perSku, false, 'the symbolic intent must never reach the wire');
});

test('the currency intent itself never reaches the API body', () => {
  const goal = blockOf(
    buildMissionBody(spec('MSN_ORDERVALUE'), { template: template(), storeId: 'S', now: NOW, ...RESOLVED }).dynamicExpression,
    BLOCK.goals,
  ).children[0];
  assert.equal('currency' in goal, false, 'currency is our vocabulary, not the module\'s');
  assert.equal(goal.currencyCode, 'USD');
});

test('a signature separates the currency pair', () => {
  const t = () => template();
  const usd = missionSignature(buildMissionBody(spec('MSN_ORDERVALUE'), { template: t(), storeId: 'S', now: NOW, ...RESOLVED }));
  const alt = missionSignature(buildMissionBody(spec('MSN_ORDERVALUE_ALTCURRENCY'), { template: t(), storeId: 'S', now: NOW, ...RESOLVED }));
  assert.equal(usd.goalCurrency, 'USD');
  assert.equal(alt.goalCurrency, 'AUD');
  assert.equal(signaturesMatch(usd, alt), false, 'a currency-only difference must count as drift, or the seeder cannot heal a wrong-currency fixture');
});

test('currency intents are a closed vocabulary', () => {
  assert.deepEqual([...CURRENCY_INTENTS].sort(), ['store-alternate', 'store-default']);
  for (const m of MISSIONS) {
    if (!m.goal.currency) continue;
    assert.ok(CURRENCY_INTENTS.includes(m.goal.currency), `${m.aliasName} uses an unknown currency intent`);
  }
});

test('guard catches MSN_DRAFT losing recreateAlways — the one-shot mutation fixture', () => {
  withMutation(spec('MSN_DRAFT'), 'recreateAlways', false, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_DRAFT/.test(x) && /recreate/i.test(x)));
  });
});

test('guard catches a mission with no condition (the API rejects it at 400)', () => {
  withMutation(spec('MSN_ORDERCOUNT'), 'condition', undefined, () => {
    assert.ok(validateSpecShape().some((x) => /no condition/.test(x)));
  });
});

test('guard catches a reward silently turned into a string', () => {
  withMutation(spec('MSN_ORDERCOUNT'), 'reward', '300', () => {
    assert.ok(validateSpecShape().some((x) => /reward must be a number/.test(x)));
  });
});

test('guard catches a status outside the module vocabulary', () => {
  // The API itself accepts ANY status string (verified live — no vocabulary validation server-side),
  // so this guard is the only thing standing between a typo and a fixture nothing will ever match.
  withMutation(spec('MSN_ORDERCOUNT'), 'status', 'Activated', () => {
    assert.ok(validateSpecShape().some((x) => /not one of/.test(x)));
  });
});

/* ── Body building ──────────────────────────────────────────────────────────── */

test('buildMissionBody produces exactly one condition, one goal and one reward', () => {
  // These are the module's own server-side validators: "at least one condition", "exactly one goal",
  // "at least one reward". A body violating any of them is a 400 at seed time.
  for (const m of MISSIONS) {
    const tree = buildMissionBody(m, { template: template(), storeId: 'B2B-store', now: NOW, ...RESOLVED }).dynamicExpression;
    assert.equal(blockOf(tree, BLOCK.condition).children.length, 1, `${m.aliasName} condition count`);
    assert.equal(blockOf(tree, BLOCK.goals).children.length, 1, `${m.aliasName} goal count`);
    assert.equal(blockOf(tree, BLOCK.reward).children.length, 1, `${m.aliasName} reward count`);
  }
});

test('buildMissionBody carries name, store, status and public through', () => {
  const m = spec('MSN_PUBLISHED_PRIVATE');
  const body = buildMissionBody(m, { template: template(), storeId: 'B2B-store', now: NOW, ...RESOLVED });
  assert.equal(body.name, 'AGENT-TEST-MSN-PUBLISHED-PRIVATE');
  assert.equal(body.storeId, 'B2B-store');
  assert.equal(body.status, 'Published');
  assert.equal(body.public, false);
  assert.equal(body.id, null, 'a create body must not carry an id');
});

test('buildGoalNode overlays the spec onto the live prototype rather than writing a literal', () => {
  const goals = blockOf(template().dynamicExpression, BLOCK.goals);
  const node = buildGoalNode(spec('MSN_ORDERVALUE'), goals, { currencies: CURRENCIES });
  assert.equal(node.id, 'OrderValueGoal');
  // DERIVED, not transcribed. The target is a separator midpoint computed from the seed orders'
  // money shape, so a literal here would go stale the first time a price or the shipping charge
  // moved — which is the failure mode the fixture set itself was rewritten to remove.
  assert.equal(node.value, spec('MSN_ORDERVALUE').goal.value);
  assert.equal(node.value, separatorTarget(...spec('MSN_ORDERVALUE').separates));
  // The currency INTENT is resolved against the store, never left null: verified live on vcst-qa
  // 2026-08-27 that the server rejects null, "" and an omitted currencyCode alike with HTTP 400
  // "Currency code is required for the order value goal".
  assert.equal(node.currencyCode, CURRENCIES['store-default']);
  // missionType comes from the server prototype — proof the node is derived, not hand-written.
  assert.equal(node.missionType, 'OrderValue');
  assert.deepEqual(node.children, []);
  assert.deepEqual(node.availableChildren, []);
});

test('buildGoalNode refuses a goal type this build does not offer', () => {
  const goals = blockOf(template().dynamicExpression, BLOCK.goals);
  assert.throws(
    () => buildGoalNode({ goal: { type: 'OrderWeightGoal' } }, goals),
    /not offered by this build/,
    'an unsupported goal must fail loudly at build time, not silently seed a mission with no goal',
  );
});

test('buildConditionNode defaults to the neutral condition and honours group targeting', () => {
  const conds = blockOf(template().dynamicExpression, BLOCK.condition);
  assert.equal(buildConditionNode({ condition: undefined }, conds).id, 'AnyUserGroupCondition');
  const grouped = buildConditionNode({ condition: { type: 'UserGroupIsCondition', groups: ['VIP'] } }, conds);
  assert.equal(grouped.id, 'UserGroupIsCondition');
  assert.deepEqual(grouped.groups, ['VIP']);
});

test('buildRewardNode carries a zero amount through instead of falling back to a default', () => {
  const rewards = blockOf(template().dynamicExpression, BLOCK.reward);
  assert.equal(buildRewardNode({ reward: 0 }, rewards).amount, 0, 'a zero reward must survive — it IS the MSN_ZEROREWARD fixture');
  assert.equal(buildRewardNode({ reward: 500 }, rewards).amount, 500);
});

/* ── Windows ────────────────────────────────────────────────────────────────── */

test('windowDates puts an active window around now', () => {
  const { startDate, endDate } = windowDates('active', NOW);
  assert.ok(Date.parse(startDate) < NOW.getTime(), 'start must already have passed');
  assert.ok(Date.parse(endDate) > NOW.getTime(), 'end must still be ahead');
});

test('windowDates refuses an unknown intent instead of silently producing null dates', () => {
  assert.throws(() => windowDates('whenever', NOW), /unknown window intent/);
});

test('windowIsOpen distinguishes expired and not-yet-started from open', () => {
  const iso = (d) => new Date(NOW.getTime() + d * 86400000).toISOString();
  assert.equal(windowIsOpen({ startDate: iso(-1), endDate: iso(1) }, NOW), true);
  assert.equal(windowIsOpen({ startDate: iso(-30), endDate: iso(-1) }, NOW), false, 'an expired fixture must not read as healthy');
  assert.equal(windowIsOpen({ startDate: iso(1), endDate: iso(30) }, NOW), false);
  assert.equal(windowIsOpen({ startDate: null, endDate: null }, NOW), true, 'an unbounded window is open');
});

/* ── Banners ─────────────────────────────────────────────────────────────────
 * The storefront card (VCST-5346) renders `bannerUrl` at 150px, full width, object-fit: cover. An
 * empty or unreachable one renders a blank card, which is indistinguishable from a broken one — so
 * the failure mode here is invisible rather than loud, and these tests pin the four things that keep
 * it visible: every mission resolves a banner, the artwork matches the goal type, the URL is runtime
 * (never authored), and the file name is FIXED so the URL cannot churn.
 */

test('every mission resolves a banner, and it matches its goal type', () => {
  const byGoal = { OrderValueGoal: 'order-value', OrderCountGoal: 'order-count', PerSkuGoal: 'per-sku' };
  for (const m of MISSIONS) {
    assert.equal(bannerKeyFor(m), byGoal[m.goal.type], `${m.aliasName} carries the wrong artwork for a ${m.goal.type}`);
  }
});

test('bannerKeyFor refuses an unknown goal instead of defaulting to the money artwork', () => {
  assert.throws(() => bannerKeyFor({ aliasName: 'X', goal: { type: 'OrderWeightGoal' } }), /no banner declared/);
});

test('the three banners are three distinct files, one per goal type', () => {
  const files = Object.values(BANNERS).map((b) => b.file);
  assert.equal(new Set(files).size, 3, 'two mission types sharing artwork stop being distinguishable at a glance');
  assert.deepEqual(Object.values(BANNERS).flatMap((b) => b.goals).sort(), ['OrderCountGoal', 'OrderValueGoal', 'PerSkuGoal']);
});

test('banner file names are FIXED, not generated', () => {
  // The asset URL derives from the file name and bannerUrl is part of missionSignature: a timestamped
  // name would change the URL every run, and every mission would be deleted and recreated forever.
  for (const [key, b] of Object.entries(BANNERS)) {
    assert.match(b.file, /^msn-banner-[a-z-]+\.(svg|png|jpe?g|gif|webp)$/, `${key} has a non-fixed file name`);
    assert.equal(bannerSourceRel(key), `test-data/uploads/${b.file}`);
    assert.equal(bannerAssetRel(key), `${BANNER_FOLDER}/${b.file}`);
  }
});

test('buildMissionBody carries the RESOLVED banner url, never an authored one', () => {
  const body = buildMissionBody(spec('MSN_ORDERCOUNT'), {
    template: template(), storeId: 'S', now: NOW, ...RESOLVED,
  });
  assert.equal(body.bannerUrl, BANNER_URLS['order-count']);
  assert.ok(/^https?:\/\//.test(body.bannerUrl), 'the platform hands back an absolute, host-bearing URL');
});

test('buildMissionBody refuses to create a mission whose banner did not resolve', () => {
  // A Published mission is immutable, so a missing banner at create time can never be added later —
  // failing loudly here is the only moment the mistake is cheap.
  assert.throws(
    () => buildMissionBody(spec('MSN_ORDERCOUNT'), { template: template(), storeId: 'S', now: NOW, currencies: CURRENCIES, locales: LOCALES, bannerUrls: {} }),
    /banner "order-count" did not resolve/,
  );
  assert.throws(() => resolveBannerUrl(spec('MSN_PERSKU_ALL'), { 'order-value': 'x' }), /banner "per-sku" did not resolve/);
});

test('the banner url is part of the signature, so a moved asset is detected as drift', () => {
  const a = buildMissionBody(spec('MSN_ORDERCOUNT'), { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
  const b = buildMissionBody(spec('MSN_ORDERCOUNT'), {
    template: template(), storeId: 'S', now: NOW, ...RESOLVED,
    bannerUrls: { ...BANNER_URLS, 'order-count': 'https://example.test/other.svg' },
  });
  assert.ok(!signaturesMatch(missionSignature(a), missionSignature(b)));
});

test('the same banner url produces the same signature, so a re-seed reuses the mission', () => {
  const a = buildMissionBody(spec('MSN_PERSKU_ANY'), { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
  const b = buildMissionBody(spec('MSN_PERSKU_ANY'), {
    template: template(), storeId: 'S', now: new Date(NOW.getTime() + 9 * 86400000), ...RESOLVED,
  });
  assert.ok(signaturesMatch(missionSignature(a), missionSignature(b)));
});

test('the banner url is declared RUNTIME, and the artwork key is not', () => {
  assert.ok(RUNTIME_FIELDS_BY_KIND.mission.includes('banner_url'), 'an absolute asset URL is per-env, exactly like a GUID');
  assert.ok(!RUNTIME_FIELDS_BY_KIND.mission.includes('banner_key'), 'which artwork a mission carries is authored and env-invariant');
});

test('guard catches a literal bannerUrl being authored back into a spec', () => {
  withMutation(spec('MSN_LOCALIZED'), 'bannerUrl', '/assets/agent-test/whatever.png', () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /MSN_LOCALIZED.*bannerUrl/.test(x)), `expected a literal-bannerUrl problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches a banner losing its goal type, or a goal type losing its banner', () => {
  withMutation(BANNERS['per-sku'], 'goals', [], () => {
    assert.ok(validateSpecShape().some((x) => /PerSkuGoal|per-sku/.test(x)));
  });
  withMutation(BANNERS['order-value'], 'file', 'msn-banner-order-count.svg', () => {
    assert.ok(validateSpecShape().some((x) => /share one image file/.test(x)));
  });
});

test('guard catches a generated banner file name', () => {
  withMutation(BANNERS['order-count'], 'file', 'msn-banner-order-count-20260827.svg', () => {
    assert.ok(validateSpecShape().some((x) => /generated-looking file name/.test(x)));
  });
});

/* ── MSN_EXPIRED: the one fixture that is SUPPOSED to be outside its window ───
 * Its whole value is a closed window on an otherwise ordinary mission. Every edit that destroys it —
 * moving it back onto `active`, demoting it to Draft, making it private, zeroing its reward — leaves a
 * fixture that still seeds and still resolves, and turns MSN-008 into an assertion about an absence
 * that has a second, unrelated explanation. So each of those is perturbed here.
 */

test('windowDates puts the expired window ENTIRELY in the past', () => {
  const { startDate, endDate } = windowDates('expired', NOW);
  assert.ok(Date.parse(startDate) < NOW.getTime(), 'start must already have passed');
  assert.ok(Date.parse(endDate) < NOW.getTime(), 'end must ALSO have passed — that is the whole fixture');
  assert.equal(windowIsOpen({ startDate, endDate }, NOW), false);
});

test('the expired window stays expired as the fixture ages', () => {
  // Offsets, not literals: a committed date is expired only until someone refreshes it, and a window
  // seeded near "now" could read as open under clock skew.
  const { startDate, endDate } = windowDates('expired', NOW);
  const later = new Date(NOW.getTime() + 400 * 86400000);
  assert.equal(windowIsOpen({ startDate, endDate }, later), false);
  assert.ok(NOW.getTime() - Date.parse(endDate) > 7 * 86400000, 'the expiry must clear "now" by more than a rounding error');
});

test('windowExpectsOpen states the INTENT, so a closed window is not read as drift', () => {
  assert.equal(windowExpectsOpen('active'), true);
  assert.equal(windowExpectsOpen('expired'), false);
  assert.throws(() => windowExpectsOpen('whenever'), /unknown window intent/);
});

test('the seeder reuses the expired fixture instead of recreating it every run', () => {
  // This mirrors the seeder's own reuse predicate. With a plain `!windowIsOpen` check MSN_EXPIRED is
  // recreated on EVERY seed, churning the GUID that @td(MSN_EXPIRED.id) resolves to.
  const recreate = (m, at) => {
    const body = buildMissionBody(m, { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
    return windowIsOpen(body, at) !== windowExpectsOpen(m.window);
  };
  const soon = new Date(NOW.getTime() + 30 * 86400000);
  assert.equal(recreate(spec('MSN_EXPIRED'), soon), false, 'a closed window IS the expired fixture working');
  assert.equal(recreate(spec('MSN_ORDERCOUNT'), soon), false, 'an active fixture inside its window is reused');
  // ...and the check still catches a genuinely stale active fixture.
  const wayLater = new Date(NOW.getTime() + 400 * 86400000);
  assert.equal(recreate(spec('MSN_ORDERCOUNT'), wayLater), true, 'an active fixture that has expired must be rebuilt');
});

test('MSN_EXPIRED is the ONLY fixture outside its window', () => {
  const closed = MISSIONS.filter((m) => !windowExpectsOpen(m.window));
  assert.deepEqual(closed.map((m) => m.aliasName), ['MSN_EXPIRED']);
});

test('MSN_EXPIRED is otherwise ordinary, so only the window can explain its absence', () => {
  const m = spec('MSN_EXPIRED');
  assert.equal(m.status, 'Published');
  assert.equal(m.public, true);
  assert.ok(m.reward > 0, 'a zero reward would give the mission a second reason to be filtered out');
});

test('guard catches MSN_EXPIRED being moved back onto an open window', () => {
  withMutation(spec('MSN_EXPIRED'), 'window', 'active', () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /MSN_EXPIRED/.test(x)), `expected an MSN_EXPIRED problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches MSN_EXPIRED being demoted to Draft or made private', () => {
  withMutation(spec('MSN_EXPIRED'), 'status', 'Draft', () => {
    assert.ok(validateSpecShape().some((x) => /MSN_EXPIRED/.test(x)));
  });
  withMutation(spec('MSN_EXPIRED'), 'public', false, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_EXPIRED/.test(x)));
  });
});

test('guard catches MSN_EXPIRED losing its payable reward', () => {
  withMutation(spec('MSN_EXPIRED'), 'reward', 0, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_EXPIRED/.test(x)));
  });
});

test('guard catches an ACTIVE fixture being parked on the expired window', () => {
  // The reverse failure: a completion fixture that silently sits outside its window turns every
  // completion case into a false negative that reads as a product bug.
  withMutation(spec('MSN_ORDERCOUNT'), 'window', 'expired', () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /MSN_ORDERCOUNT/.test(x)), `expected an MSN_ORDERCOUNT problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches the expired window being quietly reopened', () => {
  withMutation(WINDOWS.expired, 'endOffsetDays', 90, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_EXPIRED/.test(x)));
  });
  withMutation(WINDOWS.expired, 'expectOpen', true, () => {
    assert.ok(validateSpecShape().some((x) => /MSN_EXPIRED|expectOpen/.test(x)));
  });
});

test('guard catches a window intent that never says whether it is meant to be open', () => {
  withMutation(WINDOWS.active, 'expectOpen', undefined, () => {
    assert.ok(validateSpecShape().some((x) => /expectOpen/.test(x)));
  });
});

/* ── Signature / drift detection ────────────────────────────────────────────── */

test('a signature ignores dates, so a re-seed does not recreate everything forever', () => {
  const m = spec('MSN_ORDERCOUNT');
  const a = buildMissionBody(m, { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
  const b = buildMissionBody(m, { template: template(), storeId: 'S', now: new Date(NOW.getTime() + 5 * 86400000), ...RESOLVED });
  assert.notEqual(a.startDate, b.startDate, 'the fixture really did move in time');
  assert.ok(signaturesMatch(missionSignature(a), missionSignature(b)), 'yet the signature must call it the same fixture');
});

test('a signature notices every field that defines the fixture', () => {
  const base = buildMissionBody(spec('MSN_ORDERCOUNT'), { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
  const sig = missionSignature(base);

  const perturbations = {
    status: (b) => { b.status = 'Draft'; },
    public: (b) => { b.public = false; },
    storeId: (b) => { b.storeId = 'other-store'; },
    name: (b) => { b.name = 'AGENT-TEST-MSN-SOMETHING-ELSE'; },
    reward: (b) => { blockOf(b.dynamicExpression, BLOCK.reward).children[0].amount = 999; },
    goalCount: (b) => { blockOf(b.dynamicExpression, BLOCK.goals).children[0].count = 7; },
    condition: (b) => { blockOf(b.dynamicExpression, BLOCK.condition).children[0] = { id: 'UserGroupIsCondition', groups: ['VIP'] }; },
  };
  for (const [label, mutate] of Object.entries(perturbations)) {
    const c = clone(base);
    mutate(c);
    assert.equal(signaturesMatch(missionSignature(c), sig), false, `signature failed to notice a change to ${label}`);
  }
});

test('a signature reads a live record and a spec-built body identically', () => {
  // The seeder compares a body it built against a record it fetched. If those two ever produced
  // different signatures for the same fixture, every seed would delete and recreate the whole set.
  const body = buildMissionBody(spec('MSN_PERSKU_ALL'), { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
  const asFetched = { ...clone(body), id: 'server-assigned-guid', createdBy: 'admin', modifiedDate: '2026-08-27T00:00:00Z' };
  assert.ok(signaturesMatch(missionSignature(body), missionSignature(asFetched)));
});

test('a signature separates the PerSku pair', () => {
  const t = template();
  const all = missionSignature(buildMissionBody(spec('MSN_PERSKU_ALL'), { template: t, storeId: 'S', now: NOW, ...RESOLVED }));
  const any = missionSignature(buildMissionBody(spec('MSN_PERSKU_ANY'), { template: template(), storeId: 'S', now: NOW, ...RESOLVED }));
  assert.equal(all.goalAll, true);
  assert.equal(any.goalAll, false);
  assert.equal(signaturesMatch(all, any), false);
});

test('missionSignature survives a malformed / empty tree without throwing', () => {
  assert.doesNotThrow(() => missionSignature({}));
  assert.doesNotThrow(() => missionSignature({ dynamicExpression: { children: [] } }));
  assert.equal(missionSignature({}).goal, null);
});

/* ── PerSku goal items ──────────────────────────────────────────────────────── */

test('only PerSku missions need separate goal items', () => {
  assert.equal(needsGoalItems(spec('MSN_PERSKU_ALL')), true);
  assert.equal(needsGoalItems(spec('MSN_PERSKU_ANY')), true);
  assert.equal(needsGoalItems(spec('MSN_ORDERCOUNT')), false);
  assert.equal(needsGoalItems(spec('MSN_ORDERVALUE')), false);
});

test('buildGoalItems produces one row per slot, keyed to the mission', () => {
  const products = { A: { id: 'prod-a' }, B: { id: 'prod-b' } };
  const m = spec('MSN_PERSKU_ALL');
  const rows = buildGoalItems(m, 'mission-1', products);
  assert.equal(rows.length, PERSKU_PRODUCTS.length);
  assert.deepEqual(rows.map((r) => r.missionId), rows.map(() => 'mission-1'));
  assert.deepEqual(rows.map((r) => r.productId).sort(), ['prod-a', 'prod-b']);
  // Read from the mission's OWN resolved quantities, not from the product defaults: the ALL/ANY pair
  // overrides them so the two halves can diverge, and asserting the defaults here would pin the
  // fixture back to the state in which ALL and ANY agreed on every observable.
  const q = goalItemQuantities(m);
  assert.deepEqual(rows.map((r) => r.quantity), goalSlotsFor(m).map((s) => q[s]));
});

test('buildGoalItems refuses to build a PerSku mission with an unresolved product', () => {
  // The failure this prevents: a PerSku mission with zero (or partial) targets is structurally valid,
  // permanently uncompletable, and passes every "does the mission exist" check.
  assert.throws(() => buildGoalItems(spec('MSN_PERSKU_ALL'), 'm1', { A: { id: 'a' } }), /slot B has no resolved product/);
  assert.throws(() => buildGoalItems(spec('MSN_PERSKU_ALL'), 'm1', {}), /no resolved product/);
});

test('buildGoalItems returns nothing for a non-PerSku mission', () => {
  assert.deepEqual(buildGoalItems(spec('MSN_ORDERCOUNT'), 'm1', { A: { id: 'a' }, B: { id: 'b' } }), []);
});

test('reconcileGoalItems creates what is missing', () => {
  const desired = [{ missionId: 'm', productId: 'a', quantity: 2 }, { missionId: 'm', productId: 'b', quantity: 1 }];
  const r = reconcileGoalItems(desired, []);
  assert.equal(r.create.length, 2);
  assert.equal(r.update.length, 0);
  assert.equal(r.remove.length, 0);
});

test('reconcileGoalItems is a no-op when the live set already matches', () => {
  // This is what keeps a re-seed off the (MissionId, ProductId) unique index, whose violation
  // surfaces as a raw HTTP 500 SQL error rather than a 409.
  const desired = [{ missionId: 'm', productId: 'a', quantity: 2 }];
  const existing = [{ id: 'gi1', missionId: 'm', productId: 'a', quantity: 2 }];
  const r = reconcileGoalItems(desired, existing);
  assert.deepEqual([r.create.length, r.update.length, r.remove.length], [0, 0, 0]);
});

test('reconcileGoalItems updates a drifted quantity in place, keeping the row id', () => {
  const desired = [{ missionId: 'm', productId: 'a', quantity: 5 }];
  const existing = [{ id: 'gi1', missionId: 'm', productId: 'a', quantity: 2 }];
  const r = reconcileGoalItems(desired, existing);
  assert.equal(r.create.length, 0);
  assert.equal(r.remove.length, 0);
  assert.deepEqual(r.update, [{ id: 'gi1', missionId: 'm', productId: 'a', quantity: 5 }]);
});

test('reconcileGoalItems removes a target that is no longer wanted', () => {
  const desired = [{ missionId: 'm', productId: 'a', quantity: 2 }];
  const existing = [
    { id: 'gi1', missionId: 'm', productId: 'a', quantity: 2 },
    { id: 'gi2', missionId: 'm', productId: 'stale', quantity: 9 },
  ];
  const r = reconcileGoalItems(desired, existing);
  assert.deepEqual(r.remove.map((x) => x.id), ['gi2']);
});

test('reconcileGoalItems compares quantity numerically, not by identity', () => {
  // The API returns quantity as a number, but a fixture edited through a CSV-shaped path could hand
  // over a string. Treating "2" as different from 2 would rewrite every row on every seed.
  const r = reconcileGoalItems([{ productId: 'a', quantity: 2 }], [{ id: 'gi1', productId: 'a', quantity: '2' }]);
  assert.equal(r.update.length, 0);
});

test('reconcileGoalItems tolerates null inputs', () => {
  const r = reconcileGoalItems(null, null);
  assert.deepEqual([r.create.length, r.update.length, r.remove.length], [0, 0, 0]);
});

/* ── Recorded API facts ─────────────────────────────────────────────────────── */

test('the store-settings fixture names the real setting and its independence verdict', () => {
  assert.equal(STORE_SETTING.missionsSetting, 'Loyalty.Missions.Enable');
  assert.equal(STORE_SETTING.missionsGroup, 'Loyalty|Missions');
  assert.equal(STORE_SETTING.baseSetting, 'Loyalty.Enable');
  assert.equal(STORE_SETTING.platformDefault, false, 'the feature is OFF unless a store opts in');
  assert.equal(STORE_SETTING.gatingVerdict, 'independent');
});

test('targeting is group-only — no customer-id condition exists in this module', () => {
  // Recorded so a test author reads the real surface instead of assuming a CustomerIds field. Verified
  // both live (GET /new offers only these two) and in source (LoyaltyMissionConditionAndRewardTreePrototype).
  assert.equal(TARGETING.customerIdCondition, null);
  assert.equal(TARGETING.groupCondition.id, 'UserGroupIsCondition');
  assert.equal(TARGETING.groupCondition.field, 'groups');
  assert.equal(TARGETING.neutralCondition.id, 'AnyUserGroupCondition');
});

test('the immutability rule is recorded as the single allowed transition', () => {
  assert.deepEqual(ALLOWED_TRANSITION, { from: 'Published', to: 'Archived' });
  assert.deepEqual(STATUSES, ['Draft', 'Published', 'Archived']);
});

test('runtime fields are declared per alias kind, and none of them is that kind\'s business key', () => {
  const { mission, perSkuProduct, storeSetting } = RUNTIME_FIELDS_BY_KIND;

  // A mission's id is server-assigned; its NAME is the business key the seeder looks it up by.
  // banner_url joins it for the same reason: the platform hands back an absolute, host-bearing URL.
  // `accrued_*`/`progress_*_at_seed` join them: they are what the platform REPORTED after the seed
  // orders landed, which is the observation the OrderValue falsifiability guard reads back.
  assert.deepEqual(mission, ['id', 'banner_url', 'accrued_value_at_seed', 'progress_status_at_seed', 'progress_percent_at_seed']);
  assert.ok(!mission.includes('banner_key'), 'WHICH artwork a mission carries is authored and env-invariant');
  assert.ok(!mission.includes('goal_target'), 'a goal target is derived from the committed spec, never observed');
  assert.ok(!mission.includes('name'), 'a mission name is authored, not runtime');
  for (const f of ['status', 'reward', 'public']) {
    assert.ok(!mission.includes(f), `${f} is authored, not runtime`);
  }

  // A PerSku target is merely FOUND on the env, so nothing about it is invariant — its name and SKU
  // are runtime too. This is the exact asymmetry a single flattened list destroys: `name` means
  // opposite things on these two kinds.
  for (const f of ['productId', 'sku', 'name', 'catalogId']) {
    assert.ok(perSkuProduct.includes(f), `${f} must be runtime on a discovered product`);
  }
  assert.ok(!perSkuProduct.includes('quantity'), 'the target quantity is authored by the fixture, not discovered');

  // The PerSku TARGETS no longer use that kind: they are created now, so their sku/name are authored
  // business keys. What IS runtime on them is the currency the pricelist actually resolved to — the
  // field the mixed-currency guard reads back, and the one whose absence let a EUR row into a modal
  // that sums its rows.
  const { createdProduct, foundProduct } = RUNTIME_FIELDS_BY_KIND;
  assert.ok(createdProduct.includes('currency'), 'the resolved price currency is per-env and must be observed');
  for (const f of ['sku', 'name']) {
    assert.ok(!createdProduct.includes(f), `${f} is an authored business key on a product this seeder creates`);
  }
  assert.ok(foundProduct.includes('sku'), 'a product found through another fixture\'s alias does not own its SKU');

  // The gate's setting NAME is invariant; only the observed values and the store are per-env.
  assert.ok(!storeSetting.includes('setting_name'), 'the setting name is the same on every env');
  for (const f of ['store_id', 'missions_enabled', 'base_loyalty_enabled']) {
    assert.ok(storeSetting.includes(f), `${f} is per-env`);
  }
});

test('window intents are declared, not inlined as literal dates', () => {
  // A committed literal date expires silently: the fixture still exists, still resolves, and every
  // completion case becomes a false negative that reads as a product bug.
  for (const [name, w] of Object.entries(WINDOWS)) {
    assert.equal(typeof w.startOffsetDays, 'number', `${name} start must be an offset`);
    // `null` is the one legal non-number and it means NO END AT ALL (the MSNF-020 open-ended window),
    // which is a declared intent rather than a missing offset. A literal DATE is still refused.
    assert.ok(typeof w.endOffsetDays === 'number' || w.endOffsetDays === null, `${name} end must be an offset or null`);
    if (w.endOffsetDays !== null) assert.ok(w.endOffsetDays > w.startOffsetDays, `${name} must not be inverted`);
  }
});

/* ── C11: localization + banner ──────────────────────────────────────────────
 * These pin the ONE fact that makes the fixture non-vacuous: a LocalizedString has to be posted as
 * { values: { <locale>: <text> } }. The flat dict is accepted with HTTP 201 and no error, and comes
 * back as {"values":{}} — so nothing except an explicit assertion catches it.
 */
test('resolveLocales picks the store default and a stable, distinct alternate', () => {
  assert.equal(LOCALES['store-default'], 'en-US');
  assert.equal(LOCALES['store-alternate'], 'de-DE', 'first non-default in sorted order — stable across re-seeds');
  assert.notEqual(LOCALES['store-default'], LOCALES['store-alternate']);
});

test('resolveLocales refuses a single-language store rather than collapsing both intents', () => {
  assert.throws(
    () => resolveLocales({ defaultLanguage: 'en-US', languages: ['en-US'] }),
    /only one language/,
    'two translations in the same language demonstrate nothing',
  );
});

test('localizedString wraps in the values envelope the API actually persists', () => {
  assert.deepEqual(localizedString({ 'en-US': 'a' }), { values: { 'en-US': 'a' } });
  assert.notDeepEqual(localizedString({ 'en-US': 'a' }), { 'en-US': 'a' },
    'a flat dict is silently dropped by the server (201 + {"values":{}}), so it must never be produced');
});

test('buildLocalizedFields resolves intents to real store locales in the values envelope', () => {
  const m = spec('MSN_LOCALIZED');
  const f = buildLocalizedFields(m, LOCALES);
  assert.deepEqual(Object.keys(f).sort(), ['description', 'localizedName']);
  assert.deepEqual(Object.keys(f.localizedName.values).sort(), ['de-DE', 'en-US']);
  assert.equal(f.localizedName.values['en-US'], m.l10n.name['store-default']);
  assert.equal(f.localizedName.values['de-DE'], m.l10n.name['store-alternate']);
  assert.equal(f.description.values['de-DE'], m.l10n.description['store-alternate']);
});

test('buildLocalizedFields throws on an unresolved intent instead of dropping that locale', () => {
  assert.throws(
    () => buildLocalizedFields(spec('MSN_LOCALIZED'), { 'store-default': 'en-US' }),
    /did not resolve/,
    'a half-localized fixture is indistinguishable from the bug a C11 case hunts',
  );
});

test('buildLocalizedFields is a no-op for a spec with no translations', () => {
  assert.deepEqual(buildLocalizedFields(spec('MSN_ORDERCOUNT'), LOCALES), {});
});

test('buildMissionBody carries the localized fields and banner through', () => {
  const m = spec('MSN_LOCALIZED');
  const body = buildMissionBody(m, { template: template(), storeId: 'B2B-store', now: NOW, ...RESOLVED });
  assert.equal(body.name, 'AGENT-TEST-MSN-LOCALIZED', 'the business key stays ASCII — the seeder looks missions up by it');
  assert.equal(body.bannerUrl, BANNER_URLS[bannerKeyFor(m)], 'the banner is resolved from the upload, not authored on the spec');
  assert.equal(body.localizedName.values['de-DE'], m.l10n.name['store-alternate']);
  assert.equal(body.description.values['en-US'], m.l10n.description['store-default']);
});

test('missionSignature includes the translations and banner, so an edited string is drift', () => {
  const m = spec('MSN_LOCALIZED');
  const base = buildMissionBody(m, { template: template(), storeId: 'B2B-store', now: NOW, ...RESOLVED });
  const edited = { ...base, localizedName: { values: { ...base.localizedName.values, 'de-DE': 'Etwas anderes' } } };
  assert.ok(!signaturesMatch(missionSignature(base), missionSignature(edited)),
    'without this the live mission keeps the old translation forever while the spec says otherwise');
  const rebanner = { ...base, bannerUrl: '/assets/other.png' };
  assert.ok(!signaturesMatch(missionSignature(base), missionSignature(rebanner)));
});

test('missionSignature is order-insensitive across locales', () => {
  const a = { localizedName: { values: { 'en-US': 'x', 'de-DE': 'y' } } };
  const b = { localizedName: { values: { 'de-DE': 'y', 'en-US': 'x' } } };
  assert.deepEqual(missionSignature(a).localizedName, missionSignature(b).localizedName,
    'key order must never read as drift, or every re-seed recreates the fixture');
});

test('localizedValues tolerates the null a non-localized record carries', () => {
  assert.deepEqual(localizedValues(null), {});
  assert.deepEqual(localizedValues(undefined), {});
  assert.deepEqual(localizedValues({ values: { 'en-US': 'a' } }), { 'en-US': 'a' });
});

test('the guard catches every way MSN_LOCALIZED can go vacuous', () => {
  const m = spec('MSN_LOCALIZED');
  const orig = { l10n: m.l10n };
  // Restoring has to DELETE a key the perturbation added (the spec carries no bannerUrl of its own any
  // more), not just overwrite the ones it had — otherwise the leftover leaks into the next assertion.
  const perturb = (patch) => {
    Object.assign(m, patch);
    const p = validateSpecShape();
    for (const k of Object.keys(patch)) if (!(k in orig)) delete m[k];
    Object.assign(m, orig);
    return p;
  };

  assert.ok(perturb({ l10n: { name: { 'store-default': 'only one' }, description: { 'store-default': 'only one' } } })
    .some((p) => /at least 2/.test(p)), 'one locale cannot demonstrate localization');

  assert.ok(perturb({ l10n: { ...m.l10n, name: { 'en-US': 'literal', 'de-DE': 'literal2' } } })
    .some((p) => /not one of store-default/.test(p)), 'a literal locale code is per-env config');

  assert.ok(perturb({ l10n: { name: m.l10n.name, description: { 'store-default': 'a', 'store-alternate': 'a' } } })
    .some((p) => /repeats the SAME text/.test(p)), 'identical text hides a fallback');

  assert.ok(perturb({ l10n: { name: m.l10n.name, description: { 'store-default': 'a', 'store-alternate': '  ' } } })
    .some((p) => /empty translation/.test(p)));

  // The banner is no longer authored on the spec at all — the guard's job there is to REFUSE one, so
  // that the per-env asset URL cannot be committed back into the source of truth.
  assert.ok(perturb({ bannerUrl: 'https://cdn.example.com/b.png' }).some((p) => /literal bannerUrl/.test(p)));

  assert.deepEqual(validateSpecShape().filter((p) => /MSN_LOCALIZED/.test(p)), [], 'and the committed spec is clean');
});

test('MSN_LOCALIZED is the only fixture with a translated NAME or multi-locale text — but NOT the only one with a banner', () => {
  // Exclusivity was narrowed for MSNF-045: `description` is a LocalizedString, so a mission that
  // merely wants a DESCRIPTION has no other way to declare one, and the blanket ban left every
  // describable mission an OrderCount mission — which is why the SKU-modal half of the description
  // assertion could never run. What C11 needs is narrower: one translated NAME, one multi-locale text.
  const withName = MISSIONS.filter((m) => m.l10n?.name).map((m) => m.aliasName);
  assert.deepEqual(withName, ['MSN_LOCALIZED'], 'two translated names make the C11 assertions ambiguous');
  const multiLocale = MISSIONS.filter((m) => Object.values(m.l10n || {}).some((f) => Object.keys(f).length >= MIN_LOCALES)).map((m) => m.aliasName);
  assert.deepEqual(multiLocale, ['MSN_LOCALIZED'], 'multi-locale text belongs to MSN_LOCALIZED alone');
  // Exclusivity used to cover the banner too. It must not any more: every mission carries one, so the
  // C11 banner assertion is "MSN_LOCALIZED's banner serves like everyone else's", not "only it has one".
  for (const m of MISSIONS) assert.ok(bannerKeyFor(m), `${m.aliasName} has no banner`);
});

/* ── VCST-5346 storefront progress states ────────────────────────────────────
 * The three fixtures below exist to make a COLOUR, a PARTIAL BAR and a COMPLETED CHIP reachable. Each
 * of them dies quietly: a target nudged by one turns the partial fixture into a completed one, an
 * `endOffsetDays` nudged upward turns the danger badge into the default warning, and in both cases the
 * seed still succeeds and every "does the fixture exist?" check still passes. So these tests perturb
 * the numbers and assert `validateSpecShape` NOTICES — the same discipline as the block above.
 */

test('predictProgress mirrors the module arithmetic the fixtures are designed against', () => {
  // PerSkuAll clamps EACH row before summing, so over-buying one SKU cannot cover another.
  const partial = predictProgress(spec('MSN_PROGRESS_PARTIAL'));
  assert.deepEqual(
    { current: partial.currentValue, target: partial.targetValue, pct: partial.percentage, status: partial.status },
    { current: 3, target: 5, pct: 60, status: 'InProgress' },
    'A x2 against target 2 plus B x1 against target 3 is min(2,2)+min(1,3)=3 of 5',
  );
  assert.equal(partial.rowsMet, 1);
  assert.equal(partial.rowsUnmet, 1);

  // The ALL/ANY pair is the minimal-difference control: SAME targets, SAME data, one flag. It must
  // diverge on BOTH observables, because the module computes an ANY percentage as a binary 0-or-100
  // and an ALL percentage as a clamped per-row sum. Before the falsifiability rewrite both inherited
  // the product defaults, so both sat at Completed 100% and an implementation ignoring `all` entirely
  // would have passed.
  const all = predictProgress(spec('MSN_PERSKU_ALL'));
  const any = predictProgress(spec('MSN_PERSKU_ANY'));
  assert.deepEqual(goalItemQuantities(spec('MSN_PERSKU_ALL')), goalItemQuantities(spec('MSN_PERSKU_ANY')));
  assert.equal(all.status, 'InProgress');
  assert.equal(any.status, 'Completed');
  assert.notEqual(all.percentage, any.percentage);

  const done = predictProgress(spec('MSN_PROGRESS_COMPLETED'));
  assert.deepEqual(
    { current: done.currentValue, target: done.targetValue, pct: done.percentage, status: done.status },
    { current: 2, target: 2, pct: 100, status: 'Completed' },
    'over-buying is clamped: min(2,1)+min(1,1)=2 of 2, not 3 of 2',
  );

  // OrderCount contributes exactly one per order, and the module guards the division. Derived from
  // PROGRESS_ORDER_COUNT rather than transcribed: the seed places two orders now (a cash one and an
  // all-points one), and a literal here would silently pin the test to the one-order world.
  assert.equal(
    predictProgress(spec('MSN_ENDING_SOON')).percentage,
    (PROGRESS_ORDER_COUNT / spec('MSN_ENDING_SOON').goal.count) * 100,
  );
  assert.equal(predictProgress(spec('MSN_ZEROTARGET')).percentage, 0, 'a zero target must not divide by zero or read as complete');
  assert.equal(predictProgress(spec('MSN_ZEROTARGET')).status, 'InProgress');

  // An OrderValueGoal's contribution is the SERVER-RECOMPUTED order total, so `predictProgress`
  // still returns null — a fixture may not declare a percentage nothing can derive. What CAN be
  // derived is the set of candidate readings and what each one would predict, which is what
  // `predictOrderValueByReading` is for; the seeder records which one the platform actually used.
  assert.equal(predictProgress(spec('MSN_ORDERVALUE')), null);
  assert.ok(predictOrderValueByReading(spec('MSN_ORDERVALUE')), 'the money axis is predicted per reading instead');
});

test('PerSkuAny has no partial state at all, which is why the partial fixture must be PerSkuAll', () => {
  const p = predictProgress(spec('MSN_PERSKU_ANY'));
  assert.ok(p.percentage === 0 || p.percentage === 100, `PerSkuAny percentage is binary, got ${p.percentage}`);
});

test('the three progress fixtures cover three DISTINCT storefront states', () => {
  // Scoped to the fixtures whose ROLE is the storefront card. The semantics fixtures (the ALL/ANY
  // pair, the two currency-blindness discriminators) legitimately share a rendered state with one of
  // them — what they discriminate is which figure or which flag produced the card, not how it looks —
  // and forcing an artificial difference on them would destroy the minimal-difference pairing that
  // makes them attributable in the first place.
  const storefront = progressFixtures().filter((m) => m.stateRole === 'storefront');
  assert.ok(storefront.length >= 3, 'a fixture untagged by role would be exempt from this rule by accident');
  const states = storefront.map((m) => `${m.progress.status}:${m.progress.percentage}`);
  assert.equal(new Set(states).size, states.length, 'a collapsed pair silently drops a state from coverage');
  assert.ok(progressFixtures().some((m) => predictProgress(m).status === 'Completed' && m.goal.type === 'PerSkuGoal'),
    'the read-only-modal branch only exists on the SKU modal, so the completed fixture must be PerSku');
});

test('a declared progress state that the seed order does not produce is caught', () => {
  const m = spec('MSN_PROGRESS_PARTIAL');
  const orig = { progress: m.progress, goalItemQuantities: m.goalItemQuantities };
  const perturb = (patch) => {
    Object.assign(m, patch);
    const p = validateSpecShape();
    Object.assign(m, orig);
    return p;
  };

  // The declaration drifting from the fixture — the failure the re-derivation exists to make impossible.
  assert.ok(perturb({ progress: { ...orig.progress, percentage: 50 } })
    .some((p) => /declares percentage 50 but the seed order yields 60/.test(p)));
  assert.ok(perturb({ progress: { ...orig.progress, status: 'Completed' } })
    .some((p) => /declares status "Completed" but the seed order yields "InProgress"/.test(p)));

  // Equalising the two targets at or below what the orders buy makes the "partial" fixture complete.
  assert.ok(perturb({ goalItemQuantities: { A: 1, B: 1 } })
    .some((p) => /MSN_PROGRESS_PARTIAL is completed by the seed order/.test(p)));
  // …and pushing both above it makes every row unmet, so the per-row styling has one state again.
  assert.ok(perturb({ goalItemQuantities: { A: 9, B: 9 } })
    .some((p) => /one target-MET row and one target-UNMET row/.test(p)));

  // A zero target is satisfied by 0 >= 0 WITHOUT the SKU being bought — the mirror image of
  // MSN_ZEROTARGET's guarded division, and it silently completes the mission on any order at all.
  assert.ok(perturb({ goalItemQuantities: { A: 0, B: 2 } }).some((p) => /must be positive/.test(p)));

  assert.deepEqual(validateSpecShape(), [], 'and the committed spec set is clean');
});

test('the completed fixture cannot quietly stop being completed, or stop being PerSku', () => {
  const m = spec('MSN_PROGRESS_COMPLETED');
  const orig = { progress: m.progress, goalItemQuantities: m.goalItemQuantities, goal: m.goal };
  const perturb = (patch) => {
    Object.assign(m, patch);
    const p = validateSpecShape();
    Object.assign(m, orig);
    return p;
  };
  assert.ok(perturb({ goalItemQuantities: { A: 1, B: 5 }, progress: { status: 'InProgress', percentage: 50, rowsMet: 1, rowsUnmet: 1 } })
    .some((p) => /MSN_PROGRESS_COMPLETED is NOT completed by the seed order/.test(p)));
  assert.ok(perturb({ goal: { type: 'OrderCountGoal', count: 1 }, goalItemQuantities: undefined, progress: { status: 'Completed', percentage: 100 } })
    .some((p) => /must be a PerSku mission/.test(p)));
  assert.deepEqual(validateSpecShape(), []);
});

test('the danger window is bounded on BOTH sides, and the bound is derived, not asserted by eye', () => {
  const w = WINDOWS.endingSoon;
  // daysRemaining = ceil(endDate - now) clamped at 0, and endDate = seedClock + endOffsetDays, so the
  // reachable range is exactly [0, endOffsetDays]. The upper end is what the danger branch is judged on.
  assert.ok(w.endOffsetDays < DANGER_THRESHOLD_DAYS, 'the badge would render warning at its widest');
  assert.ok(w.endOffsetDays <= DANGER_THRESHOLD_DAYS - WINDOW_CLOCK_SLACK_DAYS, 'no clock slack below the boundary');
  assert.ok(w.endOffsetDays >= WINDOW_CLOCK_SLACK_DAYS, 'the window would lapse before the next seed');
  assert.equal(w.expectOpen, true);

  const orig = { ...w };
  const perturb = (patch) => {
    Object.assign(WINDOWS.endingSoon, patch);
    const p = validateSpecShape();
    Object.assign(WINDOWS.endingSoon, orig);
    return p;
  };
  assert.ok(perturb({ endOffsetDays: 180 }).some((p) => /danger branch needs < 10/.test(p)),
    'the shared active window is exactly what made the danger branch unreachable');
  assert.ok(perturb({ endOffsetDays: 9 }).some((p) => /within 2 of the 10-day boundary/.test(p)),
    'one day of margin is inside a timezone reading');
  assert.ok(perturb({ endOffsetDays: 1 }).some((p) => /less than 2 days of life/.test(p)),
    'a window that lapses drops the card off the page entirely');
  assert.deepEqual(validateSpecShape(), []);
});

test('a completable danger fixture is rejected — success overrides the danger badge', () => {
  const m = spec('MSN_ENDING_SOON');
  const orig = { goal: m.goal, progress: m.progress };
  Object.assign(m, { goal: { type: 'OrderCountGoal', count: 1 }, progress: { status: 'Completed', percentage: 100 } });
  const p = validateSpecShape();
  Object.assign(m, orig);
  assert.ok(p.some((x) => /is COMPLETED by the seed order/.test(x)));
  assert.ok(p.some((x) => new RegExp(`is not above the ${PROGRESS_ORDER_COUNT} order the seed places`).test(x)));
  assert.deepEqual(validateSpecShape(), []);
});

test('the provisioning orders are the only lever, so their shape is guarded too', () => {
  assert.equal(progressOrderNumber(), `${NAME_PREFIX}-ORDER`, 'teardown sweeps by the NAME_PREFIX');
  for (const o of PROGRESS_ORDERS) assert.ok(isSeededMissionName(progressOrderNumber(o)));
  // DERIVED from the order list. The seed places two orders — a cash one and an all-points one — and
  // MSN_ORDERCOUNT's target is derived from this same number, so a literal here would let the two
  // drift apart and quietly leave that fixture asking nothing.
  assert.equal(PROGRESS_ORDER_COUNT, PROGRESS_ORDERS.length);
  // Every line must name a declared slot, or buildGoalItems and the order body disagree about products.
  for (const o of PROGRESS_ORDERS) {
    for (const l of o.lines) {
      assert.ok(TARGET_PRODUCTS.some((p) => p.slot === l.slot), `line ${l.slot} has no product slot`);
    }
  }
  const orig = PROGRESS_ORDER.lines.slice();
  PROGRESS_ORDER.lines.splice(0, PROGRESS_ORDER.lines.length, { slot: 'A', quantity: 2 }, { slot: 'A', quantity: 1 });
  const dup = validateSpecShape();
  PROGRESS_ORDER.lines.splice(0, PROGRESS_ORDER.lines.length, ...orig);
  assert.ok(dup.some((p) => /repeat a slot/.test(p)));
  assert.deepEqual(validateSpecShape(), []);
});

test('goalItemQuantities overrides only the slots it names, and buildGoalItems follows', () => {
  // MSN_PERSKU_OOS carries no override for slot A, so it still inherits the product default — the
  // "override only what you name" property, asserted on a fixture that actually relies on it.
  assert.equal(goalItemQuantities(spec('MSN_PERSKU_OOS')).A, 1, 'a named override wins');
  assert.deepEqual(goalItemQuantities(spec('MSN_PERSKU_ALL')), { A: 2, B: 2 }, 'the ALL/ANY pair overrides both slots so it can diverge from ANY');
  assert.deepEqual(goalItemQuantities(spec('MSN_PROGRESS_PARTIAL')), { A: 2, B: 3 });
  const products = { A: { id: 'prod-a' }, B: { id: 'prod-b' } };
  assert.deepEqual(
    buildGoalItems(spec('MSN_PROGRESS_COMPLETED'), 'mission-1', products),
    [{ missionId: 'mission-1', productId: 'prod-a', quantity: 1 }, { missionId: 'mission-1', productId: 'prod-b', quantity: 1 }],
    'the override must reach the goal-item rows, or the mission targets the shared quantities and the state changes',
  );
});

test('the endingSoon window resolves to real dates that are open and close inside the threshold', () => {
  const now = new Date('2026-08-27T12:00:00Z');
  const { startDate, endDate } = windowDates('endingSoon', now);
  assert.ok(Date.parse(startDate) < now.getTime(), 'already started');
  assert.ok(Date.parse(endDate) > now.getTime(), 'not yet closed');
  assert.ok(windowIsOpen({ startDate, endDate }, now));
  assert.equal(windowExpectsOpen('endingSoon'), true);
  const days = Math.ceil((Date.parse(endDate) - now.getTime()) / 86400000);
  assert.ok(days > 0 && days < DANGER_THRESHOLD_DAYS, `daysRemaining would be ${days}`);
});

/* ── MSNF-045: the featured-SKU description ──────────────────────────────────
 * The assertion under test on the storefront is "the description RENDERS in both modal families".
 * Every way the fixture can go vacuous leaves it seeding cleanly, so each is perturbed here.
 */

test('a PerSku fixture carries a description, so the SKU modal half of MSNF-045 has a subject', () => {
  const described = MISSIONS.filter((m) => m.l10n?.description && needsGoalItems(m));
  assert.ok(described.length >= 1, 'no PerSku mission declares a description — the featured-SKU modal is a different template from the order-goal modal');
  assert.ok(described.some((m) => m.aliasName === 'MSN_PERSKU_ALL'), 'MSN_PERSKU_ALL is the declared SKU-side description subject');
});

test('guard catches the SKU description being emptied', () => {
  withMutation(spec('MSN_PERSKU_ALL'), 'l10n', { description: { 'store-default': '   ' } }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /MSN_PERSKU_ALL.*description.*empty/i.test(x)), `expected an empty-description problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches a description that just repeats the mission name (renders, proves nothing)', () => {
  withMutation(spec('MSN_PERSKU_ALL'), 'l10n', { description: { 'store-default': missionName(spec('MSN_PERSKU_ALL')) } }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /repeats the mission/.test(x)), `expected a name-repetition problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches a one-word description, which any non-empty-string template satisfies', () => {
  withMutation(spec('MSN_PERSKU_ALL'), 'l10n', { description: { 'store-default': 'Buy stuff' } }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /chars; a description shorter than/.test(x)), `expected a too-short problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches two fixtures sharing one description text', () => {
  const shared = spec('MSN_LOCALIZED').l10n.description['store-default'];
  withMutation(spec('MSN_PERSKU_ALL'), 'l10n', { description: { 'store-default': shared } }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /identical to/.test(x)), `expected a duplicate-description problem, got ${JSON.stringify(p)}`);
  });
});

test('a second fixture may carry a description but never a translated NAME (C11 stays unambiguous)', () => {
  withMutation(spec('MSN_PERSKU_ALL'), 'l10n', {
    name: { 'store-default': 'AGENT-TEST Second Localized Mission' },
    description: { 'store-default': 'Buy every featured product at its listed quantity to earn points.' },
  }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /carries l10n\.name/.test(x)), `expected a second-translated-name problem, got ${JSON.stringify(p)}`);
  });
});

test('a second fixture may not go multi-locale — that is MSN_LOCALIZED alone', () => {
  withMutation(spec('MSN_PERSKU_ALL'), 'l10n', {
    description: {
      'store-default': 'Buy every featured product at its listed quantity to earn points.',
      'store-alternate': 'Kaufen Sie jedes vorgestellte Produkt in der angegebenen Menge.',
    },
  }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /multi-locale text belongs to MSN_LOCALIZED alone/.test(x)), `expected a multi-locale problem, got ${JSON.stringify(p)}`);
  });
});

test('the description reaches the API body as a LocalizedString, not a flat dict', () => {
  const body = buildMissionBody(spec('MSN_PERSKU_ALL'), { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
  const values = localizedValues(body.description);
  const locale = RESOLVED.locales['store-default'];
  assert.equal(values[locale], spec('MSN_PERSKU_ALL').l10n.description['store-default']);
  // A flat {locale:text} dict is accepted with 201 and silently persisted as {"values":{}}.
  assert.ok(body.description && typeof body.description === 'object' && !(locale in body.description),
    'the description must be wrapped, not posted flat — a flat dict persists as an empty LocalizedString with no error');
});

test('only the locale intents a fixture actually uses become overlay fields', () => {
  assert.deepEqual(localeIntentsUsed(spec('MSN_PERSKU_ALL')), ['store-default']);
  assert.deepEqual(localeIntentsUsed(spec('MSN_PERSKU_ALL')).map(localeFieldFor), ['locale_default']);
  assert.deepEqual(localeIntentsUsed(spec('MSN_LOCALIZED')).map(localeFieldFor).sort(), ['locale_alternate', 'locale_default']);
  assert.deepEqual(localeIntentsUsed(spec('MSN_ORDERCOUNT')), [], 'a fixture with no l10n gets no locale fields at all');
});

/* ── MSNF-020: the open-ended (null endDate) fixture ─────────────────────── */

test('exactly one fixture has no end date, and every other one has a finite number', () => {
  const openEnded = MISSIONS.filter((m) => WINDOWS[m.window].endOffsetDays === null);
  assert.equal(openEnded.length, 1, 'a null daysRemaining needs exactly one unambiguous subject');
  assert.equal(openEnded[0].aliasName, 'MSN_OPEN_ENDED');
  const finite = MISSIONS.filter((m) => Number.isFinite(WINDOWS[m.window].endOffsetDays));
  assert.ok(finite.length >= 1, 'with nothing reporting a numeric daysRemaining, a null one cannot be told from an unimplemented field');
});

test('the open-ended window serializes endDate as null, not as a far-future date', () => {
  const { startDate, endDate } = windowDates('openEnded', NOW);
  assert.equal(endDate, null);
  assert.ok(typeof startDate === 'string' && startDate.length > 0, 'the start date is still a real date — only the END is open');
  const body = buildMissionBody(spec('MSN_OPEN_ENDED'), { template: template(), storeId: 'S', now: NOW, ...RESOLVED });
  assert.equal(body.endDate, null, 'endDate must be sent explicitly as null so a template default cannot supply one');
});

test('windowIsOpen treats a null end date as open, forever', () => {
  const mission = { startDate: new Date(NOW.getTime() - 86400000).toISOString(), endDate: null };
  assert.equal(windowIsOpen(mission, NOW), true);
  assert.equal(windowIsOpen(mission, new Date(NOW.getTime() + 3650 * 86400000)), true,
    'an open-ended fixture must never read as drifted, or the seeder churns its GUID on every run');
  assert.equal(windowExpectsOpen('openEnded'), true);
});

test('guard catches the open-ended fixture acquiring an end date', () => {
  withMutation(spec('MSN_OPEN_ENDED'), 'window', 'active', () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /MSN_OPEN_ENDED/.test(x)), `expected an MSN_OPEN_ENDED problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches the open-ended fixture becoming completable (success badge overrides the date badge)', () => {
  withMutation(spec('MSN_OPEN_ENDED'), 'goal', { type: 'OrderCountGoal', count: 1 }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /MSN_OPEN_ENDED is COMPLETED/.test(x)), `expected a completability problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches the open-ended fixture being made private', () => {
  withMutation(spec('MSN_OPEN_ENDED'), 'public', false, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /MSN_OPEN_ENDED must stay Published \+ public/.test(x)), `expected a visibility problem, got ${JSON.stringify(p)}`);
  });
});

/* ── MSNF-035: the created zero-stock featured SKU ───────────────────────── */

test('the zero-stock product is declared with zero stock, a real price and a sweepable SKU', () => {
  assert.equal(ZERO_STOCK_PRODUCT.inStockQuantity, 0, 'the fixture IS the zero');
  assert.ok(ZERO_STOCK_PRODUCT.listPrice > 0, 'an unpriced row renders as broken, which is not the same observation as out-of-stock');
  assert.ok(isSeededMissionName(ZERO_STOCK_PRODUCT.sku), 'teardown sweeps by the AGENT-TEST-MSN- prefix');
  assert.ok(!PERSKU_PRODUCTS.some((p) => p.slot === ZERO_STOCK_PRODUCT.slot), 'it must not join the shared buyable pair');
  // The buyable pair, the zero-stock target, and the found points-priced one.
  assert.equal(TARGET_PRODUCTS.length, PERSKU_PRODUCTS.length + 2);
});

test('the zero-stock slot is opt-in — no other PerSku mission inherits it', () => {
  for (const m of MISSIONS.filter(needsGoalItems)) {
    const has = goalSlotsFor(m).includes(ZERO_STOCK_PRODUCT.slot);
    assert.equal(has, m.aliasName === 'MSN_PERSKU_OOS', `${m.aliasName} unexpectedly ${has ? 'includes' : 'omits'} the zero-stock slot`);
  }
  const items = buildGoalItems(spec('MSN_PERSKU_ALL'), 'M', { A: { id: 'pa' }, B: { id: 'pb' }, Z: { id: 'pz' } });
  assert.deepEqual(items.map((i) => i.productId), ['pa', 'pb'], 'MSN_PERSKU_ALL must still target exactly its two buyable products');
});

test('the OOS mission targets one buyable row NEXT TO the zero-stock one', () => {
  const slots = goalSlotsFor(spec('MSN_PERSKU_OOS'));
  assert.ok(slots.includes(ZERO_STOCK_PRODUCT.slot));
  const companions = slots.filter((s) => s !== ZERO_STOCK_PRODUCT.slot);
  assert.ok(companions.length >= 1, 'a modal that disables every row would pass with no buyable companion');
  for (const s of companions) assert.ok(PERSKU_PRODUCTS.some((p) => p.slot === s), `companion slot ${s} must be a live-discovered buyable product`);
  const items = buildGoalItems(spec('MSN_PERSKU_OOS'), 'M', { A: { id: 'pa' }, B: { id: 'pb' }, Z: { id: 'pz' } });
  assert.deepEqual(items.map((i) => i.productId).sort(), ['pa', 'pz']);
});

test('the OOS mission is incomplete against the seed order, so its modal stays interactive', () => {
  const p = predictProgress(spec('MSN_PERSKU_OOS'));
  assert.equal(p.status, 'InProgress', 'a completed mission renders a READ-ONLY modal, hiding the disabled control under test');
  assert.equal(p.rowsMet, 1);
  assert.equal(p.rowsUnmet, 1, 'the unmet row is the out-of-stock one');
  assert.equal(p.rows.find((r) => r.slot === ZERO_STOCK_PRODUCT.slot).current, 0, 'the provisioning order must never buy the zero-stock product');
});

test('guard catches the OOS mission being flipped to PerSkuAny (which completes and goes read-only)', () => {
  withMutation(spec('MSN_PERSKU_OOS'), 'goal', { type: 'PerSkuGoal', all: false }, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /READ-ONLY/.test(x)), `expected a read-only-modal problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches the OOS mission losing its in-stock companion row', () => {
  withMutation(spec('MSN_PERSKU_OOS'), 'goalSlots', [ZERO_STOCK_PRODUCT.slot], () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /targets ONLY the zero-stock slot/.test(x)), `expected a missing-companion problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches the zero-stock product being restocked', () => {
  withMutation(ZERO_STOCK_PRODUCT, 'inStockQuantity', 5, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /the fixture IS the zero/.test(x)), `expected a restock problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches the zero-stock product losing its price (broken row, not an OOS row)', () => {
  withMutation(ZERO_STOCK_PRODUCT, 'listPrice', 0, () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /renders as BROKEN/.test(x)), `expected an unpriced problem, got ${JSON.stringify(p)}`);
  });
});

test('guard catches a second fixture claiming the zero-stock slot', () => {
  withMutation(spec('MSN_PERSKU_ANY'), 'goalSlots', ['A', ZERO_STOCK_PRODUCT.slot], () => {
    const p = validateSpecShape();
    assert.ok(p.some((x) => /fixtures target the zero-stock slot/.test(x)), `expected an ambiguous-subject problem, got ${JSON.stringify(p)}`);
  });
});

test('productBySlot resolves every declared slot, and goalSlotsFor defaults to the buyable pair', () => {
  for (const p of TARGET_PRODUCTS) assert.equal(productBySlot[p.slot], p);
  assert.deepEqual(goalSlotsFor({}), PERSKU_PRODUCTS.map((p) => p.slot));
  assert.deepEqual(goalSlotsFor(spec('MSN_PERSKU_OOS')), ['A', 'Z']);
});
