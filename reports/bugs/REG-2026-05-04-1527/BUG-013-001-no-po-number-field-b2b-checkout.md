# BUG-013-001 — PO Number field missing from B2B checkout for org user

| Field | Value |
|-------|-------|
| **ID** | BUG-013-001 |
| **Title** | PO Number field missing from B2B checkout for org user |
| **Severity** | High |
| **Priority** | High |
| **Status** | Open |
| **Run ID** | REG-2026-05-04-1527 |
| **Suite** | 013 — Checkout B2B |
| **Test Case** | CHK-031 — B2B Checkout - PO Number Entry |
| **Browser** | Microsoft Edge (playwright-edge) |
| **Environment** | https://vcst-qa-storefront.govirto.com |
| **Storefront Build** | 2.48.0-pr-2274-0307-0307f38b |
| **Reported By** | qa-frontend-expert (regression run) |
| **Date** | 2026-05-05 |

## Summary

The Purchase Order (PO) Number input field is **not present** anywhere in the B2B checkout flow on `/cart` for an authenticated organization user. Per business rule **BL-CHK-004** and the test specification (CHK-031, CHK-038, CHK-069, CHK-070), B2B org users must be able to enter a PO Number during checkout, with the value persisted on the resulting order. Without this field, B2B buyers cannot supply purchase order references at order creation, blocking a core procurement workflow.

## Business Rule Reference

- **BL-CHK-004** — B2B checkout must expose org-specific fields including PO Number
- **BL-CHK-001** — Checkout must capture all required B2B order metadata
- **ECL-7.1** — B2B procurement edge cases

## Steps to Reproduce

1. Navigate to https://vcst-qa-storefront.govirto.com
2. Sign in as an organization user — Carlos Rodriguez (`test-carlos.rodriguez-20260310@test-agent.com` / `TestPass123!`), member of **BuildRight** organization (org id `fba51391`), role `Org Admin`
3. Add at least one product to cart (subtotal ~$100)
4. Navigate to `/cart`
5. On the single-page checkout, complete:
   - Shipping Address: select a clean org address (e.g. "456 Test Street, Beverly Hills")
   - Shipping Method: Fixed Rate (Ground)
6. Scroll through the entire cart/checkout column looking for a "PO Number" / "Purchase Order Number" input

## Expected Result

A "PO Number" (or "Purchase Order Number") text input is rendered for B2B org users above or near the "Order Comment" textarea, accepting alphanumeric input. The captured value persists on the resulting order detail page (`/account/orders/{orderId}`) and admin order record.

## Actual Result

- **No PO Number field is rendered** anywhere in the B2B checkout column on `/cart`.
- Only an "Order Comment" textarea is present in the metadata section.
- Cart totals: Subtotal $100.00, Discount -$0.01, Tax +$20.00, Shipping $150.00, **Total $299.99**.
- Payment dropdown lists only generic gateways (Authorize.Net, CyberSource, Datatrans, Manual, Pay with points, Skyflow) — no Net 30/On Account either, but that is tracked separately in CHK-032.

## Evidence

- Screenshot: `reports/regression/REG-2026-05-04-1527/013-evidence/CHK-031-no-po-field-on-cart.png`
- Suite results JSON: `reports/regression/REG-2026-05-04-1527/013-results.json` (CHK-031 entry)
- Console: No JS errors on `/cart` (`browser_console_messages level=error` returned empty)
- Network: No 4xx/5xx on cart fetch / cart resolver

## Cross-Layer Verification

| Layer | Observation |
|-------|-------------|
| **STOREFRONT** | PO field absent in DOM on `/cart` for org user; absent for guest as well (expected) |
| **CONSOLE** | Clean — no errors |
| **NETWORK** | `cart` GraphQL query 200 OK; cart payload does not surface a `purchaseOrderNumber` editable binding |
| **ADMIN** | N/A — could not place order with PO to verify Admin order record |

## Impact

- Blocks CHK-031, CHK-038, CHK-069, CHK-070 (4 test cases in this suite)
- Breaks B2B procurement requirement — buyers cannot supply PO at order time
- Affects all B2B org users on the storefront (verified for BuildRight; org-agnostic since it is a missing UI field, not a per-org setting)

## Possible Root Cause / Investigation Notes

- This may be a **theme / template regression** — vc-frontend version `2.48.0-pr-2274-0307-0307f38b` is from PR #2274. Suspect that the PO Number input was removed or hidden behind a flag during recent checkout refactors.
- Alternative: PO field is gated by a `$cfg.*` flag (e.g. `b2b_purchase_order_enabled`) that is not enabled on the QA store. Verify in storefront `settings_data.json` and Admin > Stores > Settings.
- Check vc-frontend `client-app/pages/cart-page.vue` (or B2B checkout component) for any conditional `v-if` on PO field referencing org/role context or a feature flag.

## Suggested Fix Owner

vc-frontend team — checkout/cart B2B UI

## Related

- CHK-031 (FAIL) — this bug
- CHK-038 (BLOCKED-by-bug) — PO validation cannot be tested
- CHK-069 (BLOCKED-by-bug) — PO visibility/save cannot be tested
- CHK-070 (BLOCKED-by-bug) — PO optional behavior cannot be tested
