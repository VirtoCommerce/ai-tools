/**
 * validate-missions-data.mjs — STATIC drift guard for the VCST-5319 Loyalty Missions fixtures.
 * `npm run td:validate:missions`. No network, no env, no auth — safe in CI.
 *
 * It answers one question: **can this fixture set still FAIL a test?**
 *
 * Existence is not the interesting property here. Every mission in this set is defined by a value that
 * looks arbitrary and is not — `public=false`, a target of 0, a reward of 0, a null currency, an
 * `all` flag that must disagree with its twin. Change any of them to something "more sensible" and the
 * fixture still seeds, still resolves through `@td()`, and still passes — while proving nothing. So the
 * checks below are written against the ways each fixture can survive while going vacuous, plus the two
 * mechanical rules the multi-env policy turns on: no runtime GUID in a committed file, and no per-env
 * value pinned in the base alias registry.
 *
 * Checks:
 *   [1] the spec set is coherent and still discriminating   (missions-specs.validateSpecShape)
 *   [2] every spec has a registered alias, and vice versa   (no orphan either way)
 *   [3] each alias mirrors its spec's business fields       (the registry cannot drift from the source)
 *   [4] no runtime GUID / per-env value in the BASE registry (they belong to aliases.<env>.json)
 *   [5] every alias declares its runtime fields in `fields`  (else the overlay can never reach them)
 *   [6] the gate alias names the real setting + records the base switch it must NOT touch
 *   [7] no committed file anywhere carries a seeded mission GUID
 *   [8] (informational) which envs' overlays currently carry ids
 *   [9] the VCST-5346 progress axis: the provisioning order's registry entry matches the order the
 *       seeder places, the account it is placed for is a declared user-roles.mjs role, and all THREE
 *       storefront states (danger badge / partial / completed-PerSku) are still reachable
 *  [10] the targeting axis, across registries: the group the fixtures target is the group the intended
 *       member account really carries, and the negative control is declared OUTSIDE it
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MISSIONS, PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT, TARGET_PRODUCTS,
  STORE_SETTING, RUNTIME_FIELDS_BY_KIND, NAME_PREFIX,
  BANNERS, bannerKeyFor, bannerSourceRel,
  missionName, validateSpecShape,
  PROGRESS_ORDER, PROGRESS_ORDER_ALIAS, PROGRESS_USER_ROLE, progressOrderNumber,
  POINTS_PRODUCT, POINTS_ORDER, POINTS_ORDER_ALIAS, REWARD_SPEND, PROGRESS_ORDERS, validateSeededMoney,
  goalItemQuantities, needsGoalItems, predictProgress, percentagesMatch, progressFixtures,
  localeIntentsUsed, localeFieldFor,
  WINDOWS, DANGER_THRESHOLD_DAYS,
  TARGETING, TARGET_GROUP, GROUP_AUDIENCE, MISSION_BY_ALIAS,
  targetedGroups, isGroupTargeted, groupMatches,
} from './missions-specs.mjs';
import { USER_ROLES } from '../../lib/user-roles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const GUID_RE = /\b[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}\b/i;
/** The window every ordinary fixture sits on; only a fixture that DIFFERS mirrors its intent in the registry. */
const DEFAULT_WINDOW = 'active';

const problems = [];
const warnings = [];
const notes = [];
/**
 * The alias namespace owned by the RUN-SCOPED e2e fixture set (missions-e2e-specs.mjs). See the [2]
 * reverse-orphan scan below for why this guard deliberately does not claim it.
 */
const NAME_PREFIX_E2E = 'MSN_E2E';

const fail = (m) => problems.push(m);
const warn = (m) => warnings.push(m);

const aliasPath = join(ROOT, 'test-data', 'aliases.json');
const aliases = JSON.parse(readFileSync(aliasPath, 'utf8'));

/**
 * Which fields are RUNTIME, per alias — not a union across all of them. `name` is runtime on a
 * discovered PerSku product and is the business key on a mission, so a flattened set would demand
 * that every mission blank its own identifier. Also drives check [5].
 */
