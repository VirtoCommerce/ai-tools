/**
 * feature-variants.mjs — live variant-space discovery (stage 1 of /qa-generate-data).
 *
 * "Learn the feature live": before designing combinations, enumerate HOW MANY
 * variants genuinely exist per axis in the running environment, so the matrix is
 * grounded in reality (and full-factorial-vs-pairwise is a data-driven choice),
 * not in assumptions.
 *
 * Each feature returns:
 *   - `axes`: LIVE-enumerated axes (real values + count, queried from admin REST).
 *   - `suggestedDesignAxes`: equivalence/boundary axes the skill should ADD via
 *     test-design (e.g. balance above/exact/below) — these are NOT live entities,
 *     they're partitions the feature's rules imply (cite business-logic.md).
 *
 * Read-only: uses only GET + POST /search endpoints via seed-common's `api()`,
 * so it is safe under --dry-run and never mutates the platform. Endpoints are the
 * same ones the seeders use (confirmed in seed-promotions/pricing/inventory/loyalty).
 *
 * Per-axis failures degrade gracefully: an axis whose endpoint errors is reported
 * with `source: "unavailable"` + the reason, never aborting the whole run.
 */

import { api, STORE_ID } from "./seed-common.mjs";

/** Normalize the various VC search envelopes to a plain array. */
function rows(r) {
  if (!r) return [];
  if (Array.isArray(r)) return r;
  return r.results || r.items || r.totalResults || [];
}

const distinct = (arr) => [...new Set(arr.filter((v) => v !== undefined && v !== null && v !== ""))];

/** Wrap an axis producer so an endpoint error becomes an `unavailable` axis, not a crash. */
async function safeAxis(axisName, note, fn) {
  try {
    const { values, count } = await fn();
    return { axis: axisName, source: "live", values, count: count ?? values.length, note };
  } catch (e) {
    return { axis: axisName, source: "unavailable", values: [], count: 0, note: `${note} — ${String(e.message).slice(0, 160)}` };
  }
}

/* ───────────────────────── Loyalty ───────────────────────── */
async function loyalty() {
  const progs = rows(await api("POST", "/api/loyalty-programs/search", { take: 100 }, { expectStatus: [200, 201] }));
  const axes = [
    { axis: "loyalty_program", source: "live", values: distinct(progs.map((p) => p.name)), count: progs.length, note: "Active + inactive programs found via /api/loyalty-programs/search" },
    { axis: "program_type", source: "live", values: distinct(progs.map((p) => p.programType)), count: distinct(progs.map((p) => p.programType)).length, note: "Distinct programType values present" },
    { axis: "program_active", source: "live", values: distinct(progs.map((p) => String(!!p.isActive))), count: distinct(progs.map((p) => String(!!p.isActive))).length, note: "isActive states present" },
  ];
  return {
    feature: "loyalty",
    axes,
    suggestedDesignAxes: [
      { axis: "loyalty_balance", values: ["above_cart_total", "exact_cart_total", "below_cart_total"], rationale: "BVA on burn — boundary at the insufficient-balance edge (see oracles/business-logic.md BL-LOY-*)" },
      { axis: "cart_composition", values: ["single_priced", "mixed_priced_unpriced", "with_oos_line"], rationale: "Mixed-cart earn/burn equivalence partitions" },
    ],
  };
}

/* ───────────────────────── Promotions ───────────────────────── */
async function promotions() {
  const promos = rows(await api("POST", "/api/marketing/promotions/search", { take: 200 }, { expectStatus: [200, 201] }));
  const active = promos.filter((p) => p.isActive);
  return {
    feature: "promotions",
    axes: [
      { axis: "promotion", source: "live", values: distinct(active.map((p) => p.name)).slice(0, 25), count: active.length, note: "Active promotions (names capped at 25 for the spec; count is the true total)" },
      { axis: "exclusivity", source: "live", values: distinct(promos.map((p) => (p.isExclusive ? "exclusive" : "non_exclusive"))), count: distinct(promos.map((p) => (p.isExclusive ? "exclusive" : "non_exclusive"))).length, note: "isExclusive states present" },
    ],
    suggestedDesignAxes: [
      { axis: "stacking", values: ["single_promo", "two_stacking", "exclusive_blocks_other"], rationale: "Promotion combination/exclusivity (oracles/business-logic.md BL-PROMO-*, vc-bug-catalog VC-PROMO-*)" },
      { axis: "threshold", values: ["below_threshold", "at_threshold", "above_threshold"], rationale: "BVA on cart-threshold conditions" },
      { axis: "coupon_mode", values: ["automatic", "coupon_required"], rationale: "Coupon-backed vs automatic reward (BestRewardPromotionPolicy)" },
    ],
  };
}

