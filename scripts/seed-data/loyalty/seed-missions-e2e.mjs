/**
 * seed-missions-e2e.mjs — the per-run test-data foundation for suite 083d (loyalty missions E2E).
 *
 * WHAT IT PROVISIONS, AND THE ONE SENTENCE THAT EXPLAINS THE SHAPE
 * ---------------------------------------------------------------
 * Mission progress is per-(user, mission), cumulative, monotonic, FROZEN once the mission completes,
 * and there is no reset path anywhere in vc-module-loyalty. So the only fixture that starts at 0%
 * every single run is a mission that did not exist before the run started. This seeder mints four,
 * names them with a run handle, and writes the runtime ids to aliases.<env>.json.
 *
 * Rationale, the fixture inventory, and every vacuity rule live in `missions-e2e-specs.mjs` (imported,
 * never restated). This file is the I/O half: resolve -> sweep -> mint -> verify -> write back.
 *
 * ORDER OF OPERATIONS, and why it is this order
 *   1. Guards: ENV_RISK, auth, and the store's `Loyalty.Missions.Enable` READ (never written here —
 *      seed-loyalty-missions.mjs owns that setting and two owners would fight over it).
 *   2. Products: stable, find-or-create, non-tracked, packSize 1, priced, linked, INDEXED. Before the
 *      missions, because a PerSku goal item needs a productId.
 *   3. Sweep: delete E2E missions older than the age floor. Before minting, so a long-lived env does
 *      not accumulate; after the products, so a failure here does not leave a half-built catalog.
 *   4. Mint: four missions carrying this run's handle, plus their goal items.
 *   5. VERIFY, and this is the step whose absence caused the 6-BLOCKED run REG-2026-08-28-1154:
 *      probe live progress for the bound accounts and REFUSE to write an alias for a mission that is
 *      not in a pre-completion state. A fixture that is not usable must fail the seed, not the suite.
 *   6. Reward account: bind to the per-run ephemeral LOYALTY_ZERO_USER, read its live balance, and
 *      assert the reward is legible against it.
 *   7. Write back: every runtime id + every OBSERVED seed-time state into aliases.<env>.json.
 *
 * Usage:
 *   npm run seed:missions-e2e                     # zero-user + this seeder (the normal entry point)
 *   node scripts/seed-data/loyalty/seed-missions-e2e.mjs [--dry-run] [--verbose]
 *   node scripts/seed-data/loyalty/seed-missions-e2e.mjs --teardown [--max-age-hours N] [--all]
 *   ... --keep-products                           # teardown the run's missions, keep the catalog fixtures
 *
 * TEARDOWN is a PREFIX SWEEP with an age floor, not an inline delete of "this run's" ids, because a
 * crashed run leaks its missions and nothing would ever reclaim them. `--max-age-hours` (default 6)
 * spares younger runs so a concurrent 083d execution is never torn down underneath itself; `--all`
 * removes every E2E mission regardless of age and is the deliberate, explicit form.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  ROOT, STORE_ID, BACK_URL, DRY_RUN, TEARDOWN, VERBOSE,
  log, verbose, assertSafeTarget, auth, api,
  ensureVirtualCatalog, ensureCategoryPath, ensureCurrencies, buildStoreSeo, SEED_FAMILY,
  writeEnvAliasOverride, verifyRemoved, idsParam, loadAliases, loadCsv,
} from '../../lib/seed-common.mjs';
import { STORE_SETTING, resolveCurrencies, readingValues } from './missions-specs.mjs';
import {
  createEphemeralAccount, sweepEphemeralAccounts, findEphemeralAccounts, storefrontToken, password,
} from '../../lib/loyalty-ephemeral-account.mjs';
import {
  SEED_PREFIX, PRODUCTS, UNIT_PRODUCT, RUNTIME_FIELDS_BY_KIND,
  MISSIONS, ALL_MISSIONS, MISSION_BY_ALIAS, REWARD_USER, DEFAULT_SWEEP_MAX_AGE_HOURS,
  CASE_MISSIONS, CASE_ACCOUNTS, CASE_ACCOUNT_PREFIX, isCaseMission,
  TARGETING_MISSIONS, isTargetingMission, unreachableTarget, visibilityPolicy, formatVisibility,
  boundAccounts, ACCOUNT_BOUND_MISSIONS, declaredAliases,
  measuredMoney, deriveCaseTarget, attributionProblems, shippingHeadroom, taxRateOf,
  newRunId, missionName, isE2EMissionName, runIdFromName, runIdAgeHours,
  buildE2EMissionBody, buildGoalItems, needsGoalItems, missionSlots,
  isPreCompletion, balanceIsLegible, validateSpecShape,
  unitsToComplete, unitsJustBelow, discountBand,
  absenceIsProven, productTeardownVerdict,
  PRODUCT_INDEX_DOCUMENT_TYPE, buildReindexRequest, indexDocumentTypeProblem,
  FUNDED_ACCOUNTS, PTS_PRODUCT, balanceCoversPtsLine,
} from './missions-e2e-specs.mjs';
import {
  resolveWinningEarning, placeEarnOrder, pollBalanceChange, qtyForTarget, pointsPerUnit,
} from './loyalty-earn.mjs';

const argv = process.argv.slice(2);
const SWEEP_ALL = argv.includes('--all');
const KEEP_PRODUCTS = argv.includes('--keep-products');
/**
 * `--fund-accounts`: provision ONLY the funded (points-spend) account(s) against the run that is
 * ALREADY seeded, and touch nothing else.
 *
 * It exists because the alternative is a full re-seed, which mints a new run handle and discards
 * every measured target of the live one. A running suite is worth more than a tidy code path.
 *
 * The one thing it CANNOT reproduce is the full seed's ordering: the funding order is placed after
 * this run's missions exist, so `ProcessOrderAsync` may leave a progress row on them. That is why the
 * baseline is measured and written rather than assumed — and why the guard fails if the PerSku target
 * comes back already above zero.
 */
const FUND_ONLY = argv.includes('--fund-accounts');
const MAX_AGE_HOURS = argv.includes('--max-age-hours')
  ? Number(argv[argv.indexOf('--max-age-hours') + 1])
  : DEFAULT_SWEEP_MAX_AGE_HOURS;

const CATEGORY_PATH = 'Loyalty Missions E2E';
const PRICELIST_NAME = (currency) => `AGENT-TEST-MSN-E2E-${currency}`;
const slugify = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

let VIRTUAL_CATALOG_ID = null;

/* ── Overlay reads (direct, not through the resolver) ────────────────────────
 *
 * Read raw rather than through `@td()` so the seeder has no dependency on the resolver's own alias
 * contract, and so an absent overlay is an ordinary first-seed state rather than a throw.
 */
function overlay() {
  const env = process.env.TEST_ENV || 'vcst';
  const p = join(ROOT, `test-data/aliases.${env}.json`);
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8')) || {}; } catch { return {}; }
}

/* ── Currencies ──────────────────────────────────────────────────────────────── */

/**
 * Resolve every currency intent this fixture set uses. `store-default` comes from the live store;
 * `loyalty` comes from the committed LOYALTY_SETTINGS alias, which is the repo's declared source of
 * truth for the points currency — never the literal 'PTS', which is per-deployment configuration.
 */
function resolveIntents(store) {
  const base = resolveCurrencies(store);
  const loyalty = String(loadAliases()?.LOYALTY_SETTINGS?.currency_code || '').trim();
  if (!loyalty) {
    throw new Error(
      'LOYALTY_SETTINGS.currency_code is empty in test-data/aliases.json — the PTS-priced PerSku target '
      + '(MSN-E2E-007) has no currency to be priced in, and pricing it in the store default would make the '
      + 'case ask nothing.',
    );
  }
  if (loyalty.toUpperCase() === String(base['store-default']).toUpperCase()) {
    throw new Error(
      `the loyalty currency (${loyalty}) is the store default on this env — MSN-E2E-007 asks whether a `
      + 'NON-default-currency line counts toward a PerSku quantity target, and it cannot ask that here.',
    );
  }
  return { ...base, loyalty };
}

/**
 * Resolve the fixture category, OVERLAY-FIRST.
 *
 * `ensureCategoryPath` finds an existing category through `POST /api/catalog/listentries`, which is
 * INDEX-backed — and category documents on this env are not in that index (a keyword search for a
 * category created minutes earlier returns nothing, measured on vcst-qa 2026-08-28). So the helper
 * believes the category is absent and creates a SECOND one with the same code: run 1 produced
 * 69bfb80d…, run 2 produced 7ab4155a…, and run 2 then re-linked the products under the duplicate
 * while their `categoryId` still pointed at the original. On a seeder that runs on EVERY execution
 * that is one orphaned category per run, quietly.
 *
 * The fix is the same "overlay id first, index second" order `seed-loyalty-missions.mjs` already uses
 * for its zero-stock product: `GET /api/catalog/categories/{id}` is DATABASE-backed and authoritative,
 * so a pinned id resolves whatever the index thinks. `ensureCategoryPath` remains the fallback for a
 * first seed or a cleared overlay — this deliberately does not change the shared helper, whose
 * behaviour every other seeder depends on.
 */
/** The code `ensureCategoryPath` gives this fixture category — derived by its own rule, not transcribed. */
const FIXTURE_CATEGORY_CODE = `${SEED_FAMILY}-${slugify(CATEGORY_PATH)}`;

/**
 * Every category in `catalogId` carrying this fixture's code — usually one, more only when a previous
 * run died between creating it and writing its pin.
 *
 * BROWSE-backed, not keyword-backed, and that difference is the whole point. The shared
 * `findCategoryByCode` searches `listentries` with `keyword: <code>`, which on this env returns
 * nothing for a category however recently it was created — the index gap that made every run mint a
 * duplicate. Dropping the keyword and listing the catalog's categories DOES return them (measured
 * 2026-08-28: 17 categories, including three same-code orphans invisible to the keyword search). The
 * shared helper is deliberately left alone — every other seeder depends on its behaviour.
 */
async function listFixtureCategories(catalogId) {
  if (!catalogId) return [];
  const r = await api('POST', '/api/catalog/listentries', { catalogId, take: 500, objectTypes: ['Category'] }, { expectStatus: [200, 201, 400, 404] }).catch(() => null);
  return (r?.listEntries || r?.results || [])
    .filter((c) => String(c.type).toLowerCase() === 'category' && c.code === FIXTURE_CATEGORY_CODE);
}

async function ensureLocation() {
  const pinned = overlay().MSN_E2E_RUN || {};
  if (pinned.category_id && pinned.catalog_id) {
    const cat = await api('GET', `/api/catalog/categories/${pinned.category_id}`, null, { expectStatus: [200, 404] }).catch(() => null);
    if (cat?.id && cat.catalogId === pinned.catalog_id) {
      log(`  ↻ category (pinned): ${cat.name} (${cat.id})`);
      return { catalogId: cat.catalogId, categoryId: cat.id, name: cat.name, pinned: true };
    }
    verbose(`pinned category ${pinned.category_id} no longer resolves`);
  }
  // SECOND CHANCE before creating anything: a run that died before write-back left a category with no
  // pin, and `ensureCategoryPath` cannot see it. Reuse the oldest match rather than minting another —
  // that is what turns "one orphan per crashed run, forever" into "at most one".
  if (pinned.catalog_id) {
    const existing = await listFixtureCategories(pinned.catalog_id);
    if (existing.length) {
      const reuse = existing[0];
      if (existing.length > 1) log(`  ⚠ ${existing.length} categories share the code ${FIXTURE_CATEGORY_CODE} (orphans from runs that died before write-back) — reusing ${reuse.id}; teardown sweeps them all`);
      log(`  ↻ category (by code): ${reuse.name} (${reuse.id})`);
      return { catalogId: pinned.catalog_id, categoryId: reuse.id, name: reuse.name, pinned: false };
    }
  }
  const loc = await ensureCategoryPath(api, CATEGORY_PATH);
  if (!loc) throw new Error(`could not resolve category path "${CATEGORY_PATH}"`);
  return { ...loc, pinned: false };
}

