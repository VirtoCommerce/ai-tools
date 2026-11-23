/**
 * scripts/seed-data/products/size-run-specs.mjs
 *
 * SINGLE source of truth for the size-run fixture (B2C-VAR-001, suite 009).
 * Side-effect-free — no env load, no network, no main() — so the seeder and the drift guard import
 * the SAME rules. Data: test-data/products/size-run.json.
 *
 * A SIBLING of variant-picker-specs.mjs, not a variant of it: the B2C-template mechanics (exact
 * `VirtoFrontend_UI_Layout`="B2C", category-scoped Variation definitions bound to each variation,
 * in-stock-only family search, own leaf category) are documented there and REUSED here by import.
 * VARIANT_PICKER is consumed by suite 045 and requires a 2-property, non-full matrix; this family is
 * the opposite shape and must not be folded into it.
 *
 * WHY THIS SHAPE (non-vacuity — what makes B2C-VAR-001 able to fail):
 *   - ONE variation property (Size) → ONE picker group, so picking a size alone resolves a variation
 *     and enables add-to-cart. A Color×Fabric×Size product ({{TEST_SKU}}) stays unpurchasable until
 *     every group is picked, which is what made the case unexecutable.
 *   - Exactly the sizes the case asserts (SIZE_RUN), one variation each — a missing or extra option
 *     is visible as a wrong list.
 *   - Strictly distinct list prices AND SKUs per variation, and a master price equal to none of them:
 *     if the storefront resolves the wrong variation (or the master) for the selected size, the PDP
 *     price, the cart line SKU and the cart line price all differ from `selection`.
 *   - Every variation stocked (B2C family search is in-stock only).
 *
 * LIMIT: a single-property family cannot show an unavailable combination — that state is
 * VARIANT_PICKER's job (variant-picker-specs.mjs).
 */

import {
  LAYOUT, SEED_PREFIX, deriveSlug, deriveUrl, leafCategory,
  buildMasterBody, buildVariationBody, buildVariationPropertyDef,
} from './variant-picker-specs.mjs';

export { LAYOUT, SEED_PREFIX, deriveSlug, deriveUrl, leafCategory, buildMasterBody, buildVariationBody, buildVariationPropertyDef };

export const FIXTURE_FILE = 'products/size-run.json';
export const FIXTURE_KEY = 'SIZE_RUN';
export const SKU_PREFIX = 'QA-SIZERUN-';
/** The size list B2C-VAR-001 asserts the picker shows — the case's contract, checked against the fixture. */
export const SIZE_RUN = Object.freeze(['XS', 'S', 'M', 'L', 'XL']);

const str = (v) => String(v ?? '').trim();

/** Normalize the JSON fixture (same record shape the variant-picker builders consume). Pure. */
export function loadFixture(json) {
  if (!json || json.fixtureKey !== FIXTURE_KEY) return null;
  return {
    fixtureKey: json.fixtureKey,
    categoryPath: str(json.categoryPath),
    currency: str(json.currency) || 'USD',
    layout: { name: str(json.layoutProperty?.name), value: str(json.layoutProperty?.value) },
    variationProperties: (json.variationProperties || []).map(str),
    sizes: str(json.sizes).split(',').map(str).filter(Boolean),
    master: { ...json.master, sku: str(json.master?.sku), name: str(json.master?.name), listPrice: Number(json.master?.listPrice) },
    selection: {
      size: str(json.selection?.size), sku: str(json.selection?.sku), name: str(json.selection?.name), listPrice: Number(json.selection?.listPrice),
    },
    variations: (json.variations || []).map((v) => ({
      sku: str(v.sku), name: str(v.name), properties: v.properties || {}, listPrice: Number(v.listPrice), stock: Number(v.stock),
    })),
  };
}

/** The variation whose Size equals `size`, or null. Pure. */
export function variationForSize(rec, size) {
  const p = rec.variationProperties[0];
  return rec.variations.find((v) => str(v.properties[p]) === size) || null;
}

