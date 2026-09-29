// Unit tests for scripts/seed-data/pricing/org-contract-specs.mjs — the DERIVATION half only.
//
// §7a split (.claude/knowledge/execution/test-data-authoring.md): the declared fixture values, the
// non-vacuity contract, the alias registry and the GUID scan belong to `td:validate:org-contract`,
// which calls the same validateFixtureShape() and adds those checks on top. Nothing below restates
// a literal the spec declares. Everything below computes a value the spec does NOT declare —
// the contract code from a name, the tier ladder from ANOTHER module's spec, the per-break delta,
// the request bodies, and the join/leave group semantics teardown depends on. A wrong
// implementation in any of them writes a price, a condition group or a member group that no human
// wrote down, and no drift guard would notice.
//
// Pure — no env, no network, no fs. Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SPEC_OVERLAYS } from '../seed-data/products/standard-specs.mjs';
import {
  CONTRACT, CONTRACT_GROUP, CONTRACT_PRICE_BY_MIN_QTY, CONTRACTED_PRODUCT, CONTRACT_BUYER,
  BASE_PRICELIST_NAME,
  anonymousTiers, applyGroup, buildBuyerAccountBody, buildBuyerContactBody, buildContractBody,
  buildPriceRows, buildPricelistBody, contractBuyerName, contractCode, contractTiers,
  derivedAssignmentNames, isSeededPricingEntity, priceDeltas,
} from '../seed-data/pricing/org-contract-specs.mjs';

// ── contractCode — the group the assignments condition on ────────────────────────────────────
// Verified live against the Contracts module 2026-09-22: it writes members/add groups equal to the
// contract CODE, and every contract on the platform follows `contract-<slug of name>`.
// Getting this wrong matches nobody and every buyer silently reads the anonymous price.
test('contractCode lowercases, collapses non-alphanumerics and prefixes "contract-"', () => {
  assert.equal(contractCode('Contract1'), 'contract-contract1');
  assert.equal(contractCode('New contract'), 'contract-new-contract');
  assert.equal(contractCode('Speeds  Medical!!'), 'contract-speeds-medical');
  assert.equal(contractCode('--Leading And Trailing--'), 'contract-leading-and-trailing');
});

test('CONTRACT_GROUP is derived from the contract name, not stored separately', () => {
  assert.equal(CONTRACT_GROUP, contractCode(CONTRACT.name));
});

// ── the ladders ──────────────────────────────────────────────────────────────────────────────
// anonymousTiers reads the OTHER module's spec, so it is a real cross-file derivation: the tier
// breaks and the "what a shopper pays" rule (sale ?? list) are computed, never transcribed.
test('anonymousTiers takes the sale layer where one exists, the list layer otherwise', () => {
  const tiers = anonymousTiers('PROD-104');
  const source = SPEC_OVERLAYS['PROD-104'].tierPrices;
  assert.equal(tiers.length, source.length);
  for (let i = 0; i < source.length; i += 1) {
    assert.equal(tiers[i].minQuantity, source[i].minQuantity);
    assert.equal(tiers[i].amount, source[i].sale ?? source[i].list);
  }
  // PROD-111 carries a sale on every row — proves the `??` picks sale, not list.
  const stacking = anonymousTiers('PROD-111');
  assert.deepEqual(stacking.map((t) => t.amount), SPEC_OVERLAYS['PROD-111'].tierPrices.map((r) => r.sale));
});

test('anonymousTiers returns [] for a product with no tier overlay (no crash, no phantom ladder)', () => {
  assert.deepEqual(anonymousTiers('PROD-DOES-NOT-EXIST'), []);
});

test('contractTiers mirrors the anonymous BREAKS and maps each to its contract amount', () => {
  const anon = anonymousTiers();
  const contract = contractTiers();
  assert.deepEqual(contract.map((t) => t.minQuantity), anon.map((t) => t.minQuantity));
  for (const t of contract) assert.equal(t.amount, CONTRACT_PRICE_BY_MIN_QTY[t.minQuantity]);
});

test('anonymousTiers honours a sale of 0.00 instead of falling back to the list price', () => {
  // `??` vs `||`. Both agree on every row of the real overlays, so only a synthetic zero-sale row
  // separates them — and `||` would make the fixture compare the contract against a list price no
  // shopper pays. Injecting the overlay is why these derivations take one.
  const overlays = { FAKE: { tierPrices: [{ minQuantity: 1, list: 50, sale: 0 }] } };
  assert.equal(anonymousTiers('FAKE', overlays)[0].amount, 0);
});

