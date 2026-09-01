/**
 * Unit tests for the FALSIFIABILITY half of scripts/seed-data/loyalty/missions-specs.mjs — the money
 * model, the OrderValue decision table, the ALL/ANY divergence, the currency pinning and the
 * observed-state guard. Pure logic only: no network, no env, no fs.
 *
 * These are deliberately NOT "does the fixture exist?" tests — the sibling file already covers that,
 * and existence was never the problem. The fixture set this replaces satisfied every existence check
 * it had while making the feature's central question undecidable: its seed order was a flat $30 with
 * no shipping, tax or discount, so "does an OrderValueGoal accrue order.Total or merchandise value?"
 * predicted the same $30.00 under both readings and no case built on it could fail whichever way the
 * module was implemented. The defect was found by reading source, not by any of 127 cases.
 *
 * So every test below perturbs the spec toward the PLAUSIBLE-LOOKING version — round the shipping to
 * zero, equalise two prices, make ALL and ANY agree, let the points target settle in the cash
 * currency — and asserts the guard NOTICES. A guard that only fails on nonsense is a guard that
 * passes on the exact edit a well-meaning tidy-up makes.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MISSIONS, MISSION_BY_ALIAS, PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT, POINTS_PRODUCT, TARGET_PRODUCTS,
  OWNED_PRODUCTS, PROGRESS_ORDER, POINTS_ORDER, PROGRESS_ORDERS, PROGRESS_ORDER_ALIAS,
  POINTS_ORDER_ALIAS, PROGRESS_ORDER_COUNT, REWARD_SPEND, FIXTURE_LIMITS,
  ORDER_VALUE_READINGS, READING_ORDER, orderMoney, readingValues, separatorTarget,
  predictOrderValueByReading, readingsConsistentWith, orderValueDecisionTable, decisionRowSignature,
  rewardBuysUnits, lineUnitPrice, progressOrderQuantities, progressOrderNumber,
  predictProgress, goalItemQuantities, goalSlotsFor, validateSpecShape, validateSeededMoney,
} from '../seed-data/loyalty/missions-specs.mjs';

/** Mutate one key, run the assertion, always restore. */
function withMutation(target, key, value, assertFn) {
  const original = target[key];
  target[key] = value;
  try { assertFn(); } finally { target[key] = original; }
}

const problemsMentioning = (needle, run = validateSpecShape) => run().filter((p) => p.includes(needle));
const spec = (alias) => MISSION_BY_ALIAS[alias];

/* ── The money model ─────────────────────────────────────────────────────── */

test('the committed spec is clean, so every failure below is caused by the mutation and not by drift', () => {
  assert.deepEqual(validateSpecShape(), []);
});

test('the seed orders compose four STRICTLY INCREASING, distinct readings', () => {
  const v = readingValues(orderMoney());
  for (let i = 1; i < READING_ORDER.length; i++) {
    const lo = READING_ORDER[i - 1]; const hi = READING_ORDER[i];
    assert.ok(v[hi] > v[lo], `${hi} (${v[hi]}) must exceed ${lo} (${v[lo]}) — equal readings are indistinguishable in the data`);
  }
  assert.equal(new Set(Object.values(v)).size, READING_ORDER.length, 'no two readings may share a value');
});

test('the money composition matches what the platform was MEASURED to do', () => {
  // total = subTotal - discountTotal + shippingTotal + taxTotal, and a loyalty-currency line
  // contributes to neither subTotal nor total. Both measured live on vcst-qa 2026-08-28.
  const m = orderMoney();
  assert.equal(m.netMerchandise, Number((m.grossMerchandise - m.discountTotal).toFixed(2)));
  assert.equal(m.orderTotal, Number((m.netMerchandise + m.shippingTotal + m.taxTotal).toFixed(2)));
  assert.equal(m.totalPlusPoints, Number((m.orderTotal + m.pointsLineValue).toFixed(2)));
  assert.ok(m.pointsLineValue > 0, 'the points contribution must be non-zero or the fourth reading collapses onto the third');
});