const RUNTIME_BY_ALIAS = {
  [STORE_SETTING.aliasName]: RUNTIME_FIELDS_BY_KIND.storeSetting,
  [PROGRESS_ORDER_ALIAS]: RUNTIME_FIELDS_BY_KIND.progressOrder,
  [GROUP_AUDIENCE.aliasName]: RUNTIME_FIELDS_BY_KIND.groupAudience,
  // The PerSku targets are CREATED now, not discovered: their sku/name are authored business keys the
  // seeder finds-or-creates by, so only the server-assigned ids plus the RESOLVED currency and storefront
  // path are runtime. Giving them the discovered-product list would demand they blank their own SKU.
  ...Object.fromEntries(PERSKU_PRODUCTS.map((p) => [p.aliasName, RUNTIME_FIELDS_BY_KIND.createdProduct])),
  [POINTS_PRODUCT.aliasName]: RUNTIME_FIELDS_BY_KIND.foundProduct,
  [POINTS_ORDER_ALIAS]: RUNTIME_FIELDS_BY_KIND.pointsOrder,
  [REWARD_SPEND.aliasName]: RUNTIME_FIELDS_BY_KIND.rewardSpend,
  // The zero-stock product is CREATED by this seeder, so its sku/name are authored business keys and
  // only the server-assigned ids are runtime — see RUNTIME_FIELDS_BY_KIND.createdProduct.
  [ZERO_STOCK_PRODUCT.aliasName]: RUNTIME_FIELDS_BY_KIND.createdProduct,
  // A currency-carrying mission has one MORE runtime field: the resolved code. The INTENT is authored
  // and committed; the code it resolves to is per-env store config.
  ...Object.fromEntries(MISSIONS.map((m) => [
    m.aliasName,
    [
      ...RUNTIME_FIELDS_BY_KIND.mission,
      // A currency-carrying mission has one MORE runtime field: the resolved code.
      ...(m.goal.currency ? ['goal_currency'] : []),
      // ...and a localized one has one per INTENT IT ACTUALLY USES: the locale CODE that intent
      // resolved to. The TEXT is authored and committed; the code is per-env store config, exactly
      // like a currency. Only the used intents, so a single-locale fixture does not carry a dead
      // `locale_alternate` naming a language it has no text in.
      ...localeIntentsUsed(m).map(localeFieldFor),
    ],
  ])),
};

/* [1] ─────────────────────────────────────────────────────────────────────── */
for (const p of validateSpecShape()) fail(`[1] ${p}`);

/* [2] ─────────────────────────────────────────────────────────────────────── */
const owned = [
  STORE_SETTING.aliasName,
  PROGRESS_ORDER_ALIAS,
  GROUP_AUDIENCE.aliasName,
  ...TARGET_PRODUCTS.map((p) => p.aliasName),
  ...MISSIONS.map((m) => m.aliasName),
  POINTS_ORDER_ALIAS,
  REWARD_SPEND.aliasName,
];
for (const name of owned) {
  if (!aliases[name]) fail(`[2] alias ${name} is declared in the spec module but absent from test-data/aliases.json — @td(${name}.*) resolves to nothing`);
}
// The reverse orphan: an MSN_* alias nobody seeds is worse than a missing one, because it resolves to
// a plausible-looking committed value forever and no seeder will ever refresh it.
for (const name of Object.keys(aliases)) {
  if (!/^MSN_/.test(name)) continue;
  // The MSN_E2E_ namespace belongs to the run-scoped e2e set (missions-e2e-specs.mjs), which has its
  // own spec module, its own seeder and its own guard (`npm run td:validate:missions-e2e`). Claiming
  // it here would make this guard fail on fixtures it does not own and cannot tear down; importing
  // that module to assert they exist would couple two deliberately independent sets. The reverse
  // orphan check for those aliases is that guard's job.
  if (name.startsWith(`${NAME_PREFIX_E2E}_`)) continue;
  if (!owned.includes(name)) fail(`[2] alias ${name} looks like a mission fixture but no spec owns it — nothing seeds or tears it down`);
}

