# BUG: Product page shows "Price: €0.00" instead of "not available" for a product with no price in the selected currency

## Status: READY_TO_SUBMIT
**Found by:** agent — regression REG-2026-10-28-1013
**Jira:** VCST-6605 (Relates VCST-6417)
**Severity:** Medium · **Case:** CAT-054 (suite 002) · **Regression task:** VCST-6417

## Env
- vcst (QA storefront), store B2B-store, Firefox, signed-in personal account
- Platform 3.1090.0, Theme vc-theme-b2b-vue-2.61.0-alpha.2605 (vc-deploy-dev vcst-qa, matches the package)
- Repro rate 2/2 + the regression run; trace 00-f27333c1ea0b440f92f4e98d10f1b360-b323d368d76247cb-01 (GetProduct EUR)

## Summary
A product priced only in USD, viewed in EUR, shows "Price: €0.00" with a disabled quantity stepper and still shows "In stock". Nothing tells the buyer the product cannot be bought in this currency. xAPI returns `isAvailable=false`, `isBuyable=false` correctly; the storefront renders the zero amount.

## Steps to reproduce
1. Sign in; currency USD. Open /alcoholic-drinks/efes-beer/birra-moretti-24x33cl-can — Price $233.00 / $124.00, stepper enabled.
2. Header **Currency** -> **EUR**.
3. Look at **Price and delivery**.

## Actual
- **Price: €0.00**; Decrease / Increase / quantity input disabled; in-stock badge 1347 still shown.
- No message that the product is unavailable in EUR. "Customers bought together" cards also show €0.00.

![PDP in EUR](../../../screenshots/PDP-Zero-Price-Unavailable-Currency/01-pdp-eur-zero-price.png)

## Expected
- No zero placeholder price; the product is shown as not available in the selected currency (BL-PRICE-005: each currency has its own price list; a product without a price list entry for the currency shows as unavailable).
- Consistent with the cart, which on theme 3.1.0 already shows "The product is no longer available for purchase" for the same lines (KB-7BC6FC36).

## Layer Validation
| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | FAIL | package screenshots/01-pdp-eur-zero-price.png, dom-pdp-eur.yml |
| 2. Backend Admin | N/A — not probed by the investigation | |
| 3. GraphQL xAPI | PASS | package network/failing-GetProduct-EUR.response.json: price.actual.amount 0, availabilityData.isAvailable false, isBuyable false |
| 4. Platform REST API | N/A — not probed by the investigation | |

**Owning layer:** Layer 1 — Storefront

## Root Cause Analysis
`reports/regression/REG-2026-10-28-1013/evidence/CAT-054/root-cause.md` — the PDP price block prints `price.actual.formattedAmount` without checking `isAvailable` / `isBuyable`. By-design and data-drift alternatives ruled out there.

## Fix Routing (→ /qa-fix)
- **Owning layer:** Layer 1 — Storefront
- **Suggested repo:** VirtoCommerce/vc-frontend
- **repoKind:** frontend
- **Ownership hint:** platform
- **Component / module:** vc-frontend PDP "Price and delivery" (product price display)
- **RCA anchor:** not pinned — PDP price block renders `price.actual.formattedAmount` when `availabilityData.isAvailable=false`
- **Routing confidence:** MEDIUM
