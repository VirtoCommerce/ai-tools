# BUG: BOPIS Pickup Modal Loses All State (Selection, Filters, Scroll) on Reopen

## Status: FIXED

## Resolution
- **Fixed in:** Theme `vc-theme-b2b-vue-2.48.0-pr-2272-f40a-f40a2483` + Module `VirtoCommerce.XPickup 3.1001.0-pr-8-3380`
- **Sibling bug:** `BUG-BOPIS-Pickup-PreSelection-Fails-Outside-Pagination-Window.md` (root-cause pagination fix)
- **Parent JIRA:** VCST-4565 — "Show selected pick point on popup open"
- **Verified:** 2026-04-29
- **Verification method:** Re-reproduction on QA build via `/qa-bug` re-verify with qa-testing-expert (Edge, agent slot 3 — Carlos Rodriguez / BuildRight org, fresh single-item cart)
- **Fix approach:** Server-side pinning of currently-confirmed pickup location at top of list (Option C from original suggested fixes). On reopen: radio checked, info panel auto-open, map zoomed to selected coordinates, list contains the selected item even when its country is outside the default 50-item window.

## Verification Evidence (2026-04-29)

| Sub-bug | Original FAIL | Verified Status |
|---------|---------------|-----------------|
| B1 Selection lost | No radio checked, `checkedRadios: []` | **FIXED** — `checkedCount: 1`, Westend Foxpost radio checked on reopen |
| B2 Filter reset | Hungary chip cleared | **FIXED via Option C** — selected location is included regardless of filter; chip not required |
| B3 Selected not in default list | Hungary outside `first: 50` window | **FIXED** — list returns 51 items (50 default + 1 pinned selected); `containsWestend: true, containsBudapest: true` |
| B4 Scroll reset to top | scrollTop=0, item not visible | **FIXED** — Westend pinned at position 1 (`top: 278px, withinViewport: true`) |
| B5 Map zoom reset | World view | **FIXED** — Map zoomed to Budapest, info panel auto-open, marker on Westend |

## Layer Validation (2026-04-29 re-verify)

| Layer | Result | Evidence |
|-------|--------|----------|
| 1. Storefront Frontend | **PASS** | Cart shows "Váci út 1-3, Budapest, 1062, Hungary"; reopen preserves all 5 dimensions |
| 2. Backend Admin | N/A | Not exercised by this UI flow |
| 3. GraphQL xAPI | **PASS** | `addOrUpdateCartShipment` HTTP 200 (no Apollo errors); `GetCartPickupLocations` returns 51 items including pinned selected (vars unchanged: `first: 50` + `cartId`) |
| 4. Platform REST API | N/A | xAPI is the relevant data layer for cart |

**Verification screenshots:** `tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/screenshots/desktop/scroll-bug-reverify-2026-04-29-edge-carlos/`

---

## Original Report (2026-02-27)

## Summary

When a user selects a pickup location via the BOPIS "Pick points" modal using a country filter (e.g., Hungary), confirms with "Pick up here", and then reopens the modal via the pencil/edit icon, **all modal state is completely reset**: the previously selected location is not checked, the country filter is cleared, the scroll position resets to the top, and the map zooms out to world view. Critically, the selected location may not even appear in the unfiltered list, making it impossible for the user to verify or change their selection without re-applying the filter from scratch.

## Severity: High (P1)

**Justification:** This bug directly impacts the BOPIS user experience. Users who select pickup locations from filtered results (non-US countries especially) cannot verify their selection after confirming it. The modal provides no indication of what was previously selected, forcing users to re-apply filters and re-find their location. This creates confusion and erodes trust in the checkout process -- a revenue-critical flow.

## Environment

| Field | Value |
|-------|-------|
| **URL** | https://vcst-qa-storefront.govirto.com |
| **Page** | Cart page (`/cart`) |
| **Browser** | Google Chrome (Chromium via Playwright MCP) |
| **Viewport** | 1920x1080 |
| **OS** | Windows 11 Pro |
| **Store** | B2B-store |
| **User** | Logged-in B2B user (Elena Mutykova) |
| **Organization** | [Cypress]-Corporate-1 Kft. - Updated - Final |
| **Date** | 2026-02-27 |
| **Related Ticket** | VCST-4565 |

## Steps to Reproduce

### Prerequisites
- Logged in as a B2B user with items in cart
- Cart has "Pickup" delivery option available
- Multiple pickup locations configured across different countries (including Hungary with "Westend Foxpost")