/* [3] ─────────────────────────────────────────────────────────────────────── */
for (const m of MISSIONS) {
  const a = aliases[m.aliasName];
  if (!a) continue;
  const g = m.goal;
  const expectTarget = String(g.type === 'OrderValueGoal' ? g.value : g.type === 'OrderCountGoal' ? g.count : (g.all ? 'PerSkuAll' : 'PerSkuAny'));
  const expect = {
    name: missionName(m),
    status: m.status,
    public: String(m.public),
    goal_type: g.type,
    goal_target: expectTarget,
    reward: m.reward,
  };
  for (const [k, v] of Object.entries(expect)) {
    if (a[k] !== v) fail(`[3] ${m.aliasName}.${k} is ${JSON.stringify(a[k])} in aliases.json but ${JSON.stringify(v)} in missions-specs.mjs — the registry has drifted from its source of truth`);
  }
  // A non-default window is the whole point of the fixture that carries it, so the registry must name
  // it: without the mirror, an expired fixture quietly re-authored as `active` reads as identical to
  // every other mission and the case asserting its absence starts passing for no reason.
  if (m.window !== DEFAULT_WINDOW) {
    if (a.window_intent !== m.window) {
      fail(`[3] ${m.aliasName}.window_intent is ${JSON.stringify(a.window_intent)} in aliases.json but the spec declares ${JSON.stringify(m.window)} — the registry no longer names the property this fixture exists for`);
    }
  } else if ('window_intent' in a) {
    fail(`[3] ${m.aliasName} carries window_intent but sits on the default "${DEFAULT_WINDOW}" window — a dead field reads as coverage that does not exist`);
  }

  // A group condition is the whole point of the fixture that carries it, so the registry must NAME the
  // audience — same treatment, and same reason, as `window_intent`. Without the mirror, a targeted
  // fixture quietly re-authored onto the neutral condition reads as identical to every other mission
  // and the case asserting that a non-member cannot see it starts passing for no reason at all.
  const groups = targetedGroups(m);
  if (groups) {
    if (a.condition_type !== TARGETING.groupCondition.id) {
      fail(`[3] ${m.aliasName}.condition_type is ${JSON.stringify(a.condition_type)} in aliases.json but the spec declares a ${TARGETING.groupCondition.id} — the registry no longer names the property this fixture exists for`);
    }
    if (a.condition_groups !== groups.join('|')) {
      fail(`[3] ${m.aliasName}.condition_groups is ${JSON.stringify(a.condition_groups)} in aliases.json but the spec targets ${JSON.stringify(groups.join('|'))} — a case would sign in as one audience while the seeder targets another`);
    }
  } else if (['condition_type', 'condition_groups'].some((k) => k in a)) {
    fail(`[3] ${m.aliasName} carries condition fields but its spec is on the neutral ${TARGETING.neutralCondition.id} — the fixture READS as audience-targeted while behaving as untargeted, which is exactly the misreading that cost a retracted P1 on 2026-08-27`);
  }

  if (g.currency) {
    if (a.goal_currency_intent !== g.currency) {
      fail(`[3] ${m.aliasName}.goal_currency_intent is ${JSON.stringify(a.goal_currency_intent)} but the spec declares ${JSON.stringify(g.currency)}`);
    }
    if (!('goal_currency' in a)) {
      fail(`[3] ${m.aliasName} declares a currency intent but has no goal_currency field for the resolved code — the seeder writes it and @td() would never see it`);
    }
  } else if ('goal_currency_intent' in a || 'goal_currency' in a) {
    fail(`[3] ${m.aliasName} carries currency fields but its goal type (${g.type}) has no currency — dead fields read as coverage that does not exist`);
  }

  // The localized fixture's TEXT is authored, so the registry must mirror it exactly — otherwise a
  // case asserts one string while the seeder writes another, and the mismatch reads as a product bug.
  if (m.l10n) {
    const expectText = {
      name_default: m.l10n.name?.['store-default'],
      name_alternate: m.l10n.name?.['store-alternate'],
      description_default: m.l10n.description?.['store-default'],
      description_alternate: m.l10n.description?.['store-alternate'],
    };
    for (const [k, v] of Object.entries(expectText)) {
      if (a[k] !== v) fail(`[3] ${m.aliasName}.${k} is ${JSON.stringify(a[k])} in aliases.json but ${JSON.stringify(v)} in missions-specs.mjs — a case would assert text the seeder never writes`);
    }
  } else if (['name_default', 'locale_default'].some((k) => k in a)) {
    fail(`[3] ${m.aliasName} carries localization fields but its spec declares no l10n — dead fields read as coverage that does not exist`);
  }

  // EVERY mission carries a banner (the storefront card renders it), so the registry names WHICH
  // artwork — derived from the goal type — while the URL stays runtime. A wrong banner_key is the
  // quiet failure here: the card still renders, just with the wrong picture, and nothing else objects.
  const wantBanner = bannerKeyFor(m);
  if (a.banner_key !== wantBanner) {
    fail(`[3] ${m.aliasName}.banner_key is ${JSON.stringify(a.banner_key)} in aliases.json but its ${g.type} resolves to ${JSON.stringify(wantBanner)} — the card would render the wrong mission type's artwork`);
  }
  if (!('banner_url' in a)) {
    fail(`[3] ${m.aliasName} has no banner_url field for the resolved asset URL — the seeder writes it and @td(${m.aliasName}.banner_url) would never see it`);
  }

  // A progress fixture's DECLARED state must be mirrored into the registry — a case asserts the
  // storefront card against @td(...progress_status/percentage), so a registry that drifts from the
  // spec makes the case assert a state the seeder never provisions. The value mirrored is the one
  // predictProgress() RE-DERIVES from the seed order, not the hand-written declaration, so a stale
  // number cannot survive in two places at once.
  if (m.progress) {
    const predicted = predictProgress(m);
    if (!predicted) {
      fail(`[3] ${m.aliasName} declares a progress expectation that predictProgress() cannot derive — validateSpecShape explains why; the registry cannot mirror what nothing can compute`);
    } else {
      if (a.progress_status !== predicted.status) {
        fail(`[3] ${m.aliasName}.progress_status is ${JSON.stringify(a.progress_status)} in aliases.json but the seed order yields ${JSON.stringify(predicted.status)} — a case would assert a storefront state the seed never produces`);
      }
      if (!percentagesMatch(Number(a.progress_percentage), predicted.percentage)) {
        fail(`[3] ${m.aliasName}.progress_percentage is ${JSON.stringify(a.progress_percentage)} in aliases.json but the seed order yields ${predicted.percentage}`);
      }
    }
  } else if (['progress_status', 'progress_percentage'].some((k) => k in a)) {
    fail(`[3] ${m.aliasName} carries progress fields but its spec declares no \`progress\` — nothing provisions or guards that state, so the field reads as coverage that does not exist`);
  }

  // GOAL-ITEM QUANTITIES — mirrored for EVERY PerSku mission, not only the ones that override them.
  //
  // The quantity is what decides `targetValue`, and therefore every percentage, every "{current} of
  // {target}" label and every per-row "target met" mark derived from the mission. It was previously
  // mirrored only when a spec OVERRODE the shared pair, which left MSN_PERSKU_ALL / MSN_PERSKU_ANY
  // with their effective targets recorded nowhere a case could resolve or a guard could compare — and
  // on 2026-08-27 MSN_PERSKU_ANY was found live with slot B at 2 against a spec of 1 (targetValue 4
  // instead of 3), a drift that no static check could see and that the next re-seed would have
  // repaired silently. `goalItemQuantities(m)` already resolves overrides on top of the shared
  // defaults, so this mirrors the EFFECTIVE target — the number a case must actually buy.
  const effectiveTargets = needsGoalItems(m) ? goalItemQuantities(m) : null;
  if (effectiveTargets) {
    for (const [slot, qty] of Object.entries(effectiveTargets)) {
      const key = `target_qty_${slot.toLowerCase()}`;
      if (!(key in a)) {
        fail(`[3] ${m.aliasName} has no ${key} — its effective SKU target (${qty}) is recorded nowhere, so @td(${m.aliasName}.${key}) resolves to nothing and no guard can tell a drifted goal item from a correct one`);
      } else if (a[key] !== qty) {
        fail(`[3] ${m.aliasName}.${key} is ${JSON.stringify(a[key])} in aliases.json but its effective target is ${qty}${m.goalItemQuantities ? ' (spec override)' : ' (inherited from PERSKU_PRODUCTS)'} — the SKU modal row would be asserted against the wrong target`);
      }
    }
  } else {
    for (const k of Object.keys(a)) {
      if (/^target_qty_/.test(k)) fail(`[3] ${m.aliasName} carries ${k} but its ${g.type} has no SKU targets — a dead override reads as coverage that does not exist`);
    }
  }
}

