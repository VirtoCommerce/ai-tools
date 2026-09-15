#!/usr/bin/env node
/**
 * seed-multiorg-loyalty-balance.mjs — fund BOTH organizations of the frontend-lane multi-org
 * account to DIFFERENT non-zero pools, and its own user scope to a third, so LOYORG-E2E-003
 * (suite 083e) can decide what it asks.
 *
 * The rationale, the fixture inventory, the divergence rules and the limits this set cannot
 * express all live in `multiorg-balance-specs.mjs` (imported, never restated here).
 *
 * WHAT IT DOES
 *   1. Reads the store's `Loyalty.LoyaltyBalanceCalculationMode` and remembers it.
 *   2. Flips the store to "Organization", then places ONE real order per organization — each
 *      under a token minted with that organization's `organization_id` claim, because the loyalty
 *      handler reads `order.OrganizationId` and nothing else.
 *   3. Flips to "Customer" and places ONE real order for the account's own user scope.
 *   4. RESTORES the mode it found, in a `finally`, whatever happened.
 *   5. Reads all three balances back, refuses to record a non-discriminating triple, and writes
 *      the figures to `aliases.<env>.json` so a case can assert RELATIVELY.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 *   • It NEVER writes a membership, a role, a lock state, a contact or an organization record. It
 *     places orders. TechFlow's locked membership is load-bearing for the impersonation suite and
 *     both organizations are shared, mutable state other lanes read.
 *   • It never invents a balance. There is no balance-write API on this platform, so the only
 *     mechanism is a real order — which means this seeder is NOT idempotent by value. It is
 *     idempotent by FLOOR: a pool that already holds a discriminating figure is left alone.
 *
 * THE ORDERS ARE REAL AND NON-REVERSIBLE. Three of them, one per pool, and each is skipped when
 * its pool is already funded. Teardown cannot un-earn — see `--teardown` below.
 *
 * Usage:
 *   TEST_ENV=vcst node scripts/seed-data/loyalty/seed-multiorg-loyalty-balance.mjs --dry-run --verbose
 *   TEST_ENV=vcst node scripts/seed-data/loyalty/seed-multiorg-loyalty-balance.mjs
 *   TEST_ENV=vcst node scripts/seed-data/loyalty/seed-multiorg-loyalty-balance.mjs --only TECHFLOW
 *   TEST_ENV=vcst node scripts/seed-data/loyalty/seed-multiorg-loyalty-balance.mjs --refresh   # re-read + re-record, place nothing
 *   TEST_ENV=vcst node scripts/seed-data/loyalty/seed-multiorg-loyalty-balance.mjs --teardown  # blanks the aliases; CANNOT un-earn
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  assertSafeTarget, auth, api, log, verbose, loadAliases, writeEnvAliasOverride,
  DRY_RUN, VERBOSE, TEARDOWN, STORE_ID, BACK_URL, ROOT,
} from '../../lib/seed-common.mjs';
import {
  resolveWinningEarning, placeEarnOrder, pollBalanceChange, pointsPerUnit, readLoyaltyBalance,
} from './loyalty-earn.mjs';
import { newHandle } from '../../lib/loyalty-ephemeral-account.mjs';
import {
  ACTOR_ALIAS, POOL_ALIAS, POOLS, ORG_POOLS, poolByKey, RUNTIME_ALIAS_FIELDS,
  MODE_SETTING, MODE_ORGANIZATION, MODE_CUSTOMER, MODE_AMBIENT_DEFAULT,
  planProblems, divergenceProblems, chooseUserQty, seededStateProblems,
} from './multiorg-balance-specs.mjs';

const argv = process.argv.slice(2);
const argVal = (flag, dflt = null) => (argv.includes(flag) ? argv[argv.indexOf(flag) + 1] : dflt);
const REFRESH = argv.includes('--refresh');
const ONLY = argVal('--only');
const ONLY_SET = ONLY ? new Set(ONLY.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)) : null;
const inScope = (pool) => !ONLY_SET || ONLY_SET.has(pool.key);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ── the actor, resolved the way the resolver does: env overlay layered over the committed base ──
 * Never off one layer. The business keys (email, the two pinned org ids) are committed; the
 * runtime `userId` lives only in aliases.<env>.json, so reading either file alone yields a
 * confident half-answer. */
