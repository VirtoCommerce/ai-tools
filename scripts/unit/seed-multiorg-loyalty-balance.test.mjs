// Unit tests for the multi-organization loyalty balance fixture (LOYORG-E2E-003 / suite 083e).
//
// Two surfaces are covered, and nothing else is worth covering:
//
//   A. `multiorg-balance-specs.mjs` — the DISCRIMINATING predicate and the quantity arithmetic.
//      This is the whole fixture. A seeder that funds three pools perfectly but funds them to
//      confusable numbers produces a case that passes whatever the implementation does, and no
//      other gate in this repo can see it. Every rule the predicate enforces has a test that
//      constructs the exact collapse it exists to reject.
//
//   B. `placeEarnOrder`'s new PRE-COMMIT GATE — that `onCartReady` runs BEFORE anything
//      irreversible, and that throwing from it leaves no order behind. An order on this platform
//      is real and a loyalty accrual cannot be undone, so "the gate ran too late" is not a cosmetic
//      bug; it is a wrongly-funded pool that can never be corrected.
//
// Pure/mocked — no env, no network. Run: `npm test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  POOLS, ORG_POOLS, poolByKey, ALIAS_FIELDS, RUNTIME_ALIAS_FIELDS, POOL_ALIAS, ACTOR_ALIAS,
  MODE_ORGANIZATION, MODE_CUSTOMER, MODE_AMBIENT_DEFAULT, USER_QTY_CANDIDATES,
  divergenceProblems, planProblems, chooseUserQty, seededStateProblems, classifyReading,
} from '../seed-data/loyalty/multiorg-balance-specs.mjs';
import { placeEarnOrder } from '../seed-data/loyalty/loyalty-earn.mjs';

/* ── A. the discriminating predicate ─────────────────────────────────────────────────────── */

test('the declared plan funds all three scopes, two of them organization-scoped', () => {
  assert.equal(POOLS.length, 3);
  assert.equal(ORG_POOLS.length, 2);
  assert.deepEqual(ORG_POOLS.map((p) => p.key), ['TECHFLOW', 'BUILDRIGHT']);
  assert.equal(poolByKey('USER').scope, 'user');
  // The organization pools MUST earn under Organization mode and the user pool under Customer —
  // an organization-mode row carries a non-null OrganizationId and is excluded from every
  // user-scope query, so earning the "user" pool in the wrong mode funds nothing readable.
  assert.deepEqual(ORG_POOLS.map((p) => p.mode), [MODE_ORGANIZATION, MODE_ORGANIZATION]);
  assert.equal(poolByKey('USER').mode, MODE_CUSTOMER);
  assert.equal(MODE_AMBIENT_DEFAULT, MODE_CUSTOMER);
});

test('a ZERO pool is rejected — this is the exact gap the fixture closes', () => {
  // The measured pre-fixture state: everything at 0. Two readings agree trivially.
  const problems = divergenceProblems({ TECHFLOW: 0, BUILDRIGHT: 0, USER: 0 });
  assert.equal(problems.length, 3);
  assert.ok(problems.every((p) => /vacuous/.test(p)));
});

test('funding only ONE organization is rejected — a 0 read is indistinguishable from the user-scope fallback', () => {
  const problems = divergenceProblems({ TECHFLOW: 90000, BUILDRIGHT: 0, USER: 60000 });
  assert.ok(problems.some((p) => p.startsWith('BUILDRIGHT is 0')));
});

test('EQUAL values on both sides of the distinction are rejected', () => {
  const problems = divergenceProblems({ TECHFLOW: 90000, BUILDRIGHT: 90000, USER: 60000 });
  assert.ok(problems.some((p) => /TECHFLOW and BUILDRIGHT are both 90000/.test(p)));
  assert.ok(problems.some((p) => /SECOND RULE/.test(p)));
});

test('a figure equal to the SUM of the other two is rejected', () => {
  // 1u / 2u / 3u — the naive choice. 3 = 1 + 2, so a "pooled across both scopes" bug reads as
  // BuildRight's own figure.
  const problems = divergenceProblems({ USER: 1, TECHFLOW: 2, BUILDRIGHT: 3 });
  assert.ok(problems.some((p) => /equals the SUM of the other two/.test(p)));
});

test('a figure equal to the DIFFERENCE of the other two is rejected', () => {
  // 4 / 9 / 5 — pairwise non-dividing and no sum collision, but 4 = 9 - 5.
  const problems = divergenceProblems({ USER: 4, TECHFLOW: 9, BUILDRIGHT: 5 });
  assert.ok(problems.some((p) => /equals the DIFFERENCE of the other two/.test(p)));
});

test('planProblems rejects a non-integer or non-positive earn quantity', () => {
  const bent = POOLS.map((p) => (p.key === 'USER' ? { ...p, qty: 0 } : p));
  assert.ok(planProblems(bent).some((p) => /not a positive integer/.test(p)));
  const fractional = POOLS.map((p) => (p.key === 'USER' ? { ...p, qty: 2.5 } : p));
  assert.ok(planProblems(fractional).some((p) => /not a positive integer/.test(p)));
});

