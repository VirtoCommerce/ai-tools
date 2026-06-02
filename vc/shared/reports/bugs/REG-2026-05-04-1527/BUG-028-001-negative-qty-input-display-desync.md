# BUG-028-001 — Cart qty input accepts negative values; display desyncs from server state

**Suite:** 028 — Cart Core
**Run:** REG-2026-05-04-1527
**Browser:** Microsoft Edge (playwright-edge)
**Build:** Ver. 2.48.0-pr-2274-0307-0307f38b
**Date:** 2026-05-05
**Severity:** Medium (UI desync; server self-protects)
**Confirmed:** false (preliminary — needs qa-testing-expert investigation)
**Test Case:** CART-036
**Business Rule:** BL-CART-001 (qty validation)
**Edge Case Ref:** ECL-3.1, ECL-4.1
**Priority:** High

## Summary
On `/cart`, typing a negative number (e.g., `-1`) into a line-item quantity spinbutton and committing (Tab/blur) leaves the negative value visibly rendered in the input, the cart badge in the header, and a recalculated subtotal — even though the server-side cart actually stores qty=1 (line total reflects qty=1, not qty=-1). The displayed quantity never reconciles back with the actual cart state.

## Steps to Reproduce
1. Sign in to https://vcst-qa-storefront.govirto.com (slot 3 / Carlos Rodriguez / BuildRight org).
2. Navigate to a buyable product PDP (e.g., Erdinger Alkoholfrei German Alcohol Free Wheat Beer 12x500ml Cans).
3. Click `+` (Increase quantity) once to add to cart (qty becomes 24 — product MOQ).
4. Navigate to `/cart`.
5. Click into the quantity `spinbutton` for the line item.
6. Select all and type `-1`.
7. Press Tab (or click outside to blur).
8. Refresh the page.

## Expected
Per CART-036 spec: "negative numbers rejected — qty remains at last valid value". The input should:
- Reject the negative input and revert to the last valid quantity (24); OR
- Auto-correct to the minimum valid quantity (24, MOQ); OR
- Show a validation message and not commit.

The cart badge should reflect the actual server-side cart count (1), not the rejected display value (-1).

## Actual
- Input field visibly displays `-1` after Tab/blur AND after page refresh (persisted DOM state).
- Cart badge in the header shows `-1`.
- Order Summary shows: Subtotal $1,234.00 (= 1 × $1,234 list price), Discount -$184.00, Tax +$210.00, Total $1,260.00 — math consistent with server-side qty=1.
- Pack-size validation message appears below the line item: "Order in packs of 12" (correct guard, but the `-1` display never auto-corrects).
- One GraphQL POST returned HTTP 400 in the network log around the time the negative value was submitted (likely the validation rejection on the server side).

## Evidence
- Screenshot: `reports/regression/REG-2026-05-04-1527/CART-036-negative-qty-display-bug.png`
- Console errors: 1 × `[ERROR] Failed to load resource: the server responded with a status of 400 () @ /graphql`

## Impact
- Customer-facing UI desync: header badge and qty input visibly disagree with the priced cart contents.
- "PLACE ORDER" button surfaces "Something went wrong. Please try again later." which obscures the actual cause and may abandon the buyer.
- Recovery: a single click on `+` snaps the qty back up to MOQ (24), but a B2B buyer is unlikely to discover that without help.

## Suggested Fix
Add client-side input sanitization in the cart-line spinbutton change handler:
- Reject any value `< minOrderQty` (treat negatives identically to zero — bump up to MOQ instead of submitting).
- Bind input `min` attribute to `minOrderQty` (already set to "24" in the DOM but not enforced on commit).
- Or, reconcile the input with the server response after the API replies — if the server clamps to 1/24, the UI should mirror that.

## Cross-References
- Project memory `feedback_qty_stepper_as_add_to_cart.md` confirms the stepper IS the add-to-cart entry on B2B-store; this makes any qty-input desync a checkout-blocking issue.
- Similar pack-size enforcement validated on `+`/`-` clicks (CART-006/007) — only direct-input path is missing the validation.
