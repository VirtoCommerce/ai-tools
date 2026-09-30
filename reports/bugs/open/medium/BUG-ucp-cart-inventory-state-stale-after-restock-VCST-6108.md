# [XCart] A cart keeps the stock it was last read with, so a restock does not unblock checkout `[P2]` `[BL-CART-002]`

## Status: READY_TO_SUBMIT

**Tracker:** VCST-6108 (Bug, Medium, relates to VCST-6054) · auto-fix labels withheld: API-only repro, fix may span XCart + UCP

**Env:** vcst-qa · vc-module-ucp `3.1007.0-pr-9-91ca` (PR #9, open) · XCart `3.1037.0-pr-141-fb27` · Inventory `3.1008.0` ·
Platform `3.1073.0-pr-3121-9965` · storefront `2.59.0-pr-2519-10f3` (the footer, read live)
**Found:** 2026-09-29, while authoring suite-102 case UCPA-042 for VCST-6054. Reproduced the same day under a controlled timeline.
**Related:** VCST-6054 (its checkout guard is what turns the stale read into a hard block) · the fixed VCST-5234
(`BUG-xcart-clearvalidationcache-empties-lineitem-validationerrors-on-mutations.md`). It is not a duplicate: that bug lost validation errors after a save, while this one keeps stale errors because nothing saves.

## Summary

XCart caches the whole `CartAggregate`, including each line's product **inventory**, and evicts that cache only when the cart is
saved. An inventory change does not evict it. So when a cart is read while stock is low, every later read of that cart reports the
low stock until the cart is saved, or until the cached entry goes unread for the sliding expiration window.

Through UCP this becomes a deadlock. A refused `create_checkout` / `checkout_and_handoff` never saves the cart, so nothing ever
evicts the stale entry. An agent that keeps checking keeps it alive: the cart was still blocked 14.8 minutes after the restock.
The inverse also happens: an entry built **before** a stock drop let `create_checkout` pass once, and save checkout data, on a cart
that exceeded the stock at that moment.

## Steps to Reproduce

Fixture `@td(PROD_STOCK_DROP.sku)`, baseline stock 10 on `@td(FC_EAST.id)`. Use an admin token for REST and the buyer's UCP token
for MCP (the token recipe is in the suite-102 notes in `config/test-suites.json`).

1. MCP `create_cart` with the product at `@td(PROD_STOCK_DROP.cart_qty)`.
2. MCP `create_checkout` with a complete shipping address. It succeeds, and it saves the cart, so no cache entry exists yet.
3. `PUT {{BACK_URL}}/api/inventory/plenty`: set in-stock to `@td(PROD_STOCK_DROP.dropped_stock)` on `@td(FC_EAST.id)`.
4. MCP `get_cart` and `create_checkout`: both report `insufficient_stock`, available = the dropped value. This is correct.
5. `PUT {{BACK_URL}}/api/inventory/plenty`: set in-stock back to 10.
6. Within the next 15 minutes, call `get_cart`, `create_checkout` and `checkout_and_handoff` again.
   - They still return **409 `insufficient_stock`, available = the dropped value**.
   - At the same moment, `GET {{BACK_URL}}/api/inventory/products/{id}` returns **10** and `search_products` returns 10.

## Expected vs Actual

**Expected:** once stock is restored, the cart's inventory validation follows the stock, and checkout proceeds. `BL-CART-002`
covers the drop direction, and the restock is its mirror.

**Actual:** the cart keeps reporting the old stock, and checkout stays refused, as long as anything keeps reading the cart.

## Timeline (authenticated contract buyer, `timeline-contract-main.jsonl`)

| When | `get_cart` line | `search_products` | `create_checkout` | REST inventory | cart last saved |
|---|---|---|---|---|---|
| before drop | valid | 10 | ok | 10 | 15:10:07 |
| stock 1 | `insufficient_stock`, avail 1 | 1 | 409, avail 1 | 1 | 15:10:07 |
| restored, +3 s … +596 s (37 polls) | **`insufficient_stock`, avail 1** | 10 | **409, avail 1** | 10 | 15:10:07, never saved again |
| +14.8 min | — | — | `checkout_and_handoff` **409, avail 1** | 10 | 15:10:07 |

Neither anonymous control is a clean contrast. Both recovered (+72 s and +32 s) only because a cart save happened (admin
`modifiedDate` moved), which confirms the mechanism rather than an anonymous-vs-authenticated difference.

## It is a cache: the same cart at the same moment, read under two cache keys

The xAPI `cart(cartId, cartType:"cart")` query was run at the stale moment:
- `cultureName: "en-US"` (the key UCP had already built): `inStockQuantity` 1, `isValid` false, `PRODUCT_QTY_CHANGED`.
- `cultureName: "de-DE" / "fr-FR" / "es-ES"` (keys not yet built): `inStockQuantity` **10**, `isValid` true.

## Layer Validation

| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront Frontend | N/A | The UCP cart is type `cart`. `/cart` shows the buyer's own type-null cart and never this one (`L1-storefront-cart-contract-buyer.png`) |
| 2. Backend Admin | PASS | Admin `GET /api/carts/{id}` holds the line at qty 2, unchanged. Admin adds nothing beyond REST |
| 3. GraphQL xAPI | **FAIL** | `cart` query stale under the cached key and fresh under a new one (`layers-contract-stale-T+1min.json`, `…T+10min.json`) |
| 4. Platform REST API | PASS | `GET /api/inventory/products/{id}`: inStock 10, reserved 0, Enabled |

**Owning layer:** Layer 3, xAPI (XCart). UCP inherits the stale data through its in-process xAPI calls.

## Root Cause Analysis

All anchors are read at the deployed refs: `vc-module-x-cart@fb277134`, `vc-module-ucp@91ca741`.

- **XCart caches the aggregate with no inventory token.**
  - `src/VirtoCommerce.XCart.Data/Services/CartAggregateRepository.cs:245-257` caches the `CartAggregate` under a key built from the cart id, language, response group and include-fields.
  - `:262-266`: `ConfigureCache` adds only two expiration tokens: `GenericCachingRegion<CartAggregate>` for the cart id, and `GenericSearchCachingRegion<Promotion>`.
  - The cached aggregate carries each line's product inventory, loaded via `CartProductService.ApplyInventoriesToCartProductsAsync`.
- **Only a cart save evicts it.** `ClearCache` at `:268-271` is called from `SaveAsync` (`:66-86`) and from `Handlers/CartChangedEventHandler.cs:21`.
- **No inventory handler was found in the module.** A code search for `InventoryChangedEvent` in vc-module-x-cart returned 0 hits.
- **UCP adds the deadlock.** `UcpCartService.cs:292-299`: `ApplyCheckoutData` reads the cart and throws the inventory refusal **before** any mutation, so a refused checkout never saves and never evicts. UCP keeps no cart cache of its own: its only cache is the handoff session.
- **Expiry is time-based only.** The platform default is a sliding `CacheSlidingExpiration` of 15 minutes (vc-platform `appsettings.json`). Every read resets it.
  - VirtoOZ (Platform Developer Guide, Caching) says modified data is evicted explicitly, so this is not a deliberate TTL.
  - The value actually configured on the environment was not read.

## Not established

- **The anonymous and second-user controls on an identical, save-free timeline.** Both anonymous runs recovered via a save, as described above.
- **What clears the entry, apart from waiting while polled and a single-product reindex** (both fail):
  - an idle wait with no reads;
  - changing the line to a different quantity. Source says this saves and clears the entry; it was not run.
- **The TTL configured on the environment**, and whether multiple platform pods add per-node staleness.

## Evidence

`reports/bugs/screenshots/ucp-cart-inventory-state-stale-after-restock/`: the timelines (`*.jsonl`), the layer snapshots
(`layers-*.json`), `clear-reindex-contract.txt`, and `L1-storefront-cart-contract-buyer.png`. No tokens or session values are stored.
This is an API defect; the one screenshot documents the Layer-1 N/A.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 3, xAPI
- **Suggested repo:** `VirtoCommerce/vc-module-x-cart`
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** XCart `CartAggregateRepository` cache
- **Fix directions** (alternatives, the owner's choice):
  - add an inventory-change expiration token to `ConfigureCache`;
  - evict cart aggregates on an inventory-changed event;
  - skip the cache for validation-bearing reads.

  UCP could also force a fresh read before refusing a checkout, but that would only mask the XCart gap.
- **RCA anchor:** `CartAggregateRepository.cs:262-266` `ConfigureCache`, which has no inventory token
- **Routing confidence:** MEDIUM. The layer and mechanism are certain. The fix may touch both XCart (the cache) and UCP (the
  no-save refusal path), so a single-repo auto-fix may not cover the whole agent-facing symptom.