### Reproduction Steps

1. Navigate to the cart page at `https://vcst-qa-storefront.govirto.com/cart`
2. Ensure "Pickup" delivery option is selected
3. Click the pencil/edit icon next to the current pickup location to open the "Pick points" modal
4. Observe the modal opens with a world map and a scrollable list of ~50 pickup locations (starting with "Barclays' Center")
5. Click the **Country** filter button to expand the country dropdown
6. Select **"Hungary 1"** from the country list
7. Observe only 1 result appears: **"Westend Foxpost"** at "HUN, Budapest, Vaci ut 1-3" with a "Hungary" chip displayed
8. Click the radio button next to **"Westend Foxpost"** to select it
9. Observe the radio becomes checked, the info panel appears with address/phone/email details, and the map zooms to Budapest
10. Click the **"Pick up here"** button to confirm the selection
11. Observe the modal closes and the cart shows the updated pickup address: "Vaci ut 1-3, Budapest, 1062, Hungary"
12. **Click the pencil/edit icon again** to reopen the "Pick points" modal
13. **Observe the bugs** (see Actual Result below)

## Expected Result

When the "Pick points" modal is reopened after a location was previously selected:

1. **Selected location should be marked**: The radio button next to "Westend Foxpost" should be checked/selected
2. **List should scroll to selected item**: The scrollable list should auto-scroll to show "Westend Foxpost" in the visible area, or the item should be pinned/highlighted at the top
3. **Filter state should persist** (or be intelligently applied): The Hungary country filter should still be active, OR the selected item should be included in the visible list regardless of filters
4. **Map should show selected location**: The map should be zoomed to Budapest/Hungary, centered on the selected pickup point
5. **User should immediately see what they previously selected** without any additional interaction

## Actual Result

When the modal is reopened, **ALL state is completely reset**:

### Bug 1: Selection State Lost
- No radio button is checked in the list
- JavaScript evaluation confirms: `checkedRadios: []` (empty array)
- The user has no visual indication of their current selection

### Bug 2: Filter State Reset
- The Hungary country filter is completely cleared
- No "Hungary" chip is displayed
- The Country button shows no badge/count
- All 50 default locations are loaded (unfiltered)

### Bug 3: Selected Location Not in Default List
- **Critical finding**: "Westend Foxpost" (Budapest, Hungary) does NOT appear in the default unfiltered list of 50 items
- JavaScript text search confirmed: `containsWestend: false, containsFoxpost: false, containsBudapest: false, containsHungary: false, containsHUN: false`
- The full location dataset has 100+ items (USA alone has 90), but only ~50 are loaded in the unfiltered view
- Without re-applying the Hungary filter, the user **cannot find their selected location at all** -- not by scrolling, not by visual scanning
- The list shows items starting with "Barclays' Center" (a US location) and ending with "Fort Tryon Park" (also US)

### Bug 4: Scroll Position Reset
- `scrollTop: 0` -- list is scrolled to the very top
- Even if the selected item were in the list, it would not be visible

### Bug 5: Map Zoom Reset
- Map displays world view instead of being zoomed to Budapest, Hungary
- No marker or highlight on the previously selected location

## Root Cause Analysis

The "Pick points" modal component appears to fully reinitialize its state on every open, rather than preserving or restoring the previously selected location context. Specifically:

1. **No state persistence**: The component does not store the selected location ID, active filters, or scroll position when closing
2. **No preselection on open**: The component does not receive or use the currently confirmed pickup location to preselect and scroll to it on open
3. **Pagination/virtualization issue**: The unfiltered list loads only ~50 of 100+ locations, and the selected location (Hungary) is not among them. The component does not ensure the selected item is included in the initial load
4. **No "selected item first" logic**: There is no mechanism to pin, highlight, or prioritize the currently selected location at the top of the list

## Impact

| Impact Area | Description |
|-------------|-------------|
| **User Confusion** | Users cannot verify which location they selected after confirming. They must re-apply filters to find their location again. |
| **Non-US Locations Disproportionately Affected** | US locations dominate the default 50-item list. Users who selected locations in Hungary, Japan, Denmark, Malaysia, etc. are completely unable to find their selection without filters. |
| **Trust Erosion** | When reopening the modal shows no selection, users may doubt whether their pickup location was actually saved, potentially leading to abandoned carts. |
| **Workflow Friction** | Users who want to verify or change their pickup location must repeat the entire filter-and-select workflow from scratch. |
| **Accessibility** | Users relying on screen readers or keyboard navigation have no way to identify the selected location in the reopened modal. |

