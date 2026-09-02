/**
 * validate-missions-e2e-data.mjs — the drift + VACUITY guard for the suite-083d fixture set.
 * `npm run td:validate:missions-e2e`
 *
 * STATIC by construction: it reads the committed `test-data/aliases.json`, the per-env
 * `test-data/aliases.<env>.json` overlay and the side-effect-free spec module. No network, no auth —
 * same discipline as every other `td:validate:*` (the live half is `td:reconcile`).
 *
 * IT IS A VACUITY GUARD FIRST AND A DRIFT GUARD SECOND, and that ordering is the point.
 * A conventional drift guard asks "is the fixture still there?". Every fixture 083d needed WAS still
 * there on 2026-08-28, and six of eight cases were BLOCKED anyway, because the fixtures had been
 * CONSUMED: MSN_ORDERCOUNT sat at 2 of 2 Completed, MSN_ORDERVALUE at 100%, and a Completed mission
 * stops accruing entirely. Nothing in the repo could see that. So the checks that matter here ask
 * whether the data is still capable of failing:
 *
 *   [4] every mission was PRE-COMPLETION when it was seeded  (the missing check)
 *   [5] every mission name carries THIS run's handle          (per-run minting actually happened)
 *   [6] the reward account's balance is below the reward      (MSN-E2E-004's thesis is demonstrable)
 *   [7] the PTS target settles in a currency the denomination product does not (MSN-E2E-007 asks something)
 *   [8] pack size 1 on every target                           (a stepper can reach exactly 1)
 *
 * Two more were added on 2026-09-01, both of the same "resolves but tests nothing" shape:
 *
 *   [3g] every account alias can PRODUCE A TOKEN     (a role graphql-auth cannot resolve blocks the
 *                                                     case at step 1, before any request is issued)
 *   [j]  a funded account can PAY FOR ITS OWN LINE   (surfaced through [4]; an account that cannot
 *                                                     cover the points line its case must buy never
 *                                                     places the order, so the case reads untouched
 *                                                     seed state and calls it a result)
 *
 * Exit 0 clean, 1 on any problem. Warnings never fail.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MISSIONS, ALL_MISSIONS, PRODUCTS, REWARD_USER, RUNTIME_FIELDS_BY_KIND,
  UNIT_PRODUCT, MISSION_BY_ALIAS, DISCOUNT_ALIAS,
  CASE_MISSIONS, CASE_ACCOUNTS, CASE_ACCOUNT_PREFIX,
  CREDENTIAL_ALIASES, credentialProblems, FUNDED_ACCOUNTS, ptsLineCost,
  TARGETING_MISSIONS, TARGETING_CASE_ID, isTargetingMission, declaredAliases, boundAccounts,
  validateSpecShape, validateSeededState,
  unitsToComplete, unitsJustBelow, discountBand,
  PRODUCT_INDEX_DOCUMENT_TYPE, SILENTLY_INERT_INDEX_DOCUMENT_TYPES,
} from './missions-e2e-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENV = process.env.TEST_ENV || 'vcst';

const problems = [];
const warnings = [];
const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

const readJson = (rel) => {
  const p = join(ROOT, rel);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch (e) { fail(`${rel} is not parsable JSON: ${e.message}`); return null; }
};

console.log(`🔎 Validating loyalty-missions E2E fixtures (083d) — env ${ENV}`);

const base = readJson('test-data/aliases.json') || {};
const overlay = readJson(`test-data/aliases.${ENV}.json`) || {};

/* [1] The spec set is internally coherent and still discriminating. */
for (const m of validateSpecShape()) fail(`[1] spec: ${m}`);

