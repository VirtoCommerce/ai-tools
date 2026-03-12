# VCST-4590 Backend Retry Report - Previously Blocked Test Cases

**Date:** 2026-03-11
**Tester:** qa-backend-expert (automated)
**Environment:** QA (https://vcst-qa.govirto.com)
**Platform Version:** 2.44.0-pr-2198-6327
**Browser:** Edge (playwright-edge MCP)

## Context

6 test cases were blocked during the initial backend test run due to Cloudflare Error 1016 (Origin DNS error). The initial run completed 9/15 tests, all PASS. This retry run executes the remaining 6 blocked tests.

## Test Results Summary

| ID | Test Case | Result | Evidence |
|----|-----------|--------|----------|
| CPN-027 | Private promotion (IsPublic=false) NOT returned by GraphQL storefront query | **PASS** | `screenshots/CPN-027-graphql-private-promo-not-returned.png` |
| CPN-021 | Admin set localized name renders on storefront | **PASS** | `screenshots/CPN-021-admin-localized-name-set.png`, `screenshots/CPN-021-storefront-localized-name-visible.png` |
| CPN-028 | Coupon discount applied to sale price, not list price (BL-CART-003) | **PASS** | `screenshots/CPN-028-coupon-discount-on-sale-price.png` |
| CPN-029 | Discount stacking: coupon applied after tier price (BL-PRICE-001) | **NOT TESTABLE** | No multi-tier products in QA environment |
| CPN-030 | Order total formula correct after coupon (BL-CHK-006) | **PASS** | `screenshots/CPN-030-order-total-formula-correct.png` |
| CPN-033 | E2E cross-layer: Admin create -> Storefront show -> Cart apply | **PASS** | `screenshots/CPN-033-e2e-coupon-applied-in-cart.png` |

**Result: 5 PASS, 0 FAIL, 1 NOT TESTABLE**

## Detailed Test Evidence

### CPN-027: Private Promotion Visibility (PASS)

**Objective:** Verify that a promotion with IsPublic=false does NOT appear in GraphQL storefront `promotionCoupons` query.

**Steps:**
1. Confirmed private promotion (ID: `20006a1a-26b7-4569-ac9c-6774e07be183`, IsPublic=false) exists via REST API
2. Executed GraphQL `promotionCoupons` query for storeId: "B2B-store"
3. Query returned 15 public coupons - private promotion absent

**Verification:** The private promotion's coupon code (PRIVATE4590) was not in the returned results. Only public promotions are exposed to the storefront.

### CPN-021: Localized Name Rendering (PASS)

**Objective:** Set localized display name in Admin, verify it renders on storefront.

**Steps:**
1. Set en-US localized name to "CROSS-LAYER TEST NAME 1773249062" via Admin SPA blade
2. Waited 15s for cache propagation
3. Verified via GraphQL `promotionCoupons` query - name returned correctly
4. Verified on storefront Coupons page - localized name visible on QA10OFF card
5. Reverted name to original "QA Coupon English Name" via REST API

### CPN-028: Coupon Discount on Sale Price (PASS) - BL-CART-003

**Objective:** Verify coupon percentage discount is calculated on the sale/actual price, not the list price.

**Test Data:**
- Notebook: Red panda A5 45 sheets - List: $9.00, Sale: $4.00 (qty: 1)
- Xerox 3215 Monochrome Inkjet Printer - $149.00 (qty: 2, no sale price)
- Actual item total: $4.00 + $298.00 = $302.00
- List price total: $9.00 + $298.00 = $307.00

**Verification:**
- Applied QA10OFF (10% off cart subtotal)
- Coupon discount: $30.20 = exactly 10% of $302.00 (sale prices)
- NOT $30.70 which would be 10% of $307.00 (list prices)
- Pre-existing line item discount: $5.00 (unchanged)
- Total discount: $35.20

**Conclusion:** Coupon correctly applies to sale/actual prices, confirming BL-CART-003.

### CPN-029: Tier Price + Coupon Stacking (NOT TESTABLE)

**Objective:** Verify coupon stacks correctly after tier/quantity pricing discount.

**Finding:** No products with multiple tier price levels exist in the QA environment. All 100+ products checked have only a single tier (qty>=1 at base price). This is a test environment data limitation, not a code defect.

**Recommendation:** Configure at least one product with multi-level tier pricing (e.g., qty 1-9: $10, qty 10-49: $8, qty 50+: $6) to enable this test case.

### CPN-030: Order Total Formula (PASS) - BL-CHK-006

**Objective:** Verify Total = Subtotal - Discount + Tax + Shipping after coupon application.

**Verification with QA10OFF applied:**
- Subtotal: $307.00
- Discount: -$35.20 (QA10OFF: -$30.20 + Line items: -$5.00)
- Tax: +$84.36
- Shipping: +$150.00
- Total: $506.16

**Calculation:** $307.00 - $35.20 + $84.36 + $150.00 = **$506.16** (matches displayed total)

### CPN-033: E2E Cross-Layer Test (PASS)

**Objective:** Full lifecycle: Create promotion via REST API -> Verify on storefront -> Apply coupon in cart -> Cleanup.

**Steps:**
1. **REST API Create:** Created promotion "E2E Test Promotion CPN-033" via POST `/api/marketing/promotions`
   - ID: `27258d45-da0f-4a3f-b77f-a3bab50e5411`
   - Reward: 5% off cart subtotal (RewardCartGetOfRelSubtotal, amount: 5)
   - Coupon code: E2ETEST4590 (added via `/api/marketing/promotions/coupons/add`)
   - IsPublic: true, IsActive: true, StoreIds: ["B2B-store"]

2. **GraphQL Verification:** `promotionCoupons` query returned the new promotion
   - Name: "E2E Test 5% Off CPN-033" (localized en-US)
   - Code: E2ETEST4590

3. **Cart Application:** Applied E2ETEST4590 in storefront cart
   - Discount: -$15.10 (5% of $302.00 actual prices)
   - Total recalculated correctly: $524.28

4. **Cleanup:** Removed coupon from cart, deleted promotion via DELETE API (204)

## Cleanup Summary

All test promotions successfully deleted:
- `072a799f-faf6-4cc4-802f-cf8eac7b334f` (API Test Promotion) - 204 OK
- `20006a1a-26b7-4569-ac9c-6774e07be183` (Private Promotion) - 204 OK
- `27258d45-da0f-4a3f-b77f-a3bab50e5411` (E2E Test Promotion CPN-033) - 204 OK
- `0ea2ccb5-4027-4d5b-961a-e8efb5a7baff` (CPN-026 Test Promotion) - 204 OK

Cart restored to original state (2x Xerox 3215, no coupons applied).

## Combined Results (Initial Run + Retry)

| Run | Tests | Pass | Fail | Blocked | Not Testable |
|-----|-------|------|------|---------|-------------|
| Initial | 9 | 9 | 0 | 6 | 0 |
| Retry | 6 | 5 | 0 | 0 | 1 |
| **Total** | **15** | **14** | **0** | **0** | **1** |

**Overall pass rate: 14/15 (93.3%) - 1 not testable due to missing test data**

## Sign-off

All previously blocked test cases have been executed. No defects found. One test case (CPN-029) requires multi-tier pricing test data to be configured in the QA environment.

---
*Generated by qa-backend-expert | VCST-4590 Coupons & Vouchers Page*
