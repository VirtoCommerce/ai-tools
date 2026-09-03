/**
 * scripts/seed-data/compare/compare-specs.mjs
 *
 * SINGLE source of truth for the `/compare` (product comparison) test-data domain — VCST-5735.
 * Side-effect-free (no env load, no network, no top-level work) so the seeder
 * (seed-compare.mjs), the drift guard (validate-compare-data.mjs) and the unit tests all import it.
 *
 * WHY THIS DOMAIN NEEDS ITS OWN FIXTURES (the SECOND RULE in .claude/rules/test-data.md):
 * the compare page groups the customer's list into CATEGORY TABS and renders a transposed table
 * (products = columns, characteristics = rows). Three of its decisions are only DECIDABLE when the
 * data is built to diverge, and no pre-existing fixture diverges on any of them:
 *
 *   1. TAB KEY.   `getProductCategoryKey(p)` = the itemIds of the FIRST TWO breadcrumbs whose
 *      typeName === 'Category', joined by '/'. Label = the LAST of those two crumbs' title.
 *      Zero Category crumbs ⇒ key '' ⇒ the `uncategorized` tab. So a fixture set that lives in one
 *      category proves nothing about tabs, and a PARENT/CHILD pair (keys `X` vs `X/Y`) that happens
 *      to share a LABEL is the only shape that can show a key/label confusion. See CATEGORY_PATHS.
 *   2. QUANTITY.  The suspected render loop only triggers when two products IN ONE TAB disagree on
 *      minQuantity / packSize / availableQuantity. Equal values make the case vacuous — which is why
 *      `quantityDivergence()` is asserted by the guard rather than merely documented. Live on
 *      vcst-qa (2026-09-03) every AGENT-TEST product is minQuantity=1 / packSize=1, and the only
 *      real MOQ divergence (the imported Printers) is packSize=1 throughout.
 *   3. `differs` IS COMPUTED OVER FORMATTED STRINGS, not raw values. A row is therefore only a
 *      *discriminating* row when two products' RAW values differ while their FORMATTED strings are
 *      equal. Two independent carriers of that shape are seeded (see FORMAT_COLLISIONS) because
 *      neither is guaranteed a priori: the numeric one depends on the platform preserving 4 decimals
 *      on a Number property, the availability one depends only on "In stock" being a bucket label.
 *   4. PRODUCT KIND. compare-table.vue branches THREE ways — isConfigurable, hasVariations, plain —
 *      and `getDisplayPrice()` returns minVariationPrice on the second branch and price on the other
 *      two, feeding both the Price row and `differs`. So a variations column compares a MINIMUM-
 *      VARIATION price against its neighbours' ordinary prices. That is only decidable when the two
 *      DIVERGE on one product: the pre-existing INV_VARIATION_MASTER reports price ==
 *      minVariationPrice == $59.99 and so passes on either branch. See variationPriceDivergence()
 *      and, for what could NOT be built, MIN_VARIATION_PRICE_ALWAYS_PRESENT.
 *
 * PROPERTY MODEL — inline, NOT catalog-defined. A product property reaches xAPI in two shapes:
 * a catalog-DEFINED property (inherited by every product in the catalog, `propertyId` set) and an
 * INLINE one attached to the product itself (`propertyId: null`, `isManageable: false`). The live
 * Xerox/Epson printers carry both, and xAPI exposes both identically. We use INLINE only:
 *   - it does not pollute the 100+ other products in AGENT-TEST-SEED-B2B-Electronics, and
 *   - it needs no teardown of its own — the values die with the product.
 * The "auto-hidden row" case (EVERY product in the tab lacks a value) is consequently NOT seeded
 * here: it already exists for free as the catalog-defined `AGENT_TEST_VP9279_1786951191351`
 * (SHORT_TEXT), which every AGENT-TEST product inherits with a null value.
 */

import { productSlug, storefrontPathForAdHoc, categorySegmentSlug, slugify } from '../products/standard-specs.mjs';

export { productSlug, storefrontPathForAdHoc, categorySegmentSlug, slugify };

/** Everything this domain creates carries this prefix so teardown sweeps exactly what it made. */
export const SEED_PREFIX = 'AGENT-TEST';

/** Stable, date-pinned pricelist name (idempotent reuse across runs). */
export const PRICE_LIST_DATE = '20260903';
export const priceListName = (currency = 'USD') => `SEED-${PRICE_LIST_DATE}-Compare-${currency}`;
export const CURRENCY = 'USD';

