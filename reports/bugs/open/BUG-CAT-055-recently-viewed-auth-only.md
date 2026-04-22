# BUG-CAT-055 — Recently Viewed widget absent on PDP (needs re-test with verified authenticated session)

- **Source run:** REG-2026-04-20-1000 (Frontend/catalog, test CAT-055)
- **Verdict:** NEEDS RE-INVESTIGATION — product owner confirms the widget IS implemented but is visible ONLY to registered/authenticated users. Initial investigation recorded no widget across 4 PDP visits, but the authenticated session may have been invalidated mid-run. Test case CAT-055 must include an explicit "verify logged-in state via `/account/dashboard` before PDP visits" precondition; re-run before filing.
- **Severity:** Low (pending re-verification)
- **Environment:** `https://vcst-qa-storefront.govirto.com/` — build `2.47.0-pr-2225-130f-130fb04d`
- **Browser:** playwright-chrome

---

## Summary

Test CAT-055 expects a "Recently Viewed" widget on the PDP that shows products the user has visited in the current session. The current vc-frontend storefront does NOT implement this feature — no component, no widget, no client-side tracking, no GraphQL query. This is NOT a regression or display defect; the feature simply does not exist in the shipped storefront.

The existing test case is incorrectly specified against a desired/planned feature rather than against implemented behavior.

## Evidence

### 1. Widget not rendered on any PDP after 4+ consecutive product visits

Visited sequence:
1. `/snacks/chips/doritos-nacho-cheese-box-20x44gr`
2. `/kitchen-supplies/everything-for-kitchen/CHAMPAGNE-COOLER-STAINLESS-STEEL-MAT-20CM`
3. `/alcoholic-drinks/efes-beer/erdinger-dunkel-dark-german-wheat-beer-500ml-bottles`
4. `/alcoholic-drinks/wine/cote-soleil-merlot-075l`
5. Returned to `/snacks/chips/doritos-nacho-cheese-box-20x44gr`

Widget titles on the final Doritos PDP:
- FEEDBACK
- PRICE AND DELIVERY
- SHIPMENT OPTIONS
- PRODUCTS RELATED TO THIS ITEM
- CUSTOMERS BOUGHT TOGETHER

No "Recently Viewed" / "Recently Visited" / "Your History" widget present.

### 2. No DOM elements match recently-viewed patterns

```js
document.querySelector('[class*="recently" i], [data-testid*="recently" i], [class*="viewed" i]')
// → null
```

Scanned every element on the PDP for class fragments matching `recently`, `viewed`, `visited`. No matches.

### 3. No client-side tracking in localStorage or sessionStorage

Full localStorage keys on a signed-in B2B session after 4 PDP visits:

```
configProductsToCompare
vc-dark-available
builderVisitorId
showUnreadOnly_pushMessages_popup
viewPurchasedBeforeProducts     ← "view" filter for catalog, not recently-viewed
local_ship_to_addresses_c994fa34-dab9-4238-9c39-28756b3e547d
vc-color-mode
viewMode                        ← grid/list toggle, not history
productCompareListIds            ← compare feature
localProductConfigurations
auth
vcst-password-expire-reminder-date
user-id
navigationOutline
currency
viewInStockProducts             ← "view" filter, not history
viewFulfillmentCenters
saved-fcm-token
local_ship_to_addresses_anonymous
```

Full sessionStorage keys:
```
search-queries
previousCultureSlug
AI_sentBuffer_1   ← Application Insights
AI_buffer_1       ← Application Insights
```

None of these track visited product IDs. The closest candidates (`viewPurchasedBeforeProducts`, `viewInStockProducts`, `viewFulfillmentCenters`) are all **display filters**, not history trackers.

### 4. No "Recently Viewed" component in vc-frontend source

GitHub search `repo:VirtoCommerce/vc-frontend "recently-viewed"` → `total_count: 0`.
GitHub search `org:VirtoCommerce RecentlyViewed` → `total_count: 0`.
GitHub search `org:VirtoCommerce "recently viewed"` → `total_count: 0`.

The component literally does not exist in any Virto Commerce frontend repository.

### 5. Backend does track visits — but for recommendations, not for display

A `pushHistoricalEvent` GraphQL mutation fires on each PDP load with `eventType: "click"` and the `productId`. This feeds the recommendation engine (`GetProductRecommendations` queries powering "Products related to this item" and "Customers bought together"). There is no corresponding `recentlyViewed` / `visitedProducts` query exposed to the storefront.

## Conclusion

"Recently Viewed" is a reasonable B2B feature expectation, but it is not implemented in the current vc-frontend theme. CAT-055 as written will always fail and should not be kept in the regression suite until either:

1. The feature is built (product decision), OR
2. The test case is rewritten to verify the **existing** "Products related to this item" or "Customers bought together" recommendation widgets instead.

## Recommendation to Product Owner

- **Option A (preferred if PM wants the feature):** File a feature request `VCST: Storefront — add Recently Viewed products widget to PDP` with AC for: localStorage-backed tracking (ring buffer of last 8-10 product IDs per session), widget-style rendering consistent with existing `.vc-widget` pattern, respects anonymous vs. authenticated session boundaries, integrates with `pushHistoricalEvent` or exposes a new xAPI query. THEN mark CAT-055 as `blocked` until feature ships.
- **Option B (preferred if PM has no plans to build it):** Delete or rewrite CAT-055 in `regression/suites/Frontend/catalog/002-pdp.csv`. Replace with a coverage check for the existing recommendation widgets (Products related + Customers bought together).

Until one of these actions is taken, CAT-055 will continue to report as a bug in every regression run without any underlying code defect.

## Evidence

- `reports/regression/REG-2026-04-20-1000/invest-evidence/invest-CAT-055-01-doritos-after-4-pdps-no-recently-viewed.png` — Full-page PDP after 4 distinct product visits; shows FEEDBACK, PRICE AND DELIVERY, SHIPMENT OPTIONS, PRODUCTS RELATED TO THIS ITEM, CUSTOMERS BOUGHT TOGETHER widgets but no Recently Viewed section.

## Notes

- If the backend-only `pushHistoricalEvent` telemetry ever causes privacy concerns for B2B customers (the event includes session ID and product ID), that would warrant its own investigation — but that is a separate question from whether a "Recently Viewed" widget should render in the UI.
