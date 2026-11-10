/**
 * scripts/seed-data/products/variant-picker-specs.mjs
 *
 * SINGLE source of truth for the variant-picker fixture (A11Y-VCP-001, suite 045).
 * Side-effect-free — no env load, no network, no main() — so the seeder and the drift guard import
 * the SAME rules. Data: test-data/products/variant-picker.json.
 *
 * WHAT THE STOREFRONT NEEDS (vc-frontend 2.59.0, read at the tag):
 *   - pages/product.vue picks the B2C template ONLY when the product carries a property named
 *     `VirtoFrontend_UI_Layout` whose value is exactly "B2C" (strict ===, constants/product.ts). Any
 *     other value — "b2c" included — falls back to the default template, which renders the B2B
 *     "Product variations" table, never the picker.
 *   - config/product_b2c.json puts the `product-options` block (options.vue → VcVariantPickerGroup /
 *     VcVariantPicker) on that template. The block hides itself when no option is derivable.
 *   - the family search behind it is `productfamilyid:<master> is:product,variation` + IN STOCK only
 *     (B2C filter), so every variation must carry stock, and options come only from properties whose
 *     propertyType is VARIATION (useProductVariationProperties → getVariationPropertiesGroupedByName).
 *
 * WHY THIS SHAPE (non-vacuity — what makes A11Y-VCP-001 able to fail):
 *   - TWO variation properties, each with ≥2 distinct values → ≥2 picker groups, so "selected vs
 *     unselected" exists in each group.
 *   - The Color×Size matrix is deliberately NOT full: once a value is picked, some options of the
 *     other group become unavailable (isAvailable=false) — the disabled state a picker a11y check must
 *     see exposed programmatically. A full matrix would never produce it.
 *   - Distinct prices per variation: a selection that resolves to the wrong variation shows a
 *     different price, so the "selected" state is observable beyond the ARIA attribute.
 *   - Option labels are unique ACROSS groups (no value is both a Color and a Size), so an accessible
 *     name can be tied to exactly one option.
 *
 * PROPERTY PLACEMENT (measured live on vcptcore_regression, 2026-11-06):
 *   - An INLINE value (propertyId null) surfaces in xAPI with propertyType PRODUCT whatever `type` the
 *     body declares — so inline works for the layout flag but NEVER yields a picker option.
 *   - The Color/Size definitions are therefore real catalog properties of type Variation, scoped to the
 *     fixture's OWN leaf category (categoryId set), so only this fixture's products inherit them. The
 *     leaf (`Test Fixtures > Variant Picker`) exists for that reason and is removed by the teardown.
 */

import { productSlug, storefrontPathForAdHoc, categorySegmentSlug } from './standard-specs.mjs';

export const FIXTURE_FILE = 'products/variant-picker.json';
export const FIXTURE_KEY = 'VARIANT_PICKER';
export const SEED_PREFIX = 'AGENT-TEST';
export const SKU_PREFIX = 'QA-VPICK-';
/** The exact property name/value the theme reads (vc-frontend constants/product.ts @2.59.0). */
export const LAYOUT = Object.freeze({ name: 'VirtoFrontend_UI_Layout', value: 'B2C' });

const str = (v) => String(v ?? '').trim();

/** Normalize the JSON fixture. Pure. */
export function loadFixture(json) {
  if (!json || json.fixtureKey !== FIXTURE_KEY) return null;
  return {
    fixtureKey: json.fixtureKey,
    categoryPath: str(json.categoryPath),
    currency: str(json.currency) || 'USD',
    layout: { name: str(json.layoutProperty?.name), value: str(json.layoutProperty?.value) },
    variationProperties: (json.variationProperties || []).map(str),
    master: { ...json.master, sku: str(json.master?.sku), name: str(json.master?.name), listPrice: Number(json.master?.listPrice) },
    variations: (json.variations || []).map((v) => ({
      sku: str(v.sku), name: str(v.name), properties: v.properties || {}, listPrice: Number(v.listPrice), stock: Number(v.stock),
    })),
  };
}