function resolveActor() {
  const base = loadAliases()[ACTOR_ALIAS];
  if (!base) throw new Error(`${ACTOR_ALIAS} is not registered in test-data/aliases.json`);
  const env = process.env.TEST_ENV || 'vcst';
  const overlayPath = join(ROOT, `test-data/aliases.${env}.json`);
  const overlay = existsSync(overlayPath) ? (JSON.parse(readFileSync(overlayPath, 'utf8'))[ACTOR_ALIAS] || {}) : {};
  const actor = { ...base, ...overlay };
  const missing = ['email', 'userId', 'org_techflow_id', 'org_buildright_id'].filter((k) => !String(actor[k] || '').trim());
  if (missing.length) {
    throw new Error(`${ACTOR_ALIAS} is missing ${missing.join(', ')} on ${env}. `
      + 'Seed the cross-org fixture first: '
      + `TEST_ENV=${env} node scripts/seed-data/b2b/seed-company-users.mjs cross-org --only ${ACTOR_ALIAS}`);
  }
  return actor;
}

/**
 * The actor's password, resolved through `process.env` after the layered loader has run.
 *
 * Never a literal and never read off one .env layer: the alias declares `{{DEFAULT_TEST_PASSWORD}}`
 * and the real value lives only in `.env.local` (gitignored) + the team secret store.
 */
function actorPassword(actor) {
  const token = String(actor.password || '').trim();
  const m = /^\{\{\s*([A-Z0-9_]+)\s*\}\}$/.exec(token);
  if (!m) {
    throw new Error(`${ACTOR_ALIAS}.password is not a {{VAR}} token (got "${token}"). `
      + 'A committed password literal is a secret-hygiene failure (td:reconcile) — fix the alias, not this script.');
  }
  const value = process.env[m[1]];
  if (!value) {
    throw new Error(`${m[1]} is unset. It is a SECRET: it lives in .env.local (gitignored) and the team secret store, `
      + 'never in a committed env file. Resolve it through process.env after config/seed-common has loaded the layers.');
  }
  return value;
}

/* ── tokens ──────────────────────────────────────────────────────────────────────────────────
 * `organization_id` (snake_case) alongside `storeId` (camelCase) is what mints an ORG-SCOPED
 * customer token. That claim is the entire steering mechanism: the storefront cart inherits it as
 * `cart.organizationId`, the order inherits it from the cart, and `LoyaltyProgramHandler` reads
 * `order.OrganizationId` and nothing else. A grant without `storeId` is refused outright. */
