/**
 * scripts/seed-data/wishlists/wishlist-specs.mjs
 *
 * SINGLE orchestration source for the two-store wishlist fixture (VCST-5705). Side-effect-free — no
 * env load, no network, no main() — so the seeder (seed-wishlists.mjs), the drift guard
 * (validate-wishlist-data.mjs) and the unit tests all import the SAME rules.
 *
 * WHAT THE FIXTURE IS, AND WHY ITS SHAPE MATTERS
 * ----------------------------------------------
 * ONE customer holding TWO wishlists in TWO DIFFERENT stores, each containing a DIFFERENT product.
 * VCST-5705 fixed `FindWishlistsByProductsAsync`, which accepted a `storeId` and never applied it, so
 * the storefront's in-wishlist marker returned wishlist ids from EVERY store the customer had a
 * wishlist in. On a single-store environment the regression test passes while testing nothing — the
 * exact failure mode the fix exists to prevent. Three properties are therefore load-bearing, and none
 * of them is visible from the CSV row alone (which is why they are declared here and drift-guarded):
 *
 *   1. TWO GENUINELY DIFFERENT STORES. Store A is {{STORE_ID}}, store B is {{STORE_ID_SECONDARY}}.
 *      If they resolve to the same store, or store B does not exist on the env, the fixture is a
 *      single-store fixture wearing a two-store label — the seeder REFUSES rather than seeding it.
 *   2. DISTINCT PRODUCTS. Same product in both wishlists cannot distinguish "leaked the other store's
 *      wishlist id" from "correctly reported this store's".
 *   3. THE STORE-B PRODUCT IS CO-VISIBLE IN STORE A. CAT-079 looks for the store-B product's card on
 *      store A's /catalog page and asserts it carries NO marker. If that card is not on the page the
 *      assertion cannot fail, so the case is vacuous again. Hence the store-B product is created
 *      PHYSICALLY in store B's own catalog (genuinely available there) and additionally LINKED into
 *      store A's virtual catalog under the ad-hoc category.
 *
 * SOURCE OF TRUTH: test-data/wishlists/two-store-wishlists.csv is the input; this module adds only what
 * a flat row cannot express (the slug/url derivation rule, the API body shapes, the runtime-column
 * contract, the shape assertions). Runtime GUIDs live ONLY in aliases.<env>.json.
 */

import { productSlug, storefrontPathForAdHoc } from '../products/standard-specs.mjs';

/** The CSV this fixture is driven by + how each column maps onto the record the seeder works with. */
export const CSV_SOURCE = {
  key: 'wishlists/two-store-wishlists',
  file: 'wishlists/two-store-wishlists.csv',
  map: {
    fixtureKey: 'fixture_key',
    email: 'email',
    password: 'password',
    firstName: 'first_name',
    lastName: 'last_name',
    fullName: 'full_name',
    storeAListName: 'store_a_list_name',
    storeBListName: 'store_b_list_name',
    storeASku: 'store_a_sku',
    storeAProductName: 'store_a_product_name',
    storeASlug: 'store_a_slug',
    storeAUrl: 'store_a_url',
    storeBSku: 'store_b_sku',
    storeBProductName: 'store_b_product_name',
    storeBSlug: 'store_b_slug',
    storeBUrl: 'store_b_url',
    categoryPath: 'category_path',
    listPrice: 'list_price',
    currency: 'currency',
    stockQty: 'stock_qty',
    seeded: 'seeded',
  },
};

/** The one fixture row this seeder owns. */
export const FIXTURE_KEY = 'WISH_TWO_STORE';

/**
 * Columns that hold RUNTIME, server-generated values. They MUST be empty in the committed CSV and are
 * written per-env to aliases.<env>.json instead. `store_a_id`/`store_b_id` are in here not because a
 * store id is a GUID (it is a human-assigned string) but because it is PER-ENV: it comes from
 * STORE_ID / STORE_ID_SECONDARY, which differ between deployments. Committing either would make a
 * suite run against another env resolve the wrong store — the same class of bug as a committed GUID.
 */
export const RUNTIME_COLUMNS = [
  'store_a_id', 'store_b_id', 'contact_id', 'user_id', 'store_a_wishlist_id', 'store_b_wishlist_id',
];

/** Everything disposable this seeder creates carries this prefix, so teardown sweeps exactly it. */
export const SEED_PREFIX = 'AGENT-TEST';

const truthy = (v) => /^(true|yes|1)$/i.test(String(v ?? '').trim());
const str = (v) => String(v ?? '').trim();