// Every declared banner must have its source file committed, or the seeder throws mid-run having
// already written some missions — and a Published one can never gain a banner afterwards.
for (const key of Object.keys(BANNERS)) {
  const rel = bannerSourceRel(key);
  if (!existsSync(join(ROOT, rel))) fail(`[3] banner "${key}" declares ${rel}, which is not committed — the seeder cannot upload it`);
}
for (const p of TARGET_PRODUCTS) {
  const a = aliases[p.aliasName];
  if (!a) continue;
  if (a.slot !== p.slot) fail(`[3] ${p.aliasName}.slot is ${JSON.stringify(a.slot)} but the spec says ${JSON.stringify(p.slot)}`);
  if (a.quantity !== p.quantity) fail(`[3] ${p.aliasName}.quantity is ${JSON.stringify(a.quantity)} but the spec says ${p.quantity}`);
}

/* [3z] MSNF-035 — the CREATED zero-stock product's own registry entry ────────
 * Its authored half must be mirrored, because a case has to name the SKU it expects to find disabled
 * and the stock level it is asserting. `in_stock_quantity` is mirrored from the spec rather than left
 * to the seeder, so a registry quietly saying "5" while the spec says 0 is a STATIC failure instead of
 * a case that reads a stocked row and concludes the product bug is fixed.
 */
{
  const a = aliases[ZERO_STOCK_PRODUCT.aliasName];
  if (a) {
    const expect = {
      sku: ZERO_STOCK_PRODUCT.sku,
      name: ZERO_STOCK_PRODUCT.productName,
      in_stock_quantity: String(ZERO_STOCK_PRODUCT.inStockQuantity),
      list_price: ZERO_STOCK_PRODUCT.listPrice,
    };
    for (const [k, v] of Object.entries(expect)) {
      if (a[k] !== v) fail(`[3] ${ZERO_STOCK_PRODUCT.aliasName}.${k} is ${JSON.stringify(a[k])} in aliases.json but ${JSON.stringify(v)} in missions-specs.mjs — a case would assert against a product the seeder never provisions`);
    }
    if (a.in_stock_quantity !== '0') {
      fail(`[3] ${ZERO_STOCK_PRODUCT.aliasName}.in_stock_quantity is ${JSON.stringify(a.in_stock_quantity)} — the whole fixture is the zero; at any other value the modal row renders like every other row and the out-of-stock assertion cannot fail`);
    }
  }
}