async function storefrontToken(actor, organizationId = null) {
  const body = new URLSearchParams({
    grant_type: 'password', username: actor.email, password: actorPassword(actor),
    scope: 'offline_access', storeId: STORE_ID,
  });
  if (organizationId) body.set('organization_id', organizationId);
  const res = await fetch(`${BACK_URL}/connect/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await res.json().catch(() => null);
  if (!j?.access_token) {
    throw new Error(`token grant failed for ${actor.email}${organizationId ? ` (org ${organizationId})` : ''}: `
      + `${res.status} ${JSON.stringify(j).slice(0, 200)}`);
  }
  return j.access_token;
}

async function gqlAs(token, query, label) {
  const res = await fetch(`${BACK_URL}/graphql`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  const j = await res.json().catch(() => ({}));
  if (j.errors?.length) throw new Error(`${label}: ${JSON.stringify(j.errors).slice(0, 300)}`);
  verbose(`gql ${label} ok`);
  return j.data;
}

/* ── store mode ──────────────────────────────────────────────────────────────────────────────
 * Whole-entity GET-merge-PUT /api/stores, verified by READ-BACK.
 *
 * NOT /api/platform/settings*: that endpoint answers 204 and silently no-ops on this build, so a
 * caller that trusts the status code believes it flipped the mode and then earns into the wrong
 * scope with nothing objecting. And a whole-entity PUT REPLACES, so the store is read, ONE setting
 * is changed in place, and the whole object goes back — never a synthesised partial body. */
async function readStoreMode() {
  const store = await api('GET', `/api/stores/${encodeURIComponent(STORE_ID)}`, null, { expectStatus: [200] });
  const setting = (store.settings || []).find((s) => s.name === MODE_SETTING);
  if (!setting) {
    throw new Error(`store ${STORE_ID} exposes no ${MODE_SETTING} setting. This build does not have the `
      + 'organization-balance feature (vc-module-loyalty PR #17) — there is no organization pool to fund.');
  }
  return { store, value: String(setting.value ?? '') };
}

async function setStoreMode(value) {
  const { store, value: current } = await readStoreMode();
  if (current === value) { log(`  store mode already "${value}" — no write`); return value; }
  if (DRY_RUN) { log(`  [DRY] would set ${MODE_SETTING}: "${current}" → "${value}"`); return value; }
  store.settings = (store.settings || []).map((s) => (s.name === MODE_SETTING ? { ...s, value } : s));
  await api('PUT', '/api/stores', store, { expectStatus: [200, 201, 204] });
  const after = (await readStoreMode()).value;
  if (after !== value) {
    throw new Error(`${MODE_SETTING} did not take: asked for "${value}", the store reads back "${after}". `
      + 'Effectiveness is verified by read-back, never by a status code.');
  }
  log(`  ✓ ${MODE_SETTING}: "${current}" → "${after}" (verified by read-back)`);
  return after;
}

/* ── balances ────────────────────────────────────────────────────────────────────────────────
 * A user-scope read is `UserId == x && OrganizationId == null`; an organization-scope read is
 * `OrganizationId == x`, any user. Neither sums — each returns the running total stored on the
 * most recent matching row. So the two scopes are genuinely independent ledgers, which is the
 * property this whole fixture depends on. */
let sourceSeen = new Set();
async function readPool(pool, actor) {
  const args = pool.scope === 'organization'
    ? { organizationId: actor[pool.actorOrgField] }
    : { userId: actor.userId };
  const { balance, source } = await readLoyaltyBalance(api, args);
  if (!sourceSeen.has(source)) { sourceSeen.add(source); verbose(`balance source (${pool.scope}): ${source}`); }
  return Number(balance ?? 0);
}

async function readAll(actor) {
  const out = {};
  for (const p of POOLS) out[p.key] = await readPool(p, actor);
  return out;
}

/* ── earning ─────────────────────────────────────────────────────────────────────────────── */

/**
 * Place ONE real order into a named pool, gated BEFORE anything irreversible happens on whatever
 * property actually decides which pool it lands in.
 *
 * For an ORGANIZATION pool that property is the cart's `organizationId`, because the order inherits
 * it and the loyalty handler reads `order.OrganizationId` and nothing else. A cart is resolved by
 * (userId, storeId, cartName, currency) and keeps the organization it was CREATED under, so a
 * reused cart hands a caller the other organization's context and funds the wrong pool with no
 * error anywhere. Hence a per-run, per-pool cart name AND an exact-match assertion.
 *
 * For the USER pool that property is the STORE MODE, not the cart. A Customer-mode earn never
 * copies `order.OrganizationId` onto the ledger row, so the row is user-keyed whatever organization
 * the cart carries — and it always carries one, because a token grant for a multi-org account falls
 * back to the contact's own organization even when `organization_id` is omitted. Asserting the
 * cart's organization here would assert a property that decides nothing and would refuse a
 * perfectly correct order; `modeVerified` is asserted instead, and it was read back from the store.
 */
async function earnInto(pool, { actor, earn, qty, ambient, before, modeVerified }) {
  const orgId = pool.actorOrgField ? actor[pool.actorOrgField] : null;
  if (pool.mode !== modeVerified) {
    throw new Error(`${pool.key} must earn while the store reads "${pool.mode}" but the last verified read-back `
      + `was "${modeVerified}". Placing this order would put the accrual in the wrong scope, irreversibly.`);
  }
  const token = await storefrontToken(actor, orgId);
  const cartName = `loy-pool-${pool.key.toLowerCase()}-${newHandle('')}`;
  const target = pointsPerUnit(earn.factor, earn.unitPrice) * qty;

  log(`  ⚠ ${pool.key}: placing ONE REAL, NON-REVERSIBLE order — ${earn.sku} x${qty} `
    + `(${pointsPerUnit(earn.factor, earn.unitPrice)} PTS/unit → +${target} PTS into ${pool.scope} scope${orgId ? ` ${orgId}` : ''}).`);

  // A dry run must preview the ARITHMETIC, not just the intent. Returning the unchanged `before`
  // would leave the organization pools at 0 through the whole preview, and the user-scope step
  // would then abort on a vacuity it only has because nothing was placed — a preview that fails
  // for a reason the real run would not have. So the projected figure is reported instead, and
  // labelled as projected.
  if (DRY_RUN) { log(`    [DRY] no order placed — projected ${before} → ${before + target}`); return { number: `dry-${pool.key}`, after: before + target }; }

  const number = await placeEarnOrder({
    gql: (q, l) => gqlAs(token, q, `${pool.key}:${l}`),
    storeId: STORE_ID, userId: actor.userId, productId: earn.productId, qty,
    currency: ambient.currency, culture: ambient.culture,
    cartName,
    onCartReady: (cart) => {
      // PRE-COMMIT GATE. Throwing here leaves no order behind.
      if (orgId && String(cart.organizationId || '') !== String(orgId)) {
        throw new Error(`cart ${cart.id} carries organizationId "${cart.organizationId}" but this pool needs `
          + `"${orgId}". The loyalty handler reads order.OrganizationId and nothing else, so placing this order `
          + 'would silently fund the wrong pool. Aborting BEFORE the order exists.');
      }
      if (Number(cart.itemsQuantity) !== qty) {
        throw new Error(`cart ${cart.id} holds ${cart.itemsQuantity} unit(s), expected ${qty} — a reused or `
          + 'partially-added cart would earn an amount the fixture never planned.');
      }
      verbose(`${pool.key}: cart ${cart.id} org=${cart.organizationId || '(none)'} qty=${cart.itemsQuantity} — gate passed`);
    },
  });

  // Accrual settles on a Hangfire job, so the balance does not move synchronously.
  // 24 x 5 s = 2 min: generous, because the alternative is recording a stale figure that every
  // later delta assertion inherits.
  const after = await pollBalanceChange({
    readBalance: () => readPool(pool, actor), userId: actor.userId, from: before, sleep, attempts: 24,
  });
  if (after === before) {
    throw new Error(`order ${number} was placed but ${pool.key} never moved off ${after} within 2 minutes. `
      + 'Do NOT re-run blindly — the order is real and non-reversible, so a retry earns twice. Check the loyalty '
      + 'Hangfire job and the operation log for this owner first.');
  }
  log(`  ✓ ${pool.key}: order ${number} → ${before} → ${after} PTS`);
  return { number, after };
}

/* ── teardown ────────────────────────────────────────────────────────────────────────────── */

function teardown() {
  log('Teardown — this CANNOT un-earn.');
  log('  vc-module-loyalty exposes the operation log READ-ONLY: no set, no debit, no delete. The three');
  log('  balances stay exactly where they are, forever, and the ledger rows are not purgeable.');
  log('  What teardown CAN do is stop the committed overlay pointing at figures that are no longer the');
  log('  seeded ones — a dead identity that still RESOLVES is the silent failure td:reconcile exists to catch.');
  writeEnvAliasOverride({
    [POOL_ALIAS]: Object.fromEntries(RUNTIME_ALIAS_FIELDS[POOL_ALIAS].map((f) => [f, ''])),
  });
  log(`  blanked ${POOL_ALIAS} runtime fields in aliases.${process.env.TEST_ENV || 'vcst'}.json`);
  log('  NOTE: re-seeding EARNS AGAIN on top of the existing balances. The seeder re-checks divergence');
  log('  against the live figures, so that is safe — but it is not free, and it is not reversible.');
  return true;
}

/* ── main ────────────────────────────────────────────────────────────────────────────────── */

async function main() {
  console.log(`\n🏢 Multi-organization loyalty pools (LOYORG-E2E-003 / 083e)${DRY_RUN ? ' [DRY RUN]' : ''}${TEARDOWN ? ' [TEARDOWN]' : ''}`);
  assertSafeTarget();

  // The DECLARED plan must be discriminating before anything touches the environment. A plan that
  // cannot answer the question is not worth three real orders.
  const plan = planProblems();
  if (plan.length) {
    console.error('\n❌ The declared earn plan is not discriminating — refusing to seed:');
    for (const p of plan) console.error(`   • ${p}`);
    process.exit(3);
  }
  log(`Plan: ${POOLS.map((p) => `${p.key} x${p.qty}`).join(' | ')} (quantities chosen so no figure is an exact multiple, sum or difference of the others)`);

  if (TEARDOWN) { process.exit(teardown() ? 0 : 1); }

  await auth();
  const actor = resolveActor();
  log(`Actor: ${ACTOR_ALIAS} ${actor.email} (${actor.userId})`);
  log(`  TechFlow  ${actor.org_techflow_id}`);
  log(`  BuildRight ${actor.org_buildright_id}`);

  // Read-only prerequisite check. This seeder must never CREATE or REPAIR a membership — the
  // memberships are shared state another lane owns — so a missing one is reported, never fixed.
  const memberships = (await api('POST', '/api/customer/organization-memberships/search',
    { userId: actor.userId, take: 50 }, { expectStatus: [200, 201] }))?.results || [];
  const orgsHeld = new Set(memberships.map((m) => m.organizationId));
  for (const p of ORG_POOLS) {
    const orgId = actor[p.actorOrgField];
    if (!orgsHeld.has(orgId)) {
      console.error(`\n❌ ${ACTOR_ALIAS} has no OrganizationMembership in ${p.key} (${orgId}). `);
      console.error('   An account that cannot mint an org-scoped token for that organization cannot earn into its pool,');
      console.error('   and this seeder will NOT create the membership: membership rows are the backend/frontend lane');
      console.error(`   boundary and are owned by seed-company-users.mjs. Run: node scripts/seed-data/b2b/seed-company-users.mjs cross-org --only ${ACTOR_ALIAS}`);
      process.exit(4);
    }
  }
  log(`  ✓ memberships verified read-only in both organizations (${memberships.length} row(s) total; none written)`);

  // Ambient context — the store's own currency + culture, never literals (an xAPI read without them
  // answers 200 against SOME other context, so a price would be a number of unknown units).
  const { value: originalMode } = await readStoreMode();
  const storeEntity = (await readStoreMode()).store;
  const ambient = { currency: storeEntity.defaultCurrency, culture: storeEntity.defaultLanguage };
  if (!ambient.currency || !ambient.culture) {
    throw new Error(`store ${STORE_ID} has no defaultCurrency/defaultLanguage — that is a BROKEN STOREFRONT, `
      + 'not a fixture problem (npm run td:reconcile:store). Repair the store before seeding.');
  }
  log(`Store ${STORE_ID}: currency ${ambient.currency}, culture ${ambient.culture}, ${MODE_SETTING}="${originalMode}"`);

  const before = await readAll(actor);
  log(`Balances BEFORE: ${POOLS.map((p) => `${p.key}=${before[p.key]}`).join(' | ')}`);

  // Already discriminating? Then the fixture is provisioned and three real orders would buy
  // nothing. This is what idempotence looks like for an operation that cannot be undone.
  if (!divergenceProblems(before).length && !REFRESH && !ONLY_SET) {
    log('The live triple is ALREADY discriminating — no order placed. Re-recording the observed figures.');
    await record(actor, before, before, null, originalMode, {});
    console.log('\n✅ Multi-organization loyalty pools already funded — nothing earned.');
    report(before, {});
    return;
  }

  // What does this account earn per unit right now? Measured, never declared: points =
  // factor x unit price x qty, and the factor belongs to whichever ProductPoints program wins for
  // THIS account's groups.
  const probeToken = await storefrontToken(actor, actor[ORG_POOLS[0].actorOrgField]);
  const meData = await gqlAs(probeToken, 'query { me { id contact { id groups organizationId } } }', 'me');
  const groups = meData?.me?.contact?.groups || [];
  verbose(`actor groups: ${JSON.stringify(groups)}`);
  const earn = await resolveWinningEarning({
    api,
    earnInfo: async (productId) => {
      const d = await gqlAs(probeToken, `query { product(id: "${productId}" storeId: "${STORE_ID}" cultureName: "${ambient.culture}" currencyCode: "${ambient.currency}") { code availabilityData { isBuyable isAvailable availableQuantity } price { actual { amount } } } }`, 'earn_product').catch(() => null);
      const p = d?.product;
      const unitPrice = Number(p?.price?.actual?.amount || 0);
      if (!p?.availabilityData?.isBuyable || !p?.availabilityData?.isAvailable || !(unitPrice > 0)) return null;
      return { sku: p.code, productId, unitPrice, availableQuantity: Number(p.availabilityData.availableQuantity ?? 0) };
    },
    userGroups: groups,
    onFallback: (top, used) => log(`  ⚠ top winner "${top.name}" has no buyable factor SKU — using "${used.name}"`),
  });
  if (!earn) {
    console.error('\n❌ No winning ProductPoints program resolved to a buyable factor SKU for this account.');
    console.error('   Seed the loyalty programs + standard products first (npm run seed:loyalty && npm run seed:products).');
    process.exit(5);
  }
  const perUnit = pointsPerUnit(earn.factor, earn.unitPrice);
  const unitsNeeded = POOLS.filter(inScope).reduce((s, p) => s + p.qty, 0);
  log(`Earn: winner "${earn.programName}" → ${earn.sku} (factor ${earn.factor} x ${ambient.currency} ${earn.unitPrice} = ${perUnit} PTS/unit), stock ${earn.availableQuantity}`);
  if (earn.availableQuantity && earn.availableQuantity < unitsNeeded) {
    console.error(`\n❌ ${earn.sku} has ${earn.availableQuantity} in stock but the plan needs ${unitsNeeded} units. `
      + 'Re-stock (npm run seed:inventory) before seeding — a partial fund leaves a non-discriminating triple.');
    process.exit(5);
  }

  const orders = {};
  const qtyUsed = {};
  const earned = [];
  const after = { ...before };
  let mode = originalMode;

  try {
    /* ── organization pools ──
     * The flip is scoped to the pools actually in scope. `B2B-store` is SHARED: every other loyalty
     * suite is authored against Customer mode, so a run that flips it when it has no organization
     * order to place is pure exposure for no gain. */
    const orgPools = ORG_POOLS.filter(inScope);
    if (orgPools.length && !REFRESH) mode = await setStoreMode(MODE_ORGANIZATION);
    for (const pool of orgPools) {
      if (REFRESH) { log(`  --refresh: ${pool.key} left at ${after[pool.key]}`); continue; }
      const r = await earnInto(pool, { actor, earn, qty: pool.qty, ambient, before: after[pool.key], modeVerified: mode });
      orders[pool.key] = r.number;
      qtyUsed[pool.key] = pool.qty;
      earned.push(pool.key);
      after[pool.key] = r.after;
    }

    /* ── user scope ──
     * Its quantity is CHOSEN against the live baseline rather than declared. Source at PR #17 head
     * says an organization-mode row carries a non-null OrganizationId and is excluded from every
     * user-scope query, so the declared 2 should simply win — but a source read is not a live
     * reading, and if the org earns HAD credited the user scope, adding 2 would land on 12 units,
     * exactly 4x TechFlow's 3, which is the coincidence the divergence rule rejects. */
    const userPool = poolByKey('USER');
    if (inScope(userPool) && !REFRESH) {
      mode = await setStoreMode(MODE_CUSTOMER);
      const liveUser = DRY_RUN ? after.USER : await readPool(userPool, actor);
      after.USER = liveUser;
      const { qty, problems } = chooseUserQty({
        currentUserUnits: liveUser / perUnit,
        techflowUnits: after.TECHFLOW / perUnit,
        buildrightUnits: after.BUILDRIGHT / perUnit,
      });
      if (qty == null) {
        console.error('\n❌ No user-scope quantity yields a discriminating triple against the live organization pools:');
        for (const p of problems) console.error(`   • ${p}`);
        console.error('   Refusing to place an order that would answer nothing.');
        process.exit(6);
      }
      if (qty !== userPool.qty) {
        log(`  user-scope baseline is ${liveUser} PTS (${liveUser / perUnit} units) — the declared qty ${userPool.qty} `
          + `would collide, so the chosen qty is ${qty}.`);
      }
      const r = await earnInto(userPool, { actor, earn, qty, ambient, before: liveUser, modeVerified: mode });
      orders.USER = r.number;
      qtyUsed.USER = qty;
      earned.push('USER');
      after.USER = r.after;
    }
  } finally {
    // Restore whatever the store was in, whatever happened above. The rest of the loyalty corpus
    // is authored against Customer mode, so leaving Organization behind silently changes the answer
    // every other loyalty suite gets.
    try {
      const restored = await setStoreMode(originalMode || MODE_AMBIENT_DEFAULT);
      log(`  ✓ store mode restored to "${restored}"`);
    } catch (e) {
      console.error(`\n❌❌ COULD NOT RESTORE ${MODE_SETTING} to "${originalMode}": ${e.message}`);
      console.error('   The store may still be in Organization mode. FIX THIS BEFORE RUNNING ANY OTHER LOYALTY SUITE:');
      console.error(`   GET ${BACK_URL}/api/stores/${STORE_ID} → set settings[${MODE_SETTING}].value = "${originalMode}" → PUT /api/stores`);
    }
  }

  /* ── grade the live result, then record it ── */
  const final = DRY_RUN ? after : await readAll(actor);
  const stateProblems = seededStateProblems({
    before: REFRESH ? final : before,
    after: final,
    // Movement is asserted only for the pools this run actually earned into — a `--only USER`
    // repair pass leaves the organization pools untouched on purpose. Divergence still applies to
    // all three: a partial run must still leave a triple a case can decide with.
    earned,
  });
  if (stateProblems.length && !DRY_RUN && !REFRESH) {
    console.error('\n❌ Seeded, but the live state is NOT discriminating:');
    for (const p of stateProblems) console.error(`   • ${p}`);
    console.error('   The figures were NOT recorded — a case reading them would make a confident wrong claim.');
    process.exit(6);
  }
  await record(actor, before, final, { earn, perUnit }, originalMode, qtyUsed);

  console.log(`\n✅ Multi-organization loyalty pools seeded${DRY_RUN ? ' [DRY RUN — no writes]' : ''}`);
  report(final, orders, { perUnit, sku: earn.sku, qtyUsed });
}

async function record(actor, before, final, earnInfo, originalMode, qtyUsed) {
  const num = (v) => (v == null ? '' : String(v));
  const writeback = {
    [POOL_ALIAS]: {
      user_email: num(actor.email),
      user_id: num(actor.userId),
      techflow_org_id: num(actor.org_techflow_id),
      buildright_org_id: num(actor.org_buildright_id),
      techflow_balance_at_seed: num(final.TECHFLOW),
      buildright_balance_at_seed: num(final.BUILDRIGHT),
      user_balance_at_seed: num(final.USER),
      techflow_earn_qty: num(qtyUsed.TECHFLOW ?? poolByKey('TECHFLOW').qty),
      buildright_earn_qty: num(qtyUsed.BUILDRIGHT ?? poolByKey('BUILDRIGHT').qty),
      user_earn_qty: num(qtyUsed.USER ?? poolByKey('USER').qty),
      earn_points_per_unit: num(earnInfo?.perUnit ?? ''),
      earn_sku: num(earnInfo?.earn?.sku ?? ''),
      store_mode_at_seed: num(originalMode),
      seeded_at: new Date().toISOString(),
    },
  };

  // Every field the spec DECLARES runtime must actually have landed. A declared-but-unwritten field
  // resolves to "" through @td() and the case then reads as a product bug — the silent class the
  // per-env overlay exists to prevent. `earn_*` are exempt on a --refresh pass, which places nothing.
  if (!DRY_RUN) {
    const exempt = earnInfo ? new Set() : new Set(['earn_points_per_unit', 'earn_sku']);
    const holes = RUNTIME_ALIAS_FIELDS[POOL_ALIAS]
      .filter((f) => !exempt.has(f) && String(writeback[POOL_ALIAS][f] ?? '').trim() === '');
    if (holes.length) {
      console.error(`\n❌ declared runtime field(s) not provisioned: ${holes.join(', ')} — @td() would resolve them to "".`);
      process.exit(7);
    }
    // Preserve a previously-recorded earn fingerprint across a --refresh rather than blanking it.
    for (const f of exempt) delete writeback[POOL_ALIAS][f];
  }
  writeEnvAliasOverride(writeback);
}

function report(final, orders, meta = {}) {
  const pad = (s) => String(s).padEnd(12);
  console.log(`   ${pad('POOL')} ${pad('BALANCE')} ${pad('QTY')} ORDER`);
  for (const p of POOLS) {
    console.log(`   ${pad(p.key)} ${pad(final[p.key])} ${pad(meta.qtyUsed?.[p.key] ?? '-')} ${orders[p.key] || '(not earned this run)'}`);
  }
  if (meta.perUnit) console.log(`   earn ${meta.sku} @ ${meta.perUnit} PTS/unit`);
  console.log(`   divergence: ${divergenceProblems(final).length ? 'FAILED' : 'OK — no figure is an exact multiple, sum or difference of the others'}`);
  console.log(`   NOTE: these are RELATIVE references, not contracts. A balance cannot be reset on this platform,`);
  console.log(`         so every assertion must be a delta against a reading taken immediately before the action.`);
}

main().catch((e) => { console.error(`\n❌ SEED FAILED: ${e.message}`); if (VERBOSE) console.error(e.stack); process.exit(1); });
