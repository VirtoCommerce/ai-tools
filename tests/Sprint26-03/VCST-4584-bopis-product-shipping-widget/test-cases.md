# Test Cases: VCST-4584 - [BOPIS] Product Details Re-design Shipping Options Widget

**Jira:** [VCST-4584](https://virtocommerce.atlassian.net/browse/VCST-4584)
**Also Covers:** [VCST-4613](https://virtocommerce.atlassian.net/browse/VCST-4613)
**PR:** [#2181](https://github.com/VirtoCommerce/vc-frontend/pull/2181)
**Sprint:** Sprint 26-03
**Author:** test-management-specialist
**Date:** 2026-02-19
**Version:** 2.0

---

## Overview

This document covers testing for the product page redesign of the BOPIS Shipping Options Widget. The key change is that the product page widget moved from a static inline list of stores to a compact CTA-driven modal experience. The modal opens in view-only mode (no selection allowed from the product page). Selection remains available only in the cart/checkout BOPIS flow.

### Test Case Count by Section

| Section | Count | Priority Distribution |
|---------|-------|-----------------------|
| 1. Product Page Widget - New Design | 13 | 4 Critical, 7 High, 2 Medium |
| 2. BOPIS Checkout Regression | 7 | 3 Critical, 3 High, 1 Medium |
| 3. Location Info Card Details | 3 | 1 Critical, 2 High |
| 4. Edge Cases and Error Handling | 4 | 2 High, 2 Medium |
| 5. UI Kit Component Changes | 4 | 2 High, 2 Medium |
| 6. VCST-4613 Availability Tooltip | 2 | 2 High |
| 7. Localization | 5 | 1 High, 3 Medium, 1 Low |
| 8. Mobile and Responsive | 4 | 3 High, 1 Medium |
| **Total** | **42** | **8 Critical, 22 High, 11 Medium, 1 Low** |

---

## Test Data Requirements

| Item | Value |
|------|-------|
| BOPIS-eligible product URL | A product PDP URL where `xPickupEnabled = true` and at least 3 pickup locations are configured |
| Non-BOPIS product URL | A product PDP URL with no configured pickup locations |
| Test user | `USER_EMAIL` / `USER_PASSWORD` from `.env` |
| Cart product | Any in-stock product already added to cart |
| Pickup location with long availability note | At least one location in the backend must have an `availabilityNote` longer than 30 characters to test truncation |

---

## Section 1: Product Page Widget - New Design

---

### TC-4584-01: Widget is visible with correct structure on BOPIS-eligible product page

**Priority:** Critical
**Type:** Functional
**Estimate:** 5 min
**Section:** Product Page Widget

**Preconditions:**
- Logged in as test user (`USER_EMAIL` / `USER_PASSWORD`)
- BOPIS module enabled in store configuration (`xPickupEnabled = true`)
- Navigate to a product details page (PDP) for a product that has at least 1 configured pickup location
- Default browser viewport (1920x1080 or 1440x900)

**Steps:**
1. Navigate to the storefront (`FRONT_URL` from `.env`)
2. Find and open any BOPIS-eligible product (use catalog or direct URL)
3. Scroll down on the product details page to the "Shipment options" section (below the Add to Cart button area)
4. Observe the widget structure carefully

**Expected Result:**
- A "Shipment options" section heading is visible
- The widget contains a store/pickup icon image (`in-store-pickup.svg`)
- The widget contains a text link labeled exactly "Check pickup locations" with a right-pointing arrow icon (`>>` chevron or similar)
- The old static list (a row per store showing store name + "In Stock" / "Out of Stock" inline availability) is NOT present anywhere on the page
- No loading spinner is shown on initial page load (spinner only appears on-demand when the CTA is clicked)
- Page layout is not broken around this widget area

---

### TC-4584-02: Widget is completely hidden when product has no pickup locations

**Priority:** High
**Type:** Functional
**Estimate:** 5 min
**Section:** Product Page Widget

**Preconditions:**
- Logged in as test user
- A product that has no configured pickup locations available (ask backend team or check catalog for a product where no locations are linked)

**Steps:**
1. Navigate to the storefront
2. Open the product details page for a product with no configured pickup locations
3. Scroll through the entire product page, specifically looking at the shipping/delivery options area
4. Inspect the DOM if needed to confirm the widget component is not rendered at all

**Expected Result:**
- No "Shipment options" widget is rendered anywhere on the page
- No empty container, collapsed widget, or broken placeholder is visible in the shipping section
- Page layout is normal without any gap or whitespace where the widget would have been
- The rest of the product page (Add to Cart, description, related products) loads and displays normally

---

### TC-4584-03: Widget is hidden when BOPIS module is globally disabled

**Priority:** High
**Type:** Functional
**Estimate:** 5 min
**Section:** Product Page Widget

**Preconditions:**
- BOPIS feature flag `xPickupEnabled = false` in store configuration (coordinate with backend/admin to temporarily disable, or use a store where BOPIS is disabled)
- Any product page URL

**Steps:**
1. Open a product details page in a store where BOPIS is disabled
2. Scroll to the shipping options area
3. Observe whether the Shipment options widget appears

**Expected Result:**
- The "Shipment options" widget is NOT rendered (same behavior as no locations)
- No broken element, empty div, or JavaScript error related to pickup locations
- The product page otherwise loads normally

---

### TC-4584-04: Clicking "Check pickup locations" CTA triggers loading overlay then opens modal

**Priority:** Critical
**Type:** Functional
**Estimate:** 8 min
**Section:** Product Page Widget

**Preconditions:**
- Logged in as test user
- On product details page with BOPIS-eligible product (TC-4584-01 passed)
- Browser DevTools open, Network tab active, filter set to "Fetch/XHR" or search for "graphql"

**Steps:**
1. Locate the "Check pickup locations" link in the Shipment options widget
2. Click the link
3. Immediately observe the widget area before the modal opens (look for a loading overlay covering the widget)
4. Wait for the modal to fully open (up to 5 seconds on QA environment)
5. In the Network tab, find the request with operation name `GetProductPickupLocations`
6. Click the request and inspect the "Request Payload" (or "Payload" tab) to review the GraphQL variables

**Expected Result:**
- Immediately after clicking: a semi-transparent loading overlay (`VcLoaderOverlay`) appears over the Shipment options widget area
- A GraphQL POST request is made to the `/graphql` endpoint with operation name `GetProductPickupLocations`
- The request variables include the correct `productId` (matching the product on the current page) and `first: 50`
- After the request completes: the `SelectAddressMapModal` opens and the loading overlay disappears
- No console errors (check DevTools Console tab) during the process
- The CTA link does not navigate away from the product page; the modal is an overlay

---

### TC-4584-05: Map modal opens in view-only mode - no "Select" button visible anywhere

**Priority:** Critical
**Type:** Functional
**Estimate:** 8 min
**Section:** Product Page Widget

**Preconditions:**
- On product details page with BOPIS-eligible product
- Map modal already opened by clicking CTA (TC-4584-04 completed)
- Multiple pickup locations loaded in the modal

**Steps:**
1. With the map modal open, click on any pickup location item in the left-side list panel
2. Wait for the location info card to slide in from the right (desktop) or appear at the bottom (mobile)
3. Examine all buttons and interactive elements within the info card
4. Look specifically in the card footer area for any button labeled "Select", "Select this pickup location", "Choose", or similar
5. Also check the list items themselves for any radio-button-style selection indicators or "Select" links

**Expected Result:**
- The info card slides in showing location details (name, address, hours)
- The card footer with the "Select this pickup location" button is completely absent (not hidden, not disabled - simply not rendered)
- No radio button selection circles are visible next to list items
- No "Select" button, "Choose" button, or equivalent CTA appears anywhere in the modal
- The only action buttons available are to close the info card (X icon or "Close" label) and to close the entire modal (modal X button in header)
- Visually, the modal is clearly for browsing/information only

---

### TC-4584-06: Radio button indicators are hidden in the location list (noIndicator prop)

**Priority:** High
**Type:** Functional / Visual
**Estimate:** 5 min
**Section:** Product Page Widget

**Preconditions:**
- Map modal open from product page (view-only mode)

**Steps:**
1. With the map modal open in view-only mode, look at the location list panel on the left side
2. Examine the visual appearance of each row in the location list
3. Compare to a regular radio button with a circle indicator (reference: how the cart BOPIS modal looks)
4. Hover the mouse over one list item without clicking it

**Expected Result:**
- No circular radio button input elements are visible next to any list item (`noIndicator=true` applied to the `VcRadioButton` component)
- Each list item cleanly shows: location name, address line, and availability chip - without a radio circle on the left
- The row layout does not have an empty space or gap on the left where a radio circle would normally be
- On hover: the hovered row shows a subtle background color change (secondary-50, a light secondary tint) indicating it is interactive
- The hover highlight makes it clear the row is clickable even without a radio indicator

---

### TC-4584-07: Keyword search filters pickup locations within the product page modal

**Priority:** High
**Type:** Functional
**Estimate:** 8 min
**Section:** Product Page Widget

**Preconditions:**
- Map modal open from product page
- At least 3 pickup locations loaded in the modal so filtering is meaningful
- Note the exact name of at least one location before searching

**Steps:**
1. In the map modal, locate the search input field (labeled "Search" or with a magnifying glass icon)
2. Type a partial name of a known pickup location (e.g., first 3-4 characters of the location name)
3. Click the search button (magnifying glass) or press Enter
4. Observe both the list panel and the map panel
5. Confirm the filter applied by checking that non-matching locations are gone
6. Click the X button inside the search field (or "Clear" button) to clear the search term
7. Observe the list and map after clearing

**Expected Result:**
- After submitting search: the list panel updates to show only locations whose name or address matches the keyword
- After submitting search: the map panel updates markers to show only matching locations
- After submitting search: the map re-zooms/re-centers to fit all matching markers
- After clearing: all locations are restored in both list and map, map returns to previous zoom level or fits all markers
- The search input accepts at least 2 characters before filtering is meaningful
- If no locations match the keyword: an empty state message is shown in the list (no broken layout)
- Search input is not disabled during normal browsing (only shows disabled state while a fetch is in progress)

---

### TC-4584-08: Facet filters (Country, Region, City) are NOT shown in the product page modal

**Priority:** High
**Type:** Functional
**Estimate:** 5 min
**Section:** Product Page Widget

**Preconditions:**
- Map modal open from product page

**Steps:**
1. With the map modal open from the product page, carefully examine the filter/search area near the top of the list panel
2. Look specifically for dropdown filters or select controls labeled "Country", "Region", "City", or equivalent geographic filters
3. Compare the filter area to what the cart BOPIS modal shows (which does have facet filters)

**Expected Result:**
- No Country, Region, or City dropdown filters are displayed in the product page modal
- The filter area contains only the keyword search text input
- This is the correct and expected behavior: `createProductFilterContext()` returns an empty facets array, so `hasFacetFilters = false` and the filter row is hidden
- No empty dropdown containers or placeholder text where filters would appear

---

### TC-4584-09: Clicking a map marker highlights the corresponding list item and opens info card

**Priority:** High
**Type:** Functional
**Estimate:** 8 min
**Section:** Product Page Widget

**Preconditions:**
- Map modal open from product page on desktop browser
- Google Maps has fully loaded (all map tiles rendered, pins visible)
- At least 2 location markers visible on the map

**Steps:**
1. In the map modal, identify at least one marker pin on the map
2. Click directly on a map marker pin (the clickable area may be small - click the center of the pin icon)
3. Observe both the info card panel and the location list simultaneously
4. In the info card that appears, check all visible elements and buttons
5. Click the X button on the info card to close it
6. Verify the info card closes cleanly

**Expected Result:**
- Clicking a map marker opens the info card panel (slides in from right on desktop)
- The info card displays: location name, full address, working hours (if configured in backend), and availability chip
- The corresponding list item in the left panel gets a highlighted/selected visual state (e.g., border or background change)
- The info card footer does NOT contain a "Select this pickup location" button (view-only mode)
- The info card can be closed using the X icon button
- After closing the info card, the list returns to its normal unhighlighted state
- No console errors during this interaction

---

### TC-4584-10: Closing the modal returns cleanly to the product page with CTA still functional

**Priority:** High
**Type:** Functional
**Estimate:** 5 min
**Section:** Product Page Widget

**Preconditions:**
- Map modal open from product page (with or without a location selected in the list)

**Steps:**
1. With the map modal open, click the X close button in the modal header
2. Observe the product page state immediately after the modal closes
3. Wait 2 seconds and check for any delayed errors in DevTools console
4. Click the "Check pickup locations" CTA again to verify it is still functional

**Expected Result:**
- Modal closes smoothly without any animation glitches or freezing
- Product page is fully intact: all sections visible, no layout shift, no missing elements
- The "Check pickup locations" CTA link is still visible, correctly styled, and clickable
- Clicking the CTA a second time triggers the fetch and opens the modal again (loading overlay appears)
- No console errors appear after closing
- Page scroll position is preserved (user is not scrolled to the top)

---

### TC-4584-11: Re-opening modal fetches fresh data and shows no stale filter state

**Priority:** Medium
**Type:** Functional
**Estimate:** 8 min
**Section:** Product Page Widget

**Preconditions:**
- On product page with BOPIS-eligible product

**Steps:**
1. Click "Check pickup locations" to open the modal for the first time
2. In the search input, type a keyword (e.g., "Main") and press Enter - note which locations are shown
3. Close the modal using the X button
4. Click "Check pickup locations" again to re-open the modal
5. Observe the modal state on re-open: search field content, list of locations, loading state

**Expected Result:**
- On re-open: the loading overlay appears again over the widget (a fresh fetch is triggered, not a cached display)
- On re-open: the search keyword field is empty (filter context was cleared via `filterContext.clearFilter()` when modal was closed)
- On re-open: the full list of all pickup locations is shown (no previous filter still applied)
- On re-open: the map shows all location markers
- No stale state from the previous session persists

---

### TC-4584-12: Modal shows up to 50 locations with no pagination control (product page limit)

**Priority:** Medium
**Type:** Functional
**Estimate:** 5 min
**Section:** Product Page Widget

**Preconditions:**
- Map modal open from product page
- Backend configured with more than 10 pickup locations (ideally test with a store having many locations)

**Steps:**
1. Open the map modal from the product page
2. Count the number of locations shown in the list (or scroll to the bottom of the list)
3. Look for a "Load more" button, pagination controls, or infinite scroll indicator at the bottom of the list

**Expected Result:**
- The modal loads up to 50 pickup locations in a single request (as specified by `first: 50` in the GraphQL query)
- No "Load more" / pagination control is shown at the bottom of the list in the product page modal (differs from cart context which can paginate)
- If fewer than 50 locations exist, all are shown
- The total count (if displayed) matches the number of items in the list

---

### TC-4584-13: GraphQL response for product pickup locations includes all new fields

**Priority:** Critical
**Type:** API / GraphQL
**Estimate:** 10 min
**Section:** Product Page Widget

**Preconditions:**
- Browser DevTools open with Network tab active (filter: Fetch/XHR, or search "graphql")
- On product page with BOPIS-eligible product
- At least one pickup location has `description`, `contactEmail`, `contactPhone`, `workingHours`, and `geoLocation` configured in the backend

**Steps:**
1. Click "Check pickup locations" on the product page
2. In the Network tab, locate the POST request with the GraphQL operation name `GetProductPickupLocations`
3. Click the request and open the "Response" or "Preview" tab
4. Expand the response JSON: `data` > `productPickupLocations` > `items` > first item
5. Check each field listed in the expected result

**Expected Result:**
- The response JSON contains an `items` array with at least one pickup location object
- Each item in `items` includes the following fields (populated where backend data exists, `null` only if not configured):
  - `description` (string or null)
  - `contactEmail` (string or null)
  - `contactPhone` (string or null)
  - `workingHours` (string or array, depending on schema)
  - `geoLocation` (object with `latitude` and `longitude`, or a lat/lng string)
  - `address` block containing: `line1`, `city`, `countryName`, `postalCode`, `countryCode`
- The request variables show: `productId` matching the current product's ID, and `first: 50`
- No `errors` array in the response (or empty `errors: []`)
- No GraphQL schema validation errors (HTTP 200 returned)

---

## Section 2: BOPIS Checkout Regression

---

### TC-4584-14: Cart BOPIS modal opens in fully selectable mode (critical regression)

**Priority:** Critical
**Type:** Regression
**Estimate:** 8 min
**Section:** BOPIS Checkout Regression

**Preconditions:**
- Logged in as test user
- At least one product added to the cart
- BOPIS/Pickup shipping method available and not yet selected

**Steps:**
1. Navigate to the cart page (`FRONT_URL/cart` or via cart icon)
2. In the shipping method section, select "Pickup" or "In-Store Pickup" shipping method
3. Once BOPIS shipping is selected, find and click the "Select pickup location" button (or "Choose a store" equivalent)
4. Observe the modal that opens carefully, comparing to product page modal behavior

**Expected Result:**
- The `SelectAddressMapModal` opens successfully
- Radio button circle indicators ARE visible and rendered next to each location list item (this confirms `selectable=true` is being passed in cart context)
- Each location info card (when clicked) shows a "Select this pickup location" button in the card footer
- Country, Region, City facet filter dropdowns ARE visible in the filter area (cart context uses `createCartFilterContext()` which provides facet options)
- The modal title and UI are appropriate for location selection (not just browsing)
- No console errors or `inject() can only be used inside setup()` warnings in DevTools

---

### TC-4584-15: Selecting a location in cart BOPIS modal saves correctly and closes modal

**Priority:** Critical
**Type:** Regression
**Estimate:** 10 min
**Section:** BOPIS Checkout Regression

**Preconditions:**
- Cart BOPIS modal open (TC-4584-14 passed)
- Multiple pickup locations available in the list

**Steps:**
1. In the cart BOPIS modal, click on any pickup location in the list to open its info card
2. In the info card footer, click the "Select this pickup location" button
3. Observe the modal behavior immediately after clicking
4. Observe the cart page after the modal closes

**Expected Result:**
- After clicking "Select this pickup location": the modal closes automatically
- On the cart page: the selected pickup location name and address are displayed in the shipping section (replacing the previous "Select pickup location" CTA)
- The cart now shows the BOPIS shipment with the chosen store details
- The selected location is persisted (refreshing the page should still show the selected store)
- No console errors during or after selection

---

### TC-4584-16: Cart BOPIS - facet filters (Country, Region, City) are visible and functional

**Priority:** High
**Type:** Regression
**Estimate:** 8 min
**Section:** BOPIS Checkout Regression

**Preconditions:**
- Cart BOPIS modal open
- Backend has pickup locations in at least 2 different countries or regions for filter testing to be meaningful (if only one country, skip country filter test and focus on city)

**Steps:**
1. In the cart BOPIS modal, look at the filter bar above the search input
2. Verify the presence of Country, Region, and City filter dropdowns or chips
3. Click the Country filter and select a specific country (e.g., "United States")
4. Observe the list and map after applying the filter
5. Look for an active filter chip or indicator showing the applied filter
6. Click the filter chip or "Reset filters" to remove the filter
7. Verify the list restores all locations

**Expected Result:**
- Country, Region, and City filter dropdowns (or equivalent filter chips) are visible in the filter bar
- Selecting a Country filter reduces the list to only locations in that country
- Selecting a Region filter (after Country) further narrows the list
- Active filter chips appear below the filter row showing the applied filters
- Clicking "Reset filters" chip (or equivalent reset control) removes all active filters and restores the full list
- The map updates in sync with each filter change

---

### TC-4584-17: Cart BOPIS - keyword search still works correctly

**Priority:** High
**Type:** Regression
**Estimate:** 5 min
**Section:** BOPIS Checkout Regression

**Preconditions:**
- Cart BOPIS modal open

**Steps:**
1. In the cart BOPIS modal, type a known keyword in the search input (partial name of a location)
2. Submit the search (press Enter or click the search button)
3. Verify the results
4. Clear the search and verify all locations return

**Expected Result:**
- Keyword search filters results correctly by location name or address keyword
- Behavior is identical to before this PR was merged
- Map and list both update on search
- Clearing search restores all locations
- No regression introduced by the `usePickupFilterContext` refactor

---

### TC-4584-18: Cart BOPIS - reset filter closes info card and refreshes list (behavior change verification)

**Priority:** High
**Type:** Regression / Behavior Change Verification
**Estimate:** 8 min
**Section:** BOPIS Checkout Regression

**Note:** This test explicitly verifies the `resetFilter` behavior change introduced in this PR. Previously, `resetFilter` called `applyFilter()`. Now it calls `closeInfoCard()` followed by `onFilterChange()`. Both the old and new behavior result in filter being cleared, but the new behavior also explicitly closes any open info card first.

**Preconditions:**
- Cart BOPIS modal open
- At least 2 pickup locations visible

**Steps:**
1. In the cart BOPIS modal, apply a keyword filter in the search input and submit
2. Click on one of the visible filtered locations to open its info card (info card should be visible)
3. Note that both a filter is active AND an info card is open simultaneously
4. Click the "Reset filters" chip or clear-all button
5. Observe the sequence of events carefully: does the info card close? Does the list refresh?

**Expected Result:**
- Step 4 result - info card closes first (immediately): the info card disappears without needing a separate click
- Step 4 result - filter clears: the search term is removed from the input
- Step 4 result - list refreshes: all locations are shown again via `onFilterChange()`
- Step 4 result - map updates: all location markers are visible again
- The sequence is: info card closes → then list/map refreshes (both happen nearly simultaneously)
- No console errors
- This confirms the new `closeInfoCard() + onFilterChange()` logic works correctly

---

### TC-4584-19: Cart BOPIS - load more pagination works for large location sets

**Priority:** Medium
**Type:** Regression
**Estimate:** 8 min
**Section:** BOPIS Checkout Regression

**Preconditions:**
- Cart BOPIS modal open
- Backend has more pickup locations than the default page size (typically 10-20 per page in cart context)

**Steps:**
1. In the cart BOPIS modal, scroll to the very bottom of the location list
2. Look for a "Load more" button, "Show more locations" link, or infinite scroll behavior
3. If "Load more" button exists: click it and observe additional locations loading
4. Check the total count indicator (if shown) before and after loading more

**Expected Result:**
- A "Load more" button or infinite scroll is present at the bottom of the list when more locations exist
- Clicking "Load more" triggers an additional GraphQL request (verify in Network tab if possible)
- Additional locations appear in the list below the previously loaded ones
- The total count displayed (if present) shows the full count across all pages
- The `onPageChange` callback works correctly (no regression from filter context refactor)
- Pagination behavior is identical to before this PR

---

### TC-4584-20: Full BOPIS checkout E2E - add to cart through order confirmation

**Priority:** Critical
**Type:** Regression / E2E
**Estimate:** 15 min
**Section:** BOPIS Checkout Regression

**Preconditions:**
- Logged in as test user
- Cart is empty at start
- BOPIS-eligible product available in catalog
- At least one pickup location configured

**Steps:**
1. Navigate to a BOPIS-eligible product page
2. Click "Add to Cart"
3. Navigate to the cart page
4. In shipping method, select "Pickup" / BOPIS option
5. Click the pickup location selector button
6. In the modal (which should open in selectable mode), select a pickup location
7. Verify location is saved in cart
8. Proceed to checkout
9. On the checkout page, verify the selected BOPIS location is still shown in the shipping section
10. Complete the checkout (or proceed as far as the payment step to verify no BOPIS regression)

**Expected Result:**
- The entire BOPIS cart-through-checkout flow works without errors
- At no point does the modal open in view-only mode during checkout (only selectable mode)
- Selected pickup location persists from cart to checkout
- No `inject()` errors or Vue warnings in the console throughout the flow
- Checkout can be completed with a BOPIS shipment selected

---

## Section 3: Location Info Card Details

---

### TC-4584-21: Info card displays all available location details from new GraphQL fields

**Priority:** Critical
**Type:** Functional
**Estimate:** 8 min
**Section:** Location Info Card Details

**Preconditions:**
- Map modal open from the product page (view-only mode)
- At least one pickup location in backend has `description`, `contactEmail`, `contactPhone`, and `workingHours` configured

**Steps:**
1. Open the map modal from the product page
2. Click on a pickup location that has detailed information configured in the backend
3. Wait for the info card to appear
4. Carefully read all sections of the info card

**Expected Result:**
- Info card shows the location name prominently at the top
- Full address is displayed (line1, city, countryName, postalCode)
- Working hours section is visible if `workingHours` data exists (e.g., "Mon-Fri: 9am-6pm")
- Contact information shown if configured: email address and/or phone number
- Location description shown if configured (short text about the store)
- Availability chip is shown (the truck/pickup icon chip showing availability status)
- The footer area is absent (no "Select" button since this is view-only mode)
- All text is readable, not truncated unexpectedly (long text may wrap to multiple lines)

---

### TC-4584-22: Info card in cart BOPIS modal shows "Select" button in footer

**Priority:** High
**Type:** Regression
**Estimate:** 5 min
**Section:** Location Info Card Details

**Preconditions:**
- Cart BOPIS modal open in selectable mode

**Steps:**
1. In the cart BOPIS modal, click on any pickup location in the list
2. Observe the info card that opens
3. Look at the card footer area

**Expected Result:**
- The card footer IS visible and contains a "Select this pickup location" button (or equivalent labeled "Select", "Choose this store")
- The button is enabled and styled correctly (primary color button)
- Clicking the button selects the location and closes the modal (covered in TC-4584-15 in more detail)
- This confirms `selectable=false` hides the footer in product context and `selectable=true` shows it in cart context

---

### TC-4584-23: Map marker shows location info and geoLocation data is used for pin placement

**Priority:** High
**Type:** Functional
**Estimate:** 5 min
**Section:** Location Info Card Details

**Preconditions:**
- Map modal open from product page
- Google Maps loaded with location pins visible
- At least one location has `geoLocation` (lat/lng) configured in backend

**Steps:**
1. Open the map modal from the product page and wait for map to fully load
2. Observe the positions of the map marker pins on the map
3. Click on a map marker and note the location name/address shown
4. Verify the pin location on the map makes geographic sense relative to the address shown

**Expected Result:**
- Map marker pins appear at geographically correct positions based on `geoLocation` data
- Clicking a marker displays the correct location's info card (matching name/address shown in the list)
- If a location has no `geoLocation` data, it either does not show on the map or shows at a default position (no crash)
- Multiple pins for multiple locations are all visible and individually clickable

---

## Section 4: Edge Cases and Error Handling

---

### TC-4584-24: Network failure during CTA click shows an appropriate error state

**Priority:** High
**Type:** Edge Case / Error Handling
**Estimate:** 10 min
**Section:** Edge Cases

**Preconditions:**
- On product page with BOPIS-eligible product
- Browser DevTools open

**Steps:**
1. Open DevTools > Network tab
2. Set Network to "Offline" mode (or throttle to simulate timeout) using DevTools Network conditions
3. Click "Check pickup locations" on the product page
4. Observe the widget behavior when the GraphQL request fails
5. Restore network to "Online"
6. Click "Check pickup locations" again and verify it works

**Expected Result:**
- When network is offline: the loading overlay disappears after the request times out or fails
- An error message or empty state is shown (e.g., toast notification, inline error text, or the modal opens with an empty list and an error message)
- The page does not freeze, crash, or show a white screen
- No unhandled JavaScript exceptions in the console (handled error state only)
- After restoring network: clicking the CTA again successfully loads locations (the component recovers cleanly)

---

### TC-4584-25: Modal with zero results from keyword search shows empty state

**Priority:** High
**Type:** Edge Case
**Estimate:** 5 min
**Section:** Edge Cases

**Preconditions:**
- Map modal open from product page with locations loaded

**Steps:**
1. In the product page modal search input, type a search term that will match no locations (e.g., "ZZZNOMATCH999")
2. Submit the search

**Expected Result:**
- The list panel shows an empty state message (e.g., "No pickup locations found" or "No results for your search")
- The message is well-formatted, not a blank white area or a broken layout
- The map panel shows no markers (or shows a zoomed-out world view)
- No JavaScript console errors
- The "Clear search" / X button is available to reset back to all locations

---

### TC-4584-26: Rapid double-click on CTA does not trigger duplicate GraphQL requests

**Priority:** Medium
**Type:** Edge Case
**Estimate:** 5 min
**Section:** Edge Cases

**Preconditions:**
- On product page with BOPIS-eligible product
- DevTools Network tab open

**Steps:**
1. Click "Check pickup locations" quickly twice in succession (double-click)
2. Observe the Network tab for duplicate `GetProductPickupLocations` requests
3. Observe the UI for duplicate modals opening

**Expected Result:**
- Only one GraphQL request for `GetProductPickupLocations` is made (not two)
- Only one modal opens (no duplicate modal on top of another)
- The CTA is visually disabled or non-interactive while the loading overlay is showing (preventing the second click from registering)

---

### TC-4584-27: Back/forward browser navigation does not break the product page after modal interaction

**Priority:** Medium
**Type:** Edge Case
**Estimate:** 5 min
**Section:** Edge Cases

**Preconditions:**
- On product page with BOPIS-eligible product

**Steps:**
1. Open the product page with BOPIS widget visible
2. Click "Check pickup locations" and open the modal
3. Close the modal
4. Click browser Back button
5. Click browser Forward button to return to the product page
6. Attempt to click "Check pickup locations" again

**Expected Result:**
- Browser Back navigation works normally (goes to previous page)
- Browser Forward navigation returns to the product page correctly
- After returning to the product page: the Shipment options widget is visible and functional
- Clicking "Check pickup locations" after Back/Forward navigation works (triggers fetch, opens modal)
- No Vue router errors or blank page state

---

## Section 5: UI Kit Component Changes

---

### TC-4584-28: VcRadioButton with noIndicator=true hides the radio circle element

**Priority:** High
**Type:** Component / Visual
**Estimate:** 5 min
**Section:** UI Kit Components

**Test Location:** QA Storybook (`STORYBOOK_URL` from `.env`) OR live product page BOPIS modal

**Steps (Storybook path):**
1. Navigate to QA Storybook
2. Find the "RadioButton" component in the Atoms category
3. In the Controls panel, enable the `noIndicator` prop (set to `true`)
4. Observe the rendered RadioButton component

**Steps (Live environment path):**
1. Open the product page BOPIS modal (view-only mode)
2. Use DevTools Element Inspector to inspect a location list item
3. Look for the `input[type="radio"]` element within each list row

**Expected Result (Storybook):**
- With `noIndicator=true`: the circular radio input element has `display: none` applied
- The label text and any associated content remain fully visible and readable
- The component's width/layout does not collapse unexpectedly (no missing space or layout shift)
- The `gap-2` class on the container correctly spaces content without the circle

**Expected Result (Live environment):**
- DevTools Inspector shows the radio `input` element with `display: none` style
- Visually: no circle appears in the location list rows
- The list item height and spacing are consistent with or without the indicator

---

### TC-4584-29: VcRadioButton with noIndicator=false (default) shows radio circle and works correctly

**Priority:** High
**Type:** Component Regression / Visual
**Estimate:** 5 min
**Section:** UI Kit Components

**Test Location:** Cart BOPIS modal (selectable mode)

**Preconditions:**
- Cart BOPIS modal open in selectable mode

**Steps:**
1. Open the cart BOPIS modal
2. Observe the location list rows - specifically look for radio button circles on the left of each row
3. Click one of the location items (not the info card link - just anywhere on the row area)
4. Observe the visual state of the radio button for the selected item
5. Click a different location item and observe the state change

**Expected Result:**
- Radio button circles ARE clearly visible next to each location row (default `noIndicator=false`)
- When a location is selected (clicked): the radio circle shows a filled/checked state with the theme's primary color border or fill
- When a different location is clicked: the previously selected radio deselects and the new one selects
- No visual regression from the `gap-2` class addition to the container (previously used `me-2`/`ms-2` on child label - result should be visually equivalent spacing)
- The layout looks correct and matches the pre-PR visual appearance

---

### TC-4584-30: VcPopover content does not overflow horizontally in constrained containers

**Priority:** Medium
**Type:** Visual / Layout
**Estimate:** 5 min
**Section:** UI Kit Components

**Test Location:** Any page that uses a `VcPopover` component in a narrow or constrained container (check catalog filters, product attributes, or admin - wherever VcPopover is used)

**Steps:**
1. Identify a UI area that uses `VcPopover` (e.g., a filter dropdown, informational popover on a product attribute, or any hover/click popover in the storefront)
2. Trigger the popover to open (click or hover as appropriate)
3. Observe the popover content area, particularly if it is inside a narrow sidebar or constrained column
4. Check for horizontal scrollbar at the page level or popover level
5. Resize the browser window to a narrower viewport (e.g., 1024px) and repeat

**Expected Result:**
- The popover content respects the `max-w-full` constraint and does not overflow beyond its parent container
- No horizontal scrollbar appears on the page when the popover is open
- Popover content is readable (text wraps if the container is narrow)
- The fix does not break popovers in wide containers (content still displays normally in full-width contexts)

---

### TC-4584-31: VcRadioButton noIndicator prop coexists with existing RadioButton usage site-wide

**Priority:** Medium
**Type:** Component Regression
**Estimate:** 8 min
**Section:** UI Kit Components

**Preconditions:**
- Access to any other page in the storefront that uses radio buttons (e.g., shipping method selection in checkout, payment method selection)

**Steps:**
1. Navigate to the checkout shipping method selection step
2. Observe the radio buttons used for selecting shipping methods (Ground, Air, etc.)
3. Navigate to the checkout payment method selection step
4. Observe the radio buttons used for payment method selection

**Expected Result:**
- Shipping method radio buttons appear and work normally (no regression from `VcRadioButton` changes)
- Payment method radio buttons appear and work normally
- All radio buttons in these contexts show their indicator circle (noIndicator defaults to false)
- No layout changes or visual regressions across any other radio button usage in the application

---

## Section 6: VCST-4613 Availability Tooltip

---

### TC-4584-32: Availability chip tooltip shows full description text on hover in product page modal

**Priority:** High
**Type:** Functional / Visual (VCST-4613)
**Estimate:** 5 min
**Section:** VCST-4613 Availability Tooltip

**Preconditions:**
- Map modal open from product page (view-only mode)
- At least one pickup location in the backend has an `availabilityNote` text longer than approximately 30 characters (so the chip will truncate it)

**Steps:**
1. Open the product page BOPIS modal
2. In the location list, look for pickup locations that have an availability chip (typically a truck icon with a short text snippet)
3. Hover the mouse cursor directly over the availability chip of a location that has a long availability note
4. Hold the hover for 1-2 seconds to allow the tooltip to appear

**Expected Result:**
- A tooltip appears (typically below or above the chip, positioned by `VcTooltip`)
- The tooltip text contains the full, untruncated `availabilityNote` text
- The chip itself still shows truncated text (the chip uses the CSS `truncate` class which clips overflow)
- The tooltip disappears cleanly when the mouse cursor leaves the availability chip
- No layout shift or page jump when the tooltip appears/disappears

---

### TC-4584-33: Availability chip tooltip also works in cart BOPIS modal

**Priority:** High
**Type:** Functional / Regression (VCST-4613)
**Estimate:** 5 min
**Section:** VCST-4613 Availability Tooltip

**Preconditions:**
- Cart BOPIS modal open
- At least one pickup location has a long availability note (same as TC-4584-32 precondition)

**Steps:**
1. Open the cart BOPIS modal
2. Find a location with an availability chip that has truncated text
3. Hover over the availability chip for 1-2 seconds

**Expected Result:**
- Tooltip appears showing the full `availabilityNote` text (same behavior as in product page modal)
- This confirms `pickup-availability-info.vue` wrapping `VcTooltip` works in both modal contexts (product and cart)
- Tooltip is positioned correctly relative to the chip (not clipped by the modal boundary)
- The fix from VCST-4613 applies universally wherever `pickup-availability-info.vue` is rendered

---

## Section 7: Localization

---

### TC-4584-34: English (EN) locale shows "Check pickup locations" text

**Priority:** High
**Type:** Localization
**Estimate:** 3 min
**Section:** Localization

**Preconditions:**
- Storefront language set to English (EN) - default
- On product page with BOPIS locations

**Steps:**
1. Ensure the storefront is displaying in English (EN)
2. Navigate to a product details page with a BOPIS-eligible product
3. Scroll to the Shipment options widget

**Expected Result:**
- The CTA link text reads exactly "Check pickup locations" (new text from renamed key `check_pickup_locations`)
- The old text "In-Store Pickup" (from the old `in_store` key) does NOT appear
- No raw translation key string is shown (e.g., no `shared.catalog.shipment_options.check_pickup_locations` or `shared.catalog.shipment_options.in_store` visible as literal text)

---

### TC-4584-35: German (DE) locale shows correct translated text

**Priority:** Medium
**Type:** Localization
**Estimate:** 3 min
**Section:** Localization

**Preconditions:**
- Storefront language switcher accessible
- Product page with BOPIS locations accessible

**Steps:**
1. Switch the storefront language to German (DE) using the language switcher
2. Navigate to the product details page (or refresh if already on it)
3. Observe the Shipment options widget text

**Expected Result:**
- The CTA text reads "Abholstandorte prüfen" (the new German translation for `check_pickup_locations`)
- The old text "Abholung im Geschäft" (old `in_store` key value) does NOT appear
- German special characters (ü, ä, ö, etc.) render correctly without encoding artifacts

---

### TC-4584-36: French (FR) and Spanish (ES) locale spot-check

**Priority:** Medium
**Type:** Localization
**Estimate:** 5 min
**Section:** Localization

**Steps:**
1. Switch the storefront language to French (FR)
2. Navigate to product page with BOPIS product
3. Observe the Shipment options widget - expected text: "Vérifier les points de retrait"
4. Switch language to Spanish (ES)
5. Navigate to product page (or refresh)
6. Observe the Shipment options widget - expected text: "Comprobar los puntos de recogida" (or similar ES translation)

**Expected Result:**
- French locale: displays "Vérifier les points de retrait" (French accented characters render correctly)
- Spanish locale: displays the correct Spanish translation for "Check pickup locations"
- Neither locale falls back to English text or shows a raw locale key string

---

### TC-4584-37: Russian (RU) and Japanese (JA) locale spot-check

**Priority:** Medium
**Type:** Localization
**Estimate:** 5 min
**Section:** Localization

**Steps:**
1. Switch storefront language to Russian (RU)
2. Navigate to product page with BOPIS product
3. Observe the Shipment options widget - expected text: "Проверить пункты самовывоза"
4. Switch language to Japanese (JA)
5. Navigate to product page
6. Observe the Shipment options widget for Japanese text

**Expected Result:**
- Russian locale: displays "Проверить пункты самовывоза" with correct Cyrillic characters
- Japanese locale: displays the correct Japanese translation (kanji/hiragana rendered correctly, no encoding issues)
- Both locales confirm the key rename from `in_store` to `check_pickup_locations` was applied in all 13 language files

---

### TC-4584-38: Remaining locales spot-check (FI, IT, NO, PL, PT, SV, ZH)

**Priority:** Low
**Type:** Localization
**Estimate:** 10 min
**Section:** Localization

**Steps:**
1. For each language in the list: Finnish (FI), Italian (IT), Norwegian (NO), Polish (PL), Portuguese (PT), Swedish (SV), Chinese (ZH):
   - Switch storefront language to that locale
   - Navigate to product page with BOPIS product
   - Observe the Shipment options widget

**Expected Result:**
- All 7 remaining locales display a translated string for "Check pickup locations" (not the old value, not English, not the raw key)
- No locale shows a missing translation indicator or falls back to English unexpectedly
- Characters specific to each language (e.g., Scandinavian characters ø, å for NO; Chinese characters for ZH) render without encoding issues
- This covers all 13 locales where `in_store` was renamed to `check_pickup_locations`

---

## Section 8: Mobile and Responsive Testing

---

### TC-4584-39: Mobile (375px) - widget CTA is correctly laid out and tappable

**Priority:** High
**Type:** Mobile / Responsive
**Estimate:** 5 min
**Section:** Mobile
**Viewport:** 375px width x 812px height (iPhone SE / iPhone 12 equivalent)

**Preconditions:**
- Browser viewport set to 375px (use DevTools Device Toolbar or resize browser)
- On product page with BOPIS-eligible product

**Steps:**
1. Set browser to 375px viewport width (mobile simulation)
2. Navigate to the product details page
3. Scroll down to the Shipment options widget
4. Observe the layout of the widget at mobile viewport
5. Tap / click the "Check pickup locations" CTA link

**Expected Result:**
- The widget is fully visible without horizontal scrolling or overflow at 375px
- The store pickup icon and "Check pickup locations" text are on the same row (no awkward line wrap that separates icon from text)
- The CTA link tap target is at least 44x44 CSS pixels (WCAG accessibility requirement)
- Tapping the CTA triggers the loading overlay (briefly visible over the widget)
- The map modal opens in its mobile layout (full-screen or near-full-screen modal, list on top, map below or via toggle)

---

### TC-4584-40: Mobile - view-only modal has correct layout and no Select button

**Priority:** High
**Type:** Mobile / Functional
**Estimate:** 8 min
**Section:** Mobile
**Viewport:** 375px width

**Preconditions:**
- Map modal opened from product page at 375px viewport (TC-4584-39 completed)

**Steps:**
1. With the mobile map modal open, observe the initial view (expect list view as default)
2. If a list/map toggle exists, tap it to switch to the map view
3. Tap on a map marker on the mobile map
4. Observe the info card that appears (should slide up from the bottom on mobile)
5. Carefully inspect the info card for any Select button
6. Tap the X to close the info card
7. Tap the modal close button to return to the product page

**Expected Result:**
- Mobile modal shows either: list-first view or map view, with a visible toggle between them
- Info card on mobile appears at the bottom of the screen (drawer-style) when a location or marker is tapped
- The mobile info card footer does NOT contain a "Select this pickup location" button (view-only mode applies on mobile too)
- The info card can be dismissed with the X / close button or by tapping outside it
- Closing the full modal returns to the product page without layout issues at 375px

---

### TC-4584-41: Mobile - cart BOPIS modal is still selectable at 375px viewport

**Priority:** High
**Type:** Mobile Regression
**Estimate:** 8 min
**Section:** Mobile
**Viewport:** 375px width

**Preconditions:**
- Mobile viewport at 375px
- Cart has products with BOPIS shipping method selected

**Steps:**
1. Navigate to the cart page on mobile viewport (375px)
2. Select the BOPIS/Pickup shipping method
3. Tap the pickup location selector button
4. In the mobile cart BOPIS modal, tap a location from the list
5. Look for and tap the "Select this pickup location" button in the info card footer
6. Verify the selection is saved

**Expected Result:**
- Cart BOPIS modal opens on mobile with the "Select this pickup location" button visible in info card footers
- The `selectable=true` prop is correctly passed and the button is rendered on mobile
- Selection succeeds and the selected location is shown in the cart on mobile viewport
- No regression from the `selectable` prop changes in `select-address-map-mobile.vue`

---

### TC-4584-42: Tablet (768px) - widget and modal display correctly

**Priority:** Medium
**Type:** Responsive
**Estimate:** 8 min
**Section:** Mobile
**Viewport:** 768px width x 1024px height (iPad equivalent)

**Preconditions:**
- Browser viewport set to 768px width

**Steps:**
1. Set viewport to 768px wide
2. Navigate to the product page with BOPIS product
3. Observe the Shipment options widget layout at this breakpoint
4. Click "Check pickup locations" and observe the modal
5. In the modal, determine whether desktop or mobile layout is used (list-side-by-side vs list-on-top)

**Expected Result:**
- At 768px: the widget is fully visible and not overflowing
- The CTA link is tappable (adequate touch target size)
- The modal at 768px may use either desktop layout (split list + map) or mobile layout (toggle) depending on the breakpoint configuration - either is acceptable as long as it is usable and all content is accessible
- No horizontal scroll on the product page or within the modal at 768px viewport
- List of locations is readable and scrollable if more items exist than can fit in the visible area

---

## Appendix: Test Case Traceability

| Test Case | Requirement / Change | Priority |
|-----------|---------------------|----------|
| TC-4584-01 | New widget design: compact icon + CTA | Critical |
| TC-4584-02 | Widget hidden when no locations (product context) | High |
| TC-4584-03 | Widget hidden when BOPIS globally disabled | High |
| TC-4584-04 | On-demand fetch + loading overlay on CTA click | Critical |
| TC-4584-05 | View-only modal: no Select button | Critical |
| TC-4584-06 | noIndicator prop: no radio circles | High |
| TC-4584-07 | Keyword search in product modal | High |
| TC-4584-08 | No facet filters in product context | High |
| TC-4584-09 | Map marker click + info card (view-only) | High |
| TC-4584-10 | Clean modal close + CTA still works | High |
| TC-4584-11 | Modal re-open = fresh state, no stale filters | Medium |
| TC-4584-12 | Product page modal: 50 location limit, no pagination | Medium |
| TC-4584-13 | GraphQL new fields in response | Critical |
| TC-4584-14 | Cart modal: selectable mode regression | Critical |
| TC-4584-15 | Cart modal: location selection saves correctly | Critical |
| TC-4584-16 | Cart modal: facet filters visible and functional | High |
| TC-4584-17 | Cart modal: keyword search works | High |
| TC-4584-18 | Cart modal: resetFilter new behavior | High |
| TC-4584-19 | Cart modal: pagination regression | Medium |
| TC-4584-20 | Full BOPIS E2E checkout | Critical |
| TC-4584-21 | Info card details: new GraphQL fields displayed | Critical |
| TC-4584-22 | Cart info card: Select button present | High |
| TC-4584-23 | Map pins use geoLocation data | High |
| TC-4584-24 | Network error handling on CTA click | High |
| TC-4584-25 | Empty search results state | High |
| TC-4584-26 | Double-click prevention on CTA | Medium |
| TC-4584-27 | Back/forward navigation regression | Medium |
| TC-4584-28 | VcRadioButton noIndicator=true prop | High |
| TC-4584-29 | VcRadioButton default no regression | High |
| TC-4584-30 | VcPopover max-w-full overflow fix | Medium |
| TC-4584-31 | VcRadioButton site-wide regression | Medium |
| TC-4584-32 | VCST-4613: availability tooltip in product modal | High |
| TC-4584-33 | VCST-4613: availability tooltip in cart modal | High |
| TC-4584-34 | EN locale: key renamed correctly | High |
| TC-4584-35 | DE locale: translated text correct | Medium |
| TC-4584-36 | FR + ES locale spot-check | Medium |
| TC-4584-37 | RU + JA locale spot-check | Medium |
| TC-4584-38 | Remaining 7 locales spot-check | Low |
| TC-4584-39 | Mobile 375px: widget layout + tap | High |
| TC-4584-40 | Mobile 375px: view-only modal | High |
| TC-4584-41 | Mobile 375px: cart BOPIS selectable | High |
| TC-4584-42 | Tablet 768px: widget + modal | Medium |
