# UCP refused `create_cart` returns a `cart_id` that an anonymous buyer can never read `[P3]`

## Status: CONFIRMED — not filed (below severity floor)

**Env:** vcst-qa @ `VirtoCommerce.UCP` `3.1007.0-pr-9-91ca` (vc-module-ucp PR #9 @ `91ca741`, open)
**Surface:** MCP `POST {{FRONT_URL}}/ucp/mcp` → `tools/call` `create_cart` / `get_cart`, anonymous
**Found:** 2026-09-29, while verifying VCST-6054 (the fix that introduced the structured refusal)
**Related:** VCST-6054. Not a regression: before the fix there was no structured refusal and no `cart_id` in it.

## Summary

A `create_cart` refused for inventory (`insufficient_stock` / `out_of_stock` / `inventory_unavailable`)
for a **new** anonymous buyer returns `details.cart_id` and the message *"The cart may still contain
unfulfillable quantities. Review and correct it before checkout."*. It does **not** return a
`buyer_id`. Calling `get_cart` with that `cart_id` then fails with 400 `buyer_id is required for anonymous
continuation.`, so the agent cannot follow the advice it was just given.

In this path XCart never created the line. The Admin cart record is **empty**, so no quantity is held and
the "may still contain unfulfillable quantities" warning does not apply. Each refused call also leaves one
empty orphan `ucp-anonymous-*` cart.

## Steps to Reproduce

1. Resolve `@td(PROD_LOW_STOCK.sku)` via `search_products` and capture `available_quantity` (N).
2. Anonymous MCP call, **no `Authorization`**, **no `buyer_id`**: `create_cart` with `store_id`
   `{{STORE_ID}}`, one line of that product at quantity N+1.
3. Observe `isError: true`, `code: insufficient_stock`, `details.cart_id` present, **no `buyer_id`**
   anywhere in the response.
4. Call `get_cart` with `store_id` + that `cart_id` → **400** `buyer_id is required for anonymous continuation.`
5. Admin `GET {{BACK_URL}}/api/carts/<cart_id>` → the cart exists with **0 items**.

## Expected vs Actual

**Expected:** either the refusal carries the `buyer_id` needed to open the cart it names, or, when no
line was created, it omits `cart_id` and does not claim the cart may hold unfulfillable quantities.
**Actual:** a `cart_id` the caller cannot open, plus a warning that is false for this path.

## Why Low

The refusal itself is correct and unambiguous: `isError`, code, requested/available quantity. An agent
still knows not to continue and what quantity to offer, and no stock is held. The cost is a dead-end
instruction and orphan empty carts. The existing-cart path (`update_cart`, where `buyer_id` is already
known) works correctly and `get_cart` there reports `inventory_errors` honestly.

## Evidence

`reports/tickets/Sprint26-19/VCST-6054/evidence/VCST-6054-item01-create-cart-overstock-run1.json`
(`details.cart_id` present, no `buyer_id`). The `get_cart` 400 and the empty Admin cart were observed
in the same session; 53 such orphan carts were deleted afterwards.

## Fix Routing (→ /qa-fix)

- **Owning layer:** Layer 4 — MCP/REST (UCP adapter)
- **Suggested repo:** `VirtoCommerce/vc-module-ucp` · **repoKind:** module · **Ownership hint:** platform
- **RCA anchor:** the inventory refusal built by `UcpMcpErrorResultFactory` / `UcpInventoryErrorNormalizer`
  (PR #9) — `cart_id` added without the anonymous `buyer_id`
- **Routing confidence:** MEDIUM — repo certain; which of the two classes composes `details` not confirmed at source