/** Normalize the single CSV row into the record the seeder + guard both reason about. Pure. */
export function loadFixture(rows) {
  const m = CSV_SOURCE.map;
  const row = (rows || []).find((r) => str(r[m.fixtureKey]) === FIXTURE_KEY);
  if (!row) return null;
  return {
    fixtureKey: FIXTURE_KEY,
    email: str(row[m.email]),
    password: str(row[m.password]),
    firstName: str(row[m.firstName]),
    lastName: str(row[m.lastName]),
    fullName: str(row[m.fullName]) || `${str(row[m.firstName])} ${str(row[m.lastName])}`.trim(),
    categoryPath: str(row[m.categoryPath]),
    listPrice: Number(row[m.listPrice]),
    currency: str(row[m.currency]) || 'USD',
    stockQty: Number(row[m.stockQty]) || 0,
    seeded: truthy(row[m.seeded]),
    stores: {
      A: { listName: str(row[m.storeAListName]), sku: str(row[m.storeASku]), productName: str(row[m.storeAProductName]), slug: str(row[m.storeASlug]), url: str(row[m.storeAUrl]) },
      B: { listName: str(row[m.storeBListName]), sku: str(row[m.storeBSku]), productName: str(row[m.storeBProductName]), slug: str(row[m.storeBSlug]), url: str(row[m.storeBUrl]) },
    },
    _raw: row,
  };
}

/** The two products, in seed order. `role` is which store's wishlist the product belongs to. */
export const productSpecs = (rec) => ['A', 'B'].map((role) => ({
  role,
  sku: rec.stores[role].sku,
  name: rec.stores[role].productName,
  slug: rec.stores[role].slug,
  url: rec.stores[role].url,
  /**
   * Which catalog the product is created in. The store-A product goes into the shared seed catalog
   * (resolved by ensureCategoryPath); the store-B product goes into STORE B's OWN catalog so it is
   * genuinely available in that store — see property 3 in the header. Both are then linked into store
   * A's virtual catalog so CAT-079 can see both cards on one page.
   */
  physicalCatalog: role === 'A' ? 'seed' : 'storeB',
}));

/** The two wishlists, in seed order. */
export const wishlistSpecs = (rec) => ['A', 'B'].map((role) => ({
  role,
  listName: rec.stores[role].listName,
  sku: rec.stores[role].sku,
}));

/** Derived slug for a product name — ONE rule, shared with the standard seeder. */
export const deriveSlug = (name) => productSlug(name);

/**
 * Derived STORE-RELATIVE storefront path. Both products are surfaced in store A under the ad-hoc
 * category path, so both urls follow storefrontPathForAdHoc — including the store-B product, because
 * the cases navigate it on store A's storefront ({{FRONT_URL}}@td(...storeBProductUrl)).
 */
export const deriveUrl = (categoryPath, name) => storefrontPathForAdHoc(categoryPath, name);

/** Contact body for the wishlist customer — a PERSONAL customer, deliberately org-free. Pure. */
export function buildContactBody(rec) {
  return {
    memberType: 'Contact',
    firstName: rec.firstName,
    lastName: rec.lastName,
    fullName: rec.fullName,
    name: rec.fullName,
    emails: [rec.email],
    phones: ['+1-555-AGENT-705'],
    organizations: [],
    status: 'Approved',
    timeZone: 'America/New_York',
    defaultLanguage: 'en-US',
    currencyCode: rec.currency,
  };
}

/** Product create body. Pure — the caller supplies the resolved catalog/category ids + the SEO record. */
export function buildProductBody(spec, rec, { seoInfos = [] } = {}) {
  return {
    name: spec.name,
    code: spec.sku,
    productType: 'Physical',
    vendor: 'QA',
    isActive: true,
    isBuyable: true,
    trackInventory: true,
    seoInfos,
  };
}

/**
 * A wishlist line item. The Cart module's POST /api/carts accepts items INLINE; the separate
 * POST /api/carts/{id}/items route 500s ("Sequence contains no matching element") on a Wishlist-type
 * cart, so inline-on-create / PUT-the-whole-cart is the supported path. Verified live on vcst-qa.
 */
export function buildLineItem(product, rec) {
  return {
    productId: product.id,
    sku: product.code,
    name: product.name,
    quantity: 1,
    catalogId: product.catalogId,
    categoryId: product.categoryId ?? null,
    productType: product.productType || 'Physical',
    currency: rec.currency,
    languageCode: 'en-US',
    listPrice: Number.isFinite(rec.listPrice) ? rec.listPrice : 0,
    salePrice: Number.isFinite(rec.listPrice) ? rec.listPrice : 0,
    isReadOnly: false,
  };
}