/* ── Pricelists ──────────────────────────────────────────────────────────────── */

/**
 * One pricelist per currency, assigned to the VIRTUAL catalog — that is the catalog the storefront
 * resolves prices through (a pricelist assigned only to the physical catalog is invisible to it, which
 * renders as an unpriced product and reads as a different defect entirely).
 */
async function ensurePricelist(currency) {
  const name = PRICELIST_NAME(currency);
  const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}`, null, { expectStatus: [200, 404] });
  let pl = (search?.results || []).find((p) => p?.name === name);
  if (pl) { verbose(`pricelist ${name} → ${pl.id}`); return pl; }
  if (DRY_RUN) { log(`  [DRY] would create pricelist ${name} (${currency})`); return { id: `dry-pl-${currency}` }; }
  pl = await api('POST', '/api/pricing/pricelists', {
    name, currency, description: 'suite 083d loyalty-missions E2E fixtures',
  }, { expectStatus: [200, 201] });
  try {
    await api('POST', '/api/pricing/assignments', {
      name: `${name} → ${STORE_ID}`, pricelistId: pl.id, catalogId: VIRTUAL_CATALOG_ID, priority: 100,
    }, { expectStatus: [200, 201] });
  } catch (e) { log(`  ⚠ pricelist ${name} created but its catalog assignment failed: ${String(e.message).slice(0, 140)}`); }
  log(`  ✓ pricelist ${name} (${currency}) → ${pl.id}`);
  return pl;
}

/* ── Products ────────────────────────────────────────────────────────────────── */

/**
 * Does this product EXIST? A DATABASE question, answered with an EXACT criterion.
 *
 * `{ code }` — not `{ keyword }`. The keyword form pages categories and products through one window
 * (categories first), so `take: 10` returned ZERO products for `…PERSKU-A` while the product sat in
 * the database: 21 category hits consumed the whole window. `{ code }` is exact, unpaged, and
 * database-backed — measured returning a product created milliseconds earlier, long before any
 * index saw it. See `absenceIsProven` in the spec module for the full measurement.
 *
 * Still deliberately catalog-BLIND: these codes are `AGENT-TEST-MSN-E2E-` prefixed and globally
 * unique, and the duplicate-key index the create path collides on (`IX_Code_CatalogId`) is per
 * catalog — so finding the row wherever it lives is strictly safer than scoping the search to the
 * catalog we happen to think we are writing to.
 */
async function findProductByCode(code) {
  const r = await api('POST', '/api/catalog/listentries', { code, take: 50 }, { expectStatus: [200, 201, 400, 404] });
  const entries = (r?.listEntries || r?.results || []);
  const hit = entries.find((p) => p.code === code && String(p.type).toLowerCase() === 'product');
  if (hit) return { id: hit.id, code, name: hit.name, catalogId: hit.catalogId };
  // Absence is a CONCLUSION, not a default. An exact criterion earns it; anything that returned
  // fewer rows than it counted has not answered the question and must not be read as "create it".
  if (!absenceIsProven({ criterion: 'code', totalCount: r?.totalCount, returned: entries.length })) {
    throw new Error(
      `catalog lookup for ${code} was inconclusive (totalCount=${r?.totalCount}, returned=${entries.length}) — `
      + 'refusing to treat a truncated response as proof the product does not exist',
    );
  }
  return null;
}

/**
 * Is this product INDEXED? A SEARCH question, and a different one — answered by the indexed product
 * search, addressed by id so no keyword window can truncate it.
 *
 * Kept separate from `findProductByCode` on purpose: now that existence is database-backed, reusing
 * it here would make the index guard pass on every product that merely exists, quietly deleting the
 * one check that stands between "fixtures created" and "fixtures the storefront can actually see".
 */
async function isIndexed(productId) {
  const r = await api('POST', '/api/catalog/search/products', { objectIds: [productId], take: 5 }, { expectStatus: [200, 201, 400] }).catch(() => null);
  return (r?.items || r?.results || []).some((p) => p.id === productId);
}

/**
 * Find-or-create one fixture product, then bring its price, pack size and catalog link to spec.
 *
 * `trackInventory: false` is load-bearing rather than lazy: 083d places real orders on every run
 * forever, so a stock-tracked fixture drains and starts blocking cases for a reason that has nothing
 * to do with missions.
 */
async function ensureProduct(spec, location, pricelistByCurrency, currencies) {
  const currency = currencies[spec.currencyIntent];
  if (!currency) throw new Error(`${spec.aliasName}: currency intent "${spec.currencyIntent}" did not resolve`);
  const pricelist = pricelistByCurrency[currency];
  if (!pricelist?.id) throw new Error(`${spec.aliasName}: no pricelist for ${currency}`);

  let product = await findProductByCode(spec.sku);
  const slug = slugify(spec.sku);
  if (!product) {
    if (DRY_RUN) { log(`  [DRY] would create ${spec.sku} (${spec.productName})`); return { ...spec, id: `dry-${spec.slot}`, catalogId: location.catalogId, currency, slug, url: `/${slug}` }; }
    const created = await api('POST', '/api/catalog/products', {
      catalogId: location.catalogId,
      categoryId: location.categoryId,
      code: spec.sku,
      name: spec.productName,
      productType: 'Physical',
      vendor: 'QA',
      isActive: true,
      isBuyable: true,
      trackInventory: false,
      packSize: spec.packSize,
      minQuantity: 1,
      // A STORE-SCOPED SEO record: `/product/<sku>` does NOT resolve on this storefront (a client-side
      // 404 behind HTTP 200), so without a slug every PDP link in the mission modal is broken and a
      // case cannot tell a broken link from the state it is actually asserting.
      seoInfos: [buildStoreSeo({ semanticUrl: slug, pageTitle: spec.productName })],
    }, { expectStatus: [200, 201] });
    product = { id: created.id, code: spec.sku, name: spec.productName, catalogId: location.catalogId };
    log(`  ✓ created ${spec.sku} → ${product.id}`);
  } else {
    verbose(`${spec.sku} exists → ${product.id}`);
  }

  if (DRY_RUN) return { ...spec, id: product.id, catalogId: product.catalogId, currency, slug, url: `/${slug}` };

  // PACK SIZE, re-asserted every run. This is gap 3: a product whose pack size drifts above 1 makes
  // the stepper jump (0 -> 2 -> 0) and every "set the quantity to exactly 1" step unachievable — and
  // it drifts silently, because the product still exists and still adds to cart.
  const full = await api('GET', `/api/catalog/products/${product.id}`);
  const livePack = Number(full?.packSize ?? 1) || 1;
  if (livePack !== spec.packSize) {
    await api('PUT', '/api/catalog/products', { ...full, packSize: spec.packSize, minQuantity: 1 }, { expectStatus: [200, 204] });
    log(`  ✓ ${spec.sku}: packSize ${livePack} → ${spec.packSize}`);
  }

  await api('PUT', '/api/products/prices', [{
    productId: product.id,
    prices: [{ pricelistId: pricelist.id, productId: product.id, list: spec.listPrice, currency, minQuantity: 1 }],
  }], { expectStatus: [200, 204] });

  // Link under the virtual catalog's category (drop a stale root link first — a product linked at the
  // root and under a category renders twice).
  await api('POST', '/api/catalog/listentrylinks/delete', [{ listEntryId: product.id, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID }], { expectStatus: [200, 204, 404] }).catch(() => {});
  await api('POST', '/api/catalog/listentrylinks', [{ listEntryId: product.id, listEntryType: 'product', catalogId: VIRTUAL_CATALOG_ID, categoryId: location.categoryId }], { expectStatus: [200, 204] });

  const seo = (full?.seoInfos || []).find((s) => s.semanticUrl);
  return {
    ...spec,
    id: product.id,
    catalogId: product.catalogId || location.catalogId,
    currency,
    slug: seo?.semanticUrl || slug,
    url: `/${seo?.semanticUrl || slug}`,
  };
}

/**
 * The storefront resolves products through the SEARCH INDEX, so a product that exists in the database
 * and is not indexed is invisible in the mission modal — created, aliased, guarded, and testing
 * nothing. Incremental (`rebuild: false`), never a full rebuild: on a shared QA env that is somebody
 * else's outage.
 */
async function ensureIndexed(products) {
  if (DRY_RUN) return;
  const byId = new Map(products.map((p) => [p.id, p.sku]));
  const findMissing = async () => {
    const missing = [];
    for (const [id, sku] of byId) if (!(await isIndexed(id))) missing.push({ id, sku });
    return missing;
  };
  let missing = await findMissing();
  if (!missing.length) { verbose('all fixture products already indexed'); return; }

  // Confirm the trigger is even ADDRESSABLE before spending two minutes waiting on it. This is the
  // check that would have saved the three failed runs: the seeder was triggering `CatalogProduct`,
  // which this platform does not register, so every trigger returned 200 + a jobId and indexed
  // nothing — and the guard then blamed the environment for a spelling mistake.
  const registered = await api('GET', '/api/search/indexes', null, { expectStatus: [200] }).catch(() => null);
  const problem = indexDocumentTypeProblem(registered, PRODUCT_INDEX_DOCUMENT_TYPE);
  if (problem) throw new Error(`cannot reindex fixture products: ${problem}`);

  // A trigger whose failure is swallowed is indistinguishable from no trigger at all — which is
  // exactly how the wrong document type survived. Any rejection is fatal here, not a verbose note.
  const reindex = async () => {
    const body = buildReindexRequest([...byId.keys()], PRODUCT_INDEX_DOCUMENT_TYPE);
    const res = await api('POST', '/api/search/indexes/index', body, { expectStatus: [200, 201, 202, 204] });
    verbose(`reindex job ${res?.jobId ?? '(no id)'} for ${byId.size} ${PRODUCT_INDEX_DOCUMENT_TYPE} document(s)`);
    return res;
  };
  log(`  ↻ reindexing ${missing.length} fixture product(s) (${PRODUCT_INDEX_DOCUMENT_TYPE}, by id)`);
  await reindex();

  // Bounded and loud, never a forever loop: on this environment the time-based incremental job is
  // disabled by default and a reindex can be ABANDONED rather than merely delayed (ECL-14.7), so a
  // wait with no ceiling would hang a seed indefinitely. A targeted trigger was measured landing in
  // under 6 s, so ~2 min is generous rather than tight.
  for (let i = 0; i < 12 && missing.length; i++) {
    await new Promise((r) => setTimeout(r, 10000));
    missing = await findMissing();
    if (missing.length && i === 5) await reindex();
  }
  if (missing.length) {
    throw new Error(
      `${missing.map((m) => m.sku).join(', ')} exist but are NOT in the ${PRODUCT_INDEX_DOCUMENT_TYPE} search index `
      + 'after ~2 min, despite an accepted targeted reindex of their own document ids. The storefront resolves '
      + 'mission-modal products through that index, so those rows would simply not render and the fixture would '
      + 'look seeded while testing nothing. This is an ENVIRONMENT finding, not a fixture one — report it.',
    );
  }
  log(`  ✓ all ${byId.size} fixture products indexed`);
}

/* ── Missions ────────────────────────────────────────────────────────────────── */

async function allE2EMissions() {
  const r = await api('POST', '/api/loyalty-missions/search', { take: 500 }, { expectStatus: [200, 201] });
  return (r?.results || []).filter((m) => isE2EMissionName(m.name));
}

async function deleteMissions(ids) {
  if (!ids.length) return;
  await api('DELETE', `/api/loyalty-missions?${idsParam(ids)}`, null, { expectStatus: [200, 204] });
}

/**
 * Remove E2E missions from previous runs. Age-floored so a 083d execution running beside this one is
 * never torn down underneath itself — the same guard, for the same reason, as the ephemeral loyalty
 * user's `--max-age-hours`.
 */
async function sweepStaleMissions({ all = false, maxAgeHours = MAX_AGE_HOURS, exceptRunId = null, now = new Date() } = {}) {
  const live = await allE2EMissions();
  const doomed = [];
  const spared = [];
  for (const m of live) {
    const rid = runIdFromName(m.name);
    if (rid && rid === exceptRunId) continue;
    const age = runIdAgeHours(rid, now);
    // An UNPARSABLE handle is swept only under --all. It cannot be aged, so sweeping it by default
    // would risk deleting a mission a concurrent run just created under a naming change.
    if (all || (age != null && age > maxAgeHours)) doomed.push(m);
    else spared.push({ name: m.name, ageHours: age });
  }
  if (spared.length) log(`  – sparing ${spared.length} mission(s) younger than ${maxAgeHours}h: ${spared.map((s) => s.name).join(', ')}`);
  if (!doomed.length) { log('  – no stale E2E missions to sweep'); return 0; }
  if (DRY_RUN) { log(`  [DRY] would delete ${doomed.length} stale mission(s): ${doomed.map((m) => m.name).join(', ')}`); return doomed.length; }
  await deleteMissions(doomed.map((m) => m.id));
  log(`  ✗ swept ${doomed.length} stale E2E mission(s)`);
  return doomed.length;
}

async function syncGoalItems(spec, missionId, resolvedBySlot) {
  const desired = buildGoalItems(spec, missionId, resolvedBySlot);
  if (!desired.length) return;
  if (DRY_RUN) { log(`  [DRY] would create ${desired.length} goal item(s) for ${spec.aliasName}`); return; }
  // A freshly minted mission has no goal items, so this is a straight create — no reconcile is needed
  // here (unlike the stable seeder, which reuses missions). The UNIQUE (MissionId, ProductId) index
  // therefore cannot be hit.
  for (const row of desired) await api('POST', '/api/loyalty-mission-goal-items', row, { expectStatus: [200, 201] });
  log(`  ✓ ${spec.aliasName}: ${desired.length} goal item(s) → ${missionSlots(spec).join(', ')}`);
}

/* ── Progress + balance verification ─────────────────────────────────────────── */

async function progressByMission(missionIds, userId) {
  if (!missionIds.length || !userId) return new Map();
  const r = await api('POST', '/api/loyalty-mission-progress/search', { missionIds, userId, take: 200 }, { expectStatus: [200, 201] });
  return new Map((r?.results || []).map((p) => [p.missionId, p]));
}

/**
 * The state the STOREFRONT sees, which is a different question from what the admin progress table
 * holds and is the one 083d actually asserts against.
 *
 * Two failures are only visible here. (a) REACHABILITY: a mission can be minted, Published and public
 * and still not come back from `loyaltyMissionProgress` — and a mission the customer-facing query
 * omits blocks every case in the suite while every admin-side check stays green. (b) The customer
 * query reports a mission with NO progress row as `InProgress 0% isStarted=false`, whereas the admin
 * search simply has no row; recording the storefront's own vocabulary means the overlay says what the
 * suite will see rather than what the seeder inferred.
 *
 * Run as admin with an explicit `userId` (the authorization handler allows admin-or-self), so the
 * seeder never needs the customer's password. `cultureName` is required — without it the description
 * resolver throws ARGUMENT_NULL for every item.
 */
/** `/graphql` needs its own bearer; seed-common keeps its admin token private. */
async function gql(query, variables) {
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password', username: process.env.ADMIN, password: process.env.ADMIN_PASSWORD, scope: 'offline_access',
    }),
  });
  if (!res.ok) throw new Error(`graphql token failed: ${res.status}`);
  const token = (await res.json()).access_token;
  const r = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await r.json();
  if (json.errors) throw new Error(`graphql failed: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return json.data;
}

