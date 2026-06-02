# BUG-037-001 — cartPickupLocations request omits IncludeLocationIds parameter on cart-page modal reopen

> **DUPLICATE OF BUG-036-001** (Critical — same root cause, same `IncludeLocationIds` missing from request body). Filed against suite 037 BOPIS-080 to provide independent corroboration on Edge browser. Both bugs should track to the same fix.

| Field | Value |
|-------|-------|
| Run | REG-2026-05-04-1527 |
| Suite | 037 — BOPIS Cart |
| Test Case | BOPIS-080 — VCST-4707 Regression — Cart-Context Confirmed Location Beyond Page 1 Pre-selected on Modal Reopen |
| Severity | Medium (downgraded from Critical because BUG-036-001 already filed at Critical for the same root cause) |
| Priority | P2 |
| Confirmed | NO — preliminary finding, qa-testing-expert investigation requested |
| Duplicate-Of | BUG-036-001 (REG-2026-05-04-1527 / Suite 036 BOPIS-091 — Firefox) |
| Browser | Edge (playwright-edge) |
| Environment | https://vcst-qa-storefront.govirto.com |
| Business Rule | BL-BOPIS-008 |
| Edge Case Ref | ECL-14.2 |
| Related Tickets | VCST-4707, PR vc-module-x-pickup#8 |
| Reporter | qa-frontend-expert (suite 037 runner) |
| Reported | 2026-05-04 18:15 UTC |

## Summary

Per VCST-4707 / BL-BOPIS-008 / PR vc-module-x-pickup#8, when the user reopens the cart-page Pick Points modal with a previously confirmed pickup location, the storefront should send `IncludeLocationIds=[<confirmedLocationId>]` to the `cartPickupLocations` GraphQL query so the server returns that location at `items[0]` (pinned at top of list, visible without scrolling, regardless of which page the user originally found it on).

Observed: the reopen request body contains only `{ storeId, cultureName, facet, cartId, first=50 }` — no `IncludeLocationIds` variable. Server returns the default-sorted list with the confirmed location at its natural position (items[1] in this run). The radio button is still client-side-checked next to the confirmed location, so visual pre-selection is intact, but the server-side prepending mechanism is not engaged.

## Steps to Reproduce

1. Sign in as B2B user (slot 3: `test-carlos.rodriguez-20260310@test-agent.com` / `TestPass123!` against `BuildRight` org).
2. Navigate to PDP `/alcoholic-drinks/efes-beer/erdinger-alkoholfrei-german-alcohol-free-wheat-beer-12x500ml-cans` and click Increase quantity (+) once. Beer becomes BOPIS-eligible cart item with qty=24 (packSize=12, minQty=24).
3. Navigate to `/cart`. Cart shows the Erdinger line at $25,200 subtotal.
4. Click the "Pickup" delivery option button.
5. Click the pencil/edit button next to the auto-suggested Pickup point — modal opens.
6. Click on a location row (e.g. "Brooklyn Academy of Music") — info card opens with "Pick up here" button.
7. Click "Pick up here" — modal closes, "30 Lafayette Ave, New York, New York, 10061..." appears as confirmed Pickup point in cart.
8. Open browser DevTools → Network → filter `graphql`.
9. Click the pencil/edit button next to the confirmed Pickup point — modal reopens.
10. Inspect the most recent `POST /graphql` request whose body contains `"operationName":"GetCartPickupLocations"`.

## Expected

```json
{
  "operationName": "GetCartPickupLocations",
  "variables": {
    "storeId": "B2B-store",
    "cultureName": "en-US",
    "cartId": "<cart-id>",
    "first": 50,
    "includeLocationIds": ["2108d7c9-6aad-46a7-b4c5-a46593cb0ac8"],   // <-- present
    "facet": "address_countryname address_regionname address_city"
  }
}
```

Response: `items[0].id === "2108d7c9-6aad-46a7-b4c5-a46593cb0ac8"` (Brooklyn Academy of Music — the previously confirmed pickup location pinned at top).

## Actual

```json
{
  "operationName": "GetCartPickupLocations",
  "variables": {
    "storeId": "B2B-store",
    "cultureName": "en-US",
    "facet": "address_countryname address_regionname address_city",
    "cartId": "3149c4ac-4b81-4e6c-843d-31697917da7a",
    "first": 50
  }
}
```

Response: `items[0].id === "362a17d3-4896-4dac-894f-652f5b1411c4"` (Berjaya Megamall Kuantan, Malaysia — first item in default sort).
Confirmed location "Brooklyn Academy of Music" appears at `items[1]` (radio is still checked client-side).

## Cross-Layer Evidence

- **Network**: GraphQL request idx 1134 in HAR (`reports/regression/REG-2026-05-04-1527/037-evidence/`). Request body, response body captured.
- **API contract**: `validationErrors: []` in earlier `addOrUpdateCartShipment` mutation response — no server-side error.
- **DOM**: Brooklyn Academy of Music radio button is `checked=true` on reopen.
- **Console**: No JS errors, no Vue hydration warnings during interaction.

## Why "PRELIMINARY"

The test scenario (BOPIS-080) explicitly directs to "select a location from the second-page batch (any location that was NOT visible in the initial load)". In this run the modal first batch already contained Brooklyn Academy of Music (it's in the alphabetical first 13 "Today" locations), so the location selected was a page-1 location. The strict failure mode (page-2 location reverting to non-visible position on reopen) was not directly reproduced, but the underlying request-shape regression (no `IncludeLocationIds` parameter sent) IS present and would cause the user-visible regression for any beyond-page-1 selection.

The visual pre-selection (radio checked) is still working — the cart context retains the confirmed location ID on the client. But the server-side prepend behavior described in PR vc-module-x-pickup#8 / BL-BOPIS-008 appears to NOT be invoked from the cart-page modal-reopen path.

## Suggested Next Steps

1. `qa-testing-expert` reproduce with a beyond-page-1 location (paginate past 50, select ~position 60+, confirm, then reopen).
2. Verify with `git log` / artifact version whether PR vc-module-x-pickup#8 is fully deployed to QA build at the time of run.
3. Compare request shape to the product-page (PDP) Pick Points modal — does that one send `IncludeLocationIds`? (BOPIS-080 is specifically about cart-page entry; the fix may have only landed for PDP.)
4. Check vc-frontend `useCartPickupLocations` / `usePickupLocations` composable to see if the cart variant passes `includeLocationIds` to the query when called from cart context.

## Related

- Test case: BOPIS-080 (Critical, "Reviewed" automation status)
- Suite 042 (Smoke) PASSED BOPIS pickup option mix in this run scope — does not contradict this finding because suite 042 does not exercise modal reopen with confirmed-location persistence.
- Suite 028 (Cart Core) PASSED at 84.2% executable — non-overlapping scope.