/** Wishlist (Wishlist-type cart) body. Pure. */
export function buildWishlistBody({ listName, storeId, customerId, customerName, currency, items = [] }) {
  return {
    name: listName,
    storeId,
    customerId,
    customerName,
    type: 'Wishlist',
    currency,
    languageCode: 'en-US',
    items,
    addresses: [], payments: [], shipments: [], coupons: [], taxDetails: [], discounts: [], dynamicProperties: [],
  };
}

/**
 * Shape assertions shared by the drift guard and the unit tests. Returns a list of problem strings —
 * empty means the committed fixture can still do its job. Pure: takes the parsed CSV rows.
 */
export function validateFixtureShape(rows) {
  const problems = [];
  const rec = loadFixture(rows);
  if (!rec) return [`no row with ${CSV_SOURCE.map.fixtureKey}="${FIXTURE_KEY}" in ${CSV_SOURCE.file}`];
  if (!rec.seeded) problems.push(`${FIXTURE_KEY}: seeded=false — the seeder would never create it, so CAT-079/CAT-080 stay blocked`);
  if (!rec.email) problems.push(`${FIXTURE_KEY}: email is empty`);
  if (rec.email && !rec.email.toLowerCase().startsWith('agent-test-')) {
    problems.push(`${FIXTURE_KEY}: email "${rec.email}" must start with "agent-test-" so teardown sweeps it`);
  }
  if (!/^\{\{[A-Z0-9_]+\}\}$/.test(rec.password)) {
    problems.push(`${FIXTURE_KEY}: password must be a {{VAR}} token resolved from .env.local at seed time, never a literal (got "${rec.password}")`);
  }

  // The two properties that make the fixture non-vacuous.
  if (rec.stores.A.sku && rec.stores.A.sku === rec.stores.B.sku) {
    problems.push(`${FIXTURE_KEY}: store A and store B reference the SAME sku "${rec.stores.A.sku}" — a shared product cannot distinguish a leaked wishlist id from a correct one`);
  }
  if (rec.stores.A.listName && rec.stores.A.listName === rec.stores.B.listName) {
    problems.push(`${FIXTURE_KEY}: both wishlists are named "${rec.stores.A.listName}" — the seeder keys idempotency on (storeId, name), so one list would overwrite the other`);
  }

  for (const role of ['A', 'B']) {
    const s = rec.stores[role];
    if (!s.sku) { problems.push(`${FIXTURE_KEY}: store ${role} sku is empty`); continue; }
    if (!s.sku.toUpperCase().startsWith('QA-WISH-')) problems.push(`${FIXTURE_KEY}: store ${role} sku "${s.sku}" should keep the QA-WISH- family prefix`);
    if (!s.productName.startsWith(SEED_PREFIX)) problems.push(`${FIXTURE_KEY}: store ${role} product name "${s.productName}" must start with "${SEED_PREFIX}" so teardown can guard on it`);
    if (!s.listName.startsWith(SEED_PREFIX)) problems.push(`${FIXTURE_KEY}: store ${role} wishlist name "${s.listName}" must start with "${SEED_PREFIX}"`);

    const wantSlug = deriveSlug(s.productName);
    if (s.slug !== wantSlug) problems.push(`${FIXTURE_KEY}: store ${role} slug "${s.slug}" != derived "${wantSlug}" (rule: standard-specs.mjs productSlug)`);

    const wantUrl = deriveUrl(rec.categoryPath, s.productName);
    if (s.url !== wantUrl) problems.push(`${FIXTURE_KEY}: store ${role} url "${s.url}" != derived "${wantUrl}" (rule: standard-specs.mjs storefrontPathForAdHoc)`);
    if (s.url && (/^[a-z]+:\/\//i.test(s.url) || s.url.includes('{{'))) {
      problems.push(`${FIXTURE_KEY}: store ${role} url "${s.url}" must be store-RELATIVE — the case composes {{FRONT_URL}}@td(...) — no scheme/host/{{VAR}}`);
    }
    if (s.url && !s.url.startsWith('/')) problems.push(`${FIXTURE_KEY}: store ${role} url "${s.url}" must start with "/"`);
  }

  if (!Number.isFinite(rec.listPrice) || rec.listPrice <= 0) problems.push(`${FIXTURE_KEY}: list_price must be a positive number (got "${rec._raw[CSV_SOURCE.map.listPrice]}")`);
  if (!Number.isFinite(rec.stockQty) || rec.stockQty <= 0) problems.push(`${FIXTURE_KEY}: stock_qty must be positive so the product renders as an addable card on store A's catalog page`);

  return problems;
}