export const deriveSlug = (name) => productSlug(name);

/**
 * The fixture's own leaf category, derived from categoryPath with ensureCategoryPath's ad-hoc rule
 * (slug `seed-<parent-scoped slugs>`, code `AGENT-TEST-SEED-<same>`), so storefrontPathForAdHoc holds. Pure.
 */
export function leafCategory(rec) {
  const segs = rec.categoryPath.split('>').map(str).filter(Boolean);
  const slug = categorySegmentSlug(segs);
  return { root: segs[0], name: segs[segs.length - 1], slug, code: `AGENT-TEST-SEED-${slug.replace(/^seed-/, '')}` };
}
export const deriveUrl = (categoryPath, name) => storefrontPathForAdHoc(categoryPath, name);

/** Inline property (no catalog definition). `type` is the catalog PropertyType. Pure. */
export function inlineProperty(name, type, value) {
  return {
    name, type, valueType: 'ShortText',
    required: false, dictionary: false, multivalue: false, multilanguage: false, hidden: false,
    isManageable: false, isReadOnly: false, isNew: false,
    values: [{ propertyName: name, valueType: 'ShortText', value }],
  };
}

export function buildMasterBody(rec, { seoInfos = [] } = {}) {
  return {
    name: rec.master.name, code: rec.master.sku, productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: true, seoInfos,
    properties: [inlineProperty(rec.layout.name, 'Product', rec.layout.value)],
  };
}

/** Category-scoped Variation property definition (POST /api/catalog/properties). Pure. */
export function buildVariationPropertyDef(name, { catalogId, categoryId }) {
  return {
    isNew: true, name, catalogId, categoryId, type: 'Variation', valueType: 'ShortText',
    required: false, dictionary: false, multivalue: false, multilanguage: false, hidden: false,
  };
}

/**
 * A variation: mainProductId + one value per picker property, BOUND to the category-scoped
 * definition (`defsByName[name] = { id }`) — an unbound value would surface as PRODUCT. No seoInfos.
 */
export function buildVariationBody(rec, v, masterId, defsByName) {
  return {
    name: v.name, code: v.sku, mainProductId: masterId, productType: 'Physical', vendor: 'QA',
    isActive: true, isBuyable: true, trackInventory: true,
    properties: rec.variationProperties.map((p) => {
      const def = defsByName[p];
      if (!def?.id) throw new Error(`buildVariationBody: no resolved definition for "${p}"`);
      return {
        id: def.id, name: p, type: 'Variation', valueType: 'ShortText', multivalue: false, multilanguage: false, dictionary: false,
        values: [{ propertyId: def.id, propertyName: p, valueType: 'ShortText', value: str(v.properties[p]) }],
      };
    }),
  };
}

/**
 * Combinations the picker must show as unavailable: for each value of property A, the values of
 * property B that no variation pairs with it. Pure. Empty ⇒ the disabled state is unreachable.
 */
export function unavailablePairs(rec) {
  const [a, b] = rec.variationProperties;
  const bValues = [...new Set(rec.variations.map((v) => str(v.properties[b])))];
  const out = [];
  for (const av of new Set(rec.variations.map((v) => str(v.properties[a])))) {
    const paired = new Set(rec.variations.filter((v) => str(v.properties[a]) === av).map((v) => str(v.properties[b])));
    for (const bv of bValues) if (!paired.has(bv)) out.push(`${a}=${av} ⇒ ${b}=${bv}`);
  }
  return out;
}