/* [2] Every alias the specs declare exists in the committed base, and is `_inline`. */
// Read from the spec module rather than re-derived here: a second list is a second definition of
// which fields are runtime, and the two would disagree the first time a kind was added.
const declared = declaredAliases();
for (const { aliasName } of declared) {
  const a = base[aliasName];
  if (!a) { fail(`[2] alias ${aliasName} is declared by the spec module but absent from test-data/aliases.json — every @td(${aliasName}.*) in 083d would fail to resolve`); continue; }
  if (a._inline !== true) fail(`[2] alias ${aliasName} is not _inline — this fixture set has no backing CSV`);
}
if (!base[DISCOUNT_ALIAS]) warn(`[2] ${DISCOUNT_ALIAS} (the coupon MSN-E2E-005 applies) is not in aliases.json — the discount case has no coupon to resolve`);

/* [3] NO RUNTIME VALUE IN THE COMMITTED BASE. A committed GUID resolves to the wrong entity on every
 *     other env, and a committed run-scoped mission NAME is worse still: it would pin the suite to one
 *     historical run forever. */
for (const { aliasName, kind } of declared) {
  const a = base[aliasName];
  if (!a) continue;
  for (const field of RUNTIME_FIELDS_BY_KIND[kind] || []) {
    if (!(field in a)) { fail(`[3] ${aliasName}.${field} is a declared runtime field but the base alias does not declare the key at all — the resolver would report an unknown field rather than an unseeded one`); continue; }
    if (String(a[field] ?? '') !== '') {
      fail(`[3] ${aliasName}.${field} = ${JSON.stringify(a[field])} in the COMMITTED aliases.json — runtime values belong in aliases.<env>.json only (.claude/rules/test-data.md)`);
    }
  }
  // A GUID anywhere in a committed inline alias is a bug whatever the field is called.
  for (const [k, v] of Object.entries(a)) {
    if (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) {
      fail(`[3] ${aliasName}.${k} holds a platform GUID in the committed base — migrate it to aliases.<env>.json`);
    }
  }
}

/* [3b] Authored business fields in the base must agree with the spec module (one source of truth). */
const expectMatch = (aliasName, field, want) => {
  const got = base[aliasName]?.[field];
  if (got == null) { fail(`[3b] ${aliasName}.${field} is missing from aliases.json (expected ${want})`); return; }
  if (String(got) !== String(want)) fail(`[3b] ${aliasName}.${field} = ${JSON.stringify(got)} but the spec module declares ${JSON.stringify(want)} — the alias and its source of truth disagree`);
};
for (const m of MISSIONS) {
  expectMatch(m.aliasName, 'status', m.status);
  expectMatch(m.aliasName, 'public', String(m.public));
  expectMatch(m.aliasName, 'goal_type', m.goal.type);
  expectMatch(m.aliasName, 'reward', m.reward);
  const target = m.goal.type === 'OrderValueGoal' ? m.goal.value
    : m.goal.type === 'OrderCountGoal' ? m.goal.count
      : (m.goal.all ? 'PerSkuAll' : 'PerSkuAny');
  expectMatch(m.aliasName, 'goal_target', target);
  // The JOURNEY's authored half. order_units / journey_orders are what the case composes its two
  // orders from; everything downstream of them is measured.
  if (m.journeyOrders != null) {
    expectMatch(m.aliasName, 'case_id', m.caseId);
    expectMatch(m.aliasName, 'account_alias', boundAccounts(m)[0]);
    expectMatch(m.aliasName, 'order_units', m.order.units);
    expectMatch(m.aliasName, 'journey_orders', m.journeyOrders);
  }
}

/* [3f] The TARGETING STAR's authored half. Its inputs are the whole fixture, so a base alias that
 *      disagrees with the spec module describes a mission that is not the one being seeded — and the
 *      case would interpret its reading against the wrong cell. `goal_target` is deliberately absent:
 *      the unreachable ceiling is derived at seed time and checked against the overlay by [4]. */
