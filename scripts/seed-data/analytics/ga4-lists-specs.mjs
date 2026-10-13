/**
 * scripts/seed-data/analytics/ga4-lists-specs.mjs
 *
 * SINGLE source of truth (side-effect-free: no env, no network, no main()) for the VCST-6017 fixtures:
 * the storefront product LISTS whose GA4 view_item_list / select_item / view_item events vc-frontend
 * PR #2543 moved from analytics() calls to DOM markup (data-vc-track="product-list" containers).
 * Imported by seed-ga4-lists.mjs (related / variations / cart state), by the Page Builder seeder's
 * spec module (cms/pagebuilder-pages-specs.mjs resolves the `@pool…` markers of the two GA4 pages in
 * test-data/cms/page-content.json through resolvePoolMarkers) and by validate-ga4-lists-data.mjs.
 * Model: reports/ba/test-models/VCST-6017-2026-10-13.md §FIXTURE-GAP.
 *
 * WHAT MAKES THESE FIXTURES DISCRIMINATING (.claude/rules/test-data.md SECOND RULE)
 *   - one product appears in AT MOST ONE list/block (one shared, disjoint pool partition), so each
 *     view_item_list items[] is attributable to the container that sent it;
 *   - prices are DISTINCT across the whole pool, so an item carrying another card's price is visible;
 *   - every list is LONGER than the window the storefront renders at once (related carousel per-view,
 *     variations page, saved-for-later "Show more" step);
 *   - recently-browsed and saved-for-later are DISJOINT sets (the PR keeps SFL manual precisely because
 *     markup would leak SFL cards into recently_browsed_products).
 *
 * STOREFRONT WINDOWS are read from vc-frontend source (unchanged by the PR diff; cited at dev 48a9759c,
 * deployed theme 2.60.0-pr-2543). The storefront exposes them through no API, so they are declared here
 * and the drift guard insists every list exceeds its window; the browser case confirms the window live.
 */

export const TICKET = 'VCST-6017';
export const SEED_PREFIX = 'AGENT-TEST';
export const CURRENCY = 'USD';
export const CULTURE = 'en-US';
export const CATEGORY_PATH = 'Test Fixtures';
export const PRICELIST_NAME = 'AGENT-TEST-GA4-Lists-USD';
export const OUTER_ID_PREFIX = 'AGENT-TEST-GA4:';

export const STOREFRONT_WINDOWS = Object.freeze({
  /** pages/product.vue `variationsItemsPerPage` — 50 on the default (non-b2c) layout; default and table views share it. */
  variationsPageSize: 50,
  /** related-products.vue carousel: 5 per view, 6 at xl, 7 at 2xl. `lg = smaller("lg")` → GRID below lg, CAROUSEL at >= lg. */
  relatedCarouselMaxPerView: 7,
  /** pages/product.vue fetchRelatedProducts — any association group, itemsPerPage 30. */
  relatedFetchFirst: 30,
  /** shared/cart/components/cart-for-later.vue VISIBLE_ITEMS_STEP — "Show more" appears above 6. */
  savedForLaterStep: 6,
  /** recentlyBrowsed() default maxProducts, as called by pages/cart.vue. */
  recentlyBrowsedMax: 6,
});

/* ── Gap 1: Related products widget (PDP) ─────────────────────────────────────
 * Reads Query.product.associations with NO group filter (pages/product.vue → fetchRelatedProducts →
 * searchRelatedProducts.graphql), gated on product.associations.totalCount. NOT the "Recommended /
 * Customers bought together" widget — that is XRecommend's related-products / bought-together model, a
 * semantic index search (vc-module-x-recommend RelatedProductsRecommendationsService) that catalog
 * associations do not feed. The group must be one of Catalog.AssociationGroups' allowed values. */
export const RELATED = Object.freeze({
  anchor: { code: 'AGENT-TEST-GA4-REL-ANCHOR', name: 'AGENT-TEST GA4 Related Anchor', price: 49.99, stock: 100 },
  group: 'Accessories',
  count: 10,
});

