/**
 * Live test-data discovery primitives for QA agents.
 *
 * Queries the live xAPI ({BACK_URL}/graphql) to resolve entities at test
 * time instead of relying on cached fixtures. Use this when:
 *  - The entity ID drifts between seeds (virtual catalog root, product IDs,
 *    address IDs, cart IDs, coupon codes).
 *  - You need "any product / first available / current active" rather than
 *    a specific named entity.
 *
 * Use `@td(ALIAS.field)` instead when you need a specific entity you
 * assert against (e.g. CFG_LAPTOP for a configurable-product test).
 *
 * See `.claude/agents/knowledge/live-discovery.md` for the decision tree
 * and recipes (CSV-runner and interactive both).
 *
 * All functions return `null` (not throw) when nothing matches — caller
 * decides whether to retry, switch fixtures, or skip.
 */

import { TokenCache } from "./graphql-auth.js";
import { executeOperation, type GraphQLResponse } from "./graphql-executor.js";

/** Context shared across discovery calls within one run. */
export interface DiscoverContext {
  backUrl: string;
  storeId: string;
  currencyCode: string;
  cultureName: string;
  userId?: string;
  token?: string; // bearer token; omit for anonymous queries
  timeoutMs?: number;
}

export interface DiscoveredProduct {
  id: string;
  sku: string;
  name: string;
  slug: string;
}

export interface DiscoveredAddress {
  id: string;
  line1: string;
  city: string;
  countryCode: string;
}

export interface DiscoveredCart {
  id: string;
  itemsCount: number;
}

export interface DiscoveredCoupon {
  code: string;
  type: string;
}

/**
 * Build a context from env vars + an optional bearer token. Defaults:
 *   backUrl     ← process.env.BACK_URL  (required)
 *   storeId     ← process.env.STORE_ID  (required)
 *   currencyCode ← process.env.CURRENCY_CODE ?? "USD"
 *   cultureName  ← process.env.CULTURE_NAME  ?? "en-US"
 */
export function contextFromEnv(overrides: Partial<DiscoverContext> = {}): DiscoverContext {
  const backUrl = overrides.backUrl ?? process.env.BACK_URL;
  const storeId = overrides.storeId ?? process.env.STORE_ID;
  if (!backUrl) throw new Error("contextFromEnv: BACK_URL not set");
  if (!storeId) throw new Error("contextFromEnv: STORE_ID not set");
  return {
    backUrl,
    storeId,
    currencyCode: overrides.currencyCode ?? process.env.CURRENCY_CODE ?? "USD",
    cultureName: overrides.cultureName ?? process.env.CULTURE_NAME ?? "en-US",
    userId: overrides.userId ?? process.env.USER_ID,
    token: overrides.token,
    timeoutMs: overrides.timeoutMs,
  };
}

/**
 * Resolve a bearer token for a role alias (e.g. "USER_DEFAULT", "ORG_USER")
 * via the existing TokenCache. Convenience wrapper for callers that don't
 * already manage their own cache.
 */
export async function tokenForRole(
  role: string,
  ctx: Pick<DiscoverContext, "backUrl" | "storeId">,
  testDataDir = "test-data"
): Promise<string> {
  const cache = new TokenCache(testDataDir, {
    backUrl: ctx.backUrl,
    storeId: ctx.storeId,
  });
  return cache.getToken(role);
}

async function exec(
  ctx: DiscoverContext,
  query: string,
  variables: Record<string, unknown> = {}
): Promise<GraphQLResponse> {
  return executeOperation(query, variables, {
    backUrl: ctx.backUrl,
    token: ctx.token,
    timeoutMs: ctx.timeoutMs,
  });
}

function firstItem<T>(r: GraphQLResponse, path: string[]): T | null {
  let cursor: unknown = r.data;
  for (const seg of path) {
    if (cursor == null || typeof cursor !== "object") return null;
    cursor = (cursor as Record<string, unknown>)[seg];
  }
  if (!Array.isArray(cursor) || cursor.length === 0) return null;
  return cursor[0] as T;
}

/* ───────────────────────── Catalog ───────────────────────── */

const Q_VIRTUAL_CATALOG_ROOT = `
  query($storeId: String!, $first: Int) {
    categories(storeId: $storeId, first: $first) {
      items { id name hasParent }
    }
  }
`;

/**
 * Returns the active root category ID for the store's catalog.
 * Solves the recurring catalog-root-migration pain: the storefront-visible
 * root category drifts when catalogs are re-seeded. Hardcoded IDs go stale;
 * this query always returns whatever the live xAPI says is current.
 *
 * Returns `null` if the store has no categories.
 */
export async function discoverVirtualCatalogRoot(
  ctx: DiscoverContext
): Promise<string | null> {
  const r = await exec(ctx, Q_VIRTUAL_CATALOG_ROOT, {
    storeId: ctx.storeId,
    first: 50,
  });
  const items =
    (r.data as { categories?: { items?: Array<{ id: string; hasParent?: boolean }> } } | null)
      ?.categories?.items ?? [];
  const root = items.find((c) => c.hasParent === false) ?? items[0];
  return root?.id ?? null;
}

const Q_FIRST_AVAILABLE_PRODUCT = `
  query($storeId: String!, $filter: String, $first: Int) {
    products(storeId: $storeId, filter: $filter, first: $first) {
      items { id code name slug }
    }
  }
`;

export interface DiscoverProductOpts {
  /** Restrict to a category subtree. Defaults to the discovered virtual catalog root. */
  categoryId?: string;
  /** Free-form filter clause appended to `category.subtree:...`. */
  extraFilter?: string;
}