test('a line unit price comes from the product, and an order line may override it', () => {
  assert.equal(lineUnitPrice({ slot: 'A' }), PERSKU_PRODUCTS[0].listPrice);
  assert.equal(lineUnitPrice({ slot: 'A', unitPrice: 7 }), 7, 'the points line carries its own price because we do not own that product');
});

test('DROPPING THE SHIPPING CHARGE is caught — it is what collapses merchandise onto total', () => {
  withMutation(PROGRESS_ORDER, 'shippingPrice', 0, () => {
    const hits = problemsMentioning('NO shipping and NO tax');
    assert.ok(hits.length, 'a zero shipping charge must be reported: it is the exact shape of the flat $30 order this set replaced');
  });
});

test('DROPPING THE LINE DISCOUNT is caught — it collapses gross onto net merchandise', () => {
  const lineA = PROGRESS_ORDER.lines[0];
  withMutation(lineA, 'unitDiscount', 0, () => {
    assert.ok(problemsMentioning('NO line discount').length);
  });
});

test('REMOVING THE POINTS LINE is caught — it makes the points question unfalsifiable', () => {
  withMutation(POINTS_ORDER.lines[0], 'quantity', 0, () => {
    const p = validateSpecShape();
    assert.ok(
      p.some((x) => x.includes('no seed order carries a loyalty-currency line') || x.includes('needs a positive quantity')),
      'a points line of zero must not pass silently',
    );
  });
});

test('two readings drifting within a cent of each other is caught before they actually merge', () => {
  // Shipping just above the discount leaves orderTotal a hair above grossMerchandise: still ordered,
  // still "passing" any strict-increase check, and one price edit away from being wrong.
  const m = orderMoney();
  const barelyAbove = Number((m.discountTotal + 0.10).toFixed(2));
  withMutation(PROGRESS_ORDER, 'shippingPrice', barelyAbove, () => {
    assert.ok(problemsMentioning('apart').length, 'a sub-threshold gap must be reported, not merely a zero one');
  });
});

/* ── Separator targets ───────────────────────────────────────────────────── */

test('every OrderValue target is DERIVED from a separator, never a literal', () => {
  for (const m of MISSIONS.filter((x) => x.goal?.type === 'OrderValueGoal')) {
    assert.ok(Array.isArray(m.separates) && m.separates.length === 2, `${m.aliasName} must declare which two readings it separates`);
    assert.equal(m.goal.value, separatorTarget(m.separates[0], m.separates[1]), `${m.aliasName}'s target must equal its own separator midpoint`);
  }
});

test('every target sits STRICTLY inside the gap it claims to divide', () => {
  const v = readingValues(orderMoney());
  for (const m of MISSIONS.filter((x) => x.goal?.type === 'OrderValueGoal')) {
    const [above, below] = m.separates;
    assert.ok(v[above] < m.goal.value && m.goal.value < v[below], `${m.aliasName}: ${v[above]} < ${m.goal.value} < ${v[below]}`);
  }
});

test('a target hand-edited outside its band is caught', () => {
  const m = spec('MSN_ORDERVALUE');
  withMutation(m, 'goal', { ...m.goal, value: 250 }, () => {
    assert.ok(problemsMentioning('does not sit strictly between').length, 'the old literal 250 must now be rejected');
  });
});

/* ── The decision table ──────────────────────────────────────────────────── */

test('the decision table gives every reading a UNIQUE completion signature', () => {
  const table = orderValueDecisionTable();
  assert.equal(table.length, READING_ORDER.length);
  const sigs = table.map(decisionRowSignature);
  assert.equal(new Set(sigs).size, sigs.length, `two readings share a signature: ${sigs.join(' / ')} — an observation could not name which figure the goal read`);
});

test('every cell of the decision table carries a distinct percentage per column', () => {
  // Even a single card read off the storefront should name the reading, not just the full set.
  const table = orderValueDecisionTable();
  const columns = table[0].cells.length;
  for (let c = 0; c < columns; c++) {
    const pcts = table.map((r) => r.cells[c].percentage);
    const nonSaturated = pcts.filter((p) => p < 100);
    assert.equal(new Set(nonSaturated).size, nonSaturated.length, `column ${table[0].cells[c].aliasName} repeats a partial percentage: ${pcts.join(', ')}`);
  }
});