async function customerVisibleMissions(userId, culture = 'en-US') {
  const query = `query($s:String!,$u:String,$c:String){ loyaltyMissionProgress(storeId:$s userId:$u first:200 cultureName:$c){ items {
    missionId name status percentage currentValue targetValue isStarted missionType items { productId currentQuantity targetQuantity } } } }`;
  const data = await gql(query, { s: STORE_ID, u: userId, c: culture });
  return new Map((data?.loyaltyMissionProgress?.items || []).map((i) => [i.missionId, i]));
}

/**
 * Read each fixture product's REAL storefront facts off the xAPI the storefront itself reads — slug,
 * buyability, stock, resolved price — and fail if any of them would block a case.
 *
 * The slug in particular is DERIVED, never composed. The seeder writes a flat `semanticUrl` when it
 * creates the product, but the storefront serves a NESTED path (`<category-slug>/<product-slug>`,
 * measured on vcst-qa 2026-08-28: `seed-loyalty-missions-e2e/agent-test-msn-e2e-unit`). A case
 * navigating a composed `{{FRONT_URL}}/agent-test-msn-e2e-unit` gets a client-side 404 behind HTTP
 * 200 — an SPA soft-404 that a status check cannot detect — so the path has to come from the product
 * resolver rather than from string concatenation (.claude/rules/test-data.md GOLDEN RULE, and the
 * `feedback_never_invent_storefront_routes` rule).
 */
async function resolveStorefrontFacts(products) {
  const query = `query($s:String!,$c:String!,$cu:String!,$id:String!){ product(storeId:$s cultureName:$c currencyCode:$cu id:$id){
    code slug availabilityData{ isBuyable isInStock isActive } price{ list{ amount currency{ code } } } } }`;
  const problems = [];
  const out = [];
  for (const p of products) {
    const data = await gql(query, { s: STORE_ID, c: 'en-US', cu: p.currency, id: p.id });
    const live = data?.product;
    if (!live) { problems.push(`${p.sku}: the storefront product resolver returns nothing for ${p.currency} — no case can add it to a cart`); out.push(p); continue; }
    if (live.availabilityData?.isBuyable !== true) problems.push(`${p.sku}: isBuyable=false — every case that adds it to a cart is blocked`);
    if (live.availabilityData?.isInStock !== true) problems.push(`${p.sku}: isInStock=false despite trackInventory=false — the add-to-cart control renders disabled`);
    const amount = Number(live.price?.list?.amount);
    const code = live.price?.list?.currency?.code;
    if (!(amount > 0)) problems.push(`${p.sku}: the storefront resolves no ${p.currency} price (got ${live.price?.list?.amount}) — the line would render unpriced, which reads as a different defect`);
    else if (amount !== Number(p.listPrice) || String(code) !== String(p.currency)) {
      problems.push(`${p.sku}: the storefront resolves ${amount} ${code} but the fixture declares ${p.listPrice} ${p.currency} — every order-value calculation in 083d is composed from the declared price`);
    }
    if (!live.slug) problems.push(`${p.sku}: the storefront resolves no slug — the PDP link in the mission modal would be broken`);
    out.push({ ...p, slug: live.slug || p.slug, url: `/${String(live.slug || p.slug).replace(/^\/+/, '')}` });
  }
  if (problems.length) throw new Error(`fixture products are not usable from the storefront:\n    ${problems.join('\n    ')}`);
  log(`  ✓ ${out.length} product(s) buyable, priced and slug-resolved on the storefront`);
  return out;
}

/** Live balance via the admin op-log endpoint. Keyed on the SECURITY-ACCOUNT id, not the member id. */
async function readBalance(userId) {
  const r = await api('GET', `/api/loyalty-program-operation-log/balance/${encodeURIComponent(userId)}`, null, { expectStatus: [200, 404] });
  if (typeof r === 'number') return r;
  return Number(r?.balance ?? r?.points ?? r?.amount ?? 0) || 0;
}

/**
 * The per-run zero-balance account, as `seed-loyalty-ephemeral-user.mjs` last left it. NOT provisioned
 * here — a second ephemeral-account provisioner would be a second implementation of a solved problem
 * and the two would drift. `npm run seed:missions-e2e` runs that seeder first.
 */
function rewardAccountFromOverlay() {
  const src = overlay()[REWARD_USER.sourceAlias] || {};
  return {
    email: src.email || '',
    userId: src.securityAccountId || '',
    memberId: src.memberId || '',
  };
}

/* ── Per-case accounts + probe carts ─────────────────────────────────────────
 *
 * WHY THE ACCOUNTS EXIST. `LoyaltyMissionLogicService.ProcessOrderAsync` runs once per order INSERT
 * and advances EVERY mission applicable to that order's user. Progress is keyed per-(user, mission),
 * so four missions on one account are all moved by any one case's order — minting more missions on a
 * shared account multiplies the rows an order touches instead of isolating anything. The account is
 * the axis that isolates, and MSN-E2E-004 already demonstrated it: same mission definition, own
 * account, never contended.
 *
 * WHY THE PROBE CARTS EXIST. Every per-case target has to be placed against quantities the PLATFORM
 * composes, not against `units x listPrice`. vcst-qa applies a 20% tax nothing in this repo had
 * declared, so the modelled `postDiscount` the old fixture published was 8.00 away from the real
 * total — four times the band it was meant to discriminate inside. The seeder therefore builds the
 * case's cart on the case's own account, reads what came back, and derives the target from that.
 */

/** A customer-scoped GraphQL call. Separate from `gql()`, which is the admin one. */
async function customerGql(token, query, variables) {
  const r = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, variables }),
  });
  const json = await r.json();
  if (json.errors) throw new Error(`customer graphql failed: ${JSON.stringify(json.errors).slice(0, 300)}`);
  return json.data;
}

const PROBE_CART_NAME = 'agent-test-msn-e2e-probe';

/**
 * Resolve a CSV-backed coupon ALIAS to the code the storefront actually accepts.
 *
 * The spec module names the alias (`COUPON_20PCT`), never the literal `SUPER` — a coupon code is
 * fixture data that moves, and `.claude/rules/test-data.md` forbids transcribing it. The `@td()`
 * resolver itself is TypeScript and this seeder runs under plain `node`, so the two-field lookup is
 * done here against the same alias definition the resolver reads.
 */
function resolveCouponCode(aliasName) {
  const def = loadAliases()?.[aliasName];
  if (!def) throw new Error(`coupon alias ${aliasName} is not in test-data/aliases.json`);
  if (def.code) return String(def.code);                        // inline form
  // An alias's `file` is resolver-relative and extension-less (`promotions/coupons`); `loadCsv` takes
  // a repo-relative path. Getting this wrong exits(2) inside the helper with a message that names the
  // wrong thing, so the mapping is done explicitly here.
  const rows = loadCsv(`test-data/${def.file}.csv`);
  const [filterCol, filterVal] = Object.entries(def.filter || {})[0] || [];
  const col = def.fields?.code || 'code';
  const row = rows.find((r) => String(r[filterCol]) === String(filterVal));
  if (!row?.[col]) {
    throw new Error(
      `coupon alias ${aliasName} does not resolve to a code (${def.file} where ${filterCol}=${filterVal}). `
      + 'MSN-E2E-005 is sized on the gap between a discounted and an undiscounted cart, so without a real '
      + 'coupon the fixture would be measured against two identical carts and decide nothing.',
    );
  }
  return String(row[col]);
}

const CART_FIELDS = `
  itemsCount
  subTotal{amount} shippingTotal{amount} taxTotal{amount} discountTotal{amount} total{amount}
  coupons{ code isAppliedSuccessfully }
  availableShippingMethods{ code optionName price{amount} }`;

/**
 * Build the exact cart the case will place, read what the platform made of it, then empty it again.
 *
 * The cart is named, not the default one, so a probe can never leave anything in the cart the case
 * itself opens. It is cleared before AND after: before, because a crashed earlier run may have left
 * lines in it; after, because a case that signs in to a non-empty cart is a case debugging someone
 * else's state.
 */
