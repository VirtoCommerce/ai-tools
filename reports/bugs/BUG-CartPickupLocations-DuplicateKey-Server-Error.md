# BUG: CartPickupLocations GraphQL Query Fails with Duplicate Key Exception

## Summary

The `GetCartPickupLocations` GraphQL query fails with a server-side `System.ArgumentException: An item with the same key has already been added` when the user clicks the pencil/edit icon to change the pickup location on the cart page. The error originates in the `vc-module-x-pickup` module at `SearchCartPickupLocationsQueryHandler.CreateSearchCriteriaAsync()`. Users see a generic "Something went wrong. Please try again later." toast notification and cannot change their pickup location.

## Severity: Critical

## Priority: P0

## Environment

| Property | Value |
|----------|-------|
| **Frontend URL** | https://vcst-qa-storefront.govirto.com |
| **Backend URL** | https://vcst-qa.govirto.com |
| **Environment** | QA |
| **Frontend Version** | 2.42.0-pr-2149-8584-85843c7b |
| **Store ID** | B2B-store |
| **Browser** | Microsoft Edge 144.0.3719.115 (Chromium) |
| **OS** | Windows 11 Pro |
| **Date** | 2026-02-11 |
| **Logged-in User** | Alice May (BMW-Group organization) |

## Steps to Reproduce

1. Log in to https://vcst-qa-storefront.govirto.com as a B2B user (e.g., Alice May / BMW-Group).
2. Ensure the cart has items (the test cart had 12 items across multiple vendors).
3. Navigate to the cart page: https://vcst-qa-storefront.govirto.com/cart
4. Scroll down to the **SHIPPING DETAILS** section.
5. Observe the delivery option is set to **Pickup** with a pickup point address displayed (e.g., "253 W 125th St, New York, New York, 10059, United States of America").
6. Click the **pencil (edit) icon** next to the pickup point address to change the pickup location.

## Expected Behavior

- A pickup location selection modal should open showing a list of available pickup locations with a map.
- The user should be able to search, filter, and select a different pickup location.
- The `GetCartPickupLocations` GraphQL query should return a list of pickup locations.

## Actual Behavior

- A red error notification toast appears in the top-right corner: **"Something went wrong. Please try again later."** with a "Report a problem" button.
- The pickup location selection modal does NOT open.
- The user is unable to change their pickup location.
- The GraphQL response returns HTTP 200 but contains an error payload.

## Root Cause Analysis

### GraphQL Request

```
Operation: GetCartPickupLocations
Endpoint: POST /graphql
```

**Request Variables:**
```json
{
  "storeId": "B2B-store",
  "cultureName": "en-US",
  "facet": "address_countryname address_regionname address_city",
  "cartId": "1880cd7f-5bef-46c4-b9c2-43baf9bf445d",
  "first": 50
}
```

**GraphQL Query:**
```graphql
query GetCartPickupLocations(
  $storeId: String!
  $cultureName: String!
  $cartId: String!
  $keyword: String
  $filter: String
  $first: Int
  $after: String
  $sort: String
  $facet: String
) {
  cartPickupLocations(
    storeId: $storeId
    cultureName: $cultureName
    cartId: $cartId
    keyword: $keyword
    filter: $filter
    first: $first
    after: $after
    sort: $sort
    facet: $facet
  ) {
    totalCount
    items {
      id
      name
      description
      contactEmail
      contactPhone
      workingHours
      geoLocation
      availabilityType
      availableQuantity
      availabilityNote
      address {
        id
        line1
        line2
        city
        countryName
        countryCode
        regionId
        postalCode
        phone
      }
    }
    term_facets {
      name
      terms {
        term
        label
        count
      }
    }
  }
}
```

### GraphQL Error Response

**HTTP Status:** 200 (misleading -- contains error in body)