test('collapsing the OrderValue set to one fixture is caught by the signature rule', () => {
  const net = spec('MSN_ORDERVALUE_NET');
  const ov = spec('MSN_ORDERVALUE');
  // Point NET at the same separator as ORDERVALUE: the two now agree on every reading, and the
  // net-vs-gross question becomes unanswerable while both fixtures still seed perfectly.
  withMutation(net, 'separates', ['grossMerchandise', 'orderTotal'], () => {
    withMutation(net, 'goal', { ...net.goal, value: ov.goal.value }, () => {
      assert.ok(problemsMentioning('SAME completion pattern').length, 'two readings sharing a pattern must be reported');
    });
  });
});

test('predictOrderValueByReading returns a status and percentage per reading, and nothing for other goals', () => {
  const p = predictOrderValueByReading(spec('MSN_ORDERVALUE'));
  assert.deepEqual(Object.keys(p).sort(), [...READING_ORDER].sort());
  assert.equal(p.orderTotal.status, 'Completed', 'the implemented reading (order.Total) must complete MSN_ORDERVALUE');
  assert.equal(p.grossMerchandise.status, 'InProgress', 'a merchandise reading must NOT complete it — that is the whole discrimination');
  assert.equal(predictOrderValueByReading(spec('MSN_ORDERCOUNT')), null);
});

/* ── readingsConsistentWith: the falsifiability check itself ─────────────── */

test('an observed accrual naming exactly one reading is the success case', () => {
  const v = readingValues(orderMoney());
  for (const key of READING_ORDER) {
    assert.deepEqual(readingsConsistentWith(v[key]), [key], `${v[key]} must identify ${key} alone`);
  }
});

test('an accrual matching NOTHING is reported as such, and is a finding rather than a fixture fault', () => {
  assert.deepEqual(readingsConsistentWith(1234.56), []);
});

test('an accrual matching TWO readings is possible only when the fixture has stopped discriminating', () => {
  // Force a collapse by removing every lever, then confirm one number satisfies two readings.
  withMutation(PROGRESS_ORDER, 'shippingPrice', 0, () => {
    withMutation(PROGRESS_ORDER.lines[0], 'unitDiscount', 0, () => {
      const m = orderMoney();
      assert.ok(readingsConsistentWith(m.orderTotal, m).length > 1, 'with no shipping and no discount, one figure must satisfy several readings');
    });
  });
});

test('a null, empty or non-numeric observation never silently matches a reading', () => {
  for (const bad of [null, undefined, '', 'n/a', NaN]) {
    assert.deepEqual(readingsConsistentWith(bad), [], `${JSON.stringify(bad)} must match nothing — silence is never a pass`);
  }
});

/* ── The ALL / ANY minimal-difference pair ───────────────────────────────── */

test('ALL and ANY target the SAME slots at the SAME quantities', () => {
  assert.deepEqual(goalItemQuantities(spec('MSN_PERSKU_ALL')), goalItemQuantities(spec('MSN_PERSKU_ANY')));
});

test('ALL and ANY DIVERGE on both status and percentage against the seed orders', () => {
  const a = predictProgress(spec('MSN_PERSKU_ALL'));
  const b = predictProgress(spec('MSN_PERSKU_ANY'));
  assert.notEqual(a.status, b.status, 'a control pair that cannot disagree tests nothing');
  assert.notEqual(a.percentage, b.percentage, 'the ANY percentage is binary and the ALL one is a clamped sum — equal numbers hide that');
});

