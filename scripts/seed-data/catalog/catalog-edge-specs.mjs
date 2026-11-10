/**
 * catalog-edge-specs.mjs — SINGLE SOURCE OF TRUTH for the three catalog "discrimination" fixtures
 * that REG-2026-08-25-1128 found missing. Side-effect-free (no env, no network, no fs) so the seeder,
 * the drift guard and the unit tests all import the SAME rules.
 *
 * WHAT THESE THREE HAVE IN COMMON
 * -------------------------------
 * Each unblocks a case that could not FAIL, because the environment offered no example of the
 * negative half. That is a different problem from "the fixture is missing": a case with no
 * discriminating input does not error, it quietly agrees with whatever the product does.
 *
 *   CAT-043  EMPTY CATEGORY. Asserts the storefront renders an explicit empty state — "No products
 *            found", no pagination, no filter panel — rather than a blank content area. Every live
 *            category on the env has products, so the empty branch was never rendered. The category
 *            must therefore be genuinely EMPTY, and stay empty: it is deliberately created OUTSIDE
 *            the seed category tree that other seeders drop ad-hoc products into.
 *
 *   CAT-038  ORG-EXCLUDED PRODUCT. Asserts a product in the PHYSICAL catalog that is absent from the
 *            org's virtual catalog is invisible to an org user. The positive half already passed
 *            (3,506 org-scoped results); the discriminating half needs one product that is real,
 *            findable by an admin, priced and in stock — and NOT linked into the store's virtual
 *            catalog. "Not linked" is the entire fixture, so the guard's job is to make sure nobody
 *            later "fixes" it by linking it in, which would turn the case vacuous again.
 *
 *   CAT-040  SEO-CONFIGURED PRODUCT. Asserts a PDP emits a non-empty meta title + description and the
 *            og:* set. xAPI returned seoInfo.pageTitle/metaDescription = null for 100 of 100 sampled
 *            products, so "empty tags" was the CORRECT render and the case was asserting against a
 *            universe with no positive example. This fixture supplies one, with every SEO field the
 *            case reads populated.
 *
 *   CAT-GQL-153  OTHER CATALOG WITH PROPERTIES (OTHER_CATALOG, below). Reuses CAT-038's unlinked
 *            physical catalog and gives it properties the store's catalog does not have, so a
 *            Query.properties catalogIds filter that leaks out of the store returns a DIFFERENT set.
 *
 * NAMING: everything carries AGENT-TEST- so `/qa-seed-data teardown` sweeps exactly these.
 * RUNTIME IDS: category/product GUIDs are server-assigned → aliases.<env>.json only, never committed.
 */

import { productSlug, slugify, storefrontPathForAdHoc } from '../products/standard-specs.mjs';

/** Everything disposable this seeder creates carries this prefix. */
export const SEED_PREFIX = 'AGENT-TEST';

/** Runtime, server-assigned values live ONLY in aliases.<env>.json — never in a committed file. */
export const RUNTIME_FIELDS = ['id', 'catalogId', 'categoryId'];

/**
 * The physical (non-virtual) catalog that backs CAT-038's excluded product. It must NOT be the
 * store's catalog: the whole fixture is "present physically, absent from the org's virtual catalog".
 */
export const EXCLUDED_CATALOG = {
  name: 'AGENT-TEST-Physical-Excluded',
  code: 'AGENT-TEST-PHYS-EXCL',
};

/**
 * CAT-043 — the empty category.
 *
 * `keepEmpty` is not decoration: it is the fixture's ONLY property, and the seeder asserts it live
 * after creation. A category that has acquired a product still renders a normal listing, so the case
 * would pass by agreeing that a non-empty category is not empty — a false green.
 */