/* [4] ─────────────────────────────────────────────────────────────────────── */
for (const name of owned) {
  const a = aliases[name];
  if (!a) continue;
  for (const f of RUNTIME_BY_ALIAS[name] || []) {
    if (!(f in a)) continue;
    const v = a[f];
    if (v !== '' && v != null) {
      fail(`[4] ${name}.${f} = ${JSON.stringify(v)} in the COMMITTED base registry. It is runtime/per-env and must be "" here — its value belongs in aliases.<env>.json, or a suite run against another env resolves the wrong entity.`);
    }
  }
  const serialized = JSON.stringify({ ...a, _notes: '' });
  if (GUID_RE.test(serialized)) {
    fail(`[4] ${name} carries a GUID in the committed base registry (DV-021 class) — move it to aliases.<env>.json`);
  }
}

/* [5] ─────────────────────────────────────────────────────────────────────── */
// The overlay is layered field-by-field over the base, but ONLY for fields the alias declares. An
// undeclared runtime field is silently unreachable: the seeder writes it, and @td() never sees it.
for (const [name, fields] of Object.entries(RUNTIME_BY_ALIAS)) {
  const a = aliases[name];
  if (!a) continue;
  if (!a.fields) { fail(`[5] ${name} has no \`fields\` map — an inline alias without it exposes nothing to @td()`); continue; }
  for (const f of fields) {
    if (!(f in a.fields)) fail(`[5] ${name}.fields is missing "${f}" — the seeder writes it to the overlay but @td(${name}.${f}) can never resolve it`);
  }
}