async function measureCart(token, userId, currency, productId, { units, coupon = null }) {
  const ctx = { storeId: STORE_ID, userId, cartName: PROBE_CART_NAME, currencyCode: currency, cultureName: 'en-US', cartType: null };
  const clear = () => customerGql(token, 'mutation($c:InputClearCartType!){ clearCart(command:$c){ id } }', { c: ctx });
  await clear();
  await customerGql(token, 'mutation($c:InputAddItemType!){ addItem(command:$c){ id } }', { c: { ...ctx, productId, quantity: units } });
  if (coupon) {
    await customerGql(token, 'mutation($c:InputAddCouponType!){ addCoupon(command:$c){ id } }', { c: { ...ctx, couponCode: coupon } });
  }
  const q = `query($s:String!,$u:String!,$n:String!,$cu:String!,$c:String!){ cart(storeId:$s userId:$u cartName:$n currencyCode:$cu cultureName:$c){${CART_FIELDS}} }`;
  const cart = (await customerGql(token, q, { s: STORE_ID, u: userId, n: PROBE_CART_NAME, cu: currency, c: 'en-US' })).cart;
  if (!cart || Number(cart.itemsCount) < 1) throw new Error(`probe cart for ${units} unit(s) came back empty — the fixture product is not addable on this account`);
  if (coupon) {
    const applied = (cart.coupons || []).find((c) => String(c.code).toUpperCase() === String(coupon).toUpperCase());
    if (!applied?.isAppliedSuccessfully) {
      throw new Error(
        `coupon ${coupon} did not apply on the probe cart (${JSON.stringify(cart.coupons)}). MSN-E2E-005's `
        + 'whole band is the gap between the discounted and undiscounted totals, so without the discount the '
        + 'fixture would be sized against two identical carts and the case would decide nothing.',
      );
    }
  }
  await clear();
  return cart;
}

/** Mint the per-case accounts, after sweeping stale ones. Age-floored, same reason as the missions. */
async function ensureCaseAccounts({ maxAgeHours = MAX_AGE_HOURS, all = false } = {}) {
  const { removed, spared } = await sweepEphemeralAccounts(api, {
    prefix: CASE_ACCOUNT_PREFIX, maxAgeHours: all ? null : maxAgeHours, dryRun: DRY_RUN, log, verbose,
  });
  if (removed || spared) log(`  – per-case accounts: swept ${removed}, spared ${spared} younger than ${maxAgeHours}h`);

  const accounts = {};
  for (const a of CASE_ACCOUNTS) {
    // withOrg is required: the org supplies the shipping ADDRESSES checkout needs, and a brand-new
    // contact has none — the cart never reaches a decisive place-order state without them.
    //
    // `groups` is what puts the audience half of the targeting pair INSIDE its own audience. Both
    // halves are minted here, seconds apart, into the same org, with the same password, from the same
    // sweep namespace — differing in this one field, which is the only input UserGroupIsCondition
    // reads. That is what makes "the member saw it and the outsider did not" attributable to
    // membership rather than to any of the dozen ways two long-lived shared accounts differ.
    const user = await createEphemeralAccount(api, {
      prefix: CASE_ACCOUNT_PREFIX, storeId: STORE_ID, withOrg: true, groups: a.groups || [],
      lastName: a.caseId.replace(/[^A-Za-z0-9]/g, ''), dryRun: DRY_RUN, log, verbose,
    });
    accounts[a.aliasName] = { ...user, caseId: a.caseId, missionAliases: [...a.missionAliases] };
  }
  return accounts;
}

/* ── Funding a points-SPEND account ──────────────────────────────────────────
 *
 * One account in this set has to BUY the loyalty-currency target, and a points line is refused at
 * place-order unless the balance covers it (LOYALTY_INSUFFICIENT_BALANCE, measured on vcst-qa
 * 2026-09-01). A balance can only be RAISED, by earning on a real order — the loyalty operation log
 * is read-only, confirmed against this platform's own swagger — so funding places one.
 *
 * ORDER MATTERS: this runs BEFORE the run's missions are minted. `ProcessOrderAsync` advances every
 * mission applicable to an order's user, so an earn order placed after minting would put a progress
 * row on the very mission the case is about to watch. Minting afterwards means there is nothing for
 * the funding order to touch.
 *
 * The AMOUNT is not ours to choose (points = program factor x unit price x qty, qty 1 is the floor)
 * and on this store it is large. That is recorded, not fought: nothing this account asserts reads its
 * balance — see the PTS-SPEND block in missions-e2e-specs.mjs for why legibility lives on a second account.
 */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fundAccounts(accounts, { currency, culture = 'en-US' } = {}) {
  if (!currency) throw new Error('fundAccounts needs the store default currency — the earn product is priced in it');
  const funded = FUNDED_ACCOUNTS();
  if (!funded.length) return;
  for (const a of funded) {
    const acct = accounts[a.aliasName];
    if (!acct) throw new Error(`${a.aliasName} is declared as a funded account but was never minted`);
    if (DRY_RUN) { log(`  [DRY] would fund ${a.aliasName} to at least ${a.minPoints} point(s)`); continue; }

    const before = await readBalance(acct.userId);
    if (balanceCoversPtsLine(before, a.minPoints)) {
      acct.balance = before;
      acct.funding = { program: '(already funded)', order: '', perUnit: '' };
      log(`  ✓ ${a.aliasName} already holds ${before} point(s) ≥ ${a.minPoints} — no earn order placed`);
      continue;
    }

    const token = await storefrontToken(BACK_URL, STORE_ID, acct.email, password());
    if (!token) throw new Error(`could not obtain a storefront token for ${acct.email} — cannot fund ${a.aliasName}`);
    // `cultureName` + `currencyCode` are NOT optional in practice. Omitting them made every
    // `product(...)` read come back `INVALID_OPERATION`, which this function can only interpret as
    // "not buyable" — so the seeder reported "no eligible ProductPoints program" while all seven were
    // eligible and the SKU was in stock (measured 2026-09-01). Same ambient-context rule as every
    // other xAPI call in this repo: pass the context, never rely on a default.
    const earnInfo = async (productId) => {
      const d = await customerGql(token, `query { product(id: "${productId}" storeId: "${STORE_ID}" cultureName: "${culture}" currencyCode: "${currency}") { code availabilityData { isBuyable isAvailable availableQuantity } price { actual { amount } } } }`).catch(() => null);
      const p = d?.product;
      const unitPrice = Number(p?.price?.actual?.amount || 0);
      if (!p?.availabilityData?.isBuyable || !p?.availabilityData?.isAvailable || !(unitPrice > 0)) return null;
      return { sku: p.code, productId, unitPrice, availableQuantity: Number(p.availabilityData.availableQuantity ?? 0) };
    };
    const earn = await resolveWinningEarning({
      api, earnInfo, userGroups: acct.observedGroups || [],
      onFallback: (top, used) => log(`  ⚠ top ProductPoints program "${top.name}" has no buyable factor SKU — earning through "${used.name}" (pri ${used.priority})`),
    });
    if (!earn) {
      throw new Error(
        `no eligible ProductPoints program resolves for ${acct.email}, so ${a.aliasName} cannot be funded and `
        + `${a.caseId} would place no order at all. Points have no write API — earning on a real order is the `
        + 'only mechanism (see loyalty-earn.mjs).',
      );
    }
    const perUnit = pointsPerUnit(earn.factor, earn.unitPrice);
    if (!(perUnit > 0)) throw new Error(`the winning earn SKU ${earn.sku} yields ${perUnit} points/unit — funding cannot converge`);
    const qty = qtyForTarget({ remaining: a.minPoints - before, perUnit, available: earn.availableQuantity });
    const order = await placeEarnOrder({
      gql: (query) => customerGql(token, query), storeId: STORE_ID, userId: acct.userId,
      productId: earn.productId, qty, currency, culture,
    });
    const after = await pollBalanceChange({ readBalance, userId: acct.userId, from: before, sleep });
    acct.balance = after;
    acct.funding = { program: `${earn.programName} (pri ${earn.priority}, factor ${earn.factor} × ${earn.unitPrice})`, order, perUnit };
    if (!balanceCoversPtsLine(after, a.minPoints)) {
      throw new Error(
        `${a.aliasName} still holds ${after} point(s) after earn order ${order} (${earn.sku} ×${qty}, ${perUnit}/unit) — `
        + `it needs ${a.minPoints} to buy the ${PTS_PRODUCT.sku} line ${a.caseId} is about. Refusing to publish a `
        + 'fixture whose case would be refused at place-order and would then read untouched seed state as its result.',
      );
    }
    log(`  ✓ ${a.aliasName} funded ${before} → ${after} point(s) via ${earn.sku} ×${qty} (order ${order}; ${perUnit}/unit, floor ${a.minPoints})`);
  }
}

/**
 * Measure every per-case cart and derive every per-case target.
 *
 * Returns `{ [missionAlias]: { money, undiscounted, derived, headroom, shipping, readings } }`.
 * Throws rather than degrading: a target that cannot be placed in a real band means the fixture
 * cannot discriminate, and that must fail the SEED, not the suite.
 */
async function measureCaseCarts(accounts, currency, unitProductId) {
  const out = {};
  // Every mission that owns an account AND declares an order gets its cart measured. For the four
  // sized cases that measurement PLACES the target; for the journey (MSN-E2E-001) the target is an
  // authored count, but the cart still has to be measured because the case ends on a balance delta
  // and that delta is not the mission's own reward on this environment.
  const measured = ACCOUNT_BOUND_MISSIONS.filter((m) => m.order?.units > 0);
  for (const spec of measured) {
    const acct = accounts[boundAccounts(spec)[0]];
    const token = await storefrontToken(BACK_URL, STORE_ID, acct.email, password());
    if (!token) {
      throw new Error(
        `could not obtain a storefront token for ${acct.email} (${spec.caseId}). The account was just created, `
        + 'so this is the status/emailConfirmed/resetpassword sequence failing rather than a credential problem '
        + '— see scripts/lib/loyalty-ephemeral-account.mjs.',
      );
    }
    // The spec names the coupon ALIAS; the cart needs the code it resolves to.
    const couponCode = spec.order.coupon ? resolveCouponCode(spec.order.coupon) : null;
    const base = await measureCart(token, acct.userId, currency, unitProductId, { ...spec.order, coupon: couponCode });
    const money = measuredMoney(base);
    let undiscounted = null;
    if (spec.order.coupon) {
      const plain = await measureCart(token, acct.userId, currency, unitProductId, { units: spec.order.units, coupon: null });
      undiscounted = measuredMoney(plain);
    }
    // A count goal's target is not a money quantity, so only a spec that declares a targetRule has one
    // to derive. The journey's cart is measured all the same — see the comment above the loop.
    const derived = spec.targetRule ? deriveCaseTarget(spec, { base: money, undiscounted }) : null;
    out[spec.aliasName] = {
      money, undiscounted, derived, token,
      shipping: (base.availableShippingMethods || []).map((s) => ({ code: s.code, option: s.optionName, price: Number(s.price?.amount ?? 0) })),
      readings: readingValues(money),
    };
    log(
      `  ✓ ${spec.caseId} cart ${spec.order.units}u${spec.order.coupon ? ` + ${spec.order.coupon}` : ''}: `
      + `sub ${money.grossMerchandise} disc ${money.discountTotal} tax ${money.taxTotal} ship ${money.shippingTotal} `
      + `TOTAL ${money.orderTotal}`
      + (derived ? ` → target ${derived.target} (between ${derived.below} and ${derived.above}, margin ${derived.margin})` : ` (authored count target ${spec.goal.count}, ×${spec.journeyOrders} orders)`),
    );
  }

  // ATTRIBUTION, on the measured numbers rather than the authored intent.
  const derivedByAlias = {};
  const orderTotalByAlias = {};
  for (const spec of CASE_MISSIONS) {
    derivedByAlias[spec.aliasName] = out[spec.aliasName].derived;
    orderTotalByAlias[spec.aliasName] = out[spec.aliasName].money.orderTotal;
  }
  for (const spec of MISSIONS) {
    if (spec.goal?.type === 'OrderValueGoal') derivedByAlias[spec.aliasName] = { target: Number(spec.goal.value) };
  }
  // The star's cells are OrderValueGoal too, and their authored `value` is null because their ceiling
  // is derived. Left unsupplied, `Number(null)` would read as a target of 0 and every sibling order
  // would look like it completes them — manufacturing an attribution failure out of the one design
  // property that guarantees there is none.
  const ceiling = unreachableTarget(Object.values(orderTotalByAlias));
  for (const spec of TARGETING_MISSIONS) derivedByAlias[spec.aliasName] = { target: ceiling };
  const attribution = attributionProblems(derivedByAlias, orderTotalByAlias);
  if (attribution.length) {
    throw new Error(
      `the measured order totals break MSN-E2E-008's reward attribution:\n    ${attribution.join('\n    ')}\n  `
      + 'That case asserts on a balance delta, so a sibling mission granting on the same order makes the delta '
      + 'name nothing. Adjust the per-case order quantities in missions-e2e-specs.mjs.',
    );
  }

  // Shipping headroom, which is what a case needs in order to pick a delivery method.
  const siblingTargets = CASE_MISSIONS
    .filter((s) => s.caseId !== 'MSN-E2E-008')
    .map((s) => out[s.aliasName].derived.target)
    .concat(MISSIONS.filter((s) => s.goal?.type === 'OrderValueGoal').map((s) => Number(s.goal.value)))
    .concat(TARGETING_MISSIONS.map(() => ceiling));
  for (const spec of CASE_MISSIONS) {
    const o = out[spec.aliasName];
    const nearest = spec.caseId === 'MSN-E2E-008'
      ? Math.min(...siblingTargets.filter((t) => t > o.money.orderTotal))
      : null;
    o.headroom = shippingHeadroom(spec, { money: o.money, target: o.derived.target, nearestSiblingTarget: Number.isFinite(nearest) ? nearest : null });
  }
  log(`  Store tax rate (derived from the probe carts): ${(taxRateOf(out[CASE_MISSIONS[0].aliasName].money) * 100).toFixed(1)}%`);
  return out;
}