test('contractTiers yields undefined — not a silent fallback — for an unmapped tier break', () => {
  // The failure mode this guards: a break added to the product's ladder with no contract amount
  // leaves the contract buyer on the anonymous price above that threshold. It must surface, and
  // validateFixtureShape() (owned by the drift guard) is what turns it into a failure.
  const overlays = { FAKE: { tierPrices: [{ minQuantity: 1, list: 50 }, { minQuantity: 7, list: 40 }] } };
  const tiers = contractTiers('FAKE', overlays);
  assert.equal(tiers[0].amount, CONTRACT_PRICE_BY_MIN_QTY[1]);
  assert.equal(tiers[1].amount, undefined, 'break 7 has no contract amount and must not inherit one');
});

test('priceDeltas subtracts per break and rounds to cents (no float dust)', () => {
  const deltas = priceDeltas();
  const anon = anonymousTiers(), contract = contractTiers();
  assert.equal(deltas.length, anon.length);
  for (let i = 0; i < deltas.length; i += 1) {
    assert.equal(deltas[i].anonymous, anon[i].amount);
    assert.equal(deltas[i].contract, contract[i].amount);
    assert.equal(deltas[i].delta, Math.round((anon[i].amount - contract[i].amount) * 100) / 100);
    // A cents-rounded difference must not carry binary-float residue.
    assert.equal(Number(deltas[i].delta.toFixed(2)), deltas[i].delta);
  }
});

test('priceDeltas reports null rather than NaN when one side of a break is missing', () => {
  // Break 7 has no contract amount, so exactly ONE of the two operands is finite — the case that
  // separates `&&` from `||` in the guard clause. `||` would emit NaN, which reads as a number in
  // a report and compares unequal to everything, including itself.
  const overlays = { FAKE: { tierPrices: [{ minQuantity: 1, list: 50 }, { minQuantity: 7, list: 40 }] } };
  const deltas = priceDeltas('FAKE', overlays);
  assert.equal(deltas[0].delta, Math.round((50 - CONTRACT_PRICE_BY_MIN_QTY[1]) * 100) / 100);
  assert.equal(deltas[1].delta, null);
  assert.ok(!Number.isNaN(deltas[1].delta));
});

// ── request bodies ───────────────────────────────────────────────────────────────────────────
test('buildPriceRows emits one row per contract break, in the priority pricelist, list-only', () => {
  const rows = buildPriceRows({ productId: 'prod-1', pricelistId: 'pl-priority' });
  const contract = contractTiers();
  assert.equal(rows.length, contract.length);
  for (let i = 0; i < rows.length; i += 1) {
    assert.equal(rows[i].productId, 'prod-1');
    assert.equal(rows[i].pricelistId, 'pl-priority');
    assert.equal(rows[i].list, contract[i].amount);
    assert.equal(rows[i].minQuantity, contract[i].minQuantity);
    assert.equal(rows[i].currency, CONTRACTED_PRODUCT.currency);
    // No `sale` layer: a sale ON TOP of a contract price makes "which layer won" unobservable
    // again, which is the exact class of defect this fixture exists to remove.
    assert.ok(!('sale' in rows[i]), 'contract rows must not carry a sale layer');
  }
});

test('buildContractBody carries the caller store and the derived code, never a hardcoded store', () => {
  const body = buildContractBody({ storeId: 'SomeOtherStore' });
  assert.equal(body.storeId, 'SomeOtherStore');
  assert.equal(body.code, CONTRACT_GROUP);
  assert.equal(body.name, CONTRACT.name);
  assert.equal(body.status, 'Active');
});

test('buildPricelistBody defaults to the derived name + contract currency and accepts overrides', () => {
  assert.deepEqual(
    { name: buildPricelistBody().name, currency: buildPricelistBody().currency },
    { name: BASE_PRICELIST_NAME, currency: CONTRACT.currency },
  );
  assert.equal(buildPricelistBody({ name: 'X', currency: 'EUR' }).currency, 'EUR');
});