test('the OLD quantities — the ones that made ALL and ANY agree — are caught', () => {
  // Before the rewrite both inherited the defaults, which are exactly what the order buys, so both
  // sat at Completed 100% and an implementation ignoring `all` entirely would have passed.
  const all = spec('MSN_PERSKU_ALL');
  const any = spec('MSN_PERSKU_ANY');
  withMutation(all, 'goalItemQuantities', { A: 2, B: 1 }, () => {
    withMutation(any, 'goalItemQuantities', { A: 2, B: 1 }, () => {
      const p = validateSpecShape();
      assert.ok(p.some((x) => x.includes('both reach') || x.includes('both report')), 'an agreeing ALL/ANY pair must be reported');
    });
  });
});

test('changing only ONE half of the pair is caught as a two-variable comparison', () => {
  withMutation(spec('MSN_PERSKU_ANY'), 'goalItemQuantities', { A: 1, B: 1 }, () => {
    assert.ok(problemsMentioning('differs in TWO variables').length);
  });
});

/* ── The points-currency axis ────────────────────────────────────────────── */

test('the points target is a real slot, bought by a seed order, and alone on its mission', () => {
  assert.deepEqual(goalSlotsFor(spec('MSN_PERSKU_PTS')), [POINTS_PRODUCT.slot]);
  assert.ok(progressOrderQuantities()[POINTS_PRODUCT.slot] > 0, 'nothing buys the points target, so the mission would read 0% either way');
  assert.equal(spec('MSN_PERSKU_PTS').goal.all, false, 'a single target plus all=true adds a variable the case is not asking about');
});

test('the points target must not share a currency intent with the cash targets', () => {
  assert.notEqual(POINTS_PRODUCT.currencyIntent, PERSKU_PRODUCTS[0].currencyIntent);
  withMutation(POINTS_PRODUCT, 'currencyIntent', PERSKU_PRODUCTS[0].currencyIntent, () => {
    assert.ok(problemsMentioning('share the currency intent').length);
  });
});

test('the order COUNT target is derived from the number of orders, so it cannot go quietly stale', () => {
  assert.equal(PROGRESS_ORDER_COUNT, PROGRESS_ORDERS.length);
  assert.equal(spec('MSN_ORDERCOUNT').goal.count, PROGRESS_ORDER_COUNT);
  assert.equal(predictProgress(spec('MSN_ORDERCOUNT')).status, 'Completed', 'it completes iff the all-points order counted');
});

test('the two seed orders have distinct keys and distinct order numbers', () => {
  const numbers = PROGRESS_ORDERS.map((o) => progressOrderNumber(o));
  assert.equal(new Set(numbers).size, numbers.length);
  withMutation(POINTS_ORDER, 'key', PROGRESS_ORDER.key, () => {
    assert.ok(problemsMentioning('share the key').length, 'two orders resolving to one number would silently place a single order');
  });
});

/* ── Currency and stepper pinning on the products ────────────────────────── */

test('every cash-side target declares ONE currency intent — the rejected mixed-currency bug', () => {
  const intents = new Set([...PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT].map((p) => p.currencyIntent));
  assert.equal(intents.size, 1);
  withMutation(PERSKU_PRODUCTS[1], 'currencyIntent', 'store-alternate', () => {
    assert.ok(problemsMentioning('different currency intents').length);
  });
});

test('the two cash targets are priced DIFFERENTLY, so row arithmetic is falsifiable', () => {
  assert.notEqual(PERSKU_PRODUCTS[0].listPrice, PERSKU_PRODUCTS[1].listPrice);
});

test('a pack size or minimum quantity above 1 is caught — it makes "set the stepper to 1" unreachable', () => {
  // Measured: the product this fixture used to discover into slot B (55557702) carries minQuantity 2.
  withMutation(PERSKU_PRODUCTS[1], 'minQuantity', 2, () => {
    assert.ok(problemsMentioning('the storefront stepper jumps').length);
  });
  withMutation(PERSKU_PRODUCTS[0], 'packSize', 2, () => {
    assert.ok(problemsMentioning('the storefront stepper jumps').length);
  });
});

test('a buyable target that starts tracking inventory is caught — it would drain and block cases', () => {
  withMutation(PERSKU_PRODUCTS[0], 'trackInventory', true, () => {
    assert.ok(problemsMentioning('tracks inventory').length);
  });
});