/**
 * Returns the first product in `categoryId` (or the discovered virtual catalog
 * root if omitted). Returns `null` if the catalog has no products in scope.
 *
 * NOTE: storefront xAPI exposes `code` as the SKU field on ProductType.
 */
export async function discoverFirstAvailableProduct(
  ctx: DiscoverContext,
  opts: DiscoverProductOpts = {}
): Promise<DiscoveredProduct | null> {
  const root = opts.categoryId ?? (await discoverVirtualCatalogRoot(ctx));
  if (!root) return null;
  const clauses = [`category.subtree:${root}`];
  if (opts.extraFilter) clauses.push(opts.extraFilter);
  const r = await exec(ctx, Q_FIRST_AVAILABLE_PRODUCT, {
    storeId: ctx.storeId,
    filter: clauses.join(" "),
    first: 1,
  });
  const item = firstItem<{ id: string; code: string; name: string; slug: string }>(r, [
    "products",
    "items",
  ]);
  return item ? { id: item.id, sku: item.code, name: item.name, slug: item.slug } : null;
}

const Q_PRODUCT_BY_SKU = `
  query($storeId: String!, $filter: String!) {
    products(storeId: $storeId, filter: $filter, first: 1) {
      items { id code name slug }
    }
  }
`;

/**
 * Looks up a product by its SKU (`code`). Returns `null` when no product
 * matches — caller decides whether the SKU is stale or simply wrong.
 */
export async function discoverProductBySku(
  ctx: DiscoverContext,
  sku: string
): Promise<DiscoveredProduct | null> {
  const r = await exec(ctx, Q_PRODUCT_BY_SKU, {
    storeId: ctx.storeId,
    filter: `code:"${sku}"`,
  });
  const item = firstItem<{ id: string; code: string; name: string; slug: string }>(r, [
    "products",
    "items",
  ]);
  return item ? { id: item.id, sku: item.code, name: item.name, slug: item.slug } : null;
}

/* ───────────────────────── Profile / Addresses ───────────────────────── */

const Q_FIRST_ADDRESS = `
  query($first: Int) {
    currentOrganizationAddresses(first: $first) {
      items { id line1 city countryCode addressType }
    }
  }
`;

export interface DiscoverAddressOpts {
  /** Filter by address type: shipping / billing / both. */
  type?: "shipping" | "billing";
  /** Filter by ISO country code (e.g. "USA", "CAN"). */
  countryCode?: string;
}

/**
 * Returns the first address visible to the current user via
 * `currentOrganizationAddresses`. Requires `ctx.token` to be set.
 * Returns `null` if the org has no matching addresses.
 *
 * Filters are applied client-side (the xAPI query doesn't expose
 * addressType/country filters directly on this endpoint).
 */
export async function discoverFirstAddress(
  ctx: DiscoverContext,
  opts: DiscoverAddressOpts = {}
): Promise<DiscoveredAddress | null> {
  const r = await exec(ctx, Q_FIRST_ADDRESS, { first: 50 });
  const items =
    (r.data as {
      currentOrganizationAddresses?: {
        items?: Array<{
          id: string;
          line1: string;
          city: string;
          countryCode: string;
          addressType?: string;
        }>;
      };
    } | null)?.currentOrganizationAddresses?.items ?? [];

  const match = items.find((a) => {
    if (opts.countryCode && a.countryCode !== opts.countryCode) return false;
    if (opts.type && a.addressType && !a.addressType.toLowerCase().includes(opts.type)) {
      return false;
    }
    return true;
  });
  return match
    ? { id: match.id, line1: match.line1, city: match.city, countryCode: match.countryCode }
    : null;
}

/* ───────────────────────── Cart ───────────────────────── */

const Q_FIRST_CART = `
  query($storeId: String!, $currencyCode: String!, $userId: String) {
    cart(storeId: $storeId, currencyCode: $currencyCode, userId: $userId) {
      id itemsCount
    }
  }
`;

/**
 * Returns the active cart for the current user. Requires `ctx.token` and
 * `ctx.userId`. Returns `null` if the cart query returns no cart.
 *
 * The `cart` query is a get-or-create — it always returns a cart for an
 * authenticated user, so `null` here usually signals an auth problem.
 */
export async function discoverFirstCart(
  ctx: DiscoverContext
): Promise<DiscoveredCart | null> {
  if (!ctx.userId) return null;
  const r = await exec(ctx, Q_FIRST_CART, {
    storeId: ctx.storeId,
    currencyCode: ctx.currencyCode,
    userId: ctx.userId,
  });
  const cart = (r.data as { cart?: { id: string; itemsCount: number } } | null)?.cart;
  return cart ? { id: cart.id, itemsCount: cart.itemsCount } : null;
}

/* ───────────────────────── Coupons ───────────────────────── */

const Q_ACTIVE_COUPON = `
  query($storeId: String!, $userId: String, $first: Int) {
    promotionCoupons(storeId: $storeId, userId: $userId, first: $first) {
      items { code type }
    }
  }
`;

/**
 * Returns any currently-active coupon code for the store. Useful for
 * coupon-application tests that don't care which coupon — they just need
 * "a coupon that resolves." Returns `null` if no active coupons exist.
 */
export async function discoverAnyActiveCoupon(
  ctx: DiscoverContext
): Promise<DiscoveredCoupon | null> {
  const r = await exec(ctx, Q_ACTIVE_COUPON, {
    storeId: ctx.storeId,
    userId: ctx.userId,
    first: 1,
  });
  const item = firstItem<{ code: string; type: string }>(r, ["promotionCoupons", "items"]);
  return item ? { code: item.code, type: item.type } : null;
}