/* [6] ─────────────────────────────────────────────────────────────────────── */
const gate = aliases[STORE_SETTING.aliasName];
if (gate) {
  if (gate.setting_name !== STORE_SETTING.missionsSetting) fail(`[6] ${STORE_SETTING.aliasName}.setting_name must be "${STORE_SETTING.missionsSetting}"`);
  if (gate.setting_group !== STORE_SETTING.missionsGroup) fail(`[6] ${STORE_SETTING.aliasName}.setting_group must be "${STORE_SETTING.missionsGroup}"`);
  if (gate.base_setting_name !== STORE_SETTING.baseSetting) {
    fail(`[6] ${STORE_SETTING.aliasName}.base_setting_name must be "${STORE_SETTING.baseSetting}" — a case needs to know which switch is the base one so it does not conflate the two`);
  }
  if (gate.platform_default !== 'false') {
    fail(`[6] ${STORE_SETTING.aliasName}.platform_default must be "false" — the feature is OFF unless a store turns it on, and a case that assumes otherwise tests the wrong default`);
  }
}

/* [7] ─────────────────────────────────────────────────────────────────────── */
// A mission GUID that reaches a committed file is the multi-env failure this whole policy exists for.
// Scan the committed test-data tree and this seeder's own directory for anything naming a fixture next
// to a GUID.
const scanDirs = [join(ROOT, 'test-data'), join(ROOT, 'scripts', 'seed-data', 'loyalty')];
const overlayRe = /^aliases\.[a-z0-9-]+\.json$/i;
for (const dir of scanDirs) {
  if (!existsSync(dir)) continue;
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, e.name);
      if (e.isDirectory()) { walk(full); continue; }
      if (!/\.(csv|json|mjs|js)$/i.test(e.name)) continue;
      if (overlayRe.test(e.name)) continue;             // overlays are exactly where GUIDs belong
      if (e.name === 'aliases.json') continue;          // covered precisely by [4]
      const text = readFileSync(full, 'utf8');
      if (!text.includes(NAME_PREFIX)) continue;
      for (const line of text.split(/\r?\n/)) {
        if (line.includes(NAME_PREFIX) && GUID_RE.test(line)) {
          fail(`[7] ${full.slice(ROOT.length + 1)} has a line naming a mission fixture next to a GUID — runtime ids belong in aliases.<env>.json only`);
          break;
        }
      }
    }
  };
  walk(dir);
}

/* [8] ─────────────────────────────────────────────────────────────────────── */
for (const f of readdirSync(join(ROOT, 'test-data'))) {
  if (!overlayRe.test(f)) continue;
  const env = f.replace(/^aliases\./, '').replace(/\.json$/, '');
  let o = {};
  try { o = JSON.parse(readFileSync(join(ROOT, 'test-data', f), 'utf8')); } catch { continue; }
  const seeded = MISSIONS.filter((m) => o[m.aliasName]?.id);
  if (seeded.length) notes.push(`${env}: ${seeded.length}/${MISSIONS.length} mission id(s) present`);
  else if (env !== 'localhost') warn(`no mission ids in aliases.${env}.json — @td(MSN_*.id) resolves to "" there until \`TEST_ENV=${env} npm run seed:loyalty-missions\` runs`);

  /* [8f] FALSIFIABILITY, CHECKED AGAINST WHAT ACTUALLY LANDED ────────────────
   *
   * Every other check in this file proves the COMMITTED spec is coherent. None of them can prove the
   * platform agreed — a shipping charge silently dropped, a target product priced into a foreign
   * pricelist, an accrual that matches no candidate reading at all. Those are the failures that leave
   * a fixture looking perfectly seeded while the case built on it has stopped being able to fail, and
   * they are exactly the class that let a flat $30 order pass for two sprints.
   *
   * Scoped to an env that HAS been seeded: an unseeded overlay is already reported above, and running
   * the money rules against it would bury the one useful line under a dozen derived ones.
   */
  if (!seeded.length) continue;
  for (const p of validateSeededMoney(o)) fail(`[8f] ${env}: ${p}`);
}