// ---------------------------------------------------------------------------
// CATEGORY PATHS — the tab model.
// ---------------------------------------------------------------------------
// `Compare Fixtures` / `Compare Nested` are AD-HOC roots (no categories.csv row), so
// seed-common's ensureCategoryPath creates them in the default physical catalog and links the ROOT
// into the store's virtual catalog. A depth-1 product therefore yields exactly ONE Category
// breadcrumb (verified live: the `Test Fixtures` rows group under a single-id key), and a depth-2
// product yields two.
//
// NESTED_PARENT / NESTED_CHILD are DELIBERATELY the same display name at both levels. That is the
// whole fixture: the parent product's key is `<Nested>` and the child's is `<Nested>/<Nested2>` —
// two DIFFERENT tabs — while both labels resolve to the same string, because the label is the LAST
// crumb's title. ensureCategoryPath scopes an ad-hoc segment's CODE by its ancestry
// (`AGENT-TEST-SEED-compare-nested` vs `AGENT-TEST-SEED-compare-nested-compare-nested`), so the two
// same-named categories are genuinely distinct entities rather than one self-parented one.
export const CATEGORY_PATHS = {
  A: 'Compare Fixtures > Group A',
  B: 'Compare Fixtures > Group B',
  C: 'Compare Fixtures > Group C',
  NESTED_PARENT: 'Compare Nested',
  NESTED_CHILD: 'Compare Nested > Compare Nested',
  NONE: '',   // no category at all — linked at the store virtual-catalog ROOT (uncategorized tab)
};

/** The ad-hoc roots this domain owns; teardown deletes exactly these subtrees. */
export const CATEGORY_ROOTS = ['Compare Fixtures', 'Compare Nested'];

/**
 * The CODE seed-common's ensureCategoryPath gives an ad-hoc ROOT segment: `AGENT-TEST-SEED-<slug>`.
 * Teardown needs this because it must LOOK UP a category and must never CREATE one — the obvious
 * shortcut (calling ensureCategoryPath again) resolve-or-CREATEs, and its lookup goes through a
 * search index that lags a write. Measured on the first teardown run, 2026-09-03: it missed both
 * roots, created two fresh ones, deleted those, reported success, and left the real categories
 * orphaned in the catalog. A teardown that creates what it is about to delete always "verifies".
 */
export const categoryPathCode = (segs) =>
  `AGENT-TEST-SEED-${(Array.isArray(segs) ? segs : [segs]).map(slugify).join('-')}`;
export const categoryRootCode = (rootName) => categoryPathCode([rootName]);

/** The per-category compare limit the storefront enforces (product_compare_limit), verified live. */
export const COMPARE_LIMIT_PER_CATEGORY = 5;

// ---------------------------------------------------------------------------
// PRODUCTS
// ---------------------------------------------------------------------------
// `properties` are INLINE product properties: { name, valueType, value }. valueType ∈
// ShortText | LongText | Integer | Number | Boolean (the platform enum; xAPI reports the
// SHORT_TEXT / BOOLEAN / NUMBER spelling).
const p = (name, valueType, value) => ({ name, valueType, value });

/** The value both compare products carry identically — a row that must NOT appear under "Differences". */
export const SHARED_PROPERTY_VALUE = 'Shared Attribute Value';

