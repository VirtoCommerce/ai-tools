# BUG-010-004: Bulk-order quantity cap bypassed when adding via /bulk-order (max-qty=7 exceeded)

**Suite:** 010 — B2C Bulk Ship Dashboard  
**Test Case:** B2C-BULK-007 (PASS for line dedupe, FAIL for quantity cap)  
**Severity:** Medium  
**Priority:** P2  
**Type:** Functional — quantity cap enforcement  
**Discovered:** 2026-05-05 during run REG-2026-05-04-1527  
**Browser:** Edge  
**Environment:** vcst-qa-storefront.govirto.com  
**Account:** milamuller2024@yahoo.com  
**SKU:** `1507112554` (Coca Cola Regular 6x330ml) on B2B-store

## Summary

When adding the same SKU multiple times via the `/bulk-order` "Manually" mode (3 rows × qty 2 = 6 added on top of an existing cart line of qty 3), the resulting cart shows **quantity 9** for that single coalesced line, which **exceeds the product's max-quantity cap of 7** ("You can order from 1 to 7 item(s)" warning is rendered after the fact).

A subsequent paste-mode add (qty 1) further pushed the line to **quantity 166** with a $170.00 subtotal — clearly bypassing the cap.

## Observations

1. **Line dedupe works correctly** (BL-CART-007): all bulk-order rows for SKU `1507112554` collapse into a single cart line. PASS.
2. **Quantity cap is NOT enforced server-side** during `addBulkItemsCart` — the `max_qty=7` constraint is only surfaced as a warning in the cart UI AFTER the line was already pushed past the cap.
3. The cart UI shows red warning chip "You can order from 1 to 7 item(s)" but the line is still committed at the over-cap quantity, and an "Order Summary" section continues to show the higher subtotal — order placement may then succeed or fail downstream.

## Steps to Reproduce

1. Sign in as `milamuller2024@yahoo.com / Password2!`
2. Cart already contains qty 3 of SKU `1507112554` (or seed via single-item add-to-cart)
3. Navigate to `/bulk-order`
4. Switch to **Manually** tab
5. Enter SKU `1507112554` qty 2 in row 1
6. Enter SKU `1507112554` qty 2 in row 2
7. Enter SKU `1507112554` qty 2 in row 3
8. Click **ADD TO CART**
9. Inspect `/cart`

## Expected

- Cart line for SKU `1507112554` is one row, quantity capped at 7 (max from product policy)
- Either:
  - (a) Bulk add silently caps the increment at 7 and shows a non-blocking note, OR
  - (b) Bulk add returns an error in the SKU-errors dialog: "Quantity exceeds maximum of 7 for SKU 1507112554"

## Actual

- Single line confirmed (good — BL-CART-007 holds)
- Quantity = 9 — exceeds the 7 cap
- Red warning chip appears AFTER push: "You can order from 1 to 7 item(s)"
- A second test (paste of `1507112554,1`) pushed quantity to 166 — strongly indicates the cap is purely cosmetic in the bulk-order path

## Evidence

- `reports/regression/REG-2026-05-04-1527/010-evidence/BULK-007-coalesce-single-line.png` — qty=9 line + red "1 to 7 items" chip + "Something went wrong" toast
- Subsequent run reached qty=166 (not screenshotted but confirmed via `main` innerText "Coca Cola Regular 6x330ml ... 166 ... $170.00")

## Impact

- Customer can place an order whose committed quantity exceeds the merchant's declared max-qty policy
- Inventory commitments / pick-pack / fulfilment may break downstream
- Promotion/discount calculations may compound on an invalid quantity
- The cosmetic "1 to 7" warning is misleading: it suggests a constraint, but the constraint is not enforced

## Suggested Fix

Server-side: enforce `max_qty` policy in the `addBulkItemsCart` mutation. Reject (or silently cap) quantities that exceed the product's `max_qty`. Surface the cap in the SKU-errors dialog same as for invalid SKUs.

## Cross-Layer Verification

| Layer | Result |
|---|---|
| STOREFRONT | Cart shows over-cap quantity (confirmed) |
| GRAPHQL | `addBulkItemsCart` allows over-cap insertion (response not blocked) |
| CONSOLE | "Something went wrong, Please try again later." toast appeared after push |

## References

- BL-CART-007 (single line per SKU dedupe — passes)
- B2C-BULK-007 (test case)
- ECL-2.1, ECL-14.1