/**
 * The co-grant set for the JOURNEY, computed once per order rather than once.
 *
 * MSN-E2E-001 places two orders and asserts that the mission paid out when the SECOND one completed
 * it. That delta is only attributable if the one-shot missions the store carries have already fired —
 * and on a fresh account they all fire on order 1. So the two orders are modelled separately, with
 * the cumulative order VALUE and the cumulative order COUNT both advanced between them, and the
 * missions order 1 consumed are excluded from order 2 (a Completed mission stops granting entirely,
 * which was proven on this environment by the MSN_ZEROTARGET control pair on 2026-08-28).
 *
 * Nothing here is assumed: the visible set, each card's type and target, and each reward all come off
 * the live store.
 */
async function journeyCoGrants(userId, orderTotal, ownMissionId, rewardById, orders) {
  const visible = await customerVisibleMissions(userId);
  const perOrder = [];
  const consumed = new Set();
  for (let n = 1; n <= orders; n += 1) {
    const cumulativeValue = orderTotal * n;
    const co = [];
    for (const [missionId, card] of visible) {
      if (missionId === ownMissionId) continue;
      if (consumed.has(missionId)) continue;
      if (String(card.status) === 'Completed') continue;     // already consumed before this run's orders
      const reward = rewardById.get(missionId);
      if (reward == null) continue;
      const target = Number(card.targetValue);
      const type = String(card.missionType || '');
      let completes = false;
      if (/OrderCount/i.test(type)) completes = target <= n;
      else if (/OrderValue/i.test(type)) completes = target <= cumulativeValue;
      // PerSku goals need their own target products, which none of these carts contain.
      if (completes) { co.push({ name: card.name, reward }); consumed.add(missionId); }
    }
    perOrder.push(co);
  }
  return perOrder;
}

/**
 * Which OTHER missions will also grant on this account's planned order — the honest form of
 * MSN-E2E-008's balance arithmetic.
 *
 * A fresh account has consumed none of the store's one-shot missions, so its FIRST order completes
 * MSN_ZEROTARGET (OrderCountGoal 0), every count-1 fixture, and anything else whose target it clears.
 * `BAL_1 - BAL_0 = reward` is therefore false on this environment for any account, and pretending
 * otherwise is how the previous run ended up recording an unattributable 3,110-PTS delta. This
 * computes the set rather than guessing it, and records it so a case can assert against something
 * true.
 */
async function coCompletingMissions(userId, orderTotal, ownMissionId, rewardById) {
  const visible = await customerVisibleMissions(userId);
  const co = [];
  for (const [missionId, card] of visible) {
    if (missionId === ownMissionId) continue;
    if (String(card.status) === 'Completed') continue;       // already consumed — grants nothing again
    const reward = rewardById.get(missionId);
    if (reward == null) continue;
    const target = Number(card.targetValue);
    const type = String(card.missionType || '');
    let willComplete = false;
    if (/OrderCount/i.test(type)) willComplete = target <= 1;               // this order is the account's first
    else if (/OrderValue/i.test(type)) willComplete = target <= orderTotal;
    // PerSku goals need their own target products, which none of these carts contain.
    if (willComplete) co.push({ name: card.name, reward });
  }
  return co;
}

/* ── Seed ────────────────────────────────────────────────────────────────────── */

