# Available coupons widget: the loading placeholder is 44 px taller than the loaded list

## Status: CONFIRMED
**Found by:** agent — testing VCST-6158
**Severity:** Low (below the filing floor — not filed; named in the VCST-6158 run comment)

**Environment:** vcst · SalesRep 3.1017.0-pr-30-1e10 · theme 2.62.0-pr-2596-e749-e749b47f · platform 3.1093.0-pr-3154-4607

**Steps:** Open a served customer profile as a sales rep; watch the widget load.

**Actual:** Skeleton 1297 px tall vs loaded 1253 px; the content below (Edit layout, footer) moves when coupons load. Skeleton cards fixed 232 px vs real 216–234 px.

**Expected:** No layout shift on swap (BL-UI-003).

**Evidence:** screenshots/4v-*.png (design-report.md V-1)

## Fix Routing (→ /qa-fix)
- **Owning layer:** Storefront (host CouponItemSkeleton compact)
- **Suggested repo:** VirtoCommerce/vc-frontend
- **Routing confidence:** MEDIUM