export const EMPTY_CATEGORY = {
  aliasName: 'CAT_EMPTY',
  name: 'AGENT-TEST-Empty-Category',
  code: 'AGENT-TEST-EMPTY-CAT',
  keepEmpty: true,
  /** Store-relative storefront path the case navigates as {{FRONT_URL}}@td(CAT_EMPTY.url). */
  get slug() { return slugify(this.name); },
  get url() { return `/${slugify(this.name)}`; },
};

/** CAT-038 — a real, priced, stocked product deliberately NOT linked into the store's virtual catalog. */
export const EXCLUDED_PRODUCT = {
  aliasName: 'PROD_ORG_EXCLUDED',
  sku: 'QA-EXCL-001',
  name: 'AGENT-TEST-Org-Excluded-Product',
  listPrice: 77.77,
  currency: 'USD',
  stockQty: 15,
  /** THE fixture property. Flipping this to true destroys the case. */
  linkedIntoStoreCatalog: false,
  get slug() { return productSlug(this.name); },
};

/** CAT-040 — a product with every SEO field the case reads actually populated. */
export const SEO_PRODUCT = {
  aliasName: 'PROD_SEO_CONFIGURED',
  sku: 'QA-SEO-001',
  name: 'AGENT-TEST-SEO-Configured-Product',
  listPrice: 129.5,
  currency: 'USD',
  stockQty: 20,
  categoryPath: 'Test Fixtures',
  pageTitle: 'AGENT-TEST SEO Configured Product | Virto QA Fixture',
  metaDescription: 'AGENT-TEST fixture product carrying a real meta description so the PDP SEO case has a positive example to assert against. Non-empty, longer than a placeholder, and distinct from the page title.',
  metaKeywords: 'agent-test, seo, fixture, qa',
  imageAltDescription: 'AGENT-TEST SEO configured product image',
  get slug() { return productSlug(this.name); },
  /**
   * DERIVED store-relative PDP path — the CATEGORY-QUALIFIED one, not the bare semanticUrl leaf.
   *
   * The platform's SEO record stores only the leaf (`agent-test-seo-configured-product`), but the
   * storefront routes the product under its category path. Writing the leaf as the alias url looks
   * fine and fails silently: the SPA answers HTTP 200 and renders a client-side 404, so a status
   * check passes while the case never reaches a PDP. Derived here from the same rule the standard
   * seeder uses, so it can never be hand-maintained into disagreement.
   */
  get url() { return storefrontPathForAdHoc(this.categoryPath, this.name); },
};

/**
 * CAT-GQL-153 — a catalog OUTSIDE the store that owns properties the store's catalog does not have.
 *
 * The case asks `Query.properties(storeId, filter:"catalogIds:<this catalog>")` and asserts the
 * answer equals the unfiltered store answer. That only discriminates when the two catalogs' property
 * sets DIFFER: a broken build that honours the caller's catalogIds then returns THESE properties
 * instead of the store's. So the properties carry AGENT_TEST_ names no store catalog uses, and the
 * seeder proves live that the store's own answer contains none of them. At least one is catalog-level
 * (type Catalog) — the case queries types [CATALOG, CATEGORY, PRODUCT, VARIATION].
 *
 * It reuses EXCLUDED_CATALOG: that catalog is physical and deliberately unlinked from the store, which
 * is exactly "another catalog". A property definition does not touch CAT-038's excluded product.
 * Property names are code-like identifiers (letters, digits, underscores), hence AGENT_TEST_.
 */
export const OTHER_CATALOG = {
  aliasName: 'CATALOG_OTHER_WITH_PROPERTIES',
  get name() { return EXCLUDED_CATALOG.name; },
  propertyPrefix: 'AGENT_TEST_',
  properties: [
    { name: 'AGENT_TEST_OTHER_CATALOG_SCOPE', type: 'Catalog', valueType: 'ShortText' },
    { name: 'AGENT_TEST_OTHER_PRODUCT_SCOPE', type: 'Product', valueType: 'ShortText' },
  ],
};

