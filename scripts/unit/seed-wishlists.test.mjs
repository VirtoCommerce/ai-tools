// Unit tests for the two-store wishlist fixture's pure logic (scripts/seed-data/wishlists/
// wishlist-specs.mjs). VCST-5705.
//
// The thing under test is NOT "does the seeder call the right endpoint" — it is "can this fixture
// still FAIL". FindWishlistsByProductsAsync accepted a storeId and never applied it; a fixture that
// quietly degrades into one store, one product, or one wishlist name makes CAT-079/CAT-080 pass while
// testing nothing, which re-enacts the defect inside the suite. Every assertion below pins one of the
// properties that keeps the fixture falsifiable, plus the derived slug/url rules (so the committed
// columns stay drift-guardable rather than hand-maintained).
//
// Pure — no env, no network (wishlist-specs is side-effect-free). Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'csv-parse/sync';
import {
  CSV_SOURCE, FIXTURE_KEY, RUNTIME_COLUMNS, SEED_PREFIX,
  loadFixture, productSpecs, wishlistSpecs, validateFixtureShape,
  deriveSlug, deriveUrl, buildContactBody, buildProductBody, buildLineItem, buildWishlistBody,
} from '../seed-data/wishlists/wishlist-specs.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const rows = parse(readFileSync(join(ROOT, 'test-data', CSV_SOURCE.file), 'utf8'), {
  columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true,
});
const rec = loadFixture(rows);

/** Deep-clone the parsed rows and patch one column, so a test can simulate drift without touching disk. */
const withColumn = (col, value) => rows.map((r) => ({ ...r, [col]: value }));

test('the committed fixture parses and is marked seeded', () => {
  assert.ok(rec, `a row with fixture_key=${FIXTURE_KEY} must exist`);
  assert.equal(rec.seeded, true);
  assert.equal(rec.fixtureKey, FIXTURE_KEY);
});

test('the committed fixture passes every shape assertion', () => {
  assert.deepEqual(validateFixtureShape(rows), []);
});

test('runtime columns are declared and blank in the committed CSV (multi-env rule)', () => {
  assert.deepEqual(RUNTIME_COLUMNS, ['store_a_id', 'store_b_id', 'contact_id', 'user_id', 'store_a_wishlist_id', 'store_b_wishlist_id']);
  for (const col of RUNTIME_COLUMNS) {
    assert.equal(String(rows[0][col] ?? '').trim(), '', `${col} must be blank — it is per-env/runtime`);
  }
});

test('store A and store B reference DIFFERENT products — the core non-vacuity property', () => {
  assert.notEqual(rec.stores.A.sku, rec.stores.B.sku);
  const problems = validateFixtureShape(withColumn('store_b_sku', rec.stores.A.sku));
  assert.ok(problems.some((p) => /SAME sku/.test(p)), 'a shared sku must be rejected');
});

test('the two wishlists have DIFFERENT names — idempotency keys on (storeId, name)', () => {
  assert.notEqual(rec.stores.A.listName, rec.stores.B.listName);
  const problems = validateFixtureShape(withColumn('store_b_list_name', rec.stores.A.listName));
  assert.ok(problems.some((p) => /both wishlists are named/i.test(p)));
});

test('the password is a {{VAR}} token, never a literal', () => {
  assert.match(rec.password, /^\{\{[A-Z0-9_]+\}\}$/);
  const problems = validateFixtureShape(withColumn('password', 'Password1!'));
  assert.ok(problems.some((p) => /password must be a \{\{VAR\}\} token/.test(p)));
});

test('everything disposable carries the AGENT-TEST- prefix so teardown sweeps exactly it', () => {
  assert.ok(rec.email.startsWith('agent-test-'));
  for (const role of ['A', 'B']) {
    assert.ok(rec.stores[role].productName.startsWith(SEED_PREFIX));
    assert.ok(rec.stores[role].listName.startsWith(SEED_PREFIX));
  }
  const problems = validateFixtureShape(withColumn('store_a_product_name', 'Innocent Product'));
  assert.ok(problems.some((p) => new RegExp(`must start with "${SEED_PREFIX}"`).test(p)));
});