## Screenshots

All screenshots saved to:
`tests/Sprint26-04/VCST-4565-bopis-show-selected-pickup/screenshots/desktop/scroll-bug/`

| # | File | Description |
|---|------|-------------|
| 01 | `01-modal-initial-state.png` | Modal first opened -- world map, list at top, no selection |
| 02 | `02-filtered-hungary-results.png` | Hungary filter applied -- only "Westend Foxpost" visible with chip |
| 03 | `03-hungary-location-selected.png` | Westend Foxpost selected -- radio checked, info panel with address/phone/email |
| 04 | `04-hungary-confirmed-in-cart.png` | Cart showing confirmed pickup: "Vaci ut 1-3, Budapest, 1062, Hungary" |
| 05 | `05-modal-reopened-immediate.png` | **BUG** -- Modal reopened: no selection, no filter, scroll at top, world map |
| 06 | `06-modal-reopened-second-time.png` | Second reopen confirms consistent behavior -- same reset state |

## JavaScript Evidence

### Evaluation on reopened modal:
```javascript
{
  total: 50,
  checkedRadios: [],           // NO radio button checked
  scrollTop: 0,                // Scroll at very top
  containsWestend: false,      // "Westend" not found in any item text
  containsFoxpost: false,      // "Foxpost" not found
  containsBudapest: false,     // "Budapest" not found
  containsHungary: false,      // "Hungary" not found
  containsHUN: false,          // "HUN" not found
  first5: [
    "Barclays' Center",
    "Museum of Arts and Design",
    "Queens Crossing",
    "Staten Island Children's Museum",
    "Toronto Investment and Trade Centre"
  ],
  last5: [
    "Empire State Building",
    "Essex Street Market",
    "Flatiron Building",
    "Flushing Commons",
    "Fort Tryon Park"
  ]
}
```

## Console Errors

During the entire flow, only 2 console errors were captured -- both are **unrelated** 404 errors for external product images:
- `404: https://s1.apart.pl/products/jewellery/packshot/66432/apart-226-100--0_sm.jpg`
- `404: https://s1.apart.pl/products/jewellery/packshot/14717/apart-103-416--0_sm.jpg`

138 console warnings were logged (saved to `test-results/chrome/bopis-console-warnings.log`), none directly related to the BOPIS modal state management.

**No JavaScript errors were thrown during the modal reopen flow**, meaning this is a logic/state management bug, not a crash or exception.

## Suggested Fix

### Option A: Preselect and Scroll on Open (Recommended)
1. When the modal opens, check if a pickup location is already confirmed in the cart
2. If yes, load that location's data (including its country/region)
3. Pre-apply the relevant country filter so the location appears in the filtered list
4. Mark the radio button as checked
5. Scroll the list to center the selected item in the visible area
6. Zoom the map to the selected location's coordinates

### Option B: Persist Modal State
1. When closing the modal (after "Pick up here"), store the filter state, scroll position, and selected item ID
2. On reopen, restore all stored state
3. Ensure the selected item is always included in the loaded list

### Option C: Hybrid -- Always Include Selected Item
1. On modal open, always inject the currently selected location into the list (regardless of filters)
2. Pin it at the top with a "Currently selected" label/badge
3. Allow filters to work normally for all other items
4. Auto-scroll to the pinned item

## Reproduction Rate

**100%** -- Reproduced consistently across multiple reopen cycles.

## Additional Context

- The unfiltered list loads approximately 50 items out of 100+ total locations (USA alone has 90 configured locations)
- Items appear to be loaded alphabetically or by some default sort, heavily weighted toward US locations
- Non-US locations (Hungary, Japan, Denmark, etc.) only appear when their respective country filter is applied
- The scrollable container has dimensions: `scrollHeight: 4978px, clientHeight: 634px` (approximately 8 screens worth of content)
- The container uses CSS class `vc-scrollbar select-address-map-list select-address-map-desktop__list`

## Related Issues

- VCST-4565 (parent ticket: BOPIS show selected pickup)
- BUG-VCST-4704-BOPIS-Focus-Management-Modal (related focus management issue)
- BUG-WCAG-243-BOPIS-Pickup-Modal-Focus-Not-Trapped-On-Open (accessibility concern)

---

**Reported by:** qa-frontend-expert
**Date:** 2026-02-27
**Testing tool:** Playwright Chrome MCP (1920x1080)
