# xAPI CustomerOrderType.coupons always fails to resolve (INVALID_OPERATION)

## Status: CONFIRMED
**Found by:** agent — testing VCST-6158
**Severity:** Low (below the filing floor — not filed; named in the VCST-6158 run comment)

**Environment:** vcst · SalesRep 3.1017.0-pr-30-1e10 · theme 2.62.0-pr-2596-e749-e749b47f · platform 3.1093.0-pr-3154-4607

**Steps:** Place an order through xAPI; select coupons on createOrderFromCart and on order(id).

**Actual:** errors[] INVALID_OPERATION "Error trying to resolve field coupons", with or without a coupon on the order. The storefront order page does not request the field.

**Expected:** The field resolves to the coupons used on the order.

**Evidence:** kb KB-B1B290C4; exploratory/SBTM-VCST-6158-2026-11-03.md

## Fix Routing (→ /qa-fix)
- **Owning layer:** xAPI (order)
- **Suggested repo:** VirtoCommerce/vc-module-x-order
- **Routing confidence:** MEDIUM