export const PRODUCTS = [
  // ---- Group A: the properties / differences / row-key tab (6 rows: 5 fit, the 6th proves the cap)
  {
    cmpId: 'CMP-001', alias: 'PROD_CMP_A',
    code: 'AGENT-TEST-CMP-ALPHA', name: 'AGENT-TEST-Compare-Alpha',
    categoryPath: CATEGORY_PATHS.A, listPrice: 49.99, stock: 12,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'Compare column A — shared / differing / BOOLEAN / format-colliding properties',
    properties: [
      p('AgentTestCompareShared', 'ShortText', SHARED_PROPERTY_VALUE),
      p('AgentTestCompareDiffers', 'ShortText', 'Alpha differing value'),
      p('AgentTestCompareFlag', 'Boolean', true),
      p('AgentTestCompareOnlyOnAlpha', 'ShortText', 'Present on Alpha only'),
      p('AgentTestCompareFormatCollision', 'Number', 1234.5678),
    ],
  },
  {
    cmpId: 'CMP-002', alias: 'PROD_CMP_B',
    code: 'AGENT-TEST-CMP-BETA', name: 'AGENT-TEST-Compare-Beta',
    categoryPath: CATEGORY_PATHS.A, listPrice: 59.99, stock: 340,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'Compare column B — same tab as Alpha; every property above either matches or diverges deliberately',
    properties: [
      p('AgentTestCompareShared', 'ShortText', SHARED_PROPERTY_VALUE),   // identical → not a "difference"
      p('AgentTestCompareDiffers', 'ShortText', 'Beta differing value'), // differs
      p('AgentTestCompareFlag', 'Boolean', false),                       // BOOLEAN, differs
      // AgentTestCompareOnlyOnAlpha deliberately ABSENT → the row must still render (one product has it)
      p('AgentTestCompareFormatCollision', 'Number', 1234.5679),         // raw differs, format collides
    ],
  },
  {
    cmpId: 'CMP-003', alias: 'PROD_PROP_PRICE',
    code: 'AGENT-TEST-CMP-PROPNAME', name: 'AGENT-TEST-Compare-Property-Name-Collision',
    categoryPath: CATEGORY_PATHS.A, listPrice: 39.99, stock: 25,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'Catalog properties literally named Price / SKU / Availability — the implementation prefixes row keys field: / property: / config: precisely so these cannot shadow the built-in rows',
    // MEASURED LIVE on vcst-qa, 2026-09-03, with a four-way controlled probe (four brand-new
    // products in one category, one reindex, polled to 80 s): a product CREATED carrying a property
    // literally named **`Price`** never enters the search index — `none=1  Price=0  SKU=1
    // Availability=1`, stable across the whole window. It is not slow indexing and not a transient:
    // the control and the two sibling names indexed in 8 s. The product exists in the catalog (REST
    // GET returns it with all four property values) and is simply absent from xAPI, so the
    // storefront cannot see it at all — silently, with no error anywhere.
    //
    // Adding the same property to an ALREADY-INDEXED document does survive a re-index, which is why
    // this record is seeded in two phases: create + index bare, then apply the properties and
    // re-index. See `indexTwoPhase` and the seeder's applyDeferredProperties().
    indexTwoPhase: true,
    properties: [
      p('Price', 'ShortText', 'PROPERTY-Price-not-the-field'),
      p('SKU', 'ShortText', 'PROPERTY-SKU-not-the-field'),
      p('Availability', 'ShortText', 'PROPERTY-Availability-not-the-field'),
      p('AgentTestCompareShared', 'ShortText', SHARED_PROPERTY_VALUE),
    ],
  },
  {
    cmpId: 'CMP-004', alias: 'PROD_LONGNAME',
    code: 'AGENT-TEST-CMP-LONGNAME',
    // A 62-character UNBROKEN alphanumeric run: hyphens and spaces give a browser somewhere to wrap,
    // so a name made only of short words cannot reproduce the VCST-5831 shape (overflow of a 112px
    // mobile compare column). The unbreakable run is the fixture; the readable prefix is courtesy.
    name: 'AGENT-TEST-Compare-LongName ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    categoryPath: CATEGORY_PATHS.A, listPrice: 19.99, stock: 60,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'Name overflow in a narrow (112px) mobile compare column — sibling shape of VCST-5831',
    properties: [p('AgentTestCompareShared', 'ShortText', SHARED_PROPERTY_VALUE)],
  },
  {
    cmpId: 'CMP-005', alias: 'PROD_CMP_FILL_1',
    code: 'AGENT-TEST-CMP-FILL-1', name: 'AGENT-TEST-Compare-Filler-One',
    categoryPath: CATEGORY_PATHS.A, listPrice: 9.99, stock: 80,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: `Filler #5 — takes Group A to exactly ${5} products so the per-category cap is reachable`,
    properties: [p('AgentTestCompareShared', 'ShortText', SHARED_PROPERTY_VALUE)],
  },
  {
    cmpId: 'CMP-006', alias: 'PROD_CMP_FILL_2',
    code: 'AGENT-TEST-CMP-FILL-2', name: 'AGENT-TEST-Compare-Filler-Two',
    categoryPath: CATEGORY_PATHS.A, listPrice: 8.99, stock: 80,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'Filler #6 — the product that must be REFUSED once Group A holds the 5-item maximum',
    properties: [p('AgentTestCompareShared', 'ShortText', SHARED_PROPERTY_VALUE)],
  },

  // ---- Group B: quantity divergence (the render-loop tab)
  {
    cmpId: 'CMP-010', alias: 'PROD_MOQ',
    code: 'AGENT-TEST-CMP-MOQ', name: 'AGENT-TEST-Compare-MOQ-Fixture',
    categoryPath: CATEGORY_PATHS.B, listPrice: 14.99, stock: 40,
    minQuantity: 7, packSize: 1, maxQuantity: 21,
    purpose: 'MOQ 7 / pack 1 / max 21 / stock 40 — every quantity field diverges from PROD_PACK',
    properties: [],
  },
  {
    cmpId: 'CMP-011', alias: 'PROD_PACK',
    code: 'AGENT-TEST-CMP-PACK', name: 'AGENT-TEST-Compare-Pack-Fixture',
    categoryPath: CATEGORY_PATHS.B, listPrice: 12.49, stock: 96,
    // Stored MOQ 10 with packSize 4. NOTE (measured live 2026-09-03): xAPI reports **12** here —
    // the read path rounds a minimum UP onto the pack grid, so "MOQ is not a multiple of pack size"
    // is NOT observable on the storefront however it is stored. See xapiMinQuantity(). What the pair
    // still proves is that two products in ONE tab disagree (7/1 vs 12/4), which is the input the
    // suspected render loop consumes.
    minQuantity: 10, packSize: 4, maxQuantity: 80,
    purpose: 'MOQ 10 stored / 12 as rendered / pack 4 / max 80 / stock 96 — every quantity field diverges from PROD_MOQ',
    properties: [],
  },

  // ---- Group C: a second tab, so the tab strip is exercised with >= 2 tabs
  {
    cmpId: 'CMP-020', alias: 'PROD_CMP_C',
    code: 'AGENT-TEST-CMP-GAMMA', name: 'AGENT-TEST-Compare-Gamma',
    categoryPath: CATEGORY_PATHS.C, listPrice: 24.99, stock: 55,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'A plain product in a DIFFERENT category tab from Alpha/Beta',
    properties: [p('AgentTestCompareShared', 'ShortText', SHARED_PROPERTY_VALUE)],
  },

  // ---- Parent / child: two tabs whose keys differ (X vs X/Y) but whose LABELS collide
  {
    cmpId: 'CMP-030', alias: 'PROD_CMP_PARENT',
    code: 'AGENT-TEST-CMP-PARENT', name: 'AGENT-TEST-Compare-Parent-Level',
    categoryPath: CATEGORY_PATHS.NESTED_PARENT, listPrice: 29.99, stock: 30,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'Depth-1 placement → ONE Category breadcrumb → tab key is a single id',
    properties: [],
  },
  {
    cmpId: 'CMP-031', alias: 'PROD_CMP_CHILD',
    code: 'AGENT-TEST-CMP-CHILD', name: 'AGENT-TEST-Compare-Child-Level',
    categoryPath: CATEGORY_PATHS.NESTED_CHILD, listPrice: 31.99, stock: 30,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'Depth-2 placement under a same-named parent → key <X>/<Y>, label identical to the parent tab',
    properties: [],
  },

  // ---- The VARIATION parent: the third product kind compare-table.vue branches on.
  //
  // compare-table.vue decides three ways — isConfigurable → a customize link; hasVariations → a
  // variations link carrying a count; otherwise a real add-to-cart button. The first and third were
  // covered (CFG_* / every plain fixture above); this is the second. It matters beyond the button,
  // because `getDisplayPrice(product)` returns **minVariationPrice** when hasVariations is true and
  // `price` otherwise, and that function feeds BOTH the Price row and the `differs` computation
  // (`items.map(({product}) => getDisplayPrice(product).actual.formattedAmount)`). So for a
  // variations product the table compares MINIMUM-VARIATION prices, a distinct semantic.
  //
  // The parent price and the minimum variation price MUST DIVERGE or the whole thing is vacuous —
  // that is the entire reason this record exists rather than reusing INV_VARIATION_MASTER, which
  // reports price == minVariationPrice == $59.99 and therefore passes whichever branch runs.
  // MEASURED LIVE on vcst-qa 2026-09-03 with this exact shape: price $89.99, minVariationPrice
  // $34.99, hasVariations true, 3 variations. See variationPriceDivergence().
  {
    cmpId: 'CMP-050', alias: 'PROD_CMP_VARIATIONS',
    code: 'AGENT-TEST-CMP-VARPARENT', name: 'AGENT-TEST-Compare-Variations-Parent',
    categoryPath: CATEGORY_PATHS.A, listPrice: 89.99, stock: 64,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'hasVariations=true in the SAME tab as plain products — the compare Price row must read minVariationPrice ($34.99), not the parent price ($89.99)',
    properties: [p('AgentTestCompareShared', 'ShortText', SHARED_PROPERTY_VALUE)],
    // Three variations, deliberately: the link renders a count (the component computes
    // `variations.length + 1`), and a count derived from 1 or 2 children is indistinguishable from
    // an off-by-one or from a plain product's implicit single row. Prices are DISTINCT so "the
    // minimum" is unambiguous, and the cheapest sits $55.00 below the parent — far enough that no
    // money formatter can collapse the two into one string.
    variations: [
      { code: 'AGENT-TEST-CMP-VAR-S', name: 'AGENT-TEST-Compare-Variations-Small', listPrice: 34.99, stock: 9 },
      { code: 'AGENT-TEST-CMP-VAR-M', name: 'AGENT-TEST-Compare-Variations-Medium', listPrice: 44.99, stock: 11 },
      { code: 'AGENT-TEST-CMP-VAR-L', name: 'AGENT-TEST-Compare-Variations-Large', listPrice: 54.99, stock: 13 },
    ],
  },

  // ---- No category at all → the `uncategorized` tab
  {
    cmpId: 'CMP-040', alias: 'PROD_CMP_NOCAT',
    code: 'AGENT-TEST-CMP-NOCAT', name: 'AGENT-TEST-Compare-Uncategorized',
    categoryPath: CATEGORY_PATHS.NONE, listPrice: 17.99, stock: 45,
    minQuantity: 1, packSize: 1, maxQuantity: 0,
    purpose: 'Created with categoryId=null and linked at the virtual-catalog ROOT → ZERO Category breadcrumbs → key "" → the uncategorized tab',
    properties: [],
  },
];