/** Shape / non-vacuity assertions shared by the seeder (abort) and the drift guard. Returns problems. */
export function validateFixtureShape(json) {
  const rec = loadFixture(json);
  if (!rec) return [`${FIXTURE_FILE}: no fixture with fixtureKey="${FIXTURE_KEY}"`];
  const P = [];
  if (rec.layout.name !== LAYOUT.name || rec.layout.value !== LAYOUT.value) {
    P.push(`layoutProperty must be ${LAYOUT.name}="${LAYOUT.value}" exactly (the theme compares with ===) — got ${rec.layout.name}="${rec.layout.value}"; anything else renders the B2B variations table, not the picker`);
  }
  if (rec.variationProperties.length !== 2) P.push(`exactly 2 variationProperties expected (got ${rec.variationProperties.length}) — the unavailable-combination rule is defined over a pair`);
  if (rec.variations.length < 2) P.push(`≥2 variations required (got ${rec.variations.length})`);

  const skus = new Set(), combos = new Set(), prices = new Set();
  const labelsByProp = new Map(rec.variationProperties.map((p) => [p, new Set()]));
  for (const v of rec.variations) {
    if (!v.name.startsWith(SEED_PREFIX)) P.push(`variation "${v.name}" must start with ${SEED_PREFIX}`);
    if (!v.sku.startsWith(SKU_PREFIX)) P.push(`variation sku "${v.sku}" must keep the ${SKU_PREFIX} prefix`);
    if (skus.has(v.sku)) P.push(`duplicate sku ${v.sku}`); skus.add(v.sku);
    if (!(v.stock > 0)) P.push(`${v.sku}: stock must be > 0 — the B2C family search is in-stock only, an unstocked variation never reaches the picker`);
    if (!(v.listPrice > 0)) P.push(`${v.sku}: listPrice must be > 0`);
    if (prices.has(v.listPrice)) P.push(`${v.sku}: listPrice ${v.listPrice} repeats — a wrong selection must be visible as a different price`); prices.add(v.listPrice);
    for (const p of rec.variationProperties) {
      const val = str(v.properties[p]);
      if (!val) P.push(`${v.sku}: missing value for variation property "${p}"`);
      else labelsByProp.get(p)?.add(val);
    }
    const key = rec.variationProperties.map((p) => str(v.properties[p])).join('|');
    if (combos.has(key)) P.push(`${v.sku}: combination ${key} repeats — two variations the picker cannot tell apart`); combos.add(key);
  }
  for (const [p, vals] of labelsByProp) if (vals.size < 2) P.push(`property "${p}" has ${vals.size} distinct value(s) — a group with one option has no unselected state`);
  const all = [...labelsByProp.values()].flatMap((s) => [...s]);
  if (new Set(all).size !== all.length) P.push('an option label appears in both groups — an accessible name could not identify one option');
  if (rec.variationProperties.length === 2 && !unavailablePairs(rec).length) {
    P.push('the Color×Size matrix is FULL — no option ever becomes unavailable, so the disabled state A11Y-VCP-001 must inspect is unreachable');
  }

  if (!rec.master.name.startsWith(SEED_PREFIX)) P.push(`master name "${rec.master.name}" must start with ${SEED_PREFIX}`);
  if (!rec.master.sku.startsWith(SKU_PREFIX)) P.push(`master sku "${rec.master.sku}" must keep the ${SKU_PREFIX} prefix`);
  if (skus.has(rec.master.sku)) P.push('master sku collides with a variation sku');
  if (rec.master.slug !== deriveSlug(rec.master.name)) P.push(`master.slug "${rec.master.slug}" != derived "${deriveSlug(rec.master.name)}"`);
  const wantUrl = deriveUrl(rec.categoryPath, rec.master.name);
  if (rec.master.url !== wantUrl) P.push(`master.url "${rec.master.url}" != derived "${wantUrl}"`);
  if (!(rec.master.listPrice > 0)) P.push('master.listPrice must be > 0');
  if (rec.categoryPath.split('>').filter((x) => x.trim()).length !== 2) P.push(`categoryPath must be <shared root> > <fixture leaf> — the leaf scopes the Variation properties to this fixture only`);
  return P;
}