test('the zero-stock fixture still tracks inventory, and is the only one that does', () => {
  assert.equal(ZERO_STOCK_PRODUCT.trackInventory, true);
  assert.equal(ZERO_STOCK_PRODUCT.inStockQuantity, 0);
  for (const p of PERSKU_PRODUCTS) assert.equal(p.trackInventory, false);
});

test('the points product is FOUND, not owned, so teardown can never delete it', () => {
  assert.equal(POINTS_PRODUCT.created, false);
  assert.ok(!OWNED_PRODUCTS.includes(POINTS_PRODUCT));
  assert.ok(OWNED_PRODUCTS.includes(ZERO_STOCK_PRODUCT));
  assert.equal(OWNED_PRODUCTS.length, TARGET_PRODUCTS.length - 1);
  assert.ok(!POINTS_PRODUCT.sku, 'it must not transcribe a SKU another fixture owns — it resolves through sourceAlias');
});

/* ── Reward spendability ─────────────────────────────────────────────────── */

test('rewardBuysUnits floors, and never divides by zero', () => {
  assert.equal(rewardBuysUnits(500, 1), 500);
  assert.equal(rewardBuysUnits(7, 2), 3);
  assert.equal(rewardBuysUnits(500, 0), 0);
});

test('the reward covers a real multi-unit purchase of the points-priced line', () => {
  const reward = MISSION_BY_ALIAS[REWARD_SPEND.rewardAlias].reward;
  assert.ok(rewardBuysUnits(reward, POINTS_PRODUCT.listPrice) >= REWARD_SPEND.minSpendableUnits);
  assert.ok(REWARD_SPEND.minSpendableUnits >= 2, 'at one unit, "covers a purchase" and "equals the cheapest price" are the same observation');
});

test('a reward too small to spend is caught', () => {
  const m = MISSION_BY_ALIAS[REWARD_SPEND.rewardAlias];
  withMutation(m, 'reward', 1, () => {
    withMutation(POINTS_PRODUCT, 'listPrice', 10, () => {
      assert.ok(problemsMentioning('cannot pay for a real next order').length);
    });
  });
});

/* ── The observed-state guard ────────────────────────────────────────────── */

/** A seeded overlay in which everything landed exactly as the spec predicts. */
function goodOverlay() {
  const m = orderMoney();
  const v = readingValues(m);
  const o = {
    [PROGRESS_ORDER_ALIAS]: {
      id: 'x', currency: 'USD',
      observed_sub_total: String(m.grossMerchandise),
      observed_discount_total: String(m.discountTotal),
      observed_shipping_total: String(m.shippingTotal),
      observed_tax_total: String(m.taxTotal),
      observed_total: String(m.orderTotal),
    },
    [POINTS_ORDER_ALIAS]: { id: 'y', currency: 'PTS', observed_line_value: String(m.pointsLineValue), observed_total: String(m.pointsLineValue) },
    [POINTS_PRODUCT.aliasName]: { currency: 'PTS' },
    [REWARD_SPEND.aliasName]: {
      reward: String(MISSION_BY_ALIAS[REWARD_SPEND.rewardAlias].reward),
      unit_price: String(POINTS_PRODUCT.listPrice),
    },
  };
  for (const p of [...PERSKU_PRODUCTS, ZERO_STOCK_PRODUCT]) o[p.aliasName] = { currency: 'USD' };
  // Every store-default money goal accrued the implemented reading.
  for (const mission of MISSIONS.filter((x) => x.goal?.type === 'OrderValueGoal' && x.goal?.currency === 'store-default')) {
    o[mission.aliasName] = { accrued_value_at_seed: String(v.orderTotal) };
  }
  o.MSN_ORDERVALUE_ALTCURRENCY = { accrued_value_at_seed: '0' };
  return o;
}

test('a fully-landed seed passes the observed-state guard', () => {
  assert.deepEqual(validateSeededMoney(goodOverlay()), []);
});