/** Products keyed by their stable cmp id. */
export const byCmpId = Object.fromEntries(PRODUCTS.map((r) => [r.cmpId, r]));
/** Products keyed by alias. */
export const byAlias = Object.fromEntries(PRODUCTS.map((r) => [r.alias, r]));

/** Every product that shares a tab with `rec` (same categoryPath), excluding `rec`. */
export const tabSiblings = (rec) =>
  PRODUCTS.filter((o) => o !== rec && o.categoryPath === rec.categoryPath);

// ---------------------------------------------------------------------------
// The store-relative storefront path a seeded compare product lands on.
// ---------------------------------------------------------------------------
// Reuses the ONE slug rule (standard-specs.mjs) rather than re-deriving it, so a change to
// ensureCategoryPath's ad-hoc slugging can never make these two files disagree. A product with NO
// category has no category segment at all — its SEO record is the whole path.
export function storefrontUrlFor(rec) {
  if (!rec.categoryPath) return `/${productSlug(rec.name)}`;
  return storefrontPathForAdHoc(rec.categoryPath, rec.name);
}

// ---------------------------------------------------------------------------
// VACUITY GUARDS — every check names the way the fixture could exist and prove nothing.
// ---------------------------------------------------------------------------

/**
 * The quantity fields that must DIVERGE between PROD_MOQ and PROD_PACK. Equal values on both sides
 * of the distinction under test are a data defect (.claude/rules/test-data.md §SECOND RULE): the
 * suspected render loop is triggered by disagreement, so identical quantities make the case pass
 * whether or not the defect exists.
 */