/* ───────────────────────── Pricing ───────────────────────── */
async function pricing() {
  const lists = await safeAxis("pricelist", "Pricelists via /api/pricing/pricelists/search", async () => {
    const r = rows(await api("POST", "/api/pricing/pricelists/search", { take: 100 }, { expectStatus: [200, 201] }));
    return { values: distinct(r.map((p) => p.name)), count: r.length, _raw: r };
  });
  // Currency axis derived from the same pull when available.
  let currencies = { axis: "currency", source: "unavailable", values: [], count: 0, note: "derived from pricelists" };
  try {
    const r = rows(await api("POST", "/api/pricing/pricelists/search", { take: 100 }, { expectStatus: [200, 201] }));
    const cur = distinct(r.map((p) => p.currency));
    currencies = { axis: "currency", source: "live", values: cur, count: cur.length, note: "Distinct pricelist currencies" };
  } catch (e) {
    currencies.note += ` — ${String(e.message).slice(0, 120)}`;
  }
  return {
    feature: "pricing",
    axes: [lists, currencies],
    suggestedDesignAxes: [
      { axis: "tier_break", values: ["below_tier", "at_tier", "above_tier"], rationale: "BVA on quantity-break tier pricing" },
      { axis: "price_state", values: ["list_only", "sale", "no_price"], rationale: "Pricing equivalence partitions (no-price triggers PRODUCT_PRICE_INVALID — vc-bug-catalog VC-CART-*)" },
    ],
  };
}

/* ───────────────────────── Products / Catalog ───────────────────────── */
async function products() {
  const prods = rows(await api("POST", "/api/catalog/search/products", { take: 200, responseGroup: "WithProperties" }, { expectStatus: [200, 201] }));
  const types = distinct(prods.map((p) => p.productType));
  return {
    feature: "products",
    axes: [
      { axis: "product_type", source: "live", values: types, count: types.length, note: "Distinct productType in catalog (Physical/Digital/...)" },
      { axis: "has_variations", source: "live", values: distinct(prods.map((p) => String((p.variations?.length ?? 0) > 0))), count: 2, note: "Whether variation-parent products exist" },
    ],
    suggestedDesignAxes: [
      { axis: "pricing_state", values: ["priced", "unpriced", "sale"], rationale: "see pricing feature" },
      { axis: "stock_state", values: ["in_stock", "low_stock", "out_of_stock"], rationale: "see inventory feature" },
    ],
  };
}

/* ───────────────────────── Inventory ───────────────────────── */
async function inventory() {
  const ffcs = rows(await api("POST", "/api/inventory/fulfillmentcenters/search", { take: 100 }, { expectStatus: [200, 201] }));
  return {
    feature: "inventory",
    axes: [
      { axis: "fulfillment_center", source: "live", values: distinct(ffcs.map((f) => f.name)), count: ffcs.length, note: "Fulfillment centers via /api/inventory/fulfillmentcenters/search" },
    ],
    suggestedDesignAxes: [
      { axis: "stock_state", values: ["in_stock", "low_stock", "out_of_stock"], rationale: "BVA on availableQuantity vs low-stock threshold" },
      { axis: "backorder", values: ["allowed", "not_allowed"], rationale: "allowBackorder/allowPreorder equivalence" },
    ],
  };
}

/** Feature registry. Add a feature here to make it discoverable. */
export const FEATURES = { loyalty, promotions, pricing, products, inventory };

/** Discover the variant space for `feature`. Throws on unknown feature. */
export async function discoverFeature(feature) {
  const fn = FEATURES[feature];
  if (!fn) throw new Error(`Unknown feature "${feature}". Known: ${Object.keys(FEATURES).join(", ")}`);
  const result = await fn();
  result.storeId = STORE_ID;
  return result;
}