/* ── A2. the adaptive user quantity ──────────────────────────────────────────────────────── */

test('chooseUserQty returns the DECLARED 2 when the org earns left the user scope untouched', () => {
  // The behaviour source says to expect: an org-mode row is excluded from user-scope queries.
  const { qty, problems } = chooseUserQty({ currentUserUnits: 0, techflowUnits: 3, buildrightUnits: 7 });
  assert.equal(qty, 2);
  assert.deepEqual(problems, []);
  assert.equal(qty, poolByKey('USER').qty, 'the first candidate must be the declared quantity, so the fixture matches its own documentation');
});

test('chooseUserQty reports failure rather than returning a quantity that answers nothing', () => {
  // Organization pools that are themselves confusable cannot be rescued by any user quantity.
  const { qty, problems } = chooseUserQty({ currentUserUnits: 0, techflowUnits: 5, buildrightUnits: 5 });
  assert.equal(qty, null);
  assert.ok(problems.some((p) => /are both 5/.test(p)));
});

test('every candidate user quantity is a positive integer, cheapest first', () => {
  assert.ok(USER_QTY_CANDIDATES.length > 1);
  assert.ok(USER_QTY_CANDIDATES.every((q) => Number.isInteger(q) && q > 0));
  assert.deepEqual([...USER_QTY_CANDIDATES], [...USER_QTY_CANDIDATES].sort((a, b) => a - b));
});

/* ── A3. grading a live read-back ────────────────────────────────────────────────────────── */

test('a partial (--only) run asserts movement ONLY for the pools it earned into', () => {
  const state = {
    before: { TECHFLOW: 98916, BUILDRIGHT: 219416, USER: 0 },
    after: { TECHFLOW: 98916, BUILDRIGHT: 219416, USER: 60000 },
  };
  // Unscoped, the untouched organization pools look like failures.
  assert.equal(seededStateProblems(state).length, 2);
  // Scoped to what this run actually earned, it is clean — the run did exactly its job.
  assert.deepEqual(seededStateProblems({ ...state, earned: ['USER'] }), []);
});

test('a partial run still has to leave a DISCRIMINATING triple', () => {
  // Only USER was earned, but it landed on an exact multiple of TechFlow. Scoping movement must
  // not scope away the divergence rule — that is the rule the whole fixture exists for.
  const problems = seededStateProblems({
    before: { TECHFLOW: 90000, BUILDRIGHT: 210000, USER: 0 },
    after: { TECHFLOW: 90000, BUILDRIGHT: 210000, USER: 180000 },
    earned: ['USER'],
  });
  assert.ok(problems.some((p) => /exact factor of 2/.test(p)));
});

/* ── A4. the three modelled implementations are actually distinguishable ─────────────────── */

test('the seeded triple names each of the three modelled implementations distinctly', () => {
  const t = { TECHFLOW: 90000, BUILDRIGHT: 210000, USER: 60000 };
  const correct = classifyReading({ first: t.TECHFLOW, second: t.BUILDRIGHT, ...t });
  const leaking = classifyReading({ first: t.TECHFLOW, second: t.TECHFLOW, ...t });
  const fallback = classifyReading({ first: t.USER, second: t.USER, ...t });
  assert.match(correct, /^CORRECT/);
  assert.match(leaking, /^LEAKING/);
  assert.match(fallback, /^WRONG FALLBACK/);
  assert.equal(new Set([correct, leaking, fallback]).size, 3, 'three implementations, three verdicts — that is the point of the fixture');
});

test('a wholly-zero triple cannot name any implementation — the pre-fixture state', () => {
  const t = { TECHFLOW: 0, BUILDRIGHT: 0, USER: 0 };
  const correct = classifyReading({ first: 0, second: 0, ...t });
  const fallback = classifyReading({ first: t.USER, second: t.USER, ...t });
  assert.equal(correct, fallback, 'with everything at 0 the correct and wrong-fallback implementations are the same observation');
});

/* ── A5. the alias contract the seeder and validator share ───────────────────────────────── */

test('the alias contract is one list, not two', () => {
  assert.deepEqual([...ALIAS_FIELDS], [...RUNTIME_ALIAS_FIELDS[POOL_ALIAS]]);
  assert.equal(new Set(ALIAS_FIELDS).size, ALIAS_FIELDS.length, 'no duplicate field names');
  for (const p of POOLS) assert.ok(ALIAS_FIELDS.includes(p.balanceField), `${p.key}'s balance field must be exposed`);
  for (const p of POOLS) assert.ok(ALIAS_FIELDS.includes(p.qtyField), `${p.key}'s quantity field must be exposed`);
});

test('the fixture is pinned to the FRONTEND-lane multi-org account', () => {
  // The backend twin owns independent OrganizationMembership rows; swapping the two makes both
  // lanes report confident wrong results.
  assert.equal(ACTOR_ALIAS, 'MULTI_ORG_TF_BR_ALT');
});

/* ── B. the pre-commit gate on an irreversible order ─────────────────────────────────────── */