export const QUANTITY_DIVERGENCE_FIELDS = ['minQuantity', 'packSize', 'maxQuantity', 'stock'];

/**
 * MEASURED LIVE on vcst-qa, 2026-09-03 — do NOT "fix" the fixture to make this go away.
 *
 * The catalog STORES minQuantity exactly as written (REST GET reports 10 for PROD_PACK), but xAPI
 * reports **12** — `ceil(10 / 4) * 4`. The read path rounds a minimum UP onto the pack grid, so a
 * minQuantity that is not a multiple of packSize is **not observable on the storefront at all**:
 * whatever is stored, the customer-facing surface always sees a multiple.
 *
 * Consequence for test design, and it is a limit rather than a weakness to paper over: a case may
 * NOT assert "MOQ 10 with pack size 4" against the compare column — the column will read 12. What
 * the fixture does still prove is that the two products in the tab DISAGREE (7/1 vs 12/4), which is
 * the input the suspected render loop actually consumes.
 */
export const xapiMinQuantity = (rec) =>
  (rec.packSize > 1 ? Math.ceil(rec.minQuantity / rec.packSize) * rec.packSize : rec.minQuantity);

export function quantityDivergence(a = byAlias.PROD_MOQ, b = byAlias.PROD_PACK) {
  const problems = [];
  if (!a || !b) return ['PROD_MOQ / PROD_PACK missing from PRODUCTS'];
  if (a.categoryPath !== b.categoryPath) {
    problems.push(`PROD_MOQ (${a.categoryPath}) and PROD_PACK (${b.categoryPath}) are in different tabs — two products only collide inside ONE tab, so a cross-tab pair cannot trigger the render loop at all`);
  }
  for (const f of QUANTITY_DIVERGENCE_FIELDS) {
    if (a[f] === b[f]) problems.push(`${f} is ${a[f]} on BOTH PROD_MOQ and PROD_PACK — with no divergence the case passes whether or not the defect exists`);
  }
  // The divergence that matters is the one the STOREFRONT can see. Two stored minimums that differ
  // can still be rounded onto the same pack multiple, at which point the compare columns agree and
  // the fixture is vacuous without a single value in this file having changed.
  if (xapiMinQuantity(a) === xapiMinQuantity(b)) {
    problems.push(`stored minQuantity ${a.minQuantity} and ${b.minQuantity} both round UP to ${xapiMinQuantity(a)} on the pack grid — xAPI would report the SAME minimum for both columns, so the divergence exists only in the database`);
  }
  return problems;
}

// --- the variation branch ----------------------------------------------------

/** Variations declared for a record (never undefined). */
export const variationsOf = (rec) => rec?.variations || [];
/** True when the record is the `hasVariations` kind rather than plain or configurable. */
export const hasVariations = (rec) => variationsOf(rec).length > 0;
/**
 * What xAPI reports as `minVariationPrice` — the MINIMUM over the variations' own prices.
 * VERIFIED LIVE on vcst-qa 2026-09-03 (parent $89.99 over 34.99/44.99/54.99 → $34.99).
 */