/* [9] ─────────────────────────────────────────────────────────────────────── */
// The VCST-5346 progress axis. [1] already enforces the fixture-level rules through
// validateSpecShape; this block covers what the SPEC module cannot see — the registry entry for the
// provisioning order, and the cross-registry fact that the account it is placed for is a real
// declared test-user role rather than a name someone typed.
const ordAlias = aliases[PROGRESS_ORDER_ALIAS];
if (ordAlias) {
  const expectOrder = {
    number: progressOrderNumber(),
    order_status: PROGRESS_ORDER.status,
    user_role: PROGRESS_USER_ROLE,
    line_a_quantity: PROGRESS_ORDER.lines.find((l) => l.slot === 'A')?.quantity,
    line_b_quantity: PROGRESS_ORDER.lines.find((l) => l.slot === 'B')?.quantity,
  };
  for (const [k, v] of Object.entries(expectOrder)) {
    if (ordAlias[k] !== v) fail(`[9] ${PROGRESS_ORDER_ALIAS}.${k} is ${JSON.stringify(ordAlias[k])} in aliases.json but ${JSON.stringify(v)} in missions-specs.mjs — the registry has drifted from the order the seeder actually places, so every derived progress state is asserted against the wrong purchase`);
  }
}
const role = USER_ROLES.find((r) => r.key === PROGRESS_USER_ROLE);
if (!role) {
  fail(`[9] PROGRESS_USER_ROLE "${PROGRESS_USER_ROLE}" is not declared in scripts/lib/user-roles.mjs — the seeder would resolve no email and place the order under a null customer, which writes progress nobody can query`);
} else if (!role.emailVars?.length) {
  fail(`[9] user role ${PROGRESS_USER_ROLE} declares no emailVars — its identity cannot be resolved from .env.<ENV>`);
}

// Each of the three storefront states must still be COVERED by some fixture. Losing one is not a
// spec-shape error (every surviving fixture is individually valid), so validateSpecShape cannot see
// it — but a set that covers two states out of three passes every other check in this file.
const derived = progressFixtures().map((m) => ({ m, p: predictProgress(m) }));
const covers = {
  'danger date badge': derived.some(({ m, p }) => {
    const w = WINDOWS[m.window];
    return w?.expectOpen === true && w.endOffsetDays < DANGER_THRESHOLD_DAYS && p?.status !== 'Completed';
  }),
  'partial progress (0 < percentage < 100)': derived.some(({ p }) => p && p.percentage > 0 && p.percentage < 100),
  'completed (chip + success bar + read-only SKU modal)': derived.some(({ m, p }) => p?.status === 'Completed' && m.goal?.type === 'PerSkuGoal'),
};
for (const [state, ok] of Object.entries(covers)) {
  if (!ok) fail(`[9] no fixture can produce the "${state}" storefront state any more — the acceptance criterion it backs becomes unjudgeable, and every remaining fixture still looks correctly seeded`);
}

const soonWindow = WINDOWS.endingSoon;
if (soonWindow) {
  notes.push(`danger badge: endingSoon ends in ${soonWindow.endOffsetDays}d, so daysRemaining ranges [0, ${soonWindow.endOffsetDays}] — always < the ${DANGER_THRESHOLD_DAYS}d threshold`);
}
for (const { m, p } of derived) {
  notes.push(`${m.aliasName}: ${p ? `${p.status} ${p.percentage}% (${p.currentValue}/${p.targetValue}${p.rows.length ? `, ${p.rowsMet} row(s) met / ${p.rowsUnmet} unmet` : ''})` : 'UNPREDICTABLE'} from ${progressOrderNumber()}`);
}

/* [10] ────────────────────────────────────────────────────────────────────────
 * The group-targeting axis, across registries. [1] already enforces everything the SPEC module can see
 * — the three matrix cells, the VIP pair differing only on `public`, MSN_PUBLISHED_PRIVATE staying on
 * the neutral condition. This block covers what the spec module deliberately cannot: whether the group
 * it targets is the group the intended audience REALLY carries, and whether the control account is
 * genuinely outside it. Both are cross-registry facts (aliases.json + user-roles.mjs), and both fail
 * silently — a fixture targeting a group nobody is in is invisible to everyone and reads as a
 * targeting defect, while a "non-member" who is actually a member makes the negative half unfalsifiable.
 */
const audience = aliases[GROUP_AUDIENCE.aliasName];
if (audience) {
  const expectAudience = {
    group: GROUP_AUDIENCE.group,
    member_role: GROUP_AUDIENCE.memberRole,
    nonmember_role: GROUP_AUDIENCE.nonMemberRole,
  };
  for (const [k, v] of Object.entries(expectAudience)) {
    if (audience[k] !== v) fail(`[10] ${GROUP_AUDIENCE.aliasName}.${k} is ${JSON.stringify(audience[k])} in aliases.json but ${JSON.stringify(v)} in missions-specs.mjs — a case would resolve one audience while the seeder verifies another`);
  }
}

