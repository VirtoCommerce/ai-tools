/**
 * range-facet-specs.mjs — SINGLE SOURCE OF TRUTH for the numeric range-facet fixture (suite 061,
 * SRCHA-047). Side-effect-free (no env, no network, no fs): the seeder and the drift guard import the
 * SAME declarations and the SAME derivations.
 *
 * THE CHAIN THIS DATA SERVES (SRCHA-047)
 * --------------------------------------
 *   numeric property N on products → indexed as a NUMBER → store facet on N set to Range →
 *   xAPI range_facets (counts per range + statistics min/max) → storefront slider bounded by min/max →
 *   a Start/End sub-range narrows the category to exactly the products whose N lies inside it.
 *
 * Why the env could not answer it before: the only numeric facet on B2B-store (Volume_ml) has ONE
 * product with ONE value (0.1), so min == max and every link above passes whatever the code does.
 *
 * WHAT MAKES EACH LINK DECIDABLE (SECOND RULE)
 *   - min != max: three products carry three DIFFERENT values of N.
 *   - numeric vs text typing: the values have different DIGIT COUNTS (9 / 45 / 120), so numeric order
 *     and lexicographic order DISAGREE. If N reached the index as text, statistics min/max would come
 *     back as "120"/"9" and NUMERIC_PROBE (5..20) would match nothing; numerically it matches LOW only.
 *   - the filter really narrows: SUB_RANGE (30..60) holds MID only, so applying it must drop LOW and
 *     HIGH; a filter that does nothing leaves all three.
 *   - a product WITHOUT N sits in the same category (PROD_RANGE_NONE): a filter that treats "no value"
 *     as "in range" keeps it, and the case catches that.
 *   - the name carries an underscore, so "the label and the URL keep the underscore" is checkable.
 *
 * LIMITS (stated, not hidden)
 *   - Every value is a whole number. Decimal rounding of the slider (step 1) is NOT exercised here.
 *   - No value sits ON a SUB_RANGE bound, so inclusive-vs-exclusive edges are NOT decided by this data.
 *   - The store facet itself is NOT configured here — the case does that (and restores it).
 *
 * NAMING — the lesson of REG-2026-11-03-2035. One Product index serves every catalog, and a field's
 * type is fixed by the first document that maps it: a seeded ShortText `Size` hit an index that
 * already mapped `size` as integer, and 8 documents were rejected on every build. So N is NAMESPACED
 * (AgentTest…): no other catalog can have mapped it first with another type.
 *
 * PROPERTY MODEL — N is a CATEGORY-level property of the fixture category (catalog-defined, Number).
 * Two reasons: the admin Facets list (GET /api/catalog/aggregationproperties/{storeId}/properties)
 * offers only catalog-defined properties of the catalogs linked into the store's virtual catalog, so an
 * inline-only property could not be picked in step 2; and a CATEGORY property is inherited only by the
 * products of that category, so nothing leaks onto the rest of the shared seed catalog.
 *
 * NAMING: everything carries AGENT-TEST so teardown sweeps exactly these.
 * RUNTIME IDS: product / category / property GUIDs → aliases.<env>.json only, never committed.
 */

import { productSlug, slugify, categorySegmentSlug, storefrontPathForAdHoc } from '../products/standard-specs.mjs';

export { productSlug, slugify };

export const SEED_PREFIX = 'AGENT-TEST';
export const CURRENCY = 'USD';
export const PRICE_LIST_NAME = 'AGENT-TEST-RangeFacet-USD';

/** The physical seed catalog the category is created in (ensured by `npm run seed:catalog`). */
export const SEED_CATALOG_NAME = 'AGENT-TEST-SEED-B2B-Electronics';

/** One ad-hoc root category, linked into the store's virtual catalog. */
export const CATEGORY_NAME = 'Range Facet Fixtures';
export const CATEGORY_CODE = `AGENT-TEST-SEED-${slugify(CATEGORY_NAME)}`;
/** Store-relative storefront path of the category: `{{FRONT_URL}}@td(RANGE_FACET_N.categoryUrl)`. */
export const CATEGORY_URL = `/${categorySegmentSlug([CATEGORY_NAME])}`;