export const minVariationPrice = (rec) =>
  (hasVariations(rec) ? Math.min(...variationsOf(rec).map((v) => Number(v.listPrice))) : null);
/**
 * The count the compare link renders. The `+ 1` is the COMPONENT's arithmetic
 * (`variations.length + 1` in compare-table.vue), not a property of the seeded data — a case
 * asserts what it observes; the fixture only guarantees how many variations exist.
 */
export const variationLinkCount = (rec) => variationsOf(rec).length + 1;

/** The money formatter the storefront column is read through. Used to prove a RAW gap survives it. */
export const formatMoney = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: CURRENCY }).format(Number(n));

/** How many variations the fixture must carry for its rendered count to be non-trivial. */
export const VARIATION_MIN_COUNT = 3;

/**
 * NOT BUILDABLE ON THIS PLATFORM, and recorded here so nobody spends the afternoon rediscovering it.
 *
 * The PR unit-tests an explicit fallback — "falls back to the plain price when hasVariations is true
 * but minVariationPrice is missing". A storefront fixture for it CANNOT be created. Measured live on
 * vcst-qa, 2026-09-03, on throwaway products in this same catalog:
 *
 *   - a variation with NO price row of its own INHERITS the parent's price. Parent $77.77 with two
 *     unpriced variations reported `minVariationPrice: $77.77` — i.e. exactly equal to `price`,
 *     which is the equality this domain's guard now forbids, and which would make the case pass on
 *     either branch;
 *   - deactivating the variations instead flips `hasVariations` to **false** and empties
 *     `variations[]`, so the product stops being a variations product altogether — while
 *     `minVariationPrice` STILL returns the parent's $77.77.
 *
 * In both states `minVariationPrice` is a non-null PriceType defaulting to the parent's own price,
 * and the only way to null it out (removing the price entirely) nulls `price` with it, leaving the
 * fallback's two branches indistinguishable. The fallback is therefore reachable by unit test only;
 * asserting it from the storefront is not possible, and a fixture claiming to cover it would be a
 * fixture that tests nothing.
 */
export const MIN_VARIATION_PRICE_ALWAYS_PRESENT = true;

/**
 * The variation fixture's vacuity guard — the analogue of quantityDivergence() for the price branch.
 *
 * `getDisplayPrice` picks minVariationPrice for a variations product and price for everything else.
 * If those two are EQUAL the compare column renders the same string whichever branch executed, so a
 * case built on this fixture is a guaranteed pass and proves nothing — the exact failure the MOQ/pack
 * pair is guarded against, arrived at from the price side.
 */
export function variationPriceDivergence(rec = byAlias.PROD_CMP_VARIATIONS) {
  const problems = [];
  if (!rec) return ['PROD_CMP_VARIATIONS is missing from PRODUCTS — the hasVariations branch of compare-table.vue has no fixture at all'];

  const vars = variationsOf(rec);
  if (vars.length < VARIATION_MIN_COUNT) {
    problems.push(`PROD_CMP_VARIATIONS carries ${vars.length} variation(s); at least ${VARIATION_MIN_COUNT} are required so the rendered count is a number a case can assert rather than a coincidence`);
    if (!vars.length) return problems;   // nothing below can be computed
  }

  const min = minVariationPrice(rec);
  // THE headline guard. Equality here is what INV_VARIATION_MASTER suffers from (price ==
  // minVariationPrice == $59.99), and it is why that product could not serve this purpose.
  if (min === Number(rec.listPrice)) {
    problems.push(`minVariationPrice (${formatMoney(min)}) EQUALS the parent price (${formatMoney(rec.listPrice)}) — getDisplayPrice returns the same value on both of its branches, so a case asserting the compare Price row passes whether or not the hasVariations branch ran`);
  }
  // A raw gap the money formatter rounds away is invisible in the column, which is the same defect
  // one step later: `differs` is computed over FORMATTED strings.
  if (formatMoney(min) === formatMoney(rec.listPrice)) {
    problems.push(`minVariationPrice and the parent price both format to "${formatMoney(min)}" — the raw values may differ, but the compare column renders one string, so the branch is unobservable`);
  }
  const prices = vars.map((v) => Number(v.listPrice));
  if (new Set(prices).size !== prices.length) {
    problems.push(`variation prices ${prices.join('/')} contain a tie — "the minimum" must be carried by exactly ONE variation, or a case cannot say which row it came from`);
  }
  for (const v of vars) {
    if (!(Number(v.listPrice) > 0)) problems.push(`variation ${v.code} has no positive price — an unpriced variation INHERITS the parent's price (measured live), which silently equalises minVariationPrice and price`);
    if (!(Number(v.stock) > 0)) problems.push(`variation ${v.code} has no stock — an out-of-stock variation changes what the Availability row renders`);
  }
  // A variations product ALONE in a tab is never rendered beside a plain-price column, so the
  // "this column reads a different KIND of price" comparison has nothing to compare against.
  if (!tabSiblings(rec).some((o) => !hasVariations(o))) {
    problems.push(`PROD_CMP_VARIATIONS has no PLAIN tab-mate in "${rec.categoryPath}" — the minVariationPrice column must sit beside an ordinary price column for the difference in semantics to be visible in one table`);
  }
  return problems;
}