test('buildBuyerContactBody puts the buyer in the contracted org and in the contract group', () => {
  const body = buildBuyerContactBody({ orgPlatformId: 'org-guid' });
  assert.deepEqual(body.organizations, ['org-guid']);
  assert.deepEqual(body.groups, [CONTRACT_GROUP]);
  assert.equal(body.name, contractBuyerName());
  assert.deepEqual(body.emails, [CONTRACT_BUYER.email]);
  // A buyer with no organisation is not an org buyer — BL-B2B org scoping.
  assert.deepEqual(buildBuyerContactBody({}).organizations, []);
});

test('buildBuyerAccountBody never embeds the {{VAR}} token — the caller resolves it first', () => {
  const body = buildBuyerAccountBody({ contactId: 'c1', storeId: 'B2B-store', password: 'resolved-secret' });
  assert.equal(body.password, 'resolved-secret');
  assert.equal(body.memberId, 'c1');
  assert.equal(body.storeId, 'B2B-store');
  assert.equal(body.userType, 'Customer');
  assert.equal(body.isAdministrator, false);
  assert.ok(!/\{\{/.test(JSON.stringify(body)), 'an unresolved token would be stored as the literal password');
});

// ── group set semantics — what teardown depends on ───────────────────────────────────────────
test('applyGroup adds once, is idempotent, and preserves the order of existing groups', () => {
  assert.deepEqual(applyGroup(['Premium Customers', 'store-acme']), ['Premium Customers', 'store-acme', CONTRACT_GROUP]);
  assert.deepEqual(applyGroup(['Premium Customers', CONTRACT_GROUP]), ['Premium Customers', CONTRACT_GROUP]);
  assert.deepEqual(applyGroup([]), [CONTRACT_GROUP]);
  assert.deepEqual(applyGroup(null), [CONTRACT_GROUP]);
});

test('applyGroup(join=false) removes ONLY our group — teardown must not strip the org\'s own groups', () => {
  assert.deepEqual(
    applyGroup(['Premium Customers', CONTRACT_GROUP, 'store-acme'], CONTRACT_GROUP, false),
    ['Premium Customers', 'store-acme'],
  );
  // Nothing to remove is a no-op, not an empty list.
  assert.deepEqual(applyGroup(['Premium Customers'], CONTRACT_GROUP, false), ['Premium Customers']);
});

test('applyGroup drops empty entries so a blank CSV cell cannot become a group named ""', () => {
  assert.deepEqual(applyGroup(['', 'store-acme', null]), ['store-acme', CONTRACT_GROUP]);
});

// ── teardown search semantics ────────────────────────────────────────────────────────────────
// DELETE /api/contracts does NOT cascade (measured 2026-09-22: both assignments and BOTH
// pricelists survived), so teardown finds them by NAME. A predicate that is too narrow orphans
// entities permanently; one that is too broad deletes somebody else's pricing.
test('isSeededPricingEntity matches exactly the entities this seeder creates', () => {
  const { base, priority } = derivedAssignmentNames();
  assert.ok(isSeededPricingEntity(BASE_PRICELIST_NAME));
  assert.ok(isSeededPricingEntity(base));
  assert.ok(isSeededPricingEntity(priority));
  // The module-created priority pricelist is named after the contract + the linked pricelist.
  assert.ok(isSeededPricingEntity(`Contract-${CONTRACT.name}-${BASE_PRICELIST_NAME}`));
});

test('isSeededPricingEntity does NOT match other contracts or unrelated AGENT-TEST pricelists', () => {
  for (const foreign of [
    'Contract-New contract-BeerUSD-Priority',
    'Contract-Contract2-Virto-Base',
    'AGENT-TEST-CatalogEdge-USD',
    'SEED-20260519-Standards-USD',
    'DefaultUSD',
    '',
    null,
    undefined,
  ]) {
    assert.equal(isSeededPricingEntity(foreign), false, `must not sweep "${foreign}"`);
  }
});

test('derivedAssignmentNames reproduces the module\'s Contract-<contract>-<pricelist>-<role> shape', () => {
  const { base, priority } = derivedAssignmentNames({ basePricelistName: 'PL-X' });
  assert.equal(base, `Contract-${CONTRACT.name}-PL-X-Base`);
  assert.equal(priority, `Contract-${CONTRACT.name}-PL-X-Priority`);
});