/* ── Gap 2: Variations widget (PDP default layout) ───────────────────────────
 * Renders for hasVariations products on the DEFAULT template; the b2c template (product property
 * VirtoFrontend_UI_Layout=b2c) swaps it for the Options block, so the parent carries no such property. */
export const VARIATIONS = Object.freeze({
  parent: { code: 'AGENT-TEST-GA4-VAR-PARENT', name: 'AGENT-TEST GA4 Variations Parent', price: 9.99, stock: 500 },
  count: 60,
});

const pad2 = (n) => String(n).padStart(2, '0');
/** Variation i (1-based). Prices strictly increase, so every variation price is distinct. Pure. */
export function variationSpec(i) {
  return {
    index: i,
    code: `AGENT-TEST-GA4-VAR-${pad2(i)}`,
    name: `AGENT-TEST GA4 Variation ${pad2(i)}`,
    price: Math.round((10 + i * 1.25) * 100) / 100,
    stock: 20 + i,
  };
}
export const variationSpecs = () => Array.from({ length: VARIATIONS.count }, (_, k) => variationSpec(k + 1));

/* ── One live-discovered, DISJOINT product pool shared by every list ─────────
 * Real catalog products discovered through xAPI as a guest sees them (store / currency / culture),
 * sorted by code so a re-seed resolves the same partition in every seeder that asks. */
export const POOL_PLAN = Object.freeze([
  { key: 'related', size: RELATED.count },
  { key: 'cartLine', size: 1, orderable: true },
  { key: 'savedForLater', size: 7, orderable: true },
  { key: 'recentlyBrowsed', size: 6 },
  // multiImage: GA-040 needs >= 1 card whose product has >= 2 images (the card renders an image carousel).
  { key: 'pbProducts', size: 4, multiImage: 1 },
  { key: 'pbPredefined', size: 3 },
  { key: 'pbCarouselTitled', size: 5 },
  { key: 'pbCarouselUntitled', size: 4 },
  { key: 'pbFavorites', size: 4 },
  { key: 'pbDemo', size: 3 },
  { key: 'pbProductInfo', size: 1 },
  { key: 'htmlFull', size: 3 },
  { key: 'htmlPartial', size: 3 },
  // Appended LAST so every group above keeps its products: the 8th saved-for-later item, so the account's
  // SFL converges to exactly 8 SEEDED items (two "Show more" reveals' worth past the step of 6) instead of
  // depending on whatever foreign item happens to sit there.
  { key: 'savedForLaterTail', size: 1, orderable: true },
]);

/** The SFL target set: both saved-for-later groups. */
export const savedForLaterTarget = (groups) => [...(groups.savedForLater || []), ...(groups.savedForLaterTail || [])];

/**
 * Recently-browsed rows are keyed (product, user, store, eventType, SESSION) and the list is "the newest
 * `maxProducts` ROWS by ModifiedDate, de-duplicated after the take" (vc-module-x-recommend 3.1002.0
 * GetRecentlyBrowsedQueryHandler + PushHistoricalEventCommandHandler). A push WITHOUT a sessionId matches
 * every session's row for the product and stamps them all with one ModifiedDate, so a product the browser
 * also visited (the storefront sends sessionId = cart id) occupies 2+ of the newest rows and the window
 * returns fewer than 6 products. Pushing under ONE fixed session owned by this seeder touches exactly one row
 * per product, so the newest 6 rows are always 6 distinct products — deterministic from any history.
 */
export const RB_SESSION_ID = 'AGENT-TEST-GA4-RB-SEED';
export const POOL_SIZE = POOL_PLAN.reduce((n, g) => n + g.size, 0);
export const POOL_KEYS = new Set(POOL_PLAN.map((g) => g.key));

