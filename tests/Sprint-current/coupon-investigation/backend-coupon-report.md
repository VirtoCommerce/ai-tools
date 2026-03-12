# Coupon Investigation Report — Backend API

**Date:** 2026-03-11 | **Environment:** QA (`https://vcst-qa.govirto.com`) | **Platform:** 3.1007.0 | **Severity:** P0

## Environment Context (Critical)

Both Marketing modules are running **pre-release PR builds**:
- `VirtoCommerce.Marketing 3.1001.0-pr-258-b4b2`
- `VirtoCommerce.MarketingExperienceApi 3.1000.0-pr-14-8f1c`

This is very likely contributing to the instabilities.

## Bug Reproduction Results

### BUG 1 (P0): validateCoupon KeyNotFoundException — PARTIALLY REPRODUCED

- The `validateCoupon` mutation **does not exist** in the GraphQL schema — actual mutations are `addCoupon` and `removeCoupon`
- Both promotion IDs from App Insights (`b05d564a...` and `d763872c...`) return **404 — confirmed deleted**
- Direct reproduction attempt (create promo → add coupon → delete promo → refresh cart) returned 200 OK without crashing
- The bug is a **race condition** — occurs when the promotion was actively applied/matched, then deleted during the mapping phase
- Root cause: Unguarded dictionary access (`dict[key]` instead of `TryGetValue`) in `CartMappingProfile.cs:211`, likely introduced in Marketing PR #258

### BUG 4 (P2 → P1): REST API AddCoupons — REPRODUCED

- `POST /api/marketing/promotions/coupons/add` expects an **array of Coupon objects** per Swagger schema
- Sending a single object or wrapped object returns **500** with `"Value cannot be null. (Parameter 'source')"` — should be 400 Bad Request
- Sending an array with a **deleted promotion ID returns 204** — silently creates orphaned coupon records (data integrity violation)
- Elevated to **P1** due to the data integrity issue

### BUG 5 (P2): Promotion 404 but still referenced — REPRODUCED

- Both promotions confirmed deleted (404, empty body)
- A similar promotion exists (`d763872c-d5ed-4bc4-99de-271324ef74ed` "QA Test - VCST-4590 Coupon Public"), suggesting the deleted one was previous test data
- Promotion deletion cascade is **incomplete** — no cleanup of associated coupons or cart references

## Recommendations

1. **P0:** Fix `CartMappingProfile.cs:211` — replace `dict[promotionId]` with `TryGetValue` to handle deleted promotions gracefully
2. **P1:** Add input validation to AddCoupons endpoint — return 400 for bad payloads, validate promotion existence
3. **P2:** Implement promotion deletion cascade for coupons and cart references
4. **Environment:** Consider reverting Marketing modules from PR builds (`pr-258-b4b2`, `pr-14-8f1c`) to stable releases