test('slug and url are DERIVED, not hand-maintained', () => {
  for (const role of ['A', 'B']) {
    assert.equal(rec.stores[role].slug, deriveSlug(rec.stores[role].productName));
    assert.equal(rec.stores[role].url, deriveUrl(rec.categoryPath, rec.stores[role].productName));
  }
  const problems = validateFixtureShape(withColumn('store_a_url', '/some/hand/typed/path'));
  assert.ok(problems.some((p) => /!= derived/.test(p)));
});

test('both urls are store-RELATIVE — the case composes {{FRONT_URL}}@td(...)', () => {
  for (const role of ['A', 'B']) {
    const u = rec.stores[role].url;
    assert.ok(u.startsWith('/'), `${role} url must start with /`);
    assert.doesNotMatch(u, /^[a-z]+:\/\//i);
    assert.doesNotMatch(u, /\{\{/);
  }
  const problems = validateFixtureShape(withColumn('store_b_url', 'https://example.com/x'));
  assert.ok(problems.length > 0);
});

test('productSpecs puts the store-B product in STORE B\'s own catalog, store-A in the seed catalog', () => {
  const specs = productSpecs(rec);
  assert.deepEqual(specs.map((s) => s.role), ['A', 'B']);
  assert.equal(specs.find((s) => s.role === 'A').physicalCatalog, 'seed');
  // This is what makes the store-B product genuinely "available in that store" rather than a store-A
  // product with a store-B wishlist row pointing at it.
  assert.equal(specs.find((s) => s.role === 'B').physicalCatalog, 'storeB');
});

test('wishlistSpecs pairs each list with its own store\'s product', () => {
  const specs = wishlistSpecs(rec);
  assert.deepEqual(specs.map((s) => s.role), ['A', 'B']);
  assert.equal(specs[0].sku, rec.stores.A.sku);
  assert.equal(specs[1].sku, rec.stores.B.sku);
});

test('buildContactBody creates a PERSONAL customer — no org, so org-scoping cannot confound the case', () => {
  const body = buildContactBody(rec);
  assert.equal(body.memberType, 'Contact');
  assert.deepEqual(body.organizations, []);
  assert.deepEqual(body.emails, [rec.email]);
  assert.equal(body.status, 'Approved');
});

test('buildProductBody carries the code/name and the caller-supplied SEO record only', () => {
  const spec = productSpecs(rec)[0];
  const body = buildProductBody(spec, rec, { seoInfos: [{ semanticUrl: spec.slug }] });
  assert.equal(body.code, spec.sku);
  assert.equal(body.name, spec.name);
  assert.equal(body.isActive, true);
  assert.equal(body.trackInventory, true);
  assert.deepEqual(body.seoInfos, [{ semanticUrl: spec.slug }]);
});

test('buildWishlistBody produces a Wishlist-type cart pinned to one store, with items inline', () => {
  const item = buildLineItem({ id: 'p1', code: 'SKU-1', name: 'N', catalogId: 'c1', categoryId: 'cat1' }, rec);
  const body = buildWishlistBody({ listName: 'AGENT-TEST-L', storeId: 'StoreX', customerId: 'cust', customerName: 'Who', currency: 'USD', items: [item] });
  assert.equal(body.type, 'Wishlist');
  assert.equal(body.storeId, 'StoreX');
  assert.equal(body.customerId, 'cust');
  assert.equal(body.items.length, 1);
  // Items must ride the create body: POST /api/carts/{id}/items 500s on a Wishlist-type cart.
  assert.equal(body.items[0].sku, 'SKU-1');
  assert.equal(body.items[0].productId, 'p1');
  assert.equal(body.items[0].quantity, 1);
});

test('buildLineItem prices from the fixture and never emits a NaN', () => {
  const item = buildLineItem({ id: 'p', code: 'c', name: 'n', catalogId: 'cat' }, rec);
  assert.equal(item.listPrice, rec.listPrice);
  assert.ok(Number.isFinite(item.listPrice));
  const unpriced = buildLineItem({ id: 'p', code: 'c', name: 'n', catalogId: 'cat' }, { ...rec, listPrice: NaN });
  assert.equal(unpriced.listPrice, 0);
});

test('a missing fixture row is reported, not silently treated as empty', () => {
  assert.equal(loadFixture([]), null);
  assert.deepEqual(validateFixtureShape([]), [`no row with fixture_key="${FIXTURE_KEY}" in ${CSV_SOURCE.file}`]);
});