/** The xAPI selection every pool consumer needs (cards, demo/product-info embeds, HTML attributes). */
export const POOL_QUERY = `query($s:String!,$c:String!,$cu:String!,$after:String,$first:Int){
  products(storeId:$s,cultureName:$cu,currencyCode:$c,first:$first,after:$after,sort:"code:asc"){
    totalCount items{ id code name slug imgSrc images{url} hasVariations isConfigurable minQuantity maxQuantity packSize
      availabilityData{isBuyable isAvailable isInStock}
      price{ currency actual{amount formattedAmount} list{amount formattedAmount} sale{amount formattedAmount} discountAmount{amount formattedAmount} discountPercent } } } }`;

const cents = (n) => Math.round(Number(n) * 100);

/**
 * Filter xAPI items to pool candidates — every dimension a card reads is constrained: a real
 * (non-fixture) simple product, buyable + in stock, priced in the store currency, with a slug (PDP
 * link) and an image; unique by code, de-duplicated by price AND name so no two pool products can be confused on
 * either. Pure; keeps input order.
 */
export function selectPoolCandidates(items) {
  const seenPrice = new Set(), seenName = new Set(), out = [];
  // A code carried by two products (one per catalog) is AMBIGUOUS: the blocks select by code, so a
  // card for it would render both products. Such codes never enter the pool.
  const codeCount = new Map();
  for (const p of items || []) if (p?.code) codeCount.set(p.code, (codeCount.get(p.code) || 0) + 1);
  for (const p of items || []) {
    if (codeCount.get(p?.code) > 1) continue;
    if (!p?.id || !p.code || !p.slug || !p.imgSrc) continue;
    if (/^(AGENT-TEST|QA-|SEED-)/i.test(p.code) || /^(AGENT-TEST|SEED-)/i.test(p.name || '')) continue;
    if (p.hasVariations || p.isConfigurable) continue;
    const a = p.availabilityData || {};
    if (a.isBuyable === false || a.isAvailable === false || a.isInStock === false) continue;
    const price = Number(p.price?.actual?.amount);
    if (!(price > 0) || (p.price?.currency && p.price.currency !== CURRENCY)) continue;
    const pc = cents(price), nm = String(p.name || '').trim().toLowerCase();
    if (seenPrice.has(pc) || seenName.has(nm)) continue;
    seenPrice.add(pc); seenName.add(nm);
    out.push({
      id: p.id, code: p.code, name: p.name, slug: p.slug, url: `/${String(p.slug).replace(/^\/+/, '')}`,
      imgSrc: p.imgSrc, images: (p.images || []).map((i) => ({ url: i.url })), price, priceObj: p.price,
      minQuantity: p.minQuantity ?? 0, maxQuantity: p.maxQuantity ?? 0, packSize: p.packSize ?? 1,
    });
  }
  return out;
}

/** Can a cart line hold exactly ONE of this product? (addItem qty 1 is rejected below minQuantity — measured
 * live: PRODUCT_MIN_QTY, silently, as a validation error on an otherwise successful mutation.) Pure. */
export const orderableAtOne = (p) => (p.minQuantity ?? 0) <= 1 && (p.packSize ?? 1) <= 1 && !((p.maxQuantity ?? 0) > 0 && p.maxQuantity < 1);

/** Does the card render an image carousel? (>= 2 product images.) Pure. */
export const isMultiImage = (p) => (p?.images?.length || 0) >= 2;

/**
 * Partition candidates into the POOL_PLAN groups, in order. Per-group constraints:
 *   `orderable`     (the group is put in a cart at quantity 1) — EVERY product must be orderableAtOne;
 *   `multiImage: k` — at least k products must be isMultiImage: the first k qualifying candidates in queue
 *                   order are reserved, then the rest of the group fills from the queue as usual.
 * A candidate a group skips stays queued for later groups, so a constraint only moves products between the
 * constrained group and the group the reserved candidate came from. A group keeps the candidates' original
 * (code) order. Throws when the catalog cannot fill a group. Pure.
 */
