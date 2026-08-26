/**
 * scripts/seed-data/carts/cart-hygiene-specs.mjs
 *
 * SINGLE source for "which carts compete for one identity tuple". Side-effect-free — no env load, no
 * network, no main() — so the preflight guard (check-competing-carts.mjs) and the unit tests import the
 * SAME rules.
 *
 * WHY THIS EXISTS
 * ---------------
 * xAPI resolves `Query.cart` and every cart MUTATION to two different carts when an account holds more
 * than one *shopping* cart for the same (customerId, storeId, currency): the query is name-unfiltered
 * (`GetCartQuery.CartName` has no default) while commands pin `cartName: "default"`
 * (`CartCommandBase.CartName = "default"`). The mutation then writes to a cart the storefront is not
 * rendering — the shipping address never binds, Place order stays disabled, and NOTHING errors
 * (HTTP 200, `errors: null`). See reports/bugs/open/BUG-multi-cart-users-cannot-set-checkout-shipping-address.md
 *
 * For TESTING this matters because `[PRE:RESET_CART]` cannot see the problem: it empties the *rendered*
 * cart through the UI, so a competing cart is invisible to it, and under the bug above it may even empty
 * the cart the mutations are NOT writing to. A leaked competing cart therefore fails a later, unrelated
 * case on a shared account and reads as a product defect (this is exactly how COMP-E2E-007 failed in
 * REG-2026-08-26-0943). 42 suites declare `[PRE:RESET_CART]`, so the guard belongs here, not in a suite.
 *
 * THE `null` vs `""` TRAP — load-bearing, do not "simplify"
 * --------------------------------------------------------
 * The platform selects the active cart with `FirstOrDefault(x => CartType != null || x.Type == null)`.
 * That is a C# `== null` test, so ONLY a genuinely null Type competes. A cart with `type: ""` (empty
 * string) is silently EXCLUDED, as is any discriminated type (`Wishlist`, `SavedForLater`, and the
 * unvalidated strings observed live: `"cart"`, `"CreatedFromWishlist"`). Treating `""` as null here would
 * make this module flag carts the platform never resolves — phantom findings — so `isShoppingCart()`
 * checks null/undefined STRICTLY.
 */

/** Mirrors VirtoCommerce.CartModule.Core ModuleConstants.DefaultCartName. */
export const DEFAULT_CART_NAME = 'default';

/**
 * True only for a cart the platform's active-cart resolution will consider — i.e. Type is genuinely
 * null/undefined. See "THE `null` vs `""` TRAP" above: `""` and any discriminated type are excluded.
 */
export function isShoppingCart(cart) {
  return cart != null && (cart.type === null || cart.type === undefined);
}

/** The identity tuple the resolver keys on. Carts in different groups never compete. */
export function groupKey(cart) {
  return `${cart.customerId ?? ''}|${cart.storeId ?? ''}|${cart.currency ?? ''}`;
}

const recency = (c) => Date.parse(c.modifiedDate || c.createdDate || 0) || 0;

/**
 * Decide which cart of a competing group to KEEP and which are surplus.
 *
 * Keep preference, in order:
 *   1. the cart named exactly `default` — it is the one every MUTATION resolves, so keeping it is what
 *      makes the account work again; keeping any other cart would leave writes going somewhere else.
 *   2. if several are named `default` (legacy duplicates do exist), the most recently touched one.
 *   3. if none is named `default`, the most recently touched cart — a mutation will then re-create
 *      `default` on the next write, which is the normal empty-account path.
 */
export function planGroup(carts) {
  const shopping = carts.filter(isShoppingCart);
  const defaults = shopping.filter((c) => (c.name || '') === DEFAULT_CART_NAME);
  const pool = defaults.length ? defaults : shopping;
  const keep = [...pool].sort((a, b) => recency(b) - recency(a))[0] ?? null;
  const surplus = shopping.filter((c) => c !== keep);
  return { keep, surplus, keptBecause: defaults.length ? 'named-default' : 'most-recent' };
}

/**
 * Group the carts and return only the groups that are actually EXPOSED (>1 shopping cart).
 * `risky` surplus carries line items — deleting it destroys cart contents, so the runnable requires
 * an explicit --force for those rather than silently discarding a customer's items.
 */
export function findExposed(carts) {
  const groups = new Map();
  for (const c of (carts || []).filter(isShoppingCart)) {
    const k = groupKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const exposed = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    const { keep, surplus, keptBecause } = planGroup(list);
    exposed.push({
      key, carts: list, keep, surplus, keptBecause,
      risky: surplus.filter((c) => (c.items?.length ?? c.itemsCount ?? 0) > 0),
    });
  }
  return exposed;
}