async function seed() {
  const shape = validateSpecShape();
  if (shape.length) throw new Error(`the committed spec set is incoherent — fix missions-e2e-specs.mjs first:\n    ${shape.join('\n    ')}`);

  const runId = newRunId();
  const now = new Date();
  log(`Run handle: ${runId}`);

  // --- 1. store, gate, currencies -------------------------------------------
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  const missionsSetting = (store.settings || []).find((s) => s.name === STORE_SETTING.missionsSetting) || null;
  const missionsEnabled = missionsSetting == null ? null : (missionsSetting.value == null ? missionsSetting.defaultValue === true : missionsSetting.value === true);
  if (missionsEnabled !== true) {
    // Deliberately NOT flipped here. `seed-loyalty-missions.mjs` owns this setting; a second writer
    // would race it, and a store PUT that loses a required default takes the storefront down
    // (reference_store_required_defaults_null_breaks_frontend).
    throw new Error(
      `${STORE_SETTING.missionsSetting} is ${missionsEnabled} on store ${STORE_ID} — every 083d case reads the `
      + 'missions page and would find nothing. Enable it with `npm run seed:loyalty-missions -- --missions on` '
      + '(that seeder owns the setting; this one deliberately does not write it).',
    );
  }
  const currencies = resolveIntents(store);
  log(`  Currencies: default=${currencies['store-default']}  loyalty=${currencies.loyalty}`);

  // --- 2. catalog + products -------------------------------------------------
  VIRTUAL_CATALOG_ID = await ensureVirtualCatalog(api);
  await ensureCurrencies(api, [...new Set([currencies['store-default'], currencies.loyalty])]);
  const location = await ensureLocation();

  const pricelistByCurrency = {};
  for (const c of new Set(PRODUCTS.map((p) => currencies[p.currencyIntent]))) {
    pricelistByCurrency[c] = await ensurePricelist(c);
  }
  let resolvedProducts = [];
  for (const p of PRODUCTS) resolvedProducts.push(await ensureProduct(p, location, pricelistByCurrency, currencies));
  await ensureIndexed(resolvedProducts);
  // Derive the storefront-facing facts (slug, buyability, resolved price) from the resolver the
  // storefront itself uses — never compose them. See resolveStorefrontFacts.
  if (!DRY_RUN) resolvedProducts = await resolveStorefrontFacts(resolvedProducts);
  const bySlot = Object.fromEntries(resolvedProducts.map((p) => [p.slot, p]));

  // --- 3. sweep --------------------------------------------------------------
  await sweepStaleMissions({ all: SWEEP_ALL, exceptRunId: runId, now });

  // --- 3b. per-case accounts -------------------------------------------------
  // Minted BEFORE the missions because the probe carts that size the per-case targets have to be
  // built on the accounts that will actually place those orders — a cart measured as somebody else
  // could resolve different prices, a different tax and a different coupon eligibility.
  const caseAccounts = await ensureCaseAccounts({ all: SWEEP_ALL });

  // --- 3b-bis. FUND the points-spend account, BEFORE anything is minted ------
  // An earn order advances every mission applicable to its user, so it has to happen while this run
  // has no missions for it to touch. See fundAccounts().
  await fundAccounts(caseAccounts, { currency: currencies['store-default'] });

  // --- 3c. measure the per-case carts and DERIVE their targets ---------------
  let measurements = {};
  if (!DRY_RUN) {
    measurements = await measureCaseCarts(caseAccounts, currencies['store-default'], bySlot[UNIT_PRODUCT.slot].id);
  }

  // --- 4. mint ---------------------------------------------------------------
  const template = await api('GET', '/api/loyalty-missions/new', null, { expectStatus: [200] });
  const minted = {};
  for (const spec of ALL_MISSIONS) {
    // A per-case mission's target is the MEASURED one. The spec deliberately carries `value: null` so
    // that a target can never be published without a measurement behind it.
    const derivedTarget = measurements[spec.aliasName]?.derived?.target;
    // A star cell's ceiling is DERIVED from the largest cart this run measured, not authored — see
    // TARGET_RULES.unreachable. Every cell gets the identical number: three cells differing on their
    // target would stop being a controlled set.
    const starCeiling = unreachableTarget(
      Object.values(measurements).map((m) => m?.money?.orderTotal).filter((v) => Number.isFinite(v)),
    );
    const effective = isCaseMission(spec)
      ? { ...spec, goal: { ...spec.goal, value: DRY_RUN ? 1 : derivedTarget } }
      : isTargetingMission(spec)
        ? { ...spec, goal: { ...spec.goal, value: starCeiling } }
        : spec;
    if (isCaseMission(spec) && !DRY_RUN && !(Number(derivedTarget) > 0)) {
      throw new Error(`${spec.aliasName}: no measured target — refusing to mint a per-case mission against a number nobody computed`);
    }
    const body = buildE2EMissionBody(effective, runId, { template, storeId: STORE_ID, now, currencies });
    if (DRY_RUN) { log(`  [DRY] would create ${body.name} (${spec.goal.type}, reward ${spec.reward})`); minted[spec.aliasName] = { id: `dry-${spec.key}`, name: body.name }; continue; }
    const created = await api('POST', '/api/loyalty-missions', body, { expectStatus: [200, 201] });
    if (!created?.id) throw new Error(`${spec.aliasName}: POST /api/loyalty-missions returned no id`);
    minted[spec.aliasName] = { id: created.id, name: created.name, goalCurrency: spec.goal.currency ? currencies[spec.goal.currency] : '', target: effective.goal.value };
    log(`  ✓ ${spec.aliasName.padEnd(24)} ${created.name}  (${spec.goal.type}${effective.goal.value != null ? ` target ${effective.goal.value}` : ''}, reward ${spec.reward})`);
    if (needsGoalItems(spec)) await syncGoalItems(spec, created.id, bySlot);
  }

  // --- 5. reward account -----------------------------------------------------
  const reward = rewardAccountFromOverlay();
  let balance = null;
  if (!reward.email || !reward.userId) {
    throw new Error(
      `${REWARD_USER.sourceAlias} is not provisioned on this env (email="${reward.email}", account="${reward.userId}"). `
      + 'MSN-E2E-004 asserts the points it spends were EARNED FROM THE MISSION, which needs a balance the reward '
      + 'can visibly dominate. Run `npm run seed:loyalty:zero-user` (or `npm run seed:missions-e2e`, which does both).',
    );
  }
  if (!DRY_RUN) {
    balance = await readBalance(reward.userId);
    const rewardPoints = Number(MISSION_BY_ALIAS[REWARD_USER.rewardAlias].reward);
    if (!balanceIsLegible(balance, rewardPoints)) {
      throw new Error(
        `${REWARD_USER.sourceAlias} (${reward.email}) holds ${balance} PTS against a ${rewardPoints} PTS mission reward. `
        + 'A grant that does not at least double the balance cannot demonstrate that the points spent came FROM the '
        + 'mission — which is the whole thesis of MSN-E2E-004. The balance only ever climbs (no write API exists), so '
        + 'the fix is a fresh account: `npm run seed:loyalty:zero-user`.',
      );
    }
    log(`  ✓ reward account ${reward.email} → ${balance} PTS (reward ${rewardPoints} PTS is legible)`);
  }

  // --- 6. VERIFY pre-completion ---------------------------------------------
  // The step whose absence let run REG-2026-08-28-1154 execute against six Completed missions.
  //
  // Each mission is probed AS THE ACCOUNT THAT WILL DRIVE IT, not as one shared identity. That
  // distinction is the whole point of the per-case split: progress is per-(user, mission), so
  // "MSN_E2E_ORDERVALUE_005 is at 0%" is only a claim about the account 005 signs in as. Probing one
  // account for all of them would re-introduce exactly the assumption this change removes.
  const observed = {};
  const coGrants = {};
  /** Per-mission, per-account visibility as the CUSTOMER query reported it. Recorded, never asserted. */
  const visibility = {};
  /** The journey's co-grant set, one entry per order it places. */
  const journeyGrants = {};
  if (!DRY_RUN) {
    // Reward amounts by mission id, for the co-grant computation below. Read from the admin API
    // rather than assumed, because the store carries missions this repo did not create.
    const allLive = await api('POST', '/api/loyalty-missions/search', { take: 500 }, { expectStatus: [200, 201] });
    const rewardById = new Map();
    for (const m of (allLive?.results || [])) {
      const blocks = m?.dynamicExpression?.children || [];
      const rewardBlock = blocks.find((b) => String(b.id).includes('Reward'));
      const amount = rewardBlock?.children?.[0]?.amount;
      if (amount != null) rewardById.set(m.id, Number(amount));
    }

    // The visible set is read ONCE per account and reused across the missions bound to it. That is not
    // only cheaper: the star's two arms and its control must be judged from the SAME response, or
    // "present" and "absent" could belong to two different moments.
    const visibleByAccount = new Map();
    const seenFor = async (userId) => {
      if (!visibleByAccount.has(userId)) visibleByAccount.set(userId, await customerVisibleMissions(userId));
      return visibleByAccount.get(userId);
    };

    for (const spec of ALL_MISSIONS) {
      // Which identities is this mission read through? A mission that owns account(s) is read through
      // EVERY one of them — for the targeting star that is the whole comparison. The rest keep the
      // per-run reward account, which is still the freshest identity available to them.
      const bound = boundAccounts(spec);
      const accts = bound.length
        ? bound.map((alias) => ({ alias, email: caseAccounts[alias].email, userId: caseAccounts[alias].userId }))
        : [{ alias: REWARD_USER.aliasName, email: reward.email, userId: reward.userId }];
      const id = minted[spec.aliasName].id;
      const bad = [];
      const invisible = [];
      const sightings = {};

      for (const acct of accts) {
        const admin = await progressByMission([id], acct.userId);
        const seen = await seenFor(acct.userId);
        const card = seen.get(id);
        sightings[acct.alias] = Boolean(card);
        // REACHABILITY. A mission the customer-facing query omits blocks every case bound to it while
        // every admin-side check stays green — so for a LOOP mission it is a hard failure of the seed.
        // For a targeting ARM it is the MEASUREMENT, and asserting it would prove the answer by
        // construction; only the star's own CONTROL is asserted, because the control is the instrument
        // that turns an arm's absence into a reading rather than into "we saw nothing".
        if (!card) {
          if (visibilityPolicy(spec) === 'required') invisible.push(`${spec.aliasName} (${missionName(runId, spec.key)}) for ${acct.email}`);
          continue;
        }
        // Prefer the STOREFRONT's own reading. The admin table has no row at all for a mission nobody
        // has ordered against, while the customer query reports that same state as `InProgress 0%
        // isStarted=false` — recording the latter means the overlay says what the suite will see.
        const state = { status: String(card.status), percent: Number(card.percentage) };
        observed[spec.aliasName] = state;
        if (!isPreCompletion(state)) bad.push(`${spec.aliasName} (${card.name}) is already ${state.status} ${state.percent}% for ${acct.email}`);
        // A progress row on a mission minted seconds ago is not merely surprising, it is proof the run
        // handle did not isolate this run.
        if (admin.get(id)) bad.push(`${spec.aliasName} already has a progress row in the admin table — the mission is not new`);
        if (card.isStarted === true) bad.push(`${spec.aliasName} reports isStarted=true on a freshly minted mission`);
        // THE PER-SKU BASELINE, for a funded account. Its case tells "not yet processed" from
        // "processed and correctly excluded", and both readings are currentQuantity 0 — so the seed
        // records what it OBSERVED here and the case asserts a delta against that, instead of
        // comparing a poll to a zero nobody verified. This is the reading the previous fixture
        // mistook for an outcome across seven polls.
        if (caseAccounts[acct.alias]?.funding) {
          const row = (card.items || []).find((it) => it.productId === bySlot[PTS_PRODUCT.slot]?.id) || (card.items || [])[0] || {};
          caseAccounts[acct.alias].ptsBaseline = {
            status: String(card.status),
            isStarted: card.isStarted === true,
            currentQuantity: Number(row.currentQuantity ?? 0),
          };
        }
      }
      visibility[spec.aliasName] = sightings;
      // An arm invisible to EVERY account leaves no seed-time state to record, and an unrecorded state
      // is reported by the guard as "the seeder never verified this fixture" — a different and much
      // louder claim than "the customer cannot see it". Record what the customer query reported.
      if (observed[spec.aliasName] == null) observed[spec.aliasName] = { status: 'NotStarted', percent: 0 };

      if (invisible.length) {
        throw new Error(
          `minted but INVISIBLE to the customer-facing query: ${invisible.join(', ')}.\n  `
          + 'It exists in the admin API, so every "does the fixture exist?" check passes, but /account/missions '
          + 'would not render a card for it and the 083d case bound to it would report a missing mission as a '
          + 'product failure. Check the store\'s Loyalty.Missions.Enable gate and the mission window.',
        );
      }
      if (bad.length) {
        throw new Error(
          `a freshly minted mission is NOT in a clean pre-completion state:\n    ${bad.join('\n    ')}\n  `
          + 'That should be impossible for a mission created seconds ago against a brand-new account — it means the '
          + 'run handle collided or an older mission was reused, and 083d would assert against progress a previous '
          + 'execution already consumed.',
        );
      }

      // The account's balance is READ, never assumed to be zero. It should be zero on an account
      // created seconds ago, and that is exactly why a non-zero reading is worth surfacing rather
      // than papering over — the same discipline as recording the OBSERVED progress state above.
      for (const acct of accts) {
        if (!bound.includes(acct.alias)) continue;
        if (caseAccounts[acct.alias].balance != null) continue;   // read once; the star shares its pair
        const bal = await readBalance(acct.userId);
        caseAccounts[acct.alias].balance = bal;
        if (bal !== 0) {
          log(`  ⚠ ${acct.alias} (${acct.email}) reports ${bal} PTS on a freshly minted account — recorded as observed, not corrected`);
        }
      }

      // CO-GRANT SET, for the one case that asserts on a balance delta. Computed rather than assumed:
      // a fresh account has consumed none of the store's one-shot missions, so its first order grants
      // more than this mission's own reward and `BAL_1 - BAL_0 = reward` is simply false.
      if (isCaseMission(spec) && spec.caseId === 'MSN-E2E-008') {
        const total = measurements[spec.aliasName].money.orderTotal;
        const co = await coCompletingMissions(accts[0].userId, total, id, rewardById);
        coGrants[spec.aliasName] = co;
        const sum = co.reduce((n, c) => n + Number(c.reward), 0) + Number(spec.reward);
        log(`  ℹ ${spec.caseId}: ${co.length} other mission(s) also grant on its order (${co.map((c) => `${c.name} +${c.reward}`).join(', ') || 'none'}) → expected total delta ${sum} PTS, of which ${spec.reward} is this mission's`);
      }

      // THE JOURNEY, PER ORDER. Its own reward lands on the COMPLETING order, so the two orders carry
      // different co-grant sets and only the second is the delta MSN-E2E-001 may assert on.
      if (spec.journeyOrders != null) {
        const total = measurements[spec.aliasName].money.orderTotal;
        const perOrder = await journeyCoGrants(accts[0].userId, total, id, rewardById, Number(spec.journeyOrders));
        journeyGrants[spec.aliasName] = perOrder;
        const first = perOrder[0] || [];
        const last = perOrder[perOrder.length - 1] || [];
        const firstSum = first.reduce((n, c) => n + Number(c.reward), 0);
        const lastSum = last.reduce((n, c) => n + Number(c.reward), 0) + Number(spec.reward);
        log(
          `  ℹ ${spec.caseId}: order 1 grants ${firstSum} PTS from ${first.length} other mission(s) `
          + `(${first.map((c) => `${c.name} +${c.reward}`).join(', ') || 'none'}) and does NOT complete this one; `
          + `order ${spec.journeyOrders} completes it → delta ${lastSum} PTS, of which ${spec.reward} is this mission's`,
        );
      }
    }
    const perCase = CASE_MISSIONS.map((s) => `${s.caseId} ${observed[s.aliasName].status} ${observed[s.aliasName].percent}%`).join(', ');
    log(`  ✓ ${ALL_MISSIONS.length} missions pre-completion — per-case: ${perCase}`);
    // The star's reading, printed rather than judged. This is the one place in the seed where an
    // absence is data instead of an error, so it is worth seeing on every run.
    for (const spec of TARGETING_MISSIONS) {
      log(`  ◦ ${spec.aliasName.padEnd(21)} ${Object.entries(visibility[spec.aliasName] || {}).map(([a, v]) => `${a.replace('MSN_E2E_USER_', '')}=${v ? 'visible' : 'ABSENT'}`).join('  ')}`);
    }
  } else {
    for (const spec of ALL_MISSIONS) {
      observed[spec.aliasName] = { status: 'NotStarted', percent: 0 };
      visibility[spec.aliasName] = Object.fromEntries(boundAccounts(spec).map((a) => [a, true]));
    }
  }

  // --- 7. write back ---------------------------------------------------------
  const ov = MISSION_BY_ALIAS.MSN_E2E_ORDERVALUE;
  const band = discountBand(ov, UNIT_PRODUCT);
  const updates = {
    // The category id is PINNED here so the NEXT run resolves it from the database instead of an
    // index that cannot see it. Without the pin, ensureCategoryPath mints a duplicate category on
    // every single run and silently re-parents the virtual-catalog links onto the newest one.
    MSN_E2E_RUN: {
      run_id: runId, seeded_at: now.toISOString(), store_id: STORE_ID,
      catalog_id: location.catalogId, category_id: location.categoryId,
    },
    [REWARD_USER.aliasName]: {
      email: reward.email, user_id: reward.userId, member_id: reward.memberId,
      balance_at_seed: balance == null ? '' : String(balance),
    },
  };
  const grantList = (co) => (co ? (co.map((c) => `${c.name}=${c.reward}`).join('; ') || 'none') : '');
  const grantSum = (co, own = 0) => (co ? String(co.reduce((n, c) => n + Number(c.reward), 0) + Number(own)) : '');

  for (const spec of MISSIONS) {
    updates[spec.aliasName] = {
      id: minted[spec.aliasName].id,
      name: minted[spec.aliasName].name,
      run_id: runId,
      goal_currency: minted[spec.aliasName].goalCurrency || '',
      progress_status_at_seed: observed[spec.aliasName].status,
      progress_percent_at_seed: String(observed[spec.aliasName].percent),
    };
    // THE JOURNEY carries its measured cart and its PER-ORDER co-grant sets on top. Two orders, two
    // different deltas: order 1 fires every one-shot mission a fresh account has not consumed, order 2
    // completes this mission and is the only delta MSN-E2E-001 may attribute to it.
    if (spec.journeyOrders != null) {
      const m = measurements[spec.aliasName];
      const perOrder = journeyGrants[spec.aliasName] || null;
      const first = perOrder ? perOrder[0] : null;
      const last = perOrder ? perOrder[perOrder.length - 1] : null;
      Object.assign(updates[spec.aliasName], {
        order_shipping_max: m ? (m.headroom == null ? 'unbounded' : String(m.headroom)) : '',
        available_shipping: m ? m.shipping.map((x) => `${x.code}/${x.option}=${x.price}`).join('; ') : '',
        measured_subtotal: m ? String(m.money.grossMerchandise) : '',
        measured_discount: m ? String(m.money.discountTotal) : '',
        measured_tax: m ? String(m.money.taxTotal) : '',
        measured_shipping: m ? String(m.money.shippingTotal) : '',
        measured_total: m ? String(m.money.orderTotal) : '',
        reading_values: m ? Object.entries(m.readings).map(([k, v]) => `${k}=${v}`).join('; ') : '',
        order1_co_missions: grantList(first),
        order1_expected_delta: grantSum(first, 0),
        co_completing_missions: grantList(last),
        reward_expected_total: grantSum(last, spec.reward),
      });
    }
  }

  // THE TARGETING STAR. `observed_visibility` is the only field here that is a MEASUREMENT rather than
  // an identity, and it is the whole point: it records, per account, whether the customer-facing query
  // returned this cell. The seed asserts only the control's reading; the two arms' readings are what
  // MSN-E2E-009 interprets.
  for (const spec of TARGETING_MISSIONS) {
    updates[spec.aliasName] = {
      id: minted[spec.aliasName].id,
      name: minted[spec.aliasName].name,
      run_id: runId,
      goal_currency: minted[spec.aliasName].goalCurrency || '',
      goal_target: String(minted[spec.aliasName].target ?? ''),
      progress_status_at_seed: observed[spec.aliasName].status,
      progress_percent_at_seed: String(observed[spec.aliasName].percent),
      observed_visibility: formatVisibility(visibility[spec.aliasName]),
    };
  }

  // Per-case missions carry, on top of the identity fields, everything the case needs in order to
  // COMPOSE its order from measured facts instead of from a model: the derived target, the two
  // quantities that target separates, the measured cart, what each candidate reading predicts, and
  // how much shipping the order can absorb before the band closes. Every one of these is a number the
  // case currently has to re-derive or guess at.
  for (const spec of CASE_MISSIONS) {
    const m = measurements[spec.aliasName];
    const acct = caseAccounts[spec.accountAlias];
    const co = coGrants[spec.aliasName] || null;
    updates[spec.aliasName] = {
      id: minted[spec.aliasName].id,
      name: minted[spec.aliasName].name,
      run_id: runId,
      goal_currency: minted[spec.aliasName].goalCurrency || '',
      goal_target: m ? String(m.derived.target) : '',
      progress_status_at_seed: observed[spec.aliasName].status,
      progress_percent_at_seed: String(observed[spec.aliasName].percent),
      order_shipping_max: m ? (m.headroom == null ? 'unbounded' : String(m.headroom)) : '',
      available_shipping: m ? m.shipping.map((s) => `${s.code}/${s.option}=${s.price}`).join('; ') : '',
      measured_subtotal: m ? String(m.money.grossMerchandise) : '',
      measured_discount: m ? String(m.money.discountTotal) : '',
      measured_tax: m ? String(m.money.taxTotal) : '',
      measured_shipping: m ? String(m.money.shippingTotal) : '',
      measured_total: m ? String(m.money.orderTotal) : '',
      measured_total_undiscounted: m?.undiscounted ? String(m.undiscounted.orderTotal) : '',
      // The observed "spent" amount on the card names the reading. Recording what each candidate
      // predicts is what lets a case identify it instead of merely noticing a chip did not appear.
      reading_values: m ? Object.entries(m.readings).map(([k, v]) => `${k}=${v}`).join('; ') : '',
      separates_below: m ? String(m.derived.below) : '',
      separates_above: m ? String(m.derived.above) : '',
      separation_margin: m ? String(m.derived.margin) : '',
      co_completing_missions: co ? (co.map((c) => `${c.name}=${c.reward}`).join('; ') || 'none') : '',
      reward_expected_total: co ? String(co.reduce((n, c) => n + Number(c.reward), 0) + Number(spec.reward)) : '',
    };
  }

  // Every per-run account, not only the four sized cases: the journey account and the targeting pair
  // are just as consumable. `groups_at_seed` is READ OFF THE MEMBER rather than echoed from the seed
  // request — member.Groups is the only input UserGroupIsCondition reads, so an echoed value would
  // assert the very membership the targeting pair exists to make falsifiable.
  for (const a of CASE_ACCOUNTS) {
    const acct = caseAccounts[a.aliasName];
    updates[a.aliasName] = {
      email: acct.email, user_id: acct.userId, member_id: acct.memberId, handle: acct.handle,
      balance_at_seed: acct.balance == null ? '' : String(acct.balance),
      groups_at_seed: (acct.observedGroups || []).join('; '),
    };
    // A FUNDED account records the two things its case cannot re-derive: whether it can pay for the
    // line at all, and what the target read BEFORE the case's own order. The provenance fields say
    // where the points came from, because "it has a balance" and "we know why" are different claims.
    if (a.funding) {
      const base = acct.ptsBaseline || {};
      Object.assign(updates[a.aliasName], {
        pts_line_cost: String(a.funding.minPoints()),
        funding_program: acct.funding?.program || '',
        funding_order: acct.funding?.order || '',
        funding_points_per_unit: acct.funding?.perUnit == null ? '' : String(acct.funding.perUnit),
        pts_progress_status_at_seed: base.status || '',
        pts_is_started_at_seed: base.isStarted == null ? '' : String(base.isStarted),
        pts_current_quantity_at_seed: base.currentQuantity == null ? '' : String(base.currentQuantity),
      });
    }
  }

  for (const p of resolvedProducts) {
    updates[p.aliasName] = {
      productId: p.id, catalogId: p.catalogId, currency: p.currency, slug: p.slug, url: p.url,
    };
  }
  if (DRY_RUN) { log(`  [DRY] would write ${Object.keys(updates).length} alias overrides`); }
  else {
    writeEnvAliasOverride(updates);
    log(`  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: ${Object.keys(updates).length} entries`);
  }

  log('');
  log(`Composition arithmetic for 083d (derived, not literals):`);
  log(`  OrderValue target ${ov.goal.value} ${currencies['store-default']} = ${unitsToComplete(ov, UNIT_PRODUCT)} × ${UNIT_PRODUCT.sku} @ ${UNIT_PRODUCT.listPrice}`);
  log(`  just below target : ${unitsJustBelow(ov, UNIT_PRODUCT)} units (${unitsJustBelow(ov, UNIT_PRODUCT) * UNIT_PRODUCT.listPrice})`);
  log(`  discount band     : pre ${band.preDiscount} → post ${band.postDiscount}; shipping headroom ${band.shippingHeadroom}`);
  log(`  storefront        : ${BACK_URL ? '' : ''}/account/missions`);
  log('Done: 083d fixtures provisioned.');
}