```json
{
  "errors": [
    {
      "message": "Error trying to resolve field 'cartPickupLocations'.",
      "locations": [{ "line": 2, "column": 3 }],
      "path": ["cartPickupLocations"],
      "extensions": {
        "code": "ARGUMENT",
        "codes": ["ARGUMENT"],
        "details": "GraphQL.Execution.UnhandledError: Error trying to resolve field 'cartPickupLocations'.\n ---> System.ArgumentException: An item with the same key has already been added. Key: 2923a1f6-7765-494a-8fe2-105bbdd623c8\n   at System.Collections.Generic.Dictionary`2.TryInsert(TKey key, TValue value, InsertionBehavior behavior)\n   at System.Linq.Enumerable.ToDictionary[TSource,TKey](IEnumerable`1 source, Func`2 keySelector, IEqualityComparer`1 comparer)\n   at VirtoCommerce.XPickup.Data.Queries.SearchCartPickupLocationsQueryHandler.CreateSearchCriteriaAsync(SearchCartPickupLocationsQuery request) in /home/runner/work/vc-module-x-pickup/vc-module-x-pickup/src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryHandler.cs:line 36\n   at VirtoCommerce.XPickup.Data.Queries.SearchCartPickupLocationsQueryHandler.Handle(SearchCartPickupLocationsQuery request, CancellationToken cancellationToken) in /home/runner/work/vc-module-x-pickup/vc-module-x-pickup/src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryHandler.cs:line 19\n   at VirtoCommerce.Xapi.Core.BaseQueries.RequestBuilder`3.GetResponseAsync(IResolveFieldContext`1 context, TRequest request)\n   at VirtoCommerce.Xapi.Core.BaseQueries.RequestBuilder`3.Resolve(IResolveFieldContext`1 context)\n   at VirtoCommerce.XPickup.Data.Queries.SearchCartPickupLocationsQueryBuilder.<GetFieldType>b__3_0(IResolveConnectionContext`1 context) in /home/runner/work/vc-module-x-pickup/vc-module-x-pickup/src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryBuilder.cs:line 29\n   at GraphQL.Execution.ExecutionStrategy.ExecuteNodeAsync(ExecutionContext context, ExecutionNode node) in /_/src/GraphQL/Execution/ExecutionStrategy.cs:line 516\n   --- End of inner exception stack trace ---"
      }
    }
  ],
  "data": {
    "cartPickupLocations": null
  }
}
```

### Stack Trace Analysis

The error occurs at:
1. **`SearchCartPickupLocationsQueryHandler.CreateSearchCriteriaAsync()`** -- line 36 in `SearchCartPickupLocationsQueryHandler.cs`
2. The method calls `Enumerable.ToDictionary()` which throws `System.ArgumentException` because a **duplicate key** is detected.
3. **Duplicate Key ID:** `2923a1f6-7765-494a-8fe2-105bbdd623c8`

**Likely Cause:** The cart contains items from multiple line items that reference the same fulfillment center or pickup location ID (`2923a1f6-7765-494a-8fe2-105bbdd623c8`). When building the search criteria, the code uses `.ToDictionary()` on a collection that contains duplicate entries, which does not allow duplicate keys. The fix should use `.GroupBy()` followed by `.ToDictionary()`, or use `.DistinctBy()` before the `.ToDictionary()` call.

### Affected Module & Source Code

| Property | Value |
|----------|-------|
| **Module** | `vc-module-x-pickup` |
| **Source File** | `src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryHandler.cs` |
| **Error Line** | Line 36 (in `CreateSearchCriteriaAsync`) |
| **Builder File** | `src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryBuilder.cs` line 29 |

## Impact

- **BOPIS flow completely blocked** -- users cannot change their pickup location from the cart page.
- Affects all carts that have items with duplicate fulfillment center IDs (common in multi-vendor or multi-line-item carts).
- **27 regression test cases** in suite `05-bopis-pickup-tests.csv` are blocked by this bug (BOPIS-001 through BOPIS-027).
- The existing pickup location address is preserved (read-only), but cannot be modified.
- Users who need a different pickup location have no workaround.

## Affected Regression Test Cases

| Test ID | Title | Status |
|---------|-------|--------|
| BOPIS-001 | Map Stability - Basic Operations | BLOCKED |
| BOPIS-002 | Desktop - Location Selection Flow | BLOCKED |
| BOPIS-003 | Mobile - List/Map Toggle | BLOCKED |
| BOPIS-004 | Search - Location Name | BLOCKED |
| BOPIS-005 | Search - Address | BLOCKED |
| BOPIS-008 | Filter - Availability | BLOCKED |
| BOPIS-014 | Pickup Location Card - Content | BLOCKED |
| BOPIS-016 | Pickup Location Card - Confirm | BLOCKED |
| BOPIS-026 | Integration - Cart to Checkout | BLOCKED |
| BOPIS-027 | Integration - Switch Delivery Methods | BLOCKED |

## Suggested Fix

In `SearchCartPickupLocationsQueryHandler.cs` at line 36, replace the `.ToDictionary()` call with one that handles duplicates:

**Before (likely current code):**
```csharp
var dictionary = items.ToDictionary(x => x.FulfillmentCenterId);
```

**After (proposed fix):**
```csharp
var dictionary = items
    .GroupBy(x => x.FulfillmentCenterId)
    .ToDictionary(g => g.Key, g => g.First());
