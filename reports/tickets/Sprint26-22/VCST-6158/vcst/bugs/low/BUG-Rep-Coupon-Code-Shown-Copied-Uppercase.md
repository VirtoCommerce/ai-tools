# Lowercase coupon code is shown and copied in uppercase on the Sales Rep coupons page

## Status: CONFIRMED
**Found by:** agent — testing VCST-6158
**Severity:** Low (below the filing floor — not filed; named in the VCST-6158 run comment)

**Environment:** vcst · SalesRep 3.1017.0-pr-30-1e10 · theme 2.62.0-pr-2596-e749-e749b47f · platform 3.1093.0-pr-3154-4607

**Steps:** Open the coupons page; find a lowercase-stored code (e.g. a seeded lowercase AGENT-TEST coupon); click to copy; paste.

**Actual:** Card shows and clipboard holds the uppercased code. Harmless while no uppercase twin exists (matching is case-insensitive).

**Expected:** Code shown and copied as stored (VC-PROMO-003 / ECL-1.3, kb KB-F0C5CA5E) — known on the buyer page, now inherited by the rep surface.

**Evidence:** screenshots/4a-fe-C31-lowercase-code-uppercased.png

## Fix Routing (→ /qa-fix)
- **Owning layer:** Storefront (host CouponItem CSS uppercase)
- **Suggested repo:** VirtoCommerce/vc-frontend
- **Routing confidence:** MEDIUM