/* ── Teardown ────────────────────────────────────────────────────────────────── */

async function deleteProducts() {
  let removed = 0;
  let seenCatalogId = null;
  for (const spec of PRODUCTS) {
    const p = await findProductByCode(spec.sku);
    if (!p?.id) { verbose(`${spec.sku} not present`); continue; }
    seenCatalogId = seenCatalogId || p.catalogId || null;
    if (!String(p.code).startsWith(SEED_PREFIX)) { log(`  ⚠ skip ${p.code}: lacks the ${SEED_PREFIX} guard prefix`); continue; }
    if (DRY_RUN) { log(`  [DRY] would delete product ${spec.sku}`); continue; }
    await api('POST', '/api/catalog/listentries/delete', { objectIds: [p.id], objectType: 'CatalogProduct' }, { expectStatus: [200, 204, 404] })
      .catch((e) => log(`  ⚠ delete ${spec.sku}: ${String(e.message).slice(0, 120)}`));
    removed += 1;
  }
  if (removed) log(`  ✗ deleted ${removed} fixture product(s)`);
  if (DRY_RUN) return seenCatalogId;

  // Residue is verified over the set the CREATE path produces — every `PRODUCTS` sku — and never
  // over "whatever the delete loop happened to find". Those were the same list before, which is
  // precisely why the old check could not fail: it re-asked the delete loop's own blind lookup and
  // agreed with it. A product this seeder creates that is still in the database is residue, and
  // that is a hard failure, not a warning — the next seed dies on it with a duplicate-key 500.
  const stillPresentByCode = {};
  await verifyRemoved(async () => {
    const left = [];
    for (const spec of PRODUCTS) {
      const p = await findProductByCode(spec.sku);
      if (p?.id) { stillPresentByCode[spec.sku] = p.id; left.push(p.id); }
    }
    return left;
  });
  const verdict = productTeardownVerdict({ specs: PRODUCTS, stillPresentByCode, criterion: 'code' });
  if (verdict.ok) { log(`  ✓ product teardown verified — zero residue (${verdict.checked.length} checked)`); return seenCatalogId; }
  for (const sku of verdict.residue) log(`  ✗ RESIDUE ${sku} → ${stillPresentByCode[sku]}`);
  throw new Error(
    `product teardown left residue: ${verdict.reason}. Delete these by id before re-seeding — `
    + 'a surviving product makes the next seed fail with "Cannot insert duplicate key row ... IX_Code_CatalogId".',
  );
}

/**
 * Remove the two pricelists and the fixture category this seeder creates. Both are guarded by an
 * EXACT name/code match, and both are uniquely ours — no other seeder uses this category path or
 * these pricelist names.
 *
 * The category matters more than it looks. `ensureCategoryPath` cannot find it again (its lookup is
 * index-backed and categories are not indexed on this env), so leaving it behind while blanking the
 * overlay pin means the NEXT seed mints a duplicate — `td:reconcile` [6] is currently reporting
 * exactly that residue for the older `AGENT-TEST-SEED-loyalty-fixtures` fixture, which is the same
 * bug in another seeder. Deleting it is what makes teardown -> seed idempotent rather than
 * accumulating.
 */