export function partitionPool(candidates) {
  const all = [...(candidates || [])];
  const rank = new Map(all.map((p, i) => [p, i]));
  const queue = [...all];
  const groups = {};
  for (const g of POOL_PLAN) {
    const fits = (p) => !g.orderable || orderableAtOne(p);
    const take = [];
    const need = g.multiImage || 0;
    for (let i = 0; i < queue.length && take.length < need;) {
      if (fits(queue[i]) && isMultiImage(queue[i])) take.push(queue.splice(i, 1)[0]); else i++;
    }
    for (let i = 0; i < queue.length && take.length < g.size;) {
      if (fits(queue[i])) take.push(queue.splice(i, 1)[0]); else i++;
    }
    const multi = take.filter(isMultiImage).length;
    if (take.length < g.size || multi < need) {
      throw new Error(`pool cannot fill "${g.key}" (${take.length}/${g.size}${g.orderable ? ', orderable at qty 1' : ''}${need ? `, ${multi}/${need} multi-image` : ''}) from ${all.length} candidates`);
    }
    groups[g.key] = take.sort((x, y) => rank.get(x) - rank.get(y));
  }
  return groups;
}

/** Seeded-state divergence check: group sizes, disjoint ids, distinct prices across the pool. Pure. */
export function partitionProblems(groups) {
  const problems = [], owner = new Map(), priceOwner = new Map();
  for (const g of POOL_PLAN) {
    const items = groups?.[g.key] || [];
    if (items.length !== g.size) problems.push(`${g.key}: ${items.length} products, plan says ${g.size}`);
    if (g.multiImage && items.filter(isMultiImage).length < g.multiImage) problems.push(`${g.key} has no multi-image product (needs ${g.multiImage} with >= 2 images), so GA-040 is undecidable — its image-carousel card cannot render`);
    if (g.orderable) for (const p of items) if (!orderableAtOne(p)) problems.push(`${p.code} (${g.key}) cannot be a quantity-1 cart line (min ${p.minQuantity}, pack ${p.packSize})`);
    for (const p of items) {
      if (owner.has(p.id)) problems.push(`${p.code} is in both ${owner.get(p.id)} and ${g.key} — its event would not be attributable to one list`);
      owner.set(p.id, g.key);
      const pc = cents(p.price);
      if (priceOwner.has(pc)) problems.push(`${p.code} (${g.key}) shares price ${p.price} with ${priceOwner.get(pc)} — an item carrying a sibling's price could not be told apart`);
      priceOwner.set(pc, `${p.code} (${g.key})`);
    }
  }
  return problems;
}

/* ── Page Builder content markers (test-data/cms/page-content.json) ───────────
 * The GA4 pages' blocks name a pool group instead of SKUs, so each block gets its OWN products:
 *   "skus":    "@pool:<key>"          → [{ sku }]                 (products / predefined-product-list / products-carousel)
 *   "filter":  "@pool-filter:<key>"   → "code":"A","B"            (favorite-products — a query/filter search, NOT the account's favourites)
 *   "count":   "@pool-count:<key>"    → group size
 *   "products":"@pool-demo:<key>"     → [{ product:{ id, code, name, imgSrc, prices:[{currency,list}] } }]   (demo-product-list, embedded)
 *   "product": "@pool-product:<key>"  → one embedded Product projection                                     (product-info)
 *   inside any string: "@@cards:<key>@@" / "@@cards-partial:<key>@@" → plain-HTML product cards (text block) */
export const POOL_MARKER_RE = /^@pool(?:-(filter|count|demo|product))?:([A-Za-z]+)$/;
export const CARDS_MARKER_RE = /@@cards(-partial)?:([A-Za-z]+)@@/g;

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const money = (n) => (Math.round(Number(n) * 100) / 100).toFixed(2);

