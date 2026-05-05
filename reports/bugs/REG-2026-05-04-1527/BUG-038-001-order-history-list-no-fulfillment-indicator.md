# BUG-038-001 — Order history list view lacks Pickup/Shipping fulfillment indicator

**Severity:** Low (UX gap, not functional defect)
**Suite:** 038 — BOPIS Checkout
**Test case:** BOPIS-088
**Run:** REG-2026-05-04-1527
**Browser:** playwright-chrome (Chromium 148)
**Environment:** https://vcst-qa-storefront.govirto.com (Storefront v2.48.0)
**Confirmed:** false (preliminary — qa-testing-expert investigation pending)

## Business invariant
- BL-BOPIS-006 — BOPIS orders must show pickup-fulfillment data, not shipping data
- ECL-14.1 — Order-history rendering for pickup orders

## Failed assertion
`[DOM] order list entry shows pickup indicator (label, icon, or 'Pickup' tag)` — BOPIS-088 row 1 of expected DOM assertions.

## Steps to reproduce
1. Sign in as a user with at least one BOPIS-completed order (e.g., `mutykovaelena@gmail.com` / Bence and Family org has BOPIS order CO260505-00032).
2. Navigate to `/account/orders`.
3. Inspect each row in the orders list.

## Expected
Each row visually distinguishes Pickup orders from Shipping orders — typically:
- a `Pickup` / `Store Pickup` text label/tag, or
- a small icon (truck, store-front), or
- a separate "Fulfillment" column.

## Actual
Order list rows show only:
- Order number (e.g., CO260505-00032)
- Purchase order (PI260505-00032)
- Date (5/5/2026)
- Status (Payment required / Processing / New)
- Total ($)

No visual or textual differentiation between Pickup and Shipping orders. Pickup vs Shipping is only revealed on the order-detail page (where `SHIPPING METHOD: Pickup in store ($0.00)` and `PICK-UP ADDRESS` are properly displayed — see screenshot `reports/regression/REG-2026-05-04-1527/038-evidence/BOPIS-088-order-detail-pickup.png`).

## Evidence
- Screenshot of order-detail page with correct BOPIS rendering: `reports/regression/REG-2026-05-04-1527/038-evidence/BOPIS-088-order-detail-pickup.png`
- Order-list view text capture (no Pickup indicator):
  ```
  CO260505-00032  PI260505-00032  5/5/2026  Payment required  $239.98
  CO260505-00031  PI260505-00031  5/5/2026  Payment required  $1,103.98
  ...
  ```

## Cross-layer checks
- CONSOLE: 1 unrelated 404 image error (`blue_flannel__sm.jpg`) — not blocking
- NETWORK: order-list xAPI returns 2xx; fulfillment data IS present in response (proven by detail-page rendering it correctly) — gap is purely in the storefront list-view template
- API: order query returns `fulfillmentType=Pickup` correctly; storefront list view simply doesn't surface it

## Notes
- Detail-page rendering of all other BOPIS-088 assertions passes (pickup name + address, no shipping section, no carrier/tracking).
- Suite primary intent — "correct rendering of fulfillment data on BOPIS orders" — is met at the detail level.
- Recommendation: add a `Fulfillment` column to the order-list table, or a small icon next to the order number. Low-effort UX-enhancement.
- This may already be tracked as a feature request — investigator should search VCST JIRA for "order list pickup indicator" / "BOPIS order history" before filing.