test('an UNSEEDED overlay reports exactly one problem, never silence', () => {
  const p = validateSeededMoney({});
  assert.equal(p.length, 1);
  assert.ok(p[0].includes('no observed money shape'));
});

test('shipping the platform silently DROPPED is caught from the overlay alone', () => {
  const o = goodOverlay();
  const m = orderMoney();
  o[PROGRESS_ORDER_ALIAS].observed_shipping_total = '0';
  o[PROGRESS_ORDER_ALIAS].observed_total = String(m.netMerchandise);
  const p = validateSeededMoney(o);
  assert.ok(p.some((x) => x.includes('both zero')), 'a dropped shipping charge is the flat-$30 defect returning by another route');
});

test('an accrual that matches no reading is reported as a finding about the module', () => {
  const o = goodOverlay();
  o.MSN_ORDERVALUE.accrued_value_at_seed = '999.99';
  assert.ok(validateSeededMoney(o).some((x) => x.includes('matches NONE of the four readings')));
});

test('a missing accrual record is caught — an unchecked fixture is not a passing one', () => {
  const o = goodOverlay();
  delete o.MSN_ORDERVALUE.accrued_value_at_seed;
  assert.ok(validateSeededMoney(o).some((x) => x.includes('no accrued_value_at_seed was recorded')));
});

test('the alt-currency control accruing anything is caught', () => {
  const o = goodOverlay();
  o.MSN_ORDERVALUE_ALTCURRENCY.accrued_value_at_seed = String(readingValues(orderMoney()).orderTotal);
  assert.ok(validateSeededMoney(o).some((x) => x.includes('accrued')));
});

test('a target product that RESOLVED to a second currency is caught — the rejected bug, made impossible', () => {
  const o = goodOverlay();
  o[PERSKU_PRODUCTS[1].aliasName].currency = 'EUR';
  const p = validateSeededMoney(o);
  assert.ok(p.some((x) => x.includes('different currencies')), 'the guard must read the currency the product ACTUALLY resolved to, not the one the spec asked for');
});

test('a points target that resolved into the cash currency is caught', () => {
  const o = goodOverlay();
  o[POINTS_PRODUCT.aliasName].currency = 'USD';
  assert.ok(validateSeededMoney(o).some((x) => x.includes('same currency as the cash targets')));
});

test('a missing points ORDER is caught, and named as indistinguishable from the defect it detects', () => {
  const o = goodOverlay();
  o[POINTS_ORDER_ALIAS].id = '';
  assert.ok(validateSeededMoney(o).some((x) => x.includes('was never placed')));
});

test('a reward that cannot be spent at the OBSERVED unit price is caught', () => {
  const o = goodOverlay();
  o[REWARD_SPEND.aliasName].unit_price = String(POINTS_PRODUCT.listPrice);
  o[REWARD_SPEND.aliasName].reward = '1';
  assert.ok(validateSeededMoney(o).some((x) => x.includes('below the')));
});

test('the points unit price drifting away from the spec is caught — every points target derives from it', () => {
  const o = goodOverlay();
  o[REWARD_SPEND.aliasName].unit_price = '5';
  assert.ok(validateSeededMoney(o).some((x) => x.includes('has drifted from the product it describes')));
});

/* ── Declared limits ─────────────────────────────────────────────────────── */

test('every fixture limit states a question AND why the set cannot answer it', () => {
  assert.ok(FIXTURE_LIMITS.length >= 1);
  for (const l of FIXTURE_LIMITS) {
    assert.ok(l.question && l.question.endsWith('?'), 'a limit must be phrased as the question it cannot answer');
    assert.ok(l.why && l.why.length > 80, 'a limit with no reason gets deleted by the next person who reads it');
  }
});

test('the readings vocabulary is documented, closed, and matches READING_ORDER', () => {
  assert.deepEqual([...READING_ORDER].sort(), Object.keys(ORDER_VALUE_READINGS).sort());
  for (const k of READING_ORDER) assert.ok(ORDER_VALUE_READINGS[k].length > 20, `${k} needs a real description`);
});