/** Plain-HTML product cards in the PR README's attribute grammar; `partial` drops id + sku. Pure. */
export function htmlCards(items, { partial = false } = {}) {
  return items.map((p) => {
    const attrs = partial
      ? `data-product-name="${esc(p.name)}" data-product-price="${money(p.price)}"`
      : `data-product-id="${esc(p.id)}" data-product-sku="${esc(p.code)}" data-product-name="${esc(p.name)}" data-product-price="${money(p.price)}"`;
    return `<div data-vc-track="product-card" ${attrs}><a data-vc-track="product-link" href="${esc(p.url)}">${esc(p.name)}</a> <span>$${money(p.price)}</span></div>`;
  }).join('');
}

const demoProduct = (p) => ({ product: { id: p.id, code: p.code, name: p.name, imgSrc: p.imgSrc, prices: [{ currency: CURRENCY, list: { formattedAmount: p.priceObj?.list?.formattedAmount || `$${money(p.price)}` } }] } });
const productInfoProduct = (p) => ({
  id: p.id, code: p.code, name: p.name, slug: p.slug, imgSrc: p.imgSrc,
  images: p.images?.length ? p.images : [{ url: p.imgSrc }], videos: [], isPurchased: false, price: p.priceObj,
});

/** Resolve one block's markers against the partition; returns a fresh block. Throws on an unknown group. Pure. */
export function resolvePoolMarkers(block, groups) {
  const need = (key) => { if (!groups?.[key]) throw new Error(`pool group "${key}" not in POOL_PLAN`); return groups[key]; };
  const out = {};
  for (const [k, v] of Object.entries(block)) {
    if (typeof v !== 'string') { out[k] = v; continue; }
    const m = v.match(POOL_MARKER_RE);
    if (m) {
      const items = need(m[2]);
      if (!m[1]) out[k] = items.map((p) => ({ sku: p.code }));
      else if (m[1] === 'filter') out[k] = `"code":"${items.map((p) => p.code).join('","')}"`;
      else if (m[1] === 'count') out[k] = items.length;
      else if (m[1] === 'demo') out[k] = items.map(demoProduct);
      else out[k] = productInfoProduct(items[0]);
      continue;
    }
    out[k] = v.replace(CARDS_MARKER_RE, (_, partial, key) => htmlCards(need(key), { partial: !!partial }));
  }
  return out;
}

/** Every pool group a content doc references (for the guard's disjointness-per-block check). Pure. */
export function poolRefs(doc) {
  const refs = [];
  for (const b of doc?.content || []) {
    for (const v of Object.values(b)) {
      if (typeof v !== 'string') continue;
      const m = v.match(POOL_MARKER_RE);
      if (m && m[1] !== 'count') refs.push({ block: b.id, type: b.type, key: m[2] });
      for (const c of v.matchAll(CARDS_MARKER_RE)) refs.push({ block: b.id, type: b.type, key: c[2] });
    }
  }
  return refs;
}

/* ── Catalog bodies ─────────────────────────────────────────────────────────── */
export function buildProductBody({ code, name }, { catalogId, categoryId, seoInfos = [], mainProductId = null } = {}) {
  const body = { catalogId, categoryId, name, code, productType: 'Physical', vendor: 'QA', isActive: true, isBuyable: true, trackInventory: true, outerId: `${OUTER_ID_PREFIX}${code}`, seoInfos };
  if (mainProductId) body.mainProductId = mainProductId;
  return body;
}

export function buildAssociationBodies(anchorId, related) {
  return related.map((p, i) => ({
    itemId: anchorId, associatedObjectId: p.id, associatedObjectType: 'product', type: RELATED.group,
    priority: related.length - i, quantity: 1, outerId: `${OUTER_ID_PREFIX}REL:${p.code}`,
  }));
}
export const isSeededAssociation = (a) => String(a?.outerId || '').startsWith(`${OUTER_ID_PREFIX}REL:`);

