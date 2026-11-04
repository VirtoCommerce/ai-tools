# BUG: [Promotion coupons] Buyer's coupons page lists coupons that checkout rejects `[Medium]`

## Status: READY_TO_SUBMIT
**Found by:** agent — testing VCST-6158
**Tracker:** [VCST-6675](https://virtocommerce.atlassian.net/browse/VCST-6675) — standalone, Relates VCST-6158 and VCST-5022 (out of scope, pre-existing)
**Severity:** Medium (graded at /qa-test 5-triage)

Env: vcst-qa @ Platform 3.1093.0-pr-3154-4607, VirtoCommerce.MarketingExperienceApi 3.1004.0, Marketing 3.1010.0, theme 2.62.0-pr-2596-e749-e749b47f; store B2B-store.

## Summary
xAPI `promotionCoupons` (and `/account/coupons`) filters only at promotion level, so it lists a coupon expired at
coupon level, a coupon at its usage cap and a coupon bound to another member — all rejected by the cart with
"This code is not valid". Buyer list 27 vs 24 redeemable. The new `salesRepCoupons` already excludes all three.

## Steps to reproduce
1. Admin: a public, active promotion in the store with coupons shaped (a) coupon expiration in the past, promotion still running; (b) max uses 1, used once; (c) bound to organization A. (On vcst: `@td(SRCPN_COUPON_EXPIRED | SRCPN_CAP_USED_UP | SRCPN_MEMBER_BOUND)` — AGENT-TEST fixtures, torn down later.)
2. Sign in as a B2B buyer of an organization other than A → **Account → Coupons & promotions**.
3. Find the three codes; copy one; apply it in the cart.

## Expected vs Actual
- **Expected** (suite 077 CPN-014 "only valid coupons are displayed"; the same rule as vc-module-sales-rep#30): non-redeemable coupons are not listed; "Expires" = when the code stops working.
- **Actual:** AGENTTESTSREXPIRED (coupon expired `2026-11-02T23:59:59Z`, promotion to `2026-12-03`) listed with "Expires Dec 4, 2026"; AGENTTESTSRCAP1 and AGENTTESTSRMEMBER listed; cart: "This code is not valid" for each.

![Expired coupon listed](../screenshots/Buyer-Coupons-Page-Lists-Unredeemable-Coupons/CPN-014-FAIL-expired-coupon-listed.png)

## Layer Validation
| Layer | Result | Evidence |
|---|---|---|
| 1. Storefront | FAIL (inherits L3) | CPN-014 screenshot + `reports/regression/REG-2026-11-03-1732/traces/CPN-014-FAIL-trace.json` |
| 2. Admin | PASS — coupon expiry/uses/member stored correctly | fixture read-back |
| 3. xAPI `promotionCoupons` | FAIL — returns the three | SBTM net-new #4, kb KB-F490DA8B |
| 4. REST | PASS | as L2 |

**Owning layer:** L3 xAPI.

## Root Cause Analysis
`src/VirtoCommerce.MarketingExperienceApi.Data/Queries/PromotionCouponsQueryHandler.cs` lines 26–39 (tag 3.1004.0):
`GetPromotionSearchCriteria` sets only `OnlyActive`, `IsPublic`, `Store`, `CouponCount = 1`; no coupon-level check.

**Need hotfixes:** not set — MarketingExperienceApi is in neither stable bundle v15 nor v16.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 3 — xAPI
- **Suggested repo:** VirtoCommerce/vc-module-marketing-experience-api
- **repoKind:** module
- **Ownership hint:** platform
- **Component / module:** `promotionCoupons` query handler (MarketingExperienceApi)
- **RCA anchor:** `PromotionCouponsQueryHandler.GetPromotionSearchCriteria` (PromotionCouponsQueryHandler.cs:26-39)
- **Routing confidence:** HIGH — filtering only, no contract change. Labels `vc-fix` + `qa-autofix` applied.
