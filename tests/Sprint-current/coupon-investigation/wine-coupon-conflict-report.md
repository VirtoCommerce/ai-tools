# Wine Coupon Case-Sensitive Conflict Investigation Report

**Date:** 2026-03-11 | **Environment:** QA (`https://vcst-qa.govirto.com`) | **Platform:** 3.1007.0 | **Severity:** P0

## Executive Summary

**CONFIRMED:** Two active promotions exist in B2B-store with coupon codes that differ only by case: `"wine"` (lowercase) and `"WINE"` (uppercase). This is the root cause of the `KeyNotFoundException` in `CartMappingProfile.cs:211`.

## Promotion Details

### Promotion 1: "Wine Discount"

| Field | Value |
|-------|-------|
| ID | `b88c34f1-e1ac-4d37-8ee8-06dfbf087882` |
| Coupon Code | **`WINE`** (uppercase) |
| Coupon ID | `8860f515-4c3a-40a2-8ddb-c5293263f891` |
| Active | true |
| Store | B2B-store |
| Start/End | 2026-03-11 to 2026-12-31 |
| Description | 10% off Wine category products |
| Reward | 10% off BODEGAS CALLIA LUNARIS MALBEC 0,75L (`RewardItemGetOfRel`) |
| Total Uses | 6 |

### Promotion 2: "Wine as a gift"

| Field | Value |
|-------|-------|
| ID | `e4ccb0c0-baf5-4bab-bb9b-fd383c2b6f97` |
| Coupon Code | **`wine`** (lowercase) |
| Coupon ID | `b71f3ed0-e72c-442d-9ee6-e23206c252be` |
| Active | true |
| Store | B2B-store |
| Start/End | 2024-05-29 to never (no expiration) |
| Description | Gift: COTE SOLEIL Merlot 0.75L |
| Condition | Cart subtotal >= $1000 |
| Reward | 1x COTE SOLEIL Merlot 0.75L gift (`RewardItemGiftNumItem`) |
| Total Uses | 6 |

## Test Results

| Test | Action | HTTP | Outcome |
|------|--------|------|---------|
| 1 | `addCoupon(couponCode: "wine")` via xAPI | 200 | Added. `isAppliedSuccessfully: false` (subtotal < $1000) |
| 2 | `addCoupon(couponCode: "WINE")` via xAPI (clean cart) | 200 | Added. `isAppliedSuccessfully: false` (no wine products) |
| 3 | `addCoupon(couponCode: "wine")` when cart already has "WINE" | 200 | **Silently deduplicated** — only "WINE" remains |
| 4 | `PUT /api/carts` with `coupons: [{code:"wine"}, {code:"WINE"}]` | **500** | **`"Object reference not set to an instance of an object"`** |

## Root Cause Analysis

1. Two promotions coexist with coupon codes `"wine"` and `"WINE"` — both active, both targeting B2B-store.

2. The xAPI `addCoupon` mutation performs **case-insensitive deduplication**, preventing both codes from coexisting in a cart through normal storefront flow. This is why the bug doesn't reproduce on every interaction.

3. **Direct REST API manipulation** to force both coupons into a cart causes a **500 error** ("Object reference not set to an instance of an object"), confirming the mapping layer cannot handle the case-sensitive collision.

4. The `KeyNotFoundException` at `CartMappingProfile.cs:211` occurs when:
   - The promotion engine evaluates ALL active promotions for the store
   - Both "Wine Discount" (coupon `WINE`) and "Wine as a gift" (coupon `wine`) produce rewards
   - Rewards are mapped into a dictionary keyed by coupon code
   - If using `StringComparer.Ordinal` (default): lookup for `"wine"` fails to find `"WINE"` or vice versa
   - If using `StringComparer.OrdinalIgnoreCase`: the second `.Add()` throws duplicate key

5. The error triggers during **promotion evaluation/cart recalculation** even with a single coupon, because the engine evaluates both promotions simultaneously.

## Recommendations

### Immediate Fix (Data)
- **Rename one coupon code** to eliminate the collision (e.g., `WINE` → `WINEDISCOUNT10`)
- Or deactivate "Wine Discount" if it was test data (created 2026-03-11)

### Platform Fix (Code)
1. Add **case-insensitive uniqueness constraint** on coupon codes within the same store
2. Use **`StringComparer.OrdinalIgnoreCase`** in all dictionary constructions keyed by coupon code in `CartMappingProfile.cs`
3. Add **validation in Admin SPA** coupon creation to warn on case-insensitive collisions