async function deleteCatalogScaffolding(catalogIdHint = null) {
  for (const currency of ['USD', 'PTS', ...new Set(PRODUCTS.map((p) => p.currencyIntent))]) {
    const name = PRICELIST_NAME(currency);
    const search = await api('GET', `/api/pricing/pricelists?keyword=${encodeURIComponent(name)}&take=100`, null, { expectStatus: [200, 404] }).catch(() => null);
    // EVERY pricelist carrying this exact name, not the first one. The name is deterministic, so a
    // run that died after creating its pricelists leaves another same-named generation behind — and
    // a `.find()` sweep reclaims exactly one per teardown while the failed runs add one each. Three
    // generations of `AGENT-TEST-MSN-E2E-USD`/`-PTS` had accumulated by 2026-09-01 for that reason.
    const pls = (search?.results || []).filter((p) => p?.name === name && p?.id);
    if (!pls.length) continue;
    if (DRY_RUN) { log(`  [DRY] would delete ${pls.length} pricelist(s) named ${name}`); continue; }
    if (pls.length > 1) log(`  ⚠ ${pls.length} pricelists share the name ${name} (orphans from runs that died mid-seed) — removing all`);
    await api('DELETE', `/api/pricing/pricelists?${idsParam(pls.map((p) => p.id))}`, null, { expectStatus: [200, 204, 404] })
      .catch((e) => log(`  ⚠ pricelist ${name}: ${String(e.message).slice(0, 120)}`));
    log(`  ✗ deleted ${pls.length} pricelist(s) named ${name}`);
  }

  // Categories are swept BY CODE, not just by the pin. The pin only ever names the category of the
  // last SUCCESSFUL run; a run that died between creating one and writing its pin leaves an orphan
  // that neither the pin nor the keyword-backed lookup can see, so deleting only the pinned one made
  // the residue permanent and monotonically growing (three had accumulated by 2026-08-28).
  const pin = overlay().MSN_E2E_RUN || {};
  // The pin is blanked by a previous teardown, so on the run that has to clean up after a failed
  // seed it is exactly the thing that is missing — and a blank pin used to make the category sweep a
  // silent no-op, leaving orphan categories behind. Each of those is itself a keyword hit, which is
  // what grew the search window that hid `PERSKU-A` from teardown in the first place. Fall back to
  // the catalog a surviving fixture product actually lives in: derived from live data, never pinned.
  const catalogId = pin.catalog_id || catalogIdHint;
  if (!catalogId) { verbose('no catalog id (no pin, no fixture product seen this teardown) — category sweep skipped'); return; }
  if (!pin.catalog_id) verbose(`catalog id derived from a swept fixture product: ${catalogId}`);
  const targets = new Map();
  for (const c of await listFixtureCategories(catalogId)) targets.set(c.id, c.code);
  if (pin.category_id && !targets.has(pin.category_id)) {
    const cat = await api('GET', `/api/catalog/categories/${pin.category_id}`, null, { expectStatus: [200, 404] }).catch(() => null);
    if (cat?.id) targets.set(cat.id, cat.code);
  }
  if (!targets.size) { verbose('no fixture category to remove'); return; }

  for (const [id, code] of targets) {
    // The prefix guard stands whatever the enumeration returned — this is the only thing standing
    // between a code typo and deleting somebody else's category.
    if (!String(code || '').startsWith(`${SEED_FAMILY}-`)) { log(`  ⚠ skip category ${code}: lacks the ${SEED_FAMILY}- guard prefix — refusing to delete`); continue; }
    if (DRY_RUN) { log(`  [DRY] would delete category ${code} (${id})`); continue; }
    await api('POST', '/api/catalog/listentries/delete', { objectIds: [id], objectType: 'Category' }, { expectStatus: [200, 204, 404] })
      .catch((e) => log(`  ⚠ category ${code}: ${String(e.message).slice(0, 120)}`));
    const back = await api('GET', `/api/catalog/categories/${id}`, null, { expectStatus: [200, 404] }).catch(() => null);
    log(back?.id ? `  ⚠ category ${code} (${id}) still present` : `  ✗ deleted category ${code} (${id})`);
  }
}

async function teardown() {
  log(`Teardown: E2E missions ${SWEEP_ALL ? '(ALL)' : `older than ${MAX_AGE_HOURS}h`}${KEEP_PRODUCTS ? ', products kept' : ' + products'}`);
  await sweepStaleMissions({ all: SWEEP_ALL, maxAgeHours: MAX_AGE_HOURS });

  // The per-case accounts are swept on the SAME age floor as the missions they isolate, because they
  // are two halves of one fixture: an account without its mission cannot start a case at 0%, and a
  // mission without its account is contended again the moment two cases fall back to a shared login.
  // Sweeping one and sparing the other would leave a set that still resolves and no longer works.
  const acct = await sweepEphemeralAccounts(api, {
    prefix: CASE_ACCOUNT_PREFIX, maxAgeHours: SWEEP_ALL ? null : MAX_AGE_HOURS, dryRun: DRY_RUN, log, verbose,
  });
  log(`  ✗ per-case accounts: swept ${acct.removed}${acct.spared ? `, spared ${acct.spared} younger than ${MAX_AGE_HOURS}h` : ''}`);
  const acctResidual = await verifyRemoved(async () => {
    const left = await findEphemeralAccounts(api, CASE_ACCOUNT_PREFIX);
    return SWEEP_ALL ? left.map((u) => u.id || u.userName) : [];
  });
  log(acctResidual === 0 ? '  ✓ per-case account teardown verified — zero residue' : `  ⚠ per-case account teardown incomplete — ${acctResidual} still present`);
  const residual = await verifyRemoved(async () => {
    const live = await allE2EMissions();
    return SWEEP_ALL ? live.map((m) => m.id) : live.filter((m) => (runIdAgeHours(runIdFromName(m.name)) ?? 0) > MAX_AGE_HOURS).map((m) => m.id);
  });
  log(residual === 0 ? '  ✓ mission teardown verified — zero residue' : `  ⚠ mission teardown incomplete — ${residual} still present`);

  if (!KEEP_PRODUCTS) {
    const seenCatalogId = await deleteProducts();
    await deleteCatalogScaffolding(seenCatalogId);
  }

  // Blank the overlay. A dead identity left behind is worse than an empty one: `@td(MSN_E2E_*.id)`
  // would keep resolving to a mission that no longer exists, and the case reads the miss as a product
  // failure rather than as unseeded data.
  if (DRY_RUN) { log('  [DRY] would blank the MSN_E2E_* overlay entries'); return; }
  // The catalog/category pin survives a mission-only teardown: it is the thing that stops the next
  // seed minting a duplicate category, so it is cleared only when the products go with it.
  //
  // EVERY runtime field of EVERY declared alias, derived from the declaration rather than from a
  // hand-kept per-kind list. The list form had already gone stale once: it blanked `mission`,
  // `caseMission` and `caseUser` and named no kind for the targeting star, so the star's ids and its
  // recorded visibility would have survived a teardown — and the next `td:validate:missions-e2e` would
  // have read one run's reading against another run's missions and called it clean. A second list of
  // what to blank is how a new field comes to outlive the fixture it describes.
  const blanks = {};
  for (const { aliasName, kind } of declaredAliases()) {
    const fields = RUNTIME_FIELDS_BY_KIND[kind];
    if (!fields) throw new Error(`teardown cannot blank ${aliasName}: kind "${kind}" declares no runtime fields`);
    blanks[aliasName] = Object.fromEntries(fields.map((f) => [f, '']));
  }
  // Two deliberate exceptions, both about what a mission-only teardown must NOT destroy.
  //
  // The catalog/category PIN survives `--keep-products`: it is the only thing that stops the next seed
  // minting a duplicate category (ensureCategoryPath resolves through an index that does not carry
  // categories on this env), and the products it points at are still there.
  if (KEEP_PRODUCTS) {
    delete blanks.MSN_E2E_RUN.catalog_id;
    delete blanks.MSN_E2E_RUN.category_id;
    for (const prod of PRODUCTS) delete blanks[prod.aliasName];
  }
  writeEnvAliasOverride(blanks);
  log(`  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: MSN_E2E_* entries blanked`);
}

/* ── `--fund-accounts`: provision only the funded account(s), in place ───────── */

async function fundOnly() {
  const funded = FUNDED_ACCOUNTS();
  if (!funded.length) { log('No funded accounts are declared — nothing to do.'); return; }
  const o = overlay();
  const runId = String(o.MSN_E2E_RUN?.run_id || '');
  if (!runId) throw new Error('this env has never been seeded (MSN_E2E_RUN.run_id is empty) — run the full `npm run seed:missions-e2e` instead');
  log(`Funding against the seeded run ${runId} (missions are NOT re-minted).`);

  const accounts = {};
  for (const a of funded) {
    const existing = o[a.aliasName] || {};
    if (existing.email && existing.user_id) {
      accounts[a.aliasName] = { email: existing.email, userId: existing.user_id, memberId: existing.member_id, handle: existing.handle, observedGroups: [] };
      log(`  ↻ ${a.aliasName} already minted: ${existing.email}`);
      continue;
    }
    // Deliberately NOT via ensureCaseAccounts: that sweeps the whole namespace, which would delete
    // the other per-run accounts of the live run out from under a suite that is using them.
    const user = await createEphemeralAccount(api, {
      prefix: CASE_ACCOUNT_PREFIX, storeId: STORE_ID, withOrg: true, groups: a.groups || [],
      lastName: a.caseId.replace(/[^A-Za-z0-9]/g, ''), dryRun: DRY_RUN, log, verbose,
    });
    accounts[a.aliasName] = { ...user, observedGroups: a.groups || [] };
  }

  // The earn product is priced in the store default currency, and that is READ off the store rather
  // than assumed to be USD — the same rule the full seed follows.
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`);
  await fundAccounts(accounts, { currency: resolveIntents(store)['store-default'] });
  if (DRY_RUN) { log('[DRY] no funding order placed, no overlay written.'); return; }

  const updates = {};
  for (const a of funded) {
    const acct = accounts[a.aliasName];
    // The baseline, read from the storefront's own query against THIS run's mission.
    const baseline = {};
    for (const alias of a.missionAliases) {
      const missionId = o[alias]?.id;
      if (!missionId) throw new Error(`${alias} has no id in the overlay — the seeded run does not carry the mission ${a.caseId} needs`);
      const card = (await customerVisibleMissions(acct.userId)).get(missionId);
      if (!card) {
        throw new Error(
          `${alias} (${o[alias]?.name}) is not visible to ${acct.email} through the customer-facing query, so `
          + `${a.caseId} would find no card at all. That is a broken instrument, not a reading.`,
        );
      }
      const ptsProductId = o[PTS_PRODUCT.aliasName]?.productId;
      const row = (card.items || []).find((it) => it.productId === ptsProductId) || (card.items || [])[0] || {};
      baseline.status = String(card.status);
      baseline.isStarted = card.isStarted === true;
      baseline.currentQuantity = Number(row.currentQuantity ?? 0);
    }
    log(`  ◦ ${a.aliasName} baseline on ${a.missionAliases.join('/')}: ${baseline.status}, isStarted=${baseline.isStarted}, currentQuantity=${baseline.currentQuantity}`);
    updates[a.aliasName] = {
      email: acct.email, user_id: acct.userId, member_id: acct.memberId, handle: acct.handle,
      balance_at_seed: acct.balance == null ? '' : String(acct.balance),
      groups_at_seed: (acct.observedGroups || []).join('; '),
      pts_line_cost: String(a.funding.minPoints()),
      funding_program: acct.funding?.program || '',
      funding_order: acct.funding?.order || '',
      funding_points_per_unit: acct.funding?.perUnit == null ? '' : String(acct.funding.perUnit),
      pts_progress_status_at_seed: baseline.status || '',
      pts_is_started_at_seed: baseline.isStarted == null ? '' : String(baseline.isStarted),
      pts_current_quantity_at_seed: baseline.currentQuantity == null ? '' : String(baseline.currentQuantity),
    };
  }
  writeEnvAliasOverride(updates);
  log(`  ✓ aliases.${process.env.TEST_ENV || 'vcst'}.json: ${Object.keys(updates).join(', ')}`);
}

(async () => {
  console.log(`🎯 Seed Loyalty Missions E2E (083d)${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}${FUND_ONLY ? ' [FUND ACCOUNTS ONLY]' : ''}`);
  assertSafeTarget();
  await auth();
  if (TEARDOWN) await teardown();
  else if (FUND_ONLY) await fundOnly();
  else await seed();
})().catch((e) => { console.error('FAILED:', e.message); if (VERBOSE) console.error(e.stack); process.exit(1); });