```

Or alternatively, use `DistinctBy` before the dictionary conversion:
```csharp
var dictionary = items
    .DistinctBy(x => x.FulfillmentCenterId)
    .ToDictionary(x => x.FulfillmentCenterId);
```

## Workaround

None available. Users cannot change the pickup location when this error occurs.

## Evidence

| Artifact | Path |
|----------|------|
| Screenshot: Error toast notification | `test-results/edge/cart-pickup-edit-error.png` |
| Screenshot: Error with shipping details visible | `test-results/edge/cart-pickup-edit-error-notification.png` |
| Screenshot: Cart initial state | `test-results/edge/cart-pickup-initial-state.png` |
| Captured GraphQL request/response | `test-results/edge/graphql-GetCartPickupLocations-captured.json` |
| Network requests log | `test-results/edge/network-requests-pickup-edit.txt` |
| Console error log | `test-results/edge/console-2026-02-11T17-43-32-404Z.log` |

## Additional Observations

1. **Console errors (unrelated to this bug):** Two 404 errors for external product images were observed:
   - Apple iPhone 17 image from `store.storeimages.cdn-apple.com` -- 404
   - Honda CRF450RX image from `images.netdirector.co.uk` -- 404
   These are broken product image URLs and should be reported separately.

2. **Error notification UX:** The generic "Something went wrong" message provides no useful information to the user. The error contains a detailed stack trace in the response, but the frontend swallows it and shows a generic message. Consider improving error categorization for better user experience.

3. **HTTP 200 with error body:** The GraphQL endpoint returns HTTP 200 even when the query fails server-side. While this is standard GraphQL behavior, monitoring and alerting systems relying on HTTP status codes will miss this error entirely. Ensure server-side logging captures these GraphQL errors.

## Labels

`backend`, `graphql`, `xapi`, `bopis`, `pickup`, `module`, `server-error`, `P0`, `regression-blocker`

## Component

VirtoCommerce.XPickup (vc-module-x-pickup)

## Reproduction Confirmation -- 2026-02-11 (Second Run)

**Status: BUG CONFIRMED REPRODUCIBLE**

A second independent reproduction attempt was performed on 2026-02-11 at approximately 17:57 UTC using a clean browser session in Microsoft Edge via Playwright MCP automation. The identical error was reproduced using the exact same steps.

### Reproduction Details

| Property | Value |
|----------|-------|
| **Date** | 2026-02-11 17:57 UTC |
| **Browser** | Microsoft Edge 144.0.3719.115 (Chromium 144.0.7559.133) via Playwright MCP |
| **User** | Alice May / BMW-Group |
| **Cart ID** | `1880cd7f-5bef-46c4-b9c2-43baf9bf445d` |
| **Cart Items** | 12 items across 4 vendors (Amstel, Decathlon, Kft_Vivo_wine, N/A) |
| **Pickup Address** | 253 W 125th St, New York, New York, 10059, United States of America |
| **Duplicate Key** | `2923a1f6-7765-494a-8fe2-105bbdd623c8` |

### Reproduction Steps Followed

1. Navigated to `https://vcst-qa-storefront.govirto.com` -- user already logged in as BMW-Group / Alice May.
2. Clicked Cart icon (12 items) -- navigated to `/cart`.
3. Scrolled to SHIPPING DETAILS section -- confirmed Pickup delivery option was selected.
4. Installed GraphQL fetch interceptor to capture request/response payloads.
5. Clicked the pencil/edit icon next to the pickup point address.
6. **Result:** Error toast appeared immediately: "Something went wrong. Please try again later."