for (const m of TARGETING_MISSIONS) {
  expectMatch(m.aliasName, 'case_id', m.caseId);
  expectMatch(m.aliasName, 'targeting_role', m.targetingRole);
  expectMatch(m.aliasName, 'visibility_policy', m.visibility);
  expectMatch(m.aliasName, 'account_aliases', boundAccounts(m).join('; '));
  expectMatch(m.aliasName, 'status', m.status);
  expectMatch(m.aliasName, 'public', String(m.public));
  expectMatch(m.aliasName, 'goal_type', m.goal.type);
  expectMatch(m.aliasName, 'condition_type', m.condition.type);
  expectMatch(m.aliasName, 'target_rule', m.targetRule);
  expectMatch(m.aliasName, 'reward', m.reward);
  const committedTarget = base[m.aliasName]?.goal_target;
  if (String(committedTarget ?? '') !== '') {
    fail(`[3f] ${m.aliasName}.goal_target = ${JSON.stringify(committedTarget)} in the COMMITTED base — the unreachable ceiling is DERIVED from the largest cart the set measures, because a transcribed one goes stale the moment a case orders more and fails SILENTLY, by the cell quietly becoming completable and granting on other cases' orders.`);
  }
}
for (const p of PRODUCTS) {
  expectMatch(p.aliasName, 'sku', p.sku);
  expectMatch(p.aliasName, 'pack_size', p.packSize);
  expectMatch(p.aliasName, 'list_price', p.listPrice);
  if (p.goalQuantity != null) expectMatch(p.aliasName, 'quantity', p.goalQuantity);
  // The second-currency AMOUNT is authored (a price is a business key, identical on every env that
  // carries the currency); the second-currency CODE is runtime and lives in the overlay, so [3] holds
  // it empty here via RUNTIME_FIELDS_BY_KIND.dualProduct. A case reads the pair to know what the
  // second-currency row must render — recomputing either by hand is how a fixture and its assertion
  // stop following the same source.
  if (p.secondaryListPrice != null) expectMatch(p.aliasName, 'list_price_secondary', p.secondaryListPrice);
}
expectMatch(REWARD_USER.aliasName, 'source_alias', REWARD_USER.sourceAlias);
expectMatch(REWARD_USER.aliasName, 'reward_alias', REWARD_USER.rewardAlias);

/* [3d] The per-case split's AUTHORED half agrees with the spec module. `goal_target` is deliberately
 *      absent from this list — it is measured, and check [4] handles it against the overlay. */
for (const m of CASE_MISSIONS) {
  expectMatch(m.aliasName, 'case_id', m.caseId);
  expectMatch(m.aliasName, 'account_alias', m.accountAlias);
  expectMatch(m.aliasName, 'status', m.status);
  expectMatch(m.aliasName, 'public', String(m.public));
  expectMatch(m.aliasName, 'goal_type', m.goal.type);
  expectMatch(m.aliasName, 'reward', m.reward);
  expectMatch(m.aliasName, 'order_units', m.order.units);
  expectMatch(m.aliasName, 'order_coupon_alias', m.order.coupon || '');
  expectMatch(m.aliasName, 'target_rule', m.targetRule);
  // A committed `goal_target` would be the exact defect this split exists to remove: a modelled
  // number standing in for a measurement, going stale the moment the store's tax or the coupon moves.
  const committedTarget = base[m.aliasName]?.goal_target;
  if (String(committedTarget ?? '') !== '') {
    fail(`[3d] ${m.aliasName}.goal_target = ${JSON.stringify(committedTarget)} in the COMMITTED base — a per-case target is DERIVED from a live probe cart on that case's own account and belongs in aliases.<env>.json only. A modelled target was 8.00 out against vcst-qa's real 20% tax, four times the band it was meant to discriminate inside.`);
  }
}
for (const a of CASE_ACCOUNTS) {
  expectMatch(a.aliasName, 'case_id', a.caseId);
  expectMatch(a.aliasName, 'mission_alias', a.missionAliases.join('; '));
  // The targeting pair's AUDIENCE is authored (which side of the group each half is on); the OBSERVED
  // membership is runtime and lives in the overlay. Committing the observed value would assert the
  // very thing the pair exists to make falsifiable.
  if (a.audienceRole) {
    expectMatch(a.aliasName, 'audience_role', a.audienceRole);
    expectMatch(a.aliasName, 'groups_intent', (a.groups || []).join('; '));
  }
}