/**
 * The two independent carriers of the raw-differs / formatted-same shape, which is the ONLY thing
 * that can catch `differs` being computed over formatted strings. Declared as data so the guard can
 * assert both survive an edit, and so a reader can see WHY each pair's numbers are what they are.
 */
export const FORMAT_COLLISIONS = [
  {
    id: 'number-property',
    carrier: 'property:AgentTestCompareFormatCollision',
    a: 'PROD_CMP_A', b: 'PROD_CMP_B',
    read: (rec) => rec.properties.find((x) => x.name === 'AgentTestCompareFormatCollision')?.value,
    why: 'raw 1234.5678 vs 1234.5679 — the values differ in the 4th decimal, which every common number formatter (Intl default maximumFractionDigits=3) rounds away, so both render "1,234.568"',
  },
  {
    id: 'availability',
    carrier: 'field:availability',
    a: 'PROD_CMP_A', b: 'PROD_CMP_B',
    read: (rec) => rec.stock,
    why: 'stock 12 vs 340 — both are in stock, so the Availability row formats to the same bucket label while the raw quantities differ. Independent of decimal storage, so it holds even if the platform truncates the Number property',
  },
];

export function formatCollisionProblems() {
  const problems = [];
  for (const fc of FORMAT_COLLISIONS) {
    const ra = byAlias[fc.a], rb = byAlias[fc.b];
    if (!ra || !rb) { problems.push(`${fc.id}: ${fc.a}/${fc.b} missing`); continue; }
    if (ra.categoryPath !== rb.categoryPath) problems.push(`${fc.id}: ${fc.a} and ${fc.b} are not in the same tab, so they never appear as two columns of one table`);
    const va = fc.read(ra), vb = fc.read(rb);
    if (va == null || vb == null) { problems.push(`${fc.id}: ${fc.carrier} is missing a value on ${va == null ? fc.a : fc.b}`); continue; }
    if (va === vb) problems.push(`${fc.id}: ${fc.carrier} is ${JSON.stringify(va)} on BOTH products — the RAW values must differ, or "differs is computed over formatted strings" is untestable`);
  }
  return problems;
}