/** Property N. Namespaced (see NAMING), with an underscore (see the chain), numeric. */
export const PROPERTY = {
  name: 'AgentTest_Length_mm',
  valueType: 'Number',
  type: 'Product',
};
/** The Product index field the property lands in — the catalog document builder lowercases the name. */
export const indexFieldName = () => PROPERTY.name.toLowerCase();

/** The sub-range the case applies (step 7) and the numeric-typing probe the seeder runs live. */
export const SUB_RANGE = { from: 30, to: 60 };
export const NUMERIC_PROBE = { from: 5, to: 20 };

export const PRODUCTS = [
  { rfId: 'RF-001', alias: 'PROD_RANGE_LOW', code: 'AGENT-TEST-RF-LOW', name: 'AGENT-TEST-Range-Facet-Low', value: 9, listPrice: 21.5, stock: 40 },
  { rfId: 'RF-002', alias: 'PROD_RANGE_MID', code: 'AGENT-TEST-RF-MID', name: 'AGENT-TEST-Range-Facet-Mid', value: 45, listPrice: 33.25, stock: 40 },
  { rfId: 'RF-003', alias: 'PROD_RANGE_HIGH', code: 'AGENT-TEST-RF-HIGH', name: 'AGENT-TEST-Range-Facet-High', value: 120, listPrice: 47.75, stock: 40 },
  // The control: same category, priced and in stock, and NO value for N.
  { rfId: 'RF-004', alias: 'PROD_RANGE_NONE', code: 'AGENT-TEST-RF-NONE', name: 'AGENT-TEST-Range-Facet-No-Value', value: null, listPrice: 18.0, stock: 40 },
];

/** The alias a case cites for the facet as a whole (property name, category, bounds, sub-range). */
export const FACET_ALIAS = 'RANGE_FACET_N';
/** The CSV row the facet alias reads its columns from (every row carries the same facet columns). */
export const FACET_ALIAS_ROW = 'RF-002';

export const withValue = () => PRODUCTS.filter((p) => p.value != null);
export const rangeMin = () => Math.min(...withValue().map((p) => p.value));
export const rangeMax = () => Math.max(...withValue().map((p) => p.value));
export const inRange = (r) => withValue().filter((p) => p.value >= r.from && p.value <= r.to);
/** What a TEXT (keyword) mapping would return for the same range — compared character by character. */
export const inRangeLexicographic = (r) => withValue().filter((p) => String(p.value) >= String(r.from) && String(p.value) <= String(r.to));

export const storefrontUrlFor = (rec) => storefrontPathForAdHoc(CATEGORY_NAME, rec.name);

