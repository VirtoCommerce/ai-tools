/**
 * Unit tests for the /compare test-data domain (VCST-5735).
 *
 * These exercise the PURE half — compare-specs.mjs — with no env and no network. The point is not
 * that the current numbers are correct today; it is that each VACUITY guard actually FIRES when the
 * property it protects is removed. A guard nobody has watched fail is a guard nobody can trust, and
 * every failure mode here is silent by construction (a vacuous fixture produces a GREEN suite).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  PRODUCTS, byAlias, CATEGORY_PATHS, COMPARE_LIMIT_PER_CATEGORY, CSV_COLUMNS,
  csvRowFor, storefrontUrlFor, validateSpecShape, quantityDivergence,
  formatCollisionProblems, FORMAT_COLLISIONS, SEED_PREFIX, productSlug, xapiMinQuantity,
  variationPriceDivergence, variationsOf, hasVariations, minVariationPrice,
  variationLinkCount, formatMoney, VARIATION_MIN_COUNT, MIN_VARIATION_PRICE_ALWAYS_PRESENT,
} from '../seed-data/compare/compare-specs.mjs';

test('the committed spec set is internally clean', () => {
  assert.deepEqual(validateSpecShape(), []);
});

test('every fixture is AGENT-TEST-prefixed on BOTH code and name (teardown sweeps on it)', () => {
  for (const r of PRODUCTS) {
    assert.ok(r.code.startsWith(SEED_PREFIX), `${r.cmpId} code`);
    assert.ok(r.name.startsWith(SEED_PREFIX), `${r.cmpId} name`);
  }
});

test('aliases, cmp ids and SKUs are unique', () => {
  for (const field of ['alias', 'cmpId', 'code', 'name']) {
    const seen = new Set(PRODUCTS.map((r) => r[field]));
    assert.equal(seen.size, PRODUCTS.length, `duplicate ${field}`);
  }
});

// --- quantity divergence -----------------------------------------------------

test('PROD_MOQ and PROD_PACK share a tab and diverge on every quantity field', () => {
  const a = byAlias.PROD_MOQ, b = byAlias.PROD_PACK;
  assert.equal(a.categoryPath, b.categoryPath);
  assert.notEqual(a.minQuantity, b.minQuantity);
  assert.notEqual(a.packSize, b.packSize);
  assert.notEqual(a.maxQuantity, b.maxQuantity);
  assert.notEqual(a.stock, b.stock);
  assert.deepEqual(quantityDivergence(), []);
});

test('the STORED off-grid MOQ is rounded onto the pack grid by the read path (measured live)', () => {
  // PROD_PACK stores minQuantity 10 with packSize 4; xAPI reported 12 on vcst-qa 2026-09-03.
  // The rule is derived here rather than transcribed, so it cannot go stale against the fixture.
  assert.equal(xapiMinQuantity(byAlias.PROD_PACK), 12);
  assert.equal(byAlias.PROD_PACK.minQuantity, 10, 'the STORED value stays off-grid — that is the observation');
  assert.equal(xapiMinQuantity(byAlias.PROD_MOQ), byAlias.PROD_MOQ.minQuantity, 'packSize 1 leaves the minimum alone');
});

test('the divergence survives the pack-grid rounding — it is not a database-only difference', () => {
  assert.notEqual(xapiMinQuantity(byAlias.PROD_MOQ), xapiMinQuantity(byAlias.PROD_PACK));
});

test('quantityDivergence FIRES when two stored minimums round onto the SAME pack multiple', () => {
  // 9 and 10 differ in the database but both render as 12, so the compare columns would agree.
  const problems = quantityDivergence({ ...byAlias.PROD_MOQ, minQuantity: 9, packSize: 4 }, byAlias.PROD_PACK);
  assert.ok(problems.some((p) => p.includes('only in the database')), problems.join(' | '));
});

test('quantityDivergence FIRES when a quantity is equalised', () => {
  const a = { ...byAlias.PROD_MOQ };
  const b = { ...byAlias.PROD_PACK, packSize: a.packSize };
  const problems = quantityDivergence(a, b);
  assert.ok(problems.some((p) => p.includes('packSize')), problems.join(' | '));
});

test('quantityDivergence FIRES when the pair is split across two tabs', () => {
  const problems = quantityDivergence(byAlias.PROD_MOQ, { ...byAlias.PROD_PACK, categoryPath: CATEGORY_PATHS.C });
  assert.ok(problems.some((p) => p.includes('different tabs')), problems.join(' | '));
});

// --- formatted-string collision ---------------------------------------------

test('two INDEPENDENT format collisions are seeded, both inside one tab', () => {
  assert.equal(FORMAT_COLLISIONS.length, 2);
  assert.deepEqual(FORMAT_COLLISIONS.map((f) => f.id).sort(), ['availability', 'number-property']);
  for (const fc of FORMAT_COLLISIONS) {
    const a = byAlias[fc.a], b = byAlias[fc.b];
    assert.equal(a.categoryPath, b.categoryPath, fc.id);
    assert.notEqual(fc.read(a), fc.read(b), `${fc.id}: raw values must differ`);
  }
  assert.deepEqual(formatCollisionProblems(), []);
});

test('the numeric collision differs only in the 4th decimal (a 3-digit formatter rounds it away)', () => {
  const read = FORMAT_COLLISIONS.find((f) => f.id === 'number-property').read;
  const a = read(byAlias.PROD_CMP_A), b = read(byAlias.PROD_CMP_B);
  assert.notEqual(a, b);
  assert.equal(a.toFixed(3), b.toFixed(3));
});

test('the availability collision is two DIFFERENT positive stock levels', () => {
  const a = byAlias.PROD_CMP_A.stock, b = byAlias.PROD_CMP_B.stock;
  assert.ok(a > 0 && b > 0);
  assert.notEqual(a, b);
});

// --- properties --------------------------------------------------------------

test('Alpha and Beta carry a shared, a differing and a BOOLEAN property', () => {
  const get = (rec, n) => rec.properties.find((p) => p.name === n);
  const a = byAlias.PROD_CMP_A, b = byAlias.PROD_CMP_B;
  assert.equal(get(a, 'AgentTestCompareShared').value, get(b, 'AgentTestCompareShared').value);
  assert.notEqual(get(a, 'AgentTestCompareDiffers').value, get(b, 'AgentTestCompareDiffers').value);
  const fa = get(a, 'AgentTestCompareFlag'), fb = get(b, 'AgentTestCompareFlag');
  assert.equal(fa.valueType, 'Boolean');
  assert.equal(fb.valueType, 'Boolean');
  assert.notEqual(fa.value, fb.value);
});

test('one property is present on exactly one of the pair (the row must still render)', () => {
  const a = byAlias.PROD_CMP_A, b = byAlias.PROD_CMP_B;
  assert.ok(a.properties.some((p) => p.name === 'AgentTestCompareOnlyOnAlpha'));
  assert.ok(!b.properties.some((p) => p.name === 'AgentTestCompareOnlyOnAlpha'));
});

test('the row-key collision fixture carries properties named exactly like built-in rows', () => {
  const names = byAlias.PROD_PROP_PRICE.properties.map((p) => p.name);
  for (const n of ['Price', 'SKU', 'Availability']) assert.ok(names.includes(n), n);
});

test('an inline property with no value is rejected — it would silently not be created', () => {
  const names = PRODUCTS.flatMap((r) => (r.properties || []).map((p) => p.value));
  for (const v of names) assert.ok(v !== null && v !== undefined && v !== '');
});

// --- the hasVariations branch ------------------------------------------------
// compare-table.vue branches isConfigurable / hasVariations / plain, and getDisplayPrice() returns
// minVariationPrice on the middle branch and price on the other two. Everything below exists to
// keep those two values APART: equalise them and the column renders one string either way, so a
// case cannot tell a correct implementation from one that took the wrong branch.

const VAR = () => byAlias.PROD_CMP_VARIATIONS;
const clone = (over = {}) => ({ ...VAR(), ...over });

test('exactly one fixture takes the hasVariations branch, and it sits in Group A', () => {
  const withVars = PRODUCTS.filter(hasVariations);
  assert.equal(withVars.length, 1);
  assert.equal(withVars[0].alias, 'PROD_CMP_VARIATIONS');
  assert.equal(withVars[0].categoryPath, CATEGORY_PATHS.A, 'it must share a tab with plain products');
  assert.deepEqual(variationPriceDivergence(), []);
});

test('the parent price and the minimum variation price DIVERGE, raw and formatted', () => {
  const v = VAR();
  const min = minVariationPrice(v);
  assert.notEqual(min, v.listPrice);
  assert.notEqual(formatMoney(min), formatMoney(v.listPrice));
  assert.equal(min, 34.99);
  assert.equal(v.listPrice, 89.99);
});

test('minVariationPrice is the MINIMUM over the variations, not the first or the parent', () => {
  assert.equal(minVariationPrice(clone({ variations: [
    { code: 'AGENT-TEST-X1', name: 'AGENT-TEST-X1', listPrice: 70, stock: 1 },
    { code: 'AGENT-TEST-X2', name: 'AGENT-TEST-X2', listPrice: 12.5, stock: 1 },
    { code: 'AGENT-TEST-X3', name: 'AGENT-TEST-X3', listPrice: 40, stock: 1 },
  ] })), 12.5);
  assert.equal(minVariationPrice({ ...VAR(), variations: [] }), null, 'a plain product has no minimum variation price at all');
});

test('at least three variations, so the rendered count is not a coincidence', () => {
  assert.ok(variationsOf(VAR()).length >= VARIATION_MIN_COUNT);
  assert.equal(variationLinkCount(VAR()), variationsOf(VAR()).length + 1);
});

test('every variation is AGENT-TEST-prefixed on code AND name, and priced and stocked', () => {
  for (const v of variationsOf(VAR())) {
    assert.ok(v.code.startsWith(SEED_PREFIX), v.code);
    assert.ok(v.name.startsWith(SEED_PREFIX), v.name);
    assert.ok(Number(v.listPrice) > 0, v.code);
    assert.ok(Number(v.stock) > 0, v.code);
  }
});

test('variation codes and names never collide with a product code or name', () => {
  const products = PRODUCTS.flatMap((r) => [r.code, r.name]);
  for (const v of PRODUCTS.flatMap(variationsOf)) {
    assert.ok(!products.includes(v.code), `variation code ${v.code} collides with a product code`);
    assert.ok(!products.includes(v.name), `variation name ${v.name} collides with a product name`);
  }
});

// --- the guard FIRES ---------------------------------------------------------
// This is the half that matters. A guard nobody has watched fail is a guard nobody can trust, and
// every one of these collapses silently — a vacuous fixture produces a GREEN suite.

test('variationPriceDivergence FIRES when minVariationPrice EQUALS the parent price', () => {
  // Precisely the state INV_VARIATION_MASTER is in ($59.99 on both), which is why it could not be
  // reused for this branch.
  const problems = variationPriceDivergence(clone({ listPrice: 34.99 }));
  assert.ok(problems.some((p) => p.includes('EQUALS the parent price')), problems.join(' | '));
});

test('variationPriceDivergence FIRES when the raw gap is small enough for the money formatter to eat', () => {
  const problems = variationPriceDivergence(clone({
    listPrice: 34.994,
    variations: [
      { code: 'AGENT-TEST-Y1', name: 'AGENT-TEST-Y1', listPrice: 34.99, stock: 3 },
      { code: 'AGENT-TEST-Y2', name: 'AGENT-TEST-Y2', listPrice: 44.99, stock: 3 },
      { code: 'AGENT-TEST-Y3', name: 'AGENT-TEST-Y3', listPrice: 54.99, stock: 3 },
    ],
  }));
  assert.ok(problems.some((p) => p.includes('format to')), problems.join(' | '));
});

test('variationPriceDivergence FIRES on fewer than three variations', () => {
  const problems = variationPriceDivergence(clone({ variations: variationsOf(VAR()).slice(0, 2) }));
  assert.ok(problems.some((p) => p.includes('at least')), problems.join(' | '));
});

test('variationPriceDivergence FIRES when two variations tie at the minimum', () => {
  const [a, b, c] = variationsOf(VAR());
  const problems = variationPriceDivergence(clone({ variations: [a, { ...b, listPrice: a.listPrice }, c] }));
  assert.ok(problems.some((p) => p.includes('tie')), problems.join(' | '));
});

test('variationPriceDivergence FIRES on an UNPRICED variation (it inherits the parent price live)', () => {
  const [a, ...rest] = variationsOf(VAR());
  const problems = variationPriceDivergence(clone({ variations: [{ ...a, listPrice: 0 }, ...rest] }));
  assert.ok(problems.some((p) => p.includes('INHERITS')), problems.join(' | '));
});

test('variationPriceDivergence FIRES when the fixture has no PLAIN tab-mate', () => {
  const problems = variationPriceDivergence(clone({ categoryPath: 'Compare Fixtures > Group Z' }));
  assert.ok(problems.some((p) => p.includes('no PLAIN tab-mate')), problems.join(' | '));
});

test('validateSpecShape carries the variation guard, so the SEEDER aborts on a vacuous edit', () => {
  const v = VAR();
  const original = v.listPrice;
  try {
    v.listPrice = minVariationPrice(v);          // equalise
    assert.ok(validateSpecShape().some((p) => p.includes('EQUALS the parent price')));
  } finally {
    v.listPrice = original;
  }
});

test('the missing-minVariationPrice fallback is recorded as NOT buildable, not as a gap to fill', () => {
  // Measured live on vcst-qa 2026-09-03: an unpriced variation inherits the parent's price, and a
  // deactivated one flips hasVariations to false — minVariationPrice is never null. Pinned so the
  // finding is not quietly re-opened as "someone forgot to seed it".
  assert.equal(MIN_VARIATION_PRICE_ALWAYS_PRESENT, true);
});

// --- tabs --------------------------------------------------------------------

test('Group A exceeds the per-category limit so the cap is observable', () => {
  const n = PRODUCTS.filter((r) => r.categoryPath === CATEGORY_PATHS.A).length;
  assert.ok(n > COMPARE_LIMIT_PER_CATEGORY, `Group A holds ${n}, limit ${COMPARE_LIMIT_PER_CATEGORY}`);
});

test('the nested pair is depth 1 vs depth 2 under a SAME-NAMED parent', () => {
  const seg = (p) => p.split('>').map((s) => s.trim()).filter(Boolean);
  const parent = seg(byAlias.PROD_CMP_PARENT.categoryPath);
  const child = seg(byAlias.PROD_CMP_CHILD.categoryPath);
  assert.equal(parent.length, 1);
  assert.equal(child.length, 2);
  assert.equal(child[0], parent[0]);
  assert.equal(child[1], child[0], 'the label collision requires both levels to be named identically');
});

test('renaming the nested child breaks the label collision LOUDLY', () => {
  const original = byAlias.PROD_CMP_CHILD.categoryPath;
  try {
    byAlias.PROD_CMP_CHILD.categoryPath = 'Compare Nested > Something Else';
    const problems = validateSpecShape();
    assert.ok(problems.some((p) => p.includes('named identically')), problems.join(' | '));
  } finally {
    byAlias.PROD_CMP_CHILD.categoryPath = original;
  }
});

test('the uncategorized fixture has no category path at all', () => {
  assert.equal(byAlias.PROD_CMP_NOCAT.categoryPath, '');
});

test('at least three distinct tabs exist among the categorised fixtures', () => {
  const tabs = new Set(PRODUCTS.filter((r) => r.categoryPath).map((r) => r.categoryPath));
  assert.ok(tabs.size >= 3, [...tabs].join(' | '));
});

// --- CSV mirror --------------------------------------------------------------

test('the variation columns are derived, and a plain product advertises none', () => {
  const v = csvRowFor(byAlias.PROD_CMP_VARIATIONS);
  assert.equal(v.variation_count, '3');
  assert.equal(v.min_variation_price, '34.99');
  const plain = csvRowFor(byAlias.PROD_CMP_A);
  assert.equal(plain.variation_count, '0');
  assert.equal(plain.min_variation_price, '', 'a plain row must not let a case assert the variations semantic');
});

test('csvRowFor derives every committed column and leaves platform_id blank', () => {
  for (const rec of PRODUCTS) {
    const row = csvRowFor(rec);
    assert.equal(row.platform_id, '', `${rec.cmpId}: a runtime GUID must never reach the CSV`);
    for (const col of CSV_COLUMNS) {
      if (col === 'test_purpose' || col === 'notes') continue;   // hand-authored prose
      assert.ok(col in row, `${rec.cmpId}: ${col} is not derived`);
    }
  }
});

test('the storefront path is store-relative and carries no host', () => {
  for (const rec of PRODUCTS) {
    const url = storefrontUrlFor(rec);
    assert.ok(url.startsWith('/'), `${rec.cmpId}: ${url}`);
    assert.ok(!/^https?:/i.test(url), `${rec.cmpId}: ${url}`);
    assert.ok(url.endsWith(`/${productSlug(rec.name)}`), `${rec.cmpId}: ${url}`);
  }
});

test('the uncategorized fixture gets a path with no category segment', () => {
  assert.equal(storefrontUrlFor(byAlias.PROD_CMP_NOCAT), `/${productSlug(byAlias.PROD_CMP_NOCAT.name)}`);
});

test('the long-name fixture carries an unbreakable run a browser cannot wrap', () => {
  const longestRun = Math.max(...byAlias.PROD_LONGNAME.name.split(/[^0-9A-Za-z]+/).map((w) => w.length));
  assert.ok(longestRun >= 40, `longest unbroken run is ${longestRun} chars — too short to overflow a 112px column`);
});
