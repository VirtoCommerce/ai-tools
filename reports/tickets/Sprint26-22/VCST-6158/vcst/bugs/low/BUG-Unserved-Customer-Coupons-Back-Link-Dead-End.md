# Sales Rep coupons page for an unserved customer: "Back to customer" leads to another not-found page

## Status: CONFIRMED
**Found by:** agent — testing VCST-6158
**Severity:** Low (below the filing floor — not filed; named in the VCST-6158 run comment)

**Environment:** vcst · SalesRep 3.1017.0-pr-30-1e10 · theme 2.62.0-pr-2596-e749-e749b47f · platform 3.1093.0-pr-3154-4607

**Steps:** As a sales rep, open /company/my-customers/<unserved org id>/coupons; click "Back to customer".

**Actual:** Lands on the unserved org profile, which again says "Customer not found or not in your customers." — the rep must click a second link.

**Expected:** Leads back to My customers, as the customer Activity page does in the same state.

**Evidence:** screenshots/4a-fe-C27-unserved-coupons-not-found.png

## Fix Routing (→ /qa-fix)
- **Owning layer:** Storefront (sales-rep plugin, customer-coupons.vue)
- **Suggested repo:** VirtoCommerce/vc-module-sales-rep
- **Routing confidence:** MEDIUM