/** Shape / non-vacuity assertions shared by the seeder (abort) and the drift guard. Returns problems. */
export function validateFixtureShape(json) {
  const rec = loadFixture(json);
  if (!rec) return [`${FIXTURE_FILE}: no fixture with fixtureKey="${FIXTURE_KEY}"`];
  const P = [];
  if (rec.layout.name !== LAYOUT.name || rec.layout.value !== LAYOUT.value) {
    P.push(`layoutProperty must be ${LAYOUT.name}="${LAYOUT.value}" exactly (the theme compares with ===) — got ${rec.layout.name}="${rec.layout.value}"; anything else renders the B2B variations table, not the picker`);
  }
  if (rec.variationProperties.length !== 1 || rec.variationProperties[0] !== 'Size') {
    P.push(`exactly ONE variation property "Size" expected (got ${JSON.stringify(rec.variationProperties)}) — a second group keeps add-to-cart inactive until it is also picked`);
  }
  const prop = rec.variationProperties[0];

  const want = SIZE_RUN.join(',');
  if (rec.sizes.join(',') !== want) P.push(`sizes "${rec.sizes.join(',')}" != the case's size run "${want}"`);
  const actual = rec.variations.map((v) => str(v.properties[prop]));
  if (actual.join(',') !== want) P.push(`variation sizes "${actual.join(',')}" != "${want}" — one variation per size, in this order`);
  if (rec.variations.length !== SIZE_RUN.length) P.push(`${SIZE_RUN.length} variations required (got ${rec.variations.length})`);

  const skus = new Set(), prices = new Set(), labels = new Set(), names = new Set();
  for (const v of rec.variations) {
    if (!v.name.startsWith(SEED_PREFIX)) P.push(`variation "${v.name}" must start with ${SEED_PREFIX}`);
    if (!v.sku.startsWith(SKU_PREFIX)) P.push(`variation sku "${v.sku}" must keep the ${SKU_PREFIX} prefix`);
    if (skus.has(v.sku)) P.push(`duplicate sku ${v.sku}`); skus.add(v.sku);
    if (names.has(v.name)) P.push(`duplicate name ${v.name}`); names.add(v.name);
    if (!(v.stock > 0)) P.push(`${v.sku}: stock must be > 0 — the B2C family search is in-stock only, an unstocked variation never reaches the picker`);
    if (!(v.listPrice > 0)) P.push(`${v.sku}: listPrice must be > 0`);
    if (prices.has(v.listPrice)) P.push(`${v.sku}: listPrice ${v.listPrice} repeats — a wrong variation for the selected size must show a different price`); prices.add(v.listPrice);
    const label = str(v.properties[prop]);
    if (!label) P.push(`${v.sku}: missing value for "${prop}"`);
    else if (labels.has(label)) P.push(`${v.sku}: size "${label}" repeats — two variations the picker cannot tell apart`);
    labels.add(label);
    const extra = Object.keys(v.properties).filter((k) => k !== prop);
    if (extra.length) P.push(`${v.sku}: extra variation properties ${extra.join(',')} — would add a picker group`);
  }

  if (!rec.master.name.startsWith(SEED_PREFIX)) P.push(`master name "${rec.master.name}" must start with ${SEED_PREFIX}`);
  if (!rec.master.sku.startsWith(SKU_PREFIX)) P.push(`master sku "${rec.master.sku}" must keep the ${SKU_PREFIX} prefix`);
  if (skus.has(rec.master.sku)) P.push('master sku collides with a variation sku');
  if (!(rec.master.listPrice > 0)) P.push('master.listPrice must be > 0');
  if (prices.has(rec.master.listPrice)) P.push(`master.listPrice ${rec.master.listPrice} equals a variation price — a PDP still showing the master price would pass as a selection`);
  if (rec.master.slug !== deriveSlug(rec.master.name)) P.push(`master.slug "${rec.master.slug}" != derived "${deriveSlug(rec.master.name)}"`);
  const wantUrl = deriveUrl(rec.categoryPath, rec.master.name);
  if (rec.master.url !== wantUrl) P.push(`master.url "${rec.master.url}" != derived "${wantUrl}"`);
  if (rec.categoryPath.split('>').filter((x) => x.trim()).length !== 2) P.push('categoryPath must be <shared root> > <fixture leaf> — the leaf scopes the Variation property to this fixture only');

  // The selection the case makes must be one real variation, and its declared sku/name/price must be that variation's.
  const sel = variationForSize(rec, rec.selection.size);
  if (!sel) P.push(`selection.size "${rec.selection.size}" matches no variation`);
  else {
    if (rec.selection.sku !== sel.sku) P.push(`selection.sku "${rec.selection.sku}" != ${sel.sku} (the ${rec.selection.size} variation)`);
    if (rec.selection.name !== sel.name) P.push(`selection.name "${rec.selection.name}" != ${sel.name}`);
    if (rec.selection.listPrice !== sel.listPrice) P.push(`selection.listPrice ${rec.selection.listPrice} != ${sel.listPrice}`);
    const idx = rec.variations.indexOf(sel);
    if (idx === 0 || idx === rec.variations.length - 1) P.push(`selection.size "${rec.selection.size}" is at the edge of the run — pick an interior size so a neighbour on BOTH sides is a wrong answer`);
  }
  return P;
}