/** Every reason this fixture set could answer nothing. Empty array = discriminating. */
export function validateSpecShape() {
  const problems = [];
  const seen = new Set();
  for (const p of PRODUCTS) {
    for (const f of ['rfId', 'alias', 'code', 'name']) {
      if (seen.has(`${f}:${p[f]}`)) problems.push(`duplicate ${f} "${p[f]}"`);
      seen.add(`${f}:${p[f]}`);
    }
    if (!String(p.name).startsWith(SEED_PREFIX) || !String(p.code).startsWith(SEED_PREFIX)) problems.push(`${p.rfId}: name and code must start with ${SEED_PREFIX} (teardown sweeps by prefix)`);
    if (!(p.stock > 0)) problems.push(`${p.rfId}: stock must be > 0 — the category listing shows in-stock products by default, so an out-of-stock fixture is invisible to the case`);
    if (!(p.listPrice > 0)) problems.push(`${p.rfId}: listPrice must be > 0`);
    if (p.value != null && !Number.isFinite(p.value)) problems.push(`${p.rfId}: value must be a finite number`);
  }
  if (!/^AgentTest/.test(PROPERTY.name)) problems.push(`property name "${PROPERTY.name}" is not namespaced (AgentTest…) — a generic name can collide with a field another catalog already mapped with a different type (REG-2026-11-03-2035: size, price)`);
  if (!PROPERTY.name.includes('_')) problems.push(`property name "${PROPERTY.name}" has no underscore — the case's "underscore preserved in label and URL" check becomes undecidable`);
  if (PROPERTY.valueType !== 'Number') problems.push(`property valueType is ${PROPERTY.valueType} — a Range facet needs a numeric index field`);

  const vals = withValue().map((p) => p.value);
  if (vals.length < 3) problems.push(`only ${vals.length} product(s) carry N — need 3 so a sub-range can hold some and drop others on BOTH sides`);
  if (new Set(vals).size !== vals.length) problems.push(`values of N repeat (${vals.join(', ')}) — equal values on both sides of a range collapse the filter`);
  if (rangeMin() === rangeMax()) problems.push(`min == max (${rangeMin()}) — the slider has no span and every bound check passes`);
  if (new Set(vals.map((v) => String(Math.trunc(Math.abs(v))).length)).size < 2) problems.push('all values have the same digit count — numeric and text ordering agree, so a text-typed index field would pass');
  if (PRODUCTS.filter((p) => p.value == null).length < 1) problems.push('no control product without N — "no value counts as in range" is undecidable');

  const sub = inRange(SUB_RANGE);
  if (!sub.length) problems.push(`SUB_RANGE ${SUB_RANGE.from}..${SUB_RANGE.to} holds no product — applying it cannot show a narrowed list`);
  if (sub.length === vals.length) problems.push(`SUB_RANGE ${SUB_RANGE.from}..${SUB_RANGE.to} holds every product — applying it cannot narrow anything`);
  if (!withValue().some((p) => p.value < SUB_RANGE.from) || !withValue().some((p) => p.value > SUB_RANGE.to)) problems.push('SUB_RANGE must drop a product BELOW it and one ABOVE it, or a one-sided filter passes');
  if (withValue().some((p) => p.value === SUB_RANGE.from || p.value === SUB_RANGE.to)) problems.push('a value sits ON a SUB_RANGE bound — the expected result would depend on edge inclusivity, which this fixture does not claim to decide');

  const probeNum = inRange(NUMERIC_PROBE).map((p) => p.rfId).join(',');
  const probeLex = inRangeLexicographic(NUMERIC_PROBE).map((p) => p.rfId).join(',');
  if (!probeNum) problems.push(`NUMERIC_PROBE ${NUMERIC_PROBE.from}..${NUMERIC_PROBE.to} matches nothing numerically`);
  if (probeNum === probeLex) problems.push(`NUMERIC_PROBE returns the same products numerically and lexicographically (${probeNum}) — it cannot tell a number field from a text field`);
  return problems;
}

// ---------------------------------------------------------------------------
// CSV mirror — the committed @td registry (derivable cells only; platform_id committed BLANK).
// ---------------------------------------------------------------------------
export const CSV_FILE_KEY = 'search/range-facet-products';
export const CSV_PATH = 'test-data/search/range-facet-products.csv';

export const CSV_COLUMNS = [
  'rf_id', 'alias', 'sku', 'product_name', 'category_name', 'category_url',
  'property_name', 'property_value', 'price', 'currency', 'stock_qty',
  'range_min', 'range_max', 'sub_range_from', 'sub_range_to', 'sub_range_skus',
  'product_slug', 'storefront_url', 'platform_id', 'test_purpose',
];

export function csvRowFor(rec) {
  return {
    rf_id: rec.rfId,
    alias: rec.alias,
    sku: rec.code,
    product_name: rec.name,
    category_name: CATEGORY_NAME,
    category_url: CATEGORY_URL,
    property_name: PROPERTY.name,
    property_value: rec.value == null ? '' : String(rec.value),
    price: String(rec.listPrice),
    currency: CURRENCY,
    stock_qty: String(rec.stock),
    range_min: String(rangeMin()),
    range_max: String(rangeMax()),
    sub_range_from: String(SUB_RANGE.from),
    sub_range_to: String(SUB_RANGE.to),
    sub_range_skus: inRange(SUB_RANGE).map((p) => p.code).join('|'),
    product_slug: productSlug(rec.name),
    storefront_url: storefrontUrlFor(rec),
    platform_id: '',
  };
}
