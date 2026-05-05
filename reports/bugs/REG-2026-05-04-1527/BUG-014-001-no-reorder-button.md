# BUG-014-001 (Preliminary)

**Title:** Reorder action button absent on /account/orders detail pages — BL-ORD-002 not satisfied on storefront

| Field | Value |
|-------|-------|
| Severity | High |
| Confirmed | false (preliminary) |
| Suite | 014 - Orders Frontend |
| Test case | CHK-039 |
| Business rule | BL-ORD-002 |
| Edge case | n/a |
| Environment | https://vcst-qa-storefront.govirto.com |
| Browser | playwright-chrome (Chromium) |
| User | qa-agent-slot1@virtocommerce.com (slot 1) |
| Run ID | REG-2026-05-04-1527 |
| Frontend version | 2.48.0-pr-2274-0307-0307f38b |
| Date | 2026-05-05 |

## Steps to reproduce
1. Sign in as `qa-agent-slot1@virtocommerce.com`.
2. Navigate to `/account/orders`.
3. Click any order to open detail page (verified with CO260505-00018 Processing, CO260420-00001 Payment required, CO260414-00007 Processing).
4. Inspect detail page action area (header + sidebar) for `Reorder` / `Buy again` / `Add all to cart` button.

## Expected
A `Reorder` button is present on order detail page allowing the buyer to add all original line items back to their cart at current prices, satisfying BL-ORD-002.

## Actual
Detail page exposes only `Print order` (header) and `Pay now` (sidebar, only on Payment-required orders). No reorder action exists on any of the 3 sampled order detail pages spanning 3 payment processors (Authorize.Net, CyberSource, Datatrans) and 2 statuses.

## Failed assertion
`[DOM] Reorder button visible on order detail page`

## Cascade impact
Blocks 11 reorder-related cases in this suite: CHK-039, CHK-040, CHK-041, CHK-042, ORD-001, ORD-002, ORD-003, ORD-007, ORD-008, ORD-034, ORD-035, ORD-036.

## Console / Network
- Console errors: none
- Network: GET /xapi GraphQL succeeded for orders queries; no failed requests

## Notes for triage
This may be intentional storefront behavior gated by a configuration flag (e.g. `cfg.orders_reorder_enabled` or theme decision in the B2B-store). Confirm with PM/design:
- If intentional → annotate the 11 reorder cases with `[COND: reorder enabled]` so they SKIP cleanly instead of FAIL/BLOCK.
- If unintentional regression → file proper VCST ticket with vc-frontend repo reference.

Recommend cross-checking against vc-frontend storefront source for `reorder` button component visibility logic.