/** Shape assertions shared by the drift guard and the unit tests. Returns [] when clean. */
export function validateSpecShape() {
  const problems = [];
  const seen = new Set();
  for (const r of PRODUCTS) {
    for (const [field, label] of [['cmpId', 'cmp id'], ['alias', 'alias'], ['code', 'SKU'], ['name', 'name']]) {
      const key = `${field}:${r[field]}`;
      if (seen.has(key)) problems.push(`duplicate ${label} "${r[field]}"`);
      seen.add(key);
    }
    if (!String(r.code).startsWith(SEED_PREFIX)) problems.push(`${r.cmpId}: SKU "${r.code}" lacks the ${SEED_PREFIX} prefix — teardown sweeps on it, so an unprefixed entity is orphaned permanently`);
    if (!String(r.name).startsWith(SEED_PREFIX)) problems.push(`${r.cmpId}: name "${r.name}" lacks the ${SEED_PREFIX} prefix`);
    if (!(Number(r.listPrice) > 0)) problems.push(`${r.cmpId}: listPrice must be a positive number`);
    if (!(Number(r.stock) > 0)) problems.push(`${r.cmpId}: stock must be positive — an out-of-stock column changes what the Availability row renders`);
    // Variations share the product namespace: a variation is a real catalog product, so a code or
    // name it shares with a parent makes find-or-create resolve the wrong entity in BOTH directions.
    for (const v of r.variations || []) {
      for (const [field, label] of [['code', 'SKU'], ['name', 'name']]) {
        const key = `${field}:${v[field]}`;
        if (seen.has(key)) problems.push(`duplicate ${label} "${v[field]}" (variation of ${r.cmpId})`);
        seen.add(key);
      }
      if (!String(v.code).startsWith(SEED_PREFIX)) problems.push(`${r.cmpId}: variation SKU "${v.code}" lacks the ${SEED_PREFIX} prefix — teardown sweeps on it`);
      if (!String(v.name).startsWith(SEED_PREFIX)) problems.push(`${r.cmpId}: variation name "${v.name}" lacks the ${SEED_PREFIX} prefix`);
    }
    for (const pr of r.properties || []) {
      if (!VALUE_TYPES.includes(pr.valueType)) problems.push(`${r.cmpId}: property "${pr.name}" has valueType "${pr.valueType}", which is not one of ${VALUE_TYPES.join('/')}`);
      if (pr.value == null || pr.value === '') problems.push(`${r.cmpId}: property "${pr.name}" has no value — an INLINE property only exists through its value, so this row would silently not be created`);
    }
  }

  // Tab-shape invariants the fixtures exist to create.
  const groupA = PRODUCTS.filter((r) => r.categoryPath === CATEGORY_PATHS.A);
  if (groupA.length <= COMPARE_LIMIT_PER_CATEGORY) {
    problems.push(`Group A holds ${groupA.length} products but the per-category compare limit is ${COMPARE_LIMIT_PER_CATEGORY} — with no ${COMPARE_LIMIT_PER_CATEGORY + 1}th candidate IN THE SAME TAB the cap can never be observed being enforced`);
  }
  const parent = byAlias.PROD_CMP_PARENT, child = byAlias.PROD_CMP_CHILD;
  if (parent && child) {
    const pSegs = parent.categoryPath.split('>').map((s) => s.trim()).filter(Boolean);
    const cSegs = child.categoryPath.split('>').map((s) => s.trim()).filter(Boolean);
    if (!(pSegs.length === 1 && cSegs.length === 2)) {
      problems.push('PROD_CMP_PARENT must sit at depth 1 and PROD_CMP_CHILD at depth 2 — otherwise the keys are not X vs X/Y and the pair lands in ONE tab instead of two');
    }
    if (cSegs[0] !== pSegs[0]) problems.push('PROD_CMP_CHILD is not under PROD_CMP_PARENT\'s category — the keys would then share no prefix');
    if (cSegs[1] !== cSegs[0]) {
      problems.push('the child category is not named identically to its parent — the LABEL collision (two different tabs rendering the same title) is the entire point of this pair, and a distinct name removes it silently');
    }
  }
  const nocat = byAlias.PROD_CMP_NOCAT;
  if (nocat && nocat.categoryPath !== '') problems.push('PROD_CMP_NOCAT has a category path — it must have NONE to produce zero Category breadcrumbs');
  if (PRODUCTS.filter((r) => r.categoryPath && r.categoryPath !== CATEGORY_PATHS.A).length < 1) {
    problems.push('every categorised product is in Group A — the tab strip is then a single tab and proves nothing');
  }

  problems.push(...quantityDivergence());
  problems.push(...formatCollisionProblems());
  problems.push(...variationPriceDivergence());
  return problems;
}

export const VALUE_TYPES = ['ShortText', 'LongText', 'Integer', 'Number', 'Boolean'];

// ---------------------------------------------------------------------------
// CSV mirror — the committed @td registry.
// ---------------------------------------------------------------------------
// test-data/compare/compare-products.csv mirrors ONLY the business columns derivable from PRODUCTS
// (plus hand-authored prose), exactly like configurable-products.csv mirrors configurable-specs.mjs
// SPECS. The guard re-derives every derivable cell from here, so the CSV can never drift and no
// runtime GUID can live in it — `platform_id` is committed BLANK and filled per env in
// aliases.<env>.json.
export const CSV_FILE_KEY = 'compare/compare-products';
export const CSV_PATH = 'test-data/compare/compare-products.csv';

/** The exact committed column order. A changed contract must change here first. */
export const CSV_COLUMNS = [
  'cmp_id', 'alias', 'sku', 'product_name', 'category_path',
  'price', 'currency', 'stock_qty', 'min_quantity', 'pack_size', 'max_quantity',
  'variation_count', 'min_variation_price',
  'product_slug', 'storefront_url', 'platform_id', 'test_purpose', 'notes',
];

/** The derivable cells for one record — what the guard compares the CSV against. */
export function csvRowFor(rec) {
  return {
    cmp_id: rec.cmpId,
    alias: rec.alias,
    sku: rec.code,
    product_name: rec.name,
    category_path: rec.categoryPath,
    price: String(rec.listPrice),
    currency: CURRENCY,
    stock_qty: String(rec.stock),
    min_quantity: String(rec.minQuantity),
    pack_size: String(rec.packSize),
    max_quantity: String(rec.maxQuantity),
    // Blank (not "0"/"") on a plain product vs a real number on the variation parent, so a case
    // reading @td(ALIAS.variationCount) can tell "no variations" from "a variations product".
    variation_count: String(variationsOf(rec).length),
    // The value the compare Price row must render for a variations product. Committed so a case
    // asserts @td(PROD_CMP_VARIATIONS.minVariationPrice) instead of a hardcoded 34.99 literal.
    min_variation_price: hasVariations(rec) ? String(minVariationPrice(rec)) : '',
    product_slug: productSlug(rec.name),
    storefront_url: storefrontUrlFor(rec),
    platform_id: '',   // runtime GUID — lives ONLY in aliases.<env>.json
  };
}
