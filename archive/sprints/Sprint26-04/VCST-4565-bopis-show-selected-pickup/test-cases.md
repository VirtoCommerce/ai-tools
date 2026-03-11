# Test Cases: VCST-4565
# [BOPIS][Desktop] Show Selected Pick Point on Pick Point Popup Window Reopen

**Ticket:** [VCST-4565](https://virtocommerce.atlassian.net/browse/VCST-4565)
**PR:** VirtoCommerce/vc-frontend#2188
**Sprint:** Sprint 26-04
**Date:** 2026-02-27
**Executor:** qa-frontend-expert
**Browser:** Chrome via playwright-chrome — Desktop 1920x1080

---

## Global Preconditions (apply to all test cases unless overridden)

1. PR #2188 is deployed to QA environment (`${FRONT_URL}` = https://vcst-qa-storefront.govirto.com)
2. Signed in as `qa-user-04@virtocommerce.com` / `Test123!`
3. Browser viewport is **1920x1080**
4. Chrome DevTools is open on the **Console** tab to monitor for JS errors
5. A BOPIS-eligible product is available in the QA catalog (e.g., any product from the Bolts category)
6. Pickup locations are configured for B2B-store (verified from prior sprint testing)
7. Cart is cleared at the start of each test case unless stated otherwise

### Standard Setup Sequence (reference as "Standard Setup" in test steps)

1. Navigate to `${FRONT_URL}/catalog`
2. Find and open any BOPIS-eligible product (e.g., from Bolts category)
3. Click "Add to Cart" — verify success toast appears
4. Navigate to `${FRONT_URL}/cart`
5. Locate the SHIPPING DETAILS section
6. Click the "Pickup" option (radio button or tab) to activate pickup delivery method
7. Verify the Pickup section shows a "Select pickup location" prompt or an address field

### Standard Confirm-Location Sequence (reference as "Confirm Location X" in test steps)

1. In the SHIPPING DETAILS section, click the pencil/edit icon next to the pickup address field (or click "Select pickup location" if no location confirmed yet)
2. Verify the pickup location popup/modal opens
3. In the location list (left panel), click on the target location entry (e.g., "Downtown Store")
4. Verify the Location Info Card opens showing the location details
5. Click the "Select" button in the Location Info Card
6. Verify the Location Info Card and the modal both close
7. Verify the confirmed location name appears in the SHIPPING DETAILS section on the cart page

---

## P0 — Critical Path Test Cases

---

### TC-4565-001 — Modal Opens Without Error on Reopen (Regression from VCST-4618)

| Field | Value |
|-------|-------|
| **ID** | TC-4565-001 |
| **Title** | Modal opens without error when reopened after initial location confirmation |
| **Priority** | P0 — Critical |
| **Type** | Regression |
| **Estimate** | 8 min |
| **Section** | BOPIS > Cart Modal > Reopen Regression |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565, VCST-4618 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed — product in cart, Pickup method selected
3. One pickup location has already been confirmed using Standard Confirm-Location Sequence (e.g., "Downtown Store")

**Test Data:**

| Data | Value |
|------|-------|
| User | qa-user-04@virtocommerce.com / Test123! |
| Product | Any BOPIS-eligible product (Bolts category) |
| Pickup location to confirm | BOPIS-LOC-001 — "Downtown Store", 123 Main Street, Los Angeles, CA |

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Confirm "Downtown Store" as the pickup location using Standard Confirm-Location Sequence | Modal closes; "Downtown Store" or "123 Main Street, Los Angeles, CA" is shown in SHIPPING DETAILS section |
| 2 | Observe the cart page — note the confirmed location name displayed | Cart shows confirmed location name without any error toast |
| 3 | Click the pencil/edit icon next to the confirmed pickup address in SHIPPING DETAILS | Pickup location popup begins to open |
| 4 | Wait up to 5 seconds for the modal to load | Modal is fully open — map rendered on the right, location list on the left |
| 5 | Check the browser Console tab | Zero JavaScript errors logged; no "Something went wrong" messages |
| 6 | Observe any toast notifications on the cart page | No red/error toast notification appears |
| 7 | Verify the modal contains the location list with at least one entry | Location list populates with pickup location entries |
| 8 | Verify the map renders with visible markers | Map shows location markers (not a blank grey box) |
| 9 | Close the modal by clicking the X button | Modal closes cleanly; cart page state is unchanged |

**Pass Criteria:**
- Modal opens on reopen without any error toast
- Console contains no uncaught errors related to pickup locations
- Map and list both render on reopen

**Fail Criteria:**
- Error toast ("Something went wrong" or similar) appears when reopening the modal
- Modal fails to open or shows a blank/broken state
- Console contains errors referencing `cartPickupLocations` or pickup location data

**Screenshots:**
- `screenshots/desktop/TC-4565-001-confirmed-location-in-cart.png` — confirmed location shown in cart
- `screenshots/desktop/TC-4565-001-modal-reopened.png` — modal open on second open

---

### TC-4565-002 — Pre-selected Location is Visually Highlighted in the List on Reopen

| Field | Value |
|-------|-------|
| **ID** | TC-4565-002 |
| **Title** | Previously confirmed pickup location is visually highlighted in the list when modal is reopened |
| **Priority** | P0 — Critical |
| **Type** | Feature Verification |
| **Estimate** | 10 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > List Highlight |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed
3. "Downtown Store" has been confirmed as the pickup location

**Test Data:**

| Data | Value |
|------|-------|
| Confirmed pickup location | BOPIS-LOC-001 — "Downtown Store", 123 Main Street, Los Angeles, CA |
| Expected visual state | Location row is highlighted with a distinct background color, border, or checked radio indicator — different from unselected rows |

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Confirm "Downtown Store" using Standard Confirm-Location Sequence | Cart SHIPPING DETAILS shows "Downtown Store" or its address |
| 2 | Click the pencil/edit icon next to the confirmed location address | Pickup location modal opens |
| 3 | Examine the location list in the left panel | The list is visible and populated with location entries |
| 4 | Locate the "Downtown Store" row in the location list | "Downtown Store" row is visible in the list |
| 5 | Compare the visual appearance of the "Downtown Store" row against other rows (e.g., "Westside Mall") | "Downtown Store" row has a visually distinct state: highlighted background (e.g., blue/primary color), a checked radio button indicator, or a border/outline that other rows do not have |
| 6 | Take a screenshot capturing at least two rows — the highlighted selected row and one unselected row | Screenshot saved as evidence |
| 7 | Use `browser_snapshot` to capture the accessibility tree for the selected location row | The selected row's accessible state includes `checked: true` or `aria-selected: true` or equivalent ARIA attribute |
| 8 | Click on a different location row (e.g., "Westside Mall") to verify unselected appearance is distinct | "Westside Mall" row switches to the highlighted/selected visual; "Downtown Store" row returns to default/unselected visual |

**Pass Criteria:**
- Confirmed location row is visually distinct from unselected rows when modal reopens
- The visual distinction is present immediately on modal open (not after user interaction)
- Accessible state of the selected row reflects selection (ARIA attribute or role)

**Fail Criteria:**
- All rows appear identically — no visual distinction for the previously confirmed location
- The highlight only appears after user interaction, not on modal reopen
- The wrong location row is highlighted

**Screenshots:**
- `screenshots/desktop/TC-4565-002-list-highlight-on-reopen.png` — full list showing confirmed location highlighted

---

### TC-4565-003 — Map Marker is Highlighted for the Confirmed Location on Reopen

| Field | Value |
|-------|-------|
| **ID** | TC-4565-003 |
| **Title** | Map marker for the confirmed pickup location is visually distinct from other markers when modal is reopened |
| **Priority** | P0 — Critical |
| **Type** | Feature Verification |
| **Estimate** | 10 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > Map Marker |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed
3. "Downtown Store" confirmed as the pickup location
4. At least two pickup location markers are visible on the map simultaneously

**Test Data:**

| Data | Value |
|------|-------|
| Confirmed location | BOPIS-LOC-001 — "Downtown Store" (lat: 34.0522, lng: -118.2437, Los Angeles, CA) |
| Nearby location for comparison | BOPIS-LOC-021 — "Nearby Location" (lat: 34.0521, lng: -118.2438) — 0.1 miles away |
| Expected marker state | Confirmed location marker is a different color, size, or icon compared to other markers |

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Confirm "Downtown Store" using Standard Confirm-Location Sequence | Cart shows "Downtown Store" in SHIPPING DETAILS |
| 2 | Click the pencil/edit icon to reopen the modal | Modal opens |
| 3 | Wait for the map to fully render — verify markers appear on the map | Map shows multiple markers in the Los Angeles area |
| 4 | Locate the marker corresponding to "Downtown Store" on the map | Marker at approximately lat 34.0522, lng -118.2437 is visible |
| 5 | Compare the visual appearance of the "Downtown Store" marker against nearby unselected markers | The "Downtown Store" marker has a visually distinct color (e.g., filled/active color vs. default gray), a different size (larger), or a different icon shape compared to other markers |
| 6 | Take a screenshot of the map section showing the highlighted marker and at least one other unselected marker | Screenshot saved for evidence |
| 7 | Click on a different marker on the map (not "Downtown Store") | The newly clicked marker becomes highlighted/active; the "Downtown Store" marker may revert to default depending on implementation |
| 8 | Click the X to close the modal without confirming | Modal closes; cart state unchanged |

**Pass Criteria:**
- Map marker for the confirmed location is visually distinct from unselected markers on modal reopen
- The highlighted marker state is present immediately on modal open without requiring user interaction
- At least one visual difference is observable (color, size, or icon)

**Fail Criteria:**
- All markers appear identical — no highlighted marker visible for the confirmed location
- Map does not render or shows blank on reopen
- The highlighted marker is at the wrong location

**Screenshots:**
- `screenshots/desktop/TC-4565-003-map-marker-highlighted.png` — map showing confirmed location marker highlighted vs. others

---

### TC-4565-004 — List Auto-Scrolls to Bring Pre-selected Item into View

| Field | Value |
|-------|-------|
| **ID** | TC-4565-004 |
| **Title** | Location list auto-scrolls to make the pre-selected location visible when modal reopens |
| **Priority** | P1 — High |
| **Type** | Feature Verification |
| **Estimate** | 12 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > Scroll Behavior |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed
3. A pickup location that appears **below the fold** of the initial list view is confirmed as the selection
4. The list must have enough entries that the selected location is not visible at the default scroll position (top of list)

**Test Data:**

| Data | Value |
|------|-------|
| Pickup location to confirm | BOPIS-LOC-050 — "Filter Test - Small Store", 500 Small Location Ln, Los Angeles, CA 90005 — positioned near the bottom of the location list |
| Alternative if LOC-050 is near top | Use any location that appears in the lower half of the visible list when scrolled to top |
| Fallback note | If all locations fit in the visible list without scrolling at 1920x1080, document this in the test result and mark TC as N/A with explanation |

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Open the pickup modal for the first time (no previous selection) | Modal opens; list is at default scroll position showing top of the list |
| 2 | Manually scroll the location list downward to verify "Filter Test - Small Store" is not visible at the top | Location is confirmed to be below the initial viewport of the list |
| 3 | Scroll back to the top of the list | List returns to showing topmost entries |
| 4 | Click "Filter Test - Small Store" in the list | Location Info Card opens |
| 5 | Click "Select" in the Location Info Card | Card and modal close; "Filter Test - Small Store" appears in cart SHIPPING DETAILS |
| 6 | Click the pencil/edit icon to reopen the modal | Modal begins to open |
| 7 | Observe the initial scroll position of the location list when the modal finishes loading | The list is NOT at the top — it has scrolled so that "Filter Test - Small Store" is visible within the viewport of the list panel |
| 8 | Verify that "Filter Test - Small Store" is visible in the list without any manual scrolling | The pre-selected location is in view on modal reopen |
| 9 | Take a screenshot of the list panel showing the auto-scroll position | Screenshot saved |
| 10 | Verify the scroll position shows the highlighted entry with context (some items above or below it are visible) | List shows selected item in context, not necessarily at the very top of the list |

**Pass Criteria:**
- On modal reopen, the pre-selected location is visible in the list without the user manually scrolling
- The auto-scroll places the selected item within the visible area of the list panel
- Behavior is consistent across two reopen attempts

**Fail Criteria:**
- List always opens at the top regardless of which location was confirmed
- Pre-selected location is not visible until user manually scrolls down
- List auto-scrolls to wrong location

**Note:** If the location list at 1920x1080 is tall enough to show all available pickup locations without scrolling, this test case must be marked N/A and documented with a screenshot showing all locations visible simultaneously.

**Screenshots:**
- `screenshots/desktop/TC-4565-004-auto-scroll-position.png` — list showing auto-scrolled position with selected item in view

---

### TC-4565-005 — No Pre-selection When No Location Has Been Confirmed (Clean State)

| Field | Value |
|-------|-------|
| **ID** | TC-4565-005 |
| **Title** | Pickup modal opens with no pre-selection when user has not yet confirmed a pickup location |
| **Priority** | P0 — Critical |
| **Type** | Feature Verification (negative state) |
| **Estimate** | 8 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > Empty State |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed — product in cart, Pickup method selected
3. No pickup location has been confirmed yet (user has NOT used Standard Confirm-Location Sequence)

**Test Data:**

| Data | Value |
|------|-------|
| Cart state | Product in cart, Pickup method selected, no confirmed location |
| Expected modal state | All location rows appear with identical/default visual styling — no row is pre-highlighted |

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Complete Standard Setup (product in cart, Pickup selected) but do NOT confirm any location | Cart SHIPPING DETAILS shows "Select pickup location" prompt or empty address field — no location name shown |
| 2 | Click "Select pickup location" or the pencil icon next to the empty pickup address | Pickup location modal opens |
| 3 | Examine the location list in the left panel | List is populated with location entries; all rows are visible |
| 4 | Verify the visual appearance of each visible location row | All rows appear with identical, default visual styling — no row has a highlighted background, checked radio indicator, or active border |
| 5 | Use `browser_snapshot` to inspect the accessible state of location rows | No row has `checked: true`, `aria-selected: true`, or equivalent indicating pre-selection |
| 6 | Take a screenshot of the full list panel | Screenshot shows all rows with uniform, unselected appearance |
| 7 | Examine the map | Map shows all markers in their default/unselected state — no marker is visually distinct |
| 8 | Close the modal by clicking the X button | Modal closes; cart still shows no confirmed location |

**Pass Criteria:**
- All list rows have identical default visual appearance (no pre-selection)
- No map marker is highlighted
- Console shows no errors
- The absence of selection is the correct/expected behavior for a clean state

**Fail Criteria:**
- Any location row appears highlighted without user interaction or prior confirmation
- A map marker appears highlighted even though no location was confirmed

**Screenshots:**
- `screenshots/desktop/TC-4565-005-clean-state-no-preselection.png` — list showing all rows in default unselected state

---

## P0 — Additional Critical Path

### TC-4565-007 — Cancel / Close Modal Preserves Original Confirmed Location

| Field | Value |
|-------|-------|
| **ID** | TC-4565-007 |
| **Title** | Closing or cancelling the modal without confirming does not change the previously confirmed pickup location |
| **Priority** | P0 — Critical |
| **Type** | Feature Verification |
| **Estimate** | 10 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > Cancel Behavior |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565, BOPIS-015 (Suite 05) |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed
3. "Downtown Store" confirmed as the pickup location (Standard Confirm-Location Sequence executed)

**Test Data:**

| Data | Value |
|------|-------|
| Originally confirmed location | BOPIS-LOC-001 — "Downtown Store", 123 Main Street, Los Angeles, CA |
| Location browsed in modal (but NOT confirmed) | BOPIS-LOC-002 — "Westside Mall", 456 Shopping Center Dr, Los Angeles, CA |

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Confirm "Downtown Store" using Standard Confirm-Location Sequence | Cart shows "Downtown Store" in SHIPPING DETAILS |
| 2 | Note the exact text shown in SHIPPING DETAILS for the confirmed location | Text recorded (e.g., "Downtown Store" or "123 Main Street, Los Angeles, CA 90012") |
| 3 | Click the pencil/edit icon to reopen the modal | Modal opens; "Downtown Store" row is highlighted (pre-selection) |
| 4 | Click on "Westside Mall" in the location list | Location Info Card opens for "Westside Mall" |
| 5 | Click "Cancel" in the Location Info Card | Info Card closes; returns to the location list within the modal |
| 6 | Verify the list state | "Downtown Store" row is still highlighted; "Westside Mall" is NOT selected |
| 7 | Click the X (close) button on the main modal | Modal closes entirely |
| 8 | Observe the SHIPPING DETAILS section in the cart | The confirmed location shown is still "Downtown Store" (unchanged from step 2) |
| 9 | Check the browser Console | No errors logged during cancel and close sequence |
| 10 | Reopen the modal one more time by clicking the pencil icon | Modal opens; "Downtown Store" row is again pre-highlighted (pre-selection state persisted) |

**Pass Criteria:**
- Cart shows "Downtown Store" after cancelling exploration of "Westside Mall"
- Pre-selection state is not cleared by cancel/close
- Second reopen continues to show correct pre-selection

**Fail Criteria:**
- Cart shows "Westside Mall" or an empty address after clicking Cancel and closing
- Pre-selection is lost after cancel/close (modal reopens without highlighting on third open)
- Error appears during cancel/close sequence

**Screenshots:**
- `screenshots/desktop/TC-4565-007-cancel-preserves-selection.png` — cart page after cancel showing original confirmed location unchanged

---

## P1 — High Priority Test Cases

---

### TC-4565-006 — Changing Selection from a Pre-selected State

| Field | Value |
|-------|-------|
| **ID** | TC-4565-006 |
| **Title** | User can select a different location when reopening a pre-selected modal; new location becomes confirmed |
| **Priority** | P1 — High |
| **Type** | Feature Verification |
| **Estimate** | 12 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > Selection Change |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed
3. "Downtown Store" confirmed as the initial pickup location

**Test Data:**

| Data | Value |
|------|-------|
| Initial confirmed location | BOPIS-LOC-001 — "Downtown Store", 123 Main Street, Los Angeles, CA |
| New location to select | BOPIS-LOC-002 — "Westside Mall", 456 Shopping Center Dr, Los Angeles, CA 90025 |

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Confirm "Downtown Store" using Standard Confirm-Location Sequence | Cart shows "Downtown Store" in SHIPPING DETAILS |
| 2 | Click the pencil/edit icon to reopen the modal | Modal opens; "Downtown Store" row is highlighted in the list |
| 3 | Click on "Westside Mall" in the location list | Location Info Card for "Westside Mall" opens; map pans to Westside Mall marker |
| 4 | Verify "Westside Mall" info card shows correct name, address (456 Shopping Center Dr, Los Angeles, CA 90025) | Info card content matches the location data |
| 5 | Verify the "Select" button is present in the Location Info Card | "Select" button is visible and clickable |
| 6 | Click the "Select" button | Location Info Card closes; modal closes |
| 7 | Observe SHIPPING DETAILS on the cart page | Now shows "Westside Mall" (or its address) — not "Downtown Store" |
| 8 | Click the pencil/edit icon to reopen the modal a second time | Modal opens |
| 9 | Verify the location list | "Westside Mall" row is now the highlighted/pre-selected row; "Downtown Store" row is in default/unselected state |
| 10 | Take a screenshot of the list showing "Westside Mall" pre-selected | Screenshot saved |
| 11 | Close the modal by clicking X | Modal closes cleanly |

**Pass Criteria:**
- New location ("Westside Mall") is shown in cart SHIPPING DETAILS after confirming
- On third modal open, "Westside Mall" is pre-selected (not "Downtown Store")
- Original location ("Downtown Store") is no longer highlighted

**Fail Criteria:**
- Cart still shows "Downtown Store" after confirming "Westside Mall"
- Both locations appear highlighted simultaneously
- Pre-selection does not update to reflect the new confirmed location

**Screenshots:**
- `screenshots/desktop/TC-4565-006-new-location-preselected.png` — list showing Westside Mall pre-selected after selection change

---

### TC-4565-008 — Delivery Method Switch Clears Pickup Selection; Modal Reopens in Clean State

| Field | Value |
|-------|-------|
| **ID** | TC-4565-008 |
| **Title** | Switching from Pickup to Delivery and back results in no pre-selection when the modal is reopened |
| **Priority** | P1 — High |
| **Type** | Feature Verification / Regression |
| **Estimate** | 12 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > Delivery Method Switch |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565, BOPIS-027 (Suite 05) |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed
3. "Downtown Store" confirmed as the pickup location

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Confirm "Downtown Store" using Standard Confirm-Location Sequence | Cart shows "Downtown Store" in SHIPPING DETAILS |
| 2 | In SHIPPING DETAILS, click the "Delivery" option (radio button or tab) to switch delivery method | Delivery method changes to Delivery (shipping); pickup location section disappears or is hidden |
| 3 | Verify the pickup location field is cleared or hidden | No pickup location name shown; delivery address fields appear |
| 4 | Click the "Pickup" option to switch back to Pickup delivery method | Pickup section returns |
| 5 | Verify the pickup address field | Field shows "Select pickup location" or is empty — "Downtown Store" is NOT pre-filled from the previous selection |
| 6 | Click "Select pickup location" or the pencil icon to open the modal | Pickup location modal opens |
| 7 | Examine the location list | All rows appear with default/unselected styling — no row is pre-highlighted |
| 8 | Examine the map | No map marker is highlighted |
| 9 | Use `browser_snapshot` to verify no ARIA selection state on any row | No row has `checked: true` or `aria-selected: true` |
| 10 | Take a screenshot of the list in clean state | Screenshot saved |
| 11 | Close the modal without selecting | Modal closes; cart shows empty pickup address |

**Pass Criteria:**
- After Pickup → Delivery → Pickup sequence, no location is pre-selected in the modal
- Modal behaves identically to TC-4565-005 (clean/empty state)
- Switching delivery methods does not cause errors

**Fail Criteria:**
- "Downtown Store" is still pre-selected in the modal after Pickup → Delivery → Pickup cycle
- Error appears during delivery method switching
- Modal fails to open after switching back to Pickup

**Screenshots:**
- `screenshots/desktop/TC-4565-008-clean-state-after-delivery-switch.png` — list in clean state after delivery method switch

---

### TC-4565-009 — Country / State / City Facet Filters Functional (Regression)

| Field | Value |
|-------|-------|
| **ID** | TC-4565-009 |
| **Title** | Country, State, and City facet filters work correctly in the pickup modal after PR #2188 changes |
| **Priority** | P1 — High |
| **Type** | Regression |
| **Estimate** | 15 min |
| **Section** | BOPIS > Cart Modal > Filters > Regression |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565, BOPIS-019 (Suite 05), BOPIS-020 (Suite 05), VCST-3865 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed — product in cart, Pickup selected
3. Pickup locations in multiple countries, states, and cities are available in QA data
4. At least one location confirmed (any location) to ensure modal opens with pre-selection state active

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Confirm any pickup location using Standard Confirm-Location Sequence | Cart shows confirmed location name |
| 2 | Click the pencil icon to reopen the modal | Modal opens with pre-selection state; location list and filters visible |
| 3 | Locate the Country (address_countryname) filter section in the modal | Country filter section is visible with available country options listed |
| 4 | Click on "United States" in the Country filter | Location list updates to show only locations in United States; count shown next to filter reflects filtered results |
| 5 | Verify the map updates to show only matching markers | Map markers reduced to United States locations |
| 6 | Verify the pre-selected location (if it matches United States) remains highlighted | Selected location row retains its highlight if it is within the filtered results |
| 7 | Click "United States" again to deselect the Country filter | All locations restore; list and map return to full result set |
| 8 | Locate the State/Region (address_regionname) filter section | State filter section is visible |
| 9 | Click on "California" (or the primary state with most test locations) | Location list updates to show only California locations |
| 10 | Clear the State filter | Full list restored |
| 11 | Locate the City (address_city) filter section | City filter section is visible |
| 12 | Click on "Los Angeles" in the City filter | Location list shows only Los Angeles locations |
| 13 | Clear the City filter | Full list restored |
| 14 | Simultaneously apply State: California AND City: Los Angeles | List shows locations matching both criteria (AND logic) |
| 15 | Click "Clear All" or individually clear each filter | All locations restored |

**Pass Criteria:**
- All three filter types (Country, State, City) are visible and functional
- Applying each filter correctly reduces the location list
- Map updates in sync with list on each filter change
- Clearing filters restores the full list
- Pre-selection highlight persists correctly when the selected location matches filter criteria
- No errors in Console during filter interactions

**Fail Criteria:**
- Any filter is absent from the modal after PR #2188 deployment
- Applying a filter does not update the list or map
- Filter counts are incorrect
- Pre-selection highlight is lost when filter is applied or removed

**Screenshots:**
- `screenshots/desktop/TC-4565-009-country-filter-applied.png` — list showing country filter active
- `screenshots/desktop/TC-4565-009-city-filter-applied.png` — list showing city filter active

---

### TC-4565-010 — Radio Button Indicator Present in Cart Modal (Regression from VCST-4584)

| Field | Value |
|-------|-------|
| **ID** | TC-4565-010 |
| **Title** | Cart BOPIS modal shows radio button indicators in location list (contrast: product page modal uses noIndicator) |
| **Priority** | P1 — High |
| **Type** | Regression |
| **Estimate** | 8 min |
| **Section** | BOPIS > Cart Modal > Regression > Radio Indicator |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565, VCST-4584, BOPIS-032 (Suite 05), BOPIS-034 (Suite 05) |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed — product in cart, Pickup selected
3. Any pickup location previously confirmed

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Click the pencil icon to open the BOPIS modal from the cart | Modal opens |
| 2 | Examine the location list entries for visual radio button elements | Each location row shows a circular radio button indicator (filled circle for selected, empty circle for unselected) |
| 3 | Verify the pre-selected location row shows a filled/checked radio indicator | The confirmed location row's radio button appears in a selected/active state (filled or checked) |
| 4 | Verify unselected rows show an empty/unchecked radio indicator | Other rows show radio buttons in unchecked/empty state |
| 5 | Take a screenshot showing radio buttons in both states | Screenshot saved |
| 6 | Use `browser_snapshot` to verify radio input elements exist in the DOM | Radio input elements (`role="radio"`) are present in the location list |
| 7 | Navigate to a product detail page that has BOPIS widget (for contrast) | Product page opens |
| 8 | Open the product page BOPIS view-only modal | View-only modal opens |
| 9 | Examine the location list in the product page modal | Radio button circles are NOT visible (noIndicator behavior) — highlighting uses a different visual treatment |
| 10 | Close the product page modal and return to cart | Cart page visible |

**Pass Criteria:**
- Cart BOPIS modal shows standard radio button indicators
- Product page BOPIS modal does NOT show radio button circles (noIndicator behavior preserved)
- PR #2188 did not accidentally remove radio indicators from the cart modal
- PR #2188 did not accidentally add radio indicators to the product page modal

**Fail Criteria:**
- Cart modal location list has no radio buttons (radio indicators removed by PR #2188)
- Product page modal shows radio button circles (noIndicator regression)

**Screenshots:**
- `screenshots/desktop/TC-4565-010-cart-modal-radio-indicators.png` — cart modal list with radio indicators visible
- `screenshots/desktop/TC-4565-010-product-modal-no-indicators.png` — product page modal list without radio indicators

---

## P2 — Edge Case Test Cases

---

### TC-4565-011 — Pre-selection Persists After Applying and Removing a Facet Filter

| Field | Value |
|-------|-------|
| **ID** | TC-4565-011 |
| **Title** | Pre-selected location remains highlighted in the list after applying a filter that includes it and after removing the filter |
| **Priority** | P2 — Medium |
| **Type** | Edge Case |
| **Estimate** | 10 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > Filter Interaction |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed
3. "Downtown Store" confirmed (Los Angeles, CA, United States)

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Reopen modal after confirming "Downtown Store" | Modal opens; "Downtown Store" is pre-highlighted |
| 2 | Apply the City filter: "Los Angeles" | List narrows to Los Angeles locations; "Downtown Store" is still visible (it IS in Los Angeles) |
| 3 | Verify "Downtown Store" row retains its highlight within the filtered list | Selected location remains highlighted even after filter is applied |
| 4 | Remove the City filter | Full list restores |
| 5 | Verify "Downtown Store" row is still highlighted in the full list | Pre-selection state persisted through filter apply/remove cycle |
| 6 | Apply the City filter: "New York" (if available) | List narrows to New York locations; "Downtown Store" is NOT in the list (it's in LA) |
| 7 | Verify the list shows New York locations without any highlighted row | No row is highlighted (selected location is filtered out of view) |
| 8 | Remove the City filter | Full list restores with "Downtown Store" highlighted again |

**Pass Criteria:**
- Pre-selection highlight is maintained when the selected location is in the filtered results
- When the selected location is filtered out, no spurious highlight appears on other rows
- Pre-selection highlight is correctly restored when filter is removed

**Fail Criteria:**
- Pre-selection is lost after applying a filter (even when the selected location is in results)
- A different row becomes highlighted when selected location is filtered out
- Highlight does not restore after filter removal

---

### TC-4565-012 — Pre-selection Persists After Using the Keyword Search Field

| Field | Value |
|-------|-------|
| **ID** | TC-4565-012 |
| **Title** | Pre-selected location highlight is maintained through keyword search interactions in the modal |
| **Priority** | P2 — Medium |
| **Type** | Edge Case |
| **Estimate** | 10 min |
| **Section** | BOPIS > Cart Modal > Pre-selection > Search Interaction |
| **Assignee** | qa-frontend-expert |
| **References** | VCST-4565 |

**Preconditions:**
1. Global preconditions apply
2. Standard Setup completed
3. "Downtown Store" confirmed (Los Angeles, CA)

**Steps:**

| # | Action | Expected Result |
|---|--------|-----------------|
| 1 | Reopen modal after confirming "Downtown Store" | Modal opens; "Downtown Store" is pre-highlighted in the list |
| 2 | Locate the keyword search field in the modal | Search field is visible (text input for location name or address search) |
| 3 | Type "Downtown" in the search field | List filters to show locations matching "Downtown" — "Downtown Store" appears in filtered results |
| 4 | Verify "Downtown Store" retains its highlight in the filtered search results | Highlighted row is still highlighted after search |
| 5 | Clear the search field (click X or backspace all characters) | Full list restores |
| 6 | Verify "Downtown Store" is still highlighted in the full list | Pre-selection state persisted through search-and-clear cycle |
| 7 | Type "Westside" in the search field | List filters to show "Westside Mall"; "Downtown Store" is NOT in results |
| 8 | Verify no row is highlighted in the "Westside"-filtered results | No spurious highlight on "Westside Mall" or any other row |
| 9 | Clear the search field | Full list restores |
| 10 | Verify "Downtown Store" is highlighted again | Pre-selection restored after search cleared |

**Pass Criteria:**
- Pre-selection highlight maintained when selected location appears in search results
- No spurious highlight when selected location is not in search results
- Pre-selection restored when search is cleared
- Search itself functions correctly (list filters on input, restores on clear)

**Fail Criteria:**
- Pre-selection lost after searching
- Pre-selection highlight appears on wrong row ("Westside Mall") when that's not the confirmed location

---

## Test Case Summary Table

| ID | Title | Priority | Type | Estimate | BOPIS-Suite Cross-Ref |
|----|-------|----------|------|----------|-----------------------|
| TC-4565-001 | Modal opens without error on reopen | P0 | Regression | 8 min | BOPIS-002 (extends) |
| TC-4565-002 | Pre-selected location highlighted in list | P0 | Feature | 10 min | BOPIS-002 (new layer) |
| TC-4565-003 | Map marker highlighted for confirmed location | P0 | Feature | 10 min | BOPIS-002 (new layer) |
| TC-4565-004 | List auto-scrolls to pre-selected item | P1 | Feature | 12 min | BOPIS-017 (extends) |
| TC-4565-005 | No pre-selection in clean/empty state | P0 | Feature | 8 min | New scenario |
| TC-4565-006 | Changing selection from pre-selected state | P1 | Feature | 12 min | BOPIS-016 (extends) |
| TC-4565-007 | Cancel preserves original confirmed location | P0 | Feature | 10 min | BOPIS-015 (extends) |
| TC-4565-008 | Delivery switch clears selection; reopen is clean | P1 | Feature / Regression | 12 min | BOPIS-027 (extends) |
| TC-4565-009 | Facet filters (Country/State/City) functional | P1 | Regression | 15 min | BOPIS-019, BOPIS-020 |
| TC-4565-010 | Radio indicator present in cart modal | P1 | Regression | 8 min | BOPIS-032, BOPIS-034 |
| TC-4565-011 | Pre-selection persists through filter apply/remove | P2 | Edge Case | 10 min | New scenario |
| TC-4565-012 | Pre-selection persists through keyword search | P2 | Edge Case | 10 min | New scenario |

**Total: 12 test cases**
- P0 Critical: 5 (TC-001, TC-002, TC-003, TC-005, TC-007)
- P1 High: 5 (TC-004, TC-006, TC-008, TC-009, TC-010)
- P2 Medium: 2 (TC-011, TC-012)

**Total estimated execution time:** ~2 hours 15 minutes (single executor)

---

## Requirements Traceability Matrix

| Requirement | Source | Test Cases | Coverage |
|-------------|--------|------------|----------|
| Previously confirmed location is visually highlighted in the list on modal reopen | VCST-4565 AC | TC-4565-002 | 100% |
| Map marker is highlighted for the confirmed location on modal reopen | VCST-4565 AC | TC-4565-003 | 100% |
| List auto-scrolls to bring pre-selected item into view | VCST-4565 AC | TC-4565-004 | 100% |
| No pre-selection in neutral/empty state (no confirmed location) | VCST-4565 AC | TC-4565-005 | 100% |
| Changing selection from pre-selected state works correctly | VCST-4565 AC | TC-4565-006 | 100% |
| Cancel/close modal preserves original confirmed selection | VCST-4565 AC | TC-4565-007 | 100% |
| Delivery method switch clears pickup; reopen has no pre-selection | VCST-4565 AC | TC-4565-008 | 100% |
| Modal opens without error on reopen (VCST-4618 regression guard) | VCST-4618 fix | TC-4565-001 | 100% |
| Facet filters continue to work after PR #2188 | Regression | TC-4565-009 | 100% |
| Radio button indicator behavior unchanged (VCST-4584 regression guard) | VCST-4584 fix | TC-4565-010 | 100% |
| Pre-selection state stable through filter interactions | Edge case | TC-4565-011 | 100% |
| Pre-selection state stable through search interactions | Edge case | TC-4565-012 | 100% |

**Coverage: 12/12 requirements (100%)**