/** POST /api/catalog/properties body for one OTHER_CATALOG property (204, no body). Pure. */
export function buildOtherCatalogPropertyBody(prop, catalogId) {
  return {
    isNew: true, name: prop.name, catalogId, type: prop.type, valueType: prop.valueType,
    dictionary: false, required: false, multivalue: false, multilanguage: false,
  };
}

/**
 * The divergence CAT-GQL-153 depends on, given the property names the store's own Query.properties
 * returns and the properties the other catalog carries live. Pure. Returns problem strings.
 */
export function otherCatalogDivergence(storePropertyNames, otherCatalogProperties) {
  const store = new Set(storePropertyNames || []);
  const have = new Set((otherCatalogProperties || []).map((p) => p.name));
  const problems = [];
  for (const p of OTHER_CATALOG.properties) {
    if (!have.has(p.name)) problems.push(`${OTHER_CATALOG.aliasName}: property ${p.name} is not on the catalog`);
    if (store.has(p.name)) problems.push(`${OTHER_CATALOG.aliasName}: the store's own Query.properties already returns ${p.name} — the two sets no longer differ, so a build that honours catalogIds gives the same answer as one that ignores it`);
  }
  if (!store.size) problems.push(`${OTHER_CATALOG.aliasName}: the store's Query.properties returned nothing — no baseline to differ from`);
  return problems;
}

export const ALL_FIXTURES = [EMPTY_CATEGORY, EXCLUDED_PRODUCT, SEO_PRODUCT];

/** SEO body the platform stores on a product/category. Pure. */
export function buildSeoInfo(spec, { storeId, languageCode = 'en-US' } = {}) {
  return {
    semanticUrl: spec.slug,
    pageTitle: spec.pageTitle || spec.name,
    metaDescription: spec.metaDescription || '',
    metaKeywords: spec.metaKeywords || '',
    imageAltDescription: spec.imageAltDescription || '',
    languageCode,
    storeId,
    isActive: true,
  };
}

/** Category create body. Pure. */
export function buildCategoryBody(spec, { catalogId, parentId = null } = {}) {
  return {
    catalogId, parentId,
    name: spec.name, code: spec.code,
    isActive: true,
    seoInfos: [],
  };
}

/** Product create body. Pure — the caller supplies the resolved ids + SEO record. */
export function buildProductBody(spec, { catalogId, categoryId = null, seoInfos = [] } = {}) {
  return {
    catalogId, categoryId,
    name: spec.name, code: spec.sku,
    productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: true,
    seoInfos,
  };
}

/**
 * SEO completeness for CAT-040 — the assertion the case makes, expressed once so the seeder, the
 * guard and the tests agree. Pure. Returns problem strings.
 *
 * `metaDescription !== pageTitle` is deliberate: a fixture that sets both to the same string still
 * satisfies "non-empty" while proving nothing about the two tags being independently populated —
 * and that is the shape a careless later edit would produce.
 */
export function validateSeoShape(spec = SEO_PRODUCT) {
  const problems = [];
  const title = String(spec.pageTitle || '').trim();
  const desc = String(spec.metaDescription || '').trim();
  if (!title) problems.push(`${spec.aliasName}: pageTitle is empty — CAT-040 asserts a NON-empty meta title, and an empty one is exactly the state that made the case vacuous`);
  if (!desc) problems.push(`${spec.aliasName}: metaDescription is empty — same reason`);
  if (title && desc && title === desc) {
    problems.push(`${spec.aliasName}: pageTitle and metaDescription are identical — non-empty but not independently populated, so the case cannot tell the two tags apart`);
  }
  if (desc && desc.length < 50) {
    problems.push(`${spec.aliasName}: metaDescription is ${desc.length} chars — CAT-040 asserts "meaningful content (not empty or placeholder)", so keep it recognisably a real description`);
  }
  return problems;
}

/**
 * Shape assertions across all three fixtures, shared by the drift guard and the unit tests.
 * VACUITY-oriented: each check names the way the fixture could still exist while proving nothing.
 */
