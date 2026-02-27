# Test Cases: VCST-4618
# GetCartPickupLocations Fails with Duplicate Key Error (Configurable Products)

**Ticket:** [VCST-4618](https://virtocommerce.atlassian.net/browse/VCST-4618)
**Sprint:** Sprint 26-04
**Date:** 2026-02-26

---

## Backend Test Cases (GraphQL API Layer)
**Executor:** qa-backend-expert | **Browser/Tool:** playwright-edge | **URL:** https://vcst-qa.govirto.com/ui/graphiql

---

### TC-BE-001 — Primary Bug Fix: cartPickupLocations with Two Configurable Variants (Same ProductId)

**Priority:** Critical
**Estimate:** 10m
**Section:** Backend > cartPickupLocations > Bug Fix Verification

**Preconditions:**
- Authenticated as mutykovaelena@gmail.com or Alice May (BMW-Group)
- Cart contains exactly two line items: both configurable variants of the same base product (different options, same ProductId)
- Pickup delivery method selected in cart
- GraphQL Playground open at https://vcst-qa.govirto.com/ui/graphiql

**Steps:**
1. Log in to storefront as mutykovaelena@gmail.com
2. Clear the cart completely (remove all existing items)
3. Navigate to a configurable product (e.g., "Bike with options")
4. Add to cart with Option A (e.g., Seat component)
5. Return to the same product and add to cart with Option B (e.g., Rear wheel component)
6. Go to cart — verify two line items are visible with the same base product name
7. Select "Pickup" as the delivery method
8. Note the cartId from the page URL or network requests
9. Open GraphQL Playground and execute the following query (replace cartId value):
```graphql
query GetCartPickupLocations {
  cartPickupLocations(
    storeId: "B2B-store"
    cultureName: "en-US"
    cartId: "<CART_ID>"
    facet: "address_countryname address_regionname address_city"
    first: 50
  ) {
    totalCount
    items {
      id
      name
      availableQuantity
      address {
        city
        countryName
        regionId
      }
    }
    term_facets {
      name
      terms {
        term
        count
      }
    }
  }
}
```
10. Inspect the GraphQL response

**Expected Result:**
- Response contains `data.cartPickupLocations` with valid pickup location data
- `totalCount` is a non-negative integer
- `items` array contains pickup locations (may be empty if none available, but no error)
- `term_facets` array present with country/state/city facets
- Response contains NO `errors` array
- No `System.ArgumentException` in response
- No `ARGUMENT` error code in response extensions

**Failure Indicator:** Response contains `errors[0].extensions.code = "ARGUMENT"` or any stack trace mentioning `ToDictionary`

---

### TC-BE-002 — Verify No Error Toast Scenario: API Response Used by Frontend

**Priority:** Critical
**Estimate:** 5m
**Section:** Backend > cartPickupLocations > Bug Fix Verification

**Preconditions:**
- Same cart state as TC-BE-001 (two configurable variants, same ProductId)
- Chrome DevTools Network tab open

**Steps:**
1. With the multi-variant cart set up (from TC-BE-001 preconditions)
2. On the cart page, click the pencil/edit icon next to the pickup point address
3. Monitor Network tab for the `cartPickupLocations` GraphQL request
4. Wait for the request to complete

**Expected Result:**
- Network request to `/graphql` with `operationName: "GetCartPickupLocations"` completes with HTTP 200
- Response JSON does NOT contain `errors` key at top level
- Modal opens (does not fail — this is the frontend confirmation, captured in TC-FE-001)
- Console has no uncaught exception related to pickup locations

---

### TC-BE-003 — Regression: cartPickupLocations with Single Regular (Non-Configurable) Product

**Priority:** Critical
**Estimate:** 8m
**Section:** Backend > cartPickupLocations > Regression

**Preconditions:**
- Cart contains exactly one non-configurable product (not a configurable product)
- Pickup delivery method selected
- GraphQL Playground open

**Steps:**
1. Clear cart
2. Add one regular (non-configurable) product to cart
3. Select Pickup delivery method
4. Get cartId
5. Execute `cartPickupLocations` query with this cartId (same query as TC-BE-001)
6. Inspect response

**Expected Result:**
- Query returns `data.cartPickupLocations` without errors
- `items` array contains pickup locations relevant to the product
- `totalCount` is >= 0
- No regression introduced for the standard non-configurable product flow

---

### TC-BE-004 — Regression: cartPickupLocations with Single Configurable Product (One Variant Only)

**Priority:** High
**Estimate:** 8m
**Section:** Backend > cartPickupLocations > Regression

**Preconditions:**
- Cart contains exactly one configurable product with one option (only one line item with that ProductId)
- Pickup delivery method selected

**Steps:**
1. Clear cart
2. Add one configurable product with Option A only (do NOT add Option B)
3. Verify cart has exactly one line item
4. Select Pickup delivery method
5. Execute `cartPickupLocations` query
6. Inspect response

**Expected Result:**
- Query executes successfully without any error
- Returns pickup location data
- Single item in cart does not expose any edge case in the grouping logic
- `totalCount` and `items` are valid

---

### TC-BE-005 — Verify Quantity Aggregation: Two Variants Sum to Correct Total

**Priority:** High
**Estimate:** 10m
**Section:** Backend > cartPickupLocations > Fix Correctness

**Preconditions:**
- Cart contains: configurable product Option A (qty: 2) + configurable product Option B (qty: 3), same base ProductId
- Total quantity for that ProductId should be 5

**Steps:**
1. Clear cart
2. Add configurable product Option A, set quantity to 2
3. Add configurable product Option B, set quantity to 3
4. Verify cart shows two line items with quantities 2 and 3
5. Select Pickup delivery method
6. Execute `cartPickupLocations` query
7. Note the `availableQuantity` or stock-availability data returned for the item

**Expected Result:**
- Query returns successfully (no error)
- If the response includes per-product quantity info, the quantity for that ProductId should reflect the aggregated value (2 + 3 = 5)
- No duplicate entries in the response for the same ProductId
- The fix correctly uses `g.Sum(x => x.Quantity)` behavior

---

### TC-BE-006 — Edge: Three Configurable Variants of Same ProductId

**Priority:** High
**Estimate:** 10m
**Section:** Backend > cartPickupLocations > Edge Cases

**Preconditions:**
- Cart contains three line items for the same base product, each with a different configuration option (3 distinct variants, same ProductId)

**Steps:**
1. Clear cart
2. Add configurable product Option A, B, and C (three separate add-to-cart actions for the same base product)
3. Verify three line items in cart
4. Select Pickup delivery method
5. Execute `cartPickupLocations` query
6. Inspect response

**Expected Result:**
- Query succeeds with no error
- ProductId deduplicated correctly in search criteria (only one entry per ProductId)
- Quantities summed across all three variants
- Response is valid and contains location data

---

### TC-BE-007 — Regression: productPickupLocations Query Not Affected

**Priority:** High
**Estimate:** 8m
**Section:** Backend > productPickupLocations > Regression

**Preconditions:**
- A known product ID available (configurable or regular)
- GraphQL Playground open

**Steps:**
1. Navigate to GraphQL Playground at https://vcst-qa.govirto.com/ui/graphiql
2. Execute the `productPickupLocations` query:
```graphql
query GetProductPickupLocations {
  productPickupLocations(
    storeId: "B2B-store"
    cultureName: "en-US"
    productId: "<PRODUCT_ID>"
    facet: "address_countryname address_regionname address_city"
    first: 50
  ) {
    totalCount
    items {
      id
      name
      availableQuantity
      address {
        city
        countryName
      }
    }
    term_facets {
      name
      terms {
        term
        count
      }
    }
  }
}
```
3. Inspect response

**Expected Result:**
- Query returns valid data for the given product
- No error in response
- `productPickupLocations` query handler is completely unaffected by the fix to `cartPickupLocations` handler
- `items` and `term_facets` arrays populated

---

### TC-BE-008 — Negative: cartPickupLocations with Empty Cart

**Priority:** Medium
**Estimate:** 5m
**Section:** Backend > cartPickupLocations > Edge Cases

**Preconditions:**
- Cart is empty (no items, or all items unchecked/removed)
- GraphQL Playground open

**Steps:**
1. Clear cart completely
2. Get the empty cart ID
3. Execute `cartPickupLocations` query with the empty cartId
4. Inspect response

**Expected Result:**
- Query does not throw any exception
- Returns either empty `items` array with `totalCount: 0`, or returns all available pickup locations (store-level)
- No `ArgumentException` (an empty list to `.GroupBy()` is handled correctly)
- Response is a valid GraphQL data response, not an error

---

### TC-BE-009 — Regression: Mixed Cart (Regular + Configurable Duplicates)

**Priority:** High
**Estimate:** 12m
**Section:** Backend > cartPickupLocations > Regression

**Preconditions:**
- Cart contains: 1 regular product + 2 configurable variants (same ProductId) + 1 different regular product
- All items selected for checkout
- Pickup delivery method selected

**Steps:**
1. Build a mixed cart as described
2. Execute `cartPickupLocations` query
3. Inspect response for all expected products in the availability data

**Expected Result:**
- Query succeeds without error
- GroupBy logic correctly processes the configurable duplicates while not affecting the regular product entries
- All distinct ProductIds are represented in the search criteria
- Response contains valid pickup location data

---

### TC-BE-010 — Regression: cartPickupLocations Facets Return Correctly

**Priority:** High
**Estimate:** 8m
**Section:** Backend > cartPickupLocations > Regression

**Preconditions:**
- Multi-variant configurable cart (same as TC-BE-001 state)
- Pickup delivery method selected

**Steps:**
1. Execute `cartPickupLocations` query with `facet: "address_countryname address_regionname address_city"` parameter
2. Inspect `term_facets` in response
3. Verify each facet type is present
4. Verify each facet term has a count

**Expected Result:**
- `term_facets` array contains at least `address_countryname`, `address_regionname`, `address_city` facet objects
- Each term within a facet has a `term` string and a positive `count`
- Facet counts are accurate relative to the `totalCount` of locations
- No missing or empty facet arrays

---

## Frontend Test Cases (Cart BOPIS UI Layer)
**Executor:** qa-frontend-expert | **Browser/Tool:** playwright-chrome | **URL:** https://vcst-qa-storefront.govirto.com

---

### TC-FE-001 — Primary Bug Fix: Cart BOPIS Modal Opens for Multi-Variant Configurable Cart

**Priority:** Critical
**Estimate:** 10m
**Section:** Frontend > Cart > BOPIS Modal > Bug Fix Verification

**Preconditions:**
- Logged in as mutykovaelena@gmail.com
- Cart contains two configurable product variants of the same base product (same ProductId, different options)
- Pickup delivery method is selected in cart

**Steps:**
1. Log in to https://vcst-qa-storefront.govirto.com as mutykovaelena@gmail.com / Password2!
2. Navigate to a configurable product page
3. Add the product with Option A to cart
4. Return to the same product and add with Option B
5. Navigate to cart page
6. Verify two line items are present for the configurable product
7. Locate the SHIPPING DETAILS section
8. Click "Pickup" radio/option to set delivery method to Pickup
9. Verify a pickup location is shown in the Pickup section
10. Click the pencil/edit icon next to the pickup point address field
11. Wait for response (max 5 seconds)
12. Observe modal and any toast notifications

**Expected Result:**
- No red/error toast notification appears ("Something went wrong..." toast must be ABSENT)
- Pickup location selector modal opens successfully
- Modal contains a map and/or a list of pickup locations
- User is able to see and interact with available pickup locations
- No console errors related to `cartPickupLocations`

**Screenshots to capture:**
- `screenshots/desktop/TC-FE-001-cart-two-variants.png` — cart with two configurable variants
- `screenshots/desktop/TC-FE-001-modal-open.png` — modal opened successfully

---

### TC-FE-002 — Modal Contains Map and Location List

**Priority:** Critical
**Estimate:** 5m
**Section:** Frontend > Cart > BOPIS Modal > Content Verification

**Preconditions:**
- Modal opened successfully from TC-FE-001 state
- Multi-variant configurable cart

**Steps:**
1. With BOPIS modal open (from TC-FE-001)
2. Verify map renders on the right side (desktop layout)
3. Verify location list renders on the left side
4. Verify at least one pickup location entry is visible in the list
5. Verify map shows at least one marker
6. Note the number of locations shown

**Expected Result:**
- Map container is visible and rendered (not blank/grey box)
- Location list shows entries with name and address
- Total count displayed in modal header matches list length
- No "loading" spinner stuck indefinitely
- Layout is stable (no jumping or layout shifts)

**Screenshot:** `screenshots/desktop/TC-FE-002-modal-content.png`

---

### TC-FE-003 — Faceted Filter: Country Filter Works

**Priority:** High
**Estimate:** 8m
**Section:** Frontend > Cart > BOPIS Modal > Filters

**Preconditions:**
- BOPIS modal open with multi-variant cart
- Multiple pickup locations from different countries available

**Steps:**
1. Open BOPIS modal from cart page
2. Locate the Country/countryname filter section
3. Click on a specific country option (e.g., "United States")
4. Verify the location list updates to show only locations in that country
5. Verify the map updates to show only matching markers
6. Note the count next to the country filter changes to reflect active filter
7. Click the same country option to deselect it
8. Verify all locations are restored

**Expected Result:**
- Country filter is visible and clickable
- Applying filter reduces the location list to matching entries
- Map updates in sync with list
- Deselecting filter restores all locations
- No error on filter apply/remove

---

### TC-FE-004 — Faceted Filter: State/Region Filter Works

**Priority:** High
**Estimate:** 8m
**Section:** Frontend > Cart > BOPIS Modal > Filters

**Preconditions:**
- BOPIS modal open with multi-variant cart
- Pickup locations in multiple states/regions available

**Steps:**
1. Open BOPIS modal
2. Locate the State/Region (address_regionname) filter
3. Apply a state filter
4. Verify filtered results in list
5. Verify map synchronization
6. Clear the filter

**Expected Result:**
- State filter visible and functional
- Location list and map both update when filter applied
- Count in filter reflects number of matching locations
- Clear filter restores full list

---

### TC-FE-005 — Faceted Filter: City Filter Works

**Priority:** High
**Estimate:** 8m
**Section:** Frontend > Cart > BOPIS Modal > Filters

**Preconditions:**
- BOPIS modal open with multi-variant cart
- Pickup locations in multiple cities

**Steps:**
1. Open BOPIS modal
2. Locate the City (address_city) filter
3. Apply a city filter
4. Verify location list shows only locations in selected city
5. Clear the filter

**Expected Result:**
- City filter visible and functional
- Filtered results accurate
- Map and list synchronized
- No error on filter interactions

---

### TC-FE-006 — Pickup Location Selection and Confirmation

**Priority:** Critical
**Estimate:** 10m
**Section:** Frontend > Cart > BOPIS Modal > Selection Flow

**Preconditions:**
- BOPIS modal open from multi-variant configurable cart
- At least one pickup location visible in list

**Steps:**
1. Open BOPIS modal from cart
2. Click on a location entry in the list (or click its marker on the map)
3. Verify a location info card/panel opens showing location details
4. Verify info card shows: name, address, at minimum
5. Verify a "Select" or "Confirm" button is present in the info card
6. Click the "Select" or "Confirm" button
7. Verify the info card closes
8. Verify the BOPIS modal closes
9. Verify the selected location name appears in the cart SHIPPING DETAILS section

**Expected Result:**
- Location info card opens with full details
- "Select" button is present (regression check vs product page view-only mode)
- Clicking Select closes modal cleanly
- Selected location displayed in cart summary
- No error toast at any step
- Cart can proceed to checkout with selected location

**Screenshot:** `screenshots/desktop/TC-FE-006-location-selected.png`

---

### TC-FE-007 — Modal Cancel/Close Without Selection

**Priority:** Medium
**Estimate:** 5m
**Section:** Frontend > Cart > BOPIS Modal > Navigation

**Preconditions:**
- BOPIS modal open from multi-variant cart

**Steps:**
1. Open BOPIS modal
2. Browse locations (scroll list, click a location to view info)
3. Click "Cancel" on the info card (if applicable)
4. Click X (close) button on the main modal
5. Verify modal closes
6. Verify cart page state is unchanged (previously selected pickup location or no location)
7. Reopen the modal (click pencil icon again)
8. Verify modal reopens without error

**Expected Result:**
- Modal closes cleanly with no errors
- Cart state preserved from before opening modal
- Modal can be reopened successfully
- No console errors on close

---

### TC-FE-008 — Regression: Single Regular Product Cart BOPIS Modal

**Priority:** Critical
**Estimate:** 8m
**Section:** Frontend > Cart > BOPIS Modal > Regression

**Preconditions:**
- Cart contains one regular (non-configurable) product
- Pickup delivery method selected

**Steps:**
1. Clear cart
2. Add one regular non-configurable product to cart
3. Select Pickup delivery method
4. Click pencil/edit icon next to pickup address
5. Verify modal opens

**Expected Result:**
- Modal opens without error for standard single-product cart
- No regression introduced for the most common cart configuration
- Modal content (map, list, filters) all functional

---

### TC-FE-009 — Regression: Delivery Method Switch (Pickup to Delivery and Back)

**Priority:** High
**Estimate:** 8m
**Section:** Frontend > Cart > BOPIS > Regression

**Preconditions:**
- Multi-variant configurable cart
- Pickup delivery method active
- Pickup location has been selected

**Steps:**
1. Set up multi-variant cart with pickup location selected
2. Switch delivery method from Pickup to Delivery (shipping)
3. Verify Pickup location clears
4. Verify address fields for delivery appear
5. Switch back from Delivery to Pickup
6. Verify can click pencil icon to open pickup modal
7. Verify modal opens without error
8. Select a pickup location and confirm

**Expected Result:**
- Delivery method switching works correctly
- Pickup location cleared when switching to Delivery
- Switching back to Pickup allows modal to open without error
- Full round-trip possible: Pickup -> Delivery -> Pickup

---

### TC-FE-010 — Regression: Product Page BOPIS Modal (View-Only) Not Affected

**Priority:** High
**Estimate:** 8m
**Section:** Frontend > Product Page > BOPIS Widget > Regression

**Preconditions:**
- On a configurable product detail page that has BOPIS widget
- Logged in as mutykovaelena@gmail.com

**Steps:**
1. Navigate to the configurable product detail page
2. Locate the BOPIS availability widget in the shipping section
3. Click the BOPIS CTA button ("Check availability at nearby locations" or similar)
4. Verify the view-only pickup modal opens
5. Verify the modal shows locations but has NO "Select" button (view-only mode)
6. Close the modal
7. Verify product page is unchanged

**Expected Result:**
- Product page BOPIS modal opens successfully
- Modal is view-only: no "Select" or "Confirm" button in location info card
- Modal close returns to product page cleanly
- Fix to cart handler did NOT break the product page handler
- No console errors

---

### TC-FE-011 — Mobile: Cart BOPIS Modal Opens on Mobile Viewport

**Priority:** High
**Estimate:** 10m
**Section:** Frontend > Cart > BOPIS Modal > Mobile

**Preconditions:**
- Browser viewport set to 375x667 (mobile)
- Multi-variant configurable cart active
- Pickup delivery method selected

**Steps:**
1. Set browser viewport to 375x667
2. Navigate to cart page
3. Verify cart layout is mobile-friendly
4. Click the pickup edit icon
5. Verify modal opens in mobile layout
6. Verify List/Map toggle is visible
7. Switch between list and map views
8. Select a pickup location on mobile
9. Confirm selection

**Expected Result:**
- Modal opens on mobile without error toast
- Mobile layout shown (single column, list/map toggle)
- Touch targets adequate (minimum 44x44px)
- Selection flow completes on mobile
- No horizontal scroll needed

**Screenshot:** `screenshots/mobile/TC-FE-011-mobile-modal.png`

---

### TC-FE-012 — Edge Case: Cart with 5+ Configurable Variants of Same ProductId

**Priority:** Medium
**Estimate:** 12m
**Section:** Frontend > Cart > BOPIS Modal > Edge Cases

**Preconditions:**
- Cart contains 5 or more line items all from the same configurable product base (different option combinations)
- If the product has fewer configurable options, add each option multiple times as separate line items

**Steps:**
1. Build a cart with maximum configurable variants for one base product
2. Select Pickup delivery method
3. Click pencil/edit icon
4. Verify modal opens

**Expected Result:**
- Modal opens without error regardless of how many variants are in cart for the same base ProductId
- GroupBy logic handles 5+ duplicates the same as 2 duplicates
- Performance is acceptable (modal loads within 5 seconds)
- No timeout or server error

---

## Edge Case Test Cases (Executed by qa-backend-expert via GraphQL)

### TC-EC-001 — Edge: All Cart Items Unselected (Not Selected for Checkout)

**Priority:** Medium
**Estimate:** 5m
**Section:** Backend > cartPickupLocations > Edge Cases

**Steps:**
1. Build cart with configurable product variants
2. Uncheck/deselect all items from checkout (if UI supports this)
3. Execute `cartPickupLocations` query

**Expected Result:**
- The `.Where(x => x.SelectedForCheckout)` filter reduces items to zero
- Query runs successfully on an empty filtered set
- Returns empty or store-level location results, no error

---

### TC-EC-002 — Edge: Maximum Items with All Same ProductId (Stress Test)

**Priority:** Low
**Estimate:** 10m
**Section:** Backend > cartPickupLocations > Edge Cases

**Steps:**
1. Add as many configurable option variants as possible to cart (aim for 10+)
2. Execute `cartPickupLocations` query

**Expected Result:**
- No timeout
- No `StackOverflowException` or memory issue
- GroupBy and Sum operations complete efficiently
- Response time under 5 seconds

---

### TC-EC-003 — Regression: Multiple Distinct Configurable Products (Different ProductIds)

**Priority:** Medium
**Estimate:** 8m
**Section:** Backend > cartPickupLocations > Regression

**Steps:**
1. Add two different configurable products to cart (Product A Option 1 + Product B Option 1 — two distinct ProductIds)
2. Execute `cartPickupLocations` query

**Expected Result:**
- Both distinct ProductIds appear in search criteria
- No error (these are distinct keys so original `.ToDictionary()` would have worked, but verify GroupBy does not merge them)
- Correct separation of distinct products in query

---

### TC-EC-004 — Edge: Cart With Exact Same Variant Added Twice

**Priority:** Medium
**Estimate:** 8m
**Section:** Backend > cartPickupLocations > Edge Cases

**Steps:**
1. Add the same configurable product with the same option twice (quantity 1 + quantity 1 = separate line items with identical ProductId)
2. Execute `cartPickupLocations` query

**Expected Result:**
- GroupBy collapses them into one entry
- Quantity summed (1 + 1 = 2)
- No error

---

### TC-EC-005 — Negative: Invalid cartId

**Priority:** Low
**Estimate:** 3m
**Section:** Backend > cartPickupLocations > Negative

**Steps:**
1. Execute `cartPickupLocations` with a non-existent cartId (e.g., a random UUID)

**Expected Result:**
- Query returns gracefully with empty results or a user-friendly error
- No `System.ArgumentException` or internal server error stack trace exposed in response
- Error handling is clean

---

## Summary Table

| ID | Title | Priority | Executor | Type |
|----|-------|----------|----------|------|
| TC-BE-001 | cartPickupLocations — two configurable variants, same ProductId | Critical | qa-backend-expert | Bug Fix |
| TC-BE-002 | API response used by frontend — no error toast | Critical | qa-backend-expert | Bug Fix |
| TC-BE-003 | Regression — single regular product | Critical | qa-backend-expert | Regression |
| TC-BE-004 | Regression — single configurable product (one variant) | High | qa-backend-expert | Regression |
| TC-BE-005 | Quantity aggregation — sum is correct | High | qa-backend-expert | Fix Correctness |
| TC-BE-006 | Three configurable variants of same ProductId | High | qa-backend-expert | Edge Case |
| TC-BE-007 | Regression — productPickupLocations query | High | qa-backend-expert | Regression |
| TC-BE-008 | Negative — empty cart | Medium | qa-backend-expert | Edge Case |
| TC-BE-009 | Mixed cart — regular + configurable duplicates | High | qa-backend-expert | Regression |
| TC-BE-010 | Facets return correctly with multi-variant cart | High | qa-backend-expert | Regression |
| TC-FE-001 | Primary bug fix — cart BOPIS modal opens | Critical | qa-frontend-expert | Bug Fix |
| TC-FE-002 | Modal contains map and location list | Critical | qa-frontend-expert | Bug Fix |
| TC-FE-003 | Country facet filter works | High | qa-frontend-expert | Functional |
| TC-FE-004 | State/region facet filter works | High | qa-frontend-expert | Functional |
| TC-FE-005 | City facet filter works | High | qa-frontend-expert | Functional |
| TC-FE-006 | Location selection and confirmation | Critical | qa-frontend-expert | Functional |
| TC-FE-007 | Modal cancel/close without selection | Medium | qa-frontend-expert | Functional |
| TC-FE-008 | Regression — single regular product cart | Critical | qa-frontend-expert | Regression |
| TC-FE-009 | Regression — delivery method switch | High | qa-frontend-expert | Regression |
| TC-FE-010 | Regression — product page BOPIS view-only modal | High | qa-frontend-expert | Regression |
| TC-FE-011 | Mobile — cart BOPIS modal on 375x667 | High | qa-frontend-expert | Mobile |
| TC-FE-012 | Edge case — 5+ configurable variants in cart | Medium | qa-frontend-expert | Edge Case |
| TC-EC-001 | All cart items unselected for checkout | Medium | qa-backend-expert | Edge Case |
| TC-EC-002 | Maximum items — same ProductId stress test | Low | qa-backend-expert | Stress |
| TC-EC-003 | Multiple distinct configurable products | Medium | qa-backend-expert | Regression |
| TC-EC-004 | Same variant added twice | Medium | qa-backend-expert | Edge Case |
| TC-EC-005 | Negative — invalid cartId | Low | qa-backend-expert | Negative |

**Total: 27 test cases**
- Critical: 7
- High: 13
- Medium: 5
- Low: 2