/* [3g] EVERY account alias must be able to PRODUCE A TOKEN — the first of the two vacuity shapes.
 *
 * An alias that resolves as data and cannot resolve as a ROLE is a fixture that tests nothing, and it
 * fails in the least visible place: step 1 of an unattended run, before a single request is issued.
 * Measured 2026-09-01: MSN_E2E_USER_* carried `password_var` (an env-var NAME, correct for the browser
 * lane's Playwright --secrets redaction) but no field graphql-auth.ts `resolveRole()` reads, so it fell
 * through to the last-resort `<ALIAS>_EMAIL`/`<ALIAS>_PASSWORD` env pattern and threw. Six of the nine
 * 075d cases could not run unattended; the one execution that reported results had bridged it by hand
 * with an uncommitted wrapper.
 *
 * The rule lives in the spec module (`credentialProblems`) so this guard and the unit tests judge the
 * same contract the runner implements, rather than a similar-looking checklist. */
for (const aliasName of CREDENTIAL_ALIASES()) {
  for (const m of credentialProblems(aliasName, base[aliasName])) fail(`[3g] ${m}`);
}

/* [3e] The four per-case rewards must stay DISTINCT from each other and from every other mission in
 *      the set. Equal rewards on two missions that can grant on the same account make a balance delta
 *      or a points-history row unattributable — the divergence clause of the SECOND RULE. */
const byReward = new Map();
for (const m of ALL_MISSIONS) {
  const prior = byReward.get(m.reward);
  // The targeting star's three cells MUST share a reward or they stop being a controlled comparison,
  // and they can never grant (their target is unreachable by construction), so there is no delta for a
  // reward to have to attribute. A collision with any mission that CAN grant is still a real defect.
  if (prior && isTargetingMission(m) && isTargetingMission(MISSION_BY_ALIAS[prior])) continue;
  if (prior) {
    fail(`[3e] ${m.aliasName} and ${prior} both reward ${m.reward} PTS — a grant from either is indistinguishable in a balance delta or a points-history row, so no case on them can attribute what it observed`);
  } else byReward.set(m.reward, m.aliasName);
}

/* [3c] The derived arithmetic exposed to the cases must be DERIVED, not a second literal. */
const ov = MISSION_BY_ALIAS.MSN_E2E_ORDERVALUE;
if (ov) {
  const band = discountBand(ov, UNIT_PRODUCT);
  const derived = {
    units_to_complete: unitsToComplete(ov, UNIT_PRODUCT),
    units_just_below: unitsJustBelow(ov, UNIT_PRODUCT),
    discount_post_total: band.postDiscount,
    discount_shipping_headroom: band.shippingHeadroom,
  };
  for (const [field, want] of Object.entries(derived)) {
    const got = base[ov.aliasName]?.[field];
    if (got == null) { fail(`[3c] ${ov.aliasName}.${field} is missing — 083d composes its orders from it, and a case that recomputes the number by hand goes stale the moment the target moves`); continue; }
    if (String(got) !== String(want)) fail(`[3c] ${ov.aliasName}.${field} = ${JSON.stringify(got)} but is derived as ${want} from target ${ov.goal.value} / unit price ${UNIT_PRODUCT.listPrice} — a transcribed constant that no longer follows its source`);
  }
}

/* [4]–[8] THE VACUITY GUARD, against the state the last seed OBSERVED and recorded.
 *
 * `--max-age-hours N` additionally fails a run whose missions were minted more than N hours ago.
 * OPT-IN, not the default: the guard must stay runnable at any time (in CI, on a fresh clone, before
 * a seed) without the passage of time alone turning it red. Pass it immediately before dispatching
 * 083d — that is the moment when a stale run genuinely means the suite is about to assert against
 * progress an earlier execution already consumed. */
