# BUG-014-003 (Preliminary)

**Title:** Order detail line items missing SKU display (BL-ORD-005)

| Field | Value |
|-------|-------|
| Severity | Medium |
| Confirmed | false (preliminary) |
| Suite | 014 - Orders Frontend |
| Test case | ORD-029 |
| Business rule | BL-ORD-005 |
| Edge case | ECL-7.1 |
| Environment | https://vcst-qa-storefront.govirto.com |
| Browser | playwright-chrome (Chromium) |
| User | qa-agent-slot1@virtocommerce.com |
| Run ID | REG-2026-05-04-1527 |
| Frontend version | 2.48.0-pr-2274-0307-0307f38b |
| Date | 2026-05-05 |

## Steps to reproduce
1. Sign in as slot1.
2. Navigate to `/account/orders`.
3. Click an order with line items (e.g. CO260420-00001 — 2 configurable products).
4. Inspect line items table for SKU column or per-row SKU value.

## Expected
Each line item row displays product SKU (or product code) alongside name, image, qty, prices — per BL-ORD-005 (order detail must surface enough product identification for B2B reorder/audit/customer support).

## Actual
Line items render: product image (clickable), product name (clickable link to PDP), unit price, quantity (read-only spinbutton), line total. No SKU is rendered visually.

Verified items shown correctly:
- Image: not broken, loads from CDN
- Name: clickable, navigates to PDP
- Price math: `[MATH] line total = unit price × qty` PASS ($300 × 1 = $300, $395 × 1 = $395)
- Configurable products show "Components list" expander

What's missing:
- No SKU column header
- No per-row SKU value
- No product code rendered anywhere on the line item

## Failed assertion
`[DOM] SKU shown per line item`

## Impact
B2B users cannot quickly identify products by SKU when reviewing past orders — affects customer service calls, manual reorder workflows, and audit/reconciliation tasks. ECL-7.1 (order detail completeness) edge case.

## Console / Network
- Console errors: none
- Network: clean

## Notes for triage
May be intentional — the B2B-store theme could opt for a name-only design. Verify with design before filing as code defect:
- If intentional → downgrade ORD-029 assertion `[DOM] SKU shown per line item` to advisory or remove.
- If oversight → add SKU rendering to the line item row component in vc-frontend.

Cross-check: cart page line items DO show SKU per memory `feedback_qty_stepper_as_add_to_cart.md` (B2B-store) — inconsistency between cart and order detail rendering, suggests order-detail oversight rather than design choice.
