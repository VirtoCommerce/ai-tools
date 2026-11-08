# salesRepCoupons totalUsesCount is a cached value for uncapped coupons

## Status: CONFIRMED
**Found by:** agent — testing VCST-6158
**Severity:** Low (below the filing floor — not filed; named in the VCST-6158 run comment)

**Environment:** vcst · SalesRep 3.1017.0-pr-30-1e10 · theme 2.62.0-pr-2596-e749-e749b47f · platform 3.1093.0-pr-3154-4607

**Steps:** Query salesRepCoupons as a rep; compare totalUsesCount of an uncapped coupon with its orders.

**Actual:** Uncapped coupons report the cached count (e.g. 2 and 4 against at least 8 orders each); capped ones are recounted. The UI shows Unlimited, so only API consumers see it.

**Expected:** totalUsesCount is fresh for every coupon, or documented as cached for uncapped ones.

**Evidence:** exploratory/SBTM-VCST-6158-2026-11-03.md (bug 4)

## Fix Routing (→ /qa-fix)
- **Owning layer:** xAPI (sales-rep)
- **Suggested repo:** VirtoCommerce/vc-module-sales-rep
- **Routing confidence:** MEDIUM
