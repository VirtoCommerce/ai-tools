# BUG: GetCartPickupLocations fails with duplicate key error when cart contains configurable products with different options

## Summary

The `GetCartPickupLocations` GraphQL query throws a `System.ArgumentException: An item with the same key has already been added` when the cart contains two or more configurable product line items that share the same base `ProductId` but have different configuration options (e.g., different selected components). This prevents users from selecting or changing pickup locations.

## Severity: High

## Priority: P1

## Component

`VirtoCommerce.XPickup` module - `SearchCartPickupLocationsQueryHandler.cs`

## Environment

| Field | Value |
|-------|-------|
| **Environment** | QA |
| **Frontend URL** | https://vcst-qa-storefront.govirto.com |
| **Backend URL** | https://vcst-qa.govirto.com |
| **Store** | B2B-store |
| **Frontend Version** | 2.42.0-pr-2149-8584-85843c7b |
| **Browser** | Microsoft Edge 144.0.3719.115 (Chromium) |
| **Date** | 2026-02-11 |

## Steps to Reproduce

1. Log in to the storefront as a registered user (e.g., `mutykovaelena@gmail.com`)
2. Clear the cart completely (if items exist)
3. Navigate to a configurable product: `/products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options`
4. Select a component option (e.g., **"Rear wheel, 26", double-wall rim, motorized"**) and click the + button to add to cart with quantity 1
5. On the same product page, change the component option to a different one (e.g., **"Seat"**) and click + to add again
6. Navigate to Cart (`/cart`)
7. Verify two separate line items exist for "Bike with options" with different component configurations
8. In the Shipping Details section, select **"Pickup"** as the delivery option
9. Click the **pencil/edit icon** next to the pickup point address

## Expected Behavior

The pickup location selection modal/panel should open, listing available pickup locations for the products in the cart.

## Actual Behavior

An error toast notification appears: **"Something went wrong. Please try again later."**

The `GetCartPickupLocations` GraphQL query returns an error response:

```json
{
  "errors": [
    {
      "message": "Error trying to resolve field 'cartPickupLocations'.",
      "path": ["cartPickupLocations"],
      "extensions": {
        "code": "ARGUMENT",
        "details": "System.ArgumentException: An item with the same key has already been added. Key: 2923a1f6-7765-494a-8fe2-105bbdd623c8"
      }
    }
  ],
  "data": {
    "cartPickupLocations": null
  }
}
```

## Root Cause Analysis

**Source file:** `SearchCartPickupLocationsQueryHandler.cs` (line 36)
**Repository:** https://github.com/VirtoCommerce/vc-module-x-pickup
**File:** `src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryHandler.cs`

The problematic code in `CreateSearchCriteriaAsync()`:

```csharp
result.Products = cart.Items
    .Where(x => x.SelectedForCheckout)
    .Select(x => new ProductPickupLocationSearchCriteriaItem { ProductId = x.ProductId, Quantity = x.Quantity })
    .ToDictionary(x => x.ProductId);  // <-- FAILS HERE
```

**Why it fails:**

When a configurable product (e.g., "Bike with options") is added to the cart twice with different configuration options (different selected components), the cart contains **two separate line items** that share the **same `ProductId`** (the base configurable product ID). The `.ToDictionary(x => x.ProductId)` call requires unique keys, but both line items produce the same `ProductId` key, causing the `ArgumentException`.

The duplicate key `2923a1f6-7765-494a-8fe2-105bbdd623c8` is the base product ID for "Bike with options". Both cart line items -- one configured with "Seat" and one with "Rear wheel" -- map to this same product ID.

## GraphQL Request (captured)

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

**Variables:**
```json
{
  "storeId": "B2B-store",
  "cultureName": "en-US",
  "facet": "address_countryname address_regionname address_city",
  "cartId": "1880cd7f-5bef-46c4-b9c2-43baf9bf445d",
  "first": 50
}
```

## Full Stack Trace

```
GraphQL.Execution.UnhandledError: Error trying to resolve field 'cartPickupLocations'.
 ---> System.ArgumentException: An item with the same key has already been added. Key: 2923a1f6-7765-494a-8fe2-105bbdd623c8
   at System.Collections.Generic.Dictionary`2.TryInsert(TKey key, TValue value, InsertionBehavior behavior)
   at System.Linq.Enumerable.ToDictionary[TSource,TKey](IEnumerable`1 source, Func`2 keySelector, IEqualityComparer`1 comparer)
   at VirtoCommerce.XPickup.Data.Queries.SearchCartPickupLocationsQueryHandler.CreateSearchCriteriaAsync(SearchCartPickupLocationsQuery request) in /home/runner/work/vc-module-x-pickup/vc-module-x-pickup/src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryHandler.cs:line 36
   at VirtoCommerce.XPickup.Data.Queries.SearchCartPickupLocationsQueryHandler.Handle(SearchCartPickupLocationsQuery request, CancellationToken cancellationToken) in /home/runner/work/vc-module-x-pickup/vc-module-x-pickup/src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryHandler.cs:line 19
   at VirtoCommerce.Xapi.Core.BaseQueries.RequestBuilder`3.GetResponseAsync(IResolveFieldContext`1 context, TRequest request)
   at VirtoCommerce.Xapi.Core.BaseQueries.RequestBuilder`3.Resolve(IResolveFieldContext`1 context)
   at VirtoCommerce.XPickup.Data.Queries.SearchCartPickupLocationsQueryBuilder.<GetFieldType>b__3_0(IResolveConnectionContext`1 context) in /home/runner/work/vc-module-x-pickup/vc-module-x-pickup/src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryBuilder.cs:line 29
   at GraphQL.Execution.ExecutionStrategy.ExecuteNodeAsync(ExecutionContext context, ExecutionNode node) in /_/src/GraphQL/Execution/ExecutionStrategy.cs:line 516
   --- End of inner exception stack trace ---
```

## Suggested Fix

Replace the `.ToDictionary()` call with a `.GroupBy()` to aggregate quantities for duplicate ProductIds:

```csharp
// BEFORE (buggy):
result.Products = cart.Items
    .Where(x => x.SelectedForCheckout)
    .Select(x => new ProductPickupLocationSearchCriteriaItem { ProductId = x.ProductId, Quantity = x.Quantity })
    .ToDictionary(x => x.ProductId);

// AFTER (fixed):
result.Products = cart.Items
    .Where(x => x.SelectedForCheckout)
    .GroupBy(x => x.ProductId)
    .Select(g => new ProductPickupLocationSearchCriteriaItem
    {
        ProductId = g.Key,
        Quantity = g.Sum(x => x.Quantity)
    })
    .ToDictionary(x => x.ProductId);
```

This groups all line items by `ProductId` first, sums their quantities, and then creates the dictionary -- ensuring unique keys.

## Impact

- **HIGH**: Completely blocks pickup location selection for any customer who adds configurable products with different options to their cart
- **Affects**: BOPIS (Buy Online, Pickup In Store) flow for configurable products
- **Business impact**: Customers cannot complete checkout with Pickup delivery when they have multiple configurations of the same product
- **User experience**: Generic error message "Something went wrong" provides no actionable information

## Test Data

| Item | Value |
|------|-------|
| **Product** | Bike with options (SKU: CVQ-54616437) |
| **Product URL** | /products-with-options/configurations/build-the-bike-of-your-dreams/bike-with-options |
| **Config 1** | Component: Seat ($15.00), Total price: $365.00 |
| **Config 2** | Component: Rear wheel, 26", double-wall rim, motorized ($88.00 x2 = $176.00), Total price: $526.00 |
| **Vendor** | Decathlon |
| **Cart ID** | 1880cd7f-5bef-46c4-b9c2-43baf9bf445d |
| **Duplicate Key (ProductId)** | 2923a1f6-7765-494a-8fe2-105bbdd623c8 |
| **User** | BMW-Group / Alice May |

## Workaround

Remove one of the configurable product line items from the cart so that no two line items share the same `ProductId`. After removing one, the pickup location selection works normally. This is not acceptable for production use.

## Evidence

| File | Description |
|------|-------------|
| `screenshots/step0-cart-before-clearing.png` | Cart state before test (initial cleanup) |
| `screenshots/step1-cart-empty.png` | Empty cart after clearing |
| `screenshots/step2-first-config-added.png` | First configuration added (Rear wheel) |
| `screenshots/step3-cart-two-configs.png` | Cart with two configurations (Seat + Rear wheel) |
| `screenshots/step4-pickup-selected.png` | Pickup delivery option selected |
| `screenshots/step5-error-after-pencil-click.png` | Error toast after clicking pencil icon |
| `screenshots/graphql-GetCartPickupLocations-error.json` | Full GraphQL request/response capture |
| `screenshots/network-requests.txt` | Network traffic log |
| `screenshots/console-errors.txt` | Browser console errors |

## Labels

`bug`, `backend`, `graphql`, `xapi`, `xpickup`, `bopis`, `configurable-products`, `high-severity`

## Affects Module

`VirtoCommerce.XPickup` (vc-module-x-pickup)

## Related

- Module source: https://github.com/VirtoCommerce/vc-module-x-pickup
- File: `src/VirtoCommerce.XPickup.Data/Queries/SearchCartPickupLocationsQueryHandler.cs`
- Line: 36