/* ── Aliases (base keys in aliases.json, runtime ids in aliases.<env>.json) ─── */
export const ALIASES = Object.freeze({
  related: 'PROD_GA4_RELATED_ANCHOR',
  variations: 'PROD_GA4_VARIATION_PARENT',
  cart: 'CART_GA4_SFL_RB',
  listsPage: 'PB_GA4_PRODUCT_LISTS',
  htmlPage: 'PB_GA4_HTML_LISTS',
});

/**
 * Runtime alias fields a pool-backed Page Builder page publishes to aliases.<env>.json, derived from the
 * partition (the Page Builder seeder merges them into the page's own alias). Pure.
 *   PB_GA4_PRODUCT_LISTS.carousel_card_*  — the multi-image product of the FIRST products block (pbProducts),
 *                                            the card GA-040 drives the image carousel on.
 */
export function pageAliasFields(alias, groups) {
  if (alias !== ALIASES.listsPage) return {};
  const card = (groups?.pbProducts || []).find(isMultiImage);
  if (!card) return {};
  return { carousel_card_name: card.name, carousel_card_code: card.code, carousel_card_images: card.images.length };
}

/** Non-vacuity of the DECLARED fixture (run by the drift guard). Each message names the bug it would hide. Pure. */
export function validateSpec() {
  const p = [], W = STOREFRONT_WINDOWS;
  if (RELATED.count <= W.relatedCarouselMaxPerView) p.push(`RELATED.count ${RELATED.count} <= ${W.relatedCarouselMaxPerView} per view — the carousel would show every card, "impression = visible slides" vs "whole list" could not differ`);
  if (RELATED.count < 8) p.push('RELATED.count < 8 — the brief requires >= 8 related products');
  if (RELATED.count > W.relatedFetchFirst) p.push(`RELATED.count > ${W.relatedFetchFirst} — the PDP fetches only the first ${W.relatedFetchFirst}`);
  if (VARIATIONS.count <= W.variationsPageSize) p.push(`VARIATIONS.count ${VARIATIONS.count} <= page size ${W.variationsPageSize} — no page 2, scenario #12 could not fail`);
  const vs = variationSpecs();
  if (new Set(vs.map((v) => cents(v.price))).size !== vs.length) p.push('variation prices are not distinct');
  if (new Set(vs.map((v) => v.code)).size !== vs.length) p.push('variation codes are not distinct');
  if ([...vs, RELATED.anchor, VARIATIONS.parent].some((v) => !v.name.startsWith(SEED_PREFIX))) p.push(`a created product name lacks the ${SEED_PREFIX} prefix`);
  const size = Object.fromEntries(POOL_PLAN.map((g) => [g.key, g.size]));
  const pbProducts = POOL_PLAN.find((g) => g.key === 'pbProducts');
  if (!(pbProducts?.multiImage >= 1)) p.push('pbProducts declares no multiImage constraint — the first products block may hold only single-image cards, so GA-040 is undecidable');
  const sflTotal = size.savedForLater + (size.savedForLaterTail || 0);
  if (sflTotal <= W.savedForLaterStep) p.push(`saved-for-later target ${sflTotal} <= step ${W.savedForLaterStep} — no "Show more", scenario #14's re-send check could not fail`);
  if (size.recentlyBrowsed < 2 || size.recentlyBrowsed > W.recentlyBrowsedMax) p.push(`recentlyBrowsed must be 2..${W.recentlyBrowsedMax} so the rendered RB set is exactly the seeded one`);
  for (const g of POOL_PLAN) if (!['cartLine', 'pbProductInfo', 'savedForLaterTail'].includes(g.key) && g.size < 2) p.push(`${g.key} has ${g.size} product — a one-item list cannot show a mis-collected item`);
  const fake = Array.from({ length: 2 }, (_, i) => ({ id: `id${i}`, code: `C${i}`, name: `N${i}`, url: `/n${i}`, price: i + 1 }));
  if (/data-product-(id|sku)=/.test(htmlCards(fake, { partial: true }))) p.push('partial HTML cards leak id/sku — scenario #19 needs name + price only');
  return p;
}