// The target group must be the one the MEMBER account really carries. The committed
// LOYALTY_VIP_USER.group is the static half of that claim; the seeder re-reads the live contact and
// aborts on disagreement, so the two together mean a group rename cannot pass unnoticed in either place.
const memberAlias = aliases[GROUP_AUDIENCE.memberRole];
if (!memberAlias) {
  fail(`[10] alias ${GROUP_AUDIENCE.memberRole} is absent from aliases.json — the group-targeted fixtures name it as their audience and a case has nothing to resolve`);
} else if (!groupMatches(memberAlias.group, TARGET_GROUP)) {
  fail(`[10] ${GROUP_AUDIENCE.memberRole}.group is ${JSON.stringify(memberAlias.group)} but the fixtures target ${JSON.stringify(TARGET_GROUP)} — MSN_GROUP_VIP would be aimed at an audience its own intended member is not in, so it would be invisible to EVERYONE and the absence would read as a targeting defect`);
}

for (const [slot, key, mustBeMember] of [
  ['member', GROUP_AUDIENCE.memberRole, true],
  ['non-member', GROUP_AUDIENCE.nonMemberRole, false],
]) {
  const r = USER_ROLES.find((x) => x.key === key);
  if (!r) {
    fail(`[10] GROUP_AUDIENCE.${slot === 'member' ? 'memberRole' : 'nonMemberRole'} "${key}" is not declared in scripts/lib/user-roles.mjs — the seeder would resolve no email and could not check the audience at all`);
    continue;
  }
  if (!r.emailVars?.length) fail(`[10] user role ${key} declares no emailVars — its identity cannot be resolved from .env.<ENV>`);
  const declared = r.group ?? null;
  if (mustBeMember && !groupMatches(declared, TARGET_GROUP)) {
    fail(`[10] user role ${key} declares group ${JSON.stringify(declared)}, not ${JSON.stringify(TARGET_GROUP)} — the account nominated as the audience is not declared to be in it`);
  }
  if (!mustBeMember) {
    // A role with NO declared group is not statically provable to be outside the audience, and
    // "probably not VIP" is exactly the assumption that makes a negative control worthless.
    if (declared == null) {
      fail(`[10] user role ${key} declares no group at all, so nothing static can show it is OUTSIDE ${JSON.stringify(TARGET_GROUP)} — a negative control has to be verifiably a non-member, not merely un-annotated`);
    } else if (groupMatches(declared, TARGET_GROUP)) {
      fail(`[10] user role ${key} is declared in ${JSON.stringify(TARGET_GROUP)} — it is the NEGATIVE control, so with it inside the audience "a non-member does not see it" can never fail (LOYALTY_NOBAL_USER is the live example: despite its name it carries groups ["VIP"])`);
    }
  }
}

const targetedFixtures = MISSIONS.filter(isGroupTargeted);
notes.push(
  `targeting x public: ${targetedFixtures.length} fixture(s) target [${TARGET_GROUP}] `
  + `(${targetedFixtures.map((m) => `${m.aliasName}/${m.public ? 'public' : 'private'}`).join(', ')}), `
  + `and ${MISSION_BY_ALIAS.MSN_PUBLISHED_PRIVATE ? 'MSN_PUBLISHED_PRIVATE holds the neutral+private cell' : 'the neutral+private cell is EMPTY'}`,
);
notes.push(`audience: ${GROUP_AUDIENCE.memberRole} (in "${TARGET_GROUP}") vs ${GROUP_AUDIENCE.nonMemberRole} (not) — membership is re-read live and asserted in BOTH directions at seed time`);

/* ── Report ─────────────────────────────────────────────────────────────────── */
console.log(`td:validate:missions — ${MISSIONS.length} missions (${progressFixtures().length} with a declared progress state), ${PERSKU_PRODUCTS.length} PerSku targets, 1 provisioning order, 1 store-settings fixture`);
for (const n of notes) console.log(`  · ${n}`);
for (const w of warnings) console.log(`  ⚠ ${w}`);
if (problems.length) {
  console.error(`\n✗ ${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log('✓ clean');