/**
 * A recording mock of the injected `gql` transport. Answers the four shapes `placeEarnOrder`
 * needs and records every label, so a test can assert exactly how far the flow got.
 */
function makeGqlMock({ cart = {} } = {}) {
  const labels = [];
  const gql = async (query, label) => {
    labels.push(label);
    if (label === 'addItem') return { addItem: { id: 'cart-1' } };
    if (label === 'get_cart') {
      return {
        cart: {
          id: 'cart-1',
          organizationId: 'org-techflow',
          organizationName: 'TechFlow',
          itemsQuantity: 3,
          availableShippingMethods: [{ code: 'FixedRate', optionName: 'Ground', price: { amount: 5 } }],
          availablePaymentMethods: [{ code: 'DefaultManualPaymentMethod' }],
          ...cart,
        },
      };
    }
    if (label === 'place_order') return { createOrderFromCart: { id: 'o-1', number: 'CO-9001' } };
    return { ok: true };
  };
  return { gql, labels };
}

const ORDER_ARGS = {
  storeId: 'B2B-store', userId: 'u-1', productId: 'p-1', qty: 3, currency: 'USD', culture: 'en-US',
};

test('placeEarnOrder still works with no gate — existing callers are unaffected', async () => {
  const { gql, labels } = makeGqlMock();
  const number = await placeEarnOrder({ gql, ...ORDER_ARGS });
  assert.equal(number, 'CO-9001');
  assert.deepEqual(labels, ['addItem', 'get_cart', 'set_shipment', 'set_payment', 'place_order']);
});

test('the gate runs BEFORE the shipment, the payment and the order', async () => {
  const seenAt = [];
  const { gql, labels } = makeGqlMock();
  await placeEarnOrder({
    gql,
    ...ORDER_ARGS,
    onCartReady: () => { seenAt.push(labels.length); },
  });
  assert.deepEqual(seenAt, [2], 'the gate must fire straight after get_cart (addItem, get_cart = 2 calls)');
});

test('throwing from the gate leaves NO order behind — the whole point on a non-reversible action', async () => {
  const { gql, labels } = makeGqlMock({ cart: { organizationId: 'org-buildright' } });
  await assert.rejects(
    placeEarnOrder({
      gql,
      ...ORDER_ARGS,
      onCartReady: (cart) => {
        if (cart.organizationId !== 'org-techflow') throw new Error('wrong pool');
      },
    }),
    /wrong pool/,
  );
  assert.ok(!labels.includes('place_order'), 'createOrderFromCart must never have been reached');
  assert.ok(!labels.includes('set_payment'), 'nor the payment');
  assert.ok(!labels.includes('set_shipment'), 'nor the shipment');
});

test('a gate that asserts nothing about the organization lets a correct order through', async () => {
  // The USER pool's real shape. A multi-org account's token grant falls back to the contact's own
  // organization even when `organization_id` is omitted, so the cart ALWAYS carries one. In
  // Customer mode that organization never reaches the ledger row, so refusing the order over it
  // would refuse a perfectly correct order — measured live on vcst 2026-09-14, where exactly that
  // happened and the run aborted with the two organization pools already funded.
  const { gql, labels } = makeGqlMock({ cart: { organizationId: 'org-buildright' } });
  const number = await placeEarnOrder({
    gql,
    ...ORDER_ARGS,
    onCartReady: (cart) => {
      // scope === 'user' → no organization assertion, quantity only
      assert.equal(Number(cart.itemsQuantity), 3);
    },
  });
  assert.equal(number, 'CO-9001');
  assert.ok(labels.includes('place_order'));
});

test('the gate sees the cart fields it needs to decide — organization and quantity', async () => {
  let seen = null;
  const { gql } = makeGqlMock();
  await placeEarnOrder({ gql, ...ORDER_ARGS, onCartReady: (c) => { seen = c; } });
  assert.equal(seen.organizationId, 'org-techflow');
  assert.equal(seen.itemsQuantity, 3);
});

test('cartName isolates the two organizations\' carts', async () => {
  const queries = [];
  const gql = async (query, label) => {
    queries.push(query);
    if (label === 'addItem') return { addItem: { id: 'c' } };
    if (label === 'get_cart') return { cart: { id: 'c', organizationId: 'x', itemsQuantity: 1, availableShippingMethods: [{ code: 'FixedRate', optionName: 'G', price: { amount: 0 } }], availablePaymentMethods: [] } };
    if (label === 'place_order') return { createOrderFromCart: { number: 'CO-1' } };
    return {};
  };
  await placeEarnOrder({ gql, ...ORDER_ARGS, qty: 1, cartName: 'loy-pool-techflow-abc' });
  assert.ok(queries[0].includes('cartName: "loy-pool-techflow-abc"'), 'addItem must target the named cart');
  assert.ok(queries[1].includes('cartName: "loy-pool-techflow-abc"'), 'and so must the read-back');
  // A cart is resolved by (userId, storeId, cartName, currency) and keeps the organizationId it was
  // created under, so the default name is exactly how a multi-org account funds the wrong pool.
  assert.ok(!queries[0].includes('cartName: "default"'));
});
