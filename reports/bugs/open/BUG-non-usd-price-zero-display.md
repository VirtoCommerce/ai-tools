# PDP shows literal `€0.00` / `£0.00` for products with no target-currency price list — P2

**Env:** vcst-qa @ Platform 3.1043.0, Theme 2.53.0-pr-2368

## Summary
When the storefront currency is switched to EUR or GBP, products that have no price list in the target currency render a literal `€0.00` / `£0.00` on the PDP with no guard or warning. The **cart is correctly guarded** (shows "The product is no longer available for purchase", disables the qty stepper and Place order) — the defect is specifically the **PDP**, which is unguarded and misleadingly presents the item as free.

## STR
1. Sign in and open any product PDP that only has a USD price list.
2. Switch storefront currency to EUR (or GBP — the store has no GBP price list at all).
3. Observe the PDP price field.

## Expected vs Actual
- **Expected:** PDP hides the price / shows "price on request" / "unavailable in this currency" — consistent with the cart guard.
- **Actual:** PDP shows `€0.00` (or `£0.00`) as a real price, with no warning. (Cart, by contrast, is correctly guarded.)

## Evidence
![PDP EUR zero price](screenshots/CART-050-pdp-eur-zero-price.png)

## Refs
BL-CART-004, BL-PRICE-005. A missing target-currency price must not fall back to a zero literal on the customer-facing price display.

## Root cause (suspected)
PDP price component renders the numeric amount unconditionally; the missing-price condition that the cart already handles is not applied at the PDP price display.

## Fix Routing
- **Repo:** vc-frontend (PDP price display / missing-price guard)
- **Kind:** frontend