### Key Findings from Reproduction

1. **Identical error:** The exact same `System.ArgumentException` with duplicate key `2923a1f6-7765-494a-8fe2-105bbdd623c8` was returned.
2. **Same code path:** Stack trace points to the same `SearchCartPickupLocationsQueryHandler.cs:line 36`.
3. **Consistent behavior:** Error occurs 100% of the time (2/2 reproduction attempts successful).
4. **No modal opens:** The pickup location selector UI never appears -- the error prevents it entirely.
5. **HTTP 200 response:** The GraphQL endpoint returns HTTP 200 with an error body, confirming monitoring blind spot.

### Reproduction Evidence

| Artifact | Path |
|----------|------|
| Homepage (logged in state) | `reports/bugs/screenshots/GetCartPickupLocations-repro/01-homepage-logged-in.png` |
| Cart page (initial state) | `reports/bugs/screenshots/GetCartPickupLocations-repro/02-cart-page-initial.png` |
| Shipping details section (before click) | `reports/bugs/screenshots/GetCartPickupLocations-repro/05-shipping-details-visible.png` |
| Error toast after pencil click | `reports/bugs/screenshots/GetCartPickupLocations-repro/06-error-after-pencil-click.png` |
| Full page after error | `reports/bugs/screenshots/GetCartPickupLocations-repro/08-full-page-after-error.png` |
| GraphQL request/response trace | `reports/bugs/screenshots/GetCartPickupLocations-repro/graphql-trace.json` |

### GraphQL Response (Reproduced)

```json
{
  "errors": [
    {
      "message": "Error trying to resolve field 'cartPickupLocations'.",
      "path": ["cartPickupLocations"],
      "extensions": {
        "code": "ARGUMENT",
        "details": "System.ArgumentException: An item with the same key has already been added. Key: 2923a1f6-7765-494a-8fe2-105bbdd623c8\n   at System.Linq.Enumerable.ToDictionary[TSource,TKey](...)\n   at VirtoCommerce.XPickup.Data.Queries.SearchCartPickupLocationsQueryHandler.CreateSearchCriteriaAsync(...) in SearchCartPickupLocationsQueryHandler.cs:line 36"
      }
    }
  ],
  "data": {
    "cartPickupLocations": null
  }
}
```

### Conclusion

This bug is **consistently reproducible** and remains an active defect in the QA environment. The duplicate fulfillment center ID (`2923a1f6-7765-494a-8fe2-105bbdd623c8`) persists in the cart data, and the server-side `.ToDictionary()` call in `vc-module-x-pickup` fails every time the pickup location selector is triggered. This continues to be a **P0 blocker** for the entire BOPIS flow.

---

## Linked Issues

- Related regression suite: `regression/suites/Frontend/05-bopis-pickup-tests.csv`
- Related JIRA tickets: VCST-4499, VCST-3865, VCST-4447 (BOPIS feature tickets)