const ageIdx = process.argv.indexOf('--max-age-hours');
const maxAgeHours = ageIdx >= 0 ? Number(process.argv[ageIdx + 1]) : null;
if (ageIdx >= 0 && !Number.isFinite(maxAgeHours)) fail('[4] --max-age-hours needs a number');
for (const m of validateSeededState(overlay, { maxAgeHours })) fail(`[4] seeded state: ${m}`);

/* [8] Pack size, restated against the committed alias so a case reading @td(...pack_size) is safe. */
for (const p of PRODUCTS) {
  const declaredPack = Number(base[p.aliasName]?.pack_size ?? NaN);
  if (Number.isFinite(declaredPack) && declaredPack !== 1) {
    fail(`[8] ${p.aliasName}.pack_size = ${declaredPack} — the storefront stepper moves in pack-size increments, so a case step that sets the quantity to exactly 1 is unachievable (this is the MSN_PERSKU_PRODUCT_B 0 → 2 → 0 failure, restated)`);
  }
}

/* [8b] The per-case accounts must be four DISTINCT accounts in the right sweep namespace. This is the
 *      check that catches the contention coming back: two cases resolving to one login means one
 *      order advances both their missions, whatever the mission split says. */
const emails = new Map();
for (const a of CASE_ACCOUNTS) {
  const email = overlay[a.aliasName]?.email;
  if (!email) continue;                                  // absence is [4]'s to report, with its own message
  if (!String(email).startsWith(CASE_ACCOUNT_PREFIX)) {
    fail(`[8b] ${a.aliasName}.email "${email}" is outside the ${CASE_ACCOUNT_PREFIX} sweep namespace — teardown would leak it, and it may not be a per-run account at all`);
  }
  if (emails.has(email)) {
    fail(`[8b] ${a.aliasName} and ${emails.get(email)} resolve to the SAME account (${email}) — one order advances every mission applicable to its user, so ${a.caseId} and the other case would consume each other's progress. This is exactly the contention the per-case split removes.`);
  } else emails.set(email, a.aliasName);
}

/* [9] Every case the suite declares is served by at least one fixture, and vice versa. */
const covered = new Set(ALL_MISSIONS.flatMap((m) => m.cases || []));
const suiteCases = ['MSN-E2E-001', 'MSN-E2E-002', 'MSN-E2E-003', 'MSN-E2E-004', 'MSN-E2E-005', 'MSN-E2E-006', 'MSN-E2E-007', 'MSN-E2E-008', TARGETING_CASE_ID];
for (const c of suiteCases) if (!covered.has(c)) warn(`[9] ${c} is not claimed by any fixture in this set — it either binds to shared data or is still unserved`);
for (const c of covered) if (!suiteCases.includes(c)) fail(`[9] a fixture claims case ${c}, which is not in suite 083d — the claim cannot be true`);

