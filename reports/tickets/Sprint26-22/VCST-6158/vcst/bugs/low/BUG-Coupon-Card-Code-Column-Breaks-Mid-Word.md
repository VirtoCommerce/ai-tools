# Regular coupon card: code column 99–135 px at 1024–1280 px viewports, ordinary codes break mid-word

## Status: SUSPECTED — likely pre-existing, needs a before-image (design-report.md V-4)
**Found by:** agent — testing VCST-6158
**Severity:** Low (below the filing floor — not filed; named in the VCST-6158 run comment)

**Environment:** vcst · SalesRep 3.1017.0-pr-30-1e10 · theme 2.62.0-pr-2596-e749-e749b47f · platform 3.1093.0-pr-3154-4607

**Steps:** Open the coupons page (rep) or /account/coupons (buyer) at 1024 px.

**Actual:** 15–19 character codes break mid-word (e.g. AGENTTE/STSRCAP/1). Column width not changed by #2596 — likely pre-existing; needs a before-image.

**Expected:** Codes of ordinary length fit on one line, or break at a sensible point.

**Evidence:** design-report.md V-4; screenshots/4v-*.png

## Fix Routing (→ /qa-fix)
- **Owning layer:** Storefront (host CouponItem regular layout)
- **Suggested repo:** VirtoCommerce/vc-frontend
- **Routing confidence:** MEDIUM