export function validateFixtureShape() {
  const problems = [...validateSeoShape()];

  for (const f of ALL_FIXTURES) {
    if (!f.name.startsWith(SEED_PREFIX)) problems.push(`${f.aliasName}: name "${f.name}" must start with "${SEED_PREFIX}" so teardown sweeps it`);
    for (const field of RUNTIME_FIELDS) {
      if (f[field]) problems.push(`${f.aliasName}: carries a runtime "${field}" in the committed spec — server-assigned ids belong in aliases.<env>.json`);
    }
  }

  // CAT-043's only property.
  if (!EMPTY_CATEGORY.keepEmpty) {
    problems.push(`${EMPTY_CATEGORY.aliasName}: keepEmpty=false — a category with products renders a normal listing, so CAT-043 would assert "not empty is not empty" and pass without exercising the empty state`);
  }
  if (!EMPTY_CATEGORY.url.startsWith('/') || /^[a-z]+:\/\//i.test(EMPTY_CATEGORY.url) || EMPTY_CATEGORY.url.includes('{{')) {
    problems.push(`${EMPTY_CATEGORY.aliasName}: url "${EMPTY_CATEGORY.url}" must be store-RELATIVE — the case composes {{FRONT_URL}}@td(...)`);
  }

  // CAT-038's only property.
  if (EXCLUDED_PRODUCT.linkedIntoStoreCatalog) {
    problems.push(`${EXCLUDED_PRODUCT.aliasName}: linkedIntoStoreCatalog=true — the product is then visible to the org user, and CAT-038's discriminating half asserts the opposite. "Not linked" IS the fixture.`);
  }
  if (EXCLUDED_CATALOG.name === '' || !EXCLUDED_CATALOG.name.startsWith(SEED_PREFIX)) {
    problems.push(`EXCLUDED_CATALOG.name "${EXCLUDED_CATALOG.name}" must start with "${SEED_PREFIX}"`);
  }

  // Distinct SKUs — two fixtures sharing one product cannot hold two contradictory properties
  // (excluded from the store vs browsable with SEO on the storefront).
  if (EXCLUDED_PRODUCT.sku === SEO_PRODUCT.sku) {
    problems.push('PROD_ORG_EXCLUDED and PROD_SEO_CONFIGURED share a SKU — one product cannot be both invisible to the org and browsable on its PDP');
  }
  for (const p of [EXCLUDED_PRODUCT, SEO_PRODUCT]) {
    if (!Number.isFinite(p.listPrice) || p.listPrice <= 0) problems.push(`${p.aliasName}: listPrice must be a positive number`);
    if (!Number.isFinite(p.stockQty) || p.stockQty <= 0) problems.push(`${p.aliasName}: stockQty must be positive or the card renders unbuyable`);
  }

  // CAT-GQL-153 — the other catalog's properties must be distinguishable from any store property.
  const names = OTHER_CATALOG.properties.map((p) => p.name);
  if (!names.length) problems.push(`${OTHER_CATALOG.aliasName}: declares no property — the filtered and unfiltered answers cannot differ`);
  if (new Set(names).size !== names.length) problems.push(`${OTHER_CATALOG.aliasName}: duplicate property names`);
  if (!OTHER_CATALOG.properties.some((p) => p.type === 'Catalog')) problems.push(`${OTHER_CATALOG.aliasName}: needs at least one catalog-level (type Catalog) property`);
  for (const n of names) {
    if (!n.startsWith(OTHER_CATALOG.propertyPrefix) || !/^[0-9A-Za-z_]+$/.test(n)) problems.push(`${OTHER_CATALOG.aliasName}: property "${n}" must be an ${OTHER_CATALOG.propertyPrefix}* identifier (letters, digits, underscores) — a name a store catalog could share makes the two sets overlap`);
  }

  return problems;
}