/* [10] The seeder still asks the DATABASE whether a product exists, and still addresses the reindex
 * to a document type this platform registers.
 *
 * Both defects that destroyed this fixture set on 2026-09-01 were SILENT — teardown printed "zero
 * residue" over a product it had not deleted, and the index guard printed "not in the index" about a
 * product that was in the index. Neither is visible in any fixture, alias or overlay, so no amount of
 * data checking above would catch a reintroduction. What IS checkable is the two calls themselves:
 *
 *   - `keyword:` as a product-existence lookup. `POST /api/catalog/listentries` pages CATEGORIES AND
 *     PRODUCTS through one window, categories first, so a fuzzy keyword whose category hits exceed
 *     `take` returns zero products for a product that exists (measured: 21 category hits, `take: 10`,
 *     zero rows, `AGENT-TEST-MSN-E2E-PERSKU-A` sitting in the database the whole time). Exact `code:`
 *     is unpaged and database-backed.
 *   - `'CatalogProduct'` as a reindex documentType. Not registered on this platform; the request is
 *     accepted with a real jobId and indexes nothing.
 *
 * A source scan is a blunt instrument, and it is used here deliberately: these are call-shape
 * regressions with no data footprint, so the shape is the only thing left to guard.
 */
{
  const seederRel = 'scripts/seed-data/loyalty/seed-missions-e2e.mjs';
  const seederPath = join(ROOT, seederRel);
  if (!existsSync(seederPath)) fail(`[10] ${seederRel} is missing — the fixture set has no seeder`);
  else {
    const src = readFileSync(seederPath, 'utf8');
    // Strip block/line comments so the explanatory prose above (which names both bad patterns) is
    // not itself the thing that trips the guard.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
    for (const inert of SILENTLY_INERT_INDEX_DOCUMENT_TYPES) {
      if (new RegExp(`documentType\\s*:\\s*['"\`]${inert}['"\`]`).test(code)) {
        fail(`[10] ${seederRel} triggers a reindex with documentType "${inert}", which this platform accepts and silently ignores — use "${PRODUCT_INDEX_DOCUMENT_TYPE}"`);
      }
    }
    if (/listentries['"`]\s*,\s*\{[^}]*\bkeyword\s*:/.test(code)) {
      fail(`[10] ${seederRel} looks a product up through listentries with a fuzzy \`keyword:\` — that response is paged behind the category hits and cannot prove absence; use the exact \`code:\` criterion (see absenceIsProven)`);
    }
    // THE RE-ASSERT ITSELF. `ensureProduct` set every product flag in the CREATE body and re-asserted
    // only `packSize`, so a flag flipped on the platform after creation drifted forever while the
    // seeder printed success (measured: PERSKU-PTS at `trackInventory: true` against a spec declaring
    // false, three correct siblings hiding it). That drift has NO data footprint — no alias, no price
    // row, no overlay field carries the flag — so this static guard cannot detect the drift; what it
    // CAN do is refuse the removal of the re-assert that prevents it. Detection is td:reconcile [14].
    if (!/productFlagDrift\s*\(/.test(code)) {
      fail(`[10] ${seederRel} no longer re-asserts PRODUCT_INVARIANT_FLAGS on an already-existing product — a flag written only into the CREATE body drifts silently and invisibly (trackInventory on a fixture 083d places real orders against, so it drains and blocks MSN-E2E-007 for a reason unrelated to missions). Restore the productFlagDrift() re-assert in ensureProduct.`);
    }
    if (!/documentIds\s*:/.test(code) && !/buildReindexRequest\s*\(/.test(code)) {
      fail(`[10] ${seederRel} has no targeted reindex trigger — this environment's time-based incremental job is disabled (ECL-14.7), so an untargeted reindex can be abandoned rather than merely delayed`);
    }
  }
}

/* ── Report ─────────────────────────────────────────────────────────────────── */
console.log('');
if (warnings.length) { console.log('Warnings:'); for (const w of warnings) console.log(`  ⚠ ${w}`); console.log(''); }
if (problems.length) {
  console.log(`❌ ${problems.length} problem(s):`);
  for (const p of problems) console.log(`  • ${p}`);
  process.exit(1);
}
console.log(
  `✅ clean — ${ALL_MISSIONS.length} missions (${CASE_MISSIONS.length} measured per-case, ${TARGETING_MISSIONS.length} targeting), `
  + `${CASE_ACCOUNTS.length} per-run accounts, ${PRODUCTS.length} products, ${declared.length} aliases; every fixture was `
  + 'pre-completion at seed time, every per-case target sits in a measured band, the targeting star recorded a '
  + 'reading for both of its accounts with its control visible to both, the accounts are distinct, every role '
  + `resolves to a token, the reward is legible and the ${FUNDED_ACCOUNTS().length} funded account(s) can pay for `
  + `the ${ptsLineCost()}-point line their case must buy.`,
);
